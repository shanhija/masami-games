/**
 * Hearing on the laptop's GPU: a whisper.cpp server, started on the page's first status request
 * (or on the first words after the server's code reloaded) and killed with the dev server: Silly
 * Billy's own build (~/src/silly-billy-whisper, whisper.cpp 1.9.5 with a request field that
 * keeps letters the language does not write out of the decoder) when it is there, else
 * belay-that's. Words are heard in the game's language, primed with a sentence in it that names
 * who is here (voice/prime.ts), so 'Aino' is not written 'Ainu' and Finnish is not written as
 * Icelandic. A server already answering on the port (left from before a restart of the dev
 * server, or another checkout's) is used as it is, with the fields it says it understands.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import type { Lang } from '../engine/lang'
import type { HearReply, WhisperState } from '../engine/protocol'
import { hearingPrime } from '../voice/prime'

export interface WhisperSetup {
  bin: string
  model: string
  port: number
}

/** What a whisper-server understands beyond the stock request, as it says in its X-Whisper-Extras header (Silly Billy's build: suppress_regex). */
export type Extra = 'suppress_regex'
const EXTRAS: readonly Extra[] = ['suppress_regex']

/**
 * The server and model: SILLY_WHISPER_BIN and SILLY_WHISPER_MODEL when set; else Silly Billy's own
 * build and its MODEL when that is there (~/src/silly-billy-whisper, made by its setup.sh); else
 * belay-that's build and model. The port is SILLY_WHISPER_PORT, else 8179.
 */
export function whisperSetup(env: NodeJS.ProcessEnv, home: string): WhisperSetup {
  const own = path.join(home, 'src', 'silly-billy-whisper')
  const vendor = path.join(home, 'src', 'belay-that', 'vendor')
  const ownBin = path.join(own, 'whisper.cpp', 'build', 'bin', 'whisper-server')
  const ownModel = path.join(own, 'models', MODEL)
  const useOwn = fs.existsSync(ownBin) && fs.existsSync(ownModel)
  return {
    bin: env.SILLY_WHISPER_BIN ?? (useOwn ? ownBin : path.join(vendor, 'whisper.cpp', 'build', 'bin', 'whisper-server')),
    model: env.SILLY_WHISPER_MODEL ?? (useOwn ? ownModel : path.join(vendor, 'models', 'ggml-large-v3-turbo-q8_0.bin')),
    port: Number(env.SILLY_WHISPER_PORT ?? 8179),
  }
}

/**
 * The own build's model: Finnish-NLP's Finnish fine-tune of large-v3 (whisper-large-finnish-v3,
 * made q8_0), which heard best on silly-billy/tools/bench.mjs's 224 synthetic Finnish clips made
 * like a three- and a five-year-old (clean, quiet, noisy and phone-like), 2026-11-09: 11.5% of the
 * characters wrong against today's turbo's 14.7%, 35% of the words against 44%, the right avatar
 * named in 91% of the clips against 88%, and in English as good as turbo (7.4% of the characters
 * wrong on 128 clips, the right avatar 94% against 91%). It takes 720 ms a clip against 440 (9 in
 * 10 within 850 ms) and 2.7 GB of the GPU against 1.3. large-v3 itself heard no better than turbo
 * (14.5%) and named fewer, mozilla-ai's Finnish turbo named the avatar in 65% of the clips, and
 * Silero VAD lost a quiet three-year-old's words (47% wrong).
 */
const MODEL = 'ggml-fi-large-v3-q8_0.bin'

/** The starting cast in each language, for the prime when the page sends none. */
const STARTING_NAMES: Record<Lang, readonly string[]> = { fi: ['Aino', 'Eetu', 'Mikko', 'Noora', 'Mirri'], en: ['Alice', 'Steve', 'Mike', 'Nora', 'Luna'] }

/** What Whisper is primed with when the page sends nothing: the starting cast, in the language. */
export function defaultPrime(lang: Lang): string {
  return hearingPrime(lang, STARTING_NAMES[lang])
}

