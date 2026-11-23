/**
 * Worlds written by hand for the scene's sheet (Sheet.tsx) and its measurements: what a room can
 * hold, built straight as world.ts data. Each stands in the house's one room (engine/api.ts ROOM,
 * step 7a), in a shell of its own, with the house's own solids built last as the sim builds them,
 * and has a step that plays a little of it (walking, jumping, movers, pops, puffs, a shake) by
 * changing its own copy, as the sim would; the scene only reads it.
 *
 * - meadow: a garden room at light 1, four players among boxes, ramps, a ball, a turned box,
 *   planks, things, decor behind and in front, a zone, signs of every kind and the way out shut.
 * - workshop: a workshop at light 0.8, three players on ice, bounce and belts, movers, pushing,
 *   bonked, grown, shrunk and glowing, with scores, pops, puffs and a shake.
 * - night: a night room at the least light, 0.6, two players with lamps and glowing shapes, the way
 *   out open.
 * - small: one player in the house's own shell at light 1.
 * - courtyard: seen from high up, a sunny courtyard room at light 0.8 with four players: a terrace
 *   up a ramp rising back, a ledge up a ramp rising front, a low plank, a turned box, a ball, ice, a
 *   bounce pad, a belt carrying back, a turntable turning round y, lamps, things rolling, carried
 *   and pushed, decor, a zone, signs of every kind and the way out shut in the back wall; the
 *   players walk the floor round a ring, jump up onto a ledge, push and carry, and one is bonked.
 *
 * Each of meadow, night and courtyard has a look written by hand for it (fixtureLook 'dressed': a
 * wallpaper, furniture, a dressed ledge, props in every quarter, small lights and a lamp), and meadow
 * the heaviest look the look's limits allow ('heaviest': LOOK_BUDGET's props, small lights and pieces,
 * and lamps up to BUDGET.lamps). A fixture's look is plain LookBuilt data, drawn as the scene draws
 * any look; it is not built or checked by the look's builder, since a fixture is no sim's room. The
 * kids can wear something in every slot (FIXTURE_WEAR), as four kids in their presents do.
 */

import { buildRecipe, type Kit } from '../../../silly-billy/src/engine/kit'
import { proportions, KID_HEIGHT } from '../../../silly-billy/src/engine/body'
import type { Puff, PuffKind, Recipe, Slot, Vec3 } from '../../../silly-billy/src/engine/types'
import { BUDGET, type Rise, type Shell } from '../engine/api'
import { frontOfFloor, HIGH_FRAME, SIDE_FRAME } from '../engine/camera'
import { GIFT_MARKERS } from '../engine/gift'
import { IDLES, LOOK_BUDGET, REACTS, wallpaperSpots, type LookBuilt, type PropOpts } from '../engine/look'
import { HOUSE } from '../engine/sim'
import type { Wearing } from '../saves'
import { HOUSE_SHELL, ROOM_BOUNDS, type BodyLook, type Decor, type HandleId, type Lamp, type ModelId, type Mover, type Player, type RoomView, type Sign, type SignShown, type Solid, type SolidShape, type Surface, type Thing, type World, type Zone } from '../engine/world'
import { SEAT_COLORS, type SeatIndex } from '../seats/types'

export type FixtureName = 'meadow' | 'workshop' | 'night' | 'small' | 'courtyard'
export const FIXTURES: readonly FixtureName[] = ['meadow', 'workshop', 'night', 'small', 'courtyard']

export interface Fixture {
  world: World
  /** Plays it on to t, dt after the last step: changes this fixture's own world. */
  step: (w: World, t: number, dt: number) => void
}

// ------------------------------------------------------------------------------ models

const model = (name: string, build: (m: Kit) => void): Recipe => buildRecipe((m) => (build(m), {}), [name]).recipe

const MODELS = {
  tree: model('tree', (m) => {
    m.cylinder(0.16, 0.22, 1.6, { at: [0, 0.8, 0], color: '#8a5a3a' })
    m.sphere(0.95, { at: [0, 2.2, 0], color: '#4caf50' })
    m.sphere(0.7, { at: [0.6, 1.9, 0.2], color: '#5cc25c' })
    m.sphere(0.65, { at: [-0.6, 1.95, 0.1], color: '#43a047' })
  }),
  hill: model('hill', (m) => {
    m.sphere(3, { at: [0, 0, 0], scale: [1.6, 0.8, 0.6], color: '#a8dcc0' })
  }),
  cloud: model('cloud', (m) => {
    for (const [x, y, r] of [[0, 0, 0.6], [0.6, -0.1, 0.45], [-0.6, -0.1, 0.5], [0.25, 0.25, 0.45]] as const) m.sphere(r, { at: [x, y, 0], color: '#ffffff' })
  }),
  flower: model('flower', (m) => {
    m.cylinder(0.025, 0.025, 0.35, { at: [0, 0.175, 0], color: '#3f9e3a' })
    for (let i = 0; i < 5; i++) m.sphere(0.07, { at: [Math.cos((i * 2 * Math.PI) / 5) * 0.08, 0.38 + Math.sin((i * 2 * Math.PI) / 5) * 0.08, 0], color: '#ff86c0' })
    m.sphere(0.055, { at: [0, 0.38, 0.03], color: '#ffd23a' })
  }),
  tuft: model('tuft', (m) => {
    for (const [x, r] of [[-0.12, -0.3], [0, 0], [0.12, 0.3]] as const) m.cone(0.06, 0.32, { at: [x, 0.16, 0], rot: [0, 0, r], color: '#5aa83c' })
  }),
  crate: model('crate', (m) => {
    m.box(0.6, 0.6, 0.6, { at: [0, 0.3, 0], color: '#d9984a' })
    m.box(0.62, 0.08, 0.62, { at: [0, 0.3, 0], color: '#a8682c' })
    m.box(0.08, 0.62, 0.62, { at: [0, 0.3, 0], color: '#a8682c' })
  }),
  ball: model('ball', (m) => {
    m.sphere(0.3, { at: [0, 0.3, 0], color: '#ff5a4e' })
    m.torus(0.3, 0.04, { at: [0, 0.3, 0], color: '#ffffff' })
  }),
  star: model('star', (m) => {
    const pts: number[][] = []
    for (let i = 0; i < 10; i++) pts.push([Math.cos(Math.PI / 2 + (i * Math.PI) / 5) * (i % 2 === 0 ? 0.3 : 0.13), 0.32 + Math.sin(Math.PI / 2 + (i * Math.PI) / 5) * (i % 2 === 0 ? 0.3 : 0.13)])
    m.extrude(pts, 0.12, { color: '#ffd23a', glow: true })
  }),
  bigCrate: model('heavy box', (m) => {
    m.box(1, 1, 0.8, { at: [0, 0.5, 0], color: '#7a8aa0' })
    m.box(1.02, 0.12, 0.82, { at: [0, 0.85, 0], color: '#56657a' })
    m.box(1.02, 0.12, 0.82, { at: [0, 0.15, 0], color: '#56657a' })
  }),
  windmill: model('windmill', (m) => {
    m.cylinder(0.35, 0.6, 3, { at: [0, 1.5, 0], color: '#f4dfba' })
    m.cone(0.7, 0.8, { at: [0, 3.4, 0], color: '#d9534f' })
    m.part('blades', { at: [0, 2.6, 0.45] }, () => {
      for (let i = 0; i < 4; i++) m.box(0.25, 1.4, 0.05, { at: [Math.cos((i * Math.PI) / 2) * 0.7, Math.sin((i * Math.PI) / 2) * 0.7, 0], rot: [0, 0, (i * Math.PI) / 2 + Math.PI / 2], color: '#ffffff' })
      m.sphere(0.12, { color: '#8a5a3a' })
    })
  }),
  lantern: model('lantern', (m) => {
    m.cylinder(0.04, 0.04, 2.2, { at: [0, 1.1, 0], color: '#3a3f4a' })
    m.box(0.36, 0.42, 0.36, { at: [0, 2.35, 0], color: '#ffe08a', glow: true })
    m.cone(0.3, 0.22, { at: [0, 2.67, 0], color: '#3a3f4a' })
  }),
  mushroom: model('mushroom', (m) => {
    m.cylinder(0.1, 0.13, 0.4, { at: [0, 0.2, 0], color: '#fff6e0' })
    m.sphere(0.3, { at: [0, 0.42, 0], scale: [1, 0.6, 1], color: '#b06bff', glow: true })
  }),
  gem: model('gem', (m) => {
    m.cylinder(0.22, 0, 0.3, { at: [0, 0.15, 0], color: '#4cb5f0' })
    m.cylinder(0.12, 0.22, 0.12, { at: [0, 0.36, 0], color: '#8fdcf5' })
  }),
  gear: model('gear', (m) => {
    m.part('wheel', { at: [0, 0.8, 0] }, () => {
      m.cylinder(0.6, 0.6, 0.15, { rot: [Math.PI / 2, 0, 0], color: '#c9ced6' })
      for (let i = 0; i < 8; i++) m.box(0.22, 0.22, 0.16, { at: [Math.cos((i * Math.PI) / 4) * 0.68, Math.sin((i * Math.PI) / 4) * 0.68, 0], rot: [0, 0, (i * Math.PI) / 4], color: '#aab2bd' })
      m.sphere(0.15, { color: '#ff5a4e' })
    })
  }),
} as const

