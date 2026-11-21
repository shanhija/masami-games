/**
 * Checks the sounds without ears. The tunes: every bar parses whole, the melodies stay on the
 * pentatonic in a singing range, the chords in C major, no melody note grinds a semitone
 * above its chord on a beat, and the courses share the walk with a B of their own. The
 * voices: a fake audio context records every node, connection and automation (and throws
 * where a browser would), so every event in every variant, every HUD sound and every step of
 * every tune is checked to start silent, end silent, stop, stay gentle, stay in the hearing
 * range and reach its bus. The lifecycle: Sounds on the fake context and fake timers
 * (nothing before unlock, the dedup and the patter, the stars' climb, crossfades, a clock
 * that never bursts, the switches, the jingles that hold the tune back, the party played
 * once, the hold tone cut short, suspend and the wake).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CLIMB_FOR, COURSES, DISHES, GATE_WARN, HUES, LIFT_FOR, TEETER_FOR, type FeedEvent, type SimEvent } from './model'
import {
  CHORDS, DEDUP, DUCK, EFFECTS, FADE, FADE_OUT, GO_FOR, HOLD_FOR, HOME_FOR, HUE_STEP, LOOKAHEAD, MASTER, MUSIC, PATTER, PATTER_MAX, PICK_STEP, PICK_TOP, SCORES, STAR_NOTES,
  STAR_RUN, Sounds, Synth, bars, nextRung, penta, tuneSeconds, type Bar, type Deck, type Tune, type UiSound,
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
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null
  loop = false
}

class FakeContext {
  currentTime = 0
  readonly sampleRate = 48000
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
const isSource = (n: FakeNode): n is FakeSource => n instanceof FakeSource
const isOscillator = (n: FakeNode): n is FakeOscillator => n instanceof FakeOscillator
/** The MIDI note nearest a frequency. */
const midiOf = (f: number) => Math.round(69 + 12 * Math.log2(f / 440))

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

/** The first gain after a source, through any filter: its envelope, or a modulator's depth. */
function firstGain(source: FakeSource): FakeGain {
  let n: FakeNode = source
  while (!(n instanceof FakeGain)) {
    const next = n.outs[0]
    if (!(next instanceof FakeNode)) throw new Error('a source that goes nowhere')
    n = next
  }
  return n
}

/** The gentlest ceiling every single voice keeps under: nothing loud, nothing that startles. */
const LOUDEST = 0.2

/**
 * Checks the voices among `nodes`: each source starts at or after `at` and stops; a voice
 * (heard through `bus`) starts and ends silent inside its source's time, never goes over
 * LOUDEST, swells in over at least 2 ms if it is loud, and sounds from 20 Hz to 18 kHz; a
 * modulator (it drives a param) only starts and stops. Returns how long after `at` the last
 * source stops and how many voices there were.
 */
function audit(nodes: readonly FakeNode[], bus: FakeNode, at: number) {
  // Plain checks rather than expect: a tune makes thousands of voices.
  const check = (ok: boolean, why: string) => {
    if (!ok) throw new Error(why)
  }
  let end = at
  let voices = 0
  for (const n of nodes) {
    if (!isSource(n)) continue
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
    const peak = ev.reduce((p, e) => (e.value > p.value ? e : p))
    check(peak.value <= LOUDEST, `a voice louder than ${LOUDEST}: ${peak.value}`)
    check(peak.value < 0.08 || peak.time - first.time >= 0.002 - 1e-9, `a loud voice that starts in under 2 ms: ${JSON.stringify(ev)}`)
    if (isOscillator(n)) for (const e of n.frequency.events) check(e.value >= 20 && e.value <= 18000, `a pitch of ${e.value} Hz`)
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
    since(bus: AudioNode, at: number) {
      const made = ctx.nodes.slice(from)
      from = ctx.nodes.length
      return audit(made, fake<FakeNode>(bus), at)
    },
  }
}

