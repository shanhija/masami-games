/**
 * What Opus is told (prompts.ts): the room's system prompt is the reference joined in order and true
 * to its consts, the look's and the presents' likewise, each line once; no example, no sky, no bigger
 * room, no zoom or follow, and nothing from the own rooms, the twins or the plan's examples goes in;
 * the request says exactly its sentences (the earlier rooms with their colours, never a size) and
 * nothing about the children but their count, age, devices and how their rooms went; a fix carries
 * what failed and asks for only what changes; the look's request carries the room as the game built
 * it, and its fix what the check said; and the schemas give the fields in the types' order, with no
 * field `place`.
 */

import { describe, expect, it } from 'vitest'

import { LIGHT_RANGE, ROOM_ANSWER_REF, ROOM_FIX_REF, ROOM_PREAMBLE, ROOM_REFERENCE, ROOM_RULES, SHELL_REF, type RefSection } from '../engine/api'
import { GIFT_ANSWER_REF, GIFT_PREAMBLE, GIFT_REFERENCE, GIFTS_ANSWER_REF, GIFTS_PER_ROOM, KIT_SHAPES_REF, MODEL_PREAMBLE, SHAPE_OPTS_REF } from '../engine/gift'
import { LOOK_ANSWER_REF, LOOK_FIX_REF, LOOK_PREAMBLE, LOOK_REFERENCE, LOOK_RULES } from '../engine/look'
import { OWN_ROOMS } from '../own/rooms'
import { PATTERN_ORDER } from '../patterns/patterns'
import type { RoomRequest } from '../protocol'
import { TWINS } from '../trial/twins/twins'
import { WALK_PREAMBLE, WALK_REFERENCE } from '../trial/api'
import { BASE_ANSWER, LOOK_ANSWER } from './test/answers'
import {
  devicesSaid,
  FIX_SCHEMA,
  fixMessage,
  GIFTS_SCHEMA,
  GIFTS_SYSTEM,
  giftsMessage,
  LOOK_FIX_SCHEMA,
  LOOK_SCHEMA,
  LOOK_SYSTEM,
  lookFixMessage,
  lookMessage,
  MINUTES_SAID,
  partySaid,
  playedSaid,
  ROOM_SCHEMA,
  ROOM_SYSTEM,
  roomMessage,
  type Schema,
} from './prompts'

/** Every piece of a reference, in the order the prompt must give it: each section's title, then each of its lines. */
const pieces = (sections: readonly RefSection[]) => sections.flatMap((s) => [s.title, ...Object.values(s.lines).map((line) => `  ${line}`)])

/** Each piece found in the text after the one before it. */
function inOrder(text: string, all: readonly string[]): string[] {
  const missing: string[] = []
  let at = 0
  for (const piece of all) {
    const i = text.indexOf(piece, at)
    if (i < 0) missing.push(piece)
    else at = i + piece.length
  }
  return missing
}

const occurrences = (text: string, piece: string) => text.split(piece).length - 1

/** Every property name anywhere in a schema, nested ones too. */
const fieldsOf = (schema: Schema): string[] => {
  const props = (schema.properties ?? {}) as Record<string, Schema>
  const items = schema.items as Schema | undefined
  return [...Object.keys(props), ...Object.values(props).flatMap(fieldsOf), ...(items === undefined ? [] : fieldsOf(items))]
}

const SYSTEMS = { room: ROOM_SYSTEM, look: LOOK_SYSTEM, gifts: GIFTS_SYSTEM }

const REQUEST: RoomRequest = {
  party: 3,
  roll: { kind: 'together', view: 'side' },
  level: 2,
  devices: ['touch', 'gamepad', 'touch'],
  played: [
    { name: { en: 'Cloud Bakery', fi: 'Pilvileipomo' }, botSecs: 70.4, secs: 370, restarts: 2, hints: 3, end: 'finished', steps: { done: 5, of: 5 }, up: 3, down: 0 },
    { name: { en: 'Kite Hill', fi: 'Leijamäki' }, botSecs: 64, secs: 125, restarts: 1, hints: 1, end: 'left', steps: { done: 1, of: 3 }, up: 0, down: 2 },
  ],
}

