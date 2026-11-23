/**
 * The look's builder (engine/lookBuilder.ts) on rooms built by hand: what a look reads of the room and
 * how, what it may call and what it is refused, where its pieces may stand and what is left out with
 * which note, what each line of LOOK_BUILDER_REF says it does when an option is left out, its limits and
 * least (lookFaults), and the invariant that matters most: a look never changes the play. Building it
 * leaves the World as it was, its random stream unmoved, and 60 s of random walking, pressing and
 * tapping (on the props too) play frame by frame the same with the look as without it.
 */

import { describe, expect, it } from 'vitest'
import { BUDGET, BUILDER_REF, BUILDER_REFUSED, DEFAULTS, MISTAKES, type Builder, type Point, type RoomCode, type World as Api } from './api'
import { LAMP_WARM } from './builder'
import { SIDE_FRAME } from './camera'
import type { Model } from './gift'
import { LIGHTS, LOOK_BUDGET, LOOK_BUILDER_REF, LOOK_MISTAKES, LOOK_NOTES, LOOK_WHY, type LookBuilt, type LookCode, type SeenSolid, WALLPAPER_COPIES } from './look'
import { buildLook, LookBuildError, lookFaults, SIDE_EYE } from './lookBuilder'
import type { Room } from './room'
import { cube, NEVER, roomStart, testRoom } from './testing'
import { compileLook, compileRoom, LookRuntime } from '../trial/compile'
import { sixtySeconds } from '../trial/testing'
import { guarded, LOOKS_ROOM, lookText } from '../trial/twins/looks'
import { buildRoom, RoomRuntime } from './room'
import { sideView } from '../scene/sideCamera'

/** A value made code might hand the builder, past the types. */
const bad = (v: unknown) => v as never
const S2 = roomStart(2, 'together', 1, 7)
const HIGH = { ...roomStart(2, 'together', 1, 7), view: 'high' as const }

/** A look built on a room by hand, on a runtime of its own. */
const look = (room: Room, code: LookCode): LookBuilt => buildLook(room, code, new LookRuntime())

/** The sentence a look's build fails with; a test fails when it builds. */
function lookSentence(room: Room, code: LookCode): string {
  try {
    look(room, code)
  } catch (err) {
    if (err instanceof LookBuildError) return err.sentence
    throw err
  }
  throw new Error('the look built')
}

/** Everyone on the house's floor from x -4, the way out in the back wall at x 6, one step never done. */
function plain(r: Builder, w: Api): void {
  w.players().forEach((p, i) => p.putAt([-4 + 1.5 * i, 0, 0]))
  r.wayOut([6, 0, 0])
  r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [0, 0, 0], done: () => false }])
}

/** A room seen from the side with one of each kind of solid: plain, coloured, a ramp, a ball, hidden, glowing, and one in a mover; a thing and two zones, one of them shown in a colour. */
const SOLIDS: RoomCode = (r, w) => {
  r.box([-5, 2, 0], [2, 0.4, 1.5], { name: 'ledge', turn: 0 })
  r.box([5, 2, 0], [2, 0.4, 1.5], { color: '#ff0000' })
  r.ramp([0, 0.5, 0], [2, 1, 1.5], 'right')
  r.ball([-2, 4, 0], 0.5)
  r.box([2, 4, 0], [1, 0.3, 1], { hidden: true })
  r.box([4, 6, 0], [1, 0.3, 1]).glow('#ffff00')
  r.box([-6, 6, 0], [1, 0.3, 1], { touch: () => {} })
  r.box([6, 6, 0], [1, 0.3, 1], { ice: true })
  r.box([-3, 6, 0], [1, 0.3, 1], { model: cube(1, 0.3, 1) })
  r.mover(
    () => r.box([0, 0, 0], [1, 0.3, 1]),
    () => ({ at: [0, 7, 0], turn: 0 }),
  )
  r.thing([3, 0, 0], cube(0.5, 0.5, 0.5), { name: 'crate' })
  r.zone([-7, 1, 0], [1, 2, 1], { color: '#00ff00' })
  r.zone([7, 1, 0], [1, 2, 1])
  w.players().forEach((p, i) => p.putAt([-4 + 1.5 * i, 0, 0]))
  r.wayOut([6, 0, 0])
  r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [1, 2, 0], done: () => false }])
}

