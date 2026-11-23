import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { AvatarPicture } from '../../../profiles/src/Avatar'
import { inLang, type Lang } from '../../../profiles/src/lang'
import type { Slot } from '../../../silly-billy/src/engine/types'
import type { Sounds } from '../../../silly-billy/src/sounds'
import { PATTERN_ORDER, patternOf } from '../patterns/patterns'
import { PatternSwatch } from '../patterns/Swatch'
import type { GiftEntry, LibrarySource } from '../protocol'
import type { SeatedPlayer, Thumb, Wear } from '../saves'
import { BARE, inColours, wornOver, type WornModels } from '../scene/dress'
import { DressingKids } from '../scene/DressingKids'
import { Meter } from '../scene/Meter'
import { loadPresent, wornModel } from '../scene/presents'
import type { SeatInput } from '../seats/input'
import { COLOUR_NAMES, DRESS, PATTERN_NAMES, SLOT_NAMES } from '../words'
import { ACROSS, act, closetOf, fixFocus, itemsAcross, paintNow, paintsOf, putOn, rowsOf, startColumn, type Act, type Closet, type Column, type Paint, type RowKind } from './dressing/choose'
import { COLOURS, COLOUR_ORDER } from './dressing/colours'
import './dressing/dressing.css'
import { useSeatFrames } from './House'
import { RecipeSketch } from './Hud'
import { faceDress, partyFrom, type HouseRoom } from './play'
import { DEBUG } from './RoomScreen'

/** What one player chose in the dressing room: what they wear now, and the thumb they gave the room (null: none). */
export interface DressChoice {
  readonly wear: Wear
  readonly thumb: Thumb
}

export interface DressingRoomProps {
  /** The page's language (the picked player's); each column speaks its own player's (SeatedPlayer.lang). */
  lang: Lang
  /** The room just played, which each child gives a thumb. */
  room: HouseRoom
  /** The seated players in seat order, each with their saves as they are now: what they own (with the present just got) and wear. */
  players: readonly SeatedPlayer[]
  /** The present each player just got at the end, by seat index (null: none): it is put on as the column opens. */
  given: readonly (string | null)[]
  /** Every present the library has: the names and slots of what they own. */
  gifts: readonly GiftEntry[]
  /** Where a present's file (its guarded model code) is read from. */
  source: LibrarySource
  input: SeatInput
  sounds: Sounds
  /** All are ready: each player's choice, by seat index. The page writes each into that player's saves (saves.ts withWear, withThumb) and goes back to the house. */
  onDone: (choices: readonly DressChoice[]) => void
}

/** How far a stick is pushed before it moves the ring one cell; it must come back under half of it before it moves again. */
const STEP_PUSH = 0.6
/** Milliseconds from the last Ready to the house, so the last child sees their own Ready land; taking a Ready back meanwhile stops it. */
const ALL_READY_MS = 700

/**
 * The dressing room (plan.md, A visit): a column of the screen for each player, in their seat's
 * colour and their own language. In it their own kid dressed as they will be in the next room;
 * the slots they can dress; what the shown slot can hold (nothing, the starting wardrobe's pieces,
 * the presents they own), each drawn in the colours it would be worn in; the main and the second
 * colour of what they wear there from the house's set, and the pattern on its main colour; a thumb up or down for the room just played;
 * and Ready. A seat's stick moves its ring, a chooses and b goes back; a tap chooses at once. When
 * all are ready, each player's wear and thumb go back to the page.
 */
