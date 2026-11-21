import type { ReactNode } from 'react'

import { FIRST_PAINT, MACHINE_KINDS, PAINTS } from './game/model'
import type { ActionFace, LooseKind, MachineKind, PaintId, PlaceId, Picture, Species } from './game/model'
import { LOAD_COLOUR, PALETTE } from './scene/look'

/** Every picture the HUD draws: flat, chunky, one ink outline, on a 64 by 64 box, ground at y 56. */

const INK = PALETTE.ink
const RUBBER = '#2a2a33'
const STEEL = '#aab1ba'
const GLASS = '#bfe6ff'
const GOLD = '#ffc21a'
/** The tool on the big button: light, so it stands out on the yellow. */
const TOOL = '#f4f6f8'
const WOOD = '#c98f4f'
const BRICK = '#d9573c'
const STONE = '#9c9ea3'

const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

/** A colour made lighter (k above 1) or darker (k below 1). */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0')
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`
}

/** The colour of a paint. */
export function paintColour(id: PaintId): string {
  const paint = PAINTS.find((p) => p.id === id)
  if (paint === undefined) throw new Error(`no paint ${id}`)
  return paint.colour
}

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className ?? 'icon'} aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

const Wheel = ({ x, y, r, hub }: { x: number; y: number; r: number; hub: string }) => (
  <g>
    <circle cx={x} cy={y} r={r} fill={RUBBER} {...line} strokeWidth={2.5} />
    <circle cx={x} cy={y} r={r * 0.45} fill={hub} stroke={INK} strokeWidth={2} />
  </g>
)

/** A thick bar from one point to another: an arm or a boom. */
const Rod = ({ a, b, w, colour }: { a: readonly [number, number]; b: readonly [number, number]; w: number; colour: string }) => (
  <g strokeLinecap="round">
    <path d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke={INK} strokeWidth={w + 5} />
    <path d={`M${a[0]} ${a[1]}L${b[0]} ${b[1]}`} stroke={colour} strokeWidth={w} />
  </g>
)

/** A chunky arrow pointing up, centred at (x, y), turned by `turn` degrees. */
const Arrow = ({ x, y, turn, size, colour }: { x: number; y: number; turn: number; size: number; colour: string }) => (
  <path d="M0 -14L13 0H5.5V14H-5.5V0H-13Z" fill={colour} {...line} strokeWidth={3 / size} transform={`translate(${x} ${y}) rotate(${turn}) scale(${size})`} />
)

const Window = ({ d }: { d: string }) => <path d={d} fill={GLASS} stroke={INK} strokeWidth={2} strokeLinejoin="round" />

/** A ring of teeth, for a saw blade. */
function teeth(cx: number, cy: number, inner: number, outer: number, n: number): string {
  const pts: string[] = []
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2
    const r = i % 2 === 0 ? outer : inner
    pts.push(`${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`)
  }
  return `M${pts.join('L')}Z`
}

/** A crest of narrow spines fanning out of a point (cx, cy) across the arc from `from` to `to` degrees (0 is right, 270 is up), every other one tinted `odd`. */
function Spines({ cx, cy, from, to, n, base, tip, even, odd }: { cx: number; cy: number; from: number; to: number; n: number; base: number; tip: number; even: string; odd: string }) {
  const at = (deg: number, r: number) => `${(cx + Math.cos((deg * Math.PI) / 180) * r).toFixed(1)} ${(cy + Math.sin((deg * Math.PI) / 180) * r).toFixed(1)}`
  return (
    <g strokeLinejoin="round" stroke={INK} strokeWidth="1.2">
      {Array.from({ length: n }, (_, i) => {
        const a = from + ((to - from) * i) / (n - 1)
        const r = i % 2 === 0 ? tip : tip - 3
        return <path key={i} d={`M${at(a - 7, base)}L${at(a, r)}L${at(a + 7, base)}Z`} fill={i % 2 === 0 ? even : odd} />
      })}
    </g>
  )
}

/** A side view of a machine in its paint, nose to the right. */
export function MachineIcon({ kind, colour }: { kind: MachineKind; colour: string }) {
  const dark = shade(colour, 0.78)
  const c = colour
  switch (kind) {
    case 'digger':
      return (
        <Svg>
          <rect x="5" y="42" width="38" height="14" rx="7" fill={RUBBER} {...line} />
          {[13, 24, 35].map((x) => <circle key={x} cx={x} cy="49" r="3.5" fill={STEEL} stroke={INK} strokeWidth="2" />)}
          <path d="M10 42V31q0-4 4-4h19q4 0 4 4v11Z" fill={c} {...line} />
          <rect x="10" y="36" width="27" height="6" fill={dark} stroke={INK} strokeWidth="2" />
          <path d="M19 27V17q0-3 3-3h9q3 0 3 3v10Z" fill={c} {...line} />
          <Window d="M22 17.5h8v7h-8Z" />
          <Rod a={[33, 31]} b={[46, 13]} w={5} colour={c} />
          <Rod a={[46, 13]} b={[57, 34]} w={4} colour={dark} />
          <path d="M53 33L63 36L61 46L52 43Z" fill={STEEL} {...line} />
        </Svg>
      )
    case 'dumper':
      return (
        <Svg>
          <rect x="3" y="40" width="58" height="6" rx="2" fill={PALETTE.darkMetal} {...line} />
          <path d="M3 20L39 27V41H3Z" fill={c} {...line} />
          <path d="M3 33L39 34V41H3Z" fill={dark} stroke={INK} strokeWidth="2" />
          <path d="M42 41V25q0-3 3-3h8q3 0 4 3l4 9v7Z" fill={c} {...line} />
          <Window d="M46 26h6l3 8h-9Z" />
          <Wheel x={13} y={49} r={7} hub={c} />
          <Wheel x={28} y={49} r={7} hub={c} />
          <Wheel x={51} y={49} r={7} hub={c} />
        </Svg>
      )
    case 'dozer':
      return (
        <Svg>
          <rect x="7" y="42" width="38" height="14" rx="7" fill={RUBBER} {...line} />
          {[14, 26, 38].map((x) => <circle key={x} cx={x} cy="49" r="3.5" fill={STEEL} stroke={INK} strokeWidth="2" />)}
          <path d="M11 42V31q0-3 3-3h26q3 0 3 3v11Z" fill={c} {...line} />
          <path d="M14 28V18q0-3 3-3h11q3 0 3 3v10Z" fill={c} {...line} />
          <Window d="M18 19h10v7H18Z" />
          <rect x="34" y="19" width="3.5" height="10" fill={STEEL} stroke={INK} strokeWidth="2" />
          <Rod a={[40, 44]} b={[52, 44]} w={3} colour={STEEL} />
          <path d="M49 22L58 20L59 52L50 54Z" fill={dark} {...line} />
        </Svg>
      )
    case 'roller':
      return (
        <Svg>
          <path d="M16 31V15h20v16" fill="none" {...line} />
          <rect x="13" y="11" width="26" height="5" rx="2" fill={c} {...line} />
          <rect x="13" y="28" width="32" height="14" rx="3" fill={c} {...line} />
          <rect x="37" y="38" width="12" height="6" fill={STEEL} {...line} strokeWidth={2.5} />
          <circle cx="15" cy="44" r="12" fill={RUBBER} {...line} />
          <circle cx="15" cy="44" r="5" fill={c} stroke={INK} strokeWidth="2" />
          <circle cx="49" cy="45" r="10.5" fill={STEEL} {...line} />
          <circle cx="49" cy="45" r="4" fill={dark} stroke={INK} strokeWidth="2" />
        </Svg>
      )
    case 'mixer':
      return (
        <Svg>
          <rect x="3" y="42" width="58" height="6" rx="2" fill={PALETTE.darkMetal} {...line} />
          <path d="M44 42V27q0-3 3-3h8q3 0 4 3l4 9v6Z" fill={c} {...line} />
          <Window d="M48 28h6l3 8h-9Z" />
          <g transform="rotate(-14 24 29)">
            <rect x="4" y="16" width="40" height="24" rx="12" fill={c} {...line} />
            {[17, 25, 33].map((x) => <path key={x} d={`M${x} 17L${x + 4} 38`} stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />)}
          </g>
          <Rod a={[6, 37]} b={[2, 46]} w={3} colour={STEEL} />
          <Wheel x={14} y={49} r={7} hub={c} />
          <Wheel x={28} y={49} r={7} hub={c} />
          <Wheel x={51} y={49} r={7} hub={c} />
        </Svg>
      )
    case 'forklift':
      return (
        <Svg>
          <path d="M12 32V16M31 32V16" stroke={INK} strokeWidth="3" />
          <rect x="9" y="12" width="25" height="5" rx="2" fill={PALETTE.darkMetal} {...line} />
          <path d="M8 34q0-4 4-4h20q3 0 3 4v14H8Z" fill={c} {...line} />
          <rect x="6" y="38" width="8" height="10" rx="3" fill={dark} stroke={INK} strokeWidth="2" />
          <rect x="38" y="6" width="5" height="46" rx="2" fill={STEEL} {...line} />
          <rect x="44" y="10" width="4" height="42" rx="2" fill={shade(STEEL, 0.8)} {...line} strokeWidth={2.5} />
          <rect x="35" y="36" width="6" height="12" fill={dark} {...line} strokeWidth={2.5} />
          <rect x="40" y="45" width="21" height="4.5" rx="1.5" fill={STEEL} {...line} />
          <Wheel x={16} y={49} r={7} hub={c} />
          <Wheel x={32} y={49} r={7} hub={c} />
        </Svg>
      )
    case 'tower':
      return (
        <Svg>
          <rect x="21" y="53" width="22" height="5" rx="1.5" fill={STONE} {...line} />
          <rect x="28" y="14" width="8" height="40" fill={c} {...line} />
          <path d="M28 54L36 46L28 38L36 30L28 22L36 14M36 54L28 46L36 38L28 30L36 22" stroke="#fff" strokeWidth="2" fill="none" />
          <path d="M32 3L5 9M32 3L58 9" stroke={INK} strokeWidth="2" />
          <rect x="3" y="9" width="58" height="6" fill={c} {...line} />
          <path d="M9 9L14 15L19 9L24 15L29 9L34 15L39 9L44 15L49 9L54 15" stroke="#fff" strokeWidth="1.8" fill="none" />
          <rect x="3" y="15" width="9" height="8" fill={STONE} {...line} strokeWidth={2.5} />
          <rect x="24" y="15" width="7" height="6" fill={GLASS} {...line} strokeWidth={2.5} />
          <path d="M50 15V33" stroke={INK} strokeWidth="2.2" />
          <rect x="46.5" y="33" width="7" height="6" fill="#e03a3e" {...line} strokeWidth={2.5} />
          <path d="M50 39V43q0 4-3 4" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
        </Svg>
      )
    case 'semi':
      return (
        <Svg>
          <rect x="2" y="39" width="40" height="5" rx="2" fill={PALETTE.darkMetal} {...line} />
          {[9, 19, 29].map((x) => <circle key={x} cx={x} cy="33" r="5" fill={WOOD} stroke={INK} strokeWidth="2.2" />)}
          {[14, 24].map((x) => <circle key={x} cx={x} cy="23" r="5" fill={WOOD} stroke={INK} strokeWidth="2.2" />)}
          {[9, 19, 29].map((x) => <circle key={x} cx={x} cy="33" r="1.8" fill="#e8c28a" />)}
          {[14, 24].map((x) => <circle key={x} cx={x} cy="23" r="1.8" fill="#e8c28a" />)}
          <path d="M3 40V16M38 40V16" stroke={INK} strokeWidth="3" />
          <path d="M43 44V28q0-4 4-4h8q3 0 4 3l4 10v7Z" fill={c} {...line} />
          <Window d="M47 29h7l3 8h-10Z" />
          <Wheel x={12} y={49} r={7} hub={c} />
          <Wheel x={27} y={49} r={7} hub={c} />
          <Wheel x={52} y={49} r={7} hub={c} />
        </Svg>
      )
    case 'mobile':
      return (
        <Svg>
          <rect x="3" y="41" width="58" height="6" rx="2" fill={PALETTE.darkMetal} {...line} />
          <path d="M46 42V30q0-3 3-3h7q3 0 4 3l3 7v5Z" fill={c} {...line} />
          <Window d="M49.5 31h5l3 6h-8Z" />
          <rect x="6" y="29" width="23" height="13" rx="3" fill={c} {...line} />
          <Rod a={[17, 31]} b={[48, 8]} w={6} colour={c} />
          <Rod a={[34, 20]} b={[48, 8]} w={3.5} colour="#fff" />
          <path d="M49 10V26" stroke={INK} strokeWidth="2.2" />
          <rect x="45.5" y="26" width="7" height="6" fill={dark} {...line} strokeWidth={2.5} />
          <path d="M8 46V56M34 46V56" stroke={INK} strokeWidth="4" />
          <path d="M4 56H12M30 56H38" stroke={GOLD} strokeWidth="2.5" />
          <Wheel x={19} y={50} r={6.5} hub={c} />
          <Wheel x={30} y={50} r={6.5} hub={c} />
          <Wheel x={53} y={50} r={6.5} hub={c} />
        </Svg>
      )
  }
}

const Heap = ({ colour, children }: { colour: string; children?: ReactNode }) => (
  <g>
    <path d="M4 54C16 54 20 45 26 33C29 26 35 26 38 33C44 45 48 54 60 54Z" fill={colour} {...line} />
    {children}
  </g>
)

/** Loose stuff as a heap or a few bits. */
export function LooseIcon({ kind }: { kind: LooseKind }) {
  const c = LOAD_COLOUR[kind]
  switch (kind) {
    case 'dirt':
      return (
        <Svg>
          <Heap colour={c}>
            {[[24, 46], [34, 42], [43, 49], [30, 50]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2.5" fill={shade(c, 0.7)} />)}
          </Heap>
        </Svg>
      )
    case 'sand':
      return (
        <Svg>
          <Heap colour={c}>
            <path d="M24 44Q32 38 40 46M20 50Q30 46 44 52" stroke="#c9a550" strokeWidth="2" fill="none" strokeLinecap="round" />
          </Heap>
        </Svg>
      )
    case 'rock':
      return (
        <Svg>
          <path d="M5 54L9 40L21 35L31 42L33 54Z" fill={c} {...line} />
          <path d="M28 54L31 31L45 24L57 33L59 54Z" fill={shade(c, 1.12)} {...line} />
          <path d="M17 36L23 22L34 20L40 26" fill={shade(c, 0.9)} {...line} />
          <path d="M31 31L45 24" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </Svg>
      )
    case 'gravel':
      return (
        <Svg>
          <Heap colour={c}>
            {[[28, 45], [36, 44], [32, 38], [22, 50], [42, 50], [32, 51], [49, 52], [15, 52]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="3.2" fill={i % 2 === 0 ? '#d8d2c4' : '#8f897d'} stroke={INK} strokeWidth="1.8" />)}
          </Heap>
        </Svg>
      )
    case 'concrete':
      return (
        <Svg>
          <Heap colour={c}>
            <path d="M22 48Q32 42 44 49M26 41Q32 37 38 41" stroke="#7d8087" strokeWidth="2.2" fill="none" strokeLinecap="round" />
          </Heap>
        </Svg>
      )
  }
}

/** The pictures that are neither machines nor loose stuff. */
function OtherIcon({ picture }: { picture: Exclude<Picture, MachineKind | LooseKind> }) {
  switch (picture) {
    case 'bricks':
      return (
        <Svg>
          {[0, 1, 2].map((row) => (
            <g key={row}>
              {(row % 2 === 0 ? [6, 24, 42] : [15, 33]).map((x) => <rect key={x} x={x} y={14 + row * 14} width="17" height="13" rx="2" fill={BRICK} {...line} strokeWidth={2.5} />)}
            </g>
          ))}
          <rect x="6" y="48" width="52" height="6" rx="2" fill={WOOD} {...line} strokeWidth={2.5} />
        </Svg>
      )
    case 'planks':
      return (
        <Svg>
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <rect x="6" y={13 + i * 10.5} width="52" height="9" rx="2" fill={i % 2 === 0 ? '#d9a566' : '#c98f4f'} {...line} strokeWidth={2.5} />
              <path d={`M14 ${17.5 + i * 10.5}H30M38 ${17.5 + i * 10.5}H50`} stroke="#a86d33" strokeWidth="1.6" strokeLinecap="round" />
            </g>
          ))}
        </Svg>
      )
    case 'pier':
      return (
        <Svg>
          <rect x="22" y="14" width="20" height="40" fill={STONE} {...line} />
          <rect x="15" y="8" width="34" height="9" rx="2" fill={shade(STONE, 1.15)} {...line} />
          <rect x="15" y="51" width="34" height="6" rx="2" fill={shade(STONE, 1.15)} {...line} />
          <path d="M27 22V48" stroke="#fff" strokeWidth="2" opacity="0.5" strokeLinecap="round" />
        </Svg>
      )
    case 'beam':
      return (
        <Svg>
          <rect x="4" y="18" width="56" height="8" rx="2" fill={STEEL} {...line} />
          <rect x="4" y="38" width="56" height="8" rx="2" fill={STEEL} {...line} />
          <rect x="4" y="26" width="56" height="12" fill={shade(STEEL, 0.85)} stroke={INK} strokeWidth="2.5" />
          <circle cx="12" cy="32" r="2" fill={INK} />
          <circle cx="52" cy="32" r="2" fill={INK} />
        </Svg>
      )
    case 'slide':
      return (
        <Svg>
          <path d="M14 56V14M26 56V14" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d="M14 56V14M26 56V14" stroke="#e03a3e" strokeWidth="3" strokeLinecap="round" />
          <path d="M14 22H26M14 34H26M14 46H26" stroke={INK} strokeWidth="2.5" />
          <rect x="10" y="10" width="20" height="5" rx="2" fill="#e03a3e" {...line} strokeWidth={2.5} />
          <path d="M28 14Q40 40 60 52" stroke={INK} strokeWidth="11" strokeLinecap="round" fill="none" />
          <path d="M28 14Q40 40 60 52" stroke={GOLD} strokeWidth="6" strokeLinecap="round" fill="none" />
        </Svg>
      )
    case 'swing':
      return (
        <Svg>
          <path d="M10 56L32 8L54 56" stroke={INK} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M10 56L32 8L54 56" stroke="#5ec8ff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d="M25 22L22 46M39 22L42 46" stroke={INK} strokeWidth="2.2" />
          <rect x="17" y="46" width="30" height="6" rx="3" fill={GOLD} {...line} />
        </Svg>
      )
    case 'climber':
      return (
        <Svg>
          <path d="M8 56V20Q8 8 32 8Q56 8 56 20V56" stroke={INK} strokeWidth="7" strokeLinecap="round" fill="none" />
          <path d="M8 56V20Q8 8 32 8Q56 8 56 20V56" stroke="#7fe07a" strokeWidth="3.5" strokeLinecap="round" fill="none" />
          <path d="M8 28H56M8 42H56M32 8V56" stroke={INK} strokeWidth="5" />
          <path d="M8 28H56M8 42H56M32 8V56" stroke="#7fe07a" strokeWidth="2" />
        </Svg>
      )
    case 'clock':
      return (
        <Svg>
          <path d="M18 56V26L32 8L46 26V56Z" fill={BRICK} {...line} />
          <path d="M18 56V26L32 8L46 26" fill="none" {...line} />
          <path d="M14 27H50" stroke={INK} strokeWidth="3" />
          <circle cx="32" cy="35" r="10" fill="#fff7e6" {...line} />
          <path d="M32 35V28M32 35L37 38" stroke={INK} strokeWidth="2.8" strokeLinecap="round" />
          <rect x="27" y="46" width="10" height="10" rx="5" fill={PALETTE.darkMetal} stroke={INK} strokeWidth="2" />
        </Svg>
      )
    case 'press':
      return (
        <Svg>
          <rect x="8" y="28" width="38" height="26" rx="3" fill={shade(BRICK, 1.05)} {...line} />
          <path d="M14 28L21 10H35L42 28Z" fill={STEEL} {...line} />
          <rect x="46" y="44" width="14" height="10" rx="2" fill={BRICK} {...line} strokeWidth={2.5} />
          <rect x="46" y="34" width="14" height="10" rx="2" fill={BRICK} {...line} strokeWidth={2.5} />
          <circle cx="27" cy="42" r="6" fill={GOLD} stroke={INK} strokeWidth="2.5" />
          <path d="M27 42V38M27 42L30 43" stroke={INK} strokeWidth="2" strokeLinecap="round" />
        </Svg>
      )
    case 'crusher':
      return (
        <Svg>
          <path d="M10 22L18 8H34L42 22Z" fill={STEEL} {...line} />
          <path d="M12 22H40L36 50H16Z" fill={PALETTE.darkMetal} {...line} />
          <path d="M20 28L28 28L26 44H22Z" fill={STONE} stroke={INK} strokeWidth="2" />
          <path d="M34 46L54 36" stroke={INK} strokeWidth="9" strokeLinecap="round" />
          <path d="M34 46L54 36" stroke={STEEL} strokeWidth="5" strokeLinecap="round" />
          <path d="M40 54Q54 54 60 54L56 42Q50 36 44 42Z" fill="#b5b0a4" {...line} strokeWidth={2.5} />
        </Svg>
      )
    case 'saw':
      return (
        <Svg>
          <rect x="6" y="46" width="52" height="8" rx="2" fill={WOOD} {...line} />
          <path d="M18 54V46M46 54V46" stroke={INK} strokeWidth="3" />
          <path d={teeth(32, 28, 12, 17, 12)} fill={STEEL} {...line} strokeWidth={2.5} />
          <circle cx="32" cy="28" r="4.5" fill={GOLD} stroke={INK} strokeWidth="2.5" />
          <rect x="4" y="38" width="22" height="8" rx="3" fill="#d9a566" {...line} strokeWidth={2.5} />
        </Svg>
      )
    case 'hole':
      return (
        <Svg>
          <path d="M2 34H62V56H2Z" fill="#6fcf5f" {...line} />
          <ellipse cx="32" cy="40" rx="24" ry="10" fill="#6b4426" {...line} />
          <ellipse cx="32" cy="42" rx="17" ry="6" fill="#3d2514" />
        </Svg>
      )
    case 'road':
      return (
        <Svg>
          <path d="M22 6H42L61 57H3Z" fill="#2d3138" {...line} />
          <path d="M32 11V19M32 26V38M32 45V55" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
        </Svg>
      )
    case 'water':
      return (
        <Svg>
          <path d="M32 6C22 22 12 30 12 40a20 20 0 0 0 40 0C52 30 42 22 32 6Z" fill="#4aa8ff" {...line} />
          <path d="M22 42Q32 34 42 42" stroke="#fff" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </Svg>
      )
    case 'logs':
      return (
        <Svg>
          {[[18, 42], [32, 42], [46, 42], [25, 29], [39, 29]].map(([x, y]) => (
            <g key={`${x}${y}`}>
              <circle cx={x} cy={y} r="8" fill={WOOD} {...line} strokeWidth={2.5} />
              <circle cx={x} cy={y} r="4" fill="#e8c28a" stroke="#a86d33" strokeWidth="1.8" />
            </g>
          ))}
        </Svg>
      )
    case 'house':
      return (
        <Svg>
          <rect x="12" y="28" width="40" height="27" fill="#fff0c8" {...line} />
          <path d="M6 30L32 8L58 30Z" fill="#e03a3e" {...line} />
          <rect x="27" y="38" width="11" height="17" rx="2" fill={WOOD} {...line} strokeWidth={2.5} />
          <rect x="15" y="34" width="9" height="9" fill={GLASS} stroke={INK} strokeWidth="2.2" />
          <rect x="41" y="34" width="8" height="9" fill={GLASS} stroke={INK} strokeWidth="2.2" />
        </Svg>
      )
    case 'wall':
      return (
        <Svg>
          <rect x="6" y="12" width="52" height="42" fill={BRICK} {...line} />
          <path d="M6 26H58M6 40H58M20 12V26M42 12V26M31 26V40M12 40V54M50 40V54" stroke="#f6d4b8" strokeWidth="2.2" />
        </Svg>
      )
    case 'roof':
      return (
        <Svg>
          <path d="M4 44L32 12L60 44Z" fill="#e03a3e" {...line} />
          <path d="M14 36H50M22 28H42" stroke="#9e2024" strokeWidth="2.5" strokeLinecap="round" />
          <rect x="4" y="44" width="56" height="5" rx="2" fill={shade('#e03a3e', 0.8)} {...line} strokeWidth={2.5} />
        </Svg>
      )
    case 'floor':
      return (
        <Svg>
          <path d="M4 34L32 20L60 34L32 48Z" fill={STONE} {...line} />
          <path d="M4 34V42L32 56L60 42V34" fill={shade(STONE, 0.75)} {...line} />
          <path d="M4 34L32 20L60 34L32 48Z" fill="none" stroke={WOOD} strokeWidth="4" strokeLinejoin="round" />
        </Svg>
      )
    case 'bridge':
      return (
        <Svg>
          <path d="M2 50Q12 54 24 50T46 50T62 50V58H2Z" fill="#4aa8ff" {...line} strokeWidth={2.5} />
          <path d="M6 34Q32 6 58 34" stroke={INK} strokeWidth="8" fill="none" />
          <path d="M6 34Q32 6 58 34" stroke="#ffb52e" strokeWidth="4" fill="none" />
          <rect x="2" y="32" width="60" height="8" rx="2" fill={STONE} {...line} />
          <path d="M16 36V24M32 36V16M48 36V24" stroke={INK} strokeWidth="2.2" />
        </Svg>
      )
    case 'playground':
      return (
        <Svg>
          <path d="M10 54V14M22 54V14" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d="M10 54V14M22 54V14" stroke="#e03a3e" strokeWidth="3" strokeLinecap="round" />
          <rect x="6" y="10" width="20" height="5" rx="2" fill="#e03a3e" {...line} strokeWidth={2.5} />
          <path d="M24 14Q38 38 58 48" stroke={INK} strokeWidth="11" strokeLinecap="round" fill="none" />
          <path d="M24 14Q38 38 58 48" stroke={GOLD} strokeWidth="6" strokeLinecap="round" fill="none" />
          <circle cx="50" cy="20" r="7" fill="#ff6fa8" {...line} strokeWidth={2.5} />
        </Svg>
      )
    case 'pond':
      return (
        <Svg>
          <path d="M2 36H62V56H2Z" fill="#6fcf5f" {...line} />
          <ellipse cx="32" cy="44" rx="25" ry="11" fill="#4aa8ff" {...line} />
          <path d="M18 44Q24 40 30 44M36 46Q42 42 48 46" stroke="#fff" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          <path d="M52 40V24M56 40V28" stroke="#4b8f3a" strokeWidth="3" strokeLinecap="round" />
        </Svg>
      )
    case 'iceCream':
      return (
        <Svg>
          <path d="M20 30H44L32 60Z" fill="#e0a85a" {...line} />
          <path d="M26 36L36 36M29 44L35 44" stroke="#b9803a" strokeWidth="2.2" strokeLinecap="round" />
          <circle cx="32" cy="24" r="12" fill="#ff9ac0" {...line} />
          <circle cx="32" cy="12" r="9" fill="#fff0c8" {...line} />
          <circle cx="32" cy="3.5" r="3.2" fill="#e03a3e" stroke={INK} strokeWidth="2" />
        </Svg>
      )
    case 'arrow':
      return (
        <Svg>
          <Arrow x={32} y={32} turn={90} size={1.9} colour={GOLD} />
        </Svg>
      )
    case 'plus':
      return (
        <Svg>
          <path d="M24 8H40V24H56V40H40V56H24V40H8V24H24Z" fill="#7fe07a" {...line} />
        </Svg>
      )
  }
}

/** Any picture of a job: machines in their first paint unless a colour is given. */
export function PictureIcon({ picture, colour }: { picture: Picture; colour?: string }) {
  if ((MACHINE_KINDS as readonly string[]).includes(picture)) {
    const kind = picture as MachineKind
    return <MachineIcon kind={kind} colour={colour ?? paintColour(FIRST_PAINT[kind])} />
  }
  if (picture === 'dirt' || picture === 'sand' || picture === 'rock' || picture === 'gravel' || picture === 'concrete') return <LooseIcon kind={picture} />
  return <OtherIcon picture={picture as Exclude<Picture, MachineKind | LooseKind>} />
}

/** What a spoken place looks like. */
export const PLACE_PICTURE: Record<PlaceId, Picture> = {
  sand: 'sand', rock: 'rock', hole: 'hole', road: 'road', house: 'house', bridge: 'bridge', water: 'water', forest: 'logs', saw: 'saw', press: 'press', crusher: 'crusher', play: 'playground', pond: 'pond', clock: 'clock', there: 'arrow',
}

const Crate = ({ x, y, size }: { x: number; y: number; size: number }) => (
  <g>
    <rect x={x} y={y} width={size} height={size} rx="2" fill="#d9a566" {...line} strokeWidth={2.5} />
    <path d={`M${x} ${y}L${x + size} ${y + size}M${x + size} ${y}L${x} ${y + size}`} stroke="#a86d33" strokeWidth="2" />
  </g>
)

const Ground = ({ colour }: { colour: string }) => <path d="M2 54H62V60H2Z" fill={colour} {...line} strokeWidth={2.5} />

/** What the big button does, drawn on a flat face. */
export function ActionIcon({ face }: { face: ActionFace }) {
  const dirt = LOAD_COLOUR.dirt
  switch (face) {
    case 'dig':
      return (
        <Svg>
          <path d="M4 54C14 54 18 48 26 46C34 44 44 50 60 54Z" fill={dirt} {...line} />
          <Rod a={[8, 8]} b={[26, 30]} w={5} colour={TOOL} />
          <path d="M20 28L40 24L44 40Q34 48 22 42Z" fill={TOOL} {...line} />
          <path d="M40 24L44 40" stroke={INK} strokeWidth="3" />
          <Arrow x={50} y={20} turn={180} size={0.9} colour="#fff" />
        </Svg>
      )
    case 'dump':
      return (
        <Svg>
          <g transform="rotate(-125 24 20)">
            <path d="M12 12L36 8L40 26Q28 34 14 28Z" fill={TOOL} {...line} />
          </g>
          {[[34, 30], [38, 38], [34, 44]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="3.2" fill={dirt} />)}
          <path d="M18 54C26 54 28 46 36 44C44 42 52 52 60 54Z" fill={dirt} {...line} />
        </Svg>
      )
    case 'tip':
      return (
        <Svg>
          <Ground colour="#6fcf5f" />
          <rect x="2" y="48" width="36" height="5" rx="2" fill={PALETTE.darkMetal} {...line} strokeWidth={2.5} />
          <path d="M6 46L26 6L38 14L38 46Z" fill={TOOL} {...line} />
          <path d="M26 6L38 14" stroke={INK} strokeWidth="3" />
          <Wheel x={14} y={50} r={5} hub={TOOL} />
          <Wheel x={30} y={50} r={5} hub={TOOL} />
          <path d="M38 52C42 52 44 44 50 40C54 38 58 48 62 52Z" fill={LOAD_COLOUR.sand} {...line} strokeWidth={2.5} />
          {[[43, 26], [46, 34]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="3" fill={LOAD_COLOUR.sand} />)}
        </Svg>
      )
    case 'bladeUp':
      return (
        <Svg>
          <Ground colour="#6fcf5f" />
          <path d="M8 30L52 22L54 40L10 48Z" fill={TOOL} {...line} />
          <path d="M8 30L52 22" stroke="#fff" strokeWidth="2" opacity="0.7" strokeLinecap="round" />
          <Arrow x={32} y={10} turn={0} size={0.7} colour="#fff" />
        </Svg>
      )
    case 'bladeDown':
      return (
        <Svg>
          <Ground colour="#6fcf5f" />
          <path d="M8 24L8 52L22 52L22 24Z" fill={TOOL} {...line} />
          <path d="M22 54C28 54 30 46 38 44C46 42 54 52 60 54Z" fill={dirt} {...line} strokeWidth={2.5} />
          <Arrow x={42} y={18} turn={180} size={0.9} colour="#fff" />
        </Svg>
      )
    case 'stomp':
      return (
        <Svg>
          <Ground colour="#2d3138" />
          <circle cx="32" cy="34" r="17" fill={STEEL} {...line} />
          <circle cx="32" cy="34" r="6" fill={TOOL} stroke={INK} strokeWidth="2.5" />
          <path d="M8 56L2 50M56 56L62 50M32 60V62" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <Arrow x={32} y={9} turn={180} size={0.55} colour="#fff" />
        </Svg>
      )
    case 'pick':
      return (
        <Svg>
          <Crate x={14} y={20} size={24} />
          <rect x="6" y="44" width="48" height="5" rx="2" fill={STEEL} {...line} />
          <rect x="6" y="10" width="5" height="44" rx="2" fill={STEEL} {...line} strokeWidth={2.5} />
          <Arrow x={50} y={22} turn={0} size={0.8} colour="#fff" />
        </Svg>
      )
    case 'drop':
      return (
        <Svg>
          <Ground colour="#6fcf5f" />
          <rect x="6" y="12" width="5" height="26" rx="2" fill={STEEL} {...line} strokeWidth={2.5} />
          <rect x="6" y="34" width="26" height="4.5" rx="2" fill={STEEL} {...line} strokeWidth={2.5} />
          <Crate x={32} y={36} size={18} />
          <Arrow x={48} y={16} turn={180} size={0.8} colour="#fff" />
        </Svg>
      )
    case 'hook':
      return (
        <Svg>
          <path d="M20 4V28" stroke={INK} strokeWidth="3" />
          <rect x="15" y="28" width="10" height="8" fill="#e03a3e" {...line} strokeWidth={2.5} />
          <path d="M20 36V42q0 8-7 8" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
          <Crate x={30} y={38} size={22} />
          <Arrow x={52} y={16} turn={0} size={0.7} colour="#fff" />
        </Svg>
      )
    case 'unhook':
      return (
        <Svg>
          <Ground colour="#6fcf5f" />
          <path d="M20 4V20" stroke={INK} strokeWidth="3" />
          <rect x="15" y="20" width="10" height="8" fill="#e03a3e" {...line} strokeWidth={2.5} />
          <path d="M20 28V34q0 8-7 8" stroke={INK} strokeWidth="5" fill="none" strokeLinecap="round" />
          <Crate x={30} y={32} size={22} />
          <Arrow x={54} y={14} turn={180} size={0.7} colour="#fff" />
        </Svg>
      )
    case 'pour':
      return (
        <Svg>
          <g transform="rotate(30 26 22)">
            <rect x="6" y="10" width="36" height="22" rx="11" fill="#f3a6c4" {...line} />
            {[16, 24].map((x) => <path key={x} d={`M${x} 11L${x + 4} 31`} stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />)}
          </g>
          <path d="M44 34Q48 44 46 54" stroke={INK} strokeWidth="10" strokeLinecap="round" fill="none" />
          <path d="M44 34Q48 44 46 54" stroke={STONE} strokeWidth="5.5" strokeLinecap="round" fill="none" />
          <path d="M26 56Q46 50 60 56Z" fill={STONE} {...line} strokeWidth={2.5} />
        </Svg>
      )
    case 'unload':
      return (
        <Svg>
          <rect x="2" y="42" width="34" height="5" rx="2" fill={PALETTE.darkMetal} {...line} strokeWidth={2.5} />
          {[10, 22, 32].map((x) => <circle key={x} cx={x} cy="35" r="6" fill={WOOD} stroke={INK} strokeWidth="2.2" />)}
          <circle cx="46" cy="48" r="6" fill={WOOD} stroke={INK} strokeWidth="2.2" />
          <circle cx="56" cy="50" r="5" fill={WOOD} stroke={INK} strokeWidth="2.2" />
          <Arrow x={46} y={20} turn={160} size={0.7} colour="#fff" />
          <Ground colour="#6fcf5f" />
        </Svg>
      )
    case 'none':
      return (
        <Svg>
          {[14, 32, 50].map((x) => <circle key={x} cx={x} cy="32" r="4.5" fill="#fff" stroke={INK} strokeWidth="2.5" />)}
        </Svg>
      )
  }
}

/** A friendly face for every animal, with a hard hat of `hat` if given. */
export function Face({ species, hat }: { species: Species; hat?: string }) {
  const eye = (x: number) => (
    <g>
      <circle cx={x} cy="35" r="3.2" fill={INK} />
      <circle cx={x + 1} cy="33.8" r="1.1" fill="#fff" />
    </g>
  )
  const smile = <path d="M27.5 44Q32 48 36.5 44" stroke={INK} strokeWidth="2.2" fill="none" strokeLinecap="round" />
  const head = (colour: string, rx = 19, ry = 18) => <ellipse cx="32" cy="38" rx={rx} ry={ry} fill={colour} {...line} />
  let back: ReactNode = null
  let front: ReactNode = null
  let skin = '#fff'
  switch (species) {
    case 'hedgehog':
      back = (
        <g>
          <Spines cx={32} cy={38} from={168} to={372} n={15} base={14} tip={31} even="#4a2e1b" odd="#7d512d" />
          <circle cx="14.5" cy="33" r="4.6" fill="#a87548" {...line} />
          <circle cx="49.5" cy="33" r="4.6" fill="#a87548" {...line} />
        </g>
      )
      skin = '#a87548'
      front = (
        <g>
          <path d="M25 39Q32 36.5 39 39Q36 46.5 32 51Q28 46.5 25 39Z" fill="#f8e8cc" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <circle cx="32" cy="49.8" r="2.5" fill={INK} />
        </g>
      )
      break
    case 'bunny':
      back = (
        <g>
          <ellipse cx="22" cy="12" rx="6" ry="13" fill="#fbf2ea" {...line} />
          <ellipse cx="42" cy="12" rx="6" ry="13" fill="#fbf2ea" {...line} />
          <ellipse cx="22" cy="13" rx="2.5" ry="8" fill="#ffb3c8" />
          <ellipse cx="42" cy="13" rx="2.5" ry="8" fill="#ffb3c8" />
        </g>
      )
      skin = '#fbf2ea'
      front = <ellipse cx="32" cy="40" rx="3" ry="2.3" fill="#ff86a8" />
      break
    case 'duck':
      skin = '#ffd83a'
      front = <path d="M22 41Q32 36 42 41Q42 49 32 49Q22 49 22 41Z" fill="#ff9a1f" stroke={INK} strokeWidth="2.2" />
      break
    case 'pig':
      back = (
        <g fill="#ff86a8" {...line}>
          <path d="M16 24L12 12L26 20Z" />
          <path d="M48 24L52 12L38 20Z" />
        </g>
      )
      skin = '#ffa8c2'
      front = (
        <g>
          <ellipse cx="32" cy="43" rx="8.5" ry="6.5" fill="#ff86a8" stroke={INK} strokeWidth="2.2" />
          <circle cx="29" cy="43" r="1.6" fill={INK} />
          <circle cx="35" cy="43" r="1.6" fill={INK} />
        </g>
      )
      break
    case 'cat':
      back = (
        <g fill="#ff9b3d" {...line}>
          <path d="M14 30L13 10L28 21Z" />
          <path d="M50 30L51 10L36 21Z" />
        </g>
      )
      skin = '#ff9b3d'
      front = (
        <g>
          <path d="M30 41L34 41L32 44Z" fill="#ff86a8" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M20 42L8 40M20 45L9 48M44 42L56 40M44 45L55 48" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M20 26L25 22M44 26L39 22" stroke="#b9621b" strokeWidth="2.5" strokeLinecap="round" />
        </g>
      )
      break
    case 'dog':
      back = (
        <g fill="#8b5b33" {...line}>
          <ellipse cx="14" cy="36" rx="7" ry="13" />
          <ellipse cx="50" cy="36" rx="7" ry="13" />
        </g>
      )
      skin = '#d9a866'
      front = (
        <g>
          <ellipse cx="32" cy="43" rx="10" ry="7.5" fill="#f7e6c4" stroke={INK} strokeWidth="2" />
          <ellipse cx="32" cy="40" rx="4.5" ry="3.2" fill={INK} />
        </g>
      )
      break
    case 'cow':
      back = (
        <g>
          <path d="M18 24L14 14M46 24L50 14" stroke={INK} strokeWidth="6" strokeLinecap="round" />
          <path d="M18 24L14 14M46 24L50 14" stroke="#f3e2b0" strokeWidth="3" strokeLinecap="round" />
          <ellipse cx="12" cy="31" rx="7" ry="4" fill="#fbfbfb" {...line} />
          <ellipse cx="52" cy="31" rx="7" ry="4" fill="#fbfbfb" {...line} />
        </g>
      )
      skin = '#fbfbfb'
      front = (
        <g>
          <path d="M18 28Q26 24 28 30Q24 36 17 34Z" fill="#3a3a42" />
          <ellipse cx="32" cy="45" rx="10" ry="7" fill="#ffb3c8" stroke={INK} strokeWidth="2" />
          <circle cx="28.5" cy="45" r="1.5" fill={INK} />
          <circle cx="35.5" cy="45" r="1.5" fill={INK} />
        </g>
      )
      break
    case 'sheep':
      back = (
        <g fill="#fdfaf4" {...line} strokeWidth={2.5}>
          {[[16, 26], [26, 18], [38, 18], [48, 26], [50, 38], [14, 38], [20, 48], [44, 48]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="9" />)}
        </g>
      )
      skin = '#5a5560'
      front = null
      break
    case 'fox':
      back = (
        <g fill="#ff7a22" {...line}>
          <path d="M13 32L12 8L28 20Z" />
          <path d="M51 32L52 8L36 20Z" />
        </g>
      )
      skin = '#ff7a22'
      front = (
        <g>
          <path d="M14 40Q26 40 32 50Q38 40 50 40Q46 54 32 56Q18 54 14 40Z" fill="#fff4e6" stroke={INK} strokeWidth="2" strokeLinejoin="round" />
          <ellipse cx="32" cy="49" rx="3.5" ry="2.8" fill={INK} />
        </g>
      )
      break
    case 'bear':
      back = (
        <g fill="#8c5b3b" {...line}>
          <circle cx="16" cy="22" r="7.5" />
          <circle cx="48" cy="22" r="7.5" />
        </g>
      )
      skin = '#8c5b3b'
      front = (
        <g>
          <ellipse cx="32" cy="44" rx="9.5" ry="7.5" fill="#dfbb90" stroke={INK} strokeWidth="2" />
          <ellipse cx="32" cy="41" rx="3.5" ry="2.6" fill={INK} />
        </g>
      )
      break
    case 'frog':
      back = (
        <g fill="#5ec55a" {...line}>
          <circle cx="20" cy="24" r="9" />
          <circle cx="44" cy="24" r="9" />
        </g>
      )
      skin = '#5ec55a'
      break
  }
  const frog = species === 'frog'
  return (
    <Svg>
      {back}
      {species === 'sheep' ? <ellipse cx="32" cy="38" rx="15" ry="16" fill={skin} {...line} /> : head(skin, frog ? 21 : 19, frog ? 16 : 18)}
      {front}
      {frog ? (
        <g>
          <circle cx="20" cy="24" r="5.5" fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx="44" cy="24" r="5.5" fill="#fff" stroke={INK} strokeWidth="2" />
          <circle cx="21" cy="25" r="2.8" fill={INK} />
          <circle cx="43" cy="25" r="2.8" fill={INK} />
          <path d="M20 42Q32 54 44 42" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      ) : (
        <g>
          {species === 'sheep' ? <g fill="#fdfaf4"><circle cx="32" cy="22" r="8" stroke={INK} strokeWidth="2.5" /></g> : null}
          {eye(24.5)}
          {eye(39.5)}
          {species === 'duck' || species === 'hedgehog' || species === 'pig' || species === 'cow' || species === 'fox' || species === 'bear' || species === 'dog' ? null : smile}
        </g>
      )}
      {hat === undefined ? null : (
        <g transform={frog ? 'translate(0 -7)' : undefined}>
          <path d="M16 24Q16 7 32 7Q48 7 48 24Z" fill={hat} {...line} />
          <path d="M32 7V24" stroke={INK} strokeWidth="2.5" opacity="0.5" />
          <rect x="11" y="22" width="42" height="6" rx="3" fill={shade(hat, 0.88)} {...line} />
        </g>
      )}
    </Svg>
  )
}

export type GlyphName =
  | 'horn' | 'mic' | 'micOff' | 'sound' | 'soundOff' | 'music' | 'musicOff' | 'pause' | 'play' | 'paint' | 'keyboard'
  | 'star' | 'coin' | 'hand' | 'back' | 'check' | 'fullscreen' | 'games' | 'stop' | 'question' | 'lock'

const Slash = () => (
  <g>
    <path d="M8 56L56 8" stroke={INK} strokeWidth="9" strokeLinecap="round" />
    <path d="M8 56L56 8" stroke="#e03a3e" strokeWidth="4.5" strokeLinecap="round" />
  </g>
)

const Speaker = () => (
  <g>
    <path d="M8 24H18L30 14V50L18 40H8Z" fill="#fff" {...line} />
  </g>
)

const Mic = () => (
  <g>
    <rect x="22" y="6" width="20" height="30" rx="10" fill="#fff" {...line} />
    <path d="M28 14H36M28 20H36M28 26H36" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    <path d="M14 28Q14 46 32 46Q50 46 50 28" fill="none" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
    <path d="M32 46V56M22 56H42" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
  </g>
)

/** The small flat pictures that are not about the world. */
export function Glyph({ name, colour }: { name: GlyphName; colour?: string }) {
  switch (name) {
    case 'horn':
      return (
        <Svg>
          <path d="M8 24H18L38 10V54L18 40H8Z" fill={colour ?? "#fff"} {...line} />
          <rect x="12" y="40" width="9" height="12" rx="3" fill={PALETTE.darkMetal} {...line} strokeWidth={2.5} />
          <path d="M46 22Q52 32 46 42M52 14Q62 32 52 50" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        </Svg>
      )
    case 'mic':
      return (
        <Svg>
          <Mic />
        </Svg>
      )
    case 'micOff':
      return (
        <Svg>
          <Mic />
          <Slash />
        </Svg>
      )
    case 'sound':
    case 'soundOff':
      return (
        <Svg>
          <Speaker />
          {name === 'sound' ? <path d="M38 22Q46 32 38 42M44 14Q58 32 44 50" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" /> : <Slash />}
        </Svg>
      )
    case 'music':
    case 'musicOff':
      return (
        <Svg>
          <path d="M24 46V14L50 8V40" stroke={INK} strokeWidth="4" fill="none" strokeLinejoin="round" />
          <path d="M24 14L50 8V20L24 26Z" fill="#fff" {...line} />
          <ellipse cx="17" cy="47" rx="9" ry="7" fill="#fff" {...line} />
          <ellipse cx="43" cy="41" rx="9" ry="7" fill="#fff" {...line} />
          {name === 'musicOff' ? <Slash /> : null}
        </Svg>
      )
    case 'pause':
      return (
        <Svg>
          <rect x="14" y="10" width="13" height="44" rx="4" fill="#fff" {...line} />
          <rect x="37" y="10" width="13" height="44" rx="4" fill="#fff" {...line} />
        </Svg>
      )
    case 'play':
      return (
        <Svg>
          <path d="M16 8L54 32L16 56Z" fill="#fff" {...line} strokeWidth={3.5} />
        </Svg>
      )
    case 'paint':
      return (
        <Svg>
          <path d="M12 22H52L47 56H17Z" fill={colour ?? '#ff6fa8'} {...line} />
          <ellipse cx="32" cy="22" rx="20" ry="6" fill={shade(colour ?? '#ff6fa8', 1.25)} {...line} />
          <path d="M12 22Q32 2 52 22" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />
          <path d="M26 30V40M38 32V46" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </Svg>
      )
    case 'keyboard':
      return (
        <Svg>
          <rect x="3" y="14" width="58" height="36" rx="6" fill="#fff" {...line} />
          {[0, 1, 2, 3, 4].map((i) => <rect key={`a${i}`} x={9 + i * 10} y="20" width="7" height="7" rx="1.5" fill={INK} />)}
          {[0, 1, 2, 3, 4].map((i) => <rect key={`b${i}`} x={11 + i * 10} y="30" width="7" height="7" rx="1.5" fill={INK} />)}
          <rect x="16" y="40" width="32" height="6" rx="2" fill={INK} />
        </Svg>
      )
    case 'star':
      return (
        <Svg>
          <path d="M32 4L40 23L60 24L45 38L50 58L32 47L14 58L19 38L4 24L24 23Z" fill={colour ?? GOLD} {...line} strokeWidth={3.5} />
          <path d="M24 20L32 12" stroke="#fff" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
        </Svg>
      )
    case 'coin':
      return (
        <Svg>
          <circle cx="32" cy="32" r="26" fill={GOLD} {...line} strokeWidth={3.5} />
          <circle cx="32" cy="32" r="17" fill="#ffd95a" stroke="#c98f00" strokeWidth="3" />
          <path d="M32 21L35 29L43 29L37 34L39 42L32 37L25 42L27 34L21 29L29 29Z" fill="#fff7e6" stroke="#c98f00" strokeWidth="1.8" strokeLinejoin="round" />
        </Svg>
      )
    case 'hand':
      return (
        <Svg>
          <path d="M26 30V10q0-5 5-5t5 5V28" fill="#fff" {...line} />
          <path d="M36 27q0-4 5-4t5 4v2q0-4 5-4t5 4v14q0 14-14 16h-6Q22 59 18 51L10 38q-2-5 3-6t7 3l6 7V30" fill="#fff" {...line} />
          <path d="M41 29V37M51 29V37" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
        </Svg>
      )
    case 'back':
      return (
        <Svg>
          <path d="M34 10L12 32L34 54V40H54V24H34Z" fill="#fff" {...line} strokeWidth={3.5} />
        </Svg>
      )
    case 'check':
      return (
        <Svg>
          <path d="M8 34L24 50L56 14" stroke={INK} strokeWidth="13" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 34L24 50L56 14" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )
    case 'fullscreen':
      return (
        <Svg>
          <path d="M8 22V8H22M42 8H56V22M56 42V56H42M22 56H8V42" stroke={INK} strokeWidth="11" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M8 22V8H22M42 8H56V22M56 42V56H42M22 56H8V42" stroke="#fff" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      )
    case 'games':
      return (
        <Svg>
          {[[8, 8, '#e03a3e'], [36, 8, '#5ec8ff'], [8, 36, '#7fe07a'], [36, 36, GOLD]].map(([x, y, f]) => <rect key={`${x}${y}`} x={x as number} y={y as number} width="20" height="20" rx="5" fill={f as string} {...line} />)}
        </Svg>
      )
    case 'stop':
      return (
        <Svg>
          <path d="M20 5H44L59 20V44L44 59H20L5 44V20Z" fill="#e03a3e" {...line} />
          <rect x="16" y="26" width="32" height="12" rx="3" fill="#fff" stroke={INK} strokeWidth="2.5" />
        </Svg>
      )
    case 'question':
      return (
        <Svg>
          <path d="M20 22Q20 8 32 8Q46 8 46 20Q46 28 36 34Q32 37 32 42" stroke={INK} strokeWidth="13" fill="none" strokeLinecap="round" />
          <path d="M20 22Q20 8 32 8Q46 8 46 20Q46 28 36 34Q32 37 32 42" stroke="#fff" strokeWidth="7" fill="none" strokeLinecap="round" />
          <circle cx="32" cy="54" r="6.5" fill="#fff" {...line} />
        </Svg>
      )
    case 'lock':
      return (
        <Svg>
          <path d="M20 28V20Q20 8 32 8Q44 8 44 20V28" stroke={INK} strokeWidth="5" fill="none" />
          <rect x="12" y="28" width="40" height="28" rx="6" fill={GOLD} {...line} />
          <circle cx="32" cy="42" r="4" fill={INK} />
        </Svg>
      )
  }
}

/** A hard hat on its own, for the hat picker. */
export function HatIcon({ colour }: { colour: string }) {
  return (
    <Svg>
      <path d="M10 40Q10 12 32 12Q54 12 54 40Z" fill={colour} {...line} />
      <path d="M32 12V40" stroke={INK} strokeWidth="2.5" opacity="0.5" />
      <path d="M20 34Q22 22 28 18" stroke="#fff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
      <rect x="4" y="38" width="56" height="10" rx="5" fill={shade(colour, 0.88)} {...line} />
    </Svg>
  )
}
