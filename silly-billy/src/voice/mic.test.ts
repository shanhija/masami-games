import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Link } from '../brain/contract'
import { Mic, RATE, cleanWords, wav } from './mic'
import { hearingPrime } from './prime'

const ascii = (v: DataView, at: number, n: number) => String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(at + i)))
const samples = (v: DataView) => Array.from({ length: v.getUint32(40, true) / 2 }, (_, i) => v.getInt16(44 + i * 2, true))

describe('wav', () => {
  it('writes a 16 kHz mono 16-bit PCM header and every block of the clip in order', () => {
    const v = new DataView(wav([new Float32Array([0, 0.25, -0.25]), new Float32Array([1, -1, 2, -2])], RATE))
    expect(ascii(v, 0, 4)).toBe('RIFF')
    expect(v.getUint32(4, true)).toBe(36 + 7 * 2)
    expect(ascii(v, 8, 8)).toBe('WAVEfmt ')
    expect(v.getUint32(16, true)).toBe(16)
    expect(v.getUint16(20, true)).toBe(1)
    expect(v.getUint16(22, true)).toBe(1)
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint32(28, true)).toBe(32000)
    expect(v.getUint16(32, true)).toBe(2)
    expect(v.getUint16(34, true)).toBe(16)
    expect(ascii(v, 36, 4)).toBe('data')
    expect(v.byteLength).toBe(44 + 7 * 2)
    // Too loud is clipped, not wrapped round.
    expect(samples(v)).toEqual([0, 8192, -8192, 32767, -32767, 32767, -32767])
  })

  it('resamples a clip from another rate to 16 kHz, each sample the average of its span', () => {
    const at48 = new Float32Array(4800).map((_, i) => (i % 3 === 0 ? 0.2 : 0.5))
    const v = new DataView(wav([at48], 48000))
    expect(v.getUint32(24, true)).toBe(16000)
    expect(v.getUint32(40, true)).toBe(1600 * 2)
    expect(new Set(samples(v))).toEqual(new Set([Math.round(0.4 * 0x7fff)]))
    // A rate that does not divide evenly still gives a clip of the same length in seconds.
    expect(new DataView(wav([new Float32Array(4410)], 44100)).getUint32(40, true)).toBe(1600 * 2)
  })

  it('makes an empty clip a valid empty file', () => {
    const v = new DataView(wav([], RATE))
    expect(v.byteLength).toBe(44)
    expect(v.getUint32(40, true)).toBe(0)
  })
})

describe('hearingPrime', () => {
  it('names everyone in the language and tells each to do something the game knows', () => {
    expect(hearingPrime('fi', ['Aino', 'Eetu', 'Mikko', 'Noora', 'Mirri'])).toBe('Aino, Eetu, Mikko, Noora ja Mirri leikkivät. Aino, hyppää! Eetu, juokse! Mikko, istu! Noora, laula! Mirri, tule tänne!')
    expect(hearingPrime('en', ['Alice', 'Steve', 'Mike', 'Nora', 'Luna'])).toBe('Alice, Steve, Mike, Nora and Luna are playing. Alice, jump! Steve, run! Mike, sit! Nora, sing! Luna, come here!')
  })

  it('says one name as one, and each name once', () => {
    expect(hearingPrime('fi', ['Aino'])).toBe('Aino leikkii. Aino, hyppää!')
    expect(hearingPrime('en', ['Luna'])).toBe('Luna is playing. Luna, jump!')
    expect(hearingPrime('fi', [' Aino ', 'Eetu', 'Aino', ''])).toBe('Aino ja Eetu leikkivät. Aino, hyppää! Eetu, juokse!')
  })

  it('goes round the things to do again past eight names', () => {
    const nine = ['Aino', 'Eetu', 'Mikko', 'Noora', 'Mirri', 'Ella', 'Venla', 'Onni', 'Lumi']
    expect(hearingPrime('fi', nine)).toContain('Onni, nuku! Lumi, hyppää!')
  })

  it('is still a sentence of the language with nobody in it', () => {
    expect(hearingPrime('fi', [])).toBe('Leikitään yhdessä.')
    expect(hearingPrime('en', [])).toBe("Let's play together.")
  })

  it('keeps to the first sixteen names in a crowd', () => {
    const many = Array.from({ length: 30 }, (_, i) => `Lapsi${i + 1}`)
    const prime = hearingPrime('fi', many)
    expect(prime).toContain('Lapsi16')
    expect(prime).not.toContain('Lapsi17')
  })
})

describe('cleanWords', () => {
  it('drops the noises a recognizer writes in brackets and tidies the spaces', () => {
    expect(cleanWords('[BLANK_AUDIO]')).toBe('')
    expect(cleanWords(' (musiikkia)  Alice,  hyppää! ')).toBe('Alice, hyppää!')
    expect(cleanWords('*naurua* Steve pyöri')).toBe('Steve pyöri')
    expect(cleanWords('Mirri, tule tänne')).toBe('Mirri, tule tänne')
  })
})

// ------------------------------------------------------------------ push-to-talk, with the browser's parts faked

type Heard = [string, string?]

