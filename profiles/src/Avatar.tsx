import { useId } from 'react'

import type { Avatar } from './avatar'

/**
 * An avatar drawn as a round sticker in the gallery's look: a coloured backdrop, a face with
 * its hair, eyes, mouth and an extra, an ink line round every shape and the die-cut white rim.
 * Drawn in a 100 x 100 box from the back to the front: the shirt, the hair behind the head,
 * ears that stand behind it, the head, the hair in front, the face, and what sits on top.
 */

const INK = '#2a2f45'
const MOUTH = '#8a2e45'
const BLUSH = '#ff8fa3'

const BACKDROPS: Record<Avatar['backdrop'], { fill: string; shirt: string }> = {
  sky: { fill: '#8fd8ff', shirt: '#3a7bd5' },
  pink: { fill: '#ffc2e2', shirt: '#e0518a' },
  sun: { fill: '#ffe27a', shirt: '#f08a24' },
  mint: { fill: '#9fe3cf', shirt: '#1f9e7a' },
  lilac: { fill: '#d5c3ff', shirt: '#7a5ce0' },
  peach: { fill: '#ffd2a8', shirt: '#e05f3f' },
  grass: { fill: '#b4e59a', shirt: '#3f9e3a' },
  sea: { fill: '#7fd4e6', shirt: '#2a5fa8' },
}

const SKINS: Record<Avatar['skin'], string> = {
  milk: '#ffe5d0',
  peach: '#f8cba6',
  honey: '#e6ae7e',
  caramel: '#c98a58',
  cocoa: '#91603c',
  coffee: '#5f3c28',
}

const HAIR_COLOURS: Record<Avatar['hairColour'], string> = {
  brown: '#7a4a2a',
  black: '#2f2a38',
  blonde: '#f5cf57',
  ginger: '#e0702e',
  pink: '#ff86c0',
  blue: '#4cb5f0',
  purple: '#9a6bff',
  green: '#4cc26a',
}

/** The fringe most styles wear over the forehead. */
const FRINGE = 'M27 52C26 33 37 26 50 26C63 26 74 33 73 52C70 44 65 40 59 38C53 43 41 44 35 40C31 43 28 47 27 52Z'

/** Hair behind the head, and hair in front of it, by style. */
function hairShapes(hair: Avatar['hair']): { back: string[]; backCircles: [number, number, number][]; front: string[]; frontCircles: [number, number, number][] } {
  switch (hair) {
    case 'short':
      return { back: [], backCircles: [], front: [FRINGE], frontCircles: [] }
    case 'long':
      return { back: ['M24 50C22 30 36 21 50 21C64 21 78 30 76 50L81 94L19 94Z'], backCircles: [], front: ['M27 52C26 33 38 27 50 27C62 27 74 33 73 52C69 42 61 36 51 35C45 42 36 47 27 52Z'], frontCircles: [] }
    case 'bob':
      return { back: ['M24 52C22 30 36 22 50 22C64 22 78 30 76 52L77 72C71 76 65 75 62 72L38 72C35 75 29 76 23 72Z'], backCircles: [], front: ['M27 50C27 34 38 28 50 28C62 28 73 34 73 50C66 44 59 39 50 38C41 39 34 44 27 50Z'], frontCircles: [] }
    case 'pigtails':
      return { back: [], backCircles: [[20, 60, 10], [80, 60, 10]], front: [FRINGE], frontCircles: [] }
    case 'bun':
      return { back: [], backCircles: [[50, 21, 11]], front: [FRINGE], frontCircles: [] }
    case 'curly':
      return {
        back: [],
        backCircles: [[29, 42, 9], [35, 31, 9], [45, 25, 9], [55, 25, 9], [65, 31, 9], [71, 42, 9], [26, 53, 8], [74, 53, 8]],
        front: [],
        frontCircles: [[37, 34, 7], [50, 30, 7.5], [63, 34, 7]],
      }
    case 'spiky':
      return { back: [], backCircles: [], front: ['M27 51L25 36L33 38L33 25L41 31L47 20L53 30L60 21L62 31L70 26L68 38L75 36L73 51C68 43 60 40 50 40C40 40 32 43 27 51Z'], frontCircles: [] }
    case 'none':
      return { back: [], backCircles: [], front: [], frontCircles: [] }
  }
}

