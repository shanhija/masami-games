/**
 * Words said aloud by the browser's own speech, in a language's voice (profiles' pickVoice): the
 * helper's hints. Silent where the browser has no speech or no voice for the language, and while
 * the pause card has the sound off (Silly Billy's Sounds.muted), so a parent who turns the sound
 * off gets a quiet room.
 */

import type { Lang } from '../../../profiles/src/lang'
import { pickVoice } from '../../../profiles/src/voice'

/** The browser's speech, where it has any. */
const synth: SpeechSynthesis | null = typeof speechSynthesis === 'undefined' ? null : speechSynthesis

/** A silent word inside a press: iOS speaks later only after a first speak in a touch. */
export function unlockSpeech(): void {
  if (synth === null) return
  const quiet = new SpeechSynthesisUtterance(' ')
  quiet.volume = 0
  synth.speak(quiet)
}

/** Says `text` in `lang`'s voice, cutting off whatever was being said; nothing when there is no voice for it. */
export function say(text: string, lang: Lang): void {
  if (synth === null) return
  const voice = pickVoice(synth.getVoices(), lang)
  if (voice === null) return
  synth.cancel()
  const line = new SpeechSynthesisUtterance(text)
  line.voice = voice
  line.lang = voice.lang
  line.rate = 0.95
  synth.speak(line)
}

/** Stops whatever is being said: the sound was turned off, or the room was left. */
export function hush(): void {
  if (synth !== null) synth.cancel()
}
