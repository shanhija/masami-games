import { insets, panLimits, simTime, streetX, toScreen, tweening, type View } from './camera'
import { MACHINE_FOR_MATERIAL, RECIPES, ROADS, openThemes, roomCost } from './catalog'
import type { Game } from './game'
import { hudView } from './hud'
import { ITEMS, themeItems, type ItemId } from './items'
import { centre, hitTest, inside, rect, roomsOnTop, targets, validSpots, type Rect } from './layout'
import { MACHINES, MATERIALS, PARTS, ROAD_KINDS, SHAPES, since, ticks, type Action, type Hit, type Material, type Raw, type RoadKind, type RoadState, type State, type Theme } from './model'
import { rng as seeded } from './random'
import { roomOf, same } from './rules'
import type { UiSound } from './sounds'

/**
 * The scripted child: a five-year-old who plays whole sessions through the same doors as a
 * real one. `childMove` looks at the state and the camera's view and decides one Move every
 * THINK seconds of game time: a HUD button (one hudView shows right now), a tap at a screen
 * point taken from a target's rect and checked against layout.hitTest inside the free area
 * of the shot, a drag along the street, or nothing. `Child` does those moves on a running
 * Game the way the page's own fingers do (Game.pointer, Game.pedal and the HUD's calls), so
 * a tap reaches the rules through the camera's view and layout.hitTest, and never while the
 * camera moves. It plays on the page with ?autoplay and in session.test.ts.
 *
 * The child keeps no memory between moves: what it wants follows from the state alone, so a
 * snapshot, or a state rebuilt from the save, plays on just the same. It follows the hint
 * when nothing else calls it, and is called by small whims: dressing up a little at the
 * mirror, visiting a room to play, the doorbell and the front doors, the roof and its button,
 * the hand that takes a room back (and wiggles the rooms on top of one that holds them up).
 */

/** The child decides this often, in game seconds: about as often as a small finger lands. */
export const THINK = 0.3
/** On the page the child says Good night after this many game seconds of play; the card stays up WAKE_AFTER real seconds before it plays again. */
export const BEDTIME = 6 * 60
const WAKE_AFTER = 4

/** What the child does next: nothing, a HUD button (as its Action), a tap at a screen point, or a drag across the screen. Points are CSS pixels from the canvas's top-left. */
export type Move =
  | { kind: 'wait' }
  | { kind: 'button'; action: Action }
  | { kind: 'tap'; x: number; y: number }
  | { kind: 'drag'; x0: number; y0: number; x1: number; y1: number }

type Rng = () => number

const WAIT: Move = { kind: 'wait' }
const press = (action: Action): Move => ({ kind: 'button', action })
const pick = <T>(rng: Rng, xs: readonly T[]): T => {
  if (xs.length === 0) throw new Error('the child picks from nothing')
  return xs[Math.floor(rng() * xs.length)]!
}

/** The child's finger keeps this far (CSS pixels) inside the free area's edges, and drags at least DRAG_MIN (the game takes a shorter move as a tap). */
const EDGE = 6
const DRAG_MIN = 24
/** A drag slides the street by at most this part of the screen's width. */
const DRAG_MAX = 0.8
/** Where in a target's rect the child tries to tap, as fractions of it: the middle first, then around it (a target can hide another's middle, like the builder standing in a room). */
const PROBES = [
  [0.5, 0.5], [0.5, 0.25], [0.25, 0.5], [0.75, 0.5], [0.5, 0.75], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75],
] as const
/** Seconds at the mirror before Go! tempts the child, and after which it always goes. */
const MIRROR_MIN = 3
const MIRROR_MAX = 12
/** Seconds on the street before the builder's face tempts the child back to the mirror. */
const STREET_MIN = 20
/** Seconds in a room before the child may go back out, and after which it always does. */
const ROOM_MIN = 4
const ROOM_MAX = 14
/** The child honks again no sooner than this (seconds). */
const HONK_GAP = 1.5
/**
 * The child's mood turns every MOOD game seconds: with the street full, one mood in three is
 * for driving rather than taking rooms back to build anew, and each mood has its own house
 * to do that in. A mood read off the clock leaves the child memoryless and still lets one
 * wish last the many moves a long way takes.
 */
const MOOD = 40

