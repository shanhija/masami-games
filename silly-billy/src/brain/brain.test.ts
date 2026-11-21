/**
 * The brain on a fake dev server, with the real engine and content. A plan with a new thing
 * and a new action: the draft is there at once, Steve thinks, the design is tested, added,
 * saved and played, and the words are remembered so the next time asks nobody. A failed test
 * goes back once as a fix; a second failure shrugs and drops the steps. Jobs are shared, stop
 * stops, new avatars are made, changed looks kept, a made action failing at play time goes
 * back to the designer, and with no server the parser's guess plays. A plan that comes late
 * leaves newer words alone, its room too; words that point ("hänelle", "kaikki") are not remembered;
 * forgetting holds while things are made; whoever thinks a new action through says so.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BUILTIN_ACTIONS, BUILTIN_ITEMS, LAYOUTS, makeCast, NEW_NAMES } from '../content'
import { inLang, useLang, type Lang } from '../engine/lang'
import { Library } from '../engine/library'
import type { ActionEntry, AvatarEntry, ForgetRequest, InterpretRequest, InventRequest, ItemEntry, LibraryData, LibraryNews, LogLine, NewAction, NewItem, Plan, SaveRequest, Status } from '../engine/protocol'
import { createWorld, Sim } from '../engine/sim'
import type { Actor, WorldEvent } from '../engine/types'
import { Brain } from './brain'
import type { Link } from './contract'
import { actionEntry, itemEntry } from './testing'
import { validate, type ValidateRequest, type ValidateResult } from './validate'

/** Rejects when the signal aborts, as fetch does; never otherwise. */
const aborted = (signal: AbortSignal | undefined) =>
  new Promise<never>((_, reject) => {
    if (signal === undefined) return
    if (signal.aborted) reject(signal.reason)
    signal.addEventListener('abort', () => reject(signal.reason), { once: true })
  })

class FakeLink implements Link {
  online = true
  readonly plans = new Map<string, Plan>()
  readonly interprets: InterpretRequest[] = []
  readonly invents: InventRequest[] = []
  readonly saved: SaveRequest[] = []
  readonly forgot: ForgetRequest[] = []
  readonly logged: LogLine[] = []
  data: LibraryData = { items: [], actions: [], avatars: [], phrases: [] }
  /** What the designer makes of a request. */
  design: (req: InventRequest) => ActionEntry | ItemEntry = () => {
    throw new Error('nobody designs here')
  }
  /** The designer answers once this opens. */
  gate: Promise<void> = Promise.resolve()
  /** Per words: the interpreter answers once this opens. */
  readonly interpretGates = new Map<string, Promise<void>>()
  /** A save that should fail, as a full disk would. */
  failSave: (req: SaveRequest) => boolean = () => false

  async status(): Promise<Status> {
    return { claude: this.online, whisper: 'off', models: { interpret: 'haiku', invent: 'opus' } }
  }

  async hear(): Promise<never> {
    throw new Error('nothing is heard in tests')
  }

  async interpret(req: InterpretRequest, signal?: AbortSignal) {
    this.interprets.push(req)
    await Promise.race([this.interpretGates.get(req.words) ?? Promise.resolve(), aborted(signal)])
    const plan = this.plans.get(req.words)
    if (plan === undefined) throw new Error(`no plan for "${req.words}"`)
    return { plan: structuredClone(plan), ms: 3 }
  }

  async invent(req: InventRequest, onProgress: (p: number) => void, signal?: AbortSignal) {
    this.invents.push(req)
    onProgress(0.3)
    await Promise.race([this.gate, aborted(signal)])
    onProgress(0.9)
    return this.design(req)
  }

  async save(req: SaveRequest) {
    if (this.failSave(req)) throw new Error('the disk is full')
    this.saved.push(structuredClone(req))
  }

  async forget(req: ForgetRequest) {
    this.forgot.push(req)
  }

  async library() {
    return this.data
  }

  /** Who hears another page's news: tests tell it with tell(). */
  private listener: ((news: LibraryNews) => void) | null = null

  onNews(listener: (news: LibraryNews) => void) {
    this.listener = listener
  }

  /** Another page changed the library. */
  tell(news: LibraryNews) {
    this.listener!(news)
  }

  log(line: LogLine) {
    this.logged.push(line)
  }
}

/** The validation worker, run in this thread. */
class InThreadWorker {
  onmessage: ((e: MessageEvent<ValidateResult>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  ended = false

  postMessage(req: ValidateRequest) {
    setTimeout(() => {
      if (!this.ended) this.onmessage!({ data: validate(structuredClone(req)) } as MessageEvent<ValidateResult>)
    }, 0)
  }

  terminate() {
    this.ended = true
  }
}

const MADE = '2026-11-08T00:00:00.000Z'
const WORDS = 'steve heitä frisbee alicelle'
const THROW: NewAction = {
  id: 'throw',
  name: 'throw',
  nameFi: 'heitä',
  calls: ['heitä', 'heittää', 'throw'],
  about: 'picks the thing up and throws it to the target',
  params: [
    { name: 'thing', kind: 'item', about: 'what to throw', optional: false },
    { name: 'target', kind: 'thing', about: 'who or what to throw it at', optional: true },
  ],
}
const FRISBEE: NewItem = {
  id: 'frisbee',
  name: 'frisbee',
  nameFi: 'liitokiekko',
  calls: ['frisbee', 'frisbeen', 'frisbeetä'],
  about: 'a flat round orange disc',
  rough: [{ shape: 'cylinder', size: [0.3, 0.04, 0.3], at: [0, 0.02, 0], color: 'orange' }],
  meta: { carry: 'hand' },
}
const THROW_PLAN: Plan = {
  heard: 'Steve throws a frisbee to Alice',
  heardFi: 'Eetu heittää liitokiekon Ainolle',
  who: ['steve'],
  steps: [{ who: 'steve', action: 'throw', args: [{ name: 'thing', value: 'frisbee' }, { name: 'target', value: 'alice' }] }],
  newActions: [THROW],
  newItems: [FRISBEE],
  say: 'Okay!',
  sayFi: 'Okei!',
}
const GOOD_THROW = 'const t = args.thing\nif (t) yield* me.turnTo(t)\nyield* me.jump(0.4)\nyield* me.rest()'
const BAD_THROW = 'yield\nthrow new Error("boom")'
const FRISBEE_MODEL = "m.cylinder(0.15, 0.15, 0.04, { at: [0, 0.02, 0], color: 'orange' })\nreturn { carry: 'hand', bouncy: 0.4 }"
const ELLA: AvatarEntry = { type: 'avatar', id: 'ella', name: 'Ella', calls: ['ella'], pronoun: 'she', look: makeCast('fi')[0]!.look, asked: 'tee uusi tyttö', made: MADE }

/** The designer: the frisbee for a thing, and for an action the code `action` gives for the request's fix (undefined on a first try). */
const designer =
  (action: (fix: InventRequest['fix']) => string) =>
  (req: InventRequest): ActionEntry | ItemEntry =>
    req.kind === 'item' ? { ...itemEntry(req.spec.id, FRISBEE_MODEL), calls: req.spec.calls } : actionEntry(req.spec.id, action(req.fix), req.spec.params)

/** A game played in `lang`, Finnish unless said otherwise as in the game. */
function setup(lang: Lang = 'fi', waits?: { interpret: number; job: number }) {
  const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })
  const sim = new Sim(createWorld({ room: 'playground', actors: makeCast(lang), layouts: LAYOUTS, seed: 7, lang }), library)
  const link = new FakeLink()
  const brain = new Brain({ sim, library, link, changed: () => {}, ...(waits ? { waits } : {}) })
  return { library, sim, link, brain }
}

/** Steps the sim like the game, the brain seeing each frame's events, until an event matches (returned) or `secs` pass (null). */
function play(sim: Sim, brain: Brain, secs: number, until: (e: WorldEvent) => boolean = () => false): WorldEvent | null {
  for (let f = 0; f < Math.round(secs * 60); f++) {
    sim.step()
    const w = sim.world
    const events = [...w.events]
    brain.see(events)
    w.events.length = 0
    w.sounds.length = 0
    w.speech.length = 0
    const hit = events.find(until)
    if (hit !== undefined) return hit
  }
  return null
}

const actor = (sim: Sim, id: string): Actor => sim.world.actors.find((a) => a.id === id)!
const savedIds = (link: FakeLink) => link.saved.map((s) => ('entry' in s ? `${s.entry.type}:${s.entry.id}` : `phrase:${s.phrase.words}`))
const shut = (link: FakeLink) => {
  let open = () => {}
  link.gate = new Promise<void>((resolve) => (open = resolve))
  return () => open()
}
/** The interpreter answers these words once the returned function is called. */
const hold = (link: FakeLink, words: string) => {
  let open = () => {}
  link.interpretGates.set(words, new Promise<void>((resolve) => (open = resolve)))
  return () => open()
}
const doingOrQueued = (a: Actor) => [a.doing?.action, ...a.queue.map((s) => s.action)].filter((x) => x !== undefined)
const plan = (over: Partial<Plan>): Plan => ({ heard: 'x', heardFi: 'x', who: [], steps: [], newActions: [], newItems: [], say: 'Okay!', sayFi: 'Okei!', ...over })

