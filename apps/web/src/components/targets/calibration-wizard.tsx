import type { PlanPoint } from '@stagehand/shared'
import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import type { Fixture, Room } from '@/lib/rooms'
import {
  type CalibrationPoint,
  DIMMER_OFFSET,
  type HeadCalibration,
  panTiltValues,
  SPEED_OFFSET,
  useCalibrationMutations,
} from '@/lib/targets'
import { distanceCm, TARGET_CM, type WizardStep, wizardStep } from '@/lib/wizard'

type Run = {
  headId: number
  // The spot the user has marked for the current aim, not saved yet.
  placed: PlanPoint | null
  skipped: (PlanPoint | null)[]
  misses: number[]
}

// Drives the calibration wizard for one head: lights the aim `wizardStep`
// asks for, and turns the spot the user marks into a saved calibration point.
export function useCalibrationWizard(
  room: Room,
  head: Fixture | undefined,
  calibration: HeadCalibration | undefined,
  points: CalibrationPoint[],
) {
  const { setChannels } = useLive()
  const { create } = useCalibrationMutations(room.id)
  const [run, setRun] = useState<Run | null>(null)
  const running = !!head && run?.headId === head.id
  const live = useRef(setChannels)
  live.current = setChannels

  const step: WizardStep | null =
    running && head && calibration
      ? wizardStep({ room, head, calibration, skipped: run.skipped, misses: run.misses })
      : null
  const probe = step?.kind === 'probe' ? step.probe : null

  // Send the head to each new aim, beam on (fastest moves, full dimmer, shutter open).
  const address = head?.address
  const pan = probe?.aim.pan
  const tilt = probe?.aim.tilt
  useEffect(() => {
    if (address === undefined || pan === undefined || tilt === undefined) return
    live.current(address, panTiltValues({ pan, tilt }))
    live.current(address + SPEED_OFFSET, [0, 255, 0])
  }, [address, pan, tilt])

  const stop = () => {
    if (head) live.current(head.address + SPEED_OFFSET, [0, 0, 0])
    setRun(null)
  }

  const nextName = () => {
    const taken = new Set(points.map((p) => p.name.toLowerCase()))
    let n = (calibration?.points.length ?? 0) + 1
    while (taken.has(`point ${n}`)) n++
    return `Point ${n}`
  }

  return {
    running,
    step,
    placed: running ? run.placed : null,
    misses: running ? run.misses : [],
    saving: create.isPending,
    error: create.error,
    start: () => head && setRun({ headId: head.id, placed: null, skipped: [], misses: [] }),
    stop,
    place: (placed: PlanPoint) => setRun((r) => r && { ...r, placed }),
    // Can't see the beam: ask for a different aim.
    skip: () =>
      setRun((r) => r && { ...r, placed: null, skipped: [...r.skipped, probe?.spot ?? null] }),
    confirm: () => {
      if (!head || !run?.placed || !probe) return
      const { placed } = run
      create.mutate(
        { fixtureId: head.id, name: nextName(), position: placed, ...probe.aim },
        {
          onSuccess: () =>
            setRun((r) => {
              if (!r) return r
              const miss = probe.spot ? [distanceCm(room, probe.spot, placed)] : []
              return { ...r, placed: null, misses: [...r.misses, ...miss] }
            }),
        },
      )
    },
  }
}

export type Wizard = ReturnType<typeof useCalibrationWizard>

const DONE_TEXT = {
  accurate: 'Every spot the head can reach is now expected to land within the goal.',
  verified: 'The last aims all landed within the goal, so the fit is as good as it needs to be.',
  exhausted: 'There are no more spots worth checking. This is the best the room allows.',
  limit: 'Stopped at the point limit: more clicks aren’t making the fit better.',
}