/** A recognizer that hears what the test says it heard, and ends when stopped (unless `stuck`) or aborted. */
class FakeRecognizer {
  static last: FakeRecognizer
  /** stop() never ends the session, as a browser sometimes does. */
  static stuck = false
  /** start() throws, as a browser does while another session is still going. */
  static refuse = false
  lang = ''
  continuous = false
  interimResults = false
  onresult: ((e: { results: { transcript: string }[][] }) => void) | null = null
  onerror: ((e: { error: string }) => void) | null = null
  onend: (() => void) | null = null
  start() {
    if (FakeRecognizer.refuse) throw new Error('InvalidStateError')
    FakeRecognizer.last = this
  }
  stop() {
    if (!FakeRecognizer.stuck) this.onend!()
  }
  abort() {
    this.onend!()
  }
}

/** The microphone's worklet node: the test hands it blocks of samples. */
class FakeNode {
  static last: FakeNode
  port: { onmessage: ((e: { data: Float32Array }) => void) | null } = { onmessage: null }
  constructor() {
    FakeNode.last = this
  }
  connect<T>(n: T) {
    return n
  }
}

class FakeContext {
  sampleRate = RATE
  destination = {}
  audioWorklet = { addModule: async () => {} }
  createMediaStreamSource() {
    return { connect: <T>(n: T) => n }
  }
  createGain() {
    return { gain: { value: 1 }, connect: <T>(n: T) => n }
  }
  async resume() {}
  async close() {}
}

function rig(whisper: boolean, recognizer: boolean) {
  const heard: Heard[] = []
  const asks: { samples: number; lang: string; partial: boolean; prime?: string }[] = []
  /** What the game would prime Whisper with now: the test changes it between clips. */
  const now = { lang: 'fi' as 'fi' | 'en', prime: 'Aino, Eetu, Mikko, Noora ja Mirri leikkivät.' }
  const getUserMedia = vi.fn(async () => ({}))
  vi.stubGlobal('window', {
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: number) => clearInterval(id),
    ...(recognizer ? { webkitSpeechRecognition: FakeRecognizer } : {}),
  })
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  vi.stubGlobal('AudioContext', FakeContext)
  vi.stubGlobal('AudioWorkletNode', FakeNode)
  const link = {
    hear: async (wav: ArrayBuffer, lang: 'fi' | 'en', partial: boolean, prime?: string) => {
      asks.push({ samples: (wav.byteLength - 44) / 2, lang, partial, prime })
      return { text: partial ? 'alice' : '[BLANK_AUDIO] alice hyppää', ms: 5 }
    },
  } as unknown as Link
  const mic = new Mic({
    link,
    lang: () => now.lang,
    prime: () => now.prime,
    whisperReady: () => whisper,
    partial: (w) => heard.push(['partial', w]),
    final: (w) => heard.push(['final', w]),
    missed: () => heard.push(['missed']),
  })
  return { mic, heard, asks, getUserMedia, now }
}

