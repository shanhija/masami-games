import { LOOK_OPTIONS, MACHINE_FOR_MATERIAL, openThemes, optionOpen, roomCost } from './catalog'
import { heapShows } from './flights'
import type { ItemId } from './items'
import { PRESENT_FOR, presentOpenAt, truckDrivingIn } from './layout'
import {
  MACHINES,
  MATERIALS,
  SHAPES,
  since,
  type Good,
  type HouseKind,
  type Look,
  type MachineId,
  type Material,
  type Part,
  type RoadState,
  type RoadThing,
  type RoofStyle,
  type Shape,
  type Shot,
  type State,
  type Theme,
  type Tool,
  type Unlock,
} from './model'

/**
 * What the HUD shows, as one pure function of the state: the HUD component reads only this
 * (and the game's pause), and the game bumps the HUD's version when `sameHud` says it
 * changed. So it holds nothing that moves every frame: the trip strip's truck reads
 * `tripProgress` in its own animation frame, and the hint hand finds its target there too.
 * Everything timed (Go! pulsing, the present's card, the Good night card) is decided here
 * from the sim time, so a paused game holds it all still.
 */

/** Go! pulses after this many seconds at the mirror. */
export const GO_PULSE = 20
/** What comes next bounces in the build tray this long after a nope (MissingNext). */
export const NOPE_FOR = 2
/** The hint hand taps its target twice over this long. */
export const HAND_FOR = 2
/** The Good night card comes up this long after the last light went out: the builder waves from the garage first. */
export const NIGHT_CARD = 2.5
/** The pedal pulses when the truck stands (slower than this, m/s) with nothing in its way and no input for PEDAL_IDLE seconds. */
const STANDING = 0.05
const PEDAL_IDLE = 2

/** The last nope the game heard (a room the picked material cannot pay for): the good missing, at this tick. Events are not state, so the game keeps it. */
export interface Nope {
  good: Good
  at: number
}

/** A wardrobe button: what it puts on, and whether the builder wears it now. */
interface Option {
  patch: Partial<Look>
  on: boolean
}

/**
 * What the build tray points at when the picked shape cannot be paid for: another material
 * that pays for it, else a smaller shape that some material pays for (both bounce in the
 * tray, and a tap picks them), else a machine whose heap shows goods, else the truck (shown
 * in the missing material's bubble, which goes back to the street, where that thing
 * bounces). So the tray sends the child away only when no room at all can be paid for.
 */
type MissingNext = { kind: 'material'; material: Material } | { kind: 'shape'; shape: Shape } | { kind: 'machine'; m: MachineId } | { kind: 'truck' }

/** A question as its cards show it, opened at tick `at` (a new question pops in anew). */
export type AskView = { kind: 'house'; plot: number; at: number } | { kind: 'theme'; themes: Theme[]; current: Theme | null; at: number } | { kind: 'road'; at: number }

/** A stop on the trip strip: the thing at index `i` of the road, `at` of the way along. */
export interface Stop {
  i: number
  at: number
  thing: Extract<RoadThing, { kind: 'boulder' | 'crosser' | 'surprise' | 'present' }>
}

