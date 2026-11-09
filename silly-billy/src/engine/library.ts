/**
 * The library at play time: every item kind with its built model, every action ready to run,
 * the avatars and the phrases heard before. Built-ins come from content/; made things come
 * from the dev server (or, in the static build, from silly-billy/library/*.json) as entries
 * whose guarded code is compiled here (engine/sandbox.ts).
 *
 * CONTRACT (the engine builds this file; others import it). Bodies marked "not built yet"
 * are filled in by the engine work; the signatures stay.
 */

import type { ActionFn, TickFn } from './api'
import { buildRecipe, roughRecipe, type Kit } from './kit'
import type { ActionEntry, AvatarEntry, ItemEntry, Param, PhraseEntry } from './protocol'
import { compileAction, compileModel, compileTick, describeError, resetGuard } from './sandbox'
import type { ItemInfo, Recipe, Vec3 } from './types'
import { matchWordForm, type MatchForm } from './words'

/** A thing the game ships with: its model is TypeScript against the same kit. */
export interface BuiltinItem {
  id: string
  name: string
  /** The name in Finnish, nominative: 'pallo'. */
  nameFi: string
  calls: string[]
  about: string
  build: (m: Kit) => unknown
  tick?: TickFn
}

/** A basic verb the game ships with. */
export interface BuiltinAction {
  id: string
  name: string
  /** The name in Finnish, as a child says it to someone: 'hyppää'. */
  nameFi: string
  calls: string[]
  about: string
  params: Param[]
  run: ActionFn
}

export interface LibItem {
  id: string
  name: string
  nameFi: string
  calls: string[]
  about: string
  info: ItemInfo
  tick: TickFn | null
  /** The stored entry, or null for a built-in. */
  entry: ItemEntry | null
}

export interface LibAction {
  id: string
  name: string
  nameFi: string
  calls: string[]
  about: string
  params: Param[]
  run: ActionFn
  entry: ActionEntry | null
}

export type AddResult = { ok: true } | { ok: false; error: string }

/** What the sim measures of a model: its size and how far it reaches from its base point on the ground. */
export function measure(bounds: Recipe['bounds']): { size: Vec3; radius: number } {
  const { min, max } = bounds
  return { size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], radius: Math.max(0.05, -min[0], max[0], -min[2], max[2]) }
}

function infoOf(kind: string, name: string, nameFi: string, recipe: Recipe, rough: boolean): ItemInfo {
  return { kind, name, nameFi, recipe, ...measure(recipe.bounds), rough }
}

/** What a thing is called, for the kit's guess at whether it is food. */
export const namesOf = (e: { id: string; name: string; nameFi?: unknown; calls: readonly string[] }): string[] => [e.id, e.name, ...(typeof e.nameFi === 'string' ? [e.nameFi] : []), ...e.calls]

/** A stored entry's Finnish name: its own, else its first call (the interpreter lists the Finnish ones first), else its name. */
function nameFiOf(entry: { name: string; nameFi?: unknown; calls: readonly string[] }): string {
  if (typeof entry.nameFi === 'string' && entry.nameFi.trim() !== '') return entry.nameFi.trim()
  return entry.calls.find((c) => c.trim() !== '')?.trim() ?? entry.name
}

/** For a kind nobody has made: a 0.4 m purple box with a yellow question mark of boxes on every side. */
function mysteryBox(m: Kit) {
  m.box(0.4, 0.4, 0.4, { at: [0, 0.2, 0], color: '#9b5fd3' })
  const yellow = '#f5d33b'
  // [x, y, w, h] in the face's plane, y from the box's bottom.
  const marks = [
    [0, 0.315, 0.13, 0.04],
    [-0.075, 0.285, 0.04, 0.05],
    [0.075, 0.27, 0.04, 0.09],
    [0.035, 0.215, 0.05, 0.04],
    [0, 0.17, 0.04, 0.06],
    [0, 0.085, 0.045, 0.045],
  ]
  for (let side = 0; side < 4; side++) {
    const a = (side * Math.PI) / 2
    for (const [x, y, w, h] of marks) m.box(w!, h!, 0.02, { at: [Math.sin(a) * 0.2 + Math.cos(a) * x!, y!, Math.cos(a) * 0.2 - Math.sin(a) * x!], rot: [0, a, 0], color: yellow })
  }
  return { carry: 'hand', bouncy: 0.4, solid: false }
}

export class Library {
  readonly items = new Map<string, LibItem>()
  readonly actions = new Map<string, LibAction>()
  readonly avatars = new Map<string, AvatarEntry>()
  /** Keyed by the normalised words. */
  readonly phrases = new Map<string, PhraseEntry>()
  /** Bumps on every change, for the HUD and the scene to notice. */
  version = 0

  private readonly builtinItems = new Map<string, LibItem>()
  private readonly builtinActions = new Map<string, LibAction>()
  private readonly mysteryRecipe = buildRecipe(mysteryBox, []).recipe
  private readonly mystery = new Map<string, ItemInfo>()
  /** Words already matched, for this version. */
  private readonly matched = { items: new Map<string, { id: string; form: MatchForm } | null>(), actions: new Map<string, { id: string; form: MatchForm } | null>(), version: -1 }

