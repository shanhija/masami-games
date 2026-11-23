import { describe, expect, it } from 'vitest'
import { parseColor } from '../../../silly-billy/src/engine/kit'
import { compile } from '../../../silly-billy/src/engine/sandbox'
import { NO_POINTING, type Pointing } from '../seats/types'
import {
  BUDGET,
  BUILDER_REF,
  BUILDER_REFUSED,
  CONTACT_OPTS_REF,
  DEFAULTS,
  FRAME_ORDER,
  MISTAKES,
  PASS,
  ROOM,
  SHARED_OPTS_REF,
  SOLID_OPTS_REF,
  SURVEY_NOTES,
  WORLD_REF,
  type Builder,
  type FramePhase,
  type MoverPlace,
  type Player,
  type Point,
  type RoomCode,
  type Shell,
  type Thing,
  type Who,
  type World,
  type Zone,
} from './api'
import { KIT_SHAPES_REF, ROOM_PART_REF, type Model, type RoomKit } from './gift'
import { buildRoom, RoomBuildError, RoomRuntime, type Room } from './room'
import { HOUSE_SHELL, ROOM_BOUNDS, type RoomView } from './world'
import { buildSentence, cube, houseFloor, idle, IDLE, NEVER, partyOf, plainRoom, playRoom, randomHolds, roomStart, testRoom, type Hold } from './testing'
import { HIGH_FRAME, SIDE_FRAME } from './camera'
import { PATTERN_ORDER } from '../patterns/patterns'
import { HOUSE } from './sim'
import { playerHeight, playerWidth } from './state'
import { surveyText } from './survey'

const S1 = roomStart(1, 'together', 1, 11)
const S2 = roomStart(2, 'together', 2, 11)
const C2 = roomStart(2, 'contest', 1, 11)
const HINT = { en: 'go there', fi: 'mene sinne' }
/** A value made code might pass by mistake, past the types. */
const bad = (v: unknown) => v as never
const sorted = (o: object) => Object.keys(o).sort()
const steps = (done: () => boolean) => [{ hint: HINT, at: [0, 0, 0] as Point, done }]
const RIGHT: Hold = { stick: [1, 0], a: false, b: false }
const holdAll = (room: Room, h: Hold) => () => room.world.players.map(() => h)
const frames = (room: Room, n: number) => playRoom(room, n, idle(room), () => NO_POINTING)
const sentences = (room: Room) => room.faults.map((f) => f.sentence)

describe('a room is built and played', () => {
  it('builds for its party at its level, then plays frame by frame with the World the scene reads', () => {
    let level = 0
    const room = testRoom((r, w) => {
      level = w.level()
      plainRoom(r, w, NEVER)
    }, S2)
    expect(level).toBe(2)
    expect(room.world.players).toHaveLength(2)
    expect(room.world.t).toBe(0)
    frames(room, 60)
    expect(room.world.t).toBeCloseTo(1, 9)
    expect(room.world.players[0].on).toBe(houseFloor(room.world).id)
  })

  it("hands a mover's build this same builder, as its line says: build(r) builds at points from the mover's origin", () => {
    let given: Builder | null = null
    let part: { at(): Point } | null = null
    const room = testRoom((r, w) => {
      r.mover(
        (inner) => {
          given = inner
          part = inner.box([1, 0, 0], [1, 0.2, 1], { name: 'deck' })
        },
        () => ({ at: [3, 4, 0] }),
      )
      expect(given).toBe(r)
      plainRoom(r, w, NEVER)
    }, S1)
    expect(room.faults).toEqual([])
    expect(part!.at()).toEqual([4, 4, 0])
    expect(BUILDER_REF.mover).toContain('build(r) is called once, given this same builder r')
  })

  it('keeps the handles built with a use handler, in build order, for the scene (a faint halo in a dim room)', () => {
    const room = testRoom((r, w) => {
      r.box([-6, 0.5, 0], [1, 1, 1], { name: 'plain' })
      r.box([2, 0.5, 0], [1, 1, 1], { name: 'lever', use: () => {} })
      r.thing([4, 0, 0], cube(0.4, 0.4, 0.4), { name: 'bell', use: () => {} })
      plainRoom(r, w, NEVER)
    }, S2)
    expect(room.world.uses.map((id) => room.describe(id))).toEqual(["the solid 'lever'", "the thing 'bell'"])
  })

  it('plays the same on the same seed, the room drawing from its own stream', () => {
    const run = () => {
      const rt = new RoomRuntime()
      const room = buildRoom(
        (r, w) => {
          plainRoom(r, w, NEVER)
          for (let i = 0; i < 5; i++) r.thing([-2 + rt.math.random() * 6, 2 + rt.math.random() * 4, 0], cube(0.5, 0.5, 0.5))
          return () => {
            if (rt.math.random() < 0.05) w.players()[0].push([rt.math.random() * 4 - 2, 3, 0])
          }
        },
        S1,
        rt,
      )
      playRoom(room, 300, holdAll(room, RIGHT), () => NO_POINTING)
      return JSON.stringify(room.world)
    }
    expect(run()).toBe(run())
  })

  it("compiles made code against the runtime: the guard's turns count on its budget and Math is the room's", () => {
    const rt = new RoomRuntime()
    // As the guard writes it: __g() at the start of every function body and loop body.
    const looping = compile('function (r, w) { __g(); for (;;) { __g(); } }', 'room', rt.budget, { Math: rt.math, Date: undefined }) as RoomCode
    expect(() => buildRoom(looping, S1, rt)).toThrow(RoomBuildError)
    try {
      buildRoom(looping, S1, rt)
    } catch (err) {
      expect((err as RoomBuildError).sentence).toBe(MISTAKES.buildLong())
    }
    const draws: number[][] = []
    for (let k = 0; k < 2; k++) {
      const seeded = new RoomRuntime()
      const code = compile(
        "function (r, w) { __g(); w.players()[0].putAt([0, 0, 0]); r.wayOut([5, 0, 0]); r.steps([{ hint: { en: 'go', fi: 'mene' }, at: [0, 0, 0], done: () => { __g(); return false } }]); r.sign([0, 5, 0], Math.random()); r.sign([1, 5, 0], Math.random()) }",
        'room',
        seeded.budget,
        { Math: seeded.math, Date: undefined },
      ) as RoomCode
      const room = buildRoom(code, S1, seeded)
      draws.push(room.world.signs.map((s) => s.what as number))
    }
    expect(draws[0]).toEqual(draws[1])
    expect(draws[0][0]).not.toBe(draws[0][1])
  })

  it('refuses every builder call once the room has been built, and play goes on', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      return () => {
        r.box([0, 3, 0], [1, 1, 1])
      }
    }, S1)
    frames(room, 3)
    expect(room.faults).toHaveLength(1)
    expect(room.faults[0].sentence).toBe(`the frame function: ${MISTAKES.afterBuild('r.box')}`)
    expect(room.faults[0].count).toBe(3)
    expect(room.world.solids.every((s) => s.house)).toBe(true)
  })

  it('skips a handler that throws, keeps the sentence for the trial, and plays on', () => {
    let after = 0
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      w.after(0.1, () => (after += 1))
      return () => {
        throw new Error('boom')
      }
    }, S1)
    frames(room, 30)
    expect(after).toBe(1)
    expect(sentences(room)).toEqual([MISTAKES.thrown('the frame function', 'Error: boom')])
  })
})

describe('the builder and the world have exactly the calls their reference names', () => {
  it('r, w and the kit', () => {
    let kit: RoomKit | null = null
    const look: Model = (m) => {
      kit = m
      m.box(1, 1, 1)
    }
    let faces: object[] = []
    testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.decor([0, 0, -1], look)
      faces = [r, w]
    }, S1)
    expect(sorted(faces[0])).toEqual(sorted(BUILDER_REF))
    expect(sorted(faces[1])).toEqual(sorted(WORLD_REF))
    expect(kit).not.toBeNull()
    expect(sorted(kit as unknown as object)).toEqual(sorted({ ...KIT_SHAPES_REF, ...ROOM_PART_REF }))
  })
})

