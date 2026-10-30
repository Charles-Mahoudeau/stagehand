import { cn } from 'cn'
import { Maximize, Minus, Plus } from 'lucide-react'
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import { outputColor } from '@/lib/patch'
import type { Fixture, Position } from '@/lib/rooms'

type Props = {
  fixtures: Fixture[]
  // Whether the room is driven; otherwise fixtures are drawn dark.
  live: boolean
  // The room's width over its depth; the plan is square-ish filling its box when omitted.
  aspect?: number
  selectedId?: number
  // Fixtures drawn at full strength; the others are dimmed. All when omitted.
  highlight?: Set<number>
  onSelect?: (id: number) => void
  // Makes fixtures draggable (and movable with the arrow keys).
  onMove?: (id: number, position: Position) => Promise<unknown>
  size?: 'lg' | 'sm'
  className?: string
  // Drawn over the fixtures, in the same box. Gets the conversion from a
  // pointer event to plan coordinates, for markers of its own.
  overlay?: (toPosition: (e: MouseEvent) => Position | null) => ReactNode
  // A click on the plan (not on a fixture), in plan coordinates.
  onFloorClick?: (position: Position) => void
  // Makes it a viewport: scroll to zoom at the pointer, drag the background to pan,
  // double-click or Fit to come back. Fixtures keep their size when zoomed.
  zoomable?: boolean
}

type View = { x: number; y: number; z: number }
const HOME: View = { x: 0, y: 0, z: 1 }
const MIN_ZOOM = 0.5
const MAX_ZOOM = 8
// A drag shorter than this is a click, not a pan.
const PAN_SLOP = 3

const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))
// Zooms by `factor` keeping the point (cx, cy), in the box's pixels, where it is.
const zoomAbout = (v: View, cx: number, cy: number, factor: number): View => {
  const z = clampZoom(v.z * factor)
  const k = z / v.z
  return { z, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k }
}

const STEP = 0.01
const snap = (v: number) => Math.round(Math.min(1, Math.max(0, v)) / STEP) * STEP

