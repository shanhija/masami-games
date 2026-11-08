import { Children, cloneElement, type ReactElement, type ReactNode, type SVGProps } from 'react'

import type { Actor, Mood, RoomId, Worn } from './engine/types'

/**
 * The HUD's pictures: bold, simple flat drawings with a dark ink line around each, like the toys
 * in the rooms, so they read over grass, tiles and moss alike. Every icon is drawn in the same
 * square, two units across with room for the line.
 */
const INK = '#2b2b30'
const LINE = 0.09

type Shape = ReactElement<SVGProps<SVGElement>>

/** A line drawn in ink: chains, rails, whiskers, smiles. */
const ink = { fill: 'none', stroke: INK, strokeWidth: LINE * 1.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

/** Filled shapes drawn twice, fat in ink and then in their own colours on top, so the group shares one outline with no seams inside. */
function Inked({ children }: { children: ReactNode }) {
  const shapes = Children.toArray(children) as Shape[]
  return (
    <>
      {shapes.map((s, i) => cloneElement(s, { key: `ink${i}`, fill: INK, stroke: INK, strokeWidth: LINE * 2, strokeLinejoin: 'round' }))}
      {shapes.map((s, i) => cloneElement(s, { key: `fill${i}`, stroke: 'none' }))}
    </>
  )
}

function Icon({ size, children }: { size: number; children: ReactNode }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="-1.1 -1.1 2.2 2.2" aria-hidden>
      {children}
    </svg>
  )
}

/** The big talk button's microphone; crossed out when the page cannot use it. */
export function MicIcon({ size, off }: { size: number; off: boolean }) {
  return (
    <Icon size={size}>
      <path d="M -0.58,-0.12 A 0.58 0.58 0 0 0 0.58,-0.12 M 0,0.46 V 0.78 M -0.32,0.82 H 0.32" {...ink} strokeWidth={0.16} />
      <Inked>
        <rect x={-0.34} y={-0.98} width={0.68} height={1.16} rx={0.34} fill={off ? '#c9ced6' : '#ff7b6b'} />
      </Inked>
      <path d="M -0.16,-0.6 H 0.16 M -0.16,-0.38 H 0.16 M -0.16,-0.16 H 0.16" {...ink} strokeWidth={0.08} />
      <ellipse cx={-0.17} cy={-0.72} rx={0.06} ry={0.14} fill="#fff" opacity={0.7} />
      {off && (
        <>
          <path d="M -0.82,-0.86 L 0.82,0.86" {...ink} strokeWidth={0.34} />
          <path d="M -0.82,-0.86 L 0.82,0.86" {...ink} stroke="#e8503f" strokeWidth={0.18} />
        </>
      )}
    </Icon>
  )
}

/** Typing instead of talking: a keyboard. */
export function KeyboardIcon({ size }: { size: number }) {
  const keys = [-0.62, -0.31, 0, 0.31, 0.62]
  return (
    <Icon size={size}>
      <Inked>
        <rect x={-0.98} y={-0.6} width={1.96} height={1.2} rx={0.18} fill="#9fd0ff" />
      </Inked>
      {[-0.32, 0].map((y) => keys.map((x) => <rect key={`${x},${y}`} x={x - 0.11} y={y - 0.1} width={0.22} height={0.2} rx={0.05} fill="#fff" stroke={INK} strokeWidth={0.05} />))}
      <rect x={-0.45} y={0.22} width={0.9} height={0.2} rx={0.06} fill="#fff" stroke={INK} strokeWidth={0.05} />
    </Icon>
  )
}

/** Send what was typed: a fat arrow. */
export function SendIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <Inked>
        <path d="M -0.85,-0.26 H 0.05 V -0.72 L 0.9,0 L 0.05,0.72 V 0.26 H -0.85 Z" fill="#f2c14e" />
      </Inked>
    </Icon>
  )
}

