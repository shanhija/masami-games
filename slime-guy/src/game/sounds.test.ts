/**
 * Checks the sounds without ears. The tunes: every bar whole, the forms lined up, the
 * melodies in a singing range that never grinds a semitone over its chord on a beat, each
 * island in its own key and tempo. The voices: a fake audio context records every node,
 * connection and automation (and throws where a browser would), so every sound in every
 * key and every step of every tune is checked to start silent, end silent, stop, stay
 * gentle, stay in the hearing range and reach its bus. The lifecycle: Sounds on the fake
 * context and fake timers (nothing before the first press, the dedup, mute, the tune's
 * clock and crossfades, a tune carrying on where it stopped, the wind and the rise).
 * Loudness was balanced by rendering the synth in a real browser, not here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { COURSE_IDS } from './model'
import {
  CHORDS, CROSSFADE, DEDUP, FADE_IN, FADE_OUT, LOOKAHEAD, MASTER, MUSIC, PLOP_NOTES, PLOP_RUN, SCORES, Sounds, Synth, harmonyUnder, hz, plopRung, tuneSeconds,
  type Deck, type SoundKind, type TuneId,
} from './sounds'

// ---------------------------------------------------------------------------------------
// A fake audio context that records everything and throws where a browser would.

type Event = { kind: 'set' | 'linear' | 'exp' | 'target' | 'cancel'; value: number; time: number }

class FakeParam {
  value: number
  readonly events: Event[] = []
  constructor(value: number) {
    this.value = value
  }
  private add(kind: Event['kind'], value: number, time: number) {
    if (!Number.isFinite(value) || !Number.isFinite(time) || time < 0) throw new RangeError(`${kind} ${value} at ${time}`)
    this.events.push({ kind, value, time })
    if (kind !== 'cancel') this.value = value
  }
  setValueAtTime(value: number, time: number) {
    this.add('set', value, time)
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.add('linear', value, time)
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    if (value <= 0) throw new RangeError(`an exponential ramp to ${value}`)
    this.add('exp', value, time)
  }
  setTargetAtTime(value: number, time: number, constant: number) {
    if (!(constant > 0)) throw new RangeError(`a time constant of ${constant}`)
    this.add('target', value, time)
  }
  cancelScheduledValues(time: number) {
    this.add('cancel', 0, time)
  }
}

class FakeNode {
  readonly outs: (FakeNode | FakeParam)[] = []
  constructor(ctx: FakeContext) {
    ctx.nodes.push(this)
  }
  connect<T extends FakeNode | FakeParam>(dest: T): T {
    if (!(dest instanceof FakeNode) && !(dest instanceof FakeParam)) throw new TypeError('connected to something that is not a node or a param')
    this.outs.push(dest)
    return dest
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1)
}

class FakeFilter extends FakeNode {
  type = 'lowpass'
  readonly frequency = new FakeParam(350)
  readonly Q = new FakeParam(1)
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24)
  readonly knee = new FakeParam(30)
  readonly ratio = new FakeParam(12)
  readonly attack = new FakeParam(0.003)
  readonly release = new FakeParam(0.25)
}

class FakeConvolver extends FakeNode {
  buffer: FakeBuffer | null = null
}

class FakeSource extends FakeNode {
  startAt = -1
  stopAt = -1
  start(time: number) {
    if (this.startAt >= 0) throw new Error('started twice')
    if (!(time >= 0)) throw new RangeError(`started at ${time}`)
    this.startAt = time
  }
  stop(time: number) {
    if (this.startAt < 0) throw new Error('stopped before it started')
    if (!(time >= 0)) throw new RangeError(`stopped at ${time}`)
    this.stopAt = time
  }
}

class FakeOscillator extends FakeSource {
  type = 'sine'
  readonly frequency = new FakeParam(440)
  readonly detune = new FakeParam(0)
}

class FakeBufferSource extends FakeSource {
  buffer: FakeBuffer | null = null
  loop = false
}

interface FakeBuffer {
  numberOfChannels: number
  length: number
  getChannelData: (c: number) => Float32Array
}

class FakeContext {
  currentTime = 0
  readonly sampleRate = 8000
  state: 'running' | 'suspended' = 'running'
  resumes = 0
  readonly nodes: FakeNode[] = []
  readonly destination = new FakeNode(this)
  createGain() {
    return new FakeGain(this)
  }
  createBiquadFilter() {
    return new FakeFilter(this)
  }
  createDynamicsCompressor() {
    return new FakeCompressor(this)
  }
  createConvolver() {
    return new FakeConvolver(this)
  }
  createOscillator() {
    return new FakeOscillator(this)
  }
  createBufferSource() {
    return new FakeBufferSource(this)
  }
  createBuffer(channels: number, length: number, rate: number): FakeBuffer {
    if (!Number.isInteger(length) || length <= 0 || rate !== this.sampleRate || channels < 1) throw new Error(`a buffer of ${channels} x ${length} at ${rate}`)
    const data = Array.from({ length: channels }, () => new Float32Array(length))
    return { numberOfChannels: channels, length, getChannelData: (c) => data[c] }
  }
  resume() {
    this.resumes += 1
    this.state = 'running'
    return Promise.resolve()
  }
}

const asContext = (ctx: FakeContext) => ctx as unknown as BaseAudioContext
const fake = <T>(node: AudioNode) => node as unknown as T

/** Whether `from` reaches `target` along connections between nodes. */
function reaches(from: FakeNode, target: FakeNode): boolean {
  const seen = new Set<FakeNode>()
  const todo = [from]
  while (todo.length > 0) {
    const n = todo.pop()!
    if (n === target) return true
    if (seen.has(n)) continue
    seen.add(n)
    for (const o of n.outs) if (o instanceof FakeNode) todo.push(o)
  }
  return false
}

