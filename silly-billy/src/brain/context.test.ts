import { describe, expect, it } from 'vitest'

import { interpreterContext, type Moment } from './context'
import { testActor, testCast, testItem, testVocabulary, testWorld } from './testing'

const moment = (over: Partial<Moment> = {}): Moment => ({ addressee: null, lastMade: null, said: [], did: new Map(), newNames: ['Ella', 'Leo', 'Venla'], ...over })

describe('the interpreter context: the whole scene', () => {
  const cast = [...testCast(), testActor('leo', ['leo'], 'he')]
  const items = [testItem('#i1', 'ball', 2, 3), testItem('#i2', 'ball', -1, 0), testItem('#i3', 'slide', 5, -4), testItem('#i4', 'swing', -6, -6), testItem('#i5', 'bench', 0, -8)]
  const world = testWorld(cast, items)
  const [alice, steve, mike, noora, mirri, leo] = cast as [typeof cast[0], typeof cast[0], typeof cast[0], typeof cast[0], typeof cast[0], typeof cast[0]]
  Object.assign(alice, { x: 2.2, z: 3.4, yaw: Math.PI / 2 })
  alice.hands.right = '#i1'
  items[0]!.holder = { actor: 'alice', hand: 'right' }
  steve.look.worn.head = { kind: 'cap', tint: null }
  steve.look.worn.hand = { kind: 'magic-wand', tint: '#ff9ccf' }
  steve.doing = { action: 'jump', args: { to: '#i3' }, serial: 4, since: 1 }
  noora.riding = '#i4'
  Object.assign(mike, { y: 2, x: 5, z: -4, yaw: Math.PI, scale: 1.5 })
  leo.thinking = { about: 'dance', since: 1, progress: 0.2 }
  mirri.joinedBy = 'steve'
  // A ball up on the bench, painted, the newest thing; the bench is 2 m high in the test kinds.
  Object.assign(items[1]!, { x: 0.3, z: -7.8, y: 2, tint: '#ff0000', born: 12, scale: 1.5 })
  items[2]!.fixed = true
  const text = interpreterContext(world, testVocabulary(), moment({ addressee: 'steve', lastMade: 'leo', said: ['Steve: jump', 'Alice: pick up the ball'], did: new Map([['alice', 'pick-up(ball)'], ['steve', 'spin']]) }))
  const lines = text.split('\n')

  it('says the room, the rooms, how places are written and where the water is', () => {
    expect(lines.slice(0, 4)).toEqual([
      'Room: playground. Rooms: playground (leikkipuisto), pool (uimahalli), forest (metsä).',
      "Places are 'x,z' in metres: x to the right, z toward the front (the viewer), each from -12 to 12.",
      'Water: none.',
      'Sky: day, 13:00.',
    ])
    // "heitä se lampeen" in the forest made a new pond: the context never said the forest has one.
    expect(interpreterContext({ ...world, room: 'forest' }, testVocabulary(), moment())).toContain('Water: the pond, round, its middle at 6.5,-6.5, 4.8 m across, 0.5 m deep, full.')
    expect(interpreterContext({ ...world, room: 'pool' }, testVocabulary(), moment())).toContain('Water: the pool, from -5.5,-6 to 5.5,1, 0.8 m deep, full.')
  })

  it('says the sky and the weather, and how full the water is', () => {
    const night = testWorld(cast, [])
    night.sky = { time: 22.5, rain: 0.6, snow: 0, fog: 0, wind: 0.2, color: null, light: null, fades: {} }
    night.room = 'pool'
    night.terrain = { playground: { water: 1, waterColor: null, ground: null, fades: {} }, pool: { water: 0.25, waterColor: null, ground: null, fades: {} }, forest: { water: 0, waterColor: null, ground: null, fades: {} } }
    const text = interpreterContext(night, testVocabulary(), moment())
    expect(text).toContain('Sky: night, 22:30; rain 60%, wind 20%.')
    expect(text).toContain('0.8 m deep, 25% full.')
    expect(interpreterContext({ ...night, room: 'forest' }, testVocabulary(), moment())).toContain('0.5 m deep, empty.')
  })

  it("gives an actor's states, what a thing is fixed to and its lights, and a kind's food", () => {
    const sick = testWorld(cast.map((a) => ({ ...a, effects: a.id === 'mirri' ? { sick: 8.2, wet: 0.5 } : {} })), [
      { ...testItem('#i7', 'tree', 1, 1), attached: { to: '#i5', at: 'front', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 }, glow: false },
      { ...testItem('#i8', 'ball', 2, 2), glow: true, light: '#ffcc00' },
      testItem('#i5', 'bench', 1, 0),
    ])
    sick.t = 0
    const text = interpreterContext(sick, testVocabulary(), moment()).split('\n')
    expect(text.find((l) => l.startsWith('- mirri '))).toContain('; sick 9 s, wet 1 s')
    expect(text).toContain('- #i7 tree 1,1 fixed to #i5 at front switched off')
    expect(text).toContain('- #i8 ball 2,2 lit shines #ffcc00')
    expect(text).toContain('- bench: 2x2x2; too big to carry, sat on, solid, soft')
  })

  it('lists no script among the actions: it is for its moment only', () => {
    const vocab = testVocabulary()
    const actions = new Map(vocab.actions)
    actions.set('moment-3-backflip-on-trampoline', { id: 'moment-3-backflip-on-trampoline', name: 'Wow!', nameFi: 'Vau!', about: 'once', params: [] })
    expect(interpreterContext(world, { ...vocab, actions }, moment())).not.toContain('moment-3')
  })

  it('gives every actor where it is and faces, what it holds, wears and rides, and what it does or did', () => {
    expect(lines).toContain('- alice Alice kid she; at 2,3 facing right; holds #i1 ball; did pick-up(ball)')
    expect(lines).toContain('- steve Steve kid he; at 0,4 facing front; wears cap, magic-wand (#ff9ccf); doing jump(#i3)')
    expect(lines).toContain('- noora Noora kid she; at 0,4 facing front; sits on #i4 swing')
    expect(lines).toContain('- mike Mike grownup he; at 5,-4 up 2 facing back size x1.5')
    expect(lines).toContain('- mirri Mirri cat it; at 0,4 facing front; taken along by steve')
    expect(lines).toContain('- leo Leo kid he; at 0,4 facing front; waits for dance to be made')
    expect(lines).toContain('Last spoken to: steve. Last made: leo.')
    expect(lines).toContain('Said before: Steve: jump / Alice: pick up the ball.')
  })

  it('gives every thing here by its id, where it is, what it stands on, who holds it, and the newest', () => {
    expect(lines).toContain('Things here (id kind where), 5:')
    expect(lines).toContain('- #i1 ball held by alice')
    expect(lines).toContain('- #i2 ball 0,-8 up 2 on #i5 bench size x1.5 painted #ff0000 newest')
    expect(lines).toContain('- #i3 slide 5,-4 fixed')
    expect(lines).toContain('- #i4 swing -6,-6')
  })

  it('gives each kind here once: its size, how it is handled, its moving parts and its own anchors', () => {
    expect(lines).toContain('- ball: 0.3x0.3x0.3; carried in a hand')
    expect(lines).toContain('- slide: 2x2x2; too big to carry, solid')
    expect(lines).toContain('- swing: 2x2x2; too big to carry, sat on, solid; parts seat1')
    expect(lines.filter((l) => l.startsWith('- ball:'))).toHaveLength(1)
    // A kind nobody made is a mystery box.
    const mystery = interpreterContext(testWorld(cast, [testItem('#i9', 'dragon')]), testVocabulary(), moment())
    expect(mystery).toContain('- dragon: a mystery box, nobody made it yet')
  })

  it('has one line per action with its params, and every kind, with its Finnish name in a game played in Finnish', () => {
    expect(lines).toContain('give(thing?: item, to: actor): does give')
    expect(lines).toContain('jump(to?: place, times?: number): does jump')
    expect(lines).toContain('come(): does come')
    expect(lines).toContain('make(thing: text, color?: text): does make')
    expect(lines).toContain('Item kinds: tree, bench, ball, slide, swing, glasses, hair-short.')
    const fi = interpreterContext({ ...world, lang: 'fi' }, testVocabulary(), moment()).split('\n')
    expect(fi).toContain('Item kinds: tree (puu), bench (penkki), ball (pallo), slide (liukumäki), swing (keinu), glasses (lasit), hair-short (tukka).')
  })

  it('names every kind and every avatar id: the server tells a lost new thing from a known one by them', () => {
    for (const kind of testVocabulary().items.keys()) expect(text).toContain(kind)
    for (const a of cast) expect(text).toContain(`- ${a.id} `)
  })

  it('offers only the names nobody has yet', () => {
    expect(lines.at(-1)).toBe('Names free for a new avatar: Ella, Venla.')
  })

  it('offers no name a starting avatar goes by in the other language: the two would meet when the language changes', () => {
    const aino = testActor('alice', ['alice'], 'she')
    aino.names = { fi: { name: 'Aino', calls: ['aino'] }, en: { name: 'Alice', calls: ['alice'] } }
    const free = interpreterContext(testWorld([aino]), testVocabulary(), moment({ newNames: ['Aino', 'Olivia'] })).split('\n').at(-1)
    expect(free).toBe('Names free for a new avatar: Olivia.')
  })

  it('stays short', () => {
    expect(text.length).toBeLessThan(2600)
  })
})
