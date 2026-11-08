/**
 * The loop guard: every loop body and function body gets `__g();`, lines keep their numbers,
 * syntax errors name the designer's line, and guarded code compiled with a counting guard
 * really stops a loop that never yields. Made code reaches only its own names, its args and
 * plain JavaScript: the ways out of the sandbox are refused, or stopped as the code runs.
 */
import { describe, expect, it } from 'vitest'

import { ACTION_EXAMPLE, ITEM_EXAMPLE } from '../engine/apidoc'
import type { Kit } from '../engine/kit'
import { compileAction, compileModel, describeError, resetGuard } from '../engine/sandbox'
import { guard, type CodeKind } from './guard'

const LIMIT = 1000

class Stopped extends Error {}

/** Compiles guarded code the way the page does (strict, the guard as __g) with a guard that throws after LIMIT calls. */
function compile(kind: CodeKind, code: string) {
  const g = guard(kind, code)
  if (!g.ok) throw new Error(g.error)
  let count = 0
  const counter = () => {
    if (++count > LIMIT) throw new Stopped('a loop ran too long')
  }
  const fn = new Function('__g', `"use strict"; return (${g.guarded})`)(counter) as (...args: unknown[]) => unknown
  return { fn, reset: () => (count = 0), calls: () => count, guarded: g.guarded }
}

