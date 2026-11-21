import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'

import { botFrame, createBot } from '../game/bot'
import { BUILD_HALF, BUILDS } from '../game/map'
import { PARTY_FRAMES, STORY } from '../game/jobs'
import { createSim, stepPointer, tick } from '../game/sim'
import { PARTY_FOR, startParty } from '../game/world'
import { clamp } from '../game/math'
import { CHAPTER_IDS, type ChapterId, type Sim } from '../game/model'
import { areaTans, FOV, basis, blocks, CHEST, createEasyBuffers, easyGoal, fit, gap, groundAt, isInside, partyFit, lensShift, NARROWEST, onEdge, PULL_BACK, PULL_BACK_ENTER, pullIn, ringPoints, settle, type Area, type Pt } from './frame'
import { mobileShape } from './machines/Mobile'
import { fireworkBurst, FIREWORK_REACH, Pool, rocketTrail, SHAPES, sparkGlow } from './Effects'
import { ARRIVE, BUNNY_CHEST, easeOut, FIRE, FIRE_COLOURS, LAUNCH_AFTER, PARTY_TILT, partyAnimals, partyPoints, RISE_FOR, rocket, VAN_STOP, vanX } from './parties'

const TILT = (50 * Math.PI) / 180
const YAW = Math.PI
const newSim = () => createSim({ storyDone: 16, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })

/** The game's camera: looking at (cx, cy, cz) from this far, with the lens shifted into the area. */
function cameraFor(width: number, height: number, area: Area, f: { cx: number; cy: number; cz: number; d: number }, tilt: number): PerspectiveCamera {
  const camera = new PerspectiveCamera(FOV, width / height, 0.5, 400)
  const { fwd } = basis(YAW, tilt)
  camera.position.set(f.cx - fwd[0] * f.d, f.cy - fwd[1] * f.d, f.cz - fwd[2] * f.d)
  camera.lookAt(f.cx, f.cy, f.cz)
  const shift = lensShift(width, height, area)
  camera.setViewOffset(width, height, shift.x, shift.y, width, height)
  camera.updateMatrixWorld()
  return camera
}

/** A world point on the screen in pixels. */
function screenOf(camera: PerspectiveCamera, width: number, height: number, p: Pt): { x: number; y: number } {
  const v = new Vector3(...p).project(camera)
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height }
}

/** The free area free.ts builds for each window size: read once from the page's HUD, then its margins (10 px from a HUD edge, none from the window's). */
const SIZES: [number, number, Area][] = [
  [1280, 800, { left: 0, top: 204, right: 932, bottom: 689 }],
  [1024, 768, { left: 0, top: 195, right: 1024, bottom: 527 }],
  [390, 844, { left: 0, top: 211, right: 390, bottom: 586 }],
  [640, 360, { left: 0, top: 122, right: 458, bottom: 294 }],
]

/** The free area free.ts builds during a party, when the speech bubble is away: read from the page's HUD at each window size. */
const PARTY_SCREENS: [number, number, Area][] = [
  [1024, 768, { left: 0, top: 154, right: 913, bottom: 673 }],
  [768, 1024, { left: 0, top: 154, right: 768, bottom: 575 }],
  [1280, 800, { left: 0, top: 160, right: 1164, bottom: 689 }],
  [390, 844, { left: 0, top: 96, right: 390, bottom: 646 }],
]

/** The share of the free area, across and up, whose ground a party keeps clear of machines: its middle. The edges of the picture are where a machine parked at a construction site is natural. */
const PARTY_MIDDLE = 0.7

