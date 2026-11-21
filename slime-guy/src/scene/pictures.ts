/**
 * The few things in a run that are painted rather than built: the animals on the
 * measuring pole, the slime faces on the checkpoint flags, the moon, the start line's
 * checks, the bands along the track's top and a soft round glow. Each is painted once on
 * a canvas, on first use, and kept.
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

import { ANIMALS } from '../game/model'
import { palette, type Theme } from './look'
import { cached, once } from './shapes'

type Pen = CanvasRenderingContext2D

function paint(w: number, h: number, draw: (g: Pen) => void) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')
  if (g === null) throw new Error('this browser gives no 2D canvas')
  draw(g)
  const t = new CanvasTexture(c)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}



function ellipse(g: Pen, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) {
  g.beginPath()
  g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
  g.fillStyle = fill
  g.fill()
}

function roundRect(g: Pen, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** Two shiny cartoon eyes. */
function eyes(g: Pen, lx: number, rx: number, y: number, r: number) {
  for (const x of [lx, rx]) {
    ellipse(g, x, y, r, r * 1.2, palette.ink)
    ellipse(g, x + r * 0.35, y - r * 0.45, r * 0.38, r * 0.38, palette.white)
  }
}

function blush(g: Pen, lx: number, rx: number, y: number, r: number) {
  for (const x of [lx, rx]) ellipse(g, x, y, r, r * 0.7, 'rgba(255, 130, 170, 0.55)')
}

function whiskers(g: Pen, cx: number, y: number, gap: number, len: number) {
  g.strokeStyle = 'rgba(43, 33, 64, 0.75)'
  g.lineWidth = 3
  g.lineCap = 'round'
  for (const s of [-1, 1]) {
    for (const dy of [-6, 6]) {
      g.beginPath()
      g.moveTo(cx + s * gap, y + dy * 0.4)
      g.lineTo(cx + s * (gap + len), y + dy * 1.6)
      g.stroke()
    }
  }
}

function smile(g: Pen, x: number, y: number, w: number, lift: number) {
  g.strokeStyle = palette.ink
  g.lineWidth = 4
  g.lineCap = 'round'
  g.beginPath()
  g.moveTo(x - w, y)
  g.quadraticCurveTo(x, y + lift, x + w, y)
  g.stroke()
}

/** The card behind each animal, in its own soft colour. */
const CARD_BG = ['#e9e3ff', '#ffe6c8', '#d4eeff', '#ffe0f0', '#dcf5d4'] as const

