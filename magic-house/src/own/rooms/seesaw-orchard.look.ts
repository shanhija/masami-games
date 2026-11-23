/**
 * Apple Kitchen's look (seesaw-orchard.ts), written by hand as the look's designer would write it
 * (engine/look.ts LookCode) and run through the same builder and check as a made look
 * (engine/lookBuilder.ts buildLook, trial/lookCheck.ts). The room is a sunny farmhouse kitchen: its
 * walls are cream tiles (the shell's checks) with little blue teacups on them, a big window with red
 * curtains looks out on the sky in the middle of the back wall, and copper pans and ladles hang from
 * rails under the ceiling.
 *
 * - The furniture is the play's plain solids dressed: the stool with a red cushion, the stove in green
 *   enamel with its oven glowing, the footstool with a heart in it, and the sink's counter as a
 *   cupboard under a wooden top. The stove's pipe climbs to the ceiling behind it.
 * - Behind the play, a plate rack over the stove, a shelf of jars over the sink, the window with
 *   herbs on its sill, a cuckoo clock and a picture of a cow, a mouse hole in the skirting and a broom;
 *   in front of it, a rag rug, and a cat and a dog in their baskets, kept off the starts and the door.
 * - Seventeen props answer a child in all four quarters: down low the cat, the dog, the mouse, the
 *   kettle, the jars, the broom, the duck by the sink and the herbs; up high the clock, the cow, the
 *   pans and ladles, the pendant lamps, the sun-catcher and a bird in each tree. None looks like an
 *   apple, the pie dish or the seesaw, the things the task is played with.
 * - Light: the room is bright (light 1). Two pendant lamps and the oven light it warmly, and fairy
 *   lights run round the window and through the trees' crowns.
 *
 * It reads where things are from `room`, never from the room code's numbers: the furniture by the
 * solids' names and sizes, the trees by their lowest and highest branches, the door by
 * room.wayOut(). Its numbers for where things stand keep inside LOOK_PLACE's bands: behind the play
 * from the back wall to z -1, in front of it from z 1, at most half a metre tall, and nothing behind
 * the play in front of the door. No dice: its scatter comes from fixed sequences.
 */

import type { Point } from '../../engine/api'
import type { Model } from '../../engine/gift'
import type { LookCode, SeenSolid } from '../../engine/look'
import { cos, sin } from '../../engine/math'
import { byName, spread } from './lookKit'

const WOOD = '#b07a48'
const WOOD_DARK = '#7d5432'
const ENAMEL = '#5fa37c'
const ENAMEL_LIGHT = '#7fc39a'
const IRON = '#3a3a44'
const BRASS = '#e2b44c'
const COPPER = '#d0763e'
const CUPBOARD = '#f2e2c2'
const RED = '#d9534f'
const WHITE = '#fbfbf7'
const BLUE = '#5b8fd5'
const WARM = '#ffd98a'

/** The stool: four legs under a round red cushion, built to its solid. */
function stool(w: number, h: number, d: number): Model {
  return (m) => {
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) m.cylinder(0.035, 0.045, h - 0.1, { at: [x * (w / 2 - 0.08), (h - 0.1) / 2, z * (d / 2 - 0.12)], color: WOOD })
    m.box(w, 0.06, d, { at: [0, h - 0.13, 0], color: WOOD_DARK })
    m.box(w - 0.04, 0.1, d - 0.04, { at: [0, h - 0.05, 0], color: RED })
    m.box(w - 0.1, 0.02, 0.04, { at: [0, h - 0.01, d / 2 - 0.25], color: WHITE })
  }
}

/** The footstool: a wooden box with a heart cut in its front, built to its solid. */
function footstool(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.06, d, { at: [0, (h - 0.06) / 2, 0], color: WOOD })
    m.box(w + 0.06, 0.06, d + 0.04, { at: [0, h - 0.03, 0], color: WOOD_DARK })
    m.sphere(0.08, { at: [-0.06, h * 0.5, d / 2], scale: [1, 1, 0.3], color: RED })
    m.sphere(0.08, { at: [0.06, h * 0.5, d / 2], scale: [1, 1, 0.3], color: RED })
    m.cone(0.11, 0.16, { at: [0, h * 0.5 - 0.1, d / 2], rot: [0, 0, Math.PI], scale: [1, 1, 0.25], color: RED })
  }
}

