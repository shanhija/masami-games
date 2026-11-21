# Masami Games

Small browser games made at home for young children, about four to six years old, from their own ideas. Each game starts as a short brief in Finnish, often in the child's own words, and [Claude Code](https://claude.com/claude-code) writes the game from it. The games run in a browser on a tablet or a laptop, and the root page is a directory of big cards: tap one and only that game loads.

The repo is also an experiment in what a language model can do inside a game for children, not only in writing it. The clearest example is Silly Billy.

## Silly Billy: say it, and it exists

[`silly-billy/`](silly-billy/README.md) is a 3D room with a few people, a cat and lots of things: a playground, a swimming pool or a forest. The child holds the big button, calls an avatar by name and says what to do, in Finnish or in English: "Alice, throw the ball to Steve", "Steve, ride a bike over the Christmas tree", "Mike, do a cartwheel".

Only a handful of basic moves are built in. Everything else, new actions and new objects alike, is designed by a language model while the child watches. The avatar stands thinking under a cloud of turning cogs while this happens:

1. **Hearing.** Whisper on the computer's GPU (or the browser's own recognizer) turns the voice into words. A five-year-old is often misheard, and that is part of the fun.
2. **Understanding.** Words heard before, and simple commands, are understood at once by a phrase cache and a small parser. Anything else goes to Claude Opus, which works out who should do what, pictures whether it could really be done, and sketches a rough version of anything new, so something pops up straight away.
3. **Designing.** Opus writes the new action or object as code against the game's world: a model built from shapes, and what it does when used, ridden, worn, thrown or climbed.
4. **Running.** The code is guarded and tried in a sandbox copy of the world, then the avatar does it, and the real object replaces the rough one with a sparkle. Everything made is kept in a library on disk, so the next time anyone asks, it happens instantly.

New friends are made and dressed the same way ("make a new girl", "give her big curly hair", "give her a magic wand"), and everyone can play tag, football, hide and seek, a race or a train together. Nothing is limited to a fixed list of parts: if a child can say it, the game tries to make it.

Inventing needs the dev server and Claude on the computer. A static build plays everything that was made at home, but invents nothing new. The brief is [`silly-billy/design.md`](silly-billy/design.md) and the decisions are in [`plans/silly-billy.md`](plans/silly-billy.md).

## The other games

- [`rocket-factory/`](rocket-factory/README.md): **Rocket Factory**, a kids' Factorio seen from above. Tap rocks so Beep the robot digs them, press machines onto the board like stickers, draw conveyor belts with a finger, make science bottles for the lab, tickle the munchers who come for the fizz, and fill the rocket to fly to the moon.
- [`pia-jump/`](pia-jump/README.md): **Pia Jump**, a platformer in true 2D. Run, jump, stomp the grumpy dust bunnies, bump gift boxes and find the five lost kittens, from the garden at sunrise to the roof at night.
- [`marienpeli/`](marienpeli/README.md): **Super Me**. Make your own person in the closet (face, body, clothes, makeup), then jump through Pia Jump's places building bridges, steps, trampolines and ladders out of the blocks you find, and open the presents that hold new things to wear.
- [`limaukkopeli/`](limaukkopeli/README.md): **Slime Guy**, a 3D obstacle course over water. Hide under the spinners, dodge the fans, grow big on slime balls, carry the lost baby slimes home, then bounce up the tower and open the surprise box for something new to wear.
- [`ruokapeli/`](ruokapeli/README.md): **Monster Lunch**. Pick a burger or a croissant and what goes inside, carry the plate round a course picking food up off the ground past moving poles, water, colour gates and poop, then fly the dish over the hungry monster in a hot air balloon.
- [`rakennustyömaat/`](rakennustyömaat/README.md): **Cat Hat Builder**. Drive the truck down a country road, break rocks and pick up logs, sand, clay and gems, let the machines make planks, bricks, glass and rainbow blocks, and build a house of rooms: a disco, a ball pit, a slide, a sauna and more.
- [`castle-builder/`](castle-builder/README.md): **Castle Builder**, a toy castle on a meadow island. Gather wood, stone, ore, wool and flowers, let the workshop people make better things out of them, build the castle piece by piece, and hammer back what the grumpy cloud knocks off.
- [`chase/`](chase/README.md) and [`foot-chase/`](foot-chase/README.md): a side-view cartoon police chase (jump the rocks, cakes and worms as the police or the robber), and the same chase on foot for two players on one keyboard.

## Coming next

<!-- Teaser: swap in the new game's name, a line about it and its folder when it lands. -->