describe("the look's builder refuses what is not the look's", () => {
  it("refuses every call of the room code's play with notLooks, and the house's with houseOwns", () => {
    const room = testRoom(plain, S2)
    const play = Object.keys(BUILDER_REF).filter((k) => !(k in LOOK_BUILDER_REF))
    expect(play.length).toBeGreaterThan(10)
    for (const key of play) expect(lookSentence(room, (r) => void (r as unknown as Record<string, unknown>)[key]), key).toBe(LOOK_MISTAKES.notLooks(`r.${key}`))
    for (const key of BUILDER_REFUSED.houseOwns) expect(lookSentence(room, (r) => void (r as unknown as Record<string, unknown>)[key])).toBe(MISTAKES.houseOwns(`r.${key}`))
    expect(lookSentence(room, (r) => void (r as unknown as Record<string, unknown>).paint)).toBe(MISTAKES.noField('builder', 'paint', Object.keys(LOOK_BUILDER_REF)))
  })

  it('gives the look no w, no handlers and no frame function: the look code is r and room only, and nothing it gives back is kept', () => {
    const room = testRoom(plain, S2)
    let given: unknown[] = []
    const built = look(room, (...args: unknown[]) => {
      given = args
      return bad(() => {})
    })
    expect(given).toHaveLength(2)
    expect(built.notes).toEqual([])
  })
})

describe('the room as the look reads it', () => {
  it("reads the play's still solids in build order, the house's and the movers' left out, each as built", () => {
    const room = testRoom(SOLIDS, S2)
    let seen: Record<string, unknown>[] = []
    look(room, (_r, rm) => {
      seen = rm.solids().map((s) => ({ at: s.at(), size: s.size(), shape: s.shape(), name: s.name(), color: s.color(), dressable: s.dressable() }))
    })
    const floor = room.world.shell.floor.color
    expect(seen).toEqual([
      { at: [-5, 2, 0], size: [2, 0.4, 1.5], shape: 'box', name: 'ledge', color: floor, dressable: true },
      { at: [5, 2, 0], size: [2, 0.4, 1.5], shape: 'box', name: null, color: '#ff0000', dressable: false },
      { at: [0, 0.5, 0], size: [2, 1, 1.5], shape: 'ramp', name: null, color: floor, dressable: true },
      { at: [-2, 4, 0], size: [1, 1, 1], shape: 'ball', name: null, color: floor, dressable: false },
      { at: [2, 4, 0], size: [1, 0.3, 1], shape: 'box', name: null, color: floor, dressable: false },
      { at: [4, 6, 0], size: [1, 0.3, 1], shape: 'box', name: null, color: floor, dressable: false },
      { at: [-6, 6, 0], size: [1, 0.3, 1], shape: 'box', name: null, color: floor, dressable: false },
      { at: [6, 6, 0], size: [1, 0.3, 1], shape: 'box', name: null, color: floor, dressable: false },
      { at: [-3, 6, 0], size: [1, 0.3, 1], shape: 'box', name: null, color: floor, dressable: false },
    ])
  })

  it('reads the things where they start, the zones shown in a colour, the way out, the starts in seat order, the steps, the view and the level', () => {
    const room = testRoom(SOLIDS, { ...S2, level: 3 })
    let seen: Record<string, unknown> = {}
    look(room, (_r, rm) => {
      seen = {
        things: rm.things().map((t) => ({ at: t.at(), size: t.size(), name: t.name() })),
        zones: rm.zones().map((z) => ({ at: z.at(), size: z.size(), color: z.color() })),
        wayOut: rm.wayOut(),
        starts: rm.starts(),
        spots: rm.spots(),
        view: rm.view(),
        level: rm.level(),
      }
    })
    expect(seen).toEqual({
      things: [{ at: [3, 0, 0], size: [0.5, 0.5, 0.5], name: 'crate' }],
      zones: [{ at: [-7, 1, 0], size: [1, 2, 1], color: '#00ff00' }],
      wayOut: [6, 0, 0],
      starts: [
        [-4, 0, 0],
        [-2.5, 0, 0],
      ],
      spots: [[1, 2, 0]],
      view: 'side',
      level: 3,
    })
  })

  it('is frozen: its lists and points take no change, its faces no field, and a read used without its call says so', () => {
    const room = testRoom(SOLIDS, S2)
    expect(lookSentence(room, (_r, rm) => void (rm.solids() as unknown as unknown[]).push(1))).toBe(MISTAKES.frozenList())
    expect(lookSentence(room, (_r, rm) => void ((rm.starts()[0] as unknown as number[])[0] = 1))).toBe(MISTAKES.frozenList())
    expect(lookSentence(room, (_r, rm) => void ((rm.solids()[0] as unknown as Record<string, number>).x = 1))).toBe(MISTAKES.frozen('solid', 'x'))
    expect(lookSentence(room, (_r, rm) => void Number(rm.view))).toBe(MISTAKES.notCalled('room', 'view'))
    expect(lookSentence(room, (_r, rm) => void (rm as unknown as Record<string, unknown>).players)).toBe(MISTAKES.noField('room', 'players', ['view', 'level', 'solids', 'things', 'zones', 'wayOut', 'starts', 'spots']))
  })
})

