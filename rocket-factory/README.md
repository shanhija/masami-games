# Rocket Factory

A kids' version of Factorio for a five-year-old, seen from straight above on the browser's canvas. Beep, a little coral tin robot, lives by a launch pad where a rocket waits as a dotted outline in four parts. The child taps rocks so Beep digs them, presses machines onto a mint-green board like stickers, and draws conveyor belts with one finger; things ride a belt the way she drew it. Ovens bake rocks into bars, the workshop makes gears, two bottle makers mix bottles of science, and the lab drinks the bottles to find new things: more stickers, the next part of the rocket. Every working machine plays its part of the factory's song, and the song wakes the munchers: round raspberry critters who come out for the fizzy bottles, sit on belts stuffing their cheeks and nap on the bottle makers. Tickles, bubble towers fed by a belt, hedges and bowls of gold send them home. Fill the rocket and it flies to the moon.

It plays in the player's language, Finnish or English (picked by the flag in their profile): the cards' words, Beep's voice and the pause menu all follow it ([`src/words.ts`](src/words.ts)).

Nothing is lost and nothing startles. Placing a sticker costs nothing and peeling it gives everything back, Oops undoes the last minute of edits, a tickled muncher sneezes back what it ate, and a muncher's heap by its door comes back with one tap. There is no timer, score or way to fail: exactly one next step bounces at a time, and after a while a hand shows how.

The brief is [`design.md`](design.md), in Sami's words; the decisions and what is left are in [`plans/rocket-factory.md`](../plans/rocket-factory.md). It shares only the repo's tech with the other games: the one Vite + React project at the repo root, a pure state under vitest, synthesised sounds and a DOM HUD. Its look ("Sticker Table": plan view for where, front-view stickers with white rims and flat teal shadows for what) is its own.

```
npm install                          # at the repo root, once for every game
npm run dev                          # https://localhost:3002/rocket-factory/
npx vitest run rocket-factory        # the rules, the belts, the strokes, the munchers, the hint, the save, scripted children, every draw function on a fake context
FACTORY_LONG=1 npx vitest run rocket-factory   # also whole games on many seeds: the pacing windows, the munchers' havoc ratios, the fuzz
npm run build                        # typecheck + static build of every game in dist/
```

## How to play

| Do | What happens |
|---|---|
| Tap the rocks (or the pond) | Beep digs one and it flies into the oven that wants it. Hold to keep digging while an oven has room. |
| Drag a finger across the board | A belt, drawn as you go: each cell points to the next. Nothing is real until you lift; the end of the stroke wears a sign (a mouth into a machine, a zip for a join, a hump for a bridge, a split arrow for a fork, a stop sign). |
| A belt into a machine, a belt out of it | The machine takes what it wants from every belt that ends at its edge and pushes what it makes onto every belt that starts there. A belt running alongside does nothing. |
| Drag a sticker out of the tray | Its picture rides above your finger and lands where the picture is, snapping to the nearest good spot. Grey means it cannot go there, for a reason you can see (water, a tree, the pad, another machine, no rocks under a digger). A machine dropped on a belt takes what rides it. |
| Draw across a straight belt | A bridge: the new belt hops over. Draw from a belt's side and it forks; end on a belt's side and it joins. |
| The peel hand | Tap a machine or a belt to lift it, tap again to peel it back into the tray with everything inside it. Drag it over belts to roll them up. |
| Oops | Undoes the last edits (up to 10, from the last minute); each one curls back. |
| Tap a muncher | It wiggles, Beep tickles it, it sneezes back what it ate and giggles home. |
| Tap a thing on a belt, a roof stack, a heap or the basket | Beep carries it where it is wanted. |
| Tap a machine | Its recipe shows as pictures for 2 s. |
| Tap a burrow | Its munchers' way to their first target shows in paw prints. |
| The lab card (top right), the rocket card (top middle) | The next discovery and its bottle jars; the rocket's four parts filling. A tap on the lab card shows the whole path. |
| `Esc`, `P` or the pause button | The pause menu (below). |

The keys: `1` to `9` pick stickers (the digger is always `1`, the oven `2`), `B` the pencil, `H` the hedge, `X` the peel, `Z` or `Ctrl+Z` Oops, `Space` tickles the muncher nearest the middle, `Enter` presses Play and closes a card, `M` sound on or off, `F` full screen. A right click is the peel's first tap and a right drag rolls belts up.

## The chain

