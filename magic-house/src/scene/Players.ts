/**
 * The players: Silly Billy kids on its rig (scene/rig.ts) with its face (scene/face.ts), posed every
 * frame by this game's animator (animate.ts) from the world's player. Over each the seat's colour
 * as a little arrow, and their score on a badge once they have one; round a glowing player a halo,
 * round a bonked one stars. What they wear hangs on its bone as Silly Billy hangs it, each worn
 * model painted the wearer's colours, what it paints main in their pattern (patterns/look.ts).
 */

import { ConeGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D, Sprite, SpriteMaterial, type BufferGeometry } from 'three'

import type { Lang } from '../../../profiles/src/lang'
import { KID_HEAD_R, KID_HEIGHT, apply, proportions, type Proportions } from '../../../silly-billy/src/engine/body'
import { partTransform } from '../../../silly-billy/src/engine/kit'
import type { Look, Slot } from '../../../silly-billy/src/engine/types'
import { star } from '../../../silly-billy/src/scene/Effects'
import { Face } from '../../../silly-billy/src/scene/face'
import { colorOf, glow } from '../../../silly-billy/src/scene/look'
import { disposeModel, ModelView, type Model } from '../../../silly-billy/src/scene/recipeMesh'
import { dressBones, makeBones, poseBones, type Bones } from '../../../silly-billy/src/scene/rig'
import type { Player, World } from '../engine/world'
import { wornModelIn, wornView } from '../patterns/look'
import { patternShown } from '../patterns/patterns'
import type { Wearing } from '../saves'
import type { SeatIndex } from '../seats/types'
import { animate } from './animate'
import { HAIR_CAP, type WornModels } from './dress'
import { haloSprite } from './halo'
import { pulseAt } from './models'
import { badgeTexture } from './Signs'

/**
 * Where the seat's arrow and the badge float over the head, metres above it; how big they are. From
 * high up a kid is drawn small (about 30 px on a tablet), so the arrow is drawn `highArrow` times as
 * big and that much higher: the seat's colour over the head is how a child finds their own kid.
 */
export const OVER_HEAD = { arrow: 0.32, badge: 0.78, badgeHeight: 0.42, stars: 0.12, highArrow: 2.5 } as const
/** How far apart the seats stand in depth, so two kids in one spot are both seen. */
const SEAT_DEPTH = 0.08
/**
 * Players walk through each other, so a crowd pushing one thing stands on one spot. Drawn only (the
 * sim stays as it is), kids nearer than `near` across (and in depth, from high up) and `level` in
 * height are fanned out `gap` apart across round their middle, in seat order, and their arrows stand
 * `lift` higher by rank.
 */
export const CROWD = { near: 0.35, level: 0.3, gap: 0.3, lift: 0.14, ease: 10 } as const

/** For each seat, how far across it is drawn from where it stands, and its rank in its crowd (0 when alone). Pure, for the test. */
export function crowdOffsets(players: readonly Pick<Player, 'seat' | 'at'>[]): Map<SeatIndex, { dx: number; rank: number }> {
  const out = new Map<SeatIndex, { dx: number; rank: number }>()
  const left = [...players].sort((a, b) => a.at[0] - b.at[0] || a.seat - b.seat)
  let i = 0
  while (i < left.length) {
    // A crowd: each next kid near the one before it, at the same height as the first.
    let j = i + 1
    while (j < left.length && left[j]!.at[0] - left[j - 1]!.at[0] < CROWD.near && Math.abs(left[j]!.at[1] - left[i]!.at[1]) < CROWD.level && Math.abs(left[j]!.at[2] - left[i]!.at[2]) < CROWD.near) j++
    const crowd = left.slice(i, j).sort((a, b) => a.seat - b.seat)
    crowd.forEach((p, rank) => out.set(p.seat, { dx: crowd.length === 1 ? 0 : (rank - (crowd.length - 1) / 2) * CROWD.gap, rank: crowd.length === 1 ? 0 : rank }))
    i = j
  }
  return out
}
/** The stars round a bonked head. */
const STARS = 3
const STAR_COLOR = '#ffd23a'

interface WornView {
  key: string
  holder: Group
  view: ModelView
}

interface KidView {
  body: string
  pr: Proportions
  look: Look
  container: Group
  bones: Bones
  face: Face
  owned: BufferGeometry[]
  arrow: Mesh
  badge: Sprite
  halo: Sprite
  worn: Partial<Record<Slot, WornView>>
  /** The turn drawn, easing toward the way they face. */
  yaw: number
  /** How far across from where they stand they are drawn, easing toward their place in a crowd (CROWD). */
  spread: number
}

