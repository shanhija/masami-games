/**
 * For the server's tests: the fake CLI and the fake whisper-server as programs, a free port,
 * and waiting for a condition.
 */
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** An executable in `dir` that runs one of the fake scripts beside this file with this very node, as if it were the real program. */
export function fakeBin(dir: string, script: 'fake-claude.mjs' | 'fake-whisper.mjs'): string {
  const bin = path.join(dir, script.replace('.mjs', ''))
  const file = fileURLToPath(new URL(script, import.meta.url))
  fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${file}" "$@"\n`, { mode: 0o755 })
  return bin
}

/** A port nobody listens on right now. */
export function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as net.AddressInfo
      server.close(() => resolve(port))
    })
  })
}

/** Waits until `ok()` holds, checking every 20 ms; throws after `ms`. */
export async function until(ok: () => boolean | Promise<boolean>, ms: number, what: string): Promise<void> {
  const t0 = Date.now()
  while (!(await ok())) {
    if (Date.now() - t0 > ms) throw new Error(`waited ${ms} ms for ${what}`)
    await new Promise((r) => setTimeout(r, 20))
  }
}

/** Whether a process is still alive. */
export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}