beforeEach(() => {
  vi.stubGlobal('Worker', InThreadWorker)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('making new things', () => {
  it('makes a new thing and a new action while Steve thinks, plays them, and remembers the words', async () => {
    const { sim, library, link, brain } = setup()
    await brain.start()
    link.plans.set(WORDS, THROW_PLAN)
    const open = shut(link)
    link.design = designer(() => GOOD_THROW)
    await brain.hear(WORDS)

    // At once: the draft stands in the room, Steve thinks, two jobs run.
    expect(library.items.get('frisbee')!.info.rough).toBe(true)
    expect(sim.world.items.some((i) => i.kind === 'frisbee')).toBe(true)
    expect(actor(sim, 'steve').thinking).toMatchObject({ about: 'throw', progress: 0.3 })
    expect(brain.jobs.map((j) => `${j.kind}:${j.id}`).sort()).toEqual(['action:throw', 'item:frisbee'])
    expect(brain.lines.at(-1)).toMatchObject({ by: 'interpreter', status: 'making', who: ['steve'], heard: { en: 'Steve throws a frisbee to Alice', fi: 'Eetu heittää liitokiekon Ainolle' } })
    // The interpreter hears the words in the game's language, and the avatars by their names in it.
    expect(link.interprets[0]).toMatchObject({ lang: 'fi', context: expect.stringContaining('steve Eetu kid he') })
    play(sim, brain, 1)
    expect(actor(sim, 'steve').queue.map((s) => s.action)).toContain('throw')

    open()
    await brain.settled()
    expect(library.items.get('frisbee')!.info.rough).toBe(false)
    expect(library.actions.get('throw')!.entry!.code).toBe(GOOD_THROW)
    expect(savedIds(link)).toEqual(expect.arrayContaining(['item:frisbee', 'action:throw', `phrase:${WORDS}`]))
    expect(brain.jobs).toEqual([])
    expect(link.logged.filter((l) => l.kind === 'tested').every((l) => l.ok === true)).toBe(true)

    // Steve throws, and the camera leans toward him until he is done.
    expect(play(sim, brain, 2, (e) => e.type === 'started' && e.step.action === 'throw')).not.toBeNull()
    expect(sim.world.spotlight).toBe('steve')
    expect(actor(sim, 'steve').thinking).toBeNull()
    expect(play(sim, brain, 15, (e) => e.type === 'done' && e.step.action === 'throw')).not.toBeNull()
    expect(sim.world.spotlight).toBeNull()
    expect(brain.lines.at(-1)!.status).toBe('done')

    // The same words again: the saved plan plays at once and nobody is asked.
    await brain.hear(WORDS)
    expect(link.interprets).toHaveLength(1)
    expect(brain.lines.at(-1)!.by).toBe('phrase')
    const steve = actor(sim, 'steve')
    expect([steve.doing?.action, ...steve.queue.map((s) => s.action)]).toContain('throw')
  })

  it('makes a new thing once when a new action asks for a new one: the step takes the draft standing in the room', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const asksNew: Plan = { ...THROW_PLAN, steps: [{ who: 'steve', action: 'throw', args: [{ name: 'thing', value: 'new:frisbee' }, { name: 'target', value: 'alice' }] }] }
    link.plans.set(WORDS, asksNew)
    link.design = designer(() => GOOD_THROW)
    await brain.hear(WORDS)
    const drafts = sim.world.items.filter((i) => i.kind === 'frisbee')
    expect(drafts).toHaveLength(1)
    await brain.settled()
    expect(play(sim, brain, 2, (e) => e.type === 'started' && e.step.action === 'throw')).not.toBeNull()
    expect(sim.world.items.filter((i) => i.kind === 'frisbee').map((i) => i.id)).toEqual([drafts[0]!.id])
  })

  it('sends a failed test back once with the error, and takes the fix', async () => {
    const { library, link, brain } = setup()
    await brain.start()
    link.plans.set(WORDS, THROW_PLAN)
    link.design = designer((fix) => (fix === undefined ? BAD_THROW : GOOD_THROW))
    await brain.hear(WORDS)
    await brain.settled()
    const tries = link.invents.filter((r) => r.kind === 'action')
    expect(tries).toHaveLength(2)
    expect(tries[0]!.fix).toBeUndefined()
    expect(tries[1]!.fix).toEqual({ code: BAD_THROW, error: expect.stringMatching(/boom/) })
    expect(library.actions.get('throw')!.entry!.code).toBe(GOOD_THROW)
  })

  it('shrugs and drops the steps when the fix fails too', async () => {
    const { sim, library, link, brain } = setup()
    await brain.start()
    link.plans.set(WORDS, THROW_PLAN)
    link.design = designer(() => BAD_THROW)
    await brain.hear(WORDS)
    await brain.settled()
    const steve = actor(sim, 'steve')
    expect(link.invents.filter((r) => r.kind === 'action')).toHaveLength(2)
    expect(library.actions.has('throw')).toBe(false)
    expect(steve.queue.some((s) => s.action === 'throw')).toBe(false)
    expect(steve.thinking).toBeNull()
    expect(brain.lines.at(-1)!.status).toBe('failed')
    expect(brain.lines.at(-1)!.heard).toEqual({ en: 'Steve throws a frisbee to Alice (could not make throw)', fi: 'Eetu heittää liitokiekon Ainolle (ei onnistunut: heitä)' })
    // The thing was made; the action and the words were not.
    expect(savedIds(link)).toEqual(['item:frisbee'])
  })

  it('gives up on a designer that takes too long: whoever waits shrugs, and the request is called off', async () => {
    const { sim, library, link, brain } = setup('fi', { interpret: 1000, job: 50 })
    await brain.start()
    link.plans.set(WORDS, THROW_PLAN)
    link.design = designer(() => GOOD_THROW)
    shut(link)
    await brain.hear(WORDS)
    await brain.settled()
    const steve = actor(sim, 'steve')
    expect(library.actions.has('throw')).toBe(false)
    expect(steve.queue.some((s) => s.action === 'throw')).toBe(false)
    expect(steve.thinking).toBeNull()
    expect(inLang(brain.lines.at(-1)!.heard, 'en')).toContain('could not make throw')
    expect(brain.jobs).toEqual([])
  })

  it('stops waiting for an interpreter that takes too long, and still does something', async () => {
    const { sim, link, brain } = setup('fi', { interpret: 50, job: 1000 })
    await brain.start()
    link.plans.set(WORDS, THROW_PLAN)
    link.interpretGates.set(WORDS, new Promise(() => {}))
    await brain.hear(WORDS)
    await brain.settled()
    expect(link.interprets).toHaveLength(1)
    expect(brain.lines.at(-1)!.status).not.toBe('understanding')
    expect(sim.world.actors.every((a) => !a.listening)).toBe(true)
  })

  it('two commands needing the same new action share one job', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const other = 'alice heitä pallo stevelle'
    link.plans.set(WORDS, THROW_PLAN)
    link.plans.set(other, {
      ...THROW_PLAN,
      heard: 'Alice throws a ball to Steve',
      heardFi: 'Aino heittää pallon Eetulle',
      who: ['alice'],
      steps: [{ who: 'alice', action: 'throw', args: [{ name: 'thing', value: 'ball' }, { name: 'target', value: 'steve' }] }],
      newItems: [],
    })
    const open = shut(link)
    link.design = designer(() => GOOD_THROW)
    await brain.hear(WORDS)
    await brain.hear(other)
    expect(link.invents.filter((r) => r.kind === 'action')).toHaveLength(1)
    expect(brain.jobs.find((j) => j.id === 'throw')!.for.sort()).toEqual(['alice', 'steve'])
    expect(actor(sim, 'alice').thinking).not.toBeNull()
    open()
    await brain.settled()
    const started = new Set<string>()
    play(sim, brain, 3, (e) => {
      if (e.type === 'started' && e.step.action === 'throw') started.add(e.actor)
      return started.size === 2
    })
    expect([...started].sort()).toEqual(['alice', 'steve'])
  })

  it('sends a made action that fails twice at play time back to the designer', async () => {
    const { sim, library, link, brain } = setup()
    await brain.start()
    const broken = 'yield\nthrow new Error("oops")'
    expect(library.addAction(actionEntry('wobble', broken)).ok).toBe(true)
    link.design = (req) => actionEntry(req.spec.id, 'yield* me.jump(0.3)')
    await brain.hear('alice wobble')
    expect(brain.lines.at(-1)!.by).toBe('local')
    expect(play(sim, brain, 3, (e) => e.type === 'failed' && e.actor === 'alice')).not.toBeNull()
    expect(link.invents).toHaveLength(0)
    await brain.hear('alice wobble')
    expect(play(sim, brain, 3, (e) => e.type === 'failed' && e.actor === 'alice')).not.toBeNull()
    expect(link.invents).toHaveLength(1)
    expect(link.invents[0]).toMatchObject({ kind: 'action', fix: { code: broken, error: expect.stringMatching(/oops/) } })
    await brain.settled()
    expect(library.actions.get('wobble')!.entry!.code).toBe('yield* me.jump(0.3)')
    expect(savedIds(link)).toContain('action:wobble')
  })
})

