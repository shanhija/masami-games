/**
 * The engine in both languages: bubbles, spoken lines, reactions and the words of a shrug show
 * the game's language, picked when they are said; things are named in it; the starting avatars
 * are called by its names, and a name made code gives stays in both.
 */
import { describe, expect, it } from 'vitest'

import { useLang, type CastNames } from './lang'
import { createWorld, newActor, Sim } from './sim'
import { actionEntry, kidLook, makeSim, newLibrary, run, step } from './testing'

const actor = (sim: Sim, id: string) => sim.world.actors.find((a) => a.id === id)!
const words = [{ name: 'words', kind: 'text' as const, about: '', optional: true }]
const thing = [{ name: 'thing', kind: 'item' as const, about: '', optional: true }]

/** Plays made code once as alice and gives what her bubble shows. */
function said(sim: Sim, code: string, args: Record<string, string> = {}): string | null {
  const id = `line${sim.world.frame}`
  expect(sim.library.addAction(actionEntry(id, [...words, ...thing], `__g();${code}\nyield`))).toEqual({ ok: true })
  sim.give('alice', [step(id, args)], true)
  run(sim, 0.1)
  return actor(sim, 'alice').bubble?.text ?? null
}

describe('words in the game’s language', () => {
  it('shows { en, fi } in the game’s language, picked when it is said', () => {
    const sim = makeSim({ lang: 'fi' })
    expect(said(sim, "me.say({ en: 'Wheee!', fi: 'Jee!' })")).toBe('Jee!')
    useLang(sim.world, 'en')
    expect(actor(sim, 'alice').bubble?.text).toBe('Jee!')
    expect(said(sim, "me.say({ en: 'Wheee!', fi: 'Jee!' })")).toBe('Wheee!')
  })

  it('shows a plain string as it is in both, the other language when one is missing, and nothing for what is not words', () => {
    for (const lang of ['fi', 'en'] as const) {
      const sim = makeSim({ lang })
      expect(said(sim, "me.say('Pupu')")).toBe('Pupu')
      expect(said(sim, 'me.say(7)')).toBe('7')
      expect(said(sim, 'me.say(args.words)', { words: 'hei kaikki' })).toBe('hei kaikki')
      expect(said(sim, "me.say({ en: 'Only English' })")).toBe('Only English')
      expect(said(sim, "me.say({ fi: 'Vain suomeksi' })")).toBe('Vain suomeksi')
      expect(said(sim, "me.say({ en: '', fi: '' })")).toBeNull()
      expect(said(sim, 'me.say({ x: 1 })')).toBeNull()
      expect(said(sim, 'me.say(args.thing)', { thing: 'ball' })).toBeNull()
      expect(said(sim, 'me.say(null)')).toBeNull()
    }
  })

  it('speaks { en, fi } aloud in the game’s language, and the child’s own words as they are', () => {
    for (const [lang, line] of [['fi', 'Moikka!'], ['en', 'Hello!']] as const) {
      const sim = makeSim({ lang })
      expect(sim.library.addAction(actionEntry('greet', words, "__g();me.speak({ en: 'Hello!', fi: 'Moikka!' })\nyield\nme.speak(args.words)\nyield"))).toEqual({ ok: true })
      sim.give('alice', [step('greet', { words: 'hei hei' })], true)
      const spoken: string[] = []
      run(sim, 0.2, () => {
        spoken.push(...sim.world.speech.map((s) => s.text))
        sim.world.speech.length = 0
      })
      expect(spoken, lang).toEqual([line, 'hei hei'])
    }
  })

  it('plays the reactions in the game’s language', () => {
    const lines = (lang: 'fi' | 'en') =>
      (['huh', 'yay', 'hello', 'shrug', 'think'] as const).map((kind) => {
        const sim = makeSim({ lang })
        sim.react('alice', kind)
        run(sim, 0.1)
        return actor(sim, 'alice').bubble?.text
      })
    expect(lines('fi')).toEqual(['Häh?', 'Jee!', 'Hei!', 'Hmm?', 'Hmm...'])
    expect(lines('en')).toEqual(['Huh?', 'Yay!', 'Hi!', 'Hmm?', 'Hmm...'])
  })

  it('says what cannot be done in the game’s language', () => {
    for (const [lang, line] of [['fi', 'Liian iso!'], ['en', 'Too big!']] as const) {
      const sim = makeSim({ lang, layouts: { playground: [{ kind: 'bench', x: 1.5, z: 4, fixed: true }] } })
      sim.give('alice', [step('pick-up', { thing: 'bench' })], true)
      let shown: string | undefined
      run(sim, 3, () => {
        shown ??= actor(sim, 'alice').bubble?.text
      })
      expect(shown, lang).toBe(line)
    }
  })

  it('names a thing in the game’s language, and a kind nobody made by its own word', () => {
    const sim = makeSim({ lang: 'fi', layouts: { playground: [{ kind: 'ball', x: 2, z: 2 }] } })
    expect(said(sim, "me.say(args.thing.name + '!')", { thing: 'ball' })).toBe('pallo!')
    expect(said(sim, "me.say(w.make('unicorn').name)")).toBe('unicorn')
    useLang(sim.world, 'en')
    expect(said(sim, "me.say(args.thing.name + '!')", { thing: 'ball' })).toBe('ball!')
    // Code finds a thing by its Finnish name too.
    expect(said(sim, "me.say(w.find('pallo') ? 'yes' : 'no')")).toBe('yes')
  })
})

