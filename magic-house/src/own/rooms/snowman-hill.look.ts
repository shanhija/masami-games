/**
 * Snow Castle's look (snowman-hill.ts), written by hand as the look's designer would write it
 * (engine/look.ts LookCode) and run through the same builder and check as a made look
 * (engine/lookBuilder.ts buildLook, trial/lookCheck.ts). The room is a hall of the snow castle: its
 * walls are ice blocks (the shell's blue squares) with white snowflakes on them, icicles hang along
 * the ceiling, and the hall is bright (light 0.9), lit by an ice chandelier and two ice lanterns,
 * with frost glinting on the walls and fairy lights under the ceiling.
 *
 * - The snowbanks, the play's two plain solids, are dressed as drifts of snow with lumps on them.
 * - Behind the play: an arched window behind each snowman, its night sky full of stars, so the
 *   white snowmen stand out against it; ice pillars on both sides of the rolling ground; snowy
 *   pine trees in tubs in the corners; a sled on the floor and a pair of skis on the wall; ice
 *   lanterns by the door, banners beside it and an ice crown over it. In front of it, a snow lump
 *   and ice crystals at the ends, in front of the snowbanks.
 * - Fifteen props answer a child in all four quarters: animals on the floor that a player passes
 *   (penguins, a brown hare, a brown bear cub, a red fox, a grey seal and a snow globe) and things up
 *   high that answer a tap or a player on the shelves (a snowy owl, hanging ice crystals, a
 *   snowflake mobile, a star lantern, the chandelier, ice bells and a frost star). None looks like a
 *   snowball, coal, a carrot, a hat, a scarf or a stick, the things the task is played with: the
 *   snowballs are white and round, so nothing white and round stands near where they roll, between
 *   the snowmen's rings, and nothing at all stands in front of that ground.
 *
 * It reads where things are from `room`, never from the room code's numbers: the snowbanks by name
 * and size, the snowmen's places as the room's steps' spots, the door by room.wayOut(). Its numbers
 * for where things stand keep inside LOOK_PLACE's bands: behind the play from the back wall to
 * z -1, in front of it from z 1, at most half a metre tall. No dice: its scatter comes from a fixed
 * sequence.
 */

import type { Point } from '../../engine/api'
import type { Model, RoomKit } from '../../engine/gift'
import type { LookCode } from '../../engine/look'
import { cos, sin } from '../../engine/math'
import { byName, spread } from './lookKit'

const SNOW = '#f7fbff'
const SNOW_SHADE = '#dceaf7'
const ICE = '#cdeafc'
const ICE_DEEP = '#93c4e8'
const FROST = '#eef8ff'
const NIGHT = '#1d3a73'
const PINE = '#2f7d5a'
const PINE_DARK = '#25664a'
const WOOD = '#a8643a'
const WOOD_DARK = '#7a4628'
const RED = '#e8473d'
const WARM = '#ffd27a'
const EYE = '#22222e'
const FUR = '#c48a5a'
const FUR_DARK = '#8a5a36'
const FOX_RED = '#f07a2a'
const BEAK = '#ff9a2a'

/** The wallpaper's motif: a snowflake of three crossed bars with a bead at each tip. */
const SNOWFLAKE: Model = (m) => {
  for (let i = 0; i < 3; i++) m.box(0.56, 0.05, 0.02, { at: [0, 0.3, 0], rot: [0, 0, (i * Math.PI) / 3], color: '#f4fbff' })
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3
    m.sphere(0.035, { at: [0.25 * cos(a), 0.3 + 0.25 * sin(a), 0], color: '#ffffff' })
  }
  m.sphere(0.05, { at: [0, 0.3, 0], color: '#ffffff' })
}