/** The zoom: a fat plus to come closer, a minus to go back out. */
export function ZoomIcon({ size, closer }: { size: number; closer: boolean }) {
  return (
    <Icon size={size}>
      <Inked>
        <rect x={-0.78} y={-0.22} width={1.56} height={0.44} rx={0.14} fill="#6aa8ff" />
        {closer && <rect x={-0.22} y={-0.78} width={0.44} height={1.56} rx={0.14} fill="#6aa8ff" />}
      </Inked>
    </Icon>
  )
}

const COG_TEETH = Array.from({ length: 8 }, (_, i) => i * 45)

/** Thinking: a cog. The CSS turns it. */
export function CogIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <g className="cog">
        <Inked>
          {[
            ...COG_TEETH.map((a) => <rect key={a} x={-0.17} y={-0.98} width={0.34} height={0.5} rx={0.06} transform={`rotate(${a})`} fill="#9aa3ad" />),
            <circle key="body" r={0.66} fill="#9aa3ad" />,
          ]}
        </Inked>
        <circle r={0.24} fill="#fff" stroke={INK} strokeWidth={LINE} />
      </g>
    </Icon>
  )
}

export function PauseIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <Inked>
        <rect x={-0.62} y={-0.7} width={0.42} height={1.4} rx={0.12} fill="#fff" />
        <rect x={0.2} y={-0.7} width={0.42} height={1.4} rx={0.12} fill="#fff" />
      </Inked>
    </Icon>
  )
}

export function SoundIcon({ size, on }: { size: number; on: boolean }) {
  return (
    <Icon size={size}>
      <Inked>
        <path d="M -0.9,-0.32 H -0.5 L 0,-0.78 V 0.78 L -0.5,0.32 H -0.9 Z" fill="#f2c14e" />
      </Inked>
      {on ? <path d="M 0.28,-0.3 Q 0.46,0 0.28,0.3 M 0.52,-0.56 Q 0.86,0 0.52,0.56" {...ink} /> : <path d="M 0.3,-0.3 L 0.85,0.3 M 0.85,-0.3 L 0.3,0.3" {...ink} />}
    </Icon>
  )
}

/** The avatars talk back: a speech bubble with sound in it. */
export function VoiceIcon({ size, on }: { size: number; on: boolean }) {
  return (
    <Icon size={size}>
      <Inked>
        <path d="M -0.85,-0.75 H 0.85 Q 0.95,-0.75 0.95,-0.62 V 0.3 Q 0.95,0.42 0.85,0.42 H -0.15 L -0.6,0.85 V 0.42 H -0.85 Q -0.95,0.42 -0.95,0.3 V -0.62 Q -0.95,-0.75 -0.85,-0.75 Z" fill="#9fd0ff" />
      </Inked>
      {on ? <path d="M -0.5,-0.15 V -0.15 M -0.25,-0.4 V 0.1 M 0,-0.5 V 0.2 M 0.25,-0.4 V 0.1 M 0.5,-0.15 V -0.15" {...ink} /> : <path d="M -0.35,-0.45 L 0.35,0.15 M 0.35,-0.45 L -0.35,0.15" {...ink} />}
    </Icon>
  )
}

/** More games: four tiles. */
export function GamesIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <Inked>
        <rect x={-0.85} y={-0.85} width={0.75} height={0.75} rx={0.16} fill="#e8503f" />
        <rect x={0.1} y={-0.85} width={0.75} height={0.75} rx={0.16} fill="#f2c14e" />
        <rect x={-0.85} y={0.1} width={0.75} height={0.75} rx={0.16} fill="#5ec25a" />
        <rect x={0.1} y={0.1} width={0.75} height={0.75} rx={0.16} fill="#4a78e0" />
      </Inked>
    </Icon>
  )
}

/** Forget the newest thing: a bin. */
export function BinIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <Inked>
        <path d="M -0.6,-0.4 H 0.6 L 0.48,0.9 H -0.48 Z" fill="#c9ced6" />
        <rect x={-0.75} y={-0.62} width={1.5} height={0.22} rx={0.08} fill="#9aa3ad" />
        <rect x={-0.2} y={-0.82} width={0.4} height={0.22} rx={0.06} fill="#9aa3ad" />
      </Inked>
      <path d="M -0.22,-0.15 L -0.18,0.65 M 0.22,-0.15 L 0.18,0.65" {...ink} strokeWidth={0.08} />
    </Icon>
  )
}