type ModelName = keyof typeof MODELS

// ------------------------------------------------------------------------------ a world, built by hand

const BODIES: BodyLook[] = [
  { skin: '#f8cba6', eyes: '#3a2a1e', top: '#ff5a4e', bottom: '#2a5fa8', shoes: '#ffffff', skirt: false, build: 1 },
  { skin: '#c98a58', eyes: '#2b2b30', top: '#3d8bff', bottom: '#ff86c0', shoes: '#ffd23a', skirt: true, build: 1 },
  { skin: '#ffe5d0', eyes: '#2f6fb8', top: '#ffd23a', bottom: '#5aa83c', shoes: '#ff5a4e', skirt: false, build: 1.1 },
  { skin: '#91603c', eyes: '#2b2b30', top: '#2fc46a', bottom: '#7a5ce0', shoes: '#ffffff', skirt: true, build: 0.9 },
]
const HAIR = ['#7a4a2a', '#2f2a38', '#e0702e', '#f5cf57']

const plain = (color: string): Surface => ({ color, ice: false, bounce: 0, belt: [0, 0, 0], through: false })

class Build {
  readonly w: World
  private next: HandleId
  private readonly models = new Map<ModelName, ModelId>()

  /** A room seen from `view` in the house's box and the camera's frame, as the sim sets them (engine/sim.ts createSim), in `shell`. */
  constructor(players: number, view: RoomView, shell: Shell, door: Vec3) {
    this.next = players
    const bounds = { min: [...ROOM_BOUNDS[view].min] as Vec3, max: [...ROOM_BOUNDS[view].max] as Vec3 }
    const high = view === 'high'
    this.w = {
      t: 0, frame: 0, seed: 1, rng: 1, level: 1, kind: 'together', view, bounds,
      camera: high ? frontOfFloor(bounds, HIGH_FRAME, { x: 0, y: 0, width: 0, height: 0 }) : { ...SIDE_FRAME },
      floorFrame: high ? { ...HIGH_FRAME } : null,
      shell,
      models: [], solids: [], movers: [], things: [], decor: [], zones: [], lamps: [], signs: [], players: [], pushing: false,
      steps: [], next: 0, rule: null, clock: null, wayOut: { at: door, open: false },
      helper: { at: [bounds.min[0] + 1, bounds.max[1] - 1, 0], step: null, says: null, saidAt: -Infinity, quietSince: 0, hints: 0 },
      puffs: [], pops: [], sounds: [], shakes: [], serial: 0, contacts: [], finishing: null, end: null, pointers: [], uses: [],
    }
  }

  private id(): HandleId {
    return this.next++
  }

  model(name: ModelName): ModelId {
    let id = this.models.get(name)
    if (id === undefined) {
      id = this.w.models.length
      this.w.models.push(MODELS[name])
      this.models.set(name, id)
    }
    return id
  }

  /** The house's own floor, walls and ceiling, built last as the sim builds them (engine/sim.ts addHouse): gives back its floor. */
  house(): Solid {
    const sh = this.w.shell
    const built = HOUSE[this.w.view].map((p) => this.box(p.at, p.size, { color: p.part === 'floor' ? sh.floor.color : p.part === 'ceiling' ? sh.ceiling.color : sh.walls.color }, { house: true }))
    return built[0]!
  }

  private solid(at: Vec3, shape: SolidShape, surface: Partial<Surface> & { color: string }, o: Partial<Solid>): Solid {
    const s: Solid = { id: this.id(), name: null, hidden: false, mover: null, at, slide: null, shape, house: false, plain: false, surface: { ...plain(surface.color), ...surface }, model: null, turn: 0, turning: null, glow: null, parts: {}, ...o }
    this.w.solids.push(s)
    return s
  }

  box(at: Vec3, size: Vec3, surface: Partial<Surface> & { color: string }, o: Partial<Solid> = {}) {
    return this.solid(at, { kind: 'box', size }, surface, o)
  }
  ramp(at: Vec3, size: Vec3, rises: Rise, color: string, o: Partial<Solid> = {}) {
    return this.solid(at, { kind: 'ramp', size, rises }, { color }, o)
  }
  ball(at: Vec3, radius: number, color: string, o: Partial<Solid> = {}) {
    return this.solid(at, { kind: 'ball', radius }, { color }, o)
  }
  mover(at: Vec3, o: Partial<Mover> = {}): Mover {
    const m: Mover = { id: this.id(), name: null, hidden: false, mover: null, at, turn: 0, clock: 0, speed: 1, by: { from: [0, 0, 0], to: [0, 0, 0], start: 0, secs: 0 }, turnBy: { from: 0, to: 0, start: 0, secs: 0 }, glow: null, ...o }
    this.w.movers.push(m)
    return m
  }
  thing(at: Vec3, name: ModelName, o: Partial<Thing> = {}): Thing {
    const bounds = MODELS[name].bounds
    const th: Thing = { id: this.id(), name: null, hidden: false, mover: null, at, slide: null, model: this.model(name), scale: 1, round: false, weight: 0.3, velocity: [0, 0, 0], roll: 0, home: at, heldBy: null, codeMoved: false, putFrame: -1, on: null, box: { min: bounds.min, max: bounds.max }, glow: null, parts: {}, ...o }
    this.w.things.push(th)
    return th
  }
  decor(at: Vec3, name: ModelName, o: Partial<Decor> = {}): Decor {
    const d: Decor = { id: this.id(), name: null, hidden: false, mover: null, at, slide: null, model: this.model(name), scale: 1, turn: 0, turning: null, glow: null, parts: {}, changed: false, ...o }
    this.w.decor.push(d)
    return d
  }
  zone(at: Vec3, size: Vec3, color: string | null, o: Partial<Zone> = {}): Zone {
    const z: Zone = { id: this.id(), name: null, hidden: false, mover: null, at, slide: null, size, color, wind: [0, 0, 0], pull: 0, gravity: 1, drag: 0, inside: [], glow: null, ...o }
    this.w.zones.push(z)
    return z
  }
  lamp(at: Vec3, color: string, o: Partial<Lamp> = {}): Lamp {
    const l: Lamp = { id: this.id(), name: null, hidden: false, mover: null, at, slide: null, color, power: 0.8, reach: 6, ...o }
    this.w.lamps.push(l)
    return l
  }
  sign(at: Vec3, what: SignShown, o: Partial<Sign> = {}): Sign {
    const s: Sign = { id: this.id(), name: null, hidden: false, mover: null, at, slide: null, what, ...o }
    this.w.signs.push(s)
    return s
  }
  player(seat: SeatIndex, at: Vec3, on: HandleId | null, o: Partial<Player> = {}): Player {
    const p: Player = {
      id: seat, seat, at, velocity: [0, 0, 0], facing: 1, heading: [1, 0, 0], on, stride: 0,
      jumpedAt: -Infinity, landedAt: -Infinity, threwAt: -Infinity, grabbedAt: -Infinity, landSpeed: 0,
      holding: null, pushing: null, bonkedUntil: -Infinity, heldSince: null, freeUntil: -Infinity,
      input: { stick: [0, 0], a: false, b: false }, leftGroundAt: -Infinity, jumpKeptUntil: -Infinity, jumpHeld: false,
      lastFloor: null, change: null, back: null, jumpFrom: at[1], steep: false, size: 1, start: at, putFrame: -1, heldAt: at, stick: 'walk', a: 'jump', b: 'grab', color: SEAT_COLORS[seat], score: 0, badge: false, glow: null,
      body: BODIES[seat]!, wear: { hair: { id: 'own:hair', main: HAIR[seat]!, second: '#ffffff', pattern: 'plain' } },
      ...o,
    }
    this.w.players[seat] = p
    return p
  }
}

