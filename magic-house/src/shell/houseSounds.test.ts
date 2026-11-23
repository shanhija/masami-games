/**
 * The house's sounds (houseSounds.ts) with a stand-in for the browser's audio: a prop's sound, played
 * quieter under the room's, never takes the room's own sound of the same name from it, even in the
 * same frame; two of the room's own within DEDUP are still one sound.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { HouseSounds } from './houseSounds'

/** A stand-in for every audio node and param: any call is taken and gives back the node, so a sound is built whatever it asks; each source made is counted. */
function fakeAudio(): { readonly sources: () => number } {
  let sources = 0
  const node: object = new Proxy(function () {}, {
    get: (...[, key]: [object, string | symbol]) => (key === 'value' ? 0 : node),
    set: () => true,
    apply: () => node,
  })
  class FakeContext {
    constructor() {
      return new Proxy(this, {
        get: (...[, key]: [object, string | symbol]) => {
          if (key === 'currentTime') return 0
          if (key === 'sampleRate') return 8000
          if (key === 'state') return 'running'
          if (key === 'createOscillator' || key === 'createBufferSource')
            return () => {
              sources++
              return node
            }
          if (key === 'createBuffer') return () => ({ getChannelData: () => new Float32Array(4) })
          return () => node
        },
      })
    }
  }
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('window', { setInterval: () => 0 })
  vi.stubGlobal('fetch', () => Promise.reject(new Error('no recordings here')))
  vi.spyOn(console, 'info').mockImplementation(() => {})
  return { sources: () => sources }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("the house's sounds", () => {
  it("play the room's own sound after a prop's of the same name in the same frame, and keep two of the room's own in one frame one sound", async () => {
    const audio = fakeAudio()
    const sounds = new HouseSounds()
    await sounds.library
    sounds.unlock()
    const before = audio.sources()
    sounds.playProp('pop')
    const prop = audio.sources()
    sounds.play('pop')
    const room = audio.sources()
    sounds.play('pop')
    expect([prop > before, room > prop, audio.sources()]).toEqual([true, true, room])
  })
})