describe('framing in the free area', () => {
  const tanV = Math.tan((FOV * Math.PI) / 360)

  it.each(SIZES)('every point lands inside the free area at %i x %i, and the middle lands in the middle of it', (width, height, area) => {
    const pts: Pt[] = [[-6, 0, 10], [9, 3, 14], [2, 1, 30], [-8, 0, 22]]
    const { tanH, tanV: tv } = areaTans(tanV, height, area)
    const f = fit(pts, YAW, TILT, tanH, tv, 34, null, null)
    const camera = cameraFor(width, height, area, f, TILT)
    for (const p of pts) {
      const s = screenOf(camera, width, height, p)
      expect(s.x).toBeGreaterThanOrEqual(area.left)
      expect(s.x).toBeLessThanOrEqual(area.right)
      expect(s.y).toBeGreaterThanOrEqual(area.top)
      expect(s.y).toBeLessThanOrEqual(area.bottom)
    }
    const mid = screenOf(camera, width, height, [f.cx, f.cy, f.cz])
    expect(mid.x).toBeCloseTo((area.left + area.right) / 2, 3)
    expect(mid.y).toBeCloseTo((area.top + area.bottom) / 2, 3)
  })

  it('a machine and a target too far apart to frame together keep the truck size and the machine inside the area', () => {
    const [width, height, area] = SIZES[0]
    const { tanH, tanV: tv } = areaTans(tanV, height, area)
    const machine: Pt = [0, 0, 30]
    const target: Pt = [0, 0, -5]
    const f = fit([machine, target], YAW, TILT, tanH, tv, 34, machine, 0.12)
    const camera = cameraFor(width, height, area, f, TILT)
    const m = screenOf(camera, width, height, machine)
    expect(m.y).toBeGreaterThan(area.top)
    expect(m.y).toBeLessThan(area.bottom)
    // The truck keeps its size: a 6 m truck at the machine is about 12% of the area's width or more.
    const a = screenOf(camera, width, height, [-3, 0, 30])
    const b = screenOf(camera, width, height, [3, 0, 30])
    expect(Math.abs(b.x - a.x) / (area.right - area.left)).toBeGreaterThan(0.11)
  })

  it.each(SIZES)('pullIn brings a machine from outside the area to inside it at %i x %i', (width, height, area) => {
    const { tanH, tanV: tv } = areaTans(tanV, height, area)
    const pts: Pt[] = [[0, 0, 0], [4, 0, 4]]
    const f = fit(pts, YAW, TILT, tanH, tv, 34, null, null)
    // A machine well off to one side and far up the screen.
    const away: Pt = [f.cx + 40, 1, f.cz - 40]
    const to = pullIn(f, YAW, TILT, tanH, tv, away)
    const camera = cameraFor(width, height, area, { ...f, cx: to.cx, cz: to.cz }, TILT)
    const s = screenOf(camera, width, height, away)
    expect(s.x).toBeGreaterThanOrEqual(area.left)
    expect(s.x).toBeLessThanOrEqual(area.right)
    expect(s.y).toBeGreaterThanOrEqual(area.top)
    expect(s.y).toBeLessThanOrEqual(area.bottom)
  })

  it('pullIn brings a machine from far behind the camera into the area', () => {
    const [width, height, area] = SIZES[0]
    const { tanH, tanV: tv } = areaTans(tanV, height, area)
    const f = fit([[0, 0, 0], [4, 0, 4]], YAW, TILT, tanH, tv, 34, null, null)
    const behind: Pt = [f.cx - 30, 1, f.cz + 400]
    const to = pullIn(f, YAW, TILT, tanH, tv, behind)
    const s = screenOf(cameraFor(width, height, area, { ...f, cx: to.cx, cz: to.cz }, TILT), width, height, behind)
    expect(s.x).toBeGreaterThanOrEqual(area.left)
    expect(s.x).toBeLessThanOrEqual(area.right)
    expect(s.y).toBeGreaterThanOrEqual(area.top)
    expect(s.y).toBeLessThanOrEqual(area.bottom)
  })

  it.each(SIZES)('settle puts a machine and all four sides of a far ring inside the area, pulling back when they do not fit, at %i x %i', (width, height, area) => {
    const { tanH, tanV: tv } = areaTans(tanV, height, area)
    const machine: Pt = [20, 1.2, -30]
    const must: Pt[] = [machine]
    ringPoints(must, -15, 0, 8, 1.8)
    // A close camera that holds the machine and the ring's middle but cuts the ring's far sides off.
    const start = { cx: 2, cy: 0, cz: -10, d: 18 }
    expect(must.some((p) => !isInside(start, YAW, TILT, tanH, tv, p))).toBe(true)
    const to = settle(start, YAW, TILT, tanH, tv, must, 400)!
    expect(to).not.toBeNull()
    expect(to.d).toBeGreaterThan(start.d)
    const camera = cameraFor(width, height, area, { ...start, cx: to.cx, cz: to.cz, d: to.d }, TILT)
    for (const p of must) {
      const s = screenOf(camera, width, height, p)
      expect(s.x).toBeGreaterThanOrEqual(area.left)
      expect(s.x).toBeLessThanOrEqual(area.right)
      expect(s.y).toBeGreaterThanOrEqual(area.top)
      expect(s.y).toBeLessThanOrEqual(area.bottom)
    }
  })

  it('settle keeps the distance when the points already fit, and says so when they do not fit within the most it may pull back', () => {
    const [, height, area] = SIZES[0]
    const { tanH, tanV: tv } = areaTans(tanV, height, area)
    const start = { cx: 0, cy: 0, cz: 0, d: 60 }
    const to = settle(start, YAW, TILT, tanH, tv, [[1, 0, 1], [-2, 0, 3]], 90)
    expect(to!.d).toBe(60)
    // Two points far apart need more than 1.5 times the distance, and no farther than it is allowed gives null instead of a throw.
    const apart: Pt[] = [[-80, 0, 0], [80, 0, 0]]
    expect(settle(start, YAW, TILT, tanH, tv, apart, 90)).toBeNull()
    expect(settle(start, YAW, TILT, tanH, tv, apart, 60)).toBeNull()
    expect(settle(start, YAW, TILT, tanH, tv, apart, 400)!.d).toBeGreaterThan(90)
    // A point at the camera's own height and behind it has no distance that shows it.
    expect(settle(start, YAW, TILT, tanH, tv, [[0, 0, 0], [0, 0, 100000]], 2400)).toBeNull()
  })

  it('settle throws for a number that is not finite, which no play makes', () => {
    const [, height, area] = SIZES[0]
    const { tanH, tanV: tv } = areaTans(tanV, height, area)
    const start = { cx: 0, cy: 0, cz: 0, d: 60 }
    expect(() => settle(start, YAW, TILT, tanH, tv, [[0, 0, NaN]], 90)).toThrow()
    expect(() => settle({ ...start, d: Infinity }, YAW, TILT, tanH, tv, [[0, 0, 0]], 90)).toThrow()
    expect(() => settle(start, YAW, TILT, tanH, tv, [[0, 0, 0]], NaN)).toThrow()
  })

  it('pullIn leaves a machine that is already inside where it was', () => {
    const [, height, area] = SIZES[0]
    const { tanH, tanV: tv } = areaTans(tanV, height, area)
    const f = fit([[0, 0, 0], [4, 0, 4]], YAW, TILT, tanH, tv, 34, null, null)
    expect(pullIn(f, YAW, TILT, tanH, tv, [1, 1, 1])).toEqual({ cx: f.cx, cz: f.cz })
  })
})

