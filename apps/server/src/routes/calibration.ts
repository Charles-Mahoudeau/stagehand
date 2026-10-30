import { createRoute, z } from '@hono/zod-openapi'
import { MAX_16 } from '@stagehand/shared'
import { and, eq } from 'drizzle-orm'
import { db } from '../db'
import { calibrationPoints, fixtures } from '../db/schema'
import { createRouter } from '../lib/router'
import { errorResponse, jsonResponse as json } from '../lib/schemas'
import { broadcast } from '../ws'
import { FixtureParams, findFixture, PositionSchema } from './fixtures'
import { findRoom, RoomParams } from './rooms'

const Value16 = z
  .number()
  .int()
  .min(0)
  .max(MAX_16)
  .openapi({ description: '16-bit DMX value: coarse × 256 + fine' })

const PointSchema = z
  .object({
    id: z.number().int(),
    fixtureId: z.number().int(),
    name: z.string().openapi({ example: 'Stage left' }),
    position: PositionSchema,
    pan: Value16.nullable().openapi({ description: 'Saved pan, or null if not set yet' }),
    tilt: Value16.nullable().openapi({ description: 'Saved tilt, or null if not set yet' }),
  })
  .openapi('CalibrationPoint')

const NameSchema = z.string().trim().min(1).max(100).openapi({ example: 'Stage left' })

const PointCreateSchema = z
  .object({
    name: NameSchema,
    position: PositionSchema,
    pan: Value16.nullable().default(null),
    tilt: Value16.nullable().default(null),
  })
  .openapi('CalibrationPointCreate')

const PointUpdateSchema = z
  .object({
    name: NameSchema,
    position: PositionSchema,
    pan: Value16.nullable(),
    tilt: Value16.nullable(),
  })
  .partial()
  .openapi('CalibrationPointUpdate')

const PointParams = FixtureParams.extend({
  pointId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'pointId', in: 'path' }, example: 1 }),
})

const listPoints = createRoute({
  method: 'get',
  path: '/rooms/{roomId}/calibration',
  tags: ['Calibration'],
  summary: 'List the calibration points of every moving head in a room',
  request: { params: RoomParams },
  responses: {
    200: json('Points, by fixture', z.array(PointSchema)),
    404: errorResponse('No such room'),
  },
})

const addPoint = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/fixtures/{fixtureId}/calibration',
  tags: ['Calibration'],
  summary: 'Add a calibration point to a moving head',
  description:
    'A spot on the plan to jog the beam onto. Save the pan/tilt that hits it; ' +
    'four saved points are enough to aim the head anywhere.',
  request: {
    params: FixtureParams,
    body: { required: true, content: { 'application/json': { schema: PointCreateSchema } } },
  },
  responses: {
    201: json('Point added', PointSchema),
    400: errorResponse('Not a moving head'),
    404: errorResponse('No such fixture'),
  },
})

const updatePoint = createRoute({
  method: 'patch',
  path: '/rooms/{roomId}/fixtures/{fixtureId}/calibration/{pointId}',
  tags: ['Calibration'],
  summary: 'Rename, move or save a calibration point',
  request: {
    params: PointParams,
    body: { required: true, content: { 'application/json': { schema: PointUpdateSchema } } },
  },
  responses: { 200: json('Point updated', PointSchema), 404: errorResponse('No such point') },
})

const removePoint = createRoute({
  method: 'delete',
  path: '/rooms/{roomId}/fixtures/{fixtureId}/calibration/{pointId}',
  tags: ['Calibration'],
  summary: 'Remove a calibration point',
  request: { params: PointParams },
  responses: { 204: { description: 'Point removed' }, 404: errorResponse('No such point') },
})

type PointRow = typeof calibrationPoints.$inferSelect

const toPoint = ({ x, y, ...row }: PointRow) => ({ ...row, position: { x, y } })

// Saved points of every moving head in a room, for fitting their aim.
export function roomCalibration(roomId: number) {
  return db
    .select({ point: calibrationPoints })
    .from(calibrationPoints)
    .innerJoin(fixtures, eq(fixtures.id, calibrationPoints.fixtureId))
    .where(eq(fixtures.roomId, roomId))
    .orderBy(calibrationPoints.fixtureId, calibrationPoints.id)
    .all()
    .map((r) => r.point)
}

function findPoint(fixtureId: number, id: number) {
  return db
    .select()
    .from(calibrationPoints)
    .where(and(eq(calibrationPoints.fixtureId, fixtureId), eq(calibrationPoints.id, id)))
    .get()
}

export const calibrationRoutes = createRouter()
  .openapi(listPoints, (c) => {
    const { roomId } = c.req.valid('param')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    return c.json(roomCalibration(roomId).map(toPoint), 200)
  })
  .openapi(addPoint, (c) => {
    const { roomId, fixtureId } = c.req.valid('param')
    const { position, ...input } = c.req.valid('json')
    const fixture = findFixture(roomId, fixtureId)
    if (!fixture) return c.json({ error: 'Fixture not found' }, 404)
    if (fixture.type !== 'moving_head') {
      return c.json({ error: 'Only moving heads can be calibrated' }, 400)
    }
    const row = db
      .insert(calibrationPoints)
      .values({ ...input, fixtureId, ...position })
      .returning()
      .get()
    broadcast({ type: 'calibration.changed', roomId })
    return c.json(toPoint(row), 201)
  })
  .openapi(updatePoint, (c) => {
    const { roomId, fixtureId, pointId } = c.req.valid('param')
    const { position, ...input } = c.req.valid('json')
    const old = findFixture(roomId, fixtureId) && findPoint(fixtureId, pointId)
    if (!old) return c.json({ error: 'Point not found' }, 404)
    const changes = { ...input, ...position }
    // Drizzle rejects an empty SET, so an empty body is a no-op.
    if (Object.keys(changes).length === 0) return c.json(toPoint(old), 200)
    const row = db
      .update(calibrationPoints)
      .set(changes)
      .where(eq(calibrationPoints.id, pointId))
      .returning()
      .get()
    broadcast({ type: 'calibration.changed', roomId })
    return c.json(toPoint(row), 200)
  })
  .openapi(removePoint, (c) => {
    const { roomId, fixtureId, pointId } = c.req.valid('param')
    if (!findFixture(roomId, fixtureId) || !findPoint(fixtureId, pointId)) {
      return c.json({ error: 'Point not found' }, 404)
    }
    db.delete(calibrationPoints).where(eq(calibrationPoints.id, pointId)).run()
    broadcast({ type: 'calibration.changed', roomId })
    return c.body(null, 204)
  })
