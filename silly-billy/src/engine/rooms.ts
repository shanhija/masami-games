/**
 * The three rooms' ground: where the water is, how deep, and where everybody stands on
 * arriving. Which things stand in each room is content (content/layouts.ts); what the ground
 * looks like is the scene's (scene/Ground.tsx). Both read the numbers here.
 */

import { ROOM_HALF, type RoomId } from './types'

export type Water = { kind: 'rect'; x0: number; x1: number; z0: number; z1: number } | { kind: 'circle'; x: number; z: number; r: number }

export interface RoomGeo {
  /** For the parent and the interpreter. */
  name: string
  /** Finnish words for the room, lowercase stems. */
  calls: string[]
  water: Water[]
  /** The floor under the water: actors wade on it, loose things float at WATER_Y. */
  floor: number
  /** Where actors stand when everybody arrives, front middle first. */
  spawn: { x: number; z: number }[]
}

/** The water's surface. */
export const WATER_Y = -0.08

const row = (z: number) => [-3, -1, 1, 3, -5, 5, -7, 7].map((x) => ({ x, z }))

export const ROOM_GEO: Record<RoomId, RoomGeo> = {
  playground: {
    name: 'playground',
    calls: ['leikkipuisto', 'leikkipaikka', 'puisto', 'pihalle', 'piha', 'playground', 'keinu'],
    water: [],
    floor: 0,
    spawn: row(4),
  },
  pool: {
    name: 'swimming pool',
    calls: ['uimahalli', 'uima-allas', 'uimaallas', 'allas', 'altaalle', 'altaaseen', 'altaassa', 'uimaan', 'uimarannalle', 'uima', 'pool', 'swimming'],
    water: [{ kind: 'rect', x0: -5.5, x1: 5.5, z0: -6, z1: 1 }],
    floor: -0.75,
    spawn: row(5),
  },
  forest: {
    name: 'forest',
    calls: ['metsä', 'metsään', 'metsässä', 'mettä', 'mettään', 'forest', 'woods'],
    water: [{ kind: 'circle', x: 6.5, z: -6.5, r: 2.4 }],
    floor: -0.5,
    spawn: row(4),
  },
}

export function inWater(room: RoomId, x: number, z: number): boolean {
  return ROOM_GEO[room].water.some((w) => (w.kind === 'rect' ? x > w.x0 && x < w.x1 && z > w.z0 && z < w.z1 : (x - w.x) ** 2 + (z - w.z) ** 2 < w.r * w.r))
}

/** The ground's height: 0, or the floor under water. */
export function groundAt(room: RoomId, x: number, z: number): number {
  return inWater(room, x, z) ? ROOM_GEO[room].floor : 0
}

/** Keeps a point inside the room, `margin` from the edge. */
export function insideRoom(x: number, z: number, margin = 0.3): { x: number; z: number } {
  const m = ROOM_HALF - margin
  return { x: Math.max(-m, Math.min(m, x)), z: Math.max(-m, Math.min(m, z)) }
}