/** A walk back and forth between two x at a speed: where, which way, how far walked. */
function pace(p: Player, t: number, from: number, to: number, speed: number) {
  const len = to - from
  const s = (t * speed) % (2 * len)
  const forward = s < len
  p.at = [forward ? from + s : to - (s - len), p.at[1], p.at[2]]
  p.velocity = [forward ? speed : -speed, 0, 0]
  p.facing = forward ? 1 : -1
  p.stride = t * speed
}

/** A jump every `every` seconds from a floor at y, as high as FEEL lets: up, down and a landing. */
function hop(p: Player, t: number, floor: number, on: HandleId, every: number, high: number) {
  const g = 20
  const v0 = Math.sqrt(2 * g * high)
  const air = (2 * v0) / g
  const k = t % every
  const start = t - k
  if (k < air) {
    p.at = [p.at[0], floor + v0 * k - (g * k * k) / 2, p.at[2]]
    p.velocity = [p.velocity[0], v0 - g * k, 0]
    p.on = null
    p.jumpedAt = start
  } else {
    p.at = [p.at[0], floor, p.at[2]]
    p.velocity = [p.velocity[0], 0, 0]
    p.on = on
    p.landedAt = start + air
    p.landSpeed = v0
  }
}

/** Keeps a burst of puffs going: a new one from `at` every `every` seconds, the old ones moved on and let go. */
function puffs(w: World, t: number, dt: number, at: Vec3, kind: PuffKind, color: string, every: number, n: number) {
  for (const p of w.puffs) {
    p.vy -= p.gravity * dt
    p.x += p.vx * dt
    p.y += p.vy * dt
    p.z += p.vz * dt
  }
  w.puffs = w.puffs.filter((p) => t - p.born < p.life)
  if (Math.floor(t / every) === Math.floor((t - dt) / every) && t > dt) return
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t
    const puff: Puff = { kind, x: at[0], y: at[1], z: at[2], vx: Math.cos(a) * 1.6, vy: 2 + Math.sin(a) * 1.2, vz: Math.sin(a * 3) * 0.6, color, size: 0.22, born: t, life: 1.1, gravity: 3 }
    w.puffs.push(puff)
  }
}

/** A pop of `what` from `at` every `every` seconds. */
function popEvery(w: World, t: number, every: number, at: Vec3, what: World['pops'][number]['what']) {
  const born = t - (t % every)
  w.pops = [{ at, what, born }]
}

// ------------------------------------------------------------------------------ the rooms

/** The rooms' own shells: a paint of a colour, a second colour and a pattern. */
const paint = (color: string, second: string, pattern: Shell['walls']['pattern']) => ({ color, second, pattern })

function meadow(): Fixture {
  const shell: Shell = { walls: paint('#bfe6ff', '#d9f1ff', 'spots'), floor: paint('#79c060', '#6cb455', 'checks'), ceiling: paint('#f2fbff', '#f2fbff', 'plain'), trim: '#ffffff', light: 1 }
  const b = new Build(4, 'side', shell, [7, 0, 0])
  // Behind the play: trees, clouds hung under the ceiling and a windmill; in front: flowers and grass.
  for (const x of [-7, -1, 5.5]) b.decor([x, 0, -2.2], 'tree')
  for (const [x, y] of [[-5, 6.8], [1, 7.1], [6, 6.9]] as const) b.decor([x, y, -2.5], 'cloud')
  b.decor([2.5, 0, -2.4], 'windmill', { parts: { blades: { from: [0, 0, 0], to: [0, 0, 0], start: 0, secs: 0 } }, changed: true })
  b.ramp([-5.5, 0.5, 0], [3, 1, 2], 'right', '#ff8f5a')
  b.box([-3, 0.5, 0], [2, 1, 2], { color: '#ff8f5a' })
  b.ramp([-0.5, 0.5, 0], [3, 1, 2], 'left', '#ff8f5a')
  b.box([1.5, 2.4, 0], [2.4, 0.4, 2], { color: '#5aa9ff' }, { turn: 0.25 })
  b.ball([4.2, 1, 0], 1, '#c38bff')
  const plank1 = b.box([-5, 3.6, 0], [3, 0.3, 1.6], { color: '#d9a066', through: true })
  b.box([-1.5, 5.2, 0], [3, 0.3, 1.6], { color: '#d9a066', through: true })
  b.box([5.8, 3.5, 0], [3.5, 0.6, 2], { color: '#ffd23a' })
  b.thing([-7.2, 0, 0], 'crate')
  b.thing([-3, 1, 0], 'ball', { round: true, roll: 0.6 })
  b.thing([5.8, 3.8, 0], 'star', { glow: { color: '#fff3b0', pulse: true } })
  const carried = b.thing([6, 0, 0], 'crate', { heldBy: 3 })
  b.zone([6.5, 1.5, 0], [2.4, 3, 2], '#7cf0a0', { inside: [3] })
  b.sign([-3, 2.4, 0], 3)
  b.sign([1, 6.4, 0], { en: 'Find the star', fi: 'Etsi tähti' })
  b.sign([5.8, 5.3, 0], { count: 2, of: 5 })
  b.sign([-6.2, 6.2, 0], { clock: 60, from: 0 })
  for (const [i, x] of [-7.5, -4.4, -1, 2, 3.8, 6.8].entries()) b.decor([x, 0, 1.25], i % 2 === 0 ? 'flower' : 'tuft')
  const floor = b.house()
  b.player(0, [-6.4, 0, 0], floor.id, { score: 3, badge: true })
  b.player(1, [2, 0, 0], floor.id)
  b.player(2, [-5, 3.75, 0], plank1.id, { facing: -1 })
  b.player(3, [6, 0, 0], floor.id, { holding: carried.id, grabbedAt: -10, facing: -1, score: 12, badge: true })
  return {
    world: b.w,
    step: (w, t, dt) => {
      w.t = t
      const [p0, p1, p2] = w.players as [Player, Player, Player]
      // Using something now and then: a reach.
      p0.grabbedAt = t - (t % 2)
      pace(p1, t, 1.2, 4.8, 3.5)
      p1.at = [p1.at[0], 0, 0]
      hop(p2, t, 3.75, plank1.id, 1.6, 1.6)
      w.decor.find((d) => d.model === b.model('windmill'))!.parts.blades = { from: [0, 0, t * 0.8], to: [0, 0, t * 0.8], start: 0, secs: 0 }
      puffs(w, t, dt, [5.8, 4.5, 0.3], 'star', '#ffd23a', 1.5, 8)
    },
  }
}

