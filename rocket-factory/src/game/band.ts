import { COUNT_AT } from './catalog'
import { HOP, HZ, STEP, ticks, type Building, type Kind, type Land, type State } from './model'

/**
 * The factory's band (plans/rocket-factory.md, Sound): the song, which of its parts play now
 * as a pure function of the state (`bandOf`), and the notes each part plays on each eighth
 * (`notesAt`). sounds.ts plays them on the audio clock; the renderer moves each working
 * machine on its part's notes (`sinceNote`), and a machine's music notes fly to a burrow on
 * its part's beat (BEAT). Nothing here touches audio or feeds the sim: the sim never waits for
 * the band.
 *
 * The band's eighth note is a belt's hop, HOP ticks at 90 quarter notes a minute: eighth k
 * starts at tick k * HOP, so machines start and finish on its notes. The song runs on the
 * sim's own clock from tick 0, and the same state always plays the same notes.
 *
 * Each kind of working machine plays one part: diggers a shaker, ovens a soft bass, the
 * workshop a woodblock, green bottle makers a bell (the tune), the orange bottle maker a
 * glockenspiel (a descant over it), the lab chimes, the pump a pluck. Things riding the belts
 * tick softly on the beat, a visit adds a cheeky pizzicato line and the drumming pad its big
 * drum. A muncher napping on a machine turns its part into a kazoo of the same line.
 *
 * Everything is in F major over its pentatonic, F G A C D. The tunes, the chimes, the plucks
 * and the tuned percussion stay on the pentatonic and only the bass walks the chords' roots
 * and fifths, so any parts together, and any chime of the effects (sounds.ts, on the same
 * pentatonic), sound well. Every tune is original.
 */

/** The band's eighth note in seconds: one hop, at 90 quarter notes a minute. */
export const EIGHTH = HOP * STEP
export const BPM = 30 / EIGHTH

/** The band's instruments: a part for each kind of working machine, the belts' tick, the visit's pizzicato, the pad's big drum, the music box (the lullaby, the flight) and the launch's drum roll. The order is the score's: the parts' notes come out in it. */
export const INSTRUMENTS = ['tick', 'shaker', 'bass', 'woodblock', 'bell', 'chimes', 'pluck', 'glock', 'drum', 'pizzicato', 'box', 'roll'] as const
export type Instrument = (typeof INSTRUMENTS)[number]

/** Each kind of machine's part: what its working machines play. Towers and bowls play none. */
export const PART_OF = {
  digger: 'shaker',
  oven: 'bass',
  workshop: 'woodblock',
  greenMaker: 'bell',
  orangeMaker: 'glock',
  lab: 'chimes',
  pump: 'pluck',
  pad: 'drum',
} as const satisfies Partial<Record<Kind, Instrument>>

/**
 * Each part's beat: the eighth of the bar its one soft hit falls on with the music off, and
 * that a machine's music note flies to a burrow on (at most one a bar). A round through the
 * bar, so the hits of a busy factory never land together. A six-eight bar takes it modulo 6.
 */
export const BEAT: Record<Instrument, number> = { bass: 0, drum: 0, roll: 0, shaker: 1, woodblock: 2, chimes: 3, pizzicato: 3, bell: 4, box: 4, pluck: 5, glock: 6, tick: 7 }

/** Music off: each part that plays sounds once a bar on its beat, this hard. */
export const SOFT = 0.6
/** Evening falls with a slow chime (sounds.ts) and the lullaby begins this long after dusk. */
export const NIGHT_LEAD = ticks(2)
/** The rocket lifts this long after the launch's tap: the count runs from 5 to 1, a second each, from COUNT_AT. */
export const LIFTOFF = COUNT_AT + ticks(5)
/** After a new session the parts rejoin the song one by one over REJOIN, in this order. */
export const REJOIN = ticks(4)
const REJOINS: readonly Instrument[] = ['tick', 'shaker', 'bass', 'woodblock', 'bell', 'chimes', 'pluck', 'glock', 'drum']
/** A kazoo plays an unpitched part on the chord's first tone in this octave (MIDI). */
export const KAZOO_LOW = 60