describe('avatars', () => {
  it('makes a new avatar who says hi, is saved, and is the one spoken to next', async () => {
    const { sim, library, link, brain } = setup()
    await brain.start()
    const words = 'tee uusi tyttö'
    link.plans.set(words, {
      heard: 'a new girl',
      heardFi: 'uusi tyttö',
      who: ['ella'],
      steps: [],
      newActions: [],
      newItems: [],
      create: { id: 'ella', name: 'Ella', calls: ['ella', 'eela'], pronoun: 'she', look: { body: 'kid', top: 'pink', skirt: true } },
      say: 'Hi!',
      sayFi: 'Moi!',
    })
    await brain.hear(words)
    const ella = actor(sim, 'ella')
    expect(ella.look).toMatchObject({ body: 'kid', top: '#ff9ccf', skirt: true })
    expect(ella.calls).toEqual(expect.arrayContaining(['ella', 'eela']))
    expect(brain.addressee).toBe('ella')
    expect(library.avatars.get('ella')!.asked).toBe(words)
    expect(savedIds(link)).toContain('avatar:ella')
    expect(link.interprets[0]!.context).toMatch(/Names free for a new avatar: .*Ella/)

    // Asked again, the next girl gets a name nobody has.
    const before = sim.world.actors.length
    await brain.hear(words)
    expect(sim.world.actors).toHaveLength(before + 1)
    const second = sim.world.actors.at(-1)!
    expect(second.id).not.toBe('ella')
    expect(brain.addressee).toBe(second.id)
  })

  it('keeps a changed look', async () => {
    const { sim, library, link, brain } = setup()
    await brain.start()
    const wear = library.actions.get('wear')!
    link.plans.set('alice zork glorp', {
      heard: 'Alice puts on glasses',
      heardFi: 'Aino laittaa lasit',
      who: ['alice'],
      steps: [{ who: 'alice', action: 'wear', args: [{ name: wear.params[0]!.name, value: 'glasses' }] }],
      newActions: [],
      newItems: [],
      say: 'Okay!',
      sayFi: 'Okei!',
    })
    await brain.hear('alice zork glorp')
    expect(play(sim, brain, 15, (e) => e.type === 'done' && e.actor === 'alice' && e.step.action === 'wear')).not.toBeNull()
    const saved = link.saved.flatMap((s) => ('entry' in s && s.entry.type === 'avatar' && s.entry.id === 'alice' ? [s.entry] : []))
    expect(saved).toHaveLength(1)
    expect(Object.values(saved[0]!.look.worn).map((w) => w!.kind)).toContain('glasses')
    expect(library.avatars.get('alice')!.look).toEqual(saved[0]!.look)
  })

  it('keeps no look for the colour a worn thing gives itself: a rainbow wand is play', async () => {
    const { sim, library, link, brain } = setup()
    const model = "m.cylinder(0.02, 0.02, 0.4, { at: [0, 0.2, 0], color: 'white' })\nreturn { carry: 'hand', wear: 'hand' }"
    const tick = "it.state.n = (it.state.n || 0) + 1\nit.tint = ['red', 'blue', 'green'][it.state.n % 3]"
    link.data = { items: [itemEntry('rainbow-wand', model, tick)], actions: [], avatars: [], phrases: [] }
    await brain.start()
    const wear = library.actions.get('wear')!
    link.plans.set('alice zork glorp', plan({ heard: 'Alice takes the rainbow wand', who: ['alice'], steps: [{ who: 'alice', action: 'wear', args: [{ name: wear.params[0]!.name, value: 'rainbow-wand' }] }] }))
    await brain.hear('alice zork glorp')
    expect(play(sim, brain, 15, (e) => e.type === 'done' && e.actor === 'alice' && e.step.action === 'wear')).not.toBeNull()
    const avatars = () => link.saved.filter((s) => 'entry' in s && s.entry.type === 'avatar' && s.entry.id === 'alice')
    expect(avatars()).toHaveLength(1)
    await brain.hear('Alice hyppää')
    const tints = new Set<string | null>()
    let jumped = false
    for (let f = 0; f < 15 * 60 && !jumped; f++) {
      jumped = play(sim, brain, 1 / 60, (e) => e.type === 'done' && e.actor === 'alice' && e.step.action === 'jump') !== null
      tints.add(actor(sim, 'alice').look.worn.hand?.tint ?? null)
    }
    expect(jumped).toBe(true)
    expect(tints.size).toBeGreaterThan(1)
    expect(avatars()).toHaveLength(1)
  })

  it('loads what was made before and brings made avatars in', async () => {
    const { sim, library, link, brain } = setup()
    link.data = {
      items: [itemEntry('frisbee', FRISBEE_MODEL)],
      actions: [actionEntry('throw', GOOD_THROW, THROW.params)],
      avatars: [ELLA],
      phrases: [{ words: WORDS, plan: { ...THROW_PLAN, newActions: [], newItems: [] }, made: MADE }],
    }
    await brain.start()
    expect(library.items.get('frisbee')!.info.rough).toBe(false)
    expect(library.actions.has('throw')).toBe(true)
    expect(actor(sim, 'ella').name).toBe('Ella')
    await brain.hear(WORDS)
    expect(brain.lines.at(-1)!.by).toBe('phrase')
    expect(link.interprets).toHaveLength(0)
  })

  it('forgets the newest made thing', async () => {
    const { sim, library, link, brain } = setup()
    link.data = { items: [{ ...itemEntry('frisbee', FRISBEE_MODEL), nameFi: 'liitokiekko', made: '2026-11-01T00:00:00.000Z' }], actions: [], avatars: [{ ...ELLA, made: '2026-11-02T00:00:00.000Z' }], phrases: [] }
    await brain.start()
    expect(await brain.forgetNewest()).toBe('Ella')
    expect(sim.world.actors.some((a) => a.id === 'ella')).toBe(false)
    expect(link.forgot).toEqual([{ type: 'avatar', id: 'ella' }])
    // A thing by its name in both languages, for the pause card to say in the one played in.
    expect(await brain.forgetNewest()).toEqual({ en: 'frisbee', fi: 'liitokiekko' })
    expect(library.items.has('frisbee')).toBe(false)
    expect(await brain.forgetNewest()).toBeNull()
  })

  it('forgets everything made at once: things, actions, avatars and the phrases that use them, on disk too', async () => {
    const { sim, library, link, brain } = setup()
    link.data = {
      items: [{ ...itemEntry('frisbee', FRISBEE_MODEL), made: '2026-11-01T00:00:00.000Z' }],
      actions: [{ ...actionEntry('throw', GOOD_THROW, THROW.params), made: '2026-11-03T00:00:00.000Z' }],
      avatars: [{ ...ELLA, made: '2026-11-02T00:00:00.000Z' }],
      phrases: [{ words: WORDS, plan: { ...THROW_PLAN, newActions: [], newItems: [] }, made: MADE }],
    }
    await brain.start()
    sim.makeItem('frisbee', { x: 1, z: 1 })
    expect(await brain.forgetAll()).toBe(3)
    expect([library.items.has('frisbee'), library.actions.has('throw'), sim.world.actors.some((a) => a.id === 'ella')]).toEqual([false, false, false])
    expect(sim.world.items.some((i) => i.kind === 'frisbee')).toBe(false)
    expect(library.phrases.size).toBe(0)
    expect(link.forgot).toEqual([
      { type: 'action', id: 'throw' },
      { type: 'avatar', id: 'ella' },
      { type: 'item', id: 'frisbee' },
    ])
    expect(await brain.forgetAll()).toBe(0)
  })
})

describe('two pages at once', () => {
  it('takes in what another page made and forgot: it plays here at once and is never made again (2026-11-09: two pages made seven things twice)', async () => {
    const { sim, library, link, brain } = setup()
    await brain.start()
    link.tell({ from: 'other', entry: actionEntry('throw', GOOD_THROW, THROW.params) })
    link.tell({ from: 'other', entry: itemEntry('frisbee', FRISBEE_MODEL) })
    link.tell({ from: 'other', phrase: { words: 'mike heitä frisbee', plan: plan({ who: ['mike'], steps: [{ who: 'mike', action: 'throw', args: [{ name: 'thing', value: 'frisbee' }] }] }), made: MADE } })
    expect(library.actions.get('throw')!.entry!.code).toBe(GOOD_THROW)
    expect(library.phrases.has('mike heitä frisbee')).toBe(true)
    // This page's interpreter, asked before the news came, names them as new: nothing is made again, the steps play.
    link.plans.set(WORDS, THROW_PLAN)
    await brain.hear(WORDS)
    expect(link.invents).toEqual([])
    expect(doingOrQueued(actor(sim, 'steve'))).toContain('throw')
    // What the other page took in is not saved again from here.
    expect(savedIds(link).filter((id) => id !== `phrase:${WORDS}`)).toEqual([])
    // Forgotten there: gone here too, from the room as well, and nothing is told back.
    link.tell({ from: 'other', forgot: { type: 'item', id: 'frisbee' } })
    link.tell({ from: 'other', forgot: { type: 'action', id: 'throw' } })
    expect([library.items.has('frisbee'), library.actions.has('throw'), library.phrases.has('mike heitä frisbee')]).toEqual([false, false, false])
    expect(sim.world.items.some((i) => i.kind === 'frisbee')).toBe(false)
    expect(link.forgot).toEqual([])
  })
})

