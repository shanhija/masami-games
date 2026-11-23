/**
 * The most puffs drawn at once: Silly Billy's Effects makes room for this many in each kind's
 * instanced mesh, and a game that hands it puffs keeps no more than this many (Magic House's
 * engine/effects.ts KEEP.puffs). A plain module with no imports, so a sim or a worker may read it
 * without pulling in three.js.
 */
export const PUFF_CAP = 600
