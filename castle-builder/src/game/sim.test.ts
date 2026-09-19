/**
 * Runs Castle Builder in node for minutes at a time with two kinds of player at the
 * screen: a builder who works through the King's wishes and drops everything to douse
 * and hammer, and a child who taps anything at random. Then each rule on its own, on a
 * fresh island with just the thing under test on it.
 */
import { describe, expect, it } from 'vitest'

import { mulberry32 } from './random'
import {
  BLOW_AT, CELL, CLOUD_FAR_X, COST, DAY, DOUSE_FOR, FIRE_FOR, FIRST_STORM_AFTER, GOLDEN_WORTH, GOODS, GRID, HEIGHT, ISLAND_R, KEEP_COL, KEEP_EVERY,
  KEEP_MAX_LEVEL, KEEP_R, KEEP_ROW, LIGHTNING_AT, MAX_STOREYS, NIGHT_FROM, NODE_GOOD, NODE_KINDS, NODE_MAX, ORBIT_FOR, OUTPUT_CAP, PIECE_REACH, PUDDLES,
  RAIN_AT, RAIN_DOUSE, REACH, RECIPE, REGROW, REPAIR_FOR, SAFE_FOR, SHEEP_FLIP_FOR, SHEEP_FOLLOW_FOR, SHEEP_ROAM, SIZE, STOREY_COST, STOREY_H,
  STORM_EVERY, STORM_MIN_PIECES, SWING, SWINGS_PER_UNIT, TAP_HELPS, THUNDER_FOR, UNPAINTED, WARN_FOR, WIND_FOR, WISHES, WORKER_SPEED, YARD_COL, YARD_ROW,
  affordable, canPlace, cellIndex, costEntries, count, createSim, currentWish, dist, doorOf, ghostCell, groundAt, look, makerOf, nearPiece, nodeById,
  pieceCentre, pieceTop, place, press, raining, restore, select, serialize, setMove, setStorms, tapNode, tapPiece, tick, unlocked, walkTo, wishProgress,
  type EventKind, type Good, type Made, type Node, type NodeKind, type Piece, type PieceKind, type Sim, type SimEvent, type Storm,
} from './sim'

const DT = 1 / 60
type Driver = (s: Sim) => void
const kinds = (events: SimEvent[]) => events.map((e) => e.kind)

/** Ticks `seconds` on, drivers first, and returns every event in order. */
function drive(s: Sim, seconds: number, ...drivers: Driver[]) {
  const events: SimEvent[] = []
  for (let i = Math.round(seconds / DT); i > 0; i--) {
    for (const d of drivers) d(s)
    tick(s, DT)
    events.push(...s.events)
    s.events.length = 0
  }
  return events
}

/** Ticks on until an event of this kind happens (that tick included), or fails after `most` seconds. */
function driveUntil(s: Sim, kind: EventKind, most: number, ...drivers: Driver[]): SimEvent {
  for (let i = Math.round(most / DT); i > 0; i--) {
    for (const d of drivers) d(s)
    tick(s, DT)
    const seen = s.events.find((e) => e.kind === kind)
    s.events.length = 0
    if (seen) return seen
  }
  throw new Error(`no ${kind} within ${most} s`)
}

/** What must hold after every tick, whoever is playing. Throws with the reason, so a long run fails with a message. */
function check(s: Sim) {
  const fail = (why: string) => {
    throw new Error(`at ${s.time.toFixed(2)} s: ${why}`)
  }
  for (const g of GOODS) if (s.store[g] < 0) fail(`${g} is ${s.store[g]}`)
  if (s.pieces.filter((p) => p.state === 'burning').length > 1) fail('two fires at once')
  const walkers: { x: number; z: number }[] = [s.hero, ...s.workers, ...s.nodes.filter((n) => n.kind === 'sheep')]
  for (const w of walkers) {
    const r = Math.hypot(w.x, w.z)
    if (!Number.isFinite(r)) fail('a walker is lost')
    if (r < KEEP_R - 1e-6) fail(`a walker is in the keep at ${w.x}, ${w.z}`)
    if (r > ISLAND_R) fail(`a walker is off the island at ${w.x}, ${w.z}`)
  }
  for (const w of [s.hero, ...s.workers]) if (!Number.isFinite(w.y)) fail('a walker has no height')
  for (const n of s.nodes) if (!Number.isFinite(n.x + n.z)) fail(`node ${n.id} is lost`)
}

/** Drives `seconds` at 60 Hz from a fresh island with a player at the screen, checking the invariants after every tick. */
function run(seed: number, seconds: number, player: Driver, watch: Driver = () => {}) {
  const s = createSim(mulberry32(seed))
  const counts: Partial<Record<EventKind, number>> = {}
  for (let i = Math.round(seconds / DT); i > 0; i--) {
    player(s)
    tick(s, DT)
    for (const e of s.events) counts[e.kind] = (counts[e.kind] ?? 0) + 1
    s.events.length = 0
    check(s)
    watch(s)
  }
  return { s, counts }
}

/** The game survives the browser's save: restored, it serialises to the same JSON again, with the same castle and yard. */
function roundTrips(s: Sim) {
  const t = createSim(mulberry32(0))
  expect(restore(t, serialize(s))).toBe(true)
  const json = serialize(t)
  const u = createSim(mulberry32(0))
  expect(restore(u, json)).toBe(true)
  expect(serialize(u)).toBe(json)
  expect(t.pieces).toEqual(s.pieces)
  expect(t.store).toEqual(s.store)
  expect(t.nodes).toEqual(s.nodes)
  expect(t.time).toBe(s.time)
  expect(t.phase).toBe('ready')
}

const nodeKindOf = (good: Good) => NODE_KINDS.find((k) => k !== 'lostbanner' && NODE_GOOD[k] === good) ?? null
type Aim = { node: number } | { build: PieceKind } | 'wait'

