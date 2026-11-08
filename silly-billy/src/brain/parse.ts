/**
 * The small parser: a child's words understood without a model when they are clear. One
 * avatar (by a name as a recognizer may write it, "hän" or "kaikki"), one known action by its
 * Finnish stems, and the action's params filled by the avatars and things the words name.
 * Words that are less clear go to the interpreter; with no interpreter, the parser's best
 * guess is played anyway, because misunderstanding is part of the fun.
 *
 * Finnish marks who does what with endings: "Alice, heitä pallo Stevelle" has Alice bare (she
 * does it) and Steve with -lle (he gets it). So a bare name before the verb is a doer, a name
 * with an ending fills a param, and a bare name after the verb is a doer only when nobody was
 * named before it ("hyppää Alice").
 *
 * What it understood is said back in both languages, for the line the parent reads: "Steve:
 * give the ball to Alice" and "Eetu: anna pallo Ainolle", the Finnish with the child's own word
 * forms and each name in the form the child put it.
 */

import { colorOf, englishColor } from '../content/colors'
import type { Lang } from '../engine/lang'
import type { LibAction, LibItem } from '../engine/library'
import type { Arg, ParamKind, Plan } from '../engine/protocol'
import { ROOM_GEO } from '../engine/rooms'
import { ROOMS, type Actor, type ItemMeta, type Pronoun, type RoomId, type Slot, type World } from '../engine/types'

/** What the parser and the interpreter's context read from the library. */
export interface Vocabulary {
  readonly actions: ReadonlyMap<string, Pick<LibAction, 'id' | 'name' | 'nameFi' | 'about' | 'params'>>
  /** Every kind, with the slot it is worn in (most are worn nowhere) and how it is carried. */
  readonly items: ReadonlyMap<string, Pick<LibItem, 'id' | 'name' | 'nameFi'> & { readonly info: { readonly recipe: { readonly meta: Pick<ItemMeta, 'wear' | 'carry'> } } }>
  /** The kind a word names; `near: false` leaves out a word only one letter off a known one. */
  itemKindFor(word: string, opts?: { near?: boolean }): string | null
  actionFor(word: string, opts?: { near?: boolean }): string | null
}

/** A stop for these actors, or a plan and whether the parser is sure enough to play it without asking. */
export type Understood = { kind: 'stop'; who: string[] } | { kind: 'plan'; plan: Plan; confident: boolean }

const NUMBERS = new Map([
  ['nolla', '0'], ['yksi', '1'], ['yks', '1'], ['yhden', '1'], ['kaksi', '2'], ['kaks', '2'], ['kolme', '3'], ['neljä', '4'], ['viisi', '5'], ['viis', '5'], ['kuus', '6'],
  ['seitsemän', '7'], ['seittemän', '7'], ['kahdeksan', '8'], ['kaheksan', '8'], ['yhdeksän', '9'], ['yheksän', '9'], ['kymmenen', '10'],
  ['zero', '0'], ['one', '1'], ['two', '2'], ['three', '3'], ['four', '4'], ['five', '5'], ['six', '6'], ['seven', '7'], ['eight', '8'], ['nine', '9'], ['ten', '10'],
])

/** Lowercase, punctuation out, spaces collapsed, numbers as digits ("kuusi" is a spruce too: six only before "kertaa"). Letters typed or pasted as a base and a mark ('a' + '̈') are joined into one first. */
export function normalise(words: string): string {
  const tokens = words
    .normalize('NFC')
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '')
  return tokens.map((w, i) => NUMBERS.get(w) ?? (w === 'kuusi' && /^ker(taa|ran)$/.test(tokens[i + 1] ?? '') ? '6' : w)).join(' ')
}

/** Words that change nothing about a command, left out of the phrase key ("no niin", Whisper's closing "kiitos"). */
const FILLERS = new Set(['no', 'niin', 'nyt', 'okei', 'ok', 'öö', 'ööh', 'hmm', 'tota', 'niinku', 'please', 'kiitos'])

/** The key a phrase is saved and looked up by. */
export function phraseKey(words: string): string {
  return normalise(words)
    .split(' ')
    .filter((w) => !FILLERS.has(w))
    .join(' ')
}

// ------------------------------------------------------------------------------ words

