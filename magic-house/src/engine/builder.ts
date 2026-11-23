/**
 * Magic House: the builder `r` and the world `w` as a room's code sees them (engine/api.ts Builder,
 * World), each call doing what its reference line says. The builder checks what it is given and
 * answers a misreading with its MISTAKES sentence, counts the build's one budget of pieces (each
 * handle 1, and each shape of a model 1 more every time the model is placed), puts a body's z on
 * the plane of the side view with a note for the survey (from high up every body keeps its z, and
 * the box, the ramps' ways and the sticks are the view's own), and refuses every call once the room's
 * code has run (MISTAKES.afterBuild). What made code hands the engine to run later (handlers,
 * places, timers, steps, the frame function) is kept by handle id in Made, which the room's hooks
 * (engine/room.ts) call in FRAME_ORDER.
 *
 * Every room is a room of the house (step 7a). The shell the answer gives is checked before the
 * room's code runs (checkShell). The builder's face refuses the house's keys and the look's
 * (BUILDER_REFUSED), each with its own sentence. Everything built must stand inside the room
 * (MISTAKES.outside): each body's box, zone, start, sign and the way out, and decor's foot, with 5 cm
 * to spare; what is built in a mover is held to it where the mover first puts it. From high up the
 * way out is set into the wall nearest it, with a note. Once the room's code has returned, `check`
 * builds the house's own floor, walls and ceiling round it (engine/sim.ts addHouse), so every handle
 * the room built keeps its id.
 */

import { buildRecipe, type Kit } from '../../../silly-billy/src/engine/kit'
import { PUFF_KINDS, type Vec3 } from '../../../silly-billy/src/engine/types'
import type { SeatIndex } from '../seats/types'
import type * as Api from './api'
import {
  BUDGET,
  BUILDER_REFUSED,
  CONTACT_OPTS_REF,
  CONTROLS_REF,
  DECOR_OPTS_REF,
  DEFAULTS,
  LAMP_OPTS_REF,
  LIGHT_RANGE,
  MISTAKES,
  OWN_BUTTON_REF,
  PASS,
  PUFF_OPTS_REF,
  ROOM,
  SHARED_OPTS_REF,
  SIZES,
  SOLID_OPTS_REF,
  STEP_REF,
  SURVEY_NOTES,
  THING_OPTS_REF,
  WORDS_MAX,
  ZONE_OPTS_REF,
  type Paint,
  type Point,
  type Shell,
} from './api'
import { KIT_SHAPES_REF, ROOM_PART_REF, type Model, type RoomKit } from './gift'
import { bool, choice, colour, described, face, fn, frozenPoint, isFace, Mistake, num, options, point, size, text, words, type Refused } from './checks'
import { signWhat, type Handles } from './handles'
import { WALK_WORLD_REF } from '../trial/api'
import {
  addDecor,
  addHouse,
  addLamp,
  addModel,
  addMover,
  addSign,
  addSolid,
  addThing,
  addZone,
  finish as simFinish,
  placeMover,
  pop as simPop,
  puff as simPuff,
  setClock,
  setControls,
  setPushing,
  setRule,
  setSteps,
  setWayOut,
  shake as simShake,
  sound as simSound,
  type Sim,
} from './sim'
import { HOUSE_SOUNDS } from './sounds'
import { playerHeight, playerWidth, roomPoint, solidMiddle, whereOf, type Listens } from './state'
import { PATTERN_ORDER } from '../patterns/patterns'
import type { ButtonShown, HandleId, ModelId, RoomView, SolidShape, Surface, World } from './world'

/** What made code handed the engine to run in play, by handle id (the closures live beside the World, never in it). */
export interface Made {
  readonly taps: Map<HandleId, (at: Point) => void>
  readonly touch: Map<HandleId, (who: Api.Who) => void>
  readonly land: Map<HandleId, (who: Api.Who) => void>
  readonly use: Map<HandleId, (p: Api.Player) => void>
  readonly enter: Map<HandleId, (who: Api.Who) => void>
  readonly stay: Map<HandleId, (who: Api.Who, dt: number) => void>
  readonly leave: Map<HandleId, (who: Api.Who) => void>
  readonly places: Map<HandleId, (t: number) => Api.MoverPlace>
  /** Each seat's own button jobs, or null for an engine job or no button. */
  readonly buttons: { a: Api.OwnButton | null; b: Api.OwnButton | null }[]
  readonly steps: (() => boolean)[]
  /** w.after's callbacks, in the order they were set, each due at a time of World.t. */
  readonly timers: { due: number; fn: () => void }[]
  roomTap: ((at: Point) => void) | null
  tick: Api.Tick | null
  /** Where each handle was built, and its name, for the sentences that name it. */
  readonly builtAt: Map<HandleId, Vec3>
  /** Every name the room gave, to its handle's id: the walkthrough's w.get. */
  readonly names: Map<string, HandleId>
  /** An Error made where the w.finish that ends the room was called, whose stack names the designer's line for a sentence about it; null until then. */
  finishAt: Error | null
}