/** What to do now to have `n` more of a good: gather from a node, build the maker, or wait for its person. */
function towards(s: Sim, good: Good, n: number, goal: number): Aim {
  const kind = nodeKindOf(good)
  if (kind) {
    const held = s.nodes.find((m) => m.id === goal)
    if (held && held.kind === kind && held.left > 0) return { node: goal }
    let best: Node | null = null
    for (const m of s.nodes) if (m.kind === kind && m.left > 0 && (!best || dist(m.x, m.z, s.hero.x, s.hero.z) < dist(best.x, best.z, s.hero.x, s.hero.z))) best = m
    return best ? { node: best.id } : 'wait'
  }
  const shop = makerOf(good as Made)
  const bench = s.pieces.find((p) => p.kind === shop)
  if (!bench) return build(s, shop, 1, goal)
  const person = s.workers.find((w) => w.piece === bench.id)!
  const more = n - (person.state === 'carry' || person.state === 'work' ? 1 : 0)
  for (const [g, k] of costEntries(RECIPE[shop].inputs)) if (s.store[g] < k * more) return towards(s, g, k * more - s.store[g], goal)
  return 'wait'
}

/** Places a piece when the yard can pay for one, else goes after the first thing missing for all `n`. */
function build(s: Sim, kind: PieceKind, n: number, goal: number): Aim {
  const missing = affordable(s, kind)
  if (missing === null) return { build: kind }
  return towards(s, missing, COST[kind][missing]! * n - s.store[missing], goal)
}

/** A player who works through the King's wishes, and drops everything to douse a fire, hammer a broken piece or fetch a blown banner. */
function builder(): Driver {
  let goal = -1
  let heading = -1
  let tappedAt = -1
  const pursue = (s: Sim, id: number) => {
    const n = nodeById(s, id)
    const h = s.hero
    if (id !== goal) {
      goal = id
      tapNode(s, id)
    } else if (h.target === null && h.job === null && dist(n.x, n.z, h.x, h.z) > REACH - 0.6) walkTo(s, n.x, n.z)
  }
  return (s) => {
    if (s.phase === 'ready') {
      press(s)
      return
    }
    const h = s.hero
    const trouble = s.pieces.find((p) => p.state === 'burning') ?? s.pieces.find((p) => p.state === 'broken')
    if (trouble) {
      const lost = trouble.kind === 'banner' ? s.nodes.find((n) => n.kind === 'lostbanner' && n.piece === trouble.id) : undefined
      if (lost) pursue(s, lost.id)
      else if (!nearPiece(trouble, h.x, h.z, PIECE_REACH)) {
        if (heading !== trouble.id) tapPiece(s, trouble.id)
        heading = trouble.id
      } else if (h.job && h.job.id === trouble.id && s.time - tappedAt >= TAP_HELPS) {
        tapPiece(s, trouble.id)
        tappedAt = s.time
      }
      return
    }
    heading = -1
    const wish = currentWish(s)
    if (!wish) return
    const aim = build(s, wish.kind, wish.count - count(s, wish.kind), goal)
    if (aim === 'wait') return
    if ('node' in aim) {
      pursue(s, aim.node)
      return
    }
    if (s.selected !== aim.build) select(s, aim.build)
    press(s)
  }
}

/** A child who taps whatever is under the finger every so often, and a build button now and then. */
function child(seed: number): Driver {
  const rand = mulberry32(seed)
  const pick = <T>(list: readonly T[]) => list[Math.floor(rand() * list.length)]!
  let tapAt = 0
  let buildAt = 0
  return (s) => {
    if (s.phase === 'ready') {
      press(s)
      return
    }
    if (s.time >= tapAt) {
      tapAt = s.time + 0.8
      const r = rand()
      if (r < 0.3) {
        const a = rand() * Math.PI * 2
        const d = rand() * ISLAND_R
        walkTo(s, Math.cos(a) * d, Math.sin(a) * d)
      } else if (r < 0.55) tapNode(s, pick(s.nodes).id)
      else if (r < 0.8 && s.pieces.length > 0) tapPiece(s, pick(s.pieces).id)
      else press(s)
    }
    if (s.time >= buildAt) {
      buildAt = s.time + 6
      select(s, pick(unlocked(s)))
      press(s)
    }
  }
}

describe('the loop', () => {
  it('a builder gets every wish done in twenty minutes, through storms, a fire and broken walls, and the game saves', () => {
    let troubled = false
    const { s, counts } = run(1, 1200, builder(), (s) => {
      if (s.pieces.some((p) => p.state !== 'ok')) troubled = true
    })
    expect(s.wishIndex).toBe(WISHES.length)
    expect(s.storms).toBeGreaterThanOrEqual(2)
    expect(counts.lightning).toBeGreaterThanOrEqual(1)
    expect(troubled).toBe(true)
    expect((counts.repaired ?? 0) + (counts.fireOut ?? 0)).toBeGreaterThan(0)
    expect(s.pieces.every((p) => p.state === 'ok')).toBe(true)
    expect(s.pieces.length).toBeGreaterThanOrEqual(23)
    roundTrips(s)
  })

  it('a child tapping at random for fifteen minutes breaks nothing', () => {
    const { s, counts } = run(2, 900, child(3))
    expect(counts.place).toBeGreaterThanOrEqual(1)
    expect(counts.lifted).toBeGreaterThanOrEqual(1)
    expect(counts.cannot).toBeGreaterThanOrEqual(1)
    expect(counts.baa).toBeGreaterThanOrEqual(1)
    roundTrips(s)
  })

  it('twenty islands each survive ten minutes of a different child, with the grid and the people still in one piece', { timeout: 300000 }, () => {
    let built = 0
    for (let seed = 1; seed <= 20; seed++) {
      const { s } = run(seed, 600, child(seed * 31))
      // Every cell claims a piece that is there, every piece holds as many cells as it covers, every person has a workshop.
      for (const id of s.cells) if (id > 0) expect(s.pieces.some((p) => p.id === id)).toBe(true)
      for (const p of s.pieces) expect(s.cells.filter((id) => id === p.id).length).toBe(SIZE[p.kind] ** 2)
      for (const w of s.workers) expect(s.pieces.some((p) => p.id === w.piece)).toBe(true)
      built += s.pieces.length
    }
    expect(built).toBeGreaterThan(20)
  })

  it('text that is not a castle from this version is refused, and the island stays fresh', () => {
    const blank = serialize(createSim(mulberry32(1)))
    for (const text of ['', '{"version":1,"tim', 'null', '7', '"a castle"', '{"version":2}']) {
      const s = createSim(mulberry32(1))
      expect(restore(s, text)).toBe(false)
      expect(serialize(s)).toBe(blank)
    }
    expect(restore(createSim(mulberry32(1)), blank)).toBe(true)
  })
})

