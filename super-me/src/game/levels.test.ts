import { describe, expect, it } from 'vitest'

import { FRICTION, HZ } from '../../../pia-jump/src/game/model'
import { LEVELS } from './levels'
import { parseLevel } from './map'
import type { EventKind, Kind, Level, Sim } from './model'
import { choose, createSim, pressBuild, pressJump, releaseJump, setMove, step } from './sim'

/** Plays a level through the sim the way a careful child would: each move steps the sim until what it waits for happens, and throws, saying where she is, when it does not. */
class Player {
  readonly s: Sim
  readonly seen: EventKind[] = []

  constructor(readonly level: Level) {
    this.s = createSim(level)
  }

  private tick() {
    step(this.s, this.level)
    for (const e of this.s.events) this.seen.push(e.kind)
    this.s.events.length = 0
  }

  /** With WALK=1 in the environment, a line per move: where she is and what she holds. */
  log(move: string) {
    if (!process.env.WALK) return
    const h = this.s.hero
    console.log(`${this.level.id} ${move}: x ${h.x.toFixed(2)} y ${h.y.toFixed(2)} ${this.s.phase} hand ${JSON.stringify(this.s.hand)} pieces ${this.s.pieces.map((q) => `${q.kind}@${q.col},${q.row}`).join(' ')} crates ${[...this.s.taken].join('')} presents ${[...this.s.opened].join('')}`)
  }

  until(what: string, done: () => boolean, seconds = 12) {
    for (let i = 0; i < seconds * HZ; i++) {
      if (done()) return
      this.tick()
    }
    const h = this.s.hero
    throw new Error(`${this.level.id}: ${what} never happened; she is at x ${h.x.toFixed(2)}, y ${h.y.toFixed(2)}, ${h.grounded ? 'standing' : 'in the air'}, phase ${this.s.phase}`)
  }

  private settle() {
    setMove(this.s, 0)
    this.until('standing still', () => this.s.phase === 'play' && this.s.hero.grounded && this.s.hero.vx === 0)
  }

  /** Walks to x, letting go in time for friction to stop her there (or a wall stops her first), and stands. */
  walkTo(x: number) {
    const h = this.s.hero
    const dir = x > h.x ? 1 : -1
    setMove(this.s, dir)
    let blocked = 0
    this.until(`walking to ${x}`, () => {
      blocked = this.s.phase === 'play' && h.grounded && h.vx === 0 ? blocked + 1 : 0
      return (x - h.x) * dir <= (h.vx * h.vx) / (2 * FRICTION) + 0.02 || blocked > 10
    })
    this.settle()
    this.log(`walkTo ${x}`)
  }

  /** A held jump pushing `dir`, to the ground again. */
  hop(dir: -1 | 0 | 1) {
    setMove(this.s, dir)
    pressJump(this.s)
    this.until('taking off', () => !this.s.hero.grounded)
    this.until('landing', () => this.s.phase === 'play' && this.s.hero.grounded)
    releaseJump(this.s)
    this.settle()
    this.log(`hop ${dir}`)
  }

  /** A held jump straight up, the block put down under her feet at its top, and standing on it. */
  jumpBuild(kind: Kind) {
    setMove(this.s, 0)
    pressJump(this.s)
    this.until('taking off', () => !this.s.hero.grounded)
    this.until('the top of the jump', () => this.s.hero.vy >= 0)
    this.build(kind)
    releaseJump(this.s)
    this.settle()
    this.log(`jumpBuild ${kind}`)
  }

  /** The block put down; it must fit. */
  build(kind: Kind) {
    choose(this.s, kind)
    expect(this.s.chosen, `${this.level.id}: no ${kind} in her hands`).toBe(kind)
    const before = this.s.pieces.length
    pressBuild(this.s)
    this.tick()
    expect(this.s.pieces.length, `${this.level.id}: the ${kind} did not fit at x ${this.s.hero.x.toFixed(2)}, y ${this.s.hero.y.toFixed(2)}`).toBe(before + 1)
  }

