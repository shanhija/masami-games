/**
 * The scene's developer sheet: magic-house/index.html?sheet=scene draws a fixture (fixtures.ts) on
 * the stage, played on by its own step. Query parameters:
 * - room=<meadow|workshop|night|small|courtyard>: which fixture (meadow if left out, courtyard
 *   with view=high);
 * - view=high: a fixture seen from high up (courtyard), else one seen from the side;
 * - touch: the camera keeps the bottom clear for the touch pads as the game does (seats/TouchPad.tsx
 *   padBand), shown as a band; the top is kept clear for the HUD's band as in the game (shell/Hud.tsx
 *   hudTop), though the sheet has no HUD;
 * - light=<0.6 to 1>: the fixture's shell in that light, to see a room bright and dim;
 * - frame: the camera's frame outlined, to see the stage shows exactly it (from high up, the
 *   rectangle round the box over the floor frame as it is drawn);
 * - edges: the background drawn magenta, so a headless check can count any pixel of it the house
 *   leaves showing at the screen's edges;
 * - look, or look=heaviest: the fixture's look (fixtures.ts fixtureLook: meadow, night and courtyard
 *   are dressed, meadow has the heaviest the look's limits allow); a tap on the room tries its props
 *   as the game's does, and the sounds they make are kept in window.propSounds;
 * - worn: every kid wears something in every slot (fixtures.ts fixtureWear).
 * It measures itself against SCENE_LIMITS: window.sceneStats holds the draw calls and the scene's
 * milliseconds a frame (the mean and the worst of the last two seconds), for shot.mjs to read.
 */

import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type RefObject } from 'react'
import { Color } from 'three'

import type { Lang } from '../../../profiles/src/lang'
import type { Recipe, Vec3 } from '../../../silly-billy/src/engine/types'
import { LIGHT_RANGE } from '../engine/api'
import { padBand } from '../seats/TouchPad'
import { hudTop } from '../shell/Hud'
import { WARDROBE } from '../own/wardrobe/wardrobe'
import { FIXTURE_WORN, fixture, fixtureLook, FIXTURES, fixtureWear, type FixtureLook, type FixtureName } from './fixtures'
import type { StageLook } from './lookView'
import { Meter } from './Meter'
import { RoomStage, screenOf, type RoomSource, type ShownView } from './RoomStage'

/** The window's size, kept as it changes, for the bands kept clear. */
const windowSize = () => `${innerWidth}x${innerHeight}`
const onResize = (f: () => void) => {
  addEventListener('resize', f)
  return () => removeEventListener('resize', f)
}

/** What a fixture's kid wears, by its id: a starting piece, or one of the fixtures' own. */
const wornModels = (id: string): Recipe | null => WARDROBE.recipe(id) ?? FIXTURE_WORN[id] ?? null

declare global {
  interface Window {
    /** The props' sounds the sheet's look has made, in order, for a headless check. */
    propSounds?: string[]
  }
}

/** Plays the fixture on: its own clock, from the first frame. */
function Driver({ step }: { step: (t: number, dt: number) => void }) {
  const t = useRef(0)
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1)
    t.current += dt
    step(t.current, dt)
  }, -500)
  return null
}

