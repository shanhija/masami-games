/**
 * The trial (trial/trial.ts) on rooms written as a designer writes them: text, guarded as the server
 * guards it, compiled behind the sandbox, and trialled from a TrialJob. A plain room passes; each of
 * its broken twins fails with the sentence that names its fault and where (plan.md, The twins), and
 * every claim the reference makes about the trial (engine/api.ts ROOM_PREAMBLE's THE TRIAL,
 * trial/api.ts WALK_PREAMBLE's last paragraph) is shown here.
 */

import { describe, expect, it } from 'vitest'
import { MISTAKES, PASS, TRIAL, type Level } from '../engine/api'
import type { TrialJob } from '../protocol'
import { HOUSE_SHELL } from '../engine/world'
import { guardCode } from '../server/codeKinds'
import type { PartySize } from '../seats/types'
import { TRIAL_MISTAKES, WALK_MISTAKES } from './api'
import { WALK_LONG } from './compile'
import { jobRoom, runTrial, stillRuns, trialJob, type Clock, type TrialResult } from './trial'

const REAL: Clock = () => performance.now()
const LONG = 120_000

/** A body guarded as the server guards it; a test fails on a guard error. */
function guarded(kind: 'room' | 'walk', body: string): string {
  const g = guardCode(kind, body)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

/**
 * The plain room, line by line: a carpet across the room on the house's floor, run between two flags
 * K times (K = 21 + level), one step, finished in the frame the step turns done. Each line's number
 * is the designer's line a sentence names.
 */
const ROOM: readonly string[] = [
  /* 1 */ 'const K = 21 + w.level()',
  /* 2 */ 'const across = 16',
  /* 3 */ "const floor = r.box([0, 0.1, 0], [across, 0.2, 2], { name: 'floor' })",
  /* 4 */ 'w.players().forEach((p, i) => p.putAt([-6 + i, 0.2, 0]))',
  /* 5 */ 'r.wayOut([0, 0, -1])',
  /* 6 */ 'let visits = 0',
  /* 7 */ 'let side = 1',
  /* 8 */ "r.zone([7, 1, 0], [2, 2, 1], { name: 'right', enter: (who) => { if (side === 1) { visits += 1; side = -1 } } })",
  /* 9 */ "r.zone([-7, 1, 0], [2, 2, 1], { name: 'left', enter: (who) => { if (side === -1) { visits += 1; side = 1 } } })",
  /* 10 */ "r.steps([{ hint: { en: 'run to the flags', fi: 'juokse lipuille' }, at: [7, 0, 0], done: () => visits >= K }])",
  /* 11 */ 'return () => {',
  /* 12 */ '  if (w.stepsDone() === 1) w.finish()',
  /* 13 */ '}',
]

/** The plain walkthrough: bot 0 runs to the flags in turn, K times. */
const WALK: readonly string[] = [
  /* 1 */ 'const K = 21 + w.level()',
  /* 2 */ "for (let i = 0; i < K; i++) yield* bots[0].goTo(w.get(i % 2 === 0 ? 'right' : 'left'))",
]

/** The lines with some replaced: { line number: new text }. */
const twin = (lines: readonly string[], changes: Readonly<Record<number, string>>) => lines.map((l, i) => changes[i + 1] ?? l).join('\n')

function job(room: string, walk: string, opts: { party?: PartySize; kind?: 'together' | 'contest' | 'side'; level?: Level } = {}): TrialJob {
  return {
    line: 'line-1',
    attempt: 1,
    party: opts.party ?? 1,
    seed: 50,
    roll: { kind: opts.kind ?? 'together', view: 'side' },
    level: opts.level ?? 1,
    shell: HOUSE_SHELL,
    room: guarded('room', room),
    walk: guarded('walk', walk),
  }
}

const trial = (room: string, walk: string, opts: Parameters<typeof job>[2] = {}, clock: Clock = REAL): TrialResult => runTrial(jobRoom(job(room, walk, opts)), clock)

describe('the trial', () => {
  it(
    'passes the plain room, with its bots’ seconds at each level, the seconds every bot stood idle, the survey at the asking level, and every run',
    () => {
      const report = trialJob(job(twin(ROOM, {}), twin(WALK, {}), { level: 2 }), REAL)
      expect(report.sentences).toEqual([])
      expect(report.passed).toBe(true)
      expect(report.line).toBe('line-1')
      const secs = report.botSecs as Record<Level, number>
      for (const l of [1, 2, 3] as const) {
        expect(secs[l]).toBeGreaterThanOrEqual(PASS.minSecs)
        expect(secs[l]).toBeLessThanOrEqual(PASS.maxSecs)
      }
      // More runs to make at a higher level.
      expect(secs[3]).toBeGreaterThan(secs[1])
      // Only the frames a goTo stands still on arrival: the walkthrough never waits.
      expect(report.waitSecs).toEqual({ 1: 0.2, 2: 0.2, 3: 0.2 })
      expect(report.survey).toMatch(/^The room as built at level 2:\nThe house: its floor's top at y 0, its walls at x -8 and 8, its ceiling at y 8; everything stands inside them\./)
      expect(report.survey).toContain("- the solid 'floor', a box: x -8 to 8, top 0.2, bottom 0; dressable")
      expect(report.survey).toContain("- the zone 'right': x 6 to 8, y 0 to 2")
      expect(report.survey).toContain("Steps: 1 'run to the flags' at 7, 0.")
      expect(report.ms).toBeGreaterThan(0)
      const r = runTrial(jobRoom(job(twin(ROOM, {}), twin(WALK, {}), { level: 2 })), REAL)
      // Still and random at each level, the walkthrough at each, and the asking level again on the second seed; a party of one has no still-bot runs.
      expect(r.runs.map((x) => `${x.kind} ${x.level} ${x.seed}`)).toEqual(['still 1 50', 'still 2 50', 'still 3 50', 'random 1 50', 'random 2 50', 'random 3 50', 'pass 1 50', 'pass 2 50', 'pass 3 50', `second 2 ${50 + TRIAL.secondSeedOffset}`])
      expect(r.runs.find((x) => x.kind === 'still')?.secs).toBe(TRIAL.stillSecs)
      expect(r.runs.find((x) => x.kind === 'random')?.secs).toBe(TRIAL.randomSecs)
    },
    LONG,
  )

  it('counts the seconds in which every bot stood idle', () => {
    const r = trial(twin(ROOM, { 1: 'const K = 11 + w.level()' }), twin(WALK, { 1: 'const K = 11 + w.level()', 2: "yield* w.wait(30)\nfor (let i = 0; i < K; i++) yield* bots[0].goTo(w.get(i % 2 === 0 ? 'right' : 'left'))" }))
    expect(r.sentences).toEqual([])
    // The 30 s of w.wait, and the frames the goTos stand still on arrival.
    expect(r.waitSecs).toEqual({ 1: 30.1, 2: 30.1, 3: 30.1 })
  }, LONG)

  it('fails a room built otherwise when sort calls its compare function in another order, and passes one whose compare function answers the same', () => {
    const ledges = (compare: string) => `const hs = [1, 2, 3, 4]\nhs.sort(${compare}).forEach((h, i) => r.box([-3 + i, 3 + h, 0], [0.5, 0.2, 1]))\nlet visits = 0`
    const shuffled = trial(twin(ROOM, { 6: ledges('() => Math.random() - 0.5') }), twin(WALK, {}))
    expect(shuffled.sentences).toEqual([MISTAKES.sortOrder()])
    expect(trial(twin(ROOM, { 6: ledges('(a, b) => b - a') }), twin(WALK, {})).sentences).toEqual([])
    // The trial puts the page's own sort back.
    expect(Array.prototype.sort.toString()).toContain('[native code]')
  }, LONG)

  describe('broken twins fail with the sentence that names the fault and where', () => {
    it('a room that ends too soon', () => {
      const r = trial(twin(ROOM, { 1: 'const K = 2 + w.level()' }), twin(WALK, { 1: 'const K = 2 + w.level()' }))
      expect(r.passed).toBe(false)
      expect(r.botSecs).toBeNull()
      // Each level's seconds are its own, so each level says its own sentence.
      expect(r.sentences).toHaveLength(3)
      r.sentences.forEach((s, i) => expect(s).toMatch(new RegExp(`^at level ${i + 1}: the walkthrough finished the room in \\d+(\\.\\d)? s, its steps done at (?:[\\d.]+(?:, [\\d.]+)* and )?[\\d.]+ s; a clean pass must take at least 60 s: give the room about \\d+(\\.\\d)? times as much for the players to do, never longer to stand, hold or wait, for about 90 s of play$`)))
      // The times it says are the aim over the seconds it took, so a fix need not work them out.
      for (const s of r.sentences) {
        const [, secs, times] = /in ([\d.]+) s,.*about ([\d.]+) times/.exec(s) as RegExpExecArray
        expect(Number(times)).toBe(Math.round((90 / Number(secs)) * 10) / 10)
      }
    }, LONG)

    it('a room that takes too long', () => {
      const r = trial(twin(ROOM, { 1: 'const K = 39' }), twin(WALK, { 1: 'const K = 39' }))
      expect(r.sentences).toHaveLength(1)
      expect(r.sentences[0]).toMatch(/^at level 1 \(the same at level 2, at level 3\): the walkthrough took 1[23]\d(\.\d)? s, its steps done at (?:[\d.]+(?:, [\d.]+)* and )?[\d.]+ s; a clean pass must take at most 120 s: give the room less to do, for about 90 s of play$/)
    }, LONG)

    it('a walkthrough still playing past the longest pass', () => {
      const r = trial(twin(ROOM, { 1: 'const K = 81' }), twin(WALK, { 1: 'const K = 81' }))
      // It names the call it repeated since the last step turned done.
      expect(r.sentences).toEqual([`at level 1, 150 s into play, with step 1 of 1 next (the same at level 2, at level 3): ${WALK_MISTAKES.notFinished(150, [WALK_MISTAKES.repeated(['bots[0].goTo(...) 47 times'], 0, 0)], [])}`])
    }, LONG)

    it('a step that never turns done', () => {
      const r = trial(twin(ROOM, { 10: "r.steps([{ hint: { en: 'run to the flags', fi: 'juokse lipuille' }, at: [7, 0, 0], done: () => visits > 1000 }])" }), twin(WALK, {}))
      expect(r.sentences).toHaveLength(1)
      expect(r.sentences[0]).toMatch(new RegExp(`^at level 1, \\d+(\\.\\d)? s into play, with step 1 of 1 next \\(the same at level 2, at level 3\\): ${WALK_MISTAKES.unfinished([])}$`))
    }, LONG)

    it('a step already done when its turn comes', () => {
      const r = trial(twin(ROOM, { 10: "r.steps([{ hint: { en: 'run', fi: 'juokse' }, at: [7, 0, 0], done: () => true }, { hint: { en: 'run to the flags', fi: 'juokse lipuille' }, at: [7, 0, 0], done: () => visits >= K }])", 12: '  if (w.stepsDone() === 2) w.finish()' }), twin(WALK, {}))
      expect(r.sentences).toContain(`at level 1 (the same at level 2, at level 3): ${MISTAKES.stillStep(1, 0)}`)
      expect(r.sentences).toContain(`at level 1 (the same at level 2, at level 3): ${WALK_MISTAKES.stepEarly(1)}`)
      // A step done early stops nothing, so the same pass's seconds are judged too: a fix hears all that is wrong at once.
      const short = trial(twin(ROOM, { 1: 'const K = 2 + w.level()', 10: "r.steps([{ hint: { en: 'run', fi: 'juokse' }, at: [7, 0, 0], done: () => true }, { hint: { en: 'run to the flags', fi: 'juokse lipuille' }, at: [7, 0, 0], done: () => visits >= K }])", 12: '  if (w.stepsDone() === 2) w.finish()' }), twin(WALK, { 1: 'const K = 2 + w.level()' }))
      expect(short.sentences).toContain(`at level 1 (the same at level 2, at level 3): ${WALK_MISTAKES.stepEarly(1)}`)
      expect(short.sentences.some((s) => s.startsWith('at level 1: the walkthrough finished the room in '))).toBe(true)
    }, LONG)

    it("a gap too wide to jump between two ledges higher than a jump, over the house's floor", () => {
      const r = trial(
        twin(ROOM, {
          3: "const floor = r.box([-5.5, 1, 0], [5, 2, 2], { name: 'floor' }); r.box([4.25, 1, 0], [7.5, 2, 2], { name: 'far' })",
          4: 'w.players().forEach((p, i) => p.putAt([-6 + i, 2, 0]))',
          8: "r.zone([7, 3, 0], [2, 2, 1], { name: 'right', enter: (who) => { if (side === 1) { visits += 1; side = -1 } } })",
          9: "r.zone([-7, 3, 0], [2, 2, 1], { name: 'left', enter: (who) => { if (side === -1) { visits += 1; side = 1 } } })",
        }),
        twin(WALK, {}),
      )
      // The gap's floor is the house's, and its walls are higher than a jump: a player who drops in is trapped (trial/trap.test.ts).
      expect(r.sentences).toHaveLength(2)
      expect(r.sentences[0]).toBe(`at level 1 (the same at level 2, at level 3): ${MISTAKES.trapped([-2.7, 0], 0, [-6, 2], "the zone 'left'")}`)
      expect(r.sentences[1]).toMatch(/^at level 1, [\d.]+ s into play, with step 1 of 1 next \(the same at level 2, at level 3\): bot 0 found no way from [-\d.]+, 2 to the zone 'right' at 7, 3: the gap from -3, 2 is 3\.5 m across and 0 m up, and a jump carries the feet 3\.1 m across at that height \(line 2\)$/)
      expect(r.survey).toContain("- from the solid 'floor' to the solid 'far': 3.5 m across, 0 m up")
    }, LONG)

    it('a lock with no key: a wall that never opens', () => {
      const r = trial(twin(ROOM, { 7: "let side = 1; r.box([4, 4, 0], [1, 8, 2], { name: 'wall' })" }), twin(WALK, {}))
      expect(r.sentences).toHaveLength(1)
      expect(r.sentences[0]).toMatch(/^at level 1, [\d.]+ s into play, with step 1 of 1 next \(the same at level 2, at level 3\): bot 0 found no way from [-\d.]+, 0\.2 to the zone 'right' at 7, 1: between [-\d.]+, 0\.2 and [-\d.]+, 0\.2 the solid 'wall' \(x 3\.5 to 4\.5\) stands up to y 8, and a jump lifts the feet 1\.6 m \(line 2\)$/)
    }, LONG)

    it('a thrown error in play, on its line, and how often', () => {
      const r = trial(twin(ROOM, { 12: "  if (w.time() > 40) throw new Error('boom')" }), twin(WALK, {}))
      // Standing still lasts only 30 s, so random pressing meets it first.
      expect(r.sentences).toEqual([`while pressing at random at level 1, 40 s into play (the same while pressing at random at level 2, while pressing at random at level 3, at level 1, at level 2, at level 3): ${MISTAKES.thrown('the frame function', 'Error: boom (line 12)')}`])
    }, LONG)

    it('an endless loop in the build', () => {
      const r = trial(twin(ROOM, { 6: 'let visits = 0; while (true) {}' }), twin(WALK, {}))
      expect(r.sentences).toEqual([`at level 1 (the same at level 2, at level 3): ${MISTAKES.buildLong()} (line 6)`])
      expect(r.runs).toEqual([])
    })

    it('an endless loop in the walkthrough', () => {
      const r = trial(twin(ROOM, {}), twin(WALK, { 2: 'while (true) {}' }))
      expect(r.sentences).toEqual([`at level 1, 0 s into play, with step 1 of 1 next (the same at level 2, at level 3): ${WALK_LONG} (line 2)`])
    }, LONG)

    it('a build too heavy', () => {
      const r = trial(twin(ROOM, { 6: 'let visits = 0; for (let i = 0; i < 5000; i++) r.decor([0, 0, -1.5], (m) => m.box(0.1, 0.1, 0.1))' }), twin(WALK, {}))
      expect(r.sentences).toHaveLength(1)
      expect(r.sentences[0]).toMatch(/^at level 1 \(the same at level 2, at level 3\): the build used 5,0\d\d pieces of its 5,000: build it lighter/)
    })

    it('a start in the air', () => {
      const r = trial(twin(ROOM, { 4: 'w.players().forEach((p, i) => p.putAt([-6 + i, 3, 0]))' }), twin(WALK, {}))
      expect(r.sentences).toEqual([`at level 1 (the same at level 2, at level 3): ${MISTAKES.startInAir(0, [-6, 3, 0])}`])
    })

    it("a read used without its call, on the designer's line, in the room and in the walkthrough", () => {
      const r = trial(twin(ROOM, { 12: '  if (w.players()[0].holding) w.finish()' }), twin(WALK, { 2: "yield* w.until(() => w.get('right').hidden, 1)" }))
      expect(r.sentences.slice(0, 2)).toEqual([`the room's code: ${MISTAKES.notCalled('player', 'holding')} (line 12)`, `the walkthrough: ${MISTAKES.notCalled('handle', 'hidden')} (line 2)`])
    })

    it('code that does not compile', () => {
      const r = runTrial({ ...jobRoom(job(twin(ROOM, {}), twin(WALK, {}))), texts: null, room: () => { throw new SyntaxError('Unexpected token') } }, REAL)
      expect(r.sentences).toEqual([TRIAL_MISTAKES.notCompiled("the room's code", 'SyntaxError: Unexpected token')])
    })

    it('a trial past its budget of real time stops where it is', () => {
      let now = 0
      const r = trial(twin(ROOM, {}), twin(WALK, {}), {}, () => (now += 61_000))
      expect(r.sentences).toEqual([TRIAL_MISTAKES.realLong(TRIAL.realSecs, 'everyone stood still at level 1')])
    })
  })

  describe('standing still and pressing at random', () => {
    it('a bonk with everyone standing still', () => {
      const r = trial(twin(ROOM, { 12: '  if (w.time() > 5) w.players()[0].bonk()' }), twin(WALK, {}))
      expect(r.sentences[0]).toBe(`at level 1 (the same at level 2, at level 3): ${MISTAKES.stillBonked(0, 5)}`)
    }, LONG)

    it("a fall out of the room with everyone standing still: the house's floor holds them, so only a room that puts a player below it", () => {
      const r = trial(twin(ROOM, { 12: '  if (w.time() > 2 && w.time() < 2.1) w.players()[0].putAt([-6, -2, 0])' }), twin(WALK, {}))
      expect(r.sentences[0]).toMatch(new RegExp(`^at level 1 \\(the same at level 2, at level 3\\): with everyone standing still player 0 fell out of the room after \\d+(\\.\\d)? s`))
    }, LONG)

    it('a room that ends with everyone standing still', () => {
      const r = trial(twin(ROOM, { 12: '  if (w.time() > 5) w.finish()' }), twin(WALK, {}))
      expect(r.sentences[0]).toBe(`at level 1 (the same at level 2, at level 3): ${MISTAKES.stillEnded(5)}`)
      expect(r.sentences[1].startsWith('with everyone standing still at level 1, 5 s into play')).toBe(true)
      expect(r.sentences[1].endsWith(`: ${MISTAKES.stepUndone(1, 1)} (line 12)`)).toBe(true)
    }, LONG)

    it('a room that random tapping finishes', () => {
      const r = trial(twin(ROOM, { 6: 'let visits = 0; r.tap(() => { visits = 1000 })' }), twin(WALK, {}))
      expect(r.sentences[0]).toMatch(/^at level 1 \(the same at level 2, at level 3\): random pressing and tapping did step 1 after \d+(\.\d)? s, right after a tap on -?\d+(\.\d)?, -?\d+(\.\d)?, which r\.tap took, and finished the room in \d+(\.\d)? s/)
    }, LONG)

    it('a player put elsewhere by the room is not harmed', () => {
      const r = trial(twin(ROOM, { 12: '  if (w.stepsDone() === 1) w.finish(); if (w.time() < 1) w.players()[0].putAt([-5, 0.2, 0])' }), twin(WALK, {}))
      expect(r.sentences).toEqual([])
    }, LONG)
  })

  describe('the kinds', () => {
    const TWO = { 4: 'w.players().forEach((p, i) => p.putAt([-6 + i, 0.2, 0]))' }

    it('together: a bot with no part fails, named by its seat', () => {
      const r = trial(twin(ROOM, TWO), twin(WALK, {}), { party: 2 })
      expect(r.sentences).toEqual([`at level 1: ${WALK_MISTAKES.stillFinished(1)}`])
      expect(r.runs.filter((x) => x.kind === 'stillBot').map((x) => x.still)).toEqual([0, 1])
    }, LONG)

    it('together: every bot needed passes', () => {
      // The right flag counts only the player whose turn it is.
      const room = twin(ROOM, {
        1: 'const K = 11 + w.level()',
        8: "r.zone([7, 1, 0], [2, 2, 1], { name: 'right', enter: (who) => { if (who === w.players()[visits % 2]) visits += 1 } })",
      })
      const walk = twin(WALK, { 1: 'const K = 11 + w.level()', 2: "for (let i = 0; i < K; i++) { yield* bots[i % 2].goTo(w.get('right')); yield* bots[i % 2].goTo(w.get('left')) }" })
      const r = trial(room, walk, { party: 2 })
      expect(r.sentences).toEqual([])
      expect(r.runs.filter((x) => x.kind === 'stillBot')).toHaveLength(2)
    }, LONG)

    it('side by side also has the still-bot runs; a contest has none', () => {
      expect(stillRuns('together', 2)).toBe(true)
      expect(stillRuns('side', 3)).toBe(true)
      expect(stillRuns('contest', 2)).toBe(false)
      expect(stillRuns('together', 1)).toBe(false)
      const r = trial(twin(ROOM, TWO), twin(WALK, {}), { party: 2, kind: 'side' })
      expect(r.sentences).toEqual([`at level 1: ${WALK_MISTAKES.stillFinished(1)}`])
    }, LONG)

    it('a contest finishes with the order, else the engine says so', () => {
      const contest = { 10: "r.rule({ en: 'first to the flags wins', fi: 'nopein lipuille voittaa' }); " + ROOM[9] }
      const r = trial(twin(ROOM, { ...TWO, ...contest }), twin(WALK, {}), { party: 2, kind: 'contest' })
      expect(r.sentences).toHaveLength(1)
      expect(r.sentences[0]).toMatch(new RegExp(`^at level 1, \\d+(\\.\\d)? s into play \\(the same at level 2, at level 3\\): the frame function: ${MISTAKES.order(true).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\(line 12\\)`))
      const ordered = trial(twin(ROOM, { ...TWO, ...contest, 12: '  if (w.stepsDone() === 1) w.finish([w.players()[0], w.players()[1]])' }), twin(WALK, {}), { party: 2, kind: 'contest' })
      expect(ordered.sentences).toEqual([])
      expect(ordered.runs.some((x) => x.kind === 'stillBot')).toBe(false)
    }, LONG)

    it('a room with r.clock is judged by its own clock: its seconds are the clock’s', () => {
      const clockRoom = twin(ROOM, { 1: 'const K = 6 + w.level(); r.clock(180)', 12: '  ' })
      const r = trial(clockRoom, twin(WALK, { 1: 'const K = 6 + w.level()' }))
      expect(r.sentences).toEqual([])
      expect(r.botSecs).toEqual({ 1: 180, 2: 180, 3: 180 })
      const early = trial(twin(ROOM, { 1: 'const K = 2 + w.level(); r.clock(180)' }), twin(WALK, { 1: 'const K = 2 + w.level()' }))
      expect(early.sentences[0]).toMatch(/^at level 1: the walkthrough finished the room in \d+(\.\d)? s, its steps done at (?:[\d.]+(?:, [\d.]+)* and )?[\d.]+ s; a clean pass must take at least 60 s: give the room about \d+(\.\d)? times as much for the players to do, never longer to stand, hold or wait, for about 90 s of play$/)
      const out = trial(twin(ROOM, { 1: 'const K = 6 + w.level(); r.clock(180)', 10: "r.steps([{ hint: { en: 'run', fi: 'juokse' }, at: [7, 0, 0], done: () => visits >= 1000 }])", 12: '  ' }), twin(WALK, { 2: 'yield* w.wait(200)' }))
      expect(out.sentences).toEqual([`at level 1 (the same at level 2, at level 3): ${WALK_MISTAKES.clockOut(1, 1)}`])
    }, LONG)

    it('fails a room whose levels are all alike: built the same, its steps done at the same seconds; a room that scales by w.level() passes', () => {
      const alike = trial(twin(ROOM, { 1: 'const K = 22' }), twin(WALK, { 1: 'const K = 22' }))
      expect(alike.passed).toBe(false)
      expect(alike.sentences).toEqual([WALK_MISTAKES.levelsAlike(alike.runs.find((x) => x.kind === 'pass')!.secs)])
      // Its survey is that of level 1, where it was built.
      expect(alike.survey.startsWith('The room as built at level 1:')).toBe(true)
      // Decor is not the room as built: the level read only for decor changes nothing a child does.
      const decor = trial(twin(ROOM, { 1: 'const K = 22', 5: 'r.wayOut([0, 0, -1]); r.decor([-4 + w.level(), 0, -1.5], (m) => m.box(0.5, 0.5, 0.5))' }), twin(WALK, { 1: 'const K = 22' }))
      expect(decor.sentences).toEqual(alike.sentences)
      // A solid placed by the level is a room built otherwise at each level: what it asks is the room's own business, and it passes.
      const ledge = trial(twin(ROOM, { 1: 'const K = 22', 5: 'r.wayOut([0, 0, -1]); r.box([-4 + w.level(), 6, 0], [1, 0.5, 2])' }), twin(WALK, { 1: 'const K = 22' }))
      expect(ledge.sentences).toEqual([])
    }, LONG)

    it(`gives the room ${TRIAL.doneSecs} s after the walkthrough's end to finish`, () => {
      const late = (secs: number) => twin(ROOM, { 12: `  if (w.stepsDone() === 1 && !waiting) { waiting = true; w.after(${secs}, () => w.finish()) }`, 7: 'let side = 1; let waiting = false' })
      expect(trial(late(TRIAL.doneSecs - 2), twin(WALK, {})).sentences).toEqual([])
      expect(trial(late(TRIAL.doneSecs + 2), twin(WALK, {})).sentences[0]).toMatch(/with every step done \(the same at level 2, at level 3\): the walkthrough ended and the room was not finished$/)
    }, LONG)
  })
})
