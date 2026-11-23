import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { inLang, type Lang } from '../../../profiles/src/lang'
import { HOUSE_SOUNDS, type HouseSound } from '../engine/sounds'
import { SOUNDS_PAGE, WHO } from '../words'
import { HouseSounds } from './houseSounds'
import './SoundsPage.css'

/**
 * The ?sounds page (plan.md, Sounds in two steps): every sound a room or the engine can play, by the
 * name rooms call it by, each played by a tap, so a parent hears them all before the children do.
 * A sound with a recording built is marked; where none are built the page says so and every name
 * plays its synthesised sound, as the game would. Play! goes to the game. Every button shows whole
 * on every screen: the labels take the largest size at which the whole grid fits above Play!.
 */
/** The sizes a sound's label may take, px: the grid scrolls only on a screen too small for the least. */
const SOUND_FONT = { least: 12, most: 30 } as const

export function SoundsPage({ lang }: { lang: Lang }) {
  const [sounds] = useState(() => new HouseSounds())
  const [library, setLibrary] = useState<'loading' | readonly HouseSound[] | null>('loading')
  useEffect(() => {
    void sounds.library.then((lib) => setLibrary(lib === null ? null : (Object.keys(lib) as HouseSound[])))
  }, [sounds])

  const grid = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = grid.current as HTMLDivElement
    // Halving between the least and the most, to the half pixel; the grid's height is the page's room left, whatever is in it.
    const fit = () => {
      let lo: number = SOUND_FONT.least
      let hi: number = SOUND_FONT.most
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2
        el.style.setProperty('--sound-font', `${mid}px`)
        if (el.scrollHeight <= el.clientHeight) lo = mid
        else hi = mid
      }
      el.style.setProperty('--sound-font', `${lo}px`)
    }
    fit()
    const resized = new ResizeObserver(fit)
    resized.observe(el)
    return () => resized.disconnect()
  }, [library])

  const play = async (name: HouseSound) => {
    sounds.unlock()
    await sounds.decoded
    sounds.play(name)
  }

  return (
    <div className="mh-page sounds-page">
      <h1>{inLang(SOUNDS_PAGE.title, lang)}</h1>
      <p>{inLang(SOUNDS_PAGE.tap, lang)}</p>
      {library === null && <p className="sounds-note">{inLang(SOUNDS_PAGE.noRecordings, lang)}</p>}
      <div className="sounds-grid" ref={grid}>
        {HOUSE_SOUNDS.map((name) => (
          <button key={name} type="button" className="small-button sound-button" data-sound={name} onClick={() => void play(name)}>
            {name}
            {library !== 'loading' && library !== null && library.includes(name) && <span className="sound-mark">{inLang(SOUNDS_PAGE.recorded, lang)}</span>}
          </button>
        ))}
      </div>
      <a className="big-button sounds-play" href={location.pathname}>
        {inLang(WHO.go, lang)}
      </a>
    </div>
  )
}
