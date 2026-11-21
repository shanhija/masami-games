/**
 * The valley, as numbers: where the sand and the rocks lie, the roads, the river, the plants,
 * the building lots, and where every machine waits. The sim builds its world from this and
 * the scene dresses the same places. The camera looks north from the south: x runs left to
 * right on the screen and z toward the child.
 *
 *            far bank: meadow and cows                     z -48 to -40
 *   ~~~~~~~~~~~~~~~~~ river ~~~~~~[bridge x = 8]~~~~~~~~   z -40 to -33
 *   rock pile   crusher            street     hall   forest
 *   sand hill   brick press   lots | crane | lots    saw
 *               water tower        |
 *   =================== main road, z = 30 =================
 *   pond                playground                         z 34 to 47
 */

import type { BuildKind, ChapterId, MachineKind, PieceSpot, PlaceId, PlantId, Species, Spot, ThingKind, Zone } from './model'

/** The yaws that face the map's four ways. */
const SOUTH = 0
const EAST = Math.PI / 2
const NORTH = Math.PI
const WEST = -Math.PI / 2

/** The sand hill and the rock pile: heaps of `h * smooth(r, r * 0.35, distance)`, gentler than the repose slope everywhere, so nothing slumps until it is touched. */
export const SAND_HILL = { x: -33, z: 8, r: 17, h: 4 } as const
export const ROCK_PILE = { x: -32, z: -22, r: 11, h: 2.6 } as const

/** The river: a strip across the whole map that no machine can enter except on a built bridge. */
export const RIVER = { z0: -40, z1: -33, floor: -1.6, waterY: -0.45 } as const

/** A road's whole width: half of it either side of its line. */
export const ROAD_WIDTH = 6

/** A road to build: a straight bed from a to b. 0 is the main road's missing middle, 1 the street from it to the town, 2 the street on to the bridge. */
export const ROADS = [
  { ax: -22, az: 30, bx: 24, bz: 30 },
  { ax: 8, az: 27, bx: 8, bz: 10 },
  { ax: 8, az: 10, bx: 8, bz: -31 },
] as const

/** The main road's two ends, ready from the start: the world's edge to the missing middle. */
export const READY_ROADS = [
  { ax: -48, az: 30, bx: -22, bz: 30 },
  { ax: 24, az: 30, bx: 48, bz: 30 },
] as const

/** A round pit cut in the ground, `depth * smooth(r, r * 0.35, distance)` deep: its volume is 1.498 * depth * r * r. The road's two holes hold 80 percent of a truckload. */
export const HOLES = [
  { x: -12, z: 30, r: 2.4, depth: 0.55 },
  { x: 6, z: 30, r: 2.4, depth: 0.55 },
] as const
/** Where a truck tips the sand for each hole: beside it, so the dozer has something to push. */
export const TIP_RINGS: readonly Zone[] = [
  { x: -18, z: 30, r: 4.5 },
  { x: 0, z: 30, r: 4.5 },
]

/** The site hut, where Pip the hedgehog works. */
export const HUT = { x: -3, z: 23.5, r: 2.6 } as const

/** Where the digger stands to dig each thing, and the circle it digs in, inside its reach from there. */
export const PARK_SAND: Spot = { x: -16, z: 8, yaw: WEST }
export const DIG_SAND: Zone = { x: -20.6, z: 8, r: 1.3 }
export const PARK_ROCK: Spot = { x: -19.5, z: -21, yaw: WEST }
export const DIG_ROCK: Zone = { x: -24.1, z: -21, r: 1.3 }
/** The gravel heap the crusher makes. */
export const GRAVEL_HEAP = { x: -6.5, z: -22 } as const
export const PARK_GRAVEL: Spot = { x: -1.5, z: -22, yaw: WEST }
export const DIG_GRAVEL: Zone = { x: -6.1, z: -22, r: 1.3 }

/** The water tower: its column, and the ring beside it where its spout pours into a mixer. It is tall, so it stands south of nothing a child needs to see: the camera looks north past it. */
export const WATER_COLUMN = { x: -14, z: 21, r: 2 } as const
export const WATER_RING: Zone = { x: -14, z: 25.5, r: 4 }

/**
 * Each plant: its body (a circle a machine is pushed out of, and the box it is drawn in), its
 * hopper, the ring that means "at this plant", where a truck stands with its tail over the
 * hopper, how much makes one batch and how long a batch works, and where each batch comes out.
 */
