import { createRoute, z } from '@hono/zod-openapi'
import { defaultParams, EffectSchema, Generator, ParamsSchema } from '@stagehand/shared'
import { and, eq, ne, sql } from 'drizzle-orm'
import { db } from '../db'
import { effects, scenes } from '../db/schema'
import { createRouter } from '../lib/router'
import { errorResponse, jsonResponse as json } from '../lib/schemas'
import { playback } from '../playback'
import { broadcast } from '../ws'
import { findRoom, RoomParams } from './rooms'

const NameSchema = z.string().trim().min(1).max(100).openapi({ example: 'Fireplace' })

const EffectCreateSchema = z
  .object({
    name: NameSchema,
    generator: Generator,
    params: ParamsSchema.optional().openapi({
      description: 'The generator defaults when omitted',
    }),
    pad: z.boolean().optional(),
  })
  .openapi('EffectCreate')

const EffectUpdateSchema = z
  .object({
    name: NameSchema,
    params: ParamsSchema.openapi({ description: 'Merged into the stored parameters' }),
    pad: z.boolean(),
  })
  .partial()
  .openapi('EffectUpdate')

const EffectParams = RoomParams.extend({
  effectId: z.coerce
    .number()
    .int()
    .positive()
    .openapi({ param: { name: 'effectId', in: 'path' }, example: 1 }),
})

const listEffects = createRoute({
  method: 'get',
  path: '/rooms/{roomId}/effects',
  tags: ['Effects'],
  summary: 'List a room’s effects',
  request: { params: RoomParams },
  responses: {
    200: json('Effects, by name', z.array(EffectSchema)),
    404: errorResponse('No such room'),
  },
})

const addEffect = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/effects',
  tags: ['Effects'],
  summary: 'Add an effect',
  request: {
    params: RoomParams,
    body: { required: true, content: { 'application/json': { schema: EffectCreateSchema } } },
  },
  responses: {
    201: json('Effect added', EffectSchema),
    404: errorResponse('No such room'),
    409: errorResponse('Name already used in this room'),
  },
})

const updateEffect = createRoute({
  method: 'patch',
  path: '/rooms/{roomId}/effects/{effectId}',
  tags: ['Effects'],
  summary: 'Edit an effect',
  description: 'Takes effect on the output at once if the effect is running.',
  request: {
    params: EffectParams,
    body: { required: true, content: { 'application/json': { schema: EffectUpdateSchema } } },
  },
  responses: {
    200: json('Effect updated', EffectSchema),
    404: errorResponse('No such effect'),
    409: errorResponse('Name already used in this room'),
  },
})

const removeEffect = createRoute({
  method: 'delete',
  path: '/rooms/{roomId}/effects/{effectId}',
  tags: ['Effects'],
  summary: 'Remove an effect',
  description: 'Scenes that used it simply stop running it.',
  request: { params: EffectParams },
  responses: { 204: { description: 'Effect removed' }, 404: errorResponse('No such effect') },
})

const fireEffect = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/effects/{effectId}/fire',
  tags: ['Effects'],
  summary: 'Fire or toggle an effect over the scene',
  description:
    'A lightning strike fires again each time. Anything else starts, and stops when sent again. ' +
    'It adds to the scene and never replaces it.',
  request: { params: EffectParams },
  responses: {
    204: { description: 'Fired' },
    404: errorResponse('No such effect'),
    409: errorResponse('The room is not the active one'),
  },
})

const stopEffect = createRoute({
  method: 'post',
  path: '/rooms/{roomId}/effects/{effectId}/stop',
  tags: ['Effects'],
  summary: 'Stop a fired effect',
  request: { params: EffectParams },
  responses: { 204: { description: 'Stopped' }, 404: errorResponse('No such effect') },
})

const find = (roomId: number, id: number) =>
  db
    .select()
    .from(effects)
    .where(and(eq(effects.roomId, roomId), eq(effects.id, id)))
    .get()

function nameTaken(roomId: number, name: string, exceptId?: number) {
  const conditions = [eq(effects.roomId, roomId), sql`lower(${effects.name}) = lower(${name})`]
  if (exceptId !== undefined) conditions.push(ne(effects.id, exceptId))
  return !!db
    .select({ id: effects.id })
    .from(effects)
    .where(and(...conditions))
    .get()
}

const nameConflict = (name: string) => ({ error: `An effect named "${name}" exists in this room` })

const changed = (roomId: number) => {
  playback.invalidate()
  broadcast({ type: 'effects.changed', roomId })
}

export const effectRoutes = createRouter()
  .openapi(listEffects, (c) => {
    const { roomId } = c.req.valid('param')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    const rows = db
      .select()
      .from(effects)
      .where(eq(effects.roomId, roomId))
      .orderBy(sql`lower(${effects.name})`)
      .all()
    return c.json(rows, 200)
  })
  .openapi(addEffect, (c) => {
    const { roomId } = c.req.valid('param')
    const input = c.req.valid('json')
    if (!findRoom(roomId)) return c.json({ error: 'Room not found' }, 404)
    if (nameTaken(roomId, input.name)) return c.json(nameConflict(input.name), 409)
    const row = db
      .insert(effects)
      .values({
        roomId,
        name: input.name,
        generator: input.generator,
        params: input.params ?? defaultParams(input.generator),
        pad: input.pad ?? false,
      })
      .returning()
      .get()
    changed(roomId)
    return c.json(row, 201)
  })
  .openapi(updateEffect, (c) => {
    const { roomId, effectId } = c.req.valid('param')
    const { params, ...input } = c.req.valid('json')
    const old = find(roomId, effectId)
    if (!old) return c.json({ error: 'Effect not found' }, 404)
    if (input.name !== undefined && nameTaken(roomId, input.name, effectId)) {
      return c.json(nameConflict(input.name), 409)
    }
    const set = { ...input, ...(params ? { params: { ...old.params, ...params } } : {}) }
    if (Object.keys(set).length === 0) return c.json(old, 200)
    const row = db.update(effects).set(set).where(eq(effects.id, effectId)).returning().get()
    changed(roomId)
    return c.json(row, 200)
  })
  .openapi(removeEffect, (c) => {
    const { roomId, effectId } = c.req.valid('param')
    if (!find(roomId, effectId)) return c.json({ error: 'Effect not found' }, 404)
    db.transaction((tx) => {
      for (const s of tx.select().from(scenes).where(eq(scenes.roomId, roomId)).all()) {
        if (!s.effects.some((e) => e.effectId === effectId)) continue
        tx.update(scenes)
          .set({ effects: s.effects.filter((e) => e.effectId !== effectId) })
          .where(eq(scenes.id, s.id))
          .run()
      }
      tx.delete(effects).where(eq(effects.id, effectId)).run()
    })
    playback.stopEffect(effectId)
    changed(roomId)
    broadcast({ type: 'scenes.changed', roomId })
    return c.body(null, 204)
  })
  .openapi(fireEffect, (c) => {
    const { roomId, effectId } = c.req.valid('param')
    const room = findRoom(roomId)
    if (!room) return c.json({ error: 'Room not found' }, 404)
    if (!room.active) return c.json({ error: 'Activate the room to fire its effects' }, 409)
    if (!find(roomId, effectId)) return c.json({ error: 'Effect not found' }, 404)
    playback.invalidate()
    playback.fire(effectId)
    return c.body(null, 204)
  })
  .openapi(stopEffect, (c) => {
    const { roomId, effectId } = c.req.valid('param')
    if (!find(roomId, effectId)) return c.json({ error: 'Effect not found' }, 404)
    playback.stopEffect(effectId)
    return c.body(null, 204)
  })