/** The part of the screen the HUD leaves to the picture for the shot (camera.insets), a finger's edge inside it: the only place the child taps the canvas. */
export function freeArea(s: State, view: View): Rect {
  const ins = insets(s.shot, view.w, view.h)
  return rect(ins.left + EDGE, ins.top + EDGE, view.w - ins.left - ins.right - 2 * EDGE, view.h - ins.top - ins.bottom - 2 * EDGE)
}

/** A tap on the target `hit` of the shot on screen (one of its rects: a roof or a door has one a column or a home): a rect's middle, or the first point around it that the hit test gives to it, inside the free area; null when none does or the camera is moving. */
function tapOn(s: State, view: View, hit: Hit): Move | null {
  if (tweening(s, simTime(s))) return null
  const area = freeArea(s, view)
  for (const t of targets(s)) {
    if (!same(t.hit, hit)) continue
    for (const [fx, fy] of PROBES) {
      const [x, y] = toScreen(view, t.rect.x + t.rect.w * fx, t.rect.y + t.rect.h * fy)
      if (inside(area, x, y) && same(hitTest(s, view, x, y), hit)) return { kind: 'tap', x, y }
    }
  }
  return null
}

/** The way to the target `hit`: a tap on it, or on the street a drag that slides it toward the middle of the screen (from where the camera really is, inside the pan limits); null when neither can be done now. */
function reach(s: State, view: View, hit: Hit): Move | null {
  const tap = tapOn(s, view, hit)
  const shot = s.shot
  if (tap !== null || shot.kind !== 'street' || tweening(s, simTime(s))) return tap
  const t = targets(s).find((x) => same(x.hit, hit))
  if (t === undefined) return null
  const { lo, hi } = panLimits(view.w / view.ppm, s.keep.plots.length)
  const area = freeArea(s, view)
  const from = streetX(shot.x, view.w / view.ppm, s.keep.plots.length)
  const d = Math.max(-DRAG_MAX * area.w, Math.min(DRAG_MAX * area.w, (Math.min(hi, Math.max(lo, centre(t.rect).x)) - from) * view.ppm))
  if (Math.abs(d) < DRAG_MIN) return null
  const x = area.x + area.w / 2
  const y = area.y + area.h * 0.6
  return { kind: 'drag', x0: x + d / 2, y0: y, x1: x - d / 2, y1: y }
}

/** The road that carries most of a raw good: rocks come from its boulders, the rest lie on it. */
function roadFor(raw: Raw): RoadKind {
  const carried = (k: RoadKind) => (raw === 'rock' ? ROADS[k].boulders : ROADS[k].pickups[raw])
  return ROAD_KINDS.reduce((a, b) => (carried(b) > carried(a) ? b : a))
}

/**
 * Everything the HUD offers as a button right now, as Actions, read off hudView the way
 * Hud.tsx lays it out. A question's cards cover the rest (a tap outside them closes it), the
 * Good night card covers everything (a tap wakes); otherwise the back button, the pause
 * menu's Good night and switches (Start again is a parent's hold), the wardrobe, the road's
 * pedal (the tool button at a boulder) and horn, the build tray (with its roof button) and the
 * room tray. The room tray's theme strip shows any open theme's items, so every open item is
 * a button there; a room with no theme yet shows only the button that asks which room.
 */