describe('hearing', () => {
  it('a stop with more words stops them now and the interpreter plans the rest, knowing they stand (2026-11-09: "älä vedä vessaa" stopped all and did nothing else)', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    await brain.hear('Mikko, pyöri!')
    expect(doingOrQueued(actor(sim, 'mike'))).toEqual(['spin'])
    const words = 'Mikko, älä pyöri vaan hyppää!'
    link.plans.set(words, plan({ who: ['mike'], steps: [{ who: 'mike', action: 'jump', args: [] }] }))
    await brain.hear(words)
    expect(link.interprets.at(-1)!.words).toBe(words)
    expect(doingOrQueued(actor(sim, 'mike'))).toEqual(['jump'])
    expect(brain.lines.at(-1)).toMatchObject({ by: 'interpreter', who: ['mike'] })
    // With nobody to ask, the stop is all.
    link.online = false
    await brain.hear('Mikko, älä hyppää vaan pyöri!')
    expect(doingOrQueued(actor(sim, 'mike'))).toEqual([])
    expect(brain.lines.at(-1)).toMatchObject({ by: 'local', status: 'done', heard: { fi: 'Mikko: seis' } })
  })

  it('a new one asked for after the same avatar made one of that kind is the one it made (2026-11-09: two jump ropes for one)', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const words = 'Mikko, tee pallo ja ota se'
    link.plans.set(words, plan({ who: ['mike'], steps: [{ who: 'mike', action: 'make', args: [{ name: 'thing', value: 'ball' }] }, { who: 'mike', action: 'pick-up', args: [{ name: 'thing', value: 'new:ball' }] }] }))
    const before = sim.world.items.filter((i) => i.kind === 'ball').length
    await brain.hear(words)
    expect(actor(sim, 'mike').queue.find((s) => s.action === 'pick-up')!.args.thing).toBe('ball')
    play(sim, brain, 8)
    expect(sim.world.items.filter((i) => i.kind === 'ball').length).toBe(before + 1)
  })

  it('"seis" stops everybody, and what waited stops waiting', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    link.plans.set(WORDS, THROW_PLAN)
    link.gate = new Promise<void>(() => {})
    link.design = designer(() => GOOD_THROW)
    await brain.hear(WORDS)
    await brain.hear('seis')
    const steve = actor(sim, 'steve')
    expect(steve.queue).toEqual([])
    expect(steve.thinking).toBeNull()
    expect(brain.lines.at(-1)).toMatchObject({ heard: { en: 'Everyone: stop', fi: 'Kaikki: seis' }, by: 'local', status: 'done' })
    expect(brain.lines.at(-2)!.status).toBe('done')
  })

  it('plays a clear command at once and keeps who was spoken to', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    await brain.hear('Aino, hyppää!')
    expect(brain.lines.at(-1)).toMatchObject({ by: 'local', status: 'doing', who: ['alice'], heard: { en: 'Alice: jump', fi: 'Aino: hyppää' } })
    expect(brain.addressee).toBe('alice')
    expect(actor(sim, 'alice').queue.map((s) => s.action)).toEqual(['jump'])
    await brain.hear('pyöri')
    expect(actor(sim, 'alice').queue.map((s) => s.action)).toEqual(['spin'])
    expect(link.interprets).toHaveLength(0)
    expect(play(sim, brain, 10, (e) => e.type === 'done' && e.actor === 'alice')).not.toBeNull()
    expect(brain.lines.at(-1)!.status).toBe('done')
  })

  it('without a server plays the best guess, or wonders', async () => {
    const { sim, link, brain } = setup()
    link.online = false
    await brain.start()
    await brain.hear('alice hyppää ja pyöri')
    expect(brain.lines.at(-1)!.by).toBe('offline')
    expect(actor(sim, 'alice').queue.map((s) => s.action)).toEqual(['jump', 'spin'])
    await brain.hear('alice heitä pallo stevelle')
    expect(brain.lines.at(-1)).toMatchObject({ by: 'offline', status: 'failed' })
    expect(link.interprets).toHaveLength(0)
  })

  it('"put the ball on the bench" with no interpreter: nobody puts on a thing that does not exist, and no such look is kept', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    for (const words of ['Alice laita pallo penkin päälle', 'Alice put the ball on the bench']) {
      await brain.hear(words)
      expect(brain.lines.at(-1)!.by).toBe('offline')
      play(sim, brain, 6)
    }
    expect(actor(sim, 'alice').look.worn.hand).toBeUndefined()
    expect(link.saved).toEqual([])
  })

  it('when the interpreter fails, the guess plays and nothing throws', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    await brain.hear('alice hyppää ja pyöri')
    expect(brain.lines.at(-1)!.by).toBe('offline')
    expect(link.logged.some((l) => l.kind === 'interpret-failed')).toBe(true)
    expect(actor(sim, 'alice').listening).toBe(false)
  })

  it('the one named while the child still talks listens', () => {
    const { sim, brain } = setup()
    brain.hearing('eetu juo')
    expect(actor(sim, 'steve').listening).toBe(true)
    expect(actor(sim, 'alice').listening).toBe(false)
    brain.hearing('')
    expect(actor(sim, 'steve').listening).toBe(false)
  })

  it('nothing heard: the one spoken to wonders', async () => {
    const { brain } = setup()
    await brain.start()
    await brain.hear('  ... ')
    expect(brain.lines.at(-1)).toMatchObject({ heard: { en: 'nothing heard', fi: 'ei kuulunut mitään' }, status: 'failed' })
  })

  it('a child saying random things for a while: nothing breaks', async () => {
    const { sim, link, brain } = setup()
    link.online = false
    await brain.start()
    const error = vi.spyOn(console, 'error')
    const words = [
      'alice', 'stiivi', 'maikki', 'nooralle', 'kissa', 'hän', 'hänelle', 'kaikki', 'seis', 'älä', 'hyppää', 'juokse', 'pyörikää', 'istu', 'anna',
      'ota', 'pudota', 'tee', 'pue', 'riisu', 'maalaa', 'kasva', 'kutistu', 'sano', 'seuraa', 'katso', 'nuku', 'vilkuta', 'pallo', 'penkille', 'puun',
      'liukumäkeen', 'lasit', 'punaiseksi', 'sininen', 'mennään', 'uimaan', 'metsään', 'leikkipuistoon', 'ja', 'luo', 'kanssa', '3', 'lohikäärme', 'blörp', '',
    ]
    let seed = 12345
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    for (let i = 0; i < 150; i++) {
      const said = Array.from({ length: 1 + Math.floor(random() * 5) }, () => words[Math.floor(random() * words.length)]).join(' ')
      await brain.hear(said)
      play(sim, brain, 0.3)
    }
    expect(error).not.toHaveBeenCalled()
    expect(brain.lines).toHaveLength(12)
    for (const a of sim.world.actors) {
      for (const v of [a.x, a.y, a.z, a.yaw, a.scale]) expect(Number.isFinite(v)).toBe(true)
      expect(Math.abs(a.x)).toBeLessThanOrEqual(12)
      expect(Math.abs(a.z)).toBeLessThanOrEqual(12)
    }
  })
})

describe('words that wait for the interpreter while the child goes on talking', () => {
  const SLOW = 'alice tanssi kissan kanssa'
  const SPIN = plan({ heard: 'Alice spins', heardFi: 'Aino pyörii', who: ['alice'], steps: [{ who: 'alice', action: 'spin', args: [] }] })

  it('a plan that comes after newer words for the same actor leaves her alone', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    link.plans.set(SLOW, SPIN)
    const open = hold(link, SLOW)
    const first = brain.hear(SLOW)
    await brain.hear('alice hyppää')
    open()
    await first
    expect(doingOrQueued(actor(sim, 'alice'))).toEqual(['jump'])
    expect(brain.lines.find((l) => l.words === SLOW)).toMatchObject({ status: 'failed', heard: { en: 'Alice spins (you said something newer)', fi: 'Aino pyörii (sanoit jo jotain uutta)' } })
    expect(brain.lines.find((l) => l.words === 'alice hyppää')!.status).toBe('doing')
  })

  it('"seis" holds: the plan that comes after it plays nothing', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    link.plans.set(SLOW, SPIN)
    const open = hold(link, SLOW)
    const first = brain.hear(SLOW)
    await brain.hear('seis')
    open()
    await first
    expect(doingOrQueued(actor(sim, 'alice'))).toEqual([])
    expect(brain.lines.find((l) => l.words === SLOW)!.status).toBe('failed')
  })

  it('a late plan still plays for whoever newer words did not reach, and leaves the room alone when it changed meanwhile', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const both = plan({ heard: 'to the forest, Alice spins and Steve waves', who: ['alice', 'steve'], room: 'forest', steps: [{ who: 'alice', action: 'spin', args: [] }, { who: 'steve', action: 'wave', args: [] }] })
    link.plans.set(SLOW, both)
    const open = hold(link, SLOW)
    const first = brain.hear(SLOW)
    await brain.hear('steve hyppää')
    sim.enterRoom('pool')
    open()
    await first
    expect(sim.world.room).toBe('pool')
    expect(doingOrQueued(actor(sim, 'alice'))).toEqual(['spin'])
    expect(doingOrQueued(actor(sim, 'steve'))).toEqual(['jump'])
  })

  it('a late plan that newer words cut short is not remembered, so the whole words are asked again next time', async () => {
    const { link, brain } = setup()
    await brain.start()
    const both = 'alice ja steve tanssii'
    link.plans.set(both, plan({ heard: 'Alice and Steve spin', who: ['alice', 'steve'], steps: [{ who: 'alice', action: 'spin', args: [] }, { who: 'steve', action: 'spin', args: [] }] }))
    const away = 'mennään metsään ja alice tanssii hassusti'
    link.plans.set(away, plan({ heard: 'to the forest, Alice spins', who: ['alice'], room: 'forest', steps: [{ who: 'alice', action: 'spin', args: [] }] }))
    const openBoth = hold(link, both)
    const first = brain.hear(both)
    await brain.hear('steve hyppää')
    openBoth()
    await first
    const openAway = hold(link, away)
    const second = brain.hear(away)
    await brain.hear('mennään uimaan')
    openAway()
    await second
    await brain.settled()
    expect(savedIds(link).filter((id) => id.startsWith('phrase:'))).toEqual([])
  })

  it('"seis" holds against a late plan with a room too: nobody is moved', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const words = 'mennään uimaan ja sukelletaan syvälle'
    const everyone = sim.world.actors.map((a) => a.id)
    link.plans.set(words, plan({ heard: 'to the pool, everyone dives', heardFi: 'uimahalliin, kaikki sukeltavat', who: everyone, room: 'pool', steps: everyone.map((who) => ({ who, action: 'spin', args: [] })) }))
    const open = hold(link, words)
    const first = brain.hear(words)
    await brain.hear('Alice hyppää kolme kertaa')
    await brain.hear('seis')
    open()
    await first
    expect(sim.world.room).toBe('playground')
    expect(brain.lines.find((l) => l.words === words)).toMatchObject({ status: 'failed', heard: { en: 'to the pool, everyone dives (you said something newer)', fi: 'uimahalliin, kaikki sukeltavat (sanoit jo jotain uutta)' } })
  })

  it('a late plan moves nobody to another room while newer words play: Alice goes on jumping', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const words = 'mennään uimaan ja sukelletaan syvälle'
    link.plans.set(words, plan({ heard: 'to the pool, Steve dives', who: ['steve'], room: 'pool', steps: [{ who: 'steve', action: 'spin', args: [] }] }))
    const open = hold(link, words)
    const first = brain.hear(words)
    await brain.hear('Alice hyppää kolme kertaa')
    play(sim, brain, 0.3)
    open()
    await first
    play(sim, brain, 0.1)
    expect(sim.world.room).toBe('playground')
    expect(doingOrQueued(actor(sim, 'alice'))).toEqual(['jump'])
    expect(doingOrQueued(actor(sim, 'steve'))).toEqual(['spin'])
  })

  it('a late plan that only changes the room, after the room changed: it comes to nothing and says so, with no wondering look', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const words = 'mennään kylpylään'
    link.plans.set(words, plan({ heard: 'go to the swimming pool', heardFi: 'mennään uimahalliin', room: 'pool', say: "Let's go!", sayFi: 'Mennään!' }))
    const open = hold(link, words)
    const first = brain.hear(words)
    await brain.hear('mennään metsään')
    open()
    await first
    expect(sim.world.room).toBe('forest')
    expect(brain.lines.find((l) => l.words === words)).toMatchObject({ status: 'failed', heard: { en: 'go to the swimming pool (you said something newer)', fi: 'mennään uimahalliin (sanoit jo jotain uutta)' } })
    expect(sim.world.actors.some((a) => sim.reacting(a.id))).toBe(false)
  })
})

