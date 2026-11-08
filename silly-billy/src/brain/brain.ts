/**
 * The brain: words in, things happening out. Words heard before play their saved plan at
 * once; the small parser takes what is clear; the interpreter (Haiku, through the dev server)
 * works out the rest; with no server the parser's best guess plays anyway. What nobody has
 * made yet is designed (Opus) while it is needed: a new thing's quick draft stands in the
 * room at once, a new action's avatar thinks it through. Each design is tested in a fresh
 * worker, sent back once to be fixed, then joins the library, is saved and plays. Whatever
 * happens, something happens on screen: an avatar listens, thinks, acts, or shrugs.
 *
 * The brain follows the sim through `see(events)`, which the game calls every frame with the
 * events it drains: what started (the camera leans toward a new action, a kept answer is
 * said), what finished (a changed look is saved, the HUD line says done) and what failed (a
 * made action that fails twice goes back to the designer). Everything said, planned, made and
 * timed is logged.
 *
 * Words wait for the interpreter while the child goes on talking, so a plan that comes late
 * leaves alone whoever newer words reached ("seis" holds), and then changes no room, since that
 * would end what everyone does. Words are remembered as a phrase only when they mean the same
 * next time (no "hänelle" or "kaikki", no room everyone is in) and as the whole plan for them.
 *
 * Everything the brain shows and says is in the language the game is played in (`world.lang`):
 * the line of what was heard keeps both languages, so the HUD shows the one chosen now, while a
 * bubble and a voice take the language at the moment they start.
 */

import { castNamesFor, makeCast, NEW_NAMES } from '../content'
import { inLang, type Lang, type Words } from '../engine/lang'
import { parseColor } from '../engine/kit'
import type { Library } from '../engine/library'
import { planUses, slugOf, type ActionEntry, type AvatarEntry, type InventRequest, type ItemEntry, type LogLine, type LookChange, type NewAvatar, type NewItem, type Param, type PhraseEntry, type Plan, type SaveRequest } from '../engine/protocol'
import { insideRoom, ROOM_GEO } from '../engine/rooms'
import { newActor, type Reaction, type Sim } from '../engine/sim'
import { ROOMS, SLOTS, type Actor, type BodyKind, type Look, type RoomId, type Slot, type Step, type WorldEvent } from '../engine/types'
import { interpreterContext, takenNames } from './context'
import type { BrainApi, BrainDeps, HeardBy, HeardLine, Job, Link } from './contract'
import { actorNamed, meansTheSame, nameIn, namedActors, phraseKey, understand } from './parse'
import { validateInWorker, type ValidateRequest } from './validate'

/** How many lines of what was heard the HUD keeps. */
const MAX_LINES = 12
const BUBBLE_SECS = 2.5
/** A made action that fails this often at play time goes back to the designer. */
const FAILS_TO_FIX = 2
/**
 * How long the page waits at most, in ms: for the interpreter (the server asks twice at most,
 * 30 s each), and for a new thing or action in all, every round (the server allows the designer
 * 90 s a call). Made in 10 to 20 s as a rule; past this a child has stopped waiting, so whoever
 * waits shrugs and the request is called off (the server kills the process).
 */
const WAITS = { interpret: 45_000, job: 90_000 }

/** A signal that aborts after `ms`, and the way to stop its timer once the answer is in. */
function deadline(ms: number): { signal: AbortSignal; clear: () => void } {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(new Error('it took too long')), Math.max(0, ms))
  return { signal: ctl.signal, clear: () => clearTimeout(timer) }
}

/** What an avatar says as it starts thinking a new action through (the brief's "thinking this through"), in the bubble and aloud. */
const THINKING = { en: 'Let me think this through!', fi: 'Hmm, mietitäänpä!' }
/** A bubble with the thinking line in either language: the language may have changed since it was said. */
const isThinking = (text: string) => text === THINKING.en || text === THINKING.fi
/** Words with more after them, in each language: "Alice spins (you said something newer)". */
const plus = (words: Words, more: { en: string; fi: string }): Words => ({ en: inLang(words, 'en') + more.en, fi: inLang(words, 'fi') + more.fi })

/** A new avatar's body before the interpreter's changes. */
const BASE_LOOKS: Record<BodyKind, Look> = {
  kid: { body: 'kid', height: 1.15, build: 1, skin: '#f3c9a8', eyes: '#3a2a22', top: '#f5d33b', bottom: '#4a78e0', shoes: '#e8503f', skirt: false, worn: {} },
  grownup: { body: 'grownup', height: 1.6, build: 1, skin: '#e9b98f', eyes: '#3a2a22', top: '#5ec25a', bottom: '#5e6570', shoes: '#5a3a24', skirt: false, worn: {} },
  cat: { body: 'cat', height: 0.5, build: 1, skin: '#9aa3ad', eyes: '#9be02f', top: '#9aa3ad', bottom: '#9aa3ad', shoes: '#9aa3ad', skirt: false, worn: {} },
  dog: { body: 'dog', height: 0.6, build: 1, skin: '#c98a4a', eyes: '#3a2a22', top: '#c98a4a', bottom: '#c98a4a', shoes: '#c98a4a', skirt: false, worn: {} },
}

/** What an avatar answers, in both languages: the bubble shows and the voice says the one the game is played in. */
interface Answer {
  actor: string
  say: Words
}

/** A command on its way: its HUD line and the steps it still has, per actor. */
interface Command {
  line: HeardLine
  words: string
  /** performance.now() when the words came. */
  t0: number
  /** The room when the words came: a plan that comes after the room changed leaves the room alone. */
  room: RoomId
  left: Map<string, number>
  failed: boolean
  /** The answer, kept while the one who says it thinks a new action through: said when that action starts. */
  answer: Answer | null
}

