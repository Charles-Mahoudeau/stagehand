import { aimAt, insideCoverage, type Spot, spotAt } from '@stagehand/shared'
import { useMutation } from '@tanstack/react-query'
import { cn } from 'cn'
import { type ReactNode, useState } from 'react'
import { CommitInput } from '@/components/configure/commit-input'
import { StagePlan } from '@/components/configure/stage-plan'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Fixture, Room } from '@/lib/rooms'
import {
  aim,
  type CalibrationPoint,
  type HeadCalibration,
  headCalibration,
  type Target,
  useTargetMutations,
} from '@/lib/targets'
import { NumberField } from './number-field'
import { CoverageOutline, PlanMarker, PlanSvg } from './plan-overlay'

type Props = {
  room: Room
  fixtures: Fixture[]
  heads: Fixture[]
  points: CalibrationPoint[]
  targets: Target[]
  selected?: Target
  onSelect: (id: number | null) => void
  // The Objects/Calibrate switch, drawn on the plan.
  modeSwitch: ReactNode
}

export type Reach = 'inside' | 'outside' | 'unreachable' | 'uncalibrated'

// Whether a head can light a spot, and how much to trust it.
export function reach(c: HeadCalibration, p: Spot): Reach {
  if (!c.fit) return 'uncalibrated'
  if (!aimAt(c.fit.model, p)) return 'unreachable'
  return insideCoverage(c.hull, p) ? 'inside' : 'outside'
}

const REACH_LABEL: Record<Reach, string> = {
  inside: 'Inside calibrated area',
  outside: 'Outside calibrated area: aim is extrapolated',
  unreachable: 'Out of reach',
  uncalibrated: 'Not calibrated',
}

// Placing named objects on the plan for the heads to aim at.
export function ObjectsPanel(props: Props) {
  const { room, fixtures, heads, points, targets, selected, onSelect, modeSwitch } = props
  const { create, update } = useTargetMutations(room.id)
  const calibrations = heads.map((h) => ({ head: h, ...headCalibration(h, points, room) }))
  const reachable = (t: Target) =>
    calibrations.some((c) => {
      const r = reach(c, spotAt(room, t.position, t.height))
      return r === 'inside' || r === 'outside'
    })

  const add = () =>
    create.mutate(
      { name: nextObjectName(targets), position: { x: 0.5, y: 0.5 } },
      { onSuccess: (t) => onSelect(t.id) },
    )

  return (
    <div className="flex flex-1 flex-wrap gap-4">
      <aside className="flex flex-1 basis-60 flex-col gap-0.5 rounded-2xl bg-surface-1 p-2 sm:max-w-[280px]">
        <div className="flex items-baseline justify-between px-2.5 pt-2.5 pb-2">
          <h2 className="text-[15px] font-semibold">Objects</h2>
          <span className="font-mono text-xs text-muted-foreground">{targets.length}</span>
        </div>
        {targets.map((t) => (
          <Button
            key={t.id}
            variant="ghost"
            aria-current={t.id === selected?.id}
            onClick={() => onSelect(t.id)}
            className="h-auto min-h-[52px] justify-start gap-3 px-2.5 py-1.5 font-normal"
          >
            <span
              className={cn(
                'mx-[3px] size-2.5 shrink-0 rotate-45 border-[1.5px]',
                reachable(t) ? 'border-foreground' : 'border-dashed border-off-ring',
              )}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
              <span className="truncate">{t.name}</span>
              <span className="font-mono text-[11px] text-muted-foreground">{t.slug}</span>
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">
              {t.position.x.toFixed(2)}, {t.position.y.toFixed(2)}
            </span>
          </Button>
        ))}
        {targets.length === 0 && (
          <p className="px-2.5 pb-2 text-sm text-muted-foreground">
            Objects are spots the heads can be sent to: a lectern, the DJ booth, the cake table.
          </p>
        )}
        <Button variant="dashed" className="mt-auto" disabled={create.isPending} onClick={add}>
          Add object
        </Button>
      </aside>

      <main className="relative flex min-w-0 flex-[999_1_520px] flex-col gap-4">
        <StagePlan
          className="min-h-[560px] flex-1"
          fixtures={fixtures}
          live={room.active}
          highlight={new Set(heads.map((h) => h.id))}
          overlay={(toPosition) => (
            <>
              <PlanSvg>
                {calibrations.map((c) => (
                  <CoverageOutline key={c.head.id} hull={c.hull} />
                ))}
              </PlanSvg>
              {targets.map((t) => (
                <PlanMarker
                  key={t.id}
                  shape="diamond"
                  label={t.name}
                  position={t.position}
                  selected={t.id === selected?.id}
                  pending={!reachable(t)}
                  onSelect={() => onSelect(t.id)}
                  onMove={(position) => update.mutate({ id: t.id, position })}
                  toPosition={toPosition}
                />
              ))}
            </>
          )}
        />
        <div className="absolute top-3 right-3 z-10">{modeSwitch}</div>
        <div className="flex flex-wrap gap-x-[18px] gap-y-1 px-1 text-xs text-muted-foreground">
          <span>Drag to place · snaps to 0.01</span>
          <span>Dashed outline: floor a head is calibrated over</span>
        </div>
        {(create.error ?? update.error) && (
          <p className="text-sm text-destructive">{(create.error ?? update.error)?.message}</p>
        )}
      </main>

      {selected ? (
        <ObjectInspector
          key={selected.id}
          room={room}
          target={selected}
          calibrations={calibrations}
          onSelect={onSelect}
        />
      ) : (
        <aside className="flex flex-1 basis-80 flex-col gap-2 rounded-2xl bg-surface-1 p-4 sm:max-w-[360px]">
          <h2 className="text-[15px] font-semibold">No object selected</h2>
          <p className="text-sm text-muted-foreground">
            Pick one on the plan or in the list, or add one with Add object.
          </p>
        </aside>
      )}
    </div>
  )
}

