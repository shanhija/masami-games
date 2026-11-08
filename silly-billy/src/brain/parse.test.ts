/**
 * The small parser on what six-year-olds say and what recognizers write for it: misheard
 * names, Finnish endings and verb forms, "hän" and "kaikki", stop words and room changes; and
 * the sentences it must not be sure of, which go to the interpreter.
 */
import { describe, expect, it } from 'vitest'

import { meansTheSame, normalise, phraseKey, understand, type Understood } from './parse'
import { testActor, testCast, testVocabulary, testWorld } from './testing'

const vocab = testVocabulary()
const world = testWorld(testCast())
const hear = (words: string, addressee: string | null = null) => understand(words, vocab, world, addressee)

/** The plan of a sure understanding, failing with what was understood otherwise. */
function sure(u: Understood) {
  if (u.kind !== 'plan' || !u.confident) throw new Error(`not sure: ${JSON.stringify(u)}`)
  return u.plan
}

function unsure(u: Understood) {
  if (u.kind !== 'plan' || u.confident) throw new Error(`sure after all: ${JSON.stringify(u)}`)
  return u.plan
}

describe('normalise and the phrase key', () => {
  it('lowercases, drops punctuation and writes numbers as digits', () => {
    expect(normalise('Alice, heitä PALLO Stevelle!!')).toBe('alice heitä pallo stevelle')
    expect(normalise('  Hyppää   kolme kertaa ')).toBe('hyppää 3 kertaa')
    expect(normalise('uima-allas')).toBe('uima allas')
    expect(normalise("Steve's ball")).toBe('steves ball')
    expect(normalise('')).toBe('')
    expect(normalise('Hyppa\u0308a\u0308 kolme kertaa')).toBe('hyppää 3 kertaa')
  })

  it('leaves fillers out of the key', () => {
    expect(phraseKey('No niin, Alice hyppää. Kiitos!')).toBe('alice hyppää')
    expect(phraseKey('alice hyppää')).toBe(phraseKey('Alice... hyppää nyt'))
  })

  it('"kuusi" is six only before "kertaa": elsewhere it is a spruce', () => {
    expect(normalise('Alice, hyppää kuusi kertaa')).toBe('alice hyppää 6 kertaa')
    expect(normalise('kuus kertaa')).toBe('6 kertaa')
    expect(normalise('mene kuusen luo')).toBe('mene kuusen luo')
    expect(normalise('hyppää kuusi')).toBe('hyppää kuusi')
  })

  it('words that point at someone only the moment knows do not mean the same next time', () => {
    expect(meansTheSame('Alice heitä pallo Stevelle')).toBe(true)
    for (const words of [
      'alice heitä pallo hänelle', 'anna se stevelle', 'kaikki tanssii', 'noora anna pallo kaikille', 'steve, give her the ball',
      'alice vilkuta heille', 'alice anna pallo heille', 'alice heitä pallo toiselle', 'mike anna pallo molemmille', 'noora vilkuta noille',
      'steve anna pallo näille', 'alice halaa toista', 'alice give the ball to the other one', 'steve wave to both',
    ]) expect(meansTheSame(words), words).toBe(false)
  })
})