/** A snowbank dressed as a drift: a white wedge rising toward `rises` (-1 to the left, 1 to the right) with soft lumps along its slope, built to its solid. */
function drift(w: number, h: number, d: number, rises: number): Model {
  return (m) => {
    const high = (rises * w) / 2
    m.extrude([[-w / 2, 0], [w / 2, 0], [high, h]], d, { color: SNOW })
    m.extrude([[-w / 2, 0], [w / 2, 0], [high, h * 0.3]], d + 0.04, { color: SNOW_SHADE })
    for (let i = 0; i < 4; i++) {
      const t = 0.15 + i * 0.22
      const x = -high + 2 * high * t
      m.sphere(0.2, { at: [x, h * t - 0.06, -d / 2 + 0.3 + ((i * 0.53) % 1) * (d - 0.6)], scale: [1.3, 0.45, 1.1], color: i % 2 === 0 ? '#ffffff' : SNOW })
    }
  }
}

/** An arched window, its pane the night outside: w wide, its sill at the foot and its arch's top h up. */
function archedWindow(w: number, h: number): Model {
  return (m) => {
    const r = w / 2
    const side = h - r
    const arch: [number, number][] = [[-r, 0], [r, 0]]
    for (let i = 0; i <= 8; i++) arch.push([r * cos((i * Math.PI) / 8), side + r * sin((i * Math.PI) / 8)])
    m.extrude(arch, 0.02, { color: NIGHT })
    const frame: [number, number, number][] = [[-r, 0, 0.03]]
    for (let i = 8; i >= 0; i--) frame.push([r * cos((i * Math.PI) / 8), side + r * sin((i * Math.PI) / 8), 0.03])
    frame.push([r, 0, 0.03])
    m.tube(frame, 0.07, { color: FROST })
    m.box(w + 0.3, 0.12, 0.12, { at: [0, -0.02, 0.05], color: FROST })
    m.box(0.05, side + r - 0.05, 0.03, { at: [0, (side + r) / 2, 0.03], color: FROST })
    m.box(w - 0.05, 0.05, 0.03, { at: [0, side * 0.55, 0.03], color: FROST })
    for (const [x, y] of [[-r + 0.12, 0.12], [r - 0.12, 0.12], [-r + 0.1, 0.3]]) m.sphere(0.12, { at: [x, y, 0.03], scale: [1, 0.6, 0.2], color: '#ffffff' })
  }
}

/** An ice pillar from the floor to the cornice, with a base, frost rings and a capital. */
function pillar(h: number): Model {
  return (m) => {
    m.box(0.8, 0.25, 0.5, { at: [0, 0.125, 0], color: FROST })
    m.cylinder(0.24, 0.27, h - 0.6, { at: [0, h / 2, 0], color: ICE_DEEP })
    for (let i = 1; i < 4; i++) m.torus(0.27, 0.035, { at: [0, (h * i) / 4, 0], rot: [Math.PI / 2, 0, 0], color: FROST })
    m.box(0.8, 0.3, 0.5, { at: [0, h - 0.2, 0], color: FROST })
  }
}

/** A snowy pine tree in a wooden tub. */
const PINE_TREE: Model = (m) => {
  m.cylinder(0.32, 0.26, 0.4, { at: [0, 0.2, 0], color: WOOD })
  m.torus(0.31, 0.03, { at: [0, 0.32, 0], rot: [Math.PI / 2, 0, 0], color: WOOD_DARK })
  m.cylinder(0.08, 0.1, 0.4, { at: [0, 0.55, 0], color: WOOD_DARK })
  for (let i = 0; i < 3; i++) {
    const r = 0.62 - i * 0.16
    const y = 0.75 + i * 0.55
    m.cone(r, 0.8, { at: [0, y + 0.4, 0], color: i % 2 === 0 ? PINE : PINE_DARK })
    m.cone(r * 0.7, 0.3, { at: [0, y + 0.62, 0], color: '#ffffff' })
  }
  m.sphere(0.12, { at: [0, 2.6, 0], color: '#ffffff' })
}

/** A red sled standing on the floor, its runners curling up at the front. */
const SLED: Model = (m) => {
  m.box(1.0, 0.08, 0.44, { at: [-0.05, 0.3, 0], color: RED })
  for (let i = 0; i < 4; i++) m.box(0.06, 0.09, 0.46, { at: [-0.45 + i * 0.27, 0.31, 0], color: '#c4352d' })
  for (const z of [-0.18, 0.18]) {
    m.tube([[-0.6, 0.04, z], [0.4, 0.04, z], [0.58, 0.14, z], [0.6, 0.34, z], [0.48, 0.42, z]], 0.03, { color: '#c9d4e0' })
    for (const x of [-0.35, 0.25]) m.box(0.04, 0.24, 0.04, { at: [x, 0.16, z], color: '#c9d4e0' })
  }
  m.tube([[0.45, 0.36, -0.18], [0.62, 0.5, 0], [0.45, 0.36, 0.18]], 0.015, { color: '#f2e2b8' })
}

