import { coarseFine, type PanTilt } from '@stagehand/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { api } from '@/lib/api'
import { type Fixture, failure } from '@/lib/rooms'

export type Target = InferResponseType<
  (typeof api.rooms)[':roomId']['targets']['$get'],
  200
>[number]
export type AimResult = InferResponseType<(typeof api.rooms)[':roomId']['aim']['$post'], 200>

export const targetsQuery = (roomId: string) =>
  queryOptions({
    queryKey: ['rooms', roomId, 'targets'],
    queryFn: async () => {
      const res = await api.rooms[':roomId'].targets.$get({ param: { roomId: roomId } })
      if (!res.ok) throw await failure(res)
      return res.json()
    },
  })

export function useTargetMutations(roomId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = targetsQuery(roomId)
  const param = (id: string) => ({ roomId: roomId, targetId: id })
  const position = (id: string, fixtureId: string) => ({
    ...param(id),
    fixtureId,
  })
  // Writes the server's copy straight into the cache so the list doesn't
  // lag behind while it refetches.
  const store = (target: Target) =>
    queryClient.setQueryData(queryKey, (list) =>
      list?.some((t) => t.id === target.id)
        ? list.map((t) => (t.id === target.id ? target : t))
        : [...(list ?? []), target],
    )

  return {
    create: useMutation({
      mutationFn: async (json: { name: string }) => {
        const res = await api.rooms[':roomId'].targets.$post({
          param: { roomId: roomId },
          json,
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    update: useMutation({
      // `newId` changes the target's ID, which scenes refer to it by.
      mutationFn: async ({
        id,
        newId,
        name,
      }: { id: string } & Partial<{ name: string; newId: string }>) => {
        const res = await api.rooms[':roomId'].targets[':targetId'].$patch({
          param: param(id),
          json: { name, id: newId },
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: (target, { id }) =>
        queryClient.setQueryData(queryKey, (list) => list?.map((t) => (t.id === id ? target : t))),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].targets[':targetId'].$delete({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess: (_, id) =>
        queryClient.setQueryData(queryKey, (list) => list?.filter((t) => t.id !== id)),
    }),
    // Stores where a head points for a target.
    setPosition: useMutation({
      mutationFn: async ({
        id,
        fixtureId,
        ...json
      }: { id: string; fixtureId: string } & PanTilt) => {
        const res = await api.rooms[':roomId'].targets[':targetId'].positions[':fixtureId'].$put({
          param: position(id, fixtureId),
          json,
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    clearPosition: useMutation({
      mutationFn: async ({ id, fixtureId }: { id: string; fixtureId: string }) => {
        const res = await api.rooms[':roomId'].targets[':targetId'].positions[':fixtureId'].$delete(
          { param: position(id, fixtureId) },
        )
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
  }
}

// Sends heads to a target. Heads with nothing stored for it come back in
// `skipped`.
export async function aim(roomId: string, fixtureIds: string[], targetId: string) {
  const res = await api.rooms[':roomId'].aim.$post({
    param: { roomId: roomId },
    json: { fixtureIds, targetId },
  })
  if (!res.ok) throw await failure(res)
  return res.json()
}

export const isHead = (f: Fixture) => f.type === 'moving_head'

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
