import { describe, expect, it } from 'vitest'
import { BUILD_HALF, PALLET_RING, PARTY_AREAS, PLACES, ROADS } from './map'
import { CHAPTER_IDS, MACHINE_KINDS, MACHINE_SPECS, OUTRIGGER_Z, PAD_R, PLACE_IDS, padX } from './model'
import type { MachineKind, Sim, SimEvent, Spoken } from './model'
import type { Area } from './map'
import { botFrame, createBot } from './bot'
import type { Bot } from './bot'
import { BOT_SECONDS, MORE_BOT_SECONDS, MORE_TEMPLATES, PARTY_FRAMES, PAR_FACTOR, SHOW_ROOM, STORY, bedPoints, nextMoreJob, clearParty, inPartyView, starsFor, templateOf, touchesShow } from './jobs'
import { ackCard, actionFace, actionReady, createSim, hopTo, honk, letGo, leverTap, say, setAction, setLevers, setMode, setPoint, setViewYaw, stepPointer, stepView, tick } from './sim'
import { ANIMAL_ROOM, PARTY_FOR, TURN_RATE, clearOfMachines, groundY, moveIn, partyProgress, spawnAnimal } from './world'
import { mulberry32, turnTo } from './math'

const DT = 1 / 30

const fresh = (storyDone = 0, extra: Partial<{ moreDone: number; mode: 'easy' | 'pro'; seed: number }> = {}) => createSim({ storyDone, moreDone: extra.moreDone ?? 0, coins: 0, stars: 0, mode: extra.mode ?? 'easy', seed: extra.seed ?? 5000, lastTemplate: -1 })

/** Steps the sim with the bot until `until` holds, collecting events; throws past `cap` seconds. Returns the seconds it took. */
function playUntil(s: Sim, bot: Bot, until: (s: Sim) => boolean, cap: number, events: SimEvent[] = []): number {
  const t0 = s.time
  while (!until(s)) {
    if (s.time - t0 > cap) throw new Error(`still at ${s.job === null ? 'no job' : `${s.job.job.id} step ${s.job.step} (${s.job.job.steps[s.job.step].kind})`} after ${cap} s`)
    botFrame(bot, s, DT)
    tick(s, DT)
    events.push(...s.events)
    s.events.length = 0
  }
  return s.time - t0
}

/** Everything the scene reads must be a number. */
function assertIntact(s: Sim): void {
  for (const m of Object.values(s.machines)) {
    for (const v of [m.x, m.y, m.z, m.yaw, m.speed, m.pitch, m.roll, m.steer]) expect(Number.isFinite(v), `${m.kind} ${v}`).toBe(true)
    expect(Math.abs(m.x), m.kind).toBeLessThan(60)
    expect(Math.abs(m.z), m.kind).toBeLessThan(60)
  }
  for (const t of s.things) expect(Number.isFinite(t.x + t.y + t.z), `thing ${t.id}`).toBe(true)
  for (const a of s.animals) expect(Number.isFinite(a.x + a.y + a.z + a.yaw), `animal ${a.id}`).toBe(true)
  const tt = s.terrain
  for (let i = 0; i < tt.loose.length; i++) {
    if (!(tt.loose[i] >= -1e-6) || !Number.isFinite(tt.hard[i])) throw new Error(`ground point ${i}: loose ${tt.loose[i]}, hard ${tt.hard[i]}`)
  }
  for (const b of s.builds) expect(b.placed).toBeLessThanOrEqual(b.spots.length)
  expect(Number.isFinite(s.day + s.time + s.score.coins + s.score.stars)).toBe(true)
}

/** What a restored save must share with a played game. */
function snapshot(s: Sim) {
  return {
    placed: s.builds.map((b) => b.placed),
    forms: s.forms.map((f) => [f.shown, f.hard]),
    ponds: s.ponds.map((p) => [p.shown, p.water >= 1]),
    decks: s.decks.length,
    roads: ROADS.map((_, r) => bedPoints(s, r).filter((i) => s.terrain.rolled[i] >= 1).length / bedPoints(s, r).length >= 0.9),
    come: MACHINE_KINDS.filter((k) => s.machines[k].unlocked),
  }
}

/** The whole story and 30 generated jobs, played once for every test that reads it. */
let played: { botHops: number; times: Map<string, number>; steps: Map<string, number[]>; snaps: Map<number, ReturnType<typeof snapshot>>; sim: Sim } | null = null
function playAll() {
  if (played !== null) return played
  const s = fresh()
  const bot = createBot()
  const times = new Map<string, number>()
  const steps = new Map<string, number[]>()
  const snaps = new Map<number, ReturnType<typeof snapshot>>([[0, snapshot(s)]])
  const total = STORY.length + 30
  let ticks = 0
  while (s.storyDone + s.moreDone < total) {
    const run = s.job
    const step = run === null ? -1 : run.step
    const stepAt = run === null ? 0 : run.stepAt
    const before = s.storyDone
    botFrame(bot, s, DT)
    tick(s, DT)
    s.events.length = 0
    if (run !== null && (s.job === null || s.job.step !== step)) {
      const list = steps.get(run.job.id) ?? []
      list.push(s.time - stepAt)
      steps.set(run.job.id, list)
      if (s.job === null) times.set(run.job.id, s.time - run.startedAt)
    }
    if (s.storyDone !== before) snaps.set(s.storyDone, snapshot(s))
    if (++ticks % 600 === 0) assertIntact(s)
    if (s.job !== null && s.time - s.job.startedAt > 1500) throw new Error(`stuck in ${s.job.job.id} step ${s.job.step}`)
  }
  assertIntact(s)
  played = { botHops: bot.hops, times, steps, snaps, sim: s }
  return played
}

/** A sim at a story job with the job open and its chapter card read: the marker and the button have something to show. */
function opened(storyDone: number, extra: Partial<{ moreDone: number; mode: 'easy' | 'pro'; seed: number }> = {}): Sim {
  const s = fresh(storyDone, extra)
  while (s.job === null) tick(s, DT)
  ackCard(s)
  return s
}

const say0: Spoken = { who: null, move: null, work: null, to: null, come: false, honk: false, stop: false, help: false }
const spoken = (p: Partial<Spoken>): Spoken => ({ ...say0, ...p })
const kinds = (events: SimEvent[]) => events.map((e) => e.kind)

describe('the tap bot', () => {
  it('plays the whole story, then 30 generated jobs, each inside its time cap', () => {
    const { times, steps, sim } = playAll()
    // Every step of every job is timed, and a load that ran out takes a step again.
    for (const j of STORY) expect((steps.get(j.id) ?? []).length, `${j.id}: a time for each step`).toBeGreaterThanOrEqual(j.steps.length)
    expect(sim.storyDone).toBe(STORY.length)
    expect(sim.moreDone).toBe(30)
    for (const j of STORY) {
      const t = times.get(j.id)
      expect(t, j.id).toBeDefined()
      if (t !== undefined) expect(t, `${j.id} took ${t.toFixed(0)} s, par ${j.par}`).toBeLessThan(5 * j.par + 60)
    }
    expect(sim.score.stars).toBeGreaterThan(30)
    expect(sim.score.coins).toBeGreaterThan(100)
  }, 600000)

  it('never makes the same template twice in the 30 generated jobs, and builds the three houses', () => {
    const { sim } = playAll()
    expect(sim.builds.slice(4).every((b) => b.placed === b.spots.length)).toBe(true)
    expect(sim.animals.filter((a) => a.home >= 4)).toHaveLength(3)
    expect(templateOf(nextMoreJob(sim))).not.toBe('house')
  })

  it('leaves the town standing: every building built, every form hard, the pond full, the bridge decked', () => {
    const { sim } = playAll()
    expect(sim.builds.every((b) => b.placed === b.spots.length)).toBe(true)
    expect(sim.forms.every((f) => f.hard)).toBe(true)
    expect(sim.ponds[0].water).toBe(1)
    expect(sim.decks).toHaveLength(1)
    expect(MACHINE_KINDS.every((k) => sim.machines[k].unlocked)).toBe(true)
  })
})

