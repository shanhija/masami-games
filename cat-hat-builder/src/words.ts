/**
 * Every word of Cat Hat Builder in both languages, picked by the player's language where it
 * is shown (plans/finnish-and-english.md). The child sees few of them: the cards' words,
 * New!, Good night!, Go! and the pause menu. The rest name the picture buttons for a screen
 * reader: the trays, the room things, the wardrobe's parts and options.
 */

import type { Words } from '../../profiles/src/lang'
import type { ItemId } from './game/items'
import type { HouseKind, Look, Material, Part, RoadKind, Shape, Theme, WearColor } from './game/model'

export const WORDS = {
  // The corner and the back button.
  mirror: { en: 'Mirror', fi: 'Peili' },
  home: { en: 'Home', fi: 'Kotiin' },
  back: { en: 'Back', fi: 'Takaisin' },
  goodNight: { en: 'Good night', fi: 'Hyvää yötä' },
  pause: { en: 'Pause', fi: 'Tauko' },
  // The pause menu.
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  sound: { en: 'Sound', fi: 'Äänet' },
  music: { en: 'Music', fi: 'Musiikki' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
  moreGames: { en: 'More games', fi: 'Muut pelit' },
  startAgain: { en: 'Start again', fi: 'Aloita alusta' },
  // The cards.
  new: { en: 'New!', fi: 'Uusi!' },
  goodNightCard: { en: 'Good night!', fi: 'Hyvää yötä!' },
  // The mirror's foot.
  dice: { en: 'Dice', fi: 'Noppa' },
  undo: { en: 'Undo', fi: 'Peru' },
  go: { en: 'Go!', fi: 'Mennään!' },
  // The road.
  horn: { en: 'Horn', fi: 'Torvi' },
  hitRock: { en: 'Hit the rock', fi: 'Lyö kiveä' },
  drive: { en: 'Go', fi: 'Aja' },
  // The build tray.
  toTruck: { en: 'To the truck', fi: 'Autolle' },
  toMachine: { en: 'To the machine', fi: 'Koneelle' },
  roof: { en: 'Roof', fi: 'Katto' },
  takeBack: { en: 'Take back', fi: 'Ota pois' },
  doorbell: { en: 'Doorbell', fi: 'Ovikello' },
  // The room tray.
  whichRoom: { en: 'Which room?', fi: 'Mikä huone?' },
  paintWall: { en: 'Paint the wall', fi: 'Maalaa seinä' },
  paintFloor: { en: 'Paint the floor', fi: 'Maalaa lattia' },
  anotherRoom: { en: 'Another room', fi: 'Toinen huone' },
} as const

/** The two houses, on their cards. */
export const HOUSE_NAMES: Record<HouseKind, Words> = {
  tall: { en: 'Tall house', fi: 'Kerrostalo' },
  row: { en: 'Row house', fi: 'Rivitalo' },
}

/** The signpost's three roads, on their cards. */
export const ROAD_NAMES: Record<RoadKind, Words> = {
  forest: { en: 'Forest', fi: 'Metsä' },
  beach: { en: 'Beach', fi: 'Ranta' },
  hills: { en: 'Hills', fi: 'Mäet' },
}

/** Every theme's card word, one word or two for a five-year-old. */
export const THEME_NAMES: Record<Theme, Words> = {
  disco: { en: 'Disco', fi: 'Disko' },
  play: { en: 'Play', fi: 'Leikki' },
  ballpit: { en: 'Ball pit', fi: 'Pallomeri' },
  slide: { en: 'Slide', fi: 'Liukumäki' },
  gym: { en: 'Gym', fi: 'Jumppa' },
  sleep: { en: 'Sleep', fi: 'Uni' },
  music: { en: 'Music', fi: 'Musiikki' },
  crafts: { en: 'Crafts', fi: 'Askartelu' },
  cat: { en: 'Cat', fi: 'Kissa' },
  birthday: { en: 'Birthday', fi: 'Synttärit' },
  bath: { en: 'Bath', fi: 'Kylpy' },
  space: { en: 'Space', fi: 'Avaruus' },
  kitchen: { en: 'Kitchen', fi: 'Keittiö' },
  sauna: { en: 'Sauna', fi: 'Sauna' },
}

/** The build tray's materials and shapes. */
export const MATERIAL_NAMES: Record<Material, Words> = {
  planks: { en: 'Planks', fi: 'Laudat' },
  bricks: { en: 'Bricks', fi: 'Tiilet' },
  concrete: { en: 'Concrete', fi: 'Betoni' },
  glass: { en: 'Glass', fi: 'Lasi' },
  rainbow: { en: 'Rainbow blocks', fi: 'Sateenkaaripalikat' },
}
export const SHAPE_NAMES: Record<Shape, Words> = {
  small: { en: 'Small room', fi: 'Pieni huone' },
  wide: { en: 'Wide room', fi: 'Leveä huone' },
  tall: { en: 'Tall room', fi: 'Korkea huone' },
  big: { en: 'Big room', fi: 'Iso huone' },
}

/** Every room thing. */
export const ITEM_NAMES: Record<ItemId, Words> = {
  discoBall: { en: 'Disco ball', fi: 'Diskopallo' },
  neonStar: { en: 'Neon star', fi: 'Neontähti' },
  speaker: { en: 'Speaker', fi: 'Kaiutin' },
  dancer: { en: 'Dancer', fi: 'Tanssija' },
  djDesk: { en: 'DJ desk', fi: 'DJ-pöytä' },
  planeMobile: { en: 'Plane mobile', fi: 'Lentokonemobile' },
  toyShelf: { en: 'Toy shelf', fi: 'Leluhylly' },
  blockTower: { en: 'Block tower', fi: 'Palikkatorni' },
  toyKid: { en: 'Friend with toys', fi: 'Leikkikaveri' },
  rockingHorse: { en: 'Rocking horse', fi: 'Keinuhevonen' },
  cloudLamp: { en: 'Cloud lamp', fi: 'Pilvilamppu' },
  hoop: { en: 'Hoop', fi: 'Koripallokori' },
  ballPit: { en: 'Ball pit', fi: 'Pallomeri' },
  diver: { en: 'Diver', fi: 'Sukeltaja' },
  ballChute: { en: 'Ball chute', fi: 'Pallokouru' },
  paperPlane: { en: 'Paper plane', fi: 'Paperilennokki' },
  sunWindow: { en: 'Sunny window', fi: 'Aurinkoikkuna' },
  bigSlide: { en: 'Big slide', fi: 'Iso liukumäki' },
  slideKid: { en: 'Friend on the slide', fi: 'Kaveri liukumäessä' },
  cushion: { en: 'Cushion', fi: 'Tyyny' },
  rings: { en: 'Rings', fi: 'Renkaat' },
  climbWall: { en: 'Climbing wall', fi: 'Kiipeilyseinä' },
  trampoline: { en: 'Trampoline', fi: 'Trampoliini' },
  bouncer: { en: 'Bouncer', fi: 'Hyppijä' },
  bigBall: { en: 'Big ball', fi: 'Iso pallo' },
  moonMobile: { en: 'Moon mobile', fi: 'Kuumobile' },
  starPoster: { en: 'Star poster', fi: 'Tähtijuliste' },
  bed: { en: 'Bed', fi: 'Sänky' },
  teddyBear: { en: 'Teddy bear', fi: 'Nalle' },
  nightLamp: { en: 'Night lamp', fi: 'Yövalo' },
  noteLights: { en: 'Note lights', fi: 'Nuottivalot' },
  guitar: { en: 'Guitar', fi: 'Kitara' },
  drumKit: { en: 'Drums', fi: 'Rummut' },
  singer: { en: 'Singer', fi: 'Laulaja' },
  piano: { en: 'Piano', fi: 'Piano' },
  paperChain: { en: 'Paper chain', fi: 'Paperiköynnös' },
  painting: { en: 'Painting', fi: 'Maalaus' },
  easel: { en: 'Easel', fi: 'Maalausteline' },
  painter: { en: 'Painter', fi: 'Taiteilija' },
  craftTable: { en: 'Craft table', fi: 'Askartelupöytä' },
  fishLamp: { en: 'Fish lamp', fi: 'Kalalamppu' },
  catShelf: { en: 'Cat shelf', fi: 'Kissahylly' },
  catTree: { en: 'Cat tree', fi: 'Kiipeilypuu' },
  boxCat: { en: 'Cat in a box', fi: 'Kissa laatikossa' },
  yarnBall: { en: 'Ball of yarn', fi: 'Lankakerä' },
  balloons: { en: 'Balloons', fi: 'Ilmapallot' },
  bunting: { en: 'Party flags', fi: 'Juhlaliput' },
  cake: { en: 'Cake', fi: 'Kakku' },
  partyKid: { en: 'Party friend', fi: 'Juhlakaveri' },
  gifts: { en: 'Presents', fi: 'Lahjat' },
  bubbleLamp: { en: 'Bubble lamp', fi: 'Kuplalamppu' },
  towelRack: { en: 'Towels', fi: 'Pyyhkeet' },
  bathtub: { en: 'Bathtub', fi: 'Kylpyamme' },
  bigDuck: { en: 'Big duck', fi: 'Iso ankka' },
  toilet: { en: 'Toilet', fi: 'Vessanpönttö' },
  planets: { en: 'Planets', fi: 'Planeetat' },
  starWindow: { en: 'Star window', fi: 'Tähti-ikkuna' },
  rocket: { en: 'Rocket', fi: 'Raketti' },
  astronaut: { en: 'Astronaut', fi: 'Astronautti' },
  robot: { en: 'Robot', fi: 'Robotti' },
  potLamp: { en: 'Pot lamp', fi: 'Kattilalamppu' },
  jarShelf: { en: 'Jar shelf', fi: 'Purkkihylly' },
  oven: { en: 'Oven', fi: 'Uuni' },
  cook: { en: 'Cook', fi: 'Kokki' },
  stovePot: { en: 'Pot on the stove', fi: 'Kattila liedellä' },
  saunaLamp: { en: 'Sauna lamp', fi: 'Saunalamppu' },
  birchWhisk: { en: 'Birch whisk', fi: 'Vihta' },
  kiuas: { en: 'Sauna stove', fi: 'Kiuas' },
  saunaKid: { en: 'Friend in the sauna', fi: 'Kaveri saunassa' },
  bucket: { en: 'Bucket', fi: 'Kiulu' },
}

/** The wardrobe's tabs. */
export const PART_NAMES: Record<Part, Words> = {
  hat: { en: 'Hat', fi: 'Kypärä' },
  hair: { en: 'Hair', fi: 'Hiukset' },
  skin: { en: 'Skin', fi: 'Iho' },
  glasses: { en: 'Glasses', fi: 'Lasit' },
  shirt: { en: 'Shirt', fi: 'Paita' },
  bag: { en: 'Bag', fi: 'Reppu' },
  pants: { en: 'Trousers', fi: 'Housut' },
  shoes: { en: 'Shoes', fi: 'Kengät' },
  tool: { en: 'Tool', fi: 'Työkalu' },
}

/** The shirt's and the trousers' colours. */
const WEAR_NAMES: Record<WearColor, Words> = {
  red: { en: 'Red', fi: 'Punainen' },
  orange: { en: 'Orange', fi: 'Oranssi' },
  yellow: { en: 'Yellow', fi: 'Keltainen' },
  lime: { en: 'Lime', fi: 'Vaaleanvihreä' },
  green: { en: 'Green', fi: 'Vihreä' },
  teal: { en: 'Teal', fi: 'Turkoosi' },
  blue: { en: 'Blue', fi: 'Sininen' },
  purple: { en: 'Purple', fi: 'Violetti' },
  pink: { en: 'Pink', fi: 'Pinkki' },
  white: { en: 'White', fi: 'Valkoinen' },
}

/** Every option of every field of the look. */
const LOOK_NAMES: { [K in keyof Look]: Record<Look[K], Words> } = {
  hat: {
    yellow: { en: 'Yellow', fi: 'Keltainen' },
    orange: { en: 'Orange', fi: 'Oranssi' },
    red: { en: 'Red', fi: 'Punainen' },
    pink: { en: 'Pink', fi: 'Pinkki' },
    purple: { en: 'Purple', fi: 'Violetti' },
    blue: { en: 'Blue', fi: 'Sininen' },
    green: { en: 'Green', fi: 'Vihreä' },
    white: { en: 'White', fi: 'Valkoinen' },
    none: { en: 'No hat', fi: 'Ei kypärää' },
  },
  hair: {
    short: { en: 'Short hair', fi: 'Lyhyet hiukset' },
    curly: { en: 'Curly hair', fi: 'Kiharat hiukset' },
    long: { en: 'Long hair', fi: 'Pitkät hiukset' },
    ponytail: { en: 'Ponytail', fi: 'Poninhäntä' },
    braids: { en: 'Braids', fi: 'Letit' },
    puffs: { en: 'Puffs', fi: 'Tupsut' },
    spiky: { en: 'Spiky hair', fi: 'Piikkitukka' },
  },
  hairColor: {
    black: { en: 'Black', fi: 'Musta' },
    darkBrown: { en: 'Dark brown', fi: 'Tummanruskea' },
    brown: { en: 'Brown', fi: 'Ruskea' },
    red: { en: 'Red', fi: 'Punainen' },
    ginger: { en: 'Ginger', fi: 'Oranssi' },
    blond: { en: 'Blond', fi: 'Vaalea' },
    pink: { en: 'Pink', fi: 'Pinkki' },
    blue: { en: 'Blue', fi: 'Sininen' },
  },
  skin: {
    0: { en: 'Skin 1', fi: 'Iho 1' },
    1: { en: 'Skin 2', fi: 'Iho 2' },
    2: { en: 'Skin 3', fi: 'Iho 3' },
    3: { en: 'Skin 4', fi: 'Iho 4' },
    4: { en: 'Skin 5', fi: 'Iho 5' },
    5: { en: 'Skin 6', fi: 'Iho 6' },
    6: { en: 'Skin 7', fi: 'Iho 7' },
    7: { en: 'Skin 8', fi: 'Iho 8' },
  },
  shirt: {
    tee: { en: 'T-shirt', fi: 'T-paita' },
    vest: { en: 'Safety vest', fi: 'Huomioliivi' },
    stripes: { en: 'Stripy top', fi: 'Raitapaita' },
    hoodie: { en: 'Hoodie', fi: 'Huppari' },
    dress: { en: 'Dress', fi: 'Mekko' },
    star: { en: 'Star top', fi: 'Tähtipaita' },
  },
  shirtColor: WEAR_NAMES,
  pants: {
    jeans: { en: 'Jeans', fi: 'Farkut' },
    dungarees: { en: 'Dungarees', fi: 'Haalarit' },
    shorts: { en: 'Shorts', fi: 'Shortsit' },
    skirt: { en: 'Skirt', fi: 'Hame' },
    work: { en: 'Work trousers', fi: 'Työhousut' },
  },
  pantsColor: WEAR_NAMES,
  shoes: {
    boots: { en: 'Boots', fi: 'Saappaat' },
    sneakers: { en: 'Sneakers', fi: 'Lenkkarit' },
    wellies: { en: 'Wellies', fi: 'Kumisaappaat' },
    lights: { en: 'Light-up shoes', fi: 'Vilkkukengät' },
    cowboy: { en: 'Cowboy boots', fi: 'Cowboysaappaat' },
  },
  glasses: {
    none: { en: 'No glasses', fi: 'Ei laseja' },
    round: { en: 'Round glasses', fi: 'Pyöreät lasit' },
    sunglasses: { en: 'Sunglasses', fi: 'Aurinkolasit' },
    goggles: { en: 'Goggles', fi: 'Suojalasit' },
    stars: { en: 'Star glasses', fi: 'Tähtilasit' },
    hearts: { en: 'Heart glasses', fi: 'Sydänlasit' },
  },
  bag: {
    none: { en: 'No bag', fi: 'Ei reppua' },
    school: { en: 'School bag', fi: 'Koulureppu' },
    teddy: { en: 'Teddy bag', fi: 'Nallereppu' },
    toolbox: { en: 'Toolbox', fi: 'Työkalupakki' },
    jetpack: { en: 'Jetpack', fi: 'Rakettireppu' },
    cat: { en: 'Cat bag', fi: 'Kissareppu' },
  },
  tool: {
    hammer: { en: 'Hammer', fi: 'Vasara' },
    pickaxe: { en: 'Pickaxe', fi: 'Hakku' },
    drill: { en: 'Drill', fi: 'Pora' },
    shovel: { en: 'Shovel', fi: 'Lapio' },
    wrench: { en: 'Wrench', fi: 'Jakoavain' },
    wand: { en: 'Magic wand', fi: 'Taikasauva' },
  },
}

/** The words of a wardrobe option, which puts on one field of the look. */
export function optionName(patch: Partial<Look>): Words {
  const [field, value] = Object.entries(patch)[0] as [keyof Look, Look[keyof Look]]
  return (LOOK_NAMES[field] as Record<Look[keyof Look], Words>)[value]
}
