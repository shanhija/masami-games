/**
 * What a sign shows, laid out: a number or words as text, a count as a row of dots (as text past
 * DOTS_MAX), a clock as a ring that empties (engine/api.ts BUILDER_REF sign). Pure, so the layouts
 * are tested; Signs.ts paints them on a canvas.
 */

import { inLang, SPEECH_TAG, type Lang } from '../../../profiles/src/lang'
import type { SignShown } from '../engine/world'

/** The most dots a count shows; past it the count is written as numbers. */
export const DOTS_MAX = 10

/** A sign as it is painted. A clock's `left` is the share of its time still to go, 0 to 1. */
export type SignLayout = { kind: 'text'; text: string } | { kind: 'dots'; filled: number; of: number } | { kind: 'ring'; left: number }

/** A number as the language writes it: whole numbers as they are, others with one decimal (a comma in Finnish). */
export function numberText(n: number, lang: Lang): string {
  return n.toLocaleString(SPEECH_TAG[lang], { maximumFractionDigits: 1, useGrouping: false })
}

export function signLayout(what: SignShown, t: number, lang: Lang): SignLayout {
  if (typeof what === 'number') return { kind: 'text', text: numberText(what, lang) }
  if ('en' in what) return { kind: 'text', text: inLang(what, lang) }
  if ('clock' in what) return { kind: 'ring', left: what.clock <= 0 ? 0 : Math.min(1, Math.max(0, 1 - (t - what.from) / what.clock)) }
  const of = Math.max(0, Math.round(what.of))
  const filled = Math.min(of, Math.max(0, Math.round(what.count)))
  if (of > DOTS_MAX || of === 0) return { kind: 'text', text: `${numberText(filled, lang)} / ${numberText(of, lang)}` }
  return { kind: 'dots', filled, of }
}

/** Where each dot of a count sits, in dot pitches from the row's middle, and whether it is filled; the filled ones first, from the left. */
export function dotRow(filled: number, of: number): { x: number; filled: boolean }[] {
  return Array.from({ length: of }, (_, i) => ({ x: i - (of - 1) / 2, filled: i < filled }))
}

/** How finely a clock's ring is painted: steps round the whole ring, so its canvas is painted again only when the ring has moved a step. */
export const RING_STEPS = 120

/** The step a clock's ring is painted at: the same step paints the same picture. */
export const ringStep = (left: number) => Math.ceil(left * RING_STEPS)

/** A key that changes exactly when the picture of the sign changes. */
export function layoutKey(l: SignLayout): string {
  switch (l.kind) {
    case 'text':
      return `t:${l.text}`
    case 'dots':
      return `d:${l.filled}/${l.of}`
    case 'ring':
      return `r:${ringStep(l.left)}`
  }
}