function workshop(): Fixture {
  const shell: Shell = { walls: paint('#ffe9c7', '#f6d7a4', 'checks'), floor: paint('#9a8a78', '#8a7a68', 'stripes'), ceiling: paint('#fff6e6', '#fff6e6', 'plain'), trim: '#5a6470', light: 0.8 }
  const b = new Build(3, 'side', shell, [-5.2, 0, 0])
  for (const x of [-6, 0, 5]) b.decor([x, 2.8, -2.5], 'gear', { parts: { wheel: { from: [0, 0, 0], to: [0, 0, 0], start: 0, secs: 0 } }, changed: true })
  const ice = b.box([-4, 0.25, 0], [4.4, 0.5, 2], { color: '#7fc8ff', ice: true })
  b.box([-0.8, 0.4, 0], [1.6, 0.8, 2], { color: '#ff86c0', bounce: 3 })
  const belt = b.box([5.4, 0.3, 0], [5, 0.6, 2], { color: '#9aa3ad', belt: [2, 0, 0] })
  b.box([-7.4, 3, 0], [0.8, 4, 2], { color: '#9aa3ad', belt: [0, 1.5, 0] })
  // A lift going up and down, with its own lamp and a sign; and a ring of two platforms turning.
  const lift = b.mover([-3, 3.5, 0])
  b.box([0, 0, 0], [2.4, 0.35, 2], { color: '#ffd23a' }, { mover: lift.id })
  b.sign([0, 1.1, 0], { en: 'Up', fi: 'Ylös' }, { mover: lift.id })
  b.lamp([0, 0.6, 0.5], '#fff1b0', { mover: lift.id, power: 0.6 })
  const wheel = b.mover([3.5, 4.6, 0], { glow: { color: '#ffd23a', pulse: true } })
  for (const s of [-1, 1]) b.box([s * 2.2, 0, 0], [1.8, 0.3, 1.6], { color: '#5aa9ff' }, { mover: wheel.id })
  b.ball([0, 0, 0], 0.4, '#ff5a4e', { mover: wheel.id })
  const heavy = b.thing([1.5, 0, 0], 'bigCrate', { weight: 2 })
  b.thing([-4, 0.5, 0], 'gem', { glow: { color: '#8fdcf5', pulse: false } })
  b.box([6.4, 3, 0], [2.6, 0.4, 2], { color: '#c38bff' }, { glow: { color: '#ff86c0', pulse: true } })
  b.zone([-0.8, 2.3, 0], [1.8, 3, 2], '#ff86c0', { glow: { color: '#ff86c0', pulse: true } })
  b.lamp([6.4, 6.6, 0.5], '#ffe08a')
  b.sign([6.4, 4.2, 0], { count: 4, of: 4 })
  b.sign([0, 7, 0], 42)
  const floor = b.house()
  b.player(0, [0.6, 0, 0], floor.id, { pushing: heavy.id, velocity: [1.5, 0, 0], score: 5, badge: true })
  b.player(1, [-4, 0.5, 0], ice.id, { change: { speed: 1, jump: 1, size: 1.6, weight: 1, until: 1e9 }, size: 1.6, glow: { color: '#ffd23a', pulse: true }, score: 2, badge: true })
  b.player(2, [5.4, 0.6, 0], belt.id, { change: { speed: 1, jump: 1, size: 0.6, weight: 1, until: 1e9 }, size: 0.6, facing: -1, score: 0, badge: true })
  return {
    world: b.w,
    step: (w, t, dt) => {
      w.t = t
      const [p0, p1, p2] = w.players as [Player, Player, Player]
      // Pushing the heavy box along slowly, then back to start.
      const push = (t * 0.8) % 1.2
      p0.at = [0.4 + push, 0, 0]
      p0.stride = t * 0.8
      w.things[0]!.at = [p0.at[0] + 0.9, 0, 0]
      p1.bonkedUntil = t % 4 < 1.2 ? t - (t % 4) + 1.2 : -Infinity
      p2.at = [5.4 + Math.sin(t) * 1.5, 0.6, 0]
      p2.velocity = [2 + Math.cos(t) * 1.5, 0, 0]
      p2.stride = t * 2
      w.movers[0]!.at = [-3, 3.5 + 1.5 * Math.sin(t * 0.8), 0]
      w.movers[1]!.turn = t * 0.5
      for (const d of w.decor) d.parts.wheel = { from: [0, 0, t], to: [0, 0, t], start: 0, secs: 0 }
      popEvery(w, t, 1.5, [-0.8, 1.6, 0], 1)
      w.shakes = t % 3 < 0.5 ? [{ strength: 0.6, born: t - (t % 3), serial: 1 }] : []
      puffs(w, t, dt, [-0.8, 1.2, 0.3], 'confetti', '#ff86c0', 1.2, 14)
    },
  }
}

function night(): Fixture {
  const shell: Shell = { walls: paint('#1b2552', '#ffe9a0', 'stars'), floor: paint('#3e4f7a', '#34446c', 'stripes'), ceiling: paint('#141c40', '#141c40', 'plain'), trim: '#c9b8ff', light: 0.6 }
  const b = new Build(2, 'side', shell, [6, 0, 0])
  for (const x of [-7, -2, 3, 7]) b.decor([x, 0, -2.2], 'tree')
  b.box([-2, 2.2, 0], [3, 0.4, 2], { color: '#7a8aa0' })
  b.box([2, 4, 0], [2.4, 0.4, 2], { color: '#7a8aa0' }, { glow: { color: '#7cf0ff', pulse: true } })
  b.decor([-5, 0, -1.2], 'lantern')
  b.decor([3.5, 0, -1.2], 'lantern')
  for (const x of [-6, -0.5, 1, 7.2]) b.decor([x, 0, 1.2], 'mushroom')
  b.lamp([-5, 2.35, -1.2], '#ffe08a', { power: 1, reach: 7 })
  b.lamp([3.5, 2.35, -1.2], '#ffe08a', { power: 1, reach: 7 })
  b.lamp([-2, 3.5, 0.5], '#9ad0ff', { power: 0.7, reach: 5 })
  b.thing([-2, 2.4, 0], 'star', { glow: { color: '#fff3b0', pulse: true } })
  b.sign([0, 6.6, 0], { en: 'Go home', fi: 'Mene kotiin' })
  const floor = b.house()
  b.player(0, [4.4, 0, 0], floor.id, { glow: { color: '#ffd23a', pulse: false }, facing: 1 })
  b.player(1, [-4.2, 3, 0], null, { velocity: [0, -10, 0], facing: -1 })
  b.w.wayOut.open = true
  return {
    world: b.w,
    step: (w, t) => {
      w.t = t
      const p1 = w.players[1]!
      const k = t % 1.4
      p1.at = [-4.2, 6 - 3 * k * k, 0]
      p1.velocity = [0, -6 * k - 2, 0]
      p1.back = k < 0.5 ? { from: [-4.2, 6, 0], until: t - k + 0.5 } : null
    },
  }
}

function small(): Fixture {
  const b = new Build(1, 'side', HOUSE_SHELL, [6, 0, 0])
  b.box([1.5, 0.4, 0], [3, 0.8, 2], { color: '#9b5fd3' })
  b.ramp([-1, 0.4, 0], [2, 0.8, 2], 'right', '#9b5fd3')
  b.decor([-5.5, 0, -2.2], 'tree')
  for (const x of [-7, 4]) b.decor([x, 0, 1.25], 'flower')
  b.sign([1.5, 2.5, 0], { en: 'Hello, door!', fi: 'Hei, ovi!' })
  const floor = b.house()
  b.player(0, [-5, 0, 0], floor.id)
  b.w.wayOut.open = true
  return {
    world: b.w,
    step: (w, t) => {
      w.t = t
      const p = w.players[0]!
      pace(p, t, -6.5, -3.5, 2.5)
      p.at = [p.at[0], 0, 0]
    },
  }
}

