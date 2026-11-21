import { describe, expect, it } from 'vitest'
import { LANGS } from '../../../profiles/src/lang'
import { MACHINE_NAMES, PLACES_TO_TRY } from '../words'
import { MACHINE_KINDS } from './model'
import type { MachineKind, PlaceId, Spoken, SpokenMove, SpokenWork } from './model'
import { isBareNo, parseBest, parseSpeech, partsOf } from './speech'

interface Want {
  who?: MachineKind
  move?: SpokenMove
  work?: SpokenWork
  to?: PlaceId | MachineKind
  come?: true
  honk?: true
  stop?: true
  help?: true
}

const spoken = (w: Want): Spoken => ({ who: w.who ?? null, move: w.move ?? null, work: w.work ?? null, to: w.to ?? null, come: w.come ?? false, honk: w.honk ?? false, stop: w.stop ?? false, help: w.help ?? false })

/** Each Finnish sentence and the clauses it must give. */
const SENTENCES: [string, Want[]][] = [
  ['kaivuri', [{ who: 'digger' }]],
  ['kaivuli', [{ who: 'digger' }]],
  ['kaivuji', [{ who: 'digger' }]],
  ['kaivinkone', [{ who: 'digger' }]],
  ['Kaivuri', [{ who: 'digger' }]],
  ['kippi auto', [{ who: 'dumper' }]],
  ['kuorma-auto', [{ who: 'dumper' }]],
  ['auto', [{ who: 'dumper' }]],
  ['kaada autoon', [{ work: 'give', to: 'dumper' }]],
  ['lekka', [{ who: 'semi' }]],
  ['rekka aja', [{ who: 'semi', move: 'forward' }]],
  ['rekka auto', [{ who: 'semi' }]],
  ['rekalla', [{ who: 'semi' }]],
  ['jyrä', [{ who: 'roller' }]],
  ['katu jyrä', [{ who: 'roller' }]],
  ['jyrää', [{ who: 'roller', work: 'roll' }]],
  ['tlukki', [{ who: 'forklift' }]],
  ['tukki', [{ who: 'forklift' }]],
  ['tukeille', [{ to: 'forest' }]],
  ['nosturi', [{ who: 'tower' }]],
  ['nostuli', [{ who: 'tower' }]],
  ['auto nosturi', [{ who: 'mobile' }]],
  ['autonosturi', [{ who: 'mobile' }]],
  ['pusku traktori', [{ who: 'dozer' }]],
  ['betoniauto', [{ who: 'mixer' }]],
  ['kaiva', [{ work: 'take' }]],
  ['kaivaa', [{ work: 'take' }]],
  ['kaivuri kaiva hiekkaa', [{ who: 'digger', work: 'take', to: 'sand' }]],
  ['kaada kippiautoon', [{ work: 'give', to: 'dumper' }]],
  ['kippaa', [{ work: 'give' }]],
  ['kippiauto kippaa kuoppaan', [{ who: 'dumper', work: 'give', to: 'hole' }]],
  ['aja kuopalle ja kippaa', [{ move: 'forward', to: 'hole' }, { work: 'give' }]],
  ['aja kuopalle sit kippaa', [{ move: 'forward', to: 'hole' }, { work: 'give' }]],
  ['peruuta', [{ move: 'back' }]],
  ['pejuuta', [{ move: 'back' }]],
  ['vasemmalle', [{ move: 'left' }]],
  ['aja oikealle', [{ move: 'right' }]],
  ['seis', [{ stop: true }]],
  ['ei', [{ stop: true }]],
  ['ei ei ei', [{ stop: true }]],
  ['ei kaiva', [{ work: 'take' }]],
  ['älä kaiva', [{ stop: true, work: 'take' }]],
  ['oota', [{ stop: true }]],
  ['ota', [{ work: 'take' }]],
  ['tööt', [{ honk: true }]],
  ['tuut tuut', [{ honk: true }]],
  ['kippiauto tule tänne', [{ who: 'dumper', come: true }]],
  ['tuu tänne', [{ come: true }]],
  ['hyppää kaivuriin', [{ who: 'digger' }]],
  ['mene rekkaan', [{ who: 'semi' }]],
  ['mee kaivuriin', [{ who: 'digger' }]],
  ['aja kaivurille', [{ move: 'forward', to: 'digger' }]],
  ['kippiauto mene kaivurin luo', [{ who: 'dumper', move: 'forward', to: 'digger' }]],
  ['aja sinne', [{ move: 'forward', to: 'there' }]],
  ['aja vesitornille', [{ move: 'forward', to: 'water' }]],
  ['vesi torni', [{ to: 'water' }]],
  ['mene metsään', [{ move: 'forward', to: 'forest' }]],
  ['työnnä', [{ work: 'push' }]],
  ['puske', [{ work: 'push' }]],
  ['puskuri työnnä', [{ who: 'dozer', work: 'push' }]],
  ['nosta', [{ work: 'take' }]],
  ['laske', [{ work: 'give' }]],
  ['ylös', [{ move: 'up' }]],
  ['alas', [{ move: 'down' }]],
  ['apua', [{ help: true }]],
  ['mitä nyt', [{ help: true }]],
  ['kerro', []],
  ['joki', [{ to: 'bridge' }]],
  ['jokin', []],
  ['leikkiä', []],
  ['kissa istuu puussa', []],
  ['tämä on hyvä', []],
  ['', []],

  // A child's own sentences and other forms.
  ['  KAIVURI!  ', [{ who: 'digger' }]],
  ['kaivuri, kaiva, kaiva', [{ who: 'digger', work: 'take' }]],
  ['aja kaivurin viereen', [{ move: 'forward', to: 'digger' }]],
  ['kippiauto aja kaivurille', [{ who: 'dumper', move: 'forward', to: 'digger' }]],
  ['aja rekalla', [{ who: 'semi', move: 'forward' }]],
  ['kaivuri ja kippiauto', [{ who: 'digger' }, { who: 'dumper' }]],
  ['kaivuri sitten kippiauto tule tänne', [{ who: 'digger' }, { who: 'dumper', come: true }]],
  ['mene kaivuriin ja kaiva', [{ who: 'digger' }, { work: 'take' }]],
  ['mennään tukkiin', [{ who: 'forklift' }]],
  ['aja takaisin', [{ move: 'back' }]],
  ['käänny ympäri', [{ move: 'around' }]],
  ['aja ympäri', [{ move: 'around' }]],
  ['kaada kuoppaan', [{ work: 'give', to: 'hole' }]],
  ['mene kuopalle', [{ move: 'forward', to: 'hole' }]],
  ['aja taloon', [{ move: 'forward', to: 'house' }]],
  ['aja sillalle', [{ move: 'forward', to: 'bridge' }]],
  ['puskutraktori työnnä hiekkaa', [{ who: 'dozer', work: 'push', to: 'sand' }]],
  ['betoniauto aja vesitornille', [{ who: 'mixer', move: 'forward', to: 'water' }]],
  ['seis seis', [{ stop: true }]],
  ['pysähdy', [{ stop: true }]],
  ['aja sinne ja tööt', [{ move: 'forward', to: 'there' }, { honk: true }]],
  ['ajaa', [{ move: 'forward' }]],
  ['mene', [{ move: 'forward' }]],
  ['tule', [{ come: true }]],
  ['auta', [{ help: true }]],
  ['kissa', []],
  ['kerro tarina', []],
  ['hyvää huomenta', []],
  ['minä haluan jäätelöä', []],
  ['isä tuli kotiin', [{ to: 'house' }]],

  // Object first, place last: the last place or machine named is where it goes.
  ['työnnä hiekka kuoppaan', [{ work: 'push', to: 'hole' }]],
  ['puskutraktori työnnä hiekka kuoppaan', [{ who: 'dozer', work: 'push', to: 'hole' }]],
  ['kaada hiekka kippiautoon', [{ work: 'give', to: 'dumper' }]],
  ['kaivuri kaiva hiekkaa kippiautoon', [{ who: 'digger', work: 'take', to: 'dumper' }]],
  ['kaivuri kaiva hiekkaa ja kaada kippiautoon', [{ who: 'digger', work: 'take', to: 'sand' }, { work: 'give', to: 'dumper' }]],
  ['kippiauto kippaa tiilikoneeseen', [{ who: 'dumper', work: 'give', to: 'press' }]],
  ['jyrä jyrää tietä', [{ who: 'roller', work: 'roll', to: 'road' }]],
  ['jyrä tien päälle', [{ who: 'roller', to: 'road' }]],
  ['betoniauto valaa', [{ who: 'mixer', work: 'give' }]],

  // A machine word said again, or its own job as a verb, is not somewhere to go.
  ['jyrä jyrää', [{ who: 'roller', work: 'roll' }]],
  ['jyrää jyrää', [{ who: 'roller', work: 'roll' }]],
  ['jyrä jyrä', [{ who: 'roller' }]],
  ['kaivuri kaivuri kaivuri', [{ who: 'digger' }]],
  ['kaivuri kaiva kaivuri', [{ who: 'digger', work: 'take' }]],
  ['betoniauto sekoittaa', [{ who: 'mixer', work: 'give' }]],
  ['betoniauto sekoita', [{ who: 'mixer', work: 'give' }]],
  ['sekoittaa', [{ who: 'mixer', work: 'give' }]],
  ['kippiauto aja kaivurille', [{ who: 'dumper', move: 'forward', to: 'digger' }]],
  ['kaivuri aja kippiautoon', [{ who: 'digger', move: 'forward', to: 'dumper' }]],

  // "tukki" is a child's "trukki" at the start of a clause, and the logs after any other word.
  ['trukki nosta tukki', [{ who: 'forklift', work: 'take', to: 'forest' }]],
  ['nosta tukki', [{ work: 'take', to: 'forest' }]],
  ['tukki nosta', [{ who: 'forklift', work: 'take' }]],
  ['tukki nosta tukki', [{ who: 'forklift', work: 'take', to: 'forest' }]],
  ['aja tukille ja tukki laske', [{ move: 'forward', to: 'forklift' }, { who: 'forklift', work: 'give' }]],
  ['rekka aja sahalle', [{ who: 'semi', move: 'forward', to: 'saw' }]],

  // Words a child says all the time that sound a little like a command.
  ['pelataan', []],
  ['mä en tiedä', []],
  ['kiitos', []],
  ['joo', []],
  ['tosi hauskaa', []],
]

