import { slotsOf } from './layout'
import type { Shape, SlotKind, Theme } from './model'

/**
 * Every item a room can hold, as data, in one table: its theme, its slot kind, its idle
 * motion and tap reaction (applied by the renderer around the item's own drawing, from
 * draw/motion.ts), its sound, and whether it is a friend (a child drawn by the builder rig,
 * or a pet). The art for each item is in draw/rooms/*.ts, typed so the compiler rejects a
 * missing or extra drawing. Ids are save keys: never rename one, only add.
 *
 * Each theme lists its items in this order: the ceiling item, the wall item, the hero floor
 * item, the friend, the second floor item. The default layout fills a room's slots in that
 * order, so a small room (two floor slots) gets the hero and the friend.
 */

/** The idle loops the renderer applies, all calm: none, an up-down bob, a side-to-side sway (about the anchor), a gentle size pulse, a pendulum swing from the top. A turn is only ever a tap's reaction, since a turning thing shows edge-on half the time. */
export type Idle = 'still' | 'bob' | 'sway' | 'pulse' | 'swing'
/** The tap reactions the renderer applies: a hop, a full turn, a shake, a grow-and-settle, a lift off and back; 'own' applies nothing and leaves the reaction to the item's drawing (it gets `play`). */
export type TapMotion = 'hop' | 'spin' | 'shake' | 'grow' | 'launch' | 'own'
/** The item sounds sounds.ts synthesises. */
export const ITEM_SOUNDS = [
  'sparkle', 'zap', 'boom', 'scratch', 'cheer', 'whoosh', 'rattle', 'blocks', 'squeak', 'giggle', 'ting', 'swish', 'splash', 'roll', 'whee', 'boing',
  'clack', 'chime', 'twinkle', 'yawn', 'drum', 'note', 'twang', 'brush', 'meow', 'purr', 'pop', 'blow', 'beep', 'rocket', 'ding', 'bubble', 'clink', 'flush', 'quack', 'hiss',
] as const
export type ItemSound = (typeof ITEM_SOUNDS)[number]

interface ItemDef {
  theme: Theme
  slot: SlotKind
  idle: Idle
  tap: TapMotion
  sound: ItemSound
  friend: boolean
}

/** Generic in the theme, so each entry keeps its own theme literal and ItemOf<T> can pick a theme's items. */
const thing = <T extends Theme>(theme: T, slot: SlotKind, idle: Idle, tap: TapMotion, sound: ItemSound) => ({ theme, slot, idle, tap, sound, friend: false })
const friend = <T extends Theme>(theme: T, idle: Idle, tap: TapMotion, sound: ItemSound) => ({ theme, slot: 'floor' as const, idle, tap, sound, friend: true })

