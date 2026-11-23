/**
 * A pattern of the set as a flat swatch, for the dressing room's cells: the main colour with the
 * pattern over it in the second, laid as the scene lays it on a model (PATTERN_LOOK, tiles of one
 * unit), a few tiles across.
 */

import { useId } from 'react'

import { PATTERN_LOOK, type PatternName } from './patterns'

/** How many tiles across a swatch shows. */
const TILES = 2.5

/** A five-pointed star of radius r round (cx, cy), its inner corners at `inner` of r, point up. */
function starPoints(cx: number, cy: number, r: number, inner: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5
    const k = i % 2 === 0 ? r : r * inner
    return `${(cx + k * Math.sin(a)).toFixed(3)},${(cy - k * Math.cos(a)).toFixed(3)}`
  }).join(' ')
}

/** The zigzag's band in a tile, its points as the SVG takes them: lowest at the tile's middle, as the scene draws it. */
export const ZIGZAG_BAND = (swing: number, band: number) => `0,0 0.5,${swing} 1,0 1,${band} 0.5,${swing + band} 0,${band}`

/** One tile's marks in the second colour (two lines of tiles for dots and stars, whose every other line is shifted half a tile). */
function tileMarks(name: Exclude<PatternName, 'plain'>, fill: string) {
  const L = PATTERN_LOOK
  switch (name) {
    case 'stripes':
      return <rect x={0} y={0} width={1} height={L.stripe} fill={fill} />
    case 'spots':
      return [[0.5, 0.5], [0, 1.5], [1, 1.5]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={L.spot} fill={fill} />)
    case 'checks':
      return (
        <>
          <rect x={0} y={0} width={0.5} height={0.5} fill={fill} />
          <rect x={0.5} y={0.5} width={0.5} height={0.5} fill={fill} />
        </>
      )
    case 'zigzag': {
      // A band dipping from the tile's edges to its middle (a V, as the scene draws it on a model; the SVG's y points down).
      const s = L.zigzag
      const b = L.zigzagBand
      return <polygon points={ZIGZAG_BAND(s, b)} fill={fill} />
    }
    case 'stars':
      return [[0.5, 0.5], [0, 1.5], [1, 1.5]].map(([x, y], i) => <polygon key={i} points={starPoints(x!, y!, L.star, L.starInner)} fill={fill} />)
  }
}

/** The swatch: a square of the main colour with the pattern in the second (nothing over it for plain). */
export function PatternSwatch({ name, main, second, className }: { name: PatternName; main: string; second: string; className: string }) {
  // React's ids hold marks that url(#...) does not take.
  const id = `pattern-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const high = name === 'spots' || name === 'stars' ? 2 : 1
  return (
    <svg className={className} viewBox={`0 0 ${TILES} ${TILES}`} aria-hidden>
      <rect width={TILES} height={TILES} fill={main} />
      {name !== 'plain' && (
        <>
          <defs>
            <pattern id={id} width={1} height={high} patternUnits="userSpaceOnUse" x={0.25} y={0.25}>
              {tileMarks(name, second)}
            </pattern>
          </defs>
          <rect width={TILES} height={TILES} fill={`url(#${id})`} />
        </>
      )}
    </svg>
  )
}