describe('remembering words', () => {
  const DANCE: NewAction = { id: 'dance', name: 'dance', nameFi: 'tanssi', calls: ['tanssi', 'tanssii', 'dance'], about: 'dances', params: [] }

  it('does not keep words whose "hänelle" or "kaikki" meant whoever it was then', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    brain.addressee = 'steve'
    const toHim = 'alice heitä pallo hänelle'
    link.plans.set(toHim, plan({ heard: 'Alice throws the ball to Steve', who: ['alice'], steps: [{ who: 'alice', action: 'throw', args: [{ name: 'thing', value: 'ball' }, { name: 'target', value: 'steve' }] }], newActions: [THROW] }))
    const all = 'kaikki tanssii nyt yhdessä'
    const everyone = sim.world.actors.map((a) => a.id)
    link.plans.set(all, plan({ heard: 'Everyone dances', who: everyone, steps: everyone.map((who) => ({ who, action: 'dance', args: [] })), newActions: [DANCE] }))
    link.design = designer(() => GOOD_THROW)
    await brain.hear(toHim)
    await brain.hear(all)
    await brain.settled()
    expect(savedIds(link)).toEqual(expect.arrayContaining(['action:throw', 'action:dance']))
    expect(savedIds(link).filter((id) => id.startsWith('phrase:'))).toEqual([])
  })

  it('keeps a plan that names the room it was said in without that room, so it never moves everyone back', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const words = 'alice liukuu alas liukumäestä'
    link.plans.set(words, plan({ heard: 'Alice spins by the slide', who: ['alice'], room: 'playground', steps: [{ who: 'alice', action: 'spin', args: [] }] }))
    await brain.hear(words)
    await brain.settled()
    const saved = link.saved.flatMap((s) => ('phrase' in s && s.phrase.words === words ? [s.phrase] : []))
    expect(saved).toHaveLength(1)
    expect(saved[0]!.plan.room).toBeUndefined()
    sim.enterRoom('forest')
    await brain.hear(words)
    expect(brain.lines.at(-1)!.by).toBe('phrase')
    expect(sim.world.room).toBe('forest')
  })

  it('a plan that only names the room everyone is in already gets a wondering look, not nothing', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    link.plans.set('blorp blorp', plan({ heard: 'go to the playground', room: 'playground', say: '', sayFi: '' }))
    await brain.hear('blorp blorp')
    expect(brain.lines.at(-1)).toMatchObject({ by: 'interpreter', status: 'done' })
    expect(sim.world.actors.some((a) => sim.reacting(a.id))).toBe(true)
  })

  it('a thing that could not be saved: the words are not remembered either', async () => {
    const { link, brain } = setup()
    await brain.start()
    link.plans.set(WORDS, THROW_PLAN)
    link.design = designer(() => GOOD_THROW)
    link.failSave = (req) => 'entry' in req && req.entry.id === 'frisbee'
    await brain.hear(WORDS)
    await brain.settled()
    expect(savedIds(link)).toEqual(['action:throw'])
  })

  it('forgetting a thing forgets the phrases that use it, and a phrase whose thing is not there is not played', async () => {
    const { library, link, brain } = setup()
    link.data = {
      items: [{ ...itemEntry('frisbee', FRISBEE_MODEL), made: '2026-11-08T00:00:02.000Z' }],
      actions: [{ ...actionEntry('throw', GOOD_THROW, THROW.params), made: '2026-11-08T00:00:01.000Z' }],
      avatars: [],
      phrases: [{ words: WORDS, plan: { ...THROW_PLAN, newActions: [], newItems: [] }, made: MADE }],
    }
    await brain.start()
    expect(await brain.forgetNewest()).toEqual({ en: 'frisbee', fi: 'frisbee' })
    expect(library.phrases.has(WORDS)).toBe(false)
    // As after a reload when the thing's save had failed: the phrase is there, the thing is not.
    const words = 'steve heitä kiekko'
    library.addPhrase({ words, plan: plan({ heard: 'Steve throws the frisbee', who: ['steve'], steps: [{ who: 'steve', action: 'throw', args: [{ name: 'thing', value: 'frisbee' }] }] }), made: MADE })
    link.plans.set(words, THROW_PLAN)
    await brain.hear(words)
    expect(brain.lines.at(-1)!.by).toBe('interpreter')
  })

  it('a kind named in words (wear and make) must be in the library too: such a phrase is not played, nor kept', async () => {
    const { library, link, brain } = setup()
    await brain.start()
    const wand = (who: string) => plan({ heard: `${who} wears the magic wand`, who: [who], steps: [{ who, action: 'wear', args: [{ name: 'thing', value: 'magic-wand' }] }] })
    library.addPhrase({ words: 'noora pue taikasauva', plan: wand('noora'), made: MADE })
    await brain.hear('noora pue taikasauva')
    expect(brain.lines.at(-1)!.by).not.toBe('phrase')
    library.addPhrase({ words: 'mike taio lohikäärme', plan: plan({ heard: 'Mike makes a dragon', who: ['mike'], steps: [{ who: 'mike', action: 'make', args: [{ name: 'thing', value: 'dragon' }] }] }), made: MADE })
    await brain.hear('mike taio lohikäärme')
    expect(brain.lines.at(-1)!.by).not.toBe('phrase')
    // As Haiku once planned it: the wand to wear, and nothing to make it.
    link.plans.set('anna nooralle taikasauva', wand('noora'))
    await brain.hear('anna nooralle taikasauva')
    await brain.settled()
    expect(savedIds(link).filter((id) => id.startsWith('phrase:'))).toEqual([])
    // A kind the library has, or take-off's slot, still plays.
    library.addPhrase({ words: 'alice pue rillit', plan: plan({ heard: 'Alice wears glasses', who: ['alice'], steps: [{ who: 'alice', action: 'wear', args: [{ name: 'thing', value: 'glasses' }] }] }), made: MADE })
    await brain.hear('alice pue rillit')
    expect(brain.lines.at(-1)!.by).toBe('phrase')
    library.addPhrase({ words: 'steve paljasta pää', plan: plan({ heard: 'Steve takes off his hat', who: ['steve'], steps: [{ who: 'steve', action: 'take-off', args: [{ name: 'thing', value: 'head' }] }] }), made: MADE })
    await brain.hear('steve paljasta pää')
    expect(brain.lines.at(-1)!.by).toBe('phrase')
  })

  it('a phrase kept before "kaikki" was left out is not played: everyone here now joins in', async () => {
    const { sim, link, brain } = setup()
    const five = sim.world.actors.map((a) => a.id)
    link.data = {
      items: [],
      actions: [{ ...actionEntry('dance', 'yield* me.jump(0.2)'), calls: ['tanssi', 'tanssikaa', 'dance'] }],
      avatars: [ELLA],
      phrases: [{ words: 'kaikki tanssikaa', plan: plan({ heard: 'Everyone dances', who: five, steps: five.map((who) => ({ who, action: 'dance', args: [] })) }), made: MADE }],
    }
    await brain.start()
    await brain.hear('kaikki tanssikaa')
    expect(brain.lines.at(-1)!.by).toBe('local')
    expect(doingOrQueued(actor(sim, 'ella'))).toEqual(['dance'])
  })

  it('does not keep words that point at "the other one"', async () => {
    const { link, brain } = setup()
    await brain.start()
    const words = 'alice anna pallo toiselle'
    link.plans.set(words, plan({ heard: 'Alice gives the ball to Mike', who: ['alice'], steps: [{ who: 'alice', action: 'give', args: [{ name: 'thing', value: 'ball' }, { name: 'to', value: 'mike' }] }] }))
    await brain.hear(words)
    await brain.settled()
    expect(brain.lines.at(-1)!.by).toBe('interpreter')
    expect(savedIds(link).filter((id) => id.startsWith('phrase:'))).toEqual([])
  })
})

