/**
 * The look drawn (step 7a, What the scene draws: the look): what the look's builder built
 * (engine/lookBuilder.ts buildLook, engine/look.ts LookBuilt) beside the World and never in it. The
 * scene only reads the World, so nothing drawn here can touch the play, the trial or the bots.
 *
 * - Into the room's still batch, at no draw call: the solids the look dresses (still.ts stillPieces
 *   draws each in its model, standing as the solid stands), its decor, and its wallpaper (the motif
 *   fitted into MOTIF.size and laid flat at each of engine/look.ts wallpaperSpots). From the side a
 *   piece wholly behind the play (z at most LOOK_PLACE.behind) is mixed LOOK_SHOWN.wash toward the
 *   walls' colour, so it never reads as a ledge. Dressed solids are the play's ledges and keep their
 *   colours.
 * - Its props: one live mesh (one draw call), every prop's shapes baked where it stands, its number
 *   and foot in the `propAt` attribute, and its glowing shapes marked (`propGlowing`) and drawn unlit
 *   as Silly Billy's glow material draws them. Each frame the CPU writes every prop's motion
 *   (propMotion) into a LOOK_SHOWN.slots by 2 float texture, which the vertex shader reads to lift,
 *   grow, squash, turn and lean it and the fragment shader to light it up.
 * - Its small lights: points of the room's one Shine (one THREE.Points call, beside the lamps' halos),
 *   each point its colour, size and phase, the twinkle in the shader from a time uniform. They light
 *   nothing round them and shine the more the dimmer the room.
 * - Its lamps join the room's (RoomView.updateLight).
 *
 * A prop reacts (PropMotion) when a player comes in front of it (from the side their box meets the
 * prop's outline as the fixed eye sees it on z = 0, engine/lookBuilder.ts outlineOnPlane; from high up
 * its footprint) or a tap lands on it (from the side the tap's point on z = 0 inside that outline;
 * from high up the line from the eye meets its shapes before anything of the play), at most once in
 * LOOK_SHOWN.again seconds, with its sound (shell/houseSounds.ts playProp, the props together at most
 * once in LOOK_SHOWN.soundGap) and its puff, which flies as the World's do (engine/effects.ts
 * flyPuffs) in a list of the scene's own beside the World's, one kind of the props' puffs in the air
 * at a time, so they add at most one draw call. It never takes the tap: the play hears every tap
 * exactly as without the look.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DataTexture,
  Float32BufferAttribute,
  FloatType,
  Group,
  Matrix4,
  Mesh,
  NearestFilter,
  Points,
  RGBAFormat,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

import type { Puff, Vec3 } from '../../../silly-billy/src/engine/types'
import { colorOf, MODEL } from '../../../silly-billy/src/scene/look'
import type { Model } from '../../../silly-billy/src/scene/recipeMesh'
import { DEFAULTS } from '../engine/api'
import { addPuff, flyPuffs } from '../engine/effects'
import { LOOK_PLACE, MOTIF, wallpaperSpots, type LookBuilt } from '../engine/look'
import { outlineOnPlane, pieceBox, type Box } from '../engine/lookBuilder'
import type { HouseSound } from '../engine/sounds'
import { playerHeight, playerWidth } from '../engine/state'
import type { HandleId, Player, RoomView, World } from '../engine/world'
import { modelGeometries, RoomModels } from './models'
import type { Piece } from './still'

/**
 * How the look is drawn:
 * - wash: how far a piece wholly behind the play is mixed toward the walls' colour;
 * - flat: how deep the wallpaper's motif is laid on its wall, metres;
 * - react: how long a prop's reaction lasts, seconds; again: the least seconds between two of one
 *   prop's (LOOK_BUILDER_REF.prop: at most once a second); soundGap: the least seconds between two
 *   props' sounds, all props together;
 * - slots: how many props the motion texture holds, at least LOOK_BUDGET.props;
 * - halo: how much wider a small light is drawn than its dot, for the glow round it;
 * - puffStep: the longest step the props' puffs fly in one frame, seconds, so a slow frame never
 *   flings one far;
 * - blinkOut: how much of a glowing shape's light goes out at the height of a blink.
 */
