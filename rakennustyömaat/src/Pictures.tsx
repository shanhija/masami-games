import { HOUSE_GRID, SHAPE_SIZE } from './game/catalog'
import { ITEMS, themeItems, type ItemId } from './game/items'
import { CELL, DEPTH, FLOOR_BAND, FLOOR_LIFT, interiorRect, POST, ROOF_H, SLOT_BOX, TOP, rect, type Rect } from './game/layout'
import type { Good, HouseKind, Look, MachineId, Material, Part, RoadKind, RoofStyle, Shape, Theme, Tool, Unlock } from './game/model'
import type { Stop } from './game/hud'
import { drawBuilder, drawToolIcon, PART_BOX, TOOL_ICON_BOX } from './draw/builder'
import { drawGood } from './draw/goods'
import { drawDoors, drawLift, drawRoof, drawRoomFrame } from './draw/house'
import { drawBoulder, drawCrosser, drawHomeSign, drawPresent, drawRoadCard, drawSurprise } from './draw/land'
import { box, MATERIAL_LOOK } from './draw/look'
import { drawMachine } from './draw/machines'
import { drawInside, itemArt, THEME_ART } from './draw/rooms/art'
import { drawTruck } from './draw/truck'
import { Portrait } from './Portrait'

/**
 * The HUD's pictures, every one drawn by the game's own draw functions in a Portrait, so a
 * button shows the very thing it makes: a good, the builder wearing an option, a theme's
 * room, a shape in its material, a house, a road, a machine, a room item, a stop on the
 * road. Each is still unless it says so; its id names it, so the same picture never redraws.
 */

/** A still picture is drawn at this sim time: eyes open, nothing mid-blink. */
const STILL = 0.6
/** The builder's head with the hat and its ears: the back button on the street. */
const HEAD_BOX = rect(-0.38, -1.3, 0.76, 0.76)

/** The builder in `look`, standing, cropped to `box` (a wardrobe part's PART_BOX, or the head). */
function BuilderPic({ look, box: crop, className }: { look: Look; box: Rect; className: string }) {
  return <Portrait id={`builder:${JSON.stringify(look)}`} box={crop} animate={false} className={className} draw={(ctx) => drawBuilder(ctx, look, 'stand', STILL)} />
}
export const FacePic = ({ look }: { look: Look }) => <BuilderPic look={look} box={HEAD_BOX} className="pic" />

/** The builder's tool alone, pointing up and right, in the icon's own box (its twinkle included); with `animate` its head shines (the road's tool button). */
export function ToolPic({ tool, animate, className }: { tool: Tool; animate: boolean; className: string }) {
  return <Portrait id={`tool:${tool}`} box={TOOL_ICON_BOX} animate={animate} className={className} draw={(ctx, t) => drawToolIcon(ctx, tool, t)} />
}

/**
 * What a part's picture leaves off, so the part reads alone next to its neighbours: the hair
 * bare-headed (the hat tab shows the hat; a hat-less builder holds no tool) and with no bag
 * over its back, the skin with no glasses (the glasses tab shows them), the shirt with no bag
 * (the bag tab shows it).
 */
const FOCUS: Partial<Record<Part, Partial<Look>>> = { hair: { hat: 'none', bag: 'none' }, skin: { glasses: 'none' }, shirt: { bag: 'none' } }
export const partLook = (look: Look, part: Part): Look => ({ ...look, ...FOCUS[part] })

/** One wardrobe part as the builder in `look` shows it (partLook), cropped to its PART_BOX; the tool by itself. */
export function PartPic({ look, part, className }: { look: Look; part: Part; className: string }) {
  if (part === 'tool') return <ToolPic tool={look.tool} animate={false} className={className} />
  return <BuilderPic look={partLook(look, part)} box={PART_BOX[part]} className={className} />
}

/** One good, or with `stack` a little pile of three: two on the ground and one on top. */
export function GoodPic({ good, stack, className }: { good: Good; stack: boolean; className: string }) {
  const draw = (ctx: CanvasRenderingContext2D, t: number) => {
    const at = stack
      ? [
          [-0.27, 0],
          [0.27, 0],
          [0, -0.5],
        ]
      : [[0, 0]]
    for (const [x, y] of at) {
      ctx.save()
      ctx.translate(x!, y!)
      drawGood(ctx, good, t)
      ctx.restore()
    }
  }
  return <Portrait id={`good:${good}:${stack}`} box={stack ? rect(-0.62, -1.12, 1.32, 1.18) : rect(-0.36, -0.62, 0.76, 0.68)} animate={false} className={className} draw={draw} />
}

/** A small room's inside (interior-local metres): the theme cards' and the house cards' rooms. */
const SMALL_INSIDE = interiorRect(0, { shape: 'small', col: 0, row: 0 })