describe('the edge arrow', () => {
  const area: Area = { left: 0, top: 204, right: 932, bottom: 689 }

  it('for a target above the screen sits on the area top, below the bubble', () => {
    const at = onEdge(area, 500, -300, 30)
    expect(at.y).toBeCloseTo(area.top + 30, 6)
    expect(at.x).toBeGreaterThan(area.left)
    expect(at.x).toBeLessThan(area.right)
  })

  it('for a target far below and to the right sits inside the area at its corner side', () => {
    const at = onEdge(area, 5000, 5000, 30)
    expect(at.x).toBeLessThanOrEqual(area.right - 30 + 1e-6)
    expect(at.y).toBeLessThanOrEqual(area.bottom - 30 + 1e-6)
    expect(at.angle).toBeGreaterThan(0)
    expect(at.angle).toBeLessThan(90)
  })

  it('leaves a target inside the area where it is', () => {
    const at = onEdge(area, 300, 400, 30)
    expect(at.x).toBe(300)
    expect(at.y).toBe(400)
  })

  it('throws when the inset leaves no room', () => {
    expect(() => onEdge(area, 0, 0, 400)).toThrow()
  })
})

describe('what stands in the line of sight', () => {
  const eye: Pt = [0, 40, 40]
  const target: Pt = [0, 1, 0]

  it('the least distance between two segments', () => {
    expect(gap([0, 0, 0], [10, 0, 0], [5, 3, -5], [5, 3, 5])).toBeCloseTo(3, 9)
    expect(gap([0, 0, 0], [1, 0, 0], [5, 0, 0], [6, 0, 0])).toBeCloseTo(4, 9)
  })

  it('a thick vertical line across the way blocks it, one off to the side or beyond the target does not', () => {
    // The sight line is at height 20.5 when it is 20 m from the target along z.
    expect(blocks(eye, target, { a: [0, 0, 20], b: [0, 25, 20], r: 2 })).toBe(true)
    expect(blocks(eye, target, { a: [10, 0, 20], b: [10, 25, 20], r: 2 })).toBe(false)
    expect(blocks(eye, target, { a: [0, 0, -20], b: [0, 25, -20], r: 2 })).toBe(false)
    expect(blocks(eye, target, { a: [0, 0, 60], b: [0, 25, 60], r: 2 })).toBe(false)
  })
})

describe('where the parties are watched', () => {
  it('the van is followed in from the left and stops at its place', () => {
    const sim = newSim()
    startParty(sim, 'road')
    const first = sim.party!
    first.t = 0
    const pts: Pt[] = []
    partyPoints(pts, sim)
    const xs = pts.map((p) => p[0])
    expect(Math.min(...xs)).toBeGreaterThan(VAN_STOP - 20)
    first.t = ARRIVE + 0.1
    partyPoints(pts, sim)
    expect(vanX(first.t)).toBe(VAN_STOP)
    expect(pts.some((p) => Math.abs(p[0] - VAN_STOP) <= 3.5)).toBe(true)
  })

  it.each(SIZES)('the clock party shows the hall large with a lower band of the sky over it, from a low tilt, at %i x %i', (width, height, area) => {
    const sim = newSim()
    startParty(sim, 'clock')
    const pts: Pt[] = []
    partyPoints(pts, sim)
    // The sky band reaches the top of the bursts' middles.
    expect(Math.max(...pts.map((p) => p[1]))).toBeGreaterThanOrEqual(FIRE.high)
    expect(Math.max(...pts.map((p) => p[1]))).toBeLessThanOrEqual(FIRE.high + 2)
    const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, area)
    const f = partyFit(pts, PARTY_TILT.clock, tanH, tv)
    const camera = cameraFor(width, height, area, f, PARTY_TILT.clock)
    const edge = (x: number) => screenOf(camera, width, height, [x, 0, BUILDS[3].z]).x
    // The hall's 16 m across takes at least a fifth of the free area's width, which at 1024 x 768 is short and wide.
    expect(edge(BUILDS[3].x + 8) - edge(BUILDS[3].x - 8)).toBeGreaterThan((area.right - area.left) / 5)
    const hall = BUILDS[3]
    expect(pts.some((p) => Math.abs(p[0] - hall.x) < 9 && Math.abs(p[2] - hall.z) < 7)).toBe(true)
    expect(PARTY_TILT.clock).toBeLessThan(PARTY_TILT.road)
  })

  it('the bridge party shows the gathering at the deck close, not the whole deck and both banks', () => {
    const sim = newSim()
    startParty(sim, 'bridge')
    const pts: Pt[] = []
    partyPoints(pts, sim)
    const party = sim.party!
    expect(Math.max(...pts.map((p) => Math.abs(p[0] - party.x)))).toBeLessThanOrEqual(6)
    expect(Math.max(...pts.map((p) => Math.abs(p[2] - party.z)))).toBeLessThanOrEqual(8)
  })

  it('the animals at a show are focus points, and the ones far from it are not', () => {
    const sim = newSim()
    startParty(sim, 'bridge')
    const party = sim.party!
    const near = sim.animals.find((a) => !a.movingIn)!
    near.x = party.x
    near.z = party.z
    near.y = 0
    const far = sim.animals.filter((a) => a !== near)[0]
    far.x = -40
    far.z = 40
    const pts: Pt[] = []
    partyAnimals(pts, sim)
    expect(pts.some((p) => p[0] === near.x && p[2] === near.z)).toBe(true)
    expect(pts.some((p) => p[0] === far.x && p[2] === far.z)).toBe(false)
    sim.party = null
    expect(() => partyAnimals(pts, sim)).toThrow()
  })

  it('every chapter has points, and a party that is not running throws', () => {
    for (const chapter of ['road', 'house', 'bridge', 'play', 'clock'] as const) {
      const sim = newSim()
      startParty(sim, chapter)
      const pts: Pt[] = []
      partyPoints(pts, sim)
      expect(pts.length).toBeGreaterThan(3)
    }
    expect(() => partyPoints([], newSim())).toThrow()
  })
})

