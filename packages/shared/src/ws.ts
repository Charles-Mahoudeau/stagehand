import { z } from 'zod'

// Messages sent over the /ws socket. Both sides validate with these schemas.

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), version: z.string() }),
  z.object({ type: z.literal('pong'), t: z.number() }),
  // Something was created, renamed, deleted or activated; clients refetch.
  z.object({ type: z.literal('rooms.changed') }),
  z.object({ type: z.literal('fixtures.changed'), roomId: z.number() }),
])
export type ServerMessage = z.infer<typeof ServerMessage>

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), t: z.number() }),
])
export type ClientMessage = z.infer<typeof ClientMessage>
