import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * One page per game, each its own folder with an index.html and a src/. The root index.html
 * is the game directory; a tap there navigates to a game, so only that game's code loads.
 * A new game goes here and gets a card on the root page.
 */
const GAMES = ['chase', 'foot-chase', 'castle-builder', 'pia-jump', 'rakennustyömaat', 'rocket-factory', 'marienpeli', 'limaukkopeli', 'ruokapeli'] as const

export default defineConfig(({ command, mode }) => ({
  // Relative asset paths: the build runs from disk.
  base: './',
  // No SPA fallback: each page is its own HTML file, so a wrong URL is a 404, not the directory.
  appType: 'mpa',
  plugins: [react()],
  server: {
    // A tablet reaches the dev server over the VPN as https://dev.example.com:3002. .dev is
    // HSTS-preloaded, so browsers demand real TLS: a Let's Encrypt cert issued via Bunny DNS-01
    // (acme.sh) lives at ~/certs/dev.example.com/. Only the dev server reads it: builds and
    // tests also run in the image build (hosting/Dockerfile), where the laptop's files are not.
    https:
      command === 'serve' && mode !== 'test'
        ? {
            key: fs.readFileSync(`${process.env.HOME}/certs/dev.example.com/key.pem`),
            cert: fs.readFileSync(`${process.env.HOME}/certs/dev.example.com/fullchain.pem`),
          }
        : undefined,
    allowedHosts: ['dev.example.com'],
  },
  build: {
    chunkSizeWarningLimit: 2000,
    // Every page is an entry; what the games share (react, three, drei) becomes common chunks.
    rolldownOptions: { input: ['index.html', ...GAMES.map((game) => `${game}/index.html`)] },
  },
  test: { environment: 'node', include: ['*/src/**/*.test.ts'] },
}))
