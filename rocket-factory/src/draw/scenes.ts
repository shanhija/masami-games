import { rebuild } from '../game/belts'
import { cell as layCell, put } from '../game/beltKit'
import { PAD, cellOf } from '../game/board'
import { startView } from '../game/camera'
import { NO_INSETS } from '../game/layout'
import { HZ, STEP, inSlot, newBuilding, outSlot, overIn, ticks, type Building, type CardId, type Dir, type Hit, type Kind, type Muncher, type MuncherMode, type State, type Thing } from '../game/model'
import { blankState } from '../game/rules'
import { Renderer } from './frame'
import { drawHand, handPose } from './hand'
import { pen, type SheetEntry } from './look'

/**
 * Whole frames for looking at the renderer (?sheet=scenes, opened with &px=1 so a scene's box
 * is its screen in CSS px): hand-built states drawn by the real Renderer at the iPad's screens,
 * sideways and upright. The states are built here from rules.ts blankState by setting fields
 * (the rules' own steps are not needed), and frame.test.ts draws the same states.
 */

/** The tick the scenes stand at: long enough into a session that every stamp they set is in the past. */
export const AT = 6000

/** A belt cell at (x, y) coming in by side `i` and leaving by `o` (0 east, 1 south, 2 west, 3 north). */
const belt = (s: State, x: number, y: number, i: Dir, o: Dir) => layCell(s, x, y, i, o, -1, -1)
/** A run of belt cells, each [x, y, in side, out side]. */
const run = (s: State, cells: readonly (readonly [number, number, Dir, Dir])[]) => cells.forEach(([x, y, i, o]) => belt(s, x, y, i, o))
/** A building of `kind` at (x, y) with the next id, placed long ago. */
function place(s: State, kind: Kind, x: number, y: number): Building {
  const b = newBuilding(s.nextId++, kind, x, y, AT - ticks(60))
  s.buildings.push(b)
  return b
}
/** A batch in progress: what the band plays and the eye sees move. */
const busy = (b: Building, makes: Thing) => (b.batch = { makes, at: AT - 20, until: AT + 100 })
/** A muncher of burrow `burrow` in `mode` on cell (x, y), stepping toward (tx, ty). */
function muncher(s: State, burrow: number, mode: MuncherMode, x: number, y: number, tx: number, ty: number, cheeks: Thing[]): Muncher {
  const m: Muncher = { id: s.nextMuncher++, burrow, mode, modeAt: AT - ticks(2), cell: cellOf(x, y), toward: cellOf(tx, ty), stepAt: AT - 20, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks, grabAt: AT - 30, idleSince: AT - 30, outAt: AT - ticks(10), scout: false, shotBy: -1 }
  s.munchers.push(m)
  return m
}

/** The path's cards up to and including `last`. */
const foundTo = (last: CardId): CardId[] => {
  const all: CardId[] = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'nose', 'stars', 'snacks', 'more', 'rocket', 'fuel']
  return all.slice(0, all.indexOf(last) + 1)
}

/** The first factory early on: the first digger feeding the oven, its bars riding to the rocket's legs, a few made. */
export function firstFactory(seed: number): State {
  const s = blankState(seed)
  s.tick = AT
  s.sessionAt = 0
  s.playing = true
  s.found = foundTo('digger')
  const d = place(s, 'digger', 7, 2)
  busy(d, 'blueRock')
  busy(s.buildings[1]!, 'blueBar')
  run(s, [
    [7, 4, 3, 1],
    [7, 5, 3, 1],
    [5, 6, 0, 2],
    [4, 6, 0, 2],
  ])
  rebuild(s)
  put(s, outSlot(cellOf(7, 4)), 'blueRock')
  put(s, outSlot(cellOf(5, 6)), 'blueBar')
  put(s, inSlot(cellOf(4, 6)), 'blueBar')
  s.rocket.got[0] = 7
  s.burrows[0]!.hunger = 120
  s.beep = { ...s.beep, pose: 'float' }
  return s
}

