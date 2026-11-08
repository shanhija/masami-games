/**
 * The group games, played headless on the real Sim with the real content: each game in each
 * room with two (the cat starting), three and five players, in a Finnish and an English world
 * from one seed. Each must end on its own in its time with everyone free, nobody walking on
 * the spot for over a second, every line shown in the game's language at the same moments in
 * both, and do what it is for: tag passes "it", football scores, hide and seek finds everyone
 * and leaves nobody inside a thing, the race has a winner, the train keeps together. Then the
 * edges: a game stopped midway, players who were sitting or busy, a command that takes a
 * player out, who the players arg names, and the calls a child says.
 */

import { describe, expect, it } from 'vitest'

import { proportions } from '../engine/body'
import type { Lang } from '../engine/lang'
import { Library } from '../engine/library'
import { createWorld, Sim } from '../engine/sim'
import { ROOMS, ROOM_HALF, type Actor, type RoomId, type Step } from '../engine/types'
import { BASIC_VERBS, BUILTIN_ACTIONS, BUILTIN_ITEMS, GAMES, LAYOUTS, makeCast } from '.'

const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })

const GAME_IDS = ['tag', 'football-game', 'hide-and-seek', 'race', 'train']

/** Who plays: the one who starts it, and the players arg; the others in the room look on. */
const TEAMS = [
  { label: 'two, the cat starting', who: 'mirri', players: 'mike', ids: ['mirri', 'mike'] },
  { label: 'three', who: 'steve', players: 'alice, mirri', ids: ['steve', 'alice', 'mirri'] },
  { label: 'five', who: 'alice', players: '', ids: ['alice', 'steve', 'mike', 'noora', 'mirri'] },
]

/** How long each may take at most, from the words to its end. */
const MOST: Record<string, number> = { tag: 45, 'football-game': 52, 'hide-and-seek': 56, race: 50, train: 50 }

interface Line {
  frame: number
  t: number
  who: string
  text: string
}

interface Play {
  sim: Sim
  lines: Line[]
  /** The starter's step: how it ended and when. */
  how: string | null
  secs: number
  /** Each time someone walked on the spot for over a second: who and when. */
  onSpot: string[]
}

/**
 * Walking on the spot: the walk cycle went on through (nearly) the whole last second, but it got
 * nowhere: under 0.3 m of way, or under 0.3 m from where it was while stepping back and forth
 * over and over. A U-turn is not on the spot, nor is a moment's jostle before it stops.
 */
function onTheSpot(h: { x: number; z: number; stride: number }[]): boolean {
  if (h.length < 60) return false
  let path = 0
  let flips = 0
  let walking = 0
  for (let i = 1; i < 60; i++) {
    if (h[i]!.stride > h[i - 1]!.stride) walking++
    const dx = h[i]!.x - h[i - 1]!.x
    const dz = h[i]!.z - h[i - 1]!.z
    path += Math.hypot(dx, dz)
    if (i > 1 && dx * (h[i - 1]!.x - h[i - 2]!.x) + dz * (h[i - 1]!.z - h[i - 2]!.z) < -1e-8) flips++
  }
  return walking >= 50 && (path < 0.3 || (Math.hypot(h[59]!.x - h[0]!.x, h[59]!.z - h[0]!.z) < 0.3 && flips > 6))
}

/** Plays a game in a fresh world with the whole cast, until the starter's step has ended and a second more. */
function play(game: string, room: RoomId, team: (typeof TEAMS)[number], lang: Lang, seed: number, each: (sim: Sim) => void = () => {}): Play {
  const sim = new Sim(createWorld({ room, actors: makeCast(lang), layouts: LAYOUTS, seed, lang }), library)
  const w = sim.world
  const step: Step = { action: game, args: team.players === '' ? {} : { players: team.players }, serial: 1 }
  sim.give(team.who, [step], true)
  const lines: Line[] = []
  const shown = new Map<string, unknown>()
  const trail = new Map<string, { x: number; z: number; stride: number }[]>()
  const onSpot: string[] = []
  let how: string | null = null
  let secs = 0
  for (let f = 1; f <= 60 * 70; f++) {
    sim.step()
    each(sim)
    for (const a of w.actors) {
      if (a.bubble !== null && a.bubble !== shown.get(a.id)) lines.push({ frame: f, t: w.t, who: a.id, text: a.bubble.text })
      shown.set(a.id, a.bubble)
      const h = trail.get(a.id) ?? []
      h.push({ x: a.x, z: a.z, stride: a.stride })
      if (h.length > 60) h.shift()
      trail.set(a.id, h)
      if (onTheSpot(h) && !onSpot.some((s) => s.startsWith(`${a.id} `) && Number(s.split(' ')[1]) > w.t - 1)) onSpot.push(`${a.id} ${w.t.toFixed(2)}`)
    }
    const ended = w.events.find((e) => (e.type === 'done' || e.type === 'failed') && e.actor === team.who && e.step.serial === 1)
    w.events.length = 0
    w.sounds.length = 0
    w.speech.length = 0
    if (ended !== undefined && how === null) {
      how = ended.type
      secs = w.t
    }
    if (how !== null && w.t > secs + 1) break
  }
  return { sim, lines, how, secs, onSpot }
}

