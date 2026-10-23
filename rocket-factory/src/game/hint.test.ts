/**
 * The one next step (plans/rocket-factory.md, The one next step): each rule firing alone and
 * its rank against the next, the steps the board waits on (the choice card's among them), the
 * hold and the hand (for a child who sits still, one who keeps trying, and her peel's Oops),
 * the ghost's delay, a tower's dotted belt and her wobbly stroke along it, her own links counted, the link search (bridges, round buildings, two strokes past
 * STROKE_MAX), the Oops rule's reach, the look's speed on a full land 3, and the hint's own
 * factory built card by card with every script run the way rules.act will run it (strokes.ts's
 * planners, then applyEdit). The doability fuzz at the end runs the first step's script
 * through rules.act itself and steps the game, and plays a whole game the way a child who
 * follows the hint would, through the rules, to the launch.
 */
import { describe, expect, it } from 'vitest'

import { add, cell, emptyBoard, line, put } from './beltKit'
import { FLOWER_OF, cellInLand, cellOf, rockOf, xOf, yOf } from './board'
import { hop, rebuild } from './belts'
import { BLOCKED_HINT, BOTTLENECK_WAIT, DEFEND_KEPT, GHOST_DELAY, HAND_AFTER, HEAP_HINT, HELP_FULL, HINT_EVERY, HINT_HOLD, OOPS_HAND, OOPS_HINT, PART_INFO, STAGE_AT, STROKE_MAX, TOWER_REACH2 } from './catalog'
import { brokeBetween, firstStep, linkKey, nextSteps, reachOf, sameStep, stepHint, type Ranked } from './hint'
import { hintGhost } from './layout'
import { CELLS, OVER, PARTS, STEP, sameTool, thingIndex, ticks, type Building, type CardId, type Hit, type Muncher, type MuncherMode, type Placeable, type State, type Step, type Thing, type Tool } from './model'
import { pawsOf } from './munchers'
import { act, blankState, cloneState, newGame, step } from './rules'
import { applyEdit, lintNet, planHedge, planPeelDrag, planPlace, planStroke, stickersLeft } from './strokes'
import { gives } from './trade'

const PENCIL: Tool = { kind: 'pencil' }
const NO_EDIT = { belts: [], removed: [], added: [], hedges: [] }

/** A game at its start, ready to play: the pad, the oven standing at the start, no belts. */
function blank(seed: number): State {
  const s = blankState(seed)
  rebuild(s)
  s.playing = true
  return s
}
/** A game just after her first dig: the oven's first bar on its roof (the hint digs first, then draws its belt), so the layout steps that build the factory follow. */
function fresh(seed: number): State {
  const s = blank(seed)
  s.buildings[1]!.stack.push('blueBar')
  return s
}

/**
 * Runs a step's script the way rules.act will for the layout's actions: the tray's tool, the
 * drag's cells and the ghost's point, then on release strokes.ts's planners with the hint's
 * dotted path and spot, and applyEdit. Every plan must apply where the step says and leave
 * the lint clean. A sticker, a hedge or the peel lasts one use.
 */
function perform(s: State, r: Ranked): void {
  s.hint = { step: r.step, at: s.tick }
  let cells: number[] = []
  let hold: { x: number; y: number } | null = null
  for (const a of r.script) {
    switch (a.kind) {
      case 'tool':
        s.tool = sameTool(s.tool, a.tool) ? PENCIL : a.tool
        break
      case 'drag':
        cells = a.cells
        break
      case 'hold':
        hold = { x: a.x, y: a.y }
        break
      case 'release': {
        const tool = s.tool
        const st = r.step
        let edit
        if (tool.kind === 'pencil') edit = planStroke(s, cells, st.kind === 'link' ? st.path : null).edit
        else if (tool.kind === 'peel') edit = planPeelDrag(s, cells).edit
        else if (tool.kind === 'hedge') edit = planHedge(s, cells).edit
        else {
          const prefer = st.kind === 'place' || st.kind === 'bottleneck' || st.kind === 'defend' ? { x: st.x, y: st.y } : null
          const plan = planPlace(s, tool.sticker, hold!.x, hold!.y, prefer)
          expect(plan.ok).toBe(true)
          if (prefer !== null) expect({ x: plan.x, y: plan.y }).toEqual(prefer)
          edit = plan.edit
        }
        expect(edit).not.toBeNull()
        applyEdit(s, edit!)
        expect(lintNet(s)).toEqual([])
        if (tool.kind === 'sticker') s.help.placed[tool.sticker]++
        if (tool.kind !== 'pencil') s.tool = PENCIL
        break
      }
      default:
        throw new Error(`the layout runner does not do '${a.kind}'`)
    }
  }
}

/** Slots from a building's spouts on, through forks, joins and bridges. */
function downstreamOf(s: State, from: number): { slots: Set<number>; buildings: Set<number> } {
  const slots = new Set<number>()
  const buildings = new Set<number>()
  for (const todo = [...s.net.spouts.get(from)!]; todo.length > 0; ) {
    const x = todo.pop()!
    if (slots.has(x)) continue
    slots.add(x)
    for (const y of [s.net.next[x]!, s.net.next2[x]!]) {
      if (y >= 0) todo.push(y)
      else if (y <= -2) buildings.add(-2 - y)
    }
  }
  return { slots, buildings }
}
const linked = (s: State, from: number, to: number) => downstreamOf(s, from).buildings.has(to)
/** Some belt from building `from` runs over cell c. */
const carriesTo = (s: State, from: number, c: number) => [...downstreamOf(s, from).slots].some((x) => (x >= OVER ? (x - OVER) >> 1 : x >> 1) === c)
const kindAt = (s: State, kind: string, x: number, y: number) => s.buildings.some((b) => b.kind === kind && b.x === x && b.y === y)
const of = (s: State, kind: string) => s.buildings.filter((b) => b.kind === kind)

/** A layout step did what it says on the board as the planners left it. */
function did(s: State, st: Step): void {
  switch (st.kind) {
    case 'link':
      expect(linked(s, st.from, st.to)).toBe(true)
      break
    case 'place':
      expect(kindAt(s, st.sticker, st.x, st.y)).toBe(true)
      break
    case 'bottleneck':
      expect(kindAt(s, st.sticker!, st.x, st.y)).toBe(true)
      break
    case 'free':
      for (const c of st.cells) expect(s.belts.out[c]).toBe(-1)
      break
    case 'defend':
      if (st.sticker === 'hedge') for (const c of st.cells) expect(s.hedge[c]).toBe(1)
      else expect(kindAt(s, st.sticker, st.x, st.y)).toBe(true)
      break
    case 'refill': {
      const t = s.buildings.find((b) => b.id === st.id)!
      expect(of(s, 'pump').some((p) => carriesTo(s, p.id, cellOf(t.x, t.y)))).toBe(true)
      break
    }
    default:
      break
  }
}

/** Some building linked into building `to` puts out `thing` with what it needs fed to it, all the way back to the diggers and the pump. */
function makes(s: State, to: number, thing: Thing): boolean {
  const puts = (b: Building, t: Thing): boolean => {
    const into = (u: Thing) => s.buildings.some((f) => f.id !== b.id && linked(s, f.id, b.id) && puts(f, u))
    switch (b.kind) {
      case 'digger':
        return gives(b).includes(t)
      case 'pump':
        return t === 'bubble'
      case 'oven':
        return (t === 'blueBar' && into('blueRock')) || (t === 'goldBar' && into('goldRock'))
      case 'workshop':
        return t === 'gear' && into('blueBar')
      case 'greenMaker':
        return t === 'greenBottle' && into('blueBar') && into('goldBar')
      case 'orangeMaker':
        return t === 'orangeBottle' && into('gear') && into('bubble')
      default:
        return false
    }
  }
  return s.buildings.some((b) => b.id !== to && linked(s, b.id, to) && puts(b, thing))
}
const LAYOUT = new Set<Step['kind']>(['place', 'link', 'free', 'bottleneck', 'defend', 'refill'])
/** Follows the hint's layout steps until it offers none, checking each did what it says; the steps it took. */
function build(s: State): Step[] {
  const log: Step[] = []
  for (let i = 0; i < 80; i++) {
    const r = nextSteps(s).find((x) => LAYOUT.has(x.step.kind))
    if (r === undefined) return log
    log.push(r.step)
    perform(s, r)
    did(s, r.step)
  }
  throw new Error(`the hint never ran out of layout steps:\n${log.map((st) => JSON.stringify(st)).join('\n')}`)
}

