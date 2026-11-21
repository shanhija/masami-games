import './map.css'

import { useEffect, useId, useState, type CSSProperties } from 'react'

import { COLOUR_IDS, ITEM_IDS, ITEMS, PATTERNS, SLIME_COLOURS, SLOTS, type ItemId, type Pattern, type SlimeColour, type Slot } from './game/closet'
import { useLook, useScreenKey, type Game } from './game/game'
import { ArrowIcon, ItemIcon, PatternIcon, SlimeIcon, SlotIcon } from './Icons'
import { palette } from './scene/look'
import { TapButton, cls, wobble } from './TapButton'

/** Each place's things in ITEMS order, the order the boxes give them: the first island's first. */
const BY_SLOT = Object.fromEntries(SLOTS.map((slot) => [slot, ITEM_IDS.filter((id) => ITEMS[id].slot === slot)])) as Record<Slot, ItemId[]>

/** What a screen reader says for each tab, and for a thing ("roundGlasses" says "round glasses"). */
const SLOT_WORDS: Record<Slot, string> = { hat: 'Hats', glasses: 'Glasses', shirt: 'Shirts', skirt: 'Skirts', bag: 'Bags', neck: 'Neck things' }
const say = (id: string) => id.replace(/[A-Z]/g, (c) => ` ${c.toLowerCase()}`)

/** What is new since the wardrobe last opened: things from the boxes and patterns from the star jar. */
export interface News {
  things: ItemId[]
  patterns: Pattern[]
}
const NO_NEWS: News = { things: [], patterns: [] }

/** Per game, what the save held when the wardrobe last opened (or the page loaded). */
const seenBy = new WeakMap<Game, { things: ReadonlySet<ItemId>; patterns: ReadonlySet<Pattern> }>()

/** Everything the save holds now counts as seen. */
function markSeen(game: Game) {
  const seen = { things: new Set(game.save.found), patterns: new Set(game.save.patterns) }
  seenBy.set(game, seen)
  return seen
}

/**
 * What was found since the wardrobe last opened: it sparkles there for one visit, and the
 * map's wardrobe button wears a gold dot until then. The map and the wardrobe both ask on
 * every render from their first, so what the page loaded with is never new.
 */
export function wardrobeNews(game: Game): News {
  const seen = seenBy.get(game) ?? markSeen(game)
  return { things: game.save.found.filter((id) => !seen.things.has(id)), patterns: game.save.patterns.filter((p) => !seen.patterns.has(p)) }
}

/** One visit to the wardrobe: whether it is open, what is new this time, and the tab showing. */
interface Visit {
  open: boolean
  news: News
  slot: Slot
}

/**
 * The wardrobe screen over the 3D slime: a big back arrow top left, and a panel (at the
 * right on a wide screen, along the bottom on a tall one) with six tabs for the places, the
 * open place's things as big tiles (a thing not found yet is a shadow with a "?" that shakes
 * its head; the worn one is ringed in the slime's colour; a tap puts a thing on, a tap on
 * the worn one takes it off), the five colours as little slimes, and the patterns (plain,
 * the open ones, and the ones the star jar has still to open). It opens on the place of the
 * newest thing from a box, and what is new sparkles. Nothing to read: pictures and sounds.
 */
