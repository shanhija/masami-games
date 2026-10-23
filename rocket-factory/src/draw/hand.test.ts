/**
 * The hint's hand (draw/hand.ts): when it shows (HAND_AFTER with no touch, as hint.ts times
 * it, for its gesture's length, never before Play, after her touch, over another card or
 * during the launch), what it does for every kind of step on every screen the plan names (its
 * fingertip and the whole hand on the screen, the palm never over what it taps, nothing NaN),
 * the dotted path its trace leaves, and its picture on the fake context (balanced, no text,
 * inside its canvas). Looks are judged on ?sheet=hand and the page.
 */
import { describe, expect, it } from 'vitest'

import { cellOf } from '../game/board'
import { startView } from '../game/camera'
import { HAND_FOR, SIZE } from '../game/catalog'
import { GRIP, NO_INSETS, gripLift, heldAt, screenBox, toScreen, type View } from '../game/layout'
import { STEP, inSlot, outSlot, type State, type Step } from '../game/model'
import { put } from '../game/beltKit'
import type { Box } from '../game/where'
import { fakeContext } from './fakeContext'
import { HAND_ROOM, SHEET, drawHand, handNow, handPose, handRoom, handSize, handTrail, type HandButton, type HandPose } from './hand'
import { AT, busyFactory, firstFactory } from './scenes'

/** The plan's screens: the three iPad full screens, Safari's 1024x662, 1180x710 and 820x1070, and a phone on its side. */
const SCREENS = [
  [1180, 820],
  [1024, 768],
  [820, 1180],
  [1024, 662],
  [1180, 710],
  [820, 1070],
  [750, 320],
] as const

/** A view of state s at sim time t on a w x h screen, a touch screen with no safe areas. */
const viewOf = (w: number, h: number): View => startView(w, h, 2, true, NO_INSETS)

/** HUD buttons where the page puts them on the view's frame, near enough: a sticker at the tray's start, the peel and Oops at its end (upright in the strip, on a phone in the column), the choice at the strip's right, the card in the middle. */
function buttons(v: View): (b: HandButton) => Box {
  const f = v.hud
  const b = f.button
  return (which) => {
    switch (which.kind) {
      case 'sticker':
        return f.held === 'phone' ? { x: f.tray!.x + 4, y: f.tray!.y + 4 + b, w: b, h: b } : { x: f.tray!.x + 8 + b + f.gap, y: f.tray!.y + 8, w: b, h: b }
      case 'peel':
      case 'oops': {
        const last = which.kind === 'oops' ? 1 : 2
        if (f.held === 'phone') return { x: f.column!.x + 4, y: f.column!.y + (2 + last) * (b + f.gap), w: b, h: b }
        if (f.held === 'upright') return { x: f.strip!.x + f.strip!.w - 12 - last * 66 + 10, y: f.strip!.y + 4, w: 56, h: 56 }
        return { x: f.tray!.x + f.tray!.w - 8 - last * (b + f.gap) + f.gap, y: f.tray!.y + 8, w: b, h: b }
      }
      case 'choice':
        // The choice card's two big pictures side by side in the middle of the screen.
        return { x: v.w / 2 + (which.card === 'bubbles' ? -190 : 10), y: v.h / 2 - 90, w: 180, h: 180 }
      case 'card':
        return { x: v.w / 2 - 150, y: v.h / 2 - 180, w: 300, h: 360 }
    }
  }
}

/** The busy factory back at the moment the lab's one choice waits (Gears! found, no pick yet): the choice card is up. */
function chooseFactory(): State {
  const s = busyFactory(1)
  s.found = ['digger', 'gold', 'science', 'gears']
  s.choice = null
  return s
}

/** The busy factory with `step` bouncing since long ago and the hand shown at AT (her last touch long before). */
function showing(s: State, step: Step): State {
  s.hint = { step, at: AT - 600 }
  s.handAt = AT
  s.handN = 1
  s.lastTouchAt = AT - 900
  s.card = null
  return s
}