/** A job and what it needs: the designer's request (a fix is added per round) and, for an action, the step to test it with. */
interface Task {
  job: Job
  request: InventRequest
  /** A runtime failure starts the job as a fix. */
  fix: { code: string; error: string } | undefined
  tryOn: { actor: string; args: Record<string, string> } | null
  t0: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
const ms = (t0: number) => Math.round(performance.now() - t0)
const secs = (t0: number) => Math.round((performance.now() - t0) / 100) / 10
const now = () => new Date().toISOString()
const unique = <T>(list: T[]) => [...new Set(list)]
/** An id the way the dev server stores it. */
const slug = slugOf

/** A game's players arg: the names in each part (commas or spaces apart), each once, without the one who starts it. */
function playersOf(starter: string, parts: readonly (string | undefined)[]): string {
  const names = parts.flatMap((p) => (p ?? '').split(/[\s,]+/)).map((n) => n.trim()).filter((n) => n !== '' && n.toLowerCase() !== starter)
  return unique(names).join(',')
}

const withoutRoom = (plan: Plan): Plan => {
  const copy = { ...plan }
  delete copy.room
  return copy
}

function lookOf(change: LookChange): Look {
  const base = BASE_LOOKS[change.body ?? 'kid']
  const size = (v: number | undefined, fallback: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback)
  return {
    body: base.body,
    height: size(change.height, base.height, 0.3, 3),
    build: size(change.build, base.build, 0.6, 1.6),
    skin: parseColor(change.skin) ?? base.skin,
    eyes: parseColor(change.eyes) ?? base.eyes,
    top: parseColor(change.top) ?? base.top,
    bottom: parseColor(change.bottom) ?? base.bottom,
    shoes: parseColor(change.shoes) ?? base.shoes,
    skirt: change.skirt ?? base.skirt,
    worn: {},
  }
}

const draftOf = (spec: NewItem, words: string): ItemEntry => ({
  type: 'item',
  id: spec.id,
  name: spec.name,
  nameFi: spec.nameFi,
  calls: spec.calls,
  about: spec.about,
  code: null,
  guarded: null,
  tick: null,
  tickGuarded: null,
  rough: spec.rough,
  roughMeta: spec.meta,
  by: 'haiku',
  asked: words,
  made: now(),
})

export class Brain implements BrainApi {
  lines: HeardLine[] = []
  jobs: Job[] = []
  addressee: string | null = null
  private readonly deps: BrainDeps
  private readonly sim: Sim
  private readonly library: Library
  private readonly link: Link
  private serial = 0
  /** The avatar made last: "give her a crown" after "make a new girl". */
  private lastMade: string | null = null
  /** The dev server is there (in development only), so what is made is saved. */
  private readonly server = import.meta.env.DEV
  private readonly commands = new Map<number, Command>()
  /** Jobs in flight by 'kind:id': two commands needing the same new thing share one. */
  private readonly inflight = new Map<string, Promise<boolean>>()
  /** Everything still running in the background: jobs, saves, phrases. */
  private readonly background = new Set<Promise<unknown>>()
  /** Actions just made and not played yet: whoever starts one gets the camera. */
  private readonly fresh = new Set<string>()
  private spot: { actor: string; action: string } | null = null
  private readonly failures = new Map<string, number>()
  /** Each actor's look as last saved (or as it began). */
  private readonly looks = new Map<string, string>()
  /** Actors listening while the interpreter works on their words, and for how many commands. */
  private readonly asking = new Map<string, number>()
  /** Each actor's newest command that gave it steps or stopped it: a plan that comes later for older words leaves it alone. */
  private readonly touched = new Map<string, number>()
  /** Jobs by 'kind:id' whose thing was forgotten while they ran: out of the HUD's sight, and what they make is not taken in. */
  private readonly cancelled = new Map<string, Job>()

  constructor(deps: BrainDeps) {
    this.deps = deps
    this.sim = deps.sim
    this.library = deps.library
    this.link = deps.link
    for (const a of this.sim.world.actors) this.looks.set(a.id, this.lookKey(a))
  }

  // ------------------------------------------------------------------ BrainApi

  async start(): Promise<void> {
    const t0 = performance.now()
    try {
      const data = await this.link.library()
      const broken: string[] = []
      for (const e of data.items) {
        const r = this.library.addItem(e)
        if (!r.ok) broken.push(`item ${e.id}: ${r.error}`)
      }
      for (const e of data.actions) {
        const r = this.library.addAction(e)
        if (!r.ok) broken.push(`action ${e.id}: ${r.error}`)
      }
      for (const e of data.avatars) this.bringIn(e)
      // Words that point ("kaikki", "heille"), kept before such words were left out, would play whoever they meant then: they are asked again.
      for (const p of data.phrases) if (meansTheSame(p.words)) this.library.addPhrase(p)
      if (broken.length > 0) console.warn('Silly Billy: made things that did not load:', broken)
      this.log({ kind: 'start', claude: this.link.online, items: data.items.length, actions: data.actions.length, avatars: data.avatars.length, phrases: data.phrases.length, broken, ms: ms(t0) })
    } catch (err) {
      console.error('Silly Billy could not load what was made before:', err)
    }
    this.changed()
  }

  async hear(words: string): Promise<void> {
    const line: HeardLine = { serial: ++this.serial, words, heard: '', who: [], by: null, status: 'understanding', took: null }
    const command: Command = { line, words, t0: performance.now(), room: this.sim.world.room, left: new Map(), failed: false, answer: null }
    this.commands.set(line.serial, command)
    this.lines = [...this.lines.slice(1 - MAX_LINES), line]
    this.hearing('')
    this.log({ kind: 'heard', serial: line.serial, words })
    this.changed()
    try {
      await this.understandAndDo(command)
    } catch (err) {
      console.error('Silly Billy: a command broke:', err)
      this.log({ kind: 'error', serial: line.serial, words, error: String(err) })
      Object.assign(line, { status: 'failed', took: secs(command.t0) })
      this.commands.delete(line.serial)
      try {
        this.react(this.fallbackWho(), 'shrug')
      } catch (again) {
        console.error('Silly Billy: not even a shrug:', again)
      }
    }
    this.changed()
  }

  hearing(partialWords: string): void {
    const named = new Set(partialWords === '' ? [] : namedActors(partialWords, this.sim.world))
    for (const a of this.sim.world.actors) a.listening = named.has(a.id) || (this.asking.get(a.id) ?? 0) > 0
  }