/**
 * Every field of a request to whisper-server, sent every time so nothing is left to whatever the
 * server would choose. Measured on 374 Finnish clips of the game's commands made child-like
 * (higher, quicker, quiet, noisy, clipped, an echo, 'r' said as 'l'):
 *
 * - No temperature fallback (`temperature_inc` 0). The server's own fallback samples again at
 *   0.2, 0.4 ... 1.0 when it is unsure of a try, drops the prime from 0.5 up and keeps the last
 *   try whatever it is. Made unsure of every try, as a real child's voice makes it, it wrote
 *   letters Finnish does not have in 25 of the 374 clips (none without the fallback), the way
 *   Sami's child's 'Yrri, laskja ljúkumaðist.' came back. A loop that decoding can fall into
 *   ('ei, ei, ei, ...', 1 to 6 clips in 374) is cut afterwards (untangle).
 * - Beam search of 5: the character error rate fell from 23.8% to 21.6%, and words invented on
 *   silence ('Kiitos kun katsoit!') from 10 clips to 1, for about 10 ms more a clip.
 * - The same for the live words (the clip so far, asked every half second while the button is
 *   held): beam search answered in 436 ms (456 ms for 9 in 10) against 422 ms greedy, so it
 *   keeps up, and the last live words were nearer what was said (17.4% of the characters wrong
 *   against 20.9%). Telling the encoder the clip is short (`audio_ctx`) answered in 64 ms but
 *   heard almost nothing right.
 * - Without the fallback, Sami's children still came back as Icelandic on the tablet (2026-11-09:
 *   'Mirri, meni var þjópa í galli?'), so Silly Billy's build is also told which letters it may
 *   not write (suppress_regex): on 224 synthetic clips (tools/bench.mjs) it turned turbo's one
 *   'Innað mitt þess.' into 'Inna, meitt satt.' and changed nothing else.
 * - The answer's no-speech probability is kept with the clip, but whisper.cpp reads it after the
 *   language and task tokens, where it was 0.00 on noise that came back 'Kiitos!': clips with no
 *   voice are dropped by the clip's own sound instead (voice.ts's voiceless).
 */
export function hearFields(lang: Lang, prime: string, extras: ReadonlySet<Extra>): Record<string, string> {
  return {
    language: lang,
    detect_language: 'false',
    translate: 'false',
    prompt: prime,
    carry_initial_prompt: 'false',
    max_context: '-1',
    // verbose_json answers with each segment's no-speech probability and mean log probability too (kept with the clip); the language is not guessed for it.
    response_format: 'verbose_json',
    no_language_probabilities: 'true',
    no_timestamps: 'true',
    token_timestamps: 'false',
    temperature: '0',
    temperature_inc: '0',
    beam_size: '5',
    best_of: '1',
    entropy_thold: '2.4',
    logprob_thold: '-1',
    no_speech_thold: '0.6',
    suppress_nst: 'false',
    audio_ctx: '0',
    offset_t: '0',
    offset_n: '0',
    duration: '0',
    max_len: '0',
    split_on_word: 'false',
    diarize: 'false',
    tinydiarize: 'false',
    vad: 'false',
    ...(extras.has('suppress_regex') ? { suppress_regex: suppressRegex(lang, prime) } : {}),
  }
}

/** The letters beyond ASCII each language writes. */
const OWN_LETTERS: Record<Lang, string> = { fi: 'åäöÅÄÖ', en: '' }

/**
 * For Silly Billy's build: the tokens Whisper may never write, as a regex over a token's bytes
 * (std::regex, matched against the whole token): any token with a letter beyond ASCII that the
 * language does not write, unless a name here has it (a letter of the prime, upper or lower
 * case: 'Zoë'). So 'það', 'ó' and 'ð' cannot be written in Finnish and the decoder has to find
 * Finnish letters for the sound instead, where folding afterwards only changes the letters of a
 * word already chosen. A letter beyond ASCII is two or more bytes, and a token may hold only
 * the first or the last of them: a token may start with the end of a kept letter and end with
 * its start.
 */
export function suppressRegex(lang: Lang, keep: string): string {
  const named = [...keep.normalize('NFC')].filter((ch) => ch > '\x7f' && /\p{L}/u.test(ch)).flatMap((ch) => [ch.toLowerCase(), ch.toUpperCase()])
  const letters = [...new Set([...OWN_LETTERS[lang], ...named])].sort()
  const hex = (bytes: Iterable<number>) => [...bytes].map((b) => `\\x${b.toString(16).toUpperCase().padStart(2, '0')}`).join('')
  const utf8 = letters.map((ch) => new TextEncoder().encode(ch))
  const parts = (cut: (b: Uint8Array, k: number) => Uint8Array) => [...new Set(utf8.flatMap((b) => Array.from({ length: b.length - 1 }, (_, i) => hex(cut(b, i + 1)))))]
  const optional = (alts: string[]) => (alts.length === 0 ? '' : `(?:${alts.join('|')})?`)
  const one = ['[\\x00-\\x7F]', ...utf8.map(hex)].join('|')
  const allowed = `${optional(parts((b, k) => b.slice(k)))}(?:${one})*${optional(parts((b, k) => b.slice(0, k)))}`
  return `(?!${allowed}$)[\\s\\S]*`
}

