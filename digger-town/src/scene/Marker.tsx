/**
 * What to do and where: a bold ring on the ground that follows the terrain, a big bouncing arrow
 * over the point that grows the longer nothing happens, and a small ring at the machine's goal.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, BufferGeometry, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Shape, type Group, type MeshBasicMaterial } from 'three'

import type { Game } from '../game/game'
import { clamp, damp, TAU } from '../game/math'
import { FORMS, LOTS } from '../game/map'
import { groundY } from '../game/world'
import type { View } from './Camera'

const WHITE = new Color('#fffbe0')
const SEGMENTS = 56
/** How far above the ground a ring floats, so it never sinks into a heap. */
const LIFT = 0.14
/** The top of a form's wet or set floor. */
const FORM_TOP = 0.1

/** A flat ring strip that follows the ground. */
function ringGeometry(): BufferGeometry {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array((SEGMENTS + 1) * 2 * 3), 3))
  const index: number[] = []
  for (let k = 0; k < SEGMENTS; k++) {
    const a = k * 2
    index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  geometry.setIndex(index)
  return geometry
}

/** Writes a ring of radius `r` and width `w` round (x, z), on the ground. */
function placeRing(geometry: BufferGeometry, ground: (x: number, z: number) => number, x: number, z: number, r: number, w: number, lift: number): void {
  const p = geometry.getAttribute('position')
  for (let k = 0; k <= SEGMENTS; k++) {
    const a = (k / SEGMENTS) * TAU
    const c = Math.cos(a)
    const s = Math.sin(a)
    for (let side = 0; side < 2; side++) {
      const rr = r + (side === 0 ? -w : w) / 2
      const px = x + c * rr
      const pz = z + s * rr
      p.setXYZ(k * 2 + side, px, ground(px, pz) + lift, pz)
    }
  }
  p.needsUpdate = true
  geometry.computeBoundingSphere()
}

/** A chunky arrow pointing down, its face toward +z, about 3 m tall with its tip at the origin. */
function arrowGeometry(): ExtrudeGeometry {
  const s = new Shape()
  s.moveTo(0, 0)
  s.lineTo(1.25, 1.5)
  s.lineTo(0.5, 1.5)
  s.lineTo(0.5, 3)
  s.lineTo(-0.5, 3)
  s.lineTo(-0.5, 1.5)
  s.lineTo(-1.25, 1.5)
  s.closePath()
  const g = new ExtrudeGeometry(s, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 2 })
  g.translate(0, 0, -0.3)
  return g
}

/** The idle tiers: the arrow grows after 6 and again after 12 seconds with nothing done. */
const tierOf = (idle: number) => (idle < 6 ? 1 : idle < 12 ? 1.4 : 1.8)

