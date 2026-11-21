import { useEffect, useRef } from 'react'

import { COLOR, groundShadow, pen } from '../../../pia-jump/src/draw/look'
import { Doll } from '../Doll'
import { OPTIONS, PARTS, START_LOOK, withOption, type Look, type Part } from '../game/closet'
import { drawPerson, type Act, type Pose } from './person'

const ACTS: readonly Act[] = ['stand', 'walk', 'run', 'jump', 'fall', 'climb', 'build', 'dance', 'wave']

/** Something on every part: the loudest look the closet makes. */
const BUSY: Look = { ...START_LOOK, eyes: 'sparkle', hair: 'ponytail', hat: 'crown', top: 'stars', bottom: 'tutu', shoes: 'rainboots', extra: 'cape', shadow: 'rainbow', lips: 'glitter', blush: 'hearts', paint: 'butterfly', hairColour: 'ginger' }
/** Another: tall and round, curls, a wizard hat, wings. */
const WINGED: Look = { ...START_LOOK, height: 'tall', build: 'round', skin: 'cocoa', hair: 'curly', hairColour: 'black', hat: 'wizard', top: 'stripes', topColour: 'teal', bottom: 'skirt', shoes: 'boots', extra: 'wings', face: 'wide', eyes: 'happy', mouth: 'grin' }
/** And a short slim one with a scarf and glasses. */
const SCARFED: Look = { ...START_LOOK, height: 'short', build: 'slim', skin: 'milk', hair: 'spiky', hairColour: 'blonde', hat: 'cap', hatColour: 'green', top: 'dress', topColour: 'pink', bottom: 'shorts', shoes: 'sandals', extra: 'scarf', face: 'oval', eyes: 'dots', nose: 'clown', mouth: 'tongue' }

/** The parts the sheet also shows on the whole person. */
const WHOLE: readonly Part[] = ['hair', 'height', 'build', 'skin', 'hat', 'top', 'bottom', 'shoes', 'extra']

type Cell = { look: Look; pose: Pose }

/** Eight moments through an act's loop. */
function moments(act: Act, look: Look, turn: number): Cell[] {
  const cycle = act === 'walk' ? 1.6 : act === 'run' ? 1.9 : act === 'climb' ? 0.8 : 0
  const span = act === 'build' ? 0.8 : act === 'dance' ? 1 : act === 'wave' ? 0.45 : 0
  return Array.from({ length: 8 }, (_, k) => ({
    look,
    pose: { act, stride: (k / 8) * cycle, since: (k / 8) * span, t: 1 + k * 0.6, squash: act === 'stand' && k === 7 ? 1 : 0, turn },
  }))
}

/** A row of the person in poses, drawn once: `tile` CSS px a tile, each pose in a cell 1.4 tiles wide; `night` paints a dark room and every pose's rim first. */
function Strip({ cells, tile, night }: { cells: readonly Cell[]; tile: number; night: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current!
    const ctx = el.getContext('2d')!
    const dpr = Math.min(window.devicePixelRatio, 3)
    const k = tile * dpr
    el.width = Math.round(cells.length * 1.4 * k)
    el.height = Math.round(2.5 * k)
    ctx.fillStyle = night ? '#2A2350' : '#FFFFFF'
    ctx.fillRect(0, 0, el.width, el.height)
    pen.px = k
    cells.forEach(({ look, pose }, i) => {
      ctx.setTransform(k, 0, 0, k, (i + 0.5) * 1.4 * k, 2.3 * k)
      groundShadow(ctx, 0.9)
      if (night) drawPerson(ctx, look, pose, { colour: COLOR.nightRim, width: 0.03 })
      drawPerson(ctx, look, pose, null)
    })
    ctx.setTransform(1, 0, 0, 1, 0, 0)
  }, [cells, tile, night])
  return <canvas ref={ref} style={{ display: 'block', width: cells.length * 1.4 * tile, height: 2.5 * tile, borderRadius: 8 }} />
}

const CSS = `
.sheet h2 { font-size: 15px; margin: 14px 0 6px; }
.sheet-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 16px; }
.sheet-row { display: flex; align-items: flex-start; gap: 4px; }
.sheet-label { width: 52px; flex: none; padding-top: 20px; }
.sheet figure { margin: 0; text-align: center; font-size: 10px; font-weight: 500; }
.sheet-tile { width: 60px; height: 60px; background: #fff; border-radius: 10px; }
.sheet-whole { width: 52px; height: 84px; background: #fff; border-radius: 10px; }
.sheet-acts { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
`

/** ?sheet: every option of every part (as a closet tile shows it, then on the whole person for the body and the clothes), every act by day and by night, the closet's view and level sizes, on one scrolling page. */
export function Sheet() {
  const row = (part: Part, zoom: Part | 'all', className: string) => (
    <div key={part} className="sheet-row">
      <span className="sheet-label">{part}</span>
      {(OPTIONS[part] as readonly string[]).map((o) => (
        <figure key={o}>
          <Doll look={withOption(START_LOOK, part, o)} act="stand" animate={false} zoom={zoom} className={className} />
          <figcaption>{o}</figcaption>
        </figure>
      ))}
    </div>
  )
  const closet: Cell[] = [START_LOOK, BUSY, WINGED, SCARFED].flatMap((look) =>
    (['stand', 'wave', 'dance', 'jump'] as const).map((act) => ({ look, pose: { act, stride: 0, since: 0.3, t: 1, squash: 0, turn: 0 } })),
  )
  const level = (tile: number) => (
    <Strip cells={[START_LOOK, BUSY, WINGED, SCARFED].flatMap((look) => moments('walk', look, 1).slice(0, 3))} tile={tile} night={false} />
  )
  return (
    <div className="sheet" style={{ position: 'fixed', inset: 0, overflow: 'auto', touchAction: 'pan-y', boxSizing: 'border-box', padding: 12, background: '#FFF6FB', color: '#3B2245', font: '600 12px system-ui, sans-serif' }}>
      <style>{CSS}</style>
      <h2>Every option, as a closet tile shows it</h2>
      <div className="sheet-grid">{PARTS.map((part) => row(part, part, 'sheet-tile'))}</div>
      <h2>On the whole person</h2>
      <div className="sheet-grid">{WHOLE.map((part) => row(part, 'all', 'sheet-whole'))}</div>
      <h2 id="acts">Every act turned toward +x: by day, and busy by night with the rim</h2>
      {ACTS.map((act) => (
        <div key={act} className="sheet-acts">
          <span className="sheet-label" style={{ paddingTop: 0 }}>
            {act}
          </span>
          <Strip cells={moments(act, START_LOOK, 1)} tile={32} night={false} />
          <Strip cells={moments(act, BUSY, 1)} tile={32} night />
        </div>
      ))}
      <h2>Facing the closet: stand, wave, dance, jump</h2>
      <Strip cells={closet} tile={34} night={false} />
      <h2>Level sizes, walking: 60 and 110 device px a tile</h2>
      {level(30)}
      {level(55)}
    </div>
  )
}