type AnyEvent = SimEvent | FeedEvent
/** Every event kind, in every variant that sounds different: a mapped type, so a new kind fails to compile here until it is listed. */
const EVENTS: { [K in AnyEvent['kind']]: Extract<AnyEvent, { kind: K }>[] } = {
  pick: [...[1, 2, 3, 5, 8, 12].map((n) => ({ kind: 'pick' as const, food: 'patty' as const, n, x: 0, y: 0 })), { kind: 'pick', food: 'poop', n: 2, x: 0, y: 0 }],
  bonk: [0, 1, 3, 9].map((n) => ({ kind: 'bonk', n, x: 0, y: 0 })),
  land: [
    { kind: 'land', food: 'cheese', x: 0, y: 0 },
    { kind: 'land', food: 'poop', x: 0, y: 0 },
  ],
  sink: [{ kind: 'sink', food: 'jam', x: 0, y: 0 }],
  teeter: [{ kind: 'teeter', x: 0, y: 0 }],
  splash: [0, 2, 7].map((n) => ({ kind: 'splash', n, foods: Array.from({ length: n }, (_, i) => (i % 3 === 2 ? 'poop' : 'salad')), x: 0, y: 0 })),
  frog: [{ kind: 'frog', x: 0, y: 0 }],
  back: [{ kind: 'back', x: 0, y: 0 }],
  press: HUES.map((hue) => ({ kind: 'press', hue, x: 0, y: 0 })),
  open: HUES.map((hue) => ({ kind: 'open', hue })),
  warn: HUES.map((hue) => ({ kind: 'warn', hue })),
  close: HUES.map((hue) => ({ kind: 'close', hue })),
  zap: [
    { kind: 'zap', hue: 'pink', lost: false, x: 0, y: 0 },
    { kind: 'zap', hue: 'blue', lost: true, x: 0, y: 0 },
  ],
  shove: [{ kind: 'shove', hue: 'green', x: 0, y: 0 }],
  flag: [{ kind: 'flag', i: 0, x: 0, y: 0 }],
  puppy: [{ kind: 'puppy', x: 0, y: 0 }],
  finish: [{ kind: 'finish', x: 0, y: 0 }],
  bread: DISHES.map((dish) => ({ kind: 'bread', dish })),
  climb: [{ kind: 'climb' }],
  liftoff: [{ kind: 'liftoff' }],
  drop: [
    { kind: 'drop', food: 'bunBottom', x: 3 },
    { kind: 'drop', food: 'poop', x: 3 },
  ],
  chomp: [0, 1, 4, 12].map((n) => ({ kind: 'chomp', food: 'patty', n, x: 3 })),
  bleh: [{ kind: 'bleh', x: 3 }],
  miss: [{ kind: 'miss', food: 'egg', x: 3 }],
  bird: [{ kind: 'bird', x: 3 }],
  full: [{ kind: 'full' }],
  burp: [{ kind: 'burp' }],
  stars: [1, 2, 3].map((n) => ({ kind: 'stars', n })),
}
const ALL_EVENTS: AnyEvent[] = Object.values(EVENTS).flat()
const UI_KINDS = Object.keys({ tap: 1, card: 1, locked: 1, dish: 1, add: 1, remove: 1, go: 1, star: 1, home: 1, hold: 1, fresh: 1 } satisfies Record<UiSound, 1>) as UiSound[]
const TUNES = Object.keys(SCORES) as Exclude<Tune, 'none'>[]
const PENTATONIC = [0, 2, 4, 7, 9]
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** The notes of a run of bars, a list per bar, and the last note of all. */
const notesOf = (all: readonly Bar[]) => all.map((b) => [...b.notes])
const lastNote = (all: readonly Bar[]) => all.flatMap((b) => b.notes).filter((n) => n > 0).pop()!

// ---------------------------------------------------------------------------------------

