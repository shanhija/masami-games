/**
 * The world around the machines: making a whole `Sim`, the things a fork or a hook carries,
 * the hoppers and the plants that change stuff, the forms and the ponds, and the coins that ring.
 * Machines call the primitives here (`pickThing`, `setDownThing`, `hopperIn`, `pourConcrete`,
 * `award`); `stepWorld` runs what needs no machine once a frame. This file imports no machine
 * code, so `machines.ts` can import it.
 */

import { BUILDS, BUILD_HALF, ENTRY, FORMS, HUT, LOTS, PALLET_RING, PLANTS, POND_AT, RING_SLOTS, RIVER } from './map'
import { COINS, DAY_OF, MACHINE_KINDS, MACHINE_SPECS, MIXER_SAND, THING_HEIGHT, newMachine } from './model'
import type { Animal, ChapterId, Holder, Machines, Mode, PlantId, Sim, Species, Thing, ThingKind, Zone } from './model'
import { PLANT_IDS } from './model'
import { clamp, clamp01, mulberry32, turnTo } from './math'
import { createTerrain, heightAt, pondY, setSurface, spill } from './terrain'

/** The deck rises from the ground over this many metres at each end. */
export const DECK_RAMP = 2.5
/** A piece is placed when a thing is let go within this far of the next open spot. */
export const PLACE_RADIUS = 2.5
/** Seconds a full form takes to set, and a pond to fill. */
const SET_FOR = 2.5
const FILL_FOR = 3
/** The concrete one form takes: the least a mixer can mix (nine tenths of a drum), so any batch fills one. */
const FORM_VOLUME = 0.9 * MIXER_SAND

/** The surface height a machine or a thing rides on: the ground, or a built deck over the river. */
export function groundY(s: Sim, x: number, z: number): number {
  let y = heightAt(s.terrain, x, z)
  for (const d of s.decks) {
    if (x < d.x0 || x > d.x1 || z < d.z0 || z > d.z1) continue
    y = Math.max(y, d.y * clamp01(Math.min(z - d.z0, d.z1 - z) / DECK_RAMP))
  }
  return y
}

/** Adds coins and rings once for every whole coin gained. */
export function award(s: Sim, amount: number, x: number, y: number, z: number): void {
  const before = Math.floor(s.score.coins)
  s.score.coins += amount
  const whole = Math.floor(s.score.coins) - before
  if (whole > 0) s.events.push({ kind: 'coin', amount: whole, x, y, z })
}

/** Everything a frame starts with: no streams, the water tower off. Machines add what they do. */
export function beginWorld(s: Sim): void {
  s.streams.length = 0
  s.watering = false
}

// ---------------------------------------------------------------------------------------
// Things.

/** A new thing standing on the ground. */
export function spawnThing(s: Sim, kind: ThingKind, x: number, z: number): Thing {
  const thing: Thing = { id: s.nextThing++, kind, x, y: groundY(s, x, z), z, yaw: 0, heldBy: null, gone: false }
  s.things.push(thing)
  return thing
}

export function thingById(s: Sim, id: number): Thing {
  const thing = s.things.find((t) => t.id === id)
  if (thing === undefined) throw new Error(`no thing with id ${id}`)
  return thing
}

/**
 * The nearest free thing within `reach` metres across of (x, y, z) and `reachY` up or down:
 * a hook holds a thing by its top, forks by its foot. It becomes held by `holder`. Returns its
 * id, or -1 when there is none.
 */
export function pickThing(s: Sim, holder: Holder, x: number, y: number, z: number, reach: number, reachY: number): number {
  let best: Thing | null = null
  let bestD = reach
  for (const t of s.things) {
    if (t.gone || t.heldBy !== null) continue
    const held = holder === 'forklift' ? t.y + 0.2 : t.y + THING_HEIGHT[t.kind]
    const d = Math.hypot(t.x - x, t.z - z)
    if (d <= bestD && Math.abs(held - y) <= reachY) {
      best = t
      bestD = d
    }
  }
  if (best === null) return -1
  best.heldBy = holder
  s.events.push({ kind: 'pick', x: best.x, y: best.y, z: best.z, thing: best.kind })
  award(s, COINS.pick, best.x, best.y, best.z)
  return best.id
}

