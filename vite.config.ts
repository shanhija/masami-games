import fs from 'node:fs'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// '.js' names plugin.ts (TypeScript allows it), so loading the config warns of no extensionless import.
import { sillyBilly } from './silly-billy/src/server/plugin.js'

/**
 * One page per game, each its own folder with an index.html and a src/. The root index.html
 * is the game directory; a tap there navigates to a game, so only that game's code loads.
 * A new game goes here and gets a card on the root page.
 */
const GAMES = ['chase', 'foot-chase', 'castle-builder', 'pia-jump', 'rakennustyömaat', 'rocket-factory', 'marienpeli', 'limaukkopeli', 'ruokapeli', 'rakennuspeli', 'silly-billy'] as const

/**
 * A tablet reaches the dev server by the laptop's own host name: DEV_HOST in the git-ignored
 * .env.local (or the environment). Browsers demand real TLS for it (a .dev name is HSTS-preloaded,
 * and the microphone needs a secure page), so its certificate lives at ~/certs/<DEV_HOST>/.
 * Without DEV_HOST the dev server is plain http, which the browser trusts on localhost.
 */
const DEV_HOST = loadEnv('development', process.cwd(), 'DEV_').DEV_HOST

export default defineConfig(({ command, mode }) => ({
  // Relative asset paths: the build runs from disk.
  base: './',
  // No SPA fallback: each page is its own HTML file, so a wrong URL is a 404, not the directory.
  appType: 'mpa',
  // Silly Billy's ./api/ (the Claude Code CLI, Whisper, its library on disk): under `vite` serve only, idle until asked.
  plugins: [react(), sillyBilly()],
  server: {
    // Only the dev server reads the certificate: builds and tests also run in the image build
    // (hosting/Dockerfile), where the laptop's files are not.
    https:
      DEV_HOST !== undefined && command === 'serve' && mode !== 'test'
        ? {
            key: fs.readFileSync(`${process.env.HOME}/certs/${DEV_HOST}/key.pem`),
            cert: fs.readFileSync(`${process.env.HOME}/certs/${DEV_HOST}/fullchain.pem`),
          }
        : undefined,
    allowedHosts: DEV_HOST === undefined ? [] : [DEV_HOST],
    // Silly Billy saves what it makes in its library/: saving must not reload the page.
    watch: { ignored: ['**/silly-billy/library/**'] },
  },
  build: {
    chunkSizeWarningLimit: 2000,
    // Every page is an entry; what the games share (react, three, drei) becomes common chunks.
    rolldownOptions: { input: ['index.html', ...GAMES.map((game) => `${game}/index.html`)] },
  },
  test: { environment: 'node', include: ['*/src/**/*.test.ts'] },
}))
