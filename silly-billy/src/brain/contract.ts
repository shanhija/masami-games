/**
 * What the brain promises the rest of the game: how words become things happening, and
 * what the HUD can read about it. The brain builds `brain.ts` (class Brain implements
 * BrainApi), `link.ts` (the dev server, or nothing), `parse.ts`, `context.ts` and
 * `validate.ts`; the game (game.ts) wires them up and the HUD reads them.
 */

import type { Words } from '../engine/lang'
import type { Library } from '../engine/library'
import type {
  ActionEntry,
  ForgetRequest,
  HearReply,
  InterpretReply,
  InterpretRequest,
  InventRequest,
  ItemEntry,
  LibraryData,
  LogLine,
  SaveRequest,
  Status,
} from '../engine/protocol'
import type { Sim } from '../engine/sim'
import type { WorldEvent } from '../engine/types'
import type { MicInfo } from '../voice/mic'

/** The dev server, reached at ./api/ beside the page. In the static build every call fails and `online` stays false. */
export interface Link {
  /** The last status said Claude is there. */
  readonly online: boolean
  /** Asks the server; null when there is no server. Sets `online`. */
  status(): Promise<Status | null>
  /**
   * 16 kHz mono 16-bit WAV to words in `lang`; partial asks (the live words while the button is
   * held) are not logged. `prime` is a sentence in `lang` with the names of who is here
   * (voice/prime.ts), which Whisper is primed with; without it the server uses its own. `mic`,
   * what the browser gave for the microphone, goes with a whole clip, which the server keeps.
   */
  hear(wav: ArrayBuffer, lang: 'fi' | 'en', partial: boolean, prime?: string, mic?: MicInfo): Promise<HearReply>
  /** Rejects when `signal` aborts (the page waited long enough); the server then stops asking. */
  interpret(req: InterpretRequest, signal?: AbortSignal): Promise<InterpretReply>
  /** Streams progress 0..1 to onProgress; resolves with the made entry or rejects with the designer's error, or when `signal` aborts (the server then kills the designer). */
  invent(req: InventRequest, onProgress: (p: number) => void, signal?: AbortSignal): Promise<ActionEntry | ItemEntry>
  save(req: SaveRequest): Promise<void>
  forget(req: ForgetRequest): Promise<void>
  /** Everything made so far: from the server in dev, from the files shipped in the build otherwise. */
  library(): Promise<LibraryData>
  /** Fire and forget. */
  log(line: LogLine): void
}

/** How a command was understood: a phrase heard before, the small parser, the interpreter, or the offline guess. */
export type HeardBy = 'phrase' | 'local' | 'interpreter' | 'offline'

/** One command, for the HUD's line of what was heard and what is happening. */
export interface HeardLine {
  serial: number
  /** The words as heard. */
  words: string
  /** The command as understood, in both languages (the plan's `heard` and `heardFi`), or '' while still thinking. */
  heard: Words
  who: string[]
  by: HeardBy | null
  /** 'understanding': waiting for the interpreter; 'making': inventions in flight; 'doing'; 'done'; 'failed': it could not be done. */
  status: 'understanding' | 'making' | 'doing' | 'done' | 'failed'
  /** Seconds from the words to the first thing happening. */
  took: number | null
}

/** An invention in flight: a new action or item being designed. */
export interface Job {
  kind: 'action' | 'item'
  id: string
  name: string
  /** The name in Finnish, shown when the game is played in Finnish. */
  nameFi: string
  /** The designer's reply so far, 0..1. */
  progress: number
  /** 'drafting': the interpreter's draft is up (items); 'designing': the designer is writing; 'testing': the validation worker runs it; 'fixing': a second try after a failed test. */
  stage: 'drafting' | 'designing' | 'testing' | 'fixing'
  /** The actors waiting for it. */
  for: string[]
}

/** The brain plays in the world's language (`world.lang`): what it asks the interpreter, the bubbles, the voices and the names it gives. */
export interface BrainDeps {
  sim: Sim
  library: Library
  link: Link
  /** Called after anything the HUD shows changed. */
  changed: () => void
  /** How long the page waits at most, in ms (tests make these short): the interpreter, and a new thing or action in all, every round. */
  waits?: { interpret: number; job: number }
}

export interface BrainApi {
  readonly lines: readonly HeardLine[]
  readonly jobs: readonly Job[]
  /** The actor a command without a name goes to: the one last spoken to, or the portrait the child tapped. */
  addressee: string | null
  /** Loads what was made before (link.library()) into the library and brings made avatars in. */
  start(): Promise<void>
  /** Words from the microphone or the keyboard. Never throws: whatever happens, something happens on screen. */
  hear(words: string): Promise<void>
  /** Shown while the child is still talking: the actor named so far turns and listens. */
  hearing(partialWords: string): void
  /** The sim's events of a frame, which the game passes on before it drains them: what started, finished and failed. */
  see(events: readonly WorldEvent[]): void
  /** Forgets the newest made thing (the pause card's button) and gives its name, or null when nothing was made; one still being made is not taken in when it is done. */
  forgetNewest(): Promise<Words | null>
  /** Forgets everything made (the pause card's other button), newest first, and gives how many. */
  forgetAll(): Promise<number>
}
