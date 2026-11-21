import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

import { inLang } from '../../profiles/src/lang'
import { useGameView } from './game/game'
import type { Game } from './game/game'
import { FRIEND_OF, MACHINE_KINDS } from './game/model'
import type { MachineKind, Sim } from './game/model'
import { guardedOf } from './game/jobs'
import { HOP_BLOCK } from './game/hands'
import { actionFace, actionReady, stepPointer } from './game/sim'
import { ActionIcon, Face, Glyph, MachineIcon, paintColour } from './Icons'
import { HUD, MACHINE_NAMES } from './words'

/** Keeps the browser's own answer to a press away from a button: no focus on mousedown, no long-press menu, no text selection. */
export const noDefault = (e: { preventDefault: () => void }) => e.preventDefault()

export const cls = (...names: (string | false)[]) => names.filter(Boolean).join(' ')

/** Seconds without progress when the hint hand shows. */
export const HAND_AFTER = 12

/** How loud the hints are: 0 none (pro mode has none), 1 after 6 idle seconds, 2 after 12. */
export function hintTier(sim: Sim): 0 | 1 | 2 {
  if (sim.mode === 'pro' || sim.job === null) return 0
  return sim.idle < 6 ? 0 : sim.idle < HAND_AFTER ? 1 : 2
}

/** Where the hint hand taps: the portrait to hop into, the big button, or the ring on the ground. */
export type Hint = { where: 'portrait'; machine: MachineKind } | { where: 'button' } | { where: 'ring' } | null

export function hintOf(sim: Sim): Hint {
  if (hintTier(sim) < 2) return null
  const p = stepPointer(sim)
  if (p === null) return null
  if (p.machine !== sim.active) return { where: 'portrait', machine: p.machine }
  return p.press ? { where: 'button' } : { where: 'ring' }
}

export const BUTTON = { onMouseDown: noDefault, onContextMenu: noDefault, tabIndex: -1 } as const

/**
 * The big button: a press goes down on it and lets go however it ends, by up, cancel, lost
 * capture, or the button going away under the finger (a hop in pro to a machine with no button,
 * or leaving the play). Only the finger that pressed can let go; a finger whose capture is gone
 * does not block the next one.
 */
function BigButton({ game, className, children }: { game: Game; className: string; children: ReactNode }) {
  const finger = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (finger.current === null) return
      finger.current = null
      game.action(false)
    },
    [game],
  )
  const lift = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerId !== finger.current) return
    finger.current = null
    game.action(false)
  }
  return (
    <button
      type="button"
      {...BUTTON}
      aria-label={inLang(HUD.work, game.lang)}
      className={className}
      onPointerDown={(e) => {
        e.preventDefault()
        const el = e.currentTarget
        if (finger.current !== null && el.hasPointerCapture(finger.current)) return
        el.setPointerCapture(e.pointerId)
        finger.current = e.pointerId
        game.action(true)
      }}
      onPointerUp={lift}
      onPointerCancel={lift}
      onLostPointerCapture={lift}
    >
      {children}
    </button>
  )
}

function Ring({ fill }: { fill: number }) {
  return (
    <svg className="ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="45" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - fill} transform="rotate(-90 50 50)" />
    </svg>
  )
}

function Hand({ tap }: { tap: boolean }) {
  return (
    <span className={cls('hand', tap && 'tap')}>
      <Glyph name="hand" />
    </span>
  )
}

/** The machines that have come (bottom left), the big button, the horn and the microphone (bottom right). */
export function Controls({ game }: { game: Game }) {
  useGameView(game)
  const sim = game.sim
  const [micDown, setMicDown] = useState(false)
  if (game.screen !== 'play') return null
  // Blocked after a hop: until the press that began before it is let go, and for HOP_BLOCK after it. A fresh press after that works, so the button is not shown as stuck.
  const blocked = sim.hands.blocked && (sim.hands.action || (sim.lastHop !== null && sim.time - sim.lastHop.at < HOP_BLOCK))
  const tier = hintTier(sim)
  const ptr = stepPointer(sim)
  const hint = hintOf(sim)
  const face = actionFace(sim, sim.active)
  const wants = !blocked && ptr !== null && sim.mode === 'easy' && ptr.machine === sim.active && ptr.press && actionReady(sim)
  const held = Math.min(1, sim.hands.heldFor)
  const voice = game.voice
  const micState = voice.state
  const lang = game.lang

  return (
    <div className="controls">
      <div className="portraits">
        {MACHINE_KINDS.filter((k) => sim.machines[k].unlocked).map((kind) => {
          const m = sim.machines[kind]
          const wanted = sim.mode === 'easy' && ptr !== null && ptr.machine !== sim.active && ptr.machine === kind
          return (
            <button
              key={kind}
              type="button"
              {...BUTTON}
              aria-label={inLang(MACHINE_NAMES[kind], lang)}
              className={cls('portrait', sim.active === kind && 'on', wanted && 'wanted', wanted && tier === 2 && 'loud')}
              onPointerDown={(e) => {
                e.preventDefault()
                game.hop(kind)
              }}
            >
              <MachineIcon kind={kind} colour={paintColour(game.save.paints[kind])} />
              {m.friend ? <span className="friend"><Face species={FRIEND_OF[kind]} /></span> : null}
              {wanted ? <Hand tap={hint !== null && hint.where === 'portrait'} /> : null}
            </button>
          )
        })}
      </div>

      <div className="cluster">
        <div className="side">
          {micState === 'unsupported' ? null : (
            <button
              type="button"
              {...BUTTON}
              aria-label={inLang(HUD.microphone, lang)}
              className={cls('push', 'mic', micState, voice.hearing && 'hearing', micDown && 'pressed')}
              onPointerDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setMicDown(true)
              }}
              onPointerUp={() => setMicDown(false)}
              onPointerCancel={() => setMicDown(false)}
              onPointerLeave={() => setMicDown(false)}
              onClick={() => game.toggleMic()}
            >
              <Glyph name={micState === 'denied' || micState === 'broken' ? 'micOff' : 'mic'} />
              {micState === 'starting' ? <span className="spin" /> : null}
              {micState === 'denied' ? <span className="note">{inLang(HUD.micBlocked, lang)}</span> : null}
              {micState === 'broken' ? <span className="note">{inLang(HUD.cantHear, lang)}</span> : null}
            </button>
          )}
          <button
            type="button"
            {...BUTTON}
            aria-label={inLang(HUD.horn, lang)}
            className="push horn"
            onPointerDown={(e) => {
              e.preventDefault()
              game.horn()
            }}
          >
            <Glyph name="horn" />
          </button>
        </div>
        {face === null ? null : (
          <BigButton game={game} className={cls('push', 'big', blocked && 'dim', wants && 'pulse', wants && tier >= 1 && 'loud')}>
            <ActionIcon face={face} />
            {held > 0.05 && !blocked && guardedOf(sim) ? <Ring fill={held} /> : null}
            {hint !== null && hint.where === 'button' ? <Hand tap /> : null}
          </BigButton>
        )}
      </div>
    </div>
  )
}