/**
 * The factory at its busiest: diggers, ovens, the workshop, both bottle makers, the lab, the pump's
 * long bubble line with two towers on it, a bowl on burrow C's flowers, a hedge line and a
 * stump; burrow A's visit out (one muncher on the gear line, one napping on the orange bottle
 * maker, one walking), B's sleepy face in its door, C's cap slipping and its friend's flag; a
 * heap, the basket, Beep carrying a gear, a gear flying, the rocket half built, and the one
 * next step: the muncher on the belt. Up in the top-left corner a little network with a loop,
 * a fork, a bridge and a dead end.
 */
export function busyFactory(seed: number): State {
  const s = blankState(seed)
  s.tick = AT
  s.playing = true
  s.found = foundTo('more')
  s.patterns = 8
  const [, o1] = s.buildings as [Building, Building]
  const d1 = place(s, 'digger', 7, 2)
  const d2 = place(s, 'digger', 9, 2)
  const o2 = place(s, 'oven', 8, 5)
  const w = place(s, 'workshop', 12, 4)
  const om = place(s, 'orangeMaker', 10, 9)
  const pu = place(s, 'pump', 0, 8)
  const lab = place(s, 'lab', 14, 0)
  const g1 = place(s, 'digger', 16, 2)
  const o3 = place(s, 'oven', 18, 2)
  const gm = place(s, 'greenMaker', 14, 6)
  const t1 = place(s, 'tower', 5, 10)
  place(s, 'tower', 8, 10)
  const bowl = place(s, 'bowl', 17, 4)
  for (const [b, makes] of [
    [d1, 'blueRock'],
    [d2, 'blueRock'],
    [o1, 'blueBar'],
    [o2, 'blueBar'],
    [w, 'gear'],
    [pu, 'bubble'],
    [g1, 'goldRock'],
    [o3, 'goldBar'],
    [gm, 'greenBottle'],
    [lab, 'greenBottle'],
  ] as const)
    busy(b, makes)
  om.stack = ['orangeBottle', 'orangeBottle', 'orangeBottle']
  om.held[5] = 2
  t1.ammo = 3
  t1.stars = 2
  bowl.held[4] = 2
  w.tapAt = AT - 40
  // The lines: blue rocks to the ovens, bars to the pad and the workshop, gears to the orange maker, bubbles along the bottom, gold over the top right, green bottles up to the lab.
  run(s, [
    [7, 4, 3, 1],
    [7, 5, 3, 1],
    [5, 6, 0, 2],
    [4, 6, 0, 2],
    [9, 4, 3, 1],
    [10, 6, 2, 0],
    [11, 6, 2, 3],
    [11, 5, 1, 0],
    [12, 6, 3, 1],
    [12, 7, 3, 1],
    [12, 8, 3, 1],
    [12, 9, 3, 2],
    [1, 10, 3, 0],
    ...[2, 3, 4, 5, 6, 7, 8, 9].map((x) => [x, 10, 2, 0] as const),
    [17, 1, 1, 0],
    [18, 1, 2, 1],
    [18, 4, 3, 2],
    [17, 4, 0, 2],
    [16, 4, 0, 1],
    [16, 5, 3, 1],
    [16, 6, 3, 2],
    [14, 5, 1, 3],
    [14, 4, 1, 3],
    [14, 3, 1, 3],
    [14, 2, 1, 3],
  ])
  // The little network: a loop of four bends; a run east ending on nothing, with a fork north and a belt bridging it south into the pad.
  run(s, [
    [0, 0, 1, 0],
    [1, 0, 2, 1],
    [1, 1, 3, 2],
    [0, 1, 0, 3],
    [0, 2, 2, 0],
    [1, 2, 2, 0],
    [3, 2, 2, 0],
    [4, 2, 2, 0],
    [5, 2, 2, 0],
    [2, 0, 3, 1],
    [2, 1, 3, 1],
    [2, 3, 3, 1],
    [4, 1, 1, 3],
    [4, 0, 1, 3],
  ])
  layCell(s, 2, 2, 2, 0, -1, 1)
  s.belts.fork[cellOf(4, 2)] = 3
  for (let c = 0; c < s.belts.pattern.length; c++) if (s.belts.out[c]! >= 0) s.belts.pattern[c] = c < cellOf(0, 3) ? 1 : c % 3 === 0 ? 2 : 0
  for (const x of [17, 18, 19]) s.hedge[cellOf(x, 8)] = 1
  s.hedge[cellOf(17, 9)] = 2
  s.stumpAt[cellOf(17, 9)] = AT - ticks(12)
  rebuild(s)
  // What rides: two to a cell where a line runs full, one where it runs light.
  const ride = (x: number, y: number, thing: Thing, both: boolean) => {
    put(s, outSlot(cellOf(x, y)), thing)
    if (both) put(s, inSlot(cellOf(x, y)), thing)
  }
  ride(7, 4, 'blueRock', false)
  ride(7, 5, 'blueRock', true)
  ride(5, 6, 'blueBar', false)
  ride(4, 6, 'blueBar', true)
  ride(9, 4, 'blueRock', false)
  ride(10, 6, 'blueBar', true)
  ride(11, 5, 'blueBar', false)
  ride(12, 6, 'gear', true)
  ride(12, 7, 'gear', true)
  for (const x of [2, 3, 4, 6, 7, 9]) ride(x, 10, 'bubble', x % 2 === 0)
  ride(18, 1, 'goldRock', false)
  ride(17, 4, 'goldBar', false)
  ride(16, 5, 'goldBar', true)
  ride(14, 4, 'greenBottle', false)
  ride(14, 2, 'greenBottle', true)
  for (const x of [0, 1, 3, 4, 5]) ride(x, 2, x < 3 ? 'gear' : 'orangeBottle', true)
  put(s, overIn(cellOf(2, 2)), 'bubble')
  ride(2, 1, 'blueBar', false)
  ride(1, 0, 'goldBar', false)
  ride(0, 1, 'blueBar', false)
  // Burrow A's visit: one on the gear line facing upstream, one napping on the orange maker, one walking over.
  s.visit = { burrow: 0, at: AT - ticks(12), kept: 2, tickled: 0, sent: 0, naps: 1, fed: 0 }
  const sitter = muncher(s, 0, 'sit', 12, 8, 12, 8, ['gear', 'gear'])
  const napper = muncher(s, 0, 'nap', 10, 9, 10, 9, [])
  om.napper = napper.id
  muncher(s, 0, 'walk', 10, 4, 10, 5, ['blueBar'])
  s.burrows[1]!.hunger = 950
  s.burrows[2]!.hunger = 600
  s.burrows[2]!.friend = true
  s.burrows[0]!.heap = [0, 0, 0, 2, 1, 3, 1, 0]
  s.basket = [0, 0, 0, 1, 0, 1, 0, 0]
  s.rocket.got = [20, 12, 4, 0]
  s.rocket.fullAt[0] = AT - ticks(200)
  s.lab.got = [40, 10]
  s.beep = { x: 13, y: 6.7, fromX: 2.5, fromY: 5.2, movedAt: AT - 12, pose: 'carry', poseAt: AT - 12, carrying: 'gear', facing: 1 }
  s.flights = [{ thing: 'gear', x0: 12.5, y0: 8.5, x1: 13, y1: 6.6, at: AT - 8, until: AT + 14, arc: 1 }]
  s.hint = { step: { kind: 'muncher', id: sitter.id }, at: AT - ticks(3) }
  return s
}

