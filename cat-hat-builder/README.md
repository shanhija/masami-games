# Cat Hat Builder

A building game for a five-year-old, seen from the side on the browser's canvas. The child dresses a builder who wears a hard hat with cat ears, drives a truck down a road picking up logs, clay, sand and gems, stops at boulders to break them for rocks, and brings it all home. At the yard each raw good goes into its own machine and comes out as a building material, and the materials become rooms on a plot: a tall house five floors high or a row house of three homes. Every room gets a theme the child picks (disco, ball pit, slide, sleep, cat, birthday and more) and fills with things that move and play when tapped, and the builder visits each one. A session ends with Good night: the child turns off every house's lights, room by room.

Nothing is lost and nothing startles. Taking a room back returns its goods, going home early keeps the load, the truck stops by itself before anything it could hit, and there is no timer, score or way to fail.

The brief is [`design.md`](design.md), in Finnish; the decisions and what is left are in [`plans/cat-hat-builder.md`](../plans/cat-hat-builder.md). It shares only the repo's tech with the other games: the one Vite + React project at the repo root, a pure state under vitest, synthesised sounds and a DOM HUD. Its look ("Sunny Site": one navy ink, flat toy colours, boxes lit on top) is its own.

```
npm install                       # at the repo root, once for every game
npm run dev                       # https://localhost:3002/cat-hat-builder/
npx vitest run cat-hat-builder    # the rules, the roads' lints, the scripted child, a fuzz, every draw function on a fake context
npm run build                     # typecheck + static build of every game in dist/
```

## How to play

| Do | What happens |
|---|---|
| Tap the builder's face (top left on the street) | The mirror. Tap a part of the big builder or a picture tab to change it; the dice makes a random builder and the arrow undoes the last five rolls. |
| Tap the truck | Off to the road. Trip 1 is a short training road; from trip 2 a signpost offers Forest, Beach and Hills. |
| Hold the pedal (or `Space`, right arrow, `D`) | The truck drives; let go and it rolls to a stop, a tap pushes it about a second. It stops by itself at every boulder, every crossing and the train. |
| At a boulder, tap the tool button or the rock | A hit with the builder's own tool. After 3 hits (small) or 5 (big) it bursts and the rocks fly into the bed; one boulder in three hides a gem. After 6 s with no hit the builder hits on their own. |
| The horn (or `H`) | A soft "meep meep"; ducks, cats, hedgehogs and cows on the road answer. |
| The ramp, at full speed | The truck flies through an arc of three gems. A slow truck gets one gem at the bottom. |
| The house button (top left on the road, or `Backspace`, `B`) | Home at once, with the load. |
| Home | The truck drives in, tips its load into the yard, and the trip's present opens: a new room theme or something to wear. |
| Tap a crate | The first time a raw good comes home, its machine arrives in a crate; three hits with the tool unfold it. |
| Tap a machine | It runs its whole heap, a batch every 0.8 s; more taps hurry it. |
| Tap the empty plot | "Which house?": a tall house or a row house. |
| Pick a material and a shape, then touch the plot | Blueprint ghosts show every place the room fits; lifting the finger builds it, and the crane lowers it. |
| "Which room?" | A grid of picture cards; the room fills with that theme's things. |
| Tap a room | The room view: the builder visits, every thing plays when tapped, the tray adds and takes back things, two paint pots change the wallpaper and the floor, "Another room" changes the theme: the new theme's things replace the old one's, and things from other themes stay. |
| The hand ("Take back") | The first tap lifts a room with nothing on top; a second tap carries it away and its goods fly back. A room holding others up just makes them wiggle. |
| A front door, or the bell | A doorbell party: every thing in the house plays in turn from the bottom floor up, and the friends wave. |
| The roof button (or a roof with no room to build above it) | The next roof: pointed, round, a garden, a tower with a flag. |
| The moon | Good night: evening falls and the windows glow; tap each house to turn its lights off, and the builder waves goodnight from the garage. A tap plays again. |
| `Esc`, `P` or the pause button | Pause: Keep going, Good night, Sound, Music, Full screen, More games, and Start again behind a 3 s hold. `Space` or `Enter` keeps going. |

