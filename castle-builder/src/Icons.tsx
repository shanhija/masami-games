import { Children, cloneElement, type ReactElement, type ReactNode, type SVGProps } from 'react'

import type { BarKind, Good } from './game/sim'
import { dyeHex, palette } from './scene/look'

/**
 * The pictures in the HUD: one small flat drawing per good and per piece, in the same
 * shapes and colours as the 3D things, so the child recognises the log on the button
 * as the log on the meadow. Every icon wears a dark line around it, so it reads over
 * grass, sky and cream stone alike.
 */
const INK = '#2b2b30'
const LINE = 0.08

/** A detail drawn on top of a solid: a window, a door, an edge. */
const ink = { stroke: INK, strokeWidth: LINE, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

type Shape = ReactElement<SVGProps<SVGElement>>

/**
 * Shapes drawn twice: first fat and inky, then in their own colours on top, so the
 * group shares one outline the way a flat-shaded solid does, with no seams inside.
 * Two Solids on top of each other keep the line between them.
 */
function Solid({ children }: { children: ReactNode }) {
  const shapes = Children.toArray(children) as Shape[]
  return (
    <>
      {shapes.map((s, i) => cloneElement(s, { key: `ink${i}`, fill: INK, stroke: INK, strokeWidth: LINE * 2, strokeLinejoin: 'round', strokeLinecap: 'round' }))}
      {shapes.map((s, i) => cloneElement(s, { key: `fill${i}`, stroke: 'none' }))}
    </>
  )
}

/** The square every icon is drawn in: two units across with a little room for the line. */
function Icon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="-1.08 -1.08 2.16 2.16" aria-hidden>
      {children}
    </svg>
  )
}

/** A rough lump, for stone and ore: one shaded facet on its sunny-side-away half. */
function Lump({ fill, shade }: { fill: string; shade: string }) {
  return (
    <>
      <Solid>
        <polygon points="-0.85,0.2 -0.6,-0.5 0.1,-0.75 0.7,-0.4 0.88,0.25 0.45,0.78 -0.45,0.78" fill={fill} />
      </Solid>
      <polygon points="0.1,-0.75 0.7,-0.4 0.88,0.25 0.45,0.78 0.05,0.1" fill={shade} />
    </>
  )
}

