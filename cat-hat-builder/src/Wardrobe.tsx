import type { CSSProperties } from 'react'

import { inLang, type Lang } from '../../profiles/src/lang'
import { Btn } from './Btn'
import { isShort, type Insets } from './game/camera'
import type { Game } from './game/game'
import type { HudView } from './game/hud'
import { PARTS, type Look, type Part } from './game/model'
import { HAIR_LOOK, WEAR_LOOK } from './draw/look'
import { DiceIcon, UndoIcon } from './Icons'
import { PartPic } from './Pictures'
import { optionName, PART_NAMES, WORDS } from './words'

/** The colour a colour-row button shows: the hair's, the shirt's or the trousers'. */
function swatch(patch: Partial<Look>): string {
  if (patch.hairColor !== undefined) return HAIR_LOOK[patch.hairColor]
  if (patch.shirtColor !== undefined) return WEAR_LOOK[patch.shirtColor].base
  if (patch.pantsColor !== undefined) return WEAR_LOOK[patch.pantsColor].base
  throw new Error(`no colour in ${JSON.stringify(patch)}`)
}

/** A tab whose pick is 'none' shows a sample of its part instead, so it still says what is inside: the glasses tab some glasses, the bag tab a bag. */
export function tabLook(look: Look, part: Part): Look {
  if (part === 'glasses' && look.glasses === 'none') return { ...look, glasses: 'round' }
  if (part === 'bag' && look.bag === 'none') return { ...look, bag: 'school' }
  return look
}

/**
 * The wardrobe's measures as styles.css lays it out (CSS px), on a roomy window and on a short
 * one (a phone on its side, where the pause button stands beside the back button): the
 * panel's margin, its border and padding on each side, the gap between the tabs and the rest
 * and the gaps inside the rest, the biggest colour button and the gaps between the colours,
 * the foot's height (the dice, the undo and Go! in a row), the room the pause button takes
 * over the landscape panel's top right, and the smallest option.
 */
const ROOMY = { margin: { side: 10, foot: 16 }, edge: 15, gap: 12, mainGap: 18, colour: 64, colourGap: { row: 10, col: 8 }, foot: 84, underPause: 84, leastOption: 64 }
const SHORT = { margin: { side: 8, foot: 8 }, edge: 11, gap: 10, mainGap: 10, colour: 56, colourGap: { row: 8, col: 4 }, foot: 64, underPause: 0, leastOption: 48 }
const TAB_GAP = 6
const OPTION_GAP = { row: 14, col: 10 }
/** The foot in a row, or on a narrow panel Go! over the other two. */
const FOOT_ROW = 2 * 64 + 2 * 12 + 120
const FOOT_STACKED = 64 + 12 + 64
/** Room in the options' scroll for the picked option raised above and every button's bottom face below. */
const RAISE = 18
/** Every button is at least MIN_BUTTON where the screen has room. On a short window the options go down to SHORT.leastOption and the colours are as big as fits, from LEAST_COLOUR up to SHORT.colour, so a tab's options and colours all fit beside the builder; on a phone-sized window the tabs go down to SMALLEST_TAB, and what still does not fit scrolls above the foot. */
const MIN_BUTTON = 64
const LEAST_COLOUR = 48
const SMALLEST_TAB = 44
const BIGGEST_TAB = 80
const BIGGEST_OPTION = 118

/** The wardrobe's panel on a w x h window with the camera's insets: its outer size, and whether the window is short (camera.isShort). */
export function wardrobePanel(ins: Insets, w: number, h: number) {
  const short = isShort(w, h)
  const m = short ? SHORT : ROOMY
  return ins.right > 0 ? { wide: true, short, w: ins.right, h: h - m.margin.side - m.margin.foot } : { wide: false, short, w: w - 2 * m.margin.side, h: ins.bottom }
}

/**
 * How the wardrobe fills its panel: the tabs' size and whether they run in one line of nine
 * or two of five (down the side in landscape, across the top in portrait), and the options'
 * size and columns, as big as the panel holds with the colour row and the foot (most 8
 * options in two rows of four), the colours' size, and whether the foot stacks. The foot
 * (dice, undo and Go!) always shows. On a short window the tabs leave the rest the foot's
 * row, and the rest runs the panel's whole height.
 */
