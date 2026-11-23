/**
 * Magic House: the look's builder (step 7a, "every room a room"). It runs a room's look (engine/look.ts
 * LookCode) once on the room as built at a level, with the look's builder `r` and the room as built
 * `room`, and gives back what the look built as plain data beside the World (LookBuilt), never in it.
 *
 * So by its very shape a look cannot change the play:
 * - `room` is frozen faces over the World (RoomSeen, SeenSolid, SeenThing, SeenZone) whose calls only
 *   read; nothing here writes to the World, the sim or the room, and the World's random stream never
 *   moves (the look's Math is its own: trial/compile.ts LookRuntime, the room's seed plus
 *   MATH.lookSeedOffset);
 * - `r` builds only what the scene draws: the wallpaper's motif, dressings of plain solids, decor,
 *   props that answer by declared rules, small lights and lamps; the room code's play calls are refused
 *   keys (LOOK_MISTAKES.notLooks) and the house's its own (MISTAKES.houseOwns);
 * - the look has no `w`, no handlers and no frame function: it runs once and keeps nothing.
 *
 * Counted, never timed: the look's code has LOOK_BUDGET.buildTurns loop turns and calls (each call of
 * `r` and `room` and every kit call counts one), and its pieces LOOK_BUDGET.pieces (each call 1, each
 * shape of a model 1 each time it is placed, the wallpaper's model each time the house repeats it).
 * Past either the build stops with its sentence (LookBuildError), as it does on a misreading or a throw.
 *
 * What breaks where a piece may stand (LOOK_PLACE) is left out with a note (LOOK_NOTES), never a
 * failure on its own: from the side a piece stands behind the play or low in front of it, and its
 * outline seen from the fixed eye (SIDE_EYE: the camera never moves, so the outline on the plane z = 0
 * is the same on every screen) must not cover a start, a step's place, the way out or a floor's top in
 * front of which it stands; from high up, where the eye moves with the screen's shape, by its footprint
 * on the floor: tall pieces stand by the walls and cover none of those, nor hide them behind them (LOOK_PLACE.shadow). Everywhere, a piece must not
 * stand inside a solid of the play. A dressing that does not fit its solid is left out, the solid drawn
 * plain. The check (trial/lookCheck.ts) then holds the look to its limits and least (lookFaults).
 *
 * Pure plain numbers with the engine's own Math: the trial's worker imports this, so nothing under it
 * reaches a .tsx file or the scene.
 */

import { buildRecipe } from '../../../silly-billy/src/engine/kit'
import { describeError, GuardError } from '../../../silly-billy/src/engine/sandbox'
import { PUFF_KINDS, type Recipe, type Vec3 } from '../../../silly-billy/src/engine/types'
import type { LookRuntime } from '../trial/compile'
import { BUDGET, BUILDER_REF, BUILDER_REFUSED, DEFAULTS, MISTAKES, ROOM, SIZES, type Point } from './api'
import { kitFace, LAMP_WARM } from './builder'
import { SIDE_FRAME, SIDE_LENS } from './camera'
import { bool, choice, colour, described, explain, face, FROZEN_JS, frozenPoint, fn, Mistake, num, options, point, type Refused } from './checks'
import type { Model } from './gift'
import {
  dressable,
  DRESS_FIT,
  IDLES,
  LIGHTS,
  LOOK_BUDGET,
  LOOK_BUILDER_REF,
  LOOK_DECOR_OPTS_REF,
  LOOK_LEAST,
  LOOK_MISTAKES,
  LOOK_NOTES,
  LOOK_PLACE,
  LOOK_WHY,
  PROP_OPTS_REF,
  REACTS,
  type LookBuilder,
  type LookBuilt,
  type LookCode,
  type RoomSeen,
  type SeenSolid,
  type SeenThing,
  type SeenZone,
  WALLPAPER_COPIES,
} from './look'
import { cos, sin } from './math'
import type { Room } from './room'
import { HOUSE_SOUNDS } from './sounds'
import { playerHeight, playerWidth, roomPoint, solidMiddle } from './state'
import type { ModelId, RoomView, Solid } from './world'

// ------------------------------------------------------------------------------ the numbers it lays out by

