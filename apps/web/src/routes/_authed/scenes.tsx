import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { AppShell } from '@/components/app-shell'
import { ScenesWorkspace } from '@/components/effects/scenes-workspace'
import { RoomMenu } from '@/components/room-menu'
import { fixturesQuery, roomsQuery } from '@/lib/rooms'

export const Route = createFileRoute('/_authed/scenes')({
  validateSearch: z.object({
    room: z.number().int().optional(),
    scene: z.number().int().optional(),
  }),
  component: ScenesPage,
})

function ScenesPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const rooms = useQuery(roomsQuery)
  const room =
    rooms.data?.find((r) => r.id === search.room) ??
    rooms.data?.find((r) => r.active) ??
    rooms.data?.[0]
  const fixtures = useQuery({ ...fixturesQuery(room?.id ?? 0), enabled: !!room })

  return (
    <AppShell
      room={
        rooms.data && (
          <RoomMenu
            rooms={rooms.data}
            room={room}
            onSelect={(id) => navigate({ search: { room: id } })}
          />
        )
      }
      status={room && <span>Room: {room.name}</span>}
    >
      {room && fixtures.isSuccess ? (
        <ScenesWorkspace
          room={room}
          fixtures={fixtures.data}
          selectedId={search.scene}
          onSelect={(id) => navigate({ search: (s) => ({ ...s, scene: id }), replace: true })}
        />
      ) : rooms.isSuccess && !room ? (
        <p className="m-auto text-sm text-muted-foreground">
          No room yet. Create one in{' '}
          <Link to="/configure" className="underline underline-offset-4">
            Configure
          </Link>
          .
        </p>
      ) : (
        fixtures.error && <p className="p-3 text-sm text-destructive">{fixtures.error.message}</p>
      )}
    </AppShell>
  )
}