/** A fresh island in play, with the weather off and a random that never turns up gold. */
function fresh() {
  const s = createSim(mulberry32(1))
  press(s)
  setStorms(s, false)
  s.random = () => 0.5
  s.events.length = 0
  return s
}

/** Pays for a piece, places it at a cell, and leaves nothing chosen. */
function put(s: Sim, kind: PieceKind, col: number, row: number): Piece {
  for (const [g, n] of costEntries(COST[kind])) s.store[g] += n
  s.selected = kind
  expect(place(s, col, row)).toBe(true)
  s.selected = null
  s.events.length = 0
  return s.pieces[s.pieces.length - 1]!
}

/** `n` pieces of a kind along the top rows, all built long enough ago for the weather to pick on them. */
function oldPieces(s: Sim, kind: PieceKind, n: number) {
  const pieces = Array.from({ length: n }, (_, i) => put(s, kind, i % GRID, Math.floor(i / GRID)))
  for (const p of pieces) p.builtAt = -SAFE_FOR - 1
  return pieces
}

/** The next storm, of this kind, is due right now. */
function stormNow(s: Sim, storm: Storm) {
  setStorms(s, true)
  s.lastStormEndAt = -STORM_EVERY
  s.storms = storm === 'thunder' ? 0 : 1
}

/** Puts the hero down, standing still. */
function stand(s: Sim, x: number, z: number) {
  Object.assign(s.hero, { x, z, target: null, job: null, input: { dx: 0, dz: 0 } })
}

/** A spot on the +X side of a piece, within hammering reach. */
function beside(p: Piece) {
  const c = pieceCentre(p)
  return { x: c.x + (SIZE[p.kind] * CELL) / 2 + 1, z: c.z }
}

/** Moves a node to a clear spot on the lawn, home and all, so nothing else is in reach of it. */
function moveNode(n: Node, x: number, z: number) {
  Object.assign(n, { x, z, hx: x, hz: z, tx: x, tz: z })
}
const first = (s: Sim, kind: NodeKind) => s.nodes.find((n) => n.kind === kind)!

describe('gathering', () => {
  it('the hero next to a tree chops a log every two swings, strips it bare, and it grows back', () => {
    const s = fresh()
    const tree = first(s, 'tree')
    moveNode(tree, 10, 10)
    stand(s, 11.2, 10)
    tapNode(s, tree.id)
    const t0 = s.time
    const got = driveUntil(s, 'gather', 2)
    expect(got.good).toBe('wood')
    expect(s.time - t0).toBeCloseTo(SWING * SWINGS_PER_UNIT, 1)
    expect(s.store.wood).toBe(4)
    expect(tree.left).toBe(NODE_MAX.tree - 1)
    expect(tree.hitAt).toBe(s.time)
    expect(s.hero.swungAt).toBe(s.time)
    expect(s.flights.map((f) => f.good)).toEqual(['wood'])
    const events = drive(s, SWING * SWINGS_PER_UNIT * (NODE_MAX.tree - 1) + 0.1)
    expect(kinds(events).filter((k) => k === 'gather').length).toBe(NODE_MAX.tree - 1)
    expect(tree.left).toBe(0)
    expect(s.store.wood).toBe(3 + NODE_MAX.tree)
    expect(s.hero.job).toBeNull()
    const bare = s.time
    const back = driveUntil(s, 'regrow', REGROW.tree + 1)
    expect(back.node).toBe('tree')
    expect(s.time - bare).toBeCloseTo(REGROW.tree, 0)
    expect(tree.left).toBe(NODE_MAX.tree)
  })

  it('now and then a unit is golden and counts for three', () => {
    const s = fresh()
    s.random = () => 0
    const rock = first(s, 'rock')
    moveNode(rock, 10, 10)
    stand(s, 11.2, 10)
    const got = driveUntil(s, 'golden', 2)
    expect(got.good).toBe('stone')
    expect(s.store.stone).toBe(3 + GOLDEN_WORTH)
    expect(s.flights[0]!.golden).toBe(true)
  })

  it('a tapped node is worked on before a nearer one', () => {
    const s = fresh()
    const tree = first(s, 'tree')
    const rock = first(s, 'rock')
    moveNode(rock, 11, 10)
    moveNode(tree, 12, 10)
    stand(s, 10, 10)
    drive(s, SWING * SWINGS_PER_UNIT + 0.1)
    expect(s.store.stone).toBe(4)
    expect(s.store.wood).toBe(3)
    tapNode(s, tree.id)
    drive(s, SWING * SWINGS_PER_UNIT + 0.1)
    expect(s.store.wood).toBe(4)
    expect(s.store.stone).toBe(4)
    expect(s.hero.job!.id).toBe(tree.id)
  })
})

