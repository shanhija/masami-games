import { describe, expect, it } from 'vitest'
import { PerspectiveCamera, Ray, Vector3 } from 'three'

import { SAND_HILL } from '../game/map'
import { newMachine, SEAT, type MachineKind, type Machines } from '../game/model'
import { createTerrain, heightAt } from '../game/terrain'
import { pickGround, pickMachine, pickRay } from './pick'

/** A camera high in the south looking at a point, like the game's. */
function cameraAt(x: number, y: number, z: number, at: Vector3): PerspectiveCamera {
  const camera = new PerspectiveCamera(38, 1.6, 0.5, 400)
  camera.position.set(x, y, z)
  camera.lookAt(at)
  camera.updateMatrixWorld()
  return camera
}

describe('pick', () => {
  it('a ray at the sand hill peak returns the peak', () => {
    const terrain = createTerrain()
    let peak = { x: 0, y: -9, z: 0 }
    for (let x = SAND_HILL.x - 6; x <= SAND_HILL.x + 6; x += 0.5) {
      for (let z = SAND_HILL.z - 6; z <= SAND_HILL.z + 6; z += 0.5) {
        const y = heightAt(terrain, x, z)
        if (y > peak.y) peak = { x, y, z }
      }
    }
    expect(peak.y).toBeGreaterThan(3)
    const at = new Vector3(peak.x, peak.y, peak.z)
    const camera = cameraAt(peak.x + 4, peak.y + 38, peak.z + 32, at)
    const hit = pickGround(terrain, pickRay(camera, 0, 0))
    expect(hit).not.toBeNull()
    expect(Math.hypot(hit!.x - peak.x, hit!.z - peak.z)).toBeLessThan(0.1)
    expect(hit!.y).toBeCloseTo(peak.y, 1)
  })

  it('a ray at a machine cab hits it, and the active machine is never picked', () => {
    const far = { x: 45, z: 45, yaw: 0 }
    const machines: Machines = {
      digger: newMachine('digger', { x: 0, z: 0, yaw: 0 }),
      dumper: newMachine('dumper', { x: 10, z: 4, yaw: 1 }),
      dozer: newMachine('dozer', far),
      roller: newMachine('roller', far),
      mixer: newMachine('mixer', far),
      forklift: newMachine('forklift', far),
      tower: newMachine('tower', far),
      semi: newMachine('semi', far),
      mobile: newMachine('mobile', far),
    }
    machines.digger.unlocked = true
    machines.dumper.unlocked = true
    const m = machines.dumper
    const seat = new Vector3(m.x + SEAT.dumper[0] * Math.cos(m.yaw) + SEAT.dumper[2] * Math.sin(m.yaw), SEAT.dumper[1], m.z - SEAT.dumper[0] * Math.sin(m.yaw) + SEAT.dumper[2] * Math.cos(m.yaw))
    const camera = cameraAt(seat.x, 30, seat.z + 26, seat)
    const ray = pickRay(camera, 0, 0)
    const active: MachineKind = 'digger'
    expect(pickMachine({ machines, active }, ray)?.kind).toBe('dumper')
    expect(pickMachine({ machines, active: 'dumper' }, ray)).toBeNull()
    const away = new Ray(new Vector3(40, 30, 30), new Vector3(0, -0.6, -0.8).normalize())
    expect(pickMachine({ machines, active }, away)).toBeNull()
  })

  it('a ray into the sky is null', () => {
    const terrain = createTerrain()
    const camera = cameraAt(0, 40, 40, new Vector3(0, 60, 0))
    expect(pickGround(terrain, pickRay(camera, 0, 0))).toBeNull()
  })

  it('a ray over the world at the horizon is null', () => {
    const terrain = createTerrain()
    expect(pickGround(terrain, new Ray(new Vector3(0, 40, 40), new Vector3(0, -0.001, -1).normalize()))).toBeNull()
  })
})
