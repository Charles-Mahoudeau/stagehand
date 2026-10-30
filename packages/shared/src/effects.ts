import { z } from 'zod'

// Effect types and their parameters. An effect is one generator (what the
// light does over time) plus a set of parameters; the generators themselves
// are in engine.ts. The field tables here drive the editor's forms, so a new
// parameter only needs adding in one place.

export const GENERATORS = [
  'fire',
  'candle',
  'static',
  'breathe',
  'aurora',
  'lightning',
  'sunrise',
  'wave',
  'rainbow',
  'heartbeat',
  'eyes',
  'countdown',
  'orbit',
  'spot',
  'rotate',
] as const
export const Generator = z.enum(GENERATORS)
export type Generator = z.infer<typeof Generator>

export const EFFECT_KINDS = ['Ambience', 'One-shot', 'Rhythm', 'Story', 'Moving head'] as const
export type EffectKind = (typeof EFFECT_KINDS)[number]

export const SPREAD_MODES = ['same', 'front', 'back', 'out', 'radial', 'random'] as const
export type SpreadMode = (typeof SPREAD_MODES)[number]

// The path a head follows in the orbit effect.
export const ORBIT_SHAPES = ['circle', 'eight', 'sweep', 'random'] as const
export type OrbitShape = (typeof ORBIT_SHAPES)[number]

