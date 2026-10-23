import { BASKET, GROUND, PAD, rockOf, xOf, yOf } from './board'
import { downstream } from './belts'
import { BEEP_POINT_AGAIN, BEEP_REST, FLIGHT_MAX, SIZE } from './catalog'
import { PARTS, STEP, THINGS, thingIndex, type BeepPic, type Building, type PlacedBuilding, type State, type Thing } from './model'
import { everWants, openPart, partOpen, take, wants } from './trade'
import { basketPoint, beepPoint, buildingBox, heapPoint, slotPoint, type Point } from './where'

/**
 * Beep's jobs (plans/rocket-factory.md, Beep and the child's hands): every job is credited at
 * the tap and Beep's flight is a picture. Where a thing is wanted (whereWanted) and sending it
 * there (sendWhereWanted, sendEach), the digs, the carries (a thing on a belt, a heap, the
 * basket, and a roof stack, which keeps to its own line), and Beep's poses: dig, carry, pat
 * after a place or a peel, point at a full oven, cheer at a card, stretch at a session, yawn and
 * sleep at night, and the calm rule that floats it home after a job, or while there is nothing
 * for her to do has it point at the rocket's part that fills (restBeep).
 *
 * Beep is never chased, hurt or tired. While caught munchers wait for their tickle,
 * munchers.ts flies Beep to each of them, and the jobs here credit their things without
 * moving it (beepJob), so a tickle is never cut short.
 */

/** Beep's own spot, just over its basket by the pad: it starts there, rests there between jobs and sleeps there at night. */
export const BEEP_HOME: Point = { x: BASKET.x + 0.5, y: BASKET.y + 0.2 }

const middle = (c: number): Point => ({ x: xOf(c) + 0.5, y: yOf(c) + 0.5 })

/** Steps from a board point's cell to the nearest cell of b's footprint. */
function stepsTo(b: Building, from: Point): number {
  const box = buildingBox(b)
  const x = Math.floor(from.x)
  const y = Math.floor(from.y)
  const dx = x < box.x ? box.x - x : x >= box.x + box.w ? x - (box.x + box.w - 1) : 0
  const dy = y < box.y ? box.y - y : y >= box.y + box.h ? y - (box.y + box.h - 1) : 0
  return dx + dy
}

/** The building nearest board point `from` (Manhattan steps to its footprint, ties by id) of those `ok` accepts, or null. */
function nearest(s: State, from: Point, ok: (b: Building) => boolean): Building | null {
  let best: Building | null = null
  let bestSteps = Infinity
  for (const b of s.buildings) {
    if (!ok(b)) continue
    const steps = stepsTo(b, from)
    if (steps < bestSteps || (steps === bestSteps && b.id < best!.id)) {
      best = b
      bestSteps = steps
    }
  }
  return best
}

/**
 * Where a thing at board point `from` is wanted now among the buildings `ok` accepts, in the
 * plan's one fixed order: the rocket's open part (the pad), then the lab (any bottle: its shelf
 * has no top), then the nearest building with room for it. Null when none of them wants it: it
 * goes in Beep's basket.
 */
function wantedAmong(s: State, thing: Thing, from: Point, ok: (b: Building) => boolean): Building | null {
  if (openPart(s, thing) >= 0) {
    const pad = s.buildings.find((b) => b.kind === 'pad')!
    if (ok(pad)) return pad
  }
  return nearest(s, from, (b) => ok(b) && b.kind === 'lab' && wants(s, b, thing)) ?? nearest(s, from, (b) => ok(b) && wants(s, b, thing))
}
/** Any building on the board. */
const anywhere = () => true

/** Where a thing at board point `from` is wanted now, anywhere on the board (wantedAmong); null for the basket. */
export const whereWanted = (s: State, thing: Thing, from: Point): Building | null => wantedAmong(s, thing, from, anywhere)

/** The buildings building b's own belts lead to: its line, through forks, joins and bridges. */
function lineOf(s: State, b: Building): (r: Building) => boolean {
  const reached = downstream(s, s.net.spouts.get(b.id)!, null)
  return (r) => reached.includes(r.id)
}