  /** Up the ladder she stands in, to standing on its top. */
  climb() {
    setMove(this.s, 0)
    this.until('taking hold of the ladder', () => this.s.hero.climbing)
    this.until('standing on the ladder', () => !this.s.hero.climbing && this.s.hero.grounded)
    this.log('climb')
  }

  /** Walks into the trampoline in front of her and pushes `dir` through the throw, to the ground again. */
  bounce(dir: -1 | 1) {
    const bounces = this.seen.filter((k) => k === 'bounce').length
    setMove(this.s, 1)
    this.until('a bounce', () => this.seen.filter((k) => k === 'bounce').length > bounces)
    setMove(this.s, dir)
    this.until('landing after the bounce', () => this.s.phase === 'play' && this.s.hero.grounded)
    this.settle()
    this.log(`bounce ${dir}`)
  }

  /** Walks right into the finish arch and waits out the dance. */
  finish() {
    setMove(this.s, 1)
    this.until('the finish', () => this.s.phase !== 'play')
    this.until('the end of the level', () => this.s.phase === 'done')
  }
}

const WALKTHROUGHS: Record<string, (p: Player) => void> = {
  garden(p) {
    p.walkTo(8.5)
    p.walkTo(11.55)
    p.build('plank')
    p.walkTo(14.55)
    p.build('plank')
    p.walkTo(22.55)
    p.jumpBuild('plank')
    p.hop(1)
    p.walkTo(24.3)
    p.walkTo(29.55)
    p.build('plank')
    p.walkTo(32.55)
    p.build('plank')
    p.walkTo(35.55)
    p.build('plank')
    p.walkTo(43)
    p.jumpBuild('plank')
    p.hop(1)
    p.walkTo(46.5)
    p.walkTo(48.4)
    p.hop(1)
    p.finish()
  },
  kitchen(p) {
    p.walkTo(11.55)
    p.jumpBuild('cube')
    p.hop(1)
    p.walkTo(16.5)
    p.jumpBuild('cube')
    p.hop(0)
    p.walkTo(23.55)
    p.hop(1)
    p.walkTo(33.55)
    p.jumpBuild('cube')
    p.jumpBuild('cube')
    p.hop(1)
    p.walkTo(36.5)
    p.walkTo(43.55)
    p.hop(1)
    p.finish()
  },
  bath(p) {
    p.walkTo(12.55)
    p.build('trampoline')
    p.bounce(1)
    p.walkTo(28.55)
    p.build('trampoline')
    p.bounce(1)
    p.walkTo(42.55)
    p.build('trampoline')
    p.bounce(1)
    p.walkTo(45.5)
    p.walkTo(49.55)
    p.hop(1)
    p.finish()
  },
  toys(p) {
    p.walkTo(11.55)
    p.build('ladder')
    p.climb()
    p.hop(1)
    p.walkTo(25.55)
    p.build('ladder')
    p.climb()
    p.hop(1)
    p.walkTo(35.5)
    p.build('ladder')
    p.climb()
    p.walkTo(39.55)
    p.build('ladder')
    p.climb()
    p.hop(1)
    p.walkTo(44.5)
    p.finish()
  },
  roof(p) {
    p.walkTo(11.55)
    p.build('plank')
    p.walkTo(14.55)
    p.build('plank')
    p.walkTo(25.55)
    p.build('ladder')
    p.climb()
    p.hop(1)
    p.walkTo(36.55)
    p.build('trampoline')
    p.bounce(1)
    p.walkTo(49.55)
    p.jumpBuild('cube')
    p.hop(1)
    p.finish()
  },
}

describe('every level', () => {
  for (const def of LEVELS) {
    it(`${def.id} parses, and a careful player opens all three presents with its crates and finishes without a fall`, () => {
      const p = new Player(parseLevel(def))
      WALKTHROUGHS[def.id]!(p)
      expect([...p.s.opened]).toEqual([1, 1, 1])
      expect(p.s.phase).toBe('done')
      expect(p.seen.filter((k) => k === 'fall' || k === 'nope')).toEqual([])
    })
  }
})
