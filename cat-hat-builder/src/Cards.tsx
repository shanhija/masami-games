import { useEffect, useRef, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'

import { inLang, type Lang } from '../../profiles/src/lang'
import { Btn } from './Btn'
import { toScreen, type View } from './game/camera'
import type { Game } from './game/game'
import type { AskView } from './game/hud'
import { hintAim, targets } from './game/layout'
import { ROAD_KINDS, type Look, type State, type Unlock } from './game/model'
import { MoonIcon, PointIcon } from './Icons'
import { HousePic, RoadPic, ThemePic, UnlockPic } from './Pictures'
import { HOUSE_NAMES, ROAD_NAMES, THEME_NAMES, WORDS } from './words'

/** A card layer takes no taps for this long after it opens (seconds): its cards are still popping in, and a tap then was meant for what was there before. */
export const SETTLE = 0.4

/** Whether a click on a card layer opened at `openedAt` counts (both in ms of the page's clock): only when its press, at `pressedAt`, started on the layer itself and after SETTLE. The browser's click after a tap on the canvas has its press elsewhere (null). */
export const layerTakes = (openedAt: number, pressedAt: number | null) => pressedAt !== null && pressedAt - openedAt >= SETTLE * 1000

/** A card layer's guard on its clicks, for its outermost element: a click that does not count (layerTakes) never reaches the layer or its cards. */
export function useLayerTaps() {
  const openedAt = useRef(performance.now())
  const pressedAt = useRef<number | null>(null)
  return {
    onPointerDownCapture: (e: PointerEvent) => {
      pressedAt.current = e.timeStamp
    },
    onClickCapture: (e: MouseEvent) => {
      if (!layerTakes(openedAt.current, pressedAt.current)) e.stopPropagation()
      pressedAt.current = null
    },
  }
}

/**
 * The theme cards' measures as styles.css lays them out (CSS px): the margin round the cards,
 * the gaps between them, a card's border and padding beside its picture and above and below
 * it with the gap to its word, the biggest picture, and the widest row.
 */
const CARDS_MARGIN = 16
const CARD_GAP = { row: 22, col: 18 }
const CARD_SIDES = 26
const CARD_ENDS = 30
const BIGGEST_THEME = 142
const WIDEST_ROW = 960
/** A theme card's word is this much of its picture's width, between WORD_LEAST and WORD_MOST px: the longest name (Liukumäki, 4.6 em; Birthday is 4 em) fits under a small picture, and still reads on a phone. Under the smallest pictures styles.css shrinks a Finnish word below WORD_LEAST. */
const WORD_K = 0.2
const WORD_LEAST = 14
const WORD_MOST = 28
/** The word's line is this much of its size. */
const LINE = 1.1

/** The size of the theme cards' pictures and words (CSS px) that shows all `n` cards at once on a w x h window: the best over every number of columns. */
export function fitThemeCards(n: number, w: number, h: number): { pic: number; word: number } {
  const aw = Math.min(w - 2 * CARDS_MARGIN, WIDEST_ROW)
  const ah = h - 2 * CARDS_MARGIN
  let best = 0
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols)
    const byWidth = (aw - (cols - 1) * CARD_GAP.col) / cols - CARD_SIDES
    const row = (ah - (rows - 1) * CARD_GAP.row) / rows - CARD_ENDS
    // The biggest picture whose word (WORD_K of it, between WORD_LEAST and WORD_MOST) still fits the row under it.
    const byHeight = Math.min(row - WORD_LEAST * LINE, Math.max(row / (1 + WORD_K * LINE), row - WORD_MOST * LINE))
    best = Math.max(best, Math.min(byWidth, byHeight))
  }
  const pic = Math.floor(Math.min(BIGGEST_THEME, best))
  return { pic, word: Math.min(WORD_MOST, Math.max(WORD_LEAST, Math.floor(WORD_K * pic))) }
}

/**
 * The picture cards over the picture: a question (Which house? Which room? Which road?)
 * with one or two words a card, the present's "New!" card, the Good night card, and the hint
 * hand. A question dims the picture; a tap outside its cards closes it. A question and the
 * Good night card take only taps that start on them, once they have settled (useLayerTaps).
 */
