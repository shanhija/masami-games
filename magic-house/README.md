# Magic House

A house of rooms nobody has seen before, for one to four children of about seven at one screen. Behind each door is one room of the house with a theme of its own: walls, a floor, a ceiling, furniture, lights and things that answer when you walk past or tap them. The children walk in, nothing is told, and they work out what the room wants and do it, mostly together and sometimes as a race, in three to five minutes. Then come fireworks, a present to wear for each of them, a dressing room and the next door.

New rooms are not written by hand: Claude Opus designs each one as code while the children play the one before, bots prove it can be finished, and every room made is kept, so the house grows. Five rooms are the game's own, so a house is never empty.

The brief is Sami's words in [`design.md`](design.md). The decisions, the contract between the game and the model, and what is open are in [`plan.md`](plan.md).

```
npm install                    # at the repo root, once for every game (also fetches and builds the recorded sounds)
npm run dev                    # https://$DEV_HOST:3002/magic-house/ (the dev server is what invents rooms)
npx vitest run magic-house     # the sim, the bots and the trial, every room and its look, the prompts and the line on a fake CLI, the library
npm run build                  # typecheck + static build of every game in dist/: plays the library it ships with and invents nothing
```

## A visit

1. **Who plays.** The picked player is in. The others of the device join by pressing on a free seat, up to four, shown by their gallery faces.
2. **The house.** A door for each kept room made for a party of this size (a gold star on the ones they have played), and one glowing door for a new room. While a new room is still being made, each player gets a column of maths and reading questions at their own level until it opens.
3. **A room.** One screen, the whole room in sight all the time, and the camera never moves. Nothing is told: the room shows what it wants. The dots at the top fill as the steps are done.
4. **The end.** The way out opens, fireworks go up and each player opens a present: something to wear, made by Opus for that room.
5. **The dressing room.** Each player has a column of the screen: their person, what they own, the colours and patterns to wear it in, and a thumb up or down for the room. When all are ready, they are back in the house.

## Who plays: the seats

Each seat is a stick and two buttons, a and b, whatever the device. A room says what the buttons do (the jump, grab, or something of its own) and shows each job's picture and word on the seat's badge. In a room played together every player is needed.

| Seat | Stick | a | b |
|---|---|---|---|
| Keys, zone 0 | W A S D | V | B |
| Keys, zone 1 | I J K L | N | M |
| Keys, zone 2 | the arrows | Enter | right Shift |
| Keys, zone 3 | the number pad's 8 4 5 6 | its Enter | its + |
| Touch (two pads) | a floating stick on the left of the bottom band | the big button on the right | the smaller one |
| Gamepad | the left stick or the d-pad | button 0 | button 1 |

