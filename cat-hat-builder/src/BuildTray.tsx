import { Btn } from './Btn'
import type { Game } from './game/game'
import type { HudView } from './game/hud'
import { ROOFS, type Material, type Shape } from './game/model'
import { BellIcon, HandIcon } from './Icons'
import { GoodPic, MachinePic, RoofPic, ShapePic, TruckPic } from './Pictures'

/** The materials' and the shapes' words, for a screen reader. */
const MATERIAL_NAMES: Record<Material, string> = { planks: 'Planks', bricks: 'Bricks', concrete: 'Concrete', glass: 'Glass', rainbow: 'Rainbow blocks' }
const SHAPE_NAMES: Record<Shape, string> = { small: 'Small room', wide: 'Wide room', tall: 'Tall room', big: 'Big room' }

/**
 * The build view's tray along the bottom: the five materials (a little pile and how many,
 * the picked one raised, those that cannot pay for the picked shape dimmed), the four
 * shapes in the picked material, the roof button (the roof a tap turns the house's roofs
 * into), the hand that takes rooms back, and the doorbell. When a room cannot be paid for,
 * the tray points at what comes next (hud's missing.next), one thing bouncing at a time:
 * another material that pays, or a smaller shape that can be paid for; or the missing
 * material under a bubble with the machine that can make some, or the truck to fetch more,
 * and a tap on the bubble goes back to the street, where that thing bounces.
 */
export function BuildTray({ game, view }: { game: Game; view: NonNullable<HudView['build']> }) {
  if (view.kind === null) return null
  const missing = view.missing
  const next = missing === null ? null : missing.next
  // A material or a shape that pays bounces by itself; with neither, the missing material bounces under a bubble showing where more comes from.
  const bouncing: Material | Shape | null = next === null ? null : next.kind === 'material' ? next.material : next.kind === 'shape' ? next.shape : missing!.good
  const bubble = next !== null && (next.kind === 'machine' || next.kind === 'truck') ? next : null
  const nextRoof = ROOFS[(ROOFS.indexOf(view.roof) + 1) % ROOFS.length]!
  return (
    <div className="tray build">
      <div className="group materials">
        {view.goods.map((g) => {
          const bounce = g.material === bouncing
          return (
            <span key={g.material} className="slot">
              <Btn
                // A new nope mounts the button anew, so its bounce starts again.
                key={bounce ? `${g.material}:${missing!.at}` : g.material}
                className={`mat${g.material === view.material && !view.hand ? ' on' : ''}${g.afford ? '' : ' poor'}${bounce ? ' missing' : ''}`}
                label={MATERIAL_NAMES[g.material]}
                onTap={() => game.button({ kind: 'material', material: g.material }, 'pick')}
              >
                <GoodPic good={g.material} stack className="pic" />
                <span className="count">{g.n}</span>
              </Btn>
              {bounce && bubble !== null && (
                <Btn key={missing!.at} className="bubble" label={bubble.kind === 'truck' ? 'To the truck' : 'To the machine'} onTap={() => game.button({ kind: 'back' }, 'tap')}>
                  {bubble.kind === 'truck' ? <TruckPic look={game.hud.look} trips={game.state.keep.trips} className="pic" /> : <MachinePic m={bubble.m} className="pic" />}
                </Btn>
              )}
            </span>
          )
        })}
      </div>
      <div className="group shapes">
        {view.shapes.map((s) => {
          const bounce = s.shape === bouncing
          return (
            <Btn
              key={bounce ? `${s.shape}:${missing!.at}` : s.shape}
              className={`shape${s.shape === view.shape && !view.hand ? ' on' : ''}${s.afford ? '' : ' poor'}${bounce ? ' missing' : ''}`}
              label={SHAPE_NAMES[s.shape]}
              onTap={() => game.button({ kind: 'shape', shape: s.shape }, 'pick')}
            >
              <ShapePic shape={s.shape} material={view.material} className="pic" />
            </Btn>
          )
        })}
      </div>
      <div className="group tools">
        {/* The roof and the doorbell come with the house's first room. */}
        {view.doorbell && (
          <Btn className="roof" label="Roof" onTap={() => game.dispatch({ kind: 'roof' })}>
            <RoofPic style={nextRoof} material={view.material} className="pic" />
          </Btn>
        )}
        <Btn className={`hand${view.hand ? ' on' : ''}`} label="Take back" onTap={() => game.button({ kind: 'hand', on: !view.hand }, 'pick')}>
          <HandIcon />
        </Btn>
        {view.doorbell && (
          <Btn className="bell" label="Doorbell" onTap={() => game.dispatch({ kind: 'doorbell' })}>
            <BellIcon />
          </Btn>
        )}
      </div>
    </div>
  )
}
