/**
 * Magic House: the handles made code holds (engine/api.ts Solid, Mover, Thing, Decor, Zone, Lamp,
 * Sign, Player), each a frozen face (engine/checks.ts) over the sim (engine/sim.ts) by its id. A
 * read reads the World as it is now and gives back frozen points and lists; an act checks what it
 * is given and passes it to the sim, which keeps the referee's rules. The same thing always comes
 * as the same handle, so made code may compare them with === and key a Map by them.
 *
 * One Handles serves one view of a room: the room's own (reads and acts, its own player handles),
 * or the walkthrough's (step 3: reads only, an act refused with its own sentence, and each player's
 * handle the bot that plays them, so every read that gives back a player gives back that bot). The
 * house's own solids (step 7a), which made code meets as what a player stands on, only read in either
 * view: in the room's an act on one says that it is the house's (MISTAKES.houseOwns).
 */

import type { SeatIndex } from '../seats/types'
import type * as Api from './api'
import { MISTAKES, SURVEY_NOTES, WORDS_MAX, type SignText } from './api'
import { bool, colour, face, frozenPoint, Mistake, num, options, point, text, words, type Refused } from './checks'
import {
  bonk,
  addScore,
  changePlayer,
  drop,
  entryOf,
  give,
  glow,
  goHome,
  hide,
  housePart,
  moverMoving,
  moverSlideBy,
  moverSpeed,
  moverTurnBy,
  pointOf,
  pose,
  pushPlayer,
  pushThing,
  putAt,
  putPlayer,
  setLamp,
  setSurface,
  setZone,
  show,
  slideTo,
  turnTo,
  writeSign,
  zoneWeight,
  type Sim,
} from './sim'
import { whereOf, type BodyKind } from './state'
import type { HandleId, SignShown, Surface } from './world'

/** How one view of a room makes its handles. */
export interface HandleOptions {
  /** False for a view that only reads (the walkthrough): every act is refused with `refuse`. */
  readonly acts: boolean
  /** The handle for each seat's player, made from that player's reads (the walkthrough's bot), or null for the room's own. */
  readonly player: ((seat: SeatIndex, reads: Api.PlayerView) => object) | null
  readonly refuse: (what: string, key: string) => string
  /** One turn of the budget, counted before every call. */
  readonly turn: () => void
  /** A note for the survey of the room as built (a player's start put on z = 0). */
  readonly note: (text: string) => void
  /** A player's start was given (p.putAt while building). */
  readonly started: (seat: SeatIndex) => void
}

/** What a kind of handle is called in a sentence. */
export const KIND_WORD: Readonly<Record<BodyKind, string>> = { player: 'player', solid: 'solid', mover: 'mover', thing: 'thing', decor: 'decor', zone: 'zone', lamp: 'lamp', sign: 'sign' }

/** What a sign shows, as made code wrote it. */
function signText(shown: SignShown): SignText {
  if (typeof shown === 'object' && 'from' in shown) return Object.freeze({ clock: shown.clock })
  return typeof shown === 'object' ? Object.freeze({ ...shown }) : shown
}

/** What a sign is given to show, checked: a number, words, a count or a clock. */
export function signWhat(call: string, v: unknown): SignText {
  if (typeof v === 'number') return num(call, 'what', v)
  if (typeof v !== 'object' || v === null) throw new Mistake(MISTAKES.notSign(call))
  const o = v as Record<string, unknown>
  if ('en' in o || 'fi' in o) return words(call, v, WORDS_MAX.sign)
  if ('clock' in o && Object.keys(o).length === 1) return { clock: Math.max(0, num(call, 'clock', o.clock)) }
  if ('count' in o && 'of' in o && Object.keys(o).length === 2) return { count: num(call, 'count', o.count), of: num(call, 'of', o.of) }
  throw new Mistake(MISTAKES.notSign(call))
}

/** A glow's colour and pulse, checked: null stops it. */
function glowOf(call: string, color: unknown, pulse: unknown) {
  if (color === null) return null
  return { color: colour(call, 'color', color), pulse: pulse === undefined ? false : bool(call, 'pulse', pulse) }
}