export const LOOK_SHOWN = { wash: 0.15, flat: 0.03, react: 0.6, again: 1, soundGap: 0.25, slots: 64, halo: 3, puffStep: 0.1, blinkOut: 0.85 } as const

/** The look's still piece in the room's batch: a piece no handle owns, so nothing ever takes it out (as still.ts SHELL_PIECE). */
export const LOOK_PIECE: HandleId = -2

/** A tap on the screen, CSS pixels from the top left, for the props to hear (RoomStage turns it into the room by the view it draws). */
export interface ScreenTap {
  readonly x: number
  readonly y: number
}

/** The look as the stage shows it: what the look built, the taps on the screen not yet tried on its props (the page pushes, the stage takes), and where a prop's sound goes. */
export interface StageLook {
  readonly built: LookBuilt
  readonly taps: ScreenTap[]
  readonly sound: (name: HouseSound) => void
}

// ------------------------------------------------------------------------------ how a prop moves

/**
 * A prop's motion at a moment, as the shader reads it: lifted, lit up, grown, turned round its pivot
 * (metres over its foot), spun round y, leaned round z, squashed (taller above 1, keeping its volume)
 * and blinked (0 to 1: its glowing shapes go out, since a shape that already glows cannot show
 * lighting up, while `glow` lights its lit shapes up).
 */
export interface Motion {
  lift: number
  glow: number
  scale: number
  pivot: number
  spin: number
  tilt: number
  squash: number
  blink: number
}

/** A prop as PropMotion knows it: what the look built, where a player or a tap reaches it (from the side its outline on z = 0 in x and y, from high up its footprint in x and z), and how tall it stands. */
export interface PropPlace {
  readonly prop: LookBuilt['props'][number]
  readonly reach: Box
  readonly height: number
}

/**
 * A prop's motion at t: its idle all the time (a phase of its own by its number `i`, so props do not
 * move together), with its reaction over it for LOOK_SHOWN.react seconds from `since`. Every
 * reaction starts and ends at rest, so nothing jumps. Swinging turns it round its top, as a thing that
 * hangs; everything else round its foot.
 */
export function propMotion(place: PropPlace, i: number, t: number, since: number): Motion {
  const { prop, height } = place
  const m: Motion = { lift: 0, glow: 0, scale: 1, pivot: prop.react === 'swing' ? height : 0, spin: 0, tilt: 0, squash: 1, blink: 0 }
  const phase = i * 2.39996
  switch (prop.idle) {
    case 'bob':
      m.lift += 0.04 * (1 + Math.sin(2.2 * t + phase))
      break
    case 'sway':
      m.tilt += 0.07 * Math.sin(1.6 * t + phase)
      break
    case 'spin':
      m.spin += 0.7 * t + phase
      break
    case 'pulse': {
      const k = 0.5 + 0.5 * Math.sin(3 * t + phase)
      m.scale *= 1 + 0.06 * k
      m.glow += 0.2 * k
      break
    }
    case null:
      break
  }
  const age = t - since
  if (age < 0 || age >= LOOK_SHOWN.react) return m
  const k = age / LOOK_SHOWN.react
  const fade = 1 - k
  switch (prop.react) {
    case 'wobble':
      m.tilt += 0.22 * Math.sin(k * 6 * Math.PI) * fade
      break
    case 'hop':
      m.lift += Math.min(0.5, Math.max(0.15, 0.3 * height)) * Math.sin(Math.PI * k)
      m.squash *= 1 + 0.12 * Math.sin(2 * Math.PI * k)
      break
    case 'spin':
      m.spin += 2 * Math.PI * (1 - fade * fade * fade)
      break
    case 'blink': {
      // Twice, both whole (each starts and ends at rest): the lit shapes light up, the glowing ones go out, and the whole prop grows a little, which reads on any colour.
      const flash = Math.max(0, Math.sin(k * 4 * Math.PI))
      m.glow += 0.9 * flash
      m.blink = flash
      m.scale *= 1 + 0.12 * flash
      break
    }
    case 'swing':
      m.tilt += 0.45 * Math.sin(k * 4 * Math.PI) * fade
      break
  }
  return m
}

