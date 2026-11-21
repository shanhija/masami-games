import './closet.css'

import { useEffect, useRef, useState } from 'react'

import { INK } from '../../pia-jump/src/draw/look'
import { inLang, type Lang, type Words } from '../../profiles/src/lang'
import { Doll } from './Doll'
import type { Act } from './draw/person'
import { COLOURED, COLOURS, GROUPS, HAIR_COLOURS, OPTIONS, canWear, rewardOf, surprise, takesColour, withOption, type Colour, type Group, type HairColour, type Look, type Part, type Reward } from './game/closet'
import { CLOSET, COLOUR_NAMES, GROUP_NAMES, OPTION_NAMES, PART_NAMES } from './words'

/** How long the person waves after a change, and dances after putting on a fresh present, in ms. */
const WAVE_MS = 1500
const DANCE_MS = 2400

const cls = (...names: (string | false)[]) => names.filter(Boolean).join(' ')

/** What a part's tab shows: the look, but with the part's first real option on when it wears none there, so the tab shows what the part is. */
function showcase(look: Look, part: Part): Look {
  return look[part] === 'none' ? withOption(look, part, (OPTIONS[part] as readonly string[])[1]) : look
}

/**
 * The dress-up screen, a controlled component: the game owns the look and the found presents.
 * `fresh` are presents found since the closet last showed: they sparkle. onTap is the tap sound
 * for every pick, onLocked the "not yet" sound for a present still hidden in a level, onPlay
 * the big Play button. The person waits on a big stage at the left; at the right, four group
 * tabs, the open group's part tabs, the open part's options and its colours, every one named
 * in `lang`.
 */