const STOP = new Set(['seis', 'stop', 'stoppi', 'stoppaa', 'lopeta', 'lopettakaa', 'lopetetaan', 'älä', 'älkää', 'pysähdy', 'pysähtykää', 'riittää', 'halt', 'freeze', 'dont'])
const EVERYONE = new Set(['kaikki', 'kaikkien', 'everyone', 'everybody', 'all'])
/** Words for playing: with a game or another action named they say nothing more ("pelataan hippaa", "Aino, pelaa hippaa"); alone they are a word nobody knows. */
const PLAY = new Set(['pelataan', 'pelaa', 'pelatkaa', 'pelata', 'pelaamaan', 'pelaillaan', 'leikitään', 'leiki', 'leikkikää', 'leikkiä', 'leikkimään', 'mennään', 'play', 'playing', 'lets'])
/** "Let's play": with nobody named, everyone takes part ("pelataan hippaa", "mennään piilosille"). A game said with nobody named is for everyone too ("hippa!", "play tag"). */
const LETS = new Set(['pelataan', 'pelaillaan', 'leikitään', 'mennään', 'lets'])
/** Words for going somewhere: with a room named they make a room change, without one they are the verb they are ('mene' is walk). */
const GO = new Set(['mennään', 'mennää', 'mene', 'mee', 'mennä', 'menkää', 'lähdetään', 'lähde', 'lähtekää', 'käydään', 'siirrytään', 'go', 'lets'])
/** Who a pronoun can be: null for anyone (Finnish "hän" is she and he). */
const SUBJECT = new Map<string, readonly Pronoun[] | null>([['hän', null], ['she', ['she']], ['he', ['he']], ['they', ['they']]])
const OBJECT = new Map<string, readonly Pronoun[] | null>([
  ['hänelle', null], ['hänet', null], ['häntä', null], ['hänen', null], ['häneltä', null], ['hänestä', null], ['häneen', null], ['sille', null], ['siltä', null],
  ['her', ['she']], ['him', ['he']], ['them', ['they']],
])
/** The ending a "hän" form puts on the name it stands for ("anna pallo hänelle": "Eetulle"); the others leave the name bare. */
const PRONOUN_ENDING = new Map([['hänelle', 'lle'], ['sille', 'lle'], ['häntä', 'a'], ['hänen', 'n'], ['häneltä', 'lta'], ['siltä', 'lta'], ['hänestä', 'sta']])
/** Words that leave a command clear: joining words, postpositions, politeness, the child ("vilkuta minulle": the action turns to the child by itself), counting ("kolme kertaa"), how fast or high ("juokse kovaa"), "itsesi", "it" (the action finds its own thing), "kaikille" (no one param holds everyone). */
const SMALL = new Set([
  'ja', 'sitten', 'nyt', 'kanssa', 'luo', 'luokse', 'päälle', 'päällä', 'yli', 'ali', 'alle', 'alla', 'sisään', 'sisälle', 'ulos', 'pois', 'myös', 'vielä',
  'taas', 'uudestaan', 'heti', 'vaan', 'vain', 'kohti', 'ympäri', 'perään', 'perässä', 'mukaan', 'eteen', 'taakse', 'viereen', 'vieressä', 'sinne',
  'tuonne', 'hei', 'moi', 'no', 'niin', 'nii', 'okei', 'ok', 'kiitos', 'pliis', 'voisitko', 'voitko', 'voisit', 'osaatko', 'saa', 'saat', 'pitää', 'täytyy',
  'mä', 'minä', 'sä', 'sinä', 'mun', 'sun', 'minun', 'sinun', 'mulle', 'sulle', 'minua', 'mua', 'minulle', 'meille', 'meitä',
  'joku', 'jokin', 'jonkun', 'jonkin', 'tuo', 'tämä', 'tää', 'toi', 'se', 'sen',
  'sitä', 'ne', 'niitä', 'nää', 'noi', 'kun', 'että', 'jos', 'oikein', 'ihan', 'tosi', 'vähän', 'äkkiä', 'takaisin', 'uudelleen',
  'kerta', 'kertaa', 'kerran', 'itse', 'itsesi', 'itseäsi', 'itsensä', 'itseään', 'itseni', 'itsenne', 'kaikille', 'kaikkia', 'kaikilta',
  'yhdessä', 'kättä', 'käsiä', 'kädet', 'monta', 'kovaa', 'lujaa', 'hiljaa', 'nopeasti', 'hitaasti', 'varovasti', 'korkealle', 'kauas', 'ylös', 'alas', 'paljon',
  'the', 'a', 'an', 'to', 'at', 'with', 'please', 'and', 'then', 'now', 'on', 'in', 'over', 'under', 'into', 'onto', 'around', 'of', 'my', 'your', 'it',
  'its', 'this', 'that', 'up', 'down', 'some', 'too', 'again', 'also', 'hey', 'hi', 'okay', 'can', 'you', 'could', 'times', 'once', 'twice', 'back',
  'yourself', 'itself', 'himself', 'herself', 'me', 'us', 'high', 'fast', 'slowly', 'quickly', 'together', 'far', 'very', 'really',
])
/** Small words that are worth saying: a text param of small words alone says something only with one of these ("sano hei kaikille", not "tee se uudestaan"). */
const GREETINGS = new Set(['hei', 'moi', 'kiitos', 'pliis', 'okei', 'ok', 'hey', 'hi', 'okay', 'please'])
/** Words that join a second command to the first: a room with a word after one of these is not all that was meant. */
const AND = new Set(['ja', 'sitten', 'and', 'then'])
/** 'laske' said alone puts a thing down only when the thing can be carried: "laske liukumäkeä" slides down a slide and "laske kolmeen" counts. */
const LOWER = /^lask/
/** Words that point at someone or something only the moment knows ("anna se hänelle", "heille", "toiselle", "kaikki"): words with these are not saved as a phrase. Not "heitä": it is "throw!" too. */
const POINTING = new Set([
  'se', 'sen', 'sitä', 'siitä', 'siihen', 'sille', 'siltä', 'sillä', 'tämä', 'tää', 'tätä', 'tälle', 'tuo', 'toi', 'tuota', 'tuolle', 'ne', 'niitä', 'niille', 'nää', 'noi',
  'noille', 'näille', 'heille', 'heidät', 'heidän', 'toinen', 'toiselle', 'toista', 'toisen', 'molemmat', 'molemmille', 'kummallekin', 'kaikille', 'kaikkia', 'kaikilta',
  'it', 'this', 'that', 'these', 'those', 'other', 'both',
])
/** Little words that go after the word they belong to ("puun luo", "Ainon kanssa"): the Finnish line keeps them with it. */
const AFTER = new Set(['luo', 'luokse', 'päälle', 'päällä', 'yli', 'ali', 'alle', 'alla', 'kanssa', 'kohti', 'ympäri', 'perään', 'perässä', 'eteen', 'taakse', 'viereen', 'vieressä', 'sisään', 'sisälle'])

