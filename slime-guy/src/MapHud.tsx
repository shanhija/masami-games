import './map.css'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { COLOUR_IDS, PATTERNS, SLIME_COLOURS, type Pattern } from './game/closet'
import { HOP_FOR, useGameView, type Game } from './game/game'
import { lerp, smoothstep } from './game/math'
import { COURSE_IDS, COURSE_NAMES } from './game/model'
import { JAR_SIZE, isOpen } from './game/progress'
import { GamesGlyph, SoundGlyph } from './Hud'
import { ArrowIcon, JarIcon, PatternIcon, SlimeIcon, WardrobeIcon } from './Icons'
import { TapButton, cls } from './TapButton'
import { wardrobeNews } from './Wardrobe'

const TITLE = 'Slime Guy'

/**
 * The jar's pour, in seconds: it waits for the slime's hop to land, fills over LEG (to the
 * brim first when it filled up on the way, holding there for FULL while a new pattern pops
 * in, then from empty to what it holds now over another LEG).
 */
const POUR_WAIT = HOP_FOR + 0.3
const LEG = 0.9
const FULL = 0.35

/** A pour from what the map last showed to the save's jar; `start` in performance.now() seconds. */
interface Pour {
  start: number
  from: number
  to: number
  /** It filled up on the way: a new pattern opened, or all were open and it spilled into fireworks. */
  wrap: boolean
  /** The patterns open before, and the ones that pop in at the brim. */
  before: readonly Pattern[]
  fresh: readonly Pattern[]
}

/** What the jar shows now: how full it is, the patterns open, the ones popping in, and whether it is at the brim. */
interface JarView {
  fill: number
  patterns: readonly Pattern[]
  fresh: readonly Pattern[]
  full: boolean
}

/**
 * The jar as the map shows it. The stars of a run land in the save during the run, out of
 * sight; when the map comes back the jar starts from what it showed last and pours up to
 * what it holds now, through a full jar when it filled up. The pour is only a picture:
 * leaving the map ends it and it never plays twice.
 */
