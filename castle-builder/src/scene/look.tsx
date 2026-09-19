import type { Material, Mesh, Object3D } from 'three'

import { DAWN_FROM, GOODS, NIGHT_FROM, dayFrac, type Colour, type Good, type Sim } from '../game/sim'

/**
 * The look: a toy castle on a round meadow island, seen from high up at noon. Every
 * solid is flat-shaded low-poly in one fixed palette: one stone cream, one castle
 * blue for every castle roof, one warm wood for every workshop, one gold for the
 * finials and the crown, and exactly four dye colours that flowers, dye pots, banners,
 * dresses and confetti all share. Nothing here is toon-shaded or outlined; the
 * shading comes from crisp facets, one warm sun and real shadows.
 */
export const palette = {
  /** Behind everything: the frame never reaches the sky, so this is the colour past the far water, by day, in the blue evening and under a storm. */
  skyHorizon: '#d6eeff',
  nightHorizon: '#5a6fb8',
  stormHorizon: '#9aa3b4',
  /** The lights: the sun by day and in the evening, the sky and the ground of the hemisphere fill. */
  sunlight: '#fff4e0',
  moonlight: '#cfd8ff',
  skyLight: '#bfe4ff',
  groundLight: '#6e9e48',
  cloud: '#ffffff',
  grumpy: '#8d95a8',
  grumpyDark: '#6b7387',
  rain: '#bfe3ff',
  bolt: '#fffbe6',
  rainbow: ['#e8503f', '#f5a13b', '#f5d33b', '#5ec25a', '#4a78e0', '#9b5fd3'],
  /** The meadow: three greens the ground blends between, a lawn for inside the walls, the dirt underneath, the water around. */
  grass: ['#7cc850', '#6bb844', '#8fd45e'],
  lawn: '#93d66a',
  dirt: '#8a6a4a',
  dirtDark: '#6e5238',
  water: '#58c4e8',
  waterLight: '#8fdcf5',
  foam: '#e8f8ff',
  puddle: '#7fd0f0',
  cobble: '#b9b2a8',
  cobbleDark: '#a39c92',
  /** Nodes on the meadow. */
  trunk: '#8a5a34',
  leaves: ['#3f9e4a', '#4fb35a', '#2f8a3f'],
  stump: '#a97a4e',
  rock: '#9aa3ad',
  rockDark: '#7d868f',
  oreRock: '#6e7683',
  oreGold: '#f2c14e',
  woolWhite: '#fbf8f2',
  sheepFace: '#2b2b30',
  sheepPink: '#f7b8c4',
  stem: '#4fa04a',
  /** The castle. */
  stone: '#ede6d6',
  stoneShade: '#d9d0bc',
  stoneBase: '#b9ae9a',
  castleRoof: '#3b5fcb',
  wood: '#b5773e',
  woodDark: '#8f5c2c',
  plank: '#d3a166',
  gold: '#f2c14e',
  goldDark: '#c99a2e',
  iron: '#5e6570',
  ironLight: '#8b939e',
  window: '#ffd27a',
  windowDay: '#a8d8f0',
  door: '#6b4a2b',
  hammerSign: '#f2c14e',
  fire: ['#ff6a2a', '#ffa030', '#ffe066'],
  smoke: '#c9ced6',
  steam: '#f4f7fa',
  water2: '#5fb8ff',
  fountain: '#7fd0f0',
  /** People. */
  skin: '#ffd9b3',
  eye: '#2b2b30',
  cape: '#ff3b30',
  heroTunic: '#4a78e0',
  heroBoots: '#5a3a24',
  crown: '#f2c14e',
  king: '#9b5fd3',
  kingRobe: '#e8503f',
  ermine: '#fbf8f2',
  worker: { woodcutter: '#5ec25a', mason: '#9aa3ad', smithy: '#3f3f48', weaver: '#f5d33b', dyer: '#9b5fd3' },
  apron: '#e8dcc8',
  hat: '#8f5c2c',
  /** The four dye colours: red, yellow, blue, purple. */
  dye: ['#e8503f', '#f5d33b', '#4a78e0', '#9b5fd3'],
  confetti: ['#e8503f', '#f5d33b', '#4a78e0', '#9b5fd3', '#f2c14e', '#ffffff'],
  dust: '#d9cfbb',
  sparkle: '#fff6c2',
  cellRing: '#ffffff',
  arrow: '#f2c14e',
} as const

