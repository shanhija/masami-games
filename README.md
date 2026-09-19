# Masami games

Small 3D games for a five-year-old, one folder per game, all pages of one Vite + React + TypeScript project on react-three-fiber. The root page is the game directory: tap a card and only that game loads.

```
npm install
npm run dev        # https://localhost:3002 (also https://$DEV_HOST:3002 over the VPN): the directory, then a game
npm test           # every game's sim tests
npm run build      # typecheck + static build of the directory and every game in dist/, runs from disk
```

- [`chase/`](chase/README.md): a side-view cartoon police chase. Jump the rocks, cakes and worms; play as the police or the robber.
- [`foot-chase/`](foot-chase/README.md): the same chase on foot, for two players on one keyboard. The robber grabs the money bags, the police catches the robber; fences, dogs, cars and surprise crates in between.
- [`castle-builder/`](castle-builder/README.md): a toy castle on a meadow island. Gather wood, stone, ore, wool and flowers, let the workshop people make better things out of them, build the castle piece by piece, and hammer back what the grumpy cloud knocks off.

A game is a folder with an `index.html` and a `src/`, nothing else of its own. It joins the directory with a card on the root [`index.html`](index.html) and its folder name in `GAMES` in [`vite.config.ts`](vite.config.ts). What the games share (react, three, drei) builds into one chunk the browser keeps from one game to the next; each game's own code is a small chunk of its own.
