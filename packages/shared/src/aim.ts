// Pan and tilt of moving heads. Targets store these per head, so there is no
// geometry here: just the heads' travel and the 16-bit value conversions.

// Travel of the Wakanda moving heads (docs/rooms/wakanda/README.md), in degrees.
export const PAN_RANGE = 540
export const TILT_RANGE = 270
export const MAX_16 = 65535

// Pan and tilt as 16-bit DMX values (coarse·256 + fine).
export type PanTilt = { pan: number; tilt: number }

export const panDegrees = (pan16: number) => (pan16 / MAX_16) * PAN_RANGE
export const tiltDegrees = (tilt16: number) => (tilt16 / MAX_16) * TILT_RANGE

// A 16-bit value as its [coarse, fine] DMX channel pair.
export const coarseFine = (v: number) => [v >> 8, v & 255] as const
