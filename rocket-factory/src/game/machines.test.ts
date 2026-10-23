/**
 * The machines, the lab and the path: each kind's batch from its start to its stack on hop
 * ticks, a full stack stopping a machine, a machine napped on or tucked in frozen and ending
 * its batch as many hops later, the oven's arrival order, the lab's shelf and the order it
 * drinks in, every card on the path in order (the choice both ways, the Science switch's
 * Quicker), nothing found while a card is up or at Good night, the rocket's parts opening,
 * the busy and starved bits, and a digger feeding an oven feeding the rocket's legs through
 * real belts.
 */
import { describe, expect, it } from 'vitest'

import { working } from './band'
import { add, cell, emptyBoard, line } from './beltKit'
import { hop, rebuild } from './belts'
import { BUSY_WINDOW, HELLO_SLEEP, HOLD, LAB_DRINK, LIFT_WAIT, PART_INFO, PATH, PATTERNS, RECIPES, STACK, card } from './catalog'
import { bottleCost, choiceWaits, currentCard, labNeed, nextCard, openParts, stepMachines } from './machines'
import { CARDS, HOP, HZ, PARTS, thingIndex, type CardId, type SimEvent, type State, type Thing } from './model'
import { give, take, wants } from './trade'

const GREEN = thingIndex('greenBottle')
const ORANGE = thingIndex('orangeBottle')
const BLUE_BAR = thingIndex('blueBar')

/** An event and the tick that reported it. */
interface Timed {
  tick: number
  e: SimEvent
}

/** Steps n ticks the way rules.ts steps the machines and the belts (the events cleared, the machines, the hop on a hop tick, the clock), and returns the events on the way. */
function run(s: State, n: number): Timed[] {
  const out: Timed[] = []
  for (let i = 0; i < n; i++) {
    s.events = []
    stepMachines(s)
    if (s.tick % HOP === 0) hop(s)
    for (const e of s.events) out.push({ tick: s.tick, e })
    s.tick++
  }
  return out
}

/** Steps until a card comes up, at most `max` ticks, and closes it as a tap would. Returns the card. */
function nextFound(s: State, max: number): { id: CardId; at: number } {
  for (let i = 0; i < max; i++) {
    run(s, 1)
    const up = s.card
    if (up === null) continue
    expect(s.events).toEqual(expect.arrayContaining([{ kind: 'card', id: up.id }, { kind: 'say', word: card(up.id).word }]))
    s.card = null
    s.cardClosedAt = s.tick
    return up
  }
  throw new Error(`no card came in ${max} ticks`)
}

/** The ticks building `id` started a batch. */
const startsOf = (events: readonly Timed[], id: number) => events.filter((x) => x.e.kind === 'batch' && x.e.id === id).map((x) => x.tick)
/** The lab's drinks: the bottle and the tick it was drunk. */
const drinksOf = (events: readonly Timed[]) => events.flatMap((x) => (x.e.kind === 'drink' ? [{ tick: x.tick, bottle: x.e.bottle }] : []))
/** The path's cards up to and including `last`. */
const foundTo = (last: CardId): CardId[] => CARDS.slice(0, CARDS.indexOf(last) + 1)

