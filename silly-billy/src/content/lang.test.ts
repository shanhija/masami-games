/**
 * The game in both languages: every basic verb (and its little shrugs) and every reaction is
 * played the same way in a Finnish and an English world, and each line it says differs between
 * the two but for the child's own words, numbers and the few sounds both languages write alike;
 * the starting avatars are called by the language's names, and a name the child gives stays
 * across a switch.
 */

import { describe, expect, it } from 'vitest'

import { actorNamed } from '../brain/parse'
import { useLang, type Lang } from '../engine/lang'
import { Library } from '../engine/library'
import { createWorld, Sim, type Reaction } from '../engine/sim'
import type { Step } from '../engine/types'
import { BASIC_VERBS, BUILTIN_ACTIONS, BUILTIN_ITEMS, LAYOUTS, makeCast } from '.'

const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })

/** Sounds both languages write alike. */
const ALIKE = new Set(['Hmm?', 'Hmm...', 'Zzz...'])

interface Turn {
  who: string
  action: string
  args?: Record<string, string>
}

/** A little story: steps given one after another, each once the one before has ended, or a reaction; with only some of the cast, or in a room with nothing in it. */
interface Case {
  label: string
  turns: Turn[]
  react?: { who: string; kind: Reaction }
  only?: string[]
  bare?: boolean
  /** The child's own words, said as they are in both languages. */
  words?: string
}

interface Line {
  frame: number
  who: string
  text: string
}

const A = 'alice'
const S = 'steve'
const CAT = 'mirri'
const times = (n: number, turn: Turn): Turn[] => Array.from({ length: n }, () => turn)

const CASES: Case[] = [
  { label: 'walk', turns: [{ who: A, action: 'walk', args: { to: '3,-2' } }] },
  { label: 'run', turns: [{ who: A, action: 'run', args: { to: 'slide' } }] },
  { label: 'come', turns: [{ who: A, action: 'come' }] },
  { label: 'come, the cat', turns: [{ who: CAT, action: 'come' }] },
  { label: 'pick up, twice', turns: times(2, { who: A, action: 'pick-up', args: { thing: 'ball' } }) },
  { label: 'pick up from someone', turns: [{ who: S, action: 'pick-up', args: { thing: 'ball' } }, { who: A, action: 'pick-up', args: { thing: 'ball' } }] },
  { label: 'pick up a slide', turns: [{ who: A, action: 'pick-up', args: { thing: 'slide' } }] },
  { label: 'pick up nothing', turns: [{ who: A, action: 'pick-up' }], bare: true },
  { label: 'drop', turns: [{ who: A, action: 'pick-up', args: { thing: 'ball' } }, { who: A, action: 'drop', args: { thing: 'ball' } }] },
  { label: 'drop nothing', turns: [{ who: A, action: 'drop' }] },
  { label: 'give', turns: [{ who: A, action: 'give', args: { thing: 'ball', to: S } }] },
  { label: 'give to me', turns: [{ who: A, action: 'give', args: { thing: 'ball', to: A } }] },
  { label: 'give nothing', turns: [{ who: A, action: 'give', args: { to: S } }] },
  { label: 'jump', turns: [{ who: A, action: 'jump', args: { times: '2' } }] },
  { label: 'wave', turns: [{ who: A, action: 'wave', args: { to: S } }] },
  { label: 'wave, the cat', turns: [{ who: CAT, action: 'wave' }] },
  { label: 'sit', turns: [{ who: A, action: 'sit', args: { on: 'bench' } }] },
  { label: 'sleep', turns: [{ who: A, action: 'sleep' }] },
  { label: 'spin', turns: [{ who: A, action: 'spin' }] },
  { label: 'say', turns: [{ who: A, action: 'say', args: { words: 'hello' } }], words: 'hello' },
  { label: 'follow', turns: [{ who: A, action: 'follow', args: { who: S } }] },
  { label: 'follow myself', turns: [{ who: A, action: 'follow', args: { who: A } }] },
  { label: 'follow nobody', turns: [{ who: A, action: 'follow' }], only: [A] },
  { label: 'look at a thing', turns: [{ who: A, action: 'look', args: { at: 'slide' } }] },
  { label: 'look at someone', turns: [{ who: A, action: 'look', args: { at: S } }] },
  { label: 'look around', turns: [{ who: A, action: 'look' }] },
  { label: 'make', turns: [{ who: A, action: 'make', args: { thing: 'ball', color: 'sininen' } }] },
  { label: 'make nothing', turns: [{ who: A, action: 'make' }] },
  { label: 'remove', turns: [{ who: A, action: 'remove', args: { thing: 'flowers' } }] },
  { label: 'remove nothing', turns: [{ who: A, action: 'remove' }] },
  { label: 'wear', turns: [{ who: A, action: 'wear', args: { thing: 'cap', color: 'pink' } }] },
  { label: 'wear nothing', turns: [{ who: A, action: 'wear' }] },
  { label: 'take off', turns: [{ who: S, action: 'take-off', args: { thing: 'cap' } }] },
  { label: 'take off nothing', turns: [{ who: CAT, action: 'take-off' }] },
  { label: 'paint someone', turns: [{ who: A, action: 'paint', args: { color: 'punaiseksi', thing: S } }] },
  { label: 'paint myself', turns: [{ who: A, action: 'paint', args: { color: 'red' } }] },
  { label: 'paint a thing', turns: [{ who: A, action: 'paint', args: { color: 'red', thing: 'ball' } }] },
  { label: 'paint without a colour', turns: [{ who: A, action: 'paint' }] },
  { label: 'grow, as big as can be', turns: times(5, { who: A, action: 'grow' }) },
  { label: 'shrink, as small as can be', turns: times(4, { who: A, action: 'shrink' }) },
  { label: 'grow and shrink a thing', turns: [{ who: A, action: 'grow', args: { thing: 'ball' } }, { who: A, action: 'shrink', args: { thing: 'ball' } }] },
  { label: 'rename', turns: [{ who: A, action: 'rename', args: { name: 'pupu' } }] },
  { label: 'rename someone', turns: [{ who: A, action: 'rename', args: { name: 'pupu', who: S } }] },
  { label: 'rename without a name', turns: [{ who: A, action: 'rename' }] },
  ...(['shrug', 'huh', 'yay', 'hello', 'think'] as const).map((kind): Case => ({ label: `the ${kind} reaction`, turns: [], react: { who: A, kind } })),
]

