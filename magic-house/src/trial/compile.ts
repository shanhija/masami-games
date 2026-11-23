/**
 * Magic House: made code compiled from its guarded text (server/codeKinds.ts guards it) on Silly
 * Billy's sandbox (silly-billy/src/engine/sandbox.ts compile), each kind with a Budget that counts
 * turns only, never a clock, so code passes or fails the same way on the laptop, the tablet and in
 * the image build (plan.md, One seed, and weight that is counted), and with globals of its own:
 * - the room's Math is the engine's (engine/math.ts) with the world's seeded random, as
 *   engine/room.ts RoomRuntime holds it; its budget is the runtime's, which the room starts for
 *   the build and for each frame;
 * - the walkthrough's Math is the engine's with a stream of its own, the room's seed plus
 *   MATH.walkSeedOffset (WalkRuntime), so its throws never move the room's;
 * - a present's Math is the engine's with a stream that starts afresh at GIFT_SEED every time it
 *   is built, so it is the same present every time (engine/gift.ts GIFT_PREAMBLE);
 * - the look's Math is the engine's with a stream of its own, the room's seed plus
 *   MATH.lookSeedOffset, started afresh every time the look is built (LookRuntime), so building it
 *   never moves the room's stream and the same look on the same room is the same look every time;
 * - Date is undefined, and console is QUIET_CONSOLE (server/codeKinds.ts says why);
 * - every other plain built-in the guard allows (Object, Number, Array, JSON, Map...) is the page's
 *   own behind a proxy that refuses every change (SHARED), so `Object.assign(Number, ...)` or
 *   `Object.freeze(Array)` throws and the page, the engine and the next trial keep their built-ins.
 *   Calls, `new`, `instanceof` and reads go through; the prototypes stay out of reach because the
 *   guard refuses every key that leads to them.
 *
 * The page's trial worker imports this, so nothing under it may reach a .tsx file
 * (silly-billy/src/brain/workerWindow.ts says why); a test walks its imports. An error made code
 * throws names the designer's line through the sandbox's describeError.
 */

import { Budget, compile } from '../../../silly-billy/src/engine/sandbox'
import { GLOBALS as SILLY_GLOBALS } from '../../../silly-billy/src/server/codeKinds'
import type { Kit } from '../../../silly-billy/src/engine/kit'
import { BUDGET, MATH, type RoomCode } from '../engine/api'
import { kitFace } from '../engine/builder'
import { GIFT_MARKERS, type GiftCode, type ModelKit } from '../engine/gift'
import { LOOK_BUDGET, LOOK_MISTAKES, type LookCode } from '../engine/look'
import { madeMath, nextThrow, streamState, type MadeMath } from '../engine/math'
import type { RoomRuntime } from '../engine/room'
import type { WalkCode } from './api'

/** What made code has in place of the page's console: the calls a model reaches for, each doing nothing. Frozen, like everything made code is handed. */
export const QUIET_CONSOLE = Object.freeze({ log() {}, info() {}, warn() {}, error() {}, debug() {} })

/** A big number as a sentence says it: 100,000. */
const big = (n: number) => n.toLocaleString('en')

/** Made code changed a built-in the whole page shares. */
const refuse = (name: string) => (): never => {
  throw new TypeError(`made code cannot change ${name}: the whole page shares it`)
}

/**
 * The plain built-ins the guard allows (Silly Billy's list, which holds Magic House's), each behind a
 * proxy that refuses every change to it: made code reaches the page's own objects only through
 * these, so nothing it does can change them for the engine, the page or the next trial.
 */
const SHARED: Readonly<Record<string, unknown>> = Object.fromEntries(
  [...SILLY_GLOBALS].flatMap((name) => {
    const real = (globalThis as Record<string, unknown>)[name]
    if ((typeof real !== 'object' && typeof real !== 'function') || real === null) return []
    const no = refuse(name)
    return [[name, new Proxy(real, { set: no, defineProperty: no, deleteProperty: no, preventExtensions: no, setPrototypeOf: no })]]
  }),
)

/** The globals every kind gets in place of the page's: the shared built-ins behind their proxies, its Math, no Date, a quiet console. */
const globals = (math: MadeMath) => ({ ...SHARED, Math: math, Date: undefined, console: QUIET_CONSOLE })

/** A seeded stream as made code's Math.random draws it; `restart` puts it back at the start of a seed. */
function stream(what: string): { math: MadeMath; restart: (seed: number) => void } {
  let state: number | null = null
  const math = madeMath(() => {
    if (state === null) throw new Error(`the ${what}'s Math.random was drawn before its stream was started`)
    const [v, s] = nextThrow(state)
    state = s
    return v
  })
  return { math, restart: (seed) => void (state = streamState(seed)) }
}

