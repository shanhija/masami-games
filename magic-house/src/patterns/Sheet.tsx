/**
 * The patterns' developer sheet: magic-house/index.html?sheet=patterns stands a kid for each pattern
 * of the set (plain first), on the scene's stage in its light and its side camera, so every pattern
 * is seen on every slot. Each kid wears something in every slot: on the top row, facing right, the
 * sheet's own models, which between them use every kind of shape the kit has (a cone hat on a torus
 * brim, a capsule moustache, a lathe tunic with a box belt, an extruded cape on a cylinder, a tube
 * wand with a ball); on the bottom row, facing left, the starting wardrobe's head pieces and glasses
 * with the same body, back and hand. Hair stays plain (patterns.ts patterned). Along the bottom each
 * pattern's swatch in its kid's colours, with its name. Query parameters:
 * - cols=<a-b>: only columns a to b (0 to 5), closer;
 * - row=<0|1>: with cols, the row to centre on.
 */

import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'

import { inLang, type Lang } from '../../../profiles/src/lang'
import { KID_HEAD_R, KID_HEIGHT, proportions } from '../../../silly-billy/src/engine/body'
import { buildRecipe } from '../../../silly-billy/src/engine/kit'
import type { Recipe, Slot } from '../../../silly-billy/src/engine/types'
import { GIFT_MARKERS } from '../engine/gift'
import type { Player, Solid, World } from '../engine/world'
import { WARDROBE } from '../own/wardrobe/wardrobe'
import type { Wear } from '../saves'
import { fixture } from '../scene/fixtures'
import { RoomStage, type RoomSource, type ShownView } from '../scene/RoomStage'
import type { SeatIndex } from '../seats/types'
import { COLOURS, type ColourName } from '../shell/dressing/colours'
import { PATTERN_NAMES } from '../words'
import { PATTERN_ORDER } from './patterns'
import { PatternSwatch } from './Swatch'

const MAIN = { color: GIFT_MARKERS.main }
const SECOND = { color: GIFT_MARKERS.second }
const KID = proportions({ body: 'kid', height: KID_HEIGHT, build: 1 })
const R = KID_HEAD_R

/** The sheet's own model for each slot but hair, in the marker colours, built round the model kid as a present is (engine/gift.ts SLOT_REF). */
const MODELS: Readonly<Record<Exclude<Slot, 'hair'>, Recipe>> = {
  head: buildRecipe((m) => {
    m.torus(R * 1.05, 0.05, { ...SECOND, at: [0, R * 0.55, 0], rot: [Math.PI / 2, 0, 0] })
    m.cone(R * 1.0, 0.42, { ...MAIN, at: [0, R * 0.55 + 0.21, 0] })
    return {}
  }, ['head']).recipe,
  face: buildRecipe((m) => {
    m.capsule(0.03, 0.16, { ...MAIN, at: [0, -R * 0.42, R * 0.98], rot: [0, 0, Math.PI / 2] })
    return {}
  }, ['face']).recipe,
  body: buildRecipe((m) => {
    const w = KID.torsoW / 2 + 0.03
    m.lathe([[w * 1.25, KID.hipY - 0.16], [w * 1.05, KID.hipY], [w, KID.shoulderY - 0.02], [w * 0.55, KID.neckY]], MAIN)
    m.box(KID.torsoW + 0.1, 0.06, KID.torsoD + 0.1, { ...SECOND, at: [0, KID.hipY + 0.02, 0] })
    return {}
  }, ['body']).recipe,
  back: buildRecipe((m) => {
    m.extrude([[-0.16, 0], [0.16, 0], [0.24, -0.5], [-0.24, -0.5]], 0.03, { ...MAIN, at: [0, 0.02, -0.1] })
    m.cylinder(0.04, 0.04, 0.34, { ...SECOND, at: [0, 0.02, -0.09], rot: [0, 0, Math.PI / 2] })
    return {}
  }, ['back']).recipe,
  hand: buildRecipe((m) => {
    m.tube([[0, -0.15, 0], [0.02, 0.05, 0], [0, 0.25, 0]], 0.035, MAIN)
    m.sphere(0.08, { ...SECOND, at: [0, 0.3, 0] })
    m.anchor('hand', [0, -0.08, 0])
    return {}
  }, ['hand']).recipe,
}
const MODEL_IDS: Readonly<Record<string, Recipe>> = Object.fromEntries(Object.entries(MODELS).map(([slot, r]) => [`sheet:${slot}`, r]))
const worn = (id: string): Recipe | null => MODEL_IDS[id] ?? WARDROBE.recipe(id)

