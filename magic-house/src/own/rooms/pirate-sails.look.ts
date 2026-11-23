/**
 * Pirate Sails' look (pirate-sails.ts), written by hand as the look's designer would write it
 * (engine/look.ts LookCode) and run through the same builder and check as a made look
 * (engine/lookBuilder.ts buildLook, trial/lookCheck.ts). The room is the inside of a pirate ship:
 * its walls are painted planks (the shell's blue stripes) between dark wooden ribs, with anchors on
 * them as wallpaper, round portholes onto the sea, a treasure map and a ship's clock; bunting and a
 * string of little bulbs run under the ceiling, and lanterns hang from it.
 *
 * - The furniture is the play's plain solids dressed: the stern as the captain's cabin with its gold
 *   rail and lit round windows, the bow as the forecastle with an anchor and a gold figure star.
 * - Behind the play, wooden ribs up the walls, portholes, the map, a hammock under the ceiling and a
 *   fishing net in the corner; in front of it, a low rail with kegs and a lifebuoy, at the stern and the bow, off the starts and the ropes on the deck.
 * - Props answer a child in all four quarters: low down a ship's wheel on the stern, a bell on the
 *   bow, a telescope, a globe, the ship's cat, an octopus in a tub and a crab; up high a parrot on its
 *   perch, three lanterns, a compass on the wall, a fish on a plaque and a starfish in the net. None
 *   looks like a rope, a sail, the flag or the treasure chest, the things the task is played with.
 * - Four lamps: the three lanterns and one over the map; small lights are the bulbs under the
 *   ceiling and the glints in the portholes.
 *
 * It reads where things are from `room`, never from the room code's numbers: the stern and the bow
 * by name and size, the masts as the crow's nests (the highest of the play's solids), the door by
 * room.wayOut() and the starts by room.starts(). Its numbers for where things stand keep inside
 * LOOK_PLACE's bands: behind the play from the back wall to z -1, in front of it from z 1, at most
 * half a metre tall. No dice.
 */

import type { Point } from '../../engine/api'
import type { Model, RoomKit } from '../../engine/gift'
import type { LookCode, SeenSolid } from '../../engine/look'
import { cos, sin } from '../../engine/math'
import { byName } from './lookKit'

const WOOD = '#8a5a32'
const WOOD_DARK = '#5a3820'
const WOOD_LIGHT = '#a8743f'
const GOLD = '#e8b84a'
const BRASS = '#d9a640'
const SEA = '#7fd0ff'
const RED = '#e2474b'
const WHITE = '#fbf6ea'
const WARM = '#ffd98a'

/** A round window: a brass ring round glass that shines, facing +z, r in radius. */
function roundWindow(m: RoomKit, at: Point, r: number, glass: string): void {
  m.cylinder(r, r, 0.04, { at: [at[0], at[1], at[2]], rot: [Math.PI / 2, 0, 0], color: glass, glow: true })
  m.torus(r, r * 0.22, { at: [at[0], at[1], at[2] + 0.02], color: BRASS })
}

/** The stern dressed as the captain's cabin: planked wood under a gold-trimmed top, with two lit round windows, built to its solid. */
function cabin(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.12, d, { at: [0, (h - 0.12) / 2, 0], color: WOOD })
    m.box(w + 0.12, 0.12, d + 0.12, { at: [0, h - 0.06, 0], color: WOOD_LIGHT })
    for (let i = 1; i < 4; i++) m.box(w, 0.03, 0.02, { at: [0, (h * i) / 4 - 0.1, d / 2 + 0.01], color: WOOD_DARK })
    m.box(w + 0.12, 0.08, 0.03, { at: [0, h - 0.2, d / 2 + 0.05], color: GOLD })
    for (const x of [-w / 4, w / 4]) roundWindow(m, [x, h * 0.45, d / 2 + 0.03], 0.2, WARM)
  }
}

