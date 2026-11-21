/**
 * English words and rules for the speech grammar (`speech.ts`). A stem matches a whole word,
 * or the word with an ending a small child's English puts on it (digs, digging, trucks, moving,
 * lorries), so the short command words match only themselves. Machines have names of two words
 * ("dump truck", "tower crane"), caught as a pair. Where a machine is, English says in a word
 * before it, skipping "the" and the like: "to the digger" is where to go, "in the digger" with
 * a verb of getting in ("hop", "get", "switch to") is the one to drive. What Chrome's recognizer
 * writes for a four-year-old is in the tables too: "dig her", "dumb truck", "folk lift".
 */
import type { Grammar } from './speech'

/** Words between a preposition and the machine it is about. */
const SKIPPED = new Set(['the', 'a', 'an', 'my', 'your', 'our', 'that', 'this', 'his', 'her', 'its', 'big', 'little', 'small', 'old', 'new', 'yellow', 'orange', 'red', 'blue', 'green', 'pink', 'purple', 'white', 'gold', 'golden'])
/** "at" is not one: "look at the digger" names it. */
const TO = new Set(['to', 'by', 'near', 'beside', 'behind', 'towards', 'toward'])
const INTO = new Set(['in', 'into', 'inside', 'on', 'onto'])
/** Verbs whose "to" is into: "switch to the crane". */
const SWITCH = new Set(['switch', 'change', 'swap'])

