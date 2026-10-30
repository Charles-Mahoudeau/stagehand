import { aimAt, type PanTilt, type PlanPoint } from '@stagehand/shared'
import type { Fixture, Room } from '@/lib/rooms'
import { type HeadCalibration, PRECISION_GRID, precisionGrid } from '@/lib/targets'

// The calibration wizard lights spots in the room and asks where they landed.
// First it walks a grid over the floor (corners, center, edge midpoints) for
// the user to jog the beam onto, to get a fit; then it keeps aiming at the
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
  // No fit yet: the user jogs the beam onto `spot`, a point of the grid.
  | { kind: 'place'; spot: PlanPoint; index: number; total: number; worstCm: null }
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
  // Spots the user couldn't find, kept off the list: null for a grid spot
  // passed over before there was a fit.
  skipped: (PlanPoint | null)[]
  // How far each aimed spot was from where the user marked it, in centimeters.
  misses: number[]
}

// Grid spots for getting a first fit, in the order they're asked: corners to
// span the floor, the center, edge midpoints, then the inner corners. Inset so
// they stay on the floor and easy to find.
const EDGE = 0.1
const INNER = 0.3
const mid = 0.5
export const GRID_SPOTS: PlanPoint[] = [
  { x: EDGE, y: EDGE },
  { x: 1 - EDGE, y: EDGE },
  { x: 1 - EDGE, y: 1 - EDGE },
  { x: EDGE, y: 1 - EDGE },
  { x: mid, y: mid },
  { x: mid, y: EDGE },
  { x: 1 - EDGE, y: mid },
  { x: mid, y: 1 - EDGE },
  { x: EDGE, y: mid },
  { x: INNER, y: INNER },
  { x: 1 - INNER, y: INNER },
  { x: 1 - INNER, y: 1 - INNER },
  { x: INNER, y: 1 - INNER },
]

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
    const index = saved.length + skipped.length
    const spot = GRID_SPOTS[index]
    if (!spot) {
      return {
        kind: 'blocked',
        reason: `Ran out of grid spots before ${head.name} had a fit. Check the measurements and the points, or clear them and start again.`,
      }
    }
    return { kind: 'place', spot, index, total: GRID_SPOTS.length, worstCm: null }
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
