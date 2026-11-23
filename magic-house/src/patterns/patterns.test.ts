import { Color, ShaderLib } from 'three'
import { describe, expect, it } from 'vitest'

import { buildRecipe } from '../../../silly-billy/src/engine/kit'
import { MODEL } from '../../../silly-billy/src/scene/look'
import { GIFT_MARKERS } from '../engine/gift'
import { addPatterns, PATTERNED, patternNumber, ROOM_PATTERN_PERIOD, ROOM_PATTERNED, wornModelIn, wornView } from './look'
import { PATTERN_LOOK, PATTERN_ORDER, PLAIN, patternOf, patternShown } from './patterns'
import { ZIGZAG_BAND } from './Swatch'

/** A model of every kind of shape the kit has, each painted the main marker, then one of second and one of its own colour. */
const EVERY_SHAPE = buildRecipe((m) => {
  const main = { color: GIFT_MARKERS.main }
  m.box(0.2, 0.2, 0.2, main)
  m.sphere(0.1, { ...main, at: [0.3, 0, 0] })
  m.cylinder(0.05, 0.08, 0.2, { ...main, at: [0.6, 0, 0] })
  m.cone(0.08, 0.2, { ...main, at: [0.9, 0, 0] })
  m.torus(0.1, 0.03, { ...main, at: [0, 0.4, 0] })
  m.capsule(0.05, 0.2, { ...main, at: [0.3, 0.4, 0] })
  m.lathe([[0.05, 0], [0.1, 0.1], [0.04, 0.2]], { ...main, at: [0.6, 0.4, 0] })
  m.extrude([[0, 0], [0.2, 0], [0.1, 0.2]], 0.05, { ...main, at: [0.9, 0.4, 0] })
  m.tube([[0, 0.8, 0], [0.2, 0.9, 0], [0.4, 0.8, 0]], 0.03, main)
  m.box(0.1, 0.1, 0.1, { color: GIFT_MARKERS.second, at: [0, -0.4, 0] })
  m.sphere(0.05, { color: '#123456', at: [0.3, -0.4, 0] })
  return {}
}, ['body']).recipe

const linear = (hex: string) => new Color(hex).toArray() as [number, number, number]

