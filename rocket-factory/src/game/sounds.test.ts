/**
 * Checks the sounds without ears. A fake audio context records every node, connection and
 * automation (and throws where a browser would, on a value that is not finite), so every
 * event's voice in every variant, every HUD sound, every instrument's note (as itself, as a
 * kazoo and as a soft hit) and every eighth of every piece is checked to start silent, end
 * silent, stop, stay gentle, stay in the hearing range and reach its bus, and the good sounds
 * to be the loudest. The lifecycle: Sounds on the fake context with a fake speech (nothing
 * before unlock, the dedup, machine sounds on the next eighth, the switches, the pause, the
 * page sleeping, the band on the sim's beat and re-anchoring, Beep's voice).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EIGHTH, INSTRUMENTS, NIGHT_LEAD, PIECES, REJOIN, SOFT, SONG, notesAt, type Band, type Instrument, type Note, type Piece } from './band'
import { PART_INFO, PLACEABLE, STICKER_WORD, card } from './catalog'
import { BOTTLES, CARDS, HOP, HZ, KINDS, PARTS, STEP, THINGS, newBuilding, thingIndex, type EventKind, type Kind, type Placeable, type SimEvent, type State } from './model'
import { blankState } from './rules'
import { BEEP_VOICE, DEDUP, DRIFT, EFFECTS, HOLD_FOR, LAY_GAP, LOOKAHEAD, MASTER, MUSIC, PER_EIGHTH, SPRINKLE, Sounds, Synth, VISIT_SPRINKLE, WORD_GAP, type UiSound } from './sounds'

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

/** The gentlest ceiling every single voice keeps under: a fifth of full scale, nothing that startles. */
const LOUDEST = 0.2

/**
 * Checks the voices among `nodes` that start at or after `at`: each source starts and stops;
 * a voice (heard through `bus`) starts and ends silent inside its source's time, never goes
 * over LOUDEST, and sounds from 20 Hz to 18 kHz; a modulator (it drives a param) only starts
 * and stops. Returns how long after `at` the last source stops, how many voices there were
 * and the loudest of them.
 */
function audit(nodes: readonly FakeNode[], bus: FakeNode, at: number) {
  // Plain checks rather than expect: a piece makes thousands of voices.
  const check = (ok: boolean, why: string) => {
    if (!ok) throw new Error(why)
  }
  let end = at
  let voices = 0
  let peak = 0
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
    const top = Math.max(...ev.map((e) => e.value))
    check(top <= LOUDEST, `a voice louder than ${LOUDEST}: ${top}`)
    peak = Math.max(peak, top)
    // A short attack is fine on a quiet voice; a loud one must swell in over at least 2 ms so it never cracks.
    const rise = ev.findIndex((e) => e.value === top)
    check(top < 0.08 || ev[rise]!.time - first.time >= 0.002 - 1e-9, 'a loud voice that starts in under 2 ms')
    if (n instanceof FakeOscillator) for (const e of n.frequency.events) check(e.value >= 20 && e.value <= 18000, `a pitch of ${e.value} Hz`)
  }
  return { end: end - at, voices, peak }
}

// ---------------------------------------------------------------------------------------
// What she hears through a tablet's speaker, worked out from the graph instead of rendered.

/** The power a tablet's speaker and the ear keep of a unit sine at f Hz: the speaker passes little under 300 Hz (a second-order high-pass), and the ear weights the rest (A-weighting). */
function heard(f: number): number {
  const f2 = f * f
  const a = ((12194 ** 2 * f2 * f2) / ((f2 + 20.6 ** 2) * Math.sqrt((f2 + 107.7 ** 2) * (f2 + 737.9 ** 2)) * (f2 + 12194 ** 2))) * 10 ** (2 / 20)
  return (a * a) / (1 + (300 / f) ** 4)
}

/** A filter's power gain at f Hz, as the Web Audio spec builds its biquads (a low- or high-pass's Q in dB, a band-pass's plain). */
function passes(filter: FakeFilter, f0: number, f: number, rate: number): number {
  const w0 = (2 * Math.PI * f0) / rate
  const cos = Math.cos(w0)
  const q = filter.Q.value
  const alpha = filter.type === 'bandpass' ? Math.sin(w0) / (2 * q) : Math.sin(w0) / (2 * 10 ** (q / 20))
  const b = filter.type === 'lowpass' ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : filter.type === 'highpass' ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2] : [alpha, 0, -alpha]
  const a = [1 + alpha, -2 * cos, 1 - alpha]
  const w = (2 * Math.PI * f) / rate
  const power = (c: number[]) => (c[0]! + c[1]! * Math.cos(w) + c[2]! * Math.cos(2 * w)) ** 2 + (c[1]! * Math.sin(w) + c[2]! * Math.sin(2 * w)) ** 2
  return power(b) / power(a)
}

/** A band-limited square's or sawtooth's overshoot at its jumps (Gibbs): the browser scales the wave down by it, so its peak is 1. */
const GIBBS = 1.18

/** A wave's partials under 20 kHz, each [Hz, amplitude] for a wave whose peak is 1. */
function partials(type: string, f: number): [number, number][] {
  const out: [number, number][] = []
  for (let n = 1; n * f < 20000; n++) {
    const a = type === 'sine' ? (n === 1 ? 1 : 0) : type === 'square' ? (n % 2 === 1 ? 4 / (Math.PI * n * GIBBS) : 0) : type === 'sawtooth' ? 2 / (Math.PI * n * GIBBS) : n % 2 === 1 ? 8 / (Math.PI * Math.PI * n * n) : 0
    if (a > 0) out.push([n * f, a])
  }
  return out
}

