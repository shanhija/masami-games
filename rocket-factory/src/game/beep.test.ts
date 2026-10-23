/**
 * Beep's jobs: where a thing is wanted (the rocket, then the lab, then the nearest building
 * with room, ties by id), sending things there with room filling as it goes and at most
 * FLIGHT_MAX pictures, the digs with and without something wanting the thing, the carries from
 * a belt slot, a roof stack (along its own line only), a heap and the basket, and Beep's poses
 * with its calm rule home, or pointing at the rocket while the hint has nothing for her.
 */
import { describe, expect, it } from 'vitest'

import { BEEP_HOME, beepHome, beepJob, beepPose, carryBasket, carryHeap, carrySlot, carryStack, dig, digRefused, dugAt, patSticker, restBeep, sendEach, sendWhereWanted, whereFromStack, whereWanted } from './beep'
import { add, cell, line, put } from './beltKit'
import { PAD, cellOf } from './board'
import { rebuild } from './belts'
import { BEEP_POINT_AGAIN, BEEP_REST, FLIGHT_MAX, HOLD, PART_INFO } from './catalog'
import { inSlot, outSlot, thingIndex, type State, type Thing } from './model'
import { newGame } from './rules'
import { take } from './trade'
import { basketPoint, heapPoint, slotPoint } from './where'

const c = cellOf
const oven = (s: State) => s.buildings.find((b) => b.id === 1)!

describe('where a thing is wanted', () => {
  it('is the rocket first, then the lab, then the nearest building with room, ties by id, else nowhere', () => {
    const s = newGame(1)
    const shop = add(s, 'workshop', 9, 5)
    const lab = add(s, 'lab', 4, 2)
    const green = add(s, 'greenMaker', 4, 7)
    const east = add(s, 'oven', 11, 5)
    rebuild(s)
    const by = { x: 9.5, y: 6.5 }
    // Blue bars go to the rocket's open legs before the workshop they lie on.
    expect(whereWanted(s, 'blueBar', by)!.kind).toBe('pad')
    s.rocket.got[0] = PART_INFO.legs.n
    expect(whereWanted(s, 'blueBar', by)).toBe(shop)
    expect(whereWanted(s, 'blueBar', { x: 4.5, y: 9.5 })).toBe(green)
    // Bottles go to the lab wherever it is; nothing wants a gear before Gears!.
    expect(whereWanted(s, 'greenBottle', { x: 4.5, y: 9.5 })).toBe(lab)
    expect(whereWanted(s, 'gear', by)).toBeNull()
    // Two ovens two steps away: the lower id; the start oven full, the other.
    expect(whereWanted(s, 'blueRock', by)).toBe(oven(s))
    for (let i = 0; i < HOLD; i++) take(s, oven(s), 'goldRock')
    expect(whereWanted(s, 'blueRock', by)).toBe(east)
  })
})

describe('sending things where they are wanted', () => {
  it('credits each thing at once as room fills, the rest in the basket, and flies at most FLIGHT_MAX pictures', () => {
    const s = newGame(1)
    const far = add(s, 'oven', 4, 2)
    rebuild(s)
    sendWhereWanted(s, Array<Thing>(10).fill('blueRock'), { x: 7.5, y: 4.5 }, s.tick)
    expect(oven(s).queue.length).toBe(HOLD)
    expect(far.queue.length).toBe(HOLD)
    expect(s.basket[thingIndex('blueRock')]).toBe(2)
    expect(s.events.filter((e) => e.kind === 'gulp').length).toBe(2 * HOLD)
    expect(s.flights.length).toBe(FLIGHT_MAX)
    expect(s.flights.map((f) => [f.x0, f.y0, f.x1, f.y1])).toEqual([...Array(4).fill([7.5, 4.5, 7, 7]), ...Array(4).fill([7.5, 4.5, 5, 3])])
    expect(s.flights.every((f) => f.at === s.tick && f.until > f.at)).toBe(true)
  })

  it('flies each thing from its own point, and says where each went', () => {
    const s = newGame(1)
    const to = sendEach(
      s,
      [
        { thing: 'blueBar', x: 3.2, y: 8.4 },
        { thing: 'gear', x: 9.1, y: 2.3 },
      ],
      s.tick,
    )
    expect(to).toEqual([{ x: 2.5, y: 5.5 }, basketPoint])
    expect(s.flights.map((f) => [f.thing, f.x0, f.y0])).toEqual([
      ['blueBar', 3.2, 8.4],
      ['gear', 9.1, 2.3],
    ])
    expect(s.rocket.got[0]).toBe(1)
    expect(s.basket[thingIndex('gear')]).toBe(1)
  })
})