describe("the room's system prompt", () => {
  it('is the reference joined in order: the rules, the room, its kit, the walkthrough, the answer', () => {
    const order = [ROOM_RULES, ROOM_PREAMBLE, ...pieces(ROOM_REFERENCE), WALK_PREAMBLE, ...pieces(WALK_REFERENCE), 'THE ANSWER, its fields in this order:', ...Object.values(ROOM_ANSWER_REF).map((l) => `  ${l}`)]
    expect(inOrder(ROOM_SYSTEM, order)).toEqual([])
    expect(ROOM_SYSTEM.startsWith('You design rooms for Magic House, a game for children of about seven, played by one to four of them at one screen. Behind each door of the house is one room, indoors, with walls, a floor and a ceiling round a theme of its own')).toBe(true)
    expect(ROOM_SYSTEM).toContain('another designer then dresses the room from what you build')
    expect(ROOM_SYSTEM.endsWith('Use only what is described above.')).toBe(true)
  })

  it("says every line of the room's reference once before the walkthrough's, and every line of the walkthrough's once after it, the shell among them", () => {
    const [room, walk] = ROOM_SYSTEM.split(WALK_PREAMBLE) as [string, string]
    expect(pieces(ROOM_REFERENCE).filter((p) => p.startsWith('  ') && occurrences(room, p) !== 1)).toEqual([])
    expect(pieces(WALK_REFERENCE).filter((p) => p.startsWith('  ') && occurrences(walk, p) !== 1)).toEqual([])
    expect(Object.values(SHELL_REF).map((line) => occurrences(ROOM_SYSTEM, `  ${line}`))).toEqual([1, 1, 1, 1, 1])
  })

  it("says the kit's lines once, as the last sections of the room's reference", () => {
    expect([MODEL_PREAMBLE, KIT_SHAPES_REF.box, KIT_SHAPES_REF.lathe, SHAPE_OPTS_REF.glow].map((piece) => occurrences(ROOM_SYSTEM, piece))).toEqual([1, 1, 1, 1])
  })

  it('asks for plain code that works the first time, never for quick or short code', () => {
    expect(ROOM_SYSTEM).toContain('Write plain code that works the first time.')
    expect(ROOM_SYSTEM).not.toMatch(/be quick|short code|write short/i)
  })

  it('gives no example and nothing of the own rooms, the twins or the plan', () => {
    for (const prompt of Object.values(SYSTEMS)) {
      expect(prompt).not.toMatch(/\bexample|for instance|e\.g\./i)
      for (const own of OWN_ROOMS) for (const said of [own.name.en, own.name.fi, own.theme, own.task]) expect(prompt).not.toContain(said)
      for (const twin of Object.values(TWINS)) expect(prompt).not.toContain(twin.name)
      expect(prompt).not.toContain(BASE_ANSWER.room.split('\n')[2])
      // The plan's own examples: the ask by hand's apples and pads, the template's numbers.
      expect(prompt).not.toMatch(/apple|basket|6 min 10 s/i)
    }
  })

  it('names no sky, no bigger room, no zooming and no following, in any system prompt', () => {
    for (const [which, prompt] of Object.entries(SYSTEMS)) expect([which, prompt.match(/\bsky\b|bigger room|\bzoom\w*|\bfollow(ed|ing)\b|\bfollows? (them|the players)/gi)]).toEqual([which, null])
  })
})

describe("the look's system prompt", () => {
  it('is its opening, the look reference joined in order, its kit, and the answer', () => {
    const order = [LOOK_RULES, LOOK_PREAMBLE, ...pieces(LOOK_REFERENCE), 'THE ANSWER, its fields in this order:', ...Object.values(LOOK_ANSWER_REF).map((l) => `  ${l}`)]
    expect(inOrder(LOOK_SYSTEM, order)).toEqual([])
    expect(LOOK_SYSTEM.startsWith('You dress rooms for Magic House, a game for children of about seven, played by one to four of them at one screen.')).toBe(true)
    expect(LOOK_SYSTEM).toContain('Write code that builds without fault, and make the room rich.')
    expect(LOOK_SYSTEM.endsWith('Use only what is described above.')).toBe(true)
  })

  it("says every line of its reference once, and the kit's lines once, as the room's prompt does", () => {
    expect(pieces(LOOK_REFERENCE).filter((p) => p.startsWith('  ') && occurrences(LOOK_SYSTEM, p) !== 1)).toEqual([])
    expect([MODEL_PREAMBLE, KIT_SHAPES_REF.box, KIT_SHAPES_REF.lathe, SHAPE_OPTS_REF.glow].map((piece) => occurrences(LOOK_SYSTEM, piece))).toEqual([1, 1, 1, 1])
    // Nothing of the room code's own reference: the look builds only with its own calls.
    expect(LOOK_SYSTEM).not.toContain(ROOM_PREAMBLE.split('\n')[0])
    expect(LOOK_SYSTEM).not.toContain('r.box(')
  })
})