/** An automated param's value at time t as a browser plays it: held from each set, gliding to each ramp's value by its time, exponentially or in a line. */
function valueAt(p: FakeParam, t: number): number {
  const ev = p.events.filter((e) => e.kind !== 'cancel')
  if (ev.length === 0) return p.value
  let prev = { time: -Infinity, value: ev[0]!.value }
  for (const e of ev) {
    if (e.time <= t) {
      prev = { time: e.time, value: e.value }
      continue
    }
    const u = (t - prev.time) / (e.time - prev.time)
    if (e.kind === 'exp' && prev.time > -Infinity) return prev.value * (e.value / prev.value) ** u
    if (e.kind === 'linear' && prev.time > -Infinity) return prev.value + (e.value - prev.value) * u
    return prev.value
  }
  return prev.value
}

/**
 * How loud the voices among `nodes` are to her over `secs` from `at`, in dB (a mean power, the
 * master's compressor left out: it only lifts sounds this quiet all alike): each voice's
 * waveform (or white noise) through the filters on its way to `master`, at its pitch and its
 * filters' settings moment by moment, times its envelope and every gain after it (the buses and
 * the master), through a tablet's speaker and the ear (`heard`). It keeps the order the same
 * sounds rendered offline in a browser through the same speaker model show, without a browser.
 */
function loudness(nodes: readonly FakeNode[], master: FakeNode, at: number, secs: number, rate: number): number {
  const dt = 0.002
  let total = 0
  for (const source of nodes) {
    if (!(source instanceof FakeSource)) continue
    const filters: FakeFilter[] = []
    let env: FakeGain | null = null
    let gain = 1
    let n: FakeNode = source
    for (;;) {
      const next = n.outs.find((o): o is FakeNode => o instanceof FakeNode)
      if (next === undefined) break
      n = next
      if (n instanceof FakeFilter) filters.push(n)
      else if (n instanceof FakeGain) {
        if (env === null) env = n
        else gain *= n.gain.value
      }
      if (n === master) break
    }
    // A modulator drives a param and reaches no bus.
    if (env === null || n !== master) continue
    const spectra = new Map<string, number>()
    const spectrum = (t: number) => {
      const cut = filters.map((x) => valueAt(x.frequency, t))
      const through = (f: number) => filters.reduce((k, x, i) => k * passes(x, cut[i]!, f, rate), heard(f))
      const pitch = source instanceof FakeOscillator ? valueAt(source.frequency, t) : 0
      const key = `${pitch.toFixed(1)}|${cut.map((c) => c.toFixed(0)).join(',')}`
      let s = spectra.get(key)
      if (s !== undefined) return s
      s = 0
      if (source instanceof FakeOscillator) for (const [f, a] of partials(source.type, pitch)) s += ((a * a) / 2) * through(f)
      else
        for (let i = 0; i < 200; i++) {
          // White noise from -1 to 1: a power of 1/3, spread flat to half the sample rate.
          const f0 = 20 * 1000 ** (i / 200)
          const f1 = 20 * 1000 ** ((i + 1) / 200)
          s += (1 / 3) * (2 / rate) * through(Math.sqrt(f0 * f1)) * (f1 - f0)
        }
      spectra.set(key, s)
      return s
    }
    for (let t = Math.max(at, source.startAt); t < Math.min(at + secs, source.stopAt); t += dt) total += valueAt(env.gain, t) ** 2 * spectrum(t) * gain * gain * dt
  }
  return 10 * Math.log10(total / secs)
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
    /** How loud what was made since the last call is to her over `secs` from `at`, in dB (loudness). */
    heard(at: number, secs: number) {
      const made = ctx.nodes.slice(from)
      from = ctx.nodes.length
      return loudness(made, fake<FakeNode>(synth.master), at, secs, ctx.sampleRate)
    },
  }
}

