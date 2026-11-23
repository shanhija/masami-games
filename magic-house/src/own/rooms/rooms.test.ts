/**
 * The game's own rooms: their facts (one seen from the side for each party size, and Flower Bridge
 * from high up for two), no dice and no clock, nothing the engine set right in their
 * builds, and the whole trial (trial/trial.ts) passed at every level: built within the budget with
 * everyone on a floor, no harm from standing still or pressing at random, the walkthrough a clean
 * pass of a minute or two at each level and on the second seed, and every player needed.
 *
 * Each room's look, written by hand (<room>.look.ts), passes the same check as a made look
 * (trial/lookCheck.ts) with nothing left out, and never changes the play: building it leaves the
 * World as it was and its random stream unmoved, and a minute of random walking, pressing and tapping
 * (on its props too) plays frame by frame the same with it as without it.
 */

import fs from 'node:fs'

import { describe, expect, it } from 'vitest'
import { PASS, TRIAL, WORDS_MAX, type Level } from '../../engine/api'
import { LOOK_LEAST } from '../../engine/look'
import { buildLook } from '../../engine/lookBuilder'
import { buildRoom, RoomRuntime } from '../../engine/room'
import { roomStart } from '../../engine/testing'
import { LookRuntime } from '../../trial/compile'
import { handLook, runLookCheck } from '../../trial/lookCheck'
import { sixtySeconds } from '../../trial/testing'
import { handRoom, runTrial } from '../../trial/trial'
import { OWN_ROOMS, ownRoomFor, type OwnRoom } from './index'

const LEVELS: readonly Level[] = [1, 2, 3]
const words = (text: string) => text.trim().split(/\s+/).length
const build = (own: OwnRoom, level: Level) => buildRoom(own.code, { ...roomStart(own.party, own.kind, level, own.seed), view: own.view, shell: own.shell }, new RoomRuntime())

describe('the own rooms', () => {
  it('are one seen from the side for each party size and one from high up for two, each with its facts', () => {
    expect(OWN_ROOMS.map((r) => [r.party, r.view])).toEqual([
      [1, 'side'],
      [2, 'side'],
      [2, 'high'],
      [3, 'side'],
      [4, 'side'],
    ])
    expect(new Set(OWN_ROOMS.map((r) => r.id)).size).toBe(5)
    expect(new Set(OWN_ROOMS.map((r) => r.seed)).size).toBe(5)
    for (const r of OWN_ROOMS) {
      expect(r.id).toMatch(/^own:[a-z-]+$/)
      if (r.view === 'side') expect(ownRoomFor(r.party)).toBe(r)
      expect(r.kind).toBe('together')
      for (const lang of ['en', 'fi'] as const) expect(words(r.name[lang])).toBeLessThanOrEqual(WORDS_MAX.name)
      expect(r.theme.length).toBeGreaterThan(0)
      expect(r.task.length).toBeGreaterThan(0)
    }
  })

  it('draw no dice and read no clock: their variety comes from the level', () => {
    for (const file of fs.readdirSync('magic-house/src/own/rooms').filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))) {
      const text = fs.readFileSync(`magic-house/src/own/rooms/${file}`, 'utf8')
      expect(text, file).not.toMatch(/Math\.random/)
      expect(text, file).not.toMatch(/\bDate\b/)
    }
  })

  describe.each(OWN_ROOMS.map((r) => [r.id, r] as const))('%s', (_, own) => {
    it.each(LEVELS)('builds at level %i with nothing the engine had to set right', (level) => {
      const room = build(own, level)
      expect(room.survey.notes).toEqual([])
      expect(room.world.steps.length).toBeGreaterThan(0)
    })

    it(
      'passes the whole trial at every level, its walkthrough a clean pass that stands idle for under a tenth of it, inside the trial’s real time',
      () => {
        const r = runTrial(handRoom(own), () => performance.now())
        expect(r.sentences).toEqual([])
        expect(r.passed).toBe(true)
        for (const level of LEVELS) {
          const secs = (r.botSecs as Record<Level, number>)[level]
          expect(secs).toBeGreaterThanOrEqual(PASS.minSecs)
          expect(secs).toBeLessThanOrEqual(PASS.maxSecs)
          // The seconds are play: only a short wait for what the room does, never standing that pads the minute (plan.md, Proof before play).
          expect((r.waitSecs as Record<Level, number>)[level], `idle at level ${level}`).toBeLessThan(secs / 10)
        }
        // Played together: with each bot in turn standing still, the room stayed unfinished.
        expect(r.runs.filter((x) => x.kind === 'stillBot').map((x) => x.still)).toEqual(own.party > 1 ? Array.from({ length: own.party }, (_, i) => i) : [])
        expect(r.ms).toBeLessThan(TRIAL.realSecs * 1000)
      },
      TRIAL.realSecs * 1000 * 2,
    )
  })

  describe.each(OWN_ROOMS.map((r) => [r.id, r, r.look] as const))('%s, with its look', (_, own, look) => {
    it('passes the look check at every level, full and answering all over the room, with nothing left out', () => {
      const r = runLookCheck(handLook(own, look), () => performance.now())
      expect(r.sentences).toEqual([])
      expect(r.notes).toEqual([])
      expect(r.passed).toBe(true)
      for (const level of LEVELS) {
        const counts = r.built[level]!.counts
        expect(counts.answering).toBeGreaterThanOrEqual(LOOK_LEAST.answering)
        expect(counts.quarters).toBe(4)
        expect(counts.leftOut).toBe(0)
      }
    })

    it('never changes the play: the World and its random stream as they were, and a minute of random play the same frame by frame', () => {
      for (const level of LEVELS) {
        const room = build(own, level)
        const before = structuredClone(room.world)
        const built = buildLook(room, look, new LookRuntime())
        expect(room.world).toEqual(before)
        expect(room.world.rng).toBe(before.rng)
        if (level !== 1) continue
        const props = built.props.map((p) => p.at)
        const played = sixtySeconds(room, props)
        expect(played).toEqual(sixtySeconds(build(own, level), props))
        // The play really moved.
        expect(played[0]).not.toBe(played[3599])
      }
    }, 60_000)
  })
})
