import { createRoute, z } from '@hono/zod-openapi'
import { coarseFine, MAX_16 } from '@stagehand/shared'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../db'
import { fixtures, targetPositions, targets } from '../db/schema'
import { dmxOutput } from '../dmx'
import { identify } from '../identify'
import { createRouter } from '../lib/router'
import { errorResponse, jsonResponse as json } from '../lib/schemas'
import { broadcast } from '../ws'
import { findRoom, RoomParams } from './rooms'

const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lower-case letters, digits and single dashes')
  .max(40)
  .openapi({ example: 'dj-booth' })

const Value16 = z
  .number()
  .int()
  .min(0)
  .max(MAX_16)
  .openapi({ description: '16-bit DMX value: coarse × 256 + fine' })

const PositionSchema = z
  .object({ fixtureId: z.number().int(), pan: Value16, tilt: Value16 })
  .openapi('TargetPosition')

const TargetSchema = z
  .object({
    id: z.number().int(),
    roomId: z.number().int(),
    name: z.string().openapi({ example: 'DJ booth' }),
    slug: SlugSchema,
    positions: z.array(PositionSchema),
  })
  .openapi('Target')

const NameSchema = z.string().trim().min(1).max(100).openapi({ example: 'DJ booth' })

const TargetCreateSchema = z
  .object({
    name: NameSchema,
    slug: SlugSchema.optional().openapi({ description: 'Made from the name when omitted' }),
  })
  .openapi('TargetCreate')

const TargetUpdateSchema = z
  .object({ name: NameSchema, slug: SlugSchema })
  .partial()
  .openapi('TargetUpdate')

const TargetParams = RoomParams.extend({
  targetId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'targetId', in: 'path' }, example: 1 }),
})

const PositionParams = TargetParams.extend({
  fixtureId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'fixtureId', in: 'path' }, example: 1 }),
})

const AimSchema = z
  .object({
    fixtureIds: z.array(z.number().int()).min(1).openapi({ description: 'Moving heads to aim' }),
    targetId: z.number().int(),
  })
  .openapi('Aim')

const AimResultSchema = z
  .object({
    aimed: z.array(
      z.object({ fixtureId: z.number().int(), pan: z.number().int(), tilt: z.number().int() }),
    ),
    skipped: z.array(
      z.object({
        fixtureId: z.number().int(),
        reason: z.string().openapi({ example: 'Not set for this target' }),
      }),
    ),
  })
  .openapi('AimResult')

const listTargets = createRoute({
  method: 'get',
  path: '/rooms/{roomId}/targets',
  tags: ['Targets'],
  summary: 'List a room’s targets',
  request: { params: RoomParams },
  responses: {
    200: json('Targets, by name', z.array(TargetSchema)),
    404: errorResponse('No such room'),
  },
})

const addTarget = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/targets',
  tags: ['Targets'],
  summary: 'Add a target',
  request: {
    params: RoomParams,
    body: { required: true, content: { 'application/json': { schema: TargetCreateSchema } } },
  },
  responses: {
    201: json('Target added', TargetSchema),
    404: errorResponse('No such room'),
    409: errorResponse('ID already used in this room'),
  },
})

const updateTarget = createRoute({
  method: 'patch',
  path: '/rooms/{roomId}/targets/{targetId}',
  tags: ['Targets'],
  summary: 'Rename a target',
  request: {
    params: TargetParams,
    body: { required: true, content: { 'application/json': { schema: TargetUpdateSchema } } },
  },
  responses: {
    200: json('Target updated', TargetSchema),
    404: errorResponse('No such target'),
    409: errorResponse('ID already used in this room'),
  },
})

const removeTarget = createRoute({
  method: 'delete',
  path: '/rooms/{roomId}/targets/{targetId}',
  tags: ['Targets'],
  summary: 'Remove a target',
  request: { params: TargetParams },
  responses: { 204: { description: 'Target removed' }, 404: errorResponse('No such target') },
})

