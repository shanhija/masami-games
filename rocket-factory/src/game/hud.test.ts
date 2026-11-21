/**
 * The HUD's model (hud.ts) case by case, as the plan's HUD section gives it: the start card,
 * the rocket card, the lab card and its jars, the choice, the path, the tray in arrival order
 * with its counts, holes, endless marks, New! and the picked tool, the card, Good night's
 * card, and the HUD's re-render test; then the tray as React renders it.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LANGS, type Lang } from '../../../profiles/src/lang'
import { Tray } from '../Tray'
import { HUD, STICKER_NAMES } from '../words'
import { PART_INFO, PATH, START_STICKERS, card } from './catalog'
import { demoState } from './fixtures'
import type { Game } from './game'
import { NIGHT_CARD, arrivals, freshSticker, hudView, pathOrder, sameHud, trayOrder } from './hud'
import { NO_INSETS, hudFrame, trayBoxes } from './layout'
import { PARTS, STEP, newBuilding, type CardId, type State } from './model'
import { blankState } from './rules'
import { stickersLeft } from './strokes'

/** A fresh game, Play pressed, with the path found up to and including `last` (Bubbles! before Hedges!). */
function upTo(last: CardId | null): State {
  const s = blankState(1)
  s.playing = true
  const ids = PATH.map((c) => c.id)
  s.found = last === null ? [] : ids.slice(0, ids.indexOf(last) + 1)
  if (s.found.includes('bubbles')) s.choice = 'bubbles'
  return s
}
const view = (s: State) => hudView(s, s.tick * STEP, [])

describe('the start card', () => {
  it('shows until Play is pressed', () => {
    const s = blankState(1)
    expect(view(s).start).toBe(true)
    s.playing = true
    expect(view(s).start).toBe(false)
  })
})

describe('the rocket card', () => {
  it('opens the legs from the start and each other part with its card, and counts what is in each', () => {
    const s = upTo(null)
    s.rocket.got = [7, 0, 0, 0]
    expect(view(s).rocket.parts).toEqual([
      { part: 'legs', open: true, got: 7, n: PART_INFO.legs.n },
      { part: 'body', open: false, got: 0, n: PART_INFO.body.n },
      { part: 'nose', open: false, got: 0, n: PART_INFO.nose.n },
      { part: 'engine', open: false, got: 0, n: PART_INFO.engine.n },
    ])
    expect(view(upTo('gears')).rocket.parts.map((p) => p.open)).toEqual([true, true, false, false])
    expect(view(upTo('nose')).rocket.parts.map((p) => p.open)).toEqual([true, true, true, false])
    expect(view(upTo('rocket')).rocket.parts.map((p) => p.open)).toEqual([true, true, true, true])
  })

  it('waits for the launch with every part full and Fuel! found, and not while it flies', () => {
    const s = upTo('rocket')
    s.rocket.got = PARTS.map((p) => PART_INFO[p].n)
    expect(view(s).rocket.ready).toBe(false)
    s.found.push('fuel')
    expect(view(s).rocket.ready).toBe(true)
    s.launch = { at: s.tick, landsAt: s.tick + 2400 }
    expect(view(s).rocket.ready).toBe(false)
  })

  it('fills the same rocket again after a landing: every part open, counting what is in it again', () => {
    const s = upTo('fuel')
    s.launches = 1
    s.rocket.got = [3, 0, 0, 0]
    expect(view(s).rocket.parts.map((p) => [p.open, p.got])).toEqual([
      [true, 3],
      [true, 0],
      [true, 0],
      [true, 0],
    ])
  })

  it('tells the HUD while a launch runs, when the lab card and the tray take no taps', () => {
    const s = upTo('fuel')
    expect(view(s).launch).toBe(false)
    s.launch = { at: s.tick, landsAt: s.tick + 2400 }
    expect(view(s).launch).toBe(true)
  })
})