describe('mistakes come back as their sentences', () => {
  const plainWith = (more: (r: Builder, w: World) => void): RoomCode => (r, w) => {
    plainRoom(r, w, NEVER)
    more(r, w)
  }
  const plainW = (more: (w: World) => void): RoomCode => (r, w) => {
    plainRoom(r, w, NEVER)
    more(w)
  }
  const cases: [string, RoomCode, string][] = [
    ['notCalled, a call used as a number', plainW((w) => void ((w.players()[0].at as unknown as number) >= 1)), MISTAKES.notCalled('player', 'at')],
    ['notCalled, a call read into', plainW((w) => void (w.players()[0].at as unknown as number[])[0]), MISTAKES.notCalled('player', 'at')],
    ['notCalled, a zone weight compared', plainWith((r) => void ((r.zone([0, 1, 0], [1, 1, 1]).weight as unknown as number) >= 1)), MISTAKES.notCalled('zone', 'weight')],
    ['frozen', plainW((w) => void ((w.players()[0] as unknown as { x: number }).x = 1)), MISTAKES.frozen('player', 'x')],
    ['frozenList, a list', plainW((w) => void (w.players() as Player[]).push(w.players()[0])), MISTAKES.frozenList()],
    ['frozenList, a point', plainW((w) => void ((w.players()[0].at() as unknown as number[])[0] = 1)), MISTAKES.frozenList()],
    ['notPoint', plainWith((r) => void r.box(bad([1, 2]), [1, 1, 1])), MISTAKES.notPoint('r.box', 'at', '[1, 2]')],
    ['notPoint, a handle for a point', plainWith((r, w) => void r.box(bad(w.players()[0]), [1, 1, 1])), MISTAKES.notPoint('r.box', 'at', 'a handle (its point is .at())')],
    ['notNumber', plainWith((r) => void r.box([Number.NaN, 0, 0], [1, 1, 1])), MISTAKES.notNumber('r.box', 'at')],
    ['unknownOption', plainWith((r) => void r.box([0, 3, 0], [1, 1, 1], bad({ colour: 'red' }))), MISTAKES.unknownOption('r.box', 'colour', [...Object.keys(SHARED_OPTS_REF), ...Object.keys(CONTACT_OPTS_REF), ...Object.keys(SOLID_OPTS_REF)])],
    ['tooManyLamps', plainWith((r) => { for (let i = 0; i <= BUDGET.lamps; i++) r.lamp([i - 6, 6, 1]) }), MISTAKES.tooManyLamps(BUDGET.lamps + 1)],
    ['buildLighter', plainWith((r) => { for (let i = 0; i <= BUDGET.pieces; i++) r.box([0, 4, 0], [0.1, 0.1, 0.1]) }), MISTAKES.buildLighter(BUDGET.pieces + 1)],
    ['buildLong', plainW((w) => { for (;;) w.time() }), MISTAKES.buildLong()],
    ['sameName', plainWith((r) => { r.box([0, 3, 0], [1, 1, 1], { name: 'a' }); r.box([2, 3, 0], [1, 1, 1], { name: 'a' }) }), MISTAKES.sameName('a')],
    ['controlsWho', plainWith((r) => r.controls(bad({ stick: 'fly' }), bad(undefined))), MISTAKES.controlsWho()],
    ['controlsWho, not a player', plainWith((r) => r.controls(bad([r.box([0, 3, 0], [1, 1, 1])]), { stick: 'walk' })), MISTAKES.controlsWho()],
    ['sameJob', plainWith((r, w) => r.controls(w.players(), { a: 'grab' })), MISTAKES.sameJob('grab')],
    ['noJump', plainWith((r, w) => r.controls(w.players(), { stick: 'fly' })), MISTAKES.noJump('fly')],
    ['noGrab', plainWith((r, w) => { r.controls(w.players(), { b: null }); r.thing([2, 0, 0], cube(0.5, 0.5, 0.5), { use: () => {} }) }), MISTAKES.noGrab('the thing at 2, 0')],
    ['inMover, a thing', plainWith((r) => void r.mover(() => r.thing([0, 0, 0], cube(0.5, 0.5, 0.5)), () => ({ at: [0, 4, 0] }))), MISTAKES.inMover('r.thing')],
    ['inMover, a mover', plainWith((r) => void r.mover(() => r.mover(() => {}, () => ({ at: [0, 0, 0] })), () => ({ at: [0, 4, 0] }))), MISTAKES.inMover('r.mover')],
    ['moverPart', plainWith((r) => { let part = r.box([0, 0.5, 0], [1, 1, 1]); r.mover(() => (part = r.box([0, 0, 0], [1, 0.2, 1])), () => ({ at: [0, 4, 0] })); part.putAt([1, 4, 0]) }), MISTAKES.moverPart('solid.putAt')],
    ['placeNotPure', plainWith((r) => { let k = 0; r.mover(() => r.box([0, 0, 0], [1, 0.2, 1]), () => ({ at: [(k += 1), 4, 0] })) }), MISTAKES.placeNotPure(0)],
    ['placeLong', plainWith((r, w) => void r.mover(() => r.box([0, 0, 0], [1, 0.2, 1]), (t) => { for (let i = 0; i <= BUDGET.placeTurns; i++) w.time(); return { at: [t, 4, 0] } })), MISTAKES.placeLong()],
    ['ruleNotContest', plainWith((r) => r.rule({ en: 'win', fi: 'voita' })), MISTAKES.ruleNotContest()],
    ['clockSecs', plainWith((r) => r.clock(60)), MISTAKES.clockSecs(60)],
    ['wayOut, twice', plainWith((r) => r.wayOut([0, 0, 0])), MISTAKES.wayOut(2)],
    ['stepCount, twice', plainWith((r) => r.steps(NEVER)), MISTAKES.calledTwice('r.steps', 2)],
    ['notReturn', (r, w) => { plainRoom(r, w, NEVER); return bad(3) }, MISTAKES.notReturn('3')],
  ]
  for (const [name, code, sentence] of cases) it(name, () => expect(buildSentence(code, S1)).toBe(sentence))

  it('noField names what a handle does have', () => {
    expect(buildSentence(plainW((w) => void (w.players()[0] as unknown as { x: number }).x), S1)).toBe(
      MISTAKES.noField('player', 'x', ['kind', 'at', 'velocity', 'facing', 'stick', 'button', 'holding', 'standingOn', 'score', 'color', 'glow', 'putAt', 'push', 'change', 'bonk', 'give', 'drop', 'addScore']),
    )
  })

  it("walkCall: the room's w says that w.get is the walkthrough's", () => {
    expect(buildSentence(plainW((w) => void (w as unknown as { get: (name: string) => unknown }).get('floor')), S1)).toBe(
      MISTAKES.walkCall('get', ['time', 'level', 'players', 'pointers', 'stepsDone', 'after', 'puff', 'sound', 'shake', 'pop', 'finish']),
    )
  })

  it("the words a child sees: notWords, tooManyWords, dash", () => {
    const hinted = (hint: unknown): RoomCode => (r, w) => {
      plainRoom(r, w, [{ hint: bad(hint), at: [0, 0, 0], done: () => false }])
    }
    const where = "r.steps: step 1's hint"
    expect(buildSentence(hinted('go there'), S1)).toBe(MISTAKES.notWords(where))
    expect(buildSentence(hinted({ en: 'go' }), S1)).toBe(MISTAKES.notWords(where))
    expect(buildSentence(hinted({ en: 'one two three four five six seven eight nine', fi: 'mene' }), S1)).toBe(MISTAKES.tooManyWords(where, 'English', 9, 8))
    expect(buildSentence(hinted({ en: 'go now', fi: 'mene — nyt' }), S1)).toBe(MISTAKES.dash(where))
    // A hyphen inside a word is the word's own.
    expect(() => testRoom(hinted({ en: 'go now', fi: 'linja-auto' }), S1)).not.toThrow()
  })

  it('stepCount', () => {
    const many = Array.from({ length: BUDGET.steps + 1 }, () => NEVER[0])
    expect(buildSentence((r, w) => void plainRoom(r, w, []), S1)).toBe(MISTAKES.stepCount(0, false))
    expect(buildSentence((r, w) => void plainRoom(r, w, many), S1)).toBe(MISTAKES.stepCount(BUDGET.steps + 1, false))
    expect(buildSentence((r, w) => void plainRoom(r, w, [NEVER[0], NEVER[0]]), C2)).toBe(MISTAKES.stepCount(2, true))
    expect(
      buildSentence((r, w) => {
        w.players()[0].putAt([0, 0, 0])
        r.wayOut([5, 0, 0])
      }, S1),
    ).toBe(MISTAKES.stepCount(0, false))
  })

  it('wayOut, left out', () => {
    const noWayOut: RoomCode = (r, w) => {
      w.players()[0].putAt([0, 0, 0])
      r.steps(NEVER)
    }
    expect(buildSentence(noWayOut, S1)).toBe(MISTAKES.wayOut(0))
  })

  it('noStart, startInAir and startStuck', () => {
    expect(buildSentence((r, w) => { plainRoom(r, w, NEVER); w.players()[1].putAt([0, 3, 0]) }, S2)).toBe(MISTAKES.startInAir(1, [0, 3, 0]))
    expect(
      buildSentence((r, w) => {
        w.players()[0].putAt([0, 0, 0])
        r.wayOut([5, 0, 0])
        r.steps(NEVER)
      }, S2),
    ).toBe(MISTAKES.noStart(1))
    expect(buildSentence((r, w) => { plainRoom(r, w, NEVER); r.box([-4, 0.5, 0], [2, 1, 2]) }, S1)).toBe(MISTAKES.startStuck(0, [-4, 0, 0], 'their body is inside the solid at -4, 0.5'))
    expect(buildSentence((r, w) => { plainRoom(r, w, NEVER); r.box([-4.5, 1.5, 0], [0.4, 3, 2]); r.box([-3.5, 1.5, 0], [0.4, 3, 2]) }, S1)).toBe(
      MISTAKES.startStuck(0, [-4, 0, 0], 'solids on both sides leave no room to walk'),
    )
  })

  it('randomInPlace', () => {
    const rt = new RoomRuntime()
    try {
      buildRoom(plainWith((r) => void r.mover(() => r.box([0, 0, 0], [1, 0.2, 1]), () => ({ at: [rt.math.random(), 4, 0] }))), S1, rt)
      throw new Error('the room built')
    } catch (err) {
      expect((err as RoomBuildError).sentence).toBe(MISTAKES.randomInPlace())
    }
  })

  it('frameLong: all the room code of one frame shares one budget', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.zone([-4, 1, 0], [2, 2, 2], { stay: () => { for (let i = 0; i < 15_000; i++) w.time() } })
      return () => {
        for (let i = 0; i < 6_000; i++) w.time()
      }
    }, S1)
    frames(room, 2)
    expect(sentences(room)).toEqual([MISTAKES.frameLong('the frame function')])
  })

  it('placeLong and placeNotPure in play', () => {
    let open = false
    let long = false
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.mover(() => r.box([0, 0, 0], [1, 0.2, 1]), (t) => ({ at: [open ? 3 : 0, 4 + 0 * t, 0] }))
      r.mover(() => r.box([0, 0, 0], [1, 0.2, 1]), (t) => {
        if (long) for (let i = 0; i <= BUDGET.placeTurns; i++) w.time()
        return { at: [5, 4 + t * 0, 0] }
      })
      return () => {
        if (w.time() > 0.5) open = true
        if (w.time() > 1.5) long = true
      }
    }, S1)
    frames(room, 120)
    expect(sentences(room)).toContain(MISTAKES.placeNotPure(0))
    expect(sentences(room)).toContain(`${MISTAKES.placeLong()}`)
    // The mover whose place throws stays where it last was.
    expect(room.world.movers[1].at).toEqual([5, 4, 0])
  })

  it('order, and stepUndone', () => {
    const contest = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      return () => w.finish()
    }, C2)
    frames(contest, 1)
    expect(sentences(contest)).toEqual([`the frame function: ${MISTAKES.order(true)}`])
    const together = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      return () => w.finish([...w.players()])
    }, S2)
    frames(together, 1)
    expect(sentences(together)).toEqual([`the frame function: ${MISTAKES.order(false)}`])
    const early = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      return () => w.finish()
    }, S1)
    frames(early, 2)
    expect(sentences(early)).toEqual([MISTAKES.stepUndone(1, 1)])
    expect(early.world.end?.by).toBe('finish')
  })

  it('notDone: a done() that gives back no boolean', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, [{ hint: HINT, at: [0, 0, 0], done: bad(() => 1) }])
    }, S1)
    frames(room, 1)
    expect(sentences(room)).toEqual([MISTAKES.notDone(1, '1')])
    expect(room.world.next).toBe(0)
  })
})

