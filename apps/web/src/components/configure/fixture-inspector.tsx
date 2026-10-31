import { FIXTURE_PROFILES, FIXTURE_TYPES } from '@stagehand/shared'
import { cn } from 'cn'
import { useState } from 'react'
import {
  Field,
  Panel,
  PanelBody,
  PanelHeader,
  PanelNote,
  PanelTitle,
  Section,
  Spacer,
} from '@/components/shell/panel'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import { channelCountLabel, outputColor, profileLabel, rangeLabel, typeLabel } from '@/lib/patch'
import { type Fixture, useFixtureMutations } from '@/lib/rooms'
import { CommitInput } from './commit-input'
import { Fader } from './fader'
import { IdInput } from './id-input'
import { IdentifyButton } from './identify-button'
import { useAddFixture, type ViewProps } from './shared'

const TINTS: Record<string, string> = {
  red: 'var(--ch-red)',
  green: 'var(--ch-green)',
  blue: 'var(--ch-blue)',
  white: 'var(--ch-white)',
}

// The right column: everything about the selected fixture.
export function FixtureInspector(props: ViewProps) {
  const { selected } = props
  return (
    <Panel className="w-80 shrink-0">
      <PanelHeader>
        <PanelTitle>Inspector</PanelTitle>
        <Spacer />
        {selected && <PanelNote>fixture #{selected.id}</PanelNote>}
      </PanelHeader>
      {selected ? (
        // Keyed so drafts and the delete confirmation don't carry over between fixtures.
        <Inspector key={selected.id} {...props} fixture={selected} />
      ) : (
        <PanelBody className="p-3 text-xs text-muted-foreground">
          Pick a fixture on the plan or in the list, or add one with +.
        </PanelBody>
      )}
    </Panel>
  )
}

function Inspector(props: ViewProps & { fixture: Fixture }) {
  const { room, fixtures, fixture, onSelect, overlapping } = props
  const roomActive = room.active
  const { dmx, setChannels } = useLive()
  const { update, remove } = useFixtureMutations(fixture.roomId)
  const addFixture = useAddFixture(props)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [invalid, setInvalid] = useState<string | null>(null)
  const color = outputColor(fixture, roomActive ? dmx?.channels : null)
  const linked = fixtures.filter((f) => f.address === fixture.address && f.id !== fixture.id)
  const error =
    invalid ?? update.error?.message ?? remove.error?.message ?? addFixture.error?.message

  const save = (changes: Parameters<typeof update.mutate>[0], onSuccess?: () => void) => {
    setInvalid(null)
    update.mutate(changes, { onSuccess })
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
    <PanelBody>
      <div className="flex items-center gap-3 p-3">
        <span
          className={cn(
            'size-8 shrink-0 rounded-lg',
            !color && 'bg-surface-3 shadow-[inset_0_0_0_1.5px_var(--off-ring)]',
          )}
          style={color ? { background: color, boxShadow: `0 0 20px ${color}` } : undefined}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold">{fixture.name}</h2>
          <p className="truncate text-xs text-muted-foreground">
            {profileLabel(fixture.type)} ·{' '}
            <span className="font-mono">DMX {rangeLabel(fixture)}</span>
          </p>
        </div>
        <IdentifyButton variant="secondary" size="xs" fixture={fixture} roomActive={roomActive} />
      </div>
      {overlapping.has(fixture.id) && (
        <p className="flex items-center gap-2 px-3 pb-2 text-xs text-warning">
          <span className="size-1.5 rounded-full bg-warning" />
          Its channels overlap another fixture’s
        </p>
      )}

      <Section title="Patch">
        <Field label="Name" htmlFor="fixture-name">
          <CommitInput
            compact
            id="fixture-name"
            value={fixture.name}
            onCommit={(name) =>
              name ? save({ id: fixture.id, name }) : setInvalid('Name can’t be empty')
            }
          />
        </Field>
        <Field label="ID" htmlFor="fixture-id">
          <IdInput
            id="fixture-id"
            value={fixture.id}
            onCommit={(newId) => save({ id: fixture.id, newId }, () => onSelect(newId))}
          />
        </Field>
        <Field label="Type">
          <div className="flex gap-0.5 rounded-md bg-surface-2 p-0.5">
            {FIXTURE_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={fixture.type === type}
                onClick={() => fixture.type !== type && save({ id: fixture.id, type })}
                className={cn(
                  'h-6 flex-1 rounded-[4px] text-[11px]',
                  fixture.type === type
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {typeLabel(type)} · {channelCountLabel(type)}
              </button>
            ))}
          </div>
        </Field>
        <Field label="DMX address" htmlFor="fixture-address">
          <CommitInput
            compact
            id="fixture-address"
            inputMode="numeric"
            className="font-mono"
            value={String(fixture.address)}
            onCommit={saveAddress}
          />
        </Field>
        <p className="px-3 pt-1 text-[11px] text-muted-foreground">
          {linked.length
            ? `Shares DMX ${fixture.address}, so they always show the same output:`
            : 'No other fixture on this address.'}
        </p>
        <div className="flex flex-wrap gap-1 px-3 pt-1">
          {linked.map((f) => (
            <Button key={f.id} size="xs" className="font-mono" onClick={() => onSelect(f.id)}>
              {f.name}
            </Button>
          ))}
          <Button
            size="xs"
            variant="dashed"
            disabled={addFixture.pending}
            onClick={() => addFixture.add({ type: fixture.type, address: fixture.address })}
          >
            + Add on {fixture.address}
          </Button>
        </div>
      </Section>

      <Section title="Position">
        <Field label="X / Y" htmlFor="fixture-x">
          <div className="grid grid-cols-2 gap-1">
            <CommitInput
              compact
              id="fixture-x"
              aria-label="X"
              inputMode="decimal"
              className="font-mono"
              value={fixture.position?.x.toFixed(2) ?? ''}
              onCommit={saveCoord('x')}
            />
            <CommitInput
              compact
              aria-label="Y"
              inputMode="decimal"
              className="font-mono"
              value={fixture.position?.y.toFixed(2) ?? ''}
              onCommit={saveCoord('y')}
            />
          </div>
        </Field>
        <p className="px-3 pt-1 text-[11px] text-muted-foreground">
          Fractions of the room, 0 to 1. Drag on the plan, or use the arrow keys.
        </p>
      </Section>

      <Section title="Live output">
        {FIXTURE_PROFILES[fixture.type].channels.map((ch, i) => {
          const n = fixture.address + i
          const value = dmx?.channels[n - 1] ?? 0
          return (
            <div
              key={ch.attribute}
              className="grid grid-cols-[28px_52px_minmax(0,1fr)_28px] items-center gap-2 px-3 py-[3px]"
            >
              <span className="font-mono text-[11px] text-muted-foreground">{n}</span>
              <span className="truncate text-xs">{ch.label}</span>
              <Fader
                compact
                label={`${ch.label}, channel ${n}`}
                value={value}
                tint={TINTS[ch.attribute] ?? 'var(--text)'}
                disabled={!roomActive}
                onChange={(v) => setChannels(n, [v])}
              />
              <span className="text-right font-mono text-[11px]">{value}</span>
            </div>
          )
        })}
        <p className="px-3 pt-1 text-[11px] text-muted-foreground">
          {roomActive
            ? 'Faders stay until something changes them. Blackout clears all.'
            : 'Make this room active to test its channels.'}
        </p>
      </Section>

      <Section title="Danger">
        <div className="px-3 pt-1">
          <Button
            variant="destructive"
            size="xs"
            disabled={remove.isPending}
            onBlur={() => setConfirmDelete(false)}
            onClick={() => {
              if (!confirmDelete) return setConfirmDelete(true)
              remove.mutate(fixture.id, { onSuccess: () => onSelect(null) })
            }}
          >
            {confirmDelete ? 'Confirm delete' : 'Delete fixture'}
          </Button>
        </div>
      </Section>
      {error && <p className="px-3 pb-3 text-xs text-destructive">{error}</p>}
    </PanelBody>
  )
}
