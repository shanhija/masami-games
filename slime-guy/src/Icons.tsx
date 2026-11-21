import { Children, cloneElement, createContext, useContext, useId, type ReactElement, type ReactNode, type SVGProps } from 'react'

import { BABY_COLOURS, ITEMS, SLIME_COLOURS, type ItemId, type Pattern, type SlimeColour, type Slot } from './game/closet'
import { clamp01 } from './game/math'
import { ANIMALS } from './game/model'
import { palette } from './scene/look'

/**
 * Every picture the HUD uses, as flat SVG, so a child never needs a word. Each is drawn in
 * the same colours as the 3D thing it stands for and wears one dark ink line around it,
 * so it reads over sky, water and the paper-white panels alike. Every icon is `size` px
 * square.
 */
const INK = palette.ink
const LINE = 0.08
const WHITE = '#ffffff'
const CREAM = '#fff6ea'
const LEAF = '#5ec25a'
const LENS = '#dcf2ff'
/** A thing not found yet: every part in one flat dark shade with no details, a shadow of itself. */
const SHADOW = '#4e4769'

/** A detail drawn on top of a solid: a seam, a smile, a whisker. */
const ink = { stroke: INK, strokeWidth: LINE, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

type Shape = ReactElement<SVGProps<SVGElement>>

/** How the shapes draw: in full, in their colours without the small details (the wardrobe tabs), or as one dark silhouette. */
type Mode = 'full' | 'plain' | 'shadow'
const DrawMode = createContext<Mode>('full')

/** a and b blended, t of the way to b; both '#rrggbb'. */
function mix(a: string, b: string, t: number) {
  if (!/^#[0-9a-f]{6}$/i.test(a) || !/^#[0-9a-f]{6}$/i.test(b)) throw new Error(`mix needs #rrggbb colours, got ${a} and ${b}`)
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t)
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`
}
const darker = (c: string) => mix(c, INK, 0.28)
const lighter = (c: string) => mix(c, WHITE, 0.45)

/** Numbers in path data, cut to three decimals. */
const n = (v: number) => Math.round(v * 1000) / 1000

const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M ${n(cx - rx)},${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)},${n(cy)} A ${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)},${n(cy)} Z`

const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M ${n(x + r)},${n(y)} H ${n(x + w - r)} A ${r} ${r} 0 0 1 ${n(x + w)},${n(y + r)} V ${n(y + h - r)} A ${r} ${r} 0 0 1 ${n(x + w - r)},${n(y + h)} H ${n(x + r)} A ${r} ${r} 0 0 1 ${n(x)},${n(y + h - r)} V ${n(y + r)} A ${r} ${r} 0 0 1 ${n(x + r)},${n(y)} Z`

/** A five-pointed star, one point up. */
function starPath(cx: number, cy: number, outer: number, inner: number) {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const r = i % 2 === 0 ? outer : inner
    pts.push(`${n(cx + Math.cos(a) * r)},${n(cy + Math.sin(a) * r)}`)
  }
  return `M ${pts.join(' L ')} Z`
}

/** A four-pointed twinkle with curved sides. */
const sparkle = (x: number, y: number, s: number) =>
  `M ${n(x)},${n(y - s)} Q ${n(x)},${n(y)} ${n(x + s)},${n(y)} Q ${n(x)},${n(y)} ${n(x)},${n(y + s)} Q ${n(x)},${n(y)} ${n(x - s)},${n(y)} Q ${n(x)},${n(y)} ${n(x)},${n(y - s)} Z`

/** A heart s across, its notch at (cx, cy - 0.34 s). */
function heartPath(cx: number, cy: number, s: number) {
  const p = (x: number, y: number) => `${n(cx + x * s)},${n(cy + y * s)}`
  return `M ${p(0, 0.42)} C ${p(-0.08, 0.34)} ${p(-0.5, 0.08)} ${p(-0.5, -0.18)} C ${p(-0.5, -0.42)} ${p(-0.3, -0.52)} ${p(-0.17, -0.52)} C ${p(-0.07, -0.52)} ${p(0, -0.45)} ${p(0, -0.34)} C ${p(0, -0.45)} ${p(0.07, -0.52)} ${p(0.17, -0.52)} C ${p(0.3, -0.52)} ${p(0.5, -0.42)} ${p(0.5, -0.18)} C ${p(0.5, 0.08)} ${p(0.08, 0.34)} ${p(0, 0.42)} Z`
}

/** An id unique on the page, for the clip paths and gradients that several icons draw at once. */
function useSvgId() {
  return `sg${useId().replace(/[^A-Za-z0-9]/g, '')}`
}

/** The square every icon is drawn in: two units across with room for the line. */
function Icon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="-1.08 -1.08 2.16 2.16" aria-hidden>
      {children}
    </svg>
  )
}

/**
 * Shapes drawn twice: first fat and inky, then in their own colours on top, so the group
 * shares one outline with no seams inside. Two Solids on top of each other keep the line
 * between them. As a silhouette, both passes are the shadow shade.
 */
function Solid({ children }: { children: ReactNode }) {
  const mode = useContext(DrawMode)
  const shapes = Children.toArray(children) as Shape[]
  const rim = mode === 'shadow' ? SHADOW : INK
  return (
    <>
      {shapes.map((s, i) => cloneElement(s, { key: `ink${i}`, fill: rim, stroke: rim, strokeWidth: LINE * 2, strokeLinejoin: 'round', strokeLinecap: 'round' }))}
      {shapes.map((s, i) => cloneElement(s, mode === 'shadow' ? { key: `fill${i}`, stroke: 'none', fill: SHADOW } : { key: `fill${i}`, stroke: 'none' }))}
    </>
  )
}

/** The small things on a solid (seams, prints, faces): only drawn in full. */
function Detail({ children }: { children: ReactNode }) {
  return useContext(DrawMode) === 'full' ? <>{children}</> : null
}

/** A band drawn as a fat line with an ink rim: a bag's handle or strap. */
function Strap({ d, width, colour }: { d: string; width: number; colour: string }) {
  const mode = useContext(DrawMode)
  return (
    <>
      <path d={d} fill="none" stroke={mode === 'shadow' ? SHADOW : INK} strokeWidth={width + LINE * 2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={mode === 'shadow' ? SHADOW : colour} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

/** Children cut to the inside of the path `d`: stripes on a shirt, stars in the jar. */
function Clipped({ d, children }: { d: string; children: ReactNode }) {
  const id = useSvgId()
  return (
    <>
      <clipPath id={id}>
        <path d={d} />
      </clipPath>
      <g clipPath={`url(#${id})`}>{children}</g>
    </>
  )
}

const PETALS = [0, 1, 2, 3, 4].map((i) => -Math.PI / 2 + (i * Math.PI * 2) / 5)

/** A flower with an outline (a wreath's flowers): five round petals and a yellow middle. */
function Bloom({ x, y, r, petal }: { x: number; y: number; r: number; petal: string }) {
  return (
    <>
      <Solid>
        {PETALS.map((a) => (
          <circle key={a} cx={n(x + Math.cos(a) * r * 0.52)} cy={n(y + Math.sin(a) * r * 0.52)} r={n(r * 0.5)} fill={petal} />
        ))}
      </Solid>
      <Detail>
        <circle cx={x} cy={y} r={n(r * 0.3)} fill={palette.ribbon} />
      </Detail>
    </>
  )
}

/** A flower printed on cloth: no outline, so it reads as a pattern. */
function Print({ x, y, r, petal }: { x: number; y: number; r: number; petal: string }) {
  return (
    <>
      {PETALS.map((a) => (
        <circle key={a} cx={n(x + Math.cos(a) * r * 0.52)} cy={n(y + Math.sin(a) * r * 0.52)} r={n(r * 0.46)} fill={petal} />
      ))}
      <circle cx={x} cy={y} r={n(r * 0.3)} fill={palette.ribbon} />
    </>
  )
}

/** Two dot eyes with a white shine, for the animals. */
function DotEyes({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      {[-x, x].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={y} r={r} fill={INK} />
          <circle cx={n(cx - r * 0.3)} cy={n(y - r * 0.35)} r={n(r * 0.36)} fill={WHITE} />
        </g>
      ))}
    </>
  )
}

// ------------------------------------------------------------------ things to wear

/** A short-sleeved shirt from the front, its neck scooped. */
const TEE = 'M -0.34,-0.74 L -0.9,-0.46 L -0.7,-0.02 L -0.52,-0.1 L -0.52,0.82 L 0.52,0.82 L 0.52,-0.1 L 0.7,-0.02 L 0.9,-0.46 L 0.34,-0.74 Q 0,-0.48 -0.34,-0.74 Z'
/** The same with long sleeves. */
const LONG = 'M -0.34,-0.74 L -0.82,-0.5 L -0.98,0.58 L -0.7,0.64 L -0.56,0.02 L -0.52,0.84 L 0.52,0.84 L 0.56,0.02 L 0.7,0.64 L 0.98,0.58 L 0.82,-0.5 L 0.34,-0.74 Q 0,-0.48 -0.34,-0.74 Z'
/** The collar's rib, just inside the neck. */
const COLLAR = 'M -0.29,-0.71 Q 0,-0.43 0.29,-0.71'
/** A skirt flaring from the waist, under its waistband. */
const SKIRT = 'M -0.5,-0.42 L 0.5,-0.42 L 0.86,0.56 Q 0,0.76 -0.86,0.56 Z'
const SCALLOP_SKIRT =
  'M -0.5,-0.42 L 0.5,-0.42 L 0.86,0.5 Q 0.8,0.68 0.62,0.57 Q 0.5,0.74 0.31,0.62 Q 0.16,0.76 0,0.64 Q -0.16,0.76 -0.31,0.62 Q -0.5,0.74 -0.62,0.57 Q -0.8,0.68 -0.86,0.5 Z'
