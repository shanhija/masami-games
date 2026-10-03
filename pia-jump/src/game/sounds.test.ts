/**
 * Checks the sounds without ears. The tunes: every bar is whole, the forms line up, the
 * notes stay in range and never grind a semitone against the chord on a beat. The voices: a
 * fake audio context records every node, connection and automation, so each effect, each
 * HUD sound and each step of every tune is checked to start silent, end silent, stop, stay
 * in the hearing range and reach its bus. The lifecycle: Sounds on the fake context and
 * fake timers (nothing before unlock, the dedup, the star climb, crossfades, a clock that
 * never bursts, the picnic played once, the gate's tone cut short). Loudness is measured in
 * a real browser instead, through an OfflineAudioContext.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { EventKind } from './model'
import {
  CHORDS, DEDUP, DONE_FOR, FAST, FOUND_FOR, HOLD_FOR, MASTER, MUSIC, SCORES, START_FOR, STAR_NOTES, STAR_RUN, Sounds, Synth, climb, penta, tuneSeconds,
  type Bar, type Deck, type Tune, type UiSound,
} from './sounds'

// ---------------------------------------------------------------------------------------
// A fake audio context that records everything and throws where a browser would.

type Automation = { kind: 'set' | 'linear' | 'exp' | 'target' | 'cancel'; value: number; time: number }

class FakeParam {
  value: number
  readonly events: Automation[] = []
  constructor(value: number) {
    this.value = value
  }
  private add(kind: Automation['kind'], value: number, time: number) {
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
    if (!(constant > 0)) throw new RangeError(`time constant ${constant}`)
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
    this.outs.push(dest)
    return dest
  }
  disconnect() {
    this.outs.length = 0
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam(1)
}

class FakeFilter extends FakeNode {
  type = 'lowpass'
  readonly frequency = new FakeParam(350)
  readonly Q = new FakeParam(1)
  readonly gain = new FakeParam(0)
}

class FakeCompressor extends FakeNode {
  readonly threshold = new FakeParam(-24)
  readonly knee = new FakeParam(30)
  readonly ratio = new FakeParam(12)
  readonly attack = new FakeParam(0.003)
  readonly release = new FakeParam(0.25)
}

class FakeSource extends FakeNode {
  startAt = -1
  stopAt = -1
  start(time: number) {
    if (this.startAt >= 0) throw new Error('started twice')
    if (!(time >= 0)) throw new RangeError(`start at ${time}`)
    this.startAt = time
  }
  stop(time: number) {
    if (this.startAt < 0) throw new Error('stopped before it started')
    if (!(time >= 0)) throw new RangeError(`stop at ${time}`)
    this.stopAt = time
  }
}

class FakeOscillator extends FakeSource {
  type = 'sine'
  readonly frequency = new FakeParam(440)
  readonly detune = new FakeParam(0)
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null
  loop = false
}

class FakeContext {
  static made = 0
  currentTime = 0
  readonly sampleRate = 48000
  state: 'running' | 'suspended' = 'running'
  resumes = 0
  readonly nodes: FakeNode[] = []
  readonly destination = new FakeNode(this)
  constructor() {
    FakeContext.made += 1
  }
  createGain() {
    return new FakeGain(this)
  }
  createBiquadFilter() {
    return new FakeFilter(this)
  }
  createDynamicsCompressor() {
    return new FakeCompressor(this)
  }
  createOscillator() {
    return new FakeOscillator(this)
  }
  createBufferSource() {
    return new FakeBufferSource(this)
  }
  createBuffer(channels: number, length: number, rate: number) {
    if (channels !== 1 || !Number.isInteger(length) || length <= 0 || rate !== this.sampleRate) throw new Error(`a buffer of ${channels} x ${length} at ${rate}`)
    const data = new Float32Array(length)
    return { length, sampleRate: rate, getChannelData: () => data }
  }
  resume() {
    this.resumes += 1
    this.state = 'running'
    return Promise.resolve()
  }
  /** Like a browser's, it takes effect a moment later. */
  suspend() {
    return Promise.resolve().then(() => {
      this.state = 'suspended'
    })
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
 * Checks the voices among `nodes` that start at or after `at`: each source starts and stops;
 * a voice (heard through `bus`) starts and ends silent inside its source's time, never
 * goes over `loudest`, and sounds from 20 Hz to 18 kHz; a modulator (it drives a param) only
 * starts and stops. Returns how long after `at` the last source stops and how many voices
 * there were.
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
    check(n.startAt >= at - 1e-9, `a source never started (${n.startAt})`)
    check(n.stopAt > n.startAt, `a source never stopped (${n.stopAt})`)
    end = Math.max(end, n.stopAt)
    const env = firstGain(n)
    if (env.outs.every((o) => o instanceof FakeParam)) continue
    voices += 1
    check(reaches(env, bus), 'a voice that never reaches its bus')
    const ev = env.gain.events
    const first = ev[0]!
    const last = ev[ev.length - 1]!
    check(first.kind === 'set' && first.value <= 0.001 && first.time <= n.startAt + 1e-9, `a voice that starts with a click: ${JSON.stringify(first)}`)
    check(last.value <= 0.001, `a voice that ends with a click: ${JSON.stringify(last)}`)
    check(last.time <= n.stopAt + 1e-9, `a voice cut off at ${n.stopAt} before it faded at ${last.time}`)
    ev.forEach((e, i) => check(i === 0 || e.time >= ev[i - 1]!.time, 'an envelope going back in time'))
    check(Math.max(...ev.map((e) => e.value)) <= loudest, `a voice louder than ${loudest}: ${Math.max(...ev.map((e) => e.value))}`)
    if (n instanceof FakeOscillator) for (const e of n.frequency.events) check(e.value >= 20 && e.value <= 18000, `a pitch of ${e.value} Hz`)
  }
  return { end: end - at, voices }
}

