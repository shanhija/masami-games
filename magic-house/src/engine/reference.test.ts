/**
 * The contract as step 7a ("every room a room") left it: every room is one size and the house draws
 * its shell, so no line a model reads names the sky, a bigger room, zooming or following; every call
 * and read of the look (engine/look.ts) has exactly one line, which the compiler holds by `satisfies`
 * and these tests hold by name; the builder's refused keys are exactly the house's and the look's;
 * and the look's own stream is past every stream the trial draws.
 */

import { describe, expect, it } from 'vitest'

import { PATTERN_ORDER } from '../patterns/patterns'
import { WALK_MISTAKES, WALK_PREAMBLE, WALK_REFERENCE } from '../trial/api'
import { reachAcross, reachUnder } from '../trial/graph'
import {
  BUILDER_REF,
  BUILDER_REFUSED,
  FEEL,
  MATH,
  ROOM,
  ROOM_ANSWER_REF,
  ROOM_FIX_REF,
  ROOM_PREAMBLE,
  ROOM_REFERENCE,
  ROOM_RULES,
  SHELL_REF,
  TRIAL,
  WORLD_REF,
  type RefSection,
} from './api'
import {
  dressable,
  IDLES,
  LOOK_ANSWER_REF,
  LOOK_BUILDER_REF,
  LOOK_DECOR_OPTS_REF,
  LOOK_FIX_REF,
  LOOK_PREAMBLE,
  LOOK_REFERENCE,
  LOOK_RULES,
  PROP_OPTS_REF,
  REACTS,
  ROOM_SEEN_REF,
  SEEN_SOLID_REF,
  SEEN_THING_REF,
  SEEN_ZONE_REF,
  WALLPAPER_COPIES,
  wallpaperSpots,
} from './look'
import { NEVER, playRoom, roomStart, testRoom } from './testing'
import type { Solid } from './world'
import { NO_POINTING } from '../seats/types'

/** A reference as the prompt joins it: each section's title and lines. */
const joined = (sections: readonly RefSection[]) => sections.map((s) => [s.title, ...Object.values(s.lines)].join('\n')).join('\n')

/** Everything a model reads about a room and its look, besides the kit's lines and the presents. */
const READ_BY_MODELS: Readonly<Record<string, string>> = {
  ROOM_RULES,
  ROOM_PREAMBLE,
  ROOM_REFERENCE: joined(ROOM_REFERENCE),
  ROOM_ANSWER_REF: Object.values(ROOM_ANSWER_REF).join('\n'),
  ROOM_FIX_REF: Object.values(ROOM_FIX_REF).join('\n'),
  WALK_PREAMBLE,
  WALK_REFERENCE: joined(WALK_REFERENCE),
  LOOK_RULES,
  LOOK_PREAMBLE,
  LOOK_REFERENCE: joined(LOOK_REFERENCE),
  LOOK_ANSWER_REF: Object.values(LOOK_ANSWER_REF).join('\n'),
  LOOK_FIX_REF: Object.values(LOOK_FIX_REF).join('\n'),
}