/** A board with one building of every kind (the pad is 0 and the start oven 1) and a rocket part way full, for the events that look something up. */
const BOARD: State = (() => {
  const s = blankState(1)
  for (const kind of ['digger', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pump', 'tower', 'bowl'] as const) s.buildings.push(newBuilding(s.nextId++, kind, 0, 0, 0))
  s.rocket.got = [12, 3, 0, 40]
  return s
})()
const idOf = (kind: Kind) => BOARD.buildings.find((b) => b.kind === kind)!.id
const cells = (n: number) => [...Array(n).keys()].map((i) => 41 + i)
const AT = { x: 3.5, y: 4.5 } as const

/** Every event kind but Beep's words, in every variant that sounds different: a mapped type, so a new kind fails to compile here until it is listed. */
const EVENTS: { [K in Exclude<EventKind, 'say'>]: Extract<SimEvent, { kind: K }>[] } = {
  play: [{ kind: 'play' }],
  dig: (['blueRock', 'goldRock', 'bubble'] as const).map((thing) => ({ kind: 'dig', cell: 45, thing })),
  full: [{ kind: 'full', cell: 45, id: 1 }],
  lay: [1, 8, 40].map((n) => ({ kind: 'lay', cells: cells(n) })),
  repoint: [1, 20].map((n) => ({ kind: 'repoint', cells: cells(n) })),
  bridge: [{ kind: 'bridge', cell: 45 }],
  join: [{ kind: 'join', cell: 45 }],
  fork: [{ kind: 'fork', cell: 45 }],
  rollUp: [1, 40].map((n) => ({ kind: 'rollUp', cells: cells(n) })),
  hedgeIn: [1, 14].map((n) => ({ kind: 'hedgeIn', cells: cells(n) })),
  place: PLACEABLE.map((sticker) => ({ kind: 'place', id: 1, sticker })),
  peel: PLACEABLE.map((sticker) => ({ kind: 'peel', id: 1, sticker })),
  lift: [{ kind: 'lift', ...AT }],
  nope: [{ kind: 'nope', ...AT }],
  oops: [{ kind: 'oops' }],
  pattern: [0, 1, 4, 9].map((pattern) => ({ kind: 'pattern', pattern })),
  batch: (['digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'pump', 'lab'] as const).map((kind) => ({ kind: 'batch', id: idOf(kind) })),
  push: THINGS.map((thing) => ({ kind: 'push', id: 1, thing })),
  gulp: THINGS.map((thing) => ({ kind: 'gulp', id: 1, thing })),
  drink: BOTTLES.map((bottle) => ({ kind: 'drink', bottle })),
  fill: PARTS.map((part) => ({ kind: 'fill', part, thing: PART_INFO[part].thing })),
  partFull: PARTS.map((part) => ({ kind: 'partFull', part })),
  card: CARDS.map((id) => ({ kind: 'card', id })),
  cardClosed: [{ kind: 'cardClosed', id: 'gold' }],
  flap: [2, 3].map((land) => ({ kind: 'flap', land: land as 2 | 3 })),
  carry: [{ kind: 'carry', thing: 'gear', ...AT }],
  warn: [0, 1, 2].map((burrow) => ({ kind: 'warn', burrow })),
  hopOut: [{ kind: 'hopOut', id: 1, burrow: 0 }],
  nom: [{ kind: 'nom', id: 1, thing: 'greenBottle', ...AT }],
  napStart: [{ kind: 'napStart', id: 1, building: 1 }],
  napEnd: [{ kind: 'napEnd', id: 1, building: 1 }],
  burp: [{ kind: 'burp', id: 1, ...AT }],
  home: (['full', 'nothing', 'tickled', 'sudsed', 'fed', 'late', 'night'] as const).map((why) => ({ kind: 'home', id: 1, why })),
  heap: (['gear', 'blueRock'] as const).map((thing) => ({ kind: 'heap', burrow: 0, thing })),
  caught: [{ kind: 'caught', id: 1 }],
  giggle: [{ kind: 'giggle', id: 1, ...AT }],
  sneeze: [{ kind: 'sneeze', id: 1, ...AT }],
  shot: [{ kind: 'shot', tower: idOf('tower'), muncher: 1 }],
  suds: [{ kind: 'suds', id: 1, ...AT }],
  picnic: [{ kind: 'picnic', id: 1, burrow: 0 }],
  shrug: [{ kind: 'shrug', id: 1 }],
  friend: [{ kind: 'friend', burrow: 0 }],
  nibble: [{ kind: 'nibble', cell: 45 }],
  crunch: [{ kind: 'crunch', cell: 45 }],
  regrow: [{ kind: 'regrow', cell: 45 }],
  visitOver: [{ kind: 'visitOver', burrow: 0 }],
  launch: [{ kind: 'launch' }],
  count: [5, 4, 3, 2, 1].map((n) => ({ kind: 'count', n })),
  liftoff: [{ kind: 'liftoff' }],
  landed: [{ kind: 'landed' }],
  poke: (['tree', 'flowers', 'ground', 'belt', 'burrow', 'beep', 'moony', 'grey'] as const).map((what) => ({ kind: 'poke', what, ...AT })),
  recipe: [{ kind: 'recipe', id: 1 }],
  tickleBusy: [{ kind: 'tickleBusy', id: 1 }],
  goodnight: [{ kind: 'goodnight' }],
  tuck: KINDS.map((machine) => ({ kind: 'tuck', machine })),
  sleep: [{ kind: 'sleep' }],
  wake: [{ kind: 'wake' }],
  session: [{ kind: 'session' }],
  tool: [{ kind: 'tool' }],
}
const ALL_EVENTS: SimEvent[] = Object.values(EVENTS).flat()
const UI_SOUNDS = Object.keys({ tap: 1, open: 1, close: 1, hold: 1, fresh: 1, pick: 1, murmur: 1 } satisfies Record<UiSound, 1>) as UiSound[]
/** The good sounds, which are the loudest, and the munchers' havoc, which stays small. */
const GOOD: EventKind[] = ['play', 'card', 'partFull', 'flap', 'friend', 'picnic', 'landed']
const HAVOC: EventKind[] = ['warn', 'hopOut', 'nom', 'napStart', 'napEnd', 'burp', 'heap', 'nibble', 'crunch', 'shrug']

/** Every piece with a band playing all its parts. */
const PIECE_BANDS: { name: string; piece: Piece; band: Band }[] = [
  ...([1, 2, 3] as const).map((land) => ({ name: `song (land ${land})`, piece: SONG[land], band: { piece: 'song', from: 0, land, play: [], kazoo: [] } as Band })),
  ...(['lullaby', 'roll', 'flight'] as const).map((name) => ({ name, piece: PIECES[name], band: { piece: name, from: 0, land: 1, play: [], kazoo: [] } as Band })),
].map(({ name, piece, band }) => {
  const parts = INSTRUMENTS.filter((i) => piece.parts[i])
  return { name, piece, band: { ...band, play: parts, kazoo: parts } }
})

// ---------------------------------------------------------------------------------------

describe('the voices', () => {
  it("wire the effects, the machines' sprinkle into them under the band, and the band through the master and a compressor to the speakers", () => {
    const { ctx, synth } = rig()
    const squash = ctx.nodes.find((n) => n instanceof FakeCompressor)!
    expect(squash.outs).toEqual([ctx.destination])
    expect(squash.threshold.value).toBe(-18)
    expect(fake<FakeGain>(synth.master).outs).toEqual([squash])
    expect(fake<FakeGain>(synth.master).gain.value).toBe(MASTER)
    expect(fake<FakeGain>(synth.effects).outs).toEqual([fake(synth.master)])
    expect(fake<FakeGain>(synth.music).outs).toEqual([fake(synth.master)])
    expect(fake<FakeGain>(synth.sprinkle).outs).toEqual([fake(synth.effects)])
    expect(fake<FakeGain>(synth.effects).gain.value).toBe(EFFECTS)
    expect(fake<FakeGain>(synth.music).gain.value).toBe(MUSIC)
    expect(fake<FakeGain>(synth.sprinkle).gain.value).toBe(SPRINKLE)
    expect(SPRINKLE * EFFECTS).toBeLessThan(MUSIC)
    expect(MUSIC).toBeLessThan(EFFECTS)
    expect(fake<FakeGain>(synth.duck).outs).toEqual([fake(synth.music)])
    // The band's take: into the dip under the music, or with the music off into the effects at the music's level.
    expect(fake<FakeGain>(synth.take(true)).outs).toEqual([fake(synth.duck)])
    const soft = fake<FakeGain>(synth.take(false))
    expect(soft.outs).toEqual([fake(synth.effects)])
    expect(soft.gain.value).toBe(MUSIC)
  })

  it('give every event, in every variant, a gentle sound that starts and ends silent, stops and reaches the effects bus', () => {
    for (const e of ALL_EVENTS) {
      const { synth, since } = rig()
      synth.event(e, BOARD, 1)
      const { end, voices } = since(synth.effects, 1)
      const what = JSON.stringify(e)
      expect(voices, what).toBeGreaterThan(0)
      expect(end, what).toBeLessThanOrEqual(3)
    }
  })

  it('make the good sounds the loudest, the havoc small and silly, and evening fall before the lullaby', () => {
    // The loudest single voice of each variant.
    const peaks = (kind: EventKind) =>
      ALL_EVENTS.filter((e) => e.kind === kind).map((e) => {
        const { synth, since } = rig()
        synth.event(e, BOARD, 0)
        return since(synth.effects, 0).peak
      })
    const havoc = Math.max(...HAVOC.flatMap(peaks))
    for (const k of GOOD) expect(Math.min(...peaks(k)), k).toBeGreaterThan(havoc)
    expect(havoc).toBeLessThanOrEqual(0.1)
    const { synth, since } = rig()
    synth.event({ kind: 'goodnight' }, BOARD, 0)
    expect(since(synth.effects, 0).end).toBeLessThanOrEqual(NIGHT_LEAD / HZ)
  })

  it('climb the ticks of a stroke a cell at a time, LAY_GAP apart, a long stroke ending at the top', () => {
    const pitches = (n: number) => {
      const { ctx, synth } = rig()
      const from = ctx.nodes.length
      synth.event({ kind: 'lay', cells: cells(n) }, BOARD, 0)
      const ticks = ctx.nodes.slice(from).filter((x): x is FakeOscillator => x instanceof FakeOscillator)
      return ticks.map((o) => ({ at: o.startAt, f: o.frequency.events.at(-1)!.value }))
    }
    const short = pitches(5)
    expect(short.map((t) => t.at)).toEqual([0, 1, 2, 3, 4].map((i) => i * LAY_GAP))
    short.forEach((t, i) => i === 0 || expect(t.f).toBeGreaterThan(short[i - 1]!.f))
    const long = pitches(40)
    expect(long).toHaveLength(40)
    long.forEach((t, i) => i === 0 || expect(t.f).toBeGreaterThanOrEqual(long[i - 1]!.f))
    expect(long.at(-1)!.f).toBeCloseTo(pitches(9).at(-1)!.f, 6)
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

  it("play every instrument's note clean into its take: as itself, as a napping muncher's kazoo and as a soft hit", () => {
    const sample: Record<Instrument, number> = { tick: 96, shaker: 0, bass: 41, woodblock: 84, bell: 84, chimes: 89, pluck: 65, glock: 89, drum: 41, pizzicato: 53, box: 77, roll: 0 }
    for (const instrument of INSTRUMENTS) {
      for (const how of ['own', 'kazoo', 'soft'] as const) {
        const { synth, since } = rig()
        const take = synth.take(how !== 'soft')
        const n: Note = { instrument, midi: how === 'kazoo' ? 65 : sample[instrument], len: how === 'soft' ? 1 : 2, vel: how === 'soft' ? SOFT : 1, kazoo: how === 'kazoo' }
        synth.note(n, 0.5, take)
        const { end, voices } = since(take, 0.5)
        expect(voices, `${instrument} ${how}`).toBeGreaterThan(0)
        expect(end, `${instrument} ${how}`).toBeLessThanOrEqual(3)
      }
    }
  })

  it('play every eighth of every piece clean into the take, every part and every kazoo at once', () => {
    for (const { name, piece, band } of PIECE_BANDS) {
      for (const music of [true, false]) {
        const { synth, since } = rig()
        const take = synth.take(music)
        const eighths = piece.chords.length * piece.meter
        for (let k = 0; k < eighths; k++) for (const n of notesAt(band, k, music)) synth.note(n, 0.5 + k * EIGHTH, take)
        const { voices } = since(take, 0.5)
        expect(voices, `${name}${music ? '' : ' (music off)'}`).toBeGreaterThan(music ? eighths : piece.chords.length)
      }
    }
  })
})

describe('the mix, as a tablet speaker plays it', () => {
  /** How loud one sound is to her over its first 0.6 s, through its buses (loudness). */
  const heardNote = (n: Note) => {
    const { synth, heard } = rig()
    synth.note(n, 0, synth.take(true))
    return heard(0, 0.6)
  }
  const heardEvent = (e: SimEvent) => {
    const { synth, heard } = rig()
    synth.event(e, BOARD, 0)
    return heard(0, 0.6)
  }
  /** A written line's notes over the song's first eight bars, as itself or as a napping muncher's kazoo. */
  const line = (instrument: Instrument, kazoo: boolean): Note[] => {
    const band: Band = { piece: 'song', from: 0, land: 1, play: kazoo ? [] : [instrument], kazoo: kazoo ? [instrument] : [] }
    return Array.from({ length: 64 }, (_, k) => notesAt(band, k, true)).flat()
  }
  /** A line's loudness, note for note: their powers' mean, in dB. */
  const mean = (notes: readonly Note[]) => 10 * Math.log10(notes.reduce((sum, n) => sum + 10 ** (heardNote(n) / 10), 0) / notes.length)
  const tune = mean(line('bell', false))

  it('make a napping muncher\'s kazoo at least as loud as the line it replaces, so she hears across the room where it sleeps', () => {
    for (const instrument of ['bell', 'glock'] as const) expect(mean(line(instrument, true)), instrument).toBeGreaterThanOrEqual(mean(line(instrument, false)))
  })

  it("keep the visit's pizzicato within 6 dB of the tune, and every machine's own sound 3 dB or more under it: the band leads", () => {
    expect(mean(line('pizzicato', false))).toBeGreaterThanOrEqual(tune - 6)
    for (const e of [...EVENTS.batch, ...EVENTS.push, ...EVENTS.gulp, ...EVENTS.drink]) expect(heardEvent(e), JSON.stringify(e)).toBeLessThanOrEqual(tune - 3)
    // The good sounds stay far over the band.
    for (const e of EVENTS.card) expect(heardEvent(e), e.id).toBeGreaterThan(tune + 12)
  })
})

// ---------------------------------------------------------------------------------------

/** A fake speech: what Beep said, and how often it was hushed. */
class FakeUtterance {
  text: string
  lang = ''
  pitch = 1
  rate = 1
  volume = 1
  voice: { lang: string; name: string } | null = null
  constructor(text: string) {
    this.text = text
  }
}
function fakeSpeech() {
  const said: FakeUtterance[] = []
  const speech = {
    said,
    hushed: 0,
    speak: (u: FakeUtterance) => said.push(u),
    cancel: () => (speech.hushed += 1),
    getVoices: () => [
      { lang: 'fi-FI', name: 'Satu' },
      { lang: 'en-GB', name: 'Daniel' },
      { lang: 'en-US', name: 'Samantha' },
    ],
  }
  vi.stubGlobal('speechSynthesis', speech)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  return speech
}

/** A board where the diggers' shaker plays every eighth (land 2's), so each eighth the band schedules is one note; the session's parts have all rejoined. */
function shaking(): State {
  const s = blankState(1)
  s.tick = REJOIN
  s.land = 2
  const digger = newBuilding(s.nextId++, 'digger', 0, 0, 0)
  digger.batch = { makes: 'blueRock', at: 0, until: 1e9 }
  s.buildings.push(digger)
  return s
}

describe('Sounds', () => {
  let contexts: FakeContext[] = []
  beforeEach(() => {
    contexts = []
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  const sources = () => contexts[0]!.nodes.filter((n) => n instanceof FakeSource).length
  /** Steps the sim and the audio clock on together, a tick a frame, the frame's events with the first. */
  function run(sounds: Sounds, s: State, frames: number, events: SimEvent[] = []) {
    const ctx = contexts[0]!
    for (let i = 0; i < frames; i++) {
      ctx.currentTime += STEP
      s.tick += 1
      sounds.frame(s, i === 0 ? events : [], STEP)
    }
  }
  /** Records every band note with the clock and the sim's tick when it was scheduled. */
  function notes() {
    const note = Synth.prototype.note
    const out: { n: Note; at: number; now: number; tick: number }[] = []
    let s: State | null = null
    vi.spyOn(Synth.prototype, 'note').mockImplementation(function (this: Synth, n: Note, at: number, take: AudioNode) {
      out.push({ n, at, now: contexts[0]!.currentTime, tick: s!.tick })
      note.call(this, n, at, take)
    })
    return {
      out,
      watch(state: State) {
        s = state
      },
    }
  }

  it('makes no sound, no context and no speech before the first unlock, then one context, and the band starts with the next frame', () => {
    const speech = fakeSpeech()
    const sounds = new Sounds()
    const s = shaking()
    sounds.frame(s, ALL_EVENTS, STEP)
    sounds.ui('tap')
    sounds.say('Oven!')
    sounds.setSound(false)
    sounds.setSound(true)
    sounds.setMusic(false)
    sounds.setMusic(true)
    sounds.setPaused(true)
    sounds.setPaused(false)
    sounds.suspend()
    sounds.resume()
    expect(contexts).toHaveLength(0)
    expect(speech.said).toEqual([])
    sounds.unlock()
    sounds.unlock()
    expect(contexts).toHaveLength(1)
    // The first gesture wakes the speech with an empty word (iOS speaks only after one).
    expect(speech.said.map((u) => [u.text, u.volume])).toEqual([['', 0]])
    const take = vi.spyOn(Synth.prototype, 'take')
    expect(sources()).toBe(0)
    run(sounds, s, HOP)
    expect(take).toHaveBeenCalledTimes(1)
    expect(sources()).toBeGreaterThan(0)
  })

  it('sleeps when suspended, stays asleep through gestures, plays nothing into the sleeping context, and wakes on resume', async () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    expect(ctx.resumes).toBe(0)
    sounds.suspend()
    await Promise.resolve()
    expect(ctx.state).toBe('suspended')
    sounds.unlock()
    expect(ctx.state).toBe('suspended')
    const before = sources()
    run(sounds, shaking(), 30, [{ kind: 'play' }])
    expect(sources()).toBe(before)
    sounds.resume()
    expect(ctx.state).toBe('running')
    ctx.state = 'suspended'
    sounds.unlock()
    expect(ctx.state).toBe('running')
  })

  it('plays the same sound once within DEDUP and again after, two variants together, and a HUD pick and a sim pick as one', () => {
    const event = vi.spyOn(Synth.prototype, 'event')
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    const s = blankState(1)
    sounds.frame(s, [{ kind: 'place', id: 1, sticker: 'oven' }, { kind: 'place', id: 1, sticker: 'digger' }], STEP)
    expect(event).toHaveBeenCalledTimes(1)
    sounds.frame(s, [{ kind: 'place', id: 1, sticker: 'oven' }], STEP)
    expect(event).toHaveBeenCalledTimes(1)
    ctx.currentTime += DEDUP + 0.001
    sounds.frame(s, [{ kind: 'place', id: 1, sticker: 'oven' }], STEP)
    expect(event).toHaveBeenCalledTimes(2)
    ctx.currentTime += 1
    sounds.frame(s, (['tree', 'flowers', 'tree'] as const).map((what) => ({ kind: 'poke', what, ...AT })), STEP)
    expect(event.mock.calls.slice(2).map(([e]) => (e.kind === 'poke' ? e.what : e.kind))).toEqual(['tree', 'flowers'])
    ctx.currentTime += 1
    const ui = vi.spyOn(Synth.prototype, 'ui')
    sounds.ui('pick')
    sounds.frame(s, [{ kind: 'tool' }], STEP)
    expect(ui).toHaveBeenCalledTimes(1)
    expect(event).toHaveBeenCalledTimes(4)
  })

  it("waits a machine's sound for the next eighth, at most PER_EIGHTH of a kind on one, and plays a tap's sound at once", () => {
    const event = vi.spyOn(Synth.prototype, 'event')
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    const s = blankState(1)
    ctx.currentTime = 10
    s.tick = 0
    // Anchored on this frame: tick 0 is audio time 10, so the eighths fall at 10 + k / 3.
    sounds.frame(s, [], STEP)
    ctx.currentTime += 0.05
    s.tick += 3
    const pushes: SimEvent[] = [1, 2, 3, 4].map(() => ({ kind: 'push', id: 1, thing: 'blueBar' }))
    sounds.frame(s, [...pushes, { kind: 'push', id: 1, thing: 'gear' }, { kind: 'batch', id: 1 }, { kind: 'dig', cell: 45, thing: 'blueRock' }], STEP)
    const at = (kind: string) => event.mock.calls.filter(([e]) => e.kind === kind).map((c) => c[2])
    expect(at('dig')).toEqual([ctx.currentTime])
    expect(at('push')).toHaveLength(PER_EIGHTH + 1)
    for (const t of [...at('push'), ...at('batch')]) expect(t).toBeCloseTo(10 + EIGHTH, 9)
    // The same eighth's cap still holds a frame later; the next eighth has room again.
    ctx.currentTime += 0.05
    s.tick += 3
    sounds.frame(s, pushes.slice(0, 1), STEP)
    expect(at('push')).toHaveLength(PER_EIGHTH + 1)
    ctx.currentTime = 10 + EIGHTH + 0.01
    s.tick = HOP + 1
    sounds.frame(s, pushes, STEP)
    expect(at('push').slice(-PER_EIGHTH)).toEqual([10 + 2 * EIGHTH, 10 + 2 * EIGHTH].map((t) => expect.closeTo(t, 9)))
  })

  it("schedules each eighth once, on the sim's beat, within the lookahead, from the parts playing now", () => {
    const rec = notes()
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    ctx.currentTime = 3
    const s = shaking()
    rec.watch(s)
    run(sounds, s, 300)
    const shakes = rec.out.filter(({ n }) => n.instrument === 'shaker')
    // Five seconds of every eighth's shake, give or take the one in the lookahead.
    expect(shakes.length).toBeGreaterThanOrEqual(Math.floor(300 / HOP))
    expect(shakes.length).toBeLessThanOrEqual(Math.ceil(300 / HOP) + 1)
    shakes.forEach(({ at, now, tick }, i) => {
      expect(at).toBeGreaterThanOrEqual(now - 1e-9)
      expect(at).toBeLessThan(now + LOOKAHEAD + 1e-9)
      // The note's tick on the sim's clock is a hop tick: the band is on the belts' beat.
      const its = tick + (at - now) / STEP
      expect(Math.abs(its / HOP - Math.round(its / HOP))).toBeLessThan(1e-6)
      if (i > 0) expect(at - shakes[i - 1]!.at).toBeCloseTo(EIGHTH, 9)
    })
    // The digger stops: its part drops out at once. Nothing works: nothing plays.
    s.buildings.at(-1)!.batch = null
    const was = rec.out.length
    run(sounds, s, 120)
    expect(rec.out.length).toBe(was)
  })

  it('re-anchors after a slow frame, a sim held back, a stalled clock and a new game, never playing an eighth twice or in the past', () => {
    const rec = notes()
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    const s = shaking()
    rec.watch(s)
    run(sounds, s, 120)
    // A slow frame: half a second went by and the sim only caught up a tenth of it.
    ctx.currentTime += 0.5
    s.tick += 6
    sounds.frame(s, [], 0.5)
    run(sounds, s, 120)
    // The audio clock stalls while the sim runs on (a busy audio thread), then they go on together.
    for (let i = 0; i < 30; i++) {
      s.tick += 1
      sounds.frame(s, [], STEP)
    }
    run(sounds, s, 120)
    // Never twice and never a burst: no two shakes closer than the lookahead (an eighth apart, but where a re-anchor skipped ahead).
    const times = rec.out.filter(({ n }) => n.instrument === 'shaker').map(({ at }) => at)
    for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!, `shake ${i}`).toBeGreaterThan(LOOKAHEAD)
    for (const { at, now } of rec.out) expect(at).toBeGreaterThanOrEqual(now - 1e-9)
    // After every re-anchor the band is back on the sim's beat: each note's tick is a hop tick, within the anchor's drift.
    for (const { at, now, tick } of rec.out.slice(-20)) {
      const its = tick + (at - now) / STEP
      expect(Math.abs(its / HOP - Math.round(its / HOP)) * HOP * STEP).toBeLessThanOrEqual(DRIFT)
    }
    // A new game: the sim's clock starts again at 0, and so does the band.
    const fresh = shaking()
    rec.watch(fresh)
    const was = rec.out.length
    run(sounds, fresh, 60)
    expect(rec.out.length - was).toBeGreaterThanOrEqual(2)
  })

  it("halves the machines' sprinkle while munchers are out, as the particles halve, and brings it back when they are home", () => {
    const take = vi.spyOn(Synth.prototype, 'take')
    const sounds = new Sounds()
    sounds.unlock()
    const s = shaking()
    run(sounds, s, 2)
    const bus = fake<FakeGain>((take.mock.contexts[0] as Synth).sprinkle).gain
    expect(bus.value).toBe(SPRINKLE)
    expect(bus.events).toEqual([])
    s.munchers.push({ id: 1, burrow: 0, mode: 'walk', modeAt: 0, cell: 45, toward: 45, stepAt: 0, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: [], grabAt: -1, idleSince: -1, outAt: 0, scout: false, shotBy: -1 })
    run(sounds, s, 2)
    expect(bus.events.at(-1)).toMatchObject({ kind: 'target', value: VISIT_SPRINKLE })
    const was = bus.events.length
    run(sounds, s, 30)
    expect(bus.events).toHaveLength(was)
    s.munchers = []
    run(sounds, s, 2)
    expect(bus.events.at(-1)).toMatchObject({ kind: 'target', value: SPRINKLE })
  })

  it('mutes everything with the sound switch and the music bus with the music switch, the band then playing one soft hit a bar, from before the unlock too', () => {
    const rec = notes()
    const take = vi.spyOn(Synth.prototype, 'take')
    const sounds = new Sounds()
    sounds.setMusic(false)
    sounds.unlock()
    const ctx = contexts[0]!
    const s = shaking()
    rec.watch(s)
    run(sounds, s, 16 * HOP)
    expect(take.mock.calls.map((c) => c[0])).toEqual([false])
    // Music off: in two bars the shaker sounds twice, softly, on its beat (the bar's second eighth).
    const soft = rec.out.filter(({ n }) => n.instrument === 'shaker')
    expect(soft).toHaveLength(2)
    for (const { n, at, now, tick } of soft) {
      expect(n.vel).toBeLessThanOrEqual(SOFT)
      expect(Math.round(tick + (at - now) / STEP) % (8 * HOP)).toBe(HOP)
    }
    const bus = (node: AudioNode) => fake<FakeGain>(node).gain
    const synth = () => take.mock.contexts[0] as Synth
    sounds.setMusic(true)
    expect(bus(synth().music).events.at(-1)).toMatchObject({ kind: 'target', value: MUSIC })
    run(sounds, s, 2 * HOP)
    expect(take.mock.calls.map((c) => c[0])).toEqual([false, true])
    sounds.setSound(false)
    expect(bus(synth().master).events.at(-1)).toMatchObject({ kind: 'target', value: 0 })
    const made = sources()
    ctx.currentTime += 1
    sounds.frame(s, [{ kind: 'card', id: 'gold' }, { kind: 'push', id: 1, thing: 'gear' }], STEP)
    sounds.ui('open')
    run(sounds, s, 2 * HOP)
    expect(sources()).toBe(made)
    sounds.setSound(true)
    expect(bus(synth().master).events.at(-1)).toMatchObject({ kind: 'target', value: MASTER })
    run(sounds, s, 2 * HOP)
    expect(sources()).toBeGreaterThan(made)
    // Off before the first touch: the master starts silent.
    const later = new Sounds()
    later.setSound(false)
    later.unlock()
    expect(contexts).toHaveLength(2)
    expect(contexts[1]!.nodes.some((n) => n instanceof FakeGain && n.gain.value === MASTER)).toBe(false)
  })

  it("holds the band while paused, the context running on for the menu's sounds, and brings it back on the beat", async () => {
    const rec = notes()
    const retire = vi.spyOn(Synth.prototype, 'retire')
    const ui = vi.spyOn(Synth.prototype, 'ui')
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    const s = shaking()
    rec.watch(s)
    run(sounds, s, 60)
    sounds.setPaused(true)
    expect(retire).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(ctx.state).toBe('running')
    // The menu's sounds play at once while the sim and the band hold.
    const was = rec.out.length
    sounds.ui('hold')
    expect(ui).toHaveBeenLastCalledWith('hold', ctx.currentTime)
    for (let i = 0; i < 120; i++) {
      ctx.currentTime += STEP
      sounds.frame(s, [], STEP)
    }
    expect(rec.out.length).toBe(was)
    sounds.setPaused(false)
    run(sounds, s, 60)
    const after = rec.out.slice(was)
    expect(after.length).toBeGreaterThanOrEqual(2)
    for (const { at, now, tick } of after) {
      const its = tick + (at - now) / STEP
      expect(Math.abs(its / HOP - Math.round(its / HOP))).toBeLessThan(1e-6)
    }
  })

  it("says Beep's words in English pitched up like a little robot, once each, with the band dipping, the Voice and Sound switches on", () => {
    const speech = fakeSpeech()
    const dip = vi.spyOn(Synth.prototype, 'dip')
    const chirp = vi.spyOn(Synth.prototype, 'chirp')
    const sounds = new Sounds()
    expect(sounds.speaks).toBe(true)
    sounds.unlock()
    const ctx = contexts[0]!
    const s = blankState(1)
    sounds.frame(s, [{ kind: 'say', word: 'Oven!' }, { kind: 'say', word: 'Oven!' }], STEP)
    const words = () => speech.said.filter((u) => u.text !== '')
    expect(words().map((u) => [u.text, u.lang, u.pitch, u.rate, u.voice!.name])).toEqual([['Oven!', BEEP_VOICE.lang, BEEP_VOICE.pitch, BEEP_VOICE.rate, 'Samantha']])
    expect(chirp).toHaveBeenCalledTimes(1)
    expect(dip).toHaveBeenCalledTimes(1)
    ctx.currentTime += 2
    sounds.say('Gears!')
    expect(words().map((u) => u.text)).toEqual(['Oven!', 'Gears!'])
    sounds.setVoice(false)
    ctx.currentTime += 2
    sounds.say('Hooray!')
    sounds.setVoice(true)
    sounds.setSound(false)
    sounds.say('Hooray!')
    sounds.setSound(true)
    expect(words()).toHaveLength(2)
    sounds.say('Hooray!')
    expect(words()).toHaveLength(3)
    const hushed = speech.hushed
    sounds.suspend()
    expect(speech.hushed).toBe(hushed + 1)
  })

  it('counts down with the countdown, cheers the flight home, says good night at dusk and calls out the scout, two words never closer than WORD_GAP', () => {
    const speech = fakeSpeech()
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    const s = blankState(1)
    s.munchers.push({ id: 7, burrow: 0, mode: 'out', modeAt: 0, cell: 45, toward: 45, stepAt: 0, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: [], grabAt: -1, idleSince: -1, outAt: 0, scout: true, shotBy: -1 })
    const words = () => speech.said.filter((u) => u.text !== '').map((u) => u.text)
    const at = (events: SimEvent[]) => {
      ctx.currentTime += 1
      sounds.frame(s, events, STEP)
    }
    for (const n of [5, 4, 3, 2, 1]) at([{ kind: 'count', n }])
    at([{ kind: 'landed' }])
    at([{ kind: 'goodnight' }])
    at([{ kind: 'hopOut', id: 7, burrow: 0 }])
    // Another muncher's hop out, and one home and gone by the frame, say nothing.
    s.munchers[0]!.scout = false
    at([{ kind: 'hopOut', id: 7, burrow: 0 }, { kind: 'hopOut', id: 99, burrow: 0 }])
    expect(words()).toEqual(['Five!', 'Four!', 'Three!', 'Two!', 'One!', 'Hooray!', 'Good night!', 'Munchers!'])
    // A card's word and a new sticker's at once: the first is said, the second would come too late to mean its moment.
    ctx.currentTime += 1
    sounds.frame(s, [{ kind: 'say', word: 'Snacks!' }, { kind: 'say', word: 'Snack bowl!' }], STEP)
    ctx.currentTime += WORD_GAP / 2
    sounds.say('Oven!')
    expect(words().slice(-1)).toEqual(['Snacks!'])
    ctx.currentTime += WORD_GAP
    sounds.say('Oven!')
    expect(words().slice(-2)).toEqual(['Snacks!', 'Oven!'])
  })

  it('calls a sticker a card brings alone by its card\'s word, so each thing has one name', () => {
    for (const c of CARDS.map(card)) {
      const kinds = Object.keys(c.gives).filter((k): k is Placeable => (PLACEABLE as readonly string[]).includes(k))
      if (kinds.length !== 1 || Object.keys(c.gives).length !== 1) continue
      expect(STICKER_WORD[kinds[0]!], c.id).toMatch(new RegExp(`^${c.word.replace(/s?!$/, '')}`))
    }
    expect(STICKER_WORD.orangeMaker).toBe(card('stars').word)
  })

  it('has no voice where the browser cannot speak: the switch stays off and words make no sound', () => {
    const sounds = new Sounds()
    expect(sounds.speaks).toBe(false)
    sounds.unlock()
    sounds.setVoice(true)
    const chirp = vi.spyOn(Synth.prototype, 'chirp')
    sounds.say('Oven!')
    sounds.frame(blankState(1), [{ kind: 'say', word: 'Lab!' }], STEP)
    expect(chirp).not.toHaveBeenCalled()
  })

  it("cuts the gate's rising tone short at the next HUD sound, or when the page sleeps", () => {
    const sounds = new Sounds()
    sounds.unlock()
    const ctx = contexts[0]!
    for (const end of ['tap', 'suspend'] as const) {
      const from = ctx.nodes.length
      sounds.ui('hold')
      const rising = ctx.nodes.slice(from).find((n): n is FakeOscillator => n instanceof FakeOscillator && Math.round(n.frequency.events[0]!.value) === 349)!
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

  it('never steps the sim or reads anything but the state: a frame leaves the state as it was', () => {
    const sounds = new Sounds()
    sounds.unlock()
    const s = shaking()
    s.belts.slot[3] = thingIndex('gear')
    const before = JSON.stringify(s)
    sounds.frame(s, ALL_EVENTS.filter((e) => e.kind !== 'batch'), STEP)
    expect(JSON.stringify(s)).toBe(before)
  })
})
