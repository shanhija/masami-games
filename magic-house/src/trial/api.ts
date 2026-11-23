/**
 * Magic House: the walkthrough's API as made code sees it: types and reference text (plan.md, The
 * contract, in outline), played by trial/walk.ts.
 *
 * Every room comes with its walkthrough: the body of `function* (bots, w)`, which plays the room
 * to its end with one bot a player, written in what bots do (go there, take that, press this,
 * wait until), never in key presses. The trial plays it to prove the room can be finished and to
 * time a clean pass on the game's clock, and `?autoplay` shows it.
 *
 * A bot is a player the walkthrough steers: it has every read of a player (engine/api.ts
 * `PlayerView`, so `bots[0].at()` works) and the verbs below, each an engine generator run with
 * `yield*`. In the walkthrough every read that gives back a player (zone.inside(), thing.heldBy(),
 * p.standingOn()) gives back that player's bot, the very handle in bots, so `===`, `zone.has(bot)`
 * and `includes(bot)` work. The verbs set the seat's stick and buttons one frame at a time through the same input
 * layer a child's pad feeds, so a bot can do nothing a child cannot. The walkthrough finds the
 * room's handles by the names the room gave them (`w.get`), with their reads only: it plays the
 * room and cannot change it. Each line sits in a const that `satisfies Record<keyof X, string>`,
 * as in engine/api.ts; WALK_PREAMBLE and the sections of WALK_REFERENCE are what the server's
 * prompt (step 4) joins after the room's.
 *
 * What step 3 built behind these lines (trial/walk.ts runs them; trial/search.ts and trial/graph.ts
 * are goTo's search):
 * - `goTo` is a beam search over a copy of the bot's own body (a Player's plain numbers), stepped by
 *   the very controller the sim uses for players, against the room held as it stands: solids, movers
 *   by their clocks (place is pure, so their future is exact) with the slides and turns under way,
 *   things where they are, zones' pulls, other players and their heads. It never sees what the
 *   room's code will do next. Decisions every 0.15 s (Pia Jump's `bot.ts`), narrow first and wider
 *   only when that finds no way. The beam is scored by the remaining cost on a coarse floor graph,
 *   never by straight-line distance: standable spots a column apart joined by walking, stepping up,
 *   dropping, and jumping within the jump's reach under the pull where it leaves and lands; a solid
 *   that moves is a node of its own, joined where its swept path meets a spot, with when it does;
 *   heads are floors only when there is no way without a boost. Dijkstra from the target, rebuilt when
 *   the room changes. A node in the air is scored by the floor it left or the best floor it can still
 *   come down on; the wait for a solid that moves is counted as it will really be, and a long wait is
 *   a plan of its own to stand still. It plans again whenever the real body leaves the plan or the
 *   room changes under it (but keeps a plan whose rest still goes where it went). When it gives up,
 *   the sentence (WALK_MISTAKES.noWay) comes from the graph: the nearest missing edge between what
 *   the bot can reach and the target, the gap across and up, and what a jump reaches.
 * - `carry`: goTo where a press of grab takes this thing and no nearer one, press, goTo where a press
 *   sets it down so that it comes to rest at the target (facing either way) and nothing with use is
 *   within reach (there the press would use that), press with the stick let go. A thing with use is
 *   refused (WALK_MISTAKES.hasUse). `push`: goTo the thing's far side from the target, then hold the stick toward the target until
 *   the thing's middle is within GOTO.leave across (or the zone notices it). Bots pushing one thing in
 *   `w.together` simply push at once and the sim adds their weights; there is no joint plan. The
 *   thing not moving for GOTO.stuckSecs while every bot pushing it pushes gives up with
 *   WALK_MISTAKES.pushStuck when the pushers weigh less than it, else pushBlocked naming what stands
 *   at its leading side.
 * - A sentence a verb or w throws stops the run at the end of its frame even when the walkthrough's
 *   code catches it, and every later call throws it again; a call made without yield* is caught at
 *   the end of its frame, also when the code ends in it.
 * - `w.together` interleaves its runs one frame each. A bot's stick verbs (goTo, carry, push,
 *   steer) never run two at once for one bot (the second waits); its buttons are separate.
 * - The walkthrough's Math.random draws from a stream of its own (engine/api.ts MATH).
 * - From high up (step 6; trial/highSearch.ts and trial/highGraph.ts) goTo is the same beam search
 *   stepping the controller on the floor (engine/floorPlayer.ts), scored by Dijkstra on a floor
 *   graph of cells over x and z: spots on the tops in each cell, joined by walking to the eight
 *   cells round, stepping up, and jumping or dropping between the edge spots of floors where a
 *   running jump reaches and its arc clears what stands between; a moving solid one node as from the
 *   side. A loose thing's top and a head are floors only in the graph used when there is no way
 *   without one. The moves are the ways the graph gives (toward a point a metre along its best way,
 *   turned a little, the compass), narrow first. A landing the search could not make is taken out of
 *   the graph and the search runs again (twice at most). Its sentences give places as x, y, z: a gap
 *   between floors' footprints as built, across the floor and up, a top too high, or a solid in the
 *   way with where it stands on the floor. carry sets a thing down ahead the way the bot faces
 *   (turning it first with a touch of the stick), with its middle over a zone; push walks a thing
 *   straight toward its target from just behind it.
 * - The pass's time includes the walkthrough's waits, so a wait can pad a room too short for
 *   PASS.minSecs (the ask by hand did, with w.wait(55 - w.time())), and so can standing the room's
 *   code asks for while the walkthrough waits in w.until. The reference says not to; the trial
 *   cannot tell such a wait from one the room asks for, so it does not fail it, but its report and
 *   the log give the seconds of the pass in which every bot stood idle, for whoever reads the log.
 * - When the room ends, the walkthrough is stopped wherever it is.
 * - The trial (trial/trial.ts, which says its order and when it stops) judges by the steps
 *   (engine/api.ts PASS): a clean pass has every step done, in order, and the room finished; in a
 *   room with r.clock, every step done before the clock runs out, and its seconds are the clock's.
 *   A step whose done() is true the first frame it is asked fails it (stepEarly), even when a
 *   player's start already does it: its dot would fill with nobody doing anything. When the
 *   walkthrough's code ends first, the room has TRIAL.doneSecs to finish.
 * - A room played together or side by side has the still-bot runs; a contest has none (its one
 *   step and its order at w.finish are the engine's own checks).
 * - In the trial's still-bot runs, the still bot's pad is always let go: goTo, carry and push end at
 *   once (carry and push give back false), and press, hold and steer take their time with nothing
 *   held, so a loop of them still yields (trial/walk.ts). Any stop in such a run (no way, a
 *   condition never true, the walkthrough's end) counts as the room staying unfinished, never as a
 *   fault. The run counts as finished only when every step is done or the room ended by w.finish;
 *   the end of a clock alone is not finished.
 */

