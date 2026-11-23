/**
 * Magic House: how the engine answers made code that misreads the reference (engine/api.ts
 * MISTAKES): the frozen faces made code sees every engine object through, and the checks of what
 * it passes in. Each check throws a Mistake whose message is the sentence that names what was
 * wrong and the one right way.
 *
 * A face is a Proxy over a frozen object of calls only (plan.md, The reference is the prompt, and it is true). Reading a key
 * it lacks, writing to it, or using one of its calls as a value comes back as a MISTAKES sentence:
 * each call is itself a Proxy whose conversion to a number or a string throws (so `zone.weight >= 1`
 * is caught) and whose keys throw (so `p.at[0]` is caught). Every call counts one turn of the room's
 * budget before it runs (BUDGET: loop turns and calls into the engine).
 */

import { describeError, GuardError, madeLines } from '../../../silly-billy/src/engine/sandbox'
import { parseColor } from '../../../silly-billy/src/engine/kit'
import type { Vec3 } from '../../../silly-billy/src/engine/types'
import type { Words } from '../../../profiles/src/lang'
import { MISTAKES, type Point } from './api'

/** A misreading of the reference: its message is the sentence for the designer. */
export class Mistake extends Error {
  constructor(sentence: string) {
    super(sentence)
    this.name = 'mistake'
  }
}

// ------------------------------------------------------------------------------ faces

/** Every face made, so a check can tell a handle passed where a point belongs. */
const faces = new WeakSet<object>()

export function isFace(v: unknown): boolean {
  return typeof v === 'object' && v !== null && faces.has(v)
}

/** Which keys of a face's calls are refused (the walkthrough reads the room and cannot act on it), and with what sentence. */
export interface Refused {
  readonly keys: readonly string[]
  readonly sentence: (key: string) => string
}

/**
 * A frozen face over `calls`, as made code sees an engine object named `what` (a player, the
 * builder, the kit). Each call counts one turn first. A key in `refused` is not on the face and
 * says its own sentence.
 */
export function face<T extends object>(what: string, calls: T, turn: () => void, refused: Refused | null): T {
  const own = Object.create(null) as Record<string, unknown>
  const names: string[] = []
  for (const [key, fn] of Object.entries(calls)) {
    if (refused !== null && refused.keys.includes(key)) continue
    names.push(key)
    own[key] = callFace(what, key, fn as (...args: unknown[]) => unknown, turn)
  }
  Object.freeze(own)
  const frozenField = (key: string | symbol): never => {
    throw new Mistake(MISTAKES.frozen(what, String(key)))
  }
  const proxy = new Proxy(own, {
    get(target, key) {
      if (typeof key === 'symbol') return undefined
      if (Object.prototype.hasOwnProperty.call(target, key)) return target[key]
      if (refused !== null && refused.keys.includes(key)) throw new Mistake(refused.sentence(key))
      throw new Mistake(MISTAKES.noField(what, key, names))
    },
    set: (...[, key]: [Record<string, unknown>, string | symbol]) => frozenField(key),
    defineProperty: (...[, key]: [Record<string, unknown>, string | symbol]) => frozenField(key),
    deleteProperty: (...[, key]: [Record<string, unknown>, string | symbol]) => frozenField(key),
    setPrototypeOf: () => frozenField('prototype'),
  })
  faces.add(proxy)
  return proxy as T
}

/** One call of a face: it runs when called; used as a value, or read into, it says to call it. */
function callFace(what: string, key: string, fn: (...args: unknown[]) => unknown, turn: () => void): unknown {
  const notCalled = (): never => {
    throw new Mistake(MISTAKES.notCalled(what, key))
  }
  const call = (...args: unknown[]) => {
    turn()
    return fn(...args)
  }
  return new Proxy(call, {
    get(target, k) {
      if (k === Symbol.toPrimitive) return notCalled
      if (k === 'call' || k === 'apply' || k === 'bind') return Reflect.get(target, k)
      if (typeof k === 'symbol') return undefined
      return notCalled()
    },
    set: () => notCalled(),
    defineProperty: () => notCalled(),
    deleteProperty: () => notCalled(),
  })
}

// ------------------------------------------------------------------------------ what made code passes in

/** A value as a sentence names it. */
export function described(v: unknown): string {
  if (isFace(v)) return 'a handle (its point is .at())'
  if (Array.isArray(v)) return `[${v.map((x) => (typeof x === 'number' ? String(x) : typeof x === 'string' ? `'${x}'` : typeof x)).join(', ')}]`
  if (v === undefined) return 'nothing'
  if (v === null) return 'null'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return `'${v}'`
  if (typeof v === 'function') return 'a function'
  if (typeof v === 'object') return 'an object'
  return typeof v
}

/** A point given back to made code: a frozen copy. */
export function frozenPoint(v: readonly number[]): Point {
  return Object.freeze([v[0], v[1], v[2]] as const)
}

/** A number made code gave: finite. */
export function num(call: string, arg: string, v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Mistake(MISTAKES.notNumber(call, arg))
  return v
}

