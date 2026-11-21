import { working } from './band'
import { cellOf, rockOf } from './board'
import { BAKES, BURROW_WAKES, BUSY_WINDOW, COST_SCALE, HELLO_SLEEP, LAB_DRINK, LIFT_WAIT, PATH, PATTERNS, QUICKER, RECIPES, SIZE, STACK, card, type Card } from './catalog'
import { HOP, HZ, PARTS, isBottle, thingIndex, type Bottle, type Building, type PartId, type State, type Thing } from './model'
import { partOpen } from './trade'

/**
 * The machines' batches, the lab, the path and the rocket's parts (plans/rocket-factory.md,
 * Things and the chain, Buildings and stickers, Science, The rocket).
 *
 * Everything here happens on a hop tick, so every machine starts and finishes on the band's
 * eighth notes. On a hop tick, before the belts hop (rules.ts runs this first):
 *  1. Batches that end put what they made on the maker's roof stack, and the hop straight
 *     after pushes it out (belts.ts); the lab's drink counts toward its card.
 *  2. The next card is found when its need is met, but only while no card is up, so a card
 *     never cuts another one short, and never during Good night: it waits for the morning,
 *     so dusk stays a tuck-in and the card comes when she can cheer it. Nor while her finger
 *     is down (a finger down at most LIFT_WAIT holds it): it comes at the lift, never over a
 *     stroke under way or under her next tap.
 *  3. Idle machines start a batch: a maker that holds its inputs (an oven: a rock at its
 *     queue's head) and has room on its stack, the lab with a bottle its card still needs on
 *     its shelf (once Fuel! is found, any bottle: it drinks on for free play). The inputs are
 *     spent at the start, so a mouth has room again on this very hop.
 *  4. Once a second, each machine's busy and starved bits.
 * The lab's drink is a batch of LAB_DRINK whose `makes` is the bottle it drinks, so band.ts
 * `working` sees the lab drink, for its chimes and for the munchers' hunger.
 * A machine a muncher naps on, or one tucked in for the night, is frozen: it starts nothing,
 * and its batch ends one hop later for every hop it was frozen, still on a hop tick.
 */

type Mixer = 'workshop' | 'greenMaker' | 'orangeMaker'
/** What a maker whose batch never varies makes (the pump, the workshop, the bottle makers). */
function product(kind: 'pump' | Mixer): Thing {
  const made = RECIPES[kind].makes
  if (made === null) throw new Error(`the ${kind}'s recipe makes nothing`)
  return made
}
const mix = (kind: Mixer) => ({ makes: product(kind), takes: (Object.entries(RECIPES[kind].takes) as [Thing, number][]).map(([thing, n]) => [thingIndex(thing), n] as const) })
/** What the workshop and each bottle maker make, and spend on a batch as [THINGS index, how many]: worked out once, since the starts run on every hop. */
const MIX: Record<Mixer, { makes: Thing; takes: readonly (readonly [number, number])[] }> = { workshop: mix('workshop'), greenMaker: mix('greenMaker'), orangeMaker: mix('orangeMaker') }
const PUMPED = product('pump')
const GREEN = thingIndex('greenBottle')
const ORANGE = thingIndex('orangeBottle')
const LEGS = PARTS.indexOf('legs')
if (BUSY_WINDOW > 30) throw new Error('the busy and starved bits must fit in a 32-bit integer')
/** The bits of the last BUSY_WINDOW seconds. */
const WINDOW = (1 << BUSY_WINDOW) - 1

/** The rock a digger digs: the one kind under its footprint. The board has no spot where a digger's footprint meets both kinds, and strokes.ts never puts one where there are none. */
function rockUnder(b: Building): Thing {
  let rock: Thing | null = null
  for (let y = b.y; y < b.y + SIZE.digger; y++)
    for (let x = b.x; x < b.x + SIZE.digger; x++) {
      const r = rockOf(cellOf(x, y))
      if (r === null) continue
      if (rock !== null && r !== rock) throw new Error(`the digger ${b.id} stands on two kinds of rock`)
      rock = r
    }
  if (rock === null) throw new Error(`the digger ${b.id} stands on no rocks`)
  return rock
}

