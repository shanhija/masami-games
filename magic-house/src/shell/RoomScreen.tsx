import { useEffect, useMemo, useRef, useState } from 'react'

import type { Avatar } from '../../../profiles/src/avatar'
import { inLang, type Lang } from '../../../profiles/src/lang'
import type { Level } from '../engine/api'
import type { LookBuilt } from '../engine/look'
import { buildLook, LookBuildError, lookFaults } from '../engine/lookBuilder'
import { buildRoom, Room, RoomBuildError, RoomRuntime } from '../engine/room'
import type { World } from '../engine/world'
import { Fireworks } from '../scene/Fireworks'
import { Lantern } from '../scene/Lantern'
import type { StageLook } from '../scene/lookView'
import { Meter } from '../scene/Meter'
import { wornModel } from '../scene/presents'
import { pointAt, RoomStage, type RoomSource, type ShownView } from '../scene/RoomStage'
import { NO_POINT, type SeatInput } from '../seats/input'
import { padBand } from '../seats/TouchPad'
import type { Seat } from '../seats/types'
import { LookRuntime } from '../trial/compile'
import { restartLevel, type Wear } from '../saves'
import { PAUSE, ROOM } from '../words'
import { NOTHING_SPENT, playedNow, spentAfter } from './counted'
import { HelperBubble } from './HelperBubble'
import type { HouseSounds } from './houseSounds'
import { PauseCard } from './PauseCard'
import { hush } from './speech'
import { Autoplay, type AutoplayMode } from './autoplay'
import { Hud, hudTop, RecipeSketch } from './Hud'
import { FrameClock, newCues, partyFrom, roomStart, type HouseRoom, type Played } from './play'

/** Seconds of the game's clock from the end to the end screen (shell/End.tsx): the way out swings open, the confetti flies and the cheer is read. */
export const CHEER_SECS = 3.5

/** The page's dev handle and the scene's meter are on: the dev server only, and only with ?debug (never in the build). */
export const DEBUG = import.meta.env.DEV && new URLSearchParams(location.search).has('debug')

/** Where the room being played, and its bots under ?autoplay, are kept for the page's dev handle (Game.tsx). */
export interface LiveRoom {
  room: Room | null
  autoplay: Autoplay | null
}

export interface RoomScreenProps {
  lang: Lang
  room: HouseRoom
  /** The party's level at the door (saves.ts partyLevel, or ?level); from the second start-again on the room plays one lower (saves.ts restartLevel). */
  level: Level
  /** ?autoplay: the room's walkthrough plays it (shell/autoplay.ts), or null for the seats. */
  autoplay: AutoplayMode | null
  seats: readonly Seat[]
  faces: readonly (Avatar | null)[]
  /** What each seat wears from their saves, by seat index, over their gallery face (shell/play.ts partyFrom). */
  wear: readonly Wear[]
  input: SeatInput
  sounds: HouseSounds
  live: LiveRoom
  /** The room ended or was left, with how it went (its level at the last start, seconds, restarts, hints, the end); null when it would not build, so there was no play to count. The page writes the saves at once, so a way out of the page (more games) calls this first. */
  onEnd: (played: Played | null) => void
}

/** The room built for this party, with its look built on it, or the sentence it would not build with. A kept room whose guarded code no longer compiles is the same stuck door (a change to the guard drops such a room from the library). */
function build(room: HouseRoom, seats: readonly Seat[], faces: readonly (Avatar | null)[], wear: readonly Wear[], level: Level): { played: Room; look: LookBuilt | null } | string {
  const runtime = new RoomRuntime()
  let code
  try {
    code = room.code(runtime)
  } catch (err) {
    return `its code does not compile: ${(err as Error).message}`
  }
  let played: Room
  try {
    played = buildRoom(code, roomStart(room, partyFrom(seats, (s) => faces[s.index], (s) => wear[s.index]), level), runtime)
  } catch (err) {
    if (err instanceof RoomBuildError) return err.sentence
    throw err
  }
  return { played, look: lookOn(room, played) }
}

/** The room's look built on the room as played (engine/lookBuilder.ts buildLook, on its own runtime), or null for a room without one. A look that will not compile or build, or breaks a limit its check holds it to (lookFaults: a look kept under another engine, or written by hand), is left out with its sentence in the console, and the room plays in its shell: a look never stops a room. */
function lookOn(room: HouseRoom, played: Room): LookBuilt | null {
  if (room.look === null) return null
  const runtime = new LookRuntime()
  let built: LookBuilt
  try {
    built = buildLook(played, room.look(runtime), runtime)
  } catch (err) {
    console.error(`The look of ${room.id} is left out: ${err instanceof LookBuildError ? err.sentence : (err as Error).message}`)
    return null
  }
  const faults = lookFaults(built, played.world.view, played.world.lamps.length)
  if (faults.length === 0) return built
  console.error(`The look of ${room.id} is left out: ${faults.join('; ')}`)
  return null
}