| Thing | Comes from | Used by |
|---|---|---|
| Blue rock | blue patches, by a digger or by Beep | an oven |
| Gold rock | gold patches, by a digger or by Beep | an oven |
| Bubble | the pond, by the pump or by Beep | bubble towers, the orange bottle maker |
| Blue bar | an oven: 1 blue rock in 2 s | the workshop, the green bottle maker, the rocket's legs |
| Gold bar | an oven: 1 gold rock in 2 s | the green bottle maker, snack bowls |
| Gear | the workshop: 2 blue bars in 4 s | the orange bottle maker, the rocket's body and nose |
| Green bottle | the green bottle maker: 1 blue bar + 1 gold bar in 4 s | the lab |
| Orange bottle | the orange bottle maker: 1 gear + 1 bubble in 4 s | the lab, the rocket's engine |

One digger feeds one oven, one oven feeds one workshop, one workshop feeds one orange bottle maker, and a blue oven and a gold oven feed two green bottle makers. A machine with nowhere to put what it makes stacks up to 4 on its roof and stops.

## The path

One fixed order with one choice. Each lab card costs about 5 to 6 minutes of what the bottle lines can make by then, so the factory sets the clock: a second green bottle maker brings the next card sooner, and a muncher napping on the bottle line holds it back.

| Card | Needs | Brings | Opens |
|---|---|---|---|
| Digger! | 3 blue bars in the rocket's legs | digger | |
| Gold! | the legs full (20 blue bars) | digger, oven | the gold rocks |
| Science! | the first gold bar | green bottle maker, lab | |
| Gears! | 5 green bottles | workshop, digger, oven | the rocket's body (30 gears) |
| Bubbles! and Hedges!, side by side (she picks which comes first) | 80 green each | pump and 2 towers; 8 hedges | |
| Nose! | 90 green | tower, 3 hedges | burrow B says hello and wakes, the nose (10 gears) |
| Stars! | 85 green | orange bottle maker | |
| Snacks! | 75 green, 20 orange | 2 bowls | |
| More! | 90 green, 45 orange | digger, oven, green bottle maker, tower, bowl, 3 hedges | burrow C says hello and wakes |
| Rocket! | 130 green, 40 orange | | the engine (40 orange bottles) |
| Fuel! | 180 green | | the launch, once the engine is full |

Every card from Gears! on also brings a belt pattern. The scripted children who follow the hint at a table's pace (ten seeds) build their first factory by about 1:10, find Gears! at about 4:50, Bubbles! at about 10:20 and Nose! at about 21:40, and see the rocket land at about 52 minutes; an eager child about 47, a slow one about 56.

After the launch the rocket's parts open again and fill again, every sticker is endless, and the munchers keep visiting: free play on the whole board.

## The munchers

Six burrows lie round the map: A, B and C by the start wake with Gears!, Nose! and More!, and D, E and F far out east, south-east and south sleep for now. The factory's song wakes them: each burrow's hunger grows faster with every working machine, and much faster for a machine on or near its ring of purple flowers. Its mound shows how close it is (a nightcap, then the nightcap slipping, a calyx over the sill, a sleepy face at the door), and at the top it wobbles for 5 s and they hop out. They go for the bottle makers (to nap on) and the bottle belts (to sit on and eat), then gears, then bars; a sitting muncher stops its belt, a napping one stops its machine and its band part turns into a kazoo. Full cheeks, nothing more to eat, a tickle, a bubble tower's suds or a picnic at a snack bowl send them home, and what they ate lands on a heap by the door. Hedges make them walk round (and a boxed-in muncher nibbles through one). Visits follow kind rules: one at a time, never during a card, a pause, the first two minutes of a sitting, Good night, or when nobody has touched the board for 30 s.

## For the parent

- **The pause menu**: Keep going, Good night, Sound, Music, Voice (Beep says each card's word and each new sticker's name in the player's language, in the browser's own voice for it, and nothing where the browser has none), Munchers (Many, Few, Polite, None), Science (Normal, Quicker), Full screen, More games, and Start again behind a 3 s hold. Polite munchers come out, wave, sit beside the bottle line and go home without eating; None keeps the burrows asleep all game.
- **Good night** is a tuck-in she does herself: dusk falls, one kind of machine at a time bounces in a nightcap and her tap tucks it in, and when the last is quiet Beep curls up beside the basket. The still card stays asleep; morning comes with the next sitting or Keep going.
- **Start again** keeps the old factory: the last three put aside wait behind Bring back in the pause menu, and a young factory never pushes out a bigger one. **For grown-ups**, behind its own hold: Keep a copy (a file) and Bring back a copy.
- **The save** is one object in the browser's `localStorage` under `rocket-factory`, written every 2 s while anything runs and at once after an edit, a card, a rocket part, a visit, a pause or a page hide. It is read leniently: what it does not know becomes empty, never an error. Another tab never writes over a newer save. Safari may clear a site's storage after 7 days without a visit; the menu shows "Not saved" when the browser does not keep it.
- **Sittings**: a return after 10 minutes or more away is a new sitting: Beep wakes with a stretch, the machines rejoin the song, and no visit comes for 2 minutes. The game pauses itself when the page hides, the window loses focus, full screen ends, or after 3 minutes untouched (10 while the factory runs on its own). Nothing runs while it is closed.

