/**
 * Where each chapter's party is watched from: the points the camera must show, as a function of
 * the sim and the party's clock, and the ice cream van's drive that the camera follows.
 */

import { clamp, clamp01, lerp } from '../game/math'
import { BUILD_HALF, BUILDS, PARTY_AREAS } from '../game/map'
import type { ChapterId, Sim } from '../game/model'
import { FIREWORK_REACH } from './Effects'
import { around, type Pt } from './frame'

export const VAN_Z = 29.4
export const VAN_FROM = -44
export const VAN_STOP = -2
export const VAN_TO = 48
/** The van arrives by 4.2 s, stands while the cones fly, and drives off from 10.5 s. */
export const ARRIVE = 4.2
export const LEAVE = 10.5
export const LEAVE_FOR = 3.2

export const easeOut = (u: number) => 1 - (1 - u) * (1 - u) * (1 - u)
const easeIn = (u: number) => u * u * u

/** Where the van is along the road at a party time. */
export const vanX = (t: number) => (t < ARRIVE ? lerp(VAN_FROM, VAN_STOP, easeOut(clamp01(t / ARRIVE))) : t < LEAVE ? VAN_STOP : lerp(VAN_STOP, VAN_TO, easeIn(clamp01((t - LEAVE) / LEAVE_FOR))))

/** How far from the stopped van the camera follows it, up the road and down. */
const VAN_FOLLOW = 6

/** The camera's tilt below the horizon at a chapter's party. The road, house, bridge and playground parties are steeper than easy mode's 50 degrees, so the ground the screen shows, which the sim keeps clear of machines, is not stretched far up the screen. The clock's is 45, shallower than easy mode's, to raise the hall's tower and the fireworks over it in the picture; the picture's top still looks down at the ground, with no sky or horizon in it. */
export const PARTY_TILT: Record<ChapterId, number> = {
  road: (60 * Math.PI) / 180,
  house: (60 * Math.PI) / 180,
  bridge: (60 * Math.PI) / 180,
  play: (60 * Math.PI) / 180,
  clock: (45 * Math.PI) / 180,
}

/** Bunny's chest above her feet, and how far down the road from her door the house party's camera looks for her: she is framed from where she starts, and the camera closes in as she comes. */
export const BUNNY_CHEST = 1
export const BUNNY_AHEAD = 30
/** From this far down the road from the door the storeys over it leave the frame, and from this near they are all in. */
const BUNNY_FAR = 24
const BUNNY_NEAR = 8

/** The fireworks' middle over the hall, how far out to each side and in depth their bursts go, and how high: all inside the sky the camera shows. */
export const FIRE = { x: BUILDS[3].x, z: BUILDS[3].z, spreadX: 5.5, spreadZ: 3, low: 9, high: 13 } as const

/** Seconds a rocket climbs, and the pauses after a `fireworks` event before each of its three rockets goes: a burst every half second, as the sim's events come every 1.5 s. */
export const RISE_FOR = 0.4
export const LAUNCH_AFTER = [0, 0.5, 1] as const

/** The colours the rockets burst in, taken in turn. */
export const FIRE_COLOURS = ['#ff5e5e', '#ffd23f', '#5ec8ff', '#7fe07a', '#ff6fa8', '#c9a0ff'] as const

/** Where the n-th rocket bursts and in what colour: the sides in turn, over the hall, with `rnd` (0 to 1) for the spread. */
export function rocket(n: number, rnd: () => number): { x: number; y: number; z: number; colour: string } {
  const side = n % 2 === 0 ? -1 : 1
  return {
    x: FIRE.x + side * FIRE.spreadX * (0.3 + 0.7 * rnd()),
    y: FIRE.low + (FIRE.high - FIRE.low) * rnd(),
    z: FIRE.z + FIRE.spreadZ * (rnd() - 0.5),
    colour: FIRE_COLOURS[n % FIRE_COLOURS.length],
  }
}

