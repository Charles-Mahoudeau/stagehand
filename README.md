# Stagehand

DMX512 lighting controller. A Hono backend runs on the PC wired to the DMX
interface; a React UI is served to any device on the LAN.

```
apps/server      Hono API (OpenAPI + Scalar), WebSocket, SQLite via Drizzle
apps/web         Vite + React, TanStack Router/Query, Tailwind v4, shadcn/ui
packages/shared  Zod schemas shared by both (WebSocket messages, …)
```

## Setup

```sh
pnpm install
cp apps/server/.env.example apps/server/.env   # then set STAGEHAND_TOKEN
```

## Develop

```sh
pnpm dev
```

- UI: http://localhost:5173 (proxies `/api`, `/ws`, `/docs` to the server)
- API: http://localhost:3000, docs at http://localhost:3000/docs

## Production

```sh
pnpm build && pnpm start
```

One process on port 3000 serves the API, WebSocket and the built UI.

## Auth

Everything except `/api/health`, `/api/auth/login|logout`, `/docs` and
`/openapi.json` requires `STAGEHAND_TOKEN`, either as
`Authorization: Bearer <token>` or as the session cookie set by
`POST /api/auth/login` (what the web UI uses, including for `/ws`).

## Adding an API route

Define it with `createRoute()` in `apps/server/src/routes/`, build the router
with `createRouter()`, and chain it into `routes` in `src/app.ts`. It is then
validated, documented in `/docs`, and typed in the web client (`@/lib/api`).

## Design system

The UI follows the Stagehand design system:
https://claude.ai/artifact/DMvZVU2KumqUdhtsGUCAiN (tokens, guidelines and live
component previews). The rules that matter most:

- **Black only.** There is no light theme. `index.html` sets `class="dark"`
  so shadcn's `dark:` variants apply.
- **Light is the only colour.** Hue on screen means DMX output (fixture dots,
  group tiles, cue strips). Chrome stays black, grey and white. The exceptions
  are the state colours `live`, `warning` and `destructive` (dots and pills
  only) and the fader tints `ch-red`, `ch-green`, `ch-blue` and `ch-white`.
- **White is the selection.** The active tab, the primary button and the
  selected fixture (`shadow-select`) use it. There is no brand accent.
- **Numbers are mono.** DMX values, addresses, BPM and fixture ids use
  `font-mono` (JetBrains Mono). Everything else uses Instrument Sans. Both are
  bundled through Fontsource, so the UI works on a LAN with no internet.
- **Rounded, filled, borderless.** Panels are `bg-card` (`surface-1`) with
  `rounded-2xl` on black. Insets inside them are `surface-2`, and the selected
  row is `surface-3`.
- **Touch-sized.** `h-control-sm` (40px) is the minimum target,
  `h-control-md` (44px) the default, `h-control-lg` (48px) for show controls
  and `h-control-go` (96px) for Go.

Tokens live in `apps/web/src/index.css`. The shadcn variables are mapped onto
them, and the extra ones are exposed as Tailwind colours: `surface-0` to
`surface-3`, `border-subtle`, `off-ring`, `live`, `warning` and `ch-*`. The
shadcn components in `src/components/ui/` are restyled to match:

| Component | Variants |
| --- | --- |
| `Button` | `secondary` (default), `default` (white, at most once per region), `quiet`, `outline` (Blackout), `dashed` (Add …), `ghost`, `destructive`, `link`. Sizes: `default` 44px, `sm` 40px, `lg` 48px, `go` 96px full width, `icon*` |
| `Badge` | Status pill: `live`, `warning`, `destructive`, `idle` show a dot; also `default`, `outline` |
| `Card` | Panel: `surface-1`, 16px radius, no border |
| `Input` | Filled `surface-2`, 44px, white focus outline |

When adding a shadcn component, restyle it with these tokens before using it.
Use lucide icons at 16px or 20px, outline only.

## Database

Edit `apps/server/src/db/schema.ts`, then run `pnpm db:generate`. Migrations
in `apps/server/drizzle/` are applied on server start. `pnpm db:studio` opens
Drizzle Studio.

## Hardware

The DMX interface is a DSD TECH USB→RS485 adapter (FTDI FT232R), at
`/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_*`. Your user must be in the
`uucp` group (Arch) or `dialout` (Debian/Ubuntu). RS485 → XLR wiring:
GND → pin 1, B → pin 2, A → pin 3 (swap A/B if fixtures don't respond).

## DMX output

`src/dmx.ts` drives one 512-channel universe: it sends frames continuously
(break, start code 0, then all 512 channels at 250 kbaud, 8N2) and reopens the
adapter whenever it is unplugged. It uses the first FTDI adapter it finds;
set `DMX_PORT` in `.env` to pin a specific port. `GET /api/dmx` reports
whether frames are going out, the frame rate and the channel values;
`PATCH /api/dmx/channels` with `{ "start": 1, "values": [255, 128] }` sets
channels (numbered 1–512), and `POST /api/dmx/blackout` zeroes them all.
