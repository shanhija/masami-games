import { CLIMB_FOR, GATE_WARN, LIFT_FOR, TEETER_FOR, type CourseId, type FeedEvent, type Hue, type SimEvent } from './model'

/**
 * Every sound and tune of Monster Lunch, synthesised with WebAudio: nothing to load. The
 * effects bus carries the course's and the finale's events and the HUD's sounds; the music
 * bus, well under it, carries the tunes. Both meet in the master and go on through a
 * compressor, so a pile of sounds at once is never one loud burst. Nothing startles: every
 * voice swells in over a few milliseconds, no bang has a sharp edge, the losses (a pole, the
 * water, a zap, a poop) are silly rather than sad, and no single voice goes over a fifth of
 * full scale.
 *
 * The tunes are a sunny picnic in C major over pentatonic melodies, and every chime of the
 * effects is on the same pentatonic, so any chime fits over any tune. Every melody is new:
 * the five courses share one walking tune (the walk, their A), and each has its own B and
 * its own band, so the courses sound like one family.
 */

/** The tune to play: the cards' and the kitchen's, a course's walk, the finale's, the party after the last course (once through, then quiet), or nothing. */
export type Tune = 'menu' | CourseId | 'feed' | 'party' | 'none'

/**
 * Sounds the HUD makes that are not events. tap: any button. card: a course card opens.
 * locked: a card that is not open yet. dish: the burger or the croissant chosen. add and
 * remove: a filling put in or taken out. go: a course starts; its tune waits GO_FOR for the
 * jingle. star: one star at the end; called again within STAR_RUN it rings a step higher.
 * home: back on the cards with a happy monster; the menu's tune waits HOME_FOR for the chime.
 * hold: the parent gate's rising tone, which the next `ui` call of any kind cuts short (so
 * letting go early calls `ui('tap')`). fresh: the parent gate is done.
 */
export type UiSound = 'tap' | 'card' | 'locked' | 'dish' | 'add' | 'remove' | 'go' | 'star' | 'home' | 'hold' | 'fresh'

/** What a sound is known by for the dedup and the patter: its kind, a poop's pick apart from a food's (they sound nothing alike, so both play when they come together). */
type Key = SimEvent['kind'] | FeedEvent['kind'] | UiSound | 'poop'

/** The mix: effects at full, the music well under them, both into the master and on through a compressor. */
export const MASTER = 0.6
export const EFFECTS = 1
export const MUSIC = 0.32
/** The music dips to this under the finish jingle and the full fanfare. */
export const DUCK = 0.35
/** The same kind of sound twice within this many seconds plays once. */
export const DEDUP = 0.05
/**
 * The kinds that come several at once and should each be heard, with their spacing: one
 * within this many seconds of the last waits until that long after it, so the foods a pole
 * threw (which all land together) patter down, two picks in one step pop up the scale, and
 * a row of stars called at once still climbs. At most PATTER_MAX of a kind wait at once; more
 * are dropped.
 */
export const PATTER: Partial<Record<Key, number>> = { pick: 0.06, land: 0.07, sink: 0.09, star: 0.22 }
export const PATTER_MAX = 6
/** A star within this many seconds of the last rings a step higher; after a longer pause the chime starts again at the bottom. */
export const STAR_RUN = 1.5
/** The star chime's rungs (MIDI): C6, E6, G6 for three stars, and higher should there be more. */
export const STAR_NOTES = [84, 88, 91, 96, 100] as const
/** The pick's pop: the pile's first food on pentatonic step PICK_STEP (C5), each next one a step higher, the climb stopping after PICK_TOP rungs (E6). */
export const PICK_STEP = 5
export const PICK_TOP = 8
/** Each gate colour's note as a pentatonic step: pink high (E6), green in the middle (C6), blue low (G5). A colour's button, its gates opening and its gates closing all sound in its note, and unlike the other colours. */
export const HUE_STEP: Record<Hue, number> = { pink: 12, green: 10, blue: 8 }
/** The go jingle and the home chime last this long, and no tune plays over them. */
export const GO_FOR = 1.2
export const HOME_FOR = 1.4
/** The parent gate's rising tone. */
export const HOLD_FOR = 3
/** Tunes crossfade over FADE and fade away to no tune over FADE_OUT; the switches and a jingle that wants quiet clear the tune over HUSH. */
export const FADE = 0.4
export const FADE_OUT = 1
const HUSH = 0.08
/** The clock wakes every CLOCK_MS and schedules every step due within LOOKAHEAD seconds; a tune starts LEAD_IN after it is asked for. */
const CLOCK_MS = 100
export const LOOKAHEAD = 0.25
const LEAD_IN = 0.05
/** A pole's knock clinks a plate for each food it throws, up to this many. */
const CLATTER = 5
/** The monster's "mmm" after a chomp: on pentatonic step MMM_STEP (E4) for the first filling, a step higher for each one eaten, up to MMM_TOP steps (A5). */
const MMM_STEP = 2
const MMM_TOP = 7
/** Exponential glides never reach zero: this is silence. */
const SILENT = 0.0001

/** The frequency of a MIDI note (A4, 69, is 440 Hz). */
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
/** The C major pentatonic's notes as semitones above C. */
const PENTATONIC = [0, 2, 4, 7, 9] as const
/** The i-th note of the C major pentatonic counted up from C4 (MIDI): every chime, run and jingle picks from these. */
export const penta = (i: number) => 60 + PENTATONIC[i % 5] + 12 * Math.floor(i / 5)

/** The star chime's next rung after one that rang `gap` seconds ago: one higher within STAR_RUN (staying at the top), the bottom after a longer pause. */
export function nextRung(rung: number, gap: number): number {
  return gap <= STAR_RUN ? Math.min(rung + 1, STAR_NOTES.length - 1) : 0
}

// ---------------------------------------------------------------------------------------
// The music, written a bar per string. Nothing is borrowed: every melody is new, written away
// from the other games' tunes and from the nursery rhymes, campfire songs, anthems and classics
// a child might know.

/** The chords the tunes use, every one at home in C major: the root as a pitch class (C is 0) and the third above it; the fifth is always 7 up. */
export const CHORDS = {
  C: { root: 0, third: 4 },
  Dm: { root: 2, third: 3 },
  Em: { root: 4, third: 3 },
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

/** The letters a melody may use, the C major pentatonic's, as semitones above C: a melody cannot be written off the pentatonic. */
const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, G: 7, A: 9 }

/**
 * Turns a melody written a bar per string into bars. A bar is eight eighth-note slots apart
 * by spaces: a note of the C major pentatonic (G5, where C4 is MIDI 60), '-' to hold the note
 * before (across a bar line too), or '.' for silence. Throws on a bar of another length, a
 * hold with nothing to hold, or a word that is not a note of the pentatonic.
 */
export function bars(melody: readonly string[], chords: readonly Chord[]): Bar[] {
  if (melody.length !== chords.length) throw new Error(`${melody.length} bars of melody but ${chords.length} chords`)
  const notes: number[] = []
  const lengths: number[] = []
  let held = -1
  melody.forEach((bar, b) => {
    const slots = bar.split(' ').filter((w) => w !== '')
    if (slots.length !== 8) throw new Error(`bar ${b + 1} has ${slots.length} slots, not 8: ${bar}`)
    for (const w of slots) {
      if (w === '-') {
        if (held < 0) throw new Error(`bar ${b + 1}: a '-' with nothing to hold`)
        lengths[held] += 1
        notes.push(0)
        lengths.push(0)
      } else if (w === '.') {
        held = -1
        notes.push(0)
        lengths.push(0)
      } else {
        const m = /^([CDEGA])([3-7])$/.exec(w)
        if (!m) throw new Error(`'${w}' is not a note of the C major pentatonic: write C, D, E, G or A and an octave, like G5`)
        held = notes.length
        notes.push(LETTERS[m[1]!]! + 12 * (Number(m[2]) + 1))
        lengths.push(1)
      }
    }
  })
  return chords.map((chord, b) => ({ chord, notes: notes.slice(b * 8, b * 8 + 8), lengths: lengths.slice(b * 8, b * 8 + 8) }))
}

