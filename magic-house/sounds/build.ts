/**
 * Builds Magic House's recorded sounds from CC0 packs on OpenGameArt. It runs after `npm install`
 * (with --soft) and with `npm run sounds`.
 *
 * sources.json names the downloads and, for each sound, the recordings it is made of, in order:
 * recording n becomes public/magic-house/recorded/<name>/<n>.mp3, which Vite serves beside the page
 * and copies into dist. A recording is `<pack>/<path in its zip>`, or `<pack>` for a pack that is one
 * recording. Each is decoded, trimmed of its silence and cut to the sound's length, levelled on its
 * loudest 200 ms with its peaks under -1 dBFS, faded at both ends and written as mono MP3 at 96 kbps;
 * library.json beside them lists each sound's variants and its gain. The downloads stay in
 * node_modules/.cache/magic-house-sounds, so a rebuild does not fetch them again. The output's .built
 * holds a hash of sources.json, this script and the installed versions of the packages that decode
 * and encode (DECODERS): while it matches, there is nothing to do.
 *
 * Anything that goes wrong stops the build with what it was doing, with one exception: with --soft
 * (npm install's postinstall) a download that fails, as on a laptop with no network, only says so
 * and builds nothing, so the install goes on and the game plays its synthesised sounds. The image
 * build runs `npm run sounds` after `npm ci`, where it must find them built.
 */

import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { Mp3Encoder } from '@breezystack/lamejs'
import { OggVorbisDecoder } from '@wasm-audio-decoders/ogg-vorbis'
import { unzipSync } from 'fflate'

interface Pack {
  name: string
  /** Where the pack is described and its CC0 licence stated. */
  page: string
  /** What is downloaded: a .zip, or a single recording (.ogg or .wav). */
  file: string
}

interface Sound {
  /** Seconds kept at most (faded out). */
  secs: number
  /** Loudness of the loudest 200 ms, dBFS. */
  level: number
  /** Gain at play time, for the mix. */
  gain: number
  /** Recordings: `<pack>/<path in its zip>`, or `<pack>` for a pack that is one recording. */
  from: string[]
}

interface Pcm {
  rate: number
  data: Float32Array
}

const HERE = import.meta.dirname
const ROOT = path.resolve(HERE, '../..')
const OUT = path.join(ROOT, 'public', 'magic-house', 'recorded')
const CACHE = path.join(ROOT, 'node_modules', '.cache', 'magic-house-sounds')
const SOFT = process.argv.includes('--soft')

const sourcesText = fs.readFileSync(path.join(HERE, 'sources.json'), 'utf8')
const { packs, sounds } = JSON.parse(sourcesText) as { packs: Record<string, Pack>; sounds: Record<string, Sound> }
/** The packages whose versions change how the recordings come out, so a new version of one builds them again. */
const DECODERS = ['@breezystack/lamejs', '@wasm-audio-decoders/ogg-vorbis', 'fflate']
const versions = DECODERS.map((name) => `${name}@${(JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules', name, 'package.json'), 'utf8')) as { version: string }).version}`).join(' ')
const stamp = createHash('sha256').update(sourcesText).update(fs.readFileSync(import.meta.filename)).update(versions).digest('hex')
const stampFile = path.join(OUT, '.built')

const log = (message: string) => console.log(`magic-house sounds: ${message}`)

// ------------------------------------------------------------------------------ the packs

const fileName = (pack: Pack) => decodeURIComponent(pack.file.split('/').at(-1)!)

/** Downloads a pack into the cache unless it is there; the cached file's path. */
async function fetchPack(id: string, pack: Pack): Promise<string> {
  const file = path.join(CACHE, id, fileName(pack))
  if (fs.existsSync(file)) return file
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const res = await fetch(pack.file, { headers: { 'User-Agent': 'magic-house-sound-build' } })
  if (!res.ok) throw new Error(`downloading ${pack.file}: HTTP ${res.status}`)
  const body = Buffer.from(await res.arrayBuffer())
  log(`downloaded ${pack.name}: ${fileName(pack)} (${(body.length / 1e6).toFixed(2)} MB)`)
  fs.writeFileSync(`${file}.part`, body)
  fs.renameSync(`${file}.part`, file)
  return file
}

