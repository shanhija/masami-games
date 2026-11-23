/**
 * Moon Garden's look (moon-garden.ts), written by hand as the look's designer would write it
 * (engine/look.ts LookCode) and run through the same builder and check as a made look
 * (engine/lookBuilder.ts buildLook, trial/lookCheck.ts). The room is a glasshouse at night: its walls
 * are glass full of stars (the shell's starry navy, white glazing bars over it and a crescent-moon
 * wallpaper), fairy lights swing under the roof, and twinkling stars and fireflies are the room's
 * many small lights, for it is dim (light 0.6).
 *
 * - The furniture is the play's plain solids dressed: the potting bench and the cupboard on it as
 *   painted drawers and doors, the shelves as planks on brackets (the one over the pond hung from the
 *   roof by ropes), the crate as a slatted crate and the pond's rims as stones.
 * - Behind the play, ferns, moonflowers climbing the glazing bars, reeds behind the pond and garden
 *   tools on a rack; in front of it, low grass and stones, kept off the pond, the start and the pots.
 * - Sixteen props answer a child in all four quarters: things low down that a player passes (a duck
 *   in the pond, a frog, a snail, a hedgehog, two clumps of mushrooms, a cat on the crate, a telescope
 *   on the hung shelf) and things up under the roof that answer a tap or a player high on the flowers
 *   (an owl, two lanterns, two baskets, a mobile of planets, a star, a wind chime). None looks like a
 *   pot, a seed, the can, a flower of the stair or the moon, the things the task is played with.
 * - Three lamps: two lanterns under the roof and a blue one by the pond; the moon's light is the
 *   play's (the room code's moonLight).
 *
 * It reads where things are from `room`, never from the room code's numbers: the furniture by the
 * solids' names and sizes, the pond as the one zone shown in a colour, the door by room.wayOut(). Its numbers for
 * where things stand keep inside LOOK_PLACE's bands: behind the play from the back wall to z -1, in
 * front of it from z 1, at most half a metre tall. No dice: its scatter comes from fixed sequences.
 */

import type { Point } from '../../engine/api'
import type { Model, RoomKit } from '../../engine/gift'
import type { LookCode } from '../../engine/look'
import { cos, sin } from '../../engine/math'
import { byName, spread } from './lookKit'

const WOOD = '#9a6a44'
const WOOD_DARK = '#6e4a30'
const PAINT = '#5f8f86'
const PAINT_LIGHT = '#7fb0a6'
const BRASS = '#e2b44c'
const STONE = '#9aa3b8'
const STONE_DARK = '#7a8399'
const LEAF = '#3f8a4e'
const LEAF_DARK = '#2f6e3e'
const MOONFLOWER = '#f4f2ff'
const GLASS_BAR = '#e8e4ff'
const WARM = '#ffd98a'

/** A plank w wide, d deep and t thick, its top at `top`, on two brackets under its ends. */
function plank(m: RoomKit, w: number, t: number, d: number, top: number): void {
  m.box(w, t, d, { at: [0, top - t / 2, 0], color: WOOD })
  for (const x of [-w / 2 + 0.2, w / 2 - 0.2]) {
    m.extrude([[0, 0], [0.32, 0], [0, -0.32]], 0.08, { at: [x - 0.04, top - t, -d / 2 + 0.1], color: WOOD_DARK })
  }
}

/** The potting bench: painted drawers with brass knobs under a wooden top, built to its solid. */
function bench(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.1, d, { at: [0, (h - 0.1) / 2, 0], color: PAINT })
    m.box(w + 0.1, 0.1, d + 0.1, { at: [0, h - 0.05, 0], color: WOOD })
    for (const [x, y] of [[-w / 4, h * 0.3], [w / 4, h * 0.3], [-w / 4, h * 0.68], [w / 4, h * 0.68]]) {
      m.box(w / 2 - 0.14, h * 0.3, 0.04, { at: [x, y, d / 2 + 0.01], color: PAINT_LIGHT })
      m.sphere(0.05, { at: [x, y, d / 2 + 0.06], color: BRASS })
    }
  }
}

