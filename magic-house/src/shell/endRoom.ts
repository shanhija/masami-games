/**
 * The stage of the end (shell/End.tsx), written by hand against the builder as the game's own
 * rooms are: the house's own hall, a room of the house like any other (step 7a) and built in the
 * house's own shell (world.ts HOUSE_SHELL) by whoever builds it, with a wooden stage on the house's
 * floor, bunting under the ceiling, two warm standing lamps and potted plants, the party standing on
 * the stage in seat order, each with a present beside them in their seat's colour, wrapped, and the
 * way out at the right. A present opened (`open`) is gone from its place in a burst of stars and
 * confetti, and its child hops for joy. Its one step is done once every present is open, and then it
 * finishes, so the way out swings open as it did in the room: time to go on. (A room's code runs
 * only until it ends, so the presents are opened before.) Not a door of the house: it is never
 * played, only stood on, under the fireworks (scene/Fireworks.tsx).
 */

import type { Model } from '../engine/gift'
import type { Decor, Point, RoomCode } from '../engine/api'
import { END } from '../words'

/** Where the kids stand: across the stage, `gap` metres apart, on its top; their present `beside` them a little in front. */
export const END_STAGE = { gap: 3, top: 0.4, beside: 0.85, front: 0.5, box: 0.55 } as const

/** Where the seat's kid stands on the end's stage for a party of `party`. */
export function standAt(seat: number, party: number): Point {
  return [(seat - (party - 1) / 2) * END_STAGE.gap, END_STAGE.top, 0]
}

/** A wrapped present: a box in the seat's colour with a white ribbon both ways and a bow on top. */
function present(colour: string): Model {
  const s = END_STAGE.box
  return (m) => {
    m.box(s, s, s, { at: [0, s / 2, 0], color: colour })
    m.box(s + 0.02, s + 0.02, 0.1, { at: [0, s / 2, 0], color: '#ffffff' })
    m.box(0.1, s + 0.02, s + 0.02, { at: [0, s / 2, 0], color: '#ffffff' })
    m.torus(0.09, 0.035, { at: [-0.08, s + 0.07, 0], rot: [0, 0, 0.5], color: '#ffffff' })
    m.torus(0.09, 0.035, { at: [0.08, s + 0.07, 0], rot: [0, 0, -0.5], color: '#ffffff' })
  }
}

/** A string of little flags in the house's colours, `width` metres long, hanging in two dips. */
function bunting(width: number): Model {
  const colours = ['#ff6bd5', '#ffd23a', '#5ec8ff', '#7dffb0', '#ff9f43', '#b57bff']
  const sag = (x: number) => -0.45 * Math.sin((Math.PI * 2 * (x + width / 2)) / width) ** 2
  return (m) => {
    const points: number[][] = []
    for (let i = 0; i <= 16; i++) {
      const x = -width / 2 + (i / 16) * width
      points.push([x, sag(x), 0])
    }
    m.tube(points, 0.03, { color: '#5a3a22' })
    for (let i = 0; i < 18; i++) {
      const x = -width / 2 + ((i + 0.5) / 18) * width
      const y = sag(x)
      m.extrude(
        [
          [x - 0.28, y],
          [x + 0.28, y],
          [x, y - 0.55],
        ],
        0.04,
        { color: colours[i % colours.length] },
      )
    }
  }
}

/** A standing lamp: a dark pole with a glowing round lamp on top, 3 m tall. */
const STANDING_LAMP: Model = (m) => {
  m.cylinder(0.06, 0.08, 2.8, { at: [0, 1.4, 0], color: '#3a3550' })
  m.sphere(0.25, { at: [0, 3, 0], color: '#ffe9a8', glow: true })
  m.cylinder(0.18, 0.2, 0.1, { at: [0, 2.78, 0], color: '#3a3550' })
}

/** A round plant in a pot, to stand by the hall's walls. */
const PLANT: Model = (m) => {
  m.cylinder(0.32, 0.24, 0.5, { at: [0, 0.25, 0], color: '#c0643a' })
  m.sphere(0.6, { at: [0, 0.9, 0], scale: [1.1, 0.85, 1], color: '#4f9a45' })
  m.sphere(0.4, { at: [0.4, 1.1, 0.1], scale: [1.1, 0.85, 1], color: '#5cae4f' })
  m.sphere(0.12, { at: [0.2, 1.35, 0.45], color: '#ff9ccf' })
}

/** The end's stage, and a way to open a seat's present on it: the room's code reads what is opened each frame. */
export interface EndStage {
  readonly code: RoomCode
  /** The present of this seat is opened: from the next frame it is gone in a burst, and its child hops. */
  open(seat: number): void
}

/** The end's stage for the party, `wrapped` saying by seat index who has a present to open: its room code, and the opening of each present. */
export function endStage(wrapped: readonly boolean[]): EndStage {
  const opened = new Set<number>()
  const code: RoomCode = (r, w) => {
    const players = w.players()
    r.box([0, END_STAGE.top / 2, 0], [12.4, END_STAGE.top, 2], { color: '#c98b52' })
    r.decor([0, END_STAGE.top - 0.02, 1.02], (m) => m.box(12.4, 0.06, 0.04, { at: [0, 0, 0], color: '#8a5a32' }))
    r.decor([0, 6.6, -1.2], bunting(15))
    for (const x of [-7.2, 7.2]) r.decor([x, 0, -2.4], PLANT)
    for (const x of [-6.8, 6.8]) {
      r.decor([x, 0, -0.8], STANDING_LAMP)
      r.lamp([x, 3, 0.5], { color: '#ffe2a0', power: 0.6, reach: 6 })
    }
    if (wrapped.length !== players.length) throw new Error(`the end's stage has ${players.length} players and ${wrapped.length} presents' places`)
    const boxes: (Decor | null)[] = players.map((p, i) => {
      const [x, y] = standAt(i, players.length)
      p.putAt([x, y, 0])
      return wrapped[i] ? r.decor([x + END_STAGE.beside, y, END_STAGE.front], present(p.color())) : null
    })
    const shut = () => boxes.filter((b) => b !== null && !b.hidden()).length
    r.wayOut([7.3, 0, 0])
    r.steps([{ hint: END.stageStep, at: [7.3, 1, 0], done: () => shut() === 0 }])
    let finished = false
    return () => {
      if (!finished && w.stepsDone() === 1) {
        finished = true
        w.finish()
      }
      boxes.forEach((box, i) => {
        if (box === null || box.hidden() || !opened.has(i)) return
        const p = players[i]
        const [x, y] = box.at()
        box.hide()
        w.puff([x, y + END_STAGE.box / 2, 0.6], 'star', { color: '#ffd23a', count: 18, size: 0.3 })
        w.puff([x, y + END_STAGE.box, 0.6], 'confetti', { count: 30, size: 0.18 })
        p.push([0, 5, 0])
      })
    }
  }
  return { code, open: (seat) => void opened.add(seat) }
}
