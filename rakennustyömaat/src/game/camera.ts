import { HOUSE_GRID, SHAPE_SIZE } from './catalog'
import { CELL, MIRROR_BUILDER_X, TRUCK, houseRect, streetEnd, groundAt, rect, roomRect, type Rect } from './layout'
import { LOWER, SHOT_TWEEN, since, STEP, THEMES, type PlacedRoom, type Shot, type State } from './model'
import { stopX } from './road'

/**
 * The camera as a pure function of the state and the time: every shot names a world rect to
 * show, fitted into the canvas minus the HUD's pinned insets for that shot, and a change of
 * shot tweens from the old view to the new one over SHOT_TWEEN (the centre straight, the
 * zoom in log space, smoothstepped). The road and the street are two worlds: a change
 * between them does not tween, the renderer wipes. The hit test uses the very view that
 * was drawn.
 */

/** A frame's camera: the canvas in CSS pixels and its pixel ratio, CSS pixels per metre, and the world point at the canvas's top-left corner. */
export interface View {
  w: number
  h: number
  dpr: number
  ppm: number
  x0: number
  y0: number
}

export const toWorld = (v: View, sx: number, sy: number): [number, number] => [v.x0 + sx / v.ppm, v.y0 + sy / v.ppm]
export const toScreen = (v: View, x: number, y: number): [number, number] => [(x - v.x0) * v.ppm, (y - v.y0) * v.ppm]

/**
 * A short window is at most SHORT_HEIGHT CSS px tall and at least SHORT_ASPECT times as wide:
 * a phone on its side. The HUD packs itself tighter there (styles.css's `.hud.short`): the
 * corner buttons 64 px, the trays one row, the build tray's tools a column under the pause
 * button, a smaller pedal; the picture takes what that frees.
 */
const SHORT_HEIGHT = 520
const SHORT_ASPECT = 1.5
export const isShort = (w: number, h: number) => h <= SHORT_HEIGHT && w >= SHORT_ASPECT * h

/** CSS pixels the HUD keeps for itself along each edge, per shot: the picture is fitted inside the rest. The HUD lays itself out in exactly these. */
export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}
export function insets(shot: Shot, w: number, h: number): Insets {
  const short = isShort(w, h)
  switch (shot.kind) {
    case 'mirror':
      // The wardrobe panel: on the right in landscape (wider on a short window, so its buttons fit beside the builder), along the bottom in portrait.
      return w >= h ? { top: 0, right: Math.min(560, Math.round(w * (short ? 0.64 : 0.48))), bottom: 0, left: 0 } : { top: 0, right: 0, bottom: Math.round(h * 0.5), left: 0 }
    case 'street':
      return { top: short ? 80 : 96, right: 0, bottom: 24, left: 0 }
    case 'plot':
      // On a short window the build tray is one row and its tools a column under the pause button; the corner buttons keep the sides' tops, so the house stands between them.
      return short ? { top: 16, right: 88, bottom: 88, left: 88 } : { top: 96, right: 0, bottom: 150, left: 0 }
    case 'room': {
      // On a short window the room tray is its things' row alone, the room between the corner buttons. Elsewhere it is TRAY_BOTTOM tall with one line of things and one row of themes; a second line of things (two of THING, LINE_GAP apart, against one of up to BIGGEST_THING) and a second row of themes add theirs.
      if (short) return { top: 16, right: 88, bottom: 88, left: 88 }
      const tray = roomTray(w, h, THEMES.length)
      return { top: 96, right: 0, bottom: TRAY_BOTTOM + (tray.things - 1) * (2 * THING + LINE_GAP - BIGGEST_THING) + (tray.themes - 1) * (THEME + GAP), left: 0 }
    }
    case 'road':
      // On a short window the road runs above the pedal and the horn, so they hide none of it.
      return { top: short ? 80 : 96, right: 0, bottom: short ? 64 : 0, left: 0 }
  }
}

