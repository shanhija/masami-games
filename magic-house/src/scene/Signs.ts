/**
 * The words and numbers in the room, painted on canvases in the game's round font: the signs
 * (a white board facing the viewer, about SIZES.signHeight tall, with a number, words in the
 * page's language, a count as dots or a clock as a ring that empties), the pops rising from a
 * point and fading (w.pop), and the score badges over the players. Each canvas is painted again
 * only when what it shows changes (signLayout.ts layoutKey).
 */

import { CanvasTexture, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Sprite, SpriteMaterial } from 'three'

import { CAMERA_PITCH } from '../../../castle-builder/src/scene/look'
import { inLang, type Lang } from '../../../profiles/src/lang'
import { palette } from '../../../silly-billy/src/scene/look'
import { DEFAULTS, SIZES } from '../engine/api'
import type { Pop, Sign } from '../engine/world'
import { dotRow, layoutKey, numberText, RING_STEPS, ringStep, signLayout, type SignLayout } from './signLayout'

/** The page's round font, as the stylesheet names it. */
const FONT = '"Fredoka Variable", "Comic Sans MS", system-ui, sans-serif'
/** A sign's canvas is this many pixels tall. */
const SIGN_PX = 128

export const SIGN_LOOK = {
  board: '#ffffff',
  ink: palette.ink,
  dot: '#ffcf3a',
  hole: '#e3e7ee',
  ring: '#3d8bff',
  pop: '#ffffff',
} as const

/** Counts up once the font has come, so what was painted before it is painted again. */
let fontVersion = 0
if (typeof document !== 'undefined')
  void document.fonts.load(`600 64px ${FONT}`).then(() => {
    fontVersion++
  })

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** How wide a sign's canvas is for its layout, pixels. */
function signWidth(ctx: CanvasRenderingContext2D, l: SignLayout): number {
  const H = SIGN_PX
  switch (l.kind) {
    case 'text':
      ctx.font = `600 ${H * 0.56}px ${FONT}`
      return Math.max(H, Math.ceil(ctx.measureText(l.text).width + H * 0.5))
    case 'dots':
      return Math.ceil(l.of * H * 0.52 + H * 0.36)
    case 'ring':
      return H
  }
}

/** Paints a sign: the board with an ink border, and on it the text, the dots or the ring. */
function paintSign(canvas: HTMLCanvasElement, l: SignLayout) {
  const ctx = canvas.getContext('2d')!
  const H = SIGN_PX
  const W = signWidth(ctx, l)
  if (canvas.width !== W) canvas.width = W
  canvas.height = H
  ctx.clearRect(0, 0, W, H)
  const line = H * 0.06
  if (l.kind === 'ring') {
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, H / 2 - line / 2, 0, Math.PI * 2)
    ctx.fillStyle = SIGN_LOOK.board
    ctx.fill()
    ctx.lineWidth = line
    ctx.strokeStyle = SIGN_LOOK.ink
    ctx.stroke()
    const r = H * 0.3
    ctx.lineWidth = H * 0.16
    ctx.beginPath()
    ctx.arc(W / 2, H / 2, r, 0, Math.PI * 2)
    ctx.strokeStyle = SIGN_LOOK.hole
    ctx.stroke()
    const left = ringStep(l.left) / RING_STEPS
    if (left > 0) {
      // From the top, going round clockwise: the time still to go.
      ctx.beginPath()
      ctx.arc(W / 2, H / 2, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2)
      ctx.strokeStyle = SIGN_LOOK.ring
      ctx.lineCap = 'round'
      ctx.stroke()
      ctx.lineCap = 'butt'
    }
    return
  }
  roundRect(ctx, line / 2, line / 2, W - line, H - line, H * 0.26)
  ctx.fillStyle = SIGN_LOOK.board
  ctx.fill()
  ctx.lineWidth = line
  ctx.strokeStyle = SIGN_LOOK.ink
  ctx.stroke()
  if (l.kind === 'text') {
    ctx.font = `600 ${H * 0.56}px ${FONT}`
    ctx.fillStyle = SIGN_LOOK.ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(l.text, W / 2, H * 0.53)
    return
  }
  const pitch = H * 0.52
  for (const dot of dotRow(l.filled, l.of)) {
    ctx.beginPath()
    ctx.arc(W / 2 + dot.x * pitch, H / 2, H * 0.19, 0, Math.PI * 2)
    ctx.fillStyle = dot.filled ? SIGN_LOOK.dot : SIGN_LOOK.hole
    ctx.fill()
    ctx.lineWidth = line * 0.8
    ctx.strokeStyle = SIGN_LOOK.ink
    ctx.stroke()
  }
}

/** One plane a metre square, sized by each sign. */
const PLANE = new PlaneGeometry(1, 1)

/** A sign floating in the room: always square to the viewer and upright, even in a mover that turns. */
export class SignView {
  readonly mesh: Mesh
  private readonly canvas = document.createElement('canvas')
  private readonly texture: CanvasTexture
  private key = ''
  private painted = -1

  constructor() {
    this.texture = new CanvasTexture(this.canvas)
    this.texture.colorSpace = SRGBColorSpace
    this.texture.anisotropy = 4
    this.mesh = new Mesh(PLANE, new MeshBasicMaterial({ map: this.texture, transparent: true, side: DoubleSide, depthWrite: false, toneMapped: false }))
    this.mesh.renderOrder = 2
  }

