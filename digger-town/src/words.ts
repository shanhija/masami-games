/**
 * Every word of Digger Town in both languages: the title, the HUD's cards and buttons, the
 * parent's pause card with its key help, the ranks, and the names of the machines, builders,
 * paints and hats (what a screen reader says for their buttons). The words the game hears are
 * the parser's own (`game/speech.ts`); the words to try here are ones it understands.
 */

import type { Words } from '../../profiles/src/lang'
import type { DriverSpecies, HatColour, MachineKind, PaintId, PlaceId, Picture, RankId } from './game/model'

/** The logo, a word to a line: the second line ends with a digger. */
export const LOGO: readonly [Words, Words] = [
  { en: 'DIGGER', fi: 'KAIVURI' },
  { en: 'TOWN', fi: 'KYLÄ' },
]

/** What a child calls each machine: its button, its word to try on the pause card, the word shown when the game wants it, and what the voice bot says for it. */
export const MACHINE_NAMES: Record<MachineKind, Words> = {
  digger: { en: 'digger', fi: 'kaivuri' },
  dumper: { en: 'dump truck', fi: 'kippiauto' },
  dozer: { en: 'bulldozer', fi: 'puskutraktori' },
  roller: { en: 'roller', fi: 'jyrä' },
  mixer: { en: 'cement mixer', fi: 'betoniauto' },
  forklift: { en: 'forklift', fi: 'trukki' },
  tower: { en: 'tower crane', fi: 'nosturi' },
  semi: { en: 'lorry', fi: 'rekka' },
  mobile: { en: 'truck crane', fi: 'autonosturi' },
}

/** The places among the words to try, after the machines. */
export const PLACES_TO_TRY: readonly { place: Extract<PlaceId, Picture>; word: Words }[] = [
  { place: 'sand', word: { en: 'sand', fi: 'hiekka' } },
  { place: 'rock', word: { en: 'rock', fi: 'kivi' } },
  { place: 'hole', word: { en: 'hole', fi: 'kuoppa' } },
  { place: 'road', word: { en: 'road', fi: 'tie' } },
  { place: 'water', word: { en: 'water', fi: 'vesi' } },
  { place: 'house', word: { en: 'house', fi: 'talo' } },
  { place: 'bridge', word: { en: 'bridge', fi: 'silta' } },
]

/** The rank the stars have earned, by name on the pause card. */
export const RANK_NAMES: Record<RankId, Words> = {
  helper: { en: 'Helper', fi: 'Apuri' },
  builder: { en: 'Builder', fi: 'Rakentaja' },
  bigBuilder: { en: 'Big Builder', fi: 'Iso rakentaja' },
  boss: { en: 'Boss', fi: 'Pomo' },
  golden: { en: 'Golden Builder', fi: 'Kultainen rakentaja' },
}

export const SPECIES_NAMES: Record<DriverSpecies, Words> = {
  bunny: { en: 'Bunny', fi: 'Pupu' },
  cat: { en: 'Cat', fi: 'Kissa' },
  dog: { en: 'Dog', fi: 'Koira' },
  fox: { en: 'Fox', fi: 'Kettu' },
  bear: { en: 'Bear', fi: 'Karhu' },
  frog: { en: 'Frog', fi: 'Sammakko' },
}

export const PAINT_NAMES: Record<PaintId, Words> = {
  yellow: { en: 'Yellow', fi: 'Keltainen' },
  orange: { en: 'Orange', fi: 'Oranssi' },
  red: { en: 'Red', fi: 'Punainen' },
  blue: { en: 'Blue', fi: 'Sininen' },
  green: { en: 'Green', fi: 'Vihreä' },
  pink: { en: 'Pink', fi: 'Pinkki' },
  purple: { en: 'Purple', fi: 'Violetti' },
  white: { en: 'White', fi: 'Valkoinen' },
  gold: { en: 'Gold', fi: 'Kulta' },
}