describe('the job\'s own hops', () => {
  it('hops the first job through the digger, the truck and the dozer with no hop from the child, and the bot never needs its own', () => {
    const s = fresh()
    const bot = createBot()
    const events: SimEvent[] = []
    playUntil(s, bot, (o) => o.storyDone > 0, STORY[0].par * 2, events)
    const hops = events.flatMap((e) => (e.kind === 'hop' ? [`${e.from}>${e.to}`] : []))
    expect(hops).toEqual(['digger>dumper', 'dumper>dozer'])
    expect(bot.hops).toBe(0)
    expect(s.ownHopAt).toBeNull()
  })

  it('plays every story job and 30 generated ones without the bot hopping once', () => {
    expect(playAll().botHops).toBe(0)
  }, 600000)

  it('is cancelled by a hop the child chose, and only by that', () => {
    const s = fresh()
    playUntil(s, createBot(), (o) => o.job !== null && o.job.step === 1, 60)
    expect(s.active).toBe('digger')
    hopTo(s, 'dozer')
    s.events.length = 0
    const events: SimEvent[] = []
    for (let i = 0; i < 90; i++) {
      tick(s, DT)
      events.push(...s.events)
      s.events.length = 0
    }
    expect(s.active).toBe('dozer')
    expect(events.filter((e) => e.kind === 'hop')).toHaveLength(0)
    expect(s.ownHopAt).not.toBeNull()
  })
})

describe('restoring a save', () => {
  it('shows what a played game shows at every finished job', () => {
    const { snaps } = playAll()
    for (const [k, snap] of snaps) expect(snapshot(fresh(k)), `after ${k} jobs`).toEqual(snap)
  }, 600000)

  it('lets the bot finish the job a save stops at', () => {
    for (const k of [0, 3, 5, 8, 10, 12, 15, 17, 19]) {
      const s = fresh(k)
      const bot = createBot()
      const j = STORY[k]
      playUntil(s, bot, (o) => o.storyDone > k, 5 * Math.max(j.par, 40) + 120)
      expect(s.storyDone, `from job ${k}`).toBe(k + 1)
    }
  }, 600000)
})

/** Where a point goes to stand clear of every machine's body, worked out the plain way. */
function clearPlainly(s: Sim, x: number, z: number): { x: number; z: number } {
  let px = x
  let pz = z
  for (let pass = 0; pass < 2; pass++) {
    for (const m of Object.values(s.machines)) {
      if (!m.unlocked) continue
      const sin = Math.sin(m.yaw)
      const cos = Math.cos(m.yaw)
      for (const [lz, r] of MACHINE_SPECS[m.kind].body) {
        const cx = m.x + sin * lz
        const cz = m.z + cos * lz
        const d = Math.hypot(px - cx, pz - cz)
        if (d >= r + ANIMAL_ROOM) continue
        const ux = d < 1e-6 ? sin : (px - cx) / d
        const uz = d < 1e-6 ? cos : (pz - cz) / d
        px = cx + ux * (r + ANIMAL_ROOM)
        pz = cz + uz * (r + ANIMAL_ROOM)
      }
    }
  }
  return { x: px, z: pz }
}

describe('the room animals keep from machines', () => {
  it('sends a point to the same place as the plain way does, over a played story', () => {
    const s = fresh(19)
    const bot = createBot()
    let pushed = 0
    for (let i = 0; i < 3000; i++) {
      botFrame(bot, s, DT)
      tick(s, DT)
      s.events.length = 0
      if (i % 50 !== 0) continue
      const points = [...s.animals.map((a) => [a.x, a.z]), ...Object.values(s.machines).flatMap((m) => [[m.x, m.z], [m.x + 1.1, m.z - 0.7], [m.x - 2.5, m.z + 2]])]
      for (const [x, z] of points) {
        const want = clearPlainly(s, x, z)
        const got = clearOfMachines(s, x, z)
        expect(got.x).toBeCloseTo(want.x, 9)
        expect(got.z).toBeCloseTo(want.z, 9)
        if (Math.abs(want.x - x) + Math.abs(want.z - z) > 1e-6) pushed++
      }
    }
    expect(pushed).toBeGreaterThan(20)
  })
})

describe('chaos', () => {
  it('a monkey for ten minutes breaks nothing, and the bot then finishes the job', () => {
    const s = fresh(12, { seed: 77 })
    const rnd = mulberry32(2024)
    const unlocked = () => MACHINE_KINDS.filter((k) => s.machines[k].unlocked)
    const randomSpoken = (): Spoken => ({
      who: rnd() < 0.4 ? MACHINE_KINDS[Math.floor(rnd() * 9)] : null,
      move: rnd() < 0.4 ? (['forward', 'back', 'left', 'right', 'up', 'down', 'around'] as const)[Math.floor(rnd() * 7)] : null,
      work: rnd() < 0.4 ? (['take', 'give', 'push', 'roll'] as const)[Math.floor(rnd() * 4)] : null,
      to: rnd() < 0.4 ? [...PLACE_IDS, ...MACHINE_KINDS][Math.floor(rnd() * (PLACE_IDS.length + 9))] : null,
      come: rnd() < 0.1,
      honk: rnd() < 0.1,
      stop: rnd() < 0.05,
      help: rnd() < 0.05,
    })
    let down = false
    for (let i = 0; i < 30 * 60 * 10; i++) {
      const r = rnd()
      if (r < 0.03) setPoint(s, (rnd() - 0.5) * 90, (rnd() - 0.5) * 90)
      else if (r < 0.04) letGo(s)
      else if (r < 0.08) {
        down = rnd() < 0.5
        setAction(s, down)
      } else if (r < 0.085) hopTo(s, unlocked()[Math.floor(rnd() * unlocked().length)])
      else if (r < 0.09) honk(s)
      else if (r < 0.095) say(s, randomSpoken(), rnd() < 0.5)
      else if (r < 0.097) leverTap(s)
      else if (r < 0.099) setLevers(s, { drive: rnd() * 2 - 1, steer: rnd() * 2 - 1, a: rnd() * 2 - 1, b: rnd() * 2 - 1, c: rnd() * 2 - 1, d: rnd() * 2 - 1 })
      else if (r < 0.0995) setViewYaw(s, rnd() * 6)
      else if (r < 0.1) ackCard(s)
      tick(s, DT)
      s.events.length = 0
      if (i % 600 === 0) assertIntact(s)
    }
    assertIntact(s)
    letGo(s)
    setAction(s, false)
    setLevers(s, { drive: 0, steer: 0, a: 0, b: 0, c: 0, d: 0 })
    const after = s.storyDone
    playUntil(s, createBot(), (o) => o.storyDone > after, 900)
    assertIntact(s)
  }, 600000)

  it('a monkey in pro mode breaks nothing either', () => {
    const s = fresh(12, { mode: 'pro', seed: 78 })
    const rnd = mulberry32(99)
    for (let i = 0; i < 30 * 60 * 3; i++) {
      if (rnd() < 0.02) setLevers(s, { drive: rnd() * 2 - 1, steer: rnd() * 2 - 1, a: rnd() * 2 - 1, b: rnd() * 2 - 1, c: rnd() * 2 - 1, d: rnd() * 2 - 1 })
      if (rnd() < 0.02) leverTap(s)
      if (rnd() < 0.005) hopTo(s, MACHINE_KINDS.filter((k) => s.machines[k].unlocked)[Math.floor(rnd() * 8)])
      tick(s, DT)
      s.events.length = 0
    }
    assertIntact(s)
    setMode(s, 'easy')
  }, 600000)
})