// ---------------------------------------------------------------------------------------
// Who plays

/**
 * A machine is working while a batch is in progress, nobody naps on it and it is not tucked
 * in for the night: what its part plays, what the eye sees move and what wakes the munchers
 * (machines.ts and munchers.ts use this one rule). The lab works while it drinks, so
 * machines.ts runs each drink as a batch of LAB_DRINK.
 */
export const working = (b: Building) => b.batch !== null && b.napper === -1 && !b.tucked

/** The pad drums from Rocket! until the rocket flies, unless it is tucked in: its big drum plays, and it counts for every burrow's hunger (catalog.ts HUNGER.pad). */
export function padDrums(s: State): boolean {
  const pad = s.buildings.find((b) => b.kind === 'pad')
  if (!pad) throw new Error('the board has no pad')
  return s.found.includes('rocket') && s.launches === 0 && !pad.tucked
}

/** Things ride the belts: a thing moved on the last hop (a full belt standing still is quiet). */
function beltsRun(s: State): boolean {
  const { slot, from } = s.belts
  for (let i = 0; i < slot.length; i++) if (slot[i]! >= 0 && from[i] !== i) return true
  return false
}

/** What the band plays: the factory's song, the Good night lullaby, the launch's drum roll, the flight's tune, or nothing (the factory asleep). */
export type PieceName = 'song' | 'lullaby' | 'roll' | 'flight' | 'none'

/** Which parts of the song play now. */
export interface Band {
  piece: PieceName
  /** The eighth the piece's first bar starts on: 0 for the song, which runs with the sim's own clock; the lullaby's after dusk, the roll's at the tap, the flight's at liftoff. */
  from: number
  /** The song has a new arrangement for each land. */
  land: Land
  /** The parts playing their own line, in INSTRUMENTS order: a machine of their kind works (the drum: the pad drums; the tick: things ride the belts; the pizzicato: a visit is out). */
  play: Instrument[]
  /** The machine parts a napping muncher turns into a kazoo of the same line. A kind with one machine napped on and another working plays both: its own part goes on for the working one, and the kazoo tells her where the muncher sleeps. */
  kazoo: Instrument[]
}

const eighthFrom = (tick: number) => Math.ceil(tick / HOP)

/**
 * The parts that play now. The launch hushes the factory to a drum roll and then the flight's
 * tune; Good night turns the song into the lullaby, where each kind tucked in leaves it, until
 * the last is in and the band rests. Otherwise each kind with a working machine plays its
 * part and each kind napped on its kazoo, with nothing working nothing plays, and after a new
 * session the parts rejoin one by one.
 */
export function bandOf(s: State): Band {
  if (s.launch) {
    const lift = s.launch.at + LIFTOFF
    if (s.tick < lift) return { piece: 'roll', from: eighthFrom(s.launch.at), land: s.land, play: ['roll'], kazoo: [] }
    return { piece: 'flight', from: eighthFrom(lift), land: s.land, play: ['bass', 'chimes', 'box'], kazoo: [] }
  }
  if (s.night && s.night.doneAt >= 0) return { piece: 'none', from: 0, land: s.land, play: [], kazoo: [] }
  const play = new Set<Instrument>()
  const kazoo = new Set<Instrument>()
  for (const b of s.buildings) {
    const kind = b.kind
    if (kind === 'pad' || kind === 'tower' || kind === 'bowl') continue
    if (working(b)) play.add(PART_OF[kind])
    if (b.napper !== -1) kazoo.add(PART_OF[kind])
  }
  if (padDrums(s)) play.add('drum')
  if (beltsRun(s)) play.add('tick')
  if (s.night) play.add('box')
  else if (s.visit) play.add('pizzicato')
  // The first part is back at once and the last REJOIN after the session began.
  const back = s.tick - s.sessionAt
  const rejoined = (i: Instrument) => {
    const rank = REJOINS.indexOf(i)
    return rank < 0 || back * (REJOINS.length - 1) >= rank * REJOIN
  }
  return {
    piece: s.night ? 'lullaby' : 'song',
    from: s.night ? eighthFrom(s.night.at + NIGHT_LEAD) : 0,
    land: s.land,
    play: INSTRUMENTS.filter((i) => play.has(i) && rejoined(i)),
    kazoo: INSTRUMENTS.filter((i) => kazoo.has(i)),
  }
}