/** The rings a thing can be set down in: the pallet ring and every carry step's ring of the job under way. */
function ringsOf(s: Sim): Zone[] {
  const rings: Zone[] = [PALLET_RING]
  if (s.job !== null) for (const step of s.job.job.steps) if (step.kind === 'carry') rings.push(step.ring)
  return rings
}

/** A machine whose middle is this close to a slot would stand in what is put there. */
const SLOT_CLEAR = 1.3

/** The offset from a ring's middle where `thing` settles when let go over (x, z): the nearest slot that nobody lies in and no machine stands in, else the nearest nobody lies in, else a slot by how many lie free. */
function ringSlot(s: Sim, thing: Thing, ring: Zone, x: number, z: number): readonly [x: number, z: number] {
  const open = RING_SLOTS.filter(([ox, oz]) => !s.things.some((o) => o !== thing && !o.gone && o.heldBy === null && Math.hypot(o.x - (ring.x + ox), o.z - (ring.z + oz)) < 0.8))
  const nearest = (slots: readonly (readonly [number, number])[]) => [...slots].sort((p, q) => Math.hypot(ring.x + p[0] - x, ring.z + p[1] - z) - Math.hypot(ring.x + q[0] - x, ring.z + q[1] - z))[0]
  const clear = open.filter(([ox, oz]) => !Object.values(s.machines).some((m) => m.unlocked && Math.hypot(m.x - (ring.x + ox), m.z - (ring.z + oz)) < SLOT_CLEAR))
  if (clear.length > 0) return nearest(clear)
  if (open.length > 0) return nearest(open)
  return RING_SLOTS[s.things.filter((o) => !o.gone && o.heldBy === null).length % RING_SLOTS.length]
}

/**
 * Lets go of a held thing over (x, z). Within PLACE_RADIUS of the next open spot of a shown
 * building that wants its kind it becomes that piece. In a ring it takes the next free slot.
 * Otherwise it lands on the surface. Returns the index of the building it was placed in, or -1.
 */
export function setDownThing(s: Sim, thing: Thing, x: number, z: number): number {
  thing.heldBy = null
  for (const b of s.builds) {
    if (!b.shown || b.placed >= b.spots.length) continue
    const spot = b.spots[b.placed]
    if (spot.wants !== thing.kind || Math.hypot(x - spot.x, z - spot.z) > PLACE_RADIUS) continue
    thing.gone = true
    b.placed++
    b.placedAt = s.time
    s.events.push({ kind: 'place', x: spot.x, y: spot.y, z: spot.z, build: b.id })
    award(s, COINS.place, spot.x, spot.y, spot.z)
    return b.id
  }
  let px = x
  let pz = z
  for (const ring of ringsOf(s)) {
    if (Math.hypot(x - ring.x, z - ring.z) > ring.r) continue
    const [ox, oz] = ringSlot(s, thing, ring, x, z)
    px = ring.x + ox
    pz = ring.z + oz
    break
  }
  thing.x = px
  thing.z = pz
  thing.y = groundY(s, px, pz)
  s.events.push({ kind: 'drop', x: px, y: thing.y, z: pz, thing: thing.kind })
  return -1
}

/** Puts a free thing in `ring`, in the next free slot, as if it had been set down in it. */
export function placeInRing(s: Sim, thing: Thing, ring: Zone): void {
  const [ox, oz] = ringSlot(s, thing, ring, thing.x, thing.z)
  thing.x = ring.x + ox
  thing.z = ring.z + oz
  thing.y = groundY(s, thing.x, thing.z)
}

// ---------------------------------------------------------------------------------------
// Plants, forms, ponds.

/** A hopper eats whatever loose stuff falls in. The sawmill takes only logs, so loose stuff in its hopper is eaten and makes nothing. */
export function hopperIn(s: Sim, id: PlantId, amount: number): void {
  if (id !== 'saw') s.plants[id].stored += amount
}

/** Concrete (cubic metres) poured at (x, z): a shown, unset form there fills, anything else lands as loose concrete on the ground. */
export function pourConcrete(s: Sim, x: number, z: number, volume: number): void {
  let left = volume
  for (const f of s.forms) {
    const lot = LOTS[f.lot]
    if (!f.shown || f.hard || f.fill >= 1 || Math.abs(x - lot.x) > lot.w / 2 || Math.abs(z - lot.z) > lot.d / 2) continue
    const take = Math.min(left, (1 - f.fill) * FORM_VOLUME)
    f.fill = f.fill + take / FORM_VOLUME > 1 - 1e-9 ? 1 : f.fill + take / FORM_VOLUME
    left -= take
  }
  if (left > 1e-9) spill(s.terrain, x, z, 1.2, left, 'concrete')
}

