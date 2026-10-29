import { existsSync } from 'node:fs'
import path from 'node:path'
import { serveStatic } from '@hono/node-server/serve-static'
import { Scalar } from '@scalar/hono-api-reference'
import { logger } from 'hono/logger'
import pkg from '../package.json' with { type: 'json' }
import { requireAuth } from './lib/auth'
import { createRouter } from './lib/router'
import { webDistDir } from './paths'
import { auth } from './routes/auth'
import { dmx } from './routes/dmx'
import { fixtureRoutes } from './routes/fixtures'
import { health } from './routes/health'
import { roomRoutes } from './routes/rooms'
import { wsHandler } from './ws'

const app = createRouter()

app.use(logger())
app.use('/api/*', requireAuth)
app.use('/ws', requireAuth)

// Chained so `AppType` carries every route for the typed client in apps/web.
const routes = app
  .route('/api', health)
  .route('/api', auth)
  .route('/api', dmx)
  .route('/api', roomRoutes)
  .route('/api', fixtureRoutes)

app.get('/ws', wsHandler)

app.openAPIRegistry.registerComponent('securitySchemes', 'Bearer', {
  type: 'http',
  scheme: 'bearer',
  description: 'The STAGEHAND_TOKEN value',
})
app.doc31('/openapi.json', {
  openapi: '3.1.0',
  info: { title: 'Stagehand API', version: pkg.version },
  security: [{ Bearer: [] }],
})
app.get('/docs', Scalar({ url: '/openapi.json', pageTitle: 'Stagehand API' }))

app.notFound((c) => c.json({ error: 'Not found' }, 404))
app.onError((err, c) => {
  console.error(err)
  return c.json({ error: 'Internal server error' }, 500)
})

// Serve the built web app when present (production). In dev, Vite serves it.
if (existsSync(path.join(webDistDir, 'index.html'))) {
  app.use('/*', serveStatic({ root: webDistDir }))
  // SPA fallback: unknown non-API paths get index.html for client-side routing.
  const spa = serveStatic({ root: webDistDir, path: 'index.html' })
  app.get('*', (c, next) => (c.req.path.startsWith('/api/') ? next() : spa(c, next)))
}

export type AppType = typeof routes
export { app }