/** The bytes of each recording a sound names, the packs read from the cache. */
function recordings(files: Record<string, string>): Map<string, { bytes: Uint8Array; ext: string }> {
  const out = new Map<string, { bytes: Uint8Array; ext: string }>()
  const wanted = new Set(Object.values(sounds).flatMap((s) => s.from))
  for (const [id, file] of Object.entries(files)) {
    if (!file.endsWith('.zip')) {
      if (wanted.has(id)) out.set(id, { bytes: new Uint8Array(fs.readFileSync(file)), ext: path.extname(file).toLowerCase() })
      continue
    }
    const members = unzipSync(new Uint8Array(fs.readFileSync(file)), { filter: (f) => wanted.has(`${id}/${f.name}`) })
    for (const [name, bytes] of Object.entries(members)) out.set(`${id}/${name}`, { bytes, ext: path.extname(name).toLowerCase() })
  }
  for (const src of wanted) if (!out.has(src)) throw new Error(`${src} is in no pack`)
  return out
}

// ------------------------------------------------------------------------------ decoding

function mono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!
  const n = Math.min(...channels.map((c) => c.length))
  const out = new Float32Array(n)
  for (const c of channels) for (let i = 0; i < n; i++) out[i]! += c[i]! / channels.length
  return out
}

/** WAV: PCM of 8, 16, 24 or 32 bits, or float. */
function wav(bytes: Uint8Array): Pcm {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a wav')
  let pos = 12
  let fmt: { format: number; channels: number; rate: number; bits: number } | null = null
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4)
    const size = buf.readUInt32LE(pos + 4)
    const body = pos + 8
    if (id === 'fmt ') {
      let format = buf.readUInt16LE(body)
      if (format === 0xfffe) format = buf.readUInt16LE(body + 24)
      fmt = { format, channels: buf.readUInt16LE(body + 2), rate: buf.readUInt32LE(body + 4), bits: buf.readUInt16LE(body + 14) }
    } else if (id === 'data' && fmt) {
      const size1 = fmt.bits / 8
      const frames = Math.floor(Math.min(size, buf.length - body) / (size1 * fmt.channels))
      const chans = Array.from({ length: fmt.channels }, () => new Float32Array(frames))
      for (let f = 0; f < frames; f++) {
        for (let c = 0; c < fmt.channels; c++) {
          const o = body + (f * fmt.channels + c) * size1
          let v: number
          if (fmt.format === 3) v = size1 === 4 ? buf.readFloatLE(o) : buf.readDoubleLE(o)
          else if (size1 === 1) v = (buf.readUInt8(o) - 128) / 128
          else if (size1 === 2) v = buf.readInt16LE(o) / 32768
          else if (size1 === 3) v = buf.readIntLE(o, 3) / 8388608
          else v = buf.readInt32LE(o) / 2147483648
          chans[c]![f] = v
        }
      }
      return { rate: fmt.rate, data: mono(chans) }
    }
    pos = body + size + (size % 2)
  }
  throw new Error('no data in wav')
}

/** A recording as mono float PCM: WAV or Ogg Vorbis, the two kinds the packs hold. */
async function decode(bytes: Uint8Array, ext: string): Promise<Pcm> {
  if (ext === '.wav') return wav(bytes)
  if (ext !== '.ogg') throw new Error(`no decoder for ${ext}`)
  const dec = new OggVorbisDecoder()
  await dec.ready
  const decoded = await dec.decodeFile(bytes)
  dec.free()
  return { rate: decoded.sampleRate, data: mono(decoded.channelData) }
}

// ------------------------------------------------------------------------------ shaping

/** To 44.1 kHz, unless the rate is one MP3 takes as it is. */
function resample(p: Pcm): Pcm {
  if (p.rate === 44100 || p.rate === 48000 || p.rate === 32000) return p
  const to = 44100
  const k = p.rate / to
  const n = Math.floor(p.data.length / k)
  const out = new Float32Array(n)
  const w = Math.max(1, Math.round(k))
  for (let i = 0; i < n; i++) {
    const c = i * k
    let s = 0
    for (let j = 0; j < w; j++) s += p.data[Math.min(p.data.length - 1, Math.floor(c) + j)]!
    out[i] = s / w
  }
  return { rate: to, data: out }
}