function useJar(game: Game, open: boolean): JarView {
  const { jar, patterns } = game.save
  const shown = useRef({ jar, patterns })
  const [pour, setPour] = useState<Pour | null>(null)
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!open) {
      setPour(null)
      return
    }
    const was = shown.current
    shown.current = { jar, patterns }
    // Patterns only ever open, so what is new says whether anything changed.
    const fresh = patterns.filter((p) => !was.patterns.includes(p))
    if (was.jar === jar && fresh.length === 0) return
    setPour({ start: performance.now() / 1000 + POUR_WAIT, from: was.jar / JAR_SIZE, to: jar / JAR_SIZE, wrap: fresh.length > 0 || jar < was.jar, before: was.patterns, fresh })
  }, [open, jar, patterns])

  useEffect(() => {
    if (pour === null) return
    const end = pour.start + (pour.wrap ? 2 * LEG + FULL : LEG)
    let stage = 0
    let raf = 0
    const frame = (ms: number) => {
      const t = ms / 1000
      if (stage === 0 && t >= pour.start) {
        stage = 1
        game.audio.play('jar')
      }
      if (stage === 1 && pour.wrap && t >= pour.start + LEG) {
        stage = 2
        game.audio.play(pour.fresh.length > 0 ? 'pattern' : 'fireworks')
      }
      setNow(t)
      if (t < end) raf = requestAnimationFrame(frame)
      else setPour(null)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [game, pour])

  if (pour === null) return { fill: shown.current.jar / JAR_SIZE, patterns: shown.current.patterns, fresh: [], full: false }
  const t = Math.max(0, now - pour.start)
  if (!pour.wrap) return { fill: lerp(pour.from, pour.to, smoothstep(0, LEG, t)), patterns: pour.before, fresh: [], full: false }
  if (t < LEG) return { fill: lerp(pour.from, 1, smoothstep(0, LEG, t)), patterns: pour.before, fresh: [], full: false }
  const after = [...pour.before, ...pour.fresh]
  if (t < LEG + FULL) return { fill: 1, patterns: after, fresh: pour.fresh, full: true }
  return { fill: lerp(0, pour.to, smoothstep(LEG + FULL, 2 * LEG + FULL, t)), patterns: after, fresh: pour.fresh, full: false }
}

/** The jar's little dance when tapped. */
function jiggle(el: HTMLElement) {
  el.animate(
    [
      { rotate: '0deg', scale: '1' },
      { rotate: '-8deg', scale: '1.08' },
      { rotate: '7deg', scale: '1.04' },
      { rotate: '-4deg', scale: '1.02' },
      { rotate: '0deg', scale: '1' },
    ],
    { duration: 520, easing: 'ease-out' },
  )
}

/**
 * The map's words and buttons over the islands: the game's name small at the top, sound and
 * More games top right, an arrow at each side while there is an open island that way, the
 * big Go! under the chosen island's name, the wardrobe bottom left (with a gold dot while
 * something new waits in it) and the star jar bottom right with the patterns it has opened
 * as little swatches. The Go! button is the slime's own jelly colour.
 */
export function MapHud({ game }: { game: Game }) {
  useGameView(game)
  const open = game.screen === 'map'
  const jar = useJar(game, open)
  const news = wardrobeNews(game)
  if (!open) return null

  const index = game.index
  const course = COURSE_IDS[index]
  const muted = game.audio.muted
  const look = game.getLook()
  const jelly = SLIME_COLOURS[look.colour]
  /** Whether there is an open island that way: the arrows show only then, and skip locked ones as stepIsland does. */
  const canStep = (dir: -1 | 1) => {
    for (let i = index + dir; i >= 0 && i < COURSE_IDS.length; i += dir) if (isOpen(game.save, i)) return true
    return false
  }
  return (
    <div className="map-hud" style={{ '--jelly': jelly.body, '--jelly-deep': jelly.deep, '--jelly-light': jelly.light } as CSSProperties}>
      <h1 className="map-title" aria-label={TITLE}>
        {[...TITLE].map((c, i) => (
          <span key={i} style={{ color: SLIME_COLOURS[COLOUR_IDS[i % COLOUR_IDS.length]].body, animationDelay: `${(i * 0.07).toFixed(2)}s` }}>
            {c === ' ' ? '\u00a0' : c}
          </span>
        ))}
      </h1>

      <div className="map-corner">
        <TapButton game={game} className="map-round" label={muted ? 'Sound off' : 'Sound on'} sound={null} onTap={() => game.toggleMute()}>
          <SoundGlyph on={!muted} />
        </TapButton>
        <TapButton game={game} className="map-round" label="More games" sound="tap" onTap={() => location.assign('../index.html')}>
          <GamesGlyph />
        </TapButton>
      </div>

      {([-1, 1] as const).map(
        (dir) =>
          canStep(dir) && (
            <TapButton key={dir} game={game} className={cls('map-step', dir < 0 ? 'left' : 'right')} label={dir < 0 ? 'Island before' : 'Next island'} sound={null} onTap={() => game.stepIsland(dir)}>
              <ArrowIcon dir={dir} size={80} />
            </TapButton>
          ),
      )}

      <div className="map-bottom">
        <TapButton game={game} className={cls('map-ward', news.things.length + news.patterns.length > 0 && 'news')} label="Wardrobe" sound={null} onTap={() => game.openWardrobe()}>
          <WardrobeIcon size={96} />
        </TapButton>
        <div className="map-play">
          {/* Keyed by the island, so a new name pops in as the slime hops there. */}
          <div className="map-name" key={course}>
            {COURSE_NAMES[course]}
          </div>
          <TapButton game={game} className="map-go" label={`Go to ${COURSE_NAMES[course]}`} sound={null} onTap={() => game.play()}>
            <SlimeIcon colour={look.colour} pattern={look.pattern} size={80} pose="jump" />
            <span>Go!</span>
          </TapButton>
        </div>
        <TapButton game={game} className={cls('map-jar', jar.full && 'full')} label="Star jar" sound="jar" onTap={jiggle}>
          <JarIcon size={96} fill={jar.fill} />
          <span className="map-patterns">
            {PATTERNS.map((p) => (
              <span key={p} className={cls('map-pattern', jar.fresh.includes(p) && 'new')}>
                <PatternIcon pattern={p} size={24} locked={!jar.patterns.includes(p)} />
              </span>
            ))}
          </span>
        </TapButton>
      </div>
    </div>
  )
}