export function Closet({ lang, look, found, fresh, onChange, onPlay, onTap, onLocked }: {
  lang: Lang
  look: Look
  found: ReadonlySet<Reward>
  fresh: ReadonlySet<Reward>
  onChange: (look: Look) => void
  onPlay: () => void
  onTap: () => void
  onLocked: () => void
}) {
  const [group, setGroup] = useState(0)
  const [part, setPart] = useState<Part>(GROUPS[0].parts[0])
  const [act, setAct] = useState<Act>('stand')
  // The locked tile tapped last, and a count that remounts it so its wobble plays again.
  const [wobble, setWobble] = useState({ option: '', n: 0 })
  const timer = useRef(0)
  const say = (words: Words) => inLang(words, lang)
  /** The name of `option` of `part`. */
  const optionName = (p: Part, o: string) => say((OPTION_NAMES[p] as Record<string, Words>)[o]!)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const isFresh = (p: Part, o: string) => {
    const r = rewardOf(p, o)
    return r !== null && fresh.has(r)
  }
  const partFresh = (p: Part) => (OPTIONS[p] as readonly string[]).some((o) => isFresh(p, o))
  /** Every pick: the tap sound, the new look, and the person waves (or dances for a fresh present). */
  const put = (next: Look, dance: boolean) => {
    onTap()
    onChange(next)
    window.clearTimeout(timer.current)
    setAct(dance ? 'dance' : 'wave')
    timer.current = window.setTimeout(() => setAct('stand'), dance ? DANCE_MS : WAVE_MS)
  }
  const field = takesColour(look, part) ? COLOURED[part] : null
  const palette: Readonly<Record<string, string>> = part === 'hair' ? HAIR_COLOURS : COLOURS

  return (
    <div className="closet">
      <div className="closet-stage">
        <Doll look={look} act={act} animate zoom="all" className="closet-star" />
        <div className="closet-go">
          <button className="closet-surprise" aria-label={say(CLOSET.surpriseMe)} onClick={() => put(surprise(found, (n) => Math.floor(Math.random() * n)), false)}>
            <Dice />
            <span>{say(CLOSET.surpriseMeShown)}</span>
          </button>
          <button className="closet-play" aria-label={say(CLOSET.play)} onClick={onPlay}>
            <span>{say(CLOSET.playShown)}</span>
          </button>
        </div>
      </div>
      <div className="closet-side">
        <div className="closet-groups">
          {GROUPS.map((g, i) => (
            <button
              key={g.id}
              className={cls('closet-group', i === group && 'open', g.parts.some((p) => partFresh(p)) && 'news')}
              aria-label={say(GROUP_NAMES[g.id])}
              aria-pressed={i === group}
              onClick={() => {
                onTap()
                setGroup(i)
                setPart(g.parts[0])
              }}
            >
              <GroupPicture group={g.id} />
              <span>{say(GROUP_NAMES[g.id])}</span>
            </button>
          ))}
        </div>
        <div className="closet-parts">
          {GROUPS[group].parts.map((p) => (
            <button
              key={p}
              className={cls('closet-part', p === part && 'open', partFresh(p) && 'news')}
              aria-label={say(PART_NAMES[p])}
              aria-pressed={p === part}
              onClick={() => {
                onTap()
                setPart(p)
              }}
            >
              <Doll look={showcase(look, p)} act="stand" animate={false} zoom={p} className="closet-part-doll" />
            </button>
          ))}
        </div>
        <div className="closet-options">
          {(OPTIONS[part] as readonly string[]).map((o) =>
            canWear(part, o, found) ? (
              <button
                key={o}
                className={cls('closet-tile', look[part] === o && 'worn', isFresh(part, o) && 'fresh')}
                aria-label={optionName(part, o)}
                aria-pressed={look[part] === o}
                onClick={() => put(withOption(look, part, o), isFresh(part, o))}
              >
                <Doll look={withOption(look, part, o)} act="stand" animate={false} zoom={part} className="closet-tile-doll" />
              </button>
            ) : (
              <button
                key={`${o}:${wobble.option === o ? wobble.n : 0}`}
                className={cls('closet-tile', 'locked', wobble.option === o && 'wobble')}
                aria-label={say(CLOSET.presentToFind)}
                onClick={() => {
                  onLocked()
                  setWobble((w) => ({ option: o, n: w.n + 1 }))
                }}
              >
                <Present />
              </button>
            ),
          )}
        </div>
        {field && (
          <div className="closet-colours">
            {Object.entries(palette).map(([name, hex]) => (
              <button
                key={name}
                className={cls('closet-swatch', look[field] === name && 'worn')}
                style={{ background: hex }}
                aria-label={say(COLOUR_NAMES[name as Colour | HairColour])}
                aria-pressed={look[field] === name}
                onClick={() => put({ ...look, [field]: name }, false)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** The pictures on the four group tabs: a face, a little person, a T-shirt, a lipstick. */
function GroupPicture({ group }: { group: Group }) {
  const line = { stroke: INK, strokeWidth: 3, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
  switch (group) {
    case 'face':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="26" r="17" fill="#F3C9A6" {...line} />
          <path d="M7.5 23C8 13 15 8 24 8s16 5 16.5 15c-6 0-11-2.5-13.5-7-3 4.5-10 7-19.5 7z" fill="#6B4329" {...line} />
          <circle cx="18" cy="28" r="2.8" fill={INK} />
          <circle cx="30" cy="28" r="2.8" fill={INK} />
          <ellipse cx="13.5" cy="33.5" rx="3.2" ry="2" fill="#FF9DBB" />
          <ellipse cx="34.5" cy="33.5" rx="3.2" ry="2" fill="#FF9DBB" />
          <path d="M19.5 35q4.5 4.5 9 0" fill="none" {...line} strokeWidth={2.6} />
        </svg>
      )
    case 'body':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <path d="M18 36v8M30 36v8M16 24l-6 9M32 24l6 9" fill="none" {...line} strokeWidth={8} />
          <path d="M18 36v8M30 36v8M16 24l-6 9M32 24l6 9" fill="none" stroke="#F3C9A6" strokeWidth={4} strokeLinecap="round" />
          <path d="M16 21h16l4 17H12z" fill="#3F7FE0" {...line} />
          <circle cx="24" cy="12" r="8.5" fill="#F3C9A6" {...line} />
        </svg>
      )
    case 'clothes':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <path d="M17 8 5.5 15l4.5 9.5 5-2.5v19h18V22l5 2.5 4.5-9.5L31 8c-1 4-3.5 6-7 6s-6-2-7-6z" fill="#F7C843" {...line} />
        </svg>
      )
    case 'makeup':
      return (
        <svg viewBox="0 0 48 48" aria-hidden>
          <rect x="14" y="28" width="18" height="16" rx="3" fill="#8B5CC9" {...line} />
          <rect x="16.5" y="21" width="13" height="8" rx="1.5" fill="#FFD447" {...line} />
          <path d="M18.5 21V11l9-5v15z" fill="#FF6FAE" {...line} />
          <path d="M38 6l1.6 4.4L44 12l-4.4 1.6L38 18l-1.6-4.4L32 12l4.4-1.6z" fill="#FFD447" {...line} strokeWidth={2} />
        </svg>
      )
  }
}

/** The Surprise button's dice, tipped over a little. */
function Dice() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <g transform="rotate(-12 24 24)">
        <rect x="7" y="7" width="34" height="34" rx="9" fill="#FFFFFF" stroke={INK} strokeWidth={3.5} />
        {[
          [16, 16],
          [32, 16],
          [24, 24],
          [16, 32],
          [32, 32],
        ].map(([x, y]) => (
          <circle key={`${x} ${y}`} cx={x} cy={y} r="3.6" fill="#FF6FAE" />
        ))}
      </g>
    </svg>
  )
}

/** A wrapped present: what a tile shows until its present is found in a level. */
function Present() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden>
      <rect x="9" y="21" width="30" height="21" rx="3" fill="#B79CFF" stroke={INK} strokeWidth={3} />
      <rect x="6" y="15" width="36" height="9" rx="3" fill="#CDB9FF" stroke={INK} strokeWidth={3} />
      <path d="M24 15v27" stroke={INK} strokeWidth={9} />
      <path d="M24 16.5v24" stroke="#FFD447" strokeWidth={4.5} />
      <path d="M24 15c-2-7-11-9.5-12-4.5S20 15 24 15c4 0 13-0.5 12-4.5S26 8 24 15z" fill="#FFD447" stroke={INK} strokeWidth={3} strokeLinejoin="round" />
    </svg>
  )
}