describe('a dig', () => {
  it('brings up the rock of a patch or a bubble from the pond, and nothing anywhere else', () => {
    expect(dugAt(c(7, 2))).toBe('blueRock')
    expect(dugAt(c(10, 7))).toBe('goldRock')
    expect(dugAt(c(0, 8))).toBe('bubble')
    expect(() => dugAt(c(4, 4))).toThrow()
  })

  it('credits the rock at once to the oven that wants it, flies it from the cell, and Beep digs there', () => {
    const s = newGame(1)
    const cell = c(9, 3)
    expect(dig(s, cell, s.tick)).toBe(true)
    expect(oven(s).queue).toEqual(['blueRock'])
    expect(s.flights).toEqual([{ thing: 'blueRock', x0: 9.5, y0: 3.5, x1: 7, y1: 7, at: s.tick, until: s.tick + 18 + 2 * 6, arc: 0.6 }])
    expect(s.beep).toMatchObject({ x: 9.5, y: 3.5, pose: 'dig', poseAt: s.tick, carrying: null, facing: -1 })
    expect(s.events).toEqual([
      { kind: 'gulp', id: 1, thing: 'blueRock' },
      { kind: 'dig', cell, thing: 'blueRock' },
    ])
    for (let i = 1; i < HOLD; i++) expect(dig(s, cell, s.tick)).toBe(true)
    // The oven is full: nothing happens, and the basket never fills from digging.
    expect(dig(s, cell, s.tick)).toBe(false)
    expect(oven(s).queue.length).toBe(HOLD)
    expect(s.basket.every((n) => n === 0)).toBe(true)
  })

  it('refused, has Beep point at the nearest building that ever takes the thing, or at nothing', () => {
    const s = newGame(1)
    const east = add(s, 'oven', 11, 5)
    rebuild(s)
    for (const o of [oven(s), east]) for (let i = 0; i < HOLD; i++) take(s, o, 'blueRock')
    s.events = []
    digRefused(s, c(10, 7), s.tick)
    expect(s.events).toEqual([{ kind: 'full', cell: c(10, 7), id: east.id }])
    expect(s.beep).toMatchObject({ x: 10.5, y: 7.5, pose: 'point', facing: 1 })
    digRefused(s, c(1, 8), s.tick)
    expect(s.events[1]).toEqual({ kind: 'full', cell: c(1, 8), id: -1 })
    expect(s.beep).toMatchObject({ x: 1.5, y: 8.5, pose: 'point' })
  })
})