/** Seen from high up: the floor x by z, every body keeping its z, turns round y. */
function courtyard(): Fixture {
  const shell: Shell = { walls: paint('#ffd9b0', '#ffc58a', 'zigzag'), floor: paint('#8cc96b', '#7fbf5e', 'checks'), ceiling: paint('#fff3e0', '#fff3e0', 'plain'), trim: '#a0522d', light: 0.8 }
  const b = new Build(4, 'high', shell, [1.5, 0, -4])
  const w = b.w
  // The helper's home (engine/sim.ts helperHome): over the top of the walls' back right corner.
  w.helper.at = [7.15, 2.9, -4.15]
  // A terrace at the back left up a ramp rising back; a ledge at the front right up a ramp rising front; a low plank.
  b.box([-5, 0.5, -3], [4, 1, 2], { color: '#c9a77a' })
  b.ramp([-5, 0.5, -1.25], [2, 1, 1.5], 'back', '#d8b98e')
  const ledge = b.box([5, 0.45, 3.2], [3, 0.9, 1.6], { color: '#9b8bd3' })
  b.ramp([5, 0.45, 1.65], [2, 0.9, 1.5], 'front', '#b5a6e8')
  b.box([-2.5, 0.15, 1.1], [2, 0.3, 1.8], { color: '#d9a066', through: true })
  b.box([-0.2, 0.4, -1.2], [2.4, 0.8, 1.2], { color: '#5aa9ff' }, { turn: 0.5 })
  b.ball([-1.5, 0.6, 2.9], 0.6, '#c38bff')
  b.box([-5, 0.05, 2.6], [3, 0.1, 2.2], { color: '#7fc8ff', ice: true })
  b.box([2.2, 0.25, 3], [1.4, 0.5, 1.4], { color: '#ff86c0', bounce: 3 })
  b.box([4.2, 0.1, -1.8], [1.6, 0.2, 3.6], { color: '#9aa3ad', belt: [0, 0, -1.5] })
  // A turntable turning round y with two benches on it, and a sign of its own.
  const table = b.mover([-2.5, 0, -3], { glow: { color: '#ffd23a', pulse: true } })
  b.box([0, 0.1, 0], [2.4, 0.2, 0.6], { color: '#ffb35a' }, { mover: table.id })
  b.box([0, 0.1, 0], [0.6, 0.2, 2.4], { color: '#ffb35a' }, { mover: table.id })
  b.sign([0, 1.4, 0], { en: 'Spin', fi: 'Pyöri' }, { mover: table.id })
  b.lamp([5, 2.4, -3.6], '#ffe08a', { power: 1, reach: 7 })
  b.lamp([-6.4, 2.4, 1.5], '#ffe08a', { power: 1, reach: 7 })
  for (const [x, z] of [[-6.4, -3.5], [6.4, -3.5], [6.4, 0.6]] as const) b.decor([x, 0, z], 'tree')
  b.decor([5, 0, -3.6], 'lantern')
  b.decor([-6.4, 0, 1.5], 'lantern')
  b.decor([2.6, 0, -3.6], 'windmill', { scale: 0.6, parts: { blades: { from: [0, 0, 0], to: [0, 0, 0], start: 0, secs: 0 } }, changed: true })
  for (const [x, z] of [[-3.4, 3.8], [-0.4, 3.9], [3.2, -0.4], [6.6, 2], [-6.6, -1.2]] as const) b.decor([x, 0, z], x < 0 ? 'flower' : 'tuft')
  const ball = b.thing([-6.5, 0, -0.2], 'ball', { round: true })
  b.thing([-5, 1, -3.2], 'star', { glow: { color: '#fff3b0', pulse: true } })
  const heavy = b.thing([2, 0, -2.6], 'bigCrate', { weight: 2 })
  const carried = b.thing([5, 0, 0], 'crate', { heldBy: 3 })
  b.thing([-1, 0, -3.4], 'gem', { glow: { color: '#8fdcf5', pulse: false } })
  b.zone([6, 0.75, -0.8], [1.6, 1.5, 2], '#7cf0a0', { inside: [3] })
  b.sign([6, 2.2, -0.8], { count: 2, of: 5 })
  b.sign([-4, 2.2, -3.2], { en: 'Find the star', fi: 'Etsi tähti' })
  b.sign([-0.2, 1.8, -1.2], 7)
  b.sign([5, 2.2, 3.2], { clock: 60, from: 0 })
  const floor = b.house()
  b.player(0, [-2, 0, 2.6], floor.id, { stick: 'floor', score: 3, badge: true })
  b.player(1, [2.8, 0, 3.2], floor.id, { stick: 'floor', heading: [1, 0, 0] })
  b.player(2, [2, 0, -1.8], floor.id, { stick: 'floor', heading: [0, 0, -1], pushing: heavy.id, velocity: [0, 0, -1.2] })
  b.player(3, [5, 0, 0], floor.id, { stick: 'floor', holding: carried.id, grabbedAt: -10, heading: [-1, 0, 0], facing: -1, score: 12, badge: true })
  return {
    world: w,
    step: (w, t, dt) => {
      w.t = t
      const [p0, p1, p2, p3] = w.players as [Player, Player, Player, Player]
      // Round a ring on the floor, so the kid walks every way.
      const a = t * 0.9
      const [vx, vz] = [-Math.sin(a) * 2.7, Math.cos(a) * 2.7]
      p0.at = [-1.6 + 2.4 * Math.cos(a), 0, 2.4 + 0.9 * Math.sin(a)]
      p0.velocity = [vx, 0, vz]
      p0.heading = [vx / 2.7, 0, vz / 2.7]
      p0.facing = vx >= 0 ? 1 : -1
      p0.stride = t * 2.7
      // A walk up to the ledge's side and a jump up onto its top, then a turn to the viewer; and again.
      const k = t % 2.4
      if (k < 0.8) {
        p1.at = [2.8 + 0.5 * k, 0, 3.2]
        p1.velocity = [0.6, 0, 0]
        p1.heading = [1, 0, 0]
        p1.stride = k * 0.6
        p1.on = floor.id
      } else if (k < 1.3) {
        const j = (k - 0.8) / 0.5
        p1.at = [3.2 + 1.2 * j, 0.9 * j + 1.2 * j * (1 - j), 3.2]
        p1.velocity = [2.4, 3.3 - 6.6 * j, 0]
        p1.heading = [1, 0, 0]
        p1.on = null
        p1.jumpedAt = t - (k - 0.8)
      } else {
        p1.at = [4.4, 0.9, 3.2]
        p1.velocity = [0, 0, 0]
        p1.heading = [0, 0, 1]
        p1.on = ledge.id
        p1.landedAt = t - (k - 1.3)
        p1.landSpeed = 4
      }
      // Pushing the heavy box back toward the far wall, then back to start.
      const push = (t * 0.6) % 1.2
      p2.at = [2, 0, -1.6 - push]
      p2.stride = t * 0.6
      w.things[2]!.at = [2, 0, p2.at[2] - 0.75]
      // Carrying the crate along x, bonked now and then.
      p3.at = [5 - ((t * 1.2) % 3), 0, 0]
      p3.velocity = [-1.2, 0, 0]
      p3.stride = t * 1.2
      p3.bonkedUntil = t % 5 < 1.2 ? t - (t % 5) + 1.2 : -Infinity
      // The ball rolls across the middle of the floor and round.
      const r = (t * 1.5) % 5
      ball.at = [-6.5 + r, 0, -0.2]
      ball.velocity = [1.5, 0, 0]
      ball.roll = (t * 1.5) / 0.3
      w.movers[0]!.turn = t * 0.6
      w.decor.find((d) => d.model === b.model('windmill'))!.parts.blades = { from: [0, 0, t * 0.8], to: [0, 0, t * 0.8], start: 0, secs: 0 }
      popEvery(w, t, 1.5, [6, 1.6, -0.8], 1)
      w.shakes = t % 4 < 0.5 ? [{ strength: 0.6, born: t - (t % 4), serial: 1 }] : []
      puffs(w, t, dt, [2.2, 0.6, 3], 'confetti', '#ff86c0', 1.2, 14)
    },
  }
}

const MAKERS: Record<FixtureName, () => Fixture> = { meadow, workshop, night, small, courtyard }

/** A fixture, made fresh. */
export function fixture(name: FixtureName): Fixture {
  return MAKERS[name]()
}

// ------------------------------------------------------------------------------ what the kids wear

const KID = proportions({ body: 'kid', height: KID_HEIGHT, build: 1 })
const { main: MAIN, second: SECOND } = GIFT_MARKERS

/** Something for every slot but the hair, built round the model kid in the marker colours (engine/gift.ts SLOT_REF), by its id: the starting wardrobe has none for the body, the back or the hand. */
export const FIXTURE_WORN: Readonly<Record<string, Recipe>> = {
  'fixture:crown': model('crown', (m) => {
    m.cylinder(0.17, 0.15, 0.1, { at: [0, 0.2, 0], color: MAIN })
    for (let i = 0; i < 5; i++) m.cone(0.04, 0.09, { at: [Math.cos((i * 2 * Math.PI) / 5) * 0.15, 0.29, Math.sin((i * 2 * Math.PI) / 5) * 0.15], color: SECOND })
  }),
  'fixture:glasses': model('glasses', (m) => {
    for (const x of [-0.07, 0.07]) m.torus(0.05, 0.012, { at: [x, 0.02, 0.17], color: MAIN })
    m.box(0.05, 0.012, 0.012, { at: [0, 0.03, 0.17], color: MAIN })
  }),
  'fixture:belt': model('belt', (m) => {
    m.cylinder(KID.torsoW / 2 + 0.02, KID.torsoW / 2 + 0.03, 0.08, { at: [0, KID.hipY + 0.04, 0], scale: [1, 1, KID.torsoD / KID.torsoW], color: MAIN })
    m.box(0.08, 0.07, 0.03, { at: [0, KID.hipY + 0.04, KID.torsoD / 2 + 0.03], color: SECOND })
  }),
  'fixture:backpack': model('backpack', (m) => {
    m.box(0.24, 0.28, 0.12, { at: [0, -0.1, -0.08], color: MAIN })
    m.box(0.18, 0.1, 0.05, { at: [0, -0.16, -0.16], color: SECOND })
  }),
  'fixture:wand': model('wand', (m) => {
    m.cylinder(0.015, 0.015, 0.36, { at: [0, 0.18, 0], color: SECOND })
    m.sphere(0.06, { at: [0, 0.38, 0], color: MAIN })
  }),
}

