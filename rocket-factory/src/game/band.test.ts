/**
 * The band without ears. The score: every bar of every part is whole, every note is on the F
 * major pentatonic but the bass's (which walks the chords' roots and fifths in F major), no
 * written note grinds a semitone above its chord on a beat, the song has its long form and a
 * new arrangement for each land. Which parts play, for states built from a fresh game: working
 * machines, napped and tucked ones, the belts, a visit, the pad's drum, Good night, the launch
 * and a new session. And the notes they play, with the music on and off.
 */
import { describe, expect, it } from 'vitest'

import {
  BEAT, BPM, CHORDS, EIGHTH, FORM, INSTRUMENTS, KAZOO_LOW, LIFTOFF, MAJOR, NIGHT_LEAD, PART_OF, PENTATONIC, PIECES, REJOIN, SOFT, SONG, bandOf, notesAt, padDrums, penta, pieceOf,
  sinceNote, working, type Band, type Instrument, type Note, type Piece,
} from './band'
import { HOP, HZ, KINDS, newBuilding, thingIndex, ticks, type Kind, type State } from './model'
import { blankState } from './rules'

/** A machine of `kind` on a fresh board: working (a batch in progress), idle, napped on, or tucked in with a batch. */
function add(s: State, kind: Kind, how: 'works' | 'idle' | 'napped' | 'tucked') {
  const b = newBuilding(s.nextId++, kind, 0, 0, s.tick)
  if (how !== 'idle') b.batch = { makes: 'blueBar', at: s.tick, until: s.tick + ticks(2) }
  if (how === 'napped') b.napper = 7
  if (how === 'tucked') b.tucked = true
  s.buildings.push(b)
  return b
}

/** Every piece with its name: the song in each land's arrangement, the lullaby, the roll and the flight. */
const ALL: { name: string; piece: Piece }[] = [
  ...([1, 2, 3] as const).map((land) => ({ name: `song (land ${land})`, piece: SONG[land] })),
  ...(['lullaby', 'roll', 'flight'] as const).map((name) => ({ name, piece: PIECES[name] })),
]
/** A band playing every part `piece` has, and every one of them as a kazoo too. */
function everything(name: string, piece: Piece): Band {
  const parts = INSTRUMENTS.filter((i) => piece.parts[i])
  const kind = name.startsWith('song') ? 'song' : (name as 'lullaby' | 'roll' | 'flight')
  return { piece: kind, from: 0, land: name.startsWith('song') ? (Number(name.at(-2)) as 1 | 2 | 3) : 1, play: parts, kazoo: parts }
}
/** Every note of a whole pass through `band`'s piece, with its bar and slot. */
function pass(band: Band, music: boolean): { n: Note; bar: number; slot: number }[] {
  const piece = pieceOf(band)
  const out: { n: Note; bar: number; slot: number }[] = []
  for (let k = 0; k < piece.chords.length * piece.meter; k++) for (const n of notesAt(band, band.from + k, music)) out.push({ n, bar: Math.floor(k / piece.meter), slot: k % piece.meter })
  return out
}
const pc = (midi: number) => midi % 12
/** The parts written out note by note: what the grind rule and the singing ranges are for. */
const WRITTEN: Instrument[] = ['bell', 'glock', 'pizzicato', 'box']

