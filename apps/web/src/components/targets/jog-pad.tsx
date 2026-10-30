import {
  MAX_16,
  PAN_RANGE,
  type PanTilt,
  panDegrees,
  TILT_RANGE,
  tiltDegrees,
} from '@stagehand/shared'
import { cn } from 'cn'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Sun } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLive } from '@/lib/live'
import type { Fixture } from '@/lib/rooms'
import { DIMMER_OFFSET, livePanTilt, panTiltValues, SPEED_OFFSET } from '@/lib/targets'

// Jog steps, in 16-bit units: about 0.05° and 2° of pan.
const FINE = 6
const COARSE = 240
const REPEAT_MS = 60
// Keep showing the jogged value until the server's broadcast catches up.
const SETTLE_MS = 400

type Props = {
  head: Fixture
  roomActive: boolean
}

// Moves a head by hand: arrow buttons (hold to repeat), arrow keys, sliders,
// and a beam toggle. Sends straight over the socket.
export function JogPad({ head, roomActive }: Props) {
  const { dmx, setChannels } = useLive()
  const live = livePanTilt(head, roomActive ? dmx?.channels : null)
  const [draft, setDraft] = useState<PanTilt | null>(null)
  const [fine, setFine] = useState(true)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  const repeat = useRef<ReturnType<typeof setInterval>>(undefined)
  const shown = draft ?? live ?? { pan: 0, tilt: 0 }
  const current = useRef(shown)
  current.current = shown
  const beamOn = roomActive && (dmx?.channels[head.address - 1 + DIMMER_OFFSET] ?? 0) > 0

  const send = (next: PanTilt) => {
    const value = {
      pan: Math.min(MAX_16, Math.max(0, Math.round(next.pan))),
      tilt: Math.min(MAX_16, Math.max(0, Math.round(next.tilt))),
    }
    current.current = value
    setDraft(value)
    setChannels(head.address, panTiltValues(value))
    clearTimeout(settle.current)
    settle.current = setTimeout(() => setDraft(null), SETTLE_MS)
  }
  const jog = (pan: number, tilt: number, coarse = !fine) => {
    const step = coarse ? COARSE : FINE
    send({ pan: current.current.pan + pan * step, tilt: current.current.tilt + tilt * step })
  }
  const stopRepeat = () => clearInterval(repeat.current)
  const startRepeat = (pan: number, tilt: number) => {
    stopRepeat()
    jog(pan, tilt)
    repeat.current = setInterval(() => jog(pan, tilt), REPEAT_MS)
  }
  const toggleBeam = () => {
    // Fastest moves, full dimmer, shutter open; colour and gobo stay as they are.
    setChannels(head.address + SPEED_OFFSET, beamOn ? [0, 0, 0] : [0, 255, 0])
  }

  useEffect(
    () => () => {
      clearTimeout(settle.current)
      clearInterval(repeat.current)
    },
    [],
  )

  // Arrow keys jog while the calibrate view is open, unless typing somewhere.
  const jogRef = useRef(jog)
  jogRef.current = jog
  useEffect(() => {
    if (!roomActive) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable], [role=slider]')) return
      // Markers on the plan use the arrows to move themselves.
      if (el.closest('[data-plan-marker]')) return
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[
        e.key
      ]
      if (!d) return
      e.preventDefault()
      jogRef.current(d[0] ?? 0, d[1] ?? 0, e.shiftKey)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [roomActive])

  const arrow = (label: string, pan: number, tilt: number, Icon: typeof ChevronUp) => (
    <Button
      aria-label={label}
      size="icon-lg"
      variant="quiet"
      className="bg-surface-2 hover:bg-surface-3"
      disabled={!roomActive}
      onPointerDown={() => startRepeat(pan, tilt)}
      onPointerUp={stopRepeat}
      onPointerLeave={stopRepeat}
      onPointerCancel={stopRepeat}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          jog(pan, tilt)
        }
      }}
    >
      <Icon />
    </Button>
  )

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold">Jog {head.name}</span>
        <div className="flex gap-[3px] rounded-[10px] bg-surface-2 p-[3px] text-xs">
          {[false, true].map((f) => (
            <button
              key={String(f)}
              type="button"
              aria-pressed={fine === f}
              onClick={() => setFine(f)}
              className={cn(
                'rounded-[7px] px-2.5 py-1.5',
                fine === f ? 'bg-surface-3 text-foreground' : 'text-muted-foreground',
              )}
            >
              {f ? 'Fine' : 'Coarse'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="grid flex-none grid-cols-[repeat(3,48px)] grid-rows-[repeat(3,48px)] gap-1">
          <span />
          {arrow('Tilt up', 0, 1, ChevronUp)}
          <span />
          {arrow('Pan left', -1, 0, ChevronLeft)}
          <Button
            aria-label={beamOn ? 'Beam off' : 'Beam on'}
            aria-pressed={beamOn}
            size="icon-lg"
            variant={beamOn ? 'default' : 'quiet'}
            className={cn(!beamOn && 'bg-surface-2 text-muted-foreground hover:bg-surface-3')}
            disabled={!roomActive}
            onClick={toggleBeam}
          >
            <Sun />
          </Button>
          {arrow('Pan right', 1, 0, ChevronRight)}
          <span />
          {arrow('Tilt down', 0, -1, ChevronDown)}
          <span />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5 font-mono">
          <Readout label="Pan" degrees={panDegrees(shown.pan)} value={shown.pan} />
          <Readout label="Tilt" degrees={tiltDegrees(shown.tilt)} value={shown.tilt} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Slider
          id="jog-pan"
          label="Pan"
          range={`0–${PAN_RANGE}°`}
          value={shown.pan}
          disabled={!roomActive}
          onChange={(pan) => send({ ...current.current, pan })}
        />
        <Slider
          id="jog-tilt"
          label="Tilt"
          range={`0–${TILT_RANGE}°`}
          value={shown.tilt}
          disabled={!roomActive}
          onChange={(tilt) => send({ ...current.current, tilt })}
        />
      </div>
      <span className="text-xs text-muted-foreground">
        {roomActive
          ? `Arrow keys jog · Shift for coarse · step ${fine ? '0.05°' : '2°'}`
          : 'Make this room active to move the head'}
      </span>
    </div>
  )
}

function Readout({ label, degrees, value }: { label: string; degrees: number; value: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-xs text-muted-foreground">{label}</span>
      <span className="text-lg">{degrees.toFixed(1)}°</span>
      <span className="text-[11px] text-muted-foreground">
        {value} / {MAX_16}
      </span>
    </div>
  )
}

function Slider(props: {
  id: string
  label: string
  range: string
  value: number
  disabled: boolean
  onChange: (v: number) => void
}) {
  return (
    <>
      <label htmlFor={props.id} className="flex justify-between text-xs text-muted-foreground">
        <span>{props.label}</span>
        <span className="font-mono">{props.range}</span>
      </label>
      <input
        id={props.id}
        type="range"
        min={0}
        max={MAX_16}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
        className="fader"
        style={
          {
            '--fill': `${(props.value / MAX_16) * 100}%`,
            '--tint': 'var(--text)',
          } as React.CSSProperties
        }
      />
    </>
  )
}