  async forgetNewest(): Promise<Words | null> {
    const world = this.sim.world
    const made = [
      ...[...this.library.items.values()].flatMap((i) => (i.entry === null ? [] : [{ type: 'item' as const, id: i.id, name: { en: i.name, fi: i.nameFi }, made: i.entry.made }])),
      ...[...this.library.actions.values()].flatMap((a) => (a.entry === null ? [] : [{ type: 'action' as const, id: a.id, name: { en: a.name, fi: a.nameFi }, made: a.entry.made }])),
      // An avatar by the name it goes by now: a starting one's follows the language.
      ...[...this.library.avatars.values()].map((a) => ({ type: 'avatar' as const, id: a.id, name: world.actors.find((x) => x.id === a.id)!.name, made: a.made })),
    ]
    const newest = made.sort((a, b) => b.made.localeCompare(a.made))[0]
    if (newest === undefined) return null
    // Still being made (a draft, or a fix): the job runs on out of sight, and what it makes is not taken in.
    const key = `${newest.type}:${newest.id}`
    const job = this.jobs.find((j) => `${j.kind}:${j.id}` === key)
    if (job !== undefined && this.inflight.has(key)) {
      this.cancelled.set(key, job)
      this.jobs = this.jobs.filter((j) => j !== job)
    }
    this.library.forget(newest.type, newest.id)
    if (newest.type === 'avatar') {
      const actor = world.actors.find((a) => a.id === newest.id)
      const first = makeCast(this.lang).find((a) => a.id === newest.id)
      if (actor !== undefined && first !== undefined) {
        // A starting avatar goes back to how it began, its names in both languages too.
        Object.assign(actor, { name: first.name, calls: first.calls, names: first.names, pronoun: first.pronoun, look: first.look, scale: 1 })
        this.looks.set(actor.id, this.lookKey(actor))
      } else if (actor !== undefined) {
        this.settle(actor.id)
        this.sim.removeActor(actor.id)
        if (this.addressee === actor.id) this.addressee = null
        if (this.lastMade === actor.id) this.lastMade = null
      }
    } else if (newest.type === 'item') {
      for (const it of world.items.filter((i) => i.kind === newest.id)) this.sim.removeItem(it.id)
      for (const room of ROOMS) world.away[room] = world.away[room].filter((i) => i.kind !== newest.id)
      for (const a of world.actors) for (const slot of SLOTS) if (a.look.worn[slot]?.kind === newest.id) delete a.look.worn[slot]
    } else {
      // Whoever waits to do it stops waiting (the sim would wait for it forever) and their line ends; whoever is doing it finishes.
      this.fresh.delete(newest.id)
      this.failures.delete(newest.id)
      for (const a of world.actors) {
        const waiting = a.queue.filter((s) => s.action === newest.id)
        if (waiting.length === 0) continue
        this.sim.dropSteps(a.id, newest.id)
        for (const s of waiting) {
          const command = this.commands.get(s.serial)
          if (command !== undefined) this.stepsOver(command, a.id, 1, true)
        }
      }
    }
    // The phrases that use it go too, as on disk; a starting avatar stays, and so do its phrases.
    if (newest.type !== 'avatar' || !world.actors.some((a) => a.id === newest.id)) {
      for (const [words, phrase] of this.library.phrases) if (planUses(phrase.plan, newest.type, newest.id)) this.library.phrases.delete(words)
    }
    if (this.server) await this.link.forget({ type: newest.type, id: newest.id })
    this.log({ kind: 'forget', type: newest.type, id: newest.id })
    this.changed()
    return newest.name
  }

  // ------------------------------------------------------------------ following the sim

  /** The sim's events since the last frame; the game passes them here before it drains them. */
  see(events: readonly WorldEvent[]): void {
    for (const e of events) {
      if (e.type === 'hit') continue
      const command = this.commands.get(e.step.serial)
      if (e.type === 'started') {
        if (this.fresh.delete(e.step.action)) {
          this.spot = { actor: e.actor, action: e.step.action }
          this.sim.world.spotlight = e.actor
        }
        if (command !== undefined && command.answer !== null && command.answer.actor === e.actor) {
          // Thought through: now the answer ("Watch me!"), unless the action already says something.
          this.answer(command.answer, false)
          command.answer = null
        }
        if (command !== undefined && command.line.status !== 'doing') {
          command.line.status = 'doing'
          this.changed()
        }
        continue
      }
      if (this.spot !== null && this.spot.actor === e.actor && this.spot.action === e.step.action) this.endSpot()
      if (command !== undefined) this.stepsOver(command, e.actor, 1, e.type === 'failed')
      if (e.type === 'failed') this.playFailed(e.actor, e.step, e.error)
      this.waitAloud(e.actor)
      // The doer's look, and the look of anyone the step names (Alice paints Steve), are kept when they changed.
      const painted = e.step.action === 'paint' ? (e.step.args.thing ?? e.actor) : null
      for (const id of new Set([e.actor, ...Object.values(e.step.args)])) this.keepLook(id, command?.words ?? null, id === painted)
    }
  }

  /** Resolves when nothing is being made, saved or remembered any more: for tests and screenshots. */
  async settled(): Promise<void> {
    while (this.background.size > 0) await Promise.all(this.background)
  }

  // ------------------------------------------------------------------ understanding

  private async understandAndDo(command: Command): Promise<void> {
    const key = phraseKey(command.words)
    if (key === '') return this.puzzled(command, [], { en: 'nothing heard', fi: 'ei kuulunut mitään' }, null)
    const phrase = this.library.phrases.get(key)
    if (phrase !== undefined && this.playable(phrase.plan)) return this.execute(phrase.plan, command, 'phrase', false)
    const u = understand(command.words, this.library, this.sim.world, this.addressee)
    if (u.kind === 'stop') return this.stop(u.who, command)
    this.log({ kind: 'parsed', serial: command.line.serial, confident: u.confident, plan: u.plan })
    if (u.confident) return this.execute(u.plan, command, 'local', false)
    let guess = u.plan
    if (this.link.online) {
      const plan = await this.interpret(command, u.plan.who)
      // The words were said a while ago: what the child said since comes first.
      const late = this.stillMeant(plan ?? u.plan, command)
      if (late === null) return this.overtaken(command, plan ?? u.plan, plan === null ? 'offline' : 'interpreter')
      // Only the whole plan is what the words mean next time: one cut short by newer words is not kept.
      if (plan !== null) return this.execute(late, command, 'interpreter', late === plan)
      guess = late
    }
    if (guess.steps.length > 0 || guess.room !== undefined) return this.execute(guess, command, 'offline', false)
    this.puzzled(command, guess.who, { en: 'not sure what to do', fi: 'en tiedä, mitä tehdä' }, 'offline')
  }

