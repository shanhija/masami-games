import {
  BALLOON_R,
  BAR_HALF,
  BONK_FOR,
  BONK_PUSH,
  BREAD_FOR,
  BUTTON_R,
  CLIMB_FOR,
  FINISH_WALK,
  FLAG_R,
  FLY_FAR,
  FLY_FOR,
  FLY_NEAR,
  FROG_FOR,
  GATE_WARN,
  groundAt,
  HERO_ACCEL,
  HERO_HALF,
  HERO_R,
  HERO_SPEED,
  HZ,
  LIFT_FOR,
  PICK_R,
  POST_R,
  PUPPY_POOPS,
  PUPPY_SPEED,
  SAFE_FOR,
  since,
  SOLID,
  STEP,
  SWIM_FOR,
  TEETER_FOR,
  WALKABLE,
  ZAP_FOR,
  ZAP_PUSH,
  type Act,
  type Course,
  type Dish,
  type Edible,
  type Facing,
  type Filling,
  type Item,
  type Sim,
  type Slider,
  type Spinner,
} from './model'

/** A knock's push fades by this factor a second (e to the minus). */
const KNOCK_FADE = 7
/** A food that just landed waits this long before it can be picked up again, so it is seen landing. */
const SETTLE = 0.2
/** She pulls back from the water if pushing into it moves her less than this share of her walk. */
const STUCK = 0.35
/** In the finish she walks to this far in front of the balloon's middle, then climbs in. */
const BASKET_FRONT = 0.95

// ---------------------------------------------------------------------------------------
// The poles, as functions of time

/** A pole's bar on the ground at one moment: the line it hits along, and which way it moves (a unit vector, zero if it stands still). */
export interface Bar {
  x0: number
  y0: number
  x1: number
  y1: number
  /** Which way this point of the bar sweeps: for a spinner the arm's turning, for a slider its glide. */
  mx: number
  my: number
}

/** A spinner's first arm's direction at a tick, in radians clockwise on screen from +x. */
export function spinnerAngle(sp: Spinner, tick: number): number {
  return (sp.phase + sp.speed * tick * STEP) * Math.PI * 2
}

/** A slider's middle at a tick, and its velocity's direction along a to b (+1 toward b, -1 toward a, 0 at the ends). */
export function sliderAt(sl: Slider, tick: number): { x: number; y: number; toward: number } {
  const u = (((sl.phase + (tick * STEP) / sl.period) % 1) + 1) % 1
  const k = (1 - Math.cos(u * Math.PI * 2)) / 2
  return { x: sl.ax + (sl.bx - sl.ax) * k, y: sl.ay + (sl.by - sl.ay) * k, toward: Math.sin(u * Math.PI * 2) }
}

/** Every pole's bars on the ground at a tick: each spinner arm from its post out, each slider's whole bar. */
export function barsAt(course: Course, tick: number): Bar[] {
  const bars: Bar[] = []
  for (const sp of course.spinners) {
    const a = spinnerAngle(sp, tick)
    const turn = Math.sign(sp.speed)
    for (let k = 0; k < sp.arms; k++) {
      const c = Math.cos(a + k * Math.PI)
      const s = Math.sin(a + k * Math.PI)
      bars.push({ x0: sp.x + c * POST_R, y0: sp.y + s * POST_R, x1: sp.x + c * sp.reach, y1: sp.y + s * sp.reach, mx: -s * turn, my: c * turn })
    }
  }
  for (const sl of course.sliders) {
    const at = sliderAt(sl, tick)
    const c = Math.cos(sl.angle * Math.PI * 2)
    const s = Math.sin(sl.angle * Math.PI * 2)
    const len = Math.hypot(sl.bx - sl.ax, sl.by - sl.ay)
    const m = Math.abs(at.toward) < 0.05 || len === 0 ? 0 : Math.sign(at.toward) / len
    bars.push({ x0: at.x - c * sl.half, y0: at.y - s * sl.half, x1: at.x + c * sl.half, y1: at.y + s * sl.half, mx: (sl.bx - sl.ax) * m, my: (sl.by - sl.ay) * m })
  }
  return bars
}