/** What every kid wears with ?worn: hair and a thing in every other slot, in their seat's colours. */
export function fixtureWear(seat: SeatIndex): Partial<Record<Slot, Wearing>> {
  const w = (id: string): Wearing => ({ id, main: SEAT_COLORS[seat], second: '#ffffff', pattern: 'plain' })
  return { hair: { id: 'own:hair-curly', main: HAIR[seat]!, second: '#ffffff', pattern: 'plain' }, head: w('fixture:crown'), face: w('fixture:glasses'), body: w('fixture:belt'), back: w('fixture:backpack'), hand: w('fixture:wand') }
}

// ------------------------------------------------------------------------------ the looks

/** A look written by hand, as the look's builder gives one back (engine/look.ts LookBuilt), its pieces counted as LOOK_BUDGET counts them. */
class LookData {
  readonly built: LookBuilt = { models: [], wallpaper: null, dressed: [], decor: [], props: [], lights: [], lamps: [], notes: [], counts: { pieces: 0, props: 0, answering: 0, quarters: 0, lights: 0, lamps: 0, leftOut: 0, of: 0 } }
  private readonly ids = new Map<Recipe, ModelId>()

  constructor(private readonly view: RoomView) {}

  private model(r: Recipe, copies: number): ModelId {
    this.built.counts.pieces += 1 + r.shapes.length * copies
    let id = this.ids.get(r)
    if (id === undefined) {
      id = this.built.models.length
      this.built.models.push(r)
      this.ids.set(r, id)
    }
    return id
  }

  wallpaper(r: Recipe) {
    this.built.wallpaper = this.model(r, wallpaperSpots(this.view).length)
  }
  dress(s: Solid, r: Recipe) {
    this.built.dressed.push({ solid: s.id, model: this.model(r, 1) })
  }
  decor(at: Vec3, r: Recipe, scale = 1, turn = 0) {
    this.built.decor.push({ at, model: this.model(r, 1), scale, turn })
  }
  prop(at: Vec3, r: Recipe, o: PropOpts) {
    this.built.props.push({ at, model: this.model(r, 1), scale: o.scale ?? 1, turn: o.turn ?? 0, react: o.react ?? 'wobble', idle: o.idle ?? null, sound: o.sound ?? null, puff: o.puff ?? null })
  }
  lights(points: readonly Vec3[], colors: readonly string[], size: number, twinkle: boolean) {
    this.built.counts.pieces += 1
    points.forEach((at, i) => this.built.lights.push({ at, color: colors[i % colors.length]!, size, twinkle }))
  }
  lamp(at: Vec3, color: string, power: number, reach: number) {
    this.built.counts.pieces += 1
    this.built.lamps.push({ at, color, power, reach })
  }

  done(): LookBuilt {
    const c = this.built.counts
    c.props = c.answering = this.built.props.length
    c.lights = this.built.lights.length
    c.lamps = this.built.lamps.length
    c.quarters = new Set(this.built.props.map((p) => (p.at[0] >= 0 ? 1 : 0) + ((this.view === 'side' ? p.at[1] >= 4 : p.at[2] >= 0) ? 2 : 0))).size
    return this.built
  }
}

/** A number in [0, 1) for i, the same every time: where a star or a jar goes. */
const spread = (i: number, k: number) => {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453
  return v - Math.floor(v)
}

