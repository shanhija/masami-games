/**
 * Runs every draw function over every form, pose, state, room and facing on a fake 2D
 * context, so art written without looking cannot crash, draw NaN, leave the context
 * changed or reach for an API that does not work everywhere. It does not judge looks;
 * the sprite sheet (?sheet=hero, ?sheet=world) and screenshots do that.
 */
import { describe, expect, it } from 'vitest'

import { ROOMS } from '../game/levels'
import { STEP, type EnemyState, type Form, type KittenName, type Phase, type Room, type Sim } from '../game/model'
import { parseRoom } from '../game/room'
import { createSim, heroBox } from '../game/sim'
import { drawEnemy, drawKitten, type KittenPose } from './critters'
import { drawHero } from './hero'
import { COLOR, bubbleBall, pen, type Rim, type View } from './look'
import { HERO_SHEET } from './sheetHero'
import { WORLD_SHEET } from './sheetWorld'
import { drawBed, drawBlock, drawBubble, drawItem, drawLift, drawPicnic, drawPole, drawSpring, drawStar } from './things'
import { drawBackdrop, drawPits, drawTerrain } from './world'

type Matrix = [number, number, number, number, number, number]
const multiply = (m: Matrix, a: number, b: number, c: number, d: number, e: number, f: number): Matrix => [
  m[0] * a + m[2] * b,
  m[1] * a + m[3] * b,
  m[0] * c + m[2] * d,
  m[1] * c + m[3] * d,
  m[0] * e + m[2] * f + m[4],
  m[1] * e + m[3] * f + m[5],
]

/** Methods whose every argument must be a finite number, and which of their arguments are radii (a negative radius throws in a browser). */
const GEOMETRY: Record<string, number[]> = {
  moveTo: [],
  lineTo: [],
  arc: [2],
  arcTo: [4],
  ellipse: [2, 3],
  quadraticCurveTo: [],
  bezierCurveTo: [],
  rect: [],
  fillRect: [],
  strokeRect: [],
  clearRect: [],
}