export function buttons(s: State): Action[] {
  const hud = hudView(s, simTime(s), null)
  if (hud.night === 'done') return [{ kind: 'wake' }]
  const ask = hud.ask
  if (ask !== null) {
    switch (ask.kind) {
      case 'house':
        return [{ kind: 'house', house: 'tall' }, { kind: 'house', house: 'row' }, { kind: 'back' }]
      case 'road':
        return [...ROAD_KINDS.map((road): Action => ({ kind: 'road', road })), { kind: 'back' }]
      case 'theme':
        return [...ask.themes.map((theme): Action => ({ kind: 'theme', theme })), { kind: 'theme', theme: null }]
    }
  }
  const out: Action[] = [{ kind: 'goodnight' }, { kind: 'sound', on: !hud.sound }, { kind: 'music', on: !hud.music }]
  if (hud.back !== null) out.push({ kind: hud.back === 'face' ? 'mirror' : hud.back === 'home' ? 'home' : 'back' })
  const w = hud.wardrobe
  if (w !== null) {
    out.push(...PARTS.map((part): Action => ({ kind: 'tab', part })), ...[...w.options, ...w.colours].map((o): Action => ({ kind: 'wear', patch: o.patch })), { kind: 'dice' }, { kind: 'go' })
    if (w.undo) out.push({ kind: 'undoDice' })
  }
  const road = hud.road
  if (road !== null && !road.over) {
    // At a boulder the pedal is the tool button: every press is a hit.
    if (road.boulder) out.push({ kind: 'whack' })
    else out.push({ kind: 'pedal', down: true }, { kind: 'pedal', down: false }, { kind: 'push' })
    out.push({ kind: 'horn' })
  }
  const build = hud.build
  if (build !== null && build.kind !== null) {
    out.push(...MATERIALS.map((material): Action => ({ kind: 'material', material })), ...SHAPES.map((shape): Action => ({ kind: 'shape', shape })), { kind: 'hand', on: !build.hand }, { kind: 'roof' })
    if (build.doorbell) out.push({ kind: 'doorbell' })
  }
  const room = hud.room
  if (room !== null) {
    if (!room.pick) out.push(...room.themes.flatMap(themeItems).map((item): Action => ({ kind: 'item', item })), { kind: 'paint', what: 'wall' }, { kind: 'paint', what: 'floor' })
    out.push({ kind: 'askTheme' })
  }
  return out
}

/**
 * The child's next move for the state on screen through `view`, decided like a five-year-old:
 * a question is answered at once (the signpost with the road of the material it is shortest
 * of, a room with the theme the street has least of), a falling night has its lights tapped
 * out, and each screen has its own play. Never says Good night by itself: see bedtimeMove.
 */
