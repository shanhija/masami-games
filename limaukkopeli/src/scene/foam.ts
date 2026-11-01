/**
 * What the obstacles, the pickups and the tower share: the soft-foam material, textures
 * drawn once on a canvas (bands, candy stripes, arrows, soft blobs), a helper that bakes
 * static parts into one geometry, the clip that keeps paint on the track off the water,
 * the jiggle every soft toy does when knocked, and how far from the slime things are
 * drawn. Everything made here belongs to the scene that made it and is disposed with it.
 */

import { useEffect, useMemo, useRef, type DependencyList } from 'react'
import { BufferGeometry, CanvasTexture, Color, Fog, LatheGeometry, Material, Matrix4, MeshStandardMaterial, NoColorSpace, Object3D, RepeatWrapping, SRGBColorSpace, Vector2, Vector3, Vector4, type FogExp2, type Texture } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { clamp01 } from '../game/math'
import type { Course, Sim } from '../game/model'
import { palette } from './look'

/** Something holding GPU memory that its scene must let go of when it unmounts. */
interface Disposable {
  dispose(): void
}

/** Files a thing for disposal and hands it straight back, so making and owning are one expression. */
export type Own = <D extends Disposable>(thing: D) => D

/**
 * Makes GPU things once (again only when `deps` change) and disposes them when the
 * component unmounts: every run remounts the play scene, so nothing may pile up.
 */
export function useOwned<T>(make: (own: Own) => T, deps: DependencyList): T {
  const made = useMemo(() => {
    const things: Disposable[] = []
    const value = make((thing) => {
      things.push(thing)
      return thing
    })
    return { value, things }
    // `make` is a new closure on every render; `deps` alone says when its result changes.
  }, deps)
  useEffect(
    () => () => {
      for (const thing of made.things) thing.dispose()
    },
    [made],
  )
  return made.value
}

// ------------------------------------------------------------------ materials

const WHITE = new Color('#ffffff')

/** How much a toy's own colour shines of itself, by day and at night: enough that a face turned from the sun still reads as its candy colour. */
const SELF_LIGHT = 0.1
const NIGHT_LIGHT = 0.22

/** The soft foam of every toy: smooth, a little shiny, a little lit from within (more at night, so the toys still read in the dark). */
export function foam(colour: string, night: boolean) {
  return new MeshStandardMaterial({ color: colour, roughness: 0.5, metalness: 0, emissive: colour, emissiveIntensity: night ? NIGHT_LIGHT : SELF_LIGHT })
}

/** Foam whose colours come from a texture (stripes, bands), lit from within the same way. */
export function foamMap(map: Texture, night: boolean) {
  return new MeshStandardMaterial({ map, roughness: 0.5, metalness: 0, emissiveMap: map, emissive: '#ffffff', emissiveIntensity: night ? NIGHT_LIGHT : SELF_LIGHT })
}

/** A colour moved toward white by `white` (0 to 1), as a hex string for a canvas or a material. */
export function tint(colour: string, white: number) {
  return `#${new Color(colour).lerp(WHITE, white).getHexString()}`
}

/** The dark of eyes, coal and keyholes. */
export function ink() {
  return new MeshStandardMaterial({ color: palette.ink, roughness: 0.3 })
}

/**
 * The glow that says "this one!" while the game teaches: the thing the pulsing button
 * answers breathes white, in real time (the world itself crawls). Off, the material
 * goes back to its own emissive.
 */
export function teachGlow(material: MeshStandardMaterial, base: { colour: Color; intensity: number }, on: boolean, realTime: number) {
  if (on) {
    material.emissive.copy(WHITE)
    material.emissiveIntensity = base.intensity + 0.18 + 0.22 * Math.sin(realTime * 9)
  } else {
    material.emissive.copy(base.colour)
    material.emissiveIntensity = base.intensity
  }
}

/** A material's own emissive, kept so teachGlow can put it back. */
export function emissiveOf(material: MeshStandardMaterial) {
  return { colour: material.emissive.clone(), intensity: material.emissiveIntensity }
}

// ------------------------------------------------------------------ textures

/** A texture drawn once on a canvas, repeating both ways: in sRGB when it is a picture, linear when it is data (an alpha map). */
export function canvasTexture(width: number, height: number, picture: boolean, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('this browser gives no 2D canvas')
  draw(ctx)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = picture ? SRGBColorSpace : NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = 4
  return texture
}

