import { describe, expect, it } from 'vitest'

import { createSim } from '../game/sim'
import { poseOf, walkInSize, WAVE_SIZE } from './Animals'

const newSim = () => createSim({ storyDone: 16, moreDone: 0, coins: 0, stars: 0, mode: 'easy', seed: 5000, lastTemplate: -1 })

describe('how big an animal on her way home is drawn', () => {
  it('is her own size when she is not moving in, and bigger the further she is from her door, down to her own size near it', () => {
    const a = newSim().animals[0]
    a.goalX = 0
    a.goalZ = 0
    a.x = 0
    a.z = 40
    expect(walkInSize(a)).toBe(1)
    a.movingIn = true
    const sizes = [2, 6, 10, 14, 18, 22, 27, 40].map((z) => {
      a.z = z
      return walkInSize(a)
    })
    expect(sizes[0]).toBe(1)
    expect(sizes[1]).toBe(1)
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]).toBeGreaterThanOrEqual(sizes[i - 1])
    expect(sizes[5]).toBeGreaterThan(2)
    // Never bigger than she is when she waves from the window: she must not tower over the house.
    expect(Math.max(...sizes)).toBeLessThanOrEqual(WAVE_SIZE)
  })
})

describe('the animal walking to her door is drawn at the size her suitcase is', () => {
  it('walks at walkInSize in body and legs, and at her own size when she is not moving in', () => {
    const a = newSim().animals[0]
    a.mood = 'walk'
    a.goalX = 0
    a.goalZ = 0
    a.x = 0
    a.z = 40
    expect(poseOf(a).size).toBe(1)
    a.movingIn = true
    expect(poseOf(a).size).toBe(walkInSize(a))
    expect(poseOf(a).size).toBeCloseTo(WAVE_SIZE, 5)
    a.z = 14
    expect(poseOf(a).size).toBe(walkInSize(a))
    expect(poseOf(a).size).toBeGreaterThan(1)
    expect(poseOf(a).size).toBeLessThan(WAVE_SIZE)
    a.z = 3
    expect(poseOf(a).size).toBe(1)
  })
})
