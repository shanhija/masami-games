import { rect } from '../game/layout'
import { GOODS, type Good, type Material } from '../game/model'
import { BOX, C, MATERIAL_LOOK, RAW_LOOK, TAU, box, circlePath, detail, ink, lw, part, phaseOf, shine, sparkle, tube, type SheetEntry } from './look'

/**
 * One pictogram per good, the same everywhere (the road, the bed, the heaps and stacks, the
 * flights, the HUD): raw goods are lumps with a soft outline and no faces, made goods are
 * blocks with a lit top and a dark right face, so a child sees what a machine did. About
 * 0.5 m, origin at its bottom centre, inside a 0.6 m square. Each is inked at the line
 * weight, with its identifying marks (log rings, brick courses, tie holes, glints, stripes)
 * kept at every size, and the finer ones (grain, bark, stitches) only from M detail.
 */

/** A made block's front face (w x h) and how far its top and right faces recede: drawStack lays them in rows by these. */
export const BLOCK: Record<Material, { w: number; h: number }> = {
  planks: { w: 0.42, h: 0.33 },
  bricks: { w: 0.4, h: 0.33 },
  concrete: { w: 0.42, h: 0.27 },
  glass: { w: 0.38, h: 0.36 },
  rainbow: { w: 0.4, h: 0.36 },
}
export const BLOCK_DEPTH = 0.1

/** The gem's crystals: [x, base width, height, tilt] for the far small ones and the big one in front, and their colours from RAW_LOOK.gem. */
const CRYSTALS = [
  [-0.13, 0.13, 0.27, -0.32, 'dark'],
  [0.13, 0.12, 0.23, 0.36, 'light'],
  [0.0, 0.19, 0.46, 0, 'body'],
] as const

