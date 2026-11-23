/**
 * A soft round light, bright in the middle and clear at its edge: round a lamp, a glowing player
 * and the way out while it waits. Added to what is behind it, so it shines in the dark and only
 * warms the colours by day.
 */

import { AdditiveBlending, CanvasTexture, Sprite, SpriteMaterial } from 'three'

import { colorOf } from '../../../silly-billy/src/scene/look'

let made: CanvasTexture | null = null

export function haloTexture(): CanvasTexture {
  if (made !== null) return made
  const n = 64
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = n
  const g = canvas.getContext('2d')!
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, n, n)
  made = new CanvasTexture(canvas)
  return made
}

/** A halo of its own: its colour, size and brightness are set each frame. */
export function haloSprite(color: string): Sprite {
  const s = new Sprite(new SpriteMaterial({ map: haloTexture(), color: colorOf(color), blending: AdditiveBlending, depthWrite: false, transparent: true }))
  s.renderOrder = 3
  return s
}
