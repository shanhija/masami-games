import { SPEECH_TAG, inLang, type Lang, type Words } from '../../../profiles/src/lang'
import { pickVoice } from '../../../profiles/src/voice'
import { BEEP_SAYS, COUNTDOWN, saidWords } from '../words'
import { EIGHTH, bandOf, notesAt, penta, type Instrument, type Note } from './band'
import { PART_INFO, SIZE } from './catalog'
import { HOP, PARTS, STEP, isMaker, isShiny, type EventKind, type HomeWhy, type Kind, type Maker, type SimEvent, type State, type Thing } from './model'
import { rng } from './random'

/**
 * Every sound of Rocket Factory, synthesised with WebAudio: nothing to load. The effects bus
 * carries the events' sounds and the HUD's; the music bus carries the band (band.ts: the song
 * the working machines play), and the machines' own small sounds (a batch starting, a thing
 * pushed out or gulped, the lab's drink) go through the sprinkle, under the band, so the band
 * leads: the napping muncher's kazoo and the visit's pizzicato tell her what is happening, and
 * a busy factory's bleeps only glitter round them. All meet in the master and go on through a
 * compressor, so a pile of sounds at once is never one loud burst. Nothing startles: every
 * voice fades in over a few milliseconds, no bang has a sharp edge, and no single voice goes
 * over a fifth of full scale. The good sounds (a discovery, a rocket part, a friend, a picnic,
 * the flight home) are the loudest; the munchers' havoc stays small and silly. Every chime is
 * on the band's F major pentatonic (band.ts `penta`), so it fits over any bar.
 *
 * Beep's voice is the browser's own speech in the player's language, pitched up like a little
 * robot (`Sounds.say`).
 */

/** Sounds the HUD makes that are not events: a button, a card opening or closing, the parent gate's hold, Start again done, a tray pick, Beep murmuring in its sleep at a tap on the Good night card. */
export type UiSound = 'tap' | 'open' | 'close' | 'hold' | 'fresh' | 'pick' | 'murmur'

/**
 * The mix: the effects at full, the band over the machines' own sounds (the sprinkle, into the
 * effects), all into the master. Rendered offline through a tablet speaker's model and
 * A-weighted, a bell note of the tune sits about 3 dB over a green bottle's ding and a kazoo as
 * loud as the line it replaces; the good sounds stay some 20 dB over the band.
 */
export const MASTER = 0.6
export const EFFECTS = 1
export const MUSIC = 0.45
export const SPRINKLE = 0.35
/** While munchers are out the sprinkle halves, as the particles do, so she can follow the visit. */
export const VISIT_SPRINKLE = SPRINKLE / 2
/** The same sound twice within this many seconds plays once (rocks landing together are one clatter). */
export const DEDUP = 0.05
/** Machine sounds wait for the next eighth, and at most this many of a kind sound on one. */
export const PER_EIGHTH = 2
/** The band schedules every eighth due within LOOKAHEAD seconds of the audio clock. */
export const LOOKAHEAD = 0.1
/** It re-anchors to the sim after a frame longer than SLOW, or when the sim's tick and the audio clock have drifted DRIFT apart. */
export const SLOW = LOOKAHEAD
export const DRIFT = 0.05
/** A stroke's cells pop in this far apart, each with a tick a step higher (two ticks: strokes.ts can stamp them so). */
export const LAY_GAP = 2 * STEP
/** The parent gate's rising tone lasts as long as Start again's hold. */
export const HOLD_FOR = 3
/** Beep's voice: the browser's speech in the player's language (its voice from profiles' pickVoice), pitched up like a little robot and a touch slow, so a five-year-old catches it. */
export const BEEP_VOICE = { pitch: 1.9, rate: 0.95, volume: 1 } as const
/** The same word within this many seconds is said once, and the band dips this long under it. */
const SAY_GAP = 1
const SAY_DIP = 1.2
/** A different word comes at least WORD_GAP after the last one Beep said, or not at all: the browser queues what it is told to say, and a word said late is said at a moment it no longer means. The countdown's numbers, a second apart, all come. */
export const WORD_GAP = 0.7

/**
 * Beep's words that belong to a moment's sound, beside the sim's 'say' events (a card's word,
 * a new sticker's name): it counts down with the countdown (and says a number again when her
 * tap pops it), cheers the flight home, says good night at dusk, and calls out the munchers when
 * the scout hops out. Null for every other event. A frame's events come from all its steps, so
 * the scout may be home and gone by the frame: then the word is left out.
 */
function wordOf(e: SimEvent, s: State): Words | null {
  switch (e.kind) {
    case 'count':
      return COUNTDOWN[e.n]!
    case 'landed':
      return BEEP_SAYS.hooray
    case 'goodnight':
      return BEEP_SAYS.goodNight
    case 'hopOut':
      return s.munchers.some((m) => m.id === e.id && m.scout) ? BEEP_SAYS.munchers : null
    default:
      return null
  }
}
/** The band dips to this under a fanfare or a word. */
const DUCK = 0.3
/** The band's fader closes over HUSH when a switch or the pause stops it. */
const HUSH = 0.08
/** Exponential glides never reach zero: this is silence. */
const SILENT = 0.0001

/** The frequency of a MIDI note (A4, 69, is 440 Hz). */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

// ---------------------------------------------------------------------------------------
// The voices.

type Wave = Exclude<OscillatorType, 'custom'>
/** A pitch or a level over time: [seconds from the start, value] points with exponential glides between them. */
type Curve = readonly (readonly [number, number])[]
/** Struck: up to full over `attack`, then dying away to silence at `dur`. */
const struck = (attack: number, dur: number): Curve => [
  [0, 0],
  [attack, 1],
  [dur, 0],
]
/** Plucked: up at once, down to under half within 0.08 s, then ringing away to silence at `dur`. */
const plucked = (dur: number): Curve => [
  [0, 0],
  [0.004, 1],
  [0.08, 0.45],
  [dur, 0],
]
/** Held: up to full over `attack`, easing to 0.7 by three quarters of `dur`, silent at `dur`. */
const held = (attack: number, dur: number): Curve => [
  [0, 0],
  [attack, 1],
  [dur * 0.75, 0.7],
  [dur, 0],
]

/** A struck thing's partials as [ratio to the fundamental, level]; the higher ones die sooner. */
type Partials = readonly (readonly [number, number])[]
/** A glockenspiel bar: the orange maker's descant, the sparkles, the tinks. */
const GLOCK: Partials = [
  [1, 1],
  [2.76, 0.3],
  [5.4, 0.1],
]
/** A music box's tine: the lullaby, the flight, the night's tucks. */
const TINE: Partials = [
  [1, 1],
  [3, 0.07],
  [5.8, 0.1],
]
/** A round bell: the green makers' tune, the discovery chime, the dings. */
const BELL: Partials = [
  [1, 1],
  [2, 0.4],
  [3, 0.15],
  [4.2, 0.07],
]
/** The lab's chimes: a long tube, struck twice a breath apart in pitch so it shimmers. */
const CHIME: Partials = [
  [1, 1],
  [1.004, 0.6],
  [2.76, 0.12],
]

/** Sets `param` along `curve` from time `at`, each value times `scale`; never below SILENT, since an exponential glide cannot reach zero. */
function glide(param: AudioParam, curve: Curve, at: number, scale: number) {
  curve.forEach(([t, v], i) => {
    const value = Math.max(v * scale, SILENT)
    if (i > 0) param.exponentialRampToValueAtTime(value, at + t)
    else {
      // The first value holds from now on as well: a noise source can start a sample before the param's first event, and must not meet a gain's default of 1 there (a click).
      param.value = value
      param.setValueAtTime(value, at + t)
    }
  })
}

/** The building an event names: it is on the board, since a frame's events come from its own steps. */
function kindOf(s: State, id: number): Kind {
  const b = s.buildings.find((x) => x.id === id)
  if (!b) throw new Error(`an event names building ${id}, which is not on the board`)
  return b.kind
}

/** Each event's sound. `at` first, so a sound that needs nothing else from its event names nothing else; the state for the few that look something up. Beep's words are speech, not a voice (`Sounds.say`). */
type EventVoices = { [K in Exclude<EventKind, 'say'>]: (at: number, e: Extract<SimEvent, { kind: K }>, s: State) => void }
type Poke = Extract<SimEvent, { kind: 'poke' }>['what']

/** What each kind's tuck-in tine plays: lower for each, so the tucks walk the factory down to sleep. */
const TUCK: Record<Kind, number> = { digger: 77, oven: 74, workshop: 72, greenMaker: 69, orangeMaker: 67, lab: 65, pump: 62, pad: 60, tower: 57, bowl: 55 }

