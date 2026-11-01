# Masami games

Small games for a five-year-old, one folder per game, all pages of one Vite + React + TypeScript project: the 3D ones on react-three-fiber, the 2D ones on the browser's canvas. The root page is the game directory: tap a card and only that game loads.

```
npm install
npm run dev        # https://localhost:3002 (also https://$DEV_HOST:3002 over the VPN): the directory, then a game
npm test           # every game's sim tests
npm run build      # typecheck + static build of the directory and every game in dist/, runs from disk
```

- [`chase/`](chase/README.md): a side-view cartoon police chase. Jump the rocks, cakes and worms; play as the police or the robber.
- [`foot-chase/`](foot-chase/README.md): the same chase on foot, for two players on one keyboard. The robber grabs the money bags, the police catches the robber; fences, dogs, cars and surprise crates in between.
- [`castle-builder/`](castle-builder/README.md): a toy castle on a meadow island. Gather wood, stone, ore, wool and flowers, let the workshop people make better things out of them, build the castle piece by piece, and hammer back what the grumpy cloud knocks off.
- [`pia-jump/`](pia-jump/README.md): Pia Jump, a platformer that plays like Super Mario in true 2D. Run, jump, stomp the grumpy dust bunnies, bump gift boxes and find the five lost kittens, from the garden at sunrise to the roof at night.
- [`rakennustyömaat/`](rakennustyömaat/README.md): Cat Hat Builder. Dress up a builder in a cat-ear hard hat, drive the truck down a country road, break rocks and pick up logs, sand, clay and gems, let the machines make planks, bricks, concrete, glass and rainbow blocks, and build a tall house or a row house of rooms: a disco, a ball pit, a slide, a sauna and more.
- [`rocket-factory/`](rocket-factory/README.md): Rocket Factory, a kids' Factorio seen from above. Tap rocks so Beep the robot digs them, press machines onto the board like stickers, draw conveyor belts with a finger, make science bottles for the lab, tickle the munchers who come for the fizz, and fill the rocket to fly to the moon.
- [`marienpeli/`](marienpeli/README.md): Super Me. Make your own person in the closet (face, body, clothes, makeup), then jump through Pia Jump's five places building bridges, steps, trampolines and ladders out of the blocks you find, and open the presents that hold new things to wear.
- [`limaukkopeli/`](limaukkopeli/README.md): Slime Guy. Steer a jelly slime along a course over water, hide under the spinners, dodge the fans, jump the frames and holes, grow big on slime balls and carry the lost baby slimes home; then bounce up the tower past the numbered circles and open the surprise box for something new to wear.
- [`ruokapeli/`](ruokapeli/README.md): Monster Lunch. Pick a burger or a croissant and what goes inside, carry the plate round a course seen from above picking food up off the ground past moving poles, water, colour gates and poop, then fly the dish over the hungry monster in a hot air balloon and steer it to catch every layer.

A game is a folder with an `index.html` and a `src/`, nothing else of its own. It joins the directory with a card on the root [`index.html`](index.html) and its folder name in `GAMES` in [`vite.config.ts`](vite.config.ts). What the games share (react, and three and drei for the 3D ones) builds into chunks the browser keeps from one game to the next; each game's own code is a small chunk of its own.

## Hosting

[`hosting/Dockerfile`](hosting/Dockerfile) builds one image with the directory and every game: typecheck, every test and the build, then `dist/` (gzipped beside itself) under unprivileged nginx on port 8080 ([`hosting/nginx.conf`](hosting/nginx.conf)). A red test means no image. Any host that runs a container can serve it: `docker build -f hosting/Dockerfile -t games .` and `docker run -p 8080:8080 games`.

```
docker build -f hosting/Dockerfile -t games . && docker run --rm -p 8080:8080 games   # http://localhost:8080: what the pod serves
```
