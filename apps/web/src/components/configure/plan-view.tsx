import { cn } from 'cn'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import {
  groupByAddress,
  outputColor,
  patchedChannels,
  rangeLabel,
  typeLabel,
  UNIVERSE,
} from '@/lib/patch'
import { roomAspect, useFixtureMutations } from '@/lib/rooms'
import { FixtureInspector } from './fixture-inspector'
import { useAddFixture, type ViewProps } from './shared'
import { StagePlan } from './stage-plan'
import { UniverseMap } from './universe-map'

// F1: fixture list, stage plan and inspector.
export function PlanView(props: ViewProps) {
  const { room, fixtures, selected, onSelect, overlapping } = props
  const { update } = useFixtureMutations(room.id)
  const addFixture = useAddFixture(props)

  return (
    <div className="flex flex-1 flex-wrap gap-4">
      <FixtureList {...props} onAdd={() => addFixture.add()} addPending={addFixture.pending} />

      <main className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
        <StagePlan
          className="min-h-[520px] flex-1"
          fixtures={fixtures}
          live={room.active}
          aspect={roomAspect(room)}
          selectedId={selected?.id}
          onSelect={onSelect}
          onMove={(id, position) => update.mutateAsync({ id, position })}
        />
        <section className="flex flex-col gap-2.5 rounded-2xl bg-surface-1 px-4 py-3.5">
          <div className="flex flex-wrap justify-between gap-2 text-[13px]">
            <span className="font-semibold">Universe 1</span>
            <span className="font-mono text-xs text-muted-foreground">
              {patchedChannels(fixtures).size} of {UNIVERSE} channels patched
              {selected && ` · selected ${rangeLabel(selected)}`}
            </span>
          </div>
          <UniverseMap
            fixtures={fixtures}
            selected={selected}
            overlapping={overlapping}
            columns={64}
          />
        </section>
        {(update.error || addFixture.error) && (
          <p className="text-sm text-destructive">{(update.error ?? addFixture.error)?.message}</p>
        )}
      </main>

      <FixtureInspector {...props} />
    </div>
  )
}

function FixtureList({
  room,
  fixtures,
  selected,
  onSelect,
  overlapping,
  onAdd,
  addPending,
}: ViewProps & { onAdd: () => void; addPending: boolean }) {
  const { dmx } = useLive()
  const groups = groupByAddress(fixtures)

  return (
    <aside className="flex flex-1 basis-60 flex-col gap-0.5 rounded-2xl bg-surface-1 p-2 sm:max-w-[280px]">
      <div className="flex items-baseline justify-between px-2.5 pt-2.5 pb-2">
        <h2 className="text-[15px] font-semibold">Fixtures</h2>
        <span className="font-mono text-xs text-muted-foreground">
          {fixtures.length} · {groups.length} {groups.length === 1 ? 'address' : 'addresses'}
        </span>
      </div>
      {groups.map((g) => (
        <div key={g.address} className="flex flex-col gap-0.5 pb-1.5">
          <div className="flex items-center justify-between gap-2 px-2.5 pt-1.5 pb-0.5 font-mono text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              {g.fixtures.some((f) => overlapping.has(f.id)) && (
                <span
                  className="size-1.5 rounded-full bg-warning"
                  title="Overlaps another fixture"
                />
              )}
              DMX {rangeLabel(g)}
            </span>
            <span>
              {typeLabel(g.type)}
              {g.fixtures.length > 1 && ` ×${g.fixtures.length}`}
            </span>
          </div>
          {g.fixtures.map((f) => {
            const color = outputColor(f, room.active ? dmx?.channels : null)
            return (
              <Button
                key={f.id}
                variant="ghost"
                size="sm"
                aria-current={f.id === selected?.id}
                onClick={() => onSelect(f.id)}
                className="justify-start gap-3 px-2.5 font-normal"
              >
                <span
                  className={cn(
                    'size-3.5 shrink-0 rounded-full',
                    !color && 'shadow-[inset_0_0_0_1.5px_var(--off-ring)]',
                  )}
                  style={color ? { background: color, boxShadow: `0 0 10px ${color}` } : undefined}
                />
                <span className="min-w-0 flex-1 truncate text-left">{f.name}</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {f.position ? `${f.position.x.toFixed(2)}, ${f.position.y.toFixed(2)}` : '—'}
                </span>
              </Button>
            )
          })}
        </div>
      ))}
      <Button variant="dashed" className="mt-auto" disabled={addPending} onClick={onAdd}>
        Add fixture
      </Button>
    </aside>
  )
}
