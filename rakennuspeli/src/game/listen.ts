/**
 * The microphone: the browser's speech recognizer turned into parts of Finnish speech. It runs
 * from `advance(dt)`, once a frame, so the stability check, the restart throttle and the
 * turn-off all count the game's own seconds and a test can step them exactly.
 */
import type { Spoken } from './model'
import { isBareNo, parseBest, partsOf, wordsOf } from './speech'

/** The small part of the Web Speech API this uses. */
export interface RecognizerAlternative {
  transcript: string
}
export interface RecognizerResult {
  length: number
  isFinal: boolean
  [index: number]: RecognizerAlternative
}
export interface RecognizerEvent {
  resultIndex: number
  results: { length: number; [index: number]: RecognizerResult }
}
export interface Recognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
  onresult: ((e: RecognizerEvent) => void) | null
  onspeechstart: (() => void) | null
  onspeechend: (() => void) | null
  start(): void
  abort(): void
}
export type RecognizerCtor = new () => Recognizer

/** The browser's recognizer, or null (Firefox has none). */
export function findRecognizer(): RecognizerCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export type VoiceState = 'unsupported' | 'off' | 'starting' | 'on' | 'denied' | 'broken'

/** Seconds an interim text must stand unchanged before its parts count. */
export const STABLE_FOR = 0.5
/** Seconds between two starts at the fastest. */
export const RESTART_EVERY = 1
/** Seconds with nothing accepted before it turns itself off. */
export const TURN_OFF_AFTER = 60

/** Seconds a part that went is not sent again: one utterance, however the browser cuts it up. */
export const REPEAT_AFTER = 1.5

/** Parts that fire on any hypothesis. */
const AT_ONCE = new Set(['stop', 'honk', 'help'])

/** What one utterance has said so far; it is keyed by the result index it started at. */
interface Track {
  committed: Set<string>
  text: string
  /** The text is only "ei": a stop that waits to be sure, like other words. */
  bareNo: boolean
  stable: number
  /** The stable-text check has run for this text. */
  checked: boolean
  clauses: Spoken[]
  /** Something went on to `heard` from this index. */
  fired: boolean
  /** Final: nothing from it counts again, even if the browser reports it again. */
  final: boolean
}

/** A clause cut down to the named parts. */
function only(s: Spoken, keep: Set<string>): Spoken {
  return {
    who: s.who !== null && keep.has(`who:${s.who}`) ? s.who : null,
    move: s.move !== null && keep.has(`move:${s.move}`) ? s.move : null,
    work: s.work !== null && keep.has(`work:${s.work}`) ? s.work : null,
    to: s.to !== null && keep.has(`to:${s.to}`) ? s.to : null,
    come: s.come && keep.has('come'),
    honk: s.honk && keep.has('honk'),
    stop: s.stop && keep.has('stop'),
    help: s.help && keep.has('help'),
  }
}

export class Voice {
  state: VoiceState
  /** Between speechstart and speechend. */
  hearing = false
  /** The recognizer's error code, or the name of a start that threw, while `denied` or `broken`, else null. */
  errorName: string | null = null
  /** Called after `state` or `hearing` changes. */
  changed: () => void = () => {}
  /** New parts of speech: `firstInUtterance` is false when earlier clauses of the same utterance already went. */
  heard: (clauses: Spoken[], text: string, firstInUtterance: boolean) => void = () => {}
  /** A final result with words and no parts. */
  unheard: (text: string) => void = () => {}

  private ctor: RecognizerCtor | null
  private rec: Recognizer | null = null
  /** The child wants it on. */
  private want = false
  private suspended = false
  /** The mic was `on` since the child last tapped it. */
  private wasOn = false
  private tracks = new Map<number, Track>()
  private lastIndex = 0
  /** The session's own text that is already final, to cut off a browser that repeats it. */
  private finalText = ''
  /** When each part last went, on the game clock. */
  private recent = new Map<string, number>()
  private clock = 0
  private sinceStart = RESTART_EVERY
  private restartPending = false
  private idle = 0

  constructor(ctor: RecognizerCtor | null) {
    this.ctor = ctor
    this.state = ctor === null ? 'unsupported' : 'off'
  }

  /** The mic button. */
  toggle() {
    if (this.ctor === null) throw new Error('toggle: this browser has no speech recognizer')
    if (this.want) {
      this.want = false
      this.stopRecognizer()
      this.set('off')
      return
    }
    this.want = true
    this.wasOn = false
    this.idle = 0
    if (!this.suspended) this.start('starting', true)
  }

