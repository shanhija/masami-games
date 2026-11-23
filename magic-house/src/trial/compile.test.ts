import { existsSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { Kit } from '../../../silly-billy/src/engine/kit'
import { describeError, GuardError } from '../../../silly-billy/src/engine/sandbox'
import { GLOBALS as SILLY_GLOBALS } from '../../../silly-billy/src/server/codeKinds'
import { guard } from '../../../silly-billy/src/server/guard'
import { MISTAKES, type RoomCode } from '../engine/api'
import { cos, nextThrow, sin, streamState } from '../engine/math'
import { buildRoom, RoomBuildError, RoomRuntime } from '../engine/room'
import { roomStart } from '../engine/testing'
import { CODE_KINDS, guardCode, type CodeKind } from '../server/codeKinds'
import type { Run } from './api'
import { LOOK_MISTAKES } from '../engine/look'
import { buildLook, LookBuildError } from '../engine/lookBuilder'
import { MATH } from '../engine/api'
import { compileGift, compileLook, compileRoom, compileWalk, LookRuntime, QUIET_CONSOLE, WALK_LONG, WalkRuntime } from './compile'

const S1 = roomStart(1, 'together', 1, 11)
/** A value made code might be handed in a test, past the types. */
const bad = (v: unknown) => v as never

/** A body guarded as its kind; a test fails on a guard error. */
function guarded(kind: CodeKind, body: string): string {
  const g = guardCode(kind, body)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

/** A body guarded as its kind but with Silly Billy's names, Date among them: code the guard would refuse today, to show the compile's own walls. */
function guardedWithDate(kind: CodeKind, body: string): string {
  const g = guard({ header: CODE_KINDS[kind].header, allowed: SILLY_GLOBALS }, body)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

/** A plain room for one player in made code, six lines, then `seventh` on the designer's line 7. */
const roomText = (seventh: string) =>
  [
    'const across = 16',
    'r.box([0, 0.5, 0], [across / 4, 1, 2])',
    'for (const p of w.players()) p.putAt([-4, 0, 0])',
    'r.wayOut([8, 0, 0])',
    "r.steps([{ hint: { en: 'look', fi: 'katso' }, at: [0, 0, 0], done: () => false }])",
    'const n = Math.floor(Math.random() * 3)',
    seventh,
  ].join('\n')

/** The sentence a room's build fails with. */
function buildSentence(code: RoomCode, rt: RoomRuntime): string {
  try {
    buildRoom(code, S1, rt)
  } catch (err) {
    if (err instanceof RoomBuildError) return err.sentence
    throw err
  }
  throw new Error('the room built')
}

/** The sentence a look's build fails with, on the room roomText builds. */
function lookSentence(guardedLook: string): string {
  const rt = new RoomRuntime()
  const room = buildRoom(compileRoom(guarded('room', roomText('const m = n + 1')), rt), S1, rt)
  const lrt = new LookRuntime()
  try {
    buildLook(room, compileLook(guardedLook, lrt), lrt)
  } catch (err) {
    if (err instanceof LookBuildError) return err.sentence
    throw err
  }
  throw new Error('the look built')
}

/** Plays a walkthrough to its end, a frame's budget for each step; what it threw, or null. */
function playWalk(run: Run, rt: WalkRuntime): unknown {
  try {
    for (let i = 0; i < 100; i++) {
      rt.startFrame()
      if (run.next().done === true) return null
    }
  } catch (err) {
    return err
  }
  throw new Error('the walkthrough did not end')
}

describe("a throw on the designer's line names that line, in every kind", () => {
  it('the room', () => {
    const rt = new RoomRuntime()
    expect(buildSentence(compileRoom(guarded('room', roomText('throw new Error("seven")')), rt), rt)).toBe(MISTAKES.thrown("the room's code", 'Error: seven (line 7)'))
    // And a room that builds, on the same text, builds.
    const ok = new RoomRuntime()
    expect(buildRoom(compileRoom(guarded('room', roomText('const m = n + 1')), ok), S1, ok).world.players).toHaveLength(1)
  })

  it('the walkthrough', () => {
    const rt = new WalkRuntime()
    rt.seed(11)
    const walk = compileWalk(guarded('walk', 'const a = 1\nyield\nconst b = a + 1\nyield\nconst c = b + 1\nyield\nthrow new Error("seven")'), rt)
    expect(describeError(playWalk(walk(bad([]), bad({})), rt))).toBe('Error: seven (line 7)')
  })

  it('a present', () => {
    const build = compileGift(guarded('gift', "m.box(1, 1, 1)\nconst a = 2\nconst b = 3\nconst d = 4\nconst e = 5\nconst f = 6\nnull.x"))
    let thrown: unknown = null
    try {
      build(new Kit())
    } catch (err) {
      thrown = err
    }
    expect(describeError(thrown)).toMatch(/^TypeError: .* \(line 7\)$/)
  })

  it('the look', () => {
    expect(lookSentence(guarded('look', 'const a = 1\nconst b = 2\nconst c = 3\nconst d = 4\nconst e = 5\nconst f = 6\nthrow new Error("seven")'))).toBe(LOOK_MISTAKES.thrown('Error: seven (line 7)'))
  })
})

describe('the globals each kind gets', () => {
  it("the room: the runtime's Math, no Date, a quiet console", () => {
    const rt = new RoomRuntime()
    const room = compileRoom(guardedWithDate('room', 'return [Math, typeof Date, console]'), rt) as unknown as (r: unknown, w: unknown) => unknown[]
    rt.budget.start(100, 'over')
    expect(room(null, null)).toEqual([rt.math, 'undefined', QUIET_CONSOLE])
    expect(rt.math.sin).toBe(sin)
  })

  it("the walkthrough: the engine's Math with a stream of its own, the room's seed plus one", () => {
    const rt = new WalkRuntime()
    const walk = compileWalk(guardedWithDate('walk', 'return [Math, typeof Date, console, Math.random(), Math.random()]'), rt)
    rt.seed(11)
    rt.startFrame()
    const [math, date, log, a, b] = walk(bad([]), bad({})).next().value as unknown as [Math, string, unknown, number, number]
    const [x, s] = nextThrow(streamState(12))
    expect([math.cos, date, log, a, b]).toEqual([cos, 'undefined', QUIET_CONSOLE, x, nextThrow(s)[0]])
  })

  it("the look: the engine's Math with a stream of its own, the room's seed plus MATH.lookSeedOffset, started afresh each build", () => {
    const rt = new LookRuntime()
    const look = compileLook(guardedWithDate('look', 'return [Math, typeof Date, console, Math.random(), Math.random()]'), rt) as unknown as (r: unknown, room: unknown) => unknown[]
    const draw = () => {
      rt.start(11)
      return look(null, null)
    }
    const [math, date, log, a, b] = draw() as [Math, string, unknown, number, number]
    const [x, s] = nextThrow(streamState(11 + MATH.lookSeedOffset))
    expect([math.cos, date, log, a, b]).toEqual([cos, 'undefined', QUIET_CONSOLE, x, nextThrow(s)[0]])
    expect(draw()).toEqual([math, date, log, a, b])
  })

  it('a present: the same throws every time it is built', () => {
    const build = compileGift(guarded('gift', 'for (let i = 0; i < 3; i++) m.sphere(0.1 + Math.random() * 0.1, { at: [Math.random(), 0, 0], color: c.main })'))
    const shapes = () => {
      const kit = new Kit()
      build(kit)
      return kit.shapes
    }
    expect(shapes()).toEqual(shapes())
    expect(shapes()[0]!.color).toBe('#fe01fd')
  })
})

describe("the page's built-ins are out of made code's reach", () => {
  it.each([
    ['Object.assign(Number, { isFinite: () => true })', 'Number'],
    ["const o = Object\no.assign(String, { raw: () => 'x' })", 'String'],
    ['Object.freeze(Array)', 'Array'],
    ['Object.assign(Object, { keys: () => [] })', 'Object'],
    ['Object.assign(JSON, { stringify: () => "" })', 'JSON'],
    ['const A = Array\ndelete A.from', 'Array'],
  ])('%s throws and changes nothing', (body, name) => {
    const rt = new RoomRuntime()
    const room = compileRoom(guarded('room', body), rt) as unknown as (r: unknown, w: unknown) => unknown
    rt.budget.start(100, 'over')
    expect(() => room(null, null)).toThrow(`made code cannot change ${name}: the whole page shares it`)
    expect(Number.isFinite(NaN)).toBe(false)
    expect(String.raw`a`).toBe('a')
    expect(Object.isFrozen(Array)).toBe(false)
    expect(Object.keys({ a: 1 })).toEqual(['a'])
    expect(JSON.stringify(1)).toBe('1')
    expect(typeof Array.from).toBe('function')
  })

  it('still calls, builds and tells them apart', () => {
    const rt = new RoomRuntime()
    const room = compileRoom(guarded('room', 'const m = new Map([[1, 2]])\nreturn [Number.isFinite(1), Array.from([1, 2]), m instanceof Map, m.get(1), JSON.parse("[3]"), Object.keys({ a: 1 }), new Error("x") instanceof Error, String(5), Array.isArray([])]'), rt) as unknown as (r: unknown, w: unknown) => unknown
    rt.budget.start(100, 'over')
    expect(room(null, null)).toEqual([true, [1, 2], true, 2, [3], ['a'], true, '5', true])
  })
})

describe('the budgets count turns, never a clock', () => {
  it('an endless loop stops the room, the walkthrough and a present with their sentences', () => {
    const rt = new RoomRuntime()
    expect(buildSentence(compileRoom(guarded('room', roomText('while (true) {}')), rt), rt)).toBe(`${MISTAKES.buildLong()} (line 7)`)
    const wrt = new WalkRuntime()
    wrt.seed(11)
    const stopped = playWalk(compileWalk(guarded('walk', 'yield\nwhile (true) {}'), wrt)(bad([]), bad({})), wrt)
    expect(stopped).toBeInstanceOf(GuardError)
    expect((stopped as Error).message).toBe(WALK_LONG)
    expect(lookSentence(guarded('look', 'const a = 1\nwhile (true) {}'))).toBe(`${LOOK_MISTAKES.lookLong()} (line 2)`)
  })
})

describe('what the worker imports', () => {
  /** Every module a file reaches by its value imports (types are erased), as paths. */
  function reached(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen
    seen.add(file)
    if (!file.endsWith('.ts') && !file.endsWith('.tsx')) return seen
    const text = readFileSync(file, 'utf8')
    for (const m of text.matchAll(/^(?:import|export) (?!type )(?:[^'"]*? from )?['"]([^'"]+)['"]/gm)) {
      const spec = m[1]!
      if (!spec.startsWith('.')) {
        seen.add(spec)
        continue
      }
      const base = path.resolve(path.dirname(file), spec)
      const found = [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), base].find((p) => existsSync(p) && statSync(p).isFile())
      if (found === undefined) throw new Error(`${file} imports ${spec}, which is not found`)
      reached(found, seen)
    }
    return seen
  }

  it.each(['compile.ts', 'giftCheck.ts', 'lookCheck.ts', 'trial.ts', 'worker.ts'])('%s reaches no .tsx file and not the guard (which needs Vite)', (file) => {
    const all = [...reached(path.join(import.meta.dirname, file))]
    expect(all.filter((p) => p.endsWith('.tsx'))).toEqual([])
    expect(all.filter((p) => p === 'vite' || p.endsWith('guard.ts'))).toEqual([])
    expect(all.some((p) => p.endsWith('engine/builder.ts'))).toBe(true)
  })

  it("the worker reaches the look's builder and its check, and none of the house's scene", () => {
    const all = [...reached(path.join(import.meta.dirname, 'worker.ts'))]
    expect(all.some((p) => p.endsWith('engine/lookBuilder.ts'))).toBe(true)
    expect(all.some((p) => p.endsWith('trial/lookCheck.ts'))).toBe(true)
    expect(all.filter((p) => p.includes('magic-house/src/scene/'))).toEqual([])
  })
})
