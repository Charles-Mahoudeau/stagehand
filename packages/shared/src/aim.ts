// Aiming moving heads at spots on the room plan.
//
// A head is calibrated by jogging its beam onto a few known spots on the floor
// and saving pan/tilt for each. `fitHead` turns those into a model of where
// the head hangs, so `aimAt` can work out pan/tilt for any other spot.
//
// Everything is in plan units (fractions of the room's width and depth). The
// model is a 3D one: the head sits at (hx, hy) at some height above the floor,
// and the room has a depth/width ratio.
//
// With the room's size and the head's hanging height known (`Geometry`), those
// two are fixed, the head's plan position is only nudged from where it was
// patched, and what is left (pan/tilt offsets, which way they turn, a little
// lean) is well over-determined by four points. Object heights count too.
// Without them the fit has to find height and ratio as well, which takes more
// points and is much less reliable.

// Travel of the Wakanda moving heads (docs/rooms/wakanda/README.md), in degrees.
export const PAN_RANGE = 540
export const TILT_RANGE = 270
export const MAX_16 = 65535

export type PlanPoint = { x: number; y: number }
// A spot with a height above the floor, in room widths (0 = on the floor).
export type Spot = PlanPoint & { z?: number }

// What the room's size and the head's hanging height pin down. `height` is in
// room widths, `aspect` is room depth / width.
export type Geometry = { aspect: number; height: number }
export type RoomSize = { width: number | null; depth: number | null }

const positive = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0

// The geometry of a head in a room, or null while the room has no size or the
// head no height (meters).
export function headGeometry(room: RoomSize, headHeight: number | null): Geometry | null {
  if (!positive(room.width) || !positive(room.depth) || !positive(headHeight)) return null
  return { aspect: room.depth / room.width, height: headHeight / room.width }
}

// A plan spot lifted to `height` meters, when the room has a width to convert
// it with. Otherwise it stays on the floor.
export function spotAt(room: RoomSize, p: PlanPoint, height: number | null): Spot {
  return positive(room.width) && positive(height) ? { ...p, z: height / room.width } : p
}

// Fewer points than this leaves the model underdetermined, or so loose that
// jogging error moves the aim by many degrees. Two equations a point, against
// 6 unknowns with a known geometry or 8 without; simulated, 4 points with a
// geometry aim about as well as 6 without.
export const minCalibrationPoints = (geometry?: Geometry | null) => (geometry ? 4 : 6)
// Pan and tilt as 16-bit DMX values (coarse·256 + fine).
export type PanTilt = { pan: number; tilt: number }
export type CalibrationSample = PlanPoint & PanTilt

export type HeadModel = {
  // Where the head hangs on the plan.
  hx: number
  hy: number
  // Height above the floor, in room widths.
  height: number
  // Room depth / width.
  aspect: number
  // Pan and tilt (degrees) when the beam points along +x / straight down.
  panOffset: number
  tiltOffset: number
  // Which way pan and tilt turn.
  panSign: 1 | -1
  tiltSign: 1 | -1
  // How far the head's base leans off level (degrees, about the plan's x and
  // y axes): a clamp on a truss is rarely square.
  leanX: number
  leanY: number
}

export type HeadFit = {
  model: HeadModel
  // Root-mean-square angular error over the samples, in degrees.
  rms: number
  // Error of each sample, in the order given.
  errors: number[]
}

const DEG = 180 / Math.PI

export const panDegrees = (pan16: number) => (pan16 / MAX_16) * PAN_RANGE
export const tiltDegrees = (tilt16: number) => (tilt16 / MAX_16) * TILT_RANGE
export const pan16 = (deg: number) => clamp16(Math.round((deg / PAN_RANGE) * MAX_16))
export const tilt16 = (deg: number) => clamp16(Math.round((deg / TILT_RANGE) * MAX_16))
const clamp16 = (v: number) => Math.min(MAX_16, Math.max(0, v))

// A 16-bit value as its [coarse, fine] DMX channel pair.
export const coarseFine = (v: number) => [v >> 8, v & 255] as const

// Wraps an angle to (-180, 180].
const wrap = (deg: number) => deg - 360 * Math.ceil((deg - 180) / 360)

// Direction from the head to a floor spot, in the head's own frame: azimuth
// round its axis, and angle away from that axis, both in degrees.
function direction(m: HeadModel, p: Spot) {
  const dx = p.x - m.hx
  const dy = (p.y - m.hy) * m.aspect
  const dz = (p.z ?? 0) - m.height
  // Undo the base's lean: about x, then about y.
  const ax = m.leanX / DEG
  const ay = m.leanY / DEG
  const y1 = dy * Math.cos(ax) + dz * Math.sin(ax)
  const z1 = -dy * Math.sin(ax) + dz * Math.cos(ax)
  const x2 = dx * Math.cos(ay) - z1 * Math.sin(ay)
  const z2 = dx * Math.sin(ay) + z1 * Math.cos(ay)
  return {
    azimuth: Math.atan2(y1, x2) * DEG,
    offVertical: Math.atan2(Math.hypot(x2, y1), -z2) * DEG,
  }
}

