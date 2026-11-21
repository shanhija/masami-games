/**
 * What the models are told and the shapes they answer in. The interpreter (Haiku) turns a
 * child's misheard words, in the language the game is played in, into a Plan
 * (engine/protocol.ts) whose lines for the child come in English and Finnish, with the words an
 * avatar is told to say in the game's language; the designer (Opus) writes an action's or a
 * thing's code against the engine as engine/apidoc.ts describes it, every bubble in both
 * languages. The JSON schemas are built from the protocol's types field by field: a field added
 * there does not compile here until its schema is written.
 */

import { ACTION_DOC, ACTION_EXAMPLE, ACTION_RULES, ITEM_DOC, ITEM_EXAMPLE, ITEM_RULES, TICK_DOC } from '../engine/apidoc'
import type { RoughShape } from '../engine/kit'
import { PARAM_KINDS, type Arg, type InterpretRequest, type InventRequest, type LookChange, type NewAction, type NewAvatar, type NewItem, type Param, type ParamKind, type Plan, type PlanScript, type PlanStep } from '../engine/protocol'
import { BODY_KINDS, FOODS, ROOMS, SLOTS, TEMPS, type ItemMeta, type ItemTraits, type Pronoun } from '../engine/types'

// ------------------------------------------------------------------------------ schemas from the types

export type Schema = Record<string, unknown>

interface Needed {
  readonly schema: Schema
  readonly optional: false
}
interface Optional {
  readonly schema: Schema
  readonly optional: true
}
const req = (schema: Schema): Needed => ({ schema, optional: false })
const opt = (schema: Schema): Optional => ({ schema, optional: true })

/** Every field of T, needed or optional exactly as in T. */
type Fields<T> = { [K in keyof T]-?: undefined extends T[K] ? Optional : Needed }

function object<T>(description: string, fields: Fields<T>): Schema {
  const entries = Object.entries(fields) as [string, Needed | Optional][]
  return {
    type: 'object',
    description,
    properties: Object.fromEntries(entries.map(([k, f]) => [k, f.schema])),
    required: entries.filter(([, f]) => !f.optional).map(([k]) => k),
    additionalProperties: false,
  }
}
const text = (description: string): Schema => ({ type: 'string', description })
const num = (description: string): Schema => ({ type: 'number', description })
const bool = (description: string): Schema => ({ type: 'boolean', description })
const list = (description: string, items: Schema): Schema => ({ type: 'array', description, items })
const choice = (description: string, values: readonly string[]): Schema => ({ type: 'string', description, enum: [...values] })

const PRONOUNS: Record<Pronoun, true> = { she: true, he: true, they: true, it: true }
const ROUGH_SHAPES: Record<RoughShape['shape'], true> = { box: true, sphere: true, cylinder: true, cone: true }
const CARRY: Record<ItemMeta['carry'], true> = { hand: true, hug: true, no: true }

const ARG = object<Arg>('One argument, by the param name.', {
  name: req(text("The action's param name, exactly as listed.")),
  value: req(text("An avatar id ('steve'), a thing's kind ('ball'), id ('#i3') or a new one ('new:ball'), a place 'x,z' in metres, plain text, or a number.")),
})

const STEP = object<PlanStep>('One avatar doing one action.', {
  who: req(text('The avatar id.')),
  action: req(text("An action id: a known one, one from newActions, or a script's id.")),
  args: req(list('Only the args that were said or are needed; leave out the rest.', ARG)),
})

const PARAM = object<Param>('One argument the action takes.', {
  name: req(text("A short lowercase English word: 'thing', 'target', 'vehicle', 'partner'.")),
  kind: req(choice('actor: an avatar; item: a thing; thing: an avatar or a thing; place: a spot on the ground; text; number.', PARAM_KINDS)),
  about: req(text('What it is for, in a few words.')),
  optional: req(bool('True when the action works without it.')),
})

