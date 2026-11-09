/**
 * The child's voice, kept on the laptop to measure hearing with (Sami's choice, 2026-11-09): every
 * whole clip the page sends to /hear is written to <library>/voice/ as the WAV it was, with a JSON
 * beside it of what came with it and what Whisper made of it (Clip). The live words' clips are
 * not kept. Past 3000 clips or 1.5 GB the oldest go first. silly-billy/tools/bench.mjs runs the
 * clips through other recognizers and settings, and tools/mark.mjs lets Sami write in what was
 * really said and who said it (`said`, `who`), which the bench then measures against.
 *
 * The folder is not in git (the root .gitignore) and nothing else reads it: the store reads only
 * items/, actions/, avatars/ and phrases.json, and the build bundles only those.
 */

import fs from 'node:fs'
import path from 'node:path'

import type { Lang } from '../engine/lang'
import type { MicInfo } from '../voice/mic'

/** What the sound itself says, measured from the WAV (`listen`). Levels are dB below full scale. */
export interface Sound {
  seconds: number
  /** The loudest sample. */
  peakDb: number
  /** Samples at full scale, as a share of all: the voice was too loud for the microphone. */
  clipped: number
  /** The loud part's level (the 90th percentile of 20 ms frames) and the quiet part's (the 10th): the voice and the room. */
  voiceDb: number
  floorDb: number
  /** Exact zeros at the start (the microphone was not running yet); the quiet before the first sound (a frame 10 dB over the room, or within 10 dB of the voice) and after the last: under 60 ms, the button may have cut words off. */
  zeroLeadMs: number
  quietLeadMs: number
  quietTailMs: number
  /** The voice's pitch (the median over voiced frames), null when nothing was voiced: about 100 to 150 Hz for a man, 250 to 400 Hz for a small child. */
  pitchHz: number | null
  /** Voiced frames as a share of all. */
  voiced: number
}

/** One kept clip: <name>.wav beside <name>.json. */
export interface Clip {
  at: string
  lang: Lang
  prime: string
  /** What Whisper wrote, and the words after heardWords (folded, cleaned, untangled). */
  raw: string
  text: string
  ms: number
  /** Who heard it: the model file and the fields beyond the stock request that were sent. */
  recognizer: { model: string; extras: string[] }
  /** Whisper's own measures: the no-speech probability (the highest of the segments) and the mean log probability of what it wrote; null with no segment. */
  noSpeech: number | null
  logprob: number | null
  /** The request's User-Agent: Chrome on a big Android tablet says it is desktop Linux, so `mic.device` tells the tablet better. */
  userAgent: string
  /** What the browser gave for the microphone; null when the page sent none. */
  mic: MicInfo | null
  /** Null when the WAV is not 16 kHz mono 16-bit PCM. */
  sound: Sound | null
  /** For Sami to fill in (tools/mark.mjs): the words really said ('' for none), and who said them ('3', '5', 'adult'). */
  said: string | null
  who: string | null
}

const RATE = 16000
const db = (x: number) => (x > 0 ? Math.round(200 * Math.log10(x)) / 10 + 0 : -120) // + 0: no -0
const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!