  /**
   * A plan that comes after a wait, without what newer words took over: the steps of anyone a
   * newer command gave steps to or stopped (the newest words win, "seis" too), and the room when
   * it changed meanwhile or when anyone got newer words, since a room change ends what everyone
   * does. The same plan when nothing changed; null when nothing is left to do.
   */
  private stillMeant(plan: Plan, command: Command): Plan | null {
    const newer = (serial: number | undefined) => serial !== undefined && serial > command.line.serial
    const made = plan.create?.id.toLowerCase()
    const reached = (who: string) => {
      const id = who.toLowerCase() === made ? null : this.actorFor(who)
      return id !== null && newer(this.touched.get(id))
    }
    const steps = plan.steps.filter((s) => !reached(s.who))
    const since = this.sim.world.room !== command.room || [...this.touched.values()].some(newer)
    if (steps.length === plan.steps.length && (plan.room === undefined || !since)) return plan
    // Cut short (someone got newer words, so the room goes too), or just its room left out: what is left plays where everyone is.
    if (steps.length === 0 && plan.create === undefined) return null
    return { ...withoutRoom(plan), who: plan.who.filter((w) => !reached(w)), steps }
  }

  /** Newer words took over all the words asked for while the interpreter thought (or the room they asked for changed): these come to nothing. */
  private overtaken(command: Command, plan: Plan, by: HeardBy): void {
    const heard = plus({ en: plan.heard, fi: plan.heardFi }, { en: ' (you said something newer)', fi: ' (sanoit jo jotain uutta)' })
    Object.assign(command.line, { heard, who: [], by, status: 'failed', took: secs(command.t0) })
    this.commands.delete(command.line.serial)
    this.log({ kind: 'overtaken', serial: command.line.serial, plan })
  }

  /** Asks the interpreter while the actors the words are for listen. Null when it failed: the parser's guess plays then. */
  private async interpret(command: Command, who: string[]): Promise<Plan | null> {
    const listeners = who.length > 0 ? who : this.sim.world.actors.map((a) => a.id)
    this.listen(listeners, 1)
    const t0 = performance.now()
    const wait = deadline((this.deps.waits ?? WAITS).interpret)
    try {
      const reply = await this.link.interpret({ words: command.words, lang: this.lang, context: this.context() }, wait.signal)
      this.log({ kind: 'interpreted', serial: command.line.serial, plan: reply.plan, ms: reply.ms, wait: ms(t0) })
      return reply.plan
    } catch (err) {
      console.warn('Silly Billy: the interpreter failed:', err)
      this.log({ kind: 'interpret-failed', serial: command.line.serial, error: String(err), wait: ms(t0) })
      return null
    } finally {
      wait.clear()
      this.listen(listeners, -1)
    }
  }

  private listen(ids: string[], change: 1 | -1): void {
    for (const id of ids) this.asking.set(id, Math.max(0, (this.asking.get(id) ?? 0) + change))
    for (const a of this.sim.world.actors) if (ids.includes(a.id)) a.listening = (this.asking.get(a.id) ?? 0) > 0
  }

  private puzzled(command: Command, who: string[], heard: Words, by: HeardBy | null): void {
    Object.assign(command.line, { heard, who, by, status: 'failed', took: secs(command.t0) })
    this.commands.delete(command.line.serial)
    this.react(who.length > 0 ? who : this.fallbackWho(), 'huh')
    this.log({ kind: 'puzzled', serial: command.line.serial, words: command.words })
  }

  private stop(who: string[], command: Command): void {
    const world = this.sim.world
    for (const id of who) {
      this.settle(id)
      this.sim.stop(id)
      world.actors.find((a) => a.id === id)!.thinking = null
      this.touch(id, command.line.serial)
    }
    if (this.spot !== null && who.includes(this.spot.actor)) this.endSpot()
    const names = (lang: Lang, all: string, and: string) => (who.length === world.actors.length ? all : who.map((id) => this.nameOf(id, lang)).join(` ${and} `))
    const heard = { en: `${names('en', 'Everyone', 'and')}: stop`, fi: `${names('fi', 'Kaikki', 'ja')}: seis` }
    Object.assign(command.line, { heard, who, by: 'local', status: 'done', took: secs(command.t0) })
    this.commands.delete(command.line.serial)
    this.log({ kind: 'stop', serial: command.line.serial, who })
  }

  // ------------------------------------------------------------------ doing

