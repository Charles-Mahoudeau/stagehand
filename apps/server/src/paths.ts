import path from 'node:path'

// This file sits one level below the package root both as source (src/) and
// once bundled (dist/), so the same relative path works in dev and prod.
export const serverRoot = path.resolve(import.meta.dirname, '..')

export const migrationsDir = path.join(serverRoot, 'drizzle')
export const webDistDir = path.join(serverRoot, '../web/dist')
