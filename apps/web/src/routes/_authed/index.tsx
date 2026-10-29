import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { api, healthQuery, sessionQuery } from '@/lib/api'
import { useSocket } from '@/lib/ws'

export const Route = createFileRoute('/_authed/')({
  component: HomePage,
})

function HomePage() {
  const health = useQuery(healthQuery)
  const socket = useSocket()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logout = async () => {
    await api.auth.logout.$post()
    queryClient.setQueryData(sessionQuery.queryKey, false)
    await navigate({ to: '/login' })
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Stagehand</h1>
        <Button variant="quiet" size="sm" onClick={logout}>
          Sign out
        </Button>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Server</CardTitle>
          <CardDescription>
            API reference at{' '}
            <a className="underline" href="/docs">
              /docs
            </a>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant={health.isSuccess ? 'live' : health.isError ? 'destructive' : 'idle'}>
            API: {health.isSuccess ? `v${health.data.version}` : health.isError ? 'down' : '…'}
          </Badge>
          <Badge variant={socket.status === 'open' ? 'live' : 'idle'}>
            WebSocket: {socket.status}
          </Badge>
        </CardContent>
      </Card>
    </div>
  )
}