const setPosition = createRoute({
  method: 'put',
  path: '/rooms/{roomId}/targets/{targetId}/positions/{fixtureId}',
  tags: ['Targets'],
  summary: 'Set where a head points for a target',
  request: {
    params: PositionParams,
    body: {
      required: true,
      content: { 'application/json': { schema: PositionSchema.omit({ fixtureId: true }) } },
    },
  },
  responses: {
    200: json('Target updated', TargetSchema),
    404: errorResponse('No such target or head'),
  },
})

const clearPosition = createRoute({
  method: 'delete',
  path: '/rooms/{roomId}/targets/{targetId}/positions/{fixtureId}',
  tags: ['Targets'],
  summary: 'Forget where a head points for a target',
  request: { params: PositionParams },
  responses: {
    200: json('Target updated', TargetSchema),
    404: errorResponse('No such target or head'),
  },
})

const aim = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/aim',
  tags: ['Targets'],
  summary: 'Send moving heads to a target',
  description:
    'Sets pan/tilt of each head to what is stored for the target. Heads with nothing stored ' +
    'for it are skipped. Only moves the heads; dimmer and color stay as they are.',
  request: {
    params: RoomParams,
    body: { required: true, content: { 'application/json': { schema: AimSchema } } },
  },
  responses: {
    200: json('Heads aimed', AimResultSchema),
    404: errorResponse('No such room or target'),
    409: errorResponse('The room is not the active one'),
  },
})

type TargetRow = typeof targets.$inferSelect

function toTargets(rows: TargetRow[]) {
  const ids = rows.map((r) => r.id)
  const positions = ids.length
    ? db.select().from(targetPositions).where(inArray(targetPositions.targetId, ids)).all()
    : []
  return rows.map((row) => ({
    ...row,
    positions: positions
      .filter((p) => p.targetId === row.id)
      .map(({ fixtureId, pan, tilt }) => ({ fixtureId, pan, tilt })),
  }))
}

const toTarget = (row: TargetRow) => toTargets([row])[0] as ReturnType<typeof toTargets>[number]

function findTarget(roomId: number, id: number) {
  return db
    .select()
    .from(targets)
    .where(and(eq(targets.roomId, roomId), eq(targets.id, id)))
    .get()
}

function findHead(roomId: number, id: number) {
  return db
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(and(eq(fixtures.roomId, roomId), eq(fixtures.id, id)))
    .get()
}

function slugTaken(roomId: number, slug: string, exceptId?: number) {
  const conditions = [eq(targets.roomId, roomId), eq(targets.slug, slug)]
  if (exceptId !== undefined) conditions.push(ne(targets.id, exceptId))
  return !!db
    .select({ id: targets.id })
    .from(targets)
    .where(and(...conditions))
    .get()
}

// "DJ booth" → "dj-booth", numbered if the room already has one.
function slugFor(roomId: number, name: string) {
  const base =
    name
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 36) || 'target'
  let slug = base
  for (let n = 2; slugTaken(roomId, slug); n++) slug = `${base}-${n}`
  return slug
}

const slugConflict = (slug: string) => ({ error: `A target with ID "${slug}" exists in this room` })

// Writes each head's stored pan/tilt for the target straight to the output.
function aimHeads(roomId: number, fixtureIds: number[], targetId: number) {
  const heads = db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.roomId, roomId), inArray(fixtures.id, fixtureIds)))
    .all()
  const positions = db
    .select()
    .from(targetPositions)
    .where(eq(targetPositions.targetId, targetId))
    .all()
  const aimed: { fixtureId: number; pan: number; tilt: number }[] = []
  const skipped: { fixtureId: number; reason: string }[] = []

  for (const id of fixtureIds) {
    const head = heads.find((f) => f.id === id)
    if (head?.type !== 'moving_head') {
      skipped.push({ fixtureId: id, reason: 'Not a moving head in this room' })
      continue
    }
    const position = positions.find((p) => p.fixtureId === id)
    if (!position) {
      skipped.push({ fixtureId: id, reason: 'Not set for this target' })
      continue
    }
    identify.stopFor(id)
    dmxOutput.set(head.address, [...coarseFine(position.pan), ...coarseFine(position.tilt)])
    aimed.push({ fixtureId: id, pan: position.pan, tilt: position.tilt })
  }
  return { aimed, skipped }
}