describe('what the models read', () => {
  it('names no sky, no bigger room, no zooming and no following, and no box of the room\'s own', () => {
    for (const [name, text] of Object.entries(READ_BY_MODELS)) {
      for (const said of [/\bsky\b/i, /\bbigger\b/i, /\bzoom/i, /\bfollow(s|ed|ing)?\b/i, /one screen or/i, /r\.bounds|r\.sky/]) {
        expect(said.test(text), `${name} says ${said}`).toBe(false)
      }
    }
  })

  it("says the room's one size by THE ROOM's numbers, and the shell's section comes after the builder's", () => {
    expect(ROOM_PREAMBLE).toContain(`- THE ROOM is the same size in every room, and the camera shows all of it all the time and never moves. Seen from the side: x from -8 to 8, y from 0 (the floor's top) to 8 (the ceiling), the back wall at z -3.`)
    expect(ROOM_PREAMBLE).toContain('Seen from high up: the floor is x from -7 to 7 and z from -4 (the back wall) to 4 (the open front, toward the viewer)')
    expect(ROOM_PREAMBLE).toContain("they cross the room's 16 m in 4 s walking and in 8 s pushing (seen from high up, its 14 m in 3.5 s and 7 s). Its seconds come from what there is to do, never from distance: the room is one screen.")
    // The minute is play, never padding: a too-short room asked for more to do once answered with longer holds (plan.md, Proof before play).
    // Narrowed to the minute: holding something while another player goes is still a part to play.
    expect(ROOM_PREAMBLE).toContain('A minute made of standing, holding or waiting is not play: a room with less to do than that needs more for the players to do in it, never longer to stand, hold or wait, whether the room')
    expect(WALK_MISTAKES.tooShort(30, '10 and 30 s', 3)).toContain('times as much for the players to do, never longer to stand, hold or wait')
    // A higher level is more to do, never more waiting, in both lines that tell the model to scale by the level (plan.md, Three levels in every room).
    expect(WORLD_REF.level).toBe('w.level()   1, 2 or 3, the same all room long: scale by it how much there is to do (counts, speeds, gaps), 1 the gentlest, never longer to stand, hold or wait')
    expect(WALK_MISTAKES.levelsAlike(80)).toContain('scale by w.level() how much there is to do (counts, speeds, gaps), 1 the gentlest, never longer to stand, hold or wait')
    expect(ROOM_PREAMBLE).toContain('how they play, and how the room is seen (from the side or from high up). A line')
    expect(ROOM.side.width / 2).toBe(8)
    const titles = ROOM_REFERENCE.map((s) => s.title)
    const shell = titles.indexOf('The shell, in the answer: the house draws it before the room code runs.')
    expect(shell).toBe(titles.findIndex((t) => t.startsWith('w, the world')) - 1)
    expect(ROOM_REFERENCE[shell].lines).toBe(SHELL_REF)
    for (const pattern of PATTERN_ORDER) expect(SHELL_REF.walls).toContain(pattern)
  })

  it('gives the room the four new principles, one line each', () => {
    const lines = ROOM_RULES.split('\n').slice(1)
    expect(lines).toHaveLength(11)
    expect(lines.slice(-4).every((l) => l.startsWith('- '))).toBe(true)
  })
})

describe('the house holds everyone in', () => {
  it('says that with no fall to bring a player back, every place a player can get down to has a way back up', () => {
    expect(ROOM_PREAMBLE).toContain('nobody falls out of the room, so nothing brings back a player who has dropped where they cannot get out, and wherever a player can get down to, they can climb back up from.')
  })
})

describe('the jump under the room\'s top', () => {
  /** The highest the feet of a player standing on a floor `h` m up go, from high up, in two seconds of a held jump. */
  const highestFeet = (h: number): number => {
    const room = testRoom(
      (r, w) => {
        if (h > 0) r.box([0, h / 2, 0], [4, h, 4])
        w.players()[0]!.putAt([0, h, 0])
        r.wayOut([0, 0, -4])
        r.steps(NEVER)
      },
      { ...roomStart(1, 'together', 1, 3), view: 'high' },
    )
    let most = -Infinity
    for (let f = 0; f < 120; f++) {
      playRoom(room, 1, () => [{ stick: [0, 0], a: f < 60, b: false }], () => NO_POINTING)
      most = Math.max(most, room.world.players[0]!.at[1])
    }
    return most - h
  }

  it('is as SPACE says it: from high up a held jump lifts the feet its whole height only from a low floor, the top cuts it short above, and a jump cut short carries less far', () => {
    expect(ROOM_PREAMBLE).toContain(`Seen from high up a held jump lifts the feet its whole ${FEEL.jumpHigh} m only from a floor at most 0.25 m high, and no top a player must jump onto can be higher than 1.85 m`)
    expect(highestFeet(0)).toBeCloseTo(FEEL.jumpHigh, 1)
    expect(highestFeet(0.25)).toBeCloseTo(FEEL.jumpHigh, 1)
    // From 1 m up the head meets the top at 3 m: the feet rise 3 - 1.15 - 1 = 0.85 m.
    expect(highestFeet(1)).toBeCloseTo(ROOM.high.height - FEEL.height - 1, 2)
    const vy = Math.sqrt(2 * FEEL.gravity * FEEL.jumpHigh)
    expect(reachUnder(0, vy, FEEL.gravity, 0.85)).toBeLessThan(reachAcross(0, vy, FEEL.gravity) - 1)
  })
})

