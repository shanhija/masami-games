import { describe, expect, it } from 'vitest'

import { parseCourse } from './course'
import { COURSE_TEXTS } from './courses'
import { BALLOON_R, BAR_HALF, COURSES, groundAt, HERO_R, SOLID, WALKABLE, type Course, type Hue } from './model'
import { walkCourse } from './bot'
import { gateOn } from './sim'

const COURSES_PARSED = COURSE_TEXTS.map(parseCourse)

/** The map around (c, r), for a failing lint's message. */
function around(course: Course, c: number, r: number): string {
  const text = COURSE_TEXTS.find((t) => t.id === course.id)!.map
  const rows: string[] = []
  for (let y = Math.max(0, r - 3); y <= Math.min(course.rows - 1, r + 3); y++) rows.push(`${String(y).padStart(3)} ${text[y]!.slice(Math.max(0, c - 8), c + 9)}`)
  return rows.join('\n')
}

/**
 * The tiles her feet can reach from the start, opening gates as their buttons come within
 * reach and keeping `keepOff` from the balloon's middle: each round floods what is open,
 * presses every button in it, and goes again until nothing new opens. Returns the reached
 * tiles and the hues opened, in order.
 */
function flood(course: Course, keepOff: number) {
  const opened = new Set<Hue>()
  const order: Hue[] = []
  let reached = new Set<number>()
  for (;;) {
    reached = new Set<number>()
    const queue = [Math.floor(course.start.y) * course.cols + Math.floor(course.start.x)]
    reached.add(queue[0]!)
    while (queue.length > 0) {
      const k = queue.pop()!
      const c = k % course.cols
      const r = Math.floor(k / course.cols)
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nc = c + dc
        const nr = r + dr
        if (!WALKABLE[groundAt(course, nc, nr)]) continue
        if (Math.hypot(nc + 0.5 - course.balloon.x, nr + 0.5 - course.balloon.y) < keepOff) continue
        const g = gateOn(course, nc, nr)
        if (g >= 0 && !opened.has(course.gates[g]!.hue)) continue
        const nk = nr * course.cols + nc
        if (reached.has(nk)) continue
        reached.add(nk)
        queue.push(nk)
      }
    }
    const fresh = course.buttons.filter((b) => !opened.has(b.hue) && reached.has(Math.floor(b.y) * course.cols + Math.floor(b.x)))
    if (fresh.length === 0) break
    for (const b of fresh) {
      if (!opened.has(b.hue)) order.push(b.hue)
      opened.add(b.hue)
    }
  }
  return { reached, order }
}

const tileOf = (course: Course, p: { x: number; y: number }) => Math.floor(p.y) * course.cols + Math.floor(p.x)

