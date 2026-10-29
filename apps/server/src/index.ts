import { serve } from '@hono/node-server'
import { WebSocketServer } from 'ws'
import { app } from './app'
import { runMigrations, sqlite } from './db'
import { dmxOutput } from './dmx'
import { env } from './env'

runMigrations()
dmxOutput.start()

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

async function shutdown() {
  await dmxOutput.stop()
  server.close(() => {
    sqlite.close()
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
