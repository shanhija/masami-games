/**
 * One dev server at a time asks and writes in a library. The line of rooms (line.ts) holds the
 * whole line in memory and writes line.jsonl from it, and the store picks a new id from its own read
 * of a folder: two dev servers on one library (one on 3002 and another on a port of its own, both on
 * the default MAGIC_LIBRARY) would write over each other's line and could ask Opus twice for one
 * party. So the API takes `server.lock` in the library (git-ignored): the API that holds it asks and
 * writes, and any other reads the library but refuses the line with a sentence naming the process
 * that holds it. A lock whose process is gone is taken over. The lock is let go when the API closes,
 * so the next API the plugin builds in the same process takes it again.
 */

import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/** What the lock file holds: who took it and when. */
interface Holder {
  readonly pid: number
  readonly token: string
  readonly since: string
}

export type Lock =
  /** This API holds the library; release() lets it go. */
  | { readonly held: true; readonly release: () => void }
  /** Another holds it: why this API may not ask or write, in a sentence. */
  | { readonly held: false; readonly by: string }

export const LOCK_FILE = 'server.lock'

/** The holder in the file, or null when there is none or it cannot be read (a lock half written by a process that died). */
function holderOf(file: string): Holder | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Holder
  } catch {
    return null
  }
}

/** Whether a process is running: EPERM means it runs as another user. */
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Takes the library's lock for this API, or says who holds it. */
export function takeLock(dir: string): Lock {
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, LOCK_FILE)
  const mine: Holder = { pid: process.pid, token: randomUUID(), since: new Date().toISOString() }
  // A second go only after a lock left by a process that is gone was taken away.
  for (let go = 0; go < 2; go++) {
    try {
      fs.writeFileSync(file, `${JSON.stringify(mine)}\n`, { flag: 'wx' })
      return {
        held: true,
        release: () => {
          if (holderOf(file)?.token === mine.token) fs.rmSync(file, { force: true })
        },
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    const other = holderOf(file)
    if (other !== null && alive(other.pid))
      return { held: false, by: `the library ${dir} is in use by another dev server (process ${other.pid}, since ${other.since}): only that one asks for rooms and writes the line, so give this one a MAGIC_LIBRARY of its own` }
    fs.rmSync(file, { force: true })
  }
  throw new Error(`could not take the lock ${file}: another server took it at the same moment`)
}