export function FullIcon({ size }: { size: number }) {
  return (
    <Icon size={size}>
      <path d="M -0.8,-0.3 V -0.8 H -0.3 M 0.3,-0.8 H 0.8 V -0.3 M 0.8,0.3 V 0.8 H 0.3 M -0.3,0.8 H -0.8 V 0.3" {...ink} strokeWidth={0.2} />
    </Icon>
  )
}

/** The rooms as pictures: a slide on grass, a swim ring on water, two pines. */
export function RoomIcon({ room, size }: { room: RoomId; size: number }) {
  switch (room) {
    case 'playground':
      return (
        <Icon size={size}>
          <Inked>
            <rect x={-1} y={0.62} width={2} height={0.38} rx={0.1} fill="#7cc850" />
          </Inked>
          <path d="M -0.75,0.65 V -0.55 M -0.35,0.65 V -0.55 M -0.75,0.35 H -0.35 M -0.75,0.05 H -0.35 M -0.75,-0.25 H -0.35" {...ink} />
          <Inked>
            <path d="M -0.42,-0.62 H -0.1 Q 0.35,-0.5 0.6,0.3 Q 0.7,0.62 0.95,0.62 V 0.42 Q 0.82,0.42 0.76,0.22 Q 0.48,-0.72 -0.1,-0.8 H -0.42 Z" fill="#f2c14e" />
            <circle cx={0.15} cy={0.42} r={0.18} fill="#e8503f" />
          </Inked>
        </Icon>
      )
    case 'pool':
      return (
        <Icon size={size}>
          <Inked>
            <path d="M -1,-0.05 Q -0.75,-0.25 -0.5,-0.05 T 0,-0.05 T 0.5,-0.05 T 1,-0.05 V 0.9 Q 1,1 0.9,1 H -0.9 Q -1,1 -1,0.9 Z" fill="#58c4e8" />
          </Inked>
          <path d="M -0.75,0.55 Q -0.6,0.45 -0.45,0.55 M 0.45,0.75 Q 0.6,0.65 0.75,0.75" fill="none" stroke="#e8f8ff" strokeWidth={0.08} strokeLinecap="round" />
          <circle cx={0.05} cy={-0.18} r={0.5} fill="none" stroke={INK} strokeWidth={0.42} />
          <circle cx={0.05} cy={-0.18} r={0.5} fill="none" stroke="#fbf8f2" strokeWidth={0.26} />
          <circle cx={0.05} cy={-0.18} r={0.5} fill="none" stroke="#e8503f" strokeWidth={0.26} strokeDasharray="0.39 0.39" />
        </Icon>
      )
    case 'forest':
      return (
        <Icon size={size}>
          <Inked>
            <rect x={-0.62} y={0.45} width={0.2} height={0.45} fill="#8a5a34" />
            <rect x={0.42} y={0.55} width={0.18} height={0.38} fill="#8a5a34" />
            <polygon points="-0.52,-0.95 -0.05,-0.15 -0.25,-0.15 0.08,0.5 -1.12,0.5 -0.79,-0.15 -0.99,-0.15" fill="#2f8a3f" />
            <polygon points="0.51,-0.6 0.92,0.05 0.75,0.05 1.02,0.6 0,0.6 0.27,0.05 0.1,0.05" fill="#4fb35a" />
          </Inked>
        </Icon>
      )
  }
}

/** The colour a worn thing shows: its tint, or the main colour of its own model. */
export type Paint = (worn: Worn) => string