/** What the props did in a frame: the sounds to play (at most one) and the puffs to fly, each from its prop's top. */
export interface Answered {
  sounds: HouseSound[]
  puffs: { at: Vec3; kind: NonNullable<LookBuilt['props'][number]['puff']> }[]
}

/**
 * When the props react, plain numbers on the game's clock (it stops while the game is paused): a prop
 * reacts when a player comes in front of it who was not in front of it the frame before, or when it
 * is tapped, and at most once in LOOK_SHOWN.again seconds; a player standing in front of it does not
 * set it off again. A reacting prop sounds only when no prop has in the last LOOK_SHOWN.soundGap.
 */
export class PropMotion {
  /** When each prop last began a reaction. */
  readonly since: number[]
  private readonly before: Set<number>[]
  private soundAt = -Infinity

  constructor(
    readonly places: readonly PropPlace[],
    private readonly view: RoomView,
  ) {
    this.since = places.map(() => -Infinity)
    this.before = places.map(() => new Set())
  }

  /** Is a player in front of the prop at `i` now: their box meets its reach. */
  private passing(i: number, p: Player): boolean {
    const r = this.places[i]!.reach
    const half = playerWidth(p) / 2
    if (this.view === 'high') return p.at[0] + half > r.min[0] && p.at[0] - half < r.max[0] && p.at[2] + half > r.min[2] && p.at[2] - half < r.max[2]
    return p.at[0] + half > r.min[0] && p.at[0] - half < r.max[0] && p.at[1] + playerHeight(p) > r.min[1] && p.at[1] < r.max[1]
  }

  /** One frame at t: the players where they are now, and the props tapped since the last frame. */
  step(t: number, players: readonly Player[], tapped: readonly number[]): Answered {
    const out: Answered = { sounds: [], puffs: [] }
    this.places.forEach((place, i) => {
      const now = new Set(players.filter((p) => this.passing(i, p)).map((p) => p.seat))
      const came = [...now].some((seat) => !this.before[i]!.has(seat))
      this.before[i] = now
      if (!came && !tapped.includes(i)) return
      if (t - this.since[i]! < LOOK_SHOWN.again) return
      this.since[i] = t
      const { prop } = place
      if (prop.sound !== null && t - this.soundAt >= LOOK_SHOWN.soundGap) {
        out.sounds.push(prop.sound)
        this.soundAt = t
      }
      if (prop.puff !== null) out.puffs.push({ at: [prop.at[0], prop.at[1] + place.height, prop.at[2]], kind: prop.puff })
    })
    return out
  }

  /** Every prop's motion at t into the texture's data: row 0 lift, glow, scale, pivot; row 1 spin, tilt, squash, blink. */
  write(t: number, data: Float32Array) {
    this.places.forEach((place, i) => {
      const m = propMotion(place, i, t, this.since[i]!)
      data.set([m.lift, m.glow, m.scale, m.pivot], i * 4)
      data.set([m.spin, m.tilt, m.squash, m.blink], (LOOK_SHOWN.slots + i) * 4)
    })
  }
}

// ------------------------------------------------------------------------------ the shaders

/** The source with `lines` put in after `chunk`; a chunk three.js no longer has is an error, never a prop silently still. */
function after(source: string, chunk: string, lines: string): string {
  if (!source.includes(chunk)) throw new Error(`the props' shader looks for ${chunk}, which three.js's shader no longer has`)
  return source.replace(chunk, `${chunk}\n${lines}`)
}