/** The first gain after a source, through any filters: its envelope, or a modulator's depth. */
function firstGain(source: FakeSource): FakeGain {
  let n: FakeNode = source
  while (!(n instanceof FakeGain)) {
    const next = n.outs[0]
    if (!(next instanceof FakeNode)) throw new Error('a source that goes nowhere')
    n = next
  }
  return n
}

/**
 * Checks every source among `nodes`: it starts at or after `at` and stops after it starts;
 * a voice (heard through `bus`) starts and ends silent within its source's time, never
 * goes back in time, never over `loudest`, and every oscillator's pitch stays from 20 Hz to
 * 16 kHz; a modulator (it drives a param) only starts and stops. Says when the last source
 * stops (after `at`) and how many voices there were.
 */
function audit(nodes: readonly FakeNode[], bus: FakeNode, at: number, loudest: number) {
  // Plain checks rather than expect: a tune makes thousands of voices.
  const check = (ok: boolean, why: string) => {
    if (!ok) throw new Error(why)
  }
  let end = at
  let voices = 0
  for (const n of nodes) {
    if (!(n instanceof FakeSource)) continue
    check(n.startAt >= at - 1e-9, `a source that never started or started early (${n.startAt})`)
    check(n.stopAt > n.startAt, `a source that never stopped (${n.stopAt})`)
    end = Math.max(end, n.stopAt)
    if (n instanceof FakeOscillator) for (const e of n.frequency.events) check(e.value >= 20 && e.value <= 16000, `a pitch of ${e.value} Hz`)
    const env = firstGain(n)
    if (env.outs.every((o) => o instanceof FakeParam)) continue
    voices += 1
    check(reaches(env, bus), 'a voice that never reaches its bus')
    const ev = env.gain.events
    const first = ev[0]
    const last = ev[ev.length - 1]
    check(first.kind === 'set' && first.value <= 0.001 && first.time <= n.startAt + 1e-9, `a voice that starts with a click: ${JSON.stringify(first)}`)
    check(last.value <= 0.001, `a voice that ends with a click: ${JSON.stringify(last)}`)
    check(last.time <= n.stopAt + 1e-9, `a voice cut off at ${n.stopAt} before it faded at ${last.time}`)
    ev.forEach((e, i) => check(i === 0 || e.time >= ev[i - 1].time, 'an envelope going back in time'))
    check(Math.max(...ev.map((e) => e.value)) <= loudest, `a voice louder than ${loudest}: ${Math.max(...ev.map((e) => e.value))}`)
  }
  return { end: end - at, voices }
}