/** The bow dressed as the forecastle: planks, a gold band, an anchor hanging on its front and a gold star at its tip, built to its solid. */
function forecastle(w: number, h: number, d: number): Model {
  return (m) => {
    m.box(w, h - 0.1, d, { at: [0, (h - 0.1) / 2, 0], color: WOOD })
    m.box(w + 0.1, 0.1, d + 0.1, { at: [0, h - 0.05, 0], color: WOOD_LIGHT })
    for (let i = 1; i < 3; i++) m.box(w, 0.03, 0.02, { at: [0, (h * i) / 3 - 0.08, d / 2 + 0.01], color: WOOD_DARK })
    m.box(w + 0.1, 0.07, 0.03, { at: [0, h - 0.17, d / 2 + 0.05], color: GOLD })
    // The anchor on the front, its ring up.
    const z = d / 2 + 0.04
    m.torus(0.08, 0.025, { at: [-w / 4, h * 0.72, z], color: '#3a3a44' })
    m.box(0.06, 0.42, 0.04, { at: [-w / 4, h * 0.45, z], color: '#3a3a44' })
    m.box(0.28, 0.05, 0.04, { at: [-w / 4, h * 0.6, z], color: '#3a3a44' })
    m.torus(0.16, 0.03, { at: [-w / 4, h * 0.3, z], rot: [0, 0, Math.PI], scale: [1, 0.8, 1], color: '#3a3a44' })
    m.extrude(starOutline(0.16, 0.07, 0), 0.04, { at: [w / 4, h * 0.42, z], color: GOLD, glow: true })
  }
}

/** A five-pointed star's outline round [0, lift], r out to its points and inner in to its dents. */
function starOutline(r: number, inner: number, lift: number): [number, number][] {
  const pts: [number, number][] = []
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5
    const k = i % 2 === 0 ? r : inner
    pts.push([k * cos(a), lift + k * sin(a)])
  }
  return pts
}

/** The wallpaper's motif: a small anchor, its ring up. */
const ANCHOR: Model = (m) => {
  const c = '#9cc4e0'
  m.torus(0.06, 0.018, { at: [0, 0.52, 0], color: c })
  m.box(0.04, 0.4, 0.02, { at: [0, 0.27, 0], color: c })
  m.box(0.24, 0.04, 0.02, { at: [0, 0.4, 0], color: c })
  m.torus(0.16, 0.022, { at: [0, 0.2, 0], rot: [0, 0, Math.PI], scale: [1, 0.8, 1], color: c })
  m.cone(0.045, 0.1, { at: [-0.16, 0.2, 0], color: c })
  m.cone(0.045, 0.1, { at: [0.16, 0.2, 0], color: c })
}

/** A wooden rib of the ship's side, up the back wall from the floor to the ceiling. */
const RIB: Model = (m) => {
  m.box(0.22, 7.6, 0.06, { at: [0, 3.8, 0], color: WOOD_DARK })
  for (const y of [1.2, 3.8, 6.4]) m.sphere(0.04, { at: [0, y, 0.04], color: BRASS })
}

/** A porthole onto the sea: a brass ring, blue glass that shines a little and a fish swimming by. */
const PORTHOLE: Model = (m) => {
  roundWindow(m, [0, 0.4, 0], 0.36, SEA)
  m.sphere(0.08, { at: [0.04, 0.36, 0.03], scale: [1.4, 0.8, 0.3], color: '#ff9a3a' })
  m.cone(0.05, 0.08, { at: [-0.1, 0.36, 0.03], rot: [0, 0, Math.PI / 2], color: '#ff9a3a' })
}