const ORDER: readonly CardId[] = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'land2', 'stars', 'snacks', 'land3', 'rocket', 'fuel']
/** A card found on top of what the board has: the rocket's legs as its need leaves them, the choice made, the land opened. */
function grant(s: State, id: CardId): void {
  s.found.push(id)
  if (id === 'digger') s.rocket.got[0] = 3
  if (id === 'gold') s.rocket.got[0] = 20
  if (id === 'gears') s.choice = 'bubbles'
  if (id === 'land2') s.land = 2
  if (id === 'land3') s.land = 3
  rebuild(s)
}
/** A game the hint built card by card up to and including card `last` (null: only the start), and every step it took. */
function playedWith(last: CardId | null): { s: State; log: Step[] } {
  const s = fresh(1)
  const log = build(s)
  for (const id of ORDER.slice(0, last === null ? 0 : ORDER.indexOf(last) + 1)) {
    grant(s, id)
    log.push(...build(s))
  }
  return { s, log }
}
const played = (last: CardId | null) => playedWith(last).s

/** A muncher of burrow A out on a visit (tickles need one), standing on cell c. */
function muncher(s: State, mode: MuncherMode, c: number, scout: boolean): Muncher {
  s.visit ??= { burrow: 0, at: s.tick, kept: 0, tickled: 0, sent: 0, naps: 0, fed: 0 }
  const m: Muncher = { id: s.nextMuncher++, burrow: 0, mode, modeAt: s.tick, cell: c, toward: c, stepAt: s.tick, stepFor: 50, hop: null, homeWhy: null, target: null, tried: [], cheeks: [], grabAt: -1, idleSince: s.tick, outAt: s.tick, scout, shotBy: -1 }
  s.munchers.push(m)
  return m
}
const kinds = (s: State) => nextSteps(s).map((r) => r.step.kind)
/** A minute into the game, so stamps a wait ago are real ticks. */
const MINUTE = 3600

// ---------------------------------------------------------------------------------------

describe('the hint builds its own factory', () => {
  it('a fresh game digs first, the blue rock nearest the oven by hand, and draws the oven\'s belt to the pad once a bar stands on its roof', () => {
    const s = blank(1)
    // Nothing but Beep's hand can feed the oven, and nothing ever came out of it: the patch cell nearest it (3 steps from its footprint) bounces, and a tap digs it.
    const dig = cellOf(7, 3)
    const digging = { step: { kind: 'dig', cell: dig }, script: [{ kind: 'dig', cell: dig, down: true }, { kind: 'dig', cell: dig, down: false }] }
    expect(nextSteps(s)).toEqual([digging])
    // Its rock bakes: still the dig, until the bar stands on the roof and gives the belt a reason.
    s.buildings[1]!.queue.push('blueRock')
    expect(nextSteps(s)).toEqual([digging])
    s.buildings[1]!.queue = []
    s.buildings[1]!.stack.push('blueBar')
    const first = nextSteps(s)[0]!
    expect(first.step).toMatchObject({ kind: 'link', from: 1, to: 0, thing: 'blueBar', full: true })
    const path = (first.step as Extract<Step, { kind: 'link' }>).path
    expect(s.owner[path[0]!]).toBe(1)
    expect(s.owner[path[path.length - 1]!]).toBe(0)
    expect(first.script).toEqual([{ kind: 'drag', cells: path }, { kind: 'release', commit: true }])
    perform(s, first)
    expect(linked(s, 1, 0)).toBe(true)
    // Linked, the oven wants rocks for the rocket: Beep's hand again.
    expect(nextSteps(s)).toEqual([digging])
    // Through the rules: the dig, the bar baked on the roof, then the belt.
    const g = newGame(1)
    act(g, { kind: 'play' })
    step(g)
    expect(g.hint!.step).toEqual({ kind: 'dig', cell: dig })
    for (const a of firstStep(g)!.script) act(g, a)
    for (let i = 0; i < ticks(3); i++) step(g)
    expect(g.buildings[1]!.stack).toEqual(['blueBar'])
    expect(g.hint!.step).toMatchObject({ kind: 'link', from: 1, to: 0, thing: 'blueBar' })
  })

  it('puts a New! sticker on a good spot near what it links to, then links it', () => {
    const s = played(null)
    grant(s, 'digger')
    const place = nextSteps(s)[0]!
    expect(place.step).toMatchObject({ kind: 'place', sticker: 'digger' })
    const { x, y } = place.step as Extract<Step, { kind: 'place' }>
    expect(planPlace(s, 'digger', x + 1, y + 1, { x, y })).toMatchObject({ ok: true, x, y, covers: [] })
    // On the blue patch, beside the oven it will feed.
    expect([cellOf(x, y), cellOf(x + 1, y), cellOf(x, y + 1), cellOf(x + 1, y + 1)].filter((c) => xOf(c) >= 7 && xOf(c) <= 10 && yOf(c) >= 2 && yOf(c) <= 3).length).toBeGreaterThanOrEqual(2)
    expect(place.script).toEqual([{ kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } }, { kind: 'hold', x: x + 1, y: y + 1 }, { kind: 'release', commit: true }])
    perform(s, place)
    expect(nextSteps(s)[0]!.step).toMatchObject({ kind: 'link', thing: 'blueRock', to: 1 })
  })

  it('builds the whole land-1 chain by Science!, every machine fed and every line linked', () => {
    const s = played('science')
    const blue = s.buildings.find((b) => b.kind === 'digger' && b.y <= 3)!
    const gold = s.buildings.find((b) => b.kind === 'digger' && b !== blue)!
    const goldOven = s.buildings.find((b) => b.kind === 'oven' && b.id !== 1)!
    const gm = of(s, 'greenMaker')[0]!
    const lab = of(s, 'lab')[0]!
    expect(linked(s, blue.id, 1)).toBe(true)
    expect(linked(s, 1, 0)).toBe(true)
    expect(linked(s, gold.id, goldOven.id)).toBe(true)
    expect(linked(s, 1, gm.id) && linked(s, goldOven.id, gm.id)).toBe(true)
    expect(linked(s, gm.id, lab.id)).toBe(true)
    for (const k of ['digger', 'oven', 'greenMaker', 'lab'] as const) expect(stickersLeft(s, k)).toBe(0)
    expect(kinds(s)).toEqual(['rocket'])
  })

  it('stands the workshop over the bubble line at Gears! on the start oven\'s bars, and keeps the gear oven and its digger in the tray until land 2 opens their row', () => {
    const s = played('hedges')
    const ws = of(s, 'workshop')[0]!
    expect(linked(s, 1, ws.id) && linked(s, ws.id, 0)).toBe(true)
    expect(stickersLeft(s, 'oven')).toBe(1)
    expect(stickersLeft(s, 'digger')).toBe(1)
    grant(s, 'land2')
    build(s)
    const gearOven = s.buildings.find((b) => b.kind === 'oven' && b.y <= 2)!
    expect(linked(s, gearOven.id, ws.id)).toBe(true)
    expect(s.buildings.some((b) => b.kind === 'digger' && linked(s, b.id, gearOven.id))).toBe(true)
  })

  it('gets the orange line going at Stars!: gears and bubbles in, orange bottles to the lab', () => {
    const s = played('stars')
    const om = of(s, 'orangeMaker')[0]!
    expect(om).toBeDefined()
    expect(linked(s, of(s, 'workshop')[0]!.id, om.id)).toBe(true)
    expect(linked(s, of(s, 'pump')[0]!.id, om.id)).toBe(true)
    expect(linked(s, om.id, of(s, 'lab')[0]!.id)).toBe(true)
  })

  it('feeds what each card waits for once it has built for the card before, and runs out of layout steps all the way to Fuel! with every sticker placed', () => {
    const s = fresh(1)
    build(s)
    const lab = () => of(s, 'lab')[0]!.id
    const pad = () => of(s, 'pad')[0]!.id
    // The thing each card's line must bring, once the hint has built for the card that opens it.
    const waits: Partial<Record<CardId, [() => number, Thing][]>> = {
      science: [[lab, 'greenBottle']],
      land2: [[pad, 'gear']],
      stars: [[lab, 'orangeBottle']],
      rocket: [[pad, 'orangeBottle']],
    }
    for (const id of ORDER) {
      grant(s, id)
      build(s)
      for (const [to, thing] of waits[id] ?? []) expect(makes(s, to(), thing)).toBe(true)
    }
    expect(lintNet(s)).toEqual([])
    expect(nextSteps(s).every((r) => !LAYOUT.has(r.step.kind))).toBe(true)
    for (const k of ['digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pump'] as const) expect(stickersLeft(s, k)).toBe(0)
  })
})

