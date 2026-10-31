import {
  type Aim,
  addFrame,
  type CueDef,
  coarseFine,
  type EffectDef,
  effectDuration,
  emptyFrame,
  evalEffect,
  type Frame,
  hexToRgb,
  MAX_16,
  mixFrames,
  PAN_RANGE,
  type PlaybackState,
  peak,
  resolveParams,
  type SceneDef,
  type Strike,
  strikeOrigin,
  TILT_RANGE,
  type Unit,
  WHEEL_COLORS,
  WHEEL_STEP,
} from '@stagehand/shared'
import { eq } from 'drizzle-orm'
import { db } from './db'
import { cues, effects, fixtures, rooms, scenes, targetPositions } from './db/schema'
import { dmxOutput } from './dmx'
import { broadcast } from './ws'

const TICK_MS = 25
// How stale the cached rows may get; routes also invalidate on every edit.
const CACHE_MS = 500
// Seconds an overlay takes to fade out once it ends or is stopped.
const RELEASE = 0.6

type FixtureRow = typeof fixtures.$inferSelect

type Cache = {
  loadedAt: number
  roomId: string
  fixtures: FixtureRow[]
  units: Unit[]
  effects: Map<string, EffectDef>
  scenes: Map<string, SceneDef>
  cues: CueDef[]
  // `${targetId}:${fixtureId}` to the head's pan/tilt for that target.
  positions: Map<string, { pan: number; tilt: number }>
}

// A running copy of an effect: in a scene, or fired from a pad.
type Instance = {
  id: number
  effectId: string
  start: number
  opacity: number
  strikes: Strike[]
  nextAuto: number | null
  // When it was told to stop, to fade it out.
  releaseAt: number | null
}

type SceneRun = { sceneId: string; start: number; instances: Instance[] }

const now = () => performance.now() / 1000
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const smooth = (x: number) => x * x * (3 - 2 * x)

let nextInstanceId = 1

// Runs the cue list: the current scene's look and effects, a crossfade from the
// last one, and any fired overlays added on top. It owns the DMX channels of
// the active room's fixtures while it runs, and every tick reads effects and
// scenes fresh, so edits show up on the output at once.
class Playback {
  private timer: ReturnType<typeof setInterval> | null = null
  private cache: Cache | null = null
  private dirty = true
  private scene: SceneRun | null = null
  // What the output faded from: the previous scene still running, or a frozen frame.
  private from: SceneRun | Frame | null = null
  private fadeStart = 0
  private fadeDur = 0
  private cueId: string | null = null
  private cueStart = 0
  private overlays: Instance[] = []
  private lastFrame: Frame | null = null
  private lastKey = ''

  // Cached rows are stale after any edit to effects, scenes, cues or fixtures.
  invalidate() {
    this.dirty = true
  }

  state(): PlaybackState {
    const t = now()
    return {
      cueId: this.cueId,
      sceneId: this.scene?.sceneId ?? null,
      fading: this.fadeDur > 0 ? Math.max(0, this.fadeStart + this.fadeDur - t) : 0,
      overlays: this.overlays
        .filter((o) => o.releaseAt === null)
        .map((o) => ({ effectId: o.effectId, startedAt: o.start })),
    }
  }

  isRunning() {
    return this.timer !== null
  }

  // Calls the next cue, or the first when none has been called. Null at the end of the list.
  go() {
    const c = this.load()
    if (!c) return null
    const i = this.cueId === null ? -1 : c.cues.findIndex((q) => q.id === this.cueId)
    const next = c.cues[i + 1]
    if (!next) return null
    this.callCue(next)
    return next
  }

  back() {
    const c = this.load()
    if (!c || this.cueId === null) return null
    const i = c.cues.findIndex((q) => q.id === this.cueId)
    const prev = c.cues[i - 1]
    if (!prev) return null
    this.callCue(prev)
    return prev
  }

  goCue(cueId: string) {
    const cue = this.load()?.cues.find((q) => q.id === cueId)
    if (!cue) return null
    this.callCue(cue)
    return cue
  }

  // Calls a scene on its own, outside the cue list.
  goScene(sceneId: string) {
    const scene = this.load()?.scenes.get(sceneId)
    if (!scene) return null
    this.callScene(scene, scene.fade)
    this.cueId = null
    this.broadcastState()
    return scene
  }

