import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, sessionQuery } from '@/lib/api'

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
})

function LoginPage() {
  const { redirect } = Route.useSearch()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [token, setToken] = useState('')

  const login = useMutation({
    mutationFn: async (token: string) => {
      const res = await api.auth.login.$post({ json: { token } })
      if (!res.ok) throw new Error('Invalid token')
    },
    onSuccess: async () => {
      queryClient.setQueryData(sessionQuery.queryKey, true)
      await navigate({ to: redirect ?? '/' })
    },
  })

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Stagehand</CardTitle>
          <CardDescription>Enter the access token to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              login.mutate(token)
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="token">Token</Label>
              <Input
                id="token"
                type="password"
                autoFocus
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
              {login.isError && <p className="text-sm text-destructive">{login.error.message}</p>}
            </div>
            <Button type="submit" variant="default" disabled={login.isPending || !token}>
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
