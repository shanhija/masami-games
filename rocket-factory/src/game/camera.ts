import { CORNER } from './board'
import { hudFrame, type HudFrame, type Insets, type View } from './layout'
import type { State } from './model'

/**
 * The view as a pure function of a camera and the window. The board is bigger than a screen
 * (60 x 36 cells), so the view looks at it through a camera: the board point at the middle of
 * the free area, and CSS px per cell. The camera is the view's own, never the sim's: the sim
 * never knows where it is. It starts fitted to the start block, today's first board (board.ts
 * CORNER, the board's north-west corner), the way the whole board was fitted before the map
 * grew; the board beyond the start block shows in the free area's margins, east and south.
 * The renderer draws with its frame's view and the hit test reads the very same one, so a tap
 * lands on what was drawn. plans/rocket-factory.md, The board and the view.
 */

/** Where the view looks: the board point at the middle of the free area, in cells, and CSS px per cell (whole px at a rest). */
export interface Camera {
  x: number
  y: number
  cell: number
}

/** The start camera on a HUD frame: the start block (board.ts CORNER) fitted into what the HUD leaves free, as big as it goes in whole CSS px cells, its middle at the free area's middle. */
export function startCamera(hud: HudFrame): Camera {
  const cell = Math.floor(Math.min(hud.free.w / CORNER.w, hud.free.h / CORNER.h))
  return { x: CORNER.x + CORNER.w / 2, y: CORNER.y + CORNER.h / 2, cell }
}

/**
 * The view through `cam` for a canvas w x h CSS px at pixel ratio dpr, on a touch screen or
 * not, with the window's safe areas: the camera's board point at the middle of the free area,
 * the origin on a whole px (so whole px cells put the print's lines on whole device pixels).
 */
export function viewOf(cam: Camera, w: number, h: number, dpr: number, touch: boolean, safe: Insets): View {
  const hud = hudFrame(w, h, touch, safe)
  const ox = Math.round(hud.free.x + hud.free.w / 2 - cam.x * cam.cell)
  const oy = Math.round(hud.free.y + hud.free.h / 2 - cam.y * cam.cell)
  return { w, h, dpr, cell: cam.cell, ox, oy, hud }
}

/** The start view of a window: viewOf the start camera. Until the camera pans, this is every view there is. */
export const startView = (w: number, h: number, dpr: number, touch: boolean, safe: Insets): View => viewOf(startCamera(hudFrame(w, h, touch, safe)), w, h, dpr, touch, safe)

/** The board takes no input during the launch, when the rocket flies over a board that slides away. */
export const inputHeld = (s: State) => s.launch !== null
