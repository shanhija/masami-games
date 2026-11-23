/**
 * What the fake CLI (silly-billy/src/server/test/fake-claude.mjs) answers in Magic House's tests and
 * on a dev server pointed at it: the twins' base room (trial/twins/base.ts, Pirate Sails written as
 * made code, which passes the whole trial) as a room's answer, a fix that gives back only the
 * walkthrough, a look and its fix, and four presents that pass the page's check. The fake answers by
 * the first of the answers' properties, in this order, that the schema has: a room's schema has
 * `theme`, a fix's has `room` but no `theme`, the presents' has `gifts`, a look's has `wish` (which a
 * room's has too, so it comes after `theme`), and a look's fix has only `look`.
 */

import fs from 'node:fs'

import type { RoomAnswer, RoomFix } from '../../engine/api'
import type { GiftAnswer, GiftsAnswer } from '../../engine/gift'
import type { LookAnswer, LookFix } from '../../engine/look'
import { facts as pirateSails } from '../../own/rooms/pirate-sails'
import { BASE_JOB, BASE_ROOM, BASE_WALK } from '../../trial/twins/base'

/** The base room (trial/twins/base.ts) as the game's answer: Pirate Sails' own words and code. */
export const BASE_ANSWER: RoomAnswer = {
  theme: pirateSails.theme,
  task: pirateSails.task,
  name: pirateSails.name,
  shell: BASE_JOB.shell,
  room: BASE_ROOM,
  walk: BASE_WALK,
  wish: '',
}

/** A fix that mends only the walkthrough (here by a comment at its top, so it differs): the room stays as it was. */
export const WALK_FIX: RoomFix = { name: BASE_ANSWER.name, shell: BASE_ANSWER.shell, room: '', walk: `// mended\n${BASE_WALK}` }

export const GOOD_GIFTS: readonly GiftAnswer[] = [
  {
    name: { en: 'sea crown', fi: 'merikruunu' },
    slot: 'head',
    form: 'A low round crown with a red stone at its front.',
    code: `m.cylinder(0.2, 0.21, 0.12, { at: [0, 0.3, 0], color: c.main })
m.sphere(0.035, { at: [0, 0.31, 0.2], color: '#ff3355' })`,
  },
  {
    name: { en: 'rope belt', fi: 'köysivyö' },
    slot: 'body',
    form: 'A thick ring of rope round the hips with a square buckle in front.',
    code: `m.torus(0.17, 0.03, { at: [0, 0.42, 0], rot: [Math.PI / 2, 0, 0], color: c.main })
m.box(0.08, 0.08, 0.03, { at: [0, 0.42, 0.18], color: c.second })`,
  },
  {
    name: { en: 'ship flag', fi: 'laivan lippu' },
    slot: 'hand',
    form: 'A thin upright pole with a flat flag at its top.',
    code: `m.cylinder(0.02, 0.02, 0.6, { at: [0, 0.3, 0], color: c.second })
m.box(0.3, 0.2, 0.02, { at: [0.16, 0.5, 0], color: c.main })
m.anchor('hand', [0, 0.1, 0])`,
  },
  {
    name: { en: 'sail pack', fi: 'purjereppu' },
    slot: 'back',
    form: 'A small square pack on the back with a flap.',
    code: `m.box(0.28, 0.32, 0.12, { at: [0, -0.12, -0.08], color: c.main })
m.box(0.28, 0.1, 0.03, { at: [0, -0.02, -0.15], color: c.second })`,
  },
]

export const GIFTS: GiftsAnswer = { gifts: [...GOOD_GIFTS] }

/** A look for any room: lights along the ceiling and a prop in each quarter of the room as seen from the side, and its plain solids dressed as crates. The line only guards it; the page checks it. */
export const LOOK_ANSWER: LookAnswer = {
  look: `const lights = []
for (let x = -7.5; x <= 7.5; x += 0.5) lights.push([x, 7.6, -2.8])
r.lights(lights, { twinkle: true })
const quarters = [[-6, 0.5], [6, 0.5], [-6, 5], [6, 5]]
for (const [x, y] of quarters) for (const dx of [-0.6, 0.6]) {
  r.prop([x + dx, y, -2.5], (m) => { m.sphere(0.3, { color: '#ffd166' }) }, { react: 'hop', idle: 'bob', sound: 'pop' })
}
for (const s of room.solids()) if (s.dressable()) r.dress(s, (m) => { const [w, h, d] = s.size(); m.box(w, h, d, { at: [0, h / 2, 0], color: '#a0522d' }) })`,
  wish: '',
}

/** A look's fix: the whole look again, here with a comment at its top, so it differs. */
export const LOOK_FIX: LookFix = { look: `// mended\n${LOOK_ANSWER.look}` }

/** What the fake answers by default: the base room, the walkthrough fix, the presents, the look and its fix. */
export const BASE_ANSWERS: Readonly<Record<string, unknown>> = { theme: BASE_ANSWER, room: WALK_FIX, gifts: GIFTS, wish: LOOK_ANSWER, look: LOOK_FIX }

/** Writes the fake CLI's answers file (FAKE_CLAUDE_ANSWERS), read again on every turn. */
export function writeAnswers(file: string, byProperty: Readonly<Record<string, unknown>>): void {
  fs.writeFileSync(file, JSON.stringify({ byProperty }))
}