describe('understanding misheard Finnish', () => {
  it('"alis hyppää": a misheard Alice jumps', () => {
    const plan = sure(hear('alis hyppää'))
    expect(plan.who).toEqual(['alice'])
    expect(plan.steps).toEqual([{ who: 'alice', action: 'jump', args: [] }])
  })

  it('"stiivi juokse puun luo": Steve runs to the tree', () => {
    expect(sure(hear('Stiivi, juokse puun luo!')).steps).toEqual([{ who: 'steve', action: 'run', args: [{ name: 'to', value: 'tree' }] }])
  })

  it('"kaikki pyörikää": everybody spins', () => {
    const plan = sure(hear('kaikki pyörikää'))
    expect(plan.who).toEqual(['alice', 'steve', 'mike', 'noora', 'mirri'])
    expect(plan.steps.map((s) => `${s.who} ${s.action}`)).toEqual(['alice spin', 'steve spin', 'mike spin', 'noora spin', 'mirri spin'])
  })

  it('"hän istuu penkille": the one spoken to sits on the bench', () => {
    expect(sure(hear('hän istuu penkille', 'noora')).steps).toEqual([{ who: 'noora', action: 'sit', args: [{ name: 'on', value: 'bench' }] }])
    unsure(hear('hän istuu penkille', null))
  })

  it('takes the one spoken to when nobody is named', () => {
    expect(sure(hear('mene puun luo', 'mike')).steps).toEqual([{ who: 'mike', action: 'walk', args: [{ name: 'to', value: 'tree' }] }])
    unsure(hear('hyppää', null))
  })

  it('hears a name one letter off, and names with endings as the ones things are done to', () => {
    expect(sure(hear('alise hyppää')).who).toEqual(['alice'])
    expect(sure(hear('mirri seuraa stevea')).steps).toEqual([{ who: 'mirri', action: 'follow', args: [{ name: 'who', value: 'steve' }] }])
    expect(sure(hear('anna pallo stevelle', 'alice')).steps).toEqual([
      { who: 'alice', action: 'give', args: [{ name: 'thing', value: 'ball' }, { name: 'to', value: 'steve' }] },
    ])
    expect(sure(hear('Alice anna Stevelle pallo')).steps[0]!.args).toEqual([{ name: 'thing', value: 'ball' }, { name: 'to', value: 'steve' }])
  })

  it('a word one letter off a name keeps its first letter: "kaikille" is not Maiki', () => {
    expect(sure(hear('noora sano hei kaikille')).steps).toEqual([{ who: 'noora', action: 'say', args: [{ name: 'words', value: 'hei kaikille' }] }])
    unsure(hear('anna pallo kaikille', 'alice'))
  })

  it('reads a bare name after the verb as the one who does it', () => {
    expect(sure(hear('hyppää alice', 'steve')).who).toEqual(['alice'])
  })

  it('names two who do it', () => {
    expect(sure(hear('Alice ja Steve hyppää')).who).toEqual(['alice', 'steve'])
  })

  it('"hänelle" is the one spoken to, unless that is who does it', () => {
    expect(sure(hear('alice anna pallo hänelle', 'steve')).steps[0]!.args).toEqual([{ name: 'thing', value: 'ball' }, { name: 'to', value: 'steve' }])
    unsure(hear('anna hänelle pallo', 'alice'))
  })

  it('English pronouns must fit the one spoken to', () => {
    expect(sure(hear('she jumps', 'alice')).who).toEqual(['alice'])
    unsure(hear('she jumps', 'steve'))
  })

  it('gives a text param the words after the verb', () => {
    expect(sure(hear('alice sano hei hei')).steps).toEqual([{ who: 'alice', action: 'say', args: [{ name: 'words', value: 'hei hei' }] }])
  })

  it('takes two words that make one call together, side by side or apart', () => {
    expect(sure(hear('alice ota pois')).steps).toEqual([{ who: 'alice', action: 'take-off', args: [] }])
    expect(sure(hear('tule tänne', 'mike')).steps).toEqual([{ who: 'mike', action: 'come', args: [] }])
    expect(sure(hear('mike ota lasit pois')).steps).toEqual([{ who: 'mike', action: 'take-off', args: [{ name: 'thing', value: 'glasses' }] }])
  })

  it('says what it heard in plain English, with names and no ids', () => {
    expect(sure(hear('alice anna pallo stevelle')).heard).toBe('Alice: give the ball to Steve')
    expect(sure(hear('stiivi juokse puun luo')).heard).toBe('Steve: run to the tree')
    expect(sure(hear('maalaa pallo punaiseksi', 'steve')).heard).toBe('Steve: paint the ball red')
    expect(sure(hear('steve hyppää 3 kertaa')).heard).toBe('Steve: jump 3 times')
  })

  it('says it in Finnish too, in the child’s order and words, each name with the ending the child put on it', () => {
    expect(sure(hear('alice anna pallo stevelle')).heardFi).toBe('Alice: anna pallo Stevelle')
    expect(sure(hear('alice anna stevelle pallo')).heardFi).toBe('Alice: anna Stevelle pallo')
    expect(sure(hear('stiivi juokse puun luo')).heardFi).toBe('Steve: juokse puun luo')
    expect(sure(hear('maalaa pallo punaiseksi', 'steve')).heardFi).toBe('Steve: maalaa pallo punaiseksi')
    expect(sure(hear('steve hyppää 3 kertaa')).heardFi).toBe('Steve: hyppää 3 kertaa')
    expect(sure(hear('steve hyppää yhden kerran')).heardFi).toBe('Steve: hyppää 1 kerran')
    expect(sure(hear('kaikki pyörikää')).heardFi).toBe('Kaikki: pyöri')
    expect(sure(hear('mennään metsään', 'alice')).heardFi).toBe('Alice: mene metsään')
    expect(sure(hear('alice')).heardFi).toBe('Alice: moi')
    // A misheard name, and "hänelle", are said as the name they mean, with their ending.
    expect(sure(hear('alice anna pallo maikille')).heardFi).toBe('Alice: anna pallo Mikelle')
    expect(sure(hear('alice anna pallo hänelle', 'steve')).heardFi).toBe('Alice: anna pallo Stevelle')
    // A thing said in English, or one letter off, is said by its Finnish name.
    expect(sure(hear('alice ota ball')).heardFi).toBe('Alice: ota pallo')
    expect(unsure(hear('alice ota pallu')).heardFi).toBe('Alice: ota pallo')
  })

  it('says a starting avatar’s name in each line in that language, the Finnish ending fitted to the Finnish name', () => {
    const cast = [...testCast(), testActor('max', ['max'], 'he')]
    cast[2]!.names = { fi: { name: 'Mikko', calls: ['mikko'] }, en: { name: 'Mike', calls: ['mike'] } }
    cast[4]!.names = { fi: { name: 'Mirri', calls: ['mirri'] }, en: { name: 'Luna', calls: ['luna'] } }
    const w = testWorld(cast)
    const lines = (words: string) => {
      const plan = sure(understand(words, vocab, w, null))
      return [plan.heard, plan.heardFi]
    }
    expect(lines('alice anna pallo mikelle')).toEqual(['Alice: give the ball to Mike', 'Alice: anna pallo Mikolle'])
    expect(lines('mirri seuraa mikeä')).toEqual(['Luna: follow Mike', 'Mirri: seuraa Mikkoa'])
    expect(lines('alice anna pallo maxille')).toEqual(['Alice: give the ball to Max', 'Alice: anna pallo Maxille'])
    expect(lines('noora seuraa maxia')).toEqual(['Noora: follow Max', 'Noora: seuraa Maxia'])
  })

  it('a worn thing named for paint is the part of the one painted when that one wears something there, else the thing', () => {
    const dressed = testWorld(testCast().map((a) => (a.id === 'alice' ? { ...a, look: { ...a.look, worn: { hair: { kind: 'hair-long', tint: null } } } } : a.id === 'steve' ? { ...a, look: { ...a.look, worn: { face: { kind: 'glasses', tint: null } } } } : a)))
    const paint = (words: string, w = dressed) => sure(understand(words, vocab, w, null)).steps
    expect(paint('alice värjää tukka siniseksi')).toEqual([{ who: 'alice', action: 'paint', args: [{ name: 'color', value: 'siniseksi' }, { name: 'part', value: 'hair' }] }])
    expect(paint('alice maalaa steven lasit siniseksi')).toEqual([{ who: 'alice', action: 'paint', args: [{ name: 'color', value: 'siniseksi' }, { name: 'thing', value: 'steve' }, { name: 'part', value: 'face' }] }])
    // Nobody painted wears anything there: the glasses or the hair are a thing to paint.
    expect(paint('alice maalaa lasit siniseksi')).toEqual([{ who: 'alice', action: 'paint', args: [{ name: 'color', value: 'siniseksi' }, { name: 'thing', value: 'glasses' }] }])
    expect(paint('alice värjää tukka siniseksi', world)).toEqual([{ who: 'alice', action: 'paint', args: [{ name: 'color', value: 'siniseksi' }, { name: 'thing', value: 'hair-short' }] }])
    expect(sure(hear('alice maalaa lasit siniseksi')).heard).toBe('Alice: paint the glasses blue')
  })

  it('"kaikki" is everyone, never a word to say or a colour', () => {
    const plan = sure(hear('maalatkaa kaikki itsenne sinisiksi'))
    expect(plan.steps.map((s) => `${s.who} ${s.args.map((a) => a.value).join(' ')}`)).toEqual(['alice sinisiksi', 'steve sinisiksi', 'mike sinisiksi', 'noora sinisiksi', 'mirri sinisiksi'])
  })

  it('a text param of known things carries their kinds, and colours are known words', () => {
    expect(sure(hear('alice tee pallo')).steps[0]!.args).toEqual([{ name: 'thing', value: 'ball' }])
    expect(sure(hear('alice tee pallo punainen')).steps[0]!.args).toEqual([{ name: 'thing', value: 'ball' }, { name: 'color', value: 'punainen' }])
    expect(sure(hear('pue lasit', 'noora')).steps).toEqual([{ who: 'noora', action: 'wear', args: [{ name: 'thing', value: 'glasses' }] }])
    expect(sure(hear('maalaa pallo punaiseksi', 'steve')).steps[0]!.args).toEqual([{ name: 'color', value: 'punaiseksi' }, { name: 'thing', value: 'ball' }])
    expect(sure(hear('maalaa alice siniseksi', 'steve')).steps).toEqual([{ who: 'alice', action: 'paint', args: [{ name: 'color', value: 'siniseksi' }] }])
  })

  it('fills a number param', () => {
    expect(sure(hear('steve hyppää 3 kertaa')).steps[0]!.args).toEqual([{ name: 'times', value: '3' }])
  })

  it('a name alone is a hello', () => {
    const plan = sure(hear('hei steve'))
    expect(plan.who).toEqual(['steve'])
    expect(plan.steps).toEqual([])
    expect(plan.say).toBe('Hi!')
  })
})