/**
 * The side camera's eye, metres: scene/sideCamera.ts sideView puts it SIDE_LENS.back frame widths in
 * front of the plane z = 0 and SIDE_LENS.eyeUp frame heights above the frame's middle, and the frame
 * is the constant SIDE_FRAME, so the eye never moves.
 */
export const SIDE_EYE: Vec3 = [SIDE_FRAME.x, SIDE_FRAME.y + SIDE_LENS.eyeUp * SIDE_FRAME.height, SIDE_LENS.back * SIDE_FRAME.width]

/** How far in front of the back wall the way out's door is drawn, from the side, metres (the door is set into the wall behind its foot). */
const DOOR_INSET = 0.05

/** How far past the room a piece may reach before it is outside it, metres: what a designer's rounding leaves (as the builder's MISTAKES.outside). */
const GRACE = 0.05
/** How far two boxes must overlap before a piece stands inside a solid or covers a place, metres: a piece standing on a ledge touches it. */
const EPS = 0.01

const cm = (v: number) => Math.round(v * 100) / 100
const cmPoint = (v: readonly number[]): Point => frozenPoint(v.map(cm))

/** A box in the room, metres. */
export interface Box {
  readonly min: Vec3
  readonly max: Vec3
}

/** A look that misread the reference, threw, or went past its budget: its sentence says what to mend. */
export class LookBuildError extends Error {
  constructor(readonly sentence: string) {
    super(sentence)
    this.name = 'LookBuildError'
  }
}

// ------------------------------------------------------------------------------ the room as the look reads it

/** The size a solid was built at: a box's or a ramp's [w, h, d], a ball's its diameter each way. */
function solidSize(s: Solid): Vec3 {
  return s.shape.kind === 'ball' ? [2 * s.shape.radius, 2 * s.shape.radius, 2 * s.shape.radius] : s.shape.size
}

/** Why a solid may not be dressed, or null when it may (engine/look.ts dressable, in words). */
function notDressableWhy(s: Solid): string | null {
  if (dressable(s)) return null
  if (s.shape.kind === 'ball') return LOOK_WHY.ball
  if (s.hidden) return LOOK_WHY.hidden
  if (s.glow !== null) return LOOK_WHY.glows
  return LOOK_WHY.notPlain
}

/**
 * The room as built, as the look reads it: frozen faces whose calls read the World and count a turn
 * each; every point and list they give back is frozen. `solidOf` maps each seen solid's face back to
 * its index in World.solids, for r.dress.
 */
function seeRoom(room: Room, turn: () => void): { seen: RoomSeen; solidOf: Map<object, number> } {
  const { world, sim } = room
  const solidOf = new Map<object, number>()
  const solids = Object.freeze(
    world.solids.flatMap((s, i) => {
      if (s.house || s.mover !== null) return []
      const f = face('solid', { at: () => frozenPoint(solidMiddle(sim, i)), size: () => frozenPoint(solidSize(s)), shape: () => s.shape.kind, name: () => s.name, color: () => s.surface.color, dressable: () => dressable(s) } satisfies SeenSolid, turn, null)
      solidOf.set(f, i)
      return [f]
    }),
  )
  const things = Object.freeze(world.things.map((t) => face('thing', { at: () => frozenPoint(t.at), size: () => frozenPoint(t.box.max.map((v, k) => v - t.box.min[k])), name: () => t.name } satisfies SeenThing, turn, null)))
  const zones = Object.freeze(
    world.zones.flatMap((z) => {
      if (z.color === null) return []
      const color = z.color
      const at = roomPoint(sim, z.at, z.mover)
      return [face('zone', { at: () => frozenPoint(at), size: () => frozenPoint(z.size), color: () => color } satisfies SeenZone, turn, null)]
    }),
  )
  const starts = Object.freeze(world.players.map((p) => frozenPoint(p.at)))
  const spots = Object.freeze(world.steps.map((s) => frozenPoint(s.at)))
  const seen: RoomSeen = face(
    'room',
    {
      view: () => world.view,
      level: () => world.level,
      solids: () => solids,
      things: () => things,
      zones: () => zones,
      wayOut: () => frozenPoint(world.wayOut.at),
      starts: () => starts,
      spots: () => spots,
    } satisfies RoomSeen,
    turn,
    null,
  )
  return { seen, solidOf }
}

// ------------------------------------------------------------------------------ where a piece may stand