/** Finnish case endings after a name, with the stems names take: Stevelle, Alicen, kissaa, Maikille, Alikselle, puistoon. */
const ENDING = /^(?:i|kse)?(?:lle|lla|llä|lta|ltä|ssa|ssä|sta|stä|seen|han|hen|hin|hon|hun|hyn|hön|ksi|kin|ineen|ita|itä|ja|jä|ta|tä|aa|ää|ni|si|in|on|an|än|en|un|yn|ön|n|a|ä|t)$/
/** The endings that go on any name the same way, so the one a child put on a name can go on the name shown. */
const NAME_ENDINGS = new Set(['lle', 'lla', 'llä', 'lta', 'ltä', 'n', 'ssa', 'ssä', 'sta', 'stä', 'ksi', 'a', 'ä', 'kin'])

/**
 * A name with the ending the child said on it ("stevelle" makes Eetu "Eetulle"), or the name as
 * it is for any other ending. The ending takes the name's vowels (Eetua, Mirriä), a double k, p
 * or t goes single before an ending that closes the syllable (Mikolle), and a name that ends in
 * a consonant takes an i (Maxille).
 */
function nameWith(name: string, said: string): string {
  const ending = [said, said.replace(/^i/, ''), said.replace(/^kse/, '')].find((e) => NAME_ENDINGS.has(e))
  if (ending === undefined) return name
  const e = /[aou]/i.test(name) ? ending.replace(/ä/g, 'a') : ending.replace(/a/g, 'ä')
  const stem = e === 'a' || e === 'ä' || e === 'kin' ? name : name.replace(/([kpt])\1([aeiouyäö])$/i, '$1$2')
  return /[aeiouyäö]$/i.test(stem) || e === 'kin' ? stem + e : `${stem}i${e}`
}

/** An actor's name in `lang`: a starting avatar the child has not named has one in each language. */
export function nameIn(a: Pick<Actor, 'name' | 'names'>, lang: Lang): string {
  return a.names === null ? a.name : a.names[lang].name
}
/** Endings to take off a noun before looking it up again ('penkille' → 'penki', one letter off 'penkki'). */
const NOUN_ENDINGS = ['seen', 'lle', 'lla', 'llä', 'lta', 'ltä', 'ssa', 'ssä', 'sta', 'stä', 'hun', 'hin', 'han', 'hen', 'hon', 'ksi', 'na', 'nä', 'ta', 'tä', 'n', 'a', 'ä', 't', 's']
/** Verb endings a child says to one or to many, and English ones: pyörikää, istuvat, tanssitaan, uimaan, jumps. */
const VERB_ENDINGS = ['tkaa', 'tkää', 'kaa', 'kää', 'vat', 'vät', 'taan', 'tään', 'daan', 'dään', 'maan', 'mään', 'mme', 'tte', 'ing', 'es', 's', 'ed']

/** At most one letter added, dropped or changed. */
function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1)
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1)
}

/** How a heard word names something called `call`: the word itself, with an ending, one letter off, or one letter off with an ending (a word one letter off keeps the first letter: recognizers seldom miss the first sound). */
type Form = 'exact' | 'ending' | 'near' | 'near-ending'
const RANK: Record<Form, number> = { exact: 4, ending: 3, near: 2, 'near-ending': 1 }

function formOf(word: string, call: string): Form | null {
  if (word === call) return 'exact'
  if (call.length >= 3 && word.startsWith(call) && ENDING.test(word.slice(call.length))) return 'ending'
  if (call.length < 4 || word[0] !== call[0]) return null
  if (word.length >= 5 && oneEdit(word, call)) return 'near'
  return NOUN_ENDINGS.some((e) => word.endsWith(e) && word.length - e.length >= 5 && oneEdit(word.slice(0, -e.length), call)) ? 'near-ending' : null
}

interface ActorRef {
  id: string
  /** Said bare (or misheard bare): the one who does it, not a param. */
  bare: boolean
  rank: number
  /** The ending said after the name ('lle' in "stevelle"), or ''. */
  ending: string
}

function actorRef(word: string, world: World): ActorRef | null {
  let best: ActorRef | null = null
  for (const a of world.actors) {
    for (const call of [a.id, a.name.toLowerCase(), ...a.calls]) {
      const form = formOf(word, call)
      if (form !== null && (best === null || RANK[form] > best.rank)) best = { id: a.id, bare: form === 'exact' || form === 'near', rank: RANK[form], ending: form === 'ending' ? word.slice(call.length) : '' }
    }
  }
  return best
}

/** The actor a word names: an id, a name, or a misheard name. */
export function actorNamed(word: string, world: World): string | null {
  return actorRef(normalise(word), world)?.id ?? null
}