export const targetRoutes = createRouter()
  .openapi(listTargets, (c) => {
    const { roomId } = c.req.valid('param')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    const rows = db
      .select()
      .from(targets)
      .where(eq(targets.roomId, roomId))
      .orderBy(sql`lower(${targets.name})`)
      .all()
    return c.json(toTargets(rows), 200)
  })
  .openapi(addTarget, (c) => {
    const { roomId } = c.req.valid('param')
    const { slug, ...input } = c.req.valid('json')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    if (slug !== undefined && slugTaken(roomId, slug)) return c.json(slugConflict(slug), 409)
    const row = db
      .insert(targets)
      .values({ ...input, roomId, slug: slug ?? slugFor(roomId, input.name) })
      .returning()
      .get()
    broadcast({ type: 'targets.changed', roomId })
    return c.json(toTarget(row), 201)
  })
  .openapi(updateTarget, (c) => {
    const { roomId, targetId } = c.req.valid('param')
    const input = c.req.valid('json')
    const old = findTarget(roomId, targetId)
    if (!old) return c.json({ error: 'Target not found' }, 404)
    if (input.slug !== undefined && slugTaken(roomId, input.slug, targetId)) {
      return c.json(slugConflict(input.slug), 409)
    }
    // Drizzle rejects an empty SET, so an empty body is a no-op.
    if (Object.keys(input).length === 0) return c.json(toTarget(old), 200)
    const row = db.update(targets).set(input).where(eq(targets.id, targetId)).returning().get()
    broadcast({ type: 'targets.changed', roomId })
    return c.json(toTarget(row), 200)
  })
  .openapi(removeTarget, (c) => {
    const { roomId, targetId } = c.req.valid('param')
    if (!findTarget(roomId, targetId)) return c.json({ error: 'Target not found' }, 404)
    db.delete(targets).where(eq(targets.id, targetId)).run()
    broadcast({ type: 'targets.changed', roomId })
    return c.body(null, 204)
  })
  .openapi(setPosition, (c) => {
    const { roomId, targetId, fixtureId } = c.req.valid('param')
    const { pan, tilt } = c.req.valid('json')
    const target = findTarget(roomId, targetId)
    if (!target || !findHead(roomId, fixtureId)) return c.json({ error: 'Target not found' }, 404)
    db.insert(targetPositions)
      .values({ targetId, fixtureId, pan, tilt })
      .onConflictDoUpdate({
        target: [targetPositions.targetId, targetPositions.fixtureId],
        set: { pan, tilt },
      })
      .run()
    broadcast({ type: 'targets.changed', roomId })
    return c.json(toTarget(target), 200)
  })
  .openapi(clearPosition, (c) => {
    const { roomId, targetId, fixtureId } = c.req.valid('param')
    const target = findTarget(roomId, targetId)
    if (!target || !findHead(roomId, fixtureId)) return c.json({ error: 'Target not found' }, 404)
    db.delete(targetPositions)
      .where(and(eq(targetPositions.targetId, targetId), eq(targetPositions.fixtureId, fixtureId)))
      .run()
    broadcast({ type: 'targets.changed', roomId })
    return c.json(toTarget(target), 200)
  })
  .openapi(aim, (c) => {
    const { roomId } = c.req.valid('param')
    const { fixtureIds, targetId } = c.req.valid('json')
    const room = findRoom(roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (!room.active) return c.json({ error: 'Activate the room to aim its heads' }, 409)
    if (!findTarget(roomId, targetId)) return c.json({ error: 'Target not found' }, 404)
    return c.json(aimHeads(roomId, fixtureIds, targetId), 200)
  })