/**
 * Every voice of the game on one audio context: the buses, the events' sounds, the HUD's,
 * the band's instruments and Beep's chirp. Sounds runs it on the page's AudioContext; the
 * tests run it on a fake one.
 */
export class Synth {
  readonly ctx: BaseAudioContext
  readonly master: GainNode
  readonly effects: GainNode
  /** The machines' own sounds, under the band (SPRINKLE), into the effects. */
  readonly sprinkle: GainNode
  /** The music switch's bus, and the dip under it that fanfares and words pull down. */
  readonly music: GainNode
  readonly duck: GainNode
  /** Two seconds of white noise every noisy sound loops over, and where in it the next one starts. */
  private white: AudioBuffer
  private grain = 0
  /** The parent gate's rising tone while it sounds: its own fader, to cut it short. */
  private holding: GainNode | null = null

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx
    const squash = ctx.createDynamicsCompressor()
    squash.threshold.value = -18
    squash.knee.value = 6
    squash.ratio.value = 4
    squash.attack.value = 0.003
    squash.release.value = 0.25
    squash.connect(ctx.destination)
    this.master = this.gain(MASTER, squash)
    this.effects = this.gain(EFFECTS, this.master)
    this.sprinkle = this.gain(SPRINKLE, this.effects)
    this.music = this.gain(MUSIC, this.master)
    this.duck = this.gain(1, this.music)
    this.white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = this.white.getChannelData(0)
    const next = rng(0x0b5e)
    for (let i = 0; i < data.length; i++) data[i] = next() * 2 - 1
  }

  /** The sound of one sim event at time `at`. */
  event(e: SimEvent, s: State, at: number) {
    if (e.kind === 'say') throw new Error("Beep's words are speech: Sounds.say speaks them")
    // The record is keyed by kind and each entry takes its own kind's event: the lookup cannot say so to the compiler.
    ;(this.eventVoices[e.kind] as (at: number, e: SimEvent, s: State) => void)(at, e, s)
  }

  /** A HUD sound at time `at`. */
  ui(sound: UiSound, at: number) {
    this.uiVoices[sound](at)
  }

  /** One of the band's notes at time `at` into `out` (a take): its instrument's voice, or a napping muncher's kazoo. */
  note(n: Note, at: number, out: AudioNode) {
    if (n.kazoo) this.kazoo(out, n, at)
    else this.instruments[n.instrument](out, n, at)
  }

  /** A fader for the band into the music bus, or with the music off into the effects at the music's level (the parts' soft hits). */
  take(music: boolean): GainNode {
    return music ? this.gain(1, this.duck) : this.gain(MUSIC, this.effects)
  }

  /** Fades a take out over `fade` from `at`: what it has scheduled plays on into silence. */
  retire(take: GainNode, at: number, fade: number) {
    const g = take.gain
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(0, at + fade)
  }

  /** Ends the parent gate's tone, if it sounds, within 50 ms of `at`. */
  cut(at: number) {
    if (!this.holding) return
    this.holding.gain.setValueAtTime(1, at)
    this.holding.gain.linearRampToValueAtTime(0, at + 0.05)
    this.holding = null
  }

  /** Dips the band under a fanfare or a word from `at` for `dur` seconds, then lets it back up. */
  dip(at: number, dur: number) {
    const g = this.duck.gain
    g.cancelScheduledValues(at)
    g.setTargetAtTime(DUCK, at, 0.04)
    g.setTargetAtTime(1, at + dur, 0.3)
  }

  /** The machines' sprinkle halves from `at` while munchers are out (`visit`), and comes back when they are home. */
  visit(visit: boolean, at: number) {
    const g = this.sprinkle.gain
    g.cancelScheduledValues(at)
    g.setTargetAtTime(visit ? VISIT_SPRINKLE : SPRINKLE, at, 0.3)
  }

  /** Beep's chirp, bee-boo: a word follows it, and a tap on Beep plays it. */
  chirp(at: number) {
    const robot = this.filter('lowpass', 3000, 0.7, this.effects)
    ;[89, 84].forEach((m, i) => {
      this.voice(robot, 'square', [[0, hz(m)]], held(0.005, 0.09), 0.025, at + i * 0.11)
      this.voice(this.effects, 'sine', [[0, hz(m)]], held(0.005, 0.09), 0.05, at + i * 0.11)
    })
  }

  private readonly eventVoices: EventVoices = {
    play: (at) => {
      // Off we go: bells up the chord and a sparkle on top.
      ;[77, 81, 84, 89].forEach((m, i) => this.bell(this.effects, BELL, hz(m), at + i * 0.09, 0.9, 0.13))
      this.bell(this.effects, GLOCK, hz(96), at + 0.36, 0.6, 0.06)
    },
    dig: (at, e) => {
      if (e.thing === 'bubble') {
        this.bloop(this.effects, at, 0.12)
        return
      }
      // Tink: Beep's little hammer on the rock, a gold one brighter, over the rock's knock.
      this.bell(this.effects, GLOCK, e.thing === 'goldRock' ? 2350 : 2000, at, 0.18, 0.1)
      this.voice(this.effects, 'triangle', [[0, 260], [0.05, 180]], struck(0.002, 0.07), 0.08, at)
    },
    full: (at) => {
      // Nothing wants it: a soft tap on the patch and a gentle "hm?", never a buzzer.
      this.voice(this.effects, 'triangle', [[0, 240], [0.05, 170]], struck(0.002, 0.07), 0.07, at)
      const soft = this.filter('lowpass', 1400, 0.7, this.effects)
      this.voice(soft, 'triangle', [[0, hz(69)], [0.12, hz(72)]], [[0, 0], [0.02, 1], [0.14, 0.8], [0.2, 0]], 0.06, at + 0.12)
      this.voice(soft, 'triangle', [[0, hz(72)], [0.16, hz(77)]], [[0, 0], [0.02, 1], [0.2, 0.7], [0.28, 0]], 0.06, at + 0.34)
    },
    lay: (at, e) => {
      // A tick for each cell as it pops down, climbing the pentatonic: a short stroke a step a cell, a long one spread so it always ends at the top.
      const n = e.cells.length
      for (let i = 0; i < n; i++) this.tick(this.effects, hz(penta(5 + Math.floor((i * 8) / Math.max(n - 1, 8)))), 0.09, at + i * LAY_GAP)
    },
    repoint: (at, e) => {
      // The belt turns about: a quick soft ratchet and a swish.
      for (let i = 0; i < Math.min(e.cells.length, 12); i++) this.voice(this.effects, 'triangle', [[0, 1250]], struck(0.001, 0.02), 0.05, at + i * LAY_GAP * 0.6)
      this.hiss(this.effects, 'bandpass', [[0, 900], [0.2, 2000]], 1, [[0, 0], [0.05, 1], [0.22, 0]], 0.04, at)
    },
    bridge: (at) => {
      // Hup: up and over the hump.
      this.voice(this.effects, 'sine', [[0, 400], [0.08, 900], [0.2, 600]], struck(0.004, 0.22), 0.1, at)
      this.tick(this.effects, hz(89), 0.05, at + 0.18)
    },
    join: (at) => {
      // The zip closes a tooth.
      const zip = this.tremolo(this.effects, 40, 0.45, at, 0.24)
      this.hiss(zip, 'bandpass', [[0, 1800], [0.2, 4200]], 2, [[0, 0], [0.02, 1], [0.2, 0]], 0.12, at)
      this.voice(this.effects, 'triangle', [[0, 900], [0.03, 700]], struck(0.002, 0.04), 0.06, at + 0.2)
    },
    fork: (at) => {
      // The paddle flips: tick, tock.
      this.voice(this.effects, 'triangle', [[0, 900]], struck(0.002, 0.04), 0.08, at)
      this.voice(this.effects, 'triangle', [[0, 650]], struck(0.002, 0.05), 0.08, at + 0.09)
    },
    rollUp: (at, e) => {
      // Curl: the ticks of the cells going back down, under a soft rolling whoosh.
      const n = e.cells.length
      for (let i = 0; i < n; i++) this.tick(this.effects, hz(penta(13 - Math.floor((i * 8) / Math.max(n - 1, 8)))), 0.07, at + i * LAY_GAP)
      this.hiss(this.effects, 'bandpass', [[0, 2200], [0.4, 700]], 1, [[0, 0], [0.06, 1], [0.45, 0]], 0.06, at)
    },
    hedgeIn: (at, e) => {
      // A leafy rustle and a soft knock for each hedge going in.
      e.cells.forEach((c, i) => {
        const t = at + i * LAY_GAP * 1.5
        this.hiss(this.effects, 'bandpass', [[0, 2800 + (c % 3) * 300]], 1.2, struck(0.004, 0.08), 0.07, t)
        this.voice(this.effects, 'sine', [[0, 300], [0.05, 200]], struck(0.003, 0.06), 0.06, t)
      })
    },
    place: (at, e) => {
      // Slap: the sticker comes down (a big one deeper), then Beep pats it twice.
      const big = SIZE[e.sticker] > 1
      this.hiss(this.effects, 'lowpass', [[0, big ? 2200 : 3200], [0.06, 900]], 0.7, struck(0.002, 0.08), 0.15, at)
      this.voice(this.effects, 'sine', [[0, big ? 150 : 210], [0.08, big ? 85 : 120]], struck(0.003, 0.1), 0.12, at)
      for (const dt of [0.16, 0.28]) this.voice(this.effects, 'triangle', [[0, 520], [0.03, 440]], struck(0.002, 0.04), 0.06, at + dt)
    },
    peel: (at, e) => {
      // Curl: the sticker peels off with a rising zip and comes away with a soft pop.
      const peel = this.tremolo(this.effects, 55, 0.4, at, 0.36)
      this.hiss(peel, 'bandpass', [[0, SIZE[e.sticker] > 1 ? 1000 : 1400], [0.3, 3800]], 1.5, [[0, 0], [0.04, 1], [0.3, 0.6], [0.34, 0]], 0.1, at)
      this.pop(this.effects, at + 0.34, 0.09)
    },
    lift: (at) => {
      // Fwip: the peel's first tap lifts it.
      this.hiss(this.effects, 'bandpass', [[0, 700], [0.15, 2600]], 1.2, [[0, 0], [0.05, 1], [0.18, 0]], 0.08, at)
      this.voice(this.effects, 'sine', [[0, 400], [0.15, 800]], struck(0.01, 0.17), 0.05, at)
    },
    nope: (at) => this.boing(this.effects, at, 0.09),
    oops: (at) => {
      // Rewind: a glide back down, and the ticks of the edit curling back.
      this.voice(this.effects, 'triangle', [[0, hz(84)], [0.35, hz(65)]], [[0, 0], [0.02, 1], [0.3, 0.7], [0.38, 0]], 0.07, at)
      for (let i = 0; i < 4; i++) this.tick(this.effects, hz(penta(12 - 2 * i)), 0.05, at + 0.05 + i * 0.07)
    },
    pattern: (at, e) => {
      // A shuffle through the patterns and a bell for the one she gets.
      for (const dt of [0, 0.05]) this.hiss(this.effects, 'bandpass', [[0, 2400]], 1.5, struck(0.004, 0.05), 0.06, at + dt)
      this.bell(this.effects, GLOCK, hz(penta(10 + (e.pattern % 5))), at + 0.1, 0.5, 0.08)
    },
    batch: (at, e, s) => {
      const kind = kindOf(s, e.id)
      if (!isMaker(kind) && kind !== 'lab') throw new Error(`a ${kind} started a batch`)
      this.machineVoices[kind](at)
    },
    push: (at, e) => this.pushVoices[e.thing](at),
    gulp: (at, e) => {
      // Gulp: a soft swallow, a raw lump lower than a made thing.
      const f = e.thing === 'bubble' ? 620 : isShiny(e.thing) ? 540 : 400
      this.voice(this.sprinkle, 'sine', [[0, f], [0.07, f / 2]], struck(0.004, 0.09), 0.04, at)
    },
    drink: (at, e) => {
      // The lab drinks: a slurp and a star lighting in the dome.
      this.voice(this.filter('lowpass', 1200, 1, this.sprinkle), 'triangle', [[0, 300], [0.12, 520]], [[0, 0], [0.03, 1], [0.15, 0]], 0.05, at)
      this.bell(this.sprinkle, GLOCK, hz(e.bottle === 'greenBottle' ? 96 : 98), at + 0.12, 0.4, 0.03)
    },
    fill: (at, e, s) => {
      // Tunk, into the rocket, and a bell a step higher the fuller the part, like a jar filling.
      const full = s.rocket.got[PARTS.indexOf(e.part)]! / PART_INFO[e.part].n
      this.voice(this.effects, 'sine', [[0, 200], [0.06, 140]], struck(0.003, 0.08), 0.08, at)
      this.bell(this.effects, BELL, hz(penta(5 + Math.min(9, Math.floor(full * 10)))), at + 0.03, 0.5, 0.07)
    },
    partFull: (at) => {
      // A rocket part pops on: ta-da-da-DAA on a toy brass over a soft drum, bells on the last note.
      this.fanfare(at, [
        [0, 77, 0.1],
        [0.12, 81, 0.1],
        [0.24, 84, 0.1],
        [0.38, 89, 0.6],
      ])
      ;[89, 93, 96].forEach((m, i) => this.bell(this.effects, GLOCK, hz(m), at + 0.38 + i * 0.06, 0.6, 0.14 - i * 0.03))
      this.drum(this.effects, hz(41), 0.1, 0.4, at + 0.38)
      this.dip(at, 1.2)
    },
    card: (at) => {
      // The discovery chime: bells climbing the pentatonic to a warm chord, and a sparkle.
      for (let i = 0; i < 6; i++) this.bell(this.effects, BELL, hz(penta(5 + i)), at + i * 0.08, 0.7, 0.13)
      for (const m of [77, 81, 84]) this.bell(this.effects, BELL, hz(m), at + 0.5, 1.4, 0.05)
      this.bell(this.effects, GLOCK, hz(101), at + 0.62, 0.7, 0.05)
      this.hiss(this.effects, 'highpass', [[0, 6000]], 0.7, [[0, 0], [0.15, 1], [0.7, 0]], 0.02, at + 0.5)
      this.dip(at, 2)
    },
    cardClosed: (at) => this.uiVoices.close(at),
    carry: (at) => {
      // Beep flies it over: a whirr of the propeller in a soft whoosh, and a bip.
      const prop = this.tremolo(this.effects, 24, 0.4, at, 0.36)
      this.hiss(prop, 'bandpass', [[0, 900], [0.3, 1600]], 1, [[0, 0], [0.08, 1], [0.35, 0]], 0.07, at)
      this.voice(this.effects, 'sine', [[0, hz(89)]], held(0.005, 0.06), 0.03, at + 0.05)
    },
    warn: (at) => {
      // The mound wobbles: boing boing over a soft ba-dum on a warm drum, cheeky and never a growl.
      this.boing(this.effects, at, 0.08)
      this.boing(this.effects, at + 0.45, 0.08)
      for (const [dt, f] of [
        [0, 196],
        [0.15, 147],
        [0.9, 196],
        [1.05, 147],
      ] as const)
        this.drum(this.effects, f, 0.07, 0.18, at + dt)
    },
    hopOut: (at) => this.voice(this.effects, 'sine', [[0, 350], [0.08, 700]], struck(0.004, 0.12), 0.06, at),
    nom: (at) => {
      // Nom nom: two soft munches through a little mouth.
      const mouth = this.filter('lowpass', 900, 1, this.effects)
      for (const dt of [0, 0.22]) {
        this.hiss(mouth, 'lowpass', [[0, 1200]], 0.8, struck(0.006, 0.08), 0.06, at + dt)
        this.voice(mouth, 'triangle', [[0, 330], [0.08, 220]], struck(0.006, 0.1), 0.07, at + dt)
      }
    },
    napStart: (at) => {
      // A big sleepy yawn and the first soft snore.
      this.yawn(at, 0.035)
      const zz = this.tremolo(this.effects, 5, 0.4, at + 1, 0.8)
      this.hiss(zz, 'bandpass', [[0, 600]], 2, [[0, 0], [0.3, 1], [0.8, 0]], 0.03, at + 1)
    },
    napEnd: (at) => {
      // Mm-hm: a stretch up.
      this.voice(this.filter('lowpass', 1100, 1, this.effects), 'triangle', [[0, 300], [0.25, 460]], [[0, 0], [0.05, 1], [0.25, 0.7], [0.32, 0]], 0.05, at)
    },
    burp: (at) => {
      // Burrp: soft and funny, low through a little throat with a wobble.
      const throat = this.filter('lowpass', 700, 2, this.effects)
      const o = this.voice(throat, 'sawtooth', [[0, 120], [0.1, 100], [0.3, 82]], [[0, 0], [0.03, 1], [0.25, 0.6], [0.32, 0]], 0.08, at)
      this.wobble([o.frequency], 18, [[0, 10]], at, 0.32)
    },
    home: (at, e) => this.homeVoices[e.why](at),
    heap: (at, e) => this.voice(this.effects, 'sine', [[0, isShiny(e.thing) ? 500 : 320], [0.06, 180]], struck(0.003, 0.09), 0.07, at),
    caught: (at) => {
      // Boop: the finger catches it, and it squeaks a tiny eep.
      this.voice(this.effects, 'sine', [[0, 600], [0.05, 900]], struck(0.003, 0.08), 0.1, at)
      this.voice(this.effects, 'sine', [[0, 1500], [0.06, 1900]], struck(0.004, 0.08), 0.05, at + 0.05)
    },
    giggle: (at) => this.giggle(at, 4, 0.07),
    sneeze: (at) => {
      // Ah... ah... CHOO: two breaths in, rising, then a soft sneeze and a little sniff.
      for (const [dt, f] of [
        [0, 700],
        [0.28, 900],
      ] as const)
        this.hiss(this.effects, 'bandpass', [[0, f], [0.2, f * 1.4]], 1.5, [[0, 0], [0.15, 1], [0.22, 0]], 0.05, at + dt)
      this.hiss(this.effects, 'bandpass', [[0, 2600], [0.25, 900]], 1, [[0, 0], [0.01, 1], [0.3, 0]], 0.1, at + 0.55)
      this.voice(this.filter('lowpass', 1500, 1, this.effects), 'triangle', [[0, 700], [0.2, 260]], struck(0.008, 0.25), 0.06, at + 0.55)
      this.hiss(this.effects, 'highpass', [[0, 3000]], 0.7, struck(0.01, 0.06), 0.03, at + 0.95)
    },
    shot: (at) => {
      // Pfft: the wand puffs its suds, with a bubble's blip.
      this.hiss(this.effects, 'bandpass', [[0, 1600], [0.15, 900]], 1, [[0, 0], [0.02, 1], [0.18, 0]], 0.08, at)
      this.bloop(this.effects, at + 0.05, 0.05)
    },
    suds: (at) => {
      // Splish: the suds land on its nose in a fizz of bubbles.
      this.hiss(this.effects, 'highpass', [[0, 3000]], 0.7, [[0, 0], [0.03, 1], [0.35, 0]], 0.05, at)
      this.bubbles(at + 0.05, 4, 0.06)
    },
    picnic: (at) => {
      // Mmm! A happy hum, a soft nom and the bowl's twinkle.
      this.voice(this.filter('lowpass', 1200, 1, this.effects), 'triangle', [[0, hz(77)], [0.25, hz(81)]], held(0.04, 0.4), 0.07, at)
      this.voice(this.effects, 'triangle', [[0, 330], [0.08, 220]], struck(0.006, 0.1), 0.05, at + 0.45)
      ;[96, 101].forEach((m, i) => this.bell(this.effects, GLOCK, hz(m), at + 0.6 + i * 0.12, 0.5, 0.13))
    },
    shrug: (at) => {
      // The bowl is empty: hm-hm?
      const soft = this.filter('lowpass', 1300, 0.7, this.effects)
      this.voice(soft, 'triangle', [[0, hz(72)]], [[0, 0], [0.02, 1], [0.1, 0.8], [0.14, 0]], 0.06, at)
      this.voice(soft, 'triangle', [[0, hz(69)], [0.12, hz(74)]], [[0, 0], [0.02, 1], [0.14, 0.7], [0.2, 0]], 0.06, at + 0.18)
    },
    friend: (at) => {
      // A friend: a warm chord, a heart of sparkles rising, and an "aww".
      for (const m of [65, 69, 72, 77]) this.bell(this.effects, BELL, hz(m), at, 1.6, 0.07)
      ;[89, 93, 96, 101].forEach((m, i) => this.bell(this.effects, GLOCK, hz(m), at + 0.2 + i * 0.08, 0.6, 0.14 - i * 0.02))
      this.voice(this.effects, 'sine', [[0, 600], [0.2, 820], [0.5, 650]], [[0, 0], [0.08, 1], [0.4, 0.6], [0.55, 0]], 0.06, at + 0.15)
      this.dip(at, 1.4)
    },
    nibble: (at) => {
      // A leafy bite into the hedge.
      this.hiss(this.effects, 'bandpass', [[0, 2400]], 1.5, struck(0.003, 0.06), 0.06, at)
      this.voice(this.effects, 'triangle', [[0, 260], [0.05, 200]], struck(0.004, 0.06), 0.04, at)
    },
    crunch: (at) => {
      // Crunch: a crisp bite, grains of leaf breaking, and a chew.
      ;[0, 0.025, 0.06, 0.09, 0.13].forEach((dt, i) => this.hiss(this.effects, 'bandpass', [[0, 3600 - i * 250]], 2, struck(0.002, 0.03), 0.07, at + dt))
      this.voice(this.filter('lowpass', 800, 1, this.effects), 'triangle', [[0, 240], [0.1, 170]], struck(0.006, 0.12), 0.05, at + 0.05)
    },
    regrow: (at) => {
      // A sprout: a shimmer up and a note growing.
      this.hiss(this.effects, 'bandpass', [[0, 1500], [0.5, 4000]], 2, [[0, 0], [0.2, 1], [0.5, 0]], 0.03, at)
      this.voice(this.effects, 'sine', [[0, hz(77)], [0.3, hz(89)]], struck(0.02, 0.4), 0.05, at)
    },
    visitOver: (at) => {
      // Everyone is home: two soft bells, all clear.
      this.bell(this.effects, BELL, hz(84), at, 0.8, 0.06)
      this.bell(this.effects, BELL, hz(89), at + 0.22, 1.1, 0.06)
    },
    launch: (at) => {
      // Beep climbs into the window, bloop bloop bloop, and the hatch closes.
      for (let i = 0; i < 3; i++) this.bloop(this.effects, at + i * 0.22, 0.09)
      this.voice(this.effects, 'triangle', [[0, 220], [0.06, 150]], struck(0.003, 0.1), 0.1, at + 0.75)
    },
    count: (at, e) => {
      // The countdown: a warm drum and a bell a step higher for each number, from 5 to 1.
      this.drum(this.effects, hz(41), 0.12, 0.4, at)
      this.bell(this.effects, BELL, hz(penta(5 + 5 - e.n)), at, 0.8, 0.12)
    },
    liftoff: (at) => {
      // Up it goes: a soft rumble swelling, a whistle climbing away, and rainbow puffs sparkling. Never a bang.
      this.hiss(this.effects, 'lowpass', [[0, 250], [1.5, 900]], 0.7, [[0, 0], [0.4, 1], [1.6, 0.6], [2.4, 0]], 0.1, at)
      this.voice(this.effects, 'sine', [[0, 300], [2, 1400]], [[0, 0], [0.3, 1], [2.2, 0]], 0.05, at)
      for (let i = 0; i < 8; i++) this.bell(this.effects, GLOCK, hz(penta(8 + i)), at + 0.5 + i * 0.15, 0.4, 0.05)
    },
    landed: (at) => {
      // Home with Moony: a fanfare, and Moony's "oo-wee" hello.
      this.fanfare(at, [
        [0, 84, 0.1],
        [0.12, 86, 0.1],
        [0.24, 89, 0.3],
        [0.56, 86, 0.1],
        [0.68, 89, 0.7],
      ])
      ;[93, 96, 101].forEach((m, i) => this.bell(this.effects, GLOCK, hz(m), at + 0.68 + i * 0.07, 0.6, 0.14 - i * 0.03))
      const o = this.voice(this.effects, 'sine', [[0, 520], [0.15, 780], [0.4, 1040]], [[0, 0], [0.05, 1], [0.35, 0.7], [0.45, 0]], 0.07, at + 1.4)
      this.wobble([o.frequency], 7, [[0, 20]], at + 1.4, 0.45)
      this.dip(at, 2)
    },
    poke: (at, e) => this.pokeVoices[e.what](at),
    recipe: (at) => {
      // The recipe bubble pops up.
      this.bloop(this.effects, at, 0.08)
      this.bell(this.effects, GLOCK, hz(penta(13)), at + 0.08, 0.3, 0.04)
    },
    tickleBusy: (at) => this.giggle(at, 1, 0.06),
    goodnight: (at) => {
      // Evening falls: bells stepping slowly down over a soft low pad. The lullaby waits NIGHT_LEAD for this.
      ;[84, 81, 77, 72].forEach((m, i) => this.bell(this.effects, BELL, hz(m), at + i * 0.3, i === 3 ? 1.0 : 0.8, 0.055))
      for (const m of [53, 60]) this.voice(this.effects, 'triangle', [[0, hz(m)]], held(0.4, 1.8), 0.03, at)
    },
    tuck: (at, e) => {
      // Shh: a breath, and a tine a step lower for each kind tucked in.
      this.hiss(this.effects, 'bandpass', [[0, 1800], [0.5, 900]], 0.8, [[0, 0], [0.15, 1], [0.6, 0]], 0.03, at)
      this.bell(this.effects, TINE, hz(TUCK[e.machine]), at + 0.2, 1, 0.07)
    },
    sleep: (at) => {
      // The factory is asleep: three music box notes down, the last one ringing.
      ;[81, 79, 77].forEach((m, i) => this.bell(this.effects, TINE, hz(m), at + i * 0.4, i === 2 ? 2 : 0.9, 0.08))
    },
    wake: (at) => {
      // Morning: bells up, and a bird.
      ;[77, 81, 84, 89].forEach((m, i) => this.bell(this.effects, BELL, hz(m), at + i * 0.1, 0.6, 0.07))
      for (const dt of [0.5, 0.6]) this.voice(this.effects, 'sine', [[0, 2600], [0.05, 3400]], struck(0.003, 0.06), 0.03, at + dt)
    },
    session: (at) => {
      // Beep wakes with a stretch: a rising hum, its chirp, and a bell.
      this.voice(this.filter('lowpass', 1500, 1, this.effects), 'triangle', [[0, 220], [0.5, 440]], [[0, 0], [0.1, 1], [0.45, 0.7], [0.55, 0]], 0.05, at)
      this.chirp(at + 0.55)
      this.bell(this.effects, BELL, hz(89), at + 0.85, 0.8, 0.06)
    },
    tool: (at) => this.uiVoices.pick(at),
  }

  /** Each machine's batch, in its own small voice into the sprinkle: a busy factory glitters under the band, never a din. */
  private readonly machineVoices: Record<Maker | 'lab', (at: number) => void> = {
    digger: (at) => {
      // Brrt: the drill bites.
      const shake = this.tremolo(this.sprinkle, 30, 0.45, at, 0.2)
      this.voice(this.filter('lowpass', 900, 0.7, shake), 'sawtooth', [[0, 90], [0.18, 110]], held(0.01, 0.18), 0.04, at)
    },
    oven: (at) => {
      // Fwoomp: the kiln's fire takes, soft and warm.
      this.hiss(this.sprinkle, 'lowpass', [[0, 300], [0.15, 900], [0.4, 400]], 0.7, [[0, 0], [0.08, 1], [0.4, 0]], 0.06, at)
      this.voice(this.sprinkle, 'sine', [[0, 90], [0.15, 120], [0.3, 80]], [[0, 0], [0.06, 1], [0.3, 0]], 0.04, at)
    },
    workshop: (at) => {
      // Clack clack: the gear press.
      for (const dt of [0, 0.07]) this.voice(this.sprinkle, 'triangle', [[0, 600], [0.03, 450]], struck(0.002, 0.04), 0.04, at + dt)
    },
    greenMaker: (at) => {
      // Blub blub blub: the green fizz mixing.
      ;[0, 0.09, 0.17].forEach((dt, i) => this.voice(this.sprinkle, 'sine', [[0, 260 + i * 40], [0.05, 520 + i * 60]], struck(0.004, 0.06), 0.04, at + dt))
    },
    orangeMaker: (at) => {
      // Fizz, and a sparkle of the star cork.
      this.hiss(this.sprinkle, 'highpass', [[0, 4000]], 0.7, [[0, 0], [0.05, 1], [0.35, 0]], 0.03, at)
      this.bell(this.sprinkle, GLOCK, hz(penta(14)), at + 0.05, 0.3, 0.025)
    },
    pump: (at) => this.voice(this.sprinkle, 'sine', [[0, 180], [0.06, 300], [0.12, 160]], struck(0.005, 0.14), 0.05, at),
    lab: (at) => this.bell(this.sprinkle, GLOCK, hz(penta(13)), at, 0.3, 0.025),
  }

  /** A made thing popping out of its machine into the sprinkle, by the thing: rocks tok, bars clink, a gear clicks, bottles ding. */
  private readonly pushVoices: Record<Thing, (at: number) => void> = {
    blueRock: (at) => this.voice(this.sprinkle, 'triangle', [[0, 330], [0.05, 240]], struck(0.002, 0.06), 0.045, at),
    goldRock: (at) => this.voice(this.sprinkle, 'triangle', [[0, 380], [0.05, 280]], struck(0.002, 0.06), 0.045, at),
    bubble: (at) => this.bloop(this.sprinkle, at, 0.04),
    blueBar: (at) => this.bell(this.sprinkle, GLOCK, 1800, at, 0.15, 0.03),
    goldBar: (at) => this.bell(this.sprinkle, GLOCK, 2100, at, 0.15, 0.03),
    gear: (at) => {
      for (const dt of [0, 0.05]) this.voice(this.sprinkle, 'triangle', [[0, 1400]], struck(0.001, 0.02), 0.035, at + dt)
    },
    greenBottle: (at) => this.bell(this.sprinkle, BELL, hz(penta(13)), at, 0.5, 0.045),
    orangeBottle: (at) => this.bell(this.sprinkle, BELL, hz(penta(14)), at, 0.5, 0.045),
  }

  /** A muncher turning home, by why: a hop away full, a wave, a giggly hop, a float in suds, a happy la-la, a soft bye, a yawn. */
  private readonly homeVoices: Record<HomeWhy, (at: number) => void> = {
    full: (at) => [0.06, 0.045, 0.03].forEach((v, i) => this.voice(this.effects, 'sine', [[0, 300], [0.08, 600]], struck(0.004, 0.12), v, at + i * 0.3)),
    nothing: (at) => {
      const soft = this.filter('lowpass', 1300, 0.7, this.effects)
      this.voice(soft, 'triangle', [[0, hz(84)]], held(0.02, 0.18), 0.06, at)
      this.voice(soft, 'triangle', [[0, hz(81)]], held(0.02, 0.3), 0.06, at + 0.22)
    },
    tickled: (at) => {
      for (const dt of [0, 0.15]) this.voice(this.effects, 'sine', [[0, 420], [0.07, 840]], struck(0.004, 0.1), 0.05, at + dt)
    },
    sudsed: (at) => this.bubbles(at, 5, 0.05),
    fed: (at) => {
      const soft = this.filter('lowpass', 1300, 0.7, this.effects)
      this.voice(soft, 'triangle', [[0, hz(81)]], held(0.02, 0.18), 0.06, at)
      this.voice(soft, 'triangle', [[0, hz(84)]], held(0.02, 0.3), 0.06, at + 0.22)
    },
    late: (at) => this.voice(this.filter('lowpass', 1300, 0.7, this.effects), 'triangle', [[0, hz(79)], [0.25, hz(74)]], held(0.02, 0.3), 0.05, at),
    night: (at) => this.yawn(at, 0.03),
  }

  /** A tap's answer where nothing else happens. */
  private readonly pokeVoices: Record<Poke, (at: number) => void> = {
    tree: (at) => {
      // The tree shakes and a leaf drops.
      this.hiss(this.effects, 'bandpass', [[0, 3000]], 1, [[0, 0], [0.05, 1], [0.3, 0]], 0.07, at)
      this.bell(this.effects, GLOCK, hz(penta(14)), at + 0.25, 0.3, 0.03)
    },
    flowers: (at) => {
      // The flowers sway: two glassy notes.
      this.bell(this.effects, GLOCK, hz(penta(12)), at, 0.4, 0.06)
      this.bell(this.effects, GLOCK, hz(penta(14)), at + 0.12, 0.4, 0.05)
    },
    ground: (at) => this.hiss(this.effects, 'lowpass', [[0, 700], [0.2, 300]], 0.7, struck(0.01, 0.2), 0.09, at),
    belt: (at) => {
      // The empty belt's chevrons hop: tick tick.
      this.tick(this.effects, hz(89), 0.06, at)
      this.tick(this.effects, hz(93), 0.06, at + 0.1)
    },
    burrow: (at) => {
      // Mm? A sleepy face peeks out and waves.
      this.voice(this.filter('lowpass', 900, 1, this.effects), 'triangle', [[0, 220], [0.25, 300]], held(0.05, 0.35), 0.05, at)
    },
    beep: (at) => this.chirp(at),
    moony: (at) => {
      // Moony's warble.
      const o = this.voice(this.effects, 'sine', [[0, 620], [0.2, 930]], [[0, 0], [0.04, 1], [0.25, 0.7], [0.32, 0]], 0.07, at)
      this.wobble([o.frequency], 8, [[0, 25]], at, 0.32)
    },
    grey: (at) => {
      // The lab card wiggles: wub wub.
      const wub = this.tremolo(this.effects, 8, 0.4, at, 0.32)
      this.voice(this.filter('lowpass', 900, 1, wub), 'triangle', [[0, 300]], held(0.02, 0.3), 0.06, at)
    },
  }

  /** The HUD's sounds. */
  private readonly uiVoices: Record<UiSound, (at: number) => void> = {
    tap: (at) => this.click(at),
    open: (at) => {
      // A card opens: a breath up and a bell.
      this.hiss(this.effects, 'bandpass', [[0, 500], [0.35, 2000]], 1.2, [[0, 0], [0.1, 1], [0.35, 0]], 0.03, at)
      this.bell(this.effects, BELL, hz(89), at + 0.05, 0.5, 0.04)
    },
    close: (at) => {
      // And closes: a breath down and a lower bell.
      this.hiss(this.effects, 'bandpass', [[0, 2000], [0.3, 500]], 1.2, [[0, 0], [0.05, 1], [0.3, 0]], 0.03, at)
      this.bell(this.effects, BELL, hz(84), at + 0.03, 0.4, 0.035)
    },
    hold: (at) => {
      // The parent gate filling up: a tone and its fifth rising for HOLD_FOR, swelling. Its own fader cuts it short.
      this.holding = this.gain(1, this.effects)
      const swell: Curve = [
        [0, 0],
        [0.2, 0.6],
        [HOLD_FOR - 0.2, 1],
        [HOLD_FOR, 0],
      ]
      this.voice(this.holding, 'sine', [[0, hz(65)], [HOLD_FOR, hz(84)]], swell, 0.045, at)
      this.voice(this.holding, 'sine', [[0, hz(72)], [HOLD_FOR, hz(91)]], swell, 0.015, at)
    },
    fresh: (at) => {
      // Done: an open bell chord and a sparkle on top.
      this.bell(this.effects, BELL, hz(77), at, 1.2, 0.08)
      this.bell(this.effects, BELL, hz(84), at, 1.2, 0.06)
      this.bell(this.effects, GLOCK, hz(101), at + 0.15, 0.6, 0.05)
    },
    pick: (at) => {
      this.bell(this.effects, GLOCK, hz(93), at, 0.25, 0.06)
      this.click(at)
    },
    // Beep murmurs in its sleep and turns over: a small sleepy yawn, softer than the night's.
    murmur: (at) => this.yawn(at, 0.018),
  }

  /**
   * The band's instruments, a note each, at the note's velocity. Their levels inside the music
   * bus keep the tune (the bell) and the pad's drum on top, the shaker and the tick under
   * everything.
   */
  private readonly instruments: Record<Instrument, (out: AudioNode, n: Note, at: number) => void> = {
    tick: (out, n, at) => this.voice(out, 'sine', [[0, hz(n.midi)]], struck(0.001, 0.02), 0.025 * n.vel, at),
    shaker: (out, n, at) => this.hiss(out, 'highpass', [[0, 7000]], 0.7, struck(0.004, 0.05), 0.03 * n.vel, at),
    bass: (out, n, at) => {
      // A soft round bass: a triangle, with a quiet square for small speakers that cannot play the low notes themselves.
      const dur = n.len * EIGHTH * 0.9
      this.voice(out, 'triangle', [[0, hz(n.midi)]], held(0.012, dur), 0.06 * n.vel, at)
      this.voice(out, 'square', [[0, hz(n.midi)]], held(0.012, dur), 0.012 * n.vel, at)
    },
    woodblock: (out, n, at) => {
      const f = hz(n.midi)
      this.voice(out, 'sine', [[0, f * 1.5], [0.01, f]], struck(0.002, 0.08), 0.06 * n.vel, at)
      this.voice(out, 'triangle', [[0, f * 2.7]], struck(0.001, 0.025), 0.015 * n.vel, at)
    },
    bell: (out, n, at) => this.bell(out, BELL, hz(n.midi), at, Math.max(n.len * EIGHTH * 1.5, 0.9), 0.07 * n.vel),
    chimes: (out, n, at) => this.bell(out, CHIME, hz(n.midi), at, 2.4, 0.045 * n.vel),
    pluck: (out, n, at) => {
      // A plucked string: bright at first, its tone closing as it rings.
      const body = this.ctx.createBiquadFilter()
      body.type = 'lowpass'
      body.Q.value = 0.7
      glide(body.frequency, [[0, 2600], [0.5, 600]], at, 1)
      body.connect(out)
      this.voice(body, 'sawtooth', [[0, hz(n.midi)]], plucked(0.6), 0.03 * n.vel, at)
      this.voice(out, 'triangle', [[0, hz(n.midi)]], plucked(0.6), 0.04 * n.vel, at)
    },
    glock: (out, n, at) => this.bell(out, GLOCK, hz(n.midi), at, 0.8, 0.05 * n.vel),
    drum: (out, n, at) => this.drum(out, hz(n.midi), 0.12 * n.vel, n.midi < 48 ? 0.45 : 0.25, at),
    pizzicato: (out, n, at) => {
      // A cheeky pizzicato: a short plucked string, a hair flat at first, bright enough to come through a tablet's speaker (its line is low, so most of what she hears is its overtones).
      const f = hz(n.midi)
      const body = this.filter('lowpass', 3000, 0.8, out)
      this.voice(body, 'sawtooth', [[0, f * 0.98], [0.02, f]], plucked(0.24), 0.115 * n.vel, at)
      this.voice(out, 'triangle', [[0, f * 0.98], [0.02, f]], plucked(0.24), 0.16 * n.vel, at)
    },
    box: (out, n, at) => this.bell(out, TINE, hz(n.midi), at, Math.max(n.len * EIGHTH, 1.5), 0.06 * n.vel),
    roll: (out, n, at) => {
      // A soft snare roll: four strokes an eighth, every other one a touch lighter.
      for (let i = 0; i < 4; i++) this.hiss(out, 'bandpass', [[0, 2400]], 1.2, struck(0.002, 0.06), 0.05 * n.vel * (i % 2 === 0 ? 1 : 0.75), at + (i * EIGHTH) / 4)
    },
  }

  /** A napping muncher's kazoo of its machine's line: a buzz through a wide nasal mouth, wobbling as it hums, as loud as the line it replaces, so she hears across the room which machine the muncher sleeps on. */
  private kazoo(out: AudioNode, n: Note, at: number) {
    const f = hz(n.midi)
    const dur = Math.max(n.len * EIGHTH * 0.85, 0.12)
    const mouth = this.filter('bandpass', 1300, 1.5, out)
    const buzz = this.voice(mouth, 'sawtooth', [[0, f]], held(0.02, dur), 0.13 * n.vel, at)
    const reed = this.voice(out, 'square', [[0, f * 1.005]], held(0.02, dur), 0.015 * n.vel, at)
    this.wobble([buzz.frequency, reed.frequency], 6, [[0, f * 0.02]], at, dur)
  }

  /** A soft click. */
  private click(at: number) {
    this.voice(this.effects, 'sine', [[0, 1500], [0.03, 1000]], struck(0.002, 0.04), 0.14, at)
  }

  /** A stroke's tick: a pitched pop. */
  private tick(out: AudioNode, f: number, vol: number, at: number) {
    this.voice(out, 'sine', [[0, f * 1.4], [0.012, f]], struck(0.002, 0.045), vol, at)
  }

  /** A soft springy boing. */
  private boing(out: AudioNode, at: number, vol: number) {
    const o = this.voice(out, 'sine', [[0, 260], [0.06, 520], [0.4, 380]], struck(0.004, 0.4), vol, at)
    this.wobble([o.frequency], 11, [[0, 40], [0.4, 4]], at, 0.4)
  }

  /** A bubble's bloop. */
  private bloop(out: AudioNode, at: number, vol: number) {
    this.voice(out, 'sine', [[0, 280], [0.08, 640]], struck(0.004, 0.1), vol, at)
  }

  /** A soft pop, never a bang. */
  private pop(out: AudioNode, at: number, vol: number) {
    this.voice(out, 'sine', [[0, 900], [0.04, 300]], struck(0.002, 0.05), vol, at)
    this.hiss(out, 'highpass', [[0, 2500]], 0.7, struck(0.002, 0.02), vol * 0.4, at)
  }

  /** A few bubbles coming up, each a blip higher. */
  private bubbles(at: number, n: number, vol: number) {
    for (let i = 0; i < n; i++) this.voice(this.effects, 'sine', [[0, 420 + i * 90], [0.05, 900 + i * 150]], struck(0.003, 0.06), vol, at + i * 0.08)
  }

  /** Hee hee: `n` little rising laughs through a small mouth. */
  private giggle(at: number, n: number, vol: number) {
    const mouth = this.filter('bandpass', 1700, 1.5, this.effects)
    ;[600, 690, 640, 730].slice(0, n).forEach((f, i) => {
      const path: Curve = [
        [0, f],
        [0.06, f * 1.12],
      ]
      this.voice(mouth, 'triangle', path, struck(0.008, 0.08), vol, at + i * 0.1)
      this.voice(this.effects, 'sine', path, struck(0.008, 0.08), vol * 0.6, at + i * 0.1)
    })
  }

  /** A big sleepy yawn: the mouth opens wide and closes. */
  private yawn(at: number, vol: number) {
    const mouth = this.filter('lowpass', 500, 1, this.effects)
    glide(mouth.frequency, [[0, 500], [0.4, 1400], [1, 450]], at, 1)
    const pitch: Curve = [
      [0, 300],
      [0.35, 440],
      [1, 220],
    ]
    const level: Curve = [
      [0, 0],
      [0.15, 1],
      [0.75, 0.7],
      [1.05, 0],
    ]
    this.voice(mouth, 'triangle', pitch, level, vol, at)
    this.voice(this.effects, 'sine', pitch, level, vol * 0.5, at)
  }

  /** A warm felt drum at `f` Hz: a falling sine with a little knock for small speakers, round and never a boom. */
  private drum(out: AudioNode, f: number, vol: number, dur: number, at: number) {
    this.voice(out, 'sine', [[0, f * 2], [0.05, f * 1.1], [dur, f]], struck(0.006, dur), vol, at)
    this.voice(out, 'triangle', [[0, f * 4], [0.03, f * 2]], struck(0.003, 0.06), vol * 0.3, at)
  }

  /** A toy brass fanfare: [seconds in, MIDI, seconds long] notes on a filtered square over a triangle an octave down. */
  private fanfare(at: number, tune: readonly (readonly [number, number, number])[]) {
    const brass = this.filter('lowpass', 2400, 0.7, this.effects)
    for (const [dt, m, len] of tune) {
      this.voice(brass, 'square', [[0, hz(m)]], held(0.008, len), 0.05, at + dt)
      this.voice(this.effects, 'triangle', [[0, hz(m - 12)]], held(0.008, len), 0.06, at + dt)
    }
  }

  /** One oscillator, its pitch along `pitch` (Hz) and its level along `level` times `vol`, into `out` from `at` until the level ends. */
  private voice(out: AudioNode, wave: Wave, pitch: Curve, level: Curve, vol: number, at: number): OscillatorNode {
    const osc = this.ctx.createOscillator()
    osc.type = wave
    glide(osc.frequency, pitch, at, 1)
    const env = this.ctx.createGain()
    glide(env.gain, level, at, vol)
    osc.connect(env).connect(out)
    osc.start(at)
    osc.stop(at + level[level.length - 1]![0] + 0.02)
    return osc
  }

  /** A stretch of the white noise through one filter, its cutoff along `freq` and its level along `level` times `vol`. Returns the filter, for a sound that moves it more. */
  private hiss(out: AudioNode, type: BiquadFilterType, freq: Curve, q: number, level: Curve, vol: number, at: number): BiquadFilterNode {
    const src = this.ctx.createBufferSource()
    src.buffer = this.white
    src.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.Q.value = q
    glide(filter.frequency, freq, at, 1)
    const env = this.ctx.createGain()
    glide(env.gain, level, at, vol)
    src.connect(filter).connect(env).connect(out)
    // Each hiss starts somewhere else in the noise, so two of them together never sound the same grain.
    this.grain = (this.grain + 0.618) % 1.5
    src.start(at, this.grain)
    src.stop(at + level[level.length - 1]![0] + 0.02)
    return filter
  }

  /** A struck bell, tine, bar or tube: a sine per partial, the higher ones dying sooner. */
  private bell(out: AudioNode, partials: Partials, f: number, at: number, dur: number, vol: number) {
    partials.forEach(([ratio, level], i) => this.voice(out, 'sine', [[0, f * ratio]], struck(0.002, dur / (1 + i)), vol * level, at))
  }

  /** Wobbles these params `rate` times a second by the depth along `depth`, from `at` for `dur`. */
  private wobble(params: readonly AudioParam[], rate: number, depth: Curve, at: number, dur: number) {
    const lfo = this.ctx.createOscillator()
    lfo.frequency.value = rate
    const amount = this.ctx.createGain()
    glide(amount.gain, depth, at, 1)
    lfo.connect(amount)
    for (const p of params) amount.connect(p)
    lfo.start(at)
    lfo.stop(at + dur)
  }

  /** A gain into `out` that shakes between 1 - 2 * depth and 1, `rate` times a second, from `at` for `dur`: a buzz, a zip, a propeller, a snore. */
  private tremolo(out: AudioNode, rate: number, depth: number, at: number, dur: number): GainNode {
    const g = this.gain(1 - depth, out)
    this.wobble([g.gain], rate, [[0, depth]], at, dur)
    return g
  }

  /** A fixed filter into `out`. */
  private filter(type: BiquadFilterType, freq: number, q: number, out: AudioNode) {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    f.connect(out)
    return f
  }

  /** A fixed gain into `out`. */
  private gain(value: number, out: AudioNode) {
    const g = this.ctx.createGain()
    g.gain.value = value
    g.connect(out)
    return g
  }
}

