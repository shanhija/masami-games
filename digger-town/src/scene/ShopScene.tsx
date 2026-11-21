/** The paint shop's stage: the chosen machine on a turntable in the morning light, in its paint, with the builder at the wheel. */

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Box3, Fog } from 'three'
import type { Group, PerspectiveCamera } from 'three'

import { useGameView } from '../game/game'
import type { Game } from '../game/game'
import { damp } from '../game/math'
import { CARRY, MACHINE_SPECS, PAINTS, newMachine } from '../game/model'
import { FOV } from './frame'
import { childLook, Model } from './MachineLayer'
import { Sky } from './Sky'

/** The morning. */
const SHOP_DAY = 0.12
/** The camera looks down at this slope: the height over the distance, and the share of the distance that runs level. */
const LOOK_DOWN = 0.36
const LOOK_LEVEL = 0.93
/** Frames between measurements of the machine. */
const MEASURE_EVERY = 30

/** Pixels kept clear between the machine and the buttons. */
const BREATHING = 12

/** The part of the screen the buttons leave free, in pixels: between the builder and the paints, under the coins, over the machine shelf (in portrait, between the builder and the paints from above). Null until the shop's buttons are on the page. */
function freeRect(width: number, height: number): { x0: number; y0: number; x1: number; y1: number } | null {
  const rect = (name: string) => document.querySelector(`.shop ${name}`)?.getBoundingClientRect() ?? null
  const left = rect('.shop-left')
  const paints = rect('.swatches')
  const shelf = rect('.shelf')
  if (left === null || paints === null || shelf === null) return null
  if (width < height) return { x0: BREATHING, y0: left.bottom + BREATHING, x1: width - BREATHING, y1: Math.min(paints.top, shelf.top) - BREATHING }
  const coins = rect('.shop-coins')
  if (coins === null) return null
  return { x0: left.right + BREATHING, y0: coins.bottom + BREATHING, x1: paints.left - BREATHING, y1: shelf.top - BREATHING }
}

export function ShopScene({ game, shadow }: { game: Game; shadow: 512 | 1024 }) {
  useGameView(game)
  const kind = game.shopMachine
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const turn = useRef<Group>(null)
  const body = useRef<Group>(null)
  const ticks = useRef(0)
  const extent = useRef({ reach: 1, top: 1 })
  const box = useMemo(() => new Box3(), [])
  const m = useMemo(() => {
    const made = newMachine(kind, { x: 0, z: 0, yaw: 0 })
    made.unlocked = true
    if (made.kind === 'tower') made.up = 1
    if (made.kind === 'digger') Object.assign(made, { boom: CARRY.boom, stick: CARRY.stick, curl: CARRY.curl })
    if (made.kind === 'mobile') {
      made.legs = 1
      made.reach = 9
      made.hookY = 5
    }
    return made
  }, [kind])
  const paint = PAINTS.find((p) => p.id === game.save.paints[kind])
  if (paint === undefined) throw new Error(`no paint ${game.save.paints[kind]}`)
  const platform = Math.max(MACHINE_SPECS[kind].length, MACHINE_SPECS[kind].width) * 0.7 + 0.8

  useEffect(() => () => camera.clearViewOffset(), [camera])

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1)
    turn.current!.rotation.y = state.clock.elapsedTime * 0.5
    m.rollL += dt * 0.6
    m.rollR += dt * 0.6
    const { width, height } = state.size
    // The buttons mount in the same commit; the first frame can come before them.
    const free = freeRect(width, height)
    if (free === null) return
    // The machine as it is now, measured square to the turntable: how far out it reaches from the middle and how high it stands.
    if (ticks.current++ % MEASURE_EVERY === 0) {
      const yaw = turn.current!.rotation.y
      turn.current!.rotation.y = 0
      turn.current!.updateMatrixWorld(true)
      box.setFromObject(body.current!)
      turn.current!.rotation.y = yaw
      extent.current = { reach: Math.hypot(Math.max(-box.min.x, box.max.x), Math.max(-box.min.z, box.max.z)), top: box.max.y }
    }
    const { reach, top } = extent.current
    // What the turning machine fills of the screen, in metres: the disc it sweeps, and its height seen from above at a slant. The camera backs off until that fits the free rectangle, and the view is shifted so it sits in the middle of it.
    const wide = 2 * reach
    const tall = top * LOOK_LEVEL + wide * LOOK_DOWN
    const dist = (Math.max(wide / (free.x1 - free.x0), tall / (free.y1 - free.y0)) * height) / (2 * Math.tan((FOV * Math.PI) / 360))
    const lookY = top / 2
    // The fog starts behind the machine however far the camera has backed off.
    const fog = state.scene.fog
    if (fog instanceof Fog) {
      fog.near = dist * 1.3
      fog.far = dist * 4
    }
    camera.aspect = width / height
    camera.setViewOffset(width, height, width / 2 - (free.x0 + free.x1) / 2, height / 2 - (free.y0 + free.y1) / 2, width, height)
    const k = damp(5, dt)
    camera.position.x += (0 - camera.position.x) * k
    camera.position.y += (lookY + dist * LOOK_DOWN - camera.position.y) * k
    camera.position.z += (dist * LOOK_LEVEL - camera.position.z) * k
    camera.lookAt(0, lookY, 0)
  }, -0.5)

  return (
    <>
      <Sky aim={() => ({ day: SHOP_DAY, targetX: 0, targetZ: 0 })} shadow={shadow} />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[90, 48]} />
        <meshStandardMaterial color="#cfe0b0" roughness={1} envMapIntensity={0.1} />
      </mesh>
      <group ref={turn}>
        <mesh position={[0, 0.12, 0]} receiveShadow castShadow>
          <cylinderGeometry args={[platform, platform + 0.25, 0.24, 48]} />
          <meshStandardMaterial color="#f4efe6" roughness={0.6} envMapIntensity={0.2} />
        </mesh>
        <mesh position={[0, 0.245, 0]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[platform - 0.2, 0.06, 8, 64]} />
          <meshStandardMaterial color="#ffc400" roughness={0.5} envMapIntensity={0.2} />
        </mesh>
        <group ref={body} position={[0, 0.24, 0]}>
          <Model m={m} paint={paint.colour} driver={childLook(game)} />
        </group>
      </group>
    </>
  )
}
