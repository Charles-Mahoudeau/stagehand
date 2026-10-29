import { existsSync } from 'node:fs'
import { defineConfig } from 'drizzle-kit'

// drizzle-kit loads this file as CommonJS, where src/env.ts can't locate the
// package (no `import.meta.dirname`), so read DATABASE_PATH directly. drizzle-kit
// runs from apps/server, which is also what relative paths in .env are against.
if (existsSync('.env')) process.loadEnvFile('.env')

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_PATH || 'data/stagehand.db' },
})
