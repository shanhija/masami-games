import { useFrame, useThree } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { BufferAttribute, Color, Group, InstancedMesh, MeshBasicMaterial, Object3D, PlaneGeometry } from 'three'

import { mod } from '../game/math'
import { mulberry32 } from '../game/random'
import type { Sim } from '../game/sim'
import { daylight, lookAt, newLook, night, sunPosition } from './daylight'
import { TOON_GRADIENT, palette } from './look'

const scratch = new Object3D()
const ROAD_HALF_W = 2.3
/** The grass sits this far under the road surface (y = 0); anything planted in it is sunk to match. */
const GRASS_TOP = -0.08
/**
 * Paint on the road stands clear of the asphalt, never coplanar with it, and stays out of
 * the shadow pass: a box this thin sampled at the road's own depth would shimmer.
 */
const PAINT_Y = 0.04
const PAINT_H = 0.04

/**
 * Where scrolling things wrap. Each layer repeats every `span` units, centred a little
 * right of the police car, where the camera looks. Deeper layers need wider spans: the
 * camera sees more of the world the further back it looks.
 */
function wrap(worldX: number, policeX: number, span: number) {
  const left = 14 - span / 2
  return mod(worldX - policeX - left, span) + left
}

/** Sky: a plane far behind everything, one colour at the top and another at the horizon, repainted as the day turns. */
const skyGeometry = (() => {
  const g = new PlaneGeometry(600, 260)
  g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position!.count * 3), 3))
  return g
})()

/** A scatter of small stars over the sky plane, faded in with the night. */
const STARS = (() => {
  const rand = mulberry32(19)
  const scratch = new Object3D()
  return Array.from({ length: 90 }, () => {
    scratch.position.set(-140 + rand() * 300, 8 + rand() * 90, -86)
    scratch.scale.setScalar(0.25 + rand() * 0.35)
    scratch.updateMatrix()
    return scratch.matrix.clone()
  })
})()

/**
 * The day turning: the sky's colours, the sun climbing and setting on the left and right,
 * the moon opposite it, stars coming out. The canvas background follows the horizon colour
 * so nothing the sky plane misses shows through in another colour.
 */