/** A small room of `theme`: its wallpaper and floor in colouring `variant`, and its hero floor item in the middle (the theme cards and the theme strip). */
export function ThemePic({ theme, variant, className }: { theme: Theme; variant: 0 | 1 | 2 | 3; className: string }) {
  const draw = (ctx: CanvasRenderingContext2D, t: number) => {
    drawInside(ctx, theme, SMALL_INSIDE.w, SMALL_INSIDE.h, t, variant, variant)
    ctx.save()
    ctx.translate(SMALL_INSIDE.w / 2, SMALL_INSIDE.h - FLOOR_LIFT)
    itemArt(themeItems(theme)[2]!)(ctx, t, -1)
    ctx.restore()
  }
  return <Portrait id={`theme:${theme}:${variant}`} box={rect(0.28, 0.5, 1.6, 1.6)} animate={false} className={className} draw={draw} />
}

/** A room item alone in its slot's box, as the room tray shows it. */
export function ItemPic({ item, className }: { item: ItemId; className: string }) {
  const b = SLOT_BOX[ITEMS[item].slot]
  return <Portrait id={`item:${item}`} box={rect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0)} animate={false} className={className} draw={(ctx, t) => itemArt(item)(ctx, t, -1)} />
}

/** A wide strip of a theme's floor in colouring `variant`: the floor paint pot's paint. */
export function FloorPic({ theme, variant, className }: { theme: Theme; variant: 0 | 1 | 2 | 3; className: string }) {
  return <Portrait id={`floor:${theme}:${variant}`} box={rect(0, 0, 0.9, FLOOR_BAND)} animate={false} className={className} draw={(ctx, t) => THEME_ART[theme].floor(ctx, 0.9, t, variant)} />
}

/**
 * A shape card: the shape's cells as one box in the material's light tint, and in every
 * cell two little blocks of the material, the two blocks it costs. Every card shares one
 * box, so a small room looks a quarter of a big one.
 */
export function ShapePic({ shape, material, className }: { shape: Shape; material: Material; className: string }) {
  const draw = (ctx: CanvasRenderingContext2D) => {
    const m = MATERIAL_LOOK[material]
    const { w, h } = SHAPE_SIZE[shape]
    box(ctx, 0, -h, w, h, { face: m.top, top: m.top, side: m.side }, 0.14, true, true, 'line')
    ctx.beginPath()
    for (let c = 1; c < w; c++) {
      ctx.moveTo(c, -h)
      ctx.lineTo(c, 0)
    }
    for (let r = 1; r < h; r++) {
      ctx.moveTo(0, -r)
      ctx.lineTo(w, -r)
    }
    ctx.lineWidth = 0.03
    ctx.strokeStyle = m.side
    ctx.stroke()
    for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) for (const dx of [0.17, 0.53]) box(ctx, c + dx, -r - 0.42, 0.3, 0.3, m, 0.08, true, true, 'detail')
  }
  return <Portrait id={`shape:${shape}:${material}`} box={rect(-0.12, -2.28, 2.42, 2.42)} animate={false} className={className} draw={draw} />
}

/** A whole house of `kind`, every room built and furnished with the wallpapers of a few themes, its roofs, doors and (tall) lift: the "Which house?" cards. */
export function HousePic({ kind, className }: { kind: HouseKind; className: string }) {
  const { cols, rows } = HOUSE_GRID[kind]
  const material: Material = kind === 'tall' ? 'bricks' : 'planks'
  const themes: Theme[] = ['play', 'disco', 'sleep', 'ballpit', 'music', 'cat', 'birthday', 'gym', 'crafts', 'slide']
  const draw = (ctx: CanvasRenderingContext2D, t: number) => {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.save()
        ctx.translate(c * CELL, -(r + 1) * CELL)
        ctx.save()
        ctx.translate(POST, TOP)
        drawInside(ctx, themes[(r * cols + c) % themes.length]!, SMALL_INSIDE.w, SMALL_INSIDE.h, t, 0, 0)
        ctx.restore()
        drawRoomFrame(ctx, 'small', material, r === rows - 1, c === cols - 1, t)
        ctx.restore()
      }
    }
    for (let c = 0; c < cols; c++) {
      ctx.save()
      ctx.translate(c * CELL, -rows * CELL)
      drawRoof(ctx, kind === 'tall' ? 'pointed' : 'round', material, CELL, true, true, Infinity, t)
      ctx.restore()
    }
    drawDoors(ctx, kind, t)
    if (kind === 'tall') {
      ctx.save()
      ctx.translate(cols * CELL, 0)
      drawLift(ctx, rows * CELL, t)
      ctx.restore()
    }
  }
  const w = cols * CELL + (kind === 'tall' ? 1.2 : 0)
  const h = rows * CELL + 1.4
  return <Portrait id={`house:${kind}`} box={rect(-0.4, -h - 0.3, w + 0.8, h + 0.5)} animate={false} className={className} draw={draw} />
}