/** A cube seen from above and the side, like the blocks in the yard: `s` is half its width, `y` the front top corner. */
function Cube({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  const h = s * 0.55
  return (
    <>
      <Solid>
        <polygon points={`${x - s},${y - h / 2} ${x},${y - h} ${x + s},${y - h / 2} ${x},${y}`} fill={palette.stone} />
        <polygon points={`${x - s},${y - h / 2} ${x},${y} ${x},${y + s} ${x - s},${y + s - h / 2}`} fill={fill} />
        <polygon points={`${x},${y} ${x + s},${y - h / 2} ${x + s},${y + s - h / 2} ${x},${y + s}`} fill={palette.stoneBase} />
      </Solid>
      <path d={`M ${x - s},${y - h / 2} L ${x},${y} L ${x + s},${y - h / 2} M ${x},${y} L ${x},${y + s}`} fill="none" {...ink} />
    </>
  )
}

/** A folded square of cloth: two layers, the top one a little smaller. */
function Folded({ fill }: { fill: string }) {
  return (
    <>
      <Solid>
        <rect x={-0.8} y={-0.05} width={1.6} height={0.75} rx={0.1} fill={fill} />
      </Solid>
      <Solid>
        <rect x={-0.7} y={-0.6} width={1.4} height={0.7} rx={0.1} fill={fill} />
      </Solid>
    </>
  )
}

/** A flower head on a stem, the head at (x, y) and the stem down to `to`. */
function Flower({ x, y, to, r, fill }: { x: number; y: number; to: number; r: number; fill: string }) {
  return (
    <>
      <Solid>
        <rect x={x - 0.06} y={y} width={0.12} height={to - y} fill={palette.stem} />
      </Solid>
      <Solid>
        <circle cx={x} cy={y} r={r} fill={fill} />
      </Solid>
      <circle cx={x} cy={y} r={r * 0.33} fill={palette.gold} />
    </>
  )
}

const WOOL_BUMPS = Array.from({ length: 7 }, (_, i) => (i * Math.PI * 2) / 7)
const FLOWER_HEADS: [number, number][] = [
  [-0.5, -0.25],
  [0, -0.5],
  [0.5, -0.25],
]

function goodShapes(good: Good, colour: number) {
  switch (good) {
    case 'wood':
      return (
        <>
          <Solid>
            <rect x={-0.9} y={-0.36} width={1.5} height={0.72} rx={0.1} fill={palette.trunk} />
            <ellipse cx={0.6} cy={0} rx={0.26} ry={0.38} fill={palette.stump} />
          </Solid>
          <ellipse cx={0.6} cy={0} rx={0.26} ry={0.38} fill="none" {...ink} />
          <circle cx={0.6} cy={0} r={0.12} fill={palette.trunk} />
          <path d="M -0.65,-0.12 H -0.2 M -0.5,0.14 H 0.05" fill="none" stroke={palette.woodDark} strokeWidth={0.07} strokeLinecap="round" />
        </>
      )
    case 'planks':
      return (
        <>
          {[-0.62, -0.17, 0.28].map((y, i) => (
            <Solid key={y}>
              <rect x={-0.85} y={y} width={1.7} height={0.34} rx={0.05} fill={palette.plank} transform={`rotate(${(i - 1) * 4} 0 ${y + 0.17})`} />
            </Solid>
          ))}
        </>
      )
    case 'stone':
      return <Lump fill={palette.rock} shade={palette.rockDark} />
    case 'blocks':
      return <Cube x={0} y={-0.15} s={0.75} fill={palette.stoneShade} />
    case 'ore':
      return (
        <>
          <Lump fill={palette.oreRock} shade={palette.iron} />
          {([
            [-0.3, -0.15],
            [0.3, -0.3],
            [0.1, 0.35],
          ] as [number, number][]).map(([x, y]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={0.15} fill={palette.oreGold} {...ink} />
          ))}
        </>
      )
    case 'iron':
      return (
        <>
          <Solid>
            <rect x={-0.85} y={-0.3} width={1.7} height={0.6} rx={0.08} fill={palette.iron} />
          </Solid>
          <rect x={-0.72} y={-0.2} width={1.44} height={0.14} rx={0.07} fill={palette.ironLight} />
        </>
      )
    case 'wool':
      return (
        <Solid>
          <circle r={0.55} fill={palette.woolWhite} />
          {WOOL_BUMPS.map((a) => (
            <circle key={a} cx={Math.cos(a) * 0.5} cy={Math.sin(a) * 0.5} r={0.32} fill={palette.woolWhite} />
          ))}
        </Solid>
      )
    case 'cloth':
      return <Folded fill={palette.woolWhite} />
    case 'colourcloth':
      return <Folded fill={dyeHex(colour)} />
    case 'flowers':
      return (
        <>
          {FLOWER_HEADS.map(([x, y], i) => (
            <Flower key={x} x={x} y={y} to={0.9} r={0.3} fill={dyeHex(i)} />
          ))}
        </>
      )
  }
}

/** The one picture a good has in the HUD. `colour` is the dye index colour cloth is shown in. */
export function GoodIcon({ good, size, colour }: { good: Good; size: number; colour: number }) {
  return <Icon size={size}>{goodShapes(good, colour)}</Icon>
}

/** The workshop hut every maker shares: warm wood walls, a darker roof, a door on the left. The tool in front says which maker it is. */
function Hut({ children }: { children: ReactNode }) {
  return (
    <>
      <Solid>
        <rect x={-0.7} y={-0.1} width={1.4} height={0.95} fill={palette.wood} />
      </Solid>
      <Solid>
        <polygon points="-0.9,-0.05 0,-0.8 0.9,-0.05" fill={palette.woodDark} />
      </Solid>
      <rect x={-0.55} y={0.3} width={0.32} height={0.55} rx={0.12} fill={palette.door} {...ink} />
      {children}
    </>
  )
}

/** An arched window, lit. */
function Window({ x, y, w, h }: { x: number; y: number; w: number; h: number }) {
  return <rect x={x} y={y} width={w} height={h} rx={w / 2} fill={palette.window} {...ink} />
}

/** The blue cone on a tower, with its gold finial. */
function Cone({ y, half, tip }: { y: number; half: number; tip: number }) {
  return (
    <>
      <Solid>
        <polygon points={`${-half},${y} 0,${tip} ${half},${y}`} fill={palette.castleRoof} />
      </Solid>
      <Solid>
        <circle cx={0} cy={tip} r={0.1} fill={palette.gold} />
      </Solid>
    </>
  )
}

function pieceShapes(kind: BarKind, colour: number) {
  switch (kind) {
    case 'wall':
      return (
        <>
          <Solid>
            <rect x={-0.9} y={-0.25} width={1.8} height={1.1} fill={palette.stone} />
            {[-0.9, -0.25, 0.4].map((x) => (
              <rect key={x} x={x} y={-0.65} width={0.5} height={0.5} fill={palette.stone} />
            ))}
          </Solid>
          <path d="M -0.9,0.15 H 0.9 M -0.9,0.5 H 0.9 M -0.3,0.15 V 0.5 M 0.35,0.15 V 0.5 M 0,0.5 V 0.85 M -0.55,-0.25 V 0.15 M 0.5,-0.25 V 0.15" fill="none" stroke={palette.stoneBase} strokeWidth={0.05} />
        </>
      )
    case 'tower':
      return (
        <>
          <Solid>
            <rect x={-0.45} y={-0.25} width={0.9} height={1.1} fill={palette.stone} />
            <rect x={-0.58} y={-0.4} width={1.16} height={0.2} fill={palette.stoneShade} />
          </Solid>
          <Cone y={-0.35} half={0.65} tip={-0.95} />
          <Window x={-0.12} y={0.1} w={0.24} h={0.34} />
        </>
      )
    case 'gate':
      return (
        <>
          <Solid>
            <rect x={-0.95} y={-0.75} width={0.5} height={1.6} fill={palette.stone} />
            <rect x={0.45} y={-0.75} width={0.5} height={1.6} fill={palette.stone} />
            <rect x={-0.5} y={-0.45} width={1} height={1.3} fill={palette.stone} />
            {[-0.95, -0.63, 0.45, 0.77].map((x) => (
              <rect key={x} x={x} y={-0.95} width={0.18} height={0.25} fill={palette.stone} />
            ))}
          </Solid>
          <Solid>
            <path d="M -0.36,0.85 V 0.15 A 0.36 0.36 0 0 1 0.36,0.15 V 0.85 Z" fill={palette.door} />
          </Solid>
          <path d="M 0,-0.2 V 0.85" fill="none" {...ink} />
          <circle cx={-0.1} cy={0.4} r={0.05} fill={palette.gold} />
          <circle cx={0.1} cy={0.4} r={0.05} fill={palette.gold} />
        </>
      )
    case 'room':
      return (
        <>
          <Solid>
            <rect x={-0.75} y={-0.1} width={1.5} height={0.95} fill={palette.stone} />
          </Solid>
          <Solid>
            <polygon points="-0.92,-0.05 0,-0.8 0.92,-0.05" fill={palette.castleRoof} />
          </Solid>
          <rect x={-0.18} y={0.35} width={0.36} height={0.5} rx={0.14} fill={palette.door} {...ink} />
          <Window x={-0.6} y={0.15} w={0.3} h={0.34} />
          <Window x={0.3} y={0.15} w={0.3} h={0.34} />
        </>
      )
    case 'hall':
      return (
        <>
          <Solid>
            <rect x={-0.95} y={-0.05} width={1.9} height={0.9} fill={palette.stone} />
          </Solid>
          <Solid>
            <polygon points="-1,0 -0.72,-0.62 0.72,-0.62 1,0" fill={palette.castleRoof} />
          </Solid>
          <Solid>
            <rect x={-0.76} y={-0.74} width={1.52} height={0.14} rx={0.06} fill={palette.gold} />
          </Solid>
          {[-0.8, -0.17, 0.46].map((x) => (
            <Window key={x} x={x} y={0.2} w={0.34} h={0.5} />
          ))}
        </>
      )
    case 'garden':
      return (
        <>
          <Flower x={-0.72} y={0.05} to={0.5} r={0.2} fill={dyeHex(0)} />
          <Flower x={0.72} y={0.05} to={0.5} r={0.2} fill={dyeHex(2)} />
          <Solid>
            <ellipse cx={0} cy={0.55} rx={0.9} ry={0.32} fill={palette.stoneShade} />
          </Solid>
          <ellipse cx={0} cy={0.5} rx={0.68} ry={0.2} fill={palette.fountain} {...ink} />
          <Solid>
            <rect x={-0.13} y={-0.35} width={0.26} height={0.85} fill={palette.stone} />
          </Solid>
          <Solid>
            <ellipse cx={0} cy={-0.35} rx={0.42} ry={0.15} fill={palette.stoneShade} />
          </Solid>
          <Solid>
            <circle cx={0} cy={-0.62} r={0.17} fill={palette.water2} />
          </Solid>
        </>
      )
    case 'banner':
      return (
        <>
          <Solid>
            <rect x={-0.6} y={-0.85} width={0.14} height={1.8} rx={0.04} fill={palette.gold} />
            <circle cx={-0.53} cy={-0.9} r={0.11} fill={palette.gold} />
          </Solid>
          <Solid>
            <polygon points="-0.46,-0.75 0.9,-0.6 0.55,-0.2 0.9,0.2 -0.46,0.35" fill={dyeHex(colour)} />
          </Solid>
        </>
      )
    case 'belltower':
      return (
        <>
          <Solid>
            <rect x={-0.36} y={-0.7} width={0.72} height={1.55} fill={palette.stone} />
          </Solid>
          <Solid>
            <path d="M -0.24,-0.25 V -0.55 A 0.24 0.24 0 0 1 0.24,-0.55 V -0.25 Z" fill={palette.door} />
          </Solid>
          <Solid>
            <path d="M -0.14,-0.33 C -0.14,-0.62 0.14,-0.62 0.14,-0.33 L 0.18,-0.29 H -0.18 Z" fill={palette.gold} />
          </Solid>
          <circle cx={0} cy={-0.28} r={0.05} fill={palette.goldDark} />
          <Cone y={-0.72} half={0.5} tip={-0.98} />
          <Window x={-0.11} y={0.15} w={0.22} h={0.3} />
        </>
      )
    case 'woodcutter':
      return (
        <Hut>
          <g transform="rotate(25 0.5 0.3)">
            <Solid>
              <rect x={0.42} y={-0.45} width={0.16} height={1.3} rx={0.05} fill={palette.trunk} />
            </Solid>
            <Solid>
              <polygon points="0.5,-0.55 0.05,-0.5 0,-0.05 0.5,-0.12" fill={palette.ironLight} />
            </Solid>
          </g>
        </Hut>
      )
    case 'mason':
      return (
        <Hut>
          <Cube x={0.5} y={0.4} s={0.35} fill={palette.stoneShade} />
          <g transform="rotate(-45 0.2 0.1)">
            <Solid>
              <rect x={0.12} y={-0.6} width={0.16} height={0.55} rx={0.05} fill={palette.trunk} />
            </Solid>
            <Solid>
              <polygon points="0.12,-0.05 0.28,-0.05 0.24,0.4 0.16,0.4" fill={palette.ironLight} />
            </Solid>
          </g>
        </Hut>
      )
    case 'smithy':
      return (
        <Hut>
          <Solid>
            <polygon points="-0.3,0.2 -0.05,0.1 0.95,0.1 0.95,0.3 0.67,0.35 0.65,0.62 0.9,0.7 0.9,0.85 0,0.85 0,0.7 0.22,0.62 0.2,0.35 -0.05,0.3" fill={palette.iron} />
          </Solid>
          <rect x={0} y={0.14} width={0.9} height={0.08} fill={palette.ironLight} />
        </Hut>
      )
    case 'weaver':
      return (
        <Hut>
          <Solid>
            <rect x={0.02} y={-0.1} width={0.88} height={0.95} rx={0.05} fill={palette.trunk} />
          </Solid>
          <rect x={0.15} y={0.03} width={0.62} height={0.69} fill={palette.woolWhite} {...ink} />
          <path d="M 0.3,0.03 V 0.72 M 0.46,0.03 V 0.72 M 0.62,0.03 V 0.72" fill="none" stroke={palette.stoneBase} strokeWidth={0.05} />
          <ellipse cx={0.46} cy={0.42} rx={0.2} ry={0.07} fill={palette.woodDark} />
        </Hut>
      )
    case 'dyer':
      return (
        <Hut>
          {[0, 1, 2].map((i) => (
            <Solid key={i}>
              <rect x={-0.15 + i * 0.36} y={0.45} width={0.3} height={0.4} rx={0.07} fill={dyeHex(i)} />
              <rect x={-0.18 + i * 0.36} y={0.42} width={0.36} height={0.1} rx={0.03} fill={dyeHex(i)} />
            </Solid>
          ))}
        </Hut>
      )
    case 'paint':
      return (
        <>
          <g transform="rotate(-40)">
            <Solid>
              <rect x={-0.13} y={-0.2} width={0.26} height={1.1} rx={0.08} fill={palette.trunk} />
            </Solid>
            <Solid>
              <rect x={-0.16} y={-0.45} width={0.32} height={0.3} fill={palette.ironLight} />
            </Solid>
            <Solid>
              <polygon points="-0.16,-0.45 0.16,-0.45 0.1,-0.9 -0.1,-0.9" fill={dyeHex(colour)} />
            </Solid>
          </g>
          <Solid>
            <circle cx={0.55} cy={0.55} r={0.14} fill={dyeHex(colour)} />
          </Solid>
        </>
      )
    case 'lift':
      return (
        <>
          <Cube x={0} y={-0.5} s={0.38} fill={palette.stoneShade} />
          <Solid>
            <path d="M -0.78,0.12 A 0.78 0.66 0 0 0 0.78,0.12 Z" fill={palette.skin} />
            <rect x={-0.9} y={-0.2} width={0.26} height={0.45} rx={0.13} fill={palette.skin} />
            <rect x={0.64} y={-0.2} width={0.26} height={0.45} rx={0.13} fill={palette.skin} />
          </Solid>
          <path d="M -0.48,0.3 Q 0,0.52 0.48,0.3" fill="none" {...ink} />
        </>
      )
  }
}

/** The one picture a piece, the brush or the lifting hand has in the HUD. `colour` is the dye index the banner and the brush tip are shown in. */
export function PieceIcon({ kind, size, colour }: { kind: BarKind; size: number; colour: number }) {
  return <Icon size={size}>{pieceShapes(kind, colour)}</Icon>
}