function Sky({ sim }: { sim: Sim }) {
  const scene = useThree((s) => s.scene)
  const sun = useRef<Group>(null!)
  const moon = useRef<Group>(null!)
  const rays = useRef<Group>(null!)
  const stars = useRef<InstancedMesh>(null!)
  const starMaterial = useRef<MeshBasicMaterial>(null!)
  const moonShade = useRef<MeshBasicMaterial>(null!)
  const look = useMemo(newLook, [])
  useLayoutEffect(() => {
    STARS.forEach((m, i) => stars.current.setMatrixAt(i, m))
    stars.current.instanceMatrix.needsUpdate = true
  }, [])
  useFrame(() => {
    const t = sim.time
    lookAt(daylight(t), look)
    const colors = skyGeometry.attributes.color as BufferAttribute
    const pos = skyGeometry.attributes.position!
    for (let i = 0; i < pos.count; i++) {
      const c = pos.getY(i) > 0 ? look.skyTop : look.skyBottom
      colors.setXYZ(i, c.r, c.g, c.b)
    }
    colors.needsUpdate = true
    ;(scene.background as Color).copy(look.skyBottom)
    sunPosition(t, sun.current.position)
    moon.current.position.set(-32 - sun.current.position.x, 8 - sun.current.position.y, -80)
    rays.current.rotation.z = t * 0.15
    starMaterial.current.opacity = night(t)
    moonShade.current.color.copy(look.skyTop)
  })
  return (
    <group>
      <mesh geometry={skyGeometry} position={[0, 30, -90]}>
        <meshBasicMaterial vertexColors />
      </mesh>
      <instancedMesh ref={stars} args={[undefined, undefined, STARS.length]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
        <meshBasicMaterial ref={starMaterial} color="#ffffff" transparent opacity={0} />
      </instancedMesh>
      <group ref={sun}>
        <mesh>
          <sphereGeometry args={[4, 24, 18]} />
          <meshBasicMaterial color={palette.sun} />
        </mesh>
        <group ref={rays}>
          {Array.from({ length: 8 }, (_, i) => (
            <mesh key={i} rotation={[0, 0, (i * Math.PI) / 4]} position={[0, 0, -0.5]}>
              <boxGeometry args={[15, 0.9, 0.1]} />
              <meshBasicMaterial color={palette.sun} transparent opacity={0.35} />
            </mesh>
          ))}
        </group>
      </group>
      <group ref={moon}>
        <mesh>
          <sphereGeometry args={[3, 24, 18]} />
          <meshBasicMaterial color={palette.moon} />
        </mesh>
        {/* A disc in the sky's own colour, off to one side, makes the crescent. */}
        <mesh position={[1.4, 0.6, 0.6]}>
          <sphereGeometry args={[2.6, 24, 18]} />
          <meshBasicMaterial ref={moonShade} />
        </mesh>
      </group>
    </group>
  )
}

interface Blob {
  x: number
  y: number
  z: number
  sx: number
  sy: number
  sz: number
  color: number
}

/** An instanced field of ellipsoids: hills, crowns, flowers and clouds are all this. */
function Blobs({ sim, blobs, colors, span, drift, shadow }: { sim: Sim; blobs: Blob[]; colors: readonly string[]; span: number; drift: number; shadow: boolean }) {
  const mesh = useRef<InstancedMesh>(null!)
  const tints = useMemo(() => colors.map((c) => new Color(c)), [colors])
  useLayoutEffect(() => {
    blobs.forEach((b, i) => mesh.current.setColorAt(i, tints[b.color]!))
    mesh.current.instanceColor!.needsUpdate = true
  }, [blobs, tints])
  useFrame(() => {
    const shift = sim.police.x + drift * sim.time
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i]!
      scratch.position.set(wrap(b.x, shift, span), b.y, b.z)
      scratch.scale.set(b.sx, b.sy, b.sz)
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, blobs.length]} frustumCulled={false} castShadow={shadow} receiveShadow={shadow}>
      <sphereGeometry args={[1, 14, 10]} />
      <meshToonMaterial color="#ffffff" gradientMap={TOON_GRADIENT} />
    </instancedMesh>
  )
}

function Boxes({ sim, blobs, color, span, shadow }: { sim: Sim; blobs: Blob[]; color: string; span: number; shadow: boolean }) {
  const mesh = useRef<InstancedMesh>(null!)
  useFrame(() => {
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i]!
      scratch.position.set(wrap(b.x, sim.police.x, span), b.y, b.z)
      scratch.scale.set(b.sx, b.sy, b.sz)
      scratch.updateMatrix()
      mesh.current.setMatrixAt(i, scratch.matrix)
    }
    mesh.current.instanceMatrix.needsUpdate = true
  })
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, blobs.length]} frustumCulled={false} castShadow={shadow}>
      <boxGeometry args={[1, 1, 1]} />
      <meshToonMaterial color={color} gradientMap={TOON_GRADIENT} />
    </instancedMesh>
  )
}