describe("the presents' system prompt", () => {
  it('is the present reference joined in order, and the answer', () => {
    const order = [GIFT_PREAMBLE, ...pieces(GIFT_REFERENCE), 'THE ANSWER:', `  ${GIFTS_ANSWER_REF.gifts}`, ...Object.values(GIFT_ANSWER_REF).map((l) => `  ${l}`)]
    expect(inOrder(GIFTS_SYSTEM, order)).toEqual([])
    expect(GIFTS_SYSTEM).toContain('Write plain code that works the first time.')
  })
})

describe('the request', () => {
  it("says what 'How they played before' is for, in the system prompt, and the request says it by that line", () => {
    expect(ROOM_SYSTEM).toContain('A line that begins "How they played before" says how these players played their last rooms')
    expect(ROOM_SYSTEM).toContain('Make this room easier where they took long, needed hints or left, and harder where they were quick without hints')
    expect(playedSaid(REQUEST.played).startsWith('How they played before: ')).toBe(true)
  })

  it('says the earlier rooms with their colours, the party and the roll, the view, how they played, and the minutes, and nothing else', () => {
    const paint = (color: string, pattern: (typeof PATTERN_ORDER)[number]) => ({ color, second: '#ffffff', pattern })
    const earlier = [
      { name: { en: 'Moss Mill', fi: 'Sammalmylly' }, theme: 'a mill in a mossy wood', task: 'turn the wheel to grind the flour', shell: { walls: paint('#c8e6ff', 'stars'), floor: paint('#8a5a3a', 'stripes'), ceiling: paint('#ffffff', 'plain'), trim: 'white', light: 0.7 } },
      { name: { en: 'Ice Bridge', fi: 'Jääsilta' }, theme: 'a frozen river', task: 'build a bridge of ice blocks', shell: { walls: paint('pink', 'plain'), floor: paint('#ddeeff', 'checks'), ceiling: paint('#ffffff', 'plain'), trim: 'white', light: 1 } },
    ]
    expect(roomMessage(REQUEST, earlier)).toBe(
      [
        'Build a new room, unlike every one of these in its theme, its colours and what the players do:',
        '- Moss Mill: a mill in a mossy wood; turn the wheel to grind the flour (walls #c8e6ff stars, floor #8a5a3a stripes, light 0.7)',
        '- Ice Bridge: a frozen river; build a bridge of ice blocks (walls pink, floor #ddeeff checks, light 1)',
        'Three players of about seven play it together, on a touch screen and a gamepad, and it needs all three. It is seen from the side.',
        'How they played before: Cloud Bakery (the bots took 70 s): finished in 6 min 10 s with 2 restarts and 3 hints. Kite Hill (the bots took 64 s): left after 2 min 5 s with 1 restart and 1 hint. They loved Cloud Bakery. They did not like Kite Hill.',
        MINUTES_SAID,
      ].join('\n'),
    )
  })

  it('says when a room’s clock ran out with steps undone, never that it was finished', () => {
    const clocked = { ...REQUEST.played[0]!, botSecs: 180, secs: 180, restarts: 0, hints: 1, steps: { done: 2, of: 4 } }
    expect(playedSaid([clocked])).toBe('How they played before: Cloud Bakery (the bots took 180 s): the time ran out with 2 of 4 steps done after 3 min 0 s with 0 restarts and 1 hint. They loved Cloud Bakery.')
  })

  it('says no size: every room has one', () => {
    expect(roomMessage(REQUEST, [])).not.toMatch(/one screen|bigger|\bsize\b|\bwide\b|metres|\bfits\b/i)
  })

  it('says when there are no earlier rooms and no rooms played', () => {
    const message = roomMessage({ ...REQUEST, party: 1, devices: ['keys'], played: [], roll: { kind: 'together', view: 'side' } }, [])
    expect(message).toBe(
      ['Build a new room. There are no earlier rooms yet.', 'One player of about seven plays it alone, on keys. It is seen from the side.', 'They have not played a room here before.', MINUTES_SAID].join('\n'),
    )
  })

  it('says each kind of room in a plain sentence, never by its id', () => {
    expect(partySaid(2, 'together', ['keys', 'keys'])).toBe('Two players of about seven play it together, on keys, and it needs both of them.')
    expect(partySaid(4, 'contest', ['gamepad', 'gamepad', 'keys', 'touch'])).toBe('Four players of about seven play it against each other, on keys, a touch screen and gamepads: each of them tries to win.')
    expect(partySaid(3, 'side', ['gamepad', 'gamepad', 'gamepad'])).toBe('Three players of about seven play it side by side, on gamepads: each has a part of their own, alike for all, and nobody plays against anybody.')
    expect(devicesSaid(['touch', 'touch'])).toBe('on a touch screen')
    expect(playedSaid([{ ...REQUEST.played[0]!, up: 1, down: 1 }])).not.toMatch(/loved|did not like/)
  })
})

