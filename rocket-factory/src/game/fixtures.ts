import { BURROWS, cellOf, inLand } from './board'
import { PureChild } from './child'
import { NIGHT_CARD } from './hud'
import { CARDS, ticks, type SimEvent, type State } from './model'
import { act, cloneState, launchReady, newGame } from './rules'

/**
 * The demos, for ?demo, the screenshots and the tests: every moment a parent might want to
 * see, reached the way a child gets there. A careful eager child (child.ts PureChild) plays a
 * seed's game on the pure sim from its start card, and most demos are that game at a moment as
 * it passed it: the first factory, each card as it flips up, a muncher sitting, napping and at
 * a picnic, land 2 folding open, the full land 3, the rocket ready, the countdown, the morning
 * after the launch.
 * The others branch off it with what a child or a parent does there through rules.act, then
 * the child plays on to the moment: hedges round burrow B (its munchers nibble out), the Polite
 * switch, a bubble line with the two towers of Bubbles! by the green bottle belt (the towers
 * shooting), Good night (dusk, then the still card). Nothing is set by hand, so every demo is a
 * state the game reaches. A seed's game is played once a page (and a test file), as far as
 * the demos asked, and each demo is a copy of its moment, so it comes out the same for a seed
 * whatever was asked before it. They are never written to the child's save.
 */

export const DEMOS = [
  'start',
  'factory',
  'card-digger',
  'card-gold',
  'card-science',
  'card-gears',
  'card-bubbles',
  'card-hedges',
  'card-land2',
  'card-stars',
  'card-snacks',
  'card-land3',
  'card-rocket',
  'card-fuel',
  'sitting',
  'napping',
  'nibbling',
  'picnic',
  'polite',
  'towers',
  'land2',
  'land3',
  'dusk',
  'night',
  'ready',
  'launch',
  'after',
] as const
export type Demo = (typeof DEMOS)[number]
type Moment = Exclude<Demo, 'start'>
for (const id of CARDS) if (!DEMOS.includes(`card-${id}` as Demo)) throw new Error(`the ${id} card has no demo`)

/** A moment of the game: the first step after which `when` holds (with that step's events), and `then` game seconds more. */
interface When {
  when: (s: State, events: readonly SimEvent[]) => boolean
  then: number
}
const event = (kind: SimEvent['kind']) => (_: State, events: readonly SimEvent[]) => events.some((e) => e.kind === kind)
const doing = (mode: State['munchers'][number]['mode']) => (s: State) => s.munchers.some((m) => m.mode === mode)

/** The moments of the careful child's own game. */
const MAIN: Partial<Record<Moment, When>> = {
  // The lab's first bottle: the first factory, a line from the rocks to the lab, a while into its work.
  factory: { when: event('drink'), then: 12 },
  sitting: { when: doing('sit'), then: 0 },
  napping: { when: doing('nap'), then: 0 },
  picnic: { when: doing('picnic'), then: 0 },
  land2: { when: (_, events) => events.some((e) => e.kind === 'flap' && e.land === 2), then: 0 },
  // A minute after Rocket!: every line of land 3 running, the engine opening.
  land3: { when: (_, events) => events.some((e) => e.kind === 'card' && e.id === 'rocket'), then: 60 },
  // Every part full and Fuel! found: the launch button bounces on the pad.
  ready: { when: (s) => launchReady(s), then: 0 },
  launch: { when: event('launch'), then: 4.5 },
  after: { when: event('landed'), then: 5 },
}
for (const id of CARDS) MAIN[`card-${id}`] = { when: (_, events) => events.some((e) => e.kind === 'card' && e.id === id), then: 0 }

/** Plays on with the careful child until a moment: `when`, then `then` seconds more. */
type PlayOn = (moment: When) => void

/** Burrow B walled in all round: a hedge line along each side of its mound in the open land (closed land walls the rest), each drawn with the hedge as her finger draws it. Its munchers can only nibble their way out. */
function wallB(s: State): void {
  const b = BURROWS[1]!
  const sides = [
    [[b.x, b.y - 1], [b.x + 1, b.y - 1]],
    [[b.x + 2, b.y], [b.x + 2, b.y + 1]],
    [[b.x + 1, b.y + 2], [b.x, b.y + 2]],
    [[b.x - 1, b.y + 1], [b.x - 1, b.y]],
  ].filter((side) => side.every(([x, y]) => inLand(s.land, x!, y!)))
  for (const side of sides) {
    const cells = side.map(([x, y]) => cellOf(x!, y!))
    if (s.tool.kind !== 'hedge') act(s, { kind: 'tool', tool: { kind: 'hedge' } })
    act(s, { kind: 'drag', cells })
    act(s, { kind: 'release', commit: true })
    if (!cells.every((c) => s.hedge[c] === 1)) throw new Error(`demo: no hedge line along burrow B at ${side.join(' ')}`)
  }
}

/** The bubble line from the pump (0, 8) north and round to the green bottle belt's side, bridging the pad's bar belt, and the two towers of Bubbles! on its last cells: in reach of every cell munchers sit on along that belt. */
const BUBBLE_LINE: readonly (readonly [number, number])[] = [[1, 8], [1, 7], [2, 7], [3, 7], [4, 7], [4, 6], [4, 5], [4, 4], [5, 4], [6, 4]]
const TOWERS: readonly (readonly [number, number])[] = [[5, 4], [6, 4]]
function bubbleLine(s: State): void {
  if (!s.buildings.some((b) => b.kind === 'pump' && b.x === 0 && b.y === 8)) throw new Error('demo: the pump is not at its spot by the pond')
  if (s.tool.kind !== 'pencil') act(s, { kind: 'tool', tool: { kind: 'pencil' } })
  const cells = BUBBLE_LINE.map(([x, y]) => cellOf(x, y))
  act(s, { kind: 'drag', cells })
  act(s, { kind: 'release', commit: true })
  if (!cells.slice(1).every((c) => s.belts.out[c]! >= 0)) throw new Error('demo: the bubble line did not lay')
  for (const [x, y] of TOWERS) {
    act(s, { kind: 'tool', tool: { kind: 'sticker', sticker: 'tower' } })
    act(s, { kind: 'hold', x: x + 0.5, y: y + 0.5 })
    act(s, { kind: 'release', commit: true })
    if (!s.buildings.some((b) => b.kind === 'tower' && b.x === x && b.y === y)) throw new Error(`demo: no tower at ${x}, ${y}`)
  }
}