// The two pan/tilt pairs (degrees, before wrapping pan) that point at `p`: a
// head reaches every direction twice, once flipped over by 180° of pan.
function solutions(m: HeadModel, p: Spot) {
  const { azimuth, offVertical } = direction(m, p)
  const pan = m.panOffset + m.panSign * azimuth
  const tilt = m.tiltSign * offVertical
  return [
    { pan, tilt: m.tiltOffset + tilt, offVertical },
    { pan: pan + 180, tilt: m.tiltOffset - tilt, offVertical },
  ]
}

// Angular distance between where the model points and a saved sample. Pan
// error counts for less near straight down, where pan barely moves the spot.
function sampleError(m: HeadModel, s: CalibrationSample) {
  const pan = panDegrees(s.pan)
  const tilt = tiltDegrees(s.tilt)
  let best = Number.POSITIVE_INFINITY
  for (const sol of solutions(m, s)) {
    const dPan = wrap(pan - sol.pan) * Math.sin(sol.offVertical / DEG)
    const dTilt = tilt - sol.tilt
    best = Math.min(best, Math.hypot(dPan, dTilt))
  }
  return best
}

// Degrees of sample error one degree of lean is worth: enough that a level
// head wins unless the samples clearly say otherwise.
const LEAN_COST = 0.2

// Likewise for how far the fitted head sits from where it was patched, per
// room width: a plan is drawn by eye, so some slack, but not the freedom to
// absorb a badly jogged point by moving the head across the room.
const POSITION_COST = 15

// The residual vector the solver minimises: pan and tilt error per sample,
// each on the branch that fits it best, then the lean and the head's distance
// from where it was patched (`near`).
function residuals(m: HeadModel, samples: CalibrationSample[], near: PlanPoint | null) {
  const out: number[] = []
  for (const s of samples) {
    const pan = panDegrees(s.pan)
    const tilt = tiltDegrees(s.tilt)
    let best: [number, number] = [0, 0]
    let bestNorm = Number.POSITIVE_INFINITY
    for (const sol of solutions(m, s)) {
      const r: [number, number] = [
        wrap(pan - sol.pan) * Math.sin(sol.offVertical / DEG),
        tilt - sol.tilt,
      ]
      const norm = Math.hypot(...r)
      if (norm < bestNorm) {
        bestNorm = norm
        best = r
      }
    }
    out.push(...best)
  }
  out.push(m.leanX * LEAN_COST, m.leanY * LEAN_COST)
  if (near) out.push((m.hx - near.x) * POSITION_COST, (m.hy - near.y) * POSITION_COST)
  return out
}

// Continuous parameters the solver moves; height and aspect go in as logs so
// they stay positive.
type Params = [number, number, number, number, number, number, number, number]

const toModel = (p: Params, panSign: 1 | -1, tiltSign: 1 | -1): HeadModel => ({
  hx: p[0],
  hy: p[1],
  height: Math.exp(p[2]),
  aspect: Math.exp(p[3]),
  panOffset: p[4],
  tiltOffset: p[5],
  panSign,
  tiltSign,
  leanX: p[6],
  leanY: p[7],
})

const sumSquares = (r: number[]) => r.reduce((a, v) => a + v * v, 0)

// Levenberg–Marquardt with a numeric Jacobian over the parameters in `free`
// (the rest stay at their starting values). Small problem, so the normal
// equations are solved directly.
function solve(
  start: Params,
  panSign: 1 | -1,
  tiltSign: 1 | -1,
  samples: CalibrationSample[],
  near: PlanPoint | null,
  free: number[],
) {
  const evaluate = (q: Params) => residuals(toModel(q, panSign, tiltSign), samples, near)
  let p = [...start] as Params
  let r = evaluate(p)
  let cost = sumSquares(r)
  let lambda = 1e-2
  for (let iter = 0; iter < 200; iter++) {
    const J = free.map((j) => {
      const h = 1e-6 * Math.max(1, Math.abs(p[j] as number))
      const q = [...p] as Params
      q[j] = (q[j] as number) + h
      return evaluate(q).map((v, i) => (v - (r[i] as number)) / h)
    })
    const A = J.map((a) => J.map((b) => a.reduce((s, v, i) => s + v * (b[i] as number), 0)))
    const g = J.map((col) => col.reduce((s, v, i) => s + v * (r[i] as number), 0))

    let improved = false
    while (lambda < 1e8) {
      const M = A.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-9 : v)))
      const step = solveLinear(
        M,
        g.map((v) => -v),
      )
      if (!step) {
        lambda *= 10
        continue
      }
      const q = [...p] as Params
      free.forEach((j, k) => {
        q[j] = (p[j] as number) + (step[k] as number)
      })
      const rq = evaluate(q)
      const cq = sumSquares(rq)
      if (cq < cost) {
        const done = cost - cq < 1e-12 * (1 + cost)
        p = q
        r = rq
        cost = cq
        lambda = Math.max(1e-7, lambda / 10)
        improved = !done
        break
      }
      lambda *= 10
    }
    if (!improved) break
  }
  return { params: p, cost }
}

