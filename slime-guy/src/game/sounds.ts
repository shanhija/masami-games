/**
 * Every sound of Slime Guy synthesised on the spot, nothing to load: jelly plops and
 * squishes for the slime, cartoon voices for the animals on the measuring pole, sparkly
 * pops for the tower's circles, a fanfare and a gift jingle for the box, a gentle tune per
 * island and one for the map, the fans' wind and the whoosh of rising up the tower.
 * Everything is squishy, bubbly and cheerful and never harsh: round waves, soft filters,
 * envelopes that start and end in silence, and a gentle compressor over it all.
 *
 * Two layers. `Synth` makes the voices on any audio context (an OfflineAudioContext can
 * render it to measure, a fake one tests it). `Sounds` is the game's: it makes the page's
 * AudioContext on the first press, drops repeats, runs the tune's clock and keeps the
 * loops going.
 *
 * Every tune is written in C and played in its island's key; the melodic one-shots (the
 * plops, the pops, the fanfare, the jingles) follow the key of the tune playing, so they
 * always sit in tune over it.
 */

import { clamp01, mod, mulberry32 } from './math'
import type { CourseId } from './model'

export type SoundKind =
  | 'go'
  | 'pip'
  | 'jumpBig'
  | 'land'
  | 'landBig'
  | 'bounce'
  | 'squish'
  | 'unsquish'
  | 'giggle'
  | 'plop'
  | 'burp'
  | 'squeal'
  | 'hit'
  | 'drop'
  | 'bump'
  | 'climb'
  | 'over'
  | 'windUp'
  | 'spun'
  | 'sneeze'
  | 'pad'
  | 'whee'
  | 'splash'
  | 'ptui'
  | 'back'
  | 'flag'
  | 'easy'
  | 'key'
  | 'mouse'
  | 'meow'
  | 'woof'
  | 'neigh'
  | 'trumpet'
  | 'trampoline'
  | 'pop1'
  | 'pop5'
  | 'pop100'
  | 'bonk'
  | 'funnel'
  | 'top'
  | 'unlock'
  | 'open'
  | 'gift'
  | 'cheer'
  | 'fanfare'
  | 'teach'
  | 'learned'
  | 'tap'
  | 'select'
  | 'uhuh'
  | 'hop'
  | 'wear'
  | 'jar'
  | 'pattern'
  | 'fireworks'

/** What keeps sounding: the tune of the island (or of the map and wardrobe), the wind of the fans 0 to 1, and the whoosh of rising up the tower. */
export interface Loops {
  tune: CourseId | 'map' | null
  wind: number
  rise: boolean
}

/** The tunes: one per island, and the map's, which the wardrobe plays too. */
export type TuneId = CourseId | 'map'

// ---------------------------------------------------------------------------------------
// The mix.

/** The master (mute puts it at nothing), the effects' bus and the music's bus; both buses go through the master and on through a gentle compressor, so a pile of sounds at once never makes one loud burst. */
export const MASTER = 0.8
export const EFFECTS = 1
export const MUSIC = 0.3
/** The soft room (a reverb) everything can send a share of itself into, how much of the effects go there, and how loud the room comes back. */
const ROOM_SECONDS = 1.8
const EFFECTS_ROOM = 0.12
const ROOM_WET = 0.5
/** The music dips to this share of itself while a big jingle plays, for as long as the table says. */
const DUCK = 0.35
const DUCK_FOR: Partial<Record<SoundKind, number>> = { fanfare: 2.3, gift: 1.1, pop100: 1.8, pattern: 1.7, fireworks: 2.9 }
/** The same kind of sound again within this many seconds is the same sound: ten plops in one frame make one. */
export const DEDUP = 0.05
/** A sound starts this long after it is asked for, so the audio thread never misses the start of its envelope (a click); far too short to hear. */
export const START = 0.01
/** A plop within this long of the last climbs one step up the scale; after a longer pause the climb starts again at the bottom. */
export const PLOP_RUN = 0.6
/** The plops' ladder: the major pentatonic from G5 up to E7 (MIDI, before the key), high enough to ring out of a tablet's small speaker. */
export const PLOP_NOTES = [79, 81, 84, 86, 88, 91, 93, 96, 98, 100] as const
/** The small hop's three notes in turn (semitones over C6), so a row of hops stays fresh. */
const PIP_STEPS = [0, 2, 4] as const
/** The tune's clock wakes every CLOCK_MS and schedules every step due within LOOKAHEAD seconds; a tune starts LEAD_IN after it is asked for. */
const CLOCK_MS = 60
export const LOOKAHEAD = 0.3
const LEAD_IN = 0.06
/** A tune fades in over FADE_IN; the one it replaces fades out over CROSSFADE, and with no tune at all (a pause) over FADE_OUT. */
export const FADE_IN = 0.5
export const CROSSFADE = 0.8
export const FADE_OUT = 0.6
/** The fans' wind at full: the whoosh (the blades chop it) and the motor's hum. The whoosh of rising up the tower. */
const WIND = 0.13
const HUM = 0.045
const RISE = 0.075
/** Exponential glides never reach zero: this is silence. Partials above TOP_HZ are left out (they would only alias). */
const SILENT = 0.0001
const TOP_HZ = 15000

/** The frequency of a MIDI note (A4, 69, is 440 Hz). */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** The plop ladder's next rung after one that rang `gap` seconds ago: one up within PLOP_RUN (staying at the top), the bottom after a longer pause. */
export function plopRung(rung: number, gap: number): number {
  return gap <= PLOP_RUN ? Math.min(rung + 1, PLOP_NOTES.length - 1) : 0
}

// ---------------------------------------------------------------------------------------
// The music, written in C.

/** The chords the tunes use: the root as a pitch class (C is 0) and the semitones of the chord's notes above it. */
export const CHORDS = {
  C: { root: 0, tones: [0, 4, 7] },
  Dm: { root: 2, tones: [0, 3, 7] },
  Em: { root: 4, tones: [0, 3, 7] },
  F: { root: 5, tones: [0, 4, 7] },
  G: { root: 7, tones: [0, 4, 7] },
  G7: { root: 7, tones: [0, 4, 7, 10] },
  Am: { root: 9, tones: [0, 3, 7] },
} as const satisfies Record<string, { root: number; tones: readonly number[] }>
export type Chord = keyof typeof CHORDS
type ChordShape = (typeof CHORDS)[Chord]

/** One bar ready to play: its chord, and per eighth-note slot the melody note that starts there (MIDI as written in C, 0 for none) and how many slots it lasts. */
export interface Bar {
  chord: Chord
  notes: readonly number[]
  lengths: readonly number[]
}

/** A bar as written: its chord and its melody (see `bars`). */
type Line = readonly [Chord, string]

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** MIDI for a written note: a letter, maybe # or b, and an octave (C4 is 60). Throws for anything else. */
function midiOf(word: string): number {
  const m = /^([A-G])([#b]?)([2-7])$/.exec(word)
  if (!m) throw new Error(`'${word}' is not a note: write a letter, maybe # or b, and an octave, like F#5`)
  return LETTERS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3]) + 1)
}

/**
 * Bars from a melody written a bar a line, each line with its chord. A line is `slots`
 * eighth-note slots apart by spaces: a note (E5, F#4, Bb4), '-' holding the note before
 * (across a bar line too) or '.' for silence. Throws on a line of another length, a hold
 * with nothing to hold, or a word that is not a note.
 */
function bars(slots: 6 | 8, lines: readonly Line[]): Bar[] {
  const notes: number[] = []
  const lengths: number[] = []
  let holding = -1
  lines.forEach(([, line], b) => {
    const words = line.split(/\s+/).filter((w) => w !== '')
    if (words.length !== slots) throw new Error(`bar ${b + 1} '${line}' has ${words.length} slots, not ${slots}`)
    for (const w of words) {
      if (w === '-' && holding < 0) throw new Error(`bar ${b + 1} '${line}': a '-' with nothing to hold`)
      if (w === '-') lengths[holding] += 1
      if (w === '.') holding = -1
      const note = w === '-' || w === '.' ? 0 : midiOf(w)
      if (note > 0) holding = notes.length
      notes.push(note)
      lengths.push(note > 0 ? 1 : 0)
    }
  })
  return lines.map(([chord], b) => ({ chord, notes: notes.slice(b * slots, (b + 1) * slots), lengths: lengths.slice(b * slots, (b + 1) * slots) }))
}

/** A tune's 32 bars: its first A, its second A (which comes home to C), its B, and the second A again. */
function form(slots: 6 | 8, a1: readonly Line[], a2: readonly Line[], b: readonly Line[]): Bar[] {
  return [...bars(slots, a1), ...bars(slots, a2), ...bars(slots, b), ...bars(slots, a2)]
}

/** The lead's instrument. bubble: a jelly triangle that scoops into each note. pan: a steel pan, rolling the long notes. box: a music box's tine. glock: a glockenspiel. flute: a soft flute with a late vibrato. marimba: a warm wooden bar. */
type Lead = 'bubble' | 'pan' | 'box' | 'glock' | 'flute' | 'marimba'
/** The bass. bounce: a short tuba. round: a round plucked bass. tine: the music box's low tines. pluck: a plucked string. float: long soft notes. */
type BassVoice = 'bounce' | 'round' | 'tine' | 'pluck' | 'float'
/** The chords. uke: a ukulele's chop on 2 and 4. skank: short woody chords on every off-beat. pahpah: the waltz's two chords after the bass, on tines. arp: a celesta breaking the chord in eighths. harp: a harp rocking through the chord. pad: a warm chord held through the bar. */
type Comp = 'uke' | 'skank' | 'pahpah' | 'arp' | 'harp' | 'pad'
/** The drums. bouncy: kick, snaps and a shaker. calypso: kick, congas and a busy shaker. clock: a music box's clockwork ticking. sleigh: sleigh bells and a soft kick. brush: brushes and a soft kick. stars: no drums, a star twinkling every other bar. */
type Kit = 'bouncy' | 'calypso' | 'clock' | 'sleigh' | 'brush' | 'stars'
/** What joins every second time round. harmony: the lead's own voice singing under the tune in the chord. flute: a flute singing under the tune in the chord. sparkle: high tines twinkling through the chords. echo: the tune again an eighth later, softer. choir: a soft choir holding the chords. */
type Extra = 'harmony' | 'flute' | 'sparkle' | 'echo' | 'choir'

/** A tune and its arrangement. */
export interface Score {
  /** Beats a minute: quarter notes, or dotted quarters in six-eight. */
  bpm: number
  /** Eighth-note slots in a bar, and in a beat. */
  slots: 6 | 8
  beat: 2 | 3
  /** Semitones above C the tune sounds in; the melodic one-shots follow it. */
  key: number
  /** How late the off-beat eighths come, as a share of an eighth: 0 is straight. */
  swing: number
  bars: readonly Bar[]
  lead: Lead
  /** Semitones the lead plays above the written melody (before the key). */
  octave: number
  /** The bass: its voice, per slot the semitones over the chord's root it plays (null for none), and how many slots a note lasts. */
  bass: { voice: BassVoice; line: readonly (number | null)[]; len: number }
  comp: Comp
  kit: Kit
  extra: Extra
  /** How much of the tune goes into the room, and the tune's own level (so every tune sounds about as loud as the others). */
  room: number
  level: number
}

/** The park: bouncy and skipping, a jelly lead over a tuba, a ukulele and snaps. */
const PARK_A: readonly Line[] = [
  ['C', 'E5 .  C5 .  E5 G5 E5 .'],
  ['G', 'D5 .  B4 .  D5 G5 D5 .'],
  ['C', 'E5 .  C5 .  E5 G5 C6 .'],
  ['F', 'A5 -  -  .  G5 .  .  .'],
  ['F', 'A5 .  F5 .  A5 C6 A5 .'],
  ['C', 'G5 .  E5 .  G5 C6 G5 .'],
]
const PARK_B: readonly Line[] = [
  ['Am', 'C6 -  -  -  B5 .  A5 .'],
  ['F', 'A5 -  -  -  G5 .  F5 .'],
  ['C', 'G5 -  -  -  E5 .  C5 .'],
  ['G', 'D5 -  -  -  .  .  .  .'],
  ['Am', 'C6 -  -  -  B5 .  A5 .'],
  ['F', 'A5 -  -  -  C6 .  A5 .'],
  ['Dm', 'F5 .  A5 .  G5 .  F5 .'],
  ['G', 'E5 .  D5 .  G5 .  .  .'],
]