/** A pair of skis and poles crossed on the wall. */
const SKIS: Model = (m) => {
  for (const s of [-1, 1]) {
    m.box(0.1, 1.8, 0.03, { at: [s * 0.18, 1.1, 0], rot: [0, 0, s * 0.18], color: s < 0 ? '#3d8bff' : '#ffb03a' })
    m.cylinder(0.02, 0.02, 1.4, { at: [s * 0.42, 0.85, 0.03], rot: [0, 0, -s * 0.25], color: '#7a8496' })
    m.torus(0.06, 0.012, { at: [s * 0.58, 0.2, 0.03], color: '#7a8496' })
  }
}

/** An ice lantern on the floor: a block of ice with a candle glowing in it. */
const ICE_LANTERN: Model = (m) => {
  m.box(0.4, 0.5, 0.36, { at: [0, 0.25, 0], color: ICE })
  m.box(0.46, 0.06, 0.4, { at: [0, 0.52, 0], color: FROST })
  m.cylinder(0.06, 0.06, 0.14, { at: [0, 0.2, 0.19], color: '#fff6e0' })
  m.sphere(0.06, { at: [0, 0.32, 0.2], scale: [0.7, 1.2, 0.7], color: WARM, glow: true })
}

/** Icicles all along the ceiling, from x0 to x1, hanging from y top. */
function icicles(x0: number, x1: number, top: number): Model {
  return (m) => {
    const n = Math.round((x1 - x0) / 0.32)
    for (let i = 0; i <= n; i++) {
      const long = 0.25 + 0.35 * (((i * 7) % 5) / 4)
      m.cone(0.07, long, { at: [x0 + ((x1 - x0) * i) / n, top - long / 2, 0], rot: [Math.PI, 0, 0], color: i % 3 === 0 ? FROST : ICE })
    }
  }
}

/** A castle banner hung from the cornice, `long` metres down to its pointed end, with a snowflake on it. */
function banner(long: number): Model {
  return (m) => {
    m.box(0.9, 0.08, 0.08, { at: [0, long, 0.04], color: FROST })
    m.extrude([[-0.38, long], [0.38, long], [0.38, 0.35], [0, 0], [-0.38, 0.35]], 0.03, { color: '#3d6fd8' })
    m.extrude([[-0.3, long - 0.12], [0.3, long - 0.12], [0.3, long - 0.3], [-0.3, long - 0.3]], 0.04, { color: '#ffffff' })
    for (let i = 0; i < 3; i++) m.box(0.42, 0.05, 0.02, { at: [0, long * 0.55, 0.03], rot: [0, 0, (i * Math.PI) / 3], color: '#ffffff' })
  }
}

/** An ice crown over the castle's door. */
const CROWN: Model = (m) => {
  m.box(1.1, 0.22, 0.12, { at: [0, 0.11, 0], color: ICE_DEEP })
  for (let i = 0; i < 5; i++) {
    const x = -0.44 + i * 0.22
    const tall = i % 2 === 0 ? 0.34 : 0.24
    m.cone(0.09, tall, { at: [x, 0.22 + tall / 2, 0], color: ICE })
    m.sphere(0.045, { at: [x, 0.24 + tall, 0], color: '#ffffff', glow: true })
  }
  m.sphere(0.07, { at: [0, 0.11, 0.07], color: '#7fc8ff', glow: true })
}

/** A lump of snow for the front edge, low. */
const LUMP: Model = (m) => {
  m.sphere(0.28, { at: [0, 0.13, 0], scale: [1.4, 0.45, 0.6], color: SNOW })
  m.sphere(0.16, { at: [0.25, 0.08, 0.02], scale: [1.2, 0.5, 0.7], color: '#ffffff' })
}