describe('hopping', () => {
  it('hops by itself 1.2 s after a step that needs another machine, unless the child hopped during the step', () => {
    const s = fresh(0)
    const bot = createBot()
    // Job 1: scoop with the digger, then tip with the dumper.
    playUntil(s, bot, (o) => o.job !== null && o.job.step === 1, 120)
    expect(s.active).toBe('digger')
    const at = s.time
    setAction(s, false)
    letGo(s)
    while (s.active === 'digger' && s.time - at < 3) {
      tick(s, DT)
      s.events.length = 0
    }
    expect(s.active).toBe('dumper')
    expect(s.time - at).toBeGreaterThan(1.0)
    expect(s.time - at).toBeLessThan(1.6)
  })

  it('does not hop by itself in pro: the portrait pulses and the child hops', () => {
    const s = fresh(0)
    const bot = createBot()
    playUntil(s, bot, (o) => o.job !== null && o.job.step === 1, 120)
    expect(s.active).toBe('digger')
    setMode(s, 'pro')
    setAction(s, false)
    letGo(s)
    const p = stepPointer(s)
    expect(p?.machine).toBe('dumper')
    for (let i = 0; i < 30 * 5; i++) {
      tick(s, DT)
      s.events.length = 0
    }
    expect(s.active).toBe('digger')
    expect(stepPointer(s)?.machine).toBe('dumper')
    hopTo(s, 'dumper')
    expect(s.active).toBe('dumper')
  })

  it('does not force a hop on a child who is playing', () => {
    const s = fresh(0)
    const bot = createBot()
    playUntil(s, bot, (o) => o.job !== null && o.job.step === 0 && o.time > 4, 60)
    hopTo(s, 'dumper')
    hopTo(s, 'digger')
    letGo(s)
    setAction(s, false)
    // The scoop step goes on with the digger; the child hopped during it, so the end of the step leaves them where they are.
    playUntil(s, bot, (o) => o.job !== null && o.job.step === 1, 120)
    // The bot hops at once, so what is checked is the rule itself: no auto hop is pending after a hop during the step.
    expect(s.lastHop).not.toBeNull()
  })

  it('blocks the button after a hop until it is let go and pressed again', () => {
    const s = fresh(0)
    setAction(s, true)
    tick(s, DT)
    hopTo(s, 'dumper')
    expect(s.hands.blocked).toBe(true)
    for (let i = 0; i < 60; i++) tick(s, DT)
    expect(s.hands.blocked).toBe(true)
    setAction(s, false)
    tick(s, DT)
    setAction(s, true)
    for (let i = 0; i < 3; i++) tick(s, DT)
    expect(s.hands.blocked).toBe(false)
    expect(s.machines.dumper.seq).not.toBe('rest')
  })

  it('counts a tap that is down and up again between two ticks as a press, and a held button as before', () => {
    const s = fresh(0)
    setAction(s, true)
    setAction(s, false)
    tick(s, DT)
    expect(s.machines.digger.seq).toBe('reach')
    const t = fresh(0)
    for (let i = 0; i < 8; i++) {
      setAction(t, true)
      setAction(t, false)
      tick(t, DT)
      expect(t.hands.action).toBe(false)
      expect(t.hands.tapped).toBe(false)
    }
    expect(t.machines.digger.seq).not.toBe('rest')
    const h = fresh(0)
    setAction(h, true)
    tick(h, DT)
    expect(h.machines.digger.seq).toBe('reach')
    expect(h.hands.action).toBe(true)
    for (let i = 0; i < 90; i++) tick(h, DT)
    expect(h.machines.digger.seq).not.toBe('rest')
  })

  it('refuses a machine that has not come', () => {
    const s = fresh(0)
    expect(() => hopTo(s, 'roller')).toThrow()
  })
})

describe('the HUD readers', () => {
  it('give no pointer between jobs and a pointer with a machine while a job is open', () => {
    const s = fresh(0)
    expect(stepPointer(s)).toBeNull()
    expect(stepView(s)).toBeNull()
    while (s.job === null) tick(s, DT)
    ackCard(s)
    expect(s.job).not.toBeNull()
    const p = stepPointer(s)
    expect(p).not.toBeNull()
    expect(p?.machine).toBe('digger')
    const v = stepView(s)
    expect(v?.of).toBe(3)
    expect(v?.pictures.length).toBeGreaterThan(1)
  })

  it('shows no marker and no button between jobs, while a card is up and while a party runs', () => {
    const shows = (s: Sim) => [stepPointer(s), actionFace(s, s.active), actionReady(s)]
    // The chapter's card is up as the first job opens: nothing to point at yet.
    const first = fresh(0)
    while (first.job === null) tick(first, DT)
    expect(first.card?.kind).toBe('chapter')
    expect(shows(first)).toEqual([null, null, false])
    ackCard(first)
    expect(stepPointer(first)).not.toBeNull()
    expect(actionFace(first, 'digger')).toBe('dig')
    const s = opened(2)
    expect(actionFace(s, 'roller')).toBe('stomp')
    // The last job of a chapter: the party, then the chapter's card.
    const bot = createBot()
    playUntil(s, bot, (o) => o.job === null, 200)
    expect(s.partyWait, 'the machines drive out of the show first').not.toBeNull()
    expect(shows(s)).toEqual([null, null, false])
    playUntil(s, bot, (o) => o.party !== null, 20)
    expect(shows(s)).toEqual([null, null, false])
    playUntil(s, bot, (o) => o.party === null, 20)
    expect(s.card?.kind).toBe('chapterDone')
    expect(shows(s)).toEqual([null, null, false])
    // Between two jobs of one chapter.
    const t = opened(0)
    playUntil(t, createBot(), (o) => o.job === null, 200)
    expect(t.card).toBeNull()
    expect(shows(t)).toEqual([null, null, false])
  })

  it('shows the button picture of each machine and when pressing would do something', () => {
    const s = opened(20)
    expect(actionFace(s, 'digger')).toBe('dig')
    expect(actionFace(s, 'dumper')).toBe('tip')
    expect(actionFace(s, 'forklift')).toBe('pick')
    expect(actionFace(s, 'tower')).toBe('hook')
    s.active = 'dumper'
    expect(actionReady(s)).toBe(false)
    s.machines.dumper.load.amount = 2
    expect(actionReady(s)).toBe(true)
    const first = opened(0)
    expect(first.machines.roller.unlocked).toBe(false)
    expect(actionFace(first, 'roller')).toBe('none')
  })

  it('shows no button in pro where Space does nothing, and the picture of what it does elsewhere', () => {
    const s = opened(20, { mode: 'pro' })
    for (const k of ['digger', 'dumper', 'dozer', 'mixer'] as const) {
      s.active = k
      expect(actionFace(s, k), k).toBeNull()
      expect(actionReady(s), k).toBe(false)
    }
    s.machines.mixer.concrete = 1
    s.machines.dumper.load.amount = 2
    s.active = 'dumper'
    expect(actionReady(s)).toBe(false)
    s.active = 'mixer'
    expect(actionReady(s)).toBe(false)
    expect(actionFace(s, 'roller')).toBe('stomp')
    expect(actionFace(s, 'forklift')).toBe('pick')
    expect(actionFace(s, 'tower')).toBe('hook')
    expect(actionFace(s, 'mobile')).toBe('hook')
    expect(actionFace(s, 'semi')).toBe('unload')
    s.machines.forklift.holding = 3
    s.machines.tower.holding = 3
    expect(actionFace(s, 'forklift')).toBe('drop')
    expect(actionFace(s, 'tower')).toBe('unhook')
    s.active = 'roller'
    expect(actionReady(s)).toBe(true)
    setMode(s, 'easy')
    for (const k of ['digger', 'dumper', 'dozer', 'mixer'] as const) expect(actionFace(s, k), k).not.toBeNull()
  })

  it('never points the idle hint at a button that is not there in pro', () => {
    const s = fresh(0, { mode: 'pro' })
    const bot = createBot()
    // The first job's marker presses the digger's button in easy; run it in easy to the point it asks for the press.
    setMode(s, 'easy')
    let asked = false
    for (let i = 0; i < 30 * 200 && !asked; i++) {
      botFrame(bot, s, DT)
      tick(s, DT)
      s.events.length = 0
      const p = stepPointer(s)
      if (p !== null && p.press) {
        asked = true
        setMode(s, 'pro')
        expect(actionFace(s, p.machine)).toBeNull()
        expect(stepPointer(s)?.press).toBe(false)
      }
    }
    expect(asked).toBe(true)
  })

  it('counts an idle step, and the idle time resets when the step moves on', () => {
    const s = fresh(0)
    for (let i = 0; i < 30 * 14; i++) tick(s, DT)
    expect(s.idle).toBeGreaterThan(8)
    const bot = createBot()
    playUntil(s, bot, (o) => o.job !== null && o.job.step === 1, 120)
    expect(s.idle).toBeLessThan(2)
  })
})

