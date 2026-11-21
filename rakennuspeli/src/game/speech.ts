/**
 * Finnish words to `Spoken`: a pure grammar with no model behind it. The recognizer's text is
 * lower-cased, split into clauses, and each word is matched against the tables below after a
 * fold that undoes a small child's way of saying r, j and d.
 */
import type { MachineKind, PlaceId, Picture, Spoken, SpokenMove, SpokenWork } from './model'

type Flag = 'stop' | 'honk' | 'come' | 'help'

type Word =
  | { t: 'machine'; m: MachineKind }
  | { t: 'move'; v: SpokenMove }
  | { t: 'work'; w: SpokenWork }
  | { t: 'flag'; f: Flag }
  | { t: 'place'; p: PlaceId }

/** Fold a word for matching: r and j to l, d to t, w to v, doubled letters to one. */
function fold(word: string): string {
  let out = ''
  for (const ch of word) {
    const c = ch === 'r' || ch === 'j' ? 'l' : ch === 'd' ? 't' : ch === 'w' ? 'v' : ch
    if (c !== out[out.length - 1]) out += c
  }
  return out
}

const machine = (m: MachineKind, stems: string, raw = '') => ({ word: { t: 'machine', m } as Word, stems, raw })
const move = (v: SpokenMove, stems: string, raw = '') => ({ word: { t: 'move', v } as Word, stems, raw })
const work = (w: SpokenWork, stems: string, raw = '') => ({ word: { t: 'work', w } as Word, stems, raw })
const flag = (f: Flag, stems: string, raw = '') => ({ word: { t: 'flag', f } as Word, stems, raw })
const place = (p: PlaceId, stems: string, raw = '') => ({ word: { t: 'place', p } as Word, stems, raw })

/** Stems match the folded token as a prefix; raw words match the lower-case token exactly. */
const TABLE = [
  machine('digger', 'kaivuri kaivinkone kaivukone kauhakone', 'kaivuu kaivui'),
  machine('dumper', 'kippiauto kippi kuormaauto kuormuri lavaauto auto', 'kippari'),
  machine('dozer', 'puskutraktori puskukone puskuri traktori taktori dotseri bulldotseri', 'pusku'),
  machine('roller', 'katujyrä tiejyrä jyrä', 'jyrää jyrätä jyrätään'),
  machine('mixer', 'betoniauto betonimylly betonikone myllyauto sementtiauto sekoitusauto sekoittaja betoni sementti mylly', 'sekoita sekoittaa sekoitetaan'),
  machine('forklift', 'haarukkatrukki trukki', 'tukki tukin tukille tukilla tukkiin tukkia rukki'),
  machine('tower', 'torninosturi nosturi nostokurki kurki'),
  machine('semi', 'rekkaauto rekka isoauto pitkäauto'),
  machine('mobile', 'autonosturi ajonosturi nosturiauto nostoauto'),
  work('roll', 'tasoita tasoitta litistä', 'jyrää jyrätä jyrätään'),
  work('give', '', 'sekoita sekoittaa sekoitetaan'),

  move('forward', 'vauhtia kaasua eteenpäin suoraan eteen', 'aja ajaa ajan ajakaa ajele ajellaan ajetaan mene menee mee menen mennään lähde lähtee liiku liikkuu'),
  move('back', 'peruuta peruutta peruutus taaksepäin takaisin', 'taakse takas takaperin'),
  move('left', 'vasemmalle vasempaan vasemmalla vasemma', 'vasen'),
  move('right', 'oikealle oikeelle oikeaan oikealla', 'oikea oikee'),
  move('up', 'ylöspäin ylemmäs korkeammalle', 'ylös'),
  move('down', 'alaspäin alemmas', 'alas'),
  move('around', 'ympäri'),
  flag('stop', 'pysähdy pysähty pysäytä jarruta riittää seiso', 'seis stop stoppi stoppaa odota odotas oota ootas älä'),
  flag('honk', 'tööttää töötti töötä tuuttaa tuuttaus soita soittaa äänimerkki torvi piippaa', 'tööt tuut piip'),
  flag('come', 'tänne', 'tule tuu tulee tulkaa'),
  flag('help', '', 'apua auta'),
  work('take', 'kaiva kauho kauhaise poimi kerää lastaa täytä täyttä nosta', 'ota ottaa otetaan hae hakee'),
  work('give', 'kaada kaata kippaa kippaus tyhjennä tyhjentä pudota pudotta laske laita laitta valaa valu', 'vie viedään pura purkaa puretaan jätä'),
  work('push', 'työnnä työntä työnne puske pukkaa tönäise'),

  place('sand', 'hiekka hiekkakasa hiekkamäki'),
  place('rock', 'kivi kive kiviä kivikasa kivikko louhos kallio'),
  place('hole', 'kuoppa kuopa kuopi monttu montu reikä reiä aukko'),
  place('road', 'väylä', 'tie tien tiet tietä tiehen tieltä tielle tiellä katu kadun katua kadulle kadulla katuja'),
  place('house', 'talo rakennu työmaa koti'),
  place('bridge', 'silta silla', 'joki joen joet joelle joessa jokeen jokea'),
  place('water', 'vesitorni vesi vete vettä'),
  place('forest', 'metsä tukit tukkeja tukei', 'puut puita puille'),
  place('saw', 'saha sahaamo'),
  place('press', 'tiili tiilet tiilikone tiilitehdas puristin tehta'),
  place('crusher', 'murska'),
  place('play', 'leikkipuisto leikkipaikka puisto liukumäki keinu hiekkalaatikko'),
  place('pond', 'lampi lamme lampe'),
  place('clock', 'kellotorni torni raatihuone', 'kello kellon kellolle kelloon'),
  place('there', '', 'sinne tonne tuonne siihen tuohon töihin'),
]

