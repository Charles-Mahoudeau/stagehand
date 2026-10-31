import { z } from 'zod'
import { Slug } from './ids'

// A scene is a static look plus the library effects that run under it. Effects
// are referenced by id, so editing one changes every scene that uses it.

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i)

// One group's look in a scene. Heads aim at a target when one is set.
export const LookEntry = z.object({
  color: Hex,
  level: z.number().min(0).max(1),
  target: z.string().max(40).nullable().optional(),
})
export type LookEntry = z.infer<typeof LookEntry>

// Keyed by DMX address, as a string because JSON keys are.
export const Look = z.record(z.string().regex(/^\d+$/), LookEntry)
export type Look = z.infer<typeof Look>

export const SceneEffectRef = z.object({
  effectId: Slug,
  opacity: z.number().min(0).max(1),
})
export type SceneEffectRef = z.infer<typeof SceneEffectRef>

export const SceneSchema = z.object({
  id: Slug,
  roomId: Slug,
  name: z.string(),
  // A short label shown on the card, like "Night" or "Day".
  tag: z.string(),
  look: Look,
  effects: z.array(SceneEffectRef),
  // Seconds to crossfade in when the scene is called.
  fade: z.number().min(0).max(120),
})
export type SceneDef = z.infer<typeof SceneSchema>

export const CUE_TRIGGERS = ['go', 'follow'] as const

export const CueSchema = z.object({
  id: Slug,
  roomId: Slug,
  position: z.number().int(),
  name: z.string(),
  sceneId: Slug,
  // Seconds to crossfade in; null uses the scene's own.
  fade: z.number().min(0).max(120).nullable(),
  // `go` waits for the operator; `follow` starts by itself after the previous cue.
  trigger: z.enum(CUE_TRIGGERS),
  delay: z.number().min(0).max(600),
})
export type CueDef = z.infer<typeof CueSchema>

export const PlaybackState = z.object({
  cueId: Slug.nullable(),
  sceneId: Slug.nullable(),
  // Seconds left of the current crossfade, 0 when settled.
  fading: z.number(),
  // Fired one-shots and started effects, on top of the scene.
  overlays: z.array(z.object({ effectId: Slug, startedAt: z.number() })),
})
export type PlaybackState = z.infer<typeof PlaybackState>