/** The cupboard on the bench: two doors with knobs and a wooden top, built to its solid. */
function cupboard(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.08, d, { at: [0, (h - 0.08) / 2, 0], color: PAINT })
    m.box(w + 0.08, 0.08, d + 0.08, { at: [0, h - 0.04, 0], color: WOOD })
    for (const x of [-w / 4, w / 4]) {
      m.box(w / 2 - 0.12, h - 0.3, 0.04, { at: [x, h / 2 - 0.04, d / 2 + 0.01], color: PAINT_LIGHT })
      m.sphere(0.05, { at: [x * 0.25, h / 2, d / 2 + 0.06], color: BRASS })
    }
  }
}

/** A slatted wooden crate, built to its solid. */
function crate(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h, d, { at: [0, h / 2, 0], color: WOOD_DARK })
    for (let i = 0; i < 3; i++) m.box(w + 0.02, h / 4, 0.04, { at: [0, h * (0.17 + i * 0.33), d / 2 + 0.01], color: WOOD })
    for (const x of [-w / 2 + 0.06, w / 2 - 0.06]) m.box(0.12, h, 0.06, { at: [x, h / 2, d / 2 + 0.02], color: WOOD })
  }
}

/** A pond's rim of round stones, built to its solid. */
function rim(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.04, d, { at: [0, (h - 0.04) / 2, 0], color: STONE_DARK })
    for (let i = 0; i < 4; i++) m.sphere(w * 0.55, { at: [0, h - w * 0.3, -d / 2 + d * (0.12 + i * 0.25)], scale: [1, 0.55, 1], color: i % 2 === 0 ? STONE : STONE_DARK })
  }
}

/** The wallpaper's motif: a crescent moon, its outer arc round the left and its hollow to the right. */
const CRESCENT: Model = (m) => {
  const outer: [number, number][] = []
  const inner: [number, number][] = []
  for (let i = 0; i <= 8; i++) {
    const a = (50 + (260 * i) / 8) * (Math.PI / 180)
    outer.push([0.3 * cos(a), 0.3 + 0.3 * sin(a)])
    const b = (288 - (216 * i) / 8) * (Math.PI / 180)
    inner.push([0.12 + 0.24 * cos(b), 0.3 + 0.24 * sin(b)])
  }
  m.extrude([...outer, ...inner], 0.02, { color: '#f0e3a0' })
}

/** A glazing bar of the glasshouse's glass wall, from the skirting to the cornice. */
const GLAZING_BAR: Model = (m) => m.box(0.08, 7.4, 0.04, { at: [0, 3.7, 0], color: GLASS_BAR })

/** A rope from a hung shelf up to the roof, `length` long. */
function rope(length: number): Model {
  return (m) => m.cylinder(0.025, 0.025, length, { at: [0, length / 2, 0], color: '#c9b089' })
}

/** A fern growing from the floor: long fronds fanned out from a low mound of leaves. */
const FERN: Model = (m) => {
  m.sphere(0.45, { at: [0, 0.23, 0], scale: [1.2, 0.5, 0.8], color: LEAF_DARK })
  for (let i = 0; i < 7; i++) {
    const a = -1.1 + (2.2 * i) / 6
    m.sphere(0.55, { at: [sin(a) * 0.5, 0.6 + cos(a) * 0.4, 0], rot: [0, 0, -a], scale: [0.22, 1, 0.3], color: i % 2 === 0 ? LEAF : LEAF_DARK })
  }
}

/** Reeds and bulrushes standing behind the pond. */
const REEDS: Model = (m) => {
  for (let i = 0; i < 7; i++) {
    const x = -0.7 + i * 0.23
    const h = 0.8 + 0.35 * ((i * 3) % 4) / 3
    m.cylinder(0.025, 0.035, h, { at: [x, h / 2, 0.05 * (i % 2)], rot: [0, 0, 0.12 * (i - 3) / 3], color: i % 2 === 0 ? '#4f9a4a' : '#3f8040' })
    if (i % 2 === 1) m.capsule(0.06, 0.18, { at: [x + 0.04 * (i - 3) / 3, h - 0.05, 0.05], color: '#7a4a2a' })
  }
  m.sphere(0.35, { at: [0.3, 0.04, 0.1], scale: [1, 0.12, 0.6], color: '#3fa05a' })
}