  /** Pause and a hidden page: stop listening, and come back on `resume` if it was wanted. */
  suspend() {
    this.suspended = true
    this.restartPending = false
    this.stopRecognizer()
    if (this.state === 'starting' || this.state === 'on') this.set('off')
  }

  resume() {
    this.suspended = false
    if (this.want) {
      this.idle = 0
      this.start('starting', false)
    }
  }

  /** A new game, or the old town back: listening stops until the mic is tapped again. */
  turnOff() {
    this.want = false
    this.stopRecognizer()
    if (this.state === 'starting' || this.state === 'on') this.set('off')
  }

  /** Once a frame. */
  advance(dt: number) {
    this.sinceStart += dt
    this.clock += dt
    if (this.restartPending && this.want && !this.suspended && this.sinceStart >= RESTART_EVERY) this.start(this.state, false)
    if (this.want && !this.suspended && this.rec !== null) {
      this.idle += dt
      if (this.idle >= TURN_OFF_AFTER) {
        this.want = false
        this.stopRecognizer()
        this.set('off')
      }
    }
    for (const t of this.tracks.values()) {
      if (t.final || t.checked) continue
      t.stable += dt
      if (t.stable >= STABLE_FOR) {
        t.checked = true
        this.fire(t, false)
      }
    }
  }

  private set(state: VoiceState) {
    this.state = state
    if (state !== 'broken' && state !== 'denied') this.errorName = null
    if (state !== 'on') this.hearing = false
    this.changed()
  }

  private stopRecognizer() {
    this.restartPending = false
    this.tracks.clear()
    this.hearing = false
    if (this.rec !== null) this.rec.abort()
    this.rec = null
  }

  /** The mic cannot work: `name` is what the pause card writes its line from. */
  private fail(state: 'denied' | 'broken', name: string) {
    this.state = state
    this.errorName = name
    this.hearing = false
    this.changed()
  }

  /** A fresh recognizer. `state` is what to show until it reports started; `byChild` is a start the child's own tap asked for, the only one a browser must obey. */
  private start(state: VoiceState, byChild: boolean) {
    if (this.ctor === null) throw new Error('start: no recognizer')
    const rec = new this.ctor()
    rec.lang = 'fi-FI'
    rec.continuous = true
    rec.interimResults = true
    rec.maxAlternatives = 5
    rec.onstart = () => {
      if (this.rec !== rec) return
      this.wasOn = true
      this.set('on')
    }
    rec.onspeechstart = () => {
      if (this.rec !== rec) return
      this.hearing = true
      this.changed()
    }
    rec.onspeechend = () => {
      if (this.rec !== rec) return
      this.hearing = false
      this.changed()
    }
    rec.onresult = (e) => {
      if (this.rec === rec) this.result(e)
    }
    rec.onerror = (e) => {
      if (this.rec !== rec) return
      // No speech and an abort are the normal ways a session ends: `onend` restarts it.
      if (e.error === 'no-speech' || e.error === 'aborted') return
      this.want = false
      this.stopRecognizer()
      // A start no tap asked for may be refused by a browser that allowed the mic a minute ago: that is no block.
      if (e.error === 'not-allowed' && !byChild && this.wasOn) this.set('off')
      else if (e.error === 'not-allowed') this.fail('denied', e.error)
      // The mic is fine but hearing cannot work (Siri and Dictation off, no Finnish).
      else this.fail('broken', e.error)
    }
    rec.onend = () => {
      if (this.rec !== rec) return
      this.hearing = false
      this.tracks.clear()
      if (!this.want || this.suspended) {
        this.rec = null
        this.set('off')
        return
      }
      this.restartPending = true
      this.changed()
      // A session that lasted a second restarts at once, so the start of the next sentence is heard; a shorter one waits out the second, so a recognizer that fails cannot spin.
      if (this.sinceStart >= RESTART_EVERY) this.start(this.state, false)
    }
    this.rec = rec
    this.restartPending = false
    this.sinceStart = 0
    this.tracks.clear()
    this.recent.clear()
    this.finalText = ''
    this.lastIndex = 0
    try {
      rec.start()
    } catch (err) {
      const name = err instanceof Error ? err.name : 'start-failed'
      const refused = name === 'NotAllowedError' || name === 'SecurityError'
      this.want = false
      this.stopRecognizer()
      // Only the child's own tap can prove the mic is blocked: a refused automatic start goes quiet and the next tap tries again.
      if (refused && !byChild) this.set('off')
      else if (refused) this.fail('denied', 'not-allowed')
      else this.fail('broken', name)
      return
    }
    if (this.state !== state) this.set(state)
  }