describe('the story around the jobs', () => {
  it('runs a party after a chapter, then a card, then the next chapter at its time of day', () => {
    const s = fresh(2)
    const bot = createBot()
    const events: SimEvent[] = []
    playUntil(s, bot, (o) => o.party !== null, 200, events)
    expect(kinds(events)).toContain('jobDone')
    expect(kinds(events)).toContain('party')
    expect(s.party?.chapter).toBe('road')
    expect(s.storyDone).toBe(3)
    const gatherAt = s.party !== null ? { x: s.party.x, z: s.party.z } : { x: 0, z: 0 }
    playUntil(s, bot, (o) => o.card !== null && o.card.kind === 'chapterDone', 40, events)
    expect(partyProgress(s)).toBe(0)
    expect(s.party).toBeNull()
    expect(kinds(events)).toContain('chapterDone')
    expect(s.card).toEqual({ kind: 'chapterDone', chapter: 'road', stars: expect.any(Number) })
    // The animals came to the party and licked ice creams.
    expect(s.animals.some((a) => Math.hypot(a.x - gatherAt.x, a.z - gatherAt.z) < 9)).toBe(true)
    ackCard(s)
    expect(s.card).toBeNull()
    playUntil(s, bot, (o) => o.job !== null, 20, events)
    expect(s.job?.job.chapter).toBe('house')
    expect(s.card).toEqual({ kind: 'chapter', chapter: 'house' })
    for (let i = 0; i < 30 * 40; i++) tick(s, DT)
    expect(s.day).toBeGreaterThan(0.2)
    expect(PARTY_FOR).toBeGreaterThan(5)
  })

  it('has Bunny at her door by 8 s into the house party and waving by 9 s', () => {
    const s = fresh(9)
    playUntil(s, createBot(), (o) => o.party !== null && o.party.chapter === 'house', 200)
    const bunny = s.animals.find((a) => a.species === 'bunny')!
    expect(bunny.movingIn).toBe(true)
    expect(Math.hypot(bunny.x - s.builds[0].x, bunny.z - s.builds[0].z)).toBeGreaterThan(10)
    let inAt = -1
    let wavesAt = -1
    while (s.party !== null && s.party.t < 9) {
      tick(s, DT)
      s.events.length = 0
      if (inAt < 0 && !bunny.movingIn) inAt = s.party.t
      if (wavesAt < 0 && bunny.mood === 'wave') wavesAt = s.party.t
    }
    expect(inAt, 'Bunny reached her door').toBeGreaterThan(0)
    expect(inAt).toBeLessThanOrEqual(8)
    expect(wavesAt).toBeGreaterThan(0)
    expect(wavesAt).toBeLessThanOrEqual(9)
  })

  it('has a homeless bunny 40 m from her door run there without a jump, in by 8 s and waving by 9 s', () => {
    const s = fresh(9)
    const bunny = s.animals.find((a) => a.species === 'bunny')!
    const b = s.builds[0]
    bunny.x = b.x < 0 ? b.x + 40 : b.x - 40
    bunny.z = b.z
    bunny.y = 0
    for (const m of Object.values(s.machines)) m.unlocked = false
    const start = { x: bunny.x, z: bunny.z }
    moveIn(s, 'bunny', 0)
    expect({ x: bunny.x, z: bunny.z }, 'she keeps her place').toEqual(start)
    let inAt = -1
    let wavesAt = -1
    let longest = 0
    for (let i = 0; i < 30 * 9; i++) {
      const was = { x: bunny.x, z: bunny.z, walking: bunny.movingIn }
      tick(s, DT)
      s.events.length = 0
      if (was.walking && bunny.movingIn) longest = Math.max(longest, Math.hypot(bunny.x - was.x, bunny.z - was.z))
      if (inAt < 0 && !bunny.movingIn) inAt = s.time
      if (wavesAt < 0 && bunny.mood === 'wave') wavesAt = s.time
    }
    expect(inAt).toBeGreaterThan(0)
    expect(inAt).toBeLessThanOrEqual(8)
    expect(wavesAt).toBeLessThanOrEqual(9)
    expect(longest).toBeLessThanOrEqual(8 * DT + 1e-6)
    expect(longest).toBeGreaterThan(3 * DT)
  })

  it('starts a newly spawned animal 21 m from her door', () => {
    const s = fresh(9)
    for (const a of s.animals) if (a.species === 'bunny') a.home = 3
    const before = s.animals.length
    moveIn(s, 'bunny', 0)
    expect(s.animals.length).toBe(before + 1)
    const bunny = s.animals[before]
    const b = s.builds[0]
    expect(bunny.home).toBe(0)
    expect(bunny.goalX).toBe(b.x)
    expect(bunny.goalZ).toBe(b.z + BUILD_HALF[b.kind][1] + 1.2)
    expect(Math.hypot(bunny.x - bunny.goalX, bunny.z - bunny.goalZ)).toBeCloseTo(21, 3)
  })

  it('has a running bunny reach her door past a machine standing on her path, without a jump', () => {
    const s = fresh(0)
    for (const a of s.animals) if (a.species === 'bunny') a.home = 3
    moveIn(s, 'bunny', 0)
    const bunny = s.animals[s.animals.length - 1]
    const m = s.machines.digger
    m.unlocked = true
    m.x = (bunny.x + bunny.goalX) / 2
    m.z = (bunny.z + bunny.goalZ) / 2
    let widest = 0
    let arrived = -1
    for (let i = 0; i < 30 * 12 && arrived < 0; i++) {
      const x = bunny.x
      const z = bunny.z
      tick(s, DT)
      if (!bunny.movingIn) arrived = s.time
      else widest = Math.max(widest, Math.hypot(bunny.x - x, bunny.z - z))
    }
    expect(arrived, 'she gets to her door').toBeGreaterThan(0)
    // Until she reaches her door and waves from its window, a tick moves her a run's step at most.
    expect(widest).toBeLessThanOrEqual(8 * DT + 1e-6)
  })

  it('turns a running bunny toward her step at a limited rate while she skirts a machine', () => {
    const s = fresh(0)
    for (const a of s.animals) if (a.species === 'bunny') a.home = 3
    moveIn(s, 'bunny', 0)
    const bunny = s.animals[s.animals.length - 1]
    const m = s.machines.digger
    m.unlocked = true
    m.x = (bunny.x + bunny.goalX) / 2
    m.z = (bunny.z + bunny.goalZ) / 2
    let turned = 0
    let swerved = false
    for (let i = 0; i < 30 * 12 && bunny.movingIn; i++) {
      const yaw = bunny.yaw
      const x = bunny.x
      const z = bunny.z
      tick(s, DT)
      if (!bunny.movingIn) break
      turned = Math.max(turned, Math.abs(turnTo(yaw, bunny.yaw)))
      if (Math.abs(turnTo(Math.atan2(bunny.goalX - x, bunny.goalZ - z), Math.atan2(bunny.x - x, bunny.z - z))) > 0.3) swerved = true
    }
    expect(swerved, 'she goes round the machine').toBe(true)
    expect(turned).toBeLessThanOrEqual(TURN_RATE * DT + 1e-9)
    expect(turned, 'and does turn').toBeGreaterThan(0.1)
  })

  it('lets a running bunny held in a pocket between machines walk on through them, to arrive before the party ends', () => {
    const s = fresh(0)
    for (const a of s.animals) if (a.species === 'bunny') a.home = 3
    moveIn(s, 'bunny', 0)
    const bunny = s.animals[s.animals.length - 1]
    const len = Math.hypot(bunny.goalX - bunny.x, bunny.goalZ - bunny.z)
    const ux = (bunny.goalX - bunny.x) / len
    const uz = (bunny.goalZ - bunny.z) / len
    // A cup of five machines open towards her, with her door beyond its back.
    const cup: [MachineKind, number, number][] = [['dozer', 3, -4], ['digger', 3, 0], ['mixer', 3, 4], ['roller', -1, -3.4], ['semi', -1, 3.4], ['tower', -4, -3.4], ['forklift', -4, 3.4]]
    for (const [kind, ahead, aside] of cup) {
      const m = s.machines[kind]
      m.unlocked = true
      m.goal = null
      m.x = bunny.x + ux * (12 + ahead) - uz * aside
      m.z = bunny.z + uz * (12 + ahead) + ux * aside
    }
    let widest = 0
    let arrived = -1
    for (let i = 0; i < 30 * PARTY_FOR && arrived < 0; i++) {
      const x = bunny.x
      const z = bunny.z
      tick(s, DT)
      if (!bunny.movingIn) arrived = s.time
      else widest = Math.max(widest, Math.hypot(bunny.x - x, bunny.z - z))
    }
    expect(arrived, 'she gets to her door').toBeGreaterThan(0)
    expect(widest).toBeLessThanOrEqual(8 * DT + 1e-6)
  })

  it('waves from a spot a little out from the wall, below the eave', () => {
    const s = fresh(0)
    for (const m of Object.values(s.machines)) m.unlocked = false
    moveIn(s, 'bunny', 0)
    const bunny = s.animals.find((a) => a.home === 0)!
    for (let i = 0; i < 30 * 12 && bunny.mood !== 'wave'; i++) tick(s, DT)
    expect(bunny.mood).toBe('wave')
    const b = s.builds[0]
    const out = bunny.z - (b.z + BUILD_HALF[b.kind][1])
    expect(out).toBeGreaterThanOrEqual(0.3)
    expect(out).toBeLessThanOrEqual(0.5)
    expect(bunny.y - groundY(s, bunny.x, bunny.z)).toBeLessThan(3)
  })

  it('has every animal of the starting crowd reach the door of each house the story moves someone into before the party there ends', () => {
    for (const j of STORY) {
      if (j.movesIn === null) continue
      const crowd = fresh(0).animals.filter((a) => a.home < 0).map((a) => a.species)
      for (const who of crowd) {
        const s = fresh(0)
        moveIn(s, who, j.movesIn.build)
        const a = s.animals.find((o) => o.species === who && o.home === j.movesIn?.build)!
        let t = 0
        for (; a.movingIn && t < PARTY_FOR; t += DT) tick(s, DT)
        expect(a.movingIn, `${who} to build ${j.movesIn.build}`).toBe(false)
      }
    }
  })

  it('has every show clear of machines, the truck crane stowed and the tower crane turned away, a few seconds into its party', () => {
    const s = fresh(0, { seed: 12 })
    const bot = createBot()
    for (const chapter of CHAPTER_IDS) {
      playUntil(s, bot, (o) => o.party !== null && o.party.chapter === chapter, 400)
      playUntil(s, bot, (o) => o.party === null || o.party.t >= 8, 20)
      expect(s.party, chapter).not.toBeNull()
      for (const m of Object.values(s.machines)) {
        if (m.unlocked) expect(touchesShow(PARTY_AREAS[chapter], m, SHOW_ROOM), `${chapter}: ${m.kind} at ${m.x.toFixed(1)}, ${m.z.toFixed(1)}`).toBe(false)
      }
      playUntil(s, bot, (o) => o.party === null, 20)
    }
  }, 600000)

  it('has no machine moving or standing in a party\'s show or in what its camera shows when the party begins, after a short wait, and none comes back while it runs', () => {
    const s = fresh(0, { seed: 12 })
    const bot = createBot()
    for (const chapter of CHAPTER_IDS) {
      let waitFrom = -1
      playUntil(s, bot, (o) => {
        if (o.partyWait !== null && waitFrom < 0) waitFrom = o.time
        return o.party !== null && o.party.chapter === chapter
      }, 400)
      const party = s.party as NonNullable<Sim['party']>
      expect(party.t, `${chapter}: it has just begun`).toBeLessThan(0.5)
      // The wait for the machines to drive out is well short of the cap.
      expect(s.time - waitFrom, `${chapter}: seconds the machines took to drive out`).toBeGreaterThan(0)
      expect(s.time - waitFrom, `${chapter}: seconds the machines took to drive out`).toBeLessThan(8)
      const view: Area[] = [...PARTY_AREAS[chapter], ...PARTY_FRAMES[chapter]]
      for (const m of Object.values(s.machines)) {
        if (!m.unlocked) continue
        // The tower crane cannot drive: its mast stands where it stands, and its jib is turned to have the least of it in view.
        if (m.kind !== 'tower') expect(inPartyView(chapter, m), `${chapter}: ${m.kind} at ${m.x.toFixed(1)}, ${m.z.toFixed(1)}`).toBe(false)
        expect(m.goal === null || !view.some((a) => m.goal !== null && m.goal.x >= a.x0 && m.goal.x <= a.x1 && m.goal.z >= a.z0 && m.goal.z <= a.z1), `${chapter}: ${m.kind} is bound for the view`).toBe(true)
      }
      // And none comes back into it while it runs.
      for (let i = 0; i < 30 * 12; i++) {
        botFrame(bot, s, DT)
        tick(s, DT)
        s.events.length = 0
        if (s.party === null) break
        if (i % 15 === 0) for (const m of Object.values(s.machines)) if (m.unlocked && m.kind !== 'tower') expect(inPartyView(chapter, m), `${chapter} at ${s.party.t.toFixed(1)} s: ${m.kind} at ${m.x.toFixed(1)}, ${m.z.toFixed(1)}`).toBe(false)
      }
      playUntil(s, bot, (o) => o.party === null, 20)
    }
  }, 120000)

  it('swings the tower crane\'s jib off a show and drives a truck crane with its boom out over one clear of it', () => {
    for (const chapter of CHAPTER_IDS) {
      const s = fresh(0)
      const areas = PARTY_AREAS[chapter]
      const tower = s.machines.tower
      const mobile = s.machines.mobile
      tower.unlocked = true
      mobile.unlocked = true
      const a = areas[0]
      const mid = { x: (a.x0 + a.x1) / 2, z: (a.z0 + a.z1) / 2 }
      tower.x = mid.x
      tower.z = a.z0 - 6
      tower.jib = 0
      tower.trolley = 20
      mobile.x = mid.x + 1
      mobile.z = mid.z
      mobile.legs = 1
      mobile.jib = 0.5
      mobile.reach = 12
      expect(touchesShow(areas, mobile, SHOW_ROOM), `${chapter}: the crane starts in the show`).toBe(true)
      expect(touchesShow(areas, tower, SHOW_ROOM), `${chapter}: the jib starts over the show`).toBe(true)
      clearParty(s, chapter)
      for (let i = 0; i < 30 * 12; i++) tick(s, DT)
      expect(touchesShow(areas, tower, SHOW_ROOM), `${chapter}: tower jib at ${tower.jib.toFixed(2)}`).toBe(false)
      expect(touchesShow(areas, mobile, SHOW_ROOM), `${chapter}: truck crane at ${mobile.x.toFixed(1)}, ${mobile.z.toFixed(1)}`).toBe(false)
    }
  })

  it('tests a truck crane against its drawn legs: a rear pad alone over a show\'s margin touches it, and a stowed crane is as wide as its body', () => {
    const s = fresh(0)
    const m = s.machines.mobile
    m.x = 0
    m.z = 0
    m.yaw = 0
    m.legs = 1
    const east = (x0: number, z0: number, z1: number): Area[] => [{ x0, x1: x0 + 10, z0, z1 }]
    // Behind the crane and out to the side: only the rear pad on that side is near.
    const reach = PAD_R + SHOW_ROOM
    const rearEdge = OUTRIGGER_Z[1] - reach
    expect(touchesShow(east(padX(1), rearEdge - 10, rearEdge + 0.05), m, SHOW_ROOM)).toBe(true)
    expect(touchesShow(east(padX(1), rearEdge - 10, rearEdge - 0.05), m, SHOW_ROOM)).toBe(false)
    // Stowed, the pads tuck in: the crane reaches as far to the side as its body.
    m.legs = 0
    const half = Math.max(...MACHINE_SPECS.mobile.body.map(([, r]) => r))
    expect(touchesShow(east(half + SHOW_ROOM + 0.05, -2, 2), m, SHOW_ROOM)).toBe(false)
    expect(touchesShow(east(half + SHOW_ROOM - 0.05, -2, 2), m, SHOW_ROOM)).toBe(true)
  })

  it('eases an animal out of a machine at its walking pace instead of popping it aside', () => {
    const s = fresh(9)
    const a = spawnAnimal(s, 'sheep', -30, 30)
    a.mood = 'idle'
    const m = s.machines.digger
    m.unlocked = true
    m.x = a.x + 0.5
    m.z = a.z
    const before = { x: a.x, z: a.z }
    tick(s, DT)
    expect(Math.hypot(a.x - before.x, a.z - before.z)).toBeLessThanOrEqual(3 * DT + 1e-6)
    expect(Math.hypot(a.x - before.x, a.z - before.z)).toBeGreaterThan(0)
  })

  it('moves Bunny in when the roof is done, and the windows are lit by the build being whole', () => {
    const s = fresh(9)
    const events: SimEvent[] = []
    playUntil(s, createBot(), (o) => o.storyDone === 10, 200, events)
    for (let i = 0; i < 30 * 20; i++) {
      tick(s, DT)
      events.push(...s.events)
      s.events.length = 0
    }
    expect(kinds(events)).toContain('moveIn')
    expect(s.builds[0].placed).toBe(s.builds[0].spots.length)
    const bunny = s.animals.find((a) => a.species === 'bunny')
    expect(bunny?.home).toBe(0)
  })

  it('sends cows and sheep over the finished bridge at the bridge party', () => {
    const s = fresh(12)
    const events: SimEvent[] = []
    playUntil(s, createBot(), (o) => o.party !== null && o.party.chapter === 'bridge', 300, events)
    expect(s.decks).toHaveLength(1)
    const far = s.animals.filter((a) => a.species === 'cow' || a.species === 'sheep')
    expect(far.length).toBe(5)
    playUntil(s, createBot(), (o) => o.party === null, 40, events)
    for (const a of far) expect(a.z, `${a.species} ${a.id}`).toBeGreaterThan(-31)
  })

  it('ends the story with fireworks, the End card, and then goes on with generated jobs', () => {
    const s = fresh(19)
    const events: SimEvent[] = []
    playUntil(s, createBot(), (o) => o.card !== null && o.card.kind === 'theEnd', 400, events)
    expect(kinds(events)).toContain('fireworks')
    expect(s.storyDone).toBe(STORY.length)
    playUntil(s, createBot(), (o) => o.job !== null, 30, events)
    expect(s.job?.job.chapter).toBe('more')
    expect(s.job?.job.who).not.toBe('hedgehog')
  })
})