describe('the budget', () => {
  it('counts one piece a handle and each shape of a model each time it is placed', () => {
    const three: Model = (m) => {
      m.box(1, 1, 1)
      m.sphere(0.3, { at: [0, 1.3, 0] })
      m.cone(0.2, 0.4, { at: [0, 1.8, 0] })
    }
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      for (let i = 0; i < 4; i++) r.decor([i, 0, -1], three)
      r.thing([2, 0, 0], three)
      r.box([3, 3, 0], [1, 1, 1], { model: three })
      r.zone([0, 1, 0], [1, 1, 1])
      r.controls(w.players(), { a: { word: { en: 'ring', fi: 'soita' }, icon: three } })
    }, S2)
    // 4 decor, a thing, a box and a zone are 7 handles (the house's own solids are the house's); the model is placed 8 times, twice of them as a button's picture.
    expect(room.survey.pieces).toBe(7 + 3 * 8)
    expect(room.world.models).toHaveLength(1)
  })

  it('counts every call into the engine as a turn, kit calls too', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.decor([0, 0, -1], (m) => m.box(1, 1, 1))
      w.time()
    }, S1)
    // plainRoom: players, putAt, wayOut, steps (4); then decor, the kit's box and time (3).
    expect(room.survey.turns).toBe(7)
  })
})

