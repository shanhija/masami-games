/**
 * The prompts and schemas: every schema is strict and well formed, plans of every shape fit
 * the plan schema and wrong ones do not, the interpreter is told the game's language and
 * answers its lines in both, the designer is given the whole API doc and writes bubbles in
 * both languages, and the messages carry the spec, the words, the context and, for a fix, the
 * code and its error.
 */
import { describe, expect, it } from 'vitest'

import { ACTION_DOC, ACTION_EXAMPLE, ACTION_RULES, ITEM_DOC, ITEM_EXAMPLE, ITEM_RULES, TICK_DOC } from '../engine/apidoc'
import type { InventRequest, NewAction, NewItem, Plan } from '../engine/protocol'
import { ACTION_SCHEMA, ACTION_SYSTEM, INTERPRET_SYSTEM, ITEM_SCHEMA, ITEM_SYSTEM, PLAN_SCHEMA, interpretMessage, inventMessage, lacksFinnishName, type Schema } from './prompts'

/** A small JSON Schema check for the subset the schemas use: type, enum, properties, required, additionalProperties, items. */
function problems(schema: Schema, value: unknown, at = 'plan'): string[] {
  const out: string[] = []
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) out.push(`${at} is not one of ${JSON.stringify(schema.enum)}`)
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [...out, `${at} is not an object`]
    const props = schema.properties as Record<string, Schema>
    for (const key of schema.required as string[]) if (!(key in value)) out.push(`${at}.${key} is missing`)
    for (const [key, v] of Object.entries(value)) {
      if (!props[key]) out.push(`${at}.${key} is not allowed`)
      else out.push(...problems(props[key], v, `${at}.${key}`))
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return [...out, `${at} is not a list`]
    value.forEach((v, i) => out.push(...problems(schema.items as Schema, v, `${at}[${i}]`)))
  } else if (schema.type === 'number' ? typeof value !== 'number' : typeof value !== schema.type) out.push(`${at} is not a ${String(schema.type)}`)
  return out
}

/** Every object in a schema is strict and every value has a type and a description. */
function malformed(schema: Schema, at: string): string[] {
  const out: string[] = []
  if (typeof schema.type !== 'string') out.push(`${at} has no type`)
  if (typeof schema.description !== 'string' || schema.description === '') out.push(`${at} has no description`)
  if (schema.type === 'object') {
    if (schema.additionalProperties !== false) out.push(`${at} allows more properties`)
    const props = schema.properties as Record<string, Schema>
    for (const key of schema.required as string[]) if (!props[key]) out.push(`${at} requires ${key}, which it does not have`)
    for (const [key, p] of Object.entries(props)) out.push(...malformed(p, `${at}.${key}`))
  }
  if (schema.type === 'array') out.push(...malformed(schema.items as Schema, `${at}[]`))
  return out
}

const THROW: NewAction = {
  id: 'throw',
  name: 'throw',
  nameFi: 'heitä',
  calls: ['heitä', 'heittää', 'throw'],
  about: 'Picks the thing up if it is not holding it, turns to the target, winds up and throws it so it lands on the target.',
  params: [
    { name: 'thing', kind: 'item', about: 'what to throw', optional: false },
    { name: 'target', kind: 'thing', about: 'who or what to throw at', optional: true },
  ],
}

const BICYCLE: NewItem = {
  id: 'bicycle',
  name: 'bicycle',
  nameFi: 'polkupyörä',
  calls: ['pyörä', 'pyörällä', 'bicycle'],
  about: 'A red bicycle 1.6 m long with two big black wheels, a frame, a seat and handlebars.',
  rough: [
    { shape: 'sphere', size: [0.08, 0.66, 0.66], at: [0, 0.33, 0.55], color: 'black' },
    { shape: 'sphere', size: [0.08, 0.66, 0.66], at: [0, 0.33, -0.55], color: 'black' },
    { shape: 'box', size: [0.08, 0.1, 1.1], at: [0, 0.6, 0], color: 'red' },
  ],
  meta: { carry: 'hug', ride: true, solid: false, wear: 'hand' },
}

