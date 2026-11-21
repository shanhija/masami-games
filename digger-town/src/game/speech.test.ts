import { describe, expect, it } from 'vitest'
import { MACHINE_NAMES, PLACES_TO_TRY } from '../words'
import { MACHINE_KINDS } from './model'
import type { MachineKind, PlaceId, Spoken, SpokenMove, SpokenWork } from './model'
import { parseBest, parseSpeech, partsOf } from './speech'

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

/** Each sentence and the clauses it must give. */
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

describe('parseSpeech', () => {
  it.each(SENTENCES)('%j', (text, want) => {
    expect(parseSpeech(text)).toEqual(want.map(spoken))
  })

  it('gives no clause for a clause that means nothing', () => {
    expect(parseSpeech('kerro ja kaivuri ja hyvä')).toEqual([spoken({ who: 'digger' })])
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
    expect(parseBest(['kaivuri', 'rekka'])).toEqual([spoken({ who: 'digger' })])
  })
  it('falls back to the first alternative that has parts', () => {
    expect(parseBest(['kerro', 'kissa', 'rekka', 'kaivuri'])).toEqual([spoken({ who: 'semi' })])
  })
  it('gives nothing when no alternative means anything, or there are none', () => {
    expect(parseBest(['kerro', 'kissa'])).toEqual([])
    expect(parseBest([])).toEqual([])
  })
})

describe('the words to try', () => {
  it('are sixteen words, a word for each machine and seven places, and the parser understands each one', () => {
    const words = [...MACHINE_KINDS.map((k) => ({ word: MACHINE_NAMES[k], means: k })), ...PLACES_TO_TRY.map((p) => ({ word: p.word, means: p.place }))]
    expect(words).toHaveLength(16)
    for (const { word, means } of words) {
      const clauses = parseSpeech(word.fi)
      expect(clauses, word.fi).toHaveLength(1)
      const c = clauses[0]
      expect(c.who ?? c.to, word.fi).toBe(means)
    }
  })
})
