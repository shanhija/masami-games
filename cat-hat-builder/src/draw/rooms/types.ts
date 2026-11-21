import type { ItemOf } from '../../game/items'
import type { Theme } from '../../game/model'

/**
 * The shape of a theme's art. The renderer draws a themed room in this order: the wallpaper
 * (clipped to the room's inside), the floor band, the ceiling items, the wall items, the
 * floor items and friends, the builder visiting, then the room's frame (house.ts) over all.
 */

/** The wallpaper over the room's inside, origin at its top-left, w x h metres (the caller clips). One of four colourings. */
export type WallDraw = (ctx: CanvasRenderingContext2D, w: number, h: number, t: number, variant: 0 | 1 | 2 | 3) => void
/** The floor band along the inside's bottom, origin at its top-left, w wide and layout.FLOOR_BAND tall. One of four colourings. */
export type FloorDraw = (ctx: CanvasRenderingContext2D, w: number, t: number, variant: 0 | 1 | 2 | 3) => void
/**
 * An item at its slot's anchor, facing right, inside layout.SLOT_BOX of its slot kind: the
 * idle loop at sim time t, and its own part of a tap reaction `play` seconds after the last
 * tap (-1 never tapped). The renderer applies the item's idle and tap motions around it.
 */
export type ItemDraw = (ctx: CanvasRenderingContext2D, t: number, play: number) => void

export interface ThemeArt<T extends Theme> {
  wall: WallDraw
  floor: FloorDraw
  /** The colour this theme's windows glow at Good night, and its four wallpaper base colours for the HUD's paint pot. */
  glow: string
  swatches: readonly [string, string, string, string]
  items: { [K in ItemOf<T>]: ItemDraw }
}