/** A little cluster of ice crystals for the front edge, low. */
const CRYSTALS: Model = (m) => {
  for (const [x, h, a] of [[-0.12, 0.34, 0.25], [0.04, 0.44, -0.1], [0.16, 0.26, -0.4]]) m.cone(0.07, h, { at: [x, h / 2, 0], rot: [0, 0, a], color: ICE })
  m.sphere(0.12, { at: [0, 0.03, 0], scale: [1.4, 0.3, 0.6], color: SNOW })
}

// ------------------------------------------------------------------------------ props

const PENGUIN: Model = (m) => {
  m.sphere(0.22, { at: [0, 0.3, 0], scale: [1, 1.35, 0.9], color: '#2a2f45' })
  m.sphere(0.17, { at: [0, 0.27, 0.07], scale: [1, 1.3, 0.8], color: '#ffffff' })
  m.sphere(0.13, { at: [0, 0.64, 0], color: '#2a2f45' })
  m.sphere(0.03, { at: [-0.05, 0.67, 0.11], color: '#ffffff' })
  m.sphere(0.03, { at: [0.05, 0.67, 0.11], color: '#ffffff' })
  m.cone(0.04, 0.1, { at: [0, 0.61, 0.15], rot: [Math.PI / 2, 0, 0], color: BEAK })
  for (const x of [-0.08, 0.08]) m.sphere(0.06, { at: [x, 0.03, 0.06], scale: [1, 0.4, 1.4], color: BEAK })
}

/** A brown hare with a white tail: brown, so it never reads as a snowball. */
const HARE: Model = (m) => {
  m.sphere(0.2, { at: [0, 0.18, 0], scale: [1.2, 0.85, 0.9], color: FUR })
  m.sphere(0.12, { at: [0.2, 0.34, 0], color: FUR })
  for (const z of [-0.04, 0.04]) m.capsule(0.035, 0.18, { at: [0.18, 0.54, z], rot: [0, 0, 0.2], color: FUR_DARK })
  m.sphere(0.022, { at: [0.28, 0.37, 0.07], color: EYE })
  m.sphere(0.02, { at: [0.32, 0.32, 0], color: '#ff9fb0' })
  m.sphere(0.06, { at: [-0.24, 0.22, 0], color: SNOW_SHADE })
}

/** A brown bear cub in a red scarf. */
const BEAR: Model = (m) => {
  m.sphere(0.3, { at: [0, 0.3, 0], scale: [1.25, 0.95, 0.9], color: FUR_DARK })
  m.sphere(0.18, { at: [0.32, 0.48, 0], color: FUR_DARK })
  for (const z of [-0.1, 0.1]) m.sphere(0.06, { at: [0.28, 0.64, z], color: FUR_DARK })
  m.sphere(0.07, { at: [0.47, 0.45, 0], scale: [1, 0.8, 1], color: FUR })
  m.sphere(0.03, { at: [0.53, 0.47, 0], color: EYE })
  m.sphere(0.025, { at: [0.4, 0.54, 0.12], color: EYE })
  m.torus(0.13, 0.04, { at: [0.3, 0.36, 0], rot: [0, 0, 0.4], color: RED })
  for (const x of [-0.2, 0.2]) m.sphere(0.1, { at: [x, 0.08, 0.1], scale: [1, 0.6, 1], color: FUR })
}

/** A red fox with a white tip to its tail. */
const FOX: Model = (m) => {
  m.sphere(0.2, { at: [0, 0.22, 0], scale: [1.3, 0.8, 0.8], color: FOX_RED })
  m.sphere(0.13, { at: [0.26, 0.36, 0], color: FOX_RED })
  m.cone(0.07, 0.16, { at: [0.4, 0.33, 0], rot: [0, 0, -Math.PI / 2], color: FOX_RED })
  m.sphere(0.025, { at: [0.48, 0.33, 0], color: EYE })
  for (const z of [-0.06, 0.06]) m.cone(0.05, 0.12, { at: [0.24, 0.52, z], color: FOX_RED })
  m.capsule(0.08, 0.3, { at: [-0.32, 0.26, 0], rot: [0, 0, 1.0], color: FOX_RED })
  m.sphere(0.08, { at: [-0.47, 0.37, 0], color: '#ffffff' })
}