/** The walk, every course's A: a sunny skipping tune that climbs up to look about, wanders down, climbs higher and comes home. */
const WALK = bars(
  [
    'E5 G5 C6 -  A5 G5 E5 -',
    'D5 -  A5 -  G5 -  E5 D5',
    'D5 G5 A5 -  G5 -  D5 -',
    'E5 -  -  -  .  .  G4 -',
    'G5 -  C6 -  E6 -  C6 -',
    'A5 -  -  -  C6 A5 G5 -',
    'D6 -  G5 -  A5 G5 D5 -',
    'C5 -  -  -  .  .  .  .',
  ],
  ['C', 'Dm', 'G', 'C', 'C', 'F', 'G', 'C'],
)

/** Each course's own B, eight bars over its own chords, and the two bars that end its B2 instead (over G, then home to C). */
const B: Record<CourseId, { melody: readonly string[]; chords: readonly Chord[]; end: readonly string[] }> = {
  // The park: sunny, a skip and a hop across the grass.
  park: {
    melody: [
      'C6 A5 -  G5 A5 -  C6 -',
      'D6 -  -  -  G5 -  A5 -',
      'E5 -  -  G5 A5 -  E5 -',
      'A5 -  -  -  E5 -  .  .',
      'C6 -  D6 C6 A5 -  G5 -',
      'E5 G5 A5 -  C6 -  A5 -',
      'D5 E5 -  D5 A5 -  G5 -',
      'D5 -  -  -  .  .  G4 -',
    ],
    chords: ['F', 'G', 'Em', 'Am', 'F', 'C', 'Dm', 'G'],
    end: ['G5 A5 G5 E5 D5 -  G5 -', 'C5 -  -  -  .  .  .  .'],
  },
  // The pond: floating on the water, long notes rocking like ripples.
  pond: {
    melody: [
      'G5 -  -  E5 -  -  G5 -',
      'A5 -  -  C6 -  -  A5 -',
      'D6 -  -  A5 -  -  G5 -',
      'G5 -  -  -  D5 -  -  -',
      'E5 -  -  G5 -  -  E5 -',
      'A5 -  -  G5 -  -  E5 -',
      'A5 -  -  D6 -  -  C6 -',
      'G5 -  -  -  -  -  .  .',
    ],
    chords: ['C', 'Am', 'Dm', 'G', 'Em', 'Am', 'Dm', 'G'],
    end: ['D6 -  -  A5 -  -  G5 -', 'E5 -  -  -  C5 -  -  -'],
  },
  // The garden: twinkling, little pecks of light among the flowers.
  garden: {
    melody: [
      'C6 .  A5 .  D6 .  C6 .',
      'D6 .  G5 .  A5 .  G5 .',
      'E6 .  C6 .  G5 .  E5 .',
      'A5 -  -  -  A5 .  C6 .',
      'D6 .  C6 .  A5 C6 G5 .',
      'G5 .  A5 .  D6 -  -  .',
      'E6 .  G5 .  C6 .  A5 .',
      'G5 -  -  -  .  .  .  .',
    ],
    chords: ['F', 'G', 'C', 'Am', 'F', 'G', 'C', 'G'],
    end: ['A5 .  G5 .  D6 .  G5 .', 'C6 -  -  -  .  .  .  .'],
  },
  // The farm: plucky, a bouncing barnyard with a rooster calling three times.
  farm: {
    melody: [
      'C5 .  C6 .  G5 A5 G5 .',
      'A5 .  A5 .  C6 .  A5 .',
      'G5 .  E5 .  G5 .  C6 .',
      'D6 .  D6 .  D6 -  -  .',
      'C5 .  C6 .  G5 A5 G5 .',
      'C6 .  A5 .  D6 C6 A5 .',
      'G5 .  D5 .  A5 G5 D6 .',
      'D5 -  -  -  .  .  G4 .',
    ],
    chords: ['C', 'F', 'C', 'G', 'C', 'F', 'G', 'G'],
    end: ['D6 .  G5 .  A5 .  D5 .', 'C5 .  E5 .  C5 -  -  .'],
  },
  // The castle: a little brave and grand, marching up to the gate.
  castle: {
    melody: [
      'A5 -  -  A5 E6 -  C6 -',
      'G5 -  -  E5 G5 -  A5 -',
      'C6 -  -  G5 A5 -  C6 -',
      'D6 -  -  -  -  -  .  .',
      'E6 -  -  D6 C6 -  E6 -',
      'A5 -  -  A5 E6 -  C6 -',
      'D6 -  E6 -  C6 -  A5 -',
      'G5 -  -  -  D5 -  .  .',
    ],
    chords: ['Am', 'Em', 'F', 'G', 'C', 'Am', 'Dm', 'G'],
    end: ['D6 -  -  A5 G5 -  D6 -', 'E6 -  -  -  C6 -  -  -'],
  },
}

/** A course's tune, 32 bars: the walk, its B, the walk, its B2. */
function courseBars(id: CourseId): Bar[] {
  const b = B[id]
  return [...WALK, ...bars(b.melody, b.chords), ...WALK, ...bars([...b.melody.slice(0, 6), ...b.end], [...b.chords.slice(0, 6), 'G', 'C'])]
}

/** The cards and the kitchen: a lazy lilt that leaps up a sixth and drifts back down while she chooses, three phrases that wait on G and a last one that comes home. */
const MENU = bars(
  [
    'E5 -  C6 -  -  A5 G5 -',
    'A5 -  E6 -  -  C6 A5 -',
    'D6 -  -  C6 A5 -  C6 -',
    'G5 -  -  -  -  -  .  .',
    'E5 -  C6 -  -  A5 G5 -',
    'G5 -  E6 -  -  D6 E6 -',
    'A5 -  C6 -  -  A5 G5 -',
    'D5 -  -  -  .  .  .  .',
    'A5 -  -  G5 E5 -  A5 -',
    'C6 -  -  A5 G5 -  -  -',
    'E5 -  G5 C6 -  -  E6 -',
    'D6 -  -  -  .  .  G5 -',
    'A5 -  C6 -  -  D6 C6 -',
    'D6 -  -  G5 A5 -  D5 -',
    'A5 -  -  G5 D5 -  E5 -',
    'C5 -  -  -  .  .  .  .',
  ],
  ['C', 'Am', 'F', 'G', 'C', 'Em', 'F', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'C', 'C'],
)

/** The finale: little figures stepping up and up, a held breath, and a bright answer, waiting for the next layer to fall. */
const FEED = bars(
  [
    'C5 E5 G5 .  C5 E5 G5 .',
    'D5 G5 A5 .  D5 G5 A5 .',
    'E5 A5 C6 .  E5 A5 C6 .',
    'D6 .  A5 .  G5 -  -  .',
    'A5 C6 D6 .  G5 A5 C6 .',
    'E6 .  C6 .  A5 G5 E5 .',
    'D5 .  A5 .  D6 .  A5 .',
    'G5 -  -  -  .  .  .  .',
    'C6 .  G5 .  E5 G5 C6 .',
    'D6 .  G5 .  D5 G5 D6 .',
    'E6 .  C6 .  A5 C6 E6 .',
    'E6 -  -  -  D6 .  .  .',
    'A5 .  C6 .  D6 .  C6 .',
    'D6 .  D6 .  G5 .  A5 .',
    'E5 .  G5 .  C6 .  A5 .',
    'E5 .  .  .  G4 .  .  .',
  ],
  ['C', 'G', 'Am', 'G', 'F', 'C', 'Dm', 'G', 'C', 'G', 'Am', 'Em', 'F', 'G', 'C', 'G'],
)

/** The party's own song after the walk: all five monsters dancing, up to one last big C that rings out. */
const PARTY = bars(
  [
    'D6 -  C6 A5 C6 -  A5 -',
    'D6 -  G5 A5 D6 -  A5 -',
    'E6 -  D6 -  E6 -  G5 -',
    'A5 -  -  -  C6 -  -  -',
    'D6 -  C6 A5 C6 -  A5 -',
    'D6 -  E6 -  D6 -  A5 -',
    'G5 A5 G5 -  D6 -  -  -',
    'C6 -  -  -  -  -  -  -',
  ],
  ['F', 'G', 'Em', 'Am', 'F', 'G', 'G', 'C'],
)

