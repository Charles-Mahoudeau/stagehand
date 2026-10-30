import {
  type CalibrationSample,
  coarseFine,
  coverage,
  fitHead,
  type HeadFit,
  type PanTilt,
  type PlanPoint,
} from '@stagehand/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { api } from '@/lib/api'
import { type Fixture, failure } from '@/lib/rooms'

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

// A head's saved calibration points, the fit through them (null under four)
// and the floor area they cover.
export type HeadCalibration = {
  points: CalibrationPoint[]
  saved: CalibrationPoint[]
  fit: HeadFit | null
  hull: PlanPoint[]
}

export function headCalibration(head: Fixture, points: CalibrationPoint[]): HeadCalibration {
  const own = points.filter((p) => p.fixtureId === head.id)
  const saved = own.filter((p) => p.pan !== null && p.tilt !== null)
  const samples: CalibrationSample[] = saved.map((p) => ({
    ...p.position,
    pan: p.pan as number,
    tilt: p.tilt as number,
  }))
  return {
    points: own,
    saved,
    fit: fitHead(samples, head.position),
    hull: coverage(saved.map((p) => p.position)),
  }
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
