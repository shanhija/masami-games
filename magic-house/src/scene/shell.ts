/**
 * The house round every room (step 7a, What the scene draws): the room's shell drawn from the
 * answer's paint (World.shell), and the house's own frame round it in colours of its own, the same
 * in every room. It is one geometry of flat quads, painted per vertex and carrying the shell's
 * patterns (patterns/look.ts ROOM_PATTERNED), which the room's still batch merges (still.ts), so the
 * whole house costs no draw call.
 *
 * From the side it is a cut-away doll's-house room: a back wall, a floor whose top shows as a
 * strip over its front face, with a sill and the house's boards below it under the pads, side walls
 * whose inner faces show in perspective with their cut edges in the trim, a ceiling whose front face
 * is a beam, a skirting and a cornice, and an open front. Round it the house's timber posts, its
 * plaster and an upper storey reach HOUSE_LOOK.reach metres past the camera's frame on every side,
 * so no screen shows past them. From high up it is the floor with a lip at the open front, walls at the back and both
 * sides capped in the trim, no ceiling, and the house's boards all round to every screen's edge.
 *
 * The house's own solids (world.ts Solid.house) are where this stands: the sim holds the players
 * with them, the scene draws them only here.
 */

import { BufferGeometry, Color, Float32BufferAttribute } from 'three'

import { colorOf } from '../../../silly-billy/src/scene/look'
import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { ROOM, type Paint, type Shell } from '../engine/api'
import type { RoomView } from '../engine/world'
import { patternNumber } from '../patterns/look'
import { darker } from './shapes'

/**
 * The house's own colours, the same round every room: its timber posts and rails, its plaster
 * between them, the lighter timbers set in the plaster (studs and braces: quieter than the frame, so
 * the house stays round the room and never louder than it), and its boards, with the lines laid in
 * them, under the room from the side and all round it from high up. The background is the darkest
 * of them (RoomView.background), so even a screen bigger than the house shows only more of its
 * timber. reach: how far past the camera's frame the house goes on every side, metres.
 */
export const HOUSE_LOOK = {
  timber: '#4a2f1d',
  rail: '#6b4428',
  plaster: '#ead6b4',
  brace: '#b99878',
  boards: '#9a6b43',
  boardsLine: '#875a36',
  reach: 6,
} as const

/**
 * How the shell is laid, metres: the skirting's and the cornice's height and how far each stands
 * off its wall, a trim strip's width, how far the front faces stand proud, the house's posts, rails
 * and studs, and how far apart the studs stand. From high up the skirting is lower, as the walls are.
 */
export const SHELL_LAYOUT = {
  skirting: 0.25,
  skirtingHigh: 0.18,
  cornice: 0.3,
  off: 0.05,
  strip: 0.08,
  proud: 0.15,
  post: 0.5,
  rail: 0.4,
  stud: 0.16,
  studEvery: 2.4,
  /** How wide a brace across the upper storey is. */
  brace: 0.12,
  /** The sill under the floor's front face, over the house's boards. */
  sill: 0.3,
  /** How much darker the floor's front face is than its top. */
  floorFace: 0.25,
  /** How far the boards reach from the room's middle seen from high up. */
  boards: 80,
} as const

/**
 * How calm the shell's patterns are drawn (SHELL_REF: laid softly): the walls, floor and ceiling are
 * the background of the play at every light, so a pattern's second colour is drawn part of the way
 * toward the first until the two stand at most `most` apart, as Oklab measures it (lightness and
 * colour together, black to white 1). Cream stars on navy come down to soft ones; paint already as
 * calm (most bright rooms' paint) is drawn as given.
 */
export const SHELL_CALM = { most: 0.12 } as const