/** A synth on a fake context, and a function that audits what was made since the last call. */
function rig() {
  const ctx = new FakeContext()
  const synth = new Synth(asContext(ctx))
  let from = ctx.nodes.length
  return {
    ctx,
    synth,
    since(bus: AudioNode, at: number, loudest: number) {
      const made = ctx.nodes.slice(from)
      from = ctx.nodes.length
      return audit(made, fake<FakeNode>(bus), at, loudest)
    },
  }
}

/** Every kind once: a Record, so a new kind fails to compile here until it is listed (with how long it may last). */
const LONGEST = {
  go: 1.5, pip: 0.3, jumpBig: 0.6, land: 0.3, landBig: 0.6, bounce: 1, squish: 0.4, unsquish: 0.4, giggle: 0.7, plop: 0.4, burp: 0.6, squeal: 1, hit: 0.8,
  drop: 0.5, bump: 0.3, climb: 1, over: 0.4, windUp: 1.1, spun: 0.8, sneeze: 1, pad: 0.6, whee: 0.8, splash: 1, ptui: 0.8, back: 1, flag: 0.8, easy: 1.1, key: 1.6,
  mouse: 0.4, meow: 0.6, woof: 0.5, neigh: 1, trumpet: 1, trampoline: 0.7, pop1: 0.6, pop5: 0.8, pop100: 2.5, bonk: 1.3, funnel: 1, top: 1.2, unlock: 1, open: 1.1,
  gift: 2.1, cheer: 1, fanfare: 2.5, teach: 1.4, learned: 1, tap: 0.2, select: 0.3, uhuh: 0.5, hop: 0.5, wear: 0.9, jar: 1.2, pattern: 2, fireworks: 3.6,
} satisfies Record<SoundKind, number>
const KINDS = Object.keys(LONGEST) as SoundKind[]
const TUNES = Object.keys(SCORES) as TuneId[]
/** The MIDI note a voice plays at frequency `f`. */
const midiOf = (f: number) => Math.round(69 + 12 * Math.log2(f / 440))
/** The voices' oscillators made by `run` on the rig's context (modulators left out). */
function voicesOf(ctx: FakeContext, run: () => void): FakeOscillator[] {
  const from = ctx.nodes.length
  run()
  return ctx.nodes.slice(from).filter((n): n is FakeOscillator => n instanceof FakeOscillator && firstGain(n).outs.some((o) => o instanceof FakeNode))
}

// ---------------------------------------------------------------------------------------

