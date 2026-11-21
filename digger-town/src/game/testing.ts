/**
 * What the voice tests share: a fresh story, stepping the sim, the voice bot talking until
 * something holds, and the runs through the story by voice that each language must pass, the
 * bot's, a child's who says whole sentences and the truck crane's (`voice.test.ts` runs them in
 * Finnish, `voice.en.test.ts` in English, each in its own worker).
 */
import { describe, expect, it } from 'vitest'

import type { Lang, Words } from '../../../profiles/src/lang'
import { FOREST_RING, MOBILE_PARK } from './map'
import type { Sim, SimEvent, Spoken } from './model'
import { STORY } from './jobs'
import { parseBest } from './speech'
import { createSim, say, tick } from './sim'
import { SAY_EVERY, createVoiceBot, voiceFrame } from './voicebot'
import type { VoiceBot } from './voicebot'

export const DT = 1 / 30

export const fresh = (storyDone = 0) => createSim({ storyDone, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })

/** One utterance as the game hears it: the first clause starts a breath, the rest are in the same breath. */
export function hear(s: Sim, text: string, lang: Lang): Spoken[] {
  const clauses = parseBest([text], lang)
  clauses.forEach((c, i) => say(s, c, i > 0))
  return clauses
}

/** Steps the sim for `seconds` and returns the events that happened; `then` may stop it early by returning true. */
export function play(s: Sim, seconds: number, then: (s: Sim) => boolean = () => false): SimEvent[] {
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
export function heard(s: Sim, text: string, lang: Lang): SimEvent[] {
  s.events.length = 0
  hear(s, text, lang)
  const events = [...s.events]
  s.events.length = 0
  return events
}

export const kinds = (events: SimEvent[]) => events.map((e) => e.kind)
export const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z)