/** Every kind of step the hand shows, on the busy factory, each with the box of what a tap of it aims at (screen px on the view), or null for a stroke or a drag. */
function steps(): { name: string; make: () => State; aim: ((s: State, v: View) => Box) | null }[] {
  const footprint = (id: number) => (s: State, v: View) => {
    const b = s.buildings.find((x) => x.id === id)!
    return screenBox(v, { x: b.x, y: b.y, w: SIZE[b.kind], h: SIZE[b.kind] })
  }
  const hud = (which: HandButton) => (_: State, v: View) => buttons(v)(which)
  const path = [cellOf(10, 9), cellOf(11, 9), cellOf(11, 10), cellOf(12, 10), cellOf(13, 10), cellOf(14, 10), cellOf(14, 9)]
  return [
    { name: 'a muncher on a belt', make: () => showing(busyFactory(1), { kind: 'muncher', id: 1 }), aim: null },
    { name: 'a muncher napping', make: () => showing(busyFactory(1), { kind: 'muncher', id: 2 }), aim: null },
    { name: 'Oops', make: () => showing(busyFactory(1), { kind: 'oops' }), aim: hud({ kind: 'oops' }) },
    { name: 'a New! sticker onto its ghost', make: () => showing(busyFactory(1), { kind: 'place', sticker: 'oven', x: 2, y: 8 }), aim: null },
    { name: 'the peel over belts', make: () => showing(busyFactory(1), { kind: 'free', sticker: 'oven', cells: [cellOf(2, 10), cellOf(3, 10)] }), aim: null },
    { name: 'one more of the slowest machine', make: () => showing(busyFactory(1), { kind: 'bottleneck', id: 5, sticker: 'workshop', x: 4, y: 7 }), aim: null },
    { name: 'the slowest machine with no sticker left', make: () => showing(busyFactory(1), { kind: 'bottleneck', id: 5, sticker: null, x: 0, y: 0 }), aim: footprint(5) },
    { name: 'a thing blocking a machine', make: () => showing(busyFactory(1), { kind: 'unblock', slot: outSlot(cellOf(7, 5)) }), aim: null },
    { name: 'a full roof stack', make: () => showing(busyFactory(1), { kind: 'stack', id: 6 }), aim: null },
    { name: 'a missing link', make: () => showing(busyFactory(1), { kind: 'link', from: 1, to: 0, thing: 'blueBar', path, full: false }), aim: null },
    { name: 'a patch to dig', make: () => showing(busyFactory(1), { kind: 'dig', cell: cellOf(10, 7) }), aim: null },
    { name: "a tower's bubble belt and the tower", make: () => showing(busyFactory(1), { kind: 'defend', sticker: 'tower', cells: [cellOf(1, 9), cellOf(2, 9), cellOf(3, 9)], x: 3, y: 9 }), aim: null },
    { name: "a bowl's gold belt and the bowl", make: () => showing(busyFactory(1), { kind: 'defend', sticker: 'bowl', cells: [cellOf(15, 4), cellOf(16, 4)], x: 16, y: 4 }), aim: null },
    { name: 'a hedge line', make: () => showing(busyFactory(1), { kind: 'defend', sticker: 'hedge', cells: [cellOf(16, 8), cellOf(16, 9), cellOf(16, 10)], x: 16, y: 9 }), aim: null },
    { name: 'an empty tower', make: () => showing(busyFactory(1), { kind: 'refill', id: 12 }), aim: footprint(12) },
    { name: 'a heap', make: () => showing(busyFactory(1), { kind: 'heap', burrow: 0 }), aim: null },
    { name: 'the basket', make: () => showing(busyFactory(1), { kind: 'basket' }), aim: null },
    { name: "the choice card's two pictures", make: () => showing(chooseFactory(), { kind: 'choose' }), aim: null },
    { name: 'the launch button', make: () => showing(busyFactory(1), { kind: 'launch' }), aim: null },
    {
      name: 'the card that waits',
      make: () => {
        const s = showing(busyFactory(1), { kind: 'card' })
        s.card = { id: 'more', at: AT - 900 }
        return s
      },
      aim: hud({ kind: 'card' }),
    },
    {
      name: "Good night's machine",
      make: () => {
        const s = showing(busyFactory(1), { kind: 'tuck', machine: 'oven' })
        s.night = { at: AT - 300, kind: 'oven', kindAt: AT - 60, doneAt: -1 }
        return s
      },
      aim: footprint(1),
    },
  ]
}

