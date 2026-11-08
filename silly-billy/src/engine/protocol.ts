/**
 * What goes between the page, the dev server and the disk: the interpreter's plan, the
 * library's entries, and the server's requests and replies. Plain data only. The JSON
 * schemas the models answer in are built from these shapes in `server/prompts.ts`.
 */

import type { RoughShape } from './kit'
import type { BodyKind, ItemMeta, Look, Pronoun, RoomId } from './types'

// ------------------------------------------------------------------------------ the plan

/** What kind of thing a param takes. 'thing' is an actor or an item; 'place' is a thing or a spot on the ground. */
export type ParamKind = 'actor' | 'item' | 'thing' | 'place' | 'text' | 'number'
export const PARAM_KINDS: readonly ParamKind[] = ['actor', 'item', 'thing', 'place', 'text', 'number']

export interface Param {
  /** A short lowercase English word: 'thing', 'target', 'partner', 'words'. */
  name: string
  kind: ParamKind
  about: string
  optional: boolean
}

/** One argument, still as words: an actor id, an item kind or instance ('#i3'), a place ('x,z'), text or a number. */
export interface Arg {
  name: string
  value: string
}

export interface PlanStep {
  /** The actor id. */
  who: string
  /** An action id in the library or in the plan's newActions. */
  action: string
  args: Arg[]
}

/** An action nobody has made yet: the interpreter names it, the designer writes it. */
export interface NewAction {
  /** Short English kebab-case: 'throw', 'ride', 'dance-with'. */
  id: string
  name: string
  /** The name in Finnish, as a child would say it to someone: 'heitä', 'aja', 'tanssi'. */
  nameFi: string
  /** Words a child would say for it, lowercase: Finnish forms and the English word. */
  calls: string[]
  /** What the actor does, step by step, in a sentence or two. */
  about: string
  params: Param[]
}

/** A thing nobody has made yet: the interpreter's quick draft now, the designer's model later. */
export interface NewItem {
  /** Short English kebab-case: 'bicycle', 'christmas-tree', 'magic-wand'. */
  id: string
  name: string
  /** The name in Finnish, nominative: 'polkupyörä', 'joulukuusi', 'taikasauva'. */
  nameFi: string
  calls: string[]
  /** What it looks like: shape, parts, colours. */
  about: string
  rough: RoughShape[]
  meta: Partial<ItemMeta>
}

/** What may change about an avatar's body; worn things are 'wear' steps. */
export interface LookChange {
  body?: BodyKind
  height?: number
  build?: number
  skin?: string
  eyes?: string
  top?: string
  bottom?: string
  shoes?: string
  skirt?: boolean
}

export interface NewAvatar {
  /** Lowercase ascii: 'ella'. */
  id: string
  name: string
  calls: string[]
  pronoun: Pronoun
  look: LookChange
}

/** The interpreter's answer: who does what, and what has to be made first. */
export interface Plan {
  /** The command as understood, in short English, shown when the game is played in English. */
  heard: string
  /** The same in short simple Finnish, shown when the game is played in Finnish. */
  heardFi: string
  who: string[]
  steps: PlanStep[]
  newActions: NewAction[]
  newItems: NewItem[]
  /** A new avatar to make before the steps. */
  create?: NewAvatar
  /** Everyone goes to this room before the steps. */
  room?: RoomId
  /** The avatar's answer: 1 to 4 simple words in English and the same in Finnish; the bubble shows and the voice says the game's language. */
  say: string
  sayFi: string
}

// ------------------------------------------------------------------------------ the library on disk

export type MadeBy = 'haiku' | 'opus'

export interface ItemEntry {
  type: 'item'
  id: string
  name: string
  nameFi: string
  calls: string[]
  about: string
  /** The designer's model code (the body of function (m)), or null while only the draft exists. */
  code: string | null
  /** The same with the loop guards in, as a whole function expression (server/guard.ts). */
  guarded: string | null
  tick: string | null
  tickGuarded: string | null
  /** The interpreter's draft, kept until the model arrives. */
  rough: RoughShape[] | null
  roughMeta: Partial<ItemMeta> | null
  by: MadeBy
  /** The words that asked for it. */
  asked: string
  /** ISO time. */
  made: string
}

export interface ActionEntry {
  type: 'action'
  id: string
  name: string
  nameFi: string
  calls: string[]
  about: string
  params: Param[]
  code: string
  guarded: string
  by: MadeBy
  asked: string
  made: string
}

/** A made avatar, or a starting one whose look the child changed. */
export interface AvatarEntry {
  type: 'avatar'
  id: string
  name: string
  calls: string[]
  pronoun: Pronoun
  look: Look
  asked: string
  made: string
}

/** Words heard before, normalised, and the plan they made: next time no model is asked. */
export interface PhraseEntry {
  words: string
  plan: Plan
  made: string
}

export type Entry = ItemEntry | ActionEntry | AvatarEntry

export interface LibraryData {
  items: ItemEntry[]
  actions: ActionEntry[]
  avatars: AvatarEntry[]
  phrases: PhraseEntry[]
}

// ------------------------------------------------------------------------------ the dev server's API, under <game>/api/

export type WhisperState = 'ready' | 'starting' | 'off' | 'missing' | 'failed'

/** GET api/status */
export interface Status {
  /** The Claude Code CLI was found: interpreting and inventing work. */
  claude: boolean
  whisper: WhisperState
  models: { interpret: string; invent: string }
}

/** POST api/hear?lang=fi[&partial=1][&prime=...], body: 16 kHz mono 16-bit WAV. prime: a sentence in that language with the avatars' names, which Whisper is primed with. */
export interface HearReply {
  text: string
  ms: number
}

/** POST api/interpret */
export interface InterpretRequest {
  words: string
  lang: 'fi' | 'en'
  /** What the interpreter needs to know, as the page wrote it (brain/context.ts). */
  context: string
}

export interface InterpretReply {
  plan: Plan
  ms: number
}

/** POST api/invent: the reply is NDJSON lines (InventLine), ending with done or error. */
export type InventRequest = {
  /** The child's words that asked for it. */
  words: string
  context: string
  /** A first try that failed validation: its code and what went wrong. */
  fix?: { code: string; error: string }
} & ({ kind: 'action'; spec: NewAction } | { kind: 'item'; spec: NewItem })

export type InventLine = { progress: number } | { done: ActionEntry | ItemEntry; ms: number } | { error: string }

/** POST api/library: { entry } or { phrase }; DELETE-like POST api/forget: { type, id }. */
export type SaveRequest = { entry: Entry } | { phrase: PhraseEntry }
export interface ForgetRequest {
  type: Entry['type']
  id: string
}

/** POST api/log: one line for the parent's log of what was said and done. */
export interface LogLine {
  kind: string
  [key: string]: unknown
}

// ------------------------------------------------------------------------------ rules both sides keep

/** An id the way the dev server stores it: lowercase a-z, 0-9 and single dashes ('Joulu Kuusi!' → 'joulu-kuusi', 'hörökorva' → 'horokorva'); '' when nothing is left. */
export const slugOf = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/**
 * Whether a phrase's plan uses a made thing: a made action in a step, a made thing in an arg, a
 * made avatar among who. The page and the dev server forget phrases by this one rule; a starting
 * avatar's entry is only its changed look, so the callers keep that avatar's phrases.
 */
export function planUses(plan: Plan, type: Entry['type'], id: string): boolean {
  if (type === 'action') return plan.steps.some((s) => slugOf(s.action) === id)
  if (type === 'item') return plan.steps.some((s) => s.args.some((a) => slugOf(a.value) === id))
  return plan.who.includes(id)
}