describe('the tunes', () => {
  it('parse whole: eight slots a bar, a length exactly where a note starts, every note held only over silence; the parser refuses what is not a bar of the pentatonic', () => {
    for (const tune of TUNES) {
      const all = SCORES[tune].bars
      for (const [i, bar] of all.entries()) {
        expect(bar.notes, `${tune} bar ${i + 1}`).toHaveLength(8)
        expect(bar.lengths, `${tune} bar ${i + 1}`).toHaveLength(8)
        bar.notes.forEach((n, s) => expect(n > 0, `${tune} bar ${i + 1} slot ${s}`).toBe(bar.lengths[s]! > 0))
      }
      const slots = all.flatMap((b) => b.notes.map((n, s) => ({ n, len: b.lengths[s]! })))
      slots.forEach((slot, i) => {
        for (let k = 1; k < slot.len; k++) expect(slots[i + k]?.n, `${tune}: a note held over another, or off the end`).toBe(0)
      })
    }
    expect(bars(['C5 -  -  E5 .  G4 -  .'], ['C'])).toEqual([{ chord: 'C', notes: [72, 0, 0, 76, 0, 67, 0, 0], lengths: [3, 0, 0, 1, 0, 2, 0, 0] }])
    expect(() => bars(['C5 D5 E5'], ['C'])).toThrow(/3 slots/)
    expect(() => bars(['-  .  .  .  .  .  .  .'], ['C'])).toThrow(/nothing to hold/)
    expect(() => bars(['F5 .  .  .  .  .  .  .'], ['F'])).toThrow(/pentatonic/)
    expect(() => bars(['B4 .  .  .  .  .  .  .'], ['G'])).toThrow(/pentatonic/)
    expect(() => bars(['C5 .  .  .  .  .  .  .'], ['C', 'G'])).toThrow(/2 chords/)
  })

  it('are in key: the melodies on the C major pentatonic in a singing range, the chords (and so the bass) in C major, no note a semitone above its chord on a beat', () => {
    for (const tune of TUNES) {
      for (const [i, bar] of SCORES[tune].bars.entries()) {
        const where = `${tune} bar ${i + 1}`
        const { root, third } = CHORDS[bar.chord]
        const tones = [root, root + third, root + 7]
        for (const t of tones) expect(C_MAJOR, `${where}: ${bar.chord}`).toContain(t % 12)
        bar.notes.forEach((n, s) => {
          if (n === 0) return
          expect(PENTATONIC, `${where} slot ${s}`).toContain(n % 12)
          expect(n, where).toBeGreaterThanOrEqual(67)
          expect(n, where).toBeLessThanOrEqual(88)
          if (s % 2 === 0) for (const t of tones) expect((n - t + 120) % 12, `${where} slot ${s} grinds on ${bar.chord}`).not.toBe(1)
        })
      }
    }
    // The chimes the effects climb are on the same pentatonic, so they fit over any tune.
    for (const m of [...STAR_NOTES, ...HUES.map((h) => penta(HUE_STEP[h])), ...Array.from({ length: PICK_TOP }, (_, i) => penta(PICK_STEP + i))]) expect(PENTATONIC).toContain(m % 12)
  })

  it('share the walk as every course\'s A, give each course its own B and B2 ending, and come home on C', () => {
    const walk = notesOf(SCORES.park.bars.slice(0, 8))
    for (const course of COURSES) {
      const all = SCORES[course].bars
      expect(all, course).toHaveLength(32)
      expect(notesOf(all.slice(0, 8)), course).toEqual(walk)
      expect(notesOf(all.slice(16, 24)), course).toEqual(walk)
      expect(notesOf(all.slice(24, 30)), `${course}: B2 opens like B`).toEqual(notesOf(all.slice(8, 14)))
      expect(notesOf(all.slice(30, 32)), `${course}: B2 ends its own way`).not.toEqual(notesOf(all.slice(14, 16)))
      expect(lastNote(all) % 12, `${course}: B2 comes home to C before the walk`).toBe(0)
      expect(SCORES[course].loop, course).toBe(true)
    }
    expect(new Set(COURSES.map((c) => JSON.stringify(notesOf(SCORES[c].bars.slice(8, 16))))).size).toBe(COURSES.length)
    expect(new Set(COURSES.map((c) => `${SCORES[c].lead} ${SCORES[c].kit}`)).size, 'each course has its own band').toBe(COURSES.length)
    expect(notesOf(SCORES.party.bars.slice(0, 8))).toEqual(walk)
    expect(SCORES.party.loop).toBe(false)
    for (const tune of ['party', 'menu'] as const) expect(lastNote(SCORES[tune].bars) % 12, tune).toBe(0)
    const openings = (['menu', 'park', 'feed'] as const).map((t) => JSON.stringify(notesOf(SCORES[t].bars.slice(0, 2))))
    expect(new Set(openings).size, 'the menu and the finale have tunes of their own').toBe(3)
  })

  it('run long enough not to wear thin, the finale quicker than every course and the menu slower, the party once in about half a minute', () => {
    for (const course of COURSES) {
      expect(tuneSeconds(course), course).toBeGreaterThan(60)
      expect(SCORES.feed.bpm).toBeGreaterThan(SCORES[course].bpm)
      expect(SCORES.menu.bpm).toBeLessThan(SCORES[course].bpm)
    }
    expect(tuneSeconds('menu')).toBeGreaterThan(40)
    expect(tuneSeconds('park')).toBeCloseTo((32 * 4 * 60) / 116, 6)
    expect(tuneSeconds('party')).toBeCloseTo((16 * 4 * 60) / 128, 6)
    expect(tuneSeconds('none')).toBe(0)
  })
})

