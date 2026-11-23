/**
 * Flower Bridge's look (flower-bridge.ts), written by hand as the look's designer would write it
 * (engine/look.ts LookCode) and run through the same builder and check as a made look
 * (engine/lookBuilder.ts buildLook, trial/lookCheck.ts). The room is a flower shop by day with a
 * canal through it: pink striped walls with a leafy sprig for wallpaper, a wooden floor, and the
 * garden terrace at the back.
 *
 * - The furniture is the play's plain solids dressed: the terrace as a brick garden wall with a stone
 *   coping and a lawn on top, ivy climbing its face; the landing as a stone pier with a deck; the
 *   stairs as wooden steps.
 * - Seen from high up, a piece taller than LOOK_PLACE.flat stands by a wall and must not hide a floor
 *   of the play, so the tall furniture stands where no floor is: along the right wall the shop's
 *   counter under a striped awning, a shelf of green plants and a parrot's perch; in the corner across
 *   the canal, by the way out, a garden shelf on the back wall; reeds in both ends of the canal.
 *   Everywhere else, and on the back wall over the terrace, only low pieces: bunting and window boxes
 *   on the wall, soil beds under the flowers, a wheelbarrow and a path on the lawn, lily pads and a
 *   stone kerb in the canal, a rug, trays of seedlings, a doormat and a sack of soil on the floor.
 * - Fifteen props answer a child in all four quarters: a duck, a frog and a fish in the canal, a snail
 *   and a butterfly on the terrace, a cat, a watering can, a shop bell and a hanging fern in the corner
 *   and on the right wall, a puppy, a tortoise and a bird by the stairs, the till, the parrot and a
 *   rabbit by the vases. None looks like a bunch of flowers or a vase, the things the task is played
 *   with: the look's plants are green, and its only petals are the ivy's small white blossoms on the
 *   terrace's face.
 * - Light 1, a shop by day: four warm lamps (over the counter, over the terrace and in the corner),
 *   fairy lights along the tops of the walls and under the awning, and glints twinkling on the canal.
 *
 * It reads where things are from `room`, never from the room code's numbers: the furniture by the
 * solids' names and sizes, the canal as the one zone shown in a colour, the flowers as room.things(),
 * the door by room.wayOut(). No dice: its scatter comes from a fixed sequence.
 */

import type { Point } from '../../engine/api'
import type { Model, RoomKit } from '../../engine/gift'
import type { LookCode } from '../../engine/look'
import { cos, sin } from '../../engine/math'
import { byName, spread } from './lookKit'

const BRICK = '#c9785a'
const BRICK_DARK = '#a95e44'
const STONE = '#e3dccf'
const STONE_DARK = '#bdb3a2'
const LAWN = '#7cc659'
const IVY = '#3f8a4e'
const IVY_LIGHT = '#57a85a'
const WOOD = '#b7804e'
const WOOD_DARK = '#8a5a34'
const PINK = '#ff8fb5'
const WHITE = '#ffffff'
const SOIL = '#6e4a30'
const LEAF = '#4caf50'
const LEAF_DARK = '#2f7d40'
const WARM = '#ffd98a'

// ------------------------------------------------------------------------------ the play's solids, dressed

/** The terrace: a brick garden wall with a stone coping along its front and a lawn on top, ivy climbing it, built to its solid. */
function terrace(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.06, d, { at: [0, (h - 0.06) / 2, 0], color: BRICK_DARK })
    m.box(w, 0.06, d - 0.2, { at: [0, h - 0.03, -0.1], color: LAWN })
    m.box(w + 0.04, 0.1, 0.32, { at: [0, h - 0.04, d / 2 - 0.1], color: STONE })
    // Courses of bricks on its front, every other one set over by half a brick.
    const rows = 6
    const rise = (h - 0.12) / rows
    for (let row = 0; row < rows; row++) {
      const shift = row % 2 === 0 ? 0 : 0.25
      for (let x = -w / 2 + shift; x < w / 2 - 0.1; x += 0.5) {
        const right = Math.min(x + 0.46, w / 2)
        m.box(right - x, rise - 0.04, 0.04, { at: [(x + right) / 2, rise * (row + 0.5), d / 2 + 0.02], color: row % 3 === 1 ? BRICK_DARK : BRICK })
      }
    }
    // Ivy climbing the front here and there: a winding stem with leaves along it and small white blossoms.
    for (const [x, top] of [[-4.4, 1.5], [-1.6, 1.25], [1.3, 1.55], [4.3, 1.2]] as const) {
      if (x > w / 2 - 0.5) continue
      const stem: [number, number, number][] = []
      for (let k = 0; k <= 6; k++) stem.push([x + 0.15 * sin(k * 1.4), 0.05 + ((top - 0.05) * k) / 6, d / 2 + 0.05])
      m.tube(stem, 0.025, { color: IVY })
      stem.forEach(([sx, sy], k) => {
        if (k === 0) return
        const side = k % 2 === 0 ? 1 : -1
        m.sphere(0.1, { at: [sx + side * 0.1, sy, d / 2 + 0.08], rot: [0, 0, side * 0.6], scale: [1.4, 0.8, 0.35], color: k % 3 === 0 ? IVY_LIGHT : IVY })
      })
      m.sphere(0.045, { at: [stem[5][0] + 0.06, stem[5][1] + 0.08, d / 2 + 0.13], color: WHITE })
      m.sphere(0.045, { at: [stem[2][0] - 0.07, stem[2][1] + 0.06, d / 2 + 0.13], color: WHITE })
    }
  }
}

