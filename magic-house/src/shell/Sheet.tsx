/**
 * The shell's developer sheet (?sheet=shell): the whole game, who plays to the house to a room and
 * back, on the hop room (testing.ts) for every party size in place of the house's own doors, so
 * the page can be played whatever the house holds. The library's kept rooms stand beside them, but
 * the sheet has no line: it never asks for a room, so playing it spends no design.
 * ?room=test:hop2&seats=keys0,keys2 opens a room at once here too, and ?debug gives the dev handle.
 * Flower Bridge (own/rooms/flower-bridge.ts), the own room seen from high up, stands here beside
 * the hop room for two (?room=own:flower-bridge&seats=keys0,keys1 opens it at once).
 * The device's players sit down with their faces and languages, but on saves in memory: playing the
 * sheet never moves a child's level or writes a result into their saves.
 */

import { useState } from 'react'

import type { Lang } from '../../../profiles/src/lang'
import { enterGame, memorySaves } from '../../../profiles/src/profiles'
import { houseLink } from '../library/source'
import { OWN_ROOMS } from '../own/rooms'
import { devicePlayers } from '../saves'
import { Game } from './Game'
import { handDoor, type HouseRoom } from './play'
import { HOP_ROOMS } from './testing'

/** Flower Bridge as the house has it, with its look. */
const FLOWER_BRIDGE = OWN_ROOMS.find((r) => r.id === 'own:flower-bridge')
if (FLOWER_BRIDGE === undefined) throw new Error('the own rooms have no Flower Bridge')
const ROOMS: readonly HouseRoom[] = [...HOP_ROOMS, handDoor(FLOWER_BRIDGE)]

export function Sheet({ lang }: { lang: Lang }) {
  const [players] = useState(() => devicePlayers(enterGame('magic-house')!).map((p) => ({ ...p, saves: memorySaves() })))
  const [link] = useState(() => ({ api: null, source: houseLink().source }))
  return <Game lang={lang} players={players} own={ROOMS} link={link} />
}
