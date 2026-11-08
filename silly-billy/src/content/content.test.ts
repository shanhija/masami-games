import { describe, expect, it } from 'vitest'

import { actorNamed } from '../brain/parse'
import type { ItemApi, PuffOpts, WorldApi } from '../engine/api'
import { KID_HEAD_R, eulerXYZ } from '../engine/body'
import { BASIC_COLORS, buildRecipe, parseColor } from '../engine/kit'
import { LANGS } from '../engine/lang'
import { Library } from '../engine/library'
import { PARAM_KINDS } from '../engine/protocol'
import { ROOM_GEO, inWater } from '../engine/rooms'
import { createWorld } from '../engine/sim'
import { ROOMS, ROOM_HALF, restPart, type PartPose, type Shape, type Vec3 } from '../engine/types'
import { matchWord } from '../engine/words'
import { BASIC_VERBS, BUILTIN_ACTIONS, BUILTIN_ITEMS, CAST, LAYOUTS, NEW_NAMES, castNamesFor, colorOf, makeCast } from '.'
import { FINNISH_COLORS } from './colors'

const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })
const info = (kind: string) => library.info(kind)
const meta = (kind: string) => info(kind).recipe.meta
const KINDS = new Set(BUILTIN_ITEMS.map((b) => b.id))

/** [smallest, largest] for the biggest side, and for the height, in metres. */
const SIZES: Record<string, { big: [number, number]; h?: [number, number] }> = {
  slide: { big: [3, 4.5], h: [2, 3.2] },
  swing: { big: [2.5, 4], h: [1.8, 2.8] },
  seesaw: { big: [2.5, 3.6], h: [0.4, 1.2] },
  sandbox: { big: [1.8, 3.2], h: [0.2, 0.9] },
  'climbing-frame': { big: [1.5, 2.6], h: [1.6, 2.6] },
  bench: { big: [1.2, 2], h: [0.6, 1.1] },
  roundabout: { big: [1.8, 3], h: [0.6, 1.3] },
  ball: { big: [0.2, 0.4] },
  football: { big: [0.18, 0.35] },
  bucket: { big: [0.15, 0.45] },
  spade: { big: [0.35, 0.8] },
  tree: { big: [2, 6], h: [3, 6] },
  bush: { big: [0.8, 2.2], h: [0.5, 1.4] },
  flowers: { big: [0.25, 0.7] },
  'lamp-post': { big: [2.5, 4.5], h: [2.5, 4.5] },
  'diving-board': { big: [2.5, 5], h: [1, 2.2] },
  lounger: { big: [1.6, 2.2], h: [0.4, 1] },
  parasol: { big: [1.8, 3], h: [1.8, 3] },
  'swim-ring': { big: [0.5, 1], h: [0.1, 0.3] },
  'beach-ball': { big: [0.3, 0.6] },
  'rubber-duck': { big: [0.15, 0.5] },
  towel: { big: [1, 2], h: [0, 0.25] },
  palm: { big: [2.5, 5], h: [2.5, 5] },
  'lifeguard-chair': { big: [1.8, 3.2], h: [1.8, 3.2] },
  'pool-ladder': { big: [0.6, 2], h: [1, 2] },
  pine: { big: [3.5, 7], h: [3.5, 7] },
  rock: { big: [0.6, 2.2] },
  log: { big: [1.2, 2.5], h: [0.3, 0.8] },
  stump: { big: [0.5, 1.3], h: [0.3, 0.8] },
  mushroom: { big: [0.3, 0.9] },
  tent: { big: [1.5, 3.4], h: [1, 2] },
  campfire: { big: [0.6, 1.4], h: [0.4, 1.2] },
  pinecone: { big: [0.08, 0.3] },
  stick: { big: [0.5, 1.3], h: [0, 0.2] },
  'flower-patch': { big: [0.8, 2] },
  'berry-bush': { big: [0.8, 2] },
  'hair-ponytail': { big: [0.4, 0.95] },
  'hair-short': { big: [0.4, 0.7] },
  'hair-curly': { big: [0.6, 1] },
  'hair-pigtails': { big: [0.5, 1.1] },
  cap: { big: [0.4, 0.75] },
  glasses: { big: [0.3, 0.6] },
  goal: { big: [2.2, 3], h: [1, 1.5] },
}

