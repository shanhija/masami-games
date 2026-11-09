/**
 * The voice clips kept for measuring hearing: each whole clip written as its WAV and a JSON
 * beside it with the sound measured, the folder kept within its cap (oldest first, by count and by
 * bytes, also across a fresh store after the server's code reloaded), and the library's own store
 * leaving the folder alone.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { RATE, wav } from '../voice/mic'
import { Store } from './store'
import { listen, pcm, voiceless, VoiceStore, type Clip } from './voice'

/** A clip of `seconds`: silence, then a tone of `hz` at `level` (0..1) from `from` seconds, as the page sends it. */
function clip(seconds: number, hz: number, level: number, from = 0.2): Buffer {
  const n = Math.round(seconds * RATE)
  const s = new Float32Array(n).map((_, i) => (i / RATE >= from ? level * Math.sin((2 * Math.PI * hz * i) / RATE) : 0))
  return Buffer.from(wav([s], RATE))
}

const heard = (at: string): Omit<Clip, 'said' | 'who'> => ({
  at,
  lang: 'fi',
  prime: 'Aino leikkii. Aino, hyppää!',
  raw: 'Aino, hyppää!',
  text: 'Aino, hyppää!',
  ms: 420,
  recognizer: { model: 'ggml-large-v3-turbo-q8_0.bin', extras: ['suppress_regex'] },
  noSpeech: 0.01,
  logprob: -0.2,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
  mic: null,
  sound: null,
})

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-billy-voice-'))
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const files = () => fs.readdirSync(path.join(dir, 'voice')).sort()

describe('listen', () => {
  it("measures a clip's length, levels, quiet start and pitch", () => {
    const s = listen(clip(1.2, 300, 0.5, 0.3))!
    expect(s.seconds).toBe(1.2)
    expect(s.peakDb).toBeCloseTo(-6, 0)
    // A sine's level is 3 dB under its peak.
    expect(s.voiceDb).toBeCloseTo(-9, 0)
    expect(s.clipped).toBe(0)
    expect(s.zeroLeadMs).toBe(300)
    expect(s.quietLeadMs).toBe(300)
    expect(s.quietTailMs).toBe(0)
    expect(s.pitchHz).toBeGreaterThan(290)
    expect(s.pitchHz).toBeLessThan(310)
    expect(s.voiced).toBeGreaterThan(0.6)
  })

  it("tells a man's pitch from a small child's, and notes a voice too loud for the microphone", () => {
    expect(listen(clip(1, 110, 0.3))!.pitchHz).toBeGreaterThan(100)
    expect(listen(clip(1, 110, 0.3))!.pitchHz).toBeLessThan(120)
    const loud = listen(clip(1, 400, 1.5))!
    expect(loud.pitchHz).toBeGreaterThan(380)
    expect(loud.clipped).toBeGreaterThan(0.1)
    expect(loud.peakDb).toBe(0)
  })

  it('finds no pitch in silence or noise, which makes a clip voiceless, and measures only 16 kHz mono 16-bit PCM', () => {
    expect(listen(clip(0.5, 300, 0, 0))).toMatchObject({ pitchHz: null, voiced: 0, peakDb: -120 })
    let seed = 1
    const noise = new Float32Array(RATE).map(() => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.2)
    const hiss = listen(Buffer.from(wav([noise], RATE)))!
    expect(hiss.voiced).toBe(0)
    expect([voiceless(hiss), voiceless(listen(clip(1, 300, 0.5))), voiceless(null)]).toEqual([true, false, false])
    const at44 = Buffer.from(clip(0.5, 300, 0.5))
    at44.writeUInt32LE(44100, 24)
    expect(pcm(at44)).toBe(null)
    expect(listen(Buffer.from('not a wav at all, not at all, not at all, not at all'))).toBe(null)
  })
})

