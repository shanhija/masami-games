import {
  BASKET_Y,
  BREAD,
  DROP_END,
  DROP_FIRST,
  DROP_START,
  EAT_FOR,
  FALL_G,
  FEED_GROUND,
  FEED_W,
  HZ,
  INTRO_FOR,
  MONSTER_ACCEL,
  MONSTER_SPEED,
  MOUTH_HALF,
  MOUTH_Y,
  since,
  STARS_2,
  STARS_3,
  STEP,
  TRACK_L,
  TRACK_R,
  type CourseId,
  type Dish,
  type Edible,
  type Feed,
  type Food,
} from './model'

/** A missed layer's bird hops in this long after it lands. */
export const BIRD_AFTER = 0.5
/** The burp comes this long into the happy dance. */
const BURP_AT = 1.2
/** How hard the monster steers toward a finger: its speed per tile still to go, before the cap. */
const CHASE = 7

/** The stars for eating `eaten` of the course's `total` fillings: three from STARS_3, two from STARS_2, else one. */
export function starsFor(eaten: number, total: number): number {
  const share = total === 0 ? 1 : eaten / total
  return share >= STARS_3 ? 3 : share >= STARS_2 ? 2 : 1
}

/** Where the balloon floats at a tick: a slow, uneven sway across the middle of the scene, inside the track. */
export function balloonX(tick: number): number {
  const t = tick * STEP
  const x = FEED_W / 2 + 4.4 * Math.sin(t * 0.52) + 1.3 * Math.sin(t * 1.31 + 1)
  return Math.max(TRACK_L + 0.6, Math.min(TRACK_R - 0.6, x))
}

/** The finale for a dish: the bottom bread falls first, then the pile from the bottom up, the top bread last. `total` is the fillings the course had. */
export function createFeed(course: CourseId, dish: Dish, pile: readonly Edible[], total: number): Feed {
  const b = balloonX(0)
  return {
    tick: 0,
    phase: 'intro',
    phaseAt: 0,
    course,
    dish,
    queue: [BREAD[dish].bottom, ...pile, BREAD[dish].top],
    falling: [],
    monster: { x: FEED_W / 2, px: FEED_W / 2, vx: 0, chewAt: -1, blehAt: -1, missAt: -1 },
    balloon: { x: b, px: b },
    nextDropAt: -1,
    eaten: 0,
    breads: 0,
    spat: 0,
    missed: 0,
    total,
    stars: 0,
    input: { dir: 0, to: null },
    events: [],
  }
}

/** Keys steer the monster by direction; a finger pulls it toward a point on the track. The newest wins. */
export function steerFeed(f: Feed, dir: -1 | 0 | 1, to: number | null) {
  f.input.dir = dir
  f.input.to = to
}

/** How many layers the dish had in all. */
export function layersOf(f: Feed): number {
  return f.queue.length + f.falling.length
}

