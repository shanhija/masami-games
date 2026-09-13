import { Color, type Vector3 } from 'three'

import { dayPhase } from '../game/daylight'
import { clamp01 } from '../game/math'

export { daylight, night } from '../game/daylight'

/** The sun's place on its arc, police-local, far behind everything: up on the left in the morning, down on the right at dusk. */
export function sunPosition(time: number, out: Vector3) {
  const a = 2 * Math.PI * dayPhase(time)
  out.x = -16 + 34 * Math.sin(a)
  out.y = 4 + 26 * Math.cos(a)
  out.z = -80
}

interface Look {
  skyTop: Color
  skyBottom: Color
  sun: Color
}
const NIGHT: Look = { skyTop: new Color('#0b1440'), skyBottom: new Color('#1e2f66'), sun: new Color('#8ea2ff') }
const DUSK: Look = { skyTop: new Color('#6a5cb8'), skyBottom: new Color('#ff9d5c'), sun: new Color('#ffb070') }
const DAY: Look = { skyTop: new Color('#5ab4f5'), skyBottom: new Color('#8fd8ff'), sun: new Color('#fff4d6') }
const DUSK_AT = 0.35

/** Writes the sky and sunlight colours for this daylight into `out`, night through dusk to day. */
export function lookAt(d: number, out: Look) {
  const [from, to, t] = d < DUSK_AT ? [NIGHT, DUSK, d / DUSK_AT] : [DUSK, DAY, (d - DUSK_AT) / (1 - DUSK_AT)]
  out.skyTop.copy(from.skyTop).lerp(to.skyTop, clamp01(t))
  out.skyBottom.copy(from.skyBottom).lerp(to.skyBottom, clamp01(t))
  out.sun.copy(from.sun).lerp(to.sun, clamp01(t))
}

export const newLook = (): Look => ({ skyTop: new Color(), skyBottom: new Color(), sun: new Color() })