/** How far point (x, y) is from the segment, and the nearest point on it. */
export function toSegment(x: number, y: number, b: Bar): { d: number; px: number; py: number } {
  const dx = b.x1 - b.x0
  const dy = b.y1 - b.y0
  const len2 = dx * dx + dy * dy
  const k = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - b.x0) * dx + (y - b.y0) * dy) / len2))
  const px = b.x0 + dx * k
  const py = b.y0 + dy * k
  return { d: Math.hypot(x - px, y - py), px, py }
}

// ---------------------------------------------------------------------------------------
// The ground

/** Each course's gate tiles: tile index to gate index. */
const gateMaps = new WeakMap<Course, Map<number, number>>()
function gateMap(course: Course): Map<number, number> {
  let m = gateMaps.get(course)
  if (!m) {
    m = new Map()
    course.gates.forEach((g, i) => {
      for (const t of g.tiles) m!.set(t.r * course.cols + t.c, i)
    })
    gateMaps.set(course, m)
  }
  return m
}

/** The gate on tile (c, r), or -1. */
export function gateOn(course: Course, c: number, r: number): number {
  if (c < 0 || r < 0 || c >= course.cols || r >= course.rows) return -1
  return gateMap(course).get(r * course.cols + c) ?? -1
}

/** Whether her feet's centre may stand at (x, y): walkable ground (an open or closed gate's tile counts; closed ones are walls to her feet's box). */
export function walkable(course: Course, x: number, y: number): boolean {
  return WALKABLE[groundAt(course, Math.floor(x), Math.floor(y))]
}

/** Whether tile (c, r) stops her feet: a hedge, tree or rock, or a gate that is shut. */
function wall(s: Sim, course: Course, c: number, r: number): number | 'solid' | null {
  if (SOLID[groundAt(course, c, r)]) return 'solid'
  const g = gateOn(course, c, r)
  return g >= 0 && !s.gates[g]!.open ? g : null
}

/** Where a thrown food may come down: walkable, inside the course, clear of walls, shut gates and posts. */
function clear(course: Course, x: number, y: number): boolean {
  const c = Math.floor(x)
  const r = Math.floor(y)
  if (SOLID[groundAt(course, c, r)] || gateOn(course, c, r) >= 0) return false
  return course.spinners.every((sp) => Math.hypot(x - sp.x, y - sp.y) > POST_R + 0.2)
}

// ---------------------------------------------------------------------------------------
// The sim