describe('the courses', () => {
  it('are the five, in order, and parse', () => {
    expect(COURSES_PARSED.map((c) => c.id)).toEqual([...COURSES])
  })

  for (const course of COURSES_PARSED) {
    describe(course.id, () => {
      it('has every thing on walkable ground', () => {
        const things = [
          ['the start', [course.start]],
          ['the balloon', [course.balloon]],
          ['a flag', course.flags],
          ['a food', course.foods],
          ['a poop', course.poops],
          ['a button', course.buttons],
        ] as const
        const bad: string[] = []
        for (const [what, spots] of things) {
          for (const p of spots) {
            const c = Math.floor(p.x)
            const r = Math.floor(p.y)
            if (!WALKABLE[groundAt(course, c, r)]) bad.push(`${what} at column ${c} row ${r} stands on ${groundAt(course, c, r)}\n${around(course, c, r)}`)
          }
        }
        expect(bad).toEqual([])
      })

      it('reaches every food, button and flag, and the balloon, opening each gate from its own side', () => {
        // Walking into the balloon ends the course, so everything but the balloon must be reachable round it.
        const { reached } = flood(course, BALLOON_R + 0.5)
        const all = flood(course, 0).reached
        const bad: string[] = []
        const check = (what: string, p: { x: number; y: number }) => {
          if (!reached.has(tileOf(course, p))) bad.push(`${what} at column ${Math.floor(p.x)} row ${Math.floor(p.y)} cannot be reached\n${around(course, Math.floor(p.x), Math.floor(p.y))}`)
        }
        course.foods.forEach((p) => check('a food', p))
        course.buttons.forEach((p) => check(`the ${p.hue} button`, p))
        course.flags.forEach((p) => check('a flag', p))
        if (!all.has(tileOf(course, course.balloon))) bad.push('the balloon cannot be reached')
        expect(bad).toEqual([])
      })

      it('has room round the balloon, and the start is far from it', () => {
        const bad: string[] = []
        const bc = Math.floor(course.balloon.x)
        const br = Math.floor(course.balloon.y)
        for (let r = br - 1; r <= br + 1; r++) for (let c = bc - 1; c <= bc + 1; c++) if (!WALKABLE[groundAt(course, c, r)]) bad.push(`column ${c} row ${r} by the balloon is ${groundAt(course, c, r)}\n${around(course, c, r)}`)
        expect(bad).toEqual([])
        expect(Math.hypot(course.start.x - course.balloon.x, course.start.y - course.balloon.y)).toBeGreaterThan(BALLOON_R + 8)
      })

      it('has open ground on both sides of every gate tile', () => {
        const bad: string[] = []
        for (const g of course.gates) {
          for (const t of g.tiles) {
            const sides = g.along === 'row' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]
            for (const [dc, dr] of sides) {
              const c = t.c + dc!
              const r = t.r + dr!
              if (!WALKABLE[groundAt(course, c, r)] || gateOn(course, c, r) >= 0) bad.push(`the ${g.hue} gate at column ${t.c} row ${t.r} has ${groundAt(course, c, r)} at column ${c} row ${r}\n${around(course, t.c, t.r)}`)
            }
          }
        }
        expect(bad).toEqual([])
      })

      it('keeps every pole clear of walls, the start, flags, buttons and the balloon', () => {
        const bad: string[] = []
        const keep = [course.start, course.balloon, ...course.flags, ...course.buttons]
        const margin = HERO_R + BAR_HALF + 0.1
        for (const sp of course.spinners) {
          const reach = sp.reach + margin
          for (const p of keep) if (Math.hypot(p.x - sp.x, p.y - sp.y) < reach) bad.push(`the spinner at ${sp.x - 0.5},${sp.y - 0.5} sweeps a thing at ${p.x - 0.5},${p.y - 0.5}`)
          for (let r = Math.floor(sp.y - sp.reach); r <= Math.floor(sp.y + sp.reach); r++) {
            for (let c = Math.floor(sp.x - sp.reach); c <= Math.floor(sp.x + sp.reach); c++) {
              // The nearest point of the tile to the post.
              const nx = Math.max(c, Math.min(c + 1, sp.x))
              const ny = Math.max(r, Math.min(r + 1, sp.y))
              if (Math.hypot(nx - sp.x, ny - sp.y) < sp.reach && (SOLID[groundAt(course, c, r)] || gateOn(course, c, r) >= 0)) bad.push(`the spinner at ${sp.x - 0.5},${sp.y - 0.5} sweeps through ${groundAt(course, c, r)} at ${c},${r}\n${around(course, c, r)}`)
            }
          }
        }
        for (const sl of course.sliders) {
          for (const [x, y] of [[sl.ax, sl.ay], [sl.bx, sl.by]] as const) {
            if (!WALKABLE[groundAt(course, Math.floor(x), Math.floor(y))]) bad.push(`a slider's groove ends on ${groundAt(course, Math.floor(x), Math.floor(y))} at ${x},${y}`)
          }
          for (const p of keep) {
            const reach = Math.max(sl.half, Math.hypot(sl.bx - sl.ax, sl.by - sl.ay) / 2 + sl.half) + margin
            if (Math.hypot(p.x - (sl.ax + sl.bx) / 2, p.y - (sl.ay + sl.by) / 2) < reach) bad.push(`a slider near ${(sl.ax + sl.bx) / 2},${(sl.ay + sl.by) / 2} sweeps a thing at ${p.x - 0.5},${p.y - 0.5}`)
          }
        }
        expect(bad).toEqual([])
      })

      it('walks its puppies along open ground', () => {
        const bad: string[] = []
        for (const p of course.puppies) {
          for (let i = 1; i < p.path.length; i++) {
            const a = p.path[i - 1]!
            const b = p.path[i]!
            const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 4)
            for (let k = 0; k <= n; k++) {
              const x = a.x + ((b.x - a.x) * k) / n
              const y = a.y + ((b.y - a.y) * k) / n
              const c = Math.floor(x)
              const r = Math.floor(y)
              if (!WALKABLE[groundAt(course, c, r)] || gateOn(course, c, r) >= 0) {
                bad.push(`a puppy's path crosses ${groundAt(course, c, r)} at ${c},${r}\n${around(course, c, r)}`)
                break
              }
            }
          }
        }
        expect(bad).toEqual([])
      })
    })
  }
})

describe('a careful child', () => {
  for (const course of COURSES_PARSED) {
    it(`walks ${course.id} picking up every food, with no knock, no splash and no zap`, () => {
      const walk = walkCourse(course, 'burger', ['patty', 'cheese', 'tomato'])
      const where = `stopped at ${walk.x.toFixed(1)},${walk.y.toFixed(1)} after ${(walk.ticks / 120).toFixed(1)} s with foods left at ${walk.left.join(' ')}\n${around(course, Math.floor(walk.x), Math.floor(walk.y))}`
      expect({ done: walk.done, pile: walk.pile, poops: walk.poops, bonks: walk.bonks, splashes: walk.splashes, zaps: walk.zaps }, where).toEqual({
        done: true,
        pile: course.foods.length,
        poops: 0,
        bonks: 0,
        splashes: 0,
        zaps: 0,
      })
      // A course is a minute or two for her; the bot is quicker than a child.
      expect(walk.ticks / 120).toBeLessThan(150)
    })
  }
})
