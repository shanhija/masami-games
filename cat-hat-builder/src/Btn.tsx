import type { CSSProperties, ReactNode } from 'react'

/** Keeps a press from focusing the button, so Space never clicks it (the page blocks the browser's menu for the whole game: useGameInput). */
export const noFocus = (e: { preventDefault: () => void }) => e.preventDefault()

/**
 * Every HUD button: a block with a darker bottom face that collapses when pressed (styles.css
 * `.btn`), taking no focus. `label` names it for a screen reader; the child sees pictures.
 * Most buttons have no `style`; a colour swatch sets its colour there.
 */
export function Btn({ className, label, onTap, style, children }: { className: string; label: string; onTap: () => void; style?: CSSProperties; children: ReactNode }) {
  return (
    <button type="button" tabIndex={-1} className={`btn ${className}`} aria-label={label} style={style} onMouseDown={noFocus} onClick={onTap}>
      {children}
    </button>
  )
}