/** The lead's instrument. marimba: warm wooden bars. whistle: someone whistling, each note scooped up into place. flute: soft and breathy, slow to swell. glock: a glockenspiel. banjo: a bright plucked string. brass: toy horns. band: the horns with a glockenspiel an octave over them. */
type Lead = 'marimba' | 'whistle' | 'flute' | 'glock' | 'banjo' | 'brass' | 'band'
/** The bass's pattern (BASS). walk: root, third, fifth, octave up the beats. float: long roots and fifths. step: root and fifth in turn on the beats. oompah: a short root and fifth with a chord stab after each. */
type Bass = 'walk' | 'float' | 'step' | 'oompah'
/** The drums: a soft kick under the kit's own tick (KITS). brush: a brushed swish on the backbeat. shaker: a shaker on the off-beats. drip: a water drop. twinkle: a high glint. clop: a pony's clip-clop. snare: a march snare. tick: a clock's tick-tock. clap: claps. */
type Kit = 'brush' | 'shaker' | 'drip' | 'twinkle' | 'clop' | 'snare' | 'tick' | 'clap'

/** A tune and its band. */
export interface Score {
  bpm: number
  /** The share of a beat its first eighth takes: 0.5 is straight, more is a bounce. */
  swing: number
  /** Whether it starts over at the end; one that does not (the party) rings its last chord and stops. */
  loop: boolean
  bars: readonly Bar[]
  lead: Lead
  /** Semitones the lead plays above the written melody. */
  octave: number
  bass: Bass
  kit: Kit
}

/** Every tune, with what it is meant to feel like. */
export const SCORES: Record<Exclude<Tune, 'none'>, Score> = {
  /** The cards and the kitchen: cosy and unhurried, warm wooden bars on a lazy shuffle. */
  menu: { bpm: 88, swing: 0.62, loop: true, bars: MENU, lead: 'marimba', octave: 0, bass: 'float', kit: 'brush' },
  /** The park: sunny, someone whistling along to a walking bass. */
  park: { bpm: 116, swing: 0.6, loop: true, bars: courseBars('park'), lead: 'whistle', octave: 0, bass: 'walk', kit: 'shaker' },
  /** The pond: floating, a flute over long low notes and drips on the water. */
  pond: { bpm: 100, swing: 0.5, loop: true, bars: courseBars('pond'), lead: 'flute', octave: 0, bass: 'float', kit: 'drip' },
  /** The garden: twinkling, a glockenspiel high over a light step. */
  garden: { bpm: 112, swing: 0.56, loop: true, bars: courseBars('garden'), lead: 'glock', octave: 12, bass: 'step', kit: 'twinkle' },
  /** The farm: plucky, a banjo over an oom-pah and a pony trotting. */
  farm: { bpm: 124, swing: 0.62, loop: true, bars: courseBars('farm'), lead: 'banjo', octave: 0, bass: 'oompah', kit: 'clop' },
  /** The castle: a little brave and grand, toy horns marching to a snare. */
  castle: { bpm: 104, swing: 0.5, loop: true, bars: courseBars('castle'), lead: 'brass', octave: 0, bass: 'step', kit: 'snare' },
  /** The finale: playful and quicker, bright wooden bars an octave up over a ticking clock. */
  feed: { bpm: 138, swing: 0.55, loop: true, bars: FEED, lead: 'marimba', octave: 12, bass: 'walk', kit: 'tick' },
  /** The party: the walk and then a song for all five monsters, horns, bells and claps, once. */
  party: { bpm: 128, swing: 0.58, loop: false, bars: [...WALK, ...PARTY], lead: 'band', octave: 0, bass: 'walk', kit: 'clap' },
}

/** How long `tune` takes once through, in seconds: the party stops after this long and the others start over; no tune lasts nothing. */
export function tuneSeconds(tune: Tune): number {
  if (tune === 'none') return 0
  const s = SCORES[tune]
  return (s.bars.length * 4 * 60) / s.bpm
}

/** Each bass: per eighth-note slot R for the chord's root, 3 its third, 5 its fifth, 8 the root an octave up, '.' nothing; how many slots a note lasts; and whether a soft chord stab follows each beat's note on the off-beat slots 2 and 6 (the oom-pah's pah). */
const BASS: Record<Bass, { line: string; len: number; chop: boolean }> = {
  walk: { line: 'R.3.5.8.', len: 2, chop: false },
  float: { line: 'R...5...', len: 4, chop: false },
  step: { line: 'R.5.R.5.', len: 1.5, chop: false },
  oompah: { line: 'R...5...', len: 1, chop: true },
}
/** Each kit: the slots its kick plays on and the slots its tick plays on. */
const KITS: Record<Kit, { kicks: readonly number[]; ticks: readonly number[] }> = {
  brush: { kicks: [0], ticks: [2, 6] },
  shaker: { kicks: [0, 4], ticks: [1, 3, 5, 7] },
  drip: { kicks: [0], ticks: [3, 7] },
  twinkle: { kicks: [0, 4], ticks: [3, 7] },
  clop: { kicks: [0, 4], ticks: [1, 3, 5, 7] },
  snare: { kicks: [0, 4], ticks: [2, 6] },
  tick: { kicks: [0, 4], ticks: [0, 2, 4, 6] },
  clap: { kicks: [0, 4], ticks: [2, 6] },
}
/** Each lead's level inside the music bus: a pure whistle needs more than a buzzing horn to sound as loud. */
const LEAD: Record<Lead, number> = { marimba: 0.17, whistle: 0.11, flute: 0.11, glock: 0.09, banjo: 0.075, brass: 0.06, band: 0.055 }
/** The other voices' levels inside the music bus. */
const LEVEL = { bass: 0.1, chop: 0.035, kick: 0.11, tick: 0.035, pad: 0.03 }

// ---------------------------------------------------------------------------------------
// The voices.

type Wave = 'sine' | 'square' | 'sawtooth' | 'triangle'
/** A pitch or a level over time: [seconds from the start, value] points with exponential glides between them. */
type Curve = readonly (readonly [number, number])[]
/** Struck: up to full over `attack`, then dying away to silence at `dur`. */
const struck = (attack: number, dur: number): Curve => [[0, 0], [attack, 1], [dur, 0]]
/** Held: up to full over `attack`, easing to 0.7 by three quarters of `dur`, silent at `dur`. */
const held = (attack: number, dur: number): Curve => [[0, 0], [attack, 1], [dur * 0.75, 0.7], [dur, 0]]

/** A struck thing's partials as [ratio to the fundamental, level]; the higher ones die sooner. */
type Partials = readonly (readonly [number, number])[]
/** Warm wooden bars, their ring tuned about four times up. */
const WOOD: Partials = [[1, 1], [3.9, 0.12]]
/** A glockenspiel's bar. */
const GLOCK: Partials = [[1, 1], [2.76, 0.28], [5.4, 0.08]]
/** A round bell. */
const BELL: Partials = [[1, 1], [2, 0.4], [3, 0.14], [4.2, 0.06]]
/** A china plate's clink. */
const PLATE: Partials = [[1, 1], [1.59, 0.5], [2.37, 0.3]]

/** Sets `param` along `curve` from time `at`, each value times `scale`; never below SILENT, since an exponential glide cannot reach zero. */
function glide(param: AudioParam, curve: Curve, at: number, scale: number) {
  curve.forEach(([t, v], i) => {
    const value = Math.max(v * scale, SILENT)
    if (i > 0) param.exponentialRampToValueAtTime(value, at + t)
    else {
      // The first value holds from now on too: a noise source can start a sample before the param's first event, and must not meet a gain's default of 1 there (a click).
      param.value = value
      param.setValueAtTime(value, at + t)
    }
  })
}

/** A tune playing: its score, its fader and its bass's tone, and where its clock is. */
export interface Deck {
  score: Score
  /** Its fader into the music, which tunes crossfade on. */
  out: GainNode
  /** Where the bass goes in: a lowpass, so its quiet square stays a hum. */
  bass: AudioNode
  /** The next step to play, counted from the first bar, and when it plays. */
  step: number
  next: number
}