describe('the fix', () => {
  it("carries the request, the answer with its lines numbered, the trial's sentences and survey, and asks only for what changes", () => {
    const first = roomMessage(REQUEST, [])
    const message = fixMessage(first, BASE_ANSWER, [{ sentences: ['bot 2 found no way (line 12)', 'step 3 never turned done'], survey: 'Floors: the deck from -10 to 10 at y 0.' }])
    expect(message.startsWith(first)).toBe(true)
    expect(message).toContain(`theme: ${BASE_ANSWER.theme}\ntask: ${BASE_ANSWER.task}\nname: {"en":"Pirate Sails","fi":"Merirosvon purjeet"}\nshell: ${JSON.stringify(BASE_ANSWER.shell)}`)
    expect(message).toContain(`  1  ${BASE_ANSWER.room.split('\n')[0]}\n  2  ${BASE_ANSWER.room.split('\n')[1]}`)
    expect(message).toContain(` 12  ${BASE_ANSWER.walk.split('\n')[11]}`)
    expect(message).toContain('It failed its trial:\n- bot 2 found no way (line 12)\n- step 3 never turned done')
    expect(message).toContain('The room as it was built, measured by the trial:\nFloors: the deck from -10 to 10 at y 0.')
    expect(message).toContain('Answer only the code that must change')
    expect(message).not.toContain('Earlier tries')
    expect(fixMessage(first, BASE_ANSWER, [{ sentences: ['the walkthrough could not be compiled: SyntaxError'], survey: '' }])).not.toContain('measured by the trial')
  })

  it('says on the third try what the earlier tries failed with, so a fix does not bring back what was mended, and only the last survey', () => {
    const first = roomMessage(REQUEST, [])
    const failures = [
      { sentences: ["bot 1 found no way up to 'h1_0'"], survey: 'the first survey' },
      { sentences: ['the walkthrough finished the room in 50.1 s'], survey: 'the second survey' },
    ]
    const message = fixMessage(first, BASE_ANSWER, failures)
    expect(message).toContain("Earlier tries of this room failed with these; keep them mended:\n- bot 1 found no way up to 'h1_0'\n\nIt failed its trial:\n- the walkthrough finished the room in 50.1 s\n\nThe room as it was built, measured by the trial:\nthe second survey")
    expect(message).not.toContain('the first survey')
    expect(() => fixMessage(first, BASE_ANSWER, [])).toThrow('a fix is asked only after a failed try')
  })
})

describe("the look's request and its fix", () => {
  const facts = { theme: BASE_ANSWER.theme, task: BASE_ANSWER.task, name: BASE_ANSWER.name, shell: BASE_ANSWER.shell, party: 4 as const, roll: { kind: 'together' as const, view: 'side' as const }, devices: ['keys', 'keys', 'gamepad', 'gamepad'] as const }

  it("carries the game's theme, task, name and shell, who plays and how it is seen, the room code and the survey, and asks it dressed", () => {
    expect(lookMessage(facts, BASE_ANSWER.room, 'Floors: the deck.')).toBe(
      [
        `Another designer made this room.\ntheme: ${BASE_ANSWER.theme}\ntask: ${BASE_ANSWER.task}\nname: {"en":"Pirate Sails","fi":"Merirosvon purjeet"}\nshell: ${JSON.stringify(BASE_ANSWER.shell)}`,
        'Four players of about seven play it together, on keys and gamepads, and it needs all four. It is seen from the side.',
        `The room code:\n${BASE_ANSWER.room}`,
        'The room as it was built, measured by the trial:\nFloors: the deck.',
        'Dress this room.',
      ].join('\n\n'),
    )
  })

  it("carries the request, the look with its lines numbered, the check's sentences and notes, and asks the whole look again", () => {
    const request = lookMessage(facts, BASE_ANSWER.room, 'Floors: the deck.')
    const message = lookFixMessage(request, LOOK_ANSWER.look, { sentences: ['the look has 3 props that react (line 6)'], notes: ['r.decor at 0, 1, 0 would stand inside the deck, so it was left out'] })
    expect(message.startsWith(request)).toBe(true)
    expect(message).toContain(`You answered with this look, each line numbered as the sentences below name it:\n  1  ${LOOK_ANSWER.look.split('\n')[0]}\n  2  `)
    expect(message).toContain("Its check failed:\n- the look has 3 props that react (line 6)\n\nThe check's notes:\n- r.decor at 0, 1, 0 would stand inside the deck, so it was left out")
    expect(message.endsWith('Mend what the sentences name; answer the whole look again. Write the code without the line numbers.')).toBe(true)
    expect(lookFixMessage(request, LOOK_ANSWER.look, { sentences: ['thrown'], notes: [] })).not.toContain("The check's notes")
  })
})