const FULL: Plan = {
  heard: 'Make a new girl Ella with curly hair, in the forest',
  heardFi: 'Uusi tyttö Ella, kihara tukka, metsässä',
  who: ['ella'],
  steps: [{ who: 'ella', action: 'wear', args: [{ name: 'thing', value: 'hair-curly' }, { name: 'color', value: 'pink' }] }],
  newActions: [THROW],
  newItems: [BICYCLE],
  create: { id: 'ella', name: 'Ella', calls: ['ella'], pronoun: 'she', look: { body: 'kid', top: 'pink', skirt: true, height: 1.1 } },
  room: 'forest',
  say: 'Hi! I am Ella!',
  sayFi: 'Hei! Olen Ella!',
}

const SMALL: Plan = { heard: 'Eetu jumps', heardFi: 'Eetu hyppää', who: ['steve'], steps: [{ who: 'steve', action: 'jump', args: [] }], newActions: [], newItems: [], say: 'Hop!', sayFi: 'Hyppy!' }

/** The interpreter's prompt and schema: Haiku reads both for every command, so they grow only for a rule that earns it (the last: something done with a thing is one action). */
const INTERPRETER_SIZE = 18_100

describe('schemas', () => {
  it('are strict, typed and described all the way down', () => {
    expect(malformed(PLAN_SCHEMA, 'plan')).toEqual([])
    expect(malformed(ACTION_SCHEMA, 'action')).toEqual([])
    expect(malformed(ITEM_SCHEMA, 'item')).toEqual([])
  })

  it('need exactly the fields the Plan type needs', () => {
    expect(PLAN_SCHEMA.required).toEqual(['heard', 'heardFi', 'who', 'steps', 'newActions', 'newItems', 'say', 'sayFi'])
    expect(Object.keys(PLAN_SCHEMA.properties as object)).toEqual(['heard', 'heardFi', 'who', 'steps', 'newActions', 'newItems', 'create', 'room', 'say', 'sayFi'])
    const props = PLAN_SCHEMA.properties as Record<string, Schema>
    expect((props.newActions!.items as Schema).required).toEqual(['id', 'name', 'nameFi', 'calls', 'about', 'params'])
    expect((props.newItems!.items as Schema).required).toEqual(['id', 'name', 'nameFi', 'calls', 'about', 'rough', 'meta'])
    expect(ACTION_SCHEMA.required).toEqual(['code'])
    expect(ITEM_SCHEMA.required).toEqual(['code'])
    expect(Object.keys(ITEM_SCHEMA.properties as object)).toEqual(['code', 'tick', 'nameFi'])
  })

  it('take plans of every shape', () => {
    expect(problems(PLAN_SCHEMA, FULL)).toEqual([])
    expect(problems(PLAN_SCHEMA, SMALL)).toEqual([])
  })

  it('refuse plans that are not plans', () => {
    expect(problems(PLAN_SCHEMA, { ...SMALL, mood: 'happy' })).toEqual(['plan.mood is not allowed'])
    const noSay: Partial<Plan> = { ...SMALL }
    delete noSay.say
    expect(problems(PLAN_SCHEMA, noSay)).toEqual(['plan.say is missing'])
    const englishOnly: Partial<Plan> = { ...SMALL }
    delete englishOnly.heardFi
    expect(problems(PLAN_SCHEMA, englishOnly)).toEqual(['plan.heardFi is missing'])
    const { nameFi: _verb, ...unnamedAction } = THROW
    const { nameFi: _word, ...unnamedItem } = BICYCLE
    expect(problems(PLAN_SCHEMA, { ...FULL, newActions: [unnamedAction], newItems: [unnamedItem] })).toEqual(['plan.newActions[0].nameFi is missing', 'plan.newItems[0].nameFi is missing'])
    expect(problems(PLAN_SCHEMA, { ...SMALL, room: 'moon' })).toEqual(['plan.room is not one of ["playground","pool","forest"]'])
    expect(problems(PLAN_SCHEMA, { ...FULL, newItems: [{ ...BICYCLE, rough: [{ shape: 'star', size: [1], at: [0, 0, 0], color: 'red' }] }] })).toEqual([
      'plan.newItems[0].rough[0].shape is not one of ["box","sphere","cylinder","cone"]',
    ])
    expect(problems(PLAN_SCHEMA, { ...FULL, newActions: [{ ...THROW, params: [{ ...THROW.params[0], kind: 'vehicle' }] }] })).toEqual([
      'plan.newActions[0].params[0].kind is not one of ["actor","item","thing","place","text","number"]',
    ])
    expect(problems(ITEM_SCHEMA, { code: 'm.box(1, 1, 1)', tick: 3 }, 'item')).toEqual(['item.tick is not a string'])
  })
})

