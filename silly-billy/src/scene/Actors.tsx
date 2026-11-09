import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { CylinderGeometry, Group, Mesh, Vector3, type BufferGeometry, type Object3D } from 'three'

import { KID_HEAD_R, apply, bodyCenter, proportions, type Proportions } from '../engine/body'
import { partTransform } from '../engine/kit'
import { nightOf, skyOf } from '../engine/sky'
import { SLOTS, type Actor, type Look, type PartPose, type Slot, type World } from '../engine/types'
import { Bubbles, Declutter, type TagBoard } from './Bubbles'
import type { Lamp } from './daylight'
import { Face } from './face'
import { useLive } from './live'
import { UNSEEN, type Clock } from './look'
import { AS_BUILT, ModelView, type Half, type Models } from './recipeMesh'
import { dressBones, makeBones, poseBones, type Bones } from './rig'
import type { SceneSource } from './Stage'
import { glowing, shownLook } from './States'

/**
 * Everybody in the room, on the rig of rig.ts: placed and posed from the world every frame,
 * a face that shows the mood and blinks, and what they wear drawn on them from the things'
 * own models, their moving parts posed as the world says. Worn things are built around the
 * model kid (body.ts's KID_HEIGHT, KID_HEAD_R), so each slot hangs on its bone scaled to this
 * body: hair, hats and glasses on the head's centre by the head's size, gowns at the feet and
 * capes on the back by the torso's size (a gown in two on a person: what is above the hips
 * bows and twists with the upper body), a hand thing upright in the right hand at its 'hand'
 * anchor, as a held thing is. A tap anywhere on someone (or close by: each has a big unseen
 * tap target) names them.
 */

/** A worn thing as drawn: one piece, or for a body thing on a person its lower and upper halves, each a copy of its model on a holder hung on a bone. */
interface Wearing {
  pieces: Array<{ holder: Group; view: ModelView }>
}

/** A worn thing with nothing that moves. */
const NO_POSE: Record<string, PartPose> = {}

interface ActorView {
  /** What its body was built from: when this changes the body is built again. */
  body: string
  pr: Proportions
  container: Group
  bones: Bones
  face: Face
  owned: BufferGeometry[]
  worn: Partial<Record<Slot, Wearing>>
  /** Its own beat for blinking and swaying, from its id. */
  phase: number
  seen: number
}

const bodyKey = (l: Look, lit: boolean) => [l.body, l.height, l.build, l.skin, l.eyes, l.top, l.bottom, l.shoes, l.skirt, lit].join('|')
const phaseOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 9973, 7) / 9973

/** Blinks for 0.13 s every 3 to 5 seconds, each at its own beat. */
const blinking = (t: number, phase: number) => {
  const every = 3 + 2 * phase
  return (t + phase * 7) % every < 0.13
}

const hand = new Vector3()
const anchor = new Vector3()
const UP = new Vector3(0, 1, 0)

export class ActorLayer {
  readonly root = new Group()
  /** The light each glowing body gives this frame, for the scene's lamps. */
  readonly lamps: Lamp[] = []
  private readonly views = new Map<string, ActorView>()
  private tick = 0

  constructor(private readonly models: Models) {}

  update(world: World, clock: number) {
    const tick = ++this.tick
    const night = nightOf(skyOf(world).time)
    this.lamps.length = 0
    for (const a of world.actors) {
      let v = this.views.get(a.id)
      // A sick, hot or cold body is drawn in a tinted look, a glowing one lighting itself: built again when that changes.
      const look = shownLook(a)
      const lit = glowing(a)
      const body = bodyKey(look, lit)
      if (v !== undefined && v.body !== body) {
        this.drop(v)
        v = undefined
      }
      if (v === undefined) {
        v = this.build(a, look, lit, body)
        this.views.set(a.id, v)
      }
      if (lit) {
        const c = bodyCenter(a, v.pr)
        this.lamps.push({ x: c[0], y: c[1], z: c[2], color: '#fff2b8', strength: 0.45 + 0.55 * night })
      }
      v.seen = tick
      poseBones(v.bones, a, v.pr, 0.18 * Math.sin(clock * 1.7 + v.phase * 20))
      v.face.show(a.mood, blinking(clock, v.phase))
      for (const slot of SLOTS) this.wear(v, slot, a)
    }
    for (const [id, v] of this.views) {
      if (v.seen === tick) continue
      this.drop(v)
      this.views.delete(id)
    }
  }

  private build(a: Actor, look: Look, lit: boolean, body: string): ActorView {
    const pr = proportions(look)
    const bones = makeBones(pr, look.body)
    const owned = dressBones(bones, look, pr, lit)
    const face = new Face(look)
    face.group.scale.setScalar(pr.headR)
    bones.head.add(face.group)
    // The tap target: a fat unseen post round the whole body.
    const r = Math.max(0.5, pr.radius * 1.6)
    const target = new CylinderGeometry(r, r, pr.height + 0.3, 8)
    const post = new Mesh(target, UNSEEN)
    post.position.y = (pr.height + 0.3) / 2
    bones.base.add(post)
    owned.push(target)
    const container = new Group()
    container.userData.actor = a.id
    container.add(bones.root)
    this.root.add(container)
    return { body, pr, container, bones, face, owned, worn: {}, phase: phaseOf(a.id), seen: 0 }
  }