const LOOK_MODELS = {
  flowerMotif: model('flower motif', (m) => {
    for (let i = 0; i < 5; i++) m.sphere(0.1, { at: [Math.cos((i * 2 * Math.PI) / 5) * 0.13, Math.sin((i * 2 * Math.PI) / 5) * 0.13, 0], color: '#ffffff' })
    m.sphere(0.08, { at: [0, 0, 0.02], color: '#ffd23a' })
  }),
  sunflower: model('sunflower', (m) => {
    m.cylinder(0.04, 0.05, 1.1, { at: [0, 0.55, 0], color: '#3f9e3a' })
    m.sphere(0.12, { at: [0.12, 0.5, 0], scale: [1.6, 0.5, 0.8], color: '#4caf50' })
    for (let i = 0; i < 8; i++) m.sphere(0.1, { at: [Math.cos((i * Math.PI) / 4) * 0.17, 1.25 + Math.sin((i * Math.PI) / 4) * 0.17, 0], scale: [1, 1, 0.4], color: '#ffc928' })
    m.cylinder(0.12, 0.12, 0.08, { at: [0, 1.25, 0.03], rot: [Math.PI / 2, 0, 0], color: '#7a4a1e' })
  }),
  butterfly: model('butterfly', (m) => {
    m.capsule(0.03, 0.18, { at: [0, 0, 0], color: '#3a2a1e' })
    for (const s of [-1, 1]) {
      m.sphere(0.14, { at: [s * 0.14, 0.05, 0], scale: [1, 1.1, 0.15], color: '#ff86c0' })
      m.sphere(0.09, { at: [s * 0.11, -0.12, 0], scale: [1, 1, 0.15], color: '#c38bff' })
    }
  }),
  birdhouse: model('birdhouse', (m) => {
    m.cylinder(0.04, 0.04, 1.4, { at: [0, 0.7, 0], color: '#8a5a3a' })
    m.box(0.4, 0.4, 0.36, { at: [0, 1.6, 0], color: '#5aa9ff' })
    m.cone(0.34, 0.25, { at: [0, 1.92, 0], color: '#d9534f' })
    m.cylinder(0.07, 0.07, 0.02, { at: [0, 1.62, 0.19], rot: [Math.PI / 2, 0, 0], color: '#2b2b30' })
  }),
  snail: model('snail', (m) => {
    m.capsule(0.08, 0.35, { at: [0, 0.08, 0], rot: [0, 0, Math.PI / 2], color: '#e8c9a0' })
    m.sphere(0.17, { at: [-0.05, 0.25, 0], color: '#d9984a' })
    m.torus(0.1, 0.035, { at: [-0.05, 0.25, 0.12], color: '#a8682c' })
    for (const z of [-0.04, 0.04]) m.cylinder(0.012, 0.012, 0.14, { at: [0.22, 0.22, z], color: '#e8c9a0' })
  }),
  fence: model('fence', (m) => {
    for (let i = 0; i < 5; i++) m.box(0.12, 0.9, 0.05, { at: [-0.8 + i * 0.4, 0.45, 0], color: '#ffffff' })
    for (const y of [0.3, 0.65]) m.box(1.9, 0.08, 0.04, { at: [0, y, -0.04], color: '#f0f0f0' })
  }),
  planter: model('hanging plant', (m) => {
    m.cylinder(0.01, 0.01, 0.8, { at: [0, -0.4, 0], color: '#8a5a3a' })
    m.cylinder(0.2, 0.15, 0.25, { at: [0, -0.9, 0], color: '#d9734a' })
    for (const [x, y, z] of [[-0.12, -0.75, 0.05], [0.1, -0.72, 0], [0, -0.68, -0.08], [0.14, -0.95, 0.1], [-0.15, -1, 0.08]] as const) m.sphere(0.12, { at: [x, y, z], color: '#43a047' })
  }),
  bed: model('flower bed', (m) => {
    m.box(2, 0.85, 2, { at: [0, 0.425, 0], color: '#9a6b43' })
    m.box(2.04, 0.1, 2.04, { at: [0, 0.8, 0], color: '#7a5030' })
    m.box(1.8, 0.15, 1.8, { at: [0, 0.925, 0], color: '#5aa83c' })
  }),
  moon: model('moon', (m) => {
    m.sphere(0.55, { color: '#fff3c0', glow: true })
    m.sphere(0.12, { at: [0.18, 0.15, 0.45], color: '#e8dca8' })
    m.sphere(0.08, { at: [-0.2, -0.12, 0.48], color: '#e8dca8' })
  }),
  hangingStar: model('hanging star', (m) => {
    m.cylinder(0.008, 0.008, 0.7, { at: [0, -0.35, 0], color: '#c9b8ff' })
    const pts: number[][] = []
    for (let i = 0; i < 10; i++) pts.push([Math.cos(Math.PI / 2 + (i * Math.PI) / 5) * (i % 2 === 0 ? 0.25 : 0.11), -0.95 + Math.sin(Math.PI / 2 + (i * Math.PI) / 5) * (i % 2 === 0 ? 0.25 : 0.11)])
    m.extrude(pts, 0.08, { color: '#ffe066', glow: true })
  }),
  owl: model('owl', (m) => {
    m.sphere(0.25, { at: [0, 0.28, 0], scale: [1, 1.2, 0.9], color: '#8a6a4a' })
    m.sphere(0.15, { at: [0, 0.3, 0.12], scale: [1, 1.2, 0.5], color: '#d9c7a3' })
    for (const x of [-0.08, 0.08]) {
      m.sphere(0.07, { at: [x, 0.42, 0.18], color: '#ffffff' })
      m.sphere(0.035, { at: [x, 0.42, 0.24], color: '#2b2b30' })
      m.cone(0.05, 0.1, { at: [x * 1.6, 0.58, 0], color: '#8a6a4a' })
    }
    m.cone(0.03, 0.06, { at: [0, 0.35, 0.24], rot: [Math.PI, 0, 0], color: '#ffb35a' })
  }),
  planet: model('planet', (m) => {
    m.sphere(0.4, { color: '#ff9a5a' })
    m.torus(0.6, 0.04, { rot: [Math.PI / 2.4, 0, 0], color: '#ffd9a0' })
  }),
  jar: model('firefly jar', (m) => {
    m.cylinder(0.14, 0.14, 0.3, { at: [0, 0.15, 0], color: '#bfe8ff' })
    m.cylinder(0.15, 0.15, 0.05, { at: [0, 0.32, 0], color: '#8a5a3a' })
    for (const [x, y] of [[-0.05, 0.1], [0.05, 0.18], [0, 0.24]] as const) m.sphere(0.03, { at: [x, y, 0.1], color: '#fff36b', glow: true })
  }),
  sunMotif: model('sun motif', (m) => {
    m.sphere(0.13, { color: '#ffd23a' })
    for (let i = 0; i < 8; i++) m.box(0.05, 0.12, 0.03, { at: [Math.cos((i * Math.PI) / 4) * 0.22, Math.sin((i * Math.PI) / 4) * 0.22, 0], rot: [0, 0, (i * Math.PI) / 4 - Math.PI / 2], color: '#ff9a3a' })
  }),
  pot: model('potted flower', (m) => {
    m.cylinder(0.22, 0.16, 0.35, { at: [0, 0.175, 0], color: '#c96a3a' })
    m.cylinder(0.02, 0.02, 0.4, { at: [0, 0.55, 0], color: '#3f9e3a' })
    for (let i = 0; i < 5; i++) m.sphere(0.07, { at: [Math.cos((i * 2 * Math.PI) / 5) * 0.09, 0.78, Math.sin((i * 2 * Math.PI) / 5) * 0.09], color: '#ff5a7e' })
    m.sphere(0.06, { at: [0, 0.8, 0], color: '#ffd23a' })
  }),
  cat: model('cat', (m) => {
    m.capsule(0.15, 0.3, { at: [0, 0.2, 0], rot: [0, 0, Math.PI / 2], color: '#ff9a3a' })
    m.sphere(0.15, { at: [0.3, 0.38, 0], color: '#ff9a3a' })
    for (const z of [-0.07, 0.07]) m.cone(0.05, 0.1, { at: [0.32, 0.55, z], color: '#ff9a3a' })
    m.cylinder(0.03, 0.03, 0.35, { at: [-0.32, 0.4, 0], rot: [0, 0, 0.5], color: '#ff9a3a' })
  }),
  pinwheel: model('pinwheel', (m) => {
    m.cylinder(0.02, 0.02, 1.2, { at: [0, 0.6, 0], color: '#ffffff' })
    for (let i = 0; i < 4; i++) m.box(0.3, 0.12, 0.02, { at: [Math.cos((i * Math.PI) / 2) * 0.16, 1.2 + Math.sin((i * Math.PI) / 2) * 0.16, 0.03], rot: [0, 0, (i * Math.PI) / 2], color: ['#ff5a4e', '#3d8bff', '#ffd23a', '#2fc46a'][i]! })
  }),
  fountain: model('fountain', (m) => {
    m.cylinder(0.45, 0.5, 0.25, { at: [0, 0.125, 0], color: '#c9ced6' })
    m.cylinder(0.38, 0.38, 0.05, { at: [0, 0.24, 0], color: '#5ab4ff' })
    m.cylinder(0.06, 0.08, 0.5, { at: [0, 0.45, 0], color: '#c9ced6' })
    m.sphere(0.12, { at: [0, 0.75, 0], color: '#8fdcf5' })
  }),
  bench: model('bench', (m) => {
    m.box(1.4, 0.08, 0.4, { at: [0, 0.42, 0], color: '#a0703a' })
    m.box(1.4, 0.3, 0.06, { at: [0, 0.65, -0.18], color: '#a0703a' })
    for (const x of [-0.6, 0.6]) m.box(0.08, 0.42, 0.36, { at: [x, 0.21, 0], color: '#5a3a1e' })
  }),
  barrel: model('barrel', (m) => {
    m.cylinder(0.3, 0.3, 0.7, { at: [0, 0.35, 0], color: '#9a6b43' })
    for (const y of [0.12, 0.58]) m.torus(0.3, 0.02, { at: [0, y, 0], rot: [Math.PI / 2, 0, 0], color: '#5a6470' })
  }),
  log: model('log', (m) => {
    m.cylinder(0.2, 0.2, 3, { at: [0, 0.2, 0], rot: [0, 0, Math.PI / 2], color: '#7a5a3a' })
    for (const x of [-1.5, 1.5]) m.cylinder(0.17, 0.17, 0.02, { at: [x, 0.2, 0], rot: [0, 0, Math.PI / 2], color: '#c9a77a' })
    for (const [x, z] of [[-0.9, 0.5], [0.4, -0.6], [1.1, 0.4]] as const) m.sphere(0.12, { at: [x, 0.3, z], color: '#5cbf4a' })
  }),
  deck: model('deck', (m) => {
    for (let i = 0; i < 8; i++) m.box(0.48, 1, 2, { at: [-1.75 + i * 0.5, 0.5, 0], color: i % 2 === 0 ? '#b08250' : '#a0743f' })
  }),
}

/** The garden room's look: flowers on the walls, a fence and hanging plants behind the play, the middle box dressed as a flower bed, sunflowers, a birdhouse, butterflies and snails that answer, and fairy lights under the ceiling. */
function meadowLook(world: World): LookBuilt {
  const l = new LookData('side')
  const M = LOOK_MODELS
  l.wallpaper(M.flowerMotif)
  for (const x of [-7, -5, -3, -1, 1, 3, 5, 7]) l.decor([x, 0, -2.75], M.fence)
  for (const x of [-6.5, -2.5, 3.5]) l.decor([x, 8, -2.4], M.planter)
  l.dress(world.solids[1]!, M.bed)
  l.prop([-7.4, 0, -1.6], M.sunflower, { react: 'wobble', idle: 'sway', sound: 'pluck', puff: 'leaf' })
  l.prop([0.6, 0, -1.6], M.sunflower, { react: 'wobble', idle: 'sway', sound: 'pluck', puff: 'leaf' })
  l.prop([-4.4, 0, -2.2], M.birdhouse, { react: 'hop', sound: 'tweet', puff: 'note' })
  l.prop([-4.2, 0, 1.2], M.snail, { react: 'hop', idle: 'bob', sound: 'squish' })
  l.prop([2.8, 0, 1.25], M.snail, { react: 'hop', idle: 'bob', sound: 'squish', turn: Math.PI })
  for (const [x, y] of [[-6, 5.2], [-3.2, 6.6], [2.2, 6], [6.6, 5.6]] as const) l.prop([x, y, -2.3], M.butterfly, { react: 'spin', idle: 'bob', sound: 'sparkle', puff: 'heart' })
  l.lights(Array.from({ length: 31 }, (_, i): Vec3 => [-7.5 + i * 0.5, 7.55 - 0.12 * Math.sin(i * 1.3), -2.6]), ['#ffe9a0', '#ff86c0', '#9ad0ff', '#b9f58a'], 0.18, true)
  l.lamp([0, 7, -2], '#fff1c0', 0.7, 8)
  return l.done()
}

