import type { PlanPoint } from '@stagehand/shared'
import { cn } from 'cn'
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useState } from 'react'

// Things drawn over the stage plan for aiming: object and calibration-point
// markers, the floor a calibration covers, and beams from heads to spots.
// All take plan coordinates (fractions of the room) and sit in StagePlan's
// overlay box.

const STEP = 0.01
const snap = (v: number) => Math.round(Math.min(1, Math.max(0, v)) / STEP) * STEP
const at = (p: PlanPoint) => ({ left: `${p.x * 100}%`, top: `${p.y * 100}%` })

type MarkerProps = {
  position: PlanPoint
  label: string
  // Diamond for objects, crosshair for calibration points.
  shape: 'diamond' | 'cross'
  selected?: boolean
  // Drawn dashed: an object out of reach, or a point not saved yet.
  pending?: boolean
  // Big touch target with the label inside, for Perform.
  size?: 'md' | 'lg'
  onSelect?: () => void
  // Makes the marker draggable (and movable with the arrow keys).
  onMove?: (position: PlanPoint) => unknown
  toPosition?: (e: MouseEvent) => PlanPoint | null
}

export function PlanMarker({
  position,
  label,
  shape,
  selected,
  pending,
  size = 'md',
  onSelect,
  onMove,
  toPosition,
}: MarkerProps) {
  const [drag, setDrag] = useState<{ position: PlanPoint; moved: boolean } | null>(null)
  const shown = drag?.position ?? position
  const lg = size === 'lg'

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (!onMove || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ position, moved: false })
  }
  const onPointerMove = (e: PointerEvent) => {
    const p = drag && toPosition?.(e)
    if (p) setDrag({ position: { x: snap(p.x), y: snap(p.y) }, moved: true })
  }
  const onPointerUp = () => {
    if (drag?.moved) onMove?.(drag.position)
    setDrag(null)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      e.key
    ]
    if (!delta || !onMove) return
    e.preventDefault()
    const step = e.shiftKey ? STEP * 10 : STEP
    onMove({
      x: snap(position.x + (delta[0] ?? 0) * step),
      y: snap(position.y + (delta[1] ?? 0) * step),
    })
  }

  const mark =
    shape === 'diamond' ? (
      <span
        className={cn(
          'block rotate-45',
          lg ? 'size-3.5' : 'size-4',
          selected
            ? 'bg-foreground shadow-select'
            : pending
              ? 'border-[1.5px] border-dashed border-muted-foreground bg-surface-0'
              : 'border-[1.5px] border-foreground bg-surface-0',
        )}
      />
    ) : (
      <span className="relative block size-6">
        <span
          className={cn(
            'absolute top-1/2 -left-1 h-px w-8',
            pending ? 'bg-off-ring' : 'bg-foreground',
          )}
        />
        <span
          className={cn(
            'absolute -top-1 left-1/2 h-8 w-px',
            pending ? 'bg-off-ring' : 'bg-foreground',
          )}
        />
        <span
          className={cn(
            'absolute inset-0 rounded-full border-[1.5px]',
            pending ? 'border-dashed border-muted-foreground' : 'border-foreground',
            selected && 'shadow-select',
          )}
        />
      </span>
    )

  return (
    <div className="absolute size-0" style={at(shown)}>
      <button
        type="button"
        data-plan-marker
        aria-label={label}
        aria-pressed={selected}
        onClick={(e) => {
          e.stopPropagation()
          onSelect?.()
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => setDrag(null)}
        onKeyDown={onKeyDown}
        className={cn(
          'absolute flex touch-none items-center border-0 p-0',
          lg
            ? cn(
                'h-11 -translate-y-1/2 -translate-x-[22px] gap-2.5 rounded-xl pr-3.5 pl-[15px] text-sm whitespace-nowrap',
                selected
                  ? 'bg-foreground/10 font-semibold text-foreground'
                  : 'text-muted-foreground',
              )
            : 'size-11 -translate-1/2 justify-center rounded-full bg-transparent',
          onMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
        )}
      >
        {mark}
        {lg && label}
      </button>
      {!lg && (
        <span
          className={cn(
            'pointer-events-none absolute top-2.5 left-[18px] text-xs whitespace-nowrap',
            selected ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          {label}
        </span>
      )}
    </div>
  )
}

// SVG layer in plan coordinates (0–100 both ways); strokes keep their width
// however the plan is stretched.
export function PlanSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full overflow-visible"
    >
      {children}
    </svg>
  )
}

// The floor a head's calibration points enclose.
export function CoverageOutline({ hull }: { hull: PlanPoint[] }) {
  if (hull.length < 3) return null
  return (
    <polygon
      points={hull.map((p) => `${p.x * 100},${p.y * 100}`).join(' ')}
      fill="rgb(242 242 242 / 0.035)"
      stroke="var(--input)"
      strokeDasharray="4 4"
      vectorEffect="non-scaling-stroke"
    />
  )
}

export function BeamLine({ from, to, color }: { from: PlanPoint; to: PlanPoint; color: string }) {
  return (
    <line
      x1={from.x * 100}
      y1={from.y * 100}
      x2={to.x * 100}
      y2={to.y * 100}
      stroke={color}
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
    />
  )
}

// The pool of light where a beam lands. Light output, so it carries hue.
export function BeamSpot({
  at: p,
  color,
  size = 96,
}: {
  at: PlanPoint
  color: string
  size?: number
}) {
  return (
    <span
      className="pointer-events-none absolute rounded-full"
      style={{
        ...at(p),
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        background: `radial-gradient(circle, color-mix(in srgb, ${color} 70%, transparent) 0%, color-mix(in srgb, ${color} 22%, transparent) 45%, transparent 70%)`,
      }}
    />
  )
}
