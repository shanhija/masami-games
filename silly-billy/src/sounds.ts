/**
 * Every sound the game makes, synthesised with WebAudio from oscillators and one noise buffer,
 * nothing to load: short, cute and never loud. Under them lies a gentle bed for the room (a breeze
 * over the playground, water lapping at the pool, birds in the forest) that ducks while the
 * microphone listens. Browsers refuse to make a sound before the page has been touched, so
 * `unlock` runs on the first touch or key, and until then everything here is quiet.
 */

import type { RoomId, SoundName } from './engine/types'

/** Ten of the same sound in one frame is one sound. */
const DEDUP = 0.06
/** The whole game's level: nothing here is ever loud. */
const MASTER = 0.8
/** The room's bed while the microphone listens, against 1. */
const DUCKED = 0.2
/** Beds come and go over this long. */
const FADE = 0.8
/** How often the bed's little events (a bird, a drop) get their chance. */
const SPRINKLE_MS = 250

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12)
const rand = (a: number, b: number) => a + Math.random() * (b - a)

/** Each room's bed: a band of noise, its level and how slowly it swells. */
const BEDS: Record<RoomId, { filter: BiquadFilterType; freq: number; level: number; swell: number }> = {
  playground: { filter: 'bandpass', freq: 450, level: 0.035, swell: 0.09 },
  pool: { filter: 'lowpass', freq: 520, level: 0.045, swell: 0.23 },
  forest: { filter: 'bandpass', freq: 300, level: 0.018, swell: 0.07 },
}

export class Sounds {
  muted = false
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  /** The bed's own gain, which the microphone ducks. */
  private bus: GainNode | null = null
  private white: AudioBuffer | null = null
  private last: Partial<Record<SoundName, number>> = {}
  private room: RoomId | null = null
  private ducked = false
  private bed: { gain: GainNode; sources: AudioScheduledSourceNode[] } | null = null

  /** On the first touch or key: from then on there is sound. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = this.muted ? 0 : MASTER
    this.master.connect(ctx.destination)
    this.bus = ctx.createGain()
    this.bus.gain.value = this.ducked ? DUCKED : 1
    this.bus.connect(this.master)
    this.white = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = this.white.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    if (this.room) this.startBed(this.room)
    window.setInterval(() => this.sprinkle(), SPRINKLE_MS)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : MASTER
  }

  /** Called every frame with the room: the bed changes only when the room does. */
  setRoom(room: RoomId) {
    if (room === this.room) return
    this.room = room
    if (this.ctx) this.startBed(room)
  }

  /** The microphone is listening: the bed goes quiet so the words come through. */
  duck(on: boolean) {
    if (on === this.ducked) return
    this.ducked = on
    if (this.bus) this.fade(this.bus, on ? DUCKED : 1, 0.2)
  }

