/**
 * Magic House: the look's twins (step 7a). A fixture room written as a designer writes it, the plain
 * room of the trial's tests with shelves, coloured flags and lamps; a base look that dresses it and
 * passes its check; and the look's broken twins, each a small edit of the base look's text that a
 * designer could well make, and each a fault the look's check (trial/lookCheck.ts) must name with its
 * exact sentence or note, while the room's own trial never changes (looks.test.ts).
 */

import type { LookJob, TrialJob } from '../../protocol'
import { HOUSE_SHELL } from '../../engine/world'
import { guardCode, type CodeKind } from '../../server/codeKinds'

/**
 * The fixture room, line by line: two plain shelves the look may dress and a blue one it may not, high
 * over the house's floor, where one player runs between two yellow flags K times (K = 21 + level) and
 * the room finishes as the step turns done; two lamps. Each line's number is the designer's line a
 * sentence names.
 */
export const LOOKS_ROOM: readonly string[] = [
  /* 1 */ 'const K = 21 + w.level()',
  /* 2 */ "r.box([-5, 3, 0], [3, 0.3, 1.5], { name: 'left shelf' })",
  /* 3 */ "r.box([5, 3, 0], [3, 0.3, 1.5], { name: 'right shelf' })",
  /* 4 */ "r.box([0, 5, 0], [2, 0.3, 3], { color: '#3060c0', name: 'blue shelf' })",
  /* 5 */ 'w.players().forEach((p, i) => p.putAt([-6 + i, 0, 0]))',
  /* 6 */ 'r.wayOut([0, 0, 0])',
  /* 7 */ 'r.lamp([-4, 6, 0])',
  /* 8 */ 'r.lamp([4, 6, 0])',
  /* 9 */ 'let visits = 0',
  /* 10 */ 'let side = 1',
  /* 11 */ "r.zone([7, 1, 0], [2, 2, 1], { name: 'right', color: '#ffd23a', enter: (who) => { if (side === 1) { visits += 1; side = -1 } } })",
  /* 12 */ "r.zone([-7, 1, 0], [2, 2, 1], { name: 'left', color: '#ffd23a', enter: (who) => { if (side === -1) { visits += 1; side = 1 } } })",
  /* 13 */ "r.steps([{ hint: { en: 'run to the flags', fi: 'juokse lipuille' }, at: [7, 0, 0], done: () => visits >= K }])",
  /* 14 */ 'return () => {',
  /* 15 */ '  if (w.stepsDone() === 1) w.finish()',
  /* 16 */ '}',
]

/** The fixture room's walkthrough: bot 0 runs to the flags in turn, K times. */
export const LOOKS_WALK: readonly string[] = [
  /* 1 */ 'const K = 21 + w.level()',
  /* 2 */ "for (let i = 0; i < K; i++) yield* bots[0].goTo(w.get(i % 2 === 0 ? 'right' : 'left'))",
]

/**
 * The base look, line by line: eight toys that hop, behind the play low and high in all four
 * quarters; two potted plants by the back wall; the plain shelves dressed as wooden boards built to
 * their size; a wallpaper of dots; twinkling lights along the ceiling; one lamp.
 */
export const BASE_LOOK: readonly string[] = [
  /* 1 */ 'const spots = [[-6, 0, -2], [-2, 0, -2], [2, 0, -2], [6, 0, -2], [-6, 6, -2.5], [-2, 6.5, -2.5], [2, 6.5, -2.5], [6, 6, -2.5]]',
  /* 2 */ "const toy = (m) => m.sphere(0.3, { at: [0, 0.3, 0], color: '#ff8a3a' })",
  /* 3 */ "for (const at of spots) r.prop(at, toy, { react: 'hop', idle: 'bob', sound: 'pop', puff: 'star' })",
  /* 4 */ "const plant = (m) => { m.cylinder(0.3, 0.25, 0.5, { at: [0, 0.25, 0], color: '#b0603a' }); m.sphere(0.35, { at: [0, 0.85, 0], color: '#3a9a4a' }) }",
  /* 5 */ 'r.decor([-7, 0, -2.5], plant)',
  /* 6 */ 'r.decor([7, 0, -2.5], plant)',
  /* 7 */ "for (const s of room.solids()) if (s.dressable()) r.dress(s, (m) => m.box(s.size()[0], s.size()[1], s.size()[2], { at: [0, s.size()[1] / 2, 0], color: '#a0703a' }))",
  /* 8 */ "r.wallpaper((m) => m.sphere(0.25, { color: '#ffffff' }))",
  /* 9 */ 'const stars = []',
  /* 10 */ 'for (let x = -7.5; x <= 7.5; x += 0.5) stars.push([x, 7.6, -2.8])',
  /* 11 */ "r.lights(stars, { color: ['#fff6c0', '#c0e0ff'], twinkle: true })",
  /* 12 */ "r.lamp([0, 7, -2], { color: '#ffe0a0' })",
]

/**
 * The heaviest look the limits allow on the fixture room, all of it kept: 48 props of 10 shapes, 100
 * pieces of decor of 20, a wallpaper of 12 shapes, 400 small lights and 10 lamps beside the room
 * code's two: 2,929 pieces in models and the wallpaper, 11 more for the lights' and the lamps' calls.
 * The check of it must still take well under a second.
 */