/** Each column's colours, main and second, from the house's set. */
const PAIRS: readonly [ColourName, ColourName][] = [
  ['sky', 'blue'],
  ['red', 'white'],
  ['yellow', 'purple'],
  ['lime', 'green'],
  ['orange', 'black'],
  ['rose', 'yellow'],
]
/** The bottom row's head piece for each column, from the starting wardrobe. */
const HEADS = ['cap', 'crown', 'bow', 'cat-ears', 'bunny-ears', 'flower'] as const

const GAP = 1.5
/** Where each row's floor is, its top. */
const FLOORS = [4, 1]

/** What a column's kid on a row wears: every slot in its pattern and colours, hair as the face gives it. */
function wearOf(column: number, row: number): Wear {
  const [main, second] = PAIRS[column % PAIRS.length]!
  const w = (id: string) => ({ id, main: COLOURS[main], second: COLOURS[second], pattern: PATTERN_ORDER[column]! })
  return {
    head: w(row === 0 ? 'sheet:head' : `own:${HEADS[column % HEADS.length]}`),
    face: w(row === 0 ? 'sheet:face' : 'own:glasses'),
    body: w('sheet:body'),
    back: w('sheet:back'),
    hand: w('sheet:hand'),
  }
}

/** The small room made into a stand: a floor for each row, a kid for each pattern. */
function stand(cols: [number, number], row: number | null): World {
  const w = fixture('small').world
  const kid = w.players[0]!
  const ground = w.solids[0]!
  const n = PATTERN_ORDER.length
  const width = n * GAP + 1
  const middle = ((n - 1) * GAP) / 2 + 1
  w.solids = FLOORS.map((top, r): Solid => ({ ...ground, id: 1 + r, at: [middle, top - 0.5, 0], shape: { kind: 'box', size: [width, 1, 2] } }))
  w.decor = []
  w.signs = []
  w.wayOut = { at: [-40, 1, 0], open: false }
  w.bounds = { min: [-2, 0, -4], max: [width + 2, 9, 4] }
  w.players = FLOORS.flatMap((top, r) =>
    PATTERN_ORDER.map((_, i): Player => {
      const at: [number, number, number] = [1 + i * GAP, top, 0]
      const face = WARDROBE.dress({ backdrop: 'sky', skin: (['peach', 'caramel', 'milk', 'cocoa'] as const)[(i + r) % 4]!, hair: r === 0 ? 'short' : 'bob', hairColour: 'brown', eyes: 'dots', mouth: 'smile', extra: 'none' })
      return { ...kid, id: 100 + r * n + i, seat: ((r * n + i) % 4) as SeatIndex, at, start: at, jumpFrom: top, on: 1 + r, facing: r === 0 ? 1 : -1, body: { ...kid.body, skin: face.skin }, wear: { ...face.wear, ...wearOf(i, r) } }
    }),
  )
  const across = (cols[1] - cols[0] + 1) * GAP + 0.4
  const x = 1 + ((cols[0] + cols[1]) / 2) * GAP
  w.camera = { x, y: row === null ? 3.6 : FLOORS[row]! + 0.9, width: across, height: (across * 9) / 16 }
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

const BAND = 96

export function Sheet({ lang }: { lang: Lang }) {
  const query = new URLSearchParams(location.search)
  const [a, b] = (query.get('cols') ?? `0-${PATTERN_ORDER.length - 1}`).split('-').map(Number)
  const rowAsked = query.get('row')
  const world = useMemo(() => stand([a!, b!], rowAsked === null ? null : Number(rowAsked)), [a, b, rowAsked])
  const source = useMemo<RoomSource>(() => ({ world }), [world])
  const shown = useMemo<ShownView>(() => ({ view: null, high: null }), [])
  return (
    <>
      <RoomStage source={source} lang={lang} clearBottom={BAND} clearTop={0} worn={worn} shown={shown} house={false} look={null}>
        <Clock world={world} />
      </RoomStage>
      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, height: BAND, display: 'flex', justifyContent: 'space-around', padding: 8, background: '#2b2b30' }}>
        {PATTERN_ORDER.slice(a, b! + 1).map((name, i) => {
          const [main, second] = PAIRS[(a! + i) % PAIRS.length]!
          return (
            <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#fff', font: '600 14px sans-serif' }}>
              <PatternSwatch className="sheet-swatch" name={name} main={COLOURS[main]} second={COLOURS[second]} />
              {inLang(PATTERN_NAMES[name], lang)}
            </div>
          )
        })}
      </div>
      <style>{'.sheet-swatch { width: 56px; height: 56px; border-radius: 50%; border: 3px solid #111; }'}</style>
    </>
  )
}
