import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = 'http://localhost:3000'

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    // Listen on the LAN too, so phones/tablets can hit the dev server.
    host: true,
    proxy: {
      '/api': api,
      '/ws': { target: api, ws: true },
      '/docs': api,
      '/openapi.json': api,
    },
  },
})