/** Lays out every scrolling layer once, from a fixed seed, so the countryside is the same on every visit. */
function plant() {
  const rand = mulberry32(20260913)
  const spread = (span: number) => rand() * span
  const farHills: Blob[] = Array.from({ length: 16 }, () => {
    const r = 9 + rand() * 12
    return { x: spread(180), y: -r * 0.55, z: -60 - rand() * 12, sx: r * (1.2 + rand() * 0.8), sy: r, sz: r, color: Math.floor(rand() * 2) }
  })
  const midHills: Blob[] = Array.from({ length: 12 }, () => {
    const r = 4 + rand() * 5
    return { x: spread(140), y: -r * 0.5, z: -26 - rand() * 8, sx: r * (1.3 + rand() * 0.9), sy: r, sz: r, color: Math.floor(rand() * 2) }
  })
  const crowns: Blob[] = []
  const trunks: Blob[] = []
  for (let i = 0; i < 30; i++) {
    const r = 0.9 + rand() * 0.9
    const h = 0.8 + rand() * 1.4
    const x = spread(110)
    const z = -4.6 - rand() * 5
    crowns.push({ x, y: h + r * 0.8, z, sx: r, sy: r * 1.1, sz: r, color: Math.floor(rand() * 3) })
    trunks.push({ x, y: GRASS_TOP + h / 2, z, sx: 0.28, sy: h, sz: 0.28, color: 0 })
  }
  for (let i = 0; i < 14; i++) {
    const r = 0.5 + rand() * 0.4
    crowns.push({ x: spread(110), y: GRASS_TOP + r * 0.6, z: -3.2 - rand() * 1.2, sx: r * 1.4, sy: r, sz: r, color: Math.floor(rand() * 3) })
  }
  const flowers: Blob[] = Array.from({ length: 40 }, () => {
    const r = 0.16 + rand() * 0.16
    return { x: spread(80), y: GRASS_TOP + 0.15 + r, z: 3.2 + rand() * 3, sx: r, sy: r, sz: r, color: Math.floor(rand() * 4) }
  })
  const clouds: Blob[] = []
  for (let i = 0; i < 7; i++) {
    const x = spread(200)
    const y = 13 + rand() * 7
    const z = -50 - rand() * 10
    const n = 3 + Math.floor(rand() * 2)
    for (let k = 0; k < n; k++) {
      const r = 2 + rand() * 1.6
      clouds.push({ x: x + (k - (n - 1) / 2) * 2.4, y: y + (k % 2) * 0.8, z, sx: r * 1.3, sy: r, sz: r, color: 0 })
    }
  }
  const dashes: Blob[] = Array.from({ length: 40 }, (_, i) => ({ x: i * 4, y: PAINT_Y, z: 0, sx: 1.8, sy: PAINT_H, sz: 0.24, color: 0 }))
  return { farHills, midHills, crowns, trunks, flowers, clouds, dashes }
}

export function World({ sim }: { sim: Sim }) {
  const layers = useMemo(plant, [])
  return (
    <group>
      <Sky sim={sim} />
      <Blobs sim={sim} blobs={layers.farHills} colors={[palette.hillFar, '#a6dd90']} span={180} drift={0} shadow={false} />
      <Blobs sim={sim} blobs={layers.clouds} colors={[palette.cloud]} span={200} drift={0.6} shadow={false} />
      <Blobs sim={sim} blobs={layers.midHills} colors={[palette.hillMid, '#7fcf6a']} span={140} drift={0} shadow={false} />
      {/* The ground: grass everywhere, the road laid on top of it, its surface a little above the
          grass so the two never share a plane. Both fixed; only what stands on them scrolls. */}
      <mesh position={[30, GRASS_TOP - 0.6, -30]} receiveShadow>
        <boxGeometry args={[400, 1.2, 130]} />
        <meshToonMaterial color={palette.grass} gradientMap={TOON_GRADIENT} />
      </mesh>
      <mesh position={[30, -0.15, 0]} receiveShadow>
        <boxGeometry args={[400, 0.3, ROAD_HALF_W * 2]} />
        <meshToonMaterial color={palette.road} gradientMap={TOON_GRADIENT} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[30, PAINT_Y, side * (ROAD_HALF_W - 0.2)]}>
          <boxGeometry args={[400, PAINT_H, 0.2]} />
          <meshToonMaterial color={palette.roadEdge} gradientMap={TOON_GRADIENT} />
        </mesh>
      ))}
      <Boxes sim={sim} blobs={layers.dashes} color={palette.dash} span={160} shadow={false} />
      <Boxes sim={sim} blobs={layers.trunks} color={palette.treeTrunk} span={110} shadow />
      <Blobs sim={sim} blobs={layers.crowns} colors={palette.treeCrown} span={110} drift={0} shadow />
      <Blobs sim={sim} blobs={layers.flowers} colors={palette.flower} span={80} drift={0} shadow={false} />
    </group>
  )
}
