/**
 * Checks the sounds without ears. The tunes: every bar whole, the melodies in a singing range
 * that never grinds a semitone over its chord on a beat, each tune in its own key and tempo.
 * The voices: a fake audio context records every node, connection and automation (and throws
 * where a browser would), so every sound in every key and every step of every tune is checked
 * to start silent, end silent, stop, stay gentle, stay in the hearing range and reach its bus.
 * The mapping: every sim event makes a sound, and the loops read a hand-made state. The
 * lifecycle: Sounds on the fake context and fake timers (nothing before the first press, the
 * dedup, the switches, the microphone, the tune's clock, the beep, the loops, suspend).
 * Loudness is the ear's to balance.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CHAPTER_IDS, MACHINE_KINDS, SPECIES, newMachine, type Machine, type MachineKind, type Machines, type Sim, type SimEvent } from './model'
import {
  BEEP_EVERY, CHORDS, COIN_NOTES, COIN_RUN, CROSSFADE, DEDUP, ENGINES, FADE_IN, FADE_OUT, HORN_DEDUP, LAYERS, LAYER_KEYS, LISTENING, LOOKAHEAD, MASTER, MUSIC, PLAIN, QUIET, SLOTS, Sounds,
  Synth, TUNES, coinRung, hz, loopsFor, soundsFor, tuneSeconds,
  type Deck, type PlainSound, type SoundKind, type TuneId,
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
  state: 'running' | 'suspended' | 'interrupted' = 'running'
  private readonly stateListeners: (() => void)[] = []
  resumes = 0
  suspends = 0
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
  addEventListener(type: string, fn: () => void) {
    if (type === 'statechange') this.stateListeners.push(fn)
  }
  /** The system changes the state and the context says so. */
  setState(state: FakeContext['state']) {
    this.state = state
    for (const fn of this.stateListeners) fn()
  }
  resume() {
    this.resumes += 1
    this.setState('running')
    return Promise.resolve()
  }
  suspend() {
    this.suspends += 1
    this.setState('suspended')
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
 * a voice (heard through `bus`) starts and ends silent within its source's time, never goes
 * back in time, never over `loudest`, and every oscillator's pitch stays from 20 Hz to
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

/** Every plain kind once, with how long it may last: a Record, so a new kind fails to compile here until it is listed. */
const LONGEST = {
  bite: 0.4, dump: 0.7, tip: 1, landed: 0.4, coin: 0.7, hop: 0.3, uhuh: 0.5, comes: 0.8, pick: 0.3, drop: 0.3, place: 0.8, rolled: 0.5, stomp: 0.5, push: 0.6,
  plantStart: 1, plantThump: 0.3, plantDone: 0.9, water: 0.7, mixed: 1, pour: 1, set: 1, splash: 1, stepDone: 1, jobDone: 2.2, wish: 0.7, chapterDone: 3.2,
  moveIn: 2, party: 1.8, fireworks: 5, hint: 1.1, tap: 0.3, select: 0.6, buy: 1.3, clockStrike: 2.8, iceCreamJingle: 4.6,
} satisfies Record<PlainSound, number>
const PLAIN_KINDS = Object.keys(LONGEST) as PlainSound[]
const KINDS: SoundKind[] = [...PLAIN_KINDS, ...MACHINE_KINDS.map((m) => `horn-${m}` as const), ...MACHINE_KINDS.map((m) => `toot-${m}` as const), ...SPECIES.map((s) => `voice-${s}` as const)]
/** How long the named kinds may last. */
const longestOf = (kind: SoundKind) => (kind.startsWith('voice-') ? 1.2 : kind.startsWith('horn-') ? 1.2 : kind.startsWith('toot-') ? 0.6 : LONGEST[kind as PlainSound])
const TUNE_IDS = Object.keys(TUNES) as TuneId[]
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
    for (const tune of TUNE_IDS) {
      for (const [i, bar] of TUNES[tune].bars.entries()) {
        const where = `${tune} bar ${i + 1}`
        expect(bar.notes, where).toHaveLength(SLOTS)
        expect(bar.lengths, where).toHaveLength(SLOTS)
        bar.notes.forEach((n, s) => expect(n > 0, `${where} slot ${s}`).toBe(bar.lengths[s] > 0))
        expect(CHORDS[bar.chord], where).toBeDefined()
      }
    }
  })

  it('hold every note only over silent slots, never past the end', () => {
    for (const tune of TUNE_IDS) {
      const slots = TUNES[tune].bars.flatMap((b) => b.notes.map((n, s) => ({ n, len: b.lengths[s] })))
      slots.forEach((slot, i) => {
        for (let k = 1; k < slot.len; k++) {
          expect(slots[i + k], `${tune}: a note runs off the end`).toBeDefined()
          expect(slots[i + k].n, `${tune}: a note held over another`).toBe(0)
        }
      })
    }
  })

  it('go A, B, A, C: 16 bars, the second A the first again, ending on C, in major keys with no minor tune', () => {
    for (const tune of TUNE_IDS) {
      const { bars } = TUNES[tune]
      expect(bars, tune).toHaveLength(16)
      expect(bars.slice(8, 12).map((b) => [...b.notes]), `${tune}: the last A is the first`).toEqual(bars.slice(0, 4).map((b) => [...b.notes]))
      expect(bars.slice(4, 8).map((b) => [...b.notes]), `${tune}: B is its own`).not.toEqual(bars.slice(0, 4).map((b) => [...b.notes]))
      expect(bars[15].chord, tune).toBe('C')
      expect(bars[0].chord, tune).toBe('C')
    }
  })

  it('keep the melody in a singing range and never a semitone over its chord on a beat', () => {
    for (const tune of TUNE_IDS) {
      for (const [i, bar] of TUNES[tune].bars.entries()) {
        const { root, tones } = CHORDS[bar.chord]
        bar.notes.forEach((n, s) => {
          if (n === 0) return
          expect(n, `${tune} bar ${i + 1}`).toBeGreaterThanOrEqual(67)
          expect(n, `${tune} bar ${i + 1}`).toBeLessThanOrEqual(88)
          if (s % 2 === 0) for (const t of tones) expect((n - root - t + 120) % 12, `${tune} bar ${i + 1} slot ${s} grinds on ${bar.chord}`).not.toBe(1)
        })
      }
    }
  })

  it('give each tune its own key and tempo, sound in a gentle register, and last 30 to 90 seconds a time round', () => {
    expect(new Set(TUNE_IDS.map((t) => TUNES[t].key)).size).toBe(TUNE_IDS.length)
    expect(new Set(TUNE_IDS.map((t) => TUNES[t].bpm)).size).toBe(TUNE_IDS.length)
    for (const tune of TUNE_IDS) {
      const sounding = TUNES[tune].bars.flatMap((b) => b.notes).filter((n) => n > 0).map((n) => n + TUNES[tune].key)
      expect(Math.min(...sounding), tune).toBeGreaterThanOrEqual(64)
      expect(Math.max(...sounding), tune).toBeLessThanOrEqual(96)
      expect(tuneSeconds(tune), tune).toBeGreaterThanOrEqual(30)
      expect(tuneSeconds(tune), tune).toBeLessThanOrEqual(90)
    }
    expect(tuneSeconds('road')).toBeCloseTo((16 * 8 * 30) / 104, 6)
  })
})

