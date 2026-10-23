import { vi } from 'vitest'

import { viewAt } from './camera'
import type { Child, Finger, Kid, Screen } from './child'
import { Game } from './game'
import type { View } from './layout'
import type { SimEvent } from './model'

/**
 * The page for the tests that play scripted children on a real Game (child.test.ts,
 * fingers.test.ts): an in-memory localStorage, the view the stage draws at a screen, and a
 * frame as the page runs one. Never used by the game itself.
 */

/** An in-memory stand-in for the browser's localStorage, in place until vi.unstubAllGlobals: its items. */
export function memoryStorage(): Map<string, string> {
  const items = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => void items.set(key, value) })
  return items
}

/** The view the stage draws for the game's frame at screen sc on a touch screen, handed to the game (Stage.tsx). */
export function stage(g: Game, sc: Screen): View {
  const v = viewAt(g.state, g.frameTime, sc.w, sc.h, 2, true, sc.safe)
  g.setView(v)
  return v
}

/** One frame of the page: the game advances `dt` seconds, the child plays against the view drawn last (as ?autoplay does, after the steps), and the stage draws the next view. Returns that frame's events. */
export function frame(g: Game, sc: Screen, child: Child | null, dt: number): SimEvent[] {
  const events = [...g.advance(dt).events]
  if (child !== null) child.frame(g)
  stage(g, sc)
  return events
}

/** A page opened at a screen with its first view drawn. Its document has no full screen to ask for, as a page in a frame has none: the Play and Keep going of a touch screen ask for none. */
export function open(search: string, seed: number, sc: Screen): Game {
  vi.stubGlobal('document', { fullscreenEnabled: false, fullscreenElement: null })
  const g = new Game(search, seed)
  stage(g, sc)
  return g
}

/** The careful eager child with this finger at a screen: no thumb, not frantic, no bedtime. */
export const carefulAt = (sc: Screen, finger: Finger): Kid => ({ play: { pace: 'eager', behaviour: 'careful' }, finger, mm: () => sc.mm, thumb: null, frantic: false, bedtime: Infinity })
