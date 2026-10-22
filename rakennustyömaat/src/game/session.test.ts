/**
 * Whole sessions played by the scripted child (child.ts) on a real Game, run the way the
 * page runs it: each frame the game advances, the stage works out the view it draws (which
 * the game keeps for its hit test), and the child's finger goes through Game.pointer (the
 * view and layout.hitTest) or presses a button the HUD shows. Then a fuzz of taps anywhere on
 * the screen and random HUD buttons that checks the shot after every step and the whole state
 * after every move and every fourth step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { simTime, tweening, viewAt, type View } from './camera'
import { HOUSE_GRID, SHAPE_SIZE } from './catalog'
import { BEDTIME, Child, THINK, buttons, childMove, doMove, freeArea, type Move } from './child'
import { Game } from './game'
import { hitTest, inside, validSpots } from './layout'
import { GOODS, STEP, ticks, type Hit, type Shot, type State } from './model'
import { SAVE_KEY, parseKeep } from './progress'
import { rng } from './random'
import { cloneState } from './rules'

/** An in-memory stand-in for the browser's localStorage. */
function memoryStorage() {
  const items = new Map<string, string>()
  return { items, getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) }
}
let storage: ReturnType<typeof memoryStorage>
beforeEach(() => {
  storage = memoryStorage()
  vi.stubGlobal('localStorage', storage)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

/** The stage's size in CSS pixels, a landscape iPad's. */
const W = 1180
const H = 820
/** The long runs step a frame of this many seconds: three steps, the child deciding every other frame. */
const FRAME = 0.05
/** A session in these tests: the child plays this long, then says Good night; the evening takes at most NIGHT_MAX more. */
const SESSION = 4 * 60
const NIGHT_MAX = 60

/** One frame of the page: the game advances `dt` seconds, and the stage works out the view it draws, as Stage.tsx does. */
function frame(g: Game, dt: number) {
  const f = g.advance(dt)
  g.setView(viewAt(g.state, (g.state.tick + f.alpha - 1) * STEP, W, H, 1))
  return f
}

/** Frames of FRAME seconds with `child` playing, until `done` or `seconds` of frames; whether `done` came. */
function play(g: Game, child: Child, seconds: number, done: (g: Game) => boolean): boolean {
  for (let k = 0; k < seconds / FRAME; k++) {
    frame(g, FRAME)
    child.frame(g)
    if (done(g)) return true
  }
  return false
}

/** A new page over the save in storage (or a test page with `search`), its first frame drawn. */
function open(search: string, seed: number): Game {
  const g = new Game(search, seed)
  frame(g, 0)
  return g
}

describe('the scripted child', () => {
  it('plays a first visit to a themed room with two items put in within five game minutes, every move a button on screen or a tap the hit test gives to a target', () => {
    for (const seed of [1, 2, 3]) {
      const g = open('?nosave', seed)
      expect(g.state.shot.kind).toBe('mirror')
      const r = rng(seed)
      const tapped = new Set<Hit['kind']>()
      let itemsIn = 0
      let next = 0
      const done = () => itemsIn >= 2 && g.state.keep.plots.some((p) => p.rooms.some((room) => room.theme !== null && room.items.filter((i) => i !== null).length >= 2))
      while (!done()) {
        expect(g.state.tick, `seed ${seed}: no themed room with two items put in after five minutes`).toBeLessThan(ticks(300))
        itemsIn += frame(g, FRAME).events.filter((e) => e.kind === 'itemIn').length
        const s = g.state
        if (s.tick < next) continue
        next = s.tick + ticks(THINK)
        const view = g.view!
        const move: Move = childMove(s, view, r)
        if (move.kind === 'button') expect(buttons(s), JSON.stringify(move.action)).toContainEqual(move.action)
        if (move.kind === 'tap' || move.kind === 'drag') {
          expect(tweening(s, simTime(s)), 'a canvas move while the camera moves').toBe(false)
          const [x, y] = move.kind === 'tap' ? [move.x, move.y] : [move.x0, move.y0]
          expect(inside(freeArea(s, view), x, y), `${JSON.stringify(move)} outside the free area of the ${s.shot.kind} shot`).toBe(true)
          if (move.kind === 'tap') tapped.add(hitTest(s, view, x, y).kind)
        }
        doMove(g, move)
      }
      // The whole way, by the child's own taps: the truck, the crates and machines, the plot, a ghost spot, a room.
      for (const kind of ['truck', 'machine', 'plot', 'spot', 'room'] as const) expect([...tapped], `seed ${seed}`).toContain(kind)
    }
  })

  it('rings the doorbell from a front door, turns the roof from its button and wiggles the rooms on top of one the hand cannot lift, on the demo street', { timeout: 20_000 }, () => {
    const g = open('?demo=street&seed=5', 5)
    const r = rng(5)
    const tapped = new Set<Hit['kind']>()
    const pressed = new Set<string>()
    const events = new Set<string>()
    let next = 0
    const done = () => tapped.has('door') && pressed.has('roof') && ['doorbell', 'roof', 'wiggle'].every((k) => events.has(k))
    while (!done()) {
      expect(g.state.tick, `after ten minutes: tapped ${[...tapped]}, pressed ${[...pressed]}, heard ${[...events]}`).toBeLessThan(ticks(600))
      for (const e of frame(g, FRAME).events) events.add(e.kind)
      const s = g.state
      if (s.tick < next) continue
      next = s.tick + ticks(THINK)
      const view = g.view!
      // A room with no theme yet offers only the button that asks which room.
      if (s.shot.kind === 'room' && s.ask === null && s.keep.plots[s.shot.plot]!.rooms.find((x) => x.id === (s.shot as { room: number }).room)!.theme === null) expect(buttons(s).filter((a) => a.kind === 'item' || a.kind === 'paint')).toEqual([])
      const move = childMove(s, view, r)
      if (move.kind === 'tap') tapped.add(hitTest(s, view, move.x, move.y).kind)
      if (move.kind === 'button') pressed.add(move.action.kind)
      doMove(g, move)
    }
  })

  // The longest run here, so it has time to spare on a busy machine. Three sessions fill three plots and the next two nearly all the street, where building again is hardest.
  it('plays five sessions in a row through the save, fills three plots and opens more, and is never stuck: from thirteen moments of them it builds a new room within five game minutes', { timeout: 20_000 }, () => {
    const r = rng(12)
    const moments: State[] = []
    for (let k = 0; k < 5; k++) {
      const g = open('', 100 + k)
      const child = new Child(k + 1, SESSION)
      // Two or three moments a session, before bedtime.
      const at = new Set(Array.from({ length: k % 2 === 0 ? 3 : 2 }, () => Math.floor((r() * 0.95 * SESSION) / FRAME)))
      let n = 0
      const slept = play(g, child, SESSION + NIGHT_MAX, () => {
        if (at.has(n++)) moments.push(cloneState(g.state))
        return g.asleep
      })
      expect(slept, `session ${k} ended with Good night`).toBe(true)
      g.store(true)
    }
    const keep = parseKeep(storage.getItem(SAVE_KEY))
    expect(keep.plots.filter((p) => p.kind !== null && validSpots(p, 'small').length === 0).length).toBeGreaterThanOrEqual(3)
    expect(keep.plots.length).toBeGreaterThan(3)
    expect(moments.length).toBe(13)
    moments.forEach((moment, i) => {
      const g = open('?nosave', 1)
      // The page the moment came from held the pedal down with the child's finger: so does this one (held at the mirror, where it sends nothing).
      if (moment.road !== null && moment.road.pedal) g.pedal('touch', true)
      const where = `moment ${i}, on the ${moment.shot.kind} shot`
      const id = moment.keep.nextId
      g.state = moment
      expect(play(g, new Child(200 + i, Infinity), 300, () => g.state.keep.nextId > id), where).toBe(true)
    })
  })

  it('plays a long session on to Good night through ten reloads at random moments, each page rebuilt from parseKeep(serializeKeep(keep)), and still builds', () => {
    const long = 2 * SESSION
    const r = rng(7)
    const reloads = Array.from({ length: 10 }, () => r() * long).sort((a, b) => a - b)
    let g = open('', 7)
    const child = new Child(7, long)
    let played = 0
    for (const [k, at] of reloads.entries()) {
      expect(play(g, child, at - played, () => false)).toBe(false)
      played = at
      // The page hides (the save is written) and comes back as a new page that reads it.
      const keep = g.state.keep
      g.store(true)
      g = open('', 8 + k)
      expect(g.state.keep).toEqual(keep)
    }
    expect(play(g, child, long - played + NIGHT_MAX, () => g.asleep)).toBe(true)
    expect(g.state.keep.trips).toBeGreaterThan(0)
    expect(g.state.keep.plots[0]!.rooms.length).toBeGreaterThan(0)
  })

  it('plays on the page with ?autoplay (only beside ?nosave or ?demo), says Good night at bedtime and wakes the card, never writing the save', () => {
    expect(() => new Game('?autoplay', 1)).toThrow(/nosave/)
    expect(() => new Game('?autoplay&seed=4', 1)).toThrow(/nosave/)
    const g = open('?nosave&autoplay&seed=4', 4)
    // The child plays by itself: the page only advances and draws.
    let k = 0
    while (!g.asleep) {
      expect(k++, 'Good night by bedtime').toBeLessThan((BEDTIME + NIGHT_MAX) / FRAME)
      frame(g, FRAME)
    }
    expect(g.state.keep.trips).toBeGreaterThan(0)
    for (let j = 0; j < 6 * 60; j++) frame(g, 1 / 60)
    expect(g.asleep).toBe(false)
    expect(g.state.night).toBeNull()
    expect(storage.items.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------------------
// The fuzz

/** The screens a shot may change to: the street is the hub; Good night takes any screen to the street. */
const NEXT: Record<Shot['kind'], readonly Shot['kind'][]> = {
  mirror: ['street'],
  street: ['mirror', 'plot', 'road'],
  plot: ['room', 'street'],
  room: ['plot', 'street'],
  road: ['street'],
}

/** Where in the state a number is NaN, as a path, or null. */
function nanAt(v: unknown): string | null {
  if (typeof v === 'number') return Number.isNaN(v) ? '' : null
  if (typeof v !== 'object' || v === null) return null
  if (ArrayBuffer.isView(v)) {
    const i = (v as Float32Array).findIndex((x) => Number.isNaN(x))
    return i < 0 ? null : `[${i}]`
  }
  for (const [k, x] of Object.entries(v)) {
    const at = nanAt(x)
    if (at !== null) return `.${k}${at}`
  }
  return null
}

/** What is wrong with the state, as sentences: goods whole and never below 0, rooms inside their grid, never overlapping and always resting on the ground or on rooms, no NaN anywhere. */
function broken(s: State): string[] {
  const out: string[] = []
  for (const good of GOODS) if (!Number.isInteger(s.keep.goods[good]) || s.keep.goods[good] < 0) out.push(`${good} is ${s.keep.goods[good]}`)
  s.keep.plots.forEach((p, plot) => {
    if (p.kind === null) {
      if (p.rooms.length > 0) out.push(`plot ${plot} has rooms and no house`)
      return
    }
    const grid = HOUSE_GRID[p.kind]
    const taken = new Set<string>()
    for (const room of p.rooms) {
      const { w, h } = SHAPE_SIZE[room.shape]
      if (room.col < 0 || room.row < 0 || room.col + w > grid.cols || room.row + h > grid.rows) out.push(`room ${room.id} is outside plot ${plot}'s grid`)
      for (let c = 0; c < w; c++)
        for (let k = 0; k < h; k++) {
          const cell = `${room.col + c},${room.row + k}`
          if (taken.has(cell)) out.push(`two rooms on plot ${plot} share cell ${cell}`)
          taken.add(cell)
        }
    }
    for (const room of p.rooms) for (let c = 0; c < SHAPE_SIZE[room.shape].w; c++) if (room.row > 0 && !taken.has(`${room.col + c},${room.row - 1}`)) out.push(`room ${room.id} on plot ${plot} floats`)
  })
  const nan = nanAt(s)
  if (nan !== null) out.push(`s${nan} is NaN`)
  return out
}

/** One random move: a tap anywhere on the screen, a drag between two places, or any button the HUD shows; or, half the time, the child's own move, so the random fingers reach the houses and the roads. */
function randomMove(s: State, view: View, r: () => number): Move {
  const u = r()
  if (u < 0.5) return childMove(s, view, r)
  if (u < 0.75) return { kind: 'tap', x: r() * W, y: r() * H }
  if (u < 0.8) return { kind: 'drag', x0: r() * W, y0: r() * H, x1: r() * W, y1: r() * H }
  const all = buttons(s)
  return { kind: 'button', action: all[Math.floor(r() * all.length)]! }
}

describe('the fuzz', () => {
  // A first visit, a rich street with every present opened, and the demo street of finished houses.
  it.each([
    ['?nosave', 1],
    ['?nosave&rich&all', 2],
    ['?demo=street', 3],
  ] as const)('keeps every invariant through three game minutes of taps anywhere, drags and random buttons among the child’s own moves, from %s (under 1 s)', (search, seed) => {
    const g = open(`${search}&seed=${seed}`, seed)
    const r = rng(seed)
    let shot = g.state.shot.kind
    // The shot after every step; the whole state, which takes longer to look through, every fourth step and after every move: what breaks it stays broken, so a step that breaks it shows a few steps on.
    const check = (after: string, whole: boolean) => {
      const s = g.state
      const wrong = whole ? broken(s) : []
      if (s.shot.kind !== shot && !NEXT[shot].includes(s.shot.kind)) wrong.push(`the shot went from ${shot} to ${s.shot.kind}`)
      shot = s.shot.kind
      if (wrong.length > 0) expect.fail(`${search}, tick ${s.tick}, after ${after}: ${wrong.join('; ')}`)
    }
    const kinds = new Set<Shot['kind']>()
    for (let k = 0; k < 3 * 60 * 60; k++) {
      frame(g, 1 / 60)
      check('a step', k % 4 === 0)
      kinds.add(shot)
      if (r() < 0.2) {
        const move = randomMove(g.state, g.view!, r)
        doMove(g, move)
        check(JSON.stringify(move), true)
      }
    }
    // The random fingers get around.
    expect(kinds.size, [...kinds].join(', ')).toBeGreaterThanOrEqual(3)
  })
})