describe('r.dress', () => {
  it('dresses a dressable solid with a model built to its size, and says why it cannot dress one that is not', () => {
    const room = testRoom(SOLIDS, S2)
    const board = (s: SeenSolid): Model => (m) => m.box(s.size()[0], s.size()[1], s.size()[2], { at: [0, s.size()[1] / 2, 0] })
    const built = look(room, (r, rm) => {
      r.dress(rm.solids()[0], board(rm.solids()[0]))
      r.dress(rm.solids()[2], board(rm.solids()[2]))
    })
    expect(built.dressed.map((d) => d.solid)).toEqual([room.world.solids[0].id, room.world.solids[2].id])
    expect(built.notes).toEqual([])
    const why = (i: number) => lookSentence(room, (r, rm) => r.dress(rm.solids()[i], board(rm.solids()[i])))
    expect(why(1)).toBe(LOOK_MISTAKES.notDressable([5, 2, 0], LOOK_WHY.notPlain))
    expect(why(3)).toBe(LOOK_MISTAKES.notDressable([-2, 4, 0], LOOK_WHY.ball))
    expect(why(4)).toBe(LOOK_MISTAKES.notDressable([2, 4, 0], LOOK_WHY.hidden))
    expect(why(5)).toBe(LOOK_MISTAKES.notDressable([4, 6, 0], LOOK_WHY.glows))
    // A handler, a surface option and a model of its own are each the room code's.
    for (const i of [6, 7, 8]) expect(why(i)).toMatch(LOOK_WHY.notPlain)
    expect(lookSentence(room, (r) => r.dress(bad([0, 0, 0]), cube(1, 1, 1)))).toBe(LOOK_MISTAKES.notSolid('[0, 0, 0]'))
  })

  it('draws a model that does not fit its solid plain, with a note, and counts it left out; a solid dressed again is drawn as its last dressing', () => {
    const room = testRoom(SOLIDS, S2)
    const built = look(room, (r, rm) => {
      const ledge = rm.solids()[0]
      r.dress(ledge, cube(2, 0.8, 1.5))
      r.dress(ledge, cube(2.8, 0.4, 1.5))
      r.dress(ledge, cube(2.4, 0.45, 1.5))
      r.dress(ledge, cube(0.4, 0.4, 1.5))
      r.dress(ledge, cube(2.6, 0.4, 2.1))
      // From the side its depth is hardly seen: a model shallower than the solid fits.
      r.dress(ledge, cube(1.9, 0.4, 0.5))
    })
    expect(built.notes).toEqual([LOOK_NOTES.dressMisfit([-5, 2, 0], LOOK_WHY.topOff(0.8, 0.4)), LOOK_NOTES.dressMisfit([-5, 2, 0], LOOK_WHY.pastSide(0.4)), LOOK_NOTES.dressMisfit([-5, 2, 0], LOOK_WHY.shortOf(0.8))])
    expect(built.dressed).toEqual([{ solid: room.world.solids[0].id, model: 5 }])
    expect(built.counts).toMatchObject({ leftOut: 6, of: 12 })
    // Seen from high up its depth is seen whole: the same shallow model stops short of the front and back.
    const high = testRoom((r, w) => {
      r.box([-3, 0.2, 0], [2, 0.4, 1.5], { name: 'ledge' })
      w.players().forEach((p, i) => p.putAt([2 + i, 0, 2]))
      r.wayOut([0, 0, -4])
      r.steps(NEVER)
    }, { ...S2, view: 'high' })
    expect(look(high, (r, rm) => r.dress(rm.solids()[0], cube(1.9, 0.4, 0.5))).notes).toEqual([LOOK_NOTES.dressMisfit([-3, 0.2, 0], LOOK_WHY.shortOf(0.5))])
  })
})

/** A look of one piece of decor: the box `w` by `h` by `d` standing at `at`, turned `turn`. */
const one = (at: Point, w: number, h: number, d: number, turn = 0): LookCode => (r) => r.decor(at, cube(w, h, d), { turn })

