/**
 * Magic House: the page's side of the trial worker (plan.md, Where things run). A new room is tried
 * in a fresh Web Worker (trial/worker.ts), so the page keeps playing at its frame rate while minutes
 * of play are tried in seconds. The trial stops itself past TRIAL.realSecs of the worker's time
 * (TRIAL_MISTAKES.realLong); the page ends the worker well past that, should anything hang where
 * nothing counts, and gives that back as a failed trial with its sentence (TRIAL_MISTAKES.killed).
 * A worker that cannot start, or breaks while it works, is the game's fault and not the room's:
 * that rejects. A room's presents and a room's look (step 7a) are checked in a fresh worker the same
 * way, each ended well past what its counted check could take. On the pattern of Silly Billy's
 * brain/validate.ts validateInWorker.
 */

import type { GiftsJob, GiftsReport, LookJob, LookReport, TrialJob, TrialReport } from '../protocol'
import { GIFTS_KILL_MS, LOOK_KILL_MS, TRIAL_KILL_MS, TRIAL_MISTAKES } from './api'
import type { WorkerAnswer, WorkerJob } from './jobs'
import { NO_COUNTS } from './lookCheck'

/**
 * Runs one job in a fresh worker, ended after its answer or after `killMs`: the answer, or null
 * when it was ended for taking too long.
 */
export function tryInWorker(job: WorkerJob, killMs: number): Promise<WorkerAnswer | null> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  return new Promise<WorkerAnswer | null>((resolve, reject) => {
    const end = () => {
      clearTimeout(timer)
      worker.terminate()
    }
    const timer = setTimeout(() => {
      end()
      resolve(null)
    }, killMs)
    worker.onmessage = (e: MessageEvent<WorkerAnswer>) => {
      end()
      resolve(e.data)
    }
    worker.onerror = (e: ErrorEvent) => {
      end()
      // A module that cannot load gives a bare error event with no message.
      reject(new Error(`the trial worker broke: ${e.message || 'it would not start'}`))
    }
    worker.postMessage(job)
  })
}

/** A room's trial in the worker; `line` and `attempt` name it in a report of a worker ended. */
async function trialIn(job: WorkerJob, line: string, attempt: TrialReport['attempt'], killMs: number): Promise<TrialReport> {
  const t0 = performance.now()
  const answer = await tryInWorker(job, killMs)
  if (answer === null) return { line, attempt, passed: false, sentences: [TRIAL_MISTAKES.killed(killMs / 1000)], survey: '', botSecs: null, waitSecs: null, ms: Math.round(performance.now() - t0) }
  if (answer.kind !== 'trial') throw new Error(`the trial worker answered a room's trial with ${answer.kind}`)
  return answer.report
}

/** Tries a new room (POST ./api/trial gets the report). */
export function tryRoom(job: TrialJob): Promise<TrialReport> {
  return trialIn({ kind: 'trial', job }, job.line, job.attempt, TRIAL_KILL_MS)
}

/** Tries one of the game's own rooms by its id, ending the worker after `killMs` (the debug handle's tryOwn: a headless check of the frame time while the worker works, and of a worker ended on time). */
export function tryOwn(id: string, killMs: number): Promise<TrialReport> {
  return trialIn({ kind: 'own', id }, id, 1, killMs)
}

/** Checks a room's presents (POST ./api/gift-trial gets the report); a worker ended fails every present with the same sentence. */
export async function tryGifts(job: GiftsJob): Promise<GiftsReport> {
  const answer = await tryInWorker({ kind: 'gifts', job }, GIFTS_KILL_MS)
  if (answer === null) return { room: job.room, checks: job.gifts.map(() => ({ passed: false, sentences: [TRIAL_MISTAKES.killed(GIFTS_KILL_MS / 1000)] })) }
  if (answer.kind !== 'gifts') throw new Error(`the trial worker answered the presents with ${answer.kind}`)
  return answer.report
}

/** Checks a room's look (POST ./api/look-trial gets the report); a worker ended fails the look with the worker's sentence and no counts. */
export async function tryLook(job: LookJob): Promise<LookReport> {
  const t0 = performance.now()
  const answer = await tryInWorker({ kind: 'look', job }, LOOK_KILL_MS)
  if (answer === null)
    return { line: job.line, attempt: job.attempt, check: job.check, passed: false, roomUnbuilt: false, sentences: [TRIAL_MISTAKES.killed(LOOK_KILL_MS / 1000)], notes: [], counts: NO_COUNTS, ms: Math.round(performance.now() - t0) }
  if (answer.kind !== 'look') throw new Error(`the trial worker answered a look's check with ${answer.kind}`)
  return answer.report
}