describe('VoiceStore', () => {
  it('keeps a clip as its WAV and a JSON with the sound measured and nothing yet said', () => {
    const store = new VoiceStore(path.join(dir, 'voice'), { clips: 10, bytes: 1e9 })
    const wavOf = clip(1, 300, 0.5)
    const name = store.keep(wavOf, { ...heard('2026-11-09T06:16:33.781Z'), sound: listen(wavOf) })
    expect(name).toBe('2026-11-09T06-16-33-781Z-fi')
    expect(files()).toEqual([`${name}.json`, `${name}.wav`])
    expect(fs.readFileSync(path.join(dir, 'voice', `${name}.wav`)).equals(wavOf)).toBe(true)
    const json = JSON.parse(fs.readFileSync(path.join(dir, 'voice', `${name}.json`), 'utf8')) as Clip
    expect(json).toEqual({ ...heard('2026-11-09T06:16:33.781Z'), sound: listen(wavOf), said: null, who: null })
    expect(store.names()).toEqual([name])
  })

  it('gives two clips heard in the same millisecond their own names', () => {
    const store = new VoiceStore(path.join(dir, 'voice'), { clips: 10, bytes: 1e9 })
    const a = store.keep(clip(0.5, 300, 0.5), heard('2026-11-09T06:00:00.000Z'))
    const b = store.keep(clip(0.5, 300, 0.5), heard('2026-11-09T06:00:00.000Z'))
    expect([a, b]).toEqual(['2026-11-09T06-00-00-000Z-fi', '2026-11-09T06-00-00-000Z-fi-2'])
  })

  it('lets the oldest clips go past the number it keeps, also after a fresh store reads the folder', () => {
    const at = (k: number) => `2026-11-09T06:00:0${k}.000Z`
    const first = new VoiceStore(path.join(dir, 'voice'), { clips: 3, bytes: 1e9 })
    for (let k = 0; k < 5; k++) first.keep(clip(0.3, 300, 0.5), heard(at(k)))
    expect(first.names()).toEqual([2, 3, 4].map((k) => `2026-11-09T06-00-0${k}-000Z-fi`))
    expect(files()).toHaveLength(6)
    // The server's code reloaded: a fresh store finds the three and keeps to the cap.
    const second = new VoiceStore(path.join(dir, 'voice'), { clips: 3, bytes: 1e9 })
    second.keep(clip(0.3, 300, 0.5), heard(at(5)))
    expect(second.names()).toEqual([3, 4, 5].map((k) => `2026-11-09T06-00-0${k}-000Z-fi`))
    expect(files().filter((f) => f.endsWith('.wav'))).toEqual([3, 4, 5].map((k) => `2026-11-09T06-00-0${k}-000Z-fi.wav`))
  })

  it('lets the oldest go past the bytes it keeps, WAVs and JSONs together, but always keeps the newest', () => {
    const one = clip(1, 300, 0.5).length
    const store = new VoiceStore(path.join(dir, 'voice'), { clips: 100, bytes: 1.5 * one })
    for (let k = 0; k < 4; k++) store.keep(clip(1, 300, 0.5), heard(`2026-11-09T06:00:0${k}.000Z`))
    // One WAV and its JSON fit in one and a half WAVs' bytes, two do not.
    expect(store.names()).toEqual(['2026-11-09T06-00-03-000Z-fi'])
    const tiny = new VoiceStore(path.join(dir, 'tiny'), { clips: 100, bytes: 10 })
    expect(tiny.keep(clip(1, 300, 0.5), heard('2026-11-09T07:00:00.000Z'))).toBe('2026-11-09T07-00-00-000Z-fi')
    expect(tiny.names()).toHaveLength(1)
  })

  it("is left alone by the library's store, which reads only its own folders", () => {
    const voice = new VoiceStore(path.join(dir, 'voice'), { clips: 10, bytes: 1e9 })
    voice.keep(clip(0.5, 300, 0.5), heard('2026-11-09T06:00:00.000Z'))
    const warnings: string[] = []
    expect(new Store(dir, (m) => warnings.push(m)).read()).toEqual({ items: [], actions: [], avatars: [], phrases: [] })
    expect(warnings).toEqual([])
    expect(files()).toHaveLength(2)
  })
})
