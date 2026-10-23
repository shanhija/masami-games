/**
 * The scripted children's whole games on the pure sim (plans/rocket-factory.md, Munchers, The
 * havoc's size, and Engineering, the scripted children). Each of brain.ts's children (a pace
 * and a behaviour) plays newGame through rules.act and rules.step with the munchers on Many,
 * taking the hint's steps its behaviour takes, and the careful child with the munchers off (the
 * None switch) gives the base. Every game holds:
 *  - the orders, with the munchers on Many or Polite (Few halves their hunger, None keeps them
 *    in): burrow A's scout and a raid of A's come out before Bubbles!, a raid of burrow B's
 *    before Snacks! (the need comes before the tool);
 *  - never 8 minutes without a new card, a rocket part full or a flap opened, up to the launch;
 *  - never 60 s with the lab and the pad both starved: each wants something (the lab bottles
 *    for its card, the pad an open part's things) and gets none of it.
 * Those two hold for every child who defends at all and with the munchers off: the child who
 * never defends is slower by the havoc itself, the cost the ratios below measure, so its
 * longest wait is measured, not held.
 * Every turn of a child touches the board, whether or not it takes the hint's step: a child who
 * skips the defence still plays, and the kind rules (a touch within 30 s) must see her there.
 * By default a few seeds play a small slice, and 20 seeds of fuzz play 10 minutes each with a
 * random child and switch. With FACTORY_LONG=1 ten seeds of every child give
 * the havoc ratios as medians (a child who never defends launches at 1.15 to 1.30 times the
 * careful child's time, a child who only tickles at most 1.10, the careful child at most 1.03
 * times the munchers off, a slow child's never-defends ratio at most 1.25, and on every seed
 * the careful child launches no later than the one who never defends) and the pacing windows
 * (table: the first factory by 3:00, Gears! by 6:00, Bubbles! 8:30 to 11:00, the first Land!
 * 18:00 to 22:00, the launch 50 to 60 minutes; eager: the launch 45 to 55; slow: 55 to 70), as
 * medians too; and 200 seeds of fuzz play 10 minutes each with a random child and switch.
 * "The first factory" is the first digger whose rocks an oven bakes into bars that ride to the
 * rocket: the chain that runs by itself. "The launch" is the flight landing, when it counts.
 */
import { describe, expect, it } from 'vitest'

import { BEHAVIOURS, PACES, type Behaviour, type Pace, type Profile } from './brain'
import { PureChild } from './child'
import { labNeed, openParts } from './machines'
import { HZ, MUNCHER_MODES, ticks, type Building, type CardId, type Kind, type MunchersMode, type State, type Step } from './model'
import { between, rng } from './random'
import { act, launchReady, newGame } from './rules'
import { lintNet } from './strokes'

const LONG = process.env.FACTORY_LONG === '1'

/** What a game records: a card's id when it came, the first factory, the launch landing. */
type Milestone = CardId | 'factory' | 'landed'
interface Game {
  seed: number
  profile: Profile
  munchers: MunchersMode
  at: Partial<Record<Milestone, number>>
  /** Each visit as it came out of its burrow's door: the burrow, the tick, the scout. */
  visits: { burrow: number; at: number; scout: boolean }[]
  /** The longest stretch with no new card, no rocket part full and no flap opened, up to the launch, and the tick it ended. */
  quiet: { ticks: number; end: number }
  /** The longest stretch with the lab and the pad both starved, and the tick it ended. */
  starved: { ticks: number; end: number }
}

/** The buildings whose mouths building b's spout belts reach, through forks, joins and bridges. */
function fedBy(s: State, b: Building): Building[] {
  const seen = new Set<number>()
  const ids = new Set<number>()
  for (const todo = [...s.net.spouts.get(b.id)!]; todo.length > 0; ) {
    const x = todo.pop()!
    if (seen.has(x)) continue
    seen.add(x)
    for (const y of [s.net.next[x]!, s.net.next2[x]!]) {
      if (y >= 0) todo.push(y)
      else if (y <= -2) ids.add(-2 - y)
    }
  }
  return s.buildings.filter((r) => ids.has(r.id))
}
const isKind = (kind: Kind) => (b: Building) => b.kind === kind
/** A digger's rocks ride to an oven whose bars ride to the rocket. */
const factoryRuns = (s: State) => s.buildings.filter(isKind('digger')).some((d) => fedBy(s, d).some((o) => o.kind === 'oven' && fedBy(s, o).some(isKind('pad'))))

/** The steps whose script edits the layout: each must leave an undo entry from this very tick. */
const EDITS: ReadonlySet<Step['kind']> = new Set(['place', 'free', 'bottleneck', 'link', 'defend', 'refill'])

/**
 * Plays seed `seed` as the child `profile` (child.ts PureChild, with a generator of its own
 * for the seed and the pace) with the munchers switch `munchers` until milestone `last` or
 * `minutes` of game time: its turns come as its pace says, and each turn touches the board,
 * runs the step its behaviour takes (if any) and lifts the finger. Every layout step must
 * leave its undo entry and the board must lint clean after it, so a hint that leads nowhere
 * fails where it does.
 */