  // Starts an effect on top of the scene. A one-shot like lightning can be fired again
  // while it plays; anything else is started once and left to run until stopped.
  fire(effectId: string) {
    const c = this.load()
    const effect = c?.effects.get(effectId)
    if (!c || !effect) return null
    const p = resolveParams(effect.generator, effect.params)
    const running = this.overlays.find((o) => o.effectId === effectId && o.releaseAt === null)
    const fresh = this.instance(effect, now(), 1)
    if (effect.generator === 'lightning') {
      if (!p.auto) fresh.strikes.push(this.strike(p.origin, 0))
      else if (running) {
        this.stopEffect(effectId)
        this.broadcastState()
        return effect
      }
    } else if (running) {
      // Starting a running effect again stops it, like a toggle pad.
      this.stopEffect(effectId)
      this.broadcastState()
      return effect
    }
    this.overlays.push(fresh)
    this.begin()
    this.broadcastState()
    return effect
  }

  stopEffect(effectId: string) {
    const t = now()
    for (const o of this.overlays) {
      if (o.effectId === effectId && o.releaseAt === null) o.releaseAt = t
    }
    this.broadcastState()
  }

  // Releases everything and blacks the room's channels out.
  stop({ blackout = true } = {}) {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.scene = null
    this.from = null
    this.fadeDur = 0
    this.cueId = null
    this.overlays = []
    this.lastFrame = null
    if (blackout) dmxOutput.blackout()
    this.broadcastState()
  }

  private callCue(cue: CueDef) {
    const scene = this.cache?.scenes.get(cue.sceneId)
    if (!scene) return
    this.callScene(scene, cue.fade ?? scene.fade)
    this.cueId = cue.id
    this.broadcastState()
  }

  private callScene(scene: SceneDef, fade: number) {
    const c = this.cache
    if (!c) return
    const t = now()
    // Fading out of a half-finished fade would jump; freeze what is on the output.
    const fading = this.fadeDur > 0 && t < this.fadeStart + this.fadeDur
    this.from = fading ? this.lastFrame : this.scene
    this.fadeStart = t
    this.fadeDur = fade
    this.cueStart = t
    this.scene = {
      sceneId: scene.id,
      start: t,
      instances: scene.effects.flatMap((ref) => {
        const e = c.effects.get(ref.effectId)
        return e ? [this.instance(e, t, ref.opacity)] : []
      }),
    }
    this.begin()
  }

  private instance(effect: EffectDef, start: number, opacity: number): Instance {
    const p = resolveParams(effect.generator, effect.params)
    return {
      id: nextInstanceId++,
      effectId: effect.id,
      start,
      opacity,
      strikes: [],
      nextAuto: effect.generator === 'lightning' && p.auto ? start + 0.6 : null,
      releaseAt: null,
    }
  }

  private strike(origin: Parameters<typeof strikeOrigin>[0], t0: number): Strike {
    const seed = Math.random() * 1000
    return { t0, seed, ox: strikeOrigin(origin, seed) }
  }

  private begin() {
    if (this.timer) return
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.tick()
  }

  // Cached rows for the active room, reloaded when edited or stale.
  private load(): Cache | null {
    const t = now()
    if (this.cache && !this.dirty && t * 1000 - this.cache.loadedAt < CACHE_MS) return this.cache
    const room = db.select().from(rooms).where(eq(rooms.active, true)).get()
    if (!room) {
      this.cache = null
      return null
    }
    const fx = db.select().from(fixtures).where(eq(fixtures.roomId, room.id)).all()
    const positions = new Map<string, { pan: number; tilt: number }>()
    for (const tp of db
      .select()
      .from(targetPositions)
      .where(eq(targetPositions.roomId, room.id))
      .all()) {
      positions.set(`${tp.targetId}:${tp.fixtureId}`, { pan: tp.pan, tilt: tp.tilt })
    }
    this.cache = {
      loadedAt: t * 1000,
      roomId: room.id,
      fixtures: fx,
      units: unitsOf(fx),
      effects: new Map(
        db
          .select()
          .from(effects)
          .where(eq(effects.roomId, room.id))
          .all()
          .map((e) => [e.id, e]),
      ),
      scenes: new Map(
        db
          .select()
          .from(scenes)
          .where(eq(scenes.roomId, room.id))
          .all()
          .map((s) => [s.id, s]),
      ),
      cues: db.select().from(cues).where(eq(cues.roomId, room.id)).orderBy(cues.position).all(),
      positions,
    }
    this.dirty = false
    return this.cache
  }

