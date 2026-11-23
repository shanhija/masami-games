/**
 * The walk runner (trial/walk.ts): it plays a walkthrough a frame at a time through the seats' own
 * pads, reads the room through handles that only read, stops when the room ends, says its errors as
 * sentences with the walkthrough's line, counts the seconds every bot stood idle, stands a bot still
 * when asked, and plays the same every time. And every line of the walkthrough's reference (BOT_REF,
 * WALK_WORLD_REF in trial/api.ts) does what it says: the tests below are keyed by the lines' own
 * keys, so the compiler holds them to one test a line.
 */

import { describe, expect, it } from 'vitest'
import { FEEL, MISTAKES, type Builder, type Count, type Point, type RoomCode, type SignView, type ThingView, type World, type ZoneView } from '../engine/api'
import { sin } from '../engine/math'
import { cube } from '../engine/testing'
import { guardCode } from '../server/codeKinds'
import type { PartySize } from '../seats/types'
import { BOT_REF, BOT_TIMES, GOTO, UNTIL_SECS, WALK_MISTAKES, WALK_WORLD_REF, type WalkCode } from './api'
import { compileWalk, WALK_LONG, WalkRuntime } from './compile'
import { walkIn } from './testing'
import { WalkRun } from './walk'
import { buildRoom, RoomRuntime, stepRoom } from '../engine/room'
import { roomStart } from '../engine/testing'

/** A plain room on the house's floor, the players at their starts, the way out and a step never done, and whatever `build` adds. */
function room(starts: readonly Point[], build: (r: Builder, w: World) => void): RoomCode {
  return (r, w) => {
    build(r, w)
    w.players().forEach((p, i) => p.putAt(starts[i]))
    r.wayOut([-7, 0, 0])
    r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [0, 0, 0], done: () => false }])
  }
}

const one = (build: (r: Builder, w: World) => void) => room([[-6, 0, 0]], build)
/** A plain room for one with a shelf named 'shelf' up out of the way. */
const shelved = one((r) => void r.box([5, 3, 0], [1, 0.4, 2], { name: 'shelf' }))
const play = (code: RoomCode, party: PartySize, walk: WalkCode, secs: number) => walkIn(code, party, walk, null, secs)

/** A walkthrough compiled from text as Opus would write it, guarded as the server guards it. */
function compiled(text: string): { walk: WalkCode; runtime: WalkRuntime } {
  const g = guardCode('walk', text)
  if (!g.ok) throw new Error(g.error)
  const runtime = new WalkRuntime()
  return { walk: compileWalk(g.guarded, runtime), runtime }
}