/** The gravel a crusher's batch pours, `volume` cubic metres of it, onto its out slot. */
function pourGravel(s: Sim, id: PlantId, volume: number): void {
  const cfg = PLANTS[id]
  const slot = cfg.outSlots[s.plants[id].made % cfg.outSlots.length]
  spill(s.terrain, slot[0], slot[1], 1.8, volume, 'gravel')
}

/** A batch's things stand at the next free out slots. */
function dropBatch(s: Sim, id: PlantId, makes: ThingKind): void {
  const cfg = PLANTS[id]
  for (let k = 0; k < cfg.perBatch; k++) {
    const free = cfg.outSlots.filter(([x, z]) => !s.things.some((o) => !o.gone && o.heldBy === null && Math.hypot(o.x - x, o.z - z) < 1))
    const [x, z] = (free.length > 0 ? free : cfg.outSlots)[k % (free.length > 0 ? free.length : cfg.outSlots.length)]
    spawnThing(s, makes, x, z)
  }
}

/** Gives a plant `volume` of stuff and runs every batch it makes at once, leaving what they make where a played batch leaves it: the way a restored save is rebuilt. */
export function feedPlant(s: Sim, id: PlantId, volume: number): void {
  const p = s.plants[id]
  const cfg = PLANTS[id]
  p.stored += volume
  while (p.stored >= cfg.need - 1e-9) {
    p.stored -= cfg.need
    if (cfg.makes === 'gravel') pourGravel(s, id, cfg.perBatch)
    else dropBatch(s, id, cfg.makes)
    p.made++
  }
}

/** Plants work: a batch's gravel is poured while the crusher works and its things stand when it is done. */
function runPlants(s: Sim, dt: number): void {
  for (const id of PLANT_IDS) {
    const p = s.plants[id]
    const cfg = PLANTS[id]
    if (p.phase === 'work') {
      const before = p.t
      p.t += dt
      if (Math.floor(p.t / 0.4) !== Math.floor(before / 0.4)) s.events.push({ kind: 'plantThump', plant: id })
      const slot = cfg.outSlots[p.made % cfg.outSlots.length]
      if (cfg.makes === 'gravel') {
        const part = Math.min(p.t, cfg.workFor) - before
        if (part > 0) {
          pourGravel(s, id, (cfg.perBatch * part) / cfg.workFor)
          s.streams.push({ stuff: 'gravel', fromX: cfg.x, fromY: 2.4, fromZ: cfg.z, toX: slot[0], toY: groundY(s, slot[0], slot[1]), toZ: slot[1], rate: 1 })
        }
      }
      if (p.t >= cfg.workFor) {
        if (cfg.makes !== 'gravel') dropBatch(s, id, cfg.makes)
        p.made++
        p.phase = 'idle'
        p.t = 0
        s.events.push({ kind: 'plantDone', plant: id })
      }
    }
    if (p.phase === 'idle' && p.stored >= cfg.need - 1e-9) {
      p.stored -= cfg.need
      p.phase = 'work'
      p.t = 0
      s.events.push({ kind: 'plantStart', plant: id })
    }
  }
}

/** Plants run, full forms set, ponds fill, animals walk and the party plays. The jobs are stepped by the sim after this. */
export function stepWorld(s: Sim, dt: number): void {
  runPlants(s, dt)
  for (const f of s.forms) {
    if (!f.shown || f.hard || f.fill < 1 - 1e-9) continue
    f.setting += dt
    if (f.setting >= SET_FOR) {
      f.hard = true
      const lot = LOTS[f.lot]
      setSurface(s.terrain, { kind: 'rect', x: lot.x, z: lot.z, w: lot.w, d: lot.d }, 'slab')
      s.events.push({ kind: 'set', form: f.id })
    }
  }
  for (const p of s.ponds) {
    if (!p.shown || p.water >= 1) continue
    p.water = Math.min(1, p.water + dt / FILL_FOR)
    if (p.water >= 1) s.events.push({ kind: 'splash', x: p.x, z: p.z })
  }
  stepParty(s, dt)
  stepAnimals(s, dt)
}

