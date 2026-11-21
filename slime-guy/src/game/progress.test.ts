import { afterEach, describe, expect, it, vi } from 'vitest'

import { ITEM_IDS, ITEMS, NO_OUTFIT, PATTERNS, type ItemId } from './closet'
import { COURSE_IDS, type CourseId } from './model'
import {
  FRESH, JAR_SIZE, isOpen, nextGift, parseSave, serializeSave, withBaby, withColour, withFinish, withGift, withLearned, withOutfit, withPattern, withSound,
  withStars, type Save,
} from './progress'

/** A save with a bit of everything: two islands done, babies, bests, things found and worn, a pattern open and on. */
const SOME: Save = {
  done: ['park', 'beach'],
  babies: { park: [true, false, true], beach: [false, true, false], candy: [false, false, false], winter: [false, false, false], night: [false, false, false] },
  best: { park: 2, beach: 4, candy: -1, winter: -1, night: -1 },
  found: ['cap', 'tee', 'backpack', 'sunhat'],
  outfit: { hat: 'sunhat', glasses: null, shirt: 'tee', skirt: null, bag: null, neck: null },
  colour: 'purple',
  pattern: 'dots',
  patterns: ['dots'],
  jar: 37,
  learned: ['spinner', 'fan', 'hole'],
  sound: false,
}

/** Gives the box's next gift until there is none, from `save`, always on island `course`. */
function giftsOf(save: Save, course: CourseId): ItemId[] {
  const gifts: ItemId[] = []
  for (let gift = nextGift(save, course); gift !== null; gift = nextGift(save, course)) {
    gifts.push(gift)
    save = withGift(save, gift)
  }
  return gifts
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FRESH', () => {
  it('is a first visit: nothing found or taught, every best -1, green, sound on', () => {
    expect(FRESH.done).toEqual([])
    for (const id of COURSE_IDS) {
      expect(FRESH.babies[id]).toEqual([false, false, false])
      expect(FRESH.best[id]).toBe(-1)
    }
    expect(FRESH.found).toEqual([])
    expect(FRESH.outfit).toEqual(NO_OUTFIT)
    expect(FRESH.outfit).not.toBe(NO_OUTFIT)
    expect([FRESH.colour, FRESH.pattern, FRESH.patterns, FRESH.jar, FRESH.learned, FRESH.sound]).toEqual(['green', null, [], 0, [], true])
  })

  it('is frozen all the way down, so a stray write throws instead of changing every fresh save', () => {
    expect(() => {
      ;(FRESH as { jar: number }).jar = 5
    }).toThrow()
    expect(() => FRESH.found.push('cap')).toThrow()
    expect(() => {
      FRESH.babies.park[0] = true
    }).toThrow()
    expect(() => {
      FRESH.outfit.hat = 'cap'
    }).toThrow()
    expect(Object.isFrozen(NO_OUTFIT)).toBe(false)
  })
})

