import { cn } from 'cn'
import { lastChannel, UNIVERSE } from '@/lib/patch'
import type { Fixture } from '@/lib/rooms'

type Props = {
  fixtures: Fixture[]
  selected?: Fixture
  // Channels in conflict, drawn in the warning color.
  overlapping: Set<number>
  columns: number
  channels?: number
  // Channels to draw dashed, for a fixture about to be added.
  pending?: [number, number]
  className?: string
}

// Compact occupancy map: one cell per channel.
export function UniverseMap({
  fixtures,
  selected,
  overlapping,
  columns,
  channels = UNIVERSE,
  pending,
  className,
}: Props) {
  const owners = new Map<number, Fixture[]>()
  for (const f of fixtures) {
    for (let ch = f.address; ch <= lastChannel(f); ch++)
      owners.set(ch, [...(owners.get(ch) ?? []), f])
  }
  const cells = Array.from({ length: channels }, (_, i) => {
    const ch = i + 1
    const here = owners.get(ch)
    if (pending && ch >= pending[0] && ch <= pending[1]) {
      return 'border border-dashed border-muted-foreground'
    }
    if (!here) return 'bg-surface-2'
    if (selected && here.some((f) => f.address === selected.address)) return 'bg-foreground'
    if (here.some((f) => overlapping.has(f.id)) && new Set(here.map((f) => f.address)).size > 1) {
      return 'bg-warning'
    }
    return 'bg-off-ring'
  })

  return (
    <div
      role="img"
      aria-label={`Channel map, ${owners.size} of ${UNIVERSE} channels patched`}
      className={cn('grid gap-0.5', className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {cells.map((cls, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: one fixed cell per channel
        <span key={i} className={cn('block rounded-[2px]', columns > 32 ? 'h-2' : 'h-3', cls)} />
      ))}
    </div>
  )
}
