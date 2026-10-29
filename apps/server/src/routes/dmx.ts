import { createRoute, z } from '@hono/zod-openapi'
import { DMX_CHANNELS, dmxOutput } from '../dmx'
import { createRouter } from '../lib/router'

const DmxStateSchema = z
  .object({
    connected: z
      .boolean()
      .openapi({ description: 'Whether frames are going out to the interface' }),
    port: z.string().nullable().openapi({ example: '/dev/ttyUSB0' }),
    fps: z.number().openapi({ description: 'Frames sent per second', example: 40 }),
    channels: z
      .array(z.number().int())
      .length(DMX_CHANNELS)
      .openapi({ description: 'Values of channels 1–512 (index 0 is channel 1)' }),
  })
  .openapi('DmxState')

const ChannelUpdateSchema = z
  .object({
    start: z
      .number()
      .int()
      .min(1)
      .max(DMX_CHANNELS)
      .openapi({ description: 'First channel to set (1-based)', example: 1 }),
    values: z
      .array(z.number().int().min(0).max(255))
      .min(1)
      .max(DMX_CHANNELS)
      .openapi({ description: 'Values for consecutive channels', example: [255, 128, 0] }),
  })
  .refine(({ start, values }) => start + values.length - 1 <= DMX_CHANNELS, {
    message: `Channels must stay within 1–${DMX_CHANNELS}`,
    path: ['values'],
  })
  .openapi('DmxChannelUpdate')

const getState = createRoute({
  method: 'get',
  path: '/dmx',
  tags: ['DMX'],
  summary: 'Interface status and current channel values',
  responses: {
    200: {
      description: 'Current state',
      content: { 'application/json': { schema: DmxStateSchema } },
    },
  },
})

const setChannels = createRoute({
  method: 'patch',
  path: '/dmx/channels',
  tags: ['DMX'],
  summary: 'Set consecutive channels',
  request: {
    body: { required: true, content: { 'application/json': { schema: ChannelUpdateSchema } } },
  },
  responses: { 204: { description: 'Channels updated' } },
})

const blackout = createRoute({
  method: 'post',
  path: '/dmx/blackout',
  tags: ['DMX'],
  summary: 'Set every channel to 0',
  responses: { 204: { description: 'All channels at 0' } },
})

export const dmx = createRouter()
  .openapi(getState, (c) => c.json({ ...dmxOutput.status(), channels: dmxOutput.channels() }, 200))
  .openapi(setChannels, (c) => {
    const { start, values } = c.req.valid('json')
    dmxOutput.set(start, values)
    return c.body(null, 204)
  })
  .openapi(blackout, (c) => {
    dmxOutput.blackout()
    return c.body(null, 204)
  })