/** Every kind once: a Record, so a new kind fails to compile here until it is listed. */
const EVENT_KINDS = Object.keys({
  jump: 1, land: 1, skid: 1, bonk: 1, star: 1, giftStar: 1, bump: 1, break: 1, sprout: 1, grow: 1, wand: 1, ball: 1, ballEnd: 1, shrink: 1, hurt: 1, stomp: 1,
  kick: 1, shellPop: 1, knock: 1, wake: 1, blow: 1, trap: 1, pop: 1, spring: 1, fall: 1, rescued: 1, pole: 1, kitten: 1, bossHit: 1, bossDown: 1, gate: 1, done: 1,
} satisfies Record<EventKind, 1>) as EventKind[]
const UI_KINDS = Object.keys({ tap: 1, door: 1, locked: 1, hold: 1, fresh: 1, found: 1, start: 1 } satisfies Record<UiSound, 1>) as UiSound[]
const TUNES = Object.keys(SCORES) as Exclude<Tune, 'none'>[]
const ROOM_TUNES = ['garden', 'kitchen', 'bath', 'toys', 'roof'] as const

/** The notes of a run of bars, a list per bar. */
const notesOf = (bars: readonly Bar[]) => bars.map((b) => [...b.notes])

// ---------------------------------------------------------------------------------------

