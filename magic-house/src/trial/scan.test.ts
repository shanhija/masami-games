/**
 * The scan of made code's text for a handle's read used as a condition without its call
 * (trial/scan.ts): every such use is said with its line, and nothing else is.
 */

import { describe, expect, it } from 'vitest'
import { MISTAKES } from '../engine/api'
import { scanReads } from './scan'

const said = (key: string, what: string, line: number) => `the room's code: ${MISTAKES.notCalled(what, key)} (line ${line})`
const scan = (body: string) => scanReads(body, "the room's code", 0)

describe('the scan of reads used without their call', () => {
  it('finds each read used as a condition, on its line', () => {
    expect(scan('const p = w.players()[0]\nif (p.holding) w.finish()')).toEqual([said('holding', 'player', 2)])
    expect(scan('if (w.players()[0].standingOn) x()')).toEqual([said('standingOn', 'player', 1)])
    expect(scan("w.until(() => w.get('door').hidden)")).toEqual([said('hidden', 'handle', 1)])
    expect(scan('if (!door.hidden) a()')).toEqual([said('hidden', 'handle', 1)])
    expect(scan('if (a && t.heldBy) b()')).toEqual([said('heldBy', 'thing', 1)])
    expect(scan('const n = boat.moving ? 1 : 2')).toEqual([said('moving', 'mover', 1)])
    expect(scan('while (zone.inside && k < 3) k++')).toEqual([said('inside', 'zone', 1)])
    expect(scan('return p.button || q')).toEqual([said('button', 'player', 1)])
  })

  it('says the line of the designer when the text is guarded under a header line', () => {
    expect(scanReads('function __room(r, w) {__g();\nconst a = 1\nif (z.has) a()\n}', "the room's code", 1)).toEqual([said('has', 'zone', 2)])
    expect(scanReads("function* __walk(bots, w) {__g();\nyield* w.until(() => (__g(), (w.get('door').hidden)), 1)\n}", "the room's code", 1)).toEqual([said('hidden', 'handle', 1)])
  })

  it('leaves calls, assignments, values passed on and the code’s own objects alone', () => {
    expect(scan('if (p.holding()) a()')).toEqual([])
    expect(scan('if (p.holding?.()) a()')).toEqual([])
    expect(scan('if (seen.has(p)) a()')).toEqual([])
    expect(scan('const f = p.holding')).toEqual([])
    expect(scan('list.filter(z.has)')).toEqual([])
    expect(scan('const state = { hidden: false }\nif (state.hidden) a()')).toEqual([])
    expect(scan('state.hidden = true')).toEqual([])
    expect(scan('if (p.holding() === t) a()')).toEqual([])
    // The code's own objects with such a field, wherever they are built.
    expect(scan('const birds = [1, 2].map((i) => ({ at: i, moving: false }))\nif (birds[0].moving) a()')).toEqual([])
    expect(scan('const kids = w.players().map((p) => ({ p, holding: false }))\nfor (const k of kids) if (k.holding) a()')).toEqual([])
    expect(scan('lamps.push({ hidden: true })\nconst on = lamps.filter((l) => !l.hidden)')).toEqual([])
    expect(scan('function make(at) { return { at, inside: false } }\nconst z = make(1)\nif (z.inside) a()')).toEqual([])
    expect(scan('const k = { p }\nk.holding = true\nif (k.holding) a()')).toEqual([])
  })

  it("still finds a read when `hidden` is only a builder's option", () => {
    expect(scan("const door = r.box([0, 0, 0], [1, 2, 1], { hidden: true })\nreturn () => { if (door.hidden) a() }")).toEqual([said('hidden', 'handle', 2)])
    expect(scan('r.after(2, () => { const s = { hidden: 1 } })\nif (door.hidden) a()')).toEqual([])
  })
})