export function AskCards({ game, ask, screen, lang }: { game: Game; ask: AskView; screen: { w: number; h: number }; lang: Lang }) {
  const taps = useLayerTaps()
  const fit = ask.kind === 'theme' ? fitThemeCards(ask.themes.length, screen.w, screen.h) : null
  return (
    <div
      className={`dim ask ${ask.kind}`}
      style={fit === null ? undefined : ({ '--pic': `${fit.pic}px`, '--word': `${fit.word}px` } as CSSProperties)}
      {...taps}
      onClick={(e) => {
        if (!(e.target as Element).closest('button')) game.closeAsk()
      }}
    >
      <div className="cards">
        {ask.kind === 'house' &&
          (['tall', 'row'] as const).map((house) => (
            <Btn key={house} className="card house" label={inLang(HOUSE_NAMES[house], lang)} onTap={() => game.dispatch({ kind: 'house', house })}>
              <HousePic kind={house} className="pic" />
              <span className="word">{inLang(HOUSE_NAMES[house], lang)}</span>
            </Btn>
          ))}
        {ask.kind === 'theme' &&
          ask.themes.map((theme) => (
            <Btn key={theme} className={`card theme${theme === ask.current ? ' on' : ''}`} label={inLang(THEME_NAMES[theme], lang)} onTap={() => game.dispatch({ kind: 'theme', theme })}>
              <ThemePic theme={theme} variant={0} className="pic" />
              <span className="word">{inLang(THEME_NAMES[theme], lang)}</span>
            </Btn>
          ))}
        {ask.kind === 'road' &&
          ROAD_KINDS.map((road) => (
            <Btn key={road} className="card road" label={inLang(ROAD_NAMES[road], lang)} onTap={() => game.dispatch({ kind: 'road', road })}>
              <RoadPic kind={road} className="pic" />
              <span className="word">{inLang(ROAD_NAMES[road], lang)}</span>
            </Btn>
          ))}
      </div>
    </div>
  )
}

/** What the present held, under "New!": it pops in, stays a moment and goes (taps go through it). */
export function PresentCard({ got, look, lang }: { got: Unlock | 'gems'; look: Look; lang: Lang }) {
  return (
    <div className="card present">
      <span className="new">{inLang(WORDS.new, lang)}</span>
      <UnlockPic got={got} look={look} className="pic" />
    </div>
  )
}

/** The end of a session: a still card over the dark street; a tap anywhere wakes the street up. */
export function GoodNight({ game, lang }: { game: Game; lang: Lang }) {
  const taps = useLayerTaps()
  return (
    <div className="dim night" {...taps} onClick={() => game.dispatch({ kind: 'wake' })}>
      <div className="card goodnight">
        <span className="moon">
          <MoonIcon />
        </span>
        <span className="word">{inLang(WORDS.goodNightCard, lang)}</span>
      </div>
    </div>
  )
}

/** The hint hand's fingertip stays this far (CSS px) inside the screen's edges, so the whole hand shows however it turns. */
const HAND_EDGE = 48

/** Where the hint hand's fingertip goes for a target at (x, y) on a w x h screen, and how far it turns (degrees, 0 pointing up): on the target when it is on screen, else at the nearest point inside the edge, pointing the way to it. */
export function handAt(x: number, y: number, w: number, h: number): { x: number; y: number; turn: number } {
  const cx = Math.min(w - HAND_EDGE, Math.max(HAND_EDGE, x))
  const cy = Math.min(h - HAND_EDGE, Math.max(HAND_EDGE, y))
  if (cx === x && cy === y) return { x, y, turn: 0 }
  return { x: cx, y: cy, turn: (Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90 }
}

/** Where the hint hand goes for the state on view `v` (handAt): to the middle of what shows of the hinted target (layout's hintAim, else its rect), or nowhere when the shot offers no such target. */
export function handFor(s: State, v: View): { x: number; y: number; turn: number } | null {
  const hint = JSON.stringify(s.hint)
  const target = targets(s).find((t) => JSON.stringify(t.hit) === hint)
  if (!target) return null
  const aim = hintAim(s, target.hit) ?? target.rect
  const [x, y] = toScreen(v, aim.x + aim.w / 2, aim.y + aim.h / 2)
  return handAt(x, y, v.w, v.h)
}

/** The hand that taps the one thing bouncing, twice, after a while with no touch: it finds its place on the screen every frame (handFor), as the camera moves, and points the way from the edge while the target is off screen. */
export function HintHand({ game }: { game: Game }) {
  const el = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const frame = () => {
      raf = requestAnimationFrame(frame)
      const v = game.view
      const at = v && handFor(game.state, v)
      el.current!.style.visibility = at ? 'visible' : 'hidden'
      if (!at) return
      el.current!.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px) rotate(${at.turn.toFixed(1)}deg)`
    }
    frame()
    return () => cancelAnimationFrame(raf)
  }, [game])
  return (
    <div className="hint" ref={el}>
      <span className="finger">
        <PointIcon />
      </span>
    </div>
  )
}
