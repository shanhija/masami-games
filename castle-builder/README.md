# Castle Builder

A toy castle on a round meadow island, seen from high up, for a five-year-old. You are a little prince or princess with a red cape. Run to a tree and chop it, to a rock and break it, to a sheep and shear it, to a flower patch and pick it. Everything you gather flies to the yard in front of the keep. Build workshops and their people turn wood into planks, stone into blocks, ore into iron, wool into cloth, and cloth with flowers into colour cloth. Build walls, towers, a gate, rooms, a garden, banners, a bell tower and a dance hall. The King on the keep wishes for one thing at a time. Now and then a grumpy cloud comes over: lightning, fire or wind knocks a bit off, and you hammer it back up. Every storm ends with a rainbow.

Nothing punishes. Repair is free, a fire never spreads, a piece in the wrong place comes back up with everything it cost, nothing is ever lost for good, and the castle is saved in the browser, so it is still there tomorrow.

The brief is [`design.md`](design.md); the design decisions and what is left are in [`plans/castle-builder.md`](../plans/castle-builder.md). This game deliberately looks nothing like [`chase/`](../chase/README.md) or [`foot-chase/`](../foot-chase/README.md): no side view, no golden hour, no toon shading. It borrows only their tech: the one Vite + React project at the repo root, react-three-fiber and drei, a pure numeric sim under vitest, synthesised sounds, a DOM HUD.

```
npm install                      # at the repo root, once for every game
npm run dev                      # https://localhost:3002/castle-builder/ (also https://$DEV_HOST:3002/castle-builder/ over the VPN)
npx vitest run castle-builder    # the sim under a scripted builder and a random child for minutes, then every rule on its own
npm run build                    # typecheck + static build of every game in dist/, runs from disk
```

## How to play

| Do | What happens |
|---|---|
| Tap the ground, or hold the arrows | The hero runs there. |
| Tap a tree, rock, ore, sheep or flowers | The hero runs over and works on it until it is bare. Goods fly to the yard. Things grow back. |
| Tap a build button, then a lit cell (or press `Space`) | The piece pops out of the ground. A button you cannot afford still answers: the missing good bounces and an arrow shows where it comes from. |
| Tap the hand, then a piece | The piece comes back up and everything it cost goes back to the yard, so a full grid is never the end. |
| Tap a broken or burning piece | The hero runs there and hammers, or throws buckets. Extra taps help. |
| Tap a tower | It grows a storey for two blocks, up to three. |
| Tap the dyer | Its pot changes colour: red, yellow, blue, purple. Banners and paint take that colour. |
| Tap the brush, then a roof or banner | Painted, for one colour cloth. |
| Tap the keep or the bell tower | Bong. Everybody hops. |
| Tap a sheep | Baa. |
| `Space` with nothing chosen | A hop. |
| 👁 or `L` | The camera circles the castle once. |
| `Esc` or ⏸ | Pause: keep going, new castle (asks twice), sound, full screen, more games, storms on or off. |

`M` is sound on or off, `F` is full screen. `WASD` runs too, for a parent.

## The chain

Raw goods come off the meadow; each workshop person makes one thing from one or two things, and carries it to and from the yard where you can watch.

| Workshop | Takes | Makes | Used by |
|---|---|---|---|
| Mason | stone | blocks | walls, towers, gate, rooms, hall, bell tower, dyer |
| Woodcutter | wood | planks | towers, rooms, smithy, weaver, dyer |
| Smithy | ore | iron | gate, bell tower |
| Weaver | wool | cloth | dyer |
| Dyer | cloth + flowers | colour cloth | banners, hall, paint |

## The weather

A storm needs six pieces standing, daylight, and a couple of minutes since the last one. The cloud drifts in with a frown while the sheep run for the castle, then either:

- **Thunder**: one bolt. It never hits anything built in the last half minute. A bell tower catches it (bong, sparks, one iron bar). Otherwise a stone piece loses its top and a wooden one catches fire. Fire burns ten seconds, then the piece is broken. The hero puts it out in two, the rain in four.
- **Wind**: the sheep roll over, one banner flies off across the meadow (fetch it and it flies back onto its pole), and one wall loses its top.

The rain starts two seconds after the bolt, so a fire the hero never reaches is still put out before it takes the piece down. Then the cloud smiles, leaves, and a rainbow stands over the castle. Puddles after the rain splash when you run through them. Night is a bright blue evening with lit windows and fireflies over the meadow, and always calm.

## Layout

```
src/
  game/
    sim.ts        the whole game as plain numbers: the hero, the nodes, the yard, the grid of
                  pieces, the workshop people, the wishes, the weather. No three.js.
    sim.test.ts   a scripted builder and a random child for minutes; then every rule alone
    game.ts       the running game: sim + sounds + pause + the save in the browser + a
                  version the HUD subscribes to; the keyboard
    sounds.ts     every sound is synthesised, and the tune grows a layer as the castle grows
  scene/
    Stage.tsx     the one Canvas: frame driver, the fixed diorama camera that keeps the grid
                  and its roofs in frame, leans toward the hero and circles on a wish, the sun
                  and the sky light through the day
    Sky.tsx       clouds and their shadows, the grumpy cloud, rain, the bolt, the rainbow,
                  evening fireflies, leaves in the wind
    Island.tsx    the meadow disc on its dirt rim, the water, grass and flowers, puddles
    Nodes.tsx     trees, rocks, ore, sheep, flower patches, a lost banner
    Castle.tsx    the keep and the yard, every piece and its states, the ghost and the cells
    People.tsx    the hero, the workshop people, the King on the balcony
    Effects.tsx   goods flying to the yard, dust, confetti, sparks, steam, water, the hint arrow
    Synced.tsx    one component per item in a sim list, keyed by id
    look.tsx      the palette, the flat materials, the one mesh per good, the yard layout
  Hud.tsx         the words over the picture, which are almost none: the wish card, the
                  goods, the build bar, the buttons, the start card and the pause menu
  Icons.tsx       the same goods and pieces as flat SVG icons
```

## How it hangs together

- The sim runs once per frame from `Stage`'s `Driver` (priority -1, so it precedes every reader). Scene components read the sim in `useFrame`; only the HUD is React state, driven by a version that bumps when anything it shows has changed.
- Taps are the scene's business: the ground, every node, every piece, the keep and the grid cells carry pointer handlers that call the `Game`, which is the only path into the sim. The keys are the `Game`'s.
- The hero works by standing still: whatever is in reach gets worked on, fire first, then something broken, then the tapped node, then the nearest. Goods are credited the moment a unit comes off; the flight to the yard is a picture.
- Everything is one shape everywhere: a good looks the same on the meadow, in the air, in the pile, in a worker's thought bubble, on the workshop sign and in the HUD, so a child never needs a word.
- One-shot effects come from timestamps in the sim (`builtAt`, `wishDoneAt`, `lightning.at`, `hitAt` and friends), never from events; events feed the sounds only.
- The whole sim is JSON. It is saved every five seconds and restored on the next visit; a new castle forgets it.
- Tuning lives in the constants at the top of `sim.ts`.