**A new game is on the way.** It takes the idea of [Dissertation](https://github.com/shanhija/dissertation), a party game for grown-ups where Opus makes whatever the players ask for while they wait, and turns it into a game for children: ask for anything you can think of, and watch it being made. Name, rules and look are still a secret.

## How it is built

- **One project, one page per game.** A single Vite + React + TypeScript project at the root. Each game is a folder with its own `index.html` and `src/`, and a page of its own in the build. What the games share (React, three.js) is built into chunks the browser keeps from one game to the next.
- **3D and 2D.** The 3D games draw with [react-three-fiber](https://r3f.docs.pmnd.rs/) and drei; the 2D games draw on the browser's canvas. React draws only the buttons and cards around them.
- **Pure simulations with tests.** Each game's logic is plain numbers with no drawing, stepped once per frame, so [vitest](https://vitest.dev/) can play it for minutes at a time. The scene only reads it. There are over 2500 tests.
- **A static site.** `npm run build` typechecks and builds the directory and every game into `dist/`, which runs from disk or from any web server.

## Requirements

- **Node.js 22 or newer**, with npm. Made on Linux with Node 24.
- **A recent browser**: Chrome, Safari or Firefox, on a laptop or a tablet.
- **For Silly Billy's inventing**: the [Claude Code CLI](https://claude.com/claude-code) on the same computer, signed in to a Claude subscription (no API key is needed). The dev server finds it on the `PATH`, in the Claude desktop app or in the VS Code extension; `CLAUDE_BIN` names it outright. Without it, Silly Billy plays what it already knows.
- **Optional, for Silly Billy's hearing**: a [whisper.cpp](https://github.com/ggml-org/whisper.cpp) build on a GPU (see [`silly-billy/README.md`](silly-billy/README.md)). Without it the browser's own speech recognizer listens, and there is always a box to type in.

## Getting started

```
git clone https://github.com/shanhija/masami-games.git
cd masami-games
npm install
npm run dev              # http://localhost:3002: the directory, then a game
```

Other commands, all at the root:

```
npm test                 # every game's tests
npm run typecheck
npm run build            # typecheck and the static build in dist/
npx vitest run <game>    # one game's tests, e.g. npx vitest run silly-billy
```

**On a tablet.** The dev server listens on the network on port 3002. A browser lets a page use the microphone only over https, so put a host name the tablet can reach in a file called `.env.local` (`DEV_HOST=games.example.net`, not in git) and its certificate in `~/certs/<DEV_HOST>/key.pem` and `fullchain.pem`. The dev server then speaks https at `https://<DEV_HOST>:3002/`.

## Players

The directory first asks who is playing. Each child has a profile on the device: a name and an avatar they build from parts (face, hair, eyes, mouth, something fun, a colour) or get as a surprise. Every game keeps its progress per profile, so two children never play on each other's castle or factory. The pencil on a player changes the name and the avatar, starts any game they have saved in over (it asks "Really?" first), or removes the player. A tab back from a game shows the games straight away as the same player; the chip above them changes player. The first profile made on a device takes over what was saved before there were profiles. Silly Billy's library of things Claude made lives on the laptop and is everyone's; what the page keeps (the rooms, the settings) is per player. The code is [`profiles/`](profiles/src/profiles.ts): not a game, the directory's own.

## How Claude is used

Claude is used in two ways.

**Claude Code writes the games.** A parent writes a short brief in Finnish (`<game>/design.md`), sometimes just the child's own words, and Claude Code (Opus) builds the game from it, inventing the details the brief leaves open. The children play, say what to change, and the game grows from there. The decisions and the work still open are kept in [`plans/`](plans/), and the standing instructions for the agent are in [`CLAUDE.md`](CLAUDE.md) and [`.cursor/rules/`](.cursor/rules/): one shared project, pure simulations with tests, and every word on screen in simple English for a five-year-old.

**Claude plays a part in Silly Billy.** The dev server runs the Claude Code CLI on the computer, with no tools and from an empty folder, one process per question. Opus understands what the child said and designs whatever is new, as described above. What it makes is kept in [`silly-billy/library/`](silly-billy/library/) as JSON files, code included.

## The children's privacy

Silly Billy keeps the children's voice clips, to measure how well different recognizers hear young voices, and a log of everything said and made. Both stay on the computer: they are git-ignored and never pushed. The library of made things is in the repo, and each made thing keeps the one sentence that asked for it. The games keep their saves in the browser, on the device, per player.

## Hosting

[`hosting/Dockerfile`](hosting/Dockerfile) builds one image with the directory and every game: typecheck, every test and the build, then `dist/` (gzipped beside itself) under unprivileged nginx on port 8080 ([`hosting/nginx.conf`](hosting/nginx.conf)). A red test means no image. Any host that runs a container can serve it.

```
docker build -f hosting/Dockerfile -t games . && docker run --rm -p 8080:8080 games   # http://localhost:8080
```

## License

The code is [MIT](LICENSE).
