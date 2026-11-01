/**
 * The HUD's icons: fat round strokes in the chocolate ink over a white fill, so they read on
 * the gingham buttons and over the picture alike. Each fills its box (24 x 24 units).
 */

const INK = '#4A2B22'

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  )
}

export function PauseIcon() {
  return (
    <Svg>
      <rect x="6" y="5" width="4" height="14" rx="1.5" fill="#fff" />
      <rect x="14" y="5" width="4" height="14" rx="1.5" fill="#fff" />
    </Svg>
  )
}

export function PlayIcon() {
  return (
    <Svg>
      <path d="M8 5.5 L18.5 12 L8 18.5 Z" fill="#fff" />
    </Svg>
  )
}

export function RestartIcon() {
  return (
    <Svg>
      <path d="M18.5 12 A6.5 6.5 0 1 1 15.8 6.7" />
      <path d="M16.5 3.5 L16 7.2 L19.6 7.8" />
    </Svg>
  )
}

/** The course cards: a little map with a flag. */
export function CardsIcon() {
  return (
    <Svg>
      <rect x="3.5" y="5" width="7" height="6" rx="1.5" fill="#fff" />
      <rect x="13.5" y="5" width="7" height="6" rx="1.5" fill="#fff" />
      <rect x="3.5" y="14" width="7" height="6" rx="1.5" fill="#fff" />
      <rect x="13.5" y="14" width="7" height="6" rx="1.5" fill="#fff" />
    </Svg>
  )
}

export function BackIcon() {
  return (
    <Svg>
      <path d="M14.5 5.5 L8 12 L14.5 18.5" strokeWidth={3} />
    </Svg>
  )
}

export function MusicIcon({ off }: { off: boolean }) {
  return (
    <Svg>
      <path d="M9 17.5 V6.5 L18 4.5 V15.5" />
      <circle cx="7" cy="17.5" r="2.4" fill="#fff" />
      <circle cx="16" cy="15.5" r="2.4" fill="#fff" />
      {off && <path d="M4 4 L20 20" stroke="#FF5A4E" strokeWidth={2.8} />}
    </Svg>
  )
}

export function SoundIcon({ off }: { off: boolean }) {
  return (
    <Svg>
      <path d="M4.5 9.5 H8 L12.5 5.5 V18.5 L8 14.5 H4.5 Z" fill="#fff" />
      {!off && <path d="M15.5 9 A4 4 0 0 1 15.5 15 M18 6.5 A7.5 7.5 0 0 1 18 17.5" />}
      {off && <path d="M15.5 9.5 L20.5 14.5 M20.5 9.5 L15.5 14.5" stroke="#FF5A4E" strokeWidth={2.8} />}
    </Svg>
  )
}

export function FullScreenIcon() {
  return (
    <Svg>
      <path d="M4.5 9 V4.5 H9 M15 4.5 H19.5 V9 M19.5 15 V19.5 H15 M9 19.5 H4.5 V15" />
    </Svg>
  )
}

/** Back to the game directory. */
export function HouseIcon() {
  return (
    <Svg>
      <path d="M4 11.5 L12 4.5 L20 11.5" />
      <path d="M6.5 10 V19.5 H17.5 V10" fill="#fff" />
      <rect x="10" y="14" width="4" height="5.5" rx="1" />
    </Svg>
  )
}

export function PadlockIcon() {
  return (
    <Svg>
      <path d="M8 11 V8 A4 4 0 0 1 16 8 V11" />
      <rect x="5.5" y="11" width="13" height="9.5" rx="2.5" fill="#FFD23F" />
      <circle cx="12" cy="15.5" r="1.4" fill={INK} stroke="none" />
    </Svg>
  )
}

export function CheckIcon() {
  return (
    <Svg>
      <path d="M5.5 12.5 L10 17 L18.5 7.5" strokeWidth={3.4} stroke="#fff" />
    </Svg>
  )
}

/** A pointing hand: the ghost that shows where to touch. */
export function HandIcon() {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M9.5 13 V4.8 A1.6 1.6 0 0 1 12.7 4.8 V11 L13 11 V9.6 A1.5 1.5 0 0 1 16 9.6 V11.4 A1.5 1.5 0 0 1 19 11.4 V15.5 C19 19 16.8 21.2 13.6 21.2 H12.4 C10.6 21.2 9.4 20.4 8.4 19 L5.2 14.6 A1.5 1.5 0 0 1 7.6 12.8 Z"
        fill="#fff"
        stroke={INK}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
    </svg>
  )
}
