/**
 * Magic House: the survey of a room as built (plan.md, What fails goes back as plain sentences):
 * where its floors, gaps and things really are, as plain data rounded to centimetres. The designer
 * wrote the walkthrough without seeing the room, so step 3's sentences quote this when a room
 * fails, beside the notes of what the engine set right by itself (SURVEY_NOTES). `surveyText` says it
 * in plain lines for the designer (protocol.ts TrialReport.survey). From high up (step 6) it says the
 * floor's z too: each floor's footprint, the gaps across the floor between floors with only the
 * house's floor under between them, and every point with its z.
 *
 * Every room is a room of the house (step 7a): the survey's first line says where the house's floor,
 * walls and ceiling are, and its lists leave out the house's own solids (world.ts Solid.house), which
 * are the same in every room; a player standing on the house's floor is said to. Each floor says
 * whether it is dressable (engine/look.ts dressable), so the look's designer, who reads this survey
 * too, knows which plain ledges are theirs to dress.
 */

import type { Words } from '../../../profiles/src/lang'
import type { Vec3 } from '../../../silly-billy/src/engine/types'
import { BUDGET, FEEL } from './api'
import { dressable } from './look'
import type { Sim } from './sim'
import { atan2 } from './math'
import { roomPoint, thingBox } from './state'
import type { Rise } from './api'
import type { HandleId, RoomView } from './world'

/** A solid's top: where it can be stood on. Its slope is in degrees, + rising to the right; a ball's top is its highest point. */
export interface SurveyFloor {
  id: HandleId
  name: string | null
  shape: 'box' | 'ramp' | 'ball'
  /** Its left and right ends, its top and its bottom, in the room. */
  x0: number
  x1: number
  /** Added in step 6: from high up, its near and far ends along z (the box round its footprint); 0 from the side. */
  z0: number
  z1: number
  top: number
  bottom: number
  slope: number
  /** Added in step 6: from high up, the way a ramp rises (its slope is then the angle, always 0 or more); null from the side and for a box or a ball. */
  rises: Rise | null
  through: boolean
  ice: boolean
  bounce: number
  /** m/s along x a belt carries at; 0 for none. */
  belt: number
  /** Added in step 6: from high up, m/s along z a belt carries at; 0 from the side. */
  beltZ: number
  mover: HandleId | null
  hidden: boolean
  /** Added in step 7a: the look may dress it (engine/look.ts dressable). */
  dressable: boolean
}

/** Between the right end of a floor and the nearest floor beyond it: how far across and how far up (below 0 down). From high up: between two floors with only the house's floor under between them, edge to edge across the floor. */
export interface SurveyGap {
  from: HandleId
  to: HandleId
  across: number
  up: number
}

export interface SurveyThing {
  id: HandleId
  name: string | null
  /** Its foot. */
  at: Vec3
  width: number
  height: number
  /** Added in step 6: its size along z. */
  depth: number
  weight: number
  /** It weighs FEEL.carryMax or less, so grab carries it. */
  carried: boolean
  round: boolean
  hidden: boolean
}

export interface SurveyZone {
  id: HandleId
  name: string | null
  x0: number
  x1: number
  y0: number
  y1: number
  /** Added in step 6: from high up, its near and far ends along z; 0 from the side. */
  z0: number
  z1: number
  mover: HandleId | null
  hidden: boolean
}

export interface SurveyMover {
  id: HandleId
  name: string | null
  /** Its origin as play starts. */
  at: Vec3
  hidden: boolean
}

export interface Survey {
  /** Added in step 6: how the room is seen, which says how its lines are read. */
  view: RoomView
  /** The room's box, inside the house's floor, walls and ceiling: the same in every room (world.ts ROOM_BOUNDS). */
  bounds: { min: Vec3; max: Vec3 }
  /** The pieces the build spent of BUDGET.pieces, and the turns of BUDGET.buildTurns. */
  pieces: number
  turns: number
  floors: SurveyFloor[]
  gaps: SurveyGap[]
  things: SurveyThing[]
  zones: SurveyZone[]
  movers: SurveyMover[]
  /** Each player's start, and what they stand on there (the house's floor too). */
  players: { seat: number; at: Vec3; on: HandleId | null }[]
  wayOut: Vec3
  steps: { hint: Words; at: Vec3 }[]
  /** What the engine set right by itself, and what the kit forgave in a model. */
  notes: string[]
}