  /**
   * Plays a plan: the room first, then a new avatar, then the steps; a new thing's draft goes
   * into the library (and the room, unless a step makes it now) and a job designs the real one;
   * a new action gets a job while the actors waiting for it think, and say so. `remember`: the
   * interpreter's whole plan for the words, kept as a phrase for next time.
   */
  private execute(asked: Plan, command: Command, by: HeardBy, remember: boolean): void {
    const sim = this.sim
    const { line } = command
    // The room everyone is in already is nothing to do, and nothing to remember.
    const plan = asked.room === sim.world.room ? withoutRoom(asked) : asked
    if (plan.room !== undefined) sim.enterRoom(plan.room)
    const world = sim.world
    const renamed = new Map<string, string>()
    if (plan.create !== undefined) renamed.set(plan.create.id.toLowerCase(), this.makeAvatar(plan.create, command.words).id)
    const actorOf = (name: string) => renamed.get(name.toLowerCase()) ?? this.actorFor(name)
    const newActions = new Map(plan.newActions.map((a) => [slug(a.id), { ...a, id: slug(a.id) }]))
    const newItems = plan.newItems.map((i) => ({ ...i, id: slug(i.id) }))

    // The steps, per actor, of actions that exist or are being made. An action with a 'players' param is played together
    // (tag, football): the steps several actors were given for it are one step for the first, with the others as players.
    const steps = new Map<string, Step[]>()
    const dropped: string[] = []
    const together = new Map<string, { actor: string; step: Step }>()
    for (const s of plan.steps) {
      const actor = actorOf(s.who)
      const action = slug(s.action)
      if (actor === null || !(this.library.actions.has(action) || newActions.has(action) || this.inflight.has(`action:${action}`))) {
        dropped.push(`${s.who} ${s.action}`)
        continue
      }
      const args = Object.fromEntries(s.args.map((a) => [a.name, renamed.get(a.value.toLowerCase()) ?? a.value]))
      const params = this.library.actions.get(action)?.params ?? newActions.get(action)?.params ?? []
      if (params.some((p) => p.name === 'players')) {
        const game = together.get(action)
        if (game !== undefined) {
          game.step.args.players = playersOf(game.actor, [game.step.args.players, actor, args.players])
          continue
        }
        if (args.players !== undefined) args.players = playersOf(actor, [args.players])
        const step = { action, args, serial: line.serial }
        together.set(action, { actor, step })
        steps.set(actor, [...(steps.get(actor) ?? []), step])
        continue
      }
      steps.set(actor, [...(steps.get(actor) ?? []), { action, args, serial: line.serial }])
    }
    const all = [...steps]
    const uses = (step: Step, kind: string) => Object.values(step.args).includes(kind)
    for (const [actor, list] of all) {
      this.settle(actor)
      sim.give(actor, list, true)
      command.left.set(actor, list.length)
      this.touch(actor, line.serial)
    }

    // New things and new actions: a job each, shared with any command already waiting for the same.
    const jobs: Promise<boolean>[] = []
    for (const spec of newItems) {
      const known = this.library.items.get(spec.id)
      if (known !== undefined && (known.entry === null || known.entry.code !== null)) continue
      // A draft unless one stands in for a job already (one forgotten while its job runs comes back).
      if (known === undefined || !this.inflight.has(`item:${spec.id}`)) {
        const draft = this.library.addItem(draftOf(spec, command.words))
        if (!draft.ok) this.log({ kind: 'draft-failed', id: spec.id, error: draft.error })
      }
      const users = all.filter(([, list]) => list.some((s) => uses(s, spec.id))).map(([id]) => id)
      const madeNow = all.some(([, list]) => list.some((s) => uses(s, spec.id) && this.library.actions.has(s.action)))
      if (!madeNow && !world.items.some((i) => i.kind === spec.id)) this.placeDraft(spec.id, users[0] ?? null)
      jobs.push(this.startJob(this.task('item', spec.id, spec.name, spec.nameFi, users, { kind: 'item', spec, words: command.words, context: this.context() }, undefined, null)))
    }
    for (const spec of newActions.values()) {
      if (this.library.actions.has(spec.id)) continue
      const first = all.find(([, list]) => list.some((s) => s.action === spec.id))
      if (first === undefined) {
        this.log({ kind: 'unused-action', serial: line.serial, id: spec.id })
        continue
      }
      const tryOn = { actor: first[0], args: first[1].find((s) => s.action === spec.id)!.args }
      const users = all.filter(([, list]) => list.some((s) => s.action === spec.id)).map(([id]) => id)
      jobs.push(this.startJob(this.task('action', spec.id, spec.name, spec.nameFi, users, { kind: 'action', spec, words: command.words, context: this.context() }, undefined, tryOn)))
    }
    // Whoever waits for an action that is not there yet thinks about it; whoever waits from the start says so now.
    const waits = new Set<string>()
    for (const [actor, list] of all) {
      const waiting = list.find((s) => !this.library.actions.has(s.action))
      if (waiting === undefined) continue
      const job = this.jobs.find((j) => j.kind === 'action' && j.id === waiting.action)
      world.actors.find((a) => a.id === actor)!.thinking = { about: job?.name ?? waiting.action, since: world.t, progress: job?.progress ?? 0 }
      if (list[0] === waiting) waits.add(actor)
    }

    const who = unique([...plan.who.map(actorOf).filter((id) => id !== null), ...steps.keys()])
    const speaker = who[0] ?? this.fallbackWho()[0]
    // An answer from someone who must think first waits until the made action starts: "Watch me!" before the thinking is no answer.
    const answer: Answer | null = speaker === undefined ? null : { actor: speaker, say: { en: plan.say, fi: plan.sayFi } }
    // A first step that speaks is the answer itself: an "Okei!" before it would be cut off at once.
    const speaksFirst = speaker !== undefined && steps.get(speaker)?.[0]?.action === 'say'
    if (answer !== null && waits.has(answer.actor)) command.answer = answer
    else if (answer !== null && !speaksFirst) this.answer(answer, true)
    for (const id of waits) this.thinkAloud(world.actors.find((a) => a.id === id)!, id === speaker)
    const nothingToDo = plan.steps.length === 0 && plan.room === undefined && plan.create === undefined
    // Just a name: they say hi (a plan with nobody in it: a wondering look). Steps that all came to nothing: a shrug.
    if (nothingToDo) this.react(who.length > 0 ? who : this.fallbackWho(), who.length > 0 ? 'hello' : 'huh')
    if (plan.steps.length > 0 && steps.size === 0) this.react(who.length > 0 ? who : this.fallbackWho(), 'shrug')

    Object.assign(line, {
      heard: { en: plan.heard, fi: plan.heardFi },
      who,
      by,
      took: secs(command.t0),
      status: steps.size > 0 ? (jobs.length > 0 ? 'making' : 'doing') : plan.steps.length > 0 ? 'failed' : 'done',
    })
    if (steps.size === 0) this.commands.delete(line.serial)
    if (plan.create !== undefined) this.addressee = renamed.get(plan.create.id.toLowerCase())!
    else if (who.length === 1) this.addressee = who[0]!
    this.log({ kind: 'plan', serial: line.serial, by, plan, dropped, jobs: jobs.length, ms: ms(command.t0) })
    if (remember && plan.create === undefined && (steps.size > 0 || plan.room !== undefined)) this.keepPhrase(plan, command, jobs, who)
    this.changed()
  }

  /**
   * Saves the words and the plan for next time, once every new thing in it was made and saved,
   * and only when it would play then (a kind to wear that nobody made would be a mystery box).
   * Only words that name everyone who acts ("hyppää" alone means whoever was spoken to last)
   * and mean the same next time ("hänelle" is whoever was spoken to then, "kaikki" whoever was
   * here then).
   */
  private keepPhrase(plan: Plan, command: Command, jobs: Promise<boolean>[], who: string[]): void {
    if (!meansTheSame(command.words)) return
    const named = namedActors(command.words, this.sim.world)
    if (!who.every((id) => named.includes(id))) return
    this.track(
      Promise.all(jobs).then((made) => {
        if (!made.every(Boolean) || !this.playable(plan)) return
        const phrase: PhraseEntry = { words: phraseKey(command.words), plan: { ...plan, newActions: [], newItems: [] }, made: now() }
        this.library.addPhrase(phrase)
        this.save({ phrase })
        this.log({ kind: 'phrase', words: phrase.words })
      }),
    )
  }

