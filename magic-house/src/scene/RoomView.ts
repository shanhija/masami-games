/**
 * A room drawn from the world (world.ts World), every frame, never changing it: the house round it
 * and the still parts merged (shell.ts, still.ts), the movers as groups that carry their parts, the
 * solids, loose things and decor that move drawn on their own, the coloured zones as soft
 * see-through boxes, the signs, the lamps' light, the way out set into a wall, the pops and the
 * players. The room is lit by its shell (step 7a, Light: LIGHT, shellLight), and behind everything
 * is the house's darkest timber, which no screen shows past the house anyway. The room's look, when
 * it has one, is drawn with it (lookView.ts): its wallpaper, decor and dressings in the still batch,
 * its props and small lights on their own, its lamps with the room's.
 *
 * A room's handles keep one shape for life (world.ts), so the views are made when the room is and
 * only what changes is drawn again. A new room gets a new RoomView (RoomStage keys it by roomKey).
 *
 * From high up (world.ts RoomView 'high') the same parts are drawn in the floor's frame: a turn is
 * round y (Solid.turn, a mover's turn, decor's), a round thing rolls round the level line square to
 * the way it goes, a belt's arrows lie on its top, a glow lies round its foot, signs face the
 * camera, the house's boards lie all round the room, and a line from the eye finds what it meets
 * (pick).
 */

import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Raycaster,
  Vector3,
} from 'three'

import { CAMERA_PITCH } from '../../../castle-builder/src/scene/look'
import type { Lang } from '../../../profiles/src/lang'
import { KID_HEIGHT } from '../../../silly-billy/src/engine/body'
import type { Puff, Vec3 } from '../../../silly-billy/src/engine/types'
import { colorOf, glow as shine, MODEL, UNSEEN } from '../../../silly-billy/src/scene/look'
import { PUFF_CAP } from '../../../silly-billy/src/scene/puffCap'
import { AS_BUILT, ModelView } from '../../../silly-billy/src/scene/recipeMesh'
import { LAMPS_LIT, LIGHT_RANGE, type Shell } from '../engine/api'
import { ROOM_BOUNDS, type Glow, type HandleId, type Lamp, type Mover, type Solid, type Thing, type World, type Zone } from '../engine/world'
import { ROOM_PATTERNED } from '../patterns/look'
import type { SeatIndex } from '../seats/types'
import { DOOR_PIECE, DoorView, type DoorHalo } from './Door'
import type { WornModels } from './dress'
import { haloTexture } from './halo'
import { LOOK_PIECE, LookView, puffsWith, Shine, type LampHalo, type StageLook } from './lookView'
import { glowMaterial, glowMeshes, partPoses, pulseAt, pulseGlows, RoomModels } from './models'
import { PlayerLayer } from './Players'
import { carries, chevronGeometry, mix, solidGeometry, SURFACE_LOOK } from './shapes'
import { HOUSE_LOOK } from './shell'
import { PopLayer, SignView, texts } from './Signs'
import { Batch, dimRoom, halfHeight, solidKey, stillDecor, stillPieces, stillSolid } from './still'

/** A key that is the same for the same room and changes for another: what RoomStage builds a new RoomView by. */
export const roomKey = (w: World) => [w.seed, w.kind, w.view, w.models.length, w.solids.length, w.movers.length, w.things.length, w.decor.length, w.zones.length, w.lamps.length, w.signs.length, w.players.length].join('|')

/**
 * How a shell lights its room (step 7a, Light): a key light of key × light from the front, above
 * and to the left (keyFrom, metres from the room's middle), so the back wall is lit evenly, and a
 * fill of fill + fillByLight × light from all round, its colour from above the ceiling's and from
 * below the floor's, each mixed `tint` of the way toward white. At light 1 that is 3.3 in all; at
 * the least light, 0.6, it is 2.22, so a dim room keeps two thirds of a bright one's light.
 */
export const LIGHT = { key: 2.1, keyFrom: [-3, 10, 12] as const, fill: 0.6, fillByLight: 0.6, tint: 0.5 } as const

/** The key light's and the fill's strength for a shell, and the fill's colours from above and below. */
export function shellLight(shell: Shell): { key: number; fill: number; sky: string; ground: string } {
  return { key: LIGHT.key * shell.light, fill: LIGHT.fill + LIGHT.fillByLight * shell.light, sky: mix(shell.ceiling.color, '#ffffff', LIGHT.tint), ground: mix(shell.floor.color, '#ffffff', LIGHT.tint) }
}

/** How strongly what shines on its own (a lamp's halo, the look's small lights) shows in a room of `light`: 0.35 at light 1, all of it at the least light. */
export const shineIn = (light: number) => 0.35 + (0.65 * (1 - light)) / (1 - LIGHT_RANGE.least)