describe('FRAME_ORDER', () => {
  it('calls the handlers of one frame in its order', () => {
    const log: [number, FramePhase][] = []
    const room = testRoom((r, w) => {
      const at = (phase: FramePhase) => () => void log.push([Math.round(w.time() * 60), phase])
      r.box([3, 0.1, 0], [1, 0.2, 2], { touch: at('contacts'), land: at('contacts'), tap: at('taps') })
      r.thing([3, 3, 0], cube(0.5, 0.5, 0.5))
      r.zone([3, 1, 0], [2, 2, 2], { enter: at('zones'), stay: at('zones'), leave: at('zones') })
      r.mover(
        () => r.box([0, 0, 0], [1, 0.2, 2]),
        (t) => {
          at('movers')()
          return { at: [-6, 5 + t * 0, 0] }
        },
      )
      r.box([-2, 0.5, 0], [0.4, 1, 2], { use: at('players') })
      const [p0, p1] = w.players()
      p0.putAt([-2.5, 0, 0])
      p1.putAt([-5, 0, 0])
      r.controls([p0], { a: { word: { en: 'ring', fi: 'soita' }, icon: cube(0.3, 0.3, 0.3), press: at('buttons'), hold: at('buttons') } })
      r.wayOut([6, 0, 0])
      r.steps([{ hint: HINT, at: [0, 0, 0], done: () => (at('steps')(), false) }])
      const timer = () => {
        at('timers')()
        w.after(0, timer)
      }
      w.after(0, timer)
      return at('frame')
    }, S2)
    const pointing: Pointing = { taps: [{ at: [3, 0.1, 0] }], held: [] }
    // 59 frames: on the 60th the room asks each mover's place again, after the frame, to hold it to the same t giving the same place.
    playRoom(room, 59, (f) => [{ stick: [0, 0], a: true, b: f % 2 === 0 }, IDLE], () => pointing)
    const inPlay = log.filter(([f]) => f > 0)
    for (let f = 1; f <= 59; f++) {
      const order = inPlay.filter(([g]) => g === f).map(([, phase]) => FRAME_ORDER.indexOf(phase))
      expect(order, `frame ${f}`).toEqual([...order].sort((a, b) => a - b))
    }
    const seen = new Set(inPlay.map(([, phase]) => phase))
    for (const phase of ['buttons', 'taps', 'movers', 'players', 'contacts', 'zones', 'timers', 'frame', 'steps'] as const) expect(seen.has(phase), phase).toBe(true)
  })

  it('within a phase goes by the build order of the handle, then by seat', () => {
    const log: string[] = []
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      const ps = w.players()
      r.zone([-3, 1, 0], [4, 2, 2], { enter: (who: Who) => log.push(`a${ps.indexOf(who as Player)}`) })
      r.zone([-3, 1, 0], [4, 2, 2], { enter: (who: Who) => log.push(`b${ps.indexOf(who as Player)}`) })
    }, S2)
    frames(room, 1)
    expect(log).toEqual(['a0', 'a1', 'b0', 'b1'])
  })

  it('w.finish ends the room at the end of its frame, after the steps were asked', () => {
    let doneAsked = -1
    let finishedAt = -1
    const room = testRoom((r, w) => {
      plainRoom(r, w, [{ hint: HINT, at: [0, 0, 0], done: () => ((doneAsked = w.time()), w.time() > 0.5) }])
      return () => {
        if (w.stepsDone() === 0 && w.time() > 0.5 && finishedAt < 0) {
          finishedAt = w.time()
          w.finish()
          w.finish()
        }
      }
    }, S1)
    frames(room, 60)
    expect(room.faults).toEqual([])
    expect(room.world.end?.at).toBe(finishedAt)
    expect(room.world.steps[0].doneAt).toBe(finishedAt)
    expect(doneAsked).toBe(finishedAt)
    expect(room.world.wayOut.open).toBe(true)
  })
})

describe('steps', () => {
  it('only the next step is asked, they turn done in order and stay done, and an early one is noted', () => {
    const asked: number[] = []
    let x = 0
    const room = testRoom(
      (r, w) =>
        void plainRoom(r, w, [
          { hint: HINT, at: [0, 0, 0], done: () => (asked.push(0), w.time() > 0.2) },
          { hint: HINT, at: w.players()[0], done: () => (asked.push(1), true) },
          { hint: HINT, at: [0, 0, 0], done: () => (asked.push(2), (x += 1) > 3) },
        ]),
      S1,
    )
    frames(room, 30)
    expect(asked.slice(0, 13)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(room.world.next).toBe(3)
    expect(room.steps.map((s) => s.early)).toEqual([false, true, false])
    expect(room.world.steps.every((s) => s.doneAt !== null)).toBe(true)
    // A step at a handle follows it.
    expect(room.world.steps[1].target).toBe(room.world.players[0].id)
  })
})

describe("the builder's calls do what their lines say", () => {
  it("the room's box is the house's, the same in every room, and the camera shows it whole with the house's walls, floor and beam round it (SIDE_FRAME)", () => {
    const room = testRoom((r, w) => void plainRoom(r, w, NEVER), S1)
    expect(room.world.bounds).toEqual(ROOM_BOUNDS.side)
    expect(ROOM_BOUNDS.side).toEqual({ min: [-ROOM.side.width / 2, 0, ROOM.side.back], max: [ROOM.side.width / 2, ROOM.side.height, ROOM.side.front] })
    expect(room.world.camera).toEqual(SIDE_FRAME)
    expect(SIDE_FRAME).toEqual({ x: 0, y: 4, width: 16.6, height: 8.8 })
    expect(room.world.floorFrame).toBeNull()
  })

  it('r.box: a solid box with its middle at at, its z set to 0 and noted', () => {
    let at: Point = [9, 9, 9]
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      at = r.box([2, 3, 2], [2, 1, 2]).at()
    }, S1)
    expect(at).toEqual([2, 3, 0])
    expect(room.survey.notes).toContain(SURVEY_NOTES.zSet('r.box', 2))
    expect(room.survey.floors[0]).toMatchObject({ x0: 1, x1: 3, top: 3.5, bottom: 2.5, shape: 'box' })
  })

  it('r.ramp: a wedge rising toward rises, walked up', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.ramp([-1, 0.5, 0], [2, 1, 2], 'right')
      r.box([1, 0.5, 0], [2, 1, 2])
    }, S1)
    expect(room.survey.floors[0].slope).toBeCloseTo(26.57, 1)
    for (let i = 0; i < 200 && room.world.players[0].at[0] < 0.5; i++) playRoom(room, 1, holdAll(room, RIGHT), () => NO_POINTING)
    expect(room.world.players[0].at[1]).toBeCloseTo(1, 2)
  })

  it('r.ball: a solid ball a thing comes to rest on', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.ball([3, 1, 0], 1)
      r.thing([3, 4, 0], cube(0.5, 0.5, 0.5))
    }, S1)
    frames(room, 120)
    expect(room.world.things[0].at[1]).toBeCloseTo(2, 1)
  })

  it('r.mover: parts measured from its origin, placed by place(t) on its own clock, carrying whoever stands on it', () => {
    let deck: { at(): Point } | null = null
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      w.players()[0].putAt([-4, 0.3, 0])
      r.mover(
        () => {
          deck = r.box([0, -0.15, 0], [3, 0.3, 2])
        },
        (t): MoverPlace => ({ at: [-4 + Math.min(t, 2), 0.3, 0] }),
      )
    }, S1)
    expect(deck!.at()).toEqual([-4, 0.15, 0])
    expect(room.world.players[0].on).toBe(room.world.solids[0].id)
    frames(room, 150)
    expect(deck!.at()[0]).toBeCloseTo(-2, 9)
    expect(room.world.players[0].at[0]).toBeCloseTo(-2, 1)
  })

  it('r.thing: falls and rests, is carried with grab if light, only pushed if heavy', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.thing([-3.4, 2, 0], cube(0.4, 0.4, 0.4))
      r.thing([2, 0, 0], cube(0.8, 0.8, 0.8), { weight: 1 })
      r.thing([4, 0, 0], cube(0.2, 0.2, 0.2), { scale: 2 })
    }, S1)
    frames(room, 60)
    expect(room.world.things[0].at[1]).toBeCloseTo(0, 2)
    expect(room.world.things[2].box.max[1]).toBeCloseTo(0.4, 9)
    playRoom(room, 2, (f) => [{ stick: [0, 0], a: false, b: f === 0 }], () => NO_POINTING)
    expect(room.world.things[0].heldBy).toBe(0)
  })

  it('r.decor: only seen, keeps its z', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.decor([-3, 0, 1.5], cube(1, 2, 0.2), { scale: 2 })
    }, S1)
    expect(room.world.decor[0]).toMatchObject({ at: [-3, 0, 1.5], scale: 2 })
    playRoom(room, 60, holdAll(room, RIGHT), () => NO_POINTING)
    expect(room.world.players[0].at[0]).toBeGreaterThan(-2)
  })

  it('r.zone: notices who is in it, a carried thing where the hands are; wind, pull, gravity and drag act', () => {
    const log: string[] = []
    let zone: Zone | null = null
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      zone = r.zone([-1, 1, 0], [2, 2, 2], { color: 'skyblue', enter: () => log.push('enter'), stay: (who: Who, dt: number) => void (dt === 1 / 60 || log.push(`bad dt for ${who.kind()}`)), leave: () => log.push('leave') })
      r.zone([5, 2, 0], [3, 4, 2], { wind: [0, 40, 0], drag: 2 })
    }, S1)
    expect(room.world.zones[0].color).toBe(parseColor('skyblue'))
    expect(room.world.zones[1].drag).toBe(1)
    playRoom(room, 50, holdAll(room, RIGHT), () => NO_POINTING)
    expect(log).toContain('enter')
    expect(log.filter((l) => l.startsWith('bad'))).toEqual([])
    playRoom(room, 60, holdAll(room, RIGHT), () => NO_POINTING)
    expect(log).toContain('leave')
    expect(zone!.inside()).toEqual([])
  })

  it('r.lamp: its defaults', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.lamp([0, 6, 1])
      r.lamp([1, 6, 1], { color: 'red', power: 3, reach: 2 })
    }, S1)
    expect(room.world.lamps[0]).toMatchObject({ at: [0, 6, 1], power: DEFAULTS.lampPower, reach: DEFAULTS.lampReach })
    expect(room.world.lamps[1]).toMatchObject({ color: parseColor('red'), power: 1, reach: 2 })
  })

  it('r.sign: a number, words, a count or a clock that starts when shown', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.sign([0, 5, 0], 7)
      r.sign([1, 5, 0], { en: 'pick me', fi: 'valitse minut' })
      r.sign([2, 5, 0], { count: 2, of: 5 })
      const clock = r.sign([3, 5, 0], { clock: 10 }, { hidden: true })
      w.after(1, () => clock.show())
    }, S1)
    expect(room.world.signs.map((s) => s.what)).toEqual([7, { en: 'pick me', fi: 'valitse minut' }, { count: 2, of: 5 }, { clock: 10, from: 0 }])
    frames(room, 61)
    expect(room.world.signs[3].what).toEqual({ clock: 10, from: 1 })
    expect(buildSentence((r, w) => { plainRoom(r, w, NEVER); r.sign([0, 5, 0], bad('hi')) }, S1)).toBe(MISTAKES.notSign('r.sign'))
    expect(buildSentence((r, w) => { plainRoom(r, w, NEVER); r.sign([0, 5, 0], { en: 'one two three four five', fi: 'yksi' }) }, S1)).toBe(MISTAKES.tooManyWords('r.sign', 'English', 5, 4))
  })

  it("the shell: the world keeps the room's, a solid given no colour takes its floor's colour and is plain, and one given any option of its own is not", () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.box([2, 3, 0], [2, 0.5, 2], { name: 'ledge', turn: 0.1 })
      r.box([-2, 3, 0], [2, 0.5, 2], { color: 'navy' })
      r.box([0, 5, 0], [2, 0.5, 2], { touch: () => {} })
    }, S1)
    expect(room.world.shell).toEqual(HOUSE_SHELL)
    // The room's three, then the house's own floor, walls and ceiling in the shell's colours.
    expect(room.world.solids.map((s) => [s.surface.color, s.plain, s.house])).toEqual([
      [HOUSE_SHELL.floor.color, true, false],
      [parseColor('navy'), false, false],
      [HOUSE_SHELL.floor.color, false, false],
      [HOUSE_SHELL.floor.color, false, true],
      [HOUSE_SHELL.walls.color, false, true],
      [HOUSE_SHELL.walls.color, false, true],
      [HOUSE_SHELL.ceiling.color, false, true],
    ])
  })

  it('r.wayOut: shut until the room is finished, then open', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, steps(() => w.time() > 0.1))
      return () => {
        if (w.stepsDone() === 1) w.finish()
      }
    }, S1)
    expect(room.world.wayOut).toEqual({ at: [6, 0, 0], open: false })
    frames(room, 20)
    expect(room.world.wayOut.open).toBe(true)
    expect(room.faults).toEqual([])
  })

  it("r.controls: everyone starts walking with jump and grab; a spec changes only what it gives; an own job's handlers get the player", () => {
    const got: string[] = []
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      const [p0, p1] = w.players()
      r.controls([p1], { stick: 'none', a: 'grab', b: null })
      r.controls([p0], {
        b: { word: { en: 'ring', fi: 'soita' }, icon: cube(0.3, 0.3, 0.3), press: (p) => got.push(`press ${p === p0}`), hold: (p, dt) => got.push(`hold ${p === p0 && dt === 1 / 60}`), release: () => got.push('release') },
      })
    }, S2)
    const [a, b] = room.world.players
    expect([a.stick, a.a]).toEqual(['walk', 'jump'])
    expect(a.b).toEqual({ word: { en: 'ring', fi: 'soita' }, icon: 0 })
    expect([b.stick, b.a, b.b]).toEqual(['none', 'grab', null])
    playRoom(room, 3, (f) => [{ stick: [0, 0], a: false, b: f < 2 }, IDLE], () => NO_POINTING)
    expect(got).toEqual(['press true', 'hold true', 'hold true', 'release'])
  })

  it('r.rule and r.clock: a contest says its rule, and its clock ends it by score', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.rule({ en: 'most stars wins', fi: 'eniten tähtiä voittaa' })
      r.clock(PASS.clockMin)
      w.players()[1].addScore(3)
    }, C2)
    expect(room.world.rule).toEqual({ en: 'most stars wins', fi: 'eniten tähtiä voittaa' })
    frames(room, PASS.clockMin * 60)
    expect(room.world.end).toMatchObject({ by: 'clock', order: [1, 0] })
  })

  it('r.pushing and r.tap: players push each other; a tap no handle takes goes to r.tap', () => {
    const taps: string[] = []
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.pushing(true)
      r.box([3, 2, 0], [1, 1, 1], { tap: (at) => taps.push(`box ${at.join(' ')}`) })
      r.tap((at) => taps.push(`room ${at.join(' ')}`))
    }, S1)
    expect(room.world.pushing).toBe(true)
    playRoom(room, 2, idle(room), (f) => ({ taps: [{ at: f === 0 ? [3, 2, 0] : [-3, 5, 0] }], held: [] }))
    expect(taps).toEqual(['box 3 2 0', 'room -3 5 0'])
  })
})