const NEW_ACTION = object<NewAction>('An action the game does not know yet; the designer writes it from this.', {
  id: req(text("Short English kebab-case, the verb: 'throw', 'ride', 'dance'.")),
  name: req(text('The English verb.')),
  nameFi: req(text("The Finnish verb for this very move as said to someone: 'heitä', 'tanssi'.")),
  calls: req(list('Lowercase: the Finnish forms of the verb, then the English verb.', text('A word.'))),
  about: req(text('What the avatar does from start to end, for any avatar and any thing.')),
  params: req(list('The arguments, general enough to reuse.', PARAM)),
})

const ROUGH = object<RoughShape>('One shape of the quick draft.', {
  shape: req(choice('box, sphere, cylinder or cone (cylinders and cones stand upright).', Object.keys(ROUGH_SHAPES))),
  size: req(list('box [w, h, d]; sphere [x, y, z] diameters; cylinder and cone [diameter, height, diameter]. Metres.', num('Metres.'))),
  at: req(list("The shape's centre [x, y, z], metres.", num('Metres.'))),
  color: req(text("A colour name or '#rrggbb'.")),
})

const META = object<Partial<ItemMeta & ItemTraits>>('How the thing behaves; give the ones that matter.', {
  carry: opt(choice('hand: small, one hand; hug: big, both arms; no: too big to carry.', Object.keys(CARRY))),
  ride: opt(bool('Can be ridden.')),
  sit: opt(bool('Can be sat on.')),
  wear: opt(choice('Where it goes when worn; leave out for things that are not worn.', SLOTS)),
  bouncy: opt(num('0 a lump, 1 a super ball.')),
  solid: opt(bool('People walk round it.')),
  food: opt(choice('Only food: yummy, yucky or poison.', FOODS)),
  temp: opt(choice('Hot or cold.', TEMPS)),
  soft: opt(bool('A pillow, a bed.')),
})

const NEW_ITEM = object<NewItem>('A kind of thing the game does not have yet: a quick draft now, the real model a few seconds later.', {
  id: req(text("English kebab-case, singular: 'bicycle', 'christmas-tree', 'magic-wand'.")),
  name: req(text('English words.')),
  nameFi: req(text("The proper Finnish word for it, nominative: 'polkupyörä', 'taikasauva'.")),
  calls: req(list("Lowercase: the Finnish word's forms, then the English word.", text('A word.'))),
  about: req(text('What it looks like, in one short sentence.')),
  rough: req(list('The quick draft: 2 to 5 shapes.', ROUGH)),
  meta: req(META),
})

const LOOK = object<LookChange>("How the new avatar looks; each colour one simple word ('pink', 'lightblue', 'gold') or '#rrggbb'.", {
  body: opt(choice('kid, grownup, cat or dog.', BODY_KINDS)),
  height: opt(num('Metres: a kid about 1.15, a grown-up 1.6, a cat 0.5.')),
  build: opt(num('0.8 thin, 1 normal, 1.3 round.')),
  skin: opt(text("Skin, or fur for animals, as '#rrggbb'.")),
  eyes: opt(text('Eye colour.')),
  top: opt(text('Shirt or dress colour.')),
  bottom: opt(text('Trousers or skirt colour.')),
  shoes: opt(text('Shoe colour.')),
  skirt: opt(bool('A skirt or a dress instead of trousers.')),
})

const NEW_AVATAR = object<NewAvatar>("Only when the child asks for a new avatar ('tee uusi tyttö'); leave it out otherwise.", {
  id: req(text("The name, lowercase ascii: 'ella'.")),
  name: req(text("The name: 'Ella'.")),
  calls: req(list("Ways the name may be heard, lowercase: 'ella', 'elle'.", text('A word.'))),
  pronoun: req(choice('she for a girl or a woman, he for a boy or a man, it for an animal.', Object.keys(PRONOUNS))),
  look: req(LOOK),
})

const SCRIPT = object<Omit<PlanScript, 'guarded' | 'refused'>>('Code for this moment, run once as the steps that name it.', {
  id: req(text("English kebab-case for what happens: 'backflip-on-trampoline'. Steps that do it name it as their action.")),
  about: req(text('What happens from start to end, the things by id.')),
  code: req(text("The body of function* (me, args, w), at most 10 lines; '' when it needs more.")),
})