/** A face's eyes and mouth for its mood. */
function Face({ mood, eyes }: { mood: Mood; eyes: string }) {
  const closed = mood === 'sleepy'
  return (
    <>
      {closed ? (
        <path d="M -0.3,-0.02 Q -0.2,0.05 -0.1,-0.02 M 0.1,-0.02 Q 0.2,0.05 0.3,-0.02" {...ink} strokeWidth={0.07} />
      ) : (
        <>
          <ellipse cx={-0.2} cy={-0.02} rx={0.075} ry={0.1} fill={eyes} stroke={INK} strokeWidth={0.04} />
          <ellipse cx={0.2} cy={-0.02} rx={0.075} ry={0.1} fill={eyes} stroke={INK} strokeWidth={0.04} />
          <circle cx={-0.18} cy={-0.06} r={0.03} fill="#fff" />
          <circle cx={0.22} cy={-0.06} r={0.03} fill="#fff" />
        </>
      )}
      {mood === 'surprised' || mood === 'scared' ? (
        <ellipse cx={0} cy={0.26} rx={0.07} ry={0.09} fill={INK} />
      ) : mood === 'sad' || mood === 'angry' ? (
        <path d="M -0.13,0.3 Q 0,0.2 0.13,0.3" {...ink} strokeWidth={0.07} />
      ) : (
        <path d="M -0.15,0.2 Q 0,0.34 0.15,0.2" {...ink} strokeWidth={0.07} />
      )}
    </>
  )
}

/** The hair's shape from its kind's name: the built-in hairs and whatever a made one is called. */
function hairStyle(kind: string): 'curly' | 'pigtails' | 'ponytail' | 'long' | 'short' {
  if (kind.includes('curl')) return 'curly'
  if (kind.includes('pigtail')) return 'pigtails'
  if (kind.includes('pony')) return 'ponytail'
  if (kind.includes('long') || kind.includes('braid')) return 'long'
  return 'short'
}

const CURLS = Array.from({ length: 11 }, (_, i) => Math.PI * (0.95 + (i / 10) * 1.1))

/** Hair behind the head: the part that sticks out past it. */
function HairBack({ style, color }: { style: ReturnType<typeof hairStyle>; color: string }) {
  switch (style) {
    case 'curly':
      return <Inked>{CURLS.map((a) => <circle key={a} cx={Math.cos(a) * 0.68} cy={-0.05 + Math.sin(a) * 0.68} r={0.26} fill={color} />)}</Inked>
    case 'pigtails':
      return (
        <Inked>
          <ellipse cx={-0.7} cy={0.12} rx={0.2} ry={0.32} fill={color} />
          <ellipse cx={0.7} cy={0.12} rx={0.2} ry={0.32} fill={color} />
        </Inked>
      )
    case 'ponytail':
      return (
        <Inked>
          <ellipse cx={0.72} cy={-0.3} rx={0.2} ry={0.42} transform="rotate(28 0.72 -0.3)" fill={color} />
        </Inked>
      )
    case 'long':
      return (
        <Inked>
          <rect x={-0.68} y={-0.6} width={1.36} height={1.15} rx={0.4} fill={color} />
        </Inked>
      )
    case 'short':
      return null
  }
}

/** The fringe over the forehead. */
const FRINGE = 'M -0.6,-0.02 C -0.64,-0.62 -0.25,-0.8 0,-0.78 C 0.3,-0.8 0.66,-0.6 0.6,-0.02 C 0.52,-0.3 0.3,-0.4 0.05,-0.36 C -0.2,-0.42 -0.5,-0.3 -0.6,-0.02 Z'

/** Something on the head, from its kind's name: a cap, a crown, any other hat. */
function HeadThing({ kind, color }: { kind: string; color: string }) {
  if (kind.includes('crown'))
    return (
      <Inked>
        <polygon points="-0.42,-0.5 -0.42,-0.95 -0.21,-0.7 0,-1 0.21,-0.7 0.42,-0.95 0.42,-0.5" fill={color} />
      </Inked>
    )
  if (kind.includes('cap'))
    return (
      <Inked>
        <path d="M -0.6,-0.3 Q -0.6,-0.86 0,-0.86 Q 0.6,-0.86 0.6,-0.3 Z" fill={color} />
        <path d="M 0.2,-0.36 H 0.98 Q 0.98,-0.22 0.86,-0.22 H 0.2 Z" fill={color} />
      </Inked>
    )
  return (
    <Inked>
      <path d="M -0.48,-0.45 Q -0.45,-1 0,-1 Q 0.45,-1 0.48,-0.45 Z" fill={color} />
      <rect x={-0.85} y={-0.52} width={1.7} height={0.16} rx={0.08} fill={color} />
    </Inked>
  )
}

