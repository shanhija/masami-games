/**
 * The library on disk, written only by the dev server: one pretty-printed JSON file per made
 * thing in items/, actions/ and avatars/, the phrases heard before in phrases.json, and
 * log.jsonl (git-ignored) with everything said, planned and made, for the parent. The build
 * ships the JSON files as they are, guarded code included, so saving guards an entry's code
 * afresh rather than keeping what the page sent. Reading guards every entry's code again, so a
 * change to the guard reaches old entries too, and brings older files up to date: stale guarded
 * code, an action or a thing saved before the game had two languages (it takes its first
 * Finnish call as its Finnish name), and phrases from then, which have no Finnish line and are
 * dropped (their words are understood afresh the next time). What it changed is written back,
 * so the files a commit ships stay as today's server makes them (shipped.test.ts reads them the
 * same way before every build, and fails on a file this would leave out).
 */

import fs from 'node:fs'
import path from 'node:path'

import { CAST } from '../content/cast'
import { planUses, slugOf, type Entry, type ForgetRequest, type LibraryData, type PhraseEntry, type SaveRequest } from '../engine/protocol'
import { guard, type CodeKind } from './guard'

const FOLDER: Record<Entry['type'], string> = { item: 'items', action: 'actions', avatar: 'avatars' }

/** An id as a file name and a library id: lowercase a-z, 0-9 and single dashes ('Joulu Kuusi!' → 'joulu-kuusi', 'hörökorva' → 'horokorva'). */
export function safeId(id: string): string {
  const s = slugOf(id)
  if (!s) throw new Error(`no usable id in ${JSON.stringify(id)}`)
  return s
}

/**
 * An action's or a thing's Finnish name: its own, or for one saved before the game had two
 * languages, its first call that is not its id or its English name (the interpreter lists the
 * Finnish forms first, the base form first of all), else its English name.
 */
export function finnishName(e: { id: string; name: string; nameFi?: unknown; calls: readonly string[] }): string {
  if (typeof e.nameFi === 'string' && e.nameFi.trim() !== '') return e.nameFi.trim()
  const english = new Set([e.id, e.name].map((s) => s.trim().toLowerCase()))
  return e.calls.map((c) => c.trim()).find((c) => c !== '' && !english.has(c.toLowerCase())) ?? e.name
}

/** Whether a phrase plays today: its plan has the line heard in Finnish too (one saved before the game had two languages has only the English). */
const playsToday = (p: PhraseEntry | null): boolean => typeof p?.plan?.heardFi === 'string' && p.plan.heardFi.trim() !== ''

