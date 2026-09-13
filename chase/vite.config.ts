import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Relative asset paths: the build runs from disk.
  base: './',
  plugins: [react()],
  server: {
    // A tablet reaches the dev server over the VPN as https://dev.example.com:3002. .dev is
    // HSTS-preloaded, so browsers demand real TLS: a Let's Encrypt cert issued via Bunny DNS-01
    // (acme.sh) lives at ~/certs/dev.example.com/.
    https: {
      key: fs.readFileSync(`${process.env.HOME}/certs/dev.example.com/key.pem`),
      cert: fs.readFileSync(`${process.env.HOME}/certs/dev.example.com/fullchain.pem`),
    },
    allowedHosts: ['dev.example.com'],
  },
  build: { chunkSizeWarningLimit: 2000 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