/** The night room's look: a sky of twinkling stars on the walls, a glowing moon and hanging stars, owls on the trees, a planet and firefly jars. */
function nightLook(world: World): LookBuilt {
  const l = new LookData('side')
  const M = LOOK_MODELS
  l.dress(world.solids[0]!, M.log)
  l.lights(Array.from({ length: 220 }, (_, i): Vec3 => [-7.8 + 15.6 * spread(i, 1), 2.4 + 5.4 * spread(i, 2), -2.92]), ['#ffffff', '#fff3b0', '#c0e0ff'], 0.16, true)
  l.prop([5.6, 6.6, -2.7], M.moon, { react: 'blink', idle: 'pulse', sound: 'chime', puff: 'star' })
  for (const [x, y] of [[-6, 8], [-2.6, 8], [0.8, 8], [4, 8]] as const) l.prop([x, y, -2], M.hangingStar, { react: 'swing', idle: 'sway', sound: 'sparkle', puff: 'star' })
  l.prop([-7, 3.05, -1.6], M.owl, { react: 'hop', sound: 'tweet', puff: 'note' })
  l.prop([3, 3.05, -1.6], M.owl, { react: 'hop', sound: 'tweet', puff: 'note' })
  l.prop([-3.6, 5.6, -2.6], M.planet, { react: 'spin', idle: 'spin', sound: 'xylophone' })
  for (const x of [-7.4, 1.8, 6.8]) l.prop([x, 0, 1.3], M.jar, { react: 'blink', idle: 'pulse', sound: 'bubbles' })
  l.lamp([-6, 7.6, -2], '#c0d8ff', 0.6, 6)
  return l.done()
}

/** The courtyard's look, from high up: suns on the walls, benches and barrels along them, the terrace dressed as a deck, potted flowers, a cat, pinwheels and a fountain that answer, and lights along the walls' tops. */
function courtyardLook(world: World): LookBuilt {
  const l = new LookData('high')
  const M = LOOK_MODELS
  l.wallpaper(M.sunMotif)
  l.dress(world.solids[0]!, M.deck)
  l.decor([0.8, 0, -3.7], M.bench)
  l.decor([-6.65, 0, -0.2], M.bench, 1, Math.PI / 2)
  for (const [x, z] of [[6.6, -2.4], [6.6, 3.6], [-6.6, 3.5]] as const) l.decor([x, 0, z], M.barrel)
  for (const [x, z] of [[-6.6, -3.6], [-3.6, -3.65], [3.6, -3.65], [6.6, 1.2]] as const) l.prop([x, 0, z], M.pot, { react: 'wobble', idle: 'sway', sound: 'pluck', puff: 'leaf' })
  l.prop([-6.5, 0, 2.4], M.cat, { react: 'hop', idle: 'bob', sound: 'giggles', puff: 'heart', turn: -Math.PI / 2 })
  l.prop([6.5, 0, -1.2], M.pinwheel, { react: 'spin', idle: 'spin', sound: 'whoosh' })
  l.prop([-1.6, 0, 3.7], M.pinwheel, { react: 'spin', idle: 'spin', sound: 'whoosh' })
  l.prop([0.6, 0, 3.4], M.fountain, { react: 'hop', idle: 'pulse', sound: 'plop', puff: 'drop' })
  const tops: Vec3[] = []
  for (let x = -6.8; x <= 6.81; x += 0.5) tops.push([x, 2.45, -4.15])
  for (let z = -3.8; z <= 4.01; z += 0.5) tops.push([-7.15, 2.45, z], [7.15, 2.45, z])
  l.lights(tops, ['#ffe9a0', '#ffb35a'], 0.2, true)
  l.lamp([0, 2.2, -3.4], '#fff1c0', 0.6, 6)
  return l.done()
}

/**
 * The heaviest look the limits allow, on the meadow: LOOK_BUDGET.props props of 12 shapes in all four
 * quarters, decor of 20 shapes in rows behind the play up to LOOK_BUDGET.pieces, a wallpaper of
 * LOOK_BUDGET.motifShapes shapes, LOOK_BUDGET.lights small lights and lamps up to BUDGET.lamps with
 * the room's. Round shapes, the most triangles a kit shape has, for the heaviest mesh.
 */
function heaviestLook(world: World): LookBuilt {
  const l = new LookData('side')
  l.wallpaper(model('heavy motif', (m) => {
    for (let i = 0; i < LOOK_BUDGET.motifShapes; i++) m.sphere(0.05, { at: [Math.cos((i * 2 * Math.PI) / LOOK_BUDGET.motifShapes) * 0.2, Math.sin((i * 2 * Math.PI) / LOOK_BUDGET.motifShapes) * 0.2, 0], color: i % 2 === 0 ? '#ffffff' : '#ffd23a' })
  }))
  const toy = model('heavy toy', (m) => {
    for (let i = 0; i < 6; i++) m.sphere(0.08, { at: [0, 0.08 + i * 0.12, 0], color: ['#ff5a4e', '#ffd23a', '#3d8bff'][i % 3]! })
    for (let i = 0; i < 6; i++) m.cylinder(0.05, 0.07, 0.1, { at: [0.12 * Math.cos(i), 0.05, 0.12 * Math.sin(i)], color: '#2fc46a' })
  })
  const xs = [-7.2, -6, -4.8, -3.6, -2.4, -1.2, 1.2, 2.4, 3.6, 4.8, 6, 7.2]
  ;[0, 1.8, 4.6, 6.4].forEach((y, row) => xs.forEach((x, k) => l.prop([x, y, -1.8], toy, { react: REACTS[(row + k) % REACTS.length]!, idle: IDLES[(row + k) % IDLES.length]!, sound: 'pop', puff: 'star' })))
  const jars = model('heavy jars', (m) => {
    for (let i = 0; i < 10; i++) m.sphere(0.06, { at: [-0.3 + i * 0.066, 0.06, 0], color: '#bfe8ff' })
    for (let i = 0; i < 10; i++) m.cylinder(0.025, 0.03, 0.08, { at: [-0.3 + i * 0.066, 0.16, 0], color: '#8a5a3a' })
  })
  const left = (n: number) => LOOK_BUDGET.pieces - n
  let i = 0
  const lampsLeft = BUDGET.lamps - world.lamps.length
  for (; left(l.built.counts.pieces + 2 + lampsLeft) >= 1 + jars.shapes.length; i++) l.decor([-7.6 + (i % 20) * 0.8, 0.3 + Math.floor(i / 20) * 1.5, -2.7], jars)
  l.lights(Array.from({ length: LOOK_BUDGET.lights }, (_, k): Vec3 => [-7.9 + (k % 40) * 0.4, 0.4 + Math.floor(k / 40) * 0.78, -2.95]), ['#fff6c0', '#c0e0ff', '#ffc0e0'], 0.2, true)
  for (let k = 0; k < lampsLeft; k++) l.lamp([-7 + (k * 14) / Math.max(1, lampsLeft - 1), 7.4, -1.5], '#ffe0a0', 0.6 + 0.04 * k, 6)
  return l.done()
}

export type FixtureLook = 'dressed' | 'heaviest'

/** A fixture's look by its name, on that fixture's world: the dressed one for meadow, night and courtyard, the heaviest for meadow. */
export function fixtureLook(name: FixtureName, which: FixtureLook, world: World): LookBuilt {
  if (which === 'heaviest' && name === 'meadow') return heaviestLook(world)
  if (which === 'dressed' && name === 'meadow') return meadowLook(world)
  if (which === 'dressed' && name === 'night') return nightLook(world)
  if (which === 'dressed' && name === 'courtyard') return courtyardLook(world)
  throw new Error(`the scene's fixture ${name} has no ${which} look: meadow, night and courtyard are dressed, and meadow has the heaviest`)
}