export function WizardCard({ head, wizard }: { head: Fixture; wizard: Wizard }) {
  const { step, placed, misses, saving, error } = wizard
  const { dmx } = useLive()
  const worstCm = step && step.kind !== 'blocked' ? step.worstCm : null
  const last = misses.at(-1)

  // Enter confirms the marked spot, unless typing somewhere.
  const confirm = useRef(wizard.confirm)
  confirm.current = wizard.confirm
  const ready = !!placed && !saving
  useEffect(() => {
    if (!ready) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key !== 'Enter' || el.closest('input, textarea, button, [contenteditable]')) return
      confirm.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ready])

  return (
    <aside className="flex flex-1 basis-80 flex-col gap-4 sm:max-w-[360px]">
      <div className="flex flex-col gap-3.5 rounded-2xl bg-surface-1 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Calibration wizard</h2>
          <span className="font-mono text-xs text-muted-foreground">{head.name}</span>
        </div>

        {step?.kind === 'probe' && (
          <>
            <p className="text-sm leading-normal">
              {step.probe.spot
                ? `${head.name} is aimed at the weakest part of the floor. Click on the plan where its beam actually lands, then confirm.`
                : `${head.name} is lighting a spot in the room. Click on the plan where its beam lands, then confirm.`}
            </p>
            <p className="text-xs leading-normal text-muted-foreground">
              {step.probe.spot
                ? `The dashed circle is where it should land (expected miss ~${Math.round(step.probe.missCm ?? 0)} cm there). Drag your mark to adjust it.`
                : 'No fit yet, so the spot could be anywhere. Not on the floor or hidden? Skip it.'}
            </p>
            <div className="grid grid-cols-[2fr_1fr] gap-2.5">
              <Button
                size="lg"
                variant="default"
                disabled={!placed || saving}
                onClick={wizard.confirm}
              >
                {saving ? 'Saving…' : 'Confirm spot'}
              </Button>
              <Button size="lg" disabled={saving} onClick={wizard.skip}>
                Skip
              </Button>
            </div>
          </>
        )}

        {step?.kind === 'done' && (
          <>
            <p className="text-sm leading-normal">
              {worstCm !== null &&
                `Worst expected miss is about ${Math.max(1, Math.round(worstCm))} cm. `}
              {DONE_TEXT[step.reason]}
            </p>
            <Button size="lg" variant="default" onClick={wizard.stop}>
              Finish
            </Button>
          </>
        )}

        {step?.kind === 'blocked' && (
          <>
            <p className="text-sm leading-normal text-warning">{step.reason}</p>
            <Button size="lg" onClick={wizard.stop}>
              Close
            </Button>
          </>
        )}

        {error && <p className="text-sm text-destructive">{error.message}</p>}
      </div>

      <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-1 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-[13px] font-semibold">Accuracy</span>
          <span className="font-mono text-xs">
            {worstCm === null ? 'No fit yet' : `~${Math.max(1, Math.round(worstCm))} cm`}
            <span className="text-muted-foreground"> · goal &lt; {TARGET_CM} cm</span>
          </span>
        </div>
        <AccuracyBar cm={worstCm} />
        <span className="text-xs leading-normal text-muted-foreground">
          {last === undefined
            ? 'Worst expected miss over the floor the head can reach.'
            : `Last aim landed ${Math.round(last)} cm from where it should. Worst expected miss over the floor the head can reach.`}
        </span>
        {step?.kind === 'probe' && !dmx?.channels[head.address - 1 + DIMMER_OFFSET] && (
          <span className="text-xs text-warning">
            The beam is off: make sure this room is active.
          </span>
        )}
      </div>

      {step?.kind !== 'done' && (
        <Button variant="dashed" onClick={wizard.stop}>
          Stop wizard
        </Button>
      )}
    </aside>
  )
}

// Fills as the worst miss falls towards the goal: full at TARGET_CM, empty at
// ten times it (log scale, as the miss falls fast at first).
function AccuracyBar({ cm }: { cm: number | null }) {
  const filled = cm === null ? 0 : Math.min(1, Math.max(0, 1 - Math.log10(cm / TARGET_CM)))
  return (
    <div className="h-1.5 rounded-full bg-surface-3">
      <div
        className={cn('h-full rounded-full', filled >= 1 ? 'bg-foreground' : 'bg-muted-foreground')}
        style={{ width: `${Math.max(2, filled * 100)}%` }}
      />
    </div>
  )
}
