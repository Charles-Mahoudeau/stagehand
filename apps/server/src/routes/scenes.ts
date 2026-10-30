import { createRoute, z } from '@hono/zod-openapi'
import { Look, SceneEffectRef, SceneSchema } from '@stagehand/shared'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { db } from '../db'
import { effects, scenes } from '../db/schema'
import { createRouter } from '../lib/router'
import { errorResponse, jsonResponse as json } from '../lib/schemas'
import { playback } from '../playback'
import { broadcast } from '../ws'
import { findRoom, RoomParams } from './rooms'

const NameSchema = z.string().trim().min(1).max(100).openapi({ example: 'Night' })
const FadeSchema = z.number().min(0).max(120)

const SceneCreateSchema = z
  .object({
    name: NameSchema,
    tag: z.string().trim().max(24).optional(),
    look: Look.optional(),
    effects: z.array(SceneEffectRef).optional(),
    fade: FadeSchema.optional(),
  })
  .openapi('SceneCreate')

const SceneUpdateSchema = z
  .object({
    name: NameSchema,
    tag: z.string().trim().max(24),
    look: Look.openapi({ description: 'Replaces the whole look' }),
    effects: z.array(SceneEffectRef).openapi({ description: 'Replaces the list of effects' }),
    fade: FadeSchema,
  })
  .partial()
  .openapi('SceneUpdate')

const SceneParams = RoomParams.extend({
  sceneId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'sceneId', in: 'path' }, example: 1 }),
})

const listScenes = createRoute({
  method: 'get',
  path: '/rooms/{roomId}/scenes',
  tags: ['Scenes'],
  summary: 'List a room’s scenes',
  request: { params: RoomParams },
  responses: {
    200: json('Scenes, by name', z.array(SceneSchema)),
    404: errorResponse('No such room'),
  },
})

const addScene = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/scenes',
  tags: ['Scenes'],
  summary: 'Add a scene',
  request: {
    params: RoomParams,
    body: { required: true, content: { 'application/json': { schema: SceneCreateSchema } } },
  },
  responses: {
    201: json('Scene added', SceneSchema),
    400: errorResponse('An effect is not in this room'),
    404: errorResponse('No such room'),
    409: errorResponse('Name already used in this room'),
  },
})

const updateScene = createRoute({
  method: 'patch',
  path: '/rooms/{roomId}/scenes/{sceneId}',
  tags: ['Scenes'],
  summary: 'Edit a scene',
  description: 'Takes effect on the output at once if the scene is playing.',
  request: {
    params: SceneParams,
    body: { required: true, content: { 'application/json': { schema: SceneUpdateSchema } } },
  },
  responses: {
    200: json('Scene updated', SceneSchema),
    400: errorResponse('An effect is not in this room'),
    404: errorResponse('No such scene'),
    409: errorResponse('Name already used in this room'),
  },
})

const removeScene = createRoute({
  method: 'delete',
  path: '/rooms/{roomId}/scenes/{sceneId}',
  tags: ['Scenes'],
  summary: 'Remove a scene',
  description: 'Its cues are removed too.',
  request: { params: SceneParams },
  responses: { 204: { description: 'Scene removed' }, 404: errorResponse('No such scene') },
})

const goScene = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/scenes/{sceneId}/go',
  tags: ['Scenes'],
  summary: 'Play a scene outside the cue list',
  request: { params: SceneParams },
  responses: {
    204: { description: 'Playing' },
    404: errorResponse('No such scene'),
    409: errorResponse('The room is not the active one'),
  },
})

const find = (roomId: number, id: number) =>
  db
    .select()
    .from(scenes)
    .where(and(eq(scenes.roomId, roomId), eq(scenes.id, id)))
    .get()

function nameTaken(roomId: number, name: string, exceptId?: number) {
  const conditions = [eq(scenes.roomId, roomId), sql`lower(${scenes.name}) = lower(${name})`]
  if (exceptId !== undefined) conditions.push(ne(scenes.id, exceptId))
  return !!db
    .select({ id: scenes.id })
    .from(scenes)
    .where(and(...conditions))
    .get()
}

const nameConflict = (name: string) => ({ error: `A scene named "${name}" exists in this room` })

// True when every referenced effect belongs to the room.
function effectsExist(roomId: number, refs: { effectId: number }[]) {
  const ids = [...new Set(refs.map((r) => r.effectId))]
  if (ids.length === 0) return true
  const found = db
    .select({ id: effects.id })
    .from(effects)
    .where(and(eq(effects.roomId, roomId), inArray(effects.id, ids)))
    .all()
  return found.length === ids.length
}

const changed = (roomId: number) => {
  playback.invalidate()
  broadcast({ type: 'scenes.changed', roomId })
}

export const sceneRoutes = createRouter()
  .openapi(listScenes, (c) => {
    const { roomId } = c.req.valid('param')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    const rows = db
      .select()
      .from(scenes)
      .where(eq(scenes.roomId, roomId))
      .orderBy(sql`lower(${scenes.name})`)
      .all()
    return c.json(rows, 200)
  })
  .openapi(addScene, (c) => {
    const { roomId } = c.req.valid('param')
    const input = c.req.valid('json')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    if (nameTaken(roomId, input.name)) return c.json(nameConflict(input.name), 409)
    if (!effectsExist(roomId, input.effects ?? [])) {
      return c.json({ error: 'An effect is not in this room' }, 400)
    }
    const row = db
      .insert(scenes)
      .values({
        roomId,
        name: input.name,
        tag: input.tag ?? '',
        look: input.look ?? {},
        effects: input.effects ?? [],
        fade: input.fade ?? 2,
      })
      .returning()
      .get()
    changed(roomId)
    return c.json(row, 201)
  })
  .openapi(updateScene, (c) => {
    const { roomId, sceneId } = c.req.valid('param')
    const input = c.req.valid('json')
    const old = find(roomId, sceneId)
    if (!old) return c.json({ error: 'Scene not found' }, 404)
    if (input.name !== undefined && nameTaken(roomId, input.name, sceneId)) {
      return c.json(nameConflict(input.name), 409)
    }
    if (input.effects && !effectsExist(roomId, input.effects)) {
      return c.json({ error: 'An effect is not in this room' }, 400)
    }
    if (Object.keys(input).length === 0) return c.json(old, 200)
    const row = db.update(scenes).set(input).where(eq(scenes.id, sceneId)).returning().get()
    changed(roomId)
    return c.json(row, 200)
  })
  .openapi(removeScene, (c) => {
    const { roomId, sceneId } = c.req.valid('param')
    if (!find(roomId, sceneId)) return c.json({ error: 'Scene not found' }, 404)
    db.delete(scenes).where(eq(scenes.id, sceneId)).run()
    changed(roomId)
    broadcast({ type: 'cues.changed', roomId })
    return c.body(null, 204)
  })
  .openapi(goScene, (c) => {
    const { roomId, sceneId } = c.req.valid('param')
    const room = findRoom(roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (!room.active) return c.json({ error: 'Activate the room to play its scenes' }, 409)
    if (!find(roomId, sceneId)) return c.json({ error: 'Scene not found' }, 404)
    playback.invalidate()
    playback.goScene(sceneId)
    return c.body(null, 204)
  })
