/**
 * Checks the sounds without ears. The tunes: every bar is whole, the melodies stay on the
 * pentatonic in a singing range, the chords and the bass in C major, and no melody note
 * grinds a semitone above its chord on a beat. The voices: a fake audio context records
 * every node, connection and automation (and throws where a browser would, on a value that
 * is not finite), so every event, every item, every HUD sound and every step of every tune
 * and room loop is checked to start silent, end silent, stop, stay gentle, stay in the
 * hearing range and reach its bus. The lifecycle: Sounds on the fake context and fake
 * timers (nothing before unlock, the dedup, the horn's limit, the switches, the music
 * following the child, the hum following the truck).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ITEM_IDS, ITEM_SOUNDS, ITEMS, themeItems } from './items'
import { GOODS, MACHINES, MATERIALS, PARTS, THEMES, TOOLS, type EventKind, type SimEvent, type State, type Theme } from './model'
import { freshKeep } from './progress'
import { makeRoad, startRoad, TOP } from './road'
import { createState } from './rules'
import {
  CHORDS, DEDUP, EFFECTS, GOODNIGHT_FOR, HOLD_FOR, HORN_GAP, HUM_EVERY, MASTER, MUSIC, PARTY, PICKUP_NOTES, PICKUP_RUN, Sounds, Synth, THEME_FOR, TUNES, climb, penta,
  pieceFor, tuneSeconds, type Bar, type Deck, type Hum, type TuneName, type UiSound,
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
  start(time: number, offset = 0) {
    if (this.startAt >= 0) throw new Error('started twice')
    if (!(time >= 0) || !(offset >= 0) || !Number.isFinite(offset)) throw new RangeError(`start at ${time} from ${offset}`)
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

/** The gentlest ceiling every single voice keeps under: nothing loud, nothing that startles. */
const LOUDEST = 0.2

/**
 * Checks the voices among `nodes` that start at or after `at`: each source starts and stops;
 * a voice (heard through `bus`) starts and ends silent inside its source's time, never goes
 * over LOUDEST, and sounds from 20 Hz to 18 kHz; a modulator (it drives a param) only starts
 * and stops. Returns how long after `at` the last source stops, how many voices there were,
 * and a fingerprint of them (their waves and first pitches).
 */
function audit(nodes: readonly FakeNode[], bus: FakeNode, at: number) {
  // Plain checks rather than expect: a tune makes thousands of voices.
  const check = (ok: boolean, why: string) => {
    if (!ok) throw new Error(why)
  }
  let end = at
  let voices = 0
  const print: string[] = []
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
    check(Math.max(...ev.map((e) => e.value)) <= LOUDEST, `a voice louder than ${LOUDEST}: ${Math.max(...ev.map((e) => e.value))}`)
    // A short attack is fine on a quiet voice; a loud one must swell in over at least 2 ms so it never cracks.
    const peak = ev.findIndex((e) => e.value === Math.max(...ev.map((x) => x.value)))
    check(ev[peak]!.value < 0.08 || ev[peak]!.time - first.time >= 0.002 - 1e-9, `a loud voice that starts in under 2 ms`)
    if (n instanceof FakeOscillator) {
      for (const e of n.frequency.events) check(e.value >= 20 && e.value <= 18000, `a pitch of ${e.value} Hz`)
      print.push(`${n.type}:${Math.round(n.frequency.events[0]!.value)}`)
    } else {
      const filter = n.outs[0] as FakeFilter
      print.push(`noise:${filter.type}:${Math.round(filter.frequency.events[0]!.value)}`)
    }
  }
  return { end: end - at, voices, print: print.join(' ') }
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

/** Where a room's events happen: the sounds do not care, the particles do. */
const IN_ROOM = { plot: 0, room: 1 } as const
const AT_SLOT = { ...IN_ROOM, slot: 2 } as const