/** The stove: a green enamel range with a black top, an oven door with a glowing window, knobs and a rail, built to its solid. */
function stove(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.08, d, { at: [0, (h - 0.08) / 2, 0], color: ENAMEL })
    m.box(w + 0.06, 0.08, d + 0.04, { at: [0, h - 0.04, 0], color: IRON })
    m.box(w - 0.3, h * 0.48, 0.04, { at: [0, h * 0.34, d / 2 + 0.01], color: ENAMEL_LIGHT })
    m.box(w * 0.4, h * 0.2, 0.03, { at: [0, h * 0.36, d / 2 + 0.03], color: '#ffb347', glow: true })
    m.cylinder(0.025, 0.025, w - 0.4, { at: [0, h * 0.64, d / 2 + 0.08], rot: [0, 0, Math.PI / 2], color: BRASS })
    for (let i = 0; i < 4; i++) m.sphere(0.05, { at: [-w / 2 + 0.3 + i * ((w - 0.6) / 3), h - 0.18, d / 2 + 0.03], color: IRON })
    m.box(w, 0.08, 0.04, { at: [0, 0.04, d / 2 + 0.01], color: IRON })
  }
}

/** The sink's counter: a cupboard with two doors and brass knobs under a wooden top, built to its solid. */
function counter(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.08, d, { at: [0, (h - 0.08) / 2, 0], color: CUPBOARD })
    m.box(w + 0.08, 0.08, d + 0.06, { at: [0, h - 0.04, 0], color: WOOD })
    for (const x of [-w / 4, w / 4]) {
      m.box(w / 2 - 0.14, h - 0.32, 0.04, { at: [x, (h - 0.08) / 2, d / 2 + 0.01], color: '#e6cfa3' })
      m.sphere(0.045, { at: [x * 0.3, h * 0.55, d / 2 + 0.05], color: BRASS })
    }
    m.box(w, 0.08, 0.04, { at: [0, 0.04, d / 2 + 0.01], color: WOOD_DARK })
  }
}

/** The wallpaper's motif: a little blue teacup on its saucer. */
const TEACUP: Model = (m) => {
  m.cylinder(0.24, 0.2, 0.03, { at: [0, 0.03, 0], color: BLUE })
  m.cylinder(0.17, 0.12, 0.2, { at: [0, 0.15, 0], color: BLUE })
  m.torus(0.06, 0.018, { at: [0.19, 0.17, 0], color: BLUE })
  m.cylinder(0.18, 0.18, 0.02, { at: [0, 0.26, 0], color: WHITE })
}

/** A plate rack: a shelf with plates standing in it, `w` wide. */
function plateRack(w: number): Model {
  return (m) => {
    m.box(w, 0.06, 0.3, { at: [0, 0.03, 0], color: WOOD })
    m.box(w, 0.04, 0.04, { at: [0, 0.5, 0.12], color: WOOD })
    const n = Math.floor(w / 0.32)
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + 0.2 + i * ((w - 0.4) / Math.max(1, n - 1))
      m.cylinder(0.2, 0.2, 0.03, { at: [x, 0.25, 0], rot: [Math.PI / 2, 0, 0], color: i % 2 === 0 ? WHITE : '#d6e6f7' })
      m.cylinder(0.12, 0.12, 0.035, { at: [x, 0.25, 0.005], rot: [Math.PI / 2, 0, 0], color: i % 2 === 0 ? BLUE : RED })
    }
  }
}

/** A wall shelf on two brackets, `w` wide. */
function shelf(w: number): Model {
  return (m) => {
    m.box(w, 0.06, 0.32, { at: [0, 0, 0], color: WOOD })
    for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) m.extrude([[0, 0], [0.22, 0], [0, -0.22]], 0.06, { at: [x - 0.03, -0.03, -0.1], color: WOOD_DARK })
  }
}