/** The demos that branch off a moment of the careful child's game: what is done there, through rules.act, and playing on (PlayOn) to their own moment. */
const BRANCHES: Partial<Record<Moment, { from: Moment; go: (s: State, play: PlayOn) => void }>> = {
  nibbling: {
    from: 'land2',
    go: (s, play) => {
      wallB(s)
      play({ when: doing('nibble'), then: 0 })
    },
  },
  polite: {
    from: 'factory',
    go: (s, play) => {
      act(s, { kind: 'munchers', mode: 'polite' })
      play({ when: doing('polite'), then: 0 })
    },
  },
  towers: {
    from: 'card-bubbles',
    go: (s, play) => {
      play({ when: (x) => x.buildings.some((b) => b.kind === 'pump'), then: 0 })
      bubbleLine(s)
      // The puff in the air, on its way to a muncher's nose.
      play({ when: event('shot'), then: 0.2 })
    },
  },
  dusk: {
    from: 'factory',
    // The pause menu's Good night: the menu closes and dusk falls. A second after the first kind's nightcap.
    go: (s, play) => {
      act(s, { kind: 'unpaused' })
      act(s, { kind: 'goodnight' })
      play({ when: (x) => x.night !== null && x.night.kind !== null, then: 1 })
    },
  },
  night: {
    from: 'dusk',
    // The child taps each kind in its nightcap as the hint says, until the last is in and the still card is up.
    go: (_, play) => play({ when: (x) => x.night !== null && x.night.doneAt >= 0, then: NIGHT_CARD + 0.5 }),
  },
}
for (const name of DEMOS) if (name !== 'start' && (MAIN[name] === undefined) === (BRANCHES[name] === undefined)) throw new Error(`demo ${name} must be one moment of the game or one branch off it`)

/** The careful eager child of the demos. */
const CAREFUL = { pace: 'eager', behaviour: 'careful' } as const
/** The game is over by then (the launch comes before 60 minutes), or a moment never came: a demo throws rather than plays on. */
const MAIN_MOST = ticks(90 * 60)
/** A branch's moment comes within this, or it throws. */
const BRANCH_MOST = ticks(20 * 60)

/** Steps s with `child` until `moment`, throwing past `most` ticks from now. */
function playUntil(s: State, child: PureChild, moment: When, most: number): void {
  const end = s.tick + most
  for (;;) {
    child.step(s)
    if (moment.when(s, s.events)) break
    if (s.tick > end) throw new Error(`demo: the moment never came within ${most / 3600} game minutes`)
  }
  for (let i = 0; i < ticks(moment.then); i++) child.step(s)
}

/** One seed's careful game from its start card (Play pressed, a session begun), played as far as the demos asked so far, with a copy of each moment it passed and of each branch made. */
export class DemoGame {
  private readonly s: State
  private readonly child: PureChild
  private readonly copies = new Map<Moment, State>()
  /** Moments that came, and the tick their copy is due at (`then` after). */
  private readonly due = new Map<Moment, number>()

  constructor(private readonly seed: number) {
    this.s = newGame(seed)
    act(this.s, { kind: 'play' })
    act(this.s, { kind: 'session' })
    this.child = new PureChild(CAREFUL, seed)
  }

  /** A copy of the game at that moment, played on to it if the game has not passed it yet. */
  at(name: Moment): State {
    const kept = this.copies.get(name)
    if (kept !== undefined) return cloneState(kept)
    const branch = BRANCHES[name]
    if (branch !== undefined) {
      const s = this.at(branch.from)
      const child = new PureChild(CAREFUL, this.seed * 31 + DEMOS.indexOf(name))
      branch.go(s, (moment) => playUntil(s, child, moment, BRANCH_MOST))
      this.copies.set(name, cloneState(s))
      return s
    }
    while (!this.copies.has(name)) {
      if (this.s.tick > MAIN_MOST) throw new Error(`demo ${name}: the careful child's game never came to it`)
      this.child.step(this.s)
      this.look()
    }
    return cloneState(this.copies.get(name)!)
  }

  /** After a step: the moments that came now, and a copy of each whose time is due. */
  private look(): void {
    const s = this.s
    for (const [name, m] of Object.entries(MAIN) as [Moment, When][]) if (!this.copies.has(name) && !this.due.has(name) && m.when(s, s.events)) this.due.set(name, s.tick + ticks(m.then))
    for (const [name, at] of this.due) {
      if (s.tick < at) continue
      this.copies.set(name, cloneState(s))
      this.due.delete(name)
    }
  }
}

/** The seeds' games played so far. */
const games = new Map<number, DemoGame>()

/** The demo `name` for a seed, the same every time: 'start' is a fresh game at its start card; every other is a copy of its moment of the careful child's game for the seed (see the file comment). */
export function demoState(name: Demo, seed: number): State {
  if (name === 'start') return newGame(seed)
  let game = games.get(seed)
  if (game === undefined) games.set(seed, (game = new DemoGame(seed)))
  return game.at(name)
}
