import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Lang } from '../../../profiles/src/lang'
import type { Level } from '../engine/api'
import type { Room } from '../engine/room'
import type { World } from '../engine/world'
import { onTold } from '../library/api'
import { keptRoom, type HouseLink } from '../library/source'
import { PageTrials, POLL_MS } from '../library/trials'
import type { Line, LibraryIndex, TrialReport } from '../protocol'
import { afterRoom, changeSaves, foldParty, partyLevel, readSaves, roomResult, seatedPlayers, withDevice, withPresent, withQuiz, withThumb, withWear, type DevicePlayer, type HouseSaves, type RoomResult } from '../saves'
import { loadPresent } from '../scene/presents'
import { SeatInput } from '../seats/input'
import type { PartySize, Seat, SeatIndex } from '../seats/types'
import { tryGifts, tryLook, tryOwn, tryRoom } from '../trial/tryRoom'
import { autoplayFromUrl, type AutoplayMode, type BotsShown } from './autoplay'
import { DressingRoom, type DressChoice } from './DressingRoom'
import { End } from './End'
import { House } from './House'
import { HouseSounds } from './houseSounds'
import { afterWait, askNow, heard, houseDoors, lookWaitEnds, newDoor, roomRequest, withRoom, type DoorFacts, type HeardLine, type NewDoor } from './newDoor'
import { playLog, seatsFromUrl, type HouseRoom, type Played } from './play'
import { DEBUG, RoomScreen, type LiveRoom } from './RoomScreen'
import { unlockSpeech } from './speech'
import { Waiting } from './Waiting'
import { WhoPlays } from './WhoPlays'

/**
 * Where the page is: who plays, the house, a kept room being fetched and compiled, the wait behind
 * the new door, a room (at the party's level at its door), the end of a finished room with its
 * presents, or the dressing room after it. The end and the dressing room carry the room, how it was
 * played and when it ended (the key of its result in each player's saves).
 */
type Screen =
  | { at: 'seats' }
  | { at: 'house' }
  | { at: 'opening'; id: string }
  | { at: 'waiting' }
  | { at: 'room'; room: HouseRoom; level: Level }
  | { at: 'end'; room: HouseRoom; played: Played; ended: string }
  | { at: 'dressing'; room: HouseRoom; played: Played; ended: string; given: readonly (string | null)[] }

/**
 * What the page's dev handle shows (only on the dev server with ?debug, never in the build): where
 * the page is, the room's id, its World and the Room being played; the new door's kind; the party's
 * level as the saves give it; under ?autoplay what the bots gave for the last sim frame (so a script
 * can turn the pads into real keys and touches under ?autoplay=devices); and a trial of an own room
 * in the worker, ended after killMs, to measure the page's frame time while the worker works.
 */
export interface DebugHandle {
  screen: Screen['at']
  room: string | null
  door: NewDoor['kind'] | null
  level: Level | null
  world: () => World | null
  played: () => Room | null
  bots: () => BotsShown | null
  tryOwn: (id: string, killMs: number) => Promise<TrialReport>
}

declare global {
  interface Window {
    magicHouse?: DebugHandle
  }
}

const EMPTY_INDEX: LibraryIndex = { rooms: [], gifts: [] }
/** The rooms played when nobody is seated. */
const NOBODY_PLAYED: ReadonlySet<string> = new Set()

/**
 * Where the page starts: a room at once when the URL names one (?room=<id>, its seats by
 * ?seats=keys0,touch1 or the key zones from 0), else who plays; whether every room is autoplayed
 * (?autoplay, shell/autoplay.ts); and the level a developer asked for (?level=1|2|3), which then
 * stands for the party's level in every room. A kept room is fetched first, and its seats are taken
 * once its party size is known.
 */
