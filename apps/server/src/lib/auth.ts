import { createHash, timingSafeEqual } from 'node:crypto'
import type { Context, MiddlewareHandler } from 'hono'
import { getCookie } from 'hono/cookie'
import { env } from '../env'

export const AUTH_COOKIE = 'stagehand_token'

// Reachable without a token. Everything else under /api and /ws is protected.
const PUBLIC_PATHS = new Set(['/api/health', '/api/auth/login', '/api/auth/logout'])

const expected = createHash('sha256').update(env.STAGEHAND_TOKEN).digest()

export function isValidToken(token: string | undefined): boolean {
  if (!token) return false
  return timingSafeEqual(createHash('sha256').update(token).digest(), expected)
}

// Browsers use the cookie (it also rides along on the WebSocket handshake);
// scripts and Scalar use `Authorization: Bearer <token>`.
function tokenFrom(c: Context): string | undefined {
  const header = c.req.header('Authorization')
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length)
  return getCookie(c, AUTH_COOKIE)
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (PUBLIC_PATHS.has(c.req.path) || isValidToken(tokenFrom(c))) return next()
  return c.json({ error: 'Unauthorized' }, 401)
}