export function childMove(s: State, view: View, rng: Rng): Move {
  const keep = s.keep
  const t = simTime(s)
  const hud = hudView(s, t, null)
  if (hud.night === 'done') return WAIT
  const ask = s.ask
  if (ask !== null) {
    switch (ask.kind) {
      case 'house':
        return press(rng() < 0.05 ? { kind: 'back' } : { kind: 'house', house: rng() < 0.5 ? 'tall' : 'row' })
      case 'road': {
        // The material there is least of, counting the raw goods waiting to become it.
        const have = (m: Material) => keep.goods[m] + keep.goods[RECIPES[MACHINE_FOR_MATERIAL[m]].takes]
        const least = Math.min(...MATERIALS.map(have))
        const short = pick(rng, MATERIALS.filter((m) => have(m) === least))
        return press({ kind: 'road', road: roadFor(RECIPES[MACHINE_FOR_MATERIAL[short]].takes) })
      }
      case 'theme': {
        if (rng() < 0.04) return press({ kind: 'theme', theme: null })
        const now = roomOf(s, ask.plot, ask.room).theme
        const open = openThemes(keep.unlocked).filter((th) => th !== now)
        const used = (th: Theme) => keep.plots.reduce((n, p) => n + p.rooms.filter((r) => r.theme === th).length, 0)
        const fewest = Math.min(...open.map(used))
        return press({ kind: 'theme', theme: pick(rng, rng() < 0.7 ? open.filter((th) => used(th) === fewest) : open) })
      }
    }
  }
  // At night the hint is the lit house nearest the camera: its lights go out next.
  if (s.night !== null) return s.hint === null ? WAIT : (reach(s, view, s.hint) ?? WAIT)

  // The street is full and there are goods to build with: the hand takes rooms back to build anew, except in a mood for driving.
  const mood = Math.floor(s.tick / ticks(MOOD))
  const rebuild = !keep.plots.some((p) => p.kind === null || validSpots(p, 'small').length > 0) && MATERIALS.some((m) => keep.goods[m] >= roomCost('small')) && mood % 3 !== 0
  const shot = s.shot
  switch (shot.kind) {
    case 'mirror': {
      // Dresses up a little: parts tapped on the big builder, tabs, clothes and colours, the dice; then Go!
      const w = hud.wardrobe!
      const there = since(Math.max(0, s.shotAt), t)
      if ((there > MIRROR_MIN && rng() < 0.2) || there > MIRROR_MAX) return press({ kind: 'go' })
      const u = rng()
      if (u < 0.15) return tapOn(s, view, { kind: 'part', part: pick(rng, PARTS) }) ?? WAIT
      if (u < 0.3) return press({ kind: 'tab', part: pick(rng, PARTS) })
      const off = [...w.options, ...w.colours].filter((o) => !o.on)
      if (u < 0.8 && off.length > 0) return press({ kind: 'wear', patch: pick(rng, off).patch })
      if (u < 0.88) return press({ kind: 'dice' })
      if (u < 0.92 && w.undo) return press({ kind: 'undoDice' })
      return WAIT
    }

    case 'road': {
      // Holds the pedal down (a held pedal drives on after a boulder bursts), hits the boulder (the tool button, or the rock itself), honks at whoever is crossing.
      const road: RoadState = s.road!
      const controls = hud.road!
      if (controls.over) return WAIT
      if (controls.boulder) return (rng() < 0.3 ? tapOn(s, view, { kind: 'boulder' }) : null) ?? press({ kind: 'whack' })
      const crosser = targets(s).find((x) => x.hit.kind === 'crosser')
      if ((crosser !== undefined || road.stop >= 0) && since(road.honkAt, t) > HONK_GAP && rng() < 0.3) {
        return (crosser !== undefined && rng() < 0.5 ? tapOn(s, view, crosser.hit) : null) ?? press({ kind: 'horn' })
      }
      if (!road.pedal) return press(rng() < 0.1 ? { kind: 'push' } : { kind: 'pedal', down: true })
      return rng() < 0.03 ? press({ kind: 'pedal', down: false }) : WAIT
    }

    case 'street': {
      // Whims for what is in sight, then the one thing bouncing: a crate, a machine with goods, the plot being built, the truck.
      const homes = keep.plots.flatMap((p, plot) => (p.rooms.some((r) => r.theme !== null) ? [plot] : []))
      const busy = MACHINES.filter((m) => s.machines[m].on)
      const u = rng()
      if (u < 0.01 && since(s.shotAt, t) > STREET_MIN) return press({ kind: 'mirror' })
      if (u < 0.05) return WAIT
      if (u < 0.09 && homes.length > 0) return tapOn(s, view, { kind: 'plot', plot: pick(rng, homes) }) ?? WAIT
      if (u < 0.1 && s.presentGot !== null) return tapOn(s, view, { kind: 'present' }) ?? WAIT
      // A running machine is fun to tap: each tap pops its batch out at once, so there is more to build with.
      if (u < 0.7 && busy.length > 0) {
        const tap = tapOn(s, view, { kind: 'machine', m: pick(rng, busy) })
        if (tap !== null) return tap
      }
      // A full street and goods to build with: off to a house (the mood's) to take a room back and build anew.
      if (rebuild && homes.length > 0) return reach(s, view, { kind: 'plot', plot: homes[mood % homes.length]! }) ?? WAIT
      return s.hint === null ? WAIT : (reach(s, view, s.hint) ?? WAIT)
    }

    case 'plot': {
      const plot = shot.plot
      const p = keep.plots[plot]!
      // The house question was closed: tap the sign to be asked again, or back out.
      if (p.kind === null) return rng() < 0.5 ? (tapOn(s, view, { kind: 'plot', plot }) ?? WAIT) : press({ kind: 'back' })
      // The crane is lowering a room: watch it land; its theme card comes up by itself.
      if (s.craneRoom >= 0 && !s.craneOut) return WAIT
      const roomHit = (id: number): Hit => ({ kind: 'room', plot, room: id })
      if (s.hand) {
        // The hand: lift a room with nothing on top, then tap it again to send it back (now and then one with rooms on top, to see them wiggle).
        if (s.lifted >= 0) return rng() < 0.85 ? (tapOn(s, view, roomHit(s.lifted)) ?? WAIT) : press({ kind: 'hand', on: false })
        const loose = p.rooms.filter((r) => roomsOnTop(p, r).length === 0)
        const holding = p.rooms.filter((r) => roomsOnTop(p, r).length > 0)
        const u = rng()
        if (u < 0.1 && holding.length > 0) return tapOn(s, view, roomHit(pick(rng, holding).id)) ?? WAIT
        if (u < (rebuild ? 0.9 : 0.6) && loose.length > 0) return tapOn(s, view, roomHit(pick(rng, loose).id)) ?? WAIT
        return press({ kind: 'hand', on: false })
      }
      const bare = p.rooms.find((r) => r.theme === null)
      if (bare !== undefined) return tapOn(s, view, roomHit(bare.id)) ?? WAIT
      const themed = p.rooms.filter((r) => r.theme !== null)
      const u = rng()
      if (u < 0.01 && p.rooms.length > 0) return press({ kind: 'doorbell' })
      if (u < 0.04 && p.rooms.length > 0) return tapOn(s, view, { kind: 'door', plot }) ?? WAIT
      if (u < 0.05 && p.rooms.length > 0) return press({ kind: 'roof' })
      if (u < 0.06 && p.rooms.length > 0) return tapOn(s, view, { kind: 'roof', plot }) ?? WAIT
      if (u < 0.08 && p.rooms.length > 0) return press({ kind: 'hand', on: true })
      if (u < 0.14 && themed.length > 0) return tapOn(s, view, roomHit(pick(rng, themed).id)) ?? WAIT
      // What to build: a material that pays and a shape it pays for that fits; the picks are sticky, and now and then changed for another.
      const fitting = (m: Material) => SHAPES.filter((sh) => keep.goods[m] >= roomCost(sh) && validSpots(p, sh).length > 0)
      const materials = MATERIALS.filter((m) => fitting(m).length > 0)
      if (materials.length === 0) {
        if (rebuild && rng() < 0.8) return press({ kind: 'hand', on: true })
        if (u < 0.35 && themed.length > 0) return tapOn(s, view, roomHit(pick(rng, themed).id)) ?? WAIT
        // A tap on a ghost with too little of the picked material: the missing one bounces with its machine.
        const spots = validSpots(p, s.shape)
        if (u < 0.45 && spots.length > 0) return tapOn(s, view, { kind: 'spot', plot, ...pick(rng, spots) }) ?? WAIT
        return press({ kind: 'back' })
      }
      const shapes = fitting(s.material)
      const others = materials.filter((m) => m !== s.material)
      const v = rng()
      if ((shapes.length === 0 || v < 0.15) && others.length > 0) {
        // Half the time the material there is most of (it builds the biggest rooms), else any other.
        const most = others.reduce((a, b) => (keep.goods[b] > keep.goods[a] ? b : a))
        return press({ kind: 'material', material: rng() < 0.5 ? most : pick(rng, others) })
      }
      const otherShapes = shapes.filter((sh) => sh !== s.shape)
      // A five-year-old likes big: half the time the biggest room there is, else any other.
      if ((!shapes.includes(s.shape) || v < 0.4) && otherShapes.length > 0) return press({ kind: 'shape', shape: rng() < 0.5 ? otherShapes[otherShapes.length - 1]! : pick(rng, otherShapes) })
      return tapOn(s, view, { kind: 'spot', plot, ...pick(rng, validSpots(p, s.shape)) }) ?? WAIT
    }

    case 'room': {
      const room = roomOf(s, shot.plot, shot.room)
      if (room.theme === null) {
        const u = rng()
        if (u < 0.1) return press({ kind: 'back' })
        return (u < 0.5 ? tapOn(s, view, { kind: 'room', plot: shot.plot, room: room.id }) : null) ?? press({ kind: 'askTheme' })
      }
      const there = since(s.shotAt, t)
      if ((there > ROOM_MIN && rng() < 0.15) || there > ROOM_MAX) return press({ kind: 'back' })
      // Plays: puts items in (mostly the room's own theme's), takes some out, taps things to play them and the builder to do it again, paints.
      const inRoom = room.items.filter((i): i is ItemId => i !== null)
      const u = rng()
      if (u < 0.3) {
        const own = themeItems(room.theme).filter((i) => !inRoom.includes(i))
        const other = openThemes(keep.unlocked).flatMap(themeItems).filter((i) => !inRoom.includes(i) && ITEMS[i].theme !== room.theme)
        return press({ kind: 'item', item: pick(rng, own.length > 0 && rng() < 0.8 ? own : other) })
      }
      if (u < 0.38 && inRoom.length > 0) return press({ kind: 'item', item: pick(rng, inRoom) })
      if (u < 0.7 && inRoom.length > 0) {
        const slots = room.items.flatMap((i, slot) => (i === null ? [] : [slot]))
        return tapOn(s, view, { kind: 'item', plot: shot.plot, room: room.id, slot: pick(rng, slots) }) ?? WAIT
      }
      if (u < 0.76) return tapOn(s, view, { kind: 'builder' }) ?? WAIT
      if (u < 0.86) return press({ kind: 'paint', what: rng() < 0.5 ? 'wall' : 'floor' })
      if (u < 0.88) return press({ kind: 'askTheme' })
      return WAIT
    }
  }
}

