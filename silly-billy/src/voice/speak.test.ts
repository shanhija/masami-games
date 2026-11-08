import { afterEach, describe, expect, it, vi } from 'vitest'

import type { BodyKind, Pronoun } from '../engine/types'
import { toneOf } from './speak'

const actor = (id: string, body: BodyKind, pronoun: Pronoun) => ({
  id,
  pronoun,
  look: { body, height: 1.15, build: 1, skin: '#ffd9b3', eyes: '#2b2b30', top: '#9b5fd3', bottom: '#4a78e0', shoes: '#2b2b30', skirt: false, worn: {} },
})

describe('toneOf', () => {
  it('gives kids high voices, a grown-up man a low one and the cat the silliest', () => {
    const alice = toneOf(actor('alice', 'kid', 'she'))
    const steve = toneOf(actor('steve', 'kid', 'he'))
    const mike = toneOf(actor('mike', 'grownup', 'he'))
    const mirri = toneOf(actor('mirri', 'cat', 'it'))
    expect(alice.pitch).toBeGreaterThan(mike.pitch + 0.5)
    expect(steve.pitch).toBeGreaterThan(mike.pitch + 0.5)
    expect(mike.pitch).toBeLessThan(1)
    expect(mirri.pitch).toBeGreaterThan(alice.pitch)
    expect(mirri.rate).toBeGreaterThan(alice.rate)
  })

  it('makes two kids of the same kind sound a little different, always within what the browser takes', () => {
    const names = ['alice', 'noora', 'ella', 'venla', 'lilja', 'aino', 'siiri', 'hilla']
    const pitches = names.map((n) => toneOf(actor(n, 'kid', 'she')).pitch)
    expect(new Set(pitches).size).toBeGreaterThan(4)
    for (const body of ['kid', 'grownup', 'cat', 'dog'] as const)
      for (const n of names) {
        const t = toneOf(actor(n, body, 'he'))
        expect(t.pitch).toBeGreaterThanOrEqual(0)
        expect(t.pitch).toBeLessThanOrEqual(2)
        expect(t.rate).toBeGreaterThan(0.5)
        expect(t.rate).toBeLessThan(1.5)
      }
  })

  it('speaks a line with no actor in a plain voice', () => {
    expect(toneOf(null)).toEqual({ pitch: 1, rate: 1 })
  })
})

describe('Speaker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('says nothing, quietly, on the first touch only, so iOS lets the answers speak later', async () => {
    const spoken: Array<{ text: string; volume: number }> = []
    vi.stubGlobal('speechSynthesis', { speak: (u: { text: string; volume: number }) => spoken.push({ text: u.text, volume: u.volume }), cancel() {}, getVoices: () => [] })
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        volume = 1
        constructor(public text: string) {}
      },
    )
    vi.resetModules()
    const { Speaker } = await import('./speak')
    const speaker = new Speaker()
    speaker.unlock()
    speaker.unlock()
    expect(spoken).toEqual([{ text: ' ', volume: 0 }])
  })

  it('says the lines that come together one after another, and the next ones cut off what is left', async () => {
    // The browser's voice: speak() queues a line, cancel() empties the queue and stops the line being said.
    const queue: string[] = []
    const cut: string[] = []
    vi.stubGlobal('speechSynthesis', { speak: (u: { text: string }) => void queue.push(u.text), cancel: () => void cut.push(...queue.splice(0)), getVoices: () => [{ lang: 'fi-FI' }] })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(readonly text: string) {}
    })
    vi.resetModules()
    const { Speaker } = await import('./speak')
    const speaker = new Speaker()
    speaker.say(
      [
        { text: 'Hei Steve!', actor: null },
        { text: 'Hei Alice!', actor: null },
      ],
      'fi',
    )
    expect([queue, cut]).toEqual([['Hei Steve!', 'Hei Alice!'], []])
    speaker.say([{ text: 'Moi!', actor: null }], 'fi')
    expect([queue, cut]).toEqual([['Moi!'], ['Hei Steve!', 'Hei Alice!']])
  })

  it('speaks in a voice of the game’s language, and says nothing when the browser has none: English is never read by a Finnish voice', async () => {
    const said: string[] = []
    let voices = [{ lang: 'en-GB' }, { lang: 'fi-FI' }]
    vi.stubGlobal('speechSynthesis', { speak: (u: { text: string; lang: string }) => void said.push(`${u.lang} ${u.text}`), cancel() {}, getVoices: () => voices })
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      lang = ''
      constructor(readonly text: string) {}
    })
    vi.resetModules()
    const { Speaker } = await import('./speak')
    const speaker = new Speaker()
    speaker.say([{ text: 'Okei!', actor: null }], 'fi')
    speaker.say([{ text: 'Okay!', actor: null }], 'en')
    voices = [{ lang: 'fi-FI' }]
    speaker.say([{ text: 'Watch me!', actor: null }], 'en')
    expect(said).toEqual(['fi-FI Okei!', 'en-GB Okay!'])
  })
})