export function fitWardrobe(panel: { wide: boolean; short: boolean; w: number; h: number }, options: number, colours: number): { tab: number; perLine: 9 | 5; option: number; cols: number; colour: number; stacked: boolean } {
  const m = panel.short ? SHORT : ROOMY
  const iw = panel.w - 2 * m.edge
  const ih = panel.h - 2 * m.edge
  const run = panel.wide ? ih : iw
  const one = (run - 8 * TAB_GAP) / 9
  const perLine = one >= MIN_BUTTON ? 9 : 5
  const byRun = perLine === 9 ? one : (run - 4 * TAB_GAP) / 5
  const byWidth = panel.short && panel.wide ? (perLine === 9 ? iw - m.gap - FOOT_ROW : (iw - m.gap - FOOT_ROW - TAB_GAP) / 2) : Infinity
  const tab = Math.floor(Math.min(BIGGEST_TAB, Math.max(SMALLEST_TAB, Math.min(byRun, byWidth))))
  const across = perLine === 9 ? tab : 2 * tab + TAB_GAP
  const mw = panel.wide ? iw - across - m.gap : iw
  const stacked = mw < FOOT_ROW
  const mh = (panel.wide ? ih - m.underPause : ih - across - m.gap) - (stacked ? FOOT_STACKED : m.foot) - m.mainGap
  const gap = m.colourGap
  const rows = Math.ceil(options / 4)
  // On a short window the colours take two rows (one for a single colour), as big as fit across and no bigger than the options over them.
  const colourLines = Math.max(1, Math.min(2, colours))
  const colourPerLine = Math.ceil(colours / colourLines)
  const colourAcross = (mw - (colourPerLine - 1) * gap.col) / colourPerLine
  const colourUnder = (mh - RAISE - (rows - 1) * OPTION_GAP.row - m.mainGap - (colourLines - 1) * gap.row) / (rows + colourLines)
  const colour = panel.short ? Math.floor(Math.min(SHORT.colour, Math.max(LEAST_COLOUR, Math.min(colourAcross, colourUnder)))) : ROOMY.colour
  const perRow = Math.max(1, Math.floor((mw + gap.col) / (colour + gap.col)))
  const colourRows = Math.ceil(colours / perRow)
  const colourH = colours === 0 ? 0 : colourRows * colour + (colourRows - 1) * gap.row + m.mainGap
  const fit = Math.min((mw - 3 * OPTION_GAP.col) / 4, (mh - colourH - RAISE - (rows - 1) * OPTION_GAP.row) / rows)
  const option = Math.floor(Math.min(BIGGEST_OPTION, Math.max(m.leastOption, fit)))
  const cols = Math.max(1, Math.min(4, Math.floor((mw + OPTION_GAP.col) / (option + OPTION_GAP.col))))
  return { tab, perLine, option, cols, colour, stacked }
}

/**
 * The mirror's wardrobe, in the panel the camera keeps free (right in landscape, along the
 * bottom in portrait), fitted to it (fitWardrobe): picture tabs head to toe, each showing
 * what the builder wears there now (tabLook); the open tab's options as big pictures of the
 * builder wearing each; the colour row; the dice and its undo; and Go!, which pulses once the
 * child has dressed up a while.
 */
export function Wardrobe({ game, view, ins, screen, lang }: { game: Game; view: NonNullable<HudView['wardrobe']>; ins: Insets; screen: { w: number; h: number }; lang: Lang }) {
  const look = game.hud.look
  const panel = wardrobePanel(ins, screen.w, screen.h)
  const fit = fitWardrobe(panel, view.options.length, view.colours.length)
  const sizes = { '--tab': `${fit.tab}px`, '--tab-line': fit.perLine, '--o': `${fit.option}px`, '--o-cols': fit.cols, '--c': `${fit.colour}px` }
  const box = { ...(panel.wide ? { top: 0, right: 0, bottom: 0, width: panel.w } : { left: 0, right: 0, bottom: 0, height: panel.h }), ...sizes } as CSSProperties
  const wear = (patch: Partial<Look>) => game.dispatch({ kind: 'wear', patch })
  return (
    <div className={`wardrobe ${panel.wide ? 'wide' : 'tall'}${fit.stacked ? ' stacked' : ''}`} style={box}>
      <div className="tabs">
        {PARTS.map((part) => (
          <Btn key={part} className={`tab${part === view.tab ? ' on' : ''}`} label={inLang(PART_NAMES[part], lang)} onTap={() => game.button({ kind: 'tab', part }, 'pick')}>
            <PartPic look={tabLook(look, part)} part={part} className="pic" />
          </Btn>
        ))}
      </div>
      <div className="main">
        <div className="pick">
          <div className="options">
            {view.options.map((o) => (
              <Btn key={JSON.stringify(o.patch)} className={`option${o.on ? ' on' : ''}`} label={inLang(optionName(o.patch), lang)} onTap={() => wear(o.patch)}>
                <PartPic look={{ ...look, ...o.patch }} part={view.tab} className="pic" />
              </Btn>
            ))}
          </div>
          {view.colours.length > 0 && (
            <div className="colours">
              {view.colours.map((c) => (
                <Btn key={JSON.stringify(c.patch)} className={`colour${c.on ? ' on' : ''}`} label={inLang(optionName(c.patch), lang)} style={{ '--swatch': swatch(c.patch) } as CSSProperties} onTap={() => wear(c.patch)}>
                  <span className="dot" />
                </Btn>
              ))}
            </div>
          )}
        </div>
        <div className="foot">
          <Btn className="round dice" label={inLang(WORDS.dice, lang)} onTap={() => game.dispatch({ kind: 'dice' })}>
            <DiceIcon />
          </Btn>
          <Btn className={`round undo${view.undo ? '' : ' off'}`} label={inLang(WORDS.undo, lang)} onTap={() => view.undo && game.dispatch({ kind: 'undoDice' })}>
            <UndoIcon />
          </Btn>
          <Btn className={`go${view.go ? ' pulse' : ''}`} label={inLang(WORDS.go, lang)} onTap={() => game.dispatch({ kind: 'go' })}>
            <span className="say">{inLang(WORDS.go, lang)}</span>
          </Btn>
        </div>
      </div>
    </div>
  )
}