/** The screen point of board point (x, y). */
const toScreenMid = (v: View, x: number, y: number) => toScreen(v, x, y)
const inside = (b: Box, x: number, y: number) => x >= b.x - 0.5 && x <= b.x + b.w + 0.5 && y >= b.y - 0.5 && y <= b.y + b.h + 0.5
/** The farthest point of the hand from its fingertip: its cuff's end, `size` along its palm's way. */
const cuff = (p: HandPose) => [p.x + p.size * Math.sin(p.palm), p.y + p.size * Math.cos(p.palm)] as const

describe('the hint hand', () => {
  it('shows from handAt for its gesture, and never before Play, after her touch, for a step that came after it, over another card, during the launch or for the rocket', () => {
    const t = AT * STEP + 0.5
    const dig: Step = { kind: 'dig', cell: cellOf(10, 7) }
    const s = showing(firstFactory(1), dig)
    expect(handNow(s, t)!.age).toBeCloseTo(0.5)
    // A tap gesture lasts HAND_FOR, gliding in and lifting away included.
    expect(handNow(s, t)!.length).toBeCloseTo(HAND_FOR * STEP)
    expect(handNow(s, AT * STEP + HAND_FOR * STEP + 0.01)).toBeNull()
    // A frame drawn a hair before the hand's tick shows it gliding in from nothing.
    expect(handNow(s, (AT - 0.5) * STEP)!.age).toBe(0)
    for (const [why, change] of [
      ['before Play', (x: State) => (x.playing = false)],
      ['after her touch', (x: State) => (x.handN = 0)],
      ['for a step that came after it', (x: State) => (x.hint = { step: dig, at: AT + 1 })],
      ['over a card', (x: State) => (x.card = { id: 'gold', at: AT - 10 })],
      ['during the launch', (x: State) => (x.launch = { at: AT - 10, landsAt: AT + 2000 })],
      ['for the rocket', (x: State) => (x.hint = { step: { kind: 'rocket' }, at: AT - 600 })],
      ['for a building peeled since the hint looked', (x: State) => (x.hint = { step: { kind: 'refill', id: 99 }, at: AT - 600 })],
      ['for a link with no path', (x: State) => (x.hint = { step: { kind: 'link', from: 1, to: 0, thing: 'blueBar', path: [], full: false }, at: AT - 600 })],
    ] as const) {
      const x = showing(firstFactory(1), dig)
      change(x)
      expect(handNow(x, t), why).toBeNull()
    }
  })

  it("does every step on every screen with its fingertip and its whole hand on the screen, nothing NaN, and its palm off what it taps", () => {
    const out: string[] = []
    for (const [w, h] of SCREENS)
      for (const st of steps()) {
        const s = st.make()
        const v0 = viewOf(w, h)
        const length = handNow(s, AT * STEP)!.length
        let pressed = 0
        for (let age = 0; age < length; age += 0.04) {
          const t = AT * STEP + age
          const v = viewOf(w, h)
          const p = handPose(s, v, t, buttons(v))
          const what = `${st.name} on ${w}x${h} at ${age.toFixed(2)} s`
          if (p === null) {
            out.push(`${what}: no hand`)
            continue
          }
          for (const [k, n] of Object.entries(p)) if (typeof n === 'number' && Number.isNaN(n)) out.push(`${what}: ${k} is NaN`)
          if (p.size !== handSize(v0)) out.push(`${what}: size ${p.size}`)
          // Gliding in and lifting away it may hang a little off; while it is fully there it is on the screen.
          if (p.alpha >= 0.99) {
            const [cx, cy] = cuff(p)
            if (!inside({ x: 0, y: 0, w, h }, p.x, p.y)) out.push(`${what}: fingertip at ${p.x.toFixed(0)}, ${p.y.toFixed(0)}`)
            if (!inside({ x: 0, y: 0, w, h }, cx, cy)) out.push(`${what}: cuff at ${cx.toFixed(0)}, ${cy.toFixed(0)}`)
          }
          if (st.aim !== null && p.press >= 1) {
            pressed++
            const box = st.aim(s, v)
            const k = 0.36 * p.size
            if (!inside(box, p.x, p.y)) out.push(`${what}: the fingertip is off what it taps`)
            if (inside(box, p.x + k * Math.sin(p.palm), p.y + k * Math.cos(p.palm))) out.push(`${what}: the palm lies over what it taps`)
          }
        }
        if (st.aim !== null && pressed === 0) out.push(`${st.name} on ${w}x${h}: never pressed`)
      }
    expect(out).toEqual([])
  })

  it('turns its palm aside over the tray, to the left by the right edge, and keeps it down and to the right over the board', () => {
    const s = showing(busyFactory(1), { kind: 'place', sticker: 'oven', x: 2, y: 8 })
    const v = viewOf(1180, 820)
    // Pressed on the tray's sticker, the palm turns to the right, over the tray; carried onto the ghost, it hangs down and to the right again.
    const onTray = handPose(s, v, AT * STEP + 0.45 + 0.14 + 0.05, buttons(v))!
    expect(onTray.press).toBe(1)
    expect(onTray.palm).toBeGreaterThan(Math.PI / 4)
    const onBoard = handPose(s, v, AT * STEP + 0.45 + 0.14 + 0.1 + 0.98, buttons(v))!
    expect(onBoard.press).toBe(1)
    expect(onBoard.palm).toBeCloseTo((25 * Math.PI) / 180, 2)
    // Oops at the tray's right end: no room below it nor to its right, so the palm hangs down and to the left.
    const oops = showing(busyFactory(1), { kind: 'oops' })
    expect(handPose(oops, v, AT * STEP + 0.7, buttons(v))!.palm).toBeLessThan(0)
  })

  it('leaves the dotted path of its trace behind its fingertip as it glides, then fades it with the hand, and none for a tap', () => {
    const path = [cellOf(10, 9), cellOf(11, 9), cellOf(11, 10), cellOf(12, 10), cellOf(13, 10)]
    const s = showing(busyFactory(1), { kind: 'link', from: 1, to: 0, thing: 'blueBar', path, full: false })
    const length = handNow(s, AT * STEP)!.length
    expect(handTrail(s, AT * STEP + 0.2)).toBeNull()
    let reach = 0
    let alpha = 1
    for (let age = 0.6; age < length; age += 0.05) {
      const trail = handTrail(s, AT * STEP + age)!
      expect(trail.cells).toBe(path)
      expect(trail.reach).toBeGreaterThanOrEqual(reach)
      reach = trail.reach
      alpha = trail.alpha
    }
    expect(reach).toBe(1)
    expect(alpha).toBeLessThan(0.2)
    expect(handTrail(showing(busyFactory(1), { kind: 'dig', cell: cellOf(10, 7) }), AT * STEP + 1)).toBeNull()
  })

  it('draws the hand at every pose balanced, with no text, inside its canvas, a sticker it carries too', () => {
    const { ctx, check, measure } = fakeContext()
    for (let deg = -90; deg <= 90; deg += 15)
      for (const press of [0, 0.4, 1])
        for (const ripple of [0, 0.2, 0.44, 3, Infinity]) {
          const pose: HandPose = { x: 0, y: 0, palm: (deg * Math.PI) / 180, press, alpha: 1, ripple, size: 1, carry: null }
          const b = measure(() => check(`the hand at ${deg} degrees, pressed ${press}`, () => drawHand(ctx, pose, 2), 'none'))
          expect(Math.max(-b.x0, -b.y0, b.x1, b.y1), `the hand at ${deg} degrees`).toBeLessThan(HAND_ROOM / 2)
        }
    // Carrying each sticker over the iPad's and the phone's cells, from riding high to dropped onto its footprint.
    for (const sticker of ['digger', 'oven', 'workshop', 'greenMaker', 'orangeMaker', 'lab', 'pump', 'tower', 'bowl'] as const)
      for (const [cell, size] of [
        [74, 92],
        [50, 80],
        [26, 64],
      ] as const)
        for (const drop of [0, 0.5, 1]) {
          const pose: HandPose = { x: 0, y: 0, palm: 0.4, press: 1, alpha: 1, ripple: Infinity, size, carry: { sticker, cell, lift: GRIP * cell, shown: 1 - drop } }
          const b = measure(() => check(`carrying a ${sticker} at ${cell} px, settled ${drop}`, () => drawHand(ctx, pose, 2), 'none'))
          expect(Math.max(-b.x0, -b.y0, b.x1, b.y1), `carrying a ${sticker} at ${cell} px`).toBeLessThan(handRoom(pose) / 2)
        }
    for (const e of SHEET) check(`sheet ${e.label}`, () => e.draw(ctx, 1.3), 'none')
  })

  it('carries the sticker it drags by its bottom edge above its fingertip from its tray button, and ends with the fingertip under the ghost, so the sticker settles right onto it', () => {
    const s = showing(busyFactory(1), { kind: 'place', sticker: 'oven', x: 2, y: 8 })
    const v = viewOf(1024, 768)
    const at = (age: number) => handPose(s, v, AT * STEP + age, buttons(v))!
    expect(at(0.3).carry, 'gliding in, it carries nothing yet').toBeNull()
    const lifted = at(0.45 + 0.14 + 0.05).carry!
    expect([lifted.sticker, lifted.shown, lifted.lift]).toEqual(['oven', 1, GRIP * v.cell])
    // At the end of the carry the fingertip is where her finger holds the oven over its ghost: gripLift under the footprint's middle (heldAt there is the middle).
    const end = at(0.45 + 0.14 + 0.1 + 1)
    const [x, y] = toScreenMid(v, 3, 9)
    expect(end.x).toBeCloseTo(x, 6)
    expect(end.y).toBeCloseTo(y + gripLift(v, 2), 6)
    expect(heldAt(v, end.x, end.y, 2).map((k) => Math.round(k * 1e6) / 1e6)).toEqual([3, 9])
    expect(end.carry!.shown).toBe(1)
    // Let go, it has settled into the ghost.
    expect(at(0.45 + 0.14 + 0.1 + 1 + 0.14).carry!.shown).toBe(0)
    // A bowl of the defence rides as a bowl, a tower as a tower.
    for (const sticker of ['bowl', 'tower'] as const) {
      const d = showing(busyFactory(1), { kind: 'defend', sticker, cells: [], x: 16, y: 4 })
      expect(handPose(d, v, AT * STEP + 0.45 + 0.14 + 0.05, buttons(v))!.carry!.sticker).toBe(sticker)
    }
  })
})