/**
 * The bottle the lab drinks next off its shelf, or null. While the path goes on, one its card
 * still needs (`need`: labNeed): needing both, it drinks for the emptier jar (green on a tie),
 * so the two jars on the lab card fill together and she sees both lines count; with no card to
 * drink for yet (before Science!) it banks every bottle. Once the path
 * is done (`done`: Fuel! found) no card ever needs one, and it drinks whatever its shelf holds
 * most of (green on a tie), so the lab keeps working (its chimes play and its dome's stars
 * twinkle) and her bottle lines run on into free play.
 */
function drinkOf(s: State, lab: Building, need: readonly [number, number], done: boolean): Bottle | null {
  if (done) {
    if (lab.held[GREEN]! + lab.held[ORANGE]! === 0) return null
    return lab.held[GREEN]! >= lab.held[ORANGE]! ? 'greenBottle' : 'orangeBottle'
  }
  const green = need[0] > 0 && lab.held[GREEN]! > 0
  const orange = need[1] > 0 && lab.held[ORANGE]! > 0
  if (green && orange) {
    // A jar's empty share is need / (got + need): compared without division.
    const [g, o] = s.lab.got
    return need[0] * (o + need[1]) >= need[1] * (g + need[0]) ? 'greenBottle' : 'orangeBottle'
  }
  return green ? 'greenBottle' : orange ? 'orangeBottle' : null
}

/** Card c's need is met: the rocket's legs hold its blue bars, an oven baked a gold bar on this hop (`goldBar`, for Science!), or the lab has drunk its bottles. */
function met(s: State, c: Card, goldBar: boolean): boolean {
  const needs = c.needs
  switch (needs.kind) {
    case 'legs':
      return s.rocket.got[LEGS]! >= needs.n
    case 'goldBar':
      return goldBar
    case 'bottles':
      return s.lab.got[0] >= bottleCost(s, needs.green) && s.lab.got[1] >= bottleCost(s, needs.orange)
  }
}

/** Card c is found: it comes up (the rules close it), Beep says its word, the burrows it wakes (BURROW_WAKES, but A: its scout comes SCOUT_AFTER later, munchers.ts) wave hello and sleep HELLO_SLEEP, it brings its belt pattern, and the lab starts on empty jars for the next card (its shelf keeps every bottle). */
function found(s: State, c: Card): void {
  s.found.push(c.id)
  s.card = { id: c.id, at: s.tick }
  s.events.push({ kind: 'card', id: c.id }, { kind: 'say', word: { card: c.id } })
  BURROW_WAKES.forEach((id, i) => {
    if (id !== c.id || i === 0) return
    s.burrows[i]!.helloAt = s.tick
    s.burrows[i]!.sleepUntil = s.tick + HELLO_SLEEP
  })
  if (c.pattern) s.patterns = Math.min(PATTERNS.length, s.patterns + 1)
  s.lab.got = [0, 0]
}

