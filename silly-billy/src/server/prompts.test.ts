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

/**
 * The interpreter's prompt and schema: the interpreter reads both for every command, so they grow only for a rule that earns it. Since the
 * second play of 2026-11-09 they state principles, not the cases that taught them (the game is meant to meet requests nobody
 * foresaw): the size came down from 21,405 to 21,240 with the new engine calls in it, and stayed there when one principle of
 * world knowledge ("can it be done") took the place of the role lists (Sami: "that list would grow uncontrollably").
 */
const INTERPRETER_SIZE = 21_240

describe('schemas', () => {
  it('are strict, typed and described all the way down', () => {
    expect(malformed(PLAN_SCHEMA, 'plan')).toEqual([])
    expect(malformed(ACTION_SCHEMA, 'action')).toEqual([])
    expect(malformed(ITEM_SCHEMA, 'item')).toEqual([])
  })

  it('need exactly the fields the Plan type needs', () => {
    expect(PLAN_SCHEMA.required).toEqual(['heard', 'heardFi', 'who', 'steps', 'newActions', 'newItems', 'say', 'sayFi'])
    expect(Object.keys(PLAN_SCHEMA.properties as object)).toEqual(['heard', 'heardFi', 'who', 'steps', 'newActions', 'newItems', 'create', 'room', 'scripts', 'say', 'sayFi'])
    expect(((PLAN_SCHEMA.properties as Record<string, Schema>).scripts!.items as Schema).required).toEqual(['id', 'about', 'code'])
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
      "nameFi the Finnish verb as said to someone ('heitä')",
      "nameFi in the nominative ('polkupyörä')",
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

  it('grows only for a rule that earns it', () => {
    expect(INTERPRET_SYSTEM.length + JSON.stringify(PLAN_SCHEMA).length).toBeLessThanOrEqual(INTERPRETER_SIZE)
  })

  it('is told what went wrong in the live tries, as principles', () => {
    // 'rakenna lumiukko' made a snowman-only build; 'tee kärrynpyörä' a wheelbarrow; 'laula laulu' a bubble saying 'laulu'; 'ui' a dive; the skateboard lay along x.
    for (const rule of [
      'never the names or the kinds in this command',
      "A param's about is general too",
      "'tee' is also do: with a move it is that move ('tee kärrynpyörä' a cartwheel",
      'Leave out a text arg that only repeats the verb',
      'The id is the English of the verb the child said, never a different action that comes to mind with it',
      'so a long thing lies along z',
      'nor what they are made of',
      "never another action's words",
    ])
      expect(INTERPRET_SYSTEM).toContain(rule)
  })

  it('writes a script for this moment when no known action does exactly what was asked, with the few calls it may use', () => {
    for (const rule of [
      "SCRIPTS: this moment's own code, when no known action does exactly what was asked",
      'A script does it with these very things, from the whole scene, using the known actions as helpers',
      'A move the child may ask for again is a new action instead, and a known action that fits needs no script',
      "code: the body of function* (me, args, w), at most 10 lines, else '' (the designer writes it from about while the avatar thinks)",
      "yield* me.do('bounce', { thing: args.thing })",
      "yield* me.flip('backflip')",
      'yield* me.climbOnto(it) (up onto its top and stays: a jump or a flip there lands on it)',
      "yield* me.moveThing(it, to, 'top') (any size: carried, pushed or by magic",
      "yield* me.moveThing(it, [t.point(0, 1, -1), t.point(0, 1, 1)], null, { speed: 2 }) (a route along t's top, as t lies",
      "t.point: its box -1..1",
      'whoever is aboard goes along',
      'yield* me.walkTo([p, q], { speed: 2 })',
      "it.attachTo(other, 'front', { up: 'top' })",
      'w.sky.fade({ time: 22 }, 3)',
      'food, temp and soft for what is eaten, hot or cold, or soft',
    ])
      expect(INTERPRET_SYSTEM).toContain(rule)
  })

  it('states principles, not the cases that taught them (the second play of 2026-11-09)', () => {
    // "pudota uimarengas" with the ring on became a jump to the pond; the answer said what was misheard; a water slide too big to
    // carry went to put-on; a train track was driven like a car; a slide from the treehouse rebuilt the playground's own slide; a
    // hula hoop action was called 'käytä'; a misheard word became a thing's Finnish name.
    for (const rule of [
      'Read the words by how they sound against the scene: a garbled word most likely names someone or something here, or what an avatar holds, wears or just did',
      'never about the words or how they were heard',
      'A known action fits only when its about is the very thing asked, covering all of it (the move, the things, where each ends up)',
      'write a script (SCRIPTS) rather than bend one',
      'Picture it happening with these very things and use what you know of the world: what each thing is, what it can do, what moves and what carries whom',
      'Silly is welcome whenever it could be done at all; when what was literally asked cannot be done (the thing cannot do what the verb needs), do the reading that can',
      'What a thing is comes from its kind and its look, never from a name that may be misheard',
      "only what a step makes or builds is 'new:kind', a new one made for it",
      "Whatever takes part is a param, also what comes out of the thing used or is made by it, which a step fills from what you know of those things ('new:kind' if made)",
      'Never a verb that could mean many moves, never another action\'s words, never a word as the recognizer misheard it',
      'nameFi and calls are the proper Finnish words for what it is, never the word as misheard',
    ])
      expect(INTERPRET_SYSTEM).toContain(rule)
    // No case from that play, nor this morning's, is in the prompt: the principles meet requests nobody foresaw.
    for (const gone of ['uimarengas', 'tiejyrä', 'junarata', 'vesiliukumäki', 'puumaja', 'käytä', 'siirrä', 'trampoliin', 'kuperkeikka', 'ryhmähali', 'tammenterho', 'udota', 'keiluun', 'sukella'])
      expect(INTERPRET_SYSTEM, gone).not.toContain(gone)
    // Nor a list of roles or Sami's own examples of the principle ("you really can't drive a train track, since it doesn't move. but you can ride a chicken"), in either prompt.
    for (const gone of ['train track', 'train-track', 'junarata', 'chicken', 'kana', 'ridden, sat on', 'too big to carry, or food'])
      for (const prompt of [INTERPRET_SYSTEM, ACTION_SYSTEM]) expect(prompt, gone).not.toContain(gone)
    // Nor what a made action hard-coded: the net cannon that fired a ball (Sami: "the net cannon isn't a net. it's a ball").
    for (const prompt of [INTERPRET_SYSTEM, ACTION_SYSTEM, ITEM_SYSTEM]) {
      expect(prompt).not.toMatch(/(?<!\p{L})nets?(?!\p{L})/iu)
      for (const gone of ['verkko', 'cannon']) expect(prompt.toLowerCase(), gone).not.toContain(gone)
    }
  })

  it('is told what went wrong in the play of 2026-11-09, as principles', () => {
    // bounce then flip played the flip on the grass; 'kuperkeikka' became the flip, 'ryhmähali' a hula hoop, 'tammenterho' a pinecone,
    // "heitä se lampeen" a new pond beside the forest's, 'sammuta valot' a new lamp post, a door and stairs lay loose beside the house;
    // 'udota' (pudota) became a swim and 'keiluun' (keinuun, with a swing there) bowling.
    for (const rule of [
      'each whole to its own end, and the next starts where that one ended',
      "A thing's id ('#i3') is that very thing",
      "The room's water is no thing: to go or throw there, use its spot",
      'A known action fits only when its about is the very thing asked',
      'A word for doing is an action, never a thing\'s name',
      'A thing with a name of its own is a new kind even when a related kind exists',
      "Never a new thing for what is here (the room's water, the lamps) or for the sky",
      'is new and fixed to it, never left loose: make with at, side and reach, or a script',
      'The recognizer drops, joins and splits letters and mishears whole words',
      'puts it down when done, unless keeping it is the point (carry, give, wear)',
      // "Aino, joo se uuderaa!" (tee se uudelleen) after everyone danced had her jump rope like Noora
      "'Uudestaan', 'taas', 'again': that avatar's last step (did) once more.",
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
      'Name no kind and no name in its code',
      'End on top of a thing',
      'never inside it',
      'It never backs away',
      'already include .scale',
    ])
      expect(ACTION_SYSTEM).toContain(rule)
    for (const rule of ['8 to 25 shapes', 'twice their real size', 'already include .scale']) expect(ITEM_SYSTEM).toContain(rule)
  })

  it('is told what went wrong in the made code of 2026-11-09', () => {
    // eat looked for a sausage when given nothing; scoop and fill tipped the excavator over like a bucket; a poisonous mushroom was
    // eaten up happily; the rope, the kite, the bucket, the stick and the paper stayed in the hand after.
    for (const rule of [
      'whatever takes part, what it uses and what comes out of or is made by what it uses, arrives by a param (a step may give a new one) or is what me holds, and is never looked up or made by its kind',
      'An arg that is null is done without, or with what me holds',
      'Picture it happening with the real things and use what you know of the world: what each thing is (its kind, look and meta, not a name that may be misheard), what it can do, what moves and what carries whom',
      'Silly is welcome whenever it could be done at all; what cannot be done as asked is done the way it can',
      'getting up onto a thing is yield* me.climbOnto(it); moving a thing, whatever its size and along whatever route, is yield* me.moveThing',
      'me.keep(it) only when keeping it is the point (carry, give, wear)',
    ])
      expect(ACTION_SYSTEM).toContain(rule)
    expect(ACTION_SYSTEM).not.toContain('is found (w.find) or made (w.make) by kind')
  })

  it("uses the engine's own ways, never a look-alike: the part-one guesses are gone", () => {
    // The made change faked night with puffs; the poisonous mushroom was a guess by its looks; a door lay loose by the house.
    for (const rule of [
      'eating is yield* me.eat(it), which shows how it tastes (yummy, yucky, poison makes one sick), so add no cheer of your own after it',
      'flips and cartwheels are yield* me.flip',
      'what happens to a body is me.effect',
      'day and night, rain and snow are w.sky.fade and the water w.pool.fade, never puffs',
      'lamps on and off are it.glow',
      'is it.putAt or it.attachTo',
      'yield* .do(action, args)',
    ])
      expect(ACTION_SYSTEM).toContain(rule)
    for (const gone of ['the red one with white dots', 'me.drop()']) expect(ACTION_SYSTEM).not.toContain(gone)
  })

  it('writes a script for this moment, which may name the things here', () => {
    const message = inventMessage({ kind: 'script', spec: { ...THROW, id: 'moment-7-backflip-on-trampoline', calls: [], about: 'Aino bounces on #i5 and does a backflip up there.' }, words: 'aino hyppää trampoliinilla ja tee voltti', context: 'Room: forest' })
    expect(message).toContain('Write a script for this moment, as an action\'s code: Aino bounces on #i5 and does a backflip up there.')
    expect(message).toContain('it may name them by id and kind')
    expect(message).toContain("yield* me.do('bounce', { thing })")
    expect(message).toContain('- args.thing: an item: what to throw')
    expect(message).toContain('Room: forest')
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
    expect(ACTION_SYSTEM).toContain('write it for every thing its args can hold')
  })

  it('is asked for the Finnish name of a thing that has only its English one', () => {
    // A kind the interpreter used and did not list comes with its English name in both (api.ts's listLostKinds).
    const lost: NewItem = { ...BICYCLE, id: 'christmas-tree', name: 'christmas tree', nameFi: 'christmas tree', calls: ['christmas-tree'], rough: [] }
    expect([lacksFinnishName(lost), lacksFinnishName({ ...lost, nameFi: ' ' }), lacksFinnishName(BICYCLE)]).toEqual([true, true, false])
    expect(inventMessage({ kind: 'item', spec: lost, words: 'eetu aja joulukuusen yli', context: 'Room: forest' })).toContain('give nameFi too, the proper Finnish word for what it is, nominative')
  })

  it('gets the failed code and its error for a fix', () => {
    const message = inventMessage({ kind: 'action', spec: THROW, words: 'heitä', context: 'Room: pool', fix: { code: 'yield* me.fly()', error: 'TypeError: me.fly is not a function (line 1)' } })
    expect(message).toContain('TypeError: me.fly is not a function (line 1)')
    expect(message).toContain('yield* me.fly()')
    expect(message.indexOf('Room: pool')).toBeLessThan(message.indexOf('yield* me.fly()'))
  })
})