/** A model placed at `at` (its foot), `scale` times its size and turned `turn` round y: the box round it in the room. The scene finds a prop that is passed or tapped by it too (scene/lookView.ts). */
export function pieceBox(recipe: Recipe, at: Vec3, scale: number, turn: number): Box {
  const b = recipe.bounds
  const c = cos(turn)
  const s = sin(turn)
  const min: Vec3 = [Infinity, at[1] + b.min[1] * scale, Infinity]
  const max: Vec3 = [-Infinity, at[1] + b.max[1] * scale, -Infinity]
  for (const x of [b.min[0], b.max[0]]) {
    for (const z of [b.min[2], b.max[2]]) {
      // +x turns toward -z, as three.js's rotation.y turns it.
      const rx = (x * c + z * s) * scale
      const rz = (-x * s + z * c) * scale
      min[0] = Math.min(min[0], at[0] + rx)
      max[0] = Math.max(max[0], at[0] + rx)
      min[2] = Math.min(min[2], at[2] + rz)
      max[2] = Math.max(max[2], at[2] + rz)
    }
  }
  return { min, max }
}

/** Whether two boxes overlap by more than EPS along each of `axes`. */
function overlap(a: Box, b: Box, axes: readonly number[]): boolean {
  return axes.every((k) => Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k]) > EPS)
}

/** From the side: a box as its outline is seen from SIDE_EYE on the plane z = 0, as a box with z 0, grown by `grow` all round. */
export function outlineOnPlane(b: Box, grow: number): Box {
  const min: Vec3 = [Infinity, Infinity, 0]
  const max: Vec3 = [-Infinity, -Infinity, 0]
  const [ex, ey, ez] = SIDE_EYE
  for (const x of [b.min[0], b.max[0]]) {
    for (const y of [b.min[1], b.max[1]]) {
      for (const z of [b.min[2], b.max[2]]) {
        const t = ez / (ez - z)
        const px = ex + (x - ex) * t
        const py = ey + (y - ey) * t
        min[0] = Math.min(min[0], px - grow)
        max[0] = Math.max(max[0], px + grow)
        min[1] = Math.min(min[1], py - grow)
        max[1] = Math.max(max[1], py + grow)
      }
    }
  }
  return { min, max }
}

/** What a piece must not cover: a start, a step's place, the way out and the tops of the play's floors, each its box in the room. */
interface Place {
  readonly what: string
  readonly box: Box
}

/**
 * The places of the room as built that no piece may cover. A floor is a still solid of the play's,
 * shown, the house's own floor not among them (players stand all over it, and a low piece in front of
 * the play stands on it). From high up the way out is its door's strip in its wall, out to LOOK_PLACE.rim
 * into the room, since a tall piece in front of a door hides it.
 */
function placesOf(room: Room): Place[] {
  const { world, sim } = room
  const high = world.view === 'high'
  const b = world.bounds
  const places: Place[] = []
  for (const p of world.players) {
    const hw = playerWidth(p) / 2
    places.push({ what: LOOK_WHY.start(p.seat), box: { min: [p.at[0] - hw, p.at[1], high ? p.at[2] - hw : 0], max: [p.at[0] + hw, p.at[1] + playerHeight(p), high ? p.at[2] + hw : 0] } })
  }
  world.steps.forEach((s, i) => places.push({ what: LOOK_WHY.step(i + 1), box: { min: [...s.at], max: [...s.at] } }))
  const door = world.wayOut.at
  const half = SIZES.doorWidth / 2
  if (!high) places.push({ what: LOOK_WHY.wayOut, box: { min: [door[0] - half, door[1], ROOM.side.back + DOOR_INSET], max: [door[0] + half, door[1] + SIZES.doorHeight, ROOM.side.back + DOOR_INSET] } })
  else if (door[2] <= b.min[2] + EPS) places.push({ what: LOOK_WHY.wayOut, box: { min: [door[0] - half, door[1], b.min[2]], max: [door[0] + half, door[1] + SIZES.doorHeight, b.min[2] + LOOK_PLACE.rim] } })
  else {
    const left = door[0] <= b.min[0] + EPS
    places.push({ what: LOOK_WHY.wayOut, box: { min: [left ? b.min[0] : b.max[0] - LOOK_PLACE.rim, door[1], door[2] - half], max: [left ? b.min[0] + LOOK_PLACE.rim : b.max[0], door[1] + SIZES.doorHeight, door[2] + half] } })
  }
  world.solids.forEach((s, i) => {
    if (s.house || s.mover !== null || s.hidden) return
    const o = sim.outlines[i]
    const top = high ? o.y1 : o.maxY
    places.push({ what: LOOK_WHY.floor(room.describe(s.id)), box: high ? { min: [o.minX, top, o.minY], max: [o.maxX, top, o.maxY] } : { min: [o.minX, top, 0], max: [o.maxX, top, 0] } })
  })
  return places
}