/** A pixel of room for the rounding in the projection. */
const PX = 1

/** Whether a world point lands inside the area on the screen. */
function shows(camera: PerspectiveCamera, width: number, height: number, area: Area, p: Pt): boolean {
  const s = screenOf(camera, width, height, p)
  return s.x >= area.left - PX && s.x <= area.right + PX && s.y >= area.top - PX && s.y <= area.bottom + PX
}

/** How wide a 6 m truck at the machine is drawn, in pixels. */
const truckWidth = (camera: PerspectiveCamera, width: number, height: number, m: { x: number; y: number; z: number }) => Math.abs(screenOf(camera, width, height, [m.x + 3, m.y, m.z]).x - screenOf(camera, width, height, [m.x - 3, m.y, m.z]).x)

describe('easy mode frames the machine and the ring over a whole game', () => {
  it('never throws, keeps the machine inside the free area at about its own size, and has the ring in whenever it frames them together, at every size', () => {
    const s = createSim({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })
    const bot = createBot()
    const total = STORY.length + 30
    const tans = SIZES.map(([, height, area]) => areaTans(Math.tan((FOV * Math.PI) / 360), height, area))
    const bufs = SIZES.map(() => createEasyBuffers())
    const solo = createEasyBuffers()
    let next = 1
    let samples = 0
    let together = 0
    let arrow = 0
    let smallest = Infinity
    const bad: string[] = []
    while (s.storyDone + s.moreDone < total) {
      botFrame(bot, s, 1 / 30)
      tick(s, 1 / 30)
      s.events.length = 0
      if (s.job !== null && s.time - s.job.startedAt > 1500) throw new Error(`stuck in ${s.job.job.id} step ${s.job.step}`)
      if (s.time < next) continue
      next += 1
      const step = s.job === null ? null : s.job.job.steps[s.job.step]
      if (s.party !== null || (step !== null && step.kind === 'watch')) continue
      const m = s.machines[s.active]
      const p = stepPointer(s)
      samples++
      SIZES.forEach(([width, height, area], i) => {
        const { tanH, tanV: tv } = tans[i]
        const buf = bufs[i]
        const g = easyGoal(buf, m, p, TILT, tanH, tv)
        const reference = easyGoal(solo, m, null, TILT, tanH, tv)
        const camera = cameraFor(width, height, area, g, TILT)
        const where = `${s.job?.job.id} step ${s.job?.step} at ${width}x${height}, t ${s.time.toFixed(0)}`
        if (!shows(camera, width, height, area, buf.chest)) bad.push(`machine outside: ${where}`)
        if (g.together) {
          together++
          for (const q of buf.must) if (!shows(camera, width, height, area, q)) bad.push(`ring side outside: ${where}`)
          const aloneCamera = cameraFor(width, height, area, reference, TILT)
          smallest = Math.min(smallest, truckWidth(camera, width, height, m) / truckWidth(aloneCamera, width, height, m))
        } else if (p !== null && Math.hypot(p.x - m.x, p.z - m.z) > 0) arrow++
      })
    }
    expect(bad).toEqual([])
    expect(samples).toBeGreaterThan(500)
    // Both happen in a game: rings framed with the machine, and rings left to the edge arrow.
    expect(together).toBeGreaterThan(100)
    expect(arrow).toBeGreaterThan(0)
    // The machine is never drawn smaller than about two thirds of its size framed alone.
    expect(smallest).toBeGreaterThan(0.63)
  }, 600000)

  it('frames the machine alone and leaves a ring that needs more than the pull-back to the edge arrow', () => {
    const [width, height, area] = SIZES[0]
    const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, area)
    const m = newSim().machines.digger
    m.x = 0
    m.z = 0
    m.y = 0
    m.speed = 0
    const buf = createEasyBuffers()
    const solo = createEasyBuffers()
    const ring = (x: number, z: number) => ({ x, y: 0, z, ring: 1.8, machine: 'digger' as const })
    const alone = easyGoal(solo, m, null, TILT, tv * 0 + tanH, tv)
    const near = easyGoal(buf, m, ring(-14, -6) as never, TILT, tanH, tv)
    expect(near.together).toBe(true)
    // 44 m away the ring still counts as near enough to ask, but does not fit within the pull-back.
    const far = easyGoal(buf, m, ring(-5, -44) as never, TILT, tanH, tv)
    expect(far.together).toBe(false)
    expect(far.d).toBe(alone.d)
    expect(buf.must).toEqual([[0, CHEST, 0]])
    const camera = cameraFor(width, height, area, far, TILT)
    expect(shows(camera, width, height, area, buf.chest)).toBe(true)
    expect(near.d).toBeLessThanOrEqual(alone.d * PULL_BACK + 1e-9)
    expect(alone.d).toBeGreaterThanOrEqual(NARROWEST / 2 / tanH - 1e-9)
  })
})

