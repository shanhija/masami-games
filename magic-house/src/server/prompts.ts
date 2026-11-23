/**
 * What Opus is told for Magic House, and the shapes it answers in (plan.md, How Opus is asked).
 *
 * The rule for these prompts, Dissertation's: be general, never list what a room may or may not be,
 * and give no example, because an example pulls every answer toward itself. The reference is the
 * only list, and it names building blocks: it lives beside the calls (engine/api.ts, trial/api.ts,
 * engine/gift.ts), a test holds the engine to every line, and this file only joins it. Nothing from
 * the game's own rooms, the broken twins or the plan's examples goes in, and nothing about the
 * children but their count, an age of about seven, their devices and how their last rooms went.
 *
 * Five calls: a room (ROOM_SYSTEM with roomMessage, answered in ROOM_SCHEMA), its fix after a
 * failed trial (the same system prompt, so the API's cache of it serves both, with fixMessage,
 * answered in FIX_SCHEMA: only the part that changes), the room's look once the trial has built the
 * room (LOOK_SYSTEM with lookMessage, in LOOK_SCHEMA; step 7a), the look's fix after a failed check
 * (the same system prompt, with lookFixMessage, in LOOK_FIX_SCHEMA: the whole look again), and a kept
 * room's presents (GIFTS_SYSTEM with giftsMessage, in GIFTS_SCHEMA). The schemas are built from the
 * answer types field by field, as Silly Billy's prompts.ts builds its own, with each field's line
 * from the reference: a field added to a type does not compile here until its schema is written.
 */

import type { Words } from '../../../profiles/src/lang'
import { SLOTS } from '../../../silly-billy/src/engine/types'
import { LIGHT_RANGE, ROOM_ANSWER_REF, ROOM_FIX_REF, ROOM_PREAMBLE, ROOM_REFERENCE, ROOM_RULES, SHELL_REF, type Paint, type RefSection, type RoomAnswer, type RoomFix, type Shell } from '../engine/api'
import { GIFT_ANSWER_REF, GIFT_PREAMBLE, GIFT_REFERENCE, GIFTS_ANSWER_REF, GIFTS_PER_ROOM, type GiftAnswer, type GiftsAnswer } from '../engine/gift'
import { LOOK_ANSWER_REF, LOOK_FIX_REF, LOOK_PREAMBLE, LOOK_REFERENCE, LOOK_RULES, type LookAnswer, type LookFix } from '../engine/look'
import type { RoomKind, RoomView } from '../engine/world'
import { PATTERN_ORDER } from '../patterns/patterns'
import type { PlayedBefore, Roll, RoomFile, RoomRequest } from '../protocol'
import type { DeviceKind, PartySize } from '../seats/types'
import { WALK_PREAMBLE, WALK_REFERENCE } from '../trial/api'

// ------------------------------------------------------------------------------ schemas from the types

export type Schema = Record<string, unknown>

/** Every field of T, each with its schema, in the order the answer gives them. */
type Fields<T> = { [K in keyof T]-?: Schema }

function object<T>(description: string, fields: Fields<T>): Schema {
  return { type: 'object', description, properties: fields, required: Object.keys(fields), additionalProperties: false }
}
const text = (description: string): Schema => ({ type: 'string', description })
const words = (description: string): Schema => object<Words>(description, { en: text('In English.'), fi: text('In Finnish.') })

const paint = (description: string): Schema =>
  object<Paint>(description, {
    color: text("'#rrggbb' or a colour name."),
    second: text("The pattern's colour, '#rrggbb' or a colour name."),
    pattern: { type: 'string', description: 'The pattern laid in second over color; plain for color alone.', enum: [...PATTERN_ORDER] },
  })
const shell = (description: string): Schema =>
  object<Shell>(description, {
    walls: paint(SHELL_REF.walls),
    floor: paint(SHELL_REF.floor),
    ceiling: paint(SHELL_REF.ceiling),
    trim: text(SHELL_REF.trim),
    light: { type: 'number', description: SHELL_REF.light, minimum: LIGHT_RANGE.least, maximum: 1 },
  })

export const ROOM_SCHEMA = object<RoomAnswer>('The room: the idea, then the shell, then the code.', {
  theme: text(ROOM_ANSWER_REF.theme),
  task: text(ROOM_ANSWER_REF.task),
  name: words(ROOM_ANSWER_REF.name),
  shell: shell(ROOM_ANSWER_REF.shell),
  room: text(ROOM_ANSWER_REF.room),
  walk: text(ROOM_ANSWER_REF.walk),
  wish: text(ROOM_ANSWER_REF.wish),
})