// ---------------------------------------------------------------------------------------
// The score: chords, written lines and patterns

/** The pitch classes of F major, and of its pentatonic (F G A C D), which every part but the bass keeps to. */
export const MAJOR = [5, 7, 9, 10, 0, 2, 4] as const
export const PENTATONIC = [5, 7, 9, 0, 2] as const
/** The i-th note of the F major pentatonic counted up from F4 (MIDI): the effects' chimes climb it. */
export const penta = (i: number) => 65 + [0, 2, 4, 7, 9][i % 5]! + 12 * Math.floor(i / 5)

/**
 * The chords, all in F major: the root as a pitch class, the third above it (the fifth is
 * always 7 up), and the chord's tones on the pentatonic that the chord parts step through,
 * so a C chord's E and a B flat chord's root are left to the bass.
 */
export const CHORDS = {
  F: { root: 5, third: 4, tones: [5, 9, 0] },
  Gm: { root: 7, third: 3, tones: [7, 2, 5] },
  Am: { root: 9, third: 3, tones: [9, 0, 7] },
  Bb: { root: 10, third: 4, tones: [2, 5, 9] },
  C: { root: 0, third: 4, tones: [0, 7, 2] },
  Dm: { root: 2, third: 3, tones: [2, 5, 9] },
} as const
export type Chord = keyof typeof CHORDS

/** A note starting on an eighth: its pitch (what it means is the part's), how many eighths it rings, how hard (0 to 1). */
export interface Strike {
  pitch: number
  len: number
  vel: number
}
/** One bar of a part: the strike starting on each eighth, or null. */
export type Pattern = readonly (Strike | null)[]

/**
 * One part of a piece. `pitch` says what a strike's pitch is: a MIDI note plus `base`
 * ('midi', a written line or tuned percussion, 0 for no pitch), the strike's step up through
 * the bar's chord tones from the note `base` up ('chord'), or semitones over the bar's chord
 * root in the bass from `base` up ('bass'). `kazoo` is the octave shift its kazoo plays in.
 */
export interface Part {
  /** One bar repeated, a few in turn (the drum's fill every fourth bar), or one per bar of the piece (a written line). */
  bars: readonly Pattern[]
  pitch: 'midi' | 'chord' | 'bass'
  base: number
  vel: number
  kazoo: number
}

/** A piece: its meter (eighths a bar: 8 is four four, 6 the lullaby's rocking six eight), a chord a bar (it is this many bars long, then goes round), and its parts. */
export interface Piece {
  meter: 6 | 8
  chords: readonly Chord[]
  parts: Partial<Record<Instrument, Part>>
}

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }

/**
 * Reads bars written a bar per string, a word per eighth: a strike (`read` says what its word
 * means), '-' to hold the strike before (across a bar line too) or '.' for silence. Throws on
 * a bar of another length, a hold with nothing to hold, or a word `read` does not know.
 */
function score(meter: number, written: readonly string[], read: (word: string) => { pitch: number; vel: number }): Pattern[] {
  let held: Strike | null = null
  return written.map((text, b) => {
    const words = text.split(' ').filter((w) => w !== '')
    if (words.length !== meter) throw new Error(`bar ${b + 1} has ${words.length} eighths, not ${meter}: ${text}`)
    return words.map((w) => {
      if (w === '-') {
        if (!held) throw new Error(`bar ${b + 1}: a '-' with nothing to hold`)
        held.len += 1
        return null
      }
      if (w === '.') {
        held = null
        return null
      }
      held = { ...read(w), len: 1 }
      return held
    })
  })
}

