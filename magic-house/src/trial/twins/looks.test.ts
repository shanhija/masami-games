/**
 * The look's check (trial/lookCheck.ts) on the look's twins (twins/looks.ts): the base look on the
 * fixture room passes with nothing left out; each twin fails with exactly its sentence, or keeps its
 * wardrobe out with exactly its note, at every level; the room's own trial passes and never sees a
 * look, and building any twin leaves the room as it was. A check, the heaviest look the limits allow
 * included, takes under half a second where the worker runs it (trial/jobs.ts answerJob).
 */

import { describe, expect, it } from 'vitest'
import { MISTAKES } from '../../engine/api'
import { LOOK_BUDGET, LOOK_MISTAKES, LOOK_NOTES, LOOK_WHY } from '../../engine/look'
import { buildLook, LookBuildError } from '../../engine/lookBuilder'
import { plainParty } from '../../engine/party'
import { buildRoom, RoomRuntime } from '../../engine/room'
import { surveyText } from '../../engine/survey'
import { compileLook, compileRoom, LookRuntime } from '../compile'
import { answerJob } from '../jobs'
import { lookJob } from '../lookCheck'
import { trialJob } from '../trial'
import { guarded, HEAVIEST_LOOK, LOOK_TWINS, LOOKS_ROOM, looksJob, looksTrialJob, type LookTwinName } from './looks'

const REAL = () => performance.now()
const ALL = 'at levels 1, 2 and 3: '

describe("the look's twins", () => {
  it('passes the base look on the fixture room, nothing left out, its props in all four quarters', () => {
    const report = lookJob(looksJob(null), REAL)
    expect(report).toMatchObject({ line: 'line-looks', attempt: 1, passed: true, sentences: [], notes: [] })
    expect(report.counts).toEqual({ pieces: 54, props: 8, answering: 8, quarters: 4, lights: 31, lamps: 1, leftOut: 0, of: 26 })
  })

  it.each<[LookTwinName, readonly string[], readonly string[]]>([
    ['thrown', [`${ALL}${LOOK_MISTAKES.thrown("TypeError: Cannot read properties of undefined (reading 'toUpperCase') (line 2)")}`], []],
    ['heavy', [`${ALL}${LOOK_MISTAKES.lookLighter(3001)} (line 5)`], []],
    ['box', [`${ALL}${LOOK_MISTAKES.notLooks('r.box')} (line 12)`], []],
    ['notDressable', [`${ALL}${LOOK_MISTAKES.notDressable([0, 5, 0], LOOK_WHY.notPlain)} (line 7)`], []],
    ['bareHalf', [`${ALL}${LOOK_MISTAKES.fewAnswer(3, 'the lower right quarter')}`], []],
    ['lamps', [`${ALL}${LOOK_MISTAKES.lampsTogether(2, 11)}`], []],
    ['wardrobe', [], [`${ALL}${LOOK_NOTES.outOfPlace('r.decor', [0, 0, 1.2], LOOK_WHY.frontTall(2))}`]],
    [
      'leftOut',
      [`${ALL}${LOOK_MISTAKES.tooManyLeftOut(60, 86)}`],
      Array.from({ length: 20 }, (_, i) => `${ALL}${LOOK_NOTES.inPlay('r.decor', [Math.round((-0.5 + i * 0.05) * 100) / 100, 4.9, -1.5], "the solid 'blue shelf'")}`),
    ],
  ])('%s: its sentences and notes exactly', (twin, sentences, notes) => {
    const report = lookJob(looksJob(twin), REAL)
    expect(report.sentences).toEqual(sentences)
    expect(report.notes).toEqual(notes)
    expect(report.passed).toBe(sentences.length === 0)
  })

  it("says as data, not only in its sentence, when the room's own code did not build at a level: the room's fault, not the look's", () => {
    expect(lookJob(looksJob(null), REAL).roomUnbuilt).toBe(false)
    const job = looksJob(null)
    const broken = { ...job, room: guarded('room', ['if (w.level() === 3) r.box([0, -1, 0], [1, 1, 1])', ...LOOKS_ROOM].join('\n')) }
    const report = lookJob(broken, REAL)
    expect([report.passed, report.roomUnbuilt]).toEqual([false, true])
    expect(report.sentences).toEqual([`at level 3: ${LOOK_MISTAKES.roomUnbuilt(`${MISTAKES.outside('r.box', [0, -1, 0])} (line 1)`)}`])
  })

  it('every twin is named for what it is', () => {
    expect(Object.keys(LOOK_TWINS).sort()).toEqual(['bareHalf', 'box', 'heavy', 'lamps', 'leftOut', 'notDressable', 'thrown', 'wardrobe'])
  })

  it("leaves the room as it was, whatever the look does: the same World and survey at every level, with each twin as without a look", () => {
    for (const twin of [null, ...(Object.keys(LOOK_TWINS) as LookTwinName[])]) {
      const job = looksJob(twin)
      for (const level of [1, 2, 3] as const) {
        const start = { seed: job.seed, level, kind: job.roll.kind, view: job.roll.view, shell: job.shell, party: plainParty(job.party) }
        const bareRt = new RoomRuntime()
        const bare = buildRoom(compileRoom(job.room, bareRt), start, bareRt)
        const rt = new RoomRuntime()
        const room = buildRoom(compileRoom(job.room, rt), start, rt)
        const lrt = new LookRuntime()
        try {
          buildLook(room, compileLook(job.look, lrt), lrt)
        } catch (err) {
          if (!(err instanceof LookBuildError)) throw err
        }
        expect(room.world, `${twin} at level ${level}`).toEqual(bare.world)
        expect(surveyText(room.survey, (id) => room.describe(id))).toBe(surveyText(bare.survey, (id) => bare.describe(id)))
      }
    }
  })

  it("passes the fixture room's own trial, which never sees a look", () => {
    const job = looksTrialJob()
    expect(Object.keys(job)).not.toContain('look')
    const report = trialJob(job, REAL)
    expect(report.sentences).toEqual([])
    expect(report.passed).toBe(true)
  }, 120_000)
})

describe('a check where the worker runs it', () => {
  it('takes under half a second, the heaviest look the limits allow included', () => {
    const job = { ...looksJob(null), look: guarded('look', HEAVIEST_LOOK.join('\n')) }
    const answer = answerJob({ kind: 'look', job }, REAL)
    if (answer.kind !== 'look') throw new Error(answer.kind)
    expect(answer.report.sentences).toEqual([])
    expect(answer.report.notes).toEqual([])
    expect(answer.report.counts).toMatchObject({ props: LOOK_BUDGET.props, answering: LOOK_BUDGET.props, lights: LOOK_BUDGET.lights, lamps: 10, pieces: 2929 + 1 + 10 })
    expect(answer.report.ms).toBeLessThan(500)
  })
})
