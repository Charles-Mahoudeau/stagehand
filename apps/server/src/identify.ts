import { channelCount, type FixtureType } from '@stagehand/shared'
import { dmxOutput } from './dmx'
import { broadcast } from './ws'

const TICK_MS = 25
// One full trip round the hue circle.
const RAINBOW_PERIOD_MS = 2000
// Moving heads: color-wheel step and a pan/tilt circle.
const WHEEL_STEP_MS = 400
// Evenly spaced guesses at the wheel's slots; the exact values aren't documented.
const WHEEL_SLOTS = [0, 16, 32, 48, 64, 80, 96, 112]
const WIGGLE_PERIOD_MS = 1000
const WIGGLE_AMPLITUDE = 6

export type IdentifyTarget = { id: number; type: FixtureType; address: number }

// Runs a rainbow on one fixture's channels so it can be found in the room.
// Every fixture sharing the address lights too, since they get the same data.
// The channels' previous values come back when it stops.
class Identify {
  private target: IdentifyTarget | null = null
  private saved: number[] = []
  private timer: ReturnType<typeof setInterval> | null = null
  private startedAt = 0

  fixtureId() {
    return this.target?.id ?? null
  }

  start(target: IdentifyTarget) {
    this.stop()
    this.target = target
    this.saved = dmxOutput
      .channels()
      .slice(target.address - 1, target.address - 1 + channelCount(target.type))
    this.startedAt = performance.now()
    this.timer = setInterval(() => this.tick(), TICK_MS)
    this.tick()
    broadcast({ type: 'identify.changed', fixtureId: target.id })
  }

  // `restore: false` leaves the channels as they are, for callers that are
  // about to overwrite them anyway (blackout, switching rooms).
  stop({ restore = true } = {}) {
    if (!this.target) return
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    if (restore) dmxOutput.set(this.target.address, this.saved)
    this.target = null
    broadcast({ type: 'identify.changed', fixtureId: null })
  }

  // Stops if `fixtureId` is the one identifying, before it is changed or removed.
  stopFor(fixtureId: number) {
    if (this.target?.id === fixtureId) this.stop()
  }

  private tick() {
    if (!this.target) return
    const t = performance.now() - this.startedAt
    const { type, address } = this.target
    if (type === 'par') {
      const [r, g, b] = hueToRgb((t % RAINBOW_PERIOD_MS) / RAINBOW_PERIOD_MS)
      dmxOutput.set(address, [r, g, b, 0])
    } else {
      // Circle round the saved pan/tilt, kept off the end stops so it moves both ways.
      const clampCenter = (v: number) =>
        Math.min(255 - WIGGLE_AMPLITUDE, Math.max(WIGGLE_AMPLITUDE, v))
      const pan = clampCenter(this.saved[0] ?? 0)
      const tilt = clampCenter(this.saved[2] ?? 0)
      const angle = (2 * Math.PI * t) / WIGGLE_PERIOD_MS
      const panOffset = Math.round(Math.sin(angle) * WIGGLE_AMPLITUDE)
      const tiltOffset = Math.round(Math.cos(angle) * WIGGLE_AMPLITUDE)
      const slot = WHEEL_SLOTS[Math.floor(t / WHEEL_STEP_MS) % WHEEL_SLOTS.length] ?? 0
      // Keep the saved fine channels; speed 0 so the circle is visible.
      dmxOutput.set(address, [
        pan + panOffset,
        this.saved[1] ?? 0,
        tilt + tiltOffset,
        this.saved[3] ?? 0,
        0, // speed: fastest
        255, // dimmer
        0, // shutter open
        slot,
        0, // gobo: open
        0, // prism off
        0, // no demo mode
      ])
    }
  }
}

// Fully saturated color for hue h in [0, 1).
function hueToRgb(h: number): [number, number, number] {
  const channel = (n: number) => {
    const k = (n + h * 6) % 6
    return Math.round(255 * (1 - Math.max(0, Math.min(k, 4 - k, 1))))
  }
  return [channel(5), channel(3), channel(1)]
}

export const identify = new Identify()
