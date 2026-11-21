import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Voice, findRecognizer, type Recognizer, type RecognizerCtor, type RecognizerEvent } from './listen'
import type { Spoken } from './model'
import { partsOf } from './speech'

class Fake implements Recognizer {
  static all: Fake[] = []
  lang = ''
  continuous = false
  interimResults = false
  maxAlternatives = 0
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onresult: ((e: RecognizerEvent) => void) | null = null
  onspeechstart: (() => void) | null = null
  onspeechend: (() => void) | null = null
  started = false
  aborted = false
  failOnStart: Error | null = null
  constructor() {
    Fake.all.push(this)
  }
  start() {
    if (this.failOnStart !== null) throw this.failOnStart
    this.started = true
  }
  abort() {
    this.aborted = true
  }
  /** The browser reports it is listening. */
  open() {
    this.onstart?.()
  }
  /** Results: `texts` are the whole list so far, the last `interim` ones not final; the event starts at `from`. */
  say(texts: string[][], finals: boolean[], from: number) {
    const results = texts.map((alts, i) => Object.assign(alts.map((transcript) => ({ transcript })), { isFinal: finals[i] }))
    this.onresult?.({ resultIndex: from, results: Object.assign(results, { length: results.length }) } as unknown as RecognizerEvent)
  }
  interim(text: string, index = 0) {
    this.say([...Array(index).fill(['']), [text]], [...Array(index).fill(true), false], index)
  }
  final(text: string, index = 0, alts: string[] = []) {
    this.say([...Array(index).fill(['']), [text, ...alts]], [...Array(index).fill(true), true], index)
  }
}

interface Heard {
  clauses: Spoken[]
  text: string
  first: boolean
}

let voice: Voice
let heard: Heard[]
let unheard: string[]
let changes: number

const latest = () => Fake.all[Fake.all.length - 1]
const parts = (h: Heard) => h.clauses.map(partsOf)

const realStart = Fake.prototype.start

afterEach(() => {
  Fake.prototype.start = realStart
  vi.unstubAllGlobals()
})

beforeEach(() => {
  Fake.all = []
  voice = new Voice(Fake as unknown as RecognizerCtor, 'fi')
  heard = []
  unheard = []
  changes = 0
  voice.heard = (clauses, text, first) => heard.push({ clauses, text, first })
  voice.unheard = (text) => unheard.push(text)
  voice.changed = () => changes++
})

/** The language tag a fresh voice in `lang` gives its recognizer. */
function latestLang(lang: 'fi' | 'en'): string {
  new Voice(Fake as unknown as RecognizerCtor, lang).toggle()
  return latest().lang
}

/** Turned on and listening. */
function listen() {
  voice.toggle()
  latest().open()
}

describe('Voice states', () => {
  it('is unsupported with no recognizer, and cannot be toggled', () => {
    const v = new Voice(null, 'fi')
    expect(v.state).toBe('unsupported')
    expect(() => v.toggle()).toThrow()
  })

  it('goes starting, on, off', () => {
    expect(voice.state).toBe('off')
    voice.toggle()
    expect(voice.state).toBe('starting')
    const rec = latest()
    expect(rec.started).toBe(true)
    expect([rec.lang, rec.continuous, rec.interimResults, rec.maxAlternatives]).toEqual(['fi-FI', true, true, 5])
    rec.open()
    expect(voice.state).toBe('on')
    voice.toggle()
    expect(voice.state).toBe('off')
    expect(rec.aborted).toBe(true)
  })

  it('listens in the player’s language: Finnish as fi-FI, English as en-GB', () => {
    expect(latestLang('fi')).toBe('fi-FI')
    expect(latestLang('en')).toBe('en-GB')
  })

  it('shows that it hears between speechstart and speechend', () => {
    listen()
    latest().onspeechstart?.()
    expect(voice.hearing).toBe(true)
    latest().onspeechend?.()
    expect(voice.hearing).toBe(false)
    expect(changes).toBeGreaterThan(2)
  })

  it('finds the browser recognizer, standard name first', () => {
    vi.stubGlobal('window', {})
    expect(findRecognizer()).toBeNull()
    vi.stubGlobal('window', { webkitSpeechRecognition: Fake })
    expect(findRecognizer()).toBe(Fake)
    vi.stubGlobal('window', { SpeechRecognition: Voice, webkitSpeechRecognition: Fake })
    expect(findRecognizer()).toBe(Voice)
  })
})

