/**
 * The scripted children (child.ts) on a real Game at the plan's screens, run the way the page
 * runs them (childKit.ts frame): each frame the game advances, the child plays against the view
 * drawn last, and the stage draws the next view. Each gesture a script becomes lands its action
 * through the real router and the HUD's calls: the board it leaves and what it answers are what
 * the script does by itself through rules.act. No touch aimed at a muncher draws, places or
 * peels; a resting thumb never freezes the board; the frantic tapper tickles every
 * FRANTIC_EVERY; the chaos and belts-everywhere children keep the network clean; ?autoplay
 * plays the page, Good night and morning included, and never writes the save.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { choose } from './brain'
import { FLOWER_OF, GROUND, PAD_RING, cellInLand, xOf } from './board'
import { BEDTIME, Child, FINGER, FRANTIC_EVERY, PHONE_MM, SCREENS, STEADY, intentsOf, screenNamed, trayButton, type Kid, type Screen } from './child'
import { carefulAt, frame, memoryStorage, open } from './childKit'
import type { Demo } from './fixtures'
import type { Game } from './game'
import type { Ranked } from './hint'
import { sameTool, ticks, type Action, type EventKind, type Placeable, type SimEvent, type State, type Step, type Tool } from './model'
import { act, cloneState } from './rules'
import { lintNet } from './strokes'

beforeEach(() => {
  memoryStorage()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const FRAME = 1 / 60
const SEED = 3

/** The board as the planners see it: every belt cell's sides, the hedges, the buildings. */
const layout = (s: State) => JSON.stringify([[...s.belts.in], [...s.belts.out], [...s.belts.fork], [...s.belts.over], [...s.hedge], s.buildings.map((b) => `${b.kind}@${b.x},${b.y}`)])
/** The events that answer a gesture: what changed the board, and what a tap, a dig, a tickle or a button did. */
const ANSWERS: ReadonlySet<EventKind> = new Set<EventKind>(['lay', 'repoint', 'bridge', 'join', 'fork', 'rollUp', 'hedgeIn', 'place', 'peel', 'oops', 'dig', 'full', 'caught', 'tickleBusy', 'recipe', 'flap', 'launch', 'tuck', 'cardClosed', 'nope'])
/** An answer as a key, without where it is drawn (a finger's point is not the script's). */
const keyOf = (e: SimEvent) => JSON.stringify({ ...e, x: undefined, y: undefined })

/** What a step's script does by itself through rules.act on a copy of the state it was taken in, its touch round it: the board after, and the answers it queued. */
function byItself(s: State, r: Ranked): { s: State; answers: string[] } {
  const p = cloneState(s)
  const from = p.queued.length
  act(p, { kind: 'touch', down: true })
  for (const a of r.script) act(p, a)
  act(p, { kind: 'touch', down: false })
  return { s: p, answers: p.queued.slice(from).filter((e) => ANSWERS.has(e.kind)).map(keyOf) }
}

interface Taken {
  kind: Step['kind']
  landed: boolean
  why: string
}

/** A step's gestures held against its script: the same board, every answer the script gave among what the frames reported, and the choice, the land and the launch where the step is one of those. */
function judge(kind: Step['kind'], pure: { s: State; answers: string[] }, events: readonly SimEvent[], s: State): Taken {
  const why: string[] = []
  if (layout(s) !== layout(pure.s)) why.push('the board differs')
  const got = new Map<string, number>()
  for (const e of events) if (ANSWERS.has(e.kind)) got.set(keyOf(e), (got.get(keyOf(e)) ?? 0) + 1)
  for (const k of pure.answers) {
    const n = got.get(k) ?? 0
    if (n === 0) why.push(`no ${k}`)
    got.set(k, n - 1)
  }
  if (kind === 'choose' && s.choice !== pure.s.choice) why.push('no choice')
  if (kind === 'flap' && s.land !== pure.s.land) why.push('the land did not open')
  if (kind === 'launch' && s.launch === null && s.launches === 0) why.push('no launch')
  return { kind, landed: why.length === 0, why: why.join('; ') }
}

/**
 * From `demo` (of seed SEED) at screen sc, the child `kid` (of `seed`) takes the careful
 * child's steps one after another as soon as it is idle: the crafted ones first, then the
 * hint's first. When a
 * step's gestures are over and the lift's bridge has committed, it is judged against its
 * script. Stops once a step of kind `until` was judged, or after `most` game seconds.
 */
