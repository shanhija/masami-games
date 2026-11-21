import { describe, expect, it } from 'vitest'
import { BUILDS, HOME, LOTS, PARTY_AREAS, PLANTS, inArea } from './map'
import { CHAPTER_IDS, MACHINE_KINDS, MACHINE_SPECS } from './model'
import type { ChapterId, Machine, MachineKind, Sim } from './model'
import { botFrame, createBot } from './bot'
import { STORY } from './jobs'
import { footprints, overlapDepth, rectOf } from './overlap'
import type { Rect } from './overlap'
import { createSim, tick } from './sim'
import { ANIMAL_ROOM } from './world'

const DT = 1 / 30
/** Two bodies may lie in each other by a hand's width, and by more than that for a moment: seconds. */
const HAND = 0.3
const MOMENT = 2.5
/** A forklift's middle this close to a pallet it does not carry has the forks nowhere near it. */
const IN_PALLET = 1.0

const start = (storyDone: number, seed: number) => createSim({ storyDone, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed, lastTemplate: -1 })
const inShow = (chapter: ChapterId, p: { x: number; z: number }) => PARTY_AREAS[chapter].some((a) => inArea(a, p))
const lotRect = (lot: number): Rect => ({ x: LOTS[lot].x, z: LOTS[lot].z, yaw: 0, hl: LOTS[lot].d / 2, hw: LOTS[lot].w / 2 })
/** The lots the generated houses are built on. */
const GENERATED_LOTS = BUILDS.slice(4).map((b) => b.lot)

/** The longest stretch each thing lay in another by more than a hand's width, and where in the game it was. */
interface Longest {
  seconds: number
  at: string
}

/** Watches a game tick by tick for bodies in each other, machines in plants and houses, forklifts in pallets and animals in machines. */
class Watch {
  private open = new Map<string, { from: number; last: number }>()
  longest = new Map<string, Longest>()
  parties: { chapter: ChapterId; inside: MachineKind[]; headingOut: boolean; after: MachineKind[] }[] = []

  private note(s: Sim, key: string, on: boolean): void {
    const open = this.open.get(key)
    if (on) {
      if (open === undefined) this.open.set(key, { from: s.time, last: s.time })
      else open.last = s.time
    } else if (open !== undefined) {
      this.open.delete(key)
      const seconds = open.last - open.from + DT
      const best = this.longest.get(key)
      if (best === undefined || seconds > best.seconds) this.longest.set(key, { seconds, at: `${open.from.toFixed(0)} s, ${s.job === null ? 'between jobs' : s.job.job.id}` })
    }
  }

  frame(s: Sim): void {
    const machines = Object.values(s.machines).filter((m) => m.unlocked)
    const rects = machines.map((m): [Machine, Rect] => [m, rectOf(m)])
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) this.note(s, `${rects[i][0].kind} in ${rects[j][0].kind}`, overlapDepth(rects[i][1], rects[j][1]) > HAND)
    }
    const things = footprints(s)
    for (const [m, r] of rects) {
      for (const f of things) this.note(s, `${m.kind} in ${f.name}`, overlapDepth(r, f.rect) > HAND)
      for (const lot of GENERATED_LOTS) if (s.moreDone > 0 || s.storyDone >= STORY.length) this.note(s, `${m.kind} in lot ${lot}`, overlapDepth(r, lotRect(lot)) > HAND)
    }
    const fork = s.machines.forklift
    for (const t of s.things) this.note(s, `the forklift in a ${t.kind} (thing ${t.id})`, fork.unlocked && !t.gone && t.heldBy === null && Math.hypot(t.x - fork.x, t.z - fork.z) < IN_PALLET)
    for (const a of s.animals) {
      const on = a.mood !== 'wave' && a.mood !== 'slide' && a.mood !== 'swim'
      const crowded = machines.some((m) => MACHINE_SPECS[m.kind].body.some(([lz, r]) => Math.hypot(a.x - (m.x + Math.sin(m.yaw) * lz), a.z - (m.z + Math.cos(m.yaw) * lz)) < r + ANIMAL_ROOM - 0.05))
      this.note(s, `animal ${a.id} (${a.species}) in a machine`, on && crowded)
    }
    // The party's machines are sent out when the chapter's last job ends; the party begins when they are gone.
    if (s.partyWait !== null && s.partyWait.t === 0) {
      const chapter = s.partyWait.chapter
      this.parties.push({ chapter, inside: machines.filter((m) => inShow(chapter, m)).map((m) => m.kind), headingOut: machines.filter((m) => inShow(chapter, m)).every((m) => m.goal !== null && !inShow(chapter, m.goal)), after: [] })
    }
    if (s.party !== null && s.party.t === 0) {
      const chapter = s.party.chapter
      this.parties.find((q) => q.chapter === chapter)!.after = machines.filter((m) => inShow(chapter, m)).map((m) => m.kind)
    }
  }
}

function playWatched(s: Sim, jobs: number): Watch {
  const bot = createBot()
  const watch = new Watch()
  const goal = s.storyDone + s.moreDone + jobs
  while (s.storyDone + s.moreDone < goal || s.partyWait !== null) {
    botFrame(bot, s, DT)
    tick(s, DT)
    s.events.length = 0
    watch.frame(s)
    if (s.job !== null && s.time - s.job.startedAt > 1500) throw new Error(`stuck in ${s.job.job.id} step ${s.job.step}`)
  }
  return watch
}

/** The things that lay in another for more than a moment, whose name matches `what`: each as a line saying how long and when. */
const tooLong = (w: Watch, what: RegExp) => [...w.longest].filter(([key, l]) => what.test(key) && l.seconds > MOMENT).map(([key, l]) => `${key}: ${l.seconds.toFixed(1)} s from ${l.at}`)

