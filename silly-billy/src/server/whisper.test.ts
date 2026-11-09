/**
 * Hearing: which server and model are run, what every request asks of whisper-server in each
 * language (and of Silly Billy's build, the letters it may not write), the default primes, the
 * words made fit for the game (letters folded, inventions on silence and loops taken out), and
 * the server's life with the fake whisper-server: started and waited for, every field sent (the
 * extra ones only to a server that says it understands them), and stopped so that the next one
 * on the port waits for it to be gone.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { hearingPrime } from '../voice/prime'
import { alive, fakeBin, freePort } from './test/fakes'
import { Whisper, cleanHeard, defaultPrime, foldLetters, hearFields, heardWords, suppressRegex, untangle, whisperSetup, type Extra, type WhisperSetup } from './whisper'

const STOCK = new Set<Extra>()
const OWN = new Set<Extra>(['suppress_regex'])

describe('whisperSetup', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-billy-home-'))
  afterAll(() => fs.rmSync(home, { recursive: true, force: true }))
  const own = path.join(home, 'src', 'silly-billy-whisper')
  const belay = path.join(home, 'src', 'belay-that', 'vendor')

  it("runs belay-that's build and model when Silly Billy's own is not there", () => {
    expect(whisperSetup({}, home)).toEqual({ bin: path.join(belay, 'whisper.cpp', 'build', 'bin', 'whisper-server'), model: path.join(belay, 'models', 'ggml-large-v3-turbo-q8_0.bin'), port: 8179 })
  })

  it('runs the own build with its best model once both are there, unless the environment names others', () => {
    const bin = path.join(own, 'whisper.cpp', 'build', 'bin', 'whisper-server')
    fs.mkdirSync(path.dirname(bin), { recursive: true })
    fs.writeFileSync(bin, '')
    // The build alone is not enough.
    expect(whisperSetup({}, home).bin).toContain('belay-that')
    const model = path.join(own, 'models', 'ggml-fi-large-v3-q8_0.bin')
    fs.mkdirSync(path.dirname(model), { recursive: true })
    fs.writeFileSync(model, '')
    expect(whisperSetup({}, home)).toEqual({ bin, model, port: 8179 })
    expect(whisperSetup({ SILLY_WHISPER_BIN: '/x/server', SILLY_WHISPER_MODEL: '/x/model.bin', SILLY_WHISPER_PORT: '8199' }, home)).toEqual({ bin: '/x/server', model: '/x/model.bin', port: 8199 })
  })
})

describe('hearFields', () => {
  it('sends every field a request can set that changes what is heard, every time', () => {
    const fields = hearFields('fi', 'Aino ja Eetu leikkivät.', STOCK)
    for (const name of ['language', 'prompt', 'response_format', 'temperature', 'temperature_inc', 'beam_size', 'best_of', 'no_speech_thold', 'logprob_thold', 'entropy_thold', 'translate', 'detect_language', 'carry_initial_prompt', 'max_context', 'audio_ctx', 'suppress_nst', 'no_timestamps', 'offset_t', 'duration']) {
      expect(fields).toHaveProperty(name)
    }
    expect(Object.keys(hearFields('en', 'x', STOCK)).sort()).toEqual(Object.keys(fields).sort())
  })

  it('hears the language of the setting, primed with the sentence given, never translated or guessed', () => {
    for (const lang of ['fi', 'en'] as const) {
      expect(hearFields(lang, `prime in ${lang}`, STOCK)).toMatchObject({ language: lang, prompt: `prime in ${lang}`, translate: 'false', detect_language: 'false' })
    }
  })

  it("asks for each segment's no-speech and log probabilities, without guessing the language for them", () => {
    expect(hearFields('fi', 'x', STOCK)).toMatchObject({ response_format: 'verbose_json', no_language_probabilities: 'true', token_timestamps: 'false' })
  })

  it('never samples at a higher temperature, and decodes with a beam of five over the whole clip', () => {
    expect(hearFields('fi', 'x', STOCK)).toMatchObject({ temperature: '0', temperature_inc: '0', beam_size: '5', audio_ctx: '0' })
    // A max_context of 0 would leave the prime out.
    expect(hearFields('fi', 'x', STOCK).max_context).toBe('-1')
  })

  it("tells Silly Billy's build which letters it may not write, and the stock build nothing it does not know", () => {
    expect(hearFields('fi', 'Aino leikkii.', STOCK)).not.toHaveProperty('suppress_regex')
    expect(hearFields('fi', 'Aino leikkii.', OWN)).toEqual({ ...hearFields('fi', 'Aino leikkii.', STOCK), suppress_regex: suppressRegex('fi', 'Aino leikkii.') })
    expect(hearFields('en', 'Zoë is playing.', OWN).suppress_regex).toBe(suppressRegex('en', 'Zoë is playing.'))
  })
})

describe('suppressRegex', () => {
  /**
   * Whether whisper-server would never write this token: the regex matched against the whole
   * token's bytes, as std::regex does with ECMAScript and regex_match. A JavaScript regex over the
   * bytes as Latin-1 characters reads the same pattern the same way (checked against std::regex
   * for the tokens below too).
   */
  const suppressed = (rx: string, token: string | number[]) => {
    const bytes = typeof token === 'string' ? [...new TextEncoder().encode(token)] : token
    return new RegExp(`^(?:${rx})$`).test(String.fromCharCode(...bytes))
  }
  const fi = suppressRegex('fi', defaultPrime('fi'))

  it("never lets Finnish be written with letters Finnish does not have", () => {
    for (const t of [' það', 'ð', 'ó', 'Þ', ' úti', 'ü', 'é', 'æ', 'ø', 'ñ', '…', '–', 'и']) expect(suppressed(fi, t), t).toBe(true)
  })

  it('keeps every Finnish word and name, and ASCII', () => {
    for (const t of [' hyppää', ' Mirri', 'Noora', ' liukumäestä', ' syö', ' Åke', 'ÄÖ', ' Kiitos!', ' 3', ' og', '.', ' ', "'"]) expect(suppressed(fi, t), t).toBe(false)
  })

  it('keeps a token that holds only the first or the last byte of a Finnish letter, and no other part of a letter', () => {
    const [lead, a] = [...new TextEncoder().encode('ä')]
    expect(suppressed(fi, [lead!])).toBe(false)
    expect(suppressed(fi, [a!])).toBe(false)
    expect(suppressed(fi, [0x20, 0x68, lead!])).toBe(false)
    // The end of 'ð' (C3 B0), alone or after a letter.
    expect(suppressed(fi, [0xb0])).toBe(true)
    expect(suppressed(fi, [0x61, 0xb0])).toBe(true)
    // The start of a three-byte character no letter here begins with.
    expect(suppressed(fi, [0xe2])).toBe(true)
  })

  it('writes English in ASCII, with the letters of the names here', () => {
    const en = suppressRegex('en', 'Alice and Zoë are playing.')
    expect(suppressed(en, ' Alice')).toBe(false)
    expect(suppressed(en, ' Zoë')).toBe(false)
    expect(suppressed(en, 'Ë')).toBe(false)
    expect(suppressed(en, ' hyppää')).toBe(true)
    expect(suppressed(suppressRegex('en', 'Alice is playing.'), ' Zoë')).toBe(true)
  })

  it('is the same for primes with the same letters', () => {
    expect(suppressRegex('fi', 'Aino ja Eetu leikkivät.')).toBe(suppressRegex('fi', 'Mikko leikkii.'))
  })
})

