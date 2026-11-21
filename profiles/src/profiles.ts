import { parseAvatar, type Avatar } from './avatar'

/**
 * The children who play on this device, and each game's saves kept apart per child. The
 * gallery (the root page) asks who is playing, makes and edits the profiles and clears a
 * game for one of them; a game page asks `enterGame` for the saves of the profile playing in
 * its tab before it starts.
 *
 * Everything lives in the browser's localStorage: the profiles under PROFILES_KEY, the one
 * last picked on this device under PICKED_KEY, and a game's own keys under
 * `profile/<id>/<game>/<key>`, so a game never reads another child's save and one game of one
 * child clears without touching the rest. sessionStorage holds the pick of this tab under
 * PICKED_KEY too, so two tabs can play as two children. Silly Billy's library lives on the
 * dev server and is everyone's; only what its page keeps in the browser is per profile.
 */

/** The games that keep saves, by folder, in the gallery's order. Police Chase and Foot Chase keep nothing. */
export const SAVING_GAMES = ['castle-builder', 'pia-jump', 'cat-hat-builder', 'rocket-factory', 'super-me', 'slime-guy', 'monster-lunch', 'digger-town', 'silly-billy'] as const
export type SavingGame = (typeof SAVING_GAMES)[number]

/** One child on this device: the name and the avatar they made. */
export interface Profile {
  id: string
  name: string
  avatar: Avatar
}

/** What a game reads and writes its saves through: the browser's storage under one profile's keys, or a stand-in in tests. */
export interface Saves {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

/** A game's saves as its page gets them: Saves, and news of another tab changing them. */
export interface GameSaves extends Saves {
  /** Calls `heard` with the game's own key whenever another tab changes this profile's save of this game (a null key: the whole storage was cleared); returns the unsubscribe. */
  watch(heard: (key: string | null, value: string | null) => void): () => void
}

/** The longest name the editor takes: it has to fit under an avatar on a phone. */
export const NAME_MOST = 14

const PROFILES_KEY = 'masami-profiles'
const PICKED_KEY = 'masami-profile'

const profileScope = (id: string) => `profile/${id}/`
const gameScope = (id: string, game: SavingGame) => `profile/${id}/${game}/`

/**
 * The keys each game kept its saves under before there were profiles, each with the key it
 * has under a profile. The first profile made on a device takes them over, so a child's
 * castle, factory and town stay theirs. Only these keys: a game's later keys are under a
 * profile from the start.
 */
const SAVES_BEFORE_PROFILES: Record<SavingGame, Readonly<Record<string, string>>> = {
  'castle-builder': { 'castle-builder': 'castle-builder' },
  'pia-jump': { 'pia-jump': 'pia-jump' },
  'cat-hat-builder': { 'rakennustyömaat': 'cat-hat-builder' },
  'rocket-factory': { 'rocket-factory-2': 'rocket-factory-2', 'rocket-factory-2-old': 'rocket-factory-2-old' },
  'super-me': { 'super-me': 'super-me' },
  'slime-guy': { 'slime-guy': 'slime-guy' },
  'monster-lunch': { ruokapeli: 'monster-lunch' },
  'digger-town': { 'digger-town': 'digger-town', 'digger-town-old': 'digger-town-old', 'digger-town-broken': 'digger-town-broken' },
  'silly-billy': { 'silly-billy-rooms-1': 'silly-billy-rooms-1', 'silly-billy-settings': 'silly-billy-settings' },
}

/**
 * The games whose folders had Finnish names until 2026-11-21, by their old folder: the game
 * now, and the keys inside that were renamed with it. `moveRenamedGames` moves a profile's
 * saves of these to the new folder, so nobody loses a house or a lunch. It can go once every
 * device has opened a page since (plans/finnish-and-english.md, Open).
 */
const RENAMED_GAMES: Readonly<Record<string, { game: SavingGame; keys: Readonly<Record<string, string>> }>> = {
  'rakennustyömaat': { game: 'cat-hat-builder', keys: { 'rakennustyömaat': 'cat-hat-builder' } },
  marienpeli: { game: 'super-me', keys: {} },
  limaukkopeli: { game: 'slime-guy', keys: {} },
  ruokapeli: { game: 'monster-lunch', keys: { ruokapeli: 'monster-lunch' } },
  rakennuspeli: { game: 'digger-town', keys: {} },
}

/** Moves every save kept under a game's old Finnish folder name (`RENAMED_GAMES`) to its new one. A key already at the new place is kept and the old one dropped. */
function moveRenamedGames(): void {
  for (const key of keysUnder('profile/')) {
    const [, id, folder, ...rest] = key.split('/')
    const renamed = RENAMED_GAMES[folder!]
    if (renamed === undefined) continue
    const inner = rest.join('/')
    const to = gameScope(id!, renamed.game) + (renamed.keys[inner] ?? inner)
    if (localStorage.getItem(to) === null) localStorage.setItem(to, localStorage.getItem(key)!)
    localStorage.removeItem(key)
  }
}

/** Every profile on this device, in the order they were made. A stored entry that is not a profile is left out, with a warning. Saves under a game's old folder name move to its new one first. */
export function loadProfiles(): Profile[] {
  moveRenamedGames()
  const text = localStorage.getItem(PROFILES_KEY)
  if (text === null) return []
  let stored: unknown
  try {
    stored = JSON.parse(text)
  } catch (e) {
    console.warn('The profiles cannot be read:', e)
    return []
  }
  if (!Array.isArray(stored)) {
    console.warn('The profiles are not a list:', text)
    return []
  }
  const profiles: Profile[] = []
  for (const entry of stored) {
    const e = entry as Record<string, unknown>
    if (typeof e === 'object' && e !== null && typeof e.id === 'string' && typeof e.name === 'string') profiles.push({ id: e.id, name: e.name, avatar: parseAvatar(e.avatar) })
    else console.warn('A profile cannot be read:', entry)
  }
  return profiles
}

function storeProfiles(profiles: Profile[]): void {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

/** Every key of localStorage that starts with `scope`. */
function keysUnder(scope: string): string[] {
  const keys: string[] = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key !== null && key.startsWith(scope)) keys.push(key)
  }
  return keys
}