/** A note word: a letter and an octave, C4 being MIDI 60. */
function note(w: string) {
  const m = /^([A-G])([0-8])$/.exec(w)
  if (!m) throw new Error(`'${w}' is not a note: write a letter and an octave, like C5`)
  return { pitch: LETTER[m[1]!]! + 12 * (Number(m[2]) + 1), vel: 1 }
}
/** A step up the chord's tones, 0 the lowest at or over the part's base. */
function step(w: string) {
  if (!/^[0-7]$/.test(w)) throw new Error(`'${w}' is not a chord step: write 0 to 7`)
  return { pitch: Number(w), vel: 1 }
}
/** A pattern's kit: what each of its letters plays, its pitch and how hard. */
const kit = (letters: Record<string, readonly [number, number]>) => (w: string) => {
  const hit = letters[w]
  if (!hit) throw new Error(`'${w}' is not one of ${Object.keys(letters).join(' ')}`)
  return { pitch: hit[0], vel: hit[1] }
}

/** The bass's lowest root (D2), and its words: the root, the fifth above it, the octave. */
const BASS_LOW = 38
const BASS = kit({ r: [0, 1], f: [7, 1], o: [12, 1] })
/** The percussion, tuned to the key: the shaker and the roll have no pitch, the woodblock's two blocks, the belts' tick, the pad's big drum and its toms. */
const SHAKER = kit({ x: [0, 0.6], X: [0, 1] })
const WOODBLOCK = kit({ h: [84, 1], l: [79, 1] })
const TICK = kit({ x: [96, 1] })
const DRUM = kit({ B: [41, 1], b: [41, 0.6], t: [60, 0.7], m: [53, 0.7] })
const ROLL = kit({ p: [0, 0.35], m: [0, 0.6], f: [0, 0.9] })

const written = (meter: number, bars: readonly string[], shift: number, vel: number, kazoo: number): Part => ({ bars: score(meter, bars, note), pitch: 'midi', base: shift, vel, kazoo })
const chordPart = (meter: number, bar: string, base: number, vel: number, kazoo: number): Part => ({ bars: score(meter, [bar], step), pitch: 'chord', base, vel, kazoo })
const bassPart = (meter: number, bar: string, vel: number): Part => ({ bars: score(meter, [bar], BASS), pitch: 'bass', base: BASS_LOW, vel, kazoo: 12 })
const hitPart = (meter: number, bars: readonly string[], letters: (w: string) => { pitch: number; vel: number }, vel: number, kazoo: number): Part => ({ bars: score(meter, bars, letters), pitch: 'midi', base: 0, vel, kazoo })

/** A section of the song: its chords and its three written lines, the tune (bell), the descant over it (glockenspiel) and the visit's cheeky line (pizzicato). */
interface Section {
  chords: readonly Chord[]
  bell: readonly string[]
  glock: readonly string[]
  pizzicato: readonly string[]
}

/** A: the factory's tune, "sol mi do re mi", that comes home to the fifth twice. */
const A: Section = {
  chords: ['F', 'Dm', 'Bb', 'C', 'F', 'Dm', 'Gm', 'C'],
  bell: [
    'C6 -  A5 -  F5 G5 A5 -',
    'D5 -  F5 -  A5 -  G5 F5',
    'D6 -  C6 -  A5 -  F5 -',
    'G5 -  -  -  .  .  .  .',
    'C6 -  A5 -  F5 G5 A5 -',
    'D5 -  F5 -  A5 -  C6 -',
    'D6 -  C6 A5 G5 -  A5 -',
    'G5 -  -  -  .  .  .  .',
  ],
  glock: [
    'F6 -  -  -  .  .  C6 -',
    'D6 -  -  -  .  .  F6 -',
    'F6 -  -  -  .  .  D6 -',
    'C6 -  D6 -  G6 -  A6 -',
    'A6 -  -  -  .  .  G6 -',
    'F6 -  -  -  .  .  D6 -',
    'D6 -  -  -  .  .  G6 -',
    'G6 -  A6 -  C7 -  .  .',
  ],
  pizzicato: [
    'F3 .  .  F3 A3 .  C4 .',
    'D4 .  .  D4 C4 .  A3 .',
    'D4 .  .  D4 F4 .  D4 .',
    'C4 .  G3 .  C4 .  .  .',
    'F3 .  .  F3 A3 .  C4 .',
    'A3 .  .  D4 F4 .  D4 .',
    'G3 .  .  G3 D4 .  G4 .',
    'G4 .  D4 .  C4 .  .  .',
  ],
}

