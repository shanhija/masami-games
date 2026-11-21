import { useEffect, useState, type ReactNode, type SyntheticEvent } from 'react'

import { DIRECTORY } from '../../profiles/src/directory'
import { inLang, type Lang, type Words } from '../../profiles/src/lang'
import { toggleFullscreen, useGameView, type Game } from './game/game'
import { COST, GOODS, HINT_FOR, PIECE_KINDS, RECIPE, WORKSHOPS, cannotPay, costEntries, currentWish, makerOf, unlocked, wishProgress, type BarKind, type Good, type Made } from './game/sim'
import { GoodIcon, PieceIcon } from './Icons'
import { BAR_NAMES, WORDS } from './words'

/** How long each little flourish lasts, in sim seconds. */
const BUMP_FOR = 0.4
const DING_FOR = 0.6
const DONE_FOR = 2.5
/** "New castle" wants a second tap within this long, in wall-clock milliseconds: the sim stands still while the menu is up. */
const ARM_FOR = 3000

const BAR_KINDS: readonly BarKind[] = [...PIECE_KINDS, 'paint', 'lift']

/** The price as pictures: one small icon per unit. The brush costs one colour cloth, and taking a piece back is free. */
const costOf = (kind: BarKind): [Good, number][] => (kind === 'paint' ? [['colourcloth', 1]] : kind === 'lift' ? [] : costEntries(COST[kind]))
const isMade = (g: Good): g is Made => WORKSHOPS.some((w) => RECIPE[w].output === g)

const noMenu = (e: SyntheticEvent) => e.preventDefault()

/** Every button in the HUD: a long press never opens the browser's menu. */
function Btn({ className, label, onTap, onDown, children }: { className: string; label: string; onTap?: () => void; onDown?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      aria-label={label}
      onClick={onTap}
      onPointerDown={
        onDown &&
        ((e) => {
          e.preventDefault()
          onDown()
        })
      }
      onContextMenu={noMenu}
    >
      {children}
    </button>
  )
}

/**
 * The words and pictures over the picture, few and big: the King's wish top left, the
 * yard's goods top right, pause, sound and look in the bottom right corner, the build bar
 * along the bottom beside them, and the start card and the pause menu in the middle.
 * Re-renders only when the game says there is news, plus once more when a flourish is due
 * to end.
 */