describe('easy mode keeps its choice of framing near the limit', () => {
  it('a machine driven away from the ring and back flips between together and alone once each way, entering below PULL_BACK_ENTER and leaving above PULL_BACK', () => {
    const [, height, area] = SIZES[0]
    const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, area)
    const m = newSim().machines.digger
    m.x = 0
    m.y = 0
    m.speed = 0
    const buf = createEasyBuffers()
    const solo = createEasyBuffers()
    const ring = { x: 0, y: 0, z: 0, ring: 1.8, machine: 'digger' as const }
    const alone = easyGoal(solo, m, null, TILT, tanH, tv)
    const together: boolean[] = []
    const at: number[] = []
    const walk = (from: number, to: number, step: number) => {
      for (let z = from; step > 0 ? z <= to : z >= to; z += step) {
        m.z = z
        const g = easyGoal(buf, m, ring as never, TILT, tanH, tv)
        together.push(g.together)
        at.push(z)
        if (g.together) expect(g.d).toBeLessThanOrEqual(alone.d * PULL_BACK + 1e-9)
      }
    }
    walk(0, 40, 0.05)
    const out = at[together.indexOf(false)]
    walk(40, 0, -0.05)
    const back = at[together.length - 1 - [...together].reverse().indexOf(false)]
    const flips = together.filter((t, i) => i > 0 && t !== together[i - 1]).length
    expect(together[0]).toBe(true)
    expect(flips).toBe(2)
    // Leaving happens further out than entering, with a real gap between them.
    expect(out).toBeGreaterThan(back + 0.5)
    expect(PULL_BACK_ENTER).toBeLessThan(PULL_BACK)
  })

  it('a new ring is framed with the machine only within PULL_BACK_ENTER, whatever the last ring was', () => {
    const [, height, area] = SIZES[0]
    const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, area)
    const m = newSim().machines.digger
    m.x = 0
    m.y = 0
    m.speed = 0
    const ringAt = (x: number) => ({ x, y: 0, z: 0, ring: 1.8, machine: 'digger' as const }) as never
    // The distances between which a ring framed already stays and a new one is not let in.
    const buf = createEasyBuffers()
    let leaveLimit = NaN
    let enterLimit = NaN
    for (let z = 0; z <= 40 && Number.isNaN(leaveLimit); z += 0.05) {
      m.z = z
      if (!easyGoal(buf, m, ringAt(0), TILT, tanH, tv).together) leaveLimit = z
    }
    for (let z = 40; z >= 0 && Number.isNaN(enterLimit); z -= 0.05) {
      m.z = z
      if (easyGoal(buf, m, ringAt(0), TILT, tanH, tv).together) enterLimit = z
    }
    expect(leaveLimit).toBeGreaterThan(enterLimit + 0.5)
    // Just inside the leaving distance: the framed ring stays; a ring of another step, at the same offset from the machine, is not framed.
    const mid = (enterLimit + leaveLimit) / 2
    const carried = createEasyBuffers()
    for (let z = 0; z <= mid; z += 0.05) {
      m.z = z
      easyGoal(carried, m, ringAt(0), TILT, tanH, tv)
    }
    m.z = mid
    expect(easyGoal(carried, m, ringAt(0), TILT, tanH, tv).together).toBe(true)
    m.x = 6
    expect(easyGoal(createEasyBuffers(), m, ringAt(6), TILT, tanH, tv).together).toBe(false)
    expect(easyGoal(carried, m, ringAt(6), TILT, tanH, tv).together).toBe(false)
    // The same ring a hair away is still the same ring.
    m.x = 0.2
    const same = createEasyBuffers()
    for (let z = 0; z <= mid; z += 0.05) {
      m.z = z
      easyGoal(same, m, ringAt(0), TILT, tanH, tv)
    }
    expect(easyGoal(same, m, ringAt(0.2), TILT, tanH, tv).together).toBe(true)
  })
})