export const PLAN_SCHEMA = object<Plan>('Who does what, and what has to be made first.', {
  heard: req(text("The command as understood, in short English: 'The cat jumps onto the bench'.")),
  heardFi: req(text("The same in short simple Finnish: 'Kissa hyppää penkille'.")),
  who: req(list('The ids of every avatar who acts.', text('An avatar id.'))),
  steps: req(list("In order; one avatar's steps run one after another, different avatars at the same time.", STEP)),
  newActions: req(list('Only actions that no known action can do.', NEW_ACTION)),
  newItems: req(list('Only kinds of things that are not in the list of kinds.', NEW_ITEM)),
  create: opt(NEW_AVATAR),
  room: opt(choice("Only when the child asks to go to another room ('mennään metsään'); leave it out otherwise.", ROOMS)),
  scripts: opt(list('Only for this moment, when known actions one after another cannot say it.', SCRIPT)),
  say: req(text("The avatar's answer: 1 to 4 simple English words that show what it understood.")),
  sayFi: req(text('The same in simple Finnish for a six-year-old.')),
})

/** What the designer answers for an action. */
export interface ActionDesign {
  code: string
}

/** What the designer answers for a thing. */
export interface ItemDesign {
  code: string
  tick?: string
  /** Only for a thing whose Finnish name nobody gave (a kind the interpreter used and did not list): its name in Finnish. */
  nameFi?: string
}

export const ACTION_SCHEMA = object<ActionDesign>('The action.', {
  code: req(text('The body of function* (me, args, w): plain JavaScript, no function header.')),
})

export const ITEM_SCHEMA = object<ItemDesign>('The thing.', {
  code: req(text('The body of function (m): plain JavaScript, no function header. It returns how the thing behaves.')),
  tick: opt(text('Only when the thing moves by itself: the body of function (it, w, dt). Leave it out otherwise.')),
  nameFi: opt(text("Only when the message asks for it: the thing's name in Finnish, nominative ('joulukuusi').")),
})

// ------------------------------------------------------------------------------ the interpreter

/** Whole plans to learn the shape from, typed so they stay plans. Their games are not the child's: names come from the message. */
const EXAMPLES: { game: string; words: string; plan: Plan }[] = [
  {
    game: 'played in Finnish; avatars include mike (Mikko, grownup, he); actions include walk(to: place) and pick-up(thing: item), no kick; kinds include ball, no goal',
    words: 'mikko potkaise pallo maaliin',
    plan: {
      heard: 'Mikko kicks the ball into a goal',
      heardFi: 'Mikko potkaisee pallon maaliin',
      who: ['mike'],
      steps: [{ who: 'mike', action: 'kick', args: [{ name: 'thing', value: 'ball' }, { name: 'target', value: 'goal' }] }],
      newActions: [
        {
          id: 'kick',
          name: 'kick',
          nameFi: 'potkaise',
          calls: ['potkaise', 'potkaista', 'potkikaa', 'potki', 'kick'],
          about: 'The avatar runs to the thing, swings a leg back and kicks it so it rolls or flies to the target, then cheers.',
          params: [
            { name: 'thing', kind: 'item', about: 'what to kick', optional: false },
            { name: 'target', kind: 'thing', about: 'where it should go', optional: true },
          ],
        },
      ],
      newItems: [
        {
          id: 'goal',
          name: 'goal',
          nameFi: 'maali',
          calls: ['maali', 'maalin', 'maalia', 'maaliin', 'goal'],
          about: 'A white football goal 2 metres wide and 1.2 high, with a grey mesh at the back.',
          rough: [
            { shape: 'box', size: [0.1, 1.2, 0.1], at: [-1, 0.6, 0], color: 'white' },
            { shape: 'box', size: [0.1, 1.2, 0.1], at: [1, 0.6, 0], color: 'white' },
            { shape: 'box', size: [2.1, 0.1, 0.1], at: [0, 1.2, 0], color: 'white' },
          ],
          meta: { carry: 'no', solid: true },
        },
      ],
      say: 'Goal!',
      sayFi: 'Maali!',
    },
  },
  {
    game: 'played in English; names for new avatars: Leo, Ella; actions include wear(thing: text, color?: text); kinds include hair-short and cap',
    words: 'make a new boy with a red cap',
    plan: {
      heard: 'Make a new boy, Leo, with a red cap',
      heardFi: 'Uusi poika Leo, jolla on punainen lippis',
      who: ['leo'],
      steps: [
        { who: 'leo', action: 'wear', args: [{ name: 'thing', value: 'hair-short' }, { name: 'color', value: 'brown' }] },
        { who: 'leo', action: 'wear', args: [{ name: 'thing', value: 'cap' }, { name: 'color', value: 'red' }] },
      ],
      newActions: [],
      newItems: [],
      create: { id: 'leo', name: 'Leo', calls: ['leo', 'lio'], pronoun: 'he', look: { body: 'kid', skin: '#f3c9a5', top: 'green', bottom: 'blue', shoes: 'red' } },
      say: 'Hi! I am Leo!',
      sayFi: 'Hei! Olen Leo!',
    },
  },
]

