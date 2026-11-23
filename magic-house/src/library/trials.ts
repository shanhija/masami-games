/**
 * Any open page on the dev server tries the rooms that wait for their trial (plan.md, One room
 * ahead): it takes the next one (GET /trial), tries it in the worker (trial/tryRoom.ts) and reports
 * (POST /trial), and checks a kept room's presents the same way (GET /gift-trial, tryGifts, POST
 * /gift-trial). A room's look is checked the same way (GET /look-trial, tryLook, POST /look-trial),
 * before the presents, since a party may be waiting at the new door for it. One job at a time per page, and the work is all in the worker, so play keeps its
 * frame rate. It looks for work when the server says the line or the library changed, and on a
 * slow poll besides, so a page that missed a word still takes what waits.
 */

import type { GiftsJob, GiftsReport, LookJob, LookReport, TrialJob, TrialReport } from '../protocol'
import type { HouseApi } from './api'

/** How often a page looks for work when nothing told it to, ms. */
export const POLL_MS = 20_000

/** How the page does the work: in the worker on the page, in Node for a test. */
export interface TrialWork {
  room(job: TrialJob): Promise<TrialReport>
  look(job: LookJob): Promise<LookReport>
  gifts(job: GiftsJob): Promise<GiftsReport>
}

export class PageTrials {
  private busy = false
  private again = false

  constructor(
    private readonly api: HouseApi,
    private readonly work: TrialWork,
  ) {}

  /**
   * Takes and does every job that waits, a room's trial before its look's check before presents, one at a time; asked
   * while busy, it looks again once done. Resolves when nothing waits or the server cannot be
   * reached. A report the server no longer wants (another page reported first, 409) is let go.
   */
  async look(): Promise<void> {
    if (this.busy) {
      this.again = true
      return
    }
    this.busy = true
    try {
      do {
        this.again = false
        const job = await this.api.get('GET /trial', null)
        if (job !== null) {
          const report = await this.work.room(job)
          await this.send(() => this.api.post('POST /trial', report), `the trial of ${job.line} try ${job.attempt}`)
          this.again = true
          continue
        }
        const looked = await this.api.get('GET /look-trial', null)
        if (looked !== null) {
          const report = await this.work.look(looked)
          await this.send(() => this.api.post('POST /look-trial', report), `the look check of ${looked.line} try ${looked.attempt}`)
          this.again = true
          continue
        }
        const gifts = await this.api.get('GET /gift-trial', null)
        if (gifts !== null) {
          const report = await this.work.gifts(gifts)
          await this.send(() => this.api.post('POST /gift-trial', report), `the presents of ${gifts.room}`)
          this.again = true
        }
      } while (this.again)
    } catch (err) {
      console.warn('Magic House could not take a trial:', err)
    } finally {
      this.busy = false
    }
  }

  private async send(post: () => Promise<unknown>, what: string): Promise<void> {
    try {
      await post()
    } catch (err) {
      console.warn(`Magic House reported ${what} and the server would not have it:`, err)
    }
  }
}
