import { describe, expect, it } from 'vitest'
import { NO_POINTING } from '../seats/types'
import { MISTAKES, type Builder, type RoomCode, type World } from './api'
import { buildRoom, RoomBuildError, RoomRuntime } from './room'
import { cube, idle, NEVER, plainRoom, playRoom, roomStart } from './testing'

const S1 = roomStart(1, 'together', 1, 11)
/** A value made code might pass by mistake, past the types. */
const bad = (v: unknown) => v as never

/** What the room says back: the build's sentence, or else the faults of its first second of play. */
function said(code: RoomCode): string[] {
  try {
    const room = buildRoom(code, S1, new RoomRuntime())
    playRoom(room, 60, idle(room), () => NO_POINTING)
    return room.faults.map((f) => f.sentence)
  } catch (err) {
    if (err instanceof RoomBuildError) return [err.sentence]
    throw err
  }
}

/** A plain room with one more call. */
const plainWith = (more: (r: Builder, w: World) => void): RoomCode => (r, w) => {
  plainRoom(r, w, NEVER)
  more(r, w)
}

describe("the checks of what made code passes in, each with its MISTAKES sentence", () => {
  it.each([
    ['notColor', plainWith((r) => r.box([0, 4, 0], [1, 1, 1], { color: bad('blurple') })), MISTAKES.notColor('r.box', 'color', "'blurple'")],
    ['notFunction', plainWith((r) => r.box([0, 4, 0], [1, 1, 1], { touch: bad(3) })), MISTAKES.notFunction('r.box', 'touch')],
    ['notOptions', plainWith((r) => r.box([0, 4, 0], [1, 1, 1], bad('red'))), MISTAKES.notOptions('r.box', "'red'")],
    ['notSize', plainWith((r) => r.box([0, 4, 0], [1, 0, 1])), MISTAKES.notSize('r.box', '[w, h, d]')],
    ['notText', plainWith((r) => r.box([0, 4, 0], [1, 1, 1], { name: bad(7) })), MISTAKES.notText('r.box', 'name')],
    ['notChoice', plainWith((r) => r.ramp([0, 4, 0], [2, 1, 1], bad('up'))), MISTAKES.notChoice('r.ramp', 'rises', "'up'", ['right', 'left'])],
    ['noShapes', plainWith((r) => r.decor([0, 4, 0], () => {})), MISTAKES.noShapes('r.decor')],
    ['notPlace', plainWith((r) => r.mover(() => r.box([0, 0, 0], [1, 0.2, 1]), bad(() => 5))), MISTAKES.notPlace('5')],
  ])('%s', (_name, code, sentence) => {
    expect(said(code).some((s) => s.startsWith(sentence))).toBe(true)
  })

  it('notList, notStep and notHandle in r.steps', () => {
    const stepsWith = (list: unknown): RoomCode => (r, w) => {
      for (const [i, p] of w.players().entries()) p.putAt([-4 + i, 0, 0])
      r.wayOut([7, 0, 0])
      r.steps(bad(list))
    }
    const hint = { en: 'look', fi: 'katso' }
    expect(said(stepsWith('go'))).toEqual([MISTAKES.notList('r.steps', 'list')])
    expect(said(stepsWith([{ hint, at: [0, 0, 0] }]))).toEqual([MISTAKES.notStep(1)])
    expect(said(stepsWith([{ hint, at: cube(1, 1, 1), done: () => false }]))).toEqual([MISTAKES.notHandle('r.steps: step 1', 'at', 'a point or a handle')])
  })
})