const cm = (v: number) => Math.round(v * 100) / 100
const cmPoint = (v: readonly number[]): Vec3 => [cm(v[0]), cm(v[1]), cm(v[2])]

/** How high a floor is over a gap's far side that it still counts as the floor beyond: the gap is for jumping and dropping. */
const GAP_RISE = 4

/** The room as it stands, which finishBuild has settled: the survey is taken once, before play. Its floors are the room's own solids, the house's left out. */
export function surveyRoom(sim: Sim, pieces: number, turns: number, notes: readonly string[]): Survey {
  const w = sim.world
  const high = w.view === 'high'
  const floors: SurveyFloor[] = w.solids.flatMap((s, i) => {
    if (s.house) return []
    const o = sim.outlines[i]
    const sh = s.shape
    // A ramp's angle: its rise over its run, the run along x, or from high up along z when it rises back or front.
    const run = sh.kind === 'ramp' && (sh.rises === 'back' || sh.rises === 'front') ? sh.size[2] : sh.kind === 'ramp' ? sh.size[0] : 1
    const angle = sh.kind === 'ramp' ? (atan2(sh.size[1], run) * 180) / Math.PI : 0
    const slope = sh.kind === 'ramp' && !high ? angle * (sh.rises === 'right' ? 1 : -1) : angle
    const floor: SurveyFloor = {
      id: s.id,
      name: s.name,
      shape: sh.kind,
      x0: cm(o.minX),
      x1: cm(o.maxX),
      z0: high ? cm(o.minY) : 0,
      z1: high ? cm(o.maxY) : 0,
      top: cm(high ? o.y1 : o.maxY),
      bottom: cm(high ? o.y0 : o.minY),
      slope: cm(slope),
      rises: high && sh.kind === 'ramp' ? sh.rises : null,
      through: s.surface.through,
      ice: s.surface.ice,
      bounce: s.surface.bounce,
      belt: s.surface.belt[0],
      beltZ: high ? s.surface.belt[2] : 0,
      mover: s.mover,
      hidden: s.hidden,
      dressable: dressable(s),
    }
    return [floor]
  })
  // Gaps between the room's floors that stay where they are and can be stood on: the house's floor under them all is not one of them.
  const still = floors.filter((f) => f.mover === null && !f.hidden && Math.abs(f.slope) <= FEEL.slope)
  const gaps: SurveyGap[] = high ? floorGaps(still) : []
  for (const a of high ? [] : still) {
    let best: SurveyFloor | null = null
    for (const b of still) {
      if (b === a || b.x0 < a.x1 + 0.05 || Math.abs(b.top - a.top) > GAP_RISE) continue
      if (best === null || b.x0 < best.x0 || (b.x0 === best.x0 && Math.abs(b.top - a.top) < Math.abs(best.top - a.top))) best = b
    }
    // Only where nothing standable is right beside the end: a floor that goes on under it is a drop, not a gap.
    if (best !== null && !still.some((c) => c !== a && c.x0 <= a.x1 + 0.05 && c.x1 > a.x1 + 0.05 && c.top <= a.top + FEEL.stepUp)) {
      gaps.push({ from: a.id, to: best.id, across: cm(best.x0 - a.x1), up: cm(best.top - a.top) })
    }
  }
  const box = { x0: 0, y0: 0, x1: 0, y1: 0 }
  return {
    view: w.view,
    bounds: { min: cmPoint(w.bounds.min), max: cmPoint(w.bounds.max) },
    pieces,
    turns,
    floors,
    gaps,
    things: w.things.map((t) => {
      thingBox(t, box)
      return { id: t.id, name: t.name, at: cmPoint(t.at), width: cm(box.x1 - box.x0), height: cm(box.y1 - box.y0), depth: cm(t.box.max[2] - t.box.min[2]), weight: t.weight, carried: t.weight <= FEEL.carryMax, round: t.round, hidden: t.hidden }
    }),
    zones: w.zones.map((z) => {
      const [cx, cy, cz] = roomPoint(sim, z.at, z.mover)
      return { id: z.id, name: z.name, x0: cm(cx - z.size[0] / 2), x1: cm(cx + z.size[0] / 2), y0: cm(cy - z.size[1] / 2), y1: cm(cy + z.size[1] / 2), z0: high ? cm(cz - z.size[2] / 2) : 0, z1: high ? cm(cz + z.size[2] / 2) : 0, mover: z.mover, hidden: z.hidden }
    }),
    movers: w.movers.map((m) => ({ id: m.id, name: m.name, at: cmPoint(m.at), hidden: m.hidden })),
    players: w.players.map((p) => ({ seat: p.seat, at: cmPoint(p.at), on: p.on })),
    wayOut: cmPoint(w.wayOut.at),
    steps: w.steps.map((s) => ({ hint: s.hint, at: cmPoint(s.at) })),
    notes: [...notes],
  }
}

