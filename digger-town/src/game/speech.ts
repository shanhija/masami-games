/**
 * Speech to `Spoken`: a pure grammar with no model behind it, the same machinery for both
 * languages. The recognizer's text is lower-cased and cut into clauses, and each word is matched
 * against the language's table after a fold that undoes a small child's way of saying some
 * letters. Each language's words and rules are its own: `speechFi.ts` and `speechEn.ts`.
 */
import type { Lang } from '../../../profiles/src/lang'
import type { MachineKind, PlaceId, Spoken, SpokenMove, SpokenWork } from './model'
import { ENGLISH } from './speechEn'
import { FINNISH } from './speechFi'

export type Flag = 'stop' | 'honk' | 'come' | 'help'

/** What a word means in the game. */
export type Meaning = { machine: MachineKind } | { move: SpokenMove } | { work: SpokenWork } | { flag: Flag } | { place: PlaceId }

/** A word of a language's table: its stems match the folded word, as the language lets a stem be followed; its raw words match the lower-case word exactly, and win outright. */
export type Entry = Meaning & { stems?: string; raw?: string }

/** How a clause names a machine: as where to go, as the one to get into, or plainly (the one to drive). */
export type Form = 'to' | 'into' | 'plain'

/** A language's words and rules. */
export interface Grammar {
  table: readonly Entry[]
  /** Words said together, matched first on the raw words: what they mean, or null for nothing at all ("let's play"). */
  phrases: readonly { words: string; means: Meaning | null }[]
  /** Letters folded to others on the table and the words alike: what a small child says for them. Doubled letters always fold to one. */
  letters: Readonly<Record<string, string>>
  /** What may follow a stem in a word: anything (Finnish case endings), or one of `endings`, or one of `dropped` in place of the stem's last e or y (English digs, digging, moving, lorries). */
  suffixes: 'any' | { endings: readonly string[]; dropped: readonly string[] }
  /** Folded stems this long match a word one edit away, and this long two. */
  fuzzy: readonly [one: number, two: number]
  /** Words that cut a sentence into clauses. */
  clauseBreak: ReadonlySet<string>
  /** A stop only when it is all a clause says, and when it is all the text, one that waits for the text to stand: a small child starts many sentences with it. */
  no: string
  /** Words a child says all the time that the fuzzy match would take for a command. */
  notACommand: ReadonlySet<string>
  /** Words after a machine's name that are part of it ("rekka auto", "mixer truck"). */
  absorbed: ReadonlySet<string>
  /** Verbs of getting into a machine: with one in the clause, a machine named `into` is the one to drive, and the verb is no move. */
  jumpIn: ReadonlySet<string>
  /** Raw words that mean something else once another word of the clause has matched. */
  later: ReadonlyMap<string, Meaning>
  /** How the clause names the machine in `tokens[at]` up to `after` (`raw` is its last word), and where the clause goes on from. */
  form(tokens: readonly string[], at: number, after: number, raw: string): { form: Form; next: number }
}

/** Machine before verb before place when everything else ties. */
const rankOf = (m: Meaning) => ('machine' in m ? 0 : 'place' in m ? 2 : 1)

function meaningOf(e: Entry): Meaning {
  if ('machine' in e) return { machine: e.machine }
  if ('move' in e) return { move: e.move }
  if ('work' in e) return { work: e.work }
  if ('flag' in e) return { flag: e.flag }
  return { place: e.place }
}

interface Stem {
  stem: string
  means: Meaning
  rank: number
}

/** A grammar made ready: its stems folded, its raw words in a map, its phrases longest first. */
interface Ready {
  g: Grammar
  fold: (word: string) => string
  stems: Stem[]
  /** Pairs join machine and place stems only. */
  pairStems: Stem[]
  raws: Map<string, Meaning[]>
  phrases: { words: string[]; means: Meaning | null }[]
  absorbed: Set<string>
}

