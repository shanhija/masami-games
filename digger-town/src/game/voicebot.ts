/**
 * The voice bot: it plays like a child with a parent's help, by talking only, in either
 * language. It reads what the screen shows (the marker `stepPointer`, the button's picture
 * `actionFace` and `actionReady`, which machine is in) and acts only through what the microphone
 * does: `parseBest` and `say`. It says one short sentence at most every `SAY_EVERY` seconds: a
 * machine's name (the words to try), or a verb from a small table.
 */

import { inLang } from '../../../profiles/src/lang'
import type { Lang, Words } from '../../../profiles/src/lang'
import { MACHINE_NAMES } from '../words'
import type { ActionFace, Sim } from './model'
import { parseBest } from './speech'
import { actionFace, actionReady, say, stepPointer } from './sim'

/** Seconds between two sentences: a child needs a breath. */
export const SAY_EVERY = 1.5

const GO_THERE: Words = { fi: 'aja sinne', en: 'go there' }

/** What a child says for each picture on the big button. */
const VERB: Record<ActionFace, Words> = {
  none: GO_THERE,
  dig: { fi: 'kaiva', en: 'dig' },
  dump: { fi: 'kaada', en: 'dump' },
  tip: { fi: 'kippaa', en: 'tip' },
  bladeUp: GO_THERE,
  bladeDown: GO_THERE,
  stomp: { fi: 'jyrää', en: 'roll' },
  pour: { fi: 'valaa', en: 'pour' },
  pick: { fi: 'nosta', en: 'pick up' },
  drop: { fi: 'laske', en: 'put down' },
  hook: { fi: 'nosta', en: 'lift' },
  unhook: { fi: 'laske', en: 'put down' },
  unload: { fi: 'pura', en: 'unload' },
}

export interface VoiceBot {
  lang: Lang
  /** The next time a sentence may be said. */
  nextAt: number
  /** Every sentence said, with the time, for a test to read. */
  said: { at: number; text: string }[]
}

export const createVoiceBot = (lang: Lang): VoiceBot => ({ lang, nextAt: 0, said: [] })

/** What the child says now, or null when there is nothing to say (the step only waits, or the machine is not here yet). */
export function sentenceFor(s: Sim, lang: Lang): string | null {
  const p = stepPointer(s)
  if (p === null) return null
  if (p.machine !== s.active) return s.machines[p.machine].unlocked ? inLang(MACHINE_NAMES[p.machine], lang) : null
  const face = actionFace(s, s.active)
  if (p.press && face !== null && actionReady(s)) return inLang(VERB[face], lang)
  return inLang(GO_THERE, lang)
}

/** One frame: says a sentence if it is time and there is one. Returns it. */
export function voiceFrame(bot: VoiceBot, s: Sim): string | null {
  if (s.time < bot.nextAt) return null
  const text = sentenceFor(s, bot.lang)
  if (text === null) return null
  bot.nextAt = s.time + SAY_EVERY
  bot.said.push({ at: s.time, text })
  parseBest([text], bot.lang).forEach((clause, i) => say(s, clause, i > 0))
  return text
}