// ---------------------------------------------------------------------------------------
// The game's sounds.

/** Machine sounds: they wait for the next eighth, at most PER_EIGHTH of a kind on one. Every other event (and every sound a tap makes) plays at once. */
const ON_THE_BEAT: ReadonlySet<EventKind> = new Set<EventKind>(['batch', 'push', 'gulp', 'drink'])

/** The voice an event's sound is, the dedup's and the eighth's cap's key: a kind, or the very variant where variants sound different, so two different ones together both sound. A HUD pick and a sim pick share one, as do a HUD close and a card closing. */
function keyOf(e: SimEvent, s: State): string {
  switch (e.kind) {
    case 'batch':
      return `batch:${kindOf(s, e.id)}`
    case 'push':
    case 'gulp':
      return `${e.kind}:${e.thing}`
    case 'drink':
      return `drink:${e.bottle}`
    case 'dig':
      return `dig:${e.thing}`
    case 'home':
      return `home:${e.why}`
    case 'poke':
      return `poke:${e.what}`
    case 'count':
      return `count:${e.n}`
    case 'tuck':
      return `tuck:${e.machine}`
    case 'tool':
      return 'pick'
    case 'cardClosed':
      return 'close'
    default:
      return e.kind
  }
}

/** Beep's voice: say a word, hush, and wake it inside a gesture. */
interface Speech {
  /** The browser can speak. */
  readonly speaks: boolean
  /** Says `text`, or nothing (false) when the browser has no voice for the player's language. */
  speak(text: string): boolean
  hush(): void
  wake(): void
}