describe('the interpreter', () => {
  it('is told the rules and gets the game, the language it is played in and the words', () => {
    for (const rule of ['ALWAYS ANSWER WITH A PLAN', 'Never refuse', 'NEW ACTIONS', 'NEW ITEMS', 'AVATARS', 'ROOMS', 'GENTLE AND SILLY', 'sayFi', "'kaikki'"]) expect(INTERPRET_SYSTEM).toContain(rule)
    const message = interpretMessage({ words: 'aino heitä pallo eetulle', lang: 'fi', context: 'Room: playground\nActors (id name body pronoun):\n- alice Aino kid she' })
    expect(message).toBe('THE GAME NOW\nRoom: playground\nActors (id name body pronoun):\n- alice Aino kid she\n\nPLAYED IN FINNISH. THE CHILD SAID: "aino heitä pallo eetulle"')
    expect(interpretMessage({ words: 'alice jump', lang: 'en', context: 'Room: pool' })).toContain('PLAYED IN ENGLISH. THE CHILD SAID: "alice jump"')
  })

  it('answers every line for the child in both languages, and the words an avatar says in the game\'s', () => {
    // Played in Finnish, Noora was told to say 'Bath ready? Okay!': text args were always English.
    for (const rule of [
      "heardFi: the same in short simple Finnish",
      'always all four',
      "Words to say and names in text args are short and in the game's language: 'sano hei' is words 'Hei!', 'say hi' is 'Hi!'",
      'Kinds, colours and parts stay English',
      "nameFi: the Finnish verb as said to someone ('heitä')",
      "nameFi: the Finnish word in the nominative ('polkupyörä')",
      'No dashes',
    ])
      expect(INTERPRET_SYSTEM).toContain(rule)
    expect(INTERPRET_SYSTEM).not.toContain('simple English, never the child')
  })

  it('names avatars by id, which is not their name in either language', () => {
    // The starting cast keeps its ids in both languages: alice is Aino in Finnish and Alice in English.
    expect(INTERPRET_SYSTEM).toContain("who and steps use ids exactly as listed, never names: the line 'alice Aino kid she' is Aino, whose id is alice")
    // The examples call the grown-up Mikko and give his id, mike; no rule or example names the cast in one language only.
    expect(INTERPRET_SYSTEM).toContain('avatars include mike (Mikko, grownup, he)')
    expect(INTERPRET_SYSTEM).toContain('"who":["mike"],"steps":[{"who":"mike"')
    for (const name of ['Alice', 'Steve', 'Stevelle', 'Eetu', 'Luna']) expect(INTERPRET_SYSTEM, name).not.toMatch(new RegExp(`\\b${name}\\b`))
  })

  it('is no longer than before the plan had two languages', () => {
    expect(INTERPRET_SYSTEM.length + JSON.stringify(PLAN_SCHEMA).length).toBeLessThanOrEqual(INTERPRETER_SIZE)
  })

  it('is told what went wrong in the live tries', () => {
    // 'rakenna lumiukko' made a snowman-only build; 'tee kärrynpyörä' a wheelbarrow; 'laula laulu' a bubble saying 'laulu'; 'ui' a dive; the skateboard lay along x.
    for (const rule of [
      'never the names or the kinds in this command',
      "A param's about is general too",
      "'tee kärrynpyörä' is a cartwheel",
      "'laula laulu' needs no song",
      "The id is the English of the verb the child said: 'ui' is swim",
      'a skateboard, a sled, a scooter) lies along z',
      'nor what they are made of',
      "a swim never takes 'sukella'",
    ])
      expect(INTERPRET_SYSTEM).toContain(rule)
  })
})

