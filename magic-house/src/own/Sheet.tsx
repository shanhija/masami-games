/**
 * The starting wardrobe's developer sheet: magic-house/index.html?sheet=own stands kids dressed
 * from gallery faces (own/wardrobe/) in two rows on the scene's stage, in its light and its side
 * camera, the gallery's own faces along the bottom to compare. Query parameters:
 * - show=<hair|extra|curls>: every hair style; every extra on assorted hair; every extra on the
 *   curls (top row) and the bun (bottom row). hair if left out;
 * - cols=<a-b>: only columns a to b (0 to 7), closer;
 * - row=<0|1>: with cols, the row to centre on.
 * The top row faces right, the bottom row left, so each piece is seen from both sides.
 */

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'

import { PARTS, type Avatar } from '../../../profiles/src/avatar'
import { AvatarPicture } from '../../../profiles/src/Avatar'
import type { Lang } from '../../../profiles/src/lang'
import type { Player, Solid, World } from '../engine/world'
import type { SeatIndex } from '../seats/types'
import { fixture } from '../scene/fixtures'
import { RoomStage, type RoomSource, type ShownView } from '../scene/RoomStage'
import { WARDROBE } from './wardrobe/wardrobe'

type Show = 'hair' | 'extra' | 'curls'
const SHOWS: readonly Show[] = ['hair', 'extra', 'curls']

const COLUMNS = 8
const GAP = 1.3
/** Where each row's floor is, its top. */
const FLOORS = [1, 4]

const pick = <T,>(list: readonly T[], i: number): T => list[i % list.length]!

/** The faces of a row: column i of row r. */
function rowFaces(show: Show, r: number): Avatar[] {
  return Array.from({ length: COLUMNS }, (_, i) => {
    const k = i + r * 3
    const base: Avatar = { backdrop: 'sky', skin: pick(PARTS.skin, k), hair: 'short', hairColour: pick(PARTS.hairColour, k), eyes: 'dots', mouth: 'smile', extra: 'none' }
    if (show === 'hair') return { ...base, hair: PARTS.hair[i]! }
    const hair = show === 'curls' ? (r === 0 ? 'curly' : 'bun') : pick(r === 0 ? (['short', 'long', 'bob', 'none'] as const) : (['pigtails', 'bun', 'spiky', 'curly'] as const), i)
    return { ...base, hair, extra: PARTS.extra[i]! }
  })
}

/** The small room made into a stand: a floor for each row, a kid for each face. */
function stand(show: Show, cols: [number, number], row: number | null): World {
  const w = fixture('small').world
  const kid = w.players[0]!
  const ground = w.solids[0]!
  const width = COLUMNS * GAP + 1
  const middle = ((COLUMNS - 1) * GAP) / 2 + 1
  w.solids = FLOORS.map((top, r): Solid => ({ ...ground, id: 1 + r, at: [middle, top - 0.5, 0], shape: { kind: 'box', size: [width, 1, 2] } }))
  w.decor = []
  w.signs = []
  w.wayOut = { at: [-40, 1, 0], open: false }
  w.bounds = { min: [-2, 0, -4], max: [width + 2, 9, 4] }
  w.players = FLOORS.flatMap((top, r) =>
    rowFaces(show, r).map((face, i): Player => {
      const at: [number, number, number] = [1 + i * GAP, top, 0]
      const dressed = WARDROBE.dress(face)
      return { ...kid, id: 100 + r * COLUMNS + i, seat: ((r * COLUMNS + i) % 4) as SeatIndex, at, start: at, jumpFrom: top, on: 1 + r, facing: r === 0 ? 1 : -1, body: { ...kid.body, skin: dressed.skin }, wear: dressed.wear }
    }),
  )
  const across = (cols[1] - cols[0] + 1) * GAP + 0.4
  const x = 1 + ((cols[0] + cols[1]) / 2) * GAP
  if (row === null) w.camera = { x, y: 3.2, width: across, height: (across * 9) / 16 }
  else w.camera = { x, y: FLOORS[row]! + 1, width: across, height: (across * 9) / 16 }
  return w
}

/** Keeps the stand's clock going, for the kids' idle and blink. */
function Clock({ world }: { world: World }) {
  const t = useRef(0)
  useFrame((_, delta) => {
    t.current += Math.min(delta, 0.1)
    world.t = t.current
  }, -500)
  return null
}

export function Sheet({ lang }: { lang: Lang }) {
  const query = new URLSearchParams(location.search)
  const show = (query.get('show') ?? 'hair') as Show
  if (!SHOWS.includes(show)) throw new Error(`the wardrobe's sheet shows ${SHOWS.join(', ')}, not ${show}`)
  const [a, b] = (query.get('cols') ?? `0-${COLUMNS - 1}`).split('-').map(Number)
  const rowAsked = query.get('row')
  const world = useMemo(() => stand(show, [a!, b!], rowAsked === null ? null : Number(rowAsked)), [show, a, b, rowAsked])
  const source = useMemo<RoomSource>(() => ({ world }), [world])
  const shown = useMemo<ShownView>(() => ({ view: null, high: null }), [])
  return (
    <>
      <RoomStage source={source} lang={lang} clearBottom={90} clearTop={0} worn={WARDROBE.recipe} shown={shown} house={false} look={null}>
        <Clock world={world} />
      </RoomStage>
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: 90, display: 'flex', justifyContent: 'center', gap: 12, padding: 8, background: '#2b2b30' }}>
        {rowFaces(show, 0)
          .slice(a, b! + 1)
          .map((face, i) => (
            <AvatarPicture key={i} avatar={face} className="sheet-face" />
          ))}
      </div>
      <style>{'.sheet-face { width: 74px; height: 74px; }'}</style>
    </>
  )
}
