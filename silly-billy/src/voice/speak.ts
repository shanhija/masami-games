/**
 * The avatars' answers, spoken aloud by the browser's own voice: a Finnish one, or an English one
 * when the game is in English, because six-year-olds do not read. Each avatar has its own pitch
 * and pace (kids high, grown-ups low, the cat silly). The lines of one moment are said one after
 * another ("alice ja steve sanokaa hei" is two hellos); the next moment's lines cut off whatever
 * is still being said, so two never talk over each other. Nothing is said when spoken answers are
 * off or the browser has no voice for the language.
 */

import type { Actor } from '../engine/types'

export interface Tone {
  pitch: number
  rate: number
}

/** One line to say aloud, and who says it (null: the narrator). */
export interface Line {
  text: string
  actor: Actor | null
}

/** A small number from a name, so two avatars of the same kind still sound a little different: -0.5 to 0.5. */
function own(id: string): number {
  let h = 7
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1009
  return h / 1008 - 0.5
}

/** How an avatar sounds. The browser takes pitch 0 to 2 and rate around 1. */
export function toneOf(actor: Pick<Actor, 'id' | 'pronoun' | 'look'> | null): Tone {
  if (actor === null) return { pitch: 1, rate: 1 }
  const wobble = own(actor.id)
  switch (actor.look.body) {
    case 'kid':
      return { pitch: (actor.pronoun === 'she' ? 1.6 : 1.4) + wobble * 0.2, rate: 1.05 }
    case 'grownup':
      return { pitch: (actor.pronoun === 'she' ? 1.1 : 0.7) + wobble * 0.15, rate: 0.95 }
    case 'cat':
      return { pitch: 2, rate: 1.3 }
    case 'dog':
      return { pitch: 1.3 + wobble * 0.2, rate: 1.2 }
  }
}

/** The browser's speech, where it has any. */
const synth: SpeechSynthesis | null = typeof speechSynthesis === 'undefined' ? null : speechSynthesis

export class Speaker {
  private unlocked = false

  /**
   * On the first touch or key: says nothing, quietly. iOS Safari speaks only after a first
   * speak() inside a touch, and every answer here comes after an await (the plan, the parser).
   */
  unlock() {
    if (synth === null || this.unlocked) return
    this.unlocked = true
    const line = new SpeechSynthesisUtterance(' ')
    line.volume = 0
    synth.speak(line)
  }

  /**
   * Says the lines one after another, each in its actor's voice (the narrator's for null),
   * cutting off whatever was being said before them. The browser queues what it is given and
   * cancel() empties the queue, so the lines that come together are given together.
   */
  say(lines: readonly Line[], lang: 'fi' | 'en') {
    if (synth === null || lines.length === 0) return
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith(lang))
    if (voice === undefined) return
    synth.cancel()
    for (const { text, actor } of lines) {
      const line = new SpeechSynthesisUtterance(text)
      line.voice = voice
      line.lang = voice.lang
      const tone = toneOf(actor)
      line.pitch = tone.pitch
      line.rate = tone.rate
      synth.speak(line)
    }
  }

  /** Quiet now: the microphone is listening, or spoken answers were turned off. */
  hush() {
    if (synth !== null) synth.cancel()
  }
}
