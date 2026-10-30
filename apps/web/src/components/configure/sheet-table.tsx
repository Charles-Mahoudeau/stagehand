import { channelCount, FIXTURE_TYPES, type FixtureType } from '@stagehand/shared'
import { cn } from 'cn'
import { Trash2 } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import {
  lastChannel,
  nextFreeAddress,
  nextName,
  outputColor,
  rangeLabel,
  typeLabel,
  UNIVERSE,
} from '@/lib/patch'
import { type Fixture, useFixtureMutations } from '@/lib/rooms'
import { CommitInput } from './commit-input'
import { IdentifyButton } from './identify-button'
import { useAddFixture, type ViewProps } from './shared'

const cellInput = 'bg-transparent hover:bg-surface-2 focus-visible:bg-surface-2'
const select =
  'h-7 rounded-md bg-transparent px-1 text-xs text-muted-foreground outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring'
const th =
  'sticky top-0 z-10 bg-surface-1 px-2 py-1.5 text-left text-[11px] font-normal text-muted-foreground'

// The patch as an editable table: one row per fixture, a row at the end to add one.
export function SheetTable(props: ViewProps) {
  const { room, fixtures, selected, onSelect, overlapping } = props
  const [order, setOrder] = useState<'address' | 'name'>('address')
  const rows = [...fixtures].sort((a, b) =>
    order === 'address'
      ? a.address - b.address || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name, undefined, { numeric: true }),
  )

  return (
    <table className="w-full min-w-[720px] border-separate border-spacing-0 text-xs">
      <thead>
        <tr>
          <th className={cn(th, 'w-8')}>
            <span className="sr-only">Output</span>
          </th>
          <th className={th}>Name</th>
          <th className={th}>Type</th>
          <th className={th}>
            <button
              type="button"
              className="hover:text-foreground"
              aria-label={`Sorted by ${order}, switch to ${order === 'address' ? 'name' : 'address'}`}
              onClick={() => setOrder(order === 'address' ? 'name' : 'address')}
            >
              Address {order === 'address' ? '↓' : ''}
            </button>
          </th>
          <th className={th}>Channels</th>
          <th className={th}>Position</th>
          <th className={th}>
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((f, i) => (
          <SheetRow
            key={f.id}
            fixture={f}
            roomActive={room.active}
            selected={f.id === selected?.id}
            overlapping={overlapping.has(f.id)}
            repeat={order === 'address' && rows[i - 1]?.address === f.address}
            onSelect={() => onSelect(f.id)}
            onDeleted={() => onSelect(null)}
          />
        ))}
        <AddRow {...props} />
      </tbody>
    </table>
  )
}

function SheetRow({
  fixture: f,
  roomActive,
  selected,
  overlapping,
  repeat,
  onSelect,
  onDeleted,
}: {
  fixture: Fixture
  roomActive: boolean
  selected: boolean
  overlapping: boolean
  repeat: boolean
  onSelect: () => void
  onDeleted: () => void
}) {
  const { dmx } = useLive()
  const { update, remove } = useFixtureMutations(f.roomId)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const color = outputColor(f, roomActive ? dmx?.channels : null)
  const error = update.error ?? remove.error

  return (
    <>
      <tr
        onFocusCapture={onSelect}
        className={cn(
          selected && '[&>td]:bg-surface-3',
          !repeat && '[&>td]:shadow-[0_-1px_0_var(--border-subtle)]',
        )}
      >
        <td className="px-1">
          <button
            type="button"
            aria-label={`Select ${f.name}`}
            onClick={onSelect}
            className="flex size-7 items-center justify-center rounded-md"
          >
            <span
              className={cn(
                'size-2.5',
                f.type === 'par' ? 'rounded-full' : 'rounded-[3px]',
                !color && 'shadow-[inset_0_0_0_1.5px_var(--off-ring)]',
              )}
              style={color ? { background: color, boxShadow: `0 0 8px ${color}` } : undefined}
            />
          </button>
        </td>
        <td className="px-0.5">
          <CommitInput
            compact
            aria-label="Name"
            className={cn(cellInput, 'font-medium')}
            value={f.name}
            onCommit={(name) => name && update.mutate({ id: f.id, name })}
          />
        </td>
        <td className="px-0.5">
          <select
            aria-label="Type"
            className={select}
            value={f.type}
            onChange={(e) => update.mutate({ id: f.id, type: e.target.value as FixtureType })}
          >
            {FIXTURE_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </td>
        <td className="px-0.5">
          <CommitInput
            compact
            aria-label="Address"
            inputMode="numeric"
            className={cn(cellInput, 'w-16 font-mono', repeat && 'text-muted-foreground')}
            value={String(f.address)}
            onCommit={(text) => {
              const address = Number(text)
              if (Number.isInteger(address) && address >= 1) update.mutate({ id: f.id, address })
            }}
          />
        </td>
        <td
          className={cn(
            'px-2 font-mono text-[11px]',
            overlapping ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {rangeLabel(f)}
          {overlapping && ' · overlap'}
        </td>
        <td className="px-2 font-mono text-[11px] text-muted-foreground">
          {f.position ? `${f.position.x.toFixed(2)}, ${f.position.y.toFixed(2)}` : 'not placed'}
        </td>
        <td className="px-1">
          <div className="flex items-center justify-end gap-1">
            <IdentifyButton size="xs" variant="quiet" fixture={f} roomActive={roomActive} />
            <Button
              variant={confirmDelete ? 'destructive' : 'ghost'}
              size={confirmDelete ? 'xs' : 'icon-xs'}
              aria-label={confirmDelete ? undefined : `Delete ${f.name}`}
              disabled={remove.isPending}
              onBlur={() => setConfirmDelete(false)}
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true)
                remove.mutate(f.id, { onSuccess: onDeleted })
              }}
            >
              {confirmDelete ? 'Delete?' : <Trash2 className="text-muted-foreground" />}
            </Button>
          </div>
        </td>
      </tr>
      {error && (
        <tr>
          <td />
          <td colSpan={6} className="px-2 pb-1 text-[11px] text-destructive">
            {error.message}
          </td>
        </tr>
      )}
    </>
  )
}