/** The actors the words name, by any name or "kaikki". */
export function namedActors(words: string, world: World): string[] {
  const ids = new Set<string>()
  for (const w of normalise(words).split(' ')) {
    if (EVERYONE.has(w)) for (const a of world.actors) ids.add(a.id)
    const ref = actorRef(w, world)
    if (ref !== null) ids.add(ref.id)
  }
  return [...ids]
}

/** The words mean the same plan whenever they are said: no "hän", "se" or "kaikki", whose meaning moves with who was spoken to and who is here. */
export function meansTheSame(words: string): boolean {
  return normalise(words)
    .split(' ')
    .every((w) => !SUBJECT.has(w) && !OBJECT.has(w) && !EVERYONE.has(w) && !LETS.has(w) && !POINTING.has(w))
}

function roomOf(word: string): RoomId | null {
  return ROOMS.find((r) => ROOM_GEO[r].calls.some((c) => formOf(word, c) !== null)) ?? null
}

function verbStems(word: string): string[] {
  const out: string[] = []
  for (const e of VERB_ENDINGS) {
    if (!word.endsWith(e) || word.length - e.length < 2) continue
    const stem = word.slice(0, -e.length)
    // The stem, and the stem with its last letter twice: hyppikää → hyppii, nukkuvat → nukkuu, vilkuttavat → vilkuttaa (hypätkää → hypää, one letter off hyppää)
    out.push(stem, stem + stem.at(-1))
    // "let's": hypätään → hypätä, juostaan → juosta, the forms the calls have
    if (/^[td][aä]{2}n$/.test(e)) out.push(stem + e.slice(0, 2))
  }
  // istuu → istu, juoksee → juokse; istua → istu
  if (/([aeiouyäö])\1$/.test(word) || (/[aä]$/.test(word) && word.length > 3)) out.push(word.slice(0, -1))
  return out
}

function nounStems(word: string): string[] {
  return NOUN_ENDINGS.filter((e) => word.endsWith(e) && word.length - e.length >= 3).map((e) => word.slice(0, -e.length))
}

type Find = (word: string, opts: { near: boolean }) => string | null
const SURE = { near: false }

/** What a word or one of its stems names: sure matches (exactly, or with an ending) first, then one letter off (`near`: a guess). */
function lookup(words: string[], find: Find): { id: string; near: boolean } | null {
  for (const near of [false, true]) {
    for (const w of words) {
      const id = find(w, { near })
      if (id !== null) return { id, near }
    }
  }
  return null
}

// ------------------------------------------------------------------------------ reading

/** `near`: read only as a word one letter off a known one, which may be a word nobody knows yet ('lennä' is not 'mennä'). */
type Meaning =
  | { kind: 'actor'; id: string; bare: boolean; near: boolean; ending: string }
  | { kind: 'pronoun'; subject: boolean; fits: readonly Pronoun[] | null }
  | { kind: 'action'; id: string; near: boolean }
  | { kind: 'item'; item: string; near: boolean }
  | { kind: 'room'; room: RoomId }
  | { kind: 'go'; action: string | null; near: boolean }
  | { kind: 'number' | 'color' | 'all' | 'stop' | 'small' | 'unknown' }

type Reading = Meaning & { at: number; word: string }

/**
 * What one word is. Names said exactly (or with an ending) come first; with a word for going,
 * a room beats a verb ("mennään uimaan"); a thing beats a room ("mene keinuun" is the swing);
 * a colour ('punaiseksi') is a known word for a text param; a word one letter off an action, a
 * thing or a name counts only when it is nothing else.
 */
function meaningOf(word: string, vocab: Vocabulary, world: World, going: boolean): Meaning {
  if (STOP.has(word)) return { kind: 'stop' }
  if (SMALL.has(word)) return { kind: 'small' }
  if (EVERYONE.has(word)) return { kind: 'all' }
  const subject = SUBJECT.get(word)
  if (subject !== undefined) return { kind: 'pronoun', subject: true, fits: subject }
  const object = OBJECT.get(word)
  if (object !== undefined) return { kind: 'pronoun', subject: false, fits: object }
  const actions: Find = (w, opts) => vocab.actionFor(w, opts)
  const items: Find = (w, opts) => vocab.itemKindFor(w, opts)
  if (GO.has(word)) {
    const go = lookup([word, ...verbStems(word)], actions)
    return { kind: 'go', action: go?.id ?? null, near: go?.near ?? false }
  }
  if (/^\d+$/.test(word)) return { kind: 'number' }
  // A play word is never a verb one letter off ("leikkikää" is no "loikki"): with a game it says nothing more, alone nobody knows it.
  if (PLAY.has(word)) return { kind: 'unknown' }
  const actor = actorRef(word, world)
  if (actor !== null && actor.rank >= RANK.ending) return { kind: 'actor', id: actor.id, bare: actor.bare, near: false, ending: actor.ending }
  const item = lookup([word], items)
  const room = roomOf(word)
  if (going && room !== null && item === null) return { kind: 'room', room }
  const action = lookup(item === null ? [word, ...verbStems(word)] : [word], actions)
  const thing = item !== null && !item.near ? item : lookup([word, ...nounStems(word)], items)
  if (action !== null && !action.near) return { kind: 'action', id: action.id, near: false }
  if (thing !== null && !thing.near) return { kind: 'item', item: thing.id, near: false }
  if (colorOf(word) !== null) return { kind: 'color' }
  if (action !== null) return { kind: 'action', id: action.id, near: true }
  if (thing !== null) return { kind: 'item', item: thing.id, near: true }
  if (actor !== null) return { kind: 'actor', id: actor.id, bare: actor.bare, near: true, ending: actor.ending }
  if (room !== null) return { kind: 'room', room }
  return { kind: 'unknown' }
}