describe('the tunes', () => {
  it('have whole bars: a slot each eighth, a length exactly where a note starts, a known chord', () => {
    for (const tune of TUNES) {
      const { slots, bars } = SCORES[tune]
      for (const [i, bar] of bars.entries()) {
        const where = `${tune} bar ${i + 1}`
        expect(bar.notes, where).toHaveLength(slots)
        expect(bar.lengths, where).toHaveLength(slots)
        bar.notes.forEach((n, s) => expect(n > 0, `${where} slot ${s}`).toBe(bar.lengths[s] > 0))
        expect(CHORDS[bar.chord], where).toBeDefined()
      }
    }
  })

  it('hold every note only over silent slots, never past the end', () => {
    for (const tune of TUNES) {
      const slots = SCORES[tune].bars.flatMap((b) => b.notes.map((n, s) => ({ n, len: b.lengths[s] })))
      slots.forEach((slot, i) => {
        for (let k = 1; k < slot.len; k++) {
          expect(slots[i + k], `${tune}: a note runs off the end`).toBeDefined()
          expect(slots[i + k].n, `${tune}: a note held over another`).toBe(0)
        }
      })
    }
  })

  it('go A, A home, B, A home: 32 bars, the second A ending on C', () => {
    for (const tune of TUNES) {
      const { bars } = SCORES[tune]
      const notes = (from: number, to: number) => bars.slice(from, to).map((b) => [...b.notes])
      expect(bars, tune).toHaveLength(32)
      expect(notes(24, 32), `${tune}: the last A is the second`).toEqual(notes(8, 16))
      expect(notes(16, 24), `${tune}: B is its own`).not.toEqual(notes(0, 8))
      const home = bars.slice(8, 16).flatMap((b) => b.notes).filter((n) => n > 0)
      expect(home[home.length - 1] % 12, `${tune} comes home to C`).toBe(0)
      expect(bars[15].chord, tune).toBe('C')
    }
  })

  it('keep the melody in a singing range and never a semitone over its chord on a beat', () => {
    for (const tune of TUNES) {
      const { bars, beat } = SCORES[tune]
      for (const [i, bar] of bars.entries()) {
        const { root, tones } = CHORDS[bar.chord]
        bar.notes.forEach((n, s) => {
          if (n === 0) return
          expect(n, `${tune} bar ${i + 1}`).toBeGreaterThanOrEqual(67)
          expect(n, `${tune} bar ${i + 1}`).toBeLessThanOrEqual(88)
          if (s % beat === 0) for (const t of tones) expect((n - root - t + 120) % 12, `${tune} bar ${i + 1} slot ${s} grinds on ${bar.chord}`).not.toBe(1)
        })
      }
    }
  })

  it('give each island its own key and tempo, and sound in a gentle register', () => {
    expect(new Set(TUNES.map((t) => SCORES[t].key)).size).toBe(TUNES.length)
    expect(new Set(TUNES.map((t) => SCORES[t].bpm)).size).toBe(TUNES.length)
    for (const tune of TUNES) {
      const { bars, octave, key } = SCORES[tune]
      const sounding = bars.flatMap((b) => b.notes).filter((n) => n > 0).map((n) => n + octave + key)
      expect(Math.min(...sounding), tune).toBeGreaterThanOrEqual(64)
      expect(Math.max(...sounding), tune).toBeLessThanOrEqual(96)
    }
  })

  it('last 40 to 90 seconds a time round, so a run of a minute or two hears it at most about twice', () => {
    for (const tune of TUNES) {
      expect(tuneSeconds(tune), tune).toBeGreaterThanOrEqual(40)
      expect(tuneSeconds(tune), tune).toBeLessThanOrEqual(90)
    }
    expect(tuneSeconds('park')).toBeCloseTo((32 * 4 * 60) / 124, 6)
    expect(tuneSeconds('night')).toBeCloseTo((32 * 2 * 60) / 54, 6)
  })

  it('give the second voice a note of the chord a third to a fifth under the tune, never rubbing against it', () => {
    expect(harmonyUnder(76, 'C')).toBe(72)
    expect(harmonyUnder(72, 'C')).toBe(67)
    expect(harmonyUnder(81, 'Am')).toBe(76)
    expect(harmonyUnder(74, 'G')).toBe(71)
    expect(harmonyUnder(77, 'G7')).toBe(74)
    for (const tune of TUNES) {
      for (const [i, bar] of SCORES[tune].bars.entries()) {
        const { root, tones } = CHORDS[bar.chord]
        for (const n of bar.notes.filter((m) => m > 0)) {
          const under = harmonyUnder(n, bar.chord)
          expect(n - under, `${tune} bar ${i + 1}`).toBeGreaterThanOrEqual(3)
          expect(n - under, `${tune} bar ${i + 1}`).toBeLessThanOrEqual(7)
          expect(tones.some((t) => (under - root - t + 120) % 12 === 0), `${tune} bar ${i + 1}`).toBe(true)
        }
      }
    }
  })
})

describe('the plop ladder', () => {
  it('climbs a step for each plop within PLOP_RUN, stays at the top, and starts again after a pause', () => {
    expect(plopRung(0, Infinity)).toBe(0)
    let rung = 0
    const rungs = []
    for (let i = 0; i < 14; i++) rungs.push((rung = plopRung(rung, i === 0 ? Infinity : 0.2)))
    expect(rungs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 9, 9])
    expect(plopRung(3, PLOP_RUN)).toBe(4)
    expect(plopRung(3, PLOP_RUN + 0.01)).toBe(0)
  })

  it('rings each plop on the next note of the pentatonic, in the key', () => {
    const { ctx, synth } = rig()
    synth.key = 5
    const tops: number[] = []
    for (const t of [0, 0.2, 0.4, 0.6, 2]) {
      const voices = voicesOf(ctx, () => synth.effect('plop', t))
      tops.push(midiOf(voices[0].frequency.events.at(-1)!.value))
    }
    expect(tops).toEqual([...PLOP_NOTES.slice(0, 4), PLOP_NOTES[0]].map((m) => m + 5))
  })
})