describe('defaultPrime', () => {
  it('names the starting cast in the language', () => {
    expect(defaultPrime('fi')).toBe(hearingPrime('fi', ['Aino', 'Eetu', 'Mikko', 'Noora', 'Mirri']))
    expect(defaultPrime('en')).toBe(hearingPrime('en', ['Alice', 'Steve', 'Mike', 'Nora', 'Luna']))
    expect(defaultPrime('fi')).toContain('Aino')
    expect(defaultPrime('en')).toContain('Luna')
  })
})

describe('foldLetters', () => {
  it("folds what Whisper wrote of Sami's child into Finnish letters", () => {
    expect(foldLetters('Yrri, laskja ljúkumaðist.', 'fi')).toBe('Yrri, laskja ljukumadist.')
    expect(foldLetters('Noora, kefið ekki einulleg.', 'fi')).toBe('Noora, kefid ekki einulleg.')
    expect(foldLetters('Noora kýpja búhún.', 'fi')).toBe('Noora kypja buhun.')
    expect(foldLetters('Mirri laski liukumæsti.', 'fi')).toBe('Mirri laski liukumästi.')
    expect(foldLetters('Noora, laske Liukumäestä.', 'fi')).toBe('Noora, laske Liukumäestä.')
  })

  it("keeps Finnish letters in Finnish and folds the rest to the nearest: ø to ö, ü to y, þ to t, ß to ss", () => {
    expect(foldLetters('Åke, Ø, ü, Þór, Straße, Ærø', 'fi')).toBe('Åke, Ö, y, Tor, Strasse, Ärö')
    expect(foldLetters('ÄÖÅ äöå', 'fi')).toBe('ÄÖÅ äöå')
  })

  it('writes English in English letters', () => {
    expect(foldLetters('Alice, hyppää! Ærø þing Straße Zoë', 'en')).toBe('Alice, hyppaa! Aero thing Strasse Zoe')
  })

  it('leaves out the letters of other scripts, and words left with none', () => {
    expect(foldLetters('Noora,ери ja Aino, tulkaa tänne.', 'fi')).toBe('Noora, ja Aino, tulkaa tänne.')
    expect(foldLetters('Hyvä Mλαki! 生 ok', 'fi')).toBe('Hyvä Mki! ok')
  })

  it('keeps a letter the names of who is here have, so a name stays as it was given', () => {
    expect(foldLetters('Zoë, hyppää', 'fi', 'Aino, Zoë ja Noora leikkivät.')).toBe('Zoë, hyppää')
    expect(foldLetters('Zoë, hyppää', 'fi')).toBe('Zoe, hyppää')
    expect(foldLetters('Äijä, jump', 'en', 'Alice and Äijä are playing.')).toBe('Äijä, jump')
  })

  it('takes letters written as a base and a mark as one letter', () => {
    expect(foldLetters('hän ja ú', 'fi')).toBe('hän ja u')
  })
})