/** Plays a case in a fresh world in `lang` and gives every line shown, in order: when, who, what. */
function linesOf(lang: Lang, c: Case): Line[] {
  const actors = makeCast(lang).filter((a) => c.only === undefined || c.only.includes(a.id))
  const layouts = c.bare === true ? { playground: [], pool: [], forest: [] } : LAYOUTS
  const sim = new Sim(createWorld({ room: 'playground', actors, layouts, seed: 7, lang }), library)
  const lines: Line[] = []
  const shown = new Map<string, unknown>()
  let frame = 0
  const step = () => {
    sim.step()
    frame++
    for (const a of sim.world.actors) {
      if (a.bubble !== null && a.bubble !== shown.get(a.id)) lines.push({ frame, who: a.id, text: a.bubble.text })
      shown.set(a.id, a.bubble)
    }
    const ended = sim.world.events.flatMap((e) => (e.type === 'done' || e.type === 'failed' ? [e] : []))
    sim.world.events.length = 0
    sim.world.sounds.length = 0
    sim.world.speech.length = 0
    return ended
  }
  if (c.react !== undefined) {
    sim.react(c.react.who, c.react.kind)
    for (let f = 0; f < 60 * 3; f++) step()
  }
  c.turns.forEach((turn, i) => {
    const s: Step = { action: turn.action, args: turn.args ?? {}, serial: i + 1 }
    sim.give(turn.who, [s], true)
    let end: string | null = null
    for (let f = 0; f < 60 * 40 && end === null; f++) end = step().find((e) => e.actor === turn.who && e.step.serial === s.serial)?.type ?? null
    expect(end, `${c.label} in ${lang}: ${turn.who} ${turn.action}`).toBe('done')
  })
  return lines
}

const seen: Record<Lang, Set<string>> = { en: new Set(), fi: new Set() }
const played = new Map<string, Record<Lang, string[]>>()

