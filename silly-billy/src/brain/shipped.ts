/**
 * The library the static build plays: silly-billy/library/ as it was on disk when the build
 * ran, so things made at home play on the hosted page too. Only the build imports this module
 * (link.ts, behind import.meta.env.PROD): the dev server never loads it, so it never watches
 * the files it writes there.
 */

import type { ActionEntry, AvatarEntry, ItemEntry, LibraryData, PhraseEntry } from '../engine/protocol'

const all = <T>(files: Record<string, T>): T[] =>
  Object.keys(files)
    .sort()
    .map((path) => files[path]!)

export const SHIPPED: LibraryData = {
  items: all(import.meta.glob<ItemEntry>('../../library/items/*.json', { eager: true, import: 'default' })),
  actions: all(import.meta.glob<ActionEntry>('../../library/actions/*.json', { eager: true, import: 'default' })),
  avatars: all(import.meta.glob<AvatarEntry>('../../library/avatars/*.json', { eager: true, import: 'default' })),
  // A phrase kept before the game had two languages has no Finnish heard line: it is understood afresh, as the dev server does.
  phrases: all(import.meta.glob<PhraseEntry[]>('../../library/phrases.json', { eager: true, import: 'default' }))
    .flat()
    .filter((p) => typeof p.plan.heardFi === 'string' && p.plan.heardFi !== ''),
}
