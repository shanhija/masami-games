/**
 * The browser's voice for a language, for every game that speaks: one for the language's own
 * tag first (`fi-FI`, `en-GB`), else any voice of the language. With none for the language the
 * game stays silent: another language's voice never reads the words.
 */

import { SPEECH_TAG, type Lang } from './lang'

/** The voice for `lang` among `voices` (the browser's `speechSynthesis.getVoices()`), or null when there is none. */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: Lang): SpeechSynthesisVoice | null {
  const tag = SPEECH_TAG[lang].toLowerCase()
  const of = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-')
  return voices.find((v) => of(v) === tag) ?? voices.find((v) => of(v).split('-')[0] === lang) ?? null
}