describe('the designer', () => {
  it('is given the whole API for actions and for things', () => {
    for (const doc of [ACTION_DOC, ACTION_RULES, ACTION_EXAMPLE]) expect(ACTION_SYSTEM).toContain(doc)
    for (const doc of [ITEM_DOC, ITEM_RULES, ITEM_EXAMPLE, TICK_DOC]) expect(ITEM_SYSTEM).toContain(doc)
  })

  it('writes every bubble in both languages, a name standing alone', () => {
    expect(ACTION_SYSTEM).toContain("every bubble says both, short and simple: me.say({ en: 'Wheee!', fi: 'Jee!' })")
    expect(ACTION_SYSTEM).toContain('A plain string only for a name or a number')
    expect(ACTION_SYSTEM).toContain("takes no Finnish ending, so it stands alone: me.say({ en: `Bye, ${friend.name}!`, fi: `Hei hei, ${friend.name}!` })")
    // Nowhere in what it reads, the API doc and its example included, does a bubble say one language only.
    const says = [...ACTION_SYSTEM.matchAll(/me\.say\(([^)]*)/g)].map((m) => m[1]!)
    expect(says.length).toBeGreaterThanOrEqual(3)
    for (const said of says) expect(said, said).toMatch(/^\{ en: .*, fi: /)
  })

  it('is told what went wrong in the live tries, and how long to write', () => {
    // From the first review: the only length targets it gets (a long answer took 5 to 7 s more), the snowman-only build, avatars hidden in a tree crown, sizes scaled twice, walkTo misread, tiny held things.
    for (const rule of [
      'at most 30 lines (about 1000 characters)',
      "Never write names or kinds from the child's words",
      'End on top of a thing',
      'never inside it',
      'It never backs away',
      'already include .scale',
    ])
      expect(ACTION_SYSTEM).toContain(rule)
    for (const rule of ['8 to 25 shapes', 'twice their real size', 'already include .scale']) expect(ITEM_SYSTEM).toContain(rule)
  })

  it('gets the spec, the words and the context', () => {
    const req: InventRequest = { kind: 'action', spec: THROW, words: 'alis heitä pallo stiiville', context: 'Room: playground' }
    const message = inventMessage(req)
    expect(message).toContain('Write the action "throw" (throw).')
    expect(message).toContain(THROW.about)
    expect(message).toContain('- args.thing: an item: what to throw')
    expect(message).toContain('- args.target: an actor or an item, optional: who or what to throw at')
    expect(message).toContain('"alis heitä pallo stiiville"')
    expect(message).toContain('Room: playground')
    expect(message).not.toContain('failed')

    const item = inventMessage({ kind: 'item', spec: BICYCLE, words: 'steve aja pyörällä', context: 'Room: forest' })
    expect(item).not.toContain('nameFi')
    expect(item).toContain('Build the thing "bicycle" (bicycle).')
    expect(item).toContain(BICYCLE.about)
    expect(item).toContain(JSON.stringify(BICYCLE.meta))
    expect(item).toContain(JSON.stringify(BICYCLE.rough))
    // The draft is a sketch the designer copied as it was, a skateboard lying along x included.
    expect(item).toMatch(/only a rough sketch: where it breaks the rules above, follow the rules \(a long thing lies along z/)
    expect(ACTION_SYSTEM).toContain('write it for every thing its args can hold (build: a snowman today, a sand castle or a house tomorrow)')
  })

  it('is asked for the Finnish name of a thing that has only its English one', () => {
    // A kind the interpreter used and did not list comes with its English name in both (api.ts's listLostKinds).
    const lost: NewItem = { ...BICYCLE, id: 'christmas-tree', name: 'christmas tree', nameFi: 'christmas tree', calls: ['christmas-tree'], rough: [] }
    expect([lacksFinnishName(lost), lacksFinnishName({ ...lost, nameFi: ' ' }), lacksFinnishName(BICYCLE)]).toEqual([true, true, false])
    expect(inventMessage({ kind: 'item', spec: lost, words: 'eetu aja joulukuusen yli', context: 'Room: forest' })).toContain("give nameFi too, the thing's name in Finnish, nominative")
  })

  it('gets the failed code and its error for a fix', () => {
    const message = inventMessage({ kind: 'action', spec: THROW, words: 'heitä', context: 'Room: pool', fix: { code: 'yield* me.fly()', error: 'TypeError: me.fly is not a function (line 1)' } })
    expect(message).toContain('TypeError: me.fly is not a function (line 1)')
    expect(message).toContain('yield* me.fly()')
    expect(message.indexOf('Room: pool')).toBeLessThan(message.indexOf('yield* me.fly()'))
  })
})