export const FIX_SCHEMA = object<RoomFix>('The room mended: only the part that changes.', {
  name: words(ROOM_FIX_REF.name),
  shell: shell(ROOM_FIX_REF.shell),
  room: text(ROOM_FIX_REF.room),
  walk: text(ROOM_FIX_REF.walk),
})

export const LOOK_SCHEMA = object<LookAnswer>("The room's look: its code, then what it lacked.", {
  look: text(LOOK_ANSWER_REF.look),
  wish: text(LOOK_ANSWER_REF.wish),
})

export const LOOK_FIX_SCHEMA = object<LookFix>('The look mended: the whole look again.', {
  look: text(LOOK_FIX_REF.look),
})

const GIFT_SCHEMA = object<GiftAnswer>('One present: what it is and where it goes, its form in words, then its code.', {
  name: words(GIFT_ANSWER_REF.name),
  slot: { type: 'string', description: GIFT_ANSWER_REF.slot, enum: [...SLOTS] },
  form: text(GIFT_ANSWER_REF.form),
  code: text(GIFT_ANSWER_REF.code),
})

export const GIFTS_SCHEMA = object<GiftsAnswer>("The room's presents.", {
  gifts: { type: 'array', description: GIFTS_ANSWER_REF.gifts, items: GIFT_SCHEMA, minItems: GIFTS_PER_ROOM, maxItems: GIFTS_PER_ROOM },
})

// ------------------------------------------------------------------------------ the system prompts

/** A section of the reference as the prompt shows it: its title, then each call's line, indented. */
const section = (s: RefSection): string => `${s.title}\n${Object.values(s.lines).map((line) => `  ${line}`).join('\n')}`
const reference = (sections: readonly RefSection[]): string => sections.map(section).join('\n\n')

/**
 * The room's system prompt: the reference itself, in order. The children's principles, the room's
 * preamble and reference (its last sections are the kit's lines every model in a room is built
 * with: engine/api.ts MODEL_SECTIONS), the walkthrough's preamble and reference, and the answer's
 * fields. It opens on a room of the house, indoors, round a theme, which another designer dresses:
 * "a small world they walk into" drew outdoor places and objects (step 7a). It asks for plain code
 * that works the first time, never for quick or short code: short pulled the ask by hand's room
 * small (plan.md, The ask by hand).
 */
export const ROOM_SYSTEM = `You design rooms for Magic House, a game for children of about seven, played by one to four of them at one screen. Behind each door of the house is one room, indoors, with walls, a floor and a ceiling round a theme of its own: the children walk in, work out what it wants and do it, in a few minutes. You choose the room's theme and its shell and write its play as code, with a walkthrough that plays it to its end; another designer then dresses the room from what you build: its furniture, the things of its theme and its lights. Write plain code that works the first time.

${ROOM_RULES}

${ROOM_PREAMBLE}

${reference(ROOM_REFERENCE)}

${WALK_PREAMBLE}

${reference(WALK_REFERENCE)}

${section({ title: 'THE ANSWER, its fields in this order:', lines: ROOM_ANSWER_REF })}

Use only what is described above.`

/**
 * The look's system prompt (step 7a): its opening, the look's principles, its preamble and reference
 * (the look's builder, its options, the room as built, and the same kit lines as the room's), and the
 * answer's fields. The look is asked once the trial has built the room, beside the trial and the
 * game's fixes, and dresses the room the game built (server/line.ts).
 */
export const LOOK_SYSTEM = `You dress rooms for Magic House, a game for children of about seven, played by one to four of them at one screen. Behind each door of the house is one room, indoors, round a theme of its own. Another designer has chosen this room's theme and shell and built its play; you write its look as code: its furniture and the things of its theme, what answers a child, and its lights, round the play as it was built. Write code that builds without fault, and make the room rich.

${LOOK_RULES}

${LOOK_PREAMBLE}

${reference(LOOK_REFERENCE)}

${section({ title: 'THE ANSWER, its fields in this order:', lines: LOOK_ANSWER_REF })}

Use only what is described above.`

/** The presents' system prompt: the present's preamble and reference, and the answer's fields. */
export const GIFTS_SYSTEM = `You design presents for Magic House, a game for children of about seven. When the children finish a room, each of them opens a present that comes from that room's world and wears it from then on. You write each present as code. Write plain code that works the first time.

${GIFT_PREAMBLE}

${reference(GIFT_REFERENCE)}

${section({ title: 'THE ANSWER:', lines: GIFTS_ANSWER_REF })}

${section({ title: 'Each present, its fields in this order:', lines: GIFT_ANSWER_REF })}

Use only what is described above.`

// ------------------------------------------------------------------------------ the messages

