import { cn } from 'cn'
import { Plus, Search } from 'lucide-react'
import { useState } from 'react'
import {
  Panel,
  PanelBody,
  PanelHeader,
  PanelNote,
  PanelTab,
  PanelTitle,
  Spacer,
} from '@/components/shell/panel'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import {
  describeOverlap,
  groupByAddress,
  type Overlap,
  outputColor,
  patchedChannels,
  rangeLabel,
  typeLabel,
  UNIVERSE,
} from '@/lib/patch'
import { roomAspect, useFixtureMutations } from '@/lib/rooms'
import { FixtureInspector } from './fixture-inspector'
import { useAddFixture, type ViewProps } from './shared'
import { SheetTable } from './sheet-table'
import { StagePlan } from './stage-plan'
import { UniverseGrid } from './universe-grid'

export const DOCKS = { universe: 'Universe 1', sheet: 'Patch sheet', problems: 'Problems' } as const
export type Dock = keyof typeof DOCKS

type Props = ViewProps & {
  dock: Dock
  onDock: (dock: Dock) => void
  overlaps: Overlap[]
}

// Configure › Patch: fixtures on the left, the plan above a universe/patch
// dock in the middle, the selected fixture on the right.
export function PatchWorkspace(props: Props) {
  const { room, fixtures, selected, onSelect, dock, onDock, overlaps } = props
  const { update } = useFixtureMutations(room.id)

  return (
    <>
      <FixtureList {...props} />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Panel className="flex-1">
          <PanelHeader className="pl-0">
            <PanelTab active>Plan</PanelTab>
            <Spacer />
            <PanelNote>
              Drag fixtures to move · arrows nudge · scroll to zoom · drag background to pan
            </PanelNote>
          </PanelHeader>
          <StagePlan
            zoomable
            className="min-h-0 flex-1 rounded-none"
            fixtures={fixtures}
            live={room.active}
            aspect={roomAspect(room)}
            selectedId={selected?.id}
            onSelect={onSelect}
            onMove={(id, position) => update.mutateAsync({ id, position })}
          />
        </Panel>

        <Panel className="h-[284px] shrink-0">
          <PanelHeader className="pl-0">
            <div role="tablist" aria-label="Patch views" className="flex">
              {(Object.keys(DOCKS) as Dock[]).map((key) => (
                <PanelTab key={key} active={dock === key} onClick={() => onDock(key)}>
                  {DOCKS[key]}
                  {key === 'problems' && overlaps.length > 0 && (
                    <span className="ml-1.5 font-mono text-warning">{overlaps.length}</span>
                  )}
                </PanelTab>
              ))}
            </div>
            <Spacer />
            <PanelNote>
              {patchedChannels(fixtures).size} of {UNIVERSE} ch patched
              {selected && ` · selected ${rangeLabel(selected)}`}
            </PanelNote>
          </PanelHeader>
          <PanelBody>
            {dock === 'universe' && <UniverseGrid {...props} />}
            {dock === 'sheet' && <SheetTable {...props} />}
            {dock === 'problems' && <Problems {...props} />}
          </PanelBody>
        </Panel>
      </div>

      <FixtureInspector {...props} />
    </>
  )
}

function Problems({ overlaps, onSelect }: Props) {
  if (overlaps.length === 0) {
    return <p className="p-3 text-xs text-muted-foreground">No problems. Every channel is clear.</p>
  }
  return (
    <ul className="flex flex-col p-1">
      {overlaps.map((o) => (
        <li key={`${o.channels[0]}-${o.fixtures.map((f) => f.id).join('-')}`}>
          <button
            type="button"
            onClick={() => onSelect(o.fixtures[0]?.id ?? null)}
            className="flex h-7 w-full items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-surface-2"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-warning" />
            {describeOverlap(o)}
          </button>
        </li>
      ))}
    </ul>
  )
}

function FixtureList({ room, fixtures, selected, onSelect, overlapping, ...props }: Props) {
  const { dmx } = useLive()
  const addFixture = useAddFixture({ room, fixtures, selected, onSelect, overlapping, ...props })
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = q
    ? fixtures.filter((f) => f.name.toLowerCase().includes(q) || String(f.address).startsWith(q))
    : fixtures
  const groups = groupByAddress(shown)

  return (
    <Panel className="w-[260px] shrink-0">
      <PanelHeader>
        <PanelTitle>Fixtures</PanelTitle>
        <PanelNote>
          {fixtures.length} · {groupByAddress(fixtures).length} addr
        </PanelNote>
        <Spacer />
        <Button
          variant="secondary"
          size="icon-xs"
          aria-label="Add fixture"
          disabled={addFixture.pending}
          onClick={() => addFixture.add()}
        >
          <Plus />
        </Button>
      </PanelHeader>
      <label className="mx-1.5 mt-1.5 flex h-7 items-center gap-1.5 rounded-md bg-surface-2 px-2 text-muted-foreground focus-within:outline-2 focus-within:outline-ring">
        <Search className="size-3.5 shrink-0" />
        <input
          aria-label="Search fixtures"
          placeholder="Search name or address"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        />
      </label>
      <PanelBody className="pb-2">
        {groups.length === 0 && (
          <p className="px-3 pt-3 text-xs text-muted-foreground">
            {fixtures.length === 0 ? 'No fixtures yet. Add one with +.' : 'No match.'}
          </p>
        )}
        {groups.map((g) => (
          <div key={g.address} className="flex flex-col pt-1.5">
            <div className="flex h-5 items-center justify-between gap-2 px-3 font-mono text-[10.5px] text-muted-foreground">
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
                <button
                  key={f.id}
                  type="button"
                  aria-current={f.id === selected?.id}
                  onClick={() => onSelect(f.id)}
                  className={cn(
                    'mx-1 flex h-[26px] items-center gap-2 rounded-[5px] px-2 text-left text-xs hover:bg-surface-2',
                    'aria-[current=true]:bg-surface-3',
                  )}
                >
                  <span
                    className={cn(
                      'size-2.5 shrink-0',
                      f.type === 'par' ? 'rounded-full' : 'rounded-[3px]',
                      !color && 'shadow-[inset_0_0_0_1.5px_var(--off-ring)]',
                    )}
                    style={color ? { background: color, boxShadow: `0 0 8px ${color}` } : undefined}
                  />
                  <span className="min-w-0 flex-1 truncate">{f.name}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {f.position ? `${f.position.x.toFixed(2)}, ${f.position.y.toFixed(2)}` : '—'}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </PanelBody>
    </Panel>
  )
}