/** The source with `lines` put in before `chunk`, as `after` does. */
function before(source: string, chunk: string, lines: string): string {
  if (!source.includes(chunk)) throw new Error(`the props' shader looks for ${chunk}, which three.js's shader no longer has`)
  return source.replace(chunk, `${lines}\n${chunk}`)
}

const PROP_VERTEX_HEAD = /* glsl */ `
attribute vec4 propAt;
attribute float propGlowing;
uniform sampler2D propMotion;
varying float vPropGlow;
varying float vPropGlowing;
varying float vPropBlink;
vec4 propRow(int row) { return texelFetch(propMotion, ivec2(int(propAt.w + 0.5), row), 0); }
// Spun round y (+x toward -z), then leaned round z.
vec3 propTurn(vec3 p, vec4 b) {
  float cs = cos(b.x), ss = sin(b.x);
  p = vec3(cs * p.x + ss * p.z, p.y, -ss * p.x + cs * p.z);
  float ct = cos(b.y), st = sin(b.y);
  return vec3(ct * p.x - st * p.y, st * p.x + ct * p.y, p.z);
}
`
const PROP_VERTEX_BODY = /* glsl */ `
vec4 propA = propRow(0);
vec4 propB = propRow(1);
vec3 propPivot = propAt.xyz + vec3(0.0, propA.w, 0.0);
vec3 propP = (transformed - propPivot) * propA.z;
propP.y *= propB.z;
propP.xz *= inversesqrt(max(propB.z, 0.05));
transformed = propPivot + propTurn(propP, propB) + vec3(0.0, propA.x, 0.0);
vPropGlow = propA.y;
vPropGlowing = propGlowing;
vPropBlink = propB.w;
`
const PROP_NORMAL_BODY = /* glsl */ `
objectNormal = propTurn(objectNormal, propRow(1));
`

/**
 * Silly Billy's lit model material with the props' motion added to its shader, reading `motion`: one
 * shader program for the whole page. Its glowing shapes (propGlowing 1) are drawn as Silly Billy's
 * glow material draws them, their own colour unlit, so lit and glowing shapes share one draw call; a
 * reaction's glow lights the lit shapes up and brightens the glowing ones.
 */
function propMaterial(motion: DataTexture): Material {
  const m = MODEL.solid.clone()
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.propMotion = { value: motion }
    const vertex = after(after(shader.vertexShader, '#include <common>', PROP_VERTEX_HEAD), '#include <beginnormal_vertex>', PROP_NORMAL_BODY)
    shader.vertexShader = after(vertex, '#include <begin_vertex>', PROP_VERTEX_BODY)
    const fragment = after(after(shader.fragmentShader, '#include <common>', 'varying float vPropGlow;\nvarying float vPropGlowing;\nvarying float vPropBlink;'), '#include <emissivemap_fragment>', 'totalEmissiveRadiance += diffuseColor.rgb * vPropGlow * (1.0 - vPropGlowing);')
    shader.fragmentShader = before(fragment, '#include <opaque_fragment>', `outgoingLight = mix(outgoingLight, diffuseColor.rgb * (1.0 + vPropGlow) * (1.0 - ${LOOK_SHOWN.blinkOut.toFixed(2)} * vPropBlink), vPropGlowing);`)
  }
  m.customProgramCacheKey = () => 'magic-house-props'
  return m
}

/**
 * How a lamp's halo is drawn among the shine's points: LAMP_HALO pixels at a metre's distance for
 * each pixel of half the drawing buffer's height, as three.js's PointsMaterial sizes a point (what the
 * halos were drawn in before they joined the small lights' draw call), and the halo texture's soft
 * fall from the middle to the edge (halo.ts haloTexture): `middle` there, `ring` at `ringAt` of the
 * way out, nothing at the edge.
 */
const LAMP_HALO = { size: 2.4, middle: 0.9, ring: 0.35, ringAt: 0.4 } as const

