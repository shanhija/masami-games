/**
 * The parser with the real library and cast: the misheard Finnish a child says must find the
 * content's own actions, things and names. Needs the engine's createWorld and the content.
 */
import { describe, expect, it } from 'vitest'

import { BUILTIN_ACTIONS, BUILTIN_ITEMS, LAYOUTS, makeCast } from '../content'
import { Library } from '../engine/library'
import { createWorld } from '../engine/sim'
import { understand, type Understood } from './parse'

const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })
const world = createWorld({ room: 'playground', actors: makeCast(), layouts: LAYOUTS, seed: 1 })
const hear = (words: string, addressee: string | null = null) => understand(words, library, world, addressee)

function sure(u: Understood) {
  if (u.kind !== 'plan' || !u.confident) throw new Error(`not sure: ${JSON.stringify(u)}`)
  return u.plan
}

const steps = (u: Understood) => sure(u).steps.map((s) => [s.who, s.action, ...s.args.map((a) => a.value)].join(' '))

describe('the parser with the real library', () => {
  it('hears the basic verbs said the ways a child says them', () => {
    expect(steps(hear('alis hyppää'))).toEqual(['alice jump'])
    expect(steps(hear('stiivi juokse puun luo'))).toEqual(['steve run tree'])
    expect(steps(hear('kaikki pyörikää'))).toEqual(world.actors.map((a) => `${a.id} spin`))
    expect(steps(hear('hän istuu penkille', 'noora'))).toEqual(['noora sit bench'])
    expect(steps(hear('mirri seuraa stevea'))).toEqual(['mirri follow steve'])
    const give = sure(hear('maikki anna pallo nooralle')).steps
    expect(give.map((s) => `${s.who} ${s.action}`)).toEqual(['mike give'])
    expect(give[0]!.args.map((a) => a.value).sort()).toEqual(['ball', 'noora'])
  })

  it('counts, paints itself and says hi to everyone', () => {
    expect(steps(hear('hyppää kolme kertaa', 'alice'))).toEqual(['alice jump 3'])
    expect(steps(hear('alice maalaa itsesi siniseksi'))).toEqual(['alice paint siniseksi'])
    expect(steps(hear('noora sano hei kaikille'))).toEqual(['noora say hei kaikille'])
    expect(steps(hear('steve pue lakki'))).toEqual(['steve wear cap'])
    expect(steps(understand('mennään takaisin leikkipuistoon', library, { ...world, room: 'forest' }, null))).toEqual([])
  })

  it('stops and changes rooms', () => {
    expect(hear('seis')).toEqual({ kind: 'stop', who: world.actors.map((a) => a.id) })
    expect(sure(hear('mennään uimaan')).room).toBe('pool')
    expect(sure(hear('mennään metsään')).room).toBe('forest')
  })

  it('is not sure of what is not built in', () => {
    for (const words of ['alice heitä pallo stevelle', 'steve aja pyörällä joulukuusen yli', 'mike tanssi kissan kanssa', 'alice hyppää ja pyöri']) {
      const u = hear(words, 'alice')
      expect(u.kind === 'plan' && u.confident, words).toBe(false)
    }
  })

  it('is not sure of new verbs and things that are a letter off a known word, or of a thing left over', () => {
    for (const words of [
      // one letter off a basic verb: fly, dig, cut, clap, play, carry, tickle, laugh, meow
      'Alice, lennä', 'Noora, lennä kuuhun', 'Steve, lennä puuhun', 'Alice, kaiva', 'Mike, kaiva kuoppa', 'Alice, leikkaa', 'Alice, taputa',
      'Alice ja Mirri leikkii', 'Mike, kanna Alicea', 'Steve, kutita Mikeä', 'Alice naura', 'Mirri miukuu', 'Alise hyppi trampoliinilla',
      // one letter off a thing: a sword, a guitar, a shirt, a cup; "pieni" is small, not a mushroom
      'Alice, pue miekka', 'Alice, ota kitara', 'Alice, pue paita', 'Alice, maalaa paita punaiseksi', 'Alice ota kuppi', 'Steve tee Alicesta pieni',
      // a thing nobody has made, a place to go and do something, a slide to slide down, a name no param took, words that say nothing
      'Alice, lennä lohikäärmeellä', 'Alice mene piiloon', 'Noora mene keinumaan', 'Steve, laske liukumäkeä', 'Alice, laske kolmeen', 'Alice, laske 3', 'Mike pue Mirrille hattu', 'Alice, tee se uudestaan',
      // the same new verbs said to many
      'kaikki lentäkää', 'kaikki kaivakaa', 'kaikki leikkikää', 'kaikki taputtakaa', 'kaikki kantakaa Alicea', 'kaikki nauravat', 'kaikki leikkivät',
      // put a thing on another: no 'ball bench' to wear
      'Alice laita pallo penkin päälle', 'Alice put the ball on the bench', 'Steve put the cap on the bench',
      // a colour word is no kind to make; two things or two colours to share out; a second command after a room
      'Alice make a tomato', 'Alice make a seashell', 'Alice maalaa pallo ja puu punaiseksi', 'Alice maalaa pallo punaiseksi ja siniseksi', 'mennään metsään ja alice tanssii', 'mennään metsään ja tanssitaan',
      // 2026-11-09: a word nobody knows beside a thing is the thing meant: an acorn is no oak to eat; a split name is one new thing
      'Mirri, syö tammen terho', 'Eetu, rakenna puu maja', 'Noora, tee joulu kuusi', 'Aino, tee hiekka linna',
      // the room everyone is in is something to do there (below: "käy uimassa" in the pool did nothing)
      'mennään leikkipuistoon', 'Alice, mene leikkipuistoon',
    ]) {
      const u = hear(words, 'alice')
      expect(u.kind === 'plan' && u.confident, words).toBe(false)
    }
    const pool = createWorld({ room: 'pool', actors: makeCast(), layouts: LAYOUTS, seed: 1 })
    for (const words of ['Mikko, käy uimassa', 'mennään uimaan']) expect(understand(words, library, pool, null), words).toMatchObject({ confident: false })
  })

  it('reads what it is sure of the way a child means it', () => {
    expect(steps(hear('Alice, hyppää kuusi kertaa'))).toEqual(['alice jump 6'])
    // 'laske' puts down a thing that can be carried; with a slide or a number it is for the interpreter (above).
    expect(steps(hear('Alice, laske pallo'))).toEqual(['alice drop ball'])
    expect(steps(hear('Alice, laske pallo alas'))).toEqual(['alice drop ball'])
    expect(steps(hear('Alice laske pallo maahan'))).toEqual(['alice drop ball'])
    // A colour param takes the colour word, the thing param the thing.
    expect(steps(hear('Alice paint the ball red'))).toEqual(['alice paint red ball'])
    expect(steps(hear('Alice, pue punainen lippis'))).toEqual(['alice wear cap punainen'])
    expect(steps(hear('Mike maalaa Mirri pinkiksi'))).toEqual(['mike paint pinkiksi mirri'])
    // A room and a word more is still sure.
    expect(sure(hear('Alice, mene metsään nopeasti')).room).toBe('forest')
    expect(sure(hear('Steve hyppää altaaseen')).room).toBe('pool')
    expect(steps(hear('Steve, ota lippis pois'))).toEqual(['steve take-off cap'])
    expect(steps(hear('maalatkaa kaikki itsenne sinisiksi'))).toEqual(world.actors.map((a) => `${a.id} paint sinisiksi`))
    expect(steps(hear('Alice värjää tukka siniseksi'))).toEqual(['alice paint siniseksi hair'])
    expect(steps(hear('hypätään', 'alice'))).toEqual(['alice jump'])
    expect(steps(hear('Alice vilkuta minulle'))).toEqual(['alice wave'])
    expect(sure(hear('Alice ota kumiankka')).heard).toBe('Alice: pick up the rubber duck')
    expect(sure(hear('stiivi juokse puun luo')).heard).toBe('Steve: run to the tree')
    expect(steps(hear('Mike laita lasit päähän'))).toEqual(['mike wear glasses'])
    expect(steps(hear('Steve put the hat on'))).toEqual(['steve wear cap'])
    expect(steps(hear('Alice pick the ball up'))).toEqual(['alice pick-up ball'])
    // Everyday words before a thing leave the thing the thing.
    expect(steps(hear('Mike, ota iso pallo'))).toEqual(['mike pick-up ball'])
    expect(steps(hear('Nora, mene ison puun luo'))).toEqual(['noora walk tree'])
    expect(steps(hear('Steve, ota toinen pallo'))).toEqual(['steve pick-up ball'])
  })

  it('hears the verbs said to many, waving hands and counting once or many times', () => {
    const all = (action: string, ...args: string[]) => world.actors.map((a) => [a.id, action, ...args].join(' '))
    for (const [words, action] of [
      ['kaikki hyppikää', 'jump'], ['kaikki hyppivät', 'jump'], ['kaikki kipittäkää', 'run'], ['kaikki nukkuvat', 'sleep'], ['kaikki pyörähtäkää', 'spin'],
      ['kaikki vilkuttavat', 'wave'], ['kaikki heiluttakaa', 'wave'],
    ] as const) expect(steps(hear(words)), words).toEqual(all(action))
    expect(steps(hear('kaikki pudottavat pallo'))).toEqual(all('drop', 'ball'))
    expect(steps(hear('kaikki tiputtakaa pallo'))).toEqual(all('drop', 'ball'))
    expect(steps(hear('Alice heiluta kättä'))).toEqual(['alice wave'])
    expect(steps(hear('Alice vilkuta kättä'))).toEqual(['alice wave'])
    expect(steps(hear('Noora heiluta käsiä'))).toEqual(['noora wave'])
    expect(steps(hear('Steve hyppää yhden kerran'))).toEqual(['steve jump 1'])
    expect(steps(hear('Steve hyppää monta kertaa'))).toEqual(['steve jump'])
  })

  it('in a game played in Finnish hears the Finnish names, and says what it heard in both languages', () => {
    const fi = createWorld({ room: 'playground', actors: makeCast('fi'), layouts: LAYOUTS, seed: 1, lang: 'fi' })
    const lines = (words: string, addressee: string | null = null) => {
      const plan = sure(understand(words, library, fi, addressee))
      return [plan.steps.map((s) => [s.who, s.action, ...s.args.map((a) => a.value)].join(' ')).join(', '), plan.heard, plan.heardFi]
    }
    expect(lines('Aino ota kumiankka')).toEqual(['alice pick-up rubber-duck', 'Alice: pick up the rubber duck', 'Aino: ota kumiankka'])
    expect(lines('Eetu juokse puun luo')).toEqual(['steve run tree', 'Steve: run to the tree', 'Eetu: juokse puun luo'])
    expect(lines('Mikko anna pallo Nooralle')).toEqual(['mike give ball noora', 'Mike: give the ball to Nora', 'Mikko: anna pallo Nooralle'])
    expect(lines('Noora anna pallo Mikolle')).toEqual(['noora give ball mike', 'Nora: give the ball to Mike', 'Noora: anna pallo Mikolle'])
    expect(lines('Mirri seuraa Mikkoa')).toEqual(['mirri follow mike', 'Luna: follow Mike', 'Mirri: seuraa Mikkoa'])
    expect(lines('Eetu maalaa pallo punaiseksi')).toEqual(['steve paint punaiseksi ball', 'Steve: paint the ball red', 'Eetu: maalaa pallo punaiseksi'])
    expect(lines('hyppää kolme kertaa', 'mirri')).toEqual(['mirri jump 3', 'Luna: jump 3 times', 'Mirri: hyppää 3 kertaa'])
    expect(lines('kaikki pyörikää')[2]).toBe('Kaikki: pyöri')
  })
})