/** The lamps that light the room for real: the LAMPS_LIT strongest of those shown (the room's, then the look's), the first first among equals. */
export const lampsLit = <L extends { readonly power: number }>(shown: readonly L[]): L[] => [...shown].sort((a, b) => b.power - a.power).slice(0, LAMPS_LIT)

/** A lamp shown this frame, where it is in the room: the room's or the look's. */
interface LampShown {
  readonly at: Vec3
  readonly color: string
  readonly power: number
  readonly reach: number
}

/** How strong a lamp of power 1 shines; LAMPS_LIT of them light for real at once (each costs every lit pixel). */
const LAMP_STRENGTH = 4

/** What a handle glows with: its own glow, else its mover's. */
const glowOf = (own: Glow | null, mover: Mover | null) => own ?? mover?.glow ?? null

/** Turns a part of the room its turn: round z from the side, round y from high up (world.ts). */
function turnTo(o: Object3D, turn: number, high: boolean) {
  if (high) o.rotation.set(0, turn, 0)
  else o.rotation.set(0, 0, turn)
}

/** A solid drawn on its own: its plain shape (made again when its shape or surface changes) or its model, posed. */
class SolidView {
  readonly root = new Group()
  private key = ''
  private mesh: Mesh | null = null
  private view: ModelView | null = null

  constructor(
    private readonly models: RoomModels,
    private readonly seen: World['view'],
    private readonly dim: boolean,
  ) {}

  update(s: Solid, mover: Mover | null, t: number) {
    this.root.visible = !s.hidden
    if (s.hidden) return
    this.root.position.set(s.at[0], s.at[1], s.at[2])
    turnTo(this.root, s.turn, this.seen === 'high')
    const glow = glowOf(s.glow, mover)
    if (s.model !== null) {
      if (this.view === null) {
        this.view = new ModelView(this.models.get(s.model))
        this.view.root.position.y = -halfHeight(s.shape)
        this.root.add(this.view.root)
      }
      this.view.pose(partPoses(s.parts, t), AS_BUILT)
      glowMeshes(this.view.meshes, glow)
      return
    }
    const f = s.surface
    const key = [JSON.stringify(s.shape), f.color, f.ice, f.bounce, f.belt.join(','), f.through].join('|')
    if (key !== this.key) {
      this.mesh?.geometry.dispose()
      this.mesh?.removeFromParent()
      this.mesh = new Mesh(solidGeometry(s.shape, f, this.seen, this.dim), MODEL.solid)
      this.root.add(this.mesh)
      this.key = key
    }
    this.mesh!.material = glow === null ? MODEL.solid : glowMaterial(glow)
  }

  dispose() {
    this.mesh?.geometry.dispose()
  }
}

/** Decor or a loose thing drawn on its own: its model, posed, sized and placed; a round thing rolls round its middle (from high up, round the level line square to the way it goes: the last way it went while it stands). */
class ModelHandleView {
  readonly root = new Group()
  private readonly roll = new Group()
  readonly view: ModelView
  private readonly middle: number
  private readonly axis = new Vector3(0, 0, -1)

  constructor(
    models: RoomModels,
    model: number,
    private readonly high: boolean,
  ) {
    this.view = new ModelView(models.get(model))
    const b = this.view.model.recipe.bounds
    this.middle = (b.min[1] + b.max[1]) / 2
    this.roll.position.y = this.middle
    this.view.root.position.y = -this.middle
    this.roll.add(this.view.root)
    this.root.add(this.roll)
  }

  /** `way`: how it moves, for the line a round thing rolls round from high up. */
  update(at: Vec3, turn: number, scale: number, roll: number, way: Vec3, hidden: boolean, parts: Solid['parts'], glow: Glow | null, t: number) {
    this.root.visible = !hidden
    if (hidden) return
    this.root.position.set(at[0], at[1], at[2])
    turnTo(this.root, turn, this.high)
    this.root.scale.setScalar(scale)
    if (!this.high) this.roll.rotation.z = -roll
    else {
      // Up crossed with the way it goes: rolling toward +x turns it round -z, as from the side.
      const speed = Math.hypot(way[0], way[2])
      if (speed > 0.05) this.axis.set(way[2] / speed, 0, -way[0] / speed)
      this.roll.quaternion.setFromAxisAngle(this.axis, roll)
    }
    this.view.pose(partPoses(parts, t), AS_BUILT)
    glowMeshes(this.view.meshes, glow)
  }
}

const UNIT_BOX = new BoxGeometry(1, 1, 1)
/** Decor's way: it never rolls. */
const STILL: Vec3 = [0, 0, 0]
const UNIT_PLANE = new PlaneGeometry(1, 1)