/**
 * From high up: the gaps between the still floors, each pair once, where the boxes round their
 * footprints are apart on the floor by more than 5 cm and at most two running jumps, the far one at
 * most GAP_RISE up or down, and no floor of the room's is under the middle of the way between them
 * (only the house's, which is under everything).
 */
function floorGaps(still: readonly SurveyFloor[]): SurveyGap[] {
  const gaps: SurveyGap[] = []
  for (const a of still) {
    for (const b of still) {
      if (b.id <= a.id || Math.abs(b.top - a.top) > GAP_RISE) continue
      const dx = Math.max(0, b.x0 - a.x1, a.x0 - b.x1)
      const dz = Math.max(0, b.z0 - a.z1, a.z0 - b.z1)
      const across = Math.sqrt(dx * dx + dz * dz)
      if (across <= 0.05 || across > 2 * FEEL.jumpAcross) continue
      // The middle of the way between their nearest edges.
      const mx = dx === 0 ? (Math.max(a.x0, b.x0) + Math.min(a.x1, b.x1)) / 2 : b.x0 > a.x1 ? (a.x1 + b.x0) / 2 : (b.x1 + a.x0) / 2
      const mz = dz === 0 ? (Math.max(a.z0, b.z0) + Math.min(a.z1, b.z1)) / 2 : b.z0 > a.z1 ? (a.z1 + b.z0) / 2 : (b.z1 + a.z0) / 2
      if (still.some((c) => c !== a && c !== b && c.x0 <= mx && c.x1 >= mx && c.z0 <= mz && c.z1 >= mz)) continue
      gaps.push({ from: a.id, to: b.id, across: cm(across), up: cm(b.top - a.top) })
    }
  }
  return gaps
}

// ------------------------------------------------------------------------------ in plain lines

/** A number as the survey's lines say it: to the centimetre, with no trailing zeros. */
const said = (v: number) => String(cm(v))
const at2 = (p: readonly number[]) => `${said(p[0])}, ${said(p[1])}`

/** What a floor's line says it is besides its place: its surface, its mover, hidden, and dressable. */
function floorMore(f: SurveyFloor, belt: string, describe: (id: HandleId) => string): string[] {
  return [
    f.through ? 'jumped up through from below' : '',
    f.ice ? 'slippery' : '',
    f.bounce > 0 ? `bounces ${said(f.bounce)} m` : '',
    belt,
    f.mover !== null ? `part of ${describe(f.mover)}, so it moves` : '',
    f.hidden ? 'hidden as play starts' : '',
    f.dressable ? 'dressable' : '',
  ].filter((m) => m !== '')
}

/**
 * The survey in plain lines for the designer, who wrote the walkthrough without seeing the room:
 * the house round it, the weight, every floor of the room's with what is special about it, the gaps
 * between the still floors, the things, zones and movers, the starts, the way out, the steps and the
 * notes. `describe` names a handle as the trial's sentences do (engine/room.ts Room.describe).
 */
