import { upgradeWebSocket } from '@hono/node-server'
import { ClientMessage, type ServerMessage } from '@stagehand/shared'
import type { WSContext } from 'hono/ws'
import pkg from '../package.json' with { type: 'json' }

const encode = (msg: ServerMessage) => JSON.stringify(msg)

const clients = new Set<WSContext>()

// Sends to every connected client.
export function broadcast(msg: ServerMessage) {
  const data = encode(msg)
  for (const ws of clients) ws.send(data)
}

export const wsHandler = upgradeWebSocket(() => ({
  onOpen(_event, ws) {
    clients.add(ws)
    ws.send(encode({ type: 'hello', version: pkg.version }))
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
    }
  },
}))