describe("the hint's own defence", () => {
  /** Cell c lies within a tower's reach of the tower at t. */
  const inReach = (c: number, t: Building) => (xOf(c) - t.x) ** 2 + (yOf(c) - t.y) ** 2 <= TOWER_REACH2

  it("brings the first tower at Bubbles! as New!, the bubble line from the pump drawn first, where burrow A's munchers' way passes within its reach", () => {
    const s = played('gears')
    grant(s, 'bubbles')
    const log = build(s)
    expect(log.some((st) => st.kind === 'defend' && st.sticker === 'tower' && st.cells.length > 0)).toBe(true)
    const tower = of(s, 'tower')[0]!
    expect(of(s, 'pump').some((p) => carriesTo(s, p.id, cellOf(tower.x, tower.y)))).toBe(true)
    expect(pawsOf(s, 0).some((c) => inReach(c, tower))).toBe(true)
  })

  it("takes her wobbly stroke from the pump along the tower's dotted belt as that belt (rules.act's release), and shows the tower's ghost only once the belt is there", () => {
    const s = played('gears')
    grant(s, 'bubbles')
    perform(s, nextSteps(s)[0]!)
    const pump = of(s, 'pump')[0]!
    const st = nextSteps(s)[0]!.step as Extract<Step, { kind: 'defend' }>
    expect(st).toMatchObject({ kind: 'defend', sticker: 'tower' })
    // The finger's way from the pump, as a link's path is.
    expect(s.owner[st.cells[0]!]).toBe(pump.id)
    expect(st.cells.at(-1)).toBe(cellOf(st.x, st.y))
    s.hint = { step: st, at: s.tick }
    expect(hintGhost(s, s.tick * STEP)).toBeNull()
    // Her finger cuts the corner by the pad and comes back to the dotted path: alone that stroke would end in the pad's mouth.
    expect(st.cells.slice(3, 6)).toEqual([cellOf(3, 7), cellOf(4, 7), cellOf(4, 6)])
    const finger = [...st.cells.slice(0, 4), cellOf(3, 6), ...st.cells.slice(5)]
    expect(planStroke(s, finger, null).sign).toBe('mouth')
    act(s, { kind: 'drag', cells: finger })
    act(s, { kind: 'release', commit: true })
    expect(carriesTo(s, pump.id, cellOf(st.x, st.y))).toBe(true)
    expect(s.belts.out[cellOf(4, 7)]).toBeGreaterThanOrEqual(0)
    expect(hintGhost(s, s.tick * STEP)).toEqual({ sticker: 'tower', x: st.x, y: st.y })
  })

  it('brings the first hedge line at Hedges! as New!, and the first bowl at Snacks! on a burrow\'s flowers with the gold belt that feeds it', () => {
    const s = played('bubbles')
    grant(s, 'hedges')
    expect(build(s).some((st) => st.kind === 'defend' && st.sticker === 'hedge')).toBe(true)
    expect(s.hedge.some((h) => h === 1)).toBe(true)
    for (const id of ['land2', 'stars', 'snacks'] as const) {
      grant(s, id)
      build(s)
    }
    const bowl = of(s, 'bowl')[0]!
    expect(FLOWER_OF[cellOf(bowl.x, bowl.y)]).toBeGreaterThanOrEqual(0)
    expect(of(s, 'oven').some((o) => carriesTo(s, o.id, cellOf(bowl.x, bowl.y)))).toBe(true)
  })

  it("offers a burrow's planned defence once its munchers have come out, the need before the tool, and only the first New! of each while nobody has", () => {
    const s = played('snacks')
    // Nobody came out in a game the hint built card by card: one tower, one hedge line and one bowl stand, and the rest wait in the tray.
    expect(of(s, 'tower')).toHaveLength(1)
    expect(of(s, 'bowl')).toHaveLength(1)
    expect(stickersLeft(s, 'tower')).toBeGreaterThan(0)
    // Burrow A's way passes the tower by its door, so its munchers coming out ask for nothing more.
    s.burrows[0]!.visits = 2
    expect(build(s)).toEqual([])
    // Burrow B's munchers come out: no bubble line or gold belt reaches B, so its fence comes, and they reach nothing without nibbling a hedge at its door.
    s.burrows[1]!.visits = 1
    const log = build(s)
    expect(log.some((st) => st.kind === 'defend' && st.sticker === 'hedge')).toBe(true)
    expect(pawsOf(s, 1).some((c) => s.hedge[c] === 1)).toBe(true)
    expect(of(s, 'tower')).toHaveLength(1)
  })
})