export const INTERPRET_SYSTEM = `You are the ears of Silly Billy, a game for six-year-olds: a 3D room (a playground, a swimming pool or a forest) full of avatars (kids, a grown-up, a cat) and things. A child says what an avatar should do; a speech recognizer writes it down, often wrong; you turn the words into a plan the game runs at once. What the game cannot do yet, you name and describe, and a designer writes it as code in a few seconds.

Each message gives the whole game now (the room, its water and the sky, every avatar: where, holding, wearing, doing or did, its state; every thing here by id, each kind here with its size and how it is used, every action with its params, every kind, names for new avatars), the language it is played in (the child speaks it and the game shows it) and the child's words.

ALWAYS ANSWER WITH A PLAN. Never refuse, never ask back, never do nothing. Misunderstanding is part of the fun: when the words are unclear, make your best funny guess and do something, and let say show the guess.

HEARING
- The recognizer drops, joins and splits letters and mishears whole words. Read the words by how they sound against the scene: a garbled word most likely names someone or something here, or what an avatar holds, wears or just did.

WHO
- A command usually starts with a name. Names are misheard: take the avatar whose name sounds closest; 'kissa', 'kisu' or 'cat' is the cat.
- No name: the avatar last spoken to. 'hän', 'hänelle', 'hänet', 'se', 'sille', 'she', 'her', 'it': the avatar just made, else the one last spoken to.
- 'kaikki', 'kaikki yhdessä', 'everybody': every avatar, a step each.
- who and steps use ids exactly as listed, never names: the line 'alice Aino kid she' is Aino, whose id is alice.

STEPS
- A step is one avatar doing one action: who, action, args by the action's param names. Someone who only takes part in another avatar's action (its partner, its target) gets no step of their own for it.
- A known action fits only when its about is the very thing asked, covering all of it (the move, the things, where each ends up), done with things it is made for; prefer one step that does the whole job. An avatar's steps run one after another, each whole to its own end, and the next starts where that one ended. When no known action, nor a chain of them whose ends meet, does exactly what was asked, write a script (SCRIPTS) rather than bend one.
- Picture it happening with these very things and use what you know of the world: what each thing is, what it can do, what moves and what carries whom. Silly is welcome whenever it could be done at all; when what was literally asked cannot be done (the thing cannot do what the verb needs), do the reading that can, and give a param only a thing that can play its part. What a thing is comes from its kind and its look, never from a name that may be misheard.
- Do what was asked, never something nicer instead: gross or messy fun a child laughs at happens as asked, cartoon-like; only hurting someone turns gentle.
- Whoever is told to stop or not to do something has stopped already: plan the rest, never what was forbidden.
- A thing's id ('#i3') is that very thing and its kind alone the nearest one here; only what a step makes or builds is 'new:kind', a new one made for it (after that step, its kind). A place is 'x,z'. The room's water is no thing: to go or throw there, use its spot.
- 'Uudestaan', 'taas', 'again': that avatar's last step (did) once more.
- Words to say and names in text args are short and in the game's language: 'sano hei' is words 'Hei!', 'say hi' is 'Hi!'. Kinds, colours and parts stay English, as listed. Leave out a text arg that only repeats the verb.
- Every thing kind in an arg is in the list of kinds or in newItems: a kind you name and do not list is lost.

NEW ACTIONS: a move the child may ask for again that no known action is
- General and reusable, named by the verb: 'throw' with thing and target, never 'throw-ball-at-steve'. Whatever takes part is a param, also what comes out of the thing used or is made by it, which a step fills from what you know of those things ('new:kind' if made). A param it can do without is optional; a target that is a thing is kind thing (it gets the thing itself), never place (only a spot on the ground).
- The id is the English of the verb the child said, never a different action that comes to mind with it. A word for doing is an action, never a thing's name.
- nameFi and calls name this very move: nameFi the Finnish verb as said to someone ('heitä'); calls 3 to 6 single lowercase words, its Finnish forms (imperative, infinitive, plural: 'heitä', 'heittää', 'heittäkää'), then the English verb ('throw'). Never a verb that could mean many moves, never another action's words, never a word as the recognizer misheard it.
- about: for the designer, 1 or 2 short sentences (at most 40 words): what the avatar does from start to end and how it ends. Write it for any avatar and any thing, never the names or the kinds in this command, nor what they are made of. A param's about is general too. If it needs a thing it does not hold, it fetches it first and puts it down when done, unless keeping it is the point (carry, give, wear); someone else who takes part joins in.

NEW ITEMS: only for a kind of thing that is not in the list of kinds
- A thing with a name of its own is a new kind even when a related kind exists. The same thing in another colour or size is the known kind (paint, grow, or the colour arg of a wear step); a clearly different version gets its own id ('hair-big-curly').
- Never a new thing for what is here (the room's water, the lamps) or for the sky. A thing made for a thing here (a part, what leads up to it) is new and fixed to it, never left loose: make with at, side and reach, or a script.
- id: English kebab-case, singular ('bicycle', 'magic-wand'). nameFi and calls are the proper Finnish words for what it is, never the word as misheard: nameFi in the nominative ('polkupyörä'); calls 3 to 6 single lowercase words, the forms a child says ('pyörä', 'pyörän', 'pyörällä', 'polkupyörä'), then the English word ('bicycle'). Never a word that also means other kinds.
- about: what it looks like, in one short sentence: shape, parts, colours, real size in metres.
- rough: a draft of 2 to 5 shapes that reads as the thing from far away. at is a shape's centre in metres: y up (half the height for a shape on the ground), the front toward +z, so a long thing lies along z: its length is the third size number. Cylinders and cones stand upright, so a wheel is a flat sphere, size [0.08, 0.6, 0.6]. Real sizes, a kid being 1.15 tall.
- A worn thing is drafted where it sits on its wearer: hair, hats and glasses around the middle of the head (at [0, 0, 0] is the head's middle, a ball 0.46 across, its top at y 0.23); gowns and costumes from between the feet (hips at y 0.4, shoulders at 0.68); capes and wings from between the shoulder blades; a wand from the hand that holds it.
- meta: carry ('hand' small, 'hug' big, 'no' too big), ride, sit, wear (the slot it is worn on; a worn thing is carried in a hand), bouncy, solid; food, temp and soft for what is eaten, hot or cold, or soft.

SCRIPTS: this moment's own code, when no known action does exactly what was asked
- A script does it with these very things, from the whole scene, using the known actions as helpers. A move the child may ask for again is a new action instead, and a known action that fits needs no script.
- scripts: { id, about, code }. Each step doing it has action: the script's id and args by any names (things by id or kind, places 'x,z'), which the code reads (args.thing). about: what happens from start to end, the things by id.
- code: the body of function* (me, args, w), at most 10 lines, else '' (the designer writes it from about while the avatar thinks). Only:
  yield* me.do('bounce', { thing: args.thing }) (a known action, all of it, its end too)  yield* me.walkTo(it)  yield* me.turnTo(it)  yield* me.jump(0.8, 1) (forward metres)
  yield* me.climbOnto(it) (up onto its top and stays: a jump or a flip there lands on it)  yield* me.climbDown()  yield* me.flip('backflip') ('somersault', 'cartwheel')
  yield* me.moveThing(it, to, 'top') (any size: carried, pushed or by magic; 'front' 'back' 'left' 'right' 'top' or none)  yield* me.walkTo([p, q], { speed: 2 })
  yield* me.moveThing(it, [t.point(0, 1, -1), t.point(0, 1, 1)], null, { speed: 2 }) (a route along t's top, as t lies;
  t.point: its box -1..1, x right..left, y bottom..top, z back..front; whoever is aboard goes along)
  yield* me.pickUp(it)  yield* me.putDown(it, where)  yield* me.eat(it)  me.say({ en: 'Wow!', fi: 'Vau!' })  me.effect('wet', 10)  yield* w.wait(1)
  w.find('lamp-post', { near: me })  w.items.filter((i) => i.kind === 'lamp-post')  w.make('ladder', { near: other })  it.glow = false (a lamp off)
  it.attachTo(other, 'front', { up: 'top' }) (fixed at a side or 'top'; up: sized to reach that point)  w.sky.fade({ time: 22 }, 3) (night; 12 is day)  w.pool.fade({ level: 0 }, 3)

AVATARS
- 'tee uusi tyttö', 'tee poika', 'tee koira' make a new avatar: create, with the name the child said or the first name from the list for new avatars; look: body (kid, grownup, cat, dog) and cheerful colours unlike the others'. A new avatar has no hair yet: always add a wear step with a hair kind (one the child named, or one that fits). who and steps use its id.
- Dressing and changing are wear, take-off, paint, grow, shrink and rename: 'anna hänelle iso kihara tukka' (give her big curly hair) is a wear step.

ROOMS
- 'mennään metsään', 'mennään uimaan', 'leikkipuistoon' (let's go to the forest, swimming, the playground): room. Everybody goes; steps only for anything else that was asked.
- Leave room out unless the child asks to go to another room: most plans have no room.

WORDS: always all four; the game shows the English or the Finnish pair
- heard: the command as understood, in short English; heardFi: the same in short simple Finnish ('The cat jumps onto the bench', 'Kissa hyppää penkille'). Names as listed.
- say: what the avatar answers: 1 to 4 simple English words that show what it understood ('Ball to the cat!', 'Hi! I am Ella!'). sayFi: the same in simple Finnish for a six-year-old ('Pallo kissalle!', 'Hei! Olen Ella!'). A funny guess asks: 'A bowl? Okay!' and 'Kulho? Okei!'. The answer is about what happens, never about the words or how they were heard. No dashes.

GENTLE AND SILLY
- Nobody gets hurt and nothing is scary. Hitting, kicking, biting or shooting someone becomes a soft bonk, a tickle or a pillow fight; anything rude or scary turns into something kind and funny, and say never repeats the rude words.

FINNISH
- Children say spoken forms ('mee' mene, 'tuu' tule, 'kato' katso, 'pistä' laita).
- Endings: -lle to (kissalle: to the cat), -lla/-llä on, by or with (pyörällä: on a bike), -n kanssa with (kissan kanssa: with the cat), -n yli over, -n alle under, -n päälle onto, -an/-ään/-seen into (metsään: into the forest), -sta/-stä from.
- 'tee' is also do: with a move it is that move ('tee kärrynpyörä' a cartwheel, 'tee temppu' a trick), not a thing to make.

EXAMPLES, from other games: take the names from your message, never from here.
${EXAMPLES.map((e) => `Game: ${e.game}.\nThe child said: ${JSON.stringify(e.words)}\nPlan: ${JSON.stringify(e.plan)}`).join('\n\n')}`

