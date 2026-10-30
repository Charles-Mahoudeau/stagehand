import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { cn } from 'cn'
import { LogOut } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { api, sessionQuery } from '@/lib/api'
import { useLive } from '@/lib/live'

const SOON = ['Effects', 'Scenes']

type Density = 'compact' | 'touch'

type Props = {
  // The page's room switcher, shown on the right of the top bar.
  room?: ReactNode
  // Page-level navigation, shown after the modes (Configure's Patch / Targets).
  nav?: ReactNode
  // Left side of the status bar: what the page is showing.
  status?: ReactNode
  // Right side of the status bar: the current selection.
  selection?: ReactNode
  // `touch` for pages used on a tablet during a show: bigger targets.
  density?: Density
  children: ReactNode
}

// The fixed frame around every main page: top bar, work area, status bar.
// It fills the window and never scrolls; panels in `children` scroll themselves.
export function AppShell({ room, nav, status, selection, density = 'compact', children }: Props) {
  const touch = density === 'touch'
  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <TopBar room={room} nav={nav} touch={touch} />
      <main className={cn('flex min-h-0 flex-1 gap-1 p-1', touch && 'gap-1.5 p-1.5')}>
        {children}
      </main>
      <StatusBar status={status} selection={selection} touch={touch} />
    </div>
  )
}

function TopBar({ room, nav, touch }: { room?: ReactNode; nav?: ReactNode; touch: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const logout = async () => {
    await api.auth.logout.$post()
    queryClient.setQueryData(sessionQuery.queryKey, false)
    await navigate({ to: '/login' })
  }
  const mode = cn(
    'flex items-center rounded-md text-muted-foreground data-[status=active]:bg-primary data-[status=active]:font-semibold data-[status=active]:text-primary-foreground',
    touch ? 'h-10 px-[18px] text-sm' : 'h-7 px-3.5 text-[13px]',
  )

  return (
    <header
      className={cn(
        'flex shrink-0 items-center gap-2 border-b border-border-subtle bg-surface-0 px-2.5',
        touch ? 'h-[52px]' : 'h-10',
      )}
    >
      <span className="pr-2.5 text-sm font-semibold">Stagehand</span>
      <nav aria-label="Modes" className="flex gap-1">
        <Link to="/configure" className={mode}>
          Configure
        </Link>
        {SOON.map((label) => (
          <span
            key={label}
            aria-disabled="true"
            title="Coming soon"
            className={cn(mode, 'cursor-not-allowed text-muted-foreground/45')}
          >
            {label}
          </span>
        ))}
        <Link to="/perform" className={mode}>
          Perform
        </Link>
      </nav>
      {nav && (
        <>
          <span className="mx-1.5 h-4 w-px bg-input" />
          {nav}
        </>
      )}
      <div className="flex-1" />
      {room}
      <DmxStatus />
      <Button
        variant="outline"
        size={touch ? 'default' : 'xs'}
        className={cn(!touch && 'h-7')}
        onClick={() => api.dmx.blackout.$post()}
      >
        Blackout
      </Button>
      {!touch && (
        <Button variant="ghost" size="icon-xs" aria-label="Sign out" onClick={logout}>
          <LogOut />
        </Button>
      )}
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
    <span className="flex items-center gap-2 px-1 font-mono text-[11px] text-muted-foreground">
      <span className={ok ? 'size-2 rounded-full bg-live' : 'size-2 rounded-full bg-warning'} />
      {label}
    </span>
  )
}

function StatusBar({
  status,
  selection,
  touch,
}: {
  status?: ReactNode
  selection?: ReactNode
  touch: boolean
}) {
  const { socket } = useLive()
  return (
    <footer
      className={cn(
        'flex shrink-0 items-center gap-4 border-t border-border-subtle bg-surface-0 px-2.5 text-muted-foreground',
        touch ? 'h-7 text-xs' : 'h-6 text-[11px]',
      )}
    >
      <span className="flex items-center gap-1.5">
        <span className={cn('size-2 rounded-full', socket === 'open' ? 'bg-live' : 'bg-warning')} />
        {socket === 'open' ? 'Connected' : 'Reconnecting…'}
      </span>
      {status}
      <div className="flex-1" />
      {selection}
    </footer>
  )
}

const portName = (port: string | null) => port?.split('/').pop() ?? 'DMX'
