import './End.css'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'

import { AvatarPicture } from '../../../profiles/src/Avatar'
import { inLang, type Lang } from '../../../profiles/src/lang'
import type { Sounds } from '../../../silly-billy/src/sounds'
import { buildRoom, RoomRuntime } from '../engine/room'
import { HOUSE_SHELL, type World } from '../engine/world'
import type { GiftEntry, LibrarySource } from '../protocol'
import type { SeatedPlayer } from '../saves'
import { FIREWORKS } from '../scene/fireworks'
import { Fireworks } from '../scene/Fireworks'
import { Meter } from '../scene/Meter'
import { inColours } from '../scene/dress'
import { loadPresent, wornModel } from '../scene/presents'
import { RoomStage, type RoomSource, type ShownView } from '../scene/RoomStage'
import { roomToScreen, screenToRoom, sideView } from '../scene/sideCamera'
import type { SeatInput } from '../seats/input'
import { KEY_ZONES, keyLabel } from '../seats/keys'
import { NO_POINTING, STILL_PAD, type Device, type FrameInput } from '../seats/types'
import { END } from '../words'
import { END_STAGE, endStage, standAt } from './endRoom'
import { endWearing, pickPresents, wearWithPresent, type OpenedPresent } from './gifts'
import { FrameClock, partyFrom, type HouseRoom, type Played } from './play'
import { RecipeSketch } from './Hud'
import { DEBUG } from './RoomScreen'

export interface EndProps {
  /** The page's language (the picked player's). */
  lang: Lang
  /** The room just finished, and how the party played it. */
  room: HouseRoom
  played: Played
  /** The seated players in seat order, each with their own language and their saves as they are now (what they own). */
  players: readonly SeatedPlayer[]
  /** Every present the library has, oldest first: the room's own are those whose room is room.id. */
  gifts: readonly GiftEntry[]
  /** Where a present's file (its guarded model code) is read from. */
  source: LibrarySource
  input: SeatInput
  sounds: Sounds
  /** The end is over: the present each player got, by seat index (a GiftEntry.id, or null when there was none to give). The page writes each into that player's saves (saves.ts withPresent) and goes to the dressing room. */
  onDone: (presents: readonly (string | null)[]) => void
}

/**
 * How the end goes, seconds: Next comes `settle` after the way out opens (once the last present is
 * open, so the press that opened it does not skip the end), or `anyway` after the end began even
 * if a present is still wrapped (a child who walked away never holds the others up: the present is
 * theirs all the same). The first `pops` bursts of the fireworks each make a soft pop, then they
 * go on quietly. When the presents' models have not loaded after `choose` (a hosted build on a bad
 * connection), the party goes on to the dressing room with none rather than waiting for ever.
 */
export const END_TIMES = { settle: 1.2, anyway: 20, pops: 4, choose: 10 } as const

/** How tall the band of cards under the stage is, CSS pixels. */
function cardBand(height: number): number {
  return Math.round(Math.min(230, Math.max(140, 0.27 * height)))
}

/** The font size, CSS pixels, at which the longest word of `text` fits across a card `width` wide (a long Finnish word such as Merirosvohattu), at most `most`. */
function fitting(text: string, width: number, most: number): number {
  const longest = Math.max(...text.split(/\s+/).map((w) => w.length))
  return Math.max(12, Math.min(most, (width - 28) / (0.62 * longest)))
}

/** What a seat presses to open its present, as its card shows it: its a key, A on a gamepad, nothing for touch (the card is tapped). */
function pressWith(device: Device): string | null {
  if (device.kind === 'keys') return keyLabel(KEY_ZONES[device.zone].a)
  if (device.kind === 'gamepad') return 'A'
  return null
}

/** What each seat's present is (pickPresents), once every chosen present's model has loaded and built; a present that will not is left out and the choice made again. */
async function choosePresents(room: string, players: readonly SeatedPlayer[], gifts: readonly GiftEntry[], source: LibrarySource): Promise<(string | null)[]> {
  const broken = new Set<string>()
  for (;;) {
    const picks = pickPresents(room, players, gifts, broken)
    const failed = await Promise.all(
      picks.map((id) =>
        id === null
          ? null
          : loadPresent(source, id).then(
              () => null,
              (err: unknown) => {
                console.error(`Magic House leaves out the present ${id}: its model would not load or build.`, err)
                return id
              },
            ),
      ),
    )
    const bad = failed.filter((id): id is string => id !== null)
    if (bad.length === 0) return picks
    for (const id of bad) broken.add(id)
  }
}

/**
 * The end of a room (plan.md, A visit: the way out opens, fireworks go up, and each player opens a
 * present). The presents are chosen first (a moment, while their models load and build), then the
 * party stands on the end's stage (Presents).
 */
