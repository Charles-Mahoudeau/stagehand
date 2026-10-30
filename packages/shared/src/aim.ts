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
// This is a ray-plane solve. Each saved point is a ray out of the head (from
// its pan/tilt) that has to land on a known spot of the floor plane, so the fit
// looks for the head's 3D pose (where it hangs, how it is turned and leaning,
// where its tilt zero is) that makes all the rays meet their spots. It needs
// five points. With the room's size and the head's hanging height known
// (`Geometry`) those are fixed and the fit is well over-determined; without
// them it has to find height and ratio as well, which is less reliable.
// Object heights count too.

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

// The 5-point solve needs this many saved points, with or without a known
// geometry. Each is a ray out of the head (from its pan/tilt) that must land on
// a known spot of the floor plane: two equations a point, against the head's
// pose (position and 3D rotation) plus its tilt zero, 6 unknowns, or 8 when
// height and room ratio aren't known either. Five points over-determine even
// that, so a badly jogged one shows up as error instead of bending the fit.
export const MIN_CALIBRATION_POINTS = 5

// Pan and tilt as 16-bit DMX values (coarse·256 + fine).
export type PanTilt = { pan: number; tilt: number }
export type CalibrationSample = PlanPoint & PanTilt

type Vec3 = [number, number, number]
// Row-major 3×3.
type Mat3 = [number, number, number, number, number, number, number, number, number]

export type HeadModel = {
  // Where the head hangs on the plan.
  hx: number
  hy: number
  // Height above the floor, in room widths.
  height: number
  // Room depth / width.
  aspect: number
  // Tilt (degrees) when the beam points straight down the head's own axis.
  tiltOffset: number
  // Which way pan turns, seen from the room's +z. (Tilt's direction and pan's
  // zero are a turn of the head about its axis, which `rotation` has.)
  panSign: 1 | -1
  // The head's orientation in the room as a rotation vector (axis × angle, in
  // radians): its pan zero, and how far its base leans off level, as a clamp on
  // a truss is rarely square.
  rotation: Vec3
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

function rotationMatrix([x, y, z]: Vec3): Mat3 {
  const angle = Math.hypot(x, y, z)
  if (angle < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1]
  const [kx, ky, kz] = [x / angle, y / angle, z / angle]
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const t = 1 - c
  return [
    t * kx * kx + c,
    t * kx * ky - s * kz,
    t * kx * kz + s * ky,
    t * kx * ky + s * kz,
    t * ky * ky + c,
    t * ky * kz - s * kx,
    t * kx * kz - s * ky,
    t * ky * kz + s * kx,
    t * kz * kz + c,
  ]
}

const rotate = (m: Mat3, [x, y, z]: Vec3): Vec3 => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
]

// The inverse rotation: the transpose.
const rotateBack = (m: Mat3, [x, y, z]: Vec3): Vec3 => [
  m[0] * x + m[3] * y + m[6] * z,
  m[1] * x + m[4] * y + m[7] * z,
  m[2] * x + m[5] * y + m[8] * z,
]

// Unit vector for the beam at `pan` and `tilt` (degrees), in the head's own
// frame: z down its axis at tilt zero, tilting away from it towards the pan.
function beam(m: Pick<HeadModel, 'panSign' | 'tiltOffset'>, pan: number, tilt: number): Vec3 {
  const a = (m.panSign * pan) / DEG
  const b = (tilt - m.tiltOffset) / DEG
  return [Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), -Math.cos(b)]
}

// Unit vector from the head to a spot, in the room's frame (x, y scaled to
// room widths, z up).
function towards(m: HeadModel, p: Spot): Vec3 {
  const v: Vec3 = [p.x - m.hx, (p.y - m.hy) * m.aspect, (p.z ?? 0) - m.height]
  const n = Math.max(Math.hypot(...v), 1e-9)
  return [v[0] / n, v[1] / n, v[2] / n]
}

