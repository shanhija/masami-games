/**
 * Magic House's library on disk, written only by the dev server (plan.md, The library), on the
 * pattern of Silly Billy's store (silly-billy/src/server/store.ts): `rooms/<id>.json` a RoomFile,
 * `wear/<id>.json` a GiftFile, and `index.json` the LibraryIndex, oldest first, all pretty-printed
 * so a commit shows what changed. The build ships these files as they are, guarded code included.
 *
 * Reading guards every file's written code again, so a change to the guard reaches every kept room
 * and present: a file is rewritten only when the guard's output changes, and one the guard now
 * refuses is left out with a warning. Play never changes a file (POST /play only logs), so playing
 * leaves no trace in git. Beside them, git-ignored as *.jsonl: `log.jsonl`, every request, answer,
 * trial and play; `prompts.jsonl`, each system prompt once under the hash the log names it by; and
 * the line of rooms (server/line.ts).
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { slugOf } from '../../../silly-billy/src/engine/protocol'
import { ROOM_FILE_VERSION, type GiftEntry, type GiftFile, type LibraryIndex, type RoomEntry, type RoomFile } from '../protocol'
import { guardCode, type CodeKind } from './codeKinds'
import { isShell, isText, isWords } from './http'

/** A room as the line keeps it: everything its file holds but what the store gives it (its id, its guarded code, when it was made). */
export type NewRoom = Omit<RoomFile, 'v' | 'id' | 'roomGuarded' | 'walkGuarded' | 'look' | 'lookGuarded' | 'lookWish' | 'made'>
/** A present as the line keeps it. */
export type NewGift = Omit<GiftFile, 'id' | 'guarded' | 'made'>

