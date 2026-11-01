# Monster Lunch

A course game for a five-year-old, drawn in 2D on the browser's canvas and seen from above at a slant. Pick a burger or a croissant and what goes inside, then carry a plate over your head round a course, picking the food up off the ground: the pile grows and wobbles. Moving poles knock all the food off, water takes what falls in, pink, green and blue buttons open the gates of their colour, and poop is best walked round. At the end a hot air balloon waits: the bread closes round the pile, she climbs in, and the balloon drops the dish a layer at a time through a slot in its floor while she steers the hungry monster on its track below to catch it.

The game is the inventor's own design: her words are [`design.md`](design.md), what became of each of them and the decisions are in [`plans/ruokapeli.md`](../plans/ruokapeli.md). It shares only the repo's tech with the other games: the one Vite + React project at the repo root, pure numeric sims under vitest, synthesised sounds and a DOM HUD.

```
npm install                    # at the repo root, once for every game
npm run dev                    # https://localhost:3002/ruokapeli/
npx vitest run ruokapeli       # the rules, every course's lints and the walkthrough bot, the finale, the game, the sounds, every drawing on a fake context
npm run build                  # typecheck + static build of every game in dist/
```

## How to play

| Do | What happens |
|---|---|
| Tap a course card | Its kitchen. A card opens when the course before it is done. |
| Tap the burger or the croissant, then one to three fillings, then Go! | The course, with those fillings lying about it. Each of the first four courses done opens one more filling of each dish, so all eight of each are open for the castle. |
| Touch and hold where she should walk (or arrows, `WASD`) | She walks toward the finger. |
| Walk into a food | It hops onto the plate. |
| A pole's bar hits her (its shadow on the ground shows where it sweeps) | Every food flies off. What lands on the ground can be picked up again; what lands in the water is gone. |
| Keep walking into the water | She teeters first (step back to stay dry), then falls in: the plate's food floats away and a frog carries her back to the last flag. |
| Step on a pink, green or blue button | Every gate of that colour opens. A closed gate zaps: she bounces back and the top food falls off. In the castle the gates shut again: their lamps blink fast first. |
| Walk into a poop | It goes on the plate too. The monster spits it out. A pole's knock is the way to get rid of it. |
| Reach the balloon | The bread closes round the pile: her own burger or croissant. Then the finale. |
| Finale: touch where the monster should roll (or left and right) | The dish falls a layer at a time; the monster catches what falls in its mouth. A miss is a bird's lunch. One to three stars for how much of the course it ate. |
| `Esc`, `P` or the pause button | Pause: Keep going, Start again, Courses, Music, Sound, Full screen, More games. |

`M` is the sound on or off, `F` is full screen.

## The courses

| Course | Monster | New in it |
|---|---|---|
| Park | Munch | Her course in her order, everything once and easy: foods, one slow spinner, the lake beside the path and a little bridge, a pink, a green and a blue gate with the buttons just before them, a poop. |
| Pond | Gulp | Islands and bridges: a long narrow bridge, a spinner guarding the way south, a slider across the wide bridge. |
| Garden | Nibble | Hedge rooms round a fountain whose spout is a spinner; one pink button opens two pink gates. |
| Farm | Chomp | Fields and fences, poop on the lanes and a puppy leaving more, a slider in a gap of the fence. |
| Castle | Gobble | The moat and the drawbridge, two spinners in the great hall, gates that shut again. |

After the last course the first time, all five monsters have a party.

## For the parent

- **Sound** and **Music** are two switches, saved with the progress.
- **Hold to start fresh** (bottom left of the cards): hold it 3 seconds and the courses and their stars are forgotten. The switches and the last dish stay.
- **Hold a locked card** 3 seconds and it opens.
- The game pauses itself when the page hides, the window loses focus, full screen ends, or nobody touches it for a minute.
- The progress lives in the browser's `localStorage` under `ruokapeli`.

URL switches, read once when the page loads (a bad value shows its message on the page):

| Switch | Does |
|---|---|
| `?course=park` or `?course=1` | Opens that course's kitchen, whatever is locked. The progress is read but never written. |
| `&dish=burger&fill=patty,cheese` | With `?course`: straight onto the course with that dish. |
| `?feed` | With `?course`: straight to the finale, as if every food had been picked up. |
| `?autoplay` | With `?course`: the bot walks the course and a catcher plays the finale. |
| `?all` | Every course and every filling open, for this visit. |
| `?party` | The party after the last course, straight away. |
| `?debug` | The tile grid, her feet's box, her reach, the poles' hit lines, the balloon's reach, and the frame rate. |
| `?sheet=<file>` | That draw file's drawings in a labelled grid (`?sheet` alone lists the files); `&t=<seconds>` freezes time, `&px=<pixels per tile>`, `&only=<text>`, `&bg=<colour>`. |

