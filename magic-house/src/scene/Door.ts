/**
 * The way out (world.ts WayOut): a door SIZES.doorWidth wide and SIZES.doorHeight tall set into a
 * wall of the house (step 7a), in a frame of the shell's trim, its foot on the floor or a ledge
 * where the room put it. From the side it stands against the back wall behind its foot; from high
 * up in the wall its foot was moved to (engine/builder.ts), facing into the room. Shut, it glows
 * softly through a round window and a halo that breathes on the wall round it (drawn with the room's glow halos, RoomView.ts GlowHalos); when the room is
 * finished it swings open toward the room onto a warm light. Built with the kit like every model
 * in the house: its frame still, in the room's batch; its leaf a part that turns, drawn on its own.
 */

import { Group, Matrix4 } from 'three'

import { buildRecipe } from '../../../silly-billy/src/engine/kit'
import type { Recipe } from '../../../silly-billy/src/engine/types'
import { AS_BUILT, buildModel, disposeModel, ModelView, type Model } from '../../../silly-billy/src/scene/recipeMesh'
import { ROOM, SIZES } from '../engine/api'
import { smooth } from '../engine/state'
import { ROOM_BOUNDS, type HandleId, type RoomView, type WayOut } from '../engine/world'
import { modelGeometries, pulseAt } from './models'
import type { Piece } from './still'

const DOOR = { step: '#6e4a30', leaf: '#ff9f43', panel: '#ffc078', knob: '#ffd23a', light: '#fffbe0' } as const
/** How far the leaf swings open, radians toward the viewer, and how long it takes, seconds. */
const OPEN = { turn: -1.75, secs: 0.8 } as const
/** How far in front of its wall the door's middle stands, metres: the back of its frame against the wall's face, the light beyond just in front of it. */
const OFF_WALL = 0.18

const W = SIZES.doorWidth
const H = SIZES.doorHeight

/** The door's frame of `trim`, its step and the light beyond it, seen when the door opens: all of it still, so it goes into the room's batch (framePiece). */
const frameRecipe = (trim: string): Recipe => buildRecipe((m) => {
  for (const side of [-1, 1]) m.box(0.14, H + 0.16, 0.34, { at: [side * (W / 2 + 0.07), (H + 0.16) / 2, 0], color: trim })
  m.box(W + 0.42, 0.2, 0.38, { at: [0, H + 0.1, 0], color: trim })
  m.box(W + 0.42, 0.08, 0.42, { at: [0, 0.04, 0], color: DOOR.step })
  m.box(W, H, 0.04, { at: [0, H / 2, -0.12], color: DOOR.light, glow: true })
  return {}
}, ['door']).recipe

/** The door's leaf, which swings open on its hinge, its window ringed in `trim`. */
const leafRecipe = (trim: string): Recipe => buildRecipe((m) => {
  m.part('leaf', { at: [-W / 2, 0, 0.02] }, () => {
    m.box(W - 0.02, H - 0.04, 0.08, { at: [W / 2, H / 2, 0], color: DOOR.leaf })
    for (const x of [0.3, 0.9]) m.box(0.42, 0.62, 0.02, { at: [x * W / 1.2, 0.55, 0.05], color: DOOR.panel })
    m.cylinder(0.2, 0.2, 0.03, { at: [W / 2, H * 0.72, 0.05], rot: [Math.PI / 2, 0, 0], color: DOOR.light, glow: true })
    m.torus(0.2, 0.04, { at: [W / 2, H * 0.72, 0.06], color: trim })
    m.sphere(0.065, { at: [W - 0.16, H * 0.47, 0.09], color: DOOR.knob })
  })
  return {}
}, ['door']).recipe

/**
 * Where the door stands for a foot at `at` and which way it faces (its turn round y): from the side
 * against the back wall; from high up against the wall the foot is in, facing into the room. A foot
 * in no wall from high up is an error: the builder moves every way out into one.
 */
