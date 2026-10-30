import {
  aimAt,
  aimMiss,
  type CalibrationSample,
  coarseFine,
  coverage,
  distanceOutsideCoverage,
  fitHead,
  type Geometry,
  type HeadFit,
  headGeometry,
  minCalibrationPoints,
  type PanTilt,
  type PlanPoint,
  repeatedAims,
} from '@stagehand/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { api } from '@/lib/api'
import { type Fixture, failure, type Room } from '@/lib/rooms'

export type Target = InferResponseType<
  (typeof api.rooms)[':roomId']['targets']['$get'],
  200
>[number]
export type CalibrationPoint = InferResponseType<
  (typeof api.rooms)[':roomId']['calibration']['$get'],
  200
>[number]
export type AimResult = InferResponseType<(typeof api.rooms)[':roomId']['aim']['$post'], 200>

export const targetsQuery = (roomId: number) =>
  queryOptions({
    queryKey: ['rooms', roomId, 'targets'],
    queryFn: async () => {
      const res = await api.rooms[':roomId'].targets.$get({ param: { roomId: String(roomId) } })
      if (!res.ok) throw await failure(res)
      return res.json()
    },
  })

export const calibrationQuery = (roomId: number) =>
  queryOptions({
    queryKey: ['rooms', roomId, 'calibration'],
    queryFn: async () => {
      const res = await api.rooms[':roomId'].calibration.$get({ param: { roomId: String(roomId) } })
      if (!res.ok) throw await failure(res)
      return res.json()
    },
  })