/** Even bands, one per colour, repeating: a texture coordinate of 1 along `along` runs through all of them once. */
export function bands(colours: readonly string[], along: 'u' | 'v') {
  const n = colours.length
  return canvasTexture(along === 'u' ? 64 * n : 4, along === 'u' ? 4 : 64 * n, true, (ctx) => {
    colours.forEach((c, i) => {
      ctx.fillStyle = c
      if (along === 'u') ctx.fillRect(i * 64, 0, 64, 4)
      else ctx.fillRect(0, i * 64, 4, 64)
    })
  })
}

/** Diagonal candy-cane stripes in a square tile that repeats seamlessly both ways: wrapped round a pole they spiral. */
export function candy(base: string, stripe: string) {
  const S = 128
  const w = S / 4
  return canvasTexture(S, S, true, (ctx) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, S, S)
    ctx.fillStyle = stripe
    // Each band is x + y in [i w, (i + 1) w]; the period 2w divides the tile both ways.
    for (let i = 0; i <= 8; i += 2) {
      ctx.beginPath()
      ctx.moveTo(i * w, 0)
      ctx.lineTo((i + 1) * w, 0)
      ctx.lineTo((i + 1) * w - S, S)
      ctx.lineTo(i * w - S, S)
      ctx.closePath()
      ctx.fill()
    }
  })
}

/**
 * A soft blob for an alpha map, white inside fading to black at its edge, drawn from a
 * signed distance (negative inside, in pixels) so the fade is even all round.
 */
export function softBlob(width: number, height: number, soft: number, distance: (x: number, y: number) => number) {
  return canvasTexture(width, height, false, (ctx) => {
    const image = ctx.createImageData(width, height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const a = clamp01(0.5 - distance(x + 0.5 - width / 2, y + 0.5 - height / 2) / soft)
        const v = Math.round(a * a * (3 - 2 * a) * 255)
        const k = (y * width + x) * 4
        image.data[k] = v
        image.data[k + 1] = v
        image.data[k + 2] = v
        image.data[k + 3] = 255
      }
    }
    ctx.putImageData(image, 0, 0)
  })
}

/** The signed distance from a point to a rounded rectangle of half sizes (hx, hy) and corner radius r, centred on the origin. */
export function roundedRectDistance(x: number, y: number, hx: number, hy: number, r: number) {
  const qx = Math.abs(x) - hx + r
  const qy = Math.abs(y) - hy + r
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/**
 * A row of fat rounded chevrons, one per tile, pointing up the tile (toward +v) or down
 * it, in `colour` over `ground` (or over nothing when `ground` is null), with the tile's
 * two side edges dashed when `edges` is set.
 */
export function chevrons(colour: string, ground: string | null, up: boolean, edges: boolean) {
  const S = 128
  return canvasTexture(S, S, true, (ctx) => {
    if (ground !== null) {
      ctx.fillStyle = ground
      ctx.fillRect(0, 0, S, S)
    }
    ctx.strokeStyle = colour
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 15
    // The canvas's top row is v = 1, so a chevron pointing up the tile has its tip at the top.
    const tip = up ? 34 : 94
    const tail = up ? 84 : 44
    ctx.beginPath()
    ctx.moveTo(30, tail)
    ctx.lineTo(64, tip)
    ctx.lineTo(98, tail)
    ctx.stroke()
    if (edges) {
      ctx.lineWidth = 8
      for (const x of [6, S - 6]) {
        ctx.beginPath()
        ctx.moveTo(x, 20)
        ctx.lineTo(x, 70)
        ctx.stroke()
      }
    }
  })
}

/** Draws a texture again once the game's rounded font has loaded, for numbers drawn on a canvas before it had. */
export function redrawWithFont(texture: CanvasTexture, draw: (ctx: CanvasRenderingContext2D) => void) {
  const font = '700 100px "Fredoka Variable"'
  if (document.fonts.check(font)) return
  void document.fonts.load(font).then(() => {
    const ctx = (texture.image as HTMLCanvasElement).getContext('2d')
    if (!ctx) throw new Error('this browser gives no 2D canvas')
    draw(ctx)
    texture.needsUpdate = true
  })
}

/** A little four-pointed twinkle on nothing, for sparkles. */
export function twinkle() {
  const S = 64
  return canvasTexture(S, S, true, (ctx) => {
    const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 30)
    glow.addColorStop(0, 'rgba(255,255,255,0.9)')
    glow.addColorStop(0.35, 'rgba(255,255,255,0.25)')
    glow.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, S, S)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2
      const r = i % 2 === 0 ? 30 : 6
      ctx.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r)
    }
    ctx.closePath()
    ctx.fill()
  })
}