/** The big window in the back wall: white frame, sky in its panes, a sill, and red curtains tied back. */
function window(w: number, h: number): Model {
  return (m) => {
    m.box(w, h, 0.04, { at: [0, h / 2, 0], color: '#bfe6ff' })
    m.sphere(0.5, { at: [w * 0.22, h * 0.68, 0.03], scale: [1.4, 0.5, 0.1], color: WHITE })
    m.sphere(0.35, { at: [-w * 0.25, h * 0.42, 0.03], scale: [1.4, 0.5, 0.1], color: WHITE })
    for (const x of [-w / 2, 0, w / 2]) m.box(0.12, h + 0.12, 0.08, { at: [x, h / 2, 0.05], color: WHITE })
    for (const y of [0, h / 2, h]) m.box(w + 0.12, 0.12, 0.08, { at: [0, y, 0.05], color: WHITE })
    m.box(w + 0.5, 0.1, 0.3, { at: [0, -0.05, 0.15], color: WHITE })
    for (const side of [-1, 1]) {
      m.box(0.55, h + 0.3, 0.06, { at: [side * (w / 2 + 0.2), h / 2 + 0.1, 0.12], color: RED })
      for (let k = 0; k < 4; k++) m.box(0.55, 0.06, 0.07, { at: [side * (w / 2 + 0.2), 0.3 + k * (h / 4), 0.13], color: WHITE })
      m.box(0.6, 0.08, 0.08, { at: [side * (w / 2 + 0.2), h * 0.45, 0.16], color: BRASS })
    }
    m.box(w + 1.3, 0.08, 0.1, { at: [0, h + 0.35, 0.1], color: BRASS })
  }
}

/** A rag rug, flat on the floor, w wide, in stripes. */
function rug(w: number): Model {
  return (m) => {
    const colors = [RED, '#f2c45a', BLUE, '#7fc39a']
    for (let i = 0; i < 4; i++) m.box(w, 0.02, 0.1, { at: [0, 0.01, -0.15 + i * 0.1], color: colors[i] })
  }
}

/** The broom, leaning on the wall. */
const BROOM: Model = (m) => {
  m.cylinder(0.025, 0.025, 1.5, { at: [0, 0.95, 0], rot: [0, 0, 0.12], color: WOOD })
  m.cone(0.22, 0.45, { at: [0.02, 0.22, 0], rot: [0, 0, 0.12], scale: [1, 1, 0.4], color: '#e8c060' })
  m.box(0.3, 0.05, 0.06, { at: [0.03, 0.42, 0], rot: [0, 0, 0.12], color: RED })
}

/** A mouse hole in the skirting: a dark arch. */
const MOUSE_HOLE: Model = (m) => {
  m.extrude([[-0.2, 0], [0.2, 0], [0.2, 0.18], [0.14, 0.3], [0, 0.35], [-0.14, 0.3], [-0.2, 0.18]], 0.02, { color: '#3a2a20' })
}

// ------------------------------------------------------------------------------ props

const CAT_BASKET: Model = (m) => {
  m.cylinder(0.42, 0.36, 0.2, { at: [0, 0.1, 0], scale: [1, 1, 0.6], color: '#c8955a' })
  m.sphere(0.24, { at: [0, 0.24, 0], scale: [1.3, 0.6, 0.8], color: '#9a9aa8' })
  m.sphere(0.14, { at: [0.26, 0.3, 0.05], color: '#9a9aa8' })
  m.cone(0.05, 0.1, { at: [0.2, 0.46, 0.05], color: '#9a9aa8' })
  m.cone(0.05, 0.1, { at: [0.33, 0.46, 0.05], color: '#9a9aa8' })
  m.box(0.07, 0.015, 0.02, { at: [0.22, 0.31, 0.18], color: IRON })
  m.box(0.07, 0.015, 0.02, { at: [0.32, 0.31, 0.17], color: IRON })
}

