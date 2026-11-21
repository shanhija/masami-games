import { type BufferGeometry, Color, DoubleSide, ExtrudeGeometry, type Material, MeshBasicMaterial, MeshStandardMaterial, Object3D, Shape, SphereGeometry, Vector2 } from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/**
 * The parts box for the slime, its clothes and its wardrobe: materials in a handful of
 * finishes and geometries, each made once the first time it is asked for and shared
 * after, and helpers that bake small parts into one geometry so a decoration of many
 * pieces (flowers, pearls, dots) draws at once.
 */

/** A full turn. */
export const TAU = Math.PI * 2
/** A position or a scale. */
export type V3 = [number, number, number]
/** A rotation with its order: XYZ, or YXZ for things set onto a surface (turned, then tipped, then spun in place). */
export type Turn = [number, number, number, 'XYZ' | 'YXZ']
/** No turn at all. */
export const STILL: Turn = [0, 0, 0, 'XYZ']

/** How a thing's surface looks: cloth, knitted wool, shiny satin, gold, silver, pearl, plain plastic or painted wood, clear or dark glass, see-through tulle, or something that shines by itself. */
export type Finish = 'cloth' | 'knit' | 'satin' | 'gold' | 'silver' | 'pearl' | 'plain' | 'glass' | 'shade' | 'tulle' | 'glow'

const materials = new Map<string, Material>()

/** The material of a colour and finish, made once and shared. Cloth is two-sided, so a band or a skirt still shows from inside through the jelly. */
export function mat(colour: string, finish: Finish): Material {
  const key = `${colour}:${finish}`
  const known = materials.get(key)
  if (known !== undefined) return known
  let m: Material
  switch (finish) {
    case 'cloth':
      m = new MeshStandardMaterial({ color: colour, roughness: 0.82, side: DoubleSide })
      break
    case 'knit':
      m = new MeshStandardMaterial({ color: colour, roughness: 1, side: DoubleSide })
      break
    case 'satin':
      m = new MeshStandardMaterial({ color: colour, roughness: 0.32, metalness: 0.12, side: DoubleSide })
      break
    case 'gold':
      m = new MeshStandardMaterial({ color: colour, roughness: 0.28, metalness: 0.5, emissive: colour, emissiveIntensity: 0.22 })
      break
    case 'silver':
      m = new MeshStandardMaterial({ color: colour, roughness: 0.22, metalness: 0.85 })
      break
    case 'pearl':
      m = new MeshStandardMaterial({ color: colour, roughness: 0.14, metalness: 0.08, emissive: '#fff0f4', emissiveIntensity: 0.1 })
      break
    case 'plain':
      m = new MeshStandardMaterial({ color: colour, roughness: 0.45 })
      break
    case 'glass':
      m = new MeshStandardMaterial({ color: colour, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.3, depthWrite: false })
      break
    case 'shade':
      m = new MeshStandardMaterial({ color: colour, roughness: 0.08, metalness: 0.4, transparent: true, opacity: 0.9 })
      break
    case 'tulle':
      m = new MeshStandardMaterial({ color: colour, roughness: 0.7, side: DoubleSide, transparent: true, opacity: 0.88 })
      break
    case 'glow':
      m = new MeshBasicMaterial({ color: colour })
      break
  }
  materials.set(key, m)
  return m
}

const tints = new Map<string, string>()

/** A colour made lighter (or darker, below 0) by `lightness`. */
export function tint(hex: string, lightness: number) {
  const key = `${hex}:${lightness}`
  const known = tints.get(key)
  if (known !== undefined) return known
  const made = `#${new Color(hex).offsetHSL(0, 0, lightness).getHexString()}`
  tints.set(key, made)
  return made
}

const geometries = new Map<string, BufferGeometry>()

/** A geometry made the first time it is asked for and shared after. */
export function geo(key: string, make: () => BufferGeometry) {
  const known = geometries.get(key)
  if (known !== undefined) return known
  const made = make()
  geometries.set(key, made)
  return made
}

/** Something built the first time it is asked for: decorations made of several merged parts. */
export function lazy<T>(make: () => T) {
  let made: T | null = null
  return () => {
    if (made === null) made = make()
    return made
  }
}

const holder = new Object3D()

/** A copy of `g` moved, turned and scaled: one part of a merged decoration. */
export function placed(g: BufferGeometry, position: V3, rotation: Turn, scale: V3 | number) {
  holder.position.set(position[0], position[1], position[2])
  holder.rotation.set(rotation[0], rotation[1], rotation[2], rotation[3])
  if (typeof scale === 'number') holder.scale.setScalar(scale)
  else holder.scale.set(scale[0], scale[1], scale[2])
  holder.updateMatrix()
  return (g.index === null ? g.clone() : g.toNonIndexed()).applyMatrix4(holder.matrix)
}

/** Many parts as one geometry, drawn at once. All of them indexed or none (`placed` gives none). */
export function merged(parts: BufferGeometry[]) {
  const g = mergeGeometries(parts)
  if (g === null) throw new Error('these parts do not merge into one geometry')
  return g
}

/** A unit ball for everything round that gets scaled. */
export const ROUND = new SphereGeometry(1, 24, 16)
/** The top half of a unit ball, open below: hat crowns, a turntable's bulbs. */
export const DOME = new SphereGeometry(1, 32, 12, 0, TAU, 0, Math.PI / 2)

/** A star with `points` points, `outer` and `inner` round. */
function starShape(points: number, outer: number, inner: number) {
  const s = new Shape()
  for (let i = 0; i < points * 2; i++) {
    const a = (i / (points * 2)) * TAU + Math.PI / 2
    const r = i % 2 === 0 ? outer : inner
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r)
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r)
  }
  return s
}

/** The outline of a heart about two units across, its middle at the origin. */
export function heartPoints() {
  const points: Vector2[] = []
  for (let i = 0; i < 64; i++) {
    const t = (i / 64) * TAU
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    points.push(new Vector2(x / 16, (y + 2.5) / 15))
  }
  return points
}

/** A flat shape made puffy like a sticker, about two units across, facing +Z. */
const puffy = (shape: Shape) => new ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 3, curveSegments: 16 }).translate(0, 0, -0.06)

/** A puffy five-pointed star and a puffy heart, about two units across, facing +Z: stickers and prints. */
export const STAR = lazy(() => puffy(starShape(5, 1, 0.5)))
export const HEART = lazy(() => puffy(new Shape(heartPoints())))