const said = (p: Play, text: string) => p.lines.filter((l) => l.text === text)
const actor = (sim: Sim, id: string) => sim.world.actors.find((a) => a.id === id)!
const radius = (a: Actor) => proportions(a.look).radius * a.scale

/** What each game must have done, by its English lines and the world it left. */
const CHECKS: Record<string, (p: Play, team: (typeof TEAMS)[number], label: string) => void> = {
  tag: (p, _team, label) => expect(said(p, 'Tag!').length, `${label}: "it" passes on`).toBeGreaterThan(0),
  'football-game': (p, _team, label) => {
    expect(said(p, 'Kick off!').length, label).toBe(1)
    expect(p.lines.some((l) => /^Red \d+, blue \d+!$/.test(l.text)), `${label}: the score`).toBe(true)
    expect(p.sim.world.items.filter((it) => it.kind === 'goal'), `${label}: the goals are taken away`).toEqual([])
  },
  'hide-and-seek': (p, team, label) => {
    // A quick round (one or two hiding) is played again with the one found first counting.
    const rounds = said(p, 'Go and hide!').length
    expect(rounds, label).toBeGreaterThanOrEqual(1)
    expect(said(p, 'Found you!').length, `${label}: finds everyone`).toBe((team.ids.length - 1) * rounds)
    // Nobody is left inside a thing (a bush, the tent, behind which they hid).
    for (const a of p.sim.world.actors) {
      for (const it of p.sim.world.items) {
        const info = p.sim.library.info(it.kind)
        if (!info.recipe.meta.solid) continue
        expect(Math.hypot(a.x - it.x, a.z - it.z), `${label}: ${a.id} inside the ${it.kind}`).toBeGreaterThan(info.radius * it.scale + radius(a) - 0.1)
      }
    }
  },
  race: (p, _team, label) => expect(said(p, 'I won!').length, `${label}: a winner`).toBeGreaterThan(0),
  train: () => {},
}

describe('the group games', () => {
  for (const game of GAME_IDS) {
    describe(game, () => {
      for (const room of ROOMS) {
        for (const team of TEAMS) {
          it(`in the ${room}, ${team.label}: ends on its own, everyone free, in both languages`, () => {
            const label = `${game} in the ${room}, ${team.label}`
            // The train: from "toot toot" to the last stop, every car stays close to someone of the train.
            const far: Record<string, number> = {}
            let rides = 0
            let riding = false
            const watch = (sim: Sim) => {
              if (game !== 'train') return
              const lead = actor(sim, team.who)
              if (lead.bubble?.text === 'Toot toot!') riding = true
              if (lead.bubble?.text === 'Last stop!') riding = false
              if (!riding) return
              rides++
              const cars = team.ids.map((id) => actor(sim, id))
              for (const car of cars.slice(1)) {
                const near = Math.min(...cars.filter((c) => c !== car).map((c) => Math.hypot(c.x - car.x, c.z - car.z)))
                if (near > 1.4) far[car.id] = (far[car.id] ?? 0) + 1
              }
            }
            const en = play(game, room, team, 'en', 7, watch)
            const fi = play(game, room, team, 'fi', 7)
            for (const p of [en, fi]) {
              expect(p.how, label).toBe('done')
              expect(p.secs, label).toBeGreaterThan(15)
              expect(p.secs, label).toBeLessThan(MOST[game]!)
              expect(p.onSpot, `${label}: walks on the spot`).toEqual([])
              for (const a of p.sim.world.actors) {
                expect(a.joinedBy, `${label}: ${a.id} let go`).toBeNull()
                expect(a.doing, `${label}: ${a.id} done`).toBeNull()
                expect(Number.isFinite(a.x) && Number.isFinite(a.z) && Number.isFinite(a.y), `${label}: ${a.id}`).toBe(true)
                expect(Math.max(Math.abs(a.x), Math.abs(a.z)), `${label}: ${a.id}`).toBeLessThanOrEqual(ROOM_HALF)
              }
            }
            // Every line in the game's language: the same lines at the same moments, worded apart but for numbers and sounds.
            expect(fi.lines.map((l) => `${l.frame} ${l.who}`), `${label}: the same lines`).toEqual(en.lines.map((l) => `${l.frame} ${l.who}`))
            en.lines.forEach((e, i) => {
              const f = fi.lines[i]!
              if (e.text === f.text) expect(/^[\d\s.,!?]+$/.test(e.text) || e.text === 'Hmm?' || e.text === 'Hmm...', `${label}: "${e.text}" in both`).toBe(true)
              expect(e.text + f.text, label).not.toMatch(/[–—]/)
            })
            CHECKS[game]!(en, team, label)
            if (game === 'train') {
              expect(rides, label).toBeGreaterThan(60 * 15)
              for (const id of team.ids.slice(1)) expect((far[id] ?? 0) / rides, `${label}: ${id} keeps up`).toBeLessThan(0.05)
            }
          })
        }
      }
    })
  }

  it('score goals over a few games, and say the score', () => {
    let goals = 0
    for (const seed of [1, 2, 3]) {
      const p = play('football-game', 'playground', TEAMS[2]!, 'en', seed)
      goals += said(p, 'Goal!').length
      const score = p.lines.find((l) => /^Red \d+, blue \d+!$/.test(l.text))!.text
      const [red, blue] = score.match(/\d+/g)!.map(Number)
      expect(red! + blue!).toBe(said(p, 'Goal!').length)
    }
    expect(goals).toBeGreaterThan(2)
  })
})