  /**
   * A saved plan still plays: every action is in the library, every actor is here, and every
   * thing a step names is a kind the library still has: in an item, thing or place param, and in
   * a text param named 'thing' (what wear and make make, or take-off's worn kind or slot).
   */
  private playable(plan: Plan): boolean {
    // A forgotten thing, or one nobody made, is no kind.
    const kind = (value: string) => this.library.items.has(slug(value)) || this.library.itemKindFor(value) !== null
    const there = (p: Param, value: string) => {
      if (p.kind === 'item') return kind(value)
      // A thing or a place may be an actor or a spot ('x,z') too.
      if (p.kind === 'thing' || p.kind === 'place') return this.actorFor(value) !== null || /^-?[\d.]+,-?[\d.]+$/.test(value) || kind(value)
      // Take-off's may be a slot too.
      if (p.kind === 'text' && p.name === 'thing') return kind(value) || SLOTS.includes(value as Slot)
      return true
    }
    return (
      plan.create === undefined &&
      plan.steps.every((s) => {
        const action = this.library.actions.get(slug(s.action))
        if (action === undefined || this.actorFor(s.who) === null) return false
        return s.args.every((a) => {
          const p = action.params.find((x) => x.name === a.name)
          return p === undefined || there(p, a.value)
        })
      })
    )
  }

  /** A new avatar beside the others, by the name the interpreter gave it unless someone has that id or goes by that name in either language, then by the next free name of the game's language. */
  private makeAvatar(spec: NewAvatar, words: string): Actor {
    const world = this.sim.world
    const ids = new Set(world.actors.map((a) => a.id))
    const names = takenNames(world)
    let id = slug(spec.id || spec.name)
    let name = spec.name.trim() || id
    let calls = spec.calls.map((c) => c.toLowerCase())
    if (id === '' || ids.has(id) || names.has(name.toLowerCase())) {
      const free = NEW_NAMES[this.lang].find((n) => !ids.has(slug(n)) && !names.has(n.toLowerCase()))
      id = free === undefined ? `${id || 'friend'}-${world.actors.length + 1}` : slug(free)
      name = free ?? id
      calls = []
    }
    const spot = this.freeSpot()
    const actor = newActor({ id, name, calls: unique([id, name.toLowerCase(), ...calls]), pronoun: spec.pronoun, look: lookOf(spec.look), x: spot.x, z: spot.z })
    this.sim.addActor(actor)
    this.sim.react(id, 'hello')
    this.lastMade = id
    this.saveAvatar(actor, words)
    return actor
  }

  /**
   * A made avatar from before joins the world; a starting one whose look changed gets it back.
   * A starting avatar saved under one of its own names was never named by the child, so its name
   * goes on following the language; saved under another name, it keeps that one in both.
   */
  private bringIn(entry: AvatarEntry): void {
    this.library.addAvatar(entry)
    const world = this.sim.world
    const known = world.actors.find((a) => a.id === entry.id)
    const look = structuredClone(entry.look)
    if (known !== undefined) {
      const own = castNamesFor(entry.id, entry.name) !== null
      Object.assign(known, own ? { pronoun: entry.pronoun, look } : { name: entry.name, calls: [...entry.calls], names: null, pronoun: entry.pronoun, look })
    } else {
      const spot = this.freeSpot()
      this.sim.addActor(newActor({ id: entry.id, name: entry.name, calls: [...entry.calls], pronoun: entry.pronoun, look, x: spot.x, z: spot.z }))
    }
    this.looks.set(entry.id, this.lookKey(world.actors.find((a) => a.id === entry.id)!))
  }

  /** The first spawn spot nobody stands on, then the row behind. */
  private freeSpot(): { x: number; z: number } {
    const world = this.sim.world
    const spots = ROOM_GEO[world.room].spawn
    const free = (s: { x: number; z: number }) => world.actors.every((a) => Math.hypot(a.x - s.x, a.z - s.z) > 0.9)
    return spots.find(free) ?? spots.map((s) => ({ x: s.x, z: s.z - 2 })).find(free) ?? { x: 0, z: 0 }
  }

  /** An answer in the bubble (unless `over` is false and the actor says something else already) and aloud, the same words in the language the game is played in. */
  private answer(a: Answer, over: boolean): void {
    const world = this.sim.world
    const actor = world.actors.find((x) => x.id === a.actor)
    if (actor === undefined) return
    const text = inLang(a.say, world.lang)
    if (text === '') return
    const free = actor.bubble === null || actor.bubble.until <= world.t || isThinking(actor.bubble.text)
    if (over || free) actor.bubble = { text, until: world.t + BUBBLE_SECS }
    world.speech.push({ actor: a.actor, text })
  }

  /** An actor starts waiting for an action being made: it says it thinks it through, aloud when it is the one answering. */
  private thinkAloud(actor: Actor, aloud: boolean): void {
    if (aloud) this.answer({ actor: actor.id, say: THINKING }, true)
    else actor.bubble = { text: inLang(THINKING, this.lang), until: this.sim.world.t + BUBBLE_SECS }
  }

  /**
   * A step ended and the next one waits for an action still being made: the wait starts now, so
   * the actor says so (once), aloud only when it answers the command, as at the start: lines
   * said in the same frame cut each other off ("kaikki hyppää ja tanssikaa").
   */
  private waitAloud(id: string): void {
    const world = this.sim.world
    const actor = world.actors.find((a) => a.id === id)
    const next = actor?.queue[0]
    if (actor === undefined || next === undefined || this.library.actions.has(next.action) || !this.inflight.has(`action:${next.action}`)) return
    if (actor.bubble !== null && isThinking(actor.bubble.text) && actor.bubble.until > world.t) return
    // The command's first actor answers it (execute's speaker).
    const answering = this.commands.get(next.serial)?.line.who[0] ?? id
    this.thinkAloud(actor, answering === id)
  }

  /** A new thing's draft appears in front of whoever wants it. */
  private placeDraft(kind: string, near: string | null): void {
    const world = this.sim.world
    const a = world.actors.find((x) => x.id === near) ?? world.actors[0]
    this.sim.makeItem(kind, a === undefined ? { x: 0, z: 0 } : insideRoom(a.x + Math.sin(a.yaw) * 1.5, a.z + Math.cos(a.yaw) * 1.5, 1))
  }

  // ------------------------------------------------------------------ making

