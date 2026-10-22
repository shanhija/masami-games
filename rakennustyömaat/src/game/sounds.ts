import { ITEMS, themeItems, type ItemSound } from './items'
import { HAMMER, LOWER, type Crosser, type EventKind, type MachineId, type Material, type Part, type RoadState, type SimEvent, type State, type Theme, type Tool } from './model'
import { rng } from './random'
import { TOP } from './road'

/**
 * Every sound and tune of Cat Hat Builder, synthesised with WebAudio: nothing to load. The
 * effects bus carries the events' sounds, the items' voices and the engine's hum; the music
 * bus, quieter, carries the tunes and the rooms' loops. Both meet in the master and go on
 * through a compressor, so a pile of sounds at once is never one loud burst. Nothing
 * startles: every voice fades in over a few milliseconds, no bang has a sharp edge, and no
 * single voice goes over a fifth of full scale.
 *
 * The music follows where the child is (`pieceFor`): a calm tune on the street, a cheerful
 * one on the road, the Good night lullaby at night, and in the room view the room's own
 * gentle loop. Every melody is original, in C major over the pentatonic, so any chime of
 * the effects (all pentatonic too) fits over any of them.
 */

/** Sounds the HUD makes that are not events: a button, a card opening or closing, the parent gate's hold and its end, a wardrobe pick. */
export type UiSound = 'tap' | 'open' | 'close' | 'hold' | 'fresh' | 'pick'

/** What the music plays: a tune, a room's loop (by its theme), or nothing. */
export type TuneName = 'street' | 'road' | 'lullaby'
export type Piece = TuneName | Theme | 'none'

/** The mix: effects at full, the music well under them, both into the master. */
export const MASTER = 0.6
export const EFFECTS = 1
export const MUSIC = 0.3
/** The same sound twice within this many seconds plays once (a pile of rocks landing together is one clatter). */
export const DEDUP = 0.05
/** The horn sounds at most this often, however fast the button is hammered. */
export const HORN_GAP = 0.5
/** A pickup within this many seconds of the last chimes one pentatonic step higher; after a longer gap it starts again at the bottom. */
export const PICKUP_RUN = 0.8
/** The pickup chime's rungs (MIDI): the C major pentatonic from G5 up. */
export const PICKUP_NOTES = [79, 81, 84, 86, 88, 91, 93, 96] as const
/** The hum follows the truck this often rather than every frame, so its automation stays a short list. */
export const HUM_EVERY = 0.05
/** A theme's pick sting and the room's hello last this long; the room's loop waits for them. */
export const THEME_FOR = 1.5
/** Evening falls with a slow chime; the lullaby waits for it. */
export const GOODNIGHT_FOR = 1.8
/** The parent gate's rising tone. */
export const HOLD_FOR = 3
/** The music dips to this while a fanfare plays over it. */
const DUCK = 0.3
/** Tunes crossfade over FADE, fade to nothing over FADE_OUT (the lullaby falling asleep), and stop over HUSH when a switch turns them off. */
const FADE = 0.6
const FADE_OUT = 3
const HUSH = 0.08
/** The clock wakes every CLOCK_MS and schedules every step due within LOOKAHEAD seconds; a piece starts LEAD_IN after it is asked for. */
const CLOCK_MS = 100
const LOOKAHEAD = 0.25
const LEAD_IN = 0.05
/** The street tune picks up again from the start of the phrase (bars) it was in, so going in and out of rooms does not replay its opening over and over. */
const PHRASE = 4
/** Exponential glides never reach zero: this is silence. */
const SILENT = 0.0001

/** The frequency of a MIDI note (A4, 69, is 440 Hz). */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
/** The i-th note of the C major pentatonic counted up from C4 (MIDI). */
export const penta = (i: number) => 60 + [0, 2, 4, 7, 9][i % 5]! + 12 * Math.floor(i / 5)

/** The pickup chime's next rung after one that rang `gap` seconds ago: one higher within PICKUP_RUN (staying at the top), the bottom after a longer pause. */
export function climb(rung: number, gap: number): number {
  return gap <= PICKUP_RUN ? Math.min(rung + 1, PICKUP_NOTES.length - 1) : 0
}

/** The music for the state: the lullaby at night (nothing once the street is asleep), the road's tune on the road, a themed room's loop in the room view, the street's tune everywhere else (an empty room too). */
export function pieceFor(s: State): Piece {
  if (s.night) return s.night.doneAt >= 0 ? 'none' : 'lullaby'
  const shot = s.shot
  if (shot.kind === 'road') return 'road'
  if (shot.kind === 'room') return s.keep.plots[shot.plot]!.rooms.find((r) => r.id === shot.room)!.theme ?? 'street'
  return 'street'
}

// ---------------------------------------------------------------------------------------
// The tunes: written a bar per string, in C major over a pentatonic melody. Nothing is
// borrowed: no tune opens like a nursery rhyme, a birthday song or a famous lullaby.

/** The chords the tunes use, all in C major: the root as a pitch class and the third above it; the fifth is always 7 up. */
export const CHORDS = {
  C: { root: 0, third: 4 },
  Dm: { root: 2, third: 3 },
  F: { root: 5, third: 4 },
  G: { root: 7, third: 4 },
  Am: { root: 9, third: 3 },
} as const
export type Chord = keyof typeof CHORDS

/** One bar, ready to play: its chord, and by eighth-note slot the melody note that starts there (MIDI, 0 for none) and how many slots it lasts. */
export interface Bar {
  chord: Chord
  notes: readonly number[]
  lengths: readonly number[]
}

const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * Turns a melody written a bar per string into bars of `meter` eighth-note slots: a note
 * (C5, where C4 is MIDI 60), '-' to hold the note before (across a bar line too), or '.'
 * for silence. Throws on a bar of another length, a hold with nothing to hold, or a word
 * that is not a note.
 */
function bars(meter: number, melody: readonly string[], chords: readonly Chord[]): Bar[] {
  if (melody.length !== chords.length) throw new Error(`${melody.length} bars of melody but ${chords.length} chords`)
  const notes: number[] = []
  const lengths: number[] = []
  let held = -1
  melody.forEach((bar, b) => {
    const slots = bar.split(' ').filter((w) => w !== '')
    if (slots.length !== meter) throw new Error(`bar ${b + 1} has ${slots.length} slots, not ${meter}: ${bar}`)
    for (const w of slots) {
      if (w === '-') {
        if (held < 0) throw new Error(`bar ${b + 1}: a '-' with nothing to hold`)
        lengths[held] = lengths[held]! + 1
        notes.push(0)
        lengths.push(0)
        continue
      }
      if (w === '.') {
        held = -1
        notes.push(0)
        lengths.push(0)
        continue
      }
      const m = /^([A-G])([0-8])$/.exec(w)
      if (!m) throw new Error(`'${w}' is not a note: write a letter and an octave, like C5`)
      held = notes.length
      notes.push(PITCH[m[1]!]! + 12 * (Number(m[2]) + 1))
      lengths.push(1)
    }
  })
  return chords.map((chord, b) => ({ chord, notes: notes.slice(b * meter, b * meter + meter), lengths: lengths.slice(b * meter, b * meter + meter) }))
}

/** The lead's instrument. flute: a soft triangle with a faint octave. organ: a toy organ, a square through a lowpass over a triangle an octave down. box: a music box's tine. */
type Lead = 'flute' | 'organ' | 'box'
/** The drums. shaker: a soft shaker on the off-beats. pop: a soft kick on one and three, a hat on two and four. none: no drums. */
type Kit = 'shaker' | 'pop' | 'none'

/** A tune and its arrangement. */
export interface Score {
  /** Quarter notes a minute; the clock steps in eighths. */
  bpm: number
  /** Eighth-note slots a bar: 8 is four four, 6 is the lullaby's rocking six eight. */
  meter: 8 | 6
  bars: readonly Bar[]
  lead: Lead
  /** Per slot, the semitones above the chord's root the bass plays there (null: none), and how many slots a bass note lasts. */
  bass: readonly (number | null)[]
  bassLen: number
  kit: Kit
}

/** The street tune: A, B, A, then C coming home. A calm stroll past the houses. */
const STREET_A = bars(
  8,
  [
    'E5 -  -  G5 A5 -  G5 -',
    'E5 -  C5 -  -  -  .  .',
    'A5 -  -  C6 A5 -  G5 -',
    'G5 -  -  -  D5 -  .  .',
    'E5 -  -  G5 A5 -  C6 -',
    'E6 -  D6 -  C6 -  A5 -',
    'A5 -  -  G5 A5 -  D5 -',
    'G5 -  -  -  -  -  .  .',
  ],
  ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G'],
)
const STREET = [
  ...STREET_A,
  ...bars(
    8,
    [
      'C6 -  A5 -  C6 -  D6 -',
      'E6 -  -  -  D6 C6 A5 -',
      'C6 -  A5 -  G5 -  A5 -',
      'G5 -  -  -  D5 -  E5 -',
      'A5 -  -  E5 A5 -  C6 -',
      'A5 -  G5 -  A5 -  -  -',
      'D5 -  E5 -  A5 -  G5 -',
      'G5 -  -  -  .  .  .  .',
    ],
    ['F', 'C', 'F', 'G', 'Am', 'F', 'Dm', 'G'],
  ),
  ...STREET_A,
  ...bars(
    8,
    [
      'A5 -  -  -  G5 -  E5 -',
      'G5 -  -  -  E5 -  C5 -',
      'D5 -  -  E5 D5 -  A4 -',
      'G4 -  -  -  .  .  .  .',
      'A5 -  -  -  C6 -  A5 -',
      'G5 -  E5 -  G5 -  -  -',
      'D5 -  -  E5 G5 -  D5 -',
      'C5 -  -  -  -  -  .  .',
    ],
    ['F', 'C', 'Dm', 'G', 'F', 'C', 'G', 'C'],
  ),
]

/** The road tune: A, B, A, B with a new ending. Bouncy, the wheels going round. */
const ROAD_A = bars(
  8,
  [
    'C5 E5 G5 .  G5 .  A5 G5',
    'A5 .  C6 .  A5 .  G5 .',
    'G5 A5 G5 E5 D5 .  .  .',
    'E5 .  G5 .  C6 .  .  .',
    'C5 E5 G5 .  G5 .  A5 G5',
    'C6 .  D6 .  E6 .  C6 .',
    'D6 .  A5 .  G5 .  A5 .',
    'G5 .  .  .  D5 E5 G5 .',
  ],
  ['C', 'F', 'G', 'C', 'C', 'Am', 'Dm', 'G'],
)
const ROAD_B = [
  'A5 .  A5 C6 .  A5 G5 .',
  'G5 .  E5 G5 .  E5 C5 .',
  'A5 .  A5 C6 .  D6 C6 .',
  'D6 .  A5 .  G5 .  D5 .',
  'E5 .  A5 .  C6 .  A5 .',
  'C6 .  A5 .  G5 .  A5 .',
]
const ROAD_B_CHORDS: readonly Chord[] = ['F', 'C', 'F', 'G', 'Am', 'F', 'G', 'C']
const ROAD = [
  ...ROAD_A,
  ...bars(8, [...ROAD_B, 'G5 .  A5 G5 D5 .  E5 .', 'C5 .  .  .  .  .  G4 .'], ROAD_B_CHORDS),
  ...ROAD_A,
  ...bars(8, [...ROAD_B, 'G5 A5 D6 A5 G5 .  D5 .', 'E5 .  D5 .  C5 .  G4 .'], ROAD_B_CHORDS),
]

