/**
 * Every sound of Digger Town synthesised on the spot, nothing to load: toy machines with a
 * voice each (horns and little toots), cartoon animals, the crunch, rumble and clank of a
 * cheerful building site, bells and fanfares for the jobs, a gentle tune per chapter plus the
 * title's and the party's, and loops for the engines and the machinery. Chunky and rumbly but
 * never harsh: round waves, soft filters, envelopes that start and end in silence, and a
 * gentle compressor over everything.
 *
 * Two layers. `Synth` makes the voices on any audio context (a fake or an offline one can test
 * it). `Sounds` is the game's: it makes the page's AudioContext on the first press, drops
 * repeats, runs the clock of the tune and the reversing beep, and keeps the loops going.
 *
 * Every tune is written in C and played in its own key; the melodic one-shots (coins, bells,
 * fanfares) follow the key of the tune playing, so they always sit in tune over it.
 */

import { clamp01, lerp, mod, mulberry32 } from './math'
import { MACHINE_KINDS, SPECIES, type ChapterId, type Machine, type MachineKind, type Sim, type SimEvent, type Species } from './model'

export type PlainSound =
  | 'bite' | 'dump' | 'tip' | 'landed' | 'coin' | 'hop' | 'uhuh' | 'comes' | 'pick' | 'drop' | 'place' | 'rolled' | 'stomp' | 'push'
  | 'plantStart' | 'plantThump' | 'plantDone' | 'water' | 'mixed' | 'pour' | 'set' | 'splash' | 'stepDone' | 'jobDone' | 'wish'
  | 'chapterDone' | 'moveIn' | 'party' | 'fireworks' | 'hint' | 'tap' | 'select' | 'buy' | 'clockStrike' | 'iceCreamJingle'

/** Every sound: the plain ones, each machine's horn and its tiny toot, and each animal's voice. */
export type SoundKind = PlainSound | `horn-${MachineKind}` | `toot-${MachineKind}` | `voice-${Species}`

export type TuneId = ChapterId | 'title' | 'party'

/** What keeps sounding. The numbers are 0 to 1. */
export interface Loops {
  tune: TuneId | null
  /** The machine the child drives, and how hard its engine works. */
  engine: { kind: MachineKind; rev: number } | null
  /** How many friends drive, as a share of three. */
  friendEngines: number
  /** Joints moving: rams whine. */
  hydraulic: number
  /** Stuff falling from a bucket, a bed or a chute. */
  pour: number
  /** The reversing beep. */
  beep: boolean
  /** The mixer's drum turning. */
  drum: number
  /** The roller's drum shaking. */
  shake: number
  /** A plant at work. */
  plant: number
  /** The water tower pouring. */
  water: number
  /** The dozer pushing a heap. */
  push: number
}

export const QUIET: Loops = { tune: null, engine: null, friendEngines: 0, hydraulic: 0, pour: 0, beep: false, drum: 0, shake: 0, plant: 0, water: 0, push: 0 }

// ---------------------------------------------------------------------------------------
// The mapping from what the sim tells the game to what is heard, and from the sim to the loops.

/** The sounds one sim event makes. The switch is complete: a new event kind fails to compile here. */
export function soundsFor(event: SimEvent): SoundKind[] {
  switch (event.kind) {
    case 'bite': return ['bite']
    case 'dump': return ['dump']
    case 'tip': return ['tip']
    case 'landed': return ['landed']
    case 'coin': return ['coin']
    case 'hop': return ['hop']
    case 'honk': return [`horn-${event.machine}`]
    case 'uhuh': return ['uhuh']
    case 'ack': return [`toot-${event.machine}`]
    case 'comes': return ['comes', `horn-${event.machine}`]
    case 'pick': return ['pick']
    case 'drop': return ['drop']
    case 'place': return ['place']
    case 'rolled': return ['rolled']
    case 'stomp': return ['stomp']
    case 'push': return ['push']
    case 'plantStart': return ['plantStart']
    case 'plantThump': return ['plantThump']
    case 'plantDone': return ['plantDone']
    case 'water': return ['water']
    case 'mixed': return ['mixed']
    case 'pour': return ['pour']
    case 'set': return ['set']
    case 'splash': return ['splash']
    case 'stepDone': return ['stepDone']
    case 'jobDone': return ['jobDone']
    case 'wish': return ['wish', `voice-${event.who}`]
    case 'chapterDone': return ['chapterDone']
    case 'moveIn': return ['moveIn', `voice-${event.who}`]
    // The van drives in as the road's party starts, and the clock strikes for its own.
    case 'party': return event.chapter === 'road' ? ['party', 'iceCreamJingle'] : event.chapter === 'clock' ? ['party', 'clockStrike'] : ['party']
    case 'fireworks': return ['fireworks']
    case 'hint': return ['hint']
  }
}

/** Whether a machine's hands are moving one of its joints now (not driving, not pouring). */
function jointsMove(m: Machine): boolean {
  switch (m.kind) {
    case 'digger': return m.seq !== 'rest' && m.seq !== 'hold'
    case 'dumper': return m.seq === 'up' || m.seq === 'down'
    case 'forklift': return m.seq === 'raise' || m.seq === 'lower'
    case 'tower': return m.seq !== 'rest'
    case 'mobile': return m.seq === 'over' || m.seq === 'lower' || m.seq === 'raise' || m.seq === 'legs'
    case 'semi': return m.seq === 'unload'
    case 'dozer':
    case 'roller':
    case 'mixer':
      return false
  }
}

/** What should be sounding, read from the sim: the pure half of `Sounds.setLoops`. */
export function loopsFor(s: Sim, tune: Loops['tune']): Loops {
  const active = s.machines[s.active]
  const machines = MACHINE_KINDS.map((k) => s.machines[k]).filter((m) => m.unlocked)
  const { levers } = s.hands
  const leversMove = s.mode === 'pro' && Math.max(Math.abs(levers.a), Math.abs(levers.b), Math.abs(levers.c), Math.abs(levers.d)) > 0.05
  const moving = machines.filter((m) => jointsMove(m) || (leversMove && m === active)).length
  const { mixer, roller, dozer } = s.machines
  const mixerLoaded = mixer.unlocked && (mixer.sand > 0 || mixer.water > 0 || mixer.concrete > 0)
  let pour = 0
  let water = 0
  for (const st of s.streams) {
    if (st.stuff === 'water') water += st.rate
    else pour += st.rate
  }
  return {
    tune,
    engine: active.unlocked ? { kind: active.kind, rev: clamp01(active.rev) } : null,
    friendEngines: clamp01(machines.filter((m) => m.friend).length / 3),
    hydraulic: moving === 0 ? 0 : clamp01(0.6 + 0.2 * (moving - 1)),
    pour: clamp01(pour),
    beep: active.unlocked && active.speed < -0.3,
    drum: mixerLoaded ? clamp01(mixer.concrete > 0 ? 0.5 : 0.35 + 0.65 * mixer.mixed) : 0,
    shake: roller.unlocked ? clamp01(roller.shake) : 0,
    plant: Object.values(s.plants).some((p) => p.phase === 'work') ? 1 : 0,
    water: clamp01(water),
    push: dozer.unlocked && dozer.pushing > 0.05 ? clamp01(0.4 + dozer.pushing / 4) : 0,
  }
}

// ---------------------------------------------------------------------------------------
// The mix.

/** The master, the music's level, and the share engines and music keep while the microphone listens. */
export const MASTER = 0.8
export const MUSIC = 0.3
export const LISTENING = 1 / 3
/** The room (a soft reverb) everything can send a share of itself into, and how loud it comes back. */
const ROOM_SECONDS = 1.4
const EFFECTS_ROOM = 0.1
const ROOM_WET = 0.5
/** The music dips to this share of itself while a big jingle plays, for as long as the table says. */
const DIP = 0.35
const DIP_FOR: Partial<Record<SoundKind, number>> = { jobDone: 1.8, chapterDone: 3, party: 2.4, fireworks: 3.2, clockStrike: 3, iceCreamJingle: 3.6, moveIn: 1.8 }
/** The same sound again within this many seconds is the same sound; a few repeat more slowly. */
export const DEDUP = 0.05
const DEDUP_FOR: Partial<Record<SoundKind, number>> = { rolled: 0.35, push: 0.35, water: 0.3, pour: 0.3, bite: 0.12, plantThump: 0.12 }
/** Horns and toots are one voice: a held button does not stutter. */
export const HORN_DEDUP = 0.2
/** A sound starts this long after it is asked for, so the audio thread never misses the start of its envelope. */
export const START = 0.01
/** A coin within COIN_RUN of the last climbs one step up the scale; after a longer pause the climb starts again at the bottom. */
export const COIN_RUN = 0.7
export const COIN_NOTES = [79, 81, 84, 86, 88, 91, 93, 96] as const
/** The tune's clock wakes every CLOCK_MS and schedules whatever is due within LOOKAHEAD seconds; a tune starts LEAD_IN after it is asked for. */
const CLOCK_MS = 60
export const LOOKAHEAD = 0.3
const LEAD_IN = 0.06
export const FADE_IN = 0.5
export const CROSSFADE = 0.8
export const FADE_OUT = 0.6
/** The reversing beep: one every BEEP_EVERY seconds. */
export const BEEP_EVERY = 0.8
/** Exponential glides never reach zero: this is silence. Partials above TOP_HZ are left out. */
const SILENT = 0.0001
const TOP_HZ = 15000

/** The frequency of a MIDI note (A4, 69, is 440 Hz). */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/** The coin scale's next rung after one that rang `gap` seconds ago: one up within COIN_RUN (staying at the top), the bottom after a pause. */
export function coinRung(rung: number, gap: number): number {
  return gap <= COIN_RUN ? Math.min(rung + 1, COIN_NOTES.length - 1) : 0
}