const BOT_TESTS = {
  goTo: () => {
    // A point: the feet within GOTO.near; a zone: the feet inside; a solid: standing on it; a thing: within reach.
    const code = one((r) => {
      r.zone([4, 0.5, 0], [1, 1, 2], { name: 'pad' })
      r.box([6.5, 0.5, 0], [2, 1, 2], { name: 'block' })
      r.thing([-1, 0, 0], cube(0.4, 0.4, 0.4), { weight: 2, name: 'stone' })
    })
    const seen: string[] = []
    const walk: WalkCode = function* (bots, w) {
      const b = bots[0]
      yield* b.goTo([-3, 0, 0])
      seen.push(`point ${Math.abs(b.at()[0] + 3) <= GOTO.near}`)
      yield* b.goTo(w.get('stone'))
      const s = (w.get('stone') as ThingView).at()
      seen.push(`thing ${Math.abs(b.at()[0] - s[0]) - FEEL.width / 2 - 0.2 <= FEEL.reach}`)
      yield* b.goTo(w.get('pad'))
      seen.push(`zone ${(w.get('pad') as ZoneView).has(b)}`)
      yield* b.goTo(w.get('block'))
      seen.push(`solid ${b.standingOn() === w.get('block')}`)
    }
    const { run } = play(code, 1, walk, 30)
    expect(run.sentence).toBeNull()
    expect(seen).toEqual(['point true', 'thing true', 'zone true', 'solid true'])
  },
  press: () => {
    let presses = 0
    let holds = 0
    const code = one((r, w) => r.controls(w.players(), { b: { word: { en: 'Ring', fi: 'Soita' }, icon: cube(0.3, 0.3, 0.3), press: () => presses++, hold: () => holds++ } }))
    const { inputs } = play(
      code,
      1,
      function* (bots) {
        yield* bots[0].press('b')
        yield* bots[0].press('b')
      },
      5,
    )
    const frames = Math.round(BOT_TIMES.press * 60)
    expect(presses).toBe(2)
    expect(inputs.slice(0, frames).map((i) => i.pads[0].b.held)).toEqual([...Array(frames - 1).fill(true), false])
    expect(inputs.filter((i) => i.pads[0].b.pressed)).toHaveLength(2)
    expect(holds).toBe(2 * (frames - 1))
  },
  hold: () => {
    let holds = 0
    const code = one((r, w) => r.controls(w.players(), { b: { word: { en: 'Pull', fi: 'Vedä' }, icon: cube(0.3, 0.3, 0.3), hold: () => holds++ } }))
    play(code, 1, (bots) => bots[0].hold('b', 1.5), 5)
    expect(holds).toBe(90)
  },
  carry: () => {
    const code = one((r) => {
      r.thing([-2, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.3, name: 'cup' })
      r.thing([2, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.3, name: 'plate' })
      r.thing([3, 0, 0], cube(0.6, 0.6, 0.6), { weight: 2, name: 'rock' })
      r.thing([-4, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.3, name: 'ghost', hidden: true })
      r.zone([6.8, 0.5, 0], [1.2, 1, 2], { name: 'box' })
    })
    const got: boolean[] = []
    const walk: WalkCode = function* (bots, w) {
      got.push(yield* bots[0].carry(w.get('cup') as ThingView, [5, 0, 0]))
      got.push(yield* bots[0].carry(w.get('plate') as ThingView, w.get('box')))
      got.push(yield* bots[0].carry(w.get('ghost') as ThingView, [0, 0, 0]))
      yield* bots[0].carry(w.get('rock') as ThingView, [0, 0, 0])
    }
    const { room: r, run } = play(code, 1, walk, 60)
    expect(got).toEqual([true, true, false])
    const thing = (name: string) => r.world.things.find((t) => t.name === name)
    expect(Math.abs((thing('cup')?.at[0] ?? 0) - 5)).toBeLessThanOrEqual(GOTO.leave)
    expect(r.world.zones[0].inside).toContain(thing('plate')?.id)
    expect(run.sentence).toBe(WALK_MISTAKES.tooHeavy("'rock'", 2))
    // A zone the cup passes through in the bot's hands takes it (hides it, and puts it back where it began): the carry ends there.
    const taken = one((r, w) => {
      const cup = r.thing([-2, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.3, name: 'cup' })
      r.zone([2, 1.5, 0], [1, 1, 2], { enter: (who) => {
        if (who !== cup) return
        cup.hide()
        w.after(0.5, () => { cup.putAt([-2, 0, 0]); cup.show() })
      } })
    })
    const gotTaken: boolean[] = []
    const takenRun = play(taken, 1, function* (bots, w) {
      gotTaken.push(yield* bots[0].carry(w.get('cup') as ThingView, [6, 0, 0]))
      gotTaken.push(bots[0].at()[0] < 3)
    }, 20)
    expect(takenRun.run.sentence).toBeNull()
    expect(gotTaken).toEqual([true, true])
    // A carry the room never answers, made again and again: the call is named with how many times it was made since the last step turned done.
    const never: RoomCode = (r, w) => {
      r.thing([-2, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.3, name: 'cup' })
      w.players()[0].putAt([-6, 0, 0])
      r.wayOut([-7, 0, 0])
      let t = 0
      r.steps([{ hint: { en: 'Go', fi: 'Mene' }, at: [-6, 0, 0], done: () => t > 1 }, { hint: { en: 'Go', fi: 'Mene' }, at: [0, 0, 0], done: () => false }])
      return (dt) => void (t += dt)
    }
    const loop = play(never, 1, function* (bots, w) {
      for (;;) {
        yield* bots[0].carry(w.get('cup') as ThingView, [2, 0, 0])
        yield* bots[0].carry(w.get('cup') as ThingView, [-2, 0, 0])
      }
    }, 40)
    const times = loop.run.repeated()
    expect(times).toHaveLength(1)
    expect(times[0]).toMatch(/^after step 1 turned done at 1 s it called bots\[0\]\.carry\(\.\.\.\) \d+ times, and step 2 never turned done$/)
    // No button whose job is grab: it cannot carry.
    const noGrab = play(
      (rr, ww) => {
        one(() => {})(rr, ww)
        rr.thing([0, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.2, name: 'cup' })
        rr.controls(ww.players(), { b: null })
      },
      1,
      function* (bots, w) {
        yield* bots[0].carry(w.get('cup') as ThingView, [4, 0, 0])
      },
      10,
    )
    expect(noGrab.run.sentence).toBe(WALK_MISTAKES.noGrab(0))
    // It sets the thing down only where nothing with use is within reach: a press there would use it.
    let used = 0
    const withUse = one((r) => {
      r.thing([-2, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.3, name: 'cup' })
      r.box([4.5, 0.4, 0], [1, 0.8, 2], { name: 'table', use: () => used++ })
      r.thing([-4, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.3, name: 'bell', use: () => used++ })
    })
    const beside: boolean[] = []
    const besideRun = play(
      withUse,
      1,
      function* (bots, w) {
        beside.push(yield* bots[0].carry(w.get('cup') as ThingView, [5.6, 0, 0]))
        // To the table: beside it, from where the table is out of reach.
        beside.push(yield* bots[0].carry(w.get('cup') as ThingView, w.get('table')))
      },
      60,
    )
    expect(besideRun.run.sentence).toBeNull()
    expect(beside).toEqual([true, true])
    expect(used).toBe(0)
    // A thing with use is used, never carried.
    const bell = play(
      withUse,
      1,
      function* (bots, w) {
        yield* bots[0].carry(w.get('bell') as ThingView, [0, 0, 0])
      },
      10,
    )
    expect(bell.run.sentence).toBe(WALK_MISTAKES.hasUse("'bell'"))
    expect(used).toBe(0)
  },
  push: () => {
    const code = room(
      [
        [-6, 0, 0],
        [-7, 0, 0],
      ],
      (r) => {
        r.thing([-3, 0, 0], cube(0.8, 0.8, 0.8), { weight: 0.8, name: 'crate' })
        r.thing([1, 0, 0], cube(0.8, 0.8, 0.8), { weight: 1.5, name: 'chest' })
      },
    )
    const got: boolean[] = []
    const walk: WalkCode = function* (bots, w) {
      got.push(yield* bots[0].push(w.get('crate') as ThingView, [-1, 0, 0]))
      // Too heavy for one: the two push it at once and their weights add up.
      yield* w.together(bots[0].push(w.get('chest') as ThingView, [5, 0, 0]), bots[1].push(w.get('chest') as ThingView, [5, 0, 0]))
      yield* bots[1].goTo([-7, 0, 0])
      yield* bots[0].push(w.get('chest') as ThingView, [-2, 0, 0])
    }
    const { room: r, run } = play(code, 2, walk, 60)
    expect(got).toEqual([true])
    const mid = (name: string) => {
      const t = r.world.things.find((x) => x.name === name)
      return t === undefined ? NaN : t.at[0] + (t.box.min[0] + t.box.max[0]) / 2
    }
    expect(Math.abs(mid('crate') + 1)).toBeLessThanOrEqual(GOTO.leave)
    expect(Math.abs(mid('chest') - 5)).toBeLessThanOrEqual(GOTO.leave + 0.05)
    expect(run.sentence).toBe(WALK_MISTAKES.pushStuck("'chest'", 1.5, 1, 1))
    // Light enough, but a solid stands in the way: the sentence names it, where it stands and how high.
    const kerb = play(
      one((r) => {
        r.box([2.1, 0.3, 0], [0.6, 0.6, 2], { name: 'kerb' })
        r.thing([-1, 0, 0], cube(0.8, 0.8, 0.8), { weight: 0.9, name: 'crate' })
      }),
      1,
      function* (bots, w) {
        yield* bots[0].push(w.get('crate') as ThingView, [5, 0, 0])
      },
      30,
    )
    expect(kerb.run.sentence).toBe(WALK_MISTAKES.pushBlocked("'crate'", "the solid 'kerb' (x 1.8 to 2.4) stands in its way up to y 0.6"))
  },
  steer: () => {
    const { inputs } = play(one(() => {}), 1, (bots) => bots[0].steer([1, 0.5], 0.5), 5)
    expect(inputs.slice(0, 30).every((i) => i.pads[0].stick[0] === 1 && i.pads[0].stick[1] === 0.5)).toBe(true)
    expect(inputs.length).toBe(30)
  },
} satisfies Record<keyof typeof BOT_REF, () => void>

