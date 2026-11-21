import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { inLang, type Lang, type Words } from '../../profiles/src/lang'
import type { ItemId, SlimeLook } from './game/closet'
import { DONE_CALM, toggleFullscreen, useGameView, useLook, type Game } from './game/game'
import { clamp, clamp01, mulberry32 } from './game/math'
import type { Sim } from './game/model'
import { progress } from './game/sim'
import { AnimalIcon, ArrowIcon, BabyIcon, FlagIcon, ItemIcon, KeyIcon, SlimeIcon, StarIcon } from './Icons'
import { THEMES, palette } from './scene/look'
import { COURSE_WORDS, ITEM_WORDS, WORDS } from './words'

/** What the done card says about the gift: the thing's own name, in a few words, or a cheer when the box had nothing new. */
const giftWords = (gift: ItemId | null): Words => (gift !== null ? ITEM_WORDS[gift].gift : WORDS.hooray)

/** Confetti for a box with nothing new left in it, and fireworks for a full jar once every pattern is open: laid out once, the same every time. */
const CONFETTI = (() => {
  const r = mulberry32(11)
  return Array.from({ length: 30 }, (_, i) => ({
    left: r() * 100,
    delay: -r() * 3,
    fall: 2.4 + r() * 1.6,
    spin: (r() < 0.5 ? -1 : 1) * (360 + r() * 540),
    drift: (r() - 0.5) * 120,
    w: 9 + r() * 7,
    h: 14 + r() * 9,
    colour: palette.confetti[i % palette.confetti.length]!,
  }))
})()
const BURSTS = [
  { x: 22, y: 30, delay: 0, colour: palette.confetti[0] },
  { x: 78, y: 26, delay: 0.5, colour: palette.confetti[1] },
  { x: 50, y: 16, delay: 1, colour: palette.confetti[2] },
  { x: 32, y: 52, delay: 1.4, colour: palette.confetti[4] },
  { x: 70, y: 48, delay: 0.8, colour: palette.confetti[3] },
]
const RAYS = Array.from({ length: 12 }, (_, i) => i * 30)
const POSES = ['stand', 'hide', 'jump'] as const
/** The sparkles around the gift: where (a share of the halo, from its centre), how big and how late. */
const SPARKS = [
  { x: -0.44, y: -0.36, s: 0.24, delay: 0 },
  { x: 0.46, y: -0.28, s: 0.18, delay: 0.3 },
  { x: 0.4, y: 0.4, s: 0.22, delay: 0.6 },
  { x: -0.42, y: 0.34, s: 0.16, delay: 0.45 },
]

/** One percent of the screen's shorter side in px, kept up to date: the HUD and the touch buttons size their pictures by it. */
export function useVmin() {
  const [vmin, setVmin] = useState(() => Math.min(innerWidth, innerHeight) / 100)
  useEffect(() => {
    const resize = () => setVmin(Math.min(innerWidth, innerHeight) / 100)
    addEventListener('resize', resize)
    return () => removeEventListener('resize', resize)
  }, [])
  return vmin
}

/** `share` percent of the shorter side, kept between `lo` and `hi` px, whole. */
export const fit = (vmin: number, share: number, lo: number, hi: number) => Math.round(clamp(share * vmin, lo, hi))

const noDefault = (e: { preventDefault: () => void }) => e.preventDefault()

/** Every HUD button: it never takes focus (so Space never clicks it) and never opens the long-press menu. */
export function Btn({ className, label, onTap, children }: { className: string; label: string; onTap: () => void; children: ReactNode }) {
  return (
    <button type="button" tabIndex={-1} className={className} aria-label={label} onMouseDown={noDefault} onClick={onTap} onContextMenu={noDefault}>
      {children}
    </button>
  )
}

/** The little pictures on the HUD's own buttons, white with an ink line like the icons, drawn in a 48 unit square. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg className="glyph" viewBox="0 0 48 48" aria-hidden>
      {children}
    </svg>
  )
}

/** A stroke drawn twice, fat and inky under thin and white, so a line wears the same outline as a shape. */
function Line({ d }: { d: string }) {
  return (
    <>
      <path className="under" d={d} />
      <path className="over" d={d} />
    </>
  )
}