  /** A sound by its name, at `level` of its own loudness (Magic House's props play theirs quieter, under the room's). Only full-level sounds are one sound when played twice within DEDUP: a quieter one never takes a full one's place (the props space their own). */
  play(name: SoundName, level = 1) {
    const ctx = this.ctx
    if (!ctx) return
    const t = ctx.currentTime
    if (level === 1) {
      if (t - (this.last[name] ?? -1) < DEDUP) return
      this.last[name] = t
    }
    let out: AudioNode = this.master!
    if (level !== 1) {
      const under = ctx.createGain()
      under.gain.value = level
      under.connect(out)
      out = under
    }
    const tone = (type: OscillatorType, f0: number, f1: number, dt: number, dur: number, vol: number, to: AudioNode = out) => this.tone(type, f0, f1, t + dt, dur, vol, to)
    const noise = (type: BiquadFilterType, f0: number, f1: number, dt: number, attack: number, dur: number, vol: number) => this.noise(type, f0, f1, t + dt, attack, dur, vol, out)
    switch (name) {
      case 'boing': // A spring: a slide up with a little sparkle on top.
        tone('triangle', 160, 560, 0, 0.24, 0.12)
        tone('sine', 240, 820, 0, 0.12, 0.05)
        break
      case 'pop': // A cork: one quick blip up.
        tone('sine', 380, 1250, 0, 0.08, 0.14)
        break
      case 'whoosh': // Air going by: a band of noise sliding up.
        noise('bandpass', 400, 1800, 0, 0.12, 0.42, 0.09)
        break
      case 'splash': // Into the water, and two drops after.
        noise('lowpass', 1800, 900, 0, 0.01, 0.35, 0.13)
        tone('sine', 600, 200, 0, 0.15, 0.07)
        tone('sine', 1300, 2100, 0.14, 0.07, 0.04)
        tone('sine', 1600, 2500, 0.22, 0.06, 0.03)
        break
      case 'ding': // Something done: a bright ping.
        tone('triangle', 1568, 1568, 0, 0.45, 0.11)
        tone('sine', 3136, 3136, 0, 0.25, 0.04)
        break
      case 'bonk': // A soft cartoon knock on the head.
        tone('triangle', 440, 170, 0, 0.16, 0.15)
        noise('lowpass', 900, 900, 0, 0.003, 0.05, 0.07)
        break
      case 'giggle': // Hee-hee-hee: five little blips, each bending up, the row sinking.
        for (let i = 0; i < 5; i++) tone('triangle', 820 - i * 35, 980 - i * 35, i * 0.09, 0.07, 0.07)
        break
      case 'meow':
        this.meow(t, out)
        break
      case 'woof': // Two small barks.
        for (const dt of [0, 0.2]) {
          tone('sawtooth', 260, 140, dt, 0.11, 0.06, this.filter('lowpass', 900, out))
          noise('lowpass', 700, 700, dt, 0.005, 0.08, 0.05)
        }
        break
      case 'magic': // A sparkle: six quick notes up and a shimmer.
        ;[84, 88, 91, 96, 100, 103].forEach((n, i) => tone('sine', hz(n), hz(n), i * 0.05, 0.35, 0.05))
        noise('highpass', 6000, 6000, 0, 0.05, 0.5, 0.02)
        break
      case 'crash': // A soft tumble of things: a thump and three clatters, never a bang.
        noise('lowpass', 2200, 600, 0, 0.005, 0.5, 0.1)
        tone('sine', 120, 50, 0, 0.3, 0.09)
        ;[0.05, 0.13, 0.22].forEach((dt, i) => tone('triangle', 700 - i * 150, 400 - i * 100, dt, 0.08, 0.05))
        break
      case 'yay': // Four notes up a major chord, the last held.
        ;[72, 76, 79, 84].forEach((n, i) => tone('triangle', hz(n), hz(n) * 1.01, i * 0.07, i === 3 ? 0.4 : 0.15, 0.09))
        break
      case 'step': // A tiny pat on the ground, never twice the same.
        noise('lowpass', rand(450, 750), 300, 0, 0.004, 0.05, 0.03)
        break
      case 'swim': // A stroke through the water and a bubble.
        noise('lowpass', 900, 500, 0, 0.08, 0.3, 0.06)
        tone('sine', 420, 900, 0.1, 0.06, 0.03)
        break
      case 'squeak': // A rubber duck: up and back down.
        tone('square', 1300, 1900, 0, 0.07, 0.035, this.filter('bandpass', 1600, out))
        tone('square', 1900, 1400, 0.07, 0.09, 0.03, this.filter('bandpass', 1600, out))
        break
      case 'drum': // A low tom.
        tone('sine', 150, 55, 0, 0.28, 0.15)
        noise('lowpass', 400, 400, 0, 0.003, 0.06, 0.07)
        break
      case 'bell': // A little bell: a fundamental and three partials, the high ones dying first.
        ;[1, 2, 2.76, 4.07].forEach((k, i) => tone('sine', 880 * k, 880 * k, 0, 1.4 * (1 - i * 0.2), 0.08 * [1, 0.5, 0.3, 0.15][i]!))
        break
      case 'snore': // Zzz: a slow breath of low noise over a soft buzz.
        noise('lowpass', 260, 200, 0, 0.5, 1, 0.06)
        tone('sawtooth', 70, 60, 0.1, 0.8, 0.015, this.filter('lowpass', 300, out))
        break
      case 'munch': // Three crunchy bites.
        for (const dt of [0, 0.13, 0.26]) {
          const f = rand(1300, 2000)
          noise('bandpass', f, f, dt, 0.004, 0.06, 0.08)
        }
        break
      case 'zap': // A magic zap: a chirp up and a fall.
        tone('square', 1800, 3600, 0, 0.07, 0.035)
        tone('sine', 2600, 500, 0, 0.14, 0.05)
        break
    }
  }

