import { describe, expect, it } from 'vitest'
import { FOREST_RING, MOBILE_PARK, PALLET_RING, TIP_RINGS, WATER_RING } from './map'
import { DUMP_MAX } from './model'
import type { MachineKind, Sim, SimEvent, Spoken } from './model'
import { STORY } from './jobs'
import { parseBest } from './speech'
import { createSim, say, stepPointer, tick } from './sim'
import { SAY_EVERY, createVoiceBot, voiceFrame } from './voicebot'
import type { VoiceBot } from './voicebot'

const DT = 1 / 30

const fresh = (storyDone = 0) => createSim({ storyDone, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })

/** One utterance as the game hears it: the first clause starts a breath, the rest are in the same breath. */
function hear(s: Sim, text: string): Spoken[] {
  const clauses = parseBest([text])
  clauses.forEach((c, i) => say(s, c, i > 0))
  return clauses
}

/** Steps the sim for `seconds` and returns the events that happened; `then` may stop it early by returning true. */
function play(s: Sim, seconds: number, then: (s: Sim) => boolean = () => false): SimEvent[] {
  const events: SimEvent[] = []
  const end = s.time + seconds
  while (s.time < end && !then(s)) {
    tick(s, DT)
    events.push(...s.events)
    s.events.length = 0
  }
  return events
}

/** Takes the events the sentence itself gave, before any frame. */
function heard(s: Sim, text: string): SimEvent[] {
  s.events.length = 0
  hear(s, text)
  const events = [...s.events]
  s.events.length = 0
  return events
}

const kinds = (events: SimEvent[]) => events.map((e) => e.kind)
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)

/** Steps with the voice bot until `until` holds; throws past `cap` seconds. Returns the seconds it took. */
function talkUntil(s: Sim, bot: VoiceBot, until: (s: Sim) => boolean, cap: number): number {
  const t0 = s.time
  while (!until(s)) {
    if (s.time - t0 > cap) throw new Error(`still at ${s.job === null ? 'no job' : `${s.job.job.id} step ${s.job.step} (${s.job.job.steps[s.job.step].kind})`} after ${cap} s; last said ${JSON.stringify(bot.said.slice(-4))}`)
    voiceFrame(bot, s)
    tick(s, DT)
    s.events.length = 0
  }
  return s.time - t0
}

/** The seconds the voice bot takes for story job `i`: from the job's start, not from the end of the one before, which leaves a chapter's card and party between them. */
function talkJob(s: Sim, bot: VoiceBot, i: number, cap: number): number {
  talkUntil(s, bot, (x) => x.job !== null && x.job.job.id === STORY[i].id, 60)
  return talkUntil(s, bot, (x) => x.storyDone > i, cap)
}

/** Scenes are played once by the voice bot and cloned for each test. */
const scenes = new Map<string, Sim>()
function scene(job: string, step: number): Sim {
  const key = `${job}:${step}`
  let s = scenes.get(key)
  if (s === undefined) {
    const sim = fresh()
    const bot = createVoiceBot()
    talkUntil(sim, bot, (x) => x.job !== null && x.job.job.id === job && x.job.step === step, 900)
    scenes.set(key, sim)
    s = sim
  }
  return structuredClone(s)
}

describe('the voice bot plays by talking only', () => {
  it('says one short sentence at most every 1.5 s, from words the parser knows', () => {
    const s = fresh()
    const bot = createVoiceBot()
    talkUntil(s, bot, (x) => x.storyDone > 0, STORY[0].par)
    expect(bot.said.length).toBeGreaterThan(10)
    for (let i = 1; i < bot.said.length; i++) expect(bot.said[i].at - bot.said[i - 1].at).toBeGreaterThanOrEqual(SAY_EVERY - 1e-6)
    for (const { text } of bot.said) {
      expect(text.split(' ').length, text).toBeLessThanOrEqual(2)
      expect(parseBest([text]).length, text).toBeGreaterThan(0)
    }
  })

  it('does the road chapter and the first two jobs of the house, each inside its par', () => {
    const s = fresh()
    const bot = createVoiceBot()
    for (let i = 0; i < 5; i++) {
      const job = STORY[i]
      const t = talkJob(s, bot, i, job.par)
      expect(t, job.id).toBeLessThanOrEqual(job.par)
    }
    expect(s.storyDone).toBe(5)
  })

  it('does the whole story, every job inside two stars', () => {
    const s = fresh()
    const bot = createVoiceBot()
    for (let i = 0; i < STORY.length; i++) {
      const job = STORY[i]
      const t = talkJob(s, bot, i, 2 * job.par)
      expect(t, job.id).toBeLessThanOrEqual(2 * job.par)
    }
    expect(s.storyDone).toBe(STORY.length)
  }, 60000)
})

