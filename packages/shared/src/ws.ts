import { z } from 'zod'

// Messages sent over the /ws socket. Both sides validate with these schemas.

export const ServerMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('hello'), version: z.string() }),
  z.object({ type: z.literal('pong'), t: z.number() }),
  // Something was created, renamed, deleted or activated; clients refetch.
  z.object({ type: z.literal('rooms.changed') }),
  z.object({ type: z.literal('fixtures.changed'), roomId: z.number() }),
  // Output status and channels 1–512 (index 0 is channel 1). Sent on connect,
  // whenever channels change (at most 10 times a second) and once a second.
  z.object({
    type: z.literal('dmx.state'),
    connected: z.boolean(),
    port: z.string().nullable(),
    fps: z.number(),
    channels: z.array(z.number()),
  }),
  // The fixture whose address is running the identify rainbow, if any.
  z.object({ type: z.literal('identify.changed'), fixtureId: z.number().nullable() }),
])
export type ServerMessage = z.infer<typeof ServerMessage>

export const ClientMessage = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ping'), t: z.number() }),
  // Sets consecutive channels from `start` (1-based); for faders, which send
  // too often for a request each.
  z.object({
    type: z.literal('dmx.set'),
    start: z.number().int().min(1).max(512),
    values: z.array(z.number().int().min(0).max(255)).min(1).max(512),
  }),
])
export type ClientMessage = z.infer<typeof ClientMessage>