// The angle (degrees) between where the model aims a sample's pan/tilt and where
// the spot it was saved at lies.
function sampleError(m: HeadModel, s: CalibrationSample) {
  const a = rotate(rotationMatrix(m.rotation), beam(m, panDegrees(s.pan), tiltDegrees(s.tilt)))
  const b = towards(m, s)
  const cross = Math.hypot(
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  )
  return Math.atan2(cross, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * DEG
}

// How far the head's axis leans off straight up, in degrees.
const lean = (m: HeadModel) => Math.acos(Math.min(1, rotationMatrix(m.rotation)[8])) * DEG

// The two pan/tilt pairs (degrees, before wrapping pan) that point at `p`: a
// head reaches every direction twice, once flipped over by 180° of pan.
function solutions(m: HeadModel, p: Spot) {
  const [x, y, z] = rotateBack(rotationMatrix(m.rotation), towards(m, p))
  const a = Math.atan2(y, x) * DEG
  const b = Math.atan2(Math.hypot(x, y), -z) * DEG
  return [
    { pan: m.panSign * a, tilt: m.tiltOffset + b },
    { pan: m.panSign * (a + 180), tilt: m.tiltOffset - b },
  ]
}

// Degrees of sample error one degree of lean is worth: enough that a level
// head wins unless the samples clearly say otherwise.
const LEAN_COST = 0.2

// Likewise for how far the fitted head sits from where it was patched, per
// room width: a plan is drawn by eye, so some slack, but not the freedom to
// absorb a badly jogged point by moving the head across the room.
const POSITION_COST = 15

// The residual vector the solver minimizes: per sample, the gap between the
// beam and the ray to its spot (unit vectors, scaled so it reads in degrees),
// then the lean and the head's distance from where it was patched (`near`).
function residuals(m: HeadModel, samples: CalibrationSample[], near: PlanPoint | null) {
  const R = rotationMatrix(m.rotation)
  const out: number[] = []
  for (const s of samples) {
    const a = rotate(R, beam(m, panDegrees(s.pan), tiltDegrees(s.tilt)))
    const b = towards(m, s)
    out.push((a[0] - b[0]) * DEG, (a[1] - b[1]) * DEG, (a[2] - b[2]) * DEG)
  }
  // The axis' x and y are the lean about y and x, near enough.
  out.push(R[2] * DEG * LEAN_COST, R[5] * DEG * LEAN_COST)
  if (near) out.push((m.hx - near.x) * POSITION_COST, (m.hy - near.y) * POSITION_COST)
  return out
}

// Continuous parameters the solver moves; height and aspect go in as logs so
// they stay positive. The last three are the rotation vector.
type Params = [number, number, number, number, number, number, number, number]

const toModel = (p: Params, panSign: 1 | -1): HeadModel => ({
  hx: p[0],
  hy: p[1],
  height: Math.exp(p[2]),
  aspect: Math.exp(p[3]),
  tiltOffset: p[4],
  panSign,
  rotation: [p[5], p[6], p[7]],
})

const sumSquares = (r: number[]) => r.reduce((a, v) => a + v * v, 0)

// Levenberg–Marquardt with a numeric Jacobian over the parameters in `free`
// (the rest stay at their starting values). Small problem, so the normal
// equations are solved directly.
function solve(
  start: Params,
  panSign: 1 | -1,
  samples: CalibrationSample[],
  near: PlanPoint | null,
  free: number[],
) {
  const evaluate = (q: Params) => residuals(toModel(q, panSign), samples, near)
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

// The rotation (as a rotation vector) that best turns each unit vector of
// `from` onto its partner in `to`: Horn's closed-form solution, the top
// eigenvector of a 4×4 matrix built from the pairs, as a quaternion.
function alignRays(from: Vec3[], to: Vec3[]): Vec3 {
  const S = [0, 0, 0].map(() => [0, 0, 0])
  from.forEach((f, i) => {
    const t = to[i] as Vec3
    for (let a = 0; a < 3; a++) {
      const row = S[a] as number[]
      for (let b = 0; b < 3; b++) row[b] = (row[b] as number) + (f[a] as number) * (t[b] as number)
    }
  })
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S as [Vec3, Vec3, Vec3]
  const q = topEigenvector([
    [xx + yy + zz, yz - zy, zx - xz, xy - yx],
    [yz - zy, xx - yy - zz, xy + yx, zx + xz],
    [zx - xz, xy + yx, -xx + yy - zz, yz + zy],
    [xy - yx, zx + xz, yz + zy, -xx - yy + zz],
  ])
  const sign = (q[0] as number) < 0 ? -1 : 1
  const w = sign * (q[0] as number)
  const v: Vec3 = [sign * (q[1] as number), sign * (q[2] as number), sign * (q[3] as number)]
  const sin = Math.hypot(...v)
  if (sin < 1e-12) return [0, 0, 0]
  const angle = 2 * Math.atan2(sin, w)
  return [(v[0] * angle) / sin, (v[1] * angle) / sin, (v[2] * angle) / sin]
}

// Eigenvector of the largest eigenvalue of a symmetric matrix, by Jacobi
// rotations.
function topEigenvector(M: number[][]): number[] {
  const n = M.length
  const a = M.map((row) => [...row])
  const v = a.map((_, i) => a.map((_, j) => (i === j ? 1 : 0)))
  for (let sweep = 0; sweep < 50; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) off += ((a[p] as number[])[q] as number) ** 2
    }
    if (off < 1e-24) break
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = (a[p] as number[])[q] as number
        if (Math.abs(apq) < 1e-300) continue
        const theta =
          (((a[q] as number[])[q] as number) - ((a[p] as number[])[p] as number)) / (2 * apq)
        const t = (theta < 0 ? -1 : 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (const m of [a, v]) {
          for (const row of m) {
            const rp = row[p] as number
            const rq = row[q] as number
            row[p] = c * rp - s * rq
            row[q] = s * rp + c * rq
          }
        }
        for (let k = 0; k < n; k++) {
          const rp = (a[p] as number[])[k] as number
          const rq = (a[q] as number[])[k] as number
          ;(a[p] as number[])[k] = c * rp - s * rq
          ;(a[q] as number[])[k] = s * rp + c * rq
        }
      }
    }
  }
  let top = 0
  for (let i = 1; i < n; i++) {
    if (((a[i] as number[])[i] as number) > ((a[top] as number[])[top] as number)) top = i
  }
  return v.map((row) => row[top] as number)
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
  lean(m) < 30

