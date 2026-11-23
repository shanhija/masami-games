import { useCallback, useEffect, useRef, useState } from 'react'

import { randomAvatar, type Avatar } from '../../../profiles/src/avatar'
import type { Lang } from '../../../profiles/src/lang'
import { BUILTIN_ITEMS } from '../../../silly-billy/src/content'
import { buildRecipe } from '../../../silly-billy/src/engine/kit'
import type { Recipe } from '../../../silly-billy/src/engine/types'
import { HOUSE_SHELL, type ButtonShown, type Player, type World } from '../engine/world'
import { Hud, RecipeSketch } from '../shell/Hud'
import { claimSeat, sameDevice } from './claim'
import { SeatInput } from './input'
import { SEAT_COLORS, type Device, type FrameInput, type Pad, type Seat, type SeatIndex, type TouchPad } from './types'

/** A kit model of Silly Billy's built-in things, for a room's own button picture. */
function itemRecipe(id: string): Recipe {
  const item = BUILTIN_ITEMS.find((i) => i.id === id)
  if (item === undefined) throw new Error(`Silly Billy has no thing ${id}`)
  return buildRecipe(item.build, [item.name]).recipe
}

/** A player standing still, with the jobs and score given. */
function player(seat: SeatIndex, x: number, a: ButtonShown, b: ButtonShown, score: number | null): Player {
  return {
    id: seat,
    seat,
    at: [x, 0, 0],
    velocity: [0, 0, 0],
    facing: 1,
    heading: [1, 0, 0],
    on: null,
    stride: 0,
    jumpedAt: -Infinity,
    landedAt: -Infinity,
    threwAt: -Infinity,
    grabbedAt: -Infinity,
    landSpeed: 0,
    holding: null,
    pushing: null,
    bonkedUntil: -Infinity,
    heldSince: null,
    freeUntil: -Infinity,
    input: { stick: [0, 0], a: false, b: false },
    leftGroundAt: -Infinity,
    jumpKeptUntil: -Infinity,
    jumpHeld: false,
    lastFloor: null,
    change: null,
    back: null,
    jumpFrom: 0,
    steep: false,
    size: 1,
    start: [x, 0, 0],
    putFrame: -1,
    heldAt: [x, 0, 0],
    stick: 'walk',
    a,
    b,
    color: SEAT_COLORS[seat],
    score: score ?? 0,
    badge: score !== null,
    glow: null,
    body: { skin: '#f2c9a0', eyes: '#2b2b30', top: SEAT_COLORS[seat], bottom: '#3d4a7a', shoes: '#2b2b30', skirt: false, build: 1 },
    wear: {},
  }
}

/** A still room of four: five steps with two done and the third next, a clock with a little more than half left, and every kind of button: the engine's jump and grab, a room's own with a picture, and no second button. */
function stillWorld(): World {
  const words = { en: 'Hint', fi: 'Vihje' }
  return {
    t: 70,
    frame: 4200,
    seed: 1,
    rng: 1,
    level: 2,
    kind: 'together',
    view: 'side',
    bounds: { min: [-8, 0, -2], max: [8, 9, 2] },
    camera: { x: 0, y: 4.5, width: 16, height: 9 },
    floorFrame: null,
    shell: HOUSE_SHELL,
    models: [itemRecipe('mushroom'), itemRecipe('bucket'), itemRecipe('rubber-duck')],
    solids: [],
    movers: [],
    things: [],
    decor: [],
    zones: [],
    lamps: [],
    signs: [],
    players: [
      player(0, -6, 'jump', 'grab', 3),
      player(1, -2, { word: { en: 'Bounce', fi: 'Pomppaa' }, icon: 0 }, null, null),
      player(2, 2, 'jump', 'grab', 12),
      player(3, 6, { word: { en: 'Fill', fi: 'Täytä' }, icon: 1 }, { word: { en: 'Quack', fi: 'Kvaak' }, icon: 2 }, 0),
    ],
    pushing: false,
    steps: [0, 1, 2, 3, 4].map((i) => ({ hint: words, at: [i * 3 - 6, 1, 0], target: null, doneAt: i < 2 ? i * 20 + 10 : null })),
    next: 2,
    rule: null,
    clock: 180,
    wayOut: { at: [7, 0, 0], open: false },
    helper: { at: [0, 6, 0], step: null, says: null, saidAt: -Infinity, quietSince: 50, hints: 0 },
    puffs: [],
    pops: [],
    sounds: [],
    shakes: [],
    serial: 0,
    contacts: [],
    uses: [],
    finishing: null,
    end: null,
    pointers: [],
  }
}

/** The fixed party: two on keys (zones 0 and 2) and two on the touch pads. */
const FIXED_SEATS: Seat[] = (
  [
    { kind: 'keys', zone: 0 },
    { kind: 'keys', zone: 2 },
    { kind: 'touch', pad: 0 },
    { kind: 'touch', pad: 1 },
  ] as Device[]
).map((device, i) => ({ index: i as SeatIndex, device, profile: `kid${i}`, color: SEAT_COLORS[i as SeatIndex] }))

/** Faces that are the same every time the sheet opens. */
function faces(): Avatar[] {
  let s = 7
  const random = () => {
    s = (s * 16807) % 2147483647
    return s / 2147483647
  }
  return [0, 1, 2, 3].map(() => randomAvatar(random))
}

/** Every device the readout shows: the four key zones, the two touch pads and the gamepads plugged in. */
function allDevices(input: SeatInput): Device[] {
  return [
    ...([0, 1, 2, 3] as const).map((zone): Device => ({ kind: 'keys', zone })),
    ...([0, 1] as const).map((pad): Device => ({ kind: 'touch', pad })),
    ...input.gamepadIndices().map((index): Device => ({ kind: 'gamepad', index })),
  ]
}

