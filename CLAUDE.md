# Masami games: instructions for Claude

Canonical project rules are the same as for Cursor: **`.cursor/rules/`** (plus root **`.cursorrules`** as a short Cursor pointer). **Read and follow those files** before substantive work; do not rely only on this summary.

**Load these paths** (principles; long examples stay in `docs/`):

- `.cursor/rules/maintain-canonical-rules.mdc`: keeping rules in sync; user corrections and redirects
- `.cursor/rules/coding-style.md`: languages, tooling, engineering defaults
- `.cursor/rules/plans.md`: where plan files live and how they evolve

Games for a five-year-old, one folder per game, all pages of the one Vite + React + TypeScript project at the repo root: the 3D ones on react-three-fiber, the 2D ones on the browser's canvas. The root `index.html` is the game directory: a tap on a card navigates to `<game>/index.html`, so only that game loads. Commands run at the root: `npm run dev` (port 3002), `npm run typecheck`, `npm test`, `npm run build`. `hosting/Dockerfile` builds the image that serves them (`README.md`, Hosting).

- **`chase/`**: the side-view cartoon police chase (see `chase/README.md`).
- **`foot-chase/`**: the two-player chase on foot (see `foot-chase/README.md`, brief in `foot-chase/design.md`).
- **`castle-builder/`**: the castle on a meadow island, seen from high up (see `castle-builder/README.md`, brief in `castle-builder/design.md`, decisions and open work in `plans/castle-builder.md`).
- **`pia-jump/`**: Pia Jump, a platformer that plays like Super Mario in true 2D on the canvas (see `pia-jump/README.md`, brief in `pia-jump/design.md`, decisions and open work in `plans/pia-jump.md`).
- **`rakennustyömaat/`**: Cat Hat Builder, drive a truck, make materials and build a house of themed rooms, side view on the canvas (see `rakennustyömaat/README.md`, brief in `rakennustyömaat/design.md`, decisions and open work in `plans/rakennustyömaat.md`). The folder keeps its Finnish name: URLs carry it percent-encoded (`rakennusty%C3%B6maat`).
- **`rocket-factory/`**: Rocket Factory, a kids' version of Factorio seen from straight above on the canvas: dig, place machine stickers, draw belts, make science, defend against the munchers, fill the rocket (see `rocket-factory/README.md`, brief in `rocket-factory/design.md`, decisions and open work in `plans/rocket-factory.md`).
- **`marienpeli/`**: Super Me, make your own person in a closet, then a platformer in Pia Jump's places where you build your way with planks, cubes, trampolines and ladders and find presents with new things to wear; it imports Pia Jump's physics constants, world art, camera, icons and synth (see `marienpeli/README.md`, brief in `marienpeli/design.md`, decisions and open work in `plans/marienpeli.md`). The folder keeps its Finnish name.

A new game starts as a short brief in Finnish at `<game>/design.md`, written by Sami. Treat it as the spec, mirror an existing game's `index.html` and `src/` (a game has no package.json, Vite config or tsconfig of its own), keep every audience-visible word in simple English for a five-year-old, and invent the details the brief leaves open ("keksi lisää" is an invitation). The look is each game's own: share another game's camera, palette and shading only when the brief names it ("kuten chase") or Sami asks, and then by importing its modules, never copying them. **Every new game is added to the directory**: a card on the root `index.html` and its folder name in `GAMES` in `vite.config.ts`.
