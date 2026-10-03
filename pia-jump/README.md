# Pia Jump

A platformer that plays like Super Mario, for a five-year-old, drawn in true 2D on the browser's canvas. Pia, a girl with a pink cat-ear headband, runs and jumps through five rooms of an ordinary house over one day, from the Garden at sunrise to the Roof at night, to find a kitten asleep in its bed at the end of each. She stomps grumbles, kicks snail shells, bumps gift boxes from below, eats a cupcake to grow big, blows bubbles with a wand and bounces off springs. After the fifth kitten everyone has a picnic under the moon.

Nothing punishes. There are no lives, no timer and no game over, and the star count only goes up. A hit takes one form away (bubble Pia to big, big to small) or makes small Pia dizzy for half a second; a fall into a hole is a bubble ride back to safe ground, and the third fall into the same hole carries her across it. Kicked shells never hurt her, and the Big Grumble at the end never hurts her either: it only pushes her back.

The brief is [`design.md`](design.md); the decisions and what is left are in [`plans/pia-jump.md`](../plans/pia-jump.md). It shares only the repo's tech with the other games: the one Vite + React project at the repo root, a pure numeric sim under vitest, synthesised sounds and a DOM HUD. It draws on the plain canvas 2D context with its own sim instead of a game engine, so a bot can clone and step the whole game thousands of times a second to prove every room can be finished.

```
npm install                    # at the repo root, once for every game
npm run dev                    # https://localhost:3002/pia-jump/
npx vitest run pia-jump      # the sim's rules, every room's lints and the bot, a fuzz, every draw function on a fake context
npm run build                  # typecheck + static build of every game in dist/
```

## How to play

| Do | What happens |
|---|---|
| Hold left or right (arrows, `A` `D`, or the pad bottom left) | Pia walks. After a second the same way, she runs. |
| Press jump (`Space`, up, `W`, `Z`, or the round button bottom right) | A tap is a hop; holding it jumps higher. Running jumps go higher and further. |
| Land on a grumble | Poof, and a star. Stomps before she lands again pay 1, 2, 3, 4, then 5 stars each. |
| Land on a snail | It hides in its shell. Touch the shell to kick it: it knocks over everything in its way and pops into three stars at a wall. |
| Bump a gift box from below | A star; a sparkly box gives a star per bump, eight in all. A box with a power gives a cupcake to small Pia and the bubble wand to big Pia. One box in the Toy Room holds the rainbow ball. |
| The cupcake | Big Pia: two tiles tall, and she breaks cookie blocks from below. |
| The bubble wand | Bubble Pia: down, `S`, `X`, `B` or the bubble button blows bubbles that roll along the floor and catch the first enemy they touch. |
| The rainbow ball | Ten seconds with a rainbow halo: everything she touches tumbles away, and the music speeds up. |
| A spring | A big bounce, about seven tiles. |
| A lift | A ferry waits for her and carries her across the water; a swing or a cloud glides back and forth on its own. |
| The ribbon pole | The higher she grabs it, the more stars (1 to 5). She slides down and walks to the bed, and the kitten comes out for a hug. |
| `Esc`, `P` or the pause button | Pause: Keep going, Start again, Rooms, Music, Sound, Full screen, More games. `Enter` or a tap outside the buttons keeps going. |

`M` is the sound on or off, `F` is full screen. On the rooms screen, left and right step between the open cards and `Space` or `Enter` goes in.

## The rooms

| Room | Time | Kitten | New in it | Columns |
|---|---|---|---|---|
| Garden | sunrise | Sunny | running, tap jumps, grumbles, gift boxes, the cupcake, flower pots, a bench, 2-tile gaps with arcs of stars over them | 120 |
| Kitchen | morning | Coco | holding the jump (candy jars two and three tall), snails and shells, cookie blocks, the bubble wand | 130 |
| Bath | noon | Mochi | bath water, ferry lifts across it, bees | 140 |
| Toy Room | afternoon | Lulu | springs up to high shelves, swings, the rainbow ball, shell bowling, 3-tile gaps | 150 |
| Roof | night | Pepper | a remix of everything, then the Big Grumble: three stomps (or bubbles) and it hops away as a bunny and the gate sinks | 170 |

