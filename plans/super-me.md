# Super Me (`super-me/`)

The brief is [`super-me/design.md`](../super-me/design.md): a character editor (face, body, clothes, makeup) and a platformer where the way forward is built from collected blocks (plank, cube, trampoline, ladder), the blocks limited so every level is a small puzzle, building possible mid-jump, and the two halves joined by presents in the levels that hold new things for the editor. Sami asked to reuse Pia Jump for it.

## Decisions

- **Reuse Pia Jump by import, not by copy.** Super Me imports Pia Jump's movement constants, room art (`pia-jump/src/draw/world.ts`, whose functions take the `Ground` subset of a room so a Super Me level can be drawn), camera (`pia-jump/src/draw/camera.ts`, moved out of its renderer for this), look helpers, icons and synth (`Sounds` plays Super Me's events under the names of Pia Jump's). Pia Jump's `Effects` reads Pia Jump's own sim, so Super Me has a small particle pool of its own. The levels take place in Pia Jump's five places, which keeps the art budget for the person.
- **The person is the hero.** Fixed hitbox (0.8 x 1.7, big Pia's feel) whatever the height or build, so every level plays the same for every look. A present goes on the moment it opens: the change shows at once in the level, and the closet sparkles with what is new.
- **Build rules a child can predict**, with a faint ghost of the next block always showing: on the ground a plank bridges out from the feet (skipping up to two cells of the floor still under the front), a cube fills the hole in front or stands in front as a step, a trampoline stands in front; in the air a plank, a cube or a trampoline goes right under the feet; a ladder always stands on the ground under her, four up, trimmed under a ceiling so she can stand on its top. Blocks never fall. A trampoline throws when the feet are on or in its cell and not rising, so walking into one works.
- **Auto-climb.** A ladder takes her up when she stands still in its column or meets it in the air; walking through one on the ground does not climb.
- **Nothing punishes.** Pia Jump's rescue bubble and its third-fall carry. Empty hands with every crate taken bring all crates back, so a level can never be lost for want of blocks.
- **Finnish or English, by the player** (plans/finnish-and-english.md). Every word is in `src/words.ts`; the logic keeps ids: the closet's tabs are `face`, `body`, `clothes` and `makeup`, a level has no name of its own (it is its place's, as in Pia Jump), and the presents' cheers left `closet.ts`. Every part, option, colour and block has a name in both languages for the screen reader. The map takes Ä and Ö in ABC blocks as Pia Jump's does, and its words would go through Pia Jump's `BLOCK_WORDS`; no level has one.
- **Proof without playing.** A walkthrough per level (`levels.test.ts`) drives the sim like a careful child and must open all three presents and finish with no fall and no failed build. Crates sit where a child lands after a drop, never under the arc of one: two of the first drafts' crates were flown over.

## Left to build

- Share the hero physics: `super-me/src/game/sim.ts` repeats Pia Jump's moveHero and collision (about 250 lines) with building and climbing added; an engine module both sims import would remove the copy.
- Longer levels (they are 60 to 64 columns, a minute or two each) and harder puzzles that use the limit on blocks, once the child has played these.
- A parent gate to open a locked level.
- A celebration after the fifth level.
- A take-back for a misplaced block, if watching the child shows one is wanted (the refill and Again cover it now).