/**
 * Every word's meaning. Two words that make one call count as one: side by side ('käy maate',
 * 'tule tänne') or with up to two words between ('ota lippis pois', 'päästä pallo irti') that
 * name one thing or someone at most, when no word after the second names any: "laita pallo
 * penkin päälle" and "put the ball on the bench" put a thing on another, nobody wears it.
 */
function read(words: string, vocab: Vocabulary, world: World): Reading[] {
  const tokens = normalise(words).split(' ').filter((w) => w !== '')
  const going = tokens.some((t) => GO.has(t))
  const names = (t: string) => {
    const kind = meaningOf(t, vocab, world, going).kind
    return kind === 'item' || kind === 'actor'
  }
  const out: Reading[] = []
  /** Second words of calls already read with their first word. */
  const joined = new Set<number>()
  for (let at = 0; at < tokens.length; at++) {
    const word = tokens[at]!
    if (joined.has(at)) {
      out.push({ at, word, kind: 'small' })
      continue
    }
    if (at + 1 < tokens.length) {
      const pair = `${word} ${tokens[at + 1]}`
      const action = vocab.actionFor(pair, SURE)
      const item = action === null ? vocab.itemKindFor(pair, SURE) : null
      if (action !== null || item !== null) {
        out.push(action !== null ? { at, word: pair, kind: 'action', id: action, near: false } : { at, word: pair, kind: 'item', item: item!, near: false })
        at++
        continue
      }
    }
    const apart = [at + 2, at + 3].find(
      (j) =>
        j < tokens.length &&
        !joined.has(j) &&
        vocab.actionFor(`${word} ${tokens[j]}`, SURE) !== null &&
        tokens.slice(at + 1, j).filter(names).length <= 1 &&
        !tokens.slice(j + 1).some(names),
    )
    if (apart !== undefined) {
      out.push({ at, word: `${word} ${tokens[apart]}`, kind: 'action', id: vocab.actionFor(`${word} ${tokens[apart]}`, SURE)!, near: false })
      joined.add(apart)
      continue
    }
    out.push({ at, word, ...meaningOf(word, vocab, world, going) })
  }
  return out
}

// ------------------------------------------------------------------------------ understanding

/** A word that can fill a param: an actor id, an item kind, or a number; and how the Finnish line says it. */
interface Candidate {
  at: number
  type: 'actor' | 'item' | 'number'
  value: string
  fi: string
}

/** How the Finnish line says an arg, and where in the words it was, so the line keeps the child's order. */
interface Said {
  at: number
  fi: string
}

interface Filled {
  id: string
  args: Arg[]
  /** Each arg as the Finnish line says it, by its param's name. */
  said: Map<string, Said>
  /** A param that must be there is not. */
  missing: boolean
  /** Words that name something or nothing known, left over. */
  left: number
  /**
   * A word left over names someone or something: a name or a thing no param took ("Mike pue
   * Mirrille hattu"), a word nobody knows with a case ending, a thing nobody has made yet
   * ("hyppää trampoliinilla"), or any word nobody knows while a thing param is empty.
   */
  named: boolean
  /** The actors filling its params. */
  actors: string[]
  /** A text param took a word nobody knows ("tee lohikäärme" is for the interpreter to invent), only small words that say nothing ("tee se uudestaan"), or two kinds, which are no one thing ("laita pallo penkin päälle"). */
  guessed: boolean
}

/** Params by kind: actors, items and numbers first, then things and places (an actor or an item), then text. */
const PASSES: readonly (readonly ParamKind[])[] = [['actor', 'item', 'number'], ['thing', 'place'], ['text']]
const TAKES: Record<ParamKind, readonly Candidate['type'][]> = {
  actor: ['actor'],
  item: ['item'],
  number: ['number'],
  thing: ['actor', 'item'],
  place: ['actor', 'item'],
  text: [],
}

/**
 * One action's args from the words. A text param takes the words after the verb that nothing
 * else took and that name nobody, small words only into the first one and when there is nothing
 * else ("sano hei hei", "maalaa itsesi siniseksi"); the first one takes just the things among them, as their kinds,
 * when there are any ("tee pallo punainen": make 'ball', colour 'punainen'). A text param named
 * 'part' (paint's part of a person) takes a worn kind as the slot it is worn in when `partOf`
 * says the one painted wears something there: "värjää tukka siniseksi" paints the hair she
 * wears, not a new wig; a cap lying on the ground is a cap to paint. `fiOf` is how the Finnish
 * line says a word.
 */