/** Steps with the voice bot until `until` holds; throws past `cap` seconds. Returns the seconds it took. */
export function talkUntil(s: Sim, bot: VoiceBot, until: (s: Sim) => boolean, cap: number): number {
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
export function scene(job: string, step: number, lang: Lang): Sim {
  const key = `${job}:${step}:${lang}`
  let s = scenes.get(key)
  if (s === undefined) {
    const sim = fresh()
    const bot = createVoiceBot(lang)
    talkUntil(sim, bot, (x) => x.job !== null && x.job.job.id === job && x.job.step === step, 900)
    scenes.set(key, sim)
    s = sim
  }
  return structuredClone(s)
}

/** What a child who talks in whole sentences says at each step of the story. */
function sentenceAt(s: Sim): Words | null {
  if (s.job === null) return null
  const step = s.job.job.steps[s.job.step]
  switch (step.kind) {
    case 'scoop':
      switch (step.into) {
        case 'dumper':
          return { fi: 'kaivuri kaiva hiekkaa kippiautoon', en: 'digger dig sand into the dump truck' }
        case 'mixer':
          return { fi: 'kaivuri kaiva hiekkaa betoniautoon', en: 'digger dig sand into the cement mixer' }
        case 'crusher':
          return { fi: 'kaivuri kaiva kiviä murskaan', en: 'digger dig rocks into the crusher' }
        default:
          return { fi: 'kaivuri kaiva hiekkaa tiilikoneeseen', en: 'digger dig sand into the brick machine' }
      }
    case 'digOut':
      return { fi: 'kaivuri kaiva kuoppaa', en: 'digger dig a hole' }
    case 'tip':
      return { fi: 'kippiauto kippaa kuoppaan', en: 'dump truck tip it in the hole' }
    case 'feed':
      return { fi: 'kippiauto kippaa tiilikoneeseen', en: 'dump truck tip it into the brick machine' }
    case 'push':
      return { fi: 'puskutraktori työnnä hiekka kuoppaan', en: 'bulldozer push the sand into the hole' }
    case 'clear':
      return { fi: 'puskutraktori työnnä', en: 'bulldozer push' }
    case 'roll':
      return { fi: 'jyrä jyrää tietä', en: 'roller roll the road' }
    case 'water':
      return { fi: 'betoniauto aja veteen', en: 'cement mixer go to the water' }
    case 'pour':
      return { fi: 'betoniauto valaa', en: 'cement mixer pour' }
    case 'carry':
      return s.machines.forklift.holding >= 0 ? { fi: 'trukki laske', en: 'forklift put it down' } : { fi: 'trukki nosta', en: 'forklift pick it up' }
    case 'lift': {
      const holding = s.machines[step.crane].holding >= 0
      if (step.crane === 'tower') return holding ? { fi: 'nosturi laske', en: 'tower crane put it down' } : { fi: 'nosturi nosta', en: 'tower crane pick it up' }
      return holding ? { fi: 'autonosturi laske', en: 'truck crane put it down' } : { fi: 'autonosturi nosta', en: 'truck crane pick it up' }
    }
    case 'drive':
      return step.ring === FOREST_RING ? { fi: 'rekka aja metsään', en: 'lorry go to the forest' } : { fi: 'rekka aja sahalle', en: 'lorry go to the sawmill' }
    case 'unload':
      return { fi: 'rekka pura', en: 'lorry unload' }
    case 'watch':
      return null
  }
}

/** The truck crane's words: its name, and with it picking up and putting down. */
const CRANE = {
  name: { fi: 'autonosturi', en: 'truck crane' },
  take: { fi: 'nosta', en: 'pick it up' },
  give: { fi: 'laske', en: 'put it down' },
  nameTake: { fi: 'autonosturi nosta', en: 'truck crane pick it up' },
  nameGive: { fi: 'autonosturi laske', en: 'truck crane put it down' },
} as const

/** The story played by voice in `lang`: the voice bot inside the pars, a child's whole sentences, and the truck crane from anywhere. */
export function storyByVoice(lang: Lang): void {
  describe('the voice bot plays by talking only', () => {
    it('says one short sentence at most every 1.5 s, from words the parser knows', () => {
      const s = fresh()
      const bot = createVoiceBot(lang)
      talkUntil(s, bot, (x) => x.storyDone > 0, STORY[0].par)
      expect(bot.said.length).toBeGreaterThan(10)
      for (let i = 1; i < bot.said.length; i++) expect(bot.said[i].at - bot.said[i - 1].at).toBeGreaterThanOrEqual(SAY_EVERY - 1e-6)
      for (const { text } of bot.said) {
        expect(text.split(' ').length, text).toBeLessThanOrEqual(2)
        expect(parseBest([text], lang).length, text).toBeGreaterThan(0)
      }
    })

    it('does the road chapter and the first two jobs of the house, each inside its par', () => {
      const s = fresh()
      const bot = createVoiceBot(lang)
      for (let i = 0; i < 5; i++) {
        const job = STORY[i]
        const t = talkJob(s, bot, i, job.par)
        expect(t, job.id).toBeLessThanOrEqual(job.par)
      }
      expect(s.storyDone).toBe(5)
    })

    it('does the whole story, every job inside two stars', () => {
      const s = fresh()
      const bot = createVoiceBot(lang)
      for (let i = 0; i < STORY.length; i++) {
        const job = STORY[i]
        const t = talkJob(s, bot, i, 2 * job.par)
        expect(t, job.id).toBeLessThanOrEqual(2 * job.par)
      }
      expect(s.storyDone).toBe(STORY.length)
    }, 60000)
  })

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
            hear(s, text[lang], lang)
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
    /** The span job with the truck crane set down at `x`, `z` facing `yaw` with its legs down, and a child who says its name and "pick it up" when it holds nothing and "put it down" when it holds a piece, every 3 s. Returns the seconds the three pieces took, the pieces placed. */
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
      hear(s, CRANE.name[lang], lang)
      const t0 = s.time
      let next = 0
      while (s.storyDone <= i && s.time - t0 < 150) {
        if (s.time >= next) {
          hear(s, (m.holding >= 0 ? CRANE.nameGive : CRANE.nameTake)[lang], lang)
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

    it('"put it down" with the piece the span needs puts it on the next open spot, not back where it was picked up', () => {
      const i = STORY.findIndex((j) => j.id === 'span')
      const s = fresh(i)
      while (s.job === null) tick(s, DT)
      hear(s, CRANE.name[lang], lang)
      hear(s, CRANE.take[lang], lang)
      play(s, 40, (o) => o.machines.mobile.holding >= 0 && o.machines.mobile.seq === 'rest')
      const m = s.machines.mobile
      expect(m.holding).toBeGreaterThanOrEqual(0)
      const picked = s.things.find((t) => t.id === m.holding)!
      const at = { x: picked.x, z: picked.z }
      hear(s, CRANE.give[lang], lang)
      play(s, 40, (o) => o.builds[1].placed > 0)
      expect(s.builds[1].placed).toBe(1)
      expect(dist(picked, at)).toBeGreaterThan(3)
    })
  })
}