// ------------------------------------------------------------------------------ the room

/** The room's guarded code compiled against its runtime: the runtime's budget and Math. A room built with buildRoom on the same runtime. */
export function compileRoom(guarded: string, runtime: RoomRuntime): RoomCode {
  return compile(guarded, 'room', runtime.budget, globals(runtime.math)) as RoomCode
}

// ------------------------------------------------------------------------------ the walkthrough

/** The turns the walkthrough may take between two frames (between two yields), and what it is told past them. */
export const WALK_TURNS = BUDGET.frameTurns
export const WALK_LONG = `the walkthrough took more than ${big(WALK_TURNS)} loop turns and calls in one frame and was stopped: a loop must yield in every turn`

/**
 * What a walkthrough is compiled against: a budget of turns only and a Math whose random is a
 * stream of its own. One runtime serves one run at a time: `seed` starts the stream for the room's
 * seed as that run plays it, and the trial starts a run of the budget (`startFrame`) before each
 * time it resumes the walkthrough.
 */
export class WalkRuntime {
  readonly budget = new Budget(null)
  readonly math: MadeMath
  private readonly restart: (seed: number) => void

  constructor() {
    const s = stream('walkthrough')
    this.math = s.math
    this.restart = s.restart
  }

  /** Starts the walkthrough's stream for a room played on `roomSeed`: the room's seed plus MATH.walkSeedOffset. */
  seed(roomSeed: number): void {
    this.restart(roomSeed + MATH.walkSeedOffset)
  }

  /** Starts a frame's run of the budget: WALK_TURNS, past which the walkthrough is stopped with WALK_LONG. */
  startFrame(): void {
    this.budget.start(WALK_TURNS, WALK_LONG)
  }
}

/** The walkthrough's guarded code compiled against its runtime. */
export function compileWalk(guarded: string, runtime: WalkRuntime): WalkCode {
  return compile(guarded, 'walkthrough', runtime.budget, globals(runtime.math)) as WalkCode
}

// ------------------------------------------------------------------------------ a present

/** The turns a present's code may take to build it, its kit's calls counted. */
export const GIFT_TURNS = 100_000
export const GIFT_LONG = `the present's code took more than ${big(GIFT_TURNS)} loop turns and calls and was stopped: build it with fewer turns of its loops`
/** The seed a present's Math.random starts from every time it is built. */
export const GIFT_SEED = 0

/** A present compiled: builds it into a fresh kit of Silly Billy's, through the kit's frozen face (engine/builder.ts kitFace, with anchor) and c as the two markers. Throws whatever its code throws. */
export type GiftBuild = (kit: Kit) => void

/** A present's guarded code compiled. Every build is a fresh run of GIFT_TURNS with the stream at GIFT_SEED, so the same code always builds the same present. */
export function compileGift(guarded: string): GiftBuild {
  const budget = new Budget(null)
  const { math, restart } = stream('present')
  const code = compile(guarded, 'present', budget, globals(math)) as GiftCode
  const colours = Object.freeze({ ...GIFT_MARKERS })
  return (kit) => {
    budget.start(GIFT_TURNS, GIFT_LONG)
    restart(GIFT_SEED)
    code(kitFace(kit, budget.turn, true) as unknown as ModelKit, colours)
  }
}

// ------------------------------------------------------------------------------ the look

/**
 * What a look is compiled against: a budget of turns only and a Math whose random is a stream of its
 * own. One runtime serves one build at a time: engine/lookBuilder.ts buildLook calls `start` with the
 * room's seed before it runs the look's code, and the look's builder and the faces of the room count
 * their calls on `budget` as the code's loops do.
 */
export class LookRuntime {
  readonly budget = new Budget(null)
  readonly math: MadeMath
  private readonly restart: (seed: number) => void

  constructor() {
    const s = stream('look')
    this.math = s.math
    this.restart = s.restart
  }

  /** Starts a build of the look on a room played on `roomSeed`: its stream at the room's seed plus MATH.lookSeedOffset, and a run of LOOK_BUDGET.buildTurns, past which the look is stopped with LOOK_MISTAKES.lookLong. */
  start(roomSeed: number): void {
    this.restart(roomSeed + MATH.lookSeedOffset)
    this.budget.start(LOOK_BUDGET.buildTurns, LOOK_MISTAKES.lookLong())
  }
}

/** The look's guarded code compiled against its runtime. */
export function compileLook(guarded: string, runtime: LookRuntime): LookCode {
  return compile(guarded, 'look', runtime.budget, globals(runtime.math)) as LookCode
}
