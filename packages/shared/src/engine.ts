import { type Generator, type Params, SPREAD_MODES } from './effects'

// A pure light simulator: given a time and the groups of a room, each generator
// says what color every group shows. The server runs it for the DMX output.
// Nothing here knows about DMX, the database or the clock.

export type RGB = [number, number, number]

// A group of fixtures that share one DMX address and so always show the same thing.
export type Unit = {
  address: number
  // Position as fractions of the room: x 0 is the left wall, y 0 is the stage side.
  x: number
  y: number
  mover: boolean
  // Which wall it hangs on, for effects that favor one side.
  side: -1 | 0 | 1
}

// Where a head should point: a target's stored position, nudged by degrees.
export type Aim = { target: string; dPan: number; dTilt: number }

// `gobo` is a gobo wheel slot for a head; undefined leaves the wheel alone.
// `prism` is the rotating prism's speed from 0 (not turning) to 1 (the head's fastest).
export type UnitOut = { c: RGB; aim: Aim | null; gobo?: number; prism?: number }
export type Frame = Map<number, UnitOut>

// One firing of a one-shot. `ox` is where it starts across the room, 0 to 1.
export type Strike = { t0: number; seed: number; ox: number }

const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
const noise = (x: number) => {
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return hash(i) * (1 - u) + hash(i + 1) * u
}
const gauss = (x: number, c: number, w: number) => Math.exp(-(((x - c) / w) ** 2))

export const hexToRgb = (h: string): RGB => [
  Number.parseInt(h.slice(1, 3), 16) / 255,
  Number.parseInt(h.slice(3, 5), 16) / 255,
  Number.parseInt(h.slice(5, 7), 16) / 255,
]
export const rgbToHex = (c: RGB): string =>
  `#${c
    .map((x) =>
      Math.round(clamp(x) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`

const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k]
const mix = (a: RGB, b: RGB, t: number): RGB => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
]
const BLACK: RGB = [0, 0, 0]

type Stop = [number, RGB]
const ramp = (stops: Stop[], t: number): RGB => {
  const x = clamp(t)
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1] as Stop
    const b = stops[i] as Stop
    if (x <= b[0]) return mix(a[1], b[1], (x - a[0]) / (b[0] - a[0] || 1))
  }
  return (stops[stops.length - 1] as Stop)[1]
}

const hsv = (h: number, s: number, v: number): RGB => {
  const hh = ((h % 1) + 1) % 1
  const i = Math.floor(hh * 6)
  const f = hh * 6 - i
  const p = v * (1 - s)
  const q = v * (1 - f * s)
  const t = v * (1 - (1 - f) * s)
  const table: RGB[] = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q],
  ]
  return table[i % 6] as RGB
}

// The brightest channel, which is what a head's dimmer follows.
export const peak = (c: RGB) => Math.max(c[0], c[1], c[2])

const FIRE: Stop[] = [
  [0, [0, 0, 0]],
  [0.18, [0.16, 0.015, 0]],
  [0.45, [0.62, 0.14, 0]],
  [0.75, [1, 0.42, 0.04]],
  [1, [1, 0.78, 0.4]],
]
const SUN: Stop[] = [
  [0, [0, 0, 0.03]],
  [0.2, [0.05, 0.03, 0.22]],
  [0.45, [0.55, 0.12, 0.18]],
  [0.7, [1, 0.45, 0.12]],
  [1, [1, 0.8, 0.5]],
]
const AURORA: Stop[] = [
  [0, [0, 0.5, 0.2]],
  [0.5, [0, 0.7, 0.6]],
  [1, [0.45, 0.15, 0.8]],
]

export const emptyFrame = (units: Unit[]): Frame => {
  const f: Frame = new Map()
  for (const u of units) f.set(u.address, { c: [0, 0, 0], aim: null })
  return f
}

// Adds `src` over `dst`, scaled by opacity. Overlays always add, never replace.
export function addFrame(dst: Frame, src: Frame, opacity = 1) {
  for (const [a, s] of src) {
    const d = dst.get(a)
    if (!d) continue
    d.c = [
      Math.min(1, d.c[0] + s.c[0] * opacity),
      Math.min(1, d.c[1] + s.c[1] * opacity),
      Math.min(1, d.c[2] + s.c[2] * opacity),
    ]
    if (s.aim) d.aim = s.aim
    if (s.gobo !== undefined) d.gobo = s.gobo
    if (s.prism !== undefined) d.prism = s.prism
  }
}

