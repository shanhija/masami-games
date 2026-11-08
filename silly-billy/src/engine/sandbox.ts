/**
 * Running made code in the page. The dev server already put a guard call at the top of every
 * loop body and function body (server/guard.ts) and wrapped the code in a function
 * expression; here that expression is compiled once, in strict mode, with the page's
 * globals shadowed, and given the guard. The sim resets the guard before every call into
 * made code; a call that loops more than GUARD_LIMIT times without returning throws
 * GuardError, which ends that action like any other error.
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
  constructor(message = 'a loop ran too long without yield') {
    super(message)
    this.name = 'GuardError'
  }
}

/** The page's globals made code must not reach: each is a parameter of the wrapper, passed undefined. Not eval or arguments: strict mode forbids binding them. `performance` is the clock the guard and the sim's time budget read. */
const SHADOWED = [
  'window', 'self', 'globalThis', 'document', 'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'localStorage', 'sessionStorage',
  'indexedDB', 'caches', 'navigator', 'location', 'history', 'postMessage', 'importScripts', 'Worker', 'SharedWorker', 'setTimeout',
  'setInterval', 'requestAnimationFrame', 'queueMicrotask', 'alert', 'open', 'close', 'Function', 'performance', 'top', 'parent',
  'frames', 'opener', 'Reflect', 'WebAssembly', 'Image', 'Audio', 'speechSynthesis', 'BroadcastChannel', 'MessageChannel', 'Notification',
]
const UNDEFINED = SHADOWED.map(() => undefined)

let spent = 0
let since = 0

/** The `__g()` the server put into every loop and function body. */
function guard() {
  if (++spent > GUARD_LIMIT) throw new GuardError()
  if ((spent & 1023) === 0 && performance.now() - since > GUARD_MS) throw new GuardError('a loop took too long: do less in each turn, or yield')
}

/** Starts a fresh budget: the sim calls this before every call into made code. */
export function resetGuard(): void {
  spent = 0
  since = performance.now()
}

/** The function a guarded expression evaluates to. The newline before the closing bracket keeps a last-line comment from swallowing it. */
function compile(guarded: string, what: string): unknown {
  const wrapper = new Function('__g', ...SHADOWED, `"use strict"; return (${guarded}\n)`) as (...args: unknown[]) => unknown
  const fn = wrapper(guard, ...UNDEFINED)
  if (typeof fn !== 'function') throw new TypeError(`the ${what} code is not a function`)
  return fn
}

/** Compiles guarded action code (a `function* (me, args, w)` expression). Throws on a syntax error. */
export function compileAction(guarded: string): ActionFn {
  return compile(guarded, 'action') as ActionFn
}

/** Compiles guarded model code (a `function (m)` expression). Each call is one call into made code, with a fresh budget whoever makes it. */
export function compileModel(guarded: string): (m: Kit) => unknown {
  const build = compile(guarded, 'model') as (m: Kit) => unknown
  return (m) => {
    resetGuard()
    return build(m)
  }
}

/** Compiles guarded process code (a `function (it, w, dt)` expression), each call with a fresh budget and no `this`. */
export function compileTick(guarded: string): TickFn {
  const tick = compile(guarded, 'process') as TickFn
  return (it, w, dt) => {
    resetGuard()
    tick(it, w, dt)
  }
}

/**
 * The line, in the compiled wrapper, of the innermost frame of made code in an error's stack:
 * V8 writes `(eval at ..., <anonymous>:LINE:COL)`, Firefox `... > Function:LINE:COL`; Safari
 * puts the line on the error itself, with no source URL, when made code threw it.
 */
function wrapperLine(err: unknown): number | null {
  if (err === null || typeof err !== 'object') return null
  const { stack, line, sourceURL } = err as { stack?: unknown; line?: unknown; sourceURL?: unknown }
  if (typeof stack === 'string') {
    for (const frame of stack.split('\n')) {
      const m = (frame.includes('eval at') && /<anonymous>:(\d+):\d+/.exec(frame)) || / > (?:Function|eval):(\d+):\d+/.exec(frame)
      if (m) return Number(m[1])
    }
  }
  return typeof line === 'number' && !sourceURL ? line : null
}

/** How many lines the wrapper adds before the designer's first line, found once by a probe that throws on its own first line; null where the browser does not tell. */
let offset: number | null | undefined
function lineOffset(): number | null {
  if (offset === undefined) {
    offset = null
    try {
      ;(compile('function __probe() {\nthrow new Error("probe")\n}', 'probe') as () => void)()
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
