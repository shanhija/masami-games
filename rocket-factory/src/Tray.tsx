import { memo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'

import { Btn } from './Btn'
import type { Game } from './game/game'
import { trayOrder, type HudView, type TrayButton, type TrayKey } from './game/hud'
import { trayBoxes, type HudFrame } from './game/layout'
import type { Box } from './game/where'
import { EndlessIcon, OopsIcon, PeelIcon, PencilIcon } from './Icons'
import { HolePic, PatternPic, StickerPic } from './Pictures'
import type { Sticker } from './game/model'

/** The words for a screen reader; the child sees pictures. */
const NAMES: Record<Sticker, string> = {
  digger: 'Digger',
  oven: 'Oven',
  workshop: 'Workshop',
  greenMaker: 'Green bottle maker',
  orangeMaker: 'Orange bottle maker',
  lab: 'Lab',
  pump: 'Pump',
  tower: 'Bubble tower',
  bowl: 'Snack bowl',
  hedge: 'Hedge',
}

const inBox = (b: Box, x: number, y: number) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h
/** Box b placed inside box `in`, as CSS. */
const placed = (b: Box, within: Box): CSSProperties => ({ left: b.x - within.x, top: b.y - within.y, width: b.w, height: b.h })

/**
 * One sticker's button: its sticker as the board shows it with a big count (an endless mark
 * after the launch), or the die-cut hole a used one leaves; New! bouncing on the one the chain
 * needs; lifted and glowing when it is picked. A tap picks it (on the picked one it puts it
 * back: the pencil), a tap on a hole wiggles the lab card with more of it peeking out, and a
 * press dragged out of the tray picks it and holds its ghost over the board, or for the hedge
 * draws its line (the router). After such a drag the button's own tap picks nothing.
 */
function StickerButton({ game, b, tray }: { game: Game; b: TrayButton; tray: Box }) {
  const dragged = useRef<{ id: number; out: boolean } | null>(null)
  const empty = b.left <= 0
  const down = (e: ReactPointerEvent) => {
    dragged.current = { id: e.pointerId, out: false }
    if (!empty && e.button === 0) game.trayDown(e.pointerId, b.sticker, e.clientX, e.clientY, e.pointerType === 'mouse' ? 'left' : 'touch')
  }
  const move = (e: ReactPointerEvent) => {
    const d = dragged.current
    if (d !== null && d.id === e.pointerId && !inBox(tray, e.clientX, e.clientY)) d.out = true
  }
  const tap = () => {
    const out = dragged.current?.out === true
    dragged.current = null
    if (out) return
    if (b.picked) game.button({ kind: 'tool', tool: { kind: 'pencil' } }, 'pick')
    else if (empty) game.peekAt(b.sticker)
    else game.button({ kind: 'tool', tool: b.sticker === 'hedge' ? { kind: 'hedge' } : { kind: 'sticker', sticker: b.sticker } }, 'pick')
  }
  return (
    <span className="press" onPointerDown={down} onPointerMove={move}>
      <Btn className={`sticker${b.picked ? ' on' : ''}${empty ? ' empty' : ''}${b.fresh ? ' fresh' : ''}`} label={NAMES[b.sticker]} onTap={tap}>
        {empty ? <HolePic sticker={b.sticker} className="pic" /> : <StickerPic sticker={b.sticker} className="pic" />}
        {!empty && <span className="count">{b.left === Infinity ? <EndlessIcon /> : b.left}</span>}
        {b.fresh && <span className="new">New!</span>}
      </Btn>
    </span>
  )
}

/** The pencil: the belt it lays in its pattern; lit, a tap on it is the next pattern. */
export function PencilButton({ game, pencil }: { game: Game; pencil: HudView['tray']['pencil'] }) {
  return (
    <Btn className={`pencil${pencil.lit ? ' on' : ''}`} label="Pencil" onTap={() => (pencil.lit ? game.dispatch({ kind: 'pattern' }) : game.button({ kind: 'tool', tool: { kind: 'pencil' } }, 'pick'))}>
      <PatternPic pattern={pencil.pattern} className="pic belt" />
      <span className="lead">
        <PencilIcon />
      </span>
    </Btn>
  )
}

/** The peel's hand, lifted while it is the tool; a tap on it then puts it back. */
export function PeelButton({ game, on }: { game: Game; on: boolean }) {
  return (
    <Btn className={`peel${on ? ' on' : ''}`} label="Peel" onTap={() => game.button({ kind: 'tool', tool: on ? { kind: 'pencil' } : { kind: 'peel' } }, 'pick')}>
      <PeelIcon />
    </Btn>
  )
}

/** Oops: greyed with nothing to undo, when a tap on it still answers, with a wiggle and a tick, as a used-up sticker does. */
export function OopsButton({ game, can }: { game: Game; can: boolean }) {
  const [nopes, setNopes] = useState(0)
  const tap = () => {
    if (can) return game.dispatch({ kind: 'oops' })
    game.audio.ui('tap')
    setNopes((n) => n + 1)
  }
  return (
    <Btn className={`oops${can ? '' : ' off'}`} label="Oops" onTap={tap}>
      <span key={nopes} className={`wobble${nopes > 0 ? ' wiggle' : ''}`}>
        <OopsIcon />
      </span>
    </Btn>
  )
}

interface TrayProps {
  game: Game
  view: HudView['tray']
  frame: HudFrame
  tools: boolean
}
/** Two trays show the same: the HUD's other changes (a jar filling every time the lab drinks) leave the tray as it is. */
const sameTray = (a: TrayProps, b: TrayProps) => a.game === b.game && a.tools === b.tools && JSON.stringify([a.frame, a.view]) === JSON.stringify([b.frame, b.view])

/**
 * The tray, a sheet of stickers on backing paper in the HUD frame's tray band: the pencil, the
 * stickers in arrival order, the hedge, and (sideways) the peel and Oops at its end; upright
 * those two sit in the top strip, and on a phone in the left column while the tray stands in
 * columns. Every button stands where layout.ts trayBoxes puts it, so the scripted children
 * press where it is. It renders again only when what it shows changed.
 */
export const Tray = memo(function Tray({ game, view, frame, tools }: TrayProps) {
  const keys = trayOrder(view, tools)
  const { backing, buttons } = trayBoxes(frame, keys.length)
  const band = frame.tray!
  const button = (k: TrayKey) => {
    switch (k) {
      case 'pencil':
        return <PencilButton game={game} pencil={view.pencil} />
      case 'peel':
        return <PeelButton game={game} on={view.peel} />
      case 'oops':
        return <OopsButton game={game} can={view.oops} />
      case 'hedge':
        return <StickerButton game={game} b={view.hedge!} tray={band} />
      default:
        return <StickerButton game={game} b={view.stickers.find((x) => x.sticker === k)!} tray={band} />
    }
  }
  return (
    <div className="tray">
      <div className="backing" style={placed(backing, band)}>
        {keys.map((k, i) => (
          <span key={k} className="slot" data-sticker={k} style={placed(buttons[i]!, backing)}>
            {button(k)}
          </span>
        ))}
      </div>
    </div>
  )
}, sameTray)
