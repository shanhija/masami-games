/**
 * Push-to-talk. While the big button (or Space) is held the child's words are heard, in the
 * game's language: by Whisper on the dev server when it is ready, else by the browser's own
 * recognizer, else not at all (the button gives way to typing). Whisper gets 16 kHz mono WAV
 * recorded through an AudioWorklet (belay-that's way): the clip so far every half second for the
 * live words, the whole clip on letting go, each with the language and the prime; the whole clip
 * also carries what the browser gave for the microphone (MicInfo), which the dev server keeps
 * beside it. The microphone is asked for on the first press, never before, with the processing
 * `processingFor` picks for the device; when there is none, or the browser will not let the page
 * use it, the press ends at once and the mic is `blocked` until a press gets one.
 */

import type { Link } from '../brain/contract'

export type Listener = 'whisper' | 'browser' | 'none'

/** What Whisper wants: 16 kHz. */
export const RATE = 16000
/** A clip shorter than this is a slip of the finger. */
const MIN_SECONDS = 0.3
/** How often the clip so far is heard again while the button is held. */
const PARTIAL_MS = 500

/** The browser's own processing of the microphone, as asked for in getUserMedia. */
export interface Processing {
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
}

/** What tells a tablet or a phone from the laptop, as the page sees it. */
export interface DeviceSigns {
  userAgent: string
  /** navigator.userAgentData.platform where there is one, else navigator.platform. */
  platform: string
  maxTouchPoints: number
  /** The only pointer is a finger: no mouse or touchpad (`(any-pointer: fine)` does not match). */
  fingerOnly: boolean
}

/**
 * A tablet or a phone: Android by its user agent or platform, or a device whose only pointer is a
 * finger. Chrome on a big Android tablet asks for desktop sites by default and then says it is
 * Linux on x86 in the user agent, so the pointer is what tells it from the laptop.
 */
export const isTouchDevice = (d: DeviceSigns) => /android/i.test(d.userAgent) || /android|arm|aarch/i.test(d.platform) || d.fingerOnly

/**
 * The processing to ask for. On a tablet or a phone, none: with echoCancellation on, Chrome on
 * Android records through the phone-call path (the audio mode MODE_IN_COMMUNICATION and the
 * VOICE_COMMUNICATION input preset, with the device's own echo canceller, noise suppressor and
 * gain, tuned for an adult on a call: Chromium's AAudio input and AudioManagerAndroid), and its
 * noise suppression and gain control squash a child's high, quiet voice; with all three off it
 * uses the generic microphone preset, which keeps the device's normal gain. Nothing plays while
 * the button is held (the game hushes the voices and ducks the sounds), so there is no echo to
 * cancel. On the laptop, all three on, as it heard well on 2026-11-08.
 */
export function processingFor(d: DeviceSigns): Processing {
  const on = !isTouchDevice(d)
  return { echoCancellation: on, noiseSuppression: on, autoGainControl: on }
}

/** The device as this page sees it. */
function deviceSigns(): DeviceSigns {
  // userAgentData is Chromium's only.
  const nav = navigator as Navigator & { userAgentData?: { platform: string } }
  return { userAgent: nav.userAgent, platform: nav.userAgentData?.platform ?? nav.platform, maxTouchPoints: nav.maxTouchPoints, fingerOnly: nav.maxTouchPoints > 0 && !matchMedia('(any-pointer: fine)').matches }
}

/**
 * What the browser gave for the microphone, sent with each whole clip and kept beside it on the
 * dev server, so the tablet's clips can be told from the laptop's and compared: the processing
 * asked for and what the track says it does, its rate, the context's rate the clip was recorded
 * at, and how long the button was held and how long recording took to start after the press.
 */
export interface MicInfo {
  device: DeviceSigns
  asked: Processing
  /** The track's own settings (MediaTrackSettings); what a browser leaves out is null. */
  got: { sampleRate: number | null; channelCount: number | null; echoCancellation: boolean | null; noiseSuppression: boolean | null; autoGainControl: boolean | null; latency: number | null }
  /** The microphone's name ('' when the browser hides it). */
  label: string
  /** The AudioContext's rate: 16000, or the device's own where the browser would not record at 16 kHz (then wav() resamples). */
  contextRate: number
  /** From the press to letting go. */
  heldMs: number
  /** From the press to the first block recorded: opening the microphone (on the first press, the browser's question too) and waking the context. */
  startMs: number
}