function firstScreen(own: readonly HouseRoom[], players: readonly DevicePlayer[], levelOf: (seats: readonly Seat[]) => Level): { screen: Screen; seats: Seat[]; level: Level | null; autoplay: AutoplayMode | null } {
  const query = new URLSearchParams(location.search)
  const autoplay = autoplayFromUrl(query)
  const id = query.get('room')
  const asked = query.get('level')
  const level = asked === null ? null : Number(asked)
  if (level !== null && level !== 1 && level !== 2 && level !== 3) throw new Error(`?level=${asked} is not a level: give 1, 2 or 3`)
  if (id === null) return { screen: { at: 'seats' }, seats: [], level, autoplay }
  const room = own.find((r) => r.id === id)
  if (room === undefined) return { screen: { at: 'opening', id }, seats: [], level, autoplay }
  const seats = seatsFromUrl(query.get('seats'), room.party, players.map((p) => p.profile))
  return { screen: { at: 'room', room, level: level ?? levelOf(seats) }, seats, level, autoplay }
}

/**
 * The game (plan.md, A visit): who plays, then the house with the glowing door for a new room and
 * a door for each room made for this many players (the party's own room and the kept rooms of the
 * library), then the room; at the end of a finished room the end with its presents and the dressing
 * room, then back to the house; a room left by the pause card goes straight back. One SeatInput
 * listens to every device for the whole visit, and the house's sounds (houseSounds.ts) wake on the first touch or key.
 *
 * Each player's saves are read once (saves.ts) and written at once after every change: the device
 * each sat at when they go to the house, each room's result with their own level moved after it,
 * the presents they got, what they wear and their thumb, and their quiz levels. The party plays every
 * room at its level as the seated players' saves give it (?level stands for it for a developer).
 *
 * On the dev server the page also has the line of rooms: it asks for the next room when none of the
 * party's size is ready or in the making (shell/newDoor.ts), with how the party played its last rooms
 * as the saves have it, tries whatever waits for a trial in its worker (library/trials.ts), and logs
 * each room played (POST /play; a finished room once its thumbs are given). On the hosted build, or
 * with no CLI, the new door only opens kept rooms these players have not played.
 */