function fill(action: Pick<LibAction, 'id' | 'params'>, candidates: Candidate[], readings: Reading[], verbAt: number, partOf: (kind: string) => Slot | null, fiOf: (r: Reading) => string): Filled {
  const used = new Set<Candidate>()
  const taken = new Set<number>()
  const values = new Map<string, string>()
  const said = new Map<string, Said>()
  let texts = 0
  let guessed = false
  const part = action.params.find((p) => p.name === 'part' && p.kind === 'text')
  const worn = part === undefined ? undefined : candidates.find((c) => c.type === 'item' && partOf(c.value) !== null)
  if (part !== undefined && worn !== undefined) {
    values.set(part.name, partOf(worn.value)!)
    said.set(part.name, { at: worn.at, fi: worn.fi })
    used.add(worn)
    taken.add(worn.at)
  }
  for (const kinds of PASSES) {
    for (const p of action.params) {
      // A game's players are who the command names (the brain makes one game of their steps), never words left over.
      if (!kinds.includes(p.kind) || values.has(p.name) || p.name === 'players') continue
      if (p.kind === 'text') {
        const rest = readings.filter((r) => r.at > verbAt && !taken.has(r.at) && r.kind !== 'actor' && r.kind !== 'pronoun' && r.kind !== 'all')
        if (p.name === 'color') {
          // A colour param takes a colour word, the first one; two colours are for the interpreter to share out.
          const colours = rest.filter((r) => r.kind === 'color')
          if (colours.length === 0) continue
          values.set(p.name, colours[0]!.word)
          said.set(p.name, { at: colours[0]!.at, fi: colours[0]!.word })
          taken.add(colours[0]!.at)
          guessed ||= colours.length > 1
          texts++
          continue
        }
        const things = rest.filter((r) => r.kind === 'item')
        const meant = rest.filter((r) => r.kind !== 'small')
        const words = texts === 0 && things.length > 0 ? things : meant.length > 0 ? meant : texts === 0 ? rest : []
        if (words.length === 0) continue
        values.set(p.name, words.map((r) => (r.kind === 'item' ? r.item : r.word)).join(' '))
        said.set(p.name, { at: words[0]!.at, fi: words.map(fiOf).join(' ') })
        for (const r of words) taken.add(r.at)
        // A colour word is a colour, not a kind ("make a tomato"), and only a text param named 'thing' takes a kind ("maalaa pallo ja puu punaiseksi" is no part 'tree').
        guessed ||=
          words.some((r) => r.kind === 'unknown' || r.kind === 'color' || (r.kind === 'item' && p.name !== 'thing')) ||
          words.every((r) => r.kind === 'small' && !GREETINGS.has(r.word)) ||
          words.filter((r) => r.kind === 'item').length > 1
        texts++
        continue
      }
      const c = candidates.find((x) => !used.has(x) && TAKES[p.kind].includes(x.type))
      if (c === undefined) continue
      used.add(c)
      taken.add(c.at)
      values.set(p.name, c.value)
      said.set(p.name, { at: c.at, fi: c.fi })
    }
  }
  const counted = new Set(candidates.map((c) => c.at))
  const left = readings.filter((r) => (r.kind === 'unknown' || counted.has(r.at)) && !taken.has(r.at))
  // A thing param nothing filled: a word nobody knows is likely the thing ("anna Stevelle pusu").
  const open = action.params.some((p) => (p.kind === 'item' || p.kind === 'thing' || p.kind === 'place') && !values.has(p.name))
  return {
    id: action.id,
    args: action.params.filter((p) => values.has(p.name)).map((p) => ({ name: p.name, value: values.get(p.name)! })),
    said,
    missing: action.params.some((p) => !p.optional && !values.has(p.name)),
    left: left.length,
    named: left.some(
      (r) =>
        r.kind === 'actor' ||
        r.kind === 'pronoun' ||
        r.kind === 'item' ||
        (r.kind === 'unknown' && ((r.word.length >= 5 && NOUN_ENDINGS.some((e) => r.word.endsWith(e))) || (open && r.word.length >= 4))),
    ),
    actors: [...used].filter((c) => c.type === 'actor').map((c) => c.value),
    guessed,
  }
}

const ANSWERS: readonly [string, string][] = [['Okay!', 'Okei!'], ['Yes!', 'Joo!'], ['Sure!', 'Selvä!']]
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7)

/**
 * The words as a plan. Confident when it is clear who (a name, "hän" for the one spoken to,
 * "kaikki", or nobody named and someone spoken to before), exactly one known action matched,
 * every param it needs is filled, no text param holds a word nobody knows or two kinds, and at
 * most one word is left over, which names nobody and nothing ("juokse nopeasti").
 * A room change alone, or just a name ("Alice!": she says hi), is confident too.
 * Never confident of a word read only as one letter off a known action or thing, or of a name
 * one letter off where the verb goes ("Noora naura"): a new verb or thing may hide there, and
 * the interpreter can have it made.
 */