/**
 * Beep's voice: the browser's own speech (nothing to load) in the player's language, pitched
 * up like a little robot (BEEP_VOICE). Where the browser has no speech Beep has no voice: this
 * is the one place that asks, and Sounds keeps its Voice switch off there. Where it has no
 * voice for the language (the voices may also still be loading) she says nothing: another
 * language's voice never reads her words.
 */
function beepVoice(lang: Lang): Speech {
  if (typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') return { speaks: false, speak: () => false, hush() {}, wake() {} }
  const synth = speechSynthesis
  // Chrome lists its voices only a moment after it is first asked: asking now has them there by her first word.
  synth.getVoices()
  const utter = (text: string, volume: number) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = SPEECH_TAG[lang]
    u.pitch = BEEP_VOICE.pitch
    u.rate = BEEP_VOICE.rate
    u.volume = volume
    return u
  }
  return {
    speaks: true,
    speak(text) {
      // The device may speak another language by default: the voice is always the player's language's.
      const voice = pickVoice(synth.getVoices(), lang)
      if (voice === null) return false
      const u = utter(text, BEEP_VOICE.volume)
      u.voice = voice
      synth.speak(u)
      return true
    },
    hush() {
      synth.cancel()
    },
    // iOS speaks only once speech has started inside a gesture: an empty word in the first one.
    wake() {
      synth.speak(utter('', 0))
    },
  }
}

