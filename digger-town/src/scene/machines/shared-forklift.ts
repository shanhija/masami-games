import { Euler, Quaternion, Vector3 } from 'three'

import { box, cylinder, part, type Finish, type Part, type PartOptions, type V3 } from '../parts'

const AXIS_Y = new Vector3(0, 1, 0)
const AXIS_Z = new Vector3(0, 0, 1)
const along = new Vector3()
const turn = new Quaternion()
const euler = new Euler()

/** Where a shape lying along `axis` goes to join `a` and `b`: its middle, its rotation and its length. */
function between(a: V3, b: V3, axis: Vector3) {
  along.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const length = along.length()
  turn.setFromUnitVectors(axis, along.normalize())
  euler.setFromQuaternion(turn, 'XYZ')
  return { length, at: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2] as V3, rot: [euler.x, euler.y, euler.z] as V3 }
}

/** A square bar of side `thick` from `a` to `b`, for lattice members and stays. */
export function strut(a: V3, b: V3, thick: number, finish: Finish, o: PartOptions = {}): Part {
  const s = between(a, b, AXIS_Z)
  return part(box(1, 1, 1), finish, s.at, { ...o, rot: s.rot, scale: [thick, thick, s.length] })
}

/** A round rod of radius `r` from `a` to `b`, for rams and pipes. */
export function rod(a: V3, b: V3, r: number, finish: Finish, o: PartOptions = {}): Part {
  const s = between(a, b, AXIS_Y)
  return part(cylinder(r, r, s.length, 10), finish, s.at, { ...o, rot: s.rot })
}