const SEAL: Model = (m) => {
  m.capsule(0.16, 0.4, { at: [0, 0.22, 0], rot: [0, 0, Math.PI / 2 - 0.25], color: '#7d8ba0' })
  m.sphere(0.13, { at: [0.3, 0.33, 0], color: '#7d8ba0' })
  m.sphere(0.025, { at: [0.38, 0.37, 0.1], color: EYE })
  m.sphere(0.04, { at: [0.42, 0.31, 0], color: '#5a6478' })
  m.sphere(0.1, { at: [-0.33, 0.06, 0], scale: [1.2, 0.3, 1.5], color: '#9aa8ba' })
}

/** A snow globe with a tiny castle in it, on an ice stand. */
const GLOBE: Model = (m) => {
  m.cylinder(0.18, 0.24, 0.8, { at: [0, 0.4, 0], color: ICE_DEEP })
  m.cylinder(0.2, 0.2, 0.1, { at: [0, 0.85, 0], color: WOOD })
  m.sphere(0.26, { at: [0, 1.12, 0], color: '#d8eeff' })
  m.box(0.16, 0.14, 0.1, { at: [0, 1.0, 0], color: '#ffffff' })
  m.cone(0.06, 0.12, { at: [0, 1.13, 0], color: '#3d8bff' })
}

const OWL: Model = (m) => {
  m.box(0.6, 0.06, 0.3, { at: [0, 0.03, 0], color: FROST })
  m.sphere(0.22, { at: [0, 0.3, 0], scale: [1, 1.2, 0.9], color: '#ffffff' })
  for (const x of [-0.08, 0.08]) {
    m.sphere(0.07, { at: [x, 0.38, 0.17], color: '#ffe066' })
    m.sphere(0.032, { at: [x, 0.38, 0.23], color: EYE })
  }
  m.cone(0.03, 0.07, { at: [0, 0.3, 0.2], rot: [Math.PI / 2, 0, 0], color: '#3a3a3a' })
  for (let i = 0; i < 3; i++) m.sphere(0.025, { at: [-0.08 + i * 0.08, 0.18, 0.19], color: '#9aa3b0' })
}

/** Something hung from the ceiling: its string reaches up from its foot `drop` metres. */
function hung(drop: number, body: (m: RoomKit) => void): Model {
  return (m) => {
    m.cylinder(0.012, 0.012, drop, { at: [0, drop / 2, 0], color: '#dfe8f4' })
    body(m)
  }
}

const CRYSTAL = (drop: number): Model =>
  hung(drop, (m) => {
    m.cone(0.14, 0.32, { at: [0, 0.16, 0], rot: [Math.PI, 0, 0], color: ICE, glow: true })
    m.cone(0.14, 0.2, { at: [0, 0.42, 0], color: ICE, glow: true })
  })

const MOBILE = (drop: number): Model =>
  hung(drop, (m) => {
    m.box(1, 0.03, 0.03, { at: [0, 0.6, 0], color: FROST })
    for (const [x, y] of [[-0.45, 0.25], [0, 0.12], [0.45, 0.3]]) {
      m.cylinder(0.008, 0.008, 0.6 - y, { at: [x, (0.6 + y) / 2, 0], color: FROST })
      for (let i = 0; i < 3; i++) m.box(0.26, 0.03, 0.02, { at: [x, y, 0], rot: [0, 0, (i * Math.PI) / 3], color: '#ffffff' })
    }
  })

const STAR_LANTERN = (drop: number): Model =>
  hung(drop, (m) => {
    const pts: [number, number][] = []
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 === 0 ? 0.26 : 0.11
      pts.push([r * cos(a), 0.26 + r * sin(a)])
    }
    m.extrude(pts, 0.1, { color: WARM, glow: true })
  })

