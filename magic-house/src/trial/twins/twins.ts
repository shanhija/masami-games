/**
 * Magic House: the broken twins of the base room (base.ts), each a small edit of its text that a
 * designer could well make, and each a fault the trial must name with where it is (plan.md, The
 * twins). twins.test.ts trials each one and holds it to its sentence.
 */

import type { TrialJob } from '../../protocol'
import { guardCode, type CodeKind } from '../../server/codeKinds'
import { BASE_JOB, BASE_ROOM, BASE_WALK } from './base'
import { HIGH_ROOM, HIGH_WALK } from './highBase'

/** One edit: in the room's text or the walkthrough's, the one place `find` stands, put `put`. */
export interface Edit {
  readonly in: 'room' | 'walk'
  readonly find: string
  readonly put: string
}

/** A twin: what is wrong with it, in a few words, and the edits that make it. */
export interface Twin {
  readonly name: string
  readonly edits: readonly Edit[]
}

const room = (find: string, put: string): Edit => ({ in: 'room', find, put })
const walk = (find: string, put: string): Edit => ({ in: 'walk', find, put })

/** The base's bow, after which a twin adds a solid of its own. */
export const BOW = "r.box([6.9, 0.5, 0], [2.2, 1, 2], { name: 'bow' })"
/** A lookout high over the bow, its top at y 5: a jump above the fore crow's nest and 3.2 m out from it. */
export const LOOKOUT = "r.box([7.45, 4.9, 0], [1.1, 0.2, 1], { through: true, color: wood, name: 'lookout' })"
/** A gate from the deck to the ceiling between the stern and the main mast. */
const GATE = "r.box([-5.2, 4, 0], [0.4, 8, 2], { color: '#555555', name: 'gate' })"

