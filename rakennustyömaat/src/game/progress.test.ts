import { describe, expect, it } from 'vitest'

import { DEFAULT_LOOK, PRESENTS } from './catalog'
import { defaultItems } from './items'
import { MAX_PLOTS, type Keep, type PlacedRoom } from './model'
import { freshKeep, parseKeep, serializeKeep } from './progress'

const room = (id: number, shape: PlacedRoom['shape'], col: number, row: number, material: PlacedRoom['material'] = 'bricks'): PlacedRoom => ({
  id,
  shape,
  col,
  row,
  material,
  theme: 'play',
  items: defaultItems('play', shape),
  wall: 1,
  floor: 2,
})

/** A save from a child who has played a while: two houses, a few unlocks, a changed look, Music off. */
const GOOD: Keep = {
  ...freshKeep(),
  look: { ...DEFAULT_LOOK, hat: 'pink', hair: 'puffs', hairColor: 'blue', skin: 5, bag: 'jetpack', tool: 'drill', shoes: 'wellies' },
  goods: { log: 3, clay: 1, rock: 0, sand: 7, gem: 2, planks: 12, bricks: 4, concrete: 0, glass: 9, rainbow: 1 },
  machines: { sawmill: 'built', oven: 'built', mixer: 'crate', glassworks: 'pad', rainbow: 'pad' },
  plots: [
    { kind: 'tall', roof: 'tower', rooms: [room(1, 'wide', 0, 0), room(2, 'small', 0, 1, 'planks'), { ...room(3, 'tall', 2, 0, 'glass'), theme: 'disco', items: defaultItems('disco', 'tall') }] },
    { kind: 'row', roof: 'round', rooms: [room(4, 'big', 2, 0, 'planks')] },
    { kind: null, roof: 'pointed', rooms: [] },
  ],
  trips: 4,
  unlocked: ['theme:bath', 'bag:jetpack', 'theme:space'],
  nextId: 5,
  sound: true,
  music: false,
}

/** GOOD as plain JSON, to damage one field at a time. */
const good = () => JSON.parse(serializeKeep(GOOD)) as Record<string, any>
const text = (d: unknown) => JSON.stringify(d)

