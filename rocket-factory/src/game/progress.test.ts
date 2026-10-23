/**
 * The save (progress.ts): what serializeKeep writes parseKeep reads back, a load puts the
 * factory back as it was, a broken save is read field by field and judged against the board,
 * and the plan's equality test: a load of the save steps on just as the state itself does,
 * once everyone is sent home, through the real rules, machines and munchers.
 */
import { describe, expect, it } from 'vitest'

import { FLOWER_OF, GROUND, PAD_RING, cellInLand, cellOf, xOf, yOf } from './board'
import { HELLO_SLEEP, PART_INFO, REGROW, SESSION_CALM } from './catalog'
import { demoState } from './fixtures'
import { CELLS, HOP, HZ, PARTS, inSlot, outSlot, thingIndex, ticks, type State } from './model'
import { OLD_KEY, SAVE_KEY, freshKeep, keepOf, parseKeep, serializeKeep, stateFromKeep, type Keep } from './progress'
import { act, step } from './rules'
import { lintNet, stickersLeft } from './strokes'

/** The full factory a while into its run, as the careful child's game has it: every kind of building, belts with things on them, bridges and joins. The first call plays the game (a second or so). */
const rich = () => demoState('land3', 5)
/** A cell of s's land where a hedge or a stump could be: grass, with nothing on it, off the pad's ring. */
const freeCell = (s: State) => {
  for (let c = 0; c < CELLS; c++) if (GROUND[c] === 'grass' && FLOWER_OF[c]! < 0 && cellInLand(s.land, c) && s.owner[c]! < 0 && s.belts.out[c]! < 0 && s.hedge[c] === 0 && !PAD_RING.has(c)) return c
  throw new Error('no free cell')
}
/** A keep as plain JSON, to damage one field at a time. */
const json = (k: Keep) => JSON.parse(serializeKeep(k)) as Record<string, any>
const text = (d: unknown) => JSON.stringify(d)

/** Everyone sent home at once, as the save sees them: each muncher's cheeks on its burrow's heap, nobody napping, nothing in the air, no Oops, no drag. */
function sentHome(s: State): void {
  for (const m of s.munchers) for (const thing of m.cheeks) s.burrows[m.burrow]!.heap[thingIndex(thing)]!++
  s.munchers = []
  s.visit = null
  s.shots = []
  s.tickles = []
  for (const b of s.buildings) b.napper = -1
  s.flights = []
  s.undo = []
  s.drag = null
  s.lifted = null
  s.queued = []
}

describe('the keys', () => {
  it('saves under its own names', () => {
    expect([SAVE_KEY, OLD_KEY]).toEqual(['rocket-factory', 'rocket-factory-old'])
  })
})

