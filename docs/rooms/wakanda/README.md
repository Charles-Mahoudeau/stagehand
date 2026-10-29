# Wakanda room

Demo room. Original plan: [plan.png](plan.png) (legend in French: *Canal* =
channel, *rien* = nothing connected, *mobile* = movable fixture).

Each "canal" is assumed to be a DMX channel (1-based, as in `dmx.set()`), and
every fixture on a channel is driven together by that channel's level.

## Channels

| Channel | Colour on plan | Fixtures | Where |
| ------: | -------------- | -------: | ----- |
| 1  | red          | 2 | back row (row A), two centre spots |
| 2  | yellow       | 2 | second row (row B), two centre spots |
| 3  | —            | 0 | unused |
| 4  | green        | 4 | left wall, column of four |
| 5  | —            | 0 | unused |
| 6  | light orange | 1 | movable; drawn centre-left, mid-room |
| 7  | purple       | 2 | back row (row A), two outer corners |
| 8  | pink         | 2 | second row (row B), two outer spots |
| 9  | —            | 0 | unused |
| 10 | dark blue    | 4 | right wall, column of four |
| 11 | —            | 0 | unused |
| 12 | dark orange  | 1 | movable; drawn centre-right, mid-room |

18 fixtures on 8 live channels. The layout is mirror-symmetric left↔right:
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

| Channel | Fixture | x    | y    |
| ------: | ------- | ---- | ---- |
| 7  | A1 (top-left corner)  | 0.10 | 0.06 |
| 1  | A2                    | 0.36 | 0.06 |
| 1  | A3                    | 0.62 | 0.06 |
| 7  | A4 (top-right corner) | 0.88 | 0.06 |
| 8  | B1                    | 0.15 | 0.23 |
| 2  | B2                    | 0.37 | 0.23 |
| 2  | B3                    | 0.60 | 0.23 |
| 8  | B4                    | 0.83 | 0.23 |
| 4  | L1 (left wall, top)   | 0.08 | 0.37 |
| 4  | L2                    | 0.08 | 0.52 |
| 4  | L3                    | 0.08 | 0.68 |
| 4  | L4 (left wall, bottom)| 0.08 | 0.83 |
| 10 | R1 (right wall, top)  | 0.91 | 0.37 |
| 10 | R2                    | 0.91 | 0.52 |
| 10 | R3                    | 0.91 | 0.68 |
| 10 | R4 (right wall, bottom)| 0.91 | 0.83 |
| 6  | M1 (movable)          | 0.39 | 0.50 |
| 12 | M2 (movable)          | 0.61 | 0.50 |

Because fixtures sharing a channel can't be driven independently, effects can
only address these groups: stage-front centre (1), second-row centre (2), left
wall (4), right wall (10), stage-front corners (7), second-row outer (8), and
the two movables (6, 12) individually. Front-to-back sweeps run 7/1 → 8/2 →
4/10 (the walls are one channel each, so they light along their whole length).
The back ~15% of the room has no fixtures.
