import { clamp } from './game/math'

/**
 * The HUD sizes a 3D camera has to know, written once: the map's and the wardrobe's. The HUD
 * puts them into its CSS as custom properties (sizeCss) and the camera works out the same
 * lengths in px (sizePx), so the islands and the slime keep clear of the buttons and the
 * panel on every screen.
 */

/** A length that follows the screen: `share` percent of its short side (vmin), kept between `min` and `max` px. */
type Size = readonly [share: number, min: number, max: number]

/** The map HUD's sizes. */
export const MAP_SIZES = {
  /** The margin along the screen's edges (--m). */
  m: [2, 8, 18],
  /** The title's letters at the top. */
  title: [4.6, 22, 40],
  /** The round arrows at the sides. */
  step: [12, 58, 92],
  /** The height of Go! at the bottom. */
  go: [13, 64, 104],
  /** The island's name over Go!. */
  name: [5.6, 24, 50],
} as const satisfies Record<string, Size>

/**
 * The wardrobe's panel: on a wide screen it stands at the right, `wide` percent of the
 * screen's width kept between `min` and `max` px; on a tall one it lies along the bottom,
 * `tall` percent of the screen's height.
 */
export const PANEL = { wide: 46, min: 300, max: 620, tall: 54 } as const

/** A size in px on a w x h screen. */
export function sizePx([share, min, max]: Size, w: number, h: number) {
  if (!(w > 0 && h > 0)) throw new Error(`sizePx needs a screen with a size, not ${w} x ${h} px`)
  return clamp(share * (Math.min(w, h) / 100), min, max)
}

/** A size as CSS, for a custom property. */
export const sizeCss = ([share, min, max]: Size) => `clamp(${min}px, ${share}vmin, ${max}px)`

/**
 * The part of a w x h screen the map HUD leaves free, as how far up, down, left and right of
 * the middle it reaches (1 is the screen's edge): under the title, between the arrows and
 * over the name and Go!, each with a little room. The map's camera keeps every island and
 * badge inside it.
 */
export function mapFreeWindow(w: number, h: number) {
  const m = sizePx(MAP_SIZES.m, w, h)
  const top = m + sizePx(MAP_SIZES.title, w, h) * 1.3 + 6
  const side = m + sizePx(MAP_SIZES.step, w, h) + 14
  const bottom = m + sizePx(MAP_SIZES.go, w, h) + sizePx(MAP_SIZES.name, w, h) * 1.35 + 12
  const across = Math.max(0.3, 1 - (2 * side) / w)
  return { top: Math.max(0.2, 1 - (2 * top) / h), bottom: Math.max(0.15, 1 - (2 * bottom) / h), left: across, right: across }
}

/**
 * The share of a w x h screen the wardrobe's panel leaves to the slime: on a wide screen, of
 * its width, left of the panel (less 24 px for the margin at the panel's right and a little
 * room); on a tall one, of its height, over the panel (less 3 percent for the margin under
 * it and a little room).
 */
export function wardrobeFreeShare(w: number, h: number) {
  if (!(w > 0 && h > 0)) throw new Error(`wardrobeFreeShare needs a screen with a size, not ${w} x ${h} px`)
  if (w > h) return 1 - (clamp((PANEL.wide / 100) * w, PANEL.min, PANEL.max) + 24) / w
  return (100 - PANEL.tall - 3) / 100
}