// ---------------------------------------------------------------------------------------
// Animals and parties.

/** Seconds a chapter's party lasts, and the animals' walking pace (metres a second: a toy trot). */
export const PARTY_FOR = 14
const TROT = 3
/** Where each chapter's party gathers: the road's middle, Bunny's door, the town end of the bridge, the playground, the hall. */
export const PARTY_AT: Record<ChapterId, { x: number; z: number }> = {
  road: { x: 0, z: 26 },
  house: { x: -3, z: -2 },
  bridge: { x: 8, z: -24 },
  play: { x: 14, z: 38 },
  clock: { x: 22, z: -12 },
}
/** The slide a playing animal goes down: from the top (x0, z0, y0) to the foot (x1, z1, y1) in `SLIDE_FOR` seconds. */
export const PLAY_SLIDE = { x0: 16.2, z0: 42, y0: 2.5, x1: 20, z1: 42, y1: 0.1 } as const
const SLIDE_FOR = 1.6
/** The mood each animal takes on arriving at a party. */
const PARTY_MOOD: Record<ChapterId, Animal['mood']> = { road: 'lick', house: 'cheer', bridge: 'cheer', play: 'cheer', clock: 'cheer' }
/** Seconds Bunny and the others wave from a window after moving in. */
const WAVE_FOR = 7

/** How far into its party the town is, 0 to 1, and 0 when there is none. The scene runs each show from this and from `Party.t`. */
export function partyProgress(s: Sim): number {
  return s.party === null ? 0 : clamp01(s.party.t / PARTY_FOR)
}

/** A new animal standing at (x, z). Animals are never removed, so the id is its index. */
export function spawnAnimal(s: Sim, species: Species, x: number, z: number): Animal {
  const a: Animal = { id: s.animals.length, species, x, y: groundY(s, x, z), z, yaw: 0, goalX: x, goalZ: z, mood: 'idle', t: 0, home: -1, movingIn: false, stuck: 0, markX: x, markZ: z }
  s.animals.push(a)
  return a
}

/** Seconds the animal who moves in is given to get to her door, so she is in by the middle of the house party. */
const ARRIVE_IN = 7

/** The fastest an animal runs to her new house, metres a second: a bunny running home. An animal further than `RUN * ARRIVE_IN` = 56 m from her door is at her door after `distance / RUN` seconds, later than `ARRIVE_IN`, still before the party ends. */
const RUN = 8

/** How fast an animal who is moving in goes: the pace that brings her to her door when `ARRIVE_IN` seconds are up, never slower than a trot and never faster than a run. `Animal.t` counts the seconds since she set off. */
function moveInPace(a: Animal, left: number): number {
  return clamp(left / Math.max(ARRIVE_IN - a.t, 1e-3), TROT, RUN)
}

/** An animal of this species with no home walks to the building's door and moves in; a new one starts at the far end of the road, or nearer when that is further off than `ARRIVE_IN` seconds' walk (nobody sees it spawn). One that was already there keeps her place and hurries. */
export function moveIn(s: Sim, who: Species, build: number): void {
  const b = s.builds[build]
  const waiting = s.animals.find((o) => o.species === who && o.home < 0)
  const a = waiting ?? spawnAnimal(s, who, -46, 30)
  a.home = build
  a.goalX = b.x
  a.goalZ = b.z + BUILD_HALF[b.kind][1] + 1.2
  const far = Math.hypot(a.goalX - a.x, a.goalZ - a.z)
  const near = TROT * ARRIVE_IN
  if (waiting === undefined && far > near) {
    a.x = a.goalX + ((a.x - a.goalX) / far) * near
    a.z = a.goalZ + ((a.z - a.goalZ) / far) * near
    a.y = groundY(s, a.x, a.z)
  }
  a.mood = 'walk'
  a.t = 0
  a.movingIn = true
}

