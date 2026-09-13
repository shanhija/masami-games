# Coding style

## Engineering defaults

- **Learn from corrections**: When the user overrides your approach or redirects you (implementation, location, tooling, style of answer), persist **repeatable** preferences in the canonical rules or `docs/` as described in [`maintain-canonical-rules.mdc`](./maintain-canonical-rules.mdc), including **small** corrections, not only big design decisions.
- **Discourage backward compatibility and legacy support**: Do not add shims, duplicate code paths, deprecated aliases, or "keep old behavior" branches unless there is an explicit, documented requirement. Prefer **remove and migrate** over **carry forever**.
- **Simplify**: Prefer the smallest change that matches types and architecture.
- **Prevent silent failures**: Design solutions to not have silent failures if not necessary or requested, but raise exceptions when assumptions are not met. Make code specialized and not generalized, having assumptions and accepting exceptions when assumptions are not met. Prefer union/enum types over free strings so the compiler already checks validity. Avoid defensive optional-chaining/`if (x != null)` guards that silently skip logic; access directly so missing values surface immediately.
- **Strict arguments, no optional by default**: Function parameters should be required and non-nullable unless the current code path genuinely has callers that legitimately pass nothing. Don't widen a signature to `arg?: T` just because the only caller "might not" pass it, or to keep tests / scaffolding compiling; a forgotten argument in a future caller then becomes a silent no-op instead of a compile error. Add optionality only when a real call site has nothing to pass (and document why at the call site).
- **Visual testing is the user's**: never launch a game or drive a browser for screenshots; verify with `npm run typecheck` and `npm test`, then describe what to look at. Eyeballed 3D placements are fine to ship for the user to tune.
- **Audience-visible text reads human-written**: no em-dashes, plain sentences, few and big words for a five-year-old.

## Stack and tooling

- **Stack**: TypeScript, React 19, Vite, react-three-fiber/drei; tests with vitest.
- **One folder per game, each an independent package**: a new game copies an existing game's `package.json`, `tsconfig.json` and `vite.config.ts` rather than sharing a workspace. Pin `react` to the range `@react-three/fiber` accepts (`~19.2.x` for fiber 9.7).
- **Commands** (run in the game's folder, e.g. `chase/`): `npm run dev` (port 3002), `npm run typecheck`, `npm test`, `npm run build`.
- **Game logic stays pure**: the sim is plain numbers with no three.js, driven once per frame, so vitest can run it for minutes; the scene reads it and never mutates it.

## Code formatting

- Never prefix private class or module members with underscore.
- Prefer larger functions that are concise and complete, instead of splitting to multiple small ones, except when necessary.
- Never duplicate code and strive to remove duplication whenever possible. Couple of lines repeated code in few places is not a big problem, but more than that becomes a problem.