/**
 * The room tray as styles.css lays it out (CSS px), from the window's size and how many
 * themes are open: inside its border and padding (TRAY_EDGE across), the things' row (the
 * theme's five things, then the two paint pots POT_STEP further on and the swap button, at
 * least THING each and GAP apart) in one line where that fits, otherwise in two LINE_GAP
 * apart; and the theme strip (THEME each, GAP apart) in two rows of THEME_ROW on an upright
 * window that holds them, otherwise in one row that scrolls. A strip that scrolls is `strip`
 * px wide, so it ends halfway through a picture and shows there is more (null when every
 * theme fits). A short window's tray is its things' row alone, in one line: no strip rows.
 */
const TRAY_EDGE = 2 * 12 + 2 * 3
const THING = 64
const BIGGEST_THING = 80
const GAP = 8
const LINE_GAP = 12
const POT_STEP = 16
const THEME = 64
const THEME_ROW = 7
const TRAY_BOTTOM = 180
export function roomTray(w: number, h: number, themes: number): { things: 1 | 2; themes: 0 | 1 | 2; strip: number | null } {
  if (isShort(w, h)) return { things: 1, themes: 0, strip: null }
  const inner = w - TRAY_EDGE
  const rows = w < h && THEME_ROW * (THEME + GAP) - GAP <= inner ? 2 : 1
  const fits = themes * (THEME + GAP) - GAP <= inner
  return {
    things: 8 * THING + 7 * GAP + POT_STEP <= inner ? 1 : 2,
    themes: rows,
    strip: rows === 2 || fits ? null : Math.floor((inner - THEME / 2) / (THEME + GAP)) * (THEME + GAP) + THEME / 2,
  }
}

/** How tall a slice of the street the street shot shows (the tall house and its roof, with sky over it), and of the road around the truck. */
const STREET_HEIGHT = 16.5
const STREET_GROUND = 0.88
export const ROAD_HEIGHT = 10.25
const ROAD_GROUND = 0.74
/** On the road the truck's middle sits this far across the view. */
const ROAD_TRUCK_AT = 0.35

/** The road's zoom on a canvas w x h CSS px, in CSS px per metre: ROAD_HEIGHT fills the height the HUD leaves it, as fitted fits the road shot. Only the level crossing on an upright screen zooms out from it (atCrossing). */
export function roadZoom(w: number, h: number): number {
  const ins = insets({ kind: 'road' }, w, h)
  return Math.max(1, h - ins.top - ins.bottom) / ROAD_HEIGHT
}

/** The world rect a shot must show on a canvas w x h CSS px at sim time t, and whether it fits the rect whole ('contain') or fills the height and lets the width follow the screen ('height'): the camera fits it, ?debug draws it. Only the build view's depends on the screen and the time (buildRect). */
export function shownRect(s: State, shot: Shot, w: number, h: number, t: number): { r: Rect; fit: 'contain' | 'height' } {
  return shot.kind === 'plot' ? { r: buildRect(s, shot.plot, w, h, t), fit: 'contain' } : shotRect(s, shot)
}

/** The world rect every shot but the build view must show (shownRect), the same on every screen. */
export function shotRect(s: State, shot: Exclude<Shot, { kind: 'plot' }>): { r: Rect; fit: 'contain' | 'height' } {
  switch (shot.kind) {
    case 'mirror':
      return { r: rect(MIRROR_BUILDER_X - 1.0, -1.7, 2.3, 1.95), fit: 'contain' }
    case 'street':
      return { r: rect(shot.x - 13, -STREET_HEIGHT * STREET_GROUND, 26, STREET_HEIGHT), fit: 'height' }
    case 'room': {
      const room = s.keep.plots[shot.plot]!.rooms.find((r) => r.id === shot.room)!
      const r = roomRect(shot.plot, room)
      return { r: rect(r.x - 0.35, r.y - 0.35, r.w + 0.7, r.h + 0.7), fit: 'contain' }
    }
    case 'road': {
      const road = s.road!
      // The ground ahead and behind, averaged, so the camera rides over bumps instead of with them.
      let g = 0
      for (let k = -10; k <= 10; k++) g += groundAt(road.def, road.x + k * 2)
      g /= 21
      return { r: rect(road.x - 6, g - ROAD_HEIGHT * ROAD_GROUND, 12, ROAD_HEIGHT), fit: 'height' }
    }
  }
}