// ---------------------------------------------------------------------------------------
// The music, written in C.

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

/** Eighth-note slots in every bar. */
export const SLOTS = 8

/** One bar: its chord, and per slot the melody note that starts there (MIDI as written in C, 0 for none) and how many slots it lasts. */
export interface Bar {
  chord: Chord
  notes: readonly number[]
  lengths: readonly number[]
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/** Bars from rows written a bar each: the chord, then SLOTS words, each a note (E5, F#5, Bb4), '-' holding the note before (across a bar line too) or '.' for silence. Throws on a row of another length, a hold with nothing to hold, or a word that is not a note. */
function bars(rows: readonly string[]): Bar[] {
  let holding: { bar: number; slot: number } | null = null
  const out: { chord: Chord; notes: number[]; lengths: number[] }[] = []
  rows.forEach((row, b) => {
    const [chord, ...words] = row.split(/\s+/).filter((w) => w !== '')
    if (!(chord in CHORDS)) throw new Error(`bar ${b + 1} '${row}': '${chord}' is not a chord`)
    if (words.length !== SLOTS) throw new Error(`bar ${b + 1} '${row}' has ${words.length} slots, not ${SLOTS}`)
    const bar = { chord: chord as Chord, notes: [] as number[], lengths: [] as number[] }
    out.push(bar)
    words.forEach((w, s) => {
      if (w === '-') {
        if (holding === null) throw new Error(`bar ${b + 1} '${row}': a '-' with nothing to hold`)
        out[holding.bar].lengths[holding.slot] += 1
        bar.notes.push(0)
        bar.lengths.push(0)
      } else if (w === '.') {
        holding = null
        bar.notes.push(0)
        bar.lengths.push(0)
      } else {
        const m = /^([A-G])([#b]?)([3-7])$/.exec(w)
        if (m === null) throw new Error(`bar ${b + 1} '${row}': '${w}' is not a note`)
        bar.notes.push(LETTERS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3]) + 1))
        bar.lengths.push(1)
        holding = { bar: b, slot: s }
      }
    })
  })
  return out
}

/** The lead's instrument. marimba: a warm wooden bar. bell: a music box's tine. flute: a soft flute with a late vibrato. toy: a toy piano. */
type Lead = 'marimba' | 'bell' | 'flute' | 'toy'
/** The bass. walk: root and fifth, plucked. pluck: a round pluck that skips. float: long soft notes. */
type BassVoice = 'walk' | 'pluck' | 'float'
/** The chords. strum: a soft chop on 2 and 4. arp: a marimba breaking the chord in eighths. pad: a chord held through the bar. */
type Comp = 'strum' | 'arp' | 'pad'
/** The drums. march: a soft kick, a wood block and a shaker. soft: a kick and brushes. none: nothing. */
type Kit = 'march' | 'soft' | 'none'

export interface Tune {
  /** Quarter notes a minute. */
  bpm: number
  /** Semitones above C the tune sounds in; the melodic one-shots follow it. */
  key: number
  bars: readonly Bar[]
  lead: Lead
  /** The bass: its voice, per slot the semitones over the chord's root it plays (null for none), and how many slots a note lasts. */
  bass: { voice: BassVoice; line: readonly (number | null)[]; len: number }
  comp: Comp
  kit: Kit
  /** The tune's own level, so every tune sounds about as loud as the others. */
  level: number
}

/** A tune's 16 bars: A, B, A again, and C that comes home. */
const form = (a: readonly string[], b: readonly string[], c: readonly string[]): Bar[] => [...bars(a), ...bars(b), ...bars(a), ...bars(c)]

const WALK = [0, null, 7, null, 0, null, 7, null] as const
const SKIP = [0, null, null, 7, null, null, 7, null] as const
const LONG = [0, null, null, null, null, null, null, null] as const

/** Every tune, each in its own key, tempo and colour. */
export const TUNES: Record<TuneId, Tune> = {
  /** The road: a work song, a marimba over a walking bass and a wood block, like a happy site. */
  road: {
    bpm: 104,
    key: 0,
    bars: form(
      ['C E5 . E5 G5 . G5 E5 .', 'C D5 . D5 E5 . C5 . .', 'F F5 . F5 A5 . A5 F5 .', 'G G5 . F5 E5 . D5 . .'],
      ['Am C6 . C6 B5 . A5 . .', 'F A5 . G5 F5 . A5 . .', 'G B5 . D6 B5 . G5 . .', 'C C6 - - - . . . .'],
      ['C G5 . E5 G5 . C6 . G5', 'F A5 . F5 A5 . C6 . A5', 'G B5 . G5 D5 . G5 . .', 'C C5 . E5 G5 . C6 - -'],
    ),
    lead: 'marimba',
    bass: { voice: 'walk', line: WALK, len: 2 },
    comp: 'strum',
    kit: 'march',
    level: 1,
  },
  /** Bunny's house: a cosy music box over a rocking arpeggio. */
  house: {
    bpm: 96,
    key: 5,
    bars: form(
      ['C G5 . E5 . G5 - E5 .', 'Am A5 . C6 . A5 - E5 .', 'F A5 . C6 . A5 - F5 .', 'C E5 - - . G5 . E5 .'],
      ['F C6 . A5 . F5 - A5 .', 'G B5 . G5 . D5 - G5 .', 'Am E5 . A5 . C6 - B5 .', 'C C6 - - - G5 - E5 .'],
      ['Dm D5 . F5 . A5 - F5 .', 'G G5 . B5 . D6 - B5 .', 'C C6 . G5 . E5 - G5 .', 'C C6 - - - . . . .'],
    ),
    lead: 'bell',
    bass: { voice: 'pluck', line: SKIP, len: 2 },
    comp: 'arp',
    kit: 'soft',
    level: 1.15,
  },
  /** The bridge: a strolling whistle across the river. */
  bridge: {
    bpm: 112,
    key: 7,
    bars: form(
      ['C C5 . E5 G5 . E5 C5 .', 'C D5 . E5 G5 . E5 D5 .', 'G D5 . G5 B5 . G5 D5 .', 'G E5 . G5 B5 . A5 G5 .'],
      ['F A5 . A5 C6 . A5 F5 .', 'C G5 . G5 E5 . G5 C6 .', 'Dm F5 . A5 D6 . A5 F5 .', 'G7 G5 . B5 D6 . B5 G5 .'],
      ['C E5 . G5 C6 . B5 A5 .', 'Am C6 . B5 A5 . G5 E5 .', 'G D5 . G5 B5 . D6 . G5', 'C G5 . E5 C5 . E5 G5 -'],
    ),
    lead: 'flute',
    bass: { voice: 'walk', line: WALK, len: 2 },
    comp: 'strum',
    kit: 'march',
    level: 1.1,
  },
  /** The playground: a skipping toy piano. */
  play: {
    bpm: 120,
    key: 2,
    bars: form(
      ['C G5 E5 G5 . A5 G5 E5 .', 'G B5 G5 B5 . D6 B5 G5 .', 'Am A5 E5 A5 . C6 A5 E5 .', 'F F5 A5 C6 . A5 F5 A5 .'],
      ['C E5 . G5 . E5 . C5 .', 'F F5 . A5 . F5 . C5 .', 'G G5 . B5 . G5 . D5 .', 'C C5 E5 G5 C6 G5 E5 C5 .'],
      ['Dm D5 F5 A5 . D6 A5 F5 .', 'G G5 B5 D6 . B5 G5 D5 .', 'Em E5 G5 B5 . G5 E5 G5 .', 'C C6 . G5 . E5 . C5 -'],
    ),
    lead: 'toy',
    bass: { voice: 'walk', line: WALK, len: 2 },
    comp: 'strum',
    kit: 'march',
    level: 1.05,
  },
  /** The clock tower: a slow lullaby for the starry night. */
  clock: {
    bpm: 66,
    key: 3,
    bars: form(
      ['C E5 - - . G5 - - .', 'Am E5 - - . A5 - - .', 'F A5 - - . C6 - - .', 'G B5 - - - D6 - - -'],
      ['C C6 - - . G5 - - .', 'F A5 - - . F5 - - .', 'Dm D5 - - . F5 - A5 .', 'G G5 - - - . . . .'],
      ['F F5 . A5 . C6 - - .', 'G B5 . D6 . B5 - G5 .', 'Em E5 . G5 . B5 - G5 .', 'C C6 - - - - - - -'],
    ),
    lead: 'bell',
    bass: { voice: 'float', line: LONG, len: 8 },
    comp: 'pad',
    kit: 'none',
    level: 0.8,
  },
  /** The title: a friendly march into the valley. */
  title: {
    bpm: 108,
    key: -2,
    bars: form(
      ['C G5 . C6 . B5 A5 G5 .', 'F A5 . C6 . A5 G5 F5 .', 'G G5 . B5 . D6 . B5 .', 'C C6 - - - G5 . E5 .'],
      ['Am A5 . A5 C6 . B5 A5 .', 'Dm D6 . C6 . A5 . F5 .', 'G G5 . A5 B5 . D6 . B5', 'C E5 G5 C6 . G5 E5 C5 .'],
      ['F F5 . A5 . C6 . A5 .', 'G7 G5 . B5 . D6 - B5 .', 'C C6 . B5 . A5 . G5 .', 'C C6 - - - . . . .'],
    ),
    lead: 'toy',
    bass: { voice: 'pluck', line: SKIP, len: 2 },
    comp: 'arp',
    kit: 'soft',
    level: 1.05,
  },
  /** The party: a bright, bouncing marimba. */
  party: {
    bpm: 128,
    key: 4,
    bars: form(
      ['C E5 E5 G5 . G5 C6 . .', 'C G5 . E5 G5 C6 . G5 .', 'F A5 A5 C6 . C6 A5 F5 .', 'G B5 B5 D6 . D6 B5 G5 .'],
      ['C C6 . G5 . E5 . G5 .', 'Am A5 . C6 . E5 . A5 .', 'F F5 . A5 . C6 . A5 .', 'G7 G5 . B5 . D6 . B5 -'],
      ['C E5 G5 C6 . E5 G5 C6 .', 'Dm D6 . C6 . A5 . D6 .', 'G B5 D6 B5 . G5 B5 D6 .', 'C C6 - - - . . . .'],
    ),
    lead: 'marimba',
    bass: { voice: 'walk', line: WALK, len: 2 },
    comp: 'strum',
    kit: 'march',
    level: 1.05,
  },
}

