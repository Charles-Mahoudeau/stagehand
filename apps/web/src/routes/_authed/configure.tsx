import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { AppShell } from '@/components/app-shell'
import { type Dock, PatchWorkspace } from '@/components/configure/patch-workspace'
import { RoomMenu } from '@/components/room-menu'
import { TargetsWorkspace } from '@/components/targets/targets-workspace'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLive } from '@/lib/live'
import { findOverlaps, overlappingIds } from '@/lib/patch'
import { fixturesQuery, roomsQuery, stopIdentify, useRoomMutations } from '@/lib/rooms'

const VIEWS = { plan: 'Patch', targets: 'Targets' } as const

export const Route = createFileRoute('/_authed/configure')({
  // Unknown values (old links to the removed Sheet and Universe views) fall back to the default.
  validateSearch: z.object({
    view: z.enum(['plan', 'targets']).optional().catch(undefined),
    dock: z.enum(['universe', 'sheet', 'problems']).optional().catch(undefined),
    room: z.number().int().optional(),
    fixture: z.number().int().optional(),
    // Targets view: what is picked.
    target: z.number().int().optional(),
    head: z.number().int().optional(),
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
  const { activate } = useRoomMutations()
  const view = search.view ?? 'plan'
  const dock: Dock = search.dock ?? 'universe'

  const select = (id: number | null) =>
    navigate({ search: (s) => ({ ...s, fixture: id ?? undefined }), replace: true })
  useStopIdentifyOnLeave(room?.id, search.fixture)

  const list = fixtures.data ?? []
  const overlaps = findOverlaps(list)
  const selected = list.find((f) => f.id === search.fixture)
  const ready = !!room && fixtures.isSuccess

  return (
    <AppShell
      nav={
        <nav aria-label="Configure views" className="flex gap-1">
          {Object.entries(VIEWS).map(([key, label]) => (
            <Link
              key={key}
              from={Route.fullPath}
              search={(s) => ({ ...s, view: key === 'plan' ? undefined : (key as typeof view) })}
              activeOptions={{ includeSearch: true, explicitUndefined: true }}
              className="flex h-7 items-center rounded-md px-3 text-[13px] text-muted-foreground data-[status=active]:bg-surface-3 data-[status=active]:text-foreground"
            >
              {label}
            </Link>
          ))}
        </nav>
      }
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
                }),
              })
            }
          />
        )
      }
      status={
        room && (
          <>
            <span>
              Room: {room.name} ({room.active ? 'active' : 'not driven'})
            </span>
            {!room.active && (
              <button
                type="button"
                className="text-foreground underline underline-offset-2"
                disabled={activate.isPending}
                onClick={() => activate.mutate(room.id)}
              >
                Make active
              </button>
            )}
            {ready && <span className="font-mono">{list.length} fixtures</span>}
            {overlaps.length > 0 && (
              <Link
                from={Route.fullPath}
                search={(s) => ({ ...s, view: undefined, dock: 'problems' })}
                className="text-warning"
              >
                {overlaps.length === 1
                  ? '1 channel overlap'
                  : `${overlaps.length} channel overlaps`}
              </Link>
            )}
          </>
        )
      }
      selection={selected && <span>Selection: {selected.name}</span>}
    >
      {rooms.isSuccess && !room ? (
        <FirstRoom />
      ) : ready ? (
        <Workspace
          view={view}
          dock={dock}
          onDock={(d) => navigate({ search: (s) => ({ ...s, dock: d }), replace: true })}
          overlaps={overlaps}
          room={room}
          fixtures={list}
          selected={selected}
          onSelect={select}
          overlapping={overlappingIds(overlaps)}
        />
      ) : (
        (rooms.error ?? fixtures.error) && (
          <p className="p-3 text-sm text-destructive">{(rooms.error ?? fixtures.error)?.message}</p>
        )
      )}
    </AppShell>
  )
}

function Workspace({
  view,
  ...props
}: Parameters<typeof PatchWorkspace>[0] & { view: keyof typeof VIEWS }) {
  if (view === 'targets') return <TargetsWorkspace {...props} />
  return <PatchWorkspace {...props} />
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

function FirstRoom() {
  const { create } = useRoomMutations()
  const [name, setName] = useState('')
  return (
    <form
      className="m-auto flex w-full max-w-sm flex-col gap-3 rounded-2xl bg-surface-1 p-5"
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