/** Garden tools hung on a rack on the glass wall: a rake, a spade and a fork. */
const TOOLS: Model = (m) => {
  m.box(1.3, 0.1, 0.06, { at: [0, 1.45, 0], color: WOOD_DARK })
  for (const [x, head] of [[-0.45, 'rake'], [0, 'spade'], [0.45, 'fork']] as const) {
    m.cylinder(0.03, 0.03, 1.2, { at: [x, 0.85, 0.05], color: WOOD })
    if (head === 'spade') m.box(0.24, 0.3, 0.03, { at: [x, 0.15, 0.05], color: '#a9b4c8' })
    else {
      m.box(0.3, 0.04, 0.03, { at: [x, 0.27, 0.05], color: '#a9b4c8' })
      for (let k = 0; k < 4; k++) m.box(0.025, 0.14, 0.025, { at: [x - 0.12 + k * 0.08, 0.19, 0.05], color: '#a9b4c8' })
    }
  }
}

/** A moonflower vine climbing a glazing bar, its white flowers shining a little. */
const VINE: Model = (m) => {
  const path: [number, number, number][] = []
  for (let i = 0; i <= 8; i++) path.push([0.18 * sin(i * 1.3), 0.25 + i * 0.6, 0])
  m.tube(path, 0.04, { color: LEAF_DARK })
  for (let i = 1; i < 8; i += 2) {
    const [x, y] = path[i]
    m.sphere(0.13, { at: [x + 0.14, y, 0.05], scale: [1, 1, 0.4], color: MOONFLOWER, glow: true })
    m.sphere(0.12, { at: [x - 0.12, y + 0.25, 0.04], scale: [1.4, 0.5, 0.4], color: LEAF })
  }
}

/** A tuft of grass with a pebble, low, for the front edge. */
const TUFT: Model = (m) => {
  for (let i = 0; i < 4; i++) {
    const h = 0.3 + 0.08 * (i % 2)
    m.cone(0.07, h, { at: [-0.15 + i * 0.1, h / 2 + 0.03, 0], rot: [0, 0, 0.25 - i * 0.15], color: i % 2 === 0 ? '#5aa65a' : '#4a8f4e' })
  }
  m.sphere(0.1, { at: [0.25, 0.06, 0.05], scale: [1.3, 0.6, 1], color: STONE })
}

// ------------------------------------------------------------------------------ props

const DUCK: Model = (m) => {
  m.sphere(0.2, { at: [0, 0.16, 0], scale: [1.3, 0.8, 1], color: '#ffd43a' })
  m.sphere(0.12, { at: [0.18, 0.36, 0], color: '#ffd43a' })
  m.cone(0.05, 0.12, { at: [0.33, 0.35, 0], rot: [0, 0, -Math.PI / 2], color: '#ff8a2a' })
  m.sphere(0.025, { at: [0.24, 0.4, 0.09], color: '#222233' })
}

const FROG: Model = (m) => {
  m.sphere(0.2, { at: [0, 0.16, 0], scale: [1.2, 0.8, 1], color: '#5cc85a' })
  m.sphere(0.07, { at: [-0.09, 0.32, 0.1], color: '#ffffff' })
  m.sphere(0.07, { at: [0.09, 0.32, 0.1], color: '#ffffff' })
  m.sphere(0.035, { at: [-0.09, 0.33, 0.16], color: '#222233' })
  m.sphere(0.035, { at: [0.09, 0.33, 0.16], color: '#222233' })
  m.torus(0.06, 0.012, { at: [0, 0.16, 0.19], rot: [0, 0, Math.PI], scale: [1, 0.5, 1], color: '#2f6e3e' })
}

const SNAIL: Model = (m) => {
  m.capsule(0.06, 0.3, { at: [0, 0.06, 0], rot: [0, 0, Math.PI / 2], color: '#c8b48a' })
  m.torus(0.1, 0.06, { at: [-0.04, 0.2, 0], color: '#e08a5a' })
  m.cylinder(0.01, 0.01, 0.12, { at: [0.18, 0.16, 0], color: '#c8b48a' })
  m.sphere(0.025, { at: [0.18, 0.23, 0], color: '#222233' })
}

const HEDGEHOG: Model = (m) => {
  m.sphere(0.22, { at: [0, 0.18, 0], scale: [1.2, 0.8, 1], color: '#7a5a3a' })
  m.cone(0.07, 0.14, { at: [0.28, 0.14, 0], rot: [0, 0, -Math.PI / 2], color: '#e0c49a' })
  m.sphere(0.03, { at: [0.36, 0.14, 0], color: '#222233' })
  for (let i = 0; i < 4; i++) m.cone(0.05, 0.14, { at: [-0.15 + i * 0.1, 0.33, 0], rot: [0, 0, 0.4 - i * 0.25], color: '#5a3f26' })
}