const WORLD_TESTS = {
  time: () => {
    const times: number[] = []
    play(
      one(() => {}),
      1,
      function* (_, w) {
        times.push(w.time())
        yield
        yield
        times.push(w.time())
      },
      5,
    )
    expect(times).toEqual([0, 2 / 60])
  },
  level: () => {
    let level = 0
    play(
      one(() => {}),
      1,
      function* (_, w) {
        level = w.level()
      },
      5,
    )
    expect(level).toBe(1)
  },
  get: () => {
    const { run } = play(
      shelved,
      1,
      function* (_, w) {
        expect(w.get('shelf').kind()).toBe('solid')
        w.get('roof')
      },
      5,
    )
    expect(run.sentence).toBe(WALK_MISTAKES.noName('roof', ['shelf']))
  },
  stepsDone: () => {
    let done = -1
    const { run } = play(
      (r, w) => {
        w.players()[0].putAt([-6, 0, 0])
        r.wayOut([-7, 0, 0])
        r.steps([{ hint: { en: 'go', fi: 'mene' }, at: [0, 0, 0], done: () => w.players()[0].at()[0] > 0 }])
      },
      1,
      function* (bots, w) {
        yield* bots[0].goTo([2, 0, 0])
        yield
        done = w.stepsDone()
      },
      10,
    )
    expect(run.sentence).toBeNull()
    expect(done).toBe(1)
  },
  wait: () => {
    const { room: r, run } = play(one(() => {}), 1, (_, w) => w.wait(1.5), 5)
    expect(run.state).toBe('done')
    expect(r.world.t).toBeCloseTo(1.5, 6)
  },
  until: () => {
    const { room: r } = play(
      one(() => {}),
      1,
      (_, w) => w.until(() => w.time() >= 1),
      5,
    )
    expect(r.world.t).toBeCloseTo(1, 6)
    const never = play(
      one(() => {}),
      1,
      (_, w) => w.until(() => false),
      UNTIL_SECS + 5,
    )
    expect(never.run.sentence).toBe(WALK_MISTAKES.untilNever(UNTIL_SECS))
    expect(never.room.world.t).toBeCloseTo(UNTIL_SECS, 1)
  },
  together: () => {
    const order: string[] = []
    const tick = function* (name: string, frames: number) {
      for (let f = 0; f < frames; f++) {
        order.push(name)
        yield
      }
    }
    const { room: r } = play(
      one(() => {}),
      1,
      (_, w) => w.together(tick('a', 3), tick('b', 1), w.wait(0.1)),
      5,
    )
    // One frame each in turn, and done when all are.
    expect(order).toEqual(['a', 'b', 'a', 'a'])
    expect(r.world.t).toBeCloseTo(0.1, 6)
  },
  tap: () => {
    let taps = 0
    const { inputs } = play(
      one((r) => r.thing([3, 0, 0], cube(0.6, 0.6, 0.6), { weight: 2, name: 'bell', tap: () => taps++ })),
      1,
      (_, w) => w.tap(w.get('bell')),
      5,
    )
    expect(taps).toBe(1)
    expect(inputs).toHaveLength(Math.round(BOT_TIMES.tap * 60))
  },
  point: () => {
    const held: number[] = []
    const code: RoomCode = (r, w) => {
      one(() => {})(r, w)
      return () => {
        held.push(w.pointers().length)
      }
    }
    play(code, 1, (_, w) => w.point([2, 3, 0], 0.5), 5)
    expect(held.slice(0, 30).every((n) => n === 1)).toBe(true)
    expect(held).toHaveLength(30)
  },
} satisfies Record<keyof typeof WALK_WORLD_REF, () => void>

