#!/usr/bin/env node
/**
 * The hearing bench: runs the kept voice clips (silly-billy/library/voice/, server/voice.ts)
 * through candidate recognizers and settings and reports, per candidate and per device, speaker
 * and pitch: letters the language does not write, words the game knows (the content's calls and
 * the cast's names, matched as the parser matches them), loops, empty results, inventions on
 * silence and the time per clip; where a clip's JSON says what was really said (`said`, filled
 * in by tools/mark.mjs), the characters and words wrong and whether the right avatar was named.
 * Every candidate's words for every clip go side by side into report.md, all of it into
 * results.json, under <clips>/bench/<time>/ (inside the voice folder, so out of git).
 *
 * Run by hand from the repo root, never by npm test; it starts its own whisper-server on port
 * 8199 (one model at a time), never the dev server's on 8179:
 *
 *   node silly-billy/tools/bench.mjs                       # every clip, every candidate
 *   node silly-billy/tools/bench.mjs --only today,v3+letters --device tablet --limit 100
 *   node silly-billy/tools/bench.mjs --clips <folder> --out <folder> --port 8199
 *   node silly-billy/tools/bench.mjs --sound               # only how the clips sound, per device and speaker
 *
 * Requests are the game's own (server/whisper.ts's hearFields and heardWords, imported through
 * Vite's module runner), so 'today' is exactly what the game sends with belay-that's build. The
 * candidates' files are made by ~/src/silly-billy-whisper/setup.sh; one whose files are missing
 * is left out with a note.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runnerImport } from 'vite'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const SRC = path.join(ROOT, 'silly-billy', 'src')
const load = async (file) => (await runnerImport(path.join(SRC, file), { configFile: false, root: ROOT, logLevel: 'silent' })).module
const [whisper, voice, mic, content, words] = await Promise.all(['server/whisper.ts', 'server/voice.ts', 'voice/mic.ts', 'content/index.ts', 'engine/words.ts'].map(load))

// ------------------------------------------------------------------ the candidates

const HOME = os.homedir()
const OWN = path.join(HOME, 'src', 'silly-billy-whisper')
const OWN_BIN = path.join(OWN, 'whisper.cpp', 'build', 'bin', 'whisper-server')
const BELAY = path.join(HOME, 'src', 'belay-that', 'vendor')
const BELAY_BIN = path.join(BELAY, 'whisper.cpp', 'build', 'bin', 'whisper-server')
const model = (name) => path.join(OWN, 'models', name)
const VAD_MODEL = model('ggml-silero-v6.2.0.bin')

/**
 * Each candidate: a server (bin and model) and what changes in the game's request: `letters`
 * sends the own build's suppress_regex, `vad` turns on Silero VAD, `loud` brings the clip's voice
 * to -20 dB (at most 30 dB louder, the peak kept under -1 dB) before sending it.
 */
const CANDIDATES = [
  { id: 'today', about: "belay-that's build with large-v3-turbo q8_0: the game's request until now", bin: BELAY_BIN, model: path.join(BELAY, 'models', 'ggml-large-v3-turbo-q8_0.bin') },
  { id: 'turbo+letters', about: 'large-v3-turbo q8_0, letters the language does not write suppressed', bin: OWN_BIN, model: model('ggml-large-v3-turbo-q8_0.bin'), letters: true },
  { id: 'turbo+letters+loud', about: 'the same, the clip made louder first', bin: OWN_BIN, model: model('ggml-large-v3-turbo-q8_0.bin'), letters: true, loud: true },
  { id: 'turbo+letters+vad', about: 'the same, with Silero VAD', bin: OWN_BIN, model: model('ggml-large-v3-turbo-q8_0.bin'), letters: true, vad: true },
  { id: 'v3', about: 'large-v3 (not turbo) q8_0', bin: OWN_BIN, model: model('ggml-large-v3-q8_0.bin') },
  { id: 'v3+letters', about: 'large-v3 q8_0, letters suppressed', bin: OWN_BIN, model: model('ggml-large-v3-q8_0.bin'), letters: true },
  { id: 'v3-q5+letters', about: 'large-v3 q5_0 as published, letters suppressed', bin: OWN_BIN, model: model('ggml-large-v3-q5_0.bin'), letters: true },
  { id: 'fi-v3', about: "Finnish-NLP's Finnish fine-tune of large-v3, q8_0", bin: OWN_BIN, model: model('ggml-fi-large-v3-q8_0.bin') },
  { id: 'fi-v3+letters', about: 'the Finnish fine-tune, letters suppressed', bin: OWN_BIN, model: model('ggml-fi-large-v3-q8_0.bin'), letters: true },
  { id: 'fi-turbo', about: "mozilla-ai's Finnish fine-tune of large-v3-turbo (2,093 Common Voice clips), q8_0", bin: OWN_BIN, model: model('ggml-turbo-fi-q8_0.bin') },
  { id: 'fi-turbo+letters', about: 'the Finnish turbo, letters suppressed', bin: OWN_BIN, model: model('ggml-turbo-fi-q8_0.bin'), letters: true },
]

