/**
 * What the scene's files share: flat shapes and puffy stickers, textures drawn on a
 * canvas, parts baked into one geometry, the gold key, an easing, and keeping what is
 * made once. Geometry, materials and pictures that never change are made on first use and
 * kept for the page's life, so a new run reuses them instead of making (and leaking) new ones.
 */

import {
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  ExtrudeGeometry,
  MeshStandardMaterial,
  NoColorSpace,
  Object3D,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import { palette } from './look'
import type { Turn, V3 } from './toy'

/** A flat star with `points` points in the x-y plane, facing +z: `r` out to the points, `inner` of that to the dips. Four points make a water sparkle, five a star. */
export function starGeometry(points: number, r: number, inner: number) {
  const s = new Shape()
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2
    const d = i % 2 === 0 ? r : r * inner
    if (i === 0) s.moveTo(Math.cos(a) * d, Math.sin(a) * d)
    else s.lineTo(Math.cos(a) * d, Math.sin(a) * d)
  }
  s.closePath()
  return new ShapeGeometry(s)
}

/** A star's outline with `points` points, one of them up: `outer` out to the points and `inner` to the dips. */
export function starShape(points: number, outer: number, inner: number) {
  const s = new Shape()
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * Math.PI * 2 + Math.PI / 2
    const r = i % 2 === 0 ? outer : inner
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  return s
}

/** The flat five-pointed star two units across, facing +z: dizzy stars, bursts of stars and the big stars in the night sky. */
export const FLAT_STAR = once(() => starGeometry(5, 1, 0.45))

/** The outline of a heart about two units across, its middle at the origin, its point down. */
export function heartPoints() {
  const points: Vector2[] = []
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * Math.PI * 2
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    points.push(new Vector2(x / 16, (y + 2.5) / 15))
  }
  return points
}

/** A flat heart about two units across in the x-y plane, facing +z, its point down. */
export function heartGeometry() {
  return new ShapeGeometry(new Shape(heartPoints()))
}

/** A flat shape made puffy like a sticker, about two units across, facing +z. */
const puffy = (shape: Shape) => new ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 3, curveSegments: 16 }).translate(0, 0, -0.06)

/** A puffy five-pointed star and a puffy heart, about two units across, facing +z: stickers and prints. */
export const STAR = once(() => puffy(starShape(5, 1, 0.5)))
export const HEART = once(() => puffy(new Shape(heartPoints())))

/** Makes `make` run once and hand out what it made from then on. */
export function once<V>(make: () => V) {
  let v: V | null = null
  return () => {
    if (v === null) v = make()
    return v
  }
}

/** Makes `make` remember what it made for each key. */
export function cached<K, V>(make: (key: K) => V) {
  const kept = new Map<K, V>()
  return (key: K) => {
    let v = kept.get(key)
    if (v === undefined) {
      v = make(key)
      kept.set(key, v)
    }
    return v
  }
}

/** A texture drawn once on a canvas, repeating both ways: in sRGB when it is a picture, linear when it is data (an alpha map). */
export function canvasTexture(width: number, height: number, picture: boolean, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx === null) throw new Error('this browser gives no 2D canvas')
  draw(ctx)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = picture ? SRGBColorSpace : NoColorSpace
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.anisotropy = 4
  return texture
}

const holder = new Object3D()

/** A copy of `geometry` moved, turned and scaled: one part of a merged decoration. */
export function placed(geometry: BufferGeometry, position: Readonly<V3>, turn: Readonly<Turn>, scale: Readonly<V3> | number) {
  holder.position.set(position[0], position[1], position[2])
  holder.rotation.set(turn[0], turn[1], turn[2], turn[3])
  if (typeof scale === 'number') holder.scale.setScalar(scale)
  else holder.scale.set(scale[0], scale[1], scale[2])
  holder.updateMatrix()
  return (geometry.index === null ? geometry.clone() : geometry.toNonIndexed()).applyMatrix4(holder.matrix)
}

/** Many parts as one geometry, drawn at once. All of them indexed or none (`placed` gives none). */
export function merged(parts: BufferGeometry[]) {
  const g = mergeGeometries(parts)
  if (g === null) throw new Error('these parts do not merge into one geometry')
  return g
}

/** The shiny gold of the key (and of the ring on the measuring pole), and the red gem in the key's ring. */
export const GOLD = once(() => new MeshStandardMaterial({ color: palette.gold, metalness: 0.55, roughness: 0.25, emissive: palette.goldDeep, emissiveIntensity: 0.35 }))
export const GEM = once(() => new MeshStandardMaterial({ color: palette.boxRed, roughness: 0.2 }))

/**
 * The gold key, about 1.2 tall, standing up in the x-y plane with its ring at the top:
 * the ring, the shaft and two rounded teeth sticking out toward +x as one geometry for
 * GOLD, and the gem in the middle of the ring as another for GEM.
 */
export const keyParts = once(() => ({
  gold: merged([
    new TorusGeometry(0.24, 0.085, 12, 28).toNonIndexed().translate(0, 0.36, 0),
    new CylinderGeometry(0.065, 0.065, 0.76, 12).toNonIndexed().translate(0, -0.12, 0),
    ...[-0.42, -0.24].map((y) => new RoundedBoxGeometry(0.18, 0.1, 0.09, 2, 0.03).translate(0.11, y, 0)),
  ]),
  gem: new SphereGeometry(0.09, 14, 10).translate(0, 0.36, 0),
}))

/** A quick overshoot then settle, for things that pop into place: 0 at 0, 1 at 1, a little past 1 between. */
export function easeOutBack(k: number) {
  const c = 1.7
  const u = k - 1
  return 1 + (c + 1) * u * u * u + c * u * u
}