/**
 * The sounds' lifecycle. `sound` is the master switch, `music` the band's and `voice` Beep's;
 * the shell sets them from the save through setSound, setMusic and setVoice.
 *
 * Browsers make no sound before the page is touched, so nothing here makes an AudioContext or
 * speaks until the first `unlock` (called from every gesture); until then every call only
 * remembers what it was asked. `setPaused` holds the band while the pause menu is open, the
 * context running on so the menu's own sounds (the parent gate's rising tone, a switch's
 * click) play at once. `suspend` puts the context to sleep while the page is hidden, and
 * `resume` wakes it.
 *
 * Once a frame, `frame` keeps the band on the audio clock: it measures the offset between
 * the sim's tick and audio time, re-anchors after a pause, a slow frame or a drift (never
 * scheduling an eighth twice, never one in the past), and schedules every eighth due within
 * LOOKAHEAD from band.ts's parts for the state now. Then it plays the frame's events: a
 * machine's sound waits for the next eighth (at most PER_EIGHTH of a kind on one), every other
 * sound plays at once, and Beep says the words. The sim never waits for any of it.
 */
export class Sounds {
  /** The browser can speak: where it cannot, Beep has no voice and the Voice switch stays off. */
  readonly speaks: boolean
  private sound = true
  private music = true
  private voice: boolean
  private readonly speech: Speech
  private live: { ctx: AudioContext; synth: Synth } | null = null
  /** The band's fader: into the music, or with the music off into the effects. Null until the band next plays. */
  private take: GainNode | null = null
  /** The audio time of tick 0, so eighth k plays at anchor + k * EIGHTH; null to measure it again. */
  private anchor: number | null = null
  /** The next eighth to schedule. It only moves on (but for a new game), so no eighth plays twice. */
  private next = 0
  /** The tick and the audio time of the last frame: a tick going back is a new game, a clock that stood still holds the band. */
  private lastTick = 0
  private lastNow = -1
  /** Suspended by `suspend` and not resumed since: the context's own state lags behind. */
  private asleep = false
  /** The pause menu is open: the band holds. */
  private paused = false
  /** Context time each sound last played, by key. */
  private last = new Map<string, number>()
  /** The eighth the machine sounds are waiting for, and how many of each key wait for it. */
  private capEighth = -1
  private capped = new Map<string, number>()
  /** Munchers were out at the last frame: the machines' sprinkle is halved. */
  private visiting = false
  /** The audio time Beep last said a word. */
  private spokeAt = -Infinity
  private readonly lang: Lang

