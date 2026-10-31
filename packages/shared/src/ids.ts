import { z } from 'zod'

// Every entity (room, fixture, target, effect, scene, cue) is identified by a
// slug: lower-case letters, digits and single dashes. Rooms are unique
// globally, everything else within its room.
export const Slug = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lower-case letters, digits and single dashes')
  .max(40)
export type Slug = z.infer<typeof Slug>

export const SLUG_MAX = 40

// "DJ booth" → "dj-booth". Empty when nothing usable is left.
export function slugify(text: string, max = SLUG_MAX) {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '')
}

// `base` made unique with -2, -3, … as long as `taken` says it is used.
export function uniqueSlug(text: string, fallback: string, taken: (slug: string) => boolean) {
  const base = slugify(text, SLUG_MAX - 4) || fallback
  let slug = base
  for (let n = 2; taken(slug); n++) slug = `${base}-${n}`
  return slug
}