/** The Good night lullaby, rocking in six eight on a music box. */
const LULLABY = bars(
  6,
  [
    'C5 -  -  E5 -  G5',
    'A5 -  -  G5 -  -',
    'A5 -  -  C6 -  A5',
    'G5 -  -  E5 -  -',
    'E5 -  -  A5 -  G5',
    'A5 -  -  C6 -  -',
    'D6 -  -  A5 -  G5',
    'D5 -  -  -  -  -',
    'A5 -  -  C6 -  A5',
    'G5 -  -  E5 -  -',
    'E5 -  -  G5 -  A5',
    'G5 -  -  -  -  -',
    'A5 -  G5 A5 -  C6',
    'G5 -  -  E5 -  -',
    'D5 -  -  E5 -  D5',
    'C5 -  -  -  -  -',
  ],
  ['C', 'C', 'F', 'C', 'Am', 'F', 'G', 'G', 'Am', 'F', 'C', 'C', 'F', 'C', 'G', 'C'],
)

/** Every tune with its arrangement. */
export const TUNES: Record<TuneName, Score> = {
  /** The street: an unhurried stroll on a soft flute, a walking bass and a shaker. */
  street: { bpm: 88, meter: 8, bars: STREET, lead: 'flute', bass: [0, null, null, null, 7, null, null, null], bassLen: 3, kit: 'shaker' },
  /** The road: a toy organ over a bouncing bass and a soft beat. */
  road: { bpm: 126, meter: 8, bars: ROAD, lead: 'organ', bass: [0, null, 7, null, 0, null, 7, null], bassLen: 2, kit: 'pop' },
  /** Good night: a music box over low tines, rocking. */
  lullaby: { bpm: 84, meter: 6, bars: LULLABY, lead: 'box', bass: [0, null, null, 7, null, null], bassLen: 3, kit: 'none' },
}
/** The birthday room's party song, played round and round on a soft calliope. */
export const PARTY = bars(
  8,
  ['C5 E5 G5 .  A5 G5 E5 .', 'D5 E5 G5 .  E5 .  .  .', 'C5 E5 G5 .  A5 C6 A5 .', 'G5 .  E5 .  C5 .  .  .'],
  ['C', 'G', 'F', 'C'],
)

/** How long a tune runs before it starts over, in seconds. */
export const tuneSeconds = (tune: TuneName) => (TUNES[tune].bars.length * TUNES[tune].meter * 30) / TUNES[tune].bpm
const isTune = (p: Piece): p is TuneName => Object.hasOwn(TUNES, p)

/** Each lead's level inside the music bus, measured (an OfflineAudioContext in a browser) so the tunes sit a few dB under a typical effect (the street's about -35 dBFS at its loudest, the road's and the lullaby's a little under it). */
const LEAD: Record<Lead, number> = { flute: 0.055, organ: 0.025, box: 0.055 }
/** The other voices' levels inside the music bus. */
const LEVEL = { bass: 0.04, kick: 0.05, tick: 0.015 }

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
/** A glockenspiel bar: the pickups, the sparkles and the twinkles. */
const GLASS: Partials = [
  [1, 1],
  [2.76, 0.3],
  [5.4, 0.1],
]
/** A music box's tine: the lullaby and the sleepy rooms. */
const TINE: Partials = [
  [1, 1],
  [3, 0.07],
  [5.8, 0.1],
]
/** A round bell: the doorbell, the ding, the jingles. */
const CHIME: Partials = [
  [1, 1],
  [2, 0.4],
  [3, 0.15],
  [4.2, 0.07],
]
/** A wooden xylophone bar: the play and crafts rooms. */
const XYLO: Partials = [
  [1, 1],
  [3.93, 0.12],
]
/** A clangless metal plate, all off-ratio partials: the pickaxe and the shovel. */
const METAL: Partials = [
  [1, 1],
  [1.48, 0.5],
  [2.33, 0.35],
  [3.9, 0.15],
]

/** The `note` items (the piano, the note lights) walk this little pentatonic tune a note a tap, so tapping makes a melody. */
const NOTE_WALK = [72, 76, 79, 81, 79, 76, 74, 79, 84, 81, 79, 72] as const

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

/** A piece playing: its fader into the music, where its melody goes in, its clock. */
export interface Deck {
  piece: Exclude<Piece, 'none'>
  out: GainNode
  /** The melody's way in: through the lead's own filter, or straight into `out`. */
  lead: AudioNode
  /** Seconds a step lasts (an eighth note) and how many steps go round before it starts over. */
  eighth: number
  steps: number
  /** The next step to play, counted from the piece's start, and when. */
  step: number
  next: number
}

/** A room's gentle loop: its tempo, how many eighth-note steps it goes round in, and what plays on step k at `at` into `out`. */
interface Loop {
  bpm: number
  steps: number
  play: (k: number, at: number, out: AudioNode) => void
}

/** The engine's hum while a trip is on: the nodes its speed moves. */
export interface Hum {
  level: GainNode
  body: OscillatorNode
  growl: OscillatorNode
  tone: BiquadFilterNode
  putt: OscillatorNode
}

/** Each event's sound. `at` first, so a sound that needs nothing else from its event names nothing else. */
type EventVoices = { [K in EventKind]: (at: number, e: Extract<SimEvent, { kind: K }>) => void }

/**
 * Every voice of the game on one audio context: the buses, the effects, the HUD's sounds,
 * the steps of the tunes and the rooms' loops, the hum. Sounds runs it on the page's
 * AudioContext; the tests run it on a fake one.
 */
