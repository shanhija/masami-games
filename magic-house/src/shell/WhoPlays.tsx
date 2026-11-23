import { useEffect, useRef, useState, type CSSProperties } from 'react'

import { AvatarPicture } from '../../../profiles/src/Avatar'
import { inLang, type Lang } from '../../../profiles/src/lang'
import { palette } from '../../../silly-billy/src/scene/look'
import type { DevicePlayer } from '../saves'
import { claimSeat, leaveSeat, sameDevice, whoSits } from '../seats/claim'
import type { SeatInput } from '../seats/input'
import { KEY_ZONES, keyLabel } from '../seats/keys'
import { padBand, TouchPadView } from '../seats/TouchPad'
import type { KeptDevice, Seat, TouchPad } from '../seats/types'
import { HUD, NAME, WHO } from '../words'

/** Whether this screen takes touch: then the two touch pads wait at the bottom to be claimed. */
export const TOUCH_SCREEN = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0

/** How long after a seat is taken its own buttons start to count, ms: the press that sat a child down, and the quick second press that often follows it, neither starts the game nor stands them up. */
export const SEAT_SETTLE_MS = 1000

/** The first player of the device, from `from` on and round, who has no seat; -1 when all have one. */
function nextFree(players: readonly Pick<DevicePlayer, 'profile'>[], seats: readonly Seat[], from: number): number {
  for (let k = 0; k < players.length; k++) {
    const i = (from + k) % players.length
    if (!seats.some((s) => s.profile === players[i].profile)) return i
  }
  return -1
}

/**
 * Who plays (plan.md, A visit): the device's players by their gallery faces, the picked player
 * first. The face that sits down next breathes; a press on any device nobody sits at seats that
 * face there (seats/claim.ts), in the next seat's colour, and the next free face breathes, unless
 * a player not seated yet last sat at that device (their saves keep it, `kept`): the device is
 * theirs first, and its mark shows faintly under their face so they know where to press. A tap on
 * a free face makes it the next; a tap on a seated face stands it up.
 *
 * Play goes to the house with the seats taken, one to four: by a tap on Play, or by a seated
 * player's own a, so a party on gamepads alone (or on keys) needs no screen; a seated player's b
 * stands them up. A seat's buttons count only SEAT_SETTLE_MS after it was taken. Every seated face
 * shows its device's mark: the keys of its stick and of both buttons, or a touch pad or gamepad
 * drawn with its stick and buttons. On a touch screen the band of two pads stays at the bottom the
 * whole time, a claimed pad in its seat's colour, so nothing moves when a pad is claimed. Its
 * buttons show this screen's jobs, Play and Not me, never the room's jump and take.
 */
