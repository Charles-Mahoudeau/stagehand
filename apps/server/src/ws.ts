import { upgradeWebSocket } from '@hono/node-server'
import { ClientMessage, type ServerMessage } from '@stagehand/shared'
import type { WSContext } from 'hono/ws'
import pkg from '../package.json' with { type: 'json' }
import { DMX_CHANNELS, dmxOutput } from './dmx'
import { identify } from './identify'
import { playback } from './playback'

const encode = (msg: ServerMessage) => JSON.stringify(msg)

const clients = new Set<WSContext>()

// Sends to every connected client.
export function broadcast(msg: ServerMessage) {
  const data = encode(msg)
  for (const ws of clients) ws.send(data)
}

const dmxState = () => ({
  type: 'dmx.state' as const,
  ...dmxOutput.status(),
  channels: dmxOutput.channels(),
})

const DMX_POLL_MS = 100
const DMX_HEARTBEAT_MS = 1000

// Pushes the output to clients when channels change, and once a second for
// the status (connection, fps) even when nothing moves.
export function startDmxBroadcast() {
  let last = ''
  let lastSent = 0
  return setInterval(() => {
    if (clients.size === 0) return
    const msg = dmxState()
    const channels = msg.channels.join()
    const now = performance.now()
    if (channels === last && now - lastSent < DMX_HEARTBEAT_MS) return
    last = channels
    lastSent = now
    broadcast(msg)
  }, DMX_POLL_MS)
}

export const wsHandler = upgradeWebSocket(() => ({
  onOpen(_event, ws) {
    clients.add(ws)
    ws.send(encode({ type: 'hello', version: pkg.version }))
    ws.send(encode(dmxState()))
    ws.send(encode({ type: 'identify.changed', fixtureId: identify.fixtureId() }))
    ws.send(encode({ type: 'playback.state', state: playback.state() }))
  },
  onClose(_event, ws) {
    clients.delete(ws)
  },
  onMessage(event, ws) {
    let parsed: ReturnType<typeof ClientMessage.safeParse>
    try {
      parsed = ClientMessage.safeParse(JSON.parse(String(event.data)))
    } catch {
      return
    }
    if (!parsed.success) return

    switch (parsed.data.type) {
      case 'ping':
        ws.send(encode({ type: 'pong', t: parsed.data.t }))
        break
      case 'dmx.set': {
        const { start, values } = parsed.data
        if (start + values.length - 1 <= DMX_CHANNELS) dmxOutput.set(start, values)
        break
      }
    }
  },
}))
