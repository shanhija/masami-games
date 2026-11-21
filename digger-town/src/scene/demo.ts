/** `demoPose`: sweeps every joint of a machine through its whole range and fills its loads, for the viewer. */

import { clamp01, lerp } from '../game/math'
import {
  BOOM_RANGE,
  CURL_RANGE,
  HOOK_TOP_MOBILE,
  HOOK_TOP_TOWER,
  MIXER_SAND,
  REACH_RANGE,
  SCOOP,
  STICK_RANGE,
  TROLLEY_RANGE,
  DUMPER_CAP,
  type LooseKind,
  type Machine,
} from '../game/model'

/** A smooth 0 to 1 and back, once every `period` seconds, shifted by `phase` (0 to 1 of a period). */
const wave = (t: number, period: number, phase: number) => 0.5 - 0.5 * Math.cos(((t / period + phase) * Math.PI) * 2)
/** The point `w` (0 to 1) of the way through a range. */
const through = (range: readonly [number, number], w: number) => lerp(range[0], range[1], w)

const KINDS: readonly LooseKind[] = ['dirt', 'sand', 'rock', 'gravel', 'concrete']

/** Poses `m` as a function of the time `t` in seconds: the same `t` always gives the same pose. It sets the pose and nothing else; the machine is not moved. */
export function demoPose(m: Machine, t: number): void {
  m.speed = 1.5
  m.steer = Math.sin(t * 0.7) * 0.8
  m.rollL = t * 1.5
  m.rollR = t * 1.5
  m.rev = 0.5 + 0.5 * Math.sin(t * 1.3)
  const kind = KINDS[Math.floor(t / 5) % KINDS.length]
  switch (m.kind) {
    case 'digger': {
      m.swing = Math.sin(t * 0.5) * 1.4
      m.boom = through(BOOM_RANGE, wave(t, 11, 0))
      m.stick = through(STICK_RANGE, wave(t, 7, 0.25))
      m.curl = through(CURL_RANGE, wave(t, 5, 0.5))
      m.load = { amount: SCOOP * wave(t, 9, 0.1), kind }
      break
    }
    case 'dumper': {
      m.bed = clamp01(wave(t, 8, 0))
      m.load = { amount: DUMPER_CAP * (1 - m.bed), kind }
      break
    }
    case 'dozer': {
      m.blade = wave(t, 6, 0)
      m.pushing = 2 * wave(t, 9, 0.3)
      break
    }
    case 'roller': {
      m.shake = wave(t, 4, 0)
      break
    }
    case 'mixer': {
      m.sand = MIXER_SAND * wave(t, 12, 0)
      m.water = wave(t, 10, 0.2)
      m.concrete = wave(t, 14, 0.5)
      m.mixed = wave(t, 8, 0)
      m.drum = t * 1.8
      m.chute = wave(t, 9, 0.6)
      break
    }
    case 'forklift': {
      m.lift = wave(t, 7, 0)
      break
    }
    case 'tower': {
      m.up = 1
      m.jib = t * 0.3
      m.trolley = through(TROLLEY_RANGE, wave(t, 13, 0))
      m.hookY = through([2, HOOK_TOP_TOWER], wave(t, 9, 0.3))
      m.swayX = Math.sin(t * 1.3) * 0.5
      m.swayZ = Math.cos(t * 1.1) * 0.5
      m.speed = 0
      break
    }
    case 'semi': {
      m.trailerYaw = m.yaw + Math.sin(t * 0.5) * 0.8
      m.logs = 1 - wave(t, 10, 0)
      break
    }
    case 'mobile': {
      m.legs = clamp01(wave(t, 12, 0) * 1.6 - 0.1)
      m.jib = m.yaw + Math.PI + t * 0.25
      m.reach = through(REACH_RANGE, wave(t, 11, 0.3))
      m.hookY = through([2, HOOK_TOP_MOBILE], wave(t, 8, 0))
      m.swayX = Math.sin(t * 1.3) * 0.4
      m.swayZ = Math.cos(t * 1.1) * 0.4
      break
    }
  }
}