describe('the options every handle takes', () => {
  it('name: what the walkthrough finds it by', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.box([3, 2, 0], [1, 1, 1], { name: 'shelf' })
    }, S1)
    expect(room.made.names.get('shelf')).toBe(room.world.solids[0].id)
    expect(room.world.solids[0].name).toBe('shelf')
  })

  it('hidden: not drawn, touching nothing, a thing hanging where it was put until shown', () => {
    let thing: Thing | null = null
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      thing = r.thing([6, 3, 0], cube(0.4, 0.4, 0.4), { hidden: true })
      r.box([-2.5, 0.5, 0], [1, 1, 2], { hidden: true })
    }, S1)
    playRoom(room, 60, holdAll(room, RIGHT), () => NO_POINTING)
    expect(thing!.at()).toEqual([6, 3, 0])
    expect(room.world.players[0].at[0]).toBeGreaterThan(-2)
    thing!.show()
    frames(room, 60)
    expect(thing!.at()[1]).toBeCloseTo(0, 2)
  })
})

describe('contacts', () => {
  it('touch once each time they meet, land on coming down, use with grab within reach and never carried', () => {
    const log: string[] = []
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.box([-2, 0.15, 0], [1, 0.3, 2], { touch: () => log.push('touch'), land: () => log.push('land') })
      r.thing([-4.8, 0, 0], cube(0.4, 0.4, 0.4), { use: (p) => log.push(`use ${p === w.players()[0]}`) })
    }, S1)
    playRoom(room, 2, (f) => [{ stick: [0, 0], a: false, b: f === 0 }], () => NO_POINTING)
    expect(log).toEqual(['use true'])
    expect(room.world.things[0].heldBy).toBe(null)
    log.length = 0
    playRoom(room, 40, holdAll(room, RIGHT), () => NO_POINTING)
    expect(log.filter((l) => l === 'touch')).toHaveLength(1)
    expect(log).toContain('land')
  })
})

