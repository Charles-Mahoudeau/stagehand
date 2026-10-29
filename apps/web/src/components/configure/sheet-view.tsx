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
  patchedChannels,
  rangeLabel,
  typeLabel,
  UNIVERSE,
} from '@/lib/patch'
import { type Fixture, useFixtureMutations } from '@/lib/rooms'
import { CommitInput } from './commit-input'
import { IdentifyButton } from './identify-button'
import { useAddFixture, type ViewProps } from './shared'
import { StagePlan } from './stage-plan'
import { UniverseMap } from './universe-map'

const cellInput =
  'h-9 rounded-md bg-transparent px-2 hover:bg-surface-2 focus-visible:bg-surface-2 md:text-sm'
const select =
  'h-9 rounded-md bg-transparent px-1.5 text-sm text-muted-foreground outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ring'

// F2: the patch as an editable table, with the plan and address map beside it.
export function SheetView(props: ViewProps) {
  const { room, fixtures, selected, onSelect, overlapping } = props
  const { update } = useFixtureMutations(room.id)
  const [order, setOrder] = useState<'address' | 'name'>('address')
  const [pending, setPending] = useState<[number, number] | undefined>()
  const rows = [...fixtures].sort((a, b) =>
    order === 'address'
      ? a.address - b.address || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name, undefined, { numeric: true }),
  )
  const highest = Math.max(0, ...fixtures.map(lastChannel), pending?.[1] ?? 0)
  const mapChannels = Math.min(UNIVERSE, Math.max(192, Math.ceil((highest + 1) / 64) * 64))

  return (
    <div className="flex flex-1 flex-wrap items-start gap-4">
      <main className="flex min-w-0 flex-[999_1_640px] flex-col gap-2 rounded-2xl bg-surface-1 px-2 pt-2 pb-3">
        <div className="flex flex-wrap items-center gap-3 px-2.5 pt-2 pb-1">
          <h2 className="text-[15px] font-semibold">Patch</h2>
          <span className="font-mono text-xs text-muted-foreground">
            {fixtures.length} fixtures · {patchedChannels(fixtures).size} of {UNIVERSE} ch
          </span>
          <div className="flex-1" />
          <div className="flex gap-[3px] rounded-lg bg-surface-2 p-[3px] text-xs">
            {(['address', 'name'] as const).map((o) => (
              <button
                key={o}
                type="button"
                aria-pressed={order === o}
                onClick={() => setOrder(o)}
                className={cn(
                  'rounded-[7px] px-2.5 py-1.5',
                  order === o ? 'bg-input text-foreground' : 'text-muted-foreground',
                )}
              >
                By {o}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-y-0.5 text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="w-9 px-2.5 py-1.5 font-normal">
                  <span className="sr-only">Output</span>
                </th>
                <th className="px-2.5 py-1.5 font-normal">Name</th>
                <th className="px-2.5 py-1.5 font-normal">Type</th>
                <th className="px-2.5 py-1.5 font-normal">Address</th>
                <th className="px-2.5 py-1.5 font-normal">Channels</th>
                <th className="px-2.5 py-1.5 font-normal">Position</th>
                <th className="px-2.5 py-1.5 text-right font-normal">
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
              <AddRow {...props} onPreview={setPending} />
            </tbody>
          </table>
        </div>
        <p className="px-2.5 text-xs text-muted-foreground">
          The next free address is suggested. Fixtures on the same address are driven together: type
          an existing address to link a fixture to it.
        </p>
      </main>

      <aside className="flex flex-1 basis-[340px] flex-col gap-4 sm:max-w-[400px]">
        <StagePlan
          size="sm"
          className="h-[340px]"
          fixtures={fixtures}
          live={room.active}
          selectedId={selected?.id}
          onSelect={onSelect}
          onMove={(id, position) => update.mutateAsync({ id, position })}
        />
        <section className="flex flex-col gap-2.5 rounded-2xl bg-surface-1 px-4 py-3.5">
          <div className="flex justify-between text-[13px]">
            <span className="font-semibold">Address map</span>
            <span className="font-mono text-xs text-muted-foreground">
              1–{mapChannels}
              {mapChannels < UNIVERSE && ` · ${mapChannels + 1}–${UNIVERSE} free`}
            </span>
          </div>
          <UniverseMap
            fixtures={fixtures}
            selected={selected}
            overlapping={overlapping}
            columns={16}
            channels={mapChannels}
            pending={pending}
          />
          <div className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
            <Legend className="bg-off-ring">Patched</Legend>
            <Legend className="bg-foreground">Selected</Legend>
            <Legend className="border border-dashed border-muted-foreground">New</Legend>
            {overlapping.size > 0 && <Legend className="bg-warning">Overlap</Legend>}
          </div>
        </section>
      </aside>
    </div>
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
          '[&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg',
          selected && '[&>td]:bg-surface-3',
          !repeat && '[&>td]:shadow-[0_-1px_0_var(--border-subtle)]',
        )}
      >
        <td className="px-1">
          <button
            type="button"
            aria-label={`Select ${f.name}`}
            onClick={onSelect}
            className="flex size-9 items-center justify-center rounded-md"
          >
            <span
              className={cn(
                'size-3',
                f.type === 'par' ? 'rounded-full' : 'rounded',
                !color && 'shadow-[inset_0_0_0_1.5px_var(--off-ring)]',
              )}
              style={color ? { background: color, boxShadow: `0 0 8px ${color}` } : undefined}
            />
          </button>
        </td>
        <td className="px-1">
          <CommitInput
            aria-label="Name"
            className={cn(cellInput, 'font-medium')}
            value={f.name}
            onCommit={(name) => name && update.mutate({ id: f.id, name })}
          />
        </td>
        <td className="px-1">
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
        <td className="px-1">
          <CommitInput
            aria-label="Address"
            inputMode="numeric"
            className={cn(cellInput, 'w-20 font-mono', repeat && 'text-muted-foreground')}
            value={String(f.address)}
            onCommit={(text) => {
              const address = Number(text)
              if (Number.isInteger(address) && address >= 1) update.mutate({ id: f.id, address })
            }}
          />
        </td>
        <td
          className={cn(
            'px-2.5 font-mono text-xs',
            overlapping ? 'text-warning' : 'text-muted-foreground',
          )}
        >
          {rangeLabel(f)}
          {overlapping && ' · overlap'}
        </td>
        <td className="px-2.5 font-mono text-xs text-muted-foreground">
          {f.position ? `${f.position.x.toFixed(2)}, ${f.position.y.toFixed(2)}` : 'not placed'}
        </td>
        <td className="px-1">
          <div className="flex items-center justify-end gap-1.5">
            <IdentifyButton
              size="sm"
              variant="quiet"
              className="h-9 rounded-md px-3 text-xs"
              fixture={f}
              roomActive={roomActive}
            />
            <Button
              variant={confirmDelete ? 'destructive' : 'ghost'}
              size={confirmDelete ? 'sm' : 'icon-sm'}
              className="h-9 rounded-md"
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
          <td colSpan={6} className="px-2.5 pb-1 text-xs text-destructive">
            {error.message}
          </td>
        </tr>
      )}
    </>
  )
}