  /** The text of results, cut at the words the session already had final; a text that is only those words stays whole (a child says it again). */
  private withoutFinal(text: string): string {
    const done = wordsOf(this.finalText)
    const mine = wordsOf(text)
    if (mine.length <= done.length || done.some((w, k) => mine[k] !== w)) return text
    return mine.slice(done.length).join(' ')
  }

  /** The top alternative and the others of results read as one text: alternative j is each result's j-th. */
  private alternatives(rs: RecognizerResult[]): string[] {
    const n = Math.max(...rs.map((r) => r.length))
    const alts: string[] = []
    for (let j = 0; j < n; j++) alts.push(rs.map((r) => (r[j] ?? r[0]).transcript).join(' ').trim())
    return alts
  }

  private result(e: RecognizerEvent) {
    // A late event: what starts at or after its index and is not final is read again, what already went is remembered in `recent`. A final track stays, so a browser that sends the list again cannot make it fire twice.
    if (e.resultIndex < this.lastIndex) for (const [k, t] of [...this.tracks]) if (k >= e.resultIndex && !t.final) this.tracks.delete(k)
    this.lastIndex = e.resultIndex
    const list: RecognizerResult[] = []
    for (let i = 0; i < e.results.length; i++) list.push(e.results[i])
    for (let i = e.resultIndex; i < list.length; i++) if (list[i].isFinal) this.final(i, this.alternatives([list[i]]))
    // One utterance: every result that is not final from the first of them on.
    const open = list.findIndex((r) => !r.isFinal)
    if (open >= 0) this.interim(open, this.alternatives(list.slice(open).filter((r) => !r.isFinal)))
  }

  private interim(start: number, alts: string[]) {
    const own = alts.map((a) => this.withoutFinal(a))
    let t = this.tracks.get(start)
    if (t === undefined || t.final) {
      t = this.newTrack()
      this.tracks.set(start, t)
    }
    this.read(t, own)
    this.fire(t, true)
  }

  private final(start: number, alts: string[]) {
    let t = this.tracks.get(start)
    if (t?.final) return
    if (t === undefined) {
      t = this.newTrack()
      this.tracks.set(start, t)
    }
    const own = alts.map((a) => this.withoutFinal(a))
    this.read(t, own)
    this.fire(t, false)
    if (t.clauses.length === 0 && t.text.trim() !== '') this.unheard(t.text)
    t.final = true
    const whole = wordsOf(alts[0])
    const done = wordsOf(this.finalText)
    this.finalText = done.length <= whole.length && done.every((w, k) => whole[k] === w) ? alts[0] : `${this.finalText} ${alts[0]}`
  }

  private newTrack(): Track {
    return { committed: new Set(), text: '', bareNo: false, stable: 0, checked: false, clauses: [], fired: false, final: false }
  }

  /** The track's text and clauses from the alternatives, with the stability clock restarted when the text changed. */
  private read(t: Track, alts: string[]) {
    const text = alts[0] ?? ''
    if (text !== t.text) {
      t.text = text
      t.stable = 0
      t.checked = false
    }
    t.bareNo = isBareNo(text)
    t.clauses = parseBest(alts)
  }

  /** Send on the parts of a track that have not gone yet: only the at-once ones, or all. */
  private fire(t: Track, atOnceOnly: boolean) {
    const out: Spoken[] = []
    for (const c of t.clauses) {
      const due = partsOf(c).filter((p) => !t.committed.has(p) && (!atOnceOnly || (AT_ONCE.has(p) && !(p === 'stop' && t.bareNo))))
      for (const p of due) t.committed.add(p)
      // Two honks are two honks: only the parts that wait for stable text are cut off as a repeat.
      const fresh = due.filter((p) => AT_ONCE.has(p) || this.clock - (this.recent.get(p) ?? -Infinity) >= REPEAT_AFTER)
      if (fresh.length === 0) continue
      const keep = new Set(fresh)
      // A friend coming needs to know whom: the machine goes along again.
      if (keep.has('come') && c.who !== null) keep.add(`who:${c.who}`)
      out.push(only(c, keep))
      for (const p of fresh) {
        // Another machine named since then makes this one's name a new command.
        if (p.startsWith('who:')) for (const k of [...this.recent.keys()]) if (k.startsWith('who:')) this.recent.delete(k)
        this.recent.set(p, this.clock)
      }
    }
    if (out.length === 0) return
    this.idle = 0
    this.heard(out, t.text, !t.fired)
    t.fired = true
  }
}