import { FEEL, PASS, TRIAL, type Level, type Own, type PlayerView, type Point, type RefSection, type Seen, type ThingView, READS_REFERENCE } from '../engine/api'

/** What every bot verb and every wait gives back: run it with `yield*`, which evaluates to T (carry and push say whether they got there). */
export type Run<T = void> = Generator<void, T, void>

/** The walkthrough: the body of `function* (bots, w)`, compiled behind the guard. bots[i] plays w.players()[i] of the room. */
export type WalkCode = (bots: readonly Bot[], w: WalkWorld) => Run

export type ButtonName = 'a' | 'b'

/** Where a bot goes or a tap lands: a point, a handle the room named, or a player (a bot too). */
export type Target = Point | Seen | PlayerView

/** How long goTo may plan at a time, in seconds of moving, how near it comes to a point, and where push and carry leave a thing. */
export const GOTO = { secs: 30, near: 0.4, leave: 0.5, stuckSecs: 2 } as const
/** What the quick verbs take, in seconds of the game's clock. */
export const BOT_TIMES = { press: 0.1, tap: 0.1 } as const
/** How long w.until waits before it gives up, unless told. */
export const UNTIL_SECS = 30

export interface Bot extends PlayerView {
  goTo(target: Target): Run
  press(button: ButtonName): Run
  hold(button: ButtonName, secs: number): Run
  carry(thing: ThingView, to: Target): Run<boolean>
  push(thing: ThingView, to: Target): Run<boolean>
  steer(dir: readonly [number, number], secs: number): Run
}

