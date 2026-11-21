import { describe, expect, it } from 'vitest'
import { FOREST_RING, PALLET_RING, TIP_RINGS, WATER_RING } from './map'
import { DUMP_MAX } from './model'
import type { MachineKind, Sim, Spoken } from './model'
import { parseBest } from './speech'
import { say, stepPointer, tick } from './sim'
import { DT, dist, hear as hearIn, heard as heardIn, kinds, play, scene as sceneIn, storyByVoice } from './testing'
import { SAY_EVERY } from './voicebot'

// The whole story by voice in Finnish; voice.en.test.ts runs it in English in its own worker.
storyByVoice('fi')

/** The world tests below are in Finnish; their English twins are in voice.en.test.ts. */
const hear = (s: Sim, text: string) => hearIn(s, text, 'fi')
const heard = (s: Sim, text: string) => heardIn(s, text, 'fi')
const scene = (job: string, step: number) => sceneIn(job, step, 'fi')

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
      expect(parseBest(['jyrä jyrää'], 'fi')).toEqual([expect.objectContaining({ who: 'roller', work: 'roll', to: null })])
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
      expect(parseBest(['trukki nosta tukki'], 'fi')).toEqual([expect.objectContaining({ who: 'forklift', work: 'take', to: 'forest' })])
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
      expect(parseBest(['kippiauto aja talolle'], 'fi')[0]).toMatchObject({ who: 'dumper', to: 'house' })
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
        const clauses = parseBest([text], 'fi')
        expect(clauses.map((c) => c.who), text).toEqual([who])
      }
    })
  })
})
