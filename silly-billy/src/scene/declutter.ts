/**
 * Keeps the name tags, and the bubbles and clouds over them, from hiding each other. Each block
 * wants its place over its owner's head. The nearest owner's block keeps it; each next one, if it
 * would cover a block already placed, moves the least it can (up, or to the left or right) to
 * a free spot near its owner, so two people standing close show both their names, each still
 * over its owner. A block keeps last frame's spot while that is still free and not much farther
 * than the best one now, so it does not hop from side to side as the others slide. No block
 * leaves the screen while its owner is on it. In a crowd too thick for a free spot near its
 * owner, a block goes up over the one in its way as far as it may, and the nearer one covers
 * the rest of it.
 */

/** One block on the screen, in pixels: the middle of its bottom edge where it wants to be, and its size. */
export interface TagBox {
  x: number
  y: number
  w: number
  h: number
  /** How far it was moved last frame, if it was shown then. */
  was?: readonly [number, number]
}

/** Pixels kept between two blocks. */
const GAP = 2
/** A move to the side costs this much more than one up: up keeps a tag over its owner. */
const SIDEWAYS = 1.4
/** How many moves deep a block looks for a free spot. */
const DEPTH = 4
/** Last frame's spot is kept while it costs at most this many times the best free spot now, and SLACK more. */
const STAY = 2
const SLACK = 16
/** How far a block may go from its owner, as a cost: twice its own height, and at least MIN_REACH. */
const MIN_REACH = 100

interface Rect {
  l: number
  r: number
  t: number
  b: number
}

const rectOf = (box: TagBox, dx: number, dy: number): Rect => ({ l: box.x - box.w / 2 + dx, r: box.x + box.w / 2 + dx, t: box.y - box.h + dy, b: box.y + dy })
const covers = (a: Rect, p: Rect) => a.l < p.r + GAP && a.r > p.l - GAP && a.t < p.b + GAP && a.b > p.t - GAP
const overlap = (a: Rect, p: Rect) => Math.max(0, Math.min(a.r, p.r) - Math.max(a.l, p.l)) * Math.max(0, Math.min(a.b, p.b) - Math.max(a.t, p.t))

type Move = [number, number]

/** How far to move each block (dx, dy), in the order given: put the nearest first. `width`: the screen's. */
export function declutter(boxes: readonly TagBox[], width = Infinity): Move[] {
  const placed: Rect[] = []
  return boxes.map((box) => {
    // An owner on the screen keeps its block on it: pushed in from the edge it would cross.
    const lo = box.w / 2 - box.x
    const hi = width - box.w / 2 - box.x
    const bound = box.x >= 0 && box.x <= width && lo <= hi
    const fit = (dx: number, dy: number): Move => [bound ? Math.min(hi, Math.max(lo, dx)) : dx, dy]
    const home = fit(0, 0)
    const away = (at: Move, from: Move) => Math.abs(at[0] - from[0]) * SIDEWAYS + Math.abs(at[1] - from[1])
    const cost = (at: Move) => away(at, home)
    const reach = Math.max(MIN_REACH, 2 * box.h)
    const hitAt = (at: Move) => placed.find((p) => covers(rectOf(box, at[0], at[1]), p))
    /** The free spot within reach that `score` likes best, looking from `start`: from a spot that covers a block, just above it and just beside it. */
    const search = (start: Move, score: (at: Move) => number): Move | null => {
      let best: Move | null = null
      let tries = [start]
      const seen = new Set<string>()
      for (let depth = 0; depth < DEPTH && tries.length > 0; depth++) {
        const next: Move[] = []
        for (const at of tries) {
          const key = `${at[0]},${at[1]}`
          if (seen.has(key) || cost(at) > reach || (best !== null && score(at) >= score(best))) continue
          seen.add(key)
          const hit = hitAt(at)
          if (hit === undefined) best = at
          else next.push(fit(at[0], hit.t - GAP - box.y), fit(hit.l - GAP - (box.x + box.w / 2), at[1]), fit(hit.r + GAP - (box.x - box.w / 2), at[1]))
        }
        tries = next
      }
      return best
    }
    let at = search(home, cost)
    // Last frame's spot, or the free one nearest it, while it is not much farther than the best: no hopping from side to side.
    const was = box.was === undefined ? null : fit(box.was[0], box.was[1])
    const near = was !== null && cost(was) <= reach
    if (near) {
      const stay = search(was, (p) => away(p, was))
      if (stay !== null && (at === null || cost(stay) <= cost(at) * STAY + SLACK)) at = stay
    }
    if (at === null) {
      // Too crowded for a free spot near its owner: up over the block in its way, as far as it may (or last frame's spot, if that is covered less), and the nearer one covers the rest.
      const covered = (p: Move) => placed.reduce((sum, q) => sum + overlap(rectOf(box, p[0], p[1]), q), 0)
      const stack = fit(home[0], Math.max(-reach, hitAt(home)!.t - GAP - box.y))
      at = near && covered(was) <= covered(stack) ? was : stack
    }
    placed.push(rectOf(box, at[0], at[1]))
    return at
  })
}
