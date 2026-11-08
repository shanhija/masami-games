/**
 * The validation worker loads the content, and the content imports Castle Builder's look.tsx.
 * In development Vite wraps .tsx modules for React Fast Refresh, and the refresh runtime writes
 * to `window` as it loads. A worker has no window, so here it gets its own global scope under
 * that name, before anything else loads (validate.worker.ts imports this first). Made code never
 * sees it: the sandbox shadows `window`. The build has no refresh runtime and leaves this out.
 */
if (import.meta.env.DEV) (globalThis as { window?: unknown }).window ??= globalThis

export {}