/** Where an animal stands at a chapter's party: a ring round its place, the duck in the pond, half of the others at the foot of the slide. */
function partyGoal(s: Sim, a: Animal, chapter: ChapterId): { x: number; z: number } {
  const at = PARTY_AT[chapter]
  const angle = a.id * 2.4
  if (chapter === 'play' && a.species === 'duck') return { x: s.ponds[0].x + Math.cos(angle) * 2.5, z: s.ponds[0].z + Math.sin(angle) * 2.5 }
  if (chapter === 'play' && a.id % 2 === 0) return { x: PLAY_SLIDE.x0, z: PLAY_SLIDE.z0 }
  const r = 2.5 + (a.id % 4) * 1.1
  return { x: at.x + Math.cos(angle) * r, z: at.z + Math.sin(angle) * r }
}

/** Starts a chapter's party: the camera goes to its place, the animals gather, the show plays. At the bridge's the cows and sheep set off one after the other. */
export function startParty(s: Sim, chapter: ChapterId): void {
  const at = PARTY_AT[chapter]
  s.party = { chapter, t: 0, x: at.x, z: at.z }
  s.events.push({ kind: 'party', chapter })
  if (chapter === 'play') while (s.animals.filter((a) => a.species === 'duck').length < 3) spawnAnimal(s, 'duck', s.ponds[0].x + 6, s.ponds[0].z)
  let line = 0
  for (const a of s.animals) {
    const far = a.z < RIVER.z0
    if (a.movingIn || (far && chapter !== 'bridge')) continue
    const g = partyGoal(s, a, chapter)
    a.goalX = g.x
    a.goalZ = g.z
    a.mood = far ? 'idle' : 'walk'
    a.t = far ? -0.8 * line++ : 0
  }
}

/** The party's clock, and the fireworks at the clock chapter's. */
function stepParty(s: Sim, dt: number): void {
  if (s.party === null) return
  const before = s.party.t
  s.party.t += dt
  if (s.party.chapter === 'clock' && s.party.t > 2 && Math.floor(s.party.t / 1.5) !== Math.floor(before / 1.5)) s.events.push({ kind: 'fireworks' })
}

/** A point on the same side of the river as the animal, near it (or near its door), and inside the world. */
function wanderGoal(a: Animal, s: Sim): { x: number; z: number } {
  const rnd = mulberry32(a.id * 977 + Math.floor(s.time * 4))
  const b = a.home >= 0 ? s.builds[a.home] : null
  const cx = b === null ? a.x : b.x
  const cz = b === null ? a.z : b.z + BUILD_HALF[b.kind][1] + 2
  const far = a.z < RIVER.z0
  const lo = far ? -47 : RIVER.z1 + 2
  const hi = far ? RIVER.z0 - 1.5 : 46
  return { x: clamp(cx + (rnd() - 0.5) * 10, -44, 44), z: clamp(cz + (rnd() - 0.5) * 10, lo, hi) }
}

/** Animals keep this far outside a machine's body circles: a hedgehog's width and a little more. */
export const ANIMAL_ROOM = 0.6

/** Where `pushOut` and `detour` leave their answers: one object each, reused, so a walking animal costs no garbage. */
const CLEAR = { x: 0, z: 0 }
const WAY = { x: 0, z: 0 }

/** Every body circle of every unlocked machine as numbers: the circle's middle, its radius with `ANIMAL_ROOM`, and the machine's yaw sine and cosine. Read off the machines once by `loadRooms` (a machine's fields cost a boxed number each read, nine shapes over), then walked by every animal in the frame. */
const ROOM_STRIDE = 5
const MAX_BODIES = MACHINE_KINDS.reduce((n, k) => n + MACHINE_SPECS[k].body.length, 0)
const ROOMS = new Float64Array(MAX_BODIES * ROOM_STRIDE)
let roomCount = 0

function loadRooms(s: Sim): void {
  roomCount = 0
  for (let k = 0; k < MACHINE_KINDS.length; k++) {
    const m = s.machines[MACHINE_KINDS[k]]
    if (!m.unlocked) continue
    const sin = Math.sin(m.yaw)
    const cos = Math.cos(m.yaw)
    const body = MACHINE_SPECS[m.kind].body
    for (let i = 0; i < body.length; i++) {
      const at = roomCount++ * ROOM_STRIDE
      ROOMS[at] = m.x + sin * body[i][0]
      ROOMS[at + 1] = m.z + cos * body[i][0]
      ROOMS[at + 2] = body[i][1] + ANIMAL_ROOM
      ROOMS[at + 3] = sin
      ROOMS[at + 4] = cos
    }
  }
}