describe('surfaces', () => {
  it('bounce throws them that high above its top; belt carries whoever stands on it', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.box([0, 0.1, 0], [1, 0.2, 2], { bounce: 2 })
      r.box([4, 0.1, 0], [3, 0.2, 2], { belt: [1, 0, 0] })
      const [p0, p1] = w.players()
      w.after(0.05, () => {
        p0.putAt([0, 1.5, 0])
        p1.putAt([3, 0.2, 0])
      })
    }, S2)
    let top = 0
    for (let i = 0; i < 90; i++) {
      frames(room, 1)
      top = Math.max(top, room.world.players[0].at[1])
    }
    expect(top).toBeCloseTo(0.2 + 2, 1)
    expect(room.world.players[1].at[0]).toBeGreaterThan(3.9)
  })
})

describe("the world's calls do what their lines say", () => {
  it('w.time is 0 while building; puff, sound, shake and pop wait for play, then show', () => {
    let atBuild = -1
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      atBuild = w.time()
      w.puff([0, 1, 0], 'heart')
      w.sound('ding')
      w.shake(0.5)
      w.pop([0, 1, 0], 3)
      return () => {
        if (w.time() < 0.02) {
          w.puff([0, 1, 0], 'heart', { color: 'red', count: 99, size: 0.3 })
          w.sound('ding')
          w.shake(3)
          w.pop([0, 2, 0], { en: 'well done', fi: 'hyvin tehty' })
        }
      }
    }, S1)
    expect(atBuild).toBe(0)
    expect([room.world.puffs.length, room.world.sounds.length, room.world.shakes.length, room.world.pops.length]).toEqual([0, 0, 0, 0])
    frames(room, 1)
    expect(room.world.puffs).toHaveLength(DEFAULTS.puffMax)
    expect(room.world.puffs[0]).toMatchObject({ kind: 'heart', color: parseColor('red') })
    expect(room.world.sounds.map((s) => s.name)).toContain('ding')
    expect(room.world.shakes[0].strength).toBe(1)
    expect(room.world.pops[0].what).toEqual({ en: 'well done', fi: 'hyvin tehty' })
    expect(buildSentence((r, w) => { plainRoom(r, w, NEVER); w.puff([0, 0, 0], bad('glitter')) }, S1)).toContain("w.puff: kind is 'glitter'")
    expect(buildSentence((r, w) => { plainRoom(r, w, NEVER); w.sound(bad('bang')) }, S1)).toContain("w.sound: name is 'bang'")
    expect(buildSentence((r, w) => { plainRoom(r, w, NEVER); w.pop([0, 0, 0], { en: 'one two three four', fi: 'yksi' }) }, S1)).toBe(MISTAKES.tooManyWords('w.pop', 'English', 4, 3))
  })

  it('w.pointers: where fingers are held now, frozen, empty when none', () => {
    const seen: (readonly Point[])[] = []
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      return () => void seen.push(w.pointers())
    }, S1)
    playRoom(room, 2, idle(room), (f) => ({ taps: [], held: f === 0 ? [[1, 2, 0], [3, 4, 5]] : [] }))
    expect(seen[0]).toEqual([[1, 2, 0], [3, 4, 0]])
    expect(Object.isFrozen(seen[0]) && Object.isFrozen(seen[0][0])).toBe(true)
    expect(seen[1]).toEqual([])
  })

  it('w.after runs fn once, secs from now, in the order set', () => {
    const log: string[] = []
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      w.after(0.5, () => log.push(`b ${w.time().toFixed(2)}`))
      w.after(0.5, () => log.push(`c ${w.time().toFixed(2)}`))
      w.after(0.25, () => {
        log.push(`a ${w.time().toFixed(2)}`)
        w.after(0.25, () => log.push(`d ${w.time().toFixed(2)}`))
      })
    }, S1)
    frames(room, 60)
    expect(log).toEqual(['a 0.25', 'b 0.50', 'c 0.50', 'd 0.50'])
  })
})

describe('the survey of the room as built', () => {
  it("gives its floors (the room's own, each dressable or not), the gaps between them, its things, zones, movers, players and steps", () => {
    const room = testRoom((r, w) => {
      r.box([-5, 0.5, 0], [6, 1, 2], { name: 'left' })
      r.box([4, 1, 0], [6, 2, 2], { name: 'right', color: 'tan' })
      r.thing([-4, 1, 0], cube(0.5, 0.5, 0.5), { name: 'crate', weight: 1 })
      r.zone([5, 3, 0], [2, 2, 2], { name: 'goal' })
      r.mover(() => r.box([0, 0, 0], [1, 0.2, 1]), () => ({ at: [0, 3, 0] }), { name: 'lift' })
      w.players()[0].putAt([-6, 1, 0])
      r.wayOut([6, 2, 0])
      r.steps([{ hint: HINT, at: [5, 2, 0], done: () => false }])
    }, S1)
    const s = room.survey
    expect(s.floors.map((f) => [f.name, f.x0, f.x1, f.top, f.dressable])).toEqual([
      ['left', -8, -2, 1, true],
      ['right', 1, 7, 2, false],
      [null, -0.5, 0.5, 3.1, false],
    ])
    expect(s.gaps).toEqual([{ from: room.world.solids[0].id, to: room.world.solids[1].id, across: 3, up: 1 }])
    expect(s.things[0]).toMatchObject({ name: 'crate', at: [-4, 1, 0], width: 0.5, height: 0.5, weight: 1, carried: false })
    expect(s.zones[0]).toMatchObject({ name: 'goal', x0: 4, x1: 6, y0: 2, y1: 4 })
    expect(s.movers[0]).toMatchObject({ name: 'lift', at: [0, 3, 0] })
    expect(s.players).toEqual([{ seat: 0, at: [-6, 1, 0], on: room.world.solids[0].id }])
    expect(s.wayOut).toEqual([6, 2, 0])
    expect(s.steps).toEqual([{ hint: HINT, at: [5, 2, 0] }])
    expect(room.made.names.get('lift')).toBe(room.world.movers[0].id)
    const text = surveyText(s, (id) => room.describe(id)).split('\n')
    expect(text[0]).toBe("The house: its floor's top at y 0, its walls at x -8 and 8, its ceiling at y 8; everything stands inside them.")
    expect(text).toContain("- the solid 'left', a box: x -8 to -2, top 1, bottom 0; dressable")
    expect(text).toContain("- the solid 'right', a box: x 1 to 7, top 2, bottom 0")
  })
})

describe("options of solids and things", () => {
  it('turn, ice, a model drawn in place of the plain shape; round, weight', () => {
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      r.box([3, 3, 0], [2, 0.3, 2], { turn: 0.3, ice: true, color: 'green', model: cube(2, 0.3, 2) })
      r.thing([2, 0, 0], cube(0.5, 0.5, 0.5), { round: true })
      r.thing([-2, 0, 0], cube(0.8, 0.8, 0.8), { weight: 2 })
    }, S1)
    expect(room.world.solids[0]).toMatchObject({ turn: 0.3, model: 0, surface: { ice: true, color: parseColor('green') } })
    expect(room.world.things[0]).toMatchObject({ round: true, weight: DEFAULTS.thingWeight })
    // A thing heavier than the one pushing it does not move.
    playRoom(room, 60, () => [RIGHT], () => NO_POINTING)
    expect(room.world.things[1].at[0]).toBeCloseTo(-2, 2)
  })
})