describe('the presents request', () => {
  it("names the room they come from and how many", () => {
    expect(giftsMessage(BASE_ANSWER)).toBe(`The children have just finished this room: Pirate Sails: ${BASE_ANSWER.theme}; ${BASE_ANSWER.task}\nMake its ${GIFTS_PER_ROOM} presents, each a thing of this room's world for a child to wear from now on.`)
  })
})

describe('the schemas', () => {
  it("give the room's fields in the plan's order, the idea, then the shell, then the code, each with its reference line", () => {
    const props = ROOM_SCHEMA.properties as Record<string, { description: string }>
    expect([Object.keys(props), ROOM_SCHEMA.required]).toEqual([
      ['theme', 'task', 'name', 'shell', 'room', 'walk', 'wish'],
      ['theme', 'task', 'name', 'shell', 'room', 'walk', 'wish'],
    ])
    expect(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.description]))).toEqual(ROOM_ANSWER_REF)
    expect(ROOM_SCHEMA.additionalProperties).toBe(false)
  })

  it("give the shell as three paints of the game's patterns, a trim and a light in its range, in the answer and in the fix", () => {
    for (const schema of [ROOM_SCHEMA, FIX_SCHEMA]) {
      const shell = (schema.properties as Record<string, Schema>).shell!
      const props = shell.properties as Record<string, Schema & { properties?: Record<string, Schema> }>
      expect([Object.keys(props), shell.required]).toEqual([Object.keys(SHELL_REF), Object.keys(SHELL_REF)])
      for (const which of ['walls', 'floor', 'ceiling']) expect([Object.keys(props[which]!.properties!), props[which]!.properties!.pattern!.enum]).toEqual([['color', 'second', 'pattern'], [...PATTERN_ORDER]])
      expect([props.light!.minimum, props.light!.maximum, props.trim!.type]).toEqual([LIGHT_RANGE.least, 1, 'string'])
    }
  })

  it("give the look's code and wish, and its fix the whole look again, each with its reference line", () => {
    const describe = (schema: Schema) => Object.fromEntries(Object.entries(schema.properties as Record<string, { description: string }>).map(([k, v]) => [k, v.description]))
    expect([describe(LOOK_SCHEMA), LOOK_SCHEMA.required, describe(LOOK_FIX_SCHEMA), LOOK_FIX_SCHEMA.required]).toEqual([LOOK_ANSWER_REF, Object.keys(LOOK_ANSWER_REF), LOOK_FIX_REF, Object.keys(LOOK_FIX_REF)])
  })

  it('have no field named place: a room has a theme', () => {
    for (const schema of [ROOM_SCHEMA, FIX_SCHEMA, LOOK_SCHEMA, LOOK_FIX_SCHEMA, GIFTS_SCHEMA]) expect(fieldsOf(schema)).not.toContain('place')
  })

  it("give a fix's name, room and walkthrough, and the presents in a list of exactly their number", () => {
    expect(Object.keys(FIX_SCHEMA.properties as object)).toEqual(Object.keys(ROOM_FIX_REF))
    const gifts = (GIFTS_SCHEMA.properties as Record<string, { minItems: number; maxItems: number; items: { properties: object } }>).gifts
    expect([gifts.minItems, gifts.maxItems, Object.keys(gifts.items.properties)]).toEqual([GIFTS_PER_ROOM, GIFTS_PER_ROOM, ['name', 'slot', 'form', 'code']])
  })
})
