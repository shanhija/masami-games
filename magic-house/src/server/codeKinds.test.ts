import { describe, expect, it } from 'vitest'
import { GLOBALS as SILLY_GLOBALS } from '../../../silly-billy/src/server/codeKinds'
import { CODE_KINDS, GLOBALS, guardCode, type CodeKind } from './codeKinds'

const KINDS = Object.keys(CODE_KINDS) as CodeKind[]

describe("Magic House's code kinds for Silly Billy's guard", () => {
  it("allow Silly Billy's plain JavaScript but Date, console kept", () => {
    expect([...GLOBALS].sort()).toEqual([...SILLY_GLOBALS].filter((n) => n !== 'Date').sort())
    expect(GLOBALS.has('console')).toBe(true)
  })

  it.each(KINDS)('%s: guards a body under its own header, the designer\'s line N on line N + 1', (kind) => {
    const g = guardCode(kind, 'const a = 1\nfor (let i = 0; i < 3; i++) {}\nconsole.log(a)')
    if (!g.ok) throw new Error(g.error)
    const lines = g.guarded.split('\n')
    expect(lines[0]!.startsWith(CODE_KINDS[kind].header)).toBe(true)
    expect(lines[2]).toContain('__g();')
    expect(lines[3]).toBe('console.log(a)')
  })

  it.each(KINDS)("%s: refuses Date, and a syntax error, naming the designer's line", (kind) => {
    expect(guardCode(kind, 'const a = 1\nconst t = Date.now()')).toEqual({ ok: false, error: expect.stringMatching(/^ReferenceError: Date is not defined .*\(line 2\)$/) })
    expect(guardCode(kind, 'const a = 1\nconst b = 2\nconst c = ) 2\nconst d = 4')).toEqual({ ok: false, error: expect.stringMatching(/^SyntaxError: .*\(line 3\)$/) })
    expect(guardCode(kind, 'const a = 1\n\nwindow.alert(a)')).toEqual({ ok: false, error: expect.stringMatching(/window is not defined .*\(line 3\)$/) })
  })

  it("names each kind's parameters as the reference does: (r, w), (bots, w), (m, c)", () => {
    expect(CODE_KINDS.room.header).toBe('function __room(r, w) {')
    expect(CODE_KINDS.walk.header).toBe('function* __walk(bots, w) {')
    expect(CODE_KINDS.gift.header).toBe('function __gift(m, c) {')
    const walk = guardCode('walk', 'yield* bots[0].goTo(w.get("door"))')
    expect(walk.ok).toBe(true)
  })
})