export function End(props: EndProps) {
  const { lang, room, players, gifts, source } = props
  const [picks, setPicks] = useState<(string | null)[] | null>(null)
  const done = useRef(props.onDone)
  done.current = props.onDone
  // Chosen once, when their models are ready: a library told of afresh meanwhile does not change what is in the boxes. Never trapped: past END_TIMES.choose, or when choosing fails, on with no presents.
  useEffect(() => {
    let settled = false
    const without = () => {
      if (settled) return
      settled = true
      done.current(players.map(() => null))
    }
    const late = setTimeout(() => {
      console.warn(`Magic House goes on without presents: they were not ready in ${END_TIMES.choose} s.`)
      without()
    }, END_TIMES.choose * 1000)
    choosePresents(room.id, players, gifts, source)
      .then((chosen) => {
        if (settled) return
        settled = true
        setPicks(chosen)
      })
      .catch((err: unknown) => {
        console.error('Magic House could not choose the presents:', err)
        without()
      })
      .finally(() => clearTimeout(late))
    return () => {
      settled = true
      clearTimeout(late)
    }
  }, [])
  if (picks === null)
    return (
      <main className="mh-page end">
        <h1>{inLang(END.title, lang)}</h1>
      </main>
    )
  return <Presents {...props} picks={picks} />
}

/**
 * The party on the end's stage (endRoom.ts) under the house's fireworks, each kid beside their
 * present wrapped in their seat's colour, with a card under them in their own language. A player
 * opens theirs with their seat's a or b, a tap on their card or on their kid: it bursts open and
 * their kid wears it at once, in their seat's colour (gifts.ts endWearing), and the card says its
 * name. A player who owns every present is told so kindly. When all are open the way out swings
 * open, and Next (a tap, or any seat's press) goes on to the dressing room with the present each
 * player got.
 */