const FREE_UNKNOWN_GEOMETRY = [0, 1, 2, 3, 4, 5, 6, 7]
const FREE_KNOWN_GEOMETRY = [0, 1, 4, 5, 6, 7]

// Where a head's tilt zero might be to start from: straight down at mid
// travel, or a quarter either side.
const TILT_STARTS = [TILT_RANGE / 2, TILT_RANGE / 3, (TILT_RANGE * 2) / 3]

// Fits a head model to its calibration samples: the pose that puts every saved
// beam on its spot of the floor. `near` is where the head is patched on the
// plan: the fit starts there and is kept close to it. `geometry` fixes the
// head's height and the room's proportions when known.
// For each way pan can turn and a few guesses at the tilt zero, the beams are
// turned onto the rays to the spots in closed form (see alignRays) as a first
// pose, which the solver then refines; the best of those wins.
// Null with fewer than MIN_CALIBRATION_POINTS samples, when some repeat an aim
// (see repeatedAims), or when they don't agree on any head position.
export function fitHead(
  samples: CalibrationSample[],
  near?: PlanPoint | null,
  geometry?: Geometry | null,
): HeadFit | null {
  if (samples.length < MIN_CALIBRATION_POINTS) return null
  if (repeatedAims(samples).some((j) => j !== null)) return null
  const cx = near?.x ?? samples.reduce((a, s) => a + s.x, 0) / samples.length
  const cy = near?.y ?? samples.reduce((a, s) => a + s.y, 0) / samples.length
  const heights = geometry ? [geometry.height] : [0.2, 0.5, 1]
  const logAspect = Math.log(geometry?.aspect ?? 1)
  const free = geometry ? FREE_KNOWN_GEOMETRY : FREE_UNKNOWN_GEOMETRY

  let best: { model: HeadModel; cost: number } | null = null
  for (const panSign of [1, -1] as const) {
    for (const height of heights) {
      for (const tiltStart of TILT_STARTS) {
        const guess = toModel([cx, cy, Math.log(height), logAspect, tiltStart, 0, 0, 0], panSign)
        const rays = samples.map((s) => beam(guess, panDegrees(s.pan), tiltDegrees(s.tilt)))
        const [rx, ry, rz] = alignRays(
          rays,
          samples.map((s) => towards(guess, s)),
        )
        const start: Params = [cx, cy, Math.log(height), logAspect, tiltStart, rx, ry, rz]
        const { params, cost } = solve(start, panSign, samples, near ?? null, free)
        const model = toModel(params, panSign)
        // A head far off, or miles up, can match samples by pointing nearly
        // the same way at all of them; it aims nowhere useful.
        if (plausible(model, !!geometry) && (!best || cost < best.cost)) best = { model, cost }
      }
    }
  }
  if (!best) return null
  const model = best.model
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
