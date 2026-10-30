import {
  channelCount,
  FIXTURE_PROFILES,
  type FixtureType,
  WHEEL_COLORS,
  WHEEL_STEP,
} from '@stagehand/shared'
import type { Fixture } from '@/lib/rooms'

// Helpers for reading a room's patch: which channels each fixture uses, which
// fixtures are linked by sharing an address, and what they currently output.

export const UNIVERSE = 512

export const lastChannel = (f: Pick<Fixture, 'type' | 'address'>) =>
  f.address + channelCount(f.type) - 1

export const rangeLabel = (f: Pick<Fixture, 'type' | 'address'>) => `${f.address}–${lastChannel(f)}`

export const typeLabel = (type: FixtureType) => (type === 'par' ? 'Par' : 'Moving head')

export const channelCountLabel = (type: FixtureType) => `${channelCount(type)} ch`

export const profileLabel = (type: FixtureType) => FIXTURE_PROFILES[type].label

// Fixtures on one address are driven together.
export type AddressGroup = { address: number; type: FixtureType; fixtures: Fixture[] }

export function groupByAddress(fixtures: Fixture[]): AddressGroup[] {
  const groups = new Map<number, AddressGroup>()
  for (const f of fixtures) {
    const group = groups.get(f.address)
    if (group) group.fixtures.push(f)
    else groups.set(f.address, { address: f.address, type: f.type, fixtures: [f] })
  }
  return [...groups.values()].sort((a, b) => a.address - b.address)
}

export type Overlap = { channels: [number, number]; fixtures: Fixture[] }

// Fixtures whose channels collide without sharing an address (or that share
// one with different profiles). Allowed, but almost always a patching mistake.
export function findOverlaps(fixtures: Fixture[]): Overlap[] {
  const overlaps: Overlap[] = []
  for (let i = 0; i < fixtures.length; i++) {
    for (let j = i + 1; j < fixtures.length; j++) {
      const a = fixtures[i] as Fixture
      const b = fixtures[j] as Fixture
      if (a.address === b.address && a.type === b.type) continue
      const from = Math.max(a.address, b.address)
      const to = Math.min(lastChannel(a), lastChannel(b))
      if (from <= to) overlaps.push({ channels: [from, to], fixtures: [a, b] })
    }
  }
  return overlaps
}

export function describeOverlap(o: Overlap) {
  const [a, b] = o.fixtures
  const [from, to] = o.channels
  return `${a?.name} and ${b?.name} overlap on ${from === to ? `channel ${from}` : `channels ${from}–${to}`}`
}

export function overlappingIds(overlaps: Overlap[]) {
  return new Set(overlaps.flatMap((o) => o.fixtures.map((f) => f.id)))
}

// Every channel some fixture uses.
export function patchedChannels(fixtures: Fixture[]) {
  const used = new Set<number>()
  for (const f of fixtures) for (let ch = f.address; ch <= lastChannel(f); ch++) used.add(ch)
  return used
}

// Lowest address where a fixture of `type` fits without touching another.
export function nextFreeAddress(fixtures: Fixture[], type: FixtureType) {
  const used = patchedChannels(fixtures)
  const count = channelCount(type)
  for (let start = 1; start + count - 1 <= UNIVERSE; start++) {
    let free = true
    for (let ch = start; ch < start + count && free; ch++) free = !used.has(ch)
    if (free) return start
  }
  return 1
}

export function nextName(fixtures: Fixture[]) {
  const taken = new Set(fixtures.map((f) => f.name.toLowerCase()))
  let n = fixtures.length + 1
  while (taken.has(`fixture ${n}`)) n++
  return `Fixture ${n}`
}

// What a fixture is putting out, as a CSS color, or null when dark.
export function outputColor(f: Fixture, channels: number[] | null | undefined): string | null {
  if (!channels) return null
  const at = (offset: number) => channels[f.address - 1 + offset] ?? 0
  if (f.type === 'par') {
    const [r, g, b, w] = [at(0), at(1), at(2), at(3)]
    const level = Math.max(r, g, b, w)
    if (level === 0) return null
    // White lifts every primary; normalize so dim output still reads as its hue.
    const mix = [r + w, g + w, b + w]
    const peak = Math.max(...mix)
    const alpha = 0.35 + (0.65 * level) / 255
    const [cr, cg, cb] = mix.map((v) => Math.round((v / peak) * 255))
    return `rgb(${cr} ${cg} ${cb} / ${alpha.toFixed(2)})`
  }
  const dimmer = at(5)
  if (dimmer === 0) return null
  const wheel =
    WHEEL_COLORS[Math.min(WHEEL_COLORS.length - 1, Math.floor(at(7) / WHEEL_STEP))]?.hex ??
    '#ffffff'
  const alpha = 0.35 + (0.65 * dimmer) / 255
  return `color-mix(in srgb, ${wheel} ${Math.round(alpha * 100)}%, transparent)`
}
