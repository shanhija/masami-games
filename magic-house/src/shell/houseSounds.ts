/**
 * Magic House's sounds on the page: Silly Billy's synthesised ones with the recorded ones over them.
 *
 * `npm install` builds the recordings into public/magic-house/recorded/ (magic-house/sounds/), which
 * the dev server serves and the build copies beside the page. The page asks for their library.json
 * once and, on the first touch or key, decodes every recording into its own AudioContext, each name
 * on its own. A name with a recording plays one of its takes, never the same one twice in a row
 * when it has more; any other name, a name whose takes all failed to load, and every name while the
 * recordings are loading or where they are not built (a fresh clone with no network), plays its
 * synthesised sound (engine/sounds.ts). That a page has no recordings is said once in the console,
 * and each take that fails to load once as a warning. Sound off quiets both.
 *
 * The look's props (scene/lookView.ts) sound through playProp, PROP_UNDER beneath the room's own, so
 * the play stays the clearest thing a child hears; the scene lets the props sound at most once every
 * LOOK_SHOWN.soundGap seconds, all of them together.
 */

import { Sounds } from '../../../silly-billy/src/sounds'
import { HOUSE_SOUNDS, synthesised, type HouseSound } from '../engine/sounds'

/** What the sound build writes: each sound's takes, as files beside library.json, and its gain in the mix. */
export type RecordedLibrary = Partial<Record<HouseSound, { files: string[]; gain: number }>>

/** The recordings' folder, beside the page. */
const RECORDED_DIR = 'recorded/'
/** The same recording twice within this many seconds is one sound, as Silly Billy's synthesised ones are. */
const DEDUP = 0.06
/** The recordings' level, as Silly Billy's MASTER is the synthesised ones'. */
const MASTER = 0.8
/** How loud a prop's sound is against the same sound played by the room: 6 dB under. */
export const PROP_UNDER = 10 ** (-6 / 20)

/** The built library, or null (said once in the console) where the page has none. */
async function loadLibrary(): Promise<RecordedLibrary | null> {
  try {
    const res = await fetch(`${RECORDED_DIR}library.json`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const library = (await res.json()) as RecordedLibrary
    const unknown = Object.keys(library).filter((name) => !HOUSE_SOUNDS.includes(name as HouseSound))
    if (unknown.length > 0) throw new Error(`recordings with no name in engine/sounds.ts: ${unknown.join(' ')}`)
    return library
  } catch (err) {
    console.info(`Magic House: no recorded sounds (${(err as Error).message}), so the synthesised ones play; npm run sounds builds them.`)
    return null
  }
}

export class HouseSounds extends Sounds {
  /** The built library: asked for once, when the page makes its sounds. */
  readonly library: Promise<RecordedLibrary | null> = loadLibrary()
  /** Every recording decoded or given up, from the first touch or key on (null before it); it never fails. */
  decoded: Promise<void> | null = null
  private audio: AudioContext | null = null
  private out: GainNode | null = null
  /** Each recorded sound's decoded takes and gain, there once decoded. */
  private takes = new Map<HouseSound, { buffers: AudioBuffer[]; gain: number }>()
  /** When each recorded sound last played, and which of its takes. */
  private lastAt = new Map<HouseSound, number>()
  private lastTake = new Map<HouseSound, number>()

  /** On the first touch or key: the synthesised sounds wake, and the recordings are decoded. */
  override unlock() {
    super.unlock()
    if (this.audio) {
      if (this.audio.state === 'suspended') void this.audio.resume()
      return
    }
    const audio = new AudioContext()
    this.audio = audio
    this.out = audio.createGain()
    this.out.gain.value = this.muted ? 0 : MASTER
    this.out.connect(audio.destination)
    this.decoded = this.library.then(async (library) => {
      if (library === null) return
      // Each name on its own, and each take: one that fails is said and left out, the rest still play.
      const names = Object.entries(library) as [HouseSound, { files: string[]; gain: number }][]
      await Promise.all(
        names.map(async ([name, entry]) => {
          const tried = await Promise.allSettled(
            entry.files.map(async (file) => {
              const res = await fetch(`${RECORDED_DIR}${name}/${file}`)
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              return audio.decodeAudioData(await res.arrayBuffer())
            }),
          )
          tried.forEach((t, i) => {
            if (t.status === 'rejected') console.warn(`Magic House: recorded sound ${name}/${entry.files[i]} did not load (${(t.reason as Error).message}); it is left out.`)
          })
          const buffers = tried.flatMap((t) => (t.status === 'fulfilled' ? [t.value] : []))
          if (buffers.length > 0) this.takes.set(name, { buffers, gain: entry.gain })
        }),
      )
    })
  }

  override setMuted(muted: boolean) {
    super.setMuted(muted)
    if (this.out) this.out.gain.value = muted ? 0 : MASTER
  }

  /** A sound by its name, at `level` of its loudness: one of its recorded takes where there are any, else its synthesised sound. As in Silly Billy's, only full-level plays are one sound within DEDUP, so a prop's quieter play never silences the room's own. */
  override play(name: HouseSound, level = 1) {
    const takes = this.takes.get(name)
    const audio = this.audio
    if (takes === undefined || audio === null) {
      super.play(synthesised(name), level)
      return
    }
    const t = audio.currentTime
    if (level === 1) {
      if (t - (this.lastAt.get(name) ?? -1) < DEDUP) return
      this.lastAt.set(name, t)
    }
    // Any take but the last one played, when there are two or more.
    const n = takes.buffers.length
    const last = this.lastTake.get(name)
    let take = Math.floor(Math.random() * (last === undefined || n < 2 ? n : n - 1))
    if (last !== undefined && n >= 2 && take >= last) take += 1
    this.lastTake.set(name, take)
    const source = audio.createBufferSource()
    source.buffer = takes.buffers[take]!
    const gain = audio.createGain()
    gain.gain.value = takes.gain * level
    source.connect(gain).connect(this.out!)
    source.start()
  }

  /** A prop's sound as it reacts: PROP_UNDER beneath the room's. */
  playProp(name: HouseSound) {
    this.play(name, PROP_UNDER)
  }

  /** Whether a name plays a recording now (the ?sounds page marks those). */
  recorded(name: HouseSound): boolean {
    return this.takes.has(name)
  }
}
