import { createRoute, z } from '@hono/zod-openapi'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '../db'
import { rooms } from '../db/schema'
import { dmxOutput } from '../dmx'
import { identify } from '../identify'
import { createRouter } from '../lib/router'
import { errorResponse, jsonResponse as json } from '../lib/schemas'
import { broadcast } from '../ws'

const RoomSchema = z
  .object({
    id: z.number().int().openapi({ example: 1 }),
    name: z.string().openapi({ example: 'Wakanda' }),
    active: z.boolean().openapi({ description: 'Whether this is the room the server is driving' }),
  })
  .openapi('Room')

const RoomInputSchema = z
  .object({ name: z.string().trim().min(1).max(100).openapi({ example: 'Wakanda' }) })
  .openapi('RoomInput')

export const RoomParams = z.object({
  roomId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'roomId', in: 'path' }, example: 1 }),
})

const listRooms = createRoute({
  method: 'get',
  path: '/rooms',
  tags: ['Rooms'],
  summary: 'List rooms',
  responses: { 200: json('All rooms, by name', z.array(RoomSchema)) },
})

const createRoom = createRoute({
  method: 'post',
  path: '/rooms',
  tags: ['Rooms'],
  summary: 'Create a room',
  description: 'The first room created becomes the active one.',
  request: {
    body: { required: true, content: { 'application/json': { schema: RoomInputSchema } } },
  },
  responses: {
    201: json('Room created', RoomSchema),
    409: errorResponse('Name already used'),
  },
})

const getRoom = createRoute({
  method: 'get',
  path: '/rooms/{roomId}',
  tags: ['Rooms'],
  summary: 'Get a room',
  request: { params: RoomParams },
  responses: { 200: json('The room', RoomSchema), 404: errorResponse('No such room') },
})

const renameRoom = createRoute({
  method: 'patch',
  path: '/rooms/{roomId}',
  tags: ['Rooms'],
  summary: 'Rename a room',
  request: {
    params: RoomParams,
    body: { required: true, content: { 'application/json': { schema: RoomInputSchema } } },
  },
  responses: {
    200: json('Room renamed', RoomSchema),
    404: errorResponse('No such room'),
    409: errorResponse('Name already used'),
  },
})

const deleteRoom = createRoute({
  method: 'delete',
  path: '/rooms/{roomId}',
  tags: ['Rooms'],
  summary: 'Delete a room and its fixtures',
  request: { params: RoomParams },
  responses: {
    204: { description: 'Room deleted' },
    404: errorResponse('No such room'),
    409: errorResponse('The active room cannot be deleted'),
  },
})

const activateRoom = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/activate',
  tags: ['Rooms'],
  summary: 'Make this the room the server drives',
  description: 'Blacks out the output, since channel values belong to the previous rig.',
  request: { params: RoomParams },
  responses: { 200: json('Room activated', RoomSchema), 404: errorResponse('No such room') },
})

export function findRoom(id: number) {
  return db.select().from(rooms).where(eq(rooms.id, id)).get()
}

// Room names are unique, ignoring case.
function nameTaken(name: string, exceptId?: number) {
  const sameName = sql`lower(${rooms.name}) = lower(${name})`
  return !!db
    .select({ id: rooms.id })
    .from(rooms)
    .where(exceptId === undefined ? sameName : and(sameName, ne(rooms.id, exceptId)))
    .get()
}

export const roomRoutes = createRouter()
  .openapi(listRooms, (c) => c.json(db.select().from(rooms).orderBy(rooms.name).all(), 200))
  .openapi(createRoom, (c) => {
    const { name } = c.req.valid('json')
    if (nameTaken(name)) return c.json({ error: `A room named "${name}" exists` }, 409)
    const hasActive = !!db.select().from(rooms).where(eq(rooms.active, true)).get()
    const room = db.insert(rooms).values({ name, active: !hasActive }).returning().get()
    broadcast({ type: 'rooms.changed' })
    return c.json(room, 201)
  })
  .openapi(getRoom, (c) => {
    const room = findRoom(c.req.valid('param').roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    return c.json(room, 200)
  })
  .openapi(renameRoom, (c) => {
    const { roomId } = c.req.valid('param')
    const { name } = c.req.valid('json')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    if (nameTaken(name, roomId)) return c.json({ error: `A room named "${name}" exists` }, 409)
    const room = db.update(rooms).set({ name }).where(eq(rooms.id, roomId)).returning().get()
    broadcast({ type: 'rooms.changed' })
    return c.json(room, 200)
  })
  .openapi(deleteRoom, (c) => {
    const room = findRoom(c.req.valid('param').roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (room.active) return c.json({ error: 'Activate another room before deleting this one' }, 409)
    db.delete(rooms).where(eq(rooms.id, room.id)).run()
    broadcast({ type: 'rooms.changed' })
    return c.body(null, 204)
  })
  .openapi(activateRoom, (c) => {
    const { roomId } = c.req.valid('param')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    const room = db.transaction((tx) => {
      tx.update(rooms).set({ active: false }).where(eq(rooms.active, true)).run()
      return tx.update(rooms).set({ active: true }).where(eq(rooms.id, roomId)).returning().get()
    })
    identify.stop({ restore: false })
    dmxOutput.blackout()
    broadcast({ type: 'rooms.changed' })
    return c.json(room, 200)
  })