export function emptyMade(seats: number): Made {
  return {
    taps: new Map(),
    touch: new Map(),
    land: new Map(),
    use: new Map(),
    enter: new Map(),
    stay: new Map(),
    leave: new Map(),
    places: new Map(),
    buttons: Array.from({ length: seats }, () => ({ a: null, b: null })),
    steps: [],
    timers: [],
    roomTap: null,
    tick: null,
    builtAt: new Map(),
    names: new Map(),
    finishAt: null,
  }
}

/** What the builder and the world need of the room they build. */
export interface BuildSite {
  readonly sim: Sim
  readonly handles: Handles
  readonly made: Made
  /** Notes for the survey: what the engine set right by itself (SURVEY_NOTES), and what the kit forgave in a model. */
  readonly notes: string[]
  /** The seats whose start was given (p.putAt while building). */
  readonly starts: Set<SeatIndex>
  readonly turn: () => void
  /** True while the room's code first runs. */
  building(): boolean
  /** A handle as a sentence names it. */
  describe(id: HandleId): string
  /** A mover was placed for the first time: its place is asked again there, since the same t must give the same place. */
  placed(id: HandleId): void
}

/** A lamp with no colour given: warm white. */
export const LAMP_WARM = '#ffe6b8'

const keys = (...refs: object[]) => refs.flatMap((r) => Object.keys(r))
const SHARED = keys(SHARED_OPTS_REF)
const SOLID_KNOWN = keys(SHARED_OPTS_REF, CONTACT_OPTS_REF, SOLID_OPTS_REF)
/** A solid given none of these is plain (World Solid.plain), and the look may dress it: only its place, size, turn, name and hidden are its own. */
const PLAIN_ONLY = SOLID_KNOWN.filter((k) => !['name', 'hidden', 'turn'].includes(k))
const MOVER_KNOWN = keys(SHARED_OPTS_REF, CONTACT_OPTS_REF)
const THING_KNOWN = keys(SHARED_OPTS_REF, CONTACT_OPTS_REF, THING_OPTS_REF)
const DECOR_KNOWN = keys(SHARED_OPTS_REF, DECOR_OPTS_REF)
const ZONE_KNOWN = keys(SHARED_OPTS_REF, ZONE_OPTS_REF)
const LAMP_KNOWN = keys(SHARED_OPTS_REF, LAMP_OPTS_REF)
/** The sticks and the ways a ramp rises, by the view: from high up the stick walks the floor and a ramp may rise away from the viewer or toward them. */
const STICKS: Readonly<Record<RoomView, readonly Api.StickMode[]>> = { side: ['walk', 'fly', 'none'], high: ['floor', 'fly', 'none'] }
const RISES: Readonly<Record<RoomView, readonly Api.Rise[]>> = { side: ['right', 'left'], high: ['right', 'left', 'back', 'front'] }
/** The stick every player starts with, by the view. */
export const FIRST_STICK: Readonly<Record<RoomView, Api.StickMode>> = { side: 'walk', high: 'floor' }

/** The kit's calls a room's model may make (gift.ts RoomKit), with a present's anchor where asked. */
const ROOM_KIT_CALLS = [...Object.keys(KIT_SHAPES_REF), ...Object.keys(ROOM_PART_REF)] as (keyof RoomKit)[]

/** A frozen face over one of Silly Billy's kits, as made code's model functions see it: its shapes and part, and `anchor` for a present. Each call counts one turn. */
export function kitFace(kit: Kit, turn: () => void, anchor: boolean): RoomKit {
  const names: (keyof Kit)[] = anchor ? [...ROOM_KIT_CALLS, 'anchor'] : ROOM_KIT_CALLS
  const calls: Record<string, (...args: unknown[]) => void> = {}
  for (const name of names) calls[name] = (...args) => void (kit[name] as (...a: unknown[]) => void).apply(kit, args)
  return face('kit', calls, turn, null) as unknown as RoomKit
}

/** Which handlers an options object gives, so the sim calls a hook only where something listens. */
function listensOf(o: Readonly<Record<string, unknown>>): Listens {
  const has = (k: string) => typeof o[k] === 'function'
  return { tap: has('tap'), touch: has('touch'), land: has('land'), use: has('use'), enter: has('enter'), stay: has('stay'), leave: has('leave') }
}