export function useTargetMutations(roomId: number) {
  const queryClient = useQueryClient()
  const { queryKey } = targetsQuery(roomId)
  const param = (id: number) => ({ roomId: String(roomId), targetId: String(id) })
  // Writes the server's copy straight into the cache, so a dragged object
  // doesn't jump back while the list refetches.
  const store = (target: Target) =>
    queryClient.setQueryData(queryKey, (list) =>
      list?.some((t) => t.id === target.id)
        ? list.map((t) => (t.id === target.id ? target : t))
        : [...(list ?? []), target],
    )

  return {
    create: useMutation({
      mutationFn: async (json: { name: string; position: PlanPoint }) => {
        const res = await api.rooms[':roomId'].targets.$post({
          param: { roomId: String(roomId) },
          json,
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    update: useMutation({
      mutationFn: async ({
        id,
        ...json
      }: { id: number } & Partial<{
        name: string
        slug: string
        position: PlanPoint
        height: number | null
      }>) => {
        const res = await api.rooms[':roomId'].targets[':targetId'].$patch({
          param: param(id),
          json,
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    remove: useMutation({
      mutationFn: async (id: number) => {
        const res = await api.rooms[':roomId'].targets[':targetId'].$delete({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess: (_, id) =>
        queryClient.setQueryData(queryKey, (list) => list?.filter((t) => t.id !== id)),
    }),
    nudge: useMutation({
      mutationFn: async ({
        id,
        fixtureId,
        ...json
      }: {
        id: number
        fixtureId: number
        pan: number
        tilt: number
      }) => {
        const res = await api.rooms[':roomId'].targets[':targetId'].nudges[':fixtureId'].$put({
          param: { ...param(id), fixtureId: String(fixtureId) },
          json,
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
  }
}

export function useCalibrationMutations(roomId: number) {
  const queryClient = useQueryClient()
  const { queryKey } = calibrationQuery(roomId)
  const param = (p: { fixtureId: number; id: number }) => ({
    roomId: String(roomId),
    fixtureId: String(p.fixtureId),
    pointId: String(p.id),
  })
  const store = (point: CalibrationPoint) =>
    queryClient.setQueryData(queryKey, (list) =>
      list?.some((p) => p.id === point.id)
        ? list.map((p) => (p.id === point.id ? point : p))
        : [...(list ?? []), point],
    )

  return {
    create: useMutation({
      mutationFn: async ({
        fixtureId,
        ...json
      }: {
        fixtureId: number
        name: string
        position: PlanPoint
        pan?: number
        tilt?: number
      }) => {
        const res = await api.rooms[':roomId'].fixtures[':fixtureId'].calibration.$post({
          param: { roomId: String(roomId), fixtureId: String(fixtureId) },
          json,
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    update: useMutation({
      mutationFn: async ({
        id,
        fixtureId,
        ...json
      }: { id: number; fixtureId: number } & Partial<{
        name: string
        position: PlanPoint
        pan: number | null
        tilt: number | null
      }>) => {
        const res = await api.rooms[':roomId'].fixtures[':fixtureId'].calibration[
          ':pointId'
        ].$patch({ param: param({ id, fixtureId }), json })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    remove: useMutation({
      mutationFn: async (point: { id: number; fixtureId: number }) => {
        const res = await api.rooms[':roomId'].fixtures[':fixtureId'].calibration[
          ':pointId'
        ].$delete({ param: param(point) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess: (_, point) =>
        queryClient.setQueryData(queryKey, (list) => list?.filter((p) => p.id !== point.id)),
    }),
  }
}

// Aims heads at a target or a spot. Heads that can't (not calibrated, out of
// reach) come back in `skipped`.
export async function aim(
  roomId: number,
  fixtureIds: number[],
  at: { targetId: number } | { position: PlanPoint },
) {
  const res = await api.rooms[':roomId'].aim.$post({
    param: { roomId: String(roomId) },
    json: { fixtureIds, ...at },
  })
  if (!res.ok) throw await failure(res)
  return res.json()
}

export const isHead = (f: Fixture) => f.type === 'moving_head'

// A head's saved calibration points, the fit through them (null under the
// minimum or when they don't fit), the floor area they cover, and saved points
// that repeat an earlier point's aim (keyed by point id). `geometry` is what
// the room's size and the head's height pin down, null while either is missing.
export type HeadCalibration = {
  points: CalibrationPoint[]
  saved: CalibrationPoint[]
  geometry: Geometry | null
  needed: number
  fit: HeadFit | null
  hull: PlanPoint[]
  repeats: Map<number, CalibrationPoint>
}

export function headCalibration(
  head: Fixture,
  points: CalibrationPoint[],
  room: Pick<Room, 'width' | 'depth'>,
): HeadCalibration {
  const own = points.filter((p) => p.fixtureId === head.id)
  const saved = own.filter((p) => p.pan !== null && p.tilt !== null)
  const samples: CalibrationSample[] = saved.map((p) => ({
    ...p.position,
    pan: p.pan as number,
    tilt: p.tilt as number,
  }))
  const repeats = new Map<number, CalibrationPoint>()
  repeatedAims(samples).forEach((j, i) => {
    const point = saved[i]
    const earlier = j === null ? undefined : saved[j]
    if (point && earlier) repeats.set(point.id, earlier)
  })
  const geometry = headGeometry(room, head.height)
  return {
    points: own,
    saved,
    geometry,
    needed: minCalibrationPoints(geometry),
    fit: cachedFit(samples, head.position, geometry),
    hull: coverage(saved.map((p) => p.position)),
    repeats,
  }
}

// Fits are slow-ish (tens of ms) and pages re-render with every DMX frame, so
// keep the last few by their inputs.
const fits = new Map<string, HeadFit | null>()
function cachedFit(
  samples: CalibrationSample[],
  near: PlanPoint | null,
  geometry: Geometry | null,
) {
  const key = JSON.stringify([samples, near, geometry])
  if (!fits.has(key)) {
    if (fits.size >= 16) fits.delete(fits.keys().next().value as string)
    fits.set(key, fitHead(samples, near, geometry))
  }
  return fits.get(key) ?? null
}

// Finest the beam can be jogged onto a spot by eye, in degrees: the fit's
// error can't be taken as better than this.
const JOG_DEGREES = 0.25
// Beyond the calibrated area the estimate grows by its distance from it over
// this (room widths): twice as loose that far out, three times at double.
const EXTRAPOLATION = 0.15
export const PRECISION_GRID = 24
// Misses at or above this (room widths) are drawn as the worst.
export const PRECISION_WORST = 0.06

// Expected miss, in room widths, of aiming a head at each cell of the floor
// (row by row), or null where it can't reach. An estimate from the fit's
// error, how steeply the beam lands, and how far the spot is from the points
// it was calibrated on, not a measurement. Kept per fit, which is replaced
// whenever the points it came from change.
const grids = new WeakMap<HeadFit, (number | null)[]>()
export function precisionGrid(c: HeadCalibration): (number | null)[] | null {
  if (!c.fit) return null
  const cached = grids.get(c.fit)
  if (cached) return cached
  const { model, rms } = c.fit
  const sigma = Math.max(rms, JOG_DEGREES)
  const grid = Array.from({ length: PRECISION_GRID ** 2 }, (_, i) => {
    const p = {
      x: ((i % PRECISION_GRID) + 0.5) / PRECISION_GRID,
      y: (Math.floor(i / PRECISION_GRID) + 0.5) / PRECISION_GRID,
    }
    if (!aimAt(model, p)) return null
    const outside = distanceOutsideCoverage(c.hull, p, model.aspect)
    return aimMiss(model, p, sigma) * (1 + outside / EXTRAPOLATION)
  })
  grids.set(c.fit, grid)
  return grid
}

// Why a head can't aim yet, in a sentence, or null once it has a fit.
export function calibrationIssue(head: Fixture, c: HeadCalibration): string | null {
  if (c.fit) return null
  const missing = c.needed - c.saved.length
  if (missing > 0)
    return `Save ${missing} more ${missing === 1 ? 'point' : 'points'} to aim ${head.name}.`
  const [[id, earlier] = []] = c.repeats
  const point = c.saved.find((p) => p.id === id)
  if (point && earlier)
    return `${point.name} has the same aim as ${earlier.name}. Jog ${head.name} onto ${point.name} and update it.`
  return c.geometry
    ? `The saved points don't agree with the room size and ${head.name}'s height. Check them, and each point's aim.`
    : `The saved points don't agree on where ${head.name} hangs. Check each point's aim.`
}

// A head's pan/tilt as the output has them now (16-bit each).
export function livePanTilt(head: Fixture, channels: number[] | null | undefined): PanTilt | null {
  if (!channels) return null
  const at = (offset: number) => channels[head.address - 1 + offset] ?? 0
  return { pan: at(0) * 256 + at(1), tilt: at(2) * 256 + at(3) }
}

// Channel values for pan/tilt, from the head's first channel.
export const panTiltValues = ({ pan, tilt }: PanTilt) => [...coarseFine(pan), ...coarseFine(tilt)]

// Profile offsets of the channels set here (see FIXTURE_PROFILES.moving_head).
export const SPEED_OFFSET = 4
export const DIMMER_OFFSET = 5