On the street the arrow keys pan and a drag pans. `M` is the sound on or off, `F` is full screen.

Exactly one next step bounces at a time (a crate, a machine with goods waiting, the plot when a room can be paid for, the truck), what is in sight before what is not, the rest of the yard in one walk from the garage's side. When it is out of sight, the camera glides to it a moment after the street is quiet, and after 8 s with no touch a hand taps it twice; both wait while a machine in view is still making things.

## The chain

| Raw good | Where on the road | Machine | Material |
|---|---|---|---|
| Log | lying on the road, most on Forest | sawmill | planks |
| Clay | lying on the road, by the river | brick oven | bricks |
| Rock | inside boulders (2 from a small one, 3 from a big one), most on Hills | cement mixer | concrete |
| Sand | lying on the road, most on Beach | glass oven | glass |
| Gem | the ramp's arc, the balloon, one boulder in three, a present after the last unlock | rainbow machine | rainbow blocks |

A room costs 2 of its material per square: small (1x1) 2, wide (2x1) 4, tall (1x2) 4, big (2x2) 8. A trip brings about 16 raw goods (18 when the truck flies the ramp), enough for about five rooms, so the six plots of the street fill around trip 10 or 11.

## The rooms

The ten themes of the brief are open from the start; Bath, Space, Kitchen and Sauna come in presents. Each has a ceiling thing, a wall thing, two floor things and a friend, every one with an idle loop, a tap reaction and a sound.

| Theme | Ceiling | Wall | Floor | Friend |
|---|---|---|---|---|
| Disco | disco ball | neon star | speaker, DJ desk | dancer |
| Play | plane mobile | toy shelf | block tower, rocking horse | a child with toys |
| Ball pit | cloud lamp | hoop | ball pit, ball chute | diver |
| Slide | paper plane | sunny window | big slide, cushion | a child on the slide |
| Gym | rings | climbing wall | trampoline, big ball | bouncer |
| Sleep | moon mobile | star poster | bed, night lamp | teddy bear |
| Music | note lights | guitar | drum kit, piano | singer |
| Crafts | paper chain | painting | easel, craft table | painter |
| Cat | fish lamp | cat shelf | cat tree, ball of yarn | a cat in a box |
| Birthday | balloons | bunting | cake, presents | a party child |
| Bath | bubble lamp | towel rack | bathtub, toilet | big duck |
| Space | planets | star window | rocket, robot | astronaut |
| Kitchen | pot lamp | jar shelf | oven, pot on the stove | cook |
| Sauna | sauna lamp | birch whisk | kiuas, bucket | a child in the sauna |

The tall house is 3 columns by 5 floors with balconies and a glass lift; the row house is 6 columns by 2 floors, three homes of 2 columns with their own doors. A room's slots are one ceiling slot per column, one wall slot per column and floor, and two floor slots per column on its bottom floor.

## For the parent

- **Sound** and **Music** are two switches in the pause menu, saved with the game.
- **Start again**: hold it 3 seconds in the pause menu and the goods, machines, houses, trips and presents are wiped. The builder's look, sound and music stay.
- The game pauses itself when the page hides, the window loses focus, full screen ends, the page comes back from the browser's back-forward cache, or nobody touches it for a minute.
- The game lives in the browser's `localStorage` under `cat-hat-builder`, written at most once a second after a change and when the page hides. It is read leniently: anything it does not know becomes empty or is refunded, never an error.
- Good night stops the frame loop on a still card, so a sleeping iPad does not keep drawing.

URL switches, read once when the page loads (a bad value shows its message on the page). Any switch makes the run a test: it may read the save but never writes it.