/** A colour in Oklab (Björn Ottosson's perceptual space), from three.js's linear sRGB. */
function oklab(c: Color): Vec3 {
  const l = Math.cbrt(0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b)
  const m = Math.cbrt(0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b)
  const s = Math.cbrt(0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

/** How far apart two colours look: their distance in Oklab. */
export function paintDistance(a: Color, b: Color): number {
  const [p, q] = [oklab(a), oklab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/** The second colour as the house draws it over `color`: as given when it is calm enough, else mixed toward `color` just far enough (found by halving, the distance growing steadily the farther it is from `color`). */
export function calmSecond(color: Color, second: Color): Color {
  if (paintDistance(color, second) <= SHELL_CALM.most) return second.clone()
  let [near, far] = [0, 1]
  for (let i = 0; i < 24; i++) {
    const k = (near + far) / 2
    if (paintDistance(color, color.clone().lerp(second, k)) <= SHELL_CALM.most) near = k
    else far = k
  }
  return color.clone().lerp(second, near)
}

/** A surface's paint as the batch carries it: its colour, and its second colour and pattern number (plain 0, no pattern). */
interface Coat {
  color: Color
  second: Color
  kind: number
}

/** A shell surface's paint, its pattern laid softly (SHELL_CALM). */
const coat = (p: Paint): Coat => {
  const color = new Color(colorOf(p.color))
  return { color, second: calmSecond(color, new Color(colorOf(p.second))), kind: patternNumber(p.pattern) }
}
const plain = (c: string): Coat => ({ color: new Color(colorOf(c)), second: new Color(colorOf(c)), kind: 0 })

/** The house's own boards, their lines laid in them as stripes. */
const houseBoards = (): Coat => ({ color: new Color(HOUSE_LOOK.boards), second: new Color(HOUSE_LOOK.boardsLine), kind: patternNumber('stripes') })

/** Which faces of a box are drawn and in what: only those that can be seen. */
interface BoxCoats {
  front?: Coat
  back?: Coat
  top?: Coat
  bottom?: Coat
  left?: Coat
  right?: Coat
}

/** Flat quads gathered into one geometry with position, normal, colour and pattern, non-indexed, as the still batch merges them. */
class Quads {
  private readonly pos: number[] = []
  private readonly nor: number[] = []
  private readonly col: number[] = []
  private readonly pat: number[] = []

  /** The quad from corner `o` along `u` and `v`, facing u × v: two triangles turning counterclockwise seen from that side. */
  quad(c: Coat, o: Vec3, u: Vec3, v: Vec3) {
    const n: Vec3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
    const len = Math.hypot(n[0], n[1], n[2])
    const at = (a: number, b: number): Vec3 => [o[0] + a * u[0] + b * v[0], o[1] + a * u[1] + b * v[1], o[2] + a * u[2] + b * v[2]]
    for (const p of [at(0, 0), at(1, 0), at(1, 1), at(0, 0), at(1, 1), at(0, 1)]) {
      this.pos.push(...p)
      this.nor.push(n[0] / len, n[1] / len, n[2] / len)
      this.col.push(c.color.r, c.color.g, c.color.b)
      this.pat.push(c.second.r, c.second.g, c.second.b, c.kind)
    }
  }

  /** The box from `min` to `max`, only its faces given a coat. */
  box(min: Vec3, max: Vec3, coats: BoxCoats) {
    const [x0, y0, z0] = min
    const [x1, y1, z1] = max
    const [dx, dy, dz] = [x1 - x0, y1 - y0, z1 - z0]
    if (coats.front) this.quad(coats.front, [x0, y0, z1], [dx, 0, 0], [0, dy, 0])
    if (coats.back) this.quad(coats.back, [x1, y0, z0], [-dx, 0, 0], [0, dy, 0])
    if (coats.top) this.quad(coats.top, [x0, y1, z1], [dx, 0, 0], [0, 0, -dz])
    if (coats.bottom) this.quad(coats.bottom, [x0, y0, z0], [dx, 0, 0], [0, 0, dz])
    if (coats.right) this.quad(coats.right, [x1, y0, z1], [0, 0, -dz], [0, dy, 0])
    if (coats.left) this.quad(coats.left, [x0, y0, z0], [0, 0, dz], [0, dy, 0])
  }

  /** A strip `width` wide from (x0, y0) to (x1, y1) on the plane z, facing the viewer: a brace across the plaster. */
  brace(c: Coat, x0: number, y0: number, x1: number, y1: number, z: number, width: number) {
    const [dx, dy] = [x1 - x0, y1 - y0]
    const k = width / Math.hypot(dx, dy)
    this.quad(c, [x0 + (dy * k) / 2, y0 - (dx * k) / 2, z], [dx, dy, 0], [-dy * k, dx * k, 0])
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('normal', new Float32BufferAttribute(this.nor, 3))
    g.setAttribute('color', new Float32BufferAttribute(this.col, 3))
    g.setAttribute('pattern', new Float32BufferAttribute(this.pat, 4))
    return g
  }
}

/** From the side: the room as a cut-away doll's-house room, the house's front round it. */
function sideShell(q: Quads, shell: Shell) {
  const { width, height, back: B, front: F } = ROOM.side
  const [W, H, t, beam, lip] = [width / 2, height, ROOM.wall, ROOM.beam, ROOM.lip]
  const L = SHELL_LAYOUT
  const R = HOUSE_LOOK.reach
  const walls = coat(shell.walls)
  const trim = plain(shell.trim)
  // The frame's edges (engine/camera.ts SIDE_FRAME) and how far the house reaches past them.
  const out = W + t
  const [left, right, bottom, top] = [-out - R, out + R, -lip - R, H + beam + R]
  // The back wall, the floor's top and the ceiling's underside.
  q.box([-W, 0, B - 0.1], [W, H, B], { front: walls })
  q.box([-out, -lip, B], [out, 0, F], { top: coat(shell.floor) })
  q.box([-out, H, B], [out, H + beam, F], { bottom: coat(shell.ceiling), front: plain(shell.ceiling.color) })
  // The side walls' inner faces, in perspective, and their cut edges at the open front.
  q.box([-out, 0, B], [-W, H, F], { right: walls, front: trim })
  q.box([W, 0, B], [out, H, F], { left: walls, front: trim })
  // The floor's front face as deep as its lip, a sill under it, and the house's boards below, under the pads (on a screen with them); the ceiling's beam; each edge with a trim strip.
  const boards = houseBoards()
  q.box([-out, -lip, B], [out, 0, F], { front: plain(darker(shell.floor.color, L.floorFace)) })
  q.box([-out, -lip - L.sill, F], [out, -lip, F + L.proud / 2], { front: plain(HOUSE_LOOK.rail), bottom: plain(HOUSE_LOOK.timber) })
  q.box([-out, bottom, F - 0.01], [out, -lip - L.sill, F], { front: boards })
  q.box([-out, -L.strip, F], [out, 0, F + 0.02], { front: trim, top: trim })
  q.box([-out, H, F], [out, H + L.strip, F + 0.02], { front: trim, bottom: trim })
  // The skirting along the foot of the walls, and the cornice under the ceiling.
  q.box([-W, 0, B], [W, L.skirting, B + L.off], { front: trim, top: trim })
  q.box([-W, 0, B], [-W + L.off, L.skirting, F], { right: trim, top: trim })
  q.box([W - L.off, 0, B], [W, L.skirting, F], { left: trim, top: trim })
  q.box([-W, H - L.cornice, B], [W, H, B + 2 * L.off], { front: trim, bottom: trim })
  q.box([-W, H - L.cornice, B], [-W + 2 * L.off, H, F], { right: trim, bottom: trim })
  q.box([W - 2 * L.off, H - L.cornice, B], [W, H, F], { left: trim, bottom: trim })
  // The house's front round the room: timber posts beside it, a rail over the beam, plaster with lighter studs and braces.
  const timber = plain(HOUSE_LOOK.timber)
  const rail = plain(HOUSE_LOOK.rail)
  const plaster = plain(HOUSE_LOOK.plaster)
  const brace = plain(HOUSE_LOOK.brace)
  const P = F + L.proud
  q.box([-out - L.post, bottom, F], [-out, top, P], { front: timber, right: rail })
  q.box([out, bottom, F], [out + L.post, top, P], { front: timber, left: rail })
  const storey = H + beam
  q.box([-out, storey, F], [out, storey + L.rail, P], { front: rail, top: rail })
  q.box([left, bottom, F - 0.01], [-out - L.post, top, F], { front: plaster })
  q.box([out + L.post, bottom, F - 0.01], [right, top, F], { front: plaster })
  q.box([-out, storey + L.rail, F - 0.01], [out, top, F], { front: plaster })
  // Studs every so often across the plaster, a rail along the storey's line, and a brace in each bay of the upper storey.
  const studZ = F + L.proud / 2
  for (let x = out + L.post + L.studEvery; x < right; x += L.studEvery)
    for (const cx of [-x, x]) q.box([cx - L.stud / 2, bottom, F], [cx + L.stud / 2, top, studZ], { front: brace, left: rail, right: rail })
  const bays = Math.round((2 * out) / L.studEvery)
  const bay = (2 * out) / bays
  for (let i = 1; i < bays; i++) q.box([-out + i * bay - L.stud / 2, storey + L.rail, F], [-out + i * bay + L.stud / 2, top, studZ], { front: brace })
  for (let i = 0; i < bays; i++) {
    const x0 = -out + i * bay
    q.brace(brace, i % 2 === 0 ? x0 : x0 + bay, storey + L.rail, i % 2 === 0 ? x0 + bay : x0, storey + L.rail + bay, F + 0.02, L.brace)
  }
  for (const s of [-1, 1]) q.box([s > 0 ? out + L.post : left, storey, F], [s > 0 ? right : -out - L.post, storey + L.rail, studZ], { front: rail, top: rail })
}

/** From high up: the floor with its lip, walls at the back and both sides capped in the trim, and the house's boards all round. */
function highShell(q: Quads, shell: Shell) {
  const { width, depth, wallHigh } = ROOM.high
  const [w, d, t] = [width / 2, depth / 2, ROOM.wall]
  const L = SHELL_LAYOUT
  const walls = coat(shell.walls)
  const trim = plain(shell.trim)
  // The floor, its front face a lip over the house's boards, with a trim strip along its edge.
  q.box([-w, -t, -d], [w, 0, d + t], { top: coat(shell.floor), front: plain(darker(shell.floor.color, L.floorFace)) })
  q.box([-w - t, -L.strip / 2, d + t], [w + t, 0, d + t + 0.02], { front: trim, top: trim })
  // The walls: inner faces in the walls' paint, tops and cut edges in the trim.
  q.box([-w - t, -t, -d - t], [w + t, wallHigh, -d], { front: walls, top: trim })
  q.box([-w - t, -t, -d], [-w, wallHigh, d + t], { right: walls, top: trim, front: trim })
  q.box([w, -t, -d], [w + t, wallHigh, d + t], { left: walls, top: trim, front: trim })
  // The skirting along their feet.
  q.box([-w, 0, -d], [w, L.skirtingHigh, -d + L.off], { front: trim, top: trim })
  q.box([-w, 0, -d], [-w + L.off, L.skirtingHigh, d + t], { right: trim, top: trim })
  q.box([w - L.off, 0, -d], [w, L.skirtingHigh, d + t], { left: trim, top: trim })
  // The house's boards all round, under the floor's lip, out past every screen's edge.
  const boards = houseBoards()
  q.box([-L.boards, -t - 0.01, -L.boards], [L.boards, -t, L.boards / 2], { top: boards })
}

/** The house round a room seen from `view`, in its shell's paint: one geometry for the still batch. */
export function shellGeometry(shell: Shell, view: RoomView): BufferGeometry {
  const q = new Quads()
  if (view === 'side') sideShell(q, shell)
  else highShell(q, shell)
  return q.geometry()
}