/** The street's pan limits for a view `viewWidthM` metres wide: the view's middle stays between these, so it never shows past the garage's left wall or the field after the last plot. */
export function panLimits(viewWidthM: number, plots: number) {
  const lo = viewWidthM / 2
  return { lo, hi: Math.max(lo, streetEnd(plots) - viewWidthM / 2) }
}
/** Where a street shot centred at x really is centred on a view `viewWidthM` metres wide: inside the pan limits. The rules may ask for any x; a drag or a key pan starts from this. */
export function streetX(x: number, viewWidthM: number, plots: number): number {
  const { lo, hi } = panLimits(viewWidthM, plots)
  return Math.min(hi, Math.max(lo, x))
}

const smooth = (u: number) => u * u * (3 - 2 * u)

/**
 * The floors a short window's build view of a house shows at t: its floors in use and the one
 * over them, at least two, the whole grid at most. A room the crane brings changes them as it
 * starts down, one it carries away as it goes, each over SHOT_TWEEN, easing on from what
 * showed as the crane changed (s.craneFrom), so a room placed while the last one still eases
 * in never pops the view.
 */
export function shownFloors(s: State, plot: number, t: number): number {
  const p = s.keep.plots[plot]!
  if (p.kind === null) throw new Error(`the floors shown of the empty plot ${plot}`)
  const rows = HOUSE_GRID[p.kind].rows
  const floors = (rooms: readonly PlacedRoom[]) => Math.min(rows, Math.max(2, 1 + Math.max(0, ...rooms.map((room) => room.row + SHAPE_SIZE[room.shape].h))))
  const now = floors(p.rooms)
  if (s.craneRoom < 0) return now
  // The crane's room is this house's, still in it or, taken back, in s.gone.
  const gone = s.gone.find((g) => g.plot === plot && g.room.id === s.craneRoom)
  if (gone === undefined && !p.rooms.some((room) => room.id === s.craneRoom)) return now
  const before = s.craneFrom >= 0 ? s.craneFrom : floors(s.craneOut ? (gone ? [...p.rooms, gone.room] : p.rooms) : p.rooms.filter((room) => room.id !== s.craneRoom))
  const u = (since(s.craneAt, t) - (s.craneOut ? LOWER - SHOT_TWEEN : 0)) / SHOT_TWEEN
  return before + (now - before) * smooth(Math.min(1, Math.max(0, u)))
}

/**
 * The rect the build view fits: the house with its roofs (layout.houseRect), on a short
 * window only the floors shownFloors gives, so its cells stay big enough for a finger.
 */
export function buildRect(s: State, plot: number, w: number, h: number, t: number): Rect {
  const p = s.keep.plots[plot]!
  const r = houseRect(plot, p)
  if (p.kind === null || !isShort(w, h)) return r
  const cut = (HOUSE_GRID[p.kind].rows - shownFloors(s, plot, t)) * CELL
  return rect(r.x, r.y + cut, r.w, r.h - cut)
}

/**
 * While the truck waits at the train, the road view widens where it must to show from
 * CROSSING.behind behind the truck to CROSSING.past right of the train's x: past the
 * crossing's barrier (0.55 m right of it, draw/land.ts BARRIER), and far enough down the
 * track (20 degrees down to the right) that the engine's back wheels are past the road's
 * front kerb before its front reaches the edge, so every car is seen to cross the whole
 * road. The road is held at its height on the screen, but the view goes no deeper than
 * CROSSING.deep under its ground line (the ground is baked 7 m deep, draw/frame.ts
 * ROAD_BELOW): on a tall narrow screen the road sits lower instead, more sky over it. Eased in over CROSSING.ease
 * from the stop, and back out over the truck's first CROSSING.out metres on once the train
 * has passed. A screen wide enough for all that keeps its zoom and moves on only as far as
 * it must (most held sideways do not move at all). The road keeps no side insets, so the
 * view's whole width is free.
 */