describe('workers', () => {
  it('the mason fetches stone from the yard, carries it home, works, and blocks come out; the yard fills to the cap and no further', () => {
    const s = fresh()
    const shop = put(s, 'mason', KEEP_COL, GRID - 1)
    const w = s.workers[0]!
    expect(w.state).toBe('wait')
    expect({ x: w.x, z: w.z }).toEqual(doorOf(shop))
    const fetched = driveUntil(s, 'fetch', 5)
    expect(s.store.stone).toBe(2)
    expect(w.carrying).toBe('stone')
    expect(w.state).toBe('carry')
    const walk = dist(fetched.x, fetched.z, doorOf(shop).x, doorOf(shop).z) / WORKER_SPEED
    const t0 = s.time
    const made = driveUntil(s, 'made', 10)
    expect(made.good).toBe('blocks')
    expect(Math.abs(s.time - t0 - (walk + RECIPE.mason.seconds))).toBeLessThan(0.1)
    expect(s.store.blocks).toBe(1)
    expect(w.madeAt).toBe(s.time)
    expect(w.state).toBe('wait')
    expect(s.flights.map((f) => f.good)).toEqual(['blocks'])
    s.store.stone = 20
    drive(s, 100)
    expect(s.store.blocks).toBe(OUTPUT_CAP)
    expect(s.store.stone).toBe(20 - (OUTPUT_CAP - 1))
    expect(w.state).toBe('wait')
    drive(s, 20)
    expect(s.store.blocks).toBe(OUTPUT_CAP)
  })

  it('the dyer waits until the yard has both cloth and flowers', () => {
    const s = fresh()
    put(s, 'dyer', 0, GRID - 1)
    const w = s.workers[0]!
    s.store.cloth = 1
    drive(s, 5)
    expect(w.state).toBe('wait')
    expect(s.store.cloth).toBe(1)
    s.store.flowers = 1
    driveUntil(s, 'made', 15)
    expect(s.store).toMatchObject({ cloth: 0, flowers: 0, colourcloth: 1 })
  })
})

describe('placement', () => {
  it('canPlace refuses the keep, the yard, taken cells and the edge; the hall needs a free two by two', () => {
    const s = fresh()
    expect(canPlace(s, 'wall', KEEP_COL, KEEP_ROW)).toBe(false)
    expect(canPlace(s, 'wall', YARD_COL, YARD_ROW)).toBe(false)
    expect(canPlace(s, 'wall', GRID, 0)).toBe(false)
    expect(canPlace(s, 'wall', 6, 6)).toBe(true)
    expect(canPlace(s, 'hall', 2, 2)).toBe(false)
    expect(canPlace(s, 'hall', 6, 6)).toBe(false)
    expect(canPlace(s, 'hall', 0, 0)).toBe(true)
    put(s, 'wall', 1, 1)
    expect(canPlace(s, 'wall', 1, 1)).toBe(false)
    expect(canPlace(s, 'hall', 0, 0)).toBe(false)
    expect(canPlace(s, 'hall', 5, 5)).toBe(true)
    const hall = put(s, 'hall', 6, 6)
    expect([hall.col, hall.row]).toEqual([5, 5])
    expect([5, 6].flatMap((c) => [5, 6].map((r) => s.cells[cellIndex(c, r)]))).toEqual([hall.id, hall.id, hall.id, hall.id])
  })

  it('placing pays the cost, marks the cells and puts a person at the door', () => {
    const s = fresh()
    select(s, 'mason')
    expect(kinds(s.events)).toEqual(['select'])
    s.events.length = 0
    expect(place(s, KEEP_COL, GRID - 1)).toBe(true)
    expect(s.store.wood).toBe(3 - COST.mason.wood!)
    const p = s.pieces[0]!
    expect(p).toMatchObject({ kind: 'mason', col: KEEP_COL, row: GRID - 1, state: 'ok', builtAt: s.time, colour: UNPAINTED })
    expect(s.cells[cellIndex(KEEP_COL, GRID - 1)]).toBe(p.id)
    expect(s.workers[0]).toMatchObject({ piece: p.id, kind: 'mason', state: 'wait' })
    expect(kinds(s.events)).toEqual(['place'])
    expect(s.cheerAt).toBe(s.time)
  })

  it('a piece the yard cannot pay for says what is missing and points at it; the ghost is the free cell nearest the hero', () => {
    const s = fresh()
    expect(ghostCell(s)).toBeNull()
    select(s, 'wall')
    expect(s.selected).toBe('wall')
    expect(kinds(s.events)).toEqual(['select', 'cannot'])
    expect(s.events[1]!.good).toBe('blocks')
    expect(s.hint).toEqual({ good: 'blocks', at: s.time })
    s.events.length = 0
    expect(ghostCell(s)).toEqual({ col: 3, row: 6 })
    expect(place(s, 3, 6)).toBe(false)
    expect(s.events.map((e) => [e.kind, e.good])).toEqual([['cannot', 'blocks']])
    expect(s.pieces).toEqual([])
    stand(s, -12, -12)
    expect(ghostCell(s)).toEqual({ col: 0, row: 0 })
    s.store.blocks = 1
    press(s)
    expect(s.pieces[0]).toMatchObject({ kind: 'wall', col: 0, row: 0 })
    expect(s.store.blocks).toBe(0)
    expect(ghostCell(s)).toEqual({ col: 1, row: 0 })
    select(s, 'paint')
    expect(ghostCell(s)).toBeNull()
    expect(place(s, 1, 0)).toBe(false)
  })

  it('the hand takes a piece back up: the goods come home, the cell is free and the person goes too', () => {
    const s = fresh()
    expect(unlocked(s)).not.toContain('lift')
    const shop = put(s, 'mason', KEEP_COL, GRID - 1)
    expect(unlocked(s)).toContain('lift')
    s.store.stone = 1
    driveUntil(s, 'fetch', 5)
    expect(s.workers[0]!.carrying).toBe('stone')
    expect(s.store.stone).toBe(0)
    const wood = s.store.wood
    select(s, 'lift')
    s.events.length = 0
    tapPiece(s, shop.id)
    expect(s.events.map((e) => [e.kind, e.piece])).toEqual([['lifted', 'mason']])
    expect(s.pieces).toEqual([])
    expect(s.workers).toEqual([])
    expect(s.store.wood).toBe(wood + COST.mason.wood!)
    expect(s.store.stone).toBe(1)
    expect(s.cells[cellIndex(KEEP_COL, GRID - 1)]).toBe(0)
    expect(canPlace(s, 'mason', KEEP_COL, GRID - 1)).toBe(true)
    expect(unlocked(s)).not.toContain('lift')
    expect(kinds(drive(s, 2))).not.toContain('made')
    const walls = Array.from({ length: KEEP_EVERY }, (_, i) => put(s, 'wall', i, 0))
    expect(s.keepLevel).toBe(1)
    select(s, 'lift')
    tapPiece(s, walls[0]!.id)
    expect(s.pieces.length).toBe(KEEP_EVERY - 1)
    expect(s.keepLevel).toBe(0)
    // A tower comes back up with the blocks its extra storeys cost as well.
    const tower = put(s, 'tower', GRID - 1, GRID - 1)
    s.store.blocks = STOREY_COST * (MAX_STOREYS - 1)
    for (let n = 2; n <= MAX_STOREYS; n++) tapPiece(s, tower.id)
    expect(tower.storeys).toBe(MAX_STOREYS)
    expect(s.store.blocks).toBe(0)
    select(s, 'lift')
    tapPiece(s, tower.id)
    expect(s.store.blocks).toBe(COST.tower.blocks! + STOREY_COST * (MAX_STOREYS - 1))
  })

  it('the big button buzzes when the chosen piece fits nowhere', () => {
    const s = fresh()
    for (let row = 0; row < GRID; row++) for (let col = 0; col < GRID; col++) if (s.cells[cellIndex(col, row)] === 0) put(s, 'wall', col, row)
    expect(s.pieces.length).toBe(GRID * GRID - 2)
    select(s, 'wall')
    s.events.length = 0
    expect(ghostCell(s)).toBeNull()
    press(s)
    expect(s.events.map((e) => [e.kind, e.good, e.piece])).toEqual([['cannot', null, 'wall']])
    expect(s.pieces.length).toBe(GRID * GRID - 2)
  })

  it('the dance hall starts at the cell that was tapped when it fits there', () => {
    const s = fresh()
    for (const [g, n] of costEntries(COST.hall)) s.store[g] += n
    s.selected = 'hall'
    expect(place(s, 1, 1)).toBe(true)
    const hall = s.pieces[0]!
    expect([hall.col, hall.row]).toEqual([1, 1])
    expect([1, 2].flatMap((c) => [1, 2].map((r) => s.cells[cellIndex(c, r)]))).toEqual([hall.id, hall.id, hall.id, hall.id])
    expect(s.cells[cellIndex(0, 0)]).toBe(0)
  })
})

