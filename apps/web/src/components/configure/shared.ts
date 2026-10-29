import type { FixtureType } from '@stagehand/shared'
import { nextFreeAddress, nextName } from '@/lib/patch'
import { type Fixture, type Room, useFixtureMutations } from '@/lib/rooms'

// What every Configure view receives from the page.
export type ViewProps = {
  room: Room
  fixtures: Fixture[]
  selected?: Fixture
  onSelect: (id: number | null) => void
  // Fixtures whose channels collide with another's.
  overlapping: Set<number>
}

// Adds a fixture with sensible defaults (next free address, middle of the
// room) and selects it, so it can be renamed and placed straight away.
export function useAddFixture({ room, fixtures, onSelect }: ViewProps) {
  const { create } = useFixtureMutations(room.id)
  const add = (input: { name?: string; type?: FixtureType; address?: number } = {}) => {
    const type = input.type ?? 'par'
    create.mutate(
      {
        name: input.name ?? nextName(fixtures),
        type,
        address: input.address ?? nextFreeAddress(fixtures, type),
        position: { x: 0.5, y: 0.5 },
      },
      { onSuccess: (f) => onSelect(f.id) },
    )
  }
  return { add, pending: create.isPending, error: create.error }
}