describe('the score', () => {
  it('is whole: every bar a slot per eighth, every strike ringing over silence and inside its piece', () => {
    for (const { name, piece } of ALL) {
      expect(piece.chords.length, name).toBeGreaterThan(0)
      for (const [instrument, part] of Object.entries(piece.parts)) {
        const where = `${name} ${instrument}`
        // A part is one bar repeated, a few in turn, or a bar for every bar of the piece.
        expect([1, 2, 4, piece.chords.length], where).toContain(part.bars.length)
        for (const bar of part.bars) expect(bar, where).toHaveLength(piece.meter)
        const slots = part.bars.flat()
        slots.forEach((strike, i) => {
          if (!strike) return
          expect(strike.len, where).toBeGreaterThanOrEqual(1)
          expect(strike.vel, where).toBeGreaterThan(0)
          expect(strike.vel, where).toBeLessThanOrEqual(1)
          // A repeated bar keeps its notes inside it; a written line may hold over a bar line, never past its end.
          const room = part.bars.length === piece.chords.length ? slots.length : piece.meter * (Math.floor(i / piece.meter) + 1)
          expect(i + strike.len, where).toBeLessThanOrEqual(room)
          for (let k = 1; k < strike.len; k++) expect(slots[i + k], `${where}: a note held over another`).toBeNull()
        })
      }
    }
  })

  it('is in key: every note on the F major pentatonic but the bass, which plays its chords roots, fifths and octaves in F major', () => {
    for (const chord of Object.values(CHORDS)) {
      for (const t of chord.tones) expect(PENTATONIC).toContain(t)
      for (const t of [chord.root, chord.root + chord.third, chord.root + 7]) expect(MAJOR).toContain(t % 12)
    }
    for (const { name, piece } of ALL) {
      const band = everything(name, piece)
      const notes = pass(band, true)
      expect(notes.length, name).toBeGreaterThan(piece.chords.length)
      for (const { n, bar } of notes) {
        const where = `${name} bar ${bar + 1}: ${n.kazoo ? 'kazoo ' : ''}${n.instrument} ${n.midi}`
        if (n.midi === 0) {
          expect(['shaker', 'roll'], where).toContain(n.instrument)
          continue
        }
        const chord = CHORDS[piece.chords[bar]!]
        if (n.instrument === 'bass') {
          expect([chord.root, chord.root + 7].map(pc), where).toContain(pc(n.midi))
          expect(MAJOR, where).toContain(pc(n.midi))
          if (!n.kazoo) expect(n.midi, where).toBeGreaterThanOrEqual(38)
          if (!n.kazoo) expect(n.midi, where).toBeLessThanOrEqual(60)
        } else expect(PENTATONIC, where).toContain(pc(n.midi))
        if (n.kazoo) {
          expect(n.midi, where).toBeGreaterThanOrEqual(48)
          expect(n.midi, where).toBeLessThanOrEqual(84)
        } else expect(n.midi, where).toBeLessThanOrEqual(101)
      }
    }
  })

  it('sings: the written lines in their ranges, and none a semitone above its chord on a beat', () => {
    const range: Record<string, [number, number]> = { bell: [69, 89], glock: [84, 96], pizzicato: [53, 69], box: [69, 101] }
    for (const { name, piece } of ALL) {
      const beats = piece.meter === 6 ? [0, 3] : [0, 2, 4, 6]
      for (const { n, bar, slot } of pass(everything(name, piece), true)) {
        if (n.kazoo || !WRITTEN.includes(n.instrument)) continue
        const where = `${name} ${n.instrument} bar ${bar + 1} slot ${slot}: ${n.midi}`
        const [lo, hi] = range[n.instrument]!
        expect(n.midi, where).toBeGreaterThanOrEqual(lo)
        expect(n.midi, where).toBeLessThanOrEqual(hi)
        const { root, third } = CHORDS[piece.chords[bar]!]
        if (beats.includes(slot)) for (const t of [root, root + third, root + 7]) expect((n.midi - t + 120) % 12, `${where} grinds on ${piece.chords[bar]}`).not.toBe(1)
      }
    }
  })

  it('has a long form at 90 bpm, the eighth a hop: A A B A, 32 bars, over a minute before it goes round', () => {
    expect(BPM).toBeCloseTo(90, 9)
    expect(EIGHTH).toBeCloseTo(HOP / HZ, 12)
    expect(FORM[0]).toBe(FORM[1])
    expect(FORM[3]).toBe(FORM[0])
    expect(FORM[2]).not.toBe(FORM[0])
    expect(FORM[2].bell).not.toEqual(FORM[0].bell)
    for (const land of [1, 2, 3] as const) {
      expect(SONG[land].chords).toEqual(FORM.flatMap((sec) => sec.chords))
      expect(SONG[land].chords.length * 8 * EIGHTH).toBeGreaterThan(60)
    }
    expect(PIECES.lullaby.meter).toBe(6)
    expect(PIECES.lullaby.chords.length * 6 * EIGHTH).toBeGreaterThan(30)
  })

  it('has a new arrangement for each land, around the same tune, descant and pizzicato line', () => {
    const accompaniment = (land: 1 | 2 | 3) => JSON.stringify(['bass', 'shaker', 'woodblock', 'pluck', 'chimes', 'drum'].map((i) => SONG[land].parts[i as Instrument]))
    expect(new Set([1, 2, 3].map((l) => accompaniment(l as 1 | 2 | 3))).size).toBe(3)
    for (const i of ['bell', 'glock', 'pizzicato'] as const) {
      expect(SONG[2].parts[i]).toBe(SONG[1].parts[i])
      expect(SONG[3].parts[i]).toBe(SONG[1].parts[i])
    }
  })

  it('comes home and is its own: the lullaby ends on F, and the tune, the descant, the pizzicato line and the lullaby each open differently', () => {
    const line = (piece: Piece, i: Instrument) => pass({ piece: piece === PIECES.lullaby ? 'lullaby' : 'song', from: 0, land: 1, play: [i], kazoo: [] }, true).map(({ n }) => n.midi)
    expect(pc(line(PIECES.lullaby, 'box').at(-1)!)).toBe(5)
    const openings = [line(SONG[1], 'bell'), line(SONG[1], 'glock'), line(SONG[1], 'pizzicato'), line(PIECES.lullaby, 'box')].map((notes) => JSON.stringify(notes.slice(0, 5).map(pc)))
    expect(new Set(openings).size).toBe(4)
  })

  it('climbs the pentatonic from F4 for the effects', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(penta)).toEqual([65, 67, 69, 72, 74, 77, 89])
  })
})