  private task(kind: Job['kind'], id: string, name: string, nameFi: string, users: string[], request: InventRequest, fix: Task['fix'], tryOn: Task['tryOn']): Task {
    const job: Job = { kind, id, name, nameFi, progress: 0, stage: kind === 'item' ? 'drafting' : 'designing', for: users }
    return { job, request, fix, tryOn, t0: performance.now() }
  }

  private startJob(task: Task): Promise<boolean> {
    const key = `${task.job.kind}:${task.job.id}`
    const running = this.inflight.get(key)
    if (running !== undefined) {
      // Wanted again after it was forgotten: what the job makes is taken in after all.
      const hidden = this.cancelled.get(key)
      if (hidden !== undefined) {
        this.cancelled.delete(key)
        this.jobs = [...this.jobs, hidden]
      }
      const job = this.jobs.find((j) => j.kind === task.job.kind && j.id === task.job.id)
      if (job !== undefined) job.for = unique([...job.for, ...task.job.for])
      return running
    }
    this.jobs = [...this.jobs, task.job]
    const done = this.design(task).finally(() => {
      this.inflight.delete(key)
      this.cancelled.delete(key)
      this.jobs = this.jobs.filter((j) => j !== task.job)
      this.changed()
    })
    this.inflight.set(key, done)
    this.track(done)
    this.log({ kind: 'job', job: task.job.kind, id: task.job.id, words: task.request.words, fix: task.fix?.error ?? null })
    this.changed()
    return done
  }

  /**
   * The designer writes it, a fresh worker tests it, a failure goes back once with the error. A
   * thing that works but lost some of its model on the way (a part made twice, an unknown colour)
   * plays at once and goes back once too, with what was lost; if the fix fails, the first stays.
   * True when it joined the library and was saved.
   */
  private async design(task: Task): Promise<boolean> {
    const { job } = task
    const key = `${job.kind}:${job.id}`
    let fix = task.fix
    let first = false
    // The first one stays, unless it was forgotten meanwhile.
    const kept = () => first && !this.cancelled.has(key)
    // Every round shares one wait: past it, whoever waits shrugs.
    const until = performance.now() + (this.deps.waits ?? WAITS).job
    try {
      for (let round = 0; round < 2; round++) {
        // Forgotten and wanted by nobody since: no second try.
        if (this.cancelled.has(key)) return false
        const stage = fix === undefined ? 'designing' : 'fixing'
        if (round > 0) Object.assign(job, { stage, progress: 0 })
        this.changed()
        const t0 = performance.now()
        const wait = deadline(until - t0)
        const made = await this.link.invent({ ...task.request, fix }, (p) => this.progress(task, stage, p), wait.signal).finally(wait.clear)
        if (made.type !== job.kind) throw new Error(`the designer sent a ${made.type}, not a ${job.kind}`)
        const entry = { ...made, id: job.id }
        this.log({ kind: 'invented', job: job.kind, id: job.id, round, ms: ms(t0) })
        Object.assign(job, { stage: 'testing', progress: 1 })
        this.changed()
        const result = await validateInWorker(this.testOf(task, entry))
        this.log({ kind: 'tested', job: job.kind, id: job.id, round, ok: result.ok, error: result.error, notes: result.notes, ms: result.ms })
        if (result.ok && round === 0 && entry.type === 'item' && result.forgiven.length > 0) {
          first = await this.adopt(task, entry)
          fix = { code: entry.code ?? '', error: `it was drawn, but some of it was lost or changed: ${result.forgiven.join('; ')}` }
          continue
        }
        if (result.ok) return (await this.adopt(task, entry)) || kept()
        fix = { code: entry.code ?? '', error: result.error ?? 'the test failed' }
      }
      return kept() || this.giveUp(task, fix?.error ?? 'the test failed')
    } catch (err) {
      return kept() || this.giveUp(task, err instanceof Error ? err.message : String(err))
    }
  }

  /** The designer's reply so far fills the job and the clouds over whoever waits for it. */
  private progress(task: Task, stage: Job['stage'], p: number): void {
    const { job } = task
    Object.assign(job, { stage, progress: clamp(p, 0, 1) })
    if (job.kind === 'action') {
      const world = this.sim.world
      const waiting = world.actors.filter((a) => a.queue.some((s) => s.action === job.id))
      if (waiting.length > 0) job.for = waiting.map((a) => a.id)
      for (const a of waiting) a.thinking = { about: job.name, since: a.thinking?.since ?? world.t, progress: job.progress }
    }
    this.changed()
  }

  private testOf(task: Task, entry: ActionEntry | ItemEntry): ValidateRequest {
    const world = this.sim.world
    const entries = {
      items: [...this.library.items.values()].flatMap((i) => (i.entry === null ? [] : [i.entry])),
      actions: [...this.library.actions.values()].flatMap((a) => (a.entry === null ? [] : [a.entry])),
    }
    if (entry.type === 'item') return { snapshot: world, entries, candidate: { kind: 'item', entry } }
    const tryOn = task.tryOn !== null && world.actors.some((a) => a.id === task.tryOn!.actor) ? task.tryOn : { actor: world.actors[0]!.id, args: {} }
    return { snapshot: world, entries, candidate: { kind: 'action', entry, actor: tryOn.actor, args: tryOn.args } }
  }

  /** Takes a tested design in: it plays at once; true once it is saved too (the phrase that uses it waits for that). One forgotten while it was made is not taken in. */
  private async adopt(task: Task, entry: ActionEntry | ItemEntry): Promise<boolean> {
    if (this.cancelled.has(`${entry.type}:${entry.id}`)) {
      this.log({ kind: 'not-taken', job: entry.type, id: entry.id, why: 'forgotten while it was made' })
      return false
    }
    const added = entry.type === 'item' ? this.library.addItem(entry) : this.library.addAction(entry)
    if (!added.ok) return this.giveUp(task, added.error)
    if (entry.type === 'item') this.sim.refreshKind(entry.id)
    else this.fresh.add(entry.id)
    this.log({ kind: 'made', job: entry.type, id: entry.id, ms: ms(task.t0) })
    return this.save({ entry })
  }