/** A coloured zone: a soft see-through box, a little stronger while someone is in it, pulsing when it glows. */
class ZoneView {
  readonly mesh = new Mesh(UNIT_BOX, new MeshBasicMaterial({ transparent: true, depthWrite: false }))

  constructor() {
    this.mesh.renderOrder = 1
  }

  update(z: Zone, mover: Mover | null, t: number) {
    const glow = glowOf(z.glow, mover)
    const color = glow?.color ?? z.color
    this.mesh.visible = !z.hidden && color !== null
    if (!this.mesh.visible) return
    const mat = this.mesh.material
    mat.color.set(colorOf(color!))
    const base = z.inside.length > 0 ? 0.34 : 0.24
    mat.opacity = glow === null ? base : glow.pulse ? base + 0.25 * pulseAt(t) : base + 0.15
    this.mesh.position.set(z.at[0], z.at[1], z.at[2])
    this.mesh.scale.set(z.size[0], z.size[1], z.size[2])
  }

  dispose() {
    this.mesh.material.dispose()
  }
}

const CHEVRON = chevronGeometry()
/** A belt's arrows: how far apart, and the most on one belt. */
const BELT = { spacing: 0.45, max: 64 } as const
const scratch = new Object3D()

/** The arrows on a belt's front, moving the way and as fast as it carries; from high up on its top, along the floor the way it carries. */
class BeltView {
  readonly root = new Group()
  private readonly arrows = new InstancedMesh(CHEVRON, shine(SURFACE_LOOK.arrow), BELT.max)

  constructor(private readonly high: boolean) {
    this.arrows.frustumCulled = false
    this.root.add(this.arrows)
  }

  update(s: Solid, t: number) {
    const [vx, vy, vz] = s.surface.belt
    const on = !s.hidden && s.shape.kind === 'box' && !s.surface.through && carries(s.surface)
    this.root.visible = on
    if (!on || s.shape.kind !== 'box') return
    this.root.position.set(s.at[0], s.at[1], s.at[2])
    turnTo(this.root, s.turn, this.high)
    const [w, h, d] = s.shape.size
    if (this.high) return this.alongTop(w, h, d, vx, vz, s.turn, t)
    const band = Math.min(0.16, h * 0.5)
    const speed = Math.hypot(vx, vy)
    // Along the front of the band on top; a belt that carries up or down has its arrows up its front instead.
    const upright = Math.abs(vy) > Math.abs(vx)
    const length = upright ? h - 2 * band : w - 2 * band
    const n = Math.max(0, Math.min(BELT.max, Math.floor(length / BELT.spacing)))
    const dir = Math.sign(upright ? vy : vx)
    const turn = upright ? (dir * Math.PI) / 2 : dir > 0 ? 0 : Math.PI
    const shift = (((t * speed * dir) % length) + length) % length
    const size = Math.min(band, w / 2) / 0.16
    for (let i = 0; i < n; i++) {
      const along = ((((i + 0.5) * length) / n + shift) % length) - length / 2
      if (upright) scratch.position.set(0, along, d / 2 + 0.012)
      else scratch.position.set(along, h / 2 - band / 2, d / 2 + 0.012)
      scratch.rotation.set(0, 0, turn)
      scratch.scale.setScalar(size)
      scratch.updateMatrix()
      this.arrows.setMatrixAt(i, scratch.matrix)
    }
    this.arrows.count = n
    this.arrows.instanceMatrix.needsUpdate = true
  }

  /** From high up: a line of arrows lying on the top through its middle, pointing the way it carries [vx, 0, vz] (in the solid's own frame, which is turned by `turn` round y). */
  private alongTop(w: number, h: number, d: number, vx: number, vz: number, turn: number, t: number) {
    const way = Math.atan2(-vz, vx) - turn
    const [c, s] = [Math.cos(way), Math.sin(way)]
    // As far as the line reaches inside the top, less an arrow's length at each end.
    const length = Math.max(0, Math.min(Math.abs(c) > 1e-6 ? w / Math.abs(c) : Infinity, Math.abs(s) > 1e-6 ? d / Math.abs(s) : Infinity) - 0.4)
    const n = Math.max(0, Math.min(BELT.max, Math.floor(length / BELT.spacing)))
    const shift = length > 0 ? (t * Math.hypot(vx, vz)) % length : 0
    for (let i = 0; i < n; i++) {
      const along = ((((i + 0.5) * length) / n + shift) % length) - length / 2
      // Along +x turned by `way` round y, so +x goes to (cos, -sin) on the floor.
      scratch.position.set(c * along, h / 2 + 0.012, -s * along)
      scratch.rotation.set(-Math.PI / 2, way, 0, 'YXZ')
      scratch.scale.setScalar(Math.min(1.6, Math.min(w, d) / 0.5))
      scratch.updateMatrix()
      this.arrows.setMatrixAt(i, scratch.matrix)
    }
    scratch.rotation.order = 'XYZ'
    this.arrows.count = n
    this.arrows.instanceMatrix.needsUpdate = true
  }