/** How long one time round a tune takes, in seconds. */
export const tuneSeconds = (tune: TuneId) => (TUNES[tune].bars.length * SLOTS * 30) / TUNES[tune].bpm

/** The chord's notes in the key, each in the octave from `low` up (MIDI), lowest first. */
const voicing = (chord: ChordShape, key: number, low: number): number[] => chord.tones.map((t) => low + mod(chord.root + key + t - low, 12)).sort((a, b) => a - b)
/** Which note of a voicing (and the same an octave up) the arpeggio plays on each slot. */
const ARP = [0, 1, 2, 3, 2, 1, 2, 3] as const
const LEAD_LEVEL: Record<Lead, number> = { marimba: 0.2, bell: 0.15, flute: 0.15, toy: 0.15 }
const BASS_LEVEL: Record<BassVoice, number> = { walk: 0.15, pluck: 0.15, float: 0.11 }
const COMP_LEVEL: Record<Comp, number> = { strum: 0.04, arp: 0.04, pad: 0.03 }
const KIT_LEVEL = { kick: 0.12, tick: 0.03 }

/** A tune playing: its score, its fader (tunes crossfade on it), and where its clock is. */
export interface Deck {
  tune: TuneId
  score: Tune
  out: GainNode
  /** The next step to play, counted from the tune's first slot (it keeps counting past the end), and when. */
  step: number
  next: number
}

// ---------------------------------------------------------------------------------------
// The voices' tables.

/** A pitch or a level over time: [seconds after the start, value] points, joined by exponential glides. */
type Path = readonly (readonly [number, number])[]
/** Struck: up to full over `attack`, then dying away to silence at `dur`. */
const pluck = (attack: number, dur: number): Path => [[0, 0], [attack, 1], [dur, 0]]
/** Held: up to full over `attack`, easing to 0.6 by `dur`, then gone over `release`. */
const sustain = (attack: number, dur: number, release: number): Path => {
  const end = Math.max(dur, attack * 2)
  return [[0, 0], [attack, 1], [end, 0.6], [end + release, 0]]
}

/** Sets `param` along `path` from `at`, each value times `scale`, never below SILENT (an exponential glide cannot reach zero). */
function glide(param: AudioParam, path: Path, at: number, scale: number) {
  path.forEach(([t, v], i) => {
    const value = Math.max(v * scale, SILENT)
    if (i > 0) param.exponentialRampToValueAtTime(value, at + t)
    else {
      // The first value holds from now as well, so a source starting a sample early never meets a gain's default of 1.
      param.value = value
      param.setValueAtTime(value, at + t)
    }
  })
}

/** A struck sound's partials as [ratio to the fundamental, level]; the higher ones die sooner. */
type Partials = readonly (readonly [number, number])[]
const GLASS: Partials = [[1, 1], [2.76, 0.28], [5.4, 0.09]]
const TINE: Partials = [[1, 1], [2.99, 0.12], [5.6, 0.07], [8.2, 0.025]]
const CHIME: Partials = [[1, 1], [2, 0.45], [3.01, 0.2], [4.16, 0.08]]
const STEEL: Partials = [[1, 1], [2.7, 0.5], [5.1, 0.2], [7.9, 0.08]]
const BIG_BELL: Partials = [[0.5, 0.35], [1, 1], [1.19, 0.6], [1.56, 0.35], [2, 0.3], [2.5, 0.15], [3, 0.08]]

/** A horn's note: [seconds from the start, Hz, seconds it lasts]. */
type Note = readonly [at: number, hz: number, dur: number]
interface Honk {
  wave: OscillatorType
  /** The lowpass that takes the buzz out. */
  cut: number
  vol: number
  /** A second voice at this ratio over the first (an air horn's chord), or 0. */
  second: number
  /** Vibrato rate, or 0. */
  wobble: number
  /** Struck like a bell, not held like a horn. */
  struck: boolean
  notes: readonly Note[]
  /** The pitch of its tiny toot. */
  toot: number
}

/** Each machine's own horn: the lorry a deep air horn, the forklift a tiny beep-beep, the digger a friendly double honk. */
const HORNS: Record<MachineKind, Honk> = {
  digger: { wave: 'sawtooth', cut: 1500, vol: 0.1, second: 0, wobble: 0, struck: false, notes: [[0, 330, 0.17], [0.22, 392, 0.24]], toot: 330 },
  dumper: { wave: 'sawtooth', cut: 1100, vol: 0.1, second: 1.26, wobble: 0, struck: false, notes: [[0, 220, 0.55]], toot: 220 },
  dozer: { wave: 'sawtooth', cut: 700, vol: 0.12, second: 0, wobble: 0, struck: false, notes: [[0, 147, 0.2], [0.26, 147, 0.32]], toot: 294 },
  roller: { wave: 'triangle', cut: 1800, vol: 0.14, second: 0, wobble: 0, struck: false, notes: [[0, 262, 0.15], [0.2, 262, 0.15], [0.4, 330, 0.3]], toot: 262 },
  mixer: { wave: 'sawtooth', cut: 1200, vol: 0.1, second: 1.5, wobble: 5, struck: false, notes: [[0, 247, 0.5]], toot: 247 },
  forklift: { wave: 'square', cut: 3200, vol: 0.04, second: 0, wobble: 0, struck: false, notes: [[0, 1480, 0.07], [0.13, 1480, 0.07]], toot: 1480 },
  tower: { wave: 'triangle', cut: 4000, vol: 0.14, second: 0, wobble: 0, struck: true, notes: [[0, 784, 0.3], [0.3, 587, 0.5]], toot: 784 },
  semi: { wave: 'sawtooth', cut: 650, vol: 0.12, second: 1.26, wobble: 0, struck: false, notes: [[0, 110, 0.9]], toot: 185 },
  mobile: { wave: 'sawtooth', cut: 1600, vol: 0.09, second: 0, wobble: 0, struck: false, notes: [[0, 392, 0.14], [0.18, 392, 0.14], [0.36, 523, 0.4]], toot: 392 },
}

/** The toy brass of the fanfares. */
const FANFARE_HORN: Honk = { wave: 'sawtooth', cut: 2200, vol: 0.07, second: 0, wobble: 0, struck: false, notes: [], toot: 0 }

/** One syllable of an animal: seconds from the start, how long, the pitch over it (start, middle, end), the mouth's band (closed, open), the level, and a throat flutter in Hz or 0. */
interface Syllable {
  at: number
  dur: number
  pitch: readonly [number, number, number]
  mouth: readonly [number, number]
  vol: number
  flutter: number
}
const syl = (at: number, dur: number, pitch: readonly [number, number, number], mouth: readonly [number, number], vol: number, flutter: number): Syllable => ({ at, dur, pitch, mouth, vol, flutter })

/** A cartoon voice per animal. */
const VOICES: Record<Species, readonly Syllable[]> = {
  hedgehog: [syl(0, 0.09, [2400, 3100, 2700], [3500, 3600], 0.05, 0), syl(0.13, 0.09, [2500, 3200, 2800], [3500, 3600], 0.05, 0)],
  bunny: [syl(0, 0.1, [700, 950, 800], [1700, 2200], 0.1, 0), syl(0.14, 0.1, [740, 1000, 850], [1700, 2200], 0.1, 0)],
  duck: [syl(0, 0.16, [420, 360, 280], [1300, 900], 0.14, 55), syl(0.22, 0.14, [400, 340, 270], [1300, 900], 0.12, 55)],
  pig: [syl(0, 0.2, [160, 260, 150], [600, 1400], 0.17, 26), syl(0.26, 0.16, [170, 250, 140], [600, 1400], 0.15, 26)],
  cat: [syl(0, 0.5, [480, 760, 430], [900, 2000], 0.12, 0)],
  dog: [syl(0, 0.14, [380, 450, 240], [900, 1000], 0.18, 0), syl(0.2, 0.14, [380, 450, 240], [900, 1000], 0.18, 0)],
  cow: [syl(0, 0.95, [150, 175, 125], [420, 700], 0.2, 5)],
  sheep: [syl(0, 0.6, [330, 360, 300], [1100, 1500], 0.13, 30)],
  fox: [syl(0, 0.1, [800, 1250, 950], [2000, 2600], 0.1, 0), syl(0.14, 0.1, [850, 1300, 900], [2000, 2600], 0.1, 0), syl(0.28, 0.16, [900, 1500, 1000], [2000, 2600], 0.1, 0)],
  bear: [syl(0, 0.5, [120, 150, 95], [400, 700], 0.2, 18)],
  frog: [syl(0, 0.1, [230, 330, 260], [700, 1100], 0.14, 0), syl(0.14, 0.16, [200, 300, 220], [700, 1100], 0.14, 40)],
}