describe('the lab card', () => {
  it("shows the next card's picture and a jar of what it waits for: the legs' blue bars, the first gold bar, then the lab's bottles", () => {
    const s = upTo(null)
    s.rocket.got[0] = 2
    expect(view(s).lab).toEqual({ next: 'digger', jars: [{ thing: 'blueBar', got: 2, need: 3 }], choice: false })
    s.found = ['digger']
    s.rocket.got[0] = 25
    expect(view(s).lab.jars).toEqual([{ thing: 'blueBar', got: 20, need: 20 }])
    expect(view(upTo('gold')).lab).toEqual({ next: 'science', jars: [{ thing: 'goldBar', got: 0, need: 1 }], choice: false })
    const sci = upTo('science')
    sci.lab.got = [2, 0]
    expect(view(sci).lab).toEqual({ next: 'gears', jars: [{ thing: 'greenBottle', got: 2, need: 5 }], choice: false })
    const snacks = upTo('stars')
    snacks.lab.got = [40, 9]
    expect(view(snacks).lab.jars).toEqual([
      { thing: 'greenBottle', got: 40, need: 75 },
      { thing: 'orangeBottle', got: 9, need: 20 },
    ])
  })

  it("scales the jars with the parent's Science switch", () => {
    const s = upTo('science')
    s.switches.science = 'quicker'
    expect(view(s).lab.jars).toEqual([{ thing: 'greenBottle', got: 0, need: 3 }])
  })

  it('offers the two cards while the choice waits, and then the one she picked first', () => {
    const s = upTo('gears')
    expect(view(s).lab).toEqual({ next: 'bubbles', jars: [], choice: true })
    s.choice = 'hedges'
    expect(view(s).lab).toEqual({ next: 'hedges', jars: [{ thing: 'greenBottle', got: 0, need: 80 }], choice: false })
  })

  it('shows no card and no jar once the path is done', () => {
    expect(view(upTo('fuel')).lab).toEqual({ next: null, jars: [], choice: false })
  })
})

describe('the path', () => {
  it('lists every card in the order she meets it, the choice as she picked it', () => {
    expect(pathOrder(upTo('gears'))).toEqual(PATH.map((c) => c.id))
    const s = upTo('gears')
    s.choice = 'hedges'
    const order = pathOrder(s)
    expect(order.indexOf('hedges')).toBeLessThan(order.indexOf('bubbles'))
  })

  it('ticks the found cards, glows the one coming now (both while the choice waits), and greys the rest', () => {
    const at = (s: State) => Object.fromEntries(view(s).path.map((c) => [c.id, c.at]))
    const s = upTo('science')
    expect(at(s)).toMatchObject({ digger: 'done', gold: 'done', science: 'done', gears: 'now', bubbles: 'later', fuel: 'later' })
    expect(at(upTo('gears'))).toMatchObject({ gears: 'done', bubbles: 'now', hedges: 'now', nose: 'later' })
    expect(Object.values(at(upTo('fuel')))).toEqual(PATH.map(() => 'done'))
  })
})