/** The samples of a 16 kHz mono 16-bit PCM WAV, or null for anything else. */
export function pcm(wav: Buffer): Int16Array | null {
  if (wav.length < 44 || wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') return null
  let at = 12
  let format: { rate: number; channels: number; bits: number; pcm: boolean } | null = null
  while (at + 8 <= wav.length) {
    const id = wav.toString('ascii', at, at + 4)
    const size = wav.readUInt32LE(at + 4)
    if (id === 'fmt ') format = { pcm: wav.readUInt16LE(at + 8) === 1, channels: wav.readUInt16LE(at + 10), rate: wav.readUInt32LE(at + 12), bits: wav.readUInt16LE(at + 22) }
    if (id === 'data') {
      if (format === null || !format.pcm || format.channels !== 1 || format.rate !== RATE || format.bits !== 16) return null
      const n = Math.floor(Math.min(size, wav.length - at - 8) / 2)
      const out = new Int16Array(n)
      for (let i = 0; i < n; i++) out[i] = wav.readInt16LE(at + 8 + i * 2)
      return out
    }
    at += 8 + size + (size % 2)
  }
  return null
}

/**
 * The clip's length, levels, quiet at either end and pitch. The pitch is the median of 40 ms
 * frames (20 ms apart, at 8 kHz) whose normalised autocorrelation peaks over 0.6 between 70 and
 * 600 Hz, taking the shortest period within 85% of the best so a child's voice is not heard an
 * octave low.
 */
export function listen(wav: Buffer): Sound | null {
  const s = pcm(wav)
  if (s === null) return null
  const n = s.length
  if (n === 0) return { seconds: 0, peakDb: -120, clipped: 0, voiceDb: -120, floorDb: -120, zeroLeadMs: 0, quietLeadMs: 0, quietTailMs: 0, pitchHz: null, voiced: 0 }
  let peak = 0
  let clipped = 0
  let zeros = 0
  while (zeros < n && s[zeros] === 0) zeros++
  for (let i = 0; i < n; i++) {
    const a = Math.abs(s[i]!)
    if (a > peak) peak = a
    if (a >= 32767) clipped++
  }
  // 20 ms frames: their levels give the voice, the room and where the sound starts and ends.
  const frame = RATE / 50
  const levels: number[] = []
  for (let f = 0; (f + 1) * frame <= n; f++) {
    let sum = 0
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += (s[i]! / 32768) ** 2
    levels.push(db(Math.sqrt(sum / frame)))
  }
  const sorted = [...levels].sort((a, b) => a - b)
  const voiceDb = levels.length ? percentile(sorted, 0.9) : db(peak / 32768)
  const floorDb = levels.length ? percentile(sorted, 0.1) : voiceDb
  // Sound: 10 dB over the room, or within 10 dB of the voice when there is no quiet room in the clip; never under -60 dB.
  const loud = Math.max(Math.min(floorDb + 10, voiceDb - 10), -60)
  const first = levels.findIndex((l) => l > loud)
  const last = levels.length - 1 - [...levels].reverse().findIndex((l) => l > loud)
  // Pitch at 8 kHz: pairs averaged.
  const half = new Float32Array(Math.floor(n / 2))
  for (let i = 0; i < half.length; i++) half[i] = (s[2 * i]! + s[2 * i + 1]!) / 65536
  const win = 320
  const minLag = Math.floor(8000 / 600)
  const maxLag = Math.ceil(8000 / 70)
  const pitches: number[] = []
  let frames = 0
  for (let at = 0; at + win + maxLag <= half.length; at += 160) {
    frames++
    if (levels[Math.floor((at * 2) / frame)]! <= loud) continue
    const r: number[] = []
    for (let lag = minLag; lag <= maxLag; lag++) {
      let xy = 0
      let xx = 0
      let yy = 0
      for (let i = at; i < at + win; i++) {
        const a = half[i]!
        const b = half[i + lag]!
        xy += a * b
        xx += a * a
        yy += b * b
      }
      r.push(xx > 0 && yy > 0 ? xy / Math.sqrt(xx * yy) : 0)
    }
    const best = Math.max(...r)
    if (best < 0.6) continue
    const lag = minLag + r.findIndex((v, i) => v >= 0.85 * best && (i === 0 || v >= r[i - 1]!) && (i === r.length - 1 || v >= r[i + 1]!))
    pitches.push(8000 / lag)
  }
  pitches.sort((a, b) => a - b)
  const ms = (frames20: number) => frames20 * 20
  return {
    seconds: Math.round((n / RATE) * 1000) / 1000,
    peakDb: db(peak / 32768),
    clipped: Math.round((clipped / n) * 1e5) / 1e5,
    voiceDb,
    floorDb,
    zeroLeadMs: Math.round((zeros / RATE) * 1000),
    quietLeadMs: first < 0 ? ms(levels.length) : ms(first),
    quietTailMs: first < 0 ? ms(levels.length) : ms(levels.length - 1 - last),
    pitchHz: pitches.length ? Math.round(percentile(pitches, 0.5)) : null,
    voiced: frames ? Math.round((pitches.length / frames) * 100) / 100 : 0,
  }
}

/**
 * Whether a clip has no voice in it: not one 40 ms frame of voiced sound (Sound.voiced 0), so
 * whatever Whisper wrote for it was invented on silence or noise, as 'Kiitos!' on the button
 * tapped and let go. On 224 synthetic clips every spoken one had voiced frames (a quarter of its
 * frames or more, a quiet, noisy or phone-like three-year-old's too) and no noise or silence had
 * any, while every recognizer wrote 'Kiitos!' or the like on all eight of those.
 */
export const voiceless = (s: Sound | null) => s !== null && s.voiced === 0

/** How many clips and bytes (WAVs and JSONs together) the folder keeps at most. */
export interface VoiceCap {
  clips: number
  bytes: number
}
export const VOICE_CAP: VoiceCap = { clips: 3000, bytes: 1.5e9 }

/** The kept clips, oldest first by name (the time they were heard), on the first call scanned from the folder. */
export class VoiceStore {
  private index: Map<string, number> | null = null
  private total = 0

  constructor(
    readonly dir: string,
    private readonly cap: VoiceCap,
  ) {}

  private scan(): Map<string, number> {
    if (this.index !== null) return this.index
    const index = new Map<string, number>()
    const names = fs.existsSync(this.dir) ? fs.readdirSync(this.dir).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4)).sort() : []
    for (const name of names) index.set(name, this.size(name))
    this.total = [...index.values()].reduce((a, b) => a + b, 0)
    return (this.index = index)
  }

  private size(name: string): number {
    const bytes = (f: string) => (fs.existsSync(f) ? fs.statSync(f).size : 0)
    return bytes(path.join(this.dir, `${name}.wav`)) + bytes(path.join(this.dir, `${name}.json`))
  }

  /** The names of the kept clips, oldest first. */
  names(): string[] {
    return [...this.scan().keys()]
  }

  /**
   * Keeps a clip: its WAV, and its JSON with `said` and `who` empty for Sami. Returns its name (the time, then the language: '2026-11-09T06-16-33-781Z-fi'). Then the
   * oldest go until the folder is within its cap.
   */
  keep(wav: Buffer, heard: Omit<Clip, 'said' | 'who'>): string {
    const index = this.scan()
    fs.mkdirSync(this.dir, { recursive: true })
    const stem = `${heard.at.replace(/[:.]/g, '-')}-${heard.lang}`
    let name = stem
    for (let k = 2; index.has(name) || fs.existsSync(path.join(this.dir, `${name}.wav`)); k++) name = `${stem}-${k}`
    const clip: Clip = { ...heard, said: null, who: null }
    fs.writeFileSync(path.join(this.dir, `${name}.wav`), wav)
    fs.writeFileSync(path.join(this.dir, `${name}.json`), `${JSON.stringify(clip, null, 2)}\n`)
    const size = this.size(name)
    index.set(name, size)
    this.total += size
    for (const [old, bytes] of index) {
      if (index.size <= this.cap.clips && this.total <= this.cap.bytes) break
      if (old === name) break
      fs.rmSync(path.join(this.dir, `${old}.wav`), { force: true })
      fs.rmSync(path.join(this.dir, `${old}.json`), { force: true })
      index.delete(old)
      this.total -= bytes
    }
    return name
  }
}