describe('the tunes', () => {
  it('have whole bars: eight slots each, a length exactly where a note starts', () => {
    for (const tune of TUNES) {
      for (const [i, bar] of SCORES[tune].bars.entries()) {
        const where = `${tune} bar ${i + 1}`
        expect(bar.notes, where).toHaveLength(8)
        expect(bar.lengths, where).toHaveLength(8)
        bar.notes.forEach((n, s) => expect(n > 0, `${where} slot ${s}`).toBe(bar.lengths[s]! > 0))
        expect(CHORDS[bar.chord], where).toBeDefined()
      }
    }
  })

  it('hold every note only over silent slots of its own part', () => {
    for (const tune of TUNES) {
      const bars = SCORES[tune].bars
      const slots = bars.flatMap((b) => b.notes.map((n, s) => ({ n, len: b.lengths[s]!, part: b.part })))
      slots.forEach((slot, i) => {
        for (let k = 1; k < slot.len; k++) {
          const held = slots[i + k]
          expect(held, `${tune}: a note runs off the end`).toBeDefined()
          expect(held!.n, `${tune}: a note held over another`).toBe(0)
          expect(held!.part, `${tune}: a note held into the next part`).toBe(slot.part)
        }
      })
    }
  })

  it('line up their forms: A B A B2 and the break in every room, A alone on the start screen, A and the ending at the picnic', () => {
    const parts = (tune: Exclude<Tune, 'none'>) => SCORES[tune].bars.map((b) => b.part).join(' ')
    const eight = (part: string) => Array(8).fill(part).join(' ')
    for (const room of ROOM_TUNES) {
      expect(parts(room)).toBe([eight('A'), eight('B'), eight('A'), eight('B2'), eight('break')].join(' '))
      expect(SCORES[room].loop).toBe(true)
    }
    expect(parts('rooms')).toBe(eight('A'))
    expect(parts('picnic')).toBe(`${eight('A')} coda coda end end`)
    expect(SCORES.picnic.loop).toBe(false)
  })

  it("share Pia's tune as every room's A, give each room its own B, and end B2 at home", () => {
    const a = notesOf(SCORES.rooms.bars)
    const bs = ROOM_TUNES.map((room) => JSON.stringify(notesOf(SCORES[room].bars.slice(8, 16))))
    expect(new Set(bs).size).toBe(ROOM_TUNES.length)
    for (const room of ROOM_TUNES) {
      const bars = SCORES[room].bars
      expect(notesOf(bars.slice(0, 8)), room).toEqual(a)
      expect(notesOf(bars.slice(16, 24)), room).toEqual(a)
      expect(notesOf(bars.slice(24, 30)), `${room}: B2 opens like B`).toEqual(notesOf(bars.slice(8, 14)))
      expect(notesOf(bars.slice(30, 32)), `${room}: B2 has its own ending`).not.toEqual(notesOf(bars.slice(14, 16)))
      const last = bars.slice(24, 32).flatMap((b) => b.notes).filter((n) => n > 0).pop()!
      expect(last % 12, `${room}: B2 ends on C before the break`).toBe(0)
      expect(bars.slice(32).every((b) => b.notes.every((n) => n === 0)), `${room}: the break has no melody`).toBe(true)
    }
    expect(SCORES.picnic.bars.flatMap((b) => b.notes).filter((n) => n > 0).pop()! % 12).toBe(0)
  })

  it('keep the melody in a singing range and never a semitone above the chord on a beat', () => {
    for (const tune of TUNES) {
      for (const [i, bar] of SCORES[tune].bars.entries()) {
        const { root, third } = CHORDS[bar.chord]
        const chord = [root, root + third, root + 7]
        bar.notes.forEach((n, s) => {
          if (n === 0) return
          expect(n, `${tune} bar ${i + 1}`).toBeGreaterThanOrEqual(67)
          expect(n, `${tune} bar ${i + 1}`).toBeLessThanOrEqual(88)
          if (s % 2 === 0) for (const t of chord) expect((n - t + 120) % 12, `${tune} bar ${i + 1} slot ${s} grinds on ${bar.chord}`).not.toBe(1)
        })
      }
    }
  })

  it('run about 86 s at 112 bpm, 80 s or more in every room, and the picnic once in about 23 s', () => {
    expect(tuneSeconds('garden')).toBeCloseTo((40 * 4 * 60) / 112, 6)
    expect(tuneSeconds('garden')).toBeGreaterThan(85)
    for (const room of ROOM_TUNES) expect(tuneSeconds(room)).toBeGreaterThanOrEqual(80)
    expect(tuneSeconds('picnic')).toBeCloseTo((12 * 4 * 60) / 126, 6)
  })
})

