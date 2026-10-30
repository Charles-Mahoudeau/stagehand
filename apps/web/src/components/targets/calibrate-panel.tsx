import { panDegrees, tiltDegrees } from '@stagehand/shared'
import { useMutation } from '@tanstack/react-query'
import { cn } from 'cn'
import { type ReactNode, useState } from 'react'
import { CommitInput } from '@/components/configure/commit-input'
import { StagePlan } from '@/components/configure/stage-plan'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useLive } from '@/lib/live'
import { outputColor } from '@/lib/patch'
import {
  type Fixture,
  type Room,
  roomAspect,
  useFixtureMutations,
  useRoomMutations,
} from '@/lib/rooms'
import {
  aim,
  type CalibrationPoint,
  calibrationIssue,
  type HeadCalibration,
  headCalibration,
  livePanTilt,
  PRECISION_GRID,
  PRECISION_WORST,
  panTiltValues,
  precisionGrid,
  useCalibrationMutations,
} from '@/lib/targets'
import { useCalibrationWizard, WizardCard } from './calibration-wizard'
import { JogPad } from './jog-pad'
import { NumberField } from './number-field'
import { BeamLine, CoverageOutline, PlanMarker, PlanSvg, PrecisionMap } from './plan-overlay'

type Props = {
  room: Room
  fixtures: Fixture[]
  heads: Fixture[]
  points: CalibrationPoint[]
  head?: Fixture
  point?: CalibrationPoint
  onSelectHead: (id: number) => void
  onSelectPoint: (id: number | null) => void
  // The Objects/Calibrate switch, drawn on the plan.
  modeSwitch: ReactNode
}

const BEAM = 'rgb(255 236 200)'