describe('playing together', () => {
  const sim = (lang: Lang = 'en') => new Sim(createWorld({ room: 'playground', actors: makeCast(lang), layouts: LAYOUTS, seed: 3, lang }), library)
  const give = (s: Sim, who: string, action: string, args: Record<string, string> = {}, serial = 1) => s.give(who, [{ action, args, serial }], true)
  const runFor = (s: Sim, secs: number, each: () => void = () => {}) => {
    for (let f = Math.round(secs * 60); f > 0; f--) {
      s.step()
      each()
      s.world.events.length = 0
      s.world.sounds.length = 0
      s.world.speech.length = 0
    }
  }

  it('gets the ones sitting on a bench or a swing up to play, ends what another was doing, and lets everyone go when stopped', () => {
    const s = sim()
    give(s, 'mike', 'sit', { on: 'bench' })
    give(s, 'noora', 'sit', { on: 'swing' })
    runFor(s, 10)
    expect(actor(s, 'mike').riding).not.toBeNull()
    expect(actor(s, 'noora').riding).not.toBeNull()
    give(s, 'steve', 'walk', { to: '-9,-9' })
    runFor(s, 0.5)
    expect(actor(s, 'steve').doing?.action).toBe('walk')
    give(s, 'alice', 'tag')
    const from = new Map(s.world.actors.map((a) => [a.id, { x: a.x, z: a.z }]))
    runFor(s, 6)
    for (const id of ['mike', 'noora', 'steve', 'mirri']) {
      const a = actor(s, id)
      expect(a.riding, id).toBeNull()
      expect(a.joinedBy, id).toBe('alice')
      expect(a.doing, `${id}'s own step ended`).toBeNull()
      expect(Math.hypot(a.x - from.get(id)!.x, a.z - from.get(id)!.z), `${id} plays`).toBeGreaterThan(1)
    }
    s.stop('alice')
    runFor(s, 1.5)
    for (const a of s.world.actors) {
      expect(a.joinedBy, a.id).toBeNull()
      expect(a.doing, a.id).toBeNull()
      expect(Math.abs(a.pitch), a.id).toBeLessThan(0.05)
    }
    // Steve's walk does not come back, and nobody is moved any more.
    const still = new Map(s.world.actors.map((a) => [a.id, { x: a.x, z: a.z }]))
    runFor(s, 2)
    for (const a of s.world.actors) expect(Math.hypot(a.x - still.get(a.id)!.x, a.z - still.get(a.id)!.z), a.id).toBeLessThan(0.05)
  })

  it('lets a player go when the child tells it something else, and plays on without it', () => {
    const s = sim()
    give(s, 'alice', 'tag')
    runFor(s, 5)
    expect(actor(s, 'steve').joinedBy).toBe('alice')
    give(s, 'steve', 'wave', {}, 2)
    let waved = false
    runFor(s, 0.2, () => (waved ||= actor(s, 'steve').doing?.action === 'wave'))
    expect(waved).toBe(true)
    expect(actor(s, 'steve').joinedBy).toBeNull()
    runFor(s, 4)
    // Done waving, he stands by himself: the game does not take him back. The others still play.
    const steve = actor(s, 'steve')
    expect(steve.doing).toBeNull()
    const at = { x: steve.x, z: steve.z }
    runFor(s, 5, () => expect(steve.joinedBy).toBeNull())
    expect(Math.hypot(steve.x - at.x, steve.z - at.z)).toBeLessThan(0.05)
    expect(actor(s, 'alice').doing?.action).toBe('tag')
    expect(['mike', 'noora', 'mirri'].every((id) => actor(s, id).joinedBy === 'alice')).toBe(true)
  })

  it('uses the goals a football game stopped midway left standing, and takes them away at the end', () => {
    const s = sim()
    give(s, 'alice', 'football-game', { players: 'steve' })
    runFor(s, 5)
    expect(s.world.items.filter((it) => it.kind === 'goal')).toHaveLength(2)
    s.stop('alice')
    give(s, 'steve', 'football-game', { players: 'alice' }, 2)
    let most = 0
    runFor(s, 52, () => (most = Math.max(most, s.world.items.filter((it) => it.kind === 'goal').length)))
    expect(most).toBe(2)
    expect(s.world.items.filter((it) => it.kind === 'goal')).toEqual([])
  })

  it('takes in the ones the players arg names, in either language, or everyone', () => {
    const joined = (lang: Lang, players: string | null) => {
      const s = sim(lang)
      give(s, 'alice', 'race', players === null ? {} : { players })
      runFor(s, 0.5)
      return s.world.actors.filter((a) => a.joinedBy === 'alice').map((a) => a.id)
    }
    expect(joined('fi', 'Eetu ja Mirri')).toEqual(['steve', 'mirri'])
    expect(joined('fi', 'eetun, mikon')).toEqual(['steve', 'mike'])
    expect(joined('en', 'steve,noora')).toEqual(['steve', 'noora'])
    expect(joined('en', 'Nora')).toEqual(['noora'])
    for (const everyone of [null, '', 'kaikki', 'everyone', 'zebra']) expect(joined('en', everyone), String(everyone)).toEqual(['steve', 'mike', 'noora', 'mirri'])
  })

  it('shrugs at tag or hide and seek with nobody else here', () => {
    for (const game of ['tag', 'hide-and-seek']) {
      const s = new Sim(createWorld({ room: 'forest', actors: makeCast('fi').slice(0, 1), layouts: LAYOUTS, seed: 1, lang: 'fi' }), library)
      give(s, 'alice', game)
      const lines: string[] = []
      let done = false
      for (let f = 0; f < 60 * 4 && !done; f++) {
        s.step()
        const a = s.world.actors[0]!
        if (a.bubble !== null && !lines.includes(a.bubble.text)) lines.push(a.bubble.text)
        done = s.world.events.some((e) => e.type === 'done')
        s.world.events.length = 0
      }
      expect(done, game).toBe(true)
      expect(lines, game).toEqual(['Kuka leikkii?'])
    }
  })
})

