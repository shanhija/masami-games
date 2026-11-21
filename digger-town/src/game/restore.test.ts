import { describe, expect, it } from 'vitest'
import { PALLET_RING, PLANTS } from './map'
import { CELL, HALF, LOOSE_KINDS, SCOOP, SIDE } from './model'
import type { Sim, ThingKind, Zone } from './model'
import { botFrame, createBot } from './bot'
import { STORY } from './jobs'
import { createSim, tick } from './sim'

const DT = 1 / 30
const start = (storyDone: number) => createSim({ storyDone, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })
const free = (s: Sim) => s.things.filter((t) => !t.gone && t.heldBy === null)
/** Where each free thing lies: in the pallet ring, or at its place on the map. A ring slot depends on how the pallet came, so the ring counts as one place. */
const lying = (s: Sim) => free(s).map((t) => (Math.hypot(t.x - PALLET_RING.x, t.z - PALLET_RING.z) <= PALLET_RING.r ? `${t.kind}@ring` : `${t.kind}@${t.x.toFixed(1)},${t.z.toFixed(1)}`))

/** A sim started at a job, ticked until the job's wish is up and its setup things are out. */
function opened(storyDone: number): Sim {
  const s = start(storyDone)
  while (s.job === null) tick(s, DT)
  return s
}

/** Cubic metres of loose stuff in a zone, and the kind that lies most there. */
function groundIn(s: Sim, zone: Zone): { volume: number; kind: string } {
  const by = new Map<number, number>()
  for (let iz = 0; iz < SIDE; iz++) {
    for (let ix = 0; ix < SIDE; ix++) {
      if (Math.hypot(ix * CELL - HALF - zone.x, iz * CELL - HALF - zone.z) > zone.r) continue
      const i = ix + iz * SIDE
      by.set(s.terrain.kind[i], (by.get(s.terrain.kind[i]) ?? 0) + s.terrain.loose[i] * CELL * CELL)
    }
  }
  const best = [...by.entries()].sort((a, b) => b[1] - a[1])[0]
  return { volume: [...by.values()].reduce((a, b) => a + b, 0), kind: LOOSE_KINDS[best[0]] }
}

describe('a game started at a job (a reload between jobs)', () => {
  it.each(STORY.map((j, i) => [j.id, i] as const))('has what %s needs where playing through leaves it', (id, i) => {
    const s = opened(i)
    const job = STORY[i]
    // Things the job's own steps make, and what its steps ask for, by kind.
    const made = new Map<ThingKind, number>()
    const asked = new Map<ThingKind, number>()
    const add = (m: Map<ThingKind, number>, k: ThingKind, n: number) => m.set(k, (m.get(k) ?? 0) + n)
    const placed = new Map<number, number>()
    for (const step of job.steps) {
      if (step.kind === 'feed') add(made, PLANTS[step.plant].makes as ThingKind, Math.floor(step.need / PLANTS[step.plant].need + 1e-9) * PLANTS[step.plant].perBatch)
      if (step.kind === 'unload') add(made, PLANTS.saw.makes as ThingKind, PLANTS.saw.perBatch)
      if (step.kind === 'carry') add(asked, step.thing, step.count)
      if (step.kind === 'lift') {
        const b = s.builds[step.build]
        const at = placed.get(step.build) ?? b.placed
        for (let k = 0; k < step.pieces; k++) add(asked, b.spots[at + k].wants, 1)
        placed.set(step.build, at + step.pieces)
      }
    }
    // A pallet carried to the ring is asked for twice over (carried, then lifted): the carry is the same pallets.
    for (const step of job.steps) if (step.kind === 'carry') add(asked, step.thing, -step.count)
    for (const [kind, n] of asked) expect(free(s).filter((t) => t.kind === kind).length + (made.get(kind) ?? 0), `${id} needs ${n} ${kind}`).toBeGreaterThanOrEqual(n)
    const first = job.steps[0]
    if (first.kind === 'scoop') {
      const ground = groundIn(s, { ...first.dig, r: first.dig.r + 0.4 })
      expect(ground.kind, `${id} digs ${first.stuff}`).toBe(first.stuff)
      expect(ground.volume).toBeGreaterThanOrEqual(first.scoops * SCOOP)
    }
  })

  it('leaves what the plants made, as playing leaves it: pallets in the ring, planks at the saw, the crusher\'s heap', () => {
    const s = start(0)
    const bot = createBot()
    const restored = (id: string) => start(STORY.findIndex((j) => j.id === id))
    const checked: string[] = []
    let seen = -1
    while (s.storyDone < STORY.length) {
      if (s.storyDone !== seen && s.job === null) {
        seen = s.storyDone
        const id = STORY[seen].id
        const r = restored(id)
        // Everything the restored town has lying about lies there in the played one too, and the crusher's heap is at least as high.
        const played = lying(s)
        for (const t of lying(r)) expect(played, `${id}: ${t}`).toContain(t)
        // A played game digs some of the heap away at gravel; a restored one starts the job with all of it. A played game may also crush one batch more than the job needs: the bucket in the digger's arm when the step ends still goes into the hopper, and what is left in the bucket from the job before counts too.
        expect(groundIn(r, { x: -6.5, z: -22, r: 3 }).volume, `${id} heap`).toBeGreaterThanOrEqual(groundIn(s, { x: -6.5, z: -22, r: 3 }).volume - PLANTS.crusher.perBatch - 0.5)
        checked.push(id)
      }
      botFrame(bot, s, DT)
      tick(s, DT)
      s.events.length = 0
    }
    expect(checked).toHaveLength(STORY.length)
  }, 300000)

  it('puts the pallets in the ring at walls and hallWalls, and the planks at the saw at roof', () => {
    const at = (id: string) => start(STORY.findIndex((j) => j.id === id))
    for (const id of ['walls', 'hallWalls']) {
      const bricks = free(at(id)).filter((t) => t.kind === 'bricks')
      expect(bricks, id).toHaveLength(3)
      for (const t of bricks) expect(Math.hypot(t.x - PALLET_RING.x, t.z - PALLET_RING.z), `${id} ring`).toBeLessThanOrEqual(PALLET_RING.r)
    }
    expect(free(at('roof')).filter((t) => t.kind === 'planks')).toHaveLength(2)
  })

  it('builds the crusher\'s heap of gravel at gravel, and the soil there is gravel', () => {
    const before = groundIn(start(STORY.findIndex((j) => j.id === 'rocks')), { x: -6.5, z: -22, r: 3 })
    const after = groundIn(start(STORY.findIndex((j) => j.id === 'gravel')), { x: -6.5, z: -22, r: 3 })
    expect(after.kind).toBe('gravel')
    expect(after.volume - before.volume).toBeGreaterThan(8)
  })
})