let whole: Watch | null = null
const wholeStory = () => (whole ??= playWatched(start(0, 5000), STORY.length + 30))
let later: Watch | null = null
const generated = () => (later ??= playWatched(start(STORY.length, 777), 40))

describe('machines in each other, in the town, and the animals round them', () => {
  const MACHINE = /^(digger|dumper|dozer|roller|mixer|forklift|tower|semi|mobile) in (digger|dumper|dozer|roller|mixer|forklift|tower|semi|mobile)$/
  const TOWN = /^\w+ in (\w+ body|\w+ legs|(house|hall|playground) \d+)$/
  const LOT = /^\w+ in lot \d$/
  const FORK = /^the forklift in /
  const ANIMAL = /^animal /

  it('never have two machine bodies in each other by more than a hand for more than a moment, over the story and 30 generated jobs', () => {
    expect(tooLong(wholeStory(), MACHINE)).toEqual([])
    expect(tooLong(generated(), MACHINE)).toEqual([])
  }, 300000)

  it('never leaves a machine in a plant\'s body or legs, or in a house with a piece in it', () => {
    expect(tooLong(wholeStory(), TOWN)).toEqual([])
    expect(tooLong(generated(), TOWN)).toEqual([])
  }, 300000)

  it('keeps the forklift out of the pallets it does not carry', () => {
    expect(tooLong(wholeStory(), FORK)).toEqual([])
    expect(tooLong(generated(), FORK)).toEqual([])
  }, 300000)

  it('keeps the generated houses\' lots clear of machines, over 40 generated jobs on another seed and over the first 30', () => {
    expect(tooLong(wholeStory(), LOT)).toEqual([])
    expect(tooLong(generated(), LOT)).toEqual([])
  }, 300000)

  it('keeps animals a body\'s width from every machine', () => {
    expect(tooLong(wholeStory(), ANIMAL)).toEqual([])
    expect(tooLong(generated(), ANIMAL)).toEqual([])
  }, 300000)

  it('sends the machines standing where a party\'s show plays out of it when the chapter\'s last job ends, and none is in it when the party begins', () => {
    const w = wholeStory()
    expect(w.parties.map((p) => p.chapter)).toEqual([...CHAPTER_IDS])
    for (const p of w.parties) {
      expect(p.headingOut, `${p.chapter} party start: ${p.inside.join(', ')} in the show`).toBe(true)
      expect(p.after, `${p.chapter} party start`).toEqual([])
    }
  }, 300000)
})

/** A story job is played to its end with the bot, with a machine put somewhere first. */
function partyWith(storyDone: number, put: (s: Sim) => void): { s: Sim; watch: Watch } {
  const s = start(storyDone, 5000)
  put(s)
  return { s, watch: playWatched(s, 1) }
}

describe('a party starts with a machine in its show', () => {
  it('drives the roller and a dozer parked on the road out of the ice cream van\'s way', () => {
    const { watch } = partyWith(2, (s) => {
      s.machines.dozer.x = 4
      s.machines.dozer.z = 30
    })
    expect(watch.parties[0].chapter).toBe('road')
    expect(watch.parties[0].inside).toContain('dozer')
    expect(watch.parties[0].headingOut).toBe(true)
    expect(watch.parties[0].after).toEqual([])
  })

  it('drives a dozer left by the pond out of the playground\'s party', () => {
    const { watch } = partyWith(15, (s) => {
      s.machines.dozer.x = -24
      s.machines.dozer.z = 44
    })
    expect(watch.parties[0].chapter).toBe('play')
    expect(watch.parties[0].inside).toContain('dozer')
    expect(watch.parties[0].headingOut).toBe(true)
    expect(watch.parties[0].after).toEqual([])
  })
})

describe('where the machines wait', () => {
  it('has no machine home or park spot in a show\'s area', () => {
    for (const k of MACHINE_KINDS) for (const c of CHAPTER_IDS) expect(inShow(c, HOME[k]), `${k} home in the ${c} show`).toBe(false)
  })

  it('has no machine home or plant feed spot within a metre of a generated house\'s lot, or of a plant\'s legs', () => {
    const spots = [...MACHINE_KINDS.map((k): [string, { x: number; z: number; yaw: number }] => [`${k} home`, HOME[k]]), ...(['press', 'crusher'] as const).map((id): [string, { x: number; z: number; yaw: number }] => [`${id} feed spot`, PLANTS[id].feedSpot])]
    for (const [what, spot] of spots) {
      const body = (kind: MachineKind): Rect => ({ x: spot.x, z: spot.z, yaw: spot.yaw, hl: MACHINE_SPECS[kind].length / 2 + 1, hw: MACHINE_SPECS[kind].width / 2 + 1 })
      const kind: MachineKind = what.endsWith('feed spot') ? 'dumper' : (what.split(' ')[0] as MachineKind)
      for (const lot of GENERATED_LOTS) expect(overlapDepth(body(kind), lotRect(lot)), `${what} by lot ${lot}`).toBe(0)
      for (const id of ['press', 'crusher', 'saw'] as const) {
        const p = PLANTS[id]
        expect(overlapDepth({ ...body(kind), hl: MACHINE_SPECS[kind].length / 2, hw: MACHINE_SPECS[kind].width / 2 }, { x: p.hopperX, z: p.hopperZ, yaw: 0, hl: 1.1, hw: 1.1 }), `${what} in the ${id}'s legs`).toBe(0)
      }
    }
  })
})