/** A button's job as r.controls keeps it until the build ends. */
type Job = 'jump' | 'grab' | { own: Api.OwnButton; icon: ModelId }

/** How far past the room a body may reach, metres, before it is outside (MISTAKES.outside): what a designer's rounding leaves. */
const GRACE = 0.05
const cm = (v: number) => Math.round(v * 100) / 100

/** The builder's keys that are the house's or the look's, refused by name, each with its own sentence (engine/api.ts BUILDER_REFUSED). */
const REFUSED: Refused = {
  keys: [...BUILDER_REFUSED.houseOwns, ...BUILDER_REFUSED.lookOnly],
  sentence: (key) => ((BUILDER_REFUSED.houseOwns as readonly string[]).includes(key) ? MISTAKES.houseOwns(`r.${key}`) : MISTAKES.lookOnly(`r.${key}`)),
}

/**
 * The room's shell as its answer gave it (engine/api.ts Shell), checked as the World keeps it
 * (world.ts World.shell): every colour read by the kit's parseColor into '#rrggbb', every pattern one
 * of the game's set, and the light taken into LIGHT_RANGE.least to 1, with a note when it was outside.
 * The answer's schema already holds it to that shape; this is the engine's own word on it.
 */
export function checkShell(given: Shell, notes: string[]): Shell {
  const call = 'the shell'
  const paint = (part: 'walls' | 'floor' | 'ceiling'): Paint => {
    const p = given[part]
    return { color: colour(call, `${part}.color`, p.color), second: colour(call, `${part}.second`, p.second), pattern: choice(call, `${part}.pattern`, p.pattern, PATTERN_ORDER) }
  }
  const got = num(call, 'light', given.light)
  const light = Math.max(LIGHT_RANGE.least, Math.min(1, got))
  if (light !== got) notes.push(SURVEY_NOTES.lightSet(got, light))
  return { walls: paint('walls'), floor: paint('floor'), ceiling: paint('ceiling'), trim: colour(call, 'trim', given.trim), light }
}

/**
 * From high up a door stands in a wall: the way out's foot moved to the nearest of the back wall and
 * the two side walls (the front is open), and along the wall kept half a door's width from the corners
 * so the whole door is in it. Its height is set once the room is built (footAtWall).
 */
function inWall(bounds: World['bounds'], at: readonly number[]): Point {
  const half = SIZES.doorWidth / 2
  const along = (v: number, lo: number, hi: number) => Math.max(lo + half, Math.min(hi - half, v))
  const back = at[2] - bounds.min[2]
  const left = at[0] - bounds.min[0]
  const right = bounds.max[0] - at[0]
  if (back <= left && back <= right) return [along(at[0], bounds.min[0], bounds.max[0]), at[1], bounds.min[2]]
  return [left <= right ? bounds.min[0] : bounds.max[0], at[1], along(at[2], bounds.min[2], bounds.max[2])]
}

/**
 * The builder for a room being built, which first checks the room's shell (checkShell) and makes it
 * the World's. `check()` runs once the room's code has returned: it holds the room to the calls it
 * must make once (wayOut, steps), its limits (lamps), every player's start (in the room) and
 * controls, and a grab for whatever has use; then it builds the house round the room, and the room
 * is ready for finishBuild.
 */
