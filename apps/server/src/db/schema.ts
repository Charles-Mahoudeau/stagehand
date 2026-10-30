// Drizzle table definitions. After editing, run `pnpm db:generate` to create a
// migration; migrations are applied automatically on server start.
import { FIXTURE_TYPES } from '@stagehand/shared'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core'

// A room's lighting rig. Any number can be stored as templates; the server
// drives one at a time, the active one.
export const rooms = sqliteTable(
  'rooms',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(),
    active: integer('active', { mode: 'boolean' }).notNull().default(false),
    // Floor size in meters; with fixture heights it lets aim be worked out in 3D.
    width: real('width'),
    depth: real('depth'),
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
    // Meters above the floor; moving heads hang from the ceiling.
    height: real('height'),
  },
  (t) => [
    uniqueIndex('fixtures_room_name_unique').on(t.roomId, sql`lower(${t.name})`),
    index('fixtures_room_address').on(t.roomId, t.address),
  ],
)

// A named place moving heads can be sent to ("DJ booth"). It is shared by all
// the room's heads; where each one points for it is in `targetPositions`.
export const targets = sqliteTable(
  'targets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    roomId: integer('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    // Stable identifier for scenes and the API, unique in the room.
    slug: text('slug').notNull(),
  },
  (t) => [uniqueIndex('targets_room_slug_unique').on(t.roomId, t.slug)],
)

// Where one head points for one target, as 16-bit DMX values. Heads hang
// differently, so the same target has different pan/tilt on each.
export const targetPositions = sqliteTable(
  'target_positions',
  {
    targetId: integer('target_id')
      .notNull()
      .references(() => targets.id, { onDelete: 'cascade' }),
    fixtureId: integer('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    pan: integer('pan').notNull(),
    tilt: integer('tilt').notNull(),
  },
  (t) => [primaryKey({ columns: [t.targetId, t.fixtureId] })],
)
