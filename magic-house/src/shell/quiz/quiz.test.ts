import { describe, expect, it } from 'vitest'

import { LANGS } from '../../../../profiles/src/lang'
import { afterAnswer, FRESH_ROWS, LEVEL_MOVE, TOPS, type Rows } from './levels'
import { answerOf, choicesFor, MATHS_TOP, mathsQuestion, type Sum } from './maths'
import { BUILT_IN_OBJECTS } from './objects'
import { objectKey, READING_TOP, readingQuestion, wordOf, wordRung, type QuizObject } from './reading'

/** A seeded stream of chance (mulberry32), so a failure plays again. */
function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** What a sum must be at each rung: the numbers it may use. */
function fitsRung(rung: number, s: Sum): boolean {
  const whole = (n: number) => Number.isInteger(n)
  if (s.kind === 'count') return whole(s.n) && [[1, 3], [2, 5], [4, 10]].some(([lo, hi], i) => i === rung - 1 && s.n >= lo! && s.n <= hi!)
  const { a, b } = s
  if (!whole(a) || !whole(b) || a < 1 || b < 1) return false
  switch (rung) {
    case 4:
      return s.kind === 'add' && s.things && a + b <= 5
    case 5:
      return s.kind === 'take' && s.things && a <= 5 && b < a
    case 6:
      return s.kind === 'add' && !s.things && a + b <= 10
    case 7:
      return s.kind === 'take' && !s.things && a <= 10 && b < a
    case 8:
      return s.kind === 'add' && !s.things && a <= 9 && b <= 9 && a + b > 10 && a + b <= 20
    case 9:
      return s.kind === 'take' && !s.things && a > 10 && a <= 20 && b <= 9 && a - b < 10 && a - b >= 1
    case 10:
      return !s.things && a % 10 === 0 && b % 10 === 0 && (s.kind === 'add' ? a + b <= 100 : b <= a)
  }
  return false
}

describe('the sums', () => {
  it('are right at every rung, with three different choices the answer among them', () => {
    const random = seeded(7)
    for (let rung = 1; rung <= MATHS_TOP; rung++)
      for (let k = 0; k < 400; k++) {
        const q = mathsQuestion(rung, random)
        expect(q.rung).toBe(rung)
        expect(fitsRung(rung, q.sum), `rung ${rung}: ${JSON.stringify(q.sum)}`).toBe(true)
        const s = q.sum
        expect(q.answer).toBe(s.kind === 'count' ? s.n : s.kind === 'add' ? s.a + s.b : s.a - s.b)
        expect(q.answer).toBe(answerOf(s))
        expect(new Set(q.choices).size).toBe(3)
        expect(q.choices).toContain(q.answer)
        for (const c of q.choices) {
          expect(Number.isInteger(c)).toBe(true)
          expect(c).toBeGreaterThanOrEqual(s.kind === 'count' ? 1 : 0)
        }
      }
  })

  it('climb: each rung up is at least as big as the one below', () => {
    const random = seeded(3)
    const biggest = Array.from({ length: MATHS_TOP }, (_, i) => Math.max(...Array.from({ length: 300 }, () => mathsQuestion(i + 1, random).answer)))
    for (let i = 1; i < 3; i++) expect(biggest[i]).toBeGreaterThan(biggest[i - 1]!)
    expect(biggest[MATHS_TOP - 1]).toBeGreaterThan(20)
  })

  it('play the top rung past the top, and refuse a level that is no level', () => {
    expect(mathsQuestion(MATHS_TOP + 5, seeded(1)).rung).toBe(MATHS_TOP)
    expect(() => mathsQuestion(0, seeded(1))).toThrow(/whole number from 1/)
    expect(() => mathsQuestion(1.5, seeded(1))).toThrow(/whole number from 1/)
  })

  it('give near wrong answers, never below the least', () => {
    for (let s = 0; s < 50; s++) {
      const c = choicesFor(0, 0, 1, seeded(s))
      expect([...c].sort()).toEqual([0, 1, 2])
      const t = choicesFor(50, 0, 10, seeded(s))
      for (const n of t) expect([30, 40, 50, 60, 70]).toContain(n)
    }
  })
})

