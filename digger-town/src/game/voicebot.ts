/**
 * The voice bot: it plays like a child with a parent's help, by talking only. It reads what the
 * screen shows (the marker `stepPointer`, the button's picture `actionFace` and `actionReady`,
 * which machine is in) and acts only through what the microphone does: `parseBest` and `say`.
 * It says one short sentence at most every `SAY_EVERY` seconds, from a small table.
 */

import type { ActionFace, MachineKind, Sim } from './model'
import { parseBest } from './speech'
import { actionFace, actionReady, say, stepPointer } from './sim'

/** Seconds between two sentences: a child needs a breath. */
export const SAY_EVERY = 1.5

/** What a child calls each machine. */
const NAME: Record<MachineKind, string> = {
  digger: 'kaivuri',
  dumper: 'kippiauto',
  dozer: 'puskutraktori',
  roller: 'jyrä',
  mixer: 'betoniauto',
  forklift: 'trukki',
  tower: 'nosturi',
  semi: 'rekka',
  mobile: 'autonosturi',
}

/** What a child says for each picture on the big button. */
const VERB: Record<ActionFace, string> = {
  none: 'aja sinne',
  dig: 'kaiva',
  dump: 'kaada',
  tip: 'kippaa',
  bladeUp: 'aja sinne',
  bladeDown: 'aja sinne',
  stomp: 'jyrää',
  pour: 'valaa',
  pick: 'nosta',
  drop: 'laske',
  hook: 'nosta',
  unhook: 'laske',
  unload: 'pura',
}

export interface VoiceBot {
  /** The next time a sentence may be said. */
  nextAt: number
  /** Every sentence said, with the time, for a test to read. */
  said: { at: number; text: string }[]
}

export const createVoiceBot = (): VoiceBot => ({ nextAt: 0, said: [] })

/** What the child says now, or null when there is nothing to say (the step only waits, or the machine is not here yet). */
export function sentenceFor(s: Sim): string | null {
  const p = stepPointer(s)
  if (p === null) return null
  if (p.machine !== s.active) return s.machines[p.machine].unlocked ? NAME[p.machine] : null
  const face = actionFace(s, s.active)
  if (p.press && face !== null && actionReady(s)) return VERB[face]
  return 'aja sinne'
}

/** One frame: says a sentence if it is time and there is one. Returns it. */
export function voiceFrame(bot: VoiceBot, s: Sim): string | null {
  if (s.time < bot.nextAt) return null
  const text = sentenceFor(s)
  if (text === null) return null
  bot.nextAt = s.time + SAY_EVERY
  bot.said.push({ at: s.time, text })
  parseBest([text]).forEach((clause, i) => say(s, clause, i > 0))
  return text
}
