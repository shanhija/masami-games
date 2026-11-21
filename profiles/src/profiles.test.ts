import fs from 'node:fs'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PARTS, PART_NAMES, parseAvatar, randomAvatar } from './avatar'
import { addProfile, clearGame, enterGame, loadProfiles, pickedHere, pickedProfile, pickProfile, profileSaves, removeProfile, SAVING_GAMES, savedGames, updateProfile } from './profiles'

/** A browser storage in memory, as much of it as the profiles use. */
function memoryStorage() {
  const items = new Map<string, string>()
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
    removeItem: (key: string) => void items.delete(key),
    key: (i: number) => [...items.keys()][i] ?? null,
    get length() {
      return items.size
    },
  }
}

let local: ReturnType<typeof memoryStorage>
let session: ReturnType<typeof memoryStorage>
const replace = vi.fn()

beforeEach(() => {
  local = memoryStorage()
  session = memoryStorage()
  replace.mockReset()
  vi.stubGlobal('localStorage', local)
  vi.stubGlobal('sessionStorage', session)
  vi.stubGlobal('location', { replace })
  vi.stubGlobal('window', new EventTarget())
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const avatar = parseAvatar({})

describe('profiles', () => {
  it('keeps the profiles made, in order, with their names and avatars', () => {
    const masami = addProfile('Masami', { ...avatar, hair: 'pigtails' })
    const pia = addProfile('Pia', avatar)
    expect(loadProfiles()).toEqual([masami, pia])
    updateProfile({ ...pia, name: 'Pia Sofia' })
    expect(loadProfiles().map((p) => p.name)).toEqual(['Masami', 'Pia Sofia'])
    expect(() => updateProfile({ ...pia, id: 'gone' })).toThrow(/gone/)
  })

  it('gives the first profile on a device the saves made before there were profiles, and the next one none', () => {
    local.setItem('castle-builder', 'a castle')
    local.setItem('rocket-factory-2', 'a factory')
    local.setItem('rocket-factory-2-old', 'old factories')
    local.setItem('silly-billy-settings', '{"lang":"fi"}')
    local.setItem('rocket-factory', 'version 1, never read')
    const masami = addProfile('Masami', avatar)
    expect(profileSaves(masami.id, 'castle-builder').getItem('castle-builder')).toBe('a castle')
    expect(profileSaves(masami.id, 'rocket-factory').getItem('rocket-factory-2-old')).toBe('old factories')
    expect(profileSaves(masami.id, 'silly-billy').getItem('silly-billy-settings')).toBe('{"lang":"fi"}')
    expect(local.getItem('castle-builder')).toBeNull()
    expect(local.getItem('rocket-factory')).toBe('version 1, never read')
    expect(savedGames(masami.id)).toEqual(['castle-builder', 'rocket-factory', 'silly-billy'])
    const pia = addProfile('Pia', avatar)
    expect(savedGames(pia.id)).toEqual([])
  })

  it('keeps each profile its own saves, and starts one game over for one profile only', () => {
    const masami = addProfile('Masami', avatar)
    const pia = addProfile('Pia', avatar)
    profileSaves(masami.id, 'pia-jump').setItem('pia-jump', 'three kittens')
    profileSaves(pia.id, 'pia-jump').setItem('pia-jump', 'one kitten')
    profileSaves(masami.id, 'ruokapeli').setItem('ruokapeli', 'a burger')
    expect(profileSaves(masami.id, 'pia-jump').getItem('pia-jump')).toBe('three kittens')
    expect(profileSaves(pia.id, 'pia-jump').getItem('pia-jump')).toBe('one kitten')
    // The same key in another game is another save.
    expect(profileSaves(masami.id, 'marienpeli').getItem('pia-jump')).toBeNull()

    clearGame(masami.id, 'pia-jump')
    expect(profileSaves(masami.id, 'pia-jump').getItem('pia-jump')).toBeNull()
    expect(profileSaves(pia.id, 'pia-jump').getItem('pia-jump')).toBe('one kitten')
    expect(savedGames(masami.id)).toEqual(['ruokapeli'])
  })

  it('removes a profile with every save it had, and its pick', () => {
    const masami = addProfile('Masami', avatar)
    const pia = addProfile('Pia', avatar)
    profileSaves(masami.id, 'castle-builder').setItem('castle-builder', 'a castle')
    profileSaves(pia.id, 'castle-builder').setItem('castle-builder', 'a tower')
    pickProfile(masami.id)
    removeProfile(masami.id)
    expect(loadProfiles()).toEqual([pia])
    expect(savedGames(masami.id)).toEqual([])
    expect([...local.items.keys()].some((key) => key.includes(masami.id))).toBe(false)
    expect(pickedProfile()).toBeNull()
    expect(profileSaves(pia.id, 'castle-builder').getItem('castle-builder')).toBe('a tower')
  })

  it("plays as this tab's pick, or else as the device's last; a fresh tab of the gallery asks again", () => {
    const masami = addProfile('Masami', avatar)
    const pia = addProfile('Pia', avatar)
    expect(pickedProfile()).toBeNull()
    pickProfile(masami.id)
    expect(pickedHere()).toBe(true)
    // Another tab picks Pia: this one plays on as Masami, a fresh one starts as Pia.
    local.setItem('masami-profile', pia.id)
    expect(pickedProfile()).toEqual(masami)
    session.items.clear()
    expect(pickedHere()).toBe(false)
    expect(pickedProfile()).toEqual(pia)
  })

  it('leaves a profile it cannot read out, and keeps the rest', () => {
    local.setItem('masami-profiles', JSON.stringify([{ id: 'a', name: 'Masami', avatar: { hair: 'mohawk', eyes: 'big' } }, { name: 'no id' }]))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(loadProfiles()).toEqual([{ id: 'a', name: 'Masami', avatar: { ...avatar, eyes: 'big' } }])
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('a game page', () => {
  it('goes to the gallery to pick someone when nobody is picked', () => {
    expect(enterGame('pia-jump')).toBeNull()
    expect(replace).toHaveBeenCalledWith('../index.html')
  })

  it("plays on the picked profile's saves, and keeps that profile for its tab", () => {
    const masami = addProfile('Masami', avatar)
    local.setItem('masami-profile', masami.id)
    const saves = enterGame('pia-jump')!
    saves.setItem('pia-jump', 'two kittens')
    expect(profileSaves(masami.id, 'pia-jump').getItem('pia-jump')).toBe('two kittens')
    expect(session.getItem('masami-profile')).toBe(masami.id)
    expect(replace).not.toHaveBeenCalled()
  })

  it('plays on saves in memory where the browser keeps no site data', () => {
    const blocked = () => {
      throw new Error('blocked')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const saves = enterGame('castle-builder')!
    saves.setItem('castle-builder', 'a castle')
    expect(saves.getItem('castle-builder')).toBe('a castle')
    expect(replace).not.toHaveBeenCalled()
  })

  it("hears another tab write this profile's save of this game, under the game's own key, and nothing else", () => {
    const masami = addProfile('Masami', avatar)
    const pia = addProfile('Pia', avatar)
    const heard: [string | null, string | null][] = []
    const unwatch = profileSaves(masami.id, 'rocket-factory').watch((key, value) => void heard.push([key, value]))
    const write = (key: string | null, newValue: string | null) => window.dispatchEvent(Object.assign(new Event('storage'), { storageArea: localStorage, key, newValue }))
    write(`profile/${masami.id}/rocket-factory/rocket-factory-2`, 'newer')
    write(`profile/${pia.id}/rocket-factory/rocket-factory-2`, 'hers')
    write(`profile/${masami.id}/castle-builder/castle-builder`, 'a castle')
    write(null, null)
    unwatch()
    write(`profile/${masami.id}/rocket-factory/rocket-factory-2`, 'unheard')
    expect(heard).toEqual([
      ['rocket-factory-2', 'newer'],
      [null, null],
    ])
  })
})

describe('the avatar', () => {
  it('reads every part it knows and falls back to the first choice for the rest', () => {
    expect(parseAvatar({ hair: 'bun', extra: 'crown', eyes: 7 })).toEqual({ ...parseAvatar(null), hair: 'bun', extra: 'crown' })
    expect(Object.values(parseAvatar(null))).toEqual(PART_NAMES.map((part) => PARTS[part][0]))
  })

  it('makes a surprise of real choices for every part', () => {
    let n = 0
    const surprise = randomAvatar(() => ((n += 0.37) % 1))
    for (const part of PART_NAMES) expect(PARTS[part] as readonly string[]).toContain(surprise[part])
    expect(randomAvatar(() => 0.999)).toEqual(Object.fromEntries(PART_NAMES.map((part) => [part, PARTS[part].at(-1)])))
  })
})

describe('the gallery', () => {
  it('has a card for every game that keeps saves, and builds each of them', () => {
    const page = fs.readFileSync('index.html', 'utf8')
    const config = fs.readFileSync('vite.config.ts', 'utf8')
    for (const game of SAVING_GAMES) {
      expect(page, game).toContain(`href="${game}/index.html"`)
      expect(config, game).toContain(`'${game}'`)
      expect(fs.readFileSync(`${game}/src/main.tsx`, 'utf8'), game).toContain(`enterGame('${game}')`)
    }
  })

  it("leaves the browser's storage to the profiles: a game keeps what it keeps through its saves", () => {
    const games = fs.readdirSync('.', { withFileTypes: true }).filter((d) => d.isDirectory() && d.name !== 'profiles' && fs.existsSync(`${d.name}/src/main.tsx`))
    expect(games.length).toBeGreaterThan(10)
    for (const game of games) {
      for (const file of fs.readdirSync(`${game.name}/src`, { recursive: true, encoding: 'utf8' })) {
        if (!/\.tsx?$/.test(file) || /\.test\.ts$/.test(file)) continue
        const code = fs.readFileSync(`${game.name}/src/${file}`, 'utf8')
        expect(code, `${game.name}/src/${file}`).not.toMatch(/\b(localStorage|sessionStorage)\s*\./)
      }
    }
  })
})