/** The English twins: each sentence and the clauses it must give. */
const SENTENCES_EN: [string, Want[]][] = [
  ['digger', [{ who: 'digger' }]],
  ['dig her', [{ who: 'digger' }]],
  ['digga', [{ who: 'digger' }]],
  ['excavator', [{ who: 'digger' }]],
  ['escavator', [{ who: 'digger' }]],
  ['Digger', [{ who: 'digger' }]],
  ['JCB', [{ who: 'digger' }]],
  ['dump truck', [{ who: 'dumper' }]],
  ['dumb truck', [{ who: 'dumper' }]],
  ['dump-truck', [{ who: 'dumper' }]],
  ['tipper truck', [{ who: 'dumper' }]],
  ['truck', [{ who: 'dumper' }]],
  ['dump it in the truck', [{ work: 'give', to: 'dumper' }]],
  ['lorry', [{ who: 'semi' }]],
  ['laurie', [{ who: 'semi' }]],
  ['lorry go', [{ who: 'semi', move: 'forward' }]],
  ['lorry truck', [{ who: 'semi' }]],
  ['lorries', [{ who: 'semi' }]],
  ['roller', [{ who: 'roller' }]],
  ['road roller', [{ who: 'roller' }]],
  ['steam roller', [{ who: 'roller' }]],
  ['roll', [{ who: 'roller', work: 'roll' }]],
  ['forklift', [{ who: 'forklift' }]],
  ['fork lift', [{ who: 'forklift' }]],
  ['folk lift', [{ who: 'forklift' }]],
  ['crane', [{ who: 'tower' }]],
  ['tower crane', [{ who: 'tower' }]],
  ['truck crane', [{ who: 'mobile' }]],
  ['mobile crane', [{ who: 'mobile' }]],
  ['crane truck', [{ who: 'mobile' }]],
  ['bulldozer', [{ who: 'dozer' }]],
  ['bull dozer', [{ who: 'dozer' }]],
  ['dozer', [{ who: 'dozer' }]],
  ['cement mixer', [{ who: 'mixer' }]],
  ['concrete mixer', [{ who: 'mixer' }]],
  ['mixer truck', [{ who: 'mixer' }]],
  ['dig', [{ work: 'take' }]],
  ['digging', [{ work: 'take' }]],
  ['digger dig sand', [{ who: 'digger', work: 'take', to: 'sand' }]],
  ['dump into the dump truck', [{ work: 'give', to: 'dumper' }]],
  ['tip', [{ work: 'give' }]],
  ['dump truck tip it in the hole', [{ who: 'dumper', work: 'give', to: 'hole' }]],
  ['drive to the hole and tip', [{ move: 'forward', to: 'hole' }, { work: 'give' }]],
  ['drive to the hole then tip', [{ move: 'forward', to: 'hole' }, { work: 'give' }]],
  ['back up', [{ move: 'back' }]],
  ['reverse', [{ move: 'back' }]],
  ['backwards', [{ move: 'back' }]],
  ['left', [{ move: 'left' }]],
  ['go right', [{ move: 'right' }]],
  ['stop', [{ stop: true }]],
  ['no', [{ stop: true }]],
  ['no no no', [{ stop: true }]],
  ['no dig', [{ work: 'take' }]],
  ['don’t dig', [{ stop: true, work: 'take' }]],
  ['wait', [{ stop: true }]],
  ['take', [{ work: 'take' }]],
  ['honk', [{ honk: true }]],
  ['beep beep', [{ honk: true }]],
  ['dump truck come here', [{ who: 'dumper', come: true }]],
  ['come here', [{ come: true }]],
  ['hop in the digger', [{ who: 'digger' }]],
  ['get in the lorry', [{ who: 'semi' }]],
  ['jump into the digger', [{ who: 'digger' }]],
  ['switch to the crane', [{ who: 'tower' }]],
  ['go in the digger', [{ who: 'digger' }]],
  ['drive to the digger', [{ move: 'forward', to: 'digger' }]],
  ['dump truck go next to the digger', [{ who: 'dumper', move: 'forward', to: 'digger' }]],
  ['go there', [{ move: 'forward', to: 'there' }]],
  ['drive to the water tower', [{ move: 'forward', to: 'water' }]],
  ['water tower', [{ to: 'water' }]],
  ['go to the forest', [{ move: 'forward', to: 'forest' }]],
  ['push', [{ work: 'push' }]],
  ['bulldoze', [{ work: 'push' }]],
  ['bulldozer push', [{ who: 'dozer', work: 'push' }]],
  ['lift', [{ work: 'take' }]],
  ['pick up', [{ work: 'take' }]],
  ['put down', [{ work: 'give' }]],
  ['drop it', [{ work: 'give' }]],
  ['up', [{ move: 'up' }]],
  ['down', [{ move: 'down' }]],
  ['help', [{ help: true }]],
  ['what now', [{ help: true }]],
  ['what do I do', [{ help: true }]],
  ['tell me', []],
  ['river', [{ to: 'bridge' }]],
  ['rocket', []],
  ['sandwich', []],
  ['nothing', []],
  ['playing', []],
  ['the cat is sleeping', []],
  ['this is good', []],
  ['', []],

  // A child's own sentences and other forms.
  ['  DIGGER!  ', [{ who: 'digger' }]],
  ['digger, dig, dig', [{ who: 'digger', work: 'take' }]],
  ['drive next to the digger', [{ move: 'forward', to: 'digger' }]],
  ['dump truck drive to the digger', [{ who: 'dumper', move: 'forward', to: 'digger' }]],
  ['drive the lorry', [{ who: 'semi', move: 'forward' }]],
  ['digger and dump truck', [{ who: 'digger' }, { who: 'dumper' }]],
  ['digger then dump truck come here', [{ who: 'digger' }, { who: 'dumper', come: true }]],
  ['get in the digger and dig', [{ who: 'digger' }, { work: 'take' }]],
  ['hop on the forklift', [{ who: 'forklift' }]],
  ['go back', [{ move: 'back' }]],
  ['turn around', [{ move: 'around' }]],
  ['spin around', [{ move: 'around' }]],
  ['tip it in the hole', [{ work: 'give', to: 'hole' }]],
  ['go to the hole', [{ move: 'forward', to: 'hole' }]],
  ['drive to the house', [{ move: 'forward', to: 'house' }]],
  ['drive over the bridge', [{ move: 'forward', to: 'bridge' }]],
  ['bulldozer push the sand', [{ who: 'dozer', work: 'push', to: 'sand' }]],
  ['cement mixer drive to the water tower', [{ who: 'mixer', move: 'forward', to: 'water' }]],
  ['stop stop', [{ stop: true }]],
  ['hold on', [{ stop: true }]],
  ['go there and honk', [{ move: 'forward', to: 'there' }, { honk: true }]],
  ['driving', [{ move: 'forward' }]],
  ['go', [{ move: 'forward' }]],
  ['come', [{ come: true }]],
  ['help me', [{ help: true }]],
  ['cat', []],
  ['tell me a story', []],
  ['good morning', []],
  ['I want ice cream', []],
  ['daddy came home', [{ to: 'house' }]],
  ['look at the digger', [{ who: 'digger' }]],
  ['hurry up', [{ move: 'forward' }]],
  ['slow down', [{ stop: true }]],
  ['right here', [{ come: true }]],
  ['that’s not right', []],

  // Object first, place last: the last place or machine named is where it goes.
  ['push the sand into the hole', [{ work: 'push', to: 'hole' }]],
  ['bulldozer push the sand into the hole', [{ who: 'dozer', work: 'push', to: 'hole' }]],
  ['dump the sand in the dump truck', [{ work: 'give', to: 'dumper' }]],
  ['digger dig sand into the dump truck', [{ who: 'digger', work: 'take', to: 'dumper' }]],
  ['digger dig sand and dump it in the dump truck', [{ who: 'digger', work: 'take', to: 'sand' }, { work: 'give', to: 'dumper' }]],
  ['dump truck tip it into the brick machine', [{ who: 'dumper', work: 'give', to: 'press' }]],
  ['roller roll the road', [{ who: 'roller', work: 'roll', to: 'road' }]],
  ['roller on the road', [{ who: 'roller', to: 'road' }]],
  ['cement mixer pour', [{ who: 'mixer', work: 'give' }]],

  // A machine word said again, or its own job as a verb, is not somewhere to go.
  ['roller roll', [{ who: 'roller', work: 'roll' }]],
  ['roll roll', [{ who: 'roller', work: 'roll' }]],
  ['roller roller', [{ who: 'roller' }]],
  ['digger digger digger', [{ who: 'digger' }]],
  ['digger dig digger', [{ who: 'digger', work: 'take' }]],
  ['cement mixer mixing', [{ who: 'mixer', work: 'give' }]],
  ['mixer mix', [{ who: 'mixer', work: 'give' }]],
  ['mix', [{ who: 'mixer', work: 'give' }]],
  ['digger drive to the dump truck', [{ who: 'digger', move: 'forward', to: 'dumper' }]],

  // Endings: plurals, -ing, a dropped e or y; and a word before the machine says where it is.
  ['diggers', [{ who: 'digger' }]],
  ['dump trucks', [{ who: 'dumper' }]],
  ['tipping', [{ work: 'give' }]],
  ['moving', [{ move: 'forward' }]],
  ['bulldozing', [{ work: 'push' }]],
  ['emptied', [{ work: 'give' }]],
  ['honking', [{ honk: true }]],
  ['lorry go to the sawmill', [{ who: 'semi', move: 'forward', to: 'saw' }]],
  ['forklift pick it up', [{ who: 'forklift', work: 'take' }]],
  ['forklift put it down', [{ who: 'forklift', work: 'give' }]],
  ['forklift pick up the logs', [{ who: 'forklift', work: 'take', to: 'forest' }]],
  ['drive up to the digger', [{ move: 'forward', to: 'digger' }]],
  ['digger go to the big truck', [{ who: 'digger', move: 'forward', to: 'semi' }]],

  // Words a child says all the time that sound a little like a command.
  ['let’s play', []],
  ['I don’t know', []],
  ['thank you', []],
  ['yes', []],
  ['so much fun', []],
  ['I saw a bird', []],
  ['all right', []],
  ['oh my god', []],
  ['good', []],
  ['now', []],
]