export const dyeHex = (c: Colour | number) => palette.dye[((c % 4) + 4) % 4]!

/** Where each good's pile sits in the yard in front of the keep: raw goods in the front row, made goods behind. Flights land here. */
export function pileAt(good: Good) {
  const i = GOODS.indexOf(good)
  return { x: -1.8 + (i % 5) * 0.7, z: i < 5 ? 3.3 : 5.3 }
}
/** The well, in the corner of the yard: where the hero's buckets come from. */
export const WELL = { x: 1.7, z: 4.4 }
/** The keep: a round tower this wide, this tall at first, growing this much per level; the King's balcony on its front. */
export const KEEP_RADIUS = 2.0
export const KEEP_BASE_H = 7
export const KEEP_STOREY_H = 1.6
export const BALCONY = { x: 0, y: 4.2, z: 2.3 }
/** How tall the keep is right now: it grows a storey as the castle grows. */
export const keepHeight = (s: Sim) => KEEP_BASE_H + s.keepLevel * KEEP_STOREY_H

/** The diorama frame, which every flat thing turns to: 35 degrees off +Z toward +X, pitched 52 degrees down, through a long 30 degree lens. */
export const CAMERA_YAW = (35 * Math.PI) / 180
export const CAMERA_PITCH = (52 * Math.PI) / 180
export const CAMERA_FOV = 30
/** Half the lens angle, in radians: its tangent is how much ground lies each side of the aim per unit of camera distance, times the aspect. */
export const CAMERA_HALF_FOV = (CAMERA_FOV * Math.PI) / 360
/** How much ground lies between the aim and the bottom of the frame, per unit of camera distance: the pitch and the lens decide it. */
export const GROUND_AHEAD = Math.cos(CAMERA_PITCH) - Math.sin(CAMERA_PITCH) / Math.tan(CAMERA_PITCH + CAMERA_HALF_FOV)
/** The radius of ground the camera keeps in front of and across the aim, which is what sets how far back it stands. */
export const FRAME_R = 24

/** A flat-shaded solid: the one material every ordinary thing wears. */
export function Flat({ color }: { color: string }) {
  return <meshStandardMaterial color={color} flatShading roughness={0.9} />
}

/** The white flat material for an instanced mesh whose copies each carry a colour of their own. */
export function Tinted() {
  return <meshStandardMaterial flatShading roughness={0.9} />
}

/** Gold and iron: a little shine so the finials and the bell catch the sun. */
export function Shiny({ color, iron = false }: { color: string; iron?: boolean }) {
  return <meshStandardMaterial color={color} flatShading roughness={iron ? 0.5 : 0.35} metalness={iron ? 0.8 : 0.6} />
}

/** Something that glows on its own: a lit window, a lantern, the sun, fire. */
export function Glow({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} />
}

/** Hides or shows a whole subtree: three.js skips an invisible one, so nothing under it is drawn, lit or shadowed. */
export function show(g: Object3D, on: boolean) {
  g.visible = on
}

/** Fades something Glow drew: Glow takes a fixed opacity, so a fade reaches the material through its mesh. */
export function setOpacity(m: Mesh, opacity: number) {
  ;(m.material as Material).opacity = opacity
}

/** A ref callback that files the element into a list, for a few meshes driven from one useFrame. */
export const refAt =
  <T,>(list: { current: T[] }, i: number) =>
  (el: T | null) => {
    if (el) list.current[i] = el
  }