const bodyKey = (p: Player) => [p.body.skin, p.body.eyes, p.body.top, p.body.bottom, p.body.shoes, p.body.skirt, p.body.build].join('|')

const ARROW = new ConeGeometry(0.13, 0.24, 4).rotateX(Math.PI).rotateY(Math.PI / 4)
const scratch = new Object3D()

export class PlayerLayer {
  readonly root = new Group()
  private readonly views = new Map<number, KidView>()
  /** Worn models in their wearers' colours and patterns, by id, colours, pattern and slot, shared by everyone wearing the same. */
  private readonly wornModels = new Map<string, Model>()
  private readonly stars: InstancedMesh

  constructor(private readonly models: WornModels) {
    this.stars = new InstancedMesh(star(), glow(STAR_COLOR), 4 * STARS)
    this.stars.count = 0
    this.stars.frustumCulled = false
    this.root.add(this.stars)
  }

  /** `carried`: how tall what each seat carries over its head is, metres, to float the arrow and badge over it. `view`: how the room is seen, for which way a kid turns (animate.ts). */
  update(players: readonly Player[], carried: ReadonlyMap<SeatIndex, number>, t: number, dt: number, lang: Lang, view: World['view']) {
    let stars = 0
    const crowd = crowdOffsets(players)
    for (const p of players) {
      let v = this.views.get(p.id)
      const body = bodyKey(p)
      if (v !== undefined && v.body !== body) {
        this.drop(v)
        v = undefined
      }
      const kid = animate(p, t, view)
      if (v === undefined) {
        v = this.build(p, body, kid.yaw)
        this.views.set(p.id, v)
      }
      v.container.visible = kid.shown
      // Turning round is quick but not a snap, and the short way round (from high up a kid may turn any way).
      let turn = kid.yaw - v.yaw
      if (turn > Math.PI) turn -= 2 * Math.PI
      else if (turn < -Math.PI) turn += 2 * Math.PI
      v.yaw += turn * (1 - Math.exp(-14 * dt))
      if (v.yaw > Math.PI) v.yaw -= 2 * Math.PI
      else if (v.yaw < -Math.PI) v.yaw += 2 * Math.PI
      const place = crowd.get(p.seat)!
      v.spread += (place.dx - v.spread) * (1 - Math.exp(-CROWD.ease * dt))
      const x = p.at[0] + v.spread
      const z = p.at[2] + (p.seat - 1.5) * SEAT_DEPTH
      poseBones(v.bones, { x, y: p.at[1], z, yaw: v.yaw, pitch: 0, roll: 0, scale: kid.scale, pose: kid.pose, look: v.look }, v.pr, 0)
      v.face.show(kid.mood, (t + p.seat * 1.7) % (3.4 + p.seat * 0.3) < 0.13)
      for (const [slot, wearing] of Object.entries(p.wear) as [Slot, Wearing][]) this.wear(v, slot, wearing)
      for (const slot of Object.keys(v.worn) as Slot[]) if (p.wear[slot] === undefined) this.unwear(v, slot)
      const head = p.at[1] + KID_HEIGHT * kid.scale
      const top = head + (carried.get(p.seat) ?? 0)
      const big = view === 'high' ? OVER_HEAD.highArrow : 1
      v.arrow.scale.setScalar(big)
      v.arrow.position.set(x, top + OVER_HEAD.arrow * big + place.rank * CROWD.lift * big + 0.05 * Math.sin(t * 3 + p.seat), z)
      v.badge.visible = p.badge
      if (p.badge) {
        const { texture, aspect } = badgeTexture(p.score, p.color, lang)
        const mat = v.badge.material
        if (mat.map !== texture) {
          mat.map = texture
          mat.needsUpdate = true
        }
        v.badge.scale.set(OVER_HEAD.badgeHeight * aspect, OVER_HEAD.badgeHeight, 1)
        // Over a bigger arrow, higher by as much as the arrow grew.
        v.badge.position.set(x, top + OVER_HEAD.badge + (big - 1) * 2 * OVER_HEAD.arrow + place.rank * CROWD.lift * big, z)
      }
      v.halo.visible = p.glow !== null
      if (p.glow !== null) {
        v.halo.material.color.set(p.glow.color)
        v.halo.material.opacity = p.glow.pulse ? 0.45 + 0.55 * pulseAt(t) : 0.85
        v.halo.scale.setScalar(2.2 * kid.scale)
        v.halo.position.set(x, p.at[1] + (KID_HEIGHT / 2) * kid.scale, z - 0.4)
      }
      if (kid.stars && kid.shown)
        for (let i = 0; i < STARS; i++) {
          const a = t * 5 + (i * 2 * Math.PI) / STARS
          const r = KID_HEAD_R * 1.7 * kid.scale
          scratch.position.set(x + Math.cos(a) * r, head + OVER_HEAD.stars * kid.scale, z + Math.sin(a) * r)
          scratch.rotation.set(0, 0, t * 4 + i)
          scratch.scale.setScalar(0.24 * kid.scale)
          scratch.updateMatrix()
          this.stars.setMatrixAt(stars++, scratch.matrix)
        }
    }
    this.stars.count = stars
    this.stars.instanceMatrix.needsUpdate = true
  }