describe('parseSpeech in Finnish', () => {
  it.each(SENTENCES)('%j', (text, want) => {
    expect(parseSpeech(text, 'fi')).toEqual(want.map(spoken))
  })

  it('gives no clause for a clause that means nothing', () => {
    expect(parseSpeech('kerro ja kaivuri ja hyvä', 'fi')).toEqual([spoken({ who: 'digger' })])
  })
})

describe('parseSpeech in English', () => {
  it.each(SENTENCES_EN)('%j', (text, want) => {
    expect(parseSpeech(text, 'en')).toEqual(want.map(spoken))
  })

  it('gives no clause for a clause that means nothing', () => {
    expect(parseSpeech('tell me and digger and good', 'en')).toEqual([spoken({ who: 'digger' })])
  })

  it('does not hear Finnish, nor Finnish English', () => {
    expect(parseSpeech('kaivuri kaiva', 'en')).toEqual([])
    expect(parseSpeech('digger dig', 'fi')).toEqual([])
  })
})

describe('isBareNo', () => {
  it('is the language’s no alone, once or more', () => {
    expect([isBareNo('ei', 'fi'), isBareNo('Ei ei!', 'fi'), isBareNo('ei se ole', 'fi'), isBareNo('no', 'fi')]).toEqual([true, true, false, false])
    expect([isBareNo('no', 'en'), isBareNo('No, no!', 'en'), isBareNo('no dig', 'en'), isBareNo('ei', 'en'), isBareNo('', 'en')]).toEqual([true, true, false, false, false])
  })
})