/**
 * The busy factory with a fourth muncher out (one more of A's, sitting on the bar belt) and
 * the hint's hand coming to tap the one on the gear line: what the frame's speed is measured
 * on (plans/rocket-factory.md, Engineering: a busy factory with four munchers out, under 12 ms
 * at p95 at 4x CPU slowdown in headless Chromium).
 */
export function fourOut(seed: number): State {
  const s = busyFactory(seed)
  muncher(s, 0, 'sit', 11, 6, 11, 6, ['blueBar'])
  s.handAt = AT
  s.handN = 1
  s.lastTouchAt = AT - ticks(20)
  return s
}

/** The busy factory at Good night: dusk falling, the ovens bouncing in their nightcaps, the diggers already tucked in, the visit gone home. */
export function goodNight(seed: number): State {
  const s = busyFactory(seed)
  s.munchers = []
  s.visit = null
  for (const b of s.buildings) {
    b.napper = -1
    if (b.kind === 'digger') {
      b.tucked = true
      b.batch = null
    }
  }
  s.hint = { step: { kind: 'tuck', machine: 'oven' }, at: AT - ticks(2) }
  s.night = { at: AT - ticks(3), kind: 'oven', kindAt: AT - ticks(1), doneAt: -1 }
  s.beep = { ...s.beep, x: 0.5, y: 5.2, fromX: 0.5, fromY: 5.2, pose: 'sleep', poseAt: AT - ticks(2), carrying: null }
  s.flights = []
  return s
}