const CHANDELIER = (drop: number): Model =>
  hung(drop, (m) => {
    m.torus(0.55, 0.05, { at: [0, 0.35, 0], rot: [Math.PI / 2, 0, 0], color: FROST })
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3
      const [x, z] = [0.55 * cos(a), 0.2 * sin(a)]
      m.cone(0.06, 0.3, { at: [x, 0.2, z], rot: [Math.PI, 0, 0], color: ICE })
      m.sphere(0.05, { at: [x, 0.45, z], scale: [0.7, 1.2, 0.7], color: WARM, glow: true })
    }
    m.cone(0.12, 0.5, { at: [0, 0.1, 0], rot: [Math.PI, 0, 0], color: ICE, glow: true })
    for (const a of [0, Math.PI / 2]) m.cylinder(0.01, 0.01, 0.6, { at: [0, 0.65, 0], rot: [0, a, 0.42], color: '#dfe8f4' })
  })

const BELLS = (drop: number): Model =>
  hung(drop, (m) => {
    m.box(0.7, 0.04, 0.04, { at: [0, 0.55, 0], color: FROST })
    for (const x of [-0.25, 0, 0.25]) {
      m.cylinder(0.008, 0.008, 0.25, { at: [x, 0.42, 0], color: FROST })
      m.lathe([[0.02, 0.3], [0.08, 0.26], [0.1, 0.16], [0.13, 0.1]], { at: [x, 0, 0], color: '#bfe6ff' })
      m.sphere(0.03, { at: [x, 0.09, 0], color: WARM })
    }
    m.torus(0.08, 0.02, { at: [0, 0.6, 0], color: RED })
  })

/** A star of frost on the wall, shining. */
const FROST_STAR: Model = (m) => {
  for (let i = 0; i < 4; i++) m.box(0.7, 0.07, 0.03, { at: [0, 0.35, 0], rot: [0, 0, (i * Math.PI) / 4], color: '#ffffff', glow: i % 2 === 0 })
  m.sphere(0.1, { at: [0, 0.35, 0.02], color: '#e6f6ff', glow: true })
}