function play(sc: Screen, demo: Demo, kid: Kid, seed: number, until: Step['kind'] | null, most: number, crafted: (s: State) => Ranked[]): Taken[] {
  const g = open(`?demo=${demo}&seed=${SEED}`, SEED, sc)
  const child = new Child(kid, seed)
  const out: Taken[] = []
  let queue: Ranked[] | null = null
  let pending: { kind: Step['kind']; pure: { s: State; answers: string[] }; events: SimEvent[]; idleAt: number | null } | null = null
  const end = g.state.tick + ticks(most)
  for (;;) {
    if (child.idle && pending !== null && pending.idleAt !== null && g.frameTime - pending.idleAt >= 0.25) {
      out.push(judge(pending.kind, pending.pure, pending.events, g.state))
      if (pending.kind === until) return out
      pending = null
    }
    if (child.idle && pending === null) {
      queue ??= crafted(g.state)
      const r = queue.shift() ?? choose(g.state, 'careful')
      if (r !== null) {
        pending = { kind: r.step.kind, pure: byItself(g.state, r), events: [], idleAt: null }
        child.take(g.state, r)
      }
    }
    if (g.state.tick >= end) return out
    const events = frame(g, sc, child, FRAME)
    if (pending !== null) {
      pending.events.push(...events)
      if (child.idle) pending.idleAt ??= g.frameTime
    }
  }
}

/** A crafted step: a script the child takes as if the hint had offered it. */
const crafted = (script: Action[]): Ranked => ({ step: { kind: 'rocket' }, script })

/** Cells for a hedge line: `n` in a row of the land's grass with nothing on them, off the flowers and the pad's ring, and with no building or belt round them (on a phone's small cells a roof stack or a riding thing next door takes the press, and a stroke from what a tap answers begins only SLOP off it). */
function freeRow(s: State, n: number): number[] {
  const clear = (c: number) => [-21, -20, -19, -1, 1, 19, 20, 21].every((d) => s.owner[c + d] === undefined || (s.owner[c + d]! < 0 && s.belts.out[c + d]! < 0))
  const free = (c: number) => cellInLand(s.land, c) && GROUND[c] === 'grass' && FLOWER_OF[c]! < 0 && !PAD_RING.has(c) && s.owner[c]! < 0 && s.belts.out[c]! < 0 && s.hedge[c] === 0 && clear(c)
  for (let c = 0; c < s.belts.out.length; c++) {
    const row = Array.from({ length: n }, (_, i) => c + i)
    if (xOf(c) + n <= 20 && row.every(free)) return row
  }
  throw new Error('no free row')
}

/** A straight run of `n` plain belt cells along a row, for the peel's drag. */
function beltRow(s: State, n: number): number[] {
  const plain = (c: number) => s.belts.out[c]! >= 0 && s.belts.out[c]! % 2 === 0 && s.belts.in[c] === (s.belts.out[c]! + 2) % 4 && s.belts.fork[c]! < 0 && s.belts.over[c]! < 0 && s.owner[c]! < 0
  for (let c = 0; c < s.belts.out.length; c++) {
    const row = Array.from({ length: n }, (_, i) => c + i)
    if (xOf(c) + n <= 20 && row.every(plain)) return row
  }
  throw new Error('no straight belt')
}

/** The moments that bring each gesture, and the step that stops each run: the start card's Play, a dig and a link's stroke; a card's tap and a sticker carried from the tray; a tickle on a sitter and on a napper; the choice (on the choice card, which comes up as Gears! closes, before the hint's own step for it); the flaps; a tuck at dusk; the launch; the peel's two taps and Oops; a hedge line and the peel's drag. */
const NONE = () => []
const CASES: readonly { demo: Demo; until: Step['kind']; most: number; crafted: (s: State) => Ranked[] }[] = [
  { demo: 'start', until: 'link', most: 60, crafted: NONE },
  { demo: 'card-digger', until: 'place', most: 30, crafted: NONE },
  { demo: 'sitting', until: 'muncher', most: 10, crafted: NONE },
  { demo: 'napping', until: 'muncher', most: 10, crafted: NONE },
  { demo: 'card-gears', until: 'choose', most: 60, crafted: () => [{ step: { kind: 'choose' }, script: [{ kind: 'choose', card: 'bubbles' }] }] },
  { demo: 'card-land2', until: 'flap', most: 60, crafted: NONE },
  { demo: 'dusk', until: 'tuck', most: 20, crafted: NONE },
  { demo: 'ready', until: 'launch', most: 20, crafted: NONE },
  {
    demo: 'factory',
    until: 'oops',
    most: 30,
    crafted: (s) => {
      const oven = s.buildings.find((b) => b.kind === 'oven' && b.x === 6 && b.y === 6)!
      const hit = { kind: 'building', id: oven.id } as const
      return [crafted([{ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'tap', hit }, { kind: 'tap', hit }])]
    },
  },
  {
    demo: 'land3',
    until: 'rocket',
    most: 30,
    crafted: (s) => [crafted([{ kind: 'tool', tool: { kind: 'hedge' } }, { kind: 'drag', cells: freeRow(s, 3) }, { kind: 'release', commit: true }]), crafted([{ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'drag', cells: beltRow(s, 3) }, { kind: 'release', commit: true }])],
  },
]