export function surveyText(s: Survey, describe: (id: HandleId) => string): string {
  if (s.view === 'high') return floorSurveyText(s, describe)
  const lines: string[] = []
  lines.push(`The house: its floor's top at y ${said(s.bounds.min[1])}, its walls at x ${said(s.bounds.min[0])} and ${said(s.bounds.max[0])}, its ceiling at y ${said(s.bounds.max[1])}; everything stands inside them.`)
  lines.push(`The build used ${s.pieces.toLocaleString('en')} pieces of ${BUDGET.pieces.toLocaleString('en')} and ${s.turns.toLocaleString('en')} loop turns and calls of ${BUDGET.buildTurns.toLocaleString('en')}.`)
  lines.push("Floors (where each of the room's solids can be stood on: its left and right ends and its top):")
  for (const f of s.floors) {
    const shape = f.shape === 'ramp' ? `a ramp sloping ${said(Math.abs(f.slope))} degrees up to the ${f.slope > 0 ? 'right' : 'left'}` : `a ${f.shape}`
    const more = floorMore(f, f.belt !== 0 ? `carries ${said(f.belt)} m/s along x` : '', describe)
    lines.push(`- ${describe(f.id)}, ${shape}: x ${said(f.x0)} to ${said(f.x1)}, top ${said(f.top)}, bottom ${said(f.bottom)}${more.length > 0 ? `; ${more.join(', ')}` : ''}`)
  }
  if (s.gaps.length > 0) {
    lines.push('Gaps between the floors that stay put (edge to edge, and how far up the far side is):')
    for (const g of s.gaps) lines.push(`- from ${describe(g.from)} to ${describe(g.to)}: ${said(g.across)} m across, ${said(Math.abs(g.up))} m ${g.up < 0 ? 'down' : 'up'}`)
  }
  if (s.things.length > 0) {
    lines.push('Things (each by its foot):')
    for (const t of s.things) {
      const more = [t.carried ? 'grab carries it' : 'too heavy to carry', t.round ? 'round' : '', t.hidden ? 'hidden as play starts' : ''].filter((m) => m !== '')
      lines.push(`- ${describe(t.id)}: at ${at2(t.at)}, ${said(t.width)} m wide and ${said(t.height)} m tall, weighs ${said(t.weight)}; ${more.join(', ')}`)
    }
  }
  if (s.zones.length > 0) {
    lines.push('Zones:')
    for (const z of s.zones) {
      const more = [z.mover !== null ? `part of ${describe(z.mover)}, so it moves` : '', z.hidden ? 'hidden as play starts' : ''].filter((m) => m !== '')
      lines.push(`- ${describe(z.id)}: x ${said(z.x0)} to ${said(z.x1)}, y ${said(z.y0)} to ${said(z.y1)}${more.length > 0 ? `; ${more.join(', ')}` : ''}`)
    }
  }
  if (s.movers.length > 0) {
    lines.push('Movers (each origin as play starts):')
    for (const m of s.movers) lines.push(`- ${describe(m.id)}: at ${at2(m.at)}${m.hidden ? '; hidden as play starts' : ''}`)
  }
  lines.push(`Starts: ${s.players.map((p) => `player ${p.seat} at ${at2(p.at)}${p.on === null ? '' : ` on ${describe(p.on)}`}`).join('; ')}.`)
  lines.push(`The way out: at ${at2(s.wayOut)}.`)
  lines.push(`Steps: ${s.steps.map((st, i) => `${i + 1} '${st.hint.en}' at ${at2(st.at)}`).join('; ')}.`)
  for (const n of s.notes) lines.push(`Note: ${n}`)
  return lines.join('\n')
}

const at3 = (p: readonly number[]) => `${said(p[0])}, ${said(p[1])}, ${said(p[2])}`

