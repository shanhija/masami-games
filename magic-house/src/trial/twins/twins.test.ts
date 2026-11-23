/**
 * The proof that the trial catches what is wrong (plan.md, The twins). The base, the own
 * room Pirate Sails written again as made code (base.ts), passes the whole trial at every level as
 * its TypeScript original does; each broken twin (twins.ts) fails with exactly the sentences that
 * name its fault and where: the designer's line for code, metres for a place. Each twin's sentences
 * are all it gets, so none blames the wrong thing.
 */

import { describe, expect, it } from 'vitest'
import { MISTAKES, PASS, TRIAL, type Level } from '../../engine/api'
import { plainParty } from '../../engine/party'
import { buildRoom, RoomRuntime } from '../../engine/room'
import { surveyText } from '../../engine/survey'
import { ownRoomFor } from '../../own/rooms'
import { WALK_MISTAKES } from '../api'
import { WALK_LONG } from '../compile'
import { handRoom, jobRoom, runTrial, type TrialResult } from '../trial'
import { BASE_ROOM, BASE_WALK } from './base'
import { lineIn, TWINS, twinJob, twinTexts, type TwinName } from './twins'

const REAL = () => performance.now()
const LONG = 60_000

/** A number the sentence's own run decides (seconds into play, where a bot stood): any number there. */
const ANY = 987654321
/** The same at the other levels or runs, when the sentence says so. */
const SAME = '<same>'
/** When each step turned done, as a short or long pass says it: "10.8, 23.8 and 44.9 s". */
const STEPS = '<steps>'

/** A sentence as a pattern: ANY stands for any number, SAME for an optional "(the same ...)", STEPS for the steps' times; the rest is exact. */
function pattern(text: string): RegExp {
  const esc = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(
    `^${esc
      .split(String(ANY))
      .join('-?[\\d,]+(?:\\.\\d+)?')
      .split(SAME)
      .join('(?: \\(the same [^)]*\\))?')
      .split(STEPS)
      .join('(?:[\\d.]+(?:, [\\d.]+)* and )?[\\d.]+ s')}$`,
  )
}

/** What each twin must get: the guard's one sentence, or the trial's sentences (all of them, in order), each with the designer's line worked out from the twin's text. */
type Expect = (lines: { room: (find: string) => number; walk: (find: string) => number }) => { guard: string } | { trial: readonly string[] }

const GOTO = "bot.goTo(w.get('rope-"
const atLevels = (body: string) => `at level 1${SAME}: ${body}`
const playing = (step: string, body: string) => `at level 1, ${ANY} s into play, ${step}${SAME}: ${body}`
const noWay = (seat: number, to: string, why: string, line: number) => `bot ${seat} found no way from ${ANY}, ${ANY} to ${to}: ${why} (line ${line})`
const GLOW = "TypeError: Cannot read properties of undefined (reading 'glow')"

