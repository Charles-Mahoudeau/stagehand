import { z } from '@hono/zod-openapi'
import { Slug } from '@stagehand/shared'

export const ErrorSchema = z
  .object({ error: z.string().openapi({ example: 'Unauthorized' }) })
  .openapi('Error')

// A response carrying `{ error }`, for route definitions.
export const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: ErrorSchema } },
})

// A slug in the path, e.g. `roomId`.
export const idParam = (name: string, example: string) =>
  Slug.openapi({ param: { name, in: 'path' }, example })

// An id in a body or response; `id` is optional on create.
export const idSchema = (example: string) => Slug.openapi({ example })

export const jsonResponse = <T extends z.ZodType>(description: string, schema: T) => ({
  description,
  content: { 'application/json': { schema } },
})
