/**
 * Testing made code before the game takes it in. A new action runs on a copy of the world
 * for up to 20 simulated seconds and must not fail, with the args it was asked with and again
 * with its optional args left out (a child says "Steve, aja" with no target too); a new thing
 * must build with a sane size and shape count, and its process must run for a second, lying
 * about and, for a thing that can be worn, worn, within the time it gets in play; what
 * the kit forgave on the way (a part made twice, an unknown colour) is told, so the designer
 * can fix it. `validate` is pure (the worker and the tests call it); `validateInWorker` runs
 * it in a fresh worker that is killed when it hangs, so even code that slips past the loop
 * guard cannot freeze the page.
 */

import { BUILTIN_ACTIONS, BUILTIN_ITEMS } from '../content'
import { buildRecipe } from '../engine/kit'
import { Library, namesOf } from '../engine/library'
import type { ActionEntry, ItemEntry } from '../engine/protocol'
import { compileModel, compileTick, describeError, resetGuard } from '../engine/sandbox'
import { PROCESS_BUDGET_MS, Sim, SPARE_MS } from '../engine/sim'
import { STEP, type World, type WorldEvent } from '../engine/types'

export interface ValidateRequest {
  /** The world as it is, in the game's language (the worker gets a copy; validate copies it again and calms everyone down). */
  snapshot: World
  /** Every made thing in the library, drafts included. */
  entries: { items: ItemEntry[]; actions: ActionEntry[] }
  /** What is tested: a thing, or an action played by `actor` with `args` (the step that asked for it), and again with the optional ones left out. */
  candidate: { kind: 'item'; entry: ItemEntry } | { kind: 'action'; entry: ActionEntry; actor: string; args: Record<string, string> }
}

export interface ValidateResult {
  ok: boolean
  /** What went wrong, in one line for the designer to fix. */
  error: string | null
  /** Things the kit forgave, how long the action took. */
  notes: string[]
  /** What the kit forgave in a new thing's model, so some of it is missing or grey: worth one more try. */
  forgiven: string[]
  ms: number
}

/** How long a new action is watched, simulated seconds. */
const WATCH_SECS = 20
/** A thing's biggest side, metres: a room is 24 across. */
const MAX_SIZE = 16
const MIN_SIZE = 0.05
const MAX_SHAPES = 250
/** How long a new process runs, frames. */
const TICK_FRAMES = 60
const TOO_LONG = 'it took too long: a loop that never waits?'

/** A copy of the world with nobody doing anything and nothing in the air, so the test sees only the new thing; played in the world's language (Finnish, the game's first, if it has none). */
export function snapshotOf(world: World): World {
  const w = structuredClone(world)
  w.lang = w.lang === 'en' ? 'en' : 'fi'
  w.puffs = []
  w.sounds = []
  w.speech = []
  w.events = []
  w.spotlight = null
  for (const a of w.actors) Object.assign(a, { doing: null, queue: [], thinking: null, listening: false, joinedBy: null, bubble: null })
  return w
}

