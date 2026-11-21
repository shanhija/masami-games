import { describe, expect, it } from 'vitest'

import { TIP_RINGS } from './map'
import type { MachineKind } from './model'
import { parseBest } from './speech'
import { dist, hear, heard, kinds, play, scene, storyByVoice } from './testing'

// The whole story by voice in English, in its own worker beside the Finnish one (voice.test.ts).
storyByVoice('en')

/** Each sentence of the Finnish world tests (voice.test.ts) and its English twin: the same clauses, so the same world. */
const TWINS: [fi: string, en: string][] = [
  ['kaivuri kaiva hiekkaa', 'digger dig sand'],
  ['kaada kippiautoon', 'dump it in the dump truck'],
  ['Kaivuri, kaiva hiekkaa!', 'Digger, dig sand!'],
  ['kaivu ri kaiva hiekka', 'dig her dig sand'],
  ['KAIVURI KAIVA HIEKKAA', 'DIGGER DIG SAND'],
  ['kaivinkone kaivaa hiekkaa', 'excavator digging sand'],
  ['kaivuli kaiva hiekkaa', 'digga dig sand'],
  ['kaada', 'dump'],
  ['kaiva', 'dig'],
  ['kaiva kaiva', 'dig dig'],
  ['kippiauto aja kuopalle ja kippaa', 'dump truck drive to the hole and tip'],
  ['kippiauto kippaa kuoppaan', 'dump truck tip it in the hole'],
  ['kippiauto aja kuopalle', 'dump truck drive to the hole'],
  ['kaivuri', 'digger'],
  ['kippiauto tule tänne', 'dump truck come here'],
  ['tule tänne', 'come here'],
  ['seis', 'stop'],
  ['Seis!', 'Stop!'],
  ['ei ei ei', 'no no no'],
  ['odota', 'wait'],
  ['pysähdy', 'hold on'],
  ['tööt', 'honk'],
  ['Tuut tuut!', 'Beep beep!'],
  ['kippiauto', 'dump truck'],
  ['peruuta', 'back up'],
  ['vasemmalle', 'left'],
  ['aja oikealle', 'go right'],
  ['kippiauto vasemmalle', 'dump truck left'],
  ['alas', 'down'],
  ['kippaa', 'tip'],
  ['kippiauto aja metsään', 'dump truck go to the forest'],
  ['kaivuri kaiva', 'digger dig'],
  ['kaivuri kaiva hiekkaa ja kaada kippiautoon', 'digger dig sand and dump it in the dump truck'],
  ['kaivuri kaiva hiekkaa sitten kaada kippiautoon', 'digger dig sand then dump it in the dump truck'],
  ['kaivuri kaiva ja kaada', 'digger dig and dump'],
  ['kaiva hiekkaa kippiautoon', 'dig sand into the dump truck'],
  ['kaivinkone kaivaa hiekkaa kippiautoon', 'excavator digs sand into the dump truck'],
  ['apua', 'help'],
  ['nosturi', 'tower crane'],
  ['nosturi nosta', 'crane lift'],
  ['nosturi tule tänne', 'crane come here'],
  ['rekka', 'lorry'],
  ['jyrä', 'roller'],
  ['puskutraktori työnnä hiekka kuoppaan', 'bulldozer push the sand into the hole'],
  ['puskutraktori', 'bulldozer'],
  ['aja sinne', 'go there'],
  ['puskutraktori nosta', 'bulldozer lift'],
  ['nosta', 'lift'],
  ['laske', 'put it down'],
  ['jyrää', 'roll'],
  ['jyrä aja sinne', 'roller go there'],
  ['jyrä jyrää', 'roller roll'],
  ['trukki nosta tukki', 'forklift pick up the logs'],
  ['betoniauto aja veteen', 'cement mixer go to the water'],
  ['kaivuri kaiva hiekkaa betoniautoon', 'digger dig sand into the cement mixer'],
  ['betoniauto valaa', 'cement mixer pour'],
  ['nosturi nosta talolle', 'crane lift to the house'],
  ['laske talolle', 'put it down on the house'],
  ['rekka aja metsään', 'lorry drive to the forest'],
  ['trukki', 'forklift'],
  ['kippiauto aja sinne', 'dump truck go there'],
  ['kippiauto aja talolle', 'dump truck drive to the house'],
  // Words with no game in them.
  ['mä haluan jätskin', 'I want ice cream'],
  ['joo', 'yes'],
  ['kiitos', 'thank you'],
  ['mikä toi on', 'what is that'],
  ['hei hei', 'bye bye'],
  ['äiti katso', 'mummy look'],
  ['mulla on nälkä', 'I am hungry'],
  ['tämä on tosi hauskaa', 'this is so much fun'],
]