/**
 * A room played (plan.md, A visit): the sim at a fixed 60 frames a second against the screen's
 * rate (play.ts FrameClock), fed each frame by the seats; the scene drawing its World above the
 * touch pads, a tap on it turned into the room's point by the camera it shows (RoomStage.tsx pointAt); the HUD over
 * it, with the helper's lantern (scene/Lantern.tsx) and its words beside it (HelperBubble.tsx);
 * the house's sounds for the world's cues (houseSounds.ts: a recording where one is built, else Silly Billy's synthesised one). At the end the way out opens with its cheer and the
 * house's fireworks go up (scene/Fireworks.tsx), and CHEER_SECS later the page goes on to the end
 * screen. The pause card (PauseCard.tsx) keeps going, starts again, leaves for another room or for
 * the gallery's other games, and turns the sound and full screen off and on; the sim waits while it
 * is up. Start again builds the room afresh. What is counted is shell/counted.ts's.
 * A room with a look has it built on the room as played (lookOn) and drawn with it; a tap on the
 * room goes to the play as always and is tried on the look's props too, whose sounds play under the
 * room's (houseSounds.ts playProp).
 * Under ?autoplay the room's walkthrough plays it from the start (or after Start again), fed into
 * the same step the seats feed. From the second start-again on it plays one level lower. At the
 * end, or when it is left, the page hears how it went: the level of its last start, the seconds
 * and hints over every start of it, and the restarts.
 */
