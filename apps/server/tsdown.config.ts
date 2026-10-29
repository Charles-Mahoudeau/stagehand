import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  platform: 'node',
  format: 'esm',
  // Bundle workspace packages (shipped as TS source); keep npm deps external.
  deps: { alwaysBundle: [/^@stagehand\//] },
})