export function Game({ lang, players, own, link }: { lang: Lang; players: readonly DevicePlayer[]; own: readonly HouseRoom[]; link: HouseLink }) {
  // Each player's saves as read, by profile: what the folds read; written through `write` only.
  const [book, setBook] = useState<ReadonlyMap<string | null, HouseSaves>>(() => new Map(players.map((p) => [p.profile, readSaves(p.saves)])))
  const bookNow = useRef(book)
  bookNow.current = book
  const levelOf = useCallback((sat: readonly Seat[]) => partyLevel(seatedPlayers(sat, players, bookNow.current).map((p) => p.saves)), [players])
  const [first] = useState(() => firstScreen(own, players, levelOf))
  const [screen, setScreen] = useState<Screen>(first.screen)
  const [seats, setSeats] = useState<readonly Seat[]>(first.seats)
  const [input] = useState(() => new SeatInput())
  const [sounds] = useState(() => new HouseSounds())
  const [live] = useState<LiveRoom>(() => ({ room: null, autoplay: null }))
  const [index, setIndex] = useState<LibraryIndex>(EMPTY_INDEX)
  const [line, setLine] = useState<HeardLine | null>(null)
  // The rooms walked into this visit, beside those the saves say were played: a room opened straight from the URL counts, so the new door does not offer it after.
  const [walked, setWalked] = useState<ReadonlySet<string>>(() => new Set(first.screen.at === 'opening' ? [first.screen.id] : first.screen.at === 'room' ? [first.screen.room.id] : []))
  // The visit began at who plays, or the party has since stood in the house: a room opened straight from the URL (?room) asks for nothing until then.
  const [housed, setHoused] = useState(first.screen.at === 'seats')
  const asking = useRef(false)
  // The wait behind the new door gave up (nothing more is coming): the house says so for a moment; never after a party chose to go back.
  const [nothingNew, setNothingNew] = useState(false)
  const { api, source } = link

  useEffect(() => input.start(), [input])
  // Sounds wake on the first touch or key, and so does speech, once: iOS says the helper's own hints later only after a first speak inside a touch.
  useEffect(() => {
    let spoken = false
    const unlock = () => {
      sounds.unlock()
      if (spoken) return
      spoken = true
      unlockSpeech()
    }
    window.addEventListener('pointerdown', unlock, true)
    window.addEventListener('keydown', unlock, true)
    return () => {
      window.removeEventListener('pointerdown', unlock, true)
      window.removeEventListener('keydown', unlock, true)
    }
  }, [sounds])

  // The library, and whatever the server says of it after.
  useEffect(() => {
    source
      .index()
      .then(setIndex)
      .catch((err: unknown) => console.error('Magic House could not read its library:', err))
    return onTold('magic-house:library', setIndex)
  }, [source])

  // The line of rooms, where a CLI can make them; and the trials this page takes for every page.
  useEffect(() => {
    if (api === null) return
    let gone = false
    const stops: (() => void)[] = []
    const hear = (said: Line) => setLine((before) => heard(before, said, Date.now()))
    api
      .get('GET /status', null)
      .then(async (status) => {
        if (!status.claude || gone) return
        const now = await api.get('GET /line', null)
        if (gone) return
        hear(now)
        stops.push(onTold('magic-house:line', hear))
      })
      .catch((err: unknown) => console.error('Magic House could not reach its dev server:', err))
    const trials = new PageTrials(api, { room: tryRoom, look: tryLook, gifts: tryGifts })
    const look = () => void trials.look()
    look()
    const poll = setInterval(look, POLL_MS)
    stops.push(onTold('magic-house:line', look), onTold('magic-house:library', look), () => clearInterval(poll))
    return () => {
      gone = true
      for (const stop of stops) stop()
    }
  }, [api])

  /** Changes one player's saves, writes them at once and keeps them for the folds. */
  const write = useCallback(
    (profile: string | null, change: (now: HouseSaves) => HouseSaves) => {
      const player = players.find((p) => p.profile === profile)
      if (player === undefined) throw new Error(`${profile} is not a player of this device`)
      const next = changeSaves(player.saves, change)
      setBook((now) => new Map(now).set(profile, next))
    },
    [players],
  )

  const seated = useMemo(() => seatedPlayers(seats, players, book), [seats, players, book])
  const fold = useMemo(() => (seated.length === 0 ? null : foldParty(seated.map((p) => p.saves), index.rooms)), [seated, index])
  // The level of the next room: a developer's ?level, else the party's own.
  const level = first.level ?? (fold === null ? null : fold.level)
  const party = seats.length === 0 ? null : (seats.length as PartySize)
  // A room kept while its look is made is waited for until the server says so or LOOK_WAIT is past: the door is worked out again at that moment.
  const [clockTick, setClockTick] = useState(0)
  useEffect(() => {
    if (line === null) return
    const now = Date.now() + line.skewMs
    const end = lookWaitEnds(line.line, now)
    if (end === null) return
    const timer = setTimeout(() => setClockTick((n) => n + 1), end - now + 50)
    return () => clearTimeout(timer)
  }, [line, clockTick])
  const facts = useMemo<DoorFacts | null>(() => (party === null || fold === null ? null : { party, index, heard: line, played: new Set([...fold.played, ...walked]), serverNow: Date.now() + (line === null ? 0 : line.skewMs) }), [party, fold, index, line, walked, clockTick])
  const door = useMemo<NewDoor>(() => (facts === null ? { kind: 'none' } : newDoor(facts)), [facts])

  // The next room is asked for once none of the party's size is ready or in the making, with how the party played its last rooms.
  useEffect(() => {
    if (api === null || facts === null || fold === null || level === null || !housed || screen.at === 'seats' || asking.current || !askNow(facts)) return
    asking.current = true
    api
      .post('POST /rooms', roomRequest(facts.party, level, seats.map((s) => s.device.kind), fold.history, Math.random))
      .then((room) => setLine((now) => (now === null ? now : withRoom(now, room))))
      .catch((err: unknown) => {
        console.error('Magic House could not ask for a new room:', err)
        // Nothing is coming: a party waiting behind the new door goes back to the house, which says so.
        setScreen((now) => {
          if (now.at !== 'waiting') return now
          setNothingNew(true)
          return { at: 'house' }
        })
      })
      .finally(() => void (asking.current = false))
  }, [api, facts, fold, level, housed, screen.at, seats])

  // A kept room is fetched and compiled, then played; its seats come from the URL when it was opened from there.
  useEffect(() => {
    if (screen.at !== 'opening') return
    let gone = false
    source
      .room(screen.id)
      .then((file) => {
        if (gone) return
        const room = keptRoom(file)
        const sat = seats.length > 0 ? seats : seatsFromUrl(new URLSearchParams(location.search).get('seats'), room.party, players.map((p) => p.profile))
        if (sat.length !== room.party) throw new Error(`the room ${room.id} is made for ${room.party} players and ${sat.length} sit here`)
        setSeats(sat)
        setScreen({ at: 'room', room, level: first.level ?? levelOf(sat) })
      })
      .catch((err: unknown) => {
        console.error(`Magic House could not open the room ${screen.id}:`, err)
        if (!gone) setScreen(seats.length > 0 ? { at: 'house' } : { at: 'seats' })
      })
    return () => {
      gone = true
    }
  }, [screen, source, seats, players, first.level, levelOf])

  const open = useCallback(
    (id: string) => {
      setWalked((now) => new Set(now).add(id))
      const mine = own.find((r) => r.id === id)
      setScreen(mine === undefined ? { at: 'opening', id } : { at: 'room', room: mine, level: first.level ?? levelOf(seats) })
    },
    [own, first.level, levelOf, seats],
  )
  const openNew = useCallback(() => (door.kind === 'ready' ? open(door.room.id) : setScreen({ at: 'waiting' })), [door, open])

  // Behind the new door: the party goes back to the house when nothing more is coming; a room that is ready the wait opens itself (Waiting's onOpen).
  const waitNext = screen.at === 'waiting' && facts !== null ? afterWait(facts) : null
  useEffect(() => {
    if (waitNext !== 'house') return
    setNothingNew(true)
    setScreen({ at: 'house' })
  }, [waitNext])
  useEffect(() => {
    if (screen.at !== 'house') setNothingNew(false)
  }, [screen.at])

  // The dev handle for headless checks: the dev server only, and only with ?debug.
  useEffect(() => {
    if (DEBUG)
      window.magicHouse = {
        screen: screen.at,
        room: screen.at === 'room' ? screen.room.id : null,
        door: facts === null ? null : door.kind,
        level,
        world: () => (live.room === null ? null : live.room.world),
        played: () => live.room,
        bots: () => (live.autoplay === null ? null : live.autoplay.shown),
        tryOwn,
      }
  }, [screen, live, door, facts, level])

  const faces = useMemo(() => seated.map((p) => p.face), [seated])
  const wear = useMemo(() => seated.map((p) => p.saves.wear), [seated])
  // What the party wears from the library is fetched and built, so every screen that draws them finds it (scene/presents.ts wornModel).
  useEffect(() => {
    for (const w of wear)
      for (const thing of Object.values(w))
        if (!thing.id.startsWith('own:')) loadPresent(source, thing.id).catch((err: unknown) => console.warn(`Magic House cannot draw the present ${thing.id}:`, err))
  }, [wear, source])
  const kept = useMemo(() => players.map((p) => book.get(p.profile)!.device), [players, book])
  const doors = useMemo(() => (party === null ? [] : houseDoors(own, index, party, door)), [own, index, party, door])
  const toHouse = useCallback(() => {
    setHoused(true)
    setScreen({ at: 'house' })
  }, [])

  // A room the bots played (?autoplay) is no play of the children's: its result is kept in the saves, marked, but it is neither logged nor told to Opus as how they played.
  const logPlay = (room: HouseRoom, played: Played, ended: string, thumbs: readonly RoomResult['thumb'][]) => {
    if (api !== null && first.autoplay === null) api.post('POST /play', playLog(room, played, ended, thumbs)).catch((err: unknown) => console.warn('Magic House could not log a room played:', err))
  }

  // The room's result goes into every seated player's saves at once, their own level moved by it; a finished room goes on to the end, a left one back to the house.
  const roomEnded = (room: HouseRoom, doorLevel: Level, played: Played | null) => {
    if (played === null) return toHouse()
    const ended = new Date().toISOString()
    const { result, move } = roomResult(room, played, ended, doorLevel, { autoplay: first.autoplay !== null, devLevel: first.level !== null })
    for (const seat of seats) write(seat.profile, (now) => afterRoom(now, result, move))
    if (played.end === 'left') {
      logPlay(room, played, ended, seats.map(() => null))
      toHouse()
    } else setScreen({ at: 'end', room, played, ended })
  }

  const presentsGiven = (room: HouseRoom, played: Played, ended: string, presents: readonly (string | null)[]) => {
    if (presents.length !== seats.length) throw new Error(`the end gave ${presents.length} presents to ${seats.length} players`)
    presents.forEach((gift, i) => {
      if (gift !== null) write(seats[i].profile, (now) => withPresent(now, gift))
    })
    setScreen({ at: 'dressing', room, played, ended, given: presents })
  }

  const dressed = (room: HouseRoom, played: Played, ended: string, choices: readonly DressChoice[]) => {
    if (choices.length !== seats.length) throw new Error(`the dressing room gave ${choices.length} choices for ${seats.length} players`)
    choices.forEach((choice, i) => write(seats[i].profile, (now) => withThumb(withWear(now, choice.wear), room.id, ended, choice.thumb)))
    logPlay(room, played, ended, choices.map((c) => c.thumb))
    toHouse()
  }

  const quizMoved = useCallback((seat: SeatIndex, quiz: HouseSaves['quiz']) => write(seats[seat].profile, (now) => withQuiz(now, quiz)), [seats, write])
  const waitOpen = useCallback(() => {
    if (door.kind === 'ready') open(door.room.id)
  }, [door, open])

  // Who plays goes to the house, and each seated player's saves keep the device they sat at.
  const seatsTaken = () => {
    for (const seat of seats) write(seat.profile, (now) => withDevice(now, seat.device))
    toHouse()
  }

  switch (screen.at) {
    case 'seats':
      return <WhoPlays lang={lang} players={players} kept={kept} seats={seats} onSeats={setSeats} input={input} onGo={seatsTaken} />
    case 'house':
      return <House lang={lang} rooms={doors} played={facts === null ? NOBODY_PLAYED : facts.played} newDoor={door} seats={seats} faces={faces} input={input} onOpen={open} nothingNew={nothingNew} onNew={openNew} onPlayers={() => setScreen({ at: 'seats' })} />
    case 'opening':
      return <main className="mh-page" />
    case 'waiting':
      return <Waiting lang={lang} door={door.kind === 'waiting' ? door : null} ready={waitNext === 'open'} players={seated} gifts={index.gifts} source={source} input={input} sounds={sounds} onQuiz={quizMoved} onOpen={waitOpen} onHouse={toHouse} />
    case 'room': {
      const { room, level: doorLevel } = screen
      return <RoomScreen key={room.id} lang={lang} room={room} level={doorLevel} autoplay={first.autoplay} seats={seats} faces={faces} wear={wear} input={input} sounds={sounds} live={live} onEnd={(played) => roomEnded(room, doorLevel, played)} />
    }
    case 'end': {
      const { room, played, ended } = screen
      return <End lang={lang} room={room} played={played} players={seated} gifts={index.gifts} source={source} input={input} sounds={sounds} onDone={(presents) => presentsGiven(room, played, ended, presents)} />
    }
    case 'dressing': {
      const { room, played, ended, given } = screen
      return <DressingRoom lang={lang} room={room} players={seated} given={given} gifts={index.gifts} source={source} input={input} sounds={sounds} onDone={(choices) => dressed(room, played, ended, choices)} />
    }
  }
}
