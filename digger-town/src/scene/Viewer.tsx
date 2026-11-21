import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer } from '@react-three/drei'
import { useMemo, useRef, type ComponentType } from 'react'
import { BackSide, Color, Float32BufferAttribute, InstancedMesh, Mesh, SphereGeometry, type Group } from 'three'

import { FIRST_PAINT, MACHINE_KINDS, MACHINE_SPECS, newMachine, PAINTS, SPECIES, type Machine, type MachineKind, type Species } from '../game/model'
import { creature } from './creatures'
import { demoPose } from './demo'
import { STUDIO, sunOf } from './look'
import { SOLID_MESH, type MachineProps } from './parts'

/** `?look=<machine>` shows one machine on a turntable; `?animal=<species|all>` shows the animals. `&t=` freezes the pose at that second, `&angle=` freezes the turn (degrees), `&paint=` is a hex colour, `&hat=` a hex colour, `&day=` the time of day, `&stats` prints the draw calls, `&zoom=` moves the camera closer, `&at=x,y,z` looks at that point, `&seated` shows the animals as drivers, `&driver=<species>` picks who drives, `&arm=swing,boom,stick,curl,load` fixes the digger's joints and load. */

type MachineComponent = ComponentType<MachineProps<MachineKind>>
const modules = import.meta.glob<Record<string, unknown>>('./machines/*.tsx', { eager: true })

function queryNumber(q: URLSearchParams, key: string): number | null {
  const raw = q.get(key)
  if (raw === null) return null
  const n = Number(raw)
  if (Number.isNaN(n)) throw new Error(`?${key}= must be a number, got "${raw}"`)
  return n
}

function Stats({ show }: { show: boolean }) {
  const scene = useThree((s) => s.scene)
  const last = useRef(0)
  useFrame((state) => {
    if (!show || state.clock.elapsedTime - last.current < 1) return
    last.current = state.clock.elapsedTime
    let calls = 0
    let triangles = 0
    const each: number[] = []
    scene.traverse((o) => {
      if (!(o instanceof Mesh) || !o.visible) return
      calls++
      const tris = ((o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3) * (o instanceof InstancedMesh ? o.count : 1)
      triangles += tris
      each.push(Math.round(tris))
    })
    ;(window as unknown as { viewerStats: object }).viewerStats = { calls, triangles: Math.round(triangles), each }
    document.title = `calls ${calls} tris ${Math.round(triangles)}`
  })
  return null
}

/** The studio's dome: light sky above, a paler band at the horizon, dark ground below. */
function domeGeometry() {
  const g = new SphereGeometry(1, 24, 16)
  const p = g.attributes.position
  const colours = new Float32Array(p.count * 3)
  const top = new Color(STUDIO.dome.top)
  const mid = new Color(STUDIO.dome.horizon)
  const low = new Color(STUDIO.dome.ground)
  const c = new Color()
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i)
    c.copy(y > 0 ? mid.clone().lerp(top, y) : mid.clone().lerp(low, -y))
    colours.set([c.r, c.g, c.b], i * 3)
  }
  g.setAttribute('color', new Float32BufferAttribute(colours, 3))
  return g
}

function Studio({ day }: { day: number }) {
  const dome = useMemo(domeGeometry, [])
  const sun = useMemo(() => sunOf(day), [day])
  return (
    <>
      <color attach="background" args={[`#${sun.skyHorizon.getHexString()}`]} />
      <hemisphereLight args={[sun.hemiSky, sun.hemiGround, sun.hemiIntensity * 0.6]} />
      <directionalLight
        color={sun.colour}
        intensity={sun.intensity}
        position={[sun.dir[0] * 30, sun.dir[1] * 30, sun.dir[2] * 30]}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={80}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      />
      <Environment frames={1} resolution={256} environmentIntensity={sun.env}>
        <mesh scale={50} geometry={dome}>
          <meshBasicMaterial vertexColors side={BackSide} />
        </mesh>
        {STUDIO.lights.map((l, i) => (
          <Lightformer key={i} form={l.form} intensity={l.intensity} color={l.color} position={l.position as unknown as [number, number, number]} scale={l.scale as unknown as [number, number, number]} rotation={l.rotation as unknown as [number, number, number]} />
        ))}
      </Environment>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[40, 48]} />
        <meshStandardMaterial color="#8f9a80" roughness={1} envMapIntensity={0.15} />
      </mesh>
    </>
  )
}

function MachineStage({ kind, paint, t, angle, arm, driver }: { kind: MachineKind; paint: string; t: number | null; angle: number | null; arm: number[] | null; driver: Species }) {
  const m = useMemo<Machine>(() => {
    const made = newMachine(kind, { x: 0, z: 0, yaw: 0 })
    made.unlocked = true
    return made
  }, [kind])
  const turn = useRef<Group>(null)
  useFrame((state) => {
    demoPose(m, t ?? state.clock.elapsedTime)
    if (arm !== null && m.kind === 'digger') {
      ;[m.swing, m.boom, m.stick, m.curl] = arm
      m.load = { amount: arm[4], kind: 'dirt' }
    }
    turn.current!.rotation.y = angle === null ? state.clock.elapsedTime * 0.4 : (angle * Math.PI) / 180
  })
  const name = kind[0].toUpperCase() + kind.slice(1)
  const exported = Object.entries(modules).find(([path]) => path === `./machines/${name}.tsx`)?.[1]?.[name] as MachineComponent | undefined
  if (!exported) return null
  const Machine = exported
  return (
    <group ref={turn}>
      <Machine m={m} paint={paint} driver={{ species: driver, hat: '#ffd23f' }} />
    </group>
  )
}