describe('the tray', () => {
  it('holds the stickers in the order they first arrived: the oven from the start, then each card as she found it', () => {
    expect(arrivals(upTo(null))).toEqual(Object.keys(START_STICKERS))
    expect(arrivals(upTo('science'))).toEqual(['oven', 'digger', 'greenMaker', 'lab'])
    expect(arrivals(upTo('more'))).toEqual(['oven', 'digger', 'greenMaker', 'lab', 'workshop', 'pump', 'tower', 'orangeMaker', 'bowl'])
    const s = upTo('gears')
    s.choice = 'hedges'
    s.found.push('hedges', 'bubbles')
    expect(view(s).tray.stickers.map((b) => b.sticker)).toEqual(['oven', 'digger', 'greenMaker', 'lab', 'workshop', 'pump', 'tower'])
  })

  it("counts what is left of each, as the rules do, and gives the hedge its button once a card brings hedges", () => {
    const s = upTo('gold')
    const tray = view(s).tray
    expect(tray.stickers.map((b) => [b.sticker, b.left])).toEqual([
      ['oven', 1],
      ['digger', 2],
    ])
    for (const b of tray.stickers) expect(b.left).toBe(stickersLeft(s, b.sticker))
    expect(tray.hedge).toBeNull()
    const h = upTo('hedges')
    expect(view(h).tray.hedge).toMatchObject({ sticker: 'hedge', left: card('hedges').gives.hedge })
    h.hedge[0] = 1
    h.hedge[1] = 2
    expect(view(h).tray.hedge!.left).toBe(card('hedges').gives.hedge! - 2)
  })

  it('leaves a hole where every sticker of a kind is on the board, and marks every count endless after the launch', () => {
    const s = upTo(null)
    expect(view(s).tray.stickers).toEqual([{ sticker: 'oven', left: 0, picked: false, fresh: false }])
    s.launches = 1
    expect(view(s).tray.stickers[0]!.left).toBe(Infinity)
  })

  it('lifts the tool in hand: the pencil lit (with its pattern), a sticker, the hedge or the peel; and Oops only with something to undo', () => {
    const s = upTo('hedges')
    s.pattern = 2
    expect(view(s).tray.pencil).toEqual({ pattern: 2, lit: true })
    s.tool = { kind: 'sticker', sticker: 'digger' }
    const t = view(s).tray
    expect(t.pencil.lit).toBe(false)
    expect(t.stickers.filter((b) => b.picked).map((b) => b.sticker)).toEqual(['digger'])
    s.tool = { kind: 'hedge' }
    expect(view(s).tray.hedge!.picked).toBe(true)
    s.tool = { kind: 'peel' }
    expect(view(s).tray.peel).toBe(true)
    expect(view(s).tray.oops).toBe(false)
    s.undo.push({ edit: { belts: [], removed: [], added: [], hedges: [] }, inverse: { belts: [], removed: [], added: [], hedges: [] }, at: s.tick, broke: false, tool: 'pencil' })
    expect(view(s).tray.oops).toBe(true)
  })

  it('puts New! on the first sticker the chain needs that she has been given and never placed, one at a time', () => {
    const s = upTo('science')
    expect(freshSticker(s)).toBe('digger')
    s.buildings.push(newBuilding(s.nextId++, 'digger', 7, 2, 0))
    s.help.placed.digger = 1
    expect(freshSticker(s)).toBe('greenMaker')
    s.help.placed.greenMaker = 1
    s.buildings.push(newBuilding(s.nextId++, 'greenMaker', 9, 4, 0))
    expect(freshSticker(s)).toBe('lab')
    expect(view(s).tray.stickers.filter((b) => b.fresh).map((b) => b.sticker)).toEqual(['lab'])
    s.buildings.push(newBuilding(s.nextId++, 'lab', 5, 8, 0))
    s.help.placed.lab = 1
    expect(freshSticker(s)).toBeNull()
  })

  it("puts New! on the sticker the hint's ghost offers, when that one is new", () => {
    const s = upTo('science')
    s.hint = { step: { kind: 'place', sticker: 'lab', x: 5, y: 8 }, at: s.tick }
    expect(freshSticker(s)).toBe('lab')
    // A ghost of a kind already placed is not new: New! stays on the first new one.
    s.hint = { step: { kind: 'place', sticker: 'oven', x: 5, y: 8 }, at: s.tick }
    expect(freshSticker(s)).toBe('digger')
  })

  it('keeps New! on the hedge until she has drawn one, never again after, even with none standing', () => {
    const s = upTo('hedges')
    for (const k of ['digger', 'greenMaker', 'lab', 'workshop', 'pump', 'tower'] as const) s.help.placed[k] = 1
    s.buildings.push(newBuilding(s.nextId++, 'digger', 7, 2, 0), newBuilding(s.nextId++, 'greenMaker', 9, 4, 0), newBuilding(s.nextId++, 'lab', 5, 8, 0), newBuilding(s.nextId++, 'workshop', 5, 2, 0), newBuilding(s.nextId++, 'pump', 0, 8, 0), newBuilding(s.nextId++, 'tower', 3, 10, 0))
    expect(freshSticker(s)).toBe('hedge')
    s.help.hedges = 1
    expect(freshSticker(s)).toBeNull()
  })

  it('puts New! on nothing at night: the machine in its nightcap is the one bouncing thing', () => {
    const s = upTo('science')
    expect(freshSticker(s)).toBe('digger')
    s.night = { at: 0, kind: null, kindAt: -1, doneAt: -1 }
    expect(freshSticker(s)).toBeNull()
    expect(view(s).tray.stickers.some((b) => b.fresh)).toBe(false)
  })

  it('orders the tray: the pencil, the stickers in arrival order, the hedge, and on a sideways screen the peel and Oops', () => {
    const s = upTo('hedges')
    expect(trayOrder(view(s).tray, true)).toEqual(['pencil', 'oven', 'digger', 'greenMaker', 'lab', 'workshop', 'pump', 'tower', 'hedge', 'peel', 'oops'])
    expect(trayOrder(view(upTo('gold')).tray, false)).toEqual(['pencil', 'oven', 'digger'])
  })
})

