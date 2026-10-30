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

// A tap nudges by about 0.05° of pan, in 16-bit units.
const NUDGE = 6
// Holding waits a beat, then speeds up from CREEP to TOP degrees per second,
// so a long hold crosses the room and a short one stays precise.
const HOLD_DELAY_S = 0.25
const RAMP_S = 1.5
const CREEP = 2
const TOP = 60
// Shift holds the speed down for the last degree of aim.
const PRECISE = 1
const SEND_MS = 33
// Keep showing the jogged value until the server's broadcast catches up.
const SETTLE_MS = 400

type Props = {
  head: Fixture
  roomActive: boolean
}

// Moves a head by hand: arrow buttons (hold to repeat), arrow keys, sliders,
// and a beam toggle. Sends straight over the socket. Up lowers the tilt value:
// heads hang from the ceiling, so the beam then travels up the way the arrow does.
export function JogPad({ head, roomActive }: Props) {
  const { dmx, setChannels } = useLive()
  const live = livePanTilt(head, roomActive ? dmx?.channels : null)
  const [draft, setDraft] = useState<PanTilt | null>(null)
  const settle = useRef<ReturnType<typeof setTimeout>>(undefined)
  // Directions currently held, by source (a key or a button), and the motion they drive.
  const held = useRef(new Map<string, readonly [number, number]>())
  const frame = useRef<number>(undefined)
  const motion = useRef({ start: 0, last: 0, sent: 0, pan: 0, tilt: 0 })
  const shift = useRef(false)
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
  const nudge = (pan: number, tilt: number) =>
    send({ pan: current.current.pan + pan * NUDGE, tilt: current.current.tilt + tilt * NUDGE })
  const tick = (now: number) => {
    const m = motion.current
    const dt = (now - m.last) / 1000
    m.last = now
    let dx = 0
    let dy = 0
    for (const [x, y] of held.current.values()) {
      dx += x
      dy += y
    }
    const held_s = (now - m.start) / 1000 - HOLD_DELAY_S
    const ramp = Math.min(1, Math.max(0, held_s / RAMP_S)) ** 2
    const speed = held_s < 0 ? 0 : shift.current ? PRECISE : CREEP + (TOP - CREEP) * ramp
    m.pan += Math.sign(dx) * speed * dt * (MAX_16 / PAN_RANGE)
    m.tilt += Math.sign(dy) * speed * dt * (MAX_16 / TILT_RANGE)
    if (now - m.sent >= SEND_MS && speed > 0) {
      m.sent = now
      send({ pan: m.pan, tilt: m.tilt })
    }
    frame.current = requestAnimationFrame(tick)
  }
  const press = (id: string, pan: number, tilt: number) => {
    held.current.set(id, [pan, tilt])
    if (frame.current !== undefined) return
    const now = performance.now()
    nudge(pan, tilt)
    motion.current = { start: now, last: now, sent: now, ...current.current }
    frame.current = requestAnimationFrame(tick)
  }
  const release = (id: string) => {
    held.current.delete(id)
    if (held.current.size > 0 || frame.current === undefined) return
    cancelAnimationFrame(frame.current)
    frame.current = undefined
    // Land exactly where the hold ended.
    send({ pan: motion.current.pan, tilt: motion.current.tilt })
  }
  const releaseAll = () => {
    for (const id of [...held.current.keys()]) release(id)
  }
  const toggleBeam = () => {
    // Fastest moves, full dimmer, shutter open; color and gobo stay as they are.
    setChannels(head.address + SPEED_OFFSET, beamOn ? [0, 0, 0] : [0, 255, 0])
  }

  useEffect(
    () => () => {
      clearTimeout(settle.current)
      if (frame.current !== undefined) cancelAnimationFrame(frame.current)
    },
    [],
  )

  // Arrow keys move the head while the calibrate view is open, unless typing somewhere.
  // Hold for speed, Shift for precision; two arrows together move diagonally.
  const pressRef = useRef(press)
  pressRef.current = press
  const releaseRef = useRef(release)
  releaseRef.current = release
  const releaseAllRef = useRef(releaseAll)
  releaseAllRef.current = releaseAll
  useEffect(() => {
    if (!roomActive) return
    const dirs: Record<string, readonly [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }
    const onKeyDown = (e: KeyboardEvent) => {
      shift.current = e.shiftKey
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable], [role=slider]')) return
      // Markers on the plan use the arrows to move themselves.
      if (el.closest('[data-plan-marker]')) return
      const d = dirs[e.key]
      if (!d) return
      e.preventDefault()
      if (!e.repeat) pressRef.current(e.key, d[0], d[1])
    }
    const onKeyUp = (e: KeyboardEvent) => {
      shift.current = e.shiftKey
      if (dirs[e.key]) releaseRef.current(e.key)
    }
    const onBlur = () => releaseAllRef.current()
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      releaseAllRef.current()
    }
  }, [roomActive])

  const arrow = (label: string, pan: number, tilt: number, Icon: typeof ChevronUp) => (
    <Button
      aria-label={label}
      size="icon-lg"
      variant="quiet"
      className="bg-surface-2 hover:bg-surface-3"
      disabled={!roomActive}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        shift.current = e.shiftKey
        press(label, pan, tilt)
      }}
      onPointerUp={() => release(label)}
      onPointerCancel={() => release(label)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          nudge(pan, tilt)
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
      </div>

      <div className="flex items-center gap-4">
        <div className="grid flex-none grid-cols-[repeat(3,48px)] grid-rows-[repeat(3,48px)] gap-1">
          <span />
          {arrow('Tilt up', 0, -1, ChevronUp)}
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
          {arrow('Tilt down', 0, 1, ChevronDown)}
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
          ? 'Hold an arrow key to speed up · Shift to go slow · tap to nudge'
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
