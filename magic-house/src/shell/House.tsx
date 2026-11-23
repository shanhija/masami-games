import { useEffect, useRef, useState, type CSSProperties } from 'react'

import type { Avatar } from '../../../profiles/src/avatar'
import { AvatarPicture } from '../../../profiles/src/Avatar'
import { inLang, type Lang } from '../../../profiles/src/lang'
import { palette } from '../../../silly-billy/src/scene/look'
import type { SeatInput } from '../seats/input'
import type { FrameInput, Pad, Seat } from '../seats/types'
import { HOUSE, NAME, NEW_DOOR } from '../words'
import { barAt, type HouseDoor, type NewDoor } from './newDoor'
import { SEAT_SETTLE_MS } from './WhoPlays'

/** How long the house says no new room is coming, after the wait gives up, ms. */
export const NOTE_MS = 5000

/** The doors' paint, one after another along the hall. */
const DOOR_COLOURS = [palette.blooms[0], palette.blooms[3], '#3d8bff', '#2fc46a', palette.blooms[1], '#ff8a3d'] as const
/** How far a stick is pushed before it steps to the next door; it must come back under half of it before it steps again. */
const STEP_PUSH = 0.6

interface HouseProps {
  lang: Lang
  /** The plain doors: the party's own room and every kept room of its size, less the one the new door opens. */
  rooms: readonly HouseDoor[]
  /** The rooms any of these players has played, or walked into this visit: their doors wear a star. */
  played: ReadonlySet<string>
  newDoor: NewDoor
  seats: readonly Seat[]
  faces: readonly (Avatar | null)[]
  input: SeatInput
  onOpen: (id: string) => void
  /** The party comes from a wait that gave up (nothing more is coming): the house says so kindly for NOTE_MS. */
  nothingNew: boolean
  /** The new door was opened: its room when ready, else the wait for it. */
  onNew: () => void
  onPlayers: () => void
}

/**
 * Reads the seats' pads every screen frame while a screen of the house is up, and hands each frame
 * to `onFrame` (the latest one given, so it may close over the screen's state). The presses that
 * brought the party to the screen are thrown away first: they are not presses on it.
 */
