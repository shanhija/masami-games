import type { ReactNode } from 'react'

import { BEEP, BUILDING, C, GLASS, MOONY, THING } from './draw/look'

/**
 * The HUD's icons for what is not in the factory itself (pause, the sound, full screen, the
 * peel's hand, Oops...), drawn in the Sticker Table look (draw/look.ts): flat fills with one
 * lighter shape at most, rounded corners, no ink lines. They sit on the HUD's white sticker
 * buttons, which give them their rim and their teal shadow. No emoji, no text. Pictures of
 * the factory's own things (stickers, things, the rocket, Beep, munchers, cards) are never
 * icons: they come from the draw functions (Pictures.tsx).
 */

const TEAL = C.ghostLine
const WHITE = C.white

/** Every icon's square: two units across, centred. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="-1.1 -1.1 2.2 2.2" aria-hidden>
      {children}
    </svg>
  )
}

/** A thick round line in `colour`: arrows, waves, the corners of full screen. */
function Line({ d, width, colour }: { d: string; width: number; colour: string }) {
  return <path d={d} fill="none" stroke={colour} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
}

/** A slash across an icon: that sound is off. */
const Off = () => <Line d="M -0.8 -0.8 L 0.8 0.8" width={0.16} colour={TEAL} />

export function PauseIcon() {
  return (
    <Icon>
      <rect x={-0.56} y={-0.62} width={0.38} height={1.24} rx={0.16} fill={TEAL} />
      <rect x={0.18} y={-0.62} width={0.38} height={1.24} rx={0.16} fill={TEAL} />
    </Icon>
  )
}

/** Play: a round-cornered triangle, white on the coral button. */
export function PlayIcon() {
  return (
    <Icon>
      <Line d="M -0.4 -0.62 L 0.66 0 L -0.4 0.62 Z" width={0.3} colour={WHITE} />
      <path d="M -0.4 -0.62 L 0.66 0 L -0.4 0.62 Z" fill={WHITE} />
    </Icon>
  )
}

const SPEAKER = 'M -0.86 -0.28 H -0.48 L 0 -0.68 V 0.68 L -0.48 0.28 H -0.86 Z'

export function SoundIcon({ on }: { on: boolean }) {
  return (
    <Icon>
      <path d={SPEAKER} fill={TEAL} stroke={TEAL} strokeWidth={0.1} strokeLinejoin="round" />
      {on ? (
        <>
          <Line d="M 0.28 -0.3 Q 0.48 0 0.28 0.3" width={0.13} colour={TEAL} />
          <Line d="M 0.52 -0.58 Q 0.9 0 0.52 0.58" width={0.13} colour={TEAL} />
        </>
      ) : (
        <Line d="M 0.32 -0.26 L 0.84 0.26 M 0.84 -0.26 L 0.32 0.26" width={0.13} colour={TEAL} />
      )}
    </Icon>
  )
}

export function MusicIcon({ on }: { on: boolean }) {
  return (
    <Icon>
      <ellipse cx={-0.44} cy={0.5} rx={0.27} ry={0.2} transform="rotate(-20 -0.44 0.5)" fill={TEAL} />
      <ellipse cx={0.5} cy={0.32} rx={0.27} ry={0.2} transform="rotate(-20 0.5 0.32)" fill={TEAL} />
      <path d="M -0.2 0.48 V -0.5 L 0.74 -0.72 V 0.3 H 0.66 V -0.42 L -0.12 -0.24 V 0.48 Z" fill={TEAL} stroke={TEAL} strokeWidth={0.06} strokeLinejoin="round" />
      {!on && <Off />}
    </Icon>
  )
}

/** Beep's voice: a speech bubble with sound in it. */
export function VoiceIcon({ on }: { on: boolean }) {
  return (
    <Icon>
      <path d="M -0.8 -0.62 H 0.8 Q 0.92 -0.62 0.92 -0.5 V 0.28 Q 0.92 0.4 0.8 0.4 H -0.1 L -0.48 0.76 L -0.4 0.4 H -0.8 Q -0.92 0.4 -0.92 0.28 V -0.5 Q -0.92 -0.62 -0.8 -0.62 Z" fill={TEAL} />
      {[-0.42, 0, 0.42].map((x, i) => (
        <rect key={x} x={x - 0.07} y={i === 1 ? -0.38 : -0.26} width={0.14} height={i === 1 ? 0.52 : 0.28} rx={0.07} fill={WHITE} />
      ))}
      {!on && <Off />}
    </Icon>
  )
}

/** Good night: a sleepy crescent moon (Moony's cream) and a star. */
export function MoonIcon() {
  return (
    <Icon>
      <path d="M 0.2 -0.84 A 0.84 0.84 0 1 0 0.84 0.3 A 0.64 0.64 0 1 1 0.2 -0.84 Z" fill={MOONY.body} />
      <path d="M 0.62 -0.86 L 0.7 -0.62 L 0.94 -0.6 L 0.75 -0.45 L 0.82 -0.22 L 0.62 -0.36 L 0.42 -0.22 L 0.49 -0.45 L 0.3 -0.6 L 0.54 -0.62 Z" fill={GLASS.star} />
    </Icon>
  )
}

export function FullScreenIcon() {
  return (
    <Icon>
      <Line d="M -0.76 -0.28 V -0.76 H -0.28 M 0.28 -0.76 H 0.76 V -0.28 M 0.76 0.28 V 0.76 H 0.28 M -0.28 0.76 H -0.76 V 0.28" width={0.18} colour={TEAL} />
    </Icon>
  )
}