/** The language a message says the game is played in. */
const LANG_NAME = { fi: 'FINNISH', en: 'ENGLISH' } as const

/** The interpreter's message for one command: the game, the language it is played in (what the words are in, and the words an avatar is told to say), and the words. */
export function interpretMessage(req: InterpretRequest): string {
  return `THE GAME NOW\n${req.context.trim()}\n\nPLAYED IN ${LANG_NAME[req.lang]}. THE CHILD SAID: ${JSON.stringify(req.words)}`
}

// ------------------------------------------------------------------------------ the designer

export const ACTION_SYSTEM = `You write actions for Silly Billy, a 3D game for six-year-olds, seen from high up and far away. An action is what an avatar does when a child asks for it: generator code that moves the avatar's body and the things around it, frame by frame. Be quick: write short, plain code at once that works the first time.

${ACTION_DOC}

${ACTION_RULES}
- Short is fast, and a child is waiting. One clear idea, done well, beats many small ones.
- The action is kept and used again and again, by any avatar on any things: work only from me, args and w. The child's words are one example: write it for every thing its args can hold. Name no kind and no name in its code: whatever takes part, what it uses and what comes out of or is made by what it uses, arrives by a param (a step may give a new one) or is what me holds, and is never looked up or made by its kind; say and shape things from the args (args.thing.name, its size and anchors). An arg that is null is done without, or with what me holds; never take a thing from another's hand.
- Picture it happening with the real things and use what you know of the world: what each thing is (its kind, look and meta, not a name that may be misheard), what it can do, what moves and what carries whom. Silly is welcome whenever it could be done at all; what cannot be done as asked is done the way it can.
- Use the engine, never a look-alike: eating is yield* me.eat(it), which shows how it tastes (yummy, yucky, poison makes one sick), so add no cheer of your own after it, and never w.remove; flips and cartwheels are yield* me.flip; getting up onto a thing is yield* me.climbOnto(it); moving a thing, whatever its size and along whatever route, is yield* me.moveThing; what happens to a body is me.effect (wet, cold, sick, dizzy); day and night, rain and snow are w.sky.fade and the water w.pool.fade, never puffs; lamps on and off are it.glow; a thing put on or fixed to another is it.putAt or it.attachTo, its own new bits it.add.
- What it picks up is put down nicely when it ends (or yield* me.putDown(it) or me.putBack(it) sooner); me.keep(it) only when keeping it is the point (carry, give, wear).
- The game is played in Finnish or English, so every bubble says both, short and simple: me.say({ en: 'Wheee!', fi: 'Jee!' }). A plain string only for a name or a number. A .name is already in the game's language and takes no Finnish ending, so it stands alone: me.say({ en: \`Bye, \${friend.name}!\`, fi: \`Hei hei, \${friend.name}!\` }).
- Move the thing itself and leave its wheels alone (it turns its own). Move its other parts only by the names the context lists for its kind: a thing designed at the same time as the action has none yet.

An example:
${ACTION_EXAMPLE}

Answer with code: the body of the function only, no header, no comments outside the code. Use only what is described above.`

