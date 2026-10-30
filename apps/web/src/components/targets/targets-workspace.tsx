import { panDegrees, tiltDegrees } from '@stagehand/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { cn } from 'cn'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { CommitInput } from '@/components/configure/commit-input'
import type { ViewProps } from '@/components/configure/shared'
import { StagePlan } from '@/components/configure/stage-plan'
import {
  Field,
  Panel,
  PanelBody,
  PanelHeader,
  PanelNote,
  PanelTab,
  PanelTitle,
  Section,
  Spacer,
} from '@/components/shell/panel'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import { outputColor } from '@/lib/patch'
import { type Fixture, type Room, roomAspect } from '@/lib/rooms'
import {
  aim,
  isHead,
  livePanTilt,
  type Target,
  targetsQuery,
  useTargetMutations,
} from '@/lib/targets'
import { JogPad } from './jog-pad'

type Stored = Target['positions'][number]

const degrees = (p: Stored) =>
  `${panDegrees(p.pan).toFixed(1)}° / ${tiltDegrees(p.tilt).toFixed(1)}°`

// Configure › Targets: named places the moving heads can be sent to. Each head
// stores its own pan/tilt for every target, set by jogging the head onto it.
export function TargetsWorkspace({ room, fixtures, onSelect }: ViewProps) {
  const search = useSearch({ from: '/_authed/configure' })
  const navigate = useNavigate({ from: '/configure' })
  const targets = useQuery(targetsQuery(room.id))
  const { create } = useTargetMutations(room.id)
  const heads = fixtures.filter(isHead)

  const set = (changes: Partial<typeof search>) =>
    navigate({ search: (s) => ({ ...s, ...changes }), replace: true })

  if (!targets.isSuccess) {
    return targets.error ? (
      <p className="p-3 text-sm text-destructive">{targets.error.message}</p>
    ) : null
  }
  const selected = targets.data.find((t) => t.id === search.target)
  const head = heads.find((h) => h.id === search.head) ?? heads[0]
  const add = () =>
    create.mutate(
      { name: nextTargetName(targets.data) },
      { onSuccess: (t) => set({ target: t.id }) },
    )
  const total = targets.data.length * heads.length
  const done = targets.data.reduce((n, t) => n + t.positions.length, 0)

  return (
    <>
      <div className="flex w-[260px] shrink-0 flex-col gap-1">
        <Panel className="flex-1">
          <PanelHeader>
            <PanelTitle>Targets</PanelTitle>
            <PanelNote>{targets.data.length}</PanelNote>
            <Spacer />
            <Button
              variant="secondary"
              size="icon-xs"
              aria-label="Add target"
              disabled={create.isPending}
              onClick={add}
            >
              <Plus />
            </Button>
          </PanelHeader>
          <PanelBody className="py-1">
            {targets.data.length === 0 && (
              <p className="px-3 pt-2 text-xs text-muted-foreground">
                Targets are places the heads can be sent to: a lectern, the DJ booth, the cake
                table.
              </p>
            )}
            {targets.data.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-current={t.id === selected?.id}
                onClick={() => set({ target: t.id })}
                className="mx-1 flex h-[34px] w-[calc(100%-8px)] items-center gap-2 rounded-[5px] px-2 text-left text-xs hover:bg-surface-2 aria-[current=true]:bg-surface-3"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{t.name}</span>
                  <span className="truncate font-mono text-[10px] text-muted-foreground">
                    {t.slug}
                  </span>
                </span>
                <span
                  className={cn(
                    'font-mono text-[11px]',
                    heads.length > 0 && t.positions.length === heads.length
                      ? 'text-live'
                      : 'text-muted-foreground',
                  )}
                >
                  {t.positions.length}/{heads.length}
                </span>
              </button>
            ))}
            {create.error && (
              <p className="px-3 text-xs text-destructive">{create.error.message}</p>
            )}
          </PanelBody>
        </Panel>

        <Panel className="h-[150px] shrink-0">
          <PanelHeader>
            <PanelTitle>Heads</PanelTitle>
            <Spacer />
            <PanelNote>calibrating</PanelNote>
          </PanelHeader>
          <PanelBody className="py-1">
            {heads.length === 0 && (
              <p className="px-3 pt-2 text-xs text-muted-foreground">
                This room has no moving heads.
              </p>
            )}
            {heads.map((h) => (
              <HeadRow
                key={h.id}
                head={h}
                room={room}
                active={h.id === head?.id}
                onClick={() => set({ head: h.id })}
              />
            ))}
          </PanelBody>
        </Panel>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Panel className="flex-1">
          <PanelHeader className="pl-0">
            <PanelTab active>Plan</PanelTab>
            <Spacer />
            <PanelNote>Click a head to calibrate it</PanelNote>
          </PanelHeader>
          <StagePlan
            className="min-h-0 flex-1 rounded-none"
            fixtures={fixtures}
            live={room.active}
            aspect={roomAspect(room)}
            selectedId={head?.id}
            highlight={new Set(heads.map((h) => h.id))}
            onSelect={(id) => {
              if (heads.some((h) => h.id === id)) set({ head: id })
              else onSelect(id)
            }}
          />
        </Panel>

        <Panel className="h-[190px] shrink-0">
          <PanelHeader className="pl-0">
            <PanelTab active>Calibration</PanelTab>
            <Spacer />
            <PanelNote>
              {done} of {total} positions set
            </PanelNote>
          </PanelHeader>
          <PanelBody>
            <CalibrationTable
              targets={targets.data}
              heads={heads}
              selectedTarget={selected?.id}
              selectedHead={head?.id}
              onPick={(t, h) => set({ target: t, head: h })}
            />
          </PanelBody>
        </Panel>
      </div>

      <Panel className="w-80 shrink-0">
        <PanelHeader>
          <PanelTitle>Inspector</PanelTitle>
          <Spacer />
          {selected && <PanelNote>target · {selected.slug}</PanelNote>}
        </PanelHeader>
        {selected ? (
          <TargetInspector
            key={selected.id}
            room={room}
            target={selected}
            head={head}
            onRemoved={() => set({ target: undefined })}
          />
        ) : (
          <PanelBody className="p-3 text-xs text-muted-foreground">
            Pick a target in the list, or add one with +.
          </PanelBody>
        )}
      </Panel>
    </>
  )
}

