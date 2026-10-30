import { z } from 'zod'

// Built-in fixture profiles: the DMX channels a fixture occupies, in order
// from its start address. From docs/rooms/wakanda/README.md.

export const FIXTURE_TYPES = ['par', 'moving_head'] as const
export const FixtureType = z.enum(FIXTURE_TYPES)
export type FixtureType = z.infer<typeof FixtureType>

export type FixtureChannel = { attribute: string; label: string }
export type FixtureProfile = { type: FixtureType; label: string; channels: FixtureChannel[] }

export const FIXTURE_PROFILES: Record<FixtureType, FixtureProfile> = {
  par: {
    type: 'par',
    label: 'Fixed projector (RGBW, 4-channel)',
    channels: [
      { attribute: 'red', label: 'Red' },
      { attribute: 'green', label: 'Green' },
      { attribute: 'blue', label: 'Blue' },
      { attribute: 'white', label: 'White' },
    ],
  },
  moving_head: {
    type: 'moving_head',
    label: 'Moving head (Spot Gobo, 11-channel)',
    channels: [
      { attribute: 'pan', label: 'Pan' },
      { attribute: 'panFine', label: 'Pan fine' },
      { attribute: 'tilt', label: 'Tilt' },
      { attribute: 'tiltFine', label: 'Tilt fine' },
      { attribute: 'speed', label: 'Pan/tilt speed' },
      { attribute: 'dimmer', label: 'Dimmer' },
      { attribute: 'shutter', label: 'Shutter / strobe' },
      { attribute: 'color', label: 'Color wheel' },
      { attribute: 'gobo', label: 'Gobo wheel' },
      { attribute: 'prism', label: 'Rotating prism' },
      { attribute: 'control', label: 'Demo mode / reset' },
    ],
  },
}

export function channelCount(type: FixtureType) {
  return FIXTURE_PROFILES[type].channels.length
}

// The moving head's color wheel: eight slots 16 DMX values apart, with the color
// each one shows. The order was checked on the head; the slots aren't documented.
export const WHEEL_COLORS = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Red', hex: '#ff3b3b' },
  { name: 'Yellow', hex: '#ffd23c' },
  { name: 'Green', hex: '#46dc78' },
  { name: 'Orange', hex: '#ff8c28' },
  { name: 'Dark blue', hex: '#2a3cd8' },
  { name: 'Magenta', hex: '#e040e0' },
  { name: 'Light blue', hex: '#5cc8ff' },
] as const
export const WHEEL_STEP = 16