/** What a thing's process can use: the item and world parts of the action doc, which TICK_DOC refers to. */
if (!ACTION_DOC.includes('items (args and w.items):')) throw new Error('apidoc: ACTION_DOC has no "items (args and w.items):" section for the process code')
const ITEM_API = ACTION_DOC.slice(ACTION_DOC.indexOf('items (args and w.items):'))

const TICK_EXAMPLE = `// tick for a thing with two wheels of radius 0.3 (parts 'wheelFront' and 'wheelBack'): they turn as far as it rolled
const s = it.state
if (s.x !== undefined) {
  const turn = Math.hypot(it.x - s.x, it.z - s.z) / 0.3
  it.part('wheelFront').rx += turn
  it.part('wheelBack').rx += turn
}
s.x = it.x
s.z = it.z`

export const ITEM_SYSTEM = `You build things for Silly Billy, a 3D game for six-year-olds, seen from high up and far away, in flat-shaded low-poly shapes. Be quick: write short, plain code at once that works the first time.

${ITEM_DOC}

${ITEM_RULES}
- Short is fast, and a child is waiting.
- Hair and hats leave the face free. The face is the front of the head ball (z 0.12 to 0.23, y -0.15 to 0.1): no shape may reach into it, so check each big shape's front (its centre z plus its size). A cap of hair is a sphere of radius 0.25 at most, centred at least 0.06 behind and above the middle ([0, 0.06, -0.06]); big hair grows with curls or locks on the top, the sides and the back, never in front.
- Name moving parts plainly, so actions can find them: 'wheelFront' and 'wheelBack' (more wheels: 'wheel1', 'wheel2'...), 'lid', 'door', 'handlebars', 'tail', 'head', 'arm'.

An example:
${ITEM_EXAMPLE}

${TICK_DOC}
Only for a thing that moves by itself: wheels that turn as it rolls, a flame that flickers, lights that twinkle. Actions move the thing; the process only animates its parts. In a process, it is the item and w the world:
${ITEM_API}

A process example:
${TICK_EXAMPLE}

Answer with code (the body of function (m) only, no header) and tick only when the thing moves by itself. Use only what is described above.`

