// Aiming moving heads at spots on the room plan.
//
// A head is calibrated by jogging its beam onto a few known spots on the floor
// and saving pan/tilt for each. `fitHead` turns those into a model of where
// the head hangs, so `aimAt` can work out pan/tilt for any other spot.
//
// Everything is in plan units (fractions of the room's width and depth), so no
// measurements are needed. The model is still a 3D one: the head sits at
// (hx, hy) at some height above the floor, and the room's depth/width ratio
// is fitted too. Once the room has a size in metres, that ratio becomes known
// and object heights can be taken into account.

// Travel of the Wakanda moving heads (docs/rooms/wakanda/README.md), in degrees.
export const PAN_RANGE = 540
export const TILT_RANGE = 270
export const MAX_16 = 65535

// Fewer than this leaves the model underdetermined (6 unknowns, 2 equations a point).
export const MIN_CALIBRATION_POINTS = 4

export type PlanPoint = { x: number; y: number }
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

// Direction from the head to a floor spot: azimuth round the vertical, and
// angle away from straight down, both in degrees.
function direction(m: HeadModel, p: PlanPoint) {
  const dx = p.x - m.hx
  const dy = (p.y - m.hy) * m.aspect
  return {
    azimuth: Math.atan2(dy, dx) * DEG,
    offVertical: Math.atan2(Math.hypot(dx, dy), m.height) * DEG,
  }
}

// The two pan/tilt pairs (degrees, before wrapping pan) that point at `p`: a
// head reaches every direction twice, once flipped over by 180° of pan.
function solutions(m: HeadModel, p: PlanPoint) {
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

// The residual vector the solver minimises: pan and tilt error per sample,
// each on the branch that fits it best.
function residuals(m: HeadModel, samples: CalibrationSample[]) {
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
  return out
}

// Continuous parameters the solver moves; height and aspect go in as logs so
// they stay positive.
type Params = [number, number, number, number, number, number]

const toModel = (p: Params, panSign: 1 | -1, tiltSign: 1 | -1): HeadModel => ({
  hx: p[0],
  hy: p[1],
  height: Math.exp(p[2]),
  aspect: Math.exp(p[3]),
  panOffset: p[4],
  tiltOffset: p[5],
  panSign,
  tiltSign,
})

const sumSquares = (r: number[]) => r.reduce((a, v) => a + v * v, 0)

// Levenberg–Marquardt with a numeric Jacobian. Small problem (6 unknowns), so
// the normal equations are solved directly.
function solve(start: Params, panSign: 1 | -1, tiltSign: 1 | -1, samples: CalibrationSample[]) {
  let p = [...start] as Params
  let r = residuals(toModel(p, panSign, tiltSign), samples)
  let cost = sumSquares(r)
  let lambda = 1e-2
  for (let iter = 0; iter < 200; iter++) {
    const J = p.map((_, j) => {
      const h = 1e-6 * Math.max(1, Math.abs(p[j] as number))
      const q = [...p] as Params
      q[j] = (q[j] as number) + h
      const rq = residuals(toModel(q, panSign, tiltSign), samples)
      return rq.map((v, i) => (v - (r[i] as number)) / h)
    })
    const n = p.length
    const A = Array.from({ length: n }, (_, a) =>
      Array.from({ length: n }, (_, b) =>
        (J[a] as number[]).reduce((s, v, i) => s + v * ((J[b] as number[])[i] as number), 0),
      ),
    )
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
      const q = p.map((v, j) => v + (step[j] as number)) as Params
      const rq = residuals(toModel(q, panSign, tiltSign), samples)
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

// Fits a head model to its calibration samples. `near` is roughly where the
// head hangs on the plan (its fixture position), used as a starting guess.
// Null with fewer than MIN_CALIBRATION_POINTS samples.
export function fitHead(samples: CalibrationSample[], near?: PlanPoint | null): HeadFit | null {
  if (samples.length < MIN_CALIBRATION_POINTS) return null
  const cx = near?.x ?? samples.reduce((a, s) => a + s.x, 0) / samples.length
  const cy = near?.y ?? samples.reduce((a, s) => a + s.y, 0) / samples.length
  const first = samples[0] as CalibrationSample

  let best: { model: HeadModel; cost: number } | null = null
  for (const panSign of [1, -1] as const) {
    for (const tiltSign of [1, -1] as const) {
      for (const height of [0.2, 0.5, 1]) {
        for (const flip of [0, 180]) {
          // Start with the first sample exactly on target.
          const guess = toModel([cx, cy, Math.log(height), 0, 0, 0], panSign, tiltSign)
          const { azimuth, offVertical } = direction(guess, first)
          const panOffset = panDegrees(first.pan) - panSign * azimuth - flip
          const tiltOffset = tiltDegrees(first.tilt) - (flip ? -1 : 1) * tiltSign * offVertical
          const start: Params = [cx, cy, Math.log(height), 0, panOffset, tiltOffset]
          const { params, cost } = solve(start, panSign, tiltSign, samples)
          if (!best || cost < best.cost) best = { model: toModel(params, panSign, tiltSign), cost }
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
  p: PlanPoint,
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
