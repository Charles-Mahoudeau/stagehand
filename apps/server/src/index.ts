import { serve } from '@hono/node-server'
import { WebSocketServer } from 'ws'
import { app } from './app'
import { runMigrations, sqlite } from './db'
import { env } from './env'

runMigrations()

const server = serve(
  {
    fetch: app.fetch,
    hostname: env.HOST,
    port: env.PORT,
    websocket: { server: new WebSocketServer({ noServer: true }) },
  },
  (info) => {
    console.log(`Stagehand listening on http://${info.address}:${info.port}`)
    console.log(`API docs at http://localhost:${info.port}/docs`)
  },
)

function shutdown() {
  server.close(() => {
    sqlite.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
