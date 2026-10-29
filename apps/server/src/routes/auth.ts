import { createRoute, z } from '@hono/zod-openapi'
import { deleteCookie, setCookie } from 'hono/cookie'
import { AUTH_COOKIE, isValidToken } from '../lib/auth'
import { createRouter } from '../lib/router'
import { ErrorSchema } from '../lib/schemas'

const login = createRoute({
  method: 'post',
  path: '/auth/login',
  tags: ['Auth'],
  summary: 'Exchange the shared token for a session cookie',
  security: [],
  request: {
    body: {
      required: true,
      content: { 'application/json': { schema: z.object({ token: z.string() }) } },
    },
  },
  responses: {
    204: { description: 'Logged in, cookie set' },
    401: { description: 'Wrong token', content: { 'application/json': { schema: ErrorSchema } } },
  },
})

const logout = createRoute({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  summary: 'Clear the session cookie',
  security: [],
  responses: { 204: { description: 'Logged out' } },
})

const session = createRoute({
  method: 'get',
  path: '/auth/session',
  tags: ['Auth'],
  summary: 'Check whether the caller is authenticated',
  responses: {
    200: {
      description: 'Authenticated',
      content: { 'application/json': { schema: z.object({ authenticated: z.literal(true) }) } },
    },
    401: {
      description: 'Not authenticated',
      content: { 'application/json': { schema: ErrorSchema } },
    },
  },
})

export const auth = createRouter()
  .openapi(login, (c) => {
    const { token } = c.req.valid('json')
    if (!isValidToken(token)) return c.json({ error: 'Invalid token' }, 401)
    setCookie(c, AUTH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Strict',
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
    })
    return c.body(null, 204)
  })
  .openapi(logout, (c) => {
    deleteCookie(c, AUTH_COOKIE, { path: '/' })
    return c.body(null, 204)
  })
  // requireAuth already rejected unauthenticated callers.
  .openapi(session, (c) => c.json({ authenticated: true as const }, 200))