describe("the house party's camera follows Bunny to her door", () => {
  it.each(SIZES.filter(([w]) => w === 1280 || w === 390))('shows her chest in the free area every second from the start of the party until she is in, at %i x %i', (width, height, area) => {
    const s = createSim({ storyDone: 9, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })
    const bot = createBot()
    while (s.party === null || s.party.chapter !== 'house') {
      botFrame(bot, s, 1 / 30)
      tick(s, 1 / 30)
      s.events.length = 0
      if (s.time > 3000) throw new Error('the house party never came')
    }
    const bunny = s.animals.find((a) => a.species === 'bunny')!
    expect(bunny.movingIn).toBe(true)
    const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, area)
    const pts: Pt[] = []
    let inFrame = -1
    let inside = -1
    let sampled = 0
    let first = 0
    let last = 0
    for (let t = 0; t <= 14; t++) {
      while (s.party !== null && s.party.t < t) {
        tick(s, 1 / 30)
        s.events.length = 0
      }
      if (s.party === null) break
      partyPoints(pts, s)
      const f = partyFit(pts, PARTY_TILT.house, tanH, tv)
      const camera = cameraFor(width, height, area, f, PARTY_TILT.house)
      const seen = shows(camera, width, height, area, [bunny.x, bunny.y + BUNNY_CHEST, bunny.z])
      if (t === 0) first = f.d
      if (inside < 0) last = f.d
      if (inFrame < 0 && seen) inFrame = t
      if (inside < 0 && !bunny.movingIn) inside = t
      if (inFrame >= 0 && (inside < 0 || t <= inside)) {
        sampled++
        expect(seen, `Bunny at ${bunny.x.toFixed(1)}, ${bunny.z.toFixed(1)} at ${t} s`).toBe(true)
      }
    }
    // She is in the frame from the first second, and the camera comes in as she nears the door. She has been walking since the job ended, for as long as the machines took to drive out of the view (a few of her seven seconds), so the party's first frame is a little closer than the one for a bunny at the road's far end: the camera ends at under three quarters of the distance it began at.
    expect(inFrame).toBe(0)
    expect(last).toBeLessThan(first * 0.75)
    expect(inside).toBeGreaterThan(inFrame)
    expect(inside).toBeLessThanOrEqual(8)
    expect(sampled).toBeGreaterThanOrEqual(3)
    expect(Math.hypot(bunny.x - BUILDS[0].x, bunny.z - (BUILDS[0].z + BUILD_HALF.house[1] + 1.2))).toBeLessThan(2)
  })
})

describe("the clock party's fireworks", () => {
  /** A repeatable stream of numbers from 0 to 1. */
  const seeded = () => {
    let x = 12345
    return () => (x = (x * 16807) % 2147483647) / 2147483647
  }

  it('the rockets burst over the hall inside the sky the camera shows, on the sides in turn, in colours that change every time', () => {
    const rnd = seeded()
    let last = ''
    for (let n = 0; n < 60; n++) {
      const r = rocket(n, rnd)
      expect(Math.abs(r.x - FIRE.x)).toBeLessThanOrEqual(FIRE.spreadX)
      expect(Math.sign(r.x - FIRE.x)).toBe(n % 2 === 0 ? -1 : 1)
      expect(r.y).toBeGreaterThanOrEqual(FIRE.low)
      expect(r.y).toBeLessThanOrEqual(FIRE.high)
      expect(Math.abs(r.z - FIRE.z)).toBeLessThanOrEqual(FIRE.spreadZ / 2)
      expect(r.colour).not.toBe(last)
      expect(FIRE_COLOURS).toContain(r.colour)
      last = r.colour
    }
  })

  it.each(SIZES.filter(([w]) => w === 1280 || w === 390))('every burst, sparks and all, stays inside the free area sideways and under its top, clear of the HUD corners, at %i x %i', (width, height, area) => {
    const sim = newSim()
    startParty(sim, 'clock')
    const pts: Pt[] = []
    partyPoints(pts, sim)
    const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, area)
    const f = partyFit(pts, PARTY_TILT.clock, tanH, tv)
    const camera = cameraFor(width, height, area, f, PARTY_TILT.clock)
    for (const side of [-1, 1]) {
      for (const y of [FIRE.low, FIRE.high]) {
        for (const z of [FIRE.z - FIRE.spreadZ / 2, FIRE.z + FIRE.spreadZ / 2]) {
          const at = [FIRE.x + side * FIRE.spreadX, y, z] as const
          const edges = [
            screenOf(camera, width, height, [at[0] - FIREWORK_REACH, at[1], at[2]]),
            screenOf(camera, width, height, [at[0] + FIREWORK_REACH, at[1], at[2]]),
            screenOf(camera, width, height, [at[0], at[1] + FIREWORK_REACH, at[2]]),
          ]
          expect(edges[0].x, `left of the burst at ${at}`).toBeGreaterThanOrEqual(area.left)
          expect(edges[1].x, `right of the burst at ${at}`).toBeLessThanOrEqual(area.right)
          // The top of the ball may climb above the free area's top, but not up into the corners' height.
          expect(edges[2].y, `top of the burst at ${at}`).toBeGreaterThanOrEqual(area.top * 0.4)
        }
      }
    }
  })

  it('a burst is glowing points of light that fade out: small, additive, spread a few metres, gone within two seconds, and never a large solid shape', () => {
    const pool = new Pool()
    fireworkBurst(pool, 0, 10, 0, '#ff5e5e')
    const sparkIndex = SHAPES.indexOf('spark')
    const born: number[] = []
    for (let i = 0; i < pool.age.length; i++) if (pool.age[i] < pool.life[i]) born.push(i)
    expect(born.length).toBeGreaterThan(40)
    expect(born.length).toBeLessThan(100)
    expect(born.every((i) => pool.shape[i] === sparkIndex)).toBe(true)
    // Past the flash, no spark is wider than half a metre.
    expect(born.filter((i) => pool.life[i] > 0.5).every((i) => pool.size[i] <= 0.5)).toBe(true)
    let reach = 0
    for (let t = 0; t < 2.2; t += 1 / 60) {
      pool.step(1 / 60)
      for (const i of born) if (pool.age[i] < pool.life[i]) reach = Math.max(reach, Math.hypot(pool.px[i], pool.py[i] - 10, pool.pz[i]))
    }
    expect(reach).toBeGreaterThan(FIREWORK_REACH * 0.6)
    // The ball sags a little under its own weight as it fades.
    expect(reach).toBeLessThan(FIREWORK_REACH * 1.4)
    expect(pool.alive()).toBe(0)
  })

  it('the glow starts dark, flashes in, and fades to nothing at the end of life', () => {
    expect(sparkGlow(0, 1)).toBe(0)
    expect(sparkGlow(1, 1)).toBe(0)
    for (let u = 0; u <= 1; u += 0.01) {
      expect(sparkGlow(u, 2)).toBeGreaterThanOrEqual(0)
      expect(sparkGlow(u, 2)).toBeLessThanOrEqual(1)
    }
    expect(sparkGlow(0.9, 0)).toBeLessThan(sparkGlow(0.3, 0))
    expect(sparkGlow(0.97, 0)).toBeLessThan(0.05)
  })

  it('a rocket trail is one small spark', () => {
    const pool = new Pool()
    rocketTrail(pool, 0, 5, 0)
    expect(pool.alive()).toBe(1)
    expect(pool.shape[0]).toBe(SHAPES.indexOf('spark'))
    expect(pool.size[0]).toBeLessThan(0.5)
  })

  it('over the party the sim\'s events and the rockets make a burst every half second, with no gap longer than 0.6 s from the first', () => {
    const sim = newSim()
    startParty(sim, 'clock')
    sim.events.length = 0
    const bursts: number[] = []
    while (sim.party !== null && sim.party.t < 14) {
      tick(sim, 1 / 30)
      for (const e of sim.events) if (e.kind === 'fireworks') for (const after of LAUNCH_AFTER) bursts.push(sim.party!.t + after + RISE_FOR)
      sim.events.length = 0
    }
    expect(bursts.length).toBeGreaterThan(12)
    bursts.sort((a, b) => a - b)
    for (let i = 1; i < bursts.length; i++) expect(bursts[i] - bursts[i - 1], `between burst ${i - 1} and ${i}`).toBeLessThan(0.6)
    expect(bursts[0]).toBeLessThan(4)
  })
})

