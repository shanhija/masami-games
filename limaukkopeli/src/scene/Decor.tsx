/**
 * Each island's scenery in the water beside the track: little round tree islands and
 * ducks in the Park, palm islets, umbrellas and sailing boats at the Beach, lollipops,
 * candy canes and gumdrops in Candy Land, snowy islets with fir trees, snowmen and
 * penguins on ice floes in Snow Land, glowing mushrooms, firefly trees and lanterns on
 * Star Night. Everything is a few rounded parts, every part is one copy in an instanced
 * mesh per shape and finish, and the layout comes from a seed made of the course id, so
 * a course looks the same every time. It keeps clear of the track, the side paths, the
 * spinners' sweep and the finish and tower, where the camera needs a clear view.
 */

import { useFrame } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferGeometry, Color, CylinderGeometry, Euler, InstancedMesh, LatheGeometry, Matrix4, MeshBasicMaterial, MeshStandardMaterial, Quaternion, SphereGeometry, TorusGeometry, Vector2, Vector3, type Material } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

import { clamp, mod, mulberry32 } from '../game/math'
import { TRAMPOLINE_DZ, type Course, type CourseId, type Sim } from '../game/model'
import { palette, type Theme } from './look'
import { WATER_Y } from './place'
import { once } from './shapes'

type Geo = 'ball' | 'bead' | 'dome' | 'stick' | 'cone' | 'ring' | 'loop' | 'hook' | 'box'
type Finish = 'matte' | 'shiny' | 'glow'
/** How a thing moves: not at all, bobbing on the water, swimming round in a small circle, sailing to and fro, or rising into the sky. */
type Motion = 'still' | 'bob' | 'swim' | 'sail' | 'rise'

/** One rounded part of a thing, placed in the thing's own space (y up from the water, facing +z): where, how big along each axis, and turned how (applied z, then x, then y). */
interface Part {
  geo: Geo
  colour: string
  finish: Finish
  at: readonly [number, number, number]
  size: readonly [number, number, number]
  turn: readonly [number, number, number]
}

interface Kind {
  parts: readonly Part[]
  motion: Motion
  /** The room it keeps round it, at scale 1. */
  room: number
  /** It has a face, so it stands turned toward the track rather than any old way. */
  facing: boolean
}

const STRAIGHT = [0, 0, 0] as const
/** A part; most parts stand straight, so `turn` is left out for them. A ball smaller than a bead (an eye, a button, a sprinkle) is drawn as a bead, with far fewer faces. */
const part = (geo: Geo, colour: string, finish: Finish, at: readonly [number, number, number], size: readonly [number, number, number] | number, turn: readonly [number, number, number] = STRAIGHT): Part => {
  const s: readonly [number, number, number] = typeof size === 'number' ? [size, size, size] : size
  return { geo: geo === 'ball' && Math.max(...s) < BEAD ? 'bead' : geo, colour, finish, at, size: s, turn }
}
const BEAD = 0.16

// ------------------------------------------------------------------ the things

/** A tree: a trunk and three round leaf balls, standing at `x`, `z` on whatever it grows from. */
function tree(x: number, y: number, z: number, s: number, leaves: readonly [string, string, string], trunk: string): Part[] {
  return [
    part('stick', trunk, 'matte', [x, y + 0.65 * s, z], [0.2 * s, 1.3 * s, 0.2 * s]),
    part('ball', leaves[0], 'matte', [x, y + 1.75 * s, z], [1.05 * s, 0.95 * s, 1.05 * s]),
    part('ball', leaves[1], 'matte', [x + 0.55 * s, y + 1.4 * s, z + 0.25 * s], [0.7 * s, 0.62 * s, 0.7 * s]),
    part('ball', leaves[2], 'matte', [x - 0.5 * s, y + 1.5 * s, z - 0.2 * s], [0.66 * s, 0.6 * s, 0.66 * s]),
  ]
}