export const look: LookCode = (r, room) => {
  const { solid } = byName(r, room)
  const door = room.wayOut()

  // The snowbanks, dressed as drifts.
  for (const name of ['left snowbank', 'right snowbank']) {
    const bank = solid(name)
    const [w, h, d] = bank.size()
    r.dress(bank, drift(w, h, d, bank.at()[0] < 0 ? -1 : 1))
  }

  // The walls: snowflakes, icicles along the ceiling, and the snowmen's windows to the starry night behind them (the rings are the steps' spots).
  r.wallpaper(SNOWFLAKE)
  r.decor([0, 0, -2.85], icicles(-7.7, 7.7, 7.6))
  const snowmenX = [...new Set(room.spots().map((p) => p[0]))]
  for (const x of snowmenX) r.decor([x, 0.45, -2.94], archedWindow(1.8, 3.6))

  // Ice pillars both sides of the rolling ground, pines in the corners, a sled on the floor and skis on the wall, and ice lanterns by the door.
  for (const x of [-3.2, 3.2]) r.decor([x, 0, -2.65], pillar(7.6))
  for (const x of [-7.25, 7.25]) r.decor([x, 0, -2.2], PINE_TREE)
  r.decor([6.3, 0, -2.3], SLED)
  r.decor([2.15, 0.4, -2.9], SKIS)
  for (const x of [door[0] - 1.2, door[0] + 1.2]) r.decor([x, 0, -2.5], ICE_LANTERN)
  // It is a castle: banners beside the door and a crown of ice over it.
  for (const x of [door[0] - 1.75, door[0] + 1.75]) r.decor([x, 4.4, -2.9], banner(3))
  r.decor([door[0], 2.75, -2.9], CROWN)

  // In front of the play only at the ends, in front of the snowbanks: the ground between the rings, where the snowballs roll, stays clear in front.
  r.decor([-7.45, 0, 1.25], LUMP)
  r.decor([7.45, 0, 1.25], CRYSTALS)

  // Props on the floor, which a player passes: in colours that never read as a snowball, and none in front of the rolling ground.
  r.prop([-1.8, 0, -1.4], PENGUIN, { react: 'hop', idle: 'sway', sound: 'squeak', puff: 'snow' })
  r.prop([-3.95, 0, -1.3], HARE, { react: 'hop', sound: 'boing', puff: 'snow' })
  r.prop([-6.5, 0, 1.25], SEAL, { react: 'wobble', sound: 'squeak', puff: 'bubble' })
  r.prop([-6.2, 0, -2.5], GLOBE, { react: 'spin', sound: 'xylophone', puff: 'snow' })
  r.prop([1.8, 0, -1.5], BEAR, { react: 'wobble', idle: 'bob', sound: 'giggle', puff: 'heart' })
  r.prop([3.95, 0, -1.3], FOX, { react: 'hop', sound: 'squeak', puff: 'snow' })
  r.prop([6.6, 0, 1.25], PENGUIN, { react: 'hop', idle: 'sway', sound: 'squeak', puff: 'snow', scale: 0.7 })

  // Props up high, which answer a tap or a player on the shelves.
  r.prop([-5.0, 6.0, -2.7], OWL, { react: 'spin', idle: 'sway', sound: 'tweet', puff: 'snow' })
  r.prop([-6.8, 6.3, -1.5], STAR_LANTERN(1.2), { react: 'swing', sound: 'chime' })
  r.prop([-3.2, 6.5, -1.6], CRYSTAL(1.0), { react: 'swing', idle: 'sway', sound: 'chime', puff: 'spark' })
  r.prop([-1.6, 6.4, -1.8], MOBILE(1.0), { react: 'spin', idle: 'spin', sound: 'sparkle' })
  r.prop([0.9, 6.2, -1.8], CHANDELIER(0.9), { react: 'swing', sound: 'chime', puff: 'spark' })
  r.prop([3.2, 6.5, -1.6], BELLS(0.9), { react: 'swing', idle: 'sway', sound: 'bell', puff: 'note' })
  r.prop([5.6, 6.4, -1.6], CRYSTAL(1.1), { react: 'swing', idle: 'sway', sound: 'chime', puff: 'spark' })
  r.prop([7.0, 5.3, -2.8], FROST_STAR, { react: 'blink', idle: 'pulse', sound: 'sparkle', puff: 'star' })

  // Lamps: the chandelier and the two ice lanterns.
  r.lamp([0.9, 6.0, -1.3], { color: '#eaf6ff', power: 0.7, reach: 9 })
  for (const x of [door[0] - 1.2, door[0] + 1.2]) r.lamp([x, 0.7, -2.0], { color: WARM, power: 0.45, reach: 4 })

  // Small lights: frost glinting on the walls, stars in the windows and fairy lights under the ceiling.
  const glints: Point[] = []
  for (let i = 0; glints.length < 40; i++) {
    const [u, v] = spread(i)
    const at: Point = [-7.8 + 15.6 * u, 0.4 + 6.9 * v, -2.96]
    const inWindow = snowmenX.some((x) => Math.abs(at[0] - x) < 1.1 && at[1] < 4.3)
    if (inWindow || (Math.abs(at[0] - door[0]) < 1 && at[1] < door[1] + 2.6)) continue
    glints.push(at)
  }
  r.lights(glints, { color: ['#ffffff', '#dff4ff', '#bfe8ff'], size: 0.08, twinkle: true })
  const stars: Point[] = []
  for (const x of snowmenX) {
    for (let i = 0; i < 22; i++) {
      const [u, v] = spread(i + 300)
      stars.push([x - 0.7 + 1.4 * u, 0.8 + 2.9 * v, -2.9])
    }
  }
  r.lights(stars, { color: ['#ffffff', '#fff3c4'], size: 0.1, twinkle: true })
  const swag: Point[] = []
  for (let k = 0; k < 6; k++) {
    for (let j = 0; j < 8; j++) {
      const t = j / 8
      swag.push([-7.8 + 2.6 * (k + t), 7.15 - 0.45 * sin(Math.PI * t), -2.6])
    }
  }
  r.lights(swag, { color: ['#ff8fb8', '#8fd8ff', '#fff07a', '#a8ff9f', '#c9a8ff'], size: 0.13, twinkle: true })
}
