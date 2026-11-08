/**
 * What the interpreter (and the designer) is told about the game besides the child's words:
 * the room, who is here and what they hold and wear, who was spoken to and made last, what
 * stands around, every action with its params, every item kind, the rooms and the names
 * free for a new avatar. Compact, one line a thing: Haiku answers sooner with less to read.
 * The actors go by their names in the game's language; `newNames` are that language's.
 */

import { LANGS } from '../engine/lang'
import { ROOM_GEO } from '../engine/rooms'
import { ROOMS, type Actor, type World } from '../engine/types'
import type { Vocabulary } from './parse'

/** Every name anyone here goes by, lowercase, in either language: a new avatar takes none of them (a new Aino made in English would meet Alice's Finnish name). */
export function takenNames(world: World): Set<string> {
  return new Set(world.actors.flatMap(({ name, names }) => (names === null ? [name] : LANGS.map((l) => names[l].name))).map((n) => n.toLowerCase()))
}

export function interpreterContext(world: World, vocab: Vocabulary, addressee: string | null, lastMade: string | null, newNames: readonly string[]): string {
  const kindOf = (id: string) => world.items.find((i) => i.id === id)!.kind
  const counts = new Map<string, number>()
  for (const it of world.items) counts.set(it.kind, (counts.get(it.kind) ?? 0) + 1)
  const taken = takenNames(world)
  const actor = (a: Actor) => {
    const held = [...new Set([a.hands.right, a.hands.left].flatMap((id) => (id === null ? [] : [kindOf(id)])))]
    const worn = Object.values(a.look.worn).flatMap((w) => (w === undefined ? [] : [w.tint === null ? w.kind : `${w.kind} (${w.tint})`]))
    return [
      `${a.id} ${a.name} ${a.look.body} ${a.pronoun}`,
      ...(held.length > 0 ? [`holds ${held.join(', ')}`] : []),
      ...(worn.length > 0 ? [`wears ${worn.join(', ')}`] : []),
      ...(a.riding !== null ? [`on ${kindOf(a.riding)}`] : []),
    ].join('; ')
  }
  return [
    `Room: ${world.room}. Rooms: ${ROOMS.map((r) => `${r} (${ROOM_GEO[r].calls[0]})`).join(', ')}.`,
    'Actors (id name body pronoun):',
    ...world.actors.map((a) => `- ${actor(a)}`),
    `Last spoken to: ${addressee ?? 'nobody'}. Last made: ${lastMade ?? 'nobody'}.`,
    `Things here: ${[...counts].map(([kind, n]) => (n > 1 ? `${kind} x${n}` : kind)).join(', ') || 'nothing'}.`,
    'Actions (id(params): about; ? optional):',
    ...[...vocab.actions.values()].map((a) => `${a.id}(${a.params.map((p) => `${p.name}${p.optional ? '?' : ''}: ${p.kind}`).join(', ')}): ${a.about}`),
    `Item kinds: ${[...vocab.items.keys()].join(', ')}.`,
    `Names free for a new avatar: ${newNames.filter((n) => !taken.has(n.toLowerCase())).join(', ') || 'none'}.`,
  ].join('\n')
}