  /** How far across from where it stands a seat is drawn now (its place in a crowd), for what it carries. Asked after update, which made every seat's view (a player's id is its seat). */
  shownOffset(seat: SeatIndex): number {
    return this.views.get(seat)!.spread
  }

  /** A kid's view, turned `yaw` to start with. */
  private build(p: Player, body: string, yaw: number): KidView {
    const look: Look = { body: 'kid', height: KID_HEIGHT, build: p.body.build, skin: p.body.skin, eyes: p.body.eyes, top: p.body.top, bottom: p.body.bottom, shoes: p.body.shoes, skirt: p.body.skirt, worn: {} }
    const pr = proportions(look)
    const bones = makeBones(pr, 'kid')
    const owned = dressBones(bones, look, pr, false)
    const face = new Face(look)
    face.group.scale.setScalar(pr.headR)
    bones.head.add(face.group)
    const container = new Group()
    container.add(bones.root)
    // The arrow and the badge are drawn over everything, so a kid behind a wall is still found.
    const arrow = new Mesh(ARROW, new MeshBasicMaterial({ color: colorOf(p.color), depthTest: false, toneMapped: false }))
    arrow.renderOrder = 6
    const badge = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }))
    badge.renderOrder = 7
    const halo = haloSprite(p.color)
    container.add(arrow, badge, halo)
    this.root.add(container)
    return { body, pr, look, container, bones, face, owned, arrow, badge, halo, worn: {}, yaw, spread: 0 }
  }

  /** Keeps a slot's worn thing in step with what the world says they wear. */
  private wear(v: KidView, slot: Slot, w: Wearing) {
    const found = this.models(w.id)
    // A hair present may still be loading (step 5): a plain cap of hair in its colour stands in meanwhile.
    const recipe = found ?? (slot === 'hair' ? HAIR_CAP : null)
    if (recipe === null) return this.unwear(v, slot)
    const key = `${found === null ? 'cap' : w.id}|${w.main}|${w.second}|${patternShown(slot, w)}|${slot}`
    if (v.worn[slot]?.key === key) return
    this.unwear(v, slot)
    let model = this.wornModels.get(key)
    if (model === undefined) {
      model = wornModelIn(recipe, w, slot)
      this.wornModels.set(key, model)
    }
    const view = wornView(model)
    const holder = new Group()
    const b = v.look.build
    switch (slot) {
      case 'hair':
      case 'head':
      case 'face':
        v.bones.head.add(holder)
        break
      case 'body':
        holder.scale.set(b, 1, b)
        v.bones.squash.add(holder)
        break
      case 'back':
        holder.scale.set(b, 1, b)
        v.bones.back.add(holder)
        break
      case 'hand': {
        // Held at its 'hand' anchor, in the right fist.
        const grip = model.recipe.anchors.hand!
        const f = partTransform(model.recipe.parts, grip.part)
        const o = apply(f.r, grip.at)
        holder.position.set(-(o[0] + f.p[0]), -(o[1] + f.p[1]), -(o[2] + f.p[2]))
        v.bones.hand.right.add(holder)
        break
      }
    }
    holder.add(view.root)
    v.worn[slot] = { key, holder, view }
  }

  private unwear(v: KidView, slot: Slot) {
    const w = v.worn[slot]
    if (w === undefined) return
    w.holder.removeFromParent()
    delete v.worn[slot]
  }

  private drop(v: KidView) {
    v.container.removeFromParent()
    for (const g of v.owned) g.dispose()
    v.badge.material.dispose()
    ;(v.arrow.material as MeshBasicMaterial).dispose()
    v.halo.material.dispose()
  }

  dispose() {
    for (const v of this.views.values()) this.drop(v)
    this.views.clear()
    for (const m of this.wornModels.values()) disposeModel(m)
    this.wornModels.clear()
    this.stars.dispose()
  }
}