const guarded = (kind: CodeKind, code: string) => {
  const g = guard(kind, code)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

const count = (s: string) => s.split('__g()').length - 1

/** The guarded text without what the guard put in. */
const strip = (s: string) => s.replace(/\{__g\(\);|__g\(\);|\(__g\(\), \(/g, '').replace(/[{}()]/g, '')

const EVERY_KIND = `const list = [1, 2, 3]
for (let i = 0; i < 3; i++) { yield }
for (let i = 0; i < 3; i++) yield
for (const k in { a: 1 }) yield
for (const v of list) { for (const u of list) yield }
while (list.length > 5) list.pop()
do { yield } while (false)
do yield; while (false)
outer: for (const a of list) for (const b of list) { if (b > a) continue outer }
const f = function () { return 1 }
function g(n) { return n > 0 ? g(n - 1) : 0 }
const arrow = (x) => x * 2
const blockArrow = (x) => { return x * 2 }
const objArrow = () => ({ a: 1 })
const gen = function* () { yield 1 }
const o = { m() { return 1 }, get g() { return 2 }, set s(v) { this.v = v }, *it() { yield 3 } }
class C { constructor() { this.n = 1 } get x() { return this.n } m() { return arrow(1) } }
for (;;) break
yield* w.wait(f() + g(2) + arrow(1) + blockArrow(1) + objArrow().a + gen().next().value + o.m() + o.g + new C().x)`

describe('guard', () => {
  it('puts a guard in every loop body and function body', () => {
    const out = guarded('action', EVERY_KIND)
    // 11 loops, 14 functions (the action itself, 3 function expressions or declarations, 3 arrows, a generator, 4 object members, 3 class members).
    expect(count(out)).toBe(11 + 14)
    expect(out.startsWith('function* __action(me, args, w) {__g();\n')).toBe(true)
    expect(out).toContain('for (let i = 0; i < 3; i++) {__g();yield}')
    expect(out).toContain('do {__g();yield;} while (false)')
    expect(out).toContain('const arrow = (x) => (__g(), (x * 2))')
    expect(out).toContain('const objArrow = () => ((__g(), ({ a: 1 })))')
    expect(out).toContain('outer: for (const a of list) {__g();for (const b of list) {__g(); if (b > a) continue outer }}')
  })

  it('keeps every line on its line', () => {
    const out = guarded('action', EVERY_KIND)
    const lines = out.split('\n')
    const code = EVERY_KIND.split('\n')
    expect(lines.length).toBe(code.length + 2)
    code.forEach((line, i) => expect(strip(lines[i + 1]!)).toBe(strip(line)))
  })

  it('guards nested bodies without braces, closing the inner one first', () => {
    const out = guarded('tick', 'for (;;) while (it.x > 0) it.x -= () => 1\nlet n = 0')
    expect(out).toContain('for (;;) {__g();while (it.x > 0) {__g();it.x -= () => (__g(), (1))}}\nlet n = 0')
    expect(() => new Function('__g', `return (${out})`)).not.toThrow()
  })

  it('wraps each kind in its own function', () => {
    expect(guarded('model', 'm.box(1, 1, 1)')).toBe('function __model(m) {__g();\nm.box(1, 1, 1)\n}')
    expect(guarded('tick', 'it.yaw += dt')).toBe('function __tick(it, w, dt) {__g();\nit.yaw += dt\n}')
  })

  it('names the designer line of a syntax error', () => {
    const at = (code: string) => {
      const g = guard('action', code)
      return g.ok ? 'ok' : g.error
    }
    expect(at('const a = 1\nconst b = 2\nconst c = ;')).toBe('SyntaxError: Unexpected token (line 3)')
    expect(at('me.say("hi")\nif (true) {\nyield')).toMatch(/\(line 3\)$/)
    expect(at('me.x = 1\n}\nfunction q() {')).toBe('SyntaxError: an extra } ends the function early (line 2)')
    expect(at('const a = 1\nlet b = 2\nconst a = 3')).toMatch(/^SyntaxError: Identifier `a` has already been declared \(line [13]\)$/)
    expect(at('yield\nw.during(1, (k) => {\n  yield\n})')).toMatch(/^SyntaxError: .*yield.* \(line 3\)$/)
    expect(at('with (me) {}')).toMatch(/\(line 1\)$/)
    expect(guard('model', 'm.box(1, 1, 1)\nreturn { carry: "hand" }').ok).toBe(true)
  })

  it('stops a loop that never yields, of every kind', () => {
    for (const code of ['while (true) {}', 'for (;;);', 'do {} while (true)', 'for (;;) { for (;;) {} }', 'while (true) w.x = 1']) {
      const { fn } = compile('action', code)
      const gen = fn({}, {}, {}) as Generator
      expect(() => gen.next(), code).toThrow(Stopped)
    }
  })

  it('stops endless calls: recursion, arrows, methods', () => {
    for (const code of ['function f() { return f() }\nf()', 'const f = () => f()\nf()', 'const o = { m() { return this.m() } }\no.m()', '[1].forEach(function again() { [1].forEach(again) })']) {
      const { fn } = compile('model', code)
      // Without the guard these overflow the stack (a RangeError): the guard must stop them first.
      expect(() => fn({}), code).toThrow(Stopped)
    }
  })

  it('lets a loop that yields run forever when the guard is reset before every step', () => {
    const { fn, reset } = compile('action', 'let n = 0\nwhile (true) {\n  for (let i = 0; i < 100; i++) n += i\n  yield\n}')
    const gen = fn({}, {}, {}) as Generator
    for (let step = 0; step < 500; step++) {
      reset()
      gen.next()
    }
  })

  it('reports runtime errors on the designer line', () => {
    const lineOfThrow = (code: string) => {
      const { fn } = compile('action', code)
      try {
        ;(fn({}, {}, {}) as Generator).next()
      } catch (err) {
        return Number(/<anonymous>:(\d+):\d+/.exec(String((err as Error).stack))![1])
      }
      throw new Error('did not throw')
    }
    const offset = lineOfThrow('throw new Error("probe")') - 1
    const code = 'let n = 0\nfor (let i = 0; i < 3; i++) {\n  n += i\n}\nconst f = (x) => x + 1\nwhile (n < 10) n = f(n)\nif (!n) {\n  yield\n}\nnull.x = 1'
    expect(lineOfThrow(code) - offset).toBe(10)
    // With a key checked as the code runs, the check sits on the header line and the lines stay.
    expect(lineOfThrow('const o = { a: 1 }\nconst k = "a"\nlet n = o[k]\nnull.x = n') - offset).toBe(4)
  })
})

describe('what made code may reach', () => {
  const refused = (code: string, kind: CodeKind = 'action') => {
    const g = guard(kind, code)
    return g.ok ? 'passed' : g.error
  }

  it('refuses the ways to code made from text, which would run without the guard', () => {
    // Every function's constructor is the real Function, shadowed or not; eval cannot be shadowed at all.
    expect(refused("me.say('hi')\nconst F = ({}).constructor.constructor\nF('while (true) {}')()")).toBe('NotAllowed: .constructor, made code cannot reach constructors or prototypes (line 2)')
    expect(refused('(function () {}).constructor("return 1")()')).toMatch(/^NotAllowed: \.constructor/)
    expect(refused('const o = {}\n;(0, eval)("var n = 0; while (true) n++")')).toBe('ReferenceError: eval is not defined (made code has its own names, its args and plain JavaScript like Math) (line 2)')
    expect(refused('Function("return this")()')).toMatch(/^ReferenceError: Function is not defined/)
    expect(refused('yield\nimport("data:text/javascript,while(true){}")')).toBe('NotAllowed: import(), made code uses only what it is given (line 2)')
    expect(refused('new WebAssembly.Module(new Uint8Array(8))')).toMatch(/^ReferenceError: WebAssembly is not defined/)
    expect(refused('const { constructor: C } = me')).toMatch(/^NotAllowed: \.constructor/)
    expect(refused("const C = me['constructor']")).toMatch(/^NotAllowed: \.constructor/)
    expect(refused('const C = me[`constructor`]')).toMatch(/^NotAllowed: \.constructor/)
    expect(refused("const d = Object.getOwnPropertyDescriptors(Object.getPrototypeOf(me))")).toMatch(/^NotAllowed: \.getOwnPropertyDescriptors/)
    expect(refused('Reflect.get(me, "x")')).toMatch(/^ReferenceError: Reflect is not defined/)
  })

  it('refuses the page itself, under any of its names', () => {
    for (const name of ['window', 'self', 'globalThis', 'top', 'parent', 'frames', 'opener', 'document', 'fetch', 'localStorage', 'setTimeout']) {
      expect(refused(`${name}.x`), name).toMatch(new RegExp(`^ReferenceError: ${name} is not defined`))
    }
  })

  it('refuses touching the guard, which would let a loop run for ever', () => {
    expect(refused('__g = () => {}\nwhile (true) {}')).toBe('NotAllowed: __g, names starting with __ belong to the game (line 1)')
    expect(refused('{\n  let __g = () => 0\n  while (true) {}\n}')).toMatch(/^NotAllowed: __g, .* \(line 2\)$/)
    expect(refused('const __k = (k) => k')).toMatch(/^NotAllowed: __k/)
  })

  it('refuses changing what the page shares: prototypes and the built-ins', () => {
    expect(refused('({}).constructor.prototype.__x = 42')).toMatch(/^NotAllowed: \.constructor/)
    expect(refused('const p = ({}).__proto__\np.x = 1')).toMatch(/^NotAllowed: \.__proto__/)
    expect(refused('Array.prototype.push = null')).toMatch(/^NotAllowed: made code cannot change Array/)
    expect(refused('const p = Array.prototype')).toMatch(/^NotAllowed: \.prototype/)
    expect(refused('Object.getPrototypeOf([]).push = null')).toMatch(/^NotAllowed: \.getPrototypeOf/)
    expect(refused('Object.setPrototypeOf(me, null)')).toMatch(/^NotAllowed: \.setPrototypeOf/)
    expect(refused('Object.defineProperty(me, "x", {})')).toMatch(/^NotAllowed: \.defineProperty/)
    expect(refused('const r = w.random\nMath.random = r', 'tick')).toBe('NotAllowed: made code cannot change Math (line 2)')
    expect(refused('Math = null')).toBe('NotAllowed: made code cannot change Math (line 1)')
    expect(refused('JSON.parse.x++')).toMatch(/^NotAllowed: made code cannot change JSON/)
    expect(refused('[Math.max] = [0]')).toMatch(/^NotAllowed: made code cannot change Math/)
    expect(refused('delete Number.isFinite')).toMatch(/^NotAllowed: made code cannot change Number/)
  })

  it('checks a key worked out as the code runs, and lets every other key through', () => {
    const run = (code: string) => (compileModel((guard('model', code) as { guarded: string }).guarded) as (m: object) => unknown)({})
    // The real sandbox, as the page compiles it.
    expect(() => run("const k = 'constr' + 'uctor'\nreturn ({})[k][k]('while (true) {}')")).toThrow('made code cannot use the key constructor')
    expect(() => run("const k = '_'.repeat(2) + 'proto' + '_'.repeat(2)\nreturn ({})[k]")).toThrow('made code cannot use the key __proto__')
    expect(() => run("return ({})[['constr' + 'uctor']]")).toThrow('made code cannot use a thing as a key')
    expect(() => run("const k = 'constr' + 'uctor'\nconst { [k]: F } = () => 1\nreturn F")).toThrow('made code cannot use the key constructor')
    expect(() => run("const k = 'proto' + 'type'\nconst A = Array\nreturn A[k]")).toThrow('made code cannot use the key prototype')
    expect(run("const o = { a: 1, b: [5, 6] }\nconst k = 'a'\no[k] += 1\nconst s = Symbol('s')\no[s] = 3\nconst i = o.b.length - 1\nreturn o[k] + o.b[i] + o[s] + 'xy'[i ? 1 : 0].length + (o?.[k] ?? 0)")).toBe(2 + 6 + 3 + 1 + 2)
    const out = (guard('model', 'const k = "a"\nreturn ({ a: 1 })[k]') as { guarded: string }).guarded
    expect(out.split('\n')[0]).toMatch(/^function __model\(m\) \{__g\(\);const __k = \(k, l\) => \{.*\};$/)
    expect(out.split('\n')[2]).toBe('return ({ a: 1 })[__k((k), 2)]')
    // Code without such a key is guarded exactly as before.
    expect(guarded('model', 'const o = { a: 1 }\nreturn o.a + o["a"] + [1][0]')).toBe('function __model(m) {__g();\nconst o = { a: 1 }\nreturn o.a + o["a"] + [1][0]\n}')
  })

  it('names the line of a key it refuses as the code runs, as the designer is told it', () => {
    // The check sits on the header line, so the stack alone would name no line of the designer's.
    const said = (f: () => unknown) => {
      try {
        f()
      } catch (err) {
        return describeError(err)
      }
      return 'did not throw'
    }
    const model = (code: string) => () => compileModel((guard('model', code) as { guarded: string }).guarded)({} as Kit)
    expect(said(model("const parts = ['constr', 'uctor']\nconst k = parts.join('')\nconst f = () => 1\nconst c = f[k]\nreturn c"))).toBe('TypeError: made code cannot use the key constructor (line 4)')
    expect(said(model("const k = 'constr' + 'uctor'\nconst {\n  [k]: F,\n} = () => 1\nreturn F"))).toBe('TypeError: made code cannot use the key constructor (line 3)')
    expect(said(model('const o = {}\nreturn o[[1]]'))).toBe('TypeError: made code cannot use a thing as a key (line 2)')
    const action = compileAction((guard('action', "yield\nconst k = 'proto' + 'type'\nconst A = [].concat\nme.say(String(A[k]))") as { guarded: string }).guarded)
    const steps = action({} as never, {} as never, {} as never)
    resetGuard()
    steps.next()
    expect(said(() => steps.next())).toBe('TypeError: made code cannot use the key prototype (line 4)')
    // An ordinary error in code with such a key keeps its own line.
    expect(said(model("const o = { a: 1 }\nconst k = 'a'\nconst n = o[k]\nnull.x = n"))).toMatch(/^TypeError: .* \(line 4\)$/)
  })

  it('checks a key with a comma in it as the one key it is', () => {
    const run = (code: string) => compileModel((guard('model', code) as { guarded: string }).guarded)({} as Kit)
    // Parentheses the key's own range leaves out: unwrapped, `__k(x, y)` would check and use x.
    expect(run("const o = { a: 1, b: 2 }\nconst x = 'a', y = 'b'\nreturn o[(x, y)]")).toBe(2)
    expect(run("const o = { a: 1, b: 2 }\nconst x = 'a', y = 'b'\nconst { [(x, y)]: v } = o\nreturn v")).toBe(2)
    expect(() => run("const o = {}\nconst x = 'a', y = 'constr' + 'uctor'\nreturn o[(x, y)]")).toThrow('made code cannot use the key constructor (line 3)')
  })

  it('lets through what actions and things really use', () => {
    for (const code of [EVERY_KIND, ACTION_EXAMPLE]) expect(refused(code)).toBe('passed')
    expect(refused(ITEM_EXAMPLE, 'model')).toBe('passed')
    const scoped = [
      // Its own names may be called like the page's: they are its own.
      "const top = me.ahead(1)\nconst parent = w.actor('mike')\nlet self = 1\nlet window = 0\nwindow += self",
      // var reaches the whole function, function declarations are hoisted, a named function expression sees its name.
      'if (me.x > 0) { var t = 1 }\nt = (t || 0) + f()\nfunction f() { return 1 }\nconst g = function again(n) { return n > 0 ? again(n - 1) : arguments.length }\ng(2)',
      // Catch params, switch cases, labels, classes, getters, rest and defaults, shadowing a built-in.
      "try { null.x } catch ({ message }) { me.say(message) }\nswitch (w.room) { case 'pool': { const d = 1; break } default: const e = 2 }\nouter: for (const a of [1]) { for (const b of [2]) { if (b > a) continue outer } }\nclass Hop { static n = 1; #h = 2; get h() { return this.#h } static { const z = Hop.n } }\nconst [x = 1, ...rest] = [undefined, 2]\nconst { a = 1, ...others } = { b: 2 }\nconst Math = { max: () => 0 }\nMath.max = () => 1",
      // Plain JavaScript built-ins, and a local map changed freely.
      "const m = new Map([[1, 2]])\nm.set(3, 4)\nconst list = Array.from({ length: 3 }, (_, i) => i * Math.PI)\nconst ok = Number.isFinite(list[1]) && !isNaN(parseFloat('1.5'))\nconsole.log(JSON.stringify(Object.keys({ ok })), String(Infinity), Date.now() > 0, undefined)",
    ]
    for (const code of scoped) expect(refused(code), code).toBe('passed')
    expect(refused("it.part('lid').rx = Math.sin(w.t)\nit.state.n = (it.state.n || 0) + dt", 'tick')).toBe('passed')
  })

  it('lets a bubble in both languages through as it is', () => {
    // The designer is told to write every bubble so: me.say({ en: 'Wheee!', fi: 'Jee!' }).
    const code = "const friend = w.actor('mike')\nme.say({ en: 'Wheee!', fi: 'Jee!' })\nme.say({ en: `Bye, ${friend.name}!`, fi: `Hei hei, ${friend.name}!` }, 2)\nyield"
    expect(refused(code)).toBe('passed')
    const said: unknown[] = []
    const { fn } = compile('action', code)
    ;(fn({ say: (words: unknown) => said.push(words) }, {}, { actor: () => ({ name: 'Mikko' }) }) as Generator).next()
    expect(said).toEqual([
      { en: 'Wheee!', fi: 'Jee!' },
      { en: 'Bye, Mikko!', fi: 'Hei hei, Mikko!' },
    ])
  })
})
