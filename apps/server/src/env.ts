import { existsSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { serverRoot } from './paths'

const envFile = path.join(serverRoot, '.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const Env = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(3000),
  STAGEHAND_TOKEN: z.string().min(8, 'STAGEHAND_TOKEN must be at least 8 characters'),
  DATABASE_PATH: z
    .string()
    .default('data/stagehand.db')
    .transform((p) => path.resolve(serverRoot, p)),
  DMX_PORT: z
    .string()
    .optional()
    .transform((p) => p || undefined),
})

const parsed = Env.safeParse(process.env)
if (!parsed.success) {
  console.error(`Invalid environment:\n${z.prettifyError(parsed.error)}`)
  process.exit(1)
}

export const env = parsed.data