function play(seed: number, profile: Profile, munchers: MunchersMode, last: Milestone, minutes: number): Game {
  const s = newGame(seed)
  const child = new PureChild(profile, seed * 7919 + 17 + 1000003 * PACES.indexOf(profile.pace))
  act(s, { kind: 'munchers', mode: munchers })
  act(s, { kind: 'play' })
  act(s, { kind: 'session' })
  const g: Game = { seed, profile, munchers, at: {}, visits: [], quiet: { ticks: 0, end: 0 }, starved: { ticks: 0, end: 0 } }
  const longest = (k: 'quiet' | 'starved', from: number) => {
    if (s.tick - from > g[k].ticks) g[k] = { ticks: s.tick - from, end: s.tick }
  }
  const end = ticks(minutes * 60)
  let news = 0
  let lab = 0
  let pad = 0
  let visitAt = -1
  while (g.at[last] === undefined && s.tick < end) {
    const r = child.step(s)
    if (r !== null) {
      // The step's tick is the one just stepped.
      if (EDITS.has(r.step.kind)) expect(s.undo.at(-1)?.at, `seed ${seed} ${profile.pace} ${profile.behaviour}: ${JSON.stringify(r.step).slice(0, 160)} did nothing`).toBe(s.tick - 1)
      expect(lintNet(s)).toEqual([])
    }
    for (const e of s.events) {
      if (e.kind === 'card') g.at[e.id] = s.tick
      if (e.kind === 'landed') g.at.landed = s.tick
      if (e.kind === 'card' || e.kind === 'partFull' || (e.kind === 'launch' && g.at.fuel !== undefined)) {
        longest('quiet', news)
        news = s.tick
      }
      if (e.kind === 'drink') lab = s.tick
      if (e.kind === 'fill') pad = s.tick
    }
    if (s.visit !== null && s.visit.at !== visitAt) {
      visitAt = s.visit.at
      g.visits.push({ burrow: s.visit.burrow, at: s.tick, scout: s.munchers.some((m) => m.scout) })
    }
    if (s.tick % HZ !== 0 || s.launch !== null || launchReady(s)) continue
    if (g.at.factory === undefined && factoryRuns(s)) g.at.factory = s.tick
    const need = labNeed(s)
    if (need[0] + need[1] === 0) lab = s.tick
    if (openParts(s).length === 0) pad = s.tick
    longest('starved', Math.max(lab, pad))
    if (g.at.fuel === undefined) longest('quiet', news)
  }
  return g
}

const clock = (tick: number) => `${Math.floor(tick / 3600)}:${String(Math.floor((tick % 3600) / 60)).padStart(2, '0')}`
const tickOf = (time: string) => {
  const [m, sec] = time.split(':').map(Number) as [number, number]
  return ticks(m * 60 + sec)
}
const name = (g: Game) => `seed ${g.seed} ${g.profile.pace} ${g.profile.behaviour}${g.munchers === 'many' ? '' : ` (${g.munchers})`}`

/** The orders (with the munchers on Many or Polite: Few halves their hunger and None keeps them in), and the 8-minute rule and the 60 s rule but for the child who never defends, for a game as far as it went. */
function holdsTheRules(g: Game): void {
  const ordered = g.munchers === 'many' || g.munchers === 'polite'
  const a = g.visits.filter((v) => v.burrow === 0)
  const bubbles = g.at.bubbles
  if (ordered && bubbles !== undefined) {
    expect(a[0]?.scout, `${name(g)}: A's first visit is the scout`).toBe(true)
    expect(a[1]?.at ?? Infinity, `${name(g)}: A's scout and a raid before Bubbles! at ${clock(bubbles)}`).toBeLessThan(bubbles)
  }
  const snacks = g.at.snacks
  if (ordered && snacks !== undefined) expect(g.visits.find((v) => v.burrow === 1)?.at ?? Infinity, `${name(g)}: B raids before Snacks! at ${clock(snacks)}`).toBeLessThan(snacks)
  if (g.profile.behaviour === 'neverDefends' && g.munchers !== 'none') return
  expect(g.quiet.ticks, `${name(g)}: no news for ${clock(g.quiet.ticks)} up to ${clock(g.quiet.end)}`).toBeLessThan(ticks(8 * 60))
  expect(g.starved.ticks, `${name(g)}: the lab and the pad starved for ${g.starved.ticks / HZ} s up to ${clock(g.starved.end)}`).toBeLessThan(ticks(60))
}

const median = (xs: readonly number[]) => {
  const v = [...xs].sort((p, q) => p - q)
  return v.length % 2 === 1 ? v[(v.length - 1) / 2]! : (v[v.length / 2 - 1]! + v[v.length / 2]!) / 2
}