function AnimalStage({ species, hat, t, angle, seated }: { species: Species | 'all'; hat: string | null; t: number | null; angle: number | null; seated: boolean }) {
  const list = species === 'all' ? SPECIES : [species]
  const refs = useRef<(Group | null)[]>([])
  const legs = useRef<(Group | null)[]>([])
  useFrame((state) => {
    const time = t ?? state.clock.elapsedTime
    refs.current.forEach((g, i) => {
      if (g) g.rotation.y = angle === null ? state.clock.elapsedTime * 0.5 : (angle * Math.PI) / 180
      const swing = Math.sin(time * 6) * 0.5
      const l = legs.current[i * 2]
      const r = legs.current[i * 2 + 1]
      if (l && r) {
        l.rotation.x = swing
        r.rotation.x = -swing
      }
    })
  })
  return (
    <>
      {list.map((s, i) => {
        const c = creature(s, hat, seated)
        const x = (i - (list.length - 1) / 2) * 1.5
        return (
          <group key={s} position={[x, 0, 0]} ref={(g) => void (refs.current[i] = g)}>
            <mesh geometry={c.body} material={SOLID_MESH} castShadow />
            <group visible={!seated} position={[c.hipX, c.hipY, 0]} ref={(g) => void (legs.current[i * 2] = g)}>
              <mesh geometry={c.legs[0]} material={SOLID_MESH} castShadow />
            </group>
            <group visible={!seated} position={[-c.hipX, c.hipY, 0]} ref={(g) => void (legs.current[i * 2 + 1] = g)}>
              <mesh geometry={c.legs[1]} material={SOLID_MESH} castShadow />
            </group>
          </group>
        )
      })}
    </>
  )
}

/** The model viewer behind `?look=`: one machine or animal on a plain ground under the day's light and the studio reflections. */
export function Viewer() {
  const q = new URLSearchParams(window.location.search)
  const look = q.get('look')
  const animal = q.get('animal')
  const t = queryNumber(q, 't')
  const angle = queryNumber(q, 'angle')
  const day = queryNumber(q, 'day') ?? 0.3
  const paintId = q.get('paint')
  const paint = paintId ? (paintId.startsWith('#') ? paintId : `#${paintId}`) : null
  const hat = q.get('hat')
  const arm = q.get('arm')?.split(',').map(Number) ?? null
  if (arm !== null && (arm.length !== 5 || arm.some(Number.isNaN))) throw new Error('?arm= must be swing,boom,stick,curl,load')
  const driver = (q.get('driver') ?? 'bear') as Species
  if (!(SPECIES as readonly string[]).includes(driver)) throw new Error(`?driver= must be one of ${SPECIES.join(', ')}`)
  const zoom = queryNumber(q, 'zoom') ?? 1
  const at = q.get('at')?.split(',').map(Number) ?? null
  if (at !== null && (at.length !== 3 || at.some(Number.isNaN))) throw new Error('?at= must be x,y,z')

  if (animal !== null && animal !== 'all' && !(SPECIES as readonly string[]).includes(animal)) throw new Error(`?animal= must be one of ${SPECIES.join(', ')} or all`)
  if (animal === null && (look === null || !(MACHINE_KINDS as readonly string[]).includes(look))) throw new Error(`?look= must be one of ${MACHINE_KINDS.join(', ')}`)
  const kind = look as MachineKind | null
  const spec = kind ? MACHINE_SPECS[kind] : null
  const radius = spec ? Math.hypot(spec.length, spec.width, spec.height) / 2 : animal === 'all' ? 4.2 : 1.1
  const dist = ((radius / Math.sin((32 * Math.PI) / 360)) * 1.08) / zoom
  const focus = at ?? [0, spec ? spec.height * 0.42 : 0.6, 0]
  const focusY = focus[1]
  const firstPaint = kind ? PAINTS.find((p) => p.id === FIRST_PAINT[kind])!.colour : '#ffffff'
  if (kind && !Object.keys(modules).includes(`./machines/${kind[0].toUpperCase() + kind.slice(1)}.tsx`)) throw new Error(`No model yet for the ${kind}`)

  return (
    <Canvas
      className="stage"
      shadows
      dpr={1}
      camera={{ fov: 32, near: 0.1, far: 300, position: [focus[0], focusY + dist * 0.42, focus[2] + dist * 0.9] }}
      onCreated={({ camera }) => camera.lookAt(focus[0], focusY, focus[2])}
    >
      <Studio day={day} />
      <Stats show={q.has('stats')} />
      {kind && <MachineStage kind={kind} paint={paint ?? firstPaint} t={t} angle={angle} arm={arm} driver={driver} />}
      {animal !== null && <AnimalStage species={animal as Species | 'all'} hat={hat === null ? null : hat.startsWith('#') ? hat : `#${hat}`} t={t} angle={angle} seated={q.has('seated')} />}
    </Canvas>
  )
}