// ------------------------------------------------------------------ arguments

const args = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i < 0 ? fallback : args[i + 1]
}
const CLIPS = path.resolve(arg('clips', path.join(ROOT, 'silly-billy', 'library', 'voice')))
const OUT = path.resolve(arg('out', path.join(CLIPS, 'bench', new Date().toISOString().replace(/[:.]/g, '-'))))
const PORT = Number(arg('port', '8199'))
const ONLY = arg('only', null)?.split(',') ?? null
const DEVICE = arg('device', null)
const LIMIT = Number(arg('limit', '0'))
const SOUND_ONLY = args.includes('--sound')
if (PORT === 8179) throw new Error('8179 is the dev server Whisper: give the bench a port of its own')

const candidates = CANDIDATES.filter((c) => ONLY === null || ONLY.includes(c.id)).filter((c) => {
  const missing = [c.bin, c.model, ...(c.vad ? [VAD_MODEL] : [])].filter((f) => !fs.existsSync(f))
  if (missing.length) console.log(`leaving out ${c.id}: no ${missing.join(', ')} (bash ~/src/silly-billy-whisper/setup.sh)`)
  return missing.length === 0
})
if (ONLY !== null && ONLY.some((id) => !CANDIDATES.some((c) => c.id === id))) throw new Error(`no such candidate in ${ONLY.join(',')}: the candidates are ${CANDIDATES.map((c) => c.id).join(', ')}`)

// ------------------------------------------------------------------ the clips

/** Which device a clip came from: what the page said of it (mic.device), else its User-Agent. */
function deviceOf(clip) {
  if (clip.userAgent === 'synthetic') return 'synthetic'
  if (clip.mic?.device) return mic.isTouchDevice(clip.mic.device) ? 'tablet' : 'laptop'
  return /android/i.test(clip.userAgent) ? 'tablet' : 'unknown'
}

/** The voice's pitch, in the bands that tell a man from a child: about 100 to 150 Hz, and 250 to 400. */
const pitchBand = (hz) => (hz === null ? 'no pitch' : hz < 180 ? 'under 180 Hz' : hz < 280 ? '180 to 280 Hz' : 'over 280 Hz')

let clips = fs
  .readdirSync(CLIPS)
  .filter((f) => f.endsWith('.wav'))
  .map((f) => f.slice(0, -4))
  .sort()
  .map((name) => {
    const info = JSON.parse(fs.readFileSync(path.join(CLIPS, `${name}.json`), 'utf8'))
    const wav = fs.readFileSync(path.join(CLIPS, `${name}.wav`))
    const sound = info.sound ?? voice.listen(wav)
    return { name, info, wav, sound, device: deviceOf(info), who: info.who ?? 'not marked', pitch: pitchBand(sound?.pitchHz ?? null), variant: info.variant ?? null }
  })
if (DEVICE !== null) clips = clips.filter((c) => c.device === DEVICE)
if (LIMIT > 0) clips = clips.slice(-LIMIT)
if (clips.length === 0) throw new Error(`no clips in ${CLIPS}${DEVICE ? ` from the ${DEVICE}` : ''}`)

// ------------------------------------------------------------------ measuring words

