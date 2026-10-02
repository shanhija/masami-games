import { CHAIN_MAX, POLE_STARS, RUN, type EventKind, type RoomId, type SimEvent } from './model'

/** The tune to loop: a room's, the start screen's, the picnic's, or nothing. */
export type Tune = RoomId | 'rooms' | 'picnic' | 'none'
/**
 * Sounds the HUD makes that are not sim events. tap: a button. door: a room card opens.
 * locked: a card that is not open yet. hold: the parent gate's hold starts, a rising tone
 * that the next `ui` call of any kind cuts short (so letting go early calls `ui('tap')`).
 * fresh: the gate is done. found: a kitten is home on its card; the music waits for the
 * chime. start: a room starts; its tune waits for the four notes, then begins.
 */
export type UiSound = 'tap' | 'door' | 'locked' | 'hold' | 'fresh' | 'found' | 'start'

/** The mix: effects into their bus, tunes into theirs, both into the master and on through a compressor, so a pile of sounds at once never makes one loud burst. */
export const MASTER = 0.6
export const EFFECTS = 1
export const MUSIC = 0.35
/** The same kind of sound twice within this many seconds plays once. */
export const DEDUP = 0.05
/** A star within this many seconds of the last rings one note higher; after a longer pause the chime starts again at the bottom. */
export const STAR_RUN = 0.6
/** The star chime's notes (MIDI): the major pentatonic from C6 up. */
export const STAR_NOTES = [84, 86, 88, 91, 93, 96, 98, 100] as const
/** The rainbow ball's tunes run this much faster. */
export const FAST = 1.25
/** The start jingle, the end jingle and the kitten-home chime last this long, and no tune plays over them. */
export const START_FOR = 1.25
export const DONE_FOR = 2.25
export const FOUND_FOR = 1
/** The parent gate's rising tone. */
export const HOLD_FOR = 3
/** Tunes crossfade over FADE, fade away to no tune over FADE_OUT, and a jingle that wants quiet clears the tune over HUSH. */
const FADE = 0.3
const FADE_OUT = 1.2
const HUSH = 0.08
/** The clock wakes every CLOCK_MS and schedules every step due within LOOKAHEAD seconds; a tune starts LEAD_IN after it is asked for. */
const CLOCK_MS = 100
const LOOKAHEAD = 0.25
const LEAD_IN = 0.05
/** Exponential glides never reach zero: this is silence. */
const SILENT = 0.0001

/** The frequency of a MIDI note (A4, 69, is 440 Hz). */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
/** The i-th note of the C major pentatonic counted up from C4 (MIDI): the notes every run and jingle picks from. */
export const penta = (i: number) => 60 + [0, 2, 4, 7, 9][i % 5]! + 12 * Math.floor(i / 5)

/** The star chime's next rung after one that rang `gap` seconds ago: one higher within STAR_RUN (staying at the top), the bottom after a longer pause. */
export function climb(rung: number, gap: number): number {
  return gap <= STAR_RUN ? Math.min(rung + 1, STAR_NOTES.length - 1) : 0
}

// ---------------------------------------------------------------------------------------
// The music. Every tune is in C major over a pentatonic melody, so the star chime and the
// jingles, in C too, fit over any of them. Nothing is borrowed: the melodies are new, none
// opens like the overworld theme (E E . E . C E . G), and no jingle climbs in triplet
// arpeggios or cadences through the flat sixth and seventh.

/** The chords the tunes use: the root as a pitch class (C is 0) and the third above it; the fifth is always 7 up. */
export const CHORDS = {
  C: { root: 0, third: 4 },
  Dm: { root: 2, third: 3 },
  F: { root: 5, third: 4 },
  G: { root: 7, third: 4 },
  Am: { root: 9, third: 3 },
} as const
export type Chord = keyof typeof CHORDS

/** Where a bar sits in its tune: B2 is B with a new ending; the break is bass and drums only; the picnic closes with a coda and an end, which rings once and stops. */
export type Part = 'A' | 'B' | 'B2' | 'break' | 'coda' | 'end'

/** One bar, ready to play: its chord, and by eighth-note slot the melody note that starts there (MIDI, 0 for none) and how many slots it lasts. */
export interface Bar {
  part: Part
  chord: Chord
  notes: readonly number[]
  lengths: readonly number[]
}

/** Semitones above C of each note letter. */
const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** MIDI for a note name such as C5 (C4 is 60). */
function midi(name: string): number {
  const m = /^([A-G])([0-8])$/.exec(name)
  if (!m) throw new Error(`'${name}' is not a note: write a letter and an octave, like C5`)
  return PITCH[m[1]!]! + 12 * (Number(m[2]) + 1)
}

/**
 * Turns a melody written a bar per string into bars. A bar is eight eighth-note slots apart
 * by spaces: a note (C5), '-' to hold the note before (across a bar line too), or '.' for
 * silence. Throws on a bar of another length or a hold with nothing to hold.
 */
function section(part: Part, melody: readonly string[], chords: readonly Chord[]): Bar[] {
  if (melody.length !== chords.length) throw new Error(`${part}: ${melody.length} bars of melody but ${chords.length} chords`)
  const notes: number[] = []
  const lengths: number[] = []
  let held = -1
  melody.forEach((bar, b) => {
    const slots = bar.split(' ').filter((s) => s !== '')
    if (slots.length !== 8) throw new Error(`${part} bar ${b + 1} has ${slots.length} slots, not 8`)
    for (const s of slots) {
      if (s === '-') {
        if (held < 0) throw new Error(`${part} bar ${b + 1}: a '-' with nothing to hold`)
        lengths[held] = lengths[held]! + 1
      } else held = s === '.' ? -1 : notes.length
      const note = s === '-' || s === '.' ? 0 : midi(s)
      notes.push(note)
      lengths.push(note > 0 ? 1 : 0)
    }
  })
  return chords.map((chord, b) => ({ part, chord, notes: notes.slice(b * 8, b * 8 + 8), lengths: lengths.slice(b * 8, b * 8 + 8) }))
}

/** A bar of silence. */
const REST = '. . . . . . . .'
/** Pia's tune's chords, which the break plays over too. */
const A_CHORDS: readonly Chord[] = ['C', 'Am', 'F', 'G', 'Am', 'F', 'G', 'C']

/** Pia's tune, the A of every room: a skipping, curious walk that climbs up to look around, asks a question, and skips back home. */
const A = section(
  'A',
  [
    'C5 -  E5 G5 A5 -  G5 -',
    'A5 G5 E5 D5 E5 -  .  .',
    'C5 -  E5 G5 A5 -  C6 -',
    'D6 C6 A5 G5 D5 -  .  .',
    'A5 -  C6 A5 G5 -  E5 -',
    'A5 G5 A5 C6 G5 -  E5 -',
    'D5 E5 G5 -  A5 G5 E5 D5',
    'C5 -  -  -  .  .  G5 -',
  ],
  A_CHORDS,
)