describe('parseSave', () => {
  it('starts fresh with nothing stored', () => {
    expect(parseSave(null)).toBe(FRESH)
  })

  it('reads back what serializeSave wrote', () => {
    expect(parseSave(serializeSave(SOME))).toEqual(SOME)
    expect(parseSave(serializeSave(FRESH))).toEqual(FRESH)
  })

  it('starts fresh with a warning for text that is no JSON object', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    for (const text of ['', '{', 'not a save', '{"done": [}', 'null', '42', '"hi"', '[1, 2]']) {
      expect(parseSave(text), text).toBe(FRESH)
    }
    expect(warn).toHaveBeenCalledTimes(8)
  })

  it('reads an empty or a foreign object as fresh, quietly', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(parseSave('{}')).toEqual(FRESH)
    expect(parseSave('{"score": 12, "level": "3"}')).toEqual(FRESH)
    expect(warn).not.toHaveBeenCalled()
  })

  it('keeps what it knows from an old or hand-edited save and drops the rest', () => {
    const text = JSON.stringify({
      v: 7,
      done: ['beach', 'moon', 'park', 'beach'],
      babies: { park: [true, 'yes', true, true], beach: 'all', candy: [false, true], volcano: [true, true, true] },
      best: { park: 4, beach: 5, candy: 1.5, winter: -2, night: '3', volcano: 2 },
      found: ['tee', 'jetpack', 'cap', 'cap', 'heartGlasses'],
      outfit: { hat: 'cap', glasses: 'sunglasses', shirt: 'cap', skirt: 'tutu', bag: 7, tail: 'tee' },
      colour: 'gold',
      pattern: 'stripes',
      patterns: ['glitter', 'dots', 'sparkles'],
      jar: 250,
      learned: ['gate', 'spinner', 'swim'],
      sound: 'off',
    })
    expect(parseSave(text)).toEqual({
      done: ['park', 'beach'],
      babies: { park: [true, false, true], beach: [false, false, false], candy: [false, true, false], winter: [false, false, false], night: [false, false, false] },
      best: { park: 4, beach: -1, candy: -1, winter: -1, night: -1 },
      found: ['cap', 'tee', 'heartGlasses'],
      outfit: { hat: 'cap', glasses: null, shirt: null, skirt: null, bag: null, neck: null },
      colour: 'green',
      pattern: null,
      patterns: ['dots', 'glitter'],
      jar: JAR_SIZE - 1,
      learned: ['spinner', 'gate'],
      sound: true,
    } satisfies Save)
  })

  it('falls back to fresh numbers for a jar or a best that is no whole number in range', () => {
    for (const jar of [-1, 3.5, '12', null]) expect(parseSave(JSON.stringify({ jar })).jar, String(jar)).toBe(0)
    expect(parseSave(JSON.stringify({ jar: 199 })).jar).toBe(199)
    expect(parseSave(JSON.stringify({ best: { park: -1, beach: 0, candy: 4 } })).best).toEqual({ park: -1, beach: 0, candy: 4, winter: -1, night: -1 })
  })

  it('keeps the sound off only when it says false', () => {
    expect(parseSave('{"sound": false}').sound).toBe(false)
    expect(parseSave('{"sound": true}').sound).toBe(true)
    expect(parseSave('{"sound": 0}').sound).toBe(true)
  })
})

describe('isOpen', () => {
  it('opens the first island always and each next one once the one before is done', () => {
    expect(COURSE_IDS.map((_, i) => isOpen(FRESH, i))).toEqual([true, false, false, false, false])
    const park = withFinish(FRESH, 'park', 0)
    expect(COURSE_IDS.map((_, i) => isOpen(park, i))).toEqual([true, true, false, false, false])
    expect(COURSE_IDS.map((_, i) => isOpen(SOME, i))).toEqual([true, true, true, false, false])
  })

  it('keeps a finished island open even when the one before it is not done', () => {
    const night = withFinish(FRESH, 'night', 1)
    expect(COURSE_IDS.map((_, i) => isOpen(night, i))).toEqual([true, false, false, false, true])
  })

  it('throws for an index that is no island', () => {
    for (const i of [-1, 5, 1.5, NaN]) expect(() => isOpen(FRESH, i), String(i)).toThrow()
  })
})

describe('nextGift', () => {
  it("gives the island's own things first in ITEMS order, then the rest in ITEMS order, then null", () => {
    const own = (course: CourseId) => ITEM_IDS.filter((id) => ITEMS[id].course === course)
    for (const course of COURSE_IDS) {
      const gifts = giftsOf(FRESH, course)
      expect(gifts, course).toEqual([...own(course), ...ITEM_IDS.filter((id) => ITEMS[id].course !== course)])
    }
    expect(giftsOf(FRESH, 'park').slice(0, 7)).toEqual(['cap', 'tee', 'backpack', 'roundGlasses', 'flowers', 'denimSkirt', 'sunhat'])
    expect(giftsOf(FRESH, 'night').slice(0, 7)).toEqual(['crown', 'stripes', 'stripeSkirt', 'partySkirt', 'kittyBackpack', 'bowTie', 'cap'])
  })

  it('skips what is found already, whichever island gave it', () => {
    expect(nextGift(SOME, 'park')).toBe('roundGlasses')
    expect(nextGift(SOME, 'beach')).toBe('sunglasses')
    expect(nextGift(withGift(FRESH, 'crown'), 'night')).toBe('stripes')
  })

  it('is null once everything is found', () => {
    const all = ITEM_IDS.reduce(withGift, FRESH)
    for (const course of COURSE_IDS) expect(nextGift(all, course)).toBeNull()
  })
})