const CROSSING = { behind: 0.4, past: 4, deep: 6.4, ease: 0.6, out: 3 }
function atCrossing(s: State, v: View, ground: number, t: number): View {
  const road = s.road!
  const i = road.def.things.findIndex((th) => th.kind === 'surprise' && th.what === 'train')
  if (i < 0) return v
  const train = road.def.things[i]!
  const k =
    road.stop === i
      ? smooth(Math.min(1, Math.max(0, since(road.stopAt, t) / CROSSING.ease)))
      : road.done[i] >= 0
        ? 1 - smooth(Math.min(1, Math.max(0, (road.x - stopX(train)) / CROSSING.out)))
        : 0
  if (k === 0) return v
  const left = road.x - TRUCK.length / 2 - CROSSING.behind
  const right = train.x + CROSSING.past
  // The view that holds it all: zoomed out as far as it must be, moved from its own place only as far as it must be.
  const ppm = Math.min(v.ppm, v.w / (right - left))
  const x0 = Math.min(left, Math.max(right - v.w / ppm, road.x - (v.w * ROAD_TRUCK_AT) / ppm))
  if (ppm === v.ppm && x0 === v.x0) return v
  // Part of the way there: the zoom in log space, the view's middle straight, the ground line held at its height on the screen unless the view would reach deeper than CROSSING.deep under it.
  const pk = Math.exp(Math.log(v.ppm) + (Math.log(ppm) - Math.log(v.ppm)) * k)
  const from = v.x0 + v.w / 2 / v.ppm
  const mid = from + (x0 + v.w / 2 / ppm - from) * k
  return { ...v, ppm: pk, x0: mid - v.w / 2 / pk, y0: Math.min(ground - ((ground - v.y0) * v.ppm) / pk, ground + CROSSING.deep - v.h / pk) }
}

function fitted(s: State, shot: Shot, w: number, h: number, dpr: number, t: number): View {
  const { r, fit } = shownRect(s, shot, w, h, t)
  const ins = insets(shot, w, h)
  const aw = Math.max(1, w - ins.left - ins.right)
  const ah = Math.max(1, h - ins.top - ins.bottom)
  const ppm = fit === 'contain' ? Math.min(aw / r.w, ah / r.h) : ah / r.h
  // The rect's middle at the middle of the free area, the street's kept inside its ends; on the road, the truck at ROAD_TRUCK_AT across.
  const cx = shot.kind === 'road' ? s.road!.x : shot.kind === 'street' ? streetX(r.x + r.w / 2, aw / ppm, s.keep.plots.length) : r.x + r.w / 2
  const cy = r.y + r.h / 2
  const ax = shot.kind === 'road' ? ins.left + aw * ROAD_TRUCK_AT : ins.left + aw / 2
  const ay = ins.top + ah / 2
  const v = { w, h, dpr, ppm, x0: cx - ax / ppm, y0: cy - ay / ppm }
  return shot.kind === 'road' ? atCrossing(s, v, r.y + ROAD_HEIGHT * ROAD_GROUND, t) : v
}

/** The view at sim time t (seconds) for a canvas w x h CSS pixels at pixel ratio dpr. */
export function viewAt(s: State, t: number, w: number, h: number, dpr: number): View {
  const to = fitted(s, s.shot, w, h, dpr, t)
  const worldChange = (s.shot.kind === 'road') !== (s.shotFrom.kind === 'road')
  const u = Math.min(1, since(s.shotAt, t) / SHOT_TWEEN)
  if (worldChange || u >= 1) return to
  const from = fitted(s, s.shotFrom, w, h, dpr, t)
  const k = smooth(u)
  const ppm = Math.exp(Math.log(from.ppm) + (Math.log(to.ppm) - Math.log(from.ppm)) * k)
  // Tween the world point at the canvas's middle, then rebuild the corner from the new zoom.
  const fcx = from.x0 + w / 2 / from.ppm
  const fcy = from.y0 + h / 2 / from.ppm
  const tcx = to.x0 + w / 2 / to.ppm
  const tcy = to.y0 + h / 2 / to.ppm
  const cx = fcx + (tcx - fcx) * k
  const cy = fcy + (tcy - fcy) * k
  return { w, h, dpr, ppm, x0: cx - w / 2 / ppm, y0: cy - h / 2 / ppm }
}

/** A shot change is still moving at sim time t: canvas taps wait for it. */
export const tweening = (s: State, t: number) => since(s.shotAt, t) < SHOT_TWEEN && (s.shot.kind === 'road') === (s.shotFrom.kind === 'road')
/** The sim time in seconds of the state's current tick. */
export const simTime = (s: State) => s.tick * STEP
