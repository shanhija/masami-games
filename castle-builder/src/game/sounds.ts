export type SoundKind = 'start' | 'chop' | 'tok' | 'clink' | 'snip' | 'rustle' | 'pop' | 'golden' | 'pling' | 'fetch' | 'saw' | 'hammer' | 'anvil' | 'loom' | 'splat' | 'ding' | 'select' | 'thud' | 'hooray' | 'uhuh' | 'tock' | 'sploosh' | 'hiss' | 'whoosh' | 'crumble' | 'zap' | 'rumble' | 'bong' | 'chime' | 'fanfare' | 'newWish' | 'boing' | 'baa' | 'splash'

/** What keeps sounding while it is true: three weathers and the four layers of the tune, which turns into a music box at night. */
export interface Loops { fire: boolean; rain: boolean; wind: boolean; drum: boolean; bass: boolean; melody: boolean; bells: boolean; night: boolean }

type Ambient = 'fire' | 'rain' | 'wind'
const AMBIENTS: readonly Ambient[] = ['fire', 'rain', 'wind']
const LOOP_LEVEL: Record<Ambient, number> = { fire: 0.09, rain: 0.05, wind: 0.05 }
/** Loops come and go over this long. */
const FADE = 0.3
/** Ten of the same sound in one frame is one sound. */
const DEDUP = 0.06

/** The tune: 120 bpm in eighths, four bars of eight steps, scheduled this far ahead of the clock. */
const STEP = 0.25
const STEPS = 32
const LOOKAHEAD = 0.25
const CLOCK_MS = 100
/** MIDI notes: the root of each bar (C2 G2 A2 F2) and a happy eight-note pattern per bar in C major, 0 for a rest. */
const BASS = [36, 43, 45, 41]
const MELODY = [76, 79, 76, 72, 74, 76, 79, 0, 74, 79, 74, 71, 74, 79, 81, 0, 76, 72, 69, 72, 76, 81, 79, 0, 77, 81, 77, 72, 74, 76, 72, 0]
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)

/**
 * Every sound is synthesised from oscillators and one noise buffer, nothing to load.
 * Browsers refuse to make a sound before the page has been touched, so `unlock` runs
 * on the first press, and until then everything here is a no-op. The good sounds are
 * the loud ones; anything to do with weather or breaking is soft and never sharp.
 */