/** Trimmed, cut to length, levelled and faded; null for a recording with less than 5 ms of sound (a click has about that). */
function shape(p: Pcm, s: Sound): Float32Array | null {
  const d = p.data
  const thr = 10 ** (-48 / 20)
  let a = 0
  while (a < d.length && Math.abs(d[a]!) < thr) a++
  let b = d.length - 1
  while (b > a && Math.abs(d[b]!) < thr) b--
  if (b - a < p.rate * 0.005) return null
  const start = Math.max(0, a - Math.floor(p.rate * 0.004))
  const keep = Math.min(b + 1 - start, Math.floor(s.secs * p.rate))
  const out = d.slice(start, start + keep)
  // Level the loudest 200 ms to the target; keep peaks under -1 dBFS.
  const win = Math.floor(p.rate * 0.2)
  let best = 0
  let sum = 0
  for (let i = 0; i < out.length; i++) {
    sum += out[i]! * out[i]!
    if (i >= win) sum -= out[i - win]! * out[i - win]!
    best = Math.max(best, sum / Math.min(win, i + 1))
  }
  const rms = Math.sqrt(best) || 1e-6
  let g = 10 ** (s.level / 20) / rms
  let peak = 0
  for (const v of out) peak = Math.max(peak, Math.abs(v))
  g = Math.min(g, 10 ** (-1 / 20) / (peak || 1e-6))
  const fadeIn = Math.floor(p.rate * 0.002)
  const fadeOut = Math.min(out.length, Math.floor(p.rate * 0.06))
  for (let i = 0; i < out.length; i++) {
    let f = 1
    if (i < fadeIn) f = i / fadeIn
    if (i > out.length - fadeOut) f = Math.min(f, (out.length - i) / fadeOut)
    out[i] = out[i]! * g * f
  }
  return out
}

function mp3(data: Float32Array, rate: number): Buffer {
  const enc = new Mp3Encoder(1, rate, 96)
  const pcm = new Int16Array(data.length)
  for (let i = 0; i < data.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(data[i]! * 32767)))
  const parts: Uint8Array[] = []
  for (let i = 0; i < pcm.length; i += 1152) {
    const b = enc.encodeBuffer(pcm.subarray(i, i + 1152))
    if (b.length) parts.push(new Uint8Array(b))
  }
  const end = enc.flush()
  if (end.length) parts.push(new Uint8Array(end))
  return Buffer.concat(parts)
}

// ------------------------------------------------------------------------------ building

/** Every pack in the cache, or null when one would not download and --soft says to go on without. */
async function fetchAll(): Promise<Record<string, string> | null> {
  const files: Record<string, string> = {}
  for (const [id, pack] of Object.entries(packs)) {
    try {
      files[id] = await fetchPack(id, pack)
    } catch (err) {
      if (!SOFT) throw err
      log(`not built: ${(err as Error).message}${(err as Error).cause ? ` (${String((err as Error).cause)})` : ''}. The game plays its synthesised sounds; npm run sounds builds the recorded ones later.`)
      return null
    }
  }
  return files
}

if (fs.existsSync(stampFile) && fs.readFileSync(stampFile, 'utf8') === stamp) {
  log('up to date')
} else {
  const started = performance.now()
  const files = await fetchAll()
  if (files !== null) {
    const recorded = recordings(files)
    // Built beside the old folder and swapped in whole, so a failed build leaves nothing half done.
    const part = `${OUT}.part`
    fs.rmSync(part, { recursive: true, force: true })
    const library: Record<string, { files: string[]; gain: number }> = {}
    let bytes = 0
    for (const [name, sound] of Object.entries(sounds)) {
      fs.mkdirSync(path.join(part, name), { recursive: true })
      const variants: string[] = []
      for (const src of sound.from) {
        const r = recorded.get(src)!
        const pcm = resample(await decode(r.bytes, r.ext).catch((err: Error) => Promise.reject(new Error(`${name}: ${src}: ${err.message}`))))
        const shaped = shape(pcm, sound)
        if (!shaped) throw new Error(`${name}: ${src} is silent`)
        const out = mp3(shaped, pcm.rate)
        const variant = `${variants.length}.mp3`
        fs.writeFileSync(path.join(part, name, variant), out)
        bytes += out.length
        variants.push(variant)
      }
      library[name] = { files: variants, gain: sound.gain }
    }
    fs.writeFileSync(path.join(part, 'library.json'), JSON.stringify(library, null, 1))
    fs.writeFileSync(path.join(part, '.built'), stamp)
    fs.rmSync(OUT, { recursive: true, force: true })
    fs.renameSync(part, OUT)
    const variants = Object.values(library).reduce((n, e) => n + e.files.length, 0)
    log(`${Object.keys(library).length} sounds, ${variants} recordings, ${(bytes / 1e6).toFixed(2)} MB in public/magic-house/recorded/ (${((performance.now() - started) / 1000).toFixed(1)} s)`)
  }
}
