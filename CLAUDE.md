# Masami games: instructions for Claude

Canonical project rules are the same as for Cursor: **`.cursor/rules/`** (plus root **`.cursorrules`** as a short Cursor pointer). **Read and follow those files** before substantive work; do not rely only on this summary.

**Load these paths** (principles; long examples stay in `docs/`):

- `.cursor/rules/maintain-canonical-rules.mdc`: keeping rules in sync; user corrections and redirects
- `.cursor/rules/coding-style.md`: languages, tooling, engineering defaults
- `.cursor/rules/plans.md`: where plan files live and how they evolve

Games for a five-year-old, one folder per game, each its own Vite + React + TypeScript app on react-three-fiber:

- **`chase/`**: the side-view cartoon police chase (see `chase/README.md`). Work from that folder: `npm run dev` (port 3002), `npm run typecheck`, `npm test`.