/** One tick of the machines, the lab and the path (the file comment has the order). Only hop ticks do anything. */
export function stepMachines(s: State): void {
  const tick = s.tick
  if (tick % HOP !== 0) return
  // The tests' module runner reads every import through a getter, so the loops below read local copies.
  const hop = HOP
  const room = STACK
  const recipes = RECIPES
  const bakes = BAKES
  const drink = LAB_DRINK
  const buildings = s.buildings

  // 1. Batches that end. Once the path is done the lab's drinks count toward no card.
  let goldBar = false
  const counts = nextCard(s) !== null
  for (const b of buildings) {
    const batch = b.batch
    if (batch === null) continue
    if (b.napper !== -1 || b.tucked) {
      batch.until += hop
      continue
    }
    if (tick < batch.until) continue
    b.batch = null
    const made = batch.makes
    if (b.kind !== 'lab') {
      b.stack.push(made)
      if (made === 'goldBar') goldBar = true
      continue
    }
    if (!isBottle(made)) throw new Error(`the lab drinks bottles, not a ${made}`)
    if (counts) s.lab.got[made === 'greenBottle' ? 0 : 1]++
    s.lab.drinkAt = tick
    s.events.push({ kind: 'drink', bottle: made })
  }

  // 2. The next card. A gold bar baked while a card is up, at night or while her finger is down, does not bring Science!: the next one does.
  if (s.card === null && s.night === null && !(s.touching && s.tick - s.lastTouchAt < LIFT_WAIT)) {
    const c = nextCard(s)
    if (c !== null && met(s, c, goldBar)) found(s, c)
  }

  // 3. Batches that start, their inputs spent.
  const need = labNeed(s)
  const done = nextCard(s) === null
  for (const b of buildings) {
    if (b.batch !== null || b.napper !== -1 || b.tucked) continue
    const kind = b.kind
    let makes: Thing | null = null
    switch (kind) {
      case 'pad':
      case 'tower':
      case 'bowl':
        continue
      case 'lab':
        makes = drinkOf(s, b, need, done)
        if (makes !== null) b.held[thingIndex(makes)]!--
        break
      case 'digger':
        if (b.stack.length < room) makes = rockUnder(b)
        break
      case 'pump':
        if (b.stack.length < room) makes = PUMPED
        break
      case 'oven': {
        if (b.stack.length >= room || b.queue.length === 0) break
        const rock = b.queue.shift()!
        const bar = bakes[rock]
        if (bar === undefined) throw new Error(`the oven ${b.id} cannot bake a ${rock}`)
        makes = bar
        break
      }
      case 'workshop':
      case 'greenMaker':
      case 'orangeMaker': {
        const mixer = MIX[kind]
        if (b.stack.length >= room || mixer.takes.some(([i, n]) => b.held[i]! < n)) break
        for (const [i, n] of mixer.takes) b.held[i]! -= n
        makes = mixer.makes
        break
      }
    }
    if (makes === null) continue
    b.batch = { makes, at: tick, until: tick + (kind === 'lab' ? drink : recipes[kind].for) }
    s.events.push({ kind: 'batch', id: b.id })
  }

  // 4. Once a second, after the starts: a machine still idle with room on its stack (the lab: with bottles its card still needs) lacks an input, so it is starved. One napped on, tucked in or with a full stack is neither busy nor starved.
  if (tick % HZ !== 0) return
  const window = WINDOW
  const isWorking = working
  for (const b of buildings) {
    const kind = b.kind
    if (kind === 'pad' || kind === 'tower' || kind === 'bowl') continue
    const starved = b.batch === null && b.napper === -1 && !b.tucked && (kind === 'lab' ? need[0] + need[1] > 0 : b.stack.length < room)
    b.busyBits = ((b.busyBits << 1) | (isWorking(b) ? 1 : 0)) & window
    b.starvedBits = ((b.starvedBits << 1) | (starved ? 1 : 0)) & window
  }
}

/** The lab card's one choice is waiting: Gears! is found and she has picked neither Bubbles! nor Hedges!. */
export const choiceWaits = (s: State): boolean => s.found.includes('gears') && s.choice === null && !s.found.includes('bubbles') && !s.found.includes('hedges')

/** The next card the path brings, whatever it needs: the first not found, the choice's two in the order she picked (Bubbles! first while the choice waits). Null after the last. */
export function nextCard(s: State): Card | null {
  for (const c of PATH) {
    if (s.found.includes(c.id)) continue
    if (c.id === 'bubbles' || c.id === 'hedges') {
      const first = s.choice ?? 'bubbles'
      return card(s.found.includes(first) ? (first === 'bubbles' ? 'hedges' : 'bubbles') : first)
    }
    return c
  }
  return null
}

/** The card the lab works on now: the next card when it needs bottles; null before Science! and after Fuel!. While the choice waits it works toward Bubbles! (nextCard), the hint's own pick, and her tap only changes the order: what it drank so far counts toward the card she picks. So a child who never taps the choice is never stuck at Gears!. */
export function currentCard(s: State): Card | null {
  if (!s.found.includes('science')) return null
  const c = nextCard(s)
  return c !== null && c.needs.kind === 'bottles' ? c : null
}

/** A card's bottle cost in this game: times the cost dial and the parent's Science switch, rounded up. */
export const bottleCost = (s: State, n: number): number => Math.ceil(n * COST_SCALE * (s.switches.science === 'quicker' ? QUICKER : 1))

/** The green and orange bottles the current card still needs, [0, 0] with none. */
export function labNeed(s: State): [number, number] {
  const c = currentCard(s)
  if (c === null || c.needs.kind !== 'bottles') return [0, 0]
  return [Math.max(0, bottleCost(s, c.needs.green) - s.lab.got[0]), Math.max(0, bottleCost(s, c.needs.orange) - s.lab.got[1])]
}

/** The rocket parts that take things now (all four again after each landing, until each is full). */
export const openParts = (s: State): PartId[] => PARTS.filter((_, i) => partOpen(s, i))