/** A 2D context that draws nothing and checks everything; `counts` says what was called. */
function fakeContext() {
  const state = { m: [1, 0, 0, 1, 0, 0] as Matrix, alpha: 1, stack: [] as { m: Matrix; alpha: number }[], counts: {} as Record<string, number> }
  const count = (name: string) => (state.counts[name] = (state.counts[name] ?? 0) + 1)
  const finite = (name: string, args: unknown[]) => {
    args.forEach((a, i) => {
      if (typeof a === 'number' && !Number.isFinite(a)) throw new Error(`${name} argument ${i} is ${a}`)
    })
  }
  const methods: Record<string, (...args: never[]) => unknown> = {
    save: () => state.stack.push({ m: [...state.m], alpha: state.alpha }),
    restore: () => {
      const top = state.stack.pop()
      if (!top) throw new Error('restore without a save')
      state.m = top.m
      state.alpha = top.alpha
    },
    translate: (x: number, y: number) => (state.m = multiply(state.m, 1, 0, 0, 1, x, y)),
    scale: (x: number, y: number) => (state.m = multiply(state.m, x, 0, 0, y, 0, 0)),
    rotate: (a: number) => (state.m = multiply(state.m, Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0)),
    transform: (a: number, b: number, c: number, d: number, e: number, f: number) => (state.m = multiply(state.m, a, b, c, d, e, f)),
    setTransform: (a: number, b: number, c: number, d: number, e: number, f: number) => (state.m = [a, b, c, d, e, f]),
    resetTransform: () => (state.m = [1, 0, 0, 1, 0, 0]),
    getTransform: () => ({ a: state.m[0], b: state.m[1], c: state.m[2], d: state.m[3], e: state.m[4], f: state.m[5] }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({ setTransform: () => {} }),
    measureText: () => ({ width: 1, actualBoundingBoxAscent: 1, actualBoundingBoxDescent: 0 }),
    getLineDash: () => [],
    isPointInPath: () => false,
    roundRect: () => {
      throw new Error('ctx.roundRect: use roundRectPath from look.ts')
    },
    createConicGradient: () => {
      throw new Error('ctx.createConicGradient does not work everywhere')
    },
    reset: () => {
      throw new Error('ctx.reset does not work everywhere')
    },
  }
  const banned = new Set(['filter', 'shadowBlur', 'letterSpacing', 'wordSpacing'])
  const props: Record<string, unknown> = { fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif', lineJoin: 'miter', lineCap: 'butt', textAlign: 'start', textBaseline: 'alphabetic', globalCompositeOperation: 'source-over', lineDashOffset: 0, miterLimit: 10, imageSmoothingEnabled: true, canvas: { width: 1600, height: 1000 } }
  const ctx = new Proxy(props, {
    get(target, key: string) {
      if (key === 'globalAlpha') return state.alpha
      if (key in methods) {
        return (...args: never[]) => {
          count(key)
          finite(key, args)
          return methods[key]!(...args)
        }
      }
      if (key in target) return target[key]
      return (...args: unknown[]) => {
        count(key)
        finite(key, args)
        for (const r of GEOMETRY[key] ?? []) if ((args[r] as number) < 0) throw new Error(`${key} with a negative radius ${String(args[r])}`)
      }
    },
    set(target, key: string, value) {
      if (banned.has(key)) throw new Error(`ctx.${key} does not work everywhere`)
      if (key === 'globalAlpha') {
        if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`globalAlpha ${value}`)
        state.alpha = value
        return true
      }
      if (key === 'lineWidth' && !(Number.isFinite(value) && value > 0)) throw new Error(`lineWidth ${value}`)
      target[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  /** Runs one draw and checks it left the context as it found it. */
  const check = (what: string, draw: () => void, text: 'none' | 'allowed') => {
    const before = { m: [...state.m], alpha: state.alpha, depth: state.stack.length, text: (state.counts.fillText ?? 0) + (state.counts.strokeText ?? 0), gradients: (state.counts.createLinearGradient ?? 0) + (state.counts.createRadialGradient ?? 0) + (state.counts.createPattern ?? 0) }
    try {
      draw()
    } catch (e) {
      throw new Error(`${what}: ${(e as Error).message}`)
    }
    expect(state.stack.length, `${what}: save and restore balance`).toBe(before.depth)
    expect(state.m, `${what}: the transform comes back`).toEqual(before.m)
    expect(state.alpha, `${what}: globalAlpha comes back`).toBe(before.alpha)
    if (text === 'none') {
      expect((state.counts.fillText ?? 0) + (state.counts.strokeText ?? 0), `${what}: no text`).toBe(before.text)
      expect((state.counts.createLinearGradient ?? 0) + (state.counts.createRadialGradient ?? 0) + (state.counts.createPattern ?? 0), `${what}: no gradient or pattern per call`).toBe(before.gradients)
    }
  }
  return { ctx, check, counts: state.counts }
}

const ROOM_LIST: Room[] = ROOMS.map(parseRoom)
const TIMES = [0, 0.37, 1.9, 1000]
const RIMS: Rim[] = [null, { colour: COLOR.nightRim, width: 0.05 }]
const FORMS: Form[] = ['small', 'big', 'bubble']
const PHASES: Phase[] = ['play', 'freeze', 'rescue', 'pole', 'walk', 'found', 'done']
const ENEMY_STATES: EnemyState[] = ['asleep', 'yawn', 'walk', 'shell', 'slide', 'poof', 'knocked', 'trapped', 'dizzy', 'bunny', 'gone']
const KITTENS: KittenName[] = ['Sunny', 'Coco', 'Mochi', 'Lulu', 'Pepper']
const POSES: KittenPose[] = ['hidden', 'sit', 'hop', 'hug', 'dance']

/** A sim five seconds into a visit, so stamps can be fresh (a few ticks ago) or stale. */
function simAt(room: Room): Sim {
  const s = createSim(room)
  s.tick = 600
  return s
}

/** Pia in the situations her poses come from, as patches over a fresh hero. */
const HERO_CASES: { name: string; patch: (s: Sim) => void }[] = [
  { name: 'idle', patch: () => {} },
  { name: 'walk', patch: (s) => ((s.hero.vx = 4), (s.hero.stride = 3.3), (s.input.move = 1)) },
  { name: 'run', patch: (s) => ((s.hero.vx = 7.5), (s.hero.stride = 17.1), (s.input.move = 1)) },
  { name: 'skid', patch: (s) => ((s.hero.vx = 6), (s.hero.skidding = true), (s.input.move = -1)) },
  { name: 'rise', patch: (s) => ((s.hero.grounded = false), (s.hero.vy = -12), (s.hero.jumpedAt = s.tick - 3), (s.hero.launch = 'jump')) },
  { name: 'apex', patch: (s) => ((s.hero.grounded = false), (s.hero.vy = 0.5)) },
  { name: 'fall', patch: (s) => ((s.hero.grounded = false), (s.hero.vy = 12)) },
  { name: 'land', patch: (s) => (s.hero.landedAt = s.tick - 4) },
  { name: 'bonk', patch: (s) => ((s.hero.grounded = false), (s.hero.bonkedAt = s.tick - 2)) },
  { name: 'hurt', patch: (s) => ((s.hero.hurtAt = s.tick - 5), (s.hero.safeUntil = s.tick + 200)) },
  { name: 'dizzy', patch: (s) => ((s.hero.hurtAt = s.tick - 5), (s.hero.dizzyUntil = s.tick + 40), (s.hero.safeUntil = s.tick + 200)) },
  { name: 'grow', patch: (s) => ((s.hero.changedAt = s.tick - 20), (s.hero.was = 'small')) },
  { name: 'wand', patch: (s) => ((s.hero.changedAt = s.tick - 20), (s.hero.was = 'big')) },
  { name: 'shrink', patch: (s) => ((s.hero.changedAt = s.tick - 20), (s.hero.was = s.hero.form === 'small' ? 'big' : 'bubble')) },
  { name: 'ball', patch: (s) => (s.hero.ballUntil = s.tick + 600) },
  { name: 'ball ending', patch: (s) => (s.hero.ballUntil = s.tick + 100) },
  { name: 'blow', patch: (s) => (s.hero.blewAt = s.tick - 6) },
]

// Every case of every draw function through the checking proxy: seconds of work, so more than vitest's 5 s default when the machine is busy.
describe('every draw function on a fake context', { timeout: 30_000 }, () => {
  it('Pia in every form, situation and phase, both facings, with and without a rim', () => {
    const { ctx, check } = fakeContext()
    for (const room of ROOM_LIST) {
      for (const form of FORMS) {
        for (const c of HERO_CASES) {
          for (const phase of PHASES) {
            for (const rim of RIMS) {
              for (const t of TIMES) {
                const s = simAt(room)
                s.hero.form = form
                ;[s.hero.w, s.hero.h] = heroBox(form)
                s.phase = phase
                s.phaseAt = s.tick - 30
                c.patch(s)
                pen.px = 64
                check(`${room.id} ${form} ${c.name} ${phase} t=${t}`, () => drawHero(ctx, s, s.tick * STEP + t, rim), 'none')
              }
            }
          }
        }
      }
    }
  })

  it('every enemy in every state, and every kitten in every pose', () => {
    const { ctx, check } = fakeContext()
    const room = ROOM_LIST[ROOM_LIST.length - 1]!
    const s = simAt(room)
    const kinds = ['grumble', 'snail', 'bee', 'boss'] as const
    for (const kind of kinds) {
      for (const state of ENEMY_STATES) {
        for (const hp of kind === 'boss' ? [3, 2, 1, 0] : [1]) {
          for (const rim of RIMS) {
            for (const t of TIMES) {
              const e = { ...s.enemies[0]!, kind, state, hp, stateAt: s.tick - 20, vx: state === 'slide' ? 8 : 1.4, vy: state === 'knocked' ? 5 : 0 }
              check(`${kind} ${state} hp ${hp} t=${t}`, () => drawEnemy(ctx, e, s.tick * STEP + t, rim), 'none')
            }
          }
        }
      }
    }
    for (const name of KITTENS) for (const pose of POSES) for (const rim of RIMS) for (const t of TIMES) check(`${name} ${pose}`, () => drawKitten(ctx, name, pose, t, rim), 'none')
  })

  it('every thing in every room', () => {
    const { ctx, check } = fakeContext()
    for (const room of ROOM_LIST) {
      for (const t0 of TIMES) {
        const s = simAt(room)
        const t = s.tick * STEP + t0
        room.blocks.forEach((def, i) => {
          for (const state of ['full', 'empty', 'broken', 'open'] as const) {
            for (const bumpedAt of [-1, s.tick - 5]) {
              s.blocks[i] = { state, hits: 3, bumpedAt }
              s.gateAt = state === 'open' ? s.tick - 30 : -1
              check(`${room.id} block ${def.kind} ${def.gift} ${state}`, () => drawBlock(ctx, room, i, s, t), 'none')
            }
          }
        })
        for (const kind of ['cupcake', 'wand', 'ball'] as const) {
          for (const bornAt of [s.tick - 10, s.tick - 500]) {
            const it = { x: 5, y: 12, px: 5, py: 12, vx: 2, vy: 0, w: 0.7, h: 0.7, kind, facing: 1 as const, grounded: true, bornAt, alive: true }
            check(`${room.id} item ${kind}`, () => drawItem(ctx, it, room, t), 'none')
          }
        }
        check(`${room.id} star`, () => drawStar(ctx, t, 0.4), 'none')
        check(`${room.id} bubble`, () => drawBubble(ctx, { x: 5, y: 12, px: 5, py: 12, vx: 6, vy: -3, w: 0.9, h: 0.9, bornAt: s.tick - 30, alive: true }, t), 'none')
        check(`${room.id} bubble ball`, () => bubbleBall(ctx, 0.75, t), 'none')
        for (const def of room.lifts) check(`${room.id} lift ${def.kind}`, () => drawLift(ctx, room, def, t), 'none')
        for (const usedAt of [-1, s.tick - 10]) check(`${room.id} spring`, () => drawSpring(ctx, room, usedAt, t), 'none')
        for (let bonus = 0; bonus <= 5; bonus++) {
          s.poleBonus = bonus
          check(`${room.id} pole ${bonus}`, () => drawPole(ctx, room, s, t), 'none')
        }
        for (const open of [0, 0.5, 1]) check(`${room.id} bed ${open}`, () => drawBed(ctx, room, open, t), 'none')
        check(`${room.id} picnic`, () => drawPicnic(ctx, t), 'none')
      }
    }
  })

  it('terrain, backdrops and pits in every room', () => {
    const { ctx, check } = fakeContext()
    for (const room of ROOM_LIST) {
      for (const tile of [40, 64, 137]) {
        pen.px = tile
        const v: View = { width: 1600, height: 1000, tile, left: 10.25, top: 20 }
        for (const t of TIMES) {
          check(`${room.id} terrain at ${tile}`, () => drawTerrain(ctx, room, 0, room.cols), 'allowed')
          check(`${room.id} terrain chunk at ${tile}`, () => drawTerrain(ctx, room, 8, 16), 'allowed')
          check(`${room.id} backdrop at ${tile}`, () => drawBackdrop(ctx, room, v, t), 'allowed')
          check(`${room.id} pits at ${tile}`, () => drawPits(ctx, room, 0, room.cols, t), 'none')
        }
      }
    }
  })

  it('every cell of both sprite sheets', () => {
    const { ctx, check } = fakeContext()
    for (const room of ROOM_LIST) for (const c of [...HERO_SHEET, ...WORLD_SHEET]) for (const t of TIMES) check(`${room.id} sheet ${c.label}`, () => c.draw(ctx, room, t), 'allowed')
  })
})