describe('the cards', () => {
  it('shows the card that is up', () => {
    const s = upTo('gold')
    s.card = { id: 'gold', at: 60 }
    expect(view(s).card).toEqual({ id: 'gold', at: 60 })
  })

  it('lets dusk fall at Good night, and brings the still card NIGHT_CARD after the last machine is tucked in', () => {
    const s = upTo('gears')
    expect(view(s).night).toBe('none')
    s.night = { at: 0, kind: 'oven', kindAt: 0, doneAt: -1 }
    expect(hudView(s, 100, []).night).toBe('falling')
    s.night.doneAt = 600
    expect(hudView(s, 10 + NIGHT_CARD - STEP, []).night).toBe('falling')
    expect(hudView(s, 10 + NIGHT_CARD, []).night).toBe('done')
  })

  it("greys the pause menu's Good night while the launch runs or a night falls, which the rules let nothing cut short", () => {
    const s = upTo('fuel')
    expect(view(s).goodnight).toBe(true)
    s.launch = { at: 0, landsAt: 2400 }
    expect(view(s).goodnight).toBe(false)
    s.launch = null
    s.night = { at: 0, kind: 'oven', kindAt: 0, doneAt: -1 }
    expect(view(s).goodnight).toBe(false)
  })

  it('tells the tray to slide away while the launch fills the sky, and to come home with the board', () => {
    const s = upTo('fuel')
    s.launch = { at: 0, landsAt: 2400 }
    expect([0, 5, 9, 15, 25, 33, 35.4, 39].map((sec) => hudView(s, sec, []).sky)).toEqual([false, false, false, true, true, true, false, false])
    s.launch = null
    expect(hudView(s, 15, []).sky).toBe(false)
  })

  it('brings the choice card up in the middle while the choice waits, and not before Play, under a card, at night or in the launch', () => {
    const s = upTo('gears')
    expect(view(s).ask).toBe(true)
    // Nothing bounces behind it: no sticker wears New! until she picks.
    expect(view(s).tray.stickers.some((b) => b.fresh)).toBe(false)
    const picked = upTo('gears')
    picked.choice = 'bubbles'
    expect(view(picked).tray.stickers.some((b) => b.fresh)).toBe(true)
    for (const [why, change] of [
      ['before Play', (x: State) => (x.playing = false)],
      ['under a card', (x: State) => (x.card = { id: 'gears', at: 0 })],
      ['at night', (x: State) => (x.night = { at: 0, kind: null, kindAt: -1, doneAt: -1 })],
      ['once she picked', (x: State) => (x.choice = 'hedges')],
    ] as const) {
      const x = upTo('gears')
      change(x)
      expect(view(x).ask, why).toBe(false)
    }
    expect(view(upTo('science')).ask).toBe(false)
  })

  it("carries today's cards for the still card", () => {
    expect(hudView(upTo('gears'), 0, ['science', 'gears']).today).toEqual(['science', 'gears'])
  })
})

describe('sameHud', () => {
  it('tells views that show the same from those that do not', () => {
    const s = demoState('factory', 1)
    const a = view(s)
    expect(sameHud(a, view(s))).toBe(true)
    s.switches.sound = false
    expect(sameHud(a, view(s))).toBe(false)
    s.switches.sound = true
    s.launches = 1
    expect(sameHud(a, view(s))).toBe(false)
  })
})

describe('the tray as it renders', () => {
  const render = (s: State, lang: Lang = 'en') => renderToStaticMarkup(createElement(Tray, { game: { state: s, lang } as unknown as Game, view: view(s).tray, frame: hudFrame(1180, 820, true, NO_INSETS), tools: true }))

  it('wears one New!, a hole for a used sticker, and an endless mark for every count after the launch', () => {
    // After Digger!: the start's oven is on the board, the new digger in the tray.
    const s = upTo('digger')
    const html = render(s)
    for (const lang of LANGS) expect(render(s, lang).split(`class="new">${HUD.fresh[lang]}<`), lang).toHaveLength(2)
    expect(html.match(/class="btn sticker[^"]*\bempty\b/g)).toHaveLength(1)
    expect(html.match(/class="count"/g)).toHaveLength(1)
    s.launches = 1
    const after = render(s)
    expect(after.match(/class="count"><svg/g)).toHaveLength(2)
    expect(after).not.toMatch(/empty/)
  })

  it('stands every button where layout.ts trayBoxes puts it', () => {
    const s = upTo('science')
    const f = hudFrame(1180, 820, true, NO_INSETS)
    const keys = trayOrder(view(s).tray, true)
    const { backing, buttons } = trayBoxes(f, keys.length)
    const html = render(s)
    keys.forEach((k, i) => {
      const b = buttons[i]!
      expect(html).toContain(`data-sticker="${k}" style="left:${b.x - backing.x}px;top:${b.y - backing.y}px;width:${b.w}px;height:${b.h}px"`)
    })
  })

  it('has the pencil, the peel and Oops, and lifts only the tool in hand', () => {
    const s = upTo('science')
    s.tool = { kind: 'sticker', sticker: 'digger' }
    expect(render(s).match(/class="btn [^"]*\bon\b/g)).toHaveLength(1)
    // Every button named for a screen reader in the player's language.
    for (const lang of LANGS) {
      const html = render(s, lang)
      for (const words of [HUD.pencil, HUD.peel, HUD.oops, STICKER_NAMES.digger, STICKER_NAMES.lab]) expect(html, lang).toContain(`aria-label="${words[lang]}"`)
    }
  })
})
