/**
 * The free part of the screen: the window without the HUD. Measured from the page when the window
 * resizes or the HUD changes, never in a frame, so the camera and the edge arrow keep to what a
 * child can see and tap: below the bubble and the counters, above the portraits, left of the buttons.
 */

import type { Area } from './frame'

/** Pixels kept clear of the HUD. */
const MARGIN = 10

const area: Area = { left: 0, top: 0, right: 0, bottom: 0 }
let measured = false

const rectOf = (selector: string): DOMRect | null => {
  const e = document.querySelector(selector)
  if (e === null) return null
  const r = e.getBoundingClientRect()
  return r.width > 0 && r.height > 0 ? r : null
}

/** The window less the HUD: the larger of the strip above the portraits and the buttons, and the block left of the buttons. */
export function measureFree(): void {
  const w = window.innerWidth
  const h = window.innerHeight
  const top = ['.bubble', '.topleft', '.topright'].reduce((t, s) => Math.max(t, rectOf(s)?.bottom ?? 0), 0)
  const bottomOf = (selector: string) => rectOf(selector)?.top ?? h
  const rightOf = (selector: string) => rectOf(selector)?.left ?? w
  const above = Math.min(bottomOf('.portraits'), bottomOf('.cluster'))
  const beside = rightOf('.cluster')
  const strip = { left: 0, top, right: w, bottom: above }
  const block = { left: 0, top, right: beside, bottom: bottomOf('.portraits') }
  const size = (a: Area) => (a.right - a.left) * (a.bottom - a.top)
  const best = size(strip) > size(block) ? strip : block
  area.left = best.left + (best.left > 0 ? MARGIN : 0)
  area.top = best.top > 0 ? best.top + MARGIN : 0
  area.right = best.right < w ? best.right - MARGIN : w
  area.bottom = best.bottom < h ? best.bottom - MARGIN : h
  if (!(area.right > area.left && area.bottom > area.top)) throw new Error(`the free area ${JSON.stringify(area)} is empty in a window of ${w} by ${h}`)
  measured = true
}

/** The free area, in window pixels. Measured at the first ask and by `watchHud` after. */
export function freeArea(): Readonly<Area> {
  if (!measured) measureFree()
  return area
}

/** Measures again whenever the window resizes, the HUD's elements come, go or change size, or an animation or transition in it ends. Returns the way to stop. */
export function watchHud(): () => void {
  const again = () => measureFree()
  const sizes = new ResizeObserver(again)
  const looks = () => {
    sizes.disconnect()
    for (const s of ['.bubble', '.topleft', '.topright', '.portraits', '.cluster']) {
      const e = document.querySelector(s)
      if (e !== null) sizes.observe(e)
    }
    again()
  }
  const changes = new MutationObserver(looks)
  changes.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('resize', again)
  document.addEventListener('transitionend', again, true)
  document.addEventListener('animationend', again, true)
  looks()
  return () => {
    changes.disconnect()
    sizes.disconnect()
    window.removeEventListener('resize', again)
    document.removeEventListener('transitionend', again, true)
    document.removeEventListener('animationend', again, true)
  }
}