const SOLID_CHANGES = ['color', 'ice', 'bounce', 'belt', 'through'] as const
const ZONE_CHANGES = ['color', 'wind', 'pull', 'gravity', 'drag'] as const
const LAMP_CHANGES = ['color', 'power', 'reach'] as const
const PLAYER_CHANGES = ['speed', 'jump', 'size', 'weight'] as const

export class Handles {
  private readonly faces: object[] = []
  private readonly ids = new WeakMap<object, HandleId>()

  constructor(
    readonly sim: Sim,
    private readonly opts: HandleOptions,
  ) {
    for (const p of sim.world.players) {
      const f = opts.player === null ? this.dress('player', this.playerReads(p.seat), this.playerActs(p.seat)) : opts.player(p.seat, this.playerReads(p.seat))
      this.faces[p.id] = f
      this.ids.set(f, p.id)
    }
  }

  /** The handle of any id, made the first time it is asked for. */
  of(id: HandleId): object {
    const known = this.faces[id]
    if (known !== undefined) return known
    const made = this.make(id)
    this.faces[id] = made
    this.ids.set(made, id)
    return made
  }

  /** The id of a handle of this view, or null for anything else. */
  idOf(v: unknown): HandleId | null {
    if (typeof v !== 'object' || v === null) return null
    return this.ids.get(v) ?? null
  }

  /** The id of a handle of one of these kinds, or the sentence. */
  idOfKind(call: string, arg: string, v: unknown, kinds: readonly BodyKind[], said: string): HandleId {
    const id = this.idOf(v)
    if (id === null || !kinds.includes(whereOf(this.sim, id).kind)) throw new Mistake(MISTAKES.notHandle(call, arg, said))
    return id
  }

  /** A face with a view's reads, and its acts unless the view only reads. */
  private dress(kind: BodyKind, reads: object, acts: object): object {
    const what = KIND_WORD[kind]
    const refused: Refused | null = this.opts.acts ? null : { keys: Object.keys(acts), sentence: (key) => this.opts.refuse(what, key) }
    return face(what, { ...reads, ...acts }, this.opts.turn, refused)
  }

  /** A player's reads (engine/api.ts PlayerView): the walkthrough's bots have them too, beside their verbs. */
  playerReads(seat: SeatIndex): Api.PlayerView {
    const sim = this.sim
    const p = () => sim.world.players[seat]
    return {
      kind: () => 'player',
      at: () => frozenPoint(p().at),
      velocity: () => frozenPoint(p().velocity),
      facing: () => frozenPoint(sim.world.view === 'high' ? p().heading : [p().facing, 0, 0]),
      stick: () => Object.freeze([p().input.stick[0], p().input.stick[1]] as const),
      button: (name: unknown) => {
        const b = name === 'a' || name === 'b' ? name : null
        if (b === null) throw new Mistake(MISTAKES.notChoice('p.button(name)', 'name', String(name), ['a', 'b']))
        return p().input[b]
      },
      holding: () => {
        const h = p().holding
        return h === null ? null : (this.of(h) as Api.ThingView)
      },
      standingOn: () => {
        const on = p().on
        return on === null ? null : (this.of(on) as Api.PlacedView | Api.PlayerView)
      },
      score: () => p().score,
      color: () => p().color,
    } satisfies Api.PlayerView
  }

  private playerActs(seat: SeatIndex): Omit<Api.Player, keyof Api.PlayerView> {
    const sim = this.sim
    return {
      glow: (color: unknown, pulse?: unknown) => glow(sim, seat, glowOf('p.glow', color, pulse)),
      putAt: (at: unknown) => {
        const v = point('p.putAt', 'at', at)
        if (sim.building && v[2] !== 0 && sim.world.view === 'side') this.opts.note(SURVEY_NOTES.zSet('p.putAt', v[2]))
        if (sim.building) this.opts.started(seat)
        putPlayer(sim, seat, v)
      },
      push: (v: unknown) => pushPlayer(sim, seat, point('p.push', 'v', v)),
      change: (changes: unknown, secs: unknown) => {
        const o = options('p.change', changes, PLAYER_CHANGES)
        const k = (key: (typeof PLAYER_CHANGES)[number]) => (o[key] === undefined ? 1 : num('p.change', key, o[key]))
        changePlayer(sim, seat, { speed: k('speed'), jump: k('jump'), size: k('size'), weight: k('weight') }, num('p.change', 'secs', secs))
      },
      bonk: () => bonk(sim, seat),
      give: (thing: unknown) => give(sim, seat, this.idOfKind('p.give', 'thing', thing, ['thing'], 'a thing')),
      drop: () => drop(sim, seat),
      addScore: (n: unknown) => addScore(sim, seat, num('p.addScore', 'n', n)),
    } satisfies Omit<Api.Player, keyof Api.PlayerView>
  }