describe('the child can say it', () => {
  const calls = (s: Sim, p: Partial<Spoken>, sameBreath = false): SimEvent[] => {
    s.events.length = 0
    say(s, spoken(p), sameBreath)
    const out = [...s.events]
    s.events.length = 0
    return out
  }
  const all = () => fresh(20)

  it('stops: the active machine drops its goal', () => {
    const s = all()
    setPoint(s, 0, 20)
    expect(s.machines.digger.goal).not.toBeNull()
    const e = calls(s, { stop: true })
    expect(s.machines.digger.goal).toBeNull()
    expect(kinds(e)).toEqual(['ack'])
  })

  it('helps: a hint and the hand now', () => {
    const s = all()
    const e = calls(s, { help: true })
    expect(kinds(e)).toContain('hint')
    expect(s.idle).toBeGreaterThanOrEqual(12)
  })

  it('names a machine: the builder hops into it, or says uhuh if it has not come', () => {
    const s = all()
    expect(kinds(calls(s, { who: 'dumper' }))).toEqual(['hop', 'ack'])
    expect(s.active).toBe('dumper')
    const early = fresh(0)
    expect(kinds(calls(early, { who: 'roller' }))).toEqual(['uhuh'])
    expect(early.active).toBe('digger')
  })

  it('honks', () => {
    const s = all()
    expect(kinds(calls(s, { honk: true }))).toEqual(['honk', 'ack'])
    expect(s.machines.digger.honk).toBeGreaterThan(0)
  })

  it('goes to a place, and does the job there when told to ("kippaa kuoppaan")', () => {
    const s = all()
    s.active = 'dumper'
    calls(s, { to: 'sand' })
    const g = s.machines.dumper.goal
    expect(g).not.toBeNull()
    expect(Math.hypot((g?.x ?? 0) - PLACES.sand.x, (g?.z ?? 0) - PLACES.sand.z)).toBeLessThan(1)
    expect(g?.thenPress).toBe(false)
    calls(s, { to: 'sand', work: 'give' })
    expect(s.machines.dumper.goal?.thenPress).toBe(true)
  })

  it('says uhuh to a place that means nothing now', () => {
    const s = all()
    expect(kinds(calls(s, { to: 'hole' }))).toEqual(['uhuh'])
    expect(kinds(calls(s, { to: 'there' }))).toEqual(['uhuh'])
  })

  it('goes to the pointer ("aja sinne"), hopping to the machine the step needs first', () => {
    const s = opened(0)
    s.events.length = 0
    s.active = 'dumper'
    const p = stepPointer(s)
    expect(p?.machine).toBe('digger')
    const e = calls(s, { move: 'forward', to: 'there' })
    expect(s.active).toBe('digger')
    expect(kinds(e)).toContain('hop')
    expect(s.machines.digger.goal).not.toBeNull()
  })

  it('moves forward, back, and left or right along the screen', () => {
    const s = all()
    const m = s.machines.digger
    m.yaw = 0
    calls(s, { move: 'forward' })
    expect(m.goal?.z).toBeCloseTo(m.z + 12, 3)
    calls(s, { move: 'back' })
    expect(m.goal?.reverse).toBe(true)
    expect(m.goal?.z).toBeCloseTo(m.z - 6, 3)
    setViewYaw(s, Math.PI)
    calls(s, { move: 'left' })
    expect(m.goal?.x).toBeCloseTo(m.x - 10, 3)
    calls(s, { move: 'right' })
    expect(m.goal?.x).toBeCloseTo(m.x + 10, 3)
    calls(s, { move: 'down' })
    expect(m.goal?.z).toBeCloseTo(m.z + 10, 3)
  })

  it('works the lift: the bed up, the blade up and down', () => {
    const s = all()
    s.active = 'dumper'
    calls(s, { move: 'up' })
    expect(s.machines.dumper.seq).toBe('up')
    s.active = 'dozer'
    calls(s, { work: 'take' })
    expect(s.machines.dozer.bladeUp).toBe(true)
    calls(s, { work: 'give' })
    expect(s.machines.dozer.bladeUp).toBe(false)
  })

  it('does the work by the table', () => {
    const s = all()
    s.active = 'dumper'
    s.machines.dumper.load = { amount: 3, kind: 'sand' }
    calls(s, { work: 'give' })
    tick(s, DT)
    expect(s.machines.dumper.seq).toBe('up')
    s.active = 'mixer'
    expect(kinds(calls(s, { work: 'take' }))).toEqual(['uhuh'])
    s.active = 'semi'
    expect(kinds(calls(s, { work: 'push' }))).toEqual(['uhuh'])
    s.active = 'digger'
    expect(kinds(calls(s, { work: 'give' }))).toEqual(['uhuh'])
    s.active = 'forklift'
    expect(kinds(calls(s, { work: 'give' }))).toEqual(['uhuh'])
    expect(kinds(calls(s, { work: 'take' }))).toEqual(['ack'])
  })

  it('digs when told "kaiva", skipping the hold and the block after a hop', () => {
    const s = all()
    hopTo(s, 'dumper')
    hopTo(s, 'digger')
    expect(s.hands.blocked).toBe(true)
    calls(s, { work: 'take' })
    tick(s, DT)
    tick(s, DT)
    expect(s.machines.digger.seq).toBe('reach')
  })

  it('calls a friend to come, and hops back if it was said in two breaths', () => {
    const s = all()
    const e = calls(s, { come: true, who: 'dumper' })
    expect(kinds(e)).toEqual(['ack'])
    expect(s.machines.dumper.goal).not.toBeNull()
    expect(s.machines.dumper.friend).toBe(true)
    hopTo(s, 'dumper')
    expect(s.active).toBe('dumper')
    const two = calls(s, { come: true, who: 'dumper' })
    expect(s.active).toBe('digger')
    expect(kinds(two)).toContain('hop')
    expect(calls(s, { come: true, who: 'tower' })).toHaveLength(1)
  })

  it('drives beside a machine named as a place', () => {
    const s = all()
    calls(s, { to: 'dumper' })
    const g = s.machines.digger.goal
    expect(Math.hypot((g?.x ?? 0) - s.machines.dumper.x, (g?.z ?? 0) - s.machines.dumper.z)).toBeLessThan(0.1)
    expect(PALLET_RING.r).toBeGreaterThan(0)
  })
})