describe('where a piece may stand, seen from the side', () => {
  /** The ledge at x -5 is 1.5 m deep; the blue wall at x 0 is 5 m deep, so it reaches into both bands. */
  const ROOM: RoomCode = (r, w) => {
    r.box([-5, 2, 0], [2, 0.4, 1.5], { name: 'ledge' })
    r.box([0, 6, 0], [0.4, 2, 3], { color: '#3060c0', name: 'wall' })
    plain(r, w)
  }
  const notes = (code: LookCode) => look(testRoom(ROOM, S2), code).notes

  it('keeps a piece behind the play at any height and a low one in front of it', () => {
    const built = look(testRoom(ROOM, S2), (r) => {
      r.decor([-7, 0, -2.5], cube(1, 3, 1))
      r.decor([3, 5, -1.5], cube(1, 1, 1))
      r.prop([3, 0, 1.25], cube(0.4, 0.5, 0.4))
    })
    expect(built.notes).toEqual([])
    expect(built.decor).toHaveLength(2)
    expect(built.props).toHaveLength(1)
  })

  it('leaves out a piece between the bands, too tall in front, or outside the room, each with its note', () => {
    expect(notes(one([3, 0, 0], 1, 1, 1))).toEqual([LOOK_NOTES.outOfPlace('r.decor', [3, 0, 0], LOOK_WHY.betweenBands(-0.5, 0.5))])
    expect(notes(one([3, 0, 1.25], 0.4, 0.8, 0.4))).toEqual([LOOK_NOTES.outOfPlace('r.decor', [3, 0, 1.25], LOOK_WHY.frontTall(0.8))])
    expect(notes(one([7.8, 0, -2], 1, 1, 1))).toEqual([LOOK_NOTES.outOfPlace('r.decor', [7.8, 0, -2], LOOK_WHY.outsideSide)])
    expect(notes(one([2, 7.5, -2], 1, 1, 1))).toEqual([LOOK_NOTES.outOfPlace('r.decor', [2, 7.5, -2], LOOK_WHY.outsideSide)])
    // Turned a quarter round, a long box reaches into the play.
    expect(notes(one([3, 0, -2], 0.4, 1, 3, Math.PI / 2))).toEqual([])
    expect(notes(one([3, 0, -2], 3, 1, 0.4, Math.PI / 2))).toEqual([LOOK_NOTES.outOfPlace('r.decor', [3, 0, -2], LOOK_WHY.betweenBands(-3.5, -0.5))])
  })

  it('leaves out a piece inside a solid of the play', () => {
    expect(notes(one([0, 5.5, -1.8], 1, 1, 1))).toEqual([LOOK_NOTES.inPlay('r.decor', [0, 5.5, -1.8], "the solid 'wall'")])
  })

  it('leaves out a piece in front of a start, a step, the way out or a floor, by its outline seen from the fixed eye, and never one behind them', () => {
    // Player 0 starts at x -4 on the house's floor: a low pot in front of them hides them, one 1.5 m aside does not.
    expect(notes(one([-4, 0, 1.25], 0.4, 0.4, 0.4))).toEqual([LOOK_NOTES.hides('r.decor', [-4, 0, 1.25], LOOK_WHY.start(0))])
    expect(notes(one([-6, 0, 1.25], 0.4, 0.4, 0.4))).toEqual([])
    // The step at 0, 0, 0.
    expect(notes(one([0.3, 0, 1.25], 0.2, 0.2, 0.2))).toEqual([LOOK_NOTES.hides('r.decor', [0.3, 0, 1.25], LOOK_WHY.step(1))])
    // The way out's door is in the back wall: a cupboard in front of it hides it, the same cupboard further along does not.
    expect(notes(one([6, 0, -2], 1, 2, 1))).toEqual([LOOK_NOTES.hides('r.decor', [6, 0, -2], LOOK_WHY.wayOut)])
    expect(notes(one([4, 0, -2], 1, 2, 1))).toEqual([])
    // Behind a start, a piece hides nothing.
    expect(notes(one([-4, 0, -2], 1, 2, 1))).toEqual([])
  })

  it("leaves out a low piece in front of a low floor's top, and not in front of the house's floor", () => {
    const LOW: RoomCode = (r, w) => {
      r.box([3, 0.15, 0], [3, 0.3, 1.5], { name: 'step' })
      plain(r, w)
    }
    expect(look(testRoom(LOW, S2), one([3, 0, 1.25], 0.4, 0.4, 0.4)).notes).toEqual([LOOK_NOTES.hides('r.decor', [3, 0, 1.25], LOOK_WHY.floor("the solid 'step'"))])
    expect(look(testRoom(LOW, S2), one([-6.5, 0, 1.25], 0.4, 0.4, 0.4)).notes).toEqual([])
  })

  it("knows the side camera's eye, which never moves", () => {
    const screens = [
      { width: 1024, height: 768, clearBottom: 230, clearTop: 87 },
      { width: 1440, height: 900, clearBottom: 0, clearTop: 90 },
    ]
    for (const screen of screens) expect(sideView(SIDE_FRAME, screen, [0, 0]).eye).toEqual(SIDE_EYE)
  })
})