const MUSHROOMS: Model = (m) => {
  for (const [x, s] of [[-0.15, 1], [0.12, 0.7], [0.3, 0.5]]) {
    m.cylinder(0.05 * s, 0.06 * s, 0.25 * s, { at: [x, 0.125 * s, 0], color: '#fff4e0' })
    m.sphere(0.16 * s, { at: [x, 0.27 * s, 0], scale: [1, 0.55, 1], color: '#e84a5a' })
    m.sphere(0.03 * s, { at: [x + 0.05 * s, 0.33 * s, 0.1 * s], color: '#ffffff' })
  }
}

const CAT: Model = (m) => {
  m.sphere(0.24, { at: [0, 0.18, 0], scale: [1.3, 0.75, 0.9], color: '#f0a050' })
  m.sphere(0.15, { at: [0.26, 0.3, 0.02], color: '#f0a050' })
  m.cone(0.05, 0.1, { at: [0.2, 0.47, 0.02], color: '#f0a050' })
  m.cone(0.05, 0.1, { at: [0.33, 0.47, 0.02], color: '#f0a050' })
  m.box(0.07, 0.015, 0.02, { at: [0.22, 0.32, 0.15], color: '#4a3020' })
  m.box(0.07, 0.015, 0.02, { at: [0.33, 0.32, 0.14], color: '#4a3020' })
  m.capsule(0.04, 0.3, { at: [-0.3, 0.12, 0.1], rot: [0, 0, 1.3], color: '#e08a3a' })
}

const TELESCOPE: Model = (m) => {
  for (const a of [-0.35, 0, 0.35]) m.cylinder(0.025, 0.025, 1, { at: [sin(a) * 0.22, 0.48, cos(a) * 0.1 - 0.05], rot: [0, 0, a], color: WOOD_DARK })
  m.cylinder(0.08, 0.11, 0.9, { at: [0.15, 1.05, 0], rot: [0, 0, -1], color: BRASS })
  m.cylinder(0.12, 0.12, 0.06, { at: [0.52, 1.3, 0], rot: [0, 0, -1], color: '#b8862c' })
}

/** An owl on a bracket on the glass wall. */
const OWL: Model = (m) => {
  m.box(0.6, 0.06, 0.3, { at: [0, 0.03, 0], color: WOOD })
  m.sphere(0.22, { at: [0, 0.3, 0], scale: [1, 1.2, 0.9], color: '#a07850' })
  m.sphere(0.08, { at: [-0.08, 0.38, 0.17], color: '#fff6d0' })
  m.sphere(0.08, { at: [0.08, 0.38, 0.17], color: '#fff6d0' })
  m.sphere(0.035, { at: [-0.08, 0.38, 0.24], color: '#222233' })
  m.sphere(0.035, { at: [0.08, 0.38, 0.24], color: '#222233' })
  m.cone(0.03, 0.07, { at: [0, 0.3, 0.2], rot: [Math.PI / 2, 0, 0], color: '#e2a03a' })
  m.cone(0.05, 0.1, { at: [-0.12, 0.55, 0], color: '#a07850' })
  m.cone(0.05, 0.1, { at: [0.12, 0.55, 0], color: '#a07850' })
}

/** Something hung from the roof: its chain reaches up from its foot to the ceiling, `drop` metres. */
function hung(drop: number, body: (m: RoomKit) => void): Model {
  return (m) => {
    m.cylinder(0.015, 0.015, drop, { at: [0, drop / 2, 0], color: '#c9c3d8' })
    body(m)
  }
}

const LANTERN = (drop: number): Model =>
  hung(drop, (m) => {
    m.box(0.3, 0.38, 0.3, { at: [0, 0.22, 0], color: WARM, glow: true })
    m.cone(0.24, 0.16, { at: [0, 0.49, 0], color: '#3a3a52' })
    m.box(0.34, 0.04, 0.34, { at: [0, 0.02, 0], color: '#3a3a52' })
  })

const BASKET = (drop: number): Model =>
  hung(drop, (m) => {
    m.sphere(0.3, { at: [0, 0.3, 0], scale: [1, 0.6, 1], color: '#b58a52' })
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      m.sphere(0.13, { at: [cos(a) * 0.26, 0.15 - (i % 2) * 0.2, sin(a) * 0.2], scale: [0.6, 1.5, 0.6], color: i % 2 === 0 ? LEAF : LEAF_DARK })
    }
    m.sphere(0.24, { at: [0, 0.45, 0], scale: [1.1, 0.6, 1.1], color: LEAF })
  })