describe('the ranks, each rule alone and against the next', () => {
  it('rule 1: a sitting or napping muncher no tower with suds reaches, nappers first; the scout from its first step', () => {
    const s = played('science')
    const sitter = muncher(s, 'sit', cellOf(9, 9), false)
    const gm = of(s, 'greenMaker')[0]!
    const napper = muncher(s, 'nap', cellOf(gm.x, gm.y), false)
    gm.napper = napper.id
    muncher(s, 'walk', cellOf(9, 4), false)
    const steps = nextSteps(s)
    expect(steps.slice(0, 2).map((r) => r.step)).toEqual([
      { kind: 'muncher', id: napper.id },
      { kind: 'muncher', id: sitter.id },
    ])
    expect(steps[0]!.script).toEqual([{ kind: 'tickle', id: napper.id }])
    // A tower with suds within reach of the sitter will shoot it.
    const tower = add(s, 'tower', 9, 9)
    rebuild(s)
    tower.ammo = 2
    expect(nextSteps(s).filter((r) => r.step.kind === 'muncher').map((r) => r.step)).toEqual([{ kind: 'muncher', id: napper.id }])
    // A caught muncher is Beep's already.
    s.tickles.push(napper.id)
    expect(kinds(s)).not.toContain('muncher')
    const scout = muncher(s, 'walk', cellOf(11, 5), true)
    expect(nextSteps(s)[0]!.step).toEqual({ kind: 'muncher', id: scout.id })
  })

  it('rule 2: Oops while her newest edit broke something, for OOPS_HINT, and not for an older one; after rule 1', () => {
    const s = played('science')
    s.undo.push({ edit: NO_EDIT, inverse: NO_EDIT, at: s.tick, broke: true, tool: 'pencil' })
    expect(nextSteps(s)[0]).toEqual({ step: { kind: 'oops' }, script: [{ kind: 'oops' }] })
    const m = muncher(s, 'sit', cellOf(9, 9), false)
    expect(nextSteps(s).slice(0, 2).map((r) => r.step)).toEqual([{ kind: 'muncher', id: m.id }, { kind: 'oops' }])
    s.munchers = []
    s.tick += OOPS_HINT
    expect(kinds(s)).not.toContain('oops')
    s.undo[0]!.at = s.tick
    s.undo.push({ edit: NO_EDIT, inverse: NO_EDIT, at: s.tick, broke: false, tool: 'pencil' })
    expect(kinds(s)).not.toContain('oops')
  })

  it('the flaps after a Land! card come after Oops and before a New! sticker', () => {
    const s = played('hedges')
    s.found.push('land2')
    s.flap = 2
    s.undo.push({ edit: NO_EDIT, inverse: NO_EDIT, at: s.tick, broke: true, tool: 'pencil' })
    expect(kinds(s).slice(0, 2)).toEqual(['oops', 'flap'])
    expect(nextSteps(s)[1]!.script).toEqual([{ kind: 'tap', hit: { kind: 'flap' } }])
    s.undo = []
    s.land = 2
    expect(kinds(s)[0]).toBe('flap')
    s.flap = 0
    expect(kinds(s)[0]).toBe('place')
  })

  it('a card waiting for her tap, then the launch once the rocket is ready, come before every rule; during the launch nothing; at Good night only the tuck', () => {
    const s = played('science')
    muncher(s, 'sit', cellOf(9, 9), false)
    s.card = { id: 'gears', at: s.tick }
    s.cardWaits = true
    PARTS.forEach((p, i) => (s.rocket.got[i] = PART_INFO[p].n))
    s.found.push('fuel')
    expect(kinds(s).slice(0, 3)).toEqual(['card', 'launch', 'muncher'])
    expect(nextSteps(s)[0]!.script).toEqual([{ kind: 'card' }])
    // The launch is her tap on the pad, as the page has it.
    expect(nextSteps(s)[1]!.script).toEqual([{ kind: 'tap', hit: { kind: 'building', id: 0 } }])
    s.cardWaits = false
    expect(kinds(s)[0]).toBe('launch')
    // With the peel in hand her tap on the pad would lift it: the peel goes back first, and the tap launches.
    const peeling = cloneState(s)
    peeling.tool = { kind: 'peel' }
    const launch = nextSteps(peeling)[0]!.script
    expect(launch).toEqual([{ kind: 'tool', tool: PENCIL }, { kind: 'tap', hit: { kind: 'building', id: 0 } }])
    for (const a of launch) act(peeling, a)
    expect(peeling.launch).not.toBeNull()
    s.launch = { at: s.tick, landsAt: s.tick + 100 }
    expect(nextSteps(s)).toEqual([])
    s.launch = null
    s.night = { at: s.tick, kind: 'oven', kindAt: s.tick, doneAt: -1 }
    // Her tap on one of the ovens in their nightcaps (the first awake) tucks them all in.
    const oven = s.buildings.find((b) => b.kind === 'oven')!
    expect(nextSteps(s)).toEqual([{ step: { kind: 'tuck', machine: 'oven' }, script: [{ kind: 'tap', hit: { kind: 'building', id: oven.id } }] }])
    s.night.kind = null
    expect(nextSteps(s)).toEqual([])
  })

  it('rule 3 before rule 4; rule 4: one more of the slowest machine beside it while a sticker is left', () => {
    const s = emptyBoard()
    s.land = 3
    s.tick = MINUTE
    add(s, 'pad', 1, 4)
    add(s, 'lab', 12, 1)
    const gm = add(s, 'greenMaker', 12, 5)
    add(s, 'oven', 8, 5)
    rebuild(s)
    line(s, [
      [12, 4],
      [12, 3],
    ])
    line(s, [
      [10, 5],
      [11, 5],
    ])
    rebuild(s)
    // The second green maker sticker comes with the second Land!; the orange maker of Stars! is no New! sticker any more.
    s.found = ['digger', 'gold', 'science', 'gears', 'bubbles', 'hedges', 'land2', 'stars', 'snacks', 'land3']
    s.choice = 'bubbles'
    s.help.placed.greenMaker = 1
    s.help.placed.lab = 1
    s.help.placed.oven = 1
    s.help.placed.orangeMaker = 1
    gm.busyBits = (1 << 30) - 1
    for (const x of s.net.mouths.get(gm.id)!) s.belts.blockedSince[x >> 1] = s.tick - BOTTLENECK_WAIT
    const steps = nextSteps(s)
    // A New! sticker (here the workshop) comes first.
    expect(steps[0]!.step).toMatchObject({ kind: 'place', sticker: 'workshop' })
    const neck = steps.find((r) => r.step.kind === 'bottleneck')!
    expect(neck.step).toMatchObject({ kind: 'bottleneck', id: gm.id, sticker: 'greenMaker' })
    const { x, y } = neck.step as Extract<Step, { kind: 'bottleneck' }>
    expect(planPlace(s, 'greenMaker', x + 1, y + 1, { x, y }).ok).toBe(true)
    expect(neck.script).toEqual([{ kind: 'tool', tool: { kind: 'sticker', sticker: 'greenMaker' } }, { kind: 'hold', x: x + 1, y: y + 1 }, { kind: 'release', commit: true }])
    // Busy too little of the last seconds, or no belt full behind it that long: no bottleneck.
    gm.busyBits = (1 << 20) - 1
    expect(kinds(s)).not.toContain('bottleneck')
    gm.busyBits = (1 << 30) - 1
    for (const x of s.net.mouths.get(gm.id)!) s.belts.blockedSince[x >> 1] = s.tick - BOTTLENECK_WAIT + 1
    expect(kinds(s)).not.toContain('bottleneck')
  })

  it('rule 4: a second belt out of an oven with bars to spare comes before one more oven', () => {
    const s = emptyBoard()
    const pad = add(s, 'pad', 1, 4)
    const slow = add(s, 'oven', 6, 6)
    const spare = add(s, 'oven', 9, 5)
    add(s, 'digger', 7, 2)
    add(s, 'digger', 9, 2)
    rebuild(s)
    // Rocks from the first digger into the busy oven, its bars to the pad; the second digger's rocks into the other oven, whose bars go nowhere.
    line(s, [
      [7, 4],
      [7, 5],
    ])
    line(s, [
      [5, 6],
      [4, 6],
    ])
    cell(s, 9, 4, 3, 1, -1, -1)
    rebuild(s)
    s.tick = MINUTE
    slow.busyBits = (1 << 30) - 1
    for (const x of s.net.mouths.get(slow.id)!) s.belts.blockedSince[x >> 1] = s.tick - BOTTLENECK_WAIT
    const first = nextSteps(s)[0]!
    expect(first.step).toMatchObject({ kind: 'link', from: spare.id, to: pad.id, thing: 'blueBar' })
    perform(s, first)
    expect(linked(s, spare.id, pad.id)).toBe(true)
  })

  it('rule 5: a thing blocking a starved machine for BLOCKED_HINT, after rule 3 and before rule 6', () => {
    const s = played(null)
    s.tick = MINUTE
    const mouth = s.net.mouths.get(0)![0]!
    put(s, mouth, 'goldBar')
    put(s, mouth - 1, 'blueBar')
    s.belts.blockedSince[mouth >> 1] = s.tick - BLOCKED_HINT
    grant(s, 'digger')
    const steps = nextSteps(s)
    expect(steps.slice(0, 3).map((r) => r.step.kind)).toEqual(['place', 'unblock', 'place'])
    expect(steps[1]).toEqual({ step: { kind: 'unblock', slot: mouth }, script: [{ kind: 'tap', hit: { kind: 'thing', slot: mouth } }] })
    s.belts.blockedSince[mouth >> 1] = s.tick - BLOCKED_HINT + 1
    expect(kinds(s)).not.toContain('unblock')
  })

  it('rule 5: a full stack with no way out is carried by Beep while something wants its things; one whose only belt leads to a full rocket part waits', () => {
    const s = played(null)
    s.tick = MINUTE
    const oven = s.buildings.find((b) => b.id === 1)!
    oven.stack = ['blueBar', 'blueBar', 'blueBar', 'blueBar']
    oven.pushAt = s.tick - BLOCKED_HINT
    for (const x of s.net.spouts.get(oven.id)!) put(s, x, 'blueBar')
    expect(nextSteps(s).find((r) => r.step.kind === 'stack')).toEqual({ step: { kind: 'stack', id: 1 }, script: [{ kind: 'tap', hit: { kind: 'stack', id: 1 } }] })
    s.rocket.got[0] = PART_INFO.legs.n
    expect(kinds(s)).not.toContain('stack')
  })

  it('rule 6: the first missing link toward the lab before the rocket, its path in full for her first HELP_FULL links of that kind', () => {
    const s = played('gold')
    grant(s, 'science')
    for (let i = 0; i < 2; i++) perform(s, nextSteps(s)[0]!)
    expect(nextSteps(s)[0]!.step).toMatchObject({ kind: 'link', to: of(s, 'lab')[0]!.id, thing: 'greenBottle', full: true })
    s.help.links[linkKey('greenMaker', 'lab', 'greenBottle')] = HELP_FULL
    expect(nextSteps(s)[0]!.step).toMatchObject({ kind: 'link', full: false })
  })

  it('rule 7: an empty tower bubbles no longer reach, while a burrow leans out, gets a bubble belt into its own belt', () => {
    const s = emptyBoard()
    add(s, 'pad', 1, 4)
    add(s, 'pump', 0, 8)
    rebuild(s)
    line(s, [
      [12, 6],
      [11, 6],
      [10, 6],
      [9, 6],
      [8, 6],
      [7, 6],
    ])
    const tower = add(s, 'tower', 8, 6)
    rebuild(s)
    s.help.placed.tower = 1
    s.help.placed.pump = 1
    s.burrows[0]!.hunger = STAGE_AT[2]
    const refill = nextSteps(s).find((r) => r.step.kind === 'refill')!
    expect(refill.step).toEqual({ kind: 'refill', id: tower.id })
    perform(s, refill)
    did(s, refill.step)
    // Asleep, or with its face not leaning out yet: no refill.
    const t = cloneState(s)
    t.burrows[0]!.hunger = STAGE_AT[2] - 1
    expect(nextSteps(t).some((r) => r.step.kind === 'refill')).toBe(false)
  })

  it("rule 7: once a burrow's munchers have come out, the blueprint's tower with the bubble belt from the pump drawn first, within reach of their way", () => {
    // A green bottle maker south-west of burrow A for its munchers to nap on, the pump by the pond and the two towers of Bubbles! in the tray.
    const s = emptyBoard()
    s.tick = MINUTE
    add(s, 'pad', 1, 4)
    add(s, 'pump', 0, 8)
    add(s, 'greenMaker', 6, 8)
    rebuild(s)
    s.found = ['digger', 'gold', 'science', 'gears', 'bubbles']
    s.choice = 'bubbles'
    s.help.placed.tower = 1
    // Nobody came out yet: nothing to defend against, so no tower.
    expect(kinds(s)).not.toContain('defend')
    s.burrows[0]!.visits = 1
    const defend = nextSteps(s).find((r) => r.step.kind === 'defend')!
    expect(defend.step).toMatchObject({ kind: 'defend', sticker: 'tower' })
    perform(s, defend)
    did(s, defend.step)
    const { x, y } = defend.step as Extract<Step, { kind: 'defend' }>
    expect(of(s, 'pump').some((p) => carriesTo(s, p.id, cellOf(x, y)))).toBe(true)
    expect(pawsOf(s, 0).some((c) => (xOf(c) - x) ** 2 + (yOf(c) - y) ** 2 <= TOWER_REACH2)).toBe(true)
  })

  it('rule 7: after a visit its munchers got away with DEFEND_KEPT things from, a tower off the plan at the end of a bubble belt that keeps off the blueprint, within reach of their paw prints', () => {
    // Burrow B, which no blueprint tower reaches, on the whole board with no hedge left in the tray: its munchers walk to a green maker in the south-west.
    const s = emptyBoard()
    s.tick = MINUTE
    s.land = 3
    add(s, 'pad', 1, 4)
    add(s, 'pump', 0, 8)
    add(s, 'greenMaker', 6, 8)
    rebuild(s)
    s.found = ['digger', 'gold', 'science', 'gears', 'bubbles']
    s.choice = 'bubbles'
    s.help.placed.tower = 1
    s.burrows[1]!.visits = 1
    s.burrows[1]!.heap[thingIndex('greenBottle')] = DEFEND_KEPT - 1
    expect(kinds(s)).not.toContain('defend')
    s.burrows[1]!.heap[thingIndex('greenBottle')] = DEFEND_KEPT
    const defend = nextSteps(s).find((r) => r.step.kind === 'defend')!
    expect(defend.step).toMatchObject({ kind: 'defend', sticker: 'tower' })
    perform(s, defend)
    did(s, defend.step)
    const { x, y, cells } = defend.step as Extract<Step, { kind: 'defend' }>
    expect(of(s, 'pump').some((p) => carriesTo(s, p.id, cellOf(x, y)))).toBe(true)
    expect(pawsOf(s, 1).some((c) => (xOf(c) - x) ** 2 + (yOf(c) - y) ** 2 <= TOWER_REACH2)).toBe(true)
    // Its bubble belt takes none of the orange maker's cells by the pump.
    for (const c of [cellOf(1, 10), cellOf(2, 10), cellOf(2, 8), cellOf(3, 8)]) expect(cells).not.toContain(c)
  })

  it('rule 8: a heap of HEAP_HINT or more, then the basket while it holds something wanted; rule 9: else the rocket; while the choice waits, its card is the step', () => {
    const s = played('gears')
    s.burrows[0]!.heap[thingIndex('gear')] = HEAP_HINT
    s.basket[thingIndex('blueRock')] = 1
    expect(kinds(s)).toEqual(['heap', 'basket'])
    expect(nextSteps(s)[0]!.script).toEqual([{ kind: 'tap', hit: { kind: 'heap', burrow: 0 } }])
    expect(nextSteps(s)[1]!.script).toEqual([{ kind: 'tap', hit: { kind: 'basket' } }])
    // The choice card covers the board while the choice waits: its two pictures are the step (the hint picks Bubbles!) and nothing bounces behind it, a sitting muncher neither; only a card that waits for her tap comes first.
    s.choice = null
    muncher(s, 'sit', cellOf(9, 9), false)
    expect(nextSteps(s)).toEqual([{ step: { kind: 'choose' }, script: [{ kind: 'choose', card: 'bubbles' }] }])
    s.card = { id: 'gears', at: s.tick }
    s.cardWaits = true
    expect(kinds(s)).toEqual(['card', 'choose'])
    s.card = null
    s.munchers = []
    s.visit = null
    s.choice = 'bubbles'
    // Things nothing wants stay in the basket without a step.
    s.basket[thingIndex('blueRock')] = 0
    s.basket[thingIndex('bubble')] = 3
    s.burrows[0]!.heap.fill(0)
    expect(kinds(s)).toEqual(['rocket'])
  })
})