/** The landing: a stone pier with a wooden deck on top, built to its solid. */
function landing(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.1, d, { at: [0, (h - 0.1) / 2, 0], color: STONE_DARK })
    for (let row = 0; row < 4; row++) {
      for (let k = 0; k < 4; k++) {
        const x = -w / 2 + (k + (row % 2) * 0.5 + 0.25) * (w / 4)
        if (x > w / 2 - 0.15) continue
        m.box(w / 4 - 0.06, (h - 0.1) / 4 - 0.05, 0.04, { at: [x, ((h - 0.1) * (row + 0.5)) / 4, d / 2 + 0.02], color: STONE })
      }
    }
    const boards = 6
    for (let i = 0; i < boards; i++) m.box(w, 0.1, d / boards - 0.03, { at: [0, h - 0.05, -d / 2 + (i + 0.5) * (d / boards)], color: i % 2 === 0 ? WOOD : WOOD_DARK })
  }
}

/** The stairs: wooden steps rising to the left, each with a darker nose, built to the ramp's box. */
function stairs(w: number, h: number, d: number): Model {
  return (m) => {
    const steps = 6
    const run = w / steps
    for (let k = 0; k < steps; k++) {
      const top = k === steps - 1 ? h : (h * (k + 0.75)) / steps
      const x = w / 2 - (k + 0.5) * run
      m.box(run, top, d, { at: [x, top / 2, 0], color: WOOD })
      m.box(run, 0.05, d + 0.04, { at: [x, top - 0.025, 0], color: WOOD_DARK })
    }
    m.extrude([[w / 2, 0], [-w / 2, h], [-w / 2, 0]], 0.06, { at: [0, 0, d / 2 + 0.03], color: WOOD_DARK })
  }
}

// ------------------------------------------------------------------------------ the walls

/** The wallpaper's motif: a sprig of green leaves on a stem, with a pink bow. */
const SPRIG: Model = (m) => {
  m.cylinder(0.015, 0.015, 0.5, { at: [0, 0.25, 0], color: LEAF_DARK })
  for (let i = 0; i < 4; i++) {
    const side = i % 2 === 0 ? 1 : -1
    m.sphere(0.08, { at: [side * 0.09, 0.14 + i * 0.1, 0], rot: [0, 0, side * 0.7], scale: [1.6, 0.6, 0.3], color: i % 2 === 0 ? LEAF : LEAF_DARK })
  }
  m.sphere(0.06, { at: [0, 0.52, 0], scale: [1.4, 0.8, 0.3], color: LEAF })
  m.sphere(0.045, { at: [-0.05, 0.06, 0], scale: [1.3, 0.7, 0.3], color: PINK })
  m.sphere(0.045, { at: [0.05, 0.06, 0], scale: [1.3, 0.7, 0.3], color: PINK })
}

/** A string of bunting `length` long across a wall, its flags in turn pink, white and yellow: low, so it hides nothing. */
function bunting(length: number): Model {
  return (m) => {
    m.box(length, 0.015, 0.015, { at: [0, 0.25, 0], color: WHITE })
    const flags = Math.floor(length / 0.4)
    for (let i = 0; i < flags; i++) {
      const x = -length / 2 + 0.2 + i * 0.4
      m.extrude([[x - 0.13, 0.25], [x + 0.13, 0.25], [x, 0.04]], 0.01, { color: ['#ff8fb5', WHITE, '#ffe066'][i % 3] })
    }
  }
}