export interface MicDeps {
  link: Link
  lang: () => 'fi' | 'en'
  /** The sentence Whisper is primed with, in the game's language with the names of who is here (voice/prime.ts): asked for each clip, so it follows the room and the setting. */
  prime: () => string
  /** The dev server's Whisper is ready now. */
  whisperReady: () => boolean
  /** The words so far, while the button is held. */
  partial: (words: string) => void
  /** The words, once the button is let go. */
  final: (words: string) => void
  /** Too short, nothing heard, or no microphone (then `blocked` is set): a small "?", or "No microphone". */
  missed: () => void
}

/** What the browser's recognizer says when it may not use the microphone, or there is none. */
const NO_MIC = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])

/** The small part of the Web Speech API's recognizer used here (the DOM types leave it out). */
interface Recognizer {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}
type RecognizerClass = new () => Recognizer

/** The browser's recognizer, or null (Firefox has none). */
function findRecognizer(): RecognizerClass | null {
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

interface Capture {
  ac: AudioContext
  chunks: Float32Array[]
  recording: boolean
  /** When the first block of this press came (performance.now()), or null before it. */
  firstAt: number | null
  /** What MicInfo says of the microphone, the same for every press. */
  mic: Omit<MicInfo, 'heldMs' | 'startMs'>
}

const seconds = (cap: Capture) => cap.chunks.reduce((n, c) => n + c.length, 0) / cap.ac.sampleRate

/** The microphone into a muted AudioWorklet that hands its blocks to `chunks` while `recording`. */
async function openCapture(): Promise<Capture> {
  const device = deviceSigns()
  const asked = processingFor(device)
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, ...asked } })
  const track = stream.getAudioTracks()[0]!
  const s = track.getSettings() as MediaTrackSettings & { latency?: number }
  const got = {
    sampleRate: s.sampleRate ?? null,
    channelCount: s.channelCount ?? null,
    echoCancellation: typeof s.echoCancellation === 'boolean' ? s.echoCancellation : null,
    noiseSuppression: s.noiseSuppression ?? null,
    autoGainControl: s.autoGainControl ?? null,
    latency: s.latency ?? null,
  }
  let ac = new AudioContext({ sampleRate: RATE })
  let source: MediaStreamAudioSourceNode
  try {
    source = ac.createMediaStreamSource(stream)
  } catch {
    // Firefox will not join a microphone to a context at another rate: record at the context's own rate, and wav() resamples.
    void ac.close()
    ac = new AudioContext()
    source = ac.createMediaStreamSource(stream)
  }
  await ac.audioWorklet.addModule(new URL('./capture.worklet.js', import.meta.url))
  const node = new AudioWorkletNode(ac, 'capture')
  const mute = ac.createGain()
  mute.gain.value = 0
  source.connect(node).connect(mute).connect(ac.destination)
  const cap: Capture = { ac, chunks: [], recording: false, firstAt: null, mic: { device, asked, got, label: track.label, contextRate: ac.sampleRate } }
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    if (!cap.recording) return
    cap.firstAt ??= performance.now()
    cap.chunks.push(e.data)
  }
  return cap
}

/** The clip as 16 kHz mono 16-bit WAV. A clip recorded at another rate is resampled by averaging each output sample's span. */
export function wav(chunks: readonly Float32Array[], rate: number): ArrayBuffer {
  const all = new Float32Array(chunks.reduce((n, c) => n + c.length, 0))
  let at = 0
  for (const c of chunks) {
    all.set(c, at)
    at += c.length
  }
  const step = rate / RATE
  const n = Math.floor(all.length / step)
  const buf = new ArrayBuffer(44 + n * 2)
  const v = new DataView(buf)
  const text = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i))
  }
  text(0, 'RIFF')
  v.setUint32(4, 36 + n * 2, true)
  text(8, 'WAVE')
  text(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true)
  v.setUint32(28, RATE * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  text(36, 'data')
  v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * step)
    const to = Math.max(from + 1, Math.floor((i + 1) * step))
    let sum = 0
    for (let j = from; j < to; j++) sum += all[j]!
    v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, sum / (to - from))) * 0x7fff), true)
  }
  return buf
}