describe('the house round every room', () => {
  const H1 = { ...S1, view: 'high' as const }
  /** A room for one with nothing of its own but its start, its way out and a step that is never done. */
  const bare = (at: Point, wayOut: Point): RoomCode => (r, w) => {
    w.players()[0].putAt(at)
    r.wayOut(wayOut)
    r.steps(NEVER)
  }

  it("builds its floor, walls and ceiling after the room's handles, so every handle the room builds keeps its id", () => {
    const code: RoomCode = (r, w) => {
      r.box([-4, 1, 0], [3, 0.4, 2], { name: 'ledge' })
      r.thing([2, 0, 0], cube(0.5, 0.5, 0.5), { name: 'crate' })
      r.zone([5, 1, 0], [2, 2, 2], { name: 'goal' })
      r.mover(() => r.box([0, 0, 0], [2, 0.3, 2], { name: 'part' }), () => ({ at: [0, 2, 0] }), { name: 'lift' })
      r.box([4, 2, 0], [2, 0.2, 2], { name: 'plank', through: true })
      r.lamp([0, 2.5, 1], { name: 'lamp' })
      r.sign([0, 2.5, 0], 3, { name: 'sign' })
      r.decor([-6, 0, -2], cube(1, 1, 1), { name: 'vase' })
      w.players().forEach((p, i) => p.putAt([-2 + i, 0, 0]))
      r.wayOut([7, 0, 0])
      r.steps(NEVER)
    }
    for (const view of ['side', 'high'] as RoomView[]) {
      const room = testRoom(code, { ...S2, view })
      // The players are 0 and 1; the room's handles take 2 on in build order (the mover before the part built in it), as they would with no house at all.
      const built = ['ledge', 'crate', 'goal', 'lift', 'part', 'plank', 'lamp', 'sign', 'vase'].map((n) => room.made.names.get(n))
      expect(built, view).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10])
      // Then the house, in HOUSE's order, after every one of them.
      const house = room.world.solids.filter((s) => s.house)
      expect(house.map((s) => s.id)).toEqual(HOUSE[view].map((_, k) => 11 + k))
      expect(house.map((s) => room.describe(s.id))).toEqual(HOUSE[view].map((h) => `the house's ${h.part}`))
      expect(house.every((s) => s.mover === null && !s.plain && room.made.builtAt.get(s.id) === undefined)).toBe(true)
      // The survey leaves the house out of its floors.
      expect(room.survey.floors.map((f) => f.id)).toEqual([2, 6, 7])
    }
  })

  it("is where the house's solids stand: the floor's top at y 0, the walls just past the room's box, and from the side the ceiling just over it", () => {
    const side = testRoom(bare([0, 0, 0], [7, 0, 0]), S1)
    const box = (room: Room, part: string) => {
      const s = room.world.solids.find((x) => x.house && room.describe(x.id) === `the house's ${part}`)
      if (s === undefined) throw new Error(part)
      const o = room.sim.outlines[room.sim.where[s.id].i]
      return room.world.view === 'high' ? [o.minX, o.y0, o.minY, o.maxX, o.y1, o.maxY].map((v) => Math.round(v * 100) / 100) : [o.minX, o.minY, o.maxX, o.maxY].map((v) => Math.round(v * 100) / 100)
    }
    expect(box(side, 'floor')).toEqual([-8.3, -0.4, 8.3, 0])
    expect(box(side, 'left wall')).toEqual([-8.3, 0, -8, 8])
    expect(box(side, 'right wall')).toEqual([8, 0, 8.3, 8])
    expect(box(side, 'ceiling')).toEqual([-8.3, 8, 8.3, 8.4])
    const high = testRoom(bare([0, 0, 0], [0, 0, -4]), H1)
    expect(box(high, 'floor')).toEqual([-7.3, -0.3, -4.3, 7.3, 0, 4.3])
    expect(box(high, 'left wall')).toEqual([-7.3, 0, -4, -7, 2.5, 4.3])
    expect(box(high, 'right wall')).toEqual([7, 0, -4, 7.3, 2.5, 4.3])
    expect(box(high, 'back wall')).toEqual([-7.3, 0, -4.3, 7.3, 2.5, -4])
  })

  it("counts the house's floor as a start's floor, in either view", () => {
    for (const start of [S1, H1]) {
      const room = testRoom(bare([-4, 0, 0], start.view === 'high' ? [0, 0, -4] : [7, 0, 0]), start)
      expect(room.world.players[0].on, start.view).toBe(houseFloor(room.world).id)
      expect(room.survey.players[0].on).toBe(houseFloor(room.world).id)
      expect(surveyText(room.survey, (id) => room.describe(id))).toContain(`Starts: player 0 at -4, 0${start.view === 'high' ? ', 0' : ''} on the house's floor.`)
    }
    expect(buildSentence(bare([-4, 0.5, 0], [7, 0, 0]), S1)).toBe(MISTAKES.startInAir(0, [-4, 0.5, 0]))
  })

  it("refuses the house's keys and the look's, each with its own sentence", () => {
    const reach = (key: string): RoomCode => (r, w) => {
      plainRoom(r, w, NEVER)
      ;(r as unknown as Record<string, () => void>)[key]()
    }
    for (const key of BUILDER_REFUSED.houseOwns) expect(buildSentence(reach(key), S1)).toBe(MISTAKES.houseOwns(`r.${key}`))
    for (const key of BUILDER_REFUSED.lookOnly) expect(buildSentence(reach(key), S1)).toBe(MISTAKES.lookOnly(`r.${key}`))
    expect(MISTAKES.houseOwns('r.bounds')).toBe("r.bounds is the house's: every room is the same size, seen whole and never followed, and its walls, floor, ceiling and light come from the answer's shell. Build only what is inside")
    expect(MISTAKES.lookOnly('r.prop')).toBe("r.prop is the look's: another designer dresses the room from what you build. The room code builds the play")
  })

  it('says outside for every body, zone, start, sign, way out and decor foot past the room, with 5 cm to spare; from the side z is not held to it', () => {
    const plainWith = (more: (r: Builder, w: World) => void): RoomCode => (r, w) => {
      plainRoom(r, w, NEVER)
      more(r, w)
    }
    const side: [RoomCode, string][] = [
      [plainWith((r) => void r.box([-9, 1, 0], [1, 1, 1])), MISTAKES.outside('r.box', [-9, 1, 0])],
      [plainWith((r) => void r.box([-6, 1, 0], [1, 1, 3.2])), MISTAKES.outside('r.box', [-6, 1, 0])],
      [plainWith((r) => void r.ramp([7.8, 0.5, 0], [1, 1, 1], 'left')), MISTAKES.outside('r.ramp', [7.8, 0.5, 0])],
      [plainWith((r) => void r.ball([0, 0.5, 0], 1)), MISTAKES.outside('r.ball', [0, 0.5, 0])],
      [plainWith((r) => void r.thing([0, 7.9, 0], cube(0.5, 0.5, 0.5))), MISTAKES.outside('r.thing', [0, 7.9, 0])],
      [plainWith((r) => void r.zone([0, 0.5, 0], [2, 2, 2])), MISTAKES.outside('r.zone', [0, 0.5, 0])],
      [plainWith((r) => void r.sign([0, 8.5, 0], 3)), MISTAKES.outside('r.sign', [0, 8.5, 0])],
      [plainWith((r) => void r.decor([9, 0, -2], cube(1, 1, 1))), MISTAKES.outside('r.decor', [9, 0, -2])],
      [plainWith((r) => void r.mover(() => r.box([0, 0, 0], [1, 0.2, 1]), () => ({ at: [8, 4, 0] }))), MISTAKES.outside('r.box', [8, 4, 0])],
      [plainWith((_, w) => w.players()[0].putAt([-9, 0, 0])), MISTAKES.outside("player 0's start", [-9, 0, 0])],
      [bare([0, 0, 0], [8.5, 0, 0]), MISTAKES.outside('r.wayOut', [8.5, 0, 0])],
    ]
    for (const [code, sentence] of side) expect(buildSentence(code, S1)).toBe(sentence)
    expect(MISTAKES.outside('r.box', [-9, 1, 0])).toBe(
      'r.box at -9, 1, 0 is outside the room: seen from the side everything stands within x -8 to 8 and y 0 to 8, on the house\'s floor or above it, and a solid is at most 3 m deep; seen from high up within x -7 to 7, z -4 to 4 and y 0 to 3',
    )
    // 5 cm of grace; and from the side a decor's z, or a body's before it is set to 0, is not held to the room.
    expect(() => testRoom(plainWith((r) => {
      r.box([0, 0.47, 0], [1, 1, 1])
      r.box([7.53, 3, 0], [1, 1, 1])
      r.decor([0, 0, -5], cube(1, 1, 1))
      r.box([-3, 3, 9], [1, 1, 1])
    }), S1)).not.toThrow()
    const high: [RoomCode, string][] = [
      [(r, w) => { bare([0, 0, 0], [0, 0, -4])(r, w); r.box([0, 0.5, -4.5], [1, 1, 1]) }, MISTAKES.outside('r.box', [0, 0.5, -4.5])],
      [(r, w) => { bare([0, 0, 0], [0, 0, -4])(r, w); r.box([0, 2.6, 0], [1, 1, 1]) }, MISTAKES.outside('r.box', [0, 2.6, 0])],
      [(r, w) => { bare([0, 0, 0], [0, 0, -4])(r, w); r.zone([0, 1, 3.5], [2, 2, 2]) }, MISTAKES.outside('r.zone', [0, 1, 3.5])],
      [bare([0, 0, 4.2], [0, 0, -4]), MISTAKES.outside("player 0's start", [0, 0, 4.2])],
    ]
    for (const [code, sentence] of high) expect(buildSentence(code, H1)).toBe(sentence)
  })

  it("checks the shell: its colours parsed, its patterns of the game's set, its light taken into 0.6 to 1 with a note", () => {
    const shell = (s: Partial<Shell>): Shell => ({ ...HOUSE_SHELL, ...s })
    const room = testRoom(bare([0, 0, 0], [7, 0, 0]), { ...S1, shell: shell({ walls: { color: 'red', second: '#123', pattern: 'stars' }, light: 0.4 }) })
    expect(room.world.shell.walls).toEqual({ color: parseColor('red'), second: parseColor('#123'), pattern: 'stars' })
    expect(room.world.shell.light).toBe(0.6)
    expect(room.survey.notes).toContain(SURVEY_NOTES.lightSet(0.4, 0.6))
    expect(testRoom(bare([0, 0, 0], [7, 0, 0]), { ...S1, shell: shell({ light: 1.5 }) }).world.shell.light).toBe(1)
    expect(buildSentence(bare([0, 0, 0], [7, 0, 0]), { ...S1, shell: shell({ floor: { ...HOUSE_SHELL.floor, color: 'blurple' } }) })).toBe(MISTAKES.notColor('the shell', 'floor.color', "'blurple'"))
    expect(buildSentence(bare([0, 0, 0], [7, 0, 0]), { ...S1, shell: shell({ ceiling: { ...HOUSE_SHELL.ceiling, pattern: bad('clouds') } }) })).toBe(
      MISTAKES.notChoice('the shell', 'ceiling.pattern', "'clouds'", PATTERN_ORDER),
    )
  })

  it('shows its frame (SIDE_FRAME, HIGH_FRAME) every frame, and lets nobody out by any stick or jump in a minute of random pressing', () => {
    const rooms: Record<RoomView, RoomCode> = {
      side: (r, w) => {
        r.box([-5, 2, 0], [3, 0.4, 2])
        r.box([4, 2.5, 0], [3, 0.4, 2], { through: true })
        r.box([0, 0.15, 0], [1, 0.3, 2], { bounce: 7 })
        r.ramp([-3.25, 0.5, 0], [1.5, 1, 2], 'left')
        r.zone([-6, 4, 0], [4, 8, 2], { wind: [-30, 10, 0] })
        r.zone([6, 4, 0], [4, 8, 2], { gravity: -1 })
        r.thing([2, 0, 0], cube(0.5, 0.5, 0.5))
        r.mover(() => r.box([0, 0, 0], [2, 0.3, 2]), (t) => ({ at: [3 * Math.sin(t), 6, 0] }))
        w.players().forEach((p, i) => p.putAt([-6 + 4 * i, 0, 0]))
        r.controls([w.players()[3]], { stick: 'fly', a: 'grab', b: null })
        r.wayOut([7, 0, 0])
        r.steps(NEVER)
      },
      high: (r, w) => {
        r.box([-4, 0.5, -2.5], [3, 1, 3])
        r.box([2.5, 0.2, -2], [1.5, 0.4, 1.5], { bounce: 7 })
        r.ramp([0, 0.5, -2.5], [2, 1, 3], 'left')
        r.zone([-5.5, 1.5, 0], [3, 3, 8], { wind: [-30, 10, 0] })
        r.zone([0, 1.5, 3], [14, 3, 2], { wind: [0, 0, 30] })
        r.zone([5.5, 1.5, -2], [3, 3, 4], { gravity: -1 })
        r.thing([1, 0, 1], cube(0.5, 0.5, 0.5))
        w.players().forEach((p, i) => p.putAt([-6 + 4 * i, 0, 1]))
        r.controls([w.players()[3]], { stick: 'fly', a: 'grab', b: null })
        r.wayOut([0, 0, -4])
        r.steps(NEVER)
      },
    }
    for (const view of ['side', 'high'] as RoomView[]) {
      const room = testRoom(rooms[view], { seed: 5, level: 1, kind: 'together', view, shell: HOUSE_SHELL, party: partyOf(4) })
      const w = room.world
      const { min, max } = w.bounds
      const holds = randomHolds(17, 4)
      let framesWrong = 0
      let outside = 0
      for (let f = 0; f < 3600; f++) {
        playRoom(room, 1, () => holds(f), () => NO_POINTING)
        if (JSON.stringify([w.camera, w.floorFrame]) !== JSON.stringify(view === 'side' ? [SIDE_FRAME, null] : [{ x: 0, y: 1.5, width: HIGH_FRAME.width, height: 3 }, HIGH_FRAME])) framesWrong += 1
        for (const p of w.players) {
          const hw = playerWidth(p) / 2
          const inX = p.at[0] - hw >= min[0] - 1e-6 && p.at[0] + hw <= max[0] + 1e-6
          const inY = p.at[1] >= min[1] - 1e-6 && p.at[1] + playerHeight(p) <= max[1] + 1e-6
          const inZ = view === 'side' || (p.at[2] - hw >= min[2] - 1e-6 && p.at[2] + hw <= max[2] + 1e-6)
          if (!inX || !inY || !inZ || p.back !== null) outside += 1
        }
      }
      expect(framesWrong, view).toBe(0)
      expect(outside, view).toBe(0)
      expect(room.faults, view).toEqual([])
    }
  })
})