/** The game's vocabulary: every call of the built-in verbs, games and things, the made ones in the library, and the cast's names in both languages. */
const LIBRARY = path.join(ROOT, 'silly-billy', 'library')
const made = ['actions', 'items', 'avatars'].flatMap((folder) => {
  const dir = path.join(LIBRARY, folder)
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) : []
})
const VOCAB = [
  ...[...content.BUILTIN_ACTIONS, ...content.BUILTIN_ITEMS, ...made].map((e) => ({ id: e.id, words: [...(e.calls ?? []), ...(e.nameFi ? [e.nameFi] : []), e.name ?? e.id] })),
  ...content.CAST.flatMap((c) => Object.values(c.names).map((n) => ({ id: `cast:${c.id}`, words: [n.name, ...n.calls] }))),
  // Words brain/parse.ts knows of its own: stopping, everyone, making anew.
  { id: 'parser', words: ['seis', 'stop', 'lopeta', 'lopettakaa', 'kaikki', 'kaikkien', 'kaikille', 'everyone', 'everybody', 'ja', 'and', 'tee', 'make', 'uusi', 'new', 'tänne', 'here'] },
]
const CAST_ONLY = VOCAB.filter((v) => v.id.startsWith('cast:'))

const wordsOf = (text) => text.toLowerCase().normalize('NFC').split(/[^\p{L}\p{N}'-]+/u).filter((w) => w !== '')
/** Words the parser would know, as a share of the words (exact, or a known word with a Finnish ending). */
const known = (text) => {
  const ws = wordsOf(text)
  return ws.length === 0 ? null : ws.filter((w) => ['exact', 'ending'].includes(words.matchWordForm(w, VOCAB)?.form)).length / ws.length
}
/** The cast members named, in order. */
const named = (text) => wordsOf(text).flatMap((w) => words.matchWordForm(w, CAST_ONLY)?.id ?? [])
/** Letters beyond what the language writes. */
const foreign = (text, lang) => [...text.normalize('NFC').toLowerCase()].some((ch) => /\p{L}/u.test(ch) && !(lang === 'fi' ? /[a-zåäö]/ : /[a-z]/).test(ch))
const looped = (raw) => whisper.untangle(raw.replace(/\s+/g, ' ').trim()) !== raw.replace(/\s+/g, ' ').trim()

function distance(a, b) {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]
    d[0] = i
    for (let j = 1; j <= b.length; j++) {
      const keep = d[j]
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = keep
    }
  }
  return d[b.length]
}
const plain = (text) => wordsOf(text).join(' ')

// ------------------------------------------------------------------ the server

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function startServer(bin, modelFile) {
  const child = spawn(bin, ['-m', modelFile, '--host', '127.0.0.1', '--port', String(PORT), '-t', '4', '-nt', '-vm', VAD_MODEL], { stdio: 'ignore' })
  let gone = false
  child.on('exit', () => (gone = true))
  const t0 = Date.now()
  while (!gone && Date.now() - t0 < 120_000) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(1000) })
      if (r.ok) {
        const extras = new Set((r.headers.get('x-whisper-extras') ?? '').split(',').map((x) => x.trim()))
        return { child, extras, loaded: Date.now() - t0 }
      }
    } catch {
      // not yet
    }
    await sleep(250)
  }
  child.kill('SIGKILL')
  throw new Error(`${path.basename(bin)} with ${path.basename(modelFile)} did not answer on port ${PORT} (is something else on it?)`)
}

async function stopServer(child) {
  const gone = new Promise((r) => child.once('exit', r))
  child.kill()
  await Promise.race([gone, sleep(5000).then(() => child.kill('SIGKILL'))])
}

/** The clip with its voice at -20 dB: at most 30 dB louder, its peak kept under -1 dB. */
function louder(wav, sound) {
  if (sound === null) return wav
  const gainDb = Math.min(-20 - sound.voiceDb, 30, -1 - sound.peakDb)
  if (gainDb <= 0) return wav
  const g = 10 ** (gainDb / 20)
  const out = Buffer.from(wav)
  for (let i = 44; i + 1 < out.length; i += 2) out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(out.readInt16LE(i) * g))), i)
  return out
}