// Calibrating a moving head: jog its beam onto spots marked on the plan and
// save pan/tilt for each. A few saved spots let it aim anywhere.
export function CalibratePanel(props: Props) {
  const { room, fixtures, points, head, point, onSelectPoint, modeSwitch } = props
  const { dmx, setChannels } = useLive()
  const { create, update, remove } = useCalibrationMutations(room.id)
  const [confirmClear, setConfirmClear] = useState(false)
  const test = useMutation({
    mutationFn: (position: { x: number; y: number }) => aim(room.id, [head?.id ?? 0], { position }),
  })
  const calibration = head && headCalibration(head, points, room)
  const channels = room.active ? dmx?.channels : null
  const [showPrecision, setShowPrecision] = useState(true)
  const fit = calibration?.fit
  const precision = calibration && showPrecision ? precisionGrid(calibration) : null
  const wizard = useCalibrationWizard(room, head, calibration, points)

  const addPoint = () => {
    if (!head || !calibration) return
    const name = nextPointName(calibration.points)
    create.mutate(
      { fixtureId: head.id, name, position: { x: 0.5, y: 0.5 } },
      { onSuccess: (p) => onSelectPoint(p.id) },
    )
  }

  // Picking a point sends the head to it: to the saved aim, or else to where
  // the fit says it is, so the beam starts close for fine jogging.
  const selectPoint = (p: CalibrationPoint) => {
    if (wizard.running) return
    onSelectPoint(p.id)
    if (!head || !room.active) return
    if (p.pan !== null && p.tilt !== null) {
      setChannels(head.address, panTiltValues({ pan: p.pan, tilt: p.tilt }))
    } else if (calibration?.fit) {
      test.mutate(p.position)
    }
  }

  const clearAll = () => {
    if (!confirmClear) return setConfirmClear(true)
    setConfirmClear(false)
    onSelectPoint(null)
    for (const p of calibration?.points ?? []) remove.mutate(p)
  }

  const beamColor = (head && outputColor(head, channels)) ?? BEAM
  const error = create.error ?? update.error ?? remove.error ?? test.error
  const skipped = test.data?.skipped[0]

  return (
    <div className="flex flex-1 flex-wrap gap-4">
      <aside className="flex flex-1 basis-60 flex-col gap-4 sm:max-w-[280px]">
        <HeadList {...props} />
        {head && calibration && !wizard.running && (
          <Button
            variant="outline"
            size="lg"
            disabled={!room.active}
            onClick={wizard.start}
            title={room.active ? undefined : 'Make this room active to run the wizard'}
          >
            Calibration wizard
          </Button>
        )}
        {head && calibration && (
          <div className="flex flex-1 flex-col gap-0.5 rounded-2xl bg-surface-1 p-2">
            <div className="flex items-baseline justify-between px-2.5 pt-2.5 pb-2">
              <h2 className="text-[15px] font-semibold">Reference points</h2>
              <span className="font-mono text-xs text-muted-foreground">
                {calibration.saved.length} of {calibration.points.length}
              </span>
            </div>
            {calibration.points.map((p) => {
              const saved = p.pan !== null && p.tilt !== null
              const err = calibration.fit?.errors[calibration.saved.indexOf(p)]
              return (
                <Button
                  key={p.id}
                  variant="ghost"
                  aria-current={p.id === point?.id}
                  onClick={() => selectPoint(p)}
                  className="h-auto min-h-[52px] justify-start gap-3 px-2.5 py-1.5 font-normal"
                >
                  <span
                    className={cn(
                      'size-3 shrink-0 rounded-full',
                      saved ? 'bg-foreground' : 'border-[1.5px] border-dashed border-off-ring',
                    )}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
                    <span className="truncate">{p.name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {saved
                        ? `pan ${panDegrees(p.pan as number).toFixed(1)}° · tilt ${tiltDegrees(p.tilt as number).toFixed(1)}°`
                        : 'Not set'}
                    </span>
                  </span>
                  {calibration.repeats.has(p.id) ? (
                    <span className="text-[11px] text-warning">Same aim</span>
                  ) : (
                    err !== undefined && (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        ±{err.toFixed(1)}°
                      </span>
                    )
                  )}
                </Button>
              )
            })}
            <Button
              variant="dashed"
              className="mt-auto"
              disabled={create.isPending}
              onClick={addPoint}
            >
              Add point
            </Button>
            {calibration.points.length > 0 && (
              <Button
                variant="dashed"
                disabled={remove.isPending || wizard.running}
                onBlur={() => setConfirmClear(false)}
                onClick={clearAll}
              >
                {confirmClear
                  ? `Confirm: clear ${calibration.points.length} points`
                  : 'Clear all points'}
              </Button>
            )}
            <p className="px-2.5 pt-1.5 pb-1 text-xs leading-normal text-muted-foreground">
              Mark spots you can find in the room, spread to the edges of where the head has to
              reach. {calibration.needed} saved points are enough
              {calibration.geometry ? '' : ' until the room size and head height are set'}; more
              spots make the aim steadier. Picking a point moves {head.name} to it.
            </p>
          </div>
        )}
      </aside>

      <main className="relative flex min-w-0 flex-[999_1_520px] flex-col gap-4">
        <StagePlan
          className="min-h-[560px] flex-1"
          fixtures={fixtures}
          live={room.active}
          aspect={roomAspect(room)}
          highlight={new Set(head ? [head.id] : [])}
          onFloorClick={
            wizard.running
              ? wizard.place
              : calibration?.fit && room.active
                ? (position) => test.mutate(position)
                : undefined
          }
          overlay={(toPosition) =>
            head &&
            calibration && (
              <>
                <PlanSvg>
                  {precision && (
                    <PrecisionMap cells={precision} size={PRECISION_GRID} worst={PRECISION_WORST} />
                  )}
                  <CoverageOutline hull={calibration.hull} />
                  {!wizard.running && point && head.position && (
                    <BeamLine from={head.position} to={point.position} color={beamColor} />
                  )}
                </PlanSvg>
                {wizard.step?.kind === 'probe' && wizard.step.probe.spot && (
                  <PlanMarker
                    shape="cross"
                    label="Aimed here"
                    position={wizard.step.probe.spot}
                    pending
                  />
                )}
                {wizard.step?.kind === 'place' && (
                  <PlanMarker
                    shape="cross"
                    label={`Aim here (${wizard.step.index + 1}/${wizard.step.total})`}
                    position={wizard.step.spot}
                    pending
                  />
                )}
                {wizard.placed && (
                  <PlanMarker
                    shape="cross"
                    label="Your mark"
                    position={wizard.placed}
                    selected
                    onMove={wizard.place}
                    toPosition={toPosition}
                  />
                )}
                {calibration.points.map((p) => (
                  <PlanMarker
                    key={p.id}
                    shape="cross"
                    label={p.name}
                    position={p.position}
                    selected={p.id === point?.id}
                    pending={p.pan === null || p.tilt === null}
                    onSelect={() => selectPoint(p)}
                    onMove={
                      wizard.running
                        ? undefined
                        : (position) =>
                            update.mutate({ id: p.id, fixtureId: p.fixtureId, position })
                    }
                    toPosition={toPosition}
                  />
                ))}
              </>
            )
          }
        />
        <div className="absolute top-3 right-3 z-10">{modeSwitch}</div>
        <div className="flex flex-wrap justify-between gap-2 px-1 text-xs text-muted-foreground">
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <button
              type="button"
              aria-pressed={showPrecision}
              disabled={!fit}
              onClick={() => setShowPrecision((v) => !v)}
              className={cn(
                'rounded-[7px] bg-surface-2 px-2.5 py-1.5',
                showPrecision && fit ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              Precision
            </button>
            {precision ? (
              <PrecisionLegend room={room} />
            ) : (
              <span>Dashed outline: the floor the saved points cover</span>
            )}
          </span>
          <span>
            {!head
              ? ''
              : !calibration
                ? ''
                : !calibration.fit
                  ? calibrationIssue(head, calibration)
                  : wizard.running
                    ? wizard.step?.kind === 'place'
                      ? 'Jog the beam onto the marked spot'
                      : 'Click the floor where the beam lands'
                    : room.active
                      ? `Click the floor to test-aim ${head.name} there`
                      : 'Make this room active to test-aim'}
          </span>
        </div>
        {(error || skipped) && (
          <p className="text-sm text-destructive">{error?.message ?? skipped?.reason}</p>
        )}
      </main>

      {head && calibration && wizard.running ? (
        <WizardCard head={head} wizard={wizard} />
      ) : head && calibration ? (
        <PointInspector
          key={point?.id}
          room={room}
          head={head}
          point={point}
          calibration={calibration}
          onSelectPoint={onSelectPoint}
        />
      ) : (
        <aside className="flex flex-1 basis-80 flex-col gap-2 rounded-2xl bg-surface-1 p-4 sm:max-w-[360px]">
          <h2 className="text-[15px] font-semibold">No moving heads</h2>
          <p className="text-sm text-muted-foreground">
            Add a fixture of type Moving head in the Plan view to calibrate it here.
          </p>
        </aside>
      )}
    </div>
  )
}

function HeadList({ room, heads, points, head, onSelectHead }: Props) {
  const { dmx } = useLive()
  if (heads.length === 0) return null
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl bg-surface-1 p-2">
      <div className="flex items-baseline justify-between px-2.5 pt-2.5 pb-2">
        <h2 className="text-[15px] font-semibold">Moving heads</h2>
        <span className="font-mono text-xs text-muted-foreground">{heads.length}</span>
      </div>
      {heads.map((h) => {
        const color = outputColor(h, room.active ? dmx?.channels : null)
        return (
          <Button
            key={h.id}
            variant="ghost"
            aria-current={h.id === head?.id}
            onClick={() => onSelectHead(h.id)}
            className="h-auto min-h-[52px] justify-start gap-3 px-2.5 py-1.5 font-normal"
          >
            <span
              className={cn(
                'size-4 shrink-0 rounded-[5px]',
                !color && 'shadow-[inset_0_0_0_1.5px_var(--off-ring)]',
              )}
              style={color ? { background: color, boxShadow: `0 0 10px ${color}` } : undefined}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
              <span className="truncate">{h.name}</span>
              <span className="text-xs text-muted-foreground">
                {fitSummary(headCalibration(h, points, room))}
              </span>
            </span>
            <span className="font-mono text-[11px] text-muted-foreground">DMX {h.address}</span>
          </Button>
        )
      })}
    </div>
  )
}

function PointInspector({
  room,
  head,
  point,
  calibration,
  onSelectPoint,
}: {
  room: Room
  head: Fixture
  point?: CalibrationPoint
  calibration: HeadCalibration
  onSelectPoint: (id: number | null) => void
}) {
  const { dmx } = useLive()
  const { update, remove } = useCalibrationMutations(room.id)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const live = livePanTilt(head, room.active ? dmx?.channels : null)
  const saved = point && point.pan !== null && point.tilt !== null
  const { fit } = calibration
  const worst =
    fit && calibration.saved.length > 0
      ? calibration.saved[fit.errors.indexOf(Math.max(...fit.errors))]
      : undefined

  return (
    <aside className="flex flex-1 basis-80 flex-col gap-4 sm:max-w-[360px]">
      <div className="flex flex-col gap-3.5 rounded-2xl bg-surface-1 p-4">
        {point ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="point-name">Point</Label>
              <CommitInput
                id="point-name"
                value={point.name}
                onCommit={(name) =>
                  name && update.mutate({ id: point.id, fixtureId: point.fixtureId, name })
                }
              />
            </div>
            <span className="text-[13px] text-muted-foreground">
              {saved
                ? 'Saved. Jog and save again to correct it.'
                : `Jog ${head.name} until the beam sits on this spot in the room, then save.`}{' '}
              <span className="font-mono">
                {point.position.x.toFixed(2)}, {point.position.y.toFixed(2)}
              </span>
            </span>
          </>
        ) : (
          <span className="text-[13px] text-muted-foreground">
            Pick a reference point, or add one, to save the head’s aim for it.
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3.5 rounded-2xl bg-surface-1 p-4">
        <JogPad head={head} roomActive={room.active} />
        {point && (
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-2.5">
            <Button
              variant="default"
              size="lg"
              disabled={!live || update.isPending}
              onClick={() =>
                live && update.mutate({ id: point.id, fixtureId: point.fixtureId, ...live })
              }
            >
              {saved ? 'Update' : 'Save'} {point.name}
            </Button>
            <Button
              size="lg"
              disabled={!saved}
              onClick={() =>
                update.mutate({ id: point.id, fixtureId: point.fixtureId, pan: null, tilt: null })
              }
            >
              Clear
            </Button>
            <Button
              variant="destructive"
              size="lg"
              disabled={remove.isPending}
              onBlur={() => setConfirmDelete(false)}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true)
                remove.mutate(point, { onSuccess: () => onSelectPoint(null) })
              }}
            >
              {confirmDelete ? 'Confirm' : 'Delete'}
            </Button>
          </div>
        )}
        {(update.error ?? remove.error) && (
          <p className="text-sm text-destructive">{(update.error ?? remove.error)?.message}</p>
        )}
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-1 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold">Fit</span>
          <span className="font-mono text-xs">
            {fit
              ? `±${fit.rms.toFixed(1)}° · ${calibration.saved.length} points`
              : calibration.saved.length >= calibration.needed
                ? 'Doesn’t fit'
                : 'Not yet'}
          </span>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-1">
          {Array.from({ length: Math.max(calibration.needed, calibration.saved.length) }).map(
            (_, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed row of progress pips
                key={i}
                className={cn(
                  'h-1.5 rounded-full',
                  i < calibration.saved.length ? 'bg-foreground' : 'bg-surface-3',
                )}
              />
            ),
          )}
        </div>
        <span className="text-xs leading-normal text-muted-foreground">
          {!fit
            ? calibrationIssue(head, calibration)
            : calibration.geometry && fit.rms >= 1.5
              ? 'The points fit loosely. Check the room size and head height below, and each point’s aim.'
              : worst && fit.rms >= 0.5
                ? `Worst point ${worst.name}, off by ${Math.max(...fit.errors).toFixed(1)}°. Check it, or add a point near it.`
                : 'Every saved point agrees with the fit.'}
        </span>
      </div>

      <GeometryCard room={room} head={head} geometry={calibration.geometry} />
    </aside>
  )
}