export function drawGood(ctx: CanvasRenderingContext2D, good: Good, t: number): void {
  const fine = detail(0.5) !== 'S'
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (good === 'planks' || good === 'bricks' || good === 'concrete' || good === 'glass' || good === 'rainbow') {
    drawBlock(ctx, good, fine, t)
    ctx.restore()
    return
  }
  const raw = RAW_LOOK[good]
  switch (good) {
    case 'log': {
      // Lying on its side, the cut end facing right with its rings, a sprig on top.
      ctx.beginPath()
      ctx.moveTo(-0.17, -0.31)
      ctx.lineTo(0.2, -0.31)
      ctx.lineTo(0.2, -0.01)
      ctx.lineTo(-0.17, -0.01)
      ctx.bezierCurveTo(-0.217, -0.01, -0.255, -0.077, -0.255, -0.16)
      ctx.bezierCurveTo(-0.255, -0.243, -0.217, -0.31, -0.17, -0.31)
      ctx.closePath()
      part(ctx, raw.body, 'line')
      if (fine) {
        ctx.beginPath()
        ctx.moveTo(-0.14, -0.24)
        ctx.quadraticCurveTo(-0.02, -0.21, 0.08, -0.25)
        ctx.moveTo(-0.08, -0.09)
        ctx.quadraticCurveTo(0.02, -0.06, 0.12, -0.1)
        ink(ctx, 'detail')
      }
      ctx.beginPath()
      ctx.ellipse(0.2, -0.16, 0.085, 0.15, 0, 0, TAU)
      part(ctx, raw.light, 'line')
      ctx.beginPath()
      ctx.ellipse(0.2, -0.16, 0.055, 0.1, 0, 0, TAU)
      ctx.moveTo(0.222, -0.16)
      ctx.ellipse(0.2, -0.16, 0.022, 0.042, 0, 0, TAU)
      ctx.lineWidth = lw('detail')
      ctx.strokeStyle = raw.dark
      ctx.stroke()
      // The sprig: a stub of a branch with one leaf.
      ctx.beginPath()
      ctx.moveTo(-0.04, -0.3)
      ctx.lineTo(-0.07, -0.4)
      tube(ctx, 0.035, raw.body)
      ctx.beginPath()
      ctx.moveTo(-0.07, -0.4)
      ctx.quadraticCurveTo(-0.0, -0.5, 0.07, -0.44)
      ctx.quadraticCurveTo(0.0, -0.37, -0.07, -0.4)
      ctx.closePath()
      part(ctx, BOX.grass.face, 'line')
      break
    }
    case 'clay': {
      // A soft lump with a pinched top and two thumb dents.
      ctx.beginPath()
      ctx.moveTo(-0.23, 0)
      ctx.bezierCurveTo(-0.27, -0.16, -0.17, -0.3, -0.06, -0.31)
      ctx.quadraticCurveTo(-0.02, -0.4, 0.04, -0.36)
      ctx.bezierCurveTo(0.17, -0.34, 0.27, -0.18, 0.24, 0)
      ctx.closePath()
      part(ctx, raw.body, 'line')
      ctx.beginPath()
      ctx.ellipse(-0.11, -0.2, 0.06, 0.035, -0.6, 0, TAU)
      ctx.fillStyle = raw.light
      ctx.fill()
      for (const [x, y, r] of [
        [0.08, -0.17, 0.04],
        [0.13, -0.08, 0.03],
      ] as const) {
        ctx.beginPath()
        ctx.ellipse(x, y, r, r * 0.7, 0.3, 0, TAU)
        ctx.fillStyle = raw.dark
        ctx.fill()
      }
      break
    }
    case 'rock': {
      // A chunky stone of flat facets: a lit top plane and a dark right plane.
      ctx.beginPath()
      ctx.moveTo(-0.25, 0)
      ctx.lineTo(-0.27, -0.14)
      ctx.lineTo(-0.16, -0.31)
      ctx.lineTo(0.03, -0.38)
      ctx.lineTo(0.2, -0.3)
      ctx.lineTo(0.27, -0.12)
      ctx.lineTo(0.24, 0)
      ctx.closePath()
      part(ctx, raw.body, 'line')
      ctx.beginPath()
      ctx.moveTo(-0.16, -0.31)
      ctx.lineTo(0.03, -0.38)
      ctx.lineTo(0.2, -0.3)
      ctx.lineTo(0.06, -0.22)
      ctx.lineTo(-0.12, -0.24)
      ctx.closePath()
      part(ctx, raw.light, 'detail')
      ctx.beginPath()
      ctx.moveTo(0.06, -0.22)
      ctx.lineTo(0.2, -0.3)
      ctx.lineTo(0.27, -0.12)
      ctx.lineTo(0.24, 0)
      ctx.lineTo(0.1, 0)
      ctx.closePath()
      part(ctx, raw.dark, 'detail')
      break
    }
    case 'sand': {
      // A sack tied with a rope, a little pile spilled at its foot.
      ctx.beginPath()
      ctx.moveTo(-0.27, 0)
      ctx.quadraticCurveTo(0.12, -0.13, 0.28, 0)
      ctx.closePath()
      part(ctx, raw.light, 'line')
      ctx.beginPath()
      ctx.moveTo(-0.17, -0.02)
      ctx.bezierCurveTo(-0.27, -0.1, -0.24, -0.32, -0.08, -0.39)
      ctx.lineTo(-0.12, -0.49)
      ctx.quadraticCurveTo(-0.04, -0.45, 0.0, -0.5)
      ctx.quadraticCurveTo(0.05, -0.45, 0.12, -0.49)
      ctx.lineTo(0.08, -0.39)
      ctx.bezierCurveTo(0.24, -0.32, 0.27, -0.1, 0.17, -0.02)
      ctx.closePath()
      part(ctx, raw.body, 'line')
      ctx.beginPath()
      ctx.ellipse(-0.08, -0.2, 0.06, 0.09, 0.2, 0, TAU)
      ctx.fillStyle = raw.light
      ctx.fill()
      // The rope round the neck.
      ctx.beginPath()
      ctx.moveTo(-0.1, -0.395)
      ctx.quadraticCurveTo(0.0, -0.37, 0.1, -0.395)
      tube(ctx, 0.03, raw.dark)
      if (fine) {
        ctx.beginPath()
        ctx.setLineDash([0.025, 0.02])
        ctx.moveTo(0.13, -0.33)
        ctx.quadraticCurveTo(0.2, -0.18, 0.13, -0.05)
        ink(ctx, 'detail')
        ctx.setLineDash([])
      }
      break
    }
    case 'gem': {
      // A cluster of three crystals: blue in front, red and yellow behind, and a twinkle.
      for (const [x, w, h, tilt, tone] of CRYSTALS) {
        ctx.save()
        // Tipped crystals stand on their lower corner.
        ctx.translate(x, -Math.abs(Math.sin(tilt)) * w * 0.5)
        ctx.rotate(tilt)
        ctx.beginPath()
        ctx.moveTo(-w / 2, 0)
        ctx.lineTo(-w / 2, -h * 0.72)
        ctx.lineTo(0, -h)
        ctx.lineTo(w / 2, -h * 0.72)
        ctx.lineTo(w / 2, 0)
        ctx.closePath()
        part(ctx, raw[tone], 'line')
        ctx.beginPath()
        ctx.moveTo(0, -h)
        ctx.lineTo(w * 0.08, -h * 0.05)
        ink(ctx, 'detail')
        if (tone === 'body') shine(ctx, -w * 0.05, -h * 0.55, w * 0.45)
        ctx.restore()
      }
      const tw = 0.5 + 0.5 * Math.sin(TAU * (t / 1.6 + phaseOf('gem')))
      sparkle(ctx, 0.17, -0.42, 0.06 + 0.06 * tw, C.sparkle)
      break
    }
  }
  ctx.restore()
}