async function hear(c, clip, extras) {
  const { lang, prime } = clip.info
  const fields = { ...whisper.hearFields(lang, prime, c.letters ? extras : new Set()), ...(c.vad ? { vad: 'true' } : {}) }
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(c.loud ? louder(clip.wav, clip.sound) : clip.wav)], { type: 'audio/wav' }), 'clip.wav')
  for (const [k, v] of Object.entries(fields)) form.append(k, v)
  const t0 = performance.now()
  const r = await fetch(`http://127.0.0.1:${PORT}/inference`, { method: 'POST', body: form, signal: AbortSignal.timeout(60_000) })
  const ms = Math.round(performance.now() - t0)
  if (!r.ok) throw new Error(`${c.id} on ${clip.name}: ${r.status} ${(await r.text()).slice(0, 200)}`)
  const body = await r.json()
  const raw = body.text.replace(/\s+/g, ' ').trim()
  const segs = body.segments ?? []
  // What the game goes on with: heardWords, and nothing from a clip with no voice in it (server/voice.ts's voiceless).
  const words = whisper.heardWords(raw, lang, prime)
  return { raw, words, text: voice.voiceless(clip.sound) ? '' : words, ms, noSpeech: segs.length ? Math.max(...segs.map((s) => s.no_speech_prob)) : null }
}

// ------------------------------------------------------------------ how the clips sound, per device and speaker

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null)
const p90 = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.9))] : null)
const pct = (x) => (x === null ? '-' : `${(100 * x).toFixed(1)}%`)

/**
 * What reaches /hear from each device and speaker, before any recognizer: the voice's level and
 * the room's, clipping, quiet before and after the words (speech in the first or last 60 ms may
 * have been cut off by the button), zeros at the start (the microphone not yet running), how long
 * after the press recording started, how much of the hold the clip lost, and the pitch.
 */
function soundTable() {
  const rows = []
  for (const [title, by] of [['device', (c) => c.device], ['who (marked)', (c) => c.who], ['pitch', (c) => c.pitch]]) {
    for (const key of [...new Set(clips.map(by))].sort()) {
      const some = clips.filter((c) => by(c) === key && c.sound !== null)
      const m = (f) => median(some.map(f).filter((x) => x !== null))
      const mics = some.filter((c) => c.info.mic)
      rows.push(
        `| ${title}: ${key} | ${some.length} | ${m((c) => c.sound.seconds)} | ${m((c) => c.sound.voiceDb)} | ${m((c) => c.sound.floorDb)} | ${m((c) => c.sound.peakDb)} | ${some.filter((c) => c.sound.clipped > 0.001).length} | ${some.filter((c) => c.sound.quietLeadMs < 60).length} | ${some.filter((c) => c.sound.quietTailMs < 60).length} | ${some.filter((c) => c.sound.zeroLeadMs > 0).length} | ${m((c) => c.sound.pitchHz)} | ${mics.length ? `${median(mics.map((c) => c.info.mic.startMs))}, ${p90(mics.map((c) => c.info.mic.startMs))}` : '-'} | ${mics.length ? median(mics.map((c) => Math.round(c.info.mic.heldMs - 1000 * c.sound.seconds))) : '-'} | ${[...new Set(mics.map((c) => `${c.info.mic.asked.echoCancellation ? 'on' : 'off'} (got ${c.info.mic.got.sampleRate ?? '?'} Hz, ns ${c.info.mic.got.noiseSuppression}, agc ${c.info.mic.got.autoGainControl})`))].join('; ') || '-'} |`,
      )
    }
  }
  return `| clips | n | seconds | voice dB | room dB | peak dB | clipped | words at the very start | words at the very end | zeros at the start | pitch Hz | recording started after (ms, median and 9 in 10) | held but not in the clip (ms) | processing asked (and given) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`
}
if (SOUND_ONLY) {
  console.log(soundTable())
  process.exit(0)
}

// ------------------------------------------------------------------ the run