/** The treasure map on the wall: parchment with islands, a dotted path and a red cross. */
const MAP: Model = (m) => {
  m.box(2, 1.3, 0.03, { at: [0, 0.65, 0], color: '#f2deb0' })
  m.box(2.1, 0.06, 0.04, { at: [0, 1.3, 0], color: WOOD_DARK })
  m.box(2.1, 0.06, 0.04, { at: [0, 0, 0], color: WOOD_DARK })
  m.sphere(0.3, { at: [-0.5, 0.75, 0.02], scale: [1.3, 0.8, 0.1], color: '#8cc77a' })
  m.sphere(0.24, { at: [0.55, 0.45, 0.02], scale: [1.2, 0.9, 0.1], color: '#8cc77a' })
  for (let i = 0; i < 6; i++) m.box(0.07, 0.03, 0.02, { at: [-0.3 + i * 0.14, 0.72 - i * 0.05, 0.03], color: '#8a5a32' })
  m.box(0.22, 0.05, 0.02, { at: [0.55, 0.45, 0.04], rot: [0, 0, 0.8], color: RED })
  m.box(0.22, 0.05, 0.02, { at: [0.55, 0.45, 0.04], rot: [0, 0, -0.8], color: RED })
}

/** A hammock slung under the ceiling between two hooks, with a striped pillow. */
const HAMMOCK: Model = (m) => {
  const path: [number, number, number][] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    path.push([-1.1 + 2.2 * t, 0.5 - 0.5 * sin(Math.PI * t), 0])
  }
  m.tube(path, 0.12, { color: '#e9d7a8' })
  m.sphere(0.18, { at: [-0.65, 0.3, 0.05], scale: [1.2, 0.6, 0.6], color: RED })
  m.cylinder(0.015, 0.015, 0.5, { at: [-1.1, 0.75, 0], color: '#c9b089' })
  m.cylinder(0.015, 0.015, 0.5, { at: [1.1, 0.75, 0], color: '#c9b089' })
}

/** A fishing net hung in a corner: crossed cords. */
const NET: Model = (m) => {
  for (let i = 0; i < 5; i++) m.box(0.025, 1.4, 0.02, { at: [-0.6 + i * 0.3, 0.7, 0], rot: [0, 0, 0.25], color: '#c9b089' })
  for (let i = 0; i < 5; i++) m.box(0.025, 1.4, 0.02, { at: [-0.6 + i * 0.3, 0.7, 0.01], rot: [0, 0, -0.25], color: '#c9b089' })
  m.cylinder(0.03, 0.03, 1.6, { at: [0, 1.42, 0.02], rot: [0, 0, Math.PI / 2], color: WOOD_DARK })
}

/** A string of pennants, `w` long, sagging in the middle. */
function bunting(w: number): Model {
  return (m) => {
    const colors = [RED, '#ffd23a', '#4fa3d9', WHITE]
    const n = Math.round(w / 0.45)
    m.cylinder(0.012, 0.012, w, { at: [0, 0, 0], rot: [0, 0, Math.PI / 2], color: '#c9b089' })
    for (let i = 0; i < n; i++) {
      const x = -w / 2 + (w * (i + 0.5)) / n
      const y = -0.25 * sin((Math.PI * (i + 0.5)) / n)
      m.extrude([[-0.15, 0], [0.15, 0], [0, -0.3]], 0.02, { at: [x, y, 0], color: colors[i % colors.length] })
    }
  }
}

/** A low rail along the front of the deck, `w` long: posts and a top rail. */
function rail(w: number): Model {
  return (m) => {
    m.box(w, 0.08, 0.1, { at: [0, 0.38, 0], color: WOOD_LIGHT })
    const n = Math.max(2, Math.round(w / 0.5) + 1)
    for (let i = 0; i < n; i++) m.box(0.07, 0.34, 0.07, { at: [-w / 2 + 0.05 + ((w - 0.1) * i) / (n - 1), 0.17, 0], color: WOOD })
  }
}

/** A small keg lying on the deck, banded in iron. */
const KEG: Model = (m) => {
  m.cylinder(0.2, 0.2, 0.36, { at: [0, 0.2, 0], rot: [0, 0, Math.PI / 2], scale: [1, 1.15, 1], color: WOOD })
  for (const x of [-0.12, 0.12]) m.torus(0.21, 0.02, { at: [x, 0.2, 0], rot: [0, Math.PI / 2, 0], color: '#4a4a52' })
}