/** Every event kind, in every variant that sounds different: a mapped type, so a new kind fails to compile here until it is listed. */
const EVENTS: { [K in EventKind]: Extract<SimEvent, { kind: K }>[] } = {
  pickup: GOODS.map((good) => ({ kind: 'pickup', good, x: 0, y: 0 })),
  whack: TOOLS.map((tool) => ({ kind: 'whack', tool, x: 0, y: 0 })),
  crack: [
    { kind: 'crack', x: 0, y: 0, gem: false },
    { kind: 'crack', x: 0, y: 0, gem: true },
  ],
  stop: (['boulder', 'crosser', 'surprise'] as const).map((why) => ({ kind: 'stop', why })),
  honk: [{ kind: 'honk', x: 0, y: 0 }],
  answer: (['ducks', 'cats', 'hedgehogs', 'cows', 'train'] as const).map((who) => ({ kind: 'answer', who, x: 0, y: 0 })),
  ramp: [{ kind: 'ramp', x: 0, y: 0 }],
  land: [
    { kind: 'land', hard: false, x: 0, y: 0 },
    { kind: 'land', hard: true, x: 0, y: 0 },
  ],
  present: [{ kind: 'present' }],
  unlock: [
    { kind: 'unlock', what: 'theme:bath' },
    { kind: 'unlock', what: 'gems' },
  ],
  arrive: [{ kind: 'arrive' }],
  tip: [{ kind: 'tip' }],
  crate: MACHINES.map((m) => ({ kind: 'crate', m })),
  crateHit: MACHINES.map((m) => ({ kind: 'crateHit', m })),
  machineBuilt: MACHINES.map((m) => ({ kind: 'machineBuilt', m })),
  batch: MACHINES.map((m) => ({ kind: 'batch', m })),
  push: MACHINES.map((m) => ({ kind: 'push', m })),
  cough: MACHINES.map((m) => ({ kind: 'cough', m })),
  house: [{ kind: 'house', plot: 0 }],
  build: MATERIALS.map((material) => ({ kind: 'build', plot: 0, room: 1, material })),
  landed: [{ kind: 'landed', plot: 0, room: 1 }],
  lift: [{ kind: 'lift', plot: 0, room: 1 }],
  takeBack: [{ kind: 'takeBack', plot: 0, room: 1 }],
  wiggle: [{ kind: 'wiggle', ...IN_ROOM }],
  nope: GOODS.map((good) => ({ kind: 'nope', good })),
  theme: THEMES.map((theme) => ({ kind: 'theme', theme, ...IN_ROOM })),
  itemIn: [{ kind: 'itemIn', item: 'speaker', ...AT_SLOT }],
  itemOut: [{ kind: 'itemOut', item: 'speaker', ...AT_SLOT }],
  play: ITEM_IDS.map((item) => ({ kind: 'play', item, ...AT_SLOT })),
  paint: [{ kind: 'paint' }],
  roof: [{ kind: 'roof', plot: 0 }],
  doorbell: [{ kind: 'doorbell', plot: 0 }],
  visit: THEMES.map((theme) => ({ kind: 'visit', theme })),
  newPlot: [{ kind: 'newPlot', plot: 1 }],
  wear: PARTS.map((part) => ({ kind: 'wear', part })),
  dice: [{ kind: 'dice' }],
  zoom: [{ kind: 'zoom' }],
  goodnight: [{ kind: 'goodnight' }],
  lightsOut: [0, 1, 2, 3, 4, 5].map((plot) => ({ kind: 'lightsOut', plot })),
  sleep: [{ kind: 'sleep' }],
  wake: [{ kind: 'wake' }],
  tap: [{ kind: 'tap' }],
}
const ALL_EVENTS: SimEvent[] = Object.values(EVENTS).flat()
const UI_SOUNDS = Object.keys({ tap: 1, open: 1, close: 1, hold: 1, fresh: 1, pick: 1 } satisfies Record<UiSound, 1>) as UiSound[]
const TUNE_NAMES = Object.keys(TUNES) as TuneName[]

/** Every melody the game plays: the three tunes and the birthday room's song, with their meters. */
const MELODIES: { name: string; meter: number; bars: readonly Bar[] }[] = [...TUNE_NAMES.map((t) => ({ name: t, meter: TUNES[t].meter, bars: TUNES[t].bars })), { name: 'party', meter: 8, bars: PARTY }]
const PENTATONIC = [0, 2, 4, 7, 9]
const C_MAJOR = [0, 2, 4, 5, 7, 9, 11]

/** A state on the street, as a fresh game has it after the first visit. */
const street = () => createState(freshKeep(), 1, false)
/** A state in the room view of a room with `theme`. */
function inRoom(theme: Theme | null): State {
  const s = street()
  s.keep.plots[0] = { kind: 'tall', roof: 'pointed', rooms: [{ id: 1, shape: 'small', col: 0, row: 0, material: 'planks', theme, items: [], wall: 0, floor: 0 }] }
  s.shot = { kind: 'room', plot: 0, room: 1 }
  return s
}
/** A state on the road with the truck rolling at `v`. */
function onRoad(v: number): State {
  const s = street()
  s.road = startRoad(makeRoad('forest', 2, 7))
  s.road.v = v
  s.shot = { kind: 'road' }
  return s
}