function AddRow(props: ViewProps) {
  const { fixtures } = props
  const addFixture = useAddFixture(props)
  const [name, setName] = useState('')
  const [type, setType] = useState<FixtureType>('par')
  const [addressText, setAddressText] = useState('')
  const suggested = nextFreeAddress(fixtures, type)
  const address = addressText === '' ? suggested : Number(addressText)
  const valid =
    Number.isInteger(address) && address >= 1 && address + channelCount(type) - 1 <= UNIVERSE
  const end = address + channelCount(type) - 1
  const linkedTo = fixtures.filter((f) => f.address === address && f.type === type)
  const clashes = fixtures.filter(
    (f) => !linkedTo.includes(f) && f.address <= end && lastChannel(f) >= address,
  )

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    addFixture.add({ name: name.trim() || undefined, type, address })
    setName('')
    setAddressText('')
  }
  const field =
    'h-7 rounded-md bg-surface-2 px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring'

  return (
    <>
      <tr className="[&>td]:bg-surface-0">
        <td className="px-2.5 py-1.5">
          <span className="block size-2.5 rounded-full border-[1.5px] border-dashed border-off-ring" />
        </td>
        <td className="px-0.5 py-1.5">
          <input
            form="add-fixture"
            aria-label="New fixture name"
            placeholder={nextName(fixtures)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(field, 'w-full')}
          />
        </td>
        <td className="px-0.5 py-1.5">
          <select
            form="add-fixture"
            aria-label="New fixture type"
            className={cn(select, 'bg-surface-2 text-foreground')}
            value={type}
            onChange={(e) => setType(e.target.value as FixtureType)}
          >
            {FIXTURE_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabel(t)}
              </option>
            ))}
          </select>
        </td>
        <td className="px-0.5 py-1.5">
          <input
            form="add-fixture"
            aria-label="New fixture address"
            inputMode="numeric"
            placeholder={String(suggested)}
            value={addressText}
            onChange={(e) => setAddressText(e.target.value)}
            className={cn(field, 'w-16 font-mono')}
          />
        </td>
        <td
          className={cn(
            'px-2 py-1.5 font-mono text-[11px]',
            !valid || clashes.length ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {!valid
            ? 'past 512'
            : `${address}–${end} · ${
                clashes.length
                  ? `overlaps ${clashes[0]?.name}`
                  : linkedTo.length
                    ? `linked to ${linkedTo[0]?.name}`
                    : 'free'
              }`}
        </td>
        <td className="px-2 py-1.5 text-[11px] text-muted-foreground">middle of the room</td>
        <td className="px-1 py-1.5 text-right">
          <form id="add-fixture" onSubmit={submit}>
            <Button
              type="submit"
              variant="default"
              size="xs"
              disabled={!valid || addFixture.pending}
            >
              Add
            </Button>
          </form>
        </td>
      </tr>
      {addFixture.error && (
        <tr>
          <td />
          <td colSpan={6} className="px-2 pb-1 text-[11px] text-destructive">
            {addFixture.error.message}
          </td>
        </tr>
      )}
    </>
  )
}