  dispose() {
    this.arrows.dispose()
  }
}

/** How a glowing handle's halo is drawn: this much wider and taller than the handle, metres; how far behind it, so it rims the handle rather than washing it out (from high up, how far over its foot it lies); how bright, steady and over a pulse; how bright a player's halo is in a dim room, and the faint one, in `useColor`, round what a player can use there. */
const GLOW_HALO = { pad: 1.2, behind: 0.6, lift: 0.03, steady: 0.75, low: 0.3, high: 1, dimPlayer: 0.5, dimUse: 0.25, useColor: '#fff1cc' } as const

/**
 * A soft halo round every solid, loose thing and piece of decor that glows (its own glow, or its
 * mover's), sized to the handle and pulsing with it, all in one draw call. The glow's emissive tint
 * alone does not read on a light colour by day; the halo does, as the players' and the door's do.
 * In a dim room (still.ts dimRoom) every player has a soft one too, in their seat's colour, so the
 * children always find themselves, and whatever a player can use (World.uses) that does not glow has
 * a faint warm one, so they find what to try (step 7a, Light: dim rooms are helped by rule). The way
 * out's halo on the wall round it (Door.ts) is one of them too, facing the camera.
 */
export class GlowHalos {
  readonly mesh: InstancedMesh<PlaneGeometry, MeshBasicMaterial>