/** A loop's recipe: tones (wave, ratio over `hz`, level), a share of noise, one filter through which both go, a chug (an LFO on the level), and its loudest level. */
export interface LayerSpec {
  tones: readonly (readonly [wave: OscillatorType, ratio: number, level: number])[]
  hz: number
  /** The pitch climbs by this share over the level's range. */
  rise: number
  noise: number
  filter: BiquadFilterType
  q: number
  /** The filter's cutoff at level 0 and 1. */
  cut: readonly [number, number]
  /** The chug's rate at level 0 and 1, and how deep it cuts (0 to 1). */
  chug: readonly [number, number]
  depth: number
  gain: number
}

export type LayerKey = 'engine' | 'friends' | 'hydraulic' | 'pour' | 'water' | 'drum' | 'shake' | 'plant' | 'push'
export const LAYER_KEYS: readonly LayerKey[] = ['engine', 'friends', 'hydraulic', 'pour', 'water', 'drum', 'shake', 'plant', 'push']

export const LAYERS: Record<LayerKey, LayerSpec> = {
  engine: { tones: [['sawtooth', 1, 0.5], ['square', 0.5, 0.35]], hz: 90, rise: 0, noise: 0.15, filter: 'lowpass', q: 1, cut: [260, 900], chug: [7, 20], depth: 0.5, gain: 0.09 },
  friends: { tones: [['sawtooth', 1, 0.5], ['square', 0.5, 0.3]], hz: 56, rise: 0, noise: 0.15, filter: 'lowpass', q: 1, cut: [220, 600], chug: [5, 14], depth: 0.5, gain: 0.05 },
  hydraulic: { tones: [['sine', 1, 0.4], ['triangle', 2.01, 0.2]], hz: 260, rise: 0.3, noise: 0.5, filter: 'bandpass', q: 2, cut: [500, 900], chug: [3, 6], depth: 0.3, gain: 0.035 },
  pour: { tones: [], hz: 100, rise: 0, noise: 1, filter: 'bandpass', q: 0.6, cut: [900, 1500], chug: [8, 14], depth: 0.35, gain: 0.07 },
  water: { tones: [['sine', 1, 0.2]], hz: 500, rise: 0.5, noise: 1, filter: 'bandpass', q: 0.5, cut: [1800, 2600], chug: [5, 9], depth: 0.25, gain: 0.045 },
  drum: { tones: [['sawtooth', 1, 0.3], ['sine', 0.5, 0.4]], hz: 48, rise: 0.2, noise: 0.5, filter: 'lowpass', q: 1, cut: [250, 500], chug: [1.4, 2.6], depth: 0.6, gain: 0.07 },
  shake: { tones: [['sawtooth', 1, 0.4], ['square', 1.5, 0.2]], hz: 36, rise: 0.2, noise: 0.3, filter: 'lowpass', q: 1, cut: [200, 500], chug: [10, 16], depth: 0.7, gain: 0.08 },
  plant: { tones: [['square', 1, 0.25], ['sawtooth', 0.5, 0.3]], hz: 60, rise: 0, noise: 0.25, filter: 'bandpass', q: 1, cut: [400, 800], chug: [3, 4], depth: 0.9, gain: 0.08 },
  push: { tones: [['sawtooth', 1, 0.3]], hz: 50, rise: 0.1, noise: 0.7, filter: 'lowpass', q: 1, cut: [350, 700], chug: [2, 3.5], depth: 0.4, gain: 0.08 },
}

/** Each machine's engine: its pitch, how bright it is and how fast it chugs, as multiples of the layer's own. */
export const ENGINES: Record<MachineKind, { pitch: number; bright: number; chug: number }> = {
  digger: { pitch: 1, bright: 1, chug: 1 },
  dumper: { pitch: 1.25, bright: 1.1, chug: 1.1 },
  dozer: { pitch: 0.85, bright: 0.9, chug: 0.8 },
  roller: { pitch: 0.7, bright: 0.8, chug: 0.7 },
  mixer: { pitch: 1.1, bright: 1, chug: 0.9 },
  forklift: { pitch: 1.9, bright: 1.2, chug: 1.5 },
  tower: { pitch: 2.2, bright: 0.6, chug: 0.35 },
  semi: { pitch: 0.6, bright: 1, chug: 1.2 },
  mobile: { pitch: 0.9, bright: 1, chug: 1 },
}

/** A loop made: its fader, filter, tones and chug. */
export interface Layer {
  spec: LayerSpec
  amp: GainNode
  filter: BiquadFilterNode
  tones: readonly OscillatorNode[]
  chug: OscillatorNode
  depth: GainNode
}

/** How a loop's sound bends: pitch, brightness and chug rate, as multiples of its recipe. */
export interface Shape {
  pitch: number
  bright: number
  rate: number
}
export const PLAIN: Shape = { pitch: 1, bright: 1, rate: 1 }

function isMachine(name: string): name is MachineKind {
  return (MACHINE_KINDS as readonly string[]).includes(name)
}
function isSpecies(name: string): name is Species {
  return (SPECIES as readonly string[]).includes(name)
}

// ---------------------------------------------------------------------------------------
// The synth.

/**
 * Every voice of the game on one audio context: the buses, the room, the effects, the steps
 * of the tunes and the loops. Sounds runs it on the page's AudioContext; it runs as well on
 * any other.
 */