describe('the scripted children on the pure sim', () => {
  it('a careful child at every pace and a table child who never defends play to the launch, holding the orders and the rules; the careful one launches first', { timeout: 120_000 }, () => {
    for (const seed of [1]) {
      const careful = PACES.map((pace) => play(seed, { pace, behaviour: 'careful' }, 'many', 'landed', 100))
      const never = play(seed, { pace: 'table', behaviour: 'neverDefends' }, 'many', 'landed', 100)
      for (const g of [...careful, never]) {
        expect(g.at.landed, `${name(g)} launches`).toBeDefined()
        holdsTheRules(g)
      }
      expect(careful[1]!.at.landed!).toBeLessThanOrEqual(never.at.landed!)
    }
  })

  it('with the munchers off the careful child launches with nothing out, holding the rules', { timeout: 60_000 }, () => {
    const g = play(3, { pace: 'eager', behaviour: 'careful' }, 'none', 'landed', 100)
    expect(g.at.landed).toBeDefined()
    expect(g.visits).toEqual([])
    holdsTheRules(g)
  })

  it('a fuzz of random children and switches holds the rules for 10 minutes', { timeout: LONG ? 900_000 : 60_000 }, () => {
    for (let seed = 1; seed <= (LONG ? 200 : 20); seed++) {
      const u = rng(seed * 104729 + 3)
      const pace = PACES[between(u(), 0, PACES.length - 1)]!
      const behaviour = BEHAVIOURS[between(u(), 0, BEHAVIOURS.length - 1)]!
      const munchers = MUNCHER_MODES[between(u(), 0, MUNCHER_MODES.length - 1)]!
      holdsTheRules(play(seed, { pace, behaviour }, munchers, 'landed', 10))
    }
  })
})

describe.runIf(LONG)('the statistics over ten seeds', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  /** Every child's game on every seed, played once for all the checks below. */
  const games = new Map<string, Game>()
  const key = (seed: number, pace: Pace, behaviour: Behaviour | 'none') => `${seed} ${pace} ${behaviour}`
  const game = (seed: number, pace: Pace, behaviour: Behaviour | 'none') => {
    const k = key(seed, pace, behaviour)
    // 150 minutes: a slow child who never defends can take half as long again as the careful one.
    if (!games.has(k)) games.set(k, play(seed, { pace, behaviour: behaviour === 'none' ? 'careful' : behaviour }, behaviour === 'none' ? 'none' : 'many', 'landed', 150))
    return games.get(k)!
  }
  const landed = (g: Game) => {
    expect(g.at.landed, `${name(g)} launches`).toBeDefined()
    return g.at.landed!
  }
  /** The median over the seeds of the launch of `behaviour` over the launch of `base`, at a pace. */
  const ratio = (pace: Pace, behaviour: Behaviour, base: Behaviour | 'none') => median(SEEDS.map((seed) => landed(game(seed, pace, behaviour)) / landed(game(seed, pace, base))))

  it('every child launches, holding the orders and the rules on every seed', { timeout: 900_000 }, () => {
    for (const seed of SEEDS)
      for (const pace of PACES) {
        for (const behaviour of [...BEHAVIOURS, 'none' as const]) holdsTheRules(game(seed, pace, behaviour))
        expect(landed(game(seed, pace, 'careful')), `seed ${seed} ${pace}: the careful child launches no later than the one who never defends`).toBeLessThanOrEqual(landed(game(seed, pace, 'neverDefends')))
      }
  })

  it('the havoc ratios: never defending costs 15 to 30 percent (a slow child at most 25), tickling only at most 10, and the careful child loses at most 3 to the munchers', { timeout: 900_000 }, () => {
    for (const pace of PACES) {
      const never = ratio(pace, 'neverDefends', 'careful')
      expect(never, `${pace}: never defends`).toBeGreaterThanOrEqual(pace === 'slow' ? 1 : 1.15)
      expect(never, `${pace}: never defends`).toBeLessThanOrEqual(pace === 'slow' ? 1.25 : 1.3)
      expect(ratio(pace, 'tickleOnly', 'careful'), `${pace}: tickles only`).toBeLessThanOrEqual(1.1)
      expect(ratio(pace, 'careful', 'none'), `${pace}: careful against the munchers off`).toBeLessThanOrEqual(1.03)
    }
  })

  it('the pacing windows, as medians of the careful child', { timeout: 900_000 }, () => {
    const at = (pace: Pace, m: Milestone) =>
      median(
        SEEDS.map((seed) => {
          const t = game(seed, pace, 'careful').at[m]
          expect(t, `seed ${seed} ${pace}: ${m}`).toBeDefined()
          return t!
        }),
      )
    const within = (pace: Pace, m: Milestone, lo: string, hi: string) => {
      expect(at(pace, m), `${pace} ${m} at ${clock(at(pace, m))}`).toBeGreaterThanOrEqual(tickOf(lo))
      expect(at(pace, m), `${pace} ${m} at ${clock(at(pace, m))}`).toBeLessThanOrEqual(tickOf(hi))
    }
    within('table', 'factory', '0:00', '3:00')
    within('table', 'gears', '0:00', '6:00')
    within('table', 'bubbles', '8:30', '11:00')
    within('table', 'nose', '18:00', '22:00')
    within('table', 'landed', '50:00', '60:00')
    within('eager', 'landed', '45:00', '55:00')
    within('slow', 'landed', '55:00', '70:00')
  })
})

