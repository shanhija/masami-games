/**
 * Silly Billy's made code as the guard (guard.ts) wraps it: an action is the body of a generator
 * run as its actor, a thing's model the body of a function given the kit, and a thing's process
 * the body of a function run every frame, as the designer is told (engine/apidoc.ts) and the
 * page compiles them (engine/sandbox.ts). The store and the API guard every kind by these.
 */

import type { MadeFunction } from './guard'

/** Which function the code is the body of. */
export type CodeKind = 'action' | 'model' | 'tick'

/** The plain JavaScript Silly Billy's made code may use besides its own names and its parameters. */
export const GLOBALS: ReadonlySet<string> = new Set([
  'Math', 'Number', 'String', 'Boolean', 'Array', 'Object', 'JSON', 'Map', 'Set', 'WeakMap', 'WeakSet', 'Symbol', 'Date',
  'Error', 'TypeError', 'RangeError', 'Infinity', 'NaN', 'undefined', 'isFinite', 'isNaN', 'parseInt', 'parseFloat', 'console',
])

export const CODE_KINDS: Record<CodeKind, MadeFunction> = {
  action: { header: 'function* __action(me, args, w) {', allowed: GLOBALS },
  model: { header: 'function __model(m) {', allowed: GLOBALS },
  tick: { header: 'function __tick(it, w, dt) {', allowed: GLOBALS },
}
