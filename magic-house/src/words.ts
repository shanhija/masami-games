/**
 * Every word of Magic House in both languages: who plays, the house, the HUD, the pause card and
 * the end. The helper, the quiz and the dressing room add theirs here. The words Opus writes for
 * a child come with each room and present as `{ en, fi }`, never from here.
 */

import { DIRECTORY } from '../../profiles/src/directory'
import type { Words } from '../../profiles/src/lang'

/** The house's name, as its card in the gallery says it. */
export const NAME: Words = DIRECTORY['magic-house'].name

/** Who plays (shell/WhoPlays.tsx): each child presses on their own keys, pad or gamepad to sit down. */
export const WHO = {
  title: { en: 'Who plays?', fi: 'Kuka pelaa?' },
  press: { en: 'Press a button to join!', fi: 'Paina nappia, niin pääset mukaan!' },
  go: { en: 'Play!', fi: 'Pelaamaan!' },
  /** A claimed touch pad's b on who plays: that child stands up again. */
  leave: { en: 'Not me', fi: 'En pelaa' },
} as const satisfies Record<string, Words>

/** The house (shell/House.tsx): its doors, and the way back to who plays. */
export const HOUSE = {
  players: { en: 'Players', fi: 'Pelaajat' },
  /** For a moment after the wait gives up: no new room is coming this time. */
  noNewRoom: { en: 'No new room this time. Pick a door!', fi: 'Uutta huonetta ei tule nyt. Valitse ovi!' },
  noDoors: { en: 'No doors for this many players yet', fi: 'Näin monelle ei ole vielä ovia' },
  /** A door's star, as a screen reader says it: one of these players has been in. */
  played: { en: 'You have played this', fi: 'Olette pelanneet tämän' },
} as const satisfies Record<string, Words>

/** The quiz while the new door waits (shell/quiz/): a column for each player, sums and words to read. */
export const QUIZ = {
  howMany: { en: 'How many?', fi: 'Montako?' },
  yes: { en: 'Yes!', fi: 'Jee!' },
  doorOpen: { en: 'The door is open!', fi: 'Ovi on auki!' },
  stars: { en: 'Stars', fi: 'Tähdet' },
} as const satisfies Record<string, Words>

/** The glowing door for a new room (shell/House.tsx), and the wait for it (shell/Waiting.tsx) while it is being made. */
export const NEW_DOOR = {
  fresh: { en: 'New!', fi: 'Uusi!' },
  coming: { en: 'A new room is coming', fi: 'Uusi huone tulossa' },
  making: { en: 'Your new room is being made', fi: 'Uutta huonetta tehdään' },
  soon: { en: 'It opens soon!', fi: 'Se aukeaa pian!' },
} as const satisfies Record<string, Words>

/** A room (shell/RoomScreen.tsx): the cheer at the end, and a room that would not build. */
export const ROOM = {
  hooray: { en: 'Hooray!', fi: 'Hurraa!' },
  stuck: { en: 'This door is stuck', fi: 'Tämä ovi on jumissa' },
} as const satisfies Record<string, Words>

/** The end (shell/End.tsx), after the cheer: each player's present, and on to the dressing room. */
export const END = {
  next: { en: 'Next', fi: 'Seuraava' },
  title: { en: 'Presents!', fi: 'Lahjoja!' },
  open: { en: 'Open!', fi: 'Avaa!' },
  /** For a player who owns every present the house has. */
  allOwned: { en: 'Every present is yours already!', fi: 'Kaikki lahjat ovat jo sinun!' },
  /** The one step of the end's stage (shell/endRoom.ts), as the helper would say it. */
  stageStep: { en: 'Open the presents', fi: 'Avaa lahjat' },
} as const satisfies Record<string, Words>

/** The dressing room (shell/DressingRoom.tsx): a column for each player, who picks what to wear and its colours, gives the room a thumb and says when they are ready. */
export const DRESS = {
  title: { en: 'Dressing room', fi: 'Pukuhuone' },
  ready: { en: 'Ready!', fi: 'Valmis!' },
  /** Before the room's name: did you like it? */
  liked: { en: 'Did you like it?', fi: 'Tykkäsitkö?' },
  up: { en: 'I liked it', fi: 'Tykkäsin' },
  down: { en: 'I did not like it', fi: 'En tykännyt' },
  nothing: { en: 'Nothing', fi: 'Ei mitään' },
  main: { en: 'Colour', fi: 'Väri' },
  second: { en: 'Colour 2', fi: 'Väri 2' },
  /** Which pattern the grid lays on the thing's colour (patterns/patterns.ts). */
  pattern: { en: 'Pattern', fi: 'Kuvio' },
  /** The one step of the dressing kids' stage (scene/DressingKids.tsx), as the helper would say it. */
  stageStep: { en: 'Get dressed', fi: 'Pukeudu' },
} as const satisfies Record<string, Words>