// ---------------------------------------------------------------------------------------

describe('the tunes', () => {
  it('have whole bars: a slot per eighth of the meter, a length exactly where a note starts, and every note held only over silence', () => {
    for (const { name, meter, bars } of MELODIES) {
      const slots = bars.flatMap((b) => b.notes.map((n, i) => ({ n, len: b.lengths[i]! })))
      for (const [i, bar] of bars.entries()) {
        expect(bar.notes, `${name} bar ${i + 1}`).toHaveLength(meter)
        expect(bar.lengths, `${name} bar ${i + 1}`).toHaveLength(meter)
        bar.notes.forEach((n, s) => expect(n > 0, `${name} bar ${i + 1} slot ${s}`).toBe(bar.lengths[s]! > 0))
      }
      slots.forEach((slot, i) => {
        for (let k = 1; k < slot.len; k++) expect(slots[i + k]!.n, `${name}: a note held over another`).toBe(0)
      })
    }
  })

  it('are in key: the melodies on the C major pentatonic in a singing range, the chords and the bass in C major, no note a semitone above its chord on a beat', () => {
    for (const { name, meter, bars } of MELODIES) {
      const beats = meter === 6 ? [0, 3] : [0, 2, 4, 6]
      for (const [i, bar] of bars.entries()) {
        const where = `${name} bar ${i + 1}`
        const { root, third } = CHORDS[bar.chord]
        const chord = [root, root + third, root + 7]
        for (const t of chord) expect(C_MAJOR, `${where}: ${bar.chord}`).toContain(t % 12)
        bar.notes.forEach((n, s) => {
          if (n === 0) return
          expect(PENTATONIC, `${where} slot ${s}: ${n}`).toContain(n % 12)
          expect(n, where).toBeGreaterThanOrEqual(67)
          expect(n, where).toBeLessThanOrEqual(88)
          if (beats.includes(s)) for (const t of chord) expect((n - t + 120) % 12, `${where} slot ${s} grinds on ${bar.chord}`).not.toBe(1)
        })
      }
    }
    for (const name of TUNE_NAMES) {
      const score = TUNES[name]
      expect(score.bass).toHaveLength(score.meter)
      for (const bar of score.bars) for (const shift of score.bass) if (shift !== null) expect(C_MAJOR).toContain((CHORDS[bar.chord].root + shift) % 12)
    }
  })

  it('come home: the street tune and the lullaby end on C, and each tune is its own', () => {
    for (const name of ['street', 'lullaby'] as const) expect(TUNES[name].bars.flatMap((b) => b.notes).filter((n) => n > 0).pop()! % 12, name).toBe(0)
    const openings = TUNE_NAMES.map((t) => JSON.stringify(TUNES[t].bars.slice(0, 2).flatMap((b) => b.notes.filter((n) => n > 0))))
    expect(new Set(openings).size).toBe(TUNE_NAMES.length)
  })

  it('run long enough not to wear thin: the street over a minute, the road and the lullaby over half a minute', () => {
    expect(tuneSeconds('street')).toBeCloseTo((32 * 8 * 30) / 88, 6)
    expect(tuneSeconds('street')).toBeGreaterThan(60)
    expect(tuneSeconds('road')).toBeGreaterThan(30)
    expect(tuneSeconds('lullaby')).toBeGreaterThan(30)
    expect(TUNES.road.bpm).toBeGreaterThan(TUNES.street.bpm)
    expect(TUNES.lullaby.bpm).toBeLessThan(TUNES.street.bpm)
  })
})

