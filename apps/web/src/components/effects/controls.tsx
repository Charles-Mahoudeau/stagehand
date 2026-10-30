import { type Field as FieldDef, WHEEL_COLORS } from '@stagehand/shared'
import { cn } from 'cn'
import { useEffect, useRef } from 'react'
import { Field } from '@/components/shell/panel'

// Small inspector controls shared by the effect and scene editors.

type Format = Extract<FieldDef, { type: 'range' }>['format']

export function formatValue(format: Format, v: number) {
  switch (format) {
    case 'pct':
      return `${Math.round(v * 100)}%`
    case 'x':
      return `${v.toFixed(2)}×`
    case 's':
      return `${v.toFixed(v < 10 ? 1 : 0)} s`
    case 'bpm':
      return `${Math.round(v)} bpm`
    case 'hz':
      return `${v.toFixed(2)} Hz`
    case 'max':
      return v >= 1 ? 'MAX' : `${v.toFixed(2)}×`
    case 'deg':
      return `${Math.round(v)}°`
    default:
      return v.toFixed(2)
  }
}

type RangeProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: Format
  onChange: (v: number) => void
}

export function RangeRow({ label, value, min, max, step, format, onChange }: RangeProps) {
  const fill = ((value - min) / (max - min || 1)) * 100
  return (
    <Field label={label}>
      <span className="flex items-center gap-2">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          className="fader fader-sm min-w-0 flex-1"
          style={{ '--fill': `${fill}%`, '--tint': 'var(--text)' } as React.CSSProperties}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <span className="w-14 shrink-0 text-right font-mono text-[11px]">
          {formatValue(format, value)}
        </span>
      </span>
    </Field>
  )
}

export function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <Field label={label}>
      <span className="flex items-center gap-2">
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-6 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
        />
        <span className="font-mono text-[11px] text-muted-foreground">{value}</span>
      </span>
    </Field>
  )
}

// A choice among the moving heads' fixed wheel colors.
export function WheelRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  // A color saved before the wheel picker shows the closest slot as chosen.
  const chosen = WHEEL_COLORS.find((c) => c.hex === value.toLowerCase())
  return (
    <Field label={label}>
      <span className="flex flex-wrap items-center gap-1.5">
        {WHEEL_COLORS.map((c) => (
          <button
            key={c.hex}
            type="button"
            aria-pressed={chosen?.hex === c.hex}
            aria-label={c.name}
            title={c.name}
            onClick={() => onChange(c.hex)}
            style={{ backgroundColor: c.hex }}
            className={cn(
              'size-5 rounded-full outline-none ring-offset-1 ring-offset-background',
              chosen?.hex === c.hex ? 'ring-2 ring-foreground' : 'ring-1 ring-border',
            )}
          />
        ))}
      </span>
    </Field>
  )
}

export function SegRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <Field label={label}>
      <span className="flex flex-wrap gap-[3px] rounded-md bg-surface-2 p-[2px]">
        {options.map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={value === key}
            onClick={() => onChange(key)}
            className={cn(
              'h-6 flex-1 rounded-[5px] px-2 text-[11px] whitespace-nowrap',
              value === key
                ? 'bg-primary font-semibold text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {text}
          </button>
        ))}
      </span>
    </Field>
  )
}

export function SwitchRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Field label={label}>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={cn(
          'flex h-5 w-9 items-center rounded-full p-[2px] transition-colors',
          value ? 'bg-primary' : 'bg-surface-3',
        )}
      >
        <span
          className={cn(
            'size-4 rounded-full transition-transform',
            value ? 'translate-x-4 bg-primary-foreground' : 'bg-muted-foreground',
          )}
        />
      </button>
    </Field>
  )
}

// A number committed on blur or Enter, for values typed rather than dragged.
export function NumberCell({
  value,
  onCommit,
  step = 0.01,
  min,
  max,
  label,
}: {
  value: number
  onCommit: (v: number) => void
  step?: number
  min?: number
  max?: number
  label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current && document.activeElement !== ref.current) ref.current.value = String(value)
  }, [value])
  const commit = () => {
    const n = Number(ref.current?.value)
    if (Number.isFinite(n) && n !== value) onCommit(Math.min(max ?? n, Math.max(min ?? n, n)))
    else if (ref.current) ref.current.value = String(value)
  }
  return (
    <input
      ref={ref}
      type="number"
      aria-label={label}
      defaultValue={value}
      step={step}
      min={min}
      max={max}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="h-6 w-full min-w-0 rounded bg-surface-2 px-1.5 text-right font-mono text-[11px] outline-none focus-visible:outline-2 focus-visible:outline-ring"
    />
  )
}

// Calls `send` with the latest value at most every `ms` while it keeps changing,
// and once more when it stops, so a dragged slider edits the output live without
// a request per pixel.
export function useThrottle<A extends unknown[]>(send: (...args: A) => void, ms = 70) {
  const last = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const pending = useRef<A | null>(null)
  const fn = useRef(send)
  fn.current = send
  useEffect(() => () => clearTimeout(timer.current), [])

  return (...args: A) => {
    pending.current = args
    const wait = last.current + ms - performance.now()
    const flush = () => {
      last.current = performance.now()
      const a = pending.current
      pending.current = null
      if (a) fn.current(...a)
    }
    clearTimeout(timer.current)
    if (wait <= 0) flush()
    else timer.current = setTimeout(flush, wait)
  }
}
