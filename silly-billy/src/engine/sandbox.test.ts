/**
 * The sandbox: made code compiles in strict mode with the page's globals hidden, the guard
 * stops a loop that never yields, and an error is told with the line in the designer's code.
 */
import { describe, expect, it, vi } from 'vitest'

import type { ActorApi, Args, WorldApi } from './api'
import { Budget, compile, compileAction, compileModel, compileTick, describeError, GUARD_LIMIT, GUARD_MS, GuardError, resetGuard } from './sandbox'
import { Kit } from './kit'
import { guardedAction } from './testing'

const me = {} as ActorApi
const w = {} as WorldApi
const noArgs: Args = {}

/** Runs a made action to its end, collecting what it yields. */
function runAction(body: string, args: Args = noArgs): unknown[] {
  const gen = compileAction(guardedAction(body))(me, args, w)
  const out: unknown[] = []
  resetGuard()
  for (let r = gen.next(); !r.done; r = gen.next()) out.push(r.value)
  return out
}

describe('sandbox', () => {
  it('hides the page from made code', () => {
    const seen: string[] = []
    const out = { seen } as unknown as Args
    runAction(
      `__g();for (const v of [typeof window, typeof globalThis, typeof document, typeof fetch, typeof localStorage, typeof setTimeout, typeof Function, typeof navigator, typeof performance]) {__g(); args.seen.push(v) }`,
      out,
    )
    expect(seen).toEqual(Array(9).fill('undefined'))
  })

  it('runs made code in strict mode', () => {
    expect(() => runAction('__g();undeclared = 5')).toThrow(ReferenceError)
    expect(runAction('__g();yield this === undefined')).toEqual([true])
  })

  it('stops a loop that never yields, every time it is run again', () => {
    const fn = compileAction(guardedAction('while (true) {__g(); }'))
    for (let i = 0; i < 2; i++) {
      resetGuard()
      expect(() => fn(me, noArgs, w).next()).toThrow(GuardError)
    }
    // A loop that yields gets a fresh budget at every reset.
    const gen = compileAction(guardedAction('__g();for (let i = 0; i < 3; i++) {__g(); for (let j = 0; j < 90000; j++) {__g(); } yield i }'))(me, noArgs, w)
    const got: unknown[] = []
    for (;;) {
      resetGuard()
      const r = gen.next()
      if (r.done) break
      got.push(r.value)
    }
    expect(got).toEqual([0, 1, 2])
    expect(GUARD_LIMIT).toBe(100_000)
  })

  it('stops a loop whose turns take long in real time, well before the turn limit', () => {
    // Each look at the clock finds 100 ms gone, as if every 1024 turns did heavy work.
    let clock = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => (clock += 100))
    try {
      const gen = compileAction(guardedAction('__g();let n = 0\nfor (let i = 0; i < 50000; i++) {__g(); n++ }\nyield n'))(me, noArgs, w)
      resetGuard()
      expect(() => gen.next()).toThrow('took too long')
    } finally {
      spy.mockRestore()
    }
    // Fast turns are not stopped.
    expect(runAction('__g();let n = 0\nfor (let i = 0; i < 50000; i++) {__g(); n++ }\nyield n')).toEqual([50000])
    expect(GUARD_MS).toBe(250)
  })

  it('gives every model and process call a fresh budget, even when nobody reset the guard', () => {
    let clock = 0
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    try {
      // The budget is spent and the clock has run on since the last reset.
      resetGuard()
      expect(() => compileAction(guardedAction('while (true) {__g(); }'))(me, noArgs, w).next()).toThrow(GuardError)
      clock = 5000
      const model = compileModel('function __model(m) {\n__g();for (let i = 0; i < 3000; i++) {__g(); }\nm.box(1, 1, 1)\n}')
      const kit = new Kit()
      expect(() => model(kit)).not.toThrow()
      expect(kit.shapes.length).toBe(1)
      // And a process has no `this` (the library's own entry was it).
      const tick = compileTick('function __tick(it, w, dt) {\n__g();for (let i = 0; i < 3000; i++) {__g(); }\nit.n = this === undefined ? 1 : 2\n}')
      const it = {} as { n?: number }
      expect(() => tick(it as never, w, 1 / 60)).not.toThrow()
      expect(it.n).toBe(1)
    } finally {
      spy.mockRestore()
    }
  })

  it('tells an error with the line in the designer’s own code', () => {
    const fn = compileAction(guardedAction("__g();const thing = null\nyield\nme.say(thing.x)"))
    const gen = fn(me, noArgs, w)
    gen.next()
    let err: unknown = null
    try {
      gen.next()
    } catch (e) {
      err = e
    }
    expect(describeError(err)).toBe("TypeError: Cannot read properties of null (reading 'x') (line 3)")
    const loop = compileAction(guardedAction('__g();yield\nlet n = 0\nwhile (true) {__g(); n++ }'))(me, noArgs, w)
    loop.next()
    resetGuard()
    try {
      loop.next()
    } catch (e) {
      err = e
    }
    expect(describeError(err)).toBe('GuardError: a loop ran too long without yield (line 3)')
    expect(describeError('oops')).toBe('oops')
    expect(describeError({ why: 1 })).toBe('thrown: {"why":1}')
  })

  it('compiles models and processes, and throws on a syntax error', () => {
    const kit = new Kit()
    resetGuard()
    compileModel("function __model(m) {\n__g();m.box(1, 1, 1, { color: 'red' })\nreturn { carry: 'no' }\n}")(kit)
    expect(kit.shapes).toHaveLength(1)
    const it = { x: 0 }
    compileTick('function __tick(it, w, dt) {\n__g();it.x += dt\n}')(it as never, w, 0.5)
    expect(it.x).toBe(0.5)
    expect(() => compileAction(guardedAction('__g();yield )('))).toThrow(SyntaxError)
    expect(() => compileModel('42')).toThrow(/not a function/)
  })
})

