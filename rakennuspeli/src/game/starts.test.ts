import { describe, expect, it } from 'vitest'
import { botFrame, createBot } from './bot'
import { STORY } from './jobs'
import { createSim, tick } from './sim'

const DT = 1 / 30

/** A game as `?job=<id>` starts it: everything before the job built, the machines at home. */
const startAt = (storyDone: number) => createSim({ storyDone, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })

describe('the tap bot started at every story job', () => {
  it.each(STORY.map((j, i) => [j.id, i] as const))('plays %s and the job after it to the end', (id, i) => {
    const s = startAt(i)
    const bot = createBot()
    const goal = Math.min(STORY.length, i + 2)
    const cap = STORY.slice(i, goal).reduce((sum, j) => sum + 5 * j.par + 60, 0)
    while (s.storyDone < goal) {
      botFrame(bot, s, DT)
      tick(s, DT)
      s.events.length = 0
      if (s.time > cap) throw new Error(`started at ${id}: still at ${s.job === null ? 'no job' : `${s.job.job.id} step ${s.job.step} (${s.job.job.steps[s.job.step].kind})`} after ${cap} s`)
    }
    expect(s.storyDone).toBe(goal)
  }, 300000)
})
