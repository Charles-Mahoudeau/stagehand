import { createRoute, z } from '@hono/zod-openapi'
import { uniqueSlug } from '@stagehand/shared'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '../db'
import { rooms } from '../db/schema'
import { dmxOutput } from '../dmx'
import { identify } from '../identify'
import { createRouter } from '../lib/router'
import { errorResponse, idParam, idSchema, jsonResponse as json } from '../lib/schemas'
import { playback } from '../playback'
import { broadcast } from '../ws'

// Meters. Heads aim by the room's real proportions once both are set.
const SizeSchema = z.number().positive().max(1000).nullable()

const RoomSchema = z
  .object({
    id: idSchema('wakanda'),
    name: z.string().openapi({ example: 'Wakanda' }),
    active: z.boolean().openapi({ description: 'Whether this is the room the server is driving' }),
    width: SizeSchema.openapi({ description: 'Floor width in meters; null = not measured' }),
    depth: SizeSchema.openapi({ description: 'Floor depth in meters; null = not measured' }),
  })
  .openapi('Room')

const NameSchema = z.string().trim().min(1).max(100).openapi({ example: 'Wakanda' })

const RoomInputSchema = z
  .object({
    name: NameSchema,
    id: idSchema('wakanda').optional().openapi({ description: 'Made from the name when omitted' }),
  })
  .openapi('RoomInput')

const RoomUpdateSchema = z
  .object({ name: NameSchema, width: SizeSchema, depth: SizeSchema })
  .partial()
  .openapi('RoomUpdate')

export const RoomParams = z.object({
  roomId: idParam('roomId', 'wakanda'),
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
    409: errorResponse('Name or ID already used'),
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
  summary: 'Rename a room or set its size',
  request: {
    params: RoomParams,
    body: { required: true, content: { 'application/json': { schema: RoomUpdateSchema } } },
  },
  responses: {
    200: json('Room updated', RoomSchema),
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

export function findRoom(id: string) {
  return db.select().from(rooms).where(eq(rooms.id, id)).get()
}

// Room names are unique, ignoring case.
function nameTaken(name: string, exceptId?: string) {
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
    const { name, id } = c.req.valid('json')
    if (nameTaken(name)) return c.json({ error: `A room named "${name}" exists` }, 409)
    if (id !== undefined && findRoom(id)) {
      return c.json({ error: `A room with ID "${id}" exists` }, 409)
    }
    const hasActive = !!db.select().from(rooms).where(eq(rooms.active, true)).get()
    const room = db
      .insert(rooms)
      .values({
        id: id ?? uniqueSlug(name, 'room', (s) => !!findRoom(s)),
        name,
        active: !hasActive,
      })
      .returning()
      .get()
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
    const changes = c.req.valid('json')
    const old = findRoom(roomId)
    if (!old) return c.json({ error: 'Room not found' }, 404)
    if (changes.name !== undefined && nameTaken(changes.name, roomId)) {
      return c.json({ error: `A room named "${changes.name}" exists` }, 409)
    }
    // Drizzle rejects an empty SET, so an empty body is a no-op.
    if (Object.keys(changes).length === 0) return c.json(old, 200)
    const room = db.update(rooms).set(changes).where(eq(rooms.id, roomId)).returning().get()
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
    playback.stop({ blackout: false })
    dmxOutput.blackout()
    broadcast({ type: 'rooms.changed' })
    return c.json(room, 200)
  })