describe('making, more', () => {
  it('a made action is tested without its optional args too, and a failure there goes back to the designer', async () => {
    const { library, link, brain } = setup()
    await brain.start()
    const RIDE: NewAction = { id: 'ride', name: 'ride', nameFi: 'aja', calls: ['aja', 'ride'], about: 'rides over the target', params: [{ name: 'target', kind: 'thing', about: 'what to ride over', optional: true }] }
    const words = 'steve aja pyörällä puun yli'
    link.plans.set(words, plan({ heard: 'Steve rides over the tree', who: ['steve'], steps: [{ who: 'steve', action: 'ride', args: [{ name: 'target', value: 'tree' }] }], newActions: [RIDE] }))
    const careless = 'const r = args.target.radius + 0.5\nyield* me.walkTo(args.target, { near: r })'
    const careful = 'const t = args.target\nif (t) yield* me.walkTo(t, { near: t.radius + 0.5 })\nyield* me.jump(0.3)'
    link.design = designer((fix) => (fix === undefined ? careless : careful))
    await brain.hear(words)
    await brain.settled()
    const tries = link.invents.filter((r) => r.kind === 'action')
    expect(tries).toHaveLength(2)
    expect(tries[1]!.fix!.error).toMatch(/^when target is not given: .*radius/)
    expect(library.actions.get('ride')!.entry!.code).toBe(careful)
  })

  it('a thing that lost some of its model plays at once and goes back once with what was lost', async () => {
    const { library, link, brain } = setup()
    await brain.start()
    link.plans.set(WORDS, THROW_PLAN)
    const lossy = "m.cylinder(0.15, 0.15, 0.04, { at: [0, 0.02, 0], color: 'saddlebrownish' })\nreturn { carry: 'hand' }"
    const open = shut(link)
    let fixed = FRISBEE_MODEL
    link.design = (req) => (req.kind === 'item' ? { ...itemEntry(req.spec.id, req.fix === undefined ? lossy : fixed), calls: req.spec.calls } : actionEntry(req.spec.id, GOOD_THROW, req.spec.params))
    await brain.hear(WORDS)
    open()
    await brain.settled()
    const tries = link.invents.filter((r) => r.kind === 'item')
    expect(tries).toHaveLength(2)
    expect(tries[1]!.fix).toEqual({ code: lossy, error: expect.stringMatching(/unknown colour "saddlebrownish"/) })
    expect(library.items.get('frisbee')!.entry!.code).toBe(FRISBEE_MODEL)

    // When the fix fails, the first one stays, and the words are remembered with it.
    const again = setup()
    await again.brain.start()
    again.link.plans.set(WORDS, THROW_PLAN)
    fixed = 'throw new Error("oops")'
    again.link.design = link.design
    await again.brain.hear(WORDS)
    await again.brain.settled()
    expect(again.library.items.get('frisbee')!.entry!.code).toBe(lossy)
    expect(savedIds(again.link)).toEqual(expect.arrayContaining(['item:frisbee', 'action:throw', `phrase:${WORDS}`]))
  })

  it('"forget the newest thing" while it is still being made: it stays forgotten', async () => {
    const { library, link, brain } = setup()
    await brain.start()
    const words = 'alice ota frisbee'
    link.plans.set(words, plan({ heard: 'Alice picks up a frisbee', who: ['alice'], steps: [{ who: 'alice', action: 'pick-up', args: [{ name: 'thing', value: 'frisbee' }] }], newItems: [FRISBEE] }))
    const open = shut(link)
    link.design = designer(() => GOOD_THROW)
    await brain.hear(words)
    expect(await brain.forgetNewest()).toEqual({ en: 'frisbee', fi: 'liitokiekko' })
    expect(link.forgot).toEqual([{ type: 'item', id: 'frisbee' }])
    expect(brain.jobs).toEqual([])
    open()
    await brain.settled()
    expect(library.items.has('frisbee')).toBe(false)
    expect(savedIds(link)).toEqual([])
  })

  it('a thing forgotten while it is made and then asked for again is taken in after all', async () => {
    const { library, link, brain } = setup()
    await brain.start()
    const words = 'alice ota frisbee'
    link.plans.set(words, plan({ heard: 'Alice picks up a frisbee', who: ['alice'], steps: [{ who: 'alice', action: 'pick-up', args: [{ name: 'thing', value: 'frisbee' }] }], newItems: [FRISBEE] }))
    const open = shut(link)
    link.design = designer(() => GOOD_THROW)
    await brain.hear(words)
    await brain.forgetNewest()
    await brain.hear(words)
    expect(library.items.get('frisbee')!.info.rough).toBe(true)
    expect(brain.jobs.map((j) => j.id)).toEqual(['frisbee'])
    open()
    await brain.settled()
    expect(link.invents).toHaveLength(1)
    expect(library.items.get('frisbee')!.info.rough).toBe(false)
    expect(savedIds(link)).toContain('item:frisbee')
  })

  it('forgetting a made action someone waits to do: they stop waiting and the line ends', async () => {
    const { sim, link, brain } = setup()
    link.online = false
    link.data = { items: [], actions: [{ ...actionEntry('wobble', 'yield* me.jump(0.2)'), calls: ['wobble'] }], avatars: [], phrases: [] }
    await brain.start()
    await brain.hear('alice hyppää ja wobble')
    expect(actor(sim, 'alice').queue.map((s) => s.action)).toEqual(['jump', 'wobble'])
    play(sim, brain, 0.2)
    expect(await brain.forgetNewest()).toEqual({ en: 'wobble', fi: 'wobble' })
    play(sim, brain, 5)
    const alice = actor(sim, 'alice')
    expect(alice.queue).toEqual([])
    expect(alice.thinking).toBeNull()
    expect(sim.world.spotlight).toBeNull()
    expect(brain.lines.at(-1)!.status).toBe('failed')
  })
})