describe('withBaby', () => {
  it('finds one baby on one island, and gives the same save for one already found', () => {
    const s = withBaby(FRESH, 'candy', 1)
    expect(s.babies.candy).toEqual([false, true, false])
    for (const id of COURSE_IDS) if (id !== 'candy') expect(s.babies[id]).toEqual([false, false, false])
    expect(withBaby(s, 'candy', 1)).toBe(s)
    expect(withBaby(withBaby(s, 'candy', 0), 'candy', 2).babies.candy).toEqual([true, true, true])
  })
})

describe('withFinish', () => {
  it('marks the island done in COURSE_IDS order and keeps the biggest animal', () => {
    const a = withFinish(FRESH, 'candy', 1)
    expect(a.done).toEqual(['candy'])
    expect(a.best.candy).toBe(1)
    const b = withFinish(a, 'park', 3)
    expect(b.done).toEqual(['park', 'candy'])
    expect(withFinish(b, 'park', 2)).toBe(b)
    expect(withFinish(b, 'park', 4).best).toEqual({ park: 4, beach: -1, candy: 1, winter: -1, night: -1 })
  })

  it('throws for an animal that is no index into ANIMALS', () => {
    for (const animal of [-1, 5, 2.5]) expect(() => withFinish(FRESH, 'park', animal), String(animal)).toThrow()
  })
})

describe('withGift', () => {
  it('finds the thing in ITEMS order and puts it straight on in its slot', () => {
    const a = withGift(FRESH, 'sunglasses')
    expect(a.found).toEqual(['sunglasses'])
    expect(a.outfit).toEqual({ ...NO_OUTFIT, glasses: 'sunglasses' })
    const b = withGift(a, 'cap')
    expect(b.found).toEqual(['cap', 'sunglasses'])
    expect(b.outfit).toEqual({ ...NO_OUTFIT, hat: 'cap', glasses: 'sunglasses' })
    const c = withGift(b, 'crown')
    expect(c.outfit.hat).toBe('crown')
    expect(c.found).toEqual(['cap', 'sunglasses', 'crown'])
  })

  it('puts a thing found already back on, and gives the same save when it is on', () => {
    const s = withOutfit(withGift(FRESH, 'cap'), 'hat', null)
    expect(withGift(s, 'cap').outfit.hat).toBe('cap')
    expect(withGift(s, 'cap').found).toBe(s.found)
    const on = withGift(FRESH, 'tee')
    expect(withGift(on, 'tee')).toBe(on)
  })
})

describe('withStars', () => {
  it('fills the jar, and each full jar opens the next pattern in order and puts it on', () => {
    let s = FRESH
    const opened = []
    for (let i = 0; i < PATTERNS.length; i++) {
      const half = withStars(s, JAR_SIZE / 2)
      expect(half.patterns).toEqual([])
      expect(half.save.jar).toBe(JAR_SIZE / 2)
      const full = withStars(half.save, JAR_SIZE / 2)
      expect(full.patterns).toEqual([PATTERNS[i]])
      expect(full.fireworks).toBe(0)
      expect(full.save.jar).toBe(0)
      expect(full.save.pattern).toBe(PATTERNS[i])
      expect(full.save.patterns).toEqual(PATTERNS.slice(0, i + 1))
      opened.push(...full.patterns)
      s = full.save
    }
    expect(opened).toEqual([...PATTERNS])
    const after = withStars(s, JAR_SIZE + 30)
    expect(after.patterns).toEqual([])
    expect(after.fireworks).toBe(1)
    expect(after.save.jar).toBe(30)
    expect(after.save.pattern).toBe('gold')
  })

  it('carries the stars over a fill, and opens several at once when many come together', () => {
    const r = withStars({ ...FRESH, jar: 190 }, 100)
    expect(r.patterns).toEqual(['dots'])
    expect(r.save.jar).toBe(90)
    const many = withStars(FRESH, JAR_SIZE * 7 + 5)
    expect(many.patterns).toEqual([...PATTERNS])
    expect(many.fireworks).toBe(2)
    expect(many.save.jar).toBe(5)
    expect(many.save.pattern).toBe('gold')
  })

  it('opens the first pattern not open yet, whatever a hand-edited save opened', () => {
    const r = withStars({ ...FRESH, patterns: ['dots', 'glitter'], pattern: null, jar: 199 }, 1)
    expect(r.patterns).toEqual(['stripes'])
    expect(r.save.patterns).toEqual(['dots', 'stripes', 'glitter'])
    expect(r.save.pattern).toBe('stripes')
  })

  it('gives the same save for no stars, and throws for a count that is no whole number', () => {
    expect(withStars(SOME, 0)).toEqual({ save: SOME, patterns: [], fireworks: 0 })
    expect(withStars(SOME, 0).save).toBe(SOME)
    for (const n of [-1, 0.5, NaN]) expect(() => withStars(SOME, n), String(n)).toThrow()
  })
})

