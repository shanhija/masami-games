/**
 * The proof that the trial catches what is wrong in a room seen from high up (step 6). The base,
 * Egg Islands written as made code (highBase.ts), passes the whole trial at every level through the
 * guard and the compile; each of HIGH_TWINS fails with exactly the sentence that names its fault and
 * where: in metres on the floor for a place (x, y, z), the designer's line for code.
 */

import { describe, expect, it } from 'vitest'
import { MISTAKES, PASS, TRIAL, type Level } from '../../engine/api'
import { jobRoom, runTrial } from '../trial'
import { HIGH_JOB, HIGH_ROOM, HIGH_WALK } from './highBase'
import { HIGH_TWINS, highTwinTexts, lineIn, twinJobOf, type HighTwinName } from './twins'

const REAL = () => performance.now()
const LONG = 60_000
/** Where a run stopped, by its own play (seconds into play, a bot's place), and the same at the other levels: any of it there. */
const NUM = '-?\\d+(?:\\.\\d+)?'
const SAME = '(?: \\(the same [^)]*\\))?'
const esc = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const trialOf = (room: string, walk: string) => {
  const { job, error } = twinJobOf({ room, walk }, HIGH_JOB)
  if (job === null) throw new Error(error)
  return runTrial(jobRoom(job), REAL)
}

/** The bot's sentence when the carry of `egg` (where it waits) finds no way, at level 1 and the same at the others: why, exactly; where the bot stood, any place. */
const noWay = (egg: string, why: string, line: number) =>
  new RegExp(`^at level 1, ${NUM} s into play, with step 2 of 2 next${SAME}: ${esc('bot 0 found no way from ')}${NUM}, ${NUM}, ${NUM}${esc(` to the thing ${egg}: ${why} (line ${line})`)}$`)

const CARRY = "bots[0].carry(w.get('egg-' + i), w.get('nest'))"

const EXPECT: Record<HighTwinName, (room: string, walk: string) => RegExp> = {
  // From the island's end to the rock's, as built, and what a jump from the island carries the feet: the rock is too high to reach from the floor round it, so that jump is the only way up.
  pit: (_, walk) => noWay("'egg-3' at 6, 1.7, 2.5", 'the gap from 4, 0.8, 2.5 is 1.5 m across and 0.9 m up, and a jump carries the feet 1.4 m across at that height', lineIn(walk, CARRY)),
  // The hedge by its name, where it stands on the floor and how high; the jump from the island is cut short by the room's top at 3 m.
  wall: (_, walk) => noWay("'egg-3' at 6, 1.7, 2.5", "between 0.3, 0.8, 2.5 and 1.8, 0.8, 2.5 the solid 'hedge' (x 0.7 to 1.3, z -4 to 4) stands up to y 2.9, and a jump lifts the feet 1.1 m", lineIn(walk, CARRY)),
  // A top so near the room's top that no player stands on it: the rock is named with both heights.
  top: (_, walk) => noWay("'egg-3' at 6, 2.2, 2.5", "the solid 'rock' tops out at y 2.2, under the room's top at 3, and a player needs 1.15 m over a top to stand on it", lineIn(walk, CARRY)),
  // Named by the line of the w.finish call.
  neverDone: (room) => new RegExp(`^at level 1, ${NUM} s into play${SAME}: ${esc(`${MISTAKES.stepUndone(2, 2)} (line ${lineIn(room, 'if (home === eggCount) w.finish()')})`)}$`),
}

describe('the broken twins seen from high up', () => {
  it(
    'start from a base written as made code that passes the whole trial at every level',
    () => {
      const base = trialOf(HIGH_ROOM, HIGH_WALK)
      expect(base.sentences).toEqual([])
      expect(base.passed).toBe(true)
      for (const level of [1, 2, 3] as const) {
        const secs = (base.botSecs as Record<Level, number>)[level]
        expect(secs).toBeGreaterThanOrEqual(PASS.minSecs)
        expect(secs).toBeLessThanOrEqual(PASS.maxSecs)
      }
      expect(base.ms).toBeLessThan(TRIAL.realSecs * 1000)
    },
    LONG,
  )

  it('are each a small edit of the base', () => {
    for (const twin of Object.values(HIGH_TWINS)) {
      const texts = highTwinTexts(twin)
      expect(texts.room !== HIGH_ROOM || texts.walk !== HIGH_WALK, twin.name).toBe(true)
      expect(twin.edits.length, twin.name).toBeLessThanOrEqual(3)
    }
  })

  it.each(Object.keys(HIGH_TWINS) as HighTwinName[])(
    '%s fails with the sentence that names its fault and where, and no other',
    (name) => {
      const twin = HIGH_TWINS[name]
      const texts = highTwinTexts(twin)
      const r = trialOf(texts.room, texts.walk)
      expect(r.passed, twin.name).toBe(false)
      expect(r.botSecs).toBeNull()
      expect(r.sentences, `${twin.name}:\n${r.sentences.join('\n')}`).toHaveLength(1)
      expect(r.sentences[0], twin.name).toMatch(EXPECT[name](texts.room, texts.walk))
      expect(r.survey).toMatch(/^The room as built at level/)
    },
    LONG,
  )
})
