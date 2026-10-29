import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { sessionQuery } from '@/lib/api'

// Layout route: everything under _authed/ requires a valid session.
export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context, location }) => {
    const authenticated = await context.queryClient.ensureQueryData(sessionQuery)
    if (!authenticated) throw redirect({ to: '/login', search: { redirect: location.href } })
  },
  component: Outlet,
})
