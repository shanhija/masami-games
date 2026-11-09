/**
 * The library on disk, in a temporary folder: entries and phrases go in and come back, code is
 * guarded again on reading, a library from before the game had two languages is brought up to
 * date, ids become safe file names, forgetting takes the phrases that used the thing along, and
 * a broken file is left out with a warning instead of breaking the rest.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ActionEntry, AvatarEntry, ItemEntry, PhraseEntry, Plan } from '../engine/protocol'
import { guard } from './guard'
import { Store, finnishName, safeId } from './store'

const MADE = '2026-11-08T10:00:00.000Z'

const action: ActionEntry = {
  type: 'action',
  id: 'throw',
  name: 'throw',
  nameFi: 'heitä',
  calls: ['heitä', 'throw'],
  about: 'Picks the thing up and throws it at the target.',
  params: [
    { name: 'thing', kind: 'item', about: 'what to throw', optional: false },
    { name: 'target', kind: 'thing', about: 'who to throw at', optional: true },
  ],
  code: 'yield* me.pickUp(args.thing)\nw.throw(args.thing, args.target)\nyield* me.rest()',
  guarded: 'stale',
  by: 'opus',
  asked: 'alis heitä pallo stiiville',
  made: MADE,
}

const item: ItemEntry = {
  type: 'item',
  id: 'bicycle',
  name: 'bicycle',
  nameFi: 'polkupyörä',
  calls: ['pyörä', 'bicycle'],
  about: 'A red bike with two big black wheels.',
  code: "m.box(0.1, 0.1, 1.2, { at: [0, 0.5, 0], color: 'red' })\nreturn { ride: true }",
  guarded: 'stale',
  tick: 'it.state.turns = (it.state.turns || 0) + dt',
  tickGuarded: null,
  rough: [{ shape: 'box', size: [0.1, 0.6, 1.4], at: [0, 0.3, 0], color: 'red' }],
  roughMeta: { ride: true },
  by: 'opus',
  asked: 'steve aja pyörällä',
  made: '2026-11-08T10:01:00.000Z',
}

const avatar: AvatarEntry = {
  type: 'avatar',
  id: 'ella',
  name: 'Ella',
  calls: ['ella'],
  pronoun: 'she',
  look: { body: 'kid', height: 1.15, build: 1, skin: '#ffd9b3', eyes: '#3b2a20', top: 'pink', bottom: 'purple', shoes: 'white', skirt: true, worn: {} },
  asked: 'tee uusi tyttö',
  made: '2026-11-08T10:02:00.000Z',
}

const plan = (action: string, value: string, who = 'alice'): Plan => ({
  heard: `${who} ${action} ${value}`,
  heardFi: `${who}: ${action} ${value}`,
  who: [who],
  steps: [{ who, action, args: [{ name: 'thing', value }] }],
  newActions: [],
  newItems: [],
  say: 'Okay!',
  sayFi: 'Okei!',
})

const phrase = (words: string, p: Plan): PhraseEntry => ({ words, plan: p, made: MADE })

describe('store', () => {
  let dir: string
  let warnings: string[]
  let store: Store

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-billy-store-'))
    warnings = []
    store = new Store(dir, (m) => warnings.push(m))
  })
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

  it('starts empty, even without a folder', () => {
    expect(new Store(path.join(dir, 'none'), () => {}).read()).toEqual({ items: [], actions: [], avatars: [], phrases: [] })
  })

  it('writes one pretty file per entry and reads them back with fresh guards', () => {
    store.save({ entry: action })
    store.save({ entry: item })
    store.save({ entry: avatar })
    const fresh = { ...action, guarded: (guard('action', action.code) as { guarded: string }).guarded }
    expect(fs.readFileSync(path.join(dir, 'actions', 'throw.json'), 'utf8')).toBe(`${JSON.stringify(fresh, null, 2)}\n`)
    expect(fs.existsSync(path.join(dir, 'items', 'bicycle.json'))).toBe(true)
    expect(fs.existsSync(path.join(dir, 'avatars', 'ella.json'))).toBe(true)

    const data = store.read()
    expect(data.actions).toEqual([{ ...action, guarded: (guard('action', action.code) as { guarded: string }).guarded }])
    expect(data.items[0]!.guarded).toBe((guard('model', item.code!) as { guarded: string }).guarded)
    expect(data.items[0]!.tickGuarded).toBe((guard('tick', item.tick!) as { guarded: string }).guarded)
    expect(data.avatars).toEqual([avatar])
    expect(warnings).toEqual([])
  })

  it('brings a file saved by an older guard up to date when it reads it, and leaves a fresh one alone', () => {
    store.save({ entry: action })
    const file = path.join(dir, 'actions', 'throw.json')
    const fresh = fs.readFileSync(file, 'utf8')
    fs.writeFileSync(file, `${JSON.stringify({ ...action, guarded: 'an older guard' }, null, 2)}\n`)
    store.read()
    expect(fs.readFileSync(file, 'utf8')).toBe(fresh)
    const past = new Date(Date.now() - 60_000)
    fs.utimesSync(file, past, past)
    const before = fs.statSync(file).mtimeMs
    store.read()
    expect(fs.statSync(file).mtimeMs).toBe(before)
  })

  it('still serves a file saved by an older guard when it cannot write it back', () => {
    store.save({ entry: action })
    const file = path.join(dir, 'actions', 'throw.json')
    fs.writeFileSync(file, `${JSON.stringify({ ...action, guarded: 'an older guard' }, null, 2)}\n`)
    // A read-only library or a full disk, even for root: a folder where the write's temporary file would go.
    fs.mkdirSync(`${file}.${process.pid}.tmp`)
    expect(store.read().actions.map((a) => [a.id, a.guarded])).toEqual([['throw', (guard('action', action.code) as { guarded: string }).guarded]])
    expect(warnings).toEqual([expect.stringContaining('library: could not bring actions/throw.json up to date: ')])
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).guarded).toBe('an older guard')
  })

  it("saves the guard's code, never the page's, and refuses code the guard refuses", () => {
    // The build ships the saved files as they are: a page (or another site) must not put unguarded code there.
    store.save({ entry: { ...action, guarded: 'function* () { while (true) {} }' } })
    store.save({ entry: { ...item, tickGuarded: 'function () { while (true) {} }' } })
    const saved = (folder: string, id: string) => JSON.parse(fs.readFileSync(path.join(dir, folder, `${id}.json`), 'utf8')) as Record<string, unknown>
    expect(saved('actions', 'throw').guarded).toBe((guard('action', action.code) as { guarded: string }).guarded)
    expect(saved('items', 'bicycle').tickGuarded).toBe((guard('tick', item.tick!) as { guarded: string }).guarded)
    expect(() => store.save({ entry: { ...action, id: 'escape', code: 'top.location = "https://example.com"' } })).toThrow(/top is not defined/)
    expect(fs.existsSync(path.join(dir, 'actions', 'escape.json'))).toBe(false)
  })

  it('keeps a draft item without code as it is', () => {
    store.save({ entry: { ...item, code: null, guarded: null, tick: null, by: 'haiku' } })
    const [draft] = store.read().items
    expect(draft!.guarded).toBeNull()
    expect(draft!.tickGuarded).toBeNull()
    expect(draft!.rough).toEqual(item.rough)
  })

  it('replaces an entry with the same id and a phrase with the same words', () => {
    store.save({ entry: action })
    store.save({ entry: { ...action, about: 'Throws it higher.' } })
    expect(store.read().actions.map((a) => a.about)).toEqual(['Throws it higher.'])

    store.save({ phrase: phrase('alis heitä pallo', plan('throw', 'ball')) })
    store.save({ phrase: phrase('steve hyppää', plan('jump', '', 'steve')) })
    store.save({ phrase: phrase('alis heitä pallo', plan('throw', 'football')) })
    const words = store.read().phrases.map((p) => `${p.words}: ${p.plan.steps[0]!.args[0]!.value}`)
    expect(words).toEqual(['steve hyppää: ', 'alis heitä pallo: football'])
  })

  it('makes ids into safe file names inside the folder', () => {
    expect(safeId('Joulu Kuusi!')).toBe('joulu-kuusi')
    expect(safeId('hörökorva')).toBe('horokorva')
    expect(safeId('../../etc/Evil Thing')).toBe('etc-evil-thing')
    expect(() => safeId('../..')).toThrow()

    store.save({ entry: { ...action, id: '../../Evil Throw' } })
    expect(fs.readdirSync(path.join(dir, 'actions'))).toEqual(['evil-throw.json'])
    expect(store.read().actions[0]!.id).toBe('evil-throw')
    expect(store.forget({ type: 'action', id: '../../Evil Throw' })).toBe(true)
    expect(fs.readdirSync(path.join(dir, 'actions'))).toEqual([])
  })

  it('forgets a thing and the phrases that use it', () => {
    store.save({ entry: action })
    store.save({ entry: item })
    store.save({ phrase: phrase('alis heitä pallo', plan('throw', 'ball')) })
    store.save({ phrase: phrase('steve aja pyörällä', plan('ride', 'bicycle', 'steve')) })
    store.save({ phrase: phrase('mike hyppää', plan('jump', '', 'mike')) })

    expect(store.forget({ type: 'action', id: 'throw' })).toBe(true)
    expect(store.forget({ type: 'item', id: 'bicycle' })).toBe(true)
    expect(store.forget({ type: 'item', id: 'bicycle' })).toBe(false)
    const data = store.read()
    expect(data.actions).toEqual([])
    expect(data.items).toEqual([])
    expect(data.phrases.map((p) => p.words)).toEqual(['mike hyppää'])
  })

  it("forgets a made avatar's phrases, but keeps a starting avatar's when only its look is forgotten", () => {
    store.save({ entry: { ...avatar, id: 'alice', name: 'Alice', asked: 'alice maalaa itsesi punaiseksi' } })
    store.save({ entry: avatar })
    store.save({ phrase: phrase('alice heitä pallo stevelle', plan('throw', 'ball')) })
    store.save({ phrase: phrase('ella hyppää', plan('jump', '', 'ella')) })

    expect(store.forget({ type: 'avatar', id: 'alice' })).toBe(true)
    expect(store.read().phrases.map((p) => p.words)).toEqual(['alice heitä pallo stevelle', 'ella hyppää'])
    expect(store.forget({ type: 'avatar', id: 'ella' })).toBe(true)
    expect(store.read().phrases.map((p) => p.words)).toEqual(['alice heitä pallo stevelle'])
  })

  it('leaves out a broken file with a warning and reads the rest', () => {
    store.save({ entry: action })
    fs.writeFileSync(path.join(dir, 'actions', 'broken.json'), '{ "type": "action", ')
    fs.writeFileSync(path.join(dir, 'actions', 'bad-code.json'), JSON.stringify({ ...action, id: 'bad-code', code: 'const x = ;' }))
    fs.writeFileSync(path.join(dir, 'actions', 'wrong-folder.json'), JSON.stringify(avatar))
    expect(store.read().actions.map((a) => a.id)).toEqual(['throw'])
    expect(warnings).toHaveLength(3)
    expect(warnings.find((w) => w.includes('bad-code.json'))).toContain('SyntaxError: Unexpected token (line 1)')
  })

  it('refuses entries the page could not use', () => {
    expect(() => store.save({ entry: { ...action, code: undefined } as unknown as ActionEntry })).toThrow(/lacks code/)
    expect(() => store.save({ entry: { ...avatar, type: 'robot' } as unknown as AvatarEntry })).toThrow(/unknown entry type/)
    expect(() => store.save({ phrase: { words: ' ', plan: plan('jump', ''), made: MADE } })).toThrow(/words/)
    expect(() => store.save({ phrase: { words: 'steve hyppää', plan: null as unknown as Plan, made: MADE } })).toThrow(/words and a plan/)
    expect(() => store.forget({ type: 'robot' as 'item', id: 'x' })).toThrow(/unknown entry type/)
  })

  it("refuses a phrase whose plan has no line in Finnish, which the page could not show", () => {
    const { heardFi: _fi, ...english } = plan('jump', '', 'steve')
    expect(() => store.save({ phrase: phrase('steve hyppää', english as Plan) })).toThrow(/heardFi/)
    expect(() => store.save({ phrase: phrase('steve hyppää', { ...english, heardFi: ' ' }) })).toThrow(/heardFi/)
    expect(fs.existsSync(path.join(dir, 'phrases.json'))).toBe(false)
  })

  it('names an action or a thing in Finnish by its first Finnish call when it came without a Finnish name', () => {
    const nameless = <T extends { nameFi: string }>(e: T): Omit<T, 'nameFi'> => {
      const { nameFi: _fi, ...rest } = e
      return rest
    }
    expect(finnishName(nameless(action))).toBe('heitä')
    expect(finnishName({ id: 'slide', name: 'slide', calls: ["liu'u", 'liukua', 'slide'] })).toBe("liu'u")
    // A kind listed only by its id has no Finnish call: its English name stands in.
    expect(finnishName({ id: 'christmas-tree', name: 'christmas tree', calls: ['christmas-tree', 'Christmas Tree'] })).toBe('christmas tree')
    expect(finnishName({ id: 'x', name: 'X', calls: [], nameFi: 3 })).toBe('X')
    expect(finnishName({ ...action, nameFi: ' heitä ' })).toBe('heitä')
    // Saved without one, it is saved with one.
    store.save({ entry: nameless(action) as ActionEntry })
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'actions', 'throw.json'), 'utf8')).nameFi).toBe('heitä')
  })

  it('brings a library from before the game had two languages up to date, quietly, and keeps its actions', () => {
    // As in Sami's library of 2026-11-08: actions with no Finnish name, phrases with no Finnish line.
    const old = (e: ActionEntry | ItemEntry) => {
      const { nameFi: _fi, ...rest } = e
      return { ...rest, guarded: (guard(e.type === 'action' ? 'action' : 'model', e.code!) as { guarded: string }).guarded, ...(e.type === 'item' ? { tickGuarded: (guard('tick', e.tick!) as { guarded: string }).guarded } : {}) }
    }
    fs.mkdirSync(path.join(dir, 'actions'))
    fs.mkdirSync(path.join(dir, 'items'))
    fs.writeFileSync(path.join(dir, 'actions', 'throw.json'), `${JSON.stringify(old(action), null, 2)}\n`)
    fs.writeFileSync(path.join(dir, 'items', 'bicycle.json'), `${JSON.stringify(old(item), null, 2)}\n`)
    const { heardFi: _fi, ...english } = plan('jump', '', 'steve')
    const phrases = [phrase('noora kýp er búinn', { ...english, steps: [{ who: 'noora', action: 'say', args: [{ name: 'words', value: 'Bath ready? Okay!' }] }] } as Plan), phrase('steve hyppää', plan('jump', '', 'steve'))]
    fs.writeFileSync(path.join(dir, 'phrases.json'), JSON.stringify(phrases))

    const data = store.read()
    expect(warnings).toEqual([])
    expect(data.actions.map((a) => [a.id, a.nameFi])).toEqual([['throw', 'heitä']])
    expect(data.items.map((i) => [i.id, i.nameFi])).toEqual([['bicycle', 'pyörä']])
    expect(data.phrases.map((p) => p.words)).toEqual(['steve hyppää'])
    // Written back, so a commit ships them as today's server reads them, and then left alone.
    const saved = JSON.parse(fs.readFileSync(path.join(dir, 'actions', 'throw.json'), 'utf8')) as ActionEntry
    expect(saved).toEqual({ ...old(action), nameFi: 'heitä' })
    expect((JSON.parse(fs.readFileSync(path.join(dir, 'phrases.json'), 'utf8')) as PhraseEntry[]).map((p) => p.words)).toEqual(['steve hyppää'])
    const before = new Map(['actions/throw.json', 'items/bicycle.json', 'phrases.json'].map((f) => [f, fs.readFileSync(path.join(dir, f), 'utf8')]))
    expect(store.read()).toEqual(data)
    for (const [f, text] of before) expect(fs.readFileSync(path.join(dir, f), 'utf8'), f).toBe(text)
  })

  it('reads a phrases.json that is no list as no phrases', () => {
    fs.writeFileSync(path.join(dir, 'phrases.json'), '{}')
    expect(store.read().phrases).toEqual([])
  })

  it('drops the old phrases when it saves or forgets, too', () => {
    const { heardFi: _fi, ...english } = plan('jump', '', 'steve')
    fs.writeFileSync(path.join(dir, 'phrases.json'), JSON.stringify([phrase('steve hyppää', english as Plan), null]))
    store.save({ phrase: phrase('mike hyppää', plan('jump', '', 'mike')) })
    expect((JSON.parse(fs.readFileSync(path.join(dir, 'phrases.json'), 'utf8')) as PhraseEntry[]).map((p) => p.words)).toEqual(['mike hyppää'])
    fs.writeFileSync(path.join(dir, 'phrases.json'), JSON.stringify([phrase('steve hyppää', english as Plan), phrase('mike hyppää', plan('jump', '', 'mike'))]))
    expect(store.forget({ type: 'action', id: 'nothing' })).toBe(false)
    expect((JSON.parse(fs.readFileSync(path.join(dir, 'phrases.json'), 'utf8')) as PhraseEntry[]).map((p) => p.words)).toEqual(['mike hyppää'])
  })

  it("keeps only the phrases the interpreter prompt of today made, stamping each it saves: words an older prompt got wrong are understood afresh", () => {
    // "mikko pudotaan rennassa" was kept as a jump to the pond, "noora rakenna liukumäki kuumajasta" as a rebuilt slide: a better prompt never met them again.
    fs.writeFileSync(path.join(dir, 'phrases.json'), JSON.stringify([phrase('steve hyppää', plan('jump', '', 'steve')), { ...phrase('mike hyppää', plan('jump', '', 'mike')), prompt: 'old' }]))
    const today = new Store(dir, (m) => warnings.push(m), 'new')
    expect(today.read().phrases).toEqual([])
    expect(JSON.parse(fs.readFileSync(path.join(dir, 'phrases.json'), 'utf8'))).toEqual([])
    today.save({ phrase: phrase('alis hyppää', plan('jump', '', 'alice')) })
    expect(today.read().phrases.map((p) => [p.words, p.prompt])).toEqual([['alis hyppää', 'new']])
    // The next prompt understands them afresh; a store with no stamp (the tests of the shipped library) keeps them all.
    expect(new Store(dir, () => {}, 'newer').read().phrases).toEqual([])
    fs.writeFileSync(path.join(dir, 'phrases.json'), JSON.stringify([phrase('steve hyppää', plan('jump', '', 'steve'))]))
    expect(new Store(dir, () => {}).read().phrases.map((p) => p.words)).toEqual(['steve hyppää'])
  })

  it('appends stamped lines to the log', () => {
    store.log({ kind: 'hear', text: 'alis hyppää' })
    store.log({ kind: 'interpret', ms: 2900 })
    const lines = fs.readFileSync(path.join(dir, 'log.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>)
    expect(lines.map((l) => l.kind)).toEqual(['hear', 'interpret'])
    expect(typeof lines[0]!.at).toBe('string')
  })
})