// Crossfades from `a` to `b` by k (0 is all a), into a new frame. A head with
// an aim in only one of them keeps that aim.
export function mixFrames(units: Unit[], a: Frame, b: Frame, k: number): Frame {
  const out: Frame = new Map()
  for (const u of units) {
    const x = a.get(u.address)
    const y = b.get(u.address)
    out.set(u.address, {
      c: mix(x?.c ?? BLACK, y?.c ?? BLACK, k),
      aim: (k >= 0.5 ? (y?.aim ?? x?.aim) : (x?.aim ?? y?.aim)) ?? null,
      gobo: k >= 0.5 ? (y?.gobo ?? x?.gobo) : (x?.gobo ?? y?.gobo),
      prism: k >= 0.5 ? (y?.prism ?? x?.prism) : (x?.prism ?? y?.prism),
    })
  }
  return out
}

const everyone = (units: Unit[], p: Params) =>
  units.filter((u) => p.groups.length === 0 || p.groups.includes(u.address))

const targets = (units: Unit[], p: Params, wantMovers: boolean) =>
  units.filter(
    (u) => u.mover === wantMovers && (p.groups.length === 0 || p.groups.includes(u.address)),
  )

// How far along a spread order a group sits, 0 to 1ish.
function orderOf(u: Unit, mode: Params['mode'], index: number): number {
  switch (mode) {
    case 'same':
      return 0
    case 'front':
      return u.y
    case 'back':
      return 1 - u.y
    case 'out':
      return Math.abs(u.x - 0.5) * 2
    case 'radial':
      return Math.hypot(u.x - 0.5, (u.y - 0.5) * 0.8) * 1.1
    case 'random':
      return hash(index * 7.3 + 1)
    default:
      return u.y
  }
}
export const isSpreadMode = (m: string): m is Params['mode'] =>
  (SPREAD_MODES as readonly string[]).includes(m)

function each(list: Unit[], units: Unit[], f: (u: Unit, s: number) => RGB | UnitOut): Frame {
  const out: Frame = new Map()
  for (const u of list) {
    const r = f(u, units.indexOf(u))
    out.set(u.address, Array.isArray(r) ? { c: r, aim: null } : r)
  }
  return out
}

// Every clip of every live strike, staggered across the room by distance from its origin.
function lightning(t: number, p: Params, units: Unit[], strikes: Strike[]): Frame {
  const out: Frame = new Map()
  const col = hexToRgb(p.color)
  for (const u of units) {
    if (p.groups.length > 0 && !p.groups.includes(u.address)) continue
    const gain = u.mover ? 0.5 : 1
    let v = 0
    let c: RGB = col
    for (const s of strikes) {
      p.clips.forEach((clip, i) => {
        const dt = (hash(s.seed + i) - 0.5) * 2 * p.jT
        const dl = 1 + (hash(s.seed + i + 50) - 0.5) * 2 * p.jL
        const tau = t - s.t0 - p.step * Math.abs(u.x - s.ox) * 6 - (clip.at + dt)
        if (tau < 0) return
        const x =
          tau < clip.att
            ? tau / (clip.att || 1e-3)
            : tau < clip.att + clip.dur
              ? 1
              : Math.exp(-(tau - clip.att - clip.dur) / clip.dec)
        const k = x * clip.lvl * dl * gain
        if (k > v) {
          v = k
          c = clip.col ? hexToRgb(clip.col) : col
        }
      })
    }
    if (v > 0.004) out.set(u.address, { c: scale(c, clamp(v)), aim: null })
  }
  return out
}

// Where a strike starts across the room, from its seed and the effect's setting.
export function strikeOrigin(origin: Params['origin'], seed: number): number {
  if (origin === 'left') return 0
  if (origin === 'right') return 1
  if (origin === 'all') return 0.5
  return hash(seed * 3.3) < 0.5 ? 0 : 1
}

/**
 * What a generator shows at time `t`, in seconds since it started.
 * `strikes` only matters to the one-shots that fire (lightning).
 */