describe('games, said the way a child starts one', () => {
  const fi = createWorld({ room: 'playground', actors: makeCast('fi'), layouts: LAYOUTS, seed: 1, lang: 'fi' })
  const en = createWorld({ room: 'playground', actors: makeCast('en'), layouts: LAYOUTS, seed: 1, lang: 'en' })
  const said = (words: string, world = fi) => sure(understand(words, library, world, null)).steps.map((s) => `${s.who} ${s.action}`)
  const all = (action: string) => ['alice', 'steve', 'mike', 'noora', 'mirri'].map((id) => `${id} ${action}`)

  it('"pelataan", "leikitään", "mennään", "kaikki" or nobody named: everyone plays', () => {
    expect(said('pelataan hippaa')).toEqual(all('tag'))
    expect(said('hippa')).toEqual(all('tag'))
    expect(said('kaikki pelaa jalkapalloa')).toEqual(all('football-game'))
    expect(said('pelataan futista')).toEqual(all('football-game'))
    expect(said('leikitään piilosta')).toEqual(all('hide-and-seek'))
    expect(said('mennään piilosille')).toEqual(all('hide-and-seek'))
    expect(said('juostaan kilpaa')).toEqual(all('race'))
    expect(said('leikitään junaa')).toEqual(all('train'))
    expect(said('play tag', en)).toEqual(all('tag'))
    expect(said("let's play soccer", en)).toEqual(all('football-game'))
    expect(said('play hide and seek', en)).toEqual(all('hide-and-seek'))
    expect(said('follow the leader', en)).toEqual(all('train'))
  })

  it('names say who plays, and a play word is never a verb one letter off', () => {
    expect(said('Aino ja Eetu pelaa hippaa')).toEqual(['alice tag', 'steve tag'])
    expect(said('Noora ja Mirri leikkikää junaa')).toEqual(['noora train', 'mirri train'])
    expect(said('Alice and Steve play tag', en)).toEqual(['alice tag', 'steve tag'])
    expect(understand('Aino pelaa', library, fi, null)).toMatchObject({ confident: false })
  })
})