  constructor(
    count: number,
    private readonly high: boolean,
  ) {
    this.mesh = new InstancedMesh(UNIT_PLANE, new MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), Math.max(1, count))
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = 3
    this.mesh.count = 0
  }

  update(world: World, movers: Map<HandleId, Mover>, models: RoomModels, carriedX: (seat: SeatIndex) => number, door: DoorHalo, t: number) {
    let n = 0
    const c = new Color()
    const high = this.high
    const dim = dimRoom(world)
    const strength = (glow: Glow) => (glow.pulse ? GLOW_HALO.low + (GLOW_HALO.high - GLOW_HALO.low) * pulseAt(t) : GLOW_HALO.steady)
    // In a dim room what a player can use and that glows not shines faintly as if it did.
    const used: Glow = { color: GLOW_HALO.useColor, pulse: false }
    const glowIn = (own: Glow | null, mover: Mover | null, id: HandleId): { glow: Glow; bright: number } | null => {
      const glow = glowOf(own, mover)
      if (glow !== null) return { glow, bright: strength(glow) }
      return dim && (world.uses.includes(id) || (mover !== null && world.uses.includes(mover.id))) ? { glow: used, bright: GLOW_HALO.dimUse } : null
    }
    // From the side a halo stands behind the handle and is turned with it; from high up it lies on the floor under it, a pool of light round its footprint (`cy` is its middle, `h` its height, `d` its depth).
    const add = (color: string, bright: number, cx: number, cy: number, z: number, w: number, h: number, turn: number, d: number) => {
      const [ct, st] = [Math.abs(Math.cos(turn)), Math.abs(Math.sin(turn))]
      if (high) {
        scratch.position.set(cx, cy - h / 2 + GLOW_HALO.lift, z)
        scratch.rotation.set(-Math.PI / 2, 0, 0)
        scratch.scale.set(ct * w + st * d + GLOW_HALO.pad, st * w + ct * d + GLOW_HALO.pad, 1)
      } else {
        scratch.position.set(cx, cy, z - GLOW_HALO.behind)
        scratch.rotation.set(0, 0, 0)
        scratch.scale.set(ct * w + st * h + GLOW_HALO.pad, st * w + ct * h + GLOW_HALO.pad, 1)
      }
      scratch.updateMatrix()
      this.mesh.setMatrixAt(n, scratch.matrix)
      c.set(colorOf(color)).multiplyScalar(bright)
      this.mesh.setColorAt(n, c)
      n++
    }
    const moverOf = (id: HandleId | null) => (id === null ? null : movers.get(id)!)
    for (const s of world.solids) {
      const mover = moverOf(s.mover)
      const shine = glowIn(s.glow, mover, s.id)
      if (shine === null || s.hidden || mover?.hidden === true) continue
      const p = inRoom(s.at, mover, high)
      const sh = s.shape
      const [w, h, d] = sh.kind === 'ball' ? [2 * sh.radius, 2 * sh.radius, 2 * sh.radius] : sh.size
      add(shine.glow.color, shine.bright, p[0], p[1], high ? p[2] : 0, w, h, s.turn + (mover?.turn ?? 0), d)
    }
    for (const th of world.things) {
      const shine = glowIn(th.glow, null, th.id)
      if (shine === null || th.hidden) continue
      const [w, h, d] = [th.box.max[0] - th.box.min[0], th.box.max[1] - th.box.min[1], th.box.max[2] - th.box.min[2]]
      const carrier = th.heldBy === null ? null : world.players[th.heldBy]!
      const x = carrier === null ? th.at[0] + (th.box.min[0] + th.box.max[0]) / 2 : carrier.at[0] + carriedX(carrier.seat)
      const y = carrier === null ? th.at[1] + (th.box.min[1] + th.box.max[1]) / 2 : carrier.at[1] + KID_HEIGHT * carrier.size + 0.02 + h / 2
      const z = !high ? 0 : carrier === null ? th.at[2] + (th.box.min[2] + th.box.max[2]) / 2 : carrier.at[2]
      add(shine.glow.color, shine.bright, x, y, z, w, h, 0, d)
    }
    for (const d of world.decor) {
      const mover = moverOf(d.mover)
      const shine = glowIn(d.glow, mover, d.id)
      if (shine === null || d.hidden || mover?.hidden === true) continue
      const b = models.get(d.model).recipe.bounds
      const p = inRoom(d.at, mover, high)
      add(shine.glow.color, shine.bright, p[0] + ((b.min[0] + b.max[0]) / 2) * d.scale, p[1] + ((b.min[1] + b.max[1]) / 2) * d.scale, p[2] + (high ? ((b.min[2] + b.max[2]) / 2) * d.scale : 0), (b.max[0] - b.min[0]) * d.scale, (b.max[1] - b.min[1]) * d.scale, d.turn + (mover?.turn ?? 0), (b.max[2] - b.min[2]) * d.scale)
    }
    if (dim)
      for (const p of world.players) {
        const tall = KID_HEIGHT * p.size
        add(p.color, GLOW_HALO.dimPlayer, p.at[0] + carriedX(p.seat), p.at[1] + tall / 2, high ? p.at[2] : 0, 0.6 * tall, tall, 0, 0.6 * tall)
      }
    // The way out's halo faces the camera, as a sprite would: from high up tipped back by the camera's pitch.
    scratch.position.set(...door.at)
    scratch.rotation.set(high ? -CAMERA_PITCH : 0, 0, 0)
    scratch.scale.set(door.size, door.size, 1)
    scratch.updateMatrix()
    this.mesh.setMatrixAt(n, scratch.matrix)
    this.mesh.setColorAt(n, c.set(colorOf(door.color)).multiplyScalar(door.bright))
    n++
    this.mesh.count = n
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true
  }

  dispose() {
    this.mesh.dispose()
    this.mesh.material.dispose()
  }
}

/** A point given in a mover's frame, in the room: turned round z from the side, round y from high up (+x toward -z). */
function inRoom(at: Vec3, mover: Mover | null, high: boolean): Vec3 {
  if (mover === null) return at
  const c = Math.cos(mover.turn)
  const s = Math.sin(mover.turn)
  if (high) return [mover.at[0] + c * at[0] + s * at[2], mover.at[1] + at[1], mover.at[2] - s * at[0] + c * at[2]]
  return [mover.at[0] + c * at[0] - s * at[1], mover.at[1] + s * at[0] + c * at[1], mover.at[2] + at[2]]
}

/** Is it drawn: it and every group it hangs in are shown. */
function shownAll(o: Object3D | null): boolean {
  for (; o !== null; o = o.parent) if (!o.visible) return false
  return true
}

