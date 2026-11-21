import { box, cylinder, lathe, mirror, part, roundBox, sphere, type Part, type V3 } from '../parts'

const PI2 = Math.PI / 2

/** Where a cab-over cab stands: half its width, its back and front z, the top of its floor and the driver's seat (the base of the driver's body). */
export interface CabSpec {
  halfW: number
  z0: number
  z1: number
  floor: number
  seat: V3
}

const WHEEL_RING = lathe(
  'cab-steering-ring',
  Array.from({ length: 9 }, (_, i) => [0.3 + 0.035 * Math.cos((i / 8) * Math.PI * 2), 0.035 * Math.sin((i / 8) * Math.PI * 2)] as const),
  14,
)

/**
 * A cab-over lorry cab with its face at z1: floor, door walls, a big chrome grille, bumper, lamps, pillars, glass on the front and
 * both sides, a roof with a visor and amber marker lamps, two seats, a dash and a steering wheel, mirrors. Door tops are 0.38 over
 * the floor and the roof 1.38 over it, so a driver seated at `seat` fits.
 */
export function cabOver(c: CabSpec): Part[] {
  const w = c.halfW * 2
  const len = c.z1 - c.z0
  const zm = (c.z0 + c.z1) / 2
  const bottom = c.floor - 0.32
  const doorTop = c.floor + 0.38
  const roof = c.floor + 1.38
  const [sx, sy, sz] = c.seat
  const faceTop = doorTop + 0.22
  return [
    // Body: rocker panel with the floor in it, door walls, face, back wall, roof and four pillars.
    part(roundBox(w, 0.34, len, 0.1), 'enamel', [0, bottom + 0.17, zm]),
    ...[1, -1].flatMap((s) => [
      part(box(0.12, 0.38, len - 0.1), 'enamel', [s * (c.halfW - 0.06), c.floor + 0.2, zm]),
      part(box(0.12, roof - doorTop, 0.12), 'enamel', [s * (c.halfW - 0.07), (doorTop + roof) / 2, c.z1 - 0.08]),
      part(box(0.12, roof - doorTop, 0.12), 'enamel', [s * (c.halfW - 0.07), (doorTop + roof) / 2, c.z0 + 0.08]),
      part(box(0.04, 0.05, len - 0.1), 'chrome', [s * (c.halfW + 0.005), doorTop + 0.01, zm]),
      part(box(0.03, 0.05, 0.22), 'chrome', [s * (c.halfW + 0.02), c.floor + 0.22, zm - 0.3]),
    ]),
    part(roundBox(w - 0.04, faceTop - bottom, 0.14, 0.06), 'enamel', [0, (bottom + faceTop) / 2, c.z1 - 0.07]),
    part(roundBox(w - 0.1, roof - c.floor, 0.12, 0.05), 'enamel', [0, (c.floor + roof) / 2, c.z0 + 0.06]),
    part(roundBox(w + 0.04, 0.14, len + 0.04, 0.06), 'enamel', [0, roof + 0.05, zm]),
    // Glass: windshield and both sides.
    part(roundBox(w - 0.3, roof - faceTop - 0.02, 0.03, 0.01), 'glass', [0, (faceTop + roof) / 2, c.z1 - 0.05]),
    ...[1, -1].map((s) => part(roundBox(0.03, roof - doorTop - 0.04, len - 0.3, 0.01), 'glass', [s * (c.halfW - 0.03), (doorTop + roof) / 2, zm])),
    // Face: the big grille, its slats and badge, the lamps, the bumper.
    part(roundBox(w * 0.68, 0.74, 0.08, 0.03), 'chrome', [0, bottom + 0.48, c.z1 + 0.03]),
    ...Array.from({ length: 9 }, (_, i) => part(box(0.045, 0.6, 0.03), 'dark', [(i - 4) * 0.17, bottom + 0.48, c.z1 + 0.08])),
    part(cylinder(0.12, 0.12, 0.035, 14), 'trim', [0, bottom + 0.48, c.z1 + 0.1], { rot: [PI2, 0, 0], colour: '#e03a3e' }),
    ...[1, -1].flatMap((s) => [
      part(cylinder(0.23, 0.23, 0.08, 16), 'chrome', [s * (c.halfW - 0.3), bottom + 0.5, c.z1 + 0.04], { rot: [PI2, 0, 0] }),
      part(cylinder(0.17, 0.17, 0.05, 16), 'lamp', [s * (c.halfW - 0.3), bottom + 0.5, c.z1 + 0.09], { rot: [PI2, 0, 0] }),
      part(box(0.16, 0.1, 0.04), 'lamp', [s * (c.halfW - 0.3), bottom + 0.06, c.z1 + 0.06], { colour: '#ffa51a' }),
    ]),
    part(roundBox(w + 0.1, 0.26, 0.3, 0.1), 'chrome', [0, bottom - 0.1, c.z1 + 0.06]),
    // Roof: visor with amber marker lamps.
    part(roundBox(w - 0.1, 0.07, 0.4, 0.03), 'enamel', [0, roof + 0.0, c.z1 + 0.12], { tint: 0.85 }),
    ...[-2, -1, 0, 1, 2].map((i) => part(box(0.15, 0.08, 0.05), 'lamp', [i * 0.32, roof + 0.0, c.z1 + 0.33], { colour: '#ffa51a' })),
    // Inside: both seats, the dash, the steering wheel in front of the driver.
    ...[sx, -sx].flatMap((x) => [
      part(box(0.6, 0.16, 0.62), 'dark', [x, sy - 0.06, sz]),
      part(box(0.58, 0.75, 0.14), 'dark', [x, sy + 0.3, sz - 0.34]),
      part(box(0.34, 0.2, 0.12), 'dark', [x, sy + 0.78, sz - 0.34]),
    ]),
    part(roundBox(w - 0.4, 0.4, 0.38, 0.1), 'dark', [0, c.floor + 0.3, c.z1 - 0.33]),
    part(cylinder(0.04, 0.04, 0.4, 8), 'steel', [sx, sy + 0.38, sz + 0.5], { rot: [-0.5, 0, 0] }),
    part(WHEEL_RING, 'dark', [sx, sy + 0.62, sz + 0.56], { rot: [-1.05, 0, 0] }),
    part(sphere(0.07, 8), 'chrome', [sx, sy + 0.62, sz + 0.56]),
    ...mirror([c.halfW - 0.02, c.floor + 0.95, c.z1 - 0.25], 1),
    ...mirror([-c.halfW + 0.02, c.floor + 0.95, c.z1 - 0.25], -1),
  ]
}