const GOWN = 'M -0.38,-0.56 L 0.38,-0.56 C 0.54,-0.1 0.84,0.42 0.95,0.76 Q 0,0.98 -0.95,0.76 C -0.84,0.42 -0.54,-0.1 -0.38,-0.56 Z'
const TUTU_BACK =
  'M -0.5,-0.24 L 0.5,-0.24 L 0.98,0.34 Q 0.9,0.54 0.72,0.44 Q 0.6,0.64 0.4,0.5 Q 0.22,0.68 0,0.54 Q -0.22,0.68 -0.4,0.5 Q -0.6,0.64 -0.72,0.44 Q -0.9,0.54 -0.98,0.34 Z'
const TUTU_FRONT =
  'M -0.48,-0.24 L 0.48,-0.24 L 0.8,0.2 Q 0.72,0.38 0.54,0.3 Q 0.42,0.48 0.24,0.36 Q 0.12,0.5 0,0.38 Q -0.12,0.5 -0.24,0.36 Q -0.42,0.48 -0.54,0.3 Q -0.72,0.38 -0.8,0.2 Z'
const WAISTBAND = roundRect(-0.56, -0.66, 1.12, 0.26, 0.08)

/** The pearls of the necklace, round a hanging loop. */
const PEARLS: [number, number][] = Array.from({ length: 15 }, (_, i) => {
  const a = ((-14 + (i * 208) / 14) * Math.PI) / 180
  return [n(Math.cos(a) * 0.78), n(-0.42 + Math.sin(a) * 0.98)]
})

/** The fringe at the scarf's hanging end. */
const FRINGE = [0.24, 0.34, 0.44, 0.54].map((x) => `M ${x},${n(0.83 - (x - 0.2) * 0.08)} l 0.02,0.13`).join(' ')