describe('partsOf', () => {
  it('names every part', () => {
    expect(partsOf(spoken({ who: 'dumper', move: 'forward', work: 'give', to: 'hole', come: true, honk: true, stop: true, help: true }))).toEqual(['who:dumper', 'move:forward', 'work:give', 'to:hole', 'come', 'honk', 'stop', 'help'])
    expect(partsOf(spoken({}))).toEqual([])
  })
})

describe('parseBest', () => {
  it('takes the top alternative when it has parts', () => {
    expect(parseBest(['kaivuri', 'rekka'], 'fi')).toEqual([spoken({ who: 'digger' })])
    expect(parseBest(['digger', 'lorry'], 'en')).toEqual([spoken({ who: 'digger' })])
  })
  it('falls back to the first alternative that has parts', () => {
    expect(parseBest(['kerro', 'kissa', 'rekka', 'kaivuri'], 'fi')).toEqual([spoken({ who: 'semi' })])
    expect(parseBest(['bigger', 'dig her', 'lorry'], 'en')).toEqual([spoken({ who: 'digger' })])
  })
  it('gives nothing when no alternative means anything, or there are none', () => {
    expect(parseBest(['kerro', 'kissa'], 'fi')).toEqual([])
    expect(parseBest(['tell me', 'cat'], 'en')).toEqual([])
    expect(parseBest([], 'en')).toEqual([])
  })
})

describe('the words to try', () => {
  it.each(LANGS)('are sixteen words in %s, a word for each machine and seven places, and the parser understands each one', (lang) => {
    const words = [...MACHINE_KINDS.map((k) => ({ word: MACHINE_NAMES[k][lang], means: k })), ...PLACES_TO_TRY.map((p) => ({ word: p.word[lang], means: p.place }))]
    expect(words).toHaveLength(16)
    for (const { word, means } of words) {
      const clauses = parseSpeech(word, lang)
      expect(clauses, word).toHaveLength(1)
      const c = clauses[0]
      expect(c, word).toEqual(spoken(c.who === null ? { to: means } : { who: c.who }))
      expect(c.who ?? c.to, word).toBe(means)
    }
  })
})
