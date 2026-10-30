import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import type { ViewProps } from '@/components/configure/shared'
import { calibrationQuery, isHead, targetsQuery } from '@/lib/targets'
import { CalibratePanel } from './calibrate-panel'
import { ObjectsPanel } from './objects-panel'

// Configure › Targets: objects the moving heads can be aimed at, and the
// calibration that makes aiming possible.
export function TargetsView({ room, fixtures }: ViewProps) {
  const search = useSearch({ from: '/_authed/configure' })
  const navigate = useNavigate({ from: '/configure' })
  const targets = useQuery(targetsQuery(room.id))
  const points = useQuery(calibrationQuery(room.id))
  const heads = fixtures.filter(isHead)
  const mode = search.mode ?? 'objects'

  const set = (changes: Partial<typeof search>) =>
    navigate({ search: (s) => ({ ...s, ...changes }), replace: true })

  const modeSwitch = (
    <nav
      aria-label="Targets mode"
      className="flex gap-[3px] rounded-[10px] bg-surface-2 p-[3px] text-xs"
    >
      {(['objects', 'calibrate'] as const).map((m) => (
        <Link
          key={m}
          from="/configure"
          search={(s) => ({ ...s, mode: m === 'objects' ? undefined : m })}
          replace
          className={
            mode === m
              ? 'rounded-[7px] bg-surface-3 px-2.5 py-1.5 text-foreground'
              : 'rounded-[7px] px-2.5 py-1.5 text-muted-foreground hover:text-foreground'
          }
        >
          {m === 'objects' ? 'Objects' : 'Calibrate'}
        </Link>
      ))}
    </nav>
  )

  if (!targets.isSuccess || !points.isSuccess) {
    const error = targets.error ?? points.error
    return error ? <p className="text-sm text-destructive">{error.message}</p> : null
  }

  if (mode === 'calibrate') {
    const head = heads.find((h) => h.id === search.head) ?? heads[0]
    const point = points.data.find((p) => p.id === search.point && p.fixtureId === head?.id)
    return (
      <CalibratePanel
        room={room}
        fixtures={fixtures}
        heads={heads}
        points={points.data}
        head={head}
        point={point}
        onSelectHead={(id) => set({ head: id, point: undefined })}
        onSelectPoint={(id) => set({ point: id ?? undefined })}
        modeSwitch={modeSwitch}
      />
    )
  }

  return (
    <ObjectsPanel
      room={room}
      fixtures={fixtures}
      heads={heads}
      points={points.data}
      targets={targets.data}
      selected={targets.data.find((t) => t.id === search.target)}
      onSelect={(id) => set({ target: id ?? undefined })}
      modeSwitch={modeSwitch}
    />
  )
}