describe('the step that bounces and the hand', () => {
  it('a bouncing step keeps bouncing HINT_HOLD when a higher one comes, unless it is done or a muncher takes over', () => {
    const s = played('science')
    s.burrows[0]!.heap[thingIndex('gear')] = HEAP_HINT
    stepHint(s)
    expect(s.hint!.step).toEqual({ kind: 'heap', burrow: 0 })
    const at = s.hint!.at
    s.tick += HINT_EVERY
    s.undo.push({ edit: NO_EDIT, inverse: NO_EDIT, at: s.tick, broke: true, tool: 'pencil' })
    stepHint(s)
    expect(s.hint).toEqual({ step: { kind: 'heap', burrow: 0 }, at })
    s.tick = at + HINT_HOLD
    s.undo[0]!.at = s.tick
    stepHint(s)
    expect(s.hint).toEqual({ step: { kind: 'oops' }, at: s.tick })
    s.tick += HINT_EVERY
    const m = muncher(s, 'sit', cellOf(9, 9), false)
    stepHint(s)
    expect(s.hint!.step).toEqual({ kind: 'muncher', id: m.id })
    s.munchers = []
    s.tick += HINT_EVERY
    stepHint(s)
    expect(s.hint!.step.kind).toBe('oops')
  })

  it('keeps a step its newest version and its start while it stays, so a kind placed HELP_FULL times shows its ghost only after GHOST_DELAY', () => {
    const s = played('gold')
    grant(s, 'science')
    stepHint(s)
    const at = s.hint!.at
    expect(s.hint!.step.kind).toBe('place')
    s.tick += HINT_EVERY
    stepHint(s)
    expect(s.hint!.at).toBe(at)
    const st = s.hint!.step as Extract<Step, { kind: 'place' }>
    expect(hintGhost(s, s.tick * STEP)).toEqual({ sticker: st.sticker, x: st.x, y: st.y })
    s.help.placed[st.sticker as Placeable] = HELP_FULL
    expect(hintGhost(s, s.tick * STEP)).toBeNull()
    expect(hintGhost(s, (at + GHOST_DELAY) * STEP)).not.toBeNull()
  })

  it('shows the hand after HAND_AFTER of no touch, each wait longer and the last repeating, and a touch starts it over', () => {
    const s = played('science')
    s.burrows[0]!.heap[thingIndex('gear')] = HEAP_HINT
    s.sessionAt = -1
    s.lastTouchAt = 0
    const hands: number[] = []
    const last = HAND_AFTER[0] + HAND_AFTER[1] + 3 * HAND_AFTER[2]
    for (let t = 0; t <= last; t += HINT_EVERY) {
      s.tick = t
      const before = s.handN
      stepHint(s)
      if (s.handN > before) hands.push(t)
    }
    expect(hands).toEqual([1, 2, 3, 4, 5].map((n) => HAND_AFTER.slice(0, Math.min(n, 3)).reduce((a, w) => a + w, 0) + Math.max(0, n - 3) * HAND_AFTER[2]))
    s.lastTouchAt = s.tick
    s.handN = 0
    s.tick += HAND_AFTER[0] - HINT_EVERY
    stepHint(s)
    expect(s.handN).toBe(0)
    s.tick += HINT_EVERY
    stepHint(s)
    expect(s.handN).toBe(1)
  })

  it('taps Oops after OOPS_HAND, shows the hand at once after a session began and for the scout, and none before Play', () => {
    const s = played('science')
    s.sessionAt = -1
    s.lastTouchAt = s.tick
    s.undo.push({ edit: NO_EDIT, inverse: NO_EDIT, at: s.tick, broke: true, tool: 'pencil' })
    const start = s.tick
    stepHint(s)
    s.tick = start + OOPS_HAND - HINT_EVERY
    stepHint(s)
    expect(s.handN).toBe(0)
    s.tick = start + OOPS_HAND
    stepHint(s)
    expect(s.handN).toBe(1)
    s.undo = []
    s.tick += HINT_EVERY
    s.sessionAt = s.tick
    s.tick += HINT_EVERY
    s.burrows[0]!.heap[thingIndex('gear')] = HEAP_HINT
    stepHint(s)
    expect(s.handAt).toBe(s.tick)
    s.tick += HINT_EVERY
    s.lastTouchAt = s.tick
    s.handN = 0
    const scout = muncher(s, 'walk', cellOf(11, 5), true)
    s.tick += HINT_EVERY
    stepHint(s)
    expect(s.hint!.step).toEqual({ kind: 'muncher', id: scout.id })
    expect(s.handAt).toBe(s.tick)
    const before = played(null)
    before.playing = false
    stepHint(before)
    expect(before.handAt).toBe(-1)
  })

  it('waits its usual HAND_AFTER before tapping Oops for her peel, picked from the tray on purpose, and her next stroke or sticker ends the Oops', () => {
    const s = played('science')
    s.sessionAt = -1
    s.lastTouchAt = s.tick
    s.undo.push({ edit: NO_EDIT, inverse: NO_EDIT, at: s.tick, broke: true, tool: 'peel' })
    const start = s.tick
    stepHint(s)
    expect(s.hint!.step).toEqual({ kind: 'oops' })
    s.tick = start + OOPS_HAND
    stepHint(s)
    expect(s.handN).toBe(0)
    s.tick = start + HAND_AFTER[0]
    stepHint(s)
    expect(s.handN).toBe(1)
    // She rebuilds: her next stroke is the newest edit, and Oops goes.
    s.tick += HINT_EVERY
    s.undo.push({ edit: NO_EDIT, inverse: NO_EDIT, at: s.tick, broke: false, tool: 'pencil' })
    expect(kinds(s)).not.toContain('oops')
  })

  it('comes at once to a child who keeps trying: a tap on what bounces that cannot do it, HAND_TRIES touches that do not do it, or a sticker that flew back, never over its last gesture; her dig of a dig step does it', () => {
    const s = played('gold')
    grant(s, 'science')
    for (let i = 0; i < 2; i++) perform(s, nextSteps(s)[0]!)
    // A link she has drawn often: its path shows only with the hand.
    s.help.links[linkKey('greenMaker', 'lab', 'greenBottle')] = HELP_FULL
    s.sessionAt = -1
    s.tick = MINUTE
    step(s)
    const link = s.hint!.step as Extract<Step, { kind: 'link' }>
    expect(link).toMatchObject({ kind: 'link', thing: 'greenBottle', full: false })
    /** Hands that come in `seconds` while she taps `hit` every `every` seconds (null: she sits still), on a copy, the step unchanged. */
    const hands = (from: State, seconds: number, every: number | null, hit: Hit) => {
      const t = cloneState(from)
      let n = 0
      for (let i = 0; i < ticks(seconds); i++) {
        if (every !== null && i % ticks(every) === 0) {
          act(t, { kind: 'touch', down: true })
          act(t, { kind: 'tap', hit })
          act(t, { kind: 'touch', down: false })
        }
        const was = t.handAt
        step(t)
        if (t.handAt !== was) n++
      }
      expect(sameStep(t.hint!.step, link)).toBe(true)
      return n
    }
    const picture = { kind: 'ground', cell: link.path[Math.floor(link.path.length / 2)]! } as const
    // Sitting still: after HAND_AFTER[0], then HAND_AFTER[1] later.
    expect(hands(s, 60, null, picture)).toBe(2)
    // Tapping the bouncing picture every 3 s: at once, then each tap after its gesture (HAND_AGAIN); the old hand waited for 8 s with no touch, and never came.
    expect(hands(s, 60, 3, picture)).toBeGreaterThanOrEqual(6)
    // Poking about elsewhere every 3 s: after HAND_TRIES pokes, again and again.
    expect(hands(s, 60, 3, { kind: 'ground', cell: cellOf(2, 2) })).toBeGreaterThanOrEqual(4)
    // A sticker that flew back with a boing (held over the pond) brings the hand at once.
    const nope = played(null)
    grant(nope, 'digger')
    nope.sessionAt = -1
    nope.tick = MINUTE
    step(nope)
    expect(nope.hint!.step).toMatchObject({ kind: 'place', sticker: 'digger' })
    act(nope, { kind: 'touch', down: true })
    act(nope, { kind: 'tool', tool: { kind: 'sticker', sticker: 'digger' } })
    act(nope, { kind: 'hold', x: 1, y: 9 })
    act(nope, { kind: 'release', commit: true })
    act(nope, { kind: 'touch', down: false })
    expect(nope.missAt).toBe(nope.tick)
    for (let i = 0; i < HINT_EVERY; i++) step(nope)
    expect(nope.handAt).toBeGreaterThanOrEqual(nope.tick - HINT_EVERY)
    // Her dig of a dig step's rock does the step: her tries and the hand's waits start over.
    const g = blank(1)
    step(g)
    const dig = g.hint!.step as Extract<Step, { kind: 'dig' }>
    expect(dig.kind).toBe('dig')
    g.handN = 1
    act(g, { kind: 'touch', down: true })
    expect(g.tries).toBe(1)
    act(g, { kind: 'dig', cell: dig.cell, down: true })
    expect([g.tries, g.handN]).toEqual([0, 0])
  })

  it('counts the links she laid since the last look into help.links, by from kind, to kind and thing, once each', () => {
    const s = fresh(1)
    perform(s, nextSteps(s)[0]!)
    const spout = s.net.spouts.get(1)![0]! >> 1
    const edit = { belts: [{ cell: spout, before: null, after: { in: 0, out: 2, fork: -1, over: -1, pattern: 0 } }], removed: [], added: [], hedges: [] }
    s.tick = 10 * HINT_EVERY
    s.undo.push({ edit, inverse: edit, at: s.tick - 1, broke: false, tool: 'pencil' })
    stepHint(s)
    expect(s.help.links[linkKey('oven', 'pad', 'blueBar')]).toBe(1)
    s.tick += HINT_EVERY
    stepHint(s)
    expect(s.help.links[linkKey('oven', 'pad', 'blueBar')]).toBe(1)
  })

  it('says which steps are the same step while the board changes under it', () => {
    expect(sameStep({ kind: 'link', from: 1, to: 0, thing: 'blueBar', path: [1, 2], full: true }, { kind: 'link', from: 1, to: 0, thing: 'blueBar', path: [3], full: false })).toBe(true)
    expect(sameStep({ kind: 'place', sticker: 'oven', x: 1, y: 1 }, { kind: 'place', sticker: 'oven', x: 5, y: 5 })).toBe(true)
    expect(sameStep({ kind: 'place', sticker: 'oven', x: 1, y: 1 }, { kind: 'place', sticker: 'lab', x: 1, y: 1 })).toBe(false)
    expect(sameStep({ kind: 'muncher', id: 3 }, { kind: 'muncher', id: 4 })).toBe(false)
  })
})