export function doorPlace(at: readonly number[], view: RoomView): { at: [number, number, number]; turn: number } {
  if (view === 'side') return { at: [at[0]!, at[1]!, ROOM.side.back + OFF_WALL], turn: 0 }
  const b = ROOM_BOUNDS.high
  const near = (a: number, c: number) => Math.abs(a - c) < 1e-6
  if (near(at[2]!, b.min[2])) return { at: [at[0]!, at[1]!, b.min[2] + OFF_WALL], turn: 0 }
  if (near(at[0]!, b.min[0])) return { at: [b.min[0] + OFF_WALL, at[1]!, at[2]!], turn: Math.PI / 2 }
  if (near(at[0]!, b.max[0])) return { at: [b.max[0] - OFF_WALL, at[1]!, at[2]!], turn: -Math.PI / 2 }
  throw new Error(`the way out's foot ${at.join(', ')} is in none of the house's walls seen from high up`)
}

/** The halo on the wall round the door, as the room's glow halos draw it (RoomView.ts GlowHalos): where its middle is, how wide, its colour and how bright. */
export interface DoorHalo {
  at: [number, number, number]
  size: number
  readonly color: string
  bright: number
}

/** The door's frame in the room's batch: a piece no handle owns, so nothing ever takes it out (as still.ts SHELL_PIECE), and the play's pick passes through it, as through the leaf (RoomView.pick). */
export const DOOR_PIECE: HandleId = -3

export class DoorView {
  readonly root = new Group()
  private readonly model: Model
  private readonly view: ModelView
  /** Its halo this frame, which the room's glow halos draw in their one call. */
  readonly halo: DoorHalo = { at: [0, 0, 0], size: 0, color: DOOR.light, bright: 0 }
  /** When the scene saw it open, on the world's clock; -Infinity when it was open from the start. */
  private openedAt: number | null = null

  /** A door framed in the shell's `trim`, for a room seen from `seen`: its leaf drawn here, its frame in the room's batch (framePiece). */
  constructor(
    private readonly trim: string,
    private readonly seen: RoomView,
  ) {
    this.model = buildModel(leafRecipe(trim), false, null, null)
    this.view = new ModelView(this.model)
    this.root.add(this.view.root)
  }

  /** The door's frame where the way out stands (`at`, its foot, which never moves once the room is built), as a piece of the room's batch: still, so it costs no draw call of its own. */
  framePiece(at: readonly number[]): Piece {
    const place = doorPlace(at, this.seen)
    const model = buildModel(frameRecipe(this.trim), false, null, null)
    const g = modelGeometries(model, new Matrix4().makeRotationY(place.turn).setPosition(...place.at))
    disposeModel(model)
    return { id: DOOR_PIECE, ...g }
  }

  update(door: WayOut, t: number) {
    const place = doorPlace(door.at, this.seen)
    this.root.position.set(...place.at)
    this.root.rotation.set(0, place.turn, 0)
    if (!door.open) this.openedAt = null
    else if (this.openedAt === null) this.openedAt = t <= 0 ? -Infinity : t
    const k = this.openedAt === null ? 0 : Math.min(1, (t - this.openedAt) / OPEN.secs)
    this.view.pose({ leaf: { x: 0, y: 0, z: 0, rx: 0, ry: OPEN.turn * smooth(k), rz: 0, s: 1 } }, AS_BUILT)
    // On the wall's face round the door, behind its leaf, turned with the door. Shut, the halo breathes softly; open, it shines out steady and big.
    const back = 0.02 - OFF_WALL
    this.halo.at = [place.at[0] + back * Math.sin(place.turn), place.at[1] + H / 2, place.at[2] + back * Math.cos(place.turn)]
    this.halo.bright = door.open ? 0.9 : 0.35 + 0.35 * pulseAt(t)
    this.halo.size = door.open ? 4.2 : 3.2
  }

  dispose() {
    disposeModel(this.model)
  }
}