/** What a recognizer wrote, without the noises it puts in brackets ("[BLANK_AUDIO]", "(musiikkia)", "*naurua*"). */
export function cleanWords(text: string): string {
  return text
    .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export class Mic {
  /** The button is held and a listener is on. */
  held = false
  /** The last press found no microphone, or the browser would not let the page use it. */
  blocked = false
  private deps: MicDeps
  private using: Listener = 'none'
  /** Counts presses, so an answer that arrives after the next press is not shown for it. */
  private presses = 0
  private opening: Promise<Capture> | null = null
  private cap: Capture | null = null
  private timer = 0
  private asking = false
  private rec: Recognizer | null = null
  /** When the button went down and up (performance.now()), for MicInfo. */
  private pressedAt = 0
  private releasedAt = 0

  constructor(deps: MicDeps) {
    this.deps = deps
  }

  /** Who would hear a press now. */
  get listener(): Listener {
    return this.deps.whisperReady() ? 'whisper' : findRecognizer() !== null ? 'browser' : 'none'
  }

  press() {
    const listener = this.listener
    if (this.held || listener === 'none') return
    this.held = true
    this.using = listener
    this.presses += 1
    this.pressedAt = performance.now()
    if (listener === 'whisper') void this.record(this.presses)
    else this.listenInBrowser(this.presses)
  }

  release() {
    if (!this.held) return
    this.held = false
    this.releasedAt = performance.now()
    if (this.using === 'whisper') void this.letGo()
    else if (this.rec !== null) this.rec.stop()
  }

  private async record(press: number) {
    try {
      this.cap = await (this.opening ??= openCapture())
    } catch (e) {
      // Refused or no microphone: nothing records, so the button lets go now. The next press asks again.
      this.opening = null
      console.warn('no microphone:', e)
      this.blocked = true
      if (press === this.presses) this.held = false
      this.deps.missed()
      return
    }
    this.blocked = false
    const cap = this.cap
    await cap.ac.resume()
    // Let go while the browser was still asking for the microphone: this press only opened it.
    if (press !== this.presses || !this.held) return
    cap.chunks = []
    cap.firstAt = null
    cap.recording = true
    this.timer = window.setInterval(() => void this.hearSoFar(cap, press), PARTIAL_MS)
  }

  /** The clip so far, for the live words; one ask at a time. */
  private async hearSoFar(cap: Capture, press: number) {
    if (this.asking || seconds(cap) < PARTIAL_MS / 1000) return
    this.asking = true
    try {
      const reply = await this.deps.link.hear(wav(cap.chunks, cap.ac.sampleRate), this.deps.lang(), true, this.deps.prime())
      const words = cleanWords(reply.text)
      if (words !== '' && this.held && press === this.presses) this.deps.partial(words)
    } catch (e) {
      console.warn('live words failed:', e)
    } finally {
      this.asking = false
    }
  }

  private async letGo() {
    window.clearInterval(this.timer)
    const cap = this.cap
    if (cap === null || !cap.recording) return
    cap.recording = false
    if (seconds(cap) < MIN_SECONDS) return this.deps.missed()
    const mic: MicInfo = { ...cap.mic, heldMs: Math.round(this.releasedAt - this.pressedAt), startMs: Math.round((cap.firstAt ?? this.releasedAt) - this.pressedAt) }
    try {
      const reply = await this.deps.link.hear(wav(cap.chunks, cap.ac.sampleRate), this.deps.lang(), false, this.deps.prime(), mic)
      const words = cleanWords(reply.text)
      if (words === '') this.deps.missed()
      else this.deps.final(words)
    } catch (e) {
      console.warn('hearing failed:', e)
      this.deps.missed()
    }
  }

  /**
   * The browser's recognizer for one press: interim words as they come, everything it heard when
   * it ends. A session still ending from the last press, or one that never ended, gives way to
   * the new one (what it heard still counts), so the button can never stay dead.
   */
  private listenInBrowser(press: number) {
    if (this.rec !== null) this.rec.abort()
    const rec = new (findRecognizer()!)()
    rec.lang = this.deps.lang() === 'fi' ? 'fi-FI' : 'en-US'
    rec.continuous = true
    rec.interimResults = true
    let words = ''
    let noMic = false
    rec.onresult = (e) => {
      words = cleanWords(Array.from(e.results, (r) => r[0]!.transcript).join(' '))
      if (press === this.presses && words !== '') this.deps.partial(words)
    }
    rec.onerror = (e) => {
      console.warn('recognizer:', e.error)
      noMic ||= NO_MIC.has(e.error)
    }
    rec.onend = () => {
      if (this.rec === rec) this.rec = null
      if (press === this.presses) {
        this.blocked = noMic
        // It never listened: the button lets go now.
        if (noMic) this.held = false
      }
      if (words !== '') this.deps.final(words)
      else if (press === this.presses) this.deps.missed()
    }
    this.rec = rec
    try {
      rec.start()
    } catch (e) {
      console.warn('recognizer would not start:', e)
      this.rec = null
      this.deps.missed()
    }
  }
}