describe('parseKeep', () => {
  it('reads back what serializeKeep wrote', { timeout: 30_000 }, () => {
    const k = keepOf(rich())
    expect(parseKeep(serializeKeep(k))).toEqual(k)
    expect(parseKeep(serializeKeep(freshKeep()))).toEqual(freshKeep())
  })

  it('starts fresh for nothing stored, text that is not JSON, and JSON that is not a version 1 save', () => {
    for (const junk of [null, '', '{', 'null', '42', '"hi"', '[]', '{}', text({ ...json(freshKeep()), v: 2 }), text({ ...json(freshKeep()), v: '1' })]) {
      expect(parseKeep(junk), String(junk)).toEqual(freshKeep())
    }
  })

  it('keeps everything it can from a save that is all wrong types', () => {
    const d = { v: 1, second: 'x', land: 7, flap: 'yes', belts: 5, hedges: {}, stumps: 'a', buildings: {}, nextId: -3, nextMuncher: null, basket: [], found: 'all', choice: 4, lab: 2, rocket: [], launches: 1.5, burrows: 'b', patterns: 99, pattern: -1, help: [], switches: 0 }
    const k = parseKeep(text(d))
    expect(k).toEqual({ ...freshKeep(), buildings: [], patterns: 10 })
  })

  it('turns a bad count into 0, drops an unknown name, and keeps the good ones', () => {
    const d = json(keepOf(rich()))
    d.basket = { gear: 2, blueBar: -1, goldBar: 1.5, moonRock: 3, bubble: '4' }
    d.found = ['digger', 'gold', 'castle', 'gold', 7]
    d.rocket = { legs: 25, body: -2, nose: 'x' }
    d.lab = { green: 3.5, orange: 2, drank: -1 }
    const k = parseKeep(text(d))
    expect(k.basket).toEqual({ gear: 2 })
    expect(k.found).toEqual(['digger', 'gold'])
    expect(k.rocket).toEqual({ legs: PART_INFO.legs.n, body: 0, nose: 0, engine: 0 })
    expect(k.lab).toEqual({ green: 0, orange: 2, drank: null })
  })

  it("reads a bad belt cell as ground and an unknown thing as an empty slot, and keeps the row's other cells", () => {
    const d = json(keepOf(rich()))
    // A plain belt cell with its two slots, and four cells after it in its row.
    const plain = (cell: string) => /^[0-3]{2}--.{3}:[^@]{2}$/.test(cell)
    const y = (d.belts as string[]).findIndex((r) => r.split(' ').slice(0, 16).some(plain))
    const row = (d.belts[y] as string).split(' ')
    const x = row.slice(0, 16).findIndex(plain)
    const good = row[x]!
    row[x] = good.replace(/:../, ':xo')
    row[x + 1] = '22--000'
    row[x + 2] = '20--000:-o-o'
    row[x + 3] = 'banana'
    d.belts[y] = row.join(' ')
    const short = y === 2 ? 3 : 2
    d.belts[short] = 'too short'
    const k = parseKeep(text(d))
    const cells = k.belts[y]!.split(' ')
    expect(cells[x]).toBe(good.replace(/:../, ':-o'))
    expect(cells.slice(x + 1, x + 4)).toEqual(['.', '.', '.'])
    expect(cells[x + 4]).toBe(row[x + 4])
    expect(k.belts[short]).toBe(Array(20).fill('.').join(' '))
  })

  it('keeps a pending flap only for the land after the open one, and patterns within those the game knows', () => {
    const d = json(freshKeep())
    expect(parseKeep(text({ ...d, flap: 2 })).flap).toBe(2)
    expect(parseKeep(text({ ...d, flap: 3 })).flap).toBe(0)
    expect(parseKeep(text({ ...d, land: 2, flap: 3 })).flap).toBe(3)
    const k = parseKeep(text({ ...d, patterns: 3, pattern: 5 }))
    expect([k.patterns, k.pattern]).toEqual([3, 2])
  })

  it('turns bad switches to their defaults', () => {
    const d = json(freshKeep())
    d.switches = { sound: 0, music: false, voice: 'no', munchers: 'lots', science: 'quicker', noFullscreen: true }
    expect(parseKeep(text(d)).switches).toEqual({ sound: true, music: false, voice: true, munchers: 'many', science: 'quicker', noFullscreen: true })
  })
})