export const ITEMS = {
  // Disco: the mirror ball throws light spots, the speaker thumps, the DJ desk's records turn, a friend dances.
  discoBall: thing('disco', 'ceiling', 'still', 'own', 'sparkle'),
  neonStar: thing('disco', 'wall', 'pulse', 'grow', 'zap'),
  speaker: thing('disco', 'floor', 'pulse', 'launch', 'boom'),
  dancer: friend('disco', 'still', 'own', 'cheer'),
  djDesk: thing('disco', 'floor', 'still', 'shake', 'scratch'),
  // Play: a plane mobile, a shelf of toys, a block tower that topples and builds itself again, a friend with a toy car, a rocking horse.
  planeMobile: thing('play', 'ceiling', 'swing', 'spin', 'whoosh'),
  toyShelf: thing('play', 'wall', 'still', 'shake', 'rattle'),
  blockTower: thing('play', 'floor', 'still', 'own', 'blocks'),
  toyKid: friend('play', 'still', 'own', 'giggle'),
  rockingHorse: thing('play', 'floor', 'still', 'own', 'squeak'),
  // Ball pit: a cloud lamp, a basketball hoop, the pit of balls, a friend who dives in and pops up, a chute that rolls balls in.
  cloudLamp: thing('ballpit', 'ceiling', 'swing', 'grow', 'ting'),
  hoop: thing('ballpit', 'wall', 'still', 'shake', 'swish'),
  ballPit: thing('ballpit', 'floor', 'still', 'own', 'splash'),
  diver: friend('ballpit', 'still', 'own', 'whee'),
  ballChute: thing('ballpit', 'floor', 'still', 'own', 'roll'),
  // Slide: a paper plane, a sunny window, the big slide with a rider, a friend waving at the bottom, a landing cushion.
  paperPlane: thing('slide', 'ceiling', 'swing', 'spin', 'whoosh'),
  sunWindow: thing('slide', 'wall', 'still', 'grow', 'ting'),
  bigSlide: thing('slide', 'floor', 'still', 'own', 'whee'),
  slideKid: friend('slide', 'still', 'own', 'giggle'),
  cushion: thing('slide', 'floor', 'still', 'own', 'boing'),
  // Gym: rings, a climbing wall, a trampoline, a friend doing jumping jacks, a big bouncy ball.
  rings: thing('gym', 'ceiling', 'swing', 'own', 'whoosh'),
  climbWall: thing('gym', 'wall', 'still', 'shake', 'clack'),
  trampoline: thing('gym', 'floor', 'still', 'own', 'boing'),
  bouncer: friend('gym', 'still', 'own', 'cheer'),
  bigBall: thing('gym', 'floor', 'still', 'own', 'boing'),
  // Sleep: a moon mobile, a star poster, a bed with a friend asleep in it, a teddy bear, a night lamp.
  moonMobile: thing('sleep', 'ceiling', 'still', 'own', 'chime'),
  starPoster: thing('sleep', 'wall', 'still', 'grow', 'twinkle'),
  bed: thing('sleep', 'floor', 'still', 'own', 'yawn'),
  teddyBear: friend('sleep', 'sway', 'hop', 'squeak'),
  nightLamp: thing('sleep', 'floor', 'still', 'grow', 'ting'),
  // Music: note lights, a guitar on the wall, a drum kit, a friend singing, a piano. Every note is on one five-note scale.
  noteLights: thing('music', 'ceiling', 'swing', 'spin', 'note'),
  guitar: thing('music', 'wall', 'still', 'shake', 'twang'),
  drumKit: thing('music', 'floor', 'still', 'own', 'drum'),
  singer: friend('music', 'still', 'own', 'note'),
  piano: thing('music', 'floor', 'still', 'own', 'note'),
  // Crafts: a paper chain, a painting, an easel that paints a new picture each tap, a friend painting, a table of crayons and glitter.
  paperChain: thing('crafts', 'ceiling', 'still', 'own', 'swish'),
  painting: thing('crafts', 'wall', 'still', 'grow', 'ting'),
  easel: thing('crafts', 'floor', 'still', 'own', 'brush'),
  painter: friend('crafts', 'still', 'own', 'giggle'),
  craftTable: thing('crafts', 'floor', 'still', 'shake', 'rattle'),
  // Cat: a fish lamp, a cat on a wall shelf, a cat tree with two cats, a cat in a box who pops out, a ball of yarn.
  fishLamp: thing('cat', 'ceiling', 'swing', 'shake', 'ting'),
  catShelf: thing('cat', 'wall', 'still', 'own', 'meow'),
  catTree: thing('cat', 'floor', 'still', 'own', 'meow'),
  boxCat: friend('cat', 'still', 'own', 'meow'),
  yarnBall: thing('cat', 'floor', 'still', 'own', 'purr'),
  // Birthday: balloons, bunting, a cake whose candles blow out and light again, a friend in a party hat, a pile of gifts.
  balloons: thing('birthday', 'ceiling', 'still', 'own', 'pop'),
  bunting: thing('birthday', 'wall', 'sway', 'shake', 'cheer'),
  cake: thing('birthday', 'floor', 'still', 'own', 'blow'),
  partyKid: friend('birthday', 'still', 'own', 'cheer'),
  gifts: thing('birthday', 'floor', 'still', 'own', 'pop'),
  // Bath: a bubble lamp, a towel rack, a bubble bath with a duck, a big rubber duck, a toilet that flushes with a swirl.
  bubbleLamp: thing('bath', 'ceiling', 'bob', 'grow', 'bubble'),
  towelRack: thing('bath', 'wall', 'sway', 'shake', 'swish'),
  bathtub: thing('bath', 'floor', 'still', 'own', 'splash'),
  bigDuck: friend('bath', 'bob', 'hop', 'quack'),
  toilet: thing('bath', 'floor', 'still', 'own', 'flush'),
  // Space: planets on strings, a window of stars, a rocket that lifts off and lands, a floating astronaut friend, a robot.
  planets: thing('space', 'ceiling', 'sway', 'spin', 'whoosh'),
  starWindow: thing('space', 'wall', 'pulse', 'grow', 'twinkle'),
  rocket: thing('space', 'floor', 'still', 'own', 'rocket'),
  astronaut: friend('space', 'still', 'own', 'giggle'),
  robot: thing('space', 'floor', 'sway', 'hop', 'beep'),
  // Kitchen: a pot lamp, a shelf of jars, an oven where a cake rises, a friend baking, a pot bubbling on the stove.
  potLamp: thing('kitchen', 'ceiling', 'swing', 'shake', 'ting'),
  jarShelf: thing('kitchen', 'wall', 'still', 'shake', 'clink'),
  oven: thing('kitchen', 'floor', 'still', 'own', 'ding'),
  cook: friend('kitchen', 'still', 'own', 'giggle'),
  stovePot: thing('kitchen', 'floor', 'still', 'own', 'bubble'),
  // Sauna: a sauna lamp, a birch whisk on the wall, the stove that hisses steam, a friend on the bench, a bucket and ladle.
  saunaLamp: thing('sauna', 'ceiling', 'still', 'grow', 'ting'),
  birchWhisk: thing('sauna', 'wall', 'sway', 'shake', 'swish'),
  kiuas: thing('sauna', 'floor', 'still', 'own', 'hiss'),
  saunaKid: friend('sauna', 'still', 'own', 'giggle'),
  bucket: thing('sauna', 'floor', 'still', 'own', 'splash'),
} as const satisfies Record<string, ItemDef>

export type ItemId = keyof typeof ITEMS
/** The ids of theme T's items. */
export type ItemOf<T extends Theme> = { [K in ItemId]: (typeof ITEMS)[K]['theme'] extends T ? K : never }[ItemId]
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[]
export const isItem = (s: string): s is ItemId => Object.hasOwn(ITEMS, s)
/** A theme's items in their listed order. */
export const themeItems = (t: Theme): ItemId[] => ITEM_IDS.filter((id) => ITEMS[id].theme === t)

/** The items a freshly themed room gets, by slot: each kind's slots take the theme's items of that kind in order, the rest stay empty. */
export function defaultItems(theme: Theme, shape: Shape): (ItemId | null)[] {
  const queue: Record<SlotKind, ItemId[]> = { ceiling: [], wall: [], floor: [] }
  for (const id of themeItems(theme)) queue[ITEMS[id].slot].push(id)
  return slotsOf(shape).map((slot) => queue[slot.kind].shift() ?? null)
}