describe('the gestures', () => {
  it('turn a script into a tray tap, a carry from the tray, a tap, a dig, a tickle, a stroke and the HUD calls, and throw on what no finger makes', () => {
    const s = open('?demo=factory&seed=3', 3, screenNamed('1180x820')).state
    expect(intentsOf(s, [{ kind: 'tool', tool: { kind: 'sticker', sticker: 'oven' } }, { kind: 'hold', x: 3, y: 9 }, { kind: 'release', commit: true }])).toEqual([{ kind: 'carry', sticker: 'oven', x: 3, y: 9 }])
    expect(intentsOf(s, [{ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'drag', cells: [1, 2] }, { kind: 'release', commit: true }, { kind: 'oops' }])).toEqual([{ kind: 'tool', tool: { kind: 'peel' } }, { kind: 'trace', cells: [1, 2] }, { kind: 'oops' }])
    expect(intentsOf(s, [{ kind: 'dig', cell: 67, down: true }, { kind: 'dig', cell: 67, down: false }, { kind: 'tickle', id: 4 }, { kind: 'choose', card: 'bubbles' }, { kind: 'card' }])).toEqual([{ kind: 'dig', cell: 67 }, { kind: 'tickle', id: 4 }, { kind: 'choose', card: 'bubbles' }, { kind: 'card' }])
    expect(() => intentsOf(s, [{ kind: 'launch' }])).toThrow(/no finger/)
    expect(() => intentsOf(s, [{ kind: 'drag', cells: [1, 2] }])).toThrow(/never lifts/)
  })

  it('finds every tray sticker inside the tray band, in arrival order, on every screen', { timeout: 30_000 }, () => {
    for (const sc of SCREENS) {
      const g = open('?demo=land3&seed=3', 3, sc)
      const f = g.view!.hud
      if (f.tray === null) continue
      let last = -Infinity
      for (const b of g.hud.tray.stickers) {
        const box = trayButton(f, g.hud.tray, b.sticker)
        expect(box.x >= f.tray.x && box.x + box.w <= f.tray.x + f.tray.w && box.y >= f.tray.y && box.y + box.h <= f.tray.y + f.tray.h, `${sc.name} ${b.sticker}`).toBe(true)
        const at = f.held === 'phone' ? box.y * 10_000 + box.x : box.x
        expect(at, sc.name).toBeGreaterThan(last)
        last = at
      }
    }
  })

  for (const sc of SCREENS) {
    it(`each lands its action through the real router at ${sc.name}`, { timeout: 30_000 }, () => {
      for (const c of CASES) {
        const taken = play(sc, c.demo, carefulAt(sc, STEADY), SEED, c.until, c.most, c.crafted)
        expect(taken.map((t) => t.kind), `${c.demo}: the steps`).toContain(c.until)
        for (const t of taken) expect(t.why, `${sc.name}, ${c.demo}: a ${t.kind} step`).toBe('')
      }
    })
  }
})

describe("the plan's finger", () => {
  // Two children a screen by default, ten with FACTORY_LONG=1. On the phone's 35 px cells a 5 to 8 mm miss or a 4 mm sway often lands on the thing next door, which the router rightly takes.
  it('lands nearly every step on the iPads, and most on the phone', { timeout: 120_000 }, () => {
    const kids = process.env.FACTORY_LONG === '1' ? 10 : 2
    for (const sc of SCREENS) {
      let landed = 0
      let all = 0
      for (let k = 1; k <= kids; k++)
        for (const c of CASES)
          for (const t of play(sc, c.demo, carefulAt(sc, FINGER), SEED * 101 + k, c.until, c.most, c.crafted)) {
            all++
            if (t.landed) landed++
          }
      expect(landed / all, `${sc.name}: ${landed} of ${all} steps landed`).toBeGreaterThanOrEqual(sc.mm === PHONE_MM ? 0.7 : 0.95)
    }
  })
})

