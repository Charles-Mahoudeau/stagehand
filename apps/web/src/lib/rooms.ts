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
}

// Turns an error response's `{ error }` into a thrown Error.
async function failure(res: { status: number; json(): Promise<unknown> }) {
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

export const fixturesQuery = (roomId: number) =>
  queryOptions({
    queryKey: ['rooms', roomId, 'fixtures'],
    queryFn: async () => {
      const res = await api.rooms[':roomId'].fixtures.$get({ param: { roomId: String(roomId) } })
      if (!res.ok) throw await failure(res)
      return res.json()
    },
  })

export function useRoomMutations() {
  const queryClient = useQueryClient()
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ['rooms'] })
  const param = (id: number) => ({ roomId: String(id) })

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
      mutationFn: async ({ id, name }: { id: number; name: string }) => {
        const res = await api.rooms[':roomId'].$patch({ param: param(id), json: { name } })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: async (id: number) => {
        const res = await api.rooms[':roomId'].$delete({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess,
    }),
    activate: useMutation({
      mutationFn: async (id: number) => {
        const res = await api.rooms[':roomId'].activate.$post({ param: param(id) })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess,
    }),
  }
}

export function useFixtureMutations(roomId: number) {
  const queryClient = useQueryClient()
  const { queryKey } = fixturesQuery(roomId)
  const param = (id: number) => ({ roomId: String(roomId), fixtureId: String(id) })
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
          param: { roomId: String(roomId) },
          json,
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    update: useMutation({
      mutationFn: async ({ id, ...json }: Partial<FixtureInput> & { id: number }) => {
        const res = await api.rooms[':roomId'].fixtures[':fixtureId'].$patch({
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
        const res = await api.rooms[':roomId'].fixtures[':fixtureId'].$delete({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess: (_, id) =>
        queryClient.setQueryData(queryKey, (list) => list?.filter((f) => f.id !== id)),
    }),
  }
}

export async function startIdentify(roomId: number, fixtureId: number) {
  const param = { roomId: String(roomId), fixtureId: String(fixtureId) }
  const res = await api.rooms[':roomId'].fixtures[':fixtureId'].identify.$post({ param })
  if (!res.ok) throw await failure(res)
}

export async function stopIdentify(roomId: number, fixtureId: number) {
  const param = { roomId: String(roomId), fixtureId: String(fixtureId) }
  await api.rooms[':roomId'].fixtures[':fixtureId'].identify.$delete({ param })
}
