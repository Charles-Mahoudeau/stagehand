import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { slugify } from '@stagehand/shared'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { env } from '../env'
import { migrationsDir } from '../paths'
import * as schema from './schema'

mkdirSync(path.dirname(env.DATABASE_PATH), { recursive: true })

export const sqlite = new Database(env.DATABASE_PATH)
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

// Used by the migration that turned integer ids into slugs.
sqlite.function(
  'slugify',
  { deterministic: true },
  (text, fallback) => slugify(String(text), 36) || String(fallback),
)

export const db = drizzle({ client: sqlite, schema })

export function runMigrations() {
  // No journal until the first `pnpm db:generate`.
  if (!existsSync(path.join(migrationsDir, 'meta/_journal.json'))) return
  migrate(db, { migrationsFolder: migrationsDir })
}
