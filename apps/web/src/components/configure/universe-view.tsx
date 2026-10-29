import { channelCount, FIXTURE_PROFILES } from '@stagehand/shared'
import { cn } from 'cn'
import { type PointerEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import {
  type AddressGroup,
  groupByAddress,
  lastChannel,
  outputColor,
  patchedChannels,
  profileLabel,
  rangeLabel,
  UNIVERSE,
} from '@/lib/patch'
import { useFixtureMutations } from '@/lib/rooms'
import { Fader } from './fader'
import { useAddFixture, type ViewProps } from './shared'
import { StagePlan } from './stage-plan'

const COLUMNS = 32
const ROWS = UNIVERSE / COLUMNS
const LABEL_WIDTH = 44
const GAP = 3
const ROW_HEIGHT = 44

const TINTS: Record<string, string> = {
  red: 'var(--ch-red)',
  green: 'var(--ch-green)',
  blue: 'var(--ch-blue)',
  white: 'var(--ch-white)',
}

type Drag = { group: AddressGroup; grab: number; target: number; moved: boolean }

// F3: the universe as the work area. Each address is a block as wide as its
// fixtures' channel count; drag one to re-address it, onto another to link.
export function UniverseView(props: ViewProps) {
  const { room, fixtures, selected, onSelect, overlapping } = props
  const { dmx } = useLive()
  const { update } = useFixtureMutations(room.id)
  const addFixture = useAddFixture(props)
  const grid = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [showAll, setShowAll] = useState(false)
  const groups = groupByAddress(fixtures)
  const highest = Math.max(0, ...fixtures.map(lastChannel))
  const usedRows = Math.min(ROWS, Math.max(8, Math.ceil(highest / COLUMNS) + 1))
  const rows = showAll ? ROWS : usedRows
  const selectedGroup = selected && groups.find((g) => g.address === selected.address)

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
    <div className="flex flex-1 flex-wrap items-start gap-4">
      <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-3 rounded-2xl bg-surface-1 px-4 pt-3.5 pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold">Universe 1</h2>
          <span className="font-mono text-xs text-muted-foreground">
            {patchedChannels(fixtures).size} of {UNIVERSE} ch · {groups.length} addresses ·{' '}
            {fixtures.length} fixtures
          </span>
          <div className="flex-1" />
          <span className="text-xs text-muted-foreground">
            Drag a block to re-address · drop it on another to link
          </span>
          <Button
            variant="default"
            size="sm"
            disabled={addFixture.pending}
            onClick={() => addFixture.add()}
          >
            Add fixture
          </Button>
        </div>
        <div className="overflow-x-auto">
          <div
            ref={grid}
            className="grid min-w-[760px] font-mono select-none"
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
                className="flex items-center text-[11px] text-muted-foreground"
                style={{ gridRow: row + 1, gridColumn: 1 }}
              >
                {row * COLUMNS + 1}
              </span>
            ))}
            {Array.from({ length: rows * COLUMNS }, (_, i) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: one fixed cell per channel
                key={i}
                className="rounded-[4px] bg-surface-0"
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
                      'flex touch-none cursor-grab items-center gap-1.5 overflow-hidden rounded-lg px-2 text-[11px] whitespace-nowrap',
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
                        ? `4px solid ${tint(g, room.active ? dmx?.channels : null)}`
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
                    className="pointer-events-none flex items-center rounded-lg border border-dashed border-foreground px-2 text-[11px] text-foreground"
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
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {overlapping.size > 0
              ? 'Hatched blocks overlap another fixture’s channels.'
              : 'No overlapping channels.'}
          </span>
          {usedRows < ROWS && (
            <Button
              variant="link"
              size="sm"
              className="h-auto px-0 text-xs"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? `Fold empty rows` : `Show ${usedRows * COLUMNS + 1}–${UNIVERSE}`}
            </Button>
          )}
        </div>
        {update.error && <p className="text-sm text-destructive">{update.error.message}</p>}
      </main>

      <aside className="flex flex-1 basis-80 flex-col gap-4 sm:max-w-[380px]">
        {selectedGroup ? (
          <>
            <ChannelPanel group={selectedGroup} roomActive={room.active} />
            <AddressPanel {...props} group={selectedGroup} onAdd={addFixture.add} />
          </>
        ) : (
          <div className="flex flex-col gap-2 rounded-2xl bg-surface-1 p-4">
            <h2 className="text-[15px] font-semibold">No address selected</h2>
            <p className="text-sm text-muted-foreground">
              Click a block to test its channels and see which fixtures it drives.
            </p>
          </div>
        )}
      </aside>
    </div>
  )
}

function ChannelPanel({ group, roomActive }: { group: AddressGroup; roomActive: boolean }) {
  const { dmx, setChannels } = useLive()
  const first = group.fixtures[0]
  const color =
    (first && outputColor(first, roomActive ? dmx?.channels : null)) ?? 'var(--surface-3)'

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl bg-surface-1 p-4">
      <div className="flex items-center gap-3.5">
        <span
          className="size-11 shrink-0 rounded-xl"
          style={{ background: color, boxShadow: `0 0 28px ${color}` }}
        />
        <div className="flex flex-col gap-0.5">
          <h2 className="font-mono text-xl font-semibold">DMX {rangeLabel(group)}</h2>
          <span className="text-[13px] text-muted-foreground">{profileLabel(group.type)}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {FIXTURE_PROFILES[group.type].channels.map((ch, i) => {
          const n = group.address + i
          const value = dmx?.channels[n - 1] ?? 0
          return (
            <div
              key={ch.attribute}
              className="grid grid-cols-[32px_minmax(0,1fr)_minmax(0,1.6fr)_28px] items-center gap-2.5"
            >
              <span className="font-mono text-xs text-muted-foreground">{n}</span>
              <span className="truncate text-[13px]">{ch.label}</span>
              <Fader
                label={`${ch.label}, channel ${n}`}
                value={value}
                tint={TINTS[ch.attribute] ?? 'var(--text)'}
                disabled={!roomActive}
                onChange={(v) => setChannels(n, [v])}
              />
              <span className="text-right font-mono text-xs">{value}</span>
            </div>
          )
        })}
      </div>
      <span className="text-xs text-muted-foreground">
        {roomActive
          ? 'Faders write to the output and stay until something changes them. Blackout clears all.'
          : 'Make this room active to test its channels.'}
      </span>
    </div>
  )
}

function AddressPanel({
  room,
  fixtures,
  selected,
  onSelect,
  group,
  onAdd,
}: ViewProps & { group: AddressGroup; onAdd: ReturnType<typeof useAddFixture>['add'] }) {
  const ids = new Set(group.fixtures.map((f) => f.id))
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-surface-1 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold">On this address</h3>
        <span className="font-mono text-xs text-muted-foreground">
          {group.fixtures.length} {group.fixtures.length === 1 ? 'fixture' : 'fixtures'}
        </span>
      </div>
      <StagePlan
        size="sm"
        className="h-[200px] rounded-xl"
        fixtures={fixtures}
        live={room.active}
        selectedId={selected?.id}
        highlight={ids}
        onSelect={onSelect}
      />
      <div className="grid grid-cols-4 gap-1.5">
        {group.fixtures.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={f.id === selected?.id ? 'default' : 'secondary'}
            className="rounded-md px-2 font-mono text-xs"
            onClick={() => onSelect(f.id)}
          >
            <span className="truncate">{f.name}</span>
          </Button>
        ))}
      </div>
      <Button variant="dashed" onClick={() => onAdd({ type: group.type, address: group.address })}>
        Add a fixture on {group.address}
      </Button>
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
