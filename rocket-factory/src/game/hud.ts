import { launchSlide } from '../draw/rocket'
import { PART_INFO, PATH, PLACEABLE, START_STICKERS, card } from './catalog'
import { bottleCost, choiceWaits, nextCard } from './machines'
import { launchReady } from './rules'
import { PARTS, since, type CardId, type PartId, type Placeable, type State, type Sticker, type Switches, type Thing } from './model'
import { stickersLeft } from './strokes'

/**
 * What the HUD shows, as pure functions of the state (plans/rocket-factory.md, The HUD): the
 * HUD's components read only this, the game's pause and its frame, and the game bumps the
 * HUD's version when `sameHud` says it changed. So it holds nothing that moves every frame;
 * everything timed (the Good night card) is decided here from the sim time, so a paused game
 * holds it all still.
 */

/** The Good night card comes up this long after the last machine was tucked in: Beep curls up first. */
export const NIGHT_CARD = 2

/** A rocket part on the rocket card: open (from the start or by its card) and how full. After a landing the same rocket fills again (rules.ts), so its parts stay open, empty again. */
export interface PartView {
  part: PartId
  open: boolean
  got: number
  n: number
}

/** A jar on the lab card: the thing it fills with, how many are in, how many it needs. */
export interface Jar {
  thing: Thing
  got: number
  need: number
}

/** A card on the path, as its picture shows: found (ticked), the one coming now (glowing), or later (grey). */
export interface PathCard {
  id: CardId
  at: 'done' | 'now' | 'later'
}

/** A sticker's button in the tray: how many are left (Infinity after a launch, 0 a die-cut hole), whether it is picked, and whether it wears New!. */
export interface TrayButton {
  sticker: Sticker
  left: number
  picked: boolean
  fresh: boolean
}

export interface HudView {
  /** Play has not been pressed: the start card. */
  start: boolean
  /** The rocket card, and whether the launch waits for her (every part full and Fuel! found). */
  rocket: { parts: PartView[]; ready: boolean }
  /** A launch runs: the lab card and the tray take no taps, and the rocket card answers with a wiggle. */
  launch: boolean
  /** The lab card: the next card's picture and a jar for each thing it waits for; or, while the choice waits, the two cards to pick from. */
  lab: { next: CardId | null; jars: Jar[]; choice: boolean }
  /** The whole path, as the lab card's tap shows it. */
  path: PathCard[]
  /** The tray: the pencil (its pattern, lit when it is the tool), the stickers in arrival order, the hedge once given, the peel, and Oops (greyed with nothing to undo). */
  tray: { pencil: { pattern: number; lit: boolean }; stickers: TrayButton[]; hedge: TrayButton | null; peel: boolean; oops: boolean }
  /** The card that is up: its picture's card (and its one word, src/words.ts). */
  card: { id: CardId; at: number } | null
  /** none; falling: dusk and the tuck-in; done: the still card. */
  night: 'none' | 'falling' | 'done'
  /** The pause menu's Good night would begin a night: none is falling and no launch runs (the rules let neither be cut short), so it is greyed while either does. */
  goodnight: boolean
  /** The launch's sky fills the screen: the board has slid more than half away under it (draw/rocket.ts launchSlide), and the top strip and the tray slide away with it until the board comes home, so nothing covers the flight. */
  sky: boolean
  /** The choice card is up in the middle: the lab's one choice waits and nothing else covers the board (choiceCard). */
  ask: boolean
  /** The cards found today (since this session began): the still card's small pictures. */
  today: CardId[]
  switches: Switches
}

/** The path in the order she meets it: Bubbles! and Hedges! in the order she picked (Bubbles! first until she does). */
export function pathOrder(s: State): CardId[] {
  const ids = PATH.map((c) => c.id)
  if (s.choice !== 'hedges') return ids
  const b = ids.indexOf('bubbles')
  const h = ids.indexOf('hedges')
  ids[b] = 'hedges'
  ids[h] = 'bubbles'
  return ids
}

/** The stickers she has been given, in the order they first arrived: the start's, then each card's as she found it. The hedge has a button of its own and is not among them. */
export function arrivals(s: State): Placeable[] {
  const out: Placeable[] = []
  const add = (gives: Partial<Record<Sticker, number>>) => {
    for (const [k, n] of Object.entries(gives) as [Sticker, number][]) if (k !== 'hedge' && n > 0 && !out.includes(k)) out.push(k)
  }
  add(START_STICKERS)
  for (const id of s.found) add(card(id).gives)
  return out
}

/** Whether any card found so far (or the start) gave hedges. */
const hedgesGiven = (s: State) => (START_STICKERS.hedge ?? 0) > 0 || s.found.some((id) => (card(id).gives.hedge ?? 0) > 0)

/**
 * The one sticker that wears New!: a kind she has been given and never placed (the hedge: never
 * drawn), one left in the tray. When the hint offers a sticker's ghost (its 'place' step) it is
 * that one, so the tray and the board bounce the same thing; else the first the chain needs
 * (the order of PLACEABLE, the hedge last). None at night, when the one thing bouncing is the
 * machine to tuck in, nor while the choice card is up: its two pictures are the step, and
 * nothing bounces behind it. Null when none is new.
 */
