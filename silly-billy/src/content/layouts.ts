/**
 * Where everything stands when a room is set up. Each room is framed by its tall things at
 * the back and the sides, keeps its middle roomy so people walk between the big toys, and
 * keeps clear of the spawn row (z 4 to 5, x -7 to 7) and of the "come" spots in front of it;
 * only low things stand at the front, where they cannot hide anyone from the camera. Built-in
 * furniture is fixed; what a child can pick up is not. Yaw 0 faces the camera's side (+z).
 */

import type { Placement } from '../engine/sim'
import type { RoomId } from '../engine/types'

const fixed = (kind: string, x: number, z: number, yaw = 0): Placement => ({ kind, x, z, yaw, fixed: true })
const loose = (kind: string, x: number, z: number, yaw = 0): Placement => ({ kind, x, z, yaw })

const QUARTER = Math.PI / 2

export const LAYOUTS: Record<RoomId, Placement[]> = {
  playground: [
    // The big toys, in the middle and toward the back.
    fixed('slide', -6.5, -5.5),
    fixed('swing', 0, -7),
    fixed('climbing-frame', 6.5, -7, 0.3),
    fixed('sandbox', -5.5, -0.8),
    fixed('roundabout', 1, -2.3),
    fixed('seesaw', 6.5, -1.8),
    // Benches at the sides and one at the front, facing the camera.
    fixed('bench', -10.5, 2, QUARTER),
    fixed('bench', 10.5, 4.5, -QUARTER),
    fixed('bench', -2.5, 9.6),
    fixed('lamp-post', -10.5, 6),
    fixed('lamp-post', 10.5, 1),
    // Trees along the back and the back of the sides; low bushes and flowers at the front.
    fixed('tree', -10.3, -10.3, 0.4),
    fixed('tree', -3.8, -10.4, 1.9),
    fixed('tree', 10.3, -10.2, 3.1),
    fixed('tree', -10.4, -2.6, 2.4),
    fixed('tree', 10.4, -4.4, 0.9),
    fixed('bush', -7, -10.8),
    fixed('bush', 3.8, -10.8, 1.2),
    fixed('bush', -10.6, 10.6, 0.6),
    fixed('bush', 10.6, 10.6, 2.2),
    // Things to pick up and play with.
    loose('flowers', -7.5, 9.8),
    loose('flowers', 3.5, 10.4),
    loose('flowers', 8.6, 9.2),
    loose('flowers', 3.6, -4.6),
    loose('ball', 2.6, 0.9),
    loose('ball', -2.4, -4.4),
    loose('football', -1.6, 0.6),
    loose('bucket', -5.9, -1.2),
    loose('spade', -5, -0.4),
  ],
  pool: [
    // At the pool's edge (the water is x -5.5..5.5, z -6..1): the diving board at the back, a ladder on each side.
    fixed('diving-board', 0, -6),
    fixed('pool-ladder', -5.5, -2.5, QUARTER),
    fixed('pool-ladder', 5.5, -1.5, -QUARTER),
    fixed('lifeguard-chair', 8, -2.5, -QUARTER),
    // Loungers and parasols on the tiles, facing the water.
    fixed('lounger', -8.8, -4.5, QUARTER),
    fixed('lounger', -8.8, -1.2, QUARTER),
    fixed('lounger', 4, -9.5),
    fixed('lounger', 7, -9.5),
    fixed('parasol', -9.6, -2.85),
    fixed('parasol', 5.5, -10.5),
    fixed('parasol', -7.5, -9.2),
    // Palms in the corners, bushes and flowers at the front.
    fixed('palm', -10.3, -10.3),
    fixed('palm', 10.3, -10.3, 1.3),
    fixed('palm', -10.3, 10.3, 2.6),
    fixed('palm', 10.3, -6, 4),
    fixed('bush', -5.5, 10.6),
    fixed('bush', 6.5, 10.6, 1.5),
    loose('flowers', 1.5, 10.6),
    // Towels on the tiles; toys floating in the water and one ring on the side.
    loose('towel', -3, -9.6, 0.2),
    loose('towel', 1.8, -9.8, -0.15),
    loose('swim-ring', 2.5, -3.5),
    loose('swim-ring', 8.8, 0.6),
    loose('beach-ball', -2, -1.5),
    loose('rubber-duck', 3.5, -0.6, 0.8),
    loose('rubber-duck', -3.4, -4, -0.6),
    loose('rubber-duck', 0.8, -2.6, 2.5),
  ],
  forest: [
    // Pines and leafy trees framing the edges. The pond (x 6.5, z -6.5) and the dirt path the ground
    // draws from the front middle to the back (scene/Ground.tsx, about x 0 to 2) stay clear.
    fixed('pine', -10.3, -10.3),
    fixed('pine', -6.3, -10.3, 1),
    fixed('tree', -2.3, -10.3, 2),
    fixed('pine', 3.6, -10.4, 2.5),
    fixed('pine', 10.3, -10.3, 0.7),
    fixed('tree', -10.3, -6.2, 0.5),
    fixed('pine', -10.3, -2.2, 1.7),
    fixed('pine', -10.3, 1.8, 3),
    fixed('pine', -10.3, 10.3, 0.2),
    fixed('tree', 10.3, -2.4, 2.8),
    fixed('pine', 10.3, 1.6, 1.1),
    fixed('rock', 10.2, -5.8, 0.6),
    fixed('rock', -6.5, -0.2, 2.1),
    fixed('rock', -7.5, 9.2, 4),
    fixed('rock', 5.5, 0.3, 1.2),
    // The camp: a tent, and a campfire with a log behind it, another at its side and a stump.
    fixed('tent', -6, -6.5, 0.5),
    fixed('campfire', -2.2, -3.6),
    fixed('log', -2.2, -5.6),
    fixed('log', -4.4, -3.2, QUARTER),
    fixed('stump', -3, -1.6),
    // Low things at the front: flowers and berries.
    fixed('flower-patch', 2.5, 9.6),
    fixed('flower-patch', -5.2, 10.6, 1),
    fixed('berry-bush', 6.5, 10.2, 0.3),
    fixed('berry-bush', -3.2, 8.6, 2),
    fixed('berry-bush', 10.4, 9.9, 1.4),
    // Things to find on the ground.
    loose('mushroom', -8.3, -1.2),
    loose('mushroom', -0.6, -6.6),
    loose('mushroom', 8, -1.8),
    loose('pinecone', -1, -8, 0.7),
    loose('pinecone', 4.4, -2.6, 2),
    loose('pinecone', -8.8, -4.3, 4.1),
    loose('stick', 0.6, -0.6, 1.2),
    loose('stick', -4.6, -8.8, 0.3),
    loose('stick', 8.2, -9.8, 2.2),
  ],
}