describe('the voices', () => {
  it('wire the effects and the quieter music through the master and a compressor to the speakers', () => {
    const { ctx, synth } = rig()
    const squash = ctx.nodes.find((n): n is FakeCompressor => n instanceof FakeCompressor)!
    expect(squash.outs).toEqual([ctx.destination])
    expect(squash.ratio.value).toBe(4)
    expect(fake<FakeGain>(synth.master).outs).toEqual([squash])
    expect(fake<FakeGain>(synth.master).gain.value).toBe(MASTER)
    expect(fake<FakeGain>(synth.effects).outs).toEqual([fake(synth.master)])
    expect(fake<FakeGain>(synth.effects).gain.value).toBe(EFFECTS)
    expect(fake<FakeGain>(synth.music).outs).toEqual([fake(synth.master)])
    expect(fake<FakeGain>(synth.music).gain.value).toBe(MUSIC)
    expect(fake<FakeGain>(synth.duck).outs).toEqual([fake(synth.music)])
    expect(MUSIC).toBeLessThan(EFFECTS / 2)
  })

  it('give every course and finale event, in every variant, a gentle sound that starts and ends silent, stops and reaches the effects bus', () => {
    const limits: Partial<Record<AnyEvent['kind'], number>> = { warn: GATE_WARN, liftoff: LIFT_FOR, climb: CLIMB_FOR, teeter: TEETER_FOR }
    for (const e of ALL_EVENTS) {
      const { synth, since } = rig()
      synth.event(e, 1)
      const { end, voices } = since(synth.effects, 1)
      expect(voices, JSON.stringify(e)).toBeGreaterThan(0)
      expect(end, JSON.stringify(e)).toBeLessThanOrEqual((limits[e.kind] ?? 1.5) + 1e-9)
    }
  })

  it('give every HUD sound the same, the jingles inside the time the tune waits for them', () => {
    const limits: Record<UiSound, number> = { tap: 0.1, card: 0.9, locked: 0.5, dish: 0.8, add: 0.4, remove: 0.2, go: GO_FOR, star: 0.7, home: HOME_FOR, hold: HOLD_FOR + 0.02, fresh: 1.2 }
    for (const kind of UI_KINDS) {
      const { synth, since } = rig()
      synth.ui(kind, 2)
      const { end, voices } = since(synth.effects, 2)
      expect(voices, kind).toBeGreaterThan(0)
      expect(end, kind).toBeLessThanOrEqual(limits[kind] + 1e-9)
    }
  })

  it('pop each pick a pentatonic step higher with the pile, stopping at the top rung, and give a poop its own bleh', () => {
    const { ctx, synth } = rig()
    const pops: number[] = []
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 14]) {
      const from = ctx.nodes.length
      synth.event({ kind: 'pick', food: 'tomato', n, x: 0, y: 0 }, n)
      pops.push(midiOf(ctx.nodes.slice(from).find(isOscillator)!.frequency.events.at(-1)!.value))
    }
    expect(pops).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 8].map((rung) => penta(PICK_STEP + rung - 1)))
    expect(pops[0]).toBe(72)
    const from = ctx.nodes.length
    synth.event({ kind: 'pick', food: 'poop', n: 3, x: 0, y: 0 }, 20)
    const bleh = ctx.nodes.slice(from)
    expect(bleh.some((n) => n instanceof FakeBufferSource), 'a squelch').toBe(true)
    expect(bleh.filter(isOscillator).some((o) => o.type === 'sawtooth'), 'a grumble and a fly').toBe(true)
    const voices = bleh.filter(isOscillator).filter((o) => firstGain(o).outs.some((n) => n instanceof FakeNode))
    expect(voices.map((o) => midiOf(o.frequency.events.at(-1)!.value)), 'no pop of the scale').not.toContain(penta(PICK_STEP + 2))
  })

  it('climb the star chime a step for each star within STAR_RUN, stay at the top, and start again after a pause', () => {
    expect(nextRung(0, Infinity)).toBe(0)
    let rung = 0
    const rungs = []
    for (let i = 0; i < 7; i++) rungs.push((rung = nextRung(rung, i === 0 ? Infinity : 0.4)))
    expect(rungs).toEqual([0, 1, 2, 3, 4, 4, 4])
    expect(nextRung(2, STAR_RUN)).toBe(3)
    expect(nextRung(2, STAR_RUN + 0.01)).toBe(0)
    const { ctx, synth } = rig()
    const notes = [0, 0.5, 1, 1.4, 4, 4.4].map((t) => {
      const from = ctx.nodes.length
      synth.ui('star', t)
      return midiOf(ctx.nodes.slice(from).find(isOscillator)!.frequency.events[0]!.value)
    })
    expect(notes).toEqual([84, 88, 91, 96, 84, 88])
  })

  it("give each gate colour its own note: the button's run ends on it, the gate opens on it and closes from it", () => {
    expect(new Set(HUES.map((h) => HUE_STEP[h])).size).toBe(HUES.length)
    for (const hue of HUES) {
      const note = penta(HUE_STEP[hue])
      const { ctx, synth } = rig()
      const oscillators = (e: AnyEvent) => {
        const from = ctx.nodes.length
        synth.event(e, 1)
        return ctx.nodes.slice(from).filter(isOscillator)
      }
      expect(midiOf(oscillators({ kind: 'press', hue, x: 0, y: 0 }).at(-1)!.frequency.events[0]!.value), hue).toBe(note)
      expect(midiOf(oscillators({ kind: 'open', hue })[0]!.frequency.events[0]!.value), hue).toBe(note)
      expect(midiOf(oscillators({ kind: 'close', hue })[0]!.frequency.events[0]!.value), hue).toBe(note)
    }
  })

  it('play every step of every tune clean into the music bus, swinging the off-beats with every beat on time, and ring the party out on one chord', () => {
    for (const tune of TUNES) {
      const { ctx, synth, since } = rig()
      const score = SCORES[tune]
      const deck = synth.deck(tune, 0.5, 0.05)
      const steps = score.bars.length * 8
      const beat = 60 / score.bpm
      const times: number[] = []
      const made: number[] = []
      for (let i = 0; i < steps; i++) {
        times.push(deck.next)
        const from = ctx.nodes.length
        synth.step(deck)
        made.push(ctx.nodes.length - from)
      }
      for (let i = 0; i < steps; i += 2) expect(times[i], `${tune} beat ${i / 2}`).toBeCloseTo(0.5 + (i / 2) * beat, 6)
      expect(times[1]! - times[0]!, tune).toBeCloseTo(score.swing * beat, 6)
      expect(deck.next, tune).toBeCloseTo(0.5 + (steps / 2) * beat, 6)
      if (!score.loop) {
        expect(made.at(-8), `${tune}: the last chord`).toBeGreaterThan(0)
        expect(made.slice(-7), `${tune}: then nothing`).toEqual([0, 0, 0, 0, 0, 0, 0])
      }
      synth.retire(deck, deck.next, 0.3)
      const { voices } = since(synth.music, 0.5)
      expect(voices, tune).toBeGreaterThan(steps / 4)
    }
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

  /** Moves the context's clock and the timers on together, in the clock's own 100 ms ticks. */
  function run(seconds: number) {
    const ctx = contexts[0]!
    for (let t = 0; t < seconds - 1e-9; t += 0.1) {
      ctx.currentTime += 0.1
      vi.advanceTimersByTime(100)
    }
  }
  const sources = () => contexts[0]!.nodes.filter(isSource).length
  const faderOf = (deck: Deck) => fake<FakeGain>(deck.out).gain.events
  const pick = { kind: 'pick', food: 'banana', n: 1, x: 0, y: 0 } as const
  const bonk = { kind: 'bonk', n: 2, x: 0, y: 0 } as const

  it('does nothing before the first unlock, only remembering, then makes one context with the switches as they were, and wakes it after a suspend', async () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.setTune('park')
    sounds.play(pick)
    sounds.play({ kind: 'chomp', food: 'cheese', n: 1, x: 3 })
    sounds.ui('hold')
    sounds.ui('go')
    sounds.setSound(false)
    sounds.setMusic(false)
    sounds.suspend()
    expect(contexts).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
    expect(sounds.sound).toBe(false)
    expect(sounds.music).toBe(false)
    sounds.setSound(true)
    sounds.unlock()
    sounds.unlock()
    expect(contexts).toHaveLength(1)
    const ctx = contexts[0]!
    const master = ctx.nodes.find((n): n is FakeGain => n instanceof FakeGain && n.outs[0] instanceof FakeCompressor)!
    expect(master.gain.value).toBe(MASTER)
    expect(decks, 'the music is off: no tune yet').not.toHaveBeenCalled()
    sounds.setMusic(true)
    expect(decks.mock.calls.at(-1)![0], 'the tune asked for before the unlock').toBe('park')
    expect(ctx.resumes).toBe(0)
    sounds.suspend()
    await Promise.resolve()
    expect(ctx.state).toBe('suspended')
    sounds.unlock()
    expect(ctx.state).toBe('running')
    expect(ctx.resumes).toBe(1)
  })

  it('plays every event and every HUD sound without a throw, each scheduling nodes', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    for (const e of ALL_EVENTS) {
      ctx.currentTime += 0.5
      const made = sources()
      sounds.play(e)
      expect(sources(), JSON.stringify(e)).toBeGreaterThan(made)
    }
    for (const kind of UI_KINDS) {
      ctx.currentTime += 0.5
      const made = sources()
      sounds.ui(kind)
      expect(sources(), kind).toBeGreaterThan(made)
    }
  })

  it("plays the same kind once within DEDUP, a poop's pick beside a food's, and patters foods landing together one after another", () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    sounds.play(bonk)
    const one = sources()
    sounds.play(bonk)
    expect(sources()).toBe(one)
    ctx.currentTime += DEDUP + 0.001
    sounds.play(bonk)
    expect(sources()).toBeGreaterThan(one)
    const food = sources()
    sounds.play(pick)
    const poop = sources()
    expect(poop).toBeGreaterThan(food)
    sounds.play({ ...pick, food: 'poop', n: 2 })
    expect(sources()).toBeGreaterThan(poop)
    ctx.currentTime += 1
    const from = ctx.nodes.length
    for (let i = 0; i < 10; i++) sounds.play({ kind: 'land', food: 'cheese', x: 0, y: 0 })
    const starts = [...new Set(ctx.nodes.slice(from).filter(isSource).map((s) => s.startAt))].sort((a, b) => a - b)
    expect(starts).toHaveLength(PATTER_MAX)
    starts.forEach((t, i) => expect(t).toBeCloseTo(ctx.currentTime + i * PATTER.land!, 6))
  })

  it('climbs a row of stars called all at once, each waiting its turn', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    ctx.currentTime = 5
    const chimes = [0, 1, 2].map(() => {
      const from = ctx.nodes.length
      sounds.ui('star')
      return ctx.nodes.slice(from).find(isOscillator)!
    })
    expect(chimes.map((o) => midiOf(o.frequency.events[0]!.value))).toEqual([84, 88, 91])
    chimes.forEach((o, i) => expect(o.startAt).toBeCloseTo(5 + i * PATTER.star!, 6))
  })

  it('starts the remembered tune on unlock, ignores the same tune again, crossfades every tune in from its first bar, and fades away to none', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.setTune('menu')
    sounds.unlock()
    expect(decks).toHaveBeenCalledTimes(1)
    const ctx = contexts[0]!
    run(1)
    let playing = decks.mock.results[0]!.value as Deck
    const before = faderOf(playing).length
    sounds.setTune('menu')
    expect(decks).toHaveBeenCalledTimes(1)
    expect(faderOf(playing)).toHaveLength(before)
    for (const tune of [...TUNES.filter((t) => t !== 'menu'), 'menu'] as const) {
      const now = ctx.currentTime
      const calls = decks.mock.calls.length
      sounds.setTune(tune)
      expect(decks, tune).toHaveBeenCalledTimes(calls + 1)
      expect(decks.mock.calls.at(-1)![0]).toBe(tune)
      const next = decks.mock.results.at(-1)!.value as Deck
      expect(faderOf(playing).at(-1), `${tune}: the old tune fades out`).toMatchObject({ kind: 'linear', value: 0 })
      expect(faderOf(playing).at(-1)!.time).toBeCloseTo(now + FADE, 6)
      expect(faderOf(next).at(-1), `${tune}: the new one fades in`).toMatchObject({ kind: 'linear', value: 1 })
      expect(faderOf(next).at(-1)!.time - faderOf(next)[0]!.time).toBeCloseTo(FADE, 6)
      expect(next.step, `${tune}: from its first bar`).toBeLessThanOrEqual(2)
      const from = ctx.nodes.length
      run(1)
      expect(next.step, tune).toBeGreaterThan(2)
      expect(ctx.nodes.slice(from).filter(isOscillator).some((o) => reaches(firstGain(o), fake(next.out))), `${tune}: notes into its fader`).toBe(true)
      playing = next
    }
    const now = ctx.currentTime
    const calls = decks.mock.calls.length
    sounds.setTune('none')
    expect(faderOf(playing).at(-1)).toMatchObject({ kind: 'linear', value: 0 })
    expect(faderOf(playing).at(-1)!.time).toBeCloseTo(now + FADE_OUT, 6)
    const steps = playing.step
    run(2)
    expect(playing.step).toBe(steps)
    expect(decks).toHaveBeenCalledTimes(calls)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('schedules a step only within the lookahead, and skips ahead after a sleep instead of bursting', () => {
    const times: number[] = []
    const step = Synth.prototype.step
    vi.spyOn(Synth.prototype, 'step').mockImplementation(function (this: Synth, deck: Deck) {
      times.push(deck.next)
      step.call(this, deck)
    })
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('farm')
    const ctx = contexts[0]!
    for (let i = 0; i < 50; i++) {
      run(0.1)
      for (const t of times) expect(t).toBeLessThan(ctx.currentTime + LOOKAHEAD + 1e-9)
    }
    const before = times.length
    expect(before).toBeGreaterThanOrEqual(Math.floor(5 / (60 / SCORES.farm.bpm)) * 2 - 2)
    ctx.currentTime += 30
    vi.advanceTimersByTime(100)
    const woke = times.slice(before)
    expect(woke.length).toBeGreaterThan(0)
    expect(woke.length).toBeLessThanOrEqual(3)
    for (const t of woke) expect(t).toBeGreaterThanOrEqual(ctx.currentTime)
  })

  it('stops the clock with the music off while the effects play on, and silences everything and stops the clock with the sound off; on again, the tune starts from the top', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const steps = vi.spyOn(Synth.prototype, 'step')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('pond')
    run(2)
    const synth = decks.mock.contexts[0] as Synth
    sounds.setMusic(false)
    expect(fake<FakeGain>(synth.music).gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0 })
    const off = steps.mock.calls.length
    run(2)
    expect(steps.mock.calls.length).toBe(off)
    const made = sources()
    sounds.play({ kind: 'frog', x: 0, y: 0 })
    expect(sources()).toBeGreaterThan(made)
    sounds.setMusic(true)
    run(1)
    expect(steps.mock.calls.length).toBeGreaterThan(off)
    expect(decks).toHaveBeenCalledTimes(2)
    sounds.setSound(false)
    expect(fake<FakeGain>(synth.master).gain.events.at(-1)).toMatchObject({ kind: 'target', value: 0 })
    const silent = steps.mock.calls.length
    const quiet = sources()
    sounds.play(bonk)
    sounds.ui('tap')
    sounds.ui('go')
    run(2)
    expect(sources()).toBe(quiet)
    expect(steps.mock.calls.length).toBe(silent)
    expect(vi.getTimerCount()).toBe(0)
    sounds.setSound(true)
    expect(fake<FakeGain>(synth.master).gain.events.at(-1)).toMatchObject({ kind: 'target', value: MASTER })
    run(1)
    expect(steps.mock.calls.length).toBeGreaterThan(silent)
    expect(decks).toHaveBeenCalledTimes(3)
  })

  it('stops the tune at once when the game sleeps (before the context has), and fades it gently to none when awake', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    const fadeOf = () => {
      const ev = faderOf(decks.mock.results.at(-1)!.value as Deck)
      return ev.at(-1)!.time - ev.at(-2)!.time
    }
    sounds.setTune('garden')
    run(2)
    sounds.suspend()
    expect(ctx.state).toBe('running')
    sounds.setTune('none')
    expect(fadeOf()).toBe(0)
    sounds.unlock()
    sounds.setTune('garden')
    run(2)
    sounds.setTune('none')
    expect(fadeOf()).toBeCloseTo(FADE_OUT, 6)
  })

  it('plays the party once through to its end, then stays quiet until the tune changes', () => {
    const steps = vi.spyOn(Synth.prototype, 'step')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('party')
    const all = SCORES.party.bars.length * 8
    run(tuneSeconds('party') + 3)
    expect(steps).toHaveBeenCalledTimes(all)
    expect(vi.getTimerCount(), 'the clock stopped').toBe(0)
    sounds.setTune('party')
    sounds.setMusic(false)
    sounds.setMusic(true)
    sounds.setSound(false)
    sounds.setSound(true)
    run(3)
    expect(steps).toHaveBeenCalledTimes(all)
    sounds.setTune('menu')
    run(1)
    expect(steps.mock.calls.length).toBeGreaterThan(all)
  })

  it('holds the tune back for the go jingle and the home chime, whichever comes first, then starts it from its first bar', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    sounds.setTune('menu')
    run(1)
    const ctx = contexts[0]!
    sounds.ui('go')
    const go = ctx.currentTime
    sounds.setTune('castle')
    expect(decks.mock.calls.at(-1)![0]).toBe('castle')
    expect(decks.mock.calls.at(-1)![1]).toBeCloseTo(go + GO_FOR, 6)
    const castle = decks.mock.results.at(-1)!.value as Deck
    run(0.7)
    expect(castle.step, 'quiet under the jingle').toBe(0)
    run(1)
    expect(castle.step).toBeGreaterThan(0)
    sounds.setTune('menu')
    sounds.ui('home')
    const home = ctx.currentTime
    expect(decks.mock.calls.at(-1)![0]).toBe('menu')
    expect(decks.mock.calls.at(-1)![1]).toBeCloseTo(home + HOME_FOR, 6)
    const menu = decks.mock.results.at(-1)!.value as Deck
    run(0.9)
    expect(menu.step, 'quiet under the chime').toBe(0)
    run(1)
    expect(menu.step).toBeGreaterThan(0)
  })

  it("cuts the gate's rising tone short at the next HUD sound, or when the game sleeps", () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    for (const end of ['tap', 'suspend'] as const) {
      const from = ctx.nodes.length
      sounds.ui('hold')
      const rising = ctx.nodes.slice(from).find(isOscillator)!
      const fader = firstGain(rising).outs[0] as FakeGain
      expect(fader.gain.events).toEqual([])
      ctx.currentTime += 1
      if (end === 'tap') sounds.ui('tap')
      else sounds.suspend()
      expect(fader.gain.events.at(-1), end).toMatchObject({ kind: 'linear', value: 0 })
      expect(fader.gain.events.at(-1)!.time).toBeLessThanOrEqual(ctx.currentTime + 0.05 + 1e-9)
      sounds.unlock()
    }
  })

  it('dips the music under the finish jingle and the full fanfare, then lets it back up', () => {
    const dips = vi.spyOn(Synth.prototype, 'dip')
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    for (const e of [{ kind: 'finish', x: 0, y: 0 }, { kind: 'full' }] as const) {
      ctx.currentTime += 3
      sounds.play(e)
      const synth = dips.mock.contexts.at(-1) as Synth
      const [at, dur] = dips.mock.calls.at(-1)!
      expect(at, e.kind).toBe(ctx.currentTime)
      const duck = fake<FakeGain>(synth.duck).gain.events.slice(-2)
      expect(duck, e.kind).toEqual([
        { kind: 'target', value: DUCK, time: at },
        { kind: 'target', value: 1, time: at + dur },
      ])
    }
    expect(dips).toHaveBeenCalledTimes(2)
  })
})
