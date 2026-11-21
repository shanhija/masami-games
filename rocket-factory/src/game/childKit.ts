import { vi } from 'vitest'

import type { Saves } from '../../../profiles/src/profiles'
import { startView } from './camera'
import type { Child, Finger, Kid, Screen } from './child'
import { Game } from './game'
import type { View } from './layout'
import type { SimEvent } from './model'

/**
 * The page for the tests that play scripted children on a real Game (child.test.ts,
 * fingers.test.ts): the view the stage draws at a screen, a page opened on given saves, and a
 * frame as the page runs one. Never used by the game itself.
 */

/** The view the stage draws for the game's frame at screen sc on a touch screen, handed to the game (Stage.tsx). */
export function stage(g: Game, sc: Screen): View {
  const v = startView(sc.w, sc.h, 2, true, sc.safe)
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

/** A page opened at a screen on `saves`, with its first view drawn. Its document has no full screen to ask for, as a page in a frame has none: the Play and Keep going of a touch screen ask for none. */
export function open(search: string, seed: number, sc: Screen, saves: Saves): Game {
  vi.stubGlobal('document', { fullscreenEnabled: false, fullscreenElement: null })
  const g = new Game(search, seed, saves, 'en')
  stage(g, sc)
  return g
}

/** The careful eager child with this finger at a screen: no thumb, not frantic, no bedtime. */
export const carefulAt = (sc: Screen, finger: Finger): Kid => ({ play: { pace: 'eager', behaviour: 'careful' }, finger, mm: () => sc.mm, thumb: null, frantic: false, bedtime: Infinity })