export const BOT_REF = {
  goTo: `bot.goTo(target)   walks and jumps there by itself (or flies, as its stick does) and stops: target is a point (its feet within ${GOTO.near} m of it), a zone (its feet inside it), a solid or a mover (standing on it; one with use, within reach: ${FEEL.reach} m from its edge), or a thing, decor, a lamp, a sign or a player (within reach: ${FEEL.reach} m from its edge)`,
  press: `bot.press(button)   presses button 'a' or 'b' once (${BOT_TIMES.press} s)`,
  hold: "bot.hold(button, secs)   holds button 'a' or 'b' down for secs seconds",
  carry: `bot.carry(thing, to)   goes to the thing, picks it up with grab, carries it and puts it down so that it lands at to (a point: its foot within ${GOTO.leave} m of it; a zone: inside it, and from high up, with its middle over the zone; another handle: on it or beside it). Zones notice the thing in the bot's hands on the way, and when the room's code hides it or takes it from the bot's hands, the carry ends there. It sets the thing down only where nothing with use is within the bot's reach, since there grab would use that instead. It gives back true when the thing is there or the room hid it, false when the thing was hidden or taken by another player first (const got = yield* bot.carry(t, to)). The bot needs a button whose job is grab, and the thing must weigh ${FEEL.carryMax} or less and have no use: a thing with use is used, never carried`,
  push: `bot.push(thing, to)   goes round to the thing's far side and walks it toward to until it is there (a point: its middle within ${GOTO.leave} m of it across, from high up across the floor, x and z, walking it straight toward to; a zone: inside it), and gives back true then, or false when the thing was hidden or taken first. A thing heavier than one child moves only while enough bots push it at once, in w.together: their weights add up. When every bot pushing it has pushed for ${GOTO.stuckSecs} s and it has not moved, it stops and says what holds the thing: its weight against the pushers' when they weigh less, else what stands in its way`,
  steer: 'bot.steer([x, y], secs)   holds the stick that way for secs seconds, then lets go: x to the right, y up, each -1 to 1; from high up its up walks toward -z, away from the viewer. For what goTo cannot plan',
} as const satisfies Record<Own<Bot, PlayerView>, string>

export interface WalkWorld {
  time(): number
  level(): Level
  get(name: string): Seen
  stepsDone(): number
  wait(secs: number): Run
  until(cond: () => boolean, secs?: number): Run
  together(...runs: Run<unknown>[]): Run
  tap(target: Target): Run
  point(target: Target, secs: number): Run
}

export const WALK_WORLD_REF = {
  time: 'w.time()   seconds since play started',
  level: 'w.level()   1, 2 or 3, the level the room was built at',
  get: "w.get(name)   the room's handle with that name, with its reads; a name the room never gave stops the walkthrough and lists the names it did give",
  stepsDone: "w.stepsDone()   how many of the room's steps are done",
  wait: 'w.wait(secs)   waits secs seconds',
  until: `w.until(() => condition, secs)   waits until the condition says true; past secs (${UNTIL_SECS} if left out) the walkthrough stops and says the condition never came true`,
  together: 'w.together(run, run, ...)   runs bot calls and waits side by side, and is done when all of them are',
  tap: `w.tap(target)   a tap on a point or a handle, as a child would tap it, from no one in particular (${BOT_TIMES.tap} s)`,
  point: 'w.point(target, secs)   a finger held down on a point, or on a handle as it moves, for secs seconds, from no one in particular: the room reads it in w.pointers()',
} as const satisfies Record<keyof WalkWorld, string>