  /** `across`: the room's box from left to right, which a sign not in a mover is kept inside (a wide count by the room's edge is moved in whole); null for a sign in a mover. `high`: seen from high up, where it is tipped back to face the camera (its mover turns round y). */
  update(sign: Sign, moverTurn: number, t: number, lang: Lang, across: readonly [number, number] | null, high: boolean) {
    this.mesh.visible = !sign.hidden
    if (sign.hidden) return
    const layout = signLayout(sign.what, t, lang)
    const key = layoutKey(layout)
    if (key !== this.key || this.painted !== fontVersion) {
      paintSign(this.canvas, layout)
      this.texture.dispose()
      this.texture.needsUpdate = true
      this.key = key
      this.painted = fontVersion
    }
    const h = SIZES.signHeight
    const w = (h * this.canvas.width) / this.canvas.height
    this.mesh.scale.set(w, h, 1)
    const x = across === null ? sign.at[0] : Math.min(Math.max(sign.at[0], across[0] + w / 2), Math.max(across[0] + w / 2, across[1] - w / 2))
    this.mesh.position.set(x, sign.at[1], sign.at[2])
    if (high) this.mesh.rotation.set(-CAMERA_PITCH, -moverTurn, 0, 'YXZ')
    else this.mesh.rotation.set(0, 0, -moverTurn)
  }

  dispose() {
    this.texture.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
  }
}

/** Text painted white with a thick ink edge, as the game writes over the room: a pop's, a badge's. */
function inkText(text: string, px: number, fill: string, disc: string | null): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!
  const font = `700 ${px}px ${FONT}`
  ctx.font = font
  const edge = px * 0.16
  const w = disc === null ? Math.ceil(ctx.measureText(text).width + edge * 2 + 4) : Math.ceil(Math.max(px * 1.5, ctx.measureText(text).width + px * 0.7))
  const h = disc === null ? Math.ceil(px * 1.3 + edge * 2) : Math.ceil(px * 1.5)
  canvas.width = w
  canvas.height = h
  ctx.font = font
  if (disc !== null) {
    roundRect(ctx, edge / 2, edge / 2, w - edge, h - edge, (h - edge) / 2)
    ctx.fillStyle = disc
    ctx.fill()
    ctx.lineWidth = edge
    ctx.strokeStyle = SIGN_LOOK.ink
    ctx.stroke()
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.lineWidth = edge * 2
  ctx.strokeStyle = SIGN_LOOK.ink
  ctx.strokeText(text, w / 2, h * 0.54)
  ctx.fillStyle = fill
  ctx.fillText(text, w / 2, h * 0.54)
  return canvas
}

/** Painted texts kept for the next time they are shown, by what they show and the font they were painted in. */
class TextTextures {
  private readonly made = new Map<string, { texture: CanvasTexture; aspect: number; version: number; used: number }>()
  private frame = 0

  get(key: string, paint: () => HTMLCanvasElement): { texture: CanvasTexture; aspect: number } {
    let t = this.made.get(key)
    if (t !== undefined && t.version !== fontVersion) {
      t.texture.dispose()
      t = undefined
    }
    if (t === undefined) {
      const canvas = paint()
      const texture = new CanvasTexture(canvas)
      texture.colorSpace = SRGBColorSpace
      t = { texture, aspect: canvas.width / canvas.height, version: fontVersion, used: 0 }
      this.made.set(key, t)
    }
    t.used = this.frame
    return t
  }

  /** Once a frame: lets go of what nobody showed for ten seconds. */
  sweep() {
    this.frame++
    if (this.frame % 120 !== 0) return
    for (const [key, t] of this.made)
      if (this.frame - t.used > 600) {
        t.texture.dispose()
        this.made.delete(key)
      }
  }

  dispose() {
    for (const t of this.made.values()) t.texture.dispose()
    this.made.clear()
  }
}

export const texts = new TextTextures()

/** A score badge's picture: the number on a disc of the seat's colour. */
export function badgeTexture(score: number, color: string, lang: Lang) {
  const text = numberText(score, lang)
  return texts.get(`badge|${color}|${text}`, () => inkText(text, 64, SIGN_LOOK.pop, color))
}

/** How big a pop is, metres tall, and how far it rises over its life. */
const POP = { height: 0.7, rise: 1.1 } as const

/** The pops: each rises from its point and fades within DEFAULTS.popSecs. */
export class PopLayer {
  readonly root = new Group()
  private readonly sprites: Sprite[] = []

  update(pops: readonly Pop[], t: number, lang: Lang) {
    let n = 0
    for (const pop of pops) {
      const age = t - pop.born
      if (age < 0 || age >= DEFAULTS.popSecs) continue
      const k = age / DEFAULTS.popSecs
      const text = typeof pop.what === 'number' ? (pop.what > 0 ? `+${numberText(pop.what, lang)}` : numberText(pop.what, lang)) : inLang(pop.what, lang)
      const { texture, aspect } = texts.get(`pop|${text}`, () => inkText(text, 72, SIGN_LOOK.pop, null))
      let s = this.sprites[n]
      if (s === undefined) {
        s = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }))
        s.renderOrder = 5
        this.sprites.push(s)
        this.root.add(s)
      }
      n++
      const mat = s.material
      if (mat.map !== texture) {
        mat.map = texture
        mat.needsUpdate = true
      }
      // Pops in big, rises quickly and then slower, fades over its second half.
      mat.opacity = Math.min(1, 2 * (1 - k))
      const grow = Math.min(1, age / 0.12) * POP.height
      s.scale.set(grow * aspect, grow, 1)
      s.position.set(pop.at[0], pop.at[1] + POP.rise * (1 - (1 - k) * (1 - k)), pop.at[2] + 0.5)
      s.visible = true
    }
    for (let i = n; i < this.sprites.length; i++) this.sprites[i]!.visible = false
  }

  dispose() {
    for (const s of this.sprites) s.material.dispose()
  }
}