export class RoomView {
  readonly root = new Group()
  /** What is behind everything, for the stage's background: the house's darkest timber, or without the house the walls' colour. */
  readonly background: Color
  readonly sun: DirectionalLight
  readonly fill: HemisphereLight
  private readonly models: RoomModels
  private readonly groups = new Map<HandleId, Group>()
  private readonly batches = new Map<HandleId | null, Batch>()
  /** The solids still in a batch, by their still key then. */
  private readonly watched = new Map<HandleId, string>()
  private readonly solids = new Map<HandleId, SolidView>()
  private readonly belts = new Map<HandleId, BeltView>()
  private readonly decor = new Map<HandleId, ModelHandleView>()
  private readonly things: ModelHandleView[]
  private readonly zones: ZoneView[]
  private readonly signs: SignView[]
  private readonly lights: PointLight[] = []
  /** The look's small lights and every lamp's halo, in one draw call. */
  private readonly shine: Shine
  private readonly glows: GlowHalos
  private readonly door: DoorView
  private readonly pops = new PopLayer()
  private readonly players: PlayerLayer
  /** Seen from high up: the floor's frame (world.ts RoomView). */
  private readonly high: boolean
  /** What a line from the eye may meet (pick): every shape drawn of the room's place and the house round it, never a player, a zone, a glow, a halo, a pop or the way out (no tap is its). */
  private readonly picks: Object3D[] = []
  private readonly ray = new Raycaster()
  /** A dim room (still.ts dimRoom): its plain solids' tops lighter, its players with halos. */
  private readonly dim: boolean
  /** The room's look as drawn (lookView.ts), or null for a room without one. */
  private readonly look: LookView | null
  /**
   * Each solid the look dresses, while it is still drawn so in the batch, as its plain shape in
   * Silly Billy's UNSEEN (never drawn, met by a line from the eye): the play's pick meets this and never the model, so a dressing (which may reach past
   * its solid's sides, or stand on legs under its top) changes no point a tap gives the play.
   */
  private readonly plainForPick = new Map<HandleId, Mesh>()

  /** `house`: the house drawn round the room (shell.ts), as for every room of the game; a sheet's stand of kids has none. `look`: the room's look, built on the room as played, or null. */
  constructor(world: World, worn: WornModels, house: boolean, look: StageLook | null) {
    this.high = world.view === 'high'
    this.background = new Color(house ? HOUSE_LOOK.timber : colorOf(world.shell.walls.color))
    this.dim = dimRoom(world)
    this.models = new RoomModels(world.models)
    // The shell's light never changes: set once, the key from the front, above and left of the room's middle.
    const lit = shellLight(world.shell)
    const b = ROOM_BOUNDS[world.view]
    const mid: Vec3 = [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, 0]
    this.sun = new DirectionalLight('#ffffff', lit.key)
    this.sun.position.set(mid[0] + LIGHT.keyFrom[0], mid[1] + LIGHT.keyFrom[1], mid[2] + LIGHT.keyFrom[2])
    this.sun.target.position.set(...mid)
    this.fill = new HemisphereLight(lit.sky, lit.ground, lit.fill)
    this.door = new DoorView(world.shell.trim, world.view)
    this.look = look === null ? null : new LookView(world, look)
    for (const m of world.movers) {
      const g = new Group()
      this.groups.set(m.id, g)
      this.root.add(g)
    }
    // The still parts, merged in their frames: the room's and each mover's; the look's wallpaper and decor in the room's, its dressings in place of their solids.
    const pieces = stillPieces(world, this.models, house, this.look?.dressed ?? new Map())
    pieces.set(null, [...(pieces.get(null) ?? []), this.door.framePiece(world.wayOut.at), ...(this.look === null ? [] : [this.look.piece()])])
    // The house's own solids are drawn by the shell in the batch, never watched or drawn on their own.
    for (const s of world.solids) if (stillSolid(s)) this.watched.set(s.id, solidKey(s))
    for (const [mover, list] of pieces) {
      const batch = new Batch(list)
      this.batches.set(mover, batch)
      this.parent(mover).add(batch.root)
      this.picks.push(batch.root)
    }
    // A dressed solid is plain, still and in no mover (engine/look.ts dressable): its plain shape where it stands, turned as it is.
    for (const s of world.solids) {
      if (this.look === null || !this.look.dressed.has(s.id) || !stillSolid(s)) continue
      const place = this.high ? new Matrix4().makeRotationY(s.turn) : new Matrix4().makeRotationZ(s.turn)
      const mesh = new Mesh(solidGeometry(s.shape, s.surface, world.view, this.dim).applyMatrix4(place.setPosition(s.at[0], s.at[1], s.at[2])), UNSEEN)
      this.plainForPick.set(s.id, mesh)
      this.root.add(mesh)
      this.picks.push(mesh)
    }
    this.things = world.things.map((th) => {
      const v = new ModelHandleView(this.models, th.model, this.high)
      this.root.add(v.root)
      this.picks.push(v.root)
      return v
    })
    this.zones = world.zones.map((z) => {
      const v = new ZoneView()
      this.parent(z.mover).add(v.mesh)
      return v
    })
    this.signs = world.signs.map((s) => {
      const v = new SignView()
      this.parent(s.mover).add(v.mesh)
      this.picks.push(v.mesh)
      return v
    })
    for (let i = 0; i < LAMPS_LIT; i++) {
      const l = new PointLight('#ffffff', 0, 6, 1)
      this.lights.push(l)
      this.root.add(l)
    }
    this.shine = new Shine(look?.built.lights ?? [], shineIn(world.shell.light), Math.max(1, world.lamps.length + (this.look?.lamps.length ?? 0)))
    this.players = new PlayerLayer(worn)
    this.glows = new GlowHalos(world.solids.length + world.things.length + world.decor.length + world.players.length + 1, this.high)
    this.root.add(this.glows.mesh, this.shine.points, this.door.root, this.pops.root, this.players.root, this.sun, this.sun.target, this.fill)
    if (this.look !== null) this.root.add(this.look.root)
  }