export const PLANTS: Record<PlantId, { x: number; z: number; yaw: number; w: number; d: number; r: number; hopperX: number; hopperY: number; hopperZ: number; hopperR: number; ring: Zone; feedSpot: Spot; need: number; workFor: number; makes: ThingKind | 'gravel'; perBatch: number; outSlots: readonly (readonly [x: number, z: number])[] }> = {
  press: {
    x: -18,
    z: -9,
    yaw: EAST,
    w: 6,
    d: 5,
    r: 3.4,
    hopperX: -18,
    hopperY: 3.2,
    hopperZ: -5.8,
    hopperR: 2.6,
    ring: { x: -18, z: -2.2, r: 5 },
    feedSpot: { x: -18, z: -1.2, yaw: SOUTH },
    need: 1.6,
    workFor: 1.6,
    makes: 'bricks',
    perBatch: 1,
    outSlots: [
      [-12, -7],
      [-12, -4.4],
      [-12, -9.6],
    ],
  },
  crusher: {
    x: -14,
    z: -22,
    yaw: EAST,
    w: 5,
    d: 4,
    r: 2.9,
    hopperX: -15.5,
    hopperY: 3.4,
    hopperZ: -22,
    hopperR: 2.8,
    ring: { x: -19.5, z: -22, r: 3 },
    feedSpot: { x: -20.2, z: -22, yaw: WEST },
    need: 1.6,
    workFor: 2,
    makes: 'gravel',
    perBatch: 6,
    outSlots: [[-6.5, -22]],
  },
  saw: {
    x: 36,
    z: 14,
    yaw: WEST,
    w: 7,
    d: 5,
    r: 3.8,
    hopperX: 38,
    hopperY: 2.6,
    hopperZ: 14,
    hopperR: 3,
    ring: { x: 42.5, z: 9, r: 5 },
    feedSpot: { x: 42.5, z: 8.5, yaw: NORTH },
    need: 1,
    workFor: 1.5,
    makes: 'planks',
    perBatch: 2,
    outSlots: [
      [29.5, 12],
      [29.5, 14.5],
    ],
  },
}

/** The forest ring: logs load onto the lorry here. */
export const FOREST_RING: Zone = { x: 42.5, z: -24, r: 5.5 }

/** The tower crane's mast. */
export const TOWER_AT: Spot = { x: 14, z: -2, yaw: WEST }

/** A building lot: its middle and how wide it is on the x and z axes. */
export const LOTS = [
  { x: -3, z: -8, w: 10, d: 8 },
  { x: 22, z: -8, w: 10, d: 8 },
  { x: 22, z: 12, w: 10, d: 8 },
  { x: 0, z: 12, w: 10, d: 8 },
  { x: 22, z: -19, w: 12, d: 10 },
] as const

/** A building's half width and half depth inside its lot, for its body and its ghost. */
export const BUILD_HALF: Record<BuildKind, readonly [x: number, z: number]> = { house: [3, 2.5], hall: [4, 3], bridge: [3, 5.5], playground: [9, 5] }

/** Where the forklift brings pallets for the tower crane: in its reach, out of the way. */
export const PALLET_RING: Zone = { x: -6, z: 3, r: 3 }
/** Where a dropped pallet settles in a ring, as offsets from its middle: taken in turn, so pallets never overlap. */
export const RING_SLOTS: readonly (readonly [x: number, z: number])[] = [
  [-1.2, -1.2],
  [1.2, -1.2],
  [-1.2, 1.2],
  [1.2, 1.2],
]

/** The bridge: a pier in the river and two deck beams, bank to bank. */
export const BRIDGE = { x: 8, z0: -42, z1: -31, width: 6, deckY: 0.5, pierZ: -36.5 } as const
/** Where the truck crane stands to build the bridge, and where its pieces lie, one per spot, in its reach. */
export const MOBILE_PARK: Spot = { x: 13.5, z: -27, yaw: NORTH }
export const BRIDGE_PIECES_AT: readonly (readonly [x: number, z: number])[] = [
  [20, -29.5],
  [22, -28.5],
  [24, -27.5],
]

/** The playground, south of the main road: where the truck crane stands and where its pieces lie. */
export const PLAYGROUND = { x: 14, z: 41, w: 18, d: 10 } as const
/** The sand pit: a shallow bowl holding 80 percent of a truckload, and the ring a truck tips in beside it. */
export const SANDPIT = { x: 8, z: 41, r: 3.2, depth: 0.3 } as const
export const SANDPIT_RING: Zone = { x: 8, z: 36, r: 4 }
export const PLAY_PARK: Spot = { x: 15, z: 34, yaw: EAST }
export const PLAY_PIECES_AT: readonly (readonly [x: number, z: number])[] = [
  [24, 36],
  [26.5, 36],
  [29, 36],
]

/** The duck pond, and where the digger stands to dig it. */
export const POND_AT: Zone = { x: -24, z: 41, r: 5.5 }
export const POND_DIG: Zone = { x: -24, z: 39.1, r: 1.3 }
export const POND_PARK: Spot = { x: -24, z: 34.5, yaw: SOUTH }