/** How many words of a name its id takes. */
const ID_WORDS = 4
/** What an id looks like: lowercase words joined by dashes, ending in a number. Anything else is never a file here. */
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** The code guarded, or the guard's sentence thrown. */
function mustGuard(kind: CodeKind, code: string): string {
  const g = guardCode(kind, code)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

/** Throws unless a room's file has what the house and the trial read. */
function checkRoom(r: RoomFile): void {
  if (r.v !== ROOM_FILE_VERSION) throw new Error(`it was made for version ${JSON.stringify(r.v ?? 1)} of the house, and this house reads version ${ROOM_FILE_VERSION}`)
  if (![1, 2, 3, 4].includes(r.party) || typeof r.seed !== 'number' || ![1, 2, 3].includes(r.level)) throw new Error('its party, seed or level is not a number it can be')
  if (typeof r.roll !== 'object' || r.roll === null || !isText(r.roll.kind) || !isText(r.roll.view)) throw new Error('it has no roll')
  if (![r.theme, r.task, r.room, r.walk, r.wish, r.lookWish, r.made].every(isText) || !isWords(r.name) || !isShell(r.shell)) throw new Error('it lacks a theme, a task, a name, a shell, its code or when it was made')
  if (!(r.look === null || isText(r.look))) throw new Error('its look is neither code nor null')
  if (typeof r.botSecs !== 'object' || r.botSecs === null || ![1, 2, 3].every((l) => typeof r.botSecs[l as 1 | 2 | 3] === 'number')) throw new Error("it lacks the bots' seconds")
}

/** Throws unless a present's file has what the dressing room reads. */
function checkGift(g: GiftFile): void {
  if (![g.slot, g.form, g.code, g.room, g.made].every(isText) || !isWords(g.name)) throw new Error('it lacks a slot, a form, its code, its room, a name or when it was made')
}

export class Store {
  /** The hashes already in prompts.jsonl, read on the first promptId. */
  private prompts: Set<string> | null = null

  constructor(
    readonly dir: string,
    private readonly warn: (message: string) => void,
  ) {}

  /** Writes through a temporary file, so a half-written file is never read (the line's file too). */
  write(file: string, text: string): void {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  }

  private writeJson(file: string, data: unknown): void {
    this.write(file, `${JSON.stringify(data, null, 2)}\n`)
  }

  /**
   * Every file in a folder, as today's guard writes it, oldest first. A file that cannot be read or
   * guarded is left out with a warning; one whose guarded code changed is written back (a warning
   * when it cannot be, and it is served brought up to date all the same).
   */
  private files<T extends { id: string; made: string }>(folder: 'rooms' | 'wear', check: (t: T) => void, fresh: (t: T) => T): T[] {
    const dir = path.join(this.dir, folder)
    if (!fs.existsSync(dir)) return []
    const out: T[] = []
    for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort()) {
      try {
        const t = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as T
        if (`${t.id}.json` !== name) throw new Error(`its id is ${JSON.stringify(t.id)}`)
        check(t)
        const now = fresh(t)
        if (JSON.stringify(now) !== JSON.stringify(t)) {
          try {
            this.writeJson(path.join(dir, name), now)
          } catch (err) {
            this.warn(`library: could not bring ${folder}/${name} up to date: ${(err as Error).message}`)
          }
        }
        out.push(now)
      } catch (err) {
        this.warn(`library: left out ${folder}/${name}: ${(err as Error).message}`)
      }
    }
    return out.sort((a, b) => a.made.localeCompare(b.made) || a.id.localeCompare(b.id))
  }

  rooms(): RoomFile[] {
    return this.files<RoomFile>('rooms', checkRoom, (r) => ({ ...r, roomGuarded: mustGuard('room', r.room), walkGuarded: mustGuard('walk', r.walk), lookGuarded: r.look === null ? null : mustGuard('look', r.look) }))
  }

  gifts(): GiftFile[] {
    return this.files<GiftFile>('wear', checkGift, (g) => ({ ...g, guarded: mustGuard('gift', g.code) }))
  }

  /** The library as the house lists it, oldest first; index.json is written when it no longer says the same. */
  index(): LibraryIndex {
    const index: LibraryIndex = {
      rooms: this.rooms().map(({ id, party, roll, theme, task, name, shell, botSecs, made }): RoomEntry => ({ id, party, roll, theme, task, name, shell, botSecs, made })),
      gifts: this.gifts().map(({ id, slot, name, room }): GiftEntry => ({ id, slot, name, room })),
    }
    const file = path.join(this.dir, 'index.json')
    const text = `${JSON.stringify(index, null, 2)}\n`
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) this.write(file, text)
    return index
  }

  /** One kept room by its id, as today's guard writes it; null when there is none (or the id could never be a file here). */
  room(id: string): RoomFile | null {
    return ID.test(id) ? (this.rooms().find((r) => r.id === id) ?? null) : null
  }

  gift(id: string): GiftFile | null {
    return ID.test(id) ? (this.gifts().find((g) => g.id === id) ?? null) : null
  }

  /** A new id in a folder: the first words of the English name and a number past every number there. */
  private newId(folder: 'rooms' | 'wear', english: string): string {
    const words = slugOf(english).split('-').filter(Boolean).slice(0, ID_WORDS).join('-') || (folder === 'rooms' ? 'room' : 'present')
    const dir = path.join(this.dir, folder)
    const used = fs.existsSync(dir) ? fs.readdirSync(dir).map((n) => Number(/-(\d+)\.json$/.exec(n)?.[1] ?? 0)) : []
    return `${words}-${Math.max(0, ...used) + 1}`
  }

  /** Keeps a room that passed its trial: its file, guarded afresh, and the index. Throws on code the guard refuses. It is kept without a look: a room is kept when its game passes, and its look is added when it is ready (attachLook). */
  keepRoom(room: NewRoom): RoomFile {
    // In the order protocol.ts gives the fields, so each file reads the same way.
    const file: RoomFile = {
      v: ROOM_FILE_VERSION,
      id: this.newId('rooms', room.name.en),
      party: room.party,
      seed: room.seed,
      roll: room.roll,
      level: room.level,
      theme: room.theme,
      task: room.task,
      name: room.name,
      shell: room.shell,
      room: room.room,
      roomGuarded: mustGuard('room', room.room),
      walk: room.walk,
      walkGuarded: mustGuard('walk', room.walk),
      look: null,
      lookGuarded: null,
      wish: room.wish,
      lookWish: '',
      botSecs: room.botSecs,
      made: new Date().toISOString(),
    }
    this.writeJson(path.join(this.dir, 'rooms', `${file.id}.json`), file)
    this.index()
    return file
  }

  /** Adds a room's look to its kept file once the look has passed its check, guarded afresh (step 7a). The index does not change: it lists no look. Throws when there is no such room or the guard refuses the look. */
  attachLook(id: string, look: string, lookWish: string): RoomFile {
    const room = this.room(id)
    if (room === null) throw new Error(`no kept room ${id}`)
    const file: RoomFile = { ...room, look, lookGuarded: mustGuard('look', look), lookWish }
    this.writeJson(path.join(this.dir, 'rooms', `${id}.json`), file)
    return file
  }

  /**
   * Drops a kept room that no longer passes after a change to the engine or the trial (plan.md, The
   * library: dropped, not propped up): its file goes, the index follows, and the log says why. Its
   * presents stay. Throws when there is no such room.
   */
  dropRoom(id: string, why: string): void {
    const room = this.room(id)
    if (room === null) throw new Error(`no kept room ${id}`)
    fs.rmSync(path.join(this.dir, 'rooms', `${id}.json`))
    this.index()
    this.log({ event: 'dropped from the library', room: id, botSecs: room.botSecs, why })
  }

  /** Keeps a present that passed its check, and the index. */
  keepGift(gift: NewGift): GiftFile {
    const file: GiftFile = { id: this.newId('wear', gift.name.en), slot: gift.slot, form: gift.form, code: gift.code, guarded: mustGuard('gift', gift.code), room: gift.room, name: gift.name, made: new Date().toISOString() }
    this.writeJson(path.join(this.dir, 'wear', `${file.id}.json`), file)
    this.index()
    return file
  }

  /** A short hash of a system prompt, for the log; the prompt itself is kept once under it in prompts.jsonl. */
  promptId(system: string): string {
    const id = createHash('sha256').update(system).digest('hex').slice(0, 12)
    const file = path.join(this.dir, 'prompts.jsonl')
    this.prompts ??= new Set(fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { id: string }).id) : [])
    if (!this.prompts.has(id)) {
      fs.mkdirSync(this.dir, { recursive: true })
      fs.appendFileSync(file, `${JSON.stringify({ at: new Date().toISOString(), id, system })}\n`)
      this.prompts.add(id)
    }
    return id
  }

  /** One line of the log, stamped with the time. Never who the children are: the line's callers put in only counts, devices and how rooms went. */
  log(line: Readonly<Record<string, unknown>> & { readonly event: string }): void {
    fs.mkdirSync(this.dir, { recursive: true })
    fs.appendFileSync(path.join(this.dir, 'log.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`)
  }
}
