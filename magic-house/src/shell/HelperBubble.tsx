import './HelperBubble.css'

import { useEffect } from 'react'

import { inLang, type Lang } from '../../../profiles/src/lang'
import type { Sounds } from '../../../silly-billy/src/sounds'
import type { World } from '../engine/world'
import { LANTERN } from '../scene/Lantern'
import { screenOf, type ShownView } from '../scene/RoomStage'
import { say } from './speech'

/** How long the helper's hint stays up after it is said, seconds of the game's clock: as long as its lantern hops while it talks. */
export const HINT_SECS = LANTERN.talkSecs

/** How the bubble keeps to the screen: pixels from the lantern's middle to the bubble's near edge, and from the screen's edges. */
const BUBBLE = { off: 34, edge: 12 } as const

/**
 * The helper's words (plan.md, Help, and how hard): the step's hint in a speech bubble beside the
 * lantern (scene/Lantern.tsx), on the side of it with more screen, and said aloud in the page's
 * language (shell/speech.ts; quiet while the sound is off), for HINT_SECS after the sim says it:
 * when the ? is pressed, or once the room has been quiet long (engine/world.ts HELPER). Before the
 * stage has drawn a frame the bubble waits under the step dots. Drawn again every screen frame with
 * the HUD, so it follows the lantern as it flies.
 */
export function HelperBubble({ world, lang, shown, sounds, clearTop, clearBottom }: { world: World; lang: Lang; shown: ShownView; sounds: Sounds; clearTop: number; clearBottom: number }) {
  const { says, saidAt, at } = world.helper
  const text = says === null ? null : inLang(says, lang)
  useEffect(() => {
    if (text !== null && !sounds.muted) say(text, lang)
  }, [saidAt, text, lang, sounds])
  if (text === null || world.t - saidAt > HINT_SECS) return null
  const spot = screenOf(shown, at)
  if (spot === null)
    return (
      <div className="helper-bubble under-dots" role="status">
        {text}
      </div>
    )
  const [x, y] = spot
  const right = x < window.innerWidth / 2
  const top = Math.max(clearTop + BUBBLE.edge, Math.min(window.innerHeight - clearBottom - BUBBLE.edge, y))
  const style = right ? { left: Math.max(BUBBLE.edge, x + BUBBLE.off), top } : { right: Math.max(BUBBLE.edge, window.innerWidth - x + BUBBLE.off), top }
  return (
    <div className={`helper-bubble ${right ? 'to-right' : 'to-left'}`} style={style} role="status">
      {text}
    </div>
  )
}