/** The point Beep carries building b's roof stack from: the top of its picture. */
const stackPoint = (b: Building): Point => ({ x: b.x + SIZE[b.kind] / 2, y: b.y })

/**
 * Where Beep's carry off building b's roof stack takes `thing` now: as whereWanted, but only
 * where b's own belts lead (its line), else into the basket (null). A full stack stands because
 * its line is backed up, and its things wanted somewhere else belong to another line: the gold
 * digger's rocks in the gear oven bake gold bars its belt to the workshop chokes on.
 */
export const whereFromStack = (s: State, b: Building, thing: Thing): Building | null => wantedAmong(s, thing, stackPoint(b), lineOf(s, b))

/** How long a carried thing flies: longer the farther it goes. */
const flightFor = (from: Point, to: Point) => Math.min(48, 18 + Math.round(2 * (Math.abs(to.x - from.x) + Math.abs(to.y - from.y))))

/** Credits one thing at board point `from` where it is wanted now among the buildings `ok` accepts, else in Beep's basket, and gives the board point it goes to. The take reports its gulp, or its fill of the rocket. */
function credit(s: State, thing: Thing, from: Point, ok: (b: Building) => boolean): Point {
  const b = wantedAmong(s, thing, from, ok)
  if (b === null) {
    s.basket[thingIndex(thing)]! += 1
    return basketPoint
  }
  take(s, b, thing)
  const box = buildingBox(b)
  return { x: box.x + box.w / 2, y: box.y + box.h / 2 }
}

/** A credited thing flies from `from` to `to` as a picture, starting at tick `at`. */
const fly = (s: State, thing: Thing, from: Point, to: Point, at: number) => s.flights.push({ thing, x0: from.x, y0: from.y, x1: to.x, y1: to.y, at, until: at + flightFor(from, to), arc: 0.6 })

/**
 * Things at their own board points (an edit's displaced things, a sneeze's cheeks), each
 * credited at once where it is wanted (asked again for each, so room fills as it goes) or
 * else in Beep's basket. The first FLIGHT_MAX fly there as pictures and the rest are credited
 * with none. Returns where each went, in order. The takes report their gulps and fills to
 * s.events (rules.act points s.events at the queue while it runs).
 */
export function sendEach(s: State, items: readonly { thing: Thing; x: number; y: number }[], at: number): Point[] {
  return sendAmong(s, items, at, anywhere)
}
/** sendEach, each thing credited only among the buildings `ok` accepts. */
function sendAmong(s: State, items: readonly { thing: Thing; x: number; y: number }[], at: number, ok: (b: Building) => boolean): Point[] {
  return items.map((item, i) => {
    const to = credit(s, item.thing, item, ok)
    if (i < FLIGHT_MAX) fly(s, item.thing, item, to, at)
    return to
  })
}

/** Credits each thing at once where wanted from board point `from`, else the basket; at most FLIGHT_MAX of them fly (sendEach). */
export function sendWhereWanted(s: State, things: readonly Thing[], from: Point, at: number): void {
  sendEach(s, things.map((thing) => ({ thing, x: from.x, y: from.y })), at)
}

/** Beep flies to the board point (x, y) from where it is drawn at tick `at` (mid-flight too), taking `pose` on arrival. */
export function beepTo(s: State, x: number, y: number, pose: BeepPic['pose'], at: number): void {
  const p = beepPoint(s.beep, at * STEP)
  s.beep = { ...s.beep, fromX: p.x, fromY: p.y, x, y, movedAt: at, pose, poseAt: at }
}

/**
 * Beep flies to the board point (x, y) for one of her jobs and takes `pose` there, holding
 * `carrying` (its antenna glows that colour), facing board x `faceX` (straight on when it is
 * x itself). While caught munchers wait for their tickle it stays with them: the job is
 * credited all the same, and Beep's tickles are munchers.ts's.
 */
export function beepJob(s: State, x: number, y: number, pose: BeepPic['pose'], carrying: Thing | null, faceX: number, at: number): void {
  if (s.tickles.length > 0) return
  beepTo(s, x, y, pose, at)
  s.beep.carrying = carrying
  if (faceX !== x) s.beep.facing = faceX > x ? 1 : -1
}

