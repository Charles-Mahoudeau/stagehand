// Drizzle table definitions. After editing, run `pnpm db:generate` to create a
// migration; migrations are applied automatically on server start.
import { FIXTURE_TYPES } from '@stagehand/shared'
import { sql } from 'drizzle-orm'
import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

// A room's lighting rig. Any number can be stored as templates; the server
// drives one at a time, the active one.
export const rooms = sqliteTable(
  'rooms',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [
    uniqueIndex('rooms_name_unique').on(sql`lower(${t.name})`),
    uniqueIndex('rooms_single_active').on(t.active).where(sql`${t.active} = 1`),
  ],
)

// A patched fixture. Addresses may overlap: several fixtures wired to the
// same address are driven together but keep their own name and position.
export const fixtures = sqliteTable(
  'fixtures',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: FIXTURE_TYPES }).notNull(),
    address: integer('address').notNull(),
    // Fractions of the room's width (0 = left wall) and depth (0 = stage side).
    x: real('x'),
    y: real('y'),
  },
  (t) => [
    uniqueIndex('fixtures_room_name_unique').on(t.roomId, sql`lower(${t.name})`),
    index('fixtures_room_address').on(t.roomId, t.address),
  ],
)