const DOG_BASKET: Model = (m) => {
  m.cylinder(0.45, 0.4, 0.18, { at: [0, 0.09, 0], scale: [1, 1, 0.6], color: '#6f8fc8' })
  m.sphere(0.26, { at: [0, 0.24, 0], scale: [1.3, 0.62, 0.8], color: '#e0b070' })
  m.sphere(0.16, { at: [-0.28, 0.32, 0.05], color: '#e0b070' })
  m.sphere(0.08, { at: [-0.4, 0.28, 0.08], color: '#c9955a' })
  m.sphere(0.04, { at: [-0.47, 0.3, 0.1], color: IRON })
  m.sphere(0.09, { at: [-0.2, 0.42, 0], scale: [0.6, 1.1, 0.4], color: '#9a6a3a' })
  m.sphere(0.025, { at: [-0.32, 0.36, 0.15], color: IRON })
}

const MOUSE: Model = (m) => {
  m.sphere(0.09, { at: [0, 0.07, 0], scale: [1.4, 0.8, 0.9], color: '#a8a0a0' })
  m.sphere(0.04, { at: [0.08, 0.15, 0], color: '#d8b0b0' })
  m.sphere(0.012, { at: [0.13, 0.08, 0.05], color: IRON })
  m.tube([[-0.12, 0.05, 0], [-0.22, 0.08, 0], [-0.28, 0.16, 0]], 0.01, { color: '#d8b0b0' })
}

const KETTLE: Model = (m) => {
  m.sphere(0.2, { at: [0, 0.18, 0], scale: [1, 0.85, 1], color: RED })
  m.cylinder(0.06, 0.09, 0.05, { at: [0, 0.35, 0], color: RED })
  m.torus(0.12, 0.02, { at: [0, 0.37, 0], color: IRON })
  m.cylinder(0.03, 0.05, 0.22, { at: [0.22, 0.22, 0], rot: [0, 0, -0.8], color: RED })
}

function jars(n: number): Model {
  return (m) => {
    const lids = [RED, BLUE, '#f2c45a', '#7fc39a']
    for (let i = 0; i < n; i++) {
      const x = -0.3 * (n - 1) / 2 + i * 0.3
      const h = 0.26 + 0.06 * (i % 2)
      m.cylinder(0.1, 0.1, h, { at: [x, h / 2, 0], color: '#e8f2f8' })
      m.cylinder(0.11, 0.11, 0.05, { at: [x, h + 0.02, 0], color: lids[i % lids.length] })
      m.cylinder(0.07, 0.07, h * 0.5, { at: [x, h * 0.35, 0.04], color: ['#f0b85a', '#8a5a32', '#e86a4a', '#c8e070'][i % 4] })
    }
  }
}

const DUCK: Model = (m) => {
  m.sphere(0.13, { at: [0, 0.11, 0], scale: [1.3, 0.8, 1], color: '#ffd43a' })
  m.sphere(0.08, { at: [0.11, 0.25, 0], color: '#ffd43a' })
  m.cone(0.035, 0.08, { at: [0.21, 0.24, 0], rot: [0, 0, -Math.PI / 2], color: '#ff8a2a' })
  m.sphere(0.018, { at: [0.15, 0.28, 0.06], color: IRON })
}

function herbs(color: string): Model {
  return (m) => {
    m.cylinder(0.13, 0.1, 0.2, { at: [0, 0.1, 0], color: '#d9734a' })
    for (let i = 0; i < 5; i++) m.sphere(0.09, { at: [-0.1 + i * 0.05, 0.28 + 0.05 * (i % 2), 0.02 * (i % 3)], scale: [0.8, 1.2, 0.6], color })
  }
}