export function Hud({ game, lang }: { game: Game; lang: Lang }) {
  const say = (words: Words) => inLang(words, lang)
  const sim = useGameView(game)
  const now = sim.time
  const muted = game.audio.muted
  const [, poke] = useState(0)
  const [armedAt, setArmedAt] = useState(-1)
  // What the HUD last showed, so a count going up or a button becoming affordable can flash once. Made once, then mutated during render: the same render twice sees the same flashes.
  const [seen] = useState(() => ({
    counts: { ...sim.store },
    bumpAt: Object.fromEntries(GOODS.map((g) => [g, -1])) as Record<Good, number>,
    poor: Object.fromEntries(BAR_KINDS.map((k) => [k, cannotPay(sim, k)])) as Record<BarKind, boolean>,
    dingAt: Object.fromEntries(BAR_KINDS.map((k) => [k, -1])) as Record<BarKind, number>,
  }))
  /** Whether a timestamp is within `span` seconds before now. A new castle resets the clock, so a stamp from the future is stale. */
  const fresh = (at: number, span: number) => at >= 0 && now >= at && now - at < span

  for (const g of GOODS) {
    const n = sim.store[g]
    if (n > seen.counts[g]) seen.bumpAt[g] = now
    seen.counts[g] = n
  }
  const bar = unlocked(sim)
  for (const k of bar) {
    const poor = cannotPay(sim, k)
    if (seen.poor[k] && !poor) seen.dingAt[k] = now
    seen.poor[k] = poor
  }
  const hint = sim.hint
  const maker = hint && fresh(hint.at, HINT_FOR) && isMade(hint.good) ? makerOf(hint.good) : null
  const wiggle = maker && !sim.pieces.some((p) => p.kind === maker) ? maker : null
  const wish = currentWish(sim)
  const progress = wishProgress(sim)
  const done = fresh(sim.wishDoneAt, DONE_FOR)

  // One timer for whichever flourish ends first, so its class comes off without any other news.
  const flashes: [number, number][] = [...GOODS.map((g): [number, number] => [seen.bumpAt[g], BUMP_FOR]), ...bar.map((k): [number, number] => [seen.dingAt[k], DING_FOR]), [sim.wishDoneAt, DONE_FOR], [hint ? hint.at : -1, HINT_FOR]]
  const wait = Math.min(...flashes.filter(([at, span]) => fresh(at, span)).map(([at, span]) => at + span - now))
  useEffect(() => {
    if (!Number.isFinite(wait) || game.paused) return
    const id = setTimeout(() => poke((n) => n + 1), wait * 1000 + 30)
    return () => clearTimeout(id)
  })
  useEffect(() => {
    if (armedAt < 0) return
    const id = setTimeout(() => setArmedAt(-1), ARM_FOR)
    return () => clearTimeout(id)
  }, [armedAt])
  // The menu closing forgets the first tap, so it always opens with "New castle" still safe.
  useEffect(() => {
    if (!game.paused) setArmedAt(-1)
  }, [game.paused])
  const armed = armedAt >= 0

  return (
    <div className="hud">
      <Btn className={`wish${done ? ' done' : ''}`} label={say(WORDS.look)} onDown={() => game.look()}>
        {wish ? (
          <>
            <span className="crown">👑</span>
            <PieceIcon kind={wish.kind} size={56} colour={sim.dye} />
            <span className="pips">
              {Array.from({ length: wish.count }, (_, i) => (
                <i key={i} className={i < progress ? 'lit' : ''} />
              ))}
            </span>
          </>
        ) : (
          <span className="crown big">👑✨</span>
        )}
        {done && <span className="spark">✨</span>}
      </Btn>

      <div className="store">
        {GOODS.map((g) => {
          const n = sim.store[g]
          return (
            <div key={`${g}:${n}`} className={`good${fresh(seen.bumpAt[g], BUMP_FOR) ? ' bump' : ''}`}>
              <GoodIcon good={g} size={34} colour={sim.dye} />
              <span>{n}</span>
            </div>
          )
        })}
      </div>

      <div className="corner">
        <Btn className="round" label={say(game.paused ? WORDS.keepGoing : WORDS.pause)} onTap={() => (game.paused ? game.resume() : game.pause())}>
          {game.paused ? '▶' : '⏸'}
        </Btn>
        <Btn className="round" label={say(muted ? WORDS.soundOff : WORDS.soundOn)} onTap={() => game.toggleMute()}>
          {muted ? '🔇' : '🔊'}
        </Btn>
        <Btn className="round" label={say(WORDS.look)} onTap={() => game.look()}>
          👁️
        </Btn>
      </div>

      {!game.paused && (
        <div className="bar">
          <div className="pieces">
            {bar.map((kind) => {
              const cls = ['piece', sim.selected === kind ? 'selected' : '', cannotPay(sim, kind) ? 'poor' : '', wiggle === kind ? 'wiggle' : '', fresh(seen.dingAt[kind], DING_FOR) ? 'ding' : ''].filter(Boolean).join(' ')
              return (
                <Btn key={kind} className={cls} label={say(BAR_NAMES[kind])} onDown={() => game.select(kind)}>
                  <span className="pic" key={seen.dingAt[kind]}>
                    <PieceIcon kind={kind} size={52} colour={sim.dye} />
                  </span>
                  <span className="cost">
                    {costOf(kind).flatMap(([g, n]) => Array.from({ length: n }, (_, i) => <GoodIcon key={`${g}${i}`} good={g} size={16} colour={sim.dye} />))}
                  </span>
                </Btn>
              )
            })}
          </div>
        </div>
      )}

      {sim.phase === 'ready' && !game.paused && (
        <div className="card start">
          <h1>{say(DIRECTORY['castle-builder'].name)}</h1>
          <p className="tap">{say(WORDS.tapToPlay)}</p>
          <Btn className="big" label={say(WORDS.play)} onTap={() => game.press()}>
            {say(WORDS.play)}
          </Btn>
          <p className="small">{say(WORDS.howToPlay)}</p>
          {sim.pieces.length > 0 && <p className="small">{say(WORDS.stillHere)}</p>}
        </div>
      )}

      {game.paused && (
        <div className="card menu">
          <h1>{say(WORDS.paused)}</h1>
          <Btn className="big" label={say(WORDS.keepGoing)} onTap={() => game.resume()}>
            {say(WORDS.keepGoing)}
          </Btn>
          <Btn
            className={`big${armed ? ' armed' : ''}`}
            label={say(WORDS.newCastle)}
            onTap={() => {
              if (armed) {
                setArmedAt(-1)
                game.newCastle()
              } else setArmedAt(Date.now())
            }}
          >
            {say(armed ? WORDS.reallyNewCastle : WORDS.newCastle)}
          </Btn>
          <div className="row">
            <Btn className="" label={say(muted ? WORDS.soundOff : WORDS.soundOn)} onTap={() => game.toggleMute()}>
              {muted ? '🔇' : '🔊'} {say(muted ? WORDS.soundOff : WORDS.soundOn)}
            </Btn>
            <Btn className="" label={say(WORDS.fullScreen)} onTap={toggleFullscreen}>
              ⛶ {say(WORDS.fullScreen)}
            </Btn>
            <Btn className="" label={say(WORDS.moreGames)} onTap={() => location.assign('../index.html')}>
              🎮 {say(WORDS.moreGames)}
            </Btn>
            <Btn className="" label={say(sim.stormsOn ? WORDS.stormsOn : WORDS.stormsOff)} onTap={() => game.toggleStorms()}>
              {sim.stormsOn ? '☁️' : '☀️'} {say(sim.stormsOn ? WORDS.stormsOn : WORDS.stormsOff)}
            </Btn>
          </div>
        </div>
      )}
    </div>
  )
}