describe('the commit rule', () => {
  it('fires nothing for an interim "kippaa" before 500 ms, then fires it', () => {
    listen()
    latest().interim('kippaa')
    voice.advance(0.45)
    expect(heard).toEqual([])
    voice.advance(0.06)
    expect(heard).toHaveLength(1)
    expect(parts(heard[0])).toEqual([['work:give']])
    expect(heard[0].first).toBe(true)
  })

  it('fires one goal with thenPress when "kippaa kuoppaan" arrives inside the 500 ms', () => {
    listen()
    latest().interim('kippaa')
    voice.advance(0.3)
    latest().interim('kippaa kuoppaan')
    voice.advance(0.3)
    expect(heard).toEqual([])
    voice.advance(0.3)
    expect(heard).toHaveLength(1)
    expect(parts(heard[0])).toEqual([['work:give', 'to:hole']])
  })

  it('fires stop, honk and help at once on an interim', () => {
    listen()
    latest().interim('seis')
    expect(parts(heard[0])).toEqual([['stop']])
    latest().interim('seis tööt')
    expect(parts(heard[1])).toEqual([['honk']])
    latest().interim('seis tööt apua')
    expect(parts(heard[2])).toEqual([['help']])
    voice.advance(1)
    expect(heard).toHaveLength(3)
  })

  it('holds the other parts of a stop sentence until they settle', () => {
    listen()
    latest().interim('älä kaiva')
    expect(parts(heard[0])).toEqual([['stop']])
    voice.advance(0.5)
    expect(parts(heard[1])).toEqual([['work:take']])
  })

  it('fires everything at once on a final result', () => {
    listen()
    latest().final('kippiauto kippaa kuoppaan')
    expect(heard).toHaveLength(1)
    expect(parts(heard[0])).toEqual([['who:dumper', 'work:give', 'to:hole']])
    expect(heard[0].text).toBe('kippiauto kippaa kuoppaan')
  })

  it('sends only new parts as the text grows', () => {
    listen()
    latest().interim('kaivuri')
    voice.advance(0.5)
    expect(parts(heard[0])).toEqual([['who:digger']])
    latest().interim('kaivuri kaiva hiekkaa')
    voice.advance(0.5)
    expect(parts(heard[1])).toEqual([['work:take', 'to:sand']])
    latest().final('kaivuri kaiva hiekkaa')
    expect(heard).toHaveLength(2)
  })

  it('sends who again with come', () => {
    listen()
    latest().interim('kippiauto')
    voice.advance(0.5)
    expect(parts(heard[0])).toEqual([['who:dumper']])
    latest().interim('kippiauto tule tänne')
    voice.advance(0.5)
    expect(parts(heard[1])).toEqual([['who:dumper', 'come']])
  })

  it('marks only the first call of an utterance as first, and a second utterance as first again', () => {
    listen()
    latest().interim('seis')
    voice.advance(0.1)
    latest().final('seis kaivuri')
    expect(heard.map((h) => h.first)).toEqual([true, false])
    latest().final('rekka', 1)
    expect(heard[2].first).toBe(true)
    expect(parts(heard[2])).toEqual([['who:semi']])
  })

  it('gives each clause of one sentence in one call', () => {
    listen()
    latest().final('aja kuopalle ja kippaa')
    expect(parts(heard[0])).toEqual([['move:forward', 'to:hole'], ['work:give']])
  })

  it('does not fire a revised-away text that never settled', () => {
    listen()
    latest().interim('kaivuri')
    voice.advance(0.4)
    latest().interim('kaivuli')
    voice.advance(0.4)
    expect(heard).toEqual([])
    voice.advance(0.2)
    expect(parts(heard[0])).toEqual([['who:digger']])
  })

  it('does not fire a final index again when the browser reports it again', () => {
    listen()
    latest().final('kaivuri')
    latest().final('kaivuri')
    voice.advance(1)
    expect(heard).toHaveLength(1)
  })

  it('reads again what starts at a lower result index, once the words may be a new command', () => {
    listen()
    latest().final('rekka', 2)
    voice.advance(3)
    latest().final('rekka', 0)
    expect(heard).toHaveLength(2)
  })

  it('does not fire a bare "ei" on the first interim: a child starts many sentences with it', () => {
    listen()
    latest().interim('ei')
    expect(heard).toEqual([])
    latest().interim('ei se ole')
    voice.advance(2)
    expect(heard).toEqual([])
    expect(unheard).toEqual([])
  })

  it('stops on an "ei" that stands for half a second, or is final, and on "seis" at once', () => {
    listen()
    latest().interim('ei')
    voice.advance(0.45)
    expect(heard).toEqual([])
    voice.advance(0.06)
    expect(parts(heard[0])).toEqual([['stop']])
    voice.advance(2)
    latest().final('ei ei', 1)
    expect(parts(heard[1])).toEqual([['stop']])
  })

  it('stops at once on "seis" even after "ei"', () => {
    listen()
    latest().interim('ei')
    latest().interim('ei seis')
    expect(parts(heard[0])).toEqual([['stop']])
  })
})

