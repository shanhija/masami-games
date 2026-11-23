/**
 * A solid's plain shape as three.js, painted per vertex in Silly Billy's flat-shaded way, so the
 * still ones merge with the room's models into one mesh. Every geometry here has exactly position,
 * normal and colour, non-indexed, as recipeMesh.ts's do, and is centred on the solid's middle.
 *
 * A top is a little lighter than the sides, so a floor reads as a floor from the side, and each
 * surface looks like what it does: ice pale and shiny with white streaks, a bouncy top a soft pad
 * over a spring, a belt a dark band between two rollers (its arrows move: BeltView), a floor one
 * jumps up through a thin plank with seams.
 */

import { BoxGeometry, type BufferAttribute, BufferGeometry, CatmullRomCurve3, Color, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, IcosahedronGeometry, Matrix4, Shape, TubeGeometry, Vector2, Vector3 } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { colorOf } from '../../../silly-billy/src/scene/look'
import type { Rise } from '../engine/api'
import type { RoomView, SolidShape, Surface } from '../engine/world'

/** The colours every surface is drawn with besides its own. */
export const SURFACE_LOOK = {
  ice: '#bfefff',
  iceTop: '#f4fdff',
  shine: '#ffffff',
  band: '#454b57',
  roller: '#c9ced6',
  arrow: '#ffd23a',
  seam: '#5a4630',
} as const

/** How thick a floor one jumps up through is drawn, metres at most. */
export const PLANK = 0.24
/** How far in front of the players' plane (z = 0) a through-floor's plank reaches from the side, metres: a player's head reaches about 0.2. From high up it reaches its whole depth. */
export const PLANK_FRONT = 0.1

/** A colour mixed `k` of the way toward another, as '#rrggbb'. */
export const mix = (a: string, b: string, k: number) => `#${new Color(colorOf(a)).lerp(new Color(colorOf(b)), k).getHexString()}`
export const lighter = (c: string, k: number) => mix(c, '#ffffff', k)
export const darker = (c: string, k: number) => mix(c, '#000000', k)

/** Ready to merge: no texture coordinates, no index, a normal for every corner. */
function bare(g: BufferGeometry): BufferGeometry {
  g.deleteAttribute('uv')
  const flat = g.index === null ? g : g.toNonIndexed()
  if (flat !== g) g.dispose()
  flat.clearGroups()
  if (flat.getAttribute('normal') === undefined) flat.computeVertexNormals()
  return flat
}

const a = new Vector3()
const b = new Vector3()
const c = new Vector3()

/** Paints every triangle: those facing up the top colour, those facing down the bottom one, the rest the side one. */
function paint(g: BufferGeometry, side: string, top: string, bottom: string): BufferGeometry {
  const pos = g.getAttribute('position')
  const colors = new Float32Array(pos.count * 3)
  const [s, t, u] = [side, top, bottom].map((x) => new Color(colorOf(x)))
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    b.fromBufferAttribute(pos, i + 1)
    c.fromBufferAttribute(pos, i + 2)
    const ny = b.sub(a).cross(c.sub(a)).normalize().y
    const col = ny > 0.35 ? t! : ny < -0.6 ? u! : s!
    for (let k = 0; k < 3; k++) col.toArray(colors, (i + k) * 3)
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3))
  return g
}

/** A shape in one colour, moved into place. */
function piece(g: BufferGeometry, color: string, at: [number, number, number], turnZ: number): BufferGeometry {
  const out = paint(bare(g), color, color, color)
  out.applyMatrix4(new Matrix4().makeRotationZ(turnZ).setPosition(at[0], at[1], at[2]))
  return out
}

/** A box with its edges a little rounded, as the toy blocks it stands for. */
function block(w: number, h: number, d: number): BufferGeometry {
  const r = Math.min(0.07, w / 4, h / 4, d / 4)
  return bare(new RoundedBoxGeometry(w, h, d, 2, r))
}

