import { createRoute, z } from '@hono/zod-openapi'
import { channelCount, FIXTURE_PROFILES, FixtureType } from '@stagehand/shared'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '../db'
import { fixtures } from '../db/schema'
import { DMX_CHANNELS, dmxOutput } from '../dmx'
import { identify } from '../identify'
import { createRouter } from '../lib/router'
import { errorResponse, jsonResponse as json } from '../lib/schemas'
import { broadcast } from '../ws'
import { findRoom, RoomParams } from './rooms'

export const PositionSchema = z
  .object({
    x: z.number().min(0).max(1).openapi({ description: '0 = left wall, 1 = right wall' }),
    y: z.number().min(0).max(1).openapi({ description: '0 = stage side, 1 = back of room' }),
  })
  .openapi('FixturePosition', { description: 'Fractions of the room’s width and depth' })

const TypeSchema = FixtureType.openapi({ description: 'See GET /api/fixture-types' })

const AddressSchema = z
  .number()
  .int()
  .min(1)
  .max(DMX_CHANNELS)
  .openapi({ description: 'First DMX channel (1-based)', example: 1 })

const FixtureSchema = z
  .object({
    id: z.number().int(),
    roomId: z.number().int(),
    name: z.string().openapi({ example: 'L1' }),
    type: TypeSchema,
    address: AddressSchema,
    channelCount: z.number().int().openapi({ description: 'Channels used from `address` on' }),
    position: PositionSchema.nullable(),
  })
  .openapi('Fixture')

const NameSchema = z.string().trim().min(1).max(100).openapi({ example: 'L1' })

const FixtureCreateSchema = z
  .object({
    name: NameSchema,
    type: TypeSchema,
    address: AddressSchema,
    position: PositionSchema.nullable().default(null),
  })
  .refine(({ type, address }) => fitsUniverse(type, address), {
    message: `Fixture must end at or before channel ${DMX_CHANNELS}`,
    path: ['address'],
  })
  .openapi('FixtureCreate')

const FixtureUpdateSchema = z
  .object({
    name: NameSchema,
    type: TypeSchema,
    address: AddressSchema,
    position: PositionSchema.nullable(),
  })
  .partial()
  .openapi('FixtureUpdate')

export const FixtureParams = RoomParams.extend({
  fixtureId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'fixtureId', in: 'path' }, example: 1 }),
})

const FixtureTypeSchema = z
  .object({
    type: TypeSchema,
    label: z.string(),
    channels: z.array(z.object({ attribute: z.string(), label: z.string() })),
  })
  .openapi('FixtureType')

const listTypes = createRoute({
  method: 'get',
  path: '/fixture-types',
  tags: ['Fixtures'],
  summary: 'Fixture types and their channel layouts',
  responses: { 200: json('All fixture types', z.array(FixtureTypeSchema)) },
})

const listFixtures = createRoute({
  method: 'get',
  path: '/rooms/{roomId}/fixtures',
  tags: ['Fixtures'],
  summary: 'List a room’s fixtures',
  request: { params: RoomParams },
  responses: {
    200: json('Fixtures, by address', z.array(FixtureSchema)),
    404: errorResponse('No such room'),
  },
})

const addFixture = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/fixtures',
  tags: ['Fixtures'],
  summary: 'Add a fixture',
  description: 'Addresses may overlap: fixtures on the same address are driven together.',
  request: {
    params: RoomParams,
    body: { required: true, content: { 'application/json': { schema: FixtureCreateSchema } } },
  },
  responses: {
    201: json('Fixture added', FixtureSchema),
    404: errorResponse('No such room'),
    409: errorResponse('Name already used in this room'),
  },
})

const getFixture = createRoute({
  method: 'get',
  path: '/rooms/{roomId}/fixtures/{fixtureId}',
  tags: ['Fixtures'],
  summary: 'Get a fixture',
  request: { params: FixtureParams },
  responses: { 200: json('The fixture', FixtureSchema), 404: errorResponse('No such fixture') },
})

const updateFixture = createRoute({
  method: 'patch',
  path: '/rooms/{roomId}/fixtures/{fixtureId}',
  tags: ['Fixtures'],
  summary: 'Rename, re-patch or move a fixture',
  request: {
    params: FixtureParams,
    body: { required: true, content: { 'application/json': { schema: FixtureUpdateSchema } } },
  },
  responses: {
    200: json('Fixture updated', FixtureSchema),
    400: errorResponse('Fixture would extend past the last channel'),
    404: errorResponse('No such fixture'),
    409: errorResponse('Name already used in this room'),
  },
})

const removeFixture = createRoute({
  method: 'delete',
  path: '/rooms/{roomId}/fixtures/{fixtureId}',
  tags: ['Fixtures'],
  summary: 'Remove a fixture',
  description: 'In the active room, channels no other fixture uses are set to 0.',
  request: { params: FixtureParams },
  responses: { 204: { description: 'Fixture removed' }, 404: errorResponse('No such fixture') },
})

const startIdentify = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/fixtures/{fixtureId}/identify',
  tags: ['Fixtures'],
  summary: 'Start the identify rainbow on a fixture',
  description:
    'Cycles colours on the fixture’s channels (and so on every fixture sharing its address) ' +
    'until stopped. Only one fixture identifies at a time; starting another stops the first.',
  request: { params: FixtureParams },
  responses: {
    204: { description: 'Identifying' },
    404: errorResponse('No such fixture'),
    409: errorResponse('The room is not the active one'),
  },
})