/** Where the digger stands to dig out a lot's floor, and the circle it digs in. */
export const FLOOR_DIGS: readonly { lot: number; park: Spot; dig: Zone }[] = [
  { lot: 0, park: { x: -1, z: -1.5, yaw: NORTH }, dig: { x: -1.7, z: -6, r: 1.3 } },
  { lot: 4, park: { x: 13.5, z: -19, yaw: EAST }, dig: { x: 18.1, z: -19, r: 1.3 } },
]

/** Every form, in Sim.forms order: Bunny's floor and the hall's. A generated house's floor is stamped ready. */
export const FORMS = [{ lot: 0 }, { lot: 4 }] as const

/** A house's pieces: three bands of wall, then two sides of the roof, from the ground up. Spot y is where the piece's foot goes. */
function housePieces(x: number, z: number): readonly PieceSpot[] {
  return [
    { x, y: 0.1, z, yaw: 0, wants: 'bricks' },
    { x, y: 1.3, z, yaw: 0, wants: 'bricks' },
    { x, y: 2.5, z, yaw: 0, wants: 'bricks' },
    { x: x - 1.6, y: 3.7, z, yaw: 0, wants: 'planks' },
    { x: x + 1.6, y: 3.7, z, yaw: 0, wants: 'planks' },
  ]
}

/** Every building, in Sim.builds order. */
export const BUILDS: readonly { kind: BuildKind; lot: number; x: number; z: number; yaw: number; colour: string; owner: Species | null; spots: readonly PieceSpot[] }[] = [
  { kind: 'house', lot: 0, x: -3, z: -8, yaw: 0, colour: '#ffd9a0', owner: 'bunny', spots: housePieces(-3, -8) },
  {
    kind: 'bridge',
    lot: -1,
    x: 8,
    z: -36.5,
    yaw: 0,
    colour: '#c9ced6',
    owner: null,
    spots: [
      { x: 8, y: RIVER.floor, z: -36.5, yaw: 0, wants: 'pier' },
      { x: 8, y: 0.1, z: -39.25, yaw: 0, wants: 'beam' },
      { x: 8, y: 0.1, z: -33.75, yaw: 0, wants: 'beam' },
    ],
  },
  {
    kind: 'playground',
    lot: -1,
    x: 14,
    z: 41,
    yaw: 0,
    colour: '#ff9fc8',
    owner: null,
    spots: [
      { x: 18, y: 0, z: 42, yaw: 0, wants: 'slide' },
      { x: 23, y: 0, z: 41, yaw: 0, wants: 'swing' },
      { x: 13.5, y: 0, z: 44, yaw: 0, wants: 'climber' },
    ],
  },
  {
    kind: 'hall',
    lot: 4,
    x: 22,
    z: -19,
    yaw: 0,
    colour: '#f4efe6',
    owner: null,
    spots: [
      { x: 22, y: 0.1, z: -19, yaw: 0, wants: 'bricks' },
      { x: 22, y: 1.3, z: -19, yaw: 0, wants: 'bricks' },
      { x: 22, y: 2.5, z: -19, yaw: 0, wants: 'bricks' },
      { x: 20, y: 3.7, z: -19, yaw: 0, wants: 'planks' },
      { x: 24, y: 3.7, z: -19, yaw: 0, wants: 'planks' },
      { x: 22, y: 5.2, z: -19, yaw: 0, wants: 'clock' },
    ],
  },
  { kind: 'house', lot: 1, x: 22, z: -8, yaw: 0, colour: '#b8e0ff', owner: 'cat', spots: housePieces(22, -8) },
  { kind: 'house', lot: 2, x: 22, z: 12, yaw: 0, colour: '#d9f2b4', owner: 'dog', spots: housePieces(22, 12) },
  { kind: 'house', lot: 3, x: 0, z: 12, yaw: 0, colour: '#ffc7dc', owner: 'fox', spots: housePieces(0, 12) },
]

/** Where a machine waits, once it has come. */
export const HOME: Record<MachineKind, Spot> = {
  digger: PARK_SAND,
  dumper: { x: -10.5, z: 8.5, yaw: SOUTH },
  dozer: { x: -24, z: 24.5, yaw: EAST },
  roller: { x: -34, z: 36, yaw: EAST },
  mixer: { x: -12.5, z: 16.5, yaw: EAST },
  forklift: { x: -11, z: -1.5, yaw: EAST },
  tower: TOWER_AT,
  semi: { x: 42.5, z: 22, yaw: NORTH },
  mobile: MOBILE_PARK,
}

/** A rectangle on the ground, edges parallel to the axes. */
export interface Area {
  x0: number
  x1: number
  z0: number
  z1: number
}

/** True if a point lies in a rectangle. */
export const inArea = (a: Area, p: { x: number; z: number }): boolean => p.x >= a.x0 && p.x <= a.x1 && p.z >= a.z0 && p.z <= a.z1