export class Synth {
  readonly ctx: BaseAudioContext
  readonly master: GainNode
  /** Effects, the one-shot sounds. */
  readonly effects: GainNode
  /** The loops: engines and machinery. */
  readonly loops: GainNode
  /** Music (its level, or nothing when the music is off), and the dip a big jingle puts it under. */
  readonly music: GainNode
  readonly dip: GainNode
  /** Loops and music pass here: a third while the microphone listens. */
  readonly soft: GainNode
  /** The room's input: whatever goes in comes back softly as reverb. */
  readonly room: GainNode
  /** Semitones above C the melodic one-shots play in: the key of the tune playing. */
  key = 0
  private rand = mulberry32(0xd166e7)
  /** Two seconds of white noise every noisy sound loops over. */
  private white: AudioBuffer
  private rung = 0
  private coinAt = -Infinity
  private dippedUntil = 0

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
    this.soft = this.gain(1, this.master)
    this.effects = this.gain(1, this.master)
    this.loops = this.gain(1, this.soft)
    this.music = this.gain(MUSIC, this.soft)
    this.dip = this.gain(1, this.music)
    this.white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = this.white.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = this.rand() * 2 - 1
    const reverb = ctx.createConvolver()
    reverb.buffer = this.impulse()
    reverb.connect(this.gain(ROOM_WET, this.master))
    this.room = this.gain(1, reverb)
    this.effects.connect(this.gain(EFFECTS_ROOM, this.room))
  }

  /** The effects and the loops on or off, from `at`. */
  setSound(on: boolean, at: number) {
    this.effects.gain.setTargetAtTime(on ? 1 : 0, at, 0.03)
    this.loops.gain.setTargetAtTime(on ? 1 : 0, at, 0.03)
  }

  /** The music on or off, from `at`. */
  setMusic(on: boolean, at: number) {
    this.music.gain.setTargetAtTime(on ? MUSIC : 0, at, 0.05)
  }

  /** Loops and music to a third (the microphone listens) or back, from `at`. */
  setListening(on: boolean, at: number) {
    this.soft.gain.setTargetAtTime(on ? LISTENING : 1, at, 0.15)
  }

  /** The sound of one kind, starting at `at`. */
  effect(kind: SoundKind, at: number) {
    const fx = this.effects
    const t = at
    const r = () => this.rand()
    /** A note of the jingles in the key of the tune playing. */
    const k = (m: number) => hz(m + this.key)
    const dip = DIP_FOR[kind]
    if (dip !== undefined) this.dipMusic(at, dip)
    switch (kind) {
      case 'bite': {
        // The bucket bites: a crunch of grit, a low scrape and a few small stones.
        this.noise(fx, 'bandpass', [[0, 500], [0.2, 1400]], 1.1, [[0, 0], [0.03, 1], [0.12, 0.6], [0.26, 0]], 0.16, t)
        const low = 1 + 0.15 * r()
        this.tone(fx, 'sine', [[0, 110 * low], [0.12, 60 * low]], pluck(0.004, 0.16), 0.2, t)
        for (let i = 0; i < 3; i++) this.noise(fx, 'highpass', [[0, 2500]], 0.7, pluck(0.002, 0.03), 0.05, t + 0.05 + i * 0.06 + 0.02 * r())
        return
      }
      case 'dump': {
        // The bucket opens and the stuff pours out: a soft landslide with a few stones clinking.
        this.noise(fx, 'lowpass', [[0, 2200], [0.5, 600]], 0, [[0, 0], [0.04, 1], [0.2, 0.8], [0.5, 0]], 0.18, t)
        this.tone(fx, 'sine', [[0, 90], [0.3, 55]], pluck(0.01, 0.3), 0.15, t)
        for (let i = 0; i < 4; i++) this.tone(fx, 'sine', [[0, 1500 + 1500 * r()]], pluck(0.001, 0.03), 0.025, t + 0.08 + i * 0.07 + 0.03 * r())
        return
      }
      case 'tip':
        // The truck's bed tips: a clunk, then a long low rumble of stuff sliding out.
        this.tone(fx, 'sine', [[0, 160], [0.08, 90]], pluck(0.003, 0.1), 0.16, t)
        this.noise(fx, 'lowpass', [[0, 900], [0.7, 300]], 0, [[0, 0], [0.2, 1], [0.5, 0.8], [0.75, 0]], 0.17, t + 0.05)
        this.tone(fx, 'sine', [[0, 70], [0.7, 45]], [[0, 0], [0.1, 1], [0.7, 0]], 0.18, t + 0.05)
        return
      case 'landed':
        // A heap lands: a soft thud.
        this.tone(fx, 'sine', [[0, 140], [0.18, 55]], pluck(0.003, 0.2), 0.2, t)
        this.tone(fx, 'triangle', [[0, 280], [0.1, 120]], pluck(0.003, 0.08), 0.07, t)
        this.noise(fx, 'lowpass', [[0, 800]], 0, pluck(0.003, 0.12), 0.1, t)
        return
      case 'coin': {
        // A coin: a bright ding, and when they come quickly each one climbs a step of the scale.
        this.rung = coinRung(this.rung, t - this.coinAt)
        this.coinAt = t
        const n = COIN_NOTES[this.rung]
        this.bell(fx, GLASS, k(n), t, 0.55, 0.1)
        this.bell(fx, GLASS, k(n + 12), t + 0.07, 0.4, 0.05)
        return
      }
      case 'hop': {
        // The builder hops from cab to cab: a springy boing up and a little whoosh.
        const o = this.tone(fx, 'sine', [[0, 320], [0.12, 720]], pluck(0.005, 0.17), 0.14, t)
        this.tone(fx, 'triangle', [[0, 640], [0.12, 1440]], pluck(0.005, 0.12), 0.03, t)
        this.wobble([o.frequency], 14, [[0, 40]], t, 0.17)
        this.noise(fx, 'bandpass', [[0, 600], [0.15, 1800]], 1, [[0, 0], [0.05, 1], [0.18, 0]], 0.04, t)
        return
      }
      case 'uhuh':
        // Uh-oh: two soft notes falling, never harsh.
        this.tone(fx, 'triangle', [[0, 392]], pluck(0.01, 0.15), 0.12, t)
        this.tone(fx, 'sine', [[0, 392]], pluck(0.01, 0.15), 0.06, t)
        this.tone(fx, 'triangle', [[0, 311]], pluck(0.01, 0.22), 0.12, t + 0.15)
        this.tone(fx, 'sine', [[0, 311]], pluck(0.01, 0.22), 0.06, t + 0.15)
        return
      case 'comes':
        // A friend arrives: three little bells climbing.
        for (const [i, m] of [72, 76, 79].entries()) this.bell(fx, GLASS, k(m), t + i * 0.08, 0.5, 0.07)
        return
      case 'pick': {
        // The hook or the forks take hold: a metal clank and a click.
        this.bell(fx, STEEL, 520, t, 0.2, 0.06)
        this.noise(fx, 'bandpass', [[0, 2400]], 1, pluck(0.001, 0.04), 0.09, t)
        this.tone(fx, 'sine', [[0, 200], [0.05, 140]], pluck(0.002, 0.07), 0.1, t)
        return
      }
      case 'drop':
        // A thing is set down: a wooden thump.
        this.tone(fx, 'sine', [[0, 150], [0.12, 65]], pluck(0.003, 0.14), 0.2, t)
        this.tone(fx, 'sine', [[0, 420], [0.04, 300]], pluck(0.001, 0.05), 0.08, t)
        this.noise(fx, 'lowpass', [[0, 1200]], 0, pluck(0.002, 0.07), 0.1, t)
        return
      case 'place':
        // A piece goes into the building: a wooden tok and two happy bells.
        this.tone(fx, 'sine', [[0, 330], [0.06, 180]], pluck(0.002, 0.08), 0.2, t)
        this.noise(fx, 'bandpass', [[0, 1500]], 1, pluck(0.001, 0.03), 0.06, t)
        this.bell(fx, GLASS, k(76), t + 0.07, 0.5, 0.08)
        this.bell(fx, GLASS, k(83), t + 0.15, 0.6, 0.08)
        return
      case 'rolled':
        // The roller flattens the road: a soft whump and a tiny shine.
        this.noise(fx, 'lowpass', [[0, 500], [0.25, 250]], 0, [[0, 0], [0.04, 1], [0.25, 0]], 0.12, t)
        this.tone(fx, 'sine', [[0, 95], [0.2, 70]], pluck(0.01, 0.2), 0.12, t)
        this.bell(fx, GLASS, k(91), t + 0.04, 0.3, 0.025)
        return
      case 'stomp':
        // The roller stomps: a big soft boom.
        this.tone(fx, 'sine', [[0, 110], [0.3, 38]], pluck(0.004, 0.36), 0.22, t)
        this.tone(fx, 'triangle', [[0, 220], [0.1, 100]], pluck(0.003, 0.1), 0.08, t)
        this.noise(fx, 'lowpass', [[0, 500], [0.3, 150]], 0, pluck(0.004, 0.3), 0.14, t)
        return
      case 'push':
        // The blade shoves a heap: a low scrape and grunt.
        this.noise(fx, 'lowpass', [[0, 700], [0.4, 350]], 0, [[0, 0], [0.1, 1], [0.35, 0.7], [0.5, 0]], 0.12, t)
        this.tone(this.filter('lowpass', 200, 0.7, fx), 'sawtooth', [[0, 55], [0.45, 48]], [[0, 0], [0.1, 1], [0.35, 0.7], [0.5, 0]], 0.15, t)
        return
      case 'plantStart':
        // A plant starts up: the motor winds up and a clank falls in at the top.
        this.tone(this.filter('lowpass', 900, 0.8, fx), 'sawtooth', [[0, 50], [0.6, 170]], [[0, 0], [0.2, 0.8], [0.6, 1], [0.75, 0]], 0.12, t)
        this.noise(fx, 'bandpass', [[0, 300], [0.6, 1500]], 1, [[0, 0], [0.5, 1], [0.7, 0]], 0.06, t)
        this.bell(fx, STEEL, 330, t + 0.55, 0.3, 0.05)
        return
      case 'plantThump':
        // A thump of the machine at work.
        this.tone(fx, 'sine', [[0, 90], [0.14, 50]], pluck(0.003, 0.16), 0.22, t)
        this.tone(fx, 'triangle', [[0, 180], [0.08, 90]], pluck(0.002, 0.08), 0.1, t)
        this.noise(fx, 'bandpass', [[0, 900]], 1, pluck(0.001, 0.03), 0.05, t)
        return
      case 'plantDone':
        // A batch is ready: ding-ding and a puff of steam.
        this.bell(fx, GLASS, k(84), t, 0.6, 0.09)
        this.bell(fx, GLASS, k(88), t + 0.12, 0.7, 0.09)
        this.noise(fx, 'highpass', [[0, 5000]], 0, [[0, 0], [0.02, 1], [0.35, 0]], 0.05, t + 0.1)
        return
      case 'water':
        // Water runs into the drum: a few glugs and a trickle.
        for (let i = 0; i < 4; i++) {
          const f = 500 + 400 * r()
          this.tone(fx, 'sine', [[0, f * 0.7], [0.05, f]], pluck(0.004, 0.09), 0.1, t + i * 0.08)
        }
        this.noise(fx, 'highpass', [[0, 1200]], 0.7, [[0, 0], [0.05, 1], [0.45, 0]], 0.04, t)
        return
      case 'mixed':
        // The concrete is mixed: a gurgle and a happy ta-da.
        this.tone(fx, 'sine', [[0, 260], [0.08, 380]], pluck(0.004, 0.1), 0.1, t)
        for (const [i, m] of [79, 84, 88].entries()) this.bell(fx, GLASS, k(m), t + 0.12 + i * 0.09, 0.6, 0.08)
        this.tone(fx, 'triangle', [[0, k(72)]], sustain(0.01, 0.3, 0.3), 0.05, t + 0.3)
        return
      case 'pour':
        // Concrete pours out: a thick gush and a few low glugs.
        this.noise(fx, 'lowpass', [[0, 1100], [0.8, 420]], 0, [[0, 0], [0.1, 1], [0.6, 0.9], [0.85, 0]], 0.16, t)
        for (let i = 0; i < 3; i++) this.tone(fx, 'sine', [[0, 120 + 40 * r()], [0.1, 190]], pluck(0.01, 0.12), 0.12, t + 0.12 + i * 0.22)
        return
      case 'set':
        // The floor is hard: a solid tock and pa-ding.
        this.tone(fx, 'sine', [[0, 260], [0.08, 160]], pluck(0.002, 0.1), 0.2, t)
        this.bell(fx, GLASS, k(79), t + 0.06, 0.6, 0.09)
        this.bell(fx, GLASS, k(84), t + 0.16, 0.8, 0.09)
        return
      case 'splash':
        // Into the water: a ploonk, a spray, bubbles and drops falling back.
        this.tone(fx, 'sine', [[0, 420], [0.16, 120]], pluck(0.003, 0.2), 0.16, t)
        this.noise(fx, 'lowpass', [[0, 4000], [0.4, 500]], 0, [[0, 0], [0.008, 1], [0.1, 0.5], [0.45, 0]], 0.18, t)
        for (const [i, f] of [700, 1000, 850].entries()) this.tone(fx, 'sine', [[0, f * 0.6], [0.04, f]], pluck(0.004, 0.07), 0.07, t + 0.18 + i * 0.1)
        for (let i = 0; i < 4; i++) this.tone(fx, 'sine', [[0, 1600 + 1000 * r()]], pluck(0.002, 0.05), 0.04, t + 0.3 + i * 0.08 + 0.04 * r())
        return
      case 'stepDone':
        // A step is done: two bells.
        this.bell(fx, GLASS, k(79), t, 0.6, 0.09)
        this.bell(fx, GLASS, k(84), t + 0.1, 0.8, 0.09)
        return
      case 'jobDone':
        // A job is done: a toy-trumpet fanfare and a sparkle on top.
        for (const [at2, m, dur] of [[0, 67, 0.12], [0.14, 72, 0.12], [0.28, 76, 0.12], [0.42, 79, 0.3], [0.8, 76, 0.12], [0.96, 84, 0.8]] as const) this.brass(fx, k(m), dur, t + at2, FANFARE_HORN.vol, FANFARE_HORN)
        this.bell(fx, GLASS, k(96), t + 0.96, 0.9, 0.04)
        this.bell(fx, GLASS, k(91), t + 1.08, 0.9, 0.04)
        return
      case 'wish':
        // Someone has a wish: three soft marimba notes up, like a question.
        for (const [i, m] of [72, 76, 81].entries()) {
          this.tone(fx, 'sine', [[0, k(m)]], pluck(0.003, 0.35), 0.12, t + i * 0.1)
          this.tone(fx, 'sine', [[0, k(m) * 3.95]], pluck(0.001, 0.05), 0.03, t + i * 0.1)
        }
        return
      case 'chapterDone': {
        // A chapter is done: a long fanfare, a held chord and a shower of sparkles.
        for (const [at2, m, dur] of [[0, 67, 0.14], [0.16, 72, 0.14], [0.32, 76, 0.14], [0.48, 79, 0.14], [0.64, 84, 0.3], [1, 79, 0.14], [1.16, 84, 0.14], [1.32, 88, 0.9]] as const) this.brass(fx, k(m), dur, t + at2, FANFARE_HORN.vol, FANFARE_HORN)
        for (const m of [72, 76, 79]) this.tone(fx, 'triangle', [[0, k(m)]], sustain(0.1, 0.7, 0.3), 0.035, t + 1.3)
        for (let i = 0; i < 8; i++) this.bell(fx, GLASS, k(84 + 2 * Math.floor(r() * 5)), t + 1.35 + 0.1 * i + 0.05 * r(), 0.5, 0.03)
        return
      }
      case 'moveIn':
        // Moving in: a knock-knock, then the doorbell ding-dong.
        for (const dt of [0, 0.16]) {
          this.tone(fx, 'sine', [[0, 190], [0.05, 140]], pluck(0.002, 0.07), 0.2, t + dt)
          this.noise(fx, 'bandpass', [[0, 1200]], 1, pluck(0.001, 0.02), 0.06, t + dt)
        }
        this.bell(fx, CHIME, k(84), t + 0.45, 0.8, 0.09)
        this.bell(fx, CHIME, k(79), t + 0.7, 1, 0.09)
        return
      case 'party': {
        // A party horn blown twice, a puff of confetti and a ta-da.
        for (const dt of [0, 0.22]) this.brass(fx, 600, 0.16, t + dt, 0.06, { ...FANFARE_HORN, cut: 2600, wobble: 18 })
        this.noise(fx, 'highpass', [[0, 3500]], 0.7, [[0, 0], [0.03, 1], [0.5, 0]], 0.05, t + 0.5)
        for (const [i, m] of [84, 88, 91].entries()) this.bell(fx, GLASS, k(m), t + 0.5 + i * 0.1, 0.8, 0.08)
        return
      }
      case 'fireworks':
        this.firework(t, 0.6)
        this.firework(t + 0.5, 0.9)
        this.firework(t + 1.1, 1)
        return
      case 'hint':
        // A gentle ting-a-ling: look here.
        this.bell(fx, GLASS, k(88), t, 0.8, 0.04)
        this.bell(fx, GLASS, k(91), t + 0.12, 0.9, 0.04)
        return
      case 'tap':
        // A soft pop for a press.
        this.tone(fx, 'sine', [[0, 800], [0.04, 600]], pluck(0.002, 0.06), 0.1, t)
        this.bell(fx, GLASS, k(84), t, 0.2, 0.05)
        return
      case 'select':
        // A bright bip-bip for a choice.
        this.tone(fx, 'triangle', [[0, k(79)]], pluck(0.004, 0.12), 0.12, t)
        this.bell(fx, GLASS, k(86), t + 0.07, 0.4, 0.07)
        return
      case 'buy': {
        // Cha-ching: a click of the till, two bells and a sparkle of coins.
        this.noise(fx, 'highpass', [[0, 3000]], 0.7, pluck(0.001, 0.04), 0.05, t)
        this.bell(fx, GLASS, k(88), t + 0.06, 0.9, 0.09)
        this.bell(fx, GLASS, k(91), t + 0.14, 1, 0.09)
        for (let i = 0; i < 3; i++) this.bell(fx, GLASS, k(93 + 3 * Math.floor(r() * 3)), t + 0.3 + i * 0.07, 0.3, 0.03)
        return
      }
      case 'clockStrike':
        // The clock tower strikes: a big round bell with a tick of the hammer.
        this.bell(fx, BIG_BELL, k(55), t, 2.4, 0.14)
        this.noise(fx, 'bandpass', [[0, 1800]], 1, pluck(0.001, 0.03), 0.05, t)
        return
      case 'iceCreamJingle': {
        // The ice cream van's music box, a short tune in the key.
        const tune = [79, 84, 88, 84, 86, 83, 79, 0, 81, 86, 89, 86, 88, 84, 79, 0, 84, 88, 91, 96] as const
        tune.forEach((m, i) => {
          if (m > 0) this.bell(fx, TINE, k(m), t + i * 0.15, i === tune.length - 1 ? 1.2 : 0.6, 0.07)
          if (i % 4 === 0) this.tone(fx, 'triangle', [[0, k(55 + (i % 8 === 0 ? 0 : 7))]], pluck(0.004, 0.3), 0.05, t + i * 0.15)
        })
        return
      }
      default:
        this.named(kind, t)
    }
  }

  /** The kinds that carry a machine's or an animal's name. */
  private named(kind: `horn-${MachineKind}` | `toot-${MachineKind}` | `voice-${Species}`, at: number) {
    const dash = kind.indexOf('-')
    const family = kind.slice(0, dash)
    const name = kind.slice(dash + 1)
    if (family === 'voice') {
      if (!isSpecies(name)) throw new Error(`no animal '${name}'`)
      for (const s of VOICES[name]) {
        const when = at + s.at
        const level: Path = [[0, 0], [0.015, 1], [s.dur * 0.7, 0.7], [s.dur, 0]]
        const voice = this.sing(this.effects, [[0, s.pitch[0]], [s.dur * 0.35, s.pitch[1]], [s.dur, s.pitch[2]]], level, s.vol, [[0, s.mouth[0]], [s.dur * 0.4, s.mouth[1]], [s.dur, s.mouth[0]]], when)
        if (s.flutter > 0) this.wobble(voice.map((o) => o.frequency), s.flutter, [[0, s.pitch[1] * 0.05]], when, s.dur)
      }
      return
    }
    if (!isMachine(name)) throw new Error(`no machine '${name}'`)
    const h = HORNS[name]
    const toot = family === 'toot'
    const notes: readonly Note[] = toot ? [[0, h.toot, 0.06], [0.1, h.toot, 0.07]] : h.notes
    for (const [dt, f, dur] of notes) this.brass(this.effects, f, dur, at + dt, toot ? h.vol * 0.7 : h.vol, h)
  }

  /** A little firework: a whistle up, a soft boom and a shower of twinkles in the key. */
  private firework(at: number, size: number) {
    const fx = this.effects
    const up = 0.32 + 0.08 * size
    this.tone(fx, 'sine', [[0, 700], [up, 1800 + 600 * size]], [[0, 0], [0.05, 1], [up - 0.02, 0.6], [up, 0]], 0.035, at)
    const boom = at + up
    this.tone(fx, 'sine', [[0, 150], [0.3, 48]], pluck(0.004, 0.36), 0.15 * size, boom)
    this.noise(fx, 'lowpass', [[0, 2400], [0.4, 280]], 0, [[0, 0], [0.006, 1], [0.42, 0]], 0.11 * size, boom)
    const shower = 0.6 + 0.6 * size
    for (let i = 0; i < Math.round(10 + 14 * size); i++) {
      const dt = 0.05 + shower * this.rand()
      const m = [84, 86, 88, 91, 93, 96, 98][Math.floor(this.rand() * 7)]
      this.bell(fx, GLASS, hz(m + this.key), boom + dt, 0.45, 0.012 + 0.04 * (1 - dt / (shower + 0.1)))
    }
  }

  /** The reversing beep: a soft round beep, one of the classic beep, beep, beep. It sounds on the loops' bus, so the microphone and the sound switch rule it. */
  reverseBeep(at: number) {
    const out = this.filter('lowpass', 2400, 0.7, this.loops)
    const level: Path = [[0, 0], [0.015, 1], [0.27, 0.9], [0.31, 0]]
    this.tone(out, 'sine', [[0, 980]], level, 0.05, at)
    this.tone(out, 'square', [[0, 980]], level, 0.01, at)
  }

  // -------------------------------------------------------------------------------------
  // The music.

  /** A tune's deck from step `step`, its first note at `at`, fading in. */
  deck(tune: TuneId, at: number, step: number): Deck {
    const score = TUNES[tune]
    const out = this.gain(0, this.dip)
    out.gain.setValueAtTime(0, at)
    out.gain.linearRampToValueAtTime(score.level, at + FADE_IN)
    return { tune, score, out, step, next: at }
  }

  /** Fades a deck out over `fade` seconds from `at`; its last notes ring out under the fade. */
  retire(deck: Deck, at: number, fade: number) {
    const g = deck.out.gain
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(0, at + fade)
  }

  /** Plays the deck's next slot at its time and moves the deck on one. */
  step(deck: Deck) {
    const { score } = deck
    const bar = score.bars[Math.floor(deck.step / SLOTS) % score.bars.length]
    const slot = deck.step % SLOTS
    const at = deck.next
    const eighth = 30 / score.bpm
    const chord = CHORDS[bar.chord]
    const out = deck.out
    if (bar.notes[slot] > 0) this.leadNote(out, score.lead, hz(bar.notes[slot] + score.key), bar.lengths[slot] * eighth, eighth, at)

    // The bass: its note an octave up from a bass, so a small speaker hears it.
    const step = score.bass.line[slot]
    if (step !== null) {
      const f = hz(38 + mod(chord.root + score.key - 2, 12) + step)
      const v = BASS_LEVEL[score.bass.voice]
      const dur = score.bass.len * eighth
      if (score.bass.voice === 'float') {
        const level = sustain(0.12, dur * 0.9, 0.3)
        this.tone(out, 'triangle', [[0, f * 2]], level, v * 0.9, at)
        this.tone(out, 'sine', [[0, f * 4]], level, v * 0.2, at)
      } else {
        this.tone(out, 'triangle', [[0, f]], pluck(0.005, dur * 0.9 + 0.1), v, at)
        this.tone(out, 'sine', [[0, f * 2]], pluck(0.005, dur * 0.5), v * 0.35, at)
      }
    }

    // The chords.
    const v = COMP_LEVEL[score.comp]
    if (score.comp === 'strum' && (slot === 2 || slot === 6)) {
      voicing(chord, score.key, 64).forEach((m, i) => this.tone(out, 'triangle', [[0, hz(m)]], pluck(0.002, 0.18), v, at + i * 0.012))
      this.noise(out, 'bandpass', [[0, 2600]], 1.5, pluck(0.001, 0.02), v * 0.5, at)
    } else if (score.comp === 'arp') {
      const notes = voicing(chord, score.key, 64)
      this.tone(out, 'sine', [[0, hz([...notes, ...notes.map((m) => m + 12)][ARP[slot]])]], pluck(0.003, 0.35), v, at)
    } else if (score.comp === 'pad' && slot === 0) {
      for (const m of voicing(chord, score.key, 57)) this.tone(out, 'triangle', [[0, hz(m)]], sustain(0.25, eighth * SLOTS * 0.85, 0.35), v, at)
    }

    // The drums.
    if (score.kit === 'march') {
      if (slot === 0 || slot === 4) this.kick(out, KIT_LEVEL.kick, at)
      if (slot === 2 || slot === 6) this.tone(out, 'sine', [[0, 900], [0.02, 700]], pluck(0.001, 0.05), KIT_LEVEL.tick, at)
      if (slot % 2 === 1) this.noise(out, 'highpass', [[0, 6500]], 0, [[0, 0], [0.012, 1], [0.05, 0]], KIT_LEVEL.tick * 0.6, at)
    } else if (score.kit === 'soft') {
      if (slot === 0) this.kick(out, KIT_LEVEL.kick * 0.7, at)
      if (slot === 2 || slot === 6) this.noise(out, 'bandpass', [[0, 2200], [0.12, 1600]], 0.6, [[0, 0], [0.02, 1], [0.16, 0]], KIT_LEVEL.tick, at)
    }
    deck.step += 1
    deck.next += eighth
  }

  /** A soft kick: a falling sine with a little knock on top for small speakers. */
  private kick(out: AudioNode, vol: number, at: number) {
    this.tone(out, 'sine', [[0, 140], [0.1, 48]], pluck(0.002, 0.14), vol, at)
    this.tone(out, 'triangle', [[0, 280], [0.03, 120]], pluck(0.001, 0.03), vol * 0.25, at)
  }

  /** A melody note `dur` long on the lead's instrument. */
  private leadNote(out: AudioNode, lead: Lead, f: number, dur: number, eighth: number, at: number) {
    const v = LEAD_LEVEL[lead]
    switch (lead) {
      case 'marimba':
        // A marimba bar: warm, with a knock four times up that dies at once.
        this.tone(out, 'sine', [[0, f]], pluck(0.002, Math.min(0.4 + dur, 1)), v, at)
        this.tone(out, 'sine', [[0, f * 3.95]], pluck(0.001, 0.06), v * 0.22, at)
        this.tone(out, 'sine', [[0, f * 2]], pluck(0.002, 0.2), v * 0.08, at)
        return
      case 'bell':
        // A music box's tine, ringing long.
        this.bell(out, TINE, f, at, Math.max(1.5, dur), v)
        return
      case 'flute': {
        // A soft flute: a breath at the start and a vibrato that comes in late.
        const end = Math.max(dur, eighth)
        const level: Path = [[0, 0], [0.07, 1], [end * 0.85, 0.8], [end + 0.25, 0]]
        const a = this.tone(out, 'sine', [[0, f]], level, v, at)
        const b = this.tone(out, 'triangle', [[0, f]], level, v * 0.25, at)
        this.wobble([a.frequency, b.frequency], 5, [[0, 0], [0.25, 0], [0.5, f * 0.007]], at, end + 0.25)
        this.noise(out, 'bandpass', [[0, f * 2]], 2, pluck(0.02, 0.1), v * 0.3, at)
        return
      }
      case 'toy':
        // A toy piano: a bright short pluck with a tinkle on top.
        this.tone(this.filter('lowpass', 3200, 0.7, out), 'square', [[0, f]], pluck(0.002, 0.3), v * 0.35, at)
        this.tone(out, 'sine', [[0, f]], pluck(0.002, 0.3), v, at)
        this.tone(out, 'sine', [[0, f * 4]], pluck(0.001, 0.08), v * 0.12, at)
        return
    }
  }

  // -------------------------------------------------------------------------------------
  // The loops.

  /** A loop from its recipe, from `at`, silent until setLayer gives it a level. */
  layer(spec: LayerSpec, at: number): Layer {
    const ctx = this.ctx
    const amp = this.gain(0, this.loops)
    const filter = this.filter(spec.filter, spec.cut[0], spec.q, amp)
    const tones = spec.tones.map(([wave, ratio, level]) => {
      const o = ctx.createOscillator()
      o.type = wave
      o.frequency.value = spec.hz * ratio
      o.connect(this.gain(level, filter))
      o.start(at)
      return o
    })
    if (spec.noise > 0) {
      const src = ctx.createBufferSource()
      src.buffer = this.white
      src.loop = true
      src.connect(this.gain(spec.noise, filter))
      src.start(at)
    }
    // The chug: a slow sine swinging the level up and down around itself.
    const chug = ctx.createOscillator()
    chug.frequency.value = spec.chug[0]
    const depth = ctx.createGain()
    depth.gain.value = 0
    chug.connect(depth)
    depth.connect(amp.gain)
    chug.start(at)
    return { spec, amp, filter, tones, chug, depth }
  }

  /** A loop at `level` (0 to 1) from `at`, gliding there: louder, brighter, faster and a little higher, bent by `shape`. */
  setLayer(layer: Layer, level: number, at: number, shape: Shape) {
    const { spec } = layer
    const l = clamp01(level)
    const tau = 0.08
    const loud = spec.gain * l
    layer.amp.gain.setTargetAtTime(loud, at, tau)
    layer.depth.gain.setTargetAtTime(loud * spec.depth, at, tau)
    layer.filter.frequency.setTargetAtTime(lerp(spec.cut[0], spec.cut[1], l) * shape.bright, at, tau)
    layer.chug.frequency.setTargetAtTime(lerp(spec.chug[0], spec.chug[1], l) * shape.rate, at, tau)
    layer.tones.forEach((o, i) => o.frequency.setTargetAtTime(spec.hz * spec.tones[i][1] * shape.pitch * (1 + spec.rise * l), at, tau))
  }

  // -------------------------------------------------------------------------------------
  // The parts every voice is made of.

  /** A brass note: a saw (or the horn's wave) and a triangle through a lowpass, a scoop up into the pitch, a second voice and a vibrato if the horn has them. */
  private brass(out: AudioNode, f: number, dur: number, at: number, vol: number, h: Honk) {
    const mouth = this.filter('lowpass', h.cut, 1.1, out)
    const level = h.struck ? pluck(0.008, dur + 0.35) : sustain(0.015, dur, 0.06)
    const voices = [this.tone(mouth, h.wave, [[0, f * 0.96], [0.04, f]], level, vol, at), this.tone(mouth, 'triangle', [[0, f * 1.004]], level, vol * 0.6, at)]
    if (h.second > 0) voices.push(this.tone(mouth, h.wave, [[0, f * h.second]], level, vol * 0.7, at))
    if (h.wobble > 0) this.wobble(voices.map((o) => o.frequency), h.wobble, [[0, f * 0.015]], at, dur + 0.1)
  }

  /** A little cartoon voice: a buzzy saw through a mouth (a band whose middle follows `mouth`) and a pure sine under it, both along `pitch`. Returns both, to wobble them. */
  private sing(out: AudioNode, pitch: Path, level: Path, vol: number, mouth: Path, at: number): OscillatorNode[] {
    const band = this.ctx.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 1.4
    glide(band.frequency, mouth, at, 1)
    band.connect(out)
    return [this.tone(band, 'sawtooth', pitch, level, vol, at), this.tone(out, 'sine', pitch, level, vol * 0.5, at)]
  }

  /** A struck bell or bar: a sine per partial, the higher ones dying sooner; a partial too high to hear is left out. */
  private bell(out: AudioNode, partials: Partials, f: number, at: number, dur: number, vol: number) {
    partials.forEach(([ratio, level], i) => {
      if (f * ratio < TOP_HZ) this.tone(out, 'sine', [[0, f * ratio]], pluck(0.002, dur / (1 + i * 0.8)), vol * level, at)
    })
  }

  /** One oscillator: its pitch along `pitch` (Hz), its level along `level` times `vol`, into `out` from `at` until the level ends. */
  private tone(out: AudioNode, wave: OscillatorType, pitch: Path, level: Path, vol: number, at: number): OscillatorNode {
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

  /** A stretch of the white noise through one filter whose cutoff follows `freq`, its level along `level` times `vol`. */
  private noise(out: AudioNode, type: BiquadFilterType, freq: Path, q: number, level: Path, vol: number, at: number) {
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
  private dipMusic(at: number, hold: number) {
    const g = this.dip.gain
    const until = Math.max(this.dippedUntil, at + hold)
    this.dippedUntil = until
    g.cancelScheduledValues(at)
    g.setValueAtTime(g.value, at)
    g.linearRampToValueAtTime(DIP, at + 0.08)
    g.setValueAtTime(DIP, until)
    g.linearRampToValueAtTime(1, until + 0.7)
  }

  private filter(type: BiquadFilterType, freq: number, q: number, out: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    f.connect(out)
    return f
  }

  private gain(value: number, out: AudioNode): GainNode {
    const g = this.ctx.createGain()
    g.gain.value = value
    g.connect(out)
    return g
  }

  /** The room's echo: noise dying away and darkening as it goes, in two channels a little apart. */
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
        data[i] = smooth * Math.exp(-s / 0.4) * Math.min(1, s / 0.012)
      }
    }
    return buffer
  }
}