describe('stopping', () => {
  it('"seis" stops everybody', () => {
    expect(hear('seis')).toEqual({ kind: 'stop', who: ['alice', 'steve', 'mike', 'noora', 'mirri'] })
  })

  it('a stop with a name stops just them', () => {
    expect(hear('Alice, seis!')).toEqual({ kind: 'stop', who: ['alice'] })
    expect(hear('älä hyppää steve')).toEqual({ kind: 'stop', who: ['steve'] })
  })
})

describe('changing rooms', () => {
  it('"mennään uimaan" goes to the pool', () => {
    const plan = sure(hear('mennään uimaan'))
    expect(plan.room).toBe('pool')
    expect(plan.steps).toEqual([])
    expect(plan.sayFi).toBe('Mennään!')
  })

  it('knows the other rooms and their endings', () => {
    expect(sure(hear('mennään metsään')).room).toBe('forest')
    expect(sure(hear('mene leikkipuistoon')).room).toBe('playground')
  })

  it('a room change and a command together', () => {
    const plan = sure(hear('mennään metsään ja alice hyppää'))
    expect(plan.room).toBe('forest')
    expect(plan.steps).toEqual([{ who: 'alice', action: 'jump', args: [] }])
  })

  it('a thing named like a room is the thing', () => {
    expect(sure(hear('mene keinuun', 'alice')).steps).toEqual([{ who: 'alice', action: 'walk', args: [{ name: 'to', value: 'swing' }] }])
  })
})

