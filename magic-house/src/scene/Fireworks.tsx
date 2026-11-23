/**
 * The fireworks drawn (fireworks.ts plans them): every star of every burst in one instanced mesh
 * of Silly Billy's flat star, every soft glow in one instanced mesh of the halo, so the whole show
 * costs two draw calls. They go up when `since` first gives a time (in a room, once it has ended;
 * on the end's stage, from the start), timed by the world's clock, over the camera's frame. From high
 * up the camera's frame is the box's front (world.ts Camera), and they go up at the back of the floor
 * frame, tipped to face the camera, so they burst in the sky over the far side of the room.
 */

import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { AdditiveBlending, Color, Group, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry } from 'three'

import { CAMERA_PITCH } from '../../../castle-builder/src/scene/look'
import { star } from '../../../silly-billy/src/scene/Effects'
import { colorOf } from '../../../silly-billy/src/scene/look'
import type { World } from '../engine/world'
import { FIREWORKS, LIGHTS_MOST, lightsAt } from './fireworks'
import { haloTexture } from './halo'
import type { RoomSource } from './RoomStage'

const scratch = new Object3D()
const tint = new Color()

/** The fireworks over the room: `since` gives the seconds since they began, or null while they have not. */
export function Fireworks({ source, since }: { source: RoomSource; since: (world: World) => number | null }) {
  const layer = useMemo(() => {
    const stars = new InstancedMesh(star(), new MeshBasicMaterial({ toneMapped: false }), LIGHTS_MOST.stars)
    const glows = new InstancedMesh(new PlaneGeometry(1, 1), new MeshBasicMaterial({ map: haloTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }), LIGHTS_MOST.glows)
    for (const m of [stars, glows]) {
      m.count = 0
      m.frustumCulled = false
      m.renderOrder = 4
      // Every instance's colour is set before it is drawn; this makes the colour buffer.
      m.setColorAt(0, tint.set('#ffffff'))
    }
    const root = new Group()
    root.add(glows, stars)
    return { root, stars, glows }
  }, [])
  useEffect(
    () => () => {
      for (const m of [layer.stars, layer.glows]) {
        m.geometry.dispose()
        ;(m.material as MeshBasicMaterial).dispose()
        m.dispose()
      }
    },
    [layer],
  )
  useFrame(() => {
    const w = source.world
    const secs = since(w)
    const lights = secs === null ? [] : lightsAt(secs, w.camera)
    let s = 0
    let g = 0
    const f = w.floorFrame
    const z = f === null ? FIREWORKS.z : f.z - f.depth / 2
    const tip = f === null ? 0 : -CAMERA_PITCH
    for (const l of lights) {
      scratch.position.set(l.x, l.y, z)
      scratch.rotation.set(tip, 0, l.spin)
      scratch.scale.setScalar(l.size)
      scratch.updateMatrix()
      if (l.kind === 'star' && s < LIGHTS_MOST.stars) {
        layer.stars.setMatrixAt(s, scratch.matrix)
        layer.stars.setColorAt(s++, tint.set(colorOf(l.color)))
      } else if (l.kind === 'glow' && g < LIGHTS_MOST.glows) {
        layer.glows.setMatrixAt(g, scratch.matrix)
        layer.glows.setColorAt(g++, tint.set(colorOf(l.color)).multiplyScalar(l.bright))
      }
    }
    for (const [m, n] of [
      [layer.stars, s],
      [layer.glows, g],
    ] as const) {
      m.count = n
      if (n === 0) continue
      m.instanceMatrix.needsUpdate = true
      m.instanceColor!.needsUpdate = true
    }
  })
  return <primitive object={layer.root} />
}