export const HEAVIEST_LOOK: readonly string[] = [
  'const toy = (m) => { for (let i = 0; i < 10; i++) m.box(0.06, 0.06, 0.06, { at: [0, 0.03 + i * 0.06, 0], color: "#ff8a3a" }) }',
  'const xs = [-7.2, -6, -4.8, -3.6, -2.4, -1.6, 1.6, 2.4, 3.6, 4.8, 6, 7.2]',
  "for (const y of [0, 1.8, 4, 6]) for (const x of xs) r.prop([x, y, -2], toy, { react: 'blink', idle: 'sway' })",
  'const chair = (m) => { for (let i = 0; i < 20; i++) m.box(0.3, 0.05, 0.3, { at: [0, 0.025 + i * 0.05, 0], color: "#a0703a" }) }',
  'for (let row = 0; row < 5; row++) for (let j = 0; j < 20; j++) r.decor([-7.6 + j * 0.8, 3 + row, -2.8], chair)',
  'r.wallpaper((m) => { for (let i = 0; i < 12; i++) m.sphere(0.02, { at: [i * 0.04, 0, 0] }) })',
  'const stars = []',
  'for (let i = 0; i < 400; i++) stars.push([-7.9 + (i % 40) * 0.4, 0.5 + Math.floor(i / 40) * 0.75, -2.95])',
  "r.lights(stars, { color: ['#fff6c0', '#c0e0ff'], twinkle: true })",
  'for (let i = 0; i < 10; i++) r.lamp([-6 + i * 1.3, 7.5, -2])',
]

/** One edit of the base look: the one place `find` stands, put `put`. */
export interface LookEdit {
  readonly find: string
  readonly put: string
}

/** A look twin: what is wrong with it, in a few words, and the edits that make it. */
export interface LookTwin {
  readonly name: string
  readonly edits: readonly LookEdit[]
}

export const LOOK_TWINS = {
  thrown: { name: 'a throw: a toy looked up in a list too short', edits: [{ find: "const toy = (m) => m.sphere(0.3, { at: [0, 0.3, 0], color: '#ff8a3a' })", put: "const toy = (m) => m.sphere(0.3, { at: [0, 0.3, 0], color: ['#ff8a3a'][1].toUpperCase() })" }] },
  heavy: { name: 'a look too heavy: plants all along the back wall', edits: [{ find: 'r.decor([-7, 0, -2.5], plant)', put: 'for (let i = 0; i < 2000; i++) r.decor([-7, 0, -2.5], plant)' }] },
  box: { name: 'r.box called in the look: a step to reach the high toys', edits: [{ find: "r.lamp([0, 7, -2], { color: '#ffe0a0' })", put: 'r.box([0, 1, 0], [1, 1, 1])' }] },
  notDressable: { name: 'a dressed solid that is not dressable: every shelf dressed, the blue one too', edits: [{ find: 'for (const s of room.solids()) if (s.dressable()) r.dress(', put: 'for (const s of room.solids()) r.dress(' }] },
  bareHalf: { name: 'three reacting props with a bare half: toys only on the left', edits: [{ find: 'const spots = [[-6, 0, -2], [-2, 0, -2], [2, 0, -2], [6, 0, -2], [-6, 6, -2.5], [-2, 6.5, -2.5], [2, 6.5, -2.5], [6, 6, -2.5]]', put: 'const spots = [[-6, 0, -2], [-2, 0, -2], [-6, 6, -2.5]]' }] },
  lamps: { name: 'thirteen lamps together: eleven in the look beside the room code’s two', edits: [{ find: "r.lamp([0, 7, -2], { color: '#ffe0a0' })", put: "for (let i = 0; i < 11; i++) r.lamp([-5 + i, 7, -2], { color: '#ffe0a0' })" }] },
  wardrobe: { name: 'a wardrobe in front of the play, left out with its note', edits: [{ find: 'r.decor([7, 0, -2.5], plant)', put: "r.decor([7, 0, -2.5], plant)\nr.decor([0, 0, 1.2], (m) => m.box(1.2, 2, 0.4, { at: [0, 1, 0], color: '#7a4a2a' }))" }] },
  leftOut: { name: 'more than a third left out: plants inside the blue shelf', edits: [{ find: 'r.decor([7, 0, -2.5], plant)', put: 'r.decor([7, 0, -2.5], plant)\nfor (let i = 0; i < 20; i++) r.decor([-0.5 + i * 0.05, 4.9, -1.5], plant)' }] },
} as const satisfies Record<string, LookTwin>

export type LookTwinName = keyof typeof LOOK_TWINS

/** A body guarded as the server guards it; a guard error is the fixture's fault and throws. */
export function guarded(kind: CodeKind, body: string): string {
  const g = guardCode(kind, body)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

/** The base look's text with a twin's edits made, each edit's `find` standing exactly once in it. */
export function lookText(twin: LookTwinName | null): string {
  let text = BASE_LOOK.join('\n')
  for (const e of twin === null ? [] : LOOK_TWINS[twin].edits) {
    const at = text.indexOf(e.find)
    if (at < 0 || text.indexOf(e.find, at + 1) >= 0) throw new Error(`the look twin ${twin}'s edit ${e.find} does not stand exactly once in the base look`)
    text = text.slice(0, at) + e.put + text.slice(at + e.find.length)
  }
  return text
}

/** The fixture room's job for the trial: a party of one, together, from the side, asked at level 2. */
export function looksTrialJob(): TrialJob {
  return { line: 'line-looks', attempt: 1, party: 1, seed: 50, roll: { kind: 'together', view: 'side' }, level: 2, shell: HOUSE_SHELL, room: guarded('room', LOOKS_ROOM.join('\n')), walk: guarded('walk', LOOKS_WALK.join('\n')) }
}

/** The base look, or a twin of it, on the fixture room, as a LookJob. */
export function looksJob(twin: LookTwinName | null): LookJob {
  const t = looksTrialJob()
  return { line: t.line, attempt: 1, check: 1, party: t.party, seed: t.seed, roll: t.roll, level: t.level, shell: t.shell, room: t.room, look: guarded('look', lookText(twin)) }
}