Every room starts with Pia small and a cupcake in its first box, and ends on a staircase of ABC blocks that spells its kitten, the ribbon pole and the kitten's bed. Enemies sleep until she comes within 13 tiles, and yawn before they move.

The rooms open one by one: a room is open once the kitten of the room before it is found. The rooms screen shows each room's card (its bed with eyes in the doorway, or the kitten once found), the best stars for that room, and the star jar with every star ever found. Finishing a room brings the kitten home to its card and counts the stars into the jar.

## For the parent

- **Sound** and **Music** are two switches, saved with the progress.
- **Hold to start fresh** (bottom left of the rooms screen): hold it 3 seconds and the kittens, best stars and the jar are wiped. Sound and music stay.
- **Hold a locked card** 3 seconds and it opens, for a child stuck on a room.
- The game pauses itself when the page hides, the window loses focus, full screen ends, the page comes back from the browser's back-forward cache, or nobody touches it for a minute.
- The progress lives in the browser's `localStorage` under `pia-jump`.
- Touch controls show only on a touch screen.

URL switches, read once when the page loads (a bad value shows its message on the page):

| Switch | Does |
|---|---|
| `?room=garden` or `?room=1` | Starts that room, whatever is locked. The progress is read but never written. |
| `&x=60` | With `?room`: starts her on the floor at or before column 60. |
| `&form=small` / `big` / `bubble` | With `?room`: starts her in that form. |
| `?all` | Opens every room, for this visit only. |
| `?autoplay` | With `?room`: the bot plays the room. |
| `?debug` | The grid, every hitbox, the stomp line at each enemy's middle, the camera's anchor, and the frame rate. |
| `?sheet=hero` or `?sheet=world` | Every sprite in a labelled grid; add `&room=<id>` for that room's colours, `&t=<seconds>` to freeze time, `&px=<pixels per tile>`. |

## Tuning

Every number a parent might want to change is in [`src/game/model.ts`](src/game/model.ts), grouped by topic: her speeds, the jump, gravity, the coyote time and the jump buffer, stomps and springs, how long she is safe after a hit, the rescue, enemy speeds and boxes, items, bubbles and lifts. The sim steps 120 times a second; constants are in tiles and seconds.

What she can do with the numbers as they are (measured by `src/game/sim.test.ts`, which fails if they drift):

| Jump | Peak (tiles) | Distance before landing (tiles) |
|---|---|---|
| A tap | 2.25 | 1.87 from a standstill, 2.75 at a walk |
| Held 0.3 s | 3.33 | 2.78 from a standstill |
| Held all the way | 3.69 standing, 4.38 walking, 4.75 running | 3.49 from a standstill, 4.62 at a walk, 7.25 at a run |
| A spring | 7.26 | |
| A stomp bounce | 1.97, or 3.69 with jump held | |

So from a standstill at the edge she clears a 1.7-tile gap with a tap and 3.3 with a full jump, and climbs a 2-tile step with a tap.

## Adding or changing a room

1. The rooms are in [`src/game/levels.ts`](src/game/levels.ts). A room is 15 rows of text, written a screen at a time with `join(...)`, one character per tile. The legend is at the top of [`src/game/room.ts`](src/game/room.ts): `#` ground, `=` shelf, `|` column, capitals are ABC blocks, `c` cookie block, `?` `$` `p` `r` gift boxes, `x` gate, `*` star, `^` spring, `@` start, `!` the pole, `h` the bed, `g` `s` `b` `k` enemies. Lifts are listed beside the map.
2. Run `npx vitest run pia-jump/src/game/levels.test.ts`. Its lints check the design rules (gap widths, run-ups and landings, rises, holes, headroom, box heights, where enemies may stand, bees and springs, the ending) and name the room, row and column with the map around it. Then the bot plays the room as small Pia with no hit and no fall; if it gets stuck, the test prints the map around the furthest column it reached.
3. Look at it: `?room=<id>` and walk, `&x=<column>` to start near the change, `?autoplay` to watch the bot.