describe('wishes', () => {
  it('the first wish done bumps the index, unlocks the next piece, and everybody cheers while the camera goes round', () => {
    const s = fresh()
    expect(currentWish(s)).toEqual(WISHES[0])
    expect(unlocked(s)).toEqual(['mason'])
    expect(wishProgress(s)).toBe(0)
    put(s, 'mason', KEEP_COL, GRID - 1)
    expect(wishProgress(s)).toBe(1)
    const events = drive(s, DT)
    expect(events.map((e) => [e.kind, e.piece])).toEqual([
      ['wish', 'mason'],
      ['newWish', WISHES[1]!.kind],
    ])
    expect(s.wishIndex).toBe(1)
    expect(unlocked(s)).toEqual(['mason', WISHES[1]!.kind, 'lift'])
    expect(s.wishDoneAt).toBe(s.time)
    expect(s.cheerAt).toBe(s.time)
    expect(s.orbitUntil).toBe(s.time + ORBIT_FOR)
  })

  it('wishes already met come one fanfare at a time, never in a heap', () => {
    const s = fresh()
    put(s, 'mason', 0, 0)
    for (let i = 0; i < 3; i++) put(s, 'wall', 1 + i, 0)
    put(s, 'woodcutter', 4, 0)
    const firstTick = kinds(drive(s, DT))
    expect(firstTick.filter((k) => k === 'wish').length).toBe(1)
    expect(s.wishIndex).toBe(1)
    const at = s.time
    expect(kinds(drive(s, 1))).not.toContain('wish')
    const next = driveUntil(s, 'wish', ORBIT_FOR + 1)
    expect(next.piece).toBe('wall')
    // The gap is the camera's lap round the castle, so the fanfares never land on top of each other.
    expect(s.time - at).toBeCloseTo(ORBIT_FOR, 1)
    expect(s.wishIndex).toBe(2)
  })
})