export const WALK_PREAMBLE = `WALKTHROUGH: the body of  function* (bots, w) { ... }
It plays the room to its end as the children would, with one bot for each player: bots[0] plays w.players()[0] of the room, bots[1] the next, and so on. The trial plays it to prove that the room can be finished and to time it. When the room ends, the trial stops the walkthrough wherever it is.
It is a generator. Every bot call and w.wait, w.until, w.together, w.tap and w.point take time: call each with yield*, as in yield* bots[0].goTo(w.get('name')). A bare yield waits one frame (1/60 s), and a loop must yield in every turn. One bot's calls run one after another; to run several at once, yield* w.together(...). A bot's stick and its buttons are separate, so w.together(bot.steer([1, 0], 2), bot.hold('a', 2)) does both, but two calls that both use one bot's stick (goTo and steer, say) never run together.
The walkthrough moves only the bots, by their sticks and buttons, and taps and points as a child would. It finds the room's things by the names the room code gave them, w.get(name); every handle here has only its reads, so the walkthrough cannot change the room. A bot also has every read of a player: bot.at(), bot.holding() and the rest. Every read here that gives back a player gives back that player's bot, so zone.has(bots[0]) and thing.heldBy() === bots[1] work. Space and time are the room's: metres, x to the right, y up, z toward the viewer; seconds. Seen from high up, goTo walks and jumps any way across the floor, and the sentences give each place as x, y, z. Math.random() here has throws of its own and never changes the room's.
How long things take: goTo, carry and push as long as the bot needs to walk and jump there, at ${FEEL.walk} m/s as the players do; press and tap ${BOT_TIMES.press} s; wait, until and point as long as they wait. Play it as quickly as children who know the way could, each bot doing its part as soon as it can: wait only for what the room makes the players wait for, never to make up time.
How goTo plans: it searches the bot's own moves (walk, jump, stand and wait) over the room as it stands: solids where they are, movers where their places and clocks will take them, slides and turns under way where they will end, zones' pulls, loose things and other players where they are now, heads to stand on (from high up, a loose thing's top or a head only where there is no way without one). It rides movers and waits for them. It never sees what the room's code will do next: a slide, a turn, a mover's new speed, a hide or a show that the code starts is seen only from the frame it starts, and goTo plans again then. So where the way opens only when the room's code acts (a door shown or hidden, a mover set going), first wait for it with yield* w.until(...). Where the code moves a body itself (putAt, push, a player put somewhere, anything moved every frame), wait with w.until or move the bot with steer. It plans up to ${GOTO.secs} s of moving at a time: for a longer way, goTo the places between in turn. When it finds no way, the walkthrough stops and says where the bot was, where it was going and what was in the way, in metres. A bot whose stick is 'none' is moved only by the room: steer it and wait.
The trial judges by the steps: a clean pass does every step, each turning done in order (a step whose done() is already true when its turn comes fails), and finishes the room in ${PASS.minSecs} to ${PASS.maxSecs} s of play. When the walkthrough's code ends, the bots stand still, and the room must finish within ${TRIAL.doneSecs} s. In a room with r.clock, every step must be done before the clock runs out, and a w.finish must not come before ${PASS.minSecs} s. In a room played together or side by side, the trial also plays the walkthrough with each bot in turn standing still, and the room must then stay unfinished, its steps not all done: every player has a part. Side by side, each bot does its own part. In a contest, play it so that one of them wins. The trial plays each level, and the level of the players who asked again on a second seed.`

