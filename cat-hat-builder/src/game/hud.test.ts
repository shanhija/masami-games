import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { BuildTray } from '../BuildTray'

import { LOCKED_THEMES, LOOK_OPTIONS, openThemes, roomCost } from './catalog'
import { demoKeep } from './fixtures'
import { GO_PULSE, HAND_FOR, hudView, NIGHT_CARD, NOPE_FOR, sameHud, tripProgress } from './hud'
import { PRESENT_FOR, PRESENT_POP } from './layout'
import { HAT_COLORS, MATERIALS, PARTS, SHAPES, STEP, THEMES, WEAR_COLORS, ticks, type Look, type Material, type State, type Unlock } from './model'
import { freshKeep } from './progress'
import { makeRoad, startRoad } from './road'
import type { Game } from './game'
import { act, createState, step } from './rules'

/** A state on the street demo (eight trips, every machine built, three houses), showing `shot`. */
function street(): State {
  return createState(demoKeep('street'), 1, false)
}
const at = (s: State, seconds: number) => s.tick * STEP + seconds

describe('the top of the screen', () => {
  it("shows the builder's face on the street, a house on the road, a back arrow elsewhere, and nothing while night falls", () => {
    const s = street()
    expect(hudView(s, 0, null).back).toBe('face')
    s.shot = { kind: 'plot', plot: 0 }
    expect(hudView(s, 0, null).back).toBe('back')
    s.shot = { kind: 'mirror' }
    expect(hudView(s, 0, null).back).toBe('back')
    s.shot = { kind: 'road' }
    s.road = startRoad(makeRoad('forest', 2, 7))
    expect(hudView(s, 0, null).back).toBe('home')
    s.shot = { kind: 'street', x: 30 }
    s.night = { at: 0, dark: [-1, -1, -1, -1], doneAt: -1 }
    expect(hudView(s, 0, null).back).toBeNull()
  })

  it('shows the moon on the street only, and not once night falls', () => {
    const s = street()
    expect(hudView(s, 0, null).moon).toBe(true)
    s.shot = { kind: 'plot', plot: 0 }
    expect(hudView(s, 0, null).moon).toBe(false)
    s.shot = { kind: 'street', x: 30 }
    s.night = { at: 0, dark: [-1, -1, -1, -1], doneAt: -1 }
    expect(hudView(s, 0, null).moon).toBe(false)
  })
})

describe('the wardrobe', () => {
  it('offers the open options of the open tab, the one worn marked', () => {
    const s = createState(freshKeep(), 1, true)
    s.keep.look = { ...s.keep.look, bag: 'teddy', hat: 'green', pants: 'dungarees' }
    s.tab = 'bag'
    const w = hudView(s, 0, null).wardrobe!
    expect(w.options.map((o) => o.patch.bag)).toEqual(['none', 'school', 'teddy', 'toolbox'])
    expect(w.options.filter((o) => o.on).map((o) => o.patch.bag)).toEqual(['teddy'])
    s.keep.unlocked = ['bag:cat']
    expect(hudView(s, 0, null).wardrobe!.options.map((o) => o.patch.bag)).toEqual(['none', 'school', 'teddy', 'toolbox', 'cat'])
    s.tab = 'hat'
    expect(hudView(s, 0, null).wardrobe!.options.map((o) => o.patch.hat)).toEqual([...HAT_COLORS])
  })

  it('offers in each tab exactly what the rules let the builder wear', () => {
    for (const unlocked of [[], ['bag:jetpack', 'tool:wand', 'glasses:stars', 'shoes:lights']] as Unlock[][]) {
      const s = createState({ ...freshKeep(), unlocked }, 1, true)
      for (const tab of PARTS) {
        s.tab = tab
        const shown = hudView(s, 0, null).wardrobe!.options.map((o) => o.patch[tab])
        const worn = (LOOK_OPTIONS[tab] as readonly Look[typeof tab][]).filter((v) => {
          act(s, { kind: 'wear', patch: { [tab]: v } })
          return s.keep.look[tab] === v
        })
        expect(shown, `${tab} with ${unlocked.join(', ')}`).toEqual(worn)
      }
    }
  })

  it('never offers more than eight options a tab', () => {
    const s = createState({ ...freshKeep(), unlocked: ['bag:jetpack', 'bag:cat', 'tool:wand', 'shoes:lights', 'shoes:cowboy', 'glasses:stars', 'glasses:hearts'] }, 1, true)
    for (const tab of ['hat', 'hair', 'skin', 'glasses', 'shirt', 'bag', 'pants', 'shoes', 'tool'] as const) {
      s.tab = tab
      expect(hudView(s, 0, null).wardrobe!.options.length, tab).toBeLessThanOrEqual(8)
    }
  })

  it('has a colour row for hair, shirt and trousers, and none for jeans, which are always denim', () => {
    const s = createState(freshKeep(), 1, true)
    s.keep.look = { ...s.keep.look, pants: 'jeans', shirtColor: 'teal' }
    s.tab = 'shirt'
    const shirt = hudView(s, 0, null).wardrobe!.colours
    expect(shirt.map((c) => c.patch.shirtColor)).toEqual([...WEAR_COLORS])
    expect(shirt.filter((c) => c.on).map((c) => c.patch.shirtColor)).toEqual(['teal'])
    s.tab = 'pants'
    expect(hudView(s, 0, null).wardrobe!.colours).toEqual([])
    s.keep.look.pants = 'shorts'
    expect(hudView(s, 0, null).wardrobe!.colours).toHaveLength(WEAR_COLORS.length)
    s.tab = 'tool'
    expect(hudView(s, 0, null).wardrobe!.colours).toEqual([])
  })

  it('lets the dice be undone only after a roll, and pulses Go! after 20 s at the mirror', () => {
    const s = createState(freshKeep(), 1, true)
    expect(hudView(s, 0, null).wardrobe!.undo).toBe(false)
    s.lookUndo.push(s.keep.look)
    expect(hudView(s, 0, null).wardrobe!.undo).toBe(true)
    expect(hudView(s, GO_PULSE - 0.1, null).wardrobe!.go).toBe(false)
    expect(hudView(s, GO_PULSE, null).wardrobe!.go).toBe(true)
    s.shotAt = 600
    expect(hudView(s, GO_PULSE + 5, null).wardrobe!.go).toBe(false)
  })
})

