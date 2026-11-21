import { Children, cloneElement, type ReactElement, type ReactNode, type SVGProps } from 'react'

import { BOX, C, HAT_LOOK, INK } from './draw/look'

/**
 * The HUD's icons for things that are not in the game's world (pause, sound, the dice, the
 * bell...), drawn like the canvas art: flat fills from look.ts with one navy ink outline,
 * and fat ink tubes with a white core for arrows. No emoji (some tablets draw them as
 * boxes). Pictures of the game's own things (goods, the builder, rooms, roads) are never
 * icons: they come from the draw functions through Portrait.
 */
const LINE = 0.13

const ink = { stroke: INK, strokeWidth: LINE, strokeLinejoin: 'round', strokeLinecap: 'round' } as const
const WHITE = C.white
const YELLOW = BOX.yellow.face

type Shape = ReactElement<SVGProps<SVGElement>>

/** Every icon's square: two units across, centred, with room for the outline. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="icon" viewBox="-1.1 -1.1 2.2 2.2" aria-hidden>
      {children}
    </svg>
  )
}

/** Shapes drawn twice, first fat in ink and then in their own fills, so the group wears one outline with no seams inside. */
function Solid({ children }: { children: ReactNode }) {
  const shapes = Children.toArray(children) as Shape[]
  return (
    <>
      {shapes.map((s, i) => cloneElement(s, { key: `ink${i}`, fill: INK, stroke: INK, strokeWidth: LINE * 2, strokeLinejoin: 'round', strokeLinecap: 'round' }))}
      {shapes.map((s, i) => cloneElement(s, { key: `fill${i}`, stroke: 'none' }))}
    </>
  )
}