describe('the set of patterns', () => {
  it('has plain first and about five more, each numbered by its place', () => {
    expect(PATTERN_ORDER[0]).toBe(PLAIN)
    expect(PATTERN_ORDER).toEqual(['plain', 'stripes', 'spots', 'checks', 'zigzag', 'stars'])
    expect(PATTERN_ORDER.map(patternNumber)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it("draws the swatch's zigzag as the scene draws it on a model, a V: its band lowest at the tile's middle (the SVG's y points down)", () => {
    const points = ZIGZAG_BAND(PATTERN_LOOK.zigzag, PATTERN_LOOK.zigzagBand)
      .split(' ')
      .map((p) => p.split(',').map(Number) as [number, number])
    const top = points.slice(0, 3)
    expect(top.map(([x]) => x)).toEqual([0, 0.5, 1])
    expect(top[1]![1]).toBeGreaterThan(top[0]![1])
    expect(top[1]![1]).toBeGreaterThan(top[2]![1])
  })

  it('draws a name no longer in the set plain, and hair always plain', () => {
    expect(patternOf('stars')).toBe('stars')
    expect(patternOf('tartan')).toBe(PLAIN)
    expect(patternShown('head', { pattern: 'stripes' })).toBe('stripes')
    expect(patternShown('hand', { pattern: 'tartan' })).toBe(PLAIN)
    expect(patternShown('hair', { pattern: 'spots' })).toBe(PLAIN)
  })
})

describe('a worn model in its colours and pattern', () => {
  it('paints every main-marker vertex of every kind of shape the main colour and lays the pattern on it in the second; the rest carry none', () => {
    const w = { id: 'x', main: '#ff4d4d', second: '#ffd93d', pattern: 'checks' }
    const model = wornModelIn(EVERY_SHAPE, w, 'body')
    const g = model.parts.get(null)!.solid!
    const color = g.getAttribute('color')
    const pattern = g.getAttribute('pattern')
    expect(pattern.count).toBe(color.count)
    const seen = new Map<string, number>()
    for (let i = 0; i < color.count; i++) {
      const c = [color.getX(i), color.getY(i), color.getZ(i)].map((v) => v.toFixed(4)).join(',')
      const p = [pattern.getX(i), pattern.getY(i), pattern.getZ(i), pattern.getW(i)].map((v) => v.toFixed(4)).join(',')
      const key = `${c}|${p}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const key = (hex: string, p: number[]) => `${linear(hex).map((v) => v.toFixed(4)).join(',')}|${p.map((v) => v.toFixed(4)).join(',')}`
    const checks = patternNumber('checks')
    // Exactly three kinds of vertex: main with the pattern in the second colour, second with none, and the shape of its own colour with none.
    expect([...seen.keys()].sort()).toEqual([key(w.main, [...linear(w.second), checks]), key(w.second, [0, 0, 0, 0]), key('#123456', [0, 0, 0, 0])].sort())
    // Every one of the nine kinds of shape painted main is there, so most vertices carry the pattern.
    expect(seen.get(key(w.main, [...linear(w.second), checks]))!).toBeGreaterThan(seen.get(key(w.second, [0, 0, 0, 0]))! * 5)
  })

  it('carries no pattern for plain, a name no longer in the set, or hair', () => {
    for (const [pattern, slot] of [['plain', 'head'], ['tartan', 'head'], ['stars', 'hair']] as const) {
      const g = wornModelIn(EVERY_SHAPE, { id: 'x', main: '#ff4d4d', second: '#ffd93d', pattern }, slot).parts.get(null)!.solid!
      const p = g.getAttribute('pattern')
      for (let i = 0; i < p.count; i++) expect(p.getW(i)).toBe(0)
    }
  })

  it('is drawn in the one patterned material, in place of the lit one, so a pattern costs no draw call', () => {
    const view = wornView(wornModelIn(EVERY_SHAPE, { id: 'x', main: '#ff4d4d', second: '#ffd93d', pattern: 'spots' }, 'body'))
    expect(view.meshes.length).toBe(1)
    expect(view.meshes[0]!.material).toBe(PATTERNED)
    expect(PATTERNED).not.toBe(MODEL.solid)
  })
})

describe("the patterns' shader", () => {
  it("goes into three.js's lit shader and lays every pattern of the set", () => {
    const shader = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader }
    addPatterns(shader, 0.16)
    expect(shader.vertexShader).toMatch(/#include <begin_vertex>\s+vPattern = pattern;/)
    expect(shader.fragmentShader).toMatch(/#include <color_fragment>\s+if \(vPattern\.w > 0\.5\)/)
    for (const name of PATTERN_ORDER) expect(shader.fragmentShader).toContain(`#define PATTERN_${name.toUpperCase()} ${patternNumber(name)}.0`)
    for (const name of PATTERN_ORDER.slice(1)) expect(shader.fragmentShader).toContain(`abs(kind - PATTERN_${name.toUpperCase()}) < 0.5`)
  })

  it("lays its tiles as big as asked: a kid's a few centimetres, the room's shell half a metre, each its own program", () => {
    const shader = (period: number) => {
      const out = { vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader }
      addPatterns(out, period)
      return out.fragmentShader
    }
    expect(shader(0.16)).toContain('/ 0.1600;')
    expect(ROOM_PATTERN_PERIOD).toBe(0.5)
    expect(shader(ROOM_PATTERN_PERIOD)).toContain('/ 0.5000;')
    expect(ROOM_PATTERNED.customProgramCacheKey()).not.toBe(PATTERNED.customProgramCacheKey())
  })

  it('is an error, not a plain kid, when three.js no longer has the chunk it goes after', () => {
    expect(() => addPatterns({ vertexShader: 'void main() {}', fragmentShader: 'void main() {}' }, 0.16)).toThrow(/no longer has/)
  })
})