/** The letters each language writes. */
const NATIVE: Record<Lang, RegExp> = { fi: /^[a-zåäö]+$/, en: /^[a-z]+$/ }
/** The nearest letters of each language for those that are not a plain letter with marks on it, or whose base is not the nearest. */
const NEAREST: Record<Lang, Readonly<Record<string, string>>> = {
  fi: { æ: 'ä', ø: 'ö', œ: 'ö', ü: 'y', ð: 'd', þ: 't', ß: 'ss', đ: 'd', ł: 'l', ı: 'i', ŋ: 'n' },
  en: { æ: 'ae', ø: 'o', œ: 'oe', ð: 'd', þ: 'th', ß: 'ss', đ: 'd', ł: 'l', ı: 'i', ŋ: 'ng' },
}

/**
 * The words with every letter the language does not write folded to its nearest one ('ð' to 'd',
 * 'ú' to 'u', 'æ' to 'ä' in Finnish and 'ae' in English, 'ä' to 'a' in English), and letters of
 * other scripts left out. Letters in `keep` (the prime, so the names of who is here: a 'Zoë'
 * stays Zoë) are kept as they are.
 */
export function foldLetters(text: string, lang: Lang, keep = ''): string {
  const kept = new Set([...keep.normalize('NFC').toLowerCase()])
  let out = ''
  for (const ch of text.normalize('NFC')) {
    const lower = ch.toLowerCase()
    if (!/\p{L}/u.test(ch) || NATIVE[lang].test(lower) || kept.has(lower)) {
      out += ch
      continue
    }
    const near = NEAREST[lang][lower] ?? lower.normalize('NFD').replace(/\p{M}/gu, '')
    if (!NATIVE[lang].test(near)) continue
    out += ch === lower ? near : near.charAt(0).toUpperCase() + near.slice(1)
  }
  return out.replace(/\s+/g, ' ').trim()
}

/** Whisper's words without its known inventions on silence ('Kiitos katsomisesta', '[Musiikkia]') and extra spaces. */
export function cleanHeard(text: string): string {
  const s = text.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, ' ').replace(/\s+/g, ' ').trim()
  const bare = s.toLowerCase().replace(/[.!?,]/g, '').trim()
  if (/^(kiitos (katsomisesta|kun katsoit(te)?|että katsoit(te)?|kuuntelemisesta)|tekstitys.*|thanks for watching|thank you for watching|you)$/.test(bare)) return ''
  return s
}

/** A loop greedy decoding can fall into ('ei, ei, ei, ...' to the end of the clip): a word, or up to four, said more than three times in a row is kept three times. */
export function untangle(text: string): string {
  const words = text.split(' ')
  const key = (w: string | undefined) => (w ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
  const same = (a: number, b: number, n: number) => {
    for (let k = 0; k < n; k++) if (key(words[a + k]) !== key(words[b + k]) || key(words[a + k]) === '') return false
    return true
  }
  for (let n = 1; n <= 4; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      let times = 1
      while (i + (times + 1) * n <= words.length && same(i, i + times * n, n)) times++
      if (times > 3) words.splice(i + 3 * n, (times - 3) * n)
    }
  }
  return words.join(' ')
}