function ready(g: Grammar): Ready {
  const fold = (word: string) => {
    let out = ''
    for (const ch of word) {
      const c = g.letters[ch] ?? ch
      if (c !== out[out.length - 1]) out += c
    }
    return out
  }
  const split = (words: string | undefined) => (words ?? '').split(' ').filter(Boolean)
  const stems = g.table.flatMap((e) => split(e.stems).map((s) => ({ stem: fold(s), means: meaningOf(e), rank: rankOf(e) })))
  const raws = new Map<string, Meaning[]>()
  for (const e of g.table) for (const r of split(e.raw)) raws.set(r, [...(raws.get(r) ?? []), meaningOf(e)])
  return {
    g,
    fold,
    stems,
    pairStems: stems.filter((s) => 'machine' in s.means || 'place' in s.means),
    raws,
    phrases: g.phrases.map((p) => ({ words: split(p.words), means: p.means })).sort((a, b) => b.words.length - a.words.length),
    absorbed: new Set([...g.absorbed].map(fold)),
  }
}

const GRAMMARS: Record<Lang, Ready> = { fi: ready(FINNISH), en: ready(ENGLISH) }

function lev(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)))
    prev = row
  }
  return prev[b.length]
}

/** Whether a folded word is the folded stem followed only by what the language lets follow it. */
function bare(g: Grammar, stem: string, word: string): boolean {
  const s = g.suffixes
  if (s === 'any') return word.startsWith(stem)
  if (word === stem || (word.startsWith(stem) && s.endings.includes(word.slice(stem.length)))) return true
  const base = stem.slice(0, -1)
  return /[ey]$/.test(stem) && word.startsWith(base) && s.dropped.includes(word.slice(base.length))
}

/** How far a folded word is from a folded stem: 0 for a match, one or two edits for a long enough stem, else Infinity. Finnish compares the word's first letters (its ending is free), English the word less an ending. */
function distance(g: Grammar, stem: string, word: string): number {
  if (bare(g, stem, word)) return 0
  const [one, two] = g.fuzzy
  const n = stem.length
  if (n < one) return Infinity
  const max = n >= two ? 2 : 1
  let best = Infinity
  const s = g.suffixes
  if (s === 'any') for (let k = n - max; k <= Math.min(word.length, n + max); k++) best = Math.min(best, lev(stem, word.slice(0, k)))
  else for (const e of ['', ...s.endings]) if (word.endsWith(e)) best = Math.min(best, lev(stem, word.slice(0, word.length - e.length)))
  return best <= max ? best : Infinity
}

type Ref = { machine: MachineKind; form: Form } | { place: PlaceId }