  /** `lang` is the player's: Beep speaks it. */
  constructor(lang: Lang) {
    this.lang = lang
    this.speech = beepVoice(lang)
    this.speaks = this.speech.speaks
    this.voice = this.speaks
  }

  /** Called from every user gesture: makes the audio context on the first (and wakes Beep's voice there), and wakes the context whenever the browser has stopped it (iOS also has 'interrupted'), unless the game itself put it to sleep. */
  unlock(): void {
    if (!this.live) {
      const ctx = new AudioContext()
      const synth = new Synth(ctx)
      synth.master.gain.value = this.sound ? MASTER : 0
      synth.music.gain.value = this.music ? MUSIC : 0
      this.live = { ctx, synth }
      this.speech.wake()
    }
    if (this.live.ctx.state !== 'running' && !this.asleep) void this.live.ctx.resume()
  }

  /** The master switch: off silences everything, the band and Beep's voice too. */
  setSound(on: boolean): void {
    if (on === this.sound) return
    this.sound = on
    if (!on) this.speech.hush()
    if (!this.live) return
    this.live.synth.master.gain.setTargetAtTime(on ? MASTER : 0, this.live.ctx.currentTime, 0.015)
    this.hush(HUSH)
  }

  /** The music's switch: off silences the music bus, and the band plays each part as one soft hit a bar on its beat instead. */
  setMusic(on: boolean): void {
    if (on === this.music) return
    this.music = on
    if (!this.live) return
    this.live.synth.music.gain.setTargetAtTime(on ? MUSIC : 0, this.live.ctx.currentTime, 0.015)
    this.hush(HUSH)
  }

