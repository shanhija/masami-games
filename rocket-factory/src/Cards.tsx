import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import { Btn } from './Btn'
import { SIZE, card as cardOf } from './game/catalog'
import type { Game } from './game/game'
import type { HudView, PathCard } from './game/hud'
import { toScreen } from './game/layout'
import type { CardId } from './game/model'
import { MoonIcon, PlayIcon, TickIcon, TurnIcon } from './Icons'
import { BeepPicture, CardPic, FactoryPic, RocketPic } from './Pictures'

/** A card layer takes no taps for this long after it opens (seconds): a card found flips in (0.6 s) while Beep says its word, and a tap then was meant for what was there before. */
export const SETTLE = 1
/** A menu her tap opened (the pause menu, the path) and the start card settle sooner: what they must not take is only that same finger's second tap, and Play and a parent's buttons are pressed at once. */
export const MENU_SETTLE = 0.4

/** Whether a press on a card layer opened at `openedAt` counts (both in ms of the page's clock): only once the layer has settled, `settle` seconds after it opened. */
export const layerTakes = (openedAt: number, pressedAt: number, settle: number) => pressedAt - openedAt >= settle * 1000

/**
 * A card layer's taps, for its outermost element: `onTap` at the lift of a press that went down
 * on the layer itself (a button or a label on it acts on its own, as every Btn does) once the layer
 * has settled. It acts on the lift, never on the browser's click, which a sliding tap never
 * makes; and a press before it settled reaches neither the layer nor its buttons.
 */
export function useLayerTaps(onTap: () => void, settle: number) {
  const openedAt = useRef(performance.now())
  const pressed = useRef<number | null>(null)
  return {
    onPointerDownCapture: (e: PointerEvent) => {
      pressed.current = null
      if (!layerTakes(openedAt.current, e.timeStamp, settle)) e.stopPropagation()
      else if ((e.target as Element).closest('button, label') === null) pressed.current = e.pointerId
    },
    onPointerUp: (e: PointerEvent) => {
      if (pressed.current !== e.pointerId) return
      pressed.current = null
      onTap()
    },
    onPointerCancel: () => {
      pressed.current = null
    },
  }
}

/** The start card: a big Beep waving, the rocket as built so far, the next card's picture, and Play, bouncing. A tap anywhere on it plays. */
export function StartCard({ game, view }: { game: Game; view: HudView }) {
  const taps = useLayerTaps(() => game.play(), MENU_SETTLE)
  return (
    <div className="dim start" {...taps}>
      <div className="card start-card">
        <BeepPicture pose="wave" animate className="beep" />
        <div className="so-far">
          <RocketPic parts={view.rocket.parts} className="rocket" />
          {view.lab.next !== null && <CardPic id={view.lab.next} animate={false} className="next ground" />}
        </div>
        <Btn className="play" label="Play" onTap={() => game.play()}>
          <PlayIcon />
        </Btn>
      </div>
    </div>
  )
}

/** A card found: it flips over with its one picture and one word (Beep says it), a card the lab found flipping out of the lab while its stars join into the card's picture. The rules close it; a tap anywhere is hers. */
export function DiscoveryCard({ game, card }: { game: Game; card: NonNullable<HudView['card']> }) {
  const taps = useLayerTaps(() => game.dispatch({ kind: 'card' }), SETTLE)
  const [from] = useState(() => outOfLab(game, card.id))
  return (
    <div className="layer discovery" {...taps}>
      <div className={from === null ? 'card found' : 'card found from-lab'} style={from ?? undefined}>
        <CardPic id={card.id} animate className="pic ground" />
        <span className="word">{card.word}</span>
      </div>
    </div>
  )
}

