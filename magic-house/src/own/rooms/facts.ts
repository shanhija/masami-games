/**
 * What each of the game's own rooms says about itself, beside its code and its walkthrough: what a
 * kept room's file says (protocol.ts RoomFile), less what only a made room has.
 */

import type { Words } from '../../../../profiles/src/lang'
import type { Shell } from '../../engine/api'
import type { RoomKind, RoomView } from '../../engine/world'
import type { PartySize } from '../../seats/types'

export interface OwnFacts {
  /** `own:<name>`, so a result never meets a library id (saves.ts RoomResult.room). */
  readonly id: `own:${string}`
  /** The party size it is made for: the house offers it only to a party of this size. */
  readonly party: PartySize
  /** The seed it always plays on. */
  readonly seed: number
  /** Played together, as every own room is; a room for one plays together with itself. Always on one screen. */
  readonly kind: RoomKind
  /** How it is seen: from the side, or from high up (Flower Bridge). */
  readonly view: RoomView
  /** A few words for its theme and a line for what the players do, as a made room's answer gives them. */
  readonly theme: string
  readonly task: string
  readonly name: Words
  /** The shell the house draws round it, as a made room's answer gives one (engine/api.ts Shell). */
  readonly shell: Shell
}