/** A window box on the wall, trailing green leaves. */
const WINDOW_BOX: Model = (m) => {
  m.box(0.8, 0.16, 0.18, { at: [0, 0.08, 0], color: WHITE })
  for (let i = 0; i < 5; i++) m.sphere(0.1, { at: [-0.32 + i * 0.16, 0.19, 0.02], scale: [1, 0.7, 0.8], color: i % 2 === 0 ? LEAF : LEAF_DARK })
}

// ------------------------------------------------------------------------------ the floor and the canal

/** A bed of dark soil under a flower, flat. */
const SOIL_BED: Model = (m) => m.cylinder(0.32, 0.34, 0.04, { at: [0, 0.02, 0], color: SOIL })

/** A square paving slab of brick, flat: square and brick red, so it never looks like the play's round grey stones. */
const PATH_SLAB: Model = (m) => {
  m.box(0.42, 0.03, 0.42, { at: [0, 0.015, 0], color: BRICK_DARK })
  m.box(0.36, 0.035, 0.36, { at: [0, 0.0175, 0], color: BRICK })
}

/** A small wooden wheelbarrow, low. */
const BARROW: Model = (m) => {
  m.box(0.55, 0.16, 0.36, { at: [0, 0.16, 0], color: '#5b9bd5' })
  m.cylinder(0.08, 0.08, 0.05, { at: [0.32, 0.08, 0], rot: [Math.PI / 2, 0, 0], color: '#3a3a52' })
  for (const z of [-0.14, 0.14]) m.box(0.42, 0.03, 0.03, { at: [-0.42, 0.2, z], color: WOOD_DARK })
  m.sphere(0.12, { at: [0, 0.27, 0], scale: [1.4, 0.4, 1], color: SOIL })
}

/** The canal's bed, flat on the floor under the water: deep blue with lighter ripples across it. */
function canalBed(length: number, depth: number): Model {
  return (m) => {
    m.box(length, 0.02, depth, { at: [0, 0.01, 0], color: '#2f8fd8' })
    for (let i = 0; i < 14; i++) {
      const [u, v] = spread(i + 100)
      m.box(0.5 + 0.4 * v, 0.025, 0.05, { at: [-length / 2 + 0.4 + (length - 0.8) * u, 0.0125, -depth / 2 + 0.2 + (depth - 0.4) * v], color: '#7cc8f4' })
    }
  }
}

/** A lily pad floating flat. */
const LILY_PAD: Model = (m) => m.cylinder(0.24, 0.24, 0.02, { at: [0, 0.01, 0], scale: [1, 1, 0.85], color: '#5fc46b' })

/** A stone kerb `length` long along the canal's near edge, low enough to walk over and touching nothing. */
function kerb(length: number): Model {
  return (m) => {
    m.box(length, 0.08, 0.14, { at: [0, 0.04, 0], color: STONE_DARK })
    for (let x = -length / 2 + 0.25; x < length / 2; x += 0.5) m.box(0.44, 0.03, 0.16, { at: [x, 0.09, 0], color: STONE })
  }
}

/** Reeds and bulrushes standing in the water. */
const REEDS: Model = (m) => {
  for (let i = 0; i < 6; i++) {
    const h = 0.45 + 0.15 * ((i * 3) % 4) / 3
    const x = -0.15 + 0.06 * i
    m.cylinder(0.02, 0.03, h, { at: [x, h / 2, 0.06 * (i % 3) - 0.06], rot: [0, 0, 0.1 * (i - 2.5)], color: i % 2 === 0 ? '#4f9a4a' : '#3f8040' })
    if (i % 2 === 1) m.capsule(0.04, 0.12, { at: [x + 0.03 * (i - 2.5), h - 0.04, 0.06 * (i % 3) - 0.06], color: '#7a4a2a' })
  }
}

/** A mat in front of a door in the right wall, flat. */
const DOORMAT: Model = (m) => {
  m.box(0.6, 0.02, 1.0, { at: [0, 0.01, 0], color: '#9c6a3a' })
  m.box(0.5, 0.025, 0.9, { at: [0, 0.0125, 0], color: '#c49a5a' })
}

/** A sack of potting soil slumped on the floor, low. */
const SACK: Model = (m) => {
  m.sphere(0.3, { at: [0, 0.14, 0], scale: [1, 0.45, 0.75], color: '#c8b48a' })
  m.sphere(0.12, { at: [0.05, 0.27, 0], scale: [1, 0.4, 1], color: SOIL })
}

