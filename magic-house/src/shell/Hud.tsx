import './Hud.css'

import { useEffect, useState, type ComponentType, type CSSProperties, type ReactNode } from 'react'

import type { Avatar } from '../../../profiles/src/avatar'
import { AvatarPicture } from '../../../profiles/src/Avatar'
import { inLang, type Lang } from '../../../profiles/src/lang'
import type { Recipe, Shape } from '../../../silly-billy/src/engine/types'
import { PauseIcon } from '../../../silly-billy/src/Icons'
import { palette } from '../../../silly-billy/src/scene/look'
import type { ButtonShown, Player, World } from '../engine/world'
import { NO_POINT, type SeatInput } from '../seats/input'
import { KEY_ZONES, keyLabel } from '../seats/keys'
import { padBand, TouchPadView } from '../seats/TouchPad'
import type { KeyZone, Seat, TouchPad } from '../seats/types'
import { HUD } from '../words'
import { unlockSpeech } from './speech'

const INK = palette.ink

/** How tall the HUD's top band is, CSS pixels: the badge face (Hud.css, clamp(44px, 8vmin, 64px)) with its border, the page's top padding and a little air. The room's frame is fitted below it (sideCamera.ts Screen.clearTop); a keys seat's legend under its badge still covers the room's top left corner. */
export function hudTop(screenWidth: number, screenHeight: number): number {
  return Math.round(Math.min(64, Math.max(44, 0.08 * Math.min(screenWidth, screenHeight))) + 8 + 10 + 8)
}

/**
 * How a room's own button picture (a kit model, World.models) is drawn small. The scene can fill
 * it from its model cache with a real render; RecipeSketch is the HUD's own, a flat drawing of
 * the model seen from the front.
 */
export type ModelPicture = ComponentType<{ recipe: Recipe }>

export interface HudProps {
  world: World
  lang: Lang
  /** The party, in seat order, as world.players is. */
  seats: readonly Seat[]
  /** Each seat's gallery face, by seat index; null for a player the browser keeps no profile of. */
  faces: readonly (Avatar | null)[]
  input: SeatInput
  /** Touch pads nobody sits at that are shown as places to claim: both on a touch screen while players join, else none. */
  waitingPads: readonly TouchPad[]
  picture: ModelPicture
  onPause: () => void
}

/**
 * Everything drawn over the room (plan.md, Help, and how hard; Never trapped): the steps as dots at
 * the top, filled as they are done and the next one gently breathing; each player's badge (their
 * seat's colour round their gallery face, their score once the room gives one) with, for a seat on
 * keys, a small legend of its keys and what each button does; the time left when the room has a
 * clock; the ? button that calls the helper (whose words shell/HelperBubble.tsx shows and says) and
 * the pause button; and at the bottom the touch
 * pads, each button showing its job's picture and word. Escape pauses too. It reads the world
 * and never changes it; the ? goes to the seats' input (FrameInput.help).
 */
export function Hud({ world, lang, seats, faces, input, waitingPads, picture, onPause }: HudProps) {
  const [band, setBand] = useState(() => padBand(window.innerHeight))
  useEffect(() => {
    const resize = () => setBand(padBand(window.innerHeight))
    const key = (e: KeyboardEvent) => {
      if (e.code === 'Escape') onPause()
    }
    window.addEventListener('resize', resize)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('resize', resize)
      window.removeEventListener('keydown', key)
    }
  }, [onPause])

  const face = (shown: ButtonShown) => (shown === null ? null : <JobFace shown={shown} models={world.models} lang={lang} picture={picture} />)
  const touchSeats = seats.filter((s) => s.device.kind === 'touch')
  const showBand = touchSeats.length > 0 || waitingPads.length > 0

  return (
    <div className="mh-hud" style={{ '--pad-band': `${band}px` } as CSSProperties}>
      <div className="hud-top">
        <div className="badges">
          {seats.map((seat) => (
            <Badge key={seat.index} seat={seat} player={world.players[seat.index]} face={faces[seat.index]} world={world} lang={lang} picture={picture} />
          ))}
        </div>
        <div className="steps" role="img" aria-label={`${inLang(HUD.steps, lang)} ${world.next} / ${world.steps.length}`}>
          {world.steps.map((step, i) => (
            <span key={i} className={`dot${step.doneAt !== null ? ' done' : i === world.next ? ' next' : ''}`} />
          ))}
          {world.clock !== null && <ClockRing left={Math.max(0, world.clock - world.t)} whole={world.clock} />}
        </div>
        <div className="corner" {...{ [NO_POINT]: '' }}>
          <button
            className="round help"
            aria-label={inLang(HUD.help, lang)}
            onClick={() => {
              unlockSpeech()
              input.pressHelp()
            }}
          >
            <span className="question">?</span>
          </button>
          <button className="round" aria-label={inLang(HUD.pause, lang)} onClick={onPause}>
            <PauseIcon size={34} />
          </button>
        </div>
      </div>
      {showBand && (
        <div className="touch-band">
          {touchSeats.map((seat) => {
            if (seat.device.kind !== 'touch') throw new Error('a touch seat without a touch pad')
            const player = world.players[seat.index]
            return <TouchPadView key={`seat${seat.index}`} input={input} pad={seat.device.pad} color={seat.color} a={face(player.a)} b={face(player.b)} waiting={null} />
          })}
          {waitingPads.map((pad) => (
            <TouchPadView key={`waiting${pad}`} input={input} pad={pad} color={null} a={face('jump')} b={face('grab')} waiting={inLang(HUD.touchToPlay, lang)} />
          ))}
        </div>
      )}
    </div>
  )
}