/** Shells and a starfish, low on the deck. */
const SHELLS: Model = (m) => {
  m.extrude(starOutline(0.16, 0.07, 0), 0.04, { at: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0], color: '#ff8a6a' })
  m.sphere(0.08, { at: [0.25, 0.05, 0.05], scale: [1, 0.6, 0.8], color: '#ffe0c8' })
  m.sphere(0.06, { at: [-0.22, 0.04, -0.02], scale: [1, 0.6, 0.8], color: '#f5c6e0' })
}

// ------------------------------------------------------------------------------ props

/** The ship's wheel on a post, its eight handles round the rim. */
const WHEEL: Model = (m) => {
  m.box(0.12, 0.6, 0.12, { at: [0, 0.3, 0], color: WOOD_DARK })
  m.torus(0.34, 0.04, { at: [0, 0.82, 0.08], color: WOOD_LIGHT })
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    m.box(0.04, 0.88, 0.03, { at: [0, 0.82, 0.08], rot: [0, 0, a], color: WOOD })
    m.sphere(0.05, { at: [0.45 * cos(a), 0.82 + 0.45 * sin(a), 0.08], color: WOOD_LIGHT })
  }
  m.sphere(0.08, { at: [0, 0.82, 0.1], color: BRASS })
}

/** The ship's bell under a little wooden arch. */
const BELL: Model = (m) => {
  m.box(0.08, 1.1, 0.08, { at: [-0.3, 0.55, 0], color: WOOD_DARK })
  m.box(0.08, 1.1, 0.08, { at: [0.3, 0.55, 0], color: WOOD_DARK })
  m.box(0.7, 0.08, 0.1, { at: [0, 1.12, 0], color: WOOD })
  m.cylinder(0.1, 0.2, 0.3, { at: [0, 0.88, 0], color: BRASS })
  m.sphere(0.05, { at: [0, 0.7, 0], color: '#8a6a2a' })
}

const TELESCOPE: Model = (m) => {
  for (const a of [-0.35, 0, 0.35]) m.cylinder(0.025, 0.025, 1, { at: [sin(a) * 0.22, 0.48, cos(a) * 0.1 - 0.05], rot: [0, 0, a], color: WOOD_DARK })
  m.cylinder(0.08, 0.11, 0.9, { at: [0.15, 1.05, 0], rot: [0, 0, -1], color: BRASS })
  m.cylinder(0.12, 0.12, 0.06, { at: [0.52, 1.3, 0], rot: [0, 0, -1], color: '#b8862c' })
}

const GLOBE: Model = (m) => {
  m.cylinder(0.2, 0.26, 0.08, { at: [0, 0.04, 0], color: WOOD_DARK })
  m.cylinder(0.04, 0.04, 0.5, { at: [0, 0.3, 0], color: WOOD })
  m.sphere(0.3, { at: [0, 0.82, 0], color: '#5ab0e8' })
  m.sphere(0.14, { at: [0.12, 0.92, 0.2], scale: [1, 1.2, 0.5], color: '#7cc659' })
  m.sphere(0.1, { at: [-0.16, 0.72, 0.2], scale: [1.2, 1, 0.5], color: '#7cc659' })
  m.torus(0.34, 0.02, { at: [0, 0.82, 0], rot: [0, Math.PI / 2, 0.3], color: BRASS })
}

/** The ship's cat curled on a small barrel. */
const CAT: Model = (m) => {
  m.cylinder(0.24, 0.24, 0.5, { at: [0, 0.25, 0], scale: [1, 1, 1], color: WOOD })
  m.torus(0.245, 0.02, { at: [0, 0.4, 0], rot: [Math.PI / 2, 0, 0], color: '#4a4a52' })
  m.sphere(0.22, { at: [0, 0.66, 0], scale: [1.3, 0.7, 0.9], color: '#4a4a52' })
  m.sphere(0.14, { at: [0.24, 0.78, 0.04], color: '#4a4a52' })
  m.cone(0.05, 0.1, { at: [0.18, 0.94, 0.04], color: '#4a4a52' })
  m.cone(0.05, 0.1, { at: [0.3, 0.94, 0.04], color: '#4a4a52' })
  m.sphere(0.03, { at: [0.2, 0.8, 0.16], color: '#bfe86a' })
  m.sphere(0.03, { at: [0.3, 0.8, 0.15], color: '#bfe86a' })
  m.capsule(0.04, 0.3, { at: [-0.28, 0.62, 0.12], rot: [0, 0, 1.3], color: '#4a4a52' })
}

