/** The trial worker: one job in (a trial, presents or a look to check: trial/jobs.ts), one answer out; the page ends it afterwards, or when it takes too long (trial/tryRoom.ts). */

import { answerJob, type WorkerJob } from './jobs'

self.onmessage = (e: MessageEvent<WorkerJob>) => {
  self.postMessage(answerJob(e.data, () => performance.now()))
}