export function freshSticker(s: State): Sticker | null {
  if (s.night !== null || choiceCard(s)) return null
  const given = arrivals(s)
  const fresh = (k: Sticker) => (k === 'hedge' ? hedgesGiven(s) && s.help.hedges === 0 : given.includes(k) && s.help.placed[k] === 0 && !s.buildings.some((b) => b.kind === k)) && stickersLeft(s, k) > 0
  const step = s.hint?.step
  if (step !== undefined && step.kind === 'place' && fresh(step.sticker)) return step.sticker
  return [...PLACEABLE, 'hedge' as const].find(fresh) ?? null
}

/** The choice card comes up in the middle of the board while the lab's one choice waits (Bubbles! or Hedges!) and nothing else covers it: once Play is pressed, with no card up, no night falling and no launch. Its two big pictures are the "which one?" moment; the lab card keeps them for later. */
export const choiceCard = (s: State) => choiceWaits(s) && s.playing && s.card === null && s.night === null && s.launch === null

/** A button of the tray: the pencil, a sticker's (the hedge's too), the peel or Oops. */
export type TrayKey = 'pencil' | 'peel' | 'oops' | Sticker

/** The tray's buttons in order, as Tray.tsx shows them and layout.ts trayBoxes lays them out: the pencil, the stickers in arrival order, the hedge once given, and with `tools` (a sideways screen) the peel and Oops at the end. */
export function trayOrder(tray: HudView['tray'], tools: boolean): TrayKey[] {
  return ['pencil', ...tray.stickers.map((b) => b.sticker), ...(tray.hedge === null ? [] : (['hedge'] as const)), ...(tools ? (['peel', 'oops'] as const) : [])]
}

/** The jars the next card fills: the rocket's legs before Gold!, the first gold bar before Science!, then the lab's bottles (each kind the card needs). */
function jarsOf(s: State, id: CardId | null): Jar[] {
  if (id === null) return []
  const needs = card(id).needs
  switch (needs.kind) {
    case 'legs':
      return [{ thing: 'blueBar', got: Math.min(needs.n, s.rocket.got[PARTS.indexOf('legs')]!), need: needs.n }]
    case 'goldBar':
      return [{ thing: 'goldBar', got: 0, need: 1 }]
    case 'bottles': {
      const jars: Jar[] = []
      const green = bottleCost(s, needs.green)
      const orange = bottleCost(s, needs.orange)
      if (green > 0) jars.push({ thing: 'greenBottle', got: Math.min(green, s.lab.got[0]), need: green })
      if (orange > 0) jars.push({ thing: 'orangeBottle', got: Math.min(orange, s.lab.got[1]), need: orange })
      return jars
    }
  }
}

/** Everything the HUD shows for the state at sim time t (seconds), with today's cards (the game keeps when the session began). */
export function hudView(s: State, t: number, today: readonly CardId[]): HudView {
  const next = nextCard(s)
  const waits = choiceWaits(s)
  const tool = s.tool
  const button = (sticker: Sticker, newOne: Sticker | null): TrayButton => ({
    sticker,
    left: stickersLeft(s, sticker),
    picked: sticker === 'hedge' ? tool.kind === 'hedge' : tool.kind === 'sticker' && tool.sticker === sticker,
    fresh: sticker === newOne,
  })
  const newOne = freshSticker(s)
  return {
    start: !s.playing,
    rocket: {
      parts: PARTS.map((part, i) => {
        const info = PART_INFO[part]
        return { part, open: info.opens === null || s.found.includes(info.opens), got: s.rocket.got[i]!, n: info.n }
      }),
      ready: launchReady(s),
    },
    launch: s.launch !== null,
    lab: { next: next === null ? null : next.id, jars: waits ? [] : jarsOf(s, next === null ? null : next.id), choice: waits },
    path: pathOrder(s).map((id): PathCard => ({ id, at: s.found.includes(id) ? 'done' : (waits && (id === 'bubbles' || id === 'hedges')) || (next !== null && next.id === id) ? 'now' : 'later' })),
    tray: {
      pencil: { pattern: s.pattern, lit: tool.kind === 'pencil' },
      stickers: arrivals(s).map((k) => button(k, newOne)),
      hedge: hedgesGiven(s) ? button('hedge', newOne) : null,
      peel: tool.kind === 'peel',
      oops: s.undo.length > 0,
    },
    card: s.card === null ? null : { id: s.card.id, at: s.card.at },
    night: s.night === null ? 'none' : s.night.doneAt >= 0 && since(s.night.doneAt, t) >= NIGHT_CARD ? 'done' : 'falling',
    goodnight: s.night === null && s.launch === null,
    sky: s.launch !== null && launchSlide(since(s.launch.at, t)) > 0.5,
    ask: choiceCard(s),
    today: [...today],
    switches: { ...s.switches },
  }
}

/** Whether two views show the same: the HUD re-renders only when they do not. Views are plain data built in one order, so their JSON compares them (an endless sticker's Infinity included, as null). */
export function sameHud(a: HudView, b: HudView): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