/** Where a point goes to stand clear of the rooms `loadRooms` read, in the shared `CLEAR`. */
function pushOut(x: number, z: number): { x: number; z: number } {
  let px = x
  let pz = z
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < roomCount; i++) {
      const at = i * ROOM_STRIDE
      const cx = ROOMS[at]
      const cz = ROOMS[at + 1]
      const reach = ROOMS[at + 2]
      const dx = px - cx
      const dz = pz - cz
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d >= reach) continue
      // Dead centre it goes the way the machine faces.
      const ux = d < 1e-6 ? ROOMS[at + 3] : dx / d
      const uz = d < 1e-6 ? ROOMS[at + 4] : dz / d
      px = cx + ux * reach
      pz = cz + uz * reach
    }
  }
  CLEAR.x = px
  CLEAR.z = pz
  return CLEAR
}

/** Where a point goes to stand `ANIMAL_ROOM` clear of every machine's body, or the point itself when it is clear. The answer is a shared object, good until the next call. */
export function clearOfMachines(s: Sim, x: number, z: number): { x: number; z: number } {
  loadRooms(s)
  return pushOut(x, z)
}

/** True if a machine's room holds the point. */
function inRoom(x: number, z: number): boolean {
  const clear = pushOut(x, z)
  const dx = clear.x - x
  const dz = clear.z - z
  return Math.sqrt(dx * dx + dz * dz) > 1e-6
}

/** A walker that has not got PROGRESS metres from her mark for STUCK_FOR seconds walks straight through the machines for THROUGH_FOR seconds, then tries the detours again. */
const STUCK_FOR = 1.5
const THROUGH_FOR = 1.2
const PROGRESS = 1

/** The fastest an animal turns to face her way, radians a second. */
export const TURN_RATE = 6

/** She steps at full pace once her yaw is within this cosine of her way (about 37 degrees), and not at all while she faces square across or away from it. */
const FACING_FULL = 0.8

/** How far a walker turns off her way, one side then the other, to go round a machine standing in it. */
const DETOURS = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8] as const

/** The way an animal at (x, z) steps `step` metres along (ux, uz), in the shared `WAY`: straight on, or the least turn that keeps her out of every machine's room, so one standing dead on her path is gone round, not walked into and pushed back out. Straight on when no turn does, or when she is bound for a place inside a room (a door waiting for its machine to go). */
function detour(x: number, z: number, ux: number, uz: number, step: number, goalX: number, goalZ: number): { x: number; z: number } {
  WAY.x = ux
  WAY.z = uz
  if (inRoom(goalX, goalZ)) return WAY
  for (let i = 0; i < DETOURS.length; i++) {
    const turn = DETOURS[i]
    const c = Math.cos(turn)
    const n = Math.sin(turn)
    const vx = ux * c + uz * n
    const vz = uz * c - ux * n
    if (!inRoom(x + vx * step, z + vz * step)) {
      WAY.x = vx
      WAY.z = vz
      return WAY
    }
  }
  return WAY
}

/** Moves an animal `TROT * dt` metres towards the nearest place clear of the machines, or all the way when it is nearer. */
function easeOut(a: Animal, dt: number): void {
  const clear = pushOut(a.x, a.z)
  const dx = clear.x - a.x
  const dz = clear.z - a.z
  const out = Math.sqrt(dx * dx + dz * dz)
  if (out < 1e-9) return
  const step = Math.min(out, TROT * dt)
  a.x += (dx / out) * step
  a.z += (dz / out) * step
}

/** Where an animal waves from: this far out from the wall, so she shows in front of the house and not pressed under the eave, and this high above the ground, below the eave. */
const WINDOW_OUT = 0.4
const WINDOW_UP = 2.3