describe('another game on the sandbox', () => {
  /** A room's code as the guard makes it: it builds once and hands back what runs every step. */
  const ROOM = 'function __room(r, w) {__g();\nfor (let i = 0; i < 10; i++) {__g(); r.n++ }\nreturn () => {__g(); r.n++ }\n}'

  it('compiles any guarded function against a budget of its own, which weighs a call or a run of calls by its turns', () => {
    const budget = new Budget(null)
    const room = compile(ROOM, 'room', budget, {}) as (r: { n: number }, w: object) => () => void
    const r = { n: 0 }
    budget.start(1000, 'the room took too many turns to build')
    const step = room(r, {})
    expect([r.n, budget.spent]).toEqual([10, 11])
    // What the code made counts against the same budget, run after run.
    budget.start(5, 'a step took too many turns')
    step()
    step()
    expect([r.n, budget.spent]).toEqual([12, 2])
    // Past the caller's limit, GuardError says the caller's words, and the line is the designer's.
    budget.start(3, 'a step took too many turns')
    for (let i = 0; i < 3; i++) step()
    let err: unknown = null
    try {
      step()
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(GuardError)
    expect(describeError(err)).toBe('GuardError: a step took too many turns (line 2)')
    // A run with no limit only counts.
    budget.start(Infinity, 'never said')
    for (let i = 0; i < 2000; i++) step()
    expect(budget.spent).toBe(2000)
  })

  it('stops made code that runs before its budget was started', () => {
    const room = compile(ROOM, 'room', new Budget(null), {}) as (r: { n: number }, w: object) => unknown
    expect(() => room({ n: 0 }, {})).toThrow('made code ran before its budget was started')
  })

  it('counts turns only, never looking at the clock, when the budget has none', () => {
    const spy = vi.spyOn(performance, 'now').mockImplementation(() => 1e9 * Math.random())
    try {
      const budget = new Budget(null)
      const loop = compile('function __loop() {__g();\nlet n = 0\nfor (let i = 0; i < 50000; i++) {__g(); n++ }\nreturn n\n}', 'loop', budget, {}) as () => number
      budget.start(100_000, 'too many turns')
      const before = spy.mock.calls.length
      const n = loop()
      expect([n, spy.mock.calls.length - before]).toEqual([50000, 0])
      // A budget with a clock stops the same code once its turns take too long in real time.
      let clock = 0
      spy.mockImplementation(() => (clock += 100))
      const timed = new Budget({ ms: 250, message: 'it took too long' })
      const again = compile('function __loop() {__g();\nlet n = 0\nfor (let i = 0; i < 50000; i++) {__g(); n++ }\nreturn n\n}', 'loop', timed, {}) as () => number
      timed.start(100_000, 'too many turns')
      expect(() => again()).toThrow('it took too long')
    } finally {
      spy.mockRestore()
    }
  })

  it('hands made code globals of its own: a Math whose random is the world’s seeded one, and no Date', () => {
    let seed = 7
    const seeded = () => (seed = (seed * 16807) % 2147483647) / 2147483647
    const math = Object.freeze({ ...Object.fromEntries(Object.getOwnPropertyNames(Math).map((k) => [k, Math[k as keyof Math]])), random: seeded }) as Math
    const budget = new Budget(null)
    const roll = compile('function __roll(n) {__g();\nreturn [Math.floor(Math.random() * n), Math.max(2, 3), Math.PI, typeof Date, typeof window]\n}', 'roll', budget, { Math: math, Date: undefined }) as (n: number) => unknown[]
    budget.start(10, 'too many turns')
    const first = roll(1e9)
    seed = 7
    expect(roll(1e9)).toEqual(first)
    expect(first).toEqual([Math.floor(((7 * 16807) / 2147483647) * 1e9), 3, Math.PI, 'undefined', 'undefined'])
    // Silly Billy's own code still has the page's Math and Date.
    resetGuard()
    expect(compileModel('function __model(m) {__g();\nreturn [typeof Date, Math.random === m.random]\n}')({ random: Math.random } as unknown as Kit)).toEqual(['function', true])
  })
})