describe('storms', () => {
  it('with six pieces and time enough: a warning, thunder, one bolt, rain, then a rainbow with puddles', () => {
    const s = fresh()
    oldPieces(s, 'wall', STORM_MIN_PIECES)
    setStorms(s, true)
    driveUntil(s, 'stormWarn', FIRST_STORM_AFTER + 1)
    expect(s.time).toBeCloseTo(FIRST_STORM_AFTER, 1)
    expect(s.weather).toBe('warning')
    driveUntil(s, 'stormStart', WARN_FOR + 0.1)
    expect(s.weather).toBe('thunder')
    const startAt = s.weatherAt
    const bolt = driveUntil(s, 'lightning', LIGHTNING_AT + 0.1)
    expect(bolt.piece).toBe('wall')
    expect(s.lightning.at).toBe(s.time)
    expect(s.pieces.filter((p) => p.state === 'broken').length).toBe(1)
    driveUntil(s, 'rainStart', RAIN_AT)
    expect(raining(s)).toBe(true)
    expect(s.time - startAt).toBeCloseTo(RAIN_AT, 1)
    driveUntil(s, 'rainbow', THUNDER_FOR)
    expect(s.time - startAt).toBeCloseTo(THUNDER_FOR, 1)
    expect(s).toMatchObject({ weather: 'rainbow', storms: 1, lastStormEndAt: s.time })
    expect(s.puddles.length).toBe(PUDDLES)
    drive(s, 10.1)
    expect(s.weather).toBe('clear')
  })

  it('a bolt breaks a wall but sets a room on fire, never touches a fresh piece, and a bell tower catches it for an iron bar', () => {
    const bolt = (s: Sim) => {
      stormNow(s, 'thunder')
      return driveUntil(s, 'lightning', WARN_FOR + LIGHTNING_AT + 0.1)
    }
    for (const [kind, state] of [['wall', 'broken'], ['room', 'burning']] as const) {
      const s = fresh()
      const pieces = oldPieces(s, kind, STORM_MIN_PIECES)
      expect(bolt(s).piece).toBe(kind)
      const hit = pieces.filter((p) => p.state === state)
      expect(hit.length).toBe(1)
      expect(hit[0]!.stateAt).toBe(s.time)
      expect(s.lightning).toEqual({ at: s.time, ...pieceCentre(hit[0]!), y: HEIGHT[kind] })
    }
    const s = fresh()
    const walls = oldPieces(s, 'wall', STORM_MIN_PIECES)
    for (const w of walls.slice(1)) w.builtAt = s.time
    bolt(s)
    expect(walls.map((w) => w.state)).toEqual(['broken', 'ok', 'ok', 'ok', 'ok', 'ok'])
    const t = fresh()
    oldPieces(t, 'wall', STORM_MIN_PIECES).forEach((w) => (w.builtAt = t.time))
    expect(bolt(t).piece).toBeNull()
    expect(t.pieces.every((p) => p.state === 'ok')).toBe(true)
    const u = fresh()
    oldPieces(u, 'wall', STORM_MIN_PIECES)
    const bell = put(u, 'belltower', 6, 6)
    expect(bolt(u).piece).toBe('belltower')
    expect(u.store.iron).toBe(1)
    expect(u.bongAt).toBe(u.time)
    expect(u.pieces.every((p) => p.state === 'ok')).toBe(true)
    expect(u.lightning).toMatchObject(pieceCentre(bell))
  })

  it('rain puts a fire out; a fire left alone leaves a broken piece; the hero douses in two seconds and hammers in three', () => {
    const burn = (p: Piece, s: Sim) => Object.assign(p, { state: 'burning', stateAt: s.time, repair: 0 })
    const s = fresh()
    const room = burn(put(s, 'room', 0, 0), s)
    s.rainUntil = s.time + 60
    let t0 = s.time
    driveUntil(s, 'fireOut', RAIN_DOUSE + 0.5)
    expect(s.time - t0).toBeCloseTo(RAIN_DOUSE, 1)
    expect(room).toMatchObject({ state: 'ok', dousedAt: s.time, repair: 0 })
    s.rainUntil = -1
    burn(room, s)
    t0 = s.time
    driveUntil(s, 'broke', FIRE_FOR + 0.5)
    expect(s.time - t0).toBeCloseTo(FIRE_FOR, 1)
    expect(room.state).toBe('broken')
    burn(room, s)
    stand(s, beside(room).x, beside(room).z)
    t0 = s.time
    const out = driveUntil(s, 'fireOut', DOUSE_FOR + 0.5)
    expect(out.piece).toBe('room')
    expect(s.time - t0).toBeCloseTo(DOUSE_FOR, 1)
    expect(s.hero.job).toBeNull()
    Object.assign(room, { state: 'broken', stateAt: s.time })
    t0 = s.time
    const events = drive(s, 1)
    expect(kinds(events)).toContain('repairTick')
    expect(s.hero.job).toMatchObject({ kind: 'repair', id: room.id })
    tapPiece(s, room.id)
    expect(kinds(s.events)).toEqual(['repairTick'])
    s.events.length = 0
    expect(room.repair).toBeCloseTo(1 / REPAIR_FOR + TAP_HELPS / REPAIR_FOR, 2)
    driveUntil(s, 'repaired', REPAIR_FOR)
    expect(s.time - t0).toBeCloseTo(REPAIR_FOR - TAP_HELPS, 1)
    expect(room).toMatchObject({ state: 'ok', builtAt: s.time })
    expect(s.cheerAt).toBe(s.time)
  })

  it('the wind takes a banner to the meadow for the hero to fetch, chips a wall, rolls the sheep over, and ends in a rainbow', () => {
    const s = fresh()
    const walls = oldPieces(s, 'wall', STORM_MIN_PIECES)
    const banner = put(s, 'banner', 0, GRID - 1)
    stormNow(s, 'wind')
    driveUntil(s, 'stormStart', WARN_FOR + 0.1)
    expect(s.weather).toBe('wind')
    const gusts = kinds(drive(s, 9.5))
    expect(gusts).toContain('sheepFlip')
    expect(gusts).toContain('blown')
    expect(gusts).toContain('chipped')
    expect(banner.state).toBe('broken')
    const lost = s.nodes.find((n) => n.kind === 'lostbanner')!
    expect(lost).toMatchObject({ piece: banner.id, colour: banner.colour, left: 1 })
    expect(walls.filter((w) => w.state === 'broken').length).toBe(1)
    const sheep = s.nodes.filter((n) => n.kind === 'sheep')
    expect(sheep.every((n) => n.state === 'flipped')).toBe(true)
    const flippedAt = sheep[0]!.stateAt
    tapNode(s, lost.id)
    const fetched = driveUntil(s, 'repaired', 30)
    expect(fetched.piece).toBe('banner')
    expect(banner.state).toBe('ok')
    expect(s.nodes.includes(lost)).toBe(false)
    expect(s.store.colourcloth).toBe(0)
    driveUntil(s, 'rainbow', WIND_FOR)
    expect(s.weather).toBe('rainbow')
    expect(s.lastStormEndAt).toBe(s.time)
    stand(s, sheep[0]!.x + 1, sheep[0]!.z)
    driveUntil(s, 'sheepUp', 0.1)
    expect(sheep[0]!.state).toBe('graze')
    expect(sheep[1]!.state).toBe('flipped')
    stand(s, 0, 12)
    expect(kinds(drive(s, flippedAt + SHEEP_FLIP_FOR - s.time - 0.5))).not.toContain('sheepUp')
    driveUntil(s, 'sheepUp', 1)
    expect(sheep.every((n) => n.state === 'graze')).toBe(true)
  })

  it('no storm at night, with the switch off, before six pieces stand, or while the camera goes round', () => {
    const quiet = (walls: number, prepare: Driver) => {
      const s = fresh()
      oldPieces(s, 'wall', walls)
      stormNow(s, 'thunder')
      prepare(s)
      expect(kinds(drive(s, 30))).not.toContain('stormWarn')
      return s
    }
    quiet(STORM_MIN_PIECES, (s) => void (s.time = DAY * NIGHT_FROM + 1))
    quiet(STORM_MIN_PIECES, (s) => setStorms(s, false))
    const few = quiet(STORM_MIN_PIECES - 1, () => {})
    put(few, 'wall', 6, 6)
    look(few)
    expect(kinds(drive(few, ORBIT_FOR - 0.1))).not.toContain('stormWarn')
    driveUntil(few, 'stormWarn', 0.2)
  })

  it('the rain comes in time to put out the fire the bolt started', () => {
    const s = fresh()
    const rooms = oldPieces(s, 'room', STORM_MIN_PIECES)
    stormNow(s, 'thunder')
    driveUntil(s, 'ignite', WARN_FOR + LIGHTNING_AT + 0.2)
    const lit = s.time
    const fire = rooms.find((p) => p.state === 'burning')!
    const out = driveUntil(s, 'fireOut', FIRE_FOR - 0.5)
    expect(out.piece).toBe('room')
    expect(s.time - lit).toBeCloseTo(RAIN_AT - LIGHTNING_AT + RAIN_DOUSE, 1)
    expect(fire.state).toBe('ok')
    expect(s.pieces.every((p) => p.state === 'ok')).toBe(true)
  })

  it('nothing brews while the start card is up: a game saved mid-storm comes back to sunshine', () => {
    const s = fresh()
    oldPieces(s, 'wall', STORM_MIN_PIECES)
    stormNow(s, 'thunder')
    driveUntil(s, 'stormStart', WARN_FOR + 0.2)
    expect(s.weather).toBe('thunder')
    const t = createSim(mulberry32(1))
    expect(restore(t, serialize(s))).toBe(true)
    expect(t).toMatchObject({ phase: 'ready', weather: 'clear', rainUntil: -1 })
    expect(t.cloud.x).toBe(CLOUD_FAR_X)
    expect(kinds(drive(t, 30))).not.toContain('stormWarn')
    expect(t.weather).toBe('clear')
    expect(t.pieces.every((p) => p.state === 'ok')).toBe(true)
    press(t)
    expect(kinds(drive(t, FIRST_STORM_AFTER - 31))).not.toContain('stormWarn')
    driveUntil(t, 'stormWarn', 2)
  })

  it('a storm already running holds still while the camera goes round', () => {
    const s = fresh()
    oldPieces(s, 'wall', STORM_MIN_PIECES)
    stormNow(s, 'thunder')
    driveUntil(s, 'stormStart', WARN_FOR + 0.2)
    look(s)
    const since = s.time - s.weatherAt
    expect(kinds(drive(s, ORBIT_FOR - 0.5))).not.toContain('lightning')
    expect(s.time - s.weatherAt).toBeCloseTo(since, 1)
    const bolt = driveUntil(s, 'lightning', LIGHTNING_AT + 1)
    expect(bolt.piece).toBe('wall')
    expect(s.pieces.filter((p) => p.state === 'broken').length).toBe(1)
  })

  it('turning the storms off in the middle of a warning sends the cloud away at once', () => {
    const s = fresh()
    oldPieces(s, 'wall', STORM_MIN_PIECES)
    stormNow(s, 'thunder')
    driveUntil(s, 'stormWarn', 1)
    expect(s.weather).toBe('warning')
    s.events.length = 0
    setStorms(s, false)
    expect(kinds(s.events)).toEqual(['rainbow'])
    expect(s).toMatchObject({ weather: 'rainbow', rainUntil: -1, lastStormEndAt: s.time })
    s.events.length = 0
    expect(kinds(drive(s, WARN_FOR + LIGHTNING_AT + 1))).not.toContain('lightning')
    expect(s.weather).toBe('clear')
    expect(s.pieces.every((p) => p.state === 'ok')).toBe(true)
  })

  it('a banner with its cloth out in the meadow waits to be fetched, and the hand brings the cloth home', () => {
    const s = fresh()
    oldPieces(s, 'wall', STORM_MIN_PIECES)
    const banner = put(s, 'banner', 0, GRID - 1)
    stormNow(s, 'wind')
    driveUntil(s, 'blown', WARN_FOR + BLOW_AT + 0.2)
    expect(banner.state).toBe('broken')
    const lost = s.nodes.find((n) => n.kind === 'lostbanner')!
    stand(s, beside(banner).x, beside(banner).z)
    expect(nearPiece(banner, s.hero.x, s.hero.z, PIECE_REACH)).toBe(true)
    expect(kinds(drive(s, 2))).not.toContain('repairTick')
    expect(s.hero.job).toBeNull()
    select(s, 'lift')
    s.events.length = 0
    tapPiece(s, banner.id)
    expect(kinds(s.events)).toEqual(['lifted'])
    expect(s.nodes.includes(lost)).toBe(false)
    expect(s.pieces.includes(banner)).toBe(false)
    expect(s.store.colourcloth).toBe(2)
  })
})