export function DressingRoom({ lang, room, players, given, gifts, source, input, sounds, onDone }: DressingRoomProps) {
  const worn = wornModel
  const closets = useMemo(() => players.map((p) => closetOf(p.face, faceDress(p.face), p.seat.color, p.saves.owned, gifts, players.length)), [players, gifts])
  const [columns, setColumns] = useState<readonly Column[]>(() => players.map((p, i) => startColumn(closets[i]!, p.saves.wear, p.saves.owned, given[i]!)))
  const columnsNow = useRef(columns)
  columnsNow.current = columns
  // A present's model comes from the library once: each one built draws the columns again, so its picture and its colour rows show.
  const [, setBuilt] = useState(0)
  useEffect(() => {
    let gone = false
    for (const p of players)
      for (const id of p.saves.owned)
        loadPresent(source, id).then(
          () => gone || setBuilt((n) => n + 1),
          (err: unknown) => console.warn(`Magic House cannot draw the present ${id} in the dressing room:`, err),
        )
    return () => {
      gone = true
    }
  }, [players, source])

  const doAct = (i: number, what: Act) => {
    const done = act(closets[i]!, columnsNow.current[i]!, worn, what)
    if (done.column === columnsNow.current[i]) return
    const next = columnsNow.current.map((c, j) => (j === i ? done.column : c))
    columnsNow.current = next
    setColumns(next)
    if (done.sound !== null) sounds.play(done.sound)
  }

  // Each seat's stick, pushed or back, so one push moves the ring one cell.
  const pushed = useRef<boolean[]>([])
  const seats = useMemo(() => players.map((p) => p.seat), [players])
  useSeatFrames(input, seats, (frame) =>
    frame.pads.forEach((pad, i) => {
      const [x, y] = pad.stick
      const far = Math.max(Math.abs(x), Math.abs(y))
      if (!pushed.current[i] && far >= STEP_PUSH) {
        pushed.current[i] = true
        doAct(i, { kind: 'move', dir: Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'up' : 'down' })
      } else if (pushed.current[i] && far < STEP_PUSH / 2) pushed.current[i] = false
      if (pad.a.pressed) doAct(i, { kind: 'a' })
      if (pad.b.pressed) doAct(i, { kind: 'b' })
    }),
  )

  // All ready: a moment later, back to the house with every choice.
  const allReady = columns.every((c) => c.ready)
  const finished = useRef(false)
  const done = useRef(onDone)
  done.current = onDone
  useEffect(() => {
    if (!allReady || finished.current) return
    const wait = setTimeout(() => {
      finished.current = true
      done.current(columnsNow.current.map((c) => ({ wear: c.wear, thumb: c.thumb })))
    }, ALL_READY_MS)
    return () => clearTimeout(wait)
  }, [allReady])

  const party = useMemo(() => partyFrom(seats, (s) => players[s.index]!.face, (s) => columns[s.index]!.wear), [seats, players, columns])
  const spots = useRef<(HTMLElement | null)[]>([])

  return (
    <main className={`mh-page dressing seats-${players.length}`}>
      <h2>{inLang(DRESS.title, lang)}</h2>
      <div className="columns">
        {players.map((p, i) => (
          <DressColumn key={p.seat.index} player={p} room={room} closet={closets[i]!} column={columns[i]!} worn={worn} spot={(el) => void (spots.current[i] = el)} onAct={(what) => doAct(i, what)} />
        ))}
      </div>
      <DressingKids party={party} spots={spots} worn={worn} lang={lang}>
        {DEBUG && <Meter name="dressing" />}
      </DressingKids>
    </main>
  )
}

/** The thumb, pointing up; a thumb down is the same turned over. */
function ThumbIcon() {
  return (
    <svg className="thumb-icon" viewBox="0 0 24 24" aria-hidden>
      <path d="M2 21h4V9H2v12zm20-11c0-1.1-.9-2-2-2h-6.3l1-4.6v-.3c0-.4-.2-.8-.4-1.1L13.2 1 6.6 7.6C6.2 7.9 6 8.4 6 9v10c0 1.1.9 2 2 2h9c.8 0 1.5-.5 1.8-1.2l3-7.1c.1-.2.2-.5.2-.7v-2z" />
    </svg>
  )
}

/** Wearing nothing in a slot: an empty ring with a line through it. */
function NothingIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" strokeWidth="2.6" />
      <line x1="6.5" y1="17.5" x2="17.5" y2="6.5" strokeWidth="2.6" />
    </svg>
  )
}

interface ColumnProps {
  player: SeatedPlayer
  room: HouseRoom
  closet: Closet
  column: Column
  worn: WornModels
  spot: (el: HTMLElement | null) => void
  onAct: (what: Act) => void
}