export function useSeatFrames(input: SeatInput, seats: readonly Seat[], onFrame: (frame: FrameInput) => void): void {
  const latest = useRef(onFrame)
  latest.current = onFrame
  useEffect(() => {
    const devices = seats.map((s) => s.device)
    input.frame(devices)
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      latest.current(input.frame(devices))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [input, seats])
}

/**
 * Each pad's step of its stick along one axis in this frame (0 across, 1 up): -1 to the left or
 * up, 1 to the right or down, so a step is always on to the next thing in reading order; else 0.
 * One push is one step: the stick must come back under half of STEP_PUSH before it steps again,
 * which `pushed` (kept by the caller from frame to frame, one for each pad and axis) remembers.
 */
export function stickSteps(pads: readonly Pad[], axis: 0 | 1, pushed: boolean[]): (-1 | 0 | 1)[] {
  return pads.map((pad, i) => {
    const v = axis === 0 ? pad.stick[0] : -pad.stick[1]
    if (!pushed[i] && Math.abs(v) >= STEP_PUSH) {
      pushed[i] = true
      return v > 0 ? 1 : -1
    }
    if (pushed[i] && Math.abs(v) < STEP_PUSH / 2) pushed[i] = false
    return 0
  })
}

/**
 * The house (plan.md, A visit): the glowing door for a new room first, then a door for every room
 * made for a party of this size (their own room and every kept room), each with its name, in rows
 * along the hall. The new door shows the room's name and a sparkle when its room is ready, and a
 * bar filling against the time a room nearly always takes while it is being made. A door these
 * players have played wears a gold star, so they can tell the rooms they know from the ones they
 * do not; any of them can be played again. A tap or a click opens a door; so does a seat's own
 * pad, its stick walking a ring from door to door and either button opening the ringed one. When
 * the doors fill more than the screen, the hall scrolls and keeps the ringed door in sight. The
 * party's faces sit at the top with the way back to who plays.
 *
 * The seats' buttons count only SEAT_SETTLE_MS after the house comes up, as on who plays: children
 * still pressing to answer the quiz, or to say Ready, do not walk into a room nobody chose. When
 * the wait behind the new door gave up, a line says no new room is coming this time.
 */
export function House({ lang, rooms, played, newDoor, seats, faces, input, onOpen, nothingNew, onNew, onPlayers }: HouseProps) {
  const [ringed, setRinged] = useState(0)
  const [since] = useState(() => performance.now())
  const [note, setNote] = useState(nothingNew)
  useEffect(() => {
    if (!note) return
    const hide = setTimeout(() => setNote(false), NOTE_MS)
    return () => clearTimeout(hide)
  }, [note])
  // Every door in the row, the new one first: what a press opens.
  const opens = [...(newDoor.kind === 'none' ? [] : [onNew]), ...rooms.map((r) => () => onOpen(r.id))]
  // Each seat's stick, pushed or back, so one push steps one door.
  const pushed = useRef<boolean[]>([])
  const hall = useRef<HTMLDivElement>(null)

  useSeatFrames(input, seats, (frame) => {
    if (opens.length === 0) return
    const to = stickSteps(frame.pads, 0, pushed.current).reduce<number>((at, step) => (at + step + opens.length) % opens.length, Math.min(ringed, opens.length - 1))
    if (to !== ringed) setRinged(to)
    if (performance.now() - since >= SEAT_SETTLE_MS && frame.pads.some((pad) => pad.a.pressed || pad.b.pressed)) opens[to]!()
  })

  // The ringed door stays in sight as the stick walks the hall.
  useEffect(() => {
    if (hall.current === null) return
    const door = hall.current.children[ringed]
    if (door instanceof HTMLElement) door.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [ringed])

  return (
    <main className="mh-page house">
      <div className="house-top">
        <div className="party">
          {seats.map((seat) => {
            const face = faces[seat.index]
            return (
              <span key={seat.index} className="party-face" style={{ '--seat': seat.color } as CSSProperties}>
                {face === null ? <span className="no-face" /> : <AvatarPicture avatar={face} className="avatar" />}
              </span>
            )
          })}
        </div>
        <button className="small-button" onClick={onPlayers}>
          {inLang(HOUSE.players, lang)}
        </button>
      </div>
      <h1>{inLang(NAME, lang)}</h1>
      {note && (
        <p className="house-note" role="status">
          {inLang(HOUSE.noNewRoom, lang)}
        </p>
      )}
      {opens.length === 0 ? (
        <p className="no-doors">{inLang(HOUSE.noDoors, lang)}</p>
      ) : (
        <div className="doors" ref={hall}>
          {newDoor.kind !== 'none' && <NewDoorView lang={lang} door={newDoor} ringed={ringed === 0} onOpen={onNew} />}
          {rooms.map((room, j) => {
            const i = j + opens.length - rooms.length
            return (
              <button key={room.id} className={`door${i === ringed ? ' ringed' : ''}`} style={{ '--door': DOOR_COLOURS[j % DOOR_COLOURS.length] } as CSSProperties} onClick={() => onOpen(room.id)}>
                <span className="door-leaf">
                  <span className="door-knob" />
                  {played.has(room.id) && <span className="door-star" role="img" aria-label={inLang(HOUSE.played, lang)} />}
                </span>
                <span className="door-name">{inLang(room.name, lang)}</span>
              </button>
            )
          })}
        </div>
      )}
    </main>
  )
}

/** The bar of a room being made: it fills toward BAR_MOST by the server's clock, never going back over a drop (newDoor.ts barAt), drawn by the stylesheet so nothing re-renders while it fills. */
export function WaitBar({ door }: { door: Extract<NewDoor, { kind: 'waiting' }> }) {
  return (
    <span className="wait-bar">
      <WaitFill key={door.room.line} door={door} />
    </span>
  )
}

/** The bar's fill for one room, worked out once as it mounts: every word from the server draws the door again, and new values under a running animation would jump it ahead. */
function WaitFill({ door }: { door: Extract<NewDoor, { kind: 'waiting' }> }) {
  const [{ fill, left }] = useState(() => barAt(door.run, door.readySecs, Date.now() + door.skewMs))
  return <span className="wait-fill" style={{ '--from': fill, '--secs': `${left}s` } as CSSProperties} />
}

/** The glowing door for a new room: gold, sparkling and named when its room is ready; while it is made, shut with its bar under a word that it is coming. */
function NewDoorView({ lang, door, ringed, onOpen }: { lang: Lang; door: Exclude<NewDoor, { kind: 'none' }>; ringed: boolean; onOpen: () => void }) {
  return (
    <button className={`door new-door ${door.kind === 'ready' ? 'open' : 'making'}${ringed ? ' ringed' : ''}`} style={{ '--door': palette.blooms[1] } as CSSProperties} onClick={onOpen}>
      <span className="door-leaf">
        <span className="door-knob" />
        <span className="sparkle" />
      </span>
      {door.kind === 'ready' ? (
        <span className="door-name">
          <span className="new-word">{inLang(NEW_DOOR.fresh, lang)}</span> {inLang(door.room.name, lang)}
        </span>
      ) : (
        <span className="door-name">
          {inLang(NEW_DOOR.coming, lang)}
          <WaitBar door={door} />
        </span>
      )}
    </button>
  )
}