export class Synth {
  readonly ctx: BaseAudioContext
  readonly master: GainNode
  readonly effects: GainNode
  /** The music switch's bus, and the dip under it that fanfares pull down. */
  readonly music: GainNode
  readonly duck: GainNode
  /** Two seconds of white noise every noisy sound loops over, and where in it the next one starts. */
  private white: AudioBuffer
  private grain = 0
  /** The pickup chime's rung and when it last rang; the next note of the `note` items' walk. */
  private rung = 0
  private pickupAt = -Infinity
  private walk = 0
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
    this.music = this.gain(MUSIC, this.master)
    this.duck = this.gain(1, this.music)
    this.white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = this.white.getChannelData(0)
    const next = rng(0x5eed)
    for (let i = 0; i < data.length; i++) data[i] = next() * 2 - 1
  }

  /** The sound of one sim event at time `at`; `tool` is the builder's, for the crate they hit. */
  event(e: SimEvent, tool: Tool, at: number) {
    // A hit on a crate is the builder's own tool on wood: the event does not carry the tool, the keep's look does.
    if (e.kind === 'crateHit') this.toolVoices[tool](at)
    // The record is keyed by kind and each entry takes its own kind's event: the lookup cannot say so to the compiler.
    ;(this.eventVoices[e.kind] as (at: number, e: SimEvent) => void)(at, e)
  }

  /** An item's sound at time `at`. */
  item(sound: ItemSound, at: number) {
    this.itemVoices[sound](at)
  }

  /** A HUD sound at time `at`. */
  ui(sound: UiSound, at: number) {
    this.uiVoices[sound](at)
  }

  /** Ends the parent gate's tone, if it sounds, within 50 ms of `at`. */
  cut(at: number) {
    if (!this.holding) return
    this.holding.gain.setValueAtTime(1, at)
    this.holding.gain.linearRampToValueAtTime(0, at + 0.05)
    this.holding = null
  }

  /** Dips the music under a fanfare from `at` for `dur` seconds, then lets it back up. */
  dip(at: number, dur: number) {
    const g = this.duck.gain
    g.cancelScheduledValues(at)
    g.setTargetAtTime(DUCK, at, 0.04)
    g.setTargetAtTime(1, at + dur, 0.3)
  }

  private readonly eventVoices: EventVoices = {
    pickup: (at) => {
      // A bright plink, one step up the pentatonic for every pickup close after the last, over a soft body an octave down.
      this.rung = climb(this.rung, at - this.pickupAt)
      this.pickupAt = at
      const f = hz(PICKUP_NOTES[this.rung]!)
      this.bell(this.effects, GLASS, f, at, 0.5, 0.15)
      this.voice(this.effects, 'sine', [[0, f / 2]], struck(0.003, 0.2), 0.05, at)
    },
    whack: (at, e) => {
      // The tool's own hit over the rock's dull knock.
      this.toolVoices[e.tool](at)
      this.voice(this.effects, 'sine', [[0, 115], [0.1, 70]], struck(0.004, 0.13), 0.12, at)
      this.hiss(this.effects, 'lowpass', [[0, 600]], 0.7, struck(0.003, 0.07), 0.05, at)
    },
    crack: (at, e) => {
      // The rock crumbles: a burst through a falling filter, a low crumble, pebbles skittering; a gem sparkles up out of it.
      const fx = this.effects
      this.hiss(fx, 'bandpass', [[0, 1800], [0.35, 500]], 0.8, plucked(0.35), 0.16, at)
      this.voice(fx, 'sine', [[0, 120], [0.25, 60]], struck(0.006, 0.28), 0.12, at)
      ;[0.08, 0.15, 0.21, 0.3].forEach((dt, i) => this.hiss(fx, 'bandpass', [[0, 2600 - i * 300]], 2, struck(0.002, 0.035), 0.07 - i * 0.012, at + dt))
      if (e.gem) [91, 93, 96, 100].forEach((m, i) => this.bell(fx, GLASS, hz(m), at + 0.25 + i * 0.06, 0.4, 0.06))
    },
    stop: (at) => {
      // The brakes' soft sigh.
      this.hiss(this.effects, 'bandpass', [[0, 1400], [0.35, 900]], 1, [[0, 0], [0.05, 1], [0.35, 0]], 0.11, at)
    },
    honk: (at) => {
      // Meep meep: two short soft notes, each two tones a third apart scooping up into place.
      const horn = this.filter('lowpass', 1400, 0.7, this.effects)
      for (const dt of [0, 0.17]) {
        for (const f of [hz(72), hz(76)]) {
          this.voice(horn, 'square', [[0, f * 0.94], [0.03, f]], [[0, 0], [0.015, 1], [0.09, 0.8], [0.12, 0]], 0.045, at + dt)
        }
      }
    },
    answer: (at, e) => this.answerVoices[e.who](at),
    ramp: (at) => {
      // Up and away: a whoosh climbing under a whee.
      this.hiss(this.effects, 'bandpass', [[0, 400], [0.55, 2400]], 1.2, [[0, 0], [0.15, 1], [0.55, 0]], 0.07, at)
      this.voice(this.effects, 'sine', [[0, 380], [0.5, 950]], struck(0.02, 0.55), 0.06, at)
    },
    land: (at, e) => {
      if (!e.hard) {
        this.voice(this.effects, 'sine', [[0, 140], [0.1, 80]], struck(0.003, 0.11), 0.12, at)
        return
      }
      // A soft thump and the springs bouncing it off.
      this.voice(this.effects, 'sine', [[0, 130], [0.18, 50]], struck(0.004, 0.2), 0.16, at)
      this.hiss(this.effects, 'lowpass', [[0, 500]], 0.7, struck(0.003, 0.1), 0.06, at)
      const spring = this.voice(this.effects, 'sine', [[0, 260], [0.08, 360], [0.35, 300]], struck(0.01, 0.35), 0.05, at)
      this.wobble([spring.frequency], 13, [[0, 20]], at, 0.35)
    },
    present: (at) => {
      // The fanfare: ta-da-da-DAA on a toy brass, a bass under it, bells on the last note. The music dips under it.
      const fx = this.effects
      const brass = this.filter('lowpass', 2400, 0.7, fx)
      const tune = [
        [0, 72, 0.1],
        [0.12, 76, 0.1],
        [0.24, 79, 0.1],
        [0.38, 84, 0.6],
      ] as const
      for (const [dt, m, len] of tune) {
        this.voice(brass, 'square', [[0, hz(m)]], held(0.008, len), 0.055, at + dt)
        this.voice(fx, 'triangle', [[0, hz(m - 12)]], held(0.008, len), 0.045, at + dt)
      }
      ;[88, 91, 96].forEach((m, i) => this.bell(fx, GLASS, hz(m), at + 0.38 + i * 0.06, 0.6, 0.035))
      this.kick(fx, at + 0.38, 0.06)
      this.dip(at, 1.1)
    },
    unlock: (at, e) => {
      // The present opens on the fanfare's big last note (the yard plays both together): a sparkle shower up an octave over a warm open chord; three gem plinks when it held gems.
      const fx = this.effects
      const open = at + 0.38
      for (let i = 0; i < 8; i++) this.bell(fx, GLASS, hz(penta(10 + i)), open + i * 0.05, 0.35, 0.05)
      for (const m of [72, 76, 79]) this.bell(fx, CHIME, hz(m), open, 0.9, 0.03)
      this.hiss(fx, 'highpass', [[0, 6000]], 0.7, [[0, 0], [0.15, 1], [0.6, 0]], 0.02, open)
      if (e.what === 'gems') [93, 96, 100].forEach((m, i) => this.bell(fx, GLASS, hz(m), open + 0.6 + i * 0.12, 0.4, 0.07))
      this.dip(at, 1.4)
    },
    arrive: (at) => {
      // Home again: two bells, up a fourth.
      this.bell(this.effects, CHIME, hz(79), at, 0.6, 0.08)
      this.bell(this.effects, CHIME, hz(84), at + 0.18, 0.9, 0.08)
    },
    tip: (at) => {
      // The bed tips: a hydraulic whirr rising, the load sliding out, a few lumps tumbling.
      const fx = this.effects
      this.voice(this.filter('lowpass', 450, 0.7, fx), 'sawtooth', [[0, 70], [1, 120]], held(0.1, 1.1), 0.06, at)
      this.hiss(fx, 'lowpass', [[0, 700]], 0.7, [[0, 0], [0.5, 1], [1.3, 0]], 0.05, at + 0.3)
      ;[0.6, 0.75, 0.95, 1.1].forEach((dt, i) => this.voice(fx, 'triangle', [[0, 300 - i * 25], [0.06, 220 - i * 20]], struck(0.003, 0.07), 0.05, at + dt))
    },
    crate: (at) => {
      // A crate set down on its pad: a soft thump and a wooden tock.
      this.voice(this.effects, 'sine', [[0, 140], [0.16, 60]], struck(0.004, 0.18), 0.14, at)
      this.hiss(this.effects, 'lowpass', [[0, 400]], 0.7, struck(0.003, 0.1), 0.06, at)
      this.voice(this.effects, 'triangle', [[0, 400], [0.06, 350]], struck(0.003, 0.08), 0.05, at + 0.05)
    },
    crateHit: (at) => {
      // The wood under the builder's tool (`event` plays the tool).
      this.voice(this.effects, 'triangle', [[0, 260], [0.08, 190]], struck(0.003, 0.1), 0.1, at)
    },
    machineBuilt: (at) => {
      // The crate unfolds: a ratchet of clicks climbing, a puff, and a ta-da chord. The music dips under it.
      const fx = this.effects
      for (let i = 0; i < 6; i++) this.voice(fx, 'triangle', [[0, 900 + i * 120]], struck(0.002, 0.03), 0.05, at + i * 0.05)
      this.hiss(fx, 'lowpass', [[0, 900]], 0.7, struck(0.01, 0.3), 0.06, at + 0.3)
      for (const m of [72, 76, 79, 84]) this.bell(fx, CHIME, hz(m), at + 0.32, 1, 0.035)
      this.dip(at, 1.4)
    },
    batch: (at, e) => this.machineVoices[e.m](at),
    push: (at) => {
      // The lever clunks and the batch pops out.
      this.voice(this.effects, 'triangle', [[0, 220], [0.08, 150]], struck(0.003, 0.1), 0.13, at)
      this.voice(this.effects, 'sine', [[0, 380], [0.06, 800]], struck(0.003, 0.07), 0.07, at + 0.06)
    },
    cough: (at) => {
      // Nothing to work on: two little puffs and a hm.
      for (const dt of [0, 0.18]) {
        this.hiss(this.effects, 'lowpass', [[0, 700], [0.12, 300]], 0.7, struck(0.01, 0.12), 0.12, at + dt)
        this.voice(this.effects, 'triangle', [[0, 180], [0.1, 140]], struck(0.01, 0.1), 0.04, at + dt)
      }
    },
    house: (at) => {
      // A house is picked: three marimba notes up, and a sparkle.
      ;[67, 72, 76].forEach((m, i) => {
        this.voice(this.effects, 'sine', [[0, hz(m)]], struck(0.003, 0.3), 0.1, at + i * 0.12)
        this.voice(this.effects, 'sine', [[0, hz(m) * 4]], struck(0.002, 0.06), 0.02, at + i * 0.12)
      })
      this.bell(this.effects, GLASS, hz(91), at + 0.4, 0.5, 0.05)
    },
    build: (at, e) => {
      // The material's own sound, and the crane's winch humming as it lowers the room.
      this.materialVoices[e.material](at)
      const winch = this.tremolo(this.effects, 10, 0.2, at, LOWER)
      this.voice(this.filter('lowpass', 350, 0.7, winch), 'sawtooth', [[0, 85]], held(0.15, LOWER - 0.1), 0.035, at)
    },
    landed: (at) => {
      // The room lands with a squash and a puff, then the builder's hammer taps on it.
      const fx = this.effects
      this.voice(fx, 'sine', [[0, 120], [0.2, 50]], struck(0.005, 0.22), 0.15, at)
      this.hiss(fx, 'lowpass', [[0, 1000], [0.4, 400]], 0.7, [[0, 0], [0.04, 1], [0.4, 0]], 0.06, at)
      for (let i = 1; i <= 3; i++) {
        const t = at + (i * HAMMER) / 3.2
        this.voice(fx, 'sine', [[0, 900], [0.04, 650]], struck(0.002, 0.05), 0.05, t)
        this.voice(fx, 'triangle', [[0, 300]], struck(0.002, 0.04), 0.04, t)
      }
    },
    lift: (at) => {
      // Up on the hook, wobbling.
      const o = this.voice(this.effects, 'sine', [[0, 220], [0.3, 330]], struck(0.02, 0.5), 0.07, at)
      this.wobble([o.frequency], 6, [[0, 15]], at, 0.5)
    },
    takeBack: (at) => {
      // Carried away with a whoosh, the goods flying home in a falling sparkle.
      this.hiss(this.effects, 'bandpass', [[0, 500], [0.2, 2200], [0.6, 700]], 1, [[0, 0], [0.15, 1], [0.6, 0]], 0.07, at)
      for (let i = 0; i < 5; i++) this.bell(this.effects, GLASS, hz(penta(16 - i)), at + 0.1 + i * 0.07, 0.3, 0.04)
    },
    nope: (at) => {
      // A gentle "nuh-uh": two soft notes, the second lower.
      const soft = this.filter('lowpass', 1200, 0.7, this.effects)
      this.voice(soft, 'triangle', [[0, hz(67)]], [[0, 0], [0.01, 1], [0.09, 0.8], [0.13, 0]], 0.07, at)
      this.voice(soft, 'triangle', [[0, hz(64)], [0.2, hz(63)]], [[0, 0], [0.01, 1], [0.12, 0.8], [0.22, 0]], 0.07, at + 0.17)
    },
    wiggle: (at) => {
      // The rooms on top rock on their neighbours: a soft bump, then wooden tocks left and right with each swing (ten a second, as the room wiggles five times a second), dying away with it. Rooms that wiggle together share one sound: the dedup plays it once.
      this.voice(this.effects, 'sine', [[0, 150], [0.1, 90]], struck(0.004, 0.12), 0.08, at)
      for (let i = 0; i < 5; i++) {
        const left = i % 2 === 0
        const fade = 1 - i / 5
        this.voice(this.effects, 'triangle', [[0, left ? 540 : 460], [0.05, left ? 490 : 420]], struck(0.002, 0.07), 0.09 * fade, at + i * 0.1)
        this.hiss(this.effects, 'bandpass', [[0, left ? 1900 : 1600]], 2, struck(0.002, 0.03), 0.04 * fade, at + i * 0.1)
      }
    },
    theme: (at, e) => {
      // Three bells up, then the room says hello in its hero's voice. The room's loop waits THEME_FOR for this.
      ;[84, 88, 96].forEach((m, i) => this.bell(this.effects, GLASS, hz(m), at + i * 0.08, 0.4, 0.07))
      this.item(ITEMS[themeItems(e.theme)[2]!].sound, at + 0.35)
    },
    itemIn: (at) => {
      // Plop, in.
      this.voice(this.effects, 'sine', [[0, 280], [0.08, 620]], struck(0.004, 0.1), 0.16, at)
      this.bell(this.effects, GLASS, hz(91), at + 0.05, 0.2, 0.03)
    },
    itemOut: (at) => {
      // Plop, out.
      this.voice(this.effects, 'sine', [[0, 620], [0.1, 260]], struck(0.004, 0.12), 0.15, at)
    },
    play: (at, e) => this.item(ITEMS[e.item].sound, at),
    paint: (at) => {
      // A brush stroke and a bloop of fresh colour.
      this.hiss(this.effects, 'bandpass', [[0, 1200], [0.3, 2600]], 1.5, [[0, 0], [0.08, 1], [0.3, 0]], 0.06, at)
      this.voice(this.effects, 'sine', [[0, 300], [0.12, 700]], struck(0.004, 0.15), 0.07, at + 0.2)
    },
    roof: (at) => {
      // The roof turns over: click click click, pop, ting.
      for (let i = 0; i < 3; i++) this.voice(this.effects, 'triangle', [[0, 1000]], struck(0.002, 0.025), 0.05, at + i * 0.06)
      this.voice(this.effects, 'sine', [[0, 400], [0.07, 900]], struck(0.003, 0.08), 0.07, at + 0.2)
      this.bell(this.effects, GLASS, hz(86), at + 0.22, 0.3, 0.04)
    },
    doorbell: (at) => {
      // Ding-dong.
      this.bell(this.effects, CHIME, hz(88), at, 1, 0.08)
      this.bell(this.effects, CHIME, hz(84), at + 0.45, 1.3, 0.08)
    },
    visit: (at) => {
      // The builder pops in: doo-dee, and a swish.
      this.voice(this.effects, 'sine', [[0, hz(79)]], struck(0.005, 0.15), 0.08, at)
      this.voice(this.effects, 'sine', [[0, hz(84)]], struck(0.005, 0.25), 0.08, at + 0.12)
      this.hiss(this.effects, 'bandpass', [[0, 1500], [0.2, 3000]], 1, struck(0.03, 0.2), 0.03, at)
    },
    newPlot: (at) => {
      // The bulldozer chugs across the new plot, then a ding: ready.
      const chug = this.tremolo(this.effects, 9, 0.4, at, 1.25)
      this.voice(this.filter('lowpass', 300, 0.7, chug), 'square', [[0, 55], [1.2, 60]], held(0.1, 1.2), 0.07, at)
      this.hiss(chug, 'lowpass', [[0, 400]], 0.7, held(0.1, 1.2), 0.03, at)
      this.bell(this.effects, CHIME, hz(91), at + 1.2, 0.6, 0.05)
    },
    wear: (at, e) => this.partVoices[e.part](at),
    dice: (at) => {
      // The dice rattle across and land on a sparkle.
      ;[0, 0.05, 0.11, 0.16, 0.24, 0.31].forEach((dt, i) => {
        this.voice(this.effects, 'triangle', [[0, 1200 - i * 60]], struck(0.002, 0.03), 0.06, at + dt)
        this.hiss(this.effects, 'bandpass', [[0, 3000]], 2, struck(0.002, 0.02), 0.04, at + dt)
      })
      this.bell(this.effects, GLASS, hz(penta(13)), at + 0.4, 0.3, 0.05)
      this.bell(this.effects, GLASS, hz(penta(15)), at + 0.47, 0.4, 0.05)
    },
    zoom: (at) => {
      this.hiss(this.effects, 'bandpass', [[0, 500], [0.4, 1500]], 1, [[0, 0], [0.15, 1], [0.4, 0]], 0.08, at)
    },
    goodnight: (at) => {
      // Evening falls: bells stepping slowly down over a soft low pad. The lullaby waits GOODNIGHT_FOR for this.
      ;[79, 76, 72, 67].forEach((m, i) => this.bell(this.effects, CHIME, hz(m), at + i * 0.28, i === 3 ? 1.4 : 1, 0.055))
      for (const m of [48, 55]) this.voice(this.effects, 'triangle', [[0, hz(m)]], held(0.4, 1.7), 0.03, at)
    },
    lightsOut: (at, e) => {
      // A soft click and a low tine, a step lower for each house further down the street.
      this.voice(this.effects, 'triangle', [[0, 1600], [0.02, 1200]], struck(0.002, 0.025), 0.05, at)
      this.bell(this.effects, TINE, hz(penta(9 - Math.min(e.plot, 5))), at + 0.03, 0.8, 0.06)
    },
    sleep: (at) => {
      // The street is asleep: three music box notes down, the last one ringing.
      ;[76, 74, 72].forEach((m, i) => this.bell(this.effects, TINE, hz(m), at + i * 0.4, i === 2 ? 2 : 0.9, 0.08))
    },
    wake: (at) => {
      // Morning: bells up, and a bird.
      ;[72, 76, 79, 84].forEach((m, i) => this.bell(this.effects, CHIME, hz(m), at + i * 0.1, 0.6, 0.06))
      for (const dt of [0.5, 0.6]) this.voice(this.effects, 'sine', [[0, 2600], [0.05, 3400]], struck(0.003, 0.06), 0.03, at + dt)
    },
    tap: (at) => this.click(at),
  }

  /** Each tool's hit, on a boulder or a crate. */
  private readonly toolVoices: Record<Tool, (at: number) => void> = {
    hammer: (at) => {
      // Bonk.
      this.voice(this.effects, 'sine', [[0, 320], [0.08, 160]], struck(0.002, 0.12), 0.2, at)
      this.voice(this.effects, 'triangle', [[0, 640], [0.05, 420]], struck(0.002, 0.05), 0.06, at)
    },
    pickaxe: (at) => {
      // Chink.
      this.bell(this.effects, METAL, 1500, at, 0.25, 0.1)
      this.hiss(this.effects, 'highpass', [[0, 4000]], 0.7, struck(0.002, 0.03), 0.06, at)
    },
    drill: (at) => {
      // Brrr: a growl shaking thirty times a second, rising as it bites.
      const shake = this.tremolo(this.effects, 32, 0.45, at, 0.42)
      this.voice(this.filter('lowpass', 1100, 0.7, shake), 'sawtooth', [[0, 95], [0.4, 130]], held(0.02, 0.4), 0.07, at)
    },
    shovel: (at) => {
      // Clank.
      this.bell(this.effects, METAL, 520, at, 0.3, 0.09)
      this.voice(this.effects, 'sine', [[0, 200], [0.08, 140]], struck(0.003, 0.1), 0.08, at)
    },
    wrench: (at) => {
      // Clunk.
      this.voice(this.effects, 'triangle', [[0, 190], [0.12, 120]], struck(0.003, 0.14), 0.18, at)
      this.bell(this.effects, METAL, 900, at, 0.12, 0.06)
    },
    wand: (at) => this.itemVoices.sparkle(at),
  }

  /** Each machine's batch, in its own voice. */
  private readonly machineVoices: Record<MachineId, (at: number) => void> = {
    sawmill: (at) => {
      // Bzzz, then the planks drop out with a tock.
      const buzz = this.tremolo(this.effects, 38, 0.4, at, 0.52)
      this.voice(this.filter('bandpass', 1200, 1.5, buzz), 'sawtooth', [[0, 150], [0.5, 170]], held(0.03, 0.5), 0.1, at)
      this.voice(this.effects, 'triangle', [[0, 520], [0.06, 470]], struck(0.003, 0.08), 0.08, at + 0.5)
    },
    oven: (at) => {
      // A warm puff, then ding: the bricks are baked.
      this.hiss(this.effects, 'lowpass', [[0, 800], [0.35, 400]], 0.7, [[0, 0], [0.06, 1], [0.35, 0]], 0.08, at)
      this.bell(this.effects, CHIME, hz(84), at + 0.35, 0.8, 0.07)
    },
    mixer: (at) => {
      // Glug glug glug over the drum's churn.
      const mouth = this.filter('lowpass', 900, 0.7, this.effects)
      for (let i = 0; i < 3; i++) this.voice(mouth, 'sine', [[0, 200 - i * 15], [0.05, 330 - i * 20], [0.12, 180 - i * 15]], struck(0.005, 0.14), 0.12, at + i * 0.16)
      this.hiss(this.effects, 'lowpass', [[0, 300]], 0.7, held(0.05, 0.5), 0.04, at)
    },
    glassworks: (at) => {
      // A breath of hot air and a clear ting.
      this.hiss(this.effects, 'bandpass', [[0, 900]], 1, [[0, 0], [0.1, 1], [0.4, 0]], 0.03, at)
      this.bell(this.effects, GLASS, hz(88), at + 0.1, 0.7, 0.08)
    },
    rainbow: (at) => {
      // A rainbow of a chord, rolled up, with a shimmer on top.
      ;[72, 76, 79, 81, 84, 88].forEach((m, i) => this.bell(this.effects, CHIME, hz(m), at + i * 0.05, 0.9, 0.035))
      this.hiss(this.effects, 'highpass', [[0, 5000]], 0.7, [[0, 0], [0.2, 1], [0.7, 0]], 0.02, at)
    },
  }

  /** Each material's sound as a room of it goes up. */
  private readonly materialVoices: Record<Material, (at: number) => void> = {
    planks: (at) => {
      // Knock knock.
      for (const dt of [0, 0.12]) {
        this.voice(this.effects, 'triangle', [[0, 430], [0.06, 390]], struck(0.003, 0.08), 0.12, at + dt)
        this.voice(this.effects, 'sine', [[0, 860]], struck(0.002, 0.03), 0.03, at + dt)
      }
    },
    bricks: (at) => {
      // Clack clack.
      for (const dt of [0, 0.1]) {
        this.hiss(this.effects, 'bandpass', [[0, 2200]], 2, struck(0.002, 0.04), 0.1, at + dt)
        this.voice(this.effects, 'triangle', [[0, 750], [0.04, 700]], struck(0.002, 0.05), 0.06, at + dt)
      }
    },
    concrete: (at) => {
      // A deep soft thud.
      this.voice(this.effects, 'sine', [[0, 110], [0.22, 55]], struck(0.006, 0.25), 0.16, at)
      this.hiss(this.effects, 'lowpass', [[0, 350]], 0.7, struck(0.005, 0.15), 0.07, at)
    },
    glass: (at) => this.itemVoices.ting(at),
    rainbow: (at) => this.itemVoices.chime(at),
  }

  /** The crossers' answers to the horn, and the train's toot. */
  private readonly answerVoices: Record<Crosser | 'train', (at: number) => void> = {
    ducks: (at) => this.itemVoices.quack(at),
    cats: (at) => this.itemVoices.meow(at),
    cows: (at) => {
      // Moo: a low buzz through a mouth that opens and closes.
      const mouth = this.filter('lowpass', 350, 2, this.effects)
      glide(mouth.frequency, [[0, 350], [0.3, 1100], [0.95, 450]], at, 1)
      const pitch: Curve = [[0, 150], [0.25, 165], [0.9, 115]]
      const level: Curve = [[0, 0], [0.12, 1], [0.6, 0.8], [0.95, 0]]
      this.voice(mouth, 'sawtooth', pitch, level, 0.05, at)
      this.voice(this.effects, 'sine', pitch, level, 0.03, at)
    },
    hedgehogs: (at) => {
      // Sniff sniff sniff, and a tiny squeak.
      for (const dt of [0, 0.11, 0.22]) this.hiss(this.effects, 'bandpass', [[0, 2800]], 2, struck(0.01, 0.07), 0.15, at + dt)
      this.voice(this.effects, 'sine', [[0, 1800], [0.05, 2100]], struck(0.004, 0.06), 0.03, at + 0.36)
    },
    train: (at) => {
      // Toot toot: a soft whistle chord with a breath in it.
      for (const dt of [0, 0.42]) {
        for (const m of [76, 79, 84]) this.voice(this.effects, 'sine', [[0, hz(m)]], held(0.04, 0.34), 0.035, at + dt)
        this.hiss(this.effects, 'bandpass', [[0, 1500]], 1.5, held(0.04, 0.34), 0.015, at + dt)
      }
    },
  }

  /** A wardrobe pick, by the part it changed. */
  private readonly partVoices: Record<Part, (at: number) => void> = {
    hat: (at) => {
      // The hard hat's plastic tonk.
      this.voice(this.effects, 'triangle', [[0, 650], [0.06, 560]], struck(0.002, 0.08), 0.14, at)
      this.bell(this.effects, GLASS, hz(96), at, 0.2, 0.02)
    },
    hair: (at) => this.itemVoices.swish(at),
    skin: (at) => this.voice(this.effects, 'sine', [[0, 500], [0.12, 700]], struck(0.005, 0.15), 0.12, at),
    glasses: (at) => {
      // A glint.
      this.bell(this.effects, GLASS, hz(98), at, 0.3, 0.06)
      this.bell(this.effects, GLASS, hz(100), at + 0.06, 0.2, 0.03)
    },
    shirt: (at) => this.itemVoices.swish(at),
    bag: (at) => {
      // A zip.
      const zip = this.tremolo(this.effects, 45, 0.45, at, 0.27)
      this.hiss(zip, 'bandpass', [[0, 2500], [0.25, 4500]], 2, [[0, 0], [0.03, 1], [0.25, 0]], 0.18, at)
    },
    pants: (at) => this.itemVoices.swish(at),
    shoes: (at) => {
      // Tok tok: trying them out.
      for (const dt of [0, 0.13]) this.voice(this.effects, 'triangle', [[0, 380], [0.04, 320]], struck(0.002, 0.05), 0.09, at + dt)
    },
    tool: (at) => this.itemVoices.clink(at),
  }

  /** Every item's voice: what a tap on it (or a doorbell party) plays. */
  private readonly itemVoices: Record<ItemSound, (at: number) => void> = {
    sparkle: (at) => {
      ;[96, 91, 100, 93, 98, 88].forEach((m, i) => this.bell(this.effects, GLASS, hz(m), at + i * 0.05, 0.35, 0.045))
      this.hiss(this.effects, 'highpass', [[0, 6000]], 0.7, [[0, 0], [0.1, 1], [0.5, 0]], 0.02, at)
    },
    zap: (at) => {
      // A soft neon zap, sweeping down.
      this.voice(this.filter('lowpass', 2200, 0.7, this.effects), 'square', [[0, 1400], [0.16, 260]], struck(0.004, 0.18), 0.07, at)
      this.voice(this.effects, 'sine', [[0, 700], [0.16, 180]], struck(0.004, 0.18), 0.1, at)
    },
    boom: (at) => {
      // The speaker's thump: round and low, never a bang.
      this.voice(this.effects, 'sine', [[0, 95], [0.3, 48]], struck(0.008, 0.35), 0.18, at)
      this.voice(this.effects, 'triangle', [[0, 190], [0.12, 95]], struck(0.006, 0.15), 0.06, at)
    },
    scratch: (at) => {
      // Wikka wikka.
      this.hiss(this.effects, 'bandpass', [[0, 700], [0.1, 2400], [0.2, 800], [0.32, 2000]], 2.5, [[0, 0], [0.02, 1], [0.3, 0.8], [0.35, 0]], 0.14, at)
    },
    cheer: (at) => {
      // Yay! Three voices sliding up together, and a little clapping.
      const mouth = this.filter('bandpass', 1400, 1, this.effects)
      for (const m of [72, 76, 79]) {
        const f = hz(m)
        this.voice(mouth, 'triangle', [[0, f * 0.85], [0.08, f], [0.45, f * 1.06]], [[0, 0], [0.05, 1], [0.35, 0.7], [0.5, 0]], 0.05, at)
      }
      for (const dt of [0.05, 0.2, 0.33]) this.hiss(this.effects, 'bandpass', [[0, 1200]], 1, struck(0.002, 0.05), 0.06, at + dt)
    },
    whoosh: (at) => {
      this.hiss(this.effects, 'bandpass', [[0, 500], [0.2, 2200], [0.5, 700]], 1.2, [[0, 0], [0.18, 1], [0.5, 0]], 0.15, at)
    },
    rattle: (at) => {
      for (let i = 0; i < 7; i++) this.hiss(this.effects, 'bandpass', [[0, i % 2 === 0 ? 3200 : 2400]], 3, struck(0.002, 0.03), 0.16, at + i * 0.045)
    },
    blocks: (at) => {
      // The tower topples, tock tock tock, then builds itself back up.
      ;[700, 600, 640, 520, 470].forEach((f, i) => this.voice(this.effects, 'triangle', [[0, f]], struck(0.002, 0.07), 0.08, at + [0, 0.08, 0.14, 0.23, 0.3][i]!))
      ;[520, 620, 740].forEach((f, i) => this.voice(this.effects, 'triangle', [[0, f]], struck(0.002, 0.07), 0.06, at + 0.75 + i * 0.1))
    },
    squeak: (at) => {
      const o = this.voice(this.effects, 'sine', [[0, 850], [0.06, 1400], [0.2, 1050]], struck(0.004, 0.22), 0.13, at)
      this.wobble([o.frequency], 18, [[0, 40]], at, 0.22)
    },
    giggle: (at) => {
      // Hee hee hee hee.
      const mouth = this.filter('bandpass', 1600, 1.5, this.effects)
      ;[540, 620, 580, 660].forEach((f, i) => {
        const path: Curve = [[0, f], [0.06, f * 1.1]]
        this.voice(mouth, 'triangle', path, struck(0.008, 0.08), 0.07, at + i * 0.1)
        this.voice(this.effects, 'sine', path, struck(0.008, 0.08), 0.04, at + i * 0.1)
      })
    },
    ting: (at) => this.bell(this.effects, GLASS, hz(93), at, 0.6, 0.09),
    swish: (at) => {
      this.hiss(this.effects, 'bandpass', [[0, 1000], [0.22, 3800]], 1, [[0, 0], [0.06, 1], [0.25, 0]], 0.16, at)
    },
    splash: (at) => {
      // Splash, and bubbles coming up.
      this.hiss(this.effects, 'lowpass', [[0, 3200], [0.4, 600]], 0.7, plucked(0.45), 0.12, at)
      for (let i = 0; i < 3; i++) this.voice(this.effects, 'sine', [[0, 500 + i * 120], [0.05, 1100 + i * 150]], struck(0.003, 0.06), 0.05, at + 0.12 + i * 0.09)
    },
    roll: (at) => {
      // Balls rolling in: pok pok pok over a rumble.
      ;[660, 590, 700, 620, 740, 680].forEach((f, i) => this.voice(this.effects, 'sine', [[0, f]], struck(0.002, 0.05), 0.07, at + i * 0.09))
      this.hiss(this.effects, 'lowpass', [[0, 300]], 0.7, [[0, 0], [0.1, 1], [0.6, 0]], 0.05, at)
    },
    whee: (at) => {
      const o = this.voice(this.effects, 'sine', [[0, 420], [0.55, 1050]], [[0, 0], [0.05, 1], [0.45, 0.7], [0.6, 0]], 0.05, at)
      this.wobble([o.frequency], 6, [[0, 1], [0.6, 35]], at, 0.6)
      this.hiss(this.effects, 'bandpass', [[0, 1500]], 1, [[0, 0], [0.2, 1], [0.6, 0]], 0.03, at)
    },
    boing: (at) => {
      const o = this.voice(this.effects, 'sine', [[0, 180], [0.08, 440], [0.5, 330]], struck(0.003, 0.5), 0.12, at)
      this.wobble([o.frequency], 12, [[0, 50], [0.5, 4]], at, 0.5)
    },
    clack: (at) => {
      for (const dt of [0, 0.14]) {
        this.voice(this.effects, 'triangle', [[0, 1050], [0.03, 850]], struck(0.002, 0.04), 0.09, at + dt)
        this.hiss(this.effects, 'bandpass', [[0, 2500]], 2, struck(0.002, 0.02), 0.04, at + dt)
      }
    },
    chime: (at) => {
      ;[84, 91, 88].forEach((m, i) => this.bell(this.effects, CHIME, hz(m), at + i * 0.12, 1, 0.06))
    },
    twinkle: (at) => {
      ;[96, 91, 93, 100].forEach((m, i) => this.bell(this.effects, GLASS, hz(m), at + i * 0.09, 0.4, 0.05))
    },
    yawn: (at) => {
      // A big sleepy yawn: the mouth opens wide and closes.
      const mouth = this.filter('lowpass', 500, 1, this.effects)
      glide(mouth.frequency, [[0, 500], [0.4, 1400], [1, 450]], at, 1)
      const pitch: Curve = [[0, 300], [0.35, 440], [1, 220]]
      const level: Curve = [[0, 0], [0.15, 1], [0.75, 0.7], [1.05, 0]]
      this.voice(mouth, 'triangle', pitch, level, 0.035, at)
      this.voice(this.effects, 'sine', pitch, level, 0.018, at)
    },
    drum: (at) => {
      // A little fill down the toms, and a soft cymbal with the kick.
      ;(
        [
          [220, 130],
          [170, 100],
          [130, 75],
        ] as const
      ).forEach(([f, to], i) => this.voice(this.effects, 'sine', [[0, f], [0.15, to]], struck(0.004, 0.18), 0.1, at + i * 0.12))
      this.kick(this.effects, at + 0.36, 0.09)
      this.hiss(this.effects, 'highpass', [[0, 7000]], 0.7, struck(0.003, 0.5), 0.03, at + 0.36)
    },
    note: (at) => {
      // The next note of the walk on a soft piano.
      const f = hz(NOTE_WALK[this.walk % NOTE_WALK.length]!)
      this.walk += 1
      this.voice(this.effects, 'triangle', [[0, f]], plucked(0.6), 0.12, at)
      this.voice(this.effects, 'sine', [[0, f * 2]], plucked(0.4), 0.03, at)
    },
    twang: (at) => {
      // A strum: four strings one after another, the brightness dying away.
      const body = this.ctx.createBiquadFilter()
      body.type = 'lowpass'
      body.Q.value = 0.7
      glide(body.frequency, [[0, 2500], [0.8, 600]], at, 1)
      body.connect(this.effects)
      ;[60, 64, 67, 72].forEach((m, i) => {
        this.voice(body, 'sawtooth', [[0, hz(m)]], plucked(0.9), 0.035, at + i * 0.03)
        this.voice(this.effects, 'triangle', [[0, hz(m)]], plucked(0.9), 0.04, at + i * 0.03)
      })
    },
    brush: (at) => {
      for (const dt of [0, 0.25]) this.hiss(this.effects, 'bandpass', [[0, 1100], [0.18, 1900]], 1.2, [[0, 0], [0.05, 1], [0.2, 0]], 0.16, at + dt)
    },
    meow: (at) => {
      // A meow: a pure voice and a buzzier one through a little mouth closing, up and down with a vibrato.
      const mouth = this.filter('bandpass', 1800, 2, this.effects)
      glide(mouth.frequency, [[0, 1800], [0.4, 900]], at, 1)
      const path: Curve = [[0, 620], [0.13, 920], [0.4, 520]]
      const level: Curve = [[0, 0], [0.04, 1], [0.26, 0.75], [0.4, 0]]
      const pure = this.voice(this.effects, 'sine', path, level, 0.065, at)
      const buzz = this.voice(mouth, 'sawtooth', path, level, 0.04, at)
      this.wobble([pure.frequency, buzz.frequency], 6, [[0, 14]], at, 0.4)
    },
    purr: (at) => this.purr(this.effects, at, 1.2, 0.12, 26),
    pop: (at) => {
      // A soft pop, never a bang.
      this.voice(this.effects, 'sine', [[0, 900], [0.04, 300]], struck(0.002, 0.05), 0.14, at)
      this.hiss(this.effects, 'highpass', [[0, 2500]], 0.7, struck(0.002, 0.02), 0.06, at)
    },
    blow: (at) => {
      // Fffff: the candles go out, and light again with a tiny ting.
      this.hiss(this.effects, 'bandpass', [[0, 1400], [0.4, 900]], 0.8, [[0, 0], [0.08, 1], [0.45, 0]], 0.08, at)
      this.bell(this.effects, GLASS, hz(91), at + 0.7, 0.3, 0.04)
    },
    beep: (at) => {
      // Bee boo bee.
      const robot = this.filter('lowpass', 3000, 0.7, this.effects)
      ;[81, 76, 84].forEach((m, i) => {
        this.voice(robot, 'square', [[0, hz(m)]], held(0.005, 0.1), 0.024, at + i * 0.13)
        this.voice(this.effects, 'sine', [[0, hz(m)]], held(0.005, 0.1), 0.04, at + i * 0.13)
      })
    },
    rocket: (at) => {
      // A rumble swelling and a whistle climbing away.
      this.hiss(this.effects, 'lowpass', [[0, 300], [1, 900]], 0.7, [[0, 0], [0.3, 1], [0.9, 0.7], [1.3, 0]], 0.1, at)
      this.voice(this.effects, 'sine', [[0, 300], [1.1, 1100]], [[0, 0], [0.2, 1], [1.2, 0]], 0.04, at)
    },
    ding: (at) => this.bell(this.effects, CHIME, hz(81), at, 1.2, 0.09),
    bubble: (at) => {
      ;[300, 380, 330, 420, 360].forEach((f, i) => this.voice(this.effects, 'sine', [[0, f], [0.06, f * 1.8]], struck(0.004, 0.07), 0.08, at + [0, 0.11, 0.19, 0.3, 0.42][i]!))
    },
    clink: (at) => {
      this.bell(this.effects, GLASS, hz(98), at, 0.25, 0.05)
      this.bell(this.effects, GLASS, hz(100), at + 0.09, 0.25, 0.05)
    },
    flush: (at) => {
      // The funniest sound in the game: water swirling round and round, rising, then gurgling away glug by glug, and a last little plip.
      const swirl = this.hiss(this.effects, 'bandpass', [[0, 400], [0.3, 1200], [0.9, 500]], 2, [[0, 0], [0.2, 1], [0.8, 0.8], [1.1, 0]], 0.12, at)
      this.wobble([swirl.frequency], 4, [[0, 150], [0.5, 300], [1.1, 100]], at, 1.1)
      const throat = this.filter('lowpass', 1200, 0.7, this.effects)
      for (let i = 0; i < 4; i++) this.voice(throat, 'sine', [[0, 480 - i * 60], [0.06, 240 - i * 30], [0.1, 320 - i * 30]], struck(0.004, 0.12), 0.1, at + 1 + i * 0.12)
      this.voice(this.effects, 'sine', [[0, 600], [0.06, 1300]], struck(0.003, 0.07), 0.06, at + 1.55)
    },
    quack: (at) => {
      // Quack quack.
      const bill = this.filter('bandpass', 1100, 3, this.effects)
      for (const dt of [0, 0.2]) {
        this.voice(bill, 'sawtooth', [[0, 380], [0.12, 300]], [[0, 0], [0.01, 1], [0.1, 0.7], [0.15, 0]], 0.12, at + dt)
        this.voice(this.effects, 'sine', [[0, 380], [0.12, 300]], [[0, 0], [0.01, 1], [0.1, 0.7], [0.15, 0]], 0.03, at + dt)
      }
    },
    hiss: (at) => {
      // Water on the hot stones: a hiss that swells and fades, with a fizz on top.
      this.hiss(this.effects, 'highpass', [[0, 3000]], 0.7, [[0, 0], [0.08, 1], [0.5, 0.6], [1.3, 0]], 0.07, at)
      this.hiss(this.effects, 'bandpass', [[0, 6000]], 1, [[0, 0], [0.1, 1], [0.8, 0]], 0.02, at)
    },
  }

  /** The HUD's sounds. */
  private readonly uiVoices: Record<UiSound, (at: number) => void> = {
    tap: (at) => this.click(at),
    open: (at) => {
      // A card opens: a breath up and a bell.
      this.hiss(this.effects, 'bandpass', [[0, 500], [0.35, 2000]], 1.2, [[0, 0], [0.1, 1], [0.35, 0]], 0.03, at)
      this.bell(this.effects, CHIME, hz(91), at + 0.05, 0.5, 0.04)
    },
    close: (at) => {
      // And closes: a breath down and a lower bell.
      this.hiss(this.effects, 'bandpass', [[0, 2000], [0.3, 500]], 1.2, [[0, 0], [0.05, 1], [0.3, 0]], 0.03, at)
      this.bell(this.effects, CHIME, hz(84), at + 0.03, 0.4, 0.035)
    },
    hold: (at) => {
      // The parent gate filling up: a tone and its fifth rising for HOLD_FOR, swelling. Its own fader cuts it short.
      this.holding = this.gain(1, this.effects)
      const swell: Curve = [[0, 0], [0.2, 0.6], [HOLD_FOR - 0.2, 1], [HOLD_FOR, 0]]
      this.voice(this.holding, 'sine', [[0, hz(60)], [HOLD_FOR, hz(79)]], swell, 0.045, at)
      this.voice(this.holding, 'sine', [[0, hz(67)], [HOLD_FOR, hz(86)]], swell, 0.015, at)
    },
    fresh: (at) => {
      // Done: an open bell chord and a sparkle on top.
      this.bell(this.effects, CHIME, hz(72), at, 1.2, 0.08)
      this.bell(this.effects, CHIME, hz(79), at, 1.2, 0.06)
      this.bell(this.effects, GLASS, hz(96), at + 0.15, 0.6, 0.05)
    },
    pick: (at) => {
      this.bell(this.effects, GLASS, hz(93), at, 0.25, 0.06)
      this.click(at)
    },
  }

  /** The rooms' loops, on the music bus: only the room in view plays its own. */
  private readonly loops: Record<Theme, Loop> = {
    disco: {
      // A soft disco beat: a kick on the beats, a hat between, an octave-hopping bass over C, Am, F, G, a sparkle at the turn.
      bpm: 112,
      steps: 32,
      play: (k, at, out) => {
        const slot = k % 8
        if (slot % 4 === 0) this.kick(out, at, LEVEL.kick)
        if (slot % 4 === 2) this.hiss(out, 'highpass', [[0, 7000]], 0.7, struck(0.002, 0.05), LEVEL.tick, at)
        if (slot % 2 === 0) this.bassNote(out, 48 + [0, 9, 5, 7][k >> 3]! + (slot % 4 === 2 ? 12 : 0), 0.22, at)
        if (k === 31) this.bell(out, GLASS, hz(96), at, 0.4, 0.03)
      },
    },
    play: {
      // A xylophone noodling to itself.
      bpm: 100,
      steps: 16,
      play: (k, at, out) => {
        const m = [84, 0, 88, 0, 79, 0, 81, 0, 79, 0, 88, 0, 86, 0, 0, 0][k]!
        if (m > 0) this.bell(out, XYLO, hz(m), at, 0.35, 0.15)
      },
    },
    ballpit: {
      // Plastic balls tumbling now and then over a soft whumpf.
      bpm: 90,
      steps: 16,
      play: (k, at, out) => {
        const f = [660, 0, 0, 590, 0, 740, 0, 0, 620, 0, 0, 700, 0, 560, 0, 0][k]!
        if (f > 0) this.voice(out, 'sine', [[0, f]], struck(0.002, 0.06), 0.18, at)
        if (k === 0) this.hiss(out, 'lowpass', [[0, 300]], 0.7, struck(0.02, 0.3), 0.08, at)
      },
    },
    slide: {
      // Birdsong through the sunny window: chirps, a trill, a tu-weet.
      bpm: 96,
      steps: 32,
      play: (k, at, out) => {
        const chirp = (n: number) => {
          for (let i = 0; i < n; i++) this.voice(out, 'sine', [[0, 2600], [0.06, 3300]], struck(0.003, 0.07), 0.12, at + i * 0.12)
        }
        if (k === 0) chirp(2)
        if (k === 20) chirp(3)
        if (k === 6 || k === 27) {
          const o = this.voice(out, 'sine', [[0, 2900]], struck(0.01, 0.35), 0.08, at)
          this.wobble([o.frequency], 28, [[0, 250]], at, 0.35)
        }
        if (k === 13) this.voice(out, 'sine', [[0, 1800], [0.1, 1600], [0.2, 2600]], struck(0.01, 0.22), 0.1, at)
      },
    },
    gym: {
      // A bouncy warm-up: kick, a root and fifth bass, a boing at the end.
      bpm: 104,
      steps: 16,
      play: (k, at, out) => {
        const slot = k % 8
        if (slot % 4 === 0) this.kick(out, at, LEVEL.kick)
        if (slot % 2 === 0) this.bassNote(out, slot % 4 === 0 ? 48 : 55, 0.25, at)
        if (k === 15) this.voice(out, 'sine', [[0, 180], [0.08, 380], [0.3, 300]], struck(0.003, 0.3), 0.04, at)
      },
    },
    sleep: {
      // Slow breathing and a music box far away.
      bpm: 60,
      steps: 16,
      play: (k, at, out) => {
        if (k % 8 === 0) this.hiss(out, 'lowpass', [[0, 500]], 0.7, [[0, 0], [1.6, 1], [3.4, 0]], 0.05, at)
        const m = [0, 0, 88, 0, 0, 0, 84, 0, 0, 0, 81, 0, 0, 79, 0, 0][k]!
        if (m > 0) this.bell(out, TINE, hz(m), at, 1.6, 0.06)
      },
    },
    music: {
      // A music box rolling up and down C, Am, a D over F and a G, every note on the pentatonic, low tines under it.
      bpm: 96,
      steps: 32,
      play: (k, at, out) => {
        const bar = k >> 3
        const arp = [
          [72, 76, 79, 84],
          [69, 72, 76, 81],
          [69, 72, 74, 81],
          [67, 74, 79, 86],
        ][bar]!
        this.bell(out, TINE, hz(arp[[0, 1, 2, 3, 2, 1, 2, 3][k % 8]!]!), at, 1.2, 0.035)
        if (k % 8 === 0) this.bell(out, TINE, hz(48 + [0, 9, 5, 7][bar]!) * 2, at, 2, 0.035)
      },
    },
    crafts: {
      // Snip snip, a scribble, a note on the xylophone.
      bpm: 92,
      steps: 16,
      play: (k, at, out) => {
        if (k === 0) for (const dt of [0, 0.09]) this.hiss(out, 'bandpass', [[0, 4500]], 3, struck(0.002, 0.025), 0.12, at + dt)
        if (k === 6) this.hiss(this.tremolo(out, 14, 0.45, at, 0.62), 'bandpass', [[0, 2800]], 2, [[0, 0], [0.05, 1], [0.6, 0]], 0.08, at)
        if (k === 4 || k === 12) this.bell(out, XYLO, hz(k === 4 ? 79 : 84), at, 0.3, 0.12)
      },
    },
    cat: {
      // Purring, breathing in and out, and now and then a sleepy mrrp.
      bpm: 60,
      steps: 16,
      play: (k, at, out) => {
        if (k % 8 === 0) this.purr(out, at, 1.4, 0.2, 24)
        if (k % 8 === 3) this.purr(out, at, 1.6, 0.17, 21)
        if (k === 14) {
          const o = this.voice(out, 'sine', [[0, 500], [0.08, 700]], struck(0.01, 0.15), 0.06, at)
          this.wobble([o.frequency], 30, [[0, 40]], at, 0.15)
        }
      },
    },
    birthday: {
      // The party song on a soft calliope, with claps.
      bpm: 116,
      steps: PARTY.length * 8,
      play: (k, at, out) => {
        const bar = PARTY[k >> 3]!
        const slot = k % 8
        const m = bar.notes[slot]!
        if (m > 0) {
          this.voice(out, 'triangle', [[0, hz(m)]], held(0.01, 0.2), 0.04, at)
          this.voice(out, 'sine', [[0, hz(m) * 2]], held(0.01, 0.2), 0.012, at)
        }
        if (slot % 4 === 2) this.clap(out, at, LEVEL.tick)
        if (slot % 4 === 0) this.bassNote(out, 48 + CHORDS[bar.chord].root, 0.4, at)
      },
    },
    bath: {
      // Drip, drip, and a bubble.
      bpm: 80,
      steps: 16,
      play: (k, at, out) => {
        if ([0, 5, 9, 14].includes(k)) this.voice(out, 'sine', [[0, 1300 + (k % 3) * 150], [0.04, 2200]], struck(0.002, 0.05), 0.12, at)
        if (k === 11) this.voice(out, 'sine', [[0, 300], [0.07, 600]], struck(0.004, 0.08), 0.12, at)
      },
    },
    space: {
      // A slow hum of the stars and a computer beeping softly to itself.
      bpm: 70,
      steps: 32,
      play: (k, at, out) => {
        if (k === 0) for (const m of [48, 55, 67]) this.voice(out, 'sine', [[0, hz(m)]], [[0, 0], [3, 1], [10, 0.8], [13.5, 0]], 0.03, at)
        const beep = [0, 0, 0, 0, 0, 91, 0, 96, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 93, 0, 0, 88, 0, 0, 0, 0, 96, 0, 0, 0, 0, 0][k]!
        if (beep > 0) this.voice(out, 'sine', [[0, hz(beep)]], struck(0.003, 0.08), 0.06, at)
      },
    },
    kitchen: {
      // A clock ticking on the wall and the pot bubbling.
      bpm: 100,
      steps: 16,
      play: (k, at, out) => {
        if (k % 2 === 0) this.voice(out, 'sine', [[0, k % 4 === 0 ? 1900 : 1500]], struck(0.002, 0.03), 0.08, at)
        if ([3, 7, 10, 15].includes(k)) this.voice(out, 'sine', [[0, 280], [0.06, 520]], struck(0.004, 0.07), 0.12, at)
      },
    },
    sauna: {
      // Water on the stones, a long hiss; the stove crackling; a drip.
      bpm: 70,
      steps: 32,
      play: (k, at, out) => {
        if (k === 0) {
          this.hiss(out, 'highpass', [[0, 2500]], 0.7, [[0, 0], [0.15, 1], [1, 0.5], [2.4, 0]], 0.04, at)
          this.hiss(out, 'bandpass', [[0, 5000]], 1, [[0, 0], [0.2, 1], [1.2, 0]], 0.015, at)
        }
        if ([5, 9, 12, 17, 22, 27, 30].includes(k)) this.hiss(out, 'bandpass', [[0, 1800]], 2, struck(0.002, 0.015), 0.08, at)
        if (k === 20) this.voice(out, 'sine', [[0, 1200], [0.04, 1900]], struck(0.002, 0.05), 0.08, at)
      },
    },
  }

  /** A deck for `piece` whose step `from` plays at `at`, fading in over `fadeIn`. */
  deck(piece: Exclude<Piece, 'none'>, from: number, at: number, fadeIn: number): Deck {
    const out = this.gain(0, this.duck)
    out.gain.setValueAtTime(0, at)
    out.gain.linearRampToValueAtTime(1, at + fadeIn)
    if (!isTune(piece)) {
      const loop = this.loops[piece]
      return { piece, out, lead: out, eighth: 30 / loop.bpm, steps: loop.steps, step: from, next: at }
    }
    const score = TUNES[piece]
    const lead = score.lead === 'box' ? out : this.filter('lowpass', score.lead === 'organ' ? 1500 : 2200, 0.7, out)
    return { piece, out, lead, eighth: 30 / score.bpm, steps: score.bars.length * score.meter, step: from, next: at }
  }

  /** Fades a deck out over `fade` from `at`: what it has scheduled plays on into silence. */
  retire(deck: Deck, at: number, fade: number) {
    const g = deck.out.gain
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(0, at + fade)
  }

  /** Plays the deck's next step at its time and moves its clock on an eighth note. */
  step(deck: Deck) {
    const k = deck.step % deck.steps
    const at = deck.next
    if (isTune(deck.piece)) this.tuneStep(TUNES[deck.piece], deck, k, at)
    else this.loops[deck.piece].play(k, at, deck.out)
    deck.step += 1
    deck.next = at + deck.eighth
  }

  /** Step k of a tune: the melody note starting there, the bass, the drums. */
  private tuneStep(score: Score, deck: Deck, k: number, at: number) {
    const bar = score.bars[Math.floor(k / score.meter)]!
    const slot = k % score.meter
    const note = bar.notes[slot]!
    const dur = bar.lengths[slot]! * deck.eighth
    if (note > 0) {
      const f = hz(note)
      const v = LEAD[score.lead]
      switch (score.lead) {
        case 'flute':
          this.voice(deck.lead, 'triangle', [[0, f]], held(0.04, dur), v, at)
          this.voice(deck.lead, 'sine', [[0, f * 2]], held(0.06, dur), v * 0.15, at)
          break
        case 'organ':
          this.voice(deck.lead, 'square', [[0, f]], held(0.01, dur * 0.9), v, at)
          this.voice(deck.lead, 'triangle', [[0, f / 2]], held(0.01, dur * 0.9), v * 0.8, at)
          break
        case 'box':
          this.bell(deck.lead, TINE, f, at, Math.max(dur, 1.5), v)
          break
      }
    }
    const shift = score.bass[slot]
    if (shift !== null) {
      const m = 48 + CHORDS[bar.chord].root + shift
      if (score.lead === 'box') this.bell(deck.out, TINE, hz(m) * 2, at, 2, LEVEL.bass * 0.8)
      else this.bassNote(deck.out, m, score.bassLen * deck.eighth * 0.95, at)
    }
    if (score.kit === 'shaker' && slot % 2 === 1) this.hiss(deck.out, 'highpass', [[0, 6000]], 0.7, struck(0.01, 0.06), LEVEL.tick * 0.8, at)
    if (score.kit === 'pop') {
      if (slot % 4 === 0) this.kick(deck.out, at, LEVEL.kick)
      else if (slot % 4 === 2) this.hiss(deck.out, 'highpass', [[0, 7000]], 0.7, struck(0.002, 0.045), LEVEL.tick, at)
    }
  }

  /** The engine starting its hum at `at`, idling until `humTo` speeds it up. */
  hum(at: number): Hum {
    // The putter: a gain shaking the whole hum a few times a second, the engine's purr.
    const putter = this.gain(0.75, this.effects)
    const level = this.ctx.createGain()
    level.gain.value = 0
    level.gain.setValueAtTime(0, at)
    level.connect(putter)
    const tone = this.filter('lowpass', 260, 0.7, level)
    const body = this.ctx.createOscillator()
    body.type = 'triangle'
    body.frequency.value = 46
    body.connect(level)
    const growl = this.ctx.createOscillator()
    growl.type = 'sawtooth'
    growl.frequency.value = 92
    growl.connect(tone)
    const putt = this.ctx.createOscillator()
    putt.frequency.value = 7
    const depth = this.ctx.createGain()
    depth.gain.value = 0.25
    putt.connect(depth).connect(putter.gain)
    for (const o of [body, growl, putt]) o.start(at)
    return { level, body, growl, tone, putt }
  }

  /** The hum follows the truck: higher, brighter, quicker and a little louder the faster it rolls up to its top speed on the flat (faster downhill changes nothing), revving a touch in the air. Still a purr at full speed. */
  humTo(hum: Hum, road: RoadState, at: number) {
    const u = Math.min(Math.abs(road.v) / TOP, 1)
    const f = 46 + 34 * u + (road.airborne ? 12 : 0)
    hum.body.frequency.setTargetAtTime(f, at, 0.12)
    hum.growl.frequency.setTargetAtTime(f * 2, at, 0.12)
    hum.tone.frequency.setTargetAtTime(260 + 520 * u, at, 0.12)
    hum.putt.frequency.setTargetAtTime(7 + 13 * u, at, 0.12)
    hum.level.gain.setTargetAtTime(0.01 + 0.01 * u, at, 0.2)
  }

  /** The engine stops: the hum fades within half a second. */
  humEnd(hum: Hum, at: number) {
    hum.level.gain.setTargetAtTime(0, at, 0.08)
    for (const o of [hum.body, hum.growl, hum.putt]) o.stop(at + 0.6)
  }

  /** A soft click. */
  private click(at: number) {
    this.voice(this.effects, 'sine', [[0, 1500], [0.03, 1000]], struck(0.002, 0.04), 0.14, at)
  }

  /** A soft kick: a falling sine with a little knock on top for small speakers. */
  private kick(out: AudioNode, at: number, vol: number) {
    this.voice(out, 'sine', [[0, 150], [0.12, 50]], struck(0.003, 0.16), vol, at)
    this.voice(out, 'triangle', [[0, 300], [0.04, 120]], struck(0.002, 0.05), vol * 0.25, at)
  }

  /** Three quick soft slaps and a short tail. */
  private clap(out: AudioNode, at: number, vol: number) {
    for (const dt of [0, 0.011, 0.022]) this.hiss(out, 'bandpass', [[0, 1100]], 0.9, struck(0.002, 0.012), vol * 1.2, at + dt)
    this.hiss(out, 'bandpass', [[0, 1100]], 0.9, struck(0.002, 0.12), vol * 0.8, at + 0.03)
  }

  /** A bass note: a triangle, with a quiet square for small speakers that cannot play the low notes themselves. */
  private bassNote(out: AudioNode, midi: number, dur: number, at: number) {
    this.voice(out, 'triangle', [[0, hz(midi)]], held(0.01, dur), LEVEL.bass, at)
    this.voice(out, 'square', [[0, hz(midi)]], held(0.01, dur), LEVEL.bass * 0.25, at)
  }

  /** A purr: low noise shaking `rate` times a second, swelling in and out over `dur`. */
  private purr(out: AudioNode, at: number, dur: number, vol: number, rate: number) {
    const shake = this.tremolo(out, rate, 0.45, at, dur + 0.02)
    this.hiss(shake, 'lowpass', [[0, 500]], 1.5, [[0, 0], [0.3, 1], [dur - 0.3, 0.8], [dur, 0]], vol, at)
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

  /** A struck bell, tine, bar or plate: a sine per partial, the higher ones dying sooner. */
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

  /** A gain into `out` that shakes between 1 - 2 * depth and 1, `rate` times a second, from `at` for `dur`: a buzz, a purr, a chug, a zip. */
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

/** The dedup key of an event's sound: a kind, or for the items and the answers the very voice, so two different items tapped together both sound. A sim tap and a HUD tap share one click. */
function keyOf(e: SimEvent): string {
  if (e.kind === 'play') return `play:${ITEMS[e.item].sound}`
  if (e.kind === 'answer') return `answer:${e.who}`
  return e.kind
}

/**
 * The sounds' lifecycle. `sound` is the master switch and `music` the music bus's; the
 * shell sets both from the save through setSound and setMusic.
 *
 * Browsers make no sound before the page is touched, so nothing here makes an AudioContext
 * until the first `unlock` (called from every gesture); until then every call only
 * remembers what it was asked. `setPaused` holds the music, the rooms' loops and the engine's
 * hum while the pause menu is open, the context running on so the menu's own sounds (the
 * parent gate's rising tone, a switch's click) play at once. `suspend` puts the context to
 * sleep while the page is hidden, and `resume` wakes it.
 *
 * Once a frame, `frame` plays the frame's events, keeps the engine's hum in step with the
 * truck, and changes the music when the child moves: the old piece fades out while the new
 * one fades in from its start (the street tune from the phrase it left), after any sting
 * that wants the stage (a theme's pick, evening falling). The music's clock wakes every
 * CLOCK_MS and schedules every step due within LOOKAHEAD; a clock that slept skips ahead
 * instead of catching up in a burst. Sound off or music off stops the clock too.
 */
export class Sounds {
  sound = true
  music = true
  private piece: Piece = 'none'
  private ctx: AudioContext | null = null
  private synth: Synth | null = null
  private deck: Deck | null = null
  private timer: ReturnType<typeof setTimeout> | undefined = undefined
  /** Context time before which no new piece starts: a sting is playing. */
  private quietUntil = 0
  /** Suspended by `suspend` and not resumed since. The context's own state lags behind, and a piece retired meanwhile must stop at once, not fade on after the wake. */
  private asleep = false
  /** The pause menu is open: no music and no hum. */
  private paused = false
  /** The step the street tune is to pick up from. */
  private streetStep = 0
  /** Context time each sound last played, by dedup key. */
  private last = new Map<string, number>()
  /** The engine's hum while a trip is on and the sound is on, and the real seconds until it next follows the truck. */
  private hum: Hum | null = null
  private humWait = 0

  /** Called from every user gesture: makes the audio context on the first, and wakes it whenever the browser has stopped it (iOS also has 'interrupted'), unless the game itself put it to sleep. */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.synth = new Synth(this.ctx)
      this.synth.master.gain.value = this.sound ? MASTER : 0
      this.synth.music.gain.value = this.music ? MUSIC : 0
      this.restart(0)
    }
    if (this.ctx.state !== 'running' && !this.asleep) void this.ctx.resume()
  }

  /** The master switch: off silences everything, stops the music's clock and the hum. */
  setSound(on: boolean): void {
    if (on === this.sound) return
    this.sound = on
    if (!this.synth) return
    this.synth.master.gain.setTargetAtTime(on ? MASTER : 0, this.ctx!.currentTime, 0.015)
    this.restart(HUSH)
  }

  /** The music's switch: off silences the music bus and stops its clock. */
  setMusic(on: boolean): void {
    if (on === this.music) return
    this.music = on
    if (!this.synth) return
    this.synth.music.gain.setTargetAtTime(on ? MUSIC : 0, this.ctx!.currentTime, 0.015)
    this.restart(HUSH)
  }

  /**
   * Once a frame: every event's sound, the engine hum while a trip is on (it follows the
   * truck every HUM_EVERY of the frames' `dt`, real seconds), and the music for where the
   * child is.
   */
  frame(s: State, events: readonly SimEvent[], dt: number): void {
    const piece = pieceFor(s)
    if (!this.synth) {
      this.piece = piece
      return
    }
    const synth = this.synth
    const now = this.ctx!.currentTime
    for (const e of events) {
      if (e.kind === 'theme') this.quietUntil = Math.max(this.quietUntil, now + THEME_FOR)
      if (e.kind === 'goodnight') this.quietUntil = Math.max(this.quietUntil, now + GOODNIGHT_FOR)
      const at = this.slot(keyOf(e), e.kind === 'honk' ? HORN_GAP : DEDUP)
      if (at >= 0) synth.event(e, s.keep.look.tool, at)
    }
    if (s.road && this.sound && !this.paused) {
      if (!this.hum) {
        this.hum = synth.hum(now)
        this.humWait = 0
      }
      this.humWait -= dt
      if (this.humWait <= 0) {
        synth.humTo(this.hum, s.road, now)
        this.humWait = HUM_EVERY
      }
    } else if (this.hum) {
      synth.humEnd(this.hum, now)
      this.hum = null
    }
    if (piece !== this.piece) {
      this.piece = piece
      this.restart(piece === 'none' ? FADE_OUT : FADE)
    }
  }

  /** A HUD sound; any of them ends the parent gate's rising tone. */
  ui(sound: UiSound): void {
    if (!this.synth) return
    this.synth.cut(this.ctx!.currentTime)
    const at = this.slot(sound, DEDUP)
    if (at >= 0) this.synth.ui(sound, at)
  }

  /** The pause menu opened (true) or closed: the music, a room's loop and the engine's hum stop and later start again, while the context keeps running for the menu's sounds. */
  setPaused(on: boolean): void {
    if (on === this.paused) return
    this.paused = on
    if (!this.synth) return
    if (on && this.hum) {
      this.synth.humEnd(this.hum, this.ctx!.currentTime)
      this.hum = null
    }
    this.restart(on ? HUSH : FADE)
  }

  /** The page hid: everything quiet at once. */
  suspend(): void {
    if (!this.ctx) return
    this.synth!.cut(this.ctx.currentTime)
    this.asleep = true
    void this.ctx.suspend()
  }

  /** And back. */
  resume(): void {
    if (!this.ctx) return
    this.asleep = false
    void this.ctx.resume()
  }

  /** The time to play a sound at, or -1 if it must not play: the sound is off, or the same key sounded under `gap` seconds ago. */
  private slot(key: string, gap: number): number {
    if (!this.sound) return -1
    const t = this.ctx!.currentTime
    const last = this.last.get(key)
    if (last !== undefined && t - last < gap) return -1
    this.last.set(key, t)
    return t
  }

  /** Fades out the piece that plays (over `fade`, at once while the context sleeps) and starts the current one once quietUntil has passed, unless nothing should play (or the game is paused). */
  private restart(fade: number) {
    const ctx = this.ctx!
    const synth = this.synth!
    const now = ctx.currentTime
    const crossfade = this.deck !== null && this.quietUntil <= now
    if (this.deck) {
      clearTimeout(this.timer)
      if (this.deck.piece === 'street') this.streetStep = this.deck.step - (this.deck.step % (PHRASE * TUNES.street.meter))
      synth.retire(this.deck, now, this.asleep || ctx.state !== 'running' ? 0 : fade)
      this.deck = null
    }
    if (this.piece === 'none' || !this.sound || !this.music || this.paused) return
    const at = Math.max(now + LEAD_IN, this.quietUntil)
    this.deck = synth.deck(this.piece, this.piece === 'street' ? this.streetStep : 0, at, crossfade ? FADE : LEAD_IN)
    this.tick()
  }

  /** The clock: schedules every step due within LOOKAHEAD, then sleeps CLOCK_MS. */
  private tick() {
    const deck = this.deck!
    const now = this.ctx!.currentTime
    // The timer slept (a background tab, a busy page): skip ahead rather than catch up in a burst.
    if (deck.next < now) deck.next = now + LEAD_IN
    while (deck.next < now + LOOKAHEAD) this.synth!.step(deck)
    this.timer = setTimeout(() => this.tick(), CLOCK_MS)
  }
}