/** The box of each solid of the play as built, the house's left out: from the side its outline with its depth round z 0, from high up its footprint with its heights. */
function solidBoxes(room: Room): { id: number; box: Box }[] {
  const { world, sim } = room
  return world.solids.flatMap((s, i) => {
    if (s.house) return []
    const o = sim.outlines[i]
    if (world.view === 'high') return [{ id: s.id, box: { min: [o.minX, o.y0, o.minY], max: [o.maxX, o.y1, o.maxY] } }]
    const half = solidSize(s)[2] / 2
    const z = solidMiddle(sim, i)[2]
    return [{ id: s.id, box: { min: [o.minX, o.minY, z - half], max: [o.maxX, o.maxY, z + half] } }]
  })
}

/**
 * Why a piece with this box may not stand where it is, as a LOOK_NOTES sentence for `call` at `at`, or
 * null when it may: in this order, out of its place (outside the room; from the side between the
 * bands behind and in front of the play, or too tall in front; from high up tall and away from the
 * walls), inside a solid of the play, or covering a place.
 */
function misplaced(room: Room, places: readonly Place[], solids: readonly { id: number; box: Box }[], call: string, at: Point, box: Box): string | null {
  const world = room.world
  const b = world.bounds
  const high = world.view === 'high'
  const out = (rule: string) => LOOK_NOTES.outOfPlace(call, at, rule)
  const height = box.max[1] - box.min[1]
  if (high) {
    const inside = box.min[0] >= b.min[0] - GRACE && box.max[0] <= b.max[0] + GRACE && box.min[2] >= b.min[2] - GRACE && box.max[2] <= b.max[2] + GRACE && box.min[1] >= b.min[1] - GRACE
    if (!inside) return out(LOOK_WHY.outsideHigh)
    const fromWall = Math.max(0, Math.min(box.min[2] - b.min[2], box.min[0] - b.min[0], b.max[0] - box.max[0]))
    if (height > LOOK_PLACE.flat + GRACE && fromWall > LOOK_PLACE.rim + GRACE) return out(LOOK_WHY.offWall(cm(height), cm(fromWall)))
  } else {
    const inside = box.min[0] >= b.min[0] - GRACE && box.max[0] <= b.max[0] + GRACE && box.min[1] >= b.min[1] - GRACE && box.max[1] <= b.max[1] + GRACE
    if (!inside) return out(LOOK_WHY.outsideSide)
    const behind = box.min[2] >= ROOM.side.back - GRACE && box.max[2] <= LOOK_PLACE.behind + GRACE
    const before = box.min[2] >= LOOK_PLACE.frontFrom - GRACE && box.max[2] <= ROOM.side.front + GRACE
    if (!behind && !before) return out(LOOK_WHY.betweenBands(cm(box.min[2]), cm(box.max[2])))
    if (before && height > LOOK_PLACE.frontLow + GRACE) return out(LOOK_WHY.frontTall(cm(height)))
  }
  const inPlay = solids.find((s) => overlap(box, s.box, [0, 1, 2]))
  if (inPlay !== undefined) return LOOK_NOTES.inPlay(call, at, room.describe(inPlay.id))
  if (high) {
    // From high up only a tall piece covers what is on the floor, by its footprint and the floor behind it the camera's slant hides (LOOK_PLACE.shadow); a low one stands anywhere on it.
    if (height <= LOOK_PLACE.flat + GRACE) return null
    const foot: Box = { min: [box.min[0], 0, box.min[2] - height * LOOK_PLACE.shadow], max: [box.max[0], 0, box.max[2]] }
    const hidden = places.find((p) => overlap(foot, { min: [p.box.min[0] - LOOK_PLACE.cover, 0, p.box.min[2] - LOOK_PLACE.cover], max: [p.box.max[0] + LOOK_PLACE.cover, 0, p.box.max[2] + LOOK_PLACE.cover] }, [0, 2]))
    return hidden === undefined ? null : LOOK_NOTES.hides(call, at, hidden.what)
  }
  // From the side a piece covers only what it stands in front of.
  const seen = outlineOnPlane(box, 0)
  const hidden = places.find((p) => box.max[2] > p.box.max[2] + EPS && overlap(seen, outlineOnPlane(p.box, LOOK_PLACE.cover), [0, 1]))
  return hidden === undefined ? null : LOOK_NOTES.hides(call, at, hidden.what)
}