  /** Beep's voice: on only where the browser can speak. */
  setVoice(on: boolean): void {
    this.voice = on && this.speaks
    if (!this.voice) this.speech.hush()
  }

  /** The pause menu opened (true) or closed: the band stops and later picks up on the next eighth, while the context keeps running for the menu's sounds. */
  setPaused(on: boolean): void {
    if (on === this.paused) return
    this.paused = on
    if (!this.live) return
    if (on) this.hush(HUSH)
    // Back from the menu: the sim stood still while the clock ran on, so the anchor is measured again.
    else this.anchor = null
  }

  /** The page hid: everything quiet at once. */
  suspend(): void {
    this.speech.hush()
    if (!this.live) return
    this.live.synth.cut(this.live.ctx.currentTime)
    this.asleep = true
    this.hush(0)
    void this.live.ctx.suspend()
  }

  /** And back. */
  resume(): void {
    if (!this.live) return
    this.asleep = false
    void this.live.ctx.resume()
  }

  /** Once a frame: the band's next eighths, then the events' sounds and Beep's words. `dt` is the frame's real seconds. */
  frame(s: State, events: readonly SimEvent[], dt: number): void {
    // Nothing plays into a sleeping context: it would all burst out on waking.
    if (!this.live || !this.sound || this.live.ctx.state !== 'running') return
    const { ctx, synth } = this.live
    const now = ctx.currentTime
    this.keepTime(s, now, dt)
    const anchor = this.anchor!
    const visiting = s.munchers.length > 0
    if (visiting !== this.visiting) {
      this.visiting = visiting
      synth.visit(visiting, now)
    }
    // The band goes on only while the audio clock does: eighths scheduled into a clock standing still would pile up and burst out.
    if (!this.paused && now > this.lastNow) {
      this.take ??= synth.take(this.music)
      const band = bandOf(s)
      for (; anchor + this.next * EIGHTH < now + LOOKAHEAD; this.next++) {
        const at = Math.max(now, anchor + this.next * EIGHTH)
        for (const n of notesAt(band, this.next, this.music)) synth.note(n, at, this.take)
      }
    }
    this.lastNow = now
    for (const e of events) {
      if (e.kind === 'say') {
        this.say(saidWords(e.word))
        continue
      }
      const word = wordOf(e, s)
      if (word !== null) this.say(word)
      const key = keyOf(e, s)
      if (!ON_THE_BEAT.has(e.kind)) {
        if (this.fresh(key, DEDUP, now)) synth.event(e, s, now)
        continue
      }
      // The next eighth on the audio clock: now, if one falls just here.
      const k = Math.ceil((now - anchor) / EIGHTH - 1e-6)
      if (k !== this.capEighth) {
        this.capEighth = k
        this.capped.clear()
      }
      const waiting = this.capped.get(key) ?? 0
      if (waiting >= PER_EIGHTH) continue
      this.capped.set(key, waiting + 1)
      synth.event(e, s, Math.max(now, anchor + k * EIGHTH))
    }
  }