export const TWINS = {
  gap: { name: 'a ledge too far: the bow’s lookout 3.2 m out from the fore crow’s nest, too high to reach from below', edits: [room('bow: [7.2, 1],', 'bow: [7.45, 5],'), room(BOW, `${BOW}\n${LOOKOUT}`)] },
  ledge: { name: 'a ledge too high: the main crow’s nest lifted 2.1 m over the yard below it', edits: [room('mainNest: [-2.3, 4.2],', 'mainNest: [-2.3, 4.9],'), room('r.box([x, 4.075, 0]', 'r.box([x, x < 0 ? 4.775 : 4.075, 0]')] },
  lock: { name: 'a lock with no key: a gate in front of the stern that nothing ever opens', edits: [room(BOW, `${BOW}\nconst gate = ${GATE}`)] },
  waitLock: { name: 'a lock with no key that the walkthrough waits for', edits: [room(BOW, `${BOW}\nconst gate = ${GATE}`), walk('const opened = ', "yield* w.until(() => w.get('gate').hidden())\nconst opened = ")] },
  trap: { name: 'a trap: the fourth player starts by the bow rope on a lookout that nobody who drops off can climb back up to', edits: [room('bow: [7.2, 1],', 'bow: [7.45, 5],'), room(BOW, `${BOW}\n${LOOKOUT}`), room('players.forEach((p, i) => p.putAt([starts[i], 0, 0]))', 'players.forEach((p, i) => p.putAt(i === 3 ? [7.45, 5, 0] : [starts[i], 0, 0]))')] },
  neverDone: { name: 'a step that never turns done: the last step asks for one sail more than there are', edits: [room('done: () => sail === sails.length }', 'done: () => sail > sails.length }')] },
  early: { name: 'a step done before its turn: the second step asks only that someone pulled', edits: [room('done: () => sail >= 1 }', 'done: () => everPulled }')] },
  buildLoop: { name: 'an endless loop in the build: the coins’ loop never steps on', edits: [room('for (let k = 0; k < 7; k++)', 'for (let k = 0; k < 7; k + 1)')] },
  frameLoop: { name: 'an endless loop in a frame, once a rope is pulled', edits: [room('if (count > 0) everPulled = true', 'while (count > 0) everPulled = true')] },
  thrown: { name: 'a thrown error: a rope looked up by its zone’s name', edits: [room("ropes.get(name).glow(held ? '#7dff9a' : gold, !held)", "ropes.get('rope-' + name).glow(held ? '#7dff9a' : gold, !held)")] },
  heavy: { name: 'a build too heavy: gold coins all along the deck', edits: [room('const coins = r.decor(', 'for (let x = -7; x <= 7; x += 0.02) r.decor([x, 0, -0.6], coinsModel)\nconst coins = r.decor(')] },
  short: { name: 'too short: two, three or four sails', edits: [room('].slice(0, level + 7)', '].slice(0, level + 1)'), walk('k < w.level() + 7', 'k < w.level() + 1')] },
  long: { name: 'too long: each sail pulled for twelve seconds', edits: [room('const pullSecs = [5, 5.5, 6][level - 1]', 'const pullSecs = [13, 12, 11][level - 1]')] },
  inWall: { name: 'a player starting inside the stern', edits: [room('const starts = [-3.4, -2.2, 1.6, 2.8]', 'const starts = [-6.5, -2.2, 1.6, 2.8]')] },
  inAir: { name: 'a player starting in the air', edits: [room('players.forEach((p, i) => p.putAt([starts[i], 0, 0]))', 'players.forEach((p, i) => p.putAt([starts[i], 2, 0]))')] },
  notNeeded: { name: 'a room that does not need every player: three ropes of four open a sail', edits: [room('if (count === 4) {', 'if (count >= 3) {'), room('const pullSecs = [5, 5.5, 6][level - 1]', 'const pullSecs = [7, 7.5, 8][level - 1]')] },
  randomBreaks: { name: 'random pressing breaks it: a press away from every rope throws', edits: [room("w.sound('squeak')", "zones.get(ropeNames.find((n) => zones.get(n).has(p))).glow('#ffffff')\n      w.sound('squeak')")] },
  randomFinishes: { name: 'random tapping finishes it: a knock on the chest opens every sail', edits: [room("w.sound('knock')", "w.sound('knock')\n    everPulled = true\n    sail = sails.length")] },
  randomPlace: { name: 'a mover’s place that draws Math.random: a gull that flutters', edits: [room('r.decor([bowMast, 1, -0.9], mastModel(4.6))', "r.decor([bowMast, 1, -0.9], mastModel(4.6))\nr.mover(() => r.decor([0, 0, 0], (m) => m.sphere(0.2, { color: '#ffffff' })), (t) => ({ at: [Math.sin(t / 3) * 7, 7.4 + Math.random() * 0.2, 0] }))")] },
  longWords: { name: 'words too long: a hint of nine words', edits: [room("hint: { en: 'Everyone pull at the same time', fi: 'Vetäkää kaikki yhtä aikaa' }", "hint: { en: 'Everyone pull your ropes at the very same time', fi: 'Vetäkää kaikki yhtä aikaa' }")] },
  oneLanguage: { name: 'one language missing: the button’s word in English only', edits: [room("word: { en: 'Pull', fi: 'Vedä' }", "word: { en: 'Pull' }")] },
  notCalled: { name: 'a read used without its call', edits: [room('if (open[sail].hidden()) {', 'if (open[sail].hidden) {')] },
  badName: { name: 'the walkthrough asks for a name the room never gave', edits: [walk("yield* bot.goTo(w.get('rope-' + ropes[i]))", "yield* bot.goTo(w.get('rope_' + ropes[i]))")] },
  notYielded: { name: 'a bot call without yield*', edits: [walk("yield* bot.goTo(w.get('rope-' + ropes[i]))", "bot.goTo(w.get('rope-' + ropes[i]))")] },
  walkLoop: { name: 'an endless loop in the walkthrough: a wait without yield*', edits: [walk("while (opened() === k) yield* bot.hold('b', 0.5)", "while (opened() === k) bot.hold('b', 0.5)")] },
  syntax: { name: 'a syntax error', edits: [room('let sail = 0', 'let sail = = 0')] },
  forbidden: { name: 'a forbidden name', edits: [room('let progress = 0', 'let progress = Date.now() * 0')] },
  luck: { name: 'a pass by luck: a gate the dice put in front of the stern on the second seed only', edits: [room(BOW, `${BOW}\nif (Math.random() > 0.5) ${GATE}`)] },
  noFinish: { name: 'a room that never finishes: the chest bursts open and nothing ends it', edits: [room('w.after(5, () => w.finish())', "w.after(5, () => w.sound('yay'))")] },
  finishEarly: { name: 'a finish before the last step is done', edits: [room('if (ended || w.stepsDone() < 3) return', 'if (ended || w.stepsDone() < 2) return')] },
} as const satisfies Record<string, Twin>