describe('the build tray', () => {
  it('counts every material, and says which pay for the picked shape and which shapes the picked material pays for', () => {
    const s = street()
    s.shot = { kind: 'plot', plot: 2 }
    s.keep.goods = { ...s.keep.goods, planks: 8, bricks: 4, concrete: 3, glass: 2, rainbow: 0 }
    s.material = 'bricks'
    s.shape = 'wide'
    const b = hudView(s, 0, null).build!
    expect(b.goods.map((g) => [g.material, g.n, g.afford])).toEqual([
      ['planks', 8, true],
      ['bricks', 4, true],
      ['concrete', 3, false],
      ['glass', 2, false],
      ['rainbow', 0, false],
    ])
    expect(b.shapes.map((x) => [x.shape, x.afford])).toEqual([
      ['small', true],
      ['wide', true],
      ['tall', true],
      ['big', false],
    ])
    expect(b.doorbell).toBe(true)
    expect(b.kind).toBe('tall')
    expect(b.roof).toBe(s.keep.plots[2]!.roof)
  })

  it("lights a material and a shape exactly when the rules' room price is paid", () => {
    const s = street()
    s.shot = { kind: 'plot', plot: 2 }
    for (const n of [0, 1, 2, 3, 4, 7, 8]) {
      s.keep.goods.glass = n
      s.material = 'glass'
      for (const shape of SHAPES) {
        s.shape = shape
        const b = hudView(s, 0, null).build!
        expect(b.goods.find((g) => g.material === 'glass')!.afford, `${n} glass, ${shape}`).toBe(n >= roomCost(shape))
        expect(b.shapes.find((x) => x.shape === shape)!.afford, `${n} glass, ${shape}`).toBe(n >= roomCost(shape))
      }
    }
  })

  it('bounces the missing material for NOPE_FOR after a nope, and never a raw good', () => {
    const s = street()
    s.shot = { kind: 'plot', plot: 3 }
    expect(hudView(s, 0, { good: 'glass', at: 0 }).build!.missing).toMatchObject({ good: 'glass', at: 0 })
    expect(hudView(s, NOPE_FOR, { good: 'glass', at: 0 }).build!.missing).toBeNull()
    expect(hudView(s, 0, { good: 'log', at: 0 }).build!.missing).toBeNull()
    expect(hudView(s, 0, null).build!.doorbell).toBe(false)
  })

  it("sends the missing material's bubble to another material that pays, else (no room paid for at all) a machine with goods on its heap, else the truck", () => {
    const s = street()
    s.shot = { kind: 'plot', plot: 3 }
    s.shape = 'wide'
    const next = () => hudView(s, 0, { good: 'planks', at: 0 }).build!.missing!.next
    const goods = (g: Partial<Record<Material, number>>) => MATERIALS.forEach((m) => (s.keep.goods[m] = g[m] ?? 0))
    // Another material that pays for the picked shape: the most of them.
    goods({ planks: 1, bricks: 4, concrete: 6, glass: 3 })
    expect(next()).toEqual({ kind: 'material', material: 'concrete' })
    // None pays for any room: the missing one's own machine, when its heap shows logs.
    goods({ planks: 1, bricks: 1 })
    s.keep.goods.log = 2
    expect(next()).toEqual({ kind: 'machine', m: 'sawmill' })
    // Logs still flying home from the truck are not on the heap yet: another machine with goods.
    s.flights = [{ good: 'log', n: 2, from: { kind: 'bed' }, to: { kind: 'heap', good: 'log' }, at: s.tick, dur: ticks(1) }]
    s.keep.goods.clay = 0
    expect(next()).toEqual({ kind: 'machine', m: 'mixer' })
    // Nothing on any heap: the truck.
    for (const raw of ['log', 'clay', 'rock', 'sand', 'gem'] as const) s.keep.goods[raw] = 0
    s.flights = []
    expect(next()).toEqual({ kind: 'truck' })
  })

  it('bounces a smaller shape that can be paid for when no material pays for the picked one: the biggest the missing material pays for, else the biggest any pays for', () => {
    const s = street()
    s.shot = { kind: 'plot', plot: 3 }
    s.shape = 'big'
    const next = () => hudView(s, 0, { good: 'planks', at: 0 }).build!.missing!.next
    const goods = (g: Partial<Record<Material, number>>) => MATERIALS.forEach((m) => (s.keep.goods[m] = g[m] ?? 0))
    goods({ planks: 5, bricks: 7 })
    expect(next()).toEqual({ kind: 'shape', shape: 'wide' })
    goods({ planks: 3, bricks: 7 })
    expect(next()).toEqual({ kind: 'shape', shape: 'small' })
    goods({ planks: 1, bricks: 7 })
    expect(next()).toEqual({ kind: 'shape', shape: 'wide' })
    s.shape = 'tall'
    goods({ planks: 3, bricks: 2 })
    expect(next()).toEqual({ kind: 'shape', shape: 'small' })
    // Nothing smaller than the small room.
    s.shape = 'small'
    goods({ planks: 1, bricks: 1 })
    expect(next().kind).not.toBe('shape')
  })

  it('tells the child to build exactly when the street bounces the house: never sends them off to fetch more while a room can be paid for', () => {
    const s = street()
    for (const raw of ['log', 'clay', 'rock', 'sand', 'gem'] as const) s.keep.goods[raw] = 0
    const counts = [0, 1, 2, 3, 4, 5, 8]
    for (const shape of SHAPES) {
      for (const planks of counts) {
        for (const bricks of counts) {
          MATERIALS.forEach((m) => (s.keep.goods[m] = 0))
          Object.assign(s.keep.goods, { planks, bricks })
          if (planks >= roomCost(shape)) continue
          s.shape = shape
          s.shot = { kind: 'street', x: 30 }
          step(s)
          const hint = s.hint!
          s.shot = { kind: 'plot', plot: 3 }
          const tray = hudView(s, at(s, 0), { good: 'planks', at: s.tick }).build!.missing!.next
          expect(tray.kind === 'material' || tray.kind === 'shape', `${shape}, ${planks} planks, ${bricks} bricks`).toBe(hint.kind === 'plot')
        }
      }
    }
  })

  it('bounces one thing at a time: the material or the shape that pays, else the missing material under its bubble', () => {
    const s = street()
    s.shot = { kind: 'plot', plot: 2 }
    s.shape = 'big'
    const game = { hud: { look: s.keep.look }, state: s } as unknown as Game
    const tray = () => renderToStaticMarkup(createElement(BuildTray, { game, view: hudView(s, 0, { good: 'planks', at: 0 }).build!, lang: 'en' }))
    const bouncing = (html: string) => [...html.matchAll(/class="btn ([^"]*)\bmissing\b[^"]*"/g)].map((m) => m[1]!.split(' ')[0])
    const goods = (g: Partial<Record<Material, number>>) => MATERIALS.forEach((m) => (s.keep.goods[m] = g[m] ?? 0))
    goods({ planks: 1, bricks: 9 })
    expect(bouncing(tray())).toEqual(['mat'])
    goods({ planks: 1, bricks: 5 })
    expect(bouncing(tray())).toEqual(['shape'])
    expect(tray()).not.toContain('bubble')
    goods({ planks: 1, bricks: 1 })
    expect(bouncing(tray())).toEqual(['mat'])
    expect(tray().match(/class="btn bubble"/g)).toHaveLength(1)
  })
})

