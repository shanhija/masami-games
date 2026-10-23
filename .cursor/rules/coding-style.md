# Coding style

## Engineering defaults

- **Learn from corrections**: When the user overrides your approach or redirects you (implementation, location, tooling, style of answer), persist **repeatable** preferences in the canonical rules or `docs/` as described in [`maintain-canonical-rules.mdc`](./maintain-canonical-rules.mdc), including **small** corrections, not only big design decisions.
- **Discourage backward compatibility and legacy support**: Do not add shims, duplicate code paths, deprecated aliases, or "keep old behavior" branches unless there is an explicit, documented requirement. Prefer **remove and migrate** over **carry forever**.
- **Simplify**: Prefer the smallest change that matches types and architecture.
- **Prevent silent failures**: Design solutions to not have silent failures if not necessary or requested, but raise exceptions when assumptions are not met. Make code specialized and not generalized, having assumptions and accepting exceptions when assumptions are not met. Prefer union/enum types over free strings so the compiler already checks validity. Avoid defensive optional-chaining/`if (x != null)` guards that silently skip logic; access directly so missing values surface immediately.
- **Strict arguments, no optional by default**: Function parameters should be required and non-nullable unless the current code path genuinely has callers that legitimately pass nothing. Don't widen a signature to `arg?: T` just because the only caller "might not" pass it, or to keep tests / scaffolding compiling; a forgotten argument in a future caller then becomes a silent no-op instead of a compile error. Add optionality only when a real call site has nothing to pass (and document why at the call site).
- **Screenshots yes, the user's browser no**: check that a game boots and how it looks with a headless Chromium (Playwright from the terminal, the script kept outside the repo); never drive the user's own browser (no Claude in Chrome). Logic is still proven by `npm run typecheck` and `npm test`; the user has the last look and tunes. For games this overrides the general "visual checks are the user's".
- **Audience-visible text reads human-written**: no em-dashes, plain sentences, few and big words for a five-year-old.
- **Stop at 95% of the weekly limit**: before Claude's weekly usage limit passes 95%, save the work (everything on disk, the plan and a note of where to resume) and stop; never run past it. Size each batch of agent work so it fits in what is left.

## Stack and tooling

- **Stack**: TypeScript, React 19, Vite, vitest. 3D games draw with react-three-fiber/drei; a 2D game draws on the canvas 2D context with its own pure sim (no game engine: the sim must stay cloneable for its tests), React only for the HUD.
- **One package, one page per game**: the root holds the only `package.json`, `vite.config.ts` and `tsconfig.json`; a game is `<game>/index.html` plus `<game>/src/` and nothing else of its own. Every game is added to the directory: a card on the root `index.html` and its folder name in `GAMES` in `vite.config.ts`. Pin `react` to the range `@react-three/fiber` accepts (`~19.2.x` for fiber 9.7).
- **Hosting**: `hosting/Dockerfile` builds the image that serves the directory and every game (`README.md`, Hosting). The image build runs typecheck, tests and build without the laptop's files, so nothing outside the dev server may read from `$HOME` (the certificate in `vite.config.ts` is read only for `serve` outside tests).
- **Commands** (at the repo root): `npm run dev` (port 3002: the directory and every game), `npm run typecheck`, `npm test`, `npm run build`; `npx vitest run <game>` for one game's tests.
- **Game logic stays pure**: the sim is plain numbers with no three.js or canvas, driven once per frame, so vitest can run it for minutes; the scene reads it and never mutates it.

## Code formatting

- Never prefix private class or module members with underscore.
- Prefer larger functions that are concise and complete, instead of splitting to multiple small ones, except when necessary.
- Never duplicate code and strive to remove duplication whenever possible. Couple of lines repeated code in few places is not a big problem, but more than that becomes a problem.
