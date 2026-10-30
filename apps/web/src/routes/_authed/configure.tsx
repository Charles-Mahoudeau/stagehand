import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { AppHeader } from '@/components/app-header'
import { PlanView } from '@/components/configure/plan-view'
import type { ViewProps } from '@/components/configure/shared'
import { SheetView } from '@/components/configure/sheet-view'
import { UniverseView } from '@/components/configure/universe-view'
import { RoomMenu } from '@/components/room-menu'
import { TargetsView } from '@/components/targets/targets-view'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLive } from '@/lib/live'
import { findOverlaps, overlappingIds } from '@/lib/patch'
import { fixturesQuery, roomsQuery, stopIdentify, useRoomMutations } from '@/lib/rooms'

const VIEWS = { plan: 'Plan', sheet: 'Sheet', universe: 'Universe', targets: 'Targets' } as const

export const Route = createFileRoute('/_authed/configure')({
  validateSearch: z.object({
    view: z.enum(['plan', 'sheet', 'universe', 'targets']).optional(),
    room: z.number().int().optional(),
    fixture: z.number().int().optional(),
    // Targets view: calibrating rather than placing objects, and what is picked.
    mode: z.enum(['calibrate']).optional(),
    target: z.number().int().optional(),
    head: z.number().int().optional(),
    point: z.number().int().optional(),
  }),
  component: ConfigurePage,
})

function ConfigurePage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const rooms = useQuery(roomsQuery)
  const room =
    rooms.data?.find((r) => r.id === search.room) ??
    rooms.data?.find((r) => r.active) ??
    rooms.data?.[0]
  const fixtures = useQuery({ ...fixturesQuery(room?.id ?? 0), enabled: !!room })
  const view = search.view ?? 'plan'

  const select = (id: number | null) =>
    navigate({ search: (s) => ({ ...s, fixture: id ?? undefined }), replace: true })
  useStopIdentifyOnLeave(room?.id, search.fixture)

  const list = fixtures.data ?? []
  const overlaps = findOverlaps(list)

  return (
    <div className="flex min-h-svh flex-col gap-4 px-5 py-4">
      <AppHeader
        room={
          rooms.data && (
            <RoomMenu
              rooms={rooms.data}
              room={room}
              onSelect={(id) =>
                navigate({
                  search: (s) => ({
                    ...s,
                    room: id,
                    fixture: undefined,
                    target: undefined,
                    head: undefined,
                    point: undefined,
                  }),
                })
              }
            />
          )
        }
      />

      {rooms.isSuccess && !room ? (
        <FirstRoom />
      ) : room && fixtures.isSuccess ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <nav
              aria-label="Configure views"
              className="flex gap-[3px] rounded-lg bg-surface-1 p-[3px] text-[13px]"
            >
              {Object.entries(VIEWS).map(([key, label]) => (
                <Link
                  key={key}
                  from={Route.fullPath}
                  search={(s) => ({
                    ...s,
                    view: key === 'plan' ? undefined : (key as typeof view),
                  })}
                  activeOptions={{ includeSearch: true, explicitUndefined: true }}
                  className="rounded-[7px] px-3.5 py-2 text-muted-foreground data-[status=active]:bg-surface-3 data-[status=active]:text-foreground"
                >
                  {label}
                </Link>
              ))}
            </nav>
            {!room.active && <InactiveNotice id={room.id} name={room.name} />}
            {overlaps.length > 0 && (
              <Badge variant="warning" title={overlaps.map(describeOverlap).join('\n')}>
                {overlaps.length === 1
                  ? describeOverlap(overlaps[0] as (typeof overlaps)[number])
                  : `${overlaps.length} channel overlaps`}
              </Badge>
            )}
          </div>
          <ConfigureView
            view={view}
            room={room}
            fixtures={list}
            selected={list.find((f) => f.id === search.fixture)}
            onSelect={select}
            overlapping={overlappingIds(overlaps)}
          />
        </>
      ) : (
        (rooms.error ?? fixtures.error) && (
          <p className="text-sm text-destructive">{(rooms.error ?? fixtures.error)?.message}</p>
        )
      )}
    </div>
  )
}

function ConfigureView({ view, ...props }: ViewProps & { view: keyof typeof VIEWS }) {
  if (view === 'sheet') return <SheetView {...props} />
  if (view === 'universe') return <UniverseView {...props} />
  if (view === 'targets') return <TargetsView {...props} />
  return <PlanView {...props} />
}

// The identify rainbow follows the selection: picking another fixture, or
// leaving Configure, stops it.
function useStopIdentifyOnLeave(roomId: number | undefined, selectedId: number | undefined) {
  const { identifying } = useLive()
  const current = useRef({ roomId, identifying })
  current.current = { roomId, identifying }

  // biome-ignore lint/correctness/useExhaustiveDependencies: only a change of selection should stop it, not identify starting
  useEffect(() => {
    if (roomId && identifying !== null && identifying !== selectedId) {
      void stopIdentify(roomId, identifying)
    }
  }, [selectedId])

  useEffect(
    () => () => {
      const { roomId, identifying } = current.current
      if (roomId && identifying !== null) void stopIdentify(roomId, identifying)
    },
    [],
  )
}

function describeOverlap(o: ReturnType<typeof findOverlaps>[number]) {
  const [a, b] = o.fixtures
  const [from, to] = o.channels
  return `${a?.name} and ${b?.name} overlap on ${from === to ? `channel ${from}` : `channels ${from}–${to}`}`
}

function InactiveNotice({ id, name }: { id: number; name: string }) {
  const { activate } = useRoomMutations()
  return (
    <span className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
      Editing {name}, which isn’t driven.
      <Button
        size="sm"
        className="h-8 rounded-md px-3 text-xs"
        disabled={activate.isPending}
        onClick={() => activate.mutate(id)}
      >
        Make active
      </Button>
    </span>
  )
}

function FirstRoom() {
  const { create } = useRoomMutations()
  const [name, setName] = useState('')
  return (
    <form
      className="mx-auto mt-24 flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface-1 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) create.mutate(name.trim())
      }}
    >
      <h2 className="text-[15px] font-semibold">Create your first room</h2>
      <p className="text-sm text-muted-foreground">
        A room holds a rig: its fixtures, their addresses and where they hang.
      </p>
      <Input
        aria-label="Room name"
        placeholder="Room name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      {create.error && <p className="text-sm text-destructive">{create.error.message}</p>}
      <Button type="submit" variant="default" disabled={!name.trim() || create.isPending}>
        Create room
      </Button>
    </form>
  )
}