describe('the room tray', () => {
  it("lists the room's items, its paint, and every open theme", () => {
    const s = street()
    const room = s.keep.plots[0]!.rooms[0]!
    s.shot = { kind: 'room', plot: 0, room: room.id }
    const r = hudView(s, 0, null).room!
    expect(r.theme).toBe(room.theme)
    expect(r.inRoom).toEqual(room.items.filter((it) => it !== null))
    expect([r.wall, r.floor]).toEqual([room.wall, room.floor])
    expect(r.themes).toEqual(openThemes(s.keep.unlocked))
    expect(r.pick).toBe(false)
    room.theme = null
    expect(hudView(s, 0, null).room!.pick).toBe(true)
  })

  it('opens the brief\'s ten themes from the start, and the rest as presents bring them', () => {
    expect(openThemes([])).toEqual(THEMES.filter((t) => !LOCKED_THEMES.includes(t)))
    expect(openThemes([])).toHaveLength(10)
    expect(openThemes(['theme:sauna', 'bag:cat'])).toEqual([...THEMES.filter((t) => !LOCKED_THEMES.includes(t)), 'sauna'])
  })
})

describe('the questions', () => {
  it('shows the open themes with the room\'s own, and the house and road questions as they are', () => {
    const s = street()
    const room = s.keep.plots[0]!.rooms[0]!
    s.ask = { kind: 'theme', plot: 0, room: room.id }
    s.askAt = 12
    expect(hudView(s, 0, null).ask).toEqual({ kind: 'theme', themes: openThemes(s.keep.unlocked), current: room.theme, at: 12 })
    s.ask = { kind: 'house', plot: 3 }
    expect(hudView(s, 0, null).ask).toEqual({ kind: 'house', plot: 3, at: 12 })
    s.ask = { kind: 'road' }
    expect(hudView(s, 0, null).ask).toEqual({ kind: 'road', at: 12 })
  })
})