/** The beach: a sunny calypso on steel pans that skips ahead of the beat. */
const BEACH_A: readonly Line[] = [
  ['C', 'G5 .  E5 G5 .  E5 C5 .'],
  ['F', 'A5 .  F5 A5 .  F5 C5 .'],
  ['G', 'B5 .  G5 B5 .  A5 G5 .'],
  ['C', 'C6 -  -  .  G5 .  E5 .'],
  ['C', 'G5 .  E5 G5 .  E5 C5 .'],
  ['F', 'A5 .  F5 A5 .  C6 A5 .'],
]
const BEACH_B: readonly Line[] = [
  ['F', 'C6 -  -  -  A5 -  C6 -'],
  ['C', 'G5 -  -  -  E5 -  G5 -'],
  ['Dm', 'F5 -  -  -  D5 -  F5 -'],
  ['G', 'G5 -  -  -  -  -  .  .'],
  ['F', 'A5 -  -  C6 .  A5 G5 .'],
  ['C', 'E5 -  -  G5 .  E5 C5 .'],
  ['Dm', 'D5 .  F5 A5 .  G5 F5 .'],
  ['G', 'G5 -  -  -  D5 .  .  .'],
]

/** Candy Land: a music box waltz, turning round and round. */
const CANDY_A1: readonly Line[] = [
  ['C', 'C5 -  E5 -  G5 -'],
  ['C', 'C6 -  -  -  G5 -'],
  ['F', 'A5 -  G5 -  F5 -'],
  ['C', 'E5 -  -  -  -  -'],
  ['Dm', 'F5 -  A5 -  D6 -'],
  ['G', 'B5 -  -  -  A5 -'],
  ['G7', 'G5 -  F5 -  D5 -'],
  ['C', 'E5 -  -  -  .  .'],
]
const CANDY_A2: readonly Line[] = [
  ['C', 'C5 -  E5 -  G5 -'],
  ['C', 'C6 -  -  -  G5 -'],
  ['F', 'A5 -  C6 -  A5 -'],
  ['F', 'G5 -  -  -  F5 -'],
  ['C', 'E5 -  G5 -  C6 -'],
  ['G', 'D6 -  -  -  B5 -'],
  ['G7', 'A5 -  G5 -  F5 -'],
  ['C', 'C6 -  -  -  .  .'],
]
const CANDY_B: readonly Line[] = [
  ['Am', 'E5 -  A5 -  C6 -'],
  ['Am', 'B5 -  -  -  A5 -'],
  ['F', 'A5 -  F5 -  C5 -'],
  ['G', 'D5 -  -  -  -  -'],
  ['Am', 'E5 -  A5 -  C6 -'],
  ['Am', 'E6 -  -  -  C6 -'],
  ['F', 'D6 -  C6 -  A5 -'],
  ['G', 'B5 -  -  -  G5 -'],
]

/** Snow Land: a glockenspiel sleigh ride through the snow. */
const WINTER_A: readonly Line[] = [
  ['C', 'E5 .  G5 .  C6 .  B5 .'],
  ['Am', 'A5 .  E5 .  A5 -  -  .'],
  ['F', 'F5 .  A5 .  C6 .  A5 .'],
  ['G', 'G5 -  -  -  D5 .  .  .'],
  ['C', 'E5 .  G5 .  C6 .  D6 .'],
  ['Am', 'E6 -  -  -  C6 .  A5 .'],
]
const WINTER_B: readonly Line[] = [
  ['F', 'C6 -  A5 -  F5 -  A5 -'],
  ['G', 'B5 -  G5 -  D5 -  G5 -'],
  ['Em', 'G5 -  E5 -  B4 -  E5 -'],
  ['Am', 'A5 -  -  -  C6 -  -  -'],
  ['F', 'C6 -  A5 -  F5 -  A5 -'],
  ['G', 'B5 -  G5 -  D5 -  B5 -'],
  ['C', 'C6 -  G5 -  E5 -  G5 -'],
  ['G', 'D6 -  -  -  B5 -  -  -'],
]

/** Star Night: a soft lullaby in six-eight, rocking under the stars. */
const NIGHT_A: readonly Line[] = [
  ['C', 'G4 -  -  E5 -  D5'],
  ['C', 'C5 -  -  G5 -  -'],
  ['F', 'A4 -  -  F5 -  E5'],
  ['C', 'E5 -  -  -  -  -'],
  ['F', 'A4 -  -  F5 -  A5'],
  ['C', 'G5 -  -  E5 -  C5'],
]
const NIGHT_B: readonly Line[] = [
  ['Am', 'E5 -  -  A5 -  G5'],
  ['Am', 'E5 -  -  C5 -  -'],
  ['F', 'F5 -  -  A5 -  C6'],
  ['C', 'G5 -  -  -  -  -'],
  ['Am', 'E5 -  -  A5 -  B5'],
  ['F', 'C6 -  -  A5 -  F5'],
  ['Dm', 'D5 -  -  F5 -  A5'],
  ['G', 'G5 -  -  -  -  -'],
]

/** The map and the wardrobe: a cheerful stroll from island to island. */
const MAP_A: readonly Line[] = [
  ['C', 'C5 .  D5 E5 .  G5 .  E5'],
  ['F', 'F5 .  G5 A5 .  C6 .  A5'],
  ['G', 'G5 .  A5 B5 .  D6 .  B5'],
  ['C', 'C6 -  -  -  .  .  .  .'],
  ['Am', 'C6 .  B5 A5 .  E5 .  A5'],
  ['F', 'A5 .  G5 F5 .  C5 .  F5'],
]
const MAP_B: readonly Line[] = [
  ['F', 'A5 -  -  -  G5 -  F5 -'],
  ['C', 'E5 -  -  -  D5 -  C5 -'],
  ['Dm', 'D5 -  F5 -  A5 -  F5 -'],
  ['G', 'G5 -  -  -  -  -  .  .'],
  ['F', 'A5 -  -  -  G5 -  F5 -'],
  ['C', 'E5 -  -  -  G5 -  C6 -'],
  ['Dm', 'D6 -  C6 -  A5 -  F5 -'],
  ['G', 'G5 -  -  -  B4 -  D5 -'],
]

/** Every tune, each in its own key, tempo and colour. */
export const SCORES: Record<TuneId, Score> = {
  /** The park, in C: bouncy and skipping, a jelly lead over a tuba, a ukulele's chop, snaps and a shaker; second time round a flute sings along. */
  park: {
    bpm: 124,
    slots: 8,
    beat: 2,
    key: 0,
    swing: 0.14,
    bars: form(8, [...PARK_A, ['G', 'F5 .  E5 .  D5 .  E5 F5'], ['G', 'G5 -  -  -  .  .  .  .']], [...PARK_A, ['G', 'F5 .  E5 .  D5 .  G4 .'], ['C', 'C5 -  -  -  .  .  .  .']], PARK_B),
    lead: 'bubble',
    octave: 0,
    bass: { voice: 'bounce', line: [0, null, 12, null, 7, null, 12, null], len: 1 },
    comp: 'uke',
    kit: 'bouncy',
    extra: 'flute',
    room: 0.16,
    level: 1.07,
  },
  /** The beach, in F: a calypso on steel pans over a round bass, island chords on the off-beats, congas and a shaker; second time round a second pan plays in thirds. */
  beach: {
    bpm: 108,
    slots: 8,
    beat: 2,
    key: 5,
    swing: 0,
    bars: form(8, [...BEACH_A, ['G', 'G5 .  F5 E5 .  D5 E5 .'], ['G', 'D5 -  -  -  .  .  .  .']], [...BEACH_A, ['G', 'G5 .  F5 E5 .  D5 B4 .'], ['C', 'C5 -  -  -  .  .  .  .']], BEACH_B),
    lead: 'pan',
    octave: 0,
    bass: { voice: 'round', line: [0, null, null, 7, 0, null, 7, null], len: 2 },
    comp: 'skank',
    kit: 'calypso',
    extra: 'harmony',
    room: 0.18,
    level: 1.14,
  },
  /** Candy Land, in G: a music box waltz, low tines on one and the chord on two and three, the clockwork ticking; second time round high tines sparkle. */
  candy: {
    bpm: 126,
    slots: 6,
    beat: 2,
    key: -5,
    swing: 0,
    bars: form(6, CANDY_A1, CANDY_A2, CANDY_B),
    lead: 'box',
    octave: 12,
    bass: { voice: 'tine', line: [0, null, null, null, null, null], len: 6 },
    comp: 'pahpah',
    kit: 'clock',
    extra: 'sparkle',
    room: 0.32,
    level: 0.92,
  },
  /** Snow Land, in D: a glockenspiel sleigh ride, a plucked bass, a celesta breaking the chords and sleigh bells; second time round the bells echo. */
  winter: {
    bpm: 112,
    slots: 8,
    beat: 2,
    key: 2,
    swing: 0,
    bars: form(8, [...WINTER_A, ['F', 'D6 .  C6 .  A5 .  G5 .'], ['G', 'G5 -  -  -  .  .  .  .']], [...WINTER_A, ['G', 'G5 .  A5 .  B5 .  D6 .'], ['C', 'C6 -  -  -  .  .  .  .']], WINTER_B),
    lead: 'glock',
    octave: 0,
    bass: { voice: 'pluck', line: [0, null, 7, null, 12, null, 7, null], len: 2 },
    comp: 'arp',
    kit: 'sleigh',
    extra: 'echo',
    room: 0.3,
    level: 1.37,
  },
  /** Star Night, in E flat: a slow lullaby in six-eight, a soft flute over a harp and long low notes, a star twinkling now and then; second time round a soft choir hums. */
  night: {
    bpm: 54,
    slots: 6,
    beat: 3,
    key: 3,
    swing: 0,
    bars: form(6, [...NIGHT_A, ['G', 'D5 -  -  G5 -  F5'], ['G', 'D5 -  -  -  -  -']], [...NIGHT_A, ['G', 'D5 -  -  B4 -  D5'], ['C', 'C5 -  -  -  -  -']], NIGHT_B),
    lead: 'flute',
    octave: 0,
    bass: { voice: 'float', line: [0, null, null, 7, null, null], len: 3 },
    comp: 'harp',
    kit: 'stars',
    extra: 'choir',
    room: 0.5,
    level: 0.4,
  },
  /** The map and the wardrobe, in B flat: a cheerful stroll on a marimba, a plucked bass, a warm pad and brushes; second time round the marimba plays in thirds. */
  map: {
    bpm: 100,
    slots: 8,
    beat: 2,
    key: -2,
    swing: 0.08,
    bars: form(8, [...MAP_A, ['G', 'G5 .  F5 E5 .  D5 .  F5'], ['G', 'G5 -  -  -  .  .  .  .']], [...MAP_A, ['G', 'G5 .  F5 E5 .  D5 .  B4'], ['C', 'C5 -  -  -  .  .  .  .']], MAP_B),
    lead: 'marimba',
    octave: 0,
    bass: { voice: 'pluck', line: [0, null, null, null, 7, null, 12, null], len: 2 },
    comp: 'pad',
    kit: 'brush',
    extra: 'harmony',
    room: 0.22,
    level: 1.2,
  },
}

/** How long one time round a tune takes, in seconds (the second time round adds its extra voice, so it repeats exactly only after twice this). */
export const tuneSeconds = (tune: TuneId) => (SCORES[tune].bars.length * SCORES[tune].slots * 60) / (SCORES[tune].bpm * SCORES[tune].beat)

