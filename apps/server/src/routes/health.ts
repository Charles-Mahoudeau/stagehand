import { createRoute, z } from '@hono/zod-openapi'
import pkg from '../../package.json' with { type: 'json' }
import { createRouter } from '../lib/router'

const HealthSchema = z
  .object({
    status: z.literal('ok'),
    version: z.string().openapi({ example: '0.0.0' }),
    uptime: z.number().openapi({ description: 'Process uptime in seconds' }),
  })
  .openapi('Health')

const getHealth = createRoute({
  method: 'get',
  path: '/health',
  tags: ['System'],
  summary: 'Health check',
  security: [],
  responses: {
    200: { description: 'Server is up', content: { 'application/json': { schema: HealthSchema } } },
  },
})

export const health = createRouter().openapi(getHealth, (c) =>
  c.json({ status: 'ok' as const, version: pkg.version, uptime: process.uptime() }, 200),
)