const deviceName = (d: Device) => (d.kind === 'keys' ? `keys ${d.zone}` : d.kind === 'touch' ? `touch ${d.pad}` : `gamepad ${d.index}`)
const fixed = (n: number) => (n >= 0 ? ' ' : '') + n.toFixed(2)

/** One device's line: its stick, each button held now and how many presses it has had. */
interface Line {
  device: Device
  pad: Pad
  presses: { a: number; b: number }
}

/**
 * The developer's sheet for the seats and the HUD (?sheet=seats): the HUD over a still room of four,
 * two on keys with their legends and two on the touch pads, and a live readout of every device's
 * pad as the sim would read it, the frame's pointing and the ? button. "Players join" swaps the
 * fixed party for one claimed live: press on any device to take the next seat.
 */
export function Sheet({ lang }: { lang: Lang }) {
  const [input] = useState(() => new SeatInput())
  const [world] = useState(stillWorld)
  const [faceList] = useState(faces)
  const surface = useRef<HTMLDivElement>(null)
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState<Seat[]>([])
  const [lines, setLines] = useState<Line[]>([])
  const [pointing, setPointing] = useState<{ last: FrameInput['pointing']['taps'][number] | null; taps: number; held: FrameInput['pointing']['held']; helps: number }>({ last: null, taps: 0, held: [], helps: 0 })
  const [pauses, setPauses] = useState(0)
  const counts = useRef(new Map<string, { a: number; b: number }>())
  const joiningRef = useRef(joining)
  joiningRef.current = joining

  useEffect(() => input.start(), [input])

  // Pointing over the whole sheet, by the still room's camera fitted to the window.
  useEffect(() => {
    const el = surface.current!
    const { camera } = world
    return input.point(el, (x, y) => [camera.x + (x / window.innerWidth - 0.5) * camera.width, camera.y - (y / window.innerHeight - 0.5) * camera.height, 0])
  }, [input, world])

  // The sim's frame, at the screen's rate: every device read as a seat would be.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (joiningRef.current) {
        const claims = input.takeClaims()
        if (claims.length > 0)
          setJoined((seats) => {
            let next = seats
            for (const device of claims) next = claimSeat(next, device, `kid${next.length}`) ?? next
            return next
          })
      }
      const devices = allDevices(input)
      const frame = input.frame(devices)
      setLines(
        devices.map((device, i) => {
          const pad = frame.pads[i]
          const name = deviceName(device)
          const was = counts.current.get(name) ?? { a: 0, b: 0 }
          const presses = { a: was.a + (pad.a.pressed ? 1 : 0), b: was.b + (pad.b.pressed ? 1 : 0) }
          counts.current.set(name, presses)
          return { device, pad, presses }
        }),
      )
      setPointing((p) => ({
        last: frame.pointing.taps.length > 0 ? frame.pointing.taps[frame.pointing.taps.length - 1] : p.last,
        taps: p.taps + frame.pointing.taps.length,
        held: frame.pointing.held,
        helps: p.helps + (frame.help ? 1 : 0),
      }))
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [input])

  const onPause = useCallback(() => setPauses((n) => n + 1), [])
  const seats = joining ? joined : FIXED_SEATS
  const waitingPads = joining ? ([0, 1] as TouchPad[]).filter((pad) => !joined.some((s) => sameDevice(s.device, { kind: 'touch', pad }))) : []
  const shown = (b: { held: boolean }, n: number) => `${b.held ? 'HELD' : '    '} x${n}`

  return (
    <div ref={surface} className="seats-sheet" style={{ position: 'fixed', inset: 0, background: 'linear-gradient(180deg, #bfe6ff 0%, #8fd3ff 70%, #7cc36b 70%, #4f9a45 100%)', touchAction: 'none', fontFamily: 'ui-monospace, monospace' }}>
      <div style={{ position: 'absolute', left: '50%', top: 110, transform: 'translateX(-50%)', background: 'rgba(255,255,255,0.88)', borderRadius: 10, padding: '8px 12px', fontSize: 13, lineHeight: 1.35, whiteSpace: 'pre', pointerEvents: 'none', color: '#2b2b30' }}>
        <div id="readout">
          {lines.map((l) => `${deviceName(l.device).padEnd(10)} stick ${fixed(l.pad.stick[0])} ${fixed(l.pad.stick[1])}   a ${shown(l.pad.a, l.presses.a)}   b ${shown(l.pad.b, l.presses.b)}`).join('\n')}
          {'\n'}
          {`taps ${pointing.taps}  last ${pointing.last === null ? '-' : `${fixed(pointing.last.at[0])} ${fixed(pointing.last.at[1])}`}  held ${pointing.held.map((p) => `(${fixed(p[0])} ${fixed(p[1])})`).join(' ') || '-'}`}
          {'\n'}
          {`help ${pointing.helps}  pause ${pauses}  seats ${seats.map((s) => `${s.index}:${deviceName(s.device)}`).join(', ') || '-'}`}
        </div>
      </div>
      <button data-no-point="" onClick={() => {
          // Presses from before players join are no claims.
          input.takeClaims()
          setJoined([])
          setJoining((j) => !j)
        }} style={{ position: 'absolute', left: '50%', top: 64, transform: 'translateX(-50%)', font: 'inherit', padding: '6px 12px', zIndex: 2 }}>
        {joining ? 'Fixed party' : 'Players join'}
      </button>
      <Hud world={world} lang={lang} seats={seats} faces={seats.map((s) => faceList[s.index])} input={input} waitingPads={waitingPads} picture={RecipeSketch} onPause={onPause} />
    </div>
  )
}