/** B: longer notes from the fourth chord, rising to the top and down home. */
const B: Section = {
  chords: ['Bb', 'C', 'Am', 'Dm', 'Bb', 'C', 'F', 'C'],
  bell: [
    'F5 -  -  G5 A5 -  C6 -',
    'D6 -  -  -  C6 -  G5 -',
    'A5 -  -  C6 A5 -  G5 -',
    'F5 -  -  -  D5 -  .  .',
    'F5 -  -  G5 A5 -  D6 -',
    'C6 -  -  D6 C6 -  G5 -',
    'A5 -  G5 -  F5 -  G5 -',
    'G5 -  -  -  .  .  .  .',
  ],
  glock: [
    'D6 -  -  -  .  .  F6 -',
    'G6 -  -  -  .  .  .  .',
    'C6 -  -  -  .  .  A6 -',
    'A6 -  G6 -  F6 -  D6 -',
    'D6 -  -  -  .  .  F6 -',
    'G6 -  -  -  .  .  .  .',
    'C7 -  -  -  A6 -  -  -',
    'G6 -  A6 -  G6 -  .  .',
  ],
  pizzicato: [
    'D4 .  .  F4 D4 .  .  C4',
    'G3 .  .  C4 D4 .  .  .',
    'A3 .  .  C4 A3 .  G3 .',
    'D4 .  F4 .  A4 .  .  .',
    'D4 .  .  F4 D4 .  .  C4',
    'G3 .  .  C4 D4 .  G4 .',
    'A4 .  G4 .  F4 .  C4 .',
    'D4 .  C4 .  G3 .  .  .',
  ],
}

/** The song's long form: A, A, B, A, 32 bars (about 85 seconds), then round again. */
export const FORM = [A, A, B, A] as const
const lines = (sections: readonly Section[], line: 'bell' | 'glock' | 'pizzicato') => sections.flatMap((sec) => sec[line])

/** The written lines every land's arrangement shares: the tune, the descant and the visit's line. The two bottle makers' kazoos sit an octave apart, so a nap on either is its own sound. */
const TUNE = written(8, lines(FORM, 'bell'), 0, 1, -12)
const DESCANT = written(8, lines(FORM, 'glock'), 0, 0.9, -12)
const SNEAK = written(8, lines(FORM, 'pizzicato'), 0, 1, 12)

/** An arrangement: the accompanying parts, one bar each (the drum's groove three bars and its fill the fourth). */
interface Arrangement {
  bass: string
  shaker: string
  woodblock: string
  tick: string
  pluck: string
  chimes: string
  drum: readonly [string, string]
}

/** A new arrangement for each land: the first factory's gentle one, a walking bass and a busier shaker for land 2, a groove for the whole board. */
const ARRANGEMENTS: Record<Land, Arrangement> = {
  1: {
    bass: 'r -  -  -  f -  -  -',
    shaker: '. x  .  x  . x  .  x',
    woodblock: '. .  h  .  . .  l  .',
    tick: 'x .  x  .  x .  x  .',
    pluck: '0 .  1  .  2 .  1  .',
    chimes: '3 -  -  -  - -  -  -',
    drum: ['B . . . b . . .', 'B . . . t . m .'],
  },
  2: {
    bass: 'r -  f  -  o -  f  -',
    shaker: 'x X  x  X  x X  x  X',
    woodblock: '. .  h  .  . l  h  .',
    tick: 'x .  x  .  x .  x  .',
    pluck: '0 1  2  1  0 1  2  1',
    chimes: '3 -  -  -  4 -  -  -',
    drum: ['B . . . B . . .', 'B . t . t m m .'],
  },
  3: {
    bass: 'r -  -  r  f -  o  -',
    shaker: 'x .  X  x  x .  X  x',
    woodblock: 'h .  .  l  . h  l  .',
    tick: 'x .  x  .  x .  x  .',
    pluck: '0 2  1  3  2 4  3  1',
    chimes: '3 4  5  -  - -  4  -',
    drum: ['B . . b B . . .', 'B . t t m m B .'],
  },
}