/** A made block: the box with its faces and the material's marks on the front, centred over the origin. */
function drawBlock(ctx: CanvasRenderingContext2D, m: Material, fine: boolean, t: number) {
  const look = MATERIAL_LOOK[m]
  const { w, h } = BLOCK[m]
  const d = BLOCK_DEPTH
  const x = -(w + d) / 2
  /** A mark line from (x0, y0) to (x1, y1) in the material's mark colour. */
  const mark = (pts: readonly number[], width: number) => {
    ctx.beginPath()
    for (let i = 0; i < pts.length; i += 4) {
      ctx.moveTo(pts[i]!, pts[i + 1]!)
      ctx.lineTo(pts[i + 2]!, pts[i + 3]!)
    }
    ctx.lineWidth = width
    ctx.strokeStyle = look.mark
    ctx.stroke()
  }
  switch (m) {
    case 'planks': {
      // Three boards, each a little box, the top one pushed back a touch.
      const ph = h / 3
      for (let i = 0; i < 3; i++) {
        const px = x + (i === 1 ? 0.02 : 0)
        const py = -(i + 1) * ph
        box(ctx, px, py, w, ph, look, d, i === 2 || i === 1, true, 'line')
        if (fine) {
          ctx.beginPath()
          ctx.moveTo(px + 0.05, py + ph * 0.55)
          ctx.bezierCurveTo(px + 0.14, py + ph * 0.3, px + 0.2, py + ph * 0.8, px + w - 0.08, py + ph * 0.45)
          ctx.lineWidth = lw('detail')
          ctx.strokeStyle = look.mark
          ctx.stroke()
        }
        for (const nx of [px + 0.04, px + w - 0.04]) {
          circlePath(ctx, nx, py + ph / 2, 0.011)
          ctx.fillStyle = look.mark
          ctx.fill()
        }
      }
      return
    }
    case 'bricks': {
      box(ctx, x, -h, w, h, look, d, true, true, 'line')
      // Running bond: three courses, the middle one's joints half a brick over.
      const c = h / 3
      const mw = Math.max(lw('detail'), 0.014)
      mark([x, -c, x + w, -c, x, -2 * c, x + w, -2 * c], mw)
      mark([x + w / 2, -c, x + w / 2, 0, x + w / 2, -3 * c, x + w / 2, -2 * c, x + w / 4, -2 * c, x + w / 4, -c, x + (3 * w) / 4, -2 * c, x + (3 * w) / 4, -c], mw)
      // The courses run round onto the side face.
      mark([x + w, -c, x + w + d, -c - d, x + w, -2 * c, x + w + d, -2 * c - d], mw)
      return
    }
    case 'concrete': {
      box(ctx, x, -h, w, h, look, d, true, true, 'line')
      // A precast element: tie holes in two rows, and a lifting loop on top.
      for (const ty of [-h * 0.68, -h * 0.3]) {
        for (const tx of [0.2, 0.5, 0.8]) {
          circlePath(ctx, x + w * tx, ty, fine ? 0.018 : 0.025)
          ctx.fillStyle = look.mark
          ctx.fill()
        }
      }
      ctx.beginPath()
      ctx.arc(x + w / 2 + d / 2, -h - d / 2, 0.04, Math.PI, TAU)
      tube(ctx, 0.016, BOX.steel.side)
      if (fine) {
        ctx.beginPath()
        ctx.moveTo(x + 0.03, -h + 0.035)
        ctx.lineTo(x + w - 0.03, -h + 0.035)
        ctx.lineWidth = lw('detail')
        ctx.strokeStyle = look.mark
        ctx.stroke()
      }
      return
    }
    case 'glass': {
      box(ctx, x, -h, w, h, look, d, true, true, 'line')
      // Two diagonal glints and a shine.
      ctx.lineCap = 'round'
      mark([x + 0.07, -h * 0.35, x + 0.17, -h * 0.75, x + 0.11, -h * 0.18, x + 0.24, -h * 0.7], Math.max(lw('line'), 0.022))
      shine(ctx, x + w * 0.72, -h * 0.4, 0.09)
      return
    }
    case 'rainbow': {
      box(ctx, x, -h, w, h, look, d, true, true, 'line')
      // Six bands across the front, the face's own yellow among them.
      const n = C.rainbow.length
      const bh = h / n
      for (let i = 0; i < n; i++) {
        ctx.beginPath()
        ctx.rect(x, -h + i * bh, w, bh)
        ctx.fillStyle = C.rainbow[i]!
        ctx.fill()
      }
      ctx.beginPath()
      ctx.rect(x, -h, w, h)
      ink(ctx, 'line')
      const tw = 0.5 + 0.5 * Math.sin(TAU * (t / 1.8 + phaseOf('rainbow')))
      sparkle(ctx, x + w + d * 0.4, -h - d * 0.9, 0.05 + 0.05 * tw, C.sparkle)
      return
    }
  }
}

export const GOODS_SHEET: SheetEntry[] = GOODS.map((good) => ({ label: good, box: rect(-0.3, -0.6, 0.6, 0.6), draw: (ctx, t) => drawGood(ctx, good, t) }))
