import { aimAt, type PanTilt, type PlanPoint, pan16, tilt16 } from '@stagehand/shared'
import type { Fixture, Room } from '@/lib/rooms'
import { type HeadCalibration, PRECISION_GRID, precisionGrid } from '@/lib/targets'

// The calibration wizard lights spots in the room and asks where they landed.
// First it lights spread-out aims to get a fit; then it keeps aiming at the
// floor where the precision map is worst, and the spot the user marks there
// becomes a new calibration point, until the whole floor is expected to be
// aimed within TARGET_CM.

// Worst expected miss the wizard works towards, in centimeters.
export const TARGET_CM = 5
// Stop adding points here: past it the fit isn't getting better by more clicks.
export const MAX_POINTS = 30
// Marked spots this many in a row that landed within TARGET_CM of where the
// head was aimed show the aim is as good as it needs to be.
const VERIFIED_RUN = 3
// Floor this close to a saved or skipped spot (room widths) isn't proposed
// again: another point there wouldn't tell the fit anything new.
const KEEP_CLEAR = 0.1

export type Probe = {
  aim: PanTilt
  // Where the fit says the beam lands, null while there is no fit yet.
  spot: PlanPoint | null
  // Expected miss there, in centimeters.
  missCm: number | null
}

export type WizardStep =
  | { kind: 'probe'; probe: Probe; worstCm: number | null }
  // Nothing more to ask. `reason` says why it stopped.
  | {
      kind: 'done'
      reason: 'accurate' | 'verified' | 'exhausted' | 'limit'
      worstCm: number | null
    }
  | { kind: 'blocked'; reason: string }

export type WizardInput = {
  room: Room
  head: Fixture
  calibration: HeadCalibration
  // Spots the user couldn't find, kept off the list: null for a spread-out
  // aim tried before there was a fit.
  skipped: (PlanPoint | null)[]
  // How far each aimed spot was from where the user marked it, in centimeters.
  misses: number[]
}

// Spread-out aims for getting a first fit when the head's pan/tilt-to-floor
// mapping isn't known: a golden-ratio walk over pan and a middling band of
// tilt, which tends to land on the floor, never repeating an aim.
export function spreadAim(index: number): PanTilt {
  const frac = (v: number) => v - Math.floor(v)
  return {
    pan: pan16(40 + frac(index * 0.618 + 0.1) * 460),
    tilt: tilt16(85 + frac(index * 0.382 + 0.3) * 90),
  }
}

const cellCenter = (i: number): PlanPoint => ({
  x: ((i % PRECISION_GRID) + 0.5) / PRECISION_GRID,
  y: (Math.floor(i / PRECISION_GRID) + 0.5) / PRECISION_GRID,
})

export function wizardStep({ room, head, calibration, skipped, misses }: WizardInput): WizardStep {
  if (!room.width || !room.depth || !calibration.geometry) {
    return {
      kind: 'blocked',
      reason: `Set the room’s width and depth and ${head.name}’s height under Measurements first: the wizard works in centimeters.`,
    }
  }
  const width = room.width
  const { fit, saved, needed } = calibration

  if (!fit) {
    // Past what a good run needs, more spread-out aims won't help: the clicks
    // or the measurements are off.
    if (saved.length >= needed + 4) {
      return {
        kind: 'blocked',
        reason: `The marked spots don’t agree on where ${head.name} hangs. Check the measurements and the points, or delete the odd ones.`,
      }
    }
    const probe: Probe = { aim: spreadAim(saved.length + skipped.length), spot: null, missCm: null }
    return { kind: 'probe', probe, worstCm: null }
  }

  const grid = precisionGrid(calibration)
  if (!grid) return { kind: 'blocked', reason: 'The head doesn’t aim yet.' }

  const clear = [...saved.map((p) => p.position), ...skipped.filter((p) => p !== null)]
  const aspect = fit.model.aspect
  const crowded = (p: PlanPoint) =>
    clear.some((c) => Math.hypot(p.x - c.x, (p.y - c.y) * aspect) < KEEP_CLEAR)

  let worst = 0
  let next: { cell: number; miss: number } | null = null
  grid.forEach((miss, i) => {
    if (miss === null) return
    worst = Math.max(worst, miss)
    if (!crowded(cellCenter(i)) && (!next || miss > next.miss)) next = { cell: i, miss }
  })
  const worstCm = worst * width * 100

  if (worstCm < TARGET_CM) return { kind: 'done', reason: 'accurate', worstCm }
  const recent = misses.slice(-VERIFIED_RUN)
  if (recent.length === VERIFIED_RUN && recent.every((m) => m < TARGET_CM)) {
    return { kind: 'done', reason: 'verified', worstCm }
  }
  if (saved.length >= MAX_POINTS) return { kind: 'done', reason: 'limit', worstCm }

  const target = next as { cell: number; miss: number } | null
  if (!target) return { kind: 'done', reason: 'exhausted', worstCm }
  const spot = cellCenter(target.cell)
  const aim = aimAt(fit.model, spot)
  if (!aim) return { kind: 'done', reason: 'exhausted', worstCm }
  return { kind: 'probe', probe: { aim, spot, missCm: target.miss * width * 100 }, worstCm }
}

// Distance between two plan spots, in centimeters.
export function distanceCm(room: Pick<Room, 'width' | 'depth'>, a: PlanPoint, b: PlanPoint) {
  return Math.hypot((a.x - b.x) * (room.width ?? 0), (a.y - b.y) * (room.depth ?? 0)) * 100
}