// Gaussian elimination with partial pivoting; null when singular.
function solveLinear(M: number[][], b: number[]): number[] | null {
  const n = b.length
  const a = M.map((row, i) => [...row, b[i] as number])
  for (let c = 0; c < n; c++) {
    let pivot = c
    for (let i = c + 1; i < n; i++) {
      if (Math.abs((a[i] as number[])[c] as number) > Math.abs((a[pivot] as number[])[c] as number))
        pivot = i
    }
    const rowP = a[pivot] as number[]
    if (Math.abs(rowP[c] as number) < 1e-12) return null
    ;[a[c], a[pivot]] = [rowP, a[c] as number[]]
    const row = a[c] as number[]
    for (let i = c + 1; i < n; i++) {
      const other = a[i] as number[]
      const f = (other[c] as number) / (row[c] as number)
      for (let k = c; k <= n; k++) other[k] = (other[k] as number) - f * (row[k] as number)
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    const row = a[i] as number[]
    let s = row[n] as number
    for (let k = i + 1; k < n; k++) s -= (row[k] as number) * (x[k] as number)
    x[i] = s / (row[i] as number)
  }
  return x
}

// Two saved points closer than this in both pan and tilt (degrees), but
// apart on the plan, mean the head wasn't jogged between them.
const SAME_AIM_DEGREES = 0.5
const SAME_SPOT = 0.02

// For each sample, the index of an earlier sample saved with the same aim at
// a different spot, or null. Any repeat makes the fit meaningless.
export function repeatedAims(samples: CalibrationSample[]): (number | null)[] {
  return samples.map((s, i) => {
    const j = samples.findIndex(
      (t, j) =>
        j < i &&
        Math.abs(panDegrees(t.pan) - panDegrees(s.pan)) < SAME_AIM_DEGREES &&
        Math.abs(tiltDegrees(t.tilt) - tiltDegrees(s.tilt)) < SAME_AIM_DEGREES &&
        Math.hypot(t.x - s.x, t.y - s.y) > SAME_SPOT,
    )
    return j === -1 ? null : j
  })
}

// A head hanging over or near the room, with sane proportions. Inconsistent
// samples drive the solver to a head far away, which aims everywhere alike.
// A known geometry has sane proportions already.
const plausible = (m: HeadModel, known: boolean) =>
  m.hx > -1 &&
  m.hx < 2 &&
  m.hy > -1 &&
  m.hy < 2 &&
  (known || (m.height < 5 && m.aspect > 0.05 && m.aspect < 20)) &&
  Math.abs(m.leanX) < 30 &&
  Math.abs(m.leanY) < 30

const FREE_UNKNOWN_GEOMETRY = [0, 1, 2, 3, 4, 5, 6, 7]
const FREE_KNOWN_GEOMETRY = [0, 1, 4, 5, 6, 7]

// Fits a head model to its calibration samples. `near` is where the head is
// patched on the plan: the fit starts there and is kept close to it.
// `geometry` fixes the head's height and the room's proportions when known.
// Null with fewer than minCalibrationPoints samples, when some repeat an aim
// (see repeatedAims), or when they don't agree on any head position.
export function fitHead(
  samples: CalibrationSample[],
  near?: PlanPoint | null,
  geometry?: Geometry | null,
): HeadFit | null {
  if (samples.length < minCalibrationPoints(geometry)) return null
  if (repeatedAims(samples).some((j) => j !== null)) return null
  const cx = near?.x ?? samples.reduce((a, s) => a + s.x, 0) / samples.length
  const cy = near?.y ?? samples.reduce((a, s) => a + s.y, 0) / samples.length
  const first = samples[0] as CalibrationSample
  const heights = geometry ? [geometry.height] : [0.2, 0.5, 1]
  const logAspect = Math.log(geometry?.aspect ?? 1)
  const free = geometry ? FREE_KNOWN_GEOMETRY : FREE_UNKNOWN_GEOMETRY

  let best: { model: HeadModel; cost: number } | null = null
  for (const panSign of [1, -1] as const) {
    for (const tiltSign of [1, -1] as const) {
      for (const height of heights) {
        for (const flip of [0, 180]) {
          // Start with the first sample exactly on target.
          const guess = toModel(
            [cx, cy, Math.log(height), logAspect, 0, 0, 0, 0],
            panSign,
            tiltSign,
          )
          const { azimuth, offVertical } = direction(guess, first)
          const panOffset = panDegrees(first.pan) - panSign * azimuth - flip
          const tiltOffset = tiltDegrees(first.tilt) - (flip ? -1 : 1) * tiltSign * offVertical
          const start: Params = [cx, cy, Math.log(height), logAspect, panOffset, tiltOffset, 0, 0]
          const { params, cost } = solve(start, panSign, tiltSign, samples, near ?? null, free)
          const model = toModel(params, panSign, tiltSign)
          // A head far off, or miles up, can match samples by pointing nearly
          // the same way at all of them; it aims nowhere useful.
          if (plausible(model, !!geometry) && (!best || cost < best.cost)) best = { model, cost }
        }
      }
    }
  }
  if (!best) return null
  const model = best.model
  model.panOffset = wrap(model.panOffset)
  const errors = samples.map((s) => sampleError(model, s))
  const rms = Math.sqrt(errors.reduce((a, e) => a + e * e, 0) / errors.length)
  return { model, rms, errors }
}

// Pan/tilt (16-bit) that put the beam on `p`, or null if the head can't get
// there within its travel. Of the ways to reach it, picks the one closest to
// `from` so the head takes the shortest move. `nudge` (degrees) is added on
// top, for per-object corrections.
export function aimAt(
  model: HeadModel,
  p: Spot,
  from?: PanTilt | null,
  nudge?: { pan: number; tilt: number } | null,
): PanTilt | null {
  const current = from
    ? { pan: panDegrees(from.pan), tilt: tiltDegrees(from.tilt) }
    : { pan: PAN_RANGE / 2, tilt: TILT_RANGE / 2 }
  let best: { pan: number; tilt: number; cost: number } | null = null
  for (const sol of solutions(model, p)) {
    const tilt = sol.tilt + (nudge?.tilt ?? 0)
    if (tilt < 0 || tilt > TILT_RANGE) continue
    for (let turns = -2; turns <= 2; turns++) {
      const pan = sol.pan + 360 * turns + (nudge?.pan ?? 0)
      if (pan < 0 || pan > PAN_RANGE) continue
      const cost = Math.abs(pan - current.pan) + Math.abs(tilt - current.tilt)
      if (!best || cost < best.cost) best = { pan, tilt, cost }
    }
  }
  return best && { pan: pan16(best.pan), tilt: tilt16(best.tilt) }
}

// Convex hull of the calibration samples: the part of the floor the fit is
// measured over. Outside it, aiming is extrapolated.
export function coverage(points: PlanPoint[]): PlanPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length < 3) return sorted
  const cross = (o: PlanPoint, a: PlanPoint, b: PlanPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (list: PlanPoint[]) => {
    const out: PlanPoint[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out.at(-2) as PlanPoint, out.at(-1) as PlanPoint, p) <= 0)
        out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

export function insideCoverage(hull: PlanPoint[], p: PlanPoint) {
  if (hull.length < 3) return false
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as PlanPoint
    const b = hull[(i + 1) % hull.length] as PlanPoint
    if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < -1e-9) return false
  }
  return true
}

