import { BALLOON_R, groundAt, PICK_R, WALKABLE, type Course, type Dish, type Filling, type Sim } from './model'
import { cloneSim, createSim, gateOn, setInput, step } from './sim'

/** The bot decides again every DECIDE steps (0.05 s), and before going on looks GO_AHEAD seconds down its path for a knock. */
const DECIDE = 6
const GO_AHEAD = 1.6
/** How long a wait or a step back must stay safe to be chosen. */
const WAIT_AHEAD = 1.0
/** It gives up after this much game time. */
const GIVE_UP = 240

export interface Walk {
  /** It reached the balloon and the course ended. */
  done: boolean
  ticks: number
  /** The pile it carried into the balloon. */
  pile: number
  poops: number
  bonks: number
  splashes: number
  zaps: number
  /** The foods still lying about when it stopped, and where it was: a failing test's message. */
  left: string[]
  x: number
  y: number
}

/** The tiles round a lying poop (and, while foods are left, round the balloon) that the bot's path keeps off. */
function blocked(s: Sim, course: Course, foodsLeft: boolean): Set<number> {
  const out = new Set<number>()
  const mark = (x: number, y: number, r: number) => {
    for (let row = Math.floor(y - r - 1); row <= Math.floor(y + r + 1); row++) {
      for (let c = Math.floor(x - r - 1); c <= Math.floor(x + r + 1); c++) {
        if (Math.hypot(c + 0.5 - x, row + 0.5 - y) < r) out.add(row * course.cols + c)
      }
    }
  }
  for (const it of s.items) if (it.state !== 'gone' && it.kind === 'poop') mark(it.x, it.y, PICK_R + 0.25)
  if (foodsLeft) mark(course.balloon.x, course.balloon.y, BALLOON_R + 0.6)
  return out
}

/** A breadth-first search over open tiles from her tile: each tile's step back toward her. */
function search(s: Sim, course: Course, avoid: Set<number>) {
  const from = Math.floor(s.hero.y) * course.cols + Math.floor(s.hero.x)
  const back = new Map<number, number>([[from, -1]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i]!
    const c = k % course.cols
    const r = Math.floor(k / course.cols)
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nc = c + dc
      const nr = r + dr
      const nk = nr * course.cols + nc
      if (back.has(nk) || !WALKABLE[groundAt(course, nc, nr)] || avoid.has(nk)) continue
      const g = gateOn(course, nc, nr)
      if (g >= 0 && !s.gates[g]!.open) continue
      back.set(nk, k)
      queue.push(nk)
    }
  }
  return back
}

/** The tile centres from her tile to tile `to`, using a search's steps back; her own tile left out. */
function pathTo(course: Course, back: Map<number, number>, to: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = []
  for (let k = to; back.get(k) !== -1; k = back.get(k)!) out.push({ x: (k % course.cols) + 0.5, y: Math.floor(k / course.cols) + 0.5 })
  return out.reverse()
}

/**
 * Where to head now: the nearest food still lying about, else the balloon; if neither can be
 * reached, the nearest button not yet down (its gate is in the way). Poops are walked round.
 */
function plan(s: Sim, course: Course): { x: number; y: number }[] | null {
  const foods = s.items.filter((it) => it.state === 'ground' && it.kind !== 'poop')
  const left = foods.length > 0 || s.items.some((it) => it.state === 'flying' && it.kind !== 'poop')
  let back = search(s, course, blocked(s, course, left))
  const tile = (p: { x: number; y: number }) => Math.floor(p.y) * course.cols + Math.floor(p.x)
  const nearest = (spots: { x: number; y: number }[]) => {
    let best: number | null = null
    let bestLength = Infinity
    for (const p of spots) {
      const t = tile(p)
      if (!back.has(t)) continue
      const n = pathTo(course, back, t).length
      if (n < bestLength) {
        best = t
        bestLength = n
      }
    }
    return best
  }
  let goal = left ? nearest(foods) : nearest([course.balloon])
  if (goal === null) goal = nearest(course.buttons.filter((_, i) => !s.buttons[i]!.down))
  if (goal === null && !left) {
    // The balloon behind a poop: walk over it rather than not finish.
    back = search(s, course, new Set())
    goal = back.has(tile(course.balloon)) ? tile(course.balloon) : null
  }
  if (goal === null) return null
  const path = pathTo(course, back, goal)
  // The last step goes to the thing itself, not its tile's centre.
  const target = left ? foods.find((f) => tile(f) === goal) : null
  if (target) path.push({ x: target.x, y: target.y })
  return path.length > 0 ? path : [{ x: course.balloon.x, y: course.balloon.y }]
}

