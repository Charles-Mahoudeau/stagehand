import {
  FIELDS,
  GENERATOR_INFO,
  type Params,
  type ParamsInput,
  resolveParams,
} from '@stagehand/shared'
import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'
import { Field, Section } from '@/components/shell/panel'
import type { Effect } from '@/lib/show'
import type { Target } from '@/lib/targets'
import { ColorRow, RangeRow, SegRow, SwitchRow, useThrottle, WheelRow } from './controls'

// A group of fixtures sharing an address, as the editor offers it.
export type GroupChoice = { address: number; label: string; mover: boolean }

type Props = {
  effect: Effect
  groups: GroupChoice[]
  targets: Target[]
  // Sends only the changed parameters; the server merges them.
  onChange: (patch: ParamsInput) => void
}

// The form for one effect, built from its generator's field list. Changes show on
// screen at once and reach the server as a stream, so the running output follows.
export function ParamsForm({ effect, groups, targets, onChange }: Props) {
  const info = GENERATOR_INFO[effect.generator]
  const [local, setLocal] = useState<ParamsInput>({})
  // Another effect, or a change from elsewhere, starts from the server's values.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only a change of effect resets it
  useEffect(() => setLocal({}), [effect.id])
  const params = resolveParams(effect.generator, { ...effect.params, ...local })

  // Changes gather here until the throttle sends them, so two quick edits both arrive.
  const pending = useRef<ParamsInput>({})
  const flush = useThrottle(() => {
    const patch = pending.current
    pending.current = {}
    if (Object.keys(patch).length > 0) onChange(patch)
  })
  const set = <K extends keyof Params>(key: K, value: Params[K]) => {
    setLocal((l) => ({ ...l, [key]: value }))
    pending.current = { ...pending.current, [key]: value }
    flush()
  }

  return (
    <>
      {info.sections.map(([title, keys]) => (
        <Section key={title} title={title}>
          {keys.map((key) => {
            const field = info.fields?.[key] ?? FIELDS[key]
            if (!field) return null
            const value = params[key]
            switch (field.type) {
              case 'range':
                return (
                  <RangeRow
                    key={key}
                    {...field}
                    value={value as number}
                    onChange={(v) => set(key, v as never)}
                  />
                )
              case 'color':
                return (
                  <ColorRow
                    key={key}
                    label={field.label}
                    value={value as string}
                    onChange={(v) => set(key, v as never)}
                  />
                )
              case 'wheel':
                return (
                  <WheelRow
                    key={key}
                    label={field.label}
                    value={value as string}
                    onChange={(v) => set(key, v as never)}
                  />
                )
              case 'seg':
                return (
                  <SegRow
                    key={key}
                    label={field.label}
                    value={value as string}
                    options={field.options}
                    onChange={(v) => set(key, v as never)}
                  />
                )
              case 'switch':
                return (
                  <SwitchRow
                    key={key}
                    label={field.label}
                    value={value as boolean}
                    onChange={(v) => set(key, v as never)}
                  />
                )
              case 'groups':
                return (
                  <GroupsRow
                    key={key}
                    label={field.label}
                    value={value as number[]}
                    choices={groups.filter((g) => g.mover === (info.kind === 'Moving head'))}
                    onChange={(v) => set('groups', v)}
                  />
                )
              case 'target':
                return (
                  <Field key={key} label={field.label}>
                    <select
                      aria-label={field.label}
                      value={(value as string | null) ?? ''}
                      onChange={(e) => set('target', e.target.value || null)}
                      className="h-7 min-w-0 rounded-md bg-surface-2 px-2 text-xs outline-none"
                    >
                      <option value="">Stay where they are</option>
                      {targets.map((t) => (
                        <option key={t.id} value={t.slug}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )
              default:
                return null
            }
          })}
        </Section>
      ))}
    </>
  )
}

// Chips for the groups an effect runs on. None picked means all of them.
function GroupsRow({
  label,
  value,
  choices,
  onChange,
}: {
  label: string
  value: number[]
  choices: GroupChoice[]
  onChange: (v: number[]) => void
}) {
  const all = value.length === 0
  const toggle = (address: number) =>
    onChange(value.includes(address) ? value.filter((a) => a !== address) : [...value, address])
  const chip = (on: boolean) =>
    cn(
      'h-6 rounded-[5px] px-2 text-[11px] whitespace-nowrap',
      on
        ? 'bg-primary font-semibold text-primary-foreground'
        : 'bg-surface-2 text-muted-foreground hover:text-foreground',
    )
  return (
    <Field label={label} className="items-start">
      <span className="flex flex-wrap gap-1">
        <button type="button" aria-pressed={all} className={chip(all)} onClick={() => onChange([])}>
          All
        </button>
        {choices.map((g) => (
          <button
            key={g.address}
            type="button"
            aria-pressed={value.includes(g.address)}
            title={`Address ${g.address}`}
            className={chip(value.includes(g.address))}
            onClick={() => toggle(g.address)}
          >
            {g.label}
          </button>
        ))}
      </span>
    </Field>
  )
}