/** The tools a child can hold now: the pencil, the peel, the hedge while one is left, and the first sticker with one left. */
function tools(g: Game): Tool[] {
  const tray = g.hud.tray
  const sticker = tray.stickers.find((b) => b.left > 0)
  return [{ kind: 'pencil' }, { kind: 'peel' }, ...(tray.hedge !== null && tray.hedge.left > 0 ? [{ kind: 'hedge' } as const] : []), ...(sticker === undefined ? [] : [{ kind: 'sticker', sticker: sticker.sticker as Placeable } as const])]
}
/** The events of a drawing, a placing or a peeling. */
const EDITS: ReadonlySet<EventKind> = new Set<EventKind>(['lay', 'repoint', 'bridge', 'join', 'fork', 'rollUp', 'hedgeIn', 'place', 'peel', 'lift', 'nope', 'oops'])

describe('a touch aimed at a muncher', () => {
  it('only ever tickles, whatever tool is in hand, at every screen: it never draws, places or peels, and the tool stays picked', { timeout: 30_000 }, () => {
    let touches = 0
    for (const sc of SCREENS)
      for (const demo of ['sitting', 'napping', 'nibbling'] as const) {
        for (const tool of tools(open(`?demo=${demo}&seed=${SEED}`, SEED, sc))) {
          const g = open(`?demo=${demo}&seed=${SEED}`, SEED, sc)
          if (!sameTool(g.state.tool, tool)) g.button({ kind: 'tool', tool }, 'pick')
          const sent = vi.spyOn(g, 'dispatch')
          const child = new Child(carefulAt(sc, FINGER), touches)
          const events: SimEvent[] = []
          for (const m of g.state.munchers.filter((x) => x.mode !== 'watch')) {
            child.take(g.state, { step: { kind: 'muncher', id: m.id }, script: [{ kind: 'tickle', id: m.id }] })
            while (!child.idle) events.push(...frame(g, sc, child, FRAME))
            touches++
          }
          for (let i = 0; i < 20; i++) events.push(...frame(g, sc, child, FRAME))
          const where = `${sc.name}, ${demo}, ${JSON.stringify(tool)}`
          expect(sent.mock.calls.map(([a]) => a.kind).filter((k) => k !== 'touch' && k !== 'tickle'), where).toEqual([])
          expect(events.filter((e) => EDITS.has(e.kind)), where).toEqual([])
          expect(g.state.tool, where).toEqual(tool)
          sent.mockRestore()
        }
      }
    expect(touches).toBeGreaterThan(50)
  })
})

describe('a thumb resting on the glass', () => {
  // Where the other hand's thumb rests (board points): in the gutter, on the ground, on a machine, on the pond, on a rock patch, on the next land's flaps.
  const RESTS: Record<string, { x: number; y: number }> = { gutter: { x: -0.6, y: 6.5 }, ground: { x: 3.5, y: 9.5 }, machine: { x: 6.5, y: 6.5 }, pond: { x: 0.5, y: 8.5 }, patch: { x: 7.5, y: 2.5 }, flaps: { x: 13.15, y: 5.5 } }
  it('never freezes the board: wherever it rests, the playing finger still digs and lays the first belt', { timeout: 30_000 }, () => {
    for (const sc of [screenNamed('1024x768'), screenNamed('750x320')])
      for (const [name, at] of Object.entries(RESTS)) {
        const taken = play(sc, 'start', { ...carefulAt(sc, STEADY), thumb: at }, SEED, 'link', 90, NONE)
        const where = `${sc.name}, a thumb on the ${name}: ${JSON.stringify(taken)}`
        expect(taken.some((t) => t.kind === 'link' && t.landed), where).toBe(true)
        expect(taken.some((t) => t.kind === 'dig' && t.landed), where).toBe(true)
        // A finger that lands before the thumb has rested REST is the router's to ignore; every step after the first lands.
        expect(taken.slice(1).every((t) => t.landed), where).toBe(true)
      }
  })
})