/** Where a card the lab found flips out from, as styles.css's outOfLab wants it: the lab's middle on the screen, from the screen's middle where the card stands. Null for a card found elsewhere (the rocket's legs, the first gold bar) or with no lab on the board. */
function outOfLab(game: Game, id: CardId): CSSProperties | null {
  const lab = game.state.buildings.find((b) => b.kind === 'lab')
  const v = game.view
  if (lab === undefined || v === null || cardOf(id).needs.kind !== 'bottles') return null
  const [x, y] = toScreen(v, lab.x + SIZE.lab / 2, lab.y + SIZE.lab / 2)
  return { '--from-x': `${Math.round(x - v.w / 2)}px`, '--from-y': `${Math.round(y - v.h / 2)}px` } as CSSProperties
}

/**
 * The lab's one choice, in the middle of the board: Bubbles! and Hedges! as two big pictures
 * side by side, bobbing, while Beep asks "Which one?" (game.ts). A tap on one picks it, and the
 * lab works on that card first; a tap anywhere else makes both wiggle, asking again. The lab
 * card keeps the two pictures too, and the path view.
 */
export function ChoiceCard({ game }: { game: Game }) {
  const [asked, setAsked] = useState(0)
  const taps = useLayerTaps(() => {
    game.audio.ui('tap')
    setAsked((n) => n + 1)
  }, SETTLE)
  return (
    <div className="layer choose" {...taps}>
      <div key={asked} className={`card which${asked > 0 ? ' wiggle' : ''}`}>
        {(['bubbles', 'hedges'] as const).map((c) => (
          <Btn key={c} className="pick ground" label={c === 'bubbles' ? 'Bubbles' : 'Hedges'} onTap={() => game.choose(c)}>
            <CardPic id={c} animate={false} className="pic" />
          </Btn>
        ))}
      </div>
    </div>
  )
}

/**
 * The lab card's tap: the whole path as picture cards, the found ones ticked, the one coming
 * now glowing, the later ones grey. While the choice waits its two cards both glow, and a tap
 * on one picks it. A tap anywhere else closes it.
 */
export function PathView({ game, path, choice }: { game: Game; path: readonly PathCard[]; choice: boolean }) {
  const taps = useLayerTaps(() => game.closePath(), MENU_SETTLE)
  return (
    <div className="dim path" {...taps}>
      <div className="cards">
        {path.map((c) =>
          choice && (c.id === 'bubbles' || c.id === 'hedges') ? (
            <Btn key={c.id} className={`card step ${c.at}`} label={c.id === 'bubbles' ? 'Bubbles' : 'Hedges'} onTap={() => game.choose(c.id as 'bubbles' | 'hedges')}>
              <CardPic id={c.id} animate={false} className="pic ground" />
            </Btn>
          ) : (
            <span key={c.id} className={`card step ${c.at}`}>
              <CardPic id={c.id} animate={false} className="pic ground" />
              {c.at === 'done' && (
                <span className="tick">
                  <TickIcon />
                </span>
              )}
            </span>
          ),
        )}
      </div>
    </div>
  )
}

/**
 * Good night's still card: her factory asleep, the rocket so far and today's cards as small
 * pictures. It stays asleep: a tap on it makes Beep murmur in its sleep and a z float up, nothing
 * more. Morning is the grown-up's Keep going in the pause menu (its button stays over the card),
 * or the next session's.
 */
export function GoodNightCard({ game, view }: { game: Game; view: HudView }) {
  const taps = useLayerTaps(() => game.murmur(), SETTLE)
  return (
    <div className="dim night" {...taps}>
      <div className="card goodnight">
        <span className="moon">
          <MoonIcon />
        </span>
        {game.murmurs > 0 && (
          <span key={game.murmurs} className="snore" aria-hidden>
            z
          </span>
        )}
        <FactoryPic state={game.state} className="factory" />
        <div className="day">
          <RocketPic parts={view.rocket.parts} className="rocket" />
          {view.today.map((id) => (
            <CardPic key={id} id={id} animate={false} className="today ground" />
          ))}
        </div>
      </div>
    </div>
  )
}

/** A phone held upright: the HUD does not fit across it, so a picture asks her to turn it on its side. */
export function TurnMe() {
  return (
    <div className="turn-me">
      <TurnIcon />
    </div>
  )
}