/** Bedtime: a question closed, Good night pressed (the moon, or the pause menu's), and then the lights tapped out as in childMove until the card is up. */
function bedtimeMove(s: State, view: View, rng: Rng): Move {
  if (s.night !== null) return childMove(s, view, rng)
  if (s.ask !== null) return press(s.ask.kind === 'theme' ? { kind: 'theme', theme: null } : { kind: 'back' })
  return press({ kind: 'goodnight' })
}

/** The click the HUD plays with the buttons whose actions make no sound of their own (the wardrobe's tabs, the build tray's picks); the back button and a question's close have theirs through Game. */
const CLICK: Partial<Record<Action['kind'], UiSound>> = { tab: 'pick', material: 'pick', shape: 'pick', hand: 'pick' }
/** The child's finger on the canvas: no real pointer has a negative id. */
const FINGER = -1

/**
 * A move done on the page the way a finger does it: a tap or a drag through Game.pointer
 * (the camera's view and layout.hitTest, nothing while the camera moves), the pedal through
 * Game.pedal as the HUD's pedal holds it (let go before every press, so each press is a fresh
 * one), the back button and a question's close through their own calls, and every other
 * button as the HUD dispatches it.
 */
export function doMove(game: Game, move: Move): void {
  switch (move.kind) {
    case 'wait':
      return
    case 'tap':
      game.pointer('down', move.x, move.y, FINGER)
      game.pointer('up', move.x, move.y, FINGER)
      return
    case 'drag':
      game.pointer('down', move.x0, move.y0, FINGER)
      game.pointer('move', move.x1, move.y1, FINGER)
      game.pointer('up', move.x1, move.y1, FINGER)
      return
    case 'button': {
      const a = move.action
      const click = CLICK[a.kind]
      if (a.kind === 'pedal') {
        game.pedal('touch', false)
        if (a.down) game.pedal('touch', true)
      } else if (game.state.ask !== null && (a.kind === 'back' || (a.kind === 'theme' && a.theme === null))) game.closeAsk()
      else if (a.kind === 'back' || a.kind === 'home' || a.kind === 'mirror') game.backButton()
      else if (click !== undefined) game.button(a, click)
      else game.dispatch(a)
    }
  }
}