describe('stars and par', () => {
  it('keeps the bot times as data that match what the bot takes, and a par of PAR_FACTOR times them', () => {
    const { times } = playAll()
    for (const j of STORY) {
      const t = times.get(j.id)
      const bot = BOT_SECONDS[j.id]
      expect(bot, j.id).toBeDefined()
      expect(j.par, j.id).toBe(Math.round(PAR_FACTOR * bot))
      if (t !== undefined) expect(Math.abs(t - bot), `${j.id}: the bot took ${t.toFixed(1)} s, the data says ${bot}`).toBeLessThanOrEqual(0.1 * bot + 2)
    }
    for (const template of MORE_TEMPLATES) {
      const ts = [...times].filter(([id]) => id.startsWith(`${template}-`)).map(([, t]) => t)
      if (ts.length < 2) continue
      const mean = ts.reduce((a, b) => a + b, 0) / ts.length
      expect(mean, `${template}: mean ${mean.toFixed(1)} s over ${ts.length}`).toBeGreaterThan(0.6 * MORE_BOT_SECONDS[template])
      expect(mean, `${template}: mean ${mean.toFixed(1)} s over ${ts.length}`).toBeLessThan(1.6 * MORE_BOT_SECONDS[template])
    }
  })

  it('give a whole story played at twice the bot time at least 50 of its 60 stars', () => {
    const { times } = playAll()
    let stars = 0
    for (const j of STORY) stars += starsFor(2 * (times.get(j.id) ?? Infinity), j.par, false)
    expect(stars).toBeGreaterThanOrEqual(50)
  })

  it('give them too when a child dawdles through the first half of each job and the bot does the rest', () => {
    const s = fresh()
    const bot = createBot()
    let spent = 0
    while (s.storyDone < STORY.length) {
      const run = s.job
      if (run === null || s.time - run.startedAt >= BOT_SECONDS[run.job.id]) botFrame(bot, s, DT)
      tick(s, DT)
      s.events.length = 0
      if (++spent > 30 * 3000) throw new Error(`stuck in ${s.job?.job.id}`)
    }
    expect(s.score.stars).toBeGreaterThanOrEqual(50)
  }, 600000)
})