/** The note a second voice sings under the tune's `midi` over `chord`, both as written in C: the chord's highest note at least a minor third lower, so it always sits in the chord and never rubs against the tune. */
export function harmonyUnder(midi: number, chord: Chord): number {
  const { root, tones } = CHORDS[chord]
  for (let m = midi - 3; m > midi - 12; m--) if (tones.some((t) => mod(m - root - t, 12) === 0)) return m
  throw new Error(`no note of ${chord} under ${midi}`)
}

/** The chord's notes in the key, each in the octave from `low` up (MIDI), lowest first. */
function voicing(chord: ChordShape, key: number, low: number): number[] {
  return chord.tones.map((t) => low + mod(chord.root + key + t - low, 12)).sort((a, b) => a - b)
}

/** A voicing and the same an octave up: the notes the arpeggios walk over. */
const spread = (notes: readonly number[]) => [...notes, ...notes.map((m) => m + 12)]
/** Which note of the spread the celesta, the harp and the sparkle play on each slot. */
const ARP = [0, 1, 2, 3, 4, 3, 2, 1] as const
const HARP = [0, 2, 3, 4, 3, 2] as const
const SPARKLE = [3, 4, 2, 4, 1, 4] as const
/** The night's stars, a note every other bar (MIDI, before the key). */
const TWINKLES = [96, 91, 98, 93, 100, 88] as const

/** Each voice's level inside its tune. */
const LEAD: Record<Lead, number> = { bubble: 0.17, pan: 0.15, box: 0.15, glock: 0.12, flute: 0.16, marimba: 0.2 }
const BASS: Record<BassVoice, number> = { bounce: 0.15, round: 0.16, tine: 0.1, pluck: 0.15, float: 0.12 }
const COMP: Record<Comp, number> = { uke: 0.045, skank: 0.035, pahpah: 0.045, arp: 0.035, harp: 0.045, pad: 0.03 }
const EXTRA: Record<Extra, number> = { harmony: 0.6, flute: 0.06, sparkle: 0.03, echo: 0.045, choir: 0.03 }
const KIT = { kick: 0.13, tick: 0.035, twinkle: 0.03 }

// ---------------------------------------------------------------------------------------
// The jingles' notes (MIDI, before the key).

/** The box's fanfare: [seconds from the start, note, how long]. */
const FANFARE: readonly (readonly [number, number, number])[] = [
  [0, 67, 0.12],
  [0.14, 72, 0.12],
  [0.28, 76, 0.12],
  [0.42, 79, 0.38],
  [0.86, 76, 0.13],
  [1.02, 84, 1],
]
/** The notes a firework's twinkles fall on: the pentatonic high up. */
const FIREWORK_NOTES = [84, 86, 88, 91, 93, 96, 98, 100] as const
/** The giggle's "hee"s (Hz), each a little lower; a giggle uses the first three to five. */
const GIGGLE = [920, 870, 830, 790, 750] as const

// ---------------------------------------------------------------------------------------
// The voices.

/** A pitch or a level over time: [seconds after the start, value] points, joined by exponential glides. */
type Path = readonly (readonly [number, number])[]
/** Struck: up to full over `attack`, then dying away to silence at `dur`. */
const strike = (attack: number, dur: number): Path => [
  [0, 0],
  [attack, 1],
  [dur, 0],
]
/** Held: up to full over `attack`, easing to 0.6 by `dur`, then gone over `release`. */
function held(attack: number, dur: number, release: number): Path {
  const end = Math.max(dur, attack * 2)
  return [
    [0, 0],
    [attack, 1],
    [end, 0.6],
    [end + release, 0],
  ]
}

/** Sets `param` along `path` from `at`, each value times `scale`, never below SILENT (an exponential glide cannot reach zero). */
function glide(param: AudioParam, path: Path, at: number, scale: number) {
  path.forEach(([t, v], i) => {
    const value = Math.max(v * scale, SILENT)
    if (i > 0) param.exponentialRampToValueAtTime(value, at + t)
    else {
      // The first value holds from now as well: a source may start a sample before its first event, and must not meet a gain's default of 1 there (a click).
      param.value = value
      param.setValueAtTime(value, at + t)
    }
  })
}

/** A struck sound's partials as [ratio to the fundamental, level]; the higher ones die sooner. */
type Partials = readonly (readonly [number, number])[]
/** A glass bar: the sparkles, the stars and the twinkles. */
const GLASS: Partials = [
  [1, 1],
  [2.76, 0.28],
  [5.4, 0.09],
]
/** A music box's tine. */
const TINE: Partials = [
  [1, 1],
  [2.99, 0.12],
  [5.6, 0.07],
  [8.2, 0.025],
]
/** The snow's glockenspiel: brighter and longer than the glass. */
const GLOCK: Partials = [
  [1, 1],
  [2.76, 0.35],
  [5.4, 0.12],
  [8.93, 0.04],
]
/** A celesta: a softer bell for chords. */
const CELESTA: Partials = [
  [1, 1],
  [2, 0.18],
  [3, 0.06],
]
/** A round bell for the box's jingles. */
const CHIME: Partials = [
  [1, 1],
  [2, 0.45],
  [3.01, 0.2],
  [4.16, 0.08],
]
/** Keys on a ring. */
const KEYS: Partials = [
  [1, 1],
  [2.43, 0.5],
  [4.12, 0.3],
]

/** A tune playing: its score, its fader (tunes crossfade on it), where its voices go in, and where its clock is. */
export interface Deck {
  tune: TuneId
  score: Score
  out: GainNode
  lead: AudioNode
  bass: AudioNode
  comp: AudioNode
  /** The next step to play, counted from the tune's first slot (it keeps counting past the end: every second time round adds the extra), and when. */
  step: number
  next: number
}

/** The fans' wind while it blows: a band of noise the blades chop, and the motor's hum, each following the level. */
export interface Wind {
  band: BiquadFilterNode
  whoosh: GainNode
  chop: GainNode
  blades: OscillatorNode
  hum: GainNode
  motor: readonly OscillatorNode[]
  level: number
}

/** The whoosh of rising up the tower: its fader and what feeds it. */
export interface Rise {
  fader: GainNode
  sources: readonly AudioScheduledSourceNode[]
}

/**
 * Every voice of the game on one audio context: the buses, the room, the effects, the
 * steps of the tunes and the loops. Sounds runs it on the page's AudioContext; it runs as
 * well on any other.
 */