export function evalEffect(
  generator: Generator,
  p: Params,
  t: number,
  units: Unit[],
  strikes: Strike[] = [],
): Frame {
  const pars = () => targets(units, p, false)
  const heads = () => targets(units, p, true)
  switch (generator) {
    case 'fire':
      return each(pars(), units, (_u, s) => {
        const glow = ramp(
          FIRE,
          lerp(p.lo, p.hi, noise(t * p.speed * 0.5 + s * 9.1)) + (p.warm - 0.5) * 0.3,
        )
        const flick = 1 - p.depth * (1 - noise(t * p.speed * 6 + s * 3.3))
        const r = t * p.speed * 2.2
        const k = Math.floor(r)
        const ember = hash(k * 1.7 + s * 31) > 1 - p.ember ? Math.exp(-(r - k) * 4.5) : 0
        return [
          Math.min(1, glow[0] * flick + ember * 0.9),
          Math.min(1, glow[1] * flick + ember * 0.42),
          Math.min(1, glow[2] * flick + ember * 0.07),
        ]
      })
    case 'candle':
      return each(pars(), units, (_u, s) => {
        const i = clamp(
          0.45 + 0.3 * noise(t * p.speed * 3 + s * 5) + 0.25 * noise(t * p.speed * 13 + s),
        )
        return scale(hexToRgb(p.color), i * p.hi)
      })
    case 'static':
      return each(everyone(units, p), units, (u) => ({
        c: scale(hexToRgb(p.color), p.level),
        aim: u.mover && p.target ? { target: p.target, dPan: 0, dTilt: 0 } : null,
      }))
    case 'breathe':
      return each(everyone(units, p), units, (u) => {
        const v = 0.5 + 0.5 * Math.sin((t * Math.PI * 2) / p.period - u.y * p.ripple)
        return {
          c: scale(hexToRgb(p.color), lerp(p.lo, p.hi, v)),
          aim: u.mover && p.target ? { target: p.target, dPan: 0, dTilt: 0 } : null,
        }
      })
    case 'aurora':
      return each(pars(), units, (_u, s) => {
        const n = noise(t * 0.3 * p.speed + s * 4.7)
        const m = noise(t * 0.2 * p.speed + s * 9)
        return scale(ramp(AURORA, n), 0.15 + 0.6 * m * p.level)
      })
    case 'heartbeat':
      return each(pars(), units, () => {
        const f = ((t * p.bpm) / 60) % 1
        const v = gauss(f, 0.03, 0.045) + 0.7 * gauss(f, 0.2, 0.05)
        return scale(hexToRgb(p.color), clamp(p.base + v * (1 - p.base)))
      })
    case 'sunrise': {
      const s = clamp(t / p.dur)
      return each(pars(), units, (u) => {
        const d = p.dir === 'back' ? 1 - u.y : u.y
        return ramp(SUN, clamp(s * 1.55 - d * 0.55))
      })
    }
    case 'wave':
      return each(pars(), units, (u, s) => {
        const ph = t * p.rate - orderOf(u, p.mode, s) * p.spread * (p.rev ? -1 : 1)
        const i = (0.5 + 0.5 * Math.cos(ph * Math.PI * 2)) ** p.sharp
        return mix(scale(hexToRgb(p.c1), 0.22), hexToRgb(p.c2), i)
      })
    case 'rainbow':
      return each(pars(), units, (u, s) =>
        hsv(t * p.rate - orderOf(u, p.mode, s) * p.spread, 1, p.level),
      )
    case 'eyes': {
      const seg = Math.floor(t / p.every)
      const side = hash(seg * 5.3) < 0.5 ? -1 : 1
      const tau = t - seg * p.every
      const on = (tau > 0.25 && tau < 0.8) || (tau > 0.95 && tau < 1.7)
      return each(pars(), units, (u) =>
        u.side === side && on ? scale(hexToRgb(p.color), p.level) : [0, 0, 0],
      )
    }
    case 'countdown': {
      const s = clamp(t / p.dur)
      const k = clamp((s - 0.65) / 0.35)
      return each(pars(), units, () => scale(mix(hexToRgb(p.c1), hexToRgb(p.c2), k), 1 - 0.75 * s))
    }
    case 'lightning':
      return lightning(t, p, units, strikes)
    case 'orbit': {
      const list = heads()
      return each(list, units, (u) => {
        const i = list.indexOf(u)
        const a = t * p.speed * 0.5 * (p.rev ? -1 : 1) + i * p.spread * Math.PI * 2
        let x: number
        let y: number
        if (p.shape === 'eight') [x, y] = [Math.sin(a), Math.sin(2 * a)]
        else if (p.shape === 'sweep') [x, y] = [Math.sin(a), 0]
        else if (p.shape === 'random') {
          const n = t * p.speed * 0.25 * (p.rev ? -1 : 1)
          ;[x, y] = [noise(n + i * 37.3) * 2 - 1, noise(n + i * 71.9 + 500) * 2 - 1]
        } else [x, y] = [Math.cos(a), Math.sin(a)]
        const aim = p.target
          ? { target: p.target, dPan: p.radius * x, dTilt: p.radius * p.ratio * y }
          : null
        return { c: scale(hexToRgb(p.color), p.level), aim }
      })
    }
    case 'rotate':
      return each(heads(), units, () => ({
        c: scale(hexToRgb(p.color), p.level),
        aim: p.target ? { target: p.target, dPan: 0, dTilt: 0 } : null,
        gobo: p.gobo,
        prism: p.spin,
      }))
    case 'spot':
      return each(heads(), units, () => ({
        c: scale(hexToRgb(p.color), p.level * (0.9 + 0.1 * Math.sin(t * 2))),
        aim: p.target ? { target: p.target, dPan: 0, dTilt: 0 } : null,
      }))
  }
}