/** Each room's own B, eight bars over its own chords, and the two bars that end B2 instead (over G, then home to C before the break). */
const B: Record<RoomId, { melody: readonly string[]; chords: readonly Chord[]; end: readonly string[] }> = {
  // Sunrise: birds calling to each other across the garden.
  garden: {
    melody: [
      'C6 A5 C6 A5 G5 -  .  .',
      'E5 G5 -  E5 C5 -  D5 -',
      'C6 A5 C6 D6 C6 -  A5 -',
      'G5 -  E5 -  D5 -  .  .',
      'C6 D6 E6 D6 C6 -  A5 -',
      'G5 A5 C6 -  A5 -  G5 -',
      'A5 G5 E5 G5 A5 -  G5 -',
      'D5 -  -  -  .  .  G4 -',
    ],
    chords: ['F', 'C', 'F', 'G', 'Am', 'F', 'Dm', 'G'],
    end: ['D5 E5 G5 A5 G5 -  D5 -', 'E5 -  D5 -  C5 -  -  -'],
  },
  // Morning: busy and bouncy, chop chop, stir stir.
  kitchen: {
    melody: [
      'A5 A5 C6 .  A5 G5 A5 .',
      'G5 G5 D6 .  D6 C6 A5 .',
      'G5 G5 E5 .  G5 A5 G5 .',
      'A5 .  E5 .  A5 .  .  .',
      'D5 D5 A5 .  A5 G5 E5 .',
      'D5 D5 G5 .  G5 A5 G5 .',
      'E5 G5 A5 G5 E5 .  C5 .',
      'D5 .  .  .  .  .  G4 .',
    ],
    chords: ['F', 'G', 'C', 'Am', 'Dm', 'G', 'C', 'G'],
    end: ['D5 E5 G5 A5 G5 .  E5 D5', 'C5 .  G4 .  C5 .  .  .'],
  },
  // Noon: lazy and floating, long notes on warm water.
  bath: {
    melody: [
      'A5 -  -  -  G5 -  A5 -',
      'G5 -  -  -  E5 -  -  -',
      'D5 -  E5 -  A5 -  -  -',
      'G5 -  -  -  -  -  .  .',
      'C6 -  -  -  A5 -  C6 -',
      'E6 -  -  -  C6 -  -  -',
      'D6 -  C6 -  A5 -  G5 -',
      'D5 -  -  -  .  .  G4 -',
    ],
    chords: ['F', 'C', 'Dm', 'G', 'F', 'Am', 'Dm', 'G'],
    end: ['D6 -  -  -  A5 -  G5 -', 'E5 -  -  -  C5 -  -  -'],
  },
  // Afternoon: a wind-up parade of toys marching round the rug.
  toys: {
    melody: [
      'E5 -  G5 -  C6 -  G5 -',
      'D5 -  G5 -  A5 G5 D5 -',
      'C6 -  A5 -  E5 -  A5 -',
      'A5 G5 A5 C6 A5 -  .  .',
      'G5 -  E5 -  G5 A5 G5 E5',
      'D5 -  G5 -  D6 -  -  -',
      'C6 A5 G5 A5 C6 -  A5 -',
      'G5 -  -  -  D5 -  G4 -',
    ],
    chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'],
    end: ['D6 C6 A5 G5 A5 -  G5 -', 'C6 -  -  -  G5 -  C6 -'],
  },
  // Night: soft and starry, a little brave.
  roof: {
    melody: [
      'E5 -  -  -  A5 -  C6 -',
      'C6 -  -  -  A5 -  -  -',
      'G5 -  -  -  E5 -  G5 -',
      'D6 -  -  -  -  -  .  .',
      'E6 -  -  -  C6 -  D6 -',
      'C6 -  -  -  A5 -  G5 -',
      'A5 -  -  -  D5 -  E5 -',
      'D5 -  -  -  .  .  G4 -',
    ],
    chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'G'],
    end: ['D6 -  -  -  E6 -  D6 -', 'C6 -  -  -  -  -  .  .'],
  },
}

/** A room's tune, 40 bars: A, its B, A, its B2, then the break, and round again. */
function roomBars(id: RoomId): Bar[] {
  const b = B[id]
  return [
    ...A,
    ...section('B', b.melody, b.chords),
    ...A,
    ...section('B2', [...b.melody.slice(0, 6), ...b.end], [...b.chords.slice(0, 6), 'G', 'C']),
    ...section('break', A_CHORDS.map(() => REST), A_CHORDS),
  ]
}

/** The picnic's close after Pia's tune: a last climb, then one big ringing C. */
const PICNIC_END = [
  ...section('coda', ['A5 -  C6 -  A5 G5 A5 -', 'D6 -  -  -  E6 -  D6 -'], ['F', 'G']),
  ...section('end', ['C6 -  -  -  -  -  -  -', REST], ['C', 'C']),
]

/** The lead's instrument. square: a square through a lowpass. pluck: short triangle notes. wave: a sine with a 5 Hz tremolo. box: a music box's tine. soft: a gentle lowpassed triangle with a faint octave above. */
type Lead = 'square' | 'pluck' | 'wave' | 'box' | 'soft'
/** The bass. bounce: root and fifth on the beats. hop: a staccato root, octave, fifth, octave. float: long notes, root then fifth. comb: the same on a music box's low tines. */
type Bass = 'bounce' | 'hop' | 'float' | 'comb'
/** The drums: a soft kick under a tick of its own. hat: a soft hi-hat on the backbeat. wood: a woodblock ticking on the off-beats. drip: a high water blip on the off-beat of 2 and 4. clock: a clockwork tick on the beats. night: the kick alone, with a star twinkling every other bar. clap: claps on the backbeat. none: no drums. */
type Kit = 'hat' | 'wood' | 'drip' | 'clock' | 'night' | 'clap' | 'none'

/** A tune and its arrangement. */
export interface Score {
  bpm: number
  /** Whether it starts over at the end (every tune but the picnic's). */
  loop: boolean
  bars: readonly Bar[]
  lead: Lead
  /** Semitones the lead plays above the written melody. */
  octave: number
  /** The lead echoes itself an eighth later, softer, on a bell. */
  echo: boolean
  bass: Bass
  kit: Kit
}