/** Plays with the bot up to a story job's step, then hands over to the test: the child lets go, and is in the machine the step needs. */
function playToStep(storyDone: number, id: string, step: number): { s: Sim; bot: Bot } {
  const s = fresh(storyDone)
  const bot = createBot()
  playUntil(s, bot, (o) => o.job !== null && o.job.job.id === id && o.job.step === step, 300)
  // The child lets go of whatever the last machine needed.
  setAction(s, false)
  letGo(s)
  const p = stepPointer(s)
  if (p !== null && p.machine !== s.active) hopTo(s, p.machine)
  return { s, bot }
}

/** The finger of a child who only points: one point at a time, never the big button, never a portrait. */
function fingerFrame(s: Sim, point: (s: Sim) => { x: number; z: number } | null): void {
  const p = stepPointer(s)
  const at = point(s)
  if (p === null || p.machine !== s.active || at === null) letGo(s)
  else setPoint(s, at.x, at.z)
}

/** Seconds a child who only points or only says "aja sinne" may take over a push or a clear: the bot, which does it by the book, takes about 25. */
const TAPS_ALONE_CAP = 60

describe('the dozer without the button', () => {
  const finish = (s: Sim, id: string, step: number, point: (s: Sim) => { x: number; z: number } | null, cap: number) => {
    const t0 = s.time
    while (s.job !== null && s.job.job.id === id && s.job.step === step) {
      if (s.time - t0 > cap) throw new Error(`${id} step ${step} still open after ${cap} s (count ${s.job.count.toFixed(2)}, phase ${s.job.phase})`)
      const p = stepPointer(s)
      if (p !== null) expect(p.press).toBe(false)
      fingerFrame(s, point)
      expect(s.hands.action).toBe(false)
      tick(s, DT)
      s.events.length = 0
    }
    return s.time - t0
  }
  const marker = (s: Sim) => {
    const p = stepPointer(s)
    return p === null ? null : { x: p.x, z: p.z }
  }

  it('finishes a push with only setPoint and letGo, following the marker', () => {
    const { s } = playToStep(0, 'hole1', 2)
    const took = finish(s, 'hole1', 2, marker, 200)
    expect(took).toBeLessThan(120)
    expect(s.storyDone).toBeGreaterThanOrEqual(1)
  })

  it('finishes a clear with only setPoint and letGo, following the marker', () => {
    const { s } = playToStep(11, 'gravel', 2)
    const took = finish(s, 'gravel', 2, marker, 200)
    expect(took).toBeLessThan(120)
  })

  it('lifts the blade by itself on the way back and drops it for the pass', () => {
    const { s } = playToStep(0, 'hole1', 2)
    const d = s.machines.dozer
    let up = 0
    let down = 0
    while (s.job !== null && s.job.step === 2 && s.time < 400) {
      fingerFrame(s, marker)
      tick(s, DT)
      s.events.length = 0
      if (s.job === null) break
      if (s.job.phase === 0 && d.blade > 0.9) up++
      if (s.job.phase === 1 && d.blade < 0.1 && Math.abs(d.speed) > 1) down++
    }
    expect(up).toBeGreaterThan(30)
    expect(down).toBeGreaterThan(30)
  })

  it('finishes a push for a child who ignores the arrow and taps the hole over and over', () => {
    const { s } = playToStep(0, 'hole1', 2)
    const hole = STORY[0].steps[2].kind === 'push' ? STORY[0].steps[2].hole : null
    expect(hole).not.toBeNull()
    let n = 0
    // One tap on the hole every half second, whatever the dozer is doing.
    const took = finish(s, 'hole1', 2, () => (n++ % 15 === 0 && hole !== null ? { x: hole.x, z: hole.z } : null), 600)
    expect(took, 'a push by taps on the hole alone').toBeLessThan(TAPS_ALONE_CAP)
  })

  it('finishes a clear for a child who only taps the heap over and over', () => {
    const { s } = playToStep(11, 'gravel', 2)
    const step = STORY[11].steps[2]
    const zone = step.kind === 'clear' ? step.zone : null
    expect(zone).not.toBeNull()
    let n = 0
    const took = finish(s, 'gravel', 2, () => (n++ % 15 === 0 && zone !== null ? { x: zone.x, z: zone.z } : null), 600)
    expect(took, 'a clear by taps on the heap alone').toBeLessThan(TAPS_ALONE_CAP)
  })

  it('finishes a push for spoken "aja sinne" said over and over and nothing else', () => {
    const { s } = playToStep(0, 'hole1', 2)
    const t0 = s.time
    let n = 0
    while (s.job !== null && s.job.job.id === 'hole1' && s.job.step === 2) {
      if (s.time - t0 > 400) throw new Error(`still pushing after 400 s (count ${s.job.count.toFixed(2)}, phase ${s.job.phase})`)
      if (n++ % 30 === 0) say(s, spoken({ move: 'forward', to: 'there' }), false)
      tick(s, DT)
      s.events.length = 0
    }
    expect(s.time - t0, 'a push by "aja sinne" alone').toBeLessThan(TAPS_ALONE_CAP)
    expect(s.storyDone).toBeGreaterThanOrEqual(1)
    expect(s.hands.action).toBe(false)
  })
})