export interface HudView {
  shot: Shot['kind']
  /** The top-left button: the builder's face (opens the mirror) on the street, a house (Home) on the road, a back arrow elsewhere; none while night falls, nor while the truck drives in with the builder at its wheel. */
  back: 'face' | 'home' | 'back' | null
  /** The moon on the street that starts Good night. */
  moon: boolean
  look: Look
  ask: AskView | null
  /** The mirror's wardrobe: the open tab, its open options (at most 8), its colour row, whether the dice can be undone, and whether Go! pulses. */
  wardrobe: { tab: Part; options: Option[]; colours: Option[]; undo: boolean; go: boolean } | null
  /** The road: the stops and the present ahead, whether the truck stands at a boulder (the pedal is the tool), the tool, whether the pedal pulses, and whether the trip is over (the controls go). */
  road: { stops: Stop[]; boulder: boolean; tool: Tool; pulse: boolean; over: boolean } | null
  /** The build tray: the picks, each material's count and whether it pays for the picked shape, each shape and whether the picked material pays for it, the house's roof (its button turns it), the doorbell, and the material that just could not pay with what comes next. */
  build: {
    plot: number
    kind: HouseKind | null
    material: Material
    shape: Shape
    hand: boolean
    goods: { material: Material; n: number; afford: boolean }[]
    shapes: { shape: Shape; afford: boolean }[]
    roof: RoofStyle
    doorbell: boolean
    missing: (Nope & { good: Material; next: MissingNext }) | null
  } | null
  /** The room tray: the room, its theme and the items in it, every open theme, the two paint pots; `pick` while the room has no theme yet (the tray is then one big button that asks which room). */
  room: { plot: number; room: number; theme: Theme | null; pick: boolean; inRoom: ItemId[]; themes: Theme[]; wall: 0 | 1 | 2 | 3; floor: 0 | 1 | 2 | 3 } | null
  /** The present's card: what it held, opened at this tick. */
  present: { got: Unlock | 'gems'; at: number } | null
  /** none; falling: evening, the lights going out; done: the Good night card. */
  night: 'none' | 'falling' | 'done'
  /** The hint hand's showing started at this tick, or -1. */
  hand: number
  sound: boolean
  music: boolean
}

const isMaterial = (g: Good): g is Material => (MATERIALS as readonly Good[]).includes(g)

/** The wardrobe tab's buttons: the open options of the part (the hat's are its colours), and the colour row of hair, shirt and trousers (none for jeans, which are always denim). */
function wardrobe(look: Look, tab: Part, unlocked: readonly Unlock[]) {
  const options = (field: keyof Look): Option[] =>
    (LOOK_OPTIONS[field] as readonly Look[keyof Look][]).filter((v) => optionOpen(unlocked, field, v)).map((v) => ({ patch: { [field]: v }, on: look[field] === v }))
  const colour = tab === 'hair' ? 'hairColor' : tab === 'shirt' ? 'shirtColor' : tab === 'pants' && look.pants !== 'jeans' ? 'pantsColor' : null
  return { options: options(tab), colours: colour === null ? [] : options(colour) }
}

/** What comes next for `missing`, which cannot pay for the picked shape, at sim time t (see MissingNext). */
function missingNext(s: State, missing: Material, t: number): MissingNext {
  const goods = s.keep.goods
  const pays = MATERIALS.filter((m) => m !== missing && goods[m] >= roomCost(s.shape))
  if (pays.length > 0) return { kind: 'material', material: pays.reduce((a, b) => (goods[b] > goods[a] ? b : a)) }
  // The biggest smaller shape the missing one pays for (picked, the next ghost tapped builds it), else the biggest any material pays for (picked, the next nope bounces that material).
  const smaller = [...SHAPES].sort((a, b) => roomCost(b) - roomCost(a)).filter((x) => roomCost(x) < roomCost(s.shape))
  const shape = smaller.find((x) => goods[missing] >= roomCost(x)) ?? smaller.find((x) => MATERIALS.some((m) => goods[m] >= roomCost(x)))
  if (shape !== undefined) return { kind: 'shape', shape }
  // Its own machine first, if its heap has goods to make it from.
  const own = MACHINE_FOR_MATERIAL[missing]
  const m = heapShows(s, own, t) > 0 ? own : MACHINES.find((x) => heapShows(s, x, t) > 0)
  return m === undefined ? { kind: 'truck' } : { kind: 'machine', m }
}

/** How far along its road the truck is, 0 to 1: the trip strip's truck. */
export const tripProgress = (road: RoadState) => Math.min(1, Math.max(0, road.x / road.def.length))