export function WhoPlays({ lang, players, kept, seats, onSeats, input, onGo }: { lang: Lang; players: readonly DevicePlayer[]; kept: readonly (KeptDevice | null)[]; seats: readonly Seat[]; onSeats: (seats: readonly Seat[]) => void; input: SeatInput; onGo: () => void }) {
  const [next, setNext] = useState(() => nextFree(players, seats, 0))
  // The rAF loop reads the latest of all three.
  const now = useRef({ seats, next, onGo })
  now.current = { seats, next, onGo }
  // When each seated device sat down (performance.now()), so its own presses wait to settle.
  const satAt = useRef<{ device: Seat['device']; at: number }[]>([])

  useEffect(() => {
    // Presses from before this screen are no claims, and none of the seats' presses count.
    input.takeClaims()
    input.frame(now.current.seats.map((s) => s.device))
    const ids = players.map((p) => p.profile)
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const at = performance.now()
      let { seats: list, next: who } = now.current
      for (const device of input.takeClaims()) {
        if (list.some((s) => sameDevice(s.device, device))) continue
        const sitter = whoSits(ids, kept, list, device, who)
        if (sitter < 0) continue
        const seated = claimSeat(list, device, players[sitter].profile)
        if (seated === null) continue
        list = seated
        satAt.current = [...satAt.current.filter((s) => !sameDevice(s.device, device)), { device, at }]
        if (sitter === who) who = nextFree(players, list, who + 1)
      }
      // The seated players' own buttons: a starts, b stands that player up. Read every frame, so no press waits for later.
      const settled = (seat: Seat) => {
        const sat = satAt.current.find((s) => sameDevice(s.device, seat.device))
        return sat === undefined || at - sat.at >= SEAT_SETTLE_MS
      }
      const pads = input.frame(list.map((s) => s.device)).pads
      const go = list.some((seat, i) => settled(seat) && pads[i]!.a.pressed)
      const leaving = list.filter((seat, i) => settled(seat) && pads[i]!.b.pressed && !pads[i]!.a.pressed)
      for (const seat of leaving) {
        const gone = list.find((s) => sameDevice(s.device, seat.device))!
        who = players.findIndex((p) => p.profile === gone.profile)
        list = leaveSeat(list, gone.index)
      }
      if (list !== now.current.seats) {
        now.current = { ...now.current, seats: list, next: who }
        onSeats(list)
        setNext(who)
      }
      if (go && list.length > 0) now.current.onGo()
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [input, players, kept, onSeats])

  const tapFace = (i: number) => {
    const seat = seats.find((s) => s.profile === players[i].profile)
    if (seat === undefined) return setNext(i)
    const list = leaveSeat(seats, seat.index)
    onSeats(list)
    setNext(i)
  }
  const touchSeat = (pad: TouchPad) => seats.find((s) => sameDevice(s.device, { kind: 'touch', pad }))

  return (
    <main className={`mh-page who${TOUCH_SCREEN ? ' with-pads' : ''}`} style={{ '--pad-band': `${TOUCH_SCREEN ? padBand(window.innerHeight) : 0}px` } as CSSProperties}>
      <h1>{inLang(NAME, lang)}</h1>
      <h2>{inLang(WHO.title, lang)}</h2>
      <div className="faces">
        {players.map((player, i) => {
          const seat = seats.find((s) => s.profile === player.profile)
          const mine = kept[i]
          return (
            <button key={player.profile ?? 'nobody'} className={`face-seat${seat !== undefined ? ' seated' : i === next ? ' next' : ''}`} style={seat === undefined ? undefined : ({ '--seat': seat.color } as CSSProperties)} onClick={() => tapFace(i)}>
              <span className="face-ring">{player.avatar === null ? <span className="no-face" /> : <AvatarPicture avatar={player.avatar} className="avatar" />}</span>
              {player.name !== null && <span className="face-name">{player.name}</span>}
              <span className="mark-slot">{seat !== undefined ? <DeviceMark device={seat.device} faint={false} /> : mine !== null && <DeviceMark device={mine} faint />}</span>
            </button>
          )
        })}
      </div>
      <p className={`press${next >= 0 ? '' : ' hidden'}`}>{inLang(WHO.press, lang)}</p>
      <button className="big-button go" disabled={seats.length === 0} onClick={onGo}>
        {inLang(WHO.go, lang)}
      </button>
      {TOUCH_SCREEN && (
        <div className="who-pads">
          {([0, 1] as TouchPad[]).map((pad) => {
            const seat = touchSeat(pad)
            return <TouchPadView key={pad} input={input} pad={pad} color={seat === undefined ? null : seat.color} a={<WhoJob job="go" lang={lang} />} b={<WhoJob job="leave" lang={lang} />} waiting={inLang(HUD.touchToPlay, lang)} />
          })}
        </div>
      )}
    </main>
  )
}

/** A touch pad's button on who plays, by this screen's own jobs: a starts the game (a play arrow), b stands this child up again (an arrow out). The room's jobs come only in the room. */
function WhoJob({ job, lang }: { job: 'go' | 'leave'; lang: Lang }) {
  return (
    <>
      <span className="face-picture">
        <svg className="icon" viewBox="-1.1 -1.1 2.2 2.2" aria-hidden>
          {job === 'go' ? (
            <path d="M -0.45 -0.7 L 0.7 0 L -0.45 0.7 Z" fill="#fff" stroke={palette.ink} strokeWidth={0.14} strokeLinejoin="round" />
          ) : (
            <>
              <path d="M 0.1 -0.75 H -0.6 V 0.75 H 0.1" fill="none" stroke={palette.ink} strokeWidth={0.42} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 0.1 -0.75 H -0.6 V 0.75 H 0.1" fill="none" stroke="#fff" strokeWidth={0.2} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M -0.15 0 H 0.75 M 0.4 -0.35 L 0.75 0 L 0.4 0.35" fill="none" stroke={palette.ink} strokeWidth={0.42} strokeLinecap="round" strokeLinejoin="round" />
              <path d="M -0.15 0 H 0.75 M 0.4 -0.35 L 0.75 0 L 0.4 0.35" fill="none" stroke="#fff" strokeWidth={0.2} strokeLinecap="round" strokeLinejoin="round" />
            </>
          )}
        </svg>
      </span>
      <span className="face-word">{inLang(job === 'go' ? WHO.go : WHO.leave, lang)}</span>
    </>
  )
}

/** A key as the mark draws it: its label on a cap. */
const Cap = ({ code }: { code: string }) => <kbd>{keyLabel(code)}</kbd>

/**
 * What a face sits at, or sat at last time (`faint`): for keys, its zone's stick keys as on the
 * keyboard and its two button keys beside them, a bigger and b smaller; for a touch pad or a
 * gamepad, a drawing of it with its stick and its two buttons.
 */
function DeviceMark({ device, faint }: { device: KeptDevice; faint: boolean }) {
  const kind = `device-mark ${device.kind}${faint ? ' faint' : ''}`
  if (device.kind === 'keys') {
    const keys = KEY_ZONES[device.zone]
    return (
      <span className={kind} aria-hidden>
        <span className="mark-stick">
          <span />
          <Cap code={keys.up} />
          <span />
          <Cap code={keys.left} />
          <Cap code={keys.down} />
          <Cap code={keys.right} />
        </span>
        <span className="mark-buttons">
          <span className="mark-a">
            <Cap code={keys.a} />
          </span>
          <span className="mark-b">
            <Cap code={keys.b} />
          </span>
        </span>
      </span>
    )
  }
  return (
    <span className={kind} aria-hidden>
      <svg viewBox="0 0 100 60">
        {device.kind === 'gamepad' ? (
          <path d="M22 8 H78 C92 8 98 22 98 36 C98 50 90 58 80 56 L68 46 H32 L20 56 C10 58 2 50 2 36 C2 22 8 8 22 8 Z" className="mark-body" />
        ) : (
          <rect x="3" y="6" width="94" height="48" rx="12" className="mark-body" />
        )}
        <circle cx="28" cy="30" r="13" className="mark-ring" />
        <circle cx="28" cy="30" r="7" className="mark-knob" />
        <circle cx="78" cy="38" r="10" className="mark-press" />
        <circle cx="62" cy="22" r="7" className="mark-press" />
      </svg>
    </span>
  )
}
