/**
 * The helper (plan.md, Help, and how hard): the house's own small lantern with a face, made with
 * Silly Billy's kit in the house's flat-shaded look. The sim flies it (engine/sim.ts, the
 * referee's phase): it waits outside the room's inside, on the ceiling's beam at the right (from high
 * up on the walls' back right corner), under the ? that calls it, flies to the next step's spot when
 * nothing has been done for a while or the ? is pressed, and says the hint there (the page shows
 * and says the words: shell/HelperBubble.tsx). Here it is only drawn: bobbing in the air, leaning
 * into its flight, and hopping while it talks. A soft halo round it, so it shines by day and by night.
 */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Group } from 'three'

import { buildRecipe } from '../../../silly-billy/src/engine/kit'
import type { Recipe } from '../../../silly-billy/src/engine/types'
import { palette } from '../../../silly-billy/src/scene/look'
import { AS_BUILT, buildModel, disposeModel, ModelView } from '../../../silly-billy/src/scene/recipeMesh'
import { ROOM } from '../engine/api'
import type { Helper } from '../engine/world'
import { haloSprite } from './halo'
import type { RoomSource } from './RoomStage'

/** How the lantern is drawn: how many times its model's size (big enough to find at once in the 16 m room, and no bigger, so it hides little), how far in front of the players' plane from the side, how high and fast it bobs, how far it leans into a flight, how long it hops after it starts to talk (as long as the HUD shows the hint), and its halo across, metres. From the side it comes forward as it rises within `toBeam` metres of the ceiling, to `beamGap` in front of the beam's face, so the beam never hides it. */
export const LANTERN = { size: 1, z: 0.6, toBeam: 1, beamGap: 0.2, bob: 0.08, bobPerSecond: 0.35, lean: 0.12, leanMost: 0.35, talkSecs: 7, halo: 2 } as const

const GLASS = '#ffd76b'
const CAP = '#e8503f'

/**
 * The lantern's model, about 0.6 m tall and its middle at its origin: a round paper lantern glowing
 * warm yellow, a red cap and foot, a ring to hold it by on top, and a face on its front (two eyes,
 * pink cheeks, a smile), which looks at the children from wherever it flies.
 */
export const LANTERN_MODEL: Recipe = buildRecipe((m) => {
  m.sphere(0.22, { at: [0, 0, 0], scale: [1, 1.08, 0.9], color: GLASS, glow: true })
  for (const y of [-0.12, 0, 0.12]) m.torus(0.2 * Math.sqrt(1 - (y / 0.24) ** 2) + 0.01, 0.012, { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.9, 1], color: '#f2a93b' })
  m.cylinder(0.11, 0.14, 0.07, { at: [0, 0.25, 0], color: CAP })
  m.cylinder(0.14, 0.1, 0.06, { at: [0, -0.25, 0], color: CAP })
  m.torus(0.06, 0.014, { at: [0, 0.33, 0], color: palette.ink })
  m.sphere(0.03, { at: [0, -0.3, 0], color: CAP })
  // The face, on the front (+z): the eyes, the cheeks and a smile drawn as a tube.
  for (const side of [-1, 1]) {
    m.sphere(0.032, { at: [side * 0.07, 0.04, 0.19], scale: [1, 1.25, 0.6], color: palette.ink })
    m.sphere(0.011, { at: [side * 0.07 + 0.01, 0.055, 0.21], color: '#ffffff' })
    m.sphere(0.03, { at: [side * 0.125, -0.025, 0.17], scale: [1, 0.6, 0.5], color: '#ff8fb1' })
  }
  m.tube(
    [
      [-0.055, -0.03, 0.195],
      [-0.025, -0.06, 0.2],
      [0.025, -0.06, 0.2],
      [0.055, -0.03, 0.195],
    ],
    0.011,
    { color: palette.ink },
  )
  return {}
}, ['lantern']).recipe

/** The lantern's place, lean and size at t, from the sim's helper and where it was a frame before. Pure, for the test. */
export function lanternPose(helper: Pick<Helper, 'at' | 'says' | 'saidAt'>, before: readonly [number, number], t: number, dt: number): { x: number; y: number; lean: number; scale: number } {
  const vx = dt > 0 ? (helper.at[0] - before[0]) / dt : 0
  const talking = helper.says !== null && t - helper.saidAt >= 0 && t - helper.saidAt < LANTERN.talkSecs
  // While it talks it hops a little with each word, as a child would see a speaker do.
  const hop = talking ? 0.06 * Math.abs(Math.sin((t - helper.saidAt) * 7)) : 0
  return {
    x: helper.at[0],
    y: helper.at[1] + LANTERN.bob * Math.sin(2 * Math.PI * LANTERN.bobPerSecond * t) + hop,
    lean: Math.max(-LANTERN.leanMost, Math.min(LANTERN.leanMost, -vx * LANTERN.lean)),
    scale: talking ? 1.12 : 1,
  }
}

/** The helper's lantern over the room, read from the world every frame. */
export function Lantern({ source }: { source: RoomSource }) {
  const view = useMemo(() => {
    const model = buildModel(LANTERN_MODEL, false, null, null)
    const shown = new ModelView(model)
    shown.pose({}, AS_BUILT)
    const halo = haloSprite(GLASS)
    halo.scale.setScalar(LANTERN.halo / LANTERN.size)
    halo.position.z = -0.25
    const root = new Group()
    root.add(shown.root, halo)
    // One lantern for the stage's life; the world it reads may change every frame.
    return { model, root, halo, before: [source.world.helper.at[0], source.world.helper.at[1]] as [number, number], lean: 0 }
  }, [])
  useEffect(
    () => () => {
      disposeModel(view.model)
      view.halo.material.dispose()
    },
    [view],
  )
  useFrame((_, delta) => {
    const w = source.world
    const dt = Math.min(delta, 0.1)
    const pose = lanternPose(w.helper, view.before, w.t, dt)
    view.before = [w.helper.at[0], w.helper.at[1]]
    // The lean eases, so a stop is a sway and not a snap.
    view.lean += (pose.lean - view.lean) * (1 - Math.exp(-8 * dt))
    // From the side in front of the players' plane, and in front of the ceiling's beam near it; from high up where the sim puts it.
    const up = Math.min(1, Math.max(0, (pose.y - (ROOM.side.height - LANTERN.toBeam)) / LANTERN.toBeam))
    view.root.position.set(pose.x, pose.y, w.view === 'high' ? w.helper.at[2] : LANTERN.z + up * (ROOM.side.front + LANTERN.beamGap - LANTERN.z))
    view.root.rotation.set(0, 0, view.lean)
    view.root.scale.setScalar(pose.scale * LANTERN.size)
    view.halo.material.opacity = 0.75 + 0.25 * Math.sin(w.t * 2.4)
  })
  return <primitive object={view.root} />
}
