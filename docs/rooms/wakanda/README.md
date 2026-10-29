# Wakanda room

Demo room. Original plan: [plan.png](plan.png) (legend in French: _Canal_ =
channel, _rien_ = nothing connected, _mobile_ = movable fixture).

A "canal" is not a single DMX channel but a 16-channel slot: canal _n_ starts
at DMX address 16·(n−1)+1 (1-based, as in `dmx.set()`), and its fixture
profile (see [DMX fixture profiles](#dmx-fixture-profiles)) occupies the first
channels of the slot. Every fixture on a canal shares that address, so they are
driven together.

Verified in the room on 2026-10-29: setting channels 51 and 147 (blue of
canals 4 and 10) to 255 lit both side walls blue and nothing else.

## Canals

| Canal | DMX address | Profile     | Colour on plan | Fixtures | Where                                 |
| ----: | ----------: | ----------- | -------------- | -------: | ------------------------------------- |
|     1 |           1 | fixed RGBW  | red            |        2 | back row (row A), two centre spots    |
|     2 |          17 | fixed RGBW  | yellow         |        2 | second row (row B), two centre spots  |
|     3 |          33 | —           | —              |        0 | unused                                |
|     4 |          49 | fixed RGBW  | green          |        4 | left wall, column of four             |
|     5 |          65 | —           | —              |        0 | unused                                |
|     6 |          81 | moving head | light orange   |        1 | movable; drawn centre-left, mid-room  |
|     7 |          97 | fixed RGBW  | purple         |        2 | back row (row A), two outer corners   |
|     8 |         113 | fixed RGBW  | pink           |        2 | second row (row B), two outer spots   |
|     9 |         129 | —           | —              |        0 | unused                                |
|    10 |         145 | fixed RGBW  | dark blue      |        4 | right wall, column of four            |
|    11 |         161 | —           | —              |        0 | unused                                |
|    12 |         177 | moving head | dark orange    |        1 | movable; drawn centre-right, mid-room |

The profile column assumes the movables (6, 12) are the two moving heads and
every other fixture is a fixed projector; only canals 4 and 10 are verified.

18 fixtures on 8 live canals. The layout is mirror-symmetric left↔right:
1/2 are centre pairs, 7/8 are outer pairs, 4 ↔ 10 are the side walls, 6 ↔ 12
are the movable pair.

## Layout

The top of the plan is the stage side; the bottom is the back of the room.
Left/right are as seen on the plan, i.e. as seen from the audience facing the
stage.

```
          left              STAGE                right
        +-----------------------------------------------+
row A   |  [7]         [1]          [1]         [7]     |   stage edge
row B   |     [8]        [2]       [2]       [8]        |
        | [4]                                    [10]   |
        | [4]           (6)       (12)           [10]   |   (6), (12) movable
        | [4]                                    [10]   |
        | [4]                                    [10]   |
        |                                               |
        +-----------------------------------------------+
                            back of room
```

## Coordinates

Fixture centres as fractions of the room's width (x, 0 = left wall) and depth
(y, 0 = stage side, 1 = back of room), measured from the plan. Useful for spatial effects (sweeps,
chases); approximate, not surveyed.

| Canal | Fixture                 | x    | y    |
| ----: | ----------------------- | ---- | ---- |
|     7 | A1 (top-left corner)    | 0.10 | 0.06 |
|     1 | A2                      | 0.36 | 0.06 |
|     1 | A3                      | 0.62 | 0.06 |
|     7 | A4 (top-right corner)   | 0.88 | 0.06 |
|     8 | B1                      | 0.15 | 0.23 |
|     2 | B2                      | 0.37 | 0.23 |
|     2 | B3                      | 0.60 | 0.23 |
|     8 | B4                      | 0.83 | 0.23 |
|     4 | L1 (left wall, top)     | 0.08 | 0.37 |
|     4 | L2                      | 0.08 | 0.52 |
|     4 | L3                      | 0.08 | 0.68 |
|     4 | L4 (left wall, bottom)  | 0.08 | 0.83 |
|    10 | R1 (right wall, top)    | 0.91 | 0.37 |
|    10 | R2                      | 0.91 | 0.52 |
|    10 | R3                      | 0.91 | 0.68 |
|    10 | R4 (right wall, bottom) | 0.91 | 0.83 |
|     6 | M1 (movable)            | 0.39 | 0.50 |
|    12 | M2 (movable)            | 0.61 | 0.50 |

Because fixtures sharing a canal can't be driven independently, effects can
only address these groups: stage-front centre (1), second-row centre (2), left
wall (4), right wall (10), stage-front corners (7), second-row outer (8), and
the two movables (6, 12) individually. Front-to-back sweeps run 7/1 → 8/2 →
4/10 (the walls are one canal each, so they light along their whole length).
The back ~15% of the room has no fixtures.

## DMX fixture profiles

Channel offsets are relative to the fixture's DMX start address (+0 is the
first channel).

### Fixed projectors (4-channel mode)

| Offset | Function | Range |
| -----: | -------- | ----- |
|     +0 | Red      | 0–255 |
|     +1 | Green    | 0–255 |
|     +2 | Blue     | 0–255 |
|     +3 | White    | 0–255 |

### Moving heads (2×, Spot Gobo, 11-channel mode)

| Offset | Function          | Notes                                                       |
| -----: | ----------------- | ----------------------------------------------------------- |
|     +0 | Pan               | Horizontal, 0°–540°                                         |
|     +1 | Pan Fine          | 16-bit precision for very accurate targeting                |
|     +2 | Tilt              | Vertical, 0°–270°                                           |
|     +3 | Tilt Fine         | 16-bit precision                                            |
|     +4 | Pan/Tilt speed    | 0 = instant / fast, 255 = very slow                         |
|     +5 | Dimmer master     | Intensity, 0–100%                                           |
|     +6 | Shutter / Strobe  | 0–15 open, 16–255 strobe frequency                          |
|     +7 | Colour wheel      | Index of fixed colours: white, red, blue, green, yellow, …  |
|     +8 | Gobo wheel        | Projected patterns: solid circle, stars, lightning bolts, … |
|     +9 | Rotating prism    | Beam multiplication and rotation                            |
|    +10 | Demo mode / Reset | Keep at 0 for manual DMX control                            |