describe("the hint's memo", () => {
  /** The steps as the rules work them out afresh, on a copy with nothing kept. */
  const afresh = (s: State) => {
    const t = cloneState(s)
    t.hintMemo = null
    return nextSteps(t)
  }

  it("stepHint keeps the layout rules' plans for the board as it is; a query only reads them", () => {
    const s = played('gold')
    grant(s, 'science')
    nextSteps(s)
    expect(s.hintMemo).toBeNull()
    stepHint(s)
    expect(Object.keys(s.hintMemo!.rules)).toContain('place')
    const kept = structuredClone(s.hintMemo)
    expect(nextSteps(s)).toEqual(afresh(s))
    expect(firstStep(s)).toEqual(afresh(s)[0])
    expect(s.hintMemo).toEqual(kept)
  })

  it('a kept plan picks its tool only while another tool is in hand', () => {
    const s = played('gold')
    grant(s, 'science')
    stepHint(s)
    const place = nextSteps(s)[0]!
    const pick = place.script[0]!
    expect(pick.kind).toBe('tool')
    s.tool = (pick as Extract<typeof pick, { kind: 'tool' }>).tool
    expect(nextSteps(s)[0]!.script).toEqual(place.script.slice(1))
    expect(nextSteps(s)).toEqual(afresh(s))
  })

  it('at every stage of the path, with stepHint keeping plans as she builds, the steps are the ones worked out afresh', () => {
    const s = fresh(1)
    for (const id of [null, ...ORDER]) {
      if (id !== null) grant(s, id)
      for (let i = 0; ; i++) {
        expect(i).toBeLessThan(80)
        s.tick += HINT_EVERY
        stepHint(s)
        const steps = nextSteps(s)
        expect(steps).toEqual(afresh(s))
        const r = steps.find((x) => LAYOUT.has(x.step.kind))
        if (r === undefined) break
        perform(s, r)
      }
    }
  })

  it('firstStep is the first of nextSteps, and nothing during the launch', () => {
    const s = played('science')
    expect(firstStep(s)).toEqual(nextSteps(s)[0])
    s.burrows[0]!.heap[thingIndex('gear')] = HEAP_HINT
    expect(firstStep(s)).toEqual({ step: { kind: 'heap', burrow: 0 }, script: [{ kind: 'tap', hit: { kind: 'heap', burrow: 0 } }] })
    s.launch = { at: s.tick, landsAt: s.tick + 100 }
    expect(firstStep(s)).toBeNull()
  })
})