describe('the road', () => {
  /** A state on trip 2's forest road. */
  function driving() {
    const s = street()
    s.road = startRoad(makeRoad('forest', 2, 7))
    s.shot = { kind: 'road' }
    return s
  }

  it('lists the stops and the present ahead, and drops each one passed, done or in the bed', () => {
    const s = driving()
    const road = s.road!
    const ahead = road.def.things.flatMap((t, i) => (t.kind === 'boulder' || t.kind === 'crosser' || t.kind === 'surprise' || t.kind === 'present' ? [i] : []))
    expect(hudView(s, 0, null).road!.stops.map((x) => x.i)).toEqual(ahead)
    expect(hudView(s, 0, null).road!.stops.every((x) => x.at > 0 && x.at <= 1)).toBe(true)
    road.done[ahead[0]!] = 5
    road.x = road.def.things[ahead[1]!]!.x + 2
    expect(hudView(s, 0, null).road!.stops.map((x) => x.i)).toEqual(ahead.slice(2).filter((i) => road.def.things[i]!.x > road.x - 1))
    road.present = true
    expect(hudView(s, 0, null).road!.stops.some((x) => x.thing.kind === 'present')).toBe(false)
  })

  it('turns the pedal into the tool at a boulder, pulses it when the truck stands idle, and hides the controls when the trip is over', () => {
    const s = driving()
    const road = s.road!
    s.lastInputAt = 0
    expect(hudView(s, 1, null).road!.pulse).toBe(false)
    expect(hudView(s, 2, null).road!.pulse).toBe(true)
    road.v = 4
    expect(hudView(s, 3, null).road!.pulse).toBe(false)
    road.v = 0
    road.stop = road.def.things.findIndex((t) => t.kind === 'boulder')
    const v = hudView(s, 3, null).road!
    expect([v.boulder, v.pulse, v.tool]).toEqual([true, false, s.keep.look.tool])
    road.stop = road.def.things.findIndex((t) => t.kind === 'crosser')
    expect(hudView(s, 3, null).road!.boulder).toBe(false)
    road.endAt = 10
    expect(hudView(s, 3, null).road!.over).toBe(true)
  })

  it('pulses the pedal while a finger is held on the road picture: the finger is input as it goes down, not all the while it stays as on the street', () => {
    const s = street()
    act(s, { kind: 'tap', hit: { kind: 'truck' } })
    act(s, { kind: 'road', road: 'forest' })
    step(s)
    expect(s.shot).toEqual({ kind: 'road' })
    act(s, { kind: 'touch', down: true })
    const down = s.tick
    for (let i = 0; i < ticks(3); i++) step(s)
    expect([s.touching, s.lastInputAt]).toEqual([true, down])
    expect(hudView(s, at(s, 0), null).road!.pulse).toBe(true)
  })

  it('places the truck along the strip, from the start to the house', () => {
    const road = startRoad(makeRoad('beach', 3, 1))
    road.x = -2
    expect(tripProgress(road)).toBe(0)
    road.x = road.def.length / 4
    expect(tripProgress(road)).toBeCloseTo(0.25)
    road.x = road.def.length + 30
    expect(tripProgress(road)).toBe(1)
  })
})