/** The dressing room's slots, by Silly Billy's slot names: where a thing is worn. */
export const SLOT_NAMES = {
  hair: { en: 'Hair', fi: 'Hiukset' },
  head: { en: 'Head', fi: 'Pää' },
  face: { en: 'Face', fi: 'Kasvot' },
  body: { en: 'Clothes', fi: 'Vaatteet' },
  back: { en: 'Back', fi: 'Selkä' },
  hand: { en: 'Hand', fi: 'Käsi' },
} as const satisfies Record<string, Words>

/** The names of the house's own set of colours (shell/dressing/colours.ts), as a screen reader says each swatch. */
export const COLOUR_NAMES = {
  red: { en: 'Red', fi: 'Punainen' },
  orange: { en: 'Orange', fi: 'Oranssi' },
  yellow: { en: 'Yellow', fi: 'Keltainen' },
  lime: { en: 'Light green', fi: 'Vaaleanvihreä' },
  green: { en: 'Green', fi: 'Vihreä' },
  teal: { en: 'Sea green', fi: 'Turkoosi' },
  sky: { en: 'Light blue', fi: 'Vaaleansininen' },
  blue: { en: 'Blue', fi: 'Sininen' },
  purple: { en: 'Purple', fi: 'Violetti' },
  pink: { en: 'Pink', fi: 'Vaaleanpunainen' },
  rose: { en: 'Bright pink', fi: 'Pinkki' },
  white: { en: 'White', fi: 'Valkoinen' },
  grey: { en: 'Grey', fi: 'Harmaa' },
  black: { en: 'Black', fi: 'Musta' },
  brown: { en: 'Brown', fi: 'Ruskea' },
  sand: { en: 'Sand', fi: 'Hiekka' },
} as const satisfies Record<string, Words>

/** The names of the house's own set of patterns (patterns/patterns.ts), plain first, in the order the dressing room shows them, as a screen reader says each. */
export const PATTERN_NAMES = {
  plain: { en: 'No pattern', fi: 'Ei kuviota' },
  stripes: { en: 'Stripes', fi: 'Raidat' },
  spots: { en: 'Dots', fi: 'Pallot' },
  checks: { en: 'Squares', fi: 'Ruudut' },
  zigzag: { en: 'Zigzag', fi: 'Siksak' },
  stars: { en: 'Stars', fi: 'Tähdet' },
} as const satisfies Record<string, Words>

/** The pause card, the same Finnish as every game's. */
export const PAUSE = {
  keepGoing: { en: 'Keep going', fi: 'Jatka' },
  startAgain: { en: 'Start again', fi: 'Aloita alusta' },
  anotherRoom: { en: 'Another room', fi: 'Toinen huone' },
  sound: { en: 'Sound', fi: 'Äänet' },
  fullScreen: { en: 'Full screen', fi: 'Koko näyttö' },
  moreGames: { en: 'More games', fi: 'Muut pelit' },
  /** Out of a room that would not build. */
  toHouse: { en: 'Back to the house', fi: 'Takaisin taloon' },
} as const satisfies Record<string, Words>

/** The HUD (shell/Hud.tsx): the engine's two button jobs as each pad and key legend shows them, the corner buttons as a screen reader says them, and a touch pad nobody sits at yet. */
export const HUD = {
  jump: { en: 'Jump', fi: 'Hyppää' },
  grab: { en: 'Take', fi: 'Ota' },
  help: { en: 'Help', fi: 'Apua' },
  pause: { en: 'Pause', fi: 'Tauko' },
  touchToPlay: { en: 'Touch to play', fi: 'Kosketa ja pelaa' },
  steps: { en: 'Steps', fi: 'Tehtävät' },
} as const satisfies Record<string, Words>

/** The ?sounds page (shell/SoundsPage.tsx), where a parent hears every sound before the children do. The sounds keep their names (engine/sounds.ts), the names rooms call them by. */
export const SOUNDS_PAGE = {
  title: { en: 'All the sounds', fi: 'Kaikki äänet' },
  tap: { en: 'Tap a sound to hear it', fi: 'Napauta ääntä, niin kuulet sen' },
  /** The mark on a sound that plays a recording. */
  recorded: { en: 'recorded', fi: 'äänitetty' },
  /** Where the recordings are not built: every name plays the game's own made sound. */
  noRecordings: { en: 'The recorded sounds are not here, so the game plays its own.', fi: 'Äänitettyjä ääniä ei ole, joten peli soittaa omiaan.' },
} as const satisfies Record<string, Words>