/** Steers toward the first waypoint not yet reached, dropping reached ones from the front. */
function follow(s: Sim, path: { x: number; y: number }[]) {
  while (path.length > 1 && Math.hypot(path[0]!.x - s.hero.x, path[0]!.y - s.hero.y) < 0.12) path.shift()
  const p = path[0]!
  setInput(s, (p.x - s.hero.x) * 6, (p.y - s.hero.y) * 6)
}

/** Whether `drive` keeps her out of trouble (no knock, splash or zap) for `seconds`. */
function safe(s: Sim, course: Course, seconds: number, drive: (c: Sim) => void): boolean {
  const c = cloneSim(s)
  c.events.length = 0
  for (let i = 0; i < seconds * 120; i++) {
    drive(c)
    step(c, course)
    for (const e of c.events) if (e.kind === 'bonk' || e.kind === 'splash' || e.kind === 'zap') return false
    c.events.length = 0
    if (c.phase !== 'play') return true
  }
  return true
}

/**
 * A careful child at the controls, to call before every step: always heading for the nearest
 * food, walking round poops, pressing a button when a gate is in the way, and before every
 * step looking down its path for a pole: if going on would be knocked, it waits, or steps
 * back, or aside. `?autoplay` and the walkthrough test both use it.
 */
export function createBot(): (s: Sim, course: Course) => void {
  let drive: (c: Sim) => void = (c) => setInput(c, 0, 0)
  return (s, course) => {
    if (s.tick % DECIDE === 0 && s.phase === 'play' && (s.hero.act === 'walk' || s.hero.act === 'teeter')) {
      const path = plan(s, course)
      if (path === null) {
        drive = (c) => setInput(c, 0, 0)
      } else {
        const live = path.map((p) => ({ ...p }))
        const go = (c: Sim) => follow(c, live)
        const ahead = path.map((p) => ({ ...p }))
        const goOn = (c: Sim) => follow(c, ahead)
        const still = (c: Sim) => setInput(c, 0, 0)
        const first = path[0]!
        const dx = first.x - s.hero.x
        const dy = first.y - s.hero.y
        const back = (c: Sim) => setInput(c, -dx * 4, -dy * 4)
        const sides = [(c: Sim) => setInput(c, -dy * 4, dx * 4), (c: Sim) => setInput(c, dy * 4, -dx * 4)]
        if (safe(s, course, GO_AHEAD, goOn)) drive = go
        else if (safe(s, course, WAIT_AHEAD, still)) drive = still
        else if (safe(s, course, WAIT_AHEAD, back)) drive = back
        else drive = sides.find((side) => safe(s, course, WAIT_AHEAD, side)) ?? go
      }
    }
    drive(s)
  }
}

/** The bot plays a course from the start to the end of the finish (or until it gives up), counting what went wrong. */
export function walkCourse(course: Course, dish: Dish, picks: readonly Filling[]): Walk {
  const s = createSim(course, dish, picks)
  const walk: Walk = { done: false, ticks: 0, pile: 0, poops: 0, bonks: 0, splashes: 0, zaps: 0, left: [], x: 0, y: 0 }
  const bot = createBot()
  while (s.tick < GIVE_UP * 120 && s.phase !== 'done') {
    bot(s, course)
    step(s, course)
    for (const e of s.events) {
      if (e.kind === 'bonk') walk.bonks += 1
      if (e.kind === 'splash') walk.splashes += 1
      if (e.kind === 'zap') walk.zaps += 1
    }
    s.events.length = 0
  }
  walk.done = s.phase === 'done'
  walk.left = s.items.filter((it) => it.state !== 'gone' && it.kind !== 'poop').map((it) => `${it.x.toFixed(1)},${it.y.toFixed(1)}`)
  walk.ticks = s.tick
  walk.pile = s.plate.filter((f) => f !== 'poop').length
  walk.poops = s.plate.length - walk.pile
  walk.x = s.hero.x
  walk.y = s.hero.y
  return walk
}