describe('names in the game’s language', () => {
  const NAMES: CastNames = { fi: { name: 'Aino', calls: ['aino', 'ainoo'] }, en: { name: 'Alice', calls: ['alice', 'alis'] } }
  const world = (lang: 'fi' | 'en') =>
    createWorld({
      room: 'playground',
      actors: [
        newActor({ id: 'alice', name: 'Alice', calls: ['alice', 'alis'], names: NAMES, pronoun: 'she', look: kidLook('#9b5fd3'), x: 0, z: 0 }),
        newActor({ id: 'ella', name: 'Ella', calls: ['ella'], pronoun: 'she', look: kidLook('#f5a13b'), x: 0, z: 0 }),
      ],
      layouts: { playground: [], pool: [], forest: [] },
      seed: 1,
      lang,
    })

  it('makes worlds in English unless told otherwise, and a starting avatar takes the language’s name and calls', () => {
    expect(createWorld({ room: 'playground', actors: [], layouts: { playground: [], pool: [], forest: [] }, seed: 1 }).lang).toBe('en')
    const w = world('fi')
    expect(w.lang).toBe('fi')
    const [alice, ella] = w.actors
    expect([alice!.name, alice!.calls]).toEqual(['Aino', ['aino', 'ainoo', 'alice']])
    expect(ella!.names).toBeNull()
    useLang(w, 'en')
    expect([alice!.name, alice!.calls]).toEqual(['Alice', ['alice', 'alis']])
    expect([ella!.name, ella!.calls]).toEqual(['Ella', ['ella']])
  })

  it('keeps a name made code gives in both languages, and renaming to the name it has changes nothing', () => {
    const sim = new Sim(world('fi'), newLibrary())
    expect(sim.library.addAction(actionEntry('rename', words, '__g();me.name = args.words\nyield'))).toEqual({ ok: true })
    sim.give('alice', [step('rename', { words: 'aino' })], true)
    run(sim, 0.1)
    expect(actor(sim, 'alice').names).toEqual(NAMES)
    sim.give('alice', [step('rename', { words: 'Pupu' })], true)
    run(sim, 0.1)
    const alice = actor(sim, 'alice')
    expect([alice.name, alice.names, alice.calls]).toEqual(['Pupu', null, ['aino', 'ainoo', 'alice', 'pupu']])
    useLang(sim.world, 'en')
    expect(alice.name).toBe('Pupu')
    useLang(sim.world, 'fi')
    expect(alice.name).toBe('Pupu')
  })
})