/** A long woven rug, flat on the floor: green with a pink border and a fringe at both ends, square cornered and coloured so it never looks like the play's round grey stones. */
const RUG: Model = (m) => {
  m.box(3, 0.02, 1.7, { at: [0, 0.01, 0], color: '#ff8fb5' })
  m.box(2.7, 0.025, 1.4, { at: [0, 0.0125, 0], color: '#4fae7a' })
  for (let i = 0; i < 4; i++) m.box(0.3, 0.03, 0.3, { at: [-0.9 + i * 0.6, 0.015, 0], rot: [0, Math.PI / 4, 0], color: '#ffd23a' })
  for (const x of [-1.56, 1.56]) for (let k = 0; k < 9; k++) m.box(0.12, 0.015, 0.05, { at: [x, 0.008, -0.72 + k * 0.18], color: '#fff3f7' })
}

/** A tray of green seedlings, low. */
const SEEDLINGS: Model = (m) => {
  m.box(0.7, 0.08, 0.45, { at: [0, 0.04, 0], color: '#3a3a52' })
  for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) m.cone(0.06, 0.16, { at: [-0.25 + i * 0.17, 0.16, -0.1 + j * 0.2], color: (i + j) % 2 === 0 ? LEAF : '#7fd06a' })
}

// ------------------------------------------------------------------------------ the right wall and the corner

/** The shop's counter: a pink panelled front, a white top and a drawer: built against the right wall. */
const COUNTER: Model = (m) => {
  m.box(0.8, 0.9, 1.3, { at: [0, 0.45, 0], color: '#ffb3cc' })
  m.box(0.9, 0.06, 1.4, { at: [-0.03, 0.93, 0], color: WHITE })
  for (const z of [-0.33, 0.33]) m.box(0.04, 0.6, 0.5, { at: [-0.41, 0.45, z], color: PINK })
}

/** A striped awning over the counter, sloping down into the room. */
const AWNING: Model = (m) => {
  for (let i = 0; i < 6; i++) m.box(0.9, 0.06, 0.25, { at: [-0.05, 0.25, -0.625 + i * 0.25], rot: [0, 0, 0.35], color: i % 2 === 0 ? PINK : WHITE })
  for (let i = 0; i < 6; i++) m.sphere(0.07, { at: [-0.5, 0.08, -0.625 + i * 0.25], scale: [0.5, 1, 1.4], color: i % 2 === 0 ? PINK : WHITE })
}

/** A potted green plant, its leaves fanned out. */
function pottedPlant(m: RoomKit, x: number, y: number, z: number, s: number): void {
  m.cylinder(0.14 * s, 0.11 * s, 0.2 * s, { at: [x, y + 0.1 * s, z], color: '#d9734a' })
  for (let i = 0; i < 5; i++) {
    const a = -1 + (2 * i) / 4
    m.sphere(0.13 * s, { at: [x + sin(a) * 0.12 * s, y + (0.32 + cos(a) * 0.08) * s, z], rot: [0, 0, -a], scale: [0.5, 1.3, 0.4], color: i % 2 === 0 ? LEAF : LEAF_DARK })
  }
}

/** A tall shelf of green plants against the right wall: three white boards on posts, plants on each. */
const PLANT_SHELF: Model = (m) => {
  for (const z of [-0.65, 0.65]) m.box(0.06, 1.75, 0.06, { at: [0.3, 0.875, z], color: WHITE })
  for (const [k, y] of [0.3, 0.9, 1.5].entries()) {
    m.box(0.65, 0.05, 1.4, { at: [0, y, 0], color: WHITE })
    for (let i = 0; i < 3; i++) pottedPlant(m, -0.05, y + 0.025, -0.45 + i * 0.45, k === 2 ? 0.8 : 1)
  }
}

/** A garden shelf on the back wall of the corner: wooden boards with clay pots, a sack and twine. */
const GARDEN_SHELF: Model = (m) => {
  for (const x of [-0.58, 0.58]) m.box(0.06, 2, 0.06, { at: [x, 1, 0.12], color: WOOD_DARK })
  for (const y of [0.4, 1.2, 1.9]) m.box(1.2, 0.05, 0.36, { at: [0, y, 0], color: WOOD })
  for (let i = 0; i < 3; i++) m.cylinder(0.12, 0.09, 0.18, { at: [-0.4 + i * 0.4, 0.515, 0], color: '#d9734a' })
  m.sphere(0.22, { at: [0.3, 1.4, 0], scale: [1, 0.85, 0.7], color: '#c8b48a' })
  m.cylinder(0.1, 0.1, 0.12, { at: [-0.3, 1.285, 0], color: '#e8d8a0' })
  pottedPlant(m, -0.35, 1.925, 0, 0.9)
  pottedPlant(m, 0.25, 1.925, 0, 0.9)
}