describe('MISTAKES', () => {
  it('every sentence fires in these tests (or in checks.test.ts) but the trial own, which fire only in a trial (step 3)', () => {
    const firedHere = ['notCalled', 'noField', 'walkCall', 'frozen', 'frozenList', 'notPoint', 'notNumber', 'unknownOption', 'notWords', 'tooManyWords', 'dash', 'afterBuild', 'buildLighter', 'buildLong', 'frameLong', 'tooManyLamps', 'stepCount', 'noStart', 'startInAir', 'startStuck', 'sameName', 'controlsWho', 'sameJob', 'noJump', 'noGrab', 'inMover', 'moverPart', 'randomInPlace', 'placeLong', 'placeNotPure', 'order', 'ruleNotContest', 'wayOut', 'clockSecs', 'stepUndone', 'thrown', 'notSign', 'calledTwice', 'notReturn', 'notDone', 'houseOwns', 'lookOnly', 'outside']
    const firedInChecks = ['notColor', 'notFunction', 'notOptions', 'notSize', 'notText', 'notChoice', 'notHandle', 'notStep', 'notList', 'notPlace', 'noShapes']
    // trial/trial.test.ts fires these, and trial/trap.test.ts fires trapped.
    const trialOnly = ['sortOrder', 'stillEnded', 'stillBonked', 'stillFell', 'stillStep', 'randomFinished', 'trapped']
    expect(sorted(MISTAKES)).toEqual([...firedHere, ...firedInChecks, ...trialOnly].sort())
  })

  it("a made code mistake names the designer's line", () => {
    const rt = new RoomRuntime()
    const code = compile('function (r, w) {\n__g();\nr.box([1, 2], [1, 1, 1])\n}', 'room', rt.budget, { Math: rt.math, Date: undefined }) as RoomCode
    try {
      buildRoom(code, S1, rt)
      throw new Error('the room built')
    } catch (err) {
      expect((err as RoomBuildError).sentence).toBe(`${MISTAKES.notPoint('r.box', 'at', '[1, 2]')} (line 2)`)
    }
  })
})