/** More games: four little cards, the games' directory. */
export function GamesIcon() {
  const colours = [BUILDING.oven.body, BUILDING.workshop.body, BUILDING.greenMaker.body, BUILDING.digger.body]
  return (
    <Icon>
      {[
        [-0.82, -0.82],
        [0.08, -0.82],
        [-0.82, 0.08],
        [0.08, 0.08],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={0.74} height={0.74} rx={0.18} fill={colours[i]} />
      ))}
    </Icon>
  )
}

/** Start again: a loop back to the start. */
export function RestartIcon() {
  return (
    <Icon>
      <Line d="M 0.62 0.28 A 0.66 0.66 0 1 1 0.48 -0.44" width={0.18} colour={TEAL} />
      <path d="M 0.8 -0.88 L 0.84 -0.2 L 0.2 -0.38 Z" fill={TEAL} stroke={TEAL} strokeWidth={0.08} strokeLinejoin="round" />
    </Icon>
  )
}

/** Bring back: a fat arrow curling back to the left. */
export function BringBackIcon() {
  return (
    <Icon>
      <Line d="M -0.5 -0.22 H 0.24 A 0.5 0.5 0 0 1 0.24 0.78 H -0.2" width={0.2} colour={TEAL} />
      <path d="M -0.92 -0.22 L -0.36 -0.68 V 0.24 Z" fill={TEAL} stroke={TEAL} strokeWidth={0.08} strokeLinejoin="round" />
    </Icon>
  )
}

/** Oops: a curl that goes back the way it came. */
export function OopsIcon() {
  return (
    <Icon>
      <Line d="M -0.36 0.6 A 0.58 0.58 0 1 0 -0.5 -0.32" width={0.2} colour={TEAL} />
      <path d="M -0.86 -0.74 L -0.28 -0.66 L -0.72 -0.12 Z" fill={TEAL} stroke={TEAL} strokeWidth={0.08} strokeLinejoin="round" />
    </Icon>
  )
}

/** The peel: Beep's mitten lifting a sticker's corner, its white back showing. */
export function PeelIcon() {
  return (
    <Icon>
      <rect x={-0.82} y={-0.36} width={1.32} height={1.12} rx={0.22} fill={BUILDING.workshop.body} />
      <path d="M 0.5 -0.36 V 0.3 Q 0.12 0.12 -0.06 -0.36 Z" fill={WHITE} />
      <path d="M 0.5 0.3 Q 0.12 0.12 -0.06 -0.36" fill="none" stroke={BUILDING.workshop.fold} strokeWidth={0.06} />
      <ellipse cx={0.46} cy={-0.5} rx={0.32} ry={0.27} fill={BEEP.body} />
      <ellipse cx={0.2} cy={-0.62} rx={0.12} ry={0.18} transform="rotate(-30 0.2 -0.62)" fill={BEEP.body} />
      <ellipse cx={0.5} cy={-0.56} rx={0.14} ry={0.1} fill={BEEP.light} />
    </Icon>
  )
}

/** The pencil: Beep's coral pencil, its point down to the left, over the belt it draws. */
export function PencilIcon() {
  return (
    <Icon>
      <g transform="rotate(45)">
        <rect x={-0.2} y={-0.95} width={0.4} height={1.2} rx={0.08} fill={BEEP.body} />
        <rect x={-0.2} y={-0.95} width={0.13} height={1.2} fill={BEEP.light} />
        <rect x={-0.2} y={-1.0} width={0.4} height={0.2} rx={0.08} fill={BUILDING.oven.light} />
        <path d="M -0.2 0.25 L 0.2 0.25 L 0 0.72 Z" fill={GLASS.cork} />
        <path d="M -0.08 0.53 L 0.08 0.53 L 0 0.72 Z" fill={C.face} />
      </g>
    </Icon>
  )
}

/** A tick: this card is found. */
export function TickIcon() {
  return (
    <Icon>
      <circle r={0.92} fill={THING.greenBottle.key} />
      <Line d="M -0.42 0.02 L -0.1 0.34 L 0.46 -0.3" width={0.22} colour={WHITE} />
    </Icon>
  )
}

/** Endless: after the launch every sticker's count is this. */
export function EndlessIcon() {
  return (
    <Icon>
      <Line d="M 0 0 C -0.3 -0.42 -0.86 -0.42 -0.86 0 C -0.86 0.42 -0.3 0.42 0 0 C 0.3 -0.42 0.86 -0.42 0.86 0 C 0.86 0.42 0.3 0.42 0 0 Z" width={0.2} colour={TEAL} />
    </Icon>
  )
}

/** Turn me: a phone lying on its side, and the arrow that turns it there. */
export function TurnIcon() {
  return (
    <svg className="icon" viewBox="-1.3 -1.3 2.6 2.6" aria-hidden>
      <g className="phone">
        <rect x={-0.42} y={-0.8} width={0.84} height={1.6} rx={0.16} fill={WHITE} />
        <rect x={-0.32} y={-0.64} width={0.64} height={1.2} rx={0.06} fill={BUILDING.workshop.body} />
        <circle cy={0.7} r={0.05} fill={BUILDING.workshop.fold} />
      </g>
      <Line d="M -1.0 -0.66 A 1.12 1.12 0 0 1 0.3 -1.12" width={0.14} colour={TEAL} />
      <path d="M 0.2 -1.32 L 0.62 -1.08 L 0.2 -0.86 Z" fill={TEAL} />
    </svg>
  )
}