export function makeBuilder(site: BuildSite): { r: Api.Builder; check: () => void } {
  const { sim, handles, made } = site
  const world = sim.world
  const contest = world.kind === 'contest'
  let pieces = 0
  let wayOuts = 0
  /** From high up, the way out's foot as the room code gave it, when it was not at a wall: moved there once the room is built, onto the floor there. */
  let wayGiven: Point | null = null
  let stepsCalls = 0
  let lamps = 0
  let mover: HandleId | null = null
  const models = new Map<Model, { id: ModelId; shapes: number }>()
  const uses: HandleId[] = []
  const controls: { stick: Api.StickMode; a: Job; b: Job | null }[] = world.players.map(() => ({ stick: FIRST_STICK[world.view], a: 'jump', b: 'grab' }))
  /** Built inside a mover and not yet held to the room: checked once the mover is first placed. */
  const pending: { call: string; id: HandleId }[] = []
  world.shell = checkShell(world.shell, site.notes)

  const need = (call: string) => {
    if (!site.building()) throw new Mistake(MISTAKES.afterBuild(call))
  }
  const piece = (n: number) => {
    pieces += n
    if (pieces > BUDGET.pieces) throw new Mistake(MISTAKES.buildLighter(pieces))
  }
  /** Throws MISTAKES.outside when the box lo..hi reaches past the room's by more than GRACE: in x and y from the side, and in z too from high up. `at` is the point the sentence gives. */
  const within = (call: string, at: readonly number[], lo: readonly number[], hi: readonly number[]) => {
    const b = world.bounds
    const axes = world.view === 'high' ? [0, 1, 2] : [0, 1]
    if (axes.every((k) => lo[k] >= b.min[k] - GRACE && hi[k] <= b.max[k] + GRACE)) return
    throw new Mistake(MISTAKES.outside(call, frozenPoint(at.map(cm))))
  }
  /** Holds a handle built to the room where it stands now: a solid's box, a thing's box from its foot, a zone's box, decor's foot, a sign's middle. */
  const inRoom = (call: string, id: HandleId) => {
    const where = whereOf(sim, id)
    const high = world.view === 'high'
    if (where.kind === 'solid') {
      const o = sim.outlines[where.i]
      const middle = solidMiddle(sim, where.i)
      within(call, middle, high ? [o.minX, o.y0, o.minY] : [o.minX, o.minY, 0], high ? [o.maxX, o.y1, o.maxY] : [o.maxX, o.maxY, 0])
      // From the side a solid stands on z = 0 and its depth only sets how deep it is drawn: no deeper than the floor from the back wall to the open front reaches round that plane.
      const sh = world.solids[where.i].shape
      const half = (sh.kind === 'ball' ? 2 * sh.radius : sh.size[2]) / 2
      if (!high && half > Math.min(-ROOM.side.back, ROOM.side.front) + GRACE) throw new Mistake(MISTAKES.outside(call, frozenPoint(middle.map(cm))))
    } else if (where.kind === 'thing') {
      const th = world.things[where.i]
      within(call, th.at, th.at.map((v, k) => v + th.box.min[k]), th.at.map((v, k) => v + th.box.max[k]))
    } else if (where.kind === 'zone') {
      const z = world.zones[where.i]
      const c = roomPoint(sim, z.at, z.mover)
      within(call, c, c.map((v, k) => v - z.size[k] / 2), c.map((v, k) => v + z.size[k] / 2))
    } else if (where.kind === 'decor' || where.kind === 'sign') {
      const h = where.kind === 'decor' ? world.decor[where.i] : world.signs[where.i]
      const c = roomPoint(sim, h.at, h.mover)
      within(call, c, c, c)
    } else throw new Error(`a ${where.kind} is not held to the room`)
  }
  /** Holds a handle just built to the room: now, or inside a mover once the mover is first placed. */
  const placedIn = (call: string, id: HandleId) => {
    if (mover === null) inRoom(call, id)
    else pending.push({ call, id })
  }
  /** A body's point: from the side, on z = 0, with a note when it was given another z; from high up, as given. */
  const body = (call: string, at: unknown): Vec3 => {
    const v = point(call, 'at', at)
    if (world.view === 'high') return v
    if (v[2] !== 0) site.notes.push(SURVEY_NOTES.zSet(call, v[2]))
    return [v[0], v[1], 0]
  }
  /** A model function, built once by Silly Billy's kit however often it is placed. */
  const model = (call: string, m: unknown): { id: ModelId; shapes: number } => {
    const f = fn<Model>(call, 'model', m)
    const known = models.get(f)
    if (known !== undefined) return known
    const { recipe, notes } = buildRecipe((kit) => {
      f(kitFace(kit, site.turn, false))
      if (kit.shapes.length === 0) throw new Mistake(MISTAKES.noShapes(call))
    }, [])
    for (const note of notes) site.notes.push(`${call}: its model: ${note}`)
    const built = { id: addModel(sim, recipe), shapes: recipe.shapes.length }
    models.set(f, built)
    return built
  }
  /** The options every handle takes: its name (every name different) and whether it starts hidden. */
  const shared = (call: string, o: Readonly<Record<string, unknown>>) => {
    const name = o.name === undefined ? null : text(call, 'name', o.name)
    if (name !== null && made.names.has(name)) throw new Mistake(MISTAKES.sameName(name))
    const hidden = o.hidden === undefined ? false : bool(call, 'hidden', o.hidden)
    if (o.tap !== undefined) fn(call, 'tap', o.tap)
    for (const k of ['touch', 'land', 'use', 'enter', 'stay', 'leave']) if (o[k] !== undefined) fn(call, k, o[k])
    return { name, hidden }
  }
  /** Keeps a new handle's handlers and name. */
  const keep = <T>(id: HandleId, o: Readonly<Record<string, unknown>>, at: Vec3): T => {
    const name = o.name === undefined ? null : (o.name as string)
    if (name !== null) made.names.set(name, id)
    made.builtAt.set(id, at)
    if (o.tap !== undefined) made.taps.set(id, o.tap as (at: Point) => void)
    if (o.touch !== undefined) made.touch.set(id, o.touch as (who: Api.Who) => void)
    if (o.land !== undefined) made.land.set(id, o.land as (who: Api.Who) => void)
    if (o.use !== undefined) {
      made.use.set(id, o.use as (p: Api.Player) => void)
      uses.push(id)
    }
    if (o.enter !== undefined) made.enter.set(id, o.enter as (who: Api.Who) => void)
    if (o.stay !== undefined) made.stay.set(id, o.stay as (who: Api.Who, dt: number) => void)
    if (o.leave !== undefined) made.leave.set(id, o.leave as (who: Api.Who) => void)
    return handles.of(id) as T
  }
  const solid = (call: string, at: Vec3, shape: SolidShape, opts: unknown): Api.Solid => {
    const o = options(call, opts, SOLID_KNOWN)
    const sh = shared(call, o)
    const surface: Surface = {
      color: o.color === undefined ? world.shell.floor.color : colour(call, 'color', o.color),
      ice: o.ice === undefined ? false : bool(call, 'ice', o.ice),
      bounce: o.bounce === undefined ? 0 : Math.max(0, num(call, 'bounce', o.bounce)),
      belt: o.belt === undefined ? [0, 0, 0] : point(call, 'belt', o.belt),
      through: o.through === undefined ? false : bool(call, 'through', o.through),
    }
    const m = o.model === undefined ? null : model(call, o.model)
    const turn = o.turn === undefined ? 0 : num(call, 'turn', o.turn)
    piece(1 + (m === null ? 0 : m.shapes))
    const plain = PLAIN_ONLY.every((k) => o[k] === undefined)
    const id = addSolid(sim, { at, shape, plain, house: false, surface, model: m === null ? null : m.id, turn, mover, name: sh.name, hidden: sh.hidden }, listensOf(o))
    placedIn(call, id)
    return keep(id, o, at)
  }
  const job = (call: string, arg: string, v: unknown): Job => {
    if (v === 'jump' || v === 'grab') return v
    if (typeof v !== 'object' || v === null || isFace(v)) throw new Mistake(MISTAKES.notChoice(call, arg, described(v), ['jump', 'grab', '{ word, icon, press, hold, release }']))
    const o = options(`${call} ${arg}`, v, Object.keys(OWN_BUTTON_REF))
    const word = words(`${call} ${arg} word`, o.word, WORDS_MAX.button)
    const icon = model(`${call} ${arg} icon`, o.icon)
    for (const k of ['press', 'hold', 'release'] as const) if (o[k] !== undefined) fn(call, `${arg}.${k}`, o[k])
    return { own: { word, icon: o.icon as Model, press: o.press as Api.OwnButton['press'], hold: o.hold as Api.OwnButton['hold'], release: o.release as Api.OwnButton['release'] }, icon: icon.id }
  }

  const r: Api.Builder = {
    box: (at: unknown, sz: unknown, opts?: unknown) => {
      need('r.box')
      return solid('r.box', body('r.box', at), { kind: 'box', size: size('r.box', '[w, h, d]', sz) }, opts)
    },
    ramp: (at: unknown, sz: unknown, rises: unknown, opts?: unknown) => {
      need('r.ramp')
      const a = body('r.ramp', at)
      return solid('r.ramp', a, { kind: 'ramp', size: size('r.ramp', '[w, h, d]', sz), rises: choice('r.ramp', 'rises', rises, RISES[world.view]) }, opts)
    },
    ball: (at: unknown, radius: unknown, opts?: unknown) => {
      need('r.ball')
      const a = body('r.ball', at)
      const rad = num('r.ball', 'radius', radius)
      if (rad <= 0) throw new Mistake(MISTAKES.notSize('r.ball', 'radius'))
      return solid('r.ball', a, { kind: 'ball', radius: rad }, opts)
    },
    mover: (build: unknown, place: unknown, opts?: unknown) => {
      need('r.mover')
      if (mover !== null) throw new Mistake(MISTAKES.inMover('r.mover'))
      const b = fn<(r: Api.Builder) => void>('r.mover', 'build', build)
      const p = fn<(t: number) => Api.MoverPlace>('r.mover', 'place', place)
      const o = options('r.mover', opts, MOVER_KNOWN)
      const sh = shared('r.mover', o)
      piece(1)
      const id = addMover(sim, { name: sh.name, hidden: sh.hidden }, listensOf(o))
      made.places.set(id, p)
      mover = id
      try {
        // build gets the builder, as a model gets its kit, so a build written (r) => ... builds with the same r.
        b(faced)
      } finally {
        mover = null
      }
      placeMover(sim, id)
      site.placed(id)
      for (const part of pending) inRoom(part.call, part.id)
      pending.length = 0
      return keep(id, o, [...world.movers[whereOf(sim, id).i].at])
    },
    thing: (at: unknown, m: unknown, opts?: unknown) => {
      need('r.thing')
      if (mover !== null) throw new Mistake(MISTAKES.inMover('r.thing'))
      const a = body('r.thing', at)
      const built = model('r.thing', m)
      const o = options('r.thing', opts, THING_KNOWN)
      const sh = shared('r.thing', o)
      const scale = o.scale === undefined ? 1 : num('r.thing', 'scale', o.scale)
      if (scale <= 0) throw new Mistake(MISTAKES.notSize('r.thing', 'scale'))
      const weight = o.weight === undefined ? DEFAULTS.thingWeight : Math.max(0, num('r.thing', 'weight', o.weight))
      const round = o.round === undefined ? false : bool('r.thing', 'round', o.round)
      piece(1 + built.shapes)
      const id = addThing(sim, { at: a, model: built.id, scale, round, weight, name: sh.name, hidden: sh.hidden }, listensOf(o))
      placedIn('r.thing', id)
      return keep(id, o, a)
    },
    decor: (at: unknown, m: unknown, opts?: unknown) => {
      need('r.decor')
      const a = point('r.decor', 'at', at)
      const built = model('r.decor', m)
      const o = options('r.decor', opts, DECOR_KNOWN)
      const sh = shared('r.decor', o)
      const scale = o.scale === undefined ? 1 : num('r.decor', 'scale', o.scale)
      if (scale <= 0) throw new Mistake(MISTAKES.notSize('r.decor', 'scale'))
      piece(1 + built.shapes)
      const id = addDecor(sim, { at: a, model: built.id, scale, turn: 0, mover, name: sh.name, hidden: sh.hidden }, listensOf(o))
      placedIn('r.decor', id)
      return keep(id, o, a)
    },
    zone: (at: unknown, sz: unknown, opts?: unknown) => {
      need('r.zone')
      const a = body('r.zone', at)
      const s = size('r.zone', '[w, h, d]', sz)
      const o = options('r.zone', opts, ZONE_KNOWN)
      const sh = shared('r.zone', o)
      piece(1)
      const id = addZone(
        sim,
        {
          at: a,
          size: s,
          color: o.color === undefined ? null : colour('r.zone', 'color', o.color),
          wind: o.wind === undefined ? [0, 0, 0] : point('r.zone', 'wind', o.wind),
          pull: o.pull === undefined ? 0 : num('r.zone', 'pull', o.pull),
          gravity: o.gravity === undefined ? 1 : num('r.zone', 'gravity', o.gravity),
          drag: o.drag === undefined ? 0 : Math.max(0, Math.min(1, num('r.zone', 'drag', o.drag))),
          mover,
          name: sh.name,
          hidden: sh.hidden,
        },
        listensOf(o),
      )
      placedIn('r.zone', id)
      return keep(id, o, a)
    },
    lamp: (at: unknown, opts?: unknown) => {
      need('r.lamp')
      const a = point('r.lamp', 'at', at)
      const o = options('r.lamp', opts, LAMP_KNOWN)
      const sh = shared('r.lamp', o)
      piece(1)
      lamps += 1
      const id = addLamp(
        sim,
        {
          at: a,
          color: o.color === undefined ? LAMP_WARM : colour('r.lamp', 'color', o.color),
          power: o.power === undefined ? DEFAULTS.lampPower : Math.max(0, Math.min(1, num('r.lamp', 'power', o.power))),
          reach: o.reach === undefined ? DEFAULTS.lampReach : Math.max(0, num('r.lamp', 'reach', o.reach)),
          mover,
          name: sh.name,
          hidden: sh.hidden,
        },
        listensOf(o),
      )
      return keep(id, o, a)
    },
    sign: (at: unknown, what: unknown, opts?: unknown) => {
      need('r.sign')
      const a = point('r.sign', 'at', at)
      const shown = signWhat('r.sign', what)
      const o = options('r.sign', opts, SHARED)
      const sh = shared('r.sign', o)
      piece(1)
      const id = addSign(sim, { at: a, what: typeof shown === 'object' && 'clock' in shown ? { clock: shown.clock, from: world.t } : shown, mover, name: sh.name, hidden: sh.hidden }, listensOf(o))
      placedIn('r.sign', id)
      return keep(id, o, a)
    },
    wayOut: (at: unknown) => {
      need('r.wayOut')
      wayOuts += 1
      if (wayOuts > 1) throw new Mistake(MISTAKES.wayOut(wayOuts))
      const given = body('r.wayOut', at)
      within('r.wayOut', given, given, given)
      if (world.view === 'side') setWayOut(sim, given)
      else {
        const foot = inWall(world.bounds, given)
        if (foot[0] !== given[0] || foot[2] !== given[2]) wayGiven = frozenPoint(given)
        setWayOut(sim, [foot[0], foot[1], foot[2]])
      }
    },
    controls: (players: unknown, spec: unknown) => {
      need('r.controls')
      if (!Array.isArray(players)) throw new Mistake(MISTAKES.controlsWho())
      const seats = players.map((p) => {
        const id = handles.idOf(p)
        if (id === null || whereOf(sim, id).kind !== 'player') throw new Mistake(MISTAKES.controlsWho())
        return world.players[whereOf(sim, id).i].seat
      })
      const o = options('r.controls', spec, Object.keys(CONTROLS_REF))
      const stick = o.stick === undefined ? null : choice('r.controls', 'stick', o.stick, STICKS[world.view])
      const a = o.a === undefined ? null : job('r.controls', 'a', o.a)
      const b = o.b === undefined ? undefined : o.b === null ? null : job('r.controls', 'b', o.b)
      for (const seat of seats) {
        const c = controls[seat]
        if (stick !== null) c.stick = stick
        if (a !== null) c.a = a
        if (b !== undefined) c.b = b
        // A button's picture is drawn once for each player who has it.
        for (const j of [a, b]) if (j !== null && j !== undefined && typeof j === 'object') piece(world.models[j.icon].shapes.length)
      }
    },
    steps: (list: unknown) => {
      need('r.steps')
      stepsCalls += 1
      if (stepsCalls > 1) throw new Mistake(MISTAKES.calledTwice('r.steps', stepsCalls))
      if (!Array.isArray(list)) throw new Mistake(MISTAKES.notList('r.steps', 'list'))
      if (contest ? list.length !== 1 : list.length < 1 || list.length > BUDGET.steps) throw new Mistake(MISTAKES.stepCount(list.length, contest))
      const shown = list.map((s: unknown, i) => {
        if (typeof s !== 'object' || s === null || isFace(s)) throw new Mistake(MISTAKES.notStep(i + 1))
        const o = options(`r.steps: step ${i + 1}`, s, Object.keys(STEP_REF))
        if (typeof o.done !== 'function' || o.at === undefined) throw new Mistake(MISTAKES.notStep(i + 1))
        const hint = words(`r.steps: step ${i + 1}'s hint`, o.hint, WORDS_MAX.hint)
        const at: Vec3 | HandleId = Array.isArray(o.at) ? point(`r.steps: step ${i + 1}`, 'at', o.at) : handles.idOfKind(`r.steps: step ${i + 1}`, 'at', o.at, ['solid', 'mover', 'thing', 'decor', 'zone', 'lamp', 'sign', 'player'], 'a point or a handle')
        made.steps.push(o.done as () => boolean)
        return { hint, at }
      })
      setSteps(sim, shown)
    },
    rule: (w: unknown) => {
      need('r.rule')
      if (!contest) throw new Mistake(MISTAKES.ruleNotContest())
      setRule(sim, words('r.rule', w, WORDS_MAX.rule))
    },
    clock: (secs: unknown) => {
      need('r.clock')
      const s = num('r.clock', 'secs', secs)
      if (s < PASS.clockMin || s > PASS.clockMax) throw new Mistake(MISTAKES.clockSecs(s))
      setClock(sim, s)
    },
    pushing: (on: unknown) => {
      need('r.pushing')
      setPushing(sim, bool('r.pushing', 'on', on))
    },
    tap: (f: unknown) => {
      need('r.tap')
      made.roomTap = fn<(at: Point) => void>('r.tap', 'fn', f)
    },
  } satisfies Api.Builder

  const check = () => {
    if (wayOuts !== 1) throw new Mistake(MISTAKES.wayOut(wayOuts))
    if (stepsCalls === 0) throw new Mistake(MISTAKES.stepCount(0, contest))
    if (lamps > BUDGET.lamps) throw new Mistake(MISTAKES.tooManyLamps(lamps))
    for (const p of world.players) if (!site.starts.has(p.seat)) throw new Mistake(MISTAKES.noStart(p.seat))
    for (const p of world.players) {
      const hw = playerWidth(p) / 2
      within(`player ${p.seat}'s start`, p.at, [p.at[0] - hw, p.at[1], p.at[2] - hw], [p.at[0] + hw, p.at[1] + playerHeight(p), p.at[2] + hw])
    }
    controls.forEach((c, seat) => {
      if (typeof c.a === 'string' && c.a === c.b) throw new Mistake(MISTAKES.sameJob(c.a))
      if (c.stick !== FIRST_STICK[world.view] && (c.a === 'jump' || c.b === 'jump')) throw new Mistake(MISTAKES.noJump(c.stick))
      const shownOf = (j: Job | null): ButtonShown => (j === null || typeof j === 'string' ? j : { word: j.own.word, icon: j.icon })
      setControls(sim, seat as SeatIndex, c.stick, shownOf(c.a), shownOf(c.b))
      made.buttons[seat] = { a: typeof c.a === 'object' ? c.a.own : null, b: c.b !== null && typeof c.b === 'object' ? c.b.own : null }
    })
    if (uses.length > 0 && !controls.some((c) => c.a === 'grab' || c.b === 'grab')) throw new Mistake(MISTAKES.noGrab(site.describe(uses[0])))
    world.uses = [...uses]
    if (wayGiven !== null) {
      // Moved to a wall, the door stands on the floor there: the top of the highest still solid of the room's under its foot, else the house's floor, never floating where the room code gave it.
      const at = world.wayOut.at
      let floor = 0
      world.solids.forEach((s, i) => {
        const o = sim.outlines[i]
        if (s.mover === null && !s.hidden && at[0] >= o.minX - GRACE && at[0] <= o.maxX + GRACE && at[2] >= o.minY - GRACE && at[2] <= o.maxY + GRACE) floor = Math.max(floor, o.y1)
      })
      setWayOut(sim, [at[0], floor, at[2]])
      site.notes.push(SURVEY_NOTES.wayOutMoved(wayGiven, frozenPoint(world.wayOut.at.map(cm))))
    }
    addHouse(sim)
  }

  const faced = face('builder', r, site.turn, REFUSED)
  return { r: faced, check }
}

