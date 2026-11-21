import { useState } from 'react'

import { inLang, type Lang } from '../../profiles/src/lang'
import { Btn } from './Btn'
import { roomTray } from './game/camera'
import type { Game } from './game/game'
import type { HudView } from './game/hud'
import { themeItems } from './game/items'
import type { Theme } from './game/model'
import { THEME_ART } from './draw/rooms/art'
import { PotIcon, SwapIcon, TickIcon } from './Icons'
import { FloorPic, ItemPic, ThemePic } from './Pictures'
import { ITEM_NAMES, THEME_NAMES, WORDS } from './words'

/** The pictures on the big "Which room?" button of a room with no theme yet. */
const PICK_PICTURES = 3


/**
 * The room view's tray along the bottom. A room with no theme yet has one big button there,
 * with a few rooms on it, that asks "Which room?" (so nothing in the tray waits on a theme).
 * Otherwise the top row: the items of the theme shown (the room's own at first), each with a
 * tick while it is in the room (a tap puts it in or takes it out); the two paint pots for the
 * wallpaper and the floor; and the button that asks "Which room?" again. The bottom row:
 * every open theme's picture, the room's own first; a tap shows that theme's items above.
 * The rows fit the window as camera.roomTray lays them out: the top one in two lines where
 * one is too narrow, the bottom one in two rows on an upright window that holds them and
 * otherwise scrolling, and none on a short window ("Another room" offers every theme).
 * Keyed by the room and its theme, so a new room or a newly chosen theme starts on its own items.
 */
export function RoomTray({ game, view, screen, lang }: { game: Game; view: NonNullable<HudView['room']>; screen: { w: number; h: number }; lang: Lang }) {
  const [picked, setPicked] = useState<Theme | null>(null)
  if (view.pick) {
    return (
      <div className="tray room">
        <Btn className="pick" label={inLang(WORDS.whichRoom, lang)} onTap={() => game.dispatch({ kind: 'askTheme' })}>
          {view.themes.slice(0, PICK_PICTURES).map((t) => (
            <ThemePic key={t} theme={t} variant={0} className="pic" />
          ))}
        </Btn>
      </div>
    )
  }
  const theme = view.theme!
  const shown = picked ?? theme
  const strip = [theme, ...view.themes.filter((t) => t !== theme)]
  const tray = roomTray(screen.w, screen.h, strip.length)
  return (
    <div className="tray room">
      <div className={`row things${tray.things === 2 ? ' two' : ''}`}>
        {themeItems(shown).map((item) => (
          <Btn key={item} className="item" label={inLang(ITEM_NAMES[item], lang)} onTap={() => game.dispatch({ kind: 'item', item })}>
            <ItemPic item={item} className="pic" />
            {view.inRoom.includes(item) && (
              <span className="tick">
                <TickIcon />
              </span>
            )}
          </Btn>
        ))}
        <Btn className="pot" label={inLang(WORDS.paintWall, lang)} onTap={() => game.dispatch({ kind: 'paint', what: 'wall' })}>
          <PotIcon paint={THEME_ART[theme].swatches[view.wall]} />
        </Btn>
        <Btn className="pot floor" label={inLang(WORDS.paintFloor, lang)} onTap={() => game.dispatch({ kind: 'paint', what: 'floor' })}>
          <FloorPic theme={theme} variant={view.floor} className="paint" />
          <PotIcon paint={null} />
        </Btn>
        <Btn className="swap" label={inLang(WORDS.anotherRoom, lang)} onTap={() => game.dispatch({ kind: 'askTheme' })}>
          <SwapIcon />
        </Btn>
      </div>
      {tray.themes > 0 && (
        <div className={`row themes${tray.themes === 2 ? ' two' : ''}`} style={tray.strip === null ? undefined : { maxWidth: tray.strip }}>
          {strip.map((t) => (
            <Btn key={t} className={`theme${t === shown ? ' on' : ''}`} label={inLang(THEME_NAMES[t], lang)} onTap={() => {
                game.audio.ui('pick')
                setPicked(t)
              }}>
              <ThemePic theme={t} variant={0} className="pic" />
            </Btn>
          ))}
        </div>
      )}
    </div>
  )
}
