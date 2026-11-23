/**
 * Magic House's made code as Silly Billy's guard (silly-billy/src/server/guard.ts) wraps it: a
 * room is the body of a function run once with the builder and the world, a walkthrough the body
 * of a generator run with the bots, a present the body of a function given the kit and the
 * wearer's colours (plan.md, The contract, in outline), and a room's look the body of a function
 * run once with the look's builder and the room as built (engine/look.ts, step 7a). This runs in Node: the guard parses with
 * Vite's parser, so the server (step 4) and the tests guard with it, and the page and its worker
 * only compile what comes already guarded (trial/compile.ts).
 */

import { guard, type Guarded, type MadeFunction } from '../../../silly-billy/src/server/guard'
import { GLOBALS as SILLY_GLOBALS } from '../../../silly-billy/src/server/codeKinds'

/** Which function the code is the body of. */
export type CodeKind = 'room' | 'walk' | 'gift' | 'look'

/**
 * The plain JavaScript Magic House's made code may use besides its own names and its parameters:
 * Silly Billy's, without Date, since a room passes or fails on its seed and the game's clock alone
 * (plan.md, One seed, and weight that is counted). console stays: a model writing quickly may
 * leave a console.log in, and refusing it would cost a fix round of Opus for nothing; the compile
 * hands made code a quiet console instead (trial/compile.ts QUIET_CONSOLE), because nobody reads
 * what it writes and a log every frame of a trial played fast would only cost the worker time.
 */
export const GLOBALS: ReadonlySet<string> = new Set([...SILLY_GLOBALS].filter((name) => name !== 'Date'))

export const CODE_KINDS: Record<CodeKind, MadeFunction> = {
  room: { header: 'function __room(r, w) {', allowed: GLOBALS },
  walk: { header: 'function* __walk(bots, w) {', allowed: GLOBALS },
  gift: { header: 'function __gift(m, c) {', allowed: GLOBALS },
  look: { header: 'function __look(r, room) {', allowed: GLOBALS },
}

/** The body of one kind, guarded: the function's whole text for trial/compile.ts, or the syntax error (or a name it may not use) with the designer's line. */
export function guardCode(kind: CodeKind, code: string): Guarded {
  return guard(CODE_KINDS[kind], code)
}