const stopIdentify = createRoute({
  method: 'delete',
  path: '/rooms/{roomId}/fixtures/{fixtureId}/identify',
  tags: ['Fixtures'],
  summary: 'Stop the identify rainbow',
  description: 'The channels go back to their values from before. No-op if not identifying.',
  request: { params: FixtureParams },
  responses: { 204: { description: 'Stopped' } },
})

type FixtureRow = typeof fixtures.$inferSelect

function fitsUniverse(type: FixtureType, address: number) {
  return address + channelCount(type) - 1 <= DMX_CHANNELS
}

function toFixture({ x, y, ...row }: FixtureRow) {
  return {
    ...row,
    channelCount: channelCount(row.type),
    position: x === null || y === null ? null : { x, y },
  }
}

export function findFixture(roomId: number, id: number) {
  return db
    .select()
    .from(fixtures)
    .where(and(eq(fixtures.roomId, roomId), eq(fixtures.id, id)))
    .get()
}

// Fixture names are unique within a room, ignoring case.
function nameTaken(roomId: number, name: string, exceptId?: number) {
  const conditions = [eq(fixtures.roomId, roomId), sql`lower(${fixtures.name}) = lower(${name})`]
  if (exceptId !== undefined) conditions.push(ne(fixtures.id, exceptId))
  return !!db
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(and(...conditions))
    .get()
}

// After a fixture leaves channels in the active room (removed, re-addressed or
// re-typed), zero those no remaining fixture uses, so nothing is left lit
// with no fixture to turn it off.
function releaseChannels(roomId: number, old: Pick<FixtureRow, 'type' | 'address'>) {
  if (!findRoom(roomId)?.active) return
  const used = new Set<number>()
  for (const f of db.select().from(fixtures).where(eq(fixtures.roomId, roomId)).all()) {
    for (let i = 0; i < channelCount(f.type); i++) used.add(f.address + i)
  }
  for (let ch = old.address; ch < old.address + channelCount(old.type); ch++) {
    if (!used.has(ch)) dmxOutput.set(ch, [0])
  }
}

const nameConflict = (name: string) => ({ error: `A fixture named "${name}" exists in this room` })

export const fixtureRoutes = createRouter()
  .openapi(listTypes, (c) => c.json(Object.values(FIXTURE_PROFILES), 200))
  .openapi(listFixtures, (c) => {
    const { roomId } = c.req.valid('param')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    const rows = db
      .select()
      .from(fixtures)
      .where(eq(fixtures.roomId, roomId))
      .orderBy(fixtures.address, fixtures.name)
      .all()
    return c.json(rows.map(toFixture), 200)
  })
  .openapi(addFixture, (c) => {
    const { roomId } = c.req.valid('param')
    const { position, ...input } = c.req.valid('json')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    if (nameTaken(roomId, input.name)) return c.json(nameConflict(input.name), 409)
    const row = db
      .insert(fixtures)
      .values({ ...input, roomId, x: position?.x ?? null, y: position?.y ?? null })
      .returning()
      .get()
    broadcast({ type: 'fixtures.changed', roomId })
    return c.json(toFixture(row), 201)
  })
  .openapi(getFixture, (c) => {
    const { roomId, fixtureId } = c.req.valid('param')
    const row = findFixture(roomId, fixtureId)
    if (!row) return c.json({ error: 'Fixture not found' }, 404)
    return c.json(toFixture(row), 200)
  })
  .openapi(updateFixture, (c) => {
    const { roomId, fixtureId } = c.req.valid('param')
    const { position, ...input } = c.req.valid('json')
    const old = findFixture(roomId, fixtureId)
    if (!old) return c.json({ error: 'Fixture not found' }, 404)
    if (input.name !== undefined && nameTaken(roomId, input.name, fixtureId)) {
      return c.json(nameConflict(input.name), 409)
    }
    const type = input.type ?? old.type
    const address = input.address ?? old.address
    if (!fitsUniverse(type, address)) {
      return c.json({ error: `Fixture must end at or before channel ${DMX_CHANNELS}` }, 400)
    }
    const coords = position === undefined ? {} : { x: position?.x ?? null, y: position?.y ?? null }
    const changes = { ...input, ...coords }
    // Drizzle rejects an empty SET, so an empty body is a no-op.
    if (Object.keys(changes).length === 0) return c.json(toFixture(old), 200)
    identify.stopFor(fixtureId)
    const row = db.update(fixtures).set(changes).where(eq(fixtures.id, fixtureId)).returning().get()
    if (type !== old.type || address !== old.address) releaseChannels(roomId, old)
    broadcast({ type: 'fixtures.changed', roomId })
    return c.json(toFixture(row), 200)
  })
  .openapi(removeFixture, (c) => {
    const { roomId, fixtureId } = c.req.valid('param')
    const old = findFixture(roomId, fixtureId)
    if (!old) return c.json({ error: 'Fixture not found' }, 404)
    identify.stopFor(fixtureId)
    db.delete(fixtures).where(eq(fixtures.id, fixtureId)).run()
    releaseChannels(roomId, old)
    broadcast({ type: 'fixtures.changed', roomId })
    return c.body(null, 204)
  })
  .openapi(startIdentify, (c) => {
    const { roomId, fixtureId } = c.req.valid('param')
    const row = findFixture(roomId, fixtureId)
    if (!row) return c.json({ error: 'Fixture not found' }, 404)
    if (!findRoom(roomId)?.active) return c.json({ error: 'Activate the room to identify' }, 409)
    identify.start(row)
    return c.body(null, 204)
  })
  .openapi(stopIdentify, (c) => {
    identify.stopFor(c.req.valid('param').fixtureId)
    return c.body(null, 204)
  })