describe("the playground party's frame", () => {
  it.each(SIZES.filter(([w]) => w === 1280 || w === 390))('holds the three playthings and no more than they and the animals on them need, so the animals are big, at %i x %i', (width, height, area) => {
    const sim = newSim()
    startParty(sim, 'play')
    const pts: Pt[] = []
    partyPoints(pts, sim)
    const spots = BUILDS[2].spots
    const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, area)
    const f = partyFit(pts, PARTY_TILT.play, tanH, tv)
    const camera = cameraFor(width, height, area, f, PARTY_TILT.play)
    const xs = spots.map((s) => screenOf(camera, width, height, [s.x, 0, s.z]).x)
    const across = Math.max(...xs) - Math.min(...xs)
    // Every plaything is in the area.
    for (const s of spots) {
      const at = screenOf(camera, width, height, [s.x, 1.5, s.z])
      expect(at.x).toBeGreaterThanOrEqual(area.left)
      expect(at.x).toBeLessThanOrEqual(area.right)
      expect(at.y).toBeGreaterThanOrEqual(area.top)
      expect(at.y).toBeLessThanOrEqual(area.bottom)
    }
    const metre = across / (Math.max(...spots.map((s) => s.x)) - Math.min(...spots.map((s) => s.x)))
    // A metre of ground across the playthings is this many pixels or more (it was 32 and 16 with the wider box, and an animal is about a metre long).
    expect(metre).toBeGreaterThanOrEqual(width === 1280 ? 40 : 23)
  })
})

describe('the truck crane fades where it hides the party', () => {
  it('stands for its carrier, and with the legs down for the boom to its tip', () => {
    const m = newSim().machines.mobile
    m.x = 14
    m.z = -26
    m.yaw = 0
    m.jib = Math.PI
    m.reach = 6
    m.legs = 0
    expect(mobileShape(m)).toHaveLength(1)
    m.legs = 1
    const [body, boom] = mobileShape(m)
    expect(body.a[2]).toBeGreaterThan(body.b[2])
    // The boom points the way the jib does (south to north), up to the tip's height.
    expect(boom.b[1]).toBeCloseTo(m.y + 11, 6)
    expect(boom.b[2]).toBeLessThan(boom.a[2])
    // A sight line from the south and above to a point behind the boom passes through it.
    expect(blocks([14, 40, 10], [14, 0, -40], boom)).toBe(true)
    expect(blocks([30, 40, 10], [30, 0, -40], boom)).toBe(false)
  })
})

describe('easing', () => {
  it('easeOut runs from 0 to 1, fast at first', () => {
    expect(easeOut(0)).toBe(0)
    expect(easeOut(1)).toBe(1)
    expect(easeOut(0.5)).toBeGreaterThan(0.5)
  })
})