  constructor(builtins: { items: BuiltinItem[]; actions: BuiltinAction[] }) {
    for (const b of builtins.items) {
      const item: LibItem = { id: b.id, name: b.name, nameFi: b.nameFi, calls: b.calls, about: b.about, info: infoOf(b.id, b.name, b.nameFi, buildRecipe(b.build, namesOf(b)).recipe, false), tick: b.tick ?? null, entry: null }
      this.builtinItems.set(b.id, item)
      this.items.set(b.id, item)
    }
    for (const b of builtins.actions) {
      const action: LibAction = { id: b.id, name: b.name, nameFi: b.nameFi, calls: b.calls, about: b.about, params: b.params, run: b.run, entry: null }
      this.builtinActions.set(b.id, action)
      this.actions.set(b.id, action)
    }
  }

  /** What the sim and the scene know about a kind. An unknown kind gets a small purple mystery box, so nothing breaks. */
  info(kind: string): ItemInfo {
    const item = this.items.get(kind)
    if (item) return item.info
    let info = this.mystery.get(kind)
    if (!info) {
      info = infoOf(kind, kind, kind, this.mysteryRecipe, false)
      this.mystery.set(kind, info)
    }
    return info
  }

  /** Adds or replaces a made item: the draft recipe if it has no code yet, else its compiled model. Returns why it failed. */
  addItem(entry: ItemEntry): AddResult {
    try {
      let recipe: Recipe
      let tick: TickFn | null = null
      if (entry.code === null) recipe = roughRecipe(entry.rough ?? [], entry.roughMeta ?? {}, namesOf(entry))
      else {
        if (entry.guarded === null) throw new Error('the model has no guarded code')
        const build = compileModel(entry.guarded)
        resetGuard()
        recipe = buildRecipe(build, namesOf(entry)).recipe
        if (entry.tickGuarded !== null) tick = compileTick(entry.tickGuarded)
      }
      const nameFi = nameFiOf(entry)
      this.items.set(entry.id, { id: entry.id, name: entry.name, nameFi, calls: entry.calls, about: entry.about, info: infoOf(entry.id, entry.name, nameFi, recipe, entry.code === null), tick, entry })
      this.mystery.delete(entry.id)
      this.version++
      return { ok: true }
    } catch (e) {
      return { ok: false, error: describeError(e) }
    }
  }

  addAction(entry: ActionEntry): AddResult {
    try {
      const run = compileAction(entry.guarded)
      this.actions.set(entry.id, { id: entry.id, name: entry.name, nameFi: nameFiOf(entry), calls: entry.calls, about: entry.about, params: entry.params, run, entry })
      this.version++
      return { ok: true }
    } catch (e) {
      return { ok: false, error: describeError(e) }
    }
  }

  addAvatar(entry: AvatarEntry): void {
    this.avatars.set(entry.id, entry)
    this.version++
  }

  addPhrase(entry: PhraseEntry): void {
    this.phrases.set(entry.words, entry)
    this.version++
  }

  /** Forgets a made thing (built-ins stay). */
  forget(type: 'item' | 'action' | 'avatar', id: string): void {
    if (type === 'item') {
      const builtin = this.builtinItems.get(id)
      if (builtin) this.items.set(id, builtin)
      else this.items.delete(id)
    } else if (type === 'action') {
      const builtin = this.builtinActions.get(id)
      if (builtin) this.actions.set(id, builtin)
      else this.actions.delete(id)
    } else this.avatars.delete(id)
    this.version++
  }

  /**
   * The item kind a word means: its id, its name in either language or one of its calls, Finnish
   * endings allowed, or one letter off one of them. `near: false` leaves out the one-letter-off
   * guesses (the parser is not sure of those). Null if none.
   */
  itemKindFor(word: string, opts?: { near?: boolean }): string | null {
    return this.pick(this.match('items', word), opts)
  }

  /** The action a word means, the same way. */
  actionFor(word: string, opts?: { near?: boolean }): string | null {
    return this.pick(this.match('actions', word), opts)
  }

  /** How a word fits an item kind or an action: exactly, with a Finnish ending, or one letter off ('near'). Null if it fits none. */
  matchForm(what: 'items' | 'actions', word: string): { id: string; form: MatchForm } | null {
    return this.match(what, word)
  }

  private pick(m: { id: string; form: MatchForm } | null, opts?: { near?: boolean }): string | null {
    return m === null || (m.form === 'near' && opts?.near === false) ? null : m.id
  }

  private match(what: 'items' | 'actions', word: string): { id: string; form: MatchForm } | null {
    if (this.matched.version !== this.version) {
      this.matched.items.clear()
      this.matched.actions.clear()
      this.matched.version = this.version
    }
    const cache = this.matched[what]
    let m = cache.get(word)
    if (m === undefined) {
      const entries = [...this[what].values()].map((e) => ({ id: e.id, words: [e.id, e.name, e.nameFi, ...e.calls] }))
      m = matchWordForm(word, entries)
      if (cache.size > 500) cache.clear()
      cache.set(word, m)
    }
    return m
  }
}
