/**
 * Magic House: what the page asks its trial worker and what the worker answers (trial/worker.ts
 * wires this to the worker's messages; trial/tryRoom.ts is the page's side). A new room's trial
 * (a TrialJob's guarded text), a room's presents (a GiftsJob), a room's look (a LookJob, step 7a:
 * trial/lookCheck.ts), or one of the game's own rooms by
 * its id: that last one is for developers, so a headless check can load the worker with the
 * heaviest real trial there is while a room plays on the page (the debug handle's tryOwn).
 *
 * Pure: the worker passes performance.now as the clock. Nothing here reaches a .tsx file, Vite or
 * the guard (compile.test.ts walks the imports).
 */

import { OWN_ROOMS } from '../own/rooms'
import type { GiftsJob, GiftsReport, LookJob, LookReport, TrialJob, TrialReport } from '../protocol'
import { checkGifts } from './giftCheck'
import { lookJob } from './lookCheck'
import { handRoom, reportOf, runTrial, trialJob, type Clock } from './trial'

/** One job for the worker. */
export type WorkerJob =
  | { readonly kind: 'trial'; readonly job: TrialJob }
  | { readonly kind: 'gifts'; readonly job: GiftsJob }
  | { readonly kind: 'look'; readonly job: LookJob }
  /** An own room (own/rooms/, by its `own:<name>` id) trialled as the room tests trial it; its report's line is the id. */
  | { readonly kind: 'own'; readonly id: string }

/** The worker's one answer: a room's report (for 'trial' and 'own'), the presents' or the look's. */
export type WorkerAnswer = { readonly kind: 'trial'; readonly report: TrialReport } | { readonly kind: 'gifts'; readonly report: GiftsReport } | { readonly kind: 'look'; readonly report: LookReport }

/** Does the job: compiles, runs the trial or checks the presents or the look, and gives back the report. */
export function answerJob(job: WorkerJob, clock: Clock): WorkerAnswer {
  switch (job.kind) {
    case 'trial':
      return { kind: 'trial', report: trialJob(job.job, clock) }
    case 'gifts':
      return { kind: 'gifts', report: checkGifts(job.job) }
    case 'look':
      return { kind: 'look', report: lookJob(job.job, clock) }
    case 'own': {
      const own = OWN_ROOMS.find((r) => r.id === job.id)
      if (own === undefined) throw new Error(`there is no own room ${job.id}; there are ${OWN_ROOMS.map((r) => r.id).join(', ')}`)
      return { kind: 'trial', report: reportOf(own.id, 1, runTrial(handRoom(own), clock)) }
    }
  }
}