describe('every line in both languages', () => {
  it('has a story for every basic verb', () => {
    expect([...new Set(CASES.flatMap((c) => c.turns.map((t) => t.action)))].sort()).toEqual(BASIC_VERBS.map((a) => a.id).sort())
  })

  for (const c of CASES) {
    it(`${c.label}: the same story, every line in the game’s language`, () => {
      const en = linesOf('en', c)
      const fi = linesOf('fi', c)
      expect(fi.map((l) => `${l.frame} ${l.who}`), 'the same lines at the same moments').toEqual(en.map((l) => `${l.frame} ${l.who}`))
      en.forEach((e, i) => {
        const f = fi[i]!
        if (e.text === f.text) expect(ALIKE.has(e.text) || e.text === c.words || /^[\d\s.,!?]+$/.test(e.text), `"${e.text}" is the same in English and Finnish`).toBe(true)
      })
      for (const l of [...en, ...fi]) expect(l.text).not.toMatch(/[–—]/)
      for (const l of en) seen.en.add(l.text)
      for (const l of fi) seen.fi.add(l.text)
      played.set(c.label, { en: en.map((l) => l.text), fi: fi.map((l) => l.text) })
    })
  }

  it('says these, for example', () => {
    const says = (label: string, en: string, fi: string) => {
      expect(played.get(label)?.en, label).toContain(en)
      expect(played.get(label)?.fi, label).toContain(fi)
    }
    says('give', 'For you!', 'Sinulle!')
    says('wave', 'Hi Steve!', 'Hei Eetu!')
    says('look at a thing', 'Slide!', 'Liukumäki!')
    says('pick up a slide', 'Too big!', 'Liian iso!')
    says('rename', 'I am Pupu!', 'Olen Pupu!')
    says('wave, the cat', 'Meow!', 'Miau!')
    says('grow, as big as can be', 'Big enough!', 'Tarpeeksi iso!')
    says('the huh reaction', 'Huh?', 'Häh?')
    says('the hello reaction', 'Hi!', 'Hei!')
    says('say', 'hello', 'hello')
    // Many different lines in each language (each story picks one of a verb's few), and the Finnish ones are not the English ones.
    expect(seen.en.size).toBeGreaterThan(40)
    expect(seen.fi.size).toBeGreaterThan(40)
    expect([...seen.fi].filter((t) => seen.en.has(t)).sort()).toEqual(['Hmm...', 'Hmm?', 'Zzz...', 'hello'])
  })
})

describe('the starting avatars', () => {
  const finnishSim = () => new Sim(createWorld({ room: 'playground', actors: makeCast('fi'), layouts: LAYOUTS, seed: 7, lang: 'fi' }), library)
  const runStep = (sim: Sim, who: string, action: string, args: Record<string, string>) => {
    sim.give(who, [{ action, args, serial: 1 }], true)
    for (let f = 0; f < 60 * 20; f++) {
      sim.step()
      const done = sim.world.events.some((e) => e.type === 'done' && e.actor === who)
      sim.world.events.length = 0
      if (done) return
    }
    throw new Error(`${who} did not finish ${action}`)
  }

  it('are called by the language’s names, and keep a name the child gave across a switch', () => {
    const sim = finnishSim()
    const names = () => sim.world.actors.map((a) => a.name)
    expect(names()).toEqual(['Aino', 'Eetu', 'Mikko', 'Noora', 'Mirri'])
    runStep(sim, 'alice', 'rename', { name: 'pupu', who: 'steve' })
    expect(names()).toEqual(['Aino', 'Pupu', 'Mikko', 'Noora', 'Mirri'])
    useLang(sim.world, 'en')
    expect(names()).toEqual(['Alice', 'Pupu', 'Mike', 'Nora', 'Luna'])
    expect(['pupu', 'alis', 'stiivi', 'luna', 'kissa', 'nora'].map((w) => actorNamed(w, sim.world))).toEqual(['steve', 'alice', null, 'mirri', 'mirri', 'noora'])
    useLang(sim.world, 'fi')
    expect(names()).toEqual(['Aino', 'Pupu', 'Mikko', 'Noora', 'Mirri'])
    expect(['pupulle', 'mikolle', 'ainolle', 'kisu'].map((w) => actorNamed(w, sim.world))).toEqual(['steve', 'mike', 'alice', 'mirri'])
  })

  it('show what is said next in the new language when it is switched mid-game', () => {
    const sim = finnishSim()
    runStep(sim, 'alice', 'give', { thing: 'ball', to: 'steve' })
    expect(sim.world.actors.find((a) => a.id === 'steve')!.bubble?.text).toMatch(/^(Kiitos!|Kiitti!|Jee!)$/)
    useLang(sim.world, 'en')
    // A line already showing stays; the next one is English, with the English names.
    runStep(sim, 'steve', 'wave', { to: 'alice' })
    expect(sim.world.actors.find((a) => a.id === 'steve')!.bubble?.text).toBe('Hi Alice!')
  })
})
