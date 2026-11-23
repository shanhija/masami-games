/**
 * Running made code in the page. The dev server already put a guard call at the top of every
 * loop body and function body (server/guard.ts) and wrapped the code in a function
 * expression; here that expression is compiled once, in strict mode, with the page's
 * globals shadowed, and its guard calls count against a Budget. Silly Billy's code counts
 * against one budget, which the sim starts afresh before every call into made code
 * (resetGuard); a call that loops more than GUARD_LIMIT times without returning throws
 * GuardError, which ends that action like any other error. Another game compiles its own
 * functions with `compile`: a budget of its own, which may count turns only and never look at
 * the clock, and globals of its own, such as a Math whose random is its world's seeded one.
 *
 * The walls round made code, outermost first: the dev server's guard refuses code that names
 * anything but its own names, its params and a few plain built-ins (Math, JSON, Array...), or
 * reaches for keys like constructor, prototype or __proto__, and checks keys worked out at run
 * time (`__k`); the validation worker (brain/validate.ts) runs new code first, alone, and is
 * killed if it hangs; here the page's globals are shadowed once more, for code saved before a
 * change to the guard; and the guard's budget (GUARD_LIMIT turns, GUARD_MS) and the sim's time
 * budget end code that runs too long. One long call into the browser itself (an array of a
 * billion) can still hold the page once: only a worker at play time could stop that.
 *
 * CONTRACT (the engine builds this file; others import it).
 */

import type { ActionFn, TickFn } from './api'
import type { Kit } from './kit'

/** How many loop turns and calls one step of made code may take. */
export const GUARD_LIMIT = 100_000
/**
 * How long, in real milliseconds, one step of made code may keep looping, looked at every
 * 1024 turns: a loop with heavy work in each turn (puffs by the thousand, a big array) stops
 * here long before GUARD_LIMIT turns. One long call into the browser itself (an array of a
 * billion) has no turns to look in; the sim's time budget ends such code after it returns.
 */
export const GUARD_MS = 250

export class GuardError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GuardError'
  }
}

/**
 * What made code may spend, counted by the `__g()` the guard put into every loop and function
 * body: one turn for every loop turn and every call. A run starts with the turns its caller
 * allows and what GuardError says past them, and `spent` is what the run has taken so far, so a
 * caller can weigh one call or a run of calls. A budget with a clock also stops a run that takes
 * longer than its milliseconds of real time (looked at every 1024 turns); one without counts
 * turns only, so code passes or fails the same way on any machine (a worker that hangs is
 * killed instead). Code compiled against a budget counts against it all its life, and so does
 * every function that code makes.
 */
export class Budget {
  private turns = 0
  private limit = 0
  private over = 'made code ran before its budget was started'
  private since = 0

  constructor(private readonly clock: { ms: number; message: string } | null) {}

  /** The turns taken since the run started. */
  get spent(): number {
    return this.turns
  }

  /** Starts a run: nothing spent, the clock at now, and at most `turns` turns, past which GuardError says `message`. */
  start(turns: number, message: string): void {
    this.turns = 0
    this.limit = turns
    this.over = message
    if (this.clock !== null) this.since = performance.now()
  }

  /** The `__g()` itself: one turn. */
  readonly turn = (): void => {
    if (++this.turns > this.limit) throw new GuardError(this.over)
    if (this.clock !== null && (this.turns & 1023) === 0 && performance.now() - this.since > this.clock.ms) throw new GuardError(this.clock.message)
  }
}

/** Silly Billy's budget: every call into made code is a run of GUARD_LIMIT turns and GUARD_MS. */
const steps = new Budget({ ms: GUARD_MS, message: 'a loop took too long: do less in each turn, or yield' })

/** Starts a fresh budget: the sim calls this before every call into made code. */
export function resetGuard(): void {
  steps.start(GUARD_LIMIT, 'a loop ran too long without yield')
}

/** The page's globals made code must not reach: each is a parameter of the wrapper, passed undefined. Not eval or arguments: strict mode forbids binding them. `performance` is the clock the guard and the sim's time budget read. */
const SHADOWED = [
  'window', 'self', 'globalThis', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage',
  'indexedDB', 'caches', 'navigator', 'location', 'history', 'postMessage', 'importScripts', 'Worker', 'SharedWorker', 'setTimeout',
  'setInterval', 'requestAnimationFrame', 'queueMicrotask', 'alert', 'open', 'close', 'Function', 'performance', 'top', 'parent',
  'frames', 'opener', 'Reflect', 'WebAssembly', 'Image', 'Audio', 'speechSynthesis', 'BroadcastChannel', 'MessageChannel', 'Notification',
]