/** A cuckoo clock: a little wooden house with a face, its weights hanging on chains. */
const CLOCK: Model = (m) => {
  m.box(0.6, 0.6, 0.18, { at: [0, 0.3, 0], color: WOOD_DARK })
  m.extrude([[-0.42, 0.6], [0.42, 0.6], [0, 0.92]], 0.2, { color: '#5a3a22' })
  m.cylinder(0.2, 0.2, 0.03, { at: [0, 0.3, 0.1], rot: [Math.PI / 2, 0, 0], color: WHITE })
  m.box(0.02, 0.15, 0.02, { at: [0, 0.36, 0.13], color: IRON })
  m.box(0.11, 0.02, 0.02, { at: [0.05, 0.3, 0.13], color: IRON })
  m.box(0.12, 0.12, 0.02, { at: [0, 0.7, 0.11], color: '#2a1a10' })
  for (const x of [-0.15, 0.15]) {
    m.cylinder(0.008, 0.008, 0.6, { at: [x, -0.3, 0], color: BRASS })
    m.cylinder(0.05, 0.05, 0.18, { at: [x, -0.65, 0], color: BRASS })
  }
}

/** A framed picture of a smiling cow. */
const COW_PICTURE: Model = (m) => {
  m.box(0.9, 0.7, 0.05, { at: [0, 0.35, 0], color: WOOD })
  m.box(0.78, 0.58, 0.02, { at: [0, 0.35, 0.03], color: '#cfeec0' })
  m.sphere(0.2, { at: [0, 0.33, 0.05], scale: [1.2, 1, 0.2], color: WHITE })
  m.sphere(0.08, { at: [-0.1, 0.42, 0.07], scale: [1, 1, 0.2], color: IRON })
  m.sphere(0.1, { at: [0, 0.22, 0.08], scale: [1.4, 0.8, 0.2], color: '#f5b8b0' })
  for (const x of [-0.24, 0.24]) m.sphere(0.06, { at: [x, 0.52, 0.06], scale: [1.4, 0.7, 0.2], color: '#f2c45a' })
}

/** A pan or a ladle hanging from its hook on a rail, its handle up. */
function pan(r: number): Model {
  return (m) => {
    m.torus(0.05, 0.012, { at: [0, 0.9, 0], color: IRON })
    m.box(0.06, 0.5, 0.03, { at: [0, 0.6, 0], color: COPPER })
    m.cylinder(r, r, 0.05, { at: [0, 0.35 - r, 0], rot: [Math.PI / 2, 0, 0], color: COPPER })
    m.cylinder(r * 0.75, r * 0.75, 0.055, { at: [0, 0.35 - r, 0.002], rot: [Math.PI / 2, 0, 0], color: '#e8955a' })
  }
}

const LADLE: Model = (m) => {
  m.torus(0.05, 0.012, { at: [0, 0.9, 0], color: IRON })
  m.box(0.04, 0.7, 0.03, { at: [0, 0.5, 0], color: '#c9d3dc' })
  m.sphere(0.12, { at: [0, 0.12, 0], scale: [1, 0.7, 1], color: '#c9d3dc' })
}

/** A rail under the ceiling for the pans, `w` wide, hung from two rods. */
function rail(w: number): Model {
  return (m) => {
    m.cylinder(0.03, 0.03, w, { at: [0, 0, 0], rot: [0, 0, Math.PI / 2], color: BRASS })
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1]) m.cylinder(0.015, 0.015, 0.5, { at: [x, 0.25, 0], color: BRASS })
  }
}

/** A pendant lamp hung `drop` metres from the ceiling: a cord and a red shade with a glowing bulb. */
function pendant(drop: number): Model {
  return (m) => {
    m.cylinder(0.012, 0.012, drop, { at: [0, drop / 2, 0], color: IRON })
    m.cone(0.36, 0.3, { at: [0, 0.12, 0], color: RED })
    m.sphere(0.12, { at: [0, 0, 0], color: '#fff2c0', glow: true })
  }
}

/** A sun-catcher hung in the window: a glass star in rainbow colours. */
const SUN_CATCHER: Model = (m) => {
  m.cylinder(0.006, 0.006, 0.5, { at: [0, 0.6, 0], color: WHITE })
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? 0.2 : 0.09
    pts.push([r * cos(a), 0.2 + r * sin(a)])
  }
  m.extrude(pts, 0.03, { color: '#ffd84a', glow: true })
  m.sphere(0.05, { at: [0, 0.2, 0.03], color: '#ff7eb6', glow: true })
}