describe('Mic', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    FakeRecognizer.stuck = false
    FakeRecognizer.refuse = false
  })

  it('hides when nothing can listen', () => {
    const { mic, heard } = rig(false, false)
    expect(mic.listener).toBe('none')
    mic.press()
    expect(mic.held).toBe(false)
    mic.release()
    expect(heard).toEqual([])
  })

  it("uses the browser's recognizer in Finnish without Whisper: the words as they come, all of them on letting go", () => {
    const { mic, heard } = rig(false, true)
    expect(mic.listener).toBe('browser')
    mic.press()
    const rec = FakeRecognizer.last
    expect([rec.lang, rec.continuous, rec.interimResults]).toEqual(['fi-FI', true, true])
    rec.onresult!({ results: [[{ transcript: 'alice' }]] })
    rec.onresult!({ results: [[{ transcript: 'alice' }], [{ transcript: ' hyppää' }]] })
    mic.release()
    expect(heard).toEqual([['partial', 'alice'], ['partial', 'alice hyppää'], ['final', 'alice hyppää']])
  })

  it('shows a "?" when the recognizer heard nothing', () => {
    const { mic, heard } = rig(false, true)
    mic.press()
    mic.release()
    expect(heard).toEqual([['missed']])
  })

  it('never stays dead: a session that does not end gives way to the next press, and what it heard still counts', () => {
    const { mic, heard } = rig(false, true)
    FakeRecognizer.stuck = true
    mic.press()
    const first = FakeRecognizer.last
    first.onresult!({ results: [[{ transcript: 'alice' }]] })
    mic.release()
    expect(heard).toEqual([['partial', 'alice']])
    FakeRecognizer.stuck = false
    mic.press()
    expect(FakeRecognizer.last).not.toBe(first)
    FakeRecognizer.last.onresult!({ results: [[{ transcript: 'steve hyppää' }]] })
    mic.release()
    expect(heard).toEqual([['partial', 'alice'], ['final', 'alice'], ['partial', 'steve hyppää'], ['final', 'steve hyppää']])
  })

  it('shows a "?" when the recognizer will not start, and the next press works', () => {
    const { mic, heard } = rig(false, true)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    FakeRecognizer.refuse = true
    mic.press()
    mic.release()
    expect(heard).toEqual([['missed']])
    expect(warn).toHaveBeenCalledTimes(1)
    FakeRecognizer.refuse = false
    mic.press()
    FakeRecognizer.last.onresult!({ results: [[{ transcript: 'mirri' }]] })
    mic.release()
    expect(heard).toEqual([['missed'], ['partial', 'mirri'], ['final', 'mirri']])
  })

  it('records for Whisper once it is ready: live words every half second, the whole clip on letting go', async () => {
    const { mic, heard, asks, getUserMedia } = rig(true, true)
    expect(mic.listener).toBe('whisper')
    mic.press()
    await vi.advanceTimersByTimeAsync(0)
    FakeNode.last.port.onmessage!({ data: new Float32Array(RATE * 0.6) })
    await vi.advanceTimersByTimeAsync(500)
    expect(heard).toEqual([['partial', 'alice']])
    mic.release()
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual([['partial', 'alice'], ['final', 'alice hyppää']])
    const prime = 'Aino, Eetu, Mikko, Noora ja Mirri leikkivät.'
    expect(asks).toEqual([
      { samples: RATE * 0.6, lang: 'fi', partial: true, prime },
      { samples: RATE * 0.6, lang: 'fi', partial: false, prime },
    ])
    // The second press reuses the microphone: it is asked for once.
    mic.press()
    await vi.advanceTimersByTimeAsync(0)
    expect(getUserMedia).toHaveBeenCalledTimes(1)
    mic.release()
  })

  it('asks Whisper in the language of the setting with the prime of the moment, for every clip', async () => {
    const { mic, asks, now } = rig(true, false)
    mic.press()
    await vi.advanceTimersByTimeAsync(0)
    FakeNode.last.port.onmessage!({ data: new Float32Array(RATE * 0.6) })
    await vi.advanceTimersByTimeAsync(500)
    // The setting changes and someone new joins while the button is held: the next clip says so.
    now.lang = 'en'
    now.prime = 'Alice, Steve and Zoe are playing.'
    mic.release()
    await vi.advanceTimersByTimeAsync(0)
    expect(asks.map((a) => [a.partial, a.lang, a.prime])).toEqual([
      [true, 'fi', 'Aino, Eetu, Mikko, Noora ja Mirri leikkivät.'],
      [false, 'en', 'Alice, Steve and Zoe are playing.'],
    ])
  })

  it("uses the browser's recognizer in English when the setting is English", () => {
    const { mic, now } = rig(false, true)
    now.lang = 'en'
    mic.press()
    expect(FakeRecognizer.last.lang).toBe('en-US')
    mic.release()
  })

  it('records nothing when let go while the browser was still asking for the microphone, and the next press works', async () => {
    const { mic, heard, asks } = rig(true, false)
    mic.press()
    mic.release()
    await vi.advanceTimersByTimeAsync(1000)
    expect(heard).toEqual([])
    mic.press()
    await vi.advanceTimersByTimeAsync(0)
    FakeNode.last.port.onmessage!({ data: new Float32Array(RATE) })
    mic.release()
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual([['final', 'alice hyppää']])
    expect(asks.map((a) => a.samples)).toEqual([RATE])
  })

  it('shows a "?" for a clip too short to be words', async () => {
    const { mic, heard, asks } = rig(true, false)
    mic.press()
    await vi.advanceTimersByTimeAsync(0)
    FakeNode.last.port.onmessage!({ data: new Float32Array(RATE * 0.1) })
    mic.release()
    await vi.advanceTimersByTimeAsync(0)
    expect(heard).toEqual([['missed']])
    expect(asks).toEqual([])
  })

  it('lets go and says the microphone is blocked when it is refused, and asks again on the next press', async () => {
    const { mic, heard, getUserMedia } = rig(true, false)
    getUserMedia.mockRejectedValueOnce(new Error('NotAllowedError'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mic.press()
    await vi.advanceTimersByTimeAsync(0)
    // Still holding the button: it no longer looks as if it listens.
    expect([mic.held, mic.blocked]).toEqual([false, true])
    mic.release()
    expect(heard).toEqual([['missed']])
    mic.press()
    await vi.advanceTimersByTimeAsync(0)
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
    expect([mic.held, mic.blocked]).toEqual([true, false])
    mic.release()
  })

  it("lets go and says the microphone is blocked when the browser's recognizer may not use it", () => {
    const { mic, heard } = rig(false, true)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    mic.press()
    const rec = FakeRecognizer.last
    rec.onerror!({ error: 'not-allowed' })
    rec.onend!()
    expect([mic.held, mic.blocked]).toEqual([false, true])
    expect(heard).toEqual([['missed']])
    mic.release()
    // A press that hears something is not blocked.
    mic.press()
    FakeRecognizer.last.onresult!({ results: [[{ transcript: 'steve' }]] })
    mic.release()
    expect(mic.blocked).toBe(false)
    expect(heard).toEqual([['missed'], ['partial', 'steve'], ['final', 'steve']])
  })
})