/** The world as a room's code sees it (engine/api.ts World): its calls work at any time; puff, sound, shake and pop wait for play. */
export function makeWorld(site: BuildSite): Api.World {
  const { sim, handles, made } = site
  const world = sim.world
  const players = Object.freeze(world.players.map((p) => handles.of(p.id) as Api.Player))
  const w: Api.World = {
    time: () => world.t,
    level: () => world.level,
    players: () => players,
    pointers: () => Object.freeze(world.pointers.map(frozenPoint)),
    stepsDone: () => world.next,
    after: (secs: unknown, f: unknown) => {
      const s = Math.max(0, num('w.after', 'secs', secs))
      made.timers.push({ due: world.t + s, fn: fn<() => void>('w.after', 'fn', f) })
    },
    puff: (at: unknown, kind: unknown, opts?: unknown) => {
      const a = point('w.puff', 'at', at)
      const k = choice('w.puff', 'kind', kind, PUFF_KINDS)
      const o = options('w.puff', opts, Object.keys(PUFF_OPTS_REF))
      const color = o.color === undefined ? null : colour('w.puff', 'color', o.color)
      const count = o.count === undefined ? DEFAULTS.puffCount : Math.max(0, Math.min(DEFAULTS.puffMax, num('w.puff', 'count', o.count)))
      const s = o.size === undefined ? DEFAULTS.puffSize : Math.max(0, num('w.puff', 'size', o.size))
      simPuff(sim, a, k, color, count, s)
    },
    sound: (name: unknown) => simSound(sim, choice('w.sound', 'name', name, HOUSE_SOUNDS)),
    shake: (strength: unknown) => simShake(sim, Math.max(0, Math.min(1, num('w.shake', 'strength', strength)))),
    pop: (at: unknown, what: unknown) => simPop(sim, point('w.pop', 'at', at), typeof what === 'number' ? num('w.pop', 'what', what) : words('w.pop', what, WORDS_MAX.pop)),
    finish: (order?: unknown) => {
      const contest = world.kind === 'contest'
      if (world.finishing === null && world.end === null) made.finishAt = new Error('w.finish')
      if (order === undefined) {
        if (contest) throw new Mistake(MISTAKES.order(true))
        simFinish(sim, null)
        return
      }
      if (!contest) throw new Mistake(MISTAKES.order(false))
      if (!Array.isArray(order) || order.length !== world.players.length) throw new Mistake(MISTAKES.order(true))
      const seats = order.map((p) => {
        const id = handles.idOf(p)
        if (id === null || whereOf(sim, id).kind !== 'player') throw new Mistake(MISTAKES.order(true))
        return world.players[whereOf(sim, id).i].seat
      })
      if (new Set(seats).size !== seats.length) throw new Mistake(MISTAKES.order(true))
      simFinish(sim, seats)
    },
  } satisfies Api.World
  // The walkthrough's own calls on its w are refused by name, so a room that reaches for w.get hears whose call it is.
  const calls = Object.keys(w)
  return face('world', w, site.turn, { keys: Object.keys(WALK_WORLD_REF).filter((k) => !calls.includes(k)), sentence: (key) => MISTAKES.walkCall(key, calls) })
}