/** Beep takes `pose` where it is, holding what it holds (a cheer under a card's confetti, a flip at her tap), unless caught munchers wait for their tickle. */
export function beepPose(s: State, pose: BeepPic['pose'], at: number): void {
  if (s.tickles.length > 0) return
  s.beep.pose = pose
  s.beep.poseAt = at
}

/** Beep flies home to its spot by the basket and takes `pose` there, holding nothing: a float after a job, a stretch at a session or in the morning, a yawn at Good night, sleep once the factory is asleep, a wave home from the moon. */
export function beepHome(s: State, pose: BeepPic['pose'], at: number): void {
  beepTo(s, BEEP_HOME.x, BEEP_HOME.y, pose, at)
  s.beep.carrying = null
}

/**
 * Where Beep watches from while the hint has nothing for her to do (its 'rocket' step: the
 * factory runs, and watching it is play), facing what it points at: the rocket's first part
 * that fills, from its own spot by the basket at the rocket's west end for the legs and the
 * engine, or from beside the nose for the body and the nose; with no part open, the lab, whose
 * dome fills toward the next card, from its west side (its east side on the land's west edge).
 * Null when neither: Beep floats home.
 */
function watchSpot(s: State): { x: number; y: number; facing: -1 | 1 } | null {
  const part = PARTS.find((_, i) => partOpen(s, i))
  if (part === 'legs' || part === 'engine') return { ...BEEP_HOME, facing: 1 }
  if (part !== undefined) return { x: PAD.x + 3.3, y: PAD.y + 1.6, facing: -1 }
  const lab = s.buildings.find((b) => b.kind === 'lab')
  if (lab === undefined) return null
  return lab.x >= 1 ? { x: lab.x - 0.3, y: lab.y + 1.6, facing: 1 } : { x: lab.x + SIZE.lab + 0.3, y: lab.y + 1.6, facing: -1 }
}

/**
 * The calm rule, once a tick (rules.step): BEEP_REST after a job's pose began, Beep floats
 * home to its spot by the basket, holding nothing; or while the hint's step is 'rocket' it
 * flies to its watching spot (watchSpot) and points, its arm springing out again every
 * BEEP_POINT_AGAIN, with no hand. It stays where it is while it sleeps, while caught munchers
 * wait for their tickle, during the launch (it rides the rocket), while it cheers at a card
 * that is up, and while a held finger digs the patch it works at. So Beep is at home or
 * watching whenever the child is not giving it work, and only her jobs take it elsewhere.
 */
export function restBeep(s: State): void {
  const b = s.beep
  if (s.tick - b.poseAt < BEEP_REST || b.pose === 'sleep' || s.tickles.length > 0 || s.launch !== null) return
  if (b.pose === 'cheer' && s.card !== null) return
  if ((b.pose === 'dig' || b.pose === 'point') && s.digging !== null) return
  const watch = s.hint !== null && s.hint.step.kind === 'rocket' ? watchSpot(s) : null
  if (watch !== null) {
    if (b.pose === 'point' && b.x === watch.x && b.y === watch.y && b.facing === watch.facing && s.tick - b.poseAt < BEEP_POINT_AGAIN) return
    beepTo(s, watch.x, watch.y, 'point', s.tick)
    s.beep.carrying = null
    s.beep.facing = watch.facing
    return
  }
  if (b.pose === 'float' && b.x === BEEP_HOME.x && b.y === BEEP_HOME.y) return
  beepHome(s, 'float', s.tick)
}

/** Beep pats a sticker that just slapped down or curled off: it flies in front of the footprint, to the middle of its bottom edge. */
export function patSticker(s: State, p: PlacedBuilding, at: number): void {
  const k = SIZE[p.kind]
  beepJob(s, p.x + k / 2, p.y + k, 'pat', null, p.x + k / 2, at)
}

// ---------------------------------------------------------------------------------------
// Digs

/** What a dig on cell c brings up: the rock of its patch, or a bubble from the pond. */
export function dugAt(c: number): Thing {
  const rock = rockOf(c)
  if (rock !== null) return rock
  if (GROUND[c] !== 'pond') throw new Error(`cell ${c} is neither a rock patch nor the pond`)
  return 'bubble'
}

