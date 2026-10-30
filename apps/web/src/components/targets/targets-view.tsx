import { panDegrees, tiltDegrees } from '@stagehand/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { cn } from 'cn'
import { useState } from 'react'
import { CommitInput } from '@/components/configure/commit-input'
import type { ViewProps } from '@/components/configure/shared'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import type { Fixture, Room } from '@/lib/rooms'
import {
  aim,
  isHead,
  livePanTilt,
  type Target,
  targetsQuery,
  useTargetMutations,
} from '@/lib/targets'
import { JogPad } from './jog-pad'

// Configure › Targets: named places the moving heads can be sent to. Each head
// stores its own pan/tilt for every target, set by jogging the head onto it.
export function TargetsView({ room, fixtures }: ViewProps) {
  const search = useSearch({ from: '/_authed/configure' })
  const navigate = useNavigate({ from: '/configure' })
  const targets = useQuery(targetsQuery(room.id))
  const { create } = useTargetMutations(room.id)
  const heads = fixtures.filter(isHead)

  const set = (changes: Partial<typeof search>) =>
    navigate({ search: (s) => ({ ...s, ...changes }), replace: true })

  if (!targets.isSuccess) {
    return targets.error ? (
      <p className="text-sm text-destructive">{targets.error.message}</p>
    ) : null
  }
  const selected = targets.data.find((t) => t.id === search.target)
  const add = () =>
    create.mutate(
      { name: nextTargetName(targets.data) },
      { onSuccess: (t) => set({ target: t.id }) },
    )

  return (
    <div className="flex flex-1 flex-wrap gap-4">
      <aside className="flex flex-1 basis-60 flex-col gap-0.5 rounded-2xl bg-surface-1 p-2 sm:max-w-[280px]">
        <div className="flex items-baseline justify-between px-2.5 pt-2.5 pb-2">
          <h2 className="text-[15px] font-semibold">Targets</h2>
          <span className="font-mono text-xs text-muted-foreground">{targets.data.length}</span>
        </div>
        {targets.data.map((t) => (
          <Button
            key={t.id}
            variant="ghost"
            aria-current={t.id === selected?.id}
            onClick={() => set({ target: t.id })}
            className="h-auto min-h-[52px] justify-start gap-3 px-2.5 py-1.5 font-normal"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
              <span className="truncate">{t.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{t.slug}</span>
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {t.positions.length}/{heads.length}
            </span>
          </Button>
        ))}
        {targets.data.length === 0 && (
          <p className="px-2.5 pb-2 text-sm text-muted-foreground">
            Targets are places the heads can be sent to: a lectern, the DJ booth, the cake table.
          </p>
        )}
        <Button variant="dashed" className="mt-auto" disabled={create.isPending} onClick={add}>
          Add target
        </Button>
        {create.error && <p className="px-2.5 text-sm text-destructive">{create.error.message}</p>}
      </aside>

      {selected ? (
        <TargetEditor
          key={selected.id}
          room={room}
          target={selected}
          heads={heads}
          head={heads.find((h) => h.id === search.head) ?? heads[0]}
          onSelectHead={(id) => set({ head: id })}
          onRemoved={() => set({ target: undefined })}
        />
      ) : (
        <main className="flex min-w-0 flex-[999_1_520px] flex-col gap-2 rounded-2xl bg-surface-1 p-4">
          <h2 className="text-[15px] font-semibold">No target selected</h2>
          <p className="text-sm text-muted-foreground">
            Pick one in the list, or add one with Add target.
          </p>
        </main>
      )}
    </div>
  )
}

function nextTargetName(targets: Target[]) {
  const names = new Set(targets.map((t) => t.name.toLowerCase()))
  for (let n = targets.length + 1; ; n++) if (!names.has(`target ${n}`)) return `Target ${n}`
}

type EditorProps = {
  room: Room
  target: Target
  heads: Fixture[]
  head?: Fixture
  onSelectHead: (id: number) => void
  onRemoved: () => void
}

function TargetEditor({ room, target, heads, head, onSelectHead, onRemoved }: EditorProps) {
  const { dmx } = useLive()
  const { update, remove, setPosition, clearPosition } = useTargetMutations(room.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const send = useMutation({
    mutationFn: (fixtureId: number) => aim(room.id, [fixtureId], target.id),
  })
  const error = [update, remove, setPosition, clearPosition, send]
    .map((m) => m.error?.message)
    .find(Boolean)

  return (
    <main className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-4">
        <div className="flex items-center gap-3">
          <CommitInput
            aria-label="Target name"
            value={target.name}
            onCommit={(name) => name && update.mutate({ id: target.id, name })}
            className="min-w-0 flex-1"
          />
          {confirmDelete ? (
            <Button
              variant="destructive"
              onClick={() => remove.mutate(target.id, { onSuccess: onRemoved })}
            >
              Delete target
            </Button>
          ) : (
            <Button variant="quiet" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
        <span className="font-mono text-xs text-muted-foreground">ID {target.slug}</span>
      </section>

      <section className="flex flex-col gap-1 rounded-2xl bg-surface-1 p-2">
        <h2 className="px-2.5 pt-2.5 pb-2 text-[15px] font-semibold">Heads</h2>
        {heads.length === 0 && (
          <p className="px-2.5 pb-2 text-sm text-muted-foreground">
            This room has no moving heads.
          </p>
        )}
        {heads.map((h) => {
          const stored = target.positions.find((p) => p.fixtureId === h.id)
          const live = livePanTilt(h, room.active ? dmx?.channels : null)
          return (
            <div
              key={h.id}
              className={cn(
                'flex min-h-[56px] flex-wrap items-center gap-3 rounded-[10px] px-2.5 py-1.5',
                h.id === head?.id && 'bg-surface-2',
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 basis-40 flex-col gap-0.5 text-left"
                onClick={() => onSelectHead(h.id)}
              >
                <span className="truncate">{h.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {stored
                    ? `pan ${panDegrees(stored.pan).toFixed(1)}° · tilt ${tiltDegrees(stored.tilt).toFixed(1)}°`
                    : 'Not set'}
                </span>
              </button>
              <Button
                size="sm"
                disabled={!room.active || !stored || send.isPending}
                onClick={() => send.mutate(h.id)}
              >
                Go
              </Button>
              <Button
                size="sm"
                disabled={!room.active || !live}
                onClick={() =>
                  live && setPosition.mutate({ id: target.id, fixtureId: h.id, ...live })
                }
              >
                {stored ? 'Update from head' : 'Save from head'}
              </Button>
              <Button
                size="sm"
                variant="quiet"
                disabled={!stored}
                onClick={() => clearPosition.mutate({ id: target.id, fixtureId: h.id })}
              >
                Clear
              </Button>
            </div>
          )
        })}
      </section>

      {head && (
        <section className="rounded-2xl bg-surface-1 p-4">
          <JogPad key={head.id} head={head} roomActive={room.active} />
        </section>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </main>
  )
}