export function RoomScreen({ lang, room, level, autoplay, seats, faces, wear, input, sounds, live, onEnd }: RoomScreenProps) {
  const [restarts, setRestarts] = useState(0)
  const [paused, setPaused] = useState(false)
  const levelNow = restartLevel(level, restarts)
  const made = useMemo(() => build(room, seats, faces, wear, levelNow), [room, seats, faces, wear, levelNow, restarts])
  const played = typeof made === 'string' ? made : made.played
  const pausedNow = useRef(paused)
  pausedNow.current = paused
  // The seconds and hints of the starts before this one (shell/counted.ts).
  const spent = useRef(NOTHING_SPENT)
  const ended = useRef(onEnd)
  ended.current = onEnd
  const levelShown = useRef(levelNow)
  levelShown.current = levelNow
  const restartsNow = useRef(restarts)
  restartsNow.current = restarts
  const touch = seats.some((s) => s.device.kind === 'touch')
  const [clearBottom, setClearBottom] = useState(() => (touch ? padBand(window.innerHeight) : 0))
  const [clearTop, setClearTop] = useState(() => hudTop(window.innerWidth, window.innerHeight))
  useEffect(() => {
    const resize = () => {
      setClearBottom(touch ? padBand(window.innerHeight) : 0)
      setClearTop(hudTop(window.innerWidth, window.innerHeight))
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [touch])

  if (typeof played === 'string') console.error(`The room ${room.id} does not build: ${played}`)
  const world = typeof played === 'string' ? null : played.world
  const source = useMemo<RoomSource | null>(() => (world === null ? null : { world }), [world])
  // The look as the stage shows it: its props hear the taps on the room and sound through the page's sounds, under the room's.
  const look = useMemo<StageLook | null>(() => (typeof made === 'string' || made.look === null ? null : { built: made.look, taps: [], sound: (name) => sounds.playProp(name) }), [made, sounds])
  const shown = useMemo<ShownView>(() => ({ view: null, high: null }), [played])
  const surface = useRef<HTMLDivElement>(null)

  // Pointing on the room: the room's point under the screen's by the camera of the frame last drawn, or before the first frame the view it will draw (from high up, where the eye's line first meets something drawn).
  const clear = useRef({ clearBottom, clearTop })
  clear.current = { clearBottom, clearTop }
  useEffect(() => {
    if (world === null) return
    return input.point(surface.current!, (x, y) => pointAt(shown, world, { width: window.innerWidth, height: window.innerHeight, ...clear.current }, x, y))
  }, [input, world, shown])
  // The same presses for the look's props too, which the stage tries by the view it draws (RoomStage.tsx): a prop answers a tap and never takes it from the play.
  useEffect(() => {
    if (look === null) return
    const el = surface.current!
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return
      if (e.target instanceof Element && e.target.closest(`[${NO_POINT}]`) !== null) return
      look.taps.push({ x: e.clientX, y: e.clientY })
    }
    el.addEventListener('pointerdown', down)
    return () => el.removeEventListener('pointerdown', down)
  }, [look])

  // The sim's own clock, one sim frame at a time, and the sounds of each frame's cues.
  useEffect(() => {
    if (typeof played === 'string') return
    const auto = autoplay === null ? null : new Autoplay(played, room.walk, autoplay)
    live.room = played
    live.autoplay = auto
    let told = false
    const devices = seats.map((s) => s.device)
    const clock = new FrameClock()
    let heard = played.world.serial
    let last = performance.now()
    let left = false
    let raf = 0
    // A gamepad's Start pressed before the room is not a pause in it.
    input.takePause()
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick)
      const secs = Math.max(0, (time - last) / 1000)
      last = time
      if (input.takePause()) setPaused((p) => !p)
      // While the pause card is up it reads the seats' pads itself (PauseCard.tsx), so their presses act on the card and none is left over for play.
      if (pausedNow.current) return
      const frames = clock.advance(secs)
      for (let i = 0; i < frames; i++) {
        const given = input.frame(devices)
        played.step(auto === null ? given : auto.frame(given))
      }
      if (auto !== null && auto.run.state === 'stopped' && !told) {
        told = true
        console.error(`The walkthrough of ${room.id} stopped: ${auto.run.sentence}`)
      }
      const cues = newCues(played.world, heard)
      heard = cues.heard
      for (const name of cues.names) sounds.play(name)
      const end = played.world.end
      if (end !== null && !left && played.world.t - end.at >= CHEER_SECS) {
        left = true
        ended.current(playedNow('finished', levelShown.current, restartsNow.current, spent.current, played.world))
      }
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      live.room = null
      live.autoplay = null
    }
  }, [played, room, autoplay, seats, input, sounds, live])

  // Whatever the helper was saying stops when the room is left.
  useEffect(() => () => hush(), [])

  if (world === null || source === null)
    return (
      <main className="mh-page stuck">
        <h1>{inLang(ROOM.stuck, lang)}</h1>
        <button className="big-button" onClick={() => onEnd(null)}>
          {inLang(PAUSE.toHouse, lang)}
        </button>
      </main>
    )

  return (
    <>
      <div ref={surface} className="room-surface">
        <RoomStage key={restarts} source={source} lang={lang} clearBottom={clearBottom} clearTop={clearTop} worn={wornModel} shown={shown} house look={look}>
          <Lantern source={source} />
          <Fireworks source={source} since={sinceEnd} />
          {DEBUG && <Meter name={room.id} />}
        </RoomStage>
      </div>
      <LiveHud world={world} lang={lang} seats={seats} faces={faces} input={input} shown={shown} sounds={sounds} clearTop={clearTop} clearBottom={clearBottom} onPause={() => setPaused((p) => !p)} />
      {paused && (
        <PauseCard
          lang={lang}
          seats={seats}
          input={input}
          sounds={sounds}
          onKeepGoing={() => setPaused(false)}
          onStartAgain={() => {
            spent.current = spentAfter(spent.current, world)
            setPaused(false)
            setRestarts((n) => n + 1)
          }}
          onAnotherRoom={() => onEnd(playedNow(endedYet(world), levelNow, restarts, spent.current, world))}
          onMoreGames={() => {
            // The saves are written at once in onEnd, before the page goes to the gallery.
            onEnd(playedNow(endedYet(world), levelNow, restarts, spent.current, world))
            location.assign('../index.html')
          }}
        />
      )}
    </>
  )
}

/** How a room left by the pause card counts: a room already ended (the pause came during the cheer) is finished, with its presents, else it is left. */
const endedYet = (w: World) => (w.end === null ? 'left' : 'finished')

/** The fireworks go up when the room ends. */
const sinceEnd = (w: World) => (w.end === null ? null : w.t - w.end.at)

/** The HUD drawn again every screen frame from the world as it is then, the helper's words beside its lantern, and the cheer once the room has ended. Only this re-renders each frame, never the stage. */
function LiveHud({ world, lang, seats, faces, input, shown, sounds, clearTop, clearBottom, onPause }: { world: World; lang: Lang; seats: readonly Seat[]; faces: readonly (Avatar | null)[]; input: SeatInput; shown: ShownView; sounds: HouseSounds; clearTop: number; clearBottom: number; onPause: () => void }) {
  const [, setFrame] = useState(0)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      setFrame(world.frame)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world])
  return (
    <>
      <Hud world={world} lang={lang} seats={seats} faces={faces} input={input} waitingPads={[]} picture={RecipeSketch} onPause={onPause} />
      <HelperBubble world={world} lang={lang} shown={shown} sounds={sounds} clearTop={clearTop} clearBottom={clearBottom} />
      {world.end !== null && <div className="cheer">{inLang(ROOM.hooray, lang)}</div>}
    </>
  )
}
