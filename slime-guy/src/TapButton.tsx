import type { CSSProperties, ReactNode } from 'react'

import type { Game } from './game/game'
import type { SoundKind } from './game/sounds'

/** Keeps the browser's own answer to a press away from a HUD button: no focus on mousedown, no long-press menu. */
export const noDefault = (e: { preventDefault: () => void }) => e.preventDefault()

/**
 * A button of the map and the wardrobe. It never takes focus, so Space and Enter stay the
 * game's keys and never click it a second time, and a long press never opens the browser's
 * menu. A tap runs `onTap` with the button (for a wobble or a jiggle), then plays `sound`:
 * the sound of a tap that reaches no game method, or null when the game method it calls
 * plays its own (every Game method the map and the wardrobe call does). `style` is optional
 * because only the colour swatches carry one, the colour of their ring.
 */
export function TapButton({ game, className, label, sound, style, onTap, children }: {
  game: Game
  className: string
  label: string
  sound: SoundKind | null
  style?: CSSProperties
  onTap: (button: HTMLButtonElement) => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      tabIndex={-1}
      className={className}
      style={style}
      aria-label={label}
      onMouseDown={noDefault}
      onContextMenu={noDefault}
      onClick={(e) => {
        onTap(e.currentTarget)
        if (sound !== null) game.audio.play(sound)
      }}
    >
      {children}
    </button>
  )
}

/** The class names that apply, joined. */
export const cls = (...names: (string | false)[]) => names.filter(Boolean).join(' ')

/** A gentle head shake: that one is not found or not open yet. */
export function wobble(el: HTMLElement) {
  el.animate([{ rotate: '0deg' }, { rotate: '-11deg' }, { rotate: '9deg' }, { rotate: '-6deg' }, { rotate: '3deg' }, { rotate: '0deg' }], { duration: 520, easing: 'ease-out' })
}

/**
 * The head shake of every button that says "not yet": it turns one way, then the other, a
 * little less each time. `scale` sets how far it turns: 1 for a thing not found or not open
 * yet, less for a smaller wiggle like the jar's.
 */
export function shake(el: HTMLElement, scale: number) {
  if (!(scale > 0)) throw new Error(`shake turns by a scale above 0, not ${scale}`)
  el.animate([0, -11, 9, -6, 3, 0].map((deg) => ({ rotate: `${deg * scale}deg` })), { duration: 520, easing: 'ease-out' })
}