describe('a load', () => {
  it('puts the factory back as it was saved', () => {
    const s = rich()
    const k = keepOf(s)
    const loaded = stateFromKeep(parseKeep(serializeKeep(k)), 9)
    expect(keepOf(loaded)).toEqual(k)
    expect(lintNet(loaded)).toEqual([])
    expect(loaded.buildings.map((b) => [b.id, b.kind, b.x, b.y])).toEqual(s.buildings.map((b) => [b.id, b.kind, b.x, b.y]))
    expect([...loaded.belts.slot]).toEqual([...s.belts.slot])
    expect(loaded.playing).toBe(false)
  })

  it('keeps every time as seconds and every beat: the second it was saved in, a batch on its hop, a sleep, a stump', () => {
    const s = rich()
    for (let i = 0; i < 37; i++) step(s)
    s.burrows[1]!.sleepUntil = s.tick + ticks(50)
    const stump = freeCell(s)
    s.hedge[stump] = 2
    s.stumpAt[stump] = s.tick - ticks(12)
    const oven = s.buildings.find((b) => b.kind === 'oven')!
    oven.batch = { makes: 'blueBar', at: s.tick - 25, until: (Math.floor(s.tick / HOP) + 4) * HOP }
    // A bridge's hump tells how long its thing has stood blocked, as a belt's end does.
    const bridge = Array.from({ length: CELLS }, (_, c) => c).find((c) => s.belts.over[c]! >= 0)!
    s.belts.blockedSince[bridge] = s.tick - ticks(3)
    s.belts.blockedSince[CELLS + bridge] = s.tick - ticks(7)
    const k = keepOf(s)
    expect(k.burrows[1]!.sleep).toBeCloseTo(50, 9)
    expect(k.stumps.find(([x, y]) => x === xOf(stump) && y === yOf(stump))![2]).toBeCloseTo(18, 9)
    const loaded = stateFromKeep(parseKeep(serializeKeep(k)), 1)
    expect(loaded.tick % HZ).toBe(s.tick % HZ)
    expect(loaded.burrows[1]!.sleepUntil - loaded.tick).toBe(ticks(50))
    expect(loaded.stumpAt[stump]! + REGROW - loaded.tick).toBe(ticks(18))
    expect([loaded.tick - loaded.belts.blockedSince[bridge]!, loaded.tick - loaded.belts.blockedSince[CELLS + bridge]!]).toEqual([ticks(3), ticks(7)])
    const b = loaded.buildings.find((x) => x.id === oven.id)!
    expect(b.batch).toEqual({ makes: 'blueBar', at: loaded.tick - 25, until: oven.batch.until - s.tick + loaded.tick })
    expect(b.batch!.until % HOP).toBe(0)
  })

  it("sends everyone home: a muncher's cheeks land on its burrow's heap", () => {
    const s = rich()
    s.munchers.push({ id: 7, burrow: 1, mode: 'sit', modeAt: s.tick, cell: cellOf(13, 8), toward: cellOf(13, 8), stepAt: s.tick, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: ['gear', 'greenBottle'], grabAt: -1, idleSince: -1, outAt: s.tick, scout: false, shotBy: -1 })
    const heap = keepOf(s).burrows[1]!.heap
    expect(heap.gear).toBe((s.burrows[1]!.heap[thingIndex('gear')] ?? 0) + 1)
    expect(heap.greenBottle).toBe(1)
  })

  it('puts a building only where its sticker could be placed now, and what it held in the basket', () => {
    const k = keepOf(rich())
    const d = json(k)
    // On the pond, over another building, a third workshop's worth of stickers, a kind the game does not know, and a sticker whose card was never found.
    d.buildings.push({ id: 90, kind: 'oven', x: 0, y: 8, held: {}, queue: ['blueRock'], stack: ['blueBar'], batch: null, outTurn: 0, inTurn: 0, ammo: 0, stars: 0, busy: 0, starved: 0 })
    d.buildings.push({ ...d.buildings[0], id: 91, held: {}, queue: [], stack: ['blueBar'], batch: null })
    d.buildings.push({ ...d.buildings.find((b: any) => b.kind === 'workshop'), id: 92, x: 14, y: 6, held: {}, queue: [], stack: [], batch: null })
    d.buildings.push({ id: 93, kind: 'castle', x: 15, y: 6 })
    const loaded = stateFromKeep(parseKeep(text(d)), 1)
    expect(loaded.buildings.map((b) => b.id)).toEqual([0, ...k.buildings.map((b) => b.id)])
    expect(stickersLeft(loaded, 'workshop')).toBe(0)
    expect(loaded.basket[thingIndex('blueRock')]).toBe(1 + (k.basket.blueRock ?? 0))
    expect(loaded.basket[thingIndex('blueBar')]).toBe(2 + (k.basket.blueBar ?? 0))
    expect(lintNet(loaded)).toEqual([])
    // A sticker the cards never gave: a fresh game has no lab.
    const fresh = json(freshKeep())
    fresh.buildings.push({ id: 5, kind: 'lab', x: 9, y: 4, held: { greenBottle: 3 }, queue: [], stack: [], batch: null, outTurn: 0, inTurn: 0, ammo: 0, stars: 0, busy: 0, starved: 0 })
    const none = stateFromKeep(parseKeep(text(fresh)), 1)
    expect(none.buildings.some((b) => b.kind === 'lab')).toBe(false)
    expect(none.basket[thingIndex('greenBottle')]).toBe(3)
  })

  it('keeps what a building can hold and sends the rest to the basket', () => {
    const d = json(keepOf(rich()))
    const lab = d.buildings.find((b: any) => b.kind === 'lab')
    lab.held = { greenBottle: 5, gear: 2 }
    lab.stack = ['greenBottle']
    const oven = d.buildings.find((b: any) => b.kind === 'oven')
    oven.queue = ['blueRock', 'gear', 'goldRock', 'blueRock', 'blueRock', 'goldRock']
    const loaded = stateFromKeep(parseKeep(text(d)), 1)
    const l = loaded.buildings.find((b) => b.kind === 'lab')!
    expect(l.held[thingIndex('greenBottle')]).toBe(5)
    expect(l.held[thingIndex('gear')]).toBe(0)
    expect(l.stack).toEqual([])
    expect(loaded.buildings.find((b) => b.id === oven.id)!.queue).toEqual(['blueRock', 'goldRock', 'blueRock', 'blueRock'])
  })

  it('gives a building with a repeated id a new one past every other', () => {
    const k = keepOf(rich())
    const d = json(k)
    d.buildings[1].id = d.buildings[0].id
    const loaded = stateFromKeep(parseKeep(text(d)), 1)
    const ids = loaded.buildings.map((b) => b.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids[2]).toBe(k.nextId)
    expect(loaded.nextId).toBe(k.nextId + 1)
  })

  it('lays no belt where none can be, nor both cells of a head-on pair, and makes a fork with no branch a plain belt', () => {
    const d = json(freshKeep())
    const rows = (d.belts as string[]).map((r) => r.split(' '))
    rows[8]![0] = '20--000' // the pond
    rows[0]![5] = '20--000' // closed land at land 1
    rows[6]![6] = '20--000:-b' // under the start oven
    rows[5]![9] = '20--000'
    rows[5]![10] = '02--000' // head-on with its neighbour
    rows[4]![8] = '201-000' // a fork south with no branch there
    rows[4]![9] = '20--000'
    d.belts = rows.map((r) => r.join(' '))
    const loaded = stateFromKeep(parseKeep(text(d)), 1)
    for (const [x, y] of [[0, 8], [5, 0], [6, 6], [9, 5], [10, 5]]) expect(loaded.belts.out[cellOf(x!, y!)], `${x}, ${y}`).toBe(-1)
    expect(loaded.belts.out[cellOf(8, 4)]).toBe(0)
    expect(loaded.belts.fork[cellOf(8, 4)]).toBe(-1)
    expect(loaded.basket[thingIndex('blueBar')]).toBe(1)
    expect(lintNet(loaded)).toEqual([])
  })

  it('plants hedges only where one could be drawn, within the stickers given', () => {
    const s = rich()
    const d = json(keepOf(s))
    const belt = s.belts.out.findIndex((out) => out >= 0)
    // On a belt, under the blue digger (on its rocks), beside the pad, and the top row's grass, more than the cards gave.
    expect(s.buildings.find((b) => b.id === s.owner[cellOf(7, 2)])!.kind).toBe('digger')
    d.hedges.push([xOf(belt), yOf(belt)], [7, 2], [4, 5], ...Array.from({ length: 20 }, (_, i) => [i, 0]))
    const loaded = stateFromKeep(parseKeep(text(d)), 1)
    expect(loaded.hedge[belt]).toBe(0)
    expect(loaded.hedge[cellOf(7, 2)]).toBe(0)
    expect(loaded.hedge[cellOf(4, 5)]).toBe(0)
    expect(stickersLeft(loaded, 'hedge')).toBe(0)
    expect(lintNet(loaded)).toEqual([])
  })

  it('keeps a hedge and a stump on bare rocks, where her hedge tool draws them too', () => {
    const s = rich()
    const rocks = Array.from({ length: CELLS }, (_, c) => c).filter((c) => (GROUND[c] === 'blue' || GROUND[c] === 'gold') && cellInLand(s.land, c) && s.owner[c]! < 0 && s.belts.out[c]! < 0 && s.hedge[c] === 0)
    const [hedge, stump] = rocks as [number, number]
    act(s, { kind: 'tool', tool: { kind: 'hedge' } })
    act(s, { kind: 'drag', cells: [hedge] })
    act(s, { kind: 'release', commit: true })
    s.hedge[stump] = 2
    s.stumpAt[stump] = s.tick
    expect(s.hedge[hedge]).toBe(1)
    const left = stickersLeft(s, 'hedge')
    const loaded = stateFromKeep(parseKeep(serializeKeep(keepOf(s))), 1)
    expect([loaded.hedge[hedge], loaded.hedge[stump]]).toEqual([1, 2])
    expect(loaded.stumpAt[stump]! - loaded.tick).toBe(0)
    expect(stickersLeft(loaded, 'hedge')).toBe(left)
    expect(lintNet(loaded)).toEqual([])
  })

  it('reads a sleep, a stump and a batch time within their bounds', () => {
    const s = rich()
    const d = json(keepOf(s))
    const stump = freeCell(s)
    d.burrows[0].sleep = 1e9
    d.stumps = [[xOf(stump), yOf(stump), 1e9]]
    const loaded = stateFromKeep(parseKeep(text(d)), 1)
    expect(loaded.burrows[0]!.sleepUntil - loaded.tick).toBeLessThanOrEqual(Math.max(ticks(240), HELLO_SLEEP))
    expect(loaded.stumpAt[stump]).toBe(loaded.tick)
    // A batch saved off its hop ends on the next one.
    const e = json(keepOf(rich()))
    const b = e.buildings.find((x: any) => x.batch !== null)
    b.batch.left = 0.01
    const off = stateFromKeep(parseKeep(text(e)), 1)
    expect(off.buildings.find((x) => x.id === b.id)!.batch!.until % HOP).toBe(0)
  })

  it('brings back a launch-free, night-free, tucked-free new day', () => {
    const s = demoState('night', 2)
    const loaded = stateFromKeep(keepOf(s), 2)
    expect(loaded.night).toBeNull()
    expect(loaded.buildings.every((b) => !b.tucked)).toBe(true)
    expect(loaded.card).toBeNull()
    expect(loaded.sessionAt).toBe(loaded.tick)
  })
})