describe('cleanHeard', () => {
  it("drops Whisper's inventions on silence and the noises it writes in brackets", () => {
    for (const s of [' Kiitos kun katsoit! ', 'Kiitos, että katsoitte.', 'Kiitos katsomisesta.', 'Tekstitys: Joku', 'Thank you for watching!', 'you']) expect(cleanHeard(s)).toBe('')
    expect(cleanHeard(' [Musiikkia] Noora,  hyppää! ')).toBe('Noora, hyppää!')
    expect(cleanHeard('Kiitos, Aino!')).toBe('Kiitos, Aino!')
  })
})

describe('untangle', () => {
  it('cuts a loop to three', () => {
    expect(untangle(`Ei, no. ${'ei, '.repeat(80)}ei.`)).toBe('Ei, no. ei, ei, ei,')
    expect(untangle(`Tämä on ${'kuitenkin '.repeat(40)}k`)).toBe('Tämä on kuitenkin kuitenkin kuitenkin k')
    expect(untangle('Noora ja, noora ja, noora ja, noora ja, noora ja.')).toBe('Noora ja, noora ja, noora ja,')
  })

  it('leaves words said up to three times as they are', () => {
    expect(untangle('Keinu, keinu, keinu!')).toBe('Keinu, keinu, keinu!')
    expect(untangle('Aino hyppää ja Eetu hyppää')).toBe('Aino hyppää ja Eetu hyppää')
  })
})

describe('heardWords', () => {
  it('folds, cleans and untangles', () => {
    expect(heardWords(' Yrri, laskja ljúkumaðist. [Musiikkia]', 'fi', defaultPrime('fi'))).toBe('Yrri, laskja ljukumadist.')
    expect(heardWords('Kiitos kun katsoit!', 'fi', defaultPrime('fi'))).toBe('')
    expect(heardWords(`Eetu, ${'hyppää, '.repeat(20)}`, 'en', defaultPrime('en'))).toBe('Eetu, hyppaa, hyppaa, hyppaa,')
  })
})

// ------------------------------------------------------------------ the server, with the fake whisper-server