/** Every tune, with what it is meant to feel like. */
export const SCORES: Record<Exclude<Tune, 'none'>, Score> = {
  /** Sunrise in the garden: bright and skipping. */
  garden: { bpm: 112, loop: true, bars: roomBars('garden'), lead: 'square', octave: 0, echo: false, bass: 'bounce', kit: 'hat' },
  /** Morning in the kitchen: busy and bouncy, a clock ticking on the wall. */
  kitchen: { bpm: 120, loop: true, bars: roomBars('kitchen'), lead: 'pluck', octave: 0, echo: false, bass: 'hop', kit: 'wood' },
  /** Noon in the bath: lazy and floating, bubbles popping on the off-beat. */
  bath: { bpm: 100, loop: true, bars: roomBars('bath'), lead: 'wave', octave: 0, echo: false, bass: 'float', kit: 'drip' },
  /** Afternoon in the toy room: a wind-up music box parade. */
  toys: { bpm: 108, loop: true, bars: roomBars('toys'), lead: 'box', octave: 12, echo: true, bass: 'comb', kit: 'clock' },
  /** Night on the roof: soft and starry. */
  roof: { bpm: 96, loop: true, bars: roomBars('roof'), lead: 'soft', octave: 0, echo: false, bass: 'float', kit: 'night' },
  /** The start screen: Pia's tune alone on a slow music box. */
  rooms: { bpm: 84, loop: true, bars: A, lead: 'box', octave: 12, echo: false, bass: 'comb', kit: 'none' },
  /** The picnic under the moon: Pia's tune quick and clapping, then an ending, once. */
  picnic: { bpm: 126, loop: false, bars: [...A, ...PICNIC_END], lead: 'square', octave: 0, echo: false, bass: 'bounce', kit: 'clap' },
}

/** How long a tune runs before it starts over (or, the picnic's, ends), in seconds. */
export const tuneSeconds = (tune: Exclude<Tune, 'none'>) => (SCORES[tune].bars.length * 8 * 30) / SCORES[tune].bpm

/** Each bass: per eighth-note slot the semitones above the chord's root it plays (null for none), and how many slots a note lasts. */
const BASS: Record<Bass, { line: readonly (number | null)[]; len: number }> = {
  bounce: { line: [0, null, 7, null, 0, null, 7, null], len: 2 },
  hop: { line: [0, null, 12, null, 7, null, 12, null], len: 1 },
  float: { line: [0, null, null, null, 7, null, null, null], len: 4 },
  comb: { line: [0, null, null, null, 7, null, null, null], len: 4 },
}
/** In the break every bass plays this busier line, an eighth a note: the groove that carries the tune while the melody rests. */
const BREAK_LINE: readonly (number | null)[] = [0, null, 7, 0, 12, null, 7, null]
/** Each kit: the slots its kick plays on and the slots its tick plays on. */
const KITS: Record<Kit, { kicks: readonly number[]; ticks: readonly number[] }> = {
  hat: { kicks: [0, 4], ticks: [2, 6] },
  wood: { kicks: [0, 4], ticks: [1, 3, 5, 7] },
  drip: { kicks: [0], ticks: [3, 7] },
  clock: { kicks: [0], ticks: [0, 2, 4, 6] },
  night: { kicks: [0], ticks: [] },
  clap: { kicks: [0, 4], ticks: [2, 6] },
  none: { kicks: [], ticks: [] },
}
/** Each lead's level inside the music bus, measured so that every room's tune sounds about as loud as the others (a short triangle needs more than a held square). */
const LEAD: Record<Lead, number> = { square: 0.07, pluck: 0.2, wave: 0.1, box: 0.1, soft: 0.09 }
/** The other voices' levels inside the music bus. */
const LEVEL = { bass: 0.1, kick: 0.12, tick: 0.04, arp: 0.03, echo: 0.03, twinkle: 0.025 }
/** The roof's star twinkles, a note each other bar (MIDI). */
const TWINKLES = [91, 96, 93, 100, 98] as const

// ---------------------------------------------------------------------------------------
// The voices.

/** The oscillator shapes the voices use. */
type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle'
/** A pitch or a level over time: [seconds from the start, value] points with exponential glides between them. */
type Curve = readonly (readonly [number, number])[]
/** Struck: up to full over `attack`, then dying away to silence at `dur`. */
const struck = (attack: number, dur: number): Curve => [
  [0, 0],
  [attack, 1],
  [dur, 0],
]
/** Plucked: up at once, down to half within 0.09 s, then ringing away to silence at `dur`: a short note that still has a body. */
const plucked = (dur: number): Curve => [
  [0, 0],
  [0.004, 1],
  [0.09, 0.45],
  [dur, 0],
]
/** Held: up to full over `attack`, easing to 0.7 by three quarters of `dur`, silent at `dur`. */
const held = (attack: number, dur: number): Curve => [
  [0, 0],
  [attack, 1],
  [dur * 0.75, 0.7],
  [dur, 0],
]

/** A struck sound's partials as [ratio to the fundamental, level]; the higher ones die sooner. */
type Partials = readonly (readonly [number, number])[]
/** The star's little glockenspiel. */
const GLASS: Partials = [
  [1, 1],
  [2.76, 0.3],
  [5.4, 0.1],
]
/** A music box's comb. */
const TINE: Partials = [
  [1, 1],
  [3, 0.08],
  [6.2, 0.14],
]
/** A round bell for the jingles. */
const CHIME: Partials = [
  [1, 1],
  [2, 0.45],
  [3, 0.18],
  [4.2, 0.08],
]
/** The jump's three pitches in turn (semitones), so a row of hops stays fresh. */
const JUMP_TURNS = [0, 2, 4] as const

/** Sets `param` along `curve` from time `at`, each value times `scale`; never below SILENT, since an exponential glide cannot reach zero. */
function glide(param: AudioParam, curve: Curve, at: number, scale: number) {
  curve.forEach(([t, v], i) => {
    const value = Math.max(v * scale, SILENT)
    if (i > 0) param.exponentialRampToValueAtTime(value, at + t)
    else {
      // The first value holds from now on as well: a buffer source can start a sample before the param's first event, and must not meet a gain's default of 1 there (a click).
      param.value = value
      param.setValueAtTime(value, at + t)
    }
  })
}

/** A tune playing: its score, its faders and tone, and where its clock is. */
export interface Deck {
  score: Score
  fast: boolean
  /** Its fader into the music bus, which tunes crossfade on. */
  out: GainNode
  /** Where the lead, the bass and the rainbow arpeggio go in. */
  lead: AudioNode
  bass: AudioNode
  arp: GainNode
  /** The bath's tremolo, running as long as the deck. */
  lfo: OscillatorNode | null
  /** The next step to play, counted from the first bar, and when. */
  step: number
  next: number
}

/**
 * Every voice of the game on one audio context: the buses, the master and the compressor,
 * the effects, the HUD sounds and the steps of the tunes. Sounds runs it on the page's
 * AudioContext; it runs as well on any other (an OfflineAudioContext renders it to measure).
 */