  /** A new action that could not be made: whoever waits for it shrugs and its steps go. A thing keeps its draft. */
  private giveUp(task: Task, error: string): false {
    const { job } = task
    console.warn(`Silly Billy could not make ${job.kind} ${job.id}:`, error)
    this.log({ kind: 'gave-up', job: job.kind, id: job.id, error, ms: ms(task.t0) })
    if (job.kind === 'action' && !this.library.actions.has(job.id)) {
      const told = new Set<Command>()
      for (const a of this.sim.world.actors) {
        const waiting = a.queue.filter((s) => s.action === job.id)
        if (waiting.length === 0) continue
        this.sim.dropSteps(a.id, job.id)
        a.thinking = null
        this.sim.react(a.id, 'shrug')
        for (const s of waiting) {
          const command = this.commands.get(s.serial)
          if (command === undefined) continue
          if (!told.has(command)) command.line.heard = plus(command.line.heard, { en: ` (could not make ${job.name})`, fi: ` (ei onnistunut: ${job.nameFi})` })
          told.add(command)
          this.stepsOver(command, a.id, 1, true)
        }
      }
    }
    this.changed()
    return false
  }

  /** A made action failed at play time; the second time it goes back to the designer (when there is one) with the error, while the old one stays. */
  private playFailed(actor: string, step: Step, error: string): void {
    const made = this.library.actions.get(step.action)?.entry ?? null
    if (made === null) return
    const count = (this.failures.get(made.id) ?? 0) + 1
    this.log({ kind: 'play-failed', id: made.id, actor, error, count })
    if (count < FAILS_TO_FIX || !this.link.online) {
      this.failures.set(made.id, count)
      return
    }
    this.failures.delete(made.id)
    const spec = { id: made.id, name: made.name, nameFi: made.nameFi, calls: made.calls, about: made.about, params: made.params }
    void this.startJob(this.task('action', made.id, made.name, made.nameFi, [], { kind: 'action', spec, words: made.asked, context: this.context() }, { code: made.code, error }, { actor, args: step.args }))
  }

  // ------------------------------------------------------------------ keeping

  /** A command's steps for one actor came to an end; when none are left the line says how it went. */
  private stepsOver(command: Command, actor: string, n: number, failed: boolean): void {
    command.left.set(actor, Math.max(0, (command.left.get(actor) ?? 0) - n))
    if (failed) command.failed = true
    if ([...command.left.values()].some((v) => v > 0)) return
    command.line.status = command.failed ? 'failed' : 'done'
    this.commands.delete(command.line.serial)
    this.changed()
  }

  /** Newer words reached the actor: a plan that comes later for older words leaves it alone. */
  private touch(actor: string, serial: number): void {
    this.touched.set(actor, Math.max(this.touched.get(actor) ?? 0, serial))
  }

  /** The actor's steps ended early (a new command, or stop): their commands stop waiting for them. */
  private settle(actor: string): void {
    for (const command of [...this.commands.values()]) if ((command.left.get(actor) ?? 0) > 0) this.stepsOver(command, actor, Infinity, false)
  }

  /**
   * What is saved about an avatar's look, to notice when it changed. A worn thing with a process
   * may change its own colour all the time (a rainbow wand): that colour is play, not a look, so
   * it is left out here and kept only when the thing is painted. A starting avatar's name follows
   * the language, so it counts only once the child has named it.
   */
  private lookKey(a: Actor): string {
    const worn = Object.fromEntries(Object.entries(a.look.worn).map(([slot, w]) => [slot, w !== undefined && this.library.items.get(w.kind)?.tick ? { ...w, tint: null } : w]))
    return JSON.stringify([a.names === null ? [a.name, a.calls] : null, a.pronoun, { ...a.look, worn }, a.scale])
  }

  /** Saves an avatar whose look changed, or that was just painted. */
  private keepLook(id: string, asked: string | null, painted = false): void {
    const actor = this.sim.world.actors.find((a) => a.id === id)
    if (actor === undefined || (!painted && this.looks.get(id) === this.lookKey(actor))) return
    this.saveAvatar(actor, asked ?? this.library.avatars.get(id)?.asked ?? '')
  }

  /** Saves how an avatar looks; a grown or shrunk one keeps its size as its height. */
  private saveAvatar(actor: Actor, asked: string): void {
    const look = { ...structuredClone(actor.look), height: clamp(actor.look.height * actor.scale, 0.3, 5) }
    const entry: AvatarEntry = { type: 'avatar', id: actor.id, name: actor.name, calls: [...actor.calls], pronoun: actor.pronoun, look, asked, made: now() }
    this.library.addAvatar(entry)
    this.looks.set(actor.id, this.lookKey(actor))
    this.save({ entry })
    this.log({ kind: 'avatar', id: actor.id, asked })
  }

  /** Saves to the dev server's library folder: false when that failed (true with no server: there is nothing to save to). */
  private save(req: SaveRequest): Promise<boolean> {
    if (!this.server) return Promise.resolve(true)
    const saved = this.link.save(req).then(
      () => true,
      (err: unknown) => {
        console.warn('Silly Billy could not save:', err)
        return false
      },
    )
    this.track(saved)
    return saved
  }

  // ------------------------------------------------------------------ small helpers

  private track(p: Promise<unknown>): void {
    const quiet = p.catch((err: unknown) => console.error('Silly Billy:', err))
    this.background.add(quiet)
    void quiet.then(() => this.background.delete(quiet))
  }

  private endSpot(): void {
    this.spot = null
    this.sim.world.spotlight = null
  }

  /** An actor by id, name or a name as heard. */
  private actorFor(name: string): string | null {
    const world = this.sim.world
    const n = name.trim().toLowerCase()
    return world.actors.find((a) => a.id === n || a.name.toLowerCase() === n)?.id ?? actorNamed(n, world)
  }

  private nameOf(id: string, lang: Lang): string {
    return nameIn(this.sim.world.actors.find((a) => a.id === id)!, lang)
  }

  /** The language the game is played in now. */
  private get lang(): Lang {
    return this.sim.world.lang
  }

  /** Who reacts when nobody in particular was meant: the one spoken to last, else the first. */
  private fallbackWho(): string[] {
    const world = this.sim.world
    const a = world.actors.find((x) => x.id === this.addressee) ?? world.actors[0]
    return a === undefined ? [] : [a.id]
  }

  private react(ids: string[], kind: Reaction): void {
    for (const id of ids) this.sim.react(id, kind)
  }

  private context(): string {
    return interpreterContext(this.sim.world, this.library, this.addressee, this.lastMade, NEW_NAMES[this.lang])
  }

  private log(line: LogLine): void {
    this.link.log(line)
  }

  private changed(): void {
    this.deps.changed()
  }
}