/** A line drawn as a tube with an ink rim: arrows, the undo loop, the full-screen corners. */
function Tube({ d, width, colour }: { d: string; width: number; colour: string }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={width + LINE * 2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={colour} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

/** A slash across an icon: that thing is off. */
function Off() {
  return <Tube d="M -0.85 -0.85 L 0.85 0.85" width={0.12} colour={WHITE} />
}

export function PauseIcon() {
  return (
    <Icon>
      <rect x={-0.58} y={-0.68} width={0.4} height={1.36} rx={0.14} fill={WHITE} {...ink} />
      <rect x={0.18} y={-0.68} width={0.4} height={1.36} rx={0.14} fill={WHITE} {...ink} />
    </Icon>
  )
}

export function PlayIcon() {
  return (
    <Icon>
      <path d="M -0.45 -0.72 L 0.75 0 L -0.45 0.72 Z" fill={WHITE} {...ink} strokeWidth={LINE * 1.2} />
    </Icon>
  )
}

const SPEAKER = 'M -0.9 -0.3 H -0.5 L 0 -0.72 V 0.72 L -0.5 0.3 H -0.9 Z'

export function SoundIcon({ on }: { on: boolean }) {
  return (
    <Icon>
      <path d={SPEAKER} fill={WHITE} {...ink} />
      {on ? (
        <>
          <path d="M 0.28 -0.32 Q 0.48 0 0.28 0.32" fill="none" {...ink} />
          <path d="M 0.52 -0.62 Q 0.92 0 0.52 0.62" fill="none" {...ink} />
        </>
      ) : (
        <Tube d="M 0.32 -0.28 L 0.86 0.26 M 0.86 -0.28 L 0.32 0.26" width={0.1} colour={WHITE} />
      )}
    </Icon>
  )
}

export function MusicIcon({ on }: { on: boolean }) {
  return (
    <Icon>
      <Solid>
        <ellipse cx={-0.45} cy={0.52} rx={0.3} ry={0.22} transform="rotate(-20 -0.45 0.52)" fill={WHITE} />
        <ellipse cx={0.5} cy={0.34} rx={0.3} ry={0.22} transform="rotate(-20 0.5 0.34)" fill={WHITE} />
        <path d="M -0.2 0.5 V -0.5 L 0.75 -0.72 V 0.32 H 0.68 V -0.42 L -0.13 -0.24 V 0.5 Z" fill={WHITE} />
      </Solid>
      {!on && <Off />}
    </Icon>
  )
}

export function FullScreenIcon() {
  return (
    <Icon>
      <Tube d="M -0.78 -0.3 V -0.78 H -0.3 M 0.3 -0.78 H 0.78 V -0.3 M 0.78 0.3 V 0.78 H 0.3 M -0.3 0.78 H -0.78 V 0.3" width={0.16} colour={WHITE} />
    </Icon>
  )
}

/** Home: a little house with a cat-ear roof, the road's way back to the street. */
export function HouseIcon() {
  return (
    <Icon>
      <Solid>
        <path d="M -0.66 -0.08 L 0 -0.7 L 0.66 -0.08 V 0.8 H -0.66 Z" fill={YELLOW} />
        <path d="M -0.5 -0.32 L -0.62 -0.86 L -0.2 -0.6 Z M 0.5 -0.32 L 0.62 -0.86 L 0.2 -0.6 Z" fill={YELLOW} />
      </Solid>
      <path d="M -0.9 0.06 L 0 -0.8 L 0.9 0.06" fill="none" {...ink} strokeWidth={LINE * 1.4} />
      <rect x={-0.2} y={0.24} width={0.4} height={0.56} rx={0.08} fill={BOX.cobalt.face} {...ink} />
    </Icon>
  )
}

/** Back: a fat arrow to the left. */
export function BackIcon() {
  return (
    <Icon>
      <Solid>
        <path d="M -0.85 0 L -0.1 -0.68 V -0.3 H 0.82 V 0.3 H -0.1 V 0.68 Z" fill={WHITE} />
      </Solid>
    </Icon>
  )
}

/** More games: four little cards, the games' directory. */
export function GamesIcon() {
  return (
    <Icon>
      {[
        [-0.82, -0.82],
        [0.08, -0.82],
        [-0.82, 0.08],
        [0.08, 0.08],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width={0.74} height={0.74} rx={0.16} fill={i === 0 ? YELLOW : WHITE} {...ink} />
      ))}
    </Icon>
  )
}

/** Start again: a loop back to the start. */
export function RestartIcon() {
  return (
    <Icon>
      <Tube d="M 0.62 0.3 A 0.66 0.66 0 1 1 0.5 -0.44" width={0.16} colour={WHITE} />
      <Solid>
        <path d="M 0.78 -0.86 L 0.82 -0.22 L 0.2 -0.36 Z" fill={WHITE} />
      </Solid>
    </Icon>
  )
}

/** Undo the dice: a loop turning back. */
export function UndoIcon() {
  return (
    <Icon>
      <Tube d="M -0.5 -0.2 H 0.25 A 0.5 0.5 0 0 1 0.25 0.8 H -0.2" width={0.18} colour={WHITE} />
      <Solid>
        <path d="M -0.92 -0.2 L -0.36 -0.66 V 0.26 Z" fill={WHITE} />
      </Solid>
    </Icon>
  )
}

/** Good night: a sleepy crescent moon and a star. */
export function MoonIcon() {
  return (
    <Icon>
      <Solid>
        <path d="M 0.2 -0.86 A 0.86 0.86 0 1 0 0.86 0.3 A 0.66 0.66 0 1 1 0.2 -0.86 Z" fill={HAT_LOOK.yellow.top} />
      </Solid>
      <path d="M 0.62 -0.86 L 0.7 -0.62 L 0.94 -0.6 L 0.75 -0.45 L 0.82 -0.22 L 0.62 -0.36 L 0.42 -0.22 L 0.49 -0.45 L 0.3 -0.6 L 0.54 -0.62 Z" fill={WHITE} {...ink} strokeWidth={LINE * 0.7} />
    </Icon>
  )
}

/** The dice: a big die showing five. */
export function DiceIcon() {
  return (
    <Icon>
      <rect x={-0.8} y={-0.8} width={1.6} height={1.6} rx={0.36} fill={WHITE} {...ink} strokeWidth={LINE * 1.3} />
      {[
        [-0.38, -0.38],
        [0.38, -0.38],
        [0, 0],
        [-0.38, 0.38],
        [0.38, 0.38],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={0.15} fill={INK} />
      ))}
    </Icon>
  )
}

/** The take-back tool: an open mitten hand reaching down. */
export function HandIcon() {
  return (
    <Icon>
      <Solid>
        <rect x={-0.5} y={-0.55} width={1.0} height={1.15} rx={0.42} fill={YELLOW} />
        <ellipse cx={-0.62} cy={-0.05} rx={0.2} ry={0.38} transform="rotate(25 -0.62 -0.05)" fill={YELLOW} />
        <rect x={-0.34} y={0.42} width={0.68} height={0.5} rx={0.1} fill={BOX.cobalt.face} />
      </Solid>
      <path d="M -0.16 -0.5 V -0.1 M 0.14 -0.5 V -0.1" fill="none" {...ink} strokeWidth={LINE * 0.8} />
    </Icon>
  )
}