function Presents({ lang, room, players, gifts, input, sounds, onDone, picks }: EndProps & { picks: readonly (string | null)[] }) {
  const [opened, setOpened] = useState<readonly boolean[]>(() => picks.map((id) => id === null))
  const [canGo, setCanGo] = useState(false)
  const [size, setSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }))
  const seats = useMemo(() => players.map((p) => p.seat), [players])
  // The stage is built once for the end: the party does not change while it is up.
  const stage = useMemo(() => {
    const s = endStage(picks.map((id) => id !== null))
    const party = partyFrom(
      seats,
      (seat) => players[seat.index].face,
      (seat) => players[seat.index].saves.wear,
    )
    return { open: s.open, room: buildRoom(s.code, { seed: 1, level: 1, kind: 'together', view: 'side', shell: HOUSE_SHELL, party }, new RoomRuntime()) }
  }, [])
  // What each seat wears on the stage over what they wore in the room: their present once opened. The stage draws a copy of the world with it on, never changing the sim's own.
  const shownWear = useRef<(OpenedPresent | null)[]>(players.map(() => null))
  const stageSource = useMemo<RoomSource>(() => {
    let seen: { frame: number; key: string; world: World } | null = null
    return {
      get world() {
        const w = stage.room.world
        const key = shownWear.current.map((o) => (o === null ? '' : o.wearing.id)).join('|')
        if (seen === null || seen.frame !== w.frame || seen.key !== key) {
          const dressed = { ...w, players: w.players.map((p, i) => (shownWear.current[i] === null ? p : { ...p, wear: wearWithPresent(p.wear, shownWear.current[i]) })) }
          seen = { frame: w.frame, key, world: dressed }
        }
        return seen.world
      },
    }
  }, [stage])
  const shown = useMemo<ShownView>(() => ({ view: null, high: null }), [])
  const band = cardBand(size.height)

  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight })
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  const latest = useRef({ opened, canGo })
  latest.current = { opened, canGo }
  const done = useRef(false)

  const next = () => {
    if (done.current) return
    done.current = true
    onDone(picks)
  }

  const open = (seat: number) => {
    const id = picks[seat]
    if (id === null || latest.current.opened[seat]) return
    const entry = gifts.find((g) => g.id === id)
    if (entry === undefined) throw new Error(`the present ${id} chosen for seat ${seat} is not in the library`)
    shownWear.current[seat] = { slot: entry.slot, wearing: endWearing(id, seats[seat].color) }
    stage.open(seat)
    sounds.play('magic')
    latest.current = { ...latest.current, opened: latest.current.opened.map((v, i) => v || i === seat) }
    setOpened((o) => o.map((v, i) => v || i === seat))
  }

  // The stage's own clock, the soft pops of the first bursts, the cheer when the way out opens, and each seat's presses.
  useEffect(() => {
    const clock = new FrameClock()
    const devices = seats.map((s) => s.device)
    const still: FrameInput = { pads: seats.map(() => STILL_PAD), pointing: NO_POINTING, help: false }
    const began = performance.now()
    let last = began
    let popped = 0
    let cheered = false
    input.frame(devices)
    let raf = 0
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick)
      const frames = clock.advance(Math.max(0, (time - last) / 1000))
      last = time
      for (let i = 0; i < frames; i++) stage.room.step(still)
      const w = stage.room.world
      if (popped < END_TIMES.pops && w.t >= FIREWORKS.first + popped * FIREWORKS.every + FIREWORKS.rise) {
        popped += 1
        sounds.play('pop')
      }
      if (w.end !== null && !cheered) {
        cheered = true
        sounds.play('yay')
      }
      const go = (w.end !== null && w.t - w.end.at >= END_TIMES.settle) || time - began >= END_TIMES.anyway * 1000
      if (go !== latest.current.canGo) setCanGo(go)
      input.frame(devices).pads.forEach((pad, seat) => {
        if (!pad.a.pressed && !pad.b.pressed) return
        if (!latest.current.opened[seat]) open(seat)
        else if (go) next()
      })
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [stage, seats, input, sounds])

  // Where each kid stands on the screen, for its card under it: the stage's frame stands still, so it is worked out from the screen's size.
  const view = sideView(stage.room.world.camera, { width: size.width, height: size.height, clearBottom: band, clearTop: 0 }, [0, 0])
  const cardWidth = Math.round(Math.min(250, 0.94 * END_STAGE.gap * view.scale, size.width - 16))

  /** A tap on the stage opens the present of the kid nearest across. */
  const tapStage = (e: PointerEvent) => {
    const x = screenToRoom(shown.view ?? view, e.clientX, e.clientY)[0]
    const far = (i: number) => Math.abs(standAt(i, players.length)[0] - x)
    open(players.reduce((best, _, i) => (far(i) < far(best) ? i : best), 0))
  }

  return (
    <>
      <div className="room-surface" onPointerDown={tapStage}>
        <RoomStage source={stageSource} lang={lang} clearBottom={band} clearTop={0} worn={wornModel} shown={shown} house look={null}>
          <Fireworks source={stageSource} since={fromTheStart} />
          {DEBUG && <Meter name={`end:${room.id}`} />}
        </RoomStage>
      </div>
      <h1 className="end-title">{inLang(END.title, lang)}</h1>
      <div className="end-cards" style={{ height: band }}>
        {players.map((p, i) => {
          const [x] = roomToScreen(view, standAt(i, players.length)[0], 0)
          const id = picks[i]
          const entry = id === null ? null : gifts.find((g) => g.id === id)!
          const key = pressWith(p.seat.device)
          return (
            <button key={i} className={`end-card${opened[i] ? ' opened' : ''}`} style={{ '--seat': p.seat.color, left: x - cardWidth / 2, width: cardWidth } as CSSProperties} onClick={() => open(i)}>
              <span className="end-face">{p.face === null ? <span className="no-face" /> : <AvatarPicture avatar={p.face} className="avatar" />}</span>
              {entry === null ? (
                <span className="end-word kind" style={{ fontSize: fitting(inLang(END.allOwned, p.lang), cardWidth, 26) }}>
                  {inLang(END.allOwned, p.lang)}
                </span>
              ) : opened[i] ? (
                <>
                  <PresentPicture id={entry.id} seatColour={p.seat.color} />
                  <span className="end-word name" style={{ fontSize: fitting(inLang(entry.name, p.lang), cardWidth, 26) }}>
                    {inLang(entry.name, p.lang)}
                  </span>
                </>
              ) : (
                <>
                  <span className="end-box" aria-hidden />
                  <span className="end-word">
                    {inLang(END.open, p.lang)}
                    {key !== null && <kbd className="end-key">{key}</kbd>}
                  </span>
                </>
              )}
            </button>
          )
        })}
      </div>
      {canGo && (
        <button className="big-button end-next" onClick={next}>
          {inLang(END.next, lang)}
        </button>
      )}
    </>
  )
}

/** An opened present on its card, drawn flat in the colours its kid wears it in (gifts.ts endWearing), so a child who cannot read sees what they got; its name is the caption under it. Its model was built before the end began (choosePresents). */
function PresentPicture({ id, seatColour }: { id: string; seatColour: string }) {
  const recipe = wornModel(id)
  if (recipe === null) throw new Error(`the present ${id} is opened before its model is built`)
  return (
    <span className="end-picture">
      <RecipeSketch recipe={inColours(recipe, endWearing(id, seatColour))} />
    </span>
  )
}

/** On the end's stage the fireworks go up from the start. */
const fromTheStart = (w: World) => w.t
