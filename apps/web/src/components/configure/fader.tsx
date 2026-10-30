import { useEffect, useRef, useState } from 'react'

type Props = {
  label: string
  // The live value from the server.
  value: number
  onChange: (value: number) => void
  // Color of the fill, as a CSS color.
  tint: string
  disabled?: boolean
  // The 20px fader used in editor panels.
  compact?: boolean
}

// How long to keep showing the local value after the last change, so a
// broadcast sent before the server applied it doesn't make the fader jump back.
const SETTLE_MS = 300

// Horizontal 0–255 fader. Shows its own value while being moved, then the
// server's again.
export function Fader({ label, value, onChange, tint, disabled, compact }: Props) {
  const [draft, setDraft] = useState<number | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(settle.current), [])
  const shown = draft ?? value

  return (
    <input
      type="range"
      min={0}
      max={255}
      aria-label={label}
      disabled={disabled}
      value={shown}
      className={compact ? 'fader fader-sm' : 'fader'}
      style={{ '--fill': `${(shown / 255) * 100}%`, '--tint': tint } as React.CSSProperties}
      onChange={(e) => {
        const v = Number(e.target.value)
        setDraft(v)
        onChange(v)
        clearTimeout(settle.current)
        settle.current = setTimeout(() => setDraft(null), SETTLE_MS)
      }}
    />
  )
}