describe('where a piece may stand, seen from high up', () => {
  /** A raised floor in the middle; everyone starts at the front; the way out moved into the back wall. */
  const ROOM: RoomCode = (r, w) => {
    r.box([0, 0.5, 0], [3, 1, 2], { name: 'stage' })
    w.players().forEach((p, i) => p.putAt([-4 + 1.5 * i, 0, 3]))
    r.wayOut([5, 0, -4])
    r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [0, 1, 0], done: () => false }])
  }
  const notes = (code: LookCode) => look(testRoom(ROOM, HIGH), code).notes

  it('keeps a tall piece by a wall and a low one anywhere on the floor', () => {
    expect(notes(one([-6.5, 0, -2], 1, 2, 1))).toEqual([])
    expect(notes(one([-2, 0, -3.5], 1, 2, 1))).toEqual([])
    expect(notes(one([3, 0, 1], 1, 0.2, 1))).toEqual([])
  })

  it('leaves out a tall piece away from the walls, one outside the room, and one inside a solid of the play', () => {
    expect(notes(one([3, 0, 1], 1, 1, 1))).toEqual([LOOK_NOTES.outOfPlace('r.decor', [3, 0, 1], LOOK_WHY.offWall(1, 3.5))])
    expect(notes(one([0, 0, 4.2], 1, 0.2, 1))).toEqual([LOOK_NOTES.outOfPlace('r.decor', [0, 0, 4.2], LOOK_WHY.outsideHigh)])
    expect(notes(one([0, 0.5, 0], 1, 0.2, 1))).toEqual([LOOK_NOTES.inPlay('r.decor', [0, 0.5, 0], "the solid 'stage'")])
  })

  it('leaves out a tall piece by its footprint over a start, a step, the floor of the play or in front of the way out', () => {
    const START: RoomCode = (r, w) => {
      w.players().forEach((p, i) => p.putAt([-6 + 1.5 * i, 0, -3]))
      r.wayOut([5, 0, -4])
      r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [6.5, 0, 2], done: () => false }])
    }
    expect(look(testRoom(START, HIGH), one([-6, 0, -3.6], 0.6, 2, 0.6)).notes).toEqual([LOOK_NOTES.hides('r.decor', [-6, 0, -3.6], LOOK_WHY.start(0))])
    expect(look(testRoom(START, HIGH), one([6.5, 0, 1.5], 0.6, 2, 0.6)).notes).toEqual([LOOK_NOTES.hides('r.decor', [6.5, 0, 1.5], LOOK_WHY.step(1))])
    expect(notes(one([5, 0, -3], 1, 2, 1))).toEqual([LOOK_NOTES.hides('r.decor', [5, 0, -3], LOOK_WHY.wayOut)])
    // By a side wall and clear of every place: kept.
    expect(notes(one([-6.4, 0, 1], 0.6, 2, 0.6))).toEqual([])
    const WIDE: RoomCode = (r, w) => {
      r.box([-6, 0.5, 2], [2, 1, 2], { name: 'bench' })
      w.players().forEach((p, i) => p.putAt([-2 + 1.5 * i, 0, 3]))
      r.wayOut([5, 0, -4])
      r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [0, 0, 0], done: () => false }])
    }
    expect(look(testRoom(WIDE, HIGH), one([-6, 0, 0.6], 0.6, 2, 0.6)).notes).toEqual([LOOK_NOTES.hides('r.decor', [-6, 0, 0.6], LOOK_WHY.floor("the solid 'bench'"))])
  })

  it('leaves out a tall piece that hides a place behind it, the camera looking down at a slant from the open front: as far back as it is tall', () => {
    const START: RoomCode = (r, w) => {
      w.players().forEach((p, i) => p.putAt([-6 + 1.5 * i, 0, -3]))
      r.wayOut([5, 0, -4])
      r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [6.5, 0, 2], done: () => false }])
    }
    // 2 m tall, its back at z -1.8: it hides the floor back to z -3.8, and player 0 stands at z -3 behind it.
    expect(look(testRoom(START, HIGH), one([-6.4, 0, -1.5], 0.6, 2, 0.6)).notes).toEqual([LOOK_NOTES.hides('r.decor', [-6.4, 0, -1.5], LOOK_WHY.start(0))])
    // 0.5 m tall, it hides the floor only back to z -2.3, clear of the start: kept.
    expect(look(testRoom(START, HIGH), one([-6.4, 0, -1.5], 0.6, 0.5, 0.6)).notes).toEqual([])
  })
})