/** The survey from high up in plain lines: as surveyText, with the floor's z given beside x and every point as x, y, z. */
function floorSurveyText(s: Survey, describe: (id: HandleId) => string): string {
  const lines: string[] = []
  lines.push(`The house: its floor's top at y ${said(s.bounds.min[1])}, x ${said(s.bounds.min[0])} to ${said(s.bounds.max[0])} and z ${said(s.bounds.min[2])} (the back wall) to ${said(s.bounds.max[2])} (the open front), walls at the back and both sides, and the players held under y ${said(s.bounds.max[1])}; everything stands inside them.`)
  lines.push(`The build used ${s.pieces.toLocaleString('en')} pieces of ${BUDGET.pieces.toLocaleString('en')} and ${s.turns.toLocaleString('en')} loop turns and calls of ${BUDGET.buildTurns.toLocaleString('en')}.`)
  lines.push("Floors (where each of the room's solids can be stood on: the box round its footprint, x and z, and its top):")
  for (const f of s.floors) {
    const shape = f.shape === 'ramp' ? `a ramp sloping ${said(f.slope)} degrees up toward ${f.rises === 'right' ? '+x' : f.rises === 'left' ? '-x' : f.rises === 'back' ? '-z' : '+z'}` : `a ${f.shape}`
    const more = floorMore(f, f.belt !== 0 || f.beltZ !== 0 ? `carries ${said(f.belt)} m/s along x and ${said(f.beltZ)} along z` : '', describe)
    lines.push(`- ${describe(f.id)}, ${shape}: x ${said(f.x0)} to ${said(f.x1)}, z ${said(f.z0)} to ${said(f.z1)}, top ${said(f.top)}, bottom ${said(f.bottom)}${more.length > 0 ? `; ${more.join(', ')}` : ''}`)
  }
  if (s.gaps.length > 0) {
    lines.push("Gaps between the floors that stay put, with only the house's floor under between them (edge to edge across the floor, and how far up the far side is):")
    for (const g of s.gaps) lines.push(`- from ${describe(g.from)} to ${describe(g.to)}: ${said(g.across)} m across, ${said(Math.abs(g.up))} m ${g.up < 0 ? 'down' : 'up'}`)
  }
  if (s.things.length > 0) {
    lines.push('Things (each by its foot, x, y, z):')
    for (const t of s.things) {
      const more = [t.carried ? 'grab carries it' : 'too heavy to carry', t.round ? 'round' : '', t.hidden ? 'hidden as play starts' : ''].filter((m) => m !== '')
      lines.push(`- ${describe(t.id)}: at ${at3(t.at)}, ${said(t.width)} m along x, ${said(t.depth)} along z and ${said(t.height)} tall, weighs ${said(t.weight)}; ${more.join(', ')}`)
    }
  }
  if (s.zones.length > 0) {
    lines.push('Zones:')
    for (const z of s.zones) {
      const more = [z.mover !== null ? `part of ${describe(z.mover)}, so it moves` : '', z.hidden ? 'hidden as play starts' : ''].filter((m) => m !== '')
      lines.push(`- ${describe(z.id)}: x ${said(z.x0)} to ${said(z.x1)}, z ${said(z.z0)} to ${said(z.z1)}, y ${said(z.y0)} to ${said(z.y1)}${more.length > 0 ? `; ${more.join(', ')}` : ''}`)
    }
  }
  if (s.movers.length > 0) {
    lines.push('Movers (each origin as play starts, x, y, z):')
    for (const m of s.movers) lines.push(`- ${describe(m.id)}: at ${at3(m.at)}${m.hidden ? '; hidden as play starts' : ''}`)
  }
  lines.push(`Starts: ${s.players.map((p) => `player ${p.seat} at ${at3(p.at)}${p.on === null ? '' : ` on ${describe(p.on)}`}`).join('; ')}.`)
  lines.push(`The way out: at ${at3(s.wayOut)}.`)
  lines.push(`Steps: ${s.steps.map((st, i) => `${i + 1} '${st.hint.en}' at ${at3(st.at)}`).join('; ')}.`)
  for (const n of s.notes) lines.push(`Note: ${n}`)
  return lines.join('\n')
}