/**
 * The function a guarded expression evaluates to, compiled once in strict mode, its `__g()`
 * counting against `budget`. The page's globals are parameters of a wrapper, passed undefined,
 * and so are `own`'s names, passed their values instead: a Math of the game's own (with its
 * world's seeded random), or Date as undefined. Math's members do not spread (`{ ...Math }` is
 * empty), so a Math of one's own is built from `Object.getOwnPropertyNames(Math)`. The newline
 * before the closing bracket keeps a last-line comment from swallowing it. Throws on a syntax
 * error, and when the code is not a function (`what` names the code in the error).
 */
export function compile(guarded: string, what: string, budget: Budget, own: Readonly<Record<string, unknown>>): unknown {
  const names = new Map<string, unknown>(SHADOWED.map((name) => [name, undefined]))
  for (const [name, value] of Object.entries(own)) names.set(name, value)
  const wrapper = new Function('__g', ...names.keys(), `"use strict"; return (${guarded}\n)`) as (...args: unknown[]) => unknown
  const fn = wrapper(budget.turn, ...names.values())
  if (typeof fn !== 'function') throw new TypeError(`the ${what} code is not a function`)
  return fn
}

/** Compiles guarded action code (a `function* (me, args, w)` expression), counting against Silly Billy's budget. Throws on a syntax error. */
export function compileAction(guarded: string): ActionFn {
  return compile(guarded, 'action', steps, {}) as ActionFn
}

/** Compiles guarded model code (a `function (m)` expression). Each call is one call into made code, with a fresh budget whoever makes it. */
export function compileModel(guarded: string): (m: Kit) => unknown {
  const build = compile(guarded, 'model', steps, {}) as (m: Kit) => unknown
  return (m) => {
    resetGuard()
    return build(m)
  }
}

/** Compiles guarded process code (a `function (it, w, dt)` expression), each call with a fresh budget and no `this`. */
export function compileTick(guarded: string): TickFn {
  const tick = compile(guarded, 'process', steps, {}) as TickFn
  return (it, w, dt) => {
    resetGuard()
    tick(it, w, dt)
  }
}

/**
 * The lines, in the compiled wrapper, of the frames of made code in an error's stack, innermost
 * first: V8 writes `(eval at ..., <anonymous>:LINE:COL)`, Firefox `... > Function:LINE:COL`;
 * Safari puts only the innermost line on the error itself, with no source URL, when made code
 * threw it.
 */
function wrapperLines(err: unknown): number[] {
  if (err === null || typeof err !== 'object') return []
  const { stack, line, sourceURL } = err as { stack?: unknown; line?: unknown; sourceURL?: unknown }
  if (typeof stack === 'string') {
    const lines: number[] = []
    for (const frame of stack.split('\n')) {
      const m = (frame.includes('eval at') && /<anonymous>:(\d+):\d+/.exec(frame)) || / > (?:Function|eval):(\d+):\d+/.exec(frame)
      if (m) lines.push(Number(m[1]))
    }
    if (lines.length > 0) return lines
  }
  return typeof line === 'number' && !sourceURL ? [line] : []
}

/** The line, in the compiled wrapper, of the innermost frame of made code in an error's stack, or null. */
function wrapperLine(err: unknown): number | null {
  return wrapperLines(err)[0] ?? null
}

/**
 * The designer's lines in an error's stack, innermost first: where made code was when it threw or
 * was stopped, then the lines of made code that called it (a loop stopped inside a helper it
 * calls names the helper first and the loop after). Empty where the browser does not tell.
 */
export function madeLines(err: unknown): number[] {
  const off = lineOffset()
  return off === null ? [] : wrapperLines(err).map((l) => l - off).filter((l) => l >= 1)
}

/** How many lines the wrapper adds before the designer's first line, found once by a probe that throws on its own first line; null where the browser does not tell. */
let offset: number | null | undefined
function lineOffset(): number | null {
  if (offset === undefined) {
    offset = null
    try {
      ;(compile('function __probe() {\nthrow new Error("probe")\n}', 'probe', steps, {}) as () => void)()
    } catch (e) {
      const at = wrapperLine(e)
      offset = at === null ? null : at - 1
    }
  }
  return offset
}

/** Something made code threw that is not an Error, as text. */
function shown(v: unknown): string {
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return 'something that is not an error'
  }
}

/** An error from made code as one short line for the designer to fix: the message and the line in their code. */
export function describeError(err: unknown): string {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : typeof err === 'string' ? err : `thrown: ${shown(err)}`
  const at = wrapperLine(err)
  const off = lineOffset()
  const line = at !== null && off !== null ? at - off : null
  return (line !== null && line >= 1 ? `${text} (line ${line})` : text).slice(0, 300)
}