describe('the link search', () => {
  /** Land 3 with the pad and one oven far east of it: the hint links the oven to the legs. */
  function across(): { s: State; pad: number; oven: number } {
    const s = emptyBoard()
    s.land = 3
    const pad = add(s, 'pad', 1, 4)
    const oven = add(s, 'oven', 12, 5)
    rebuild(s)
    return { s, pad: pad.id, oven: oven.id }
  }
  const linkOf = (s: State) => nextSteps(s).find((r) => r.step.kind === 'link')!

  it('crosses a straight belt at a right angle, which makes a bridge', () => {
    const { s, pad, oven } = across()
    line(s, Array.from({ length: 10 }, (_, i) => [7, 1 + i] as const))
    rebuild(s)
    const r = linkOf(s)
    const path = (r.step as Extract<Step, { kind: 'link' }>).path
    const crossing = path.find((c) => xOf(c) === 7)!
    perform(s, r)
    expect(linked(s, oven, pad)).toBe(true)
    expect(s.belts.over[crossing]).toBeGreaterThanOrEqual(0)
  })

  it('goes round buildings in the way, never through them, and never starts a fork', () => {
    const { s, pad, oven } = across()
    add(s, 'workshop', 7, 4)
    add(s, 'workshop', 7, 6)
    rebuild(s)
    const r = linkOf(s)
    const path = (r.step as Extract<Step, { kind: 'link' }>).path
    for (const c of path.slice(1, -1)) expect(s.owner[c]).toBe(-1)
    perform(s, r)
    expect(linked(s, oven, pad)).toBe(true)
    expect(s.belts.fork.every((f) => f < 0)).toBe(true)
  })

  it('splits a belt longer than STROKE_MAX into strokes the planner lays one after another', () => {
    const s = emptyBoard()
    s.land = 3
    const pad = add(s, 'pad', 1, 4)
    const oven = add(s, 'oven', 18, 10)
    // Walls the belt must wind round, open at the bottom, the top and the bottom in turn (the trees by burrow B close the bottom further east).
    const walls: [number, number[]][] = [
      [16, [0, 2, 4, 6, 8]],
      [10, [2, 4, 6, 8, 10]],
      [5, [0, 2, 4, 6, 8]],
    ]
    for (const [x, ys] of walls) for (const y of ys) add(s, 'workshop', x, y)
    rebuild(s)
    const r = linkOf(s)
    const path = (r.step as Extract<Step, { kind: 'link' }>).path
    expect(path.length).toBeGreaterThan(STROKE_MAX)
    const drags = r.script.filter((a): a is Extract<typeof a, { kind: 'drag' }> => a.kind === 'drag')
    expect(drags.length).toBeGreaterThanOrEqual(2)
    for (const d of drags) expect(d.cells.length).toBeLessThanOrEqual(STROKE_MAX)
    perform(s, r)
    expect(linked(s, oven.id, pad.id)).toBe(true)
  })

  it('on random boards every link it offers lays exactly its link', () => {
    let tried = 0
    for (let seed = 1; seed <= 30; seed++) {
      const s = emptyBoard()
      s.land = 3
      add(s, 'pad', 1, 4)
      const oven = add(s, 'oven', 6 + (seed % 9), 1 + (seed % 8))
      rebuild(s)
      let n = seed * 7919
      const next = () => ((n = (n * 1103515245 + 12345) & 0x7fffffff) >> 8) % 1000
      for (let i = 0; i < 6; i++) {
        const x = next() % 18
        const y = next() % 11
        const plan = planPlace(s, 'workshop', x + 1, y + 1, { x, y })
        if (plan.ok && plan.x === x && plan.y === y) applyEdit(s, plan.edit!)
      }
      for (let i = 0; i < 4; i++) {
        const x = next() % 14
        const y = next() % 9
        const cells = Array.from({ length: 6 }, (_, k) => (i % 2 === 0 ? cellOf(x + k, y) : cellOf(x, y + (k % 3))))
        const plan = planStroke(s, [...new Set(cells)], null)
        if (plan.edit !== null) applyEdit(s, plan.edit)
      }
      if (!s.buildings.includes(oven)) continue
      const r = nextSteps(s).find((x) => x.step.kind === 'link' && x.step.from === oven.id)
      if (r === undefined) continue
      tried++
      perform(s, r)
      expect(linked(s, oven.id, 2)).toBe(true)
    }
    expect(tried).toBeGreaterThan(10)
  })
})