describe('the ground a screen shows', () => {
  it.each(PARTY_SCREENS)('lies where the real camera draws it: a pixel\'s ground point projects back to the pixel, at %i x %i', (width, height, area) => {
    const pts: Pt[] = [[-8, 0, -10], [9, 3, -14], [2, 1, -3], [-8, 0, -6]]
    const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, area)
    for (const tilt of [PARTY_TILT.road, PARTY_TILT.clock]) {
      const f = partyFit(pts, tilt, tanH, tv)
      const camera = cameraFor(width, height, area, f, tilt)
      for (const [px, py] of [[0, 0], [width, 0], [width / 2, height / 2], [0, height], [width, height], [width * 0.3, height * 0.8]]) {
        const [x, z] = groundAt(f, YAW, tilt, height, area, px, py)
        const back = screenOf(camera, width, height, [x, 0, z])
        expect(back.x).toBeCloseTo(px, 3)
        expect(back.y).toBeCloseTo(py, 3)
      }
      // What the camera looks at lands in the middle of the free area.
      const middle = screenOf(camera, width, height, [f.cx, f.cy, f.cz])
      expect(middle.x).toBeCloseTo((area.left + area.right) / 2, 3)
      expect(middle.y).toBeCloseTo((area.top + area.bottom) / 2, 3)
    }
  })

  it('a party fills the free area more than easy mode does, with the same points', () => {
    const pts: Pt[] = [[-8, 0, -10], [9, 3, -14], [2, 1, -3], [-8, 0, -6]]
    const [width, height, area] = PARTY_SCREENS[0]
    const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, area)
    const party = partyFit(pts, TILT, tanH, tv)
    const easy = fit(pts, YAW, TILT, tanH, tv, 12, null, null)
    expect(party.d).toBeLessThan(easy.d * 0.9)
    const camera = cameraFor(width, height, area, party, TILT)
    for (const p of pts) {
      const at = screenOf(camera, width, height, p)
      expect(at.x).toBeGreaterThanOrEqual(area.left - 1)
      expect(at.x).toBeLessThanOrEqual(area.right + 1)
      expect(at.y).toBeGreaterThanOrEqual(area.top - 1)
      expect(at.y).toBeLessThanOrEqual(area.bottom + 1)
    }
  })
})

/** How far out the town goes: nothing stands, and nothing is kept clear, past it. */
const TOWN = 48

/** The ground a camera of `chapter`'s party shows at party time `t` at one screen size: the ray through each of a grid of pixels over the middle PARTY_MIDDLE of the free area (the corners and the edges of that among them), as x and z. */
function groundShown(sim: Sim, chapter: ChapterId, t: number, height: number, free: Area, across: number): [number, number][] {
  const pts: Pt[] = []
  const party = sim.party as NonNullable<Sim['party']>
  const was = party.t
  party.t = t
  partyPoints(pts, sim)
  party.t = was
  const { tanH, tanV: tv } = areaTans(Math.tan((FOV * Math.PI) / 360), height, free)
  const f = partyFit(pts, PARTY_TILT[chapter], tanH, tv)
  const out: [number, number][] = []
  for (let i = 0; i <= across; i++) {
    for (let j = 0; j <= across; j++) {
      const px = free.left + (free.right - free.left) * (0.5 + PARTY_MIDDLE * (i / across - 0.5))
      const py = free.top + (free.bottom - free.top) * (0.5 + PARTY_MIDDLE * (j / across - 0.5))
      const [x, z] = groundAt(f, YAW, PARTY_TILT[chapter], height, free, px, py)
      out.push([clamp(x, -TOWN, TOWN), clamp(z, -TOWN, TOWN)])
    }
  }
  return out
}

describe('the ground each party camera shows', () => {
  it('under the middle of the picture is inside the rectangles the sim keeps clear of machines, at every second of every party, at the iPad\'s two ways round and the two larger screens', () => {
    const s = createSim({ storyDone: 0, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 12, lastTemplate: -1 })
    const bot = createBot()
    for (const chapter of CHAPTER_IDS) {
      // Bunny sets off for her door when the house job ends; the party begins when the machines are out of its view, so she may be anywhere along her walk when it does.
      let setOff: { x: number; z: number } | null = null
      while (s.party === null || s.party.chapter !== chapter) {
        botFrame(bot, s, 1 / 30)
        tick(s, 1 / 30)
        s.events.length = 0
        if (s.time > 3000) throw new Error(`the ${chapter} party never came`)
        const bunny = s.animals.find((a) => a.species === 'bunny')
        if (chapter === 'house' && setOff === null && bunny !== undefined && bunny.movingIn) setOff = { x: bunny.x, z: bunny.z }
      }
      const frames = PARTY_FRAMES[chapter]
      let seen = 0
      const door = { x: BUILDS[0].x, z: BUILDS[0].z + BUILD_HALF.house[1] + 1.2 }
      if (chapter === 'house' && setOff === null) throw new Error('Bunny never set off for her door')
      const from = setOff
      const walks = from === null ? [0] : [0, 0.25, 0.5, 0.75, 1]
      for (const walked of walks) {
        if (from !== null) {
          const bunny = s.animals.find((a) => a.species === 'bunny' && a.home === 0)!
          bunny.x = from.x + (door.x - from.x) * walked
          bunny.z = from.z + (door.z - from.z) * walked
        }
        for (const [width, height, free] of PARTY_SCREENS) {
          for (let t = 0; t <= PARTY_FOR; t += 0.5) {
            for (const [x, z] of groundShown(s, chapter, t, height, free, 12)) {
              seen++
              expect(
                frames.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1),
                `${chapter} at ${width} x ${height}, ${t} s, ${(walked * 100).toFixed(0)} percent of the way from set-off to the door: the screen shows ${x.toFixed(1)}, ${z.toFixed(1)}, which no PARTY_FRAMES rectangle covers`,
              ).toBe(true)
            }
          }
        }
      }
      expect(seen).toBeGreaterThan(1000)
      while (s.party !== null) {
        botFrame(bot, s, 1 / 30)
        tick(s, 1 / 30)
        s.events.length = 0
      }
    }
  }, 600000)
})