describe('the reading', () => {
  it('has at least three words apart at every rung in both languages from Silly Billy alone', () => {
    const random = seeded(11)
    for (const lang of LANGS)
      for (let rung = 1; rung <= READING_TOP; rung++)
        for (let k = 0; k < 200; k++) {
          const q = readingQuestion(rung, lang, BUILT_IN_OBJECTS, new Set(), random)
          const words = q.choices.map((o) => wordOf(o, lang))
          expect(new Set(words).size, words.join(', ')).toBe(3)
          expect(new Set(q.choices.map(objectKey)).size).toBe(3)
          expect(q.choices).toContain(q.target)
          for (const w of words) {
            expect(wordRung(w)).toBeLessThanOrEqual(rung)
            for (const v of words) if (v !== w) for (const x of w.split(' ')) for (const y of v.split(' ')) expect(x.includes(y), `${w} holds ${v}`).toBe(false)
          }
          if (rung === 1) expect(q.shown).toBe('word')
          if (rung === 2) expect(q.shown).toBe('object')
        }
  })

  it('rates short single words first, two words from rung 4', () => {
    expect(wordRung('ball')).toBe(1)
    expect(wordRung('keinu')).toBe(1)
    expect(wordRung('mushroom')).toBe(4)
    expect(wordRung('rubber duck')).toBe(4)
    expect(wordRung('lumiukon kaulahuivi')).toBe(5)
    expect(wordRung('kiipeilyteline')).toBe(5)
  })

  it('reads the presents too, in small letters, and leaves the last targets alone', () => {
    const gifts: QuizObject[] = [
      { kind: 'gift', id: 'pirate-hat-12', name: { en: 'Pirate Hat', fi: 'Merirosvohattu' } },
      { kind: 'gift', id: 'gate-key-5', name: { en: 'Gate Key', fi: 'Portin avain' } },
    ]
    expect(wordOf(gifts[0]!, 'en')).toBe('pirate hat')
    const objects = [...BUILT_IN_OBJECTS, ...gifts]
    const random = seeded(5)
    let seenGift = false
    for (let k = 0; k < 500; k++) {
      const q = readingQuestion(READING_TOP, 'en', objects, new Set(), random)
      if (q.choices.some((o) => o.kind === 'gift')) seenGift = true
    }
    expect(seenGift).toBe(true)
    // Every object but one avoided: that one is the target every time.
    const left = BUILT_IN_OBJECTS.find((o) => wordOf(o, 'en') === 'ball')!
    const avoid = new Set(BUILT_IN_OBJECTS.filter((o) => o !== left).map(objectKey))
    for (let k = 0; k < 20; k++) expect(readingQuestion(1, 'en', BUILT_IN_OBJECTS, avoid, random).target).toBe(left)
  })

  it('throws when there are not three words to choose from', () => {
    expect(() => readingQuestion(1, 'en', BUILT_IN_OBJECTS.slice(0, 1), new Set(), seeded(1))).toThrow(/no three words/)
  })
})

describe('the quiz levels', () => {
  it(`step up after ${LEVEL_MOVE.up} right in a row, down after ${LEVEL_MOVE.down} wrong, each subject on its own`, () => {
    let state: { levels: { maths: number; reading: number }; rows: Rows } = { levels: { maths: 2, reading: 1 }, rows: FRESH_ROWS }
    const answer = (subject: 'maths' | 'reading', right: boolean) => (state = afterAnswer(state.levels, state.rows, subject, right))
    answer('maths', true)
    answer('maths', true)
    answer('reading', false)
    expect(state.levels).toEqual({ maths: 2, reading: 1 })
    answer('maths', true)
    expect(state.levels).toEqual({ maths: 3, reading: 1 })
    // A wrong answer breaks the row of rights.
    answer('maths', true)
    answer('maths', false)
    answer('maths', true)
    answer('maths', true)
    expect(state.levels.maths).toBe(3)
    answer('maths', false)
    answer('maths', false)
    expect(state.levels.maths).toBe(2)
    // Never below 1.
    answer('reading', false)
    answer('reading', false)
    expect(state.levels.reading).toBe(1)
  })

  it('never step past the top, and bring a level past the top down to it', () => {
    let state = { levels: { maths: TOPS.maths, reading: TOPS.reading + 3 }, rows: FRESH_ROWS }
    for (let k = 0; k < LEVEL_MOVE.up; k++) state = afterAnswer(state.levels, state.rows, 'maths', true)
    expect(state.levels.maths).toBe(TOPS.maths)
    for (let k = 0; k < LEVEL_MOVE.up; k++) state = afterAnswer(state.levels, state.rows, 'reading', true)
    expect(state.levels.reading).toBe(TOPS.reading)
  })
})