/** One column's roof of `style` in `material`, settled: the build tray's roof button shows the next one. */
export function RoofPic({ style, material, className }: { style: RoofStyle; material: Material; className: string }) {
  return <Portrait id={`roof:${style}:${material}`} box={rect(-0.3, -ROOF_H - 0.7, CELL + DEPTH + 0.6, ROOF_H + 0.9)} animate={false} className={className} draw={(ctx, t) => drawRoof(ctx, style, material, CELL, true, true, Infinity, t)} />
}

export function RoadPic({ kind, className }: { kind: RoadKind; className: string }) {
  return <Portrait id={`road:${kind}`} box={rect(-1.5, -1, 3, 2)} animate className={className} draw={(ctx, t) => drawRoadCard(ctx, kind, t)} />
}

/** The machine `m`, built and resting: the bubble over a material the child is out of. */
export function MachinePic({ m, className }: { m: MachineId; className: string }) {
  const pic = { stage: 'built', on: false, batchAge: Infinity, batchFor: 0, pushAge: Infinity, coughAge: Infinity, hits: 0, hitAge: Infinity, builtAge: Infinity, ready: false } as const
  return <Portrait id={`machine:${m}`} box={rect(-1.4, -2.8, 2.8, 2.9)} animate={false} className={className} draw={(ctx, t) => drawMachine(ctx, m, pic, t)} />
}

/** A stop on the trip strip: a boulder (its gem kept secret), a crossing family, a surprise or the present. */
export function StopPic({ stop, tool, className }: { stop: Stop; tool: Tool; className: string }) {
  const th = stop.thing
  const [crop, draw]: [Rect, (ctx: CanvasRenderingContext2D, t: number) => void] =
    th.kind === 'boulder'
      ? [rect(-1, -1.9, 2, 2), (ctx, t) => drawBoulder(ctx, th.size, false, 0, Infinity, tool, t)]
      : th.kind === 'crosser'
        ? [rect(-1.3, -1.1, 2.6, 1.2), (ctx, t) => drawCrosser(ctx, th.who, 0, Infinity, t)]
        : th.kind === 'surprise'
          ? [rect(-2.1, -3.1, 4.2, 3.2), (ctx, t) => drawSurprise(ctx, th.what, 0.5, t)]
          : [rect(-0.5, -0.9, 1, 1), (ctx, t) => drawPresent(ctx, t, -1)]
  return <Portrait id={`stop:${stop.i}:${JSON.stringify(th)}`} box={crop} animate={false} className={className} draw={draw} />
}

/** The truck with the builder at the wheel, empty and still: the trip strip's runner. */
export function TruckPic({ look, trips, className }: { look: Look; trips: number; className: string }) {
  const draw = (ctx: CanvasRenderingContext2D, t: number) => drawTruck(ctx, { look, bed: [], tip: 0, roll: 0, speed: 0, honk: Infinity, flick: Infinity, stickers: trips, driver: true, t })
  return <Portrait id={`truck:${JSON.stringify(look)}:${trips}`} box={rect(-2.4, -2.5, 4.8, 2.6)} animate={false} className={className} draw={draw} />
}

export function HomeSignPic({ className }: { className: string }) {
  return <Portrait id="home" box={rect(-0.7, -2.5, 1.4, 2.6)} animate={false} className={className} draw={(ctx, t) => drawHomeSign(ctx, t)} />
}

/** What a present held: a theme's room, the builder wearing the new thing, or three gems. */
export function UnlockPic({ got, look, className }: { got: Unlock | 'gems'; look: Look; className: string }) {
  if (got === 'gems') {
    const draw = (ctx: CanvasRenderingContext2D, t: number) => {
      for (const x of [-0.42, 0, 0.42]) {
        ctx.save()
        ctx.translate(x, x === 0 ? -0.12 : 0)
        drawGood(ctx, 'gem', t)
        ctx.restore()
      }
    }
    return <Portrait id="gems" box={rect(-0.8, -0.8, 1.6, 0.9)} animate className={className} draw={draw} />
  }
  const [kind, value] = got.split(':') as [string, string]
  if (kind === 'theme') return <ThemePic theme={value as Theme} variant={0} className={className} />
  const part = kind as 'bag' | 'tool' | 'shoes' | 'glasses'
  return <PartPic look={{ ...look, [part]: value }} part={part} className={className} />
}