  /** A HUD sound, at once; any of them ends the parent gate's rising tone. */
  ui(sound: UiSound): void {
    if (!this.live || !this.sound) return
    const now = this.live.ctx.currentTime
    this.live.synth.cut(now)
    if (this.fresh(sound, DEDUP, now)) this.live.synth.ui(sound, now)
  }

  /** Beep says `words` aloud in the player's language (a card's word, a new sticker's name, a moment's word: wordOf), with her chirp, the band dipping under it: with the sound and the Voice switch on, once the page has been touched and where the browser has a voice for the language, never the same word twice within SAY_GAP nor two words within WORD_GAP. */
  say(words: Words): void {
    if (!this.live || !this.sound || !this.voice) return
    const now = this.live.ctx.currentTime
    const text = inLang(words, this.lang)
    if (now - this.spokeAt < WORD_GAP || !this.fresh(`say:${text}`, SAY_GAP, now) || !this.speech.speak(text)) return
    this.spokeAt = now
    this.live.synth.chirp(now)
    this.live.synth.dip(now, SAY_DIP)
  }

  /** Whether the sound with `key` may play now: it did not play under `gap` seconds ago. Marks it played. */
  private fresh(key: string, gap: number, now: number): boolean {
    const last = this.last.get(key)
    if (last !== undefined && now - last < gap) return false
    this.last.set(key, now)
    return true
  }

  /**
   * Keeps the band's anchor: tick t plays at anchor + t * STEP. A new game starts the band's
   * clock again; a missing anchor (the first frame, after a pause or a switch), a slow frame
   * or a drift past DRIFT measures it again, and the band goes on from the eighth the sim is
   * at, or the next one not yet scheduled, whichever is later.
   */
  private keepTime(s: State, now: number, dt: number) {
    if (s.tick < this.lastTick) {
      this.anchor = null
      this.next = 0
    }
    this.lastTick = s.tick
    const offset = now - s.tick * STEP
    if (this.anchor === null || dt > SLOW || Math.abs(offset - this.anchor) > DRIFT) {
      this.anchor = offset
      this.next = Math.max(this.next, Math.ceil(s.tick / HOP))
    }
  }

  /** Fades the band's take out over `fade` (at once while the context sleeps) and lets the next frame measure the anchor again and start a new take. */
  private hush(fade: number) {
    const { ctx, synth } = this.live!
    if (this.take) synth.retire(this.take, ctx.currentTime, this.asleep || ctx.state !== 'running' ? 0 : fade)
    this.take = null
    this.anchor = null
  }
}