describe('the voices', () => {
  it('wire the effects and the quieter music through the master and a compressor to the speakers', () => {
    const { ctx, synth } = rig()
    const squash = ctx.nodes.find((n) => n instanceof FakeCompressor)!
    expect(squash.outs).toEqual([ctx.destination])
    expect(squash.threshold.value).toBe(-18)
    expect(fake<FakeGain>(synth.master).outs).toEqual([squash])
    expect(fake<FakeGain>(synth.master).gain.value).toBe(MASTER)
    expect(fake<FakeGain>(synth.effects).outs).toEqual([fake(synth.master)])
    expect(fake<FakeGain>(synth.music).outs).toEqual([fake(synth.master)])
    expect(fake<FakeGain>(synth.effects).gain.value).toBe(EFFECTS)
    expect(fake<FakeGain>(synth.music).gain.value).toBe(MUSIC)
    expect(MUSIC).toBeLessThan(EFFECTS / 2)
    expect(fake<FakeGain>(synth.duck).outs).toEqual([fake(synth.music)])
  })

  it('give every event, in every variant, a gentle sound that starts and ends silent, stops and reaches the effects bus', () => {
    for (const e of ALL_EVENTS) {
      for (const tool of TOOLS) {
        if (tool !== 'hammer' && e.kind !== 'crateHit') continue
        const { synth, since } = rig()
        synth.event(e, tool, 1)
        const { end, voices } = since(synth.effects, 1)
        const what = JSON.stringify(e)
        expect(voices, what).toBeGreaterThan(0)
        expect(end, what).toBeLessThanOrEqual(3)
      }
    }
  })

  it('give every item sound its own short voice', () => {
    const prints = new Map<string, string>()
    for (const sound of ITEM_SOUNDS) {
      const { synth, since } = rig()
      synth.item(sound, 1)
      const { end, voices, print } = since(synth.effects, 1)
      expect(voices, sound).toBeGreaterThan(0)
      expect(end, sound).toBeLessThanOrEqual(2)
      expect(prints.get(print), `${sound} sounds like ${prints.get(print)}`).toBeUndefined()
      prints.set(print, sound)
    }
    expect(prints.size).toBe(ITEM_SOUNDS.length)
  })

  it('give every HUD sound the same, the gate tone inside its hold', () => {
    for (const sound of UI_SOUNDS) {
      const { synth, since } = rig()
      synth.ui(sound, 2)
      const { end, voices } = since(synth.effects, 2)
      expect(voices, sound).toBeGreaterThan(0)
      expect(end, sound).toBeLessThanOrEqual(sound === 'hold' ? HOLD_FOR + 0.03 : 1.3)
    }
  })

  it("say hello in the hero item's voice when a theme is picked", () => {
    for (const theme of THEMES) {
      const hero = rig()
      hero.synth.item(ITEMS[themeItems(theme)[2]!].sound, 0.35)
      const picked = rig()
      picked.synth.event({ kind: 'theme', theme, ...IN_ROOM }, 'hammer', 0)
      expect(picked.since(picked.synth.effects, 0).print, theme).toContain(hero.since(hero.synth.effects, 0.35).print)
    }
  })

  it('climb the pickup chime a step for each pickup within PICKUP_RUN, stay at the top, and start again after a pause', () => {
    expect(PICKUP_NOTES).toEqual([8, 9, 10, 11, 12, 13, 14, 15].map(penta))
    let rung = 0
    const rungs = []
    for (let i = 0; i < 10; i++) rungs.push((rung = climb(rung, i === 0 ? Infinity : 0.3)))
    expect(rungs).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 7, 7])
    expect(climb(4, PICKUP_RUN)).toBe(5)
    expect(climb(4, PICKUP_RUN + 0.01)).toBe(0)
    const { ctx, synth } = rig()
    const pitches: number[] = []
    for (const t of [0, 0.3, 0.6, 0.9, 2.5, 2.8]) {
      const from = ctx.nodes.length
      synth.event({ kind: 'pickup', good: 'log', x: 0, y: 0 }, 'hammer', t)
      // The lowest voice is the body, an octave under the chime.
      pitches.push(2 * Math.min(...ctx.nodes.slice(from).filter((n) => n instanceof FakeOscillator).map((o) => o.frequency.events[0]!.value)))
    }
    expect(pitches.map((f) => Math.round(69 + 12 * Math.log2(f / 440)))).toEqual([79, 81, 84, 86, 79, 81])
  })

  it('play every step of every tune and every room loop clean into the music bus, on a steady beat', () => {
    for (const piece of [...TUNE_NAMES, ...THEMES]) {
      const { synth, since } = rig()
      const deck = synth.deck(piece, 0, 0.5, 0.05)
      for (let i = 0; i < deck.steps; i++) synth.step(deck)
      expect(deck.next, piece).toBeCloseTo(0.5 + deck.steps * deck.eighth, 6)
      synth.retire(deck, deck.next, 0.3)
      const { voices } = since(synth.music, 0.5)
      expect(voices, piece).toBeGreaterThan(deck.steps / 8)
    }
  })

  it('hum the engine higher and louder the faster the truck, a purr even at full speed, and fade it out when the trip ends', () => {
    const { ctx, synth, since } = rig()
    const hum: Hum = synth.hum(0)
    const level = fake<FakeGain>(hum.level).gain
    const pitch = fake<FakeOscillator>(hum.body).frequency
    const s = onRoad(0)
    const targets: [number, number][] = []
    for (const v of [0, TOP / 2, TOP, TOP * 3]) {
      s.road!.v = v
      synth.humTo(hum, s.road!, 1)
      targets.push([pitch.events.at(-1)!.value, level.events.at(-1)!.value])
    }
    expect(targets[1]![0]).toBeGreaterThan(targets[0]![0])
    expect(targets[2]![0]).toBeGreaterThan(targets[1]![0])
    expect(targets[2]![1]).toBeGreaterThan(targets[0]![1])
    expect(targets[3]).toEqual(targets[2])
    expect(Math.max(...targets.map(([, l]) => l))).toBeLessThanOrEqual(0.08)
    s.road!.airborne = true
    synth.humTo(hum, s.road!, 1.1)
    expect(pitch.events.at(-1)!.value).toBeGreaterThan(targets[2]![0])
    synth.humEnd(hum, 2)
    expect(level.events.at(-1)).toMatchObject({ kind: 'target', value: 0, time: 2 })
    since(synth.effects, 0)
    expect(ctx.nodes.filter((n): n is FakeSource => n instanceof FakeSource).every((n) => n.stopAt > 2 && n.stopAt <= 2.6 + 1e-9)).toBe(true)
  })
})