describe('which parts play', () => {
  it('none on a fresh board: the start oven waits, the belts are empty and nobody is out', () => {
    const s = blankState(1)
    const band = bandOf(s)
    expect(band).toEqual({ piece: 'song', from: 0, land: 1, play: [], kazoo: [] })
    expect(pass(band, true)).toEqual([])
    expect(pass(band, false)).toEqual([])
  })

  it("plays each kind's part while one of its machines works, in the score's order, and drops it when they all stop", () => {
    const s = blankState(1)
    s.tick = s.sessionAt + REJOIN
    for (const kind of ['pump', 'lab', 'orangeMaker', 'greenMaker', 'workshop', 'digger'] as const) add(s, kind, 'works')
    add(s, 'tower', 'idle')
    add(s, 'bowl', 'idle')
    expect(bandOf(s).play).toEqual(['shaker', 'woodblock', 'bell', 'chimes', 'pluck', 'glock'])
    // The start oven bakes: the bass comes in.
    s.buildings[1]!.batch = { makes: 'blueBar', at: s.tick, until: s.tick + ticks(2) }
    expect(bandOf(s).play).toContain('bass')
    for (const b of s.buildings) b.batch = null
    expect(bandOf(s).play).toEqual([])
    expect(Object.keys(PART_OF).sort()).toEqual(KINDS.filter((k) => k !== 'tower' && k !== 'bowl').sort())
  })

  it('works out working once: a batch in progress, nobody napping, not tucked in', () => {
    const s = blankState(1)
    expect(working(add(s, 'oven', 'works'))).toBe(true)
    expect(working(add(s, 'oven', 'idle'))).toBe(false)
    expect(working(add(s, 'oven', 'napped'))).toBe(false)
    expect(working(add(s, 'oven', 'tucked'))).toBe(false)
  })

  it('turns a napped-on machine into a kazoo, and plays both for a kind with one napped and one working', () => {
    const s = blankState(1)
    s.tick = REJOIN
    const nap = add(s, 'greenMaker', 'napped')
    expect(bandOf(s)).toMatchObject({ play: [], kazoo: ['bell'] })
    // Napped on while it waited for bars: still its kazoo, so she hears where the muncher sleeps.
    nap.batch = null
    expect(bandOf(s)).toMatchObject({ play: [], kazoo: ['bell'] })
    add(s, 'greenMaker', 'works')
    expect(bandOf(s)).toMatchObject({ play: ['bell'], kazoo: ['bell'] })
    nap.napper = -1
    expect(bandOf(s)).toMatchObject({ play: ['bell'], kazoo: [] })
  })

  it('leaves out a kind tucked in for the night', () => {
    const s = blankState(1)
    s.tick = REJOIN
    add(s, 'digger', 'tucked')
    add(s, 'oven', 'works')
    expect(bandOf(s).play).toEqual(['bass'])
  })

  it('ticks while things ride the belts, and is quiet while a full belt stands still', () => {
    const s = blankState(1)
    s.tick = REJOIN
    const slot = 2 * 45 + 1
    s.belts.slot[slot] = thingIndex('blueRock')
    s.belts.from[slot] = slot - 1
    expect(bandOf(s).play).toEqual(['tick'])
    s.belts.from[slot] = slot
    expect(bandOf(s).play).toEqual([])
    // Just out of a machine's spout: it moved.
    s.belts.from[slot] = -1
    expect(bandOf(s).play).toEqual(['tick'])
  })

  it('adds the pizzicato line while a visit is out', () => {
    const s = blankState(1)
    s.visit = { burrow: 0, at: 0, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
    expect(bandOf(s).play).toEqual(['pizzicato'])
  })

  it('drums on the pad from Rocket! until the rocket flies, unless the pad is tucked in', () => {
    const s = blankState(1)
    s.tick = REJOIN
    expect(padDrums(s)).toBe(false)
    s.found = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'land2', 'stars', 'snacks', 'land3', 'rocket']
    expect(padDrums(s)).toBe(true)
    expect(bandOf(s).play).toEqual(['drum'])
    s.buildings[0]!.tucked = true
    expect(bandOf(s).play).toEqual([])
    s.buildings[0]!.tucked = false
    s.launches = 1
    expect(padDrums(s)).toBe(false)
  })

  it('slows to the lullaby after the evening chime at Good night, each kind tucked in leaving it, and rests once the last is in', () => {
    const s = blankState(1)
    s.tick = 1000
    s.sessionAt = 0
    const oven = add(s, 'oven', 'works')
    add(s, 'digger', 'works')
    s.visit = { burrow: 0, at: 0, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
    s.night = { at: 990, kind: 'oven', kindAt: 990, doneAt: -1 }
    const band = bandOf(s)
    expect(band).toEqual({ piece: 'lullaby', from: Math.ceil((990 + NIGHT_LEAD) / HOP), land: 1, play: ['shaker', 'bass', 'box'], kazoo: [] })
    // The evening's chime first: the lullaby's first note waits for it.
    expect(notesAt(band, band.from - 1, true)).toEqual([])
    expect(notesAt(band, band.from, true).find((n) => n.instrument === 'box')!.midi).toBe(72)
    oven.tucked = true
    expect(bandOf(s).play).toEqual(['shaker', 'box'])
    s.night.doneAt = 1200
    expect(bandOf(s)).toMatchObject({ piece: 'none', play: [], kazoo: [] })
    expect(notesAt(bandOf(s), 500, true)).toEqual([])
  })

  it("hushes to a drum roll for the launch until liftoff, then plays the flight's tune, whatever works", () => {
    const s = blankState(1)
    add(s, 'oven', 'works')
    s.tick = 2010
    s.launch = { at: 2010, landsAt: 2010 + ticks(40) }
    expect(bandOf(s)).toEqual({ piece: 'roll', from: Math.ceil(2010 / HOP), land: 1, play: ['roll'], kazoo: [] })
    const rolls = [0, 8, 16].map((k) => notesAt(bandOf(s), bandOf(s).from + k, true)[0]!.vel)
    expect(rolls[0]).toBeLessThan(rolls[1]!)
    expect(rolls[1]).toBeLessThan(rolls[2]!)
    s.tick = 2010 + LIFTOFF
    expect(bandOf(s)).toEqual({ piece: 'flight', from: Math.ceil((2010 + LIFTOFF) / HOP), land: 1, play: ['bass', 'chimes', 'box'], kazoo: [] })
    // The flight's tune is the song's, an octave up on the music box.
    const flight = bandOf(s)
    const tune = (b: Band, i: Instrument) => notesAt(b, b.from, true).find((n) => n.instrument === i)!.midi
    expect(tune(flight, 'box')).toBe(tune({ piece: 'song', from: 0, land: 1, play: ['bell'], kazoo: [] }, 'bell') + 12)
  })

  it('brings the parts back one by one over REJOIN after a new session', () => {
    const s = blankState(1)
    for (const kind of ['digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pump'] as const) add(s, kind, 'works')
    s.belts.slot[1] = thingIndex('gear')
    s.found = ['rocket']
    s.sessionAt = 600
    const counts: number[] = []
    for (let back = 0; back <= REJOIN; back += 5) {
      s.tick = 600 + back
      counts.push(bandOf(s).play.length)
    }
    expect(counts[0]).toBe(1)
    expect(counts.at(-1)).toBe(9)
    counts.forEach((n, i) => i === 0 || expect(n).toBeGreaterThanOrEqual(counts[i - 1]!))
    s.tick = 600 + REJOIN - 1
    expect(bandOf(s).play).not.toContain('drum')
  })

  it('reads the state and never changes it', () => {
    const s = blankState(3)
    add(s, 'oven', 'works')
    add(s, 'pump', 'napped')
    const before = JSON.stringify(s)
    expect(bandOf(s)).toEqual(bandOf(s))
    expect(JSON.stringify(s)).toBe(before)
  })
})

describe('the notes', () => {
  const song = (land: 1 | 2 | 3, play: Instrument[], kazoo: Instrument[]): Band => ({ piece: 'song', from: 0, land, play, kazoo })

  it("follow each part's line in the land's arrangement: the tune on the bell, the bass on the chord's root", () => {
    const first = notesAt(song(1, ['bass', 'bell'], []), 0, true)
    expect(first.map((n) => [n.instrument, n.midi, n.len])).toEqual([
      ['bass', 41, 4],
      ['bell', 84, 2],
    ])
    // Land 2 walks the bass: root, fifth, octave, fifth.
    expect([0, 2, 4, 6].map((k) => notesAt(song(2, ['bass'], []), k, true)[0]!.midi)).toEqual([41, 48, 53, 48])
  })

  it('play a napping muncher\'s kazoo on the same line in the kazoo\'s octave, an unpitched part on its chord\'s first tone', () => {
    const own = pass(song(1, ['bell'], []), true)
    const kazoo = pass(song(1, [], ['bell']), true)
    expect(kazoo.map(({ n }) => [n.midi + 12, n.len])).toEqual(own.map(({ n }) => [n.midi, n.len]))
    for (const { n } of kazoo) expect(n.kazoo).toBe(true)
    const shaker = notesAt(song(1, [], ['shaker']), 1, true)[0]!
    expect(shaker.midi).toBe(KAZOO_LOW + CHORDS.F.tones[0])
  })

  it("keep a napping muncher's kazoo's whole line with the music off: it tells her where the muncher sleeps, it is not music", () => {
    for (const i of ['bell', 'glock', 'bass', 'shaker'] as const) expect(pass(song(1, [], [i]), false), i).toEqual(pass(song(1, [], [i]), true))
  })

  it("put the two bottle makers' kazoos an octave apart, so a nap on either is its own sound", () => {
    const mean = (i: Instrument) => {
      const notes = pass(song(1, [], [i]), true)
      return notes.reduce((sum, { n }) => sum + n.midi, 0) / notes.length
    }
    expect(mean('glock') - mean('bell')).toBeGreaterThan(9)
  })

  it('with the music off, play each part once a bar on its beat, softly', () => {
    for (const { name, piece } of ALL) {
      const band = { ...everything(name, piece), kazoo: [] }
      const bars = new Map<string, number>()
      for (const { n, bar, slot } of pass(band, false)) {
        const where = `${name} ${n.instrument} bar ${bar + 1}`
        expect(slot, where).toBe(BEAT[n.instrument] % piece.meter)
        expect(n.len, where).toBe(1)
        expect(n.vel, where).toBeLessThanOrEqual(SOFT)
        const key = `${n.instrument}:${bar}`
        bars.set(key, (bars.get(key) ?? 0) + 1)
      }
      for (const [key, n] of bars) expect(n, `${name} ${key}`).toBe(1)
      // Every machine part of the song sounds in every bar.
      if (name.startsWith('song')) for (const i of band.play) expect(bars.has(`${i}:0`), `${name} ${i}`).toBe(true)
    }
  })

  it('spread the beats round the bar, so a busy factory\'s soft hits never land together', () => {
    const machines = Object.values(PART_OF).filter((i) => i !== 'drum')
    expect(new Set(machines.map((i) => BEAT[i])).size).toBe(machines.length)
    for (const i of INSTRUMENTS) expect(BEAT[i]).toBeLessThan(8)
  })

  it("time a machine's pulse from its part's last note as itself, within a bar", () => {
    const band = song(1, ['bass', 'shaker'], ['bell'])
    // The bass plays on eighths 0 and 4 of land 1's bar.
    expect(sinceNote(band, 'bass', 0.1, true)).toBeCloseTo(0.1, 9)
    expect(sinceNote(band, 'bass', 4.5 * EIGHTH, true)).toBeCloseTo(0.5 * EIGHTH, 9)
    expect(sinceNote(band, 'bass', 4 * EIGHTH, true)).toBeCloseTo(0, 9)
    expect(sinceNote(band, 'shaker', 2 * EIGHTH, true)).toBeCloseTo(EIGHTH, 9)
    // A kazoo is the muncher's, and a part that is not playing never pulses.
    expect(sinceNote(band, 'bell', 2, true)).toBe(Infinity)
    expect(sinceNote(band, 'pluck', 2, true)).toBe(Infinity)
    // With the music off, once a bar on its beat (the shaker's is the bar's second eighth).
    expect(sinceNote(band, 'shaker', 8 * EIGHTH, false)).toBeCloseTo(7 * EIGHTH, 9)
    expect(sinceNote(band, 'shaker', 9 * EIGHTH, false)).toBeCloseTo(0, 9)
  })
})
