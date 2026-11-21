import { inLang } from '../../profiles/src/lang'
import { useGameView } from './game/game'
import type { Game } from './game/game'
import { DRIVER_SPECIES, HAT_COLOURS, MACHINE_KINDS, PAINTS } from './game/model'
import { BUTTON, cls } from './Controls'
import { Face, Glyph, HatIcon, MachineIcon, paintColour } from './Icons'
import { HAT_NAMES, HUD, MACHINE_NAMES, PAINT_NAMES, SPECIES_NAMES } from './words'

/** A gentle head shake: that one costs too much. */
function shake(el: HTMLElement) {
  el.animate([0, -9, 7, -5, 2, 0].map((deg) => ({ rotate: `${deg}deg` })), { duration: 480, easing: 'ease-out' })
}

/** Six builders as big faces and six hat colours; the picked ones ring. Used on the title and in the shop. */
export function BuilderPicker({ game }: { game: Game }) {
  const look = game.save.driver
  const lang = game.lang
  return (
    <div className="builder">
      <div className="builder-faces">
        {DRIVER_SPECIES.map((species) => (
          <button
            key={species}
            type="button"
            {...BUTTON}
            aria-label={inLang(SPECIES_NAMES[species], lang)}
            className={cls('pick', 'face', look.species === species && 'on')}
            onPointerDown={(e) => {
              e.preventDefault()
              game.setDriver({ species, hat: look.hat })
            }}
          >
            <Face species={species} hat={look.hat} />
          </button>
        ))}
      </div>
      <div className="builder-hats">
        {HAT_COLOURS.map((hat) => (
          <button
            key={hat}
            type="button"
            {...BUTTON}
            aria-label={inLang(HAT_NAMES[hat], lang)}
            className={cls('pick', 'hat', look.hat === hat && 'on')}
            onPointerDown={(e) => {
              e.preventDefault()
              game.setDriver({ species: look.species, hat })
            }}
          >
            <HatIcon colour={hat} />
          </button>
        ))}
      </div>
    </div>
  )
}

/** The paint shop over the turntable: machines along the bottom, paints on the right, the builder on the left. */
export function Shop({ game }: { game: Game }) {
  useGameView(game)
  if (game.screen !== 'shop') return null
  const save = game.save
  const kind = game.shopMachine
  const wearing = save.paints[kind]
  const lang = game.lang
  return (
    <div className="shop">
      <button type="button" {...BUTTON} aria-label={inLang(HUD.back, lang)} className="push round back" onPointerDown={(e) => { e.preventDefault(); game.closeShop() }}>
        <Glyph name="back" />
      </button>
      <div className="chip shop-coins">
        <span className="chip-icon"><Glyph name="coin" /></span>
        <span className="chip-num">{Math.floor(game.sim.score.coins)}</span>
      </div>
      <div className="shop-left">
        <BuilderPicker game={game} />
      </div>
      <div className="swatches">
        {PAINTS.map((paint) => {
          const owned = save.owned.includes(paint.id)
          return (
            <button
              key={paint.id}
              type="button"
              {...BUTTON}
              aria-label={inLang(PAINT_NAMES[paint.id], lang)}
              className={cls('swatch', wearing === paint.id && 'on', !owned && 'locked')}
              style={{ background: paint.colour }}
              onPointerDown={(e) => {
                e.preventDefault()
                if (owned || game.buyPaint(paint.id)) game.setPaint(kind, paint.id)
                else shake(e.currentTarget)
              }}
            >
              {owned ? (wearing === paint.id ? <span className="swatch-check"><Glyph name="check" /></span> : null) : (
                <span className="price">
                  <span className="price-coin"><Glyph name="coin" /></span>
                  <b>{paint.price}</b>
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div className="shelf">
        {MACHINE_KINDS.map((k) => (
          <button
            key={k}
            type="button"
            {...BUTTON}
            aria-label={inLang(MACHINE_NAMES[k], lang)}
            className={cls('portrait', k === kind && 'on')}
            onPointerDown={(e) => {
              e.preventDefault()
              game.setShopMachine(k)
            }}
          >
            <MachineIcon kind={k} colour={paintColour(save.paints[k])} />
          </button>
        ))}
      </div>
    </div>
  )
}