| Switch | Does |
|---|---|
| `?demo=street` / `tall` / `row` / `room` / `road` / `mirror` / `themes` | A rich scene instead of the save: a full street, a tall or a row house in the build view, a furnished room, a street ready for a trip, the mirror, a street of every theme. |
| `?nosave` | A fresh game, never saved. |
| `?seed=<n>` | The random numbers' seed, so a run replays. |
| `?rich` | 99 of every good. |
| `?all` | Every present's unlock. |
| `?road=forest` / `beach` / `hills` | That road starts at once (on a fresh game it counts as the second trip). |
| `?autoplay` | With `?nosave` or `?demo`: the scripted child plays, for a parent to watch. |
| `?debug` | Every hit target, the shot's rectangle, the HUD's insets, and the frame rate. |
| `?sheet=<group>` | Every drawing of a group in a labelled grid: `keys`, `builder`, `goods`, `truck`, `land`, `street`, `machines`, `house`, `rooms`, `motion`, `animals`. `&only=<text>` keeps the entries whose label has it, `&t=<seconds>` freezes time, `&px=<pixels per metre>`. |

## Tuning

Units are metres and seconds, y points down and the ground is at y = 0; the state steps 60 times a second.

- [`src/game/model.ts`](src/game/model.ts), at the end: the timings (the builder's dash, the camera's tween, a machine's batch, the crate's hits, the crane, the tip, the goods' flights), a room's price per square, the plot count, the hint's wait, the boulders' hits and rocks, the crossers' time.
- [`src/game/catalog.ts`](src/game/catalog.ts): what each road brings, the training road, the order of the presents, what is locked, the themes' words and visits, the friends' outfits.
- [`src/game/road.ts`](src/game/road.ts), at the top: the truck's speeds, pull, coasting and braking, the push, the ramp's arc, the balloon, the train, and the spacing rules the road lint holds.
- [`src/game/layout.ts`](src/game/layout.ts): the street's places (garage, mirror, yard, plots), a cell's size, the slots in a room, the smallest tap target (56 px).
- [`src/game/sounds.ts`](src/game/sounds.ts): every sound's voice and level, the music, the soft limiter.

`src/game/rules.play.test.ts` drives scripted trips through the real road layouts and fails if the economy drifts: about 16 goods a trip, 4 to 7 rooms a trip for a child who spends everything, the street full at trip 10 to 12.

## Adding a theme or an item

1. Add the theme to `THEMES` in [`src/game/model.ts`](src/game/model.ts) (only at the end: the save stores ids) and its word and visit pose to `THEME_INFO` in [`src/game/catalog.ts`](src/game/catalog.ts); a theme that comes in a present also goes in `PRESENTS` and `LOCKED_THEMES`.
2. Add its five items to `ITEMS` in [`src/game/items.ts`](src/game/items.ts): slot, idle loop, tap motion, sound.
3. Draw them in one of the room files in [`src/draw/rooms/`](src/draw/rooms/) as a `ThemeArt` (wall, floor, glow, the paint pots' swatches, one draw function per item). The `ItemOf<T>` type makes the compiler name any item without a drawing.
4. Run `npx vitest run cat-hat-builder/src/draw/rooms` (every item inside its slot box at every moment of its idle and tap, no NaN, the context left as found) and look at `?sheet=rooms&only=<theme>` and `?demo=themes`.

## Layout

```
index.html            the page
design.md             the brief, in Finnish
src/
  main.tsx            mounts the app
  App.tsx             the game, or the sprite sheets with ?sheet; a bad URL switch shows its message
  Hud.tsx             everything over the canvas in the DOM: the back button, the moon, pause, the trays, the cards
  Wardrobe.tsx        the mirror's picture tabs, options, colours and the dice
  RoadControls.tsx    the pedal, the tool button, the horn and the trip strip
  BuildTray.tsx       materials, shapes, the hand, the roof and the doorbell
  RoomTray.tsx        the room's things, the paint pots, "Which room?" and "Another room"
  Cards.tsx           the question cards (house, road, theme), the hint hand, the present card, Good night
  Pause.tsx           the pause menu and the held Start again
  Btn.tsx             the one HUD button, which never takes focus
  Pictures.tsx        HUD pictures drawn by the real draw code (goods, machines, rooms, roofs, tools, parts)
  Portrait.tsx        a small canvas for one picture
  Icons.tsx           the ink-style SVG icons
  styles.css          the HUD's look, every colour a :root token
  game/
    model.ts          the contract: units, goods, the look, houses, roads, the state, actions, hits, events, timings
    catalog.ts        the data: recipes, shapes and prices, roads, presents and locks, themes, friends
    items.ts          the 70 items: slot, idle, tap motion, sound
    layout.ts         every place and rectangle on the street, the slots, the tap targets and the hit test
    camera.ts         the view as a pure function of the state and the time: shots, insets and the room tray's
                      rows, tweens, the street's limits, the build view on a phone, the framing at a train
    rules.ts          the whole session as a pure state: createState, act, step
    road.ts           a road laid out from a seed, and driving it
    flights.ts        goods flying as pictures from bed to heap to stack to room
    hud.ts            the HUD's view of the state, so React redraws only on a change
    progress.ts       the save as pure functions, read field by field
    game.ts           the browser glue: the clock, keys and pointers, the save, pause, the URL switches
    sounds.ts         every sound and the music, synthesised with WebAudio
    child.ts          a scripted child that plays whole sessions through the real hit test (?autoplay)
    fixtures.ts       the ?demo scenes
    random.ts         the seeded random numbers
  draw/
    look.ts           the art rules and palette: ink weights, faces of boxes, shared shapes, the face kit
    builder.ts        the builder rig in every outfit and pose
    animals.ts        the one cat in five coats and five poses
    goods.ts          raw goods as lumps, materials as blocks
    truck.ts          the truck, its bed and Socks the cat
    land.ts           the roads' scenery, boulders, crossers, the ramp, the balloon, the train, the signpost
    street.ts         the sky, the garage, the mirror, the ground, the plots, the crane and the bulldozer
    machines.ts       the crates, the five machines, heaps and stacks
    house.ts          room frames, roofs, doors, the lift, the blueprint and the ghosts
    rooms/            the fourteen themes' walls, floors and items (party, play, cozy, wonder)
    motion.ts         the shared idle loops and tap reactions
    frame.ts          the renderer: the camera, the bakes, the draw order, the wipe, Good night's lights, ?debug
    effects.ts        particles set off by the state's events
    cache.ts          the bake cache, capped in pixels
    keys.ts           the style keys every drawing matches
    Stage.tsx         the canvas, its size and pixel ratio, the frame loop, a lost context coming back
    Sheet.tsx         the sprite sheets
    fakeContext.ts    the checking 2D context the draw tests use
```

## How it hangs together

- The whole session is a pure state (`rules.ts` over `model.ts`) stepped at a fixed 60 Hz. Everything the child does is one `Action` through `act`; `game.ts` turns keys, canvas pointers and HUD buttons into actions and advances the state from the stage's frame loop, at most six steps a frame.
- Two worlds: the street (garage, mirror, yard, plots, houses, every room) and the road. The mirror, plot and room views are camera shots of the street; the camera is a pure function of the state and the time, and `layout.ts` gives the renderer and the hit test the same rectangles, so what is drawn is what a tap hits.
- Goods are credited the moment they are earned; everything flying is only a picture (`flights.ts`). Each step leaves a list of events, which only sounds and particles read; anything drawn over time reads the tick stamps in the state.
- Houses are baked per plot and zoom on small canvases; only the room being looked at, the builder's room and a room that just played are drawn live over the bake. Everything is vector paths, so it is sharp at any size.
- The HUD is React, subscribed to the game's version through `hudView`; the canvas is never React's.
- Proof without playing: `rules.test.ts`, `layout.test.ts` and `hud.test.ts` hold every rule; `road.test.ts` lints the roads over many seeds; `rules.play.test.ts` holds the economy; `camera.test.ts` holds the framing on a phone and at a train; `session.test.ts` lets the scripted child play whole sessions and fuzzes the invariants; every draw function and the renderer run on the fake context, which checks for NaN, negative radii, unbalanced saves, banned APIs and drawings that leave their box; `game.test.ts`, `progress.test.ts` and `sounds.test.ts` cover the clock, input, the save and the sounds. Screenshots in a headless browser check the looks.