URL switches, read when the page loads. Any switch makes the run a test: it may read the save but never writes it.

| Switch | Does |
|---|---|
| `?demo=<name>` | A moment of a real game instead of the save: `start`, `factory`, `card-<card>` for each card (`card-digger` to `card-fuel`), `sitting`, `napping`, `nibbling`, `picnic`, `polite`, `towers`, `busy`, `dusk`, `night`, `ready`, `launch`, `after`. |
| `?nosave` | A fresh game, never saved. |
| `?seed=<n>` | The random numbers' seed, so a run replays. |
| `?autoplay` | With `?nosave` or `?demo`: a scripted child plays, for a parent to watch. |
| `?fast=<n>` | The game runs n times faster. |
| `?all` | Every card found, for looking. |
| `?munchers=many` / `few` / `polite` / `none` | The munchers' switch. |
| `?debug` | Every hit target, the belts' slots, each burrow's hunger, the frame rate. |
| `?sheet=<group>` | Every drawing of a group in a grid: `things`, `land`, `beltart`, `buildings`, `rocket`, `beep`, `critters`, `effects`, `hand`, `scenes`. `&only=<text>` keeps the entries whose label has it, `&t=<seconds>` freezes time, `&px=<pixels per cell>`. |

## Tuning

Units are board cells and ticks (60 a second); x runs right, y runs down.

- [`src/game/catalog.ts`](src/game/catalog.ts): every number: sizes, recipes and rates, the path (what each card needs and brings), the rocket's parts, the cost dial (`COST_SCALE`) and the Science switch's factor, the munchers' hunger, visits, naps, sleep and towers, the hint's waits.
- [`src/game/board.ts`](src/game/board.ts): the one board, 60 x 36 cells and all open (today's first board is its north-west corner; rocks, three ponds, trees, six burrows and their flowers, the pad).
- [`src/game/hint.ts`](src/game/hint.ts): the one next step, its ranks, and the blueprint (the factory the hint builds toward, searched offline for this board) with the way back to it when her own building leaves it.
- [`src/game/sounds.ts`](src/game/sounds.ts) and [`src/game/band.ts`](src/game/band.ts): every sound's voice and level, and the song each kind of machine plays its part of.
- [`src/draw/look.ts`](src/draw/look.ts): every colour as a token, and the look's rules.

`src/game/session.test.ts` plays scripted children (eager, table and slow paces; careful, never-defending, never-fetching and tickle-only) through whole games on the pure sim and fails if the pacing or the munchers' havoc drifts out of its windows (with `FACTORY_LONG=1` on ten seeds each).

## Layout

The pure sim in [`src/game/`](src/game/): `model.ts` (the shapes every part agrees on: the State, Action, Hit, SimEvent, Step), `catalog.ts`, `board.ts`, `rules.ts` (`newGame`, `act`, `step`, `cloneState`), `belts.ts` (the slot engine and its hop), `strokes.ts` (the one stroke table, placing and peeling, `applyEdit`), `trade.ts` (what crosses a machine's edge), `machines.ts` (batches, the lab, the path, the rocket), `munchers.ts`, `beep.ts` (where a thing is wanted, digs and carries), `jams.ts`, `hint.ts`, `where.ts` (where things are drawn, shared by the renderer and the hit test), `band.ts`. The browser glue: `game.ts` (the clock, the pointer router's wiring, keys, pause, the save, sittings, URL switches, sounds), `touch.ts` (the pointer router), `layout.ts` (the HUD's frame, the board-to-screen map, the hit test), `camera.ts`, `progress.ts` (the save), `hud.ts` (what the HUD shows), `sounds.ts`, `fixtures.ts` (the demos), `child.ts` and `brain.ts` (the scripted children).

The pictures in [`src/draw/`](src/draw/): `frame.ts` (the renderer: one frame in a fixed order, the bakes) and `Stage.tsx` (the canvas and its loop), `look.ts`, `things.ts`, `land.ts`, `beltart.ts`, `buildings.ts`, `rocket.ts` (the rocket and the launch), `beep.ts`, `critters.ts` (the munchers and Moony), `effects.ts` (particles), `hand.ts` (the hint's hand), `scenes.ts` (whole frames for `?sheet=scenes`), `cache.ts`, `fakeContext.ts` (the checking context the draw tests use), `Sheet.tsx`. The HUD in [`src/`](src/): `App.tsx`, `Hud.tsx`, `Tray.tsx`, `Cards.tsx`, `Pause.tsx`, `Hand.tsx`, `Pictures.tsx`, `Icons.tsx`, `Btn.tsx`, `styles.css`, and `words.ts` (every word in both languages).