const SHINE_VERTEX = /* glsl */ `
uniform float time;
uniform float pxPerMetre;
uniform float halfDrawn;
attribute vec3 tint;
attribute float size;
attribute float phase;
attribute float twinkle;
attribute float lamp;
varying vec3 vTint;
varying float vShine;
varying float vLamp;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = mix(${LOOK_SHOWN.halo.toFixed(1)} * size * pxPerMetre, ${LAMP_HALO.size.toFixed(1)} * halfDrawn, lamp) / -mv.z;
  float wave = 0.5 + 0.5 * sin(time * (1.1 + 0.8 * fract(phase * 7.31)) + phase * 6.2832);
  vShine = mix(1.0, 0.3 + 0.7 * wave, twinkle);
  vTint = tint;
  vLamp = lamp;
}
`
// A small light's dot is the middle third of the sprite (LOOK_SHOWN.halo), a soft glow round it to the sprite's edge, `strength` bright; a lamp's halo falls off as the halo texture does, its brightness in its tint, which is tone mapped as the lit room is (as three.js's PointsMaterial mapped it before the halos joined this call), so a halo sits in the room's light. The small lights are not: they shine out at their own strength.
const SHINE_FRAGMENT = /* glsl */ `
uniform float strength;
varying vec3 vTint;
varying float vShine;
varying float vLamp;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0 - smoothstep(${(0.8 / LOOK_SHOWN.halo).toFixed(3)}, ${(1.1 / LOOK_SHOWN.halo).toFixed(3)}, d);
  float glow = (1.0 - d) * (1.0 - d) * 0.5;
  float halo = d < ${LAMP_HALO.ringAt.toFixed(2)} ? mix(${LAMP_HALO.middle.toFixed(2)}, ${LAMP_HALO.ring.toFixed(2)}, d / ${LAMP_HALO.ringAt.toFixed(2)}) : mix(${LAMP_HALO.ring.toFixed(2)}, 0.0, (d - ${LAMP_HALO.ringAt.toFixed(2)}) / ${(1 - LAMP_HALO.ringAt).toFixed(2)});
  #ifdef TONE_MAPPING
  vec3 lampTint = toneMapping(vTint);
  #else
  vec3 lampTint = vTint;
  #endif
  gl_FragColor = vec4(mix(vTint * (core + glow) * strength * vShine, lampTint * halo, vLamp), 1.0);
  #include <colorspace_fragment>
}
`

const drawn = new Vector2()

/** A lamp's halo as the shine draws it: where it is, and its colour already as bright as it shines. */
export interface LampHalo {
  readonly at: Vec3
  readonly tint: Color
}

/**
 * What shines on its own as points, in one THREE.Points draw call (step 7a: the small lights cost one
 * call): the look's small lights, `strength` bright (RoomView.ts shineIn: the dimmer the room, the
 * brighter), each its colour, size and phase, twinkling in the shader on the game's clock; and after
 * them a halo round each lamp shown, at most `lamps` of them, set each frame (RoomView.updateLight).
 */
export class Shine {
  readonly points: Points<BufferGeometry, ShaderMaterial>
  private readonly lights: number