export function understand(words: string, vocab: Vocabulary, world: World, addressee: string | null): Understood {
  const everybody = world.actors.map((a) => a.id)
  const listener = world.actors.find((a) => a.id === addressee) ?? null
  const pronounFor = (fits: readonly Pronoun[] | null) => (listener !== null && (fits === null || fits.includes(listener.pronoun)) ? listener.id : null)
  const raw = read(words, vocab, world)

  if (raw.some((r) => r.kind === 'stop')) {
    const who = new Set<string>()
    for (const r of raw) {
      if (r.kind === 'all') for (const id of everybody) who.add(id)
      else if (r.kind === 'actor') who.add(r.id)
      else if (r.kind === 'pronoun') {
        const id = pronounFor(r.fits)
        if (id !== null) who.add(id)
      }
    }
    return { kind: 'stop', who: who.size > 0 ? [...who] : everybody }
  }

  const rooms = [...new Set(raw.flatMap((r) => (r.kind === 'room' ? [r.room] : [])))]
  const room = rooms.length === 1 ? rooms[0] : undefined
  const readings = raw.map((r): Reading => {
    if (r.kind !== 'go') return r
    if (room !== undefined) return { at: r.at, word: r.word, kind: 'small' }
    return r.action !== null ? { at: r.at, word: r.word, kind: 'action', id: r.action, near: r.near } : { at: r.at, word: r.word, kind: 'unknown' }
  })
  const actionIds = [...new Set(readings.flatMap((r) => (r.kind === 'action' ? [r.id] : [])))]
  // With an action named, "pelataan" and "pelaa" say nothing more.
  if (actionIds.length > 0) for (const [i, r] of readings.entries()) if (r.kind === 'unknown' && PLAY.has(r.word)) readings[i] = { at: r.at, word: r.word, kind: 'small' }
  const verbAt = readings.find((r) => r.kind === 'action')?.at ?? Infinity
  const game = actionIds.length === 1 && vocab.actions.get(actionIds[0]!)!.params.some((p) => p.name === 'players')
  const lets = (game || readings.some((r) => r.word.split(' ').some((w) => LETS.has(w)))) && !readings.some((r) => (r.kind === 'actor' && r.bare) || (r.kind === 'pronoun' && r.subject))
  const everyone = readings.some((r) => r.kind === 'all') || (lets && actionIds.length > 0)
  let unclear = rooms.length > 1

  // Who does it: names before the verb, "kaikki", "hän"; else a name after the verb ("hyppää Alice"); else the one spoken to.
  const bare = readings.flatMap((r) => (r.kind === 'actor' && r.bare ? [r] : []))
  const doers = new Set(everyone ? everybody : bare.filter((r) => r.at < verbAt).map((r) => r.id))
  for (const r of readings) {
    if (r.kind !== 'pronoun' || !r.subject || everyone) continue
    const id = pronounFor(r.fits)
    if (id === null) unclear = true
    else doers.add(id)
  }
  const vocative = doers.size === 0 && !everyone
  if (vocative) for (const r of bare) doers.add(r.id)
  const named = doers.size > 0
  if (!named) {
    if (listener !== null) doers.add(listener.id)
    else {
      unclear = true
      for (const id of everybody.slice(0, 1)) doers.add(id)
    }
  }

  // The Finnish line says a name in the form the child put it, a thing as the child said it when that is its Finnish name (else that name), and keeps a little word after them ("puun luo").
  const finnishName = (id: string, ending: string) => nameWith(nameIn(world.actors.find((a) => a.id === id)!, 'fi'), ending)
  const fiOf = (r: Reading): string => {
    const next = readings.find((q) => q.at > r.at)
    const after = next !== undefined && AFTER.has(next.word) ? ` ${next.word}` : ''
    if (r.kind === 'actor') return finnishName(r.id, r.ending) + after
    if (r.kind !== 'item') return r.word
    const name = vocab.items.get(r.item)!.nameFi.toLowerCase()
    return (!r.near && r.word.startsWith(name.slice(0, 4)) ? r.word : name) + after
  }

  // What can fill params: names with endings (and bare ones after the verb when someone was named before it), "hänelle", things, numbers.
  const candidates: Candidate[] = []
  for (const r of readings) {
    if (r.kind === 'actor' && !(r.bare && (vocative || r.at < verbAt))) candidates.push({ at: r.at, type: 'actor', value: r.id, fi: fiOf(r) })
    else if (r.kind === 'pronoun' && !r.subject) {
      const id = pronounFor(r.fits)
      if (id === null) unclear = true
      else candidates.push({ at: r.at, type: 'actor', value: id, fi: finnishName(id, PRONOUN_ENDING.get(r.word) ?? '') })
    } else if (r.kind === 'item') candidates.push({ at: r.at, type: 'item', value: r.item, fi: fiOf(r) })
    else if (r.kind === 'number') candidates.push({ at: r.at, type: 'number', value: r.word, fi: r.word })
  }

  // Paint's part: a worn kind is the slot it is worn in, on whoever is painted (a name with an ending, else whoever paints) when one of them wears something there.
  const painted = candidates.some((c) => c.type === 'actor') ? candidates.flatMap((c) => (c.type === 'actor' ? [c.value] : [])) : [...doers]
  const partOf = (kind: string): Slot | null => {
    const slot = vocab.items.get(kind)?.info.recipe.meta.wear ?? null
    return slot !== null && world.actors.some((a) => painted.includes(a.id) && a.look.worn[slot] !== undefined) ? slot : null
  }
  const filled = actionIds.map((id) => fill(vocab.actions.get(id)!, candidates, readings, verbAt, partOf, fiOf))
  const leftover = readings.filter((r) => r.kind === 'unknown').length + candidates.length
  const near = readings.some((r) => (r.kind === 'action' || r.kind === 'item') && r.near)
  const nearName = readings.some((r) => r.kind === 'actor' && r.near && readings.some((q) => q.kind === 'actor' && !q.near && q.at < r.at))
  const who = [...doers]
  let confident: boolean
  if (filled.length === 1) {
    const main = filled[0]!
    const lowers = readings.some((r) => r.kind === 'action' && r.id === main.id && !r.word.includes(' ') && LOWER.test(r.word))
    const carried = main.args.some((a) => (vocab.items.get(a.value)?.info.recipe.meta.carry ?? 'no') !== 'no')
    // A thing in the hand said with -lla is what it is done with ("hyppää hyppynarulla" jumps rope), which no basic verb does: the interpreter decides.
    const using = readings.some((r) => r.kind === 'item' && /ll[aä]$/.test(r.word) && (vocab.items.get(r.item)?.info.recipe.meta.carry ?? 'no') !== 'no')
    confident = !unclear && !near && !using && !main.missing && !main.guessed && !main.named && main.left <= 1 && !main.actors.some((id) => doers.has(id)) && (!lowers || carried)
  } else if (filled.length === 0) {
    // A room and a word more ("mennään metsään nopeasti"), but no second command after it ("mennään metsään ja alice tanssii").
    const roomAt = readings.find((r) => r.kind === 'room')?.at ?? Infinity
    const more = readings.some((r) => AND.has(r.word)) || bare.some((r) => r.at > roomAt)
    confident = !near && (room !== undefined ? leftover === 0 || (leftover === 1 && !more) : named && !unclear && !nearName && leftover === 0)
  } else confident = false

  const [say, sayFi] = filled.length > 0 ? ANSWERS[hash(words) % ANSWERS.length]! : room !== undefined ? ["Let's go!", 'Mennään!'] : ['Hi!', 'Moi!']
  const heard = heardOf(world, vocab, who, everyone, filled, room)
  const plan: Plan = {
    heard: heard.en,
    heardFi: heard.fi,
    who,
    steps: who.flatMap((w) => filled.map((f) => ({ who: w, action: f.id, args: f.args }))),
    newActions: [],
    newItems: [],
    ...(room !== undefined ? { room } : {}),
    say,
    sayFi,
  }
  return { kind: 'plan', plan, confident }
}