export class Synth {
  readonly ctx: BaseAudioContext
  readonly master: GainNode
  readonly effects: GainNode
  readonly music: GainNode
  /** The room's input: whatever goes in comes back softly as reverb. */
  readonly room: GainNode
  /** Semitones above C the melodic one-shots play in: the key of the tune playing. */
  key = 0
  /** Seeded, so the same calls make the same sounds. */
  private rand = mulberry32(0x5113e)
  /** Two seconds of white noise every noisy sound loops over. */
  private white: AudioBuffer
  /** The plop ladder's rung and when it last rang; the small hops so far; when the music comes back up from a duck. */
  private rung = 0
  private plopAt = -Infinity
  private hops = 0
  private duckedUntil = 0

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx
    const squash = ctx.createDynamicsCompressor()
    squash.threshold.value = -14
    squash.knee.value = 8
    squash.ratio.value = 3.5
    squash.attack.value = 0.004
    squash.release.value = 0.25
    squash.connect(ctx.destination)
    this.master = this.gain(MASTER, squash)
    this.effects = this.gain(EFFECTS, this.master)
    this.music = this.gain(MUSIC, this.master)
    this.white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = this.white.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = this.rand() * 2 - 1
    const reverb = ctx.createConvolver()
    reverb.buffer = this.impulse()
    reverb.connect(this.gain(ROOM_WET, this.master))
    this.room = this.gain(1, reverb)
    this.effects.connect(this.gain(EFFECTS_ROOM, this.room))
  }

  /** The sound of one kind, starting at `at`. */
  effect(kind: SoundKind, at: number) {
    const fx = this.effects
    const t = at
    /** A note of the jingles in the key of the tune playing. */
    const k = (m: number) => hz(m + this.key)
    const hold = DUCK_FOR[kind]
    if (hold !== undefined) this.duck(at, hold)
    switch (kind) {
      case 'go':
        // Go! Two jelly hops up and a bright ring on top.
        this.bloop(fx, k(67) * 0.7, k(67), t, 0.13, 0.15)
        this.bloop(fx, k(72) * 0.7, k(72), t + 0.12, 0.13, 0.15)
        this.ring(fx, GLASS, k(84), t + 0.25, 1, 0.11)
        this.ring(fx, GLASS, k(88), t + 0.25, 0.8, 0.06)
        this.ring(fx, GLASS, k(91), t + 0.25, 0.8, 0.06)
        this.osc(fx, 'triangle', [[0, k(72)]], held(0.01, 0.35, 0.3), 0.07, t + 0.25)
        this.hiss(fx, 'highpass', [[0, 6500]], 0.7, [[0, 0], [0.05, 1], [0.6, 0]], 0.015, t + 0.25)
        return
      case 'pip': {
        // A small hop: a quick light pip, on the next of three notes so a row of hops stays fresh.
        const f = k(84 + PIP_STEPS[this.hops % PIP_STEPS.length])
        this.hops += 1
        this.bloop(fx, f * 0.55, f, t, 0.09, 0.18)
        return
      }
      case 'jumpBig': {
        // A big slime takes off: a slow stretchy bwoomp up, wobbling like jelly.
        const a = this.osc(fx, 'sine', [[0, 200], [0.3, 620]], [[0, 0], [0.02, 1], [0.22, 0.7], [0.34, 0]], 0.15, t)
        const b = this.osc(fx, 'triangle', [[0, 400], [0.3, 1240]], [[0, 0], [0.02, 1], [0.2, 0.5], [0.3, 0]], 0.04, t)
        this.wobble([a.frequency], 8, [[0, 18], [0.34, 6]], t, 0.34)
        this.wobble([b.frequency], 8, [[0, 36], [0.3, 12]], t, 0.3)
        this.hiss(fx, 'bandpass', [[0, 500], [0.25, 1600]], 1.2, [[0, 0], [0.05, 1], [0.26, 0]], 0.035, t)
        return
      }
      case 'land': {
        // A small slime lands: a soft wet pat, never twice quite the same.
        const f = 620 * (0.93 + 0.14 * this.rand())
        this.osc(fx, 'sine', [[0, f], [0.06, f * 0.42]], strike(0.002, 0.08), 0.17, t)
        this.hiss(fx, 'bandpass', [[0, 1400]], 1, strike(0.002, 0.04), 0.06, t)
        return
      }
      case 'landBig':
        // A big slime lands: a heavy squelchy splot (the low thump is for headphones), and the jelly jiggles.
        this.osc(fx, 'sine', [[0, 150], [0.18, 52]], strike(0.003, 0.24), 0.2, t)
        this.osc(fx, 'triangle', [[0, 420], [0.12, 160]], strike(0.003, 0.14), 0.12, t)
        this.hiss(fx, 'bandpass', [[0, 1800], [0.2, 400]], 1.4, [[0, 0], [0.01, 1], [0.22, 0]], 0.18, t)
        this.osc(fx, 'sine', [[0, 560], [0.07, 420], [0.15, 500], [0.3, 380]], strike(0.01, 0.32), 0.14, t + 0.04)
        return
      case 'bounce': {
        // The big slime's second bounce: the ground thumps and a big jelly BOING wobbles away through a closing mouth.
        this.osc(fx, 'sine', [[0, 120], [0.16, 48]], strike(0.002, 0.2), 0.2, t)
        const level: Path = [[0, 0], [0.012, 1], [0.18, 0.7], [0.85, 0]]
        const a = this.osc(fx, 'sine', [[0, 130], [0.045, 440], [0.85, 340]], level, 0.2, t)
        const mouth = this.filter('lowpass', 3000, 4, fx)
        glide(mouth.frequency, [[0, 3000], [0.85, 700]], t, 1)
        const b = this.osc(mouth, 'triangle', [[0, 260], [0.045, 880], [0.85, 680]], level, 0.09, t)
        this.wobble([a.frequency], 11, [[0, 95], [0.85, 6]], t, 0.85)
        this.wobble([b.frequency], 11, [[0, 190], [0.85, 12]], t, 0.85)
        return
      }
      case 'squish': {
        // Arms in, flat as a puddle: a wet squelch sliding down, a little higher or lower each time.
        const lift = 0.94 + 0.12 * this.rand()
        const o = this.osc(fx, 'sine', [[0, 820 * lift], [0.18, 260 * lift]], strike(0.005, 0.2), 0.16, t)
        this.wobble([o.frequency], 22, [[0, 60], [0.18, 15]], t, 0.2)
        this.hiss(fx, 'bandpass', [[0, 2600], [0.16, 700]], 2, [[0, 0], [0.008, 1], [0.06, 0.4], [0.17, 0]], 0.1, t)
        return
      }
      case 'unsquish': {
        // Back up: a bloop up and a little pop at the top.
        const o = this.osc(fx, 'sine', [[0, 300], [0.12, 900]], strike(0.004, 0.14), 0.2, t)
        this.wobble([o.frequency], 18, [[0, 30]], t, 0.14)
        this.osc(fx, 'sine', [[0, 1100], [0.03, 1600]], strike(0.001, 0.04), 0.1, t + 0.11)
        return
      }
      case 'giggle': {
        // Hee-hee-hee from inside the puddle, just after the squish: three to five of them, higher or lower each time.
        const lift = 0.9 + 0.2 * this.rand()
        GIGGLE.slice(0, 3 + Math.floor(this.rand() * 3)).forEach((hee, i) => {
          const p = hee * lift
          const voice = this.sing(fx, [[0, p * 0.92], [0.03, p * 1.06], [0.075, p * 0.95]], strike(0.008, 0.08), 0.2, [[0, 2000]], t + 0.12 + i * 0.095)
          this.wobble(voice.map((o) => o.frequency), 30, [[0, 18]], t + 0.12 + i * 0.095, 0.08)
        })
        return
      }
      case 'plop': {
        // A ball into the jelly: a bubbly bloop, a step up the ladder for every ball close after the last.
        this.rung = plopRung(this.rung, t - this.plopAt)
        this.plopAt = t
        const f = k(PLOP_NOTES[this.rung])
        this.bloop(fx, f * 0.6, f, t, 0.12, 0.24)
        this.ring(fx, GLASS, f * 2, t + 0.04, 0.25, 0.02)
        return
      }
      case 'burp': {
        // Every tenth ball: a little burp, then a tiny bubble pops out after it.
        const f = 240 * (0.9 + 0.2 * this.rand())
        const throat = this.filter('lowpass', 1800, 0, fx)
        const o = this.osc(throat, 'sawtooth', [[0, f], [0.08, f * 0.9], [0.22, f * 0.8], [0.3, f * 1.05]], [[0, 0], [0.02, 1], [0.24, 0.8], [0.32, 0]], 0.14, t)
        this.wobble([o.frequency], 29, [[0, 16]], t, 0.32)
        this.wobble([o.frequency], 7, [[0, 8]], t, 0.32)
        this.osc(fx, 'sine', [[0, f], [0.3, f * 0.85]], [[0, 0], [0.02, 1], [0.3, 0]], 0.08, t)
        this.bloop(fx, 800, 1300, t + 0.36, 0.06, 0.09)
        return
      }
      case 'squeal': {
        // A baby is found: a happy high squeal (each baby a little different), then two sparkles.
        const lift = 0.92 + 0.16 * this.rand()
        const voice = this.sing(fx, [[0, 1100 * lift], [0.08, 1500 * lift], [0.3, 1650 * lift], [0.46, 1300 * lift]], [[0, 0], [0.02, 1], [0.36, 0.8], [0.48, 0]], 0.06, [[0, 3000]], t)
        this.wobble(voice.map((o) => o.frequency), 9, [[0, 10], [0.46, 60]], t, 0.48)
        this.ring(fx, GLASS, k(91), t + 0.14, 0.5, 0.05)
        this.ring(fx, GLASS, k(96), t + 0.24, 0.6, 0.05)
        return
      }
      case 'hit': {
        // A paddle bops the slime: a soft foam whump, a boink that wobbles, and two birdies tweeting round its head.
        this.osc(fx, 'sine', [[0, 320], [0.11, 130]], strike(0.002, 0.15), 0.16, t)
        this.hiss(fx, 'lowpass', [[0, 1200]], 0, strike(0.002, 0.08), 0.07, t)
        const o = this.osc(fx, 'sine', [[0, 300], [0.03, 640], [0.48, 430]], [[0, 0], [0.01, 1], [0.1, 0.7], [0.5, 0]], 0.13, t + 0.02)
        this.wobble([o.frequency], 16, [[0, 80], [0.48, 8]], t + 0.02, 0.5)
        for (const dt of [0.4, 0.6]) this.osc(fx, 'sine', [[0, 2300], [0.05, 3000], [0.1, 2500]], strike(0.005, 0.11), 0.03, t + dt)
        return
      }
      case 'drop':
        // Balls knocked off: three little bloops falling away, after the hit's whump.
        ;[0, 0.09, 0.19].forEach((dt, i) => {
          const f = [1300, 1100, 950][i] * (0.95 + 0.1 * this.rand())
          this.osc(fx, 'sine', [[0, f], [0.07, f * 0.55]], strike(0.003, 0.09), 0.1, t + 0.1 + dt)
        })
        return
      case 'bump':
        // A soft thing bumps the slime back: a muffled boff.
        this.osc(fx, 'sine', [[0, 520], [0.1, 230]], strike(0.002, 0.13), 0.2, t)
        this.osc(fx, 'triangle', [[0, 1000], [0.06, 600]], strike(0.002, 0.06), 0.06, t)
        this.hiss(fx, 'bandpass', [[0, 1100]], 1, strike(0.002, 0.06), 0.09, t)
        return
      case 'climb':
        // Stuck to the frame: four sticky steps climbing up.
        ;[660, 780, 880, 1040].forEach((p, i) => {
          this.hiss(fx, 'bandpass', [[0, 2400], [0.06, 1200]], 3, strike(0.004, 0.07), 0.1, t + i * 0.22)
          this.osc(fx, 'sine', [[0, p], [0.05, p * 1.25]], strike(0.003, 0.07), 0.12, t + i * 0.22)
        })
        return
      case 'over':
        // Over the top: a little whistle up, then a plop down the far side.
        this.osc(fx, 'sine', [[0, 700], [0.12, 1300]], strike(0.005, 0.14), 0.1, t)
        this.bloop(fx, 1000, 600, t + 0.16, 0.1, 0.1)
        return
      case 'windUp':
        // A fan speeds up: the motor winds up and the air begins to roar, softly.
        this.osc(this.filter('lowpass', 1600, 0, fx), 'sawtooth', [[0, 110], [0.9, 330]], [[0, 0], [0.15, 0.6], [0.85, 1], [1, 0]], 0.08, t)
        this.hiss(fx, 'bandpass', [[0, 600], [0.9, 2400]], 1, [[0, 0], [0.8, 1], [1, 0]], 0.12, t)
        return
      case 'spun': {
        // Hard wind spins the slime round: a whirling wheee-oo.
        const o = this.osc(fx, 'sine', [[0, 500], [0.25, 900], [0.6, 450]], [[0, 0], [0.03, 1], [0.5, 0.7], [0.62, 0]], 0.07, t)
        this.wobble([o.frequency], 6, [[0, 120]], t, 0.62)
        const band = this.hiss(fx, 'bandpass', [[0, 600], [0.3, 1500], [0.6, 500]], 2, [[0, 0], [0.05, 1], [0.6, 0]], 0.04, t)
        this.wobble([band.frequency], 6, [[0, 300]], t, 0.6)
        return
      }
      case 'sneeze': {
        // Ah... ah... CHOO! in a small voice.
        this.sing(fx, [[0, 320], [0.25, 420]], [[0, 0], [0.08, 1], [0.22, 0.8], [0.28, 0]], 0.08, [[0, 1100]], t)
        this.sing(fx, [[0, 360], [0.25, 500]], [[0, 0], [0.08, 1], [0.22, 0.8], [0.28, 0]], 0.1, [[0, 1300]], t + 0.32)
        this.hiss(fx, 'bandpass', [[0, 3500]], 0.8, [[0, 0], [0.005, 1], [0.05, 0.6], [0.22, 0]], 0.14, t + 0.66)
        this.sing(fx, [[0, 650], [0.18, 260]], strike(0.005, 0.2), 0.1, [[0, 900]], t + 0.66)
        return
      }
      case 'pad': {
        // A marshmallow throws the slime up: a fluffy fwump, then a soft boing rising high.
        this.osc(fx, 'sine', [[0, 260], [0.08, 150]], strike(0.004, 0.1), 0.1, t)
        this.hiss(fx, 'lowpass', [[0, 700]], 0, strike(0.004, 0.08), 0.05, t)
        const a = this.osc(fx, 'sine', [[0, 260], [0.4, 1000]], [[0, 0], [0.03, 1], [0.3, 0.6], [0.45, 0]], 0.12, t + 0.04)
        const b = this.osc(this.filter('lowpass', 2200, 0, fx), 'triangle', [[0, 520], [0.4, 2000]], [[0, 0], [0.03, 1], [0.3, 0.5], [0.45, 0]], 0.03, t + 0.04)
        this.wobble([a.frequency], 10, [[0, 40], [0.4, 10]], t + 0.04, 0.45)
        this.wobble([b.frequency], 10, [[0, 80], [0.4, 20]], t + 0.04, 0.45)
        return
      }
      case 'whee': {
        // The slime's own wheee!, a little different each time.
        const lift = 0.92 + 0.16 * this.rand()
        const voice = this.sing(fx, [[0, 520 * lift], [0.15, 880 * lift], [0.45, 980 * lift], [0.65, 760 * lift]], [[0, 0], [0.04, 1], [0.5, 0.8], [0.68, 0]], 0.09, [[0, 2000]], t)
        this.wobble(voice.map((o) => o.frequency), 7, [[0, 18]], t, 0.68)
        return
      }
      case 'splash':
        // Into the water: a ploonk, a big splash of spray, bubbles coming up and drops falling back.
        this.osc(fx, 'sine', [[0, 420], [0.16, 120]], strike(0.003, 0.2), 0.16, t)
        this.hiss(fx, 'lowpass', [[0, 4000], [0.45, 500]], 0, [[0, 0], [0.008, 1], [0.1, 0.5], [0.5, 0]], 0.2, t)
        ;[700, 1000, 850].forEach((f, i) => this.bloop(fx, f * 0.6, f, t + 0.18 + i * 0.1, 0.06, 0.07))
        for (let i = 0; i < 4; i++) {
          const f = 1600 + 1000 * this.rand()
          this.osc(fx, 'sine', [[0, f], [0.03, f * 1.3]], strike(0.002, 0.05), 0.04, t + 0.3 + i * 0.08 + 0.04 * this.rand())
        }
        return
      case 'ptui': {
        // The friendly fish spits the slime out: pt-OO, and it whistles away through the air.
        this.hiss(fx, 'bandpass', [[0, 2000]], 1.5, strike(0.001, 0.025), 0.1, t)
        this.osc(fx, 'sine', [[0, 900], [0.02, 500]], strike(0.001, 0.03), 0.07, t)
        const flight = this.osc(fx, 'sine', [[0, 400], [0.6, 1300]], [[0, 0], [0.05, 1], [0.55, 0.6], [0.65, 0]], 0.07, t + 0.05)
        this.wobble([flight.frequency], 5, [[0, 20]], t + 0.05, 0.65)
        return
      }
      case 'back':
        // Safe back on the track: a soft landing and a happy ta-da.
        this.osc(fx, 'sine', [[0, 260], [0.06, 120]], strike(0.002, 0.08), 0.09, t)
        this.ring(fx, GLASS, k(79), t + 0.08, 0.5, 0.08)
        this.ring(fx, GLASS, k(84), t + 0.18, 0.7, 0.08)
        return
      case 'flag': {
        // A flag cheers as the slime runs past: ding-ding-DING and a flutter.
        ;[79, 84, 88].forEach((m, i) => {
          this.osc(fx, 'triangle', [[0, k(m)]], strike(0.003, i === 2 ? 0.5 : 0.18), 0.08, t + i * 0.08)
          this.ring(fx, GLASS, k(m + 12), t + i * 0.08, 0.35, 0.03)
        })
        const cloth = this.hiss(fx, 'bandpass', [[0, 1500]], 2, [[0, 0], [0.1, 1], [0.4, 0]], 0.025, t)
        this.wobble([cloth.frequency], 18, [[0, 400]], t, 0.4)
        return
      }
      case 'easy':
        // Something got easier: soft bells drifting down onto a warm chord.
        ;[96, 93, 91, 88, 84].forEach((m, i) => this.ring(fx, GLASS, k(m), t + i * 0.06, 0.5, 0.05))
        for (const m of [72, 76, 79]) this.osc(fx, 'triangle', [[0, k(m)]], held(0.15, 0.45, 0.3), 0.035, t + 0.2)
        return
      case 'key':
        // The key: a key ring jingling, then a bright ta-da.
        ;[2100, 2500, 2300, 2700, 2450].forEach((f, i) => this.ring(fx, KEYS, f, t + i * 0.04, 0.22, 0.025))
        this.ring(fx, GLASS, k(84), t + 0.22, 0.9, 0.1)
        this.ring(fx, GLASS, k(91), t + 0.34, 1.1, 0.1)
        this.osc(fx, 'triangle', [[0, k(72)]], held(0.01, 0.3, 0.3), 0.05, t + 0.34)
        return
      case 'mouse':
        // The mouse on the pole: squeak squeak!
        for (const dt of [0, 0.14]) {
          const o = this.osc(fx, 'sine', [[0, 2000], [0.04, 3000], [0.09, 2600]], strike(0.004, 0.1), 0.12, t + dt)
          this.wobble([o.frequency], 25, [[0, 100]], t + dt, 0.1)
        }
        return
      case 'meow': {
        // The cat: mee-ow, the mouth opening and closing.
        const voice = this.sing(fx, [[0, 480], [0.14, 760], [0.5, 430]], [[0, 0], [0.05, 1], [0.35, 0.8], [0.52, 0]], 0.11, [[0, 900], [0.15, 2000], [0.5, 900]], t)
        this.wobble(voice.map((o) => o.frequency), 6, [[0, 12]], t, 0.52)
        return
      }
      case 'woof':
        // The dog: a friendly wuf wuf.
        for (const dt of [0, 0.22]) {
          this.osc(this.filter('bandpass', 900, 1.2, fx), 'sawtooth', [[0, 380], [0.03, 450], [0.13, 240]], [[0, 0], [0.01, 1], [0.08, 0.5], [0.15, 0]], 0.2, t + dt)
          this.osc(fx, 'sine', [[0, 190], [0.03, 225], [0.13, 120]], [[0, 0], [0.01, 1], [0.08, 0.5], [0.15, 0]], 0.06, t + dt)
          this.hiss(fx, 'bandpass', [[0, 1000]], 1, strike(0.003, 0.06), 0.05, t + dt)
        }
        return
      case 'neigh': {
        // The pony: a whinny trilling down.
        const voice = this.sing(fx, [[0, 700], [0.1, 950], [0.9, 500]], [[0, 0], [0.03, 1], [0.6, 0.7], [0.95, 0]], 0.08, [[0, 1600]], t)
        this.wobble(voice.map((o) => o.frequency), 13, [[0, 20], [0.9, 120]], t, 0.95)
        return
      }
      case 'trumpet': {
        // The elephant: a soft brassy pa-ROOO.
        const trunk = this.filter('lowpass', 900, 3, fx)
        glide(trunk.frequency, [[0, 900], [0.15, 2400], [0.85, 1200]], t, 1)
        const level: Path = [[0, 0], [0.04, 1], [0.65, 0.8], [0.88, 0]]
        const a = this.osc(trunk, 'sawtooth', [[0, 260], [0.12, 520], [0.7, 480], [0.85, 380]], level, 0.08, t)
        const b = this.osc(trunk, 'sawtooth', [[0, 261.5], [0.12, 523], [0.7, 483], [0.85, 382]], level, 0.05, t)
        this.wobble([a.frequency, b.frequency], 6, [[0, 8]], t, 0.88)
        this.wobble([a.frequency, b.frequency], 28, [[0, 6]], t, 0.88)
        return
      }
      case 'trampoline': {
        // The trampoline launches the slime: a thump, springs boinging up, and a rush of air.
        this.osc(fx, 'sine', [[0, 110], [0.12, 60]], strike(0.003, 0.15), 0.15, t)
        const springs = [1, 1.5, 2.02].map((r, i) => this.osc(fx, 'sine', [[0, 220 * r], [0.35, 880 * r]], [[0, 0], [0.01, 1], [0.3, 0.5], [0.55, 0]], [0.12, 0.04, 0.03][i], t))
        this.wobble(springs.map((o) => o.frequency), 14, [[0, 55], [0.5, 7]], t, 0.55)
        this.hiss(fx, 'bandpass', [[0, 500], [0.5, 2500]], 1, [[0, 0], [0.1, 1], [0.55, 0]], 0.04, t)
        return
      }
      case 'pop1':
        // A circle of 1 pops: a little pop and one star.
        this.osc(fx, 'sine', [[0, 1300], [0.03, 450]], strike(0.001, 0.045), 0.1, t)
        this.hiss(fx, 'highpass', [[0, 3000]], 0, strike(0.001, 0.02), 0.04, t)
        this.ring(fx, GLASS, k(88), t + 0.03, 0.5, 0.09)
        return
      case 'pop5':
        // A circle of 5 pops: a bigger pop and five stars climbing.
        this.osc(fx, 'sine', [[0, 1000], [0.04, 320]], strike(0.001, 0.06), 0.13, t)
        this.hiss(fx, 'bandpass', [[0, 2500]], 0.7, strike(0.001, 0.04), 0.06, t)
        ;[84, 86, 88, 91, 93].forEach((m, i) => this.ring(fx, GLASS, k(m), t + 0.04 + i * 0.055, 0.45, 0.075))
        return
      case 'pop100':
        // A circle of 100 pops: the pop, then a little firework.
        this.osc(fx, 'sine', [[0, 1000], [0.04, 320]], strike(0.001, 0.06), 0.13, t)
        this.firework(t + 0.05, 1)
        return
      case 'bonk': {
        // A circle is touched: a rubbery bonk and a slide whistle falling all the way back down.
        this.osc(fx, 'sine', [[0, 650], [0.06, 480]], strike(0.002, 0.08), 0.12, t)
        this.osc(fx, 'triangle', [[0, 330], [0.08, 240]], strike(0.002, 0.1), 0.05, t)
        const whistle = this.osc(fx, 'sine', [[0, 1300], [1.07, 320]], [[0, 0], [0.05, 1], [0.82, 0.7], [1.07, 0]], 0.06, t + 0.08)
        this.wobble([whistle.frequency], 6, [[0, 18]], t + 0.08, 1.07)
        return
      }
      case 'funnel': {
        // The giant circle swirls the slime into its hole: a whirl of air, a gloop down and a gulp.
        const band = this.hiss(fx, 'bandpass', [[0, 1400]], 1.5, [[0, 0], [0.2, 1], [0.7, 0]], 0.07, t)
        this.wobble([band.frequency], 5, [[0, 500]], t, 0.7)
        const o = this.osc(fx, 'sine', [[0, 900], [0.6, 300]], [[0, 0], [0.05, 1], [0.55, 0.6], [0.7, 0]], 0.1, t)
        this.wobble([o.frequency], 9, [[0, 40]], t, 0.7)
        this.bloop(fx, 300, 650, t + 0.65, 0.08, 0.1)
        return
      }
      case 'top':
        // Out on the top: bloop, bloop, BLOOP up, and a ta-da.
        ;[72, 76, 79].forEach((m, i) => this.bloop(fx, k(m) * 0.5, k(m), t + i * 0.09, 0.12, 0.12))
        this.ring(fx, CHIME, k(84), t + 0.3, 0.8, 0.07)
        this.ring(fx, CHIME, k(88), t + 0.3, 0.8, 0.06)
        return
      case 'unlock':
        // The key turns in the lock: click, click, clunk, ting.
        for (const [dt, f] of [[0, 1800], [0.18, 1600]] as const) {
          this.hiss(fx, 'bandpass', [[0, 3500]], 4, strike(0.001, 0.02), 0.12, t + dt)
          this.osc(fx, 'sine', [[0, f], [0.03, f * 0.85]], strike(0.001, 0.03), 0.06, t + dt)
        }
        this.osc(fx, 'sine', [[0, 500], [0.06, 280]], strike(0.002, 0.09), 0.12, t + 0.3)
        this.hiss(fx, 'lowpass', [[0, 1500]], 0, strike(0.002, 0.04), 0.06, t + 0.3)
        this.ring(fx, GLASS, k(96), t + 0.38, 0.5, 0.06)
        return
      case 'open':
        // The lid pops off and confetti flies.
        this.osc(fx, 'sine', [[0, 280], [0.05, 950]], strike(0.002, 0.07), 0.2, t)
        this.hiss(fx, 'bandpass', [[0, 1800]], 1, strike(0.001, 0.04), 0.1, t)
        this.hiss(fx, 'highpass', [[0, 3000], [0.6, 6000]], 0, [[0, 0], [0.02, 1], [0.7, 0]], 0.03, t)
        for (let i = 0; i < 8; i++) this.ring(fx, GLASS, k(FIREWORK_NOTES[Math.floor(this.rand() * FIREWORK_NOTES.length)]), t + 0.05 + 0.55 * this.rand(), 0.4, 0.05)
        return
      case 'gift':
        // The gift flies out onto the slime: a harp sweeping up two octaves, a whoosh, and a ding as it lands.
        ;[72, 74, 76, 79, 81, 84, 86, 88, 91, 93].forEach((m, i) => {
          this.osc(fx, 'triangle', [[0, k(m)]], strike(0.003, 0.5), 0.06, t + i * 0.035)
          this.osc(fx, 'sine', [[0, k(m) * 2]], strike(0.003, 0.3), 0.02, t + i * 0.035)
        })
        this.hiss(fx, 'bandpass', [[0, 600], [0.6, 3000]], 1.5, [[0, 0], [0.3, 1], [0.65, 0]], 0.03, t)
        this.ring(fx, CHIME, k(96), t + 0.75, 1.2, 0.08)
        this.ring(fx, CHIME, k(100), t + 0.75, 1.2, 0.06)
        this.osc(fx, 'sine', [[0, 300], [0.08, 150]], strike(0.003, 0.1), 0.06, t + 0.75)
        return
      case 'cheer':
        // The babies cheer: three tiny voices going yaaay, and a few claps.
        ;[880, 1040, 1180].forEach((p, i) => {
          const voice = this.sing(fx, [[0, p], [0.12, p * 1.35], [0.55, p * 1.2], [0.7, p * 1.05]], [[0, 0], [0.05, 1], [0.5, 0.7], [0.72, 0]], 0.04, [[0, 2600]], t + i * 0.04)
          this.wobble(voice.map((o) => o.frequency), 8 + i, [[0, 25]], t + i * 0.04, 0.72)
        })
        for (let i = 0; i < 5; i++) {
          const at2 = t + 0.05 + i * 0.13 + 0.05 * this.rand()
          for (const dt of [0, 0.008, 0.016]) this.hiss(fx, 'bandpass', [[0, 1300]], 1, strike(0.001, 0.012), 0.04, at2 + dt)
        }
        return
      case 'fanfare': {
        // The box opens: a brassy ta-ta-ta-TAA, ta-TAAA in the key, a drum under the first and last notes, and a sparkle on top.
        const brass = this.filter('lowpass', 2400, 0, fx)
        for (const [dt, m, len] of FANFARE) {
          const f = k(m)
          const level = held(0.02, len, 0.12)
          this.osc(brass, 'sawtooth', [[0, f * 0.985], [0.03, f]], level, 0.05, t + dt)
          this.osc(brass, 'sawtooth', [[0, f * 1.003]], level, 0.035, t + dt)
          this.osc(fx, 'triangle', [[0, f / 2]], level, 0.05, t + dt)
        }
        for (const m of [72, 76, 79]) this.osc(fx, 'triangle', [[0, k(m)]], held(0.03, 0.9, 0.3), 0.035, t + 1.02)
        for (const dt of [0, 1.02]) this.osc(fx, 'sine', [[0, 110], [0.25, 78]], strike(0.003, 0.45), 0.13, t + dt)
        ;[96, 100, 103].forEach((m, i) => this.ring(fx, GLASS, k(m), t + 1.02 + i * 0.07, 0.8, 0.04))
        return
      }
      case 'teach': {
        // Time slows to show what to do: a whoop slowing down, then a gentle ding-DING.
        const o = this.osc(fx, 'sine', [[0, 880], [0.5, 440]], [[0, 0], [0.04, 1], [0.45, 0.6], [0.55, 0]], 0.06, t)
        this.wobble([o.frequency], 4, [[0, 15]], t, 0.55)
        this.ring(fx, CHIME, k(79), t + 0.12, 0.8, 0.07)
        this.ring(fx, CHIME, k(84), t + 0.36, 0.9, 0.07)
        return
      }
      case 'learned':
        // The right button: a whoop speeding back up and a bright yes in three bells.
        this.osc(fx, 'sine', [[0, 440], [0.25, 990]], strike(0.01, 0.28), 0.05, t)
        ;[84, 88, 91, 96].forEach((m, i) => this.ring(fx, GLASS, k(m), t + 0.05 + i * 0.08, 0.6, i === 3 ? 0.06 : 0.08))
        return
      case 'tap':
        // A button: a soft bip.
        this.osc(fx, 'sine', [[0, 1250], [0.035, 900]], strike(0.001, 0.045), 0.2, t)
        this.osc(fx, 'sine', [[0, 700], [0.03, 520]], strike(0.001, 0.04), 0.06, t)
        return
      case 'select':
        // Something chosen: bloo-bip, up.
        this.bloop(fx, 600, 900, t, 0.07, 0.12)
        this.bloop(fx, 900, 1350, t + 0.06, 0.08, 0.12)
        return
      case 'uhuh': {
        // Not yet: a gentle uh-uh, two soft notes down.
        const soft = this.filter('lowpass', 1800, 0, fx)
        this.osc(soft, 'triangle', [[0, 520], [0.12, 505]], [[0, 0], [0.01, 1], [0.1, 0.8], [0.13, 0]], 0.1, t)
        this.osc(soft, 'triangle', [[0, 415], [0.2, 380]], [[0, 0], [0.01, 1], [0.13, 0.8], [0.22, 0]], 0.1, t + 0.17)
        return
      }
      case 'hop': {
        // The slime hops to another island on the map: a boing up and a breath of air.
        const a = this.osc(fx, 'sine', [[0, 260], [0.18, 700]], [[0, 0], [0.01, 1], [0.2, 0.5], [0.32, 0]], 0.12, t)
        const b = this.osc(fx, 'triangle', [[0, 520], [0.18, 1400]], [[0, 0], [0.01, 1], [0.2, 0.4], [0.3, 0]], 0.025, t)
        this.wobble([a.frequency], 10, [[0, 25], [0.3, 5]], t, 0.32)
        this.wobble([b.frequency], 10, [[0, 50], [0.3, 10]], t, 0.3)
        this.hiss(fx, 'bandpass', [[0, 700], [0.3, 1800]], 1, [[0, 0], [0.08, 1], [0.32, 0]], 0.02, t)
        return
      }
      case 'wear':
        // Something to wear goes on: a swish of cloth and a sparkle.
        this.hiss(fx, 'bandpass', [[0, 1200], [0.12, 4000]], 1.2, [[0, 0], [0.03, 1], [0.14, 0]], 0.05, t)
        this.ring(fx, GLASS, k(91), t + 0.1, 0.5, 0.07)
        this.ring(fx, GLASS, k(96), t + 0.17, 0.6, 0.07)
        return
      case 'jar':
        // Stars into the jar: glassy clinks climbing to a ring.
        ;[88, 91, 93, 96].forEach((m, i) => {
          this.ring(fx, GLASS, k(m), t + [0, 0.07, 0.14, 0.24][i], i === 3 ? 0.9 : 0.3, 0.07)
          this.osc(fx, 'sine', [[0, k(m) / 2]], strike(0.002, 0.06), 0.03, t + [0, 0.07, 0.14, 0.24][i])
        })
        return
      case 'pattern':
        // A new pattern: a shimmer swelling under a chord rising up and ringing out.
        this.hiss(fx, 'highpass', [[0, 6000]], 0, [[0, 0], [0.5, 1], [1.4, 0]], 0.02, t)
        ;[72, 76, 79, 84, 88, 91].forEach((m, i) => {
          this.osc(fx, 'triangle', [[0, k(m)]], strike(0.003, 0.45), 0.06, t + i * 0.07)
          this.ring(fx, GLASS, k(m + 12), t + i * 0.07, 0.4, 0.03)
        })
        for (const m of [84, 88, 91, 96]) this.ring(fx, CHIME, k(m), t + 0.5, 1.4, 0.05)
        for (const m of [72, 76, 79]) this.osc(fx, 'triangle', [[0, k(m)]], held(0.3, 0.7, 0.4), 0.03, t + 0.45)
        return
      case 'fireworks':
        // Every pattern is open and the jar filled again: three little fireworks in a row.
        for (const dt of [0, 0.75, 1.5]) this.firework(t + dt, 0.7)
        return
      default: {
        const unheard: never = kind
        throw new Error(`no sound for ${String(unheard)}`)
      }
    }
  }

  // -------------------------------------------------------------------------------------
  // The tunes.

  /** A deck for `tune` whose first step (counted from the tune's start) is `from`, playing at `at` and fading in. */
  deck(tune: TuneId, at: number, from: number): Deck {
    const score = SCORES[tune]
    const out = this.gain(0, this.music)
    out.gain.setValueAtTime(0, at)
    out.gain.linearRampToValueAtTime(score.level, at + FADE_IN)
    out.connect(this.gain(score.room, this.room))
    const tone: Record<Lead, number> = { bubble: 2600, pan: 3600, box: 6000, glock: 6000, flute: 2800, marimba: 3200 }
    return {
      tune,
      score,
      out,
      lead: this.filter('lowpass', tone[score.lead], 0, out),
      bass: this.filter('lowpass', 1100, 0, out),
      comp: this.filter('lowpass', score.comp === 'pad' ? 1400 : 3000, 0, out),
      step: from,
      next: at,
    }
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
    const { score } = deck
    const eighth = 60 / score.bpm / score.beat
    const total = score.bars.length * score.slots
    const index = deck.step % total
    const second = Math.floor(deck.step / total) % 2 === 1
    const barIndex = Math.floor(index / score.slots)
    const bar = score.bars[barIndex]
    const slot = index % score.slots
    const at = deck.next + (slot % 2 === 1 ? score.swing * eighth : 0)
    const chord = CHORDS[bar.chord]
    const note = bar.notes[slot]
    if (note > 0) {
      const dur = bar.lengths[slot] * eighth
      this.lead(deck, note + score.octave + score.key, dur, eighth, at, LEAD[score.lead])
      if (second) this.extraNote(deck, note, bar.chord, dur, eighth, at)
    }
    if (second) this.extraChord(deck, chord, slot, eighth, at)
    const shift = score.bass.line[slot]
    if (shift !== null) this.bassNote(deck, 36 + mod(chord.root + score.key, 12) + shift, score.bass.len * eighth, at)
    this.comp(deck, chord, slot, eighth, at)
    this.drums(deck, slot, barIndex, at)
    deck.step += 1
    deck.next += eighth
  }

  /** A melody note on the deck's lead, `dur` long. */
  private lead(deck: Deck, m: number, dur: number, eighth: number, at: number, vol: number) {
    const f = hz(m)
    const out = deck.lead
    switch (deck.score.lead) {
      case 'bubble':
        // A jelly: a triangle scooping up into the note with a sine an octave up for the shine, bouncy even when held.
        this.osc(out, 'triangle', [[0, f * 0.94], [0.03, f]], [[0, 0], [0.008, 1], [0.12, 0.55], [Math.max(dur * 0.9, 0.13), 0.35], [Math.max(dur * 0.9, 0.13) + 0.08, 0]], vol, at)
        this.osc(out, 'sine', [[0, f * 1.88], [0.03, f * 2]], strike(0.006, 0.14), vol * 0.3, at)
        return
      case 'pan': {
        // A steel pan: a long note is rolled, struck again every 32nd and softer, as the players do.
        const gap = eighth / 4
        const strikes = dur > eighth * 2.5 ? Math.round(dur / gap) : 1
        for (let i = 0; i < strikes; i++) this.pan(out, f, at + i * gap, i === 0 ? vol : vol * (0.42 + 0.1 * Math.sin(i * 1.7)), strikes > 1 && i < strikes - 1 ? 0.22 : 0.7)
        return
      }
      case 'box':
        // A music box's tine, ringing long.
        this.ring(out, TINE, f, at, Math.max(1.5, dur), vol)
        return
      case 'glock':
        this.ring(out, GLOCK, f, at, Math.max(1.1, dur), vol)
        return
      case 'flute':
        this.flute(out, f, dur, vol, at)
        return
      case 'marimba':
        // A marimba bar: warm, with a knock four times up that dies at once.
        this.osc(out, 'sine', [[0, f]], strike(0.002, Math.min(0.4 + dur, 1)), vol, at)
        this.osc(out, 'sine', [[0, f * 3.95]], strike(0.001, 0.06), vol * 0.22, at)
        this.osc(out, 'sine', [[0, f * 2]], strike(0.002, 0.2), vol * 0.08, at)
        return
      default: {
        const unknown: never = deck.score.lead
        throw new Error(`no lead ${String(unknown)}`)
      }
    }
  }

  /** One strike of a steel pan: the note, its octave blooming a moment later, and its twelfth, the pitch settling as it rings. */
  private pan(out: AudioNode, f: number, at: number, vol: number, dur: number) {
    this.osc(out, 'sine', [[0, f * 1.012], [0.04, f]], strike(0.003, dur), vol, at)
    this.osc(out, 'sine', [[0, f * 2.024], [0.04, f * 2]], strike(0.012, dur * 0.8), vol * 0.45, at)
    this.osc(out, 'sine', [[0, f * 3]], strike(0.002, dur * 0.3), vol * 0.16, at)
  }

  /** A soft flute: a sine with a little body, a breath at the start and a vibrato that comes in late. */
  private flute(out: AudioNode, f: number, dur: number, vol: number, at: number) {
    const end = Math.max(dur, 0.2)
    const level: Path = [[0, 0], [0.07, 1], [end * 0.85, 0.8], [end + 0.25, 0]]
    const a = this.osc(out, 'sine', [[0, f]], level, vol, at)
    const b = this.osc(out, 'triangle', [[0, f]], level, vol * 0.25, at)
    this.wobble([a.frequency, b.frequency], 5, [[0, 0], [0.25, 0], [0.5, f * 0.007]], at, end + 0.25)
    this.hiss(out, 'bandpass', [[0, f * 2]], 2, strike(0.02, 0.1), vol * 0.3, at)
  }

  /** What joins the melody every second time round. */
  private extraNote(deck: Deck, note: number, chord: Chord, dur: number, eighth: number, at: number) {
    const { score } = deck
    const v = EXTRA[score.extra]
    switch (score.extra) {
      case 'harmony':
        this.lead(deck, harmonyUnder(note, chord) + score.octave + score.key, dur, eighth, at, LEAD[score.lead] * v)
        return
      case 'flute':
        this.flute(deck.lead, hz(harmonyUnder(note, chord) + score.octave + score.key), dur, v, at)
        return
      case 'echo':
        this.ring(deck.lead, GLOCK, hz(note + score.octave + score.key), at + eighth, 0.8, v)
        return
      case 'sparkle':
      case 'choir':
        // These follow the chords, not the tune.
        return
      default: {
        const unknown: never = score.extra
        throw new Error(`no extra ${String(unknown)}`)
      }
    }
  }

  /** What joins the chords every second time round. */
  private extraChord(deck: Deck, chord: ChordShape, slot: number, eighth: number, at: number) {
    const { score } = deck
    const v = EXTRA[score.extra]
    if (score.extra === 'sparkle') this.ring(deck.comp, TINE, hz(spread(voicing(chord, score.key, 84))[SPARKLE[slot]]), at, 0.7, v)
    else if (score.extra === 'choir' && slot === 0) {
      // A soft choir humming the chord through the bar, two voices a little apart on each note.
      const bar = eighth * score.slots
      for (const m of voicing(chord, score.key, 64)) {
        const f = hz(m)
        const voices = [this.osc(deck.comp, 'sine', [[0, f * 0.998]], held(0.5, bar * 0.85, 0.5), v, at), this.osc(deck.comp, 'sine', [[0, f * 1.002]], held(0.5, bar * 0.85, 0.5), v, at)]
        this.wobble(voices.map((o) => o.frequency), 4.5, [[0, f * 0.004]], at, bar * 0.85 + 0.5)
      }
    }
  }

  /** A bass note `dur` long. */
  private bassNote(deck: Deck, m: number, dur: number, at: number) {
    const out = deck.bass
    const v = BASS[deck.score.bass.voice]
    switch (deck.score.bass.voice) {
      case 'bounce': {
        // A short tuba: a triangle, with a little square so small speakers hear it.
        const f = hz(m)
        this.osc(out, 'triangle', [[0, f]], held(0.006, dur * 0.55, 0.05), v, at)
        this.osc(out, 'square', [[0, f]], held(0.006, dur * 0.5, 0.04), v * 0.12, at)
        return
      }
      case 'round': {
        // A round plucked bass with a body an octave up.
        const f = hz(m)
        this.osc(out, 'sine', [[0, f]], strike(0.005, dur * 0.9 + 0.1), v, at)
        this.osc(out, 'triangle', [[0, f * 2]], strike(0.005, dur * 0.6), v * 0.3, at)
        return
      }
      case 'tine':
        // The music box's lowest tines, an octave up from a bass, under the pah-pah.
        this.ring(out, TINE, hz(m + 12), at, 1.8, v)
        return
      case 'pluck': {
        // A plucked string an octave up from a bass, short.
        const f = hz(m + 12)
        this.osc(out, 'triangle', [[0, f]], strike(0.003, 0.4), v, at)
        this.osc(out, 'sine', [[0, f * 2]], strike(0.003, 0.15), v * 0.25, at)
        return
      }
      case 'float': {
        // Long soft notes an octave up from a bass.
        const f = hz(m + 12)
        const level = held(0.12, dur * 0.9, 0.3)
        this.osc(out, 'triangle', [[0, f]], level, v * 0.9, at)
        this.osc(out, 'sine', [[0, f * 2]], level, v * 0.2, at)
        return
      }
      default: {
        const unknown: never = deck.score.bass.voice
        throw new Error(`no bass ${String(unknown)}`)
      }
    }
  }

  /** The chords on this slot. */
  private comp(deck: Deck, chord: ChordShape, slot: number, eighth: number, at: number) {
    const { score } = deck
    const out = deck.comp
    const v = COMP[score.comp]
    switch (score.comp) {
      case 'uke':
        // A ukulele's chop on 2 and 4: the chord strummed quickly down, short.
        if (slot !== 2 && slot !== 6) return
        voicing(chord, score.key, 64).forEach((m, i) => this.osc(out, 'triangle', [[0, hz(m)]], strike(0.002, 0.18), v, at + i * 0.012))
        this.hiss(out, 'bandpass', [[0, 2600]], 1.5, strike(0.001, 0.02), v * 0.5, at)
        return
      case 'skank':
        // Short woody chords on every off-beat.
        if (slot % 2 === 0) return
        for (const m of voicing(chord, score.key, 62)) {
          this.osc(out, 'sine', [[0, hz(m)]], strike(0.002, 0.13), v, at)
          this.osc(out, 'sine', [[0, hz(m) * 4]], strike(0.001, 0.03), v * 0.15, at)
        }
        return
      case 'pahpah':
        // The waltz's pah-pah on two and three, on the music box's middle tines.
        if (slot !== 2 && slot !== 4) return
        for (const m of voicing(chord, score.key, 67)) this.ring(out, TINE, hz(m), at, 0.9, v)
        return
      case 'arp':
        // A celesta breaking the chord in eighths.
        this.ring(out, CELESTA, hz(spread(voicing(chord, score.key, 60))[ARP[slot]]), at, 0.6, v)
        return
      case 'harp': {
        // A harp rocking through the chord.
        const f = hz(spread(voicing(chord, score.key, 55))[HARP[slot]])
        this.osc(out, 'triangle', [[0, f]], strike(0.003, 1.3), v, at)
        this.osc(out, 'sine', [[0, f * 2]], strike(0.003, 0.5), v * 0.2, at)
        return
      }
      case 'pad':
        // A warm pad holding the chord through the bar.
        if (slot !== 0) return
        for (const m of voicing(chord, score.key, 57)) this.osc(out, 'triangle', [[0, hz(m)]], held(0.25, eighth * score.slots * 0.85, 0.35), v, at)
        return
      default: {
        const unknown: never = score.comp
        throw new Error(`no chords ${String(unknown)}`)
      }
    }
  }

  /** The drums on this slot. */
  private drums(deck: Deck, slot: number, barIndex: number, at: number) {
    const out = deck.out
    /** A soft kick: a falling sine with a little knock on top for small speakers. */
    const kick = (vol: number) => {
      this.osc(out, 'sine', [[0, 140], [0.1, 48]], strike(0.002, 0.14), vol, at)
      this.osc(out, 'triangle', [[0, 280], [0.03, 120]], strike(0.001, 0.03), vol * 0.25, at)
    }
    /** A shaker: a soft hiss up high. */
    const shaker = (vol: number) => this.hiss(out, 'highpass', [[0, 6500]], 0, [[0, 0], [0.012, 1], [0.05, 0]], vol, at)
    switch (deck.score.kit) {
      case 'bouncy':
        if (slot === 0 || slot === 4) kick(KIT.kick)
        if (slot === 2 || slot === 6) {
          this.hiss(out, 'bandpass', [[0, 1800]], 1.2, strike(0.001, 0.05), KIT.tick * 1.3, at)
          this.osc(out, 'sine', [[0, 1000]], strike(0.001, 0.02), KIT.tick * 0.5, at)
        }
        if (slot % 2 === 1) shaker(KIT.tick * 0.6)
        return
      case 'calypso':
        if (slot === 0 || slot === 4) kick(KIT.kick * 0.8)
        if (slot === 3 || slot === 6 || slot === 7) {
          // A conga, the last one higher.
          const f = slot === 7 ? 300 : 230
          this.osc(out, 'sine', [[0, f * 1.15], [0.08, f]], strike(0.002, 0.13), KIT.tick * 2, at)
          this.hiss(out, 'bandpass', [[0, 900]], 1, strike(0.001, 0.02), KIT.tick * 0.6, at)
        }
        shaker(KIT.tick * (slot % 2 === 1 ? 0.8 : 0.45))
        return
      case 'clock':
        if (slot % 2 === 0) this.osc(out, 'sine', [[0, slot === 0 ? 3200 : 2600]], strike(0.001, 0.012), KIT.tick * 0.5, at)
        return
      case 'sleigh':
        if (slot === 0) kick(KIT.kick * 0.7)
        // Sleigh bells: a jingle of high metal and a sparkle of noise, the beats louder.
        this.hiss(out, 'bandpass', [[0, 7500]], 2, [[0, 0], [0.003, 1], [0.09, 0]], KIT.tick * (slot % 2 === 0 ? 1 : 0.6), at)
        for (let i = 0; i < 2; i++) this.osc(out, 'sine', [[0, 4200 + 1800 * this.rand()]], strike(0.001, 0.06), KIT.tick * 0.15, at + 0.006 * i)
        return
      case 'brush':
        if (slot === 0) kick(KIT.kick * 0.7)
        if (slot === 2 || slot === 6) this.hiss(out, 'bandpass', [[0, 2200], [0.12, 1600]], 0.6, [[0, 0], [0.02, 1], [0.16, 0]], KIT.tick, at)
        return
      case 'stars':
        if (slot === 3 && barIndex % 2 === 1) this.ring(out, GLASS, hz(TWINKLES[(barIndex >> 1) % TWINKLES.length] + deck.score.key), at, 0.9, KIT.twinkle)
        return
      default: {
        const unknown: never = deck.score.kit
        throw new Error(`no kit ${String(unknown)}`)
      }
    }
  }

  // -------------------------------------------------------------------------------------
  // The loops.

  /** Starts the fans' wind at `at`, silent until setWind gives it a level. */
  wind(at: number): Wind {
    const ctx = this.ctx
    const whoosh = this.gain(0, this.effects)
    const band = this.filter('bandpass', 400, 0.9, whoosh)
    const air = ctx.createBufferSource()
    air.buffer = this.white
    air.loop = true
    air.connect(band)
    air.start(at)
    // The blades chop the air: a slow sine swinging the whoosh's level up and down around itself.
    const blades = ctx.createOscillator()
    blades.frequency.value = 5
    const chop = ctx.createGain()
    chop.gain.value = 0
    blades.connect(chop)
    chop.connect(whoosh.gain)
    blades.start(at)
    const hum = this.gain(0, this.effects)
    const humTone = this.filter('lowpass', 320, 0, hum)
    const motor = (['triangle', 'sawtooth'] as const).map((type, i) => {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = 48 * (1 + 0.01 * i)
      o.connect(humTone)
      o.start(at)
      return o
    })
    return { band, whoosh, chop, blades, hum, motor, level: 0 }
  }

  /** The wind at `level` (0 to 1) from `at`, gliding there: louder, brighter, a faster chop and a higher hum. */
  setWind(wind: Wind, level: number, at: number) {
    const tau = 0.12
    const loud = WIND * level ** 1.3
    wind.level = level
    wind.whoosh.gain.setTargetAtTime(loud, at, tau)
    wind.chop.gain.setTargetAtTime(loud * 0.35, at, tau)
    wind.band.frequency.setTargetAtTime(380 + 1000 * level, at, tau)
    wind.blades.frequency.setTargetAtTime(5 + 10 * level, at, tau)
    wind.hum.gain.setTargetAtTime(HUM * level, at, tau)
    wind.motor.forEach((o, i) => o.frequency.setTargetAtTime((48 + 50 * level) * (1 + 0.01 * i), at, tau))
  }

  /** The whoosh of rising up the tower from `at`: air rushing past, brighter the higher it goes, with a soft shimmer rising inside it. */
  startRise(at: number): Rise {
    const ctx = this.ctx
    const fader = this.gain(0, this.effects)
    fader.gain.setValueAtTime(0, at)
    fader.gain.linearRampToValueAtTime(RISE, at + 0.4)
    const band = this.filter('bandpass', 300, 1.3, fader)
    band.frequency.setValueAtTime(300, at)
    band.frequency.setTargetAtTime(1600, at, 3.5)
    const air = ctx.createBufferSource()
    air.buffer = this.white
    air.loop = true
    air.connect(band)
    air.start(at, this.rand() * 1.5)
    const shimmer = this.gain(0.08, fader)
    const tones = [600, 900].map((f) => {
      const o = ctx.createOscillator()
      o.frequency.setValueAtTime(f, at)
      o.frequency.setTargetAtTime(f * 2.1, at, 4)
      o.connect(shimmer)
      o.start(at)
      return o
    })
    const sway = ctx.createOscillator()
    sway.frequency.value = 2.5
    const depth = ctx.createGain()
    depth.gain.value = 0.04
    sway.connect(depth)
    depth.connect(shimmer.gain)
    sway.start(at)
    return { fader, sources: [air, ...tones, sway] }
  }

  /** Ends the rise's whoosh quickly from `at`. */
  stopRise(rise: Rise, at: number) {
    const g = rise.fader.gain
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(0, at + 0.25)
    for (const s of rise.sources) s.stop(at + 0.3)
  }

  // -------------------------------------------------------------------------------------
  // The parts every voice is made of.

  /** A little firework: a whistle up, a soft boom and a shower of twinkles in the key. Size 1 is a 100's; the fireworks' row is smaller. */
  private firework(at: number, size: number) {
    const fx = this.effects
    const up = 0.32 + 0.08 * size
    this.osc(fx, 'sine', [[0, 700], [up, 1800 + 600 * size]], [[0, 0], [0.05, 1], [up - 0.02, 0.6], [up, 0]], 0.035, at)
    const boom = at + up
    this.osc(fx, 'sine', [[0, 150], [0.3, 48]], strike(0.004, 0.36), 0.15 * size, boom)
    this.hiss(fx, 'lowpass', [[0, 2400], [0.4, 280]], 0, [[0, 0], [0.006, 1], [0.42, 0]], 0.11 * size, boom)
    const shower = 0.6 + 0.6 * size
    const count = Math.round(10 + 14 * size)
    for (let i = 0; i < count; i++) {
      const dt = 0.05 + shower * this.rand()
      const m = FIREWORK_NOTES[Math.floor(this.rand() * FIREWORK_NOTES.length)]
      this.ring(fx, GLASS, hz(m + this.key), boom + dt, 0.45, 0.012 + 0.04 * (1 - dt / (shower + 0.1)))
    }
    this.hiss(fx, 'highpass', [[0, 7000]], 0, [[0, 0], [0.15, 1], [0.15 + shower, 0]], 0.015, boom)
  }

  /** The jelly bloop at the heart of the slime's sounds: a sine scooping from f0 to f1, with a softer triangle an octave under it. */
  private bloop(out: AudioNode, f0: number, f1: number, at: number, dur: number, vol: number) {
    const rise = dur * 0.45
    this.osc(out, 'sine', [[0, f0], [rise, f1]], strike(0.004, dur), vol, at)
    this.osc(out, 'triangle', [[0, f0 / 2], [rise, f1 / 2]], strike(0.004, dur * 0.8), vol * 0.3, at)
  }

  /** A little cartoon voice: a buzzy saw through a mouth (a band whose middle follows `mouth`) and a pure sine under it, both along `pitch`. Returns both, to wobble them. */
  private sing(out: AudioNode, pitch: Path, level: Path, vol: number, mouth: Path, at: number): OscillatorNode[] {
    const band = this.ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 1.4
    glide(band.frequency, mouth, at, 1)
    band.connect(out)
    return [this.osc(band, 'sawtooth', pitch, level, vol, at), this.osc(out, 'sine', pitch, level, vol * 0.5, at)]
  }

  /** A struck bar, tine or bell: a sine per partial, the higher ones dying sooner; a partial too high to hear is left out. */
  private ring(out: AudioNode, partials: Partials, f: number, at: number, dur: number, vol: number) {
    partials.forEach(([ratio, level], i) => {
      if (f * ratio < TOP_HZ) this.osc(out, 'sine', [[0, f * ratio]], strike(0.002, dur / (1 + i * 0.8)), vol * level, at)
    })
  }

  /** One oscillator: its pitch along `pitch` (Hz), its level along `level` times `vol`, into `out` from `at` until the level ends. */
  private osc(out: AudioNode, wave: OscillatorType, pitch: Path, level: Path, vol: number, at: number): OscillatorNode {
    const o = this.ctx.createOscillator()
    o.type = wave
    glide(o.frequency, pitch, at, 1)
    const env = this.ctx.createGain()
    glide(env.gain, level, at, vol)
    o.connect(env)
    env.connect(out)
    o.start(at)
    o.stop(at + level[level.length - 1][0] + 0.02)
    return o
  }

  /** A stretch of the white noise through one filter whose cutoff follows `freq`, its level along `level` times `vol`. Returns the filter, to wobble it. */
  private hiss(out: AudioNode, type: BiquadFilterType, freq: Path, q: number, level: Path, vol: number, at: number): BiquadFilterNode {
    const src = this.ctx.createBufferSource()
    src.buffer = this.white
    src.loop = true
    const filter = this.ctx.createBiquadFilter()
    filter.type = type
    filter.Q.value = q
    glide(filter.frequency, freq, at, 1)
    const env = this.ctx.createGain()
    glide(env.gain, level, at, vol)
    src.connect(filter)
    filter.connect(env)
    env.connect(out)
    src.start(at, this.rand() * 1.5)
    src.stop(at + level[level.length - 1][0] + 0.02)
    return filter
  }

  /** Wobbles these params `rate` times a second by a depth along `depth`, from `at` for `dur`. */
  private wobble(params: readonly AudioParam[], rate: number, depth: Path, at: number, dur: number) {
    const lfo = this.ctx.createOscillator()
    lfo.frequency.value = rate
    const amount = this.ctx.createGain()
    glide(amount.gain, depth, at, 1)
    lfo.connect(amount)
    for (const p of params) amount.connect(p)
    lfo.start(at)
    lfo.stop(at + dur)
  }

  /** Dips the music under a big jingle from `at` for `hold` seconds (overlapping dips join up), then brings it back. */
  private duck(at: number, hold: number) {
    const g = this.music.gain
    const until = Math.max(this.duckedUntil, at + hold)
    this.duckedUntil = until
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(MUSIC * DUCK, at + 0.08)
    g.setValueAtTime(MUSIC * DUCK, until)
    g.linearRampToValueAtTime(MUSIC, until + 0.7)
  }

  /** A fixed filter into `out`. */
  private filter(type: BiquadFilterType, freq: number, q: number, out: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    f.connect(out)
    return f
  }

  /** A fixed gain into `out`. */
  private gain(value: number, out: AudioNode): GainNode {
    const g = this.ctx.createGain()
    g.gain.value = value
    g.connect(out)
    return g
  }

  /** The room's echo: noise dying away and darkening as it goes, in two channels a little apart, so it sounds like a soft room and never rings. */
  private impulse(): AudioBuffer {
    const rate = this.ctx.sampleRate
    const length = Math.ceil(rate * ROOM_SECONDS)
    const buffer = this.ctx.createBuffer(2, length, rate)
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c)
      let smooth = 0
      for (let i = 0; i < length; i++) {
        const s = i / rate
        smooth += (this.rand() * 2 - 1 - smooth) * (0.7 - (0.55 * s) / ROOM_SECONDS)
        data[i] = smooth * Math.exp(-s / 0.45) * Math.min(1, s / 0.012)
      }
    }
    return buffer
  }
}