/** The eyes, at 41 and 59 across and 53 down. */
function Eyes({ eyes }: { eyes: Avatar['eyes'] }) {
  const dot = (x: number) => (
    <g key={x}>
      <circle cx={x} cy={53} r={3.6} fill={INK} />
      <circle cx={x + 1.2} cy={51.8} r={1.2} fill="#fff" />
    </g>
  )
  const arc = (x: number) => <path key={x} d={`M${x - 5} 55Q${x} 48 ${x + 5} 55`} stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />
  switch (eyes) {
    case 'dots':
      return <>{[dot(41), dot(59)]}</>
    case 'big':
      return (
        <>
          {[41, 59].map((x) => (
            <g key={x}>
              <ellipse cx={x} cy={52} rx={5.2} ry={6.2} fill="#fff" stroke={INK} strokeWidth={2} />
              <circle cx={x + 0.6} cy={53} r={3.3} fill={INK} />
              <circle cx={x + 1.8} cy={51.4} r={1.3} fill="#fff" />
            </g>
          ))}
        </>
      )
    case 'happy':
      return <>{[arc(41), arc(59)]}</>
    case 'wink':
      return <>{[dot(41), arc(59)]}</>
    case 'sleepy':
      return (
        <>
          {[41, 59].map((x) => (
            <path key={x} d={`M${x - 5} 52Q${x} 57 ${x + 5} 52`} stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />
          ))}
        </>
      )
  }
}

function Mouth({ mouth }: { mouth: Avatar['mouth'] }) {
  switch (mouth) {
    case 'smile':
      return <path d="M43 65Q50 72 57 65" stroke={INK} strokeWidth={2.8} fill="none" strokeLinecap="round" />
    case 'grin':
      return (
        <g stroke={INK} strokeWidth={2.2} strokeLinejoin="round">
          <path d="M41 64H59Q57 75 50 75Q43 75 41 64Z" fill={MOUTH} />
          <path d="M43 64.5H57L56 67.5H44Z" fill="#fff" strokeWidth={1.2} />
        </g>
      )
    case 'tongue':
      return (
        <g stroke={INK} strokeWidth={2.2} strokeLinejoin="round">
          <path d="M42 64H58Q56 73 50 73Q44 73 42 64Z" fill={MOUTH} />
          <ellipse cx={50} cy={70.5} rx={4.5} ry={3.2} fill="#ff6f91" strokeWidth={1.4} />
        </g>
      )
    case 'oh':
      return <ellipse cx={50} cy={67} rx={3.6} ry={4.6} fill={MOUTH} stroke={INK} strokeWidth={2.2} />
    case 'cat':
      return <path d="M43 65Q46.5 69.5 50 65Q53.5 69.5 57 65" stroke={INK} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  }
}

/** Ears that stand behind the head: a cat's in the hair colour, a bunny's white. */
function EarsBehind({ extra, hair }: { extra: Avatar['extra']; hair: string }) {
  if (extra === 'cat-ears')
    return (
      <g stroke={INK} strokeWidth={2.4} strokeLinejoin="round">
        <path d="M27 42L29 15L46 29Z" fill={hair} />
        <path d="M73 42L71 15L54 29Z" fill={hair} />
        <path d="M31 34L32 22L40 29Z" fill="#ff9fbf" strokeWidth={1.4} />
        <path d="M69 34L68 22L60 29Z" fill="#ff9fbf" strokeWidth={1.4} />
      </g>
    )
  if (extra === 'bunny-ears')
    return (
      <g stroke={INK} strokeWidth={2.4}>
        <ellipse cx={39} cy={17} rx={6.5} ry={17} transform="rotate(-12 39 17)" fill="#fff" />
        <ellipse cx={61} cy={17} rx={6.5} ry={17} transform="rotate(12 61 17)" fill="#fff" />
        <ellipse cx={39} cy={18} rx={3} ry={11} transform="rotate(-12 39 18)" fill="#ffb3cc" strokeWidth={0} />
        <ellipse cx={61} cy={18} rx={3} ry={11} transform="rotate(12 61 18)" fill="#ffb3cc" strokeWidth={0} />
      </g>
    )
  return null
}