/** Everything the HUD shows for the state at sim time t (seconds), with the game's last nope. */
export function hudView(s: State, t: number, nope: Nope | null): HudView {
  const keep = s.keep
  const shot = s.shot
  const night = s.night === null ? 'none' : s.night.doneAt >= 0 && since(s.night.doneAt, t) >= NIGHT_CARD ? 'done' : 'falling'
  const themes = openThemes(keep.unlocked)
  // The present opens as it lands in the yard, PRESENT_POP after the truck tips: its card waits for that.
  const openAt = presentOpenAt(s)
  const opened = since(openAt, t)
  const ask = s.ask
  const askView: AskView | null =
    ask === null
      ? null
      : ask.kind === 'theme'
        ? { kind: 'theme', themes, current: keep.plots[ask.plot]!.rooms.find((r) => r.id === ask.room)!.theme, at: s.askAt }
        : { ...ask, at: s.askAt }

  let road: HudView['road'] = null
  if (shot.kind === 'road') {
    const r = s.road!
    const stops: Stop[] = []
    r.def.things.forEach((thing, i) => {
      if ((thing.kind === 'boulder' || thing.kind === 'crosser' || thing.kind === 'surprise' || (thing.kind === 'present' && !r.present)) && r.done[i]! < 0 && thing.x > r.x - 1) {
        stops.push({ i, at: Math.min(1, thing.x / r.def.length), thing })
      }
    })
    const stop = r.stop >= 0 ? r.def.things[r.stop]! : null
    const over = r.endAt >= 0
    road = {
      stops,
      boulder: stop !== null && stop.kind === 'boulder',
      tool: keep.look.tool,
      pulse: !over && r.stop < 0 && !r.pedal && Math.abs(r.v) < STANDING && since(s.lastInputAt, t) >= PEDAL_IDLE,
      over,
    }
  }

  let build: HudView['build'] = null
  if (shot.kind === 'plot') {
    const p = keep.plots[shot.plot]!
    build = {
      plot: shot.plot,
      kind: p.kind,
      material: s.material,
      shape: s.shape,
      hand: s.hand,
      goods: MATERIALS.map((material) => ({ material, n: keep.goods[material], afford: keep.goods[material] >= roomCost(s.shape) })),
      shapes: SHAPES.map((shape) => ({ shape, afford: keep.goods[s.material] >= roomCost(shape) })),
      roof: p.roof,
      doorbell: p.rooms.length > 0,
      missing: nope !== null && isMaterial(nope.good) && since(nope.at, t) < NOPE_FOR ? { good: nope.good, at: nope.at, next: missingNext(s, nope.good, t) } : null,
    }
  }

  let room: HudView['room'] = null
  if (shot.kind === 'room') {
    const r = keep.plots[shot.plot]!.rooms.find((x) => x.id === shot.room)!
    room = { plot: shot.plot, room: r.id, theme: r.theme, pick: r.theme === null, inRoom: r.items.filter((it) => it !== null), themes, wall: r.wall, floor: r.floor }
  }

  return {
    shot: shot.kind,
    back: night !== 'none' ? null : shot.kind === 'street' ? (truckDrivingIn(s) ? null : 'face') : shot.kind === 'road' ? 'home' : 'back',
    moon: shot.kind === 'street' && night === 'none',
    look: keep.look,
    ask: askView,
    wardrobe: shot.kind === 'mirror' ? { tab: s.tab, ...wardrobe(keep.look, s.tab, keep.unlocked), undo: s.lookUndo.length > 0, go: since(Math.max(0, s.shotAt), t) >= GO_PULSE } : null,
    road,
    build,
    room,
    present: shot.kind === 'street' && s.presentGot !== null && opened >= 0 && opened < PRESENT_FOR ? { got: s.presentGot, at: openAt } : null,
    night,
    // The hand waits while the camera brings its target into view (handAt still ahead).
    hand: s.hint !== null && since(s.handAt, t) >= 0 && since(s.handAt, t) < HAND_FOR ? s.handAt : -1,
    sound: keep.sound,
    music: keep.music,
  }
}

/** Whether two views show the same: the HUD re-renders only when they do not. Views are plain data built in one order, so their JSON compares them. */
export function sameHud(a: HudView, b: HudView): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