/** Makes a profile. The first one on the device takes over the saves made before there were profiles. */
export function addProfile(name: string, avatar: Avatar): Profile {
  const profiles = loadProfiles()
  const profile: Profile = { id: crypto.randomUUID().slice(0, 8), name, avatar }
  if (profiles.length === 0) {
    for (const game of SAVING_GAMES) {
      for (const [key, to] of Object.entries(SAVES_BEFORE_PROFILES[game])) {
        const text = localStorage.getItem(key)
        if (text === null) continue
        localStorage.setItem(gameScope(profile.id, game) + to, text)
        localStorage.removeItem(key)
      }
    }
  }
  storeProfiles([...profiles, profile])
  return profile
}

/** Stores a profile's new name or avatar. */
export function updateProfile(profile: Profile): void {
  const profiles = loadProfiles()
  const at = profiles.findIndex((p) => p.id === profile.id)
  if (at < 0) throw new Error(`updateProfile: there is no profile ${profile.id}`)
  profiles[at] = profile
  storeProfiles(profiles)
}

/** Removes a profile and every save of every game it had. */
export function removeProfile(id: string): void {
  storeProfiles(loadProfiles().filter((p) => p.id !== id))
  for (const key of keysUnder(profileScope(id))) localStorage.removeItem(key)
  if (sessionStorage.getItem(PICKED_KEY) === id) sessionStorage.removeItem(PICKED_KEY)
  if (localStorage.getItem(PICKED_KEY) === id) localStorage.removeItem(PICKED_KEY)
}

/** The profile playing in this tab: the one picked here, or else the one last picked on this device; null when there is none or it was removed. */
export function pickedProfile(): Profile | null {
  const id = sessionStorage.getItem(PICKED_KEY) ?? localStorage.getItem(PICKED_KEY)
  return loadProfiles().find((p) => p.id === id) ?? null
}

/** Whether someone was picked in this tab: a fresh tab of the gallery asks who is playing, a tab back from a game does not. */
export function pickedHere(): boolean {
  const id = sessionStorage.getItem(PICKED_KEY)
  return id !== null && loadProfiles().some((p) => p.id === id)
}

/** Profile `id` plays in this tab, and is the one a game opened in a fresh tab plays as. */
export function pickProfile(id: string): void {
  sessionStorage.setItem(PICKED_KEY, id)
  localStorage.setItem(PICKED_KEY, id)
}

/** The games profile `id` has something saved in, in the gallery's order. */
export function savedGames(id: string): SavingGame[] {
  const keys = keysUnder(profileScope(id))
  return SAVING_GAMES.filter((game) => keys.some((key) => key.startsWith(gameScope(id, game))))
}

/** Forgets everything `game` keeps for profile `id`, so that child starts the game over. */
export function clearGame(id: string, game: SavingGame): void {
  for (const key of keysUnder(gameScope(id, game))) localStorage.removeItem(key)
}

/** Saves kept in memory only, `items`: what a game plays on in a browser that keeps no site data, and in its tests. No other tab can change them. */
export function memorySaves(): GameSaves & { items: Map<string, string> } {
  const items = new Map<string, string>()
  return { items, getItem: (key) => items.get(key) ?? null, setItem: (key, value) => void items.set(key, value), removeItem: (key) => void items.delete(key), watch: () => () => {} }
}

/** The saves of `game` for profile `id`: localStorage under that profile's keys for that game. */
export function profileSaves(id: string, game: SavingGame): GameSaves {
  const scope = gameScope(id, game)
  return {
    getItem: (key) => localStorage.getItem(scope + key),
    setItem: (key, value) => localStorage.setItem(scope + key, value),
    removeItem: (key) => localStorage.removeItem(scope + key),
    watch: (heard) => {
      const listener = (e: StorageEvent) => {
        if (e.storageArea !== localStorage) return
        if (e.key === null) heard(null, null)
        else if (e.key.startsWith(scope)) heard(e.key.slice(scope.length), e.newValue)
      }
      window.addEventListener('storage', listener)
      return () => window.removeEventListener('storage', listener)
    },
  }
}

/**
 * What a game page calls before it starts: the saves of the profile playing in its tab, which
 * then stays this tab's pick. With nobody picked it sends the page to the gallery to pick
 * someone and returns null, so a game never starts on nobody's saves. A browser that keeps no
 * site data at all has no profiles either: there the game plays on saves kept in memory only.
 */
export function enterGame(game: SavingGame): GameSaves | null {
  let profile: Profile | null
  try {
    profile = pickedProfile()
  } catch (e) {
    console.warn('This browser keeps no site data, so this visit is not remembered:', e)
    return memorySaves()
  }
  if (profile === null) {
    location.replace('../index.html')
    return null
  }
  pickProfile(profile.id)
  return profileSaves(profile.id, game)
}