// One flash of a one-shot, in seconds. Several clips make a strike.
export const Clip = z.object({
  at: z.number().min(0).max(5),
  att: z.number().min(0.002).max(2),
  dur: z.number().min(0).max(2),
  dec: z.number().min(0.01).max(5),
  lvl: z.number().min(0).max(1),
  col: z
    .string()
    .regex(/^#[0-9a-f]{6}$/i)
    .optional(),
})
export type Clip = z.infer<typeof Clip>

export const BOLT: Clip[] = [
  { at: 0, att: 0.01, dur: 0.06, dec: 0.05, lvl: 1 },
  { at: 0.14, att: 0.01, dur: 0.04, dec: 0.04, lvl: 0.55 },
  { at: 0.3, att: 0.008, dur: 0.12, dec: 0.35, lvl: 1 },
  { at: 0.5, att: 0.25, dur: 0, dec: 1.1, lvl: 0.22, col: '#3a52c8' },
]

const Hex = z.string().regex(/^#[0-9a-f]{6}$/i)
const Unit = z.number().min(0).max(1)

// Every parameter any generator uses. Each generator reads only its own.
export const ParamsSchema = z
  .object({
    // Addresses of the groups it runs on; empty means all that suit it.
    groups: z.array(z.number().int().min(1).max(512)),
    speed: z.number().min(0.1).max(5),
    lo: Unit,
    hi: Unit,
    warm: Unit,
    depth: Unit,
    ember: z.number().min(0).max(0.5),
    color: Hex,
    c1: Hex,
    c2: Hex,
    period: z.number().min(1).max(30),
    ripple: z.number().min(0).max(3),
    level: Unit,
    dur: z.number().min(1).max(600),
    dir: z.enum(['front', 'back']),
    rate: z.number().min(0.02).max(3),
    spread: z.number().min(0).max(1.5),
    mode: z.enum(SPREAD_MODES),
    sharp: z.number().min(1).max(8),
    rev: z.boolean(),
    bpm: z.number().min(20).max(200),
    base: Unit,
    every: z.number().min(1).max(30),
    // A target's ID (slug) the heads aim at.
    target: z.string().max(40).nullable(),
    radius: z.number().min(1).max(90),
    shape: z.enum(ORBIT_SHAPES),
    // Tilt travel as a fraction of the pan travel.
    ratio: z.number().min(0.1).max(2),
    // Gobo wheel slot a head projects; 0 is the open (solid) slot.
    // Prism rotation from none (0) to the fastest the head can turn (1).
    spin: Unit,
    gobo: z.number().int().min(0).max(7),
    auto: z.boolean(),
    gapMin: z.number().min(0.5).max(300),
    gapMax: z.number().min(0.5).max(600),
    origin: z.enum(['left', 'right', 'rand', 'all']),
    step: z.number().min(0).max(0.3),
    jT: z.number().min(0).max(0.5),
    jL: z.number().min(0).max(0.8),
    clips: z.array(Clip).min(1).max(12),
  })
  .partial()
  .strict()
export type ParamsInput = z.infer<typeof ParamsSchema>

export type Params = Required<ParamsInput>

const BASE: Params = {
  groups: [],
  speed: 1,
  lo: 0.25,
  hi: 0.9,
  warm: 0.5,
  depth: 0.5,
  ember: 0.12,
  color: '#ffa033',
  c1: '#3a1c8f',
  c2: '#ff3d7a',
  period: 6,
  ripple: 1.2,
  level: 0.9,
  dur: 12,
  dir: 'front',
  rate: 0.5,
  spread: 0.6,
  mode: 'front',
  sharp: 2,
  rev: false,
  bpm: 52,
  base: 0.06,
  every: 4,
  target: null,
  radius: 20,
  shape: 'circle',
  ratio: 0.6,
  spin: 0.5,
  gobo: 0,
  auto: false,
  gapMin: 6,
  gapMax: 20,
  origin: 'rand',
  step: 0.03,
  jT: 0.03,
  jL: 0.15,
  clips: BOLT,
}

export type FieldFormat = 'pct' | 'x' | 's' | 'bpm' | 'hz' | 'deg' | 'n' | 'max'
export type Field =
  | { type: 'range'; label: string; min: number; max: number; step: number; format: FieldFormat }
  | { type: 'seg'; label: string; options: [string, string][] }
  | { type: 'color'; label: string }
  | { type: 'wheel'; label: string }
  | { type: 'switch'; label: string }
  | { type: 'groups'; label: string }
  | { type: 'target'; label: string }

const range = (
  label: string,
  min: number,
  max: number,
  step: number,
  format: FieldFormat,
): Field => ({ type: 'range', label, min, max, step, format })

export const FIELDS: Partial<Record<keyof Params, Field>> = {
  groups: { type: 'groups', label: 'Groups' },
  speed: range('Speed', 0.2, 3, 0.05, 'x'),
  lo: range('Min level', 0, 1, 0.01, 'pct'),
  hi: range('Max level', 0, 1, 0.01, 'pct'),
  warm: range('Warmth', 0, 1, 0.01, 'pct'),
  depth: range('Flicker depth', 0, 1, 0.01, 'pct'),
  ember: range('Embers', 0, 0.5, 0.01, 'pct'),
  color: { type: 'color', label: 'Color' },
  c1: { type: 'color', label: 'Low color' },
  c2: { type: 'color', label: 'High color' },
  period: range('Period', 2, 14, 0.5, 's'),
  ripple: range('Ripple', 0, 3, 0.05, 'n'),
  level: range('Level', 0, 1, 0.01, 'pct'),
  dur: range('Duration', 2, 120, 1, 's'),
  dir: {
    type: 'seg',
    label: 'Direction',
    options: [
      ['front', 'Stage first'],
      ['back', 'Back first'],
    ],
  },
  rate: range('Rate', 0.05, 1.5, 0.01, 'hz'),
  spread: range('Phase spread', 0, 1.5, 0.01, 'n'),
  mode: {
    type: 'seg',
    label: 'Spread order',
    options: [
      ['same', 'Same'],
      ['front', 'Front to back'],
      ['back', 'Back to front'],
      ['out', 'Center out'],
      ['radial', 'Radial'],
      ['random', 'Random'],
    ],
  },
  sharp: range('Sharpness', 1, 6, 0.1, 'n'),
  rev: { type: 'switch', label: 'Reverse' },
  bpm: range('Rate', 30, 180, 1, 'bpm'),
  base: range('Rest level', 0, 1, 0.01, 'pct'),
  every: range('Every', 1.5, 12, 0.1, 's'),
  target: { type: 'target', label: 'Aim at' },
  radius: range('Amplitude', 2, 60, 1, 'deg'),
  shape: {
    type: 'seg',
    label: 'Path',
    options: [
      ['circle', 'Circle'],
      ['eight', 'Figure 8'],
      ['sweep', 'Sweep'],
      ['random', 'Random'],
    ],
  },
  ratio: range('Height', 0.1, 2, 0.05, 'x'),
  spin: range('Speed', 0, 1, 0.01, 'max'),
  gobo: range('Gobo', 0, 7, 1, 'n'),
  auto: { type: 'switch', label: 'Repeat at random' },
  gapMin: range('Shortest gap', 1, 60, 1, 's'),
  gapMax: range('Longest gap', 1, 120, 1, 's'),
  origin: {
    type: 'seg',
    label: 'Strikes from',
    options: [
      ['left', 'Left'],
      ['right', 'Right'],
      ['rand', 'Random'],
      ['all', 'All'],
    ],
  },
  step: range('Travel across room', 0, 0.1, 0.005, 's'),
  jT: range('Start jitter', 0, 0.12, 0.005, 's'),
  jL: range('Level jitter', 0, 0.5, 0.01, 'pct'),
}

export type GeneratorInfo = {
  id: Generator
  name: string
  kind: EffectKind
  // Plays once and releases, instead of running until stopped.
  once: boolean
  description: string
  defaults: Partial<Params>
  // Fields that replace the shared ones for this generator.
  fields?: Partial<Record<keyof Params, Field>>
  // Form sections in the order the inspector shows them.
  sections: [string, (keyof Params)[]][]
}

export const GENERATOR_INFO: Record<Generator, GeneratorInfo> = {
  fire: {
    id: 'fire',
    name: 'Fireplace',
    kind: 'Ambience',
    once: false,
    description:
      'A warm glow that breathes slowly, flickers fast and throws an ember now and then.',
    defaults: {},
    sections: [
      ['Where', ['groups']],
      ['Motion', ['speed', 'depth', 'ember']],
      ['Level', ['lo', 'hi']],
      ['Color', ['warm']],
    ],
  },
  candle: {
    id: 'candle',
    name: 'Candle',
    kind: 'Ambience',
    once: false,
    description: 'One small flame: a narrow, nervous flicker.',
    defaults: { hi: 0.8, color: '#ffa033' },
    sections: [
      ['Where', ['groups']],
      ['Motion', ['speed']],
      ['Level', ['hi']],
      ['Color', ['color']],
    ],
  },
  static: {
    id: 'static',
    name: 'Static color',
    kind: 'Ambience',
    once: false,
    description: 'One steady color on the lights and moving heads, optionally aimed at a target.',
    defaults: { color: '#ffffff', level: 1 },
    sections: [
      ['Where', ['groups', 'target']],
      ['Level', ['level']],
      ['Color', ['color']],
    ],
  },
  breathe: {
    id: 'breathe',
    name: 'Breathing',
    kind: 'Ambience',
    once: false,
    description:
      'A color that swells and settles on the lights and moving heads, rolling from the stage to the back.',
    defaults: { color: '#2a4bd8', lo: 0.06, hi: 0.32 },
    sections: [
      ['Where', ['groups', 'target']],
      ['Motion', ['period', 'ripple']],
      ['Level', ['lo', 'hi']],
      ['Color', ['color']],
    ],
  },
  aurora: {
    id: 'aurora',
    name: 'Aurora',
    kind: 'Ambience',
    once: false,
    description: 'Slow drifting green, teal and violet, each group on its own wander.',
    defaults: { level: 0.8 },
    sections: [
      ['Where', ['groups']],
      ['Motion', ['speed']],
      ['Level', ['level']],
    ],
  },
  lightning: {
    id: 'lightning',
    name: 'Lightning strike',
    kind: 'One-shot',
    once: true,
    description:
      'A burst of cold flashes that runs across the room, then a blue afterglow. Every strike is different.',
    defaults: { color: '#dfe8ff' },
    sections: [
      ['Where', ['groups', 'origin']],
      ['Strike', ['step', 'jT', 'jL']],
      ['Color', ['color']],
      ['Repeat', ['auto', 'gapMin', 'gapMax']],
    ],
  },
  sunrise: {
    id: 'sunrise',
    name: 'Sunrise',
    kind: 'One-shot',
    once: true,
    description: 'Night blue turns to rose, orange and warm white, starting at the stage.',
    defaults: {},
    sections: [
      ['Where', ['groups']],
      ['Time', ['dur', 'dir']],
    ],
  },
  wave: {
    id: 'wave',
    name: 'Wave',
    kind: 'Rhythm',
    once: false,
    description: 'Two colors passing through the room as a wave, in any spatial order.',
    defaults: {},
    sections: [
      ['Where', ['groups']],
      ['Spread', ['mode', 'spread', 'rev']],
      ['Time', ['rate', 'sharp']],
      ['Color', ['c1', 'c2']],
    ],
  },
  rainbow: {
    id: 'rainbow',
    name: 'Rainbow chase',
    kind: 'Rhythm',
    once: false,
    description: 'Hue rotates around the color wheel while it travels across the groups.',
    defaults: { rate: 0.25, spread: 0.7 },
    sections: [
      ['Where', ['groups']],
      ['Spread', ['mode', 'spread']],
      ['Time', ['rate']],
      ['Level', ['level']],
    ],
  },
  heartbeat: {
    id: 'heartbeat',
    name: 'Heartbeat',
    kind: 'Story',
    once: false,
    description: 'A double thump, lub-dub, at a rate you can change live.',
    defaults: { color: '#ff1f1a' },
    sections: [
      ['Where', ['groups']],
      ['Time', ['bpm']],
      ['Level', ['base']],
      ['Color', ['color']],
    ],
  },
  eyes: {
    id: 'eyes',
    name: 'Eyes in the forest',
    kind: 'Story',
    once: false,
    description: 'Every few seconds one wall blinks red twice, then goes dark.',
    defaults: { color: '#ff2a1a' },
    sections: [
      ['Where', ['groups']],
      ['Time', ['every']],
      ['Level', ['level']],
      ['Color', ['color']],
    ],
  },
  countdown: {
    id: 'countdown',
    name: 'Countdown fade',
    kind: 'Story',
    once: true,
    description: 'Light drains over a set time and turns red at the end.',
    defaults: { dur: 10, c1: '#ffe2b0', c2: '#ff2a1a' },
    sections: [
      ['Where', ['groups']],
      ['Time', ['dur']],
      ['Color', ['c1', 'c2']],
    ],
  },
  orbit: {
    id: 'orbit',
    name: 'Orbit',
    kind: 'Moving head',
    once: false,
    description:
      'The heads travel a path around a target: a circle, a figure 8, a sweep or a random wander.',
    defaults: { color: '#cfe0ff', level: 0.8, speed: 0.5, spread: 0.5 },
    sections: [
      ['Where', ['groups', 'target']],
      ['Motion', ['shape', 'speed', 'radius', 'ratio', 'spread', 'rev']],
      ['Level', ['level']],
      ['Color', ['color']],
    ],
  },
  spot: {
    id: 'spot',
    name: 'Spot on a target',
    kind: 'Moving head',
    once: false,
    description: 'The heads aim at a target and hold, with a faint pulse.',
    defaults: { color: '#e6ecff', level: 0.9 },
    sections: [
      ['Where', ['groups', 'target']],
      ['Level', ['level']],
      ['Color', ['color']],
    ],
  },
  rotate: {
    id: 'rotate',
    name: 'Rotating',
    kind: 'Moving head',
    once: false,
    description:
      "Turns the heads' rotating prism and gobo at a speed you choose, with a color, optionally aimed at a target.",
    defaults: { color: '#ffffff', level: 1 },
    fields: { color: { type: 'wheel', label: 'Color' } },
    sections: [
      ['Where', ['groups', 'target']],
      ['Motion', ['spin']],
      ['Filter', ['gobo']],
      ['Level', ['level']],
      ['Color', ['color']],
    ],
  },
}

// A generator's parameters with the defaults filled in.
export function resolveParams(generator: Generator, params: ParamsInput | undefined): Params {
  return { ...BASE, ...GENERATOR_INFO[generator].defaults, ...params }
}

// What an effect stores: only what differs from the generator's defaults is
// not needed, so it keeps the full set the generator reads.
export function defaultParams(generator: Generator): ParamsInput {
  const resolved = resolveParams(generator, undefined)
  const keys = GENERATOR_INFO[generator].sections.flatMap(([, ks]) => ks)
  const out: Record<string, unknown> = {}
  for (const k of keys) out[k] = resolved[k]
  if (generator === 'lightning') out.clips = resolved.clips
  return out as ParamsInput
}

export const EffectSchema = z.object({
  id: z.number().int(),
  roomId: z.number().int(),
  name: z.string(),
  generator: Generator,
  params: ParamsSchema,
  // Shown as a pad on the Perform page.
  pad: z.boolean(),
})
export type EffectDef = z.infer<typeof EffectSchema>

// Seconds a one-shot takes from start to its last light, or null when it runs until stopped.
export function effectDuration(generator: Generator, params: Params): number | null {
  switch (generator) {
    case 'lightning': {
      if (params.auto) return null
      const last = Math.max(...params.clips.map((c) => c.at + c.att + c.dur + c.dec * 4))
      return last + params.step * 6 + params.jT
    }
    case 'sunrise':
    case 'countdown':
      return params.dur
    default:
      return null
  }
}