/** One player's column, in their own language. The ring is drawn for a seat that moves it (keys or a gamepad), never on a touch screen, where a finger chooses. */
function DressColumn({ player, room, closet, column, worn, spot, onAct }: ColumnProps) {
  const lang = player.lang
  const rows = rowsOf(closet, column, worn)
  const focus = fixFocus(rows, column.focus)
  const ringOn = player.seat.device.kind !== 'touch'
  const now = wornOver(closet.face, column.wear)
  const here = now[column.slot]
  const cell = (row: RowKind, at: number, chosen: boolean, label: string, inner: ReactNode, style?: CSSProperties) => (
    <button
      key={at}
      className={`cell${chosen ? ' chosen' : ''}${ringOn && focus.row === row && focus.at === at ? ' ringed' : ''}`}
      style={style}
      aria-label={label}
      aria-pressed={chosen}
      disabled={column.ready}
      onClick={() => onAct({ kind: 'tap', row, at })}
    >
      {inner}
    </button>
  )
  const sketch = (id: string, colours: { main: string; second: string }) => {
    const recipe = id === BARE ? null : worn(id)
    return recipe === null ? id === BARE ? <NothingIcon /> : <span className="loading" /> : <RecipeSketch recipe={inColours(recipe, colours)} />
  }
  // What of the worn thing can be painted, and which of it the grid paints now.
  const used = paintsOf(closet, column, worn)
  const which = paintNow(closet, column, worn)
  // With nothing to paint, the paint row and the grid keep their place, unseen, so nothing below them jumps as things are put on.
  const unused = used.length === 0 ? ' unused' : ''
  const paintRow = (
    <div className={`dress-row paints${unused}`} aria-hidden={used.length === 0} style={{ '--across': Math.max(1, used.length) } as CSSProperties}>
      <div className="cells">
        {(used.length > 0 ? used : (['main'] as Paint[])).map((p, at) =>
          cell(
            'paint',
            at,
            p === which,
            inLang(DRESS[p], lang),
            <>
              {p === 'pattern' ? (
                <span className="paint-swatch">
                  <PatternSwatch className="swatch-art" name={patternOf(here!.pattern)} main={here!.main} second={here!.second} />
                </span>
              ) : (
                <span className="paint-swatch" style={{ '--swatch': here === undefined ? '#ffffff' : here[p] } as CSSProperties} />
              )}
              <span className="cell-word">{inLang(DRESS[p], lang)}</span>
            </>,
          ),
        )}
      </div>
    </div>
  )
  // The grid holds the house's colours, or its patterns in the thing's own two colours; it keeps the colours' height either way, so nothing below it jumps.
  const grid = rows.find((r) => r.kind === 'colours')
  const colourGrid = (
    <div
      className={`dress-row colours${which === 'pattern' ? ' patterns' : ''}${unused}`}
      aria-hidden={used.length === 0}
      style={{ '--across': grid === undefined ? closet.coloursAcross : grid.across, '--lines': Math.ceil(COLOUR_ORDER.length / closet.coloursAcross) } as CSSProperties}
    >
      <div className="cells">
        {which === 'pattern'
          ? PATTERN_ORDER.map((name, at) => cell('colours', at, patternOf(here!.pattern) === name, inLang(PATTERN_NAMES[name], lang), <PatternSwatch className="swatch-art" name={name} main={here!.main} second={here!.second} />))
          : COLOUR_ORDER.map((name, at) => cell('colours', at, here !== undefined && which !== null && here[which] === COLOURS[name], inLang(COLOUR_NAMES[name], lang), null, { '--swatch': COLOURS[name] } as CSSProperties))}
      </div>
    </div>
  )

  return (
    <section className={`column dress-column${column.ready ? ' is-ready' : ''}`} style={{ '--seat': player.seat.color } as CSSProperties}>
      <div className="dress-head">
        <span className="column-face">{player.face === null ? <span className="no-face" /> : <AvatarPicture avatar={player.face} className="avatar" />}</span>
        {player.name !== null && <span className="dress-name">{player.name}</span>}
      </div>
      <div className="kid-spot" ref={spot} />
      <div className="dress-row slots" style={{ '--across': closet.slots.length } as CSSProperties}>
        <div className="cells">
          {closet.slots.map((slot: Slot, at) => {
            const w = now[slot]
            return cell('slots', at, slot === column.slot, inLang(SLOT_NAMES[slot], lang), <>{w === undefined ? <NothingIcon /> : sketch(w.id, w)}<span className="cell-word">{inLang(SLOT_NAMES[slot], lang)}</span></>)
          })}
        </div>
      </div>
      <div className="dress-row items" style={{ '--across': itemsAcross(closet.items[column.slot]!.length), '--lines': ACROSS.itemLines } as CSSProperties}>
        <div className="cells">
          {closet.items[column.slot]!.map((item, at) => {
            // Each thing drawn in the colours it would be worn in.
            const would = item.id === BARE ? null : wornOver(closet.face, putOn(closet, column.wear, column.slot, item.id))[column.slot]!
            const chosen = here === undefined ? item.id === BARE : item.id !== BARE && would!.id === here.id
            const label = item.id === BARE ? inLang(DRESS.nothing, lang) : item.gift !== null ? inLang(item.gift.name, lang) : inLang(SLOT_NAMES[column.slot], lang)
            return cell('items', at, chosen, label, would === null ? <NothingIcon /> : sketch(item.id, would))
          })}
        </div>
      </div>
      {paintRow}
      {colourGrid}
      <div className="dress-foot">
        <div className="dress-row thumbs">
          <span className="row-word">
            {inLang(DRESS.liked, lang)} <span className="room-name">{inLang(room.name, lang)}</span>
          </span>
          <div className="cells">
            {cell('thumb', 0, column.thumb === 'up', inLang(DRESS.up, lang), <ThumbIcon />)}
            {cell('thumb', 1, column.thumb === 'down', inLang(DRESS.down, lang), <ThumbIcon />)}
          </div>
        </div>
        <button className={`big-button dress-ready${column.ready ? ' chosen' : ''}${ringOn && focus.row === 'ready' ? ' ringed' : ''}`} aria-pressed={column.ready} onClick={() => onAct({ kind: 'tap', row: 'ready', at: 0 })}>
          {inLang(DRESS.ready, lang)}
        </button>
      </div>
    </section>
  )
}