/** A wedge in the box w, h, d: flat underneath, its top rising toward +x ('right') or -x, or from high up toward -z ('back') or +z ('front'): built along x and turned round y. */
function wedge(w: number, h: number, d: number, rises: Rise): BufferGeometry {
  const along = rises === 'right' || rises === 'left'
  const run = along ? w : d
  const across = along ? d : w
  const high = rises === 'left' ? -run / 2 : run / 2
  const outline = new Shape([new Vector2(-run / 2, -h / 2), new Vector2(run / 2, -h / 2), new Vector2(high, h / 2)])
  const g = bare(new ExtrudeGeometry(outline, { depth: across, bevelEnabled: false }).translate(0, 0, -across / 2))
  return along ? g : g.rotateY(rises === 'front' ? -Math.PI / 2 : Math.PI / 2)
}

function merged(list: BufferGeometry[]): BufferGeometry {
  if (list.length === 1) return list[0]!
  const g = mergeGeometries(list)
  if (g === null) throw new Error("a solid's pieces would not merge")
  for (const x of list) x.dispose()
  return g
}

/** A belt: its top carries whoever stands on it some way (along x and y from the side, x and z from high up). */
export const carries = (f: Surface) => f.belt[0] !== 0 || f.belt[1] !== 0 || f.belt[2] !== 0

/** How much lighter a solid's top is drawn in a dim room (design step 7a, Light: dim rooms are helped by rule), so the floors the play stands on still read. */
export const DIM_TOP = 0.1

/** Every triangle facing up (as paint finds a top) mixed `k` of the way toward white. */
function liftTops(g: BufferGeometry, k: number): BufferGeometry {
  const pos = g.getAttribute('position')
  const col = g.getAttribute('color') as BufferAttribute
  const white = new Color('#ffffff')
  const cur = new Color()
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i)
    b.fromBufferAttribute(pos, i + 1)
    c.fromBufferAttribute(pos, i + 2)
    if (b.sub(a).cross(c.sub(a)).normalize().y <= 0.35) continue
    for (let j = i; j < i + 3; j++) {
      cur.fromBufferAttribute(col, j).lerp(white, k)
      col.setXYZ(j, cur.r, cur.g, cur.b)
    }
  }
  return g
}

/** The solid's plain shape and what its surface adds, painted, centred on its middle; in a dim room (`dim`) its tops a little lighter. */
export function solidGeometry(shape: SolidShape, surface: Surface, view: RoomView, dim: boolean): BufferGeometry {
  const g = surfaceGeometry(shape, surface, view)
  return dim ? liftTops(g, DIM_TOP) : g
}