describe('the games in the library', () => {
  it('take the others who play as words, and say what they are', () => {
    expect(GAMES.map((g) => g.id)).toEqual(GAME_IDS)
    for (const g of GAMES) {
      expect(g.params, g.id).toEqual([{ name: 'players', kind: 'text', optional: true, about: 'the others who play, ids or names with commas; empty: everyone here' }])
      expect(g.about.length, g.id).toBeGreaterThan(30)
      expect(g.nameFi, g.id).toMatch(/^[a-zäö]+$/)
    }
  })

  it('are found by what a child says, words no thing or basic verb has', () => {
    const verbCalls = new Set(BASIC_VERBS.flatMap((v) => v.calls))
    for (const g of GAMES) {
      expect(new Set(g.calls).size, g.id).toBe(g.calls.length)
      for (const call of g.calls) {
        expect(call, g.id).toBe(call.toLowerCase())
        expect(library.actionFor(call), `${g.id}: ${call}`).toBe(g.id)
        expect(verbCalls.has(call), `${g.id}: ${call}`).toBe(false)
        if (!call.includes(' ')) expect(library.itemKindFor(call), `${g.id}: ${call} is a thing`).toBeNull()
      }
      // The play words alone are the parser's, not a game's.
      for (const word of ['pelataan', 'leikitään', 'pelaa', 'leiki', 'pelatkaa', 'leikkikää', 'play']) expect(g.calls, g.id).not.toContain(word)
    }
    expect(library.actionFor('hippaa')).toBe('tag')
    expect(library.actionFor('piilosta')).toBe('hide-and-seek')
    expect(library.actionFor('junaa')).toBe('train')
    expect(library.actionFor('pelataan jalkapalloa')).toBe('football-game')
    expect(library.itemKindFor('jalkapalloa')).toBe('football')
    // The goal is a thing ('maali'); painting stays painting.
    expect(library.itemKindFor('maaliin')).toBe('goal')
    expect(library.actionFor('maalaa')).toBe('paint')
    expect(library.itemKindFor('maalaa')).toBeNull()
  })
})