  /** Mi-aow: a buzzy voice whose pitch and mouth open and close, a new cat each time. */
  private meow(t: number, out: AudioNode) {
    const ctx = this.ctx!
    const k = rand(0.9, 1.15)
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(450 * k, t)
    osc.frequency.linearRampToValueAtTime(720 * k, t + 0.12)
    osc.frequency.linearRampToValueAtTime(420 * k, t + 0.45)
    const mouth = ctx.createBiquadFilter()
    mouth.type = 'bandpass'
    mouth.Q.value = 3
    mouth.frequency.setValueAtTime(800, t)
    mouth.frequency.linearRampToValueAtTime(2000, t + 0.15)
    mouth.frequency.linearRampToValueAtTime(900, t + 0.45)
    osc.connect(mouth).connect(this.envelope(t, 0.04, 0.5, 0.12, out))
    osc.start(t)
    osc.stop(t + 0.55)
  }

  /** The room's bed: a band of noise that swells slowly, faded in over the old one fading out. */
  private startBed(room: RoomId) {
    const ctx = this.ctx!
    if (this.bed) {
      const old = this.bed
      this.fade(old.gain, 0, FADE)
      for (const s of old.sources) s.stop(ctx.currentTime + FADE + 0.05)
    }
    const spec = BEDS[room]
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(this.bus!)
    const level = ctx.createGain()
    level.gain.value = spec.level
    level.connect(gain)
    const src = ctx.createBufferSource()
    src.buffer = this.white
    src.loop = true
    src.connect(this.filter(spec.filter, spec.freq, level))
    const lfo = ctx.createOscillator()
    lfo.frequency.value = spec.swell
    const depth = ctx.createGain()
    depth.gain.value = spec.level * 0.5
    lfo.connect(depth).connect(level.gain)
    src.start()
    lfo.start()
    this.fade(gain, 1, FADE)
    this.bed = { gain, sources: [src, lfo] }
  }

  /** Now and then, into the bed: birds sing in the forest, drops plip at the pool, a bird far off over the playground. */
  private sprinkle() {
    const ctx = this.ctx!
    if (this.muted || this.room === null) return
    const t = ctx.currentTime
    const out = this.bus!
    const chirps = (n: number, vol: number) => {
      const f = rand(2300, 3400)
      for (let i = 0; i < n; i++) this.tone('sine', f, f * rand(1.15, 1.4), t + i * 0.09, 0.06, vol, out)
    }
    switch (this.room) {
      case 'forest':
        if (Math.random() < 0.08) chirps(2 + Math.floor(Math.random() * 3), 0.025)
        break
      case 'pool':
        if (Math.random() < 0.18) {
          const f = rand(700, 1400)
          this.tone('sine', f, f * 1.4, t, 0.06, 0.018, out)
        }
        break
      case 'playground':
        if (Math.random() < 0.015) chirps(2, 0.012)
        break
    }
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

  /** A puff of the white noise through one filter sliding from `f0` to `f1`, rising over `attack`, gone by `at + dur`. */
  private noise(type: BiquadFilterType, f0: number, f1: number, at: number, attack: number, dur: number, vol: number, out: AudioNode) {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.white
    src.loop = true
    const filter = this.filter(type, f0, this.envelope(at, attack, dur, vol, out))
    filter.frequency.setValueAtTime(f0, at)
    filter.frequency.exponentialRampToValueAtTime(f1, at + dur)
    src.connect(filter)
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

  /** Slides a gain to `to` over `secs`, from wherever it is now. */
  private fade(gain: GainNode, to: number, secs: number) {
    const t = this.ctx!.currentTime
    gain.gain.cancelScheduledValues(t)
    gain.gain.setValueAtTime(gain.gain.value, t)
    gain.gain.linearRampToValueAtTime(to, t + secs)
  }
}