/** The little word before an arg, by its param's name: "throw the ball at the slide". */
const BEFORE = new Map([['to', 'to'], ['at', 'at'], ['target', 'at'], ['on', 'on'], ['with', 'with'], ['partner', 'with'], ['over', 'over']])
/** Going to a room, in Finnish. */
const TO_ROOM_FI: Record<RoomId, string> = { playground: 'mene leikkipuistoon', pool: 'mene uimahalliin', forest: 'mene metsään' }

/**
 * The plan in plain words for the parent, with names and no ids: in English ("Steve: run to
 * the tree", "Alice: pick up the rubber duck") and in Finnish, in the child's order and word
 * forms ("Eetu: juokse puun luo", "Aino: anna pallo Eetulle").
 */
function heardOf(world: World, vocab: Vocabulary, who: string[], everyone: boolean, filled: Filled[], room: RoomId | undefined): { en: string; fi: string } {
  const named = (id: string, lang: Lang) => {
    const a = world.actors.find((x) => x.id === id)
    return a === undefined ? null : nameIn(a, lang)
  }
  const times = (n: string, lang: Lang) => (lang === 'en' ? `${n} ${n === '1' ? 'time' : 'times'}` : `${n} ${n === '1' ? 'kerran' : 'kertaa'}`)
  const arg = (kind: ParamKind, a: Arg) => {
    if (kind === 'number') return a.name === 'times' ? times(a.value, 'en') : a.value
    const thing = vocab.items.get(a.value)?.name.toLowerCase()
    const said = named(a.value, 'en') ?? (thing !== undefined ? `the ${thing}` : (englishColor(a.value) ?? a.value))
    const before = BEFORE.get(a.name)
    return before === undefined ? said : `${before} ${said}`
  }
  const steps = filled.map((f) => {
    const action = vocab.actions.get(f.id)!
    const kindOf = (name: string) => action.params.find((p) => p.name === name)!.kind
    // Who and what first, then the words: "paint the ball blue".
    const ordered = [...f.args.filter((a) => kindOf(a.name) !== 'text'), ...f.args.filter((a) => kindOf(a.name) === 'text')]
    const fi = [...f.said].sort(([, x], [, y]) => x.at - y.at).map(([name, s]) => (name === 'times' && kindOf(name) === 'number' ? times(s.fi, 'fi') : s.fi))
    return { en: [action.name, ...ordered.map((a) => arg(kindOf(a.name), a))].join(' '), fi: [action.nameFi, ...fi].join(' ') }
  })
  const go = room === undefined ? null : { en: `go to the ${ROOM_GEO[room].name}`, fi: TO_ROOM_FI[room] }
  const line = (lang: Lang, all: string, and: string, hello: string) => {
    const what = [...(go === null ? [] : [go[lang]]), ...steps.map((s) => s[lang])]
    return `${everyone ? all : who.map((id) => named(id, lang) ?? id).join(` ${and} `)}: ${what.length > 0 ? what.join(', ') : hello}`
  }
  return { en: line('en', 'Everyone', 'and', 'hello'), fi: line('fi', 'Kaikki', 'ja', 'moi') }
}