/** A parrot's perch: a stand with a crossbar. The parrot on it is a prop of its own. */
const PERCH: Model = (m) => {
  m.cylinder(0.25, 0.28, 0.05, { at: [0, 0.025, 0], color: WOOD_DARK })
  m.cylinder(0.03, 0.03, 1.3, { at: [0, 0.675, 0], color: WOOD })
  m.box(0.05, 0.05, 0.5, { at: [0, 1.32, 0], color: WOOD_DARK })
}

// ------------------------------------------------------------------------------ props

const DUCK: Model = (m) => {
  m.sphere(0.16, { at: [0, 0.1, 0], scale: [1.3, 0.75, 1], color: '#ffd43a' })
  m.sphere(0.1, { at: [0.15, 0.24, 0], color: '#ffd43a' })
  m.cone(0.04, 0.1, { at: [0.27, 0.23, 0], rot: [0, 0, -Math.PI / 2], color: '#ff8a2a' })
  m.sphere(0.02, { at: [0.2, 0.27, 0.07], color: '#222233' })
}

const FROG_ON_PAD: Model = (m) => {
  m.cylinder(0.26, 0.26, 0.02, { at: [0, 0.01, 0], scale: [1, 1, 0.85], color: '#4fae5a' })
  m.sphere(0.13, { at: [0, 0.11, 0], scale: [1.2, 0.75, 1], color: '#5cc85a' })
  for (const x of [-0.06, 0.06]) {
    m.sphere(0.045, { at: [x, 0.21, 0.07], color: WHITE })
    m.sphere(0.022, { at: [x, 0.215, 0.11], color: '#222233' })
  }
}

const FISH: Model = (m) => {
  m.sphere(0.12, { at: [0, 0.1, 0], scale: [1.5, 0.8, 0.5], color: '#ff9f43' })
  m.extrude([[-0.15, 0.1], [-0.3, 0.2], [-0.3, 0]], 0.03, { color: '#ff7a1a' })
  m.sphere(0.02, { at: [0.1, 0.13, 0.05], color: '#222233' })
}

const SNAIL: Model = (m) => {
  m.capsule(0.05, 0.25, { at: [0, 0.05, 0], rot: [0, 0, Math.PI / 2], color: '#c8b48a' })
  m.torus(0.08, 0.05, { at: [-0.03, 0.16, 0], color: '#e08a5a' })
  m.sphere(0.02, { at: [0.15, 0.2, 0], color: '#222233' })
}

const BUTTERFLY: Model = (m) => {
  m.capsule(0.015, 0.1, { at: [0, 0.08, 0], rot: [0, 0, Math.PI / 2], color: '#3a3a52' })
  for (const s of [-1, 1]) m.sphere(0.08, { at: [0, 0.1, s * 0.08], scale: [1, 0.2, 1], color: '#7ac8ff' })
}

const CAT: Model = (m) => {
  m.sphere(0.2, { at: [0, 0.14, 0], scale: [1.3, 0.7, 0.9], color: '#9a9aa8' })
  m.sphere(0.12, { at: [0.22, 0.24, 0.02], color: '#9a9aa8' })
  m.cone(0.04, 0.08, { at: [0.17, 0.37, 0.02], color: '#9a9aa8' })
  m.cone(0.04, 0.08, { at: [0.28, 0.37, 0.02], color: '#9a9aa8' })
  m.capsule(0.035, 0.25, { at: [-0.26, 0.08, 0.08], rot: [0, 0, 1.3], color: '#7a7a88' })
}

const CAN: Model = (m) => {
  m.cylinder(0.11, 0.12, 0.2, { at: [0, 0.1, 0], color: '#5b9bd5' })
  m.cylinder(0.02, 0.03, 0.2, { at: [0.16, 0.16, 0], rot: [0, 0, -0.9], color: '#5b9bd5' })
  m.torus(0.07, 0.015, { at: [-0.02, 0.23, 0], color: '#3a86bd' })
}

