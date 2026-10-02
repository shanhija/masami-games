import type { Room } from '../game/model'

/**
 * One cell of the sprite sheet (?sheet=hero or ?sheet=world): a box `w` by `h` tiles. The
 * origin is on the dashed feet line, half a tile above the middle of the box's bottom edge,
 * so shadows and anything below the feet still show. `draw` draws whatever the label says
 * there, in world units, at sim time t (seconds), in the room's colours.
 */
export interface SheetCell {
  label: string
  w: number
  h: number
  draw: (ctx: CanvasRenderingContext2D, room: Room, t: number) => void
}