describe("the Oops rule's reach", () => {
  it('broke when a working machine loses a feed or its way out, or is taken away, or the pad loses a thing that reached it', () => {
    const s = played('digger')
    const oven = s.buildings.find((b) => b.id === 1)!
    oven.batch = { makes: 'blueBar', at: s.tick, until: s.tick + 120 }
    const before = reachOf(s)
    const digger = of(s, 'digger')[0]!
    const feed = cloneState(s)
    applyEdit(feed, planPeelDrag(feed, s.net.spouts.get(digger.id)!.map((x) => x >> 1)).edit!)
    expect(brokeBetween(before, reachOf(feed))).toBe(true)
    const out = cloneState(s)
    applyEdit(out, planPeelDrag(out, s.net.spouts.get(1)!.map((x) => x >> 1)).edit!)
    expect(brokeBetween(before, reachOf(out))).toBe(true)
    const gone = cloneState(s)
    applyEdit(gone, { belts: [], removed: [{ id: 1, kind: 'oven', x: oven.x, y: oven.y }], added: [], hedges: [] })
    expect(brokeBetween(before, reachOf(gone))).toBe(true)
    // An idle machine losing a feed, the pad still reached: not broke. Nor a new belt that changes nothing that worked.
    oven.batch = null
    expect(brokeBetween(reachOf(s), reachOf(feed))).toBe(false)
    const more = cloneState(s)
    applyEdit(more, planStroke(more, [cellOf(10, 9), cellOf(11, 9), cellOf(12, 9)], null).edit!)
    expect(brokeBetween(reachOf(s), reachOf(more))).toBe(false)
  })
})

describe('speed', () => {
  /** The bound on a look, in milliseconds: generous under the tests runner on a quiet machine (FACTORY_LONG=1), and five times that by default, for the deploy's runner that runs every game's tests at once on a shared machine. */
  const LOOK_MS = process.env.FACTORY_LONG === '1' ? 5 : 25
  it(`a look at a full land 3 with munchers out takes about a millisecond (under ${LOOK_MS} ms under the tests runner)`, () => {
    const s = played('fuel')
    for (let i = 0; i < 4; i++) muncher(s, 'walk', cellOf(10 + i, 9), false)
    s.burrows[1]!.heap[thingIndex('gear')] = 5
    nextSteps(s)
    const t0 = performance.now()
    const runs = 40
    for (let i = 0; i < runs; i++) nextSteps(s)
    expect((performance.now() - t0) / runs).toBeLessThan(LOOK_MS)
  })
})

describe('doability fuzz through rules.act', () => {
  /** What the step says it will do, checked after its script ran through act. */
  function holds(before: State, after: State, r: Ranked): void {
    const st = r.step
    switch (st.kind) {
      case 'muncher':
        expect(after.munchers.find((m) => m.id === st.id)?.mode ?? 'home').toMatch(/caught|home/)
        break
      case 'oops':
        expect(after.undo.length).toBe(before.undo.length - 1)
        break
      case 'unblock':
        expect(after.belts.slot[st.slot]).not.toBe(before.belts.slot[st.slot])
        break
      case 'stack':
        expect(after.buildings.find((b) => b.id === st.id)!.stack.length).toBeLessThan(before.buildings.find((b) => b.id === st.id)!.stack.length)
        break
      case 'heap':
        expect(after.burrows[st.burrow]!.heap.every((n) => n === 0)).toBe(true)
        break
      case 'basket':
        expect(after.basket.reduce((a, n) => a + n, 0)).toBeLessThan(before.basket.reduce((a, n) => a + n, 0))
        break
      case 'choose':
        expect(after.choice).toBe('bubbles')
        break
      case 'flap':
        expect(after.land).toBe(before.flap)
        break
      case 'launch':
        expect(after.launch).not.toBeNull()
        break
      case 'card':
        expect(after.card).toBeNull()
        break
      case 'tuck':
        expect(after.buildings.filter((b) => b.kind === st.machine).every((b) => b.tucked)).toBe(true)
        break
      case 'rocket':
        expect(after.buildings.find((b) => b.kind === 'pad')!.tapAt).toBeGreaterThanOrEqual(before.tick)
        break
      case 'dig':
        expect(after.queued).toContainEqual({ kind: 'dig', cell: st.cell, thing: rockOf(st.cell) })
        break
      default:
        did(after, st)
    }
  }
  /** Runs the step's script through act on a copy, checks it, then plays a few seconds and checks the board is sound. */
  function tryStep(s: State, r: Ranked): void {
    const t = cloneState(s)
    t.hint = { step: r.step, at: t.tick }
    for (const a of r.script) act(t, a)
    holds(s, t, r)
    for (let i = 0; i < 180; i++) step(t)
    expect(lintNet(t)).toEqual([])
  }

  it('from every stage of the path, just after its card and once the hint has built for it, the first step does what it says', () => {
    let s = fresh(1)
    for (const id of [null, ...ORDER]) {
      if (id !== null) grant(s, id)
      for (let seed = 1; seed <= 2; seed++) {
        const t = cloneState(s)
        t.rng = seed
        tryStep(t, nextSteps(t)[0]!)
      }
      build(s)
      tryStep(s, nextSteps(s)[0]!)
      s = cloneState(s)
    }
  })

  it('a child who follows the hint through the rules launches the rocket, and every 10 game seconds the first step, run on a copy, does what it says', () => {
    const s = newGame(1)
    act(s, { kind: 'play' })
    act(s, { kind: 'session' })
    // A bare patch of blue rock she digs for fun whenever the hint only points at the rocket (the hint's own digs come as its 'dig' steps).
    const patch = [...Array(CELLS).keys()].find((c) => rockOf(c) === 'blueRock' && cellInLand(1, c) && s.owner[c]! < 0)!
    for (let sec = 0; sec < 90 * 60 && s.launches === 0; sec++) {
      const r = firstStep(s)
      if (r !== null && sec % 10 === 0) tryStep(s, r)
      if (r === null || r.step.kind === 'rocket') {
        if (s.digging === null && s.owner[patch]! < 0 && s.belts.out[patch]! < 0) {
          act(s, { kind: 'touch', down: true })
          act(s, { kind: 'dig', cell: patch, down: true })
        }
      } else {
        if (s.digging !== null) {
          act(s, { kind: 'dig', cell: s.digging.cell, down: false })
          act(s, { kind: 'touch', down: false })
        }
        act(s, { kind: 'touch', down: true })
        for (const a of r.script) act(s, a)
        act(s, { kind: 'touch', down: false })
      }
      for (let i = 0; i < 60; i++) step(s)
      expect(lintNet(s)).toEqual([])
    }
    // Every card found and the rocket flown within an hour and a half (the plan's path is about an hour), the munchers out on visits meanwhile.
    expect(s.found).toHaveLength(ORDER.length)
    expect(s.launches).toBe(1)
    expect(s.burrows[0]!.visits).toBeGreaterThan(0)
  }, 30_000)

  it('every step of a factory at work, munchers out and things to fetch, does what it says', () => {
    const s = played('stars')
    muncher(s, 'sit', s.net.spouts.get(1)!.map((x) => x >> 1)[0]!, false)
    s.burrows[1]!.heap[thingIndex('gear')] = HEAP_HINT
    s.basket[thingIndex('greenBottle')] = 2
    for (let i = 0; i < 60; i++) if (s.tick++ % 20 === 0) hop(s)
    for (const r of nextSteps(s)) tryStep(s, r)
  })
})
