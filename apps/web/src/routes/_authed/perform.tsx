import { panDegrees, tiltDegrees } from '@stagehand/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { AppHeader } from '@/components/app-header'
import { Fader } from '@/components/configure/fader'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import { outputColor } from '@/lib/patch'
import { fixturesQuery, type Room, roomsQuery } from '@/lib/rooms'
import {
  aim,
  DIMMER_OFFSET,
  isHead,
  livePanTilt,
  SPEED_OFFSET,
  type Target,
  targetsQuery,
} from '@/lib/targets'

export const Route = createFileRoute('/_authed/perform')({
  component: PerformPage,
})

function PerformPage() {
  const rooms = useQuery(roomsQuery)
  const room = rooms.data?.find((r) => r.active)

  return (
    <div className="flex min-h-svh flex-col gap-4 px-5 py-4">
      <AppHeader />
      {room ? (
        <AimBoard room={room} />
      ) : (
        rooms.isSuccess && (
          <p className="mx-auto mt-24 text-sm text-muted-foreground">
            No room is active. Pick one in{' '}
            <Link to="/configure" className="underline underline-offset-4">
              Configure
            </Link>
            .
          </p>
        )
      )}
    </div>
  )
}

// Perform › aim: tap a target to send the selected heads to it.
function AimBoard({ room }: { room: Room }) {
  const { dmx, setChannels } = useLive()
  const fixtures = useQuery(fixturesQuery(room.id))
  const targets = useQuery(targetsQuery(room.id))
  const [picked, setPicked] = useState<number[] | null>(null)
  // The target each head was last sent to from here.
  const [aimed, setAimed] = useState<Record<number, Target>>({})

  const heads = (fixtures.data ?? []).filter(isHead)
  // Every head follows until some are picked.
  const selected = heads.filter((h) => (picked ?? heads.map((c) => c.id)).includes(h.id))
  const channels = dmx?.channels

  const send = useMutation({
    mutationFn: (target: Target) =>
      aim(
        room.id,
        selected.map((h) => h.id),
        target.id,
      ),
    onSuccess: (res, target) =>
      setAimed((a) => {
        const next = { ...a }
        for (const { fixtureId } of res.aimed) next[fixtureId] = target
        return next
      }),
  })
  const sendTo = (target: Target) => send.mutate(target)

  if (!fixtures.isSuccess || !targets.isSuccess) {
    const error = fixtures.error ?? targets.error
    return error ? <p className="text-sm text-destructive">{error.message}</p> : null
  }

  const aimedBySelected = new Set(selected.flatMap((h) => (aimed[h.id] ? [aimed[h.id]?.id] : [])))
  const first = selected[0]
  const level = (offset: number) => (first && channels?.[first.address - 1 + offset]) ?? 0
  const setLevel = (offset: number, values: number[]) => {
    for (const h of selected) setChannels(h.address + offset, values)
  }
  const pick = (ids: number[]) => setPicked(ids)
  const skipped = send.data?.skipped ?? []

  return (
    <div className="flex flex-1 flex-wrap gap-4">
      <main className="flex min-w-0 flex-[999_1_560px] flex-col gap-3 rounded-2xl bg-surface-1 p-4">
        <h2 className="text-[15px] font-semibold">Targets</h2>
        {targets.data.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No targets yet.{' '}
            <Link
              to="/configure"
              search={{ view: 'targets' }}
              className="text-foreground underline underline-offset-4"
            >
              Add some
            </Link>
            .
          </p>
        )}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
          {targets.data.map((t) => {
            const on = aimedBySelected.has(t.id)
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                disabled={selected.length === 0 || send.isPending}
                onClick={() => sendTo(t)}
                className={cn(
                  'flex min-h-20 flex-col items-start justify-center gap-1 rounded-xl px-3 text-left disabled:opacity-40',
                  on ? 'bg-primary text-primary-foreground' : 'bg-surface-2 hover:bg-surface-3',
                )}
              >
                <span className="text-base font-semibold">{t.name}</span>
                <span className="font-mono text-[11px] opacity-70">{t.slug}</span>
              </button>
            )
          })}
        </div>
        {(send.error || skipped.length > 0) && (
          <span className="text-xs text-warning">
            {send.error?.message ??
              skipped
                .map((s) => `${heads.find((h) => h.id === s.fixtureId)?.name}: ${s.reason}`)
                .join(' · ')}
          </span>
        )}
        <Button
          size="lg"
          className="mt-auto"
          disabled={selected.length === 0}
          onClick={() => setLevel(DIMMER_OFFSET, [0])}
        >
          Beams off
        </Button>
      </main>

      <aside className="flex flex-1 basis-80 flex-col gap-4 sm:max-w-[360px]">
        <section className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[15px] font-semibold">Heads</h2>
            <span className="text-xs text-muted-foreground">
              {selected.length === 0
                ? 'None follow taps'
                : `${selected.map((h) => h.name).join(' + ')} ${selected.length === 1 ? 'follows' : 'follow'} taps`}
            </span>
          </div>
          {heads.length > 0 ? (
            <div className="flex flex-wrap gap-[3px] rounded-[10px] bg-surface-2 p-[3px]">
              {heads.map((h) => (
                <SegmentButton
                  key={h.id}
                  on={selected.length === 1 && selected[0]?.id === h.id}
                  onClick={() => pick([h.id])}
                >
                  {h.name}
                </SegmentButton>
              ))}
              {heads.length > 1 && (
                <SegmentButton
                  on={selected.length === heads.length}
                  onClick={() => pick(heads.map((h) => h.id))}
                >
                  All
                </SegmentButton>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">This room has no moving heads.</p>
          )}
          {heads.map((h) => {
            const pt = livePanTilt(h, channels)
            const on = selected.includes(h)
            const color = outputColor(h, channels)
            return (
              <div
                key={h.id}
                className={cn(
                  'flex min-h-[52px] items-center gap-3 rounded-[10px] px-3',
                  on ? 'bg-surface-3' : 'opacity-50',
                )}
              >
                <span
                  className={cn(
                    'size-3 shrink-0 rounded-[4px]',
                    !color && 'shadow-[inset_0_0_0_1.5px_var(--off-ring)]',
                  )}
                  style={color ? { background: color } : undefined}
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate">
                    {h.name} · {aimed[h.id]?.name ?? 'Not sent yet'}
                  </span>
                  {pt && (
                    <span className="font-mono text-[11px] text-muted-foreground">
                      pan {panDegrees(pt.pan).toFixed(1)}° · tilt {tiltDegrees(pt.tilt).toFixed(1)}°
                    </span>
                  )}
                </span>
              </div>
            )
          })}
          {selected.length > 0 && (
            <div className="flex flex-col gap-2 pt-1">
              <span className="flex justify-between text-xs text-muted-foreground">
                <span>Dimmer</span>
                <span className="font-mono text-foreground">
                  {Math.round((level(DIMMER_OFFSET) / 255) * 100)}%
                </span>
              </span>
              <Fader
                label="Dimmer"
                value={level(DIMMER_OFFSET)}
                tint="var(--text)"
                // Opens the shutter too, in case it was left closed or strobing.
                onChange={(v) => setLevel(DIMMER_OFFSET, [v, 0])}
              />
              <span className="flex justify-between text-xs text-muted-foreground">
                <span>Move speed</span>
                <span className="font-mono text-foreground">
                  {level(SPEED_OFFSET) === 0
                    ? 'Fastest'
                    : `${Math.round((level(SPEED_OFFSET) / 255) * 100)}% slower`}
                </span>
              </span>
              <Fader
                label="Move speed, slower to the right"
                value={level(SPEED_OFFSET)}
                tint="var(--text)"
                onChange={(v) => setLevel(SPEED_OFFSET, [v])}
              />
            </div>
          )}
        </section>
      </aside>
    </div>
  )
}

function SegmentButton({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'min-h-10 min-w-16 flex-1 rounded-[7px] text-[13px]',
        on
          ? 'bg-primary font-semibold text-primary-foreground'
          : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}