describe("the walkthrough's reference: each line does what it says", () => {
  it.each(Object.entries(BOT_TESTS))('bot.%s', (_, test) => test())
  it.each(Object.entries(WORLD_TESTS))('w.%s', (_, test) => test())
})

describe('the walk runner', () => {
  it('stops the walkthrough wherever it is when the room ends', () => {
    const code: RoomCode = (r, w) => {
      w.players()[0].putAt([-6, 0, 0])
      r.wayOut([-7, 0, 0])
      r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [0, 0, 0], done: () => w.time() > 1 }])
      return () => {
        if (w.stepsDone() === 1) w.finish()
      }
    }
    const { room: r, run } = play(code, 1, (_, w) => w.wait(10), 20)
    expect(r.world.end?.by).toBe('finish')
    run.input()
    expect(run.state).toBe('ended')
  })

  it("says what went wrong as a sentence, with the walkthrough's own line", () => {
    const text = (body: string) => {
      const { walk, runtime } = compiled(body)
      const r = buildRoom(shelved, roomStart(1, 'together', 1, 7), new RoomRuntime())
      const run = new WalkRun(r, walk, runtime, { still: null })
      for (let f = 0; f < 100 && run.state === 'playing'; f++) stepRoom(r, run.input())
      return run.sentence
    }
    expect(text("yield\nyield\nthrow new Error('seven')")).toBe(WALK_MISTAKES.thrown('Error: seven (line 3)'))
    expect(text("yield\nyield* bots[0].goTo(w.get('roof'))")).toBe(`${WALK_MISTAKES.noName('roof', ['shelf'])} (line 2)`)
    expect(text('yield\nwhile (true) {}')).toBe(`${WALK_LONG} (line 2)`)
    expect(text("yield\nw.get('shelf').putAt([0, 0, 0])")).toBe(`${WALK_MISTAKES.readOnly('solid', 'putAt')} (line 2)`)
    // The room's w and the walkthrough's are two: a call of the other's says whose it is.
    expect(text('yield\nw.players()')).toBe(`${WALK_MISTAKES.roomCall('players', ['time', 'level', 'get', 'stepsDone', 'wait', 'until', 'together', 'tap', 'point'])} (line 2)`)
    expect(text('yield\nconst p = bots[0].at()\np[0] = 1')).toBe(`${MISTAKES.frozenList()} (line 3)`)
    // A call that takes time, made without yield*, on the line it was made.
    expect(text('bots[0].goTo([3, 0, 0])\nyield')).toBe(`${WALK_MISTAKES.notYielded('bots[0].goTo(...)')} (line 1)`)
    expect(text('yield* w.together(1, 2)')).toContain('w.together takes bot calls and waits')
  })

  it('stops with a sentence the walkthrough caught, and refuses every call after it', () => {
    const run = (body: string) => {
      const { walk, runtime } = compiled(body)
      const r = buildRoom(one(() => {}), roomStart(1, 'together', 1, 7), new RoomRuntime())
      const w = new WalkRun(r, walk, runtime, { still: null })
      for (let f = 0; f < 600 && w.state === 'playing'; f++) stepRoom(r, w.input())
      return w
    }
    // Caught, and the code goes on: the run stops all the same, with the sentence and its line.
    const caught = run('try { yield* bots[0].goTo([0, 9, 0]) } catch (e) {}\nyield* w.wait(5)')
    expect(caught.state).toBe('stopped')
    expect(caught.sentence).toMatch(/^bot 0 found no way from [-\d.]+, 0 to 0, 9: .* \(line 1\)$/)
    // A loop of caught tries searches once: every later call throws the kept sentence at once.
    const loop = run('for (let i = 0; i < 50; i++) try { yield* bots[0].goTo([0, 9, 0]) } catch (e) {}')
    expect(loop.sentence).toBe(caught.sentence)
    expect(loop.searched.plans).toBe(caught.searched.plans)
  })

  it('says a call made without yield* also when the code ends in that frame', () => {
    const sentence = (body: string) => {
      const { walk, runtime } = compiled(body)
      const r = buildRoom(one(() => {}), roomStart(1, 'together', 1, 7), new RoomRuntime())
      const w = new WalkRun(r, walk, runtime, { still: null })
      for (let f = 0; f < 600 && w.state === 'playing'; f++) stepRoom(r, w.input())
      return [w.state, w.sentence]
    }
    expect(sentence('yield* w.wait(1)\nbots[0].goTo([5, 0, 0])')).toEqual(['stopped', `${WALK_MISTAKES.notYielded('bots[0].goTo(...)')} (line 2)`])
    expect(sentence('bots[0].goTo([5, 0, 0])')).toEqual(['stopped', `${WALK_MISTAKES.notYielded('bots[0].goTo(...)')} (line 1)`])
  })

  it('reads the room through handles where every player is the bot that plays them', () => {
    const code = one((r) => {
      r.zone([-6, 0.5, 0], [2, 1, 2], { name: 'pad' })
      r.thing([-4, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.2, name: 'cup' })
    })
    const seen: boolean[] = []
    play(
      code,
      1,
      function* (bots, w) {
        yield
        seen.push((w.get('pad') as ZoneView).inside()[0] === bots[0], (w.get('pad') as ZoneView).has(bots[0]))
        yield* bots[0].carry(w.get('cup') as ThingView, [2, 0, 0])
        // On the house's floor: a solid the walkthrough reads as any other, at the house floor's middle.
        const on = bots[0].standingOn()
        seen.push(on !== null && on.kind() === 'solid' && on.at()[1] === -0.2, bots[0].kind() === 'player')
      },
      20,
    )
    expect(seen).toEqual([true, true, true, true])
  })

  it("draws its Math.random from a stream of its own, never the room's", () => {
    const { walk, runtime } = compiled('const a = Math.random()\nyield\nconst b = Math.random()\nyield')
    const r = buildRoom(one(() => {}), roomStart(1, 'together', 1, 7), new RoomRuntime())
    const rng = r.world.rng
    const run = new WalkRun(r, walk, runtime, { still: null })
    for (let f = 0; f < 5; f++) stepRoom(r, run.input())
    expect(r.world.rng).toBe(rng)
  })

  it('counts the seconds in which every bot stood idle, in w.wait or w.until alike, and not while one moves', () => {
    const { run } = play(
      one(() => {}),
      1,
      function* (bots, w) {
        yield* w.wait(1)
        yield* w.together(bots[0].goTo([-2, 0, 0]), w.wait(1))
        const arrived = w.time()
        yield* w.until(() => w.time() > arrived + 2)
      },
      10,
    )
    // The goTo's own last frames may stand still on arrival, so only a little more than the two waits.
    expect(run.waitSecs).toBeGreaterThanOrEqual(3 - 1e-6)
    expect(run.waitSecs).toBeLessThan(3.3)
  })

  it('counts the standing a room asks in its own code, while the walkthrough waits for it with w.until', () => {
    // The room holds the player on its pad for 5 s before the step turns done: padding the trial cannot fail, which the measure must show.
    const { run } = play(
      (r, w) => {
        let since: number | null = null
        r.zone([-2, 0.5, 0], [1, 1, 2], { name: 'pad', enter: () => void (since = w.time()) })
        w.players()[0].putAt([-6, 0, 0])
        r.wayOut([-7, 0, 0])
        r.steps([{ hint: { en: 'Stand', fi: 'Seiso' }, at: [-2, 0, 0], done: () => since !== null && w.time() - since >= 5 }])
      },
      1,
      function* (bots, w) {
        yield* bots[0].goTo(w.get('pad'))
        yield* w.until(() => w.stepsDone() === 1)
      },
      15,
    )
    expect(run.state).toBe('done')
    expect(run.waitSecs).toBeGreaterThan(4)
    expect(run.waitSecs).toBeLessThan(5.5)
  })

  it('keeps what a bot pushed along by walking into it, never what it pushed with push', () => {
    const crate = (r: Builder) => r.thing([-4, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.5, name: 'crate' })
    // Steered into the crate for 2 s: it goes along at the push speed, and a room left unfinished will say so.
    const walked = play(one(crate), 1, (bots) => bots[0].steer([1, 0], 2), 5)
    const bumped = walked.run.bumped()
    expect(bumped).toHaveLength(1)
    expect(bumped[0]).toMatch(/^bot 0 walked into the thing 'crate' and pushed it along from -4(\.\d)?, 0 to -?\d+(\.\d)?, 0, without a push of its own$/)
    expect(WALK_MISTAKES.unfinished(bumped)).toBe(`${WALK_MISTAKES.unfinished([])}; on the way, ${bumped[0]}`)
    // Pushed there with push: the walkthrough meant it.
    const pushed = play(one(crate), 1, function* (bots, w) {
      yield* bots[0].push(w.get('crate') as ThingView, [-1, 0, 0])
    }, 20)
    expect(pushed.run.state).toBe('done')
    expect(pushed.run.bumped()).toEqual([])
  })

  it("never runs one bot's two stick calls at once: the second waits for the first", () => {
    const xs: number[] = []
    const { inputs } = play(
      one(() => {}),
      1,
      function* (bots, w) {
        yield* w.together(bots[0].steer([1, 0], 0.5), bots[0].steer([-1, 0], 0.5), bots[0].hold('a', 0.2))
        xs.push(w.time())
      },
      5,
    )
    expect(inputs.slice(0, 30).every((i) => i.pads[0].stick[0] === 1)).toBe(true)
    expect(inputs.slice(30, 60).every((i) => i.pads[0].stick[0] === -1)).toBe(true)
    expect(inputs.slice(0, 12).every((i) => i.pads[0].a.held)).toBe(true)
    expect(xs[0]).toBeCloseTo(1, 6)
  })

  it('stands a bot still: its pad let go, goTo, carry and push at once, press, hold and steer taking their time', () => {
    const code = room(
      [
        [-6, 0, 0],
        [-4, 0, 0],
      ],
      (r) => r.thing([0, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.2, name: 'cup' }),
    )
    const got: unknown[] = []
    const walk: WalkCode = function* (bots, w) {
      yield* bots[1].goTo([4, 0, 0])
      got.push(w.time())
      got.push(yield* bots[1].carry(w.get('cup') as ThingView, [2, 0, 0]), yield* bots[1].push(w.get('cup') as ThingView, [2, 0, 0]))
      yield* bots[1].hold('a', 0.5)
      got.push(w.time())
      yield* bots[0].goTo([-2, 0, 0])
    }
    const { room: r, inputs } = walkIn(code, 2, walk, 1, 20)
    expect(got).toEqual([0, false, false, 0.5])
    expect(inputs.every((i) => i.pads[1].stick[0] === 0 && !i.pads[1].a.held && !i.pads[1].b.held)).toBe(true)
    expect(r.world.players[1].at[0]).toBeCloseTo(-4, 6)
    expect(Math.abs(r.world.players[0].at[0] + 2)).toBeLessThanOrEqual(GOTO.near)
  })

  it('plays the same every time: the same frames, the same room', () => {
    const code = one((r) => {
      r.box([2, 0.5, 0], [1, 1, 2])
      r.thing([4, 0, 0], cube(0.4, 0.4, 0.4), { weight: 0.3, name: 'cup' })
      r.mover(
        () => r.box([0, -0.1, 0], [2, 0.2, 2]),
        (t) => ({ at: [6 + sin(t), 1, 0] }),
      )
    })
    const walk: WalkCode = function* (bots, w) {
      yield* bots[0].carry(w.get('cup') as ThingView, [-4, 0, 0])
      yield* bots[0].goTo([2, 1, 0])
      yield* w.wait(0.5)
    }
    const a = play(code, 1, walk, 30)
    const b = play(code, 1, walk, 30)
    expect(b.inputs).toEqual(a.inputs)
    expect(b.room.world.players[0].at).toEqual(a.room.world.players[0].at)
    expect(a.inputs.length).toBeGreaterThan(60)
  })

  it('reads a count off a sign, as the own rooms do', () => {
    let count = -1
    play(
      one((r) => r.sign([0, 3, 0], { count: 2, of: 5 }, { name: 'dots' })),
      1,
      function* (_, w) {
        count = ((w.get('dots') as SignView).what() as Count).count
      },
      5,
    )
    expect(count).toBe(2)
  })
})