describe('a batch', () => {
  it('a digger digs the rock under it and the pump lifts a bubble, each batch starting and ending on a hop tick, onto its stack', () => {
    const s = emptyBoard()
    const blue = add(s, 'digger', 7, 2)
    const gold = add(s, 'digger', 16, 2)
    const pump = add(s, 'pump', 0, 8)
    rebuild(s)
    s.tick = 7
    const dig = RECIPES.digger.for
    const lift = RECIPES.pump.for
    const events = run(s, 20 + 2 * dig - 7 + 1)
    // The first hop tick after tick 7 is 20: every machine starts there.
    expect(startsOf(events, blue.id)).toEqual([20, 20 + dig, 20 + 2 * dig])
    expect(startsOf(events, gold.id)).toEqual([20, 20 + dig, 20 + 2 * dig])
    expect(blue.stack).toEqual(['blueRock', 'blueRock'])
    expect(gold.stack).toEqual(['goldRock', 'goldRock'])
    expect(blue.batch).toEqual({ makes: 'blueRock', at: 20 + 2 * dig, until: 20 + 3 * dig })
    expect(working(blue)).toBe(true)
    // Nothing takes the pump's bubbles away, so its stack fills and it stops.
    expect(STACK * lift).toBeLessThanOrEqual(2 * dig)
    expect(startsOf(events, pump.id)).toEqual(Array.from({ length: STACK }, (_, i) => 20 + i * lift))
    expect(pump.stack).toEqual(Array(STACK).fill('bubble'))
    expect(pump.batch).toBeNull()
    expect(events.every((x) => x.tick % HOP === 0)).toBe(true)
  })

  it('an oven bakes its rocks in the order they came, spending each at its batch start', () => {
    const s = emptyBoard()
    const oven = add(s, 'oven', 6, 6)
    rebuild(s)
    const rocks: Thing[] = ['goldRock', 'blueRock', 'goldRock', 'goldRock']
    expect(rocks.length).toBe(HOLD)
    for (const r of rocks) take(s, oven, r)
    expect(wants(s, oven, 'blueRock')).toBe(false)
    run(s, 1)
    const bake = RECIPES.oven.for
    expect(oven.batch).toEqual({ makes: 'goldBar', at: 0, until: bake })
    expect(oven.queue).toEqual(['blueRock', 'goldRock', 'goldRock'])
    // The rock in the oven makes room in its queue at once, and one that comes now is baked last.
    expect(wants(s, oven, 'blueRock')).toBe(true)
    take(s, oven, 'blueRock')
    run(s, bake)
    expect(oven.stack).toEqual(['goldBar'])
    expect(oven.batch).toEqual({ makes: 'blueBar', at: bake, until: 2 * bake })
    oven.stack = []
    run(s, 4 * bake)
    expect(oven.stack).toEqual(['blueBar', 'goldBar', 'goldBar', 'blueBar'])
    expect(oven.queue).toEqual([])
    expect(oven.batch).toBeNull()
  })

  it('the workshop and the bottle makers spend their recipe at the start and stack what it makes', () => {
    const s = emptyBoard()
    const shop = add(s, 'workshop', 4, 4)
    const green = add(s, 'greenMaker', 8, 4)
    const orange = add(s, 'orangeMaker', 12, 4)
    rebuild(s)
    for (let i = 0; i < 3; i++) take(s, shop, 'blueBar')
    take(s, green, 'blueBar')
    take(s, orange, 'gear')
    take(s, orange, 'bubble')
    // A green bottle wants a gold bar too: the green maker waits for it.
    run(s, 1)
    expect(shop.batch).toEqual({ makes: 'gear', at: 0, until: RECIPES.workshop.for })
    expect(orange.batch).toEqual({ makes: 'orangeBottle', at: 0, until: RECIPES.orangeMaker.for })
    expect(green.batch).toBeNull()
    expect(shop.held[BLUE_BAR]).toBe(1)
    expect(orange.held.every((n) => n === 0)).toBe(true)
    run(s, HOP - 1)
    take(s, green, 'goldBar')
    run(s, 1)
    expect(green.batch).toEqual({ makes: 'greenBottle', at: HOP, until: HOP + RECIPES.greenMaker.for })
    expect(green.held.every((n) => n === 0)).toBe(true)
    run(s, RECIPES.greenMaker.for)
    expect(shop.stack).toEqual(['gear'])
    expect(orange.stack).toEqual(['orangeBottle'])
    expect(green.stack).toEqual(['greenBottle'])
    // One blue bar is no gear: the workshop waits for the next.
    expect(shop.batch).toBeNull()
    expect(shop.held[BLUE_BAR]).toBe(1)
  })

  it('a full stack stops a machine with its inputs kept, until a push makes room', () => {
    const s = emptyBoard()
    const oven = add(s, 'oven', 6, 6)
    rebuild(s)
    oven.stack = Array(STACK - 1).fill('blueBar')
    take(s, oven, 'blueRock')
    take(s, oven, 'blueRock')
    const events = run(s, 400)
    expect(startsOf(events, oven.id)).toEqual([0])
    expect(oven.stack.length).toBe(STACK)
    expect(oven.queue).toEqual(['blueRock'])
    expect(working(oven)).toBe(false)
    give(s, oven)
    expect(startsOf(run(s, HOP + 1), oven.id)).toEqual([400])
  })

  it('a machine napped on is frozen: it starts nothing, and its batch ends as many hops later as it was napped, on a hop tick', () => {
    const s = emptyBoard()
    const oven = add(s, 'oven', 6, 6)
    const shop = add(s, 'workshop', 10, 6)
    rebuild(s)
    take(s, oven, 'blueRock')
    take(s, oven, 'goldRock')
    take(s, shop, 'blueBar')
    take(s, shop, 'blueBar')
    shop.napper = 9
    run(s, 30)
    const bake = RECIPES.oven.for
    expect(oven.batch).toEqual({ makes: 'blueBar', at: 0, until: bake })
    expect(shop.batch).toBeNull()
    // Napped over the hops at 40 and 60.
    oven.napper = 8
    run(s, 40)
    expect(oven.batch!.until).toBe(bake + 2 * HOP)
    expect(working(oven)).toBe(false)
    oven.napper = -1
    shop.napper = -1
    const woke = run(s, bake - 70 + 1)
    expect(oven.stack).toEqual([])
    expect(startsOf(woke, shop.id)).toEqual([80])
    const after = run(s, 2 * HOP)
    expect(oven.stack).toEqual(['blueBar'])
    expect(startsOf(after, oven.id)).toEqual([bake + 2 * HOP])
    expect(oven.batch).toEqual({ makes: 'goldBar', at: bake + 2 * HOP, until: 2 * bake + 2 * HOP })
  })

  it('a machine tucked in for the night is frozen the same way, the lab drinking too, and one tucked in idle starts nothing', () => {
    const s = emptyBoard()
    const digger = add(s, 'digger', 7, 2)
    const lab = add(s, 'lab', 10, 6)
    const pump = add(s, 'pump', 0, 8)
    rebuild(s)
    s.found = foundTo('science')
    lab.held[GREEN] = 2
    pump.tucked = true
    const events = run(s, 1)
    const dig = RECIPES.digger.for
    expect(digger.batch!.until).toBe(dig)
    expect(lab.batch).toEqual({ makes: 'greenBottle', at: 0, until: LAB_DRINK })
    digger.tucked = true
    lab.tucked = true
    events.push(...run(s, 3 * HOP))
    expect(digger.batch!.until).toBe(dig + 3 * HOP)
    expect(lab.batch!.until).toBe(LAB_DRINK + 3 * HOP)
    expect([working(digger), working(lab)]).toEqual([false, false])
    expect(s.lab.got).toEqual([0, 0])
    digger.tucked = false
    lab.tucked = false
    events.push(...run(s, LAB_DRINK))
    expect(drinksOf(events)).toEqual([{ tick: LAB_DRINK + 3 * HOP, bottle: 'greenBottle' }])
    expect(s.lab.drinkAt).toBe(LAB_DRINK + 3 * HOP)
    // Tucked in again halfway through its next drink, the lab drinks nothing more until morning.
    lab.tucked = true
    events.push(...run(s, 3 * LAB_DRINK))
    expect(drinksOf(events).length).toBe(1)
    expect([lab.held[GREEN], lab.batch!.makes]).toEqual([0, 'greenBottle'])
    expect(startsOf(events, pump.id)).toEqual([])
    pump.tucked = false
    const morning = Math.ceil(s.tick / HOP) * HOP
    expect(startsOf(run(s, HOP), pump.id)).toEqual([morning])
  })

  it('ends a batch whose end falls between hops, as a save may bring one back, on the next hop tick', () => {
    const s = emptyBoard()
    const oven = add(s, 'oven', 6, 6)
    rebuild(s)
    oven.batch = { makes: 'goldBar', at: 0, until: HOP + 15 }
    run(s, 2 * HOP)
    expect(oven.stack).toEqual([])
    run(s, 1)
    expect(oven.stack).toEqual(['goldBar'])
    expect(oven.batch).toBeNull()
  })

  it('throws for a digger that stands on no rocks: strokes.ts never puts one there', () => {
    const s = emptyBoard()
    add(s, 'digger', 2, 8)
    rebuild(s)
    expect(() => run(s, 1)).toThrow(/no rocks/)
  })
})

