import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import { onButton } from './game/layout'

/** Keeps a press from focusing the button, so Space never clicks it (the page blocks the browser's menu for the whole game: useGameInput). */
export const noFocus = (e: { preventDefault: () => void }) => e.preventDefault()

/** The button's box on the page, CSS px. */
const boxOf = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/**
 * Every HUD button: a block with a darker bottom face that collapses when pressed (styles.css
 * `.btn`, and `.down` from the press on), taking no focus. It acts when its press lifts within
 * layout.SLOP of it, never on the browser's click: a five-year-old's tap slides up to 4 mm, and
 * a sliding tap makes no click. A press that slides further off lets go with nothing done.
 * `label` names it for a screen reader; the child sees pictures. Most buttons have no `style`;
 * a colour swatch sets its colour there.
 */
export function Btn({ className, label, onTap, style, children }: { className: string; label: string; onTap: () => void; style?: CSSProperties; children: ReactNode }) {
  const press = useRef<number | null>(null)
  const [down, setDown] = useState(false)
  const end = () => {
    press.current = null
    setDown(false)
  }
  const begin = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || press.current !== null) return
    // The button keeps the press wherever the finger slides, so its lift comes here.
    e.currentTarget.setPointerCapture(e.pointerId)
    press.current = e.pointerId
    setDown(true)
  }
  const move = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (press.current === e.pointerId && !onButton(boxOf(e.currentTarget), e.clientX, e.clientY)) end()
  }
  const lift = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (press.current !== e.pointerId) return
    end()
    if (onButton(boxOf(e.currentTarget), e.clientX, e.clientY)) onTap()
  }
  const cancel = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (press.current === e.pointerId) end()
  }
  return (
    <button
      type="button"
      tabIndex={-1}
      className={`btn ${className}${down ? ' down' : ''}`}
      aria-label={label}
      style={style}
      onMouseDown={noFocus}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={lift}
      onPointerCancel={cancel}
      onLostPointerCapture={cancel}
    >
      {children}
    </button>
  )
}
