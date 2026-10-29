import type { ServerMessage } from '@stagehand/shared'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, type ReactNode, useContext, useState } from 'react'
import { type SocketStatus, useSocket } from '@/lib/ws'

export type DmxState = Omit<Extract<ServerMessage, { type: 'dmx.state' }>, 'type'>

type Live = {
  socket: SocketStatus
  // Null until the server's first `dmx.state` arrives.
  dmx: DmxState | null
  // The fixture running the identify rainbow, if any.
  identifying: number | null
  // Sets consecutive channels from `start` (1-based) over the socket.
  setChannels: (start: number, values: number[]) => void
}

const LiveContext = createContext<Live | null>(null)

// One socket for the signed-in app: keeps the DMX output and identify state
// current, and refetches rooms and fixtures when another client changes them.
export function LiveProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [dmx, setDmx] = useState<DmxState | null>(null)
  const [identifying, setIdentifying] = useState<number | null>(null)

  const socket = useSocket((msg) => {
    switch (msg.type) {
      case 'rooms.changed':
        void queryClient.invalidateQueries({ queryKey: ['rooms'] })
        break
      case 'fixtures.changed':
        void queryClient.invalidateQueries({ queryKey: ['rooms', msg.roomId, 'fixtures'] })
        break
      case 'dmx.state': {
        const { type: _, ...state } = msg
        setDmx(state)
        break
      }
      case 'identify.changed':
        setIdentifying(msg.fixtureId)
        break
    }
  })

  const setChannels = (start: number, values: number[]) => {
    socket.send({ type: 'dmx.set', start, values })
  }

  return (
    <LiveContext value={{ socket: socket.status, dmx, identifying, setChannels }}>
      {children}
    </LiveContext>
  )
}

export function useLive() {
  const live = useContext(LiveContext)
  if (!live) throw new Error('useLive() outside <LiveProvider>')
  return live
}