/** The pluck's notes start from C4, the lab's chimes from F5. */
const PLUCK_BASE = 60
const CHIMES_BASE = 77

/** The factory's song, as each land arranges it. */
export const SONG: Record<Land, Piece> = Object.fromEntries(
  ([1, 2, 3] as const).map((land) => {
    const a = ARRANGEMENTS[land]
    const piece: Piece = {
      meter: 8,
      chords: FORM.flatMap((sec) => sec.chords),
      parts: {
        tick: hitPart(8, [a.tick], TICK, 0.7, -36),
        shaker: hitPart(8, [a.shaker], SHAKER, 1, 0),
        bass: bassPart(8, a.bass, 1),
        woodblock: hitPart(8, [a.woodblock], WOODBLOCK, 1, -24),
        bell: TUNE,
        chimes: chordPart(8, a.chimes, CHIMES_BASE, 1, -24),
        pluck: chordPart(8, a.pluck, PLUCK_BASE, 1, 0),
        glock: DESCANT,
        drum: hitPart(8, [a.drum[0], a.drum[0], a.drum[0], a.drum[1]], DRUM, 1, 24),
        pizzicato: SNEAK,
      },
    }
    return [land, piece]
  }),
) as Record<Land, Piece>

/** The Good night lullaby, rocking in six eight on a music box, with every machine part still awake playing softly along. */
const LULLABY: Piece = {
  meter: 6,
  chords: ['F', 'Bb', 'F', 'C', 'Dm', 'Bb', 'Gm', 'C', 'F', 'Bb', 'F', 'Dm', 'Bb', 'C', 'F', 'F'],
  parts: {
    box: written(
      6,
      [
        'C5 -  -  F5 -  A5',
        'G5 -  -  F5 -  -',
        'A5 -  -  C6 -  A5',
        'G5 -  -  -  -  -',
        'F5 -  -  A5 -  F5',
        'D5 -  -  F5 -  G5',
        'A5 -  -  G5 -  D5',
        'C5 -  -  -  -  -',
        'C5 -  -  F5 -  A5',
        'D6 -  -  C6 -  A5',
        'C6 -  -  A5 -  F5',
        'A5 -  -  -  -  -',
        'G5 -  -  F5 -  D5',
        'G5 -  -  -  D5 -',
        'F5 -  -  -  -  -',
        '-  -  -  .  .  .',
      ],
      0,
      1,
      -12,
    ),
    tick: hitPart(6, ['x . . x . .'], TICK, 0.5, -36),
    shaker: hitPart(6, ['. . x . . x'], SHAKER, 0.6, 0),
    bass: bassPart(6, 'r - - f - -', 0.7),
    woodblock: hitPart(6, ['. . . l . .'], WOODBLOCK, 0.6, -24),
    bell: chordPart(6, '0 - - 2 - -', 72, 0.6, -12),
    chimes: chordPart(6, '3 - - - - -', CHIMES_BASE, 0.7, -24),
    pluck: chordPart(6, '0 . 1 2 . 1', PLUCK_BASE, 0.7, 0),
    glock: chordPart(6, '. . . 3 - -', CHIMES_BASE, 0.6, -24),
    drum: hitPart(6, ['b . . . . .'], DRUM, 0.6, 24),
  },
}

/** The drum roll while Beep climbs in and the count runs down: three bars growing from a whisper, then liftoff. */
const ROLLING: Piece = {
  meter: 8,
  chords: ['F', 'F', 'C'],
  parts: { roll: hitPart(8, ['p p p p p p p p', 'm m m m m m m m', 'f f f f f f f f'], ROLL, 1, 0) },
}

/** The flight to the moon: the tune an octave up on the music box over the lab's chimes and a soft bass, A then B. */
const FLIGHT: Piece = {
  meter: 8,
  chords: [...A.chords, ...B.chords],
  parts: {
    box: written(8, lines([A, B], 'bell'), 12, 0.9, -24),
    chimes: chordPart(8, '3 - - - 4 - - -', CHIMES_BASE, 0.8, -24),
    bass: bassPart(8, 'r - - - - - - -', 0.6),
  },
}