export class Synth {
  readonly ctx: BaseAudioContext
  readonly master: GainNode
  readonly effects: GainNode
  readonly music: GainNode
  /** Two seconds of white noise every noisy sound loops over. */
  private white: AudioBuffer
  /** The star chime's rung and when it last rang, and the jumps so far, which pick the jump's pitch. */
  private rung = 0
  private starAt = -Infinity
  private jumps = 0
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
    this.white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = this.white.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }

  /** The sound of one sim event at time `at` (model.ts says what n is for each kind). */
  event(kind: EventKind, n: number, at: number) {
    const fx = this.effects
    switch (kind) {
      case 'jump': {
        // A short blip up from about 400 Hz, a little higher the faster she took off, on the next of three pitches.
        const f = 400 * 2 ** ((JUMP_TURNS[this.jumps % JUMP_TURNS.length]! + 2 * Math.min(Math.abs(n) / RUN, 1)) / 12)
        this.jumps += 1
        this.voice(fx, 'sine', [[0, f], [0.08, f * 1.75]], struck(0.004, 0.09), 0.08, at)
        return
      }
      case 'land':
        // Silent after a hop; a soft tap after a big drop.
        if (n > 3) {
          this.voice(fx, 'sine', [[0, 170], [0.08, 70]], struck(0.003, 0.1), 0.09, at)
          this.hiss(fx, 'lowpass', [[0, 900]], 0, struck(0.002, 0.05), 0.04, at)
        }
        return
      case 'skid':
        // A short swish.
        this.hiss(fx, 'bandpass', [[0, 1600], [0.15, 3200]], 0.8, [[0, 0], [0.03, 1], [0.16, 0]], 0.14, at)
        return
      case 'bonk':
        // A soft wooden tock.
        this.voice(fx, 'sine', [[0, 760], [0.07, 640]], struck(0.002, 0.08), 0.1, at)
        this.voice(fx, 'sine', [[0, 1830]], struck(0.001, 0.03), 0.025, at)
        return
      case 'bump':
        // A hollow knock, lower and rounder than the tock.
        this.voice(fx, 'triangle', [[0, 250], [0.14, 175]], struck(0.003, 0.15), 0.12, at)
        this.voice(fx, 'sine', [[0, 590], [0.06, 470]], struck(0.002, 0.06), 0.04, at)
        return
      case 'break':
        // A cookie crunching: a burst of noise, then a tiny crumble.
        this.hiss(fx, 'bandpass', [[0, 2400], [0.14, 1200]], 0.7, plucked(0.16), 0.2, at)
        ;[0.1, 0.16, 0.24].forEach((dt, i) => this.hiss(fx, 'bandpass', [[0, 3400 - i * 500]], 1.5, struck(0.001, 0.04), 0.1 - i * 0.025, at + dt))
        return
      case 'star':
      case 'giftStar':
        // A bright plink, one step up the pentatonic for every star close after the last.
        this.rung = climb(this.rung, at - this.starAt)
        this.starAt = at
        this.bell(fx, GLASS, hz(STAR_NOTES[this.rung]!), at, 0.45, 0.185)
        return
      case 'sprout':
        // A little sparkle rising out of the box.
        this.voice(fx, 'sine', [[0, 600], [0.35, 1300]], [[0, 0], [0.05, 1], [0.35, 0]], 0.04, at)
        ;[88, 91, 96].forEach((m, i) => this.bell(fx, GLASS, hz(m), at + 0.08 + i * 0.09, 0.25, 0.05))
        return
      case 'grow':
        // A warm shimmer up five notes of the pentatonic, the last one ringing.
        ;[76, 79, 81, 84, 88].forEach((m, i) => {
          this.voice(fx, 'triangle', [[0, hz(m)]], struck(0.004, i === 4 ? 0.55 : 0.18), 0.14, at + i * 0.065)
          this.voice(fx, 'sine', [[0, hz(m) * 2.005]], struck(0.004, i === 4 ? 0.4 : 0.12), 0.042, at + i * 0.065)
        })
        return
      case 'wand':
        // Five bubbly notes, each scooping up into place, the last one ringing.
        ;[79, 81, 84, 86, 91].forEach((m, i) => this.voice(fx, 'sine', [[0, hz(m) * 0.85], [0.03, hz(m)]], struck(0.004, i === 4 ? 0.5 : 0.16), 0.13, at + i * 0.075))
        this.bell(fx, GLASS, hz(103), at + 0.32, 0.4, 0.03)
        return
      case 'ball':
        // A quick glittery sweep up two octaves over a hiss of sparkle.
        for (let i = 0; i < 11; i++) this.bell(fx, GLASS, hz(penta(5 + i)), at + i * 0.028, 0.3, 0.07)
        this.hiss(fx, 'highpass', [[0, 5000]], 0, [[0, 0], [0.1, 1], [0.4, 0]], 0.02, at)
        return
      case 'ballEnd':
        // The same sweep, falling softly.
        for (let i = 0; i < 11; i++) this.bell(fx, GLASS, hz(penta(15 - i)), at + i * 0.04, 0.3, 0.035)
        return
      case 'shrink': {
        // A soft wobble down: a form went away, nothing worse.
        const o = this.voice(fx, 'sine', [[0, 620], [0.4, 310]], [[0, 0], [0.02, 1], [0.12, 0.5], [0.42, 0]], 0.06, at)
        this.vibrato([o.frequency], 7, [[0, 25]], at, 0.42)
        return
      }
      case 'hurt':
        // A cartoon boop down.
        this.voice(fx, 'sine', [[0, 520], [0.16, 250]], struck(0.006, 0.18), 0.1, at)
        this.voice(fx, 'triangle', [[0, 260], [0.16, 125]], struck(0.006, 0.16), 0.03, at)
        return
      case 'stomp': {
        // A squishy boing, a step higher for every stomp in the chain.
        const f = hz(penta(Math.min(Math.max(n, 1), CHAIN_MAX) - 1))
        const o = this.voice(fx, 'sine', [[0, f * 0.7], [0.05, f * 1.5], [0.2, f]], struck(0.003, 0.22), 0.2, at)
        this.vibrato([o.frequency], 14, [[0, f * 0.06]], at, 0.22)
        this.hiss(fx, 'lowpass', [[0, 900], [0.06, 300]], 0, struck(0.002, 0.06), 0.05, at)
        return
      }
      case 'kick':
        // A thunk.
        this.voice(fx, 'sine', [[0, 150], [0.09, 65]], struck(0.002, 0.11), 0.155, at)
        this.hiss(fx, 'lowpass', [[0, 700]], 0, struck(0.001, 0.03), 0.06, at)
        return
      case 'shellPop':
        // A sparkly pop, then a plink for each star it paid.
        this.voice(fx, 'sine', [[0, 320], [0.05, 950]], struck(0.002, 0.06), 0.12, at)
        for (let i = 0; i < Math.min(n, 5); i++) this.bell(fx, GLASS, hz(penta(12 + i)), at + 0.06 + i * 0.07, 0.3, 0.095)
        return
      case 'knock': {
        // A boing that tumbles away.
        const o = this.voice(fx, 'sine', [[0, 320], [0.08, 640], [0.55, 170]], [[0, 0], [0.01, 1], [0.12, 0.8], [0.55, 0]], 0.058, at)
        this.vibrato([o.frequency], 9, [[0, 30]], at, 0.55)
        return
      }
      case 'wake':
        // A tiny sleepy "hm?", rising at the end.
        this.voice(this.filter('lowpass', 1000, 0, fx), 'triangle', [[0, 250], [0.1, 240], [0.3, 360]], [[0, 0], [0.05, 1], [0.24, 0.8], [0.3, 0]], 0.03, at)
        return
      case 'blow':
        // A soft bubble blip.
        this.voice(fx, 'sine', [[0, 380], [0.07, 950]], struck(0.004, 0.08), 0.1, at)
        return
      case 'trap':
        // A bloop: a bubble closing round something.
        this.voice(fx, 'sine', [[0, 880], [0.05, 340], [0.17, 620]], struck(0.004, 0.19), 0.08, at)
        return
      case 'pop':
        // A pop.
        this.voice(fx, 'sine', [[0, 1100], [0.035, 360]], struck(0.001, 0.045), 0.11, at)
        this.hiss(fx, 'highpass', [[0, 2500]], 0, struck(0.001, 0.02), 0.055, at)
        return
      case 'spring': {
        // A springy boing that settles.
        const o = this.voice(fx, 'sine', [[0, 220], [0.1, 520], [0.42, 440]], struck(0.003, 0.45), 0.155, at)
        this.vibrato([o.frequency], 11, [[0, 60], [0.42, 4]], at, 0.45)
        return
      }
      case 'fall':
        // A soft bloop down: the rescue bubble is on its way.
        this.voice(fx, 'sine', [[0, 520], [0.3, 200]], struck(0.01, 0.32), 0.08, at)
        return
      case 'rescued':
        // A rising bloop and a chime; carried across the gap at last (n = 1), three chimes up.
        this.voice(fx, 'sine', [[0, 260], [0.18, 620]], struck(0.005, 0.2), 0.08, at)
        ;(n === 1 ? [91, 93, 96] : [91]).forEach((m, i) => this.bell(fx, CHIME, hz(m), at + 0.16 + i * 0.14, 0.7, 0.08))
        return
      case 'pole': {
        // A bright run up the pentatonic, longer and louder the higher she caught the pole.
        const k = Math.min(Math.max(n, 1), POLE_STARS)
        for (let i = 0; i < 7 + k; i++) this.bell(fx, GLASS, hz(penta(5 + i)), at + i * 0.035, 0.35, 0.04 + 0.008 * k)
        return
      }
      case 'kitten': {
        // A meow: a sine and a buzzier saw through a little mouth that closes, 600 up to 900 and down to 500 Hz with a 6 Hz vibrato. Then a two-note chime.
        const path: Curve = [[0, 600], [0.12, 900], [0.35, 500]]
        const level: Curve = [[0, 0], [0.04, 1], [0.24, 0.75], [0.35, 0]]
        const mouth = this.filter('bandpass', 1800, 2, fx)
        glide(mouth.frequency, [[0, 1800], [0.35, 900]], at, 1)
        const pure = this.voice(fx, 'sine', path, level, 0.11, at)
        const buzz = this.voice(mouth, 'sawtooth', path, level, 0.07, at)
        this.vibrato([pure.frequency, buzz.frequency], 6, [[0, 15]], at, 0.35)
        this.bell(fx, CHIME, hz(84), at + 0.45, 0.8, 0.11)
        this.bell(fx, CHIME, hz(93), at + 0.63, 1.1, 0.12)
        return
      }
      case 'bossHit': {
        // A low "hmph" and a bounce, a little higher with fewer stomps left (n).
        const f = 200 - 20 * Math.min(n, 3)
        const mouth = this.filter('lowpass', 700, 0, fx)
        this.voice(mouth, 'triangle', [[0, f], [0.07, f * 0.78], [0.15, f * 1.4], [0.26, f * 0.9]], [[0, 0], [0.02, 1], [0.1, 0.6], [0.26, 0]], 0.16, at)
        this.hiss(mouth, 'lowpass', [[0, 500]], 0, struck(0.01, 0.08), 0.03, at)
        return
      }
      case 'bossDown':
        // A happy pop and four bells up: the Big Grumble is a bunny now.
        this.voice(fx, 'sine', [[0, 400], [0.06, 1200]], struck(0.002, 0.08), 0.12, at)
        ;[86, 88, 91, 93].forEach((m, i) => this.bell(fx, CHIME, hz(m), at + 0.08 + i * 0.08, i === 3 ? 0.8 : 0.35, 0.09))
        return
      case 'gate':
        // A magic shimmer: high bells in a scatter over a soft swell.
        ;[96, 91, 98, 93, 100, 88, 96].forEach((m, i) => this.bell(fx, GLASS, hz(m), at + i * 0.06, 0.4, 0.045))
        this.hiss(fx, 'highpass', [[0, 6000]], 0, [[0, 0], [0.3, 1], [0.75, 0]], 0.02, at)
        this.voice(fx, 'sine', [[0, hz(60)], [0.7, hz(67)]], [[0, 0], [0.25, 1], [0.75, 0]], 0.05, at)
        return
      case 'done': {
        // The room's end jingle, the loudest and happiest thing in the game: three little
        // climbs (do re mi SOL, mi sol LA, sol la DO) over C, F, G and a ringing C.
        const brass = this.filter('lowpass', 2600, 0, fx)
        const tune: readonly (readonly [number, number, number])[] = [
          [0, 72, 0.11], [0.12, 74, 0.11], [0.24, 76, 0.11], [0.36, 79, 0.22],
          [0.6, 76, 0.11], [0.72, 79, 0.11], [0.84, 81, 0.22],
          [1.08, 79, 0.11], [1.2, 81, 0.11], [1.32, 84, 0.85],
        ]
        for (const [dt, m, len] of tune) {
          this.voice(brass, 'square', [[0, hz(m)]], held(0.008, len), 0.115, at + dt)
          this.voice(fx, 'triangle', [[0, hz(m - 12)]], held(0.008, len), 0.075, at + dt)
        }
        const chords: readonly (readonly [number, readonly number[], number])[] = [
          [0, [60, 64, 67], 0.5],
          [0.6, [60, 65, 69], 0.45],
          [1.08, [62, 67, 71], 0.22],
          [1.32, [60, 64, 67, 72], 0.85],
        ]
        for (const [dt, notes, len] of chords) for (const m of notes) this.voice(fx, 'triangle', [[0, hz(m)]], held(0.01, len), 0.045, at + dt)
        ;[91, 96, 100, 103].forEach((m, i) => this.bell(fx, GLASS, hz(m), at + 1.32 + i * 0.07, 0.6, 0.05))
        this.kick(fx, at)
        this.kick(fx, at + 1.32)
        this.hiss(fx, 'highpass', [[0, 6000]], 0, struck(0.01, 0.85), 0.025, at + 1.32)
        return
      }
      default: {
        const unheard: never = kind
        throw new Error(`no sound for ${String(unheard)}`)
      }
    }
  }

  /** A HUD sound at time `at`. */
  ui(kind: UiSound, at: number) {
    const fx = this.effects
    switch (kind) {
      case 'tap':
        // A soft click.
        this.voice(fx, 'sine', [[0, 1400], [0.03, 950]], struck(0.001, 0.035), 0.085, at)
        return
      case 'door':
        // A door opening on a room: a breath of air and two high bells together.
        this.hiss(fx, 'bandpass', [[0, 500], [0.45, 2400]], 1.4, [[0, 0], [0.12, 1], [0.5, 0]], 0.035, at)
        this.bell(fx, CHIME, hz(96), at + 0.05, 0.9, 0.04)
        this.bell(fx, CHIME, hz(91), at + 0.05, 0.9, 0.05)
        return
      case 'locked': {
        // A gentle "nuh-uh": two soft notes, the second lower.
        const soft = this.filter('lowpass', 1200, 0, fx)
        this.voice(soft, 'triangle', [[0, 392], [0.11, 380]], [[0, 0], [0.01, 1], [0.08, 0.8], [0.12, 0]], 0.058, at)
        this.voice(soft, 'triangle', [[0, 330], [0.2, 300]], [[0, 0], [0.01, 1], [0.12, 0.8], [0.22, 0]], 0.058, at + 0.16)
        return
      }
      case 'hold': {
        // The parent gate filling up: a sine and its fifth rising for HOLD_FOR, swelling. Its own fader cuts it short.
        this.holding = this.gain(1, fx)
        const rise: Curve = [[0, 262], [HOLD_FOR, 784]]
        const swell: Curve = [[0, 0], [0.2, 0.6], [HOLD_FOR - 0.2, 1], [HOLD_FOR, 0]]
        this.voice(this.holding, 'sine', rise, swell, 0.046, at)
        this.voice(this.holding, 'sine', [[0, 393], [HOLD_FOR, 1176]], swell, 0.016, at)
        return
      }
      case 'fresh':
        // Done: an open bell chord, then a sparkle on top.
        this.bell(fx, CHIME, hz(84), at, 1.2, 0.09)
        this.bell(fx, CHIME, hz(91), at, 1.2, 0.07)
        this.bell(fx, GLASS, hz(100), at + 0.15, 0.6, 0.05)
        return
      case 'found':
        // A kitten home: four notes up on the music box, the last one ringing.
        ;[79, 81, 84, 88].forEach((m, i) => this.bell(fx, TINE, hz(m), at + i * 0.11, i === 3 ? FOUND_FOR - 0.33 : 0.4, 0.1))
        return
      case 'start':
        // A room starts: four notes up the pentatonic, the last ringing until the tune comes in.
        ;[72, 74, 76, 79].forEach((m, i) => {
          this.bell(fx, TINE, hz(m), at + i * 0.16, i === 3 ? START_FOR - 0.48 : 0.5, 0.1)
          this.voice(fx, 'triangle', [[0, hz(m)]], struck(0.01, i === 3 ? 0.7 : 0.25), 0.05, at + i * 0.16)
        })
        return
      default: {
        const unheard: never = kind
        throw new Error(`no sound for ${String(unheard)}`)
      }
    }
  }

  /** Ends the parent gate's tone, if it sounds, within 50 ms of `at`. */
  cut(at: number) {
    if (!this.holding) return
    this.holding.gain.setValueAtTime(1, at)
    this.holding.gain.linearRampToValueAtTime(0, at + 0.05)
    this.holding = null
  }

  /** A deck for `tune` whose first step plays at `at`, fading in over `fadeIn`. */
  deck(tune: Exclude<Tune, 'none'>, fast: boolean, at: number, fadeIn: number): Deck {
    const score = SCORES[tune]
    const out = this.gain(0, this.music)
    out.gain.setValueAtTime(0, at)
    out.gain.linearRampToValueAtTime(1, at + fadeIn)
    let lead: AudioNode = out
    let lfo: OscillatorNode | null = null
    if (score.lead === 'square') lead = this.filter('lowpass', 1800, 0, out)
    else if (score.lead === 'soft') lead = this.filter('lowpass', 1500, 0, out)
    else if (score.lead === 'wave') {
      // The tremolo: a gain swinging between 0.5 and 1, five times a second.
      const tremolo = this.gain(0.75, out)
      lfo = this.ctx.createOscillator()
      lfo.frequency.value = 5
      const depth = this.ctx.createGain()
      depth.gain.value = 0.25
      lfo.connect(depth)
      depth.connect(tremolo.gain)
      lfo.start(at)
      lead = tremolo
    }
    return { score, fast, out, lead, bass: this.filter('lowpass', 900, 0, out), arp: this.gain(fast ? 1 : 0, out), lfo, step: 0, next: at }
  }

  /** Switches a deck to the rainbow ball's tempo and arpeggio or back, from its next step; the arpeggio fades. */
  speed(deck: Deck, fast: boolean, at: number) {
    deck.fast = fast
    const g = deck.arp.gain
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(fast ? 1 : 0, at + FADE)
  }

  /** Fades a deck out over `fade` from `at`: what it has scheduled plays on into silence. */
  retire(deck: Deck, at: number, fade: number) {
    const g = deck.out.gain
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(0, at + fade)
    if (deck.lfo) deck.lfo.stop(at + fade + 0.05)
  }

  /** Plays the deck's next step at `at` and moves its clock on an eighth note. */
  step(deck: Deck, at: number) {
    const { score } = deck
    const eighth = 30 / (score.bpm * (deck.fast ? FAST : 1))
    const index = Math.floor(deck.step / 8) % score.bars.length
    const bar = score.bars[index]!
    const slot = deck.step % 8
    const { root, third } = CHORDS[bar.chord]
    const note = bar.notes[slot]!
    // An end bar sounds only on its first slot, and only if a note starts there: the last chord rings, then nothing.
    const sounds = bar.part !== 'end' || (slot === 0 && note > 0)
    if (note > 0) this.lead(deck, note + score.octave, bar.lengths[slot]! * eighth, eighth, at)
    const line = bar.part === 'break' ? BREAK_LINE : BASS[score.bass].line
    const shift = line[slot]
    if (sounds && shift !== null) {
      const len = bar.part === 'break' ? 1 : bar.part === 'end' ? 8 : BASS[score.bass].len
      this.bassNote(deck, 43 + ((root + 5) % 12) + shift, len * eighth, at)
    }
    const kit = KITS[score.kit]
    if (sounds && kit.kicks.includes(slot)) this.kick(deck.out, at)
    if (sounds && kit.ticks.includes(slot)) this.tick(deck.out, score.kit, slot, at)
    if (bar.part === 'end' && sounds) this.hiss(deck.out, 'highpass', [[0, 6000]], 0, struck(0.005, 1.6), LEVEL.tick, at)
    if (score.kit === 'night' && slot === 7 && index % 2 === 1) this.bell(deck.out, GLASS, hz(TWINKLES[(index >> 1) % TWINKLES.length]!), at, 0.6, LEVEL.twinkle)
    if (deck.fast && bar.part !== 'end') {
      // The rainbow layer: the chord broken in sixteenths an octave above the tune.
      for (let k = 0; k < 2; k++) {
        const tone = [0, third, 7, third][(slot * 2 + k) % 4]!
        this.voice(deck.arp, 'sine', [[0, hz(84 + root + tone)]], struck(0.002, 0.09), LEVEL.arp, at + (k * eighth) / 2)
      }
    }
    deck.step += 1
    deck.next = at + eighth
  }

  /** A melody note on the deck's lead, `dur` long. */
  private lead(deck: Deck, note: number, dur: number, eighth: number, at: number) {
    const f = hz(note)
    const out = deck.lead
    const v = LEAD[deck.score.lead]
    switch (deck.score.lead) {
      case 'square':
        this.voice(out, 'square', [[0, f]], held(0.01, dur), v, at)
        return
      case 'pluck':
        this.voice(out, 'triangle', [[0, f]], plucked(Math.min(dur, 0.25) + 0.2), v, at)
        return
      case 'wave':
        this.voice(out, 'sine', [[0, f]], held(0.03, dur), v, at)
        return
      case 'box':
        this.bell(out, TINE, f, at, Math.max(dur, 1.6), v)
        if (deck.score.echo) this.bell(out, CHIME, f, at + eighth, 0.6, LEVEL.echo)
        return
      case 'soft':
        this.voice(out, 'triangle', [[0, f]], held(0.06, dur), v, at)
        this.voice(out, 'sine', [[0, f * 2]], held(0.08, dur), v * 0.2, at)
        return
      default: {
        const unknown: never = deck.score.lead
        throw new Error(`no lead ${String(unknown)}`)
      }
    }
  }

  /** A bass note: a triangle with a quiet square for the small speakers that cannot play the low notes themselves, or on a music box a tine an octave up. */
  private bassNote(deck: Deck, note: number, dur: number, at: number) {
    const f = hz(note)
    if (deck.score.bass === 'comb') {
      this.bell(deck.bass, TINE, f * 2, at, Math.max(dur, 1.8), LEVEL.bass * 1.3)
      return
    }
    // The kitchen's hop is short, so it plays a little louder to weigh the same.
    const v = deck.score.bass === 'hop' ? LEVEL.bass * 1.4 : LEVEL.bass
    this.voice(deck.bass, 'triangle', [[0, f]], held(0.01, dur * 0.95), v, at)
    this.voice(deck.bass, 'square', [[0, f]], held(0.01, dur * 0.95), v * 0.25, at)
  }

  /** A soft kick: a falling sine with a little knock on top for the small speakers. */
  private kick(out: AudioNode, at: number) {
    this.voice(out, 'sine', [[0, 150], [0.12, 50]], struck(0.002, 0.16), LEVEL.kick, at)
    this.voice(out, 'triangle', [[0, 300], [0.04, 120]], struck(0.001, 0.05), LEVEL.kick * 0.25, at)
  }

  /** The kit's tick on `slot`. */
  private tick(out: AudioNode, kit: Kit, slot: number, at: number) {
    const v = LEVEL.tick
    switch (kit) {
      case 'hat':
        this.hiss(out, 'highpass', [[0, 7000]], 0, struck(0.001, 0.045), v, at)
        return
      case 'wood':
        // Tick and tock in turn.
        this.voice(out, 'sine', [[0, slot % 4 === 1 ? 1250 : 950]], struck(0.001, 0.05), v, at)
        return
      case 'drip':
        this.voice(out, 'sine', [[0, 1700], [0.04, 2500]], struck(0.002, 0.05), v * 0.9, at)
        return
      case 'clock':
        this.voice(out, 'sine', [[0, slot % 4 === 0 ? 2600 : 2000]], struck(0.001, 0.025), v * 0.8, at)
        return
      case 'clap':
        // Three quick slaps and a short tail.
        for (const dt of [0, 0.011, 0.022]) this.hiss(out, 'bandpass', [[0, 1100]], 0.9, struck(0.001, 0.012), v * 1.2, at + dt)
        this.hiss(out, 'bandpass', [[0, 1100]], 0.9, struck(0.002, 0.12), v * 0.8, at + 0.03)
        return
      case 'night':
      case 'none':
        throw new Error(`the ${kit} kit has no tick`)
      default: {
        const unknown: never = kit
        throw new Error(`no kit ${String(unknown)}`)
      }
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

  /** A stretch of the white noise through one filter, its cutoff along `freq` and its level along `level` times `vol`. */
  private hiss(out: AudioNode, type: BiquadFilterType, freq: Curve, q: number, level: Curve, vol: number, at: number) {
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
    src.start(at, Math.random() * 1.5)
    src.stop(at + level[level.length - 1]![0] + 0.02)
  }

  /** A struck bell, tine or glass: a sine per partial, the higher ones dying sooner. */
  private bell(out: AudioNode, partials: Partials, f: number, at: number, dur: number, vol: number) {
    partials.forEach(([ratio, level], i) => this.voice(out, 'sine', [[0, f * ratio]], struck(0.002, dur / (1 + i)), vol * level, at))
  }

  /** Wobbles these pitches `rate` times a second by the depth (Hz) along `depth`, from `at` for `dur`. */
  private vibrato(params: readonly AudioParam[], rate: number, depth: Curve, at: number, dur: number) {
    const lfo = this.ctx.createOscillator()
    lfo.frequency.value = rate
    const amount = this.ctx.createGain()
    glide(amount.gain, depth, at, 1)
    lfo.connect(amount)
    for (const p of params) amount.connect(p)
    lfo.start(at)
    lfo.stop(at + dur)
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

/**
 * Every sound is synthesised, nothing to load. `sound` is the master switch and `music` the
 * tune's; both are the save's to remember, and change through setSound and setMusic.
 *
 * Browsers make no sound before the page is touched, so nothing here makes an AudioContext
 * until the first `unlock` (called from every gesture); until then every call only
 * remembers what it was asked. `suspend` puts the context to sleep (a pause, a hidden page)
 * and the next `unlock` wakes it.
 *
 * The tune's clock wakes every CLOCK_MS and schedules every step due within LOOKAHEAD; a
 * clock that slept skips ahead instead of catching up in a burst. Three jingles want the
 * stage to themselves: `ui('start')` and `ui('found')` hold the tune back until they end and
 * then start it from its first bar, and the 'done' event ends the room's tune for good, the
 * next one waiting for the jingle to finish. Sound off stops the clock too; sound back on
 * starts the tune again from the top.
 */
export class Sounds {
  sound = true
  music = true
  private tune: Tune = 'none'
  private fast = false
  private ctx: AudioContext | null = null
  private synth: Synth | null = null
  private deck: Deck | null = null
  private timer: ReturnType<typeof setTimeout> | undefined = undefined
  /** Context time before which no tune starts: a jingle is playing. */
  private quietUntil = 0
  /** The tune has played out (the room's at 'done', or the picnic to its end): it stays quiet until the tune changes. */
  private ended = false
  /** Suspended by `suspend` and not woken since. The context's own state lags behind (suspending takes a moment), and a tune retired meanwhile must stop at once, not fade on after the wake. */
  private asleep = false
  /** Context time each kind last sounded. */
  private last = new Map<EventKind | UiSound, number>()

  /** Called from every user gesture: makes the audio context on the first, and wakes it whenever it is not running (iOS also has 'interrupted'). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.synth = new Synth(this.ctx)
      this.synth.master.gain.value = this.sound ? MASTER : 0
      this.synth.music.gain.value = this.music ? MUSIC : 0
      this.restart(0)
    }
    if (this.ctx.state !== 'running' || this.asleep) void this.ctx.resume()
    this.asleep = false
  }

  /** The master switch: off silences everything and stops the tune's clock. */
  setSound(on: boolean): void {
    if (on === this.sound) return
    this.sound = on
    if (!this.synth) return
    this.synth.master.gain.setTargetAtTime(on ? MASTER : 0, this.ctx!.currentTime, 0.015)
    this.restart(HUSH)
  }

  /** The tune's switch: off silences the music bus and stops the tune's clock. */
  setMusic(on: boolean): void {
    if (on === this.music) return
    this.music = on
    if (!this.synth) return
    this.synth.music.gain.setTargetAtTime(on ? MUSIC : 0, this.ctx!.currentTime, 0.015)
    this.restart(HUSH)
  }

  /** The sound for one sim event. */
  play(e: SimEvent): void {
    if (!this.synth) return
    if (e.kind === 'done') {
      this.ended = true
      this.quietUntil = this.ctx!.currentTime + DONE_FOR
      this.restart(HUSH)
    }
    const at = this.slot(e.kind)
    if (at >= 0) this.synth.event(e.kind, e.n, at)
  }

  /** A HUD sound; any of them ends the gate's rising tone. */
  ui(kind: UiSound): void {
    if (!this.synth) return
    const now = this.ctx!.currentTime
    this.synth.cut(now)
    if (kind === 'start' || kind === 'found') {
      if (kind === 'start') this.ended = false
      this.quietUntil = now + (kind === 'start' ? START_FOR : FOUND_FOR)
      this.restart(HUSH)
    }
    const at = this.slot(kind)
    if (at >= 0) this.synth.ui(kind, at)
  }

  /** Loops `tune` from now on; `fast` is the rainbow ball's quicker version. Calling it again with the same values does nothing; a new tune crossfades in from its first bar, and a new speed carries on from where the tune is. */
  setTune(tune: Tune, fast: boolean): void {
    if (tune === this.tune && fast === this.fast) return
    const same = tune === this.tune
    this.tune = tune
    this.fast = fast
    if (!same) this.ended = false
    if (!this.synth) return
    if (!same) this.restart(tune === 'none' ? FADE_OUT : FADE)
    else if (this.deck) this.synth.speed(this.deck, fast, this.ctx!.currentTime)
  }

  /** Silences everything while the page is hidden or paused; unlock wakes it. */
  suspend(): void {
    if (!this.ctx) return
    this.synth!.cut(this.ctx.currentTime)
    this.asleep = true
    void this.ctx.suspend()
  }

  /** The time to play `kind` at, or -1 if it must not play: the sound is off, or the same kind sounded under DEDUP ago. */
  private slot(kind: EventKind | UiSound): number {
    if (!this.sound) return -1
    const t = this.ctx!.currentTime
    const last = this.last.get(kind)
    if (last !== undefined && t - last < DEDUP) return -1
    this.last.set(kind, t)
    return t
  }

  /** Fades out the tune that plays (over `fade`, at once while the context sleeps) and starts the current one from its first bar once quietUntil has passed, unless nothing should play. */
  private restart(fade: number) {
    const ctx = this.ctx!
    const now = ctx.currentTime
    const crossfade = this.deck !== null && this.quietUntil <= now
    if (this.deck) {
      clearTimeout(this.timer)
      this.synth!.retire(this.deck, now, this.asleep || ctx.state !== 'running' ? 0 : fade)
      this.deck = null
    }
    if (this.tune === 'none' || this.ended || !this.sound || !this.music) return
    const at = Math.max(now + LEAD_IN, this.quietUntil)
    this.deck = this.synth!.deck(this.tune, this.fast, at, crossfade ? FADE : LEAD_IN)
    this.tick()
  }

  /** The clock: schedules every step due within LOOKAHEAD, then sleeps CLOCK_MS. */
  private tick() {
    const deck = this.deck!
    const now = this.ctx!.currentTime
    // The timer slept (a background tab, a busy page): skip ahead rather than catch up in a burst.
    if (deck.next < now) deck.next = now + LEAD_IN
    while (deck.next < now + LOOKAHEAD) {
      if (!deck.score.loop && deck.step === deck.score.bars.length * 8) {
        this.deck = null
        this.ended = true
        return
      }
      this.synth!.step(deck, deck.next)
    }
    this.timer = setTimeout(() => this.tick(), CLOCK_MS)
  }
}