describe('one utterance fires once, whatever the browser does with the result indexes', () => {
  it('Chrome desktop: a steadier result and a newer one, then the first final with the whole text and the second gone', () => {
    listen()
    latest().say([['kaivuri'], ['kaiva']], [false, false], 0)
    voice.advance(0.5)
    expect(parts(heard[0])).toEqual([['who:digger', 'work:take']])
    latest().say([['kaivuri'], ['kaiva hiekkaa']], [false, false], 1)
    voice.advance(0.5)
    expect(parts(heard[1])).toEqual([['to:sand']])
    latest().say([['kaivuri kaiva hiekkaa']], [true], 0)
    voice.advance(2)
    expect(heard).toHaveLength(2)
    expect(unheard).toEqual([])
  })

  it('Chrome desktop: the steadier result turning final with the whole text fires nothing twice', () => {
    listen()
    latest().say([['kaivuri'], ['kaiva']], [false, false], 0)
    latest().say([['kaivuri kaiva']], [true], 0)
    voice.advance(3)
    expect(heard).toHaveLength(1)
    expect(parts(heard[0])).toEqual([['who:digger', 'work:take']])
    latest().say([['kaivuri kaiva'], ['kippaa']], [true, false], 1)
    voice.advance(0.5)
    expect(heard).toHaveLength(2)
    expect(parts(heard[1])).toEqual([['work:give']])
    expect(heard[1].first).toBe(true)
  })

  it('Android: each new result repeats the text of the session so far', () => {
    listen()
    latest().say([['kaivuri']], [true], 0)
    latest().say([['kaivuri'], ['kaivuri kaiva']], [true, false], 1)
    voice.advance(0.5)
    expect(heard.map((h) => h.clauses.map(partsOf))).toEqual([[['who:digger']], [['work:take']]])
    latest().say([['kaivuri'], ['kaivuri kaiva']], [true, true], 1)
    latest().say([['kaivuri'], ['kaivuri kaiva'], ['kaivuri kaiva kippaa']], [true, true, false], 2)
    voice.advance(0.5)
    expect(heard).toHaveLength(3)
    expect(parts(heard[2])).toEqual([['work:give']])
  })

  it('Android: a final sent again, under its own index and under another', () => {
    listen()
    latest().final('kaiva')
    latest().final('kaiva')
    latest().say([['kaiva'], ['kaiva']], [true, true], 1)
    latest().say([['kaiva']], [true], 0)
    voice.advance(1)
    expect(heard).toHaveLength(1)
  })

  it('a late event with a lower result index does not send again what went', () => {
    listen()
    latest().say([['kippiauto'], ['aja kuopalle']], [true, false], 0)
    voice.advance(0.5)
    expect(heard).toHaveLength(2)
    latest().say([['kippiauto']], [true], 0)
    latest().say([['kippiauto'], ['aja kuopalle']], [true, true], 1)
    expect(heard).toHaveLength(2)
    expect(unheard).toEqual([])
  })

  it('a late event drops only the tracks at or above its index', () => {
    listen()
    latest().final('kippiauto')
    latest().interim('kaiva', 2)
    latest().say([[''], ['kippaa']], [true, true], 1)
    voice.advance(2)
    expect(heard.map((h) => h.clauses.map(partsOf))).toEqual([[['who:dumper']], [['work:give']]])
  })

  it('a real repeat 3 s later fires again', () => {
    listen()
    latest().final('kaiva')
    voice.advance(3)
    latest().final('kaiva', 1)
    expect(heard.map((h) => h.clauses.map(partsOf))).toEqual([[['work:take']], [['work:take']]])
    voice.advance(3)
    latest().say([['kaiva'], ['kaiva'], ['kaiva kaiva']], [true, true, true], 2)
    expect(heard).toHaveLength(3)
  })

  it('the same words under another index within 1.5 s do not fire again', () => {
    listen()
    latest().interim('kaiva')
    voice.advance(0.6)
    latest().final('kaiva', 1)
    expect(heard).toHaveLength(1)
  })

  it('a list sent again from a lower index after 3 s does not fire a final command a second time', () => {
    listen()
    latest().final('kaiva')
    latest().interim('kippaa', 1)
    voice.advance(0.6)
    expect(heard).toHaveLength(2)
    voice.advance(3)
    latest().say([['kaiva'], ['kippaa']], [true, true], 0)
    expect(heard.map((h) => h.clauses.map(partsOf)).filter((c) => c.some((p) => p.includes('work:take')))).toHaveLength(1)
  })

  it('two honks within 1.5 s are two honks', () => {
    listen()
    latest().final('tööt')
    voice.advance(0.5)
    latest().final('tööt', 1)
    expect(heard.map((h) => h.clauses.map(partsOf))).toEqual([[['honk']], [['honk']]])
  })

  it('naming another machine in between makes the first name a command again', () => {
    listen()
    latest().final('kaivuri')
    latest().final('kippiauto', 1)
    latest().final('kaivuri', 2)
    expect(heard.map((h) => h.clauses.map(partsOf))).toEqual([[['who:digger']], [['who:dumper']], [['who:digger']]])
  })

  it('takes the first alternative with parts', () => {
    listen()
    latest().final('kerro', 0, ['kissa', 'kaivuri'])
    expect(parts(heard[0])).toEqual([['who:digger']])
    expect(unheard).toEqual([])
  })

  it('reports a final result with words and no parts, and not an empty one', () => {
    listen()
    latest().final('kissa istuu puussa')
    latest().final('   ', 1)
    expect(heard).toEqual([])
    expect(unheard).toEqual(['kissa istuu puussa'])
  })

  it('does not report an interim with no parts', () => {
    listen()
    latest().interim('kissa')
    voice.advance(2)
    expect(unheard).toEqual([])
  })
})