function AddRow({
  onPreview,
  ...props
}: ViewProps & { onPreview: (range?: [number, number]) => void }) {
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

  const preview = (range?: [number, number]) => onPreview(range)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    addFixture.add({ name: name.trim() || undefined, type, address })
    setName('')
    setAddressText('')
    preview()
  }

  return (
    <>
      <tr className="[&>td]:bg-surface-0 [&>td:first-child]:rounded-l-lg [&>td:last-child]:rounded-r-lg">
        <td className="px-2.5 py-2">
          <span className="block size-3 rounded-full border-[1.5px] border-dashed border-off-ring" />
        </td>
        <td className="px-1 py-2">
          <input
            form="add-fixture"
            aria-label="New fixture name"
            placeholder={nextName(fixtures)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={cn(
              cellInput,
              'w-full bg-surface-2 text-foreground outline-none placeholder:text-muted-foreground',
            )}
          />
        </td>
        <td className="px-1 py-2">
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
        <td className="px-1 py-2">
          <input
            form="add-fixture"
            aria-label="New fixture address"
            inputMode="numeric"
            placeholder={String(suggested)}
            value={addressText}
            onFocus={() => valid && preview([address, end])}
            onBlur={() => preview()}
            onChange={(e) => {
              setAddressText(e.target.value)
              const a = e.target.value === '' ? suggested : Number(e.target.value)
              preview(Number.isInteger(a) && a >= 1 ? [a, a + channelCount(type) - 1] : undefined)
            }}
            className={cn(
              cellInput,
              'w-20 bg-surface-2 font-mono text-foreground outline-none placeholder:text-muted-foreground',
            )}
          />
        </td>
        <td
          className={cn(
            'px-2.5 py-2 font-mono text-xs',
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
        <td className="px-2.5 py-2 text-xs text-muted-foreground">middle of the room</td>
        <td className="px-1 py-2 text-right">
          <form id="add-fixture" onSubmit={submit}>
            <Button
              type="submit"
              variant="default"
              size="sm"
              className="h-9 rounded-md"
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
          <td colSpan={6} className="px-2.5 pb-1 text-xs text-destructive">
            {addFixture.error.message}
          </td>
        </tr>
      )}
    </>
  )
}

function Legend({ className, children }: { className: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('size-2.5 rounded-[2px]', className)} />
      {children}
    </span>
  )
}