const NUDGE_STEP = 0.25

function ObjectInspector({
  room,
  target,
  calibrations,
  onSelect,
}: {
  room: Room
  target: Target
  calibrations: (HeadCalibration & { head: Fixture })[]
  onSelect: (id: number | null) => void
}) {
  const { update, remove, nudge } = useTargetMutations(room.id)
  const calibrated = calibrations.filter((c) => c.fit)
  const [aimWith, setAimWith] = useState(() => new Set(calibrated.map((c) => c.head.id)))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const send = useMutation({
    mutationFn: (fixtureIds: number[]) => aim(room.id, fixtureIds, { targetId: target.id }),
  })
  const error = invalid ?? update.error?.message ?? remove.error?.message ?? nudge.error?.message

  const save = (changes: Omit<Parameters<typeof update.mutate>[0], 'id'>) => {
    setInvalid(null)
    update.mutate({ id: target.id, ...changes })
  }
  const saveCoord = (axis: 'x' | 'y') => (text: string) => {
    const v = Number(text)
    if (text === '' || Number.isNaN(v) || v < 0 || v > 1) {
      return setInvalid('Positions are fractions of the room, from 0 to 1')
    }
    save({ position: { ...target.position, [axis]: v } })
  }
  const saveHeight = (text: string) => {
    if (text === '') return save({ height: null })
    const v = Number(text)
    if (Number.isNaN(v) || v < 0 || v > 50) return setInvalid('Height is in metres, from 0 to 50')
    save({ height: v })
  }
  // Changes one head's correction and re-aims it, so the change shows in the room.
  const nudgeBy = (head: Fixture, pan: number, tilt: number) => {
    const current = target.nudges.find((n) => n.fixtureId === head.id) ?? { pan: 0, tilt: 0 }
    const next =
      pan === 0 && tilt === 0
        ? { pan: 0, tilt: 0 }
        : {
            pan: round(current.pan + pan),
            tilt: round(current.tilt + tilt),
          }
    nudge.mutate(
      { id: target.id, fixtureId: head.id, ...next },
      { onSuccess: () => room.active && send.mutate([head.id]) },
    )
  }

  return (
    <aside className="flex flex-1 basis-80 flex-col gap-4 sm:max-w-[360px]">
      <div className="flex flex-col gap-3.5 rounded-2xl bg-surface-1 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="object-name">Name</Label>
          <CommitInput
            id="object-name"
            value={target.name}
            onCommit={(name) => (name ? save({ name }) : setInvalid('Name can’t be empty'))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="object-slug">ID</Label>
          <CommitInput
            id="object-slug"
            className="font-mono"
            value={target.slug}
            onCommit={(slug) =>
              /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)
                ? save({ slug })
                : setInvalid('IDs use lower-case letters, digits and single dashes')
            }
          />
          <span className="text-xs text-muted-foreground">
            Scenes and the API refer to it by this, so renaming it keeps them working.
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <NumberField
            id="object-x"
            label="X"
            value={target.position.x.toFixed(2)}
            onCommit={saveCoord('x')}
          />
          <NumberField
            id="object-y"
            label="Y"
            value={target.position.y.toFixed(2)}
            onCommit={saveCoord('y')}
          />
          <NumberField
            id="object-height"
            label="Height (m)"
            placeholder="Floor"
            value={target.height === null ? '' : String(target.height)}
            onCommit={saveHeight}
          />
        </div>
        <span className="text-xs leading-normal text-muted-foreground">
          {room.width && room.depth
            ? 'Heads aim at this height above the floor.'
            : 'Heads aim at this height once the room has a size (set it under Calibrate). Until then they aim at the floor below it; nudge each head to correct.'}
        </span>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-4">
        <span className="text-[13px] font-semibold">Reachable by</span>
        {calibrations.length === 0 && (
          <span className="text-[13px] text-muted-foreground">No moving heads in this room.</span>
        )}
        {calibrations.map((c) => {
          const r = reach(c, spotAt(room, target.position, target.height))
          const n = target.nudges.find((x) => x.fixtureId === c.head.id)
          return (
            <div key={c.head.id} className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-3 text-[13px]">
                <span>{c.head.name}</span>
                <span
                  className={cn(
                    'text-right',
                    r === 'inside'
                      ? 'text-foreground'
                      : r === 'uncalibrated'
                        ? 'text-muted-foreground'
                        : 'text-warning',
                  )}
                >
                  {REACH_LABEL[r]}
                </span>
              </div>
              {c.fit && r !== 'unreachable' && (
                <div className="flex flex-col gap-1.5">
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {n ? `Nudged pan ${signed(n.pan)}° · tilt ${signed(n.tilt)}°` : 'No nudge'}
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <NudgeButton
                      label={`${c.head.name} pan −`}
                      onClick={() => nudgeBy(c.head, -NUDGE_STEP, 0)}
                    >
                      Pan −
                    </NudgeButton>
                    <NudgeButton
                      label={`${c.head.name} pan +`}
                      onClick={() => nudgeBy(c.head, NUDGE_STEP, 0)}
                    >
                      Pan +
                    </NudgeButton>
                    <NudgeButton
                      label={`${c.head.name} tilt −`}
                      onClick={() => nudgeBy(c.head, 0, -NUDGE_STEP)}
                    >
                      Tilt −
                    </NudgeButton>
                    <NudgeButton
                      label={`${c.head.name} tilt +`}
                      onClick={() => nudgeBy(c.head, 0, NUDGE_STEP)}
                    >
                      Tilt +
                    </NudgeButton>
                    {n && (
                      <NudgeButton
                        label={`Reset ${c.head.name}’s nudge`}
                        onClick={() => nudgeBy(c.head, 0, 0)}
                      >
                        Reset
                      </NudgeButton>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
        {calibrated.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Each nudge moves the head by {NUDGE_STEP}° and re-aims it here.
          </span>
        )}
      </div>

      {calibrated.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-1 p-4">
          <div className="flex flex-wrap gap-1.5">
            {calibrated.map(({ head }) => (
              <Button
                key={head.id}
                size="sm"
                aria-pressed={aimWith.has(head.id)}
                className={cn(
                  'h-8 rounded-md px-3 font-mono text-xs',
                  aimWith.has(head.id) ? 'bg-primary text-primary-foreground' : 'bg-surface-3',
                )}
                onClick={() =>
                  setAimWith((s) => {
                    const next = new Set(s)
                    if (!next.delete(head.id)) next.add(head.id)
                    return next
                  })
                }
              >
                {head.name}
              </Button>
            ))}
          </div>
          <Button
            variant="default"
            size="lg"
            disabled={!room.active || aimWith.size === 0 || send.isPending}
            title={room.active ? undefined : 'Make this room active to aim'}
            onClick={() => send.mutate([...aimWith])}
          >
            Aim{' '}
            {calibrated
              .filter((c) => aimWith.has(c.head.id))
              .map((c) => c.head.name)
              .join(' + ') || 'heads'}{' '}
            here
          </Button>
          {(send.error || send.data?.skipped.length) && (
            <p className="text-sm text-warning">
              {send.error?.message ??
                send.data?.skipped
                  .map(
                    (s) =>
                      `${calibrated.find((c) => c.head.id === s.fixtureId)?.head.name}: ${s.reason}`,
                  )
                  .join(' · ')}
            </p>
          )}
        </div>
      )}

      <Button
        variant="destructive"
        size="lg"
        disabled={remove.isPending}
        onBlur={() => setConfirmDelete(false)}
        onClick={() => {
          if (!confirmDelete) return setConfirmDelete(true)
          remove.mutate(target.id, { onSuccess: () => onSelect(null) })
        }}
      >
        {confirmDelete ? 'Confirm delete' : 'Delete object'}
      </Button>
    </aside>
  )
}

function NudgeButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <Button
      size="sm"
      aria-label={label}
      className="h-8 rounded-md px-2.5 text-xs"
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

const round = (v: number) => Math.round(v * 100) / 100
const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '0')

function nextObjectName(targets: Target[]) {
  const taken = new Set(targets.map((t) => t.name.toLowerCase()))
  let n = targets.length + 1
  while (taken.has(`object ${n}`)) n++
  return `Object ${n}`
}