/** One cartoon animal face on its card (index into ANIMALS), 256 by 192, the way a child would recognise it at a glance. */
export const animalPicture = cached((i: number) => {
  if (i < 0 || i >= ANIMALS.length) throw new Error(`no animal ${i}`)
  return paint(256, 192, (g) => {
    roundRect(g, 4, 4, 248, 184, 34)
    g.fillStyle = CARD_BG[i]!
    g.fill()
    g.lineWidth = 6
    g.strokeStyle = 'rgba(255, 255, 255, 0.9)'
    g.stroke()
    switch (ANIMALS[i]!) {
      case 'mouse': {
        for (const x of [72, 184]) {
          ellipse(g, x, 60, 40, 40, '#a8acbe')
          ellipse(g, x, 60, 25, 25, '#ffb6c8')
        }
        ellipse(g, 128, 116, 66, 58, '#babecd')
        blush(g, 86, 170, 134, 13)
        eyes(g, 104, 152, 104, 11)
        whiskers(g, 128, 134, 20, 44)
        ellipse(g, 128, 128, 11, 9, '#ff86ab')
        smile(g, 128, 146, 10, 7)
        break
      }
      case 'cat': {
        for (const s of [-1, 1]) {
          g.beginPath()
          g.moveTo(128 + s * 64, 96)
          g.lineTo(128 + s * 52, 26)
          g.lineTo(128 + s * 8, 62)
          g.closePath()
          g.fillStyle = '#ff9a3c'
          g.fill()
          g.beginPath()
          g.moveTo(128 + s * 54, 84)
          g.lineTo(128 + s * 48, 44)
          g.lineTo(128 + s * 22, 66)
          g.closePath()
          g.fillStyle = '#ffc0cf'
          g.fill()
        }
        ellipse(g, 128, 120, 70, 60, '#ffad5c')
        g.strokeStyle = '#e8822c'
        g.lineWidth = 7
        g.lineCap = 'round'
        for (const x of [112, 128, 144]) {
          g.beginPath()
          g.moveTo(x, 66)
          g.lineTo(x, 82)
          g.stroke()
        }
        blush(g, 84, 172, 136, 13)
        eyes(g, 102, 154, 112, 12)
        whiskers(g, 128, 138, 22, 52)
        g.beginPath()
        g.moveTo(119, 128)
        g.lineTo(137, 128)
        g.lineTo(128, 138)
        g.closePath()
        g.fillStyle = '#ff7fa0'
        g.fill()
        g.strokeStyle = palette.ink
        g.lineWidth = 4
        g.beginPath()
        g.moveTo(112, 146)
        g.quadraticCurveTo(120, 156, 128, 144)
        g.quadraticCurveTo(136, 156, 144, 146)
        g.stroke()
        break
      }
      case 'dog': {
        ellipse(g, 64, 112, 26, 54, '#8a5a34', 0.35)
        ellipse(g, 192, 112, 26, 54, '#8a5a34', -0.35)
        ellipse(g, 128, 110, 64, 62, '#dca46a')
        ellipse(g, 152, 98, 24, 22, '#b77d45')
        ellipse(g, 128, 168, 12, 15, '#ff7f9a')
        ellipse(g, 128, 144, 40, 30, '#f7dfbf')
        eyes(g, 104, 152, 98, 10)
        ellipse(g, 128, 128, 17, 12, palette.ink)
        ellipse(g, 123, 124, 5, 3, 'rgba(255, 255, 255, 0.8)')
        g.strokeStyle = palette.ink
        g.lineWidth = 4
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(128, 139)
        g.lineTo(128, 150)
        g.moveTo(110, 150)
        g.quadraticCurveTo(128, 162, 146, 150)
        g.stroke()
        break
      }
      case 'pony': {
        for (const s of [-1, 1]) {
          ellipse(g, 128 + s * 40, 46, 13, 26, '#e3b98a', s * 0.35)
          ellipse(g, 128 + s * 40, 50, 6, 15, '#ffc4d4', s * 0.35)
        }
        ellipse(g, 176, 100, 17, 44, '#9a6ff0', -0.25)
        ellipse(g, 128, 112, 52, 70, '#f2d2a9')
        ellipse(g, 128, 98, 9, 26, '#fffaf2')
        for (const [x, y, r] of [
          [108, 52, 18],
          [128, 44, 21],
          [148, 52, 18],
          [118, 64, 14],
          [140, 64, 14],
        ] as const)
          ellipse(g, x, y, r, r, '#b38bff')
        ellipse(g, 128, 158, 40, 27, '#ffe7cf')
        ellipse(g, 115, 158, 5, 7, '#c27c5c')
        ellipse(g, 141, 158, 5, 7, '#c27c5c')
        eyes(g, 104, 152, 106, 11)
        g.strokeStyle = palette.ink
        g.lineWidth = 3
        g.lineCap = 'round'
        for (const s of [-1, 1]) {
          const x = 128 + s * 24
          for (const k of [-1, 0, 1]) {
            g.beginPath()
            g.moveTo(x + k * 6, 92)
            g.lineTo(x + k * 9 + s * 2, 84)
            g.stroke()
          }
        }
        smile(g, 128, 172, 12, 6)
        break
      }
      case 'elephant': {
        for (const s of [-1, 1]) {
          ellipse(g, 128 + s * 70, 104, 46, 58, '#8ea5cf')
          ellipse(g, 128 + s * 66, 106, 29, 40, '#ffc6d8')
        }
        ellipse(g, 128, 100, 56, 54, '#a4b9df')
        g.strokeStyle = '#a4b9df'
        g.lineWidth = 28
        g.lineCap = 'round'
        g.beginPath()
        g.moveTo(128, 124)
        g.quadraticCurveTo(126, 168, 150, 174)
        g.stroke()
        g.strokeStyle = '#8ea5cf'
        g.lineWidth = 3
        for (const y of [142, 154]) {
          g.beginPath()
          g.moveTo(117, y)
          g.lineTo(137, y + 2)
          g.stroke()
        }
        for (const s of [-1, 1]) ellipse(g, 128 + s * 26, 134, 6, 12, '#fffaf0', s * -0.5)
        blush(g, 90, 166, 116, 11)
        eyes(g, 108, 148, 92, 10)
        break
      }
    }
  })
})

