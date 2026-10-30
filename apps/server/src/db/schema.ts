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
    // Floor size in metres; with fixture heights it lets aim be worked out in 3D.
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
    // Metres above the floor; moving heads hang from the ceiling.
    height: real('height'),
  },
  (t) => [
    uniqueIndex('fixtures_room_name_unique').on(t.roomId, sql`lower(${t.name})`),
    index('fixtures_room_address').on(t.roomId, t.address),
  ],
)

// A named spot on the room plan that moving heads can be aimed at.
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
    // Same plan coordinates as fixtures.
    x: real('x').notNull(),
    y: real('y').notNull(),
    // Metres above the floor; only used once the room has a size.
    height: real('height'),
  },
  (t) => [uniqueIndex('targets_room_slug_unique').on(t.roomId, t.slug)],
)

// A per-head correction for one target, in degrees, on top of the fitted aim.
export const targetNudges = sqliteTable(
  'target_nudges',
  {
    targetId: integer('target_id')
      .notNull()
      .references(() => targets.id, { onDelete: 'cascade' }),
    fixtureId: integer('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    pan: real('pan').notNull().default(0),
    tilt: real('tilt').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.targetId, t.fixtureId] })],
)

// A spot a moving head's beam was jogged onto, for fitting its aim. Pan and
// tilt are 16-bit DMX values; null until saved.
export const calibrationPoints = sqliteTable(
  'calibration_points',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fixtureId: integer('fixture_id')
      .notNull()
      .references(() => fixtures.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    x: real('x').notNull(),
    y: real('y').notNull(),
    pan: integer('pan'),
    tilt: integer('tilt'),
  },
  (t) => [index('calibration_points_fixture').on(t.fixtureId)],
)
