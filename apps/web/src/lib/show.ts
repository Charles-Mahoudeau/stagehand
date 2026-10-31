import type { ParamsInput } from '@stagehand/shared'
import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import type { InferResponseType } from 'hono/client'
import { api } from '@/lib/api'
import { failure } from '@/lib/rooms'

// Effects, scenes and the cue list of a room, with their mutations. Edits are
// live: the server applies them to the running output at once.

type Room = (typeof api.rooms)[':roomId']
export type Effect = InferResponseType<Room['effects']['$get'], 200>[number]
export type Scene = InferResponseType<Room['scenes']['$get'], 200>[number]
export type Cue = InferResponseType<Room['cues']['$get'], 200>[number]

const rid = (roomId: string) => ({ roomId: roomId })

export const effectsQuery = (roomId: string) =>
  queryOptions({
    queryKey: ['rooms', roomId, 'effects'],
    queryFn: async () => {
      const res = await api.rooms[':roomId'].effects.$get({ param: rid(roomId) })
      if (!res.ok) throw await failure(res)
      return res.json()
    },
  })

export const scenesQuery = (roomId: string) =>
  queryOptions({
    queryKey: ['rooms', roomId, 'scenes'],
    queryFn: async () => {
      const res = await api.rooms[':roomId'].scenes.$get({ param: rid(roomId) })
      if (!res.ok) throw await failure(res)
      return res.json()
    },
  })

export const cuesQuery = (roomId: string) =>
  queryOptions({
    queryKey: ['rooms', roomId, 'cues'],
    queryFn: async () => {
      const res = await api.rooms[':roomId'].cues.$get({ param: rid(roomId) })
      if (!res.ok) throw await failure(res)
      return res.json()
    },
  })

export function useEffectMutations(roomId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = effectsQuery(roomId)
  const param = (id: string) => ({ ...rid(roomId), effectId: id })
  const store = (effect: Effect) =>
    queryClient.setQueryData(queryKey, (list) =>
      list?.some((e) => e.id === effect.id)
        ? list.map((e) => (e.id === effect.id ? effect : e))
        : [...(list ?? []), effect],
    )

  return {
    create: useMutation({
      mutationFn: async (json: {
        name: string
        generator: Effect['generator']
        params?: ParamsInput
        pad?: boolean
      }) => {
        const res = await api.rooms[':roomId'].effects.$post({ param: rid(roomId), json })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    update: useMutation({
      mutationFn: async ({
        id,
        newId,
        ...json
      }: { id: string; newId?: string } & Partial<{
        name: string
        params: ParamsInput
        pad: boolean
      }>) => {
        const res = await api.rooms[':roomId'].effects[':effectId'].$patch({
          param: param(id),
          json: { ...json, id: newId },
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: (effect, { id }) => {
        if (id === effect.id) return store(effect)
        queryClient.setQueryData(queryKey, (list) => list?.map((e) => (e.id === id ? effect : e)))
        // Scenes refer to effects by ID.
        void queryClient.invalidateQueries({ queryKey: ['rooms', roomId, 'scenes'] })
      },
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].effects[':effectId'].$delete({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess: (_, id) => {
        queryClient.setQueryData(queryKey, (list) => list?.filter((e) => e.id !== id))
        void queryClient.invalidateQueries({ queryKey: ['rooms', roomId, 'scenes'] })
      },
    }),
    fire: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].effects[':effectId'].fire.$post({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
    }),
    stop: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].effects[':effectId'].stop.$post({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
    }),
  }
}

export function useSceneMutations(roomId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = scenesQuery(roomId)
  const param = (id: string) => ({ ...rid(roomId), sceneId: id })
  const store = (scene: Scene) =>
    queryClient.setQueryData(queryKey, (list) =>
      list?.some((s) => s.id === scene.id)
        ? list.map((s) => (s.id === scene.id ? scene : s))
        : [...(list ?? []), scene],
    )

  return {
    create: useMutation({
      mutationFn: async (json: Partial<Omit<Scene, 'id' | 'roomId'>> & { name: string }) => {
        const res = await api.rooms[':roomId'].scenes.$post({ param: rid(roomId), json })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: store,
    }),
    update: useMutation({
      mutationFn: async ({
        id,
        newId,
        ...json
      }: { id: string; newId?: string } & Partial<Omit<Scene, 'id' | 'roomId'>>) => {
        const res = await api.rooms[':roomId'].scenes[':sceneId'].$patch({
          param: param(id),
          json: { ...json, id: newId },
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: (scene, { id }) => {
        if (id === scene.id) return store(scene)
        queryClient.setQueryData(queryKey, (list) => list?.map((s) => (s.id === id ? scene : s)))
        // Cues refer to scenes by ID.
        void queryClient.invalidateQueries({ queryKey: ['rooms', roomId, 'cues'] })
      },
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].scenes[':sceneId'].$delete({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess: (_, id) => {
        queryClient.setQueryData(queryKey, (list) => list?.filter((s) => s.id !== id))
        void queryClient.invalidateQueries({ queryKey: ['rooms', roomId, 'cues'] })
      },
    }),
    go: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].scenes[':sceneId'].go.$post({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
    }),
  }
}

export function useCueMutations(roomId: string) {
  const queryClient = useQueryClient()
  const { queryKey } = cuesQuery(roomId)
  const param = (id: string) => ({ ...rid(roomId), cueId: id })
  const refresh = () => queryClient.invalidateQueries({ queryKey })

  return {
    create: useMutation({
      mutationFn: async (json: { sceneId: string; name?: string }) => {
        const res = await api.rooms[':roomId'].cues.$post({ param: rid(roomId), json })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: refresh,
    }),
    update: useMutation({
      mutationFn: async ({
        id,
        newId,
        ...json
      }: { id: string; newId?: string } & Partial<Omit<Cue, 'id' | 'roomId' | 'position'>>) => {
        const res = await api.rooms[':roomId'].cues[':cueId'].$patch({
          param: param(id),
          json: { ...json, id: newId },
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].cues[':cueId'].$delete({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
      onSuccess: refresh,
    }),
    order: useMutation({
      mutationFn: async (ids: string[]) => {
        const res = await api.rooms[':roomId'].cues.order.$put({
          param: rid(roomId),
          json: { ids },
        })
        if (!res.ok) throw await failure(res)
        return res.json()
      },
      onSuccess: (list) => queryClient.setQueryData(queryKey, list),
    }),
    go: useMutation({
      mutationFn: async (id: string) => {
        const res = await api.rooms[':roomId'].cues[':cueId'].go.$post({ param: param(id) })
        if (!res.ok) throw await failure(res)
      },
    }),
  }
}

// Transport: next, previous, release everything.
export function usePlaybackMutations(roomId: string) {
  const run = (action: 'go' | 'back' | 'stop') => async () => {
    const res = await api.rooms[':roomId'].playback[action].$post({ param: rid(roomId) })
    if (!res.ok) throw await failure(res)
  }
  return {
    go: useMutation({ mutationFn: run('go') }),
    back: useMutation({ mutationFn: run('back') }),
    stop: useMutation({ mutationFn: run('stop') }),
  }
}
