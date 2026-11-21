/** The valley with everything in it: the title's living background and the play screen are the same world. */

import { useMemo } from 'react'

import type { Game } from '../game/game'
import { Animals } from './Animals'
import { Builds } from './Builds'
import { Camera, createView } from './Camera'
import { Effects, Pool } from './Effects'
import { Ground } from './Ground'
import { MachineLayer } from './MachineLayer'
import { Marker } from './Marker'
import { Plants } from './Plants'
import { Scenery } from './Scenery'
import { Shows } from './Shows'
import { Sky } from './Sky'
import { Things } from './Things'

export function Play({ game, shadow }: { game: Game; shadow: 512 | 1024 }) {
  const sim = game.sim
  const view = useMemo(createView, [])
  const pool = useMemo(() => new Pool(), [])
  return (
    <>
      <Sky aim={() => ({ day: sim.day, targetX: view.x, targetZ: view.z })} shadow={shadow} />
      <Ground terrain={sim.terrain} ponds={sim.ponds} />
      <Scenery terrain={sim.terrain} />
      <Builds sim={sim} />
      <Plants sim={sim} view={view} />
      <Things sim={sim} />
      <Animals sim={sim} />
      <MachineLayer game={game} view={view} />
      <Marker game={game} view={view} />
      <Effects game={game} pool={pool} />
      <Shows game={game} pool={pool} />
      <Camera game={game} view={view} />
    </>
  )
}