// ---------------------------------------------------------------------------------------
// The game's sounds.

/**
 * Browsers make no sound before the page is touched, so nothing here makes an AudioContext
 * until the first `unlock` (called on every press); until then `play` does nothing and the
 * setters only remember what they were asked, so the right tune starts with the first touch.
 *
 * One clock wakes every CLOCK_MS: it schedules every tune step due within LOOKAHEAD (a clock
 * that slept skips ahead instead of catching up in a burst) and the reversing beeps. A tune
 * that stops remembers its place and carries on from the start of its phrase.
 *
 * `suspend` is for a hidden page: the context sleeps and `play` is ignored until `resume`.
 */
export class Sounds {
  private ctx: AudioContext | null = null
  private synth: Synth | null = null
  private soundOn = true
  private musicOn = true
  private listening = false
  private paused = false
  private loops: Loops = QUIET
  private deck: Deck | null = null
  private timer: ReturnType<typeof setTimeout> | undefined = undefined
  /** Where each tune stopped, as the step to carry on from. */
  private resumeAt: Partial<Record<TuneId, number>> = {}
  private layers: Partial<Record<LayerKey, Layer>> = {}
  /** What each loop was last told: level, pitch, brightness, rate. */
  private applied: Partial<Record<LayerKey, readonly number[]>> = {}
  private beepAt = -1
  /** Context time each kind last sounded. */
  private last = new Map<SoundKind, number>()

