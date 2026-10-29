import { OpenAPIHono } from '@hono/zod-openapi'

// Every route module uses this so request validation errors share one shape.
export function createRouter() {
  return new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: 'Validation failed', issues: result.error.issues }, 400)
      }
    },
  })
}