describe('sheep', () => {
  it('baas and hops when the hero comes close, once every few seconds, and runs off a little way when poked', () => {
    const s = fresh()
    s.random = () => 0
    const sheep = first(s, 'sheep')
    moveNode(sheep, 10, 10)
    Object.assign(sheep, { left: 0, regrowAt: -1, hopAt: -10 })
    stand(s, 12, 10)
    driveUntil(s, 'baa', DT * 2)
    expect(sheep.hopAt).toBe(s.time)
    const t0 = s.time
    expect(kinds(drive(s, 4.5))).not.toContain('baa')
    driveUntil(s, 'baa', 1)
    expect(s.time - t0).toBeCloseTo(5, 1)
    tapNode(s, sheep.id)
    expect(kinds(s.events)).toEqual(['baa'])
    expect(sheep.tx).toBe(sheep.hx + SHEEP_ROAM)
    drive(s, 1.5)
    expect(sheep.x).toBeGreaterThan(13)
  })

  it('a shorn sheep follows the hero for a while, then wanders', () => {
    const s = fresh()
    const sheep = first(s, 'sheep')
    moveNode(sheep, 10, 10)
    sheep.wanderAt = Infinity
    stand(s, 11.2, 10)
    drive(s, SWING * SWINGS_PER_UNIT * NODE_MAX.sheep + 0.1)
    expect(sheep).toMatchObject({ left: 0, state: 'follow' })
    walkTo(s, -10, 10)
    drive(s, 8)
    expect(dist(sheep.x, sheep.z, s.hero.x, s.hero.z)).toBeLessThan(2.5)
    drive(s, SHEEP_FOLLOW_FOR - 8 + 0.1)
    expect(sheep.state).toBe('graze')
  })
})