/** A player's badge: their face in a ring of their seat's colour, their score once the room gives one, and for keys the legend of their zone. */
function Badge({ seat, player, face, world, lang, picture }: { seat: Seat; player: Player; face: Avatar | null; world: World; lang: Lang; picture: ModelPicture }) {
  return (
    <div className="badge" style={{ '--seat': seat.color } as CSSProperties}>
      <div className="badge-face">{face === null ? <div className="no-face" /> : <AvatarPicture avatar={face} className="avatar" />}</div>
      {player.badge && <div className="score">{player.score}</div>}
      {seat.device.kind === 'keys' && <KeyLegend zone={seat.device.zone} player={player} world={world} lang={lang} picture={picture} />}
    </div>
  )
}

/** A seat's keys, small: its stick's four keys as on the keyboard, and each button's key beside the picture of its job. */
function KeyLegend({ zone, player, world, lang, picture }: { zone: KeyZone; player: Player; world: World; lang: Lang; picture: ModelPicture }) {
  const keys = KEY_ZONES[zone]
  const cap = (code: string) => <kbd className="cap">{keyLabel(code)}</kbd>
  const button = (code: string, shown: ButtonShown) =>
    shown !== null && (
      <div className="legend-button">
        {cap(code)}
        <span className="legend-picture">
          <ButtonPicture shown={shown} models={world.models} picture={picture} />
        </span>
      </div>
    )
  return (
    <div className="legend" role="img" aria-label={[player.a, player.b].map((s) => (s === null ? '' : inLang(buttonWord(s), lang))).join(' ')}>
      {player.stick !== 'none' && (
        <div className="legend-stick">
          <span />
          {cap(keys.up)}
          <span />
          {cap(keys.left)}
          {cap(keys.down)}
          {cap(keys.right)}
        </div>
      )}
      <div className="legend-buttons">
        {button(keys.a, player.a)}
        {button(keys.b, player.b)}
      </div>
    </div>
  )
}

function buttonWord(shown: Exclude<ButtonShown, null>) {
  return shown === 'jump' ? HUD.jump : shown === 'grab' ? HUD.grab : shown.word
}

/** A button's job as a picture alone: the engine's jump and grab drawn here, a room's own job by its model in the room's models (World.models). */
function ButtonPicture({ shown, models, picture: Picture }: { shown: Exclude<ButtonShown, null>; models: readonly Recipe[]; picture: ModelPicture }) {
  if (shown === 'jump') return <JumpIcon />
  if (shown === 'grab') return <GrabIcon />
  const recipe = models[shown.icon]
  if (recipe === undefined) throw new Error(`a button's picture is model ${shown.icon}, and the room has ${models.length} models`)
  return <Picture recipe={recipe} />
}

/** A touch pad's button: the picture of its job over its word. */
function JobFace({ shown, models, lang, picture }: { shown: Exclude<ButtonShown, null>; models: readonly Recipe[]; lang: Lang; picture: ModelPicture }) {
  return (
    <>
      <span className="face-picture">
        <ButtonPicture shown={shown} models={models} picture={picture} />
      </span>
      <span className="face-word">{inLang(buttonWord(shown), lang)}</span>
    </>
  )
}

/** The time left, as a ring that empties. */
function ClockRing({ left, whole }: { left: number; whole: number }) {
  const share = whole > 0 ? left / whole : 0
  const r = 0.8
  const around = 2 * Math.PI * r
  return (
    <svg className="clock" viewBox="-1 -1 2 2" aria-hidden>
      <circle r={r} fill="#fff" stroke={INK} strokeWidth={0.36} />
      <circle r={r} fill="none" stroke={palette.blooms[1]} strokeWidth={0.22} strokeDasharray={`${around * share} ${around}`} transform="rotate(-90)" />
    </svg>
  )
}

/** The engine's jump: a small body springing up over an arrow. */
function JumpIcon() {
  return (
    <svg className="icon" viewBox="-1.1 -1.1 2.2 2.2" aria-hidden>
      <path d="M -0.55 0.1 L 0 -0.5 L 0.55 0.1" fill="none" stroke={INK} strokeWidth={0.5} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M -0.55 0.1 L 0 -0.5 L 0.55 0.1" fill="none" stroke="#fff" strokeWidth={0.26} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 0 -0.4 V 0.85" fill="none" stroke={INK} strokeWidth={0.5} strokeLinecap="round" />
      <path d="M 0 -0.4 V 0.85" fill="none" stroke="#fff" strokeWidth={0.26} strokeLinecap="round" />
    </svg>
  )
}