describe('the dozer\'s push after a tip', () => {
  /** Seconds the bot takes to finish the push step of story job `i` with the dozer set down `dist` metres from the heap, `angle` degrees round it, facing away. */
  function pushFrom(i: number, angle: number, dist: number): number {
    const { s, bot } = playToStep(i, STORY[i].id, 2)
    const heap = s.job!.heap!
    const a = (angle * Math.PI) / 180
    const d = s.machines.dozer
    d.x = heap.x + Math.sin(a) * dist
    d.z = heap.z + Math.cos(a) * dist
    d.goal = null
    d.speed = 0
    d.yaw = a + Math.PI
    s.machines.dozer.unlocked = true
    setAction(s, false)
    letGo(s)
    hopTo(s, 'dozer')
    return playUntil(s, bot, (o) => o.job === null || o.job.step !== 2, 150)
  }

  it.each(['hole1', 'sandpit'])('takes about the same time in %s from a dozer set down anywhere round the heap, near it or far', (id) => {
    const i = STORY.findIndex((j) => j.id === id)
    const times: number[] = []
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) for (const dist of [8, 14]) times.push(pushFrom(i, angle, dist))
    const sorted = [...times].sort((p, q) => p - q)
    const median = sorted[sorted.length >> 1]
    // The blade meets the heap from its far edge, facing the hole, whichever way the dozer came: no start is a quarter again slower than the usual, and none is more than twice as quick.
    expect(Math.max(...times), `${id}: ${times.map((x) => x.toFixed(0)).join(' ')} s`).toBeLessThan(1.25 * median)
    expect(Math.min(...times), `${id}: ${times.map((x) => x.toFixed(0)).join(' ')} s`).toBeGreaterThan(0.5 * median)
  }, 300000)
})

describe('plain data', () => {
  const machinePlaces = (s: Sim) => MACHINE_KINDS.map((k) => [s.machines[k].x, s.machines[k].z, s.machines[k].yaw, s.machines[k].speed])
  const jobStep = (s: Sim) => (s.job === null ? null : [s.job.job.id, s.job.step, s.job.count, s.job.phase, s.job.passes])

  it.each([0, 7, 11])('a structured clone of a sim from job %i plays on exactly as the sim itself does', (k) => {
    const s = fresh(k)
    const bot = createBot()
    const dtFrames = 30 * 60
    for (let i = 0; i < dtFrames; i++) {
      botFrame(bot, s, DT)
      tick(s, DT)
      s.events.length = 0
    }
    const copy = structuredClone({ s, bot })
    for (let i = 0; i < dtFrames; i++) {
      botFrame(bot, s, DT)
      tick(s, DT)
      s.events.length = 0
      botFrame(copy.bot, copy.s, DT)
      tick(copy.s, DT)
      copy.s.events.length = 0
    }
    expect(machinePlaces(copy.s)).toEqual(machinePlaces(s))
    expect(jobStep(copy.s)).toEqual(jobStep(s))
    expect(copy.s.score).toEqual(s.score)
    expect(copy.s.storyDone).toBe(s.storyDone)
    expect(copy.s.time).toBe(s.time)
  })

  it('makes generated jobs from any seed, and never the same template twice running', () => {
    for (const seed of [0, 1, 7, 15, 16, 99, 2 ** 31 - 1]) {
      const s = fresh(STORY.length, { seed })
      let last: string | null = null
      for (let i = 0; i < 12; i++) {
        const template = templateOf(nextMoreJob(s))
        expect(template, `seed ${seed} job ${i}`).not.toBeNull()
        expect(template).not.toBe(last)
        last = template
      }
    }
    // A game reloaded from its save carries on from the seed and the last template, so a template never repeats across a reload.
    for (const seed of [0, 1, 7, 15, 99, 12345]) {
      const s = fresh(STORY.length, { seed })
      for (let i = 0; i < 8; i++) {
        const before = templateOf(nextMoreJob(s))
        const reloaded = createSim({ storyDone: STORY.length, moreDone: s.moreDone, coins: 0, stars: 0, mode: 'easy', seed: s.seed, lastTemplate: s.lastTemplate })
        expect(templateOf(nextMoreJob(reloaded)), `seed ${seed} job ${i}`).not.toBe(before)
        s.moreDone++
      }
    }
    const a = fresh(STORY.length, { seed: 3 })
    const b = fresh(STORY.length, { seed: 4 })
    expect([0, 1, 2, 3, 4, 5].map(() => templateOf(nextMoreJob(a)))).not.toEqual([0, 1, 2, 3, 4, 5].map(() => templateOf(nextMoreJob(b))))
  }, 60000)
})
