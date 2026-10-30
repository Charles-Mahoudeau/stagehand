import { channelCount } from '@stagehand/shared'
import { cn } from 'cn'
import { type PointerEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import {
  type AddressGroup,
  groupByAddress,
  lastChannel,
  outputColor,
  rangeLabel,
  UNIVERSE,
} from '@/lib/patch'
import { useFixtureMutations } from '@/lib/rooms'
import type { ViewProps } from './shared'

const COLUMNS = 32
const ROWS = UNIVERSE / COLUMNS
const LABEL_WIDTH = 36
const GAP = 2
const ROW_HEIGHT = 26

type Drag = { group: AddressGroup; grab: number; target: number; moved: boolean }

// The universe as a grid. Each address is a block as wide as its fixtures'
// channel count; drag one to re-address it, onto another to link.
export function UniverseGrid({ room, fixtures, selected, onSelect, overlapping }: ViewProps) {
  const { dmx } = useLive()
  const { update } = useFixtureMutations(room.id)
  const grid = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [showAll, setShowAll] = useState(false)
  const groups = groupByAddress(fixtures)
  const highest = Math.max(0, ...fixtures.map(lastChannel))
  const usedRows = Math.min(ROWS, Math.max(4, Math.ceil(highest / COLUMNS) + 1))
  const rows = showAll ? ROWS : usedRows

  const channelAt = (e: PointerEvent) => {
    const rect = grid.current?.getBoundingClientRect()
    if (!rect) return 1
    const cell = (rect.width - LABEL_WIDTH - GAP * COLUMNS) / COLUMNS
    const col = Math.floor((e.clientX - rect.left - LABEL_WIDTH - GAP) / (cell + GAP))
    const row = Math.floor((e.clientY - rect.top) / (ROW_HEIGHT + GAP))
    return clamp(row, 0, rows - 1) * COLUMNS + clamp(col, 0, COLUMNS - 1) + 1
  }

  const onPointerDown = (group: AddressGroup) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ group, grab: channelAt(e) - group.address, target: group.address, moved: false })
  }
  const onPointerMove = (e: PointerEvent) => {
    if (!drag) return
    const ch = channelAt(e)
    const count = channelCount(drag.group.type)
    // Dropping onto another block of the same type links to its address.
    const onto = groups.find(
      (g) =>
        g !== drag.group && g.type === drag.group.type && ch >= g.address && ch <= lastChannel(g),
    )
    const target = onto?.address ?? clamp(ch - drag.grab, 1, UNIVERSE - count + 1)
    if (target !== drag.target) setDrag({ ...drag, target, moved: true })
  }
  const onPointerUp = async () => {
    if (!drag) return
    const { group, target, moved } = drag
    if (!moved)
      onSelect(
        group.fixtures.find((f) => f.id === selected?.id)?.id ?? group.fixtures[0]?.id ?? null,
      )
    else if (target !== group.address) {
      await Promise.all(
        group.fixtures.map((f) => update.mutateAsync({ id: f.id, address: target })),
      ).catch(() => {})
    }
    setDrag(null)
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <div
        ref={grid}
        className="grid min-w-[640px] font-mono select-none"
        style={{
          gap: GAP,
          gridTemplateColumns: `${LABEL_WIDTH}px repeat(${COLUMNS}, minmax(0, 1fr))`,
          gridAutoRows: ROW_HEIGHT,
        }}
      >
        {Array.from({ length: rows }, (_, row) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one fixed label per row
            key={row}
            className="flex items-center text-[10px] text-muted-foreground"
            style={{ gridRow: row + 1, gridColumn: 1 }}
          >
            {row * COLUMNS + 1}
          </span>
        ))}
        {Array.from({ length: rows * COLUMNS }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: one fixed cell per channel
            key={i}
            className="rounded-[3px] bg-surface-0"
            style={{ gridRow: Math.floor(i / COLUMNS) + 1, gridColumn: (i % COLUMNS) + 2 }}
          />
        ))}
        {groups.map((g) =>
          segments(g.address, lastChannel(g), rows).map((seg) => {
            const on = g.address === selected?.address
            const clash = g.fixtures.some((f) => overlapping.has(f.id))
            const dragging = drag?.group === g && drag.moved
            return (
              <button
                key={`${g.address}-${seg.row}`}
                type="button"
                tabIndex={seg.head ? 0 : -1}
                aria-hidden={!seg.head}
                aria-label={seg.head ? `${groupLabel(g)}, DMX ${rangeLabel(g)}` : undefined}
                aria-pressed={seg.head ? on : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSelect(g.fixtures[0]?.id ?? null)
                }}
                onPointerDown={onPointerDown(g)}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={() => setDrag(null)}
                className={cn(
                  'flex touch-none cursor-grab items-center gap-1.5 overflow-hidden rounded-md px-2 text-[10.5px] whitespace-nowrap',
                  on
                    ? 'bg-primary font-medium text-primary-foreground'
                    : 'bg-surface-3 text-foreground',
                  clash &&
                    'bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(251_191_36/0.18)_6px_12px)] outline-2 -outline-offset-2 outline-warning',
                  dragging && 'opacity-40',
                )}
                style={{
                  gridRow: seg.row + 1,
                  gridColumn: `${seg.col + 2} / span ${seg.span}`,
                  // The block's edge shows what the address is putting out.
                  borderLeft: seg.head
                    ? `3px solid ${tint(g, room.active ? dmx?.channels : null)}`
                    : undefined,
                }}
              >
                {seg.head && groupLabel(g)}
              </button>
            )
          }),
        )}
        {drag?.moved &&
          segments(drag.target, drag.target + channelCount(drag.group.type) - 1, rows).map(
            (seg) => (
              <span
                key={`ghost-${seg.row}`}
                className="pointer-events-none flex items-center rounded-md border border-dashed border-foreground px-2 text-[10.5px] text-foreground"
                style={{
                  gridRow: seg.row + 1,
                  gridColumn: `${seg.col + 2} / span ${seg.span}`,
                }}
              >
                {seg.head && drag.target}
              </span>
            ),
          )}
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>
          Drag a block to re-address it, onto another to link.{' '}
          {overlapping.size > 0
            ? 'Hatched blocks overlap another fixture’s channels.'
            : 'No overlapping channels.'}
        </span>
        {usedRows < ROWS && (
          <Button variant="link" size="xs" className="px-0" onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Fold empty rows' : `Show ${usedRows * COLUMNS + 1}–${UNIVERSE}`}
          </Button>
        )}
      </div>
      {update.error && <p className="text-xs text-destructive">{update.error.message}</p>}
    </div>
  )
}

// Splits channels from..to into one span per grid row.
function segments(from: number, to: number, rows: number) {
  const out: { row: number; col: number; span: number; head: boolean }[] = []
  for (let ch = from; ch <= to; ) {
    const row = Math.floor((ch - 1) / COLUMNS)
    const col = (ch - 1) % COLUMNS
    const span = Math.min(to - ch + 1, COLUMNS - col)
    if (row < rows) out.push({ row, col, span, head: ch === from })
    ch += span
  }
  return out
}

function groupLabel(g: AddressGroup) {
  const names = g.fixtures.map((f) => f.name)
  const label = names.length <= 2 ? names.join(' ') : `${names[0]}–${names[names.length - 1]}`
  return g.type === 'moving_head' ? `${label} · head` : label
}

const tint = (g: AddressGroup, channels: number[] | null | undefined) =>
  (g.fixtures[0] && outputColor(g.fixtures[0], channels)) ?? 'var(--off-ring)'

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