/** Where each chapter's show plays, as rectangles: the van's road, Bunny's door and the animals round it, the bridge's lane and ribbon, the playground and the pond with their guests, the hall and the crowd before it. No machine stands in one while its party runs, and no machine's home is in one. */
export const PARTY_AREAS: Record<ChapterId, readonly Area[]> = {
  road: [{ x0: -46, x1: 48, z0: 26.4, z1: 32.4 }],
  house: [{ x0: -9, x1: 3, z0: -8, z1: 4 }],
  bridge: [{ x0: 3.5, x1: 12.5, z0: -46, z1: -24 }],
  play: [
    { x0: 5, x1: 23, z0: 35, z1: 46 },
    { x0: -30, x1: -18, z0: 35, z1: 47 },
  ],
  clock: [{ x0: 14, x1: 30, z0: -23, z1: -6 }],
}

/** Where a machine starts when it comes: off along the road, so it can be seen driving in with its horn going. The digger and the dumper start the game at home, and the tower rises where it stands. */
export const ENTRY: Record<MachineKind, Spot> = {
  digger: HOME.digger,
  dumper: HOME.dumper,
  dozer: { x: -33, z: 30, yaw: EAST },
  roller: { x: -33, z: 30, yaw: EAST },
  mixer: { x: -33, z: 30, yaw: EAST },
  forklift: { x: -33, z: 30, yaw: EAST },
  tower: TOWER_AT,
  semi: { x: 44, z: 30, yaw: WEST },
  mobile: { x: 44, z: 30, yaw: WEST },
}

/** Where a spoken place is: the ring a machine drives to. 'hole', 'house' and 'there' depend on the job and are worked out in the sim. */
export const PLACES: Record<Exclude<PlaceId, 'hole' | 'house' | 'there'>, Zone> = {
  sand: { x: -16, z: 8, r: 3 },
  rock: { x: -19.5, z: -21, r: 3 },
  road: { x: 0, z: 30, r: 4 },
  bridge: { x: 8, z: -28.5, r: 4 },
  water: WATER_RING,
  forest: FOREST_RING,
  saw: PLANTS.saw.ring,
  press: PLANTS.press.ring,
  crusher: PLANTS.crusher.ring,
  play: { x: 14, z: 35.5, r: 4 },
  pond: { x: -24, z: 34.5, r: 4 },
  clock: { x: 13.5, z: -19, r: 2.4 },
}

/** The trees that stand in the way, each a circle: x, z and radius. */
export const TREES: readonly (readonly [x: number, z: number, r: number])[] = [
  [46, -27, 1.2],
  [36, -30, 1.4],
  [46, -12, 1.2],
  [46, -3, 1.4],
  [33, -30, 1.3],
  [30, -31, 1.2],
  [-44, -30, 1.4],
  [-46, -8, 1.2],
  [-46, 26, 1.3],
  [-44, 44, 1.4],
  [44, 44, 1.3],
  [34, 44, 1.2],
]

/** The site's things a machine cannot drive through: the portable toilet, two stacks of barrels and three single barrels. Cones are small and stay driveable. Each is a circle (`r`) at (`x`, `z`) turned `yaw`. */
export const PROPS: readonly { kind: 'toilet' | 'barrelStack' | 'barrel'; x: number; z: number; yaw: number; r: number }[] = [
  { kind: 'toilet', x: -30, z: 9, yaw: 0.4, r: 1 },
  { kind: 'barrelStack', x: HUT.x - 5.2, z: HUT.z - 1.2, yaw: 0.2, r: 1 },
  { kind: 'barrelStack', x: -27, z: 12.5, yaw: -0.3, r: 1 },
  { kind: 'barrel', x: -10, z: -26, yaw: -10, r: 0.4 },
  { kind: 'barrel', x: -8.8, z: -26.6, yaw: -8.8, r: 0.4 },
  { kind: 'barrel', x: 3, z: -30.2, yaw: 3, r: 0.4 },
]

/** What stands in the way from the start, each a circle a machine is pushed out of: the hut, the water tower's column, the plants, the trees and the props. The tower's mast is a machine's body; built things add their own. */
export const OBSTACLES: readonly (readonly [x: number, z: number, r: number])[] = [
  [HUT.x, HUT.z, HUT.r],
  [WATER_COLUMN.x, WATER_COLUMN.z, WATER_COLUMN.r],
  [PLANTS.press.x, PLANTS.press.z, PLANTS.press.r],
  [PLANTS.crusher.x, PLANTS.crusher.z, PLANTS.crusher.r],
  [PLANTS.saw.x, PLANTS.saw.z, PLANTS.saw.r],
  ...TREES,
  ...PROPS.map((p) => [p.x, p.z, p.r] as const),
]