  constructor(lights: LookBuilt['lights'], strength: number, lamps: number) {
    this.lights = lights.length
    const g = new BufferGeometry()
    const c = new Color()
    const pad = (list: number[], each: number) => [...list, ...new Array<number>(lamps * each).fill(0)]
    g.setAttribute('position', new Float32BufferAttribute(pad(lights.flatMap((l) => l.at), 3), 3))
    g.setAttribute('tint', new Float32BufferAttribute(pad(lights.flatMap((l) => c.set(colorOf(l.color)).toArray()), 3), 3))
    g.setAttribute('size', new Float32BufferAttribute(pad(lights.map((l) => l.size), 1), 1))
    // A phase of its own for every light, so they twinkle apart (the golden ratio spreads them evenly).
    g.setAttribute('phase', new Float32BufferAttribute(pad([...lights.keys()].map((i) => (i * 0.618034) % 1), 1), 1))
    g.setAttribute('twinkle', new Float32BufferAttribute(pad(lights.map((l) => (l.twinkle ? 1 : 0)), 1), 1))
    g.setAttribute('lamp', new Float32BufferAttribute([...new Array<number>(lights.length).fill(0), ...new Array<number>(lamps).fill(1)], 1))
    g.setDrawRange(0, lights.length)
    const material = new ShaderMaterial({
      uniforms: { time: { value: 0 }, pxPerMetre: { value: 1 }, halfDrawn: { value: 1 }, strength: { value: strength } },
      vertexShader: SHINE_VERTEX,
      fragmentShader: SHINE_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      // Defines the renderer's tone mapping for the lamps' halos; the shader maps only them.
      toneMapped: true,
    })
    this.points = new Points(g, material)
    this.points.frustumCulled = false
    this.points.renderOrder = 3
    // A light's size is metres: pixels per metre at a metre's distance, from the camera's lens and the drawing buffer; a lamp's halo is sized by the drawing buffer's height alone.
    this.points.onBeforeRender = (...[renderer, , camera]: Parameters<Points['onBeforeRender']>) => {
      renderer.getDrawingBufferSize(drawn)
      material.uniforms.pxPerMetre!.value = (camera.projectionMatrix.elements[5]! * drawn.y) / 2
      material.uniforms.halfDrawn!.value = drawn.y / 2
    }
  }

  /** The lamps shown this frame, a halo round each (no more than the shine was made for). */
  setLamps(halos: readonly LampHalo[]) {
    const g = this.points.geometry
    const pos = g.getAttribute('position') as Float32BufferAttribute
    const tint = g.getAttribute('tint') as Float32BufferAttribute
    halos.forEach((h, i) => {
      pos.setXYZ(this.lights + i, h.at[0], h.at[1], h.at[2])
      tint.setXYZ(this.lights + i, h.tint.r, h.tint.g, h.tint.b)
    })
    g.setDrawRange(0, this.lights + halos.length)
    pos.needsUpdate = true
    tint.needsUpdate = true
  }

  /** The small lights twinkle on the game's clock. */
  update(t: number) {
    this.points.material.uniforms.time!.value = t
  }

  dispose() {
    this.points.geometry.dispose()
    this.points.material.dispose()
  }
}

// ------------------------------------------------------------------------------ the look as the scene draws it

const place = new Matrix4()
const part = new Matrix4()

/** Merges a list of geometries into one, or null for none. */
function joined(list: BufferGeometry[]): BufferGeometry | null {
  if (list.length <= 1) return list[0] ?? null
  const out = mergeGeometries(list)
  if (out === null) throw new Error("the look's pieces would not merge")
  for (const g of list) g.dispose()
  return out
}

/** Mixes every vertex colour of `g` `by` of the way toward `to`. */
function washed(g: BufferGeometry, to: Color, by: number): BufferGeometry {
  const color = g.getAttribute('color')
  for (let i = 0; i < color.count; i++) color.setXYZ(i, color.getX(i) + (to.r - color.getX(i)) * by, color.getY(i) + (to.g - color.getY(i)) * by, color.getZ(i) + (to.b - color.getZ(i)) * by)
  return g
}

/**
 * One room's look as the scene draws it, made with the room's RoomView and let go with it. Its root
 * holds the props' mesh pair and the small lights; its still piece (piece) goes into the room's batch,
 * and its dressings into the batch's solids (dressed).
 */
