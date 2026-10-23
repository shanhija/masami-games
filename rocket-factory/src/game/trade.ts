import { cellOf, rockOf } from './board'
import { BAKES, BOWL_HOLD, HOLD, PART_INFO, RECIPES, SIZE, TOWER_AMMO, TOWER_AMMO_PER_BUBBLE } from './catalog'
import { PARTS, isBottle, thingIndex, type Building, type Kind, type State, type Thing } from './model'

/**
 * What crosses a building's edge on a hop (plans/rocket-factory.md, Buildings and stickers):
 * what a building takes through a mouth now (`wants`, `take`), what a tower or a bowl takes
 * from the belt under it (`wantsUnder`, `takeUnder`), and what a building pushes onto a spout
 * (`pushHead`, `give`). belts.ts asks these on every hop; Beep's carries and the hint ask the
 * same questions, so a thing a mouth refuses is a thing nothing else pretends it wants. The
 * batches, the lab's drinking and the cards are machines.ts's: this file only moves things
 * across the edge, credits them and reports the gulp.
 *
 * A machine a muncher naps on stops: it neither takes nor gives until the muncher wakes, so
 * its stack is still there for the muncher to take its one shiny thing from.
 */

/** The building with this id; it must be on the board. */
export function building(s: State, id: number): Building {
  const b = s.buildings.find((x) => x.id === id)
  if (b === undefined) throw new Error(`no building ${id}`)
  return b
}

/** Rocket part i (a PARTS index) takes things now: open from the start or by a card found, and not yet full. After a landing the new rocket on the pad is empty with every card still found, so all four parts open again and her factory fills the same rocket for another launch. */
export function partOpen(s: State, i: number): boolean {
  const info = PART_INFO[PARTS[i]!]
  return (info.opens === null || s.found.includes(info.opens)) && s.rocket.got[i]! < info.n
}

/** The rocket part (PARTS index) that takes `thing` now, or -1 for none. */
export const openPart = (s: State, thing: Thing): number => PARTS.findIndex((p, i) => PART_INFO[p].thing === thing && partOpen(s, i))

/**
 * Would building b take `thing` through a mouth now: a maker a recipe input it holds fewer
 * than HOLD of, an oven a rock while fewer than HOLD wait in its queue, the lab any bottle (its
 * shelf has no top, so a mixed bottle belt never clogs), the pad a thing of an open rocket
 * part that is not full yet. Diggers, the pump, towers and bowls take nothing through a mouth.
 */
export function wants(s: State, b: Building, thing: Thing): boolean {
  if (b.napper !== -1) return false
  switch (b.kind) {
    case 'pad':
      return openPart(s, thing) >= 0
    case 'lab':
      return isBottle(thing)
    case 'oven':
      return BAKES[thing] !== undefined && b.queue.length < HOLD
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
      return RECIPES[b.kind].takes[thing] !== undefined && b.held[thingIndex(thing)]! < HOLD
    case 'digger':
    case 'pump':
    case 'tower':
    case 'bowl':
      return false
  }
}

/**
 * Takes `thing` into building b, which must want it: into a maker's inputs, the oven's queue
 * (it bakes in arrival order), the lab's shelf, or the rocket's open part. Stamps the gulp
 * and reports it; the pad reports a fill instead, and partFull when that was the part's last.
 */
export function take(s: State, b: Building, thing: Thing): void {
  if (!wants(s, b, thing)) throw new Error(`the ${b.kind} ${b.id} does not want a ${thing}`)
  b.gulpAt = s.tick
  if (b.kind === 'pad') {
    const i = openPart(s, thing)
    const part = PARTS[i]!
    s.rocket.got[i]!++
    s.events.push({ kind: 'fill', part, thing })
    if (s.rocket.got[i] === PART_INFO[part].n) {
      s.rocket.fullAt[i] = s.tick
      s.events.push({ kind: 'partFull', part })
    }
    return
  }
  if (b.kind === 'oven') b.queue.push(thing)
  else b.held[thingIndex(thing)]!++
  s.events.push({ kind: 'gulp', id: b.id, thing })
}

/** Would the tower or bowl b take `thing` from the belt under it now: a tower a bubble while its ammo has room for a bubble's two shots, a bowl a gold bar while it holds fewer than BOWL_HOLD. */
export function wantsUnder(b: Building, thing: Thing): boolean {
  if (b.kind === 'tower') return thing === 'bubble' && b.ammo + TOWER_AMMO_PER_BUBBLE <= TOWER_AMMO
  if (b.kind === 'bowl') return thing === 'goldBar' && b.held[thingIndex('goldBar')]! < BOWL_HOLD
  throw new Error(`the ${b.kind} ${b.id} sits on no belt`)
}

/** The tower or bowl b takes `thing` from the belt under it, which it must want: a tower's bubble is two shots of ammo (held counts the bubble until both are shot), a bowl's gold bar waits for a picnic. */
export function takeUnder(s: State, b: Building, thing: Thing): void {
  if (!wantsUnder(b, thing)) throw new Error(`the ${b.kind} ${b.id} does not want a ${thing}`)
  if (b.kind === 'tower') b.ammo += TOWER_AMMO_PER_BUBBLE
  b.held[thingIndex(thing)]!++
  b.gulpAt = s.tick
  s.events.push({ kind: 'gulp', id: b.id, thing })
}

/** What building b pushes next onto a free spout: the oldest made thing on its roof, or null when its stack is empty or a muncher naps on it. */
export const pushHead = (b: Building): Thing | null => (b.napper === -1 && b.stack.length > 0 ? b.stack[0]! : null)

/** Building b gives the head of its stack to a spout (it must have one): stamps the push for the squash and reports it. */
export function give(s: State, b: Building): Thing {
  const thing = pushHead(b)
  if (thing === null) throw new Error(`the ${b.kind} ${b.id} has nothing to give`)
  b.stack.shift()
  b.pushAt = s.tick
  s.events.push({ kind: 'push', id: b.id, thing })
  return thing
}

/** Would a building of this kind ever take `thing` through a mouth, whatever it holds now: the helpful flip and the hint ask what a belt is for, not what fits this second. */
export function everWants(kind: Kind, thing: Thing): boolean {
  switch (kind) {
    case 'pad':
      return Object.values(PART_INFO).some((p) => p.thing === thing)
    case 'lab':
      return isBottle(thing)
    case 'oven':
      return BAKES[thing] !== undefined
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
      return RECIPES[kind].takes[thing] !== undefined
    case 'digger':
    case 'pump':
    case 'tower':
    case 'bowl':
      return false
  }
}

/** What building b puts out onto its spouts: a digger the rocks under it, an oven either bar (what it bakes depends on what it is fed), a maker what its recipe makes, the pump bubbles; the pad, the lab, towers and bowls give nothing. */
export function gives(b: Building): Thing[] {
  switch (b.kind) {
    case 'digger': {
      const rocks = new Set<Thing>()
      for (let y = b.y; y < b.y + SIZE.digger; y++)
        for (let x = b.x; x < b.x + SIZE.digger; x++) {
          const rock = rockOf(cellOf(x, y))
          if (rock !== null) rocks.add(rock)
        }
      return [...rocks]
    }
    case 'oven':
      return ['blueBar', 'goldBar']
    case 'workshop':
    case 'greenMaker':
    case 'orangeMaker':
    case 'pump':
      return [RECIPES[b.kind].makes!]
    case 'pad':
    case 'lab':
    case 'tower':
    case 'bowl':
      return []
  }
}