export const HAT_NAMES: Record<HatColour, Words> = {
  '#ffd23f': { en: 'Yellow hat', fi: 'Keltainen kypärä' },
  '#ff7f50': { en: 'Orange hat', fi: 'Oranssi kypärä' },
  '#ff6fa8': { en: 'Pink hat', fi: 'Pinkki kypärä' },
  '#5ec8ff': { en: 'Blue hat', fi: 'Sininen kypärä' },
  '#7fe07a': { en: 'Green hat', fi: 'Vihreä kypärä' },
  '#ffffff': { en: 'White hat', fi: 'Valkoinen kypärä' },
}

/** The title, the play's buttons and cards, the mic and the shop. */
export const HUD = {
  go: { en: 'Go!', fi: 'Mennään!' },
  paintShop: { en: 'Paint shop', fi: 'Maalikauppa' },
  back: { en: 'Back', fi: 'Takaisin' },
  pause: { en: 'Pause', fi: 'Tauko' },
  sound: { en: 'Sound', fi: 'Äänet' },
  next: { en: 'Next', fi: 'Seuraava' },
  theEnd: { en: 'The End', fi: 'Loppu' },
  hooray: { en: 'Hooray!', fi: 'Hurraa!' },
  work: { en: 'Do the job', fi: 'Tee työ' },
  microphone: { en: 'Microphone', fi: 'Mikrofoni' },
  horn: { en: 'Horn', fi: 'Torvi' },
  micBlocked: { en: 'Mic blocked', fi: 'Mikki estetty' },
  cantHear: { en: 'Can’t hear', fi: 'Ei kuule' },
} as const