/** The solid's plain shape and what its surface adds, painted, centred on its middle. */
function surfaceGeometry(shape: SolidShape, surface: Surface, view: RoomView): BufferGeometry {
  const color = surface.color
  if (shape.kind === 'ball') {
    const tint = surface.ice ? mix(color, SURFACE_LOOK.ice, 0.55) : surface.bounce > 0 ? lighter(color, 0.2) : color
    return paint(bare(new IcosahedronGeometry(shape.radius, 2)), tint, lighter(tint, 0.12), darker(tint, 0.15))
  }
  const [w, h, d] = shape.size
  if (shape.kind === 'ramp') {
    const side = surface.ice ? mix(color, SURFACE_LOOK.ice, 0.55) : color
    const top = surface.ice ? SURFACE_LOOK.iceTop : carries(surface) ? SURFACE_LOOK.band : lighter(side, surface.bounce > 0 ? 0.4 : 0.18)
    return paint(wedge(w, h, d, shape.rises), side, top, darker(side, 0.2))
  }
  if (surface.through) {
    // A plank: only its top is drawn, with seams down its front. From the side it stops just in front
    // of the plane the players walk in (PLANK_FRONT), so the head of a player standing under it is not
    // hidden; from high up it is as deep as it is.
    const t = Math.min(h, PLANK)
    const front = view === 'high' ? d / 2 : Math.min(d / 2, PLANK_FRONT)
    const deep = front + d / 2
    const list = [paint(block(w, t, deep).translate(0, h / 2 - t / 2, front - deep / 2), color, lighter(color, 0.2), darker(color, 0.2))]
    for (let x = -w / 2 + 0.6; x < w / 2 - 0.3; x += 0.6) list.push(piece(new BoxGeometry(0.035, t * 0.8, 0.02), mix(color, SURFACE_LOOK.seam, 0.5), [x, h / 2 - t / 2, front + 0.005], 0))
    return merged(list)
  }
  if (surface.ice) {
    const side = mix(color, SURFACE_LOOK.ice, 0.55)
    const list = [paint(block(w, h, d), side, SURFACE_LOOK.iceTop, darker(side, 0.2))]
    // Two streaks of shine across the front.
    const len = Math.min(h * 0.7, w * 0.5, 0.9)
    if (len > 0.2) for (const dx of [0, 0.16]) list.push(piece(new BoxGeometry(0.07, len, 0.02), SURFACE_LOOK.shine, [-w * 0.22 + dx, 0, d / 2 + 0.005], -0.55))
    return merged(list)
  }
  if (surface.bounce > 0) {
    // A soft pad on top, and a spring drawn across the front under it.
    const pad = Math.min(0.16, h * 0.4)
    const list = [paint(block(w, h - pad * 0.5, d).translate(0, -pad * 0.25, 0), color, lighter(color, 0.15), darker(color, 0.2))]
    list.push(paint(bare(new RoundedBoxGeometry(w * 0.94, pad, d * 0.94, 2, pad / 2.2)).translate(0, h / 2 - pad / 2 + 0.03, 0), lighter(color, 0.45), lighter(color, 0.6), lighter(color, 0.3)))
    const points: Vector3[] = []
    const y = h / 2 - pad - 0.12
    for (let x = -w / 2 + 0.15, up = true; x <= w / 2 - 0.15 + 1e-6; x += 0.22, up = !up) points.push(new Vector3(x, y + (up ? 0.08 : -0.08), d / 2 + 0.02))
    if (points.length >= 2 && h > 0.45) list.push(piece(new TubeGeometry(new CatmullRomCurve3(points, false, 'catmullrom', 0), points.length * 4, 0.035, 4, false), SURFACE_LOOK.shine, [0, 0, 0], 0))
    return merged(list)
  }
  if (carries(surface)) {
    // A dark band over the top between two rollers that show at the ends.
    const band = Math.min(0.16, h * 0.5)
    const list = [paint(block(w - 0.1, h - band, d), color, lighter(color, 0.15), darker(color, 0.2)).translate(0, -band / 2, 0)]
    list.push(paint(block(w, band, d + 0.02).translate(0, h / 2 - band / 2, 0), SURFACE_LOOK.band, lighter(SURFACE_LOOK.band, 0.15), SURFACE_LOOK.band))
    for (const x of [-w / 2 + band / 2, w / 2 - band / 2]) list.push(paint(bare(new CylinderGeometry(band * 0.42, band * 0.42, d + 0.06, 10)).rotateX(Math.PI / 2).translate(x, h / 2 - band / 2, 0), SURFACE_LOOK.roller, SURFACE_LOOK.roller, SURFACE_LOOK.roller))
    return merged(list)
  }
  return paint(block(w, h, d), color, lighter(color, 0.18), darker(color, 0.2))
}

/** One arrow of a belt, pointing +x, flat on the front of its band: a chevron 0.2 m across. */
export function chevronGeometry(): BufferGeometry {
  const s = new Shape([new Vector2(-0.07, -0.08), new Vector2(-0.01, -0.08), new Vector2(0.07, 0), new Vector2(-0.01, 0.08), new Vector2(-0.07, 0.08), new Vector2(0.01, 0)])
  return bare(new ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }))
}