/** The launch `seconds` after her tap: every part full, a muncher of each burrow watching from the row south of the pad, where munchers.ts seats them. */
export function launching(seed: number, seconds: number): State {
  const s = busyFactory(seed)
  s.found = foundTo('fuel')
  s.rocket.got = [20, 30, 10, 40]
  s.rocket.fullAt = [AT - 900, AT - 600, AT - 400, AT - 200]
  s.munchers = []
  s.visit = null
  for (const b of s.buildings) b.napper = -1
  for (const burrow of [0, 1, 2]) muncher(s, burrow, 'watch', PAD.x + burrow, PAD.y + 3, PAD.x + burrow, PAD.y + 3, [])
  s.hint = null
  s.flights = []
  s.launch = { at: AT - Math.round(seconds * HZ), landsAt: AT - Math.round(seconds * HZ) + ticks(40) }
  return s
}

/** The first factory with a stroke half drawn from the oven round toward the pad (her finger over its end), or with an oven sticker held up over free ground. */
export function drawing(seed: number, what: 'stroke' | 'ghost'): State {
  const s = firstFactory(seed)
  s.found = foundTo('gold')
  if (what === 'stroke') s.drag = { kind: 'stroke', cells: [cellOf(6, 8), cellOf(5, 8), cellOf(4, 8), cellOf(3, 8), cellOf(3, 7)], at: AT - 40 }
  else {
    s.tool = { kind: 'sticker', sticker: 'oven' }
    s.drag = { kind: 'ghost', sticker: 'oven', x: 10.4, y: 4.6, at: AT - 30 }
  }
  return s
}

/** The screens the scenes are drawn at, CSS px: the iPad Air sideways, the iPad, and the Air upright. */
export const SCREENS = [
  [1180, 820],
  [1024, 768],
  [820, 1180],
] as const