describe("what each call does with what is left out, as its line says", () => {
  it('places decor and props at scale 1 and turn 0; a prop wobbles, with no idle, sound or puff', () => {
    const pot = cube(0.5, 0.5, 0.5)
    const built = look(testRoom(plain, S2), (r) => {
      r.decor([-7, 0, -2], pot)
      r.prop([-6, 0, -2], pot)
      r.prop([-5, 0, -2], pot, { react: 'spin', idle: 'sway', sound: 'ding', puff: 'heart', scale: 2, turn: 1 })
    })
    expect(built.decor).toEqual([{ at: [-7, 0, -2], model: 0, scale: 1, turn: 0 }])
    expect(built.props).toEqual([
      { at: [-6, 0, -2], model: 0, scale: 1, turn: 0, react: 'wobble', idle: null, sound: null, puff: null },
      { at: [-5, 0, -2], model: 0, scale: 2, turn: 1, react: 'spin', idle: 'sway', sound: 'ding', puff: 'heart' },
    ])
    expect(built.models).toHaveLength(1)
    expect(lookSentence(testRoom(plain, S2), (r) => r.prop([-6, 0, -2], cube(0.5, 0.5, 0.5), bad({ react: 'dance' })))).toBe(MISTAKES.notChoice('r.prop', 'react', "'dance'", ['wobble', 'hop', 'spin', 'blink', 'swing']))
    expect(lookSentence(testRoom(plain, S2), (r) => r.decor([-6, 0, -2], cube(0.5, 0.5, 0.5), bad({ name: 'x' })))).toBe(MISTAKES.unknownOption('r.decor', 'name', ['scale', 'turn']))
  })

  it('lights warm white dots 0.25 m across, at most 0.6, the colours of a list taken in turn, twinkling only when asked', () => {
    const built = look(testRoom(plain, S2), (r) => {
      r.lights([[0, 7, -2]])
      r.lights(
        [
          [1, 7, -2],
          [2, 7, -2],
          [3, 7, -2],
        ],
        { color: ['#ff0000', '#00ff00'], size: 2, twinkle: true },
      )
    })
    expect(built.lights).toEqual([
      { at: [0, 7, -2], color: LAMP_WARM, size: LIGHTS.size, twinkle: false },
      { at: [1, 7, -2], color: '#ff0000', size: LIGHTS.sizeMost, twinkle: true },
      { at: [2, 7, -2], color: '#00ff00', size: LIGHTS.sizeMost, twinkle: true },
      { at: [3, 7, -2], color: '#ff0000', size: LIGHTS.sizeMost, twinkle: true },
    ])
    expect(built.counts.lights).toBe(4)
  })

  it("lamps warm white at the room's power and reach, power held to 0 to 1", () => {
    const built = look(testRoom(plain, S2), (r) => {
      r.lamp([0, 7, -2])
      r.lamp([1, 7, -2], { color: '#0000ff', power: 3, reach: 2 })
    })
    expect(built.lamps).toEqual([
      { at: [0, 7, -2], color: LAMP_WARM, power: DEFAULTS.lampPower, reach: DEFAULTS.lampReach },
      { at: [1, 7, -2], color: '#0000ff', power: 1, reach: 2 },
    ])
  })

  it("counts the wallpaper's model each time the house repeats it, holds it to its shapes, and once", () => {
    const dots: Model = (m) => {
      m.sphere(0.1)
      m.sphere(0.1, { at: [0.2, 0, 0] })
    }
    expect(look(testRoom(plain, S2), (r) => r.wallpaper(dots)).counts.pieces).toBe(1 + 2 * WALLPAPER_COPIES.side)
    expect(look(testRoom(plain, HIGH), (r) => r.wallpaper(dots)).counts.pieces).toBe(1 + 2 * WALLPAPER_COPIES.high)
    const heavy: Model = (m) => {
      for (let i = 0; i < 13; i++) m.sphere(0.02, { at: [i * 0.04, 0, 0] })
    }
    expect(lookSentence(testRoom(plain, S2), (r) => r.wallpaper(heavy))).toBe(LOOK_MISTAKES.motifHeavy(13))
    expect(
      lookSentence(testRoom(plain, S2), (r) => {
        r.wallpaper(dots)
        r.wallpaper(dots)
      }),
    ).toBe(MISTAKES.calledTwice('r.wallpaper', 2))
  })

  it('stops a look past its pieces, each call 1 and each shape each time it is placed', () => {
    const ten: Model = (m) => {
      for (let i = 0; i < 9; i++) m.box(0.1, 0.1, 0.1, { at: [0, 0.05 + i * 0.1, 0] })
    }
    expect(
      lookSentence(testRoom(plain, S2), (r) => {
        for (let i = 0; i < 400; i++) r.decor([-7, 0, -2], ten)
      }),
    ).toBe(LOOK_MISTAKES.lookLighter(3000 + 10))
  })
})