/** The pause card, which is mostly for the parent. */
export const PAUSE = {
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  music: { en: 'Music', fi: 'Musiikki' },
  sound: { en: 'Sound', fi: 'Äänet' },
  easy: { en: 'Easy', fi: 'Helppo' },
  pro: { en: 'Pro', fi: 'Pro' },
  paint: { en: 'Paint', fi: 'Maalaa' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
  moreGames: { en: 'More games', fi: 'Muut pelit' },
  trySaying: { en: 'Try saying', fi: 'Kokeile sanoa' },
  saveTrouble: { en: 'Part of the old save could not be read. A copy is kept.', fi: 'Osaa vanhasta pelistä ei voitu lukea. Siitä on tallessa kopio.' },
  newGame: { en: 'Hold: new game', fi: 'Pidä: uusi peli' },
  newGameLabel: { en: 'Hold to start a new game', fi: 'Pidä painettuna, niin uusi peli alkaa' },
  oldTown: { en: 'Hold: old town back', fi: 'Pidä: vanha kylä takaisin' },
  oldTownLabel: { en: 'Hold to get the old town back', fi: 'Pidä painettuna, niin vanha kylä palaa' },
} as const

/** What the parent is told for each reason the recognizer gave for stopping. */
export const VOICE_TROUBLE: Record<string, Words> = {
  'not-allowed': { en: 'The microphone is blocked. Allow it for this page in the browser settings.', fi: 'Mikrofoni on estetty. Salli se tälle sivulle selaimen asetuksista.' },
  'service-not-allowed': { en: 'Talking to the game is turned off on this device. On an iPad, turn on Dictation in Settings.', fi: 'Pelille puhuminen on pois päältä tällä laitteella. Laita iPadissa Sanelu päälle Asetuksista.' },
  'language-not-supported': { en: 'This browser cannot hear English.', fi: 'Tämä selain ei kuule suomea.' },
  network: { en: 'Hearing needs the internet.', fi: 'Kuuleminen tarvitsee internetin.' },
  'audio-capture': { en: 'No microphone was found.', fi: 'Mikrofonia ei löytynyt.' },
}

/** The microphone line for the parent in the other states. */
export const VOICE_LINE = {
  unsupported: { en: 'This browser cannot hear. Chrome, Edge or Safari can.', fi: 'Tämä selain ei kuule. Chrome, Edge tai Safari kuulee.' },
  stopped: { en: 'Listening stopped. Tap the microphone to try again.', fi: 'Kuuntelu loppui. Kokeile uudestaan napauttamalla mikrofonia.' },
  where: { en: 'Listening sends the voice to the browser’s speech service: Google in Chrome, Apple in Safari.', fi: 'Kuunnellessa ääni menee selaimen puhepalveluun: Chromessa Googlelle, Safarissa Applelle.' },
} as const

/** A key on the key help: a letter or digit is the same in both languages, a named key is words. */
export type Cap = string | Words
export interface KeyRow {
  caps: readonly Cap[]
  word: Words
}

const SPACE: Words = { en: 'Space', fi: 'Välilyönti' }
const TURN: Words = { en: 'Turn', fi: 'Käännä' }
const HOOK: Words = { en: 'Hook', fi: 'Koukku' }
const HOOK_OR_UNHOOK: Words = { en: 'Hook or unhook', fi: 'Koukkuun tai irti' }

/** The keys and the mouse that work every machine, after the machine's own rows. */
export const KEYS: readonly KeyRow[] = [
  { caps: ['W', 'A', 'S', 'D'], word: { en: 'Drive', fi: 'Aja' } },
  { caps: [{ en: 'Left drag', fi: 'Vasen veto' }], word: { en: 'First two levers', fi: 'Kaksi ensimmäistä vipua' } },
  { caps: [{ en: 'Wheel', fi: 'Rulla' }], word: { en: 'Third lever', fi: 'Kolmas vipu' } },
  { caps: [{ en: 'Right drag', fi: 'Oikea veto' }], word: { en: 'Fourth lever', fi: 'Neljäs vipu' } },
  { caps: ['1-9'], word: { en: 'Pick a machine', fi: 'Valitse kone' } },
  { caps: ['H'], word: { en: 'Horn', fi: 'Torvi' } },
  { caps: ['C'], word: { en: 'Camera', fi: 'Kamera' } },
  { caps: ['M'], word: { en: 'Sound', fi: 'Äänet' } },
  { caps: [{ en: 'Esc', fi: 'Esc' }], word: { en: 'Pause', fi: 'Tauko' } },
]

/** What the keys do on each machine. */
export const LEVERS: Record<MachineKind, readonly KeyRow[]> = {
  digger: [
    { caps: ['Q', 'E'], word: TURN },
    { caps: ['R', 'F'], word: { en: 'Boom', fi: 'Puomi' } },
    { caps: ['T', 'G'], word: { en: 'Stick', fi: 'Varsi' } },
    { caps: ['Z', 'X'], word: { en: 'Bucket', fi: 'Kauha' } },
  ],
  dumper: [{ caps: ['Q', 'E'], word: { en: 'Bed', fi: 'Lava' } }],
  dozer: [{ caps: ['Q', 'E'], word: { en: 'Blade', fi: 'Puskulevy' } }],
  roller: [{ caps: [SPACE], word: { en: 'Stomp', fi: 'Täristä' } }],
  mixer: [{ caps: ['Q', 'E'], word: { en: 'Chute', fi: 'Kouru' } }],
  forklift: [
    { caps: ['Q', 'E'], word: { en: 'Forks', fi: 'Piikit' } },
    { caps: [SPACE], word: { en: 'Pick or drop', fi: 'Nosta tai laske' } },
  ],
  tower: [
    { caps: ['Q', 'E'], word: TURN },
    { caps: ['R', 'F'], word: { en: 'Trolley', fi: 'Vaunu' } },
    { caps: ['T', 'G'], word: HOOK },
    { caps: [SPACE], word: HOOK_OR_UNHOOK },
  ],
  semi: [{ caps: [SPACE], word: { en: 'Unload', fi: 'Pura' } }],
  mobile: [
    { caps: ['Q', 'E'], word: TURN },
    { caps: ['R', 'F'], word: { en: 'Reach', fi: 'Puomin pituus' } },
    { caps: ['T', 'G'], word: HOOK },
    { caps: [SPACE], word: HOOK_OR_UNHOOK },
  ],
}
