import type { FixtureType } from '@stagehand/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { api } from '@/lib/api'

export type Room = InferResponseType<typeof api.rooms.$get, 200>[number]
export type Fixture = InferResponseType<
  (typeof api.rooms)[':roomId']['fixtures']['$get'],
  200
>[number]
export type Position = NonNullable<Fixture['position']>
export type FixtureInput = {
  name: string
  type: FixtureType
  address: number
  position: Position | null
  height?: number | null
}

// Turns an error response's `{ error }` into a thrown Error.
export async function failure(res: { status: number; json(): Promise<unknown> }) {
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return new Error(body?.error ?? `Request failed (${res.status})`)
}

export const roomsQuery = queryOptions({
  queryKey: ['rooms'],
  queryFn: async () => {
    const res = await api.rooms.$get()
    if (!res.ok) throw await failure(res)
    return res.json()
  },
})

export const fixturesQuery = (roomId: string) =>
  queryOptions({
    queryKey: ['rooms', roomId, 'fixtures'],
    queryFn: async () => {
      const res = await api.rooms[':roomId'].fixtures.$get({ param: { roomId: roomId } })
      if (!res.ok) throw await failure(res)
      return res.json()
    },
  })

export function useRoomMutations() {
  const queryClient = useQueryClient()
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ['rooms'] })
  const param = (id: string) => ({ roomId: id })

  return {
    create: useMutation({
      mutationFn: async (name: string) => {
        const res = await api.rooms.$post({ json: { name } })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess,
    }),
    rename: useMutation({
      // `newId` changes the room's ID, which everything in it follows.
      mutationFn: async ({ id, name, newId }: { id: string; name?: string; newId?: string }) => {
        const res = await api.rooms[':roomId'].$patch({
          param: param(id),
          json: { name, id: newId },
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess,
    }),
    // Floor size in meters; null clears it.
    resize: useMutation({
      mutationFn: async ({
        id,
        ...json
      }: { id: string } & Partial<{ width: number | null; depth: number | null }>) => {
        const res = await api.rooms[':roomId'].$patch({ param: param(id), json })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].$delete({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess,
    }),
    activate: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].activate.$post({ param: param(id) })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess,
    }),
  }
}

export function useFixtureMutations(roomId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = fixturesQuery(roomId)
  const param = (id: string) => ({ roomId: roomId, fixtureId: id })
  // Writes the server's copy straight into the cache, so a dragged fixture
  // doesn't jump back while the list refetches.
  const store = (fixture: Fixture) =>
    queryClient.setQueryData(queryKey, (list) =>
      list?.some((f) => f.id === fixture.id)
        ? list.map((f) => (f.id === fixture.id ? fixture : f))
        : [...(list ?? []), fixture],
    )

  return {
    create: useMutation({
      mutationFn: async (json: FixtureInput) => {
        const res = await api.rooms[':roomId'].fixtures.$post({
          param: { roomId: roomId },
          json,
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    update: useMutation({
      // `newId` changes the fixture's ID.
      mutationFn: async ({
        id,
        newId,
        ...json
      }: Partial<FixtureInput> & { id: string; newId?: string }) => {
        const res = await api.rooms[':roomId'].fixtures[':fixtureId'].$patch({
          param: param(id),
          json: { ...json, id: newId },
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: (fixture, { id }) => {
        if (id === fixture.id) return store(fixture)
        queryClient.setQueryData(queryKey, (list) => list?.map((f) => (f.id === id ? fixture : f)))
        // Target positions refer to heads by ID.
        void queryClient.invalidateQueries({ queryKey: ['rooms', roomId, 'targets'] })
      },
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].fixtures[':fixtureId'].$delete({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess: (_, id) =>
        queryClient.setQueryData(queryKey, (list) => list?.filter((f) => f.id !== id)),
    }),
  }
}

export async function startIdentify(roomId: string, fixtureId: string) {
  const param = { roomId: roomId, fixtureId: fixtureId }
  const res = await api.rooms[':roomId'].fixtures[':fixtureId'].identify.$post({ param })
  if (!res.ok) throw await failure(res)
}

export async function stopIdentify(roomId: string, fixtureId: string) {
  const param = { roomId: roomId, fixtureId: fixtureId }
  await api.rooms[':roomId'].fixtures[':fixtureId'].identify.$delete({ param })
}

// Width over depth, once both are measured; the plan is drawn to this shape.
export const roomAspect = (room: Room) =>
  room.width && room.depth ? room.width / room.depth : undefined
