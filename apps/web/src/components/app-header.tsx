import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { api, sessionQuery } from '@/lib/api'
import { useLive } from '@/lib/live'

const SOON = ['Effects', 'Scenes', 'Perform']

// Top bar shared by the main pages. `room` is the page's room switcher.
export function AppHeader({ room }: { room?: ReactNode }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logout = async () => {
    await api.auth.logout.$post()
    queryClient.setQueryData(sessionQuery.queryKey, false)
    await navigate({ to: '/login' })
  }

  return (
    <header className="flex flex-wrap items-center gap-4">
      <span className="pr-2 text-[17px] font-semibold">Stagehand</span>
      <nav className="flex flex-wrap gap-1 rounded-xl bg-surface-1 p-1">
        <Link
          to="/configure"
          className="rounded-[9px] px-[18px] py-2.5 text-muted-foreground data-[status=active]:bg-primary data-[status=active]:font-semibold data-[status=active]:text-primary-foreground"
        >
          Configure
        </Link>
        {SOON.map((label) => (
          <span
            key={label}
            aria-disabled="true"
            title="Coming soon"
            className="cursor-not-allowed rounded-[9px] px-[18px] py-2.5 text-muted-foreground/50"
          >
            {label}
          </span>
        ))}
      </nav>
      <div className="flex-1" />
      {room}
      <DmxStatus />
      <Button variant="outline" onClick={() => api.dmx.blackout.$post()}>
        Blackout
      </Button>
      <Button variant="ghost" size="icon" aria-label="Sign out" onClick={logout}>
        <LogOut />
      </Button>
    </header>
  )
}

function DmxStatus() {
  const { socket, dmx } = useLive()
  const label =
    socket !== 'open'
      ? 'Server offline'
      : !dmx?.connected
        ? 'No interface'
        : `${portName(dmx.port)} · ${dmx.fps} fps`
  const ok = socket === 'open' && dmx?.connected
  return (
    <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
      <span className={ok ? 'size-2 rounded-full bg-live' : 'size-2 rounded-full bg-warning'} />
      {label}
    </span>
  )
}

const portName = (port: string | null) => port?.split('/').pop() ?? 'DMX'