/** A little bird sitting in a tree. */
const BIRD: Model = (m) => {
  m.sphere(0.14, { at: [0, 0.14, 0], scale: [1.3, 1, 1], color: '#4a9fe0' })
  m.sphere(0.09, { at: [0.13, 0.26, 0], color: '#4a9fe0' })
  m.cone(0.03, 0.07, { at: [0.24, 0.26, 0], rot: [0, 0, -Math.PI / 2], color: '#ff9a2a' })
  m.sphere(0.02, { at: [0.17, 0.29, 0.07], color: IRON })
  m.sphere(0.07, { at: [-0.02, 0.14, 0.1], scale: [1.5, 0.6, 0.4], color: '#f2c45a' })
}

/** The garland along the top of the back wall: SPANS spans of SPAN metres, each sagging between its hooks, with BULBS_A_SPAN bulbs. */
const SPANS = 5
const SPAN = 2.4
const GARLAND_Y = 7.7
const BULBS_A_SPAN = 8
const BULBS = ['#ff6b6b', '#ffd23a', '#5bc0ff', '#7ee07e']
const sag = (t: number) => -0.3 * sin(Math.PI * t)

/** Where the bulbs of the span starting at x hang, in the room. */
function bulbsOf(x: number): Point[] {
  return Array.from({ length: BULBS_A_SPAN }, (_, j) => {
    const t = (j + 0.5) / BULBS_A_SPAN
    return [x + SPAN * t, GARLAND_Y + sag(t) - 0.08, -2.8]
  })
}

/** One span of the garland, from its hook at its foot: a cord and coloured bulbs that shine. */
const GARLAND: Model = (m) => {
  const cord: [number, number, number][] = []
  for (let j = 0; j <= 8; j++) cord.push([(SPAN * j) / 8, sag(j / 8), 0])
  m.tube(cord, 0.015, { color: '#3f5a3a' })
  for (let j = 0; j < BULBS_A_SPAN; j++) {
    const t = (j + 0.5) / BULBS_A_SPAN
    m.capsule(0.04, 0.06, { at: [SPAN * t, sag(t) - 0.08, 0.02], color: BULBS[j % BULBS.length], glow: true })
  }
}