/** Machine before verb before place when everything else ties. */
const RANK = { machine: 0, move: 1, work: 1, flag: 1, place: 2 } as const

const STEMS = TABLE.flatMap((e) => e.stems.split(' ').filter(Boolean).map((s) => ({ stem: fold(s), word: e.word, rank: RANK[e.word.t] })))
const RAWS = TABLE.map((e) => ({ word: e.word, raw: new Set(e.raw.split(' ').filter(Boolean)) }))

/** Pairs join machine and place stems only. */
const PAIR_STEMS = STEMS.filter((s) => s.word.t === 'machine' || s.word.t === 'place')

const POSTPOSITIONS = new Set(['luo', 'luokse', 'viereen', 'vierelle', 'lähelle', 'taakse', 'eteen'])
const JUMP_IN = new Set(['hyppää', 'hypätään', 'mene', 'mee', 'mennään', 'menen', 'vaihda', 'vaihdetaan', 'siirry', 'kiipeä', 'nouse'])
/** Words a child says all the time that the fuzzy match would take for a command ("pelataan" is not "peruuta"). */
const NOT_A_COMMAND = new Set(['pelataan', 'pelata', 'pelataanko', 'pelaa', 'pelaamme'])
const CLAUSE_BREAK = new Set(['ja', 'sitten', 'sit', 'sitte'])
/** A doubled vowel then n. */
const ILLATIVE = /([aeiouyäö])\1n$/
const ABSORBED = new Set(['auto', 'kone'])
/** A child's "trukki" is also the word for a log: after any other word in the clause it means the logs. */
const LOG = 'tukki'

function lev(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const row = [i]
    for (let j = 1; j <= b.length; j++) row.push(Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)))
    prev = row
  }
  return prev[b.length]
}

/** How far a folded token is from a folded stem: 0 for a prefix match; stems of 6 letters allow one edit in the token's first letters, 9 letters two; shorter stems only a prefix. Infinity for no match. */
function distance(stem: string, token: string): number {
  if (token.startsWith(stem)) return 0
  const n = stem.length
  if (n <= 5) return Infinity
  const max = n >= 9 ? 2 : 1
  let best = Infinity
  for (let k = n - max; k <= Math.min(token.length, n + max); k++) best = Math.min(best, lev(stem, token.slice(0, k)))
  return best <= max ? best : Infinity
}

type Ref = { t: 'machine'; m: MachineKind; form: 'to' | 'illative' | 'plain' } | { t: 'place'; p: PlaceId }