export function Sheet({ lang }: { lang: Lang }) {
  const query = new URLSearchParams(location.search)
  const view = query.get('view') ?? 'side'
  if (view !== 'side' && view !== 'high') throw new Error(`the scene's sheet shows a room from the side or from high up (view=high), not ${view}`)
  const name = (query.get('room') ?? (view === 'high' ? 'courtyard' : 'meadow')) as FixtureName
  if (!FIXTURES.includes(name)) throw new Error(`the scene's sheet has no room ${name}; it has ${FIXTURES.join(', ')}`)
  const touch = query.has('touch')
  const showFrame = query.has('frame')
  const edges = query.has('edges')
  const lookAsked = query.get('look')
  const lookName: FixtureLook | null = lookAsked === null ? null : lookAsked === '' || lookAsked === 'dressed' ? 'dressed' : lookAsked === 'heaviest' ? 'heaviest' : null
  if (lookAsked !== null && lookName === null) throw new Error(`the scene's sheet draws a fixture's look (look) or the heaviest (look=heaviest), not look=${lookAsked}`)
  const worn = query.has('worn')
  const lightAsked = query.get('light')
  const light = lightAsked === null ? null : Number(lightAsked)
  if (light !== null && !(light >= LIGHT_RANGE.least && light <= 1)) throw new Error(`the scene's sheet lights a room from ${LIGHT_RANGE.least} to 1, not ${lightAsked}`)
  const [width, height] = useSyncExternalStore(onResize, windowSize).split('x').map(Number) as [number, number]
  const pads = touch ? padBand(height) : 0
  const made = useMemo(() => {
    const f = fixture(name)
    if (light !== null) f.world.shell = { ...f.world.shell, light }
    if (worn) for (const p of f.world.players) p.wear = fixtureWear(p.seat)
    return f
  }, [name, light, worn])
  const look = useMemo<StageLook | null>(() => {
    if (lookName === null) return null
    const heard: string[] = []
    window.propSounds = heard
    return { built: fixtureLook(name, lookName, made.world), taps: [], sound: (s) => heard.push(s) }
  }, [made, name, lookName])
  // A tap anywhere on the page tries the look's props, as the game's room screen does.
  useEffect(() => {
    if (look === null) return
    const down = (e: PointerEvent) => look.taps.push({ x: e.clientX, y: e.clientY })
    addEventListener('pointerdown', down)
    return () => removeEventListener('pointerdown', down)
  }, [look])
  if (made.world.view !== view) throw new Error(`the scene's fixture ${name} is seen ${made.world.view === 'high' ? 'from high up' : 'from the side'}: ask for it with${made.world.view === 'high' ? '' : 'out'} view=high`)
  const source = useMemo<RoomSource>(() => ({ world: made.world }), [made])
  const shown = useMemo<ShownView>(() => ({ view: null, high: null }), [])
  const outline = useRef<HTMLDivElement>(null)
  const band: CSSProperties = { position: 'fixed', left: 0, right: 0, bottom: 0, height: pads, background: 'rgba(43,43,48,0.35)', pointerEvents: 'none' }
  return (
    <>
      <RoomStage source={source} lang={lang} clearBottom={pads} clearTop={hudTop(width, height)} worn={wornModels} shown={shown} house look={look}>
        <Driver step={(t, dt) => made.step(made.world, t, dt)} />
        {edges && <Magenta />}
        <Meter name={name} />
        {showFrame && <FrameOutline outline={outline} shown={shown} source={source} />}
      </RoomStage>
      {touch && <div style={band} />}
      {showFrame && <div ref={outline} style={{ position: 'fixed', border: '3px dashed #ff2d55', boxSizing: 'border-box', pointerEvents: 'none' }} />}
    </>
  )
}

const MAGENTA = new Color('#ff00ff')

/** Draws the background magenta, after the stage set it and before the meter renders: any of it left showing is easy to count. */
function Magenta() {
  const scene = useThree((s) => s.scene)
  useFrame(() => {
    scene.background = MAGENTA
  }, 999)
  return null
}

/** Keeps the dashed outline on the camera's frame, where the stage says it is on the screen: from high up round the corners of the box over the floor frame. */
function FrameOutline({ outline, shown, source }: { outline: RefObject<HTMLDivElement | null>; shown: ShownView; source: RoomSource }) {
  useFrame(() => {
    const box = outline.current
    const w = source.world
    const c = w.camera
    const f = w.floorFrame
    const corners: Vec3[] =
      f === null
        ? [
            [c.x - c.width / 2, c.y + c.height / 2, 0],
            [c.x + c.width / 2, c.y - c.height / 2, 0],
          ]
        : [-1, 1].flatMap((sx) => [w.bounds.min[1], w.bounds.max[1]].flatMap((y) => [-1, 1].map((sz): Vec3 => [f.x + (sx * f.width) / 2, y, f.z + (sz * f.depth) / 2])))
    const spots = corners.map((p) => screenOf(shown, p))
    if (box === null || spots.some((p) => p === null)) return
    const xs = spots.map((p) => p![0])
    const ys = spots.map((p) => p![1])
    const [x0, y0, x1, y1] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
    box.style.left = `${x0}px`
    box.style.top = `${y0}px`
    box.style.width = `${x1 - x0}px`
    box.style.height = `${y1 - y0}px`
  }, 500)
  return null
}