// Top view of the room, stage at the top. Positions are fractions of the
// room's width and depth, so the plan stretches to whatever box it gets.
export function StagePlan({
  fixtures,
  live,
  aspect,
  selectedId,
  highlight,
  onSelect,
  onMove,
  size = 'lg',
  className,
  overlay,
  onFloorClick,
  zoomable,
}: Props) {
  const { dmx } = useLive()
  const area = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ id: number; position: Position; moved: boolean } | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(HOME)
  const pan = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const lg = size === 'lg'
  const z = zoomable ? view.z : 1

  useEffect(() => {
    const el = box.current
    if (!zoomable || !el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.0015)
      setView((v) => zoomAbout(v, e.clientX - r.left, e.clientY - r.top, factor))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomable])

  const zoomBy = (factor: number) => {
    const r = box.current?.getBoundingClientRect()
    if (r) setView((v) => zoomAbout(v, r.width / 2, r.height / 2, factor))
  }
  const panDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!zoomable || (e.button !== 0 && e.button !== 1)) return
    // Fixtures and the toolbar handle their own pointers; the middle button pans from anywhere.
    if (e.button === 0 && (e.target as Element).closest('button')) return
    pan.current = { x: e.clientX, y: e.clientY, moved: false }
  }
  const panMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = pan.current
    if (!p) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (!p.moved) {
      if (Math.hypot(dx, dy) < PAN_SLOP) return
      p.moved = true
      // Captured only once it is a drag, so a plain click still reaches the floor.
      e.currentTarget.setPointerCapture(e.pointerId)
    }
    p.x = e.clientX
    p.y = e.clientY
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
  }
  const panUp = () => {
    pan.current = null
  }
  const channels = live ? dmx?.channels : null
  const selected = fixtures.find((f) => f.id === selectedId)
  const linked = new Set(
    fixtures.filter((f) => f.address === selected?.address && f.id !== selectedId).map((f) => f.id),
  )

  const pointerPosition = (e: MouseEvent): Position | null => {
    const rect = area.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: snap((e.clientX - rect.left) / rect.width),
      y: snap((e.clientY - rect.top) / rect.height),
    }
  }

  const onPointerDown = (f: Fixture) => (e: PointerEvent<HTMLButtonElement>) => {
    if (!onMove || !f.position || e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: f.id, position: f.position, moved: false })
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return
    const position = pointerPosition(e)
    if (position) setDrag({ ...drag, position, moved: true })
  }
  const onPointerUp = async () => {
    if (!drag) return
    if (drag.moved && onMove) await onMove(drag.id, drag.position).catch(() => {})
    setDrag(null)
  }
  const onKeyDown = (f: Fixture) => (e: KeyboardEvent) => {
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      e.key
    ]
    if (!delta || !onMove || !f.position) return
    e.preventDefault()
    const step = e.shiftKey ? STEP * 10 : STEP
    void onMove(f.id, {
      x: snap(f.position.x + (delta[0] ?? 0) * step),
      y: snap(f.position.y + (delta[1] ?? 0) * step),
    })
  }

  const positionOf = (f: Fixture) => (drag?.id === f.id ? drag.position : f.position)
  const selectedPos = selected && positionOf(selected)
  const placed = fixtures.filter((f) => f.position)
  const unplaced = fixtures.filter((f) => !f.position)

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut; fixtures stay keyboard-reachable
    <div
      ref={box}
      onPointerDown={panDown}
      onPointerMove={panMove}
      onPointerUp={panUp}
      onPointerCancel={panUp}
      onDoubleClick={(e) => {
        if (zoomable && !(e.target as Element).closest('button')) setView(HOME)
      }}
      className={cn(
        'relative overflow-hidden rounded-2xl bg-surface-0',
        zoomable && 'cursor-grab select-none active:cursor-grabbing',
        className,
      )}
    >
      <span
        className={cn(
          'absolute tracking-[0.16em] text-muted-foreground',
          lg ? 'top-4 left-4 text-xs' : 'top-3 left-3.5 text-[11px]',
        )}
      >
        STAGE
      </span>
      <div className={cn('absolute inset-x-0 h-px bg-surface-3', lg ? 'top-[52px]' : 'top-9')} />
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${view.x}px, ${view.y}px) scale(${z})`,
          transformOrigin: '0 0',
        }}
      >
        <div
          className={cn(
            'absolute flex items-center justify-center @container-[size]',
            lg ? 'inset-[68px_40px_40px_40px]' : 'inset-[52px_24px_24px_24px]',
          )}
        >
          {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: a pointer shortcut; markers and fixtures stay keyboard-reachable */}
          <div
            ref={area}
            onClick={(e) => {
              if (!onFloorClick || (e.target as Element).closest('button')) return
              const position = pointerPosition(e)
              if (position) onFloorClick(position)
            }}
            style={
              aspect
                ? {
                    width: `min(100cqw, 100cqh * ${aspect})`,
                    height: `min(100cqh, 100cqw / ${aspect})`,
                  }
                : { width: '100%', height: '100%' }
            }
            className={cn(
              'relative shrink-0',
              onFloorClick && 'cursor-crosshair',
              lg &&
                'bg-[linear-gradient(#141414_1px,transparent_1px),linear-gradient(90deg,#141414_1px,transparent_1px)] bg-size-[10%_10%]',
            )}
          >
            {lg && selectedPos && (
              <>
                <div
                  className="absolute inset-x-0 border-t border-dashed border-input"
                  style={{ top: `${selectedPos.y * 100}%` }}
                />
                <div
                  className="absolute inset-y-0 border-l border-dashed border-input"
                  style={{ left: `${selectedPos.x * 100}%` }}
                />
              </>
            )}
            {placed.map((f) => {
              const pos = positionOf(f) as Position
              const color = outputColor(f, channels)
              const dim = highlight && !highlight.has(f.id)
              const head = f.type === 'moving_head'
              const dot = lg ? (head ? 18 : 14) : head ? 12 : 10
              return (
                <div
                  key={f.id}
                  className={cn('absolute size-0', dim && 'opacity-30')}
                  style={{
                    left: `${pos.x * 100}%`,
                    top: `${pos.y * 100}%`,
                    transform: `scale(${1 / z})`,
                  }}
                >
                  {color && (
                    <span
                      className="pointer-events-none absolute rounded-full"
                      style={{
                        inset: lg ? -50 : -30,
                        background: `radial-gradient(circle, color-mix(in srgb, ${color} 45%, transparent) 0%, transparent 70%)`,
                      }}
                    />
                  )}
                  {/* The button is a 40px target around the smaller dot. */}
                  <button
                    type="button"
                    aria-label={`${f.name}, DMX ${f.address}`}
                    aria-pressed={f.id === selectedId}
                    onClick={() => onSelect?.(f.id)}
                    onPointerDown={onPointerDown(f)}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={() => setDrag(null)}
                    onKeyDown={onKeyDown(f)}
                    className={cn(
                      'absolute flex -translate-1/2 touch-none items-center justify-center rounded-full border-0 bg-transparent p-0',
                      lg ? 'size-10' : 'size-7',
                      onMove ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                    )}
                  >
                    <span
                      className={cn(
                        head ? 'rounded-md' : 'rounded-full',
                        f.id === selectedId
                          ? 'shadow-select'
                          : linked.has(f.id) &&
                              'shadow-[0_0_0_3px_var(--background),0_0_0_4px_var(--text-muted)]',
                        !color &&
                          f.id !== selectedId &&
                          'shadow-[inset_0_0_0_1.5px_var(--off-ring)]',
                      )}
                      style={{ width: dot, height: dot, background: color ?? 'var(--surface-2)' }}
                    />
                  </button>
                  {lg && (
                    <span
                      className={cn(
                        'pointer-events-none absolute top-[-7px] left-3.5 font-mono text-[10px] whitespace-nowrap',
                        f.id === selectedId ? 'text-foreground' : 'text-muted-foreground',
                      )}
                    >
                      {f.name}
                    </span>
                  )}
                </div>
              )
            })}
            {lg && selectedPos && (
              <span
                className="pointer-events-none absolute rounded-md bg-surface-3 px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap"
                style={{
                  left: `${selectedPos.x * 100}%`,
                  top: `${selectedPos.y * 100}%`,
                  transformOrigin: '0 0',
                  transform: `scale(${1 / z}) translate(${selectedPos.x > 0.7 ? 'calc(-100% - 14px)' : '14px'}, 12px)`,
                }}
              >
                {selectedPos.x.toFixed(2)}, {selectedPos.y.toFixed(2)}
              </span>
            )}
            {overlay?.(pointerPosition)}
          </div>
        </div>
      </div>
      {zoomable && (
        <div className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg bg-surface-1/90 p-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Zoom out"
            onClick={() => zoomBy(1 / 1.4)}
          >
            <Minus />
          </Button>
          <span className="w-10 text-center font-mono text-[11px] text-muted-foreground">
            {Math.round(view.z * 100)}%
          </span>
          <Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => zoomBy(1.4)}>
            <Plus />
          </Button>
          <Button variant="ghost" size="xs" aria-label="Fit the room" onClick={() => setView(HOME)}>
            <Maximize />
            Fit
          </Button>
        </div>
      )}
      {lg && unplaced.length > 0 && (
        <div className="absolute inset-x-4 bottom-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Not on the plan:
          {unplaced.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => onSelect?.(f.id)}
              className={cn(
                'h-7 rounded-md px-2 font-mono text-foreground',
                f.id === selectedId ? 'bg-primary text-primary-foreground' : 'bg-surface-3',
              )}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
