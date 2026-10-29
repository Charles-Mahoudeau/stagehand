import { z } from '@hono/zod-openapi'

export const ErrorSchema = z
  .object({ error: z.string().openapi({ example: 'Unauthorized' }) })
  .openapi('Error')

// A response carrying `{ error }`, for route definitions.
export const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
})

export const jsonResponse = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { 'application/json': { schema } },
})