/**
 * The child at a running Game, one call a frame (the page's with ?autoplay, or a test's):
 * every THINK seconds of game time it decides a move against the view the game drew last
 * and does it. After `bedtime` game seconds of play it says Good night; on the page the card
 * stays up WAKE_AFTER real seconds and then the child taps it and plays on. A paused game
 * waits for the parent. The pedal is let go off the road, as the road's controls do when
 * they go.
 */
export class Child {
  private readonly rng: Rng
  private readonly bedtime: number
  /** Game seconds played since the child woke up. */
  private played = 0
  /** The state it watches and the tick of its next decision (a new state, after a reload, is decided on at once). */
  private watched: State | null = null
  private nextAt = 0
  /** When the Good night card came up (the game's clock), or -1. */
  private sleptAt = -1

  constructor(seed: number, bedtime: number) {
    this.rng = seeded(seed)
    this.bedtime = bedtime
  }

  frame(game: Game): void {
    const view = game.view
    if (view === null || game.paused) return
    if (game.asleep) {
      if (this.sleptAt < 0) this.sleptAt = game.clock
      else if (game.clock - this.sleptAt >= WAKE_AFTER) {
        this.sleptAt = -1
        this.played = 0
        game.dispatch({ kind: 'wake' })
      }
      return
    }
    const s = game.state
    if (s !== this.watched) {
      this.watched = s
      this.nextAt = s.tick
    }
    if (s.tick < this.nextAt) return
    this.nextAt = s.tick + ticks(THINK)
    if (s.shot.kind !== 'road') game.pedal('touch', false)
    const move = this.played >= this.bedtime ? bedtimeMove(s, view, this.rng) : childMove(s, view, this.rng)
    this.played += THINK
    doMove(game, move)
  }
}