// How far a beam lands from a floor spot when the head's pan and tilt are each
// off by `sigma` degrees, in room widths: sideways from the pan error, along
// the floor from the tilt error. Grows with distance from the head, and
// sharply for a shallow beam. Ignores the base's lean (a few degrees).
export function aimMiss(model: HeadModel, p: PlanPoint, sigma: number) {
  const r = Math.hypot(p.x - model.hx, (p.y - model.hy) * model.aspect)
  const theta = Math.atan2(r, model.height)
  const rad = sigma / DEG
  const sideways = r * rad
  const along = (model.height / Math.max(Math.cos(theta) ** 2, 0.01)) * rad
  return Math.hypot(sideways, along)
}

// Distance (room widths) from a spot to the calibrated area; 0 inside it.
export function distanceOutsideCoverage(hull: PlanPoint[], p: PlanPoint, aspect = 1) {
  if (hull.length === 0) return Number.POSITIVE_INFINITY
  if (insideCoverage(hull, p)) return 0
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i] as PlanPoint
    const b = hull[(i + 1) % hull.length] as PlanPoint
    const abx = b.x - a.x
    const aby = (b.y - a.y) * aspect
    const apx = p.x - a.x
    const apy = (p.y - a.y) * aspect
    const len2 = abx * abx + aby * aby
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, (apx * abx + apy * aby) / len2))
    best = Math.min(best, Math.hypot(apx - t * abx, apy - t * aby))
  }
  return best
}
