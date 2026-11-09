#!/usr/bin/env node
/**
 * Marking the kept voice clips (silly-billy/library/voice/) with what was really said and who
 * said it, for tools/bench.mjs to measure against. Plays each clip not yet marked, newest first,
 * shows what the game heard, and writes the answer into the clip's JSON (`said`, `who`). Run by
 * hand from the repo root:
 *
 *   node silly-billy/tools/mark.mjs                 # the clips not yet marked
 *   node silly-billy/tools/mark.mjs --all           # every clip, marked ones too
 *   node silly-billy/tools/mark.mjs --clips <folder>
 *
 * For each clip: Enter keeps what the game heard as what was said, or type the right words; '-'
 * for nothing said (noise or silence); 'r' plays it again; 's' skips; 'q' stops. Then who said
 * it: '3', '5', 'a' for the adult, or Enter for the same as the last clip.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const args = process.argv.slice(2)
const at = args.indexOf('--clips')
const CLIPS = path.resolve(at < 0 ? path.join(ROOT, 'silly-billy', 'library', 'voice') : args[at + 1])
const ALL = args.includes('--all')

const player = ['paplay', 'pw-play', 'aplay'].find((p) => spawnSync('which', [p]).status === 0)
if (player === undefined) console.log('no paplay, pw-play or aplay: the clips will not be played')
const play = (file) => player !== undefined && spawnSync(player, [file], { stdio: 'ignore' })

const names = fs
  .readdirSync(CLIPS)
  .filter((f) => f.endsWith('.wav'))
  .map((f) => f.slice(0, -4))
  .sort()
  .reverse()
const todo = names.filter((n) => ALL || typeof JSON.parse(fs.readFileSync(path.join(CLIPS, `${n}.json`), 'utf8')).said !== 'string')
console.log(`${todo.length} of ${names.length} clips to mark in ${CLIPS}`)

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
// Lines read as they come, so answers typed ahead (or piped in) are not lost; the end of the input stops.
const lines = rl[Symbol.asyncIterator]()
const ask = async (prompt) => {
  process.stdout.write(prompt)
  const { value, done } = await lines.next()
  return done ? 'q' : value.trim()
}
const WHO = { 3: '3', 5: '5', a: 'adult' }
let lastWho = null
for (const [i, name] of todo.entries()) {
  const file = path.join(CLIPS, `${name}.json`)
  const clip = JSON.parse(fs.readFileSync(file, 'utf8'))
  const s = clip.sound
  console.log(`\n[${i + 1}/${todo.length}] ${name}${s ? `  ${s.seconds} s, pitch ${s.pitchHz ?? '-'} Hz, voice ${s.voiceDb} dB` : ''}`)
  console.log(`  heard: ${clip.text === '' ? '(nothing)' : clip.text}${clip.raw !== clip.text ? `   (Whisper wrote: ${clip.raw})` : ''}`)
  if (typeof clip.said === 'string') console.log(`  marked before: ${clip.said === '' ? '(nothing)' : clip.said}, who: ${clip.who ?? '-'}`)
  let said
  for (;;) {
    play(path.join(CLIPS, `${name}.wav`))
    said = await ask('  said (Enter: as heard, -: nothing, r: again, s: skip, q: stop)> ')
    if (said !== 'r') break
  }
  if (said === 'q') break
  if (said === 's') continue
  const who = (await ask(`  who (3, 5, a${lastWho ? `, Enter: ${lastWho}` : ''})> `)).toLowerCase()
  clip.said = said === '' ? clip.text : said === '-' ? '' : said
  clip.who = WHO[who] ?? (who === '' ? lastWho : who)
  lastWho = clip.who
  fs.writeFileSync(file, `${JSON.stringify(clip, null, 2)}\n`)
}
rl.close()
