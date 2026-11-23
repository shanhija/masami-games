/**
 * How the scene draws a worn thing in its wearer's colours and pattern (plan.md, The look, people
 * and presents: what a present paints c.main carries the wearer's pattern).
 *
 * A worn model is built once per thing, colours, pattern and slot, as Silly Billy builds every model
 * (scene/recipeMesh.ts buildModel: each part's shapes merged into one geometry, painted per vertex),
 * and then every vertex of a shape painted the main marker takes the wearer's main colour and
 * carries the pattern, as a `pattern` attribute: the second colour and the pattern's number in the
 * set. One shared material, Silly Billy's lit model material with the patterns added to its shader,
 * lays the pattern where a vertex carries one and draws every other vertex exactly as Silly Billy's
 * own. So a pattern costs no draw call: a worn thing's meshes are the ones it had, with this
 * material in place of the lit one (one more shader program for the whole page).
 *
 * The pattern is worked out in the shader from where the point is on the model (its own frame, so
 * it moves and grows with the kid) on the plane the surface faces most: front and back from the
 * side, the top from high up. On a round shape the plane changes where the surface turns, which
 * shows as a seam in the pattern; on a toy's low-poly shapes it reads as part of the pattern.
 */

import { Color, Float32BufferAttribute, type BufferGeometry, type MeshStandardMaterial, type WebGLProgramParametersWithUniforms } from 'three'

import type { Recipe, Slot } from '../../../silly-billy/src/engine/types'
import { MODEL } from '../../../silly-billy/src/scene/look'
import { AS_BUILT, buildModel, ModelView, type Model } from '../../../silly-billy/src/scene/recipeMesh'
import { GIFT_MARKERS } from '../engine/gift'
import type { Wearing } from '../saves'
import { inColours } from '../scene/dress'
import { PATTERN_LOOK, PATTERN_ORDER, patternShown, type PatternName } from './patterns'

/** A pattern's number in the shader: its place in the set, plain 0. */
export const patternNumber = (name: PatternName) => PATTERN_ORDER.indexOf(name)

/** The shader's own lines: what each vertex hands on, and how each pattern of the set is laid. */
const VERTEX_HEAD = /* glsl */ `
attribute vec4 pattern;
varying vec4 vPattern;
varying vec3 vPatternAt;
varying vec3 vPatternFacing;
`
const VERTEX_BODY = /* glsl */ `
vPattern = pattern;
vPatternAt = position;
vPatternFacing = normal;
`

const f = (n: number) => n.toFixed(4)
/** The fragment shader's own lines, the tiles `period` metres square. */
const fragmentHead = (period: number) => /* glsl */ `
varying vec4 vPattern;
varying vec3 vPatternAt;
varying vec3 vPatternFacing;
${PATTERN_ORDER.map((name, i) => `#define PATTERN_${name.toUpperCase()} ${i}.0`).join('\n')}

// 1 inside a band filling the first 'fill' of every unit of x, 0 outside, softened over 'aa' units.
float patternBand(float x, float fill, float aa) {
  float u = fract(x);
  float d = max(fill * 0.5 - abs(u - fill * 0.5), fill * 0.5 - abs(u - 1.0 - fill * 0.5));
  return clamp(d / aa + 0.5, 0.0, 1.0);
}