function parseClause(tokens: string[], r: Ready): Spoken {
  const g = r.g
  const out: Spoken = { who: null, move: null, work: null, to: null, come: false, honk: false, stop: false, help: false }
  if (tokens.every((t) => t === g.no)) {
    out.stop = true
    return out
  }
  const jumps = tokens.some((t) => g.jumpIn.has(t))
  const refs: Ref[] = []
  const moves: { v: SpokenMove; raw: string }[] = []
  let seen = false
  let i = 0
  while (i < tokens.length) {
    const raw = tokens[i]
    let used = 1
    let hits: { means: Meaning; raw: string }[] = []
    const phrase = r.phrases.find((p) => p.words.every((w, k) => tokens[i + k] === w))
    if (phrase !== undefined) {
      used = phrase.words.length
      if (phrase.means !== null) hits = [{ means: phrase.means, raw: tokens[i + used - 1] }]
    } else {
      // A pair: the recognizer split a compound, or the language names a thing in two words.
      if (i + 1 < tokens.length) {
        const first = r.fold(raw)
        const joined = r.fold(raw + tokens[i + 1])
        let best: Stem | null = null
        for (const s of r.pairStems) if (s.stem.length > first.length && bare(g, s.stem, joined) && (best === null || s.stem.length > best.stem.length)) best = s
        if (best !== null) {
          hits = [{ means: best.means, raw: tokens[i + 1] }]
          used = 2
        }
      }
      if (hits.length === 0) hits = (r.raws.get(raw) ?? []).map((means) => ({ means, raw }))
      if (hits.length === 0 && !g.notACommand.has(raw)) {
        const folded = r.fold(raw)
        let best: { d: number; len: number; rank: number; means: Meaning } | null = null
        for (const s of r.stems) {
          const d = distance(g, s.stem, folded)
          if (d === Infinity) continue
          if (best === null || d < best.d || (d === best.d && (s.stem.length > best.len || (s.stem.length === best.len && s.rank < best.rank)))) best = { d, len: s.stem.length, rank: s.rank, means: s.means }
        }
        if (best !== null) hits = [{ means: best.means, raw }]
      }
      const later = g.later.get(raw)
      if (later !== undefined && seen) hits = [{ means: later, raw }]
    }
    seen ||= hits.length > 0
    let next = i + used
    for (const h of hits) {
      const w = h.means
      if ('machine' in w) {
        let j = i + used
        if (j < tokens.length && r.absorbed.has(r.fold(tokens[j]))) j++
        const named = g.form(tokens, i, j, h.raw)
        refs.push({ machine: w.machine, form: named.form })
        next = Math.max(next, named.next)
      } else if ('place' in w) refs.push({ place: w.place })
      else if ('move' in w) moves.push({ v: w.move, raw: h.raw })
      else if ('work' in w) out.work ??= w.work
      else out[w.flag] = true
    }
    i = next
  }
  let jumpUsed = false
  for (const ref of refs) {
    if ('place' in ref) out.to = ref.place
    // The same machine named again, or its own job as a verb ("jyrä jyrää", "roller roll"): nowhere to go.
    else if (ref.machine === out.who) continue
    else if (ref.form === 'into' && jumps && out.who === null) {
      out.who = ref.machine
      jumpUsed = true
    } else if (ref.form === 'plain' && out.who === null) out.who = ref.machine
    else out.to = ref.machine
  }
  const spoken = moves.filter((m) => !(jumpUsed && g.jumpIn.has(m.raw)))
  out.move = (spoken.find((m) => m.v !== 'forward') ?? spoken[0])?.v ?? null
  return out
}

/** The part names of a clause, as the commit rule counts them: `who:digger`, `move:left`, `work:take`, `to:sand`, `come`, `honk`, `stop`, `help`. */
export function partsOf(spoken: Spoken): string[] {
  const parts: string[] = []
  if (spoken.who !== null) parts.push(`who:${spoken.who}`)
  if (spoken.move !== null) parts.push(`move:${spoken.move}`)
  if (spoken.work !== null) parts.push(`work:${spoken.work}`)
  if (spoken.to !== null) parts.push(`to:${spoken.to}`)
  if (spoken.come) parts.push('come')
  if (spoken.honk) parts.push('honk')
  if (spoken.stop) parts.push('stop')
  if (spoken.help) parts.push('help')
  return parts
}

/** The words of a text, lower-cased with no punctuation; an apostrophe joins its word ("let's" is "lets"). */
export const wordsOf = (text: string) => text.toLowerCase().replace(/['’]/g, '').split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Only the language's "no" ("ei", "no"), once or more: a stop, but a small child starts many sentences with it. */
export function isBareNo(text: string, lang: Lang): boolean {
  const tokens = wordsOf(text)
  return tokens.length > 0 && tokens.every((t) => t === GRAMMARS[lang].g.no)
}

/** One clause per `Spoken`, in order; a clause that means nothing is left out. */
export function parseSpeech(text: string, lang: Lang): Spoken[] {
  const r = GRAMMARS[lang]
  const clauses: string[][] = [[]]
  for (const t of wordsOf(text)) {
    if (r.g.clauseBreak.has(t)) clauses.push([])
    else clauses[clauses.length - 1].push(t)
  }
  return clauses.filter((c) => c.length > 0).map((c) => parseClause(c, r)).filter((s) => partsOf(s).length > 0)
}

/** The clauses of the recognizer's top alternative; only if it means nothing, those of the first alternative that does. */
export function parseBest(alternatives: string[], lang: Lang): Spoken[] {
  for (const alt of alternatives) {
    const clauses = parseSpeech(alt, lang)
    if (clauses.length > 0) return clauses
  }
  return []
}