  private tick() {
    const c = this.load()
    if (!c) return this.stop({ blackout: false })
    if (!this.scene && this.overlays.length === 0) {
      // Nothing left to show; the channels are left as they are.
      if (this.timer) clearInterval(this.timer)
      this.timer = null
      return
    }
    const t = now()
    this.follow(c, t)

    const base = this.sceneFrame(c, this.scene, t)
    let frame = base
    if (this.scene && this.from && this.fadeDur > 0) {
      const k = (t - this.fadeStart) / this.fadeDur
      if (k >= 1) {
        this.from = null
        this.fadeDur = 0
      } else {
        const from = 'instances' in this.from ? this.sceneFrame(c, this.from, t) : this.from
        frame = mixFrames(c.units, from, base, smooth(clamp(k)))
      }
    }
    this.lastFrame = frame
    this.overlays = this.overlays.filter((o) => this.addOverlay(c, o, frame, t))
    writeFrame(c, frame)
    this.maybeBroadcast()
  }

  // A `follow` cue starts by itself `delay` seconds after the previous one began.
  private follow(c: Cache, t: number) {
    if (this.cueId === null) return
    const i = c.cues.findIndex((q) => q.id === this.cueId)
    const next = c.cues[i + 1]
    if (next?.trigger === 'follow' && t - this.cueStart >= next.delay) this.callCue(next)
  }

  private sceneFrame(c: Cache, run: SceneRun | null, t: number): Frame {
    const frame = emptyFrame(c.units)
    const scene = run && c.scenes.get(run.sceneId)
    if (!run || !scene) return frame
    for (const [address, look] of Object.entries(scene.look)) {
      const u = frame.get(Number(address))
      if (!u) continue
      const [r, g, b] = hexToRgb(look.color)
      u.c = [r * look.level, g * look.level, b * look.level]
      if (look.target) u.aim = { target: look.target, dPan: 0, dTilt: 0 }
    }
    for (const inst of run.instances) this.addInstance(c, inst, frame, t, run.start)
    return frame
  }

  // Adds one effect's frame; false once an overlay is finished and can be dropped.
  private addOverlay(c: Cache, o: Instance, frame: Frame, t: number) {
    const effect = c.effects.get(o.effectId)
    if (!effect) return false
    const p = resolveParams(effect.generator, effect.params)
    const dur = effectDuration(effect.generator, p)
    // Strikes fired from a pad end on their own; a held effect ends when stopped.
    const fired = effect.generator === 'lightning' && !p.auto
    let releaseAt = o.releaseAt
    if (releaseAt === null && dur !== null && (fired || effect.generator !== 'lightning')) {
      if (t - o.start >= dur) releaseAt = o.start + dur
    }
    const fade = releaseAt === null ? 1 : 1 - (t - releaseAt) / RELEASE
    if (fade <= 0) return false
    this.addInstance(c, o, frame, t, o.start, clamp(fade))
    return true
  }

  private addInstance(c: Cache, o: Instance, frame: Frame, t: number, start: number, fade = 1) {
    const effect = c.effects.get(o.effectId)
    if (!effect) return
    const p = resolveParams(effect.generator, effect.params)
    const local = t - start
    if (o.nextAuto !== null && t >= o.nextAuto && o.releaseAt === null) {
      o.strikes.push(this.strike(p.origin, o.nextAuto - start))
      o.nextAuto += p.gapMin + Math.random() * Math.max(0, p.gapMax - p.gapMin)
      // Keep only the strikes that can still be visible.
      o.strikes = o.strikes.filter((s) => local - s.t0 < 12)
    }
    addFrame(frame, evalEffect(effect.generator, p, local, c.units, o.strikes), o.opacity * fade)
  }