  /** A handle the room built, by its kind. */
  private make(id: HandleId): object {
    const sim = this.sim
    const kind = whereOf(sim, id).kind
    const what = KIND_WORD[kind]
    const entry = () => entryOf(sim, id)
    const at = () => frozenPoint(pointOf(sim, id))
    const hidden = () => entry().hidden
    const inMover = (move: string) => {
      if (entry().mover !== null) throw new Mistake(MISTAKES.moverPart(move))
    }
    const placedReads = { kind: () => kind as Api.Kind, at, hidden } satisfies Api.PlacedView
    const placedActs = {
      putAt: (to: unknown) => {
        const v = point(`${what}.putAt`, 'at', to)
        inMover(`${what}.putAt`)
        putAt(sim, id, v)
      },
      slideTo: (to: unknown, secs: unknown) => {
        const v = point(`${what}.slideTo`, 'at', to)
        const s = Math.max(0, num(`${what}.slideTo`, 'secs', secs))
        inMover(`${what}.slideTo`)
        slideTo(sim, id, v, s)
      },
      hide: () => hide(sim, id),
      show: () => {
        const wasHidden = entry().hidden
        show(sim, id)
        // A sign's clock empties from when it is shown.
        if (wasHidden && kind === 'sign') {
          const shown = sim.world.signs[whereOf(sim, id).i].what
          if (typeof shown === 'object' && 'from' in shown) writeSign(sim, id, { clock: shown.clock })
        }
      },
    } satisfies Omit<Api.Placed, keyof Api.PlacedView>
    const glows = { glow: (color: unknown, pulse?: unknown) => glow(sim, id, glowOf(`${what}.glow`, color, pulse)) } satisfies Api.Glows
    const poses = {
      pose: (part: unknown, rot: unknown, secs: unknown) => pose(sim, id, text(`${what}.pose`, 'part', part), point(`${what}.pose`, 'rot', rot), Math.max(0, num(`${what}.pose`, 'secs', secs))),
    } satisfies Api.Poses
    const turns = { turnTo: (turn: unknown, secs: unknown) => turnTo(sim, id, num(`${what}.turnTo`, 'turn', turn), Math.max(0, num(`${what}.turnTo`, 'secs', secs))) } satisfies Api.Turns
    const who = (v: HandleId) => this.of(v)

    switch (kind) {
      case 'solid': {
        const acts = {
          ...placedActs,
          ...glows,
          ...poses,
          ...turns,
          set: (changes: unknown) => {
            const o = options('solid.set', changes, SOLID_CHANGES)
            const c: Partial<Surface> = {}
            if (o.color !== undefined) c.color = colour('solid.set', 'color', o.color)
            if (o.ice !== undefined) c.ice = bool('solid.set', 'ice', o.ice)
            if (o.bounce !== undefined) c.bounce = Math.max(0, num('solid.set', 'bounce', o.bounce))
            if (o.belt !== undefined) c.belt = point('solid.set', 'belt', o.belt)
            if (o.through !== undefined) c.through = bool('solid.set', 'through', o.through)
            setSurface(sim, id, c)
          },
        } satisfies Omit<Api.Solid, keyof Api.SolidView>
        // The house's own floor, walls and ceiling (world.ts Solid.house) are read as any solid is, and never changed: a room that acts on what a player stands on meets the house's floor too.
        if (this.opts.acts && sim.world.solids[whereOf(sim, id).i].house) return face(what, { ...placedReads, ...acts }, this.opts.turn, { keys: Object.keys(acts), sentence: (key) => MISTAKES.houseOwns(`solid.${key} on the house's ${housePart(sim, id)}`) })
        return this.dress(kind, placedReads, acts)
      }
      case 'thing': {
        const th = () => sim.world.things[whereOf(sim, id).i]
        const reads = {
          ...placedReads,
          velocity: () => frozenPoint(th().velocity),
          heldBy: () => {
            const seat = th().heldBy
            return seat === null ? null : (who(seat) as Api.PlayerView)
          },
        } satisfies Api.ThingView
        return this.dress(kind, reads, {
          ...placedActs,
          ...glows,
          ...poses,
          push: (v: unknown) => pushThing(sim, id, point('thing.push', 'v', v)),
          goHome: () => goHome(sim, id),
        } satisfies Omit<Api.Thing, keyof Api.ThingView>)
      }
      case 'decor':
        return this.dress(kind, placedReads, { ...placedActs, ...glows, ...poses, ...turns } satisfies Omit<Api.Decor, keyof Api.DecorView>)
      case 'zone': {
        const z = () => sim.world.zones[whereOf(sim, id).i]
        const reads = {
          ...placedReads,
          has: (v: unknown) => z().inside.includes(this.idOfKind('zone.has', 'who', v, ['player', 'thing'], 'a player or a thing')),
          inside: () => Object.freeze(z().inside.map((i) => who(i) as Api.PlayerView | Api.ThingView)),
          weight: () => zoneWeight(sim, id),
        } satisfies Api.ZoneView
        return this.dress(kind, reads, {
          ...placedActs,
          ...glows,
          set: (changes: unknown) => {
            const o = options('zone.set', changes, ZONE_CHANGES)
            const c: Parameters<typeof setZone>[2] = {}
            if (o.color !== undefined) c.color = o.color === null ? null : colour('zone.set', 'color', o.color)
            if (o.wind !== undefined) c.wind = point('zone.set', 'wind', o.wind)
            if (o.pull !== undefined) c.pull = num('zone.set', 'pull', o.pull)
            if (o.gravity !== undefined) c.gravity = num('zone.set', 'gravity', o.gravity)
            if (o.drag !== undefined) c.drag = Math.max(0, Math.min(1, num('zone.set', 'drag', o.drag)))
            setZone(sim, id, c)
          },
        } satisfies Omit<Api.Zone, keyof Api.ZoneView>)
      }
      case 'lamp':
        return this.dress(kind, placedReads, {
          ...placedActs,
          set: (changes: unknown) => {
            const o = options('lamp.set', changes, LAMP_CHANGES)
            const c: Parameters<typeof setLamp>[2] = {}
            if (o.color !== undefined) c.color = colour('lamp.set', 'color', o.color)
            if (o.power !== undefined) c.power = Math.max(0, Math.min(1, num('lamp.set', 'power', o.power)))
            if (o.reach !== undefined) c.reach = Math.max(0, num('lamp.set', 'reach', o.reach))
            setLamp(sim, id, c)
          },
        } satisfies Omit<Api.Lamp, keyof Api.LampView>)
      case 'sign': {
        const reads = { ...placedReads, what: () => signText(sim.world.signs[whereOf(sim, id).i].what) } satisfies Api.SignView
        return this.dress(kind, reads, { ...placedActs, write: (v: unknown) => writeSign(sim, id, signWhat('sign.write', v)) } satisfies Omit<Api.Sign, keyof Api.SignView>)
      }
      case 'mover': {
        const m = () => sim.world.movers[whereOf(sim, id).i]
        const reads = {
          kind: () => 'mover',
          at: () => frozenPoint(m().at),
          turn: () => m().turn,
          clock: () => m().clock,
          moving: () => moverMoving(sim, id),
          hidden: () => m().hidden,
        } satisfies Api.MoverView
        return this.dress(kind, reads, {
          ...glows,
          speed: (k: unknown) => moverSpeed(sim, id, num('mover.speed', 'k', k)),
          slideBy: (by: unknown, secs: unknown) => moverSlideBy(sim, id, point('mover.slideBy', 'by', by), Math.max(0, num('mover.slideBy', 'secs', secs))),
          turnBy: (turn: unknown, secs: unknown) => moverTurnBy(sim, id, num('mover.turnBy', 'turn', turn), Math.max(0, num('mover.turnBy', 'secs', secs))),
          hide: () => hide(sim, id),
          show: () => show(sim, id),
        } satisfies Omit<Api.Mover, keyof Api.MoverView>)
      }
      case 'player':
        throw new Error(`player ${id} has its handle from the start`)
    }
  }
}