export function Wardrobe({ game }: { game: Game }) {
  useScreenKey(game)
  const look = useLook(game)
  const open = game.screen === 'wardrobe'
  const news = wardrobeNews(game)
  const [visit, setVisit] = useState<Visit>({ open: false, news: NO_NEWS, slot: SLOTS[0] })
  // Opening starts a visit in this very render: what is new sparkles until it closes, and the
  // tab opens on the newest thing's place (or stays where it was). After the paint it all counts as seen.
  if (visit.open !== open) {
    const fresh = open ? news : NO_NEWS
    const newest = fresh.things.at(-1)
    setVisit({ open, news: fresh, slot: newest === undefined ? visit.slot : ITEMS[newest].slot })
  }
  useEffect(() => {
    if (open) markSeen(game)
  }, [game, open])
  if (!open) return null

  const { found, patterns } = game.save
  const slot = visit.slot
  const worn = look.outfit[slot]
  const jelly = SLIME_COLOURS[look.colour]
  return (
    <div className="ward" style={{ '--jelly': jelly.body, '--jelly-deep': jelly.deep, '--jelly-light': jelly.light } as CSSProperties}>
      <TapButton game={game} className="ward-back" label="Back to the map" sound={null} onTap={() => game.closeWardrobe()}>
        <ArrowIcon dir={-1} size={80} />
      </TapButton>
      <div className="ward-panel">
        <div className="ward-rows">
          <div className="ward-tabs">
            {SLOTS.map((s) => (
              <TapButton
                key={s}
                game={game}
                className={cls('ward-tab', s === slot && 'on', visit.news.things.some((id) => ITEMS[id].slot === s) && 'news')}
                label={SLOT_WORDS[s]}
                sound="select"
                onTap={() => setVisit((v) => ({ ...v, slot: s }))}
              >
                <SlotIcon slot={s} size={64} />
              </TapButton>
            ))}
          </div>
          <div className="ward-tiles">
            {/* Keyed by the place, so a new tab's tiles pop in one after another. */}
            <div className="ward-grid" key={slot}>
              {BY_SLOT[slot].map((id) =>
                found.includes(id) ? (
                  <TapButton
                    key={id}
                    game={game}
                    className={cls('ward-tile', id === worn && 'worn', visit.news.things.includes(id) && 'fresh')}
                    label={say(id)}
                    sound={null}
                    onTap={() => game.wear(slot, id === worn ? null : id)}
                  >
                    <ItemIcon item={id} size={140} shadow={false} />
                  </TapButton>
                ) : (
                  <TapButton key={id} game={game} className="ward-tile unfound" label="Not found yet" sound="uhuh" onTap={wobble}>
                    <ItemIcon item={id} size={140} shadow />
                    <span className="ward-q">?</span>
                  </TapButton>
                ),
              )}
            </div>
          </div>
          <div className="ward-look">
            <div className="ward-colours">
              {COLOUR_IDS.map((c) => (
                <TapButton
                  key={c}
                  game={game}
                  className={cls('ward-swatch', c === look.colour && 'on')}
                  style={{ '--ring': SLIME_COLOURS[c].deep } as CSSProperties}
                  label={c}
                  sound={null}
                  onTap={() => game.setColour(c)}
                >
                  <SlimeIcon colour={c} pattern={look.pattern} size={80} pose="stand" />
                </TapButton>
              ))}
            </div>
            <div className="ward-patterns">
              <TapButton game={game} className={cls('ward-pattern', look.pattern === null && 'on')} label="No pattern" sound={null} onTap={() => game.setPattern(null)}>
                <PlainIcon colour={look.colour} />
              </TapButton>
              {PATTERNS.map((p) =>
                patterns.includes(p) ? (
                  <TapButton
                    key={p}
                    game={game}
                    className={cls('ward-pattern', look.pattern === p && 'on', visit.news.patterns.includes(p) && 'fresh')}
                    label={p}
                    sound={null}
                    onTap={() => game.setPattern(p)}
                  >
                    <PatternIcon pattern={p} size={64} locked={false} />
                  </TapButton>
                ) : (
                  <TapButton key={p} game={game} className="ward-pattern locked" label="Not open yet" sound="uhuh" onTap={wobble}>
                    <PatternIcon pattern={p} size={64} locked />
                  </TapButton>
                ),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The blob PatternIcon draws its swatches on, in its square. */
const BLOB = 'M 0,-0.82 C 0.5,-0.82 0.88,-0.46 0.88,0.02 C 0.88,0.5 0.52,0.8 0,0.8 C -0.52,0.8 -0.88,0.5 -0.88,0.02 C -0.88,-0.46 -0.5,-0.82 0,-0.82 Z'

/** The "no pattern" swatch: PatternIcon's blob with its ink edge, shade and shine, in the slime's own plain jelly. */
function PlainIcon({ colour }: { colour: SlimeColour }) {
  const c = SLIME_COLOURS[colour]
  const clip = `plain${useId().replace(/[^A-Za-z0-9]/g, '')}`
  return (
    <svg className="icon" width={64} height={64} viewBox="-1.08 -1.08 2.16 2.16" aria-hidden>
      <path d={BLOB} fill={palette.ink} stroke={palette.ink} strokeWidth={0.16} strokeLinejoin="round" />
      <path d={BLOB} fill={c.body} />
      <clipPath id={clip}>
        <path d={BLOB} />
      </clipPath>
      <ellipse cx={0.2} cy={0.9} rx={1.05} ry={0.32} fill={c.deep} opacity={0.45} clipPath={`url(#${clip})`} />
      <ellipse cx={-0.44} cy={-0.38} rx={0.1} ry={0.2} transform="rotate(40 -0.44 -0.38)" fill="#ffffff" opacity={0.85} />
    </svg>
  )
}