  private parent(mover: HandleId | null): Group {
    return mover === null ? this.root : this.groups.get(mover)!
  }

  update(world: World, t: number, dt: number, lang: Lang) {
    const movers = new Map<HandleId, Mover>()
    for (const m of world.movers) {
      movers.set(m.id, m)
      const g = this.groups.get(m.id)!
      g.visible = !m.hidden
      g.position.set(m.at[0], m.at[1], m.at[2])
      turnTo(g, m.turn, this.high)
    }
    const moverOf = (id: HandleId | null) => (id === null ? null : movers.get(id)!)
    // A mover that glows lights its batch.
    for (const [mover, batch] of this.batches) {
      if (mover === null || batch.meshes.solid === null) continue
      const glow = movers.get(mover)!.glow
      batch.meshes.solid.material = glow === null ? ROOM_PATTERNED : glowMaterial(glow)
    }

    for (const s of world.solids) {
      if (s.house) continue
      const known = this.watched.get(s.id)
      if (known !== undefined && known !== solidKey(s)) {
        this.batches.get(s.mover)!.takeOut(s.id)
        this.watched.delete(s.id)
        // Drawn plain on its own from now on (SolidView), which the pick meets instead.
        const plain = this.plainForPick.get(s.id)
        if (plain !== undefined) {
          plain.removeFromParent()
          plain.geometry.dispose()
          this.picks.splice(this.picks.indexOf(plain), 1)
          this.plainForPick.delete(s.id)
        }
      }
      if (!this.watched.has(s.id)) {
        let v = this.solids.get(s.id)
        if (v === undefined) {
          v = new SolidView(this.models, world.view, this.dim)
          this.solids.set(s.id, v)
          this.parent(s.mover).add(v.root)
          this.picks.push(v.root)
        }
        v.update(s, moverOf(s.mover), t)
      }
      if (carries(s.surface) || this.belts.has(s.id)) {
        let b = this.belts.get(s.id)
        if (b === undefined) {
          b = new BeltView(this.high)
          this.belts.set(s.id, b)
          this.parent(s.mover).add(b.root)
        }
        b.update(s, t)
      }
    }

    for (const d of world.decor) {
      const batch = this.batches.get(d.mover)
      if (batch !== undefined && batch.has(d.id)) {
        if (stillDecor(d)) continue
        batch.takeOut(d.id)
      }
      let v = this.decor.get(d.id)
      if (v === undefined) {
        v = new ModelHandleView(this.models, d.model, this.high)
        this.decor.set(d.id, v)
        this.parent(d.mover).add(v.root)
        this.picks.push(v.root)
      }
      v.update(d.at, d.turn, d.scale, 0, STILL, d.hidden, d.parts, glowOf(d.glow, moverOf(d.mover)), t)
    }


    world.zones.forEach((z, i) => this.zones[i]!.update(z, moverOf(z.mover), t))
    world.signs.forEach((s, i) => this.signs[i]!.update(s, moverOf(s.mover)?.turn ?? 0, t, lang, s.mover === null ? [world.bounds.min[0], world.bounds.max[0]] : null, this.high))
    this.updateLight(world, movers)
    this.door.update(world.wayOut, t)
    this.pops.update(world.pops, t, lang)
    // What a player carries lifts their arrow and badge over it.
    const carried = new Map<SeatIndex, number>()
    for (const th of world.things) {
      if (th.heldBy === null) continue
      const b = this.models.get(th.model).recipe.bounds
      carried.set(th.heldBy, (b.max[1] - b.min[1]) * th.scale)
    }
    this.players.update(world.players, carried, t, dt, lang, world.view)
    // Things after the players, so one carried goes where its carrier is drawn in a crowd.
    const byId = new Map(world.players.map((p) => [p.seat, p]))
    world.things.forEach((th, i) => this.updateThing(this.things[i]!, th, th.heldBy === null ? null : byId.get(th.heldBy)!, t))
    this.glows.update(world, movers, this.models, (seat) => this.players.shownOffset(seat), this.door.halo, t)
    this.look?.update(world, t)
    this.shine.update(t)
    pulseGlows(t)
    texts.sweep()
  }

