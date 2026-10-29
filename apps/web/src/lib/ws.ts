import { type ClientMessage, ServerMessage } from '@stagehand/shared'
import { useEffect, useRef, useState } from 'react'

export type SocketStatus = 'connecting' | 'open' | 'closed'

const RECONNECT_MS = 1000

// Connects to /ws (the session cookie authenticates the handshake) and
// reconnects automatically. `onMessage` receives validated server messages.
export function useSocket(onMessage?: (msg: ServerMessage) => void) {
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const socketRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  useEffect(() => {
    let disposed = false
    let retry: ReturnType<typeof setTimeout> | undefined

    const connect = () => {
      const url = new URL('/ws', window.location.href)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      const socket = new WebSocket(url)
      socketRef.current = socket
      setStatus('connecting')

      socket.onopen = () => setStatus('open')
      socket.onmessage = (event) => {
        const parsed = ServerMessage.safeParse(JSON.parse(event.data))
        if (parsed.success) onMessageRef.current?.(parsed.data)
      }
      socket.onclose = () => {
        setStatus('closed')
        if (!disposed) retry = setTimeout(connect, RECONNECT_MS)
      }
    }

    connect()
    return () => {
      disposed = true
      clearTimeout(retry)
      socketRef.current?.close()
    }
  }, [])

  const send = (msg: ClientMessage) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(msg))
    }
  }

  return { status, send }
}