export const ENGLISH: Grammar = {
  table: [
    { machine: 'digger', stems: 'digger excavator backhoe digher', raw: 'digga diga tigger jcb' },
    { machine: 'dumper', stems: 'dumptruck dumbtruck dumpertruck tiptruck tippertruck tipperlorry dumper tipper truck' },
    { machine: 'dozer', stems: 'bulldozer dozer tractor pusher', raw: 'bulldoza dosa' },
    { machine: 'roller', stems: 'roller roadroller steamroller', raw: 'roll rolls rolled rolling rolla' },
    { machine: 'mixer', stems: 'cementmixer concretemixer cementtruck concretetruck mixer cement concrete', raw: 'mix mixes mixed mixing' },
    { machine: 'forklift', stems: 'forklift folklift fork' },
    { machine: 'tower', stems: 'towercrane bigcrane tallcrane crane' },
    { machine: 'semi', stems: 'lorry bigtruck logtruck loggingtruck timbertruck semi laurie lorrie lori lowry' },
    { machine: 'mobile', stems: 'truckcrane mobilecrane cranetruck cranelorry' },
    { work: 'roll', stems: 'flatten squash squish smooth stomp', raw: 'roll rolls rolled rolling' },
    { work: 'give', raw: 'mix mixes mixed mixing' },

    { move: 'forward', stems: 'go drive move forward forwards ahead straight faster zoom vroom' },
    { move: 'back', stems: 'back backward backwards reverse' },
    { move: 'left', stems: 'left' },
    { move: 'right', stems: 'right' },
    { move: 'up', stems: 'up upwards higher raise' },
    { move: 'down', stems: 'down downwards lower' },
    { move: 'around', stems: 'around round spin' },
    { flag: 'stop', stems: 'stop halt wait freeze brake enough stay', raw: 'dont whoa woah' },
    { flag: 'honk', stems: 'honk beep toot hoot horn', raw: 'peep' },
    { flag: 'come', stems: 'come here' },
    { flag: 'help', stems: 'help' },
    { work: 'take', stems: 'dig scoop pick pickup load fill lift grab take collect' },
    { work: 'give', stems: 'dump tip pour drop put empty unload release' },
    { work: 'push', stems: 'push shove nudge bulldoze' },

    { place: 'sand', stems: 'sand sandpile sandhill dirt soil mud earth' },
    { place: 'rock', stems: 'rock rockpile stone pebble boulder quarry' },
    { place: 'hole', stems: 'hole pit ditch gap' },
    { place: 'road', stems: 'road street' },
    { place: 'house', stems: 'house home building' },
    { place: 'bridge', stems: 'bridge river' },
    { place: 'water', stems: 'water watertower hose' },
    { place: 'forest', stems: 'forest woods wood trees log logpile' },
    { place: 'saw', stems: 'sawmill saw mill' },
    { place: 'press', stems: 'brick brickpress brickmachine brickfactory factory' },
    { place: 'crusher', stems: 'crusher rockcrusher gravel' },
    { place: 'play', stems: 'playground sandpit sandbox slide climbingframe', raw: 'swings' },
    { place: 'pond', stems: 'pond duckpond lake pool' },
    { place: 'clock', stems: 'clock clocktower tower hall townhall' },
    { place: 'there', stems: 'circle ring', raw: 'there' },
  ],
  phrases: [
    { words: 'what now', means: { flag: 'help' } },
    { words: 'what next', means: { flag: 'help' } },
    { words: 'whats next', means: { flag: 'help' } },
    { words: 'what do i do', means: { flag: 'help' } },
    { words: 'what do we do', means: { flag: 'help' } },
    { words: 'what should i do', means: { flag: 'help' } },
    { words: 'hold on', means: { flag: 'stop' } },
    { words: 'slow down', means: { flag: 'stop' } },
    { words: 'hurry up', means: { move: 'forward' } },
    { words: 'right here', means: { flag: 'come' } },
    { words: 'right there', means: { place: 'there' } },
    { words: 'fill up', means: { work: 'take' } },
    { words: 'pick up', means: { work: 'take' } },
    { words: 'pick it up', means: { work: 'take' } },
    { words: 'lift up', means: { work: 'take' } },
    { words: 'lift it up', means: { work: 'take' } },
    { words: 'dig up', means: { work: 'take' } },
    { words: 'put down', means: { work: 'give' } },
    { words: 'put it down', means: { work: 'give' } },
    { words: 'set down', means: { work: 'give' } },
    { words: 'set it down', means: { work: 'give' } },
    { words: 'let go', means: { work: 'give' } },
    { words: 'tip out', means: { work: 'give' } },
    { words: 'back up', means: { move: 'back' } },
    { words: 'turn around', means: { move: 'around' } },
    { words: 'j c b', means: { machine: 'digger' } },
    // Words that mean nothing in the game, though one of them would: "up to" is only "to", "I saw" no sawmill, "don't know" no stop, "all right" no turn, "have a go" no drive.
    { words: 'up to', means: null },
    { words: 'all right', means: null },
    { words: 'thats right', means: null },
    { words: 'right now', means: null },
    { words: 'not right', means: null },
    { words: 'have a go', means: null },
    { words: 'go to sleep', means: null },
    { words: 'lets play', means: null },
    { words: 'i saw', means: null },
    { words: 'we saw', means: null },
    { words: 'you saw', means: null },
    { words: 'i dont know', means: null },
    { words: 'dont know', means: null },
  ],
  letters: { z: 's' },
  suffixes: { endings: ['s', 'es', 'ed', 'ing', 'in'], dropped: ['ing', 'ed', 'in', 'ies', 'ied'] },
  fuzzy: [7, 10],
  clauseBreak: new Set(['and', 'then']),
  no: 'no',
  notACommand: new Set(),
  absorbed: new Set(['truck', 'lorry', 'machine']),
  jumpIn: new Set(['hop', 'jump', 'get', 'climb', 'sit', 'switch', 'change', 'swap', 'go']),
  later: new Map(),
  form(tokens, at, after) {
    let k = at - 1
    while (k >= 0 && SKIPPED.has(tokens[k])) k--
    const before = k >= 0 ? tokens[k] : ''
    if (TO.has(before)) return { form: before === 'to' && k > 0 && SWITCH.has(tokens[k - 1]) ? 'into' : 'to', next: after }
    return { form: INTO.has(before) ? 'into' : 'plain', next: after }
  },
}
