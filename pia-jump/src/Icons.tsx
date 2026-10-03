import { Children, cloneElement, type ReactElement, type ReactNode, type SVGProps } from 'react'

import { COLOR, INK } from './draw/look'

/**
 * The HUD's icons, drawn in the picture-book ink style of the canvas art: white shapes with
 * one round ink outline, and fat ink strokes with a white core for arrows and chevrons. No
 * emoji anywhere (some tablets draw them as boxes). Pictures of things in the game (stars,
 * kittens, Pia, beds) are never icons: they come from the draw functions (Portrait.tsx).
 */
const LINE = 0.14

const ink = { stroke: INK, strokeWidth: LINE, strokeLinejoin: 'round', strokeLinecap: 'round' } as const

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

/** A line drawn as a white tube with an ink rim: arrows, chevrons, the restart loop. */
function Tube({ d, width }: { d: string; width: number }) {
  return (
    <>
      <path d={d} fill="none" stroke={INK} strokeWidth={width + LINE * 2} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke="#FFFFFF" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
    </>
  )
}

/** A slash across an icon: that thing is off. */
function Off() {
  return <Tube d="M -0.85 -0.85 L 0.85 0.85" width={0.12} />
}

export function PauseIcon() {
  return (
    <Icon>
      <rect x={-0.58} y={-0.68} width={0.4} height={1.36} rx={0.14} fill="#FFFFFF" {...ink} />
      <rect x={0.18} y={-0.68} width={0.4} height={1.36} rx={0.14} fill="#FFFFFF" {...ink} />
    </Icon>
  )
}

export function PlayIcon() {
  return (
    <Icon>
      <path d="M -0.45 -0.72 L 0.75 0 L -0.45 0.72 Z" fill="#FFFFFF" {...ink} strokeWidth={LINE * 1.2} />
    </Icon>
  )
}

const SPEAKER = 'M -0.9 -0.3 H -0.5 L 0 -0.72 V 0.72 L -0.5 0.3 H -0.9 Z'

export function SoundIcon({ on }: { on: boolean }) {
  return (
    <Icon>
      <path d={SPEAKER} fill="#FFFFFF" {...ink} />
      {on ? (
        <>
          <path d="M 0.28 -0.32 Q 0.48 0 0.28 0.32" fill="none" {...ink} />
          <path d="M 0.52 -0.62 Q 0.92 0 0.52 0.62" fill="none" {...ink} />
        </>
      ) : (
        <Tube d="M 0.32 -0.28 L 0.86 0.26 M 0.86 -0.28 L 0.32 0.26" width={0.1} />
      )}
    </Icon>
  )
}

export function MusicIcon({ on }: { on: boolean }) {
  return (
    <Icon>
      <Solid>
        <ellipse cx={-0.45} cy={0.52} rx={0.3} ry={0.22} transform="rotate(-20 -0.45 0.52)" fill="#FFFFFF" />
        <ellipse cx={0.5} cy={0.34} rx={0.3} ry={0.22} transform="rotate(-20 0.5 0.34)" fill="#FFFFFF" />
        <path d="M -0.2 0.5 V -0.5 L 0.75 -0.72 V 0.32 H 0.68 V -0.42 L -0.13 -0.24 V 0.5 Z" fill="#FFFFFF" />
      </Solid>
      {!on && <Off />}
    </Icon>
  )
}

export function FullScreenIcon() {
  return (
    <Icon>
      <Tube d="M -0.78 -0.3 V -0.78 H -0.3 M 0.3 -0.78 H 0.78 V -0.3 M 0.78 0.3 V 0.78 H 0.3 M -0.3 0.78 H -0.78 V 0.3" width={0.16} />
    </Icon>
  )
}

export function HouseIcon() {
  return (
    <Icon>
      <Solid>
        <path d="M -0.62 -0.12 L 0 -0.7 L 0.62 -0.12 V 0.8 H -0.62 Z" fill="#FFFFFF" />
      </Solid>
      <path d="M -0.88 0.02 L 0 -0.82 L 0.88 0.02" fill="none" {...ink} strokeWidth={LINE * 1.4} />
      <rect x={-0.2} y={0.22} width={0.4} height={0.58} rx={0.08} fill="#FF6FAE" {...ink} />
    </Icon>
  )
}