/** What Whisper wrote as the words the game goes on with: in the language's letters, without inventions on silence, untangled. */
export function heardWords(raw: string, lang: Lang, prime: string): string {
  return untangle(cleanHeard(foldLetters(raw, lang, prime)))
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const START_FOR = 60_000
const RETRY_AFTER = 60_000
/** How long a server being stopped gets to let go of its port and its memory before it is killed outright. */
const STOP_FOR = 5_000

/**
 * Servers this dev server is stopping, by port, kept on globalThis so they outlive a reload of
 * this module: a fresh Whisper (after the server's code reloaded) waits for the old one to be
 * gone before it looks at the port, so it neither takes the dying one for ready nor fails to
 * bind next to it.
 */
const STOPPING_KEY = Symbol.for('silly-billy.whisper.stopping')
const globals = globalThis as unknown as Record<symbol, Map<number, Promise<void>> | undefined>
const stopping = (globals[STOPPING_KEY] ??= new Map<number, Promise<void>>())

/** What a transcription gives: the words as the game goes on with them, and what came with them, for the clip store. */
export interface Heard extends HearReply {
  /** What Whisper wrote, before heardWords. */
  raw: string
  /** The highest no-speech probability of the segments, and their mean log probability; null when there was no segment. */
  noSpeech: number | null
  logprob: number | null
  /** The extra fields sent (Extra), for the record. */
  extras: Extra[]
}

export class Whisper {
  state: WhisperState = 'off'
  /** The fields beyond the stock request the server said it understands. */
  extras: ReadonlySet<Extra> = new Set()
  private child: ChildProcess | null = null
  private tried = 0

  constructor(
    private readonly setup: WhisperSetup,
    private readonly log: (message: string) => void,
  ) {}

  /** Starts the server unless it is up, starting or missing; a failed one is tried again after a minute. */
  ensure(): void {
    if (this.state === 'ready' || this.state === 'starting' || this.state === 'missing') return
    if (this.state === 'failed' && Date.now() - this.tried < RETRY_AFTER) return
    this.tried = Date.now()
    if (!fs.existsSync(this.setup.bin) || !fs.existsSync(this.setup.model)) {
      this.state = 'missing'
      this.log(`whisper: not found (${this.setup.bin}, ${this.setup.model}); the browser hears instead`)
      return
    }
    this.state = 'starting'
    void this.start()
  }

  /** Starts the server if need be and waits at most `ms` for it: words can come before any status did, after the server's code reloaded. */
  async ready(ms: number): Promise<boolean> {
    this.ensure()
    const t0 = Date.now()
    while (this.state === 'starting' && Date.now() - t0 < ms) await sleep(50)
    return this.state === 'ready'
  }

  /** Whether the server answers, noting the extra fields it says it understands. */
  private async answers(timeoutMs: number): Promise<boolean> {
    try {
      const reply = await fetch(`http://127.0.0.1:${this.setup.port}/`, { signal: AbortSignal.timeout(timeoutMs) })
      const said = (reply.headers.get('x-whisper-extras') ?? '').split(',').map((x) => x.trim())
      this.extras = new Set(EXTRAS.filter((x) => said.includes(x)))
      return reply.ok
    } catch {
      return false
    }
  }

  /** The model file this Whisper hears with. */
  get model(): string {
    return path.basename(this.setup.model)
  }

  private async start(): Promise<void> {
    await stopping.get(this.setup.port)
    if (await this.answers(500)) {
      this.state = 'ready'
      this.log(`whisper: using the server already on port ${this.setup.port}`)
      return
    }
    const { bin, model, port } = this.setup
    const child = spawn(bin, ['-m', model, '--host', '127.0.0.1', '--port', String(port), '-t', '4', '-nt'], { stdio: 'ignore' })
    this.child = child
    const gone = (why: string) => {
      if (this.child !== child) return
      this.child = null
      this.state = 'failed'
      this.log(`whisper: ${why}`)
    }
    child.on('error', (err) => gone(`failed to start: ${err.message}`))
    child.on('close', (code) => gone(`exited (${code})`))
    const t0 = Date.now()
    while (this.child === child && Date.now() - t0 < START_FOR) {
      if (await this.answers(1000)) {
        this.state = 'ready'
        this.log(`whisper: ready in ${((Date.now() - t0) / 1000).toFixed(1)} s (${path.basename(model)}${this.extras.size ? `, with ${[...this.extras].join(', ')}` : ''})`)
        return
      }
      await sleep(250)
    }
    if (this.child === child) {
      gone(`did not answer within ${START_FOR / 1000} s`)
      child.kill()
    }
  }

  /**
   * 16 kHz mono 16-bit WAV to words in `lang`, primed with `prime` (hearFields, with the extra
   * fields the server understands). A server that went away makes the state 'failed', so the next
   * status starts it again.
   */
  async transcribe(wav: Buffer, lang: Lang, prime: string): Promise<Heard> {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'clip.wav')
    for (const [name, value] of Object.entries(hearFields(lang, prime, this.extras))) form.append(name, value)
    const t0 = Date.now()
    let reply: Response
    try {
      reply = await fetch(`http://127.0.0.1:${this.setup.port}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(30_000) })
    } catch (err) {
      if (!this.child) this.state = 'failed'
      throw err
    }
    if (!reply.ok) throw new Error(`whisper ${reply.status}: ${(await reply.text()).slice(0, 200)}`)
    const { text, segments } = (await reply.json()) as { text: string; segments: Array<{ no_speech_prob: number; avg_logprob: number }> }
    const raw = text.replace(/\s+/g, ' ').trim()
    const some = segments.length > 0
    return {
      text: heardWords(raw, lang, prime),
      ms: Date.now() - t0,
      raw,
      noSpeech: some ? Math.max(...segments.map((g) => g.no_speech_prob)) : null,
      logprob: some ? segments.reduce((a, g) => a + g.avg_logprob, 0) / segments.length : null,
      extras: [...this.extras],
    }
  }

  /** Stops the server this Whisper started; the next Whisper on the port waits until it is gone. */
  close(): void {
    const child = this.child
    this.child = null
    this.state = 'off'
    if (child === null) return
    if (child.exitCode === null && child.signalCode === null) {
      const port = this.setup.port
      const gone = new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, STOP_FOR)
        timer.unref()
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
      stopping.set(port, gone)
      void gone.then(() => {
        if (stopping.get(port) === gone) stopping.delete(port)
      })
    }
    child.kill()
  }
}