describe('withLearned', () => {
  it('keeps the lessons in one order, once each', () => {
    const s = withLearned(withLearned(FRESH, 'gate'), 'spinner')
    expect(s.learned).toEqual(['spinner', 'gate'])
    expect(withLearned(s, 'gate')).toBe(s)
    expect(withLearned(s, 'frame').learned).toEqual(['spinner', 'frame', 'gate'])
  })

  it("keeps the tower's circles after every obstacle, through a save read back", () => {
    const s = withLearned(withLearned(FRESH, 'circle'), 'fan')
    expect(s.learned).toEqual(['fan', 'circle'])
    expect(parseSave(serializeSave(s)).learned).toEqual(['fan', 'circle'])
  })
})

describe('withOutfit', () => {
  it('puts a found thing on and takes a slot off', () => {
    const s = withOutfit(SOME, 'hat', 'cap')
    expect(s.outfit).toEqual({ ...SOME.outfit, hat: 'cap' })
    expect(withOutfit(s, 'hat', null).outfit.hat).toBeNull()
    expect(withOutfit(s, 'bag', 'backpack').outfit).toEqual({ ...SOME.outfit, hat: 'cap', bag: 'backpack' })
    expect(withOutfit(s, 'hat', 'cap')).toBe(s)
    expect(withOutfit(FRESH, 'neck', null)).toBe(FRESH)
  })

  it('throws for a thing not found yet or in the wrong slot', () => {
    expect(() => withOutfit(SOME, 'hat', 'crown')).toThrow(/not found/)
    expect(() => withOutfit(SOME, 'shirt', 'cap')).toThrow(/hat slot/)
    expect(() => withOutfit(FRESH, 'hat', 'cap')).toThrow(/not found/)
  })
})

describe('withColour, withPattern and withSound', () => {
  it('change one thing each, and give the same save when it is so already', () => {
    expect(withColour(SOME, 'orange').colour).toBe('orange')
    expect(withColour(SOME, 'purple')).toBe(SOME)
    expect(withSound(SOME, true).sound).toBe(true)
    expect(withSound(SOME, false)).toBe(SOME)
    expect(withPattern(SOME, null).pattern).toBeNull()
    expect(withPattern(SOME, 'dots')).toBe(SOME)
  })

  it('puts on only a pattern the jar has opened', () => {
    expect(() => withPattern(SOME, 'rainbow')).toThrow(/not open/)
    const all = withStars(FRESH, JAR_SIZE * PATTERNS.length).save
    for (const p of PATTERNS) expect(withPattern(all, p).pattern).toBe(p)
  })
})

describe('every function', () => {
  it('never changes the save it was given', () => {
    const before = serializeSave(SOME)
    withBaby(SOME, 'night', 2)
    withFinish(SOME, 'winter', 3)
    withGift(SOME, 'tutu')
    withStars(SOME, 500)
    withLearned(SOME, 'gate')
    withOutfit(SOME, 'bag', 'backpack')
    withColour(SOME, 'blue')
    withPattern(SOME, null)
    withSound(SOME, true)
    expect(serializeSave(SOME)).toBe(before)
  })

  it('works from FRESH without ever writing into it', () => {
    let s = withBaby(FRESH, 'park', 0)
    s = withFinish(s, 'park', 2)
    s = withGift(s, nextGift(s, 'park')!)
    s = withStars(s, 450).save
    s = withLearned(s, 'hole')
    s = withColour(s, 'pink')
    s = withSound(s, false)
    expect(s).toEqual({
      ...FRESH,
      done: ['park'],
      babies: { ...FRESH.babies, park: [true, false, false] },
      best: { ...FRESH.best, park: 2 },
      found: ['cap'],
      outfit: { ...NO_OUTFIT, hat: 'cap' },
      colour: 'pink',
      pattern: 'stripes',
      patterns: ['dots', 'stripes'],
      jar: 50,
      learned: ['hole'],
      sound: false,
    })
    expect(parseSave(serializeSave(s))).toEqual(s)
  })
})
