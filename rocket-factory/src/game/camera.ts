import { GROW } from './catalog'
import { fitScale, hudFrame, landBox, turnCS, type Insets, type View } from './layout'
import { STEP, since, type State } from './model'

/**
 * The view as a pure function of the state and the time. There is no camera to steer: the
 * land is always all on screen, fitted into what the HUD leaves free, with whole CSS px
 * cells once it has settled. When the next land's flaps fold open the view eases out from
 * the land before over GROW, and when the window goes upright or back the whole table makes
 * its quarter turn over TURN from s.turnedAt, so she sees her own factory turn. The renderer
 * draws with its frame's view and the hit test reads the very same one, so a tap lands on
 * what was drawn. plans/rocket-factory.md, The board and the view.
 */

/** The table turns over TURN seconds after the board turned (s.turnedAt). */
export const TURN = 0.5

const ease = (u: number) => u * u * (3 - 2 * u)
/** How far through a span of `span` seconds from tick stamp `at` sim time t is, 0 to 1 (1 for a stamp of -1). */
const progress = (at: number, t: number, span: number) => Math.min(1, Math.max(0, since(at, t) / span))

/**
 * The view at sim time t for a canvas w x h CSS px at pixel ratio dpr, on a touch screen or
 * not, with the window's safe areas. The land's box (layout.ts landBox: the land and the next
 * land's flaps) has its middle at the free area's middle. While the land eases out its box
 * grows from the old land's to the new one's; while the table turns the board turns from the
 * window's old way to its new one, fitted by its turned bounding box so it never slips under
 * the HUD. A moving view's cells are the exact fit shrunk by the settled view's rounding, so
 * its last frame is the settled view and nothing pops; a settled view has whole px cells and
 * its origin on a whole px.
 */
export function viewAt(s: State, t: number, w: number, h: number, dpr: number, touch: boolean, safe: Insets): View {
  const hud = hudFrame(w, h, touch, safe)
  const upright = hud.held === 'upright'
  // A phone never turns: on its side it shows the board as it is, upright it shows the turn-me picture.
  const kt = hud.held === 'upright' || hud.held === 'sideways' ? ease(progress(s.turnedAt, t, TURN)) : 1
  const turn = upright ? kt : 1 - kt
  const kl = s.landFrom === s.land ? 1 : ease(progress(s.landAt, t, GROW * STEP))
  const to = landBox(s.land)
  const from = landBox(s.landFrom)
  const b = kl === 1 ? to : { x: from.x + (to.x - from.x) * kl, y: from.y + (to.y - from.y) * kl, w: from.w + (to.w - from.w) * kl, h: from.h + (to.h - from.h) * kl }
  const settled = kt === 1 && kl === 1
  const end = fitScale(hud.free, to, upright ? 1 : 0)
  const fit = fitScale(hud.free, b, turn)
  const cell = settled ? Math.floor(fit) : fit * (Math.floor(end) / end)
  const [c, sn] = turnCS(turn)
  const mx = b.x + b.w / 2
  const my = b.y + b.h / 2
  const ox = hud.free.x + hud.free.w / 2 - (mx * c + my * sn) * cell
  const oy = hud.free.y + hud.free.h / 2 - (my * c - mx * sn) * cell
  return { w, h, dpr, cell, upright, turn, ox: settled ? Math.round(ox) : ox, oy: settled ? Math.round(oy) : oy, hud }
}

/** The view moves at sim time t: the land eases out (GROW after s.landAt) or the table turns (TURN after s.turnedAt). The renderer paints its bakes once the view holds still again. */
export const viewMoves = (s: State, t: number) => since(s.landAt, t) < GROW * STEP || since(s.turnedAt, t) < TURN
/** The board takes no input while the view moves under the finger, nor during the launch, when the rocket flies over a board that slides away. */
export const inputHeld = (s: State, t: number) => viewMoves(s, t) || s.launch !== null