describe('the equality test', () => {
  it("steps a load of the save just as the state itself steps, everyone sent home, through the new session's calm and 4 minutes past it, visits and all", { timeout: 30_000 }, () => {
    for (const [name, seed] of [['factory', 4], ['land3', 6]] as const) {
      const s = demoState(name, seed)
      // Not on a whole second, so the load must keep the beat.
      for (let i = 0; i < 137; i++) step(s)
      sentHome(s)
      // A load begins a new session (stateFromKeep), which no save holds: the touches, the pause, the turn, the last card and the last visit home go with the old one. The state begins one too, so the kind rules hold a visit back alike in both.
      Object.assign(s, { sessionAt: s.tick, lastTouchAt: -1, touching: false, turnedAt: -1, pauseClosedAt: -1, cardClosedAt: -1, lastHomeAt: -1 })
      const loaded = stateFromKeep(parseKeep(serializeKeep(keepOf(s))), s.rng)
      act(loaded, { kind: 'play' })
      loaded.queued = []
      expect(keepOf(loaded), name).toEqual(keepOf(s))
      // A finger on the glass every 5 s, as she plays, so the munchers visit once the calm is over and their visits are compared too.
      let visits = 0
      for (let k = 1; k * 300 <= SESSION_CALM + ticks(4 * 60); k++) {
        for (const x of [s, loaded]) {
          act(x, { kind: 'touch', down: true })
          act(x, { kind: 'touch', down: false })
        }
        for (let i = 0; i < 300; i++) {
          step(s)
          step(loaded)
          if (s.visit !== null && s.visit.at === s.tick - 1) visits++
        }
        expect(keepOf(loaded), `${name} after ${k * 5} s`).toEqual(keepOf(s))
      }
      expect(visits, `${name}: visits compared`).toBeGreaterThan(0)
    }
  })

  it('keeps the factory moving from its first 30 s, so the steps compared are real ones: things ride, machines work, the lab drinks toward its card', () => {
    const s = demoState('factory', 4)
    const before = keepOf(s)
    for (let i = 0; i < ticks(30); i++) step(s)
    const after = keepOf(s)
    expect(after.belts).not.toEqual(before.belts)
    expect(after.buildings).not.toEqual(before.buildings)
    expect([after.lab.green, after.found]).not.toEqual([before.lab.green, before.found])
  })

  it('keeps the rocket and its parts as counts', () => {
    const s = rich()
    s.rocket.got = PARTS.map((p) => PART_INFO[p].n - 1)
    expect(stateFromKeep(keepOf(s), 1).rocket.got).toEqual(s.rocket.got)
  })

  it('never saves a slot the belts do not have', () => {
    const s = rich()
    const loaded = stateFromKeep(keepOf(s), 1)
    for (let c = 0; c < CELLS; c++) if (loaded.belts.out[c]! < 0) expect([loaded.belts.slot[inSlot(c)], loaded.belts.slot[outSlot(c)]]).toEqual([-1, -1])
  })
})