export class LookView {
  readonly root = new Group()
  /** Each dressed solid's model, by the solid's id, for the room's batch (still.ts stillPieces). */
  readonly dressed = new Map<HandleId, Model>()
  /** The look's lamps, with the room's in RoomView.updateLight. */
  readonly lamps: LookBuilt['lamps']
  /** The props' puffs, flying beside the World's: the stage draws both (RoomView.puffsWith). */
  readonly puffs: Pick<World, 't' | 'serial' | 'puffs'> = { t: 0, serial: 0, puffs: [] }
  readonly motion: PropMotion
  private readonly models: RoomModels
  private readonly texture: DataTexture
  /** All the props in one mesh, or null for a look with none. */
  private readonly propMesh: Mesh | null
  private readonly ray = new Raycaster()
  private tapped: number[] = []

  constructor(
    private readonly world: World,
    private readonly look: StageLook,
  ) {
    const built = look.built
    if (built.props.length > LOOK_SHOWN.slots) throw new Error(`the look has ${built.props.length} props and the scene draws at most ${LOOK_SHOWN.slots}`)
    this.models = new RoomModels(built.models)
    this.lamps = built.lamps
    for (const d of built.dressed) this.dressed.set(d.solid, this.models.get(d.model))
    // The props: each baked where it stands, its number and foot on every corner, its glowing shapes marked, and its place for passing and tapping.
    const high = world.view === 'high'
    const list: BufferGeometry[] = []
    const places = built.props.map((prop, i): PropPlace => {
      const model = this.models.get(prop.model)
      const box = pieceBox(model.recipe, prop.at, prop.scale, prop.turn)
      place.makeRotationY(prop.turn).scale(new Vector3(prop.scale, prop.scale, prop.scale)).setPosition(prop.at[0], prop.at[1], prop.at[2])
      const g = modelGeometries(model, place)
      for (const which of ['solid', 'glow'] as const) {
        const geometry = g[which]
        if (geometry === null) continue
        const n = geometry.getAttribute('position').count
        const at = new Float32Array(n * 4)
        for (let k = 0; k < n; k++) at.set([prop.at[0], prop.at[1], prop.at[2], i], k * 4)
        geometry.setAttribute('propAt', new Float32BufferAttribute(at, 4))
        geometry.setAttribute('propGlowing', new Float32BufferAttribute(new Float32Array(n).fill(which === 'glow' ? 1 : 0), 1))
        list.push(geometry)
      }
      return { prop, reach: high ? box : outlineOnPlane(box, 0), height: box.max[1] - prop.at[1] }
    })
    this.motion = new PropMotion(places, world.view)
    this.texture = new DataTexture(new Float32Array(LOOK_SHOWN.slots * 2 * 4), LOOK_SHOWN.slots, 2, RGBAFormat, FloatType)
    this.texture.magFilter = this.texture.minFilter = NearestFilter
    this.motion.write(0, this.texture.image.data as Float32Array)
    this.texture.needsUpdate = true
    const geometry = joined(list)
    this.propMesh = geometry === null ? null : new Mesh(geometry, propMaterial(this.texture))
    if (this.propMesh !== null) {
      // The shader moves the corners from where they were baked, so the mesh is never left out for being off the screen.
      this.propMesh.frustumCulled = false
      this.root.add(this.propMesh)
    }
  }