export function PauseGlyph() {
  return (
    <Glyph>
      <rect className="solid" x="11" y="9" width="10" height="30" rx="4" />
      <rect className="solid" x="27" y="9" width="10" height="30" rx="4" />
    </Glyph>
  )
}

export function PlayGlyph() {
  return (
    <Glyph>
      <path className="solid" d="M15 11.5 C15 8.5 17 7.6 19.4 9 L37.6 20.6 C40.4 22.4 40.4 25.6 37.6 27.4 L19.4 39 C17 40.4 15 39.5 15 36.5 Z" />
    </Glyph>
  )
}

export function SoundGlyph({ on }: { on: boolean }) {
  return (
    <Glyph>
      <path className="solid" d="M7 18.5 H14.5 L25 9.5 V38.5 L14.5 29.5 H7 Z" />
      {on ? (
        <>
          <Line d="M31 18 Q35 24 31 30" />
          <Line d="M36.5 12.5 Q44 24 36.5 35.5" />
        </>
      ) : (
        <>
          <Line d="M32 18 L42 30" />
          <Line d="M42 18 L32 30" />
        </>
      )}
    </Glyph>
  )
}

export function FullGlyph() {
  return (
    <Glyph>
      <Line d="M9 19 V9 H19" />
      <Line d="M29 9 H39 V19" />
      <Line d="M39 29 V39 H29" />
      <Line d="M19 39 H9 V29" />
    </Glyph>
  )
}

/** More games: four little cards in a grid, like the directory. */
export function GamesGlyph() {
  return (
    <Glyph>
      <rect className="solid pink" x="7" y="7" width="15" height="15" rx="4.5" />
      <rect className="solid gold" x="26" y="7" width="15" height="15" rx="4.5" />
      <rect className="solid sky" x="7" y="26" width="15" height="15" rx="4.5" />
      <rect className="solid green" x="26" y="26" width="15" height="15" rx="4.5" />
    </Glyph>
  )
}

/** The map: a folded paper map with a path on it. */
export function MapGlyph() {
  return (
    <Glyph>
      <path className="solid paper" d="M5 12 L17 7.5 L31 12.5 L43 8 V36 L31 40.5 L17 35.5 L5 40 Z" />
      <path className="fold" d="M17 7.5 V35.5 M31 12.5 V40.5" />
      <path className="trail" d="M10 33 Q16 22 23 26 T37 15" />
    </Glyph>
  )
}

/** Again: an arrow going round. */
export function AgainGlyph() {
  return (
    <Glyph>
      <Line d="M36 24 A12 12 0 1 1 30 13.6" />
      <path className="solid" d="M36.5 17.2 L26.6 18.6 L32.6 8.6 Z" />
    </Glyph>
  )
}

/** The arrow on a key cap: down for hide, left or right for steering. */
function KeyArrow({ action }: { action: 'hide' | 'left' | 'right' }) {
  return (
    <svg className="glyph" viewBox="0 0 48 48" aria-hidden>
      <path className="ink" transform={`rotate(${action === 'hide' ? 90 : action === 'left' ? 180 : 0} 24 24)`} d="M7 18.5 H25 V8 L42 24 L25 40 V29.5 H7 Z" />
    </svg>
  )
}

/** A four-pointed twinkle. */
function Spark({ size }: { size: number }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="-12 -12 24 24" aria-hidden>
      <path className="solid star" d="M0 -11 Q2.2 -2.2 11 0 Q2.2 2.2 0 11 Q-2.2 2.2 -11 0 Q-2.2 -2.2 0 -11 Z" />
    </svg>
  )
}