describe('the voices', () => {
  /** A synth on a fake context, and a function that audits what was made since. */
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

  it('wire the buses into the master and through the compressor to the speakers', () => {
    const { ctx, synth } = rig()
    const squash = ctx.nodes.find((n) => n instanceof FakeCompressor)!
    expect(squash.threshold.value).toBe(-18)
    expect(squash.ratio.value).toBe(4)
    expect(squash.outs).toEqual([ctx.destination])
    expect(fake<FakeGain>(synth.master).outs).toEqual([squash])
    expect(fake<FakeGain>(synth.master).gain.value).toBe(MASTER)
    expect(fake<FakeGain>(synth.effects).outs).toEqual([fake(synth.master)])
    expect(fake<FakeGain>(synth.music).outs).toEqual([fake(synth.master)])
    expect(fake<FakeGain>(synth.music).gain.value).toBe(MUSIC)
  })

  it('give every sim event a sound that starts and ends silent, stops and reaches the effects bus', () => {
    for (const kind of EVENT_KINDS) {
      for (const n of [0, 1, 2, 3, 4, 5, 6, 8]) {
        const { synth, since } = rig()
        synth.event(kind, n, 1)
        const { end, voices } = since(synth.effects, 1, 0.2)
        if (kind === 'land' && n <= 3) expect(voices, 'a small landing is silent').toBe(0)
        else expect(voices, `${kind} n=${n}`).toBeGreaterThan(0)
        expect(end, `${kind} n=${n}`).toBeLessThanOrEqual(kind === 'done' ? DONE_FOR + 0.03 : 1.8)
      }
    }
  })

  it('give every HUD sound the same, the jingles inside the time the music waits for them', () => {
    const limits: Record<UiSound, number> = { tap: 0.1, door: 1, locked: 0.5, hold: HOLD_FOR, fresh: 1.3, found: FOUND_FOR, start: START_FOR }
    for (const kind of UI_KINDS) {
      const { synth, since } = rig()
      synth.ui(kind, 2)
      const { end, voices } = since(synth.effects, 2, 0.2)
      expect(voices, kind).toBeGreaterThan(0)
      expect(end, kind).toBeLessThanOrEqual(limits[kind] + 0.03)
    }
  })

  it('end the meow before the chime, and the chime soon after', () => {
    const { ctx, synth } = rig()
    const from = ctx.nodes.length
    synth.event('kitten', 0, 0)
    const sources = ctx.nodes.slice(from).filter((n): n is FakeOscillator => n instanceof FakeOscillator && firstGain(n).outs.some((o) => o instanceof FakeNode))
    const meow = sources.filter((o) => o.frequency.events[0]!.value === 600)
    expect(meow).toHaveLength(2)
    expect(meow.map((o) => o.frequency.events.map((e) => e.value))).toEqual([
      [600, 900, 500],
      [600, 900, 500],
    ])
    for (const o of meow) expect(o.stopAt).toBeLessThanOrEqual(0.4)
    const chime = sources.filter((o) => o.startAt > 0.4)
    expect(new Set(chime.map((o) => o.startAt)).size).toBe(2)
    expect(Math.max(...chime.map((o) => o.stopAt))).toBeLessThanOrEqual(1.8)
  })

  it('climb the star chime a step for each star within STAR_RUN, stay at the top, and start again after a pause', () => {
    expect(STAR_NOTES).toEqual([10, 11, 12, 13, 14, 15, 16, 17].map(penta))
    expect(climb(0, Infinity)).toBe(0)
    let rung = 0
    const rungs = []
    for (let i = 0; i < 10; i++) rungs.push((rung = climb(rung, i === 0 ? Infinity : 0.3)))
    expect(rungs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7, 7])
    expect(climb(4, STAR_RUN)).toBe(5)
    expect(climb(4, STAR_RUN + 0.01)).toBe(0)
    const { ctx, synth } = rig()
    const pitches: number[] = []
    const times = [0, 0.2, 0.4, 0.6, 0.8, 1.7, 1.9]
    for (const t of times) {
      const from = ctx.nodes.length
      synth.event(t < 1 ? 'star' : 'giftStar', 0, t)
      pitches.push(Math.min(...ctx.nodes.slice(from).filter((n) => n instanceof FakeOscillator).map((o) => o.frequency.events[0]!.value)))
    }
    const midi = pitches.map((f) => Math.round(69 + 12 * Math.log2(f / 440)))
    expect(midi).toEqual([84, 86, 88, 91, 93, 84, 86])
  })

  it('play every step of every tune clean, slow and fast, into the music bus, on a steady beat', () => {
    for (const tune of TUNES) {
      for (const fast of [false, true]) {
        const { synth, since } = rig()
        const deck = synth.deck(tune, fast, 0.5, 0.05)
        const steps = SCORES[tune].bars.length * 8
        for (let i = 0; i < steps; i++) synth.step(deck, deck.next)
        const eighth = 30 / (SCORES[tune].bpm * (fast ? FAST : 1))
        expect(deck.next, `${tune} ${fast}`).toBeCloseTo(0.5 + steps * eighth, 6)
        synth.retire(deck, deck.next, 0.3)
        const { voices } = since(synth.music, 0.5, 0.2)
        expect(voices, tune).toBeGreaterThan(steps / 4)
      }
    }
  }, 60_000)
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

  /** Moves the context's clock and the timers on together, in the clock's own 100 ms ticks. */
  function run(seconds: number) {
    const ctx = contexts[0]!
    for (let t = 0; t < seconds - 1e-9; t += 0.1) {
      ctx.currentTime += 0.1
      vi.advanceTimersByTime(100)
    }
  }
  const sources = () => contexts[0]!.nodes.filter((n) => n instanceof FakeSource).length

  it('does nothing before the first unlock, then makes one context and wakes it when it sleeps', async () => {
    const sounds = new Sounds()
    sounds.setTune('garden', false)
    sounds.play({ kind: 'star', x: 0, y: 0, n: 0 })
    sounds.ui('tap')
    sounds.setMusic(false)
    sounds.setMusic(true)
    sounds.suspend()
    expect(contexts).toHaveLength(0)
    sounds.unlock()
    sounds.unlock()
    expect(contexts).toHaveLength(1)
    const ctx = contexts[0]!
    expect(ctx.resumes).toBe(0)
    sounds.suspend()
    await Promise.resolve()
    expect(ctx.state).toBe('suspended')
    sounds.unlock()
    expect(ctx.state).toBe('running')
    expect(ctx.resumes).toBe(1)
  })

  it('plays the same kind once within DEDUP, and again after', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const star = { kind: 'star', x: 0, y: 0, n: 0 } as const
    sounds.play(star)
    const one = sources()
    sounds.play(star)
    expect(sources()).toBe(one)
    sounds.play({ kind: 'jump', x: 0, y: 0, n: 0 })
    expect(sources()).toBeGreaterThan(one)
    const two = sources()
    contexts[0]!.currentTime += DEDUP + 0.001
    sounds.play(star)
    expect(sources()).toBeGreaterThan(two)
  })

  it('starts the tune on unlock, ignores the same tune again, and crossfades to a new one from its first bar', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.setTune('garden', false)
    sounds.unlock()
    expect(decks).toHaveBeenCalledTimes(1)
    run(2)
    sounds.setTune('garden', false)
    expect(decks).toHaveBeenCalledTimes(1)
    const garden = decks.mock.results[0]!.value as Deck
    sounds.setTune('kitchen', false)
    expect(decks).toHaveBeenCalledTimes(2)
    const kitchen = decks.mock.results[1]!.value as Deck
    const out = (d: Deck) => fake<FakeGain>(d.out).gain.events
    expect(out(garden).at(-1)).toMatchObject({ kind: 'linear', value: 0 })
    expect(out(garden).at(-1)!.time).toBeCloseTo(2 + 0.3, 6)
    expect(out(kitchen).at(-1)).toMatchObject({ kind: 'linear', value: 1 })
    expect(out(kitchen).at(-1)!.time - out(kitchen)[0]!.time).toBeCloseTo(0.3, 6)
    expect(kitchen.step).toBeGreaterThan(0)
    expect(decks.mock.calls[1]![0]).toBe('kitchen')
  })

  it('schedules a step only within the lookahead, and skips ahead after a sleep instead of bursting', () => {
    const steps = vi.spyOn(Synth.prototype, 'step')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('garden', false)
    const ctx = contexts[0]!
    for (let i = 0; i < 100; i++) {
      run(0.1)
      for (const [, at] of steps.mock.calls) expect(at).toBeLessThan(ctx.currentTime + 0.25 + 1e-9)
    }
    const before = steps.mock.calls.length
    expect(before).toBeGreaterThanOrEqual(Math.floor(10 / (30 / SCORES.garden.bpm)))
    ctx.currentTime += 30
    vi.advanceTimersByTime(100)
    const woke = steps.mock.calls.slice(before)
    expect(woke.length).toBeLessThanOrEqual(2)
    for (const [, at] of woke) expect(at).toBeGreaterThanOrEqual(ctx.currentTime)
  })

  it('stops the clock with the music off and starts again from the top with it on; sound off silences everything', () => {
    const steps = vi.spyOn(Synth.prototype, 'step')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('bath', false)
    run(2)
    sounds.setMusic(false)
    const off = steps.mock.calls.length
    run(3)
    expect(steps.mock.calls.length).toBe(off)
    sounds.setMusic(true)
    run(1)
    expect(steps.mock.calls.length).toBeGreaterThan(off)
    // A new deck, so the tune starts from its first bar.
    expect(steps.mock.calls[off]![0]).not.toBe(steps.mock.calls[off - 1]![0])
    sounds.setSound(false)
    const silent = steps.mock.calls.length
    const made = sources()
    sounds.play({ kind: 'star', x: 0, y: 0, n: 0 })
    sounds.ui('tap')
    run(2)
    expect(sources()).toBe(made)
    expect(steps.mock.calls.length).toBe(silent)
    sounds.setSound(true)
    run(1)
    expect(steps.mock.calls.length).toBeGreaterThan(silent)
  })

  it('stops the tune at once when the page sleeps (before the context has), and fades it gently to no tune when awake', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    const fadeOf = () => {
      const ev = fake<FakeGain>((decks.mock.results.at(-1)!.value as Deck).out).gain.events
      return ev.at(-1)!.time - ev.at(-2)!.time
    }
    sounds.setTune('roof', false)
    run(2)
    sounds.suspend()
    expect(ctx.state).toBe('running')
    sounds.setTune('none', false)
    expect(fadeOf()).toBe(0)
    sounds.unlock()
    sounds.setTune('roof', false)
    run(2)
    sounds.setTune('none', false)
    expect(fadeOf()).toBeCloseTo(1.2, 6)
  })

  it('plays the picnic once through and then stays quiet', () => {
    const steps = vi.spyOn(Synth.prototype, 'step')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('picnic', false)
    run(tuneSeconds('picnic') + 5)
    expect(steps).toHaveBeenCalledTimes(SCORES.picnic.bars.length * 8)
    sounds.setTune('picnic', false)
    sounds.setMusic(false)
    sounds.setMusic(true)
    run(3)
    expect(steps).toHaveBeenCalledTimes(SCORES.picnic.bars.length * 8)
  })

  it('carries on from where the tune is at the rainbow ball, an arpeggio fading in', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const steps = vi.spyOn(Synth.prototype, 'step')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('toys', false)
    run(3)
    sounds.setTune('toys', true)
    run(3)
    sounds.setTune('toys', false)
    expect(decks).toHaveBeenCalledTimes(1)
    const deck = decks.mock.results[0]!.value as Deck
    const gaps = steps.mock.calls.map(([, at], i, all) => (i === 0 ? 0 : at - all[i - 1]![1]))
    const eighth = 30 / SCORES.toys.bpm
    expect(gaps.filter((g) => Math.abs(g - eighth / FAST) < 1e-6).length).toBeGreaterThan(10)
    expect(fake<FakeGain>(deck.arp).gain.events.map((e) => e.kind === 'linear' && e.value)).toEqual([false, false, 1, false, false, 0])
  })

  it('holds the tune back for the start jingle and the kitten-home chime, then starts it from the top', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('rooms', false)
    run(1)
    sounds.ui('start')
    const ctx = contexts[0]!
    const now = ctx.currentTime
    sounds.setTune('garden', false)
    expect(decks.mock.calls.at(-1)![0]).toBe('garden')
    expect(decks.mock.calls.at(-1)![2]).toBeCloseTo(now + START_FOR, 6)
    run(3)
    sounds.ui('found')
    expect(decks.mock.calls.at(-1)![0]).toBe('garden')
    expect(decks.mock.calls.at(-1)![2]).toBeCloseTo(ctx.currentTime + FOUND_FOR, 6)
  })

  it("ends the room's tune at 'done' until the tune changes, and the next waits for the jingle", () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const steps = vi.spyOn(Synth.prototype, 'step')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('roof', false)
    run(2)
    const ctx = contexts[0]!
    const at = ctx.currentTime
    sounds.play({ kind: 'done', x: 0, y: 0, n: 0 })
    const quiet = steps.mock.calls.length
    run(2)
    sounds.setMusic(false)
    sounds.setMusic(true)
    run(0.2)
    expect(steps.mock.calls.length).toBe(quiet)
    sounds.setTune('rooms', false)
    expect(decks.mock.calls.at(-1)![2]).toBeCloseTo(at + DONE_FOR, 6)
    run(1)
    expect(steps.mock.calls.length).toBeGreaterThan(quiet)
  })

  it("cuts the gate's rising tone short at the next HUD sound, or when the page sleeps", () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    for (const end of ['tap', 'suspend'] as const) {
      const from = ctx.nodes.length
      sounds.ui('hold')
      const rising = ctx.nodes.slice(from).find((n): n is FakeOscillator => n instanceof FakeOscillator && n.frequency.events[0]!.value === 262)!
      const fader = firstGain(rising).outs[0] as FakeGain
      expect(fader.gain.events).toEqual([])
      ctx.currentTime += 1
      if (end === 'tap') sounds.ui('tap')
      else sounds.suspend()
      expect(fader.gain.events.at(-1)).toMatchObject({ kind: 'linear', value: 0 })
      expect(fader.gain.events.at(-1)!.time).toBeLessThanOrEqual(ctx.currentTime + 0.05 + 1e-9)
      sounds.unlock()
    }
  })
})