describe('sessions', () => {
  it('hops on "kaivuri" in two sessions: the sets clear on every start', () => {
    listen()
    voice.advance(1)
    latest().final('kaivuri')
    latest().onend?.()
    expect(Fake.all).toHaveLength(2)
    latest().open()
    latest().final('kaivuri')
    expect(heard).toHaveLength(2)
    expect(parts(heard[1])).toEqual([['who:digger']])
  })

  it('restarts on end while wanted, at most once a second', () => {
    listen()
    voice.advance(0.4)
    latest().onend?.()
    expect(Fake.all).toHaveLength(1)
    expect(voice.state).toBe('on')
    voice.advance(0.5)
    expect(Fake.all).toHaveLength(1)
    voice.advance(0.2)
    expect(Fake.all).toHaveLength(2)
    expect(latest().started).toBe(true)
    voice.advance(1.5)
    latest().onend?.()
    expect(Fake.all).toHaveLength(3)
  })

  it('restarts at once after a session that lasted a second, and waits out the second after a shorter one', () => {
    listen()
    voice.advance(1)
    latest().onend?.()
    expect(Fake.all).toHaveLength(2)
    voice.advance(0.99)
    latest().onend?.()
    expect(Fake.all).toHaveLength(2)
    voice.advance(0.01)
    expect(Fake.all).toHaveLength(3)
  })

  it('cannot spin: a recognizer that ends the moment it starts is restarted once a second', () => {
    listen()
    for (let i = 0; i < 10; i++) {
      latest().onend?.()
      voice.advance(0.5)
    }
    expect(Fake.all.length).toBeLessThanOrEqual(7)
  })

  it('does not restart after it was turned off', () => {
    listen()
    voice.advance(2)
    voice.toggle()
    latest().onend?.()
    voice.advance(5)
    expect(Fake.all).toHaveLength(1)
    expect(voice.state).toBe('off')
  })

  it('ignores what an old recognizer says after a toggle off', () => {
    listen()
    const old = latest()
    voice.toggle()
    old.final('kaivuri')
    expect(heard).toEqual([])
  })

  it('treats no-speech and aborted as normal', () => {
    listen()
    latest().onerror?.({ error: 'no-speech' })
    latest().onerror?.({ error: 'aborted' })
    expect(voice.state).toBe('on')
  })

  it('suspends and comes back when it was wanted', () => {
    listen()
    voice.suspend()
    expect(voice.state).toBe('off')
    expect(Fake.all[0].aborted).toBe(true)
    voice.advance(5)
    expect(Fake.all).toHaveLength(1)
    voice.resume()
    expect(Fake.all).toHaveLength(2)
    expect(voice.state).toBe('starting')
    latest().open()
    expect(voice.state).toBe('on')
  })

  it('stays off after a suspend and resume when it was not wanted', () => {
    voice.suspend()
    voice.resume()
    expect(Fake.all).toHaveLength(0)
    expect(voice.state).toBe('off')
  })
})