describe('the choice', () => {
  it("points at the choice card's two pictures in turn while it is up, whatever bounces under it, and never presses: the choice is hers", () => {
    const s = showing(chooseFactory(), { kind: 'place', sticker: 'workshop', x: 4, y: 2 })
    const v = viewOf(1180, 820)
    const length = handNow(s, AT * STEP)!.length
    const near: ('bubbles' | 'hedges')[] = []
    for (let age = 0; age < length; age += 0.05) {
      const p = handPose(s, v, AT * STEP + age, buttons(v))!
      expect(p.press).toBe(0)
      expect(p.carry).toBeNull()
      for (const card of ['bubbles', 'hedges'] as const) {
        const b = buttons(v)({ kind: 'choice', card })
        if (p.alpha > 0.99 && inside(b, p.x, p.y) && near.at(-1) !== card) near.push(card)
      }
    }
    expect(near).toEqual(['bubbles', 'hedges'])
  })
})

describe('the hint hand on a real board', () => {
  it('taps a thing where it rides now', () => {
    const s = showing(busyFactory(1), { kind: 'unblock', slot: inSlot(cellOf(7, 5)) })
    put(s, inSlot(cellOf(7, 5)), 'blueRock')
    const v = viewOf(1024, 768)
    expect(handPose(s, v, AT * STEP + 1, buttons(v))).not.toBeNull()
    s.belts.slot[inSlot(cellOf(7, 5))] = -1
    expect(handPose(s, v, AT * STEP + 1, buttons(v)), 'a thing taken since the hint looked').toBeNull()
  })
})