const EXPECT: Record<TwinName, Expect> = {
  // The gap measured from the fore crow's nest's end to the lookout, as built: the only floor near enough to jump from, since the lookout is too high to reach from the bow or the yards below.
  gap: (l) => ({ trial: [playing('with step 3 of 3 next', noWay(2, "the zone 'rope-bow' at 7.5, 5.7", 'the gap from 3.7, 4.2 is 3.2 m across and 0.8 m up, and a jump carries the feet 2.7 m across at that height', l.walk(GOTO)))] }),
  ledge: (l) => ({ trial: [playing('with step 3 of 3 next', noWay(0, "the zone 'rope-mainNest' at -2.3, 5.6", 'from -3.2, 2.8 the floor above, at -3.2, 4.9, is 2.1 m up, and a jump lifts the feet 1.6 m', l.walk(GOTO)))] }),
  // The solid in the way, by its name, where it stands and how high.
  lock: (l) => ({ trial: [playing('with step 2 of 3 next', noWay(3, "the zone 'rope-stern' at -6, 2.1", `between ${ANY}, 0 and ${ANY}, 1.4 the solid 'gate' (x -5.4 to -5) stands up to y 8, and a jump lifts the feet 1.6 m`, l.walk(GOTO)))] }),
  waitLock: (l) => ({ trial: [playing('with step 1 of 3 next', `${WALK_MISTAKES.untilNever(30)} (line ${l.walk("w.get('gate').hidden()")})`)] }),
  // Judged on the room as built, before anyone plays: the nearest place below the lookout the fourth player can drop to (the fore crow's nest), their start, and the rope they lose there. Then the walkthrough meets it too: the bots need the bow rope again once the fourth player has dropped off for the stern's.
  trap: (l) => ({
    trial: [
      atLevels(MISTAKES.trapped([3.8, 4.2], 3, [7.5, 5], "the zone 'rope-bow'")),
      playing('with step 3 of 3 next', noWay(2, "the zone 'rope-bow' at 7.5, 5.7", 'the gap from 3.7, 4.2 is 3.2 m across and 0.8 m up, and a jump carries the feet 2.7 m across at that height', l.walk(GOTO))),
    ],
  }),
  neverDone: (l) => ({ trial: [playing('with step 3 of 3 next', `${WALK_MISTAKES.untilNever(30)} (line ${l.walk('w.until(() => w.stepsDone() === 3)')})`)] }),
  early: () => ({ trial: [atLevels(WALK_MISTAKES.stepEarly(2))] }),
  // Stopped inside the coins' model, which the kit runs where r.decor places it: both lines are named.
  buildLoop: (l) => ({ trial: [atLevels(`${MISTAKES.buildLong()} (line ${l.room('k < 7; k + 1)')}, called from line ${l.room('const coins = r.decor(')})`)] }),
  // One sentence: once the loop has spent the frame's budget, the rest of that frame (step 1's done()) is skipped, never blamed.
  frameLoop: (l) => ({ trial: [`while pressing at random at level 1, ${ANY} s into play${SAME}: ${MISTAKES.frameLong('the frame function')} (line ${l.room('while (count > 0)')})`] }),
  thrown: (l) => ({ trial: [`with everyone standing still at level 1, 0 s into play${SAME}: ${MISTAKES.thrown('the frame function', `${GLOW} (line ${l.room("ropes.get('rope-' + name)")})`)}`] }),
  heavy: (l) => ({ trial: [atLevels(`${MISTAKES.buildLighter(ANY)} (line ${l.room('x += 0.02) r.decor(')})`).replace('987,654,321', String(ANY))] }),
  short: () => ({ trial: [1, 2, 3].map((level) => `at level ${level}: ${WALK_MISTAKES.tooShort(ANY, STEPS, ANY)}`) }),
  long: () => ({ trial: [1, 2, 3].map((level) => `at level ${level}: ${WALK_MISTAKES.tooLong(ANY, STEPS)}`) }),
  // The solid the body is inside, by its name.
  inWall: () => ({ trial: [atLevels(MISTAKES.startStuck(0, [-6.5, 0, 0], "their body is inside the solid 'stern'"))] }),
  inAir: () => ({ trial: [atLevels(MISTAKES.startInAir(0, [-3.4, 2, 0]))] }),
  notNeeded: () => ({ trial: [0, 1, 2, 3].map((seat) => `at level 1: ${WALK_MISTAKES.stillFinished(seat)}`) }),
  randomBreaks: (l) => ({ trial: [`while pressing at random at level 1, ${ANY} s into play${SAME}: ${MISTAKES.thrown(`player ${ANY}'s button b press`, `${GLOW} (line ${l.room('zones.get(ropeNames.find(')})`)}`] }),
  // When random input did step 1, the last step and the finish. Random pulling at the rope by the starts does step 1 on its own, as it may, before any knock on the chest, so no tap is named for it; the knock on the chest (the decor at 0.4, 0) right before the last step is.
  randomFinishes: () => ({ trial: [atLevels(MISTAKES.randomFinished(ANY, { secs: ANY, tap: null }, { step: 3, secs: ANY, tap: 'the decor at 0.4, 0' }))] }),
  randomPlace: (l) => ({ trial: [atLevels(`${MISTAKES.randomInPlace()} (line ${l.room('r.mover(')})`)] }),
  // A call written over several lines is named by the line it starts on; the sentence names the part of it.
  longWords: (l) => ({ trial: [atLevels(`${MISTAKES.tooManyWords("r.steps: step 2's hint", 'English', 9, 8)} (line ${l.room('r.steps([')})`)] }),
  oneLanguage: (l) => ({ trial: [atLevels(`${MISTAKES.notWords('r.controls b word')} (line ${l.room('r.controls(players, {')})`)] }),
  notCalled: (l) => ({ trial: [`the room's code: ${MISTAKES.notCalled('handle', 'hidden')} (line ${l.room('if (open[sail].hidden) {')})`] }),
  badName: (l) => ({
    trial: [
      playing(
        'with step 1 of 3 next',
        `${WALK_MISTAKES.noName('rope_aft', ['stern', 'bow', ...['stern', 'aft', 'mainLow', 'mainHigh', 'mainNest', 'middle', 'foreHigh', 'foreNest', 'foreLow', 'fore', 'bow'].map((n) => `rope-${n}`), 'sails'])} (line ${l.walk("w.get('rope_'")})`,
      ),
    ],
  }),
  notYielded: (l) => ({ trial: [playing('with step 1 of 3 next', `${WALK_MISTAKES.notYielded('bots[3].goTo(...)')} (line ${l.walk("bot.goTo(w.get('rope-")})`)] }),
  // Stopped inside the helper the loop calls: the loop's line is named after it.
  walkLoop: (l) => ({ trial: [playing('with step 1 of 3 next', `${WALK_LONG} (line ${l.walk('const opened = ')}, called from line ${l.walk("bot.hold('b', 0.5)")})`)] }),
  syntax: (l) => ({ guard: `the room's code: SyntaxError: Unexpected token (line ${l.room('let sail = = 0')})` }),
  forbidden: (l) => ({ guard: `the room's code: ReferenceError: Date is not defined (made code has its own names, its args and plain JavaScript like Math) (line ${l.room('Date.now()')})` }),
  luck: (l) => ({
    trial: [
      `at level 1 on the second seed, ${ANY} s into play, with step 2 of 3 next: ${noWay(3, "the zone 'rope-stern' at -6, 2.1", `between ${ANY}, 0 and ${ANY}, 1.4 the solid 'gate' (x -5.4 to -5) stands up to y 8, and a jump lifts the feet 1.6 m`, l.walk(GOTO))}`,
    ],
  }),
  noFinish: () => ({ trial: [playing('with every step done', WALK_MISTAKES.unfinished([]))] }),
  // Named by the line of the w.finish call; the run's seconds are not judged too, since it was no clean pass.
  finishEarly: (l) => ({ trial: [`at level 1, ${ANY} s into play${SAME}: ${MISTAKES.stepUndone(3, 3)} (line ${l.room('w.after(5, () => w.finish())')})`] }),
}

const trialOf = (room: string, walk: string): TrialResult => {
  const { job, error } = twinJob({ room, walk })
  if (job === null) throw new Error(error)
  return runTrial(jobRoom(job), REAL)
}

describe('the broken twins', () => {
  it(
    'start from a base that passes the whole trial at every level, its bots’ seconds those of its TypeScript original',
    () => {
      const base = trialOf(BASE_ROOM, BASE_WALK)
      expect(base.sentences).toEqual([])
      expect(base.passed).toBe(true)
      const original = runTrial(handRoom(ownRoomFor(4)), REAL)
      expect(original.passed).toBe(true)
      for (const level of [1, 2, 3] as const) {
        const secs = (base.botSecs as Record<Level, number>)[level]
        expect(secs).toBeGreaterThanOrEqual(PASS.minSecs)
        expect(secs).toBeLessThanOrEqual(PASS.maxSecs)
        expect(secs).toBe((original.botSecs as Record<Level, number>)[level])
      }
      // Played together by four: each bot in turn stands still and the room stays unfinished.
      expect(base.runs.filter((r) => r.kind === 'stillBot').map((r) => r.still)).toEqual([0, 1, 2, 3])
      expect(base.ms).toBeLessThan(TRIAL.realSecs * 1000)
    },
    LONG,
  )

  it('start from a base that builds the very room its TypeScript original builds, at every level', () => {
    // One source in spirit: a change to Pirate Sails or to the base turns this red until the other follows.
    const { job } = twinJob({ room: BASE_ROOM, walk: BASE_WALK })
    const base = jobRoom(job as NonNullable<typeof job>)
    const original = handRoom(ownRoomFor(4))
    const surveyOf = (t: typeof base, level: Level) => {
      const runtime = new RoomRuntime()
      const room = buildRoom(t.room(runtime), { seed: t.seed, level, kind: t.roll.kind, view: t.roll.view, shell: t.shell, party: plainParty(t.party) }, runtime)
      // The build's count of loop turns is the guard's, which the TypeScript original has none of.
      return surveyText(room.survey, (id) => room.describe(id)).replace(/ and \d[\d,]* loop turns and calls of /, ' of ')
    }
    expect([base.seed, base.party, base.roll]).toEqual([original.seed, original.party, original.roll])
    for (const level of [1, 2, 3] as const) expect(surveyOf(base, level), `level ${level}`).toBe(surveyOf(original, level))
  })

  it('are each a small edit of the base, and at least a dozen', () => {
    expect(Object.keys(TWINS).length).toBeGreaterThanOrEqual(12)
    for (const twin of Object.values(TWINS)) {
      const texts = twinTexts(twin)
      expect(texts.room !== BASE_ROOM || texts.walk !== BASE_WALK, twin.name).toBe(true)
      expect(twin.edits.length, twin.name).toBeLessThanOrEqual(3)
    }
  })

  it.each(Object.keys(TWINS) as TwinName[])(
    '%s fails with the sentences that name its fault and where, and no other',
    (name) => {
      const twin = TWINS[name]
      const texts = twinTexts(twin)
      const want = EXPECT[name]({ room: (find) => lineIn(texts.room, find), walk: (find) => lineIn(texts.walk, find) })
      const { job, error } = twinJob(texts)
      if ('guard' in want) {
        expect(job, twin.name).toBeNull()
        expect(error).toBe(want.guard)
        return
      }
      expect(error, twin.name).toBeNull()
      const r = runTrial(jobRoom(job as NonNullable<typeof job>), REAL)
      expect(r.passed, twin.name).toBe(false)
      expect(r.botSecs).toBeNull()
      expect(r.sentences.length, `${twin.name}:\n${r.sentences.join('\n')}`).toBe(want.trial.length)
      want.trial.forEach((s, i) => expect(r.sentences[i], twin.name).toMatch(pattern(s)))
      // The survey of the room as built goes back with every failure whose room built.
      if (r.runs.length > 0) expect(r.survey).toMatch(/^The room as built at level/)
    },
    LONG,
  )
})