describe('the voices', () => {
  it('wire the buses into the master, the master through the compressor to the speakers, and the room back into the master', () => {
    const { ctx, synth } = rig()
    const squash = ctx.nodes.find((n) => n instanceof FakeCompressor)!
    expect(squash.outs).toEqual([ctx.destination])
    expect(fake<FakeGain>(synth.master).outs).toEqual([squash])
    expect(fake<FakeGain>(synth.master).gain.value).toBe(MASTER)
    expect(fake<FakeGain>(synth.music).gain.value).toBe(MUSIC)
    expect(fake<FakeGain>(synth.effects).outs[0]).toBe(fake(synth.master))
    expect(fake<FakeGain>(synth.music).outs).toEqual([fake(synth.master)])
    const room = ctx.nodes.find((n): n is FakeConvolver => n instanceof FakeConvolver)!
    expect(room.buffer!.numberOfChannels).toBe(2)
    expect(reaches(fake<FakeNode>(synth.room), room)).toBe(true)
    expect(reaches(room, fake<FakeNode>(synth.master))).toBe(true)
    expect(reaches(fake<FakeNode>(synth.effects), room)).toBe(true)
  })

  it('give every kind a sound in every key that starts and ends silent, stops in time and reaches the effects', () => {
    for (const tune of TUNES) {
      const { synth, since } = rig()
      synth.key = SCORES[tune].key
      for (const [i, kind] of KINDS.entries()) {
        const at = 1 + i * 4
        synth.effect(kind, at)
        const { end, voices } = since(synth.effects, at, 0.25)
        expect(voices, `${kind} in ${tune}`).toBeGreaterThan(0)
        expect(end, `${kind} in ${tune}`).toBeLessThanOrEqual(LONGEST[kind])
      }
    }
  })

  it('make every kind sound different from every other', () => {
    const { ctx, synth } = rig()
    const prints = KINDS.map((kind) =>
      JSON.stringify(
        voicesOf(ctx, () => synth.effect(kind, 10))
          .map((o) => `${o.type}:${o.frequency.events.map((e) => Math.round(e.value)).join(',')}@${(o.startAt - 10).toFixed(2)}`)
          .sort(),
      ),
    )
    expect(new Set(prints).size).toBe(KINDS.length)
  })

  it('vary the sounds heard over and over, so a run of them never sounds the same twice in a row', () => {
    const { ctx, synth } = rig()
    const print = (kind: SoundKind, at: number) =>
      voicesOf(ctx, () => synth.effect(kind, at))
        .map((o) => `${o.frequency.events.map((e) => Math.round(e.value)).join(',')}@${(o.startAt - at).toFixed(3)}`)
        .join(' ')
    for (const kind of ['giggle', 'squish', 'land', 'squeal', 'whee', 'pip', 'burp'] as const) {
      expect(print(kind, 10), kind).not.toBe(print(kind, 20))
    }
  })

  it('dip the music under a big jingle and bring it back, and leave it alone for a small sound', () => {
    const { synth } = rig()
    const music = fake<FakeGain>(synth.music).gain
    synth.effect('plop', 1)
    expect(music.events).toEqual([])
    synth.effect('fanfare', 2)
    const low = music.events.filter((e) => e.value > 0 && e.value < MUSIC)
    expect(low.length).toBeGreaterThan(0)
    expect(music.events.at(-1)).toMatchObject({ kind: 'linear', value: MUSIC })
    expect(music.events.at(-1)!.time).toBeGreaterThan(2 + 2)
    synth.effect('pop100', 3)
    expect(music.events.at(-1)!.time, 'overlapping dips join up').toBeGreaterThan(2 + 2.3)
  })

  it('play every step of every tune clean, both times round, into the music on a steady beat', () => {
    for (const tune of TUNES) {
      const { synth, since } = rig()
      const score = SCORES[tune]
      const total = score.bars.length * score.slots
      const deck = synth.deck(tune, 0.5, 0)
      const eighth = 60 / score.bpm / score.beat
      for (let i = 0; i < total * 2; i++) synth.step(deck)
      expect(deck.step, tune).toBe(total * 2)
      expect(deck.next, tune).toBeCloseTo(0.5 + total * 2 * eighth, 6)
      synth.retire(deck, deck.next, 0.3)
      const { voices } = since(synth.music, 0.5, 0.25)
      expect(voices, tune).toBeGreaterThan(total)
      expect(fake<FakeGain>(deck.out).gain.events.at(1)).toMatchObject({ kind: 'linear', value: score.level, time: 0.5 + FADE_IN })
    }
  }, 60_000)

  it('add the extra voice only the second time round', () => {
    for (const tune of TUNES) {
      const { ctx, synth } = rig()
      const total = SCORES[tune].bars.length * SCORES[tune].slots
      const first = synth.deck(tune, 0, 0)
      const second = synth.deck(tune, 0, total)
      const count = (deck: Deck) => voicesOf(ctx, () => {
        for (let i = 0; i < total; i++) synth.step(deck)
      }).length
      expect(count(second), tune).toBeGreaterThan(count(first))
    }
  }, 60_000)

  it('swing the off-beats of a swung tune late, and play a straight one straight', () => {
    const { ctx, synth } = rig()
    /** How late the first four steps of a tune start, each against its place on the beat. */
    const starts = (tune: TuneId) => {
      const deck = synth.deck(tune, 0, 0)
      return [0, 1, 2, 3].map((slot) => {
        const from = ctx.nodes.length
        synth.step(deck)
        const made = ctx.nodes.slice(from).filter((n): n is FakeSource => n instanceof FakeSource)
        return Math.min(...made.map((n) => n.startAt)) - slot * (60 / SCORES[tune].bpm / SCORES[tune].beat)
      })
    }
    const park = starts('park')
    const eighth = 60 / SCORES.park.bpm / 2
    expect(park[0]).toBeCloseTo(0, 6)
    expect(park[1]).toBeCloseTo(SCORES.park.swing * eighth, 6)
    expect(park[2]).toBeCloseTo(0, 6)
    for (const s of starts('beach')) expect(s).toBeCloseTo(0, 6)
  })

  it('play each tune in its key: the first note of the park is E, the beach starts on C, Snow Land on F sharp', () => {
    const { ctx, synth } = rig()
    const firstNote = (tune: TuneId) => {
      const deck = synth.deck(tune, 0, 0)
      const lead = fake<FakeNode>(deck.lead)
      return midiOf(voicesOf(ctx, () => synth.step(deck)).filter((o) => reaches(o, lead))[0].frequency.events.at(-1)!.value)
    }
    expect(firstNote('park')).toBe(76)
    expect(firstNote('beach')).toBe(84)
    expect(firstNote('winter')).toBe(78)
  })

  it('make the wind follow its level and the rise start and stop', () => {
    const { ctx, synth } = rig()
    const wind = synth.wind(0)
    expect(fake<FakeGain>(wind.whoosh).gain.value).toBe(0)
    synth.setWind(wind, 1, 1)
    const loud = fake<FakeGain>(wind.whoosh).gain.events.at(-1)!.value
    synth.setWind(wind, 0.5, 2)
    const half = fake<FakeGain>(wind.whoosh).gain.events.at(-1)!.value
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(loud)
    expect(fake<FakeGain>(wind.chop).gain.events.at(-1)!.value).toBeLessThan(half)
    synth.setWind(wind, 0, 3)
    expect(fake<FakeGain>(wind.whoosh).gain.events.at(-1)!.value).toBe(0)
    expect(fake<FakeGain>(wind.hum).gain.events.at(-1)!.value).toBe(0)
    const from = ctx.nodes.length
    const rise = synth.startRise(4)
    expect(ctx.nodes.slice(from).every((n) => !(n instanceof FakeSource) || n.startAt === 4)).toBe(true)
    synth.stopRise(rise, 9)
    expect(fake<FakeGain>(rise.fader).gain.events.at(-1)).toMatchObject({ kind: 'linear', value: 0 })
    for (const s of rise.sources) expect(fake<FakeSource>(s as unknown as AudioNode).stopAt).toBeCloseTo(9.3, 6)
  })
})

