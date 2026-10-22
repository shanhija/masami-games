import { ITEMS, type ItemId } from '../../game/items'
import { FLOOR_BAND } from '../../game/layout'
import type { Theme } from '../../game/model'
import { drawBareRoom } from '../house'
import { COZY_ART } from './cozy'
import { PARTY_ART } from './party'
import { PLAY_ART } from './play'
import type { ItemDraw, ThemeArt } from './types'
import { WONDER_ART } from './wonder'

/** Every theme's art, joined from the four groups: the compiler rejects a theme with no art, and each group's own type rejects a missing or extra item drawing. */
export const THEME_ART: { [T in Theme]: ThemeArt<T> } = { ...PARTY_ART, ...PLAY_ART, ...COZY_ART, ...WONDER_ART }

/** An item's drawing, whatever its theme. */
export const itemArt = (id: ItemId): ItemDraw => (THEME_ART[ITEMS[id].theme].items as Record<ItemId, ItemDraw>)[id]

/**
 * The inside of a room, origin at the interior's top-left, w x h metres: the theme's
 * wallpaper clipped to it and its floor band along the bottom in the room's colourings, or
 * the bare room with no theme yet. The renderer, the HUD's pictures, the sheets and the
 * style keys all draw a room's inside through here; the items are the caller's.
 */
export function drawInside(ctx: CanvasRenderingContext2D, theme: Theme | null, w: number, h: number, t: number, wall: 0 | 1 | 2 | 3, floor: 0 | 1 | 2 | 3): void {
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, w, h)
  ctx.clip()
  if (theme) {
    const art = THEME_ART[theme]
    art.wall(ctx, w, h, t, wall)
    ctx.translate(0, h - FLOOR_BAND)
    art.floor(ctx, w, t, floor)
  } else drawBareRoom(ctx, w, h, t)
  ctx.restore()
}
