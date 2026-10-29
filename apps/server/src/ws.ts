import { upgradeWebSocket } from '@hono/node-server'
import { ClientMessage, type ServerMessage } from '@stagehand/shared'
import pkg from '../package.json' with { type: 'json' }

const encode = (msg: ServerMessage) => JSON.stringify(msg)

export const wsHandler = upgradeWebSocket(() => ({
  onOpen(_event, ws) {
    ws.send(encode({ type: 'hello', version: pkg.version }))
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