fs.mkdirSync(OUT, { recursive: true })
console.log(`${clips.length} clips from ${CLIPS}; ${candidates.length} candidates; port ${PORT}; out ${OUT}`)
/** results[candidate id][clip name] */
const results = {}
const servers = [...new Set(candidates.map((c) => `${c.bin}\n${c.model}`))]
for (const key of servers) {
  const [bin, modelFile] = key.split('\n')
  const group = candidates.filter((c) => c.bin === bin && c.model === modelFile)
  const { child, extras, loaded } = await startServer(bin, modelFile)
  console.log(`${path.basename(modelFile)} (${bin.includes('silly-billy-whisper') ? 'own build' : "belay-that's build"}${extras.has('suppress_regex') ? ', with suppress_regex' : ''}) up in ${(loaded / 1000).toFixed(1)} s: ${group.map((c) => c.id).join(', ')}`)
  if (group.some((c) => c.letters) && !extras.has('suppress_regex')) throw new Error(`${bin} does not say it understands suppress_regex`)
  try {
    for (const c of group) results[c.id] = {}
    // A warm-up, so the first clip's time is not the model's first run.
    await hear(group[0], clips[0], extras)
    let done = 0
    for (const clip of clips) {
      for (const c of group) results[c.id][clip.name] = await hear(c, clip, extras)
      if (++done % 25 === 0) process.stdout.write(`  ${done}/${clips.length}\r`)
    }
  } finally {
    await stopServer(child)
  }
}

// ------------------------------------------------------------------ the report

/** The measures of one candidate on some clips. */
function measure(id, some) {
  const rows = some.map((clip) => ({ clip, r: results[id][clip.name] }))
  const spoken = rows.filter(({ clip }) => clip.info.said !== '')
  const silent = rows.filter(({ clip }) => clip.info.said === '')
  const truth = rows.filter(({ clip }) => typeof clip.info.said === 'string' && clip.info.said !== '')
  const knownShares = spoken.map(({ r }) => known(r.text)).filter((x) => x !== null)
  let chars = 0
  let charsWrong = 0
  let wordsAll = 0
  let wordsWrong = 0
  let nameRight = 0
  let nameWanted = 0
  for (const { clip, r } of truth) {
    const said = plain(clip.info.said)
    const got = plain(r.text)
    chars += said.length
    charsWrong += distance(said, got)
    wordsAll += said.split(' ').length
    wordsWrong += distance(said.split(' '), got === '' ? [] : got.split(' '))
    const want = named(clip.info.said)[0]
    if (want !== undefined) {
      nameWanted++
      if (named(r.text)[0] === want) nameRight++
    }
  }
  return {
    clips: rows.length,
    foreign: rows.filter(({ clip, r }) => foreign(r.raw, clip.info.lang)).length,
    loops: rows.filter(({ r }) => looped(r.raw)).length,
    empty: spoken.filter(({ r }) => r.text === '').length,
    invented: silent.filter(({ r }) => r.text !== '').length,
    inventedUngated: silent.filter(({ r }) => r.words !== '').length,
    silent: silent.length,
    known: knownShares.length ? knownShares.reduce((a, b) => a + b, 0) / knownShares.length : null,
    named: spoken.length ? spoken.filter(({ r }) => named(r.text).length > 0).length / spoken.length : null,
    marked: truth.length,
    cer: chars ? charsWrong / chars : null,
    wer: wordsAll ? wordsWrong / wordsAll : null,
    rightName: nameWanted ? nameRight / nameWanted : null,
    ms: median(rows.map(({ r }) => r.ms)),
    ms90: p90(rows.map(({ r }) => r.ms)),
  }
}

const HEAD = '| candidate | clips | foreign letters | loops | empty | invented on silence | words known | a name | marked | chars wrong | words wrong | right name | ms (median, 9 in 10) |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|'
const line = (id, m) =>
  `| ${id} | ${m.clips} | ${m.foreign} | ${m.loops} | ${m.empty} | ${m.silent ? `${m.invented} of ${m.silent} (${m.inventedUngated} without the voice gate)` : '-'} | ${pct(m.known)} | ${pct(m.named)} | ${m.marked} | ${pct(m.cer)} | ${pct(m.wer)} | ${pct(m.rightName)} | ${m.ms}, ${m.ms90} |`