// ---------------------------------------------------------------------------------------
// The game's sounds.

/**
 * Every sound is synthesised, nothing to load. Browsers make no sound before the page is
 * touched, so nothing here makes an AudioContext until the first `unlock` (called on
 * every press); until then `play` does nothing and `setMuted` and `setLoops` only
 * remember what they were asked, so the right tune starts with the first touch.
 *
 * The tune's clock wakes every CLOCK_MS and schedules every step due within LOOKAHEAD; a
 * clock that slept (a busy page) skips ahead instead of catching up in a burst. A tune
 * that stops (a pause, another tune) remembers its place, and when it comes back it
 * carries on from the start of the phrase it was in.
 */
export class Sounds {
  muted = false
  private ctx: AudioContext | null = null
  private synth: Synth | null = null
  /** What setLoops asked for last: the tune, the wind's level, and whether the slime is rising up the tower. */
  private tune: TuneId | null = null
  private windLevel = 0
  private rising = false
  private deck: Deck | null = null
  private timer: ReturnType<typeof setTimeout> | undefined = undefined
  /** Where each tune stopped, as the step to carry on from. */
  private resumeAt: Partial<Record<TuneId, number>> = {}
  private wind: Wind | null = null
  private rise: Rise | null = null
  /** Context time each kind last sounded. */
  private last = new Map<SoundKind, number>()