export const look: LookCode = (r, room) => {
  const { solid, dressAs } = byName(r, room)
  const topOf = (s: SeenSolid) => s.at()[1] + s.size()[1] / 2

  // The furniture: the play's plain solids, dressed.
  dressAs('stool', stool)
  dressAs('stove', stove)
  dressAs('footstool', footstool)
  dressAs('counter', counter)

  // The tiled walls with teacups on them, and the window in the middle of the back wall.
  r.wallpaper(TEACUP)
  const stoveSolid = solid('stove')
  const sinkSolid = solid('counter')
  const [stoveX] = stoveSolid.at()
  const [sinkX] = sinkSolid.at()
  const stoveTop = topOf(stoveSolid)
  r.decor([0, 3.3, -2.9], window(2.6, 2.7))

  // Where the trees' branches are, from the lowest and highest still solids on each side above the furniture: the walls' things stay under the lowest.
  const branches = room.solids().filter((s) => s.name()?.startsWith('branch-') === true)
  const lowBranch = Math.min(...branches.map((s) => s.at()[1] - s.size()[1] / 2))
  const highBranch = Math.max(...branches.map(topOf))

  // Behind the stove a plate rack and behind the sink a shelf of jars, both under the lowest branch; a mouse hole and a broom.
  r.decor([stoveX, lowBranch - 0.75, -2.75], plateRack(1.6))
  r.decor([sinkX - 0.2, lowBranch - 0.75, -2.75], shelf(1.4))
  r.decor([-1.9, 0.08, -2.94], MOUSE_HOLE)
  r.decor([0, 0, 1.25], rug(4.2))

  // Props down low, which a player passes: the cat and the dog in their baskets in front, a mouse at its hole, the kettle on the stove's back, jars on the shelf, the broom, a duck by the sink and the herbs on the window's sill.
  r.prop([-2.2, 0, 1.25], CAT_BASKET, { react: 'hop', idle: 'pulse', sound: 'meow', puff: 'heart' })
  r.prop([2.3, 0, 1.25], DOG_BASKET, { react: 'hop', sound: 'woof', puff: 'heart' })
  r.prop([-1.55, 0, -2.85], MOUSE, { react: 'hop', idle: 'bob', sound: 'squeak' })
  r.prop([stoveX - 0.35, stoveTop, -1.15], KETTLE, { react: 'wobble', sound: 'whoosh', puff: 'smoke' })
  r.prop([sinkX - 0.2, lowBranch - 0.72, -2.75], jars(4), { react: 'wobble', sound: 'pluck' })
  r.prop([2.95, 0, -1.4], BROOM, { react: 'swing', sound: 'whoosh', puff: 'dust' })
  r.prop([sinkX - 0.45, topOf(sinkSolid), -1.15], DUCK, { react: 'hop', sound: 'squeak', puff: 'bubble' })
  for (const [x, c] of [[-0.75, '#4f9a4a'], [0, '#6cbf5a'], [0.75, '#3f8a5a']] as const) r.prop([x, 3.3, -2.7], herbs(c), { react: 'wobble', idle: 'sway', sound: 'cloth', puff: 'leaf' })

  // Props up high, which answer a tap or a flier going by: the clock and the cow picture beside the window, the pans and ladles on their rails, the pendant lamps, the sun-catcher, and a bird in each tree's crown.
  r.prop([-2.3, 4.6, -2.85], CLOCK, { react: 'swing', idle: 'sway', sound: 'tick', puff: 'note' })
  r.prop([2.3, 4.7, -2.88], COW_PICTURE, { react: 'wobble', sound: 'baa', puff: 'heart' })
  for (const side of [-1, 1]) {
    r.decor([side * 3.4, 7.35, -1.6], rail(1.6))
    r.prop([side * 2.95, 6.45, -1.6], pan(0.2), { react: 'swing', sound: 'ding' })
    r.prop([side * 3.4, 6.45, -1.6], LADLE, { react: 'swing', sound: 'xylophone' })
    r.prop([side * 3.85, 6.45, -1.6], pan(0.15), { react: 'swing', sound: 'bell' })
    r.prop([side * 1.6, 6.6, -1.5], pendant(1.4), { react: 'swing', sound: 'chime' })
    r.prop([side * 6.6, highBranch + 0.4, -2.2], BIRD, { react: 'hop', idle: 'bob', sound: 'tweet', puff: 'note' })
  }
  r.prop([0.55, 4.7, -2.75], SUN_CATCHER, { react: 'spin', idle: 'spin', sound: 'sparkle', puff: 'star' })

  // Lamps: the two pendants, and the oven's warm glow.
  for (const side of [-1, 1]) r.lamp([side * 1.6, 6.4, -1], { color: WARM, power: 0.7, reach: 7 })
  r.lamp([stoveX, 0.5, 1.2], { color: '#ffb347', power: 0.5, reach: 3 })

  // Small lights: a garland of coloured bulbs swung along the top of the back wall, each bulb with its twinkle, and a few twinkling in each tree's crown behind the play.
  for (let k = 0; k < SPANS; k++) {
    const x = -SPAN * SPANS / 2 + SPAN * k
    r.decor([x, GARLAND_Y, -2.85], GARLAND)
    r.lights(bulbsOf(x), { color: BULBS, size: 0.12, twinkle: true })
  }
  const crowns: Point[] = []
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const [u, v] = spread(i)
      crowns.push([side * (5.2 + 2.5 * u), highBranch + 0.2 + (7.6 - highBranch - 0.2) * v, -2.3])
    }
  }
  r.lights(crowns, { color: '#fff3b0', size: 0.1, twinkle: true })
}