/** Each scene: its state, the screens it shows on, the finger over it (CSS px) and what a mouse hovers, whether it loops a few seconds of the picture's own motion (bobs, breaths, the band's beat) or holds its moment (the launch, a drag), whether ?debug's overlay is on, and whether the hint's hand is drawn over it as the HUD carries it. */
const SCENES: { label: string; state: () => State; screens: readonly (readonly [number, number])[]; finger: { x: number; y: number; touch: boolean } | null; hover: Hit | null; moves: boolean; debug: boolean; hand: boolean }[] = [
  { label: 'the first factory', state: () => firstFactory(1), screens: [SCREENS[0]], finger: null, hover: null, moves: true, debug: false, hand: false },
  { label: 'busy', state: () => busyFactory(2), screens: SCREENS, finger: null, hover: null, moves: true, debug: false, hand: false },
  { label: "four munchers out and the hint's hand", state: () => fourOut(12), screens: SCREENS, finger: null, hover: null, moves: true, debug: false, hand: true },
  { label: 'Good night', state: () => goodNight(3), screens: [SCREENS[1]], finger: null, hover: null, moves: true, debug: false, hand: false },
  { label: 'the launch, counting down', state: () => launching(4, 6), screens: [SCREENS[1]], finger: null, hover: null, moves: false, debug: false, hand: false },
  { label: 'the launch, up in the sky', state: () => launching(5, 14), screens: [SCREENS[1]], finger: null, hover: null, moves: false, debug: false, hand: false },
  { label: 'a stroke being drawn', state: () => drawing(7, 'stroke'), screens: [SCREENS[1]], finger: { x: 430, y: 520, touch: true }, hover: null, moves: false, debug: false, hand: false },
  { label: 'an oven held up', state: () => drawing(8, 'ghost'), screens: [SCREENS[1]], finger: { x: 760, y: 420, touch: true }, hover: null, moves: false, debug: false, hand: false },
  { label: 'a mouse over the workshop', state: () => busyFactory(10), screens: [SCREENS[0]], finger: null, hover: { kind: 'building', id: 5 }, moves: true, debug: false, hand: false },
  { label: 'busy, ?debug', state: () => busyFactory(11), screens: [SCREENS[1]], finger: null, hover: null, moves: true, debug: true, hand: false },
]

/** ?sheet=scenes (with &px=1): every scene at each of its screens, as whole frames. */
export const SHEET = (): SheetEntry[] => scenes(() => document.createElement('canvas'))

/** The scenes' sheet entries, the renderer's bakes on canvases from `makeCanvas`. */
export function scenes(makeCanvas: () => HTMLCanvasElement): SheetEntry[] {
  return SCENES.flatMap((scene) =>
    scene.screens.map(([w, h]): SheetEntry => {
      const s = scene.state()
      const renderers = new WeakMap<CanvasRenderingContext2D, Renderer>()
      return {
        label: `${scene.label}, ${w}x${h}`,
        box: { x: 0, y: 0, w, h },
        draw: (ctx, t) => {
          let r = renderers.get(ctx)
          if (r === undefined) {
            r = new Renderer(ctx, makeCanvas, scene.debug)
            renderers.set(ctx, r)
          }
          // The sheet clears its canvas before each paint: the whole frame is drawn again, at its own pixel ratio.
          const dpr = ctx.canvas.width / w
          r.resize(ctx.canvas.width, ctx.canvas.height, dpr)
          // Half a step behind the state's tick, as the stage draws, and on a loop of a few seconds for a scene that moves.
          const at = (AT - 0.5) * STEP + (scene.moves ? t % 4 : 0)
          const view = startView(w, h, dpr, true, NO_INSETS)
          ctx.save()
          r.draw(s, at, view, [], 1 / 60, scene.finger, scene.hover)
          ctx.restore()
          if (!scene.hand) return
          // The hint's hand over the frame, as the HUD's own canvas carries it (Hand.tsx), always somewhere in its tap: its time loops through the gesture while the board's loops on.
          const ht = AT * STEP + 0.3 + (t % 1.4)
          const pose = handPose(s, view, ht, () => null)
          if (pose === null) throw new Error(`${scene.label}: the hand does not show`)
          ctx.save()
          ctx.globalAlpha = pose.alpha
          const k = pose.size * dpr
          ctx.setTransform(k, 0, 0, k, pose.x * dpr, pose.y * dpr)
          pen.ppm = pose.size
          pen.dpr = dpr
          drawHand(ctx, pose, ht)
          ctx.restore()
        },
      }
    }),
  )
}
