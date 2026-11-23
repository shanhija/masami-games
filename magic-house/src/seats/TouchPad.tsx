import './TouchPad.css'

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'

import { NO_POINT, type PadPart, type SeatInput } from './input'
import type { TouchPad } from './types'

/**
 * How tall the band of touch pads at the bottom of the screen is, in CSS pixels, for a screen
 * this tall: a third of it, kept between a size a thumb can use and one that leaves the room
 * most of the screen. The scene fits the camera's frame above it when a touch pad is shown, so
 * the play is never under a thumb.
 */
export function padBand(screenHeight: number): number {
  return Math.round(Math.min(240, Math.max(150, screenHeight * 0.3)))
}

/** How far a thumb pushes the stick to full, as a share of the band's height. */
const REACH = 0.3

const noMenu = (e: { preventDefault: () => void }) => e.preventDefault()

/**
 * One touch pad, filling its half of the band (pad 0 the left half, pad 1 the right): a thumb
 * stick on its left side and the two big buttons on its right, as on a gamepad. The stick floats:
 * it is pushed from wherever the thumb lands on its side, so a child need not find its middle.
 * Every finger is tracked by its pointer, let go on up, cancel and a lost capture, and none of it
 * is ever pointing (NO_POINT). Without a seat (`color` null) it is the pad's place, waiting for a
 * touch to claim it, showing `waiting`.
 */
export function TouchPadView({ input, pad, color, a, b, waiting }: { input: SeatInput; pad: TouchPad; color: string | null; a: ReactNode | null; b: ReactNode | null; waiting: ReactNode }) {
  const stickArea = useRef<HTMLDivElement>(null)
  /** The thumb as drawn, relative to the stick's side, or null at rest. */
  const [thumb, setThumb] = useState<{ from: { x: number; y: number }; now: { x: number; y: number }; reach: number } | null>(null)
  const [down, setDown] = useState<Record<PadPart, boolean>>({ a: false, b: false })

  // The window losing focus lets go of everything in the input; the drawing follows.
  useEffect(() => {
    const letGo = () => {
      setThumb(null)
      setDown({ a: false, b: false })
    }
    window.addEventListener('blur', letGo)
    return () => window.removeEventListener('blur', letGo)
  }, [])

  const drawThumb = () => {
    const held = input.thumbOf(pad)
    if (held === null) return setThumb(null)
    const box = stickArea.current!.getBoundingClientRect()
    setThumb({ from: { x: held.from.x - box.left, y: held.from.y - box.top }, now: { x: held.now.x - box.left, y: held.now.y - box.top }, reach: box.height * REACH })
  }

  const stickDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    input.thumbDown(pad, e.pointerId, e.clientX, e.clientY, e.currentTarget.getBoundingClientRect().height * REACH)
    drawThumb()
  }
  const stickMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    input.thumbMove(pad, e.pointerId, e.clientX, e.clientY)
    drawThumb()
  }
  const stickUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    input.thumbUp(pad, e.pointerId)
    drawThumb()
  }

  const button = (part: PadPart, face: ReactNode) => {
    const up = (e: ReactPointerEvent<HTMLDivElement>) => {
      input.buttonUp(pad, part, e.pointerId)
      setDown((d) => ({ ...d, [part]: false }))
    }
    return (
      <div
        className={`pad-button ${part}${down[part] ? ' on' : ''}`}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture(e.pointerId)
          input.buttonDown(pad, part, e.pointerId)
          setDown((d) => ({ ...d, [part]: true }))
        }}
        onPointerUp={up}
        onPointerCancel={up}
        onLostPointerCapture={up}
        onContextMenu={noMenu}
      >
        {face}
      </div>
    )
  }

  // The knob's offset from the stick's middle, held inside its reach.
  const knob = (() => {
    if (thumb === null) return { x: 0, y: 0 }
    const dx = thumb.now.x - thumb.from.x
    const dy = thumb.now.y - thumb.from.y
    const length = Math.hypot(dx, dy)
    const k = length > thumb.reach ? thumb.reach / length : 1
    return { x: dx * k, y: dy * k }
  })()

  return (
    <div className={`touch-pad pad${pad}${color === null ? ' waiting' : ''}`} style={color === null ? undefined : ({ '--seat': color } as CSSProperties)} {...{ [NO_POINT]: '' }}>
      <div ref={stickArea} className="pad-stick" onPointerDown={stickDown} onPointerMove={stickMove} onPointerUp={stickUp} onPointerCancel={stickUp} onLostPointerCapture={stickUp} onContextMenu={noMenu}>
        <div className="stick-base" style={thumb === null ? undefined : { left: thumb.from.x, top: thumb.from.y }}>
          <div className="stick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
        </div>
      </div>
      <div className="pad-buttons">
        {b !== null && button('b', b)}
        {a !== null && button('a', a)}
      </div>
      {color === null && <div className="pad-waiting">{waiting}</div>}
    </div>
  )
}