// ------------------------------------------------------------------------------ the builder

/** The builder's keys that are the room code's play, refused with notLooks, and the house's own, refused with houseOwns. */
const PLAY_KEYS = Object.keys(BUILDER_REF).filter((k) => !(k in LOOK_BUILDER_REF))
const REFUSED: Refused = {
  keys: [...PLAY_KEYS, ...BUILDER_REFUSED.houseOwns],
  sentence: (key) => ((BUILDER_REFUSED.houseOwns as readonly string[]).includes(key) ? MISTAKES.houseOwns(`r.${key}`) : LOOK_MISTAKES.notLooks(`r.${key}`)),
}
const DECOR_KNOWN = Object.keys(LOOK_DECOR_OPTS_REF)
const PROP_KNOWN = [...DECOR_KNOWN, ...Object.keys(PROP_OPTS_REF)]
const LIGHTS_KNOWN = ['color', 'size', 'twinkle']
const LAMP_KNOWN = ['color', 'power', 'reach']

/** An error the look's code threw or caused, as its sentence: a misreading or a stop says its own, with the designer's line; anything else is LOOK_MISTAKES.thrown. */
function lookSentence(err: unknown): string {
  if (err instanceof Mistake || err instanceof GuardError || (err instanceof TypeError && FROZEN_JS.test(err.message))) return explain(null, err)
  return LOOK_MISTAKES.thrown(describeError(err))
}

/**
 * Builds a room's look on the room as built (after buildRoom, before play), on `runtime`, which the
 * look's code was compiled against (or any runtime, for a look written by hand): its stream starts at
 * the room's seed plus MATH.lookSeedOffset and its budget at LOOK_BUDGET.buildTurns. Reads the room
 * and never changes it. Throws a LookBuildError with the sentence when the look misreads the
 * reference, throws, or goes past its pieces or its turns; what breaks placement is left out with a
 * note.
 */