// ------------------------------------------------------------------ geometry

const placer = new Object3D()

/** A placement as a matrix: where, turned how (radians, in XYZ order), and stretched how. */
export function placed(position: readonly [number, number, number], rotation: readonly [number, number, number], scale: readonly [number, number, number]) {
  placer.position.set(position[0], position[1], position[2])
  placer.rotation.set(rotation[0], rotation[1], rotation[2])
  placer.scale.set(scale[0], scale[1], scale[2])
  placer.updateMatrix()
  return placer.matrix.clone()
}

/** Moves each shape by its matrix and bakes them all into one geometry, one draw call for a whole static part; the shapes given are disposed. */
export function merge(parts: readonly (readonly [BufferGeometry, Matrix4])[]) {
  const moved = parts.map(([g, m]) => (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(m))
  const out = mergeGeometries(moved)
  if (!out) throw new Error('these shapes have different attributes and do not merge')
  for (const g of moved) g.dispose()
  for (const [g] of parts) g.dispose()
  return out
}

/**
 * A rounded puck standing on y = 0, a cylinder whose top and bottom rims are rounded with
 * radius `edge`: a fan's base, a marshmallow, a circle in the tower. The lathe's u runs
 * once round it.
 */
export function puck(radius: number, height: number, edge: number, segments: number) {
  const points = [new Vector2(0, 0)]
  const steps = 6
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + (i / steps) * (Math.PI / 2)
    points.push(new Vector2(radius - edge + Math.cos(a) * edge, edge + Math.sin(a) * edge))
  }
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * (Math.PI / 2)
    points.push(new Vector2(radius - edge + Math.cos(a) * edge, height - edge + Math.sin(a) * edge))
  }
  points.push(new Vector2(0, height))
  return new LatheGeometry(points, segments)
}

/** Keeps u (once round a cylinder) and sets v from the height, y / tile, so stripes on poles of any height keep their size. */
export function vFromHeight(geometry: BufferGeometry, tile: number) {
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < position.count; i++) uv.setY(i, position.getY(i) / tile)
  uv.needsUpdate = true
  return geometry
}

/** Whether the sim point (x, z) is on track: on a slab and not in a hole (lily pads do not count). */
export function onTrack(course: Course, x: number, z: number) {
  if (!course.ground.some((g) => x >= g.x0 && x <= g.x1 && z >= g.z0 && z <= g.z1)) return false
  return !course.holes.some((h) => Math.hypot(x - h.x, z - h.z) < h.r)
}

/** Writes u and v from the vertex positions: u = (x - x0) / uLength, v = (y - y0) / vLength, so a repeating texture keeps its size whatever the shape's size. */
export function uvFromPosition(geometry: BufferGeometry, x0: number, uLength: number, y0: number, vLength: number) {
  const position = geometry.getAttribute('position')
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < position.count; i++) uv.setXY(i, (position.getX(i) - x0) / uLength, (position.getY(i) - y0) / vLength)
  uv.needsUpdate = true
  return geometry
}

// ------------------------------------------------------------------ paint on the track

/** At most this many slabs and holes may cut one decal. */
const CLIP_MAX = 16

const GROUND_CLIP = /* glsl */ `
uniform vec4 uSlabs[${CLIP_MAX}];
uniform int uSlabCount;
uniform vec3 uHoles[${CLIP_MAX}];
uniform int uHoleCount;
varying vec2 vGround;
bool onGround(vec2 p) {
  bool on = false;
  for (int i = 0; i < ${CLIP_MAX}; i++) {
    if (i >= uSlabCount) break;
    vec4 s = uSlabs[i];
    if (p.x >= s.x && p.x <= s.z && p.y >= s.y && p.y <= s.w) on = true;
  }
  for (int i = 0; i < ${CLIP_MAX}; i++) {
    if (i >= uHoleCount) break;
    if (distance(p, uHoles[i].xy) < uHoles[i].z) on = false;
  }
  return on;
}
`