/**
 * Where the day is: `night` rises from 0 to 1 over the evening and falls back at dawn,
 * and is never a real night; `light` is how bright the sun is, never under 0.6.
 */
export function daylight(s: Sim): { night: number; light: number } {
  const f = dayFrac(s)
  let night = 0
  if (f >= NIGHT_FROM && f < DAWN_FROM) night = Math.min(1, (f - NIGHT_FROM) / 0.05)
  else if (f >= DAWN_FROM) night = Math.max(0, 1 - (f - DAWN_FROM) / 0.05)
  return { night, light: 1 - 0.4 * night }
}

/**
 * The one shape each good has, everywhere: on the meadow, in the flight arc, in the
 * piles at the keep, in a worker's bubble, on the workshop sign. About one unit tall.
 * A child recognises the log wherever it turns up, so nothing needs a word.
 */
export function GoodMesh({ good, colour = 0 }: { good: Good; colour?: number }) {
  switch (good) {
    case 'wood':
      return (
        <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.22, 0.22, 0.9, 7]} />
          <Flat color={palette.trunk} />
        </mesh>
      )
    case 'planks':
      return (
        <group>
          {[-0.14, 0, 0.14].map((y, i) => (
            <mesh key={i} position={[0, y + 0.14, 0]} rotation={[0, i * 0.12, 0]} castShadow>
              <boxGeometry args={[0.95, 0.1, 0.32]} />
              <Flat color={palette.plank} />
            </mesh>
          ))}
        </group>
      )
    case 'stone':
      return (
        <mesh castShadow>
          <dodecahedronGeometry args={[0.36, 0]} />
          <Flat color={palette.rock} />
        </mesh>
      )
    case 'blocks':
      return (
        <mesh castShadow>
          <boxGeometry args={[0.6, 0.6, 0.6]} />
          <Flat color={palette.stoneShade} />
        </mesh>
      )
    case 'ore':
      return (
        <group>
          <mesh castShadow>
            <dodecahedronGeometry args={[0.36, 0]} />
            <Flat color={palette.oreRock} />
          </mesh>
          {[
            [0.2, 0.15, 0.2],
            [-0.22, 0.05, 0.18],
            [0.05, -0.2, 0.28],
          ].map((p, i) => (
            <mesh key={i} position={[p[0]!, p[1]!, p[2]!]}>
              <sphereGeometry args={[0.09, 6, 5]} />
              <Shiny color={palette.oreGold} />
            </mesh>
          ))}
        </group>
      )
    case 'iron':
      return (
        <mesh castShadow>
          <boxGeometry args={[0.8, 0.28, 0.32]} />
          <Shiny color={palette.iron} iron />
        </mesh>
      )
    case 'wool':
      return (
        <mesh castShadow>
          <icosahedronGeometry args={[0.36, 1]} />
          <Flat color={palette.woolWhite} />
        </mesh>
      )
    case 'cloth':
      return (
        <mesh castShadow>
          <boxGeometry args={[0.7, 0.24, 0.7]} />
          <Flat color={palette.woolWhite} />
        </mesh>
      )
    case 'colourcloth':
      return (
        <mesh castShadow>
          <boxGeometry args={[0.7, 0.24, 0.7]} />
          <Flat color={dyeHex(colour)} />
        </mesh>
      )
    case 'flowers':
      return (
        <group>
          {[0, 1, 2].map((i) => (
            <group key={i} position={[(i - 1) * 0.22, 0, (i % 2) * 0.12 - 0.06]}>
              <mesh position={[0, 0.2, 0]}>
                <cylinderGeometry args={[0.03, 0.03, 0.4, 5]} />
                <Flat color={palette.stem} />
              </mesh>
              <mesh position={[0, 0.45, 0]}>
                <sphereGeometry args={[0.13, 7, 6]} />
                <Flat color={dyeHex(i)} />
              </mesh>
            </group>
          ))}
        </group>
      )
  }
}