/** One thing to wear in colour `c`, the darker and lighter shades of it worked out here. */
function itemShapes(item: ItemId, c: string): ReactNode {
  const d = darker(c)
  const l = lighter(c)
  switch (item) {
    // -------------------------------------------------------------- hats
    case 'cap':
      return (
        <>
          <Solid>
            <path d="M -0.84,0.32 C -0.86,-0.4 -0.46,-0.72 -0.02,-0.72 C 0.44,-0.72 0.76,-0.4 0.74,0.32 Z" fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.03,-0.7 C -0.32,-0.46 -0.4,-0.1 -0.38,0.3 M -0.01,-0.7 C 0.26,-0.46 0.32,-0.1 0.3,0.3" fill="none" {...ink} />
            <path d="M -0.64,-0.16 C -0.58,-0.4 -0.44,-0.54 -0.26,-0.62" fill="none" stroke={l} strokeWidth={0.1} strokeLinecap="round" />
            <path d={starPath(-0.04, -0.12, 0.17, 0.075)} fill={WHITE} />
          </Detail>
          <Solid>
            <path d="M 0.12,0.16 C 0.56,0.04 0.96,0.1 0.97,0.3 C 0.98,0.46 0.56,0.52 0.12,0.46 Z" fill={d} />
          </Solid>
          <Solid>
            <circle cx={-0.02} cy={-0.74} r={0.1} fill={d} />
          </Solid>
        </>
      )
    case 'beanie':
      return (
        <>
          <Solid>
            <circle cx={0} cy={-0.68} r={0.21} fill={CREAM} />
            <circle cx={-0.15} cy={-0.6} r={0.16} fill={CREAM} />
            <circle cx={0.15} cy={-0.6} r={0.16} fill={CREAM} />
          </Solid>
          <Solid>
            <path d="M -0.76,0.3 C -0.78,-0.36 -0.42,-0.58 0,-0.58 C 0.42,-0.58 0.78,-0.36 0.76,0.3 Z" fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.5,-0.08 Q -0.42,-0.36 -0.2,-0.48" fill="none" stroke={l} strokeWidth={0.1} strokeLinecap="round" />
            <path d="M -0.3,0.08 l 0.08,-0.1 l 0.08,0.1 M 0.14,0.08 l 0.08,-0.1 l 0.08,0.1 M -0.08,-0.2 l 0.08,-0.1 l 0.08,0.1" fill="none" stroke={d} strokeWidth={0.06} strokeLinecap="round" strokeLinejoin="round" />
          </Detail>
          <Solid>
            <path d={roundRect(-0.88, 0.12, 1.76, 0.5, 0.18)} fill={d} />
          </Solid>
          <Detail>
            <path d="M -0.6,0.2 V 0.54 M -0.36,0.2 V 0.54 M -0.12,0.2 V 0.54 M 0.12,0.2 V 0.54 M 0.36,0.2 V 0.54 M 0.6,0.2 V 0.54" stroke={c} strokeWidth={0.08} strokeLinecap="round" />
          </Detail>
        </>
      )
    case 'sunhat':
      return (
        <>
          <Solid>
            <path d={ellipse(0, 0.3, 0.97, 0.34)} fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.78,0.42 Q 0,0.68 0.78,0.42" fill="none" stroke={d} strokeWidth={0.045} strokeLinecap="round" />
          </Detail>
          <Solid>
            <path d="M -0.52,0.3 C -0.56,-0.48 0.56,-0.48 0.52,0.3 Q 0,0.44 -0.52,0.3 Z" fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.535,0.08 Q 0,0.2 0.535,0.08 L 0.525,0.27 Q 0,0.4 -0.525,0.27 Z" fill={palette.boxRed} />
            <Print x={0.3} y={0.19} r={0.2} petal={WHITE} />
            <path d="M -0.36,-0.1 Q -0.3,-0.24 -0.16,-0.3" fill="none" stroke={l} strokeWidth={0.08} strokeLinecap="round" />
          </Detail>
        </>
      )
    case 'crown':
      return (
        <>
          <Solid>
            <path d="M -0.84,0.56 L -0.86,-0.36 L -0.44,0.02 L 0,-0.6 L 0.44,0.02 L 0.86,-0.36 L 0.84,0.56 Z" fill={c} />
            <circle cx={-0.86} cy={-0.46} r={0.11} fill={c} />
            <circle cx={0} cy={-0.72} r={0.12} fill={c} />
            <circle cx={0.86} cy={-0.46} r={0.11} fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.66,0.12 L -0.68,-0.06 M -0.2,-0.12 L -0.06,-0.32" fill="none" stroke={l} strokeWidth={0.09} strokeLinecap="round" />
            <path d={sparkle(0, -0.08, 0.14)} fill={WHITE} />
          </Detail>
          <Solid>
            <path d={roundRect(-0.9, 0.28, 1.8, 0.34, 0.08)} fill={d} />
          </Solid>
          <Detail>
            <circle cx={0} cy={0.45} r={0.12} fill="#ff3b6b" {...ink} strokeWidth={0.05} />
            <circle cx={-0.52} cy={0.45} r={0.09} fill="#5ec8ff" {...ink} strokeWidth={0.05} />
            <circle cx={0.52} cy={0.45} r={0.09} fill="#7fe07a" {...ink} strokeWidth={0.05} />
          </Detail>
        </>
      )
    case 'flowers':
      return (
        <>
          <Solid>
            <path d={`${ellipse(0, 0.12, 0.84, 0.44)} ${ellipse(0, 0.12, 0.66, 0.27)}`} fillRule="evenodd" fill={LEAF} />
          </Solid>
          <Bloom x={-0.42} y={-0.24} r={0.24} petal={WHITE} />
          <Bloom x={0.42} y={-0.24} r={0.24} petal={l} />
          <Bloom x={-0.74} y={0.14} r={0.3} petal={c} />
          <Bloom x={0.76} y={0.14} r={0.3} petal={c} />
          <Bloom x={-0.38} y={0.46} r={0.32} petal={l} />
          <Bloom x={0.4} y={0.46} r={0.32} petal={WHITE} />
          <Bloom x={0.01} y={0.58} r={0.34} petal={c} />
        </>
      )
    case 'bow':
      return (
        <>
          <Solid>
            <path d="M -0.08,0.04 L -0.42,0.8 L -0.2,0.72 L -0.04,0.88 L 0.06,0.1 Z" fill={d} />
            <path d="M 0.08,0.04 L 0.42,0.8 L 0.2,0.72 L 0.04,0.88 L -0.06,0.1 Z" fill={d} />
          </Solid>
          <Solid>
            <path d="M -0.06,-0.02 C -0.32,-0.62 -0.97,-0.66 -0.95,-0.12 C -0.93,0.36 -0.36,0.46 -0.06,0.08 Z" fill={c} />
            <path d="M 0.06,-0.02 C 0.32,-0.62 0.97,-0.66 0.95,-0.12 C 0.93,0.36 0.36,0.46 0.06,0.08 Z" fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.22,0.02 C -0.44,-0.2 -0.62,-0.24 -0.76,-0.18 M 0.22,0.02 C 0.44,-0.2 0.62,-0.24 0.76,-0.18" fill="none" {...ink} strokeWidth={0.06} />
            <path d="M -0.8,-0.3 Q -0.72,-0.44 -0.56,-0.44" fill="none" stroke={l} strokeWidth={0.09} strokeLinecap="round" />
          </Detail>
          <Solid>
            <path d={roundRect(-0.18, -0.22, 0.36, 0.42, 0.13)} fill={d} />
          </Solid>
        </>
      )
    // -------------------------------------------------------------- glasses
    case 'roundGlasses':
      return (
        <>
          <Solid>
            <circle cx={-0.46} cy={0.04} r={0.3} fill={LENS} />
            <circle cx={0.46} cy={0.04} r={0.3} fill={LENS} />
          </Solid>
          <Detail>
            <path d="M -0.62,-0.06 Q -0.56,-0.16 -0.46,-0.18 M 0.3,-0.06 Q 0.36,-0.16 0.46,-0.18" fill="none" stroke={WHITE} strokeWidth={0.08} strokeLinecap="round" />
          </Detail>
          <Solid>
            <path d={`${ellipse(-0.46, 0.04, 0.4, 0.4)} ${ellipse(-0.46, 0.04, 0.29, 0.29)}`} fillRule="evenodd" fill={c} />
            <path d={`${ellipse(0.46, 0.04, 0.4, 0.4)} ${ellipse(0.46, 0.04, 0.29, 0.29)}`} fillRule="evenodd" fill={c} />
            <path d="M -0.1,-0.06 Q 0,-0.18 0.1,-0.06 L 0.1,0.04 Q 0,-0.06 -0.1,0.04 Z" fill={c} />
            <path d="M -0.84,-0.04 L -0.97,-0.2 L -0.93,-0.27 L -0.8,-0.14 Z" fill={c} />
            <path d="M 0.84,-0.04 L 0.97,-0.2 L 0.93,-0.27 L 0.8,-0.14 Z" fill={c} />
          </Solid>
        </>
      )
    case 'sunglasses':
      return (
        <>
          <Solid>
            <path d="M -0.9,-0.26 L -0.1,-0.26 L -0.13,0.1 Q -0.2,0.42 -0.5,0.42 Q -0.82,0.42 -0.88,0.1 Z" fill="#3d3165" />
            <path d="M 0.9,-0.26 L 0.1,-0.26 L 0.13,0.1 Q 0.2,0.42 0.5,0.42 Q 0.82,0.42 0.88,0.1 Z" fill="#3d3165" />
          </Solid>
          <Detail>
            <path d="M -0.7,0.1 L -0.48,-0.14 M -0.6,0.24 L -0.32,-0.06 M 0.3,0.1 L 0.52,-0.14 M 0.4,0.24 L 0.68,-0.06" stroke={mix('#3d3165', WHITE, 0.6)} strokeWidth={0.07} strokeLinecap="round" />
          </Detail>
          <Solid>
            <path d={roundRect(-0.96, -0.36, 1.92, 0.16, 0.08)} fill={c} />
          </Solid>
        </>
      )
    case 'heartGlasses':
      return (
        <>
          <Solid>
            <path d={heartPath(-0.47, 0.06, 0.9)} fill={c} />
            <path d={heartPath(0.47, 0.06, 0.9)} fill={c} />
            <path d="M -0.12,-0.16 Q 0,-0.26 0.12,-0.16 L 0.12,-0.06 Q 0,-0.16 -0.12,-0.06 Z" fill={c} />
          </Solid>
          <Solid>
            <path d={heartPath(-0.47, 0.06, 0.58)} fill="#ffc6d9" />
            <path d={heartPath(0.47, 0.06, 0.58)} fill="#ffc6d9" />
          </Solid>
          <Detail>
            <path d="M -0.66,-0.08 Q -0.64,-0.18 -0.56,-0.2 M 0.28,-0.08 Q 0.3,-0.18 0.38,-0.2" fill="none" stroke={WHITE} strokeWidth={0.08} strokeLinecap="round" />
          </Detail>
        </>
      )
    // -------------------------------------------------------------- shirts
    case 'tee':
      return (
        <>
          <Solid>
            <path d={TEE} fill={c} />
          </Solid>
          <Detail>
            <path d={COLLAR} fill="none" stroke={d} strokeWidth={0.1} strokeLinecap="round" />
            <path d="M -0.84,-0.34 L -0.68,-0.06 M 0.84,-0.34 L 0.68,-0.06" stroke={d} strokeWidth={0.07} strokeLinecap="round" />
            <path d={starPath(0, 0.2, 0.3, 0.13)} fill={palette.star} {...ink} strokeWidth={0.06} />
          </Detail>
        </>
      )
    case 'stripes':
      return (
        <>
          <Solid>
            <path d={TEE} fill={c} />
          </Solid>
          <Detail>
            <Clipped d={TEE}>
              {[-0.5, -0.18, 0.14, 0.46].map((y) => (
                <rect key={y} x={-1} y={y} width={2} height={0.15} fill={WHITE} />
              ))}
            </Clipped>
            <path d={COLLAR} fill="none" stroke={d} strokeWidth={0.1} strokeLinecap="round" />
          </Detail>
        </>
      )
    case 'hoodie':
      return (
        <>
          <Solid>
            <path d={ellipse(0, -0.68, 0.46, 0.25)} fill={d} />
          </Solid>
          <Solid>
            <path d={LONG} fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.34,0.34 H 0.34 L 0.44,0.7 H -0.44 Z" fill={d} {...ink} strokeWidth={0.06} />
            <path d="M -0.12,-0.6 V -0.2 M 0.12,-0.6 V -0.2" stroke={WHITE} strokeWidth={0.07} strokeLinecap="round" />
            <path d="M -0.96,0.46 L -0.72,0.52 M 0.96,0.46 L 0.72,0.52" stroke={d} strokeWidth={0.09} strokeLinecap="round" />
          </Detail>
        </>
      )
    case 'sweater':
      return (
        <>
          <Solid>
            <path d={LONG} fill={c} />
          </Solid>
          <Detail>
            <Clipped d={LONG}>
              <rect x={-1} y={-0.16} width={2} height={0.28} fill={WHITE} />
              <path d="M -1,0.04 L -0.88,-0.08 L -0.76,0.04 L -0.64,-0.08 L -0.52,0.04 L -0.4,-0.08 L -0.28,0.04 L -0.16,-0.08 L -0.04,0.04 L 0.08,-0.08 L 0.2,0.04 L 0.32,-0.08 L 0.44,0.04 L 0.56,-0.08 L 0.68,0.04 L 0.8,-0.08 L 0.92,0.04" fill="none" stroke={c} strokeWidth={0.07} strokeLinejoin="round" />
              <rect x={-1} y={0.66} width={2} height={0.2} fill={d} />
            </Clipped>
            <path d={COLLAR} fill="none" stroke={d} strokeWidth={0.12} strokeLinecap="round" />
            <path d="M -0.96,0.46 L -0.72,0.52 M 0.96,0.46 L 0.72,0.52" stroke={d} strokeWidth={0.09} strokeLinecap="round" />
          </Detail>
        </>
      )
    case 'flowerShirt':
      return (
        <>
          <Solid>
            <path d={TEE} fill={c} />
          </Solid>
          <Detail>
            <Print x={-0.3} y={0.1} r={0.3} petal={WHITE} />
            <Print x={0.3} y={-0.2} r={0.26} petal="#ff8fc8" />
            <Print x={0.26} y={0.52} r={0.28} petal="#ffd23f" />
            <Print x={-0.66} y={-0.38} r={0.2} petal="#ff8fc8" />
            <path d="M 0,-0.38 V 0.82" stroke={d} strokeWidth={0.05} />
          </Detail>
          <Solid>
            <path d="M -0.36,-0.75 C -0.22,-0.6 -0.1,-0.5 0,-0.36 L -0.24,-0.34 L -0.5,-0.64 Z" fill={l} />
            <path d="M 0.36,-0.75 C 0.22,-0.6 0.1,-0.5 0,-0.36 L 0.24,-0.34 L 0.5,-0.64 Z" fill={l} />
          </Solid>
        </>
      )
    case 'glitterShirt':
      return (
        <>
          <Solid>
            <path d={TEE} fill={c} />
          </Solid>
          <Detail>
            <path d={COLLAR} fill="none" stroke={d} strokeWidth={0.1} strokeLinecap="round" />
            <path d={sparkle(-0.2, -0.16, 0.22)} fill={WHITE} />
            <path d={sparkle(0.24, 0.26, 0.26)} fill={palette.star} />
            <path d={sparkle(0.3, -0.34, 0.13)} fill={palette.star} />
            <path d={sparkle(-0.26, 0.52, 0.16)} fill={WHITE} />
            <path d={sparkle(-0.7, -0.38, 0.1)} fill={WHITE} />
            <path d={sparkle(0.7, -0.38, 0.1)} fill={WHITE} />
            <circle cx={0.02} cy={0.04} r={0.04} fill={WHITE} />
            <circle cx={-0.34} cy={0.22} r={0.035} fill={palette.star} />
            <circle cx={0.36} cy={0.62} r={0.04} fill={WHITE} />
          </Detail>
        </>
      )
    // -------------------------------------------------------------- skirts
    case 'denimSkirt':
      return (
        <>
          <Solid>
            <path d={SKIRT} fill={c} />
          </Solid>
          <Detail>
            <path d="M 0,-0.4 V 0.66" stroke={d} strokeWidth={0.06} />
            <path d="M -0.44,-0.32 Q -0.36,-0.08 -0.14,-0.04 M 0.44,-0.32 Q 0.36,-0.08 0.14,-0.04 M -0.8,0.47 Q 0,0.64 0.8,0.47" fill="none" stroke={palette.ribbon} strokeWidth={0.045} strokeDasharray="0.08 0.06" strokeLinecap="round" />
          </Detail>
          <Solid>
            <path d={WAISTBAND} fill={d} />
          </Solid>
          <Detail>
            <circle cx={0} cy={-0.53} r={0.075} fill={palette.gold} {...ink} strokeWidth={0.04} />
          </Detail>
        </>
      )
    case 'flowerSkirt':
      return (
        <>
          <Solid>
            <path d={SCALLOP_SKIRT} fill={c} />
          </Solid>
          <Detail>
            <Print x={-0.32} y={-0.08} r={0.26} petal={WHITE} />
            <Print x={0.3} y={0.06} r={0.28} petal="#ff8fc8" />
            <Print x={-0.48} y={0.42} r={0.24} petal="#ff8fc8" />
            <Print x={0.48} y={0.44} r={0.22} petal={WHITE} />
            <Print x={0.02} y={0.4} r={0.18} petal="#ff7f5e" />
          </Detail>
          <Solid>
            <path d={WAISTBAND} fill={d} />
          </Solid>
        </>
      )
    case 'tutu':
      return (
        <>
          <Solid>
            <path d={TUTU_BACK} fill={d} />
          </Solid>
          <Solid>
            <path d={TUTU_FRONT} fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.3,-0.18 L -0.5,0.3 M 0,-0.18 V 0.32 M 0.3,-0.18 L 0.5,0.3 M -0.62,0.08 L -0.72,0.3 M 0.62,0.08 L 0.72,0.3" stroke={l} strokeWidth={0.06} strokeLinecap="round" />
            <path d={sparkle(-0.62, 0.48, 0.1)} fill={WHITE} />
            <path d={sparkle(0.6, 0.5, 0.08)} fill={WHITE} />
          </Detail>
          <Solid>
            <path d={roundRect(-0.56, -0.48, 1.12, 0.26, 0.1)} fill={l} />
          </Solid>
        </>
      )
    case 'stripeSkirt':
      return (
        <>
          <Solid>
            <path d={SKIRT} fill={c} />
          </Solid>
          <Detail>
            <Clipped d={SKIRT}>
              {[-0.24, 0.06, 0.36].map((y) => (
                <rect key={y} x={-1} y={y} width={2} height={0.14} fill={WHITE} />
              ))}
            </Clipped>
          </Detail>
          <Solid>
            <path d={WAISTBAND} fill={d} />
          </Solid>
        </>
      )
    case 'partySkirt':
      return (
        <>
          <Solid>
            <path d={GOWN} fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.18,-0.5 C -0.28,0 -0.42,0.5 -0.48,0.84 M 0.18,-0.5 C 0.28,0 0.42,0.5 0.48,0.84 M 0,-0.5 V 0.88" fill="none" stroke={l} strokeWidth={0.05} strokeLinecap="round" />
            <path d={sparkle(-0.62, 0.62, 0.1)} fill={palette.star} />
            <path d={sparkle(0.3, 0.32, 0.09)} fill={palette.star} />
            <path d={sparkle(-0.22, 0.12, 0.08)} fill={WHITE} />
            <path d={sparkle(0.66, 0.66, 0.08)} fill={WHITE} />
          </Detail>
          <Solid>
            <path d={roundRect(-0.44, -0.76, 0.88, 0.24, 0.08)} fill={palette.gold} />
          </Solid>
          <Solid>
            <path d="M 0.2,-0.64 L -0.04,-0.84 L -0.06,-0.44 Z" fill="#ff8fc8" />
            <path d="M 0.2,-0.64 L 0.44,-0.84 L 0.46,-0.44 Z" fill="#ff8fc8" />
            <circle cx={0.2} cy={-0.64} r={0.07} fill="#ff8fc8" />
          </Solid>
        </>
      )
    // -------------------------------------------------------------- bags
    case 'backpack':
      return (
        <>
          <Strap d="M -0.3,-0.58 C -0.3,-0.94 0.3,-0.94 0.3,-0.58" width={0.13} colour={d} />
          <Solid>
            <path d={roundRect(-0.66, -0.64, 1.32, 1.52, 0.42)} fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.56,-0.22 Q 0,-0.36 0.56,-0.22" fill="none" stroke={d} strokeWidth={0.06} strokeLinecap="round" />
            <path d="M -0.44,-0.46 Q -0.36,-0.54 -0.22,-0.56" fill="none" stroke={l} strokeWidth={0.08} strokeLinecap="round" />
          </Detail>
          <Solid>
            <path d={roundRect(-0.46, 0.12, 0.92, 0.6, 0.18)} fill={d} />
          </Solid>
          <Detail>
            <path d="M -0.32,0.26 H 0.22" stroke={l} strokeWidth={0.05} strokeDasharray="0.05 0.04" />
            <circle cx={0.3} cy={0.26} r={0.06} fill={palette.gold} {...ink} strokeWidth={0.04} />
          </Detail>
        </>
      )
    case 'shoulderBag':
      return (
        <>
          <Strap d="M -0.58,0.02 C -0.62,-0.98 0.62,-0.98 0.58,0.02" width={0.11} colour={d} />
          <Solid>
            <path d={roundRect(-0.74, -0.12, 1.48, 0.94, 0.24)} fill={c} />
          </Solid>
          <Solid>
            <path d="M -0.74,0.02 Q -0.74,-0.12 -0.58,-0.12 L 0.58,-0.12 Q 0.74,-0.12 0.74,0.02 L 0.74,0.26 Q 0,0.56 -0.74,0.26 Z" fill={d} />
          </Solid>
          <Detail>
            <path d={roundRect(-0.13, 0.28, 0.26, 0.2, 0.05)} fill={palette.gold} {...ink} strokeWidth={0.05} />
            <path d="M -0.5,0.58 Q 0,0.7 0.5,0.58" fill="none" stroke={l} strokeWidth={0.05} strokeDasharray="0.07 0.05" strokeLinecap="round" />
          </Detail>
        </>
      )
    case 'handbag':
      return (
        <>
          <Strap d="M -0.4,-0.1 C -0.44,-0.84 0.44,-0.84 0.4,-0.1" width={0.12} colour={d} />
          <Solid>
            <path d="M -0.7,-0.12 L 0.7,-0.12 Q 0.8,-0.12 0.82,0 L 0.92,0.72 Q 0.94,0.86 0.8,0.86 L -0.8,0.86 Q -0.94,0.86 -0.92,0.72 L -0.82,0 Q -0.8,-0.12 -0.7,-0.12 Z" fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.82,0.1 Q 0,0.42 0.82,0.1" fill="none" stroke={d} strokeWidth={0.06} strokeLinecap="round" />
            <circle cx={0} cy={0.26} r={0.09} fill={palette.gold} {...ink} strokeWidth={0.05} />
            <path d="M -0.66,0.5 Q -0.62,0.66 -0.5,0.72" fill="none" stroke={l} strokeWidth={0.08} strokeLinecap="round" />
          </Detail>
        </>
      )
    case 'teddyBackpack':
      return (
        <>
          <Strap d="M -0.24,-0.62 C -0.24,-0.96 0.24,-0.96 0.24,-0.62" width={0.12} colour={d} />
          <Solid>
            <circle cx={-0.56} cy={-0.5} r={0.26} fill={c} />
            <circle cx={0.56} cy={-0.5} r={0.26} fill={c} />
            <circle cx={0} cy={0.12} r={0.74} fill={c} />
          </Solid>
          <Detail>
            <circle cx={-0.56} cy={-0.5} r={0.13} fill={l} />
            <circle cx={0.56} cy={-0.5} r={0.13} fill={l} />
            <path d={ellipse(0, 0.36, 0.32, 0.24)} fill={l} />
            <path d={ellipse(0, 0.26, 0.12, 0.08)} fill={INK} />
            <path d="M 0,0.3 V 0.4 M -0.12,0.42 Q 0,0.5 0.12,0.42" fill="none" {...ink} strokeWidth={0.05} />
            <DotEyes x={0.27} y={-0.04} r={0.08} />
          </Detail>
        </>
      )
    case 'kittyBackpack':
      return (
        <>
          <Strap d="M -0.24,-0.62 C -0.24,-0.96 0.24,-0.96 0.24,-0.62" width={0.12} colour={d} />
          <Solid>
            <path d="M -0.72,-0.18 L -0.64,-0.88 L -0.18,-0.58 Z" fill={c} />
            <path d="M 0.72,-0.18 L 0.64,-0.88 L 0.18,-0.58 Z" fill={c} />
            <path d={roundRect(-0.76, -0.62, 1.52, 1.48, 0.52)} fill={c} />
          </Solid>
          <Detail>
            <path d="M -0.6,-0.4 L -0.57,-0.72 L -0.34,-0.56 Z M 0.6,-0.4 L 0.57,-0.72 L 0.34,-0.56 Z" fill={l} />
            <path d={ellipse(-0.28, 0.06, 0.09, 0.12)} fill={INK} />
            <path d={ellipse(0.28, 0.06, 0.09, 0.12)} fill={INK} />
            <circle cx={-0.31} cy={0.01} r={0.035} fill={WHITE} />
            <circle cx={0.25} cy={0.01} r={0.035} fill={WHITE} />
            <path d="M -0.08,0.24 L 0.08,0.24 L 0,0.32 Z" fill={d} />
            <path d="M 0,0.32 Q -0.06,0.42 -0.16,0.38 M 0,0.32 Q 0.06,0.42 0.16,0.38 M -0.3,0.28 L -0.64,0.22 M -0.3,0.36 L -0.64,0.4 M 0.3,0.28 L 0.64,0.22 M 0.3,0.36 L 0.64,0.4" fill="none" {...ink} strokeWidth={0.045} />
          </Detail>
        </>
      )
    // -------------------------------------------------------------- around the neck
    case 'pearls':
      return (
        <>
          <Solid>
            {PEARLS.map(([x, y]) => (
              <circle key={`${x},${y}`} cx={x} cy={y} r={0.105} fill={c} />
            ))}
            <circle cx={0} cy={0.7} r={0.16} fill={c} />
          </Solid>
          <Detail>
            {PEARLS.map(([x, y]) => (
              <circle key={`${x},${y}`} cx={n(x - 0.03)} cy={n(y - 0.035)} r={0.035} fill={WHITE} />
            ))}
            <circle cx={-0.05} cy={0.65} r={0.05} fill={WHITE} />
            <circle cx={0} cy={0.7} r={0.16} fill="none" stroke={palette.blush} strokeWidth={0.05} />
          </Detail>
        </>
      )
    case 'scarf':
      return (
        <>
          <Solid>
            <path d="M -0.86,-0.52 Q 0,-0.26 0.86,-0.52 L 0.88,-0.14 Q 0,0.14 -0.88,-0.14 Z" fill={c} />
          </Solid>
          <Detail>
            <Clipped d="M -0.86,-0.52 Q 0,-0.26 0.86,-0.52 L 0.88,-0.14 Q 0,0.14 -0.88,-0.14 Z">
              {[-0.62, -0.3, 0.42, 0.72].map((x) => (
                <rect key={x} x={x} y={-0.6} width={0.12} height={0.8} fill={palette.boxRed} />
              ))}
            </Clipped>
          </Detail>
          <Solid>
            <path d="M 0.04,-0.16 L 0.5,-0.2 L 0.6,0.8 L 0.18,0.84 Z" fill={c} />
          </Solid>
          <Detail>
            <Clipped d="M 0.04,-0.16 L 0.5,-0.2 L 0.6,0.8 L 0.18,0.84 Z">
              {[0.14, 0.42].map((y) => (
                <rect key={y} x={0} y={y} width={0.7} height={0.12} fill={palette.boxRed} transform={`rotate(-6 0.35 ${y})`} />
              ))}
            </Clipped>
            <path d={FRINGE} fill="none" {...ink} strokeWidth={0.06} />
          </Detail>
        </>
      )
    case 'bowTie':
      return (
        <>
          <Solid>
            <path d="M -0.1,-0.12 L -0.78,-0.5 Q -0.94,-0.56 -0.94,-0.38 L -0.94,0.38 Q -0.94,0.56 -0.78,0.5 L -0.1,0.12 Z" fill={c} />
            <path d="M 0.1,-0.12 L 0.78,-0.5 Q 0.94,-0.56 0.94,-0.38 L 0.94,0.38 Q 0.94,0.56 0.78,0.5 L 0.1,0.12 Z" fill={c} />
          </Solid>
          <Detail>
            {[
              [-0.66, -0.16],
              [-0.42, 0.14],
              [-0.74, 0.26],
              [0.66, -0.16],
              [0.42, 0.14],
              [0.74, 0.26],
            ].map(([x, y]) => (
              <circle key={`${x},${y}`} cx={x} cy={y} r={0.075} fill={WHITE} />
            ))}
          </Detail>
          <Solid>
            <path d={roundRect(-0.18, -0.24, 0.36, 0.48, 0.12)} fill={d} />
          </Solid>
        </>
      )
  }
}