export function buildLook(room: Room, code: LookCode, runtime: LookRuntime): LookBuilt {
  const world = room.world
  const view = world.view
  const turn = runtime.budget.turn
  const places = placesOf(room)
  const solids = solidBoxes(room)
  const { seen, solidOf } = seeRoom(room, turn)
  const built: LookBuilt = { models: [], wallpaper: null, dressed: [], decor: [], props: [], lights: [], lamps: [], notes: [], counts: { pieces: 0, props: 0, answering: 0, quarters: 0, lights: 0, lamps: 0, leftOut: 0, of: 0 } }
  const counts = built.counts
  const models = new Map<Model, ModelId>()

  const piece = (n: number) => {
    counts.pieces += n
    if (counts.pieces > LOOK_BUDGET.pieces) throw new Mistake(LOOK_MISTAKES.lookLighter(counts.pieces))
  }
  /** A model function, built once by Silly Billy's kit however often it is placed, into the look's own list. */
  const model = (call: string, m: unknown): { id: ModelId; recipe: Recipe } => {
    const f = fn<Model>(call, 'model', m)
    const known = models.get(f)
    if (known !== undefined) return { id: known, recipe: built.models[known] }
    const { recipe, notes } = buildRecipe((kit) => {
      f(kitFace(kit, turn, false))
      if (kit.shapes.length === 0) throw new Mistake(MISTAKES.noShapes(call))
    }, [])
    for (const note of notes) built.notes.push(`${call}: its model: ${note}`)
    const id = built.models.length
    built.models.push(recipe)
    models.set(f, id)
    return { id, recipe }
  }
  /** A piece of decor or a prop: its point, model, scale and turn checked, its pieces spent, and whether it may stand there (a note when not). */
  const place = (call: string, atArg: unknown, m: unknown, o: Readonly<Record<string, unknown>>) => {
    const at = point(call, 'at', atArg)
    const { id, recipe } = model(call, m)
    const scale = o.scale === undefined ? 1 : num(call, 'scale', o.scale)
    if (scale <= 0) throw new Mistake(MISTAKES.notSize(call, 'scale'))
    const turnBy = o.turn === undefined ? 0 : num(call, 'turn', o.turn)
    const n = 1 + recipe.shapes.length
    piece(n)
    counts.of += n
    const note = misplaced(room, places, solids, call, cmPoint(at), pieceBox(recipe, at, scale, turnBy))
    if (note !== null) {
      built.notes.push(note)
      counts.leftOut += n
    }
    return { kept: note === null, at, model: id, scale, turn: turnBy }
  }
  let wallpapers = 0

  const r: LookBuilder = {
    wallpaper: (m: unknown) => {
      wallpapers += 1
      if (wallpapers > 1) throw new Mistake(MISTAKES.calledTwice('r.wallpaper', wallpapers))
      const { id, recipe } = model('r.wallpaper', m)
      if (recipe.shapes.length > LOOK_BUDGET.motifShapes) throw new Mistake(LOOK_MISTAKES.motifHeavy(recipe.shapes.length))
      piece(1 + recipe.shapes.length * WALLPAPER_COPIES[view])
      built.wallpaper = id
    },
    dress: (solidArg: unknown, m: unknown) => {
      const i = typeof solidArg === 'object' && solidArg !== null ? solidOf.get(solidArg) : undefined
      if (i === undefined) throw new Mistake(LOOK_MISTAKES.notSolid(described(solidArg)))
      const s = world.solids[i]
      const at = cmPoint(solidMiddle(room.sim, i))
      const why = notDressableWhy(s)
      if (why !== null) throw new Mistake(LOOK_MISTAKES.notDressable(at, why))
      const { id, recipe } = model('r.dress', m)
      const n = 1 + recipe.shapes.length
      piece(n)
      counts.of += n
      // The model stands on the middle of the solid's bottom, in the solid's own frame: its top at the solid's top, its sides within DRESS_FIT.past beyond the solid's and DRESS_FIT.short within them (front and back only from high up, where its depth is seen whole).
      const [w, h, d] = solidSize(s)
      const b = recipe.bounds
      const past = Math.max(b.max[0] - w / 2, -w / 2 - b.min[0], b.max[2] - d / 2, -d / 2 - b.min[2])
      const short = Math.max(b.min[0] + w / 2, w / 2 - b.max[0], ...(view === 'high' ? [b.min[2] + d / 2, d / 2 - b.max[2]] : []))
      const misfit =
        Math.abs(b.max[1] - h) > DRESS_FIT.top + 1e-9 ? LOOK_WHY.topOff(cm(b.max[1]), cm(h)) : past > DRESS_FIT.past + 1e-9 ? LOOK_WHY.pastSide(cm(past)) : short > DRESS_FIT.short + 1e-9 ? LOOK_WHY.shortOf(cm(short)) : null
      // A solid dressed again is drawn as its last dressing.
      const others = built.dressed.filter((x) => x.solid !== s.id)
      if (misfit !== null) {
        built.notes.push(LOOK_NOTES.dressMisfit(at, misfit))
        counts.leftOut += n
      } else built.dressed.splice(0, built.dressed.length, ...others, { solid: s.id, model: id })
    },
    decor: (at: unknown, m: unknown, opts?: unknown) => {
      const p = place('r.decor', at, m, options('r.decor', opts, DECOR_KNOWN))
      if (p.kept) built.decor.push({ at: p.at, model: p.model, scale: p.scale, turn: p.turn })
    },
    prop: (at: unknown, m: unknown, opts?: unknown) => {
      const o = options('r.prop', opts, PROP_KNOWN)
      const p = place('r.prop', at, m, o)
      counts.props += 1
      const react = o.react === undefined ? 'wobble' : choice('r.prop', 'react', o.react, REACTS)
      const idle = o.idle === undefined ? null : choice('r.prop', 'idle', o.idle, IDLES)
      const sound = o.sound === undefined ? null : choice('r.prop', 'sound', o.sound, HOUSE_SOUNDS)
      const puff = o.puff === undefined ? null : choice('r.prop', 'puff', o.puff, PUFF_KINDS)
      if (p.kept) built.props.push({ at: p.at, model: p.model, scale: p.scale, turn: p.turn, react, idle, sound, puff })
    },
    lights: (points: unknown, opts?: unknown) => {
      if (!Array.isArray(points)) throw new Mistake(MISTAKES.notList('r.lights', 'points'))
      const o = options('r.lights', opts, LIGHTS_KNOWN)
      const given = o.color === undefined ? [LAMP_WARM] : Array.isArray(o.color) ? o.color : [o.color]
      if (given.length === 0) throw new Mistake(MISTAKES.notColor('r.lights', 'color', described(o.color)))
      const colors = given.map((c: unknown) => colour('r.lights', 'color', c))
      const size = o.size === undefined ? LIGHTS.size : num('r.lights', 'size', o.size)
      if (size <= 0) throw new Mistake(MISTAKES.notSize('r.lights', 'size'))
      const twinkle = o.twinkle === undefined ? false : bool('r.lights', 'twinkle', o.twinkle)
      piece(1)
      points.forEach((p: unknown, i) => {
        turn()
        built.lights.push({ at: point('r.lights', 'points', p), color: colors[i % colors.length], size: Math.min(size, LIGHTS.sizeMost), twinkle })
      })
      counts.lights = built.lights.length
    },
    lamp: (at: unknown, opts?: unknown) => {
      const a = point('r.lamp', 'at', at)
      const o = options('r.lamp', opts, LAMP_KNOWN)
      piece(1)
      built.lamps.push({
        at: a,
        color: o.color === undefined ? LAMP_WARM : colour('r.lamp', 'color', o.color),
        power: o.power === undefined ? DEFAULTS.lampPower : Math.max(0, Math.min(1, num('r.lamp', 'power', o.power))),
        reach: o.reach === undefined ? DEFAULTS.lampReach : Math.max(0, num('r.lamp', 'reach', o.reach)),
      })
      counts.lamps = built.lamps.length
    },
  } satisfies LookBuilder

  runtime.start(world.seed)
  try {
    code(face('builder', r, turn, REFUSED), seen)
  } catch (err) {
    throw new LookBuildError(lookSentence(err))
  }
  counts.answering = built.props.length
  counts.quarters = new Set(built.props.map((p) => quarterOf(view, p.at))).size
  return built
}

