import { describe, expect, it } from 'vitest'
import { SANDPIT, SANDPIT_RING } from './map'
import { STORY } from './jobs'
import { ackCard, createSim, stepPointer, tick } from './sim'
import { spill } from './terrain'

const DT = 1 / 30

describe('the dozer\'s heap is the sand the truck tipped', () => {
  it.each([
    ['west', 3, 31.5],
    ['east', 14, 31],
  ])('has the dozer wait behind the sand tipped at the sand pit, with a heap left by the road holes to the %s', (_, x, z) => {
    const i = STORY.findIndex((j) => j.id === 'sandpit')
    const s = createSim({ storyDone: i, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })
    while (s.job === null) tick(s, DT)
    ackCard(s)
    // The step the truck has just finished tipping for: its sand lies in the ring, and an older heap lies 11 m from the pit.
    s.job.step = 2
    spill(s.terrain, SANDPIT_RING.x, SANDPIT_RING.z, 1.6, 5, 'sand')
    spill(s.terrain, x, z, 1.6, 6, 'sand')
    const p = stepPointer(s)
    expect(p).not.toBeNull()
    // The marker is on the line from the pit through the tipped sand, behind it: beside neither of the heaps' middle.
    expect(Math.abs((p?.x ?? 0) - SANDPIT.x)).toBeLessThan(1)
    expect(p?.z).toBeLessThan(SANDPIT_RING.z)
  })
})
