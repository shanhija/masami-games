/**
 * Finnish words and rules for the speech grammar (`speech.ts`). A stem matches the start of a
 * word, so it takes any case ending; a small child's r and j are l, d is t ("lekka" is rekka,
 * "kaivuli" kaivuri, "tlukki" trukki). Where a machine is, Finnish says in the word's ending
 * (`-lle`, a doubled vowel and n) or in a postposition after it ("kaivurin luo").
 */
import type { Grammar } from './speech'

const POSTPOSITIONS = new Set(['luo', 'luokse', 'viereen', 'vierelle', 'lähelle', 'taakse', 'eteen'])
/** A doubled vowel then n: the illative, into. */
const ILLATIVE = /([aeiouyäö])\1n$/

export const FINNISH: Grammar = {
  table: [
    { machine: 'digger', stems: 'kaivuri kaivinkone kaivukone kauhakone', raw: 'kaivuu kaivui' },
    { machine: 'dumper', stems: 'kippiauto kippi kuormaauto kuormuri lavaauto auto', raw: 'kippari' },
    { machine: 'dozer', stems: 'puskutraktori puskukone puskuri traktori taktori dotseri bulldotseri', raw: 'pusku' },
    { machine: 'roller', stems: 'katujyrä tiejyrä jyrä', raw: 'jyrää jyrätä jyrätään' },
    { machine: 'mixer', stems: 'betoniauto betonimylly betonikone myllyauto sementtiauto sekoitusauto sekoittaja betoni sementti mylly', raw: 'sekoita sekoittaa sekoitetaan' },
    { machine: 'forklift', stems: 'haarukkatrukki trukki', raw: 'tukki tukin tukille tukilla tukkiin tukkia rukki' },
    { machine: 'tower', stems: 'torninosturi nosturi nostokurki kurki' },
    { machine: 'semi', stems: 'rekkaauto rekka isoauto pitkäauto' },
    { machine: 'mobile', stems: 'autonosturi ajonosturi nosturiauto nostoauto' },
    { work: 'roll', stems: 'tasoita tasoitta litistä', raw: 'jyrää jyrätä jyrätään' },
    { work: 'give', raw: 'sekoita sekoittaa sekoitetaan' },

    { move: 'forward', stems: 'vauhtia kaasua eteenpäin suoraan eteen', raw: 'aja ajaa ajan ajakaa ajele ajellaan ajetaan mene menee mee menen mennään lähde lähtee liiku liikkuu' },
    { move: 'back', stems: 'peruuta peruutta peruutus taaksepäin takaisin', raw: 'taakse takas takaperin' },
    { move: 'left', stems: 'vasemmalle vasempaan vasemmalla vasemma', raw: 'vasen' },
    { move: 'right', stems: 'oikealle oikeelle oikeaan oikealla', raw: 'oikea oikee' },
    { move: 'up', stems: 'ylöspäin ylemmäs korkeammalle', raw: 'ylös' },
    { move: 'down', stems: 'alaspäin alemmas', raw: 'alas' },
    { move: 'around', stems: 'ympäri' },
    { flag: 'stop', stems: 'pysähdy pysähty pysäytä jarruta riittää seiso', raw: 'seis stop stoppi stoppaa odota odotas oota ootas älä' },
    { flag: 'honk', stems: 'tööttää töötti töötä tuuttaa tuuttaus soita soittaa äänimerkki torvi piippaa', raw: 'tööt tuut piip' },
    { flag: 'come', stems: 'tänne', raw: 'tule tuu tulee tulkaa' },
    { flag: 'help', raw: 'apua auta' },
    { work: 'take', stems: 'kaiva kauho kauhaise poimi kerää lastaa täytä täyttä nosta', raw: 'ota ottaa otetaan hae hakee' },
    { work: 'give', stems: 'kaada kaata kippaa kippaus tyhjennä tyhjentä pudota pudotta laske laita laitta valaa valu', raw: 'vie viedään pura purkaa puretaan jätä' },
    { work: 'push', stems: 'työnnä työntä työnne puske pukkaa tönäise' },

    { place: 'sand', stems: 'hiekka hiekkakasa hiekkamäki' },
    { place: 'rock', stems: 'kivi kive kiviä kivikasa kivikko louhos kallio' },
    { place: 'hole', stems: 'kuoppa kuopa kuopi monttu montu reikä reiä aukko' },
    { place: 'road', stems: 'väylä', raw: 'tie tien tiet tietä tiehen tieltä tielle tiellä katu kadun katua kadulle kadulla katuja' },
    { place: 'house', stems: 'talo rakennu työmaa koti' },
    { place: 'bridge', stems: 'silta silla', raw: 'joki joen joet joelle joessa jokeen jokea' },
    { place: 'water', stems: 'vesitorni vesi vete vettä' },
    { place: 'forest', stems: 'metsä tukit tukkeja tukei', raw: 'puut puita puille' },
    { place: 'saw', stems: 'saha sahaamo' },
    { place: 'press', stems: 'tiili tiilet tiilikone tiilitehdas puristin tehta' },
    { place: 'crusher', stems: 'murska' },
    { place: 'play', stems: 'leikkipuisto leikkipaikka puisto liukumäki keinu hiekkalaatikko' },
    { place: 'pond', stems: 'lampi lamme lampe' },
    { place: 'clock', stems: 'kellotorni torni raatihuone', raw: 'kello kellon kellolle kelloon' },
    { place: 'there', raw: 'sinne tonne tuonne siihen tuohon töihin' },
  ],
  phrases: [{ words: 'mitä nyt', means: { flag: 'help' } }],
  letters: { r: 'l', j: 'l', d: 't', w: 'v' },
  suffixes: 'any',
  fuzzy: [6, 9],
  clauseBreak: new Set(['ja', 'sitten', 'sit', 'sitte']),
  no: 'ei',
  /** "pelataan" is not "peruuta". */
  notACommand: new Set(['pelataan', 'pelata', 'pelataanko', 'pelaa', 'pelaamme']),
  absorbed: new Set(['auto', 'kone']),
  jumpIn: new Set(['hyppää', 'hypätään', 'mene', 'mee', 'mennään', 'menen', 'vaihda', 'vaihdetaan', 'siirry', 'kiipeä', 'nouse']),
  /** A child's "trukki" is also the word for a log: after any other word in the clause it means the logs. */
  later: new Map([['tukki', { place: 'forest' }]]),
  form(tokens, _at, after, raw) {
    if (after < tokens.length && POSTPOSITIONS.has(tokens[after])) return { form: 'to', next: after + 1 }
    if (raw.endsWith('lle')) return { form: 'to', next: after }
    return { form: ILLATIVE.test(raw) ? 'into' : 'plain', next: after }
  },
}
