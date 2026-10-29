import type { AppType } from '@stagehand/server/app'
import { queryOptions } from '@tanstack/react-query'
import { hc } from 'hono/client'

// Typed client generated from the server's route definitions. Auth rides on
// the session cookie, so no headers are needed.
export const api = hc<AppType>(window.location.origin).api

export const sessionQuery = queryOptions({
  queryKey: ['session'],
  queryFn: async () => (await api.auth.session.$get()).ok,
  staleTime: Number.POSITIVE_INFINITY,
})

export const healthQuery = queryOptions({
  queryKey: ['health'],
  queryFn: async () => {
    const res = await api.health.$get()
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`)
    return res.json()
  },
  refetchInterval: 5000,
})