/** The walkthrough's whole reference, in order: WALK_PREAMBLE, then these sections. */
export const WALK_REFERENCE: readonly RefSection[] = [
  { title: 'A bot (bots[0] and the rest):', lines: BOT_REF },
  { title: 'w, the world as the walkthrough sees it:', lines: WALK_WORLD_REF },
  ...READS_REFERENCE,
]

/**
 * What the trial says back about a walkthrough, with the walkthrough's line and the bot's seat.
 * Together with the survey of the room as built, these are what a fix is written from.
 */
/** What the bots pushed along by walking into it, said after a room left unfinished: a delivered thing pushed off its spot is a common cause. */
const onTheWay = (bumped: readonly string[]) => (bumped.length === 0 ? '' : `; on the way, ${bumped.join('; ')}`)

export const WALK_MISTAKES = {
  noName: (name: string, names: readonly string[]) => `w.get('${name}'): the room gave no handle that name; it named ${names.length === 0 ? 'nothing' : names.join(', ')}`,
  /** `from` is where the bot stood as the view says a place: x, y from the side, x, y, z from high up. */
  noWay: (seat: number, from: string, to: string, gap: string, reach: string) => `bot ${seat} found no way from ${from} to ${to}: ${gap}, and ${reach}`,
  tooFar: (seat: number, to: string) => `bot ${seat} could not plan its way to ${to} within ${GOTO.secs} s of moving: goTo the places between in turn`,
  pushStuck: (what: string, weight: number, pushers: number, theirs: number) =>
    `pushed ${what} for ${GOTO.stuckSecs} s and it did not move: it weighs ${weight}, and ${pushers === 1 ? `1 bot pushed, weighing ${theirs}` : `${pushers} bots pushed, weighing ${theirs} together`}`,
  pushBlocked: (what: string, why: string) => `pushed ${what} for ${GOTO.stuckSecs} s and it did not move: ${why}`,
  tooHeavy: (what: string, weight: number) => `bot.carry(${what}): it weighs ${weight}, and grab carries only up to ${FEEL.carryMax}; push it instead`,
  hasUse: (what: string) => `bot.carry(${what}): it has use, so grab uses it and never carries it; go to it and press grab to use it`,
  notPicked: (seat: number, what: string, tries: number) => `bot ${seat} pressed grab beside ${what} ${tries} times and never picked it up: the room's code moved it, hid it or took it each time`,
  handsFull: (seat: number, held: string, what: string) =>
    `bot ${seat} holds ${held} and must set it down before it carries ${what}, but here grab uses something with use within reach: carry ${held} somewhere first`,
  noGrab: (seat: number) => `bot ${seat} has no button whose job is grab, so it cannot carry`,
  untilNever: (secs: number) => `w.until waited ${secs} s and its condition never came true`,
  roomCall: (key: string, calls: readonly string[]) =>
    `w.${key} is the room's, not the walkthrough's: here the players are bots[0], bots[1] and so on, the room's things come by w.get(name), and nothing here changes the room. The walkthrough's w has: ${calls.join(', ')}`,
  readOnly: (what: string, key: string) => `the walkthrough cannot ${key} a ${what}: it only reads the room and moves the bots`,
  notYielded: (call: string) => `${call} takes time: call it with yield*, as in yield* ${call}`,
  unfinished: (bumped: readonly string[]) => `the walkthrough ended and the room was not finished${onTheWay(bumped)}`,
  stepEarly: (step: number) => `step ${step} was done the first frame it was asked, so its done() was true before its turn and its dot would fill with nobody doing it: each step's done() must turn true only by what that step asks`,
  clockOut: (step: number, of: number) => `the room's clock ran out while step ${step} of ${of} was not done: every step must be done before the clock runs out`,
  /** `times` is PASS.aimSecs over the seconds it took: how much more the room must ask, said as a number so a fix need not work it out. */
  tooShort: (secs: number, steps: string, times: number) =>
    `the walkthrough finished the room in ${secs} s, its steps done at ${steps}; a clean pass must take at least ${PASS.minSecs} s: give the room about ${times} times as much for the players to do, never longer to stand, hold or wait, for about ${PASS.aimSecs} s of play`,
  tooLong: (secs: number, steps: string) => `the walkthrough took ${secs} s, its steps done at ${steps}; a clean pass must take at most ${PASS.maxSecs} s: give the room less to do, for about ${PASS.aimSecs} s of play`,
  levelsAlike: (secs: number) =>
    `w.level() changes nothing: at levels 1, 2 and 3 the room is built the same and the walkthrough does its steps at the same seconds, ${secs} s in all; scale by w.level() how much there is to do (counts, speeds, gaps), 1 the gentlest, never longer to stand, hold or wait, so a party that struggles gets an easier room and a quick one a harder`,
  stillFinished: (seat: number) => `with bot ${seat} standing still the others still finished the room: in a room played together every player must have a part`,
  notRun: (got: string) => `w.together takes bot calls and waits, each without yield*, as yield* w.together(bots[0].goTo(a), w.wait(2)); it was given ${got}`,
  notDir: () => 'bot.steer(dir, secs): dir is two numbers [x, y], each -1 to 1',
  thrown: (said: string) => `the walkthrough threw: ${said}`,
  notFinished: (secs: number, repeated: readonly string[], bumped: readonly string[]) =>
    `the walkthrough was still playing after ${secs} s${repeated.map((r) => `; ${r}`).join('')}; a clean pass finishes the room in at most ${PASS.maxSecs} s${onTheWay(bumped)}`,
  /** `calls` as 'bots[1].carry(...) 40 times', the most made first. */
  repeated: (calls: readonly string[], done: number, since: number) =>
    `${done === 0 ? 'from the start' : `after step ${done} turned done at ${since} s`} it called ${calls.length === 1 ? calls[0] : `${calls.slice(0, -1).join(', ')} and ${calls[calls.length - 1]}`}, and step ${done + 1} never turned done`,
  bumped: (seat: number, what: string, from: string, to: string) => `bot ${seat} walked into ${what} and pushed it along from ${from} to ${to}, without a push of its own`,
} as const