/** A point made code gave: three finite numbers. */
export function point(call: string, arg: string, v: unknown): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) throw new Mistake(MISTAKES.notPoint(call, arg, described(v)))
  return [num(call, arg, v[0]), num(call, arg, v[1]), num(call, arg, v[2])]
}

/** A size made code gave: three numbers, each more than 0. */
export function size(call: string, arg: string, v: unknown): Vec3 {
  const s = point(call, arg, v)
  if (s[0] <= 0 || s[1] <= 0 || s[2] <= 0) throw new Mistake(MISTAKES.notSize(call, arg))
  return s
}

export function bool(call: string, arg: string, v: unknown): boolean {
  if (typeof v !== 'boolean') throw new Mistake(MISTAKES.notChoice(call, arg, described(v), ['true', 'false']))
  return v
}

export function text(call: string, arg: string, v: unknown): string {
  if (typeof v !== 'string') throw new Mistake(MISTAKES.notText(call, arg))
  return v
}

export function fn<T>(call: string, arg: string, v: unknown): T {
  if (typeof v !== 'function') throw new Mistake(MISTAKES.notFunction(call, arg))
  return v as T
}

export function colour(call: string, arg: string, v: unknown): string {
  const c = parseColor(v)
  if (c === null) throw new Mistake(MISTAKES.notColor(call, arg, described(v)))
  return c
}

export function choice<T extends string>(call: string, arg: string, v: unknown, choices: readonly T[]): T {
  if (typeof v !== 'string' || !(choices as readonly string[]).includes(v)) throw new Mistake(MISTAKES.notChoice(call, arg, described(v), choices))
  return v as T
}

/** A trailing options object: left out is {}; every key must be one of `known`. */
export function options(call: string, v: unknown, known: readonly string[]): Readonly<Record<string, unknown>> {
  if (v === undefined) return {}
  if (typeof v !== 'object' || v === null || Array.isArray(v) || isFace(v)) throw new Mistake(MISTAKES.notOptions(call, described(v)))
  const o = v as Record<string, unknown>
  for (const key of Object.keys(o)) if (!known.includes(key)) throw new Mistake(MISTAKES.unknownOption(call, key, known))
  return o
}

/** A dash a child's words may not have: an en or em dash, or a hyphen standing alone between words. A hyphen inside a word (linja-auto) is a word's own. */
const DASH = /[‒-―]|(^|\s)-+(\s|$)/

/** Words for a child: { en, fi }, at most `max` words in each, no dashes. */
export function words(where: string, v: unknown, max: number): Words {
  if (typeof v !== 'object' || v === null || isFace(v)) throw new Mistake(MISTAKES.notWords(where))
  const o = v as Record<string, unknown>
  const keys = Object.keys(o)
  if (typeof o.en !== 'string' || typeof o.fi !== 'string' || o.en.trim() === '' || o.fi.trim() === '' || keys.length !== 2) throw new Mistake(MISTAKES.notWords(where))
  for (const lang of ['en', 'fi'] as const) {
    const t = o[lang] as string
    if (DASH.test(t)) throw new Mistake(MISTAKES.dash(where))
    const count = t.trim().split(/\s+/).length
    if (count > max) throw new Mistake(MISTAKES.tooManyWords(where, lang === 'en' ? 'English' : 'Finnish', count, max))
  }
  return Object.freeze({ en: o.en as string, fi: o.fi as string })
}

// ------------------------------------------------------------------------------ an error as a sentence

/** JavaScript's own errors for writing to a frozen point or list. */
export const FROZEN_JS = /read.only|not extensible|Cannot add property|Cannot assign to|Cannot delete|Attempted to assign|object is not extensible/i

/**
 * An error made code threw, or caused, as the sentence the trial keeps: a misreading says its own
 * sentence (its frozen-list form for JavaScript's own), a guard stop says where it was stopped (and
 * the line that called it, when that is made code too), and
 * anything else is MISTAKES.thrown; each with the designer's line where the browser tells it.
 * `where` names the call that was running (null for the room's code as it first runs).
 */
export function explain(where: string | null, err: unknown): string {
  const said = describeError(err)
  const line = /\(line \d+\)$/.exec(said)
  const tail = line === null ? '' : ` ${line[0]}`
  const prefix = where === null ? '' : `${where}: `
  if (err instanceof GuardError) {
    // Code stopped for spending too much may be stopped inside a helper its loop calls: the line that called it is named too, so the loop is found.
    const lines = madeLines(err).filter((l, i, all) => i === 0 || l !== all[i - 1])
    return lines.length > 1 ? `${err.message} (line ${lines[0]}, called from line ${lines[1]})` : `${err.message}${tail}`
  }
  if (err instanceof Mistake) return `${prefix}${err.message}${tail}`
  if (err instanceof TypeError && FROZEN_JS.test(err.message)) return `${prefix}${MISTAKES.frozenList()}${tail}`
  return MISTAKES.thrown(where ?? "the room's code", said)
}