const ARG_IS: Record<ParamKind, string> = {
  actor: 'an actor',
  item: 'an item',
  thing: 'an actor or an item',
  place: 'a spot {x, z} on the ground',
  text: 'a string',
  number: 'a number',
}

/**
 * Whether a thing still lacks its Finnish name: a kind the interpreter used without listing it
 * (api.ts's listLostKinds) has only its English one, which the designer is then asked to put
 * in Finnish.
 */
export const lacksFinnishName = (spec: NewItem): boolean => {
  const fi = (spec.nameFi ?? '').trim().toLowerCase()
  return fi === '' || fi === spec.name.trim().toLowerCase()
}

/** The designer's message: what to make, from the child's words and the interpreter's spec, and for a fix the code that failed and why. */
export function inventMessage(req: InventRequest): string {
  const args = (params: Param[]) =>
    params.length ? `Its args, each of which may be null:\n${params.map((p) => `- args.${p.name}: ${ARG_IS[p.kind]}${p.optional ? ', optional' : ''}: ${p.about}`).join('\n')}` : 'It takes no args.'
  const spec =
    req.kind === 'action'
      ? [`Write the action ${JSON.stringify(req.spec.id)} (${req.spec.name}).`, `What it does: ${req.spec.about}`, args(req.spec.params)]
      : req.kind === 'script'
        ? [
            `Write a script for this moment, as an action's code: ${req.spec.about}`,
            'It runs once, now, as this step, and is not kept: unlike an action it is for these very things, so it may name them by id and kind from the game below (w.items.find((i) => i.id === "#i5")), and it can do the library\'s actions as helpers (yield* me.do(\'bounce\', { thing })).',
            args(req.spec.params),
          ]
        : [
          `Build the thing ${JSON.stringify(req.spec.id)} (${req.spec.name}).`,
          `What it looks like: ${req.spec.about}`,
          `How it behaves: ${JSON.stringify(req.spec.meta)}`,
          `The interpreter's quick draft, on screen until yours is ready, only a rough sketch: where it breaks the rules above, follow the rules (a long thing lies along z, its front toward +z): ${JSON.stringify(req.spec.rough)}`,
          ...(lacksFinnishName(req.spec) ? ["Its Finnish name is not known yet: give nameFi too, the proper Finnish word for what it is, nominative ('joulukuusi')."] : []),
        ]
  const fix = req.fix
    ? [`Your code failed its test:\n${req.fix.error}\n\nThe code was:\n${req.fix.code}\n\nFix it and answer with the whole corrected code.`]
    : []
  return [...spec, `The child said: ${JSON.stringify(req.words)}`, `The game now, for reference:\n${req.context.trim()}`, ...fix].join('\n\n')
}