describe('the cards', () => {
  it("shows the present's card on the street for PRESENT_FOR after it opens, and not while the truck still drives in with it", () => {
    const s = street()
    s.tick = 600
    s.presentAt = 600
    s.presentGot = 'theme:bath'
    expect(hudView(s, at(s, -STEP), null).present).toBeNull()
    expect(hudView(s, at(s, 0), null).present).toEqual({ got: 'theme:bath', at: 600 })
    expect(hudView(s, at(s, PRESENT_FOR), null).present).toBeNull()
    s.shot = { kind: 'plot', plot: 0 }
    expect(hudView(s, at(s, 0), null).present).toBeNull()
  })

  it('shows the card of a present from the bed as the box lands, PRESENT_POP after the tip, not as it pops out', () => {
    const s = street()
    s.tick = 600
    s.tipAt = 600
    s.presentAt = 600
    s.presentGot = 'bag:jetpack'
    const landed = 600 + ticks(PRESENT_POP)
    expect(hudView(s, at(s, 0), null).present).toBeNull()
    expect(hudView(s, at(s, PRESENT_POP - STEP), null).present).toBeNull()
    expect(hudView(s, at(s, PRESENT_POP), null).present).toEqual({ got: 'bag:jetpack', at: landed })
    expect(hudView(s, at(s, PRESENT_POP + PRESENT_FOR - STEP), null).present).toEqual({ got: 'bag:jetpack', at: landed })
    expect(hudView(s, at(s, PRESENT_POP + PRESENT_FOR), null).present).toBeNull()
  })

  it('lets night fall, and shows the Good night card NIGHT_CARD after the last light went out', () => {
    const s = street()
    expect(hudView(s, 0, null).night).toBe('none')
    s.night = { at: 0, dark: [10, 20, 30, -1], doneAt: -1 }
    expect(hudView(s, 100, null).night).toBe('falling')
    s.night.doneAt = 60
    expect(hudView(s, 1 + NIGHT_CARD - 0.1, null).night).toBe('falling')
    expect(hudView(s, 1 + NIGHT_CARD, null).night).toBe('done')
  })

  it('shows the hint hand for HAND_FOR after it starts, on a hint', () => {
    const s = street()
    s.hint = { kind: 'truck' }
    s.handAt = 60
    expect(hudView(s, 1, null).hand).toBe(60)
    expect(hudView(s, 1 + HAND_FOR, null).hand).toBe(-1)
    s.hint = null
    expect(hudView(s, 1, null).hand).toBe(-1)
    // Started ahead, while the camera glides to the thing: not yet.
    s.hint = { kind: 'truck' }
    expect(hudView(s, 1 - STEP, null).hand).toBe(-1)
  })

  it("hides the builder's face while the truck drives in with them at its wheel", () => {
    const s = street()
    s.tick = 100
    s.tipAt = 130
    expect(hudView(s, at(s, 0), null).back).toBeNull()
    s.tick = 130
    expect(hudView(s, at(s, 0), null).back).toBe('face')
  })
})

describe('sameHud', () => {
  it('tells views that show the same from those that do not', () => {
    const s = street()
    const a = hudView(s, 0, null)
    expect(sameHud(a, hudView(s, 5, null))).toBe(true)
    s.keep.sound = false
    expect(sameHud(a, hudView(s, 5, null))).toBe(false)
  })
})