/** The slime's way to the finish: a rounded bar the slime slides along to the flag, with a pip at every checkpoint, gold once passed. The little slime copies the big one, flat while hidden and hopping in the air. It moves straight in the DOM every frame; React only draws it. */
function ProgressLine({ game, look, size }: { game: Game; look: SlimeLook; size: number }) {
  const runner = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    let shown = -1
    let posed = ''
    const frame = () => {
      const s = game.sim
      const p = clamp01(progress(s))
      if (p !== shown) {
        shown = p
        runner.current!.style.transform = `translateX(${(p * 100).toFixed(2)}%)`
        fill.current!.style.transform = `scaleX(${p.toFixed(4)})`
      }
      const pose = s.slime.hidden ? 'hide' : s.slime.grounded ? 'stand' : 'jump'
      if (pose !== posed) {
        posed = pose
        runner.current!.dataset.pose = pose
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [game])
  const s = game.sim
  return (
    <div className="line">
      <div className="track">
        <div className="fill" ref={fill} />
        {s.flags.map((f, i) => (
          <i key={i} className={`pip${f.reachedAt >= 0 ? ' lit' : ''}`} style={{ left: `${((f.spec.z / s.course.finishZ) * 100).toFixed(2)}%` }} />
        ))}
        <div className="runner" ref={runner} data-pose="stand">
          {POSES.map((pose) => (
            <span key={pose} className={`me ${pose}`}>
              <SlimeIcon colour={look.colour} pattern={look.pattern} size={size} pose={pose} />
            </span>
          ))}
        </div>
      </div>
      <span className="goal">
        <FlagIcon size={size} />
      </span>
    </div>
  )
}

/** The three babies of the island, found ones filled in; `cheer` makes the found ones bounce one after another. */
function Babies({ sim, size, cheer }: { sim: Sim; size: number; cheer: boolean }) {
  return (
    <span className="babies">
      {sim.babies.map((b) => {
        const found = b.takenAt >= 0
        return (
          <span key={`${b.index}:${found}`} className={`baby${found ? ' found' : ''}${found && cheer ? ' cheer' : ''}`} style={{ animationDelay: `${0.15 * b.index}s` }}>
            <BabyIcon index={b.index} size={size} found={found} />
          </span>
        )
      })}
    </span>
  )
}

function Confetti() {
  return (
    <div className="confetti" aria-hidden>
      {CONFETTI.map((c, i) => (
        <i
          key={i}
          style={{ left: `${c.left}%`, width: c.w, height: c.h, background: c.colour, animationDelay: `${c.delay}s`, animationDuration: `${c.fall}s`, '--spin': `${c.spin}deg`, '--drift': `${c.drift}px` } as CSSProperties}
        />
      ))}
    </div>
  )
}

function Fireworks() {
  return (
    <div className="fireworks" aria-hidden>
      {BURSTS.map((b, i) => (
        <span key={i} className="burst" style={{ left: `${b.x}%`, top: `${b.y}%`, '--c': b.colour, '--delay': `${b.delay}s` } as CSSProperties}>
          {RAYS.map((r) => (
            <i key={r} style={{ '--r': `${r}deg` } as CSSProperties} />
          ))}
        </span>
      ))}
    </div>
  )
}

/** What the box gave, named: a banner in the middle of the top bar once the big prize has flown up into it. */
function GiftBanner({ gift, look, size, lang }: { gift: ItemId | null; look: SlimeLook; size: number; lang: Lang }) {
  return (
    <div className="banner">
      <span className="pic">
        {gift !== null ? <ItemIcon item={gift} size={size} shadow={false} /> : <SlimeIcon colour={look.colour} pattern={look.pattern} size={size} pose="jump" />}
        <span className="spark">
          <Spark size={Math.round(size * 0.42)} />
        </span>
      </span>
      <span className="says">{inLang(giftWords(gift), lang)}</span>
    </div>
  )
}

/**
 * The end of a run. The gift pops up big in a ring of light in the middle (a jumping slime
 * and confetti when the box had nothing new), then flies up into the banner in the top bar,
 * so the slime stands in full view in its new thing, where the scene shows it. The run's
 * tally and the two big buttons wait at the bottom.
 */
function DoneCard({ game, look, vmin, lang }: { game: Game; look: SlimeLook; vmin: number; lang: Lang }) {
  const say = (words: Words) => inLang(words, lang)
  const s = game.sim
  const news = game.jarNews
  const gift = s.gift
  const halo = fit(vmin, 30, 120, 260)
  const badge = fit(vmin, 8.5, 40, 74)
  let delay = 0.5
  const next = () => `${(delay += 0.14).toFixed(2)}s`
  return (
    <div className="done">
      {gift === null && <Confetti />}
      {news !== null && news.fireworks > 0 && <Fireworks />}
      <div className="prize">
        <div className="halo" style={{ width: halo, height: halo }}>
          <span className="rays" />
          <span className="disc">{gift !== null ? <ItemIcon item={gift} size={Math.round(halo * 0.58)} shadow={false} /> : <SlimeIcon colour={look.colour} pattern={look.pattern} size={Math.round(halo * 0.58)} pose="jump" />}</span>
          {SPARKS.map((p, i) => (
            <span key={i} className="spark" style={{ left: `${50 + p.x * 100}%`, top: `${50 + p.y * 100}%`, animationDelay: `${p.delay}s` }}>
              <Spark size={Math.round(halo * p.s)} />
            </span>
          ))}
        </div>
        <p className="says">{say(giftWords(gift))}</p>
      </div>
      <div className="tally" style={{ '--calm': `${DONE_CALM}s` } as CSSProperties}>
        <div className="badges">
          {s.finish.measureAt >= 0 && (
            <span className="badge" style={{ animationDelay: next() }}>
              <AnimalIcon animal={s.finish.animal} size={badge} />
            </span>
          )}
          <span className="badge" style={{ animationDelay: next() }}>
            <Babies sim={s} size={Math.round(badge * 0.8)} cheer />
          </span>
          {s.stars > 0 && (
            <span className="badge" style={{ animationDelay: next() }}>
              <StarIcon size={Math.round(badge * 0.7)} />
              {s.stars}
            </span>
          )}
          {news !== null &&
            news.patterns.map((p) => (
              <span key={p} className="badge new" style={{ animationDelay: next() }}>
                <SlimeIcon colour={look.colour} pattern={p} size={badge} pose="jump" />
                <span className="spark">
                  <Spark size={Math.round(badge * 0.4)} />
                </span>
              </span>
            ))}
        </div>
        <div className="buttons">
          <Btn className="big again" label={say(WORDS.again)} onTap={() => game.again()}>
            <AgainGlyph />
            {say(WORDS.again)}
          </Btn>
          <Btn className="big home" label={say(WORDS.map)} onTap={() => game.toMap()}>
            <MapGlyph />
            {say(WORDS.map)}
          </Btn>
        </div>
      </div>
    </div>
  )
}

/** The pause menu dims the run and takes every tap; one beside the buttons keeps going. */
function PauseMenu({ game, look, vmin, lang }: { game: Game; look: SlimeLook; vmin: number; lang: Lang }) {
  const say = (words: Words) => inLang(words, lang)
  const sound = game.save.sound
  const soundSays = say(sound ? WORDS.soundOn : WORDS.soundOff)
  // Only a tap that began on the dim keeps going: a finger already down when the menu came (the window lost focus under it) lifts here too.
  const began = useRef(false)
  return (
    <div
      className="dim"
      onPointerDown={(e) => {
        began.current = e.target === e.currentTarget
      }}
      onClick={(e) => {
        if (began.current && e.target === e.currentTarget) game.resume()
        began.current = false
      }}
    >
      <div className="card menu">
        <span className="nap">
          <SlimeIcon colour={look.colour} pattern={look.pattern} size={fit(vmin, 14, 64, 120)} pose="hide" />
        </span>
        <Btn className="big go" label={say(WORDS.keepGoing)} onTap={() => game.resume()}>
          <PlayGlyph />
          {say(WORDS.keepGoing)}
        </Btn>
        <Btn className="mid home" label={say(WORDS.map)} onTap={() => game.toMap()}>
          <MapGlyph />
          {say(WORDS.map)}
        </Btn>
        <div className="row">
          <Btn className={`small${sound ? '' : ' off'}`} label={soundSays} onTap={() => game.toggleMute()}>
            <SoundGlyph on={sound} />
            {soundSays}
          </Btn>
          {document.fullscreenEnabled && (
            <Btn className="small" label={say(WORDS.fullScreen)} onTap={toggleFullscreen}>
              <FullGlyph />
              {say(WORDS.fullScreen)}
            </Btn>
          )}
          <Btn className="small" label={say(WORDS.moreGames)} onTap={() => location.assign('../index.html')}>
            <GamesGlyph />
            {say(WORDS.moreGames)}
          </Btn>
        </div>
      </div>
    </div>
  )
}

/** The HUD of one run, keyed by it so every flourish starts afresh. */
function PlayHud({ game, lang }: { game: Game; lang: Lang }) {
  const say = (words: Words) => inLang(words, lang)
  const look = useLook(game)
  const vmin = useVmin()
  const s = game.sim
  const theme = THEMES[s.course.id]
  const phase = s.phase
  const paused = game.paused
  const got = s.finish.keyAt >= 0
  const climbing = phase === 'tower' || phase === 'fall' || phase === 'top'
  const teach = s.teach
  const icon = fit(vmin, 6.4, 34, 54)
  return (
    <div className={`play-hud ${phase}`} style={{ '--accent': theme.accent[0], '--accent-2': theme.accent[1] } as CSSProperties}>
      <div className="bar">
        <div className="pockets">
          <span key={got ? 'got' : 'dim'} className={`key${got ? ' got' : ''}`}>
            <KeyIcon size={icon} dim={!got} />
          </span>
          <Babies sim={s} size={Math.round(icon * 0.92)} cheer={false} />
        </div>
        {climbing ? (
          <div className="stars">
            <StarIcon size={fit(vmin, 7.6, 40, 64)} />
            <span key={s.stars} className="count">
              {s.stars}
            </span>
          </div>
        ) : phase === 'done' ? (
          <GiftBanner gift={s.gift} look={look} size={fit(vmin, 7, 40, 62)} lang={lang} />
        ) : (
          <ProgressLine game={game} look={look} size={fit(vmin, 7, 38, 58)} />
        )}
        <div className="corner">
          <Btn className="round" label={say(WORDS.pause)} onTap={() => game.pause()}>
            <PauseGlyph />
          </Btn>
          <Btn className="round" label={say(game.save.sound ? WORDS.soundOn : WORDS.soundOff)} onTap={() => game.toggleMute()}>
            <SoundGlyph on={game.save.sound} />
          </Btn>
        </div>
      </div>

      {phase === 'finish' && got && (
        <p key={s.finish.keyAt} className="shout">
          {say(WORDS.gotKey)}
        </p>
      )}
      {phase === 'top' && (
        <p key={s.finish.topAt} className="shout">
          {say(WORDS.openBox)}
        </p>
      )}

      {/* The island's name and the babies to find at the top, Go at the bottom: the slime waits at the start line in between. */}
      {!paused && phase === 'ready' && (
        <div className="ready">
          <div className="title">
            <h1>{say(COURSE_WORDS[s.course.id].name)}</h1>
            <Babies sim={s} size={fit(vmin, 7.5, 40, 64)} cheer={false} />
          </div>
          <div className="start">
            <Btn className="big go" label={say(WORDS.go)} onTap={() => game.go()}>
              {say(WORDS.go)}
            </Btn>
          </div>
        </div>
      )}

      {!paused && phase === 'done' && <DoneCard game={game} look={look} vmin={vmin} lang={lang} />}

      {/* Without a touch screen the answer to a teaching moment is a picture and its key; on one, the touch button pulses instead. */}
      {!paused && !game.touch && teach !== null && (
        <div key={teach.at} className={`teach ${teach.action}`}>
          <span className="pic">
            {teach.action === 'left' || teach.action === 'right' ? (
              <ArrowIcon dir={teach.action === 'left' ? -1 : 1} size={fit(vmin, 10.5, 56, 96)} />
            ) : (
              <SlimeIcon colour={look.colour} pattern={look.pattern} size={fit(vmin, 12, 60, 110)} pose={teach.action === 'jump' ? 'jump' : 'hide'} />
            )}
          </span>
          <kbd>{teach.action === 'jump' ? say(WORDS.space) : <KeyArrow action={teach.action} />}</kbd>
        </div>
      )}

      {paused && <PauseMenu game={game} look={look} vmin={vmin} lang={lang} />}
    </div>
  )
}

/**
 * Everything drawn over a run, few words and big: the key and the babies top left, the
 * slime's way to the flag along the top (the star count once it climbs the tower), pause and
 * sound top right, the ready card, the shouts, the done card, the teaching picture and the
 * pause menu. Only on the play screen; the map and the wardrobe have their own.
 */
export function Hud({ game, lang }: { game: Game; lang: Lang }) {
  useGameView(game)
  if (game.screen !== 'play') return null
  return <PlayHud key={game.generation} game={game} lang={lang} />
}
