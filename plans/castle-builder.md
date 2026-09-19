# Castle Builder

The brief is [`castle-builder/design.md`](../castle-builder/design.md): a 3D game for a five-year-old who gathers wood, stone, ore, wool and flowers, builds a castle out of walls, towers, rooms and a dance hall, and keeps a chain of workshop people turning raw goods into better ones; fire, lightning and wind knock bits off that get repaired. It must look nothing like the chase games (side view, golden hour, toon shading): this one is a bright noon diorama seen from high up, flat-shaded low-poly, a round meadow island with the castle in the middle. The tech is the same: Vite, React, react-three-fiber, a pure numeric sim under vitest.

## Decisions

A five-lens design panel (child development, cosy-game design, a co-playing parent, a low-poly art director, an r3f engineer) reviewed the first draft. What changed and why:

- **Chains are at most two makers long.** Woodcutter (wood to planks), mason (stone to blocks), smithy (ore to iron), weaver (wool to cloth), dyer (cloth plus flowers to colour cloth). A five-year-old can retell "sheep, then cloth, then colour"; four links are invisible to them and fifteen build icons do not fit a tablet. Spinner, tailor, carpenter and builder's hut, and the goods yarn, fine cloth, furniture and chandelier, are out.
- **Costs use at most two kinds of good, one to three each**, shown as repeated little pictures, never digits alone.
- **Repair is free and takes hero time**: stand next to a broken piece, the hero hammers for three seconds, taps on it speed it up, the piece pops back with the same dust and thud as a new build. A repair cost in goods is a punishment the child cannot read. Broken pieces keep their shape with the top knocked off and a hammer sign, never a heap of rubble.
- **One fire at a time, and it never spreads.** Fire comes only from lightning, inside an announced storm, and only on wooden pieces. The hero douses it in two seconds with buckets from the well; the storm's own rain reaches it two seconds after the bolt and takes four more, so a child who runs is the rescue and a child who does nothing watches the cloud put it out. The broken pieces to hammer come from the stone a bolt breaks outright and the wall the wind chips.
- **Lightning never hits a piece built in the last thirty seconds**, and a bell tower catches every bolt with a bong and a spark shower and gives an iron bar instead of damage. Towers are three times as likely to be hit as anything else.
- **Wind is the funny disaster.** It steals one banner, which lands out in the meadow for the hero to fetch, blows the top off one wall, and rolls the sheep onto their backs for the hero to right.
- **The storm is a character**: a grumpy grey cloud drifts in over six seconds while the sky dims, the wind rises and the sheep run for the castle; thunder is a soft rumble, never a crack; every storm ends with a rainbow and puddles to splash through. No storm before six pieces stand, none at night, at most one every two and a half minutes, and a parent can turn them off in the pause menu.
- **Night is a bright dusk**, never below about sixty percent brightness, with glowing windows and fireflies over the meadow, and always calm.
- **The camera is a fixed diorama frame** that keeps the same radius of ground around its aim in view, standing further back on a narrow screen so no roof is ever cut off; it leans a quarter of the way toward the hero near the castle and follows properly once they run out into the meadow; no zoom. A "look" button and every finished wish orbit the castle once.
- **The King on the keep wishes for one thing at a time**, shown as a picture card with pips; each wish unlocks its piece in the build bar with a sparkle. Finishing a wish is a fanfare, confetti, a clap-dance and an orbit. After the last wish, free play.
- **Every tap does something.** Tap a tree, rock, sheep, flower patch or broken piece and the hero runs there and does the job; tap the ground to walk. An unaffordable build button still answers: the missing good bounces and an arrow appears in the world over where it comes from.
- **Goods speak one language**: each good is one small shape in one colour, the same on the meadow, in the flight arc, in the piles at the keep, in a worker's thought bubble, on the workshop sign and as the HUD icon. Workers carry inputs visibly from the yard to their door and sit with a bubble when the yard has none.
- **Sheep are toys**: they wander, hop and baa when poked or approached, turn small and pink when shorn and follow the hero for a bit.
- **The castle saves itself** to the browser so it is still there tomorrow; "new castle" needs a second confirming tap.
- **Auto-beauty**: walls join and grow battlements, wall ends grow turrets, placed cells get cobbles and flowers, the keep grows a storey every five pieces, bunting and doves appear as the castle grows, banners take the dyer's current colour, the child can repaint roofs with colour cloth, and the hand in the build bar takes any piece back up with everything it cost.

## Build order

1. Sim contract: `src/game/sim.ts` with every rule above, `sim.test.ts` driving it for twenty minutes with a scripted child and a scripted builder, then every rule alone.
2. `game.ts`: the running game, input, autosave, the sound map, the HUD version.
3. Scene: island and sky, nodes, castle pieces with auto-beauty, people, weather, effects, the fixed camera with lean and orbit.
4. HUD: store row, wish card, build bar with picture costs, corner buttons, start card, pause menu with the storm switch.
5. Sounds: synthesised, warm; the good sounds are the loud ones; a layered tune that grows with the castle.

## Left to build

- Villagers moving into rooms and dancing in the hall in the colours of the banners.
- A cat that appears after the first room and naps on its roof.
- A bucket line of workers when a fire starts.