function parseClause(tokens: string[]): Spoken {
  const out: Spoken = { who: null, move: null, work: null, to: null, come: false, honk: false, stop: false, help: false }
  if (tokens.every((t) => t === 'ei')) {
    out.stop = true
    return out
  }
  const jumps = tokens.some((t) => JUMP_IN.has(t))
  const refs: Ref[] = []
  const moves: { v: SpokenMove; raw: string }[] = []
  let seen = false
  let i = 0
  while (i < tokens.length) {
    const raw = tokens[i]
    if (raw === 'mitä' && tokens[i + 1] === 'nyt') {
      out.help = true
      i += 2
      continue
    }
    let used = 1
    let hits: { word: Word; raw: string }[] = []
    // A pair: the recognizer split a compound.
    if (i + 1 < tokens.length) {
      const first = fold(raw)
      const joined = fold(raw + tokens[i + 1])
      let best: (typeof PAIR_STEMS)[number] | null = null
      for (const s of PAIR_STEMS) if (s.stem.length > first.length && joined.startsWith(s.stem) && (best === null || s.stem.length > best.stem.length)) best = s
      if (best !== null) {
        hits = [{ word: best.word, raw: tokens[i + 1] }]
        used = 2
      }
    }
    if (hits.length === 0) hits = RAWS.filter((e) => e.raw.has(raw)).map((e) => ({ word: e.word, raw }))
    if (hits.length === 0 && !NOT_A_COMMAND.has(raw)) {
      const folded = fold(raw)
      let best: { d: number; len: number; rank: number; word: Word } | null = null
      for (const s of STEMS) {
        const d = distance(s.stem, folded)
        if (d === Infinity) continue
        if (best === null || d < best.d || (d === best.d && (s.stem.length > best.len || (s.stem.length === best.len && s.rank < best.rank)))) best = { d, len: s.stem.length, rank: s.rank, word: s.word }
      }
      if (best !== null) hits = [{ word: best.word, raw }]
    }
    if (raw === LOG && seen) hits = [{ word: { t: 'place', p: 'forest' }, raw }]
    seen ||= hits.length > 0
    let next = i + used
    for (const h of hits) {
      const w = h.word
      if (w.t === 'machine') {
        let j = i + used
        if (j < tokens.length && ABSORBED.has(fold(tokens[j]))) j++
        let form: 'to' | 'illative' | 'plain' = 'plain'
        if (j < tokens.length && POSTPOSITIONS.has(tokens[j])) {
          form = 'to'
          j++
        } else if (h.raw.endsWith('lle')) form = 'to'
        else if (ILLATIVE.test(h.raw)) form = 'illative'
        refs.push({ t: 'machine', m: w.m, form })
        next = Math.max(next, j)
      } else if (w.t === 'place') refs.push({ t: 'place', p: w.p })
      else if (w.t === 'move') moves.push({ v: w.v, raw: h.raw })
      else if (w.t === 'work') out.work ??= w.w
      else out[w.f] = true
    }
    i = next
  }
  let jumpUsed = false
  for (const r of refs) {
    if (r.t === 'place') out.to = r.p
    // The same machine named again, or its own job as a verb ("jyrä jyrää", "betoniauto sekoittaa"): nowhere to go.
    else if (r.m === out.who) continue
    else if (r.form === 'illative' && jumps && out.who === null) {
      out.who = r.m
      jumpUsed = true
    } else if (r.form === 'plain' && out.who === null) out.who = r.m
    else out.to = r.m
  }
  const spoken = moves.filter((m) => !(jumpUsed && JUMP_IN.has(m.raw)))
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

/** The words of a text, lower-cased with no punctuation. */
export const wordsOf = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)

/** Only "ei", once or more: a stop, but a small child starts many sentences with it. */
export function isBareNo(text: string): boolean {
  const tokens = wordsOf(text)
  return tokens.length > 0 && tokens.every((t) => t === 'ei')
}

/** One clause per `Spoken`, in order; a clause that means nothing is left out. */
export function parseSpeech(text: string): Spoken[] {
  const tokens = wordsOf(text)
  const clauses: string[][] = [[]]
  for (const t of tokens) {
    if (CLAUSE_BREAK.has(t)) clauses.push([])
    else clauses[clauses.length - 1].push(t)
  }
  return clauses.filter((c) => c.length > 0).map(parseClause).filter((s) => partsOf(s).length > 0)
}

/** The clauses of the recognizer's top alternative; only if it means nothing, those of the first alternative that does. */
export function parseBest(alternatives: string[]): Spoken[] {
  for (const alt of alternatives) {
    const clauses = parseSpeech(alt)
    if (clauses.length > 0) return clauses
  }
  return []
}

/** The words for the pause card, machines first. */
export const WORDS_TO_TRY: readonly { word: string; picture: Picture }[] = [
  { word: 'kaivuri', picture: 'digger' },
  { word: 'kippiauto', picture: 'dumper' },
  { word: 'puskutraktori', picture: 'dozer' },
  { word: 'jyrä', picture: 'roller' },
  { word: 'betoniauto', picture: 'mixer' },
  { word: 'trukki', picture: 'forklift' },
  { word: 'nosturi', picture: 'tower' },
  { word: 'rekka', picture: 'semi' },
  { word: 'autonosturi', picture: 'mobile' },
  { word: 'hiekka', picture: 'sand' },
  { word: 'kivi', picture: 'rock' },
  { word: 'kuoppa', picture: 'hole' },
  { word: 'tie', picture: 'road' },
  { word: 'vesi', picture: 'water' },
  { word: 'talo', picture: 'house' },
  { word: 'silta', picture: 'bridge' },
]