  /** Browsers refuse sound before the first touch: this runs on every press, and until the first one everything is a no-op. Makes the context on the first press and wakes it whenever it is not running (iOS also has 'interrupted'). */
  unlock() {
    if (this.ctx === null) {
      const ctx = new AudioContext()
      const synth = new Synth(ctx)
      synth.master.gain.value = this.muted ? 0 : MASTER
      this.ctx = ctx
      this.synth = synth
      this.playTune(synth)
      this.keepWind(synth)
      this.keepRise(synth)
    }
    if (this.ctx.state !== 'running') void this.ctx.resume()
  }

  /** Mute is the master gain at nothing; everything else keeps going underneath. */
  setMuted(muted: boolean) {
    this.muted = muted
    const synth = this.synth
    if (synth === null) return
    synth.master.gain.setTargetAtTime(muted ? 0 : MASTER, synth.ctx.currentTime, 0.02)
  }

  /** One sound, now; the same kind again within DEDUP is dropped. */
  play(kind: SoundKind) {
    const synth = this.synth
    if (synth === null) return
    const now = synth.ctx.currentTime
    const last = this.last.get(kind)
    if (last !== undefined && now - last < DEDUP) return
    this.last.set(kind, now)
    synth.effect(kind, now + START)
  }

  /** Called every frame with what should be sounding: a tune starts or changes only when it changes, the wind glides to its level, the rise starts and stops with its flag. */
  setLoops(loops: Loops) {
    if (!Number.isFinite(loops.wind)) throw new Error(`the wind is ${loops.wind}: it is a number from 0 to 1`)
    const changed = loops.tune !== this.tune
    this.tune = loops.tune
    this.windLevel = clamp01(loops.wind)
    this.rising = loops.rise
    const synth = this.synth
    if (synth === null) return
    if (changed) this.playTune(synth)
    this.keepWind(synth)
    this.keepRise(synth)
  }