/** The doorbell: a round bell with its clapper. */
export function BellIcon() {
  return (
    <Icon>
      <Solid>
        <path d="M -0.66 0.52 C -0.6 0.1 -0.58 -0.62 0 -0.66 C 0.58 -0.62 0.6 0.1 0.66 0.52 Z" fill={YELLOW} />
        <circle cx={0} cy={0.7} r={0.18} fill={YELLOW} />
        <circle cx={0} cy={-0.78} r={0.12} fill={YELLOW} />
      </Solid>
      <path d="M -0.8 0.52 H 0.8" {...ink} strokeWidth={LINE * 1.4} />
    </Icon>
  )
}

/** The horn: a round bulb horn, soft like its meep meep. */
export function HornIcon() {
  return (
    <Icon>
      <Solid>
        <path d="M -0.2 -0.16 L 0.7 -0.62 V 0.62 L -0.2 0.16 Z" fill={YELLOW} />
        <circle cx={-0.5} cy={0} r={0.42} fill={BOX.orange.face} />
      </Solid>
      <path d="M 0.86 -0.3 Q 0.98 0 0.86 0.3" fill="none" {...ink} />
    </Icon>
  )
}

/** The pedal: a fat arrow forward. */
export function GoIcon() {
  return (
    <Icon>
      <Solid>
        <path d="M -0.8 -0.34 H 0.06 V -0.78 L 0.88 0 L 0.06 0.78 V 0.34 H -0.8 Z" fill={WHITE} />
      </Solid>
    </Icon>
  )
}

/** Another room: two arrows chasing each other round. */
export function SwapIcon() {
  return (
    <Icon>
      <Tube d="M -0.64 0.1 A 0.64 0.64 0 0 1 0.46 -0.42" width={0.16} colour={WHITE} />
      <Tube d="M 0.64 -0.1 A 0.64 0.64 0 0 1 -0.46 0.42" width={0.16} colour={WHITE} />
      <Solid>
        <path d="M 0.78 -0.84 L 0.76 -0.22 L 0.2 -0.44 Z" fill={WHITE} />
        <path d="M -0.78 0.84 L -0.76 0.22 L -0.2 0.44 Z" fill={WHITE} />
      </Solid>
    </Icon>
  )
}

/** The tick on a tray item that is in the room. */
export function TickIcon() {
  return (
    <Icon>
      <circle r={0.92} fill={BOX.grass.face} {...ink} />
      <Tube d="M -0.42 0.02 L -0.1 0.34 L 0.46 -0.3" width={0.2} colour={WHITE} />
    </Icon>
  )
}

/** A paint pot full of `paint`, a brush resting in it; with no paint, the picture behind the icon shows as the paint (the floor's pot). */
export function PotIcon({ paint }: { paint: string | null }) {
  return (
    <Icon>
      <path d="M 0.12 -0.2 L 0.62 -0.94" {...ink} strokeWidth={0.2} />
      <path d="M 0.12 -0.2 L 0.62 -0.94" stroke={BOX.soil.face} strokeWidth={0.08} strokeLinecap="round" />
      <path d="M -0.7 -0.2 H 0.7 L 0.58 0.84 H -0.58 Z" fill={BOX.steel.top} {...ink} />
      <path d="M -0.7 -0.2 H 0.7 L 0.66 0.16 C 0.3 0.3 0.1 0.04 -0.2 0.2 C -0.4 0.3 -0.6 0.18 -0.66 0.16 Z" fill={paint ?? 'none'} {...ink} />
    </Icon>
  )
}

/** The hint hand: a pointing mitten, its fingertip at the top centre of its box. */
export function PointIcon() {
  return (
    <svg className="icon" viewBox="-1 -1.12 2 2.6" aria-hidden>
      <Solid>
        <rect x={-0.22} y={-1} width={0.42} height={1.2} rx={0.21} fill={WHITE} />
        <rect x={-0.62} y={-0.1} width={1.24} height={1.1} rx={0.4} fill={WHITE} />
        <ellipse cx={-0.66} cy={0.3} rx={0.2} ry={0.36} transform="rotate(-30 -0.66 0.3)" fill={WHITE} />
        <rect x={-0.42} y={0.85} width={0.92} height={0.5} rx={0.14} fill={BOX.cobalt.face} />
      </Solid>
    </svg>
  )
}