describe('the lab', () => {
  it('drinks a bottle a second from its shelf toward its card, each drink a batch the band and the munchers see', () => {
    const s = emptyBoard()
    const lab = add(s, 'lab', 8, 4)
    rebuild(s)
    s.found = foundTo('science')
    lab.held[GREEN] = 3
    lab.held[ORANGE] = 2
    const first = run(s, 1)
    expect(lab.batch).toEqual({ makes: 'greenBottle', at: 0, until: LAB_DRINK })
    expect(working(lab)).toBe(true)
    expect(lab.held[GREEN]).toBe(2)
    const events = [...first, ...run(s, 3 * LAB_DRINK)]
    expect(startsOf(events, lab.id)).toEqual([0, LAB_DRINK, 2 * LAB_DRINK])
    expect(drinksOf(events)).toEqual([1, 2, 3].map((k) => ({ tick: k * LAB_DRINK, bottle: 'greenBottle' })))
    expect(s.lab.got).toEqual([3, 0])
    expect(s.lab.drinkAt).toBe(3 * LAB_DRINK)
    // Gears! needs no orange bottles: they stay on the shelf.
    expect(lab.held[ORANGE]).toBe(2)
    expect(lab.batch).toBeNull()
    expect(labNeed(s)).toEqual([2, 0])
  })

  it('keeps the bottles its card does not need on its shelf, and needing both drinks for the emptier jar', () => {
    const s = emptyBoard()
    const lab = add(s, 'lab', 8, 4)
    rebuild(s)
    s.found = foundTo('gears')
    s.choice = 'bubbles'
    lab.held[GREEN] = 1
    lab.held[ORANGE] = 2
    run(s, 3 * LAB_DRINK)
    expect(s.lab.got).toEqual([1, 0])
    expect(lab.held[ORANGE]).toBe(2)
    // On to Snacks!, which needs orange bottles too: the two kept on the shelf go first.
    s.found = foundTo('stars')
    s.lab.got = [0, 0]
    const kept = drinksOf(run(s, 3 * LAB_DRINK))
    expect(kept.map((d) => d.bottle)).toEqual(['orangeBottle', 'orangeBottle'])
    // Snacks! needs 75 green and 20 orange: the jars fill together, the emptier one first, nearly four green to one orange.
    s.lab.got = [0, 0]
    lab.held[GREEN] = 6
    lab.held[ORANGE] = 6
    const both = drinksOf(run(s, 6 * LAB_DRINK + 1))
    expect(both.map((d) => (d.bottle === 'greenBottle' ? 'G' : 'O')).join('')).toBe('GOGGGO')
    expect(s.lab.got).toEqual([4, 2])
  })

  it("drinks nothing before Science! or once its card has every bottle; while the choice waits it drinks toward Bubbles!, the hint's pick, and her pick takes what it drank", () => {
    const s = emptyBoard()
    const lab = add(s, 'lab', 8, 4)
    rebuild(s)
    lab.held[GREEN] = 10
    lab.held[ORANGE] = 10
    s.found = foundTo('gold')
    expect(drinksOf(run(s, 3 * LAB_DRINK))).toEqual([])
    expect(lab.batch).toBeNull()
    // A child who never taps the choice is never stuck at Gears!: its bottles go toward the card the hint picks.
    s.found = foundTo('gears')
    expect(choiceWaits(s)).toBe(true)
    expect(drinksOf(run(s, 3 * LAB_DRINK)).map((d) => d.bottle)).toEqual(['greenBottle', 'greenBottle'])
    expect(s.lab.got).toEqual([2, 0])
    const bubbles = card('bubbles').needs
    expect(currentCard(s)!.id).toBe('bubbles')
    expect(labNeed(s)).toEqual([bubbles.kind === 'bottles' ? bottleCost(s, bubbles.green) - 2 : -1, 0])
    s.choice = 'hedges'
    expect(currentCard(s)!.id).toBe('hedges')
    expect(s.lab.got).toEqual([2, 0])
    // The shelf emptied, the drink under way ends and no other starts.
    lab.held[GREEN] = 0
    run(s, LAB_DRINK)
    expect(lab.batch).toBeNull()
    lab.held[GREEN] = 10
    // Gears! gets its five while Science!'s card is still up: no card comes under another, and the lab waits.
    s.found = foundTo('science')
    s.card = { id: 'science', at: s.tick }
    s.lab.got = [4, 0]
    expect(drinksOf(run(s, 4 * LAB_DRINK)).length).toBe(1)
    expect(s.lab.got).toEqual([5, 0])
    expect(lab.held[GREEN]).toBe(9)
  })

  it('drinks on a bottle a second once Fuel! is found, what its shelf holds most of first, for no card: it keeps working into free play', () => {
    const s = emptyBoard()
    const lab = add(s, 'lab', 8, 4)
    rebuild(s)
    s.found = [...CARDS]
    lab.held[GREEN] = 3
    lab.held[ORANGE] = 2
    s.tick = HOP
    const drinks = drinksOf(run(s, 6 * LAB_DRINK + HOP))
    expect(drinks.map((d) => (d.bottle === 'greenBottle' ? 'G' : 'O')).join('')).toBe('GGOGO')
    expect(drinks.map((d) => d.tick)).toEqual([1, 2, 3, 4, 5].map((k) => HOP + k * LAB_DRINK))
    expect([lab.held[GREEN], lab.held[ORANGE], lab.batch]).toEqual([0, 0, null])
    expect(s.lab.got).toEqual([0, 0])
    expect(s.lab.drinkAt).toBe(HOP + 5 * LAB_DRINK)
    // While it drinks it works, for the band and the munchers' hunger, and it is never starved.
    lab.held[GREEN] = 1
    run(s, HOP)
    expect(working(lab)).toBe(true)
    run(s, 2 * HZ)
    expect(lab.starvedBits).toBe(0)
  })
})

