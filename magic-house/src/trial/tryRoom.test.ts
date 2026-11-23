/**
 * The page's side of the trial worker: a job answered through a fresh worker that is ended after,
 * a worker that hangs ended on time and given back as a failed trial with its sentence, a worker
 * that breaks rejected; and the jobs the worker does (trial/jobs.ts), each run here in this thread.
 * The worker itself is a stand-in that answers with answerJob, as Silly Billy's validate test does:
 * vitest runs no real Web Worker.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { GiftsJob, TrialJob } from '../protocol'
import { HOUSE_SHELL } from '../engine/world'
import { guardCode, type CodeKind } from '../server/codeKinds'
import { GIFTS_KILL_MS, LOOK_KILL_MS, TRIAL_KILL_MS, TRIAL_MISTAKES } from './api'
import { answerJob, type WorkerAnswer, type WorkerJob } from './jobs'
import { NO_COUNTS } from './lookCheck'
import { tryGifts, tryInWorker, tryLook, tryOwn, tryRoom } from './tryRoom'
import { looksJob } from './twins/looks'

function guarded(kind: CodeKind, body: string): string {
  const g = guardCode(kind, body)
  if (!g.ok) throw new Error(g.error)
  return g.guarded
}

/** A room that throws while it builds, at every level: the trial stops after the builds, so it is quick. */
const JOB: TrialJob = {
  line: 'line-7',
  attempt: 2,
  party: 1,
  seed: 7,
  roll: { kind: 'together', view: 'side' },
  shell: HOUSE_SHELL,
  level: 1,
  room: guarded('room', "r.box([0, 0.5, 0], [4, 1, 2])\nthrow new Error('boom')"),
  walk: guarded('walk', 'yield'),
}

const GIFTS: GiftsJob = { room: 'room-1', gifts: [{ slot: 'head', name: { en: 'Hat', fi: 'Hattu' }, form: 'a hat', code: guarded('gift', 'm.cube()') }] }

describe('the jobs the worker does', () => {
  it('trials a TrialJob and names it in the report', () => {
    const a = answerJob({ kind: 'trial', job: JOB }, () => 0)
    if (a.kind !== 'trial') throw new Error(a.kind)
    expect(a.report).toMatchObject({ line: 'line-7', attempt: 2, passed: false, botSecs: null })
    expect(a.report.sentences.join('\n')).toMatch(/boom \(line 2\)/)
  })

  it('checks the presents in the job', () => {
    const a = answerJob({ kind: 'gifts', job: GIFTS }, () => 0)
    if (a.kind !== 'gifts') throw new Error(a.kind)
    expect(a.report.room).toBe('room-1')
    expect(a.report.checks).toHaveLength(1)
    expect(a.report.checks[0].passed).toBe(false)
  })

  it('checks a LookJob and names it in the report', () => {
    const a = answerJob({ kind: 'look', job: { ...looksJob('box'), line: 'line-9', attempt: 2 } }, () => 0)
    if (a.kind !== 'look') throw new Error(a.kind)
    expect(a.report).toMatchObject({ line: 'line-9', attempt: 2, passed: false, counts: NO_COUNTS })
    expect(a.report.sentences.join('\n')).toMatch(/r\.box builds play/)
  })

  it('refuses an own room it does not have', () => {
    expect(() => answerJob({ kind: 'own', id: 'own:nowhere' }, () => 0)).toThrow(/no own room own:nowhere; there are own:moon-garden/)
  })
})

describe('trying in a worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** A worker that answers with answerJob in this thread, or never, or breaks; and every one made. */
  function fakeWorker(mode: 'answer' | 'hang' | 'break') {
    const made: { terminated: boolean; url: string }[] = []
    class FakeWorker {
      onmessage: ((e: MessageEvent<WorkerAnswer>) => void) | null = null
      onerror: ((e: ErrorEvent) => void) | null = null
      terminated = false
      constructor(
        readonly url: URL,
        readonly opts: WorkerOptions,
      ) {
        made.push({ terminated: false, url: String(url) })
      }
      postMessage(job: WorkerJob) {
        setTimeout(() => {
          if (this.terminated) return
          if (mode === 'answer') this.onmessage!({ data: answerJob(structuredClone(job), () => performance.now()) } as MessageEvent<WorkerAnswer>)
          if (mode === 'break') this.onerror!({ message: '' } as ErrorEvent)
        }, 5)
      }
      terminate() {
        this.terminated = true
        made[made.length - 1].terminated = true
      }
    }
    vi.stubGlobal('Worker', FakeWorker)
    return made
  }

  it('answers through a fresh module worker and ends it', async () => {
    const made = fakeWorker('answer')
    const report = await tryRoom(JOB)
    expect(report).toMatchObject({ line: 'line-7', attempt: 2, passed: false })
    expect(made).toHaveLength(1)
    expect(made[0].url).toMatch(/trial\/worker\.ts$/)
    expect(made[0].terminated).toBe(true)
    const gifts = await tryGifts(GIFTS)
    expect(gifts.checks).toHaveLength(1)
    expect(made).toHaveLength(2)
    const look = await tryLook(looksJob(null))
    expect(look).toMatchObject({ line: 'line-looks', attempt: 1, passed: true, sentences: [], notes: [] })
    expect(made).toHaveLength(3)
    expect(made[2].terminated).toBe(true)
  })

  it('ends a worker that hangs on time and gives back a failed trial that says so', async () => {
    const made = fakeWorker('hang')
    const t0 = performance.now()
    const report = await tryOwn('own:moon-garden', 60)
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(report).toMatchObject({ line: 'own:moon-garden', attempt: 1, passed: false, sentences: [TRIAL_MISTAKES.killed(0.06)], survey: '', botSecs: null, waitSecs: null })
    expect(made[0].terminated).toBe(true)
    expect(await tryInWorker({ kind: 'gifts', job: GIFTS }, 30)).toBeNull()
  })

  it("gives back a look's worker ended on time as a failed check that says so, with no counts", async () => {
    vi.useFakeTimers()
    try {
      const made = fakeWorker('hang')
      const report = tryLook(looksJob(null))
      await vi.advanceTimersByTimeAsync(LOOK_KILL_MS + 1)
      expect(await report).toMatchObject({ line: 'line-looks', attempt: 1, passed: false, sentences: [TRIAL_MISTAKES.killed(LOOK_KILL_MS / 1000)], notes: [], counts: NO_COUNTS })
      expect(made[0].terminated).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('ends a room well past the trial budget, and presents sooner', () => {
    expect(TRIAL_KILL_MS).toBe(90_000)
    expect(GIFTS_KILL_MS).toBeLessThan(TRIAL_KILL_MS)
    expect(LOOK_KILL_MS).toBeLessThan(TRIAL_KILL_MS)
  })

  it('rejects when the worker cannot run at all', async () => {
    fakeWorker('break')
    await expect(tryRoom(JOB)).rejects.toThrow('the trial worker broke: it would not start')
  })
})