const BELL: Model = (m) => {
  m.box(0.05, 0.05, 0.25, { at: [-0.05, 0.27, 0], color: WOOD_DARK })
  m.cylinder(0.04, 0.11, 0.15, { at: [0, 0.12, 0], color: '#e2b44c' })
  m.sphere(0.03, { at: [0, 0.03, 0], color: '#b8862c' })
}

/** A hanging basket of ferns on a bracket on the wall. */
const HANGING_FERN: Model = (m) => {
  m.box(0.3, 0.04, 0.04, { at: [0.1, 0.48, 0], color: WOOD_DARK })
  m.cylinder(0.01, 0.01, 0.22, { at: [-0.05, 0.37, 0], color: '#c9b089' })
  m.sphere(0.16, { at: [-0.05, 0.16, 0], scale: [1, 0.6, 1], color: '#b58a52' })
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    m.sphere(0.1, { at: [-0.05 + cos(a) * 0.16, 0.1, sin(a) * 0.16], scale: [0.5, 1.3, 0.5], color: i % 2 === 0 ? LEAF : LEAF_DARK })
  }
}

const PUPPY: Model = (m) => {
  m.cylinder(0.3, 0.32, 0.06, { at: [0, 0.03, 0], color: '#7fb0ff' })
  m.sphere(0.16, { at: [0, 0.18, 0], scale: [1.3, 0.8, 1], color: '#e8c08a' })
  m.sphere(0.11, { at: [0.2, 0.26, 0], color: '#e8c08a' })
  m.sphere(0.05, { at: [0.2, 0.25, 0.1], scale: [0.6, 1.3, 0.4], color: '#a0703a' })
  m.sphere(0.025, { at: [0.3, 0.26, 0], color: '#222233' })
}

const TORTOISE: Model = (m) => {
  m.sphere(0.18, { at: [0, 0.08, 0], scale: [1.2, 0.6, 1], color: '#7a9a4a' })
  m.sphere(0.06, { at: [0.22, 0.08, 0], color: '#a8b878' })
  for (const [x, z] of [[0.12, 0.12], [0.12, -0.12], [-0.12, 0.12], [-0.12, -0.12]]) m.sphere(0.04, { at: [x, 0.03, z], color: '#a8b878' })
}

const BIRD: Model = (m) => {
  m.sphere(0.08, { at: [0, 0.08, 0], scale: [1.3, 1, 1], color: '#5ec8ff' })
  m.sphere(0.055, { at: [0.09, 0.15, 0], color: '#5ec8ff' })
  m.cone(0.02, 0.05, { at: [0.15, 0.15, 0], rot: [0, 0, -Math.PI / 2], color: '#ffb02a' })
}

const TILL: Model = (m) => {
  m.box(0.34, 0.16, 0.4, { at: [0, 0.08, 0], color: '#7a7a88' })
  m.box(0.3, 0.1, 0.2, { at: [0.02, 0.2, -0.08], rot: [0, 0, 0.3], color: '#c8c8d4' })
  for (let i = 0; i < 3; i++) m.box(0.05, 0.03, 0.05, { at: [-0.1 + i * 0.1, 0.17, 0.1], color: ['#ff8fb5', '#ffe066', '#7ac8ff'][i] })
}

/** The parrot, sitting on its perch's crossbar. */
const PARROT: Model = (m) => {
  m.capsule(0.12, 0.2, { at: [0, 1.55, 0], color: '#3fbf5a' })
  m.sphere(0.12, { at: [0, 1.8, 0.04], color: '#ff5a4e' })
  m.cone(0.045, 0.1, { at: [0, 1.78, 0.18], rot: [Math.PI / 2, 0, 0], color: '#ffd23a' })
  for (const x of [-0.05, 0.05]) m.sphere(0.025, { at: [x, 1.84, 0.13], color: '#222233' })
  m.extrude([[-0.06, 1.38], [0.06, 1.38], [0, 1.05]], 0.04, { color: '#5ec8ff' })
}

const RABBIT: Model = (m) => {
  m.sphere(0.13, { at: [0, 0.12, 0], scale: [1.2, 0.9, 1], color: WHITE })
  m.sphere(0.08, { at: [0.12, 0.2, 0], color: WHITE })
  for (const z of [-0.03, 0.03]) m.capsule(0.022, 0.08, { at: [0.12, 0.31, z], color: '#ffd0dc' })
  m.sphere(0.04, { at: [-0.14, 0.12, 0], color: WHITE })
}