describe('the limits and the least a built look is held to', () => {
  const props = (spots: readonly Point[]): LookCode => (r) => {
    for (const at of spots) r.prop(at, cube(0.3, 0.3, 0.3))
  }
  const LOW_LEFT: Point = [-6, 0, -2]
  const LOW_RIGHT: Point = [4, 0, -2]
  const UP_LEFT: Point = [-6, 6, -2]
  const UP_RIGHT: Point = [6, 6, -2]

  it('passes eight props that react in three quarters', () => {
    const built = look(testRoom(plain, S2), props([LOW_LEFT, LOW_LEFT, LOW_LEFT, LOW_RIGHT, LOW_RIGHT, LOW_RIGHT, UP_LEFT, UP_LEFT]))
    expect(built.counts).toMatchObject({ props: 8, answering: 8, quarters: 3 })
    expect(lookFaults(built, 'side', 0)).toEqual([])
  })

  it('names the first bare quarter, or none when every quarter has one and they are only too few', () => {
    const bare = look(testRoom(plain, S2), props([LOW_LEFT, LOW_LEFT, LOW_LEFT, LOW_LEFT, UP_LEFT, UP_LEFT, UP_RIGHT, UP_RIGHT]))
    expect(lookFaults(bare, 'side', 0)).toEqual([])
    const few = look(testRoom(plain, S2), props([LOW_LEFT, LOW_RIGHT, UP_LEFT, UP_RIGHT]))
    expect(lookFaults(few, 'side', 0)).toEqual([LOOK_MISTAKES.fewAnswer(4, null)])
    const back = look(testRoom(plain, HIGH), props([[-6, 0, -3.5], [-5, 0, -3.5], [-4, 0, -3.5], [-3, 0, -3.5], [-2, 0, -3.5], [-6, 0, 3.5], [-5, 0, 3.5], [-4, 0, 3.5]]))
    expect(lookFaults(back, 'high', 0)).toEqual([LOOK_MISTAKES.fewAnswer(8, 'the back right quarter')])
  })

  it('counts only the props kept: one left out does not answer', () => {
    const built = look(testRoom(plain, S2), props([LOW_LEFT, LOW_RIGHT, UP_LEFT, UP_RIGHT, UP_RIGHT, UP_RIGHT, UP_RIGHT, [3, 0, 0]]))
    expect(built.counts).toMatchObject({ props: 8, answering: 7 })
    expect(lookFaults(built, 'side', 0)).toEqual([LOOK_MISTAKES.fewAnswer(7, null)])
  })

  it('holds props, small lights and lamps together with the room code’s to their limits, and the pieces left out to a third', () => {
    const spots = Array.from({ length: LOOK_BUDGET.props + 1 }, (_, i): Point => [-7 + (i % 15), i < 15 ? 0 : i < 30 ? 6 : 3.5, -2])
    const built = look(testRoom(plain, S2), (r) => {
      props(spots)(r, bad(null))
      r.lights(Array.from({ length: LOOK_BUDGET.lights + 1 }, (): Point => [0, 7.5, -2.8]))
      for (let i = 0; i < 5; i++) r.lamp([i, 7, -2])
    })
    expect(lookFaults(built, 'side', BUDGET.lamps - 4)).toEqual([LOOK_MISTAKES.tooManyProps(49), LOOK_MISTAKES.tooManyLights(401), LOOK_MISTAKES.lampsTogether(BUDGET.lamps - 4, 5)])
    const half = look(testRoom(plain, S2), (r) => {
      props([LOW_LEFT, LOW_LEFT, LOW_RIGHT, LOW_RIGHT, UP_LEFT, UP_LEFT, UP_RIGHT, UP_RIGHT])(r, bad(null))
      for (let i = 0; i < 5; i++) r.decor([3, 0, 0], cube(0.3, 0.3, 0.3))
    })
    expect(half.counts).toMatchObject({ leftOut: 10, of: 26 })
    expect(lookFaults(half, 'side', 0)).toEqual([LOOK_MISTAKES.tooManyLeftOut(10, 26)])
  })
})