describe('parseKeep', () => {
  it('reads back what serializeKeep wrote', () => {
    expect(parseKeep(serializeKeep(GOOD))).toEqual(GOOD)
    expect(parseKeep(serializeKeep(freshKeep()))).toEqual(freshKeep())
  })

  it('starts fresh for nothing stored, text that is not JSON, and JSON that is not a version 1 save', () => {
    for (const junk of [null, '', '{', 'null', '42', '"hi"', '[]', '{}', text({ ...good(), v: 2 }), text({ ...good(), v: '1' })]) {
      expect(parseKeep(junk), String(junk)).toEqual(freshKeep())
    }
  })

  it('keeps everything it can from a save that is all wrong types', () => {
    const d = { v: 1, look: 7, goods: 'lots', machines: [], plots: {}, trips: -1, unlocked: 'all', nextId: 'x', sound: 'yes', music: null }
    expect(parseKeep(text(d))).toEqual(freshKeep())
  })

  it('turns a bad count into 0 and keeps the good ones', () => {
    const d = good()
    Object.assign(d.goods, { log: -3, clay: 1.5, rock: '4', sand: null, gem: 1e300 })
    delete d.goods.planks
    const keep = parseKeep(text(d))
    expect(keep.goods).toEqual({ ...GOOD.goods, log: 0, clay: 0, rock: 0, sand: 0, gem: 0, planks: 0 })
    expect(parseKeep(text({ ...good(), trips: 2.5 })).trips).toBe(0)
  })

  it('puts a machine of an unknown stage back on its empty pad', () => {
    const d = good()
    d.machines.sawmill = 'broken'
    delete d.machines.oven
    expect(parseKeep(text(d)).machines).toEqual({ ...GOOD.machines, sawmill: 'pad', oven: 'pad' })
  })

  it("puts a bad look part back to the default's, and a locked option the child has not unlocked", () => {
    const d = good()
    Object.assign(d.look, { hair: 'mohawk', skin: 9, hat: 'none', shirtColor: 3, glasses: 'stars', tool: 'wand' })
    const look = parseKeep(text(d)).look
    expect(look).toEqual({ ...GOOD.look, hair: DEFAULT_LOOK.hair, skin: DEFAULT_LOOK.skin, hat: DEFAULT_LOOK.hat, shirtColor: DEFAULT_LOOK.shirtColor, glasses: 'none', tool: 'hammer' })
    // The jetpack is unlocked in GOOD, so it stays; without the unlock it goes.
    expect(look.bag).toBe('jetpack')
    expect(parseKeep(text({ ...good(), unlocked: [] })).look.bag).toBe('none')
  })

  it('drops unknown and repeated unlocks and keeps the order of the rest', () => {
    const keep = parseKeep(text({ ...good(), unlocked: ['theme:space', 'theme:pool', 7, 'theme:bath', 'theme:space', 'hat:crown'] }))
    expect(keep.unlocked).toEqual(['theme:space', 'theme:bath'])
    expect(parseKeep(text({ ...good(), unlocked: [...PRESENTS] })).unlocked).toEqual(PRESENTS)
  })

  it('empties a slot holding an unknown item or an item of another slot kind', () => {
    const d = good()
    const items = d.plots[0].rooms[0].items as (string | null)[]
    items[0] = 'chandelier'
    items[items.length - 1] = 'planeMobile'
    const keep = parseKeep(text(d))
    const want = [...GOOD.plots[0]!.rooms[0]!.items]
    want[0] = null
    want[want.length - 1] = null
    expect(keep.plots[0]!.rooms[0]!.items).toEqual(want)
  })

  it('fits the items to the shape: missing slots empty, extra ones gone', () => {
    const d = good()
    d.plots[0].rooms[1].items = ['planeMobile']
    d.plots[0].rooms[0].items = [...d.plots[0].rooms[0].items, 'bed', 'bed']
    const keep = parseKeep(text(d))
    expect(keep.plots[0]!.rooms[1]!.items).toEqual(['planeMobile', null, null, null])
    expect(keep.plots[0]!.rooms[0]!.items).toEqual(GOOD.plots[0]!.rooms[0]!.items)
  })

  it('turns an unknown theme into none and bad colourings into the first', () => {
    const d = good()
    Object.assign(d.plots[0].rooms[0], { theme: 'pool', wall: 7, floor: -1 })
    const r = parseKeep(text(d)).plots[0]!.rooms[0]!
    expect([r.theme, r.wall, r.floor]).toEqual([null, 0, 0])
  })

  it('removes a room that no longer fits and gives its goods back', () => {
    const d = good()
    // Out of the grid, on another room, floating with nothing under it, and across two homes of the row house.
    d.plots[0].rooms.push({ ...room(9, 'small', 3, 0), material: 'glass' }, { ...room(10, 'small', 0, 0), material: 'rainbow' }, room(11, 'wide', 1, 3))
    d.plots[1].rooms.push({ ...room(12, 'wide', 1, 0), material: 'planks' })
    const keep = parseKeep(text(d))
    expect(keep.plots[0]!.rooms).toEqual(GOOD.plots[0]!.rooms)
    expect(keep.plots[1]!.rooms).toEqual(GOOD.plots[1]!.rooms)
    expect(keep.goods).toEqual({ ...GOOD.goods, glass: GOOD.goods.glass + 2, rainbow: GOOD.goods.rainbow + 2, bricks: GOOD.goods.bricks + 4, planks: GOOD.goods.planks + 4 })
  })

  it('removes a room with a damaged place and gives its goods back', () => {
    for (const place of [{ col: 0.5 }, { col: -1 }, { row: '1' }, { col: null }, { row: undefined }]) {
      const d = good()
      d.plots[1].rooms.push({ ...room(9, 'big', 0, 0, 'rainbow'), ...place })
      const keep = parseKeep(text(d))
      expect(keep.plots[1]!.rooms, JSON.stringify(place)).toEqual(GOOD.plots[1]!.rooms)
      expect(keep.goods.rainbow, JSON.stringify(place)).toBe(GOOD.goods.rainbow + 8)
    }
  })

  it('takes down a room whose room underneath is gone, and gives both back', () => {
    const d = good()
    d.plots[0].rooms[0].shape = 'castle'
    const keep = parseKeep(text(d))
    // The wide room is not a room any more (nothing to give back); the small room on it no longer rests on anything.
    expect(keep.plots[0]!.rooms.map((r) => r.id)).toEqual([3])
    expect(keep.goods.planks).toBe(GOOD.goods.planks + 2)
  })

  it('fits rooms saved top first, as long as each one rests on another', () => {
    const d = good()
    d.plots[0].rooms.reverse()
    expect(parseKeep(text(d)).plots[0]!.rooms).toEqual([...GOOD.plots[0]!.rooms].reverse())
  })

  it('gives back every room of a house of an unknown kind, and leaves its plot empty', () => {
    const d = good()
    d.plots[1].kind = 'castle'
    const keep = parseKeep(text(d))
    expect(keep.plots[1]).toEqual({ kind: null, roof: 'round', rooms: [] })
    expect(keep.goods.planks).toBe(GOOD.goods.planks + 8)
  })

  it('keeps at most MAX_PLOTS plots, giving back the rooms of the rest, and always one empty plot waiting', () => {
    const d = good()
    d.plots = Array.from({ length: MAX_PLOTS + 2 }, (_, i) => ({ kind: 'tall', roof: 'pointed', rooms: [room(i + 1, 'small', 0, 0)] }))
    const keep = parseKeep(text(d))
    expect(keep.plots).toHaveLength(MAX_PLOTS)
    expect(keep.goods.bricks).toBe(GOOD.goods.bricks + 4)
    const two = good()
    two.plots = [two.plots[0], two.plots[1]]
    const waiting = parseKeep(text(two)).plots
    expect(waiting).toHaveLength(3)
    expect(waiting[2]).toEqual({ kind: null, roof: 'pointed', rooms: [] })
    expect(parseKeep(text({ ...good(), plots: [] })).plots).toEqual(freshKeep().plots)
  })

  it('gives a room with a missing or repeated id a new one, and keeps nextId past every id', () => {
    const d = good()
    d.plots[0].rooms[1].id = 1
    delete d.plots[0].rooms[2].id
    d.nextId = 2
    const keep = parseKeep(text(d))
    const ids = keep.plots.flatMap((p) => p.rooms.map((r) => r.id))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual([1, 5, 6, 4])
    expect(keep.nextId).toBe(7)
  })

  it('turns bad sound switches on, and keeps a bad roof as the pointed one', () => {
    const d = good()
    d.plots[0].roof = 'dome'
    const keep = parseKeep(text({ ...d, sound: 0, music: 'off' }))
    expect([keep.sound, keep.music, keep.plots[0]!.roof]).toEqual([true, true, 'pointed'])
  })
})
