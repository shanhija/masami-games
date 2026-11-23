/**
 * What a room may cost the page to draw: its draw calls in one frame (renderer.info.render.calls,
 * the scene's own and the puffs' together) and the time one frame of the scene takes on the CPU
 * (every layer's update and the render call). Measured on this machine's headless Chromium with
 * its GPU against every fixture of the scene's sheet (Sheet.tsx); the tablet is Sami's to look at
 * (plan.md, Open). The room's own budget of pieces (engine/api.ts BUDGET.pieces) is what keeps a
 * made room inside these.
 */
export const SCENE_LIMITS = {
  /**
   * Draw calls in one frame. 150 held every room with its kids as they come (step 2: Pirate Sails
   * at level 3, 139); every worn thing is one more, so four kids wearing all five slots add 20, and
   * the heaviest rooms at level 3 then reach 151 to 152 (step 6: Pirate Sails and Treasure Crane)
   * with the scene still at about 2 ms a frame. Hence 160.
   */
  drawCalls: 160,
  /**
   * Milliseconds of the scene's work in one frame, the mean over the last two seconds. Step 7a's
   * house (its shell merged into the still batch at no draw call) left the fixtures at 1.1 to 2.6 ms
   * and at most 140 calls on this machine; 3 ms keeps room for the look's props and small lights.
   */
  frameMs: 3,
} as const