  /** Makes the context on the first press and wakes it whenever it is not running (iOS also has 'interrupted'), unless the page is suspended. */
  unlock() {
    if (this.ctx === null) {
      const ctx = new AudioContext()
      const synth = new Synth(ctx)
      this.ctx = ctx
      this.synth = synth
      const now = ctx.currentTime
      synth.setSound(this.soundOn, now)
      synth.setMusic(this.musicOn, now)
      synth.setListening(this.listening, now)
      ctx.addEventListener('statechange', () => this.stateChanged(ctx))
      this.keep(synth)
      if (!this.paused) this.runClock(synth)
    }
    if (!this.paused && this.ctx.state !== 'running') void this.ctx.resume()
  }

  /** The system took the context away (iOS does while the microphone holds the audio session, or for a call): take it back at once when sound is wanted on a visible page; `unlock` tries again on the next gesture if the browser refuses. */
  private stateChanged(ctx: AudioContext) {
    const state: string = ctx.state
    if ((state === 'suspended' || state === 'interrupted') && !this.paused && (this.soundOn || this.musicOn)) void ctx.resume()
  }

  /** One sound, now; the same kind again within its dedup time is dropped. */
  play(kind: SoundKind) {
    const synth = this.synth
    if (synth === null || this.paused) return
    const now = synth.ctx.currentTime
    const last = this.last.get(kind)
    const gap = kind.startsWith('horn-') || kind.startsWith('toot-') ? HORN_DEDUP : (DEDUP_FOR[kind] ?? DEDUP)
    if (last !== undefined && now - last < gap) return
    this.last.set(kind, now)
    synth.effect(kind, now + START)
  }