// The scale of the precision map, in the room's units: meters once it has a
// width, else a share of it.
function PrecisionLegend({ room }: { room: Room }) {
  const worst = room.width
    ? `${Math.round(PRECISION_WORST * room.width * 100)} cm`
    : `${Math.round(PRECISION_WORST * 100)}% of the width`
  return (
    <span className="flex items-center gap-2">
      <span>Expected miss</span>
      <span
        className="h-1.5 w-20 rounded-full"
        style={{ background: 'linear-gradient(to right, var(--surface-3), var(--warning))' }}
      />
      <span className="font-mono">≥ {worst}</span>
      <span>· dark: out of reach · dashed: calibrated floor</span>
    </span>
  )
}

// Measurements that turn the fit from a guess into a check: the room's floor
// size and how high the head hangs, in meters.
function GeometryCard({
  room,
  head,
  geometry,
}: {
  room: Room
  head: Fixture
  geometry: HeadCalibration['geometry']
}) {
  const { resize } = useRoomMutations()
  const { update } = useFixtureMutations(room.id)
  const [invalid, setInvalid] = useState<string | null>(null)
  const error = invalid ?? resize.error?.message ?? update.error?.message

  // Empty clears the measurement.
  const meters = (text: string, max: number, then: (v: number | null) => void) => {
    const v = Number(text)
    if (text !== '' && (Number.isNaN(v) || v <= 0 || v > max)) {
      return setInvalid(`Measurements are in meters, above 0 and up to ${max}`)
    }
    setInvalid(null)
    then(text === '' ? null : v)
  }
  const shown = (v: number | null) => (v === null ? '' : String(v))

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-4">
      <span className="text-[13px] font-semibold">Measurements</span>
      <div className="grid grid-cols-3 gap-2.5">
        <NumberField
          id="room-width"
          label="Width (m)"
          placeholder="?"
          value={shown(room.width)}
          onCommit={(t) => meters(t, 1000, (width) => resize.mutate({ id: room.id, width }))}
        />
        <NumberField
          id="room-depth"
          label="Depth (m)"
          placeholder="?"
          value={shown(room.depth)}
          onCommit={(t) => meters(t, 1000, (depth) => resize.mutate({ id: room.id, depth }))}
        />
        <NumberField
          id="head-height"
          label="Head (m)"
          placeholder="?"
          value={shown(head.height)}
          onCommit={(t) => meters(t, 100, (height) => update.mutate({ id: head.id, height }))}
        />
      </div>
      <span className="text-xs leading-normal text-muted-foreground">
        {geometry
          ? 'Used to fit the head and to aim at object heights. A wrong figure shows up as a looser fit.'
          : 'Floor width and depth, and how high the head hangs above the floor. Without all three the fit has to guess them, which needs more points and aims less well.'}
      </span>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  )
}

export function fitSummary(c: HeadCalibration) {
  if (c.fit) return `${c.saved.length} points · ±${c.fit.rms.toFixed(1)}°`
  if (c.saved.length >= c.needed) return `${c.saved.length} points · doesn’t fit`
  if (c.saved.length) return `${c.saved.length} of ${c.needed} points`
  return 'Not calibrated'
}

function nextPointName(points: CalibrationPoint[]) {
  const taken = new Set(points.map((p) => p.name.toLowerCase()))
  let n = points.length + 1
  while (taken.has(`point ${n}`)) n++
  return `Point ${n}`
}