  /** Keeps a slot's drawn thing in step with the look: made, remade when its model changes, posed, dropped when taken off. */
  private wear(v: ActorView, slot: Slot, a: Actor) {
    const worn = a.look.worn[slot]
    const now = v.worn[slot]
    if (worn === undefined) {
      if (now !== undefined) {
        for (const piece of now.pieces) piece.holder.removeFromParent()
        delete v.worn[slot]
      }
      return
    }
    const halves: Array<Half | null> = slot === 'body' && !v.pr.animal ? ['lower', 'upper'] : [null]
    const models = halves.map((half) => this.models.get(worn.kind, worn.tint, half, null))
    let w = now
    if (w === undefined || w.pieces.length !== models.length || w.pieces.some((piece, i) => piece.view.model !== models[i])) {
      for (const piece of w?.pieces ?? []) piece.holder.removeFromParent()
      w = {
        pieces: models.map((model, i) => {
          const piece = { holder: this.holder(v, slot, halves[i]!), view: new ModelView(model) }
          piece.holder.add(piece.view.root)
          return piece
        }),
      }
      v.worn[slot] = w
    }
    // The parts its process and the action's code move: the engine keeps them beside the look, so a look that is saved never changes with them.
    const parts = a.wornParts?.[slot] ?? NO_POSE
    for (const piece of w.pieces) piece.view.pose(parts, AS_BUILT)
    if (slot !== 'hand') return
    // Upright in the right hand, turned with the body, its 'hand' anchor at the drawn hand.
    const model = models[0]!
    const holder = w.pieces[0]!.holder
    const grip = model.recipe.anchors.hand
    const frame = partTransform(model.recipe.parts, grip.part)
    const p = apply(frame.r, grip.at)
    anchor.set(p[0] + frame.p[0], p[1] + frame.p[1], p[2] + frame.p[2]).multiplyScalar(a.scale).applyAxisAngle(UP, a.yaw)
    v.bones.hand.right.getWorldPosition(hand)
    holder.position.copy(hand).sub(anchor)
    holder.rotation.set(0, a.yaw, 0)
    holder.scale.setScalar(a.scale)
  }

  /** Where a slot's thing (or that half of it) hangs, scaled from the model kid it was built around to this body. */
  private holder(v: ActorView, slot: Slot, half: Half | null): Group {
    const g = new Group()
    const pr = v.pr
    switch (slot) {
      case 'hair':
      case 'head':
      case 'face':
        g.scale.setScalar(pr.headR / KID_HEAD_R)
        v.bones.head.add(g)
        break
      case 'body':
        g.scale.set(pr.torsoW / 0.32, pr.shoulderY / 0.68, pr.torsoD / 0.2)
        if (half === 'upper') {
          // Turning at the hips with the upper body; standing straight, exactly where the whole thing would hang.
          g.position.y = -pr.hipY
          v.bones.upper.add(g)
        } else v.bones.squash.add(g)
        break
      case 'back':
        g.scale.set(pr.torsoW / 0.32, pr.shoulderY / 0.68, pr.torsoD / 0.2)
        v.bones.back.add(g)
        break
      case 'hand':
        v.container.add(g)
        break
    }
    return g
  }

  private drop(v: ActorView) {
    v.container.removeFromParent()
    for (const g of v.owned) g.dispose()
  }

  dispose() {
    for (const v of this.views.values()) this.drop(v)
    this.views.clear()
  }
}

/** The actor a tapped solid belongs to, found up its parents. */
function actorOf(o: Object3D | null): string | null {
  for (let at = o; at !== null; at = at.parent) if (typeof at.userData.actor === 'string') return at.userData.actor
  return null
}

export function Actors({ layer, source, clock, onTapActor }: { layer: ActorLayer; source: SceneSource; clock: Clock; onTapActor: (id: string) => void }) {
  useEffect(() => () => layer.dispose(), [layer])
  useFrame(() => layer.update(source.world, clock.t))
  const ids = useLive(() => source.world.actors.map((a) => a.id).join(' '))
  const board = useMemo<TagBoard>(() => new Map(), [])
  return (
    <>
      <primitive
        object={layer.root}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => {
          const id = actorOf(e.object)
          if (id === null) return
          e.stopPropagation()
          onTapActor(id)
        }}
      />
      {ids === '' ? null : ids.split(' ').map((id) => <Bubbles key={id} source={source} id={id} clock={clock} board={board} />)}
      <Declutter board={board} />
    </>
  )
}