export class Sounds {
  muted = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  /** Two seconds of white noise every one-shot puff loops over. */
  private white: AudioBuffer | null = null
  private lastPlayed: Partial<Record<SoundKind, number>> = {}
  private ambient: Record<Ambient, { gain: GainNode; sources: AudioScheduledSourceNode[] } | null> = { fire: null, rain: null, wind: null }
  private loops: Loops = { fire: false, rain: false, wind: false, drum: false, bass: false, melody: false, bells: false, night: false }
  /** The tune's own gain, so stopping it fades what is already scheduled, and the soft lowpass the melody sings through. */
  private tune: GainNode | null = null
  private soft: BiquadFilterNode | null = null
  private clock: { step: number; next: number; timer: number } | null = null

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 1
    this.master.connect(this.ctx.destination)
    this.white = this.noiseBuffer(2, false)
    this.tune = this.ctx.createGain()
    this.tune.gain.value = 0
    this.tune.connect(this.master)
    this.soft = this.filter('lowpass', 1600, this.tune)
  }

  /** Mute is the master at nothing: the loops and the clock keep going underneath. */
  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 1
  }

  play(kind: SoundKind) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    if (t - (this.lastPlayed[kind] ?? -1) < DEDUP) return
    this.lastPlayed[kind] = t
    const out = this.master
    const tone = (type: OscillatorType, f0: number, f1: number, dt: number, dur: number, vol: number) => this.tone(type, f0, f1, t + dt, dur, vol, out)
    const noise = (type: BiquadFilterType, freq: number, dt: number, attack: number, dur: number, vol: number) => this.noise(type, freq, t + dt, attack, dur, vol, out)
    const notes = (type: OscillatorType, midi: number[], gap: number, dur: number, vol: number) => midi.forEach((n, i) => tone(type, hz(n), hz(n), i * gap, dur, vol))
    /** A bell is a fundamental with three partials that are not quite in tune, the high ones dying first. */
    const bell = (f: number, dt: number, dur: number, vol: number) => [1, 2, 2.76, 4.07].forEach((k, i) => tone('sine', f * k, f * k, dt, dur * (1 - i * 0.2), vol * [1, 0.5, 0.3, 0.15][i]!))
    switch (kind) {
      case 'start': // Two warm notes up: here we go.
        notes('triangle', [72, 79], 0.12, 0.35, 0.2)
        break
      case 'chop': // The axe bites the trunk.
        noise('lowpass', 1200, 0, 0.003, 0.09, 0.22)
        tone('square', 180, 90, 0, 0.08, 0.1)
        break
      case 'tok': // The pick on rock.
        tone('sine', 900, 600, 0, 0.06, 0.15)
        noise('highpass', 3000, 0, 0.002, 0.03, 0.12)
        break
      case 'clink': // The pick on ore rings a little.
        tone('square', 2200, 2000, 0, 0.12, 0.06)
        tone('sine', 3300, 3300, 0, 0.18, 0.08)
        break
      case 'snip': // Shears, twice.
        noise('highpass', 4000, 0, 0.002, 0.04, 0.12)
        noise('highpass', 4000, 0.07, 0.002, 0.04, 0.12)
        break
      case 'rustle': // A hand through the flowers.
        noise('bandpass', 2500, 0, 0.02, 0.2, 0.08)
        break
      case 'pop': // A unit comes off, or grows back.
        tone('sine', 500, 1100, 0, 0.1, 0.15)
        break
      case 'golden': // A sparkle: three quick steps up.
        notes('sine', [88, 93, 100], 0.05, 0.25, 0.15)
        break
      case 'pling': // The good lands on its pile: loud and bright.
        tone('triangle', 1047, 1047, 0, 0.25, 0.25)
        tone('sine', 2093, 2093, 0, 0.15, 0.1)
        break
      case 'fetch': // A worker picks something up.
        tone('sine', 660, 880, 0, 0.08, 0.08)
        break
      case 'saw': // Two strokes of the saw.
        noise('bandpass', 900, 0, 0.02, 0.12, 0.1)
        noise('bandpass', 900, 0.15, 0.02, 0.12, 0.1)
        break
      case 'hammer': // The mason's mallet on stone.
        tone('square', 240, 120, 0, 0.06, 0.12)
        noise('lowpass', 2500, 0, 0.002, 0.04, 0.15)
        break
      case 'anvil': // The smithy's hammer rings.
        noise('highpass', 3000, 0, 0.002, 0.02, 0.12)
        tone('square', 1400, 1350, 0, 0.3, 0.06)
        tone('sine', 2800, 2800, 0, 0.4, 0.08)
        break
      case 'loom': // Two wooden clacks.
        tone('triangle', 400, 300, 0, 0.05, 0.12)
        tone('triangle', 500, 380, 0.1, 0.05, 0.12)
        break
      case 'splat': // A wet plop of dye.
        tone('sine', 300, 120, 0, 0.15, 0.18)
        noise('lowpass', 600, 0, 0.005, 0.1, 0.1)
        break
      case 'ding': // Something made: a bright ping.
        tone('triangle', 1760, 1760, 0, 0.3, 0.18)
        break
      case 'select': // A little click for the build bar.
        tone('square', 880, 880, 0, 0.06, 0.06)
        break
      case 'thud': // A piece lands: loud and low.
        tone('sine', 110, 45, 0, 0.25, 0.3)
        noise('lowpass', 400, 0, 0.003, 0.15, 0.2)
        break
      case 'hooray': // Three notes up a major chord, quick.
        notes('triangle', [72, 76, 79], 0.09, 0.35, 0.25)
        break
      case 'uhuh': // Two notes down: hmm?
        tone('triangle', 330, 320, 0, 0.14, 0.12)
        tone('triangle', 262, 250, 0.16, 0.25, 0.12)
        break
      case 'tock': // The hero's hammer on a broken piece.
        tone('square', 200, 150, 0, 0.05, 0.12)
        noise('lowpass', 1500, 0, 0.002, 0.03, 0.1)
        break
      case 'sploosh': // A bucket of water.
        noise('lowpass', 900, 0, 0.02, 0.25, 0.15)
        tone('sine', 400, 150, 0, 0.2, 0.1)
        break
      case 'hiss': // The fire goes out in steam.
        noise('highpass', 3000, 0, 0.05, 0.8, 0.1)
        break
      case 'whoosh': // A gust, or a fire catching: air, not a bang.
        noise('bandpass', 800, 0, 0.15, 0.6, 0.1)
        tone('sine', 200, 600, 0, 0.4, 0.05)
        break
      case 'crumble': // A low tumble of three soft thumps.
        tone('sine', 90, 50, 0, 0.35, 0.1)
        ;[0, 0.12, 0.26].forEach((dt, i) => noise('lowpass', 300, dt, 0.005, 0.12, 0.14 - i * 0.02))
        break
      case 'zap': // A short bright chirp for the bolt.
        tone('square', 2000, 4000, 0, 0.08, 0.08)
        tone('sine', 3000, 600, 0, 0.12, 0.06)
        break
      case 'rumble': // Thunder as a soft swell of low noise, no crack.
        noise('lowpass', 120, 0, 0.6, 2.2, 0.12)
        tone('sine', 45, 40, 0, 2, 0.06)
        break
      case 'bong': // The bell tower catches the bolt.
        bell(220, 0, 2.5, 0.28)
        break
      case 'chime': // The rainbow: four slow gentle bells.
        ;[79, 83, 86, 91].forEach((n, i) => bell(hz(n), i * 0.35, 1.6, 0.1))
        break
      case 'fanfare': { // Four trumpet-like notes up, the last one held.
        const brass = this.filter('lowpass', 1800, out)
        ;[72, 76, 79, 84].forEach((n, i) => this.tone('square', hz(n), hz(n), t + i * 0.14, i === 3 ? 0.6 : 0.16, 0.25, brass))
        break
      }
      case 'newWish': // The King mumbles two soft blips.
        ;[0, 0.16].forEach((dt) => tone('triangle', 180 + Math.random() * 140, 200 + Math.random() * 140, dt, 0.12, 0.1))
        break
      case 'boing': // A rising square for a hop.
        tone('square', 150, 600, 0, 0.25, 0.1)
        tone('sine', 200, 900, 0, 0.12, 0.08)
        break
      case 'baa': { // A sawtooth with a wobble, at a new pitch each time, in two syllables.
        const osc = this.ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = 300 + Math.random() * 220
        const vibrato = this.ctx.createOscillator()
        vibrato.frequency.value = 7
        const depth = this.ctx.createGain()
        depth.gain.value = 14
        vibrato.connect(depth).connect(osc.frequency)
        const gain = this.ctx.createGain()
        gain.gain.setValueAtTime(0.0001, t)
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03)
        gain.gain.exponentialRampToValueAtTime(0.04, t + 0.2)
        gain.gain.exponentialRampToValueAtTime(0.12, t + 0.26)
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
        osc.connect(this.filter('lowpass', 1800, gain))
        gain.connect(out)
        osc.start(t)
        vibrato.start(t)
        osc.stop(t + 0.6)
        vibrato.stop(t + 0.6)
        break
      }
      case 'splash': // A puddle, with a couple of drops after.
        noise('lowpass', 1800, 0, 0.01, 0.3, 0.16)
        tone('sine', 600, 200, 0, 0.15, 0.1)
        tone('sine', 1500, 2200, 0.12, 0.08, 0.05)
        break
    }
  }

  /** Called every frame with what should be sounding; a loop starts or stops only when its flag changes. */
  setLoops(loops: Loops) {
    this.loops = loops
    if (!this.ctx) return
    for (const kind of AMBIENTS) this.setAmbient(kind, loops[kind])
    const tuneOn = loops.drum || loops.bass || loops.melody || loops.bells
    if (tuneOn && !this.clock) {
      this.clock = { step: 0, next: this.ctx.currentTime + 0.05, timer: 0 }
      this.fade(this.tune!, 1)
      this.tickClock()
    } else if (!tuneOn && this.clock) {
      window.clearTimeout(this.clock.timer)
      this.clock = null
      this.fade(this.tune!, 0)
    }
  }

  /**
   * Fire is a crackle: low-passed noise whose level wanders and pops. Rain is a hiss.
   * Wind is a band of noise that a slow sine swells up and down.
   */
  private setAmbient(kind: Ambient, on: boolean) {
    const ctx = this.ctx!
    const running = this.ambient[kind]
    if (on === (running !== null)) return
    if (running) {
      this.fade(running.gain, 0)
      for (const s of running.sources) s.stop(ctx.currentTime + FADE + 0.05)
      this.ambient[kind] = null
      return
    }
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(this.master!)
    const src = ctx.createBufferSource()
    src.buffer = this.noiseBuffer(3, kind === 'fire')
    src.loop = true
    const sources: AudioScheduledSourceNode[] = [src]
    if (kind === 'fire') src.connect(this.filter('lowpass', 600, gain))
    else if (kind === 'rain') src.connect(this.filter('highpass', 2500, gain))
    else {
      src.connect(this.filter('bandpass', 350, gain))
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.12
      const depth = ctx.createGain()
      depth.gain.value = LOOP_LEVEL.wind * 0.6
      lfo.connect(depth).connect(gain.gain)
      lfo.start()
      sources.push(lfo)
    }
    src.start()
    this.fade(gain, LOOP_LEVEL[kind])
    this.ambient[kind] = { gain, sources }
  }

  /** The clock: every 100 ms, schedule every step that falls within the lookahead. A sleeping tab skips ahead instead of catching up in a burst. */
  private tickClock() {
    const clock = this.clock!
    const ctx = this.ctx!
    if (clock.next < ctx.currentTime - LOOKAHEAD) clock.next = ctx.currentTime + 0.05
    while (clock.next < ctx.currentTime + LOOKAHEAD) {
      this.playStep(clock.step, clock.next)
      clock.next += this.loops.night ? STEP * 2 : STEP
      clock.step = (clock.step + 1) % STEPS
    }
    clock.timer = window.setTimeout(() => this.tickClock(), CLOCK_MS)
  }

  /**
   * One step of the tune, each layer only if its flag is on: a soft kick on 1 and 3 and
   * a tick on 2 and 4, the bar's root on a triangle, the melody on a square through the
   * soft lowpass, and the bells as a sine echo of the melody an octave up. At night only
   * the melody plays, on a sine an octave up and softer, at half tempo: a music box.
   */
  private playStep(step: number, at: number) {
    const { drum, bass, melody, bells, night } = this.loops
    const out = this.tune!
    const bar = Math.floor(step / 8)
    const beat = step % 8
    const note = MELODY[step]!
    if (night) {
      if (melody && note > 0) this.tone('sine', hz(note + 12), hz(note + 12), at, STEP * 3.5, 0.04, out)
      return
    }
    if (drum && beat % 4 === 0) this.tone('sine', 120, 40, at, 0.18, 0.2, out)
    if (drum && beat % 4 === 2) this.noise('highpass', 4000, at, 0.002, 0.03, 0.05, out)
    if (bass && beat === 0) this.tone('triangle', hz(BASS[bar]!), hz(BASS[bar]!), at, STEP * 7, 0.14, out)
    if (melody && note > 0) this.tone('square', hz(note), hz(note), at, STEP * 0.9, 0.06, this.soft!)
    if (bells && note > 0) this.tone('sine', hz(note + 12), hz(note + 12), at + 0.15, STEP * 2.5, 0.035, out)
  }

  /** One oscillator sliding from `f0` to `f1` over `dur`, dying away by the end. */
  private tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, vol: number, out: AudioNode) {
    const osc = this.ctx!.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(f0, at)
    osc.frequency.exponentialRampToValueAtTime(f1, at + dur)
    osc.connect(this.envelope(at, 0.005, dur, vol, out))
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  /** A puff of the white noise through one filter, rising over `attack`, gone by `at + dur`. */
  private noise(type: BiquadFilterType, freq: number, at: number, attack: number, dur: number, vol: number, out: AudioNode) {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.white!
    src.loop = true
    src.connect(this.filter(type, freq, this.envelope(at, attack, dur, vol, out)))
    src.start(at)
    src.stop(at + dur + 0.02)
  }

  /** A gain that rises to `vol` over `attack` and fades to nothing by `at + dur`, wired into `out`. */
  private envelope(at: number, attack: number, dur: number, vol: number, out: AudioNode) {
    const gain = this.ctx!.createGain()
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(vol, at + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    gain.connect(out)
    return gain
  }

  private filter(type: BiquadFilterType, freq: number, out: AudioNode) {
    const filter = this.ctx!.createBiquadFilter()
    filter.type = type
    filter.frequency.value = freq
    filter.connect(out)
    return filter
  }

  /** White noise; with `crackle` its level wanders about and pops now and then, which is what a fire sounds like once low-passed. */
  private noiseBuffer(seconds: number, crackle: boolean) {
    const ctx = this.ctx!
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    let level = 1
    for (let i = 0; i < data.length; i++) {
      if (crackle) level = Math.min(1, Math.max(0.1, level + (Math.random() - 0.5) * 0.02)) * (Math.random() < 0.0003 ? 2 : 1)
      data[i] = (Math.random() * 2 - 1) * level
    }
    return buffer
  }

  /** Slides a gain to `to` over the fade, from wherever it is now. */
  private fade(gain: GainNode, to: number) {
    const t = this.ctx!.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(gain.gain.value, t)
    gain.gain.linearRampToValueAtTime(to, t + FADE)
  }
}