/** Points along a swag of fairy lights from a to b, dipping `sag` metres in its middle. */
function swag(a: Point, b: Point, sag: number, count: number): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const t = (i + 0.5) / count
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * sin(Math.PI * t), a[2] + (b[2] - a[2]) * t]
  })
}

export const look: LookCode = (r, room) => {
  const { solid, dressAs } = byName(r, room)

  // The play's solids as furniture.
  dressAs('terrace', terrace)
  dressAs('landing', landing)
  dressAs('stairs', stairs)

  const deck = solid('terrace')
  const [tx, ty, tz] = deck.at()
  const [tw, th, td] = deck.size()
  const top = ty + th / 2
  const left = tx - tw / 2
  const right = tx + tw / 2
  const back = tz - td / 2
  const front = tz + td / 2
  const [canal] = room.zones()
  const [, cy, cz] = canal.at()
  const [, ch, cd] = canal.size()
  const water = cy + ch / 2
  const near = cz + cd / 2
  const pier = solid('landing')
  const steps = solid('stairs')
  const pierTop = pier.at()[1] + pier.size()[1] / 2
  const pierLeft = pier.at()[0] - pier.size()[0] / 2
  const pierRight = pier.at()[0] + pier.size()[0] / 2
  const pierBack = pier.at()[2] - pier.size()[2] / 2
  const stairsRight = steps.at()[0] + steps.size()[0] / 2
  const door = room.wayOut()

  // The walls: the leafy wallpaper; on the back wall over the terrace, bunting and window boxes, low so they hide nothing.
  r.wallpaper(SPRIG)
  for (let x = left + 1.3; x < right - 1.2; x += 2.6) r.decor([x, 2.1, -3.93], bunting(2.4))
  for (const x of [left + 1.8, tx, right - 1.6]) r.decor([x, 1.95, -3.86], WINDOW_BOX)

  // On the terrace: a bed of soil under each flower, a path of brick slabs from the bridge and a wheelbarrow.
  for (const t of room.things()) if (t.at()[1] > top - 0.05) r.decor(t.at(), SOIL_BED)
  for (let i = 0; i < 5; i++) r.decor([left + 1.2 + i * 0.55, top, front - 0.4 - 0.25 * sin(i * 1.3)], PATH_SLAB, { turn: 0.2 * sin(i * 2.1) })
  r.decor([left + 2.4, top, back + 0.5], BARROW, { turn: 0.4 })

  // The corner across the canal: the garden shelf on its back wall, a mat at the way out and a sack of soil.
  r.decor([right + 0.95, 0, back + 0.2], GARDEN_SHELF)
  r.decor([door[0] - 0.45, 0, door[2]], DOORMAT)
  r.decor([right + 0.6, 0, front - 0.45], SACK)

  // The canal: its blue bed under the water, lily pads, reeds at both ends, the stone kerb along its near edge from the stairs to the right wall.
  r.decor([canal.at()[0], 0, cz], canalBed(canal.size()[0], cd))
  for (let i = 0; i < 12; i++) {
    const [u, v] = spread(i)
    r.decor([-6.4 + 12.8 * u, water, cz - cd / 2 + 0.3 + (cd - 0.6) * v], LILY_PAD, { turn: i })
  }
  r.decor([-6.8, 0, cz + 0.1], REEDS)
  r.decor([6.65, 0, cz + 0.2], REEDS, { turn: 2 })
  const kerbFrom = stairsRight + 0.1
  r.decor([(kerbFrom + 6.95) / 2, 0, near + 0.08], kerb(6.95 - kerbFrom))

  // The shop's floor: a rug where the players start, trays of seedlings in front of the stairs.
  const starts = room.starts()
  const mid = starts.reduce((s, p) => s + p[0], 0) / starts.length
  r.decor([mid, 0, starts[0][2]], RUG)
  r.decor([pierRight + 0.45, 0, 2.6], SEEDLINGS, { turn: 0.2 })
  r.decor([pierRight + 0.45, 0, 3.45], SEEDLINGS, { turn: -0.15 })

  // Along the right wall, front to back: the counter under its awning, a shelf of green plants, the parrot's perch over the canal's edge.
  r.decor([6.55, 0, 3.25], COUNTER)
  r.decor([6.5, 2.0, 3.25], AWNING)
  r.decor([6.6, 0, 1.7], PLANT_SHELF)
  r.decor([6.65, 0, near + 0.3], PERCH)

  // Props in the canal and on the terrace (the back left), which a player wading or crossing passes.
  r.prop([-3.2, water, cz - 0.1], DUCK, { scale: 0.85, react: 'hop', idle: 'bob', sound: 'squeak', puff: 'drop' })
  r.prop([-0.8, water, cz - 0.5], FROG_ON_PAD, { react: 'hop', sound: 'boing', puff: 'drop' })
  r.prop([left + 2.6, top, back + 0.2], SNAIL, { react: 'wobble', idle: 'sway' })
  r.prop([left + 3.4, top + 0.6, front - 0.9], BUTTERFLY, { react: 'spin', idle: 'bob', sound: 'sparkle', puff: 'star' })

  // Props in the corner across the canal and on the right wall by it (the back right).
  r.prop([2.6, water, cz + 0.2], FISH, { react: 'hop', idle: 'bob', sound: 'splash', puff: 'bubble' })
  r.prop([right + 0.55, 0, back + 1.25], CAT, { scale: 0.75, react: 'hop', idle: 'pulse', sound: 'meow', puff: 'heart' })
  r.prop([right + 1.0, 1.225, back + 0.2], CAN, { react: 'wobble', sound: 'plop', puff: 'drop' })
  r.prop([6.85, 2.0, door[2] + 1.15], BELL, { react: 'swing', sound: 'bell' })
  r.prop([6.8, 1.5, cz - 0.5], HANGING_FERN, { react: 'swing', idle: 'sway' })

  // Props by the stairs (the front left).
  r.prop([-3.4, 0, 3.6], PUPPY, { scale: 0.85, react: 'hop', sound: 'woof', puff: 'heart' })
  r.prop([-1.4, 0, 3.75], TORTOISE, { react: 'wobble', sound: 'squish' })
  r.prop([pierLeft + 0.15, pierTop, pierBack + 0.2], BIRD, { react: 'hop', idle: 'bob', sound: 'tweet', puff: 'note' })

  // Props by the vases and the counter (the front right).
  r.prop([6.55, 0.96, 3.4], TILL, { react: 'hop', sound: 'coins', puff: 'spark' })
  r.prop([6.65, 0, near + 0.3], PARROT, { react: 'spin', idle: 'sway', sound: 'tweet', puff: 'confetti' })
  r.prop([4.6, 0, 3.75], RABBIT, { scale: 0.85, react: 'hop', sound: 'squeak', puff: 'heart' })

  // Lamps: over the counter, over both halves of the terrace and in the corner.
  r.lamp([6.2, 2.2, 3.2], { color: WARM, power: 0.6, reach: 5 })
  r.lamp([left + 2.5, top + 1, back + 0.6], { color: WARM, power: 0.5, reach: 5 })
  r.lamp([tx + 2.5, top + 1, back + 0.6], { color: WARM, power: 0.5, reach: 5 })
  r.lamp([right + 1.6, 2.2, back + 1], { color: WARM, power: 0.5, reach: 4 })

  // Small lights: fairy lights swung along the tops of the three walls and under the awning, and glints on the canal.
  const wallTop = 2.45
  const fairy = ['#ffd27a', '#ff9ec4', '#9fe3ff', '#ffffff']
  const strung: Point[] = []
  for (let k = 0; k < 6; k++) strung.push(...swag([-6.9 + (13.8 * k) / 6, wallTop, -3.95], [-6.9 + (13.8 * (k + 1)) / 6, wallTop, -3.95], 0.18, 9))
  for (let k = 0; k < 4; k++) strung.push(...swag([-6.95, wallTop, -3.9 + 2 * k], [-6.95, wallTop, -1.9 + 2 * k], 0.15, 8))
  for (let k = 0; k < 4; k++) strung.push(...swag([6.95, wallTop, -3.9 + 2 * k], [6.95, wallTop, -1.9 + 2 * k], 0.15, 8))
  r.lights(strung, { color: fairy, size: 0.14, twinkle: true })
  r.lights(swag([6.05, 2.05, 2.6], [6.05, 2.05, 3.9], 0.08, 8), { color: WARM, size: 0.12 })
  const glints: Point[] = []
  for (let i = 0; i < 30; i++) {
    const [u, v] = spread(i + 300)
    glints.push([-6.8 + 13.6 * u, water + 0.01, cz - cd / 2 + 0.1 + (cd - 0.2) * v])
  }
  r.lights(glints, { color: ['#ffffff', '#cfefff'], size: 0.08, twinkle: true })
}