/** How high over the clock chapter's hall, and how far out to each side, the camera shows sky: the bursts' middles and the sparks' reach to the sides. */
const SKY = FIRE.high + 1
const SKY_HALF = FIRE.spreadX + FIREWORK_REACH

/** How far the playground party's frame reaches past the outer playthings to each side, in front of them (toward the camera) and behind them, and how high it goes, in metres. */
const PLAY_SIDE = 1.1
const PLAY_FRONT = 2.5
const PLAY_BEHIND = 1.5
const PLAY_HIGH = 3.5

/** How far outside a show's area an animal still counts as at the show, in metres. */
const CROWD_MARGIN = 4

/** The animals at a party's show, a point on each: what the party's landmarks must not be hidden from. */
export function partyAnimals(pts: Pt[], sim: Sim): void {
  const party = sim.party
  if (party === null) throw new Error('partyAnimals: no party is running')
  for (const a of sim.animals) {
    if (PARTY_AREAS[party.chapter].some((r) => a.x > r.x0 - CROWD_MARGIN && a.x < r.x1 + CROWD_MARGIN && a.z > r.z0 - CROWD_MARGIN && a.z < r.z1 + CROWD_MARGIN)) pts.push([a.x, a.y + 0.4, a.z])
  }
}

/** The points a party needs in view, put into `pts` after clearing it. */
export function partyPoints(pts: Pt[], sim: Sim): void {
  pts.length = 0
  const party = sim.party
  if (party === null) throw new Error('partyPoints: no party is running')
  switch (party.chapter) {
    case 'road': {
      // The van in sight as it comes in, the animals it serves and the road they stand by.
      const x = vanX(party.t)
      around(pts, clamp(x, VAN_STOP - VAN_FOLLOW, VAN_STOP + VAN_FOLLOW), 0, VAN_Z, 3, 2.5, 3.5)
      around(pts, party.x, 0, party.z, 7, 4, 2)
      break
    }
    case 'house': {
      // The door and the storeys over it, and Bunny on her way to it with her suitcase, from the road's far end to the door. While she is far the storeys are not needed, so the camera can come nearer to her.
      const b = BUILDS[0]
      const door = b.z + BUILD_HALF.house[1] + 1.2
      const bunny = sim.animals.find((a) => a.species === 'bunny' && a.home === 0)
      const far = bunny === undefined ? 0 : clamp01((bunny.z - door - BUNNY_NEAR) / (BUNNY_FAR - BUNNY_NEAR))
      around(pts, b.x, 0, door - 1.5, 5.5, 3, lerp(6.5, 1.5, far))
      if (bunny !== undefined) pts.push([clamp(bunny.x, b.x - 8, b.x + 8), bunny.y + BUNNY_CHEST, clamp(bunny.z, door - 3, door + BUNNY_AHEAD)])
      break
    }
    case 'bridge':
      // The cows and sheep gathering at the deck's near end, close enough to read, with the deck they come over above them.
      around(pts, party.x, 0, party.z - 1, 5.5, 6.5, 2)
      break
    case 'play': {
      // The slide, the swing and the climber with the animals on them, and the gathering in front: a box as wide as the three need and no wider.
      const spots = BUILDS[2].spots
      const xs = spots.map((s) => s.x)
      const zs = spots.map((s) => s.z)
      const x0 = Math.min(...xs) - PLAY_SIDE
      const x1 = Math.max(...xs) + PLAY_SIDE
      const z0 = Math.min(...zs) - PLAY_FRONT
      const z1 = Math.max(...zs) + PLAY_BEHIND
      around(pts, (x0 + x1) / 2, 0, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, PLAY_HIGH)
      break
    }
    case 'clock': {
      // The hall with its clock tower large, and a band of the sky over it where the fireworks go off: the bursts may climb out of the top.
      const hall = BUILDS[3]
      around(pts, hall.x, 0, hall.z + 1, 5.5, 4, 9)
      pts.push([FIRE.x - SKY_HALF, SKY, FIRE.z], [FIRE.x + SKY_HALF, SKY, FIRE.z])
      break
    }
  }
}

