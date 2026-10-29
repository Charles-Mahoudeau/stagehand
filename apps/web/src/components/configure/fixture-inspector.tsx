import { FIXTURE_TYPES } from '@stagehand/shared'
import { cn } from 'cn'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useLive } from '@/lib/live'
import { channelCountLabel, outputColor, profileLabel, rangeLabel, typeLabel } from '@/lib/patch'
import { type Fixture, useFixtureMutations } from '@/lib/rooms'
import { CommitInput } from './commit-input'
import { IdentifyButton } from './identify-button'
import type { ViewProps } from './shared'

// F1's right column: everything about the selected fixture.
export function FixtureInspector({ room, fixtures, selected, onSelect, overlapping }: ViewProps) {
  if (!selected) {
    return (
      <aside className="flex flex-1 basis-80 flex-col gap-2 rounded-2xl bg-surface-1 p-4 sm:max-w-[360px]">
        <h2 className="text-[15px] font-semibold">No fixture selected</h2>
        <p className="text-sm text-muted-foreground">
          Pick one on the plan or in the list, or add one with Add fixture.
        </p>
      </aside>
    )
  }
  // Keyed so drafts and the delete confirmation don't carry over between fixtures.
  return (
    <Inspector
      key={selected.id}
      fixture={selected}
      fixtures={fixtures}
      roomActive={room.active}
      overlapping={overlapping.has(selected.id)}
      onSelect={onSelect}
    />
  )
}

function Inspector({
  fixture,
  fixtures,
  roomActive,
  overlapping,
  onSelect,
}: {
  fixture: Fixture
  fixtures: Fixture[]
  roomActive: boolean
  overlapping: boolean
  onSelect: ViewProps['onSelect']
}) {
  const { dmx } = useLive()
  const { update, remove } = useFixtureMutations(fixture.roomId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const color = outputColor(fixture, roomActive ? dmx?.channels : null) ?? 'rgb(60 60 60)'
  const linked = fixtures.filter((f) => f.address === fixture.address && f.id !== fixture.id)
  const error = invalid ?? update.error?.message ?? remove.error?.message

  const save = (changes: Parameters<typeof update.mutate>[0]) => {
    setInvalid(null)
    update.mutate(changes)
  }
  const saveAddress = (text: string) => {
    const address = Number(text)
    if (!Number.isInteger(address) || address < 1 || address > 512) {
      return setInvalid('Address must be a whole number from 1 to 512')
    }
    save({ id: fixture.id, address })
  }
  const saveCoord = (axis: 'x' | 'y') => (text: string) => {
    const v = Number(text)
    if (text === '' || Number.isNaN(v) || v < 0 || v > 1) {
      return setInvalid('Positions are fractions of the room, from 0 to 1')
    }
    const position = { x: fixture.position?.x ?? 0.5, y: fixture.position?.y ?? 0.5, [axis]: v }
    save({ id: fixture.id, position })
  }

  return (
    <aside className="flex flex-1 basis-80 flex-col gap-4 sm:max-w-[360px]">
      <div className="flex flex-col overflow-hidden rounded-2xl bg-surface-1">
        <div
          className="h-[110px]"
          style={{
            background: `radial-gradient(120% 100% at 50% 0%, ${color} 0%, color-mix(in srgb, ${color} 22%, transparent) 65%, transparent 100%)`,
          }}
        />
        <div className="flex flex-col gap-1 px-4 pt-3.5 pb-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="truncate text-xl font-semibold">{fixture.name}</h2>
            <span className="font-mono text-xs text-muted-foreground">
              DMX {rangeLabel(fixture)}
            </span>
          </div>
          <span className="text-[13px] text-muted-foreground">{profileLabel(fixture.type)}</span>
          {overlapping && (
            <span className="mt-1 flex items-center gap-2 text-[13px] text-warning">
              <span className="size-1.5 rounded-full bg-warning" />
              Its channels overlap another fixture’s
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3.5 rounded-2xl bg-surface-1 p-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="fixture-name">Name</Label>
          <CommitInput
            id="fixture-name"
            value={fixture.name}
            onCommit={(name) =>
              name ? save({ id: fixture.id, name }) : setInvalid('Name can’t be empty')
            }
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] text-muted-foreground">Type</span>
          <div className="grid grid-cols-2 gap-[3px] rounded-lg bg-surface-2 p-[3px]">
            {FIXTURE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={fixture.type === type}
                onClick={() => fixture.type !== type && save({ id: fixture.id, type })}
                className={cn(
                  'h-[38px] rounded-[7px] text-[13px]',
                  fixture.type === type
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {typeLabel(type)} · {channelCountLabel(type)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <NumberField
            id="fixture-address"
            label="Address"
            value={String(fixture.address)}
            onCommit={saveAddress}
          />
          <NumberField
            id="fixture-x"
            label="X"
            value={fixture.position?.x.toFixed(2) ?? ''}
            onCommit={saveCoord('x')}
          />
          <NumberField
            id="fixture-y"
            label="Y"
            value={fixture.position?.y.toFixed(2) ?? ''}
            onCommit={saveCoord('y')}
          />
        </div>
        <div className="flex flex-col gap-2 pt-0.5">
          <span className="text-xs text-muted-foreground">
            {linked.length
              ? `Shares DMX ${fixture.address} with these, so they always show the same output`
              : 'No other fixture on this address'}
          </span>
          {linked.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {linked.map((f) => (
                <Button
                  key={f.id}
                  size="sm"
                  className="h-8 rounded-md px-2.5 font-mono text-xs"
                  onClick={() => onSelect(f.id)}
                >
                  {f.name}
                </Button>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <IdentifyButton variant="default" size="lg" fixture={fixture} roomActive={roomActive} />
        <Button
          variant="destructive"
          size="lg"
          disabled={remove.isPending}
          onBlur={() => setConfirmDelete(false)}
          onClick={() => {
            if (!confirmDelete) return setConfirmDelete(true)
            remove.mutate(fixture.id, { onSuccess: () => onSelect(null) })
          }}
        >
          {confirmDelete ? 'Confirm delete' : 'Delete'}
        </Button>
      </div>
    </aside>
  )
}

function NumberField(props: {
  id: string
  label: string
  value: string
  onCommit: (v: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      <CommitInput
        id={props.id}
        inputMode="decimal"
        className="font-mono"
        value={props.value}
        onCommit={props.onCommit}
      />
    </div>
  )
}