/** A fir: a trunk, three rounded tiers and a snowy tip. */
function fir(x: number, y: number, z: number, s: number): Part[] {
  return [
    part('stick', '#8a5a34', 'matte', [x, y + 0.3 * s, z], [0.16 * s, 0.6 * s, 0.16 * s]),
    part('cone', '#3f9e6a', 'matte', [x, y + 0.45 * s, z], [1.0 * s, 1.2 * s, 1.0 * s]),
    part('cone', '#48aa74', 'matte', [x, y + 1.15 * s, z], [0.78 * s, 1.0 * s, 0.78 * s]),
    part('cone', '#52b67e', 'matte', [x, y + 1.75 * s, z], [0.55 * s, 0.85 * s, 0.55 * s]),
    part('cone', '#ffffff', 'matte', [x, y + 2.25 * s, z], [0.26 * s, 0.38 * s, 0.26 * s]),
  ]
}

/** A palm on its sand: a leaning trunk in three pieces, five drooping fronds and two coconuts. */
function palm(): Part[] {
  const top = [0.62, 3.15, 0] as const
  const fronds = [0, 1, 2, 3, 4].map((k) => {
    const yaw = (k / 5) * Math.PI * 2 + 0.3
    return part('ball', k % 2 === 0 ? '#4fb35a' : '#5fc464', 'matte', [top[0] + Math.cos(yaw) * 0.75, top[1] - 0.18, top[2] - Math.sin(yaw) * 0.75], [1.05, 0.11, 0.3], [0, yaw, -0.35])
  })
  return [
    part('dome', '#f6e0a2', 'matte', [0, -0.12, 0], [2.1, 0.62, 2.1]),
    part('stick', '#b98a54', 'matte', [0.06, 0.9, 0], [0.2, 1.05, 0.2], [0, 0, -0.08]),
    part('stick', '#a87a46', 'matte', [0.19, 1.85, 0], [0.18, 1.0, 0.18], [0, 0, -0.2]),
    part('stick', '#b98a54', 'matte', [0.42, 2.72, 0], [0.16, 0.95, 0.16], [0, 0, -0.32]),
    ...fronds,
    part('ball', '#7a4f2a', 'matte', [0.55, 3.0, 0.16], 0.14),
    part('ball', '#7a4f2a', 'matte', [0.7, 2.96, -0.12], 0.13),
  ]
}