/** When the page ends a room's trial worker, ms (trial/tryRoom.ts): half again the trial's own budget of real time. The server hands a taken trial to another page soon after it (server/line.ts TIMING). */
export const TRIAL_KILL_MS = TRIAL.realSecs * 1500
/** When the page ends a presents' worker, ms: each present has its counted turns and is built once, so a check takes well under a second. */
export const GIFTS_KILL_MS = 20_000
/** When the page ends a look check's worker, ms (trial/tryRoom.ts tryLook): the check counts its turns and builds three rooms and three looks, so it takes well under a second. The server hands a taken check to another page soon after it (server/line.ts TIMING). */
export const LOOK_KILL_MS = 20_000

/**
 * What the trial says about itself (trial/trial.ts): code that never ran, and a trial stopped by its
 * budget of real time. Each comes with where it happened, as the walkthrough's sentences do.
 */
export const TRIAL_MISTAKES = {
  notCompiled: (what: string, said: string) => `${what} could not be compiled: ${said}`,
  realLong: (secs: number, doing: string) =>
    `the trial took more than ${secs} s of the computer's own time and was stopped while ${doing}: the room's code may do too much each frame, or its ways may be too long or too hard for goTo to find`,
  failed: (said: string) => `the trial itself failed, not the room: ${said}`,
  /** The page's backstop (trial/tryRoom.ts): the worker gave no answer and was ended. */
  killed: (secs: number) =>
    `the trial gave no answer in ${secs} s of the computer's own time and its worker was ended: the code tried may hang where nothing counts its turns, or do far too much at a time`,
} as const