describe('Whisper', () => {
  let dir: string
  let setup: WhisperSetup
  const logs: string[] = []
  const asked = () => (fs.existsSync(path.join(dir, 'asked.jsonl')) ? fs.readFileSync(path.join(dir, 'asked.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l) as Record<string, unknown>) : [])
  const WAV = Buffer.concat([Buffer.from('RIFF....WAVEfmt '), Buffer.alloc(64)])
  const open: Whisper[] = []
  const whisper = () => {
    const w = new Whisper(setup, (m) => logs.push(m))
    open.push(w)
    return w
  }

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silly-billy-whisper-'))
    fs.writeFileSync(path.join(dir, 'model.bin'), 'not really a model')
    setup = { bin: fakeBin(dir, 'fake-whisper.mjs'), model: path.join(dir, 'model.bin'), port: await freePort() }
    process.env.FAKE_WHISPER_LOG = path.join(dir, 'asked.jsonl')
    process.env.FAKE_WHISPER_TEXT_FILE = path.join(dir, 'text.txt')
    process.env.FAKE_WHISPER_DELAY = '200'
    process.env.FAKE_WHISPER_STOP_DELAY = '400'
  })

  afterAll(() => {
    for (const w of open) w.close()
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('starts on the first words and waits for the server, then sends every field with the prime', async () => {
    fs.writeFileSync(path.join(dir, 'text.txt'), ' Yrri, laskja ljúkumaðist. ')
    const w = whisper()
    expect(w.state).toBe('off')
    expect(await w.ready(5000)).toBe(true)
    const prime = hearingPrime('fi', ['Aino', 'Mirri'])
    const heard = await w.transcribe(WAV, 'fi', prime)
    expect(heard).toMatchObject({ text: 'Yrri, laskja ljukumadist.', raw: 'Yrri, laskja ljúkumaðist.', noSpeech: 0.25, logprob: -0.5, extras: [] })
    expect(w.model).toBe('model.bin')
    await w.transcribe(WAV, 'en', defaultPrime('en'))
    const [a, b] = asked()
    expect(a).toMatchObject({ model: setup.model, file: { wav: true }, ...hearFields('fi', prime, STOCK) })
    expect(b).toMatchObject({ file: { wav: true }, ...hearFields('en', defaultPrime('en'), STOCK) })
    // Nothing more and nothing less than the fields: the stock server is sent no suppress_regex.
    expect(Object.keys(a!).sort()).toEqual(['file', 'model', 'pid', ...Object.keys(hearFields('fi', prime, STOCK))].sort())
  })

  it('stops its server, and the next one on the port waits until the old one is gone before it starts its own', async () => {
    fs.writeFileSync(path.join(dir, 'text.txt'), ' Noora, hyppää! ')
    const first = open[0]!
    const before = asked().length
    await first.transcribe(WAV, 'fi', 'x')
    const oldPid = asked()[before]!.pid as number
    // The server code reloaded: the old Api closed its Whisper, the fresh one gets the next words at once.
    first.close()
    expect(first.state).toBe('off')
    const next = whisper()
    expect(await next.ready(5000)).toBe(true)
    expect(alive(oldPid)).toBe(false)
    expect((await next.transcribe(WAV, 'fi', 'x')).text).toBe('Noora, hyppää!')
    const newPid = asked().at(-1)!.pid as number
    expect(newPid).not.toBe(oldPid)
    expect(logs.filter((l) => l.startsWith('whisper: ready'))).toHaveLength(2)
  })

  it("sends the letters it may not write to a server that says it understands them, and keeps to what it says after a restart", async () => {
    const port = await freePort()
    process.env.FAKE_WHISPER_EXTRAS = 'suppress_regex'
    const own = new Whisper({ ...setup, port }, (m) => logs.push(m))
    open.push(own)
    try {
      expect(await own.ready(5000)).toBe(true)
    } finally {
      delete process.env.FAKE_WHISPER_EXTRAS
    }
    expect([...own.extras]).toEqual(['suppress_regex'])
    const prime = hearingPrime('fi', ['Aino', 'Zoë'])
    const before = asked().length
    expect((await own.transcribe(WAV, 'fi', prime)).extras).toEqual(['suppress_regex'])
    expect(asked()[before]).toMatchObject({ ...hearFields('fi', prime, OWN), suppress_regex: suppressRegex('fi', prime) })
    expect(logs.at(-1)).toContain('with suppress_regex')
    own.close()
  })

  it('says at once when there is no server to start', async () => {
    const w = new Whisper({ ...setup, bin: path.join(dir, 'no-such-whisper') }, (m) => logs.push(m))
    const t0 = Date.now()
    expect(await w.ready(5000)).toBe(false)
    expect(w.state).toBe('missing')
    expect(Date.now() - t0).toBeLessThan(1000)
  })
})