/** The random generator (mulberry32): the next number in [0, 1), advancing the sim's seed. */
function rand(s: Sim): number {
  s.seed = (s.seed + 0x6d2b79f5) | 0
  let t = s.seed
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** A fresh visit to `course` with the kitchen's dish and fillings: she stands at the start with an empty plate, the foods lie on their spots taking the fillings in turn. */
export function createSim(course: Course, dish: Dish, picks: readonly Filling[], seed = 1): Sim {
  if (picks.length === 0) throw new Error('createSim: pick at least one filling')
  const lying = (kind: Edible, x: number, y: number): Item => ({ kind, x, y, state: 'ground', fx: x, fy: y, at: -1, lands: -1 })
  return {
    tick: 0,
    phase: 'play',
    phaseAt: 0,
    dish,
    picks: [...picks],
    hero: {
      x: course.start.x,
      y: course.start.y,
      px: course.start.x,
      py: course.start.y,
      vx: 0,
      vy: 0,
      face: 'down',
      act: 'walk',
      actAt: 0,
      teeter: 0,
      kx: 0,
      ky: 0,
      safeUntil: 0,
      walked: 0,
    },
    plate: [],
    items: [...course.foods.map((f, i) => lying(picks[i % picks.length]!, f.x, f.y)), ...course.poops.map((p) => lying('poop', p.x, p.y))],
    gates: course.gates.map(() => ({ open: false, at: -1, until: -1 })),
    buttons: course.buttons.map(() => ({ down: false, at: -1 })),
    flags: course.flags.map(() => ({ at: -1 })),
    flag: -1,
    puppies: course.puppies.map((p) => ({ x: p.path[0]!.x, y: p.path[0]!.y, target: Math.min(1, p.path.length - 1), dir: 1, face: 'down', walked: 0, poopAt: Math.round(p.every * HZ) })),
    input: { x: 0, y: 0 },
    lost: 0,
    seed: seed | 0,
    events: [],
  }
}

/** A deep copy: the sim is plain data. */
export function cloneSim(s: Sim): Sim {
  return structuredClone(s)
}

/** Where she wants to go: any direction, its length capped at 1 (a finger close by walks her slower). */
export function setInput(s: Sim, x: number, y: number) {
  const len = Math.hypot(x, y)
  const k = len > 1 ? 1 / len : 1
  s.input.x = x * k
  s.input.y = y * k
}

function setAct(s: Sim, act: Act) {
  s.hero.act = act
  s.hero.actAt = s.tick
}

/** One step of the course: the gates' clocks, the puppies, the flying foods, then her. */
export function step(s: Sim, course: Course) {
  s.tick += 1
  const h = s.hero
  h.px = h.x
  h.py = h.y
  stepGates(s, course)
  stepPuppies(s, course)
  for (const it of s.items) if (it.state === 'flying' && s.tick >= it.lands) land(s, course, it)
  if (s.phase === 'play') stepHero(s, course)
  else if (s.phase === 'finish') stepFinish(s, course)
}

function stepHero(s: Sim, course: Course) {
  const h = s.hero
  const age = since(h.actAt, s.tick)
  switch (h.act) {
    case 'walk':
    case 'teeter':
      walk(s, course)
      break
    case 'bonk':
    case 'zap':
      slide(s, course)
      if (age >= (h.act === 'bonk' ? BONK_FOR : ZAP_FOR)) setAct(s, 'walk')
      break
    case 'swim':
      if (age >= SWIM_FOR) {
        setAct(s, 'frog')
        s.events.push({ kind: 'frog', x: h.x, y: h.y })
      }
      break
    case 'frog':
      if (age >= FROG_FOR) {
        const home = s.flag >= 0 ? course.flags[s.flag]! : course.start
        h.x = h.px = home.x
        h.y = h.py = home.y
        h.vx = h.vy = h.kx = h.ky = 0
        h.face = 'down'
        h.safeUntil = s.tick + Math.round(SAFE_FOR * HZ)
        setAct(s, 'walk')
        s.events.push({ kind: 'back', x: h.x, y: h.y })
      }
      break
    case 'finish':
      break
  }
  if (h.act === 'walk' || h.act === 'teeter') touch(s, course)
}

/** Her own walking: toward the input at her speed, sliding along walls, teetering at the water. */
function walk(s: Sim, course: Course) {
  const h = s.hero
  const wantX = s.input.x * HERO_SPEED
  const wantY = s.input.y * HERO_SPEED
  const dvx = wantX - h.vx
  const dvy = wantY - h.vy
  const dv = Math.hypot(dvx, dvy)
  const most = HERO_ACCEL * STEP
  if (dv > most) {
    h.vx += (dvx / dv) * most
    h.vy += (dvy / dv) * most
  } else {
    h.vx = wantX
    h.vy = wantY
  }
  const hit = move(s, course, (h.vx + h.kx) * STEP, (h.vy + h.ky) * STEP)
  fade(h)
  if (Math.hypot(s.input.x, s.input.y) > 0.2) h.face = facing(s.input.x, s.input.y)
  const moved = Math.hypot(h.x - h.px, h.y - h.py)
  h.walked += moved
  const meant = Math.hypot(wantX, wantY) * STEP
  // Pushing into the water and getting nowhere: she teeters, and falls in if she keeps at it.
  if (hit.water && meant > 0 && moved < STUCK * meant) h.teeter += STEP
  else h.teeter = 0
  if (h.teeter > 0 && h.act === 'walk') {
    setAct(s, 'teeter')
    s.events.push({ kind: 'teeter', x: h.x, y: h.y })
  } else if (h.teeter === 0 && h.act === 'teeter') setAct(s, 'walk')
  if (h.teeter >= TEETER_FOR) {
    fallIn(s, hit.wx, hit.wy)
    return
  }
  if (hit.gate >= 0 && s.tick >= h.safeUntil) zap(s, course, hit.gate, hit.nx, hit.ny)
}

/** A knock's slide: the push alone, stopped by walls and by the water's edge (a knock never throws her in). */
function slide(s: Sim, course: Course) {
  const h = s.hero
  h.vx = h.vy = 0
  move(s, course, h.kx * STEP, h.ky * STEP)
  fade(h)
}

function fade(h: Sim['hero']) {
  const k = Math.exp(-KNOCK_FADE * STEP)
  h.kx *= k
  h.ky *= k
  if (Math.abs(h.kx) < 0.01) h.kx = 0
  if (Math.abs(h.ky) < 0.01) h.ky = 0
}

function facing(x: number, y: number): Facing {
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left'
  return y > 0 ? 'down' : 'up'
}

/**
 * Moves her feet by (dx, dy), an axis at a time: her feet's box stops at walls and shut
 * gates, her feet's centre stops at the water's edge, and she is pushed off spinner posts.
 * Says whether water stopped her (and where she was heading), and which shut gate she
 * pressed against with the way back out of it.
 */
function move(s: Sim, course: Course, dx: number, dy: number) {
  const h = s.hero
  const out = { water: false, wx: 0, wy: 0, gate: -1, nx: 0, ny: 0 }
  for (const axis of [0, 1] as const) {
    const d = axis === 0 ? dx : dy
    if (d === 0) continue
    let x = axis === 0 ? h.x + d : h.x
    let y = axis === 0 ? h.y : h.y + d
    // The leading edge of her feet's box: the tiles it reaches into.
    const lead = axis === 0 ? Math.floor(x + Math.sign(d) * HERO_HALF) : Math.floor(y + Math.sign(d) * HERO_HALF)
    const from = Math.floor((axis === 0 ? y : x) - HERO_HALF)
    const to = Math.floor((axis === 0 ? y : x) + HERO_HALF)
    for (let k = from; k <= to; k++) {
      const w = axis === 0 ? wall(s, course, lead, k) : wall(s, course, k, lead)
      if (w === null) continue
      const edge = d > 0 ? lead - HERO_HALF - 1e-6 : lead + 1 + HERO_HALF + 1e-6
      if (axis === 0) x = edge
      else y = edge
      if (w !== 'solid') {
        out.gate = w
        out.nx = axis === 0 ? -Math.sign(d) : 0
        out.ny = axis === 1 ? -Math.sign(d) : 0
      }
      break
    }
    if (!walkable(course, x, y)) {
      out.water = true
      out.wx = x
      out.wy = y
      continue
    }
    h.x = x
    h.y = y
  }
  for (const sp of course.spinners) {
    const ox = h.x - sp.x
    const oy = h.y - sp.y
    const d = Math.hypot(ox, oy)
    const min = POST_R + HERO_HALF
    if (d >= min) continue
    const nx = d === 0 ? 0 : ox / d
    const ny = d === 0 ? 1 : oy / d
    const x = sp.x + nx * min
    const y = sp.y + ny * min
    if (walkable(course, x, y) && wall(s, course, Math.floor(x), Math.floor(y)) === null) {
      h.x = x
      h.y = y
    }
  }
  return out
}

/** She falls into the water she was heading for: the plate's pile floats away, and she swims until the frog comes. */
function fallIn(s: Sim, wx: number, wy: number) {
  const h = s.hero
  const dx = wx - h.x
  const dy = wy - h.y
  const d = Math.hypot(dx, dy) || 1
  h.x += (dx / d) * 0.35
  h.y += (dy / d) * 0.35
  h.vx = h.vy = h.kx = h.ky = 0
  h.teeter = 0
  const foods = [...s.plate]
  s.lost += foods.filter((f) => f !== 'poop').length
  s.plate.length = 0
  setAct(s, 'swim')
  s.events.push({ kind: 'splash', n: foods.length, foods, x: h.x, y: h.y })
}

/** What her feet reach this step: poles, foods, buttons, flags and the balloon. */
function touch(s: Sim, course: Course) {
  const h = s.hero
  if (s.tick >= h.safeUntil) {
    for (const b of barsAt(course, s.tick)) {
      const near = toSegment(h.x, h.y, b)
      if (near.d >= HERO_R + BAR_HALF) continue
      // Pushed the way the bar sweeps, and a little away from it, so she leaves its path.
      const ax = near.d === 0 ? 0 : (h.x - near.px) / near.d
      const ay = near.d === 0 ? 0 : (h.y - near.py) / near.d
      let px = b.mx + ax * 0.6
      let py = b.my + ay * 0.6
      const len = Math.hypot(px, py)
      if (len < 1e-6) {
        px = 0
        py = 1
      } else {
        px /= len
        py /= len
      }
      bonk(s, course, px, py)
      return
    }
  }
  for (const it of s.items) {
    if (it.state !== 'ground' || since(it.at, s.tick) < SETTLE) continue
    if ((it.x - h.x) ** 2 + (it.y - h.y) ** 2 > PICK_R * PICK_R) continue
    it.state = 'gone'
    s.plate.push(it.kind)
    s.events.push({ kind: 'pick', food: it.kind, n: s.plate.length, x: it.x, y: it.y })
  }
  course.buttons.forEach((b, i) => {
    if (!s.buttons[i]!.down && Math.hypot(b.x - h.x, b.y - h.y) < BUTTON_R) press(s, course, i)
  })
  course.flags.forEach((f, i) => {
    if (s.flags[i]!.at < 0 && Math.hypot(f.x - h.x, f.y - h.y) < FLAG_R) {
      s.flags[i]!.at = s.tick
      s.flag = i
      s.events.push({ kind: 'flag', i, x: f.x, y: f.y })
    }
  })
  if (Math.hypot(course.balloon.x - h.x, course.balloon.y - h.y) < BALLOON_R) {
    s.phase = 'finish'
    s.phaseAt = s.tick
    h.vx = h.vy = h.kx = h.ky = 0
    h.teeter = 0
    setAct(s, 'finish')
    s.events.push({ kind: 'finish', x: h.x, y: h.y })
  }
}

/** A pole hit her: every food flies off the plate, and she slides the way the pole pushed. */
function bonk(s: Sim, course: Course, px: number, py: number) {
  const h = s.hero
  h.kx = px * BONK_PUSH
  h.ky = py * BONK_PUSH
  h.vx = h.vy = 0
  h.teeter = 0
  h.safeUntil = s.tick + Math.round(SAFE_FOR * HZ)
  setAct(s, 'bonk')
  const n = s.plate.length
  for (const kind of s.plate) throwFood(s, course, kind, null)
  s.plate.length = 0
  s.events.push({ kind: 'bonk', n, x: h.x, y: h.y })
}

/** She touched a shut gate: she bounces back out of it and the top food falls off behind her. */
function zap(s: Sim, course: Course, gate: number, nx: number, ny: number) {
  const h = s.hero
  h.kx = nx * ZAP_PUSH
  h.ky = ny * ZAP_PUSH
  h.vx = h.vy = 0
  h.teeter = 0
  h.safeUntil = s.tick + Math.round((ZAP_FOR + 0.4) * HZ)
  setAct(s, 'zap')
  const top = s.plate.pop()
  if (top !== undefined) throwFood(s, course, top, { x: nx, y: ny })
  s.events.push({ kind: 'zap', hue: course.gates[gate]!.hue, lost: top !== undefined, x: h.x, y: h.y })
}

/**
 * Throws a food off the plate to a spot round her (or behind her, the way `dir` points):
 * somewhere between FLY_NEAR and FLY_FAR away, coming down short of the first wall, gate or
 * post in its way (so it never lands where she cannot go), a spot in the water drawn again
 * once. It lands FLY_FOR later, give or take.
 */
function throwFood(s: Sim, course: Course, kind: Edible, dir: { x: number; y: number } | null) {
  const h = s.hero
  let x = h.x
  let y = h.y
  for (let attempt = 0; attempt < 2; attempt++) {
    const a = dir === null ? rand(s) * Math.PI * 2 : Math.atan2(dir.y, dir.x) + (rand(s) - 0.5) * 1.2
    const far = dir === null ? FLY_NEAR + rand(s) * (FLY_FAR - FLY_NEAR) : 0.9 + rand(s) * 0.5
    x = h.x
    y = h.y
    // Outward in steps of about 0.15 tiles, stopping at the last clear one.
    const steps = Math.ceil(far / 0.15)
    for (let k = 1; k <= steps; k++) {
      const nx = h.x + (Math.cos(a) * far * k) / steps
      const ny = h.y + (Math.sin(a) * far * k) / steps
      if (!clear(course, nx, ny)) break
      x = nx
      y = ny
    }
    if (walkable(course, x, y)) break
  }
  const flight = Math.round(FLY_FOR * HZ * (0.85 + 0.3 * rand(s)))
  const item = s.items.find((it) => it.state === 'gone')
  const thrown: Item = { kind, x, y, state: 'flying', fx: h.x, fy: h.y, at: s.tick, lands: s.tick + flight }
  if (item) Object.assign(item, thrown)
  else s.items.push(thrown)
}

/** A thrown food comes down: on the ground to be picked up again, or in the water and gone. */
function land(s: Sim, course: Course, it: Item) {
  it.at = s.tick
  if (walkable(course, it.x, it.y)) {
    it.state = 'ground'
    s.events.push({ kind: 'land', food: it.kind, x: it.x, y: it.y })
    return
  }
  it.state = 'gone'
  if (it.kind !== 'poop') s.lost += 1
  s.events.push({ kind: 'sink', food: it.kind, x: it.x, y: it.y })
}

/** A button goes down: every gate of its hue opens (for good, or for the course's time for that hue). */
function press(s: Sim, course: Course, i: number) {
  const b = course.buttons[i]!
  s.buttons[i] = { down: true, at: s.tick }
  s.events.push({ kind: 'press', hue: b.hue, x: b.x, y: b.y })
  const open = course.openFor[b.hue]
  let opened = false
  course.gates.forEach((g, k) => {
    if (g.hue !== b.hue) return
    const st = s.gates[k]!
    if (!st.open) {
      st.open = true
      st.at = s.tick
      opened = true
    }
    st.until = open === null ? -1 : s.tick + Math.round(open * HZ)
  })
  if (opened) s.events.push({ kind: 'open', hue: b.hue })
}

/** Gates that close again count down: a warning GATE_WARN before, then shut, pushing her out of the way and popping their buttons back up. */
function stepGates(s: Sim, course: Course) {
  const warned = new Set<string>()
  const shut = new Set<string>()
  course.gates.forEach((g, i) => {
    const st = s.gates[i]!
    if (!st.open || st.until < 0) return
    if (s.tick === st.until - Math.round(GATE_WARN * HZ) && !warned.has(g.hue)) {
      warned.add(g.hue)
      s.events.push({ kind: 'warn', hue: g.hue })
    }
    if (s.tick < st.until) return
    st.open = false
    st.at = s.tick
    st.until = -1
    if (!shut.has(g.hue)) {
      shut.add(g.hue)
      s.events.push({ kind: 'close', hue: g.hue })
    }
    shove(s, course, i)
  })
  for (const hue of shut) {
    course.buttons.forEach((b, i) => {
      if (b.hue === hue) s.buttons[i] = { down: false, at: s.tick }
    })
  }
}

/** A gate shut where she stands: she is pushed out to whichever side her middle is on. */
function shove(s: Sim, course: Course, gate: number) {
  const h = s.hero
  if (h.act === 'swim' || h.act === 'frog' || s.phase !== 'play') return
  const g = course.gates[gate]!
  for (const t of g.tiles) {
    const inside = h.x + HERO_HALF > t.c && h.x - HERO_HALF < t.c + 1 && h.y + HERO_HALF > t.r && h.y - HERO_HALF < t.r + 1
    if (!inside) continue
    if (g.along === 'row') h.y = h.y < t.r + 0.5 ? t.r - HERO_HALF - 0.01 : t.r + 1 + HERO_HALF + 0.01
    else h.x = h.x < t.c + 0.5 ? t.c - HERO_HALF - 0.01 : t.c + 1 + HERO_HALF + 0.01
    h.px = h.x
    h.py = h.y
    // Stopped where she was pushed to, and not zapped by the gate she was walking into.
    h.vx = h.vy = h.kx = h.ky = 0
    h.safeUntil = Math.max(h.safeUntil, s.tick + Math.round((ZAP_FOR + 0.4) * HZ))
    s.events.push({ kind: 'shove', hue: g.hue, x: h.x, y: h.y })
    return
  }
}

/** Puppies trot to and fro along their paths and leave a poop now and then. */
function stepPuppies(s: Sim, course: Course) {
  const cap = course.poops.length + PUPPY_POOPS * course.puppies.length
  course.puppies.forEach((p, i) => {
    const st = s.puppies[i]!
    const goal = p.path[st.target]!
    const dx = goal.x - st.x
    const dy = goal.y - st.y
    const d = Math.hypot(dx, dy)
    const stride = PUPPY_SPEED * STEP
    if (d <= stride) {
      st.x = goal.x
      st.y = goal.y
      st.walked += d
      if (p.path.length > 1) {
        if (st.target + st.dir < 0 || st.target + st.dir >= p.path.length) st.dir = st.dir === 1 ? -1 : 1
        st.target += st.dir
      }
    } else {
      st.x += (dx / d) * stride
      st.y += (dy / d) * stride
      st.walked += stride
      st.face = facing(dx, dy)
    }
    if (s.tick < st.poopAt) return
    const lying = s.items.filter((it) => it.kind === 'poop' && it.state !== 'gone').length
    const h = s.hero
    // Behind the puppy, half a tile back the way it came.
    const bx = st.x - (st.face === 'right' ? 0.45 : st.face === 'left' ? -0.45 : 0)
    const by = st.y - (st.face === 'down' ? 0.45 : st.face === 'up' ? -0.45 : 0)
    // Never next to her, and never on or beside a food: she could not pick the food up without the poop.
    const byFood = s.items.some((it) => it.state === 'ground' && it.kind !== 'poop' && Math.hypot(it.x - bx, it.y - by) < 1.2)
    if (lying < cap && !byFood && Math.hypot(bx - h.x, by - h.y) > 1.2 && walkable(course, bx, by) && clear(course, bx, by)) {
      const item = s.items.find((it) => it.state === 'gone')
      const poop: Item = { kind: 'poop', x: bx, y: by, state: 'ground', fx: bx, fy: by, at: s.tick, lands: s.tick }
      if (item) Object.assign(item, poop)
      else s.items.push(poop)
      s.events.push({ kind: 'puppy', x: bx, y: by })
      st.poopAt = s.tick + Math.round(p.every * HZ)
    } else st.poopAt = s.tick + Math.round(0.5 * HZ)
  })
}

/** The finish: she walks to the basket, the bread closes round her pile, she climbs in, and the balloon lifts off. */
function stepFinish(s: Sim, course: Course) {
  const h = s.hero
  const t = since(s.phaseAt, s.tick)
  const gx = course.balloon.x
  const gy = course.balloon.y + BASKET_FRONT
  if (t < FINISH_WALK) {
    const dx = gx - h.x
    const dy = gy - h.y
    const d = Math.hypot(dx, dy)
    const stride = Math.max(HERO_SPEED * 0.8 * STEP, d / Math.max(1, (FINISH_WALK - t) * HZ))
    if (d <= stride) {
      h.x = gx
      h.y = gy
    } else {
      h.x += (dx / d) * stride
      h.y += (dy / d) * stride
      h.face = facing(dx, dy)
    }
    h.walked += Math.hypot(h.x - h.px, h.y - h.py)
    return
  }
  const at = (seconds: number) => s.tick === s.phaseAt + Math.round(seconds * HZ)
  if (at(FINISH_WALK)) {
    h.x = gx
    h.y = gy
    h.face = 'down'
    s.events.push({ kind: 'bread', dish: s.dish })
  } else if (at(FINISH_WALK + BREAD_FOR)) s.events.push({ kind: 'climb' })
  else if (at(FINISH_WALK + BREAD_FOR + CLIMB_FOR)) s.events.push({ kind: 'liftoff' })
  else if (at(FINISH_WALK + BREAD_FOR + CLIMB_FOR + LIFT_FOR)) {
    s.phase = 'done'
    s.phaseAt = s.tick
  }
}

/** The finish's moments in seconds from its start: the bread, climbing in, the lift-off, the end. */
export const FINISH_TIMES = {
  bread: FINISH_WALK,
  climb: FINISH_WALK + BREAD_FOR,
  liftoff: FINISH_WALK + BREAD_FOR + CLIMB_FOR,
  done: FINISH_WALK + BREAD_FOR + CLIMB_FOR + LIFT_FOR,
} as const
