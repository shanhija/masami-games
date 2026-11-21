import { describe, expect, it } from 'vitest'

import { pickVoice } from './voice'

const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice

describe('the voice for a language', () => {
  const voices = [voice('Samantha', 'en-US'), voice('Daniel', 'en-GB'), voice('Satu', 'fi-FI'), voice('Anna', 'de-DE')]

  it("is the language's own voice first, else any voice of the language", () => {
    expect(pickVoice(voices, 'fi')!.name).toBe('Satu')
    expect(pickVoice(voices, 'en')!.name).toBe('Daniel')
    expect(pickVoice([voice('Samantha', 'en-US'), voice('Satu', 'fi-FI')], 'en')!.name).toBe('Samantha')
    expect(pickVoice([voice('Karen', 'en_AU')], 'en')!.name).toBe('Karen')
  })

  it('is none when the browser has no voice for the language: another language never reads the words', () => {
    expect(pickVoice([voice('Samantha', 'en-US'), voice('Anna', 'de-DE')], 'fi')).toBeNull()
    expect(pickVoice([], 'en')).toBeNull()
  })
})