## Layout

```
index.html          the page
src/
  main.tsx          mounts the app
  App.tsx           the game, or the sprite sheets with ?sheet; a bad URL switch shows its message
  Hud.tsx           everything over the canvas in the DOM: the rooms screen and its cards, the start
                    card, the star counter, the progress ribbon, the shouts, the pause menu, the
                    homecoming, the picnic, the parent gate's ring
  Controls.tsx      the touch pad, the jump button and the bubble button
  Portrait.tsx      a small canvas showing a real draw function: the star, a kitten, a bed, Pia's head
  Icons.tsx         the ink-style SVG icons
  styles.css        the HUD's look
  game/
    model.ts        the contract: units, the room, the sim's state, its events, every tuning constant
    room.ts         the map legend and the parser
    sim.ts          the rules: one step of the whole game as plain numbers, no canvas
    levels.ts       the five rooms
    bot.ts          a beam search over the real sim that plays like a child; ?autoplay replays it
    game.ts         the running game: screens, the fixed-step clock, pause, input, the save, sounds
    progress.ts     the save as pure functions
    sounds.ts       every sound and tune, synthesised with WebAudio
  draw/
    look.ts         the drawing rules: ink, line weights, shading, the night rim, shared shapes
    parts.ts        stroke helpers the characters share
    hero.ts         Pia in every form and pose
    critters.ts     the grumble, the snail and its shell, the bee, the Big Grumble, the kittens
    world.ts        each room's palette, terrain, pits and parallax backdrop
    things.ts       gift boxes, cookie blocks, the gate, stars, items, bubbles, lifts, springs,
                    the pole, the bed, the picnic
    frame.ts        the renderer: the camera, the terrain chunk cache, the draw order, the
                    homecoming, the picnic, the ?debug overlay
    effects.ts      the particles set off by the sim's events
    Stage.tsx       the canvas, its size and pixel ratio, and the frame loop
    sheet*.ts, Sheet.tsx   the sprite sheets
```

## How it hangs together

- The sim (`sim.ts` over the types in `model.ts`) is the whole game as flat data and typed arrays, stepped at a fixed 120 Hz. `game.ts` advances it from the stage's frame loop, at most 12 steps a frame so a stall never fast-forwards the room, and the stage draws between the last two steps. Because the state is flat, `cloneSim` is a cheap copy, which is what the bot's search needs.
- Input goes only through `setMove`, `pressJump`, `releaseJump`, `pressBubble` and `releaseBubble`. Keys and fingers merge in `game.ts`: the newest direction wins, and the jump is held while any source holds it.
- Each step leaves a list of events. Sounds and particles read them; anything drawn over time (a squash, a bump, a blink) reads the tick stamps on the entities instead.
- The terrain is baked into 8-column chunks on small canvases as the camera reaches them; the backdrop's parallax layers, the blocks, enemies, items and Pia are drawn every frame. Everything is vector paths, so it is sharp at any size.
- The HUD is React, subscribed to the game's version; the canvas is never React's.
- The progress is a small JSON object in `localStorage`, written when a room is done, a setting changes, a parent opens a room or starts fresh.
- Proof without playing: `sim.test.ts` checks every rule and the jump numbers above; `levels.test.ts` lints every room, has the bot finish each one and replays its plan, and fuzzes random hands for minutes; `draw.test.ts` and `frame.test.ts` run every draw function and the renderer on a fake context; `game.test.ts`, `progress.test.ts` and `sounds.test.ts` cover the clock, input, save and sounds. Screenshots in a headless browser check the looks.