describe('the coin scale', () => {
  it('climbs a step for each coin within COIN_RUN, stays at the top, and starts again after a pause', () => {
    expect(coinRung(0, Infinity)).toBe(0)
    let rung = 0
    const rungs = []
    for (let i = 0; i < 11; i++) rungs.push((rung = coinRung(rung, i === 0 ? Infinity : 0.2)))
    expect(rungs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7, 7, 7])
    expect(coinRung(3, COIN_RUN)).toBe(4)
    expect(coinRung(3, COIN_RUN + 0.01)).toBe(0)
  })

  it('rings each quick coin on the next note of the pentatonic, in the key', () => {
    const { ctx, synth } = rig()
    synth.key = 5
    const tops: number[] = []
    for (const t of [0, 0.2, 0.4, 0.6, 3]) {
      const voices = voicesOf(ctx, () => synth.effect('coin', t))
      tops.push(midiOf(voices[0].frequency.events.at(-1)!.value))
    }
    expect(tops).toEqual([...COIN_NOTES.slice(0, 4), COIN_NOTES[0]].map((m) => m + 5))
  })
})

describe('the voices', () => {
  it('wire the buses through the master and the compressor to the speakers, and the room back into the master', () => {
    const { ctx, synth } = rig()
    const squash = ctx.nodes.find((n) => n instanceof FakeCompressor)!
    expect(squash.outs).toEqual([ctx.destination])
    expect(fake<FakeGain>(synth.master).outs).toEqual([squash])
    expect(fake<FakeGain>(synth.master).gain.value).toBe(MASTER)
    expect(fake<FakeGain>(synth.music).gain.value).toBe(MUSIC)
    expect(reaches(fake<FakeNode>(synth.effects), fake<FakeNode>(synth.master))).toBe(true)
    expect(reaches(fake<FakeNode>(synth.loops), fake<FakeNode>(synth.soft))).toBe(true)
    expect(reaches(fake<FakeNode>(synth.dip), fake<FakeNode>(synth.soft))).toBe(true)
    expect(reaches(fake<FakeNode>(synth.effects), fake<FakeNode>(synth.soft))).toBe(false)
    const room = ctx.nodes.find((n): n is FakeConvolver => n instanceof FakeConvolver)!
    expect(room.buffer!.numberOfChannels).toBe(2)
    expect(reaches(fake<FakeNode>(synth.room), room)).toBe(true)
    expect(reaches(room, fake<FakeNode>(synth.master))).toBe(true)
    expect(reaches(fake<FakeNode>(synth.effects), room)).toBe(true)
  })

  it('give every kind a sound in every key that starts and ends silent, stops in time and reaches the effects', () => {
    expect(KINDS).toHaveLength(PLAIN_KINDS.length + 2 * MACHINE_KINDS.length + SPECIES.length)
    for (const tune of TUNE_IDS) {
      const { synth, since } = rig()
      synth.key = TUNES[tune].key
      for (const [i, kind] of KINDS.entries()) {
        const at = 1 + i * 6
        synth.effect(kind, at)
        const { end, voices } = since(synth.effects, at, 0.25)
        expect(voices, `${kind} in ${tune}`).toBeGreaterThan(0)
        expect(end, `${kind} in ${tune}`).toBeLessThanOrEqual(longestOf(kind))
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
    const same = prints.flatMap((p, i) => (prints.indexOf(p) === i ? [] : [`${KINDS[i]} = ${KINDS[prints.indexOf(p)]}`]))
    expect(same).toEqual([])
  })

  it('give each machine its own horn and a toot at the horn family, and the lorry the deepest horn', () => {
    const { ctx, synth } = rig()
    const lowest = (kind: SoundKind) => Math.min(...voicesOf(ctx, () => synth.effect(kind, 10)).map((o) => Math.min(...o.frequency.events.map((e) => e.value))))
    const horns = MACHINE_KINDS.map((m) => lowest(`horn-${m}`))
    expect(new Set(horns.map(Math.round)).size).toBeGreaterThanOrEqual(7)
    expect(lowest('horn-semi')).toBeLessThan(Math.min(...MACHINE_KINDS.filter((m) => m !== 'semi').map((m) => lowest(`horn-${m}`))))
    expect(lowest('horn-forklift')).toBeGreaterThan(1000)
    for (const m of MACHINE_KINDS) expect(voicesOf(ctx, () => synth.effect(`toot-${m}`, 10)).length, m).toBeGreaterThanOrEqual(4)
  })

  it('vary the sounds heard over and over, so a run of them never sounds the same twice in a row', () => {
    const { ctx, synth } = rig()
    const print = (kind: SoundKind, at: number) =>
      voicesOf(ctx, () => synth.effect(kind, at))
        .map((o) => `${o.frequency.events.map((e) => Math.round(e.value)).join(',')}@${(o.startAt - at).toFixed(3)}`)
        .join(' ')
    for (const kind of ['bite', 'dump', 'water', 'splash', 'pour'] as const) expect(print(kind, 10), kind).not.toBe(print(kind, 20))
  })

  it('dip the music under a big jingle and bring it back, and leave it alone for a small sound', () => {
    const { synth } = rig()
    const dip = fake<FakeGain>(synth.dip).gain
    synth.effect('coin', 1)
    expect(dip.events).toEqual([])
    synth.effect('chapterDone', 2)
    expect(dip.events.filter((e) => e.value > 0 && e.value < 1).length).toBeGreaterThan(0)
    expect(dip.events.at(-1)).toMatchObject({ kind: 'linear', value: 1 })
    expect(dip.events.at(-1)!.time).toBeGreaterThan(2 + 3)
    synth.effect('fireworks', 3)
    expect(dip.events.at(-1)!.time, 'overlapping dips join up').toBeGreaterThan(2 + 3.5)
  })

  it('play every step of every tune clean, twice round, into the music on a steady beat', () => {
    for (const tune of TUNE_IDS) {
      const { synth, since } = rig()
      const score = TUNES[tune]
      const total = score.bars.length * SLOTS
      const deck = synth.deck(tune, 0.5, 0)
      const eighth = 30 / score.bpm
      for (let i = 0; i < total * 2; i++) synth.step(deck)
      expect(deck.step, tune).toBe(total * 2)
      expect(deck.next, tune).toBeCloseTo(0.5 + total * 2 * eighth, 6)
      synth.retire(deck, deck.next, 0.3)
      const { voices } = since(synth.music, 0.5, 0.25)
      expect(voices, tune).toBeGreaterThan(total)
      expect(fake<FakeGain>(deck.out).gain.events.at(1)).toMatchObject({ kind: 'linear', value: score.level, time: 0.5 + FADE_IN })
    }
  }, 60_000)

  it('play each tune in its key: the road starts on E, the house on C, the title on A flat', () => {
    const { ctx, synth } = rig()
    const firstNote = (tune: TuneId) => {
      const deck = synth.deck(tune, 0, 0)
      return midiOf(voicesOf(ctx, () => synth.step(deck)).filter((o) => o.type === 'sine' || o.type === 'square').map((o) => o.frequency.events.at(-1)!.value).sort((a, b) => b - a)[0])
    }
    // The highest sine of the first step is the melody's tine or bar (the chords and the bass sit below it).
    expect(firstNote('road') % 12).toBe(4 + 0)
    expect(firstNote('house') % 12).toBe((7 + 5) % 12)
    expect(firstNote('title') % 12).toBe((7 - 2 + 12) % 12)
  })

  it('make a reversing beep that starts and ends silent on the loops bus', () => {
    const { synth, since } = rig()
    synth.reverseBeep(2)
    const { end, voices } = since(synth.loops, 2, 0.1)
    expect(voices).toBe(2)
    expect(end).toBeLessThan(BEEP_EVERY / 2)
  })
})

describe('the loops', () => {
  it('stay silent until given a level, then follow it and go quiet again, in a hearing range for every machine and rev', () => {
    const { ctx, synth } = rig()
    for (const key of LAYER_KEYS) {
      const layer = synth.layer(LAYERS[key], 1)
      expect(fake<FakeGain>(layer.amp).gain.value, key).toBe(0)
      expect(reaches(fake<FakeNode>(layer.amp), fake<FakeNode>(synth.loops)), key).toBe(true)
      for (const s of [...layer.tones, layer.chug]) expect(fake<FakeSource>(s).startAt, key).toBe(1)
      synth.setLayer(layer, 1, 2, PLAIN)
      const loud = fake<FakeGain>(layer.amp).gain.events.at(-1)!.value
      synth.setLayer(layer, 0.5, 3, PLAIN)
      const half = fake<FakeGain>(layer.amp).gain.events.at(-1)!.value
      expect(half, key).toBeGreaterThan(0)
      expect(half, key).toBeLessThan(loud)
      expect(loud, key).toBeLessThanOrEqual(0.1)
      synth.setLayer(layer, 0, 4, PLAIN)
      expect(fake<FakeGain>(layer.amp).gain.events.at(-1)!.value, key).toBe(0)
      expect(fake<FakeGain>(layer.depth).gain.events.at(-1)!.value, key).toBe(0)
    }
    const engine = synth.layer(LAYERS.engine, 1)
    for (const kind of MACHINE_KINDS) {
      for (const rev of [0, 1]) {
        synth.setLayer(engine, 0.2 + 0.8 * rev, 5, { pitch: ENGINES[kind].pitch * (0.8 + 0.5 * rev), bright: ENGINES[kind].bright, rate: ENGINES[kind].chug })
        for (const o of engine.tones) {
          const f = fake<FakeOscillator>(o).frequency.events.at(-1)!.value
          expect(f, `${kind} ${rev}`).toBeGreaterThanOrEqual(20)
          expect(f, `${kind} ${rev}`).toBeLessThanOrEqual(16000)
        }
      }
    }
    expect(ctx.nodes.length).toBeGreaterThan(0)
  })

  it('give every machine its own engine pitch', () => {
    expect(new Set(MACHINE_KINDS.map((k) => ENGINES[k].pitch)).size).toBe(MACHINE_KINDS.length)
    expect(ENGINES.forklift.pitch).toBeGreaterThan(ENGINES.digger.pitch)
    expect(ENGINES.semi.pitch).toBeLessThan(ENGINES.digger.pitch)
  })
})

// ---------------------------------------------------------------------------------------
// The mapping.

const EVENTS: { [K in SimEvent['kind']]: Extract<SimEvent, { kind: K }> } = {
  bite: { kind: 'bite', x: 0, y: 0, z: 0, stuff: 'sand' },
  dump: { kind: 'dump', x: 0, y: 0, z: 0, stuff: 'sand' },
  tip: { kind: 'tip', x: 0, y: 0, z: 0, stuff: 'sand' },
  landed: { kind: 'landed', x: 0, y: 0, z: 0, stuff: 'sand' },
  coin: { kind: 'coin', amount: 1, x: 0, y: 0, z: 0 },
  hop: { kind: 'hop', from: 'digger', to: 'dumper' },
  honk: { kind: 'honk', machine: 'semi' },
  uhuh: { kind: 'uhuh', machine: 'digger' },
  ack: { kind: 'ack', machine: 'forklift' },
  comes: { kind: 'comes', machine: 'dozer' },
  pick: { kind: 'pick', x: 0, y: 0, z: 0, thing: 'bricks' },
  drop: { kind: 'drop', x: 0, y: 0, z: 0, thing: 'bricks' },
  place: { kind: 'place', x: 0, y: 0, z: 0, build: 0 },
  rolled: { kind: 'rolled', x: 0, z: 0 },
  stomp: { kind: 'stomp', x: 0, z: 0 },
  push: { kind: 'push', x: 0, z: 0 },
  plantStart: { kind: 'plantStart', plant: 'press' },
  plantThump: { kind: 'plantThump', plant: 'press' },
  plantDone: { kind: 'plantDone', plant: 'press' },
  water: { kind: 'water', x: 0, z: 0 },
  mixed: { kind: 'mixed', x: 0, z: 0 },
  pour: { kind: 'pour', x: 0, z: 0 },
  set: { kind: 'set', form: 0 },
  splash: { kind: 'splash', x: 0, z: 0 },
  stepDone: { kind: 'stepDone', x: 0, y: 0, z: 0 },
  jobDone: { kind: 'jobDone', stars: 3 },
  wish: { kind: 'wish', who: 'cow' },
  chapterDone: { kind: 'chapterDone', chapter: 'road' },
  moveIn: { kind: 'moveIn', x: 0, z: 0, who: 'bunny' },
  party: { kind: 'party', chapter: 'road' },
  fireworks: { kind: 'fireworks' },
  hint: { kind: 'hint' },
}

describe('soundsFor', () => {
  it('makes at least one known sound for every kind of event', () => {
    const known = new Set<SoundKind>(KINDS)
    for (const event of Object.values(EVENTS)) {
      const kinds = soundsFor(event)
      expect(kinds.length, event.kind).toBeGreaterThan(0)
      for (const kind of kinds) expect(known.has(kind), `${event.kind} makes ${kind}`).toBe(true)
    }
  })

  it('gives each machine its own voice for a honk, a toot and an arrival, and the animal its voice for a wish and a move in', () => {
    for (const machine of MACHINE_KINDS) {
      expect(soundsFor({ kind: 'honk', machine })).toEqual([`horn-${machine}`])
      expect(soundsFor({ kind: 'ack', machine })).toEqual([`toot-${machine}`])
      expect(soundsFor({ kind: 'comes', machine })).toContain(`horn-${machine}`)
    }
    expect(soundsFor({ kind: 'wish', who: 'pig' })).toContain('voice-pig')
    expect(soundsFor({ kind: 'moveIn', x: 0, z: 0, who: 'sheep' })).toContain('voice-sheep')
    expect(soundsFor({ kind: 'uhuh', machine: 'mixer' })).toEqual(['uhuh'])
  })

  it('plays the ice cream van with the road party and the clock strike with the clock party, and neither with the others', () => {
    expect(soundsFor({ kind: 'party', chapter: 'road' })).toEqual(['party', 'iceCreamJingle'])
    expect(soundsFor({ kind: 'party', chapter: 'clock' })).toEqual(['party', 'clockStrike'])
    for (const chapter of CHAPTER_IDS) {
      if (chapter === 'road' || chapter === 'clock') continue
      expect(soundsFor({ kind: 'party', chapter })).toEqual(['party'])
    }
  })
})

/** A hand-made state with only what loopsFor reads, every machine come and still. */
function state(change: (m: Machines, s: Pick<Sim, 'streams' | 'plants' | 'mode' | 'active'> & { levers: Sim['hands']['levers'] }) => void = () => undefined): Sim {
  const spot = { x: 0, z: 0, yaw: 0 }
  const machines: Machines = {
    digger: newMachine('digger', spot), dumper: newMachine('dumper', spot), dozer: newMachine('dozer', spot), roller: newMachine('roller', spot), mixer: newMachine('mixer', spot),
    forklift: newMachine('forklift', spot), tower: newMachine('tower', spot), semi: newMachine('semi', spot), mobile: newMachine('mobile', spot),
  }
  for (const k of MACHINE_KINDS) machines[k].unlocked = true
  const plant = (id: 'press' | 'crusher' | 'saw') => ({ id, stored: 0, phase: 'idle' as 'idle' | 'work', t: 0, made: 0 })
  const rest = { streams: [] as Sim['streams'], plants: { press: plant('press'), crusher: plant('crusher'), saw: plant('saw') }, mode: 'easy' as Sim['mode'], active: 'digger' as MachineKind, levers: { drive: 0, steer: 0, a: 0, b: 0, c: 0, d: 0 } }
  change(machines, rest)
  return { machines, streams: rest.streams, plants: rest.plants, mode: rest.mode, active: rest.active, hands: { levers: rest.levers } } as unknown as Sim
}

describe('loopsFor', () => {
  it('is quiet for a still site, with only the idle engine of the active machine', () => {
    const l = loopsFor(state(), 'road')
    expect(l).toEqual({ ...QUIET, tune: 'road', engine: { kind: 'digger', rev: 0 } })
  })

  it('reads the engine from the active machine and its rev, none for a machine not come', () => {
    expect(loopsFor(state((m, s) => { s.active = 'semi'; m.semi.rev = 0.7 }), null).engine).toEqual({ kind: 'semi', rev: 0.7 })
    expect(loopsFor(state((m) => { m.digger.rev = 3 }), null).engine).toEqual({ kind: 'digger', rev: 1 })
    expect(loopsFor(state((m) => { m.digger.unlocked = false }), null).engine).toBeNull()
  })

  it('counts the friends driving, a third each', () => {
    expect(loopsFor(state((m) => { m.dumper.friend = true }), null).friendEngines).toBeCloseTo(1 / 3, 9)
    expect(loopsFor(state((m) => { for (const k of ['dumper', 'mixer', 'semi', 'dozer'] as const) m[k].friend = true }), null).friendEngines).toBe(1)
  })

  it('whines the hydraulics when any machine moves a joint, and more for more', () => {
    const lift = (m: Machine) => {
      if (m.kind === 'digger') m.seq = 'bite'
      else if (m.kind === 'dumper') m.seq = 'up'
      else if (m.kind === 'forklift') m.seq = 'raise'
    }
    expect(loopsFor(state(), null).hydraulic).toBe(0)
    expect(loopsFor(state((m) => lift(m.digger)), null).hydraulic).toBeCloseTo(0.6, 9)
    expect(loopsFor(state((m) => { lift(m.digger); lift(m.dumper); lift(m.forklift) }), null).hydraulic).toBeCloseTo(1, 9)
    expect(loopsFor(state((m) => { m.digger.seq = 'hold' }), null).hydraulic, 'a digger holding its load moves nothing').toBe(0)
    expect(loopsFor(state((m) => { m.tower.seq = 'over' }), null).hydraulic).toBeGreaterThan(0)
    expect(loopsFor(state((m) => { m.dumper.seq = 'turn' }), null).hydraulic, 'turning is driving').toBe(0)
    expect(loopsFor(state((m) => { m.semi.unlocked = false; m.semi.seq = 'unload' }), null).hydraulic, 'not come').toBe(0)
  })

  it('whines the hydraulics in pro mode while a lever of the active machine is pushed', () => {
    expect(loopsFor(state((_m, s) => { s.mode = 'pro'; s.levers.b = 0.8 }), null).hydraulic).toBeGreaterThan(0)
    expect(loopsFor(state((_m, s) => { s.mode = 'pro'; s.levers.drive = 1 }), null).hydraulic).toBe(0)
    expect(loopsFor(state((_m, s) => { s.levers.b = 0.8 }), null).hydraulic, 'easy mode ignores levers').toBe(0)
  })

  it('splits the streams into pouring stuff and the water tower', () => {
    const stream = (stuff: 'sand' | 'water' | 'concrete', rate: number) => ({ stuff, fromX: 0, fromY: 0, fromZ: 0, toX: 0, toY: 0, toZ: 0, rate })
    const l = loopsFor(state((_m, s) => { s.streams.push(stream('sand', 0.3), stream('concrete', 0.2), stream('water', 0.5)) }), null)
    expect(l.pour).toBeCloseTo(0.5, 9)
    expect(l.water).toBeCloseTo(0.5, 9)
    expect(loopsFor(state((_m, s) => { s.streams.push(stream('sand', 0.8), stream('sand', 0.8)) }), null).pour).toBe(1)
  })

  it('beeps only when the active machine backs up', () => {
    expect(loopsFor(state((m) => { m.digger.speed = -2 }), null).beep).toBe(true)
    expect(loopsFor(state((m) => { m.digger.speed = -0.1 }), null).beep).toBe(false)
    expect(loopsFor(state((m) => { m.digger.speed = 3 }), null).beep).toBe(false)
    expect(loopsFor(state((m) => { m.dumper.speed = -2 }), null).beep, 'a machine the child is not in').toBe(false)
  })

  it('rumbles the drum with the mixer, the roller with its shake, the plant at work and the dozer pushing', () => {
    expect(loopsFor(state(), null).drum).toBe(0)
    expect(loopsFor(state((m) => { m.mixer.sand = 1 }), null).drum).toBeCloseTo(0.35, 9)
    expect(loopsFor(state((m) => { m.mixer.sand = 4; m.mixer.water = 1; m.mixer.mixed = 1 }), null).drum).toBe(1)
    expect(loopsFor(state((m) => { m.mixer.concrete = 1 }), null).drum).toBe(0.5)
    expect(loopsFor(state((m) => { m.roller.shake = 0.6 }), null).shake).toBeCloseTo(0.6, 9)
    expect(loopsFor(state((_m, s) => { s.plants.saw.phase = 'work' }), null).plant).toBe(1)
    expect(loopsFor(state((m) => { m.dozer.pushing = 0.02 }), null).push).toBe(0)
    expect(loopsFor(state((m) => { m.dozer.pushing = 2 }), null).push).toBeCloseTo(0.9, 9)
    expect(loopsFor(state((m) => { m.dozer.pushing = 20 }), null).push).toBe(1)
  })

  it('passes the tune through, and every number stays from 0 to 1', () => {
    const l = loopsFor(state((m) => { m.roller.shake = 5; m.mixer.mixed = 4; m.mixer.sand = 1 }), 'party')
    expect(l.tune).toBe('party')
    for (const v of [l.friendEngines, l.hydraulic, l.pour, l.drum, l.shake, l.plant, l.water, l.push]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})

// ---------------------------------------------------------------------------------------

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
  const quiet = QUIET

  it('does nothing before the first press, then makes one context and wakes it when it sleeps', () => {
    const sounds = new Sounds()
    sounds.play('tap')
    sounds.setSound(false)
    sounds.setLoops({ ...quiet, tune: 'road', pour: 0.5 })
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

  it('takes the context back at once when the system suspends or interrupts it on a visible page', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]
    ctx.setState('interrupted')
    expect(ctx.state).toBe('running')
    expect(ctx.resumes).toBe(1)
    ctx.setState('suspended')
    expect(ctx.resumes).toBe(2)
    ctx.setState('running')
    expect(ctx.resumes).toBe(2)
  })

  it('leaves the context asleep when the page is hidden or nothing is wanted, and a gesture wakes it if the browser refused', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]
    sounds.suspend()
    expect(ctx.state).toBe('suspended')
    expect(ctx.resumes).toBe(0)
    sounds.resume()
    expect(ctx.resumes).toBe(1)
    sounds.setSound(false)
    sounds.setMusic(false)
    ctx.setState('interrupted')
    expect(ctx.resumes).toBe(1)
    sounds.setMusic(true)
    ctx.resume = () => {
      ctx.resumes += 1
      return Promise.resolve()
    }
    ctx.setState('interrupted')
    expect(ctx.resumes).toBe(2)
    expect(ctx.state).toBe('interrupted')
    sounds.unlock()
    expect(ctx.resumes).toBe(3)
  })

  it('unlock does not touch a running context', () => {
    const sounds = new Sounds()
    sounds.unlock()
    for (let i = 0; i < 5; i++) sounds.unlock()
    expect(contexts).toHaveLength(1)
    expect(contexts[0].resumes).toBe(0)
  })

  it('starts what it was asked for before the first press, switched off if it was switched off', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const layers = vi.spyOn(Synth.prototype, 'layer')
    const sounds = new Sounds()
    sounds.setMusic(false)
    sounds.setSound(false)
    sounds.setDuck(true)
    sounds.setLoops({ ...quiet, tune: 'title', pour: 0.5 })
    sounds.unlock()
    expect(decks.mock.calls.map((c) => c[0])).toEqual(['title'])
    expect(layers).toHaveBeenCalledTimes(1)
    const synth = decks.mock.contexts[0] as Synth
    expect(fake<FakeGain>(synth.music).gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0 })
    expect(fake<FakeGain>(synth.effects).gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0 })
    expect(fake<FakeGain>(synth.soft).gain.events.at(-1)).toMatchObject({ kind: 'target', value: LISTENING })
  })

  it('plays the same kind once within DEDUP and again after; other kinds in the same moment all play', () => {
    const sounds = new Sounds()
    sounds.unlock()
    sounds.play('bite')
    sounds.play('coin')
    const one = sources()
    for (let i = 0; i < 9; i++) sounds.play('coin')
    expect(sources()).toBe(one)
    sounds.play('tap')
    expect(sources()).toBeGreaterThan(one)
    const two = sources()
    contexts[0].currentTime += DEDUP + 0.001
    sounds.play('coin')
    expect(sources()).toBeGreaterThan(two)
  })

  it('lets a horn sound once a HORN_DEDUP and a slow repeater like the roller once a while', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]
    sounds.play('horn-semi')
    const one = sources()
    ctx.currentTime += DEDUP + 0.01
    sounds.play('horn-semi')
    expect(sources(), 'a horn held down does not stutter').toBe(one)
    ctx.currentTime += HORN_DEDUP
    sounds.play('horn-semi')
    expect(sources()).toBeGreaterThan(one)
    sounds.play('rolled')
    const two = sources()
    ctx.currentTime += 0.2
    sounds.play('rolled')
    expect(sources()).toBe(two)
    ctx.currentTime += 0.2
    sounds.play('rolled')
    expect(sources()).toBeGreaterThan(two)
  })

  it('switches sound (effects and engines) and music apart, and back', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const synth = vi.spyOn(Synth.prototype, 'setSound')
    const music = vi.spyOn(Synth.prototype, 'setMusic')
    sounds.setSound(false)
    sounds.setMusic(false)
    expect(synth).toHaveBeenLastCalledWith(false, expect.any(Number))
    expect(music).toHaveBeenLastCalledWith(false, expect.any(Number))
    const gains = contexts[0].nodes.filter((n): n is FakeGain => n instanceof FakeGain)
    expect(gains.some((g) => g.gain.events.at(-1)?.kind === 'target' && g.gain.events.at(-1)?.value === 0)).toBe(true)
    sounds.setSound(true)
    sounds.setMusic(true)
    expect(synth).toHaveBeenLastCalledWith(true, expect.any(Number))
    expect(music).toHaveBeenLastCalledWith(true, expect.any(Number))
  })

  it('ducks the music and the engines to a third while the microphone listens, and not the effects', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const decks = vi.spyOn(Synth.prototype, 'setListening')
    sounds.setDuck(true)
    const synth = decks.mock.contexts[0] as Synth
    expect(fake<FakeGain>(synth.soft).gain.events.at(-1)).toMatchObject({ kind: 'target', value: 1 / 3 })
    expect(reaches(fake<FakeNode>(synth.music), fake<FakeNode>(synth.soft))).toBe(true)
    expect(reaches(fake<FakeNode>(synth.loops), fake<FakeNode>(synth.soft))).toBe(true)
    sounds.setDuck(false)
    expect(fake<FakeGain>(synth.soft).gain.events.at(-1)).toMatchObject({ kind: 'target', value: 1 })
  })

  it('starts a tune only when it changes, and crossfades to another from its first bar', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setLoops({ ...quiet, tune: 'title' })
    run(2)
    for (let i = 0; i < 5; i++) sounds.setLoops({ ...quiet, tune: 'title' })
    expect(decks).toHaveBeenCalledTimes(1)
    const title = decks.mock.results[0].value as Deck
    const at = contexts[0].currentTime
    sounds.setLoops({ ...quiet, tune: 'road' })
    expect(decks).toHaveBeenCalledTimes(2)
    expect(decks.mock.calls[1][2]).toBe(0)
    const out = fake<FakeGain>(title.out).gain.events
    expect(out.at(-1)).toMatchObject({ kind: 'linear', value: 0 })
    expect(out.at(-1)!.time).toBeCloseTo(at + CROSSFADE, 6)
  })

  it('fades the tune out with no tune, and carries on from the start of its phrase when it comes back', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setLoops({ ...quiet, tune: 'bridge' })
    run(20)
    const bridge = decks.mock.results[0].value as Deck
    const stepped = bridge.step
    const at = contexts[0].currentTime
    sounds.setLoops(quiet)
    const out = fake<FakeGain>(bridge.out).gain.events
    expect(out.at(-1)!.time).toBeCloseTo(at + FADE_OUT, 6)
    run(3)
    expect(bridge.step, 'the clock stops with the tune').toBe(stepped)
    sounds.setLoops({ ...quiet, tune: 'bridge' })
    const from = decks.mock.calls[1][2]
    const phrase = SLOTS * 4
    expect(from % phrase).toBe(0)
    expect(from).toBeLessThanOrEqual(stepped)
    expect(stepped - from).toBeLessThan(phrase)
    expect(from).toBeGreaterThan(0)
  })

  it('schedules only within the lookahead, and skips ahead after a sleep instead of bursting', () => {
    const step = Synth.prototype.step
    const steps: [number, number][] = []
    vi.spyOn(Synth.prototype, 'step').mockImplementation(function (this: Synth, deck: Deck) {
      steps.push([deck.next, this.ctx.currentTime])
      step.call(this, deck)
    })
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setLoops({ ...quiet, tune: 'play' })
    const ctx = contexts[0]
    run(5)
    for (const [at, now] of steps) {
      expect(at).toBeGreaterThanOrEqual(now)
      expect(at).toBeLessThan(now + LOOKAHEAD)
    }
    const eighth = 30 / TUNES.play.bpm
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
    /** The note of the first bell a coin at the bottom of the scale rings. */
    const coin = () => {
      ctx.currentTime += 2
      const from = ctx.nodes.length
      sounds.play('coin')
      const bells = ctx.nodes.slice(from).filter((n): n is FakeOscillator => n instanceof FakeOscillator)
      return midiOf(Math.min(...bells.map((o) => o.frequency.events[0].value)))
    }
    expect(coin()).toBe(COIN_NOTES[0])
    for (const tune of TUNE_IDS) {
      sounds.setLoops({ ...quiet, tune })
      expect(coin(), tune).toBe(COIN_NOTES[0] + TUNES[tune].key)
    }
  })

  it('makes each loop the first time it sounds, follows it, and stops it quiet', () => {
    const layers = vi.spyOn(Synth.prototype, 'layer')
    const sets = vi.spyOn(Synth.prototype, 'setLayer')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setLoops(quiet)
    expect(layers).not.toHaveBeenCalled()
    sounds.setLoops({ ...quiet, pour: 0.6 })
    sounds.setLoops({ ...quiet, pour: 0.6 })
    sounds.setLoops({ ...quiet, pour: 0.6005 })
    sounds.setLoops({ ...quiet, pour: 1.7 })
    sounds.setLoops({ ...quiet, pour: 0.002 })
    sounds.setLoops(quiet)
    expect(layers).toHaveBeenCalledTimes(1)
    expect(sets.mock.calls.map((c) => c[1])).toEqual([0.6, 1, 0.002, 0])
    sounds.setLoops({ ...quiet, engine: { kind: 'forklift', rev: 0.5 }, friendEngines: 0.3, water: 0.4 })
    expect(layers.mock.calls.map((c) => c[0])).toEqual([LAYERS.pour, LAYERS.engine, LAYERS.friends, LAYERS.water])
    expect(() => sounds.setLoops({ ...quiet, hydraulic: NaN })).toThrow()
    expect(() => sounds.setLoops({ ...quiet, engine: { kind: 'digger', rev: NaN } })).toThrow()
  })

  it('bends an engine by its machine and its rev', () => {
    const sets = vi.spyOn(Synth.prototype, 'setLayer')
    const sounds = new Sounds()
    sounds.unlock()
    const pitchOf = (kind: MachineKind, rev: number) => {
      sets.mockClear()
      sounds.setLoops({ ...quiet, engine: { kind, rev } })
      return sets.mock.calls[0][3].pitch
    }
    const idle = pitchOf('digger', 0)
    expect(pitchOf('digger', 1)).toBeGreaterThan(idle)
    expect(pitchOf('forklift', 0)).toBeGreaterThan(idle)
    expect(pitchOf('semi', 0)).toBeLessThan(idle)
  })

  it('beeps the reversing beep every BEEP_EVERY while backing up, and stops with it', () => {
    const beeps = vi.spyOn(Synth.prototype, 'reverseBeep')
    const sounds = new Sounds()
    sounds.unlock()
    run(2)
    expect(beeps).not.toHaveBeenCalled()
    sounds.setLoops({ ...quiet, beep: true })
    run(4)
    const times = beeps.mock.calls.map((c) => c[0])
    expect(times.length).toBeGreaterThanOrEqual(4)
    expect(times.length).toBeLessThanOrEqual(6)
    times.slice(1).forEach((t, i) => expect(t - times[i]).toBeCloseTo(BEEP_EVERY, 9))
    sounds.setLoops(quiet)
    run(0.5)
    const n = beeps.mock.calls.length
    run(3)
    expect(beeps.mock.calls.length).toBe(n)
  })

  it('sleeps on suspend, plays nothing and keeps the clock stopped, and wakes on resume', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setLoops({ ...quiet, tune: 'house' })
    run(1)
    const deck = decks.mock.results[0].value as Deck
    sounds.suspend()
    const ctx = contexts[0]
    expect(ctx.suspends).toBe(1)
    const stepped = deck.step
    const made = sources()
    sounds.play('coin')
    sounds.unlock()
    expect(sources()).toBe(made)
    ctx.currentTime += 1
    vi.advanceTimersByTime(1000)
    expect(deck.step).toBe(stepped)
    expect(ctx.state, 'unlock leaves a suspended page asleep').toBe('suspended')
    sounds.resume()
    expect(ctx.state).toBe('running')
    run(1)
    expect(deck.step).toBeGreaterThan(stepped)
    sounds.play('coin')
    expect(sources()).toBeGreaterThan(made)
  })

  it('turns MIDI into Hz from A4 at 440', () => {
    expect(hz(69)).toBe(440)
    expect(hz(81)).toBeCloseTo(880, 9)
  })
})