/** Every piece but the song (which is in SONG, one for each land). */
export const PIECES: Record<'lullaby' | 'roll' | 'flight', Piece> = { lullaby: LULLABY, roll: ROLLING, flight: FLIGHT }

/** The piece a band plays. */
export const pieceOf = (band: Band): Piece => {
  if (band.piece === 'none') throw new Error('the band is resting: it plays no piece')
  return band.piece === 'song' ? SONG[band.land] : PIECES[band.piece]
}

/** The `i`-th note at or over `base` whose pitch class is one of the chord's tones. */
function chordNote(chord: Chord, base: number, i: number): number {
  const tones: readonly number[] = CHORDS[chord].tones
  let n = -1
  for (let m = base; ; m++) if (tones.includes(m % 12) && ++n === i) return m
}

/** A strike's MIDI pitch in bar `chord` of a part (0 for no pitch). */
function pitchOf(part: Part, strike: Strike, chord: Chord): number {
  switch (part.pitch) {
    case 'midi':
      return strike.pitch === 0 ? 0 : strike.pitch + part.base
    case 'chord':
      return chordNote(chord, part.base, strike.pitch)
    case 'bass':
      return part.base + ((CHORDS[chord].root - part.base + 120) % 12) + strike.pitch
  }
}

/** One note the band plays. */
export interface Note {
  instrument: Instrument
  /** MIDI; 0 for the shaker and the roll, which have no pitch. */
  midi: number
  /** How many eighths it rings for. */
  len: number
  /** How hard, 0 to 1. */
  vel: number
  /** On a kazoo, for a muncher napping on a machine of the part's kind: the part's own line, in the kazoo's octave. */
  kazoo: boolean
}

/**
 * The notes that start on eighth `k`, in the band's parts and then its kazoos. With the music
 * off each part plays one soft hit a bar instead, on its beat (its bar's first note, SOFT
 * hard), so the factory still sounds alive and a stopped machine still goes quiet; a kazoo
 * keeps its whole line, since it is the game telling her where a muncher sleeps, not music.
 */
export function notesAt(band: Band, k: number, music: boolean): Note[] {
  const j = k - band.from
  if (band.piece === 'none' || j < 0) return []
  const piece = pieceOf(band)
  const bar = Math.floor(j / piece.meter) % piece.chords.length
  const slot = j % piece.meter
  const chord = piece.chords[bar]!
  const out: Note[] = []
  const sound = (instrument: Instrument, kazoo: boolean) => {
    const part = piece.parts[instrument]
    if (!part) throw new Error(`the ${band.piece} has no ${instrument} part`)
    const pattern = part.bars[bar % part.bars.length]!
    const whole = music || kazoo
    const strike = whole ? pattern[slot] : slot === BEAT[instrument] % piece.meter ? pattern.find((x) => x !== null) : null
    if (!strike) return
    const midi = pitchOf(part, strike, chord)
    out.push({
      instrument,
      midi: kazoo ? (midi === 0 ? KAZOO_LOW + CHORDS[chord].tones[0] : midi + part.kazoo) : midi,
      len: whole ? strike.len : 1,
      vel: strike.vel * part.vel * (whole ? 1 : SOFT),
      kazoo,
    })
  }
  for (const i of band.play) sound(i, false)
  for (const i of band.kazoo) sound(i, true)
  return out
}

/**
 * Seconds from the last note `instrument` played as itself (not a kazoo) up to sim time `t`
 * (seconds), looking back a bar; Infinity when it played none. A working machine's moving
 * part pulses on it: the oven's mouth glows on the bass, the workshop's gear ticks on the
 * woodblock, the digger's drill whirs with the shaker, the lab's dome brightens on its chimes.
 */
export function sinceNote(band: Band, instrument: Instrument, t: number, music: boolean): number {
  const k = Math.floor((t * HZ) / HOP + 1e-6)
  for (let back = 0; back < 8; back++) if (notesAt(band, k - back, music).some((n) => n.instrument === instrument && !n.kazoo)) return t - (k - back) * EIGHTH
  return Infinity
}