/** One thing to wear, drawn in its ITEMS colour; `shadow` draws it as a dark silhouette (not found yet). */
export function ItemIcon({ item, size, shadow }: { item: ItemId; size: number; shadow: boolean }) {
  return (
    <Icon size={size}>
      <DrawMode.Provider value={shadow ? 'shadow' : 'full'}>{itemShapes(item, ITEMS[item].colour)}</DrawMode.Provider>
    </Icon>
  )
}

/** Each wardrobe tab shows one plain thing of its place in its own colour. */
const SLOT_ITEM: Record<Slot, ItemId> = { hat: 'sunhat', glasses: 'roundGlasses', shirt: 'tee', skirt: 'denimSkirt', bag: 'handbag', neck: 'scarf' }
const SLOT_COLOUR: Record<Slot, string> = { hat: '#ffd166', glasses: '#5ec8ff', shirt: '#ff7a7a', skirt: '#c58bff', bag: '#ffb02e', neck: '#7fe07a' }

/** A wardrobe tab: the shape of the place (a hat, glasses, a shirt, a skirt, a bag, a scarf). */
export function SlotIcon({ slot, size }: { slot: Slot; size: number }) {
  return (
    <Icon size={size}>
      <DrawMode.Provider value="plain">{itemShapes(SLOT_ITEM[slot], SLOT_COLOUR[slot])}</DrawMode.Provider>
    </Icon>
  )
}