describe('the music for where the child is', () => {
  it('is the street tune on the street and in an empty room, the road tune on the road, the room loop in a themed room, the lullaby at night until the street sleeps', () => {
    expect(pieceFor(street())).toBe('street')
    const mirror = street()
    mirror.shot = { kind: 'mirror' }
    expect(pieceFor(mirror)).toBe('street')
    expect(pieceFor(onRoad(3))).toBe('road')
    expect(pieceFor(inRoom(null))).toBe('street')
    for (const theme of THEMES) expect(pieceFor(inRoom(theme))).toBe(theme)
    const night = inRoom('disco')
    night.night = { at: 0, dark: [-1], doneAt: -1 }
    expect(pieceFor(night)).toBe('lullaby')
    night.night.doneAt = 100
    expect(pieceFor(night)).toBe('none')
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

  /** Moves the context's clock and the timers on together, in the clock's own 100 ms ticks, one frame per tick. */
  function run(sounds: Sounds, s: State, seconds: number) {
    const ctx = contexts[0]!
    for (let t = 0; t < seconds - 1e-9; t += 0.1) {
      ctx.currentTime += 0.1
      vi.advanceTimersByTime(100)
      sounds.frame(s, [], 0.1)
    }
  }
  const sources = () => contexts[0]!.nodes.filter((n) => n instanceof FakeSource).length

  it('makes no sound and no context before the first unlock, then one context that starts the music for where the child is', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    const s = onRoad(4)
    sounds.frame(s, ALL_EVENTS, 1 / 60)
    sounds.ui('tap')
    sounds.setSound(false)
    sounds.setSound(true)
    sounds.setMusic(false)
    sounds.setMusic(true)
    sounds.suspend()
    sounds.resume()
    expect(contexts).toHaveLength(0)
    sounds.unlock()
    sounds.unlock()
    expect(contexts).toHaveLength(1)
    expect(decks).toHaveBeenCalledTimes(1)
    expect(decks.mock.calls[0]![0]).toBe('road')
  })

  it('sleeps when suspended, stays asleep through gestures, and wakes on resume', async () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    expect(ctx.resumes).toBe(0)
    sounds.suspend()
    await Promise.resolve()
    expect(ctx.state).toBe('suspended')
    sounds.unlock()
    expect(ctx.state).toBe('suspended')
    sounds.resume()
    expect(ctx.state).toBe('running')
    ctx.state = 'suspended'
    sounds.unlock()
    expect(ctx.state).toBe('running')
  })

  it('plays the same sound once within DEDUP and again after, two different items together, a HUD tap and a sim tap as one click', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const s = street()
    const ctx = contexts[0]!
    // The street tune starts first, so what is counted below is only the effects.
    sounds.frame(s, [], 1 / 60)
    const made = () => {
      const n = sources()
      return () => sources() - n
    }
    let count = made()
    sounds.frame(s, [{ kind: 'paint' }, { kind: 'paint' }], 1 / 60)
    const one = count()
    expect(one).toBeGreaterThan(0)
    count = made()
    sounds.frame(s, [{ kind: 'paint' }], 1 / 60)
    expect(count()).toBe(0)
    ctx.currentTime += DEDUP + 0.001
    count = made()
    sounds.frame(s, [{ kind: 'paint' }], 1 / 60)
    expect(count()).toBe(one)
    const event = vi.spyOn(Synth.prototype, 'event')
    ctx.currentTime += 1
    sounds.frame(s, (['speaker', 'guitar', 'drumKit', 'piano', 'noteLights'] as const).map((item) => ({ kind: 'play', item, ...AT_SLOT })), 1 / 60)
    // The piano and the note lights share the 'note' voice: one note, not two.
    expect(event.mock.calls.map(([e]) => (e.kind === 'play' ? e.item : e.kind))).toEqual(['speaker', 'guitar', 'drumKit', 'piano'])
    ctx.currentTime += 1
    const ui = vi.spyOn(Synth.prototype, 'ui')
    sounds.ui('tap')
    sounds.frame(s, [{ kind: 'tap' }], 1 / 60)
    expect(ui).toHaveBeenCalledTimes(1)
    expect(event).toHaveBeenCalledTimes(4)
  })

  it('plays the rooms that wiggle together as one wiggle, not a chord of them', () => {
    const event = vi.spyOn(Synth.prototype, 'event')
    const sounds = new Sounds()
    sounds.unlock()
    const s = street()
    const ctx = contexts[0]!
    sounds.frame(s, [], 1 / 60)
    const before = sources()
    sounds.frame(s, [1, 2, 3].map((room) => ({ kind: 'wiggle', plot: 0, room }) as const), 1 / 60)
    expect(event.mock.calls.map(([e]) => e.kind)).toEqual(['wiggle'])
    const once = sources() - before
    expect(once).toBeGreaterThan(0)
    ctx.currentTime += 1
    sounds.frame(s, [{ kind: 'wiggle', plot: 0, room: 2 }], 1 / 60)
    expect(sources() - before).toBe(2 * once)
  })

  it('sounds the horn at most twice a second however fast it is pressed, and lets the crossers answer', () => {
    const event = vi.spyOn(Synth.prototype, 'event')
    const sounds = new Sounds()
    sounds.unlock()
    const s = onRoad(0)
    const ctx = contexts[0]!
    for (let i = 0; i < 20; i++) {
      ctx.currentTime = i / 10
      sounds.frame(s, [{ kind: 'honk', x: 0, y: 0 }, { kind: 'answer', who: 'ducks', x: 0, y: 0 }], 0.1)
    }
    const honks = event.mock.calls.filter(([e]) => e.kind === 'honk')
    expect(honks).toHaveLength(4)
    expect(1 / HORN_GAP).toBe(2)
    expect(event.mock.calls.filter(([e]) => e.kind === 'answer')).toHaveLength(20)
  })

  it('mutes the master with the sound switch and the music bus with the music switch, stopping the clock with either, from before the unlock too', () => {
    const steps = vi.spyOn(Synth.prototype, 'step')
    const sounds = new Sounds()
    sounds.setMusic(false)
    sounds.unlock()
    const ctx = contexts[0]!
    const s = street()
    const synth = () => steps.mock.contexts[0] as Synth | undefined
    run(sounds, s, 1)
    expect(steps).not.toHaveBeenCalled()
    sounds.setMusic(true)
    run(sounds, s, 1)
    const bus = (node: AudioNode) => fake<FakeGain>(node).gain
    expect(bus(synth()!.music).events.at(-1)).toMatchObject({ kind: 'target', value: MUSIC })
    sounds.setMusic(false)
    expect(bus(synth()!.music).events.at(-1)).toMatchObject({ kind: 'target', value: 0 })
    const off = steps.mock.calls.length
    run(sounds, s, 2)
    expect(steps.mock.calls.length).toBe(off)
    // The music off leaves the effects on.
    const before = sources()
    sounds.frame(s, [{ kind: 'doorbell', plot: 0 }], 1 / 60)
    expect(sources()).toBeGreaterThan(before)
    sounds.setMusic(true)
    run(sounds, s, 1)
    expect(steps.mock.calls.length).toBeGreaterThan(off)
    sounds.setSound(false)
    expect(bus(synth()!.master).events.at(-1)).toMatchObject({ kind: 'target', value: 0 })
    const silent = steps.mock.calls.length
    const made = sources()
    ctx.currentTime += 1
    sounds.frame(onRoad(5), [{ kind: 'doorbell', plot: 0 }, { kind: 'honk', x: 0, y: 0 }], 1 / 60)
    sounds.ui('open')
    run(sounds, s, 2)
    expect(sources()).toBe(made)
    expect(steps.mock.calls.length).toBe(silent)
    sounds.setSound(true)
    expect(bus(synth()!.master).events.at(-1)).toMatchObject({ kind: 'target', value: MASTER })
    run(sounds, s, 1)
    expect(steps.mock.calls.length).toBeGreaterThan(silent)
    // Off before the first touch: the master starts silent.
    const later = new Sounds()
    later.setSound(false)
    later.unlock()
    expect(contexts).toHaveLength(2)
    expect(contexts[1]!.nodes.some((n) => n instanceof FakeGain && n.gain.value === MASTER)).toBe(false)
  })

  it('crossfades the music as the child moves, holds a room loop back for its theme sting, and the lullaby for evening falling', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    const s = street()
    run(sounds, s, 1)
    expect(decks.mock.calls.map((c) => c[0])).toEqual(['street'])
    run(sounds, inRoom(null), 1)
    expect(decks).toHaveBeenCalledTimes(1)
    const now = ctx.currentTime
    sounds.frame(inRoom('sauna'), [{ kind: 'theme', theme: 'sauna', ...IN_ROOM }], 1 / 60)
    expect(decks.mock.calls.at(-1)![0]).toBe('sauna')
    expect(decks.mock.calls.at(-1)![2]).toBeCloseTo(now + THEME_FOR, 6)
    const street1 = decks.mock.results[0]!.value as Deck
    expect(fake<FakeGain>(street1.out).gain.events.at(-1)).toMatchObject({ kind: 'linear', value: 0 })
    run(sounds, inRoom('sauna'), 3)
    run(sounds, onRoad(3), 1)
    expect(decks.mock.calls.at(-1)![0]).toBe('road')
    const night = street()
    night.night = { at: 0, dark: [-1], doneAt: -1 }
    const dusk = ctx.currentTime
    sounds.frame(night, [{ kind: 'goodnight' }], 1 / 60)
    expect(decks.mock.calls.at(-1)![0]).toBe('lullaby')
    expect(decks.mock.calls.at(-1)![2]).toBeCloseTo(dusk + GOODNIGHT_FOR, 6)
    run(sounds, night, 3)
    night.night.doneAt = 100
    const calls = decks.mock.calls.length
    const lullaby = decks.mock.results.at(-1)!.value as Deck
    sounds.frame(night, [{ kind: 'sleep' }], 1 / 60)
    expect(decks).toHaveBeenCalledTimes(calls)
    const fade = fake<FakeGain>(lullaby.out).gain.events
    expect(fade.at(-1)!.time - fade.at(-2)!.time).toBeCloseTo(3, 6)
  })

  it('picks the street tune up from the phrase it left, not from the top', () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const sounds = new Sounds()
    sounds.unlock()
    run(sounds, street(), 30)
    run(sounds, inRoom('cat'), 2)
    run(sounds, street(), 1)
    // Where the first street deck stood when it was retired.
    const at = (decks.mock.results[0]!.value as Deck).step
    expect(decks.mock.calls.map((c) => c[0])).toEqual(['street', 'cat', 'street'])
    const from = decks.mock.calls[2]![1]
    expect(from % 32).toBe(0)
    expect(from).toBeGreaterThan(0)
    expect(from).toBeLessThanOrEqual(at)
    expect(at - from).toBeLessThanOrEqual(32 + 8)
  })

  it('schedules a step only within the lookahead, and skips ahead after a sleep instead of bursting', () => {
    const step = Synth.prototype.step
    const times: number[] = []
    const ctx = () => contexts[0]!
    vi.spyOn(Synth.prototype, 'step').mockImplementation(function (this: Synth, deck: Deck) {
      expect(deck.next).toBeLessThan(ctx().currentTime + 0.25 + 1e-9)
      times.push(deck.next)
      step.call(this, deck)
    })
    const sounds = new Sounds()
    sounds.unlock()
    run(sounds, street(), 10)
    const before = times.length
    expect(before).toBeGreaterThanOrEqual(Math.floor(9.5 / (30 / TUNES.street.bpm)))
    ctx().currentTime += 30
    vi.advanceTimersByTime(100)
    const woke = times.slice(before)
    expect(woke.length).toBeLessThanOrEqual(2)
    for (const at of woke) expect(at).toBeGreaterThanOrEqual(ctx().currentTime)
  })

  it('hums the engine only while a trip is on and the sound is on, following the truck every HUM_EVERY', () => {
    const hum = vi.spyOn(Synth.prototype, 'hum')
    const humTo = vi.spyOn(Synth.prototype, 'humTo')
    const humEnd = vi.spyOn(Synth.prototype, 'humEnd')
    const sounds = new Sounds()
    sounds.unlock()
    const road = onRoad(2)
    for (let i = 0; i < 60; i++) sounds.frame(road, [], 1 / 60)
    expect(hum).toHaveBeenCalledTimes(1)
    // Every HUM_EVERY of real time, give or take a frame.
    expect(humTo.mock.calls.length).toBeGreaterThanOrEqual(Math.floor(1 / (HUM_EVERY + 1 / 60)))
    expect(humTo.mock.calls.length).toBeLessThanOrEqual(Math.ceil(1 / HUM_EVERY) + 1)
    sounds.frame(street(), [], 1 / 60)
    expect(humEnd).toHaveBeenCalledTimes(1)
    sounds.frame(road, [], 1 / 60)
    expect(hum).toHaveBeenCalledTimes(2)
    sounds.setSound(false)
    sounds.frame(road, [], 1 / 60)
    expect(humEnd).toHaveBeenCalledTimes(2)
    sounds.frame(road, [], 1 / 60)
    expect(hum).toHaveBeenCalledTimes(2)
  })

  it('holds the music, a room loop and the hum while paused, the context running on for the menu, and brings them back after', async () => {
    const decks = vi.spyOn(Synth.prototype, 'deck')
    const retire = vi.spyOn(Synth.prototype, 'retire')
    const hum = vi.spyOn(Synth.prototype, 'hum')
    const humEnd = vi.spyOn(Synth.prototype, 'humEnd')
    const holdTone = vi.spyOn(Synth.prototype, 'ui')
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    const road = onRoad(2)
    run(sounds, road, 0.5)
    expect(decks.mock.calls.map((c) => c[0])).toEqual(['road'])
    expect(hum).toHaveBeenCalledTimes(1)
    sounds.setPaused(true)
    expect(retire).toHaveBeenCalledTimes(1)
    expect(humEnd).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(ctx.state).toBe('running')
    // The menu's switches start nothing, and its sounds play at once.
    sounds.setMusic(false)
    sounds.setMusic(true)
    sounds.ui('hold')
    expect(holdTone).toHaveBeenLastCalledWith('hold', ctx.currentTime)
    expect(decks).toHaveBeenCalledTimes(1)
    sounds.setPaused(false)
    expect(decks.mock.calls.map((c) => c[0])).toEqual(['road', 'road'])
    run(sounds, road, 0.2)
    expect(hum).toHaveBeenCalledTimes(2)
    // In a room it is the room's loop that stops.
    run(sounds, inRoom('disco'), 0.2)
    expect(decks.mock.calls.at(-1)![0]).toBe('disco')
    const before = retire.mock.calls.length
    sounds.setPaused(true)
    expect(retire.mock.calls.length).toBe(before + 1)
    expect(retire.mock.calls.at(-1)![0].piece).toBe('disco')
  })

  it("cuts the gate's rising tone short at the next HUD sound, or when the page sleeps", () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    for (const end of ['tap', 'suspend'] as const) {
      const from = ctx.nodes.length
      sounds.ui('hold')
      const rising = ctx.nodes.slice(from).find((n): n is FakeOscillator => n instanceof FakeOscillator && Math.round(n.frequency.events[0]!.value) === 262)!
      const fader = firstGain(rising).outs[0] as FakeGain
      expect(fader.gain.events).toEqual([])
      ctx.currentTime += 1
      if (end === 'tap') sounds.ui('tap')
      else sounds.suspend()
      expect(fader.gain.events.at(-1)).toMatchObject({ kind: 'linear', value: 0 })
      expect(fader.gain.events.at(-1)!.time).toBeLessThanOrEqual(ctx.currentTime + 0.05 + 1e-9)
      sounds.resume()
    }
  })
})