/** Animals trot to their goals, then idle, wander, cheer at a party, slide, swim and wave from a window. */
function stepAnimals(s: Sim, dt: number): void {
  loadRooms(s)
  const party = s.party
  for (const a of s.animals) {
    a.t += dt
    const b = a.home >= 0 ? s.builds[a.home] : null
    const far = a.z < RIVER.z0
    const crossing = party !== null && party.chapter === 'bridge' && a.z < RIVER.z1 + 1
    if (party === null && (a.mood === 'cheer' || a.mood === 'lick' || a.mood === 'slide' || a.mood === 'swim') && a.t > 1.5) {
      a.mood = 'idle'
      a.t = 0
    }
    if (crossing && a.mood === 'idle' && a.t >= 0) a.mood = 'walk'
    if (crossing && a.mood === 'walk') {
      // In a line over the bridge: first to its foot, then across.
      const atFoot = far && Math.abs(a.x - 8) > 0.6
      a.goalX = 8
      a.goalZ = atFoot ? -42.5 : -29
    } else if (party !== null && party.chapter === 'bridge' && a.mood === 'walk' && !a.movingIn && a.z >= RIVER.z1 + 1 && a.goalZ === -29) {
      const g = partyGoal(s, a, 'bridge')
      a.goalX = g.x
      a.goalZ = g.z
    }
    if (a.mood === 'walk') {
      // A goal inside a machine's room is reached at the room's edge, except a door: that one waits for the machine to move.
      let tx = a.goalX
      let tz = a.goalZ
      if (!a.movingIn) {
        const clear = pushOut(tx, tz)
        tx = clear.x
        tz = clear.z
      }
      const dx = tx - a.x
      const dz = tz - a.z
      const d = Math.sqrt(dx * dx + dz * dz)
      if (d > 0.15) {
        // Held in a pocket between machines for STUCK_FOR seconds, she walks on through them: a toy town's cheat.
        const through = a.stuck >= STUCK_FOR
        // One a machine pushed out is easing out below and walks on once it is clear.
        const step = !through && inRoom(a.x, a.z) ? 0 : Math.min(d, (a.movingIn ? moveInPace(a, d) : TROT) * dt)
        let way = WAY
        if (through) {
          WAY.x = dx / d
          WAY.z = dz / d
        } else way = detour(a.x, a.z, dx / d, dz / d, step, tx, tz)
        const off = turnTo(a.yaw, Math.atan2(way.x, way.z))
        const pace = clamp01(Math.cos(off) / FACING_FULL)
        a.x += way.x * step * pace
        a.z += way.z * step * pace
        const lim = TURN_RATE * dt
        a.yaw += clamp(off, -lim, lim)
        if (through) a.stuck = a.stuck + dt >= STUCK_FOR + THROUGH_FOR ? 0 : a.stuck + dt
        else if ((a.x - a.markX) ** 2 + (a.z - a.markZ) ** 2 >= PROGRESS * PROGRESS) {
          a.stuck = 0
          a.markX = a.x
          a.markZ = a.z
        } else a.stuck += dt
      } else if (a.movingIn && b !== null) {
        a.movingIn = false
        a.mood = 'wave'
        a.t = 0
        s.events.push({ kind: 'moveIn', x: b.x, z: b.z, who: a.species })
      } else if (party !== null && !crossing) {
        a.mood = party.chapter === 'play' ? (a.species === 'duck' ? 'swim' : a.id % 2 === 0 ? 'slide' : 'cheer') : PARTY_MOOD[party.chapter]
        a.t = 0
      } else {
        a.mood = 'idle'
        a.t = 0
      }
    } else if (a.mood === 'slide' && a.t >= SLIDE_FOR * 2 && party !== null) {
      a.mood = 'walk'
      a.goalX = PLAY_SLIDE.x0
      a.goalZ = PLAY_SLIDE.z0
      a.t = 0
    } else if (a.mood === 'wave' && a.t >= WAVE_FOR) {
      a.mood = 'idle'
      a.t = 0
    } else if (party === null && a.mood === 'idle' && a.t > 2 + (a.id % 5)) {
      const g = wanderGoal(a, s)
      a.goalX = g.x
      a.goalZ = g.z
      a.mood = 'walk'
      a.t = 0
    }
    if (a.mood !== 'wave' && a.mood !== 'slide' && a.mood !== 'swim' && !(a.mood === 'walk' && a.stuck >= STUCK_FOR)) {
      easeOut(a, dt)
    }
    // The feet: the ground or deck, a window, the slide, or the water.
    a.y = groundY(s, a.x, a.z)
    if (a.mood === 'wave' && b !== null) {
      a.x = b.x + 1.2
      a.z = b.z + BUILD_HALF[b.kind][1] + WINDOW_OUT
      a.y = groundY(s, a.x, a.z) + WINDOW_UP
    } else if (a.mood === 'slide') {
      const u = clamp01(a.t / SLIDE_FOR)
      a.x = PLAY_SLIDE.x0 + (PLAY_SLIDE.x1 - PLAY_SLIDE.x0) * u
      a.z = PLAY_SLIDE.z0
      a.y = PLAY_SLIDE.y0 + (PLAY_SLIDE.y1 - PLAY_SLIDE.y0) * u
    } else if (a.mood === 'swim') a.y = pondY(s.terrain, s.ponds[0])
    if (a.mood !== 'walk') {
      a.stuck = 0
      a.markX = a.x
      a.markZ = a.z
    }
  }
}

