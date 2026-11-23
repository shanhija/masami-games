/**
 * The quiz's sums (plan.md, Sums by code, words by objects): made by code, so they are always
 * right, on a ladder of ten rungs for children of five to eight. A player's maths level is the rung
 * they stand on (saves.ts QuizLevels.maths); a level past the top plays the top rung.
 *
 *   1  count 1 to 3 things            6  add within 10, in numbers
 *   2  count 2 to 5 things            7  take away within 10, in numbers
 *   3  count 4 to 10 things           8  add past ten, within 20 (7 + 5)
 *   4  add within 5, with things      9  take away back past ten, within 20 (13 - 5)
 *   5  take away within 5, with       10 add or take away whole tens, within 100 (30 + 40)
 *      things
 *
 * Every question is answered by picking one of three numbers: the right one and two near it
 * (one or two away; ten or twenty on the tens rung), never below the smallest answer the rung can have.
 */

import { between, shuffled } from './chance'

/** A sum as it is shown: things to count, or two numbers to add or take away, drawn as things on the low rungs. */
export type Sum =
  | { readonly kind: 'count'; readonly n: number }
  | { readonly kind: 'add' | 'take'; readonly a: number; readonly b: number; readonly things: boolean }

export interface MathsQuestion {
  readonly subject: 'maths'
  /** The rung it was made on, 1 to MATHS_TOP. */
  readonly rung: number
  readonly sum: Sum
  readonly answer: number
  /** Three different numbers, the answer among them at a place of chance. */
  readonly choices: readonly number[]
}


/** Each rung: how its sums are made, the smallest answer it can have, and how far apart its numbers are. */
const RUNGS: readonly { readonly make: (random: () => number) => Sum; readonly least: number; readonly step: number }[] = [
  { make: (r) => ({ kind: 'count', n: between(1, 3, r) }), least: 1, step: 1 },
  { make: (r) => ({ kind: 'count', n: between(2, 5, r) }), least: 1, step: 1 },
  { make: (r) => ({ kind: 'count', n: between(4, 10, r) }), least: 1, step: 1 },
  {
    make: (r) => {
      const a = between(1, 4, r)
      return { kind: 'add', a, b: between(1, 5 - a, r), things: true }
    },
    least: 0,
    step: 1,
  },
  {
    make: (r) => {
      const a = between(2, 5, r)
      return { kind: 'take', a, b: between(1, a - 1, r), things: true }
    },
    least: 0,
    step: 1,
  },
  {
    make: (r) => {
      const a = between(1, 9, r)
      return { kind: 'add', a, b: between(1, 10 - a, r), things: false }
    },
    least: 0,
    step: 1,
  },
  {
    make: (r) => {
      const a = between(2, 10, r)
      return { kind: 'take', a, b: between(1, a - 1, r), things: false }
    },
    least: 0,
    step: 1,
  },
  {
    make: (r) => {
      const a = between(2, 9, r)
      return { kind: 'add', a, b: between(11 - a, 9, r), things: false }
    },
    least: 0,
    step: 1,
  },
  {
    make: (r) => {
      const a = between(11, 18, r)
      return { kind: 'take', a, b: between(a - 9, 9, r), things: false }
    },
    least: 0,
    step: 1,
  },
  {
    make: (r) => {
      const a = 10 * between(1, 9, r)
      return r() < 0.5 ? { kind: 'add', a, b: 10 * between(1, (100 - a) / 10, r), things: false } : { kind: 'take', a, b: 10 * between(1, a / 10, r), things: false }
    },
    least: 0,
    step: 10,
  },
]

/** The top rung. */
export const MATHS_TOP = RUNGS.length

/** What a sum comes to. */
export function answerOf(sum: Sum): number {
  switch (sum.kind) {
    case 'count':
      return sum.n
    case 'add':
      return sum.a + sum.b
    case 'take':
      return sum.a - sum.b
  }
}

/** Three different numbers for an answer: it and two of its neighbours `step` and twice `step` away, none under `least`, in an order of chance. */
export function choicesFor(answer: number, least: number, step: number, random: () => number): number[] {
  const near = [-2, -1, 1, 2].map((k) => answer + k * step).filter((n) => n >= least)
  const wrong: number[] = []
  while (wrong.length < 2) wrong.push(near.splice(Math.floor(random() * near.length), 1)[0]!)
  return shuffled([answer, ...wrong], random)
}

/** A sum for a player at maths level `level` (from 1; past the top plays the top rung). */
export function mathsQuestion(level: number, random: () => number): MathsQuestion {
  if (!Number.isInteger(level) || level < 1) throw new Error(`a maths level is a whole number from 1, not ${level}`)
  const rung = Math.min(level, MATHS_TOP)
  const { make, least, step } = RUNGS[rung - 1]!
  const sum = make(random)
  const answer = answerOf(sum)
  return { subject: 'maths', rung, sum, answer, choices: choicesFor(answer, least, step, random) }
}