const MOBILE = (drop: number): Model =>
  hung(drop, (m) => {
    m.box(1, 0.03, 0.03, { at: [0, 0.6, 0], color: '#c9c3d8' })
    for (const [x, y, r, c] of [[-0.45, 0.25, 0.14, '#ff9a5a'], [0, 0.15, 0.18, '#7ac8ff'], [0.45, 0.3, 0.12, '#c89aff']] as const) {
      m.cylinder(0.008, 0.008, 0.6 - y, { at: [x, (0.6 + y) / 2, 0], color: '#c9c3d8' })
      m.sphere(r, { at: [x, y, 0], color: c })
    }
    m.torus(0.26, 0.02, { at: [0, 0.15, 0], rot: [1.3, 0, 0], color: '#ffe680' })
  })

const CHIME = (drop: number): Model =>
  hung(drop, (m) => {
    m.cylinder(0.2, 0.2, 0.04, { at: [0, 0.75, 0], color: WOOD })
    for (let i = 0; i < 5; i++) m.cylinder(0.025, 0.025, 0.4 + 0.08 * (i % 3), { at: [-0.16 + i * 0.08, 0.5 - 0.04 * (i % 3), 0], color: '#d8e0f0' })
    m.sphere(0.06, { at: [0, 0.2, 0], color: '#ffe680' })
  })

/** A star that shines on the glass wall. */
const STAR: Model = (m) => {
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? 0.32 : 0.14
    pts.push([r * cos(a), 0.32 + r * sin(a)])
  }
  m.extrude(pts, 0.08, { color: '#fff1a0', glow: true })
}