// ---------------------------------------------------------------------------------------
// Making a world.

/** Pip and a few friends by the hut. */
const CROWD: readonly (readonly [Species, number, number])[] = [
  ['hedgehog', HUT.x + 1.6, HUT.z + 3.4],
  ['bunny', HUT.x + 4, HUT.z + 2.2],
  ['duck', HUT.x - 0.8, HUT.z + 5],
  ['pig', HUT.x - 3.6, HUT.z + 3],
  ['cat', HUT.x + 3, HUT.z + 5],
]

/** A whole `Sim` at the start: machines at ENTRY with only the digger and the dumper come, every plant, form, building and pond from the map, Pip and a few animals by the hut. */
export function createWorld(start: { storyDone: number; moreDone: number; coins: number; stars: number; mode: Mode; seed: number }): Sim {
  const machines: Machines = {
    digger: newMachine('digger', ENTRY.digger),
    dumper: newMachine('dumper', ENTRY.dumper),
    dozer: newMachine('dozer', ENTRY.dozer),
    roller: newMachine('roller', ENTRY.roller),
    mixer: newMachine('mixer', ENTRY.mixer),
    forklift: newMachine('forklift', ENTRY.forklift),
    tower: newMachine('tower', ENTRY.tower),
    semi: newMachine('semi', ENTRY.semi),
    mobile: newMachine('mobile', ENTRY.mobile),
  }
  machines.digger.unlocked = true
  machines.dumper.unlocked = true
  const s: Sim = {
    time: 0,
    mode: start.mode,
    terrain: createTerrain(),
    machines,
    active: 'digger',
    hop: null,
    lastHop: null,
    ownHopAt: null,
    hands: { point: null, action: false, tapped: false, heldFor: 0, blocked: false, levers: { drive: 0, steer: 0, a: 0, b: 0, c: 0, d: 0 }, viewYaw: Math.PI },
    things: [],
    nextThing: 0,
    plants: {
      press: { id: 'press', stored: 0, phase: 'idle', t: 0, made: 0 },
      crusher: { id: 'crusher', stored: 0, phase: 'idle', t: 0, made: 0 },
      saw: { id: 'saw', stored: 0, phase: 'idle', t: 0, made: 0 },
    },
    watering: false,
    forms: FORMS.map((f, id) => ({ id, lot: f.lot, shown: false, fill: 0, setting: 0, hard: false })),
    builds: BUILDS.map((b, id) => ({ id, lot: b.lot, shown: false, kind: b.kind, x: b.x, z: b.z, yaw: b.yaw, colour: b.colour, spots: b.spots, placed: 0, placedAt: 0, owner: b.owner })),
    ponds: [{ shown: false, x: POND_AT.x, z: POND_AT.z, r: POND_AT.r, water: 0 }],
    decks: [],
    animals: [],
    job: null,
    storyDone: start.storyDone,
    moreDone: start.moreDone,
    nextJobIn: 2.5,
    card: null,
    party: null,
    partyWait: null,
    score: { coins: start.coins, stars: start.stars },
    streams: [],
    events: [],
    idle: 0,
    day: DAY_OF.road,
    seed: start.seed,
    lastTemplate: -1,
    leverTap: false,
    pressNext: false,
    releasePoint: false,
    cranePress: false,
    chapterStars: 0,
    cardAt: 0,
  }
  for (const m of Object.values(s.machines)) m.y = groundY(s, m.x, m.z)
  s.animals = CROWD.map(([species, x, z], id): Animal => ({ id, species, x, y: groundY(s, x, z), z, yaw: 0, goalX: x, goalZ: z, mood: 'idle', t: 0, home: -1, movingIn: false, stuck: 0, markX: x, markZ: z }))
  return s
}
