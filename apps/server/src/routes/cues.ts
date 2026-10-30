import { createRoute, z } from '@hono/zod-openapi'
import { CUE_TRIGGERS, CueSchema, PlaybackState } from '@stagehand/shared'
import { and, asc, eq, sql } from 'drizzle-orm'
import { db } from '../db'
import { cues, scenes } from '../db/schema'
import { createRouter } from '../lib/router'
import { errorResponse, jsonResponse as json } from '../lib/schemas'
import { playback } from '../playback'
import { broadcast } from '../ws'
import { findRoom, RoomParams } from './rooms'

const NameSchema = z.string().trim().min(1).max(100).openapi({ example: 'Night falls' })

const CueCreateSchema = z
  .object({
    sceneId: z.number().int(),
    name: NameSchema.optional().openapi({ description: 'The scene’s name when omitted' }),
    fade: z.number().min(0).max(120).nullable().optional(),
    trigger: z.enum(CUE_TRIGGERS).optional(),
    delay: z.number().min(0).max(600).optional(),
  })
  .openapi('CueCreate')

const CueUpdateSchema = z
  .object({
    sceneId: z.number().int(),
    name: NameSchema,
    fade: z.number().min(0).max(120).nullable(),
    trigger: z.enum(CUE_TRIGGERS),
    delay: z.number().min(0).max(600),
  })
  .partial()
  .openapi('CueUpdate')

const CueOrderSchema = z
  .object({ ids: z.array(z.number().int()).openapi({ description: 'Every cue id, in order' }) })
  .openapi('CueOrder')

const CueParams = RoomParams.extend({
  cueId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'cueId', in: 'path' }, example: 1 }),
})

const listCues = createRoute({
  method: 'get',
  path: '/rooms/{roomId}/cues',
  tags: ['Cues'],
  summary: 'The cue list, in order',
  request: { params: RoomParams },
  responses: { 200: json('Cues', z.array(CueSchema)), 404: errorResponse('No such room') },
})

const addCue = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/cues',
  tags: ['Cues'],
  summary: 'Add a cue at the end of the list',
  request: {
    params: RoomParams,
    body: { required: true, content: { 'application/json': { schema: CueCreateSchema } } },
  },
  responses: {
    201: json('Cue added', CueSchema),
    404: errorResponse('No such room or scene'),
  },
})

const updateCue = createRoute({
  method: 'patch',
  path: '/rooms/{roomId}/cues/{cueId}',
  tags: ['Cues'],
  summary: 'Edit a cue',
  request: {
    params: CueParams,
    body: { required: true, content: { 'application/json': { schema: CueUpdateSchema } } },
  },
  responses: { 200: json('Cue updated', CueSchema), 404: errorResponse('No such cue or scene') },
})

const removeCue = createRoute({
  method: 'delete',
  path: '/rooms/{roomId}/cues/{cueId}',
  tags: ['Cues'],
  summary: 'Remove a cue',
  request: { params: CueParams },
  responses: { 204: { description: 'Cue removed' }, 404: errorResponse('No such cue') },
})

const orderCues = createRoute({
  method: 'put',
  path: '/rooms/{roomId}/cues/order',
  tags: ['Cues'],
  summary: 'Reorder the cue list',
  request: {
    params: RoomParams,
    body: { required: true, content: { 'application/json': { schema: CueOrderSchema } } },
  },
  responses: {
    200: json('The cue list', z.array(CueSchema)),
    400: errorResponse('The ids are not exactly the room’s cues'),
    404: errorResponse('No such room'),
  },
})

const getPlayback = createRoute({
  method: 'get',
  path: '/rooms/{roomId}/playback',
  tags: ['Playback'],
  summary: 'What the cue list is playing',
  request: { params: RoomParams },
  responses: { 200: json('Playback state', PlaybackState), 404: errorResponse('No such room') },
})

const transport = (action: 'go' | 'back' | 'stop') =>
  createRoute({
    method: 'post',
    path: `/rooms/{roomId}/playback/${action}`,
    tags: ['Playback'],
    summary: {
      go: 'Call the next cue',
      back: 'Call the previous cue',
      stop: 'Release everything and black out',
    }[action],
    request: { params: RoomParams },
    responses: {
      200: json('Playback state', PlaybackState),
      404: errorResponse('No such room'),
      409: errorResponse('The room is not the active one, or there is no such cue'),
    },
  })

const goCue = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/cues/{cueId}/go',
  tags: ['Playback'],
  summary: 'Jump to a cue',
  request: { params: CueParams },
  responses: {
    200: json('Playback state', PlaybackState),
    404: errorResponse('No such cue'),
    409: errorResponse('The room is not the active one'),
  },
})