function kinds(theme: Theme): Record<string, Kind> {
  const [a0, a1, a2, a3] = theme.accent
  const grass = '#7ccf5e'
  const sand = '#f2dc9c'
  const parkLeaves = ['#4caf50', '#66c26b', '#3f9a48'] as const
  return {
    // ------------------------------------------------ park
    treeIslet: {
      motion: 'still',
      facing: false,
      room: 2.3,
      parts: [part('dome', grass, 'matte', [0, -0.15, 0], [2.0, 0.6, 2.0]), part('stick', sand, 'matte', [0, 0, 0], [2.25, 0.1, 2.25]), ...tree(0, 0.3, 0, 1, parkLeaves, '#9a6436')],
    },
    bushIslet: {
      motion: 'still',
      facing: false,
      room: 1.4,
      parts: [
        part('dome', '#86d466', 'matte', [0, -0.1, 0], [1.25, 0.5, 1.25]),
        part('ball', '#58b85e', 'matte', [0.2, 0.5, 0], 0.55),
        part('ball', '#6cc76a', 'matte', [-0.38, 0.38, 0.2], 0.42),
        part('ball', '#ff8fc8', 'shiny', [0.1, 0.72, 0.42], 0.12),
        part('ball', '#ffd23f', 'shiny', [-0.42, 0.62, -0.22], 0.11),
        part('ball', '#ffffff', 'shiny', [0.5, 0.5, 0.35], 0.1),
      ],
    },
    duck: {
      motion: 'swim',
      facing: false,
      room: 1.4,
      parts: [
        part('ball', '#ffd23f', 'shiny', [0, 0.12, 0], [0.42, 0.3, 0.55]),
        part('ball', '#ffc21f', 'shiny', [0.34, 0.2, -0.05], [0.1, 0.18, 0.32]),
        part('ball', '#ffc21f', 'shiny', [-0.34, 0.2, -0.05], [0.1, 0.18, 0.32]),
        part('ball', '#ffd23f', 'shiny', [0, 0.28, -0.48], [0.14, 0.13, 0.16]),
        part('ball', '#ffd23f', 'shiny', [0, 0.52, 0.3], 0.25),
        part('ball', '#ff9f43', 'shiny', [0, 0.47, 0.55], [0.13, 0.06, 0.14]),
        part('ball', palette.ink, 'shiny', [0.12, 0.58, 0.47], 0.045),
        part('ball', palette.ink, 'shiny', [-0.12, 0.58, 0.47], 0.045),
      ],
    },
    lily: {
      motion: 'bob',
      facing: false,
      room: 0.9,
      parts: [part('stick', '#5ec25a', 'matte', [0, 0.02, 0], [0.62, 0.04, 0.62]), part('ball', '#ffb3dd', 'shiny', [0.18, 0.1, 0.12], [0.16, 0.1, 0.16]), part('ball', '#ffe066', 'shiny', [0.18, 0.16, 0.12], 0.06)],
    },
    bigIsland: {
      motion: 'still',
      facing: false,
      room: 5,
      parts: [
        part('dome', grass, 'matte', [0, -0.3, 0], [5.2, 1.4, 4.2]),
        part('stick', sand, 'matte', [0, 0, 0], [5.6, 0.1, 4.6]),
        ...tree(-1.6, 0.9, 0.4, 1.4, parkLeaves, '#9a6436'),
        ...tree(1.4, 0.8, -0.6, 1.2, parkLeaves, '#9a6436'),
        ...tree(0.2, 1.0, 1.4, 1.0, parkLeaves, '#9a6436'),
      ],
    },
    // ------------------------------------------------ beach
    palm: { motion: 'still', facing: false, room: 2.3, parts: palm() },
    umbrella: {
      motion: 'still',
      facing: false,
      room: 1.9,
      parts: [
        part('dome', '#f6e0a2', 'matte', [0, -0.1, 0], [1.7, 0.5, 1.7]),
        part('stick', '#ffffff', 'shiny', [0, 1.05, 0], [0.05, 1.9, 0.05]),
        part('cone', a0, 'shiny', [0, 1.7, 0], [1.25, 0.5, 1.25]),
        part('cone', '#ffffff', 'shiny', [0, 1.95, 0], [0.55, 0.26, 0.55]),
        part('ball', a2, 'shiny', [0, 2.24, 0], 0.08),
        part('box', a1, 'matte', [0.55, 0.4, 0.35], [0.85, 0.05, 0.5], [0, 0.4, 0]),
      ],
    },
    boat: {
      motion: 'sail',
      facing: false,
      room: 2.6,
      parts: [
        part('ball', '#e8503f', 'shiny', [0, 0.02, 0], [0.62, 0.3, 1.3]),
        part('ball', '#ffffff', 'shiny', [0, 0.16, 0], [0.6, 0.3, 1.28]),
        part('stick', '#9a6436', 'matte', [0, 1.3, 0.12], [0.06, 2.3, 0.06]),
        part('cone', '#ffffff', 'shiny', [0, 0.42, -0.32], [0.035, 1.9, 0.78]),
        part('cone', a1, 'shiny', [0, 0.42, 0.58], [0.03, 1.4, 0.42]),
        part('box', a0, 'shiny', [0, 2.42, 0.28], [0.03, 0.18, 0.32]),
      ],
    },
    ringFloat: {
      motion: 'bob',
      facing: false,
      room: 1,
      parts: [part('ring', a0, 'shiny', [0, 0.06, 0], 0.5, [Math.PI / 2, 0, 0]), part('ring', '#ffffff', 'shiny', [0, 0.08, 0], [0.5, 0.5, 0.25], [Math.PI / 2, 0.8, 0])],
    },
    // ------------------------------------------------ candy
    lollipop: {
      motion: 'still',
      facing: false,
      room: 1.6,
      parts: [
        part('dome', '#ffd9ef', 'matte', [0, -0.1, 0], [0.9, 0.3, 0.9]),
        part('stick', '#fffaf0', 'shiny', [0, 1.2, 0], [0.07, 2.4, 0.07]),
        part('stick', a0, 'shiny', [0, 2.62, 0], [0.78, 0.18, 0.78], [Math.PI / 2, 0, 0]),
        part('loop', '#ffffff', 'shiny', [0, 2.62, 0.1], 0.5),
        part('loop', '#ffffff', 'shiny', [0, 2.62, 0.1], 0.24),
        part('loop', '#ffffff', 'shiny', [0, 2.62, -0.1], 0.5),
      ],
    },
    cane: {
      motion: 'still',
      facing: false,
      room: 1.3,
      parts: [
        ...[0, 1, 2, 3, 4, 5].map((k) => part('stick', k % 2 === 0 ? '#ff3b5c' : '#ffffff', 'shiny', [0, 0.18 + k * 0.36, 0], [0.13, 0.37, 0.13])),
        part('hook', '#ff3b5c', 'shiny', [0.36, 2.15, 0], 0.36),
        part('stick', '#ffffff', 'shiny', [0.72, 2.02, 0], [0.13, 0.26, 0.13]),
      ],
    },
    gumdrops: {
      motion: 'still',
      facing: false,
      room: 2.1,
      parts: [
        part('ball', '#ff7fbf', 'shiny', [0, 0, 0], [0.85, 1.0, 0.85]),
        part('ball', '#ffd23f', 'shiny', [1.1, 0, 0.4], [0.62, 0.78, 0.62]),
        part('ball', '#7fe6c0', 'shiny', [-0.9, 0, 0.55], [0.55, 0.7, 0.55]),
        part('ball', '#c58bff', 'shiny', [0.3, 0, -1.0], [0.5, 0.62, 0.5]),
        part('ball', '#ffffff', 'shiny', [0.25, 0.85, 0.35], 0.07),
        part('ball', '#ffffff', 'shiny', [-0.3, 0.75, 0.4], 0.06),
        part('ball', '#ffffff', 'shiny', [1.2, 0.62, 0.65], 0.06),
      ],
    },
    cottonCandy: {
      motion: 'still',
      facing: false,
      room: 1.4,
      parts: [
        part('stick', '#fffaf0', 'shiny', [0, 0.9, 0], [0.06, 1.8, 0.06]),
        part('ball', '#ffb3dd', 'matte', [0, 2.05, 0], 0.62),
        part('ball', '#ffc8e7', 'matte', [0.42, 2.25, 0.15], 0.42),
        part('ball', '#ff9fd0', 'matte', [-0.38, 2.3, -0.1], 0.4),
        part('ball', '#ffd9ef', 'matte', [0.05, 2.55, 0.1], 0.36),
      ],
    },
    donut: {
      motion: 'bob',
      facing: false,
      room: 1.1,
      parts: [
        part('ring', '#e8b07a', 'matte', [0, 0.04, 0], 0.55, [Math.PI / 2, 0, 0]),
        part('ring', a1, 'shiny', [0, 0.1, 0], [0.55, 0.55, 0.5], [Math.PI / 2, 0, 0]),
        part('box', a2, 'shiny', [0.3, 0.2, 0.2], [0.12, 0.03, 0.04], [0, 0.5, 0]),
        part('box', a3, 'shiny', [-0.25, 0.2, 0.28], [0.12, 0.03, 0.04], [0, -0.7, 0]),
        part('box', '#ffffff', 'shiny', [0.05, 0.2, -0.38], [0.12, 0.03, 0.04], [0, 1.2, 0]),
      ],
    },
    // ------------------------------------------------ snow
    firIslet: {
      motion: 'still',
      facing: false,
      room: 2.2,
      parts: [part('dome', '#f5fbff', 'matte', [0, -0.15, 0], [1.9, 0.62, 1.9]), ...fir(0, 0.3, 0, 1), ...fir(0.95, 0.15, 0.55, 0.6)],
    },
    snowman: {
      motion: 'still',
      facing: true,
      room: 1.8,
      parts: [
        part('dome', '#f5fbff', 'matte', [0, -0.15, 0], [1.6, 0.52, 1.6]),
        part('ball', '#ffffff', 'matte', [0, 0.62, 0], 0.62),
        part('ball', '#ffffff', 'matte', [0, 1.42, 0], 0.46),
        part('ball', '#ffffff', 'matte', [0, 2.02, 0], 0.34),
        part('cone', '#ff8a2a', 'shiny', [0, 2.02, 0.28], [0.07, 0.32, 0.07], [Math.PI / 2, 0, 0]),
        part('ball', palette.ink, 'shiny', [0.12, 2.12, 0.29], 0.045),
        part('ball', palette.ink, 'shiny', [-0.12, 2.12, 0.29], 0.045),
        part('ball', palette.ink, 'shiny', [0, 1.5, 0.45], 0.05),
        part('ball', palette.ink, 'shiny', [0, 1.3, 0.45], 0.05),
        part('stick', palette.ink, 'matte', [0, 2.28, 0], [0.4, 0.05, 0.4]),
        part('stick', palette.ink, 'matte', [0, 2.45, 0], [0.25, 0.32, 0.25]),
        part('ring', a0, 'matte', [0, 1.78, 0], [0.34, 0.34, 0.5], [Math.PI / 2, 0, 0]),
      ],
    },
    floe: {
      motion: 'bob',
      facing: false,
      room: 1.6,
      parts: [part('ball', '#e8f4ff', 'shiny', [0, 0.02, 0], [1.3, 0.16, 0.95]), part('ball', '#ffffff', 'matte', [0.3, 0.1, 0.1], [0.42, 0.14, 0.36])],
    },
    penguin: {
      motion: 'bob',
      facing: true,
      room: 1.6,
      parts: [
        part('ball', '#e8f4ff', 'shiny', [0, 0.02, 0], [1.2, 0.16, 0.9]),
        part('ball', palette.ink, 'shiny', [0, 0.5, 0], [0.28, 0.4, 0.26]),
        part('ball', '#ffffff', 'shiny', [0, 0.45, 0.1], [0.22, 0.32, 0.2]),
        part('ball', palette.ink, 'shiny', [0, 0.95, 0], 0.2),
        part('ball', '#ffffff', 'shiny', [0, 0.95, 0.08], [0.15, 0.13, 0.14]),
        part('ball', '#ff9f43', 'shiny', [0, 0.93, 0.24], [0.07, 0.04, 0.09]),
        part('ball', palette.ink, 'shiny', [0.06, 1.0, 0.2], 0.03),
        part('ball', palette.ink, 'shiny', [-0.06, 1.0, 0.2], 0.03),
        part('ball', '#ff9f43', 'shiny', [0.1, 0.13, 0.12], [0.08, 0.03, 0.1]),
        part('ball', '#ff9f43', 'shiny', [-0.1, 0.13, 0.12], [0.08, 0.03, 0.1]),
      ],
    },
    // ------------------------------------------------ night
    mushrooms: {
      motion: 'still',
      facing: false,
      room: 1.8,
      parts: [
        part('dome', '#3a3f9a', 'matte', [0, -0.12, 0], [1.6, 0.48, 1.6]),
        part('stick', '#f2eeff', 'matte', [0, 0.55, 0], [0.14, 0.8, 0.14]),
        part('dome', '#ff8fd8', 'glow', [0, 0.92, 0], [0.5, 0.36, 0.5]),
        part('stick', '#f2eeff', 'matte', [0.55, 0.4, 0.3], [0.1, 0.55, 0.1]),
        part('dome', '#7fe8ff', 'glow', [0.55, 0.65, 0.3], [0.34, 0.25, 0.34]),
        part('stick', '#f2eeff', 'matte', [-0.5, 0.35, -0.25], [0.09, 0.45, 0.09]),
        part('dome', '#ffe066', 'glow', [-0.5, 0.56, -0.25], [0.3, 0.22, 0.3]),
        part('ball', '#ffffff', 'glow', [0.15, 1.2, 0.25], 0.06),
        part('ball', '#ffffff', 'glow', [-0.2, 1.15, 0.2], 0.05),
      ],
    },
    nightTree: {
      motion: 'still',
      facing: false,
      room: 2.2,
      parts: [
        part('dome', '#2f357f', 'matte', [0, -0.15, 0], [1.9, 0.6, 1.9]),
        ...tree(0, 0.3, 0, 1.05, ['#3d4aa8', '#4a58b8', '#34409a'], '#4a3a6a'),
        part('ball', '#ffe066', 'glow', [0.7, 1.7, 0.6], 0.08),
        part('ball', '#ffe066', 'glow', [-0.8, 2.3, 0.3], 0.07),
        part('ball', '#b8ffcf', 'glow', [0.2, 2.9, 0.5], 0.07),
        part('ball', '#ffe066', 'glow', [-0.3, 1.5, -0.8], 0.06),
      ],
    },
    lantern: {
      motion: 'bob',
      facing: false,
      room: 1,
      parts: [
        part('stick', '#2f6d4a', 'matte', [0, 0.02, 0], [0.5, 0.04, 0.5]),
        part('ball', '#ffd27a', 'glow', [0, 0.42, 0], [0.24, 0.3, 0.24]),
        part('stick', '#c0392b', 'matte', [0, 0.72, 0], [0.12, 0.05, 0.12]),
        part('stick', '#c0392b', 'matte', [0, 0.12, 0], [0.12, 0.05, 0.12]),
      ],
    },
    skyLantern: {
      motion: 'rise',
      facing: false,
      room: 1,
      parts: [part('ball', '#ffb35c', 'glow', [0, 0, 0], [0.3, 0.38, 0.3]), part('stick', '#c0392b', 'matte', [0, 0.36, 0], [0.16, 0.05, 0.16])],
    },
  }
}