/** Points on the model kid's face that hair and hats must leave showing: the middle, the eyes, the mouth. */
const FACE: Vec3[] = [
  [0, 0, KID_HEAD_R],
  [0.08, 0.03, 0.215],
  [-0.08, 0.03, 0.215],
  [0, -0.08, 0.215],
]

/** Whether a point is inside a sphere shape (stretched and turned by its scale and rot), grown by `grow` metres. */
function inSphere(s: Shape, p: Vec3, grow = 0): boolean {
  const r = s.dims[0]!
  const d = [p[0] - s.at[0], p[1] - s.at[1], p[2] - s.at[2]]
  const m = eulerXYZ(s.rot[0], s.rot[1], s.rot[2])
  const local = [0, 1, 2].map((c) => m[c]! * d[0]! + m[3 + c]! * d[1]! + m[6 + c]! * d[2]!)
  return local.reduce((sum, v, i) => sum + (v / (r * s.scale[i]! + grow)) ** 2, 0) < 1
}

/** Directions spread evenly over a ball. */
function spherePoints(n = 200): Vec3[] {
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n
    const r = Math.sqrt(1 - y * y)
    const a = i * Math.PI * (3 - Math.sqrt(5))
    return [Math.cos(a) * r, y, Math.sin(a) * r] as Vec3
  })
}

/** How close a point comes to a tube shape's middle line. */
function tubeGap(s: Shape, p: Vec3): number {
  const pts = s.points!
  let best = Infinity
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const ab = [0, 1, 2].map((c) => b[c]! - a[c]!)
    const ap = [0, 1, 2].map((c) => p[c]! - a[c]!)
    const k = Math.max(0, Math.min(1, (ab[0]! * ap[0]! + ab[1]! * ap[1]! + ab[2]! * ap[2]!) / (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2)))
    best = Math.min(best, Math.hypot(ap[0]! - ab[0]! * k, ap[1]! - ab[1]! * k, ap[2]! - ab[2]! * k))
  }
  return best - s.dims[0]!
}