describe('the path', () => {
  /**
   * Plays the path with the machines alone: the legs filled for Digger! and Gold!, a gold rock
   * for Science!, the lab's shelf stocked with exactly every card's bottles. Each card is
   * closed as soon as it comes, as a tap would, and the choice made as soon as it waits.
   * Returns the cards and the ticks they came.
   */
  function walk(s: State, choice: 'bubbles' | 'hedges'): { id: CardId; at: number }[] {
    const oven = add(s, 'oven', 6, 6)
    const lab = add(s, 'lab', 8, 4)
    rebuild(s)
    for (const c of PATH)
      if (c.needs.kind === 'bottles') {
        lab.held[GREEN]! += bottleCost(s, c.needs.green)
        lab.held[ORANGE]! += bottleCost(s, c.needs.orange)
      }
    const out: { id: CardId; at: number }[] = []
    for (let c = nextCard(s); c !== null; c = nextCard(s)) {
      if (c.needs.kind === 'legs') s.rocket.got[0] = c.needs.n
      if (c.needs.kind === 'goldBar') take(s, oven, 'goldRock')
      out.push(nextFound(s, 30000))
      if (choiceWaits(s)) s.choice = choice
    }
    // The lab drank exactly what the cards cost, and nothing is left.
    expect([lab.held[GREEN], lab.held[ORANGE]]).toEqual([0, 0])
    expect(s.patterns).toBe(PATTERNS.length)
    expect(currentCard(s)).toBeNull()
    return out
  }

  it("finds every card in order as its need is met, the choice either way, at the Science switch's Quicker costs too", () => {
    // Each bottle card comes a drink a second after the one before: while the choice waits the lab works toward Bubbles!, so her pick costs it nothing.
    const normal = walk(emptyBoard(), 'bubbles')
    expect(normal.map((c) => c.id)).toEqual(['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'nose', 'stars', 'snacks', 'more', 'rocket', 'fuel'])
    expect(normal.map((c) => c.at)).toEqual([0, 20, 160, 460, 5260, 10060, 15460, 20560, 26260, 34360, 44560, 55360])
    const s = emptyBoard()
    s.switches.science = 'quicker'
    expect(PATH.flatMap((c) => (c.needs.kind === 'bottles' ? [[bottleCost(s, c.needs.green), bottleCost(s, c.needs.orange)]] : []))).toEqual([
      [3, 0],
      [48, 0],
      [48, 0],
      [54, 0],
      [51, 0],
      [45, 12],
      [54, 27],
      [78, 24],
      [108, 0],
    ])
    const quicker = walk(s, 'hedges')
    expect(quicker.map((c) => c.id)).toEqual(['digger', 'gold', 'science', 'gears', 'hedges', 'bubbles', 'nose', 'stars', 'snacks', 'more', 'rocket', 'fuel'])
    expect(quicker.map((c) => c.at)).toEqual([0, 20, 160, 340, 3220, 6100, 9340, 12400, 15820, 20680, 26800, 33280])
  })

  it('wakes the burrow its card names (B with Nose!, C with More!, A never: its scout comes later), brings a belt pattern, says the word and clears the jars as each card comes', () => {
    const s = emptyBoard()
    const lab = add(s, 'lab', 8, 4)
    rebuild(s)
    s.found = foundTo('hedges')
    s.patterns = 4
    s.lab.got = [89, 0]
    lab.held[GREEN] = 1
    lab.held[ORANGE] = 3
    const events = run(s, LAB_DRINK + 1)
    expect(s.found.at(-1)).toBe('nose')
    expect(s.card).toEqual({ id: 'nose', at: LAB_DRINK })
    expect(events.filter((x) => x.e.kind === 'card' || x.e.kind === 'say').map((x) => x.e)).toEqual([
      { kind: 'card', id: 'nose' },
      { kind: 'say', word: 'Nose!' },
    ])
    expect(s.patterns).toBe(5)
    // Burrow B waves hello and sleeps HELLO_SLEEP; A and C are left as they were, and D, E and F have no card at all.
    expect(s.burrows[1]).toMatchObject({ helloAt: LAB_DRINK, sleepUntil: LAB_DRINK + HELLO_SLEEP })
    expect(s.burrows.filter((_, i) => i !== 1).map((b) => [b.helloAt, b.sleepUntil])).toEqual([[-1, -1], [-1, -1], [-1, -1], [-1, -1], [-1, -1]])
    expect(s.lab.got).toEqual([0, 0])
    expect(lab.held[ORANGE]).toBe(3)
    // Patterns stop at the last one there is.
    s.card = null
    s.found = foundTo('rocket')
    s.patterns = PATTERNS.length
    s.lab.got = [179, 0]
    lab.held[GREEN] = 1
    run(s, 2 * LAB_DRINK)
    expect(s.found.at(-1)).toBe('fuel')
    expect(s.patterns).toBe(PATTERNS.length)
  })

  it("brings Digger! and Gold! by the bars in the rocket's legs, and Science! by a gold bar an oven bakes while it is next", () => {
    const s = emptyBoard()
    const oven = add(s, 'oven', 6, 6)
    rebuild(s)
    s.rocket.got[0] = 2
    // A gold bar baked before Gold! brings nothing.
    take(s, oven, 'goldRock')
    run(s, 200)
    expect(oven.stack).toEqual(['goldBar'])
    expect(s.found).toEqual([])
    s.rocket.got[0] = 3
    expect(nextFound(s, HOP)).toEqual({ id: 'digger', at: 200 })
    s.rocket.got[0] = PART_INFO.legs.n - 1
    run(s, 200)
    expect(s.found).toEqual(['digger'])
    s.rocket.got[0] = PART_INFO.legs.n
    expect(nextFound(s, HOP).id).toBe('gold')
    run(s, 200)
    expect(s.found).toEqual(['digger', 'gold'])
    take(s, oven, 'goldRock')
    const at = s.tick
    const science = nextFound(s, 200)
    expect(science.id).toBe('science')
    expect(science.at).toBe(Math.ceil(at / HOP) * HOP + RECIPES.oven.for)
    expect(oven.stack).toEqual(['goldBar', 'goldBar'])
  })

  it('finds nothing while a card is up, and the next card on the first hop after it closes', () => {
    const s = emptyBoard()
    const oven = add(s, 'oven', 6, 6)
    const lab = add(s, 'lab', 8, 4)
    rebuild(s)
    s.found = ['digger']
    s.card = { id: 'digger', at: 0 }
    s.rocket.got[0] = PART_INFO.legs.n
    run(s, 205)
    expect(s.found).toEqual(['digger'])
    s.card = null
    run(s, HOP)
    expect(s.card).toEqual({ id: 'gold', at: 220 })
    // A gold bar baked while Gold!'s card is up is gone by the time it closes: the next bar brings Science!.
    take(s, oven, 'goldRock')
    run(s, 200)
    expect(oven.stack).toEqual(['goldBar'])
    s.card = null
    run(s, 200)
    expect(s.found).toEqual(['digger', 'gold'])
    take(s, oven, 'goldRock')
    run(s, 200)
    expect(s.found).toEqual(['digger', 'gold', 'science'])
    // The lab fills Gears!'s jar while Science!'s card is up, then waits for it to close.
    lab.held[GREEN] = 9
    run(s, 10 * LAB_DRINK)
    expect(s.found.at(-1)).toBe('science')
    expect(s.lab.got).toEqual([5, 0])
    expect(lab.held[GREEN]).toBe(4)
    s.card = null
    const gears = nextFound(s, HOP)
    expect(gears.id).toBe('gears')
    expect(s.lab.got).toEqual([0, 0])
  })

  it('finds nothing while her finger is down, at most LIFT_WAIT after that touch began: the card comes at the lift, never over a stroke under way', () => {
    const s = emptyBoard()
    rebuild(s)
    s.found = ['digger']
    s.rocket.got[0] = PART_INFO.legs.n
    s.touching = true
    s.lastTouchAt = s.tick
    run(s, 2 * HOP)
    expect([s.card, s.found]).toEqual([null, ['digger']])
    s.touching = false
    expect(nextFound(s, HOP).id).toBe('gold')
    // A finger resting on the glass (a thumb) holds it no longer than LIFT_WAIT from its last touch.
    const t = emptyBoard()
    rebuild(t)
    t.found = ['digger']
    t.rocket.got[0] = PART_INFO.legs.n
    t.touching = true
    t.lastTouchAt = t.tick
    run(t, LIFT_WAIT - HOP)
    expect(t.card).toBeNull()
    expect(nextFound(t, 2 * HOP).id).toBe('gold')
  })

  it('finds nothing at Good night: a need met at dusk brings its card on the first hop of the morning', () => {
    const s = emptyBoard()
    const lab = add(s, 'lab', 8, 4)
    rebuild(s)
    s.found = ['digger']
    s.rocket.got[0] = PART_INFO.legs.n
    s.night = { at: 0, kind: null, kindAt: -1, doneAt: -1 }
    run(s, 205)
    expect([s.card, s.found]).toEqual([null, ['digger']])
    s.night = null
    run(s, HOP)
    expect(s.card).toEqual({ id: 'gold', at: 220 })
    // The lab drinks Gears!'s bottles at dusk, before its machines are tucked in, and the card waits for the morning too.
    s.found = ['digger', 'gold', 'science']
    s.card = null
    s.night = { at: s.tick, kind: null, kindAt: -1, doneAt: -1 }
    lab.held[GREEN] = 9
    run(s, 10 * LAB_DRINK)
    expect([s.card, s.lab.got]).toEqual([null, [5, 0]])
    s.night = null
    expect(nextFound(s, HOP).id).toBe('gears')
  })

  it("reads the choice, the next card in her order, the lab's card, its cost and its need", () => {
    const s = emptyBoard()
    expect(nextCard(s)!.id).toBe('digger')
    expect([currentCard(s), labNeed(s)]).toEqual([null, [0, 0]])
    s.found = foundTo('science')
    expect(currentCard(s)!.id).toBe('gears')
    expect(labNeed(s)).toEqual([5, 0])
    s.lab.got = [2, 0]
    expect(labNeed(s)).toEqual([3, 0])
    s.lab.got = [0, 0]
    s.found = foundTo('gears')
    expect(choiceWaits(s)).toBe(true)
    expect(nextCard(s)!.id).toBe('bubbles')
    // While the choice waits the lab works toward Bubbles!, the hint's pick.
    expect([currentCard(s)!.id, labNeed(s)]).toEqual(['bubbles', [80, 0]])
    s.choice = 'hedges'
    expect(choiceWaits(s)).toBe(false)
    expect(currentCard(s)!.id).toBe('hedges')
    expect(labNeed(s)).toEqual([80, 0])
    s.found.push('hedges')
    expect(nextCard(s)!.id).toBe('bubbles')
    s.found.push('bubbles')
    expect(nextCard(s)!.id).toBe('nose')
    s.found = foundTo('stars')
    expect(labNeed(s)).toEqual([75, 20])
    s.lab.got = [200, 80]
    expect(labNeed(s)).toEqual([0, 0])
    s.switches.science = 'quicker'
    s.lab.got = [0, 0]
    expect(labNeed(s)).toEqual([45, 12])
    expect([bottleCost(s, 1), bottleCost(s, 2), bottleCost(s, 0)]).toEqual([1, 2, 0])
    s.found = [...CARDS]
    expect([nextCard(s), currentCard(s), labNeed(s)]).toEqual([null, null, [0, 0]])
  })

  it("opens the rocket's parts by card, each until it is full, and all four again on the new rocket after a landing", () => {
    const s = emptyBoard()
    expect(openParts(s)).toEqual(['legs'])
    s.rocket.got[0] = PART_INFO.legs.n
    expect(openParts(s)).toEqual([])
    s.found = foundTo('gears')
    expect(openParts(s)).toEqual(['body'])
    s.found = foundTo('nose')
    expect(openParts(s)).toEqual(['body', 'nose'])
    s.found = foundTo('rocket')
    expect(openParts(s)).toEqual(['body', 'nose', 'engine'])
    s.rocket.got = PARTS.map((p) => PART_INFO[p].n)
    expect(openParts(s)).toEqual([])
    // After a landing the new rocket on the pad fills again, part by part, for the next launch.
    s.found = [...CARDS]
    s.launches = 1
    s.rocket.got = [0, 0, 0, 0]
    expect(openParts(s)).toEqual(['legs', 'body', 'nose', 'engine'])
    s.rocket.got[1] = PART_INFO.body.n
    expect(openParts(s)).toEqual(['legs', 'nose', 'engine'])
  })
})

describe('the busy and starved bits', () => {
  it('shift once a second, newest lowest: busy while a batch runs, starved idle with room and an input missing, neither napped on, tucked in or full', () => {
    const s = emptyBoard()
    const shop = add(s, 'workshop', 4, 4)
    const digger = add(s, 'digger', 7, 2)
    rebuild(s)
    take(s, shop, 'blueBar')
    take(s, shop, 'blueBar')
    run(s, 10 * HZ + 1)
    // The gear takes 4 s (the samples at 0 to 3 s busy), then the workshop waits for blue bars (4 to 10 s starved).
    expect(shop.busyBits).toBe(0b1111_0000000)
    expect(shop.starvedBits).toBe(0b111_1111)
    // The digger's fourth rock fills its stack at 8 s: it stops, but nothing is missing.
    expect(digger.busyBits).toBe(0b1111_1111_000)
    expect(digger.starvedBits).toBe(0)
    shop.napper = 4
    run(s, HZ)
    expect(shop.starvedBits).toBe(0b1111_1110)
    shop.napper = -1
    shop.tucked = true
    run(s, HZ)
    expect(shop.starvedBits).toBe(0b1_1111_1100)
    shop.tucked = false
    run(s, HZ)
    expect(shop.starvedBits).toBe(0b11_1111_1001)
    expect(shop.busyBits).toBe(0b1111_0000000_000)
  })

  it('count the lab starved while its card wants bottles it has none of, the choice waiting or not: it works toward Bubbles! then', () => {
    const s = emptyBoard()
    const lab = add(s, 'lab', 8, 4)
    rebuild(s)
    s.found = foundTo('science')
    lab.held[GREEN] = 1
    lab.held[ORANGE] = 3
    run(s, 2 * HZ + 1)
    expect([lab.busyBits, lab.starvedBits]).toEqual([0b100, 0b011])
    s.found = foundTo('gears')
    s.lab.got = [0, 0]
    run(s, HZ)
    expect([lab.busyBits, lab.starvedBits]).toEqual([0b1000, 0b0111])
  })

  it('keep only the last BUSY_WINDOW seconds', () => {
    const s = emptyBoard()
    const digger = add(s, 'digger', 7, 2)
    const shop = add(s, 'workshop', 4, 4)
    rebuild(s)
    for (let i = 0; i < BUSY_WINDOW + 10; i++) {
      run(s, HZ)
      digger.stack = []
    }
    const all = (1 << BUSY_WINDOW) - 1
    expect([digger.busyBits, digger.starvedBits]).toEqual([all, 0])
    expect([shop.busyBits, shop.starvedBits]).toEqual([0, all])
  })
})

describe('the chain', () => {
  it("a digger feeds an oven that feeds the rocket's legs through belts: every batch on a hop tick, a bar every 2 s, Digger! at the third and Gold! at the twentieth", () => {
    const s = emptyBoard()
    add(s, 'pad', 1, 4)
    const digger = add(s, 'digger', 7, 2)
    const oven = add(s, 'oven', 7, 5)
    cell(s, 7, 4, 3, 1, -1, -1)
    line(s, [
      [6, 5],
      [5, 5],
      [4, 5],
    ])
    rebuild(s)
    const events: Timed[] = []
    const cards: { id: CardId; at: number }[] = []
    while (cards.length < 2) {
      events.push(...run(s, 1))
      if (s.card !== null) {
        cards.push(s.card)
        s.card = null
      }
      if (s.tick > 4000) throw new Error('the chain never brought Gold!')
    }
    const bake = RECIPES.oven.for
    // The first rock rides the belt into the oven by 160 and its bar onto the pad by 420; then one a bake.
    const fills = events.filter((x) => x.e.kind === 'fill').map((x) => x.tick)
    expect(fills.length).toBe(PART_INFO.legs.n)
    expect(fills).toEqual(fills.map((_, i) => 420 + i * bake))
    expect(cards).toEqual([
      { id: 'digger', at: 420 + 2 * bake + HOP },
      { id: 'gold', at: 420 + (PART_INFO.legs.n - 1) * bake + HOP },
    ])
    // One digger keeps one oven busy: each rock comes as the last bar is done.
    const starts = startsOf(events, oven.id)
    expect(starts).toEqual(starts.map((_, i) => 180 + i * bake))
    const digs = startsOf(events, digger.id)
    expect(digs).toEqual(digs.map((_, i) => i * RECIPES.digger.for))
    expect(events.filter((x) => x.e.kind === 'batch' || x.e.kind === 'push' || x.e.kind === 'gulp').every((x) => x.tick % HOP === 0)).toBe(true)
    expect(oven.busyBits & 0b111111).toBe(0b111111)
  })
})
