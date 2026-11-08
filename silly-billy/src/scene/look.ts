import { MeshBasicMaterial, MeshStandardMaterial } from 'three'

import { CAMERA_PITCH, CAMERA_YAW, palette as castle } from '../../../castle-builder/src/scene/look'
import { parseColor } from '../engine/kit'

/**
 * Silly Billy's look: Castle Builder's diorama (its camera, its sun and sky fill, its
 * flat-shaded low-poly solids, imported from there) over three rooms of its own. Each
 * room is a thick slab floating on a light sky. Every ordinary solid shares one
 * flat-shaded material per colour; a model's shapes carry their colours as vertex colours
 * and all models share four materials between them.
 */
export const palette = {
  sky: castle.skyHorizon,
  sunlight: castle.sunlight,
  skyLight: castle.skyLight,
  groundLight: castle.groundLight,
  /** The playground: Castle Builder's meadow greens, a sand patch, a white fence. */
  grass: castle.grass,
  grassDark: '#5aa83c',
  dirt: castle.dirt,
  dirtDark: castle.dirtDark,
  sand: '#f0d9a0',
  sandDark: '#e0c27e',
  fence: '#fbf8f2',
  fenceShade: '#e8dcc8',
  blooms: ['#ff9ccf', '#f5d33b', '#ffffff', '#9b5fd3'],
  /** The pool: light tiles with pale grout, a white coping, the basin's blue tiles and the water. */
  tile: '#fbecd0',
  tileAlt: '#f4dfba',
  grout: '#fff8ea',
  coping: '#ffffff',
  basin: '#7fd3ee',
  basinDark: '#5fbfe0',
  lane: '#2f6fb8',
  water: castle.water,
  slabStone: '#e4ddd0',
  /** The forest: moss, a dirt path, the pond, pines and leafy trees round the edge. */
  moss: ['#4f8c3e', '#5f9e48', '#447f36'],
  mossLight: '#79b55a',
  path: '#b08a5e',
  pathDark: '#957049',
  pondFloor: '#4d5a36',
  pondWall: '#5a4630',
  pond: '#4aa6c8',
  lily: '#5ec25a',
  pine: ['#2f7a3a', '#3f8e46', '#276b33'],
  leaves: castle.leaves,
  trunk: castle.trunk,
  rock: castle.rock,
  rockDark: castle.rockDark,
  /** Faces. */
  ink: '#2b2b30',
  white: '#ffffff',
  mouth: '#5a1e24',
  tongue: '#ff7f9a',
  blush: '#ff9a9a',
  angry: '#ff5a4a',
  heart: '#ff4f7b',
  nose: '#ff8fa3',
  drop: '#8fdcf5',
  whisker: '#4a4a50',
  /** The glints round a thing still being made. */
  glint: '#fff6c2',
} as const

/** The diorama frame keeps this much ground around its aim: less than Castle Builder's 24, so the avatars read. */
export const FRAME_R = 15

/** Turns a flat thing that faces +z to face the camera: tipped back by the camera's pitch, then round by its yaw. */
export const FACE_CAMERA = [-CAMERA_PITCH, CAMERA_YAW, 0, 'YXZ'] as const

/** Any colour the world may hold ('#ff69b4', 'pink') as '#rrggbb'; one the kit would not know is grey, as the kit makes it. */
export const colorOf = (c: string) => parseColor(c) ?? '#9aa3ad'

const flats = new Map<string, MeshStandardMaterial>()

/** The flat-shaded solid of a colour, made once and shared by everything that colour. */
export function flat(color: string): MeshStandardMaterial {
  const hex = colorOf(color)
  let m = flats.get(hex)
  if (m === undefined) {
    m = new MeshStandardMaterial({ color: hex, flatShading: true, roughness: 0.9 })
    flats.set(hex, m)
  }
  return m
}

const glows = new Map<string, MeshBasicMaterial>()

/** Something that lights itself, not lit by the sun: a lamp, fire, magic, a face's glint. */
export function glow(color: string): MeshBasicMaterial {
  const hex = colorOf(color)
  let m = glows.get(hex)
  if (m === undefined) {
    m = new MeshBasicMaterial({ color: hex })
    glows.set(hex, m)
  }
  return m
}

/** The four materials every model is drawn with: its solid and glowing shapes, and the same see-through while it is still a draft. */
export const MODEL = {
  solid: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }),
  glow: new MeshBasicMaterial({ vertexColors: true }),
  draftSolid: new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, transparent: true, opacity: 0.6, depthWrite: false, emissive: '#ffffff', emissiveIntensity: 0.2 }),
  draftGlow: new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false }),
}

/** What a finger can catch but nobody sees: the big tap target round an actor. */
export const UNSEEN = new MeshBasicMaterial({ visible: false })

/** The scene's own clock for what only looks alive (water, cogs, blinks, the draft's pulse): it stops while the game is paused. */
export interface Clock {
  t: number
}