/** A face for the cast row, in the actor's own colours: its skin or fur, hair, hat, glasses and top, its eyes and its mood. */
export function Portrait({ actor, size, paint }: { actor: Pick<Actor, 'look' | 'mood'>; size: number; paint: Paint }) {
  const { look, mood } = actor
  if (look.body === 'cat' || look.body === 'dog') {
    const cat = look.body === 'cat'
    return (
      <Icon size={size}>
        <Inked>
          {cat ? (
            <polygon points="-0.72,-0.2 -0.62,-0.95 -0.15,-0.55 0.15,-0.55 0.62,-0.95 0.72,-0.2" fill={look.skin} />
          ) : (
            <ellipse cx={-0.68} cy={-0.1} rx={0.24} ry={0.48} fill={look.skin} />
          )}
          {cat ? <ellipse cx={0} cy={0.08} rx={0.78} ry={0.66} fill={look.skin} /> : <ellipse cx={0} cy={0.05} rx={0.66} ry={0.7} fill={look.skin} />}
          {cat ? null : <ellipse cx={0.68} cy={-0.1} rx={0.24} ry={0.48} fill={look.skin} />}
        </Inked>
        <Face mood={mood} eyes={look.eyes} />
        <path d="M -0.08,0.12 H 0.08 L 0,0.2 Z" fill="#f7a8b8" stroke={INK} strokeWidth={0.04} strokeLinejoin="round" />
        {cat && <path d="M -0.35,0.2 H -0.85 M -0.35,0.28 L -0.8,0.4 M 0.35,0.2 H 0.85 M 0.35,0.28 L 0.8,0.4" {...ink} strokeWidth={0.04} />}
        {look.worn.head && <HeadThing kind={look.worn.head.kind} color={paint(look.worn.head)} />}
      </Icon>
    )
  }
  const hair = look.worn.hair
  const style = hair ? hairStyle(hair.kind) : 'short'
  const hairColor = hair ? paint(hair) : null
  return (
    <Icon size={size}>
      <Inked>
        <path d="M -0.9,1.1 Q -0.86,0.58 0,0.56 Q 0.86,0.58 0.9,1.1 Z" fill={look.top} />
      </Inked>
      {hairColor && <HairBack style={style} color={hairColor} />}
      <Inked>
        <circle cx={0} cy={-0.05} r={0.58} fill={look.skin} />
      </Inked>
      <ellipse cx={-0.34} cy={0.16} rx={0.1} ry={0.06} fill="#ff8fa3" opacity={0.55} />
      <ellipse cx={0.34} cy={0.16} rx={0.1} ry={0.06} fill="#ff8fa3" opacity={0.55} />
      <Face mood={mood} eyes={look.eyes} />
      {hairColor && (
        <Inked>
          <path d={FRINGE} fill={hairColor} />
        </Inked>
      )}
      {look.worn.face && (
        <>
          <path d="M -0.06,-0.04 H 0.06 M -0.34,-0.04 H -0.42 M 0.34,-0.04 H 0.42" {...ink} strokeWidth={0.06} />
          <circle cx={-0.2} cy={-0.03} r={0.15} fill="none" stroke={paint(look.worn.face)} strokeWidth={0.07} />
          <circle cx={0.2} cy={-0.03} r={0.15} fill="none" stroke={paint(look.worn.face)} strokeWidth={0.07} />
        </>
      )}
      {look.worn.head && <HeadThing kind={look.worn.head.kind} color={paint(look.worn.head)} />}
    </Icon>
  )
}