/**
 * Keeps a decal lying on the track (an ice strip, a wind lane, a paddle's shadow) on
 * the track only: a fragment over water or inside a hole is thrown away, so paint never
 * pretends there is ground where a child must jump. The slabs and holes that meet the
 * sim rectangle x0..x1, z0..z1 are handed to the shader once.
 */
export function clipToGround(material: Material, course: Course, x0: number, x1: number, z0: number, z1: number) {
  const slabs: Vector4[] = []
  for (const g of course.ground) if (g.x0 < x1 && g.x1 > x0 && g.z0 < z1 && g.z1 > z0) slabs.push(new Vector4(g.x0, -g.z1, g.x1, -g.z0))
  const holes: Vector3[] = []
  for (const h of course.holes) if (h.x + h.r > x0 && h.x - h.r < x1 && h.z + h.r > z0 && h.z - h.r < z1) holes.push(new Vector3(h.x, -h.z, h.r))
  if (slabs.length > CLIP_MAX || holes.length > CLIP_MAX) throw new Error(`a decal over ${slabs.length} slabs and ${holes.length} holes; the clip takes at most ${CLIP_MAX} of each`)
  const slabCount = slabs.length
  const holeCount = holes.length
  while (slabs.length < CLIP_MAX) slabs.push(new Vector4())
  while (holes.length < CLIP_MAX) holes.push(new Vector3())
  material.customProgramCacheKey = () => 'ground-clip'
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSlabs = { value: slabs }
    shader.uniforms.uSlabCount = { value: slabCount }
    shader.uniforms.uHoles = { value: holes }
    shader.uniforms.uHoleCount = { value: holeCount }
    shader.vertexShader = `varying vec2 vGround;\n${shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n\tvGround = (modelMatrix * vec4(transformed, 1.0)).xz;')}`
    shader.fragmentShader = `${GROUND_CLIP}\n${shader.fragmentShader.replace('void main() {', 'void main() {\n\tif (!onGround(vGround)) discard;')}`
  }
}

// ------------------------------------------------------------------ motion

/** A ref callback that files the element into a list, for a few objects driven from one useFrame. */
export const refAt =
  <T>(list: { current: T[] }, i: number) =>
  (el: T | null) => {
    if (el) list.current[i] = el
  }

/** A soft toy's jiggle after a knock at `at`: it swings at `hz` from `amount` and dies away over `life` seconds; 0 before the knock and after it. */
export function jiggle(time: number, at: number, amount: number, hz: number, life: number) {
  const t = time - at
  if (at < 0 || t < 0 || t > life) return 0
  const fade = 1 - t / life
  return amount * fade * fade * Math.cos(t * hz * Math.PI * 2)
}

/** Overshoots its target a little and settles: 0 at u = 0, 1 at u = 1. */
export function easeOutBack(u: number) {
  const c = 1.70158
  const v = clamp01(u) - 1
  return 1 + (c + 1) * v * v * v + c * v * v
}

/** Things further ahead of the slime than this, or further behind, are not drawn: the fog has them, or the camera has passed them. */
export const DRAW_AHEAD = 125
export const DRAW_BEHIND = 30

/** How far off the scene's fog swallows everything, or Infinity without fog. */
export function fogReach(fog: Fog | FogExp2 | null) {
  if (fog === null) return Infinity
  if (fog instanceof Fog) return fog.far
  return 2 / fog.density
}

/** Whether something spanning sim z0..z1 is near enough to the slime to be drawn. */
export function nearSlime(sim: Sim, z0: number, z1: number) {
  const z = sim.slime.z
  return z1 > z - DRAW_BEHIND && z0 < z + DRAW_AHEAD
}

/**
 * Whether to draw a thing this frame, asked from its useFrame: near the slime, and on a
 * run's very first frame always, so every material compiles while the ready card is up
 * instead of with a hitch when the thing first comes near.
 */
export function useDrawNear(sim: Sim, z0: number, z1: number) {
  const first = useRef(true)
  return () => {
    if (first.current) {
      first.current = false
      return true
    }
    return nearSlime(sim, z0, z1)
  }
}
