import { Canvas, events as pointerEvents, useFrame, type RootStore } from '@react-three/fiber'
import type { Intersection, Object3D } from 'three'

import { useScreenKey, type Game } from '../game/game'
import { MapScene } from './MapScene'
import { Play } from './Play'
import { WardrobeScene } from './WardrobeScene'

/** Behind every screen until its own sky covers it: a soft morning blue. */
const BACKGROUND = '#cdeeff'

/** Whether a thing and everything it hangs from is shown. */
function inSight(o: Object3D) {
  for (let node: Object3D | null = o; node; node = node.parent) if (!node.visible) return false
  return true
}

/** A finger finds only what the child can see: three's raycaster pays no attention to `visible`, so hidden things would catch taps meant for what is shown beside them. */
const seenEvents = (store: RootStore) => ({ ...pointerEvents(store), filter: (hits: Intersection[]) => hits.filter((hit) => inSight(hit.object)) })

/** Advances the game once per frame, before anything reads it: the negative priority sorts it first. */
function Driver({ game }: { game: Game }) {
  useFrame((_, delta) => game.advance(Math.min(delta, 0.1)), -1)
  return null
}

/** The scene of the screen the game is on. */
function Screen({ game }: { game: Game }) {
  switch (game.screen) {
    case 'map':
      return <MapScene game={game} />
    case 'wardrobe':
      return <WardrobeScene game={game} />
    case 'play':
      return <Play game={game} />
  }
}

/**
 * The one canvas the whole game draws in: soft shadows, at most 1.5 pixels per CSS pixel
 * for the iPad, the frame driver, and the scene of the current screen, keyed by the
 * screen and the run so every change of either mounts its scene afresh.
 */
export function Stage({ game }: { game: Game }) {
  const key = useScreenKey(game)
  return (
    <div className="stage">
      <Canvas shadows="percentage" dpr={[1, 1.5]} events={seenEvents} gl={{ antialias: true, powerPreference: 'high-performance' }} camera={{ fov: 50, near: 0.3, far: 1200, position: [0, 8, 14] }}>
        <color attach="background" args={[BACKGROUND]} />
        <Driver game={game} />
        <Screen key={key} game={game} />
      </Canvas>
    </div>
  )
}