  /** A loose thing where it is, or carried over its carrier's head. */
  private updateThing(v: ModelHandleView, th: Thing, carrier: World['players'][number] | null, t: number) {
    const at: Vec3 = carrier === null ? th.at : [carrier.at[0] + this.players.shownOffset(carrier.seat), carrier.at[1] + KID_HEIGHT * carrier.size + 0.02, carrier.at[2] + 0.15]
    v.update(at, 0, th.scale, th.round ? th.roll : 0, th.velocity, th.hidden, th.parts, th.glow, t)
  }

  /**
   * Where a line from the eye (from, along way) first meets the room's place as drawn this frame:
   * a floor, a top, a wall, a thing, decor, a sign or the house round the room; null where it meets
   * none of them. How a tap from high up finds its point (RoomStage.tsx pointAt). It passes through
   * the look's wallpaper, decor and props as if they were not there, and meets a dressed solid as its
   * plain shape (plainForPick), never its model, so the play hears every tap the same with a look or
   * without one. It passes through the way out's door too (no tap is its), whose frame is in the batch.
   */
  readonly pick = (from: Vec3, way: Vec3): Vec3 | null => {
    this.ray.set(new Vector3(from[0], from[1], from[2]), new Vector3(way[0], way[1], way[2]).normalize())
    const room = this.batches.get(null)
    for (const hit of this.ray.intersectObjects(this.picks, true)) {
      if (!shownAll(hit.object)) continue
      const piece = room === undefined || hit.face == null ? null : room.pieceOf(hit.object, hit.face.a)
      if (piece === LOOK_PIECE || piece === DOOR_PIECE || (piece !== null && this.plainForPick.has(piece))) continue
      return [hit.point.x, hit.point.y, hit.point.z]
    }
    return null
  }

  /** A tap from the side, at its point on z = 0, for the look's props: the play hears it on its own (pointAt), whatever a prop does. */
  tapAt(at: Vec3) {
    this.look?.tapAt(at)
  }

  /** A tap from high up, along the line from the eye, for the look's props: a prop reacts when the line meets it before anything of the play. The play hears the tap on its own (pick never meets a prop). */
  tapRay(from: Vec3, way: Vec3) {
    if (this.look === null) return
    const play = this.pick(from, way)
    this.look.tapRay(from, way, play === null ? Infinity : Math.hypot(play[0] - from[0], play[1] - from[1], play[2] - from[2]))
  }

  /** The puffs to draw: the World's and the look's props' (lookView.ts puffsWith). */
  puffsWith(world: readonly Puff[]): readonly Puff[] {
    return this.look === null ? world : puffsWith(world, this.look.puffs.puffs, PUFF_CAP)
  }

  /**
   * The lamps, the room's and the look's: real lights for the strongest shown (lampsLit), chosen again every frame, so a lamp shown, hidden or set takes its place at once; a
   * halo round every one shown, the brighter the dimmer the room (shineIn).
   */
  private updateLight(world: World, movers: Map<HandleId, Mover>) {
    const light = world.shell.light
    const lamps: LampShown[] = [
      ...world.lamps.filter((l) => !l.hidden && !(l.mover !== null && movers.get(l.mover)!.hidden)).map((l: Lamp) => ({ at: inRoom(l.at, l.mover === null ? null : movers.get(l.mover)!, this.high), color: l.color, power: l.power, reach: l.reach })),
      ...(this.look?.lamps ?? []),
    ]
    const at = (l: LampShown) => l.at
    const lit = lampsLit(lamps)
    this.lights.forEach((pl, i) => {
      const l = lit[i]
      if (l === undefined) {
        pl.intensity = 0
        return
      }
      const p = at(l)
      pl.position.set(p[0], p[1], p[2] + 0.6)
      pl.color.set(colorOf(l.color))
      pl.distance = l.reach
      pl.intensity = l.power * LAMP_STRENGTH
    })
    this.shine.setLamps(
      lamps.map((l): LampHalo => {
        const p = at(l)
        return { at: [p[0], p[1], p[2] + 0.2], tint: new Color(colorOf(l.color)).multiplyScalar(Math.min(1, l.power) * shineIn(light)) }
      }),
    )
  }

  dispose() {
    for (const b of this.batches.values()) b.dispose()
    for (const m of this.plainForPick.values()) m.geometry.dispose()
    for (const v of this.solids.values()) v.dispose()
    for (const b of this.belts.values()) b.dispose()
    for (const z of this.zones) z.dispose()
    for (const s of this.signs) s.dispose()
    this.shine.dispose()
    this.glows.dispose()
    this.look?.dispose()
    this.door.dispose()
    this.pops.dispose()
    this.players.dispose()
    this.models.dispose()
    this.root.removeFromParent()
  }
}