describe('the built-in things', () => {
  it('build with the kit, with nothing to correct', () => {
    for (const b of BUILTIN_ITEMS) {
      const { recipe, notes } = buildRecipe(b.build)
      expect(notes, b.id).toEqual([])
      expect(recipe.shapes.length, b.id).toBeLessThanOrEqual(60)
    }
  })

  it('have names, words about them, and Finnish calls that find them', () => {
    expect(KINDS.size).toBe(BUILTIN_ITEMS.length)
    for (const b of BUILTIN_ITEMS) {
      expect(b.id, b.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
      expect(b.name.length, b.id).toBeGreaterThan(0)
      expect(b.about.length, b.id).toBeGreaterThan(10)
      expect(b.calls.length, b.id).toBeGreaterThan(3)
      expect(new Set(b.calls).size, b.id).toBe(b.calls.length)
      for (const call of b.calls) {
        expect(call, b.id).toBe(call.toLowerCase())
        expect(library.itemKindFor(call), `${b.id}: ${call}`).toBe(b.id)
      }
    }
  })

  it('have a Finnish name, the base form a child says, among their calls', () => {
    for (const b of BUILTIN_ITEMS) {
      expect(b.nameFi, b.id).toMatch(/^[a-zäö]+( [a-zäö]+)?$/)
      expect(b.calls, b.id).toContain(b.nameFi)
      expect(library.items.get(b.id)!.nameFi, b.id).toBe(b.nameFi)
      expect(info(b.id).nameFi, b.id).toBe(b.nameFi)
    }
    expect(['ball', 'slide', 'swing', 'pine', 'cap'].map((k) => info(k).nameFi)).toEqual(['pallo', 'liukumäki', 'keinu', 'kuusi', 'lippis'])
  })

  it('find a thing from the forms a child says', () => {
    expect(library.itemKindFor('pallolle')).toBe('ball')
    expect(library.itemKindFor('liukumäkeen')).toBe('slide')
    expect(library.itemKindFor('keinuun')).toBe('swing')
    expect(library.itemKindFor('penkille')).toBe('bench')
    expect(library.itemKindFor('nuotiolle')).toBe('campfire')
    expect(library.itemKindFor('kissa')).toBeNull()
  })

  it('are about as big as the real thing', () => {
    expect(Object.keys(SIZES).sort()).toEqual([...KINDS].sort())
    for (const [kind, want] of Object.entries(SIZES)) {
      const [w, h, d] = info(kind).size
      const big = Math.max(w, h, d)
      expect(big, kind).toBeGreaterThanOrEqual(want.big[0])
      expect(big, kind).toBeLessThanOrEqual(want.big[1])
      if (want.h) {
        expect(h, kind).toBeGreaterThanOrEqual(want.h[0])
        expect(h, kind).toBeLessThanOrEqual(want.h[1])
      }
    }
  })

  it('stand on the ground', () => {
    for (const b of BUILTIN_ITEMS) {
      if (meta(b.id).wear !== null) continue
      const { min } = info(b.id).recipe.bounds
      // The pool ladder reaches down into the water; the others stand on y = 0 (a rock and a tyre sink in a little).
      expect(min[1], b.id).toBeGreaterThanOrEqual(b.id === 'pool-ladder' ? -0.8 : -0.35)
      expect(min[1], b.id).toBeLessThanOrEqual(0.05)
    }
  })

  it('behave like what they are', () => {
    for (const kind of ['ball', 'football', 'beach-ball', 'bucket', 'spade', 'flowers', 'rubber-duck', 'pinecone', 'stick']) expect(meta(kind).carry, kind).toBe('hand')
    for (const kind of ['slide', 'swing', 'seesaw', 'climbing-frame', 'roundabout', 'tree', 'pine', 'tent', 'diving-board', 'palm']) expect(meta(kind).carry, kind).toBe('no')
    for (const kind of ['swing', 'seesaw', 'roundabout']) expect(meta(kind).ride, kind).toBe(true)
    for (const kind of ['bench', 'rock', 'log', 'stump', 'lounger', 'lifeguard-chair']) expect(meta(kind).sit, kind).toBe(true)
    expect(meta('ball').bouncy).toBeGreaterThan(0.6)
    expect(meta('swim-ring').bouncy).toBeGreaterThan(0.4)
    expect(info('swing').recipe.parts.map((p) => p.name)).toEqual(['seat1', 'seat2'])
    expect(info('swing').recipe.anchors.seat).toEqual(info('swing').recipe.anchors.seat1)
    expect(info('seesaw').recipe.parts.map((p) => p.name)).toEqual(['plank'])
    expect(info('roundabout').recipe.parts.map((p) => p.name)).toEqual(['top'])
    expect(info('campfire').recipe.shapes.some((s) => s.glow)).toBe(true)
    expect(info('lamp-post').recipe.shapes.some((s) => s.glow)).toBe(true)
  })

  it('include worn things that fit the model kid and leave the face showing', () => {
    const worn = BUILTIN_ITEMS.filter((b) => meta(b.id).wear !== null)
    expect(worn.map((b) => b.id).sort()).toEqual(['cap', 'glasses', 'hair-curly', 'hair-pigtails', 'hair-ponytail', 'hair-short'])
    for (const b of worn) {
      const slot = meta(b.id).wear
      const { recipe } = info(b.id)
      const { min, max } = recipe.bounds
      expect(slot === 'hair' || slot === 'head' || slot === 'face', b.id).toBe(true)
      // Around the head: the origin is its middle, a ball of radius 0.23.
      expect(Math.max(-min[0], max[0]), b.id).toBeLessThan(0.55)
      expect(min[1], b.id).toBeGreaterThan(-0.6)
      expect(max[1], b.id).toBeLessThan(0.5)
      expect(min[2], b.id).toBeGreaterThan(-0.6)
      expect(max[2], b.id).toBeLessThan(0.45)
      if (slot === 'face') expect(max[2], b.id).toBeGreaterThan(KID_HEAD_R)
      else expect(max[1], b.id).toBeGreaterThan(KID_HEAD_R)
      for (const s of recipe.shapes) {
        for (const p of FACE) {
          if (s.kind === 'sphere') expect(inSphere(s, p), `${b.id} covers the face at ${p}`).toBe(false)
          if (s.kind === 'tube') expect(tubeGap(s, p), `${b.id} covers the face at ${p}`).toBeGreaterThan(0.02)
        }
      }
    }
  })

  it('include a cap that sits over every hair but the big curls', () => {
    const top = (kind: string) => info(kind).recipe.bounds.max[1]
    for (const hair of ['hair-short', 'hair-ponytail', 'hair-pigtails']) expect(top('cap'), hair).toBeGreaterThan(top(hair) + 0.005)
    // Over the fringe and the quiff too: Steve's quiff poked out of his cap's crown, a black blob on his forehead.
    const crown = info('cap').recipe.shapes.filter((s) => s.kind === 'sphere')
    for (const hair of ['hair-short', 'hair-ponytail', 'hair-pigtails']) {
      for (const s of info(hair).recipe.shapes) {
        if (s.kind !== 'sphere' || s.at[1] < 0.1 || s.at[2] < 0) continue
        for (const d of spherePoints()) {
          const p: Vec3 = [s.at[0] + d[0] * s.dims[0]! * s.scale[0], s.at[1] + d[1] * s.dims[0]! * s.scale[1], s.at[2] + d[2] * s.dims[0]! * s.scale[2]]
          expect(crown.some((c) => inSphere(c, p, -0.012)), `${hair} shows through the cap at ${p.map((v) => v.toFixed(3))}`).toBe(true)
        }
      }
    }
  })

  it('include a campfire whose flames flicker and smoke by themselves', () => {
    const fire = BUILTIN_ITEMS.find((b) => b.id === 'campfire')!
    const parts: Record<string, PartPose> = {}
    const puffs: PuffOpts[] = []
    const it = { x: 1, y: 0, z: 2, scale: 1, part: (name: string) => (parts[name] ??= restPart()) } as unknown as ItemApi
    const w = { t: 0, random: () => 0.001, puff: (o: PuffOpts) => puffs.push(o) } as unknown as WorldApi & { t: number }
    const seen = new Set<number>()
    for (let i = 0; i < 30; i++) {
      w.t = i * 0.1
      fire.tick!(it, w, 1 / 60)
      seen.add(Math.round(parts.flame1!.s * 100))
      for (const name of ['flame1', 'flame2', 'flame3']) {
        expect(parts[name]!.s).toBeGreaterThan(0.5)
        expect(parts[name]!.s).toBeLessThan(1.3)
      }
    }
    expect(seen.size).toBeGreaterThan(10)
    expect(puffs.some((p) => p.kind === 'smoke')).toBe(true)
  })
})

describe('the basic verbs', () => {
  const VERBS = ['walk', 'run', 'come', 'pick-up', 'drop', 'give', 'jump', 'wave', 'sit', 'sleep', 'spin', 'say', 'follow', 'look', 'make', 'remove', 'wear', 'take-off', 'paint', 'grow', 'shrink', 'rename']
  /** Said for more than one verb on purpose: "anna hänelle kihara tukka" is wear, "anna pallo" is give; the parser picks by the thing. */
  const SHARED = new Set(['anna'])

  it('are the 22 of the plan', () => {
    expect(BASIC_VERBS.map((a) => a.id)).toEqual(VERBS)
  })

  it('have valid params and Finnish calls that find them', () => {
    for (const a of BASIC_VERBS) {
      expect(a.about.length, a.id).toBeGreaterThan(10)
      expect(new Set(a.params.map((p) => p.name)).size, a.id).toBe(a.params.length)
      for (const p of a.params) {
        expect(p.name, a.id).toMatch(/^[a-z]+$/)
        expect(PARAM_KINDS, a.id).toContain(p.kind)
        expect(p.about.length, a.id).toBeGreaterThan(3)
      }
      expect(a.calls.length, a.id).toBeGreaterThan(5)
      expect(new Set(a.calls).size, a.id).toBe(a.calls.length)
      for (const call of a.calls) {
        expect(call, a.id).toBe(call.toLowerCase())
        if (!SHARED.has(call)) expect(library.actionFor(call), `${a.id}: ${call}`).toBe(a.id)
      }
    }
  })

  it('have a Finnish name, the way a child says it to someone, among their calls', () => {
    for (const a of BASIC_VERBS) {
      expect(a.nameFi, a.id).toMatch(/^[a-zäö]+$/)
      expect(a.calls, a.id).toContain(a.nameFi)
      expect(library.actions.get(a.id)!.nameFi, a.id).toBe(a.nameFi)
    }
    expect(['jump', 'pick-up', 'give', 'take-off'].map((id) => library.actions.get(id)!.nameFi)).toEqual(['hyppää', 'ota', 'anna', 'riisu'])
  })

  it('take a new thing to make or wear as words, and a colour', () => {
    const kinds = (id: string) => BASIC_VERBS.find((a) => a.id === id)!.params.map((p) => `${p.name}:${p.kind}${p.optional ? '?' : ''}`)
    expect(kinds('make')).toEqual(['thing:text', 'color:text?'])
    expect(kinds('wear')).toEqual(['thing:text', 'color:text?'])
    expect(kinds('paint')).toEqual(['color:text', 'thing:thing?', 'part:text?'])
    expect(kinds('rename')).toEqual(['name:text', 'who:actor?'])
    expect(kinds('give')).toEqual(['thing:item?', 'to:actor'])
    expect(kinds('come')).toEqual([])
  })

  it('find a verb from the forms a child says', () => {
    expect(library.actionFor('hyppää')).toBe('jump')
    expect(library.actionFor('heitä')).toBeNull()
    expect(library.actionFor('istuu')).toBe('sit')
    expect(library.actionFor('maalaa')).toBe('paint')
  })

  it('take a word one letter off only with the same first letter, and tell it was a guess', () => {
    // From play: 'lennä kuuhun' (fly to the moon) walked to a tree, 'kanna Mirriä' (carry) was give, 'nakki' was a cap.
    expect(library.actionFor('lennä')).toBeNull()
    expect(library.itemKindFor('kuuhun')).toBeNull()
    expect(library.actionFor('kanna')).toBeNull()
    expect(library.actionFor('sulje')).toBeNull()
    for (const word of ['nakki', 'miekka', 'sukat', 'pieni']) expect(library.itemKindFor(word), word).toBeNull()
    // 'laske' is put down; the parser is sure of it only with a thing that can be carried.
    expect(library.actionFor('laske')).toBe('drop')
    expect(library.actionFor('laske maahan')).toBe('drop')
    // With the first letter it is still a guess, and the parser can leave guesses out.
    expect(library.matchForm('actions', 'kirjaa')).toEqual({ id: 'run', form: 'near' })
    expect(library.actionFor('kirjaa', { near: false })).toBeNull()
    expect(library.actionFor('hyppää', { near: false })).toBe('jump')
  })
})

describe('colour words', () => {
  it('read Finnish and English the way a child says them', () => {
    expect(colorOf('punaiseksi')).toBe(parseColor('red'))
    expect(colorOf('sininen')).toBe(parseColor('blue'))
    expect(colorOf('vaaleanpunainen')).toBe(parseColor('pink'))
    expect(colorOf('vihreäksi')).toBe(parseColor('green'))
    expect(colorOf('keltainen')).toBe(parseColor('yellow'))
    expect(colorOf('pink')).toBe(parseColor('pink'))
    expect(colorOf('#ff69b4')).toBe('#ff69b4')
    expect(colorOf('koira')).toBeNull()
    expect(colorOf('100')).toBeNull()
    expect(colorOf('bad')).toBeNull()
    expect(colorOf('kissa')).toBeNull()
    expect(colorOf(null)).toBeNull()
  })

  it("take only the game's own colour names, not every CSS one a designer may use", () => {
    // Said by a child these are things and words: 'make a seashell' is for the designer, 'peru' is cancel.
    for (const word of ['seashell', 'honeydew', 'peru', 'sienna', 'linen', 'thistle', 'moccasin', 'bisque', 'azure', 'Constructor', '__proto__']) {
      expect(colorOf(word), word).toBeNull()
    }
    expect(parseColor('seashell')).toBe('#fff5ee')
    for (const [stem, color] of FINNISH_COLORS) expect(colorOf(stem), stem).toBe(BASIC_COLORS.get(color))
  })
})

describe('the cast', () => {
  it('is alice, steve, mike, noora and mirri the cat', () => {
    expect(CAST.map((c) => c.id)).toEqual(['alice', 'steve', 'mike', 'noora', 'mirri'])
    expect(CAST.map((c) => c.look.body)).toEqual(['kid', 'kid', 'grownup', 'kid', 'cat'])
  })

  it('wears only things that exist, each in its own slot', () => {
    for (const c of CAST) {
      for (const [slot, worn] of Object.entries(c.look.worn)) {
        expect(KINDS.has(worn.kind), `${c.id} wears ${worn.kind}`).toBe(true)
        expect(meta(worn.kind).wear, `${c.id} wears ${worn.kind}`).toBe(slot)
        if (worn.tint !== null) expect(parseColor(worn.tint), c.id).not.toBeNull()
      }
      for (const color of [c.look.skin, c.look.eyes, c.look.top, c.look.bottom, c.look.shoes]) expect(parseColor(color), c.id).toBe(color)
    }
  })

  it('looks different from far away', () => {
    const tops = new Set(CAST.map((c) => c.look.top))
    const hair = new Set(CAST.map((c) => `${c.look.worn.hair?.kind}/${c.look.worn.hair?.tint}`))
    expect(tops.size).toBe(CAST.length)
    expect(hair.size).toBe(CAST.length)
    for (const c of CAST) {
      const [lo, hi] = c.look.body === 'grownup' ? [1.5, 2] : c.look.body === 'kid' ? [0.95, 1.35] : [0.3, 0.7]
      expect(c.look.height, c.id).toBeGreaterThanOrEqual(lo)
      expect(c.look.height, c.id).toBeLessThanOrEqual(hi)
    }
  })

  it('is Aino, Eetu, Mikko, Noora and Mirri in Finnish and Alice, Steve, Mike, Nora and Luna in English, with the same ids', () => {
    expect(CAST.map((c) => c.names.fi.name)).toEqual(['Aino', 'Eetu', 'Mikko', 'Noora', 'Mirri'])
    expect(CAST.map((c) => c.names.en.name)).toEqual(['Alice', 'Steve', 'Mike', 'Nora', 'Luna'])
    for (const lang of LANGS) {
      const cast = makeCast(lang)
      expect(cast.map((a) => a.id), lang).toEqual(['alice', 'steve', 'mike', 'noora', 'mirri'])
      expect(cast.map((a) => a.name), lang).toEqual(CAST.map((c) => c.names[lang].name))
      cast.forEach((a, i) => {
        expect(a.names, a.id).toEqual(CAST[i]!.names)
        expect(a.calls, a.id).toEqual([...new Set([...CAST[i]!.names[lang].calls, a.name.toLowerCase(), a.id])])
      })
      // A world in the other language calls them by its names.
      const other = lang === 'fi' ? 'en' : 'fi'
      const w = createWorld({ room: 'playground', actors: cast, layouts: LAYOUTS, seed: 1, lang: other })
      expect(w.actors.map((a) => a.name), lang).toEqual(CAST.map((c) => c.names[other].name))
    }
  })

  it('answers in each language to its own names only', () => {
    for (const lang of LANGS) {
      const all = CAST.flatMap((c) => [...new Set([c.id, c.names[lang].name.toLowerCase(), ...c.names[lang].calls])])
      expect(new Set(all).size, lang).toBe(all.length)
      for (const c of CAST) {
        expect(c.names[lang].calls, `${c.id} ${lang}`).toContain(c.names[lang].name.toLowerCase())
        for (const call of c.names[lang].calls) expect(call, `${c.id} ${lang}`).toBe(call.toLowerCase().trim())
      }
    }
  })

  it('keeps the cat’s words on the cat in both languages', () => {
    const cat = CAST.find((c) => c.id === 'mirri')!
    for (const lang of LANGS) for (const word of ['kissa', 'kisu', 'katti', 'cat', 'kitty']) expect(cat.names[lang].calls, `${lang} ${word}`).toContain(word)
  })

  it('finds each one by the forms of its name a child says, Mikko by Mikolle and Mikon too', () => {
    for (const lang of LANGS) {
      const world = createWorld({ room: 'playground', actors: makeCast(lang), layouts: LAYOUTS, seed: 1, lang })
      const entries = world.actors.map((a) => ({ id: a.id, words: [a.id, a.name, ...a.calls] }))
      for (const a of world.actors) {
        for (const word of [a.name, ...a.calls]) {
          expect(actorNamed(word, world), `${lang}: ${word}`).toBe(a.id)
          expect(matchWord(word, entries), `${lang}: ${word}`).toBe(a.id)
        }
      }
    }
    const fi = createWorld({ room: 'playground', actors: makeCast('fi'), layouts: LAYOUTS, seed: 1, lang: 'fi' })
    const entries = fi.actors.map((a) => ({ id: a.id, words: [a.id, a.name, ...a.calls] }))
    const forms: Record<string, string> = { Mikolle: 'mike', Mikon: 'mike', Mikkoa: 'mike', Mikolla: 'mike', Ainolle: 'alice', Eetun: 'steve', Nooralle: 'noora', Mirrille: 'mirri', kissalle: 'mirri' }
    for (const [word, id] of Object.entries(forms)) expect(actorNamed(word, fi), word).toBe(id)
    for (const word of ['mikolle', 'mikon', 'mikolla']) expect(matchWord(word, entries), word).toBe('mike')
  })

  it('gives new avatars other common names in each language, easy to tell apart when heard', () => {
    const castNames = CAST.flatMap((c) => LANGS.flatMap((l) => [c.names[l].name.toLowerCase(), ...c.names[l].calls]))
    /** Whether the word `a` would be taken for `b`: the same, `b` with an ending, or one letter off. */
    const heardAs = (a: string, b: string) => matchWord(a, [{ id: 'x', words: [b] }]) !== null
    const oneOff = (a: string, b: string) => heardAs(a, b) || heardAs(b, a)
    for (const lang of LANGS) {
      const names = NEW_NAMES[lang]
      expect(names.length, lang).toBe(10)
      expect(new Set(names.map((n) => n[0])).size, `${lang}: each starts with its own letter`).toBe(names.length)
      for (const name of names) {
        const word = name.toLowerCase()
        expect(name, lang).toMatch(/^[A-Z][a-z]+$/)
        expect(castNames, `${lang}: ${name}`).not.toContain(word)
        for (const call of castNames) expect(oneOff(word, call), `${name} sounds like ${call}`).toBe(false)
        for (const other of names) if (other !== name) expect(oneOff(word, other.toLowerCase()), `${name} sounds like ${other}`).toBe(false)
        // Not a word a child says in a command: no verb, thing or colour.
        expect(library.actionFor(word, { near: false }), name).toBeNull()
        expect(library.itemKindFor(word, { near: false }), name).toBeNull()
        expect(colorOf(word), name).toBeNull()
      }
    }
    // The Finnish ones keep their consonants in every form (no Mikko, Mikon): Ellalle, Hugon.
    for (const name of NEW_NAMES.fi) expect(name.toLowerCase(), name).not.toMatch(/kk|pp|tt|nk|mp|lt|nt|rt/)
    // The lists are not alike either: an avatar made in one language keeps its name in the other.
    for (const fi of NEW_NAMES.fi) for (const en of NEW_NAMES.en) expect(fi === en || oneOff(fi.toLowerCase(), en.toLowerCase()), `${fi} and ${en}`).toBe(false)
  })

  it('tells a saved starting avatar’s own name from one the child gave it', () => {
    const alice = CAST.find((c) => c.id === 'alice')!
    expect(castNamesFor('alice', 'Alice')).toEqual(alice.names)
    expect(castNamesFor('alice', 'aino')).toEqual(alice.names)
    expect(castNamesFor('alice', 'Pupu')).toBeNull()
    // Saved before the cast had two languages: Noora and Mirri were their English names, now their Finnish ones.
    expect(castNamesFor('noora', 'Noora')).not.toBeNull()
    expect(castNamesFor('mirri', 'Mirri')).not.toBeNull()
    expect(castNamesFor('ella', 'Ella')).toBeNull()
  })
})

describe('the rooms', () => {
  /** How far a placement's footprint is from the spawn row (z 4 to 5, x -7 to 7). */
  const fromSpawn = (x: number, z: number) => Math.hypot(Math.max(0, Math.abs(x) - 7), Math.max(0, 4 - z, z - 5))

  for (const room of ROOMS) {
    describe(room, () => {
      const layout = LAYOUTS[room]

      it('has 20 to 35 things, all of kinds that exist', () => {
        expect(layout.length).toBeGreaterThanOrEqual(20)
        expect(layout.length).toBeLessThanOrEqual(35)
        for (const p of layout) expect(KINDS.has(p.kind), p.kind).toBe(true)
      })

      it('keeps everything inside the room and clear of the spawn row', () => {
        for (const p of layout) {
          const r = info(p.kind).radius
          expect(Math.abs(p.x) + r, `${p.kind} at ${p.x},${p.z}`).toBeLessThanOrEqual(ROOM_HALF - 0.1)
          expect(Math.abs(p.z) + r, `${p.kind} at ${p.x},${p.z}`).toBeLessThanOrEqual(ROOM_HALF - 0.1)
          expect(fromSpawn(p.x, p.z) - r, `${p.kind} at ${p.x},${p.z}`).toBeGreaterThanOrEqual(2.5)
        }
      })

      it('fixes the furniture and leaves what can be carried loose', () => {
        for (const p of layout) expect(p.fixed === true, `${p.kind} at ${p.x},${p.z}`).toBe(meta(p.kind).carry === 'no')
      })

      it('leaves room to walk between solid things, and nothing loose inside them', () => {
        // Fixed things people walk through (a parasol over a lounger, a sandbox) may overlap.
        const solid = layout.filter((p) => meta(p.kind).solid)
        for (const a of layout) {
          for (const b of solid) {
            if (a === b || (a.fixed && !meta(a.kind).solid)) continue
            const gap = Math.hypot(a.x - b.x, a.z - b.z) - info(a.kind).radius - info(b.kind).radius
            expect(gap, `${a.kind} at ${a.x},${a.z} and ${b.kind} at ${b.x},${b.z}`).toBeGreaterThanOrEqual(meta(a.kind).solid ? 0.3 : 0)
          }
        }
      })
    })
  }

  it('keeps the forest pond clear', () => {
    const pond = ROOM_GEO.forest.water[0]!
    expect(pond.kind).toBe('circle')
    if (pond.kind !== 'circle') return
    for (const p of LAYOUTS.forest) expect(Math.hypot(p.x - pond.x, p.z - pond.z) - info(p.kind).radius, `${p.kind} at ${p.x},${p.z}`).toBeGreaterThanOrEqual(pond.r + 0.2)
  })

  it('stands the diving board and the ladders at the pool edge, facing the water', () => {
    const edge = LAYOUTS.pool.filter((p) => p.kind === 'diving-board' || p.kind === 'pool-ladder')
    expect(edge.map((p) => p.kind).sort()).toEqual(['diving-board', 'pool-ladder', 'pool-ladder'])
    for (const p of edge) {
      const yaw = p.yaw ?? 0
      expect(inWater('pool', p.x, p.z), p.kind).toBe(false)
      expect(inWater('pool', p.x + Math.sin(yaw), p.z + Math.cos(yaw)), p.kind).toBe(true)
      expect(inWater('pool', p.x - Math.sin(yaw) * 0.3, p.z - Math.cos(yaw) * 0.3), p.kind).toBe(false)
    }
    for (const p of LAYOUTS.pool) if (p.fixed) expect(inWater('pool', p.x, p.z), `${p.kind} at ${p.x},${p.z}`).toBe(false)
  })
})
