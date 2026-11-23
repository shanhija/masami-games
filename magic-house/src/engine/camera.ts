/**
 * Magic House: the camera's frame. Every room has one size since step 7a (engine/api.ts ROOM), so the
 * camera shows the whole room all the time and never moves, and its frame is a constant: from the
 * side SIDE_FRAME, the inside with the walls' cut edges, the floor's lip and the ceiling's beam round
 * it; from high up HIGH_FRAME, the floor with the walls and the front lip round it, the room's whole
 * height (the box from its floor to the top players are held under) over it. The sim sets
 * World.camera and World.floorFrame from them once (engine/sim.ts createSim), so the bots and the
 * children meet the same room; only w.shake moves the view, in the scene. The frame holds nobody
 * in: it is wider than the room's box, which the player's controller and the house's own solids hold
 * them inside (engine/player.ts, engine/floorPlayer.ts).
 */

import { ROOM } from './api'
import type { Camera, FloorFrame, World } from './world'

/** From the side: x ±8.3 and y -0.4 to 8.4, the 16 by 8 m inside with the house's walls, floor and beam round it. */
export const SIDE_FRAME: Readonly<Camera> = {
  x: 0,
  y: (ROOM.side.height + ROOM.beam - ROOM.lip) / 2,
  width: ROOM.side.width + 2 * ROOM.wall,
  height: ROOM.side.height + ROOM.beam + ROOM.lip,
}

/**
 * The side camera's lens (scene/sideCamera.ts sideView), here so the look's placement (engine/lookBuilder.ts
 * SIDE_EYE) reads the same eye the scene draws from. back: how far the eye stands from the plane
 * z = 0, in frame widths (3 is a long lens, about 19 degrees across). eyeUp: how high the eye is above
 * the frame's middle, in frame heights: a little over the top edge, so every floor in the frame shows
 * its top, those low down the most. before and behind: what is drawn, in metres in front of and
 * behind the plane.
 */
export const SIDE_LENS = { back: 3, eyeUp: 0.6, before: 30, behind: 120 } as const

/** From high up: x ±7.3 and z ±4.3 of the floor, the 14 by 8 m inside with the walls at the back and sides and the lip at the open front. */
export const HIGH_FRAME: Readonly<FloorFrame> = {
  x: 0,
  z: 0,
  width: ROOM.high.width + 2 * ROOM.wall,
  depth: ROOM.high.depth + 2 * ROOM.wall,
}

/** From high up, the camera as the side's rectangle reads it (World.camera): the floor frame's x and width, and the room's box from its bottom to its top. */
export function frontOfFloor(bounds: World['bounds'], floor: FloorFrame, out: Camera): Camera {
  out.x = floor.x
  out.width = floor.width
  out.y = (bounds.min[1] + bounds.max[1]) / 2
  out.height = bounds.max[1] - bounds.min[1]
  return out
}