/** An earlier room the new one must be unlike: its English name, its theme, what the players do and its shell. */
export type Earlier = Pick<RoomFile, 'name' | 'theme' | 'task' | 'shell'>

const COUNT: Record<PartySize, string> = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four' }
const ALL: Record<PartySize, string> = { 1: 'them', 2: 'both of them', 3: 'all three', 4: 'all four' }
const VIEW: Record<RoomView, string> = { side: 'from the side', high: 'from high up' }

/** The devices they sit at, in a few words: "on keys", "on a touch screen and a gamepad". */
export function devicesSaid(devices: readonly DeviceKind[]): string {
  const count = (kind: DeviceKind) => devices.filter((d) => d === kind).length
  const said = [
    ...(count('keys') > 0 ? ['keys'] : []),
    ...(count('touch') > 0 ? ['a touch screen'] : []),
    ...(count('gamepad') > 1 ? ['gamepads'] : count('gamepad') === 1 ? ['a gamepad'] : []),
  ]
  return `on ${said.length > 1 ? `${said.slice(0, -1).join(', ')} and ${said.at(-1)!}` : said[0]!}`
}

/** Who plays and how, in a plain sentence: the roll's kind said, never named by its id. */
export function partySaid(party: PartySize, kind: RoomKind, devices: readonly DeviceKind[]): string {
  const on = devicesSaid(devices)
  if (party === 1) return `One player of about seven plays it alone, ${on}.`
  const who = `${COUNT[party]} players of about seven play it`
  if (kind === 'together') return `${who} together, ${on}, and it needs ${ALL[party]}.`
  if (kind === 'contest') return `${who} against each other, ${on}: each of them tries to win.`
  return `${who} side by side, ${on}: each has a part of their own, alike for all, and nobody plays against anybody.`
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
/** Seconds as a child's parent says them: "45 s", "6 min 10 s". */
const minutes = (secs: number) => {
  const s = Math.round(secs)
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}
const names = (rooms: readonly PlayedBefore[]) => rooms.map((p) => p.name.en).join(', ')

/** How these players played their last rooms: one line each, then what they loved and what they did not like, by their thumbs. */
export function playedSaid(played: readonly PlayedBefore[]): string {
  if (played.length === 0) return 'They have not played a room here before.'
  const each = played.map(
    (p) =>
      `${p.name.en} (the bots took ${Math.round(p.botSecs)} s): ${p.end === 'left' ? 'left after' : p.steps.done < p.steps.of ? `the time ran out with ${p.steps.done} of ${p.steps.of} steps done after` : 'finished in'} ${minutes(p.secs)} with ${plural(p.restarts, 'restart')} and ${plural(p.hints, 'hint')}.`,
  )
  const loved = played.filter((p) => p.up > p.down)
  const not = played.filter((p) => p.down > p.up)
  return [`How they played before: ${each.join(' ')}`, ...(loved.length > 0 ? [`They loved ${names(loved)}.`] : []), ...(not.length > 0 ? [`They did not like ${names(not)}.`] : [])].join(' ')
}

/** The last line, about the minute or two of play (plan.md, The ask by hand: never a minute a walkthrough could fill by waiting). */
export const MINUTES_SAID = 'They should need three to five minutes: there is a minute or two of play in it even for players who know the way.'

/** A paint in a few words: its colour, and its pattern unless plain. */
const paintSaid = (p: Paint) => (p.pattern === 'plain' ? p.color : `${p.color} ${p.pattern}`)
/** A shell's colours and light as an earlier room's line gives them: "walls #c8e6ff stars, floor #8a5a3a stripes, light 0.7". */
export const shellSaid = (s: Shell) => `walls ${paintSaid(s.walls)}, floor ${paintSaid(s.floor)}, light ${s.light}`

/**
 * The request for a new room: the earlier rooms to be unlike (newest first, each with its colours,
 * so a new room is unlike them in its colours too), the party and the rolled kind, the view, how
 * they played before, and the minute or two of play. Every room has one size (engine/api.ts ROOM),
 * so the request says none.
 */
export function roomMessage(req: RoomRequest, earlier: readonly Earlier[]): string {
  const unlike =
    earlier.length === 0
      ? 'Build a new room. There are no earlier rooms yet.'
      : `Build a new room, unlike every one of these in its theme, its colours and what the players do:\n${earlier.map((e) => `- ${e.name.en}: ${e.theme}; ${e.task} (${shellSaid(e.shell)})`).join('\n')}`
  return [unlike, `${partySaid(req.party, req.roll.kind, req.devices)} It is seen ${VIEW[req.roll.view]}.`, playedSaid(req.played), MINUTES_SAID].join('\n')
}

/** What a try failed with: the trial's sentences and its survey of the room as built ('' when it was never built: the guard or the name refused it first). */
export interface Failure {
  readonly sentences: readonly string[]
  readonly survey: string
}

/** Code with its lines numbered from 1, as the trial's sentences name them ("(line 12)"). */
const numbered = (code: string) => code.split('\n').map((line, i) => `${String(i + 1).padStart(3)}  ${line}`).join('\n')

/**
 * The request to mend a room after a failed try: a fresh call (server/line.ts says why) carrying the
 * request as first asked, the answer as it stands, what the earlier tries failed with, what the last
 * failed with and its survey, and asking for only the part that changes. The earlier tries are said
 * because a fix that hears only the last failure can bring back the one before: in the first rooms
 * two rooms went from a gap too wide to too short and back, and were dropped.
 */
export function fixMessage(first: string, answer: RoomAnswer, failures: readonly Failure[]): string {
  const last = failures.at(-1)
  if (last === undefined) throw new Error('a fix is asked only after a failed try')
  const earlier = [...new Set(failures.slice(0, -1).flatMap((f) => f.sentences))]
  return [
    first,
    `You answered with this room.\ntheme: ${answer.theme}\ntask: ${answer.task}\nname: ${JSON.stringify(answer.name)}\nshell: ${JSON.stringify(answer.shell)}`,
    `The room code, each line numbered as the sentences below name it:\n${numbered(answer.room)}`,
    `The walkthrough, numbered the same way:\n${numbered(answer.walk)}`,
    ...(earlier.length === 0 ? [] : [`Earlier tries of this room failed with these; keep them mended:\n${earlier.map((s) => `- ${s}`).join('\n')}`]),
    `It failed its trial:\n${last.sentences.map((s) => `- ${s}`).join('\n')}`,
    ...(last.survey === '' ? [] : [`The room as it was built, measured by the trial:\n${last.survey}`]),
    'Mend what the sentences name. Give the name and the shell again as they were, unless a sentence is about them. Answer only the code that must change: the whole room code again when the room must change, the whole walkthrough again when it must change, and leave the other empty to keep it as it was. Write the code without the line numbers.',
  ].join('\n\n')
}

/** The request for a kept room's presents: the room they come from, by its name, theme and task. */
export function giftsMessage(room: Pick<Earlier, 'name' | 'theme' | 'task'>): string {
  return `The children have just finished this room: ${room.name.en}: ${room.theme}; ${room.task}\nMake its ${GIFTS_PER_ROOM} presents, each a thing of this room's world for a child to wear from now on.`
}

/** What the look is told of the room it dresses: what the game's answer chose, who plays it and how it is seen. */
export interface LookFacts extends Pick<RoomAnswer, 'theme' | 'task' | 'name' | 'shell'> {
  readonly party: PartySize
  readonly roll: Roll
  readonly devices: readonly DeviceKind[]
}

/**
 * The request for a room's look: the game's theme, task, name and shell, who plays and how it is
 * seen, the room code as it stands, and the trial's survey of the room as built (the latest a trial
 * gave), so the look dresses the room it will be built on. Asked again in full for the look's fix,
 * since a game fix may have changed the room since.
 */
export function lookMessage(facts: LookFacts, code: string, survey: string): string {
  return [
    `Another designer made this room.\ntheme: ${facts.theme}\ntask: ${facts.task}\nname: ${JSON.stringify(facts.name)}\nshell: ${JSON.stringify(facts.shell)}`,
    `${partySaid(facts.party, facts.roll.kind, facts.devices)} It is seen ${VIEW[facts.roll.view]}.`,
    `The room code:\n${code}`,
    `The room as it was built, measured by the trial:\n${survey}`,
    'Dress this room.',
  ].join('\n\n')
}

/** What a look's check failed with: its sentences, and its notes of what was left out or drawn plain. */
export interface LookFailure {
  readonly sentences: readonly string[]
  readonly notes: readonly string[]
}

/** The request to mend a look after a failed check: the request as it stands now, the look with its lines numbered, the check's sentences and notes, and the whole look asked again. */
export function lookFixMessage(request: string, look: string, failure: LookFailure): string {
  return [
    request,
    `You answered with this look, each line numbered as the sentences below name it:\n${numbered(look)}`,
    `Its check failed:\n${failure.sentences.map((s) => `- ${s}`).join('\n')}`,
    ...(failure.notes.length === 0 ? [] : [`The check's notes:\n${failure.notes.map((n) => `- ${n}`).join('\n')}`]),
    'Mend what the sentences name; answer the whole look again. Write the code without the line numbers.',
  ].join('\n\n')
}