## Tuning

Every number a parent might want to change is in [`src/game/model.ts`](src/game/model.ts), grouped by topic: her speed, the teeter, the knock and the zap, the flying foods, the finish's timings, the poles and gates, the puppy, and the finale (the monster's speed, the fall, the drops' pace, the stars). The sims step 120 times a second; lengths are in tiles and times in seconds.

## Adding or changing a course

1. The courses are in [`src/game/courses.ts`](src/game/courses.ts): rows of text, one character per tile, with the poles' numbers, the gates' times and the puppies' paths beside each map. The legend is at the top of [`src/game/course.ts`](src/game/course.ts).
2. Run `npx vitest run ruokapeli/src/game/courses.test.ts`. Its lints check that every food, button, flag and the balloon can be reached (each gate from its button's side, and never past the balloon, which ends the course), that things stand on land, that gates have open ground on both sides, and that no pole sweeps a wall, a button, a flag, the start or the balloon. Then the bot walks the course like a careful child and must pick up every food with no knock, no splash and no zap.
3. Look at it: `?course=<id>&dish=burger&fill=cheese` and walk, `?autoplay` to watch the bot, `?debug` for the hit lines.

## Layout

```
index.html          the page
src/
  main.tsx          mounts the app
  App.tsx           the game, or a sprite sheet with ?sheet; a bad URL switch shows its message
  Hud.tsx           everything over the canvas: the course cards, the kitchen, the plate's count, the
                    finale's basket row and stars, the shouts, the pause menu, the parent gate's ring
  Controls.tsx      the fingers' zone and the first course's ghost hand
  Portrait.tsx      a small canvas showing a real draw function: a food, a dish, a monster, a star
  Icons.tsx         the HUD's SVG icons
  styles.css        the HUD's look: picnic gingham and chocolate ink
  game/
    model.ts        the contract: units, tiles, foods, the sims' state and events, every tuning number
    course.ts       the map legend and the parser
    courses.ts      the five courses
    sim.ts          the course's rules: one step as plain numbers, no canvas
    feed.ts         the finale's rules
    bot.ts          a careful child at the controls, for the walkthrough test and ?autoplay
    game.ts         the running game: screens, the fixed-step clock, input, pause, the save, sounds
    progress.ts     the save as pure functions
    sounds.ts       every sound and tune, synthesised with WebAudio
  draw/
    look.ts         the drawing rules (sunny picnic), the shared colours and the face kit
    foods.ts        every filling, bread and the poop, on the ground and stacked on the plate
    monster.ts      the five monsters and their cart
    balloon.ts      the hot air balloon
    hero.ts         the child with the plate, in every pose
    world.ts        the five places' ground and their bushes, hedges, fences and walls
    things.ts       poles, gates, buttons, flags, the frog, the puppy, ducks, fish and birds
    scene.ts        the finale's sky, hills and rail track
    effects.ts      the particles the sims' events set off
    frame.ts        the renderer: the camera, the baked ground, the depth order, the finale, the party
    Stage.tsx       the canvas, its size and pixel ratio, and the frame loop
    Sheet.tsx       the sprite sheets
```

## How it hangs together

- The sims (`sim.ts` and `feed.ts` over the types in `model.ts`) are the whole game as plain data, stepped at a fixed 120 Hz by `game.ts` from the stage's frame loop (at most 12 steps a frame, so a stall never fast-forwards). The stage draws between the last two steps. A clone is a `structuredClone`, which is what the bot's look-ahead needs.
- Input reaches the sims only through `setInput` and `steerFeed`. Keys and fingers merge in `game.ts`: the newest wins. A finger steers from where the renderer last drew her feet, so it is fed again every frame as she walks.
- Each step leaves a list of events; sounds, shouts and particles read them. Anything drawn over time reads the tick stamps on the state instead.
- The ground is baked into 8-tile chunks as the camera reaches them; the water's ripples and everything standing are drawn every frame, sorted by where they touch the ground. Everything is vector paths, so it is sharp at any size.
- The HUD is React, subscribed to the game's version; the canvas is never React's.