// ------------------------------------------------------------------ the slime

/** A slime's three colours: the jelly, its shadow side, its shine. */
interface Jelly {
  body: string
  deep: string
  light: string
}

type Pose = 'stand' | 'hide' | 'jump'

/** The jelly's outline in each pose: a round drop; stretched tall in the air; a flat puddle. */
const BODY: Record<Pose, string> = {
  stand: 'M -0.8,0.76 C -0.98,0.76 -0.98,0.38 -0.9,0.1 C -0.76,-0.42 -0.42,-0.68 0,-0.68 C 0.42,-0.68 0.76,-0.42 0.9,0.1 C 0.98,0.38 0.98,0.76 0.8,0.76 Z',
  jump: 'M -0.6,0.5 C -0.8,0.5 -0.82,0.16 -0.76,-0.12 C -0.64,-0.64 -0.36,-0.9 0,-0.9 C 0.36,-0.9 0.64,-0.64 0.76,-0.12 C 0.82,0.16 0.8,0.5 0.6,0.5 Z',
  hide: 'M -0.96,0.62 C -0.98,0.4 -0.62,0.26 0,0.26 C 0.62,0.26 0.98,0.4 0.96,0.62 C 0.94,0.82 0.6,0.86 0,0.86 C -0.6,0.86 -0.94,0.82 -0.96,0.62 Z',
}

/** Where each pose puts the face: the eyes (centre x either side, y, radius) and where the pupils look, the mouth's y, the blush, the shine. */
const FACE: Record<Pose, { eyeX: number; eyeY: number; eyeR: number; lookY: number; blushX: number; blushY: number; bottom: number }> = {
  stand: { eyeX: 0.33, eyeY: -0.5, eyeR: 0.26, lookY: 0.05, blushX: 0.57, blushY: -0.04, bottom: 0.76 },
  jump: { eyeX: 0.3, eyeY: -0.72, eyeR: 0.24, lookY: -0.07, blushX: 0.5, blushY: -0.3, bottom: 0.5 },
  hide: { eyeX: 0.3, eyeY: 0.13, eyeR: 0.22, lookY: -0.07, blushX: 0.62, blushY: 0.52, bottom: 0.86 },
}

const DOTS: [number, number, number][] = [
  [-0.5, -0.42, 0.13],
  [0.08, -0.62, 0.11],
  [0.56, -0.3, 0.13],
  [-0.14, -0.12, 0.14],
  [0.36, 0.14, 0.12],
  [-0.6, 0.16, 0.12],
  [-0.22, 0.44, 0.13],
  [0.5, 0.54, 0.11],
  [0.86, 0.02, 0.1],
  [-0.88, -0.1, 0.1],
  [0.12, 0.76, 0.1],
  [-0.62, 0.66, 0.1],
]
const SPARKLES: [number, number, number, boolean][] = [
  [-0.46, -0.34, 0.2, false],
  [0.36, -0.5, 0.14, true],
  [0.46, 0.2, 0.2, false],
  [-0.3, 0.44, 0.15, true],
  [0.04, -0.02, 0.1, true],
  [-0.74, 0.08, 0.1, false],
  [0.74, -0.14, 0.09, true],
  [0.1, 0.66, 0.1, false],
]
const RAINBOW = ['#ff5e5e', '#ffa64d', '#ffe066', '#7fe07a', '#5ec8ff', '#b38bff']