  /** Fades out the tune that plays (remembering its place) and starts the one asked for, from where it last stopped. */
  private playTune(synth: Synth) {
    const now = synth.ctx.currentTime
    if (this.deck !== null) {
      clearTimeout(this.timer)
      const phrase = this.deck.score.slots * 4
      this.resumeAt[this.deck.tune] = this.deck.step - (this.deck.step % phrase)
      synth.retire(this.deck, now, this.tune === null ? FADE_OUT : CROSSFADE)
      this.deck = null
    }
    if (this.tune === null) return
    synth.key = SCORES[this.tune].key
    const deck = synth.deck(this.tune, now + LEAD_IN, this.resumeAt[this.tune] ?? 0)
    this.deck = deck
    this.tick(synth, deck)
  }

  /** The clock: schedules every step due within LOOKAHEAD, then sleeps CLOCK_MS. */
  private tick(synth: Synth, deck: Deck) {
    const now = synth.ctx.currentTime
    // The timer slept (a background tab, a busy page): skip ahead rather than catch up in a burst.
    if (deck.next < now) deck.next = now + LEAD_IN
    while (deck.next < now + LOOKAHEAD) synth.step(deck)
    this.timer = setTimeout(() => this.tick(synth, deck), CLOCK_MS)
  }

  /** The wind follows its level; it is made the first time a fan blows and stays on after, silent when still. */
  private keepWind(synth: Synth) {
    if (this.wind === null) {
      if (this.windLevel === 0) return
      this.wind = synth.wind(synth.ctx.currentTime)
    }
    // Small changes wait until they add up; reaching still always counts, so no faint wind is left behind.
    const change = Math.abs(this.windLevel - this.wind.level)
    if (change === 0 || (change < 0.004 && this.windLevel > 0)) return
    synth.setWind(this.wind, this.windLevel, synth.ctx.currentTime)
  }

  /** The rise's whoosh starts and stops with its flag. */
  private keepRise(synth: Synth) {
    if (this.rising === (this.rise !== null)) return
    const now = synth.ctx.currentTime
    if (this.rise === null) this.rise = synth.startRise(now)
    else {
      synth.stopRise(this.rise, now)
      this.rise = null
    }
  }
}
