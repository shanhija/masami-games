/** What the dozer and the roller share: struts between two points, a canopy on four posts, and the driver's seat. */

import { Euler, Quaternion, Vector3 } from 'three'

import { box, cylinder, part, roundBox, type Finish, type Part, type PartOptions, type V3 } from '../parts'

const UP = new Vector3(0, 1, 0)
const strutQ = new Quaternion()
const strutE = new Euler()
const strutD = new Vector3()

/** A round bar of radius `r` from point `a` to point `b`. */
export function strut(a: V3, b: V3, r: number, finish: Finish, o: PartOptions = {}): Part {
  strutD.set(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const len = strutD.length()
  strutE.setFromQuaternion(strutQ.setFromUnitVectors(UP, strutD.normalize()))
  return part(cylinder(r, r, len, 10), finish, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], { ...o, rot: [strutE.x, strutE.y, strutE.z] })
}

/** Where a canopy stands: posts at x = +-halfW, z = front and rear, from the floor y0 up to the roof's underside y1. */
export interface CanopySpec {
  halfW: number
  front: number
  rear: number
  y0: number
  y1: number
}

/** Four posts, a roof with an overhang and two work lamps on its front edge. */
export function canopy({ halfW, front, rear, y0, y1 }: CanopySpec): Part[] {
  const midZ = (front + rear) / 2
  const h = y1 - y0
  return [
    ...[halfW, -halfW].flatMap((x) => [front, rear].map((z) => part(roundBox(0.1, h, 0.1, 0.035), 'enamel', [x, y0 + h / 2, z], { tint: 0.92 }))),
    part(roundBox(halfW * 2 + 0.3, 0.12, front - rear + 0.3, 0.05), 'enamel', [0, y1 + 0.06, midZ]),
    ...[-0.45, 0.45].flatMap((x) => [part(box(0.2, 0.14, 0.14), 'dark', [x, y1 + 0.02, front + 0.1]), part(box(0.15, 0.09, 0.03), 'lamp', [x, y1 + 0.02, front + 0.18])]),
  ]
}

/** The driver's seat: a cushion whose top is at the seat's height and a tall back behind it. */
export function seatParts(seat: V3): Part[] {
  const [x, y, z] = seat
  return [
    part(roundBox(0.62, 0.16, 0.58, 0.05), 'dark', [x, y - 0.06, z]),
    part(roundBox(0.62, 0.7, 0.12, 0.05), 'dark', [x, y + 0.32, z - 0.36]),
    part(roundBox(0.1, 0.2, 0.4, 0.03), 'dark', [x + 0.38, y + 0.14, z]),
    part(roundBox(0.1, 0.2, 0.4, 0.03), 'dark', [x - 0.38, y + 0.14, z]),
  ]
}