/** A friendly octopus peeping out of a tub of water. */
const OCTOPUS: Model = (m) => {
  m.cylinder(0.32, 0.28, 0.35, { at: [0, 0.175, 0], color: WOOD_LIGHT })
  m.cylinder(0.3, 0.3, 0.02, { at: [0, 0.34, 0], color: '#4fa3d9' })
  m.sphere(0.24, { at: [0, 0.56, 0], scale: [1, 1.15, 1], color: '#c86ad0' })
  for (const x of [-0.08, 0.08]) {
    m.sphere(0.06, { at: [x, 0.62, 0.2], color: '#ffffff' })
    m.sphere(0.03, { at: [x, 0.62, 0.25], color: '#222233' })
  }
  for (const a of [-1, 1]) m.capsule(0.05, 0.3, { at: [a * 0.34, 0.45, 0.05], rot: [0, 0, a * 0.9], color: '#c86ad0' })
}

const CRAB: Model = (m) => {
  m.sphere(0.18, { at: [0, 0.12, 0], scale: [1.3, 0.6, 1], color: '#f05a3a' })
  for (const s of [-1, 1]) {
    m.sphere(0.07, { at: [s * 0.27, 0.2, 0.06], color: '#f05a3a' })
    m.cylinder(0.012, 0.012, 0.1, { at: [s * 0.06, 0.24, 0.08], color: '#f05a3a' })
    m.sphere(0.03, { at: [s * 0.06, 0.3, 0.08], color: '#222233' })
  }
}

/** A lifebuoy standing on its edge on the deck, red and white. */
const LIFEBUOY: Model = (m) => {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    m.sphere(0.07, { at: [0.17 * cos(a), 0.24 + 0.17 * sin(a), 0], scale: [1.3, 1.3, 0.9], color: i % 2 === 0 ? RED : WHITE })
  }
}

/** The parrot on its perch hung from the wall. */
const PARROT: Model = (m) => {
  m.box(0.6, 0.05, 0.05, { at: [0, 0, 0], color: WOOD_DARK })
  m.box(0.05, 0.4, 0.05, { at: [-0.28, 0.2, -0.05], color: WOOD_DARK })
  m.sphere(0.14, { at: [0, 0.2, 0], scale: [0.9, 1.3, 0.9], color: '#36c25a' })
  m.sphere(0.1, { at: [0, 0.42, 0.02], color: '#36c25a' })
  m.cone(0.04, 0.09, { at: [0.08, 0.4, 0.06], rot: [0, 0, -1.8], color: '#ffb02a' })
  m.sphere(0.025, { at: [0.04, 0.46, 0.1], color: '#222233' })
  m.box(0.08, 0.26, 0.04, { at: [-0.04, 0.02, -0.06], rot: [0, 0, 0.3], color: RED })
  m.sphere(0.08, { at: [0, 0.22, 0.08], scale: [0.6, 1, 0.4], color: '#4fa3d9' })
}

/** A lantern hung from the ceiling on a chain `drop` long. */
function lantern(drop: number): Model {
  return (m) => {
    m.cylinder(0.015, 0.015, drop, { at: [0, drop / 2, 0], color: '#3a3a44' })
    m.box(0.3, 0.38, 0.3, { at: [0, 0.22, 0], color: WARM, glow: true })
    m.cone(0.24, 0.16, { at: [0, 0.49, 0], color: '#3a3a44' })
    m.box(0.34, 0.04, 0.34, { at: [0, 0.02, 0], color: '#3a3a44' })
  }
}