/** The engine's grab: an open hand reaching down. */
function GrabIcon() {
  const fingers = [-0.42, -0.14, 0.14, 0.42]
  return (
    <svg className="icon" viewBox="-1.1 -1.1 2.2 2.2" aria-hidden>
      <g fill="#fff" stroke={INK} strokeWidth={0.1} strokeLinejoin="round">
        {fingers.map((x) => (
          <rect key={x} x={x - 0.12} y={x === -0.42 || x === 0.42 ? -0.55 : -0.8} width={0.24} height={0.9} rx={0.12} />
        ))}
        <ellipse cx={-0.68} cy={0.15} rx={0.15} ry={0.34} transform="rotate(-35 -0.68 0.15)" />
        <rect x={-0.58} y={-0.05} width={1.16} height={0.85} rx={0.3} />
      </g>
    </svg>
  )
}

/** Where a shape's frame sits in the model: its part's pivot added up its parents' (turns left out: this is a sketch). */
function partOffset(recipe: Recipe, part: string | null): [number, number, number] {
  let x = 0
  let y = 0
  let z = 0
  let name = part
  while (name !== null) {
    const def = recipe.parts.find((p) => p.name === name)
    if (def === undefined) throw new Error(`a shape names the part ${name}, which the model does not have`)
    x += def.at[0]
    y += def.at[1]
    z += def.at[2]
    name = def.parent
  }
  return [x, y, z]
}

/** One shape seen from the front, flat in its colour with an ink line: boxes and the like as rectangles, balls and rings as circles, the rest by the points they are drawn through. */
function sketchShape(shape: Shape, at: [number, number, number], key: number, line: number): ReactNode {
  const [sx, sy] = [shape.scale[0], shape.scale[1]]
  const x = at[0] + shape.at[0]
  // The SVG's y runs down.
  const y = -(at[1] + shape.at[1])
  const d = shape.dims
  const paint = { fill: shape.color, stroke: INK, strokeWidth: line, strokeLinejoin: 'round' as const }
  const rect = (w: number, h: number, round: number) => <rect key={key} x={x - w / 2} y={y - h / 2} width={w} height={h} rx={round} {...paint} />
  switch (shape.kind) {
    case 'box':
      return rect(d[0] * sx, d[1] * sy, 0)
    case 'sphere':
      return <ellipse key={key} cx={x} cy={y} rx={d[0] * sx} ry={d[0] * sy} {...paint} />
    case 'cylinder':
      return rect(2 * Math.max(d[0], d[1]) * sx, d[2] * sy, 0)
    case 'capsule':
      return rect(2 * d[0] * sx, (d[1] + 2 * d[0]) * sy, d[0] * sx)
    case 'torus':
      return <circle key={key} cx={x} cy={y} r={d[0] * sx} fill="none" stroke={shape.color} strokeWidth={2 * d[1] * sx} />
    case 'lathe': {
      const points = shape.points!
      const w = 2 * Math.max(...points.map((p) => p[0])) * sx
      const ys = points.map((p) => p[1] * sy)
      return <rect key={key} x={x - w / 2} y={y - Math.max(...ys)} width={w} height={Math.max(...ys) - Math.min(...ys)} {...paint} />
    }
    case 'extrude':
      return <polygon key={key} points={shape.points!.map((p) => `${x + p[0] * sx},${y - p[1] * sy}`).join(' ')} {...paint} />
    case 'tube':
      return <polyline key={key} points={shape.points!.map((p) => `${x + p[0] * sx},${y - p[1] * sy}`).join(' ')} fill="none" stroke={shape.color} strokeWidth={2 * d[0] * sx} strokeLinecap="round" />
  }
}

/** The HUD's own picture of a model: its shapes seen from the front, back ones first, fitted to its bounds. */
export function RecipeSketch({ recipe }: { recipe: Recipe }) {
  const { min, max } = recipe.bounds
  const w = max[0] - min[0]
  const h = max[1] - min[1]
  const side = Math.max(w, h) * 1.1
  const cx = (min[0] + max[0]) / 2
  const cy = -(min[1] + max[1]) / 2
  const shapes = recipe.shapes.map((shape) => ({ shape, at: partOffset(recipe, shape.part) })).sort((p, q) => p.at[2] + p.shape.at[2] - (q.at[2] + q.shape.at[2]))
  return (
    <svg className="icon" viewBox={`${cx - side / 2} ${cy - side / 2} ${side} ${side}`} aria-hidden>
      {shapes.map(({ shape, at }, i) => sketchShape(shape, at, i, side * 0.03))}
    </svg>
  )
}