describe('errors', () => {
  it('not-allowed is denied and keeps its code', () => {
    listen()
    latest().onerror?.({ error: 'not-allowed' })
    expect(voice.state).toBe('denied')
    expect(voice.errorName).toBe('not-allowed')
    latest().onend?.()
    voice.advance(5)
    expect(Fake.all).toHaveLength(1)
  })

  it('not-allowed on the first session, before the mic was ever on, is denied', () => {
    voice.toggle()
    latest().onerror?.({ error: 'not-allowed' })
    expect(voice.state).toBe('denied')
  })

  it.each(['network', 'audio-capture', 'language-not-supported', 'service-not-allowed'])('%s is broken and keeps its name', (error) => {
    listen()
    latest().onerror?.({ error })
    expect(voice.state).toBe('broken')
    expect(voice.errorName).toBe(error)
  })

  it('a restart refused with not-allowed after the mic was on goes off quietly, and a tap starts it again', () => {
    listen()
    voice.advance(2)
    latest().onend?.()
    expect(Fake.all).toHaveLength(2)
    latest().onerror?.({ error: 'not-allowed' })
    expect(voice.state).toBe('off')
    expect(voice.errorName).toBeNull()
    voice.toggle()
    expect(voice.state).toBe('starting')
    expect(Fake.all).toHaveLength(3)
  })

  it('a refusal after a resume goes off quietly too', () => {
    listen()
    voice.suspend()
    voice.resume()
    latest().onerror?.({ error: 'not-allowed' })
    expect(voice.state).toBe('off')
  })

  it('a start that throws on the child tap is broken with the error name', () => {
    const e = new Error('already started')
    e.name = 'InvalidStateError'
    Fake.prototype.start = function (this: Fake) {
      throw e
    }
    voice.toggle()
    expect(voice.state).toBe('broken')
    expect(voice.errorName).toBe('InvalidStateError')
  })

  it.each(['NotAllowedError', 'SecurityError'])('a start that throws %s on the child tap is denied as not-allowed', (name) => {
    const e = new Error('no')
    e.name = name
    Fake.prototype.start = function (this: Fake) {
      throw e
    }
    voice.toggle()
    expect(voice.state).toBe('denied')
    expect(voice.errorName).toBe('not-allowed')
  })

  it.each(['NotAllowedError', 'SecurityError'])('an automatic restart that throws %s goes off quietly', (name) => {
    listen()
    voice.advance(2)
    const e = new Error('no')
    e.name = name
    Fake.prototype.start = function (this: Fake) {
      throw e
    }
    latest().onend?.()
    expect(voice.state).toBe('off')
    expect(voice.errorName).toBeNull()
    Fake.prototype.start = realStart
    voice.toggle()
    expect(voice.state).toBe('starting')
  })

  it('a restart after the wait that throws NotAllowedError goes off quietly', () => {
    listen()
    voice.advance(0.2)
    latest().onend?.()
    const e = new Error('no')
    e.name = 'NotAllowedError'
    Fake.prototype.start = function (this: Fake) {
      throw e
    }
    voice.advance(1)
    expect(voice.state).toBe('off')
  })

  it('can be tried again from denied', () => {
    listen()
    latest().onerror?.({ error: 'not-allowed' })
    voice.toggle()
    expect(voice.state).toBe('starting')
    expect(Fake.all).toHaveLength(2)
  })
})