describe('saying it', () => {
  it('who must think a new action through says so at once, and answers when the action starts', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    link.plans.set(WORDS, { ...THROW_PLAN, say: 'Watch me!', sayFi: 'Katso!' })
    const open = shut(link)
    link.design = designer(() => GOOD_THROW)
    await brain.hear(WORDS)
    expect(actor(sim, 'steve').bubble!.text).toBe('Hmm, mietitäänpä!')
    expect(sim.world.speech).toEqual([{ actor: 'steve', text: 'Hmm, mietitäänpä!' }])
    sim.world.speech.length = 0
    open()
    await brain.settled()
    const said: string[] = []
    let started = false
    for (let f = 0; f < 180 && !started; f++) {
      sim.step()
      const w = sim.world
      const events = [...w.events]
      brain.see(events)
      said.push(...w.speech.filter((s) => s.actor === 'steve').map((s) => s.text))
      started = events.some((e) => e.type === 'started' && e.step.action === 'throw')
      w.events.length = 0
      w.speech.length = 0
      w.sounds.length = 0
    }
    expect(started).toBe(true)
    expect(said).toContain('Katso!')
    expect(actor(sim, 'steve').bubble!.text).toBe('Katso!')
  })

  it('says no quick answer before a first step that speaks: the line itself is the answer', async () => {
    const { sim, brain } = setup()
    await brain.start()
    await brain.hear('Alice sano hei')
    const said = sim.world.speech.map((s) => s.text)
    sim.world.speech.length = 0
    for (let f = 0; f < 30; f++) {
      sim.step()
      said.push(...sim.world.speech.map((s) => s.text))
      sim.world.speech.length = 0
    }
    expect(said).toEqual(['hei'])
    expect(actor(sim, 'alice').bubble!.text).toBe('hei')
  })

  it('who gets to the new action only after a known one says so when the wait starts', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const words = 'alice hyppää ja tanssi'
    const DANCE: NewAction = { id: 'dance', name: 'dance', nameFi: 'tanssi', calls: ['tanssi', 'dance'], about: 'dances', params: [] }
    link.plans.set(words, plan({ heard: 'Alice jumps and dances', who: ['alice'], steps: [{ who: 'alice', action: 'jump', args: [] }, { who: 'alice', action: 'dance', args: [] }], newActions: [DANCE] }))
    shut(link)
    link.design = designer(() => GOOD_THROW)
    await brain.hear(words)
    expect(sim.world.speech).toEqual([{ actor: 'alice', text: 'Okei!' }])
    sim.world.speech.length = 0
    const said: string[] = []
    let jumped = false
    for (let f = 0; f < 600 && !jumped; f++) {
      sim.step()
      const w = sim.world
      const events = [...w.events]
      brain.see(events)
      said.push(...w.speech.filter((s) => s.actor === 'alice').map((s) => s.text))
      jumped = events.some((e) => e.type === 'done' && e.step.action === 'jump')
      w.events.length = 0
      w.speech.length = 0
      w.sounds.length = 0
    }
    expect(jumped).toBe(true)
    expect(said).toContain('Hmm, mietitäänpä!')
    expect(actor(sim, 'alice').bubble!.text).toBe('Hmm, mietitäänpä!')
  })

  it('when many get to the new action at once, only the one who answers says it aloud: lines said together cut each other off', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const words = 'kaikki hyppää ja tanssikaa nyt'
    const everyone = sim.world.actors.map((a) => a.id)
    const DANCE: NewAction = { id: 'dance', name: 'dance', nameFi: 'tanssi', calls: ['tanssi', 'dance'], about: 'dances', params: [] }
    link.plans.set(words, plan({ heard: 'Everyone jumps and dances', who: everyone, steps: everyone.flatMap((who) => [{ who, action: 'jump', args: [] }, { who, action: 'dance', args: [] }]), newActions: [DANCE] }))
    shut(link)
    link.design = designer(() => GOOD_THROW)
    await brain.hear(words)
    const thinking: string[] = []
    let waiting = 0
    for (let f = 0; f < 600 && waiting < everyone.length; f++) {
      sim.step()
      const w = sim.world
      brain.see([...w.events])
      thinking.push(...w.speech.filter((s) => s.text === 'Hmm, mietitäänpä!').map((s) => s.actor))
      waiting = w.actors.filter((a) => a.bubble?.text === 'Hmm, mietitäänpä!').length
      w.events.length = 0
      w.speech.length = 0
      w.sounds.length = 0
    }
    expect(waiting).toBe(everyone.length)
    expect(thinking).toEqual(['alice'])
  })

  it('in English the answer is spoken in English, as the bubble says it', async () => {
    const { sim, brain } = setup('en')
    await brain.start()
    await brain.hear('Alice, jump')
    const bubble = actor(sim, 'alice').bubble!.text
    expect(sim.world.speech).toEqual([{ actor: 'alice', text: bubble }])
  })

  it('keeps a look someone else changed: Alice paints Steve', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    await brain.hear('Alice maalaa Steve punaiseksi')
    expect(play(sim, brain, 20, (e) => e.type === 'done' && e.actor === 'alice')).not.toBeNull()
    const saved = link.saved.flatMap((s) => ('entry' in s && s.entry.type === 'avatar' ? [s.entry] : []))
    expect(saved.map((e) => `${e.id}: ${e.asked}`)).toEqual(['steve: Alice maalaa Steve punaiseksi'])
    expect(saved[0]!.look.top).toBe(actor(sim, 'steve').look.top)
  })

  it('a cap taken off is the cap to paint, not a part of Steve: "Steve, ota lippis pois", then "Steve, maalaa lippis punaiseksi"', async () => {
    const { sim, brain } = setup()
    await brain.start()
    await brain.hear('Steve, ota lippis pois')
    expect(play(sim, brain, 10, (e) => e.type === 'done' && e.actor === 'steve')).not.toBeNull()
    play(sim, brain, 2)
    const top = actor(sim, 'steve').look.top
    await brain.hear('Steve, maalaa lippis punaiseksi')
    expect(brain.lines.at(-1)).toMatchObject({ by: 'local', heard: { en: 'Steve: paint the cap red', fi: 'Eetu: maalaa lippis punaiseksi' } })
    expect(play(sim, brain, 20, (e) => e.type === 'done' && e.actor === 'steve')).not.toBeNull()
    expect(sim.world.items.find((i) => i.kind === 'cap')!.tint).toBe('#e8503f')
    expect(actor(sim, 'steve').look.top).toBe(top)
  })
})

describe('the language the game is played in', () => {
  it('in Finnish the answer is shown and said in Finnish: the bubble and the voice say the same words', async () => {
    const { sim, brain } = setup('fi')
    await brain.start()
    await brain.hear('Aino, hyppää')
    const bubble = actor(sim, 'alice').bubble!.text
    expect(['Okei!', 'Joo!', 'Selvä!']).toContain(bubble)
    expect(sim.world.speech).toEqual([{ actor: 'alice', text: bubble }])
  })

  it('in English who must think a new action through says so in English, in the bubble and aloud, and the jobs carry both names', async () => {
    const { sim, link, brain } = setup('en')
    await brain.start()
    link.plans.set(WORDS, { ...THROW_PLAN, say: 'Watch me!', sayFi: 'Katso!' })
    shut(link)
    link.design = designer(() => GOOD_THROW)
    await brain.hear(WORDS)
    expect(actor(sim, 'steve').bubble!.text).toBe('Let me think this through!')
    expect(sim.world.speech).toEqual([{ actor: 'steve', text: 'Let me think this through!' }])
    expect(link.interprets[0]).toMatchObject({ lang: 'en', context: expect.stringContaining('steve Steve kid he') })
    expect(brain.jobs.map((j) => `${j.name}/${j.nameFi}`).sort()).toEqual(['frisbee/liitokiekko', 'throw/heitä'])
  })

  it('a switch renames the starting avatars at once, keeps the names the child gave, and saves no look for it', async () => {
    const { sim, link, brain } = setup('fi')
    link.data = { items: [], actions: [], avatars: [ELLA], phrases: [] }
    await brain.start()
    expect(sim.world.actors.map((a) => a.name)).toEqual(['Aino', 'Eetu', 'Mikko', 'Noora', 'Mirri', 'Ella'])
    useLang(sim.world, 'en')
    expect(sim.world.actors.map((a) => a.name)).toEqual(['Alice', 'Steve', 'Mike', 'Nora', 'Luna', 'Ella'])
    await brain.hear('Luna, jump')
    expect(brain.lines.at(-1)).toMatchObject({ by: 'local', who: ['mirri'], heard: { en: 'Luna: jump', fi: 'Mirri: hyppää' } })
    expect(actor(sim, 'mirri').bubble!.text).toMatch(/^(Okay|Yes|Sure)!$/)
    await brain.hear('seis')
    expect(brain.lines.at(-1)!.heard).toEqual({ en: 'Everyone: stop', fi: 'Kaikki: seis' })
    await brain.hear('Steve, stop')
    expect(brain.lines.at(-1)!.heard).toEqual({ en: 'Steve: stop', fi: 'Eetu: seis' })
    await brain.hear('Luna, jump')
    expect(play(sim, brain, 10, (e) => e.type === 'done' && e.actor === 'mirri')).not.toBeNull()
    // Her name changed with the language, not her look: nothing is saved.
    expect(link.saved).toEqual([])
  })

  it('a starting avatar whose look was saved goes on following the language, unless the child named it', async () => {
    const { sim, link, brain } = setup('fi')
    const [aliceLook, steveLook] = makeCast('fi').map((a) => a.look)
    link.data = {
      items: [],
      actions: [],
      avatars: [
        // Saved while the game was in English: Alice is still Aino in Finnish.
        { type: 'avatar', id: 'alice', name: 'Alice', calls: ['alice'], pronoun: 'she', look: { ...aliceLook!, top: '#ff0000' }, asked: 'alice maalaa itsesi punaiseksi', made: MADE },
        { type: 'avatar', id: 'steve', name: 'Kalle', calls: ['kalle'], pronoun: 'he', look: steveLook!, asked: 'steve nimeä itsesi kalleksi', made: '2026-11-08T00:00:05.000Z' },
      ],
      phrases: [],
    }
    await brain.start()
    const [alice, steve] = [actor(sim, 'alice'), actor(sim, 'steve')]
    expect([alice.name, alice.look.top, steve.name, steve.names]).toEqual(['Aino', '#ff0000', 'Kalle', null])
    useLang(sim.world, 'en')
    expect([alice.name, steve.name]).toEqual(['Alice', 'Kalle'])
    // Forgetting Steve's saved entry gives him back his names in both languages.
    expect(await brain.forgetNewest()).toBe('Kalle')
    expect([steve.name, steve.names?.fi.name]).toEqual(['Steve', 'Eetu'])
  })

  it('a new avatar takes a free name of the game\'s language, and none a starting avatar goes by in the other language', async () => {
    const { sim, link, brain } = setup('en')
    await brain.start()
    const words = 'make a new girl'
    link.plans.set(words, plan({ heard: 'a new girl', heardFi: 'uusi tyttö', create: { id: 'aino', name: 'Aino', calls: ['aino'], pronoun: 'she', look: { body: 'kid' } } }))
    await brain.hear(words)
    const made = sim.world.actors.at(-1)!
    expect(made.name).toBe(NEW_NAMES.en[0])
    expect(made.names).toBeNull()
    expect(link.interprets[0]!.context).toContain(`Names free for a new avatar: ${NEW_NAMES.en.join(', ')}.`)
    useLang(sim.world, 'fi')
    expect(made.name).toBe(NEW_NAMES.en[0])
  })
})

describe('games played together', () => {
  it('"pelataan hippaa" is one game of tag that everyone plays, started by the first, at once', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    await brain.hear('pelataan hippaa')
    expect(link.interprets).toEqual([])
    const games = sim.world.actors.flatMap((a) => [a.doing, ...a.queue].filter((s) => s?.action === 'tag').map((s) => ({ who: a.id, players: s!.args.players })))
    expect(games).toEqual([{ who: 'alice', players: 'steve,mike,noora,mirri' }])
  })

  it('"Noora ja Mirri leikkikää junaa" is one train of the two, and a game for one named starts with everyone', async () => {
    const { sim, brain } = setup()
    await brain.start()
    await brain.hear('Noora ja Mirri leikkikää junaa')
    expect([actor(sim, 'noora').doing, ...actor(sim, 'noora').queue].find((s) => s?.action === 'train')!.args.players).toBe('mirri')
    expect(doingOrQueued(actor(sim, 'mirri'))).not.toContain('train')
    await brain.hear('Aino, pelaa jalkapalloa')
    const football = [actor(sim, 'alice').doing, ...actor(sim, 'alice').queue].find((s) => s?.action === 'football-game')!
    expect(football.args.players).toBeUndefined()
  })
})