describe('a carry', () => {
  it('takes a thing off its belt slot and flies it from there where it is wanted, else to the basket', () => {
    const s = newGame(1)
    const cells = line(s, [
      [4, 3],
      [5, 3],
      [6, 3],
    ])
    rebuild(s)
    put(s, outSlot(cells[1]!), 'blueRock')
    put(s, inSlot(cells[2]!), 'gear')
    const from = slotPoint(s.belts, outSlot(cells[1]!))
    carrySlot(s, outSlot(cells[1]!), s.tick)
    expect(s.belts.slot[outSlot(cells[1]!)]).toBe(-1)
    expect(oven(s).queue).toEqual(['blueRock'])
    expect(s.flights[0]).toMatchObject({ thing: 'blueRock', x0: from.x, y0: from.y, x1: 7, y1: 7 })
    expect(s.beep).toMatchObject({ x: from.x, y: from.y, pose: 'carry', carrying: 'blueRock', facing: 1 })
    expect(s.events.at(-1)).toEqual({ kind: 'carry', thing: 'blueRock', x: from.x, y: from.y })
    carrySlot(s, inSlot(cells[2]!), s.tick)
    expect(s.basket[thingIndex('gear')]).toBe(1)
    expect(() => carrySlot(s, inSlot(cells[0]!), s.tick)).toThrow()
  })

  it('takes a whole roof stack, and a whole heap, which empties', () => {
    const s = newGame(1)
    const o = oven(s)
    // The oven's belt into the pad: its roof's things go where its line leads.
    line(s, [
      [5, 6],
      [4, 6],
    ])
    rebuild(s)
    o.stack.push('blueBar', 'blueBar', 'goldBar')
    carryStack(s, o, s.tick)
    expect(o.stack).toEqual([])
    expect(s.rocket.got[0]).toBe(2)
    expect(s.basket[thingIndex('goldBar')]).toBe(1)
    expect(s.flights.map((f) => [f.x0, f.y0])).toEqual(Array(3).fill([7, 6]))
    s.burrows[0]!.heap[thingIndex('gear')] = 3
    s.burrows[0]!.heap[thingIndex('greenBottle')] = 2
    carryHeap(s, 0, s.tick)
    expect(s.burrows[0]!.heap.every((n) => n === 0)).toBe(true)
    expect([s.basket[thingIndex('gear')], s.basket[thingIndex('greenBottle')]]).toEqual([3, 2])
    expect(s.flights.at(-1)).toMatchObject({ x0: heapPoint(0).x, y0: heapPoint(0).y })
    expect(s.events.at(-1)).toEqual({ kind: 'carry', thing: 'gear', x: heapPoint(0).x, y: heapPoint(0).y })
  })

  it("takes a roof stack only where its own line leads, else into the basket: never into another line's machine", () => {
    const s = newGame(1)
    const digger = add(s, 'digger', 10, 7)
    const goldOven = add(s, 'oven', 11, 5)
    // North out of the gold digger and east into the gold oven, the blueprint's gold line.
    cell(s, 10, 6, 1, 0, -1, -1)
    rebuild(s)
    digger.stack.push('goldRock', 'goldRock', 'goldRock', 'goldRock')
    goldOven.queue = ['goldRock', 'goldRock', 'goldRock', 'goldRock']
    // The gold oven is full. The start oven has room, but it is the blue line's: gold bars baked there would choke it.
    expect(whereWanted(s, 'goldRock', { x: 11, y: 7 })!.id).toBe(oven(s).id)
    expect(whereFromStack(s, digger, 'goldRock')).toBeNull()
    carryStack(s, digger, s.tick)
    expect(oven(s).queue).toEqual([])
    expect(s.basket[thingIndex('goldRock')]).toBe(4)
    // With room on its own line, they go there.
    goldOven.queue = []
    digger.stack.push('goldRock', 'goldRock')
    expect(whereFromStack(s, digger, 'goldRock')!.id).toBe(goldOven.id)
    carryStack(s, digger, s.tick)
    expect(goldOven.queue).toEqual(['goldRock', 'goldRock'])
  })

  it('takes out of the basket only what something wants, room filling as it goes, at most FLIGHT_MAX flying', () => {
    const s = newGame(1)
    s.basket[thingIndex('gear')] = 35
    s.basket[thingIndex('goldBar')] = 2
    expect(carryBasket(s, s.tick)).toBe(0)
    expect(s.events).toEqual([])
    // Gears! opens the body: 30 gears go, 5 stay, and the gold bars wait for a green maker.
    s.found.push('digger', 'gold', 'science', 'gears')
    expect(carryBasket(s, s.tick)).toBe(PART_INFO.body.n)
    expect(s.rocket.got[1]).toBe(PART_INFO.body.n)
    expect(s.basket[thingIndex('gear')]).toBe(5)
    expect(s.basket[thingIndex('goldBar')]).toBe(2)
    expect(s.flights.length).toBe(FLIGHT_MAX)
    expect(s.events.filter((e) => e.kind === 'carry')).toEqual([{ kind: 'carry', thing: 'gear', x: basketPoint.x, y: basketPoint.y }])
  })
})