describe('the 60 s turn-off', () => {
  it('turns itself off after 60 s with nothing accepted', () => {
    listen()
    for (let i = 0; i < 59; i++) voice.advance(1)
    expect(voice.state).toBe('on')
    voice.advance(1)
    expect(voice.state).toBe('off')
    expect(Fake.all[0].aborted).toBe(true)
  })

  it('counts from the last thing accepted', () => {
    listen()
    for (let i = 0; i < 50; i++) voice.advance(1)
    latest().final('kaivuri')
    for (let i = 0; i < 59; i++) voice.advance(1)
    expect(voice.state).toBe('on')
    voice.advance(1)
    expect(voice.state).toBe('off')
  })

  it('does not count words that mean nothing, or a pause', () => {
    listen()
    for (let i = 0; i < 50; i++) voice.advance(1)
    latest().final('kissa istuu puussa')
    for (let i = 0; i < 10; i++) voice.advance(1)
    expect(voice.state).toBe('off')

    listen()
    voice.suspend()
    voice.advance(120)
    voice.resume()
    expect(voice.state).toBe('starting')
  })
})

describe('in English', () => {
  beforeEach(() => {
    voice = new Voice(Fake as unknown as RecognizerCtor, 'en')
    voice.heard = (clauses, text, first) => heard.push({ clauses, text, first })
    voice.unheard = (text) => unheard.push(text)
  })

  it('listens as en-GB', () => {
    listen()
    expect(latest().lang).toBe('en-GB')
  })

  it('fires nothing for an interim "tip" before 500 ms, and one goal when "tip it in the hole" arrives inside it', () => {
    listen()
    latest().interim('tip')
    voice.advance(0.3)
    latest().interim('tip it in the hole')
    voice.advance(0.3)
    expect(heard).toEqual([])
    voice.advance(0.3)
    expect(heard.map(parts)).toEqual([[['work:give', 'to:hole']]])
  })

  it('fires "stop" and "honk" at once', () => {
    listen()
    latest().interim('stop')
    latest().interim('stop honk')
    expect(heard.map(parts)).toEqual([[['stop']], [['honk']]])
  })

  it('does not fire a bare "no" at once, and stops once it has stood half a second', () => {
    listen()
    latest().interim('no')
    expect(heard).toEqual([])
    voice.advance(0.51)
    expect(parts(heard[0])).toEqual([['stop']])
  })

  it('takes "no" at the start of a sentence for no stop', () => {
    listen()
    latest().interim('no')
    latest().interim('no the digger')
    voice.advance(1)
    expect(heard.map(parts)).toEqual([[['who:digger']]])
  })

  it('gives each clause of a final sentence in one call, and takes the first alternative with parts', () => {
    listen()
    latest().final('dump truck drive to the hole and tip')
    expect(parts(heard[0])).toEqual([['who:dumper', 'move:forward', 'to:hole'], ['work:give']])
    latest().final('bigger', 1, ['dig her'])
    expect(parts(heard[1])).toEqual([['who:digger']])
    latest().final('I saw a bird', 2)
    expect(unheard).toEqual(['I saw a bird'])
  })
})