/** Which of the room's four quarters a point is in, 0 to 3: the left or right half, by the lower or upper half from the side and the back or front half from high up (LOOK_WHY.quarters' order). */
function quarterOf(view: RoomView, at: Vec3): number {
  const further = view === 'side' ? at[1] >= ROOM.side.height / 2 : at[2] >= 0
  return (at[0] >= 0 ? 1 : 0) + (further ? 2 : 0)
}

/**
 * What the check holds a built look to beyond its build: at most LOOK_BUDGET.props props and
 * LOOK_BUDGET.lights small lights, the room code's lamps (`roomLamps`) and the look's at most
 * BUDGET.lamps together, at least LOOK_LEAST.answering props that react in at least
 * LOOK_LEAST.quarters quarters, and at most LOOK_PLACE.leftOutMost of its placed pieces left out.
 * Each fault is its sentence, all of them at once so a fix hears everything; none when it passes.
 */
export function lookFaults(built: LookBuilt, view: RoomView, roomLamps: number): string[] {
  const c = built.counts
  const faults: string[] = []
  if (c.props > LOOK_BUDGET.props) faults.push(LOOK_MISTAKES.tooManyProps(c.props))
  if (c.lights > LOOK_BUDGET.lights) faults.push(LOOK_MISTAKES.tooManyLights(c.lights))
  if (roomLamps + c.lamps > BUDGET.lamps) faults.push(LOOK_MISTAKES.lampsTogether(roomLamps, c.lamps))
  if (c.answering < LOOK_LEAST.answering || c.quarters < LOOK_LEAST.quarters) {
    const filled = new Set(built.props.map((p) => quarterOf(view, p.at)))
    const bare = LOOK_WHY.quarters[view].find((_, q) => !filled.has(q))
    faults.push(LOOK_MISTAKES.fewAnswer(c.answering, bare ?? null))
  }
  if (c.leftOut > c.of * LOOK_PLACE.leftOutMost + 1e-9) faults.push(LOOK_MISTAKES.tooManyLeftOut(c.leftOut, c.of))
  return faults
}
