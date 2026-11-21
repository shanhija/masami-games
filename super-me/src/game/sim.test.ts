import { describe, expect, it } from 'vitest'

import { HZ, ticks } from '../../../pia-jump/src/game/model'
import { parseLevel } from './map'
import { PRESENT_FOR, type EventKind, type Sim } from './model'
import { buildSpot, createSim, pressBuild, setMove, step } from './sim'

/** A test level: a gap at columns 10 to 14, a two-high wall at column 18, a ceiling over columns 20 to 22, a trampoline crate, three presents in a row and the arch up out of reach. */
const LEVEL = parseLevel({
  id: 'garden',
  rewards: ['hat:crown', 'hat:chef', 'hat:wizard'],
  map: [
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '..............................',
    '.............................!',
    '..............................',
    '....................###.......',
    '..............................',
    '..............................',
    '..................#...........',
    '..@...............#.......tggg',
    '##########.....###############',
    '##########.....###############',
    '##########.....###############',
  ],
})

function standAt(s: Sim, x: number, y: number) {
  Object.assign(s.hero, { x, y, px: x, py: y, vx: 0, vy: 0, grounded: true, facing: 1 })
}

/** Steps until an event of `kind`, at most `seconds`; returns whether it came. */
function stepUntil(s: Sim, kind: EventKind, seconds: number): boolean {
  for (let i = 0; i < seconds * HZ; i++) {
    step(s, LEVEL)
    const hit = s.events.some((e) => e.kind === kind)
    s.events.length = 0
    if (hit) return true
  }
  return false
}

describe('building', () => {
  it('on the ground a plank is a bridge from the edge, past the floor still under her front', () => {
    const s = createSim(LEVEL)
    standAt(s, 8.5, 12)
    expect(buildSpot(s, LEVEL, 'plank')).toEqual({ col: 10, row: 12, size: 3 })
  })

  it('in the air a cube goes right under her feet, and she lands on it', () => {
    const s = createSim(LEVEL)
    standAt(s, 5.5, 8.6)
    s.hero.grounded = false
    s.hand.cube = 1
    s.chosen = 'cube'
    pressBuild(s)
    step(s, LEVEL)
    expect(s.pieces.map((p) => [p.kind, p.col, p.row])).toEqual([['cube', 5, 9]])
    for (let i = 0; i < HZ && !s.hero.grounded; i++) step(s, LEVEL)
    expect(s.hero.y).toBe(9)
  })

  it('a trampoline goes in front of her, and walking into it throws her about seven tiles up', () => {
    const s = createSim(LEVEL)
    standAt(s, 16.5, 12)
    s.hand.trampoline = 1
    s.chosen = 'trampoline'
    pressBuild(s)
    step(s, LEVEL)
    expect(s.pieces.map((p) => [p.kind, p.col, p.row])).toEqual([['trampoline', 17, 11]])
    setMove(s, 1)
    expect(stepUntil(s, 'bounce', 1)).toBe(true)
    setMove(s, 0)
    let top = s.hero.y
    for (let i = 0; i < 2 * HZ; i++) {
      step(s, LEVEL)
      top = Math.min(top, s.hero.y)
    }
    expect(12 - top).toBeGreaterThan(7)
    expect(12 - top).toBeLessThan(7.6)
  })

  it('a ladder stands in her own column, stops under a ceiling, and she climbs it to stand on its top', () => {
    const s = createSim(LEVEL)
    standAt(s, 21.5, 12)
    s.hand.ladder = 1
    s.chosen = 'ladder'
    expect(buildSpot(s, LEVEL, 'ladder')).toEqual({ col: 21, row: 10, size: 2 })
    pressBuild(s)
    expect(stepUntil(s, 'climb', 0.1)).toBe(true)
    for (let i = 0; i < 2 * HZ && (s.hero.climbing || !s.hero.grounded); i++) step(s, LEVEL)
    expect(s.hero.y).toBe(10)
    expect(s.hero.grounded).toBe(true)
  })

  it('with nothing in her hands, or no room in front of her, the build button is a nope and changes nothing', () => {
    const s = createSim(LEVEL)
    standAt(s, 5.5, 12)
    pressBuild(s)
    expect(stepUntil(s, 'nope', 0.02)).toBe(true)
    standAt(s, 17.6, 12)
    s.hand.cube = 1
    s.chosen = 'cube'
    expect(buildSpot(s, LEVEL, 'cube')).toBeNull()
    pressBuild(s)
    expect(stepUntil(s, 'nope', 0.02)).toBe(true)
    expect(s.pieces).toEqual([])
    expect(s.hand.cube).toBe(1)
  })
})

describe('crates and presents', () => {
  it('when her hands are empty and no crate is left, every crate comes back', () => {
    const s = createSim(LEVEL)
    standAt(s, 25.3, 12)
    setMove(s, 1)
    expect(stepUntil(s, 'crate', 0.5)).toBe(true)
    setMove(s, 0)
    expect(s.hand.trampoline).toBe(1)
    standAt(s, 16.5, 12)
    pressBuild(s)
    expect(stepUntil(s, 'refill', 0.02)).toBe(true)
    expect([...s.taken]).toEqual([0])
  })

  it('a present holds everything still while it opens, then play goes on', () => {
    const s = createSim(LEVEL)
    standAt(s, 26.0, 12)
    s.taken[0] = 1
    s.hand.cube = 1
    setMove(s, 1)
    expect(stepUntil(s, 'present', 0.5)).toBe(true)
    const x = s.hero.x
    for (let i = 0; i < ticks(PRESENT_FOR) - 1; i++) step(s, LEVEL)
    expect(s.phase).toBe('present')
    expect(s.hero.x).toBe(x)
    step(s, LEVEL)
    step(s, LEVEL)
    expect(s.phase).toBe('play')
    expect(s.hero.x).toBeGreaterThan(x)
  })
})