export function Marker({ game, view }: { game: Game; view: View }) {
  const sim = game.sim
  const geo = useMemo(() => ({ band: ringGeometry(), edge: ringGeometry(), goalBand: ringGeometry(), goalEdge: ringGeometry(), arrow: arrowGeometry() }), [])
  useEffect(
    () => () => {
      for (const g of Object.values(geo)) g.dispose()
    },
    [geo],
  )
  const ring = useRef<Group>(null)
  const goal = useRef<Group>(null)
  const arrow = useRef<Group>(null)
  const bandMat = useRef<MeshBasicMaterial>(null)
  const state = useMemo(() => ({ size: 1, pop: 0, x: 0, z: 0, seen: false }), [])
  /** The ground, or the top of a floor's form standing on a dug lot. */
  const ground = (x: number, z: number) => {
    const y = groundY(sim, x, z)
    for (const f of sim.forms) {
      const lot = LOTS[FORMS[f.id].lot]
      if (f.shown && Math.abs(x - lot.x) <= lot.w / 2 && Math.abs(z - lot.z) <= lot.d / 2) return Math.max(y, FORM_TOP)
    }
    return y
  }

  useFrame((threeState, delta) => {
    const dt = Math.min(delta, 0.1)
    const t = threeState.clock.elapsedTime
    const p = game.screen === 'title' || sim.party !== null ? null : view.pointer
    const m = sim.machines[sim.active]
    const wide = clamp(view.dist / 36, 1, 2)

    state.pop += ((p === null ? 0 : 1) - state.pop) * damp(8, dt)
    ring.current!.visible = p !== null && p.ring > 0
    arrow.current!.visible = state.pop > 0.02
    if (p !== null) {
      // The mark glides to a new place instead of jumping.
      if (!state.seen) {
        state.x = p.x
        state.z = p.z
        state.seen = true
      }
      const k = damp(10, dt)
      state.x += (p.x - state.x) * k
      state.z += (p.z - state.z) * k
      state.size += (tierOf(sim.idle) - state.size) * damp(3, dt)
      const pulse = 1 + 0.05 * Math.sin(t * 4)
      if (p.ring > 0) {
        const w = clamp(p.ring * 0.2, 0.75, 1.3) * wide
        placeRing(geo.band, ground, state.x, state.z, p.ring * pulse, w, LIFT)
        placeRing(geo.edge, ground, state.x, state.z, p.ring * pulse, w * 1.6, LIFT - 0.02)
        bandMat.current!.color.set('#ffe14a').lerp(WHITE, 0.5 + 0.5 * Math.sin(t * 4))
      }
      const s = wide * state.size * (0.4 + 0.6 * state.pop)
      const base = Math.max(p.y, ground(state.x, state.z))
      const bounce = Math.abs(Math.sin(t * 4.5)) * 1.1 * s
      arrow.current!.position.set(state.x, base + 0.5 + bounce, state.z)
      arrow.current!.rotation.y = view.yaw + Math.PI
      arrow.current!.scale.setScalar(s)
    } else state.seen = false

    const g = m.goal
    const showGoal = p !== null && g !== null && Math.hypot(g.x - m.x, g.z - m.z) > 2
    goal.current!.visible = showGoal
    if (showGoal) {
      const r = 0.9 * wide
      placeRing(geo.goalBand, ground, g.x, g.z, r * (1 + 0.06 * Math.sin(t * 6)), 0.32 * wide, LIFT)
      placeRing(geo.goalEdge, ground, g.x, g.z, r * (1 + 0.06 * Math.sin(t * 6)), 0.5 * wide, LIFT - 0.02)
    }
  })

  return (
    <>
      <group ref={ring} visible={false}>
        <mesh geometry={geo.edge} renderOrder={4} frustumCulled={false}>
          <meshBasicMaterial color="#2b2140" transparent forceSinglePass opacity={0.55} depthWrite={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
        <mesh geometry={geo.band} renderOrder={5} frustumCulled={false}>
          <meshBasicMaterial ref={bandMat} color="#ffe14a" toneMapped={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-3} />
        </mesh>
      </group>
      <group ref={goal} visible={false}>
        <mesh geometry={geo.goalEdge} renderOrder={4} frustumCulled={false}>
          <meshBasicMaterial color="#2b2140" transparent forceSinglePass opacity={0.5} depthWrite={false} side={DoubleSide} />
        </mesh>
        <mesh geometry={geo.goalBand} renderOrder={5} frustumCulled={false}>
          <meshBasicMaterial color="#ffffff" toneMapped={false} side={DoubleSide} />
        </mesh>
      </group>
      <group ref={arrow} visible={false}>
        <mesh geometry={geo.arrow} frustumCulled={false} renderOrder={6}>
          <meshBasicMaterial color="#ffd21f" toneMapped={false} />
        </mesh>
        <mesh geometry={geo.arrow} scale={1.14} position={[0, -0.2, 0]} frustumCulled={false} renderOrder={5}>
          <meshBasicMaterial color="#2b2140" side={BackSide} />
        </mesh>
      </group>
    </>
  )
}