describe('every sentence of the Finnish world tests has an English twin that says the same', () => {
  it.each(TWINS)('%j is %j', (fi, en) => {
    expect(parseBest([en], 'en')).toEqual(parseBest([fi], 'fi'))
  })

  it('says the machine names a child says, and what a recognizer writes for them', () => {
    const names: [string, MachineKind][] = [
      ['digger', 'digger'],
      ['dig her', 'digger'],
      ['dump truck', 'dumper'],
      ['dumb truck', 'dumper'],
      ['bulldozer', 'dozer'],
      ['bull dozer', 'dozer'],
      ['roller', 'roller'],
      ['road roller', 'roller'],
      ['cement mixer', 'mixer'],
      ['forklift', 'forklift'],
      ['folk lift', 'forklift'],
      ['tower crane', 'tower'],
      ['lorry', 'semi'],
      ['laurie', 'semi'],
      ['truck crane', 'mobile'],
      ['mobile crane', 'mobile'],
    ]
    for (const [text, who] of names) expect(parseBest([text], 'en').map((c) => c.who), text).toEqual([who])
  })
})

describe('what a child says in English, and what it does in the world', () => {
  it('"digger dig sand" gets sand into the bucket, then "dump it in the dump truck" gets it into the truck', () => {
    const s = scene('hole1', 0, 'en')
    const events = [...heard(s, 'digger dig sand', 'en'), ...play(s, 4)]
    expect(kinds(events)).toContain('bite')
    expect(s.machines.digger.load.amount).toBeGreaterThan(1.5)
    const more = [...heard(s, 'dump it in the dump truck', 'en'), ...play(s, 6)]
    expect(kinds(more)).toContain('dump')
    expect(s.machines.dumper.load.amount).toBeGreaterThan(1.5)
    expect(s.active).toBe('digger')
  })

  it('"dump truck drive to the hole and tip" drives there and tips only on arrival', () => {
    const s = scene('hole1', 1, 'en')
    const d = s.machines.dumper
    hear(s, 'dump truck drive to the hole and tip', 'en')
    expect(s.active).toBe('dumper')
    play(s, 1)
    expect(d.bed).toBe(0)
    expect(dist(d, TIP_RINGS[0])).toBeGreaterThan(5)
    const events = play(s, 20, (x) => x.job === null || x.job.step !== 1)
    expect(kinds(events)).toContain('tip')
    expect(s.job?.step).toBe(2)
  })

  it('"stop" and a bare "no" stop a moving truck at once', () => {
    for (const text of ['stop', 'Stop!', 'no', 'no no no', 'wait', 'hold on']) {
      const s = scene('hole1', 1, 'en')
      hear(s, 'dump truck drive to the hole', 'en')
      play(s, 1.5)
      hear(s, text, 'en')
      expect(s.machines.dumper.goal, text).toBeNull()
    }
  })

  it('"get in the bulldozer" hops in and goes nowhere, "go to the digger" drives there', () => {
    const s = scene('hole1', 1, 'en')
    expect(kinds(heard(s, 'get in the bulldozer', 'en'))).toContain('hop')
    expect(s.active).toBe('dozer')
    expect(s.machines.dozer.goal).toBeNull()
    hear(s, 'go to the digger', 'en')
    play(s, 15, (x) => dist(x.machines.dozer, x.machines.digger) < 8)
    expect(dist(s.machines.dozer, s.machines.digger)).toBeLessThan(8)
  })

  it('"crane pick it up" lifts a piece and "put it down" sets it in the house', () => {
    const s = scene('walls', 0, 'en')
    play(s, 4)
    const placed = s.builds[0].placed
    hear(s, 'crane pick it up', 'en')
    expect(s.active).toBe('tower')
    play(s, 8)
    expect(s.machines.tower.holding).toBeGreaterThanOrEqual(0)
    hear(s, 'put it down', 'en')
    play(s, 8)
    expect(s.builds[0].placed).toBe(placed + 1)
  })

  it('a sentence with no game words does nothing at all', () => {
    for (const text of ['I want ice cream', 'yes', 'thank you', 'what is that', 'bye bye', 'mummy look', 'I am hungry', 'this is so much fun', 'I saw a bird', 'I don’t know', 'let’s play']) {
      const s = scene('hole1', 0, 'en')
      const at = JSON.stringify(Object.values(s.machines).map((m) => [m.x, m.z, m.goal]))
      expect(heard(s, text, 'en'), text).toEqual([])
      expect(JSON.stringify(Object.values(s.machines).map((m) => [m.x, m.z, m.goal])), text).toBe(at)
    }
  })
})