describe('the frantic tapper', () => {
  it('taps at the munchers out every FRANTIC_EVERY while the visit lasts, only ever tickling, and plays on when they have gone home', { timeout: 30_000 }, () => {
    const sc = screenNamed('1180x820')
    const g = open(`?demo=napping&seed=${SEED}`, SEED, sc)
    const child = new Child({ ...carefulAt(sc, FINGER), frantic: true }, 5)
    const pointer = g.pointer.bind(g)
    const downs: number[] = []
    const out = () => g.state.munchers.some((m) => m.mode !== 'home' && m.mode !== 'watch')
    vi.spyOn(g, 'pointer').mockImplementation((kind, id, x, y, press) => {
      if (kind === 'down' && out()) downs.push(g.frameTime)
      pointer(kind, id, x, y, press)
    })
    const sent = vi.spyOn(g, 'dispatch')
    expect(out()).toBe(true)
    const events: SimEvent[] = []
    for (let i = 0; out(); i++) {
      expect(i, 'the visit is over within a minute').toBeLessThan(60 * 60)
      events.push(...frame(g, sc, child, FRAME))
    }
    expect(downs.length).toBeGreaterThanOrEqual(3)
    for (let i = 1; i < downs.length; i++) expect(downs[i]! - downs[i - 1]!).toBeCloseTo(FRANTIC_EVERY, 1)
    expect(sent.mock.calls.map(([a]) => a.kind).filter((k) => k !== 'touch' && k !== 'tickle')).toEqual([])
    expect(events.filter((e) => EDITS.has(e.kind))).toEqual([])
    expect(events.some((e) => e.kind === 'caught')).toBe(true)
    // Then the hint's steps again.
    const before = Object.values(child.log.steps).reduce((a, n) => a + n, 0)
    for (let i = 0; i < 30 * 60; i++) frame(g, sc, child, FRAME)
    expect(Object.values(child.log.steps).reduce((a, n) => a + n, 0)).toBeGreaterThan(before)
  })
})

describe('the chaos and belts-everywhere children', () => {
  for (const kind of ['chaos', 'belts'] as const)
    it(`${kind === 'chaos' ? 'the chaos child (taps, strokes, stickers, peels and Oops anywhere)' : 'the belts-everywhere child (long strokes all over the land)'} plays 5 game minutes from a fresh game and from the full land 3 with the network lint clean and nothing thrown`, { timeout: 60_000 }, () => {
      for (const [demo, name] of [
        ['start', '1024x768'],
        ['land3', '750x320'],
      ] as const) {
        const sc = screenNamed(name)
        const g = open(`?demo=${demo}&seed=${SEED}`, SEED, sc)
        const child = new Child({ play: kind, finger: FINGER, mm: () => sc.mm, thumb: null, frantic: false, bedtime: Infinity }, 11)
        const edits = new Set<EventKind>()
        // Frames of two steps, as a busy iPad draws: the finger's way is still sent every sixtieth of a second.
        for (let i = 0; i < 5 * 60 * 30; i++) {
          for (const e of frame(g, sc, child, 2 * FRAME)) if (EDITS.has(e.kind)) edits.add(e.kind)
          if (i % 30 === 0) expect(lintNet(g.state), `${kind} from ${demo} at ${name}, frame ${i}`).toEqual([])
        }
        expect(lintNet(g.state)).toEqual([])
        // It really drew all over: belts laid, and for the chaos child stickers placed or peeled too.
        expect([...edits], `${kind} from ${demo}`).toContain('lay')
        if (kind === 'chaos') expect([...edits].some((k) => k === 'place' || k === 'peel' || k === 'nope'), `${kind} from ${demo}: ${[...edits]}`).toBe(true)
      }
    })
})

describe('?autoplay', () => {
  it('plays the page by itself: Play, the hint, Good night at bedtime and the morning after, never writing the save', { timeout: 60_000 }, () => {
    const items = memoryStorage()
    const sc = screenNamed('1180x820')
    const g = open('?nosave&autoplay&seed=4&fast=20', 4, sc)
    let slept = false
    for (let i = 0; ; i++) {
      // At ?fast=20 a frame is a third of a game second: bedtime, the tuck-in and the still card's wait.
      expect(i, 'Good night and the morning after within bedtime and a minute').toBeLessThan((BEDTIME + 60) * 3 + 60 * 10)
      frame(g, sc, null, FRAME)
      if (g.asleep) slept = true
      else if (slept) break
    }
    expect(g.state.night).toBeNull()
    expect(g.state.found.length).toBeGreaterThan(4)
    expect(items.size).toBe(0)
  })
})