export type TwinName = keyof typeof TWINS

const high = (find: string, put: string): Edit => ({ in: 'room', find, put })

/** The broken twins of the base seen from high up (highBase.ts), each a fault of a place the trial must name in metres on the floor (highTwins.test.ts). */
export const HIGH_TWINS = {
  pit: { name: 'a raised floor out of reach: the rock 1.5 m out from the island, too high to reach from the floor', edits: [high("r.box([5.8, 0.85, 2.5], [2.4, 1.7, 2], { color: '#a59a8a', name: 'rock' })", "r.box([6.25, 0.85, 2.5], [1.5, 1.7, 2], { color: '#a59a8a', name: 'rock' })")] },
  wall: { name: 'a wall with no way round: the hedge across the whole island', edits: [high("r.box([1, 1.85, -1.5], [0.6, 2.1, 5], { color: '#3f8f3a', name: 'hedge' })", "r.box([1, 1.85, 0], [0.6, 2.1, 8], { color: '#3f8f3a', name: 'hedge' })")] },
  // Under the room's top at 3 m a player stands only on a top up to 1.85 m high, and the rock's 2.2 m leaves no room for a head over it.
  top: { name: 'a top too high: the rock 2.2 m high with its egg on top, too near the room’s top for anyone to stand on', edits: [high("r.box([5.8, 0.85, 2.5], [2.4, 1.7, 2], { color: '#a59a8a', name: 'rock' })", "r.box([5.8, 1.1, 2.5], [2.4, 2.2, 2], { color: '#a59a8a', name: 'rock' })"), high('[6, 1.7, 2.5],', '[6, 2.2, 2.5],')] },
  neverDone: { name: 'a step that never turns done: the last step asks for one egg more than there are', edits: [high('done: () => home === eggCount }', 'done: () => home > eggCount }')] },
} as const satisfies Record<string, Twin>

export type HighTwinName = keyof typeof HIGH_TWINS

/** The base's texts with a twin's edits made: each `find` must stand exactly once in its text. */
export function twinTexts(twin: Twin): Record<'room' | 'walk', string> {
  return twinTextsOf(twin, { room: BASE_ROOM, walk: BASE_WALK })
}

/** The same for a twin of the base seen from high up (highBase.ts). */
export function highTwinTexts(twin: Twin): Record<'room' | 'walk', string> {
  return twinTextsOf(twin, { room: HIGH_ROOM, walk: HIGH_WALK })
}

function twinTextsOf(twin: Twin, base: Record<'room' | 'walk', string>): Record<'room' | 'walk', string> {
  const texts = { ...base }
  for (const e of twin.edits) {
    const parts = texts[e.in].split(e.find)
    if (parts.length !== 2) throw new Error(`${twin.name}: '${e.find}' stands ${parts.length - 1} times in the ${e.in}`)
    texts[e.in] = parts.join(e.put)
  }
  return texts
}

/** The designer's line on which `find` stands in a twin's text (the first line of it). */
export function lineIn(text: string, find: string): number {
  const at = text.indexOf(find)
  if (at < 0) throw new Error(`'${find}' is not in the text`)
  return text.slice(0, at).split('\n').length
}

/** A body guarded as the server guards it: the guarded text, or the guard's sentence. */
export function guarded(kind: CodeKind, body: string): { ok: true; text: string } | { ok: false; error: string } {
  const g = guardCode(kind, body)
  return g.ok ? { ok: true, text: g.guarded } : { ok: false, error: g.error }
}

/** The trial job for a twin's texts, both guarded: null with the guard's sentence when either is refused. */
export function twinJob(texts: Record<'room' | 'walk', string>): { job: TrialJob; error: null } | { job: null; error: string } {
  return twinJobOf(texts, BASE_JOB)
}

/** The same with what the job carries besides its code given (highBase.ts HIGH_JOB for a twin seen from high up). */
export function twinJobOf(texts: Record<'room' | 'walk', string>, base: Omit<TrialJob, 'room' | 'walk'>): { job: TrialJob; error: null } | { job: null; error: string } {
  const r = guarded('room', texts.room)
  if (!r.ok) return { job: null, error: `the room's code: ${r.error}` }
  const w = guarded('walk', texts.walk)
  if (!w.ok) return { job: null, error: `the walkthrough: ${w.error}` }
  return { job: { ...base, room: r.text, walk: w.text }, error: null }
}
