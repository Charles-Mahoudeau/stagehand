import { setTimeout as sleep } from 'node:timers/promises'
import { autoDetect } from '@serialport/bindings-cpp'
import { env } from './env'

export const DMX_CHANNELS = 512

// DMX512 line format: 250 kbaud, 8 data bits, no parity, 2 stop bits.
const LINE = { baudRate: 250_000, dataBits: 8, stopBits: 2, parity: 'none' } as const
// Aim for 40 Hz; a full 512-slot frame takes ~23 ms on the wire, so ~44 Hz is
// the ceiling. The FT232R reaches ~24 Hz in practice, as toggling the break
// costs several USB control transfers per frame.
const FRAME_INTERVAL_MS = 25
const RECONNECT_INTERVAL_MS = 2000
const FTDI_VENDOR_ID = '0403'

// `set()` rewrites the modem lines on every call, so keep RTS/DTR as `open()` left them.
const BREAK_ON = { brk: true, rts: true, dtr: true }
const BREAK_OFF = { brk: false, rts: true, dtr: true }

// The package's own types don't resolve under `moduleResolution: bundler` (the
// exports map of @serialport/bindings-interface has no `types` entry), so
// describe the parts used here.
type Port = {
  set(flags: typeof BREAK_ON): Promise<void>
  write(buffer: Buffer): Promise<void>
  drain(): Promise<void>
  close(): Promise<void>
}
type SerialBinding = {
  list(): Promise<{ path: string; vendorId?: string }[]>
  open(options: typeof LINE & { path: string }): Promise<Port>
}

const Binding: SerialBinding = autoDetect()

export type DmxStatus = { connected: boolean; port: string | null; fps: number }

// Drives one DMX universe through a USB→RS485 adapter. Frames are sent
// continuously (fixtures expect a steady stream), and the adapter is reopened
// whenever it is unplugged or not yet present.
class DmxOutput {
  // Slot 0 is the start code (0 = dimmer data); slots 1–512 are the channels.
  private readonly frame = Buffer.alloc(1 + DMX_CHANNELS)
  private path: string | null = null
  private connected = false
  private fps = 0
  private abort: AbortController | null = null
  private loop: Promise<void> | null = null
  private lastError = ''

  // Pinned port path, or undefined to use the first FTDI adapter found.
  constructor(private readonly configuredPath: string | undefined) {}

  start() {
    if (this.loop) return
    this.abort = new AbortController()
    this.loop = this.run(this.abort.signal)
  }

  async stop() {
    this.abort?.abort()
    await this.loop
    this.loop = null
  }

  status(): DmxStatus {
    return { connected: this.connected, port: this.path, fps: this.fps }
  }

  // Channel values 1–512, as an array indexed from 0.
  channels(): number[] {
    return Array.from(this.frame.subarray(1))
  }

  // Sets consecutive channels starting at `start` (1-based). Values are
  // clamped to 0–255 and go out with the next frame.
  set(start: number, values: ArrayLike<number>) {
    if (!Number.isInteger(start) || start < 1 || start + values.length - 1 > DMX_CHANNELS) {
      throw new RangeError(`Channels ${start}–${start + values.length - 1} outside 1–512`)
    }
    for (let i = 0; i < values.length; i++) {
      this.frame[start + i] = Math.min(255, Math.max(0, Math.round(values[i] ?? 0)))
    }
  }

  blackout() {
    this.frame.fill(0, 1)
  }

  private async run(signal: AbortSignal) {
    while (!signal.aborted) {
      const port = await this.open()
      if (port) {
        try {
          await this.transmit(port, signal)
        } catch (err) {
          this.logError(`DMX: lost ${this.path}: ${errorMessage(err)}`)
        }
        this.connected = false
        this.fps = 0
        await port.close().catch(() => {})
      }
      if (!signal.aborted) await sleep(RECONNECT_INTERVAL_MS, undefined, { signal }).catch(() => {})
    }
  }

  private async open(): Promise<Port | null> {
    this.path = this.configuredPath ?? (await findAdapter())
    if (!this.path) {
      this.logError('DMX: no FTDI adapter found, set DMX_PORT to pick a port')
      return null
    }
    try {
      return await Binding.open({ path: this.path, ...LINE })
    } catch (err) {
      this.logError(`DMX: cannot open ${this.path}: ${errorMessage(err)}`)
      return null
    }
  }

  private async transmit(port: Port, signal: AbortSignal) {
    // Each frame goes out from a snapshot, so updates landing mid-write can't tear it.
    const tx = Buffer.alloc(this.frame.length)
    let next = performance.now()
    let frames = 0
    let windowStart = next

    while (!signal.aborted) {
      this.frame.copy(tx)
      // Break: hold the line low for ≥ 88 µs. Releasing it gives the
      // mark-after-break (≥ 8 µs) before the start code goes out.
      await port.set(BREAK_ON)
      await sleep(1)
      await port.set(BREAK_OFF)
      await port.write(tx)
      // Wait for the UART to empty, or the next break would cut this frame short.
      await port.drain()

      if (!this.connected) {
        this.connected = true
        this.lastError = ''
        console.log(`DMX: sending on ${this.path}`)
      }
      const now = performance.now()
      frames++
      if (now - windowStart >= 1000) {
        this.fps = Math.round((frames * 1000) / (now - windowStart))
        frames = 0
        windowStart = now
      }

      next += FRAME_INTERVAL_MS
      // If we fell behind, carry on from now rather than bursting to catch up.
      if (next > now) await sleep(next - now)
      else next = now
    }
  }

  // Skips repeats, so a failure that persists across reconnect attempts is logged once.
  private logError(message: string) {
    if (message === this.lastError) return
    this.lastError = message
    console.error(message)
  }
}

async function findAdapter(): Promise<string | null> {
  const ports = await Binding.list()
  return ports.find((p) => p.vendorId?.toLowerCase() === FTDI_VENDOR_ID)?.path ?? null
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err)
}

export const dmxOutput = new DmxOutput(env.DMX_PORT)