/** The ship's compass on the wall: a brass dial with a red needle. */
const COMPASS: Model = (m) => {
  m.cylinder(0.3, 0.3, 0.05, { at: [0, 0.3, 0], rot: [Math.PI / 2, 0, 0], color: '#f2deb0' })
  m.torus(0.3, 0.04, { at: [0, 0.3, 0.02], color: BRASS })
  m.extrude([[0, 0.48], [0.05, 0.3], [0, 0.12], [-0.05, 0.3]], 0.02, { at: [0, 0, 0.04], color: RED })
}

/** A fish on a wooden plaque. */
const FISH: Model = (m) => {
  m.box(0.7, 0.4, 0.04, { at: [0, 0.2, 0], color: WOOD })
  m.sphere(0.14, { at: [0.04, 0.2, 0.05], scale: [1.8, 0.9, 0.4], color: '#5ab0e8' })
  m.extrude([[-0.2, 0.2], [-0.32, 0.32], [-0.32, 0.08]], 0.04, { at: [0, 0, 0.05], color: '#3a86bd' })
  m.sphere(0.025, { at: [0.22, 0.24, 0.1], color: '#222233' })
}

/** A starfish caught in the net. */
const STARFISH: Model = (m) => m.extrude(starOutline(0.22, 0.1, 0.22), 0.05, { color: '#ffb24a' })