// Inigo Quilez's five-pointed star: the distance to its edge, negative inside.
float patternStar(vec2 p, float r, float rf) {
  const vec2 k1 = vec2(0.809016994375, -0.587785252292);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

// How much of the second colour covers this point, 0 to 1, for the pattern numbered 'kind'.
float patternCover(float kind, vec3 at, vec3 facing) {
  vec3 a = abs(facing);
  vec2 uv = (a.x > a.y && a.x > a.z ? at.zy : a.y > a.z ? at.xz : at.xy) / ${f(period)};
  vec2 w = fwidth(uv);
  float aa = max(max(w.x, w.y), 1e-4);
  // Dots and stars sit on tiles, every other line of them shifted half a tile.
  vec2 tile = fract(vec2(uv.x + 0.5 * mod(floor(uv.y), 2.0), uv.y)) - 0.5;
  if (abs(kind - PATTERN_STRIPES) < 0.5) return patternBand(uv.y, ${f(PATTERN_LOOK.stripe)}, aa);
  if (abs(kind - PATTERN_SPOTS) < 0.5) return clamp((${f(PATTERN_LOOK.spot)} - length(tile)) / aa + 0.5, 0.0, 1.0);
  if (abs(kind - PATTERN_CHECKS) < 0.5) {
    float x = patternBand(uv.x, 0.5, aa);
    float y = patternBand(uv.y, 0.5, aa);
    return x + y - 2.0 * x * y;
  }
  if (abs(kind - PATTERN_ZIGZAG) < 0.5) return patternBand(uv.y + ${f(2 * PATTERN_LOOK.zigzag)} * abs(fract(uv.x) - 0.5), ${f(PATTERN_LOOK.zigzagBand)}, aa);
  if (abs(kind - PATTERN_STARS) < 0.5) return clamp(-patternStar(tile, ${f(PATTERN_LOOK.star)}, ${f(PATTERN_LOOK.starInner)}) / aa + 0.5, 0.0, 1.0);
  return 0.0;
}
`
const FRAGMENT_BODY = /* glsl */ `
if (vPattern.w > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vPattern.rgb, patternCover(vPattern.w, vPatternAt, normalize(vPatternFacing)));
`

/** The source with `lines` put in after `chunk`; a chunk three.js no longer has is an error, never a pattern silently gone. */
function after(source: string, chunk: string, lines: string): string {
  if (!source.includes(chunk)) throw new Error(`the patterns' shader looks for ${chunk}, which three.js's shader no longer has`)
  return source.replace(chunk, `${chunk}\n${lines}`)
}

/** Adds the patterns to a lit model shader, their tiles `period` metres square: what the vertex hands on, and the pattern laid on the colour. Exported for the test. */
export function addPatterns(shader: Pick<WebGLProgramParametersWithUniforms, 'vertexShader' | 'fragmentShader'>, period: number) {
  shader.vertexShader = after(after(shader.vertexShader, '#include <common>', VERTEX_HEAD), '#include <begin_vertex>', VERTEX_BODY)
  shader.fragmentShader = after(after(shader.fragmentShader, '#include <common>', fragmentHead(period)), '#include <color_fragment>', FRAGMENT_BODY)
}

/** Silly Billy's lit model material with the patterns laid in tiles `period` metres square: one shader program for each period. */
function patternedMaterial(period: number): MeshStandardMaterial {
  const m = MODEL.solid.clone()
  m.onBeforeCompile = (shader) => addPatterns(shader, period)
  m.customProgramCacheKey = () => `magic-house-patterns-${period}`
  return m
}

/** How big a tile of the room's own patterns is, metres: the shell's walls, floor and ceiling and the house round it (scene/shell.ts) are seen from far, so a stripe is a quarter of a metre. */
export const ROOM_PATTERN_PERIOD = 0.5

/** Every worn thing's lit meshes draw in it, the tiles PATTERN_LOOK.period square on the model. */
export const PATTERNED = patternedMaterial(PATTERN_LOOK.period)
/** The still batch's lit mesh draws in it (scene/still.ts): the shell's paint carries its pattern, every other vertex none, its tiles in the room's own metres. */
export const ROOM_PATTERNED = patternedMaterial(ROOM_PATTERN_PERIOD)

const marker = new Color(GIFT_MARKERS.main)
const near = (a: number, b: number) => Math.abs(a - b) < 1e-4

/** Every vertex painted the main marker in the wearer's main colour, carrying the pattern (number `kind`, plain 0) in the second colour; every other vertex as it was, carrying none. Lit geometry gets the `pattern` attribute always, as the material reads it. */
function paintMain(g: BufferGeometry, main: Color, second: Color, kind: number, lit: boolean) {
  const color = g.getAttribute('color')
  const pattern = new Float32Array(color.count * 4)
  for (let i = 0; i < color.count; i++) {
    if (!near(color.getX(i), marker.r) || !near(color.getY(i), marker.g) || !near(color.getZ(i), marker.b)) continue
    color.setXYZ(i, main.r, main.g, main.b)
    pattern.set([second.r, second.g, second.b, kind], i * 4)
  }
  if (lit) g.setAttribute('pattern', new Float32BufferAttribute(pattern, 4))
}

/** A worn thing's model, built from its model in the marker colours: painted the wearer's colours, what is painted main carrying the pattern shown in that slot (patterns.ts patternShown). */
export function wornModelIn(recipe: Recipe, w: Wearing, slot: Slot): Model {
  // The second colour by the recipe, as everywhere else; the main marker kept until every vertex of it is found.
  const model = buildModel(inColours(recipe, { main: GIFT_MARKERS.main, second: w.second }), false, null, null)
  const main = new Color(w.main)
  const second = new Color(w.second)
  const kind = patternNumber(patternShown(slot, w))
  for (const part of model.parts.values()) {
    if (part.solid !== null) paintMain(part.solid, main, second, kind, true)
    if (part.glow !== null) paintMain(part.glow, main, second, kind, false)
  }
  return model
}

/** One drawn copy of a worn model, at rest as built, its lit meshes in the patterned material. */
export function wornView(model: Model): ModelView {
  const view = new ModelView(model)
  view.pose({}, AS_BUILT)
  for (const mesh of view.meshes) if (mesh.material === MODEL.solid) mesh.material = PATTERNED
  return view
}
