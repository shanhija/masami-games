import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { SOUND_NAMES, type SoundName } from '../../../silly-billy/src/engine/types'
import { NO_POINTING } from '../seats/types'
import { WORLD_REF } from './api'
import { HOUSE_SOUNDS, RECORDED, synthesised, type HouseSound } from './sounds'
import { idle, NEVER, plainRoom, playRoom, roomStart, testRoom } from './testing'

const ROOT = path.resolve(import.meta.dirname, '../../..')
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8')
const SOURCES = JSON.parse(read('magic-house/sounds/sources.json')) as {
  packs: Record<string, { name: string; page: string; file: string }>
  sounds: Record<string, { secs: number; level: number; gain: number; from: string[] }>
}
const SYNTHESISED = new Set<string>(SOUND_NAMES)

describe('the sounds a room can name', () => {
  it("w.sound's line lists every name, and a room plays each of them", () => {
    expect(WORLD_REF.sound).toContain(`plays a sound: ${HOUSE_SOUNDS.join(' ')}.`)
    // One a frame: the world keeps a second of cues, longer than they take.
    const room = testRoom((r, w) => {
      plainRoom(r, w, NEVER)
      let next = 0
      return () => {
        if (next < HOUSE_SOUNDS.length) w.sound(HOUSE_SOUNDS[next++])
      }
    }, roomStart(1, 'together', 1, 11))
    playRoom(room, HOUSE_SOUNDS.length + 1, idle(room), () => NO_POINTING)
    const played = new Set(room.world.sounds.map((s) => s.name))
    for (const name of HOUSE_SOUNDS) expect(played.has(name), name).toBe(true)
  })

  it('every name has a sound: a synthesised one, or a recording with a synthesised one to stand in for it', () => {
    expect(new Set(HOUSE_SOUNDS).size).toBe(HOUSE_SOUNDS.length)
    for (const name of HOUSE_SOUNDS) {
      expect(SYNTHESISED.has(name) || name in SOURCES.sounds, name).toBe(true)
      expect(SYNTHESISED.has(synthesised(name)), name).toBe(true)
    }
    for (const [name, standIn] of Object.entries(RECORDED) as [string, SoundName][]) {
      expect(SYNTHESISED.has(name), `${name} is a recorded name, not a synthesised one`).toBe(false)
      expect(SOURCES.sounds[name], `${name} has recordings in sources.json`).toBeDefined()
      expect(synthesised(name as HouseSound)).toBe(standIn)
    }
  })

  it('every sound in the sources is named and made of recordings in its packs, and every pack is used', () => {
    for (const name of Object.keys(SOURCES.sounds)) expect(HOUSE_SOUNDS, name).toContain(name)
    const used = new Set<string>()
    for (const [name, sound] of Object.entries(SOURCES.sounds)) {
      expect(sound.from.length, name).toBeGreaterThan(0)
      expect(sound.secs, name).toBeGreaterThan(0)
      expect(sound.secs, name).toBeLessThanOrEqual(3)
      expect(sound.level, `${name} is never loud`).toBeLessThanOrEqual(-20)
      for (const src of sound.from) {
        const pack = src.split('/')[0]
        expect(SOURCES.packs[pack], `${name}: ${src}`).toBeDefined()
        // A pack that is one recording is named alone; a zip's recordings by their path in it.
        expect(src.includes('/'), `${name}: ${src}`).toBe(SOURCES.packs[pack].file.endsWith('.zip'))
        used.add(pack)
      }
    }
    expect([...used].sort()).toEqual(Object.keys(SOURCES.packs).sort())
    for (const pack of Object.values(SOURCES.packs)) expect(pack.page).toMatch(/^https:\/\/opengameart\.org\/content\//)
  })

  it('nothing in them shoots, screams, cries, hurts, explodes or roars', () => {
    const unkind = /shot|shoot|gun|rifle|cannon|laser|sword|blade|knife|punch|hit_?flesh|hurt|pain|ouch|scream|yell|cry|grunt|explo|boom|bang|roar|monster|growl|snarl|creature_|troll|die/i
    for (const [name, sound] of Object.entries(SOURCES.sounds)) {
      expect(name).not.toMatch(unkind)
      for (const src of sound.from) expect(src).not.toMatch(unkind)
    }
  })
})

describe('the build of the recorded sounds', () => {
  it('runs from npm install and npm run sounds, and in the image build before its npm ci', () => {
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts
    expect(scripts.sounds).toBe('node magic-house/sounds/build.ts')
    expect(scripts.postinstall).toBe('node magic-house/sounds/build.ts --soft')
    const docker = read('hosting/Dockerfile')
    const copied = docker.indexOf('COPY magic-house/sounds/ magic-house/sounds/')
    expect(copied).toBeGreaterThan(0)
    expect(docker.indexOf('RUN npm ci && npm run sounds')).toBeGreaterThan(copied)
    expect(docker.indexOf('COPY . .')).toBeGreaterThan(copied)
  })

  it('writes where the page fetches them, and git and the image context ignore it', () => {
    expect(read('magic-house/sounds/build.ts')).toContain("path.join(ROOT, 'public', 'magic-house', 'recorded')")
    expect(read('magic-house/sounds/build.ts')).toContain("path.join(ROOT, 'node_modules', '.cache', 'magic-house-sounds')")
    expect(read('magic-house/src/shell/houseSounds.ts')).toContain("const RECORDED_DIR = 'recorded/'")
    const lines = (file: string) => read(file).split('\n').map((l) => l.trim())
    expect(lines('.gitignore')).toEqual(expect.arrayContaining(['/public/magic-house/recorded/', 'node_modules/']))
    expect(lines('.dockerignore')).toContain('public/magic-house/recorded')
  })
})