describe('understanding the child better, from the play of 2026-11-09', () => {
  it('a bare "Ei!" stops what the one spoken to was just told, whatever a phrase once made of the words', async () => {
    const { sim, library, link, brain } = setup()
    await brain.start()
    await brain.hear('Noora, hyppää kolme kertaa')
    await brain.hear('Mikko, pyöri')
    await brain.hear('Noora, hyppää kolme kertaa')
    expect(doingOrQueued(actor(sim, 'noora'))).toEqual(['jump'])
    // Haiku made Noora say "Ei? Okei!": a phrase like it, kept before, must not play either.
    library.addPhrase({ words: 'ei', plan: plan({ who: ['noora'], steps: [{ who: 'noora', action: 'say', args: [{ name: 'words', value: 'Ei? Okei!' }] }] }), made: MADE })
    await brain.hear('Ei!')
    expect(doingOrQueued(actor(sim, 'noora'))).toEqual([])
    expect(doingOrQueued(actor(sim, 'mike'))).toEqual(['spin'])
    expect(brain.lines.at(-1)).toMatchObject({ heard: { en: 'Nora: stop', fi: 'Noora: seis' }, by: 'local', status: 'done' })
    expect(link.interprets).toHaveLength(0)
  })

  it("a new action or thing answers to no word another already answers to: 'kaada' stays the fell made first, 'pallo' the ball", async () => {
    const { library, link, brain } = setup()
    await brain.start()
    const thing = [{ name: 'thing', kind: 'item' as const, about: 'what to fell', optional: false }]
    library.addAction({ ...actionEntry('fell', 'yield* me.rest()', thing), calls: ['kaada', 'kaataa', 'fell'] })
    shut(link)
    // 'hyppikää' is the jump said to many: a verb ending is no word of the new action's either (jump-rope had taken "kaikki hyppikää").
    const TIP: NewAction = { id: 'tip-over', name: 'tip over', nameFi: 'kaada', calls: ['kaada', 'kaatakaa', 'kellista', 'hyppää', 'hyppikää', 'tip'], about: 'pushes the thing over', params: [{ name: 'thing', kind: 'thing', about: 'what', optional: false }] }
    const GIANT: NewItem = { ...FRISBEE, id: 'giant-ball', name: 'giant ball', nameFi: 'jättipallo', calls: ['jättipallo', 'pallo', 'giant ball'] }
    link.plans.set('Aino, kaada Mirri jättipallolla', plan({ who: ['alice'], steps: [{ who: 'alice', action: 'tip-over', args: [{ name: 'thing', value: 'mirri' }] }], newActions: [TIP], newItems: [GIANT] }))
    await brain.hear('Aino, kaada Mirri jättipallolla')
    const asked = (kind: 'action' | 'item') => link.invents.find((r) => r.kind === kind)!.spec.calls
    expect(asked('action')).toEqual(['kellista', 'tip'])
    expect(asked('action')).not.toContain('kaada')
    expect(asked('action')).not.toContain('hyppää')
    expect(asked('action')).not.toContain('hyppikää')
    expect(asked('item')).toEqual(['jättipallo', 'giant ball'])
    expect(library.items.get('giant-ball')!.calls).toEqual(['jättipallo', 'giant ball'])
  })

  it('tells the interpreter the whole scene: where everyone is and what they did, the things by id, the water and what was said', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    await brain.hear('Aino, hyppää!')
    expect(play(sim, brain, 10, (e) => e.type === 'done' && e.actor === 'alice')).not.toBeNull()
    link.plans.set('Aino, tee se uudestaan', plan({ who: ['alice'], steps: [{ who: 'alice', action: 'jump', args: [] }] }))
    await brain.hear('Aino, tee se uudestaan')
    const context = link.interprets[0]!.context
    expect(context).toMatch(/^- alice Aino kid she; at -?\d+,-?\d+ facing [a-z-]+; wears hair-ponytail \(#[0-9a-f]+\); did jump$/m)
    expect(context).toContain('Said before: Aino: hyppää.')
    expect(context).toContain('Water: none.')
    expect(context).toMatch(/^- #i\d+ slide -?\d+,-?\d+ fixed$/m)
    expect(context).toMatch(/^- slide: [\d.]+x[\d.]+x[\d.]+; too big to carry/m)
    expect(context).toContain('ball (pallo)')
  })
})

describe('scripts: code for this moment', () => {
  const wrap = (code: string) => `function* __action(me, args, w) {\n${code}\n}`
  const BOUNCE_FLIP = "yield* me.jump(0.4)\nyield* me.flip('backflip')\nme.say({ en: 'Ta-da!', fi: 'Tadaa!' })\nyield* me.rest()"
  const flipPlan = (code: string, guarded: string | null): Plan =>
    plan({
      who: ['alice'],
      steps: [{ who: 'alice', action: 'backflip-on-ball', args: [{ name: 'thing', value: 'ball' }] }],
      scripts: [{ id: 'backflip-on-ball', about: 'Alice jumps and does a backflip by the ball.', code, guarded }],
      say: 'Ta-da!',
      sayFi: 'Tadaa!',
    })

  it("plays the interpreter's own script after a quick test, asks no designer, keeps no phrase and forgets it once done", async () => {
    const { sim, library, link, brain } = setup()
    await brain.start()
    link.plans.set('Aino, hyppää ja tee voltti pallon luona', flipPlan(BOUNCE_FLIP, wrap(BOUNCE_FLIP)))
    await brain.hear('Aino, hyppää ja tee voltti pallon luona')
    // It waits for the test, without saying it thinks: that takes no time.
    expect(actor(sim, 'alice').queue[0]!.action).toMatch(/^moment-\d+-backflip-on-ball$/)
    expect(actor(sim, 'alice').bubble?.text ?? '').not.toBe('Hmm, mietitäänpä!')
    await brain.settled()
    const id = actor(sim, 'alice').queue[0]!.action
    expect(library.actions.get(id)!.params).toEqual([{ name: 'thing', kind: 'thing', about: 'thing', optional: true }])
    expect(play(sim, brain, 6, (e) => e.type === 'done' && e.actor === 'alice')).not.toBeNull()
    expect(link.invents).toEqual([])
    expect(savedIds(link)).toEqual([])
    expect(library.actions.has(id)).toBe(false)
    expect(brain.lines.at(-1)!.status).toBe('done')
  })

  it('sends a script the guard refused or the test failed to the designer as a fix, with the whole scene, while the avatar thinks aloud', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    link.design = designer(() => BOUNCE_FLIP)
    const broken = 'yield\nthrow new Error("boom")'
    link.plans.set('Aino, voltti', flipPlan(broken, wrap(broken)))
    await brain.hear('Aino, voltti')
    await brain.settled()
    expect(link.invents).toHaveLength(1)
    expect(link.invents[0]).toMatchObject({ kind: 'script', fix: { code: broken, error: expect.stringContaining('boom') }, spec: { about: 'Alice jumps and does a backflip by the ball.', calls: [] } })
    expect(link.invents[0]!.context).toContain('Things here (id kind where)')
    expect(play(sim, brain, 6, (e) => e.type === 'done' && e.actor === 'alice')).not.toBeNull()
    // Refused by the guard: the designer gets its reason.
    link.plans.set('Aino, voltti taas', { ...flipPlan('window.x', null), scripts: [{ id: 'backflip-on-ball', about: 'again', code: 'window.x', guarded: null, refused: 'window is not allowed (line 1)' }] })
    await brain.hear('Aino, voltti taas')
    await brain.settled()
    expect(link.invents.at(-1)).toMatchObject({ kind: 'script', fix: { code: 'window.x', error: 'window is not allowed (line 1)' } })
  })

  it('has the designer write a script with no code from its about, and starts one that uses a new thing only once the thing is made', async () => {
    const { sim, link, brain } = setup()
    await brain.start()
    const open = shut(link)
    link.design = designer(() => "const f = w.find('frisbee')\nif (f) yield* me.walkTo(f)\nyield* me.flip('somersault')")
    link.plans.set('Eetu, tee frisbee ja kuperkeikka sen luona', plan({ who: ['steve'], steps: [{ who: 'steve', action: 'flip-by', args: [] }], newItems: [FRISBEE], scripts: [{ id: 'flip-by', about: 'Steve makes a frisbee and somersaults by it.', code: '', guarded: null }] }))
    await brain.hear('Eetu, tee frisbee ja kuperkeikka sen luona')
    expect(actor(sim, 'steve').thinking).not.toBeNull()
    // A script makes what it needs: no draft is set down for it.
    expect(sim.world.items.some((i) => i.kind === 'frisbee')).toBe(false)
    open()
    await brain.settled()
    expect(link.invents.map((r) => r.kind).sort()).toEqual(['item', 'script'])
    expect(link.invents.find((r) => r.kind === 'script')!.fix).toBeUndefined()
    expect(play(sim, brain, 10, (e) => e.type === 'done' && e.actor === 'steve')).not.toBeNull()
  })
})