/**
 * A finger digs cell c (a bare patch or the pond) at tick `at`: when something wants its
 * rock or bubble now, the thing is credited there at once and flies from the cell, Beep digs
 * at the cell, and the dig is reported. With nothing wanting it nothing happens and it
 * returns false: the basket never fills from digging, so a digger visibly beats the hand.
 */
export function dig(s: State, c: number, at: number): boolean {
  const thing = dugAt(c)
  const from = middle(c)
  if (whereWanted(s, thing, from) === null) return false
  const [to] = sendEach(s, [{ thing, ...from }], at)
  beepJob(s, from.x, from.y, 'dig', null, to!.x, at)
  s.events.push({ kind: 'dig', cell: c, thing })
  return true
}

/** A dig nothing wants: Beep taps the patch and points at the nearest building that ever takes the thing, a full oven most of the time (event full, with its id, or -1 with none on the board). */
export function digRefused(s: State, c: number, at: number): void {
  const thing = dugAt(c)
  const from = middle(c)
  const b = nearest(s, from, (x) => everWants(x.kind, thing))
  beepJob(s, from.x, from.y, 'point', null, b === null ? from.x : b.x + SIZE[b.kind] / 2, at)
  s.events.push({ kind: 'full', cell: c, id: b === null ? -1 : b.id })
}

// ---------------------------------------------------------------------------------------
// Carries

/** Beep carries `things` (at least one) from board point `from` where they are wanted among the buildings `ok` accepts: they are credited and fly on, and Beep comes to take them, holding the first and facing where it goes. */
function carry(s: State, things: readonly Thing[], from: Point, at: number, ok: (b: Building) => boolean): void {
  const first = things[0]
  if (first === undefined) throw new Error('Beep carries nothing')
  const [to] = sendAmong(s, things.map((thing) => ({ thing, ...from })), at, ok)
  beepJob(s, from.x, from.y, 'carry', first, to!.x, at)
  s.events.push({ kind: 'carry', thing: first, x: from.x, y: from.y })
}

/** Beep carries the thing riding belt slot `slot` (it must hold one) where it is wanted: it leaves its slot and flies from the slot's point. */
export function carrySlot(s: State, slot: number, at: number): void {
  const v = s.belts.slot[slot]!
  if (v < 0) throw new Error(`slot ${slot} holds nothing to carry`)
  const from = slotPoint(s.belts, slot)
  s.belts.slot[slot] = -1
  s.belts.from[slot] = -1
  carry(s, [THINGS[v]!], from, at, anywhere)
}

/** Beep carries everything on building b's roof stack (at least one thing) from the top of its picture, each thing where it is wanted on b's own line, else into the basket (whereFromStack). */
export function carryStack(s: State, b: Building, at: number): void {
  carry(s, b.stack.splice(0), stackPoint(b), at, lineOf(s, b))
}

/** Beep carries burrow i's whole heap (at least one thing) where it is wanted: the heap empties. */
export function carryHeap(s: State, i: number, at: number): void {
  const heap = s.burrows[i]!.heap
  const things = heap.flatMap((n, k) => Array.from({ length: n }, () => THINGS[k]!))
  heap.fill(0)
  carry(s, things, heapPoint(i), at, anywhere)
}

/**
 * A tap on the basket: each thing in it that something wants now goes there (asked thing by
 * thing, so room fills as it goes), at most FLIGHT_MAX of them flying, and the rest stay.
 * Returns how many went; with none, Beep does nothing.
 */
export function carryBasket(s: State, at: number): number {
  const from = basketPoint
  let sent = 0
  let first: { thing: Thing; to: Point } | null = null
  for (let k = 0; k < THINGS.length; k++) {
    const thing = THINGS[k]!
    while (s.basket[k]! > 0 && whereWanted(s, thing, from) !== null) {
      s.basket[k]!--
      const to = credit(s, thing, from, anywhere)
      if (sent < FLIGHT_MAX) fly(s, thing, from, to, at)
      first ??= { thing, to }
      sent++
    }
  }
  if (first === null) return 0
  const { thing, to } = first
  beepJob(s, from.x, from.y - 0.3, 'carry', thing, to.x, at)
  s.events.push({ kind: 'carry', thing, x: from.x, y: from.y })
  return sent
}