  /** Called every frame with what should be sounding: a tune starts or changes only when it changes, the loops glide to their levels. */
  setLoops(loops: Loops) {
    for (const [name, v] of [['friendEngines', loops.friendEngines], ['hydraulic', loops.hydraulic], ['pour', loops.pour], ['drum', loops.drum], ['shake', loops.shake], ['plant', loops.plant], ['water', loops.water], ['push', loops.push], ['rev', loops.engine === null ? 0 : loops.engine.rev]] as const) {
      if (!Number.isFinite(v)) throw new Error(`the ${name} loop is ${v}: it is a number from 0 to 1`)
    }
    this.loops = loops
    if (this.synth !== null) this.keep(this.synth)
  }

  /** The microphone is on: music and engines go to a third. */
  setDuck(on: boolean) {
    this.listening = on
    if (this.synth !== null) this.synth.setListening(on, this.synth.ctx.currentTime)
  }

  /** Sound effects and engines on or off; the music has its own switch. */
  setSound(on: boolean) {
    this.soundOn = on
    if (this.synth !== null) this.synth.setSound(on, this.synth.ctx.currentTime)
  }

  setMusic(on: boolean) {
    this.musicOn = on
    if (this.synth !== null) this.synth.setMusic(on, this.synth.ctx.currentTime)
  }

  /** The page is hidden: the clock stops and the context sleeps. */
  suspend() {
    this.paused = true
    clearTimeout(this.timer)
    if (this.ctx !== null) void this.ctx.suspend()
  }

  resume() {
    this.paused = false
    if (this.ctx === null || this.synth === null) return
    void this.ctx.resume()
    this.runClock(this.synth)
  }

  /** Brings the tune and the loops to what the last setLoops asked for. */
  private keep(synth: Synth) {
    const now = synth.ctx.currentTime
    const l = this.loops
    const wanted = l.tune
    if ((this.deck === null ? null : this.deck.tune) !== wanted) {
      if (this.deck !== null) {
        this.resumeAt[this.deck.tune] = this.deck.step - (this.deck.step % (SLOTS * 4))
        synth.retire(this.deck, now, wanted === null ? FADE_OUT : CROSSFADE)
        this.deck = null
      }
      if (wanted !== null) {
        synth.key = TUNES[wanted].key
        this.deck = synth.deck(wanted, now + LEAD_IN, this.resumeAt[wanted] ?? 0)
      }
    }
    const e = l.engine === null ? null : ENGINES[l.engine.kind]
    const rev = l.engine === null ? 0 : clamp01(l.engine.rev)
    const targets: Record<LayerKey, readonly number[]> = {
      engine: e === null ? [0, 1, 1, 1] : [0.2 + 0.8 * rev, e.pitch * (0.8 + 0.5 * rev), e.bright, e.chug],
      friends: [l.friendEngines, 1, 1, 1],
      hydraulic: [l.hydraulic, 1, 1, 1],
      pour: [l.pour, 1, 1, 1],
      water: [l.water, 1, 1, 1],
      drum: [l.drum, 1, 1, 1],
      shake: [l.shake, 1, 1, 1],
      plant: [l.plant, 1, 1, 1],
      push: [l.push, 1, 1, 1],
    }
    for (const key of LAYER_KEYS) {
      const t = targets[key].map((v, i) => (i === 0 ? clamp01(v) : v))
      const was = this.applied[key]
      if (was === undefined && t[0] === 0) continue
      // Small changes wait until they add up; reaching still always counts, so no faint loop is left behind.
      if (was !== undefined && !(t[0] === 0 && was[0] !== 0) && t.every((v, i) => Math.abs(v - was[i]) < 0.01)) continue
      let layer = this.layers[key]
      if (layer === undefined) {
        layer = synth.layer(LAYERS[key], now)
        this.layers[key] = layer
      }
      synth.setLayer(layer, t[0], now, { pitch: t[1], bright: t[2], rate: t[3] })
      this.applied[key] = t
    }
  }

  private runClock(synth: Synth) {
    clearTimeout(this.timer)
    this.tick(synth)
  }

  /** The clock: schedules every tune step and beep due within LOOKAHEAD, then sleeps CLOCK_MS. */
  private tick(synth: Synth) {
    const now = synth.ctx.currentTime
    const deck = this.deck
    if (deck !== null) {
      // The timer slept (a background tab, a busy page): skip ahead rather than catch up in a burst.
      if (deck.next < now) deck.next = now + LEAD_IN
      while (deck.next < now + LOOKAHEAD) synth.step(deck)
    }
    if (this.loops.beep) {
      if (this.beepAt < now) this.beepAt = now + START
      while (this.beepAt < now + LOOKAHEAD) {
        synth.reverseBeep(this.beepAt)
        this.beepAt += BEEP_EVERY
      }
    } else this.beepAt = -1
    this.timer = setTimeout(() => this.tick(synth), CLOCK_MS)
  }
}