describe("Beep's poses", () => {
  it('flies to a job, holding what it carries and facing where it goes, unless caught munchers wait for their tickle', () => {
    const s = newGame(1)
    beepJob(s, 8, 4, 'carry', 'gear', 9, s.tick)
    expect(s.beep).toMatchObject({ fromX: BEEP_HOME.x, fromY: BEEP_HOME.y, x: 8, y: 4, pose: 'carry', poseAt: s.tick, movedAt: s.tick, carrying: 'gear', facing: 1 })
    s.tickles = [3]
    beepJob(s, 2, 2, 'dig', null, 1, s.tick)
    expect(s.beep).toMatchObject({ x: 8, y: 4, pose: 'carry' })
    beepPose(s, 'cheer', s.tick)
    expect(s.beep.pose).toBe('carry')
    s.tickles = []
    patSticker(s, { id: 5, kind: 'oven', x: 4, y: 7 }, s.tick)
    expect(s.beep).toMatchObject({ x: 5, y: 9, pose: 'pat', carrying: null })
    beepHome(s, 'stretch', s.tick)
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'stretch', carrying: null })
  })

  it('rests: BEEP_REST after a job it floats home, holding nothing', () => {
    const s = newGame(1)
    beepJob(s, 8, 4, 'carry', 'gear', 9, s.tick)
    s.tick += BEEP_REST - 1
    restBeep(s)
    expect(s.beep.pose).toBe('carry')
    s.tick++
    restBeep(s)
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'float', carrying: null, poseAt: s.tick, movedAt: s.tick })
    // At home and floating it stays put.
    s.tick += 2 * BEEP_REST
    restBeep(s)
    expect(s.beep.poseAt).toBe(s.tick - 2 * BEEP_REST)
  })

  it('stays while it sleeps, while munchers wait for their tickle, during the launch, cheering at a card that is up, and at a held dig', () => {
    const later = (s: State) => {
      s.tick += 2 * BEEP_REST
      restBeep(s)
      return s.beep.pose
    }
    const s = newGame(1)
    beepHome(s, 'sleep', s.tick)
    expect(later(s)).toBe('sleep')
    beepJob(s, 8, 4, 'tickle', null, 8, s.tick)
    s.tickles = [3]
    expect(later(s)).toBe('tickle')
    s.tickles = []
    s.launch = { at: s.tick, landsAt: s.tick + 100 }
    expect(later(s)).toBe('tickle')
    s.launch = null
    beepPose(s, 'cheer', s.tick)
    s.card = { id: 'digger', at: s.tick }
    expect(later(s)).toBe('cheer')
    s.card = null
    beepJob(s, 7.5, 2.5, 'dig', null, 7, s.tick)
    s.digging = { cell: c(7, 2), at: s.tick }
    expect(later(s)).toBe('dig')
    s.digging = null
    expect(later(s)).toBe('float')
  })

  it("points at the rocket's part that fills while the hint has nothing for her (its 'rocket' step), its arm out again every BEEP_POINT_AGAIN, or at the lab while no part is open; home once there is a step", () => {
    const s = newGame(1)
    s.hint = { step: { kind: 'rocket' }, at: s.tick }
    // The legs fill: from its own spot at the rocket's west end, facing the rocket.
    s.tick += BEEP_REST
    restBeep(s)
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'point', facing: 1, carrying: null, poseAt: s.tick })
    s.tick += BEEP_POINT_AGAIN - 1
    restBeep(s)
    expect(s.beep.poseAt).toBe(s.tick - BEEP_POINT_AGAIN + 1)
    s.tick++
    restBeep(s)
    expect(s.beep.poseAt).toBe(s.tick)
    // The body fills: beside the nose, facing back along the rocket.
    s.found = ['digger', 'gold', 'science', 'gears']
    s.rocket.got[0] = PART_INFO.legs.n
    s.tick += BEEP_REST
    restBeep(s)
    expect(s.beep).toMatchObject({ x: PAD.x + 3.3, y: PAD.y + 1.6, pose: 'point', facing: -1 })
    // No part open: the lab, whose dome fills toward the next card.
    s.rocket.got[1] = PART_INFO.body.n
    const lab = add(s, 'lab', 6, 8)
    rebuild(s)
    s.tick += BEEP_REST
    restBeep(s)
    expect(s.beep).toMatchObject({ x: lab.x - 0.3, y: lab.y + 1.6, pose: 'point', facing: 1 })
    // A step to take: home, floating.
    s.hint = { step: { kind: 'dig', cell: c(7, 3) }, at: s.tick }
    s.tick += BEEP_REST
    restBeep(s)
    expect(s.beep).toMatchObject({ x: BEEP_HOME.x, y: BEEP_HOME.y, pose: 'float' })
  })
})
