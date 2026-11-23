/**
 * The dressing room's kids: each player's own Silly Billy kid, dressed as the room dresses them
 * (shell/play.ts partyFrom over the gallery face and what they chose), standing in their column.
 * One canvas over the whole screen draws them all, each over its column's spot (an element the page
 * lays out), so the columns stay plain HTML and the kids cost one canvas. The kids are the room's
 * own players (Players.ts PlayerLayer, posed by animate.ts), made by building a bare room for the
 * party, so they look in the dressing room exactly as they will in the next room. They turn from
 * side to side now and then, so a thing on the back shows, and give a little bounce when what they
 * wear changes.
 */

import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { DirectionalLight, HemisphereLight, OrthographicCamera } from 'three'

import type { Lang } from '../../../profiles/src/lang'
import { KID_HEIGHT } from '../../../silly-billy/src/engine/body'
import type { RoomCode } from '../engine/api'
import { buildRoom, RoomRuntime, type PartyMember } from '../engine/room'
import { HOUSE_SHELL, type Player } from '../engine/world'
import { DRESS } from '../words'
import type { WornModels } from './dress'
import { PlayerLayer, OVER_HEAD } from './Players'
import { LIGHT, shellLight } from './RoomView'

/** A bare room the party stands in, never played: built only so the engine makes its players, as every room does, so it is a whole room by the builder's rules. */
const BARE_ROOM: RoomCode = (r, w) => {
  w.players().forEach((p, i) => p.putAt([-6 + 2 * i, 0, 0]))
  r.wayOut([7, 0, 0])
  // Every room has a step; this one is never shown or done.
  r.steps([{ hint: DRESS.stageStep, at: [0, 0, 0], done: () => false }])
}

/** The room's players for this party, as built. */
export function dressingPlayers(party: readonly PartyMember[]): Player[] {
  const room = buildRoom(BARE_ROOM, { seed: 1, level: 1, kind: 'together', view: 'side', shell: HOUSE_SHELL, party }, new RoomRuntime())
  return room.world.players
}

/** How a kid stands in its spot: metres of spot over its head (the seat's arrow floats there) and under its feet; the widest a kid is, metres; seconds between turns. */
const STAND = { over: OVER_HEAD.arrow + 0.2, under: 0.06, wide: 0.9, turnSecs: 3.2 } as const

interface KidsProps {
  /** The party in seat order, each dressed as they are now. */
  party: readonly PartyMember[]
  /** Each seat's spot on the page, by seat index: the kid stands at its bottom middle, fitted to its height. */
  spots: RefObject<(HTMLElement | null)[]>
  worn: WornModels
  lang: Lang
  /** Inside the canvas (the meter, under ?debug). */
  children: ReactNode
}

function Kids({ party, spots, worn, lang }: Omit<KidsProps, 'children'>) {
  const layer = useMemo(() => new PlayerLayer(worn), [worn])
  useEffect(() => () => layer.dispose(), [layer])
  // The players are made once for the party's faces; what they wear is laid on them every frame from the latest party.
  const bodies = party.map((m) => m.body.skin).join('|')
  const players = useMemo(() => dressingPlayers(party), [bodies])
  const latest = useRef(party)
  latest.current = party
  const wornKey = useRef<string[]>([])
  const camera = useMemo(() => {
    const c = new OrthographicCamera()
    ;(c as OrthographicCamera & { manual: boolean }).manual = true
    c.position.set(0, 0, 20)
    c.near = 0.1
    c.far = 50
    return c
  }, [])
  // Lit as a bright room of the house's own shell, so a kid looks here as in a room.
  const light = useMemo(() => {
    const lit = shellLight(HOUSE_SHELL)
    return { sun: new DirectionalLight('#ffffff', lit.key), fill: new HemisphereLight(lit.sky, lit.ground, lit.fill) }
  }, [])
  const set = useThree((s) => s.set)
  const gl = useThree((s) => s.gl)
  useEffect(() => set({ camera }), [set, camera])
  const clock = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    clock.current += dt
    const t = clock.current
    const box = gl.domElement.getBoundingClientRect()
    const rects = (spots.current ?? []).map((el) => (el === null ? null : el.getBoundingClientRect()))
    // Pixels a metre that fit a kid, head, arrow and all, in each spot; the scene is drawn at the smallest, and a kid in a bigger spot is drawn bigger (Player.size).
    const fits = rects.map((r) => (r === null ? Infinity : Math.min(r.height / (KID_HEIGHT + STAND.over + STAND.under), r.width / STAND.wide)))
    const scale = Math.min(...fits)
    if (!Number.isFinite(scale) || box.width === 0) return
    camera.left = 0
    camera.right = box.width / scale
    camera.top = 0
    camera.bottom = -box.height / scale
    camera.updateProjectionMatrix()
    light.sun.position.set(camera.right / 2 + LIGHT.keyFrom[0], LIGHT.keyFrom[1], LIGHT.keyFrom[2])
    light.sun.target.position.set(camera.right / 2, camera.bottom / 2, 0)
    light.sun.target.updateMatrixWorld()
    players.forEach((p, i) => {
      const r = rects[i]
      const member = latest.current[i]
      if (r === null || r === undefined || member === undefined) return
      p.size = fits[i]! / scale
      p.at = [(r.left + r.width / 2 - box.left) / scale, -(r.bottom - box.top) / scale + STAND.under * p.size, 0]
      p.facing = Math.floor(t / STAND.turnSecs + i * 0.5) % 2 === 0 ? 1 : -1
      p.wear = member.wear
      const key = JSON.stringify(member.wear)
      if (wornKey.current[i] !== undefined && wornKey.current[i] !== key) {
        p.landedAt = t
        p.landSpeed = 8
      }
      wornKey.current[i] = key
    })
    layer.update(players, new Map(), t, dt, lang, 'side')
  })

  return (
    <>
      <primitive object={layer.root} />
      <primitive object={light.sun} />
      <primitive object={light.sun.target} />
      <primitive object={light.fill} />
    </>
  )
}

/** The kids on a canvas laid over the whole dressing room; it takes no pointer, so every tap reaches the columns under it. */
export function DressingKids({ children, ...props }: KidsProps) {
  return (
    <div className="dressing-kids">
      <Canvas dpr={[1, 1.5]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }} style={{ pointerEvents: 'none' }}>
        <Kids {...props} />
        {children}
      </Canvas>
    </div>
  )
}
