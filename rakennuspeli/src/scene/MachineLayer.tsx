/**
 * Every machine, always mounted: one group each, placed every frame from the sim's numbers by
 * refs, hidden until it has come. React only re-renders a machine when its paint or its driver
 * changes (the active machine, a hop, a friend at the wheel, a new paint).
 */

import { memo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'

import type { Game } from '../game/game'
import { seatPoint } from '../game/machines'
import { TAU } from '../game/math'
import { FRIEND_OF, MACHINE_KINDS, PAINTS, RANKS } from '../game/model'
import type { Machine, MachineKind, Species } from '../game/model'
import { Driver } from './Driver'
import { Digger } from './machines/Digger'
import { Dozer } from './machines/Dozer'
import { Dumper } from './machines/Dumper'
import { Forklift } from './machines/Forklift'
import { Mixer } from './machines/Mixer'
import { Mobile, mobileShape } from './machines/Mobile'
import { Roller } from './machines/Roller'
import { Semi } from './machines/Semi'
import { Tower, towerShape } from './machines/Tower'
import { useFade } from './fade'
import type { View } from './Camera'

/** A friend at the wheel wears a plain white hard hat. */
const FRIEND_HAT = '#ffffff'

export interface DriverProps {
  species: Species
  hat: string
}

/** The child's builder: their animal under the hard hat they picked, or the golden one after the story. */
export function childLook(game: Game): DriverProps {
  const save = game.save
  return { species: save.driver.species, hat: save.golden ? RANKS[RANKS.length - 1].hat : save.driver.hat }
}

interface Look {
  paint: string
  driver: DriverProps | null
}

/** What each machine wears and who sits in it now. */
function looksOf(game: Game): Record<MachineKind, Look> {
  const s = game.sim
  const child = childLook(game)
  const inCab = game.cameraMode === 'cab' && s.mode === 'pro'
  const looks = {} as Record<MachineKind, Look>
  for (const kind of MACHINE_KINDS) {
    const paint = PAINTS.find((p) => p.id === game.save.paints[kind])
    if (paint === undefined) throw new Error(`no paint ${game.save.paints[kind]}`)
    const m = s.machines[kind]
    let driver: DriverProps | null = null
    if (m.friend) driver = { species: FRIEND_OF[kind], hat: FRIEND_HAT }
    else if (kind === s.active && s.hop === null && !inCab) driver = child
    looks[kind] = { paint: paint.colour, driver }
  }
  return looks
}

const keyOf = (game: Game, looks: Record<MachineKind, Look>) =>
  MACHINE_KINDS.map((k) => `${looks[k].paint}${looks[k].driver === null ? '-' : looks[k].driver.species + looks[k].driver.hat}`).join('|') + (game.sim.hop === null ? '' : `|hop ${game.sim.hop.from} ${game.sim.hop.to}`)

/** A machine's model by its kind. */
export function Model({ m, paint, driver }: { m: Machine; paint: string; driver: DriverProps | null }) {
  switch (m.kind) {
    case 'digger':
      return <Digger m={m} paint={paint} driver={driver} />
    case 'dumper':
      return <Dumper m={m} paint={paint} driver={driver} />
    case 'dozer':
      return <Dozer m={m} paint={paint} driver={driver} />
    case 'roller':
      return <Roller m={m} paint={paint} driver={driver} />
    case 'mixer':
      return <Mixer m={m} paint={paint} driver={driver} />
    case 'forklift':
      return <Forklift m={m} paint={paint} driver={driver} />
    case 'tower':
      return <Tower m={m} paint={paint} driver={driver} />
    case 'semi':
      return <Semi m={m} paint={paint} driver={driver} />
    case 'mobile':
      return <Mobile m={m} paint={paint} driver={driver} />
  }
}

/** Fades a crane while it hides what the child must see, unless the child is driving it outside a party. */
function FadeCrane({ game, view, group, kind }: { game: Game; view: View; group: RefObject<Group | null>; kind: 'tower' | 'mobile' }) {
  const tower = game.sim.machines.tower
  const mobile = game.sim.machines.mobile
  useFade(group, view, () => {
    if (game.sim.active === kind && game.sim.party === null) return null
    if (kind === 'tower') return !tower.unlocked || tower.up <= 0 ? null : towerShape(tower)
    return !mobile.unlocked ? null : mobileShape(mobile)
  })
  return null
}

/** One machine: placed by its sim numbers, yaw first, then pitch (nose up above 0) and roll (left side up above 0). */
const Placed = memo(
  function Placed({ game, view, kind, paint, driver }: { game: Game; view: View; kind: MachineKind; paint: string; driver: DriverProps | null }) {
    const group = useRef<Group>(null)
    const m = game.sim.machines[kind]
    useFrame(() => {
      const g = group.current!
      g.visible = m.unlocked
      g.position.set(m.x, m.y, m.z)
      g.rotation.set(-m.pitch, m.yaw, m.roll, 'YXZ')
    })
    return (
      <group ref={group} visible={false}>
        <Model m={m} paint={paint} driver={driver} />
        {(kind === 'tower' || kind === 'mobile') && <FadeCrane game={game} view={view} group={group} kind={kind} />}
      </group>
    )
  },
  (a, b) => a.game === b.game && a.kind === b.kind && a.paint === b.paint && a.driver?.species === b.driver?.species && a.driver?.hat === b.driver?.hat && (a.driver === null) === (b.driver === null),
)

/** The builder in flight from one cab to the next: a hop in a parabola with a spin. */
function HopDriver({ game, look }: { game: Game; look: DriverProps }) {
  const group = useRef<Group>(null)
  useFrame(() => {
    const hop = game.sim.hop
    const g = group.current!
    g.visible = hop !== null
    if (hop === null) return
    const a = seatPoint(game.sim.machines[hop.from])
    const b = seatPoint(game.sim.machines[hop.to])
    const u = hop.t
    const arc = 3 + Math.hypot(b.x - a.x, b.z - a.z) * 0.18
    g.position.set(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u + 4 * u * (1 - u) * arc, a.z + (b.z - a.z) * u)
    g.rotation.set(0, u * TAU * 2, Math.sin(u * Math.PI) * 0.6)
    g.scale.setScalar(1 + 0.25 * Math.sin(u * Math.PI))
  })
  return (
    <group ref={group} visible={false}>
      <Driver species={look.species} hat={look.hat} />
    </group>
  )
}

export function MachineLayer({ game, view }: { game: Game; view: View }) {
  const [key, setKey] = useState(() => keyOf(game, looksOf(game)))
  const looks = looksOf(game)
  useFrame(() => {
    const next = keyOf(game, looksOf(game))
    if (next !== key) setKey(next)
  })
  return (
    <>
      {MACHINE_KINDS.map((kind) => (
        <Placed key={kind} game={game} view={view} kind={kind} paint={looks[kind].paint} driver={looks[kind].driver} />
      ))}
      {game.sim.hop !== null && <HopDriver game={game} look={childLook(game)} />}
    </>
  )
}