/** What sits on the head or the face, drawn last. */
function ExtraOnTop({ extra }: { extra: Avatar['extra'] }) {
  switch (extra) {
    case 'crown':
      return (
        <g stroke={INK} strokeWidth={2.2} strokeLinejoin="round">
          <path d="M33 31L35 15L43 24L50 11L57 24L65 15L67 31Z" fill="#ffd23f" />
          <circle cx={50} cy={25} r={2.6} fill="#ff5d7a" strokeWidth={1.4} />
          <circle cx={40} cy={27} r={1.9} fill="#4cc9e0" strokeWidth={1.2} />
          <circle cx={60} cy={27} r={1.9} fill="#4cc9e0" strokeWidth={1.2} />
        </g>
      )
    case 'bow':
      return (
        <g stroke={INK} strokeWidth={2.2} strokeLinejoin="round">
          <path d="M66 29L55 21L56 37Z" fill="#ff5d9e" />
          <path d="M66 29L77 21L76 37Z" fill="#ff5d9e" />
          <circle cx={66} cy={29} r={3.8} fill="#ff86b8" />
        </g>
      )
    case 'cap':
      return (
        <g stroke={INK} strokeWidth={2.3} strokeLinejoin="round">
          <path d="M27 42C27 25 38 20 50 20C62 20 73 25 73 42Z" fill="#ff5a4e" />
          <path d="M50 20V42" fill="none" strokeWidth={1.4} />
          <path d="M22 43Q50 34 78 43Q78 49 50 46Q22 49 22 43Z" fill="#d93a32" />
          <circle cx={50} cy={20.5} r={2.2} fill="#ff5a4e" strokeWidth={1.4} />
        </g>
      )
    case 'glasses':
      return (
        <g stroke={INK} strokeWidth={2.2} fill="rgba(255,255,255,0.28)">
          <circle cx={41} cy={53} r={7.2} />
          <circle cx={59} cy={53} r={7.2} />
          <path d="M48.2 52.5Q50 51 51.8 52.5M33.8 52L27.5 50.5M66.2 52L72.5 50.5" fill="none" strokeLinecap="round" />
        </g>
      )
    case 'flower':
      return (
        <g stroke={INK} strokeWidth={1.8}>
          {[0, 72, 144, 216, 288].map((a) => (
            <circle key={a} cx={68 + 5 * Math.cos((a * Math.PI) / 180)} cy={31 + 5 * Math.sin((a * Math.PI) / 180)} r={4.2} fill="#fff" />
          ))}
          <circle cx={68} cy={31} r={3.4} fill="#ffd23f" />
        </g>
      )
    case 'none':
    case 'cat-ears':
    case 'bunny-ears':
      return null
  }
}

export function AvatarPicture({ avatar, className }: { avatar: Avatar; className: string }) {
  const clip = useId()
  const backdrop = BACKDROPS[avatar.backdrop]
  const skin = SKINS[avatar.skin]
  const hair = HAIR_COLOURS[avatar.hairColour]
  const shapes = hairShapes(avatar.hair)
  return (
    <svg className={className} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <clipPath id={clip}>
          <circle cx={50} cy={50} r={44} />
        </clipPath>
      </defs>
      <circle cx={50} cy={50} r={48.5} fill="#fff" />
      <circle cx={50} cy={50} r={44} fill={backdrop.fill} />
      <g clipPath={`url(#${clip})`} strokeLinejoin="round">
        <path d="M14 104C14 85 29 79 50 79C71 79 86 85 86 104Z" fill={backdrop.shirt} stroke={INK} strokeWidth={2.4} />
        <path d="M44 70H56V82Q50 86 44 82Z" fill={skin} stroke={INK} strokeWidth={2.4} />
        <g fill={hair} stroke={INK} strokeWidth={2.4}>
          {shapes.back.map((d) => (
            <path key={d} d={d} />
          ))}
          {shapes.backCircles.map(([x, y, r]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
        <EarsBehind extra={avatar.extra} hair={hair} />
        <g fill={skin} stroke={INK} strokeWidth={2.4}>
          <circle cx={26} cy={56} r={6} />
          <circle cx={74} cy={56} r={6} />
          <ellipse cx={50} cy={53} rx={23.5} ry={24.5} />
        </g>
        <g fill={hair} stroke={INK} strokeWidth={2.4}>
          {shapes.front.map((d) => (
            <path key={d} d={d} />
          ))}
          {shapes.frontCircles.map(([x, y, r]) => (
            <circle key={`${x},${y}`} cx={x} cy={y} r={r} />
          ))}
        </g>
        <ellipse cx={34.5} cy={62} rx={4.2} ry={2.6} fill={BLUSH} opacity={0.65} />
        <ellipse cx={65.5} cy={62} rx={4.2} ry={2.6} fill={BLUSH} opacity={0.65} />
        <Eyes eyes={avatar.eyes} />
        <Mouth mouth={avatar.mouth} />
        <ExtraOnTop extra={avatar.extra} />
      </g>
      <circle cx={50} cy={50} r={44} fill="none" stroke={INK} strokeWidth={2.6} />
    </svg>
  )
}
