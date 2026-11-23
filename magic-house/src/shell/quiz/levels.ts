/**
 * How a player's quiz levels move with their answers (plan.md, Sums by code, words by objects:
 * each subject moves alone, kept in the player's saves). Each subject
 * moves on its own: three right answers in a row in it step its level up one rung, two wrong in a
 * row step it down one, never below 1 nor past its ladder's top. The rows are counted only while
 * the quiz is up; the levels go to the saves (saves.ts withQuiz) each time one moves.
 */

import type { QuizLevels } from '../../saves'
import { MATHS_TOP } from './maths'
import { READING_TOP } from './reading'

export type Subject = keyof QuizLevels

/** Right answers in a row that step a level up, and wrong ones that step it down. */
export const LEVEL_MOVE = { up: 3, down: 2 } as const

/** Each subject's ladder top. */
export const TOPS: Readonly<Record<Subject, number>> = { maths: MATHS_TOP, reading: READING_TOP }

/** The right and wrong answers in a row in one subject: one of them is always 0. */
export interface Row {
  readonly right: number
  readonly wrong: number
}

export type Rows = Readonly<Record<Subject, Row>>

export const FRESH_ROWS: Rows = { maths: { right: 0, wrong: 0 }, reading: { right: 0, wrong: 0 } }

/** The levels and rows after one answer in `subject`; a level stepped starts its row again. A saved level past the top (the ladder got shorter) comes down to the top as it moves. */
export function afterAnswer(levels: QuizLevels, rows: Rows, subject: Subject, right: boolean): { levels: QuizLevels; rows: Rows } {
  const row = rows[subject]
  const level = Math.min(levels[subject], TOPS[subject])
  if (right) {
    const inRow = row.right + 1
    if (inRow < LEVEL_MOVE.up) return { levels, rows: { ...rows, [subject]: { right: inRow, wrong: 0 } } }
    return { levels: { ...levels, [subject]: Math.min(TOPS[subject], level + 1) }, rows: { ...rows, [subject]: { right: 0, wrong: 0 } } }
  }
  const inRow = row.wrong + 1
  if (inRow < LEVEL_MOVE.down) return { levels, rows: { ...rows, [subject]: { right: 0, wrong: inRow } } }
  return { levels: { ...levels, [subject]: Math.max(1, level - 1) }, rows: { ...rows, [subject]: { right: 0, wrong: 0 } } }
}