/** One step of the finale: the balloon sways, the monster rolls, the next layer drops when due, falling layers are caught or land. */
export function stepFeed(f: Feed) {
  f.tick += 1
  const m = f.monster
  m.px = m.x
  f.balloon.px = f.balloon.x
  f.balloon.x = balloonX(f.tick)

  const want = f.input.to !== null ? Math.max(-1, Math.min(1, ((f.input.to - m.x) * CHASE) / MONSTER_SPEED)) * MONSTER_SPEED : f.input.dir * MONSTER_SPEED
  const dv = want - m.vx
  const most = MONSTER_ACCEL * STEP
  m.vx += Math.max(-most, Math.min(most, dv))
  m.x += m.vx * STEP
  if (m.x < TRACK_L || m.x > TRACK_R) {
    m.x = Math.max(TRACK_L, Math.min(TRACK_R, m.x))
    m.vx = 0
  }

  const age = since(f.phaseAt, f.tick)
  if (f.phase === 'intro' && age >= INTRO_FOR) {
    f.phase = 'drop'
    f.phaseAt = f.tick
    f.nextDropAt = f.tick + Math.round(DROP_FIRST * HZ)
  }
  if (f.phase === 'drop' && f.queue.length > 0 && f.tick >= f.nextDropAt) {
    const kind = f.queue.shift()!
    const x = f.balloon.x
    f.falling.push({ kind, x, y: BASKET_Y, px: x, py: BASKET_Y, vy: 0, state: 'fall', at: f.tick, endAt: -1 })
    f.events.push({ kind: 'drop', food: kind, x })
    // Quicker as the dish goes: DROP_START after the first, DROP_END before the last.
    const all = f.falling.length + f.queue.length
    const k = all <= 2 ? 1 : (f.falling.length - 1) / (all - 2)
    f.nextDropAt = f.tick + Math.round((DROP_START + (DROP_END - DROP_START) * k) * HZ)
  }

  for (const it of f.falling) {
    it.px = it.x
    it.py = it.y
    if (it.state === 'missed' && it.endAt >= 0 && f.tick === it.endAt + Math.round(BIRD_AFTER * HZ)) f.events.push({ kind: 'bird', x: it.x })
    if (it.state !== 'fall') continue
    it.vy += FALL_G * STEP
    const y = it.y + it.vy * STEP
    // Caught as it crosses the mouth's line within reach of the monster's middle.
    if (it.y < MOUTH_Y && y >= MOUTH_Y && Math.abs(it.x - m.x) <= MOUTH_HALF) {
      it.y = MOUTH_Y
      it.endAt = f.tick
      if (it.kind === 'poop') {
        it.state = 'spat'
        f.spat += 1
        m.blehAt = f.tick
        f.events.push({ kind: 'bleh', x: it.x })
      } else {
        it.state = 'eaten'
        if (isBread(it.kind)) f.breads += 1
        else f.eaten += 1
        m.chewAt = f.tick
        f.events.push({ kind: 'chomp', food: it.kind, n: f.eaten, x: it.x })
      }
      continue
    }
    it.y = y
    if (it.y >= FEED_GROUND - 0.05) {
      it.y = FEED_GROUND - 0.05
      it.state = 'missed'
      it.endAt = f.tick
      f.missed += 1
      m.missAt = f.tick
      f.events.push({ kind: 'miss', food: it.kind, x: it.x })
    }
  }

  if (f.phase === 'drop' && f.queue.length === 0 && f.falling.every((it) => it.state !== 'fall')) {
    f.phase = 'eat'
    f.phaseAt = f.tick
    f.events.push({ kind: 'full' })
  } else if (f.phase === 'eat') {
    if (f.tick === f.phaseAt + Math.round(BURP_AT * HZ)) f.events.push({ kind: 'burp' })
    if (age >= EAT_FOR) {
      f.phase = 'done'
      f.phaseAt = f.tick
      f.stars = starsFor(f.eaten, f.total)
      f.events.push({ kind: 'stars', n: f.stars })
    }
  }
}

export function isBread(kind: Food): boolean {
  return kind === 'bunBottom' || kind === 'bunTop' || kind === 'croissantBottom' || kind === 'croissantTop'
}

/** Where a falling layer will cross the mouth's line, and in how many seconds: what the ground marker shows and the catcher aims for. */
export function landingOf(it: Feed['falling'][number]): number {
  // y = y0 + vy t + g t^2 / 2 reaches MOUTH_Y at t = (-vy + sqrt(vy^2 + 2 g (MOUTH_Y - y0))) / g.
  const gap = Math.max(0, MOUTH_Y - it.y)
  return (-it.vy + Math.sqrt(it.vy * it.vy + 2 * FALL_G * gap)) / FALL_G
}

/** A careful steer for ?autoplay and the tests: under the falling layer that reaches the mouth soonest, else under the balloon. */
export function catcher(f: Feed) {
  let next: Feed['falling'][number] | null = null
  for (const it of f.falling) if (it.state === 'fall' && (next === null || landingOf(it) < landingOf(next))) next = it
  steerFeed(f, 0, next ? next.x : f.balloon.x)
}