/** What a child who talks in whole sentences says at each step of the story. */
function sentenceAt(s: Sim): string | null {
  if (s.job === null) return null
  const step = s.job.job.steps[s.job.step]
  switch (step.kind) {
    case 'scoop':
      return step.into === 'dumper' ? 'kaivuri kaiva hiekkaa kippiautoon' : step.into === 'mixer' ? 'kaivuri kaiva hiekkaa betoniautoon' : step.into === 'crusher' ? 'kaivuri kaiva kiviä murskaan' : 'kaivuri kaiva hiekkaa tiilikoneeseen'
    case 'digOut':
      return 'kaivuri kaiva kuoppaa'
    case 'tip':
      return 'kippiauto kippaa kuoppaan'
    case 'feed':
      return 'kippiauto kippaa tiilikoneeseen'
    case 'push':
      return 'puskutraktori työnnä hiekka kuoppaan'
    case 'clear':
      return 'puskutraktori työnnä'
    case 'roll':
      return 'jyrä jyrää tietä'
    case 'water':
      return 'betoniauto aja veteen'
    case 'pour':
      return 'betoniauto valaa'
    case 'carry':
      return s.machines.forklift.holding >= 0 ? 'trukki laske' : 'trukki nosta'
    case 'lift': {
      const crane = step.crane === 'tower' ? 'nosturi' : 'autonosturi'
      return `${crane} ${s.machines[step.crane].holding >= 0 ? 'laske' : 'nosta'}`
    }
    case 'drive':
      return step.ring === FOREST_RING ? 'rekka aja metsään' : 'rekka aja sahalle'
    case 'unload':
      return 'rekka pura'
    case 'watch':
      return null
  }
}

describe('a child who says whole sentences', () => {
  it('does the whole story, saying the same sentence again every 3 s until it works', () => {
    const s = fresh()
    let next = 0
    for (let i = 0; i < STORY.length; i++) {
      const job = STORY[i]
      const t0 = s.time
      while (s.storyDone <= i) {
        if (s.time - t0 > 2 * job.par) throw new Error(`${job.id}: step ${s.job?.step} not done in ${2 * job.par} s`)
        const text = s.time >= next ? sentenceAt(s) : null
        if (text !== null) {
          hear(s, text)
          next = s.time + 3
        }
        tick(s, DT)
        s.events.length = 0
      }
    }
    expect(s.storyDone).toBe(STORY.length)
  }, 600000)
})

describe('the truck crane lifts by voice from wherever it is parked', () => {
  /** The span job with the truck crane set down at `x`, `z` facing `yaw` with its legs down, and a child who says "nosta" when it holds nothing and "laske" when it holds a piece, every 3 s. Returns the seconds the three pieces took, the pieces placed. */
  function span(x: number, z: number, yaw: number): { seconds: number; placed: number } {
    const i = STORY.findIndex((j) => j.id === 'span')
    const s = fresh(i)
    while (s.job === null) tick(s, DT)
    const m = s.machines.mobile
    m.x = x
    m.z = z
    m.yaw = yaw
    m.legs = 1
    m.goal = null
    hear(s, 'autonosturi')
    const t0 = s.time
    let next = 0
    while (s.storyDone <= i && s.time - t0 < 150) {
      if (s.time >= next) {
        hear(s, `autonosturi ${m.holding >= 0 ? 'laske' : 'nosta'}`)
        next = s.time + 3
      }
      tick(s, DT)
      s.events.length = 0
    }
    return { seconds: s.time - t0, placed: s.builds[1].placed }
  }

  it.each([
    [0, 0, 0],
    [4, 0, 0],
    [8, 0, 0],
    [-8, 5, Math.PI / 2],
    [12, 10, Math.PI / 2],
    [4, 5, -Math.PI / 2],
    [-4, 10, Math.PI],
  ])('places all three pieces of the span within two stars with the crane %i m east and %i m south of its park, facing %f', (dx, dz, yaw) => {
    const done = span(MOBILE_PARK.x + dx, MOBILE_PARK.z + dz, yaw)
    expect(done.placed).toBe(3)
    expect(done.seconds).toBeLessThanOrEqual(2 * STORY.find((j) => j.id === 'span')!.par)
  })

  it('"laske" with the piece the span needs puts it on the next open spot, not back where it was picked up', () => {
    const i = STORY.findIndex((j) => j.id === 'span')
    const s = fresh(i)
    while (s.job === null) tick(s, DT)
    hear(s, 'autonosturi')
    hear(s, 'nosta')
    play(s, 40, (o) => o.machines.mobile.holding >= 0 && o.machines.mobile.seq === 'rest')
    const m = s.machines.mobile
    expect(m.holding).toBeGreaterThanOrEqual(0)
    const picked = s.things.find((t) => t.id === m.holding)!
    const at = { x: picked.x, z: picked.z }
    hear(s, 'laske')
    play(s, 40, (o) => o.builds[1].placed > 0)
    expect(s.builds[1].placed).toBe(1)
    expect(dist(picked, at)).toBeGreaterThan(3)
  })
})