/** A checkpoint flag's cloth: a slime face on the island's colour, asleep before the slime gets there and cheering after. */
export function flagPicture(cloth: string, mood: 'asleep' | 'cheer') {
  return flagPictures(`${cloth}|${mood}`)
}
const flagPictures = cached((key: string) => {
  const [cloth, mood] = key.split('|') as [string, 'asleep' | 'cheer']
  return paint(160, 112, (g) => {
    g.fillStyle = cloth
    g.fillRect(0, 0, 160, 112)
    g.fillStyle = 'rgba(255, 255, 255, 0.35)'
    g.fillRect(0, 0, 160, 10)
    g.fillRect(0, 102, 160, 10)
    const body = mood === 'cheer' ? '#7fe07a' : '#bfe8bb'
    ellipse(g, 80, 80, 44, 16, body)
    ellipse(g, 80, 62, 38, 34, body)
    ellipse(g, 66, 46, 11, 7, 'rgba(255, 255, 255, 0.75)', -0.4)
    if (mood === 'cheer') {
      for (const x of [66, 94]) {
        ellipse(g, x, 54, 11, 12, palette.white)
        ellipse(g, x + 1, 56, 6, 7, palette.ink)
      }
      g.beginPath()
      g.arc(80, 70, 10, 0, Math.PI)
      g.closePath()
      g.fillStyle = '#7a2a3a'
      g.fill()
    } else {
      g.strokeStyle = palette.ink
      g.lineWidth = 4
      g.lineCap = 'round'
      for (const x of [66, 94]) {
        g.beginPath()
        g.arc(x, 54, 7, 0.15 * Math.PI, 0.85 * Math.PI)
        g.stroke()
      }
      smile(g, 80, 72, 6, 4)
    }
  })
})

/** The moon: a pale disc with soft craters. */
export const moonPicture = once(() =>
  paint(128, 128, (g) => {
    const grad = g.createRadialGradient(56, 54, 10, 64, 64, 62)
    grad.addColorStop(0, '#fffbe6')
    grad.addColorStop(1, '#f7e9b0')
    g.beginPath()
    g.arc(64, 64, 62, 0, Math.PI * 2)
    g.fillStyle = grad
    g.fill()
    for (const [x, y, r] of [
      [44, 46, 12],
      [82, 70, 16],
      [56, 88, 8],
      [86, 36, 7],
      [36, 74, 6],
    ] as const)
      ellipse(g, x, y, r, r, 'rgba(214, 196, 140, 0.45)')
  }),
)

/** The sun: a warm round disc, paler in the middle. */
export const sunPicture = once(() =>
  paint(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 60)
    grad.addColorStop(0, '#fffdf2')
    grad.addColorStop(0.7, '#fff3c4')
    grad.addColorStop(1, '#ffe48a')
    g.beginPath()
    g.arc(64, 64, 60, 0, Math.PI * 2)
    g.fillStyle = grad
    g.fill()
  }),
)

/** The start line's checks: two rows of white and ink squares. */
export const startPicture = once(() =>
  paint(192, 32, (g) => {
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (i + j) % 2 === 0 ? palette.white : palette.ink
        g.fillRect(i * 16, j * 16, 16, 16)
      }
  }),
)

/** The track's top: two bands of the island's two top colours, repeating along the course. */
export const bandPicture = cached((theme: Theme) => {
  const t = paint(4, 64, (g) => {
    g.fillStyle = theme.top
    g.fillRect(0, 0, 4, 32)
    g.fillStyle = theme.topAlt
    g.fillRect(0, 32, 4, 32)
  })
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  return t
})

/** A soft white glow, bright in the middle and gone at the edge, for halos round lit things. */
export const glowPicture = once(() =>
  paint(64, 64, (g) => {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)')
    grad.addColorStop(0.35, 'rgba(255, 255, 255, 0.55)')
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
  }),
)