  private maybeBroadcast() {
    const s = this.state()
    const key = JSON.stringify({ ...s, fading: s.fading > 0 })
    if (key === this.lastKey) return
    this.broadcastState(key)
  }

  private broadcastState(key?: string) {
    const s = this.state()
    this.lastKey = key ?? JSON.stringify({ ...s, fading: s.fading > 0 })
    broadcast({ type: 'playback.state', state: s })
  }
}

// Groups the room's fixtures by address into the units the engine works on.
function unitsOf(fx: FixtureRow[]): Unit[] {
  const byAddress = new Map<number, FixtureRow[]>()
  for (const f of fx) byAddress.set(f.address, [...(byAddress.get(f.address) ?? []), f])
  return [...byAddress.entries()]
    .sort(([a], [b]) => a - b)
    .map(([address, list]) => {
      const placed = list.filter((f) => f.x !== null && f.y !== null)
      const avg = (pick: (f: FixtureRow) => number | null) =>
        placed.length === 0
          ? 0.5
          : placed.reduce((sum, f) => sum + (pick(f) ?? 0.5), 0) / placed.length
      const x = avg((f) => f.x)
      return {
        address,
        x,
        y: avg((f) => f.y),
        mover: list.some((f) => f.type === 'moving_head'),
        side: x < 0.25 ? -1 : x > 0.75 ? 1 : 0,
      }
    })
}

const byte = (v: number) => Math.round(clamp(v) * 255)

// The wheel slot closest to a color, ignoring its brightness (the dimmer carries that).
function wheelByte(c: [number, number, number]) {
  const p = peak(c)
  if (p <= 0) return 0
  const n = c.map((v) => v / p)
  let best = 0
  let bestD = Number.POSITIVE_INFINITY
  WHEEL_COLORS.forEach((w, slot) => {
    const d = hexToRgb(w.hex).reduce((sum, v, i) => sum + (v - (n[i] ?? 0)) ** 2, 0)
    if (d < bestD) {
      best = slot
      bestD = d
    }
  })
  return best * WHEEL_STEP
}

// The rotating prism channel: 128 to 255 turns it from slow to fastest. Up to
// 127 it stays still, and 0 is kept for "no prism", so a stopped rotation sends
// a value in between. The ranges are assumed, not read from the manual.
const PRISM_STILL = 64
function prismByte(speed: number) {
  return speed <= 0 ? PRISM_STILL : Math.round(128 + clamp(speed) * 127)
}

// A head's pan/tilt for an aim: the target's stored position plus the offset in degrees.
function aimed(c: Cache, f: FixtureRow, aim: Aim) {
  const pos = c.positions.get(`${aim.target}:${f.id}`)
  if (!pos) return null
  const move = (v: number, deg: number, range: number) =>
    Math.round(clamp(v + (deg / range) * MAX_16, 0, MAX_16))
  return { pan: move(pos.pan, aim.dPan, PAN_RANGE), tilt: move(pos.tilt, aim.dTilt, TILT_RANGE) }
}

// Writes each fixture's channels from its unit's color. Pars get RGB with the
// common part moved to white; heads get a dimmer, and pan/tilt only when aimed.
function writeFrame(c: Cache, frame: Frame) {
  for (const f of c.fixtures) {
    const out = frame.get(f.address)
    if (!out) continue
    if (f.type === 'par') {
      // White comes from mixing RGB: the 4th channel is documented as white but
      // was never verified, and a value there made the pars show random colors.
      dmxOutput.set(f.address, [byte(out.c[0]), byte(out.c[1]), byte(out.c[2]), 0])
      continue
    }
    const pt = out.aim ? aimed(c, f, out.aim) : null
    if (pt) dmxOutput.set(f.address, [...coarseFine(pt.pan), ...coarseFine(pt.tilt)])
    // Speed fastest, dimmer from the color's brightness, shutter open, color wheel
    // from its hue, control off.
    // Gobo slots sit every 8 DMX values on the wheel; no gobo means the open slot.
    dmxOutput.set(f.address + 4, [
      0,
      byte(peak(out.c)),
      0,
      wheelByte(out.c),
      (out.gobo ?? 0) * 8,
      out.prism === undefined ? 0 : prismByte(out.prism),
      0,
    ])
  }
}

export const playback = new Playback()
