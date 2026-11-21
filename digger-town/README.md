# Digger Town

A 3D construction site game for a four-year-old, on react-three-fiber. The animals want a town in an empty valley, and Pip the hedgehog has machines but nobody to drive them. The child hops from machine to machine and digs, carries, pushes, rolls, mixes and lifts. Materials change on the way: sand becomes bricks and concrete, rock becomes gravel, logs become planks, gravel becomes road. New jobs keep coming, and nothing can be lost or broken.

The brief is Sami's [`design.md`](design.md), plus one addition: select a machine and direct it by talking Finnish. Decisions and open work are in [`plans/digger-town.md`](../plans/digger-town.md). The game shares only the repo's tech with the others: the one Vite + React project at the repo root, a pure numeric sim under vitest, synthesised sounds and a DOM HUD. Every machine, animal and building is modelled in code; there are no asset files.

```
npm install                    # at the repo root, once for every game
npm run dev                    # https://localhost:3002/digger-town/, and https://$DEV_HOST:3002/digger-town/ over the VPN (a tablet)
npm run typecheck              # tsc over every game
npx vitest run digger-town    # the ground, the machines, the jobs, the tap bot and the voice bot through the story, speech, the save, sounds, the camera's arithmetic
npm run build                  # typecheck + static build of every game in dist/
```

## How to play

Nothing needs reading: pictures, arrows, sound and a hint hand say what comes next. There are three ways to drive, and they all work together.

### One finger (the default)

| Do | What happens |
|---|---|
| Tap or hold on the ground | The machine drives there. Holding follows the finger. |
| Tap a machine, or its portrait along the bottom | The builder hops into it. The portrait the job needs pulses. When a step needs another machine and the child has not hopped, the builder hops by itself after a moment (easy only). |
| The big button | The machine's job, shown by its picture: dig, dump, tip, stomp, pick up, set down, hook, pour, unload. Holding it repeats, and a quick tap that is over between two frames still counts. It is not there while nothing is asked: between jobs, under a card and during a party. |
| The horn button | Honks. Every machine has its own voice. |
| On a crane | A tap moves the hook. The big button alone also builds: it finds the next piece and the next spot. |

Keys for a child at a keyboard: arrows or `WASD` drive that way on the screen, `Space` or `Enter` is the big button, `H` the horn, `1` to `9` the machines, `Esc` or `P` pause, `M` mute, `F` full screen.

### Finnish speech

The microphone button turns listening on. Then the game can be played by talking:

| Say | What happens |
|---|---|
| "kaivuri" | Hops into the digger. Every machine has its word: kippiauto, puskutraktori, jyrä, betoniauto, trukki, nosturi, rekka, autonosturi. |
| "kaiva", "kaada", "kippaa", "nosta", "laske" | The machine's job. |
| "aja sinne" | Drives to the ring the job shows. |
| "aja kuopalle", "aja hiekalle", "mene metsään" | Drives to that place. |
| "kippiauto, aja kuopalle ja kippaa" | Hops, drives there, and tips on arrival. |
| "vasemmalle", "oikealle", "peruuta", "seis", "tööt" | Left and right on the screen, back up (with the beeps), stop, honk. |
| "kippiauto, tule tänne" | A friend brings the truck, and the builder stays put. |

Child speech is allowed for: "lekka" is rekka, "kaivuli" is kaivuri, "tlukki" is trukki. The pause card lists words to try.

**When the mic cannot hear.** The button shows a crossed-out mic and a small note, and the pause card gives the parent one line:

| What went wrong | Note on the button | Line in the pause card |
|---|---|---|
| The browser blocked the microphone | Mic blocked | The microphone is blocked. Allow it for this page in the browser settings. |
| Talking to the game is off on the device (`service-not-allowed`) | Can't hear | Talking to the game is turned off on this device. On an iPad, turn on Dictation in Settings. |
| No Finnish in this browser | Can't hear | This browser cannot hear Finnish. |
| No internet | Can't hear | Hearing needs the internet. |
| No microphone found | Can't hear | No microphone was found. |
| Anything else | Can't hear | Listening stopped. Tap the microphone to try again. |
| No recognizer at all (Firefox) | no button | This browser cannot hear. Chrome, Edge or Safari can. |