export const look: LookCode = (r, room) => {
  const { solid, dressAs } = byName(r, room)

  // The furniture: the play's plain solids, dressed.
  dressAs('bench', bench)
  dressAs('cupboard', cupboard)
  dressAs('crate', crate)
  dressAs('left rim', rim)
  dressAs('right rim', rim)
  for (const name of ['pond shelf', 'wall shelf']) dressAs(name, (w, h, d) => (m) => plank(m, w, Math.min(h, 0.14), d, h))

  // The glass wall: glazing bars and the crescent moons on it; the hung shelf's ropes up to the roof.
  r.wallpaper(CRESCENT)
  for (let x = -6; x <= 6; x += 2) r.decor([x, 0.25, -2.94], GLAZING_BAR)
  const pondShelf = solid('pond shelf')
  const [psx, psy] = pondShelf.at()
  const [psw, psh] = pondShelf.size()
  const shelfTop = psy + psh / 2
  for (const x of [psx - psw / 2 + 0.2, psx + psw / 2 - 0.2]) r.decor([x, shelfTop, -1.05], rope(8 - shelfTop))

  // Behind the play: ferns, moonflower vines up the bars, reeds behind the pond and the garden tools on the glass; in front, low grass kept off the pond, the start and the pots.
  for (const x of [-2.35, 3.65]) r.decor([x, 0, -2.3], FERN)
  for (const x of [-4, 2]) r.decor([x + 0.1, 0, -2.85], VINE)
  r.decor([0.65, 1.2, -2.85], TOOLS)
  for (const x of [-7.6, -6.6, 2.15, 6.4]) r.decor([x, 0, 1.25], TUFT)

  // Props on the floor and the shelves, which a player passes. The pond is the one zone the play shows in a colour.
  const [pond] = room.zones()
  r.decor([pond.at()[0], 0, -1.5], REEDS)
  r.prop([pond.at()[0] - 0.3, 0.05, -1.15], DUCK, { react: 'hop', idle: 'bob', sound: 'squeak', puff: 'drop' })
  r.prop([-2.35, 0, 1.25], FROG, { react: 'hop', sound: 'boing' })
  const benchSolid = solid('bench')
  r.prop([benchSolid.at()[0] + benchSolid.size()[0] / 2 - 0.35, benchSolid.at()[1] + benchSolid.size()[1] / 2, -1.2], SNAIL, { react: 'wobble', idle: 'sway' })
  r.prop([-7.0, 0, 1.2], MUSHROOMS, { react: 'wobble', sound: 'pop', puff: 'spark' })
  r.prop([psx - psw / 2 + 0.45, shelfTop, -1.4], TELESCOPE, { react: 'spin', sound: 'magic', puff: 'star' })
  r.prop([3.65, 0, 1.25], HEDGEHOG, { react: 'hop', sound: 'squeak', puff: 'leaf' })
  const crateSolid = solid('crate')
  const crateTop = crateSolid.at()[1] + crateSolid.size()[1] / 2
  r.prop([crateSolid.at()[0] - 0.6, crateTop, -1.2], CAT, { react: 'hop', idle: 'pulse', sound: 'meow', puff: 'heart' })
  r.prop([7.3, 0, 1.25], MUSHROOMS, { react: 'wobble', sound: 'pop', puff: 'spark' })

  // Props up under the roof, which answer a tap or a player high on the shelves and the flowers.
  r.prop([-7.2, 5.6, -2.6], OWL, { react: 'spin', idle: 'sway', sound: 'tweet', puff: 'leaf' })
  r.prop([-5.8, 6.6, -1.4], LANTERN(1.4), { react: 'swing', sound: 'chime' })
  r.prop([-3.0, 6.4, -1.6], BASKET(1.6), { react: 'swing', idle: 'sway' })
  r.prop([-0.6, 6.5, -1.6], BASKET(1.5), { react: 'swing', idle: 'sway' })
  r.prop([1.6, 6.3, -1.8], MOBILE(1.7), { react: 'spin', idle: 'spin', sound: 'chime' })
  r.prop([3.0, 4.6, -2.7], STAR, { react: 'blink', idle: 'pulse', sound: 'sparkle', puff: 'star' })
  r.prop([3.6, 6.6, -1.5], LANTERN(1.4), { react: 'swing', sound: 'chime' })
  r.prop([5, 6.9, -1.6], CHIME(1.1), { react: 'swing', idle: 'sway', sound: 'xylophone', puff: 'note' })

  // Lamps: the two lanterns, and a blue one over the pond.
  r.lamp([-5.8, 6.7, -1.2], { color: WARM, power: 0.6, reach: 6 })
  r.lamp([3.6, 6.7, -1.2], { color: WARM, power: 0.6, reach: 6 })
  r.lamp([pond.at()[0], 1.1, 0.9], { color: '#7fb4ff', power: 0.5, reach: 4.5 })

  // The small lights: stars through the glass, fairy lights swung under the roof, and fireflies low round the ferns and the pond. The seeds glow too, so no small light shines near where a thing of the play lies, and the stars stay high, the big ones highest.
  const door = room.wayOut()
  const things = room.things().map((t) => t.at())
  const clear = (at: Point) => things.every((t) => Math.abs(t[0] - at[0]) > 1.2 || Math.abs(t[1] - at[1]) > 1.2)
  const stars: Point[] = []
  for (let i = 0; stars.length < 70; i++) {
    const [u, v] = spread(i)
    const at: Point = [-7.8 + 15.6 * u, 4.4 + 3.2 * v, -2.96]
    if ((Math.abs(at[0] - door[0]) < 1 && at[1] < door[1] + 2.6) || !clear(at)) continue
    stars.push(at)
  }
  const big = stars.filter((at) => at[1] > 5.6).slice(0, 12)
  r.lights(big, { color: '#fffbe8', size: 0.2, twinkle: true })
  r.lights(stars.filter((at) => !big.includes(at)), { color: ['#ffffff', '#fff1c4', '#cfe0ff'], size: 0.08, twinkle: true })
  const swag: Point[] = []
  for (let k = 0; k < 6; k++) {
    for (let j = 0; j < 10; j++) {
      const t = j / 10
      swag.push([-7.8 + 2.6 * (k + t), 7.6 - 0.4 * sin(Math.PI * t), -2.6])
    }
  }
  r.lights(swag, { color: ['#ffd27a', '#ff9ec4', '#9fe3ff', '#c8ff9f'], size: 0.16, twinkle: true })
  const flies: Point[] = []
  for (let i = 0; flies.length < 14 && i < 200; i++) {
    const [u, v] = spread(i + 500)
    const at: Point = [-6 + 12 * u, 0.4 + 2.2 * v, -1.3 - 1.2 * ((i * 0.37) % 1)]
    if (clear(at)) flies.push(at)
  }
  r.lights(flies, { color: '#9dffb8', size: 0.08, twinkle: true })
}
