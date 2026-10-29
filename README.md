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

## Database

Edit `apps/server/src/db/schema.ts`, then run `pnpm db:generate`. Migrations
in `apps/server/drizzle/` are applied on server start. `pnpm db:studio` opens
Drizzle Studio.

## Hardware

The DMX interface is a DSD TECH USB→RS485 adapter (FTDI FT232R), at
`/dev/serial/by-id/usb-FTDI_FT232R_USB_UART_*`. Your user must be in the
`uucp` group (Arch) or `dialout` (Debian/Ubuntu). RS485 → XLR wiring:
GND → pin 1, B → pin 2, A → pin 3 (swap A/B if fixtures don't respond).