describe('what a child says, and what it does in the world', () => {
  describe('hole1, the digger and the truck', () => {
    it('"kaivuri kaiva hiekkaa" gets sand into the bucket, then "kaada kippiautoon" gets it into the truck', () => {
      const s = scene('hole1', 0)
      const events = [...heard(s, 'kaivuri kaiva hiekkaa'), ...play(s, 4)]
      expect(kinds(events)).toContain('bite')
      expect(s.active).toBe('digger')
      expect(s.machines.digger.load.amount).toBeGreaterThan(1.5)
      expect(s.machines.dumper.load.amount).toBe(0)
      const more = [...heard(s, 'kaada kippiautoon'), ...play(s, 6)]
      expect(kinds(more)).toContain('dump')
      expect(s.machines.digger.load.amount).toBeLessThan(0.1)
      expect(s.machines.dumper.load.amount).toBeGreaterThan(1.5)
      expect(s.active).toBe('digger')
    })

    it('a recogniser writes capitals, commas and a split compound, and it is the same', () => {
      for (const text of ['Kaivuri, kaiva hiekkaa!', 'kaivu ri kaiva hiekka', 'KAIVURI KAIVA HIEKKAA', 'kaivinkone kaivaa hiekkaa', 'kaivuli kaiva hiekkaa']) {
        const s = scene('hole1', 0)
        play(s, 0.1)
        hear(s, text)
        play(s, 4)
        expect(s.machines.digger.load.amount, text).toBeGreaterThan(1.5)
      }
    })

    it('"kaiva" alone digs and "kaada" with an empty bucket gives uhuh and nothing else', () => {
      const s = scene('hole1', 0)
      const none = heard(s, 'kaada')
      expect(kinds(none)).toEqual(['uhuh'])
      play(s, 2)
      expect(s.machines.digger.load.amount).toBe(0)
      hear(s, 'kaiva')
      play(s, 4)
      expect(s.machines.digger.load.amount).toBeGreaterThan(1.5)
    })

    it('saying "kaiva" over and over does not dig a second bucket while the first is full', () => {
      const s = scene('hole1', 0)
      hear(s, 'kaiva')
      play(s, 4)
      const full = s.machines.digger.load.amount
      for (let i = 0; i < 4; i++) {
        hear(s, 'kaiva kaiva')
        play(s, 0.5)
      }
      expect(s.machines.digger.load.amount).toBeLessThanOrEqual(full + 1e-6)
    })

    it('"kippiauto aja kuopalle ja kippaa" drives there and tips only on arrival', () => {
      const s = scene('hole1', 1)
      const ring = TIP_RINGS[0]
      const d = s.machines.dumper
      expect(d.load.amount).toBeGreaterThan(5)
      hear(s, 'kippiauto aja kuopalle ja kippaa')
      expect(s.active).toBe('dumper')
      play(s, 1)
      expect(d.speed).toBeGreaterThan(1)
      expect(d.bed).toBe(0)
      expect(d.load.amount).toBeGreaterThan(5)
      expect(dist(d, ring)).toBeGreaterThan(5)
      const events = play(s, 20, (x) => x.job === null || x.job.step !== 1)
      expect(kinds(events)).toContain('tip')
      expect(s.job?.step).toBe(2)
      expect(dist(d, ring)).toBeLessThan(3)
    })

    it('"kippiauto kippaa kuoppaan" is the same in one clause', () => {
      const s = scene('hole1', 1)
      hear(s, 'kippiauto kippaa kuoppaan')
      play(s, 20, (x) => x.job === null || x.job.step !== 1)
      expect(s.job?.step).toBe(2)
    })

    it('"kippiauto aja kuopalle" with no tipping word drives there and keeps its load', () => {
      const s = scene('hole1', 1)
      hear(s, 'kippiauto aja kuopalle')
      play(s, 12)
      expect(dist(s.machines.dumper, TIP_RINGS[0])).toBeLessThan(3)
      expect(s.machines.dumper.load.amount).toBeGreaterThan(5)
      expect(s.job?.step).toBe(1)
    })

    it('"kippiauto tule tänne" brings the truck and the builder stays in the digger', () => {
      const s = scene('hole1', 1)
      hear(s, 'kippiauto aja kuopalle')
      play(s, 12)
      hear(s, 'kaivuri')
      play(s, 5)
      expect(s.active).toBe('digger')
      expect(dist(s.machines.dumper, s.machines.digger)).toBeGreaterThan(15)
      const events = [...heard(s, 'kippiauto tule tänne'), ...play(s, 12)]
      expect(kinds(events)).not.toContain('hop')
      expect(s.active).toBe('digger')
      expect(dist(s.machines.dumper, s.machines.digger)).toBeLessThan(8)
    })

    it('"tule tänne" with no machine named brings the one the step needs', () => {
      const s = scene('hole1', 1)
      hear(s, 'kippiauto aja kuopalle')
      play(s, 12)
      hear(s, 'kaivuri')
      play(s, 5)
      play(s, 0.1)
      hear(s, 'tule tänne')
      expect(s.active).toBe('digger')
      play(s, 12)
      expect(dist(s.machines.dumper, s.machines.digger)).toBeLessThan(8)
    })

    it('"seis" stops a moving truck at once', () => {
      const s = scene('hole1', 1)
      hear(s, 'kippiauto aja kuopalle')
      play(s, 1.5)
      const d = s.machines.dumper
      expect(d.speed).toBeGreaterThan(3)
      const events = heard(s, 'seis')
      expect(d.goal).toBeNull()
      expect(kinds(events)).toEqual(['ack'])
      const at = { x: d.x, z: d.z }
      play(s, 1)
      expect(Math.abs(d.speed)).toBeLessThan(0.3)
      expect(dist(d, at)).toBeLessThan(2.5)
      play(s, 3)
      expect(dist(d, TIP_RINGS[0])).toBeGreaterThan(5)
    })

    it('"Seis!", "stop", "ei ei ei" and "odota" all stop it', () => {
      for (const text of ['Seis!', 'stop', 'ei ei ei', 'odota', 'pysähdy']) {
        const s = scene('hole1', 1)
        hear(s, 'kippiauto aja kuopalle')
        play(s, 1.5)
        hear(s, text)
        expect(s.machines.dumper.goal, text).toBeNull()
      }
    })

    it('"tööt" honks the machine the child is in, and "tuut tuut" honks again', () => {
      const s = scene('hole1', 0)
      const one = heard(s, 'tööt')
      expect(one.filter((e) => e.kind === 'honk')).toEqual([{ kind: 'honk', machine: 'digger' }])
      expect(s.machines.digger.honk).toBeGreaterThan(0)
      hear(s, 'kippiauto')
      const two = heard(s, 'Tuut tuut!')
      expect(two.filter((e) => e.kind === 'honk').length).toBeGreaterThan(0)
      expect(two.find((e) => e.kind === 'honk')).toEqual({ kind: 'honk', machine: 'dumper' })
    })

    it('"peruuta" backs the truck up, away from where its nose points', () => {
      const s = scene('hole1', 1)
      hear(s, 'kippiauto')
      play(s, 0.5)
      const d = s.machines.dumper
      const at = { x: d.x, z: d.z, yaw: d.yaw }
      hear(s, 'peruuta')
      play(s, 2.5)
      const forward = (d.x - at.x) * Math.sin(at.yaw) + (d.z - at.z) * Math.cos(at.yaw)
      expect(forward).toBeLessThan(-3)
    })

    it('"vasemmalle" goes screen-left at the default view, "oikealle" screen-right', () => {
      for (const [text, side] of [['vasemmalle', -1], ['aja oikealle', 1], ['kippiauto vasemmalle', -1]] as const) {
        const s = scene('hole1', 1)
        hear(s, 'kippiauto')
        play(s, 0.5)
        const d = s.machines.dumper
        const at = { x: d.x, z: d.z }
        hear(s, text)
        play(s, 10)
        expect((d.x - at.x) * side, text).toBeGreaterThan(6)
        expect(Math.abs(d.x - at.x), text).toBeGreaterThan(Math.abs(d.z - at.z))
      }
    })

    it('"eteenpäin" and "ylös" go up the screen, "alas" down it', () => {
      const s = scene('hole1', 1)
      hear(s, 'kippiauto')
      play(s, 0.5)
      const d = s.machines.dumper
      expect(heard(s, 'alas').some((e) => e.kind === 'ack')).toBe(true)
      play(s, 1.5)
      expect(d.bed).toBeGreaterThanOrEqual(0)
    })

    it('"kippaa" with the truck away from the ring takes the load to the ring and tips it there, not on the lawn', () => {
      const s = scene('hole1', 1)
      hear(s, 'kippiauto')
      play(s, 0.5)
      const lawn = { x: s.machines.dumper.x, z: s.machines.dumper.z }
      const events = [...heard(s, 'kippaa'), ...play(s, 1)]
      expect(kinds(events)).not.toContain('tip')
      expect(s.machines.dumper.load.amount).toBeGreaterThan(5)
      play(s, 20, (x) => x.job === null || x.job.step !== 1)
      expect(s.job?.step).toBe(2)
      expect(dist(s.machines.dumper, TIP_RINGS[0])).toBeLessThan(3)
      expect(dist(s.machines.dumper, lawn)).toBeGreaterThan(8)
    })

    it('"kippaa" with a load that no step wants tips it where the truck stands', () => {
      const s = scene('hole1', 1)
      s.job = null
      hear(s, 'kippiauto')
      play(s, 0.5)
      const events = [...heard(s, 'kippaa'), ...play(s, 10)]
      expect(kinds(events)).toContain('tip')
      expect(s.machines.dumper.load.amount).toBeLessThan(0.1)
    })

    it('"kaada kippiautoon" with the truck far away brings the truck, and said again it pours', () => {
      const s = scene('hole1', 0)
      hear(s, 'kippiauto aja metsään')
      play(s, 10)
      hear(s, 'kaivuri kaiva')
      play(s, 4)
      expect(dist(s.machines.dumper, s.machines.digger)).toBeGreaterThan(15)
      expect(s.machines.digger.load.amount).toBeGreaterThan(1.5)
      const first = [...heard(s, 'kaada kippiautoon'), ...play(s, 1)]
      expect(kinds(first)).not.toContain('dump')
      play(s, 12)
      expect(s.active).toBe('digger')
      expect(dist(s.machines.dumper, s.machines.digger)).toBeLessThan(DUMP_MAX - 0.5)
      hear(s, 'kaada kippiautoon')
      play(s, 5)
      expect(s.machines.dumper.load.amount).toBeGreaterThan(1.5)
    })

    it('"kaivuri kaiva hiekkaa ja kaada kippiautoon" in one breath digs and then pours into the truck', () => {
      for (const text of ['kaivuri kaiva hiekkaa ja kaada kippiautoon', 'kaivuri kaiva hiekkaa sitten kaada kippiautoon', 'kaivuri kaiva ja kaada', 'kaiva hiekkaa kippiautoon', 'kaivinkone kaivaa hiekkaa kippiautoon']) {
        const s = scene('hole1', 0)
        play(s, 0.5)
        hear(s, text)
        play(s, 12)
        expect(s.machines.dumper.load.amount, text).toBeGreaterThan(1.5)
        expect(s.machines.digger.load.amount, text).toBeLessThan(0.1)
      }
    })

    it('"kaiva" a second time, said while the bucket is on its way up, does not give uhuh', () => {
      const s = scene('hole1', 0)
      hear(s, 'kaiva')
      play(s, 0.5)
      expect(kinds(heard(s, 'kaada kippiautoon'))).toEqual(['ack'])
      play(s, 8)
      expect(s.machines.dumper.load.amount).toBeGreaterThan(1.5)
    })

    it('a sentence with no game words does nothing at all', () => {
      for (const text of ['mä haluan jätskin', 'joo', 'kiitos', 'mikä toi on', 'hei hei', 'äiti katso', 'mulla on nälkä', 'tämä on tosi hauskaa']) {
        const s = scene('hole1', 0)
        const at = JSON.stringify(Object.values(s.machines).map((m) => [m.x, m.z, m.goal]))
        const events = heard(s, text)
        expect(events, text).toEqual([])
        expect(s.active, text).toBe('digger')
        expect(JSON.stringify(Object.values(s.machines).map((m) => [m.x, m.z, m.goal])), text).toBe(at)
        expect(s.pressNext, text).toBe(false)
      }
    })

    it('"apua" gives the hint', () => {
      const s = scene('hole1', 0)
      const events = heard(s, 'apua')
      expect(kinds(events)).toEqual(['hint', 'ack'])
      expect(s.idle).toBeGreaterThanOrEqual(12)
    })
  })

  describe('a machine that has not come yet', () => {
    it('"nosturi" before the tower has come gives uhuh and nothing else', () => {
      const s = scene('hole1', 0)
      expect(s.machines.tower.unlocked).toBe(false)
      const events = heard(s, 'nosturi')
      expect(kinds(events)).toEqual(['uhuh'])
      expect(s.active).toBe('digger')
      expect(s.machines.tower.goal).toBeNull()
    })

    it('"nosturi nosta" and "kippiauto tule tänne" to a machine that has not come give uhuh', () => {
      const s = scene('hole1', 0)
      expect(kinds(heard(s, 'nosturi nosta'))).toEqual(['uhuh'])
      expect(kinds(heard(s, 'nosturi tule tänne'))).toEqual(['uhuh'])
      expect(kinds(heard(s, 'rekka'))).toEqual(['uhuh'])
      expect(kinds(heard(s, 'jyrä'))).toEqual(['uhuh'])
      expect(s.active).toBe('digger')
    })

    it('"kaada kippiautoon" when the truck has not come yet gives uhuh', () => {
      const s = scene('hole1', 0)
      s.machines.dumper.unlocked = false
      hear(s, 'kaiva')
      play(s, 4)
      expect(kinds(heard(s, 'kaada kippiautoon'))).toEqual(['uhuh'])
    })
  })

  describe('the dozer', () => {
    it('"puskutraktori työnnä hiekka kuoppaan", said again every 3 s, fills the hole', () => {
      const s = scene('hole1', 2)
      const t0 = s.time
      let next = 0
      while (s.job !== null && s.job.job.id === 'hole1') {
        if (s.time - t0 > 120) throw new Error(`push not done after 120 s, count ${s.job.count}`)
        if (s.time >= next) {
          hear(s, 'puskutraktori työnnä hiekka kuoppaan')
          next = s.time + 3
        }
        tick(s, DT)
        s.events.length = 0
      }
      expect(s.storyDone).toBe(1)
    })

    it('"puskutraktori aja sinne" said every 1.5 s does a push', () => {
      const s = scene('hole1', 2)
      const t0 = s.time
      let next = 0
      while (s.job !== null && s.job.job.id === 'hole1') {
        if (s.time - t0 > 120) throw new Error(`push not done after 120 s, count ${s.job.count}`)
        if (s.time >= next) {
          hear(s, s.active === 'dozer' ? 'aja sinne' : 'puskutraktori')
          next = s.time + SAY_EVERY
        }
        tick(s, DT)
        s.events.length = 0
      }
      expect(s.storyDone).toBe(1)
    })

    it('"puskutraktori nosta" lifts the blade and "laske" drops it', () => {
      const s = scene('hole1', 2)
      hear(s, 'puskutraktori')
      play(s, 2)
      hear(s, 'nosta')
      play(s, 2)
      expect(s.machines.dozer.bladeUp).toBe(true)
      hear(s, 'laske')
      expect(s.machines.dozer.bladeUp).toBe(false)
    })
  })

  describe('the roller', () => {
    it('"jyrä", then "jyrää" said again every 2.5 s, rolls the road', () => {
      const s = scene('rollMain', 0)
      hear(s, 'jyrä')
      play(s, 1)
      let said = 0
      const rolled = play(s, 40, (x) => {
        if (x.time - said >= 2.5) {
          hear(x, 'jyrää')
          said = x.time
        }
        return x.job === null || x.job.job.id !== 'rollMain' || x.job.count > 0.1
      })
      expect(kinds(rolled)).toContain('rolled')
      expect(s.job === null || s.job.job.id !== 'rollMain' || s.job.count > 0.1).toBe(true)
    })

    it('"jyrä aja sinne" goes to the road marker', () => {
      const s = scene('rollMain', 0)
      hear(s, 'jyrä aja sinne')
      const p = stepPointer(s)
      if (p === null) throw new Error('no marker')
      play(s, 25, (x) => dist(x.machines.roller, p) < 3)
      expect(dist(s.machines.roller, p)).toBeLessThan(4)
    })
  })

  describe('a word said twice, and a machine named as its own place', () => {
    it('"jyrä jyrää" in the road chapter rolls: it is the roller and its job, with no uhuh', () => {
      expect(parseBest(['jyrä jyrää'])).toEqual([expect.objectContaining({ who: 'roller', work: 'roll', to: null })])
      const s = scene('rollMain', 0)
      const events = heard(s, 'jyrä jyrää')
      expect(kinds(events)).toContain('ack')
      expect(kinds(events)).not.toContain('uhuh')
      expect(s.active).toBe('roller')
      expect(play(s, 40, (x) => x.job === null || x.job.job.id !== 'rollMain' || x.job.count > 0.1).map((e) => e.kind)).toContain('rolled')
    })

    it('a machine named as the place it is driven, with a job or a name, is ignored and not buzzed at', () => {
      const s = scene('rollMain', 0)
      for (const c of [{ who: 'roller', work: 'roll', to: 'roller' }, { who: 'roller', move: 'forward', to: 'roller' }, { work: 'roll', to: 'roller' }]) {
        s.active = 'roller'
        s.events.length = 0
        const none: Spoken = { who: null, move: null, work: null, to: null, come: false, honk: false, stop: false, help: false }
        say(s, { ...none, ...c } as Spoken, false)
        expect(kinds(s.events), JSON.stringify(c)).toContain('ack')
        expect(kinds(s.events), JSON.stringify(c)).not.toContain('uhuh')
      }
    })

    it('a machine named alone as the place it is driven still buzzes', () => {
      const s = scene('rollMain', 0)
      s.active = 'roller'
      s.events.length = 0
      say(s, { who: null, move: null, work: null, to: 'roller', come: false, honk: false, stop: false, help: false }, false)
      expect(kinds(s.events)).toEqual(['uhuh'])
    })

    it('"trukki nosta tukki" in the logs job names the forklift and the logs, and buzzes at nothing', () => {
      expect(parseBest(['trukki nosta tukki'])).toEqual([expect.objectContaining({ who: 'forklift', work: 'take', to: 'forest' })])
      const s = scene('logs', 0)
      const events = heard(s, 'trukki nosta tukki')
      expect(s.active).toBe('forklift')
      expect(kinds(events)).not.toContain('uhuh')
    })
  })

  describe('the mixer and the cranes', () => {
    it('"betoniauto aja veteen" goes to the water tower', () => {
      const s = scene('cement', 2)
      const events = heard(s, 'betoniauto aja veteen')
      expect(kinds(events)).toContain('ack')
      expect(s.active).toBe('mixer')
      play(s, 20, (x) => dist(x.machines.mixer, WATER_RING) < 3)
      expect(dist(s.machines.mixer, WATER_RING)).toBeLessThan(4)
    })

    it('"kaivuri kaiva hiekkaa betoniautoon" with the digger far from the sand goes to the sand first and fills the mixer', () => {
      const s = scene('cement', 0)
      const d = s.machines.digger
      expect(dist(d, { x: -16, z: 8 })).toBeGreaterThan(10)
      let next = 0
      play(s, 60, (x) => {
        if (x.time >= next) {
          hear(x, 'kaivuri kaiva hiekkaa betoniautoon')
          next = x.time + 3
        }
        return x.job === null || x.job.step !== 0
      })
      expect(s.job?.step).toBe(1)
      expect(dist(d, { x: -16, z: 8 })).toBeLessThan(4)
    })

    it('"betoniauto valaa" at the water tower takes the concrete to the form and fills it, nothing is poured on the lawn', () => {
      const s = scene('cement', 2)
      const m = s.machines.mixer
      expect(m.concrete).toBeGreaterThan(0.9)
      hear(s, 'betoniauto valaa')
      const events = play(s, 40, (x) => x.forms[0].fill > 0.3)
      expect(kinds(events)).toContain('pour')
      expect(s.forms[0].fill).toBeGreaterThan(0.3)
      expect(s.job?.step).toBe(2)
    })

    it('"nosturi nosta" picks a piece up and "laske" sets it down in the house', () => {
      const s = scene('walls', 0)
      play(s, 4)
      hear(s, 'nosturi')
      expect(s.active).toBe('tower')
      const b = s.builds[0]
      const placed = b.placed
      hear(s, 'nosta')
      play(s, 8)
      expect(s.machines.tower.holding).toBeGreaterThanOrEqual(0)
      hear(s, 'laske')
      play(s, 8)
      expect(b.placed).toBe(placed + 1)
    })

    it('"nosturi nosta talolle" and "nosturi laske" lift a piece into the house', () => {
      const s = scene('walls', 0)
      play(s, 4)
      hear(s, 'nosturi nosta')
      play(s, 8)
      expect(s.machines.tower.holding).toBeGreaterThanOrEqual(0)
      const placed = s.builds[0].placed
      hear(s, 'laske talolle')
      play(s, 8)
      expect(s.builds[0].placed).toBe(placed + 1)
    })

    it('"rekka aja metsään" drives the lorry to the forest ring', () => {
      const s = scene('logs', 0)
      play(s, 2)
      const events = heard(s, 'rekka aja metsään')
      expect(kinds(events)).toContain('ack')
      expect(s.active).toBe('semi')
      play(s, 40, (x) => x.job === null || x.job.step !== 0)
      expect(s.job?.step).toBeGreaterThan(0)
      expect(dist(s.machines.semi, FOREST_RING)).toBeLessThan(FOREST_RING.r + 1)
    })

    it('"trukki nosta" takes a brick and "laske" puts it down', () => {
      const s = scene('bricks', 3)
      play(s, 2)
      hear(s, 'trukki')
      play(s, 4)
      expect(s.active).toBe('forklift')
      const f = s.machines.forklift
      expect(dist(f, PALLET_RING)).toBeGreaterThan(0)
    })
  })

  describe('a machine the child names is the one that goes', () => {
    it('"kippiauto aja sinne" while the step is the dozer\'s hops to the truck and drives it to the marker, and the dozer stays', () => {
      const s = scene('hole1', 2)
      hear(s, 'kaivuri')
      play(s, 1)
      const p = stepPointer(s)
      if (p === null) throw new Error('no marker')
      expect(p.machine).toBe('dozer')
      const before = structuredClone(s.machines.dozer.goal)
      hear(s, 'kippiauto aja sinne')
      expect(s.active).toBe('dumper')
      const g = s.machines.dumper.goal
      if (g === null) throw new Error('the truck has no goal')
      expect(dist(g, p)).toBeLessThan(0.1)
      expect(s.machines.dozer.goal).toEqual(before)
      expect(s.machines.digger.goal).toBeNull()
    })

    it('"aja sinne" with no name hops to the step\'s machine first and drives it', () => {
      const s = scene('hole1', 2)
      hear(s, 'kaivuri')
      play(s, 1)
      const p = stepPointer(s)
      if (p === null) throw new Error('no marker')
      const truck = structuredClone(s.machines.dumper.goal)
      hear(s, 'aja sinne')
      expect(s.active).toBe('dozer')
      const g = s.machines.dozer.goal
      if (g === null) throw new Error('the dozer has no goal')
      expect(dist(g, p)).toBeLessThan(25)
      expect(s.machines.dumper.goal).toEqual(truck)
    })

    it('"kippiauto aja kuopalle" while the step is the dozer\'s drives the truck to the hole, and the dozer stays', () => {
      const s = scene('hole1', 2)
      hear(s, 'kaivuri')
      play(s, 1)
      const step = s.job?.job.steps[2]
      if (step === undefined || step.kind !== 'push') throw new Error('not the push step')
      const before = structuredClone(s.machines.dozer.goal)
      hear(s, 'kippiauto aja kuopalle')
      expect(s.active).toBe('dumper')
      const g = s.machines.dumper.goal
      if (g === null) throw new Error('the truck has no goal')
      expect(dist(g, step.hole)).toBeLessThan(0.1)
      expect(s.machines.dozer.goal).toEqual(before)
    })

    it('"kippiauto aja talolle" while the step is the crane\'s drives the truck to the house, and the crane stays', () => {
      const s = scene('walls', 0)
      expect(parseBest(['kippiauto aja talolle'])[0]).toMatchObject({ who: 'dumper', to: 'house' })
      const tower = structuredClone(s.machines.tower)
      hear(s, 'kippiauto aja talolle')
      expect(s.active).toBe('dumper')
      const g = s.machines.dumper.goal
      if (g === null) throw new Error('the truck has no goal')
      expect(dist(g, s.builds[0])).toBeLessThan(10)
      expect(s.machines.tower.goal).toEqual(tower.goal)
      expect(s.machines.tower.jib).toBe(tower.jib)
    })
  })

  describe('words a small child gets wrong', () => {
    it('says the machine names the way the plan lists them', () => {
      const names: [string, MachineKind][] = [
        ['kaivuri', 'digger'],
        ['kaivuli', 'digger'],
        ['kippiauto', 'dumper'],
        ['kippi auto', 'dumper'],
        ['puskutraktori', 'dozer'],
        ['pusku traktori', 'dozer'],
        ['jyrä', 'roller'],
        ['jylä', 'roller'],
        ['betoniauto', 'mixer'],
        ['trukki', 'forklift'],
        ['tlukki', 'forklift'],
        ['nosturi', 'tower'],
        ['rekka', 'semi'],
        ['lekka', 'semi'],
        ['auto nosturi', 'mobile'],
        ['autonosturi', 'mobile'],
      ]
      for (const [text, who] of names) {
        const clauses = parseBest([text])
        expect(clauses.map((c) => c.who), text).toEqual([who])
      }
    })
  })
})