- A screen with only touch seats two. On Windows, holding right Shift (zone 2's b) may bring up Sticky Keys. A laptop has no number pad, so no zone 3, and three or four on one keyboard meet its limit on keys held at once: gamepads are the way to a full party.
- **Pointing** belongs to the room: a tap or a click on a spot or a thing, from anyone, on any device.
- A player's saves remember the device they sat at. A seat's buttons count 1 s after it sat down, so a press to sit is not a jump.

## Help, the pause card and how hard

- **The helper** is a small lantern with a face on the ceiling's beam (from high up, over the back corner). After 40 s with no step done it flies to the next step's spot, and 40 s later it says the hint, shown and aloud. The `?` button (or a gamepad's Select or Y) calls it at once. Hints say what to try, never the whole answer.
- **The pause card** (the pause button, `Esc` or a gamepad's Start): Jatka / Keep going, Aloita alusta / Start again, Toinen huone / Another room, sound, full screen and Muut pelit / More games. Leaving is always possible, and a room can never be lost.
- **How hard.** Every room has three levels. The party plays at the lowest level among its players, one lower from a second Start again. After a room each player's level moves: up when it was finished within 2.5 times the bots' time with no hint and no start again, down when it was left after 30 s, ended by its clock with steps left, took 6 times the bots' time or more, or needed two start agains. Opus also hears how the last rooms went and makes the next one easier or harder.

## The house and its rooms

- **A room is a room.** From the side it is 16 by 8 m: a back wall with the door out, a floor, side walls, a ceiling with a beam and an open front. From high up it is a floor 14 by 8 m with walls on three sides. The house draws it all in the room's own colours and patterns (its shell), the same size on every device. A kid is about 59 px tall on a 1024 by 768 tablet with its touch pads and 100 px on a 1440 by 900 laptop.
- **Light.** Rooms are bright; a theme that wants the dark is dim (never below 0.6) and shines with small lights of its own.
- **The look.** The play is the clearest thing in the room. Around it is the look: wallpaper, furniture, plain ledges dressed as furniture, at least 8 props that wobble, hop, spin, blink or swing when a child passes or taps them, and lights. A look never changes the play: the trial and the bots never meet it, and a test plays 60 s with and without it and compares every frame.

### The own rooms

| Room | Players | Seen | The room |
|---|---|---|---|
| Moon Garden / Kuutarha | 1 | side | A glasshouse garden at night under a sleeping moon (dim, with star lights). Plant seeds, fill the can in the pond, water the flowers up to the moon's cloud, carry the moon its own seed. |
| Apple Kitchen / Omenakeittiö | 2 | side | A sunny farmhouse kitchen with two apple trees and a big seesaw: one throws the other up into the trees, the apples are washed in the sink and go into the pie dish. |
| Snow Castle / Lumilinna | 3 | side | A hall of ice blocks. Roll snowballs until they grow, build the big snowman, dress it and then its little friend. |
| Pirate Sails / Merirosvon purjeet | 4 | side | The inside of a pirate ship. Four glowing ropes, all four pull at once to open each sail, until the flag goes up and the chest bursts open. |
| Flower Bridge / Kukkasilta | 2 | high up | A flower shop with a canal through it. Hold a stone so the bridge slides over, and bring every flower down from the terrace to the vase of its colour. |

Each comes with its walkthrough and passes the whole trial at all three levels, and its look passes the same check as a model's. The first library round added The Cake Kitchen (one player), The Drum Room (three) and The Sock Race (four, a race); [`plan.md`](plan.md), Open, says how they went.

## How a room is made

The dev server asks Opus through the Claude Code CLI (no tools, an empty folder, structured output, effort low) and never runs what comes back: it guards the code as text and keeps it. The page plays and proves.

1. **The game.** Opus gets the reference (the room's building blocks, each line held true by a test), the earlier rooms with their theme, task and colours to be unlike, how the last rooms went, how many play and on what. The game's dice say whether the room is played together, against each other or side by side, and whether it is seen from the side or from high up. Opus answers a theme, a task, a name in both languages, the shell, the room as code, and a walkthrough that plays it to its end.
2. **The trial.** Bots play the room in a Web Worker on a page, at every level, on the game's clock, so minutes of play take seconds. It must build within its budget, trap no player, survive standing still and random pressing, be finished by its walkthrough with each step done in order in 60 to 120 s, and, in a room played together or side by side, stay unfinished when any one bot stands still. What fails goes back to Opus as plain sentences with numbers and a survey of the room as built: three tries, then the room is dropped.
3. **The look.** A second call, asked as soon as the first trial shows the room as built, writes its furniture, props and lights as code that cannot touch the play. A page checks it in about 0.05 s; two tries. A room is kept when its game passes; its look joins when ready, and a room whose look fails is kept in its shell.
4. **The presents.** Once the room is kept, a third call writes its four presents, each checked on a model kid.

**One room ahead.** The server holds the line of rooms, and any open page takes the next trial or look check, so a reload loses nothing. When a party walks into its ready room, the next one for their size is asked for, so Opus designs while they play and dress. A kept room is a file in [`library/`](library/), shipped by the build. **The hosted build, and a laptop with no CLI, invent nothing**: their new door opens a kept room of the party's size that these players have not played.

## Time and cost

From the first library round (four rooms asked, three kept, Opus at effort low): a first answer takes 46 to 61 s, a fix 18 to 43 s, the look 23 to 25 s and the presents 27 to 34 s. A party waiting at the door had its room after 73 to 143 s; in normal play the next room is asked when the party walks into the one before, so it is ready before it is needed. A kept room cost $0.59 to $0.97 in calls, about $0.81 with a dropped room's share; the round cost $2.44. The prompts are cached, so a fix costs less than the first answer.

## Sounds

Silly Billy's twenty synthesised sounds, and on top of them 36 recorded ones from 24 CC0 packs on OpenGameArt. `npm install` downloads the packs and builds them into `public/magic-house/recorded/` (about 1 MB, not in git); with no network it says so and goes on, and every name plays its synthesised stand-in. `npm run sounds` builds them on its own, and the image build fails without them. Nothing that shoots, screams, cries, hurts, explodes or roars is used, and a test holds that. **`?sounds` plays every sound by its name: a parent should hear them before the children do.** The packs and how they are built are in [`sounds/README.md`](sounds/README.md).

## What goes to the model, and what stays on the laptop

- **To Opus**: how many play, an age of about seven, what they play on, and how their last rooms went (times against the bots', hints, restarts, whether they left, their thumbs). Never a name, a face or anything they said.
- **On the laptop**: the logs of every request, trial and play (`library/log.jsonl`, `line.jsonl`, `prompts.jsonl`) and the dev server's lock, git-ignored. The library itself (kept rooms, their looks and presents, and the index the build ships) is plain files in the repo.
- **In the browser**: each player's saves (their level, what they own and wear, what they have played), per player through the gallery's profiles. Nothing of the children is recorded.
- **Finnish or English**: the game plays in the player's language, picked with the flag in their profile. Every word a child sees or hears is in [`src/words.ts`](src/words.ts) or comes from Opus in both languages side by side.

## Switches

For the parent, on the dev server's environment:

- `MAGIC_LIBRARY` names another library folder, `MAGIC_MODEL` another model (default `opus`), `CLAUDE_BIN` the CLI outright (else it is found on the `PATH`, in the desktop app or in the VS Code extension).
- One dev server holds a library at a time (`library/server.lock`); another one reads it and asks for no rooms.

On the page:

- `?room=<id>` opens one room (an own room is `own:<name>`), with `?seats=keys0,touch1` (else the key zones from 0) and `?level=1|2|3`.
- `?autoplay` lets the bots play every room; `?autoplay=devices` runs them beside the devices, so a script can press real keys from what they show.
- `?sounds` plays every sound.

For developers: `?sheet=<folder>` opens a folder's sheet (`library` shows every kept room with its look and counts, `&show=wear` its presents; also `own`, `patterns`, `scene`, `seats`, `shell`), and `?debug` on the dev server shows the frame meter and the handle `window.magicHouse`.

## Tests

`npx vitest run magic-house` runs the sim and the referee, every reference line against the engine, the bots and the search, the trial on the own rooms and on broken twins that must fail with exactly their sentences, the look's check and the identity of play with and without a look, every kept room in the library against its file's bot seconds and every present, the prompts, the line and the store on a fake CLI, the saves, the quiz and the dressing room. A kept room is a whole game, so an engine change that breaks one turns a test red.
