import { createRoute, z } from '@hono/zod-openapi'
import {
  aimAt,
  coarseFine,
  fitHead,
  headGeometry,
  MIN_CALIBRATION_POINTS,
  type PlanPoint,
  type RoomSize,
  type Spot,
  spotAt,
} from '@stagehand/shared'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../db'
import { fixtures, targetNudges, targets } from '../db/schema'
import { dmxOutput } from '../dmx'
import { identify } from '../identify'
import { createRouter } from '../lib/router'
import { errorResponse, jsonResponse as json } from '../lib/schemas'
import { broadcast } from '../ws'
import { roomCalibration } from './calibration'
import { PositionSchema } from './fixtures'
import { findRoom, RoomParams } from './rooms'

const SlugSchema = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lower-case letters, digits and single dashes')
  .max(40)
  .openapi({ example: 'dj-booth' })

const NudgeSchema = z
  .object({
    fixtureId: z.number().int(),
    pan: z.number().min(-90).max(90).openapi({ description: 'Degrees added to the fitted pan' }),
    tilt: z.number().min(-90).max(90).openapi({ description: 'Degrees added to the fitted tilt' }),
  })
  .openapi('TargetNudge')

const HeightSchema = z
  .number()
  .min(0)
  .max(50)
  .nullable()
  .openapi({ description: 'Meters above the floor; null = on the floor' })

const TargetSchema = z
  .object({
    id: z.number().int(),
    roomId: z.number().int(),
    name: z.string().openapi({ example: 'DJ booth' }),
    slug: SlugSchema,
    position: PositionSchema,
    height: HeightSchema,
    nudges: z.array(NudgeSchema),
  })
  .openapi('Target')

const NameSchema = z.string().trim().min(1).max(100).openapi({ example: 'DJ booth' })

const TargetCreateSchema = z
  .object({
    name: NameSchema,
    slug: SlugSchema.optional().openapi({ description: 'Made from the name when omitted' }),
    position: PositionSchema,
    height: HeightSchema.default(null),
  })
  .openapi('TargetCreate')

const TargetUpdateSchema = z
  .object({ name: NameSchema, slug: SlugSchema, position: PositionSchema, height: HeightSchema })
  .partial()
  .openapi('TargetUpdate')

const TargetParams = RoomParams.extend({
  targetId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'targetId', in: 'path' }, example: 1 }),
})

const NudgeParams = TargetParams.extend({
  fixtureId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'fixtureId', in: 'path' }, example: 1 }),
})

