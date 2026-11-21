# Super Me

A game for a five-year-old in two halves that feed each other. In the closet the child makes their own person: face, body, clothes and makeup. Then that person plays a side-view platformer through Pia Jump's five places, the Garden, the Kitchen, the Bath, the Toy Room and the Roof, where jumping alone never gets you through: you pick up crates of blocks and build your own way with planks, cubes, trampolines and ladders. Every level hides three presents with new things to wear, and a present goes on the moment it opens, so the person in the level changes on the spot and the closet has something new to try.

Nothing punishes, as in Pia Jump: no lives, no timer. A fall is a bubble ride back to safe ground (the third fall into the same gap carries you across), and when your hands are empty and every crate is used, all the crates come back.

The brief is [`design.md`](design.md) (in Finnish); the decisions and what is left are in [`plans/super-me.md`](../plans/super-me.md).

```
npm run dev                      # https://localhost:3002/super-me/
npx vitest run super-me        # the sim's build rules, a walkthrough of every level, every look drawn on a fake context
npm run build                    # typecheck + static build of every game in dist/
```

## How to play

| Do | What happens |
|---|---|
| Hold left or right (arrows, `A` `D`, or the pad bottom left) | Walk; after a second the same way, run. |
| Jump (`Space`, up, `W`, `Z`, or the right half of the screen) | A tap hops, holding jumps higher. |
| Walk into a crate | One block into your hands: it shows in the tray at the bottom and becomes the one you build. |
| Tap a block in the tray (or `1` to `4`, `Q` for the next) | That block is the one the build button puts down. |
| Build (down, `S`, `X`, `B`, or the round button over the jump) | On the ground a plank is a bridge out from your feet, a cube fills the hole in front of you or stands in front as a step, a trampoline stands in front of you. In the air a plank, a cube or a trampoline goes right under your feet. A ladder always stands on the ground under you and goes four up. A faint picture shows where it will go. |
| Walk into or land on a trampoline | It throws you about seven tiles up. |
| Stand in a ladder, or jump into one | You climb up on your own; push sideways to step off, jump to leap off. |
| Touch a present | It opens and you put the new thing on. |
| Reach the rainbow arch | A dance and confetti, then the closet to try on what you found, or the map. |
| `Esc`, `P` or the pause button | Pause: Keep going, Again, Map, Dress up, Music, Sound, Full screen. |

## The levels

| Level | Teaches | Presents |
|---|---|---|
| Garden | planks: bridges over two ponds, a plank put down mid-jump to climb a pillar and reach a shelf | butterfly face paint, rain boots, a flower crown |
| Kitchen | cubes: put one under your feet in a jump to climb the counter, stack two up the tall cupboard | a funny nose, shiny lips, a chef hat |
| Bath | trampolines: over the tub wall, through a present over the water, up onto a high shelf | rainbow eyeshadow, sparkly eyes, wings |
| Toy Room | ladders: up the toy shelf, beside the crayon box, two in a row up to the high table | a tutu, heart cheeks, a crown |
| Roof (night) | all four | a cape, a star dress, a magic hat |

A level opens when the one before it is finished. Each has the crates to reach all three presents; [`src/game/levels.test.ts`](src/game/levels.test.ts) plays every level through to prove it.

## For the parent

- The map's corner has Music, Sound, Full screen and Games (back to the directory).
- **Hold to start fresh** (bottom left of the map) for 3 seconds: the person, the presents and the finished levels are wiped. Sound and music stay.
- The game pauses itself when the page hides, the window loses focus, full screen ends, or nobody touches it for a minute.
- Everything lives in the browser's `localStorage` under `super-me`.
- Touch controls show only on a touch screen.

URL switches, read once when the page loads: `?level=<id or 1-5>` starts in that level and never writes the save; `?all` opens every level and every present for this visit only; `?sheet` lays out every option of every part and every pose.

## What it shares with Pia Jump

The games stay separate folders, but Super Me imports rather than copies what Pia Jump already has: the running and jumping constants, the room art (backdrops, ground, pits, the five places' looks), the camera, the ink-and-shade drawing helpers, the icons and the synth with its tunes. Super Me's sim (`src/game/sim.ts`) carries its own copy of Pia Jump's hero physics with building and climbing added; [`plans/super-me.md`](../plans/super-me.md) has the open item to share it.