function HeadRow({
  head,
  room,
  active,
  onClick,
}: {
  head: Fixture
  room: Room
  active: boolean
  onClick: () => void
}) {
  const { dmx } = useLive()
  const color = outputColor(head, room.active ? dmx?.channels : null)
  return (
    <button
      type="button"
      aria-current={active}
      onClick={onClick}
      className="mx-1 flex h-[34px] w-[calc(100%-8px)] items-center gap-2 rounded-[5px] px-2 text-left text-xs hover:bg-surface-2 aria-[current=true]:bg-surface-3"
    >
      <span
        className={cn(
          'size-2.5 shrink-0 rounded-[3px]',
          !color && 'shadow-[inset_0_0_0_1.5px_var(--off-ring)]',
        )}
        style={color ? { background: color } : undefined}
      />
      <span className="flex-1 truncate">{head.name}</span>
      <span className="font-mono text-[10.5px] text-muted-foreground">DMX {head.address}</span>
    </button>
  )
}

function CalibrationTable({
  targets,
  heads,
  selectedTarget,
  selectedHead,
  onPick,
}: {
  targets: Target[]
  heads: Fixture[]
  selectedTarget?: number
  selectedHead?: number
  onPick: (target: number, head: number) => void
}) {
  if (targets.length === 0 || heads.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        Add a target to start calibrating. Each head stores its own pan and tilt for it.
      </p>
    )
  }
  const cols = { gridTemplateColumns: `160px repeat(${heads.length}, minmax(120px, 1fr))` }
  return (
    <div className="min-w-fit text-xs">
      <div
        className="sticky top-0 z-10 grid items-center gap-2 bg-surface-1 px-3 py-1.5 text-[11px] text-muted-foreground"
        style={cols}
      >
        <span>Target</span>
        {heads.map((h) => (
          <span key={h.id}>{h.name} · pan / tilt</span>
        ))}
      </div>
      {targets.map((t) => (
        <div
          key={t.id}
          className={cn(
            'grid h-7 items-center gap-2 border-t border-border-subtle px-3',
            t.id === selectedTarget && 'bg-surface-2',
          )}
          style={cols}
        >
          <span className="truncate">{t.name}</span>
          {heads.map((h) => {
            const stored = t.positions.find((p) => p.fixtureId === h.id)
            return (
              <button
                key={h.id}
                type="button"
                onClick={() => onPick(t.id, h.id)}
                className={cn(
                  'h-6 rounded-[4px] px-1.5 text-left font-mono text-[11px] hover:bg-surface-3',
                  stored ? 'text-foreground' : 'text-muted-foreground/50',
                  t.id === selectedTarget && h.id === selectedHead && 'bg-surface-3',
                )}
              >
                {stored ? degrees(stored) : 'not set'}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// Lower-case letters, digits and single dashes, as the server requires.
const toSlug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

function nextTargetName(targets: Target[]) {
  const names = new Set(targets.map((t) => t.name.toLowerCase()))
  for (let n = targets.length + 1; ; n++) if (!names.has(`target ${n}`)) return `Target ${n}`
}

function TargetInspector({
  room,
  target,
  head,
  onRemoved,
}: {
  room: Room
  target: Target
  head?: Fixture
  onRemoved: () => void
}) {
  const { dmx } = useLive()
  const { update, remove, setPosition, clearPosition } = useTargetMutations(room.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const send = useMutation({
    mutationFn: (fixtureId: number) => aim(room.id, [fixtureId], target.id),
  })
  const error = [update, remove, setPosition, clearPosition, send]
    .map((m) => m.error?.message)
    .find(Boolean)
  const stored = head && target.positions.find((p) => p.fixtureId === head.id)
  const live = head && livePanTilt(head, room.active ? dmx?.channels : null)

  return (
    <PanelBody>
      <Section title="Target" className="pt-1">
        <Field label="Name" htmlFor="target-name">
          <CommitInput
            compact
            id="target-name"
            value={target.name}
            onCommit={(name) => name && update.mutate({ id: target.id, name })}
          />
        </Field>
        <Field label="ID" htmlFor="target-id">
          <CommitInput
            compact
            id="target-id"
            value={target.slug}
            onCommit={(text) => {
              const slug = toSlug(text)
              if (slug && slug !== target.slug) update.mutate({ id: target.id, slug })
            }}
            maxLength={40}
            spellCheck={false}
            className="font-mono"
          />
        </Field>
      </Section>

      {head && (
        <Section title={`Calibrate · ${head.name}`}>
          <div className="px-3 pt-1">
            <JogPad key={head.id} head={head} roomActive={room.active} />
          </div>
          <p className="px-3 pt-2 font-mono text-[11px] text-muted-foreground">
            Saved: {stored ? degrees(stored) : 'not set'}
          </p>
          <div className="flex flex-wrap gap-1 px-3 pt-2">
            <Button
              variant="default"
              size="xs"
              disabled={!room.active || !live}
              onClick={() =>
                live && setPosition.mutate({ id: target.id, fixtureId: head.id, ...live })
              }
            >
              {stored ? 'Update from head' : 'Save from head'}
            </Button>
            <Button
              size="xs"
              disabled={!room.active || !stored || send.isPending}
              onClick={() => send.mutate(head.id)}
            >
              Go to saved
            </Button>
            <Button
              size="xs"
              variant="quiet"
              disabled={!stored}
              onClick={() => clearPosition.mutate({ id: target.id, fixtureId: head.id })}
            >
              Clear
            </Button>
          </div>
        </Section>
      )}

      <Section title="Danger">
        <div className="px-3 pt-1">
          {confirmDelete ? (
            <Button
              variant="destructive"
              size="xs"
              onBlur={() => setConfirmDelete(false)}
              onClick={() => remove.mutate(target.id, { onSuccess: onRemoved })}
            >
              Confirm delete
            </Button>
          ) : (
            <Button variant="destructive" size="xs" onClick={() => setConfirmDelete(true)}>
              Delete target
            </Button>
          )}
        </div>
      </Section>
      {error && <p className="px-3 pb-3 text-xs text-destructive">{error}</p>}
    </PanelBody>
  )
}