export function validate(req: ValidateRequest): ValidateResult {
  const t0 = performance.now()
  const notes: string[] = []
  const forgiven: string[] = []
  const answer = (error: string | null): ValidateResult => ({ ok: error === null, error, notes, forgiven, ms: Math.round(performance.now() - t0) })
  let stage = 'setting up the test'
  try {
    const library = new Library({ items: BUILTIN_ITEMS, actions: BUILTIN_ACTIONS })
    for (const e of req.entries.items) {
      const r = library.addItem(e)
      if (!r.ok) notes.push(`item ${e.id} did not load: ${r.error}`)
    }
    for (const e of req.entries.actions) {
      const r = library.addAction(e)
      if (!r.ok) notes.push(`action ${e.id} did not load: ${r.error}`)
    }
    const c = req.candidate

    if (c.kind === 'item') {
      const sim = new Sim(snapshotOf(req.snapshot), library)
      if (c.entry.guarded === null) return answer('there is no model code')
      stage = 'the model'
      const { recipe, notes: kit } = buildRecipe(compileModel(c.entry.guarded), namesOf(c.entry))
      notes.push(...kit)
      forgiven.push(...kit)
      const size = Math.max(...[0, 1, 2].map((k) => recipe.bounds.max[k]! - recipe.bounds.min[k]!))
      if (size > MAX_SIZE) return answer(`it is ${size.toFixed(1)} m big: make it smaller than ${MAX_SIZE} m`)
      if (size < MIN_SIZE) return answer(`it is only ${size.toFixed(2)} m big: make it at least ${MIN_SIZE} m`)
      if (recipe.shapes.length > MAX_SHAPES) return answer(`it has ${recipe.shapes.length} shapes: use at most ${MAX_SHAPES}`)
      const added = library.addItem(c.entry)
      if (!added.ok) return answer(added.error)
      if (c.entry.tickGuarded !== null) {
        stage = 'the process'
        const tick = compileTick(c.entry.tickGuarded)
        const made = sim.makeItem(c.entry.id, { x: 0, z: 0 })
        const it = sim.api.items.find((i) => i.id === made.id)!
        let spent = 0
        const run = (frames: number) => {
          for (let f = 0; f < frames; f++) {
            resetGuard()
            const since = performance.now()
            tick(it, sim.api, STEP)
            spent += performance.now() - since
            sim.step()
          }
        }
        run(TICK_FRAMES)
        // Worn, it is a stand-in that goes with its wearer and is in no list of the room's things: code may trip on that.
        const wearer = sim.api.actors[0]
        if (recipe.meta.wear !== null && wearer !== undefined) {
          stage = 'the process, while worn'
          wearer.wear(it, recipe.meta.wear)
          run(TICK_FRAMES / 2)
        }
        // In play a process gets this much time, or the game takes it away.
        const frames = recipe.meta.wear !== null && wearer !== undefined ? TICK_FRAMES * 1.5 : TICK_FRAMES
        if (spent > frames * PROCESS_BUDGET_MS + SPARE_MS) return answer(`the process took ${Math.round(spent)} ms in ${frames} frames: do much less in each frame`)
      }
      return answer(null)
    }

    const added = library.addAction(c.entry)
    if (!added.ok) return answer(added.error)
    stage = 'the action'
    // As asked, then with the optional args that were given left out, each on a fresh copy of the world.
    const optional = Object.keys(c.args).filter((name) => c.entry.params.some((p) => p.name === name && p.optional))
    const tries: { args: Record<string, string>; when: string }[] = [{ args: c.args, when: '' }]
    if (optional.length > 0) {
      const bare = Object.fromEntries(Object.entries(c.args).filter(([name]) => !optional.includes(name)))
      tries.push({ args: bare, when: `when ${optional.join(' and ')} ${optional.length > 1 ? 'are' : 'is'} not given: ` })
    }
    for (const { args, when } of tries) {
      const sim = new Sim(snapshotOf(req.snapshot), library)
      sim.give(c.actor, [{ action: c.entry.id, args, serial: 0 }], true)
      let end: WorldEvent | undefined
      let f = 1
      for (; f <= Math.round(WATCH_SECS / STEP) && end === undefined; f++) {
        sim.step()
        const w = sim.world
        end = w.events.find((e) => (e.type === 'done' || e.type === 'failed') && e.actor === c.actor && e.step.action === c.entry.id)
        w.events.length = 0
        w.sounds.length = 0
        w.speech.length = 0
      }
      if (end?.type === 'failed') return answer(`${when}${end.error}`)
      notes.push(`${when}${end === undefined ? `still going after ${WATCH_SECS} s` : `done after ${((f - 1) * STEP).toFixed(1)} s`}`)
    }
    return answer(null)
  } catch (err) {
    return answer(`${stage}: ${describeError(err)}`)
  }
}

/**
 * Runs validate in a fresh worker, terminated after the answer or after `timeoutMs` (a hang
 * becomes an answer the designer can fix). A worker that cannot start at all is the game's
 * fault, not the designer's: that rejects.
 */
export function validateInWorker(req: ValidateRequest, timeoutMs = 4000): Promise<ValidateResult> {
  const t0 = performance.now()
  const worker = new Worker(new URL('./validate.worker.ts', import.meta.url), { type: 'module' })
  return new Promise<ValidateResult>((resolve, reject) => {
    const end = () => {
      clearTimeout(timer)
      worker.terminate()
    }
    const timer = setTimeout(() => {
      end()
      resolve({ ok: false, error: TOO_LONG, notes: [], forgiven: [], ms: Math.round(performance.now() - t0) })
    }, timeoutMs)
    worker.onmessage = (e: MessageEvent<ValidateResult>) => {
      end()
      resolve({ ...e.data, ms: Math.round(performance.now() - t0) })
    }
    worker.onerror = (e: ErrorEvent) => {
      end()
      // A module that cannot load gives a bare error event with no message.
      reject(new Error(`the test worker broke: ${e.message || 'it would not start'}`))
    }
    worker.postMessage(req)
  })
}