A browser that refuses a restart the child did not ask for (the mic had been working since the child's last tap) is not called blocked: the mic goes quietly off and the next tap starts it again. A repeated word inside 1.5 s counts once, so a browser that cuts one sentence up does not act twice; two honks are two honks.

**Where the voice goes.** The browser does the hearing, through the Web Speech API. Chrome and Edge send the audio to their speech service (Google's in Chrome), and Safari to Apple's. Finnish is not available on the device in Chrome (measured on Chromium 156). Listening starts only on a tap, and only in a play that is running: it sleeps on the title, in the paint shop, under the pause card and while the page is hidden, and comes back by itself when the play does (a new game or the old town back leaves it off until the next tap). It turns itself off after 60 s with nothing understood. It costs nothing and needs no key, but no browser publishes a quota for it, so it can stop working without notice; a mic that cannot hear says so, and the rest of the game is unaffected. Firefox has no recognizer: the button does not show. The words are understood by [`src/game/speech.ts`](src/game/speech.ts), a small grammar with no model behind it.

### Mouse and keyboard (Pro, a switch in the pause card)

Every joint is under the player's hands, and nothing helps: no hints, and the builder never hops by itself. `W`/`S` or up and down drive, `A`/`D` or left and right steer, `E` and `Q` turn the digger and the cranes right and left the way `D` and `A` steer, `C` changes the camera (behind, high, in the cab), `H` honks, `M` mutes, `1` to `9` pick a machine, `Esc` or `P` pause. `F` is a lever here, so full screen is the pause card's button. `Space` works the roller, the forklift, the cranes and the lorry (see the table). A key held while the machine changes does nothing until it is let go and pressed again, so a held key never moves the next machine.

| Machine | `Q`/`E` | `R`/`F` | `T`/`G`, wheel | `Z`/`X`, right drag | `Space` |
|---|---|---|---|---|---|
| Digger | swing | boom | stick | bucket | |
| Dump truck | bed | | | | |
| Bulldozer | blade | | | | |
| Roller | | | | | stomp |
| Mixer | chute | | | | |
| Forklift | forks | | | | pick or drop |
| Tower crane | jib | trolley | hook | | hook or unhook |
| Lorry | | | | | unload at the saw |
| Truck crane | jib | reach | hook | | hook or unhook |

Holding the left mouse button and moving works the first two columns.

The big button is on screen only where `Space` does something: the roller, the forklift, the two cranes and the lorry. The digger, dump truck, bulldozer and mixer have none in Pro. The pause card lists the keys for the machine in hand first, then the common ones: `W` `A` `S` `D`, left drag (the first two levers), wheel (the third), right drag (the fourth), `1`-`9`, `H`, `C`, `M`, `Esc`.

## The story

| Chapter | What gets built | Machines that arrive | The show at the end |
|---|---|---|---|
| The road | The main road's missing middle | Digger, dump truck, bulldozer, roller | The ice cream van drives in |
| Bunny's house | A floor, walls and a roof | Mixer, forklift, tower crane, lorry | Bunny moves in |
| The bridge | A gravel street and a bridge over the river | Truck crane | Cows and sheep walk across |
| The playground | A sand pit, a slide and a pond | | Everyone plays |
| The clock tower | A hall with a clock on top | | Fireworks at night, and the golden hard hat |

After that the animals keep asking: new houses, heaps on the road, deliveries, logs, gravel, forever.

**Score.** Coins ring for every bucketful and piece, and buy paint in the paint shop. Each job gives one to three stars by time, generously, and never none. In Pro a job done within its par earns a fourth. Stars earn ranks, shown beside the star count. The town itself is the real score.

**What the camera shows.** It keeps the machine in hand about its own size and frames the step's ring with it when both fit; a ring that does not fit is pointed at by an arrow on the edge of the free part of the screen (the window less the buttons). At the end of a chapter the machines standing in the show or in what the camera frames drive out first, then the camera cuts to the show. What the party view promises: nothing stands in the show, and nothing in the middle of the picture (the inner 70 percent across and up of the free area), at the iPad's two sizes, a laptop and a phone; a machine may still stand at the edge of the picture, and the tower crane's mast stays, its jib swinging away or fading. Tall things between the camera and what matters (the cranes, the water tower) turn pale and see-through, so only their nearest surface shows. The fog starts behind the ground the camera looks at, however far back it stands, so night on a phone is dark and never blank.

## For the parent

- **Sound** and **Music** are two switches, saved with the progress.
- **Hold: new game** in the pause card: hold it 3 seconds with one finger to start fresh. A second finger, or lifting, empties the ring. Sound and music stay.
- **The old town.** A new game on a save with something in it (story, coins, stars or a bought paint) keeps that town aside. While one is kept, a second button, **Hold: old town back**, sits next to the first, and holding it swaps the two towns: what was built since becomes the old town, so it can be swapped back. The old town brings its own sound and music settings.
- **A save that cannot be read.** Every good field of it is kept and the rest start fresh. The stored text is copied under its own key, and the pause card says "Part of the old save could not be read. A copy is kept." (the line shows only when the copy was written).
- **Coins are kept** when the page hides or closes and every 10 seconds of play, besides the end of each job and chapter. The story position moves only when a job ends.
- The game pauses itself only in a play: when the page hides, or after two minutes with no input. The title and the paint shop carry on when the page comes back. The sounds and the microphone sleep whenever the page is hidden.
- Sound wakes on the first touch, key or click; on an iPad it is taken back after a call or the microphone has held the audio session.
- The pause card's **Full screen** shows only where the browser can do it (not on an iPhone).
- The progress lives in the browser's `localStorage`: `digger-town` (the save), `digger-town-old` (the old town) and `digger-town-broken` (the copy of text that could not be read).

URL switches, read once when the page loads (a bad value shows its message on the page). Any of them leaves the game on `window.game`. `?job`, `?story`, `?autoplay`, `?fresh` and `?all` write nothing: not the save, not the old town, not the copy of an unreadable save.

| Switch | Does |
|---|---|
| `?job=<id>` | Starts at that story job (`hole1`, `walls`, `span`...), everything before it built. Nothing is saved. |
| `?story=<n>` | The same, by how many jobs are done. |
| `?autoplay` | The tap bot plays. |
| `?mode=pro`, `?mode=easy` | Starts in that mode, and the save keeps it at its next write. |
| `?fresh` | A fresh save for this visit, never written. |
| `?all` | Every machine come and every paint open, for this visit. |
| `?say=<words>` | Hears these Finnish words at the start: all of speech can be tried without a microphone. `window.game.hear('kaivuri kaiva')` does the same at any time. |
| `?stats` | Draw calls and triangles on the screen. |
| `?look=<machine>` | One machine on a turntable, sweeping through its motion (`&t=`, `&angle=`, `&paint=`). `?animal=<species or all>` the same for the animals. |
| `?world` | The valley alone (`&x=`, `&z=`, `&d=`, `&day=`, `&dig`). `?builds` the buildings and plants (`&placed=`, `&work`, `&things`, `&animals`). |