/**
 * Every voice of the game on one audio context: the buses, the master and the compressor,
 * the events' sounds, the HUD's and the steps of the tunes. Sounds runs it on the page's
 * AudioContext; the tests run it on a fake one.
 */
export class Synth {
  readonly ctx: BaseAudioContext
  readonly master: GainNode
  readonly effects: GainNode
  readonly music: GainNode
  /** Between the tunes and the music bus: the dip a fanfare pulls down. */
  readonly duck: GainNode
  /** Two seconds of white noise every noisy sound loops over, and where in it the next one starts. */
  private white: AudioBuffer
  private grain = 0
  /** The star chime's rung and when it last rang. */
  private rung = 0
  private starAt = -Infinity
  /** The parent gate's rising tone while it sounds: its own fader, to cut it short. */
  private holding: GainNode | null = null

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx
    const squash = ctx.createDynamicsCompressor()
    squash.threshold.value = -18
    squash.knee.value = 8
    squash.ratio.value = 4
    squash.attack.value = 0.003
    squash.release.value = 0.3
    squash.connect(ctx.destination)
    this.master = this.gain(MASTER, squash)
    this.effects = this.gain(EFFECTS, this.master)
    this.music = this.gain(MUSIC, this.master)
    this.duck = this.gain(1, this.music)
    this.white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = this.white.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  }

  /** The sound of one course or finale event at time `at` (model.ts says what each field is). */
  event(e: SimEvent | FeedEvent, at: number) {
    const fx = this.effects
    switch (e.kind) {
      case 'pick': {
        if (e.food === 'poop') {
          // Bleh: a squelch, a grumble sliding down through a little mouth, and a fly buzzing about it.
          this.hiss(fx, 'lowpass', [[0, 1300], [0.25, 280]], 1.5, [[0, 0], [0.015, 1], [0.28, 0]], 0.12, at)
          const grumble = this.voice(this.filter('bandpass', 650, 1.2, fx), 'sawtooth', [[0, 210], [0.35, 135]], [[0, 0], [0.03, 1], [0.28, 0.6], [0.38, 0]], 0.16, at + 0.05)
          this.wobble([grumble.frequency], 9, [[0, 12]], at + 0.05, 0.38)
          this.fly(at + 0.3)
          return
        }
        // A bubbly pop up to the pile's rung, so a run of picks climbs the scale, and a little bubble over it.
        const f = hz(penta(PICK_STEP + Math.min(Math.max(e.n, 1), PICK_TOP) - 1))
        this.voice(fx, 'sine', [[0, f * 0.55], [0.035, f * 1.06], [0.08, f]], struck(0.004, 0.16), 0.15, at)
        this.voice(fx, 'triangle', [[0, f * 2]], struck(0.003, 0.07), 0.035, at + 0.03)
        return
      }
      case 'bonk':
        // Tonk: a hollow wooden knock on the pole, then the plates clattering as the foods fly, a clink for each (up to CLATTER).
        this.voice(fx, 'triangle', [[0, 200], [0.12, 125]], struck(0.002, 0.17), 0.17, at)
        this.voice(fx, 'sine', [[0, 480], [0.06, 410]], struck(0.002, 0.08), 0.08, at)
        this.hiss(fx, 'bandpass', [[0, 650]], 3, struck(0.002, 0.05), 0.09, at)
        for (let i = 0; i < Math.min(e.n, CLATTER); i++) {
          const t = at + 0.07 + i * 0.05 + (i % 2) * 0.012
          this.bell(fx, PLATE, 1800 + ((i * 410) % 1000), t, 0.14, 0.05)
          this.hiss(fx, 'highpass', [[0, 4000]], 0.7, struck(0.001, 0.025), 0.025, t)
        }
        return
      case 'land': {
        // Plop: a food dropping soft on the grass, a poop squishier and lower.
        const poop = e.food === 'poop'
        const f = poop ? 230 : 420
        this.voice(fx, 'sine', [[0, f], [0.07, f * 0.45]], struck(0.003, 0.09), 0.11, at)
        this.hiss(fx, 'lowpass', [[0, poop ? 500 : 900]], 0.7, struck(0.002, 0.05), 0.05, at)
        return
      }
      case 'sink':
        // Plip into the water, and a fish's tiny gulp as it takes the food.
        this.voice(fx, 'sine', [[0, 750], [0.05, 1600]], struck(0.002, 0.07), 0.09, at)
        this.voice(fx, 'sine', [[0, 400], [0.08, 190]], struck(0.004, 0.1), 0.08, at + 0.15)
        return
      case 'teeter': {
        // Whoa-oa-oa: a voice sliding up and back down, wobbling like her arms going round, over by the time she falls in or steps back.
        const path: Curve = [[0, 320], [TEETER_FOR * 0.35, 520], [TEETER_FOR - 0.02, 300]]
        const level: Curve = [[0, 0], [0.04, 1], [TEETER_FOR * 0.7, 0.7], [TEETER_FOR - 0.02, 0]]
        const mouth = this.voice(this.filter('lowpass', 1400, 1, fx), 'triangle', path, level, 0.13, at)
        const pure = this.voice(fx, 'sine', path, level, 0.05, at)
        this.wobble([mouth.frequency, pure.frequency], 7, [[0, 28]], at, TEETER_FOR)
        return
      }
      case 'splash':
        // Sploosh: a low plunge, the water falling back, spray, then bubbles coming up, more for more food floating off.
        this.voice(fx, 'sine', [[0, 230], [0.22, 80]], struck(0.004, 0.26), 0.16, at)
        this.hiss(fx, 'bandpass', [[0, 1400], [0.55, 450]], 0.8, [[0, 0], [0.01, 1], [0.15, 0.6], [0.6, 0]], 0.18, at)
        this.hiss(fx, 'highpass', [[0, 3500]], 0.7, [[0, 0], [0.02, 1], [0.35, 0]], 0.06, at + 0.03)
        this.bubbles(at + 0.4, 3 + Math.min(e.n, 3), 0.06)
        return
      case 'frog':
        // Ribbit: two croaks rattling through a wide mouth, the second higher. A friendly frog, never a growl.
        for (const [dt, f, len] of [[0, 190, 0.1], [0.15, 235, 0.09]] as const) {
          const rattle = this.tremolo(fx, 45, 0.45, at + dt, len)
          this.voice(this.filter('bandpass', 950, 1.5, rattle), 'sawtooth', [[0, f], [len, f * 1.15]], [[0, 0], [0.01, 1], [len * 0.7, 0.8], [len, 0]], 0.16, at + dt)
        }
        return
      case 'back':
        // Pop, back on her feet: a pop up and two bells.
        this.voice(fx, 'sine', [[0, 300], [0.06, 900]], struck(0.003, 0.08), 0.12, at)
        this.bell(fx, BELL, hz(79), at + 0.07, 0.4, 0.07)
        this.bell(fx, BELL, hz(84), at + 0.17, 0.6, 0.08)
        return
      case 'press': {
        // Chunk: the button goes down, then a quick run up to its colour's note.
        const k = HUE_STEP[e.hue]
        this.voice(fx, 'triangle', [[0, 330], [0.05, 160]], struck(0.002, 0.07), 0.15, at)
        this.hiss(fx, 'lowpass', [[0, 1600]], 0.7, struck(0.002, 0.03), 0.06, at)
        for (let i = 0; i < 4; i++) this.voice(fx, 'triangle', [[0, hz(penta(k - 3 + i))]], struck(0.004, 0.13), 0.08, at + 0.05 + i * 0.05)
        return
      }
      case 'open': {
        // The gates swing open after the button's run: a swish and the colour's chime, two notes up, the second ringing.
        const k = HUE_STEP[e.hue]
        this.hiss(fx, 'bandpass', [[0, 600], [0.4, 2200]], 1.2, [[0, 0], [0.1, 1], [0.45, 0]], 0.04, at + 0.22)
        this.bell(fx, BELL, hz(penta(k)), at + 0.26, 0.5, 0.09)
        this.bell(fx, BELL, hz(penta(k + 2)), at + 0.4, 1, 0.09)
        return
      }
      case 'warn':
        // Hurry: a clock ticking and tocking faster and faster through the gate's last GATE_WARN seconds (the event comes once).
        for (let i = 0, t = 0; t < GATE_WARN - 0.3; t += Math.max(0.1, 0.3 - i * 0.02), i++) {
          this.voice(fx, 'sine', [[0, i % 2 === 0 ? 2100 : 1600]], struck(0.001, 0.03), 0.07, at + t)
          this.voice(fx, 'triangle', [[0, i % 2 === 0 ? 1050 : 800]], struck(0.001, 0.025), 0.04, at + t)
        }
        return
      case 'close': {
        // The gates swing shut: the colour's note, the one two steps down, and a soft clunk.
        const k = HUE_STEP[e.hue]
        this.bell(fx, BELL, hz(penta(k)), at, 0.35, 0.07)
        this.bell(fx, BELL, hz(penta(k - 2)), at + 0.16, 0.5, 0.07)
        this.voice(fx, 'triangle', [[0, 150], [0.08, 90]], struck(0.003, 0.11), 0.12, at + 0.16)
        return
      }
      case 'zap': {
        // Bzzt: a buzz shaking fast with a little crackle, then a boing as she bounces back; the top food falling off adds an "uh-oh".
        const buzz = this.tremolo(fx, 38, 0.45, at, 0.22)
        this.voice(this.filter('lowpass', 2200, 1, buzz), 'sawtooth', [[0, 130], [0.2, 115]], [[0, 0], [0.01, 1], [0.15, 0.7], [0.22, 0]], 0.1, at)
        this.voice(buzz, 'square', [[0, 260]], struck(0.01, 0.2), 0.02, at)
        this.hiss(fx, 'highpass', [[0, 3000]], 0.7, struck(0.005, 0.12), 0.04, at)
        this.boing(at + 0.2, 0.07)
        if (e.lost) {
          this.voice(fx, 'triangle', [[0, hz(76)]], held(0.01, 0.14), 0.07, at + 0.5)
          this.voice(fx, 'triangle', [[0, hz(72)]], held(0.01, 0.24), 0.07, at + 0.66)
        }
        return
      }
      case 'shove':
        // Boing: the closing gate nudges her out of its way.
        this.boing(at, 0.1)
        return
      case 'flag': {
        // The flag pops up: a flutter of cloth and three notes on a toy horn.
        const flap = this.tremolo(fx, 14, 0.4, at, 0.3)
        this.hiss(flap, 'bandpass', [[0, 1800]], 1, [[0, 0], [0.04, 1], [0.3, 0]], 0.05, at)
        this.toot(at, [[0, 76, 0.09], [0.11, 79, 0.09], [0.22, 84, 0.4]])
        return
      }
      case 'puppy': {
        // Yip yip!
        const mouth = this.filter('bandpass', 1500, 1.5, fx)
        const path: Curve = [[0, 700], [0.03, 1150], [0.08, 850]]
        for (const dt of [0, 0.14]) {
          this.voice(mouth, 'sawtooth', path, struck(0.008, 0.08), 0.12, at + dt)
          this.voice(fx, 'sine', path, struck(0.008, 0.08), 0.06, at + dt)
        }
        return
      }
      case 'finish':
        // Made it: a happy run up the wooden bars to a ringing chord with a sparkle on top, the music dipping for it.
        ;[72, 74, 76, 79, 81].forEach((m, i) => this.bell(fx, WOOD, hz(m), at + i * 0.07, 0.3, 0.13))
        for (const m of [72, 76, 79]) this.voice(fx, 'triangle', [[0, hz(m)]], held(0.01, 0.9), 0.05, at + 0.36)
        this.bell(fx, BELL, hz(84), at + 0.36, 1, 0.1)
        ;[91, 96, 100].forEach((m, i) => this.bell(fx, GLOCK, hz(m), at + 0.48 + i * 0.07, 0.5, 0.05))
        this.dip(at, 1.4)
        return
      case 'bread': {
        // Fwump: the bread closes soft round the pile; then a bright ding, the dish is made (a burger's a little lower than a croissant's).
        const ding = e.dish === 'burger' ? 91 : 96
        this.hiss(fx, 'lowpass', [[0, 250], [0.12, 900], [0.35, 250]], 0.7, [[0, 0], [0.08, 1], [0.35, 0]], 0.15, at)
        this.voice(fx, 'sine', [[0, 130], [0.22, 85]], [[0, 0], [0.05, 1], [0.26, 0]], 0.14, at)
        this.bell(fx, BELL, hz(ding), at + 0.42, 0.9, 0.1)
        this.voice(fx, 'sine', [[0, hz(ding + 12)]], struck(0.003, 0.4), 0.03, at + 0.44)
        return
      }
      case 'climb':
        // Creak, creak: the wicker basket as she climbs in, over within CLIMB_FOR.
        for (const [dt, len] of [[0, CLIMB_FOR * 0.4], [CLIMB_FOR * 0.45, CLIMB_FOR * 0.5]] as const) {
          const wicker = this.filter('bandpass', 1300, 5, fx)
          this.voice(wicker, 'sawtooth', [[0, 45], [len * 0.5, 75], [len, 50]], [[0, 0], [0.03, 1], [len * 0.8, 0.8], [len, 0]], 0.18, at + dt)
        }
        return
      case 'liftoff':
        // Fwoosh: the burner roars up, and the balloon rises on a soft climbing whistle, over within LIFT_FOR.
        this.hiss(fx, 'bandpass', [[0, 350], [0.5, 900], [LIFT_FOR - 0.1, 1300]], 0.9, [[0, 0], [0.15, 1], [0.6, 0.7], [LIFT_FOR - 0.1, 0]], 0.15, at)
        this.hiss(fx, 'lowpass', [[0, 300], [1.2, 700]], 0.7, [[0, 0], [0.2, 1], [LIFT_FOR - 0.2, 0]], 0.1, at)
        this.voice(fx, 'sine', [[0, 300], [LIFT_FOR - 0.1, 700]], [[0, 0], [0.4, 1], [LIFT_FOR - 0.1, 0]], 0.04, at)
        return
      case 'drop': {
        // Wheee-oo: a slide whistle down as the layer falls.
        const o = this.voice(fx, 'sine', [[0, 1500], [0.55, 520]], [[0, 0], [0.03, 1], [0.45, 0.7], [0.55, 0]], 0.08, at)
        this.wobble([o.frequency], 6, [[0, 18]], at, 0.55)
        return
      }
      case 'chomp': {
        // Chomp: a crunchy bite, then a happy "mmm" through closed lips, a step higher with every filling eaten.
        ;[0, 0.025, 0.055, 0.09].forEach((dt, i) => this.hiss(fx, 'bandpass', [[0, 3200 - i * 300]], 1.8, struck(0.002, 0.035), 0.12, at + dt))
        this.voice(fx, 'triangle', [[0, 210], [0.1, 120]], struck(0.004, 0.12), 0.15, at)
        const f = hz(penta(MMM_STEP + Math.min(e.n, MMM_TOP)))
        const hum: Curve = [[0, f], [0.28, f * 1.12]]
        const lips: Curve = [[0, 0], [0.06, 1], [0.3, 0.7], [0.42, 0]]
        this.voice(this.filter('lowpass', 900, 0.8, fx), 'triangle', hum, lips, 0.14, at + 0.16)
        this.voice(fx, 'sine', hum, lips, 0.06, at + 0.16)
        return
      }
      case 'bleh': {
        // Ptoo and pbbbt: the poop spat out with a raspberry, flapping and silly.
        this.hiss(fx, 'bandpass', [[0, 1200]], 1, struck(0.002, 0.05), 0.08, at)
        const lips = this.tremolo(fx, 32, 0.5, at + 0.04, 0.42)
        const o = this.voice(this.filter('lowpass', 1100, 1, lips), 'sawtooth', [[0, 110], [0.2, 135], [0.42, 95]], [[0, 0], [0.02, 1], [0.32, 0.8], [0.42, 0]], 0.15, at + 0.04)
        this.wobble([o.frequency], 11, [[0, 10]], at + 0.04, 0.42)
        return
      }
      case 'miss':
        // Splat: a soft thud on the grass.
        this.hiss(fx, 'lowpass', [[0, 900], [0.15, 280]], 0.8, [[0, 0], [0.006, 1], [0.18, 0]], 0.14, at)
        this.voice(fx, 'sine', [[0, 160], [0.1, 80]], struck(0.004, 0.12), 0.12, at)
        return
      case 'bird':
        // Tweet tweet: a little bird hopping in for it.
        for (const [dt, f] of [[0, 2600], [0.12, 2900]] as const) this.voice(fx, 'sine', [[0, f], [0.04, f * 1.35], [0.07, f * 1.1]], struck(0.004, 0.08), 0.06, at + dt)
        return
      case 'full':
        // All down: a happy little fanfare on the toy horns over a ringing chord, the music dipping for it.
        this.toot(at, [[0, 79, 0.1], [0.12, 84, 0.1], [0.24, 88, 0.1], [0.36, 86, 0.1], [0.48, 88, 0.12], [0.62, 91, 0.6]])
        for (const m of [72, 76, 79]) this.voice(fx, 'triangle', [[0, hz(m)]], held(0.02, 0.7), 0.05, at + 0.62)
        ;[96, 100, 103].forEach((m, i) => this.bell(fx, GLOCK, hz(m), at + 0.62 + i * 0.07, 0.6, 0.05))
        this.dip(at, 1.6)
        return
      case 'burp': {
        // Burrrp, then a giggly "hee": funny, never gross.
        const throat = this.filter('lowpass', 650, 2, fx)
        const o = this.voice(throat, 'sawtooth', [[0, 105], [0.12, 92], [0.38, 72]], [[0, 0], [0.03, 1], [0.3, 0.6], [0.4, 0]], 0.18, at)
        this.wobble([o.frequency], 17, [[0, 8]], at, 0.4)
        this.voice(fx, 'sine', [[0, 900], [0.06, 1300]], struck(0.004, 0.09), 0.06, at + 0.5)
        return
      }
      case 'stars':
        // A soft shimmer behind the stars; the HUD rings each star itself with ui('star').
        this.hiss(fx, 'highpass', [[0, 6000]], 0.7, [[0, 0], [0.3, 1], [0.9, 0]], 0.02, at)
        ;[96, 100, 103].forEach((m, i) => this.bell(fx, GLOCK, hz(m), at + 0.1 + i * 0.12, 0.5, 0.025))
        return
      default: {
        const unheard: never = e
        throw new Error(`no sound for ${JSON.stringify(unheard)}`)
      }
    }
  }

  /** A HUD sound at time `at`. */
  ui(kind: UiSound, at: number) {
    const fx = this.effects
    switch (kind) {
      case 'tap':
        // A soft click.
        this.voice(fx, 'triangle', [[0, 1250], [0.03, 850]], struck(0.002, 0.04), 0.11, at)
        return
      case 'card':
        // A card opens: a whoosh up and two bright notes.
        this.hiss(fx, 'bandpass', [[0, 600], [0.3, 2600]], 1.2, [[0, 0], [0.08, 1], [0.32, 0]], 0.04, at)
        this.bell(fx, BELL, hz(84), at + 0.05, 0.4, 0.07)
        this.bell(fx, BELL, hz(91), at + 0.13, 0.7, 0.07)
        return
      case 'locked': {
        // Nuh-uh, gently: two soft hums, the second lower and sinking.
        const soft = this.filter('lowpass', 1100, 0.7, fx)
        this.voice(soft, 'triangle', [[0, hz(76)]], [[0, 0], [0.015, 1], [0.1, 0.8], [0.13, 0]], 0.09, at)
        this.voice(soft, 'triangle', [[0, hz(72)], [0.22, hz(72) * 0.96]], [[0, 0], [0.015, 1], [0.15, 0.8], [0.24, 0]], 0.09, at + 0.17)
        return
      }
      case 'dish':
        // A dish chosen: a plate's clink and two wooden notes up, ta-da.
        this.bell(fx, PLATE, 2200, at, 0.15, 0.05)
        this.bell(fx, WOOD, hz(79), at + 0.05, 0.35, 0.13)
        this.bell(fx, WOOD, hz(84), at + 0.16, 0.6, 0.13)
        return
      case 'add':
        // In it goes: a happy plop up and a glint.
        this.voice(fx, 'sine', [[0, 260], [0.07, 720]], struck(0.004, 0.12), 0.14, at)
        this.bell(fx, GLOCK, hz(91), at + 0.07, 0.25, 0.04)
        return
      case 'remove':
        // Out it pops: a pop back down.
        this.voice(fx, 'sine', [[0, 720], [0.07, 260]], struck(0.003, 0.1), 0.12, at)
        this.hiss(fx, 'highpass', [[0, 2500]], 0.7, struck(0.002, 0.02), 0.04, at)
        return
      case 'go':
        // Off we go: two wooden notes up, then a bright chord over a whoosh, ringing until the course's tune comes in.
        this.bell(fx, WOOD, hz(79), at, 0.3, 0.13)
        this.bell(fx, WOOD, hz(81), at + 0.22, 0.3, 0.13)
        this.hiss(fx, 'bandpass', [[0, 500], [0.45, 3000]], 1, [[0, 0], [0.4, 1], [0.5, 0]], 0.05, at)
        for (const m of [84, 88, 91]) this.bell(fx, BELL, hz(m), at + 0.45, GO_FOR - 0.47, 0.07)
        this.kick(fx, at + 0.45)
        return
      case 'star': {
        // A star: a bright plink a step higher than one within STAR_RUN before it, a bell under it and a sparkle.
        this.rung = nextRung(this.rung, at - this.starAt)
        this.starAt = at
        const f = hz(STAR_NOTES[this.rung])
        this.bell(fx, GLOCK, f, at, 0.6, 0.13)
        this.bell(fx, BELL, f / 2, at, 0.5, 0.05)
        this.hiss(fx, 'highpass', [[0, 7000]], 0.7, struck(0.01, 0.25), 0.02, at)
        return
      }
      case 'home':
        // Home with a happy monster: a warm chord rolled up the round bells over a soft swell, ringing until the menu's tune comes back.
        ;[72, 76, 79, 84].forEach((m, i) => this.bell(fx, BELL, hz(m), at + i * 0.09, i === 3 ? HOME_FOR - 0.3 : 0.7, 0.08))
        for (const m of [60, 67]) this.voice(fx, 'triangle', [[0, hz(m)]], held(0.25, HOME_FOR - 0.05), 0.04, at)
        this.bell(fx, GLOCK, hz(96), at + 0.36, 0.6, 0.04)
        return
      case 'hold': {
        // The parent gate filling up: a soft tone and its fifth rising two octaves over HOLD_FOR, swelling. Its own fader cuts it short.
        this.holding = this.gain(1, fx)
        const swell: Curve = [[0, 0], [0.25, 0.6], [HOLD_FOR - 0.2, 1], [HOLD_FOR, 0]]
        this.voice(this.holding, 'triangle', [[0, hz(60)], [HOLD_FOR, hz(84)]], swell, 0.06, at)
        this.voice(this.holding, 'sine', [[0, hz(67)], [HOLD_FOR, hz(91)]], swell, 0.02, at)
        return
      }
      case 'fresh':
        // Done: an open bell chord and a sparkle on top.
        this.bell(fx, BELL, hz(79), at, 1.1, 0.08)
        this.bell(fx, BELL, hz(84), at, 1.1, 0.07)
        this.bell(fx, GLOCK, hz(96), at + 0.12, 0.6, 0.05)
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

  /** Dips the music under a fanfare from `at` for `dur` seconds, then lets it back up. */
  dip(at: number, dur: number) {
    const g = this.duck.gain
    g.cancelScheduledValues(at)
    g.setTargetAtTime(DUCK, at, 0.04)
    g.setTargetAtTime(1, at + dur, 0.3)
  }

  /** A deck for `tune` whose first step plays at `at`, fading in over `fadeIn`. */
  deck(tune: Exclude<Tune, 'none'>, at: number, fadeIn: number): Deck {
    const out = this.gain(0, this.duck)
    out.gain.setValueAtTime(0, at)
    out.gain.linearRampToValueAtTime(1, at + fadeIn)
    return { score: SCORES[tune], out, bass: this.filter('lowpass', 1000, 0.7, out), step: 0, next: at }
  }

  /** Fades a deck out over `fade` from `at`: what it has scheduled plays on into silence. */
  retire(deck: Deck, at: number, fade: number) {
    const g = deck.out.gain
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(0, at + fade)
  }

  /** Plays the deck's next step at `deck.next` and moves its clock on an eighth: the eighth on a beat takes `swing` of the beat, the one after it the rest. */
  step(deck: Deck) {
    const { score } = deck
    const at = deck.next
    const beat = 60 / score.bpm
    const index = Math.floor(deck.step / 8) % score.bars.length
    const slot = deck.step % 8
    const bar = score.bars[index]!
    const { root, third } = CHORDS[bar.chord]
    // The bass's root, from F2 up to E3.
    const low = 41 + ((root + 7) % 12)
    const note = bar.notes[slot]!
    if (note > 0) this.lead(deck.out, score.lead, note + score.octave, (bar.lengths[slot]! * beat) / 2, at)
    if (!score.loop && index === score.bars.length - 1) {
      // The last bar of a tune that ends rings one chord on its first slot, over a kick and a soft cymbal, then nothing.
      if (slot === 0) {
        this.bassNote(deck.bass, low, 4 * beat, at)
        for (const m of [low + 24, low + 24 + third, low + 31]) this.voice(deck.out, 'triangle', [[0, hz(m)]], held(0.05, 4 * beat), LEVEL.pad, at)
        this.kick(deck.out, at)
        this.hiss(deck.out, 'highpass', [[0, 6000]], 0.7, struck(0.005, 2), LEVEL.tick, at)
      }
    } else {
      const bass = BASS[score.bass]
      const sign = bass.line[slot]
      if (sign !== '.') this.bassNote(deck.bass, low + (sign === 'R' ? 0 : sign === '3' ? third : sign === '5' ? 7 : 12), (bass.len * beat) / 2, at)
      if (bass.chop && slot % 4 === 2) for (const shift of [third, 7]) this.voice(deck.out, 'triangle', [[0, hz(low + 12 + shift)]], struck(0.004, 0.12), LEVEL.chop, at)
      const kit = KITS[score.kit]
      if (kit.kicks.includes(slot)) this.kick(deck.out, at)
      if (kit.ticks.includes(slot)) this.tick(deck.out, score.kit, index, slot, at)
    }
    deck.step += 1
    deck.next = at + (slot % 2 === 0 ? score.swing : 1 - score.swing) * beat
  }

  /** A melody note on `lead`, `dur` seconds long, into `out`. */
  private lead(out: AudioNode, lead: Lead, note: number, dur: number, at: number) {
    const f = hz(note)
    const v = LEAD[lead]
    switch (lead) {
      case 'marimba':
        this.bell(out, WOOD, f, at, Math.max(dur, 0.7), v)
        return
      case 'whistle': {
        // Each note scoops up into place, and a long one starts to waver as it holds.
        const o = this.voice(out, 'sine', [[0, f * 0.95], [0.04, f]], held(0.02, dur * 0.95), v, at)
        if (dur > 0.4) this.wobble([o.frequency], 5.5, [[0, 0.01], [0.15, 0.01], [dur, f * 0.012]], at, dur)
        return
      }
      case 'flute':
        // A soft swell with a breath at its start.
        this.voice(out, 'sine', [[0, f]], held(0.06, dur), v, at)
        this.voice(out, 'triangle', [[0, f]], held(0.06, dur), v * 0.3, at)
        this.hiss(out, 'bandpass', [[0, f * 2]], 2, struck(0.01, 0.09), v * 0.3, at)
        return
      case 'glock':
        this.bell(out, GLOCK, f, at, 0.9, v)
        return
      case 'banjo': {
        // A plucked string: bright as it is picked, its tone closing as it rings.
        const body = this.filter('lowpass', 4000, 1, out)
        glide(body.frequency, [[0, 4000], [0.25, 900]], at, 1)
        this.voice(body, 'sawtooth', [[0, f]], struck(0.003, 0.35), v, at)
        this.voice(out, 'triangle', [[0, f]], struck(0.003, 0.3), v * 0.8, at)
        return
      }
      case 'brass':
      case 'band': {
        // Toy horns: a buzz through a soft lowpass over a round triangle; the band adds a glockenspiel an octave up.
        const horn = this.filter('lowpass', 1700, 0.8, out)
        this.voice(horn, 'sawtooth', [[0, f]], held(0.03, dur * 0.95), v, at)
        this.voice(out, 'triangle', [[0, f]], held(0.03, dur * 0.95), v, at)
        if (lead === 'band') this.bell(out, GLOCK, f * 2, at, 0.6, 0.03)
        return
      }
      default: {
        const unknown: never = lead
        throw new Error(`no lead ${String(unknown)}`)
      }
    }
  }

  /** A bass note: a round triangle, with a quiet square over it for the small speakers that cannot play the low notes themselves. */
  private bassNote(out: AudioNode, note: number, dur: number, at: number) {
    const f = hz(note)
    this.voice(out, 'triangle', [[0, f]], held(0.01, dur * 0.9), LEVEL.bass, at)
    this.voice(out, 'square', [[0, f]], held(0.01, dur * 0.9), LEVEL.bass * 0.22, at)
  }

  /** A soft kick: a falling sine with a little knock on top for the small speakers. */
  private kick(out: AudioNode, at: number) {
    this.voice(out, 'sine', [[0, 130], [0.12, 48]], struck(0.003, 0.16), LEVEL.kick, at)
    this.voice(out, 'triangle', [[0, 260], [0.04, 110]], struck(0.002, 0.05), LEVEL.kick * 0.25, at)
  }

  /** The kit's tick on `slot` of bar `index`. */
  private tick(out: AudioNode, kit: Kit, index: number, slot: number, at: number) {
    const v = LEVEL.tick
    switch (kit) {
      case 'brush':
        this.hiss(out, 'bandpass', [[0, 3200]], 0.7, [[0, 0], [0.025, 1], [0.14, 0]], v * 0.8, at)
        return
      case 'shaker':
        this.hiss(out, 'highpass', [[0, 6500]], 0.7, struck(0.004, 0.05), v, at)
        return
      case 'drip':
        this.voice(out, 'sine', [[0, 1400], [0.04, 2300]], struck(0.003, 0.06), v, at)
        return
      case 'twinkle':
        // A glint up high, a different pentatonic note each time round.
        this.bell(out, GLOCK, hz(penta(15 + ((index + slot) % 4))), at, 0.3, v * 0.5)
        return
      case 'clop': {
        // Clip and clop in turn: a pony trotting.
        const f = slot % 4 === 1 ? 1500 : 1100
        this.voice(out, 'sine', [[0, f], [0.012, f * 0.7]], struck(0.001, 0.05), v * 1.2, at)
        return
      }
      case 'snare':
        this.hiss(out, 'bandpass', [[0, 1900]], 0.8, struck(0.002, 0.12), v * 1.4, at)
        this.voice(out, 'triangle', [[0, 200], [0.05, 150]], struck(0.002, 0.06), v, at)
        return
      case 'tick':
        // Tick and tock in turn: a clock, waiting for the next bite.
        this.voice(out, 'sine', [[0, slot % 4 === 0 ? 2400 : 1800]], struck(0.001, 0.025), v, at)
        return
      case 'clap':
        // Three quick slaps and a short tail.
        for (const dt of [0, 0.01, 0.021]) this.hiss(out, 'bandpass', [[0, 1200]], 0.9, struck(0.001, 0.011), v * 1.3, at + dt)
        this.hiss(out, 'bandpass', [[0, 1200]], 0.9, struck(0.002, 0.11), v, at + 0.03)
        return
      default: {
        const unknown: never = kit
        throw new Error(`no kit ${String(unknown)}`)
      }
    }
  }

  /** A toy horn: [seconds in, MIDI, seconds long] notes on a filtered square, with a triangle an octave down under it. */
  private toot(at: number, tune: readonly (readonly [number, number, number])[]) {
    const horn = this.filter('lowpass', 2300, 0.7, this.effects)
    for (const [dt, m, len] of tune) {
      this.voice(horn, 'square', [[0, hz(m)]], held(0.01, len), 0.06, at + dt)
      this.voice(this.effects, 'triangle', [[0, hz(m - 12)]], held(0.01, len), 0.07, at + dt)
    }
  }

  /** A soft springy boing. */
  private boing(at: number, vol: number) {
    const o = this.voice(this.effects, 'sine', [[0, 250], [0.06, 500], [0.4, 370]], struck(0.004, 0.4), vol, at)
    this.wobble([o.frequency], 11, [[0, 40], [0.4, 4]], at, 0.4)
  }

  /** `n` bubbles coming up, each a little higher. */
  private bubbles(at: number, n: number, vol: number) {
    for (let i = 0; i < n; i++) this.voice(this.effects, 'sine', [[0, 400 + i * 80], [0.05, 950 + i * 140]], struck(0.003, 0.06), vol, at + i * 0.08)
  }

  /** A fly buzzing about: a thin buzz wandering in pitch, its wings fluttering. */
  private fly(at: number) {
    const wings = this.tremolo(this.effects, 23, 0.4, at, 0.7)
    const o = this.voice(this.filter('bandpass', 1400, 2, wings), 'sawtooth', [[0, 200], [0.25, 240], [0.5, 190], [0.7, 220]], [[0, 0], [0.08, 1], [0.55, 0.8], [0.7, 0]], 0.07, at)
    this.wobble([o.frequency], 7, [[0, 18]], at, 0.7)
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
    // Each hiss starts somewhere else in the noise, so two together never sound the same grain.
    this.grain = (this.grain + 0.618) % 1.5
    src.start(at, this.grain)
    src.stop(at + level[level.length - 1]![0] + 0.02)
  }

  /** A struck bar or bell: a sine per partial, the higher ones dying sooner. */
  private bell(out: AudioNode, partials: Partials, f: number, at: number, dur: number, vol: number) {
    partials.forEach(([ratio, level], i) => this.voice(out, 'sine', [[0, f * ratio]], struck(0.002, dur / (1 + i)), vol * level, at))
  }

  /** Wobbles these params `rate` times a second by the depth along `depth`, from `at` for `dur`: a vibrato, or with tremolo a shaking level. */
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

  /** A gain into `out` that shakes between 1 - 2 * depth and 1, `rate` times a second, from `at` for `dur`: a buzz, a croak's rattle, wings, lips. */
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

/**
 * The sounds' lifecycle. `sound` is the master switch and `music` the tune's; the save
 * remembers them, and they change through setSound and setMusic.
 *
 * Browsers make no sound before the page is touched, so nothing here makes an AudioContext
 * until the first `unlock` (called from every gesture); until then every call only remembers
 * what it was asked. `suspend` puts the context to sleep (the pause, a hidden page) and the
 * next `unlock` wakes it.
 *
 * The tune's clock wakes every CLOCK_MS and schedules every step due within LOOKAHEAD; a
 * clock that slept skips ahead instead of catching up in a burst. Two jingles want the stage
 * to themselves: `ui('go')` and `ui('home')` hold the tune back until they end, then start it
 * from its first bar. The party plays once and stays quiet until the tune changes. Sound off
 * stops the clock too; sound back on starts the tune again from the top.
 */
export class Sounds {
  private soundOn = true
  private musicOn = true
  private tune: Tune = 'none'
  private ctx: AudioContext | null = null
  private synth: Synth | null = null
  private deck: Deck | null = null
  private timer: ReturnType<typeof setTimeout> | undefined = undefined
  /** Context time before which no tune starts: a jingle is playing. */
  private quietUntil = 0
  /** The party has played to its end: it stays quiet until the tune changes. */
  private ended = false
  /** Suspended by `suspend` and not woken since. The context's own state lags behind (suspending takes a moment), and a tune retired meanwhile must stop at once, not fade on after the wake. */
  private asleep = false
  /** Context time each sound last played (for a patter, the time the last one waits for), by key. */
  private last = new Map<Key, number>()

  /** The master switch: change it with setSound. */
  get sound(): boolean {
    return this.soundOn
  }

  /** The tune's switch: change it with setMusic. */
  get music(): boolean {
    return this.musicOn
  }

  /** Called from every user gesture: makes the audio context on the first, and wakes it whenever it is not running (iOS also has 'interrupted'). */
  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.synth = new Synth(this.ctx)
      this.synth.master.gain.value = this.soundOn ? MASTER : 0
      this.synth.music.gain.value = this.musicOn ? MUSIC : 0
      this.restart(0)
    }
    if (this.ctx.state !== 'running' || this.asleep) void this.ctx.resume()
    this.asleep = false
  }

  /** The master switch: off silences everything and stops the tune's clock; on starts the tune again from the top. */
  setSound(on: boolean): void {
    if (on === this.soundOn) return
    this.soundOn = on
    if (!this.synth) return
    this.synth.master.gain.setTargetAtTime(on ? MASTER : 0, this.ctx!.currentTime, 0.015)
    this.restart(HUSH)
  }

  /** The tune's switch: off silences the music bus and stops the tune's clock; on starts the tune again from the top. */
  setMusic(on: boolean): void {
    if (on === this.musicOn) return
    this.musicOn = on
    if (!this.synth) return
    this.synth.music.gain.setTargetAtTime(on ? MUSIC : 0, this.ctx!.currentTime, 0.015)
    this.restart(HUSH)
  }

  /** The sound for one course or finale event. */
  play(e: SimEvent | FeedEvent): void {
    if (!this.synth) return
    const at = this.slot(e.kind === 'pick' && e.food === 'poop' ? 'poop' : e.kind)
    if (at >= 0) this.synth.event(e, at)
  }

  /** A HUD sound; any of them ends the parent gate's rising tone. */
  ui(kind: UiSound): void {
    if (!this.synth) return
    const now = this.ctx!.currentTime
    this.synth.cut(now)
    if (kind === 'go' || kind === 'home') {
      this.quietUntil = now + (kind === 'go' ? GO_FOR : HOME_FOR)
      this.restart(HUSH)
    }
    const at = this.slot(kind)
    if (at >= 0) this.synth.ui(kind, at)
  }

  /** Plays `tune` from now on. The same tune again does nothing; a new one crossfades in from its first bar (after a go jingle or a home chime, once it ends), and 'none' fades away. */
  setTune(tune: Tune): void {
    if (tune === this.tune) return
    this.tune = tune
    this.ended = false
    if (!this.synth) return
    this.restart(tune === 'none' ? FADE_OUT : FADE)
  }

  /** Silences everything while the game is paused or the page hidden; the next unlock wakes it. */
  suspend(): void {
    if (!this.ctx) return
    this.synth!.cut(this.ctx.currentTime)
    this.asleep = true
    void this.ctx.suspend()
  }

  /** The time to play `key` at, or -1 if it must not play: the sound is off, the same kind sounded under DEDUP ago, or PATTER_MAX of a patter's kind already wait their turn. */
  private slot(key: Key): number {
    if (!this.soundOn) return -1
    const now = this.ctx!.currentTime
    const last = this.last.get(key) ?? -Infinity
    const gap = PATTER[key]
    if (gap === undefined) {
      if (now - last < DEDUP) return -1
      this.last.set(key, now)
      return now
    }
    const at = Math.max(now, last + gap)
    if (at - now >= gap * PATTER_MAX) return -1
    this.last.set(key, at)
    return at
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
    if (this.tune === 'none' || this.ended || !this.soundOn || !this.musicOn) return
    this.deck = this.synth!.deck(this.tune, Math.max(now + LEAD_IN, this.quietUntil), crossfade ? FADE : LEAD_IN)
    this.tick()
  }

  /** The clock: schedules every step due within LOOKAHEAD, then sleeps CLOCK_MS; a tune that ends stops it after its last step. */
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
      this.synth!.step(deck)
    }
    this.timer = setTimeout(() => this.tick(), CLOCK_MS)
  }
}