describe('the castle', () => {
  it('a tower grows a storey for two blocks up to three, paint costs one colour cloth in the dye, and the dyer cycles the dye', () => {
    const s = fresh()
    const tower = put(s, 'tower', 0, 0)
    const wall = put(s, 'wall', 1, 0)
    s.store.blocks = STOREY_COST - 1
    tapPiece(s, tower.id)
    expect(s.events.map((e) => [e.kind, e.good])).toEqual([['cannot', 'blocks']])
    expect(s.hint).toEqual({ good: 'blocks', at: s.time })
    s.events.length = 0
    s.store.blocks = STOREY_COST * (MAX_STOREYS - 1) + 1
    for (let n = 2; n <= MAX_STOREYS; n++) {
      tapPiece(s, tower.id)
      expect(tower.storeys).toBe(n)
      expect(kinds(s.events)).toEqual(['grow'])
      s.events.length = 0
    }
    expect(s.store.blocks).toBe(1)
    expect(pieceTop(tower)).toBe(HEIGHT.tower + (MAX_STOREYS - 1) * STOREY_H)
    tapPiece(s, tower.id)
    expect(tower.storeys).toBe(MAX_STOREYS)
    expect(s.events).toEqual([])
    expect(s.hero.target).not.toBeNull()
    select(s, 'paint')
    expect(kinds(s.events)).toEqual(['select', 'cannot'])
    s.events.length = 0
    s.store.colourcloth = 2
    s.dye = 2
    tapPiece(s, tower.id)
    expect(tower.colour).toBe(2)
    expect(s.store.colourcloth).toBe(1)
    expect(kinds(s.events)).toEqual(['paint'])
    s.events.length = 0
    tapPiece(s, wall.id)
    expect(kinds(s.events)).toEqual(['cannot'])
    expect(wall.colour).toBe(UNPAINTED)
    expect(s.store.colourcloth).toBe(1)
    s.selected = null
    const dyer = put(s, 'dyer', 2, 0)
    for (const c of [3, 0, 1, 2]) {
      tapPiece(s, dyer.id)
      expect(s.dye).toBe(c)
    }
    expect(kinds(s.events)).toEqual(['dye', 'dye', 'dye', 'dye'])
  })

  it('the dye pot answers with the brush in hand, and a coat of paint in the colour it already is costs nothing', () => {
    const s = fresh()
    const dyer = put(s, 'dyer', 0, 0)
    const tower = put(s, 'tower', 2, 0)
    s.store.colourcloth = 2
    select(s, 'paint')
    s.events.length = 0
    tapPiece(s, dyer.id)
    expect(s.dye).toBe(1)
    expect(kinds(s.events)).toEqual(['dye'])
    expect(s.selected).toBe('paint')
    expect(s.store.colourcloth).toBe(2)
    s.events.length = 0
    tapPiece(s, tower.id)
    expect(tower.colour).toBe(1)
    expect(s.store.colourcloth).toBe(1)
    expect(kinds(s.events)).toEqual(['paint'])
    s.events.length = 0
    tapPiece(s, tower.id)
    expect(s.events).toEqual([])
    expect(s.store.colourcloth).toBe(1)
  })

  it('a workshop right behind the keep puts its person clear of the keep and off its own roof', () => {
    const s = fresh()
    const shop = put(s, 'woodcutter', KEEP_COL, KEEP_ROW - 1)
    const door = doorOf(shop)
    expect(Math.hypot(door.x, door.z)).toBeGreaterThanOrEqual(KEEP_R + 0.6)
    expect(nearPiece(shop, door.x, door.z, 0)).toBe(false)
    expect(groundAt(s, door.x, door.z)).toBe(0)
    expect({ x: s.workers[0]!.x, z: s.workers[0]!.z }).toEqual(door)
    driveUntil(s, 'fetch', 12, check)
  })

  it('the keep grows a level for every five pieces, up to four', () => {
    const s = fresh()
    for (let i = 0; s.pieces.length < KEEP_EVERY * (KEEP_MAX_LEVEL + 1); i++) {
      const col = i % GRID
      const row = Math.floor(i / GRID)
      if (s.cells[cellIndex(col, row)] !== 0) continue
      s.store.blocks = 1
      s.selected = 'wall'
      place(s, col, row)
      const n = s.pieces.length
      expect(s.keepLevel).toBe(Math.min(KEEP_MAX_LEVEL, Math.floor(n / KEEP_EVERY)))
      expect(kinds(s.events).includes('keepGrew')).toBe(n % KEEP_EVERY === 0 && n <= KEEP_EVERY * KEEP_MAX_LEVEL)
      s.events.length = 0
    }
  })

  it('nobody walks through the keep, and the hero stays on the island', () => {
    const s = fresh()
    walkTo(s, 0, 0)
    drive(s, 4, check)
    expect(Math.hypot(s.hero.x, s.hero.z)).toBeCloseTo(KEEP_R, 3)
    stand(s, 0, 12)
    walkTo(s, 0, -12)
    drive(s, 6, check)
    expect(dist(s.hero.x, s.hero.z, 0, -12)).toBeLessThan(0.3)
    put(s, 'mason', KEEP_COL, KEEP_ROW - 1)
    driveUntil(s, 'fetch', 8, check)
    expect(s.workers[0]!.z).toBeGreaterThan(KEEP_R)
    walkTo(s, 100, 100)
    expect(Math.hypot(s.hero.target!.x, s.hero.target!.z)).toBeCloseTo(ISLAND_R - 1.5, 3)
    drive(s, 12, check)
    expect(Math.abs(Math.hypot(s.hero.x, s.hero.z) - (ISLAND_R - 1.5))).toBeLessThan(0.3)
    setMove(s, 1, 1)
    drive(s, 10, check)
    expect(Math.hypot(s.hero.x, s.hero.z)).toBeLessThanOrEqual(ISLAND_R - 1.2 + 1e-6)
    expect(s.hero.target).toBeNull()
  })
})