const AimSchema = z
  .object({
    fixtureIds: z.array(z.number().int()).min(1).openapi({ description: 'Moving heads to aim' }),
    targetId: z.number().int().optional().openapi({ description: 'Aim at this target…' }),
    position: PositionSchema.optional().openapi({ description: '…or at this spot on the plan' }),
  })
  .refine((a) => (a.targetId === undefined) !== (a.position === undefined), {
    message: 'Give either targetId or position',
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
        reason: z.string().openapi({ example: 'Not calibrated' }),
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
  summary: 'Rename or move a target',
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

const setNudge = createRoute({
  method: 'put',
  path: '/rooms/{roomId}/targets/{targetId}/nudges/{fixtureId}',
  tags: ['Targets'],
  summary: 'Set a head’s correction for a target',
  description: 'Degrees added to the fitted pan/tilt when this head aims here. 0, 0 clears it.',
  request: {
    params: NudgeParams,
    body: {
      required: true,
      content: { 'application/json': { schema: NudgeSchema.omit({ fixtureId: true }) } },
    },
  },
  responses: { 200: json('Target updated', TargetSchema), 404: errorResponse('No such target') },
})

const aim = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/aim',
  tags: ['Targets'],
  summary: 'Aim moving heads at a target or a spot',
  description:
    'Sets pan/tilt of each head from its calibration. Heads that are not calibrated, or ' +
    'can’t reach the spot, are skipped. Only moves the heads; dimmer and color stay as they are.',
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
  const nudges = ids.length
    ? db.select().from(targetNudges).where(inArray(targetNudges.targetId, ids)).all()
    : []
  return rows.map(({ x, y, ...row }) => ({
    ...row,
    position: { x, y },
    nudges: nudges
      .filter((n) => n.targetId === row.id)
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

// Pan/tilt for each head, from its calibration; written straight to the output.
function aimHeads(
  room: RoomSize & { id: number },
  fixtureIds: number[],
  spot: Spot,
  targetId?: number,
) {
  const roomId = room.id
  const heads = db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.roomId, roomId), inArray(fixtures.id, fixtureIds)))
    .all()
  const points = roomCalibration(roomId)
  const nudges =
    targetId === undefined
      ? []
      : db.select().from(targetNudges).where(eq(targetNudges.targetId, targetId)).all()
  const channels = dmxOutput.channels()
  const aimed: { fixtureId: number; pan: number; tilt: number }[] = []
  const skipped: { fixtureId: number; reason: string }[] = []

  for (const id of fixtureIds) {
    const head = heads.find((f) => f.id === id)
    if (head?.type !== 'moving_head') {
      skipped.push({ fixtureId: id, reason: 'Not a moving head in this room' })
      continue
    }
    const samples = points.flatMap((p) =>
      p.fixtureId === id && p.pan !== null && p.tilt !== null
        ? [{ x: p.x, y: p.y, pan: p.pan, tilt: p.tilt }]
        : [],
    )
    const near = head.x === null || head.y === null ? null : { x: head.x, y: head.y }
    const geometry = headGeometry(room, head.height)
    const fit = fitHead(samples, near, geometry)
    if (!fit) {
      const reason =
        samples.length < MIN_CALIBRATION_POINTS
          ? 'Not calibrated'
          : 'Calibration doesn’t fit: check its points'
      skipped.push({ fixtureId: id, reason })
      continue
    }
    const at = (offset: number) => channels[head.address - 1 + offset] ?? 0
    const from = { pan: at(0) * 256 + at(1), tilt: at(2) * 256 + at(3) }
    const result = aimAt(
      fit.model,
      spot,
      from,
      nudges.find((n) => n.fixtureId === id),
    )
    if (!result) {
      skipped.push({ fixtureId: id, reason: 'Out of reach' })
      continue
    }
    identify.stopFor(id)
    dmxOutput.set(head.address, [...coarseFine(result.pan), ...coarseFine(result.tilt)])
    aimed.push({ fixtureId: id, ...result })
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
    const { position, slug, ...input } = c.req.valid('json')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    if (slug !== undefined && slugTaken(roomId, slug)) return c.json(slugConflict(slug), 409)
    const row = db
      .insert(targets)
      .values({ ...input, ...position, roomId, slug: slug ?? slugFor(roomId, input.name) })
      .returning()
      .get()
    broadcast({ type: 'targets.changed', roomId })
    return c.json(toTarget(row), 201)
  })
  .openapi(updateTarget, (c) => {
    const { roomId, targetId } = c.req.valid('param')
    const { position, ...input } = c.req.valid('json')
    const old = findTarget(roomId, targetId)
    if (!old) return c.json({ error: 'Target not found' }, 404)
    if (input.slug !== undefined && slugTaken(roomId, input.slug, targetId)) {
      return c.json(slugConflict(input.slug), 409)
    }
    const changes = { ...input, ...position }
    // Drizzle rejects an empty SET, so an empty body is a no-op.
    if (Object.keys(changes).length === 0) return c.json(toTarget(old), 200)
    const row = db.update(targets).set(changes).where(eq(targets.id, targetId)).returning().get()
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
  .openapi(setNudge, (c) => {
    const { roomId, targetId, fixtureId } = c.req.valid('param')
    const { pan, tilt } = c.req.valid('json')
    const target = findTarget(roomId, targetId)
    const head = db
      .select({ id: fixtures.id })
      .from(fixtures)
      .where(and(eq(fixtures.roomId, roomId), eq(fixtures.id, fixtureId)))
      .get()
    if (!target || !head) return c.json({ error: 'Target not found' }, 404)
    const key = and(eq(targetNudges.targetId, targetId), eq(targetNudges.fixtureId, fixtureId))
    if (pan === 0 && tilt === 0) {
      db.delete(targetNudges).where(key).run()
    } else {
      db.insert(targetNudges)
        .values({ targetId, fixtureId, pan, tilt })
        .onConflictDoUpdate({
          target: [targetNudges.targetId, targetNudges.fixtureId],
          set: { pan, tilt },
        })
        .run()
    }
    broadcast({ type: 'targets.changed', roomId })
    return c.json(toTarget(target), 200)
  })
  .openapi(aim, (c) => {
    const { roomId } = c.req.valid('param')
    const { fixtureIds, targetId, position } = c.req.valid('json')
    const room = findRoom(roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (!room.active) return c.json({ error: 'Activate the room to aim its heads' }, 409)
    const target = targetId === undefined ? undefined : findTarget(roomId, targetId)
    if (targetId !== undefined && !target) return c.json({ error: 'Target not found' }, 404)
    // A target's height only counts once the room has a size to convert it with.
    const spot = target
      ? spotAt(room, { x: target.x, y: target.y }, target.height)
      : (position as PlanPoint)
    return c.json(aimHeads(room, fixtureIds, spot, target?.id), 200)
  })