/** Which things each island grows near the track, further out, and far away. */
const MENU: Record<CourseId, { near: readonly string[]; mid: readonly string[]; far: readonly string[] }> = {
  park: { near: ['duck', 'lily', 'lily', 'bushIslet'], mid: ['treeIslet', 'treeIslet', 'bushIslet', 'duck'], far: ['bigIsland', 'treeIslet'] },
  beach: { near: ['ringFloat', 'umbrella'], mid: ['palm', 'palm', 'umbrella', 'boat'], far: ['palm', 'boat'] },
  candy: { near: ['gumdrops', 'donut', 'lollipop'], mid: ['lollipop', 'cane', 'cottonCandy', 'gumdrops'], far: ['cottonCandy', 'lollipop', 'gumdrops'] },
  winter: { near: ['floe', 'penguin', 'floe'], mid: ['firIslet', 'snowman', 'penguin', 'firIslet'], far: ['firIslet'] },
  night: { near: ['lantern', 'lantern', 'mushrooms'], mid: ['mushrooms', 'nightTree', 'lantern'], far: ['nightTree', 'mushrooms'] },
}

interface Item {
  kind: string
  x: number
  z: number
  yaw: number
  scale: number
  phase: number
}

/** A number from a word, to seed the layout. */
function seedOf(word: string) {
  let h = 2166136261
  for (let i = 0; i < word.length; i++) h = Math.imul(h ^ word.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Where everything stands, from the course's seed, kept clear of the track, the spinners and the finish. */
function layout(course: Course, table: Record<string, Kind>): Item[] {
  const rand = mulberry32(seedOf(course.id))
  const menu = MENU[course.id]
  const items: Item[] = []
  const towerZ = course.finishZ + TRAMPOLINE_DZ
  const free = (x: number, z: number, room: number) => {
    for (const g of course.ground) if (x > g.x0 - room - 1.2 && x < g.x1 + room + 1.2 && z > g.z0 - room - 1.2 && z < g.z1 + room + 1.2) return false
    for (const s of course.spinners) if (Math.hypot(x - s.x, z - s.z) < s.reach + room + 1.2) return false
    if (Math.abs(x) < 12 + room && z > course.finishZ - 5 && z < towerZ + 7) return false
    for (let i = items.length - 1; i >= 0 && i >= items.length - 40; i--) {
      const o = items[i]!
      if (Math.hypot(o.x - x, o.z - z) < room + table[o.kind]!.room * o.scale) return false
    }
    return true
  }
  const pick = (list: readonly string[]) => list[Math.floor(rand() * list.length)]!
  for (let z = -40; z < towerZ + 70; z += 2.6 + rand() * 2.8) {
    for (const side of [-1, 1]) {
      const r = rand()
      const band = r < 0.42 ? 'near' : r < 0.82 ? 'mid' : 'far'
      if (band === 'far' && rand() < 0.4) continue
      const kind = pick(menu[band])
      const scale = band === 'far' ? 1.6 + rand() * 0.9 : 0.8 + rand() * 0.45
      const room = table[kind]!.room * scale
      // From the edge of the main track outward: near hugs the edge, far sits well out.
      const edge = 3.5 + room
      const reach = band === 'near' ? 4 : band === 'mid' ? 14 : 30
      const from = band === 'near' ? 0.6 : band === 'mid' ? 4 : 16
      for (let tries = 0; tries < 4; tries++) {
        const x = side * (edge + from + rand() * reach)
        const zz = z + (rand() - 0.5) * 1.5
        if (!free(x, zz, room)) continue
        const yaw = table[kind]!.facing ? (rand() - 0.5) * 1.2 - side * 0.6 : (rand() - 0.5) * Math.PI * 2
        items.push({ kind, x, z: zz, yaw, scale, phase: rand() * Math.PI * 2 })
        break
      }
    }
  }
  if (course.id === 'night') {
    // Lanterns rising into the night sky along the course, out over the water.
    for (let z = 0; z < towerZ + 40; z += 9 + rand() * 8) {
      const x = (rand() < 0.5 ? -1 : 1) * (8 + rand() * 18)
      if (free(x, z, 1)) items.push({ kind: 'skyLantern', x, z, yaw: 0, scale: 1 + rand() * 0.4, phase: rand() })
    }
  }
  return items
}

// ------------------------------------------------------------------ drawing

function cone() {
  const pts = [
    [0, 0],
    [0.9, 0],
    [0.99, 0.04],
    [0.99, 0.1],
    [0.16, 0.9],
    [0.08, 0.97],
    [0, 1],
  ].map(([x, y]) => new Vector2(x, y))
  return new LatheGeometry(pts, 12)
}

/** The unit shapes every island's things are made of, kept for the page's life. */
const shapes = once(
  (): Record<Geo, BufferGeometry> => ({
    ball: new SphereGeometry(1, 12, 8),
    bead: new SphereGeometry(1, 6, 4),
    dome: new SphereGeometry(1, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2),
    stick: new CylinderGeometry(1, 1, 1, 12),
    cone: cone(),
    ring: new TorusGeometry(1, 0.32, 8, 20),
    loop: new TorusGeometry(1, 0.1, 5, 24),
    hook: new TorusGeometry(1, 0.36, 8, 14, Math.PI),
    box: new RoundedBoxGeometry(1, 1, 1, 2, 0.25),
  }),
)

/** The three finishes, shared by every mesh of the decor. */
const finishes = once(
  (): Record<Finish, Material> => ({
    matte: new MeshStandardMaterial({ roughness: 0.8 }),
    shiny: new MeshStandardMaterial({ roughness: 0.3 }),
    glow: new MeshBasicMaterial({ toneMapped: false }),
  }),
)

/** Decor is drawn in stretches of the course this long, so the camera and the sun's shadow skip the stretches out of sight. */
const STRETCH = 40
/** How far each motion carries a thing from its spot, which its stretch's bounds allow for; a rising lantern goes too far for that, so its meshes are never skipped. */
const MOTION_ROOM: Record<Motion, number> = { still: 0, bob: 0.5, swim: 1.5, sail: 4, rise: Infinity }

const GEOS: readonly Geo[] = ['ball', 'bead', 'dome', 'stick', 'cone', 'ring', 'loop', 'hook', 'box']
const FINISHES: readonly Finish[] = ['matte', 'shiny', 'glow']

/** One copy of a part: which item it belongs to, and the part's own matrix in the item's space. */
interface Slot {
  item: number
  local: Matrix4
  colour: Color
}

const m4 = new Matrix4()
const itemM = new Matrix4()
const q = new Quaternion()
const e = new Euler(0, 0, 0, 'YXZ')
const v = new Vector3()
const sc = new Vector3()

/** The item's matrix in three's space at sim time t: where it stands and how it moves. */
function itemMatrix(it: Item, motion: Motion, t: number, out: Matrix4) {
  let x = it.x
  let y = WATER_Y
  let z = it.z
  let yaw = it.yaw
  let roll = 0
  switch (motion) {
    case 'still':
      break
    case 'bob':
      y += 0.035 * Math.sin(t * 1.4 + it.phase)
      roll = 0.05 * Math.sin(t * 1.1 + it.phase * 2)
      yaw += 0.15 * Math.sin(t * 0.3 + it.phase)
      break
    case 'swim': {
      const a = it.phase + t * 0.35
      x += Math.cos(a) * 0.9
      z += Math.sin(a) * 0.9
      // Heading along the circle: it runs anticlockwise in sim x, z, so in three's space toward (-sin a, -cos a), and a yaw turns +Z toward (sin yaw, cos yaw).
      yaw = a + Math.PI
      y += 0.02 * Math.sin(t * 3 + it.phase)
      break
    }
    case 'sail':
      x += 3 * Math.sin(t * 0.06 + it.phase)
      y += 0.05 * Math.sin(t * 1.2 + it.phase)
      roll = 0.06 * Math.sin(t * 0.9 + it.phase)
      // The bow turns slowly round through the camera's side as the boat turns back.
      yaw = (Math.PI / 2) * clamp(Math.cos(t * 0.06 + it.phase) * 4, -1, 1)
      break
    case 'rise':
      y = 1 + mod(t * 0.45 + it.phase * 26, 26)
      x += 0.8 * Math.sin(t * 0.3 + it.phase * 6)
      break
  }
  e.set(0, yaw, roll)
  q.setFromEuler(e)
  v.set(x, y, -z)
  sc.setScalar(it.scale)
  return out.compose(v, q, sc)
}

/** The copies of one shape in one finish along one stretch of the course: one instanced mesh. */
interface Group {
  geo: Geo
  finish: Finish
  slots: Slot[]
  /** How far its things move from their spots, for its bounds. */
  room: number
}

/** Sets the copies' matrices for sim time t: every copy, or only those of things that move. */
function placeAll(groups: readonly Group[], meshes: readonly (InstancedMesh | null)[], items: readonly Item[], motions: readonly Motion[], t: number, all: boolean) {
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!
    const mesh = meshes[gi]
    if (!mesh) throw new Error('a decor mesh is missing')
    let changed = false
    let last = -1
    for (let si = 0; si < g.slots.length; si++) {
      const s = g.slots[si]!
      const motion = motions[s.item]!
      if (!all && motion === 'still') continue
      // The parts of one item sit next to each other, so its matrix is worked out once.
      if (s.item !== last) {
        itemMatrix(items[s.item]!, motion, t, itemM)
        last = s.item
      }
      mesh.setMatrixAt(si, m4.multiplyMatrices(itemM, s.local))
      changed = true
    }
    if (changed) mesh.instanceMatrix.needsUpdate = true
  }
}

/** The decor of a course: one instanced mesh per shape and finish that the island uses, animated where things move. */
export function Decor({ sim, theme }: { sim: Sim; theme: Theme }) {
  const course = sim.course
  const geos = shapes()
  const materials = finishes()
  const table = useMemo(() => kinds(theme), [theme])
  const items = useMemo(() => layout(course, table), [course, table])
  const motions = useMemo(() => items.map((it) => table[it.kind]!.motion), [items, table])
  // Every part of every item, sorted into the mesh of its shape, finish and stretch of the course.
  const groups = useMemo(() => {
    const out = new Map<string, Group>()
    for (const geo of GEOS)
      for (const finish of FINISHES)
        items.forEach((it, i) => {
          for (const p of table[it.kind]!.parts) {
            if (p.geo !== geo || p.finish !== finish) continue
            const key = `${geo}-${finish}-${Math.floor(it.z / STRETCH)}`
            let g = out.get(key)
            if (g === undefined) {
              g = { geo, finish, slots: [], room: 0 }
              out.set(key, g)
            }
            const local = new Matrix4().compose(new Vector3(...p.at), new Quaternion().setFromEuler(new Euler(p.turn[0], p.turn[1], p.turn[2], 'YXZ')), new Vector3(...p.size))
            g.slots.push({ item: i, local, colour: new Color(p.colour) })
            g.room = Math.max(g.room, MOTION_ROOM[motions[i]!] * it.scale)
          }
        })
    return [...out.values()]
  }, [items, table, motions])
  const meshes = useRef<(InstancedMesh | null)[]>([])

  useLayoutEffect(() => {
    placeAll(groups, meshes.current, items, motions, sim.time, true)
    groups.forEach((g, gi) => {
      const mesh = meshes.current[gi]!
      g.slots.forEach((s, si) => mesh.setColorAt(si, s.colour))
      mesh.instanceColor!.needsUpdate = true
      // Bounds round the stretch's copies, grown by how far they move, so culling never cuts a duck off mid-swim.
      if (Number.isFinite(g.room)) {
        mesh.computeBoundingSphere()
        mesh.boundingSphere!.radius += g.room + 0.5
      }
    })
  }, [groups, items, motions, sim])
  useFrame(() => placeAll(groups, meshes.current, items, motions, sim.time, false))

  return (
    <>
      {groups.map((g, gi) => (
        <instancedMesh
          key={gi}
          ref={(m) => {
            meshes.current[gi] = m
          }}
          args={[geos[g.geo], materials[g.finish], g.slots.length]}
          frustumCulled={Number.isFinite(g.room)}
          castShadow={g.finish !== 'glow'}
          receiveShadow={g.finish !== 'glow'}
        />
      ))}
    </>
  )
}