const list = (roomId: number) =>
  db.select().from(cues).where(eq(cues.roomId, roomId)).orderBy(asc(cues.position)).all()

const find = (roomId: number, id: number) =>
  db
    .select()
    .from(cues)
    .where(and(eq(cues.roomId, roomId), eq(cues.id, id)))
    .get()

const findScene = (roomId: number, id: number) =>
  db
    .select()
    .from(scenes)
    .where(and(eq(scenes.roomId, roomId), eq(scenes.id, id)))
    .get()

const changed = (roomId: number) => {
  playback.invalidate()
  broadcast({ type: 'cues.changed', roomId })
}

export const cueRoutes = createRouter()
  .openapi(listCues, (c) => {
    const { roomId } = c.req.valid('param')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    return c.json(list(roomId), 200)
  })
  // Registered before the `{cueId}` routes so "order" is not read as an id.
  .openapi(orderCues, (c) => {
    const { roomId } = c.req.valid('param')
    const { ids } = c.req.valid('json')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    const have = list(roomId).map((q) => q.id)
    if (
      ids.length !== have.length ||
      !ids.every((id) => have.includes(id)) ||
      new Set(ids).size !== ids.length
    ) {
      return c.json({ error: 'The ids must be exactly the room’s cues' }, 400)
    }
    db.transaction((tx) => {
      ids.forEach((id, position) => {
        tx.update(cues).set({ position }).where(eq(cues.id, id)).run()
      })
    })
    changed(roomId)
    return c.json(list(roomId), 200)
  })
  .openapi(addCue, (c) => {
    const { roomId } = c.req.valid('param')
    const input = c.req.valid('json')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    const scene = findScene(roomId, input.sceneId)
    if (!scene) return c.json({ error: 'Scene not found' }, 404)
    const last = db
      .select({ n: sql<number>`coalesce(max(${cues.position}), -1)` })
      .from(cues)
      .where(eq(cues.roomId, roomId))
      .get()
    const row = db
      .insert(cues)
      .values({
        roomId,
        position: (last?.n ?? -1) + 1,
        name: input.name ?? scene.name,
        sceneId: scene.id,
        fade: input.fade ?? null,
        trigger: input.trigger ?? 'go',
        delay: input.delay ?? 0,
      })
      .returning()
      .get()
    changed(roomId)
    return c.json(row, 201)
  })
  .openapi(updateCue, (c) => {
    const { roomId, cueId } = c.req.valid('param')
    const input = c.req.valid('json')
    const old = find(roomId, cueId)
    if (!old) return c.json({ error: 'Cue not found' }, 404)
    if (input.sceneId !== undefined && !findScene(roomId, input.sceneId)) {
      return c.json({ error: 'Scene not found' }, 404)
    }
    if (Object.keys(input).length === 0) return c.json(old, 200)
    const row = db.update(cues).set(input).where(eq(cues.id, cueId)).returning().get()
    changed(roomId)
    return c.json(row, 200)
  })
  .openapi(removeCue, (c) => {
    const { roomId, cueId } = c.req.valid('param')
    if (!find(roomId, cueId)) return c.json({ error: 'Cue not found' }, 404)
    db.delete(cues).where(eq(cues.id, cueId)).run()
    changed(roomId)
    return c.body(null, 204)
  })
  .openapi(getPlayback, (c) => {
    if (!findRoom(c.req.valid('param').roomId)) return c.json({ error: 'Room not found' }, 404)
    return c.json(playback.state(), 200)
  })
  .openapi(transport('go'), (c) => {
    const room = findRoom(c.req.valid('param').roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (!room.active) return c.json({ error: 'Activate the room to run its cues' }, 409)
    playback.invalidate()
    if (!playback.go()) return c.json({ error: 'There is no next cue' }, 409)
    return c.json(playback.state(), 200)
  })
  .openapi(transport('back'), (c) => {
    const room = findRoom(c.req.valid('param').roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (!room.active) return c.json({ error: 'Activate the room to run its cues' }, 409)
    playback.invalidate()
    if (!playback.back()) return c.json({ error: 'There is no previous cue' }, 409)
    return c.json(playback.state(), 200)
  })
  .openapi(transport('stop'), (c) => {
    const room = findRoom(c.req.valid('param').roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (!room.active) return c.json({ error: 'Activate the room to run its cues' }, 409)
    playback.stop()
    return c.json(playback.state(), 200)
  })
  .openapi(goCue, (c) => {
    const { roomId, cueId } = c.req.valid('param')
    const room = findRoom(roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (!room.active) return c.json({ error: 'Activate the room to run its cues' }, 409)
    playback.invalidate()
    if (!playback.goCue(cueId)) return c.json({ error: 'Cue not found' }, 404)
    return c.json(playback.state(), 200)
  })