describe("the look's lines", () => {
  it("say how many times the wallpaper's model is repeated, as the house lays it and the look's pieces count it", () => {
    expect([WALLPAPER_COPIES.side, WALLPAPER_COPIES.high]).toEqual([wallpaperSpots('side').length, wallpaperSpots('high').length])
    expect(LOOK_BUILDER_REF.wallpaper).toContain('It is repeated 25 times seen from the side and 29 times from high up')
  })

  it('give every call of r one line, named as the call', () => {
    for (const [key, line] of Object.entries(LOOK_BUILDER_REF)) expect(line.startsWith(`r.${key}(`), key).toBe(true)
    for (const [key, line] of Object.entries({ ...LOOK_DECOR_OPTS_REF, ...PROP_OPTS_REF })) expect(line.startsWith(`${key}   `), key).toBe(true)
  })

  it('give every read of room one line, and name each read of a seen solid, thing and zone inside its list\'s line', () => {
    for (const [key, line] of Object.entries(ROOM_SEEN_REF)) expect(line.startsWith(`room.${key}()`), key).toBe(true)
    for (const [list, reads] of [
      ['solids', SEEN_SOLID_REF],
      ['things', SEEN_THING_REF],
      ['zones', SEEN_ZONE_REF],
    ] as const) {
      for (const [key, said] of Object.entries(reads)) {
        expect(said.startsWith(`${key}()`), `${list} ${key}`).toBe(true)
        expect(ROOM_SEEN_REF[list]).toContain(said)
      }
    }
  })

  it('list the reacts and idles the props take, and nothing of the play', () => {
    expect(PROP_OPTS_REF.react).toContain(REACTS.join(' '))
    expect(PROP_OPTS_REF.idle).toContain(IDLES.join(' '))
    expect(LOOK_REFERENCE.map((s) => s.title).filter((t) => t.startsWith('r,'))).toHaveLength(1)
  })
})

describe("the builder's refused keys", () => {
  it("are the house's (bounds and sky) and the look's own calls, none of them the builder's", () => {
    expect([...BUILDER_REFUSED.houseOwns]).toEqual(['bounds', 'sky'])
    expect([...BUILDER_REFUSED.lookOnly].sort()).toEqual(Object.keys(LOOK_BUILDER_REF).filter((k) => !(k in BUILDER_REF)).sort())
    for (const key of [...BUILDER_REFUSED.houseOwns, ...BUILDER_REFUSED.lookOnly]) expect(key in BUILDER_REF, key).toBe(false)
  })
})

describe("the look's stream", () => {
  it('is past every stream the trial draws: the walkthrough, the second seed and its walkthrough, the random pressing', () => {
    const drawn = [MATH.walkSeedOffset, TRIAL.secondSeedOffset, TRIAL.secondSeedOffset + MATH.walkSeedOffset, TRIAL.randomSeedOffset]
    expect(drawn.every((offset) => offset < MATH.lookSeedOffset)).toBe(true)
  })
})

describe('dressable', () => {
  const solid = (over: Partial<Solid>): Solid => ({
    id: 4,
    name: null,
    hidden: false,
    mover: null,
    at: [0, 1, 0],
    slide: null,
    shape: { kind: 'box', size: [2, 0.5, 2] },
    house: false,
    plain: true,
    surface: { color: '#b9824f', ice: false, bounce: 0, belt: [0, 0, 0], through: false },
    model: null,
    turn: 0,
    turning: null,
    glow: null,
    parts: {},
    ...over,
  })

  it('is a plain still box or ramp the room code built and showed, glowing not, and not the house', () => {
    expect(dressable(solid({}))).toBe(true)
    expect(dressable(solid({ shape: { kind: 'ramp', size: [2, 1, 2], rises: 'right' } }))).toBe(true)
    expect(dressable(solid({ shape: { kind: 'ball', radius: 1 } }))).toBe(false)
    expect(dressable(solid({ plain: false }))).toBe(false)
    expect(dressable(solid({ house: true }))).toBe(false)
    expect(dressable(solid({ mover: 9 }))).toBe(false)
    expect(dressable(solid({ hidden: true }))).toBe(false)
    expect(dressable(solid({ glow: { color: '#ffd23a', pulse: false } }))).toBe(false)
  })
})
