/**
 * The house's own set of colours (plan.md, The look, people and presents): what every worn thing,
 * a present or a piece of the starting wardrobe, can be painted in the dressing room, its main and
 * its second colour. Sixteen clear colours for children, with hair's own browns, black and sand
 * among them so hair can be painted like hair too. None is near a marker colour (engine/gift.ts
 * GIFT_MARKERS), which the scene swaps for these. The patterns laid on the main colour are
 * patterns/patterns.ts.
 *
 * A Wearing keeps the colour itself (saves.ts), so what the gallery face gives (its hair colour, a
 * crown's gold) is worn as it is until a child paints it from this set.
 */

import { mixColor } from '../../../../silly-billy/src/engine/sky'
import { COLOUR_NAMES } from '../../words'

export type ColourName = keyof typeof COLOUR_NAMES

/** The set, in the order the swatches are shown: the rainbow, then the light and dark ones. */
export const COLOURS: Readonly<Record<ColourName, string>> = {
  red: '#ff4d4d',
  orange: '#ff9a3c',
  yellow: '#ffd93d',
  lime: '#8fdc4f',
  green: '#2e9e5b',
  teal: '#2ec4b6',
  sky: '#5cc8ff',
  blue: '#3d6fff',
  purple: '#9a6bff',
  pink: '#ffa3cf',
  rose: '#ff4fa0',
  white: '#ffffff',
  grey: '#9aa3ad',
  black: '#3a3444',
  brown: '#8a5732',
  sand: '#e8c391',
}

export const COLOUR_ORDER = Object.keys(COLOURS) as ColourName[]

/** The colour among `among` nearest to a '#rrggbb' colour, by plain distance in RGB. */
export function nearestColour(hex: string, among: readonly ColourName[]): ColourName {
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [r, g, b] = rgb(hex)
  let best: ColourName | null = null
  let bestD = Infinity
  for (const name of among) {
    const [r2, g2, b2] = rgb(COLOURS[name])
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2
    if (d < bestD) {
      bestD = d
      best = name
    }
  }
  if (best === null) throw new Error('no colours to choose the nearest from')
  return best
}

/** The set's bright colours, the ones a present is first worn in: all but white, grey, black, brown and sand. */
const BRIGHT: readonly ColourName[] = ['red', 'orange', 'yellow', 'lime', 'green', 'teal', 'sky', 'blue', 'purple', 'pink', 'rose']
/** How far toward white the seat's colour is taken before the present's main colour is chosen near it. */
const PRESENT_LIGHTER = 0.4

/**
 * The colours a present is first worn in, before its wearer paints it, all from the set: as its
 * second, the set's colour nearest the wearer's seat colour, so they find themself at once; as its
 * main, the bright colour nearest the seat's colour made lighter, never the second itself. The kid's
 * top is the seat's colour (shell/play.ts partyFrom), so a present worn on the body still shows on
 * it. One rule for the end, where the present is first shown, and the dressing room, where it is
 * put on: red seats get pink with red, blue sky with blue, yellow pink with yellow, green light green
 * with green.
 */
export function presentColours(seatColour: string): { main: string; second: string } {
  const second = nearestColour(seatColour, COLOUR_ORDER)
  const main = nearestColour(mixColor(seatColour, '#ffffff', PRESENT_LIGHTER), BRIGHT.filter((n) => n !== second))
  return { main: COLOURS[main], second: COLOURS[second] }
}
