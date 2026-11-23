/**
 * The quiz's reading (plan.md, Sums by code, words by objects): a word is matched to its object.
 * Either the word is shown and its object is picked from three pictures, or an object is shown and
 * its word is picked from three words. The objects are Silly Billy's built-in things and the
 * presents this house has made (objects.ts), each with its name in both languages, and a player
 * reads them in their own.
 *
 * How hard a word is goes by its letters, so short words come first. A player's reading level is
 * the rung they stand on (saves.ts QuizLevels.reading); a level past the top plays the top rung.
 *
 *   1  a word of at most 5 letters is shown: pick its picture
 *   2  a picture is shown: pick its word among words of at most 5 letters
 *   3  either way, words of at most 7 letters
 *   4  either way, words of at most 10 letters, two words too
 *   5  either way, every word
 */

import type { Lang, Words } from '../../../../profiles/src/lang'
import { pick, shuffled } from './chance'

/** A thing a word names: one of Silly Billy's built-in things or one of the house's presents, by its id there, with its name. */
export interface QuizObject {
  readonly kind: 'item' | 'gift'
  readonly id: string
  readonly name: Words
}

export interface ReadingQuestion {
  readonly subject: 'reading'
  /** The rung it was made on, 1 to READING_TOP. */
  readonly rung: number
  /** What is shown: the word (the choices are pictures) or the object (the choices are words). */
  readonly shown: 'word' | 'object'
  readonly target: QuizObject
  /** Three objects of three different words, the target among them at a place of chance. */
  readonly choices: readonly QuizObject[]
}

export const READING_TOP = 5

/** An object's key, the same for the same object whatever its name. */
export const objectKey = (o: QuizObject) => `${o.kind}:${o.id}`

/** An object's word in a language, in small letters as children first learn to read them. */
export function wordOf(o: QuizObject, lang: Lang): string {
  return o.name[lang].toLocaleLowerCase(lang === 'fi' ? 'fi-FI' : 'en-GB')
}

/** The first rung a word may be read on: by its letters, and two words only from rung 4. */
export function wordRung(word: string): number {
  const letters = (word.match(/\p{L}/gu) ?? []).length
  const words = word.trim().split(/\s+/).length
  if (words > 1) return letters <= 10 ? 4 : 5
  return letters <= 5 ? 1 : letters <= 7 ? 3 : letters <= 10 ? 4 : 5
}

/** Whether two names can stand side by side as choices: no word of one inside a word of the other (ball and football, flowers and flower patch would be riddles). */
function apart(a: string, b: string): boolean {
  const as = a.split(/\s+/)
  const bs = b.split(/\s+/)
  return as.every((x) => bs.every((y) => !x.includes(y) && !y.includes(x)))
}

/**
 * A reading question for a player at reading level `level` (from 1) in `lang`, from `objects`. The
 * target is not one of `avoid` (the keys of the last few targets) while another can be had. Throws
 * when the objects cannot give three words apart at that rung, which Silly Billy's built-in things always can.
 */
export function readingQuestion(level: number, lang: Lang, objects: readonly QuizObject[], avoid: ReadonlySet<string>, random: () => number): ReadingQuestion {
  if (!Number.isInteger(level) || level < 1) throw new Error(`a reading level is a whole number from 1, not ${level}`)
  const rung = Math.min(level, READING_TOP)
  // One object a word: the first of the same word is kept.
  const seen = new Set<string>()
  const pool = objects.filter((o) => {
    const word = wordOf(o, lang)
    if (seen.has(word) || wordRung(word) > rung) return false
    seen.add(word)
    return true
  })
  const fresh = pool.filter((o) => !avoid.has(objectKey(o)))
  const target = pick(fresh.length > 0 ? fresh : pool, random)
  if (target === undefined) throw new Error(`no object to read at rung ${rung} in ${lang}`)
  const others = pool.filter((o) => o !== target && apart(wordOf(o, lang), wordOf(target, lang)))
  const wrong: QuizObject[] = []
  while (wrong.length < 2) {
    const left = others.filter((o) => wrong.every((w) => apart(wordOf(o, lang), wordOf(w, lang))))
    if (left.length === 0) throw new Error(`no three words apart at rung ${rung} in ${lang}`)
    wrong.push(pick(left, random))
  }
  const choices = shuffled([target, ...wrong], random)
  const shown = rung === 1 ? 'word' : rung === 2 ? 'object' : random() < 0.5 ? 'word' : 'object'
  return { subject: 'reading', rung, shown, target, choices }
}