  /**
   * The look's still piece for the room's batch: its wallpaper and its decor, each as its model's lit
   * and glowing shapes in the room. From the side, what stands wholly behind the play is washed toward
   * the walls' colour.
   */
  piece(): Piece {
    const built = this.look.built
    const side = this.world.view === 'side'
    const walls = new Color(colorOf(this.world.shell.walls.color))
    const lists = { solid: [] as BufferGeometry[], glow: [] as BufferGeometry[] }
    const add = (model: Model, matrix: Matrix4, behind: boolean) => {
      const g = modelGeometries(model, matrix)
      if (g.solid !== null) lists.solid.push(side && behind ? washed(g.solid, walls, LOOK_SHOWN.wash) : g.solid)
      if (g.glow !== null) lists.glow.push(g.glow)
    }
    if (built.wallpaper !== null) {
      // The motif fitted into MOTIF.size across and up, its middle at each spot, and laid flat against its wall.
      const model = this.models.get(built.wallpaper)
      const b = model.recipe.bounds
      const [w, h, d] = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
      const k = MOTIF.size / Math.max(w, h, 1e-6)
      const flat = Math.min(k, LOOK_SHOWN.flat / Math.max(d, 1e-6))
      part.makeScale(k, k, flat).multiply(new Matrix4().makeTranslation(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -(b.min[2] + b.max[2]) / 2))
      for (const spot of wallpaperSpots(this.world.view)) add(model, place.makeRotationY(spot.turn).setPosition(spot.at[0], spot.at[1], spot.at[2]).multiply(part), true)
    }
    for (const d of built.decor) {
      const model = this.models.get(d.model)
      const box = pieceBox(model.recipe, d.at, d.scale, d.turn)
      add(model, place.makeRotationY(d.turn).scale(new Vector3(d.scale, d.scale, d.scale)).setPosition(d.at[0], d.at[1], d.at[2]), box.max[2] <= LOOK_PLACE.behind)
    }
    return { id: LOOK_PIECE, solid: joined(lists.solid), glow: joined(lists.glow) }
  }

  /** A tap from the side at its point on z = 0: every prop whose outline holds it reacts. */
  tapAt(at: Vec3) {
    this.motion.places.forEach((p, i) => {
      if (at[0] >= p.reach.min[0] && at[0] <= p.reach.max[0] && at[1] >= p.reach.min[1] && at[1] <= p.reach.max[1]) this.tapped.push(i)
    })
  }

  /** A tap from high up along the line from the eye: the prop it meets first reacts, when it meets it nearer than `near` (where it meets the play first, or Infinity). */
  tapRay(from: Vec3, way: Vec3, near: number) {
    this.ray.set(new Vector3(from[0], from[1], from[2]), new Vector3(way[0], way[1], way[2]).normalize())
    if (this.propMesh === null) return
    const hit = this.ray.intersectObject(this.propMesh, false)[0]
    if (hit === undefined || hit.distance > near || hit.face === null || hit.face === undefined) return
    this.tapped.push(Math.round((hit.object as Mesh).geometry.getAttribute('propAt').getW(hit.face.a)))
  }

  /** One frame: the props react to who passes and what was tapped, sound and puff, and move. */
  update(world: World, t: number) {
    const answered = this.motion.step(t, world.players, this.tapped)
    this.tapped = []
    for (const name of answered.sounds) this.look.sound(name)
    // The props' puffs fly as the World's do, by the game's clock since the last frame (none while it is paused), never more than LOOK_SHOWN.puffStep at once.
    const dt = Math.min(LOOK_SHOWN.puffStep, Math.max(0, t - this.puffs.t))
    this.puffs.t = t
    flyPuffs(this.puffs, dt)
    // One kind of the props' puffs in the air at a time (Silly Billy's Effects draws each kind in flight with a call of its own): a puff of another kind is left out while one flies.
    for (const p of answered.puffs) if (this.puffs.puffs.every((q) => q.kind === p.kind)) addPuff(this.puffs, p.at, p.kind, null, DEFAULTS.puffCount, DEFAULTS.puffSize)
    if (this.propMesh !== null) {
      this.motion.write(t, this.texture.image.data as Float32Array)
      this.texture.needsUpdate = true
    }
  }

  dispose() {
    this.propMesh?.geometry.dispose()
    ;(this.propMesh?.material as Material | undefined)?.dispose()
    this.texture.dispose()
    this.models.dispose()
  }
}

/** The puffs the stage draws: the World's, then the props' while there is room under Silly Billy's cap (`cap`), so no kind's mesh is ever over full. */
export function puffsWith(world: readonly Puff[], props: readonly Puff[], cap: number): readonly Puff[] {
  if (props.length === 0) return world
  return [...world, ...props.slice(Math.max(0, props.length - Math.max(0, cap - world.length)))]
}