/** Where each piece goes is read from the room. */
export const look: LookCode = (r, room) => {
  const { solid } = byName(r, room)
  const stern = solid('stern')
  const bow = solid('bow')
  const [sternW, sternH, sternD] = stern.size()
  const [bowW, bowH, bowD] = bow.size()
  const sternRight = stern.at()[0] + sternW / 2
  const bowLeft = bow.at()[0] - bowW / 2
  const top = (s: SeenSolid) => s.at()[1] + s.size()[1] / 2
  // The masts stand under the crow's nests, the two highest of the play's solids.
  const [mainX, foreX] = [...room.solids()]
    .sort((a, b) => top(b) - top(a))
    .slice(0, 2)
    .map((s) => s.at()[0])
    .sort((a, b) => a - b)
  const door = room.wayOut()
  const starts = room.starts()
  // In front of the play a piece stands clear of every start.
  const clearOfStarts = (x: number, half: number) => starts.every((s) => Math.abs(s[0] - x) > half + 0.7)

  // The furniture: the stern and the bow, dressed.
  r.dress(stern, cabin(sternW, sternH, sternD))
  r.dress(bow, forecastle(bowW, bowH, bowD))

  // The ship's side: anchors on the planks, ribs up the wall, portholes onto the sea, the map between the masts.
  r.wallpaper(ANCHOR)
  for (const x of [door[0] + 1.4, (mainX + foreX) / 2 - 1.6, (mainX + foreX) / 2 + 1.6, bowLeft - 0.2, 7.85]) r.decor([x, 0.25, -2.94], RIB)
  const middle = (mainX + foreX) / 2
  r.decor([middle, 1.9, -2.92], MAP)
  const portholes: Point[] = [
    [sternRight + 0.6, 3.6, -2.92],
    [middle, 3.8, -2.92],
    [(foreX + bowLeft) / 2 + 0.5, 1.6, -2.92],
    [door[0] + 0.3, 5.4, -2.92],
  ]
  for (const at of portholes) r.decor(at, PORTHOLE)
  r.decor([middle, 6.5, -2.6], HAMMOCK)
  r.decor([6.9, 6.2, -2.9], NET)
  r.decor([0, 7.75, -2.7], bunting(15.6))

  // In front of the play: a low rail with a keg and shells in front of the stern, and with a keg and the lifebuoy (below) in front of the bow, so nothing stands in front of the ropes on the deck, where the children pull, or of the starts.
  for (const x of [-6.6, 6.6]) if (clearOfStarts(x, 1.2)) r.decor([x, 0, 1.3], rail(2.4))
  for (const x of [sternRight - 0.7, bowLeft + 0.5]) if (clearOfStarts(x, 0.3)) r.decor([x, 0, 1.25], KEG)
  if (clearOfStarts(-7.3, 0.3)) r.decor([-7.3, 0, 1.25], SHELLS)

  // Props low down, which the players pass: the wheel on the stern, the bell on the bow, and things on the deck behind the play.
  r.prop([sternRight - 0.05, sternH, -1.25], WHEEL, { react: 'spin', sound: 'squeak', puff: 'dust' })
  r.prop([bow.at()[0] + 0.55, bowH, -1.3], BELL, { react: 'swing', sound: 'bell', puff: 'note' })
  r.prop([mainX - 1.5, 0, -1.8], TELESCOPE, { react: 'spin', sound: 'magic', puff: 'star' })
  r.prop([foreX + 1.7, 0, -1.6], GLOBE, { react: 'spin', idle: 'spin', sound: 'whoosh' })
  r.prop([middle - 1.2, 0, -1.5], CAT, { react: 'hop', idle: 'pulse', sound: 'meow', puff: 'heart' })
  r.prop([middle + 1.3, 0, -1.4], OCTOPUS, { react: 'wobble', idle: 'bob', sound: 'squish', puff: 'bubble' })
  if (clearOfStarts(middle - 1, 0.3)) r.prop([middle - 1, 0, 1.25], CRAB, { react: 'hop', sound: 'pebbles', puff: 'drop' })
  if (clearOfStarts(7.3, 0.3)) r.prop([7.3, 0, 1.25], LIFEBUOY, { react: 'wobble', sound: 'boing' })

  // Props up high, which answer a tap or a player up a mast.
  r.prop([door[0] + 1.5, 4.4, -2.5], PARROT, { react: 'hop', idle: 'sway', sound: 'tweet', puff: 'confetti' })
  r.prop([door[0] + 0.6, 6.6, -1.6], lantern(1), { react: 'swing', idle: 'sway', sound: 'chime' })
  r.prop([middle - 1.1, 6.8, -1.6], lantern(0.8), { react: 'swing', idle: 'sway', sound: 'chime' })
  r.prop([(foreX + bowLeft) / 2 + 0.6, 6.6, -1.6], lantern(1), { react: 'swing', idle: 'sway', sound: 'chime' })
  r.prop([middle + 1.15, 4.6, -2.9], COMPASS, { react: 'spin', sound: 'tick', puff: 'spark' })
  r.prop([(foreX + bowLeft) / 2 + 0.6, 4.2, -2.9], FISH, { react: 'wobble', sound: 'splash', puff: 'bubble' })
  r.prop([7.1, 6.5, -2.85], STARFISH, { react: 'blink', idle: 'pulse', sound: 'sparkle', puff: 'star' })

  // Lamps: the three lanterns, and one over the map.
  r.lamp([door[0] + 0.6, 6.7, -1.2], { color: WARM, power: 0.6, reach: 6 })
  r.lamp([middle - 1.1, 6.9, -1.2], { color: WARM, power: 0.6, reach: 6 })
  r.lamp([(foreX + bowLeft) / 2 + 0.6, 6.7, -1.2], { color: WARM, power: 0.6, reach: 6 })
  r.lamp([middle, 3.6, -1.6], { color: '#fff0d0', power: 0.5, reach: 5 })

  // Small lights: a string of bulbs swung under the ceiling, and glints in the portholes' glass.
  const bulbs: Point[] = []
  for (let k = 0; k < 6; k++) {
    for (let j = 0; j < 9; j++) {
      const t = j / 9
      bulbs.push([-7.8 + 2.6 * (k + t), 7.35 - 0.35 * sin(Math.PI * t), -2.2])
    }
  }
  r.lights(bulbs, { color: [WARM, '#ff9ec4', '#9fe3ff', '#c8ff9f'], size: 0.18, twinkle: true })
  r.lights(
    portholes.map(([x, y, z]) => [x + 0.14, y + 0.54, z + 0.08]),
    { color: '#ffffff', size: 0.12, twinkle: true },
  )
}