function mustGuard(kind: CodeKind, code: string): string {
  const g = guard(kind, code)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

/** Throws unless the entry has the fields the page needs, with the right types. */
function checkEntry(e: Entry): void {
  const strings = (v: unknown) => Array.isArray(v) && v.every((s) => typeof s === 'string')
  if (!(e.type in FOLDER)) throw new Error(`unknown entry type ${JSON.stringify(e.type)}`)
  if (typeof e.id !== 'string' || typeof e.name !== 'string' || !strings(e.calls)) throw new Error(`entry ${JSON.stringify(e.id)} lacks an id, a name or calls`)
  if (e.type === 'action' && (typeof e.code !== 'string' || !Array.isArray(e.params))) throw new Error(`action ${e.id} lacks code or params`)
  if (e.type === 'item' && !(e.code === null || typeof e.code === 'string')) throw new Error(`item ${e.id} has no code and no null`)
  if (e.type === 'avatar' && (typeof e.look !== 'object' || e.look === null)) throw new Error(`avatar ${e.id} has no look`)
}

/** The entry as today's server writes it: its code guarded afresh and, for an action or a thing, its Finnish name. */
function fresh(e: Entry): Entry {
  if (e.type === 'action') return { ...e, nameFi: finnishName(e), guarded: mustGuard('action', e.code) }
  if (e.type === 'item') return { ...e, nameFi: finnishName(e), guarded: e.code === null ? null : mustGuard('model', e.code), tickGuarded: e.tick === null ? null : mustGuard('tick', e.tick) }
  return e
}

/**
 * Whether a phrase's plan uses this made thing, so forgetting the thing forgets the phrase too.
 * A starting avatar's entry is only its changed look: forgetting it changes the look back, and
 * the avatar and its phrases stay.
 */
function uses(phrase: PhraseEntry, type: Entry['type'], id: string): boolean {
  return !(type === 'avatar' && CAST.some((c) => c.id === id)) && planUses(phrase.plan, type, id)
}

export class Store {
  /**
   * `prompt` stamps each phrase saved with the interpreter prompt that made its plan; a phrase
   * without it, or with another, is left out and words are understood afresh (a better prompt
   * no longer replays what an older one got wrong). Without a stamp every phrase is kept.
   */
  constructor(
    readonly dir: string,
    private readonly warn: (message: string) => void,
    private readonly prompt?: string,
  ) {}

  private file(type: Entry['type'], id: string): string {
    return path.join(this.dir, FOLDER[type], `${safeId(id)}.json`)
  }

  /** Writes through a temporary file, so a half-written file is never read. */
  private write(file: string, data: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tmp = `${file}.${process.pid}.tmp`
    fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`)
    fs.renameSync(tmp, file)
  }

  private get phrasesFile(): string {
    return path.join(this.dir, 'phrases.json')
  }

  /** The phrases that play today, and how many phrases.json holds in all (the rest are from before the game had two languages, or from another interpreter prompt). */
  private phrases(): { kept: PhraseEntry[]; all: number } {
    const data: unknown = fs.existsSync(this.phrasesFile) ? JSON.parse(fs.readFileSync(this.phrasesFile, 'utf8')) : []
    const all = Array.isArray(data) ? (data as PhraseEntry[]) : []
    return { kept: all.filter((p) => playsToday(p) && (this.prompt === undefined || p.prompt === this.prompt)), all: all.length }
  }

  /**
   * Everything made so far, oldest first. A file that cannot be read or guarded is left out and
   * named in a warning; one that cannot be written back (a read-only library, a full disk) is
   * still served, brought up to date, with a warning.
   */
  read(): LibraryData {
    const entries = <T extends Entry>(type: T['type']): T[] => {
      const folder = path.join(this.dir, FOLDER[type])
      if (!fs.existsSync(folder)) return []
      const out: T[] = []
      for (const name of fs.readdirSync(folder).filter((n) => n.endsWith('.json')).sort()) {
        try {
          const e = JSON.parse(fs.readFileSync(path.join(folder, name), 'utf8')) as T
          if (e.type !== type) throw new Error(`a ${String(e.type)} entry in ${FOLDER[type]}/`)
          checkEntry(e)
          const now = fresh(e) as T
          if (JSON.stringify(now) !== JSON.stringify(e)) {
            try {
              this.write(path.join(folder, name), now)
            } catch (err) {
              this.warn(`library: could not bring ${FOLDER[type]}/${name} up to date: ${(err as Error).message}`)
            }
          }
          out.push(now)
        } catch (err) {
          this.warn(`library: left out ${FOLDER[type]}/${name}: ${(err as Error).message}`)
        }
      }
      return out.sort((a, b) => a.made.localeCompare(b.made))
    }
    const { kept, all } = this.phrases()
    if (kept.length !== all) {
      try {
        this.write(this.phrasesFile, kept)
      } catch (err) {
        this.warn(`library: could not bring phrases.json up to date: ${(err as Error).message}`)
      }
    }
    return { items: entries('item'), actions: entries('action'), avatars: entries('avatar'), phrases: kept }
  }

  /** Saves an entry (replacing one with the same id) or a phrase (replacing the same words), and returns it as saved. Throws on an entry or a phrase the page could not use, or code the guard refuses. */
  save(req: SaveRequest): SaveRequest {
    if ('entry' in req) {
      checkEntry(req.entry)
      const entry = { ...fresh(req.entry), id: safeId(req.entry.id) }
      this.write(this.file(req.entry.type, req.entry.id), entry)
      return { entry }
    }
    const { phrase } = req
    if (typeof phrase.words !== 'string' || !phrase.words.trim() || typeof phrase.plan !== 'object' || phrase.plan === null) throw new Error('a phrase needs words and a plan')
    if (!playsToday(phrase)) throw new Error("a phrase's plan needs its line in Finnish too (heardFi)")
    const stamped = this.prompt === undefined ? phrase : { ...phrase, prompt: this.prompt }
    this.write(this.phrasesFile, [...this.phrases().kept.filter((p) => p.words !== phrase.words), stamped])
    return { phrase: stamped }
  }

  /** Forgets a made thing and the phrases that use it. Returns whether there was such a thing. */
  forget(req: ForgetRequest): boolean {
    if (!(req.type in FOLDER)) throw new Error(`unknown entry type ${JSON.stringify(req.type)}`)
    const file = this.file(req.type, req.id)
    const existed = fs.existsSync(file)
    fs.rmSync(file, { force: true })
    const id = safeId(req.id)
    const { kept, all } = this.phrases()
    const left = kept.filter((p) => !uses(p, req.type, id))
    if (left.length !== all) this.write(this.phrasesFile, left)
    return existed
  }

  /** One line of the parent's log, stamped with the time. */
  log(line: Record<string, unknown>): void {
    fs.mkdirSync(this.dir, { recursive: true })
    fs.appendFileSync(path.join(this.dir, 'log.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`)
  }
}