/** A pattern over a jelly, to be cut to its outline: white dots, white stripes, twinkles, rainbow bands, gold. */
function PatternLayer({ pattern, jelly }: { pattern: Pattern; jelly: Jelly }) {
  const gradient = useSvgId()
  switch (pattern) {
    case 'dots':
      return (
        <g fill={WHITE} opacity={0.75}>
          {DOTS.map(([x, y, r]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
      )
    case 'stripes':
      return (
        <g fill={WHITE} opacity={0.5} transform="rotate(-18)">
          {[-0.74, -0.34, 0.06, 0.46, 0.86].map((y) => (
            <rect key={y} x={-1.4} y={y} width={2.8} height={0.2} />
          ))}
        </g>
      )
    case 'glitter':
      return (
        <>
          {SPARKLES.map(([x, y, s, gold]) => (
            <path key={`${x},${y}`} d={sparkle(x, y, s)} fill={gold ? palette.star : WHITE} />
          ))}
        </>
      )
    case 'rainbow':
      return (
        <g opacity={0.8}>
          {RAINBOW.map((c, i) => (
            <circle key={c} cx={0} cy={1.05} r={n(1.95 - i * 0.22)} fill={c} />
          ))}
          <circle cx={0} cy={1.05} r={n(1.95 - RAINBOW.length * 0.22)} fill={jelly.body} />
        </g>
      )
    case 'gold':
      return (
        <>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#fff2b0" />
            <stop offset="0.45" stopColor={palette.gold} />
            <stop offset="1" stopColor={palette.goldDeep} />
          </linearGradient>
          <rect x={-1} y={-1} width={2} height={2} fill={`url(#${gradient})`} opacity={0.9} />
          <path d={sparkle(-0.4, -0.3, 0.16)} fill={WHITE} />
          <path d={sparkle(0.42, 0.24, 0.12)} fill={WHITE} />
        </>
      )
  }
}

/**
 * The slime as the HUD shows it: a glossy drop of jelly with two big bulging eyes high on
 * the front, a smile, a blush and two little round arms. Hidden, it is a puddle with only
 * the eyes peeking over; jumping, it stretches tall with its arms up and its mouth open.
 * A baby has bigger eyes for its size.
 */
function SlimeFigure({ jelly, pattern, pose, baby }: { jelly: Jelly; pattern: Pattern | null; pose: Pose; baby: boolean }) {
  const f = FACE[pose]
  const eyeR = baby ? f.eyeR * 1.18 : f.eyeR
  const eyes = (
    <>
      {[-f.eyeX, f.eyeX].map((x) => (
        <g key={x}>
          <Solid>
            <circle cx={x} cy={f.eyeY} r={n(eyeR)} fill={palette.eye} />
          </Solid>
          <circle cx={n(x - Math.sign(x) * eyeR * 0.08)} cy={n(f.eyeY + f.lookY)} r={n(eyeR * 0.52)} fill={palette.pupil} />
          <circle cx={n(x - Math.sign(x) * eyeR * 0.08 - eyeR * 0.18)} cy={n(f.eyeY + f.lookY - eyeR * 0.2)} r={n(eyeR * 0.18)} fill={WHITE} />
        </g>
      ))}
    </>
  )
  const body = (
    <>
      <Solid>
        <path d={BODY[pose]} fill={jelly.body} />
        {pose === 'stand' && <ellipse cx={-0.94} cy={0.36} rx={0.16} ry={0.13} fill={jelly.body} />}
        {pose === 'stand' && <ellipse cx={0.94} cy={0.36} rx={0.16} ry={0.13} fill={jelly.body} />}
        {pose === 'jump' && <ellipse cx={-0.82} cy={-0.42} rx={0.12} ry={0.18} transform="rotate(28 -0.82 -0.42)" fill={jelly.body} />}
        {pose === 'jump' && <ellipse cx={0.82} cy={-0.42} rx={0.12} ry={0.18} transform="rotate(-28 0.82 -0.42)" fill={jelly.body} />}
      </Solid>
      <Clipped d={BODY[pose]}>
        {pattern !== null && <PatternLayer pattern={pattern} jelly={jelly} />}
        <ellipse cx={0.18} cy={n(f.bottom + 0.08)} rx={1.05} ry={pose === 'hide' ? 0.2 : 0.3} fill={jelly.deep} opacity={0.5} />
      </Clipped>
      {pose === 'hide' ? (
        <ellipse cx={-0.56} cy={0.42} rx={0.2} ry={0.05} transform="rotate(-10 -0.56 0.42)" fill={jelly.light} />
      ) : (
        <>
          <ellipse cx={-0.5} cy={n(f.eyeY + 0.28)} rx={0.1} ry={0.2} transform={`rotate(28 -0.5 ${n(f.eyeY + 0.28)})`} fill={jelly.light} />
          <circle cx={-0.62} cy={n(f.eyeY + 0.56)} r={0.05} fill={WHITE} />
        </>
      )}
    </>
  )
  return (
    <>
      {pose === 'jump' && <ellipse cx={0} cy={0.86} rx={0.42} ry={0.07} fill={INK} opacity={0.2} />}
      {pose === 'hide' ? (
        <>
          {eyes}
          {body}
          <path d="M -0.13,0.48 Q 0,0.58 0.13,0.48" fill="none" {...ink} strokeWidth={0.07} />
        </>
      ) : (
        <>
          {body}
          {eyes}
          {pose === 'stand' ? (
            <path d={baby ? 'M -0.12,-0.1 Q 0,0.02 0.12,-0.1' : 'M -0.2,-0.12 Q 0,0.1 0.2,-0.12'} fill="none" {...ink} strokeWidth={0.075} />
          ) : (
            <>
              <path d="M -0.17,-0.38 Q 0,-0.34 0.17,-0.38 Q 0.15,-0.12 0,-0.12 Q -0.15,-0.12 -0.17,-0.38 Z" fill={INK} />
              <ellipse cx={0} cy={-0.18} rx={0.08} ry={0.045} fill="#ff7a9a" />
            </>
          )}
        </>
      )}
      {[-f.blushX, f.blushX].map((x) => (
        <ellipse key={x} cx={x} cy={f.blushY} rx={0.12} ry={pose === 'hide' ? 0.05 : 0.07} fill={palette.blush} opacity={0.75} />
      ))}
    </>
  )
}

/** The slime's face and body in a colour and pattern (the progress line, the colour swatches, the hide and jump buttons). `pose`: standing, hidden flat with only the eyes up, or jumping. */
export function SlimeIcon({ colour, pattern, size, pose }: { colour: SlimeColour; pattern: Pattern | null; size: number; pose: 'stand' | 'hide' | 'jump' }) {
  return (
    <Icon size={size}>
      <SlimeFigure jelly={SLIME_COLOURS[colour]} pattern={pattern} pose={pose} baby={false} />
    </Icon>
  )
}

/** A swatch shows its pattern on the slime colour it looks best on. */
const SWATCH: Record<Pattern, SlimeColour> = { dots: 'pink', stripes: 'blue', glitter: 'purple', rainbow: 'green', gold: 'orange' }
const BLOB = 'M 0,-0.82 C 0.5,-0.82 0.88,-0.46 0.88,0.02 C 0.88,0.5 0.52,0.8 0,0.8 C -0.52,0.8 -0.88,0.5 -0.88,0.02 C -0.88,-0.46 -0.5,-0.82 0,-0.82 Z'
const LOCKED = '#bdb7cc'

/** A swatch's round blob of jelly with its pattern over it (none for plain jelly), shaded at the bottom, with a shine. */
function JellyBlob({ jelly, pattern }: { jelly: Jelly; pattern: Pattern | null }) {
  return (
    <>
      <Solid>
        <path d={BLOB} fill={jelly.body} />
      </Solid>
      <Clipped d={BLOB}>
        {pattern !== null && <PatternLayer pattern={pattern} jelly={jelly} />}
        <ellipse cx={0.2} cy={0.9} rx={1.05} ry={0.32} fill={jelly.deep} opacity={0.45} />
      </Clipped>
      <ellipse cx={-0.44} cy={-0.38} rx={0.1} ry={0.2} transform="rotate(40 -0.44 -0.38)" fill={WHITE} opacity={0.85} />
    </>
  )
}

/** A pattern swatch on a round blob; `locked` draws a grey blob with a question mark. */
export function PatternIcon({ pattern, size, locked }: { pattern: Pattern; size: number; locked: boolean }) {
  const jelly = SLIME_COLOURS[SWATCH[pattern]]
  return (
    <Icon size={size}>
      {locked ? (
        <>
          <Solid>
            <path d={BLOB} fill={LOCKED} />
          </Solid>
          <path d="M -0.25,-0.26 C -0.25,-0.58 0.28,-0.6 0.28,-0.28 C 0.28,-0.06 0,-0.04 0,0.16" fill="none" stroke={INK} strokeWidth={0.34} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M -0.25,-0.26 C -0.25,-0.58 0.28,-0.6 0.28,-0.28 C 0.28,-0.06 0,-0.04 0,0.16" fill="none" stroke={WHITE} strokeWidth={0.18} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={0} cy={0.46} r={0.15} fill={WHITE} stroke={INK} strokeWidth={0.08} />
        </>
      ) : (
        <JellyBlob jelly={jelly} pattern={pattern} />
      )}
    </Icon>
  )
}

/** The "no pattern" swatch: the same blob in a slime colour's plain jelly. */
export function PlainIcon({ colour, size }: { colour: SlimeColour; size: number }) {
  return (
    <Icon size={size}>
      <JellyBlob jelly={SLIME_COLOURS[colour]} pattern={null} />
    </Icon>
  )
}

/** A baby slime in its BABY_COLOURS colour, or a dashed empty outline when not found. */
export function BabyIcon({ index, size, found }: { index: 0 | 1 | 2; size: number; found: boolean }) {
  const c = BABY_COLOURS[index]
  return (
    <Icon size={size}>
      {found ? (
        <SlimeFigure jelly={{ body: c, deep: darker(c), light: lighter(c) }} pattern={null} pose="stand" baby />
      ) : (
        <path d={BODY.stand} fill={WHITE} fillOpacity={0.35} stroke={INK} strokeOpacity={0.6} strokeWidth={LINE} strokeDasharray="0.17 0.12" strokeLinecap="round" />
      )}
    </Icon>
  )
}

// ------------------------------------------------------------------ the run and the map

/** The gold key; `dim` for the empty key slot before it is taken. */
export function KeyIcon({ size, dim }: { size: number; dim: boolean }) {
  const gold = dim ? WHITE : palette.gold
  return (
    <Icon size={size}>
      <g transform="rotate(-35) scale(1.08)" opacity={dim ? 0.45 : 1}>
        <Solid>
          <path d={`${ellipse(-0.5, 0, 0.4, 0.4)} ${ellipse(-0.5, 0, 0.16, 0.16)}`} fillRule="evenodd" fill={gold} />
          <path d={roundRect(-0.16, -0.1, 1.06, 0.2, 0.06)} fill={gold} />
          <path d={roundRect(0.46, 0.02, 0.15, 0.3, 0.05)} fill={gold} />
          <path d={roundRect(0.72, 0.02, 0.15, 0.24, 0.05)} fill={gold} />
        </Solid>
        {!dim && (
          <>
            <path d="M -0.8,-0.08 A 0.3 0.3 0 0 1 -0.6,-0.28" fill="none" stroke={lighter(palette.gold)} strokeWidth={0.09} strokeLinecap="round" />
            <path d="M -0.04,-0.03 H 0.6" stroke={lighter(palette.gold)} strokeWidth={0.05} strokeLinecap="round" />
          </>
        )}
      </g>
    </Icon>
  )
}

const JAR_BODY = roundRect(-0.72, -0.5, 1.44, 1.42, 0.34)
const JAR_INSIDE = roundRect(-0.64, -0.42, 1.28, 1.26, 0.28)
/** The stars that heap up in the jar, bottom row first; the fill line uncovers them. */
const JAR_STARS: [number, number, number][] = [
  [-0.38, 0.66, 0.16],
  [0.02, 0.7, 0.15],
  [0.4, 0.64, 0.16],
  [-0.18, 0.4, 0.15],
  [0.24, 0.38, 0.16],
  [-0.48, 0.24, 0.13],
  [0.5, 0.16, 0.13],
  [0.02, 0.12, 0.15],
  [-0.3, -0.1, 0.14],
  [0.32, -0.12, 0.15],
  [-0.02, -0.3, 0.13],
]

/** The star jar filled `fill` (0 to 1) with stars. */
export function JarIcon({ size, fill }: { size: number; fill: number }) {
  const f = clamp01(fill)
  const top = 0.84 - f * 1.26
  return (
    <Icon size={size}>
      <Solid>
        <path d={roundRect(-0.5, -0.66, 1, 0.24, 0.06)} fill="#c8ecff" />
      </Solid>
      <Solid>
        <path d={JAR_BODY} fill="#e6f7ff" />
      </Solid>
      <Clipped d={JAR_INSIDE}>
        <Clipped d={`M -1,${n(top)} H 1 V 1 H -1 Z`}>
          <rect x={-1} y={-1} width={2} height={2} fill={palette.star} />
          {JAR_STARS.map(([x, y, r]) => (
            <path key={`${x},${y}`} d={starPath(x, y, r, r * 0.45)} fill="#ffb02e" />
          ))}
        </Clipped>
        {f > 0.03 && f < 0.97 && (
          <>
            {[-0.48, -0.16, 0.16, 0.48].map((x, i) => (
              <path key={x} d={starPath(x, top + (i % 2 === 0 ? 0.02 : -0.03), 0.15, 0.07)} fill={palette.star} {...ink} strokeWidth={0.045} />
            ))}
          </>
        )}
      </Clipped>
      <path d={roundRect(-0.58, -0.3, 0.13, 0.96, 0.065)} fill={WHITE} opacity={0.75} />
      <Solid>
        <path d={roundRect(-0.6, -0.94, 1.2, 0.32, 0.1)} fill={palette.boxRed} />
      </Solid>
      <path d="M -0.44,-0.78 H 0.44" stroke={lighter(palette.boxRed)} strokeWidth={0.07} strokeLinecap="round" />
    </Icon>
  )
}

const MANE = 'M -0.18,-0.62 C -0.56,-0.6 -0.84,-0.28 -0.8,0.12 C -0.78,0.42 -0.9,0.66 -0.8,0.94 L -0.5,0.94 C -0.56,0.4 -0.48,-0.16 -0.18,-0.5 Z'
const PONY_HEAD =
  'M -0.56,0.94 C -0.62,0.3 -0.52,-0.3 -0.18,-0.6 C 0.08,-0.8 0.42,-0.68 0.58,-0.42 C 0.74,-0.18 0.92,0.04 0.92,0.24 C 0.92,0.46 0.72,0.54 0.54,0.48 C 0.38,0.44 0.26,0.32 0.1,0.32 C -0.06,0.38 -0.12,0.62 -0.1,0.94 Z'

/** One animal of the measuring pole: a mouse, a cat, a dog, a pony and an elephant, each in a colour of its own. */
function animalShapes(animal: number): ReactNode {
  const name = ANIMALS[animal]
  if (name === undefined) throw new Error(`no animal ${animal}: an index into ANIMALS is 0 to ${ANIMALS.length - 1}`)
  switch (name) {
    case 'mouse': {
      const fur = '#b9b3c9'
      return (
        <>
          <Solid>
            <circle cx={-0.56} cy={-0.46} r={0.38} fill={fur} />
            <circle cx={0.56} cy={-0.46} r={0.38} fill={fur} />
          </Solid>
          <circle cx={-0.56} cy={-0.46} r={0.23} fill="#ffb8cc" />
          <circle cx={0.56} cy={-0.46} r={0.23} fill="#ffb8cc" />
          <Solid>
            <path d="M 0,0.8 C -0.34,0.8 -0.68,0.5 -0.68,0.1 C -0.68,-0.3 -0.38,-0.5 0,-0.5 C 0.38,-0.5 0.68,-0.3 0.68,0.1 C 0.68,0.5 0.34,0.8 0,0.8 Z" fill={fur} />
          </Solid>
          <DotEyes x={0.25} y={0.04} r={0.1} />
          <path d="M -0.2,0.48 L -0.86,0.36 M -0.2,0.56 L -0.86,0.6 M 0.2,0.48 L 0.86,0.36 M 0.2,0.56 L 0.86,0.6" fill="none" {...ink} strokeWidth={0.05} />
          <circle cx={0} cy={0.5} r={0.11} fill={palette.blush} {...ink} strokeWidth={0.05} />
          <path d="M -0.1,0.66 Q 0,0.72 0.1,0.66" fill="none" {...ink} strokeWidth={0.05} />
        </>
      )
    }
    case 'cat': {
      const fur = '#ffa64d'
      return (
        <>
          <Solid>
            <path d="M -0.7,-0.08 L -0.64,-0.88 L -0.12,-0.5 Z" fill={fur} />
            <path d="M 0.7,-0.08 L 0.64,-0.88 L 0.12,-0.5 Z" fill={fur} />
            <path d={ellipse(0, 0.14, 0.74, 0.62)} fill={fur} />
          </Solid>
          <path d="M -0.6,-0.3 L -0.57,-0.7 L -0.3,-0.5 Z M 0.6,-0.3 L 0.57,-0.7 L 0.3,-0.5 Z" fill="#ffc2d1" />
          <path d="M -0.2,-0.47 L -0.1,-0.22 L 0,-0.48 Z M 0.04,-0.48 L 0.14,-0.24 L 0.24,-0.46 Z" fill="#e57d22" />
          <path d={ellipse(-0.28, 0.08, 0.1, 0.13)} fill={INK} />
          <path d={ellipse(0.28, 0.08, 0.1, 0.13)} fill={INK} />
          <circle cx={-0.31} cy={0.03} r={0.04} fill={WHITE} />
          <circle cx={0.25} cy={0.03} r={0.04} fill={WHITE} />
          <path d="M -0.09,0.26 L 0.09,0.26 L 0,0.36 Z" fill={palette.blush} {...ink} strokeWidth={0.04} />
          <path d="M 0,0.36 Q -0.06,0.48 -0.17,0.43 M 0,0.36 Q 0.06,0.48 0.17,0.43 M -0.32,0.3 L -0.9,0.22 M -0.32,0.38 L -0.88,0.44 M 0.32,0.3 L 0.9,0.22 M 0.32,0.38 L 0.88,0.44" fill="none" {...ink} strokeWidth={0.05} />
        </>
      )
    }
    case 'dog': {
      const fur = '#e3ae6c'
      const ear = palette.woodDeep
      return (
        <>
          <Solid>
            <path d={ellipse(0, 0.06, 0.62, 0.64)} fill={fur} />
          </Solid>
          <path d={ellipse(0.28, -0.1, 0.2, 0.18)} fill={mix(fur, ear, 0.45)} />
          <Solid>
            <path d="M -0.42,-0.52 C -0.82,-0.6 -1,-0.1 -0.9,0.32 C -0.84,0.58 -0.56,0.56 -0.5,0.3 C -0.44,0.06 -0.4,-0.2 -0.42,-0.52 Z" fill={ear} />
            <path d="M 0.42,-0.52 C 0.82,-0.6 1,-0.1 0.9,0.32 C 0.84,0.58 0.56,0.56 0.5,0.3 C 0.44,0.06 0.4,-0.2 0.42,-0.52 Z" fill={ear} />
          </Solid>
          <Solid>
            <path d={ellipse(0, 0.42, 0.36, 0.27)} fill="#fff3e0" />
          </Solid>
          <Solid>
            <path d="M -0.11,0.56 Q -0.11,0.82 0,0.82 Q 0.11,0.82 0.11,0.56 Z" fill="#ff7a9a" />
          </Solid>
          <path d={ellipse(0, 0.28, 0.14, 0.1)} fill={INK} />
          <path d="M 0,0.36 V 0.47 M -0.15,0.5 Q -0.06,0.56 0,0.47 Q 0.06,0.56 0.15,0.5" fill="none" {...ink} strokeWidth={0.05} />
          <DotEyes x={0.25} y={-0.08} r={0.09} />
        </>
      )
    }
    case 'pony': {
      const mane = '#b38bff'
      return (
        <>
          <Solid>
            <path d="M -0.12,-0.56 Q -0.1,-0.84 0.02,-0.9 Q 0.16,-0.76 0.22,-0.6 Z" fill="#fff3e6" />
          </Solid>
          <Solid>
            <path d={MANE} fill={mane} />
          </Solid>
          <path d="M -0.66,-0.1 C -0.7,0.3 -0.76,0.6 -0.68,0.92" fill="none" stroke="#ff8fc8" strokeWidth={0.09} strokeLinecap="round" />
          <Solid>
            <path d={PONY_HEAD} fill="#fff3e6" />
          </Solid>
          <path d={ellipse(0.68, 0.22, 0.24, 0.22)} fill="#ffcfc4" />
          <path d={ellipse(0.76, 0.16, 0.05, 0.035)} fill={INK} />
          <path d="M 0.56,0.4 Q 0.66,0.45 0.78,0.39" fill="none" {...ink} strokeWidth={0.05} />
          <circle cx={0.2} cy={-0.28} r={0.1} fill={INK} />
          <circle cx={0.17} cy={-0.32} r={0.035} fill={WHITE} />
          <path d="M 0.13,-0.38 L 0.09,-0.45 M 0.21,-0.39 L 0.21,-0.47 M 0.28,-0.37 L 0.32,-0.44" fill="none" {...ink} strokeWidth={0.04} />
          <Solid>
            <path d="M -0.14,-0.62 C 0.04,-0.76 0.28,-0.68 0.34,-0.46 C 0.18,-0.54 0.02,-0.52 -0.1,-0.42 Z" fill={mane} />
          </Solid>
        </>
      )
    }
    case 'elephant': {
      const skin = '#a7b9d6'
      return (
        <>
          <Solid>
            <path d={ellipse(-0.6, -0.04, 0.4, 0.5)} fill={skin} />
            <path d={ellipse(0.6, -0.04, 0.4, 0.5)} fill={skin} />
          </Solid>
          <path d={ellipse(-0.62, -0.02, 0.25, 0.34)} fill="#ffc6d9" />
          <path d={ellipse(0.62, -0.02, 0.25, 0.34)} fill="#ffc6d9" />
          <Solid>
            <path d={ellipse(0, -0.14, 0.5, 0.52)} fill={skin} />
            <path d="M -0.17,0.2 C -0.2,0.56 -0.1,0.82 0.14,0.86 C 0.32,0.88 0.44,0.74 0.38,0.6 C 0.34,0.52 0.24,0.54 0.22,0.62 C 0.18,0.68 0.08,0.62 0.12,0.2 Z" fill={skin} />
          </Solid>
          <path d="M -0.14,0.42 Q -0.02,0.47 0.11,0.42 M -0.12,0.57 Q -0.01,0.62 0.11,0.58" fill="none" {...ink} strokeWidth={0.045} />
          <DotEyes x={0.2} y={-0.2} r={0.085} />
          <ellipse cx={-0.34} cy={0.06} rx={0.1} ry={0.06} fill={palette.blush} opacity={0.75} />
          <ellipse cx={0.34} cy={0.06} rx={0.1} ry={0.06} fill={palette.blush} opacity={0.75} />
        </>
      )
    }
  }
}

/** One animal of the measuring pole (index into ANIMALS). */
export function AnimalIcon({ animal, size }: { animal: number; size: number }) {
  return <Icon size={size}>{animalShapes(animal)}</Icon>
}

/** The finish flag waves: its top edge at u (0 at the pole, 1 at the tip) and its height. */
const flagTop = (u: number) => -0.78 + 0.09 * Math.sin(u * Math.PI * 2)
const FLAG_H = 0.8
const FLAG_X = (u: number) => -0.52 + 1.42 * u
const FLAG_U = Array.from({ length: 17 }, (_, i) => i / 16)
const FLAG = `M ${FLAG_U.map((u) => `${n(FLAG_X(u))},${n(flagTop(u))}`).join(' L ')} L ${[...FLAG_U]
  .reverse()
  .map((u) => `${n(FLAG_X(u))},${n(flagTop(u) + FLAG_H)}`)
  .join(' L ')} Z`
/** The black squares of the chequered flag, each following the wave. */
const CHECKS = Array.from({ length: 18 }, (_, k) => [k % 6, Math.floor(k / 6)] as const)
  .filter(([i, j]) => (i + j) % 2 === 0)
  .map(([i, j]) => {
    const u0 = i / 6
    const u1 = (i + 1) / 6
    const v0 = (j * FLAG_H) / 3
    const v1 = ((j + 1) * FLAG_H) / 3
    return `M ${n(FLAG_X(u0))},${n(flagTop(u0) + v0)} L ${n(FLAG_X(u1))},${n(flagTop(u1) + v0)} L ${n(FLAG_X(u1))},${n(flagTop(u1) + v1)} L ${n(FLAG_X(u0))},${n(flagTop(u0) + v1)} Z`
  })
  .join(' ')

/** The finish flag at the end of the progress line. */
export function FlagIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <Solid>
        <path d={roundRect(-0.7, -0.84, 0.14, 1.78, 0.07)} fill={palette.wood} />
      </Solid>
      <Solid>
        <circle cx={-0.63} cy={-0.88} r={0.12} fill={palette.gold} />
      </Solid>
      <Solid>
        <path d={FLAG} fill={WHITE} />
      </Solid>
      <path d={CHECKS} fill={INK} />
    </Icon>
  )
}

const ARROW = 'M -0.78,-0.26 L 0.02,-0.26 L 0.02,-0.66 L 0.86,0 L 0.02,0.66 L 0.02,0.26 L -0.78,0.26 Z'

/** A chunky arrow pointing left or right (the touch buttons, the map). */
export function ArrowIcon({ dir, size }: { dir: -1 | 1; size: number }) {
  return (
    <Icon size={size}>
      <g transform={dir < 0 ? 'scale(-1 1)' : undefined}>
        <Solid>
          <path d={ARROW} fill={WHITE} />
        </Solid>
      </g>
    </Icon>
  )
}

/** The wardrobe door, for the map's button. */
export function WardrobeIcon({ size }: { size: number }) {
  const wood = palette.wood
  const deep = palette.woodDeep
  return (
    <Icon size={size}>
      <Solid>
        <path d={roundRect(-0.68, 0.7, 0.2, 0.2, 0.06)} fill={deep} />
        <path d={roundRect(0.36, 0.7, 0.2, 0.2, 0.06)} fill={deep} />
      </Solid>
      <Solid>
        <path d={roundRect(-0.8, -0.8, 1.48, 1.56, 0.14)} fill={wood} />
      </Solid>
      <path d={roundRect(-0.7, -0.68, 0.62, 1.32, 0.07)} fill={lighter(wood)} {...ink} strokeWidth={0.06} />
      <circle cx={-0.17} cy={0.02} r={0.06} fill={palette.gold} {...ink} strokeWidth={0.04} />
      <path d={roundRect(0, -0.68, 0.58, 1.32, 0.06)} fill="#6e4226" {...ink} strokeWidth={0.06} />
      <path d="M 0.06,-0.5 H 0.52" stroke={palette.metal} strokeWidth={0.06} strokeLinecap="round" />
      <path d="M 0.29,-0.5 V -0.42 M 0.08,-0.24 L 0.29,-0.42 L 0.5,-0.24" fill="none" stroke={palette.metal} strokeWidth={0.05} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 0.16,-0.3 L 0.06,-0.2 L 0.12,-0.08 L 0.17,-0.12 L 0.17,0.26 L 0.41,0.26 L 0.41,-0.12 L 0.46,-0.08 L 0.52,-0.2 L 0.42,-0.3 Q 0.29,-0.22 0.16,-0.3 Z" fill="#ff8fc8" {...ink} strokeWidth={0.04} />
      <Solid>
        <path d={roundRect(-0.88, -0.94, 1.64, 0.22, 0.1)} fill={deep} />
      </Solid>
      <Solid>
        <path d="M 0.62,-0.66 L 0.96,-0.8 L 0.96,0.78 L 0.62,0.64 Z" fill={lighter(wood)} />
      </Solid>
      <circle cx={0.86} cy={0.02} r={0.055} fill={palette.gold} {...ink} strokeWidth={0.04} />
    </Icon>
  )
}

/** A little star, for the tower's star count. */
export function StarIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <Solid>
        <path d={starPath(0, 0.07, 0.98, 0.46)} fill={palette.star} />
      </Solid>
      <path d="M -0.34,-0.12 L -0.12,-0.12 L -0.04,-0.36" fill="none" stroke={WHITE} strokeWidth={0.1} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />
    </Icon>
  )
}

/** A gold twinkle, for something new: the gift, a pattern the jar opened. */
export function SparkIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <Solid>
        <path d={sparkle(0, 0, 1)} fill={palette.gold} />
      </Solid>
    </Icon>
  )
}
