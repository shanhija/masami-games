import { DEFAULT_LOOK } from '../game/catalog'
import { CELL, interiorRect, rect, roomRect, slotsOf } from '../game/layout'
import { GOODS, type Good, type Pose } from '../game/model'
import { drawCat } from './animals'
import { POSE_LENGTH, drawBuilder } from './builder'
import { drawGood } from './goods'
import { drawRoomFrame } from './house'
import { at, loop, type SheetEntry } from './look'
import { drawMachine, machinePic } from './machines'
import { drawInside, itemArt } from './rooms/art'
import { drawTruck } from './truck'

/**
 * The style keys sheet (?sheet=keys, at the default px=120): one of each kind of picture side
 * by side, so every group's art can be held up against them. The builder at street, cab and
 * mirror size and walking, hitting and driving; a brick room themed Play with its block
 * tower, put together as the renderer puts a room together; the sawmill idle and running;
 * the goods; the cat sitting and walking; the loaded truck. The rules they all follow are
 * look.ts's.
 */

/**
 * A 1x1 brick room themed Play, origin at the room's top-left, put together as the renderer
 * puts a room together: its inside (`drawInside`), the block tower at the first floor slot's
 * anchor, then the frame over all.
 */
function drawPlayRoom(ctx: CanvasRenderingContext2D, t: number, play: number) {
  const placed = { shape: 'small', col: 0, row: 0 } as const
  const r = roomRect(0, placed)
  const inner = interiorRect(0, placed)
  ctx.save()
  ctx.translate(inner.x - r.x, inner.y - r.y)
  drawInside(ctx, 'play', inner.w, inner.h, t, 0, 0)
  ctx.restore()
  const slot = slotsOf('small').find((s) => s.kind === 'floor')!
  ctx.save()
  ctx.translate(slot.x, slot.y)
  itemArt('blockTower')(ctx, t, play)
  ctx.restore()
  drawRoomFrame(ctx, 'small', 'bricks', true, true, t)
}

const standing = rect(-0.45, -1.3, 0.9, 1.36)
const builder = (pose: Pose) => (ctx: CanvasRenderingContext2D, t: number) => drawBuilder(ctx, DEFAULT_LOOK, pose, pose === 'hit' ? t % (POSE_LENGTH.hit + 0.9) : t)
const LOAD: readonly Good[] = ['log', 'rock', 'log', 'clay', 'sand', 'gem', 'log', 'rock', 'sand', 'log', 'clay']
const machineBox = rect(-1.25, -2.65, 2.55, 2.7)
const catBox = rect(-0.42, -0.52, 0.8, 0.56)

export const KEYS_SHEET: SheetEntry[] = [
  at(48, standing, 'builder on the street, 48 px/m', builder('stand')),
  at(80, standing, 'builder at cab size, 80 px/m', builder('stand')),
  at(400, standing, 'builder in the mirror, 400 px/m', builder('stand')),
  at(160, rect(-0.5, -1.3, 1.0, 1.36), 'walk', builder('walk')),
  at(160, rect(-0.55, -1.3, 1.25, 1.36), 'hit (replays)', builder('hit')),
  at(160, rect(-0.45, -1.2, 1.0, 1.26), 'drive', builder('drive')),
  { label: 'brick room, Play, block tower (tapped every 4 s)', box: rect(-0.1, -0.35, CELL + 0.45, CELL + 0.45), draw: (ctx, t) => drawPlayRoom(ctx, t, (t % 4) - 1.5) },
  { label: 'sawmill idle', box: machineBox, draw: (ctx, t) => drawMachine(ctx, 'sawmill', machinePic('built', false, t), t) },
  { label: 'sawmill running', box: machineBox, draw: (ctx, t) => drawMachine(ctx, 'sawmill', machinePic('built', true, t), t) },
  {
    label: 'a log beside a plank',
    box: rect(-0.7, -0.6, 1.4, 0.65),
    draw: (ctx, t) => {
      for (const [good, x] of [
        ['log', -0.34],
        ['planks', 0.34],
      ] as const) {
        ctx.save()
        ctx.translate(x, 0)
        drawGood(ctx, good, t)
        ctx.restore()
      }
    },
  },
  {
    label: 'all ten goods',
    box: rect(-0.35, -0.62, GOODS.length * 0.66, 0.67),
    draw: (ctx, t) => {
      GOODS.forEach((good, i) => {
        ctx.save()
        ctx.translate(i * 0.66, 0)
        drawGood(ctx, good, t)
        ctx.restore()
      })
    },
  },
  ...(['sit', 'walk'] as const).map(
    (pose): SheetEntry => at(240, catBox, `the cat ${pose === 'sit' ? 'sitting' : 'walking'} (animals.ts)`, (ctx, t) => drawCat(ctx, { coat: 'ginger', pose, eyes: 'open', meow: false, tail: 0, lift: 0, tilt: 0, step: loop(t, 0.8, 0), wave: 0, kitten: false }, 'L')),
  ),
  {
    label: 'truck with a load',
    box: rect(-2.4, -2.75, 4.95, 2.95),
    draw: (ctx, t) => drawTruck(ctx, { look: DEFAULT_LOOK, bed: LOAD, tip: 0, roll: t * 2.5, speed: 2.5, honk: Infinity, flick: t % 3, stickers: 5, driver: true, t }),
  },
]