/** Back out of the game, to the games directory. */
export function BackIcon() {
  return (
    <Icon>
      <Solid>
        <path d="M -0.85 0 L -0.1 -0.68 V -0.3 H 0.82 V 0.3 H -0.1 V 0.68 Z" fill="#FFFFFF" />
      </Solid>
    </Icon>
  )
}

/** Round again, from the start. */
export function RestartIcon() {
  return (
    <Icon>
      <Tube d="M 0.62 0.3 A 0.66 0.66 0 1 1 0.5 -0.44" width={0.16} />
      <Solid>
        <path d="M 0.78 -0.86 L 0.82 -0.22 L 0.2 -0.36 Z" fill="#FFFFFF" />
      </Solid>
    </Icon>
  )
}

export function PadlockIcon() {
  return (
    <Icon>
      <Tube d="M -0.42 -0.05 V -0.38 A 0.42 0.42 0 0 1 0.42 -0.38 V -0.05" width={0.14} />
      <rect x={-0.68} y={-0.12} width={1.36} height={0.96} rx={0.2} fill="#FFD98A" {...ink} />
      <circle cx={0} cy={0.24} r={0.11} fill={INK} />
      <path d="M 0 0.28 V 0.52" stroke={INK} strokeWidth={0.12} strokeLinecap="round" />
    </Icon>
  )
}

/** The pad's arrows and the jump's up arrow: one chevron, turned. */
export function ChevronIcon({ dir }: { dir: 'left' | 'right' | 'up' }) {
  const d = dir === 'left' ? 'M 0.24 -0.52 L -0.28 0 L 0.24 0.52' : dir === 'right' ? 'M -0.24 -0.52 L 0.28 0 L -0.24 0.52' : 'M -0.52 0.24 L 0 -0.28 L 0.52 0.24'
  return (
    <Icon>
      <Tube d={d} width={0.2} />
    </Icon>
  )
}

/** A soap bubble like the ones she blows: see-through film, a light rim inside an ink ring (so it reads on the see-through button), a sheen and a shine. */
export function BubbleIcon() {
  return (
    <Icon>
      <circle r={0.8} fill="none" stroke={INK} strokeWidth={LINE} />
      <circle r={0.66} fill={COLOR.bubbleFilm} stroke={COLOR.bubbleRim} strokeWidth={0.16} />
      <path d="M 0.5 0.26 A 0.56 0.56 0 0 1 -0.1 0.56" fill="none" stroke={COLOR.bubbleSheen[0]} strokeWidth={0.08} strokeLinecap="round" />
      <path d="M -0.5 -0.26 A 0.56 0.56 0 0 1 0.1 -0.56" fill="none" stroke={COLOR.bubbleSheen[1]} strokeWidth={0.08} strokeLinecap="round" />
      <ellipse cx={-0.28} cy={-0.32} rx={0.18} ry={0.09} transform="rotate(-35 -0.28 -0.32)" fill="#FFFFFF" />
    </Icon>
  )
}

/** The ghost hand that shows the controls: a pointing finger, its tip at the top centre of the box. */
export function HandIcon() {
  return (
    <svg className="icon" viewBox="-1 -1.12 2 2.6" aria-hidden>
      <Solid>
        <rect x={-0.22} y={-1} width={0.36} height={1.2} rx={0.18} fill="#FFFFFF" />
        <rect x={-0.62} y={-0.1} width={1.24} height={1.1} rx={0.36} fill="#FFFFFF" />
        <ellipse cx={-0.66} cy={0.3} rx={0.2} ry={0.36} transform="rotate(-30 -0.66 0.3)" fill="#FFFFFF" />
        <rect x={-0.42} y={0.85} width={0.92} height={0.5} rx={0.14} fill="#FFFFFF" />
      </Solid>
      <path d="M 0.14 0.02 V 0.36 M 0.44 0.06 V 0.36" fill="none" stroke={INK} strokeWidth={0.08} strokeLinecap="round" />
    </svg>
  )
}