const groups = [
  ['all clips', () => 'all'],
  ['device', (c) => c.device],
  ['who (marked)', (c) => c.who],
  ['pitch', (c) => c.pitch],
  ['variant (synthetic)', (c) => c.variant],
]
const summary = {}
let report = `# Hearing bench, ${new Date().toISOString()}\n\n${clips.length} clips from \`${CLIPS}\`.\n\n`
report += `${candidates.map((c) => `- **${c.id}**: ${c.about} (${path.basename(c.model)})`).join('\n')}\n\n## How the clips sound\n\n${soundTable()}\n`
for (const [title, by] of groups) {
  const keys = [...new Set(clips.map(by))].filter((k) => k !== null).sort()
  if (title !== 'all clips' && keys.length < 2 && !(title === 'device' && keys.length === 1)) continue
  report += `## ${title}\n\n`
  for (const key of keys) {
    const some = clips.filter((c) => by(c) === key)
    if (title !== 'all clips') report += `### ${key} (${some.length})\n\n`
    report += `${HEAD}\n`
    for (const c of candidates) {
      const m = measure(c.id, some)
      ;(summary[`${title}: ${key}`] ??= {})[c.id] = m
      report += `${line(c.id, m)}\n`
    }
    report += '\n'
  }
}
const sideBySide = clips
  .map((clip) => {
    const s = clip.sound
    const head = `### ${clip.name}\n\n${clip.device}, ${clip.who === 'not marked' ? 'who not marked' : `who: ${clip.who}`}${clip.variant ? `, ${clip.variant}` : ''}${s ? `, ${s.seconds} s, voice ${s.voiceDb} dB, room ${s.floorDb} dB, peak ${s.peakDb} dB${s.clipped ? `, clipped ${pct(s.clipped)}` : ''}, pitch ${s.pitchHz ?? '-'} Hz, quiet first ${s.quietLeadMs} ms${s.zeroLeadMs ? ` (${s.zeroLeadMs} ms of zeros)` : ''}` : ''}${clip.info.mic ? `, held ${clip.info.mic.heldMs} ms, started after ${clip.info.mic.startMs} ms, asked ${clip.info.mic.asked.echoCancellation ? 'processing on' : 'processing off'}` : ''}\n\n`
    const said = typeof clip.info.said === 'string' ? `- **said**: ${clip.info.said === '' ? '(nothing)' : clip.info.said}\n` : clip.info.text !== undefined && clip.info.userAgent !== 'synthetic' ? `- *the game heard*: ${clip.info.text}\n` : ''
    const heard = candidates
      .map((c) => {
        const r = results[c.id][clip.name]
        return `- ${c.id}: ${r.text === '' ? '(nothing)' : r.text}${r.raw !== r.text ? ` (wrote: ${r.raw})` : ''} [${r.ms} ms${r.noSpeech !== null ? `, no speech ${r.noSpeech.toFixed(2)}` : ''}]`
      })
      .join('\n')
    return `${head}${said}${heard}\n`
  })
  .join('\n')
report += `## Side by side\n\nTo mark what was really said and who said it: \`node silly-billy/tools/mark.mjs\` (or write \`"said"\` and \`"who"\` into the clip's JSON); the next run measures against it.\n\n${sideBySide}`
fs.writeFileSync(path.join(OUT, 'report.md'), report)
fs.writeFileSync(path.join(OUT, 'results.json'), `${JSON.stringify({ at: new Date().toISOString(), clips: CLIPS, candidates, summary, results }, null, 1)}\n`)

console.log('')
for (const [title, by] of groups.slice(0, 2)) {
  for (const key of [...new Set(clips.map(by))].sort()) {
    console.log(`\n${title === 'all clips' ? 'all clips' : `${title}: ${key}`}`)
    console.log(`${'candidate'.padEnd(20)} foreign loops empty invented known  named  CER    WER    name   ms`)
    for (const c of candidates) {
      const m = summary[`${title}: ${key}`][c.id]
      console.log(`${c.id.padEnd(20)} ${String(m.foreign).padStart(7)} ${String(m.loops).padStart(5)} ${String(m.empty).padStart(5)} ${(m.silent ? `${m.invented}/${m.silent}` : '-').padStart(8)} ${pct(m.known).padStart(6)} ${pct(m.named).padStart(6)} ${pct(m.cer).padStart(6)} ${pct(m.wer).padStart(6)} ${pct(m.rightName).padStart(6)} ${m.ms}`)
    }
  }
}
console.log(`\nreport: ${path.join(OUT, 'report.md')}`)