describe('Sounds', () => {
  let contexts: FakeContext[] = []
  beforeEach(() => {
    contexts = []
    vi.useFakeTimers()
    vi.stubGlobal(
      'AudioContext',
      class extends FakeContext {
        constructor() {
          super()
          contexts.push(this)
        }
      },
    )
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  /** Moves the context's clock and the timers on together, in small ticks. */
  function run(seconds: number) {
    const ctx = contexts[0]
    for (let t = 0; t < seconds - 1e-9; t += 0.05) {
      ctx.currentTime += 0.05
      vi.advanceTimersByTime(50)
    }
  }
  const sources = () => contexts[0].nodes.filter((n) => n instanceof FakeSource).length
  const quiet = { tune: null, wind: 0, rise: false } as const

  it('does nothing before the first press, then makes one context and wakes it when it sleeps', () => {
    const sounds = new Sounds()
    sounds.play('go')
    sounds.setMuted(true)
    sounds.setLoops({ tune: 'park', wind: 0.5, rise: true })
    expect(contexts).toHaveLength(0)
    sounds.unlock()
    sounds.unlock()
    expect(contexts).toHaveLength(1)
    const ctx = contexts[0]
    expect(ctx.resumes).toBe(0)
    ctx.state = 'suspended'
    sounds.unlock()
    expect(ctx.state).toBe('running')
    expect(ctx.resumes).toBe(1)
  })

  it('starts what it was asked for before the first press, muted if it was muted', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const winds = vi.spyOn(Synth.prototype, 'wind')
    const rises = vi.spyOn(Synth.prototype, 'startRise')
    const sounds = new Sounds()
    sounds.setMuted(true)
    sounds.setLoops({ tune: 'candy', wind: 0.5, rise: true })
    sounds.unlock()
    expect(decks.mock.calls.map((c) => c[0])).toEqual(['candy'])
    expect(winds).toHaveBeenCalledTimes(1)
    expect(rises).toHaveBeenCalledTimes(1)
    expect(fake<FakeGain>((decks.mock.contexts[0] as Synth).master).gain.value).toBe(0)
  })

  it('plays the same kind once within DEDUP and again after; other kinds in the same moment all play', () => {
    const sounds = new Sounds()
    sounds.unlock()
    sounds.play('plop')
    const one = sources()
    for (let i = 0; i < 9; i++) sounds.play('plop')
    expect(sources()).toBe(one)
    sounds.play('burp')
    expect(sources()).toBeGreaterThan(one)
    const two = sources()
    contexts[0].currentTime += DEDUP + 0.001
    sounds.play('plop')
    expect(sources()).toBeGreaterThan(two)
  })

  it('mutes by putting the master at nothing, and back', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const master = contexts[0].nodes.find((n): n is FakeGain => n instanceof FakeGain && n.outs[0] instanceof FakeCompressor)!
    sounds.setMuted(true)
    expect(master.gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0 })
    expect(sounds.muted).toBe(true)
    sounds.setMuted(false)
    expect(master.gain.events.at(-1)).toMatchObject({ kind: 'target', value: MASTER })
  })

  it('starts a tune only when it changes, and crossfades to another from its first bar', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setLoops({ ...quiet, tune: 'map' })
    run(2)
    for (let i = 0; i < 5; i++) sounds.setLoops({ ...quiet, tune: 'map' })
    expect(decks).toHaveBeenCalledTimes(1)
    const map = decks.mock.results[0].value as Deck
    const at = contexts[0].currentTime
    sounds.setLoops({ ...quiet, tune: 'park' })
    expect(decks).toHaveBeenCalledTimes(2)
    expect(decks.mock.calls[1][2]).toBe(0)
    const out = fake<FakeGain>(map.out).gain.events
    expect(out.at(-1)).toMatchObject({ kind: 'linear', value: 0 })
    expect(out.at(-1)!.time).toBeCloseTo(at + CROSSFADE, 6)
  })

  it('fades the tune out with no tune (a pause), and carries on from the start of its phrase when it comes back', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setLoops({ ...quiet, tune: 'park' })
    run(20)
    const park = decks.mock.results[0].value as Deck
    const stepped = park.step
    const at = contexts[0].currentTime
    sounds.setLoops(quiet)
    const out = fake<FakeGain>(park.out).gain.events
    expect(out.at(-1)!.time).toBeCloseTo(at + FADE_OUT, 6)
    run(3)
    expect(park.step, 'the clock stops with the tune').toBe(stepped)
    sounds.setLoops({ ...quiet, tune: 'park' })
    const from = decks.mock.calls[1][2]
    const phrase = SCORES.park.slots * 4
    expect(from % phrase).toBe(0)
    expect(from).toBeLessThanOrEqual(stepped)
    expect(stepped - from).toBeLessThan(phrase)
    expect(from).toBeGreaterThan(0)
  })

  it('schedules only within the lookahead, and skips ahead after a sleep instead of bursting', () => {
    const step = Synth.prototype.step
    /** Each step: when it plays, and the context's time when it was scheduled. */
    const steps: [number, number][] = []
    vi.spyOn(Synth.prototype, 'step').mockImplementation(function (this: Synth, deck: Deck) {
      steps.push([deck.next, this.ctx.currentTime])
      step.call(this, deck)
    })
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setLoops({ ...quiet, tune: 'beach' })
    const ctx = contexts[0]
    run(5)
    for (const [at, now] of steps) {
      expect(at).toBeGreaterThanOrEqual(now)
      expect(at).toBeLessThan(now + LOOKAHEAD)
    }
    const eighth = 60 / SCORES.beach.bpm / 2
    expect(steps.length).toBeGreaterThanOrEqual(Math.floor(5 / eighth))
    expect(steps.slice(1).every(([at], i) => Math.abs(at - steps[i][0] - eighth) < 1e-9)).toBe(true)
    const before = steps.length
    ctx.currentTime += 30
    vi.advanceTimersByTime(50)
    const woke = steps.slice(before)
    expect(woke.length).toBeLessThanOrEqual(Math.ceil(LOOKAHEAD / eighth) + 1)
    for (const [at] of woke) expect(at).toBeGreaterThanOrEqual(ctx.currentTime)
  })

  it('plays the jingles in the key of the tune playing', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]
    /** The note of the star a pop of 1 rings: the lowest partial of what starts after the pop itself. */
    const pop = () => {
      ctx.currentTime += 1
      const from = ctx.nodes.length
      sounds.play('pop1')
      const star = ctx.nodes.slice(from).filter((n): n is FakeOscillator => n instanceof FakeOscillator && n.startAt > ctx.currentTime + 0.025)
      return midiOf(Math.min(...star.map((o) => o.frequency.events[0].value)))
    }
    expect(pop()).toBe(88)
    for (const tune of COURSE_IDS) {
      sounds.setLoops({ ...quiet, tune })
      expect(pop(), tune).toBe(88 + SCORES[tune].key)
    }
    sounds.setLoops(quiet)
    expect(pop(), 'a pause keeps the key').toBe(88 + SCORES.night.key)
  })

  it('makes the wind the first time it blows, then follows it, and starts and stops the rise with its flag', () => {
    const winds = vi.spyOn(Synth.prototype, 'wind')
    const setWinds = vi.spyOn(Synth.prototype, 'setWind')
    const rises = vi.spyOn(Synth.prototype, 'startRise')
    const stops = vi.spyOn(Synth.prototype, 'stopRise')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setLoops(quiet)
    expect(winds).not.toHaveBeenCalled()
    sounds.setLoops({ ...quiet, wind: 0.6 })
    sounds.setLoops({ ...quiet, wind: 0.6 })
    sounds.setLoops({ ...quiet, wind: 1.7 })
    sounds.setLoops({ ...quiet, wind: 0 })
    expect(winds).toHaveBeenCalledTimes(1)
    expect(setWinds.mock.calls.map((c) => c[1])).toEqual([0.6, 1, 0])
    expect(() => sounds.setLoops({ ...quiet, wind: NaN })).toThrow()
    sounds.setLoops({ ...quiet, rise: true })
    sounds.setLoops({ ...quiet, rise: true })
    sounds.setLoops(quiet)
    sounds.setLoops({ ...quiet, rise: true })
    expect(rises).toHaveBeenCalledTimes(2)
    expect(stops).toHaveBeenCalledTimes(1)
  })

  it('turns MIDI into Hz from A4 at 440', () => {
    expect(hz(69)).toBe(440)
    expect(hz(81)).toBeCloseTo(880, 9)
  })
})