// ------------------------------------------------------------------------------ a look never changes the play

/** The fixture room of the look's twins as made code, and its base look, on a runtime each. */
function fixture(level: 1 | 2 | 3): { room: Room; code: LookCode; runtime: LookRuntime } {
  const rt = new RoomRuntime()
  const room = buildRoom(compileRoom(guarded('room', LOOKS_ROOM.join('\n')), rt), { ...roomStart(1, 'together', level, 50) }, rt)
  const runtime = new LookRuntime()
  return { room, code: compileLook(guarded('look', `${lookText(null)}\nfor (let i = 0; i < 50; i++) Math.random()`), runtime), runtime }
}

/** A room seen from high up with what moves and answers: a raised floor, a mover, a crate to push, a ball to carry and a zone that answers a tap; and a look that dresses it. */
const BUSY_HIGH: RoomCode = (r, w) => {
  r.box([-3, 0.4, -1], [3, 0.8, 2], { name: 'stage' })
  r.mover(
    () => r.box([0, 0, 0], [1.5, 0.3, 1.5]),
    (t) => ({ at: [3 + 2 * Math.sin(t), 0.15, 1], turn: 0 }),
  )
  r.thing([1, 0, -2], cube(0.8, 0.8, 0.8), { weight: 2, name: 'crate' })
  r.thing([-1, 0, 2], cube(0.4, 0.4, 0.4), { name: 'ball' })
  let taps = 0
  r.zone([5, 0.5, -3], [1.5, 1, 1.5], { color: '#ffd23a', tap: () => (taps += 1) })
  w.players().forEach((p, i) => p.putAt([-5 + 1.5 * i, 0, 3]))
  r.wayOut([0, 0, -4])
  r.steps([{ hint: { en: 'tap the box', fi: 'napauta laatikkoa' }, at: [5, 0, -3], done: () => taps > 1000 }])
}
const BUSY_LOOK: LookCode = (r, rm) => {
  for (const s of rm.solids()) if (s.dressable()) r.dress(s, cube(s.size()[0], s.size()[1], s.size()[2]))
  for (let i = 0; i < 8; i++) r.prop([-6 + i * 1.7, 0, i < 4 ? -3.5 : 3.6], cube(0.3, 0.3, 0.3), { react: 'hop', idle: 'pulse' })
  r.decor([-6.5, 0, -3.5], cube(1, 2, 1))
  r.lights([[0, 2.4, -3.9], [1, 2.4, -3.9]], { twinkle: true })
  r.lamp([0, 2.5, 0])
}

describe('a look never changes the play', () => {
  it("leaves the World as it was and its random stream unmoved, at every level, the look drawing its own dice", () => {
    for (const level of [1, 2, 3] as const) {
      const { room, code, runtime } = fixture(level)
      const before = structuredClone(room.world)
      const built = buildLook(room, code, runtime)
      expect(built.props).toHaveLength(8)
      expect(room.world).toEqual(before)
      expect(room.world.rng).toBe(before.rng)
      expect(room.faults).toEqual([])
    }
  })

  it('plays 60 s of random walking, pressing and tapping frame by frame the same with the look as without it, from the side and from high up', () => {
    const side = fixture(1)
    const bare = fixture(1).room
    const sideLook = buildLook(side.room, side.code, side.runtime)
    const sidePlayed = sixtySeconds(side.room, sideLook.props.map((p) => p.at))
    expect(sidePlayed).toEqual(sixtySeconds(bare, sideLook.props.map((p) => p.at)))
    expect(sidePlayed[0]).not.toBe(sidePlayed[3599])
    const high = testRoom(BUSY_HIGH, HIGH)
    const highLook = look(high, BUSY_LOOK)
    expect(highLook.props).toHaveLength(8)
    expect(highLook.dressed).toHaveLength(1)
    const played = sixtySeconds(high, highLook.props.map((p) => p.at))
    expect(played).toEqual(sixtySeconds(testRoom(BUSY_HIGH, HIGH), highLook.props.map((p) => p.at)))
    // The play really moved: the players walked and the mover went round.
    expect(played[0]).not.toBe(played[3599])
  }, 60_000)
})