describe('what the parser must not be sure of', () => {
  it('a thing in the hand said with -lla is what it is done with: "hyppää pallolla" is no jump to the ball (2026-11-08, "Mikko hyppää hyppynarulla")', () => {
    unsure(hear('mike hyppää pallolla'))
    expect(sure(hear('mike hyppää pallolle')).steps[0]!.action).toBe('jump')
  })

  it('two actions: a guess with both', () => {
    expect(unsure(hear('alice hyppää ja pyöri')).steps.map((s) => s.action)).toEqual(['jump', 'spin'])
  })

  it('an unknown verb', () => {
    const plan = unsure(hear('alice heitä pallo stevelle'))
    expect(plan.who).toEqual(['alice'])
    expect(plan.steps).toEqual([])
  })

  it('a param that must be there and is not', () => {
    unsure(hear('anna pallo', 'alice'))
    unsure(hear('alice tee', 'alice'))
  })

  it('a thing nobody has made yet, or a new avatar: the interpreter invents it', () => {
    unsure(hear('tee uusi tyttö', 'alice'))
    unsure(hear('alice tee lohikäärme'))
    unsure(hear('maalaa paita punaiseksi', 'alice'))
  })

  it('more than one word nobody knows', () => {
    unsure(hear('alice hyppää todella korkealle'))
  })

  it('a name with words nobody knows', () => {
    unsure(hear('steve tanssii kissan kanssa'))
  })

  it('a verb or a thing only one letter off a known one: a new one may hide there', () => {
    expect(unsure(hear('alice leikkaa')).steps.map((s) => s.action)).toEqual(['jump'])
    expect(unsure(hear('alice ota paita')).steps[0]!.args).toEqual([{ name: 'thing', value: 'tree' }])
  })

  it('a name one letter off where the verb goes is no second name: "Noora naura" laughs', () => {
    unsure(hear('noora naura'))
    expect(sure(hear('alise hyppää')).who).toEqual(['alice'])
  })

  it('a word left over that names something: a thing nobody has made, a name no param took, a word where a thing goes', () => {
    unsure(hear('alise hyppää trampoliinilla'))
    unsure(hear('mike pue mirrille lasit'))
    unsure(hear('alice anna stevelle pusu'))
    expect(sure(hear('alice juokse nopeasti')).steps).toEqual([{ who: 'alice', action: 'run', args: [] }])
  })

  it('a text param of small words that say nothing', () => {
    unsure(hear('alice tee se uudestaan'))
  })

  it('putting a thing on another is no call to wear it, and two kinds are no one thing to make', () => {
    // Its guess (played with no interpreter) wears no 'ball bench' either.
    expect(unsure(hear('alice laita pallo penkin päähän')).steps).toEqual([])
    expect(unsure(hear('alice tee pallo ja puu')).steps[0]!.args).toEqual([{ name: 'thing', value: 'ball tree' }])
    expect(sure(hear('mike laita lasit päähän')).steps).toEqual([{ who: 'mike', action: 'wear', args: [{ name: 'thing', value: 'glasses' }] }])
    expect(sure(hear('mike ota lasit heti pois')).steps).toEqual([{ who: 'mike', action: 'take-off', args: [{ name: 'thing', value: 'glasses' }] }])
  })
})
