import { describe, expect, it } from 'vitest'

import { interpreterContext } from './context'
import { testActor, testCast, testItem, testVocabulary, testWorld } from './testing'

describe('the interpreter context', () => {
  const cast = [...testCast(), testActor('leo', ['leo'], 'he')]
  const items = [testItem('#i1', 'ball'), testItem('#i2', 'ball'), testItem('#i3', 'slide'), testItem('#i4', 'swing')]
  const world = testWorld(cast, items)
  cast[0]!.hands.right = '#i1'
  items[0]!.holder = { actor: 'alice', hand: 'right' }
  cast[1]!.look.worn.head = { kind: 'cap', tint: null }
  cast[1]!.look.worn.hand = { kind: 'magic-wand', tint: '#ff9ccf' }
  cast[3]!.riding = '#i4'
  const text = interpreterContext(world, testVocabulary(), 'steve', 'leo', ['Ella', 'Leo', 'Venla'])
  const lines = text.split('\n')

  it('says the room and the rooms', () => {
    expect(lines[0]).toBe('Room: playground. Rooms: playground (leikkipuisto), pool (uimahalli), forest (metsä).')
  })

  it('lists the actors with what they hold, wear and ride', () => {
    expect(lines).toContain('- alice Alice kid she; holds ball')
    expect(lines).toContain('- steve Steve kid he; wears cap, magic-wand (#ff9ccf)')
    expect(lines).toContain('- noora Noora kid she; on swing')
    expect(lines).toContain('- mirri Mirri cat it')
    expect(lines).toContain('Last spoken to: steve. Last made: leo.')
  })

  it('counts the things here', () => {
    expect(lines).toContain('Things here: ball x2, slide, swing.')
  })

  it('has one line per action with its params, and the item kinds', () => {
    expect(lines).toContain('give(thing?: item, to: actor): does give')
    expect(lines).toContain('jump(to?: place, times?: number): does jump')
    expect(lines).toContain('come(): does come')
    expect(lines).toContain('make(thing: text, color?: text): does make')
    expect(lines).toContain('Item kinds: tree, bench, ball, slide, swing, glasses, hair-short.')
  })

  it('names every kind and every avatar id: the server tells a lost new thing from a known one by them', () => {
    for (const kind of testVocabulary().items.keys()) expect(text).toContain(kind)
    for (const a of cast) expect(text).toContain(`- ${a.id} `)
  })

  it('offers only the names nobody has yet', () => {
    expect(lines.at(-1)).toBe('Names free for a new avatar: Ella, Venla.')
  })

  it('offers no name a starting avatar goes by in the other language: the two would meet when the language changes', () => {
    const alice = testActor('alice', ['alice'], 'she')
    alice.names = { fi: { name: 'Aino', calls: ['aino'] }, en: { name: 'Alice', calls: ['alice'] } }
    const free = interpreterContext(testWorld([alice]), testVocabulary(), null, null, ['Aino', 'Olivia']).split('\n').at(-1)
    expect(free).toBe('Names free for a new avatar: Olivia.')
  })

  it('stays short', () => {
    expect(text.length).toBeLessThan(2000)
  })
})
