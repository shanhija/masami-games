export type SoundKind = 'jump' | 'land' | 'crash' | 'win' | 'lose' | 'turbo' | 'eek' | 'pop'

/**
 * Every sound is synthesised: a few oscillators and one noise buffer, nothing to load.
 * Browsers refuse to make a sound before the page has been touched, so `unlock` runs
 * on the first press and the siren waits for it.
 */
export class Sounds {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private siren: { osc: OscillatorNode; timer: number } | null = null
  muted = false

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    this.ctx = new AudioContext()
    this.master = this.ctx.createGain()
    this.master.gain.value = this.muted ? 0 : 1
    this.master.connect(this.ctx.destination)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (this.master) this.master.gain.value = muted ? 0 : 1
  }

  /** The siren runs for as long as the chase does: two notes, a beat apart. */
  setSiren(on: boolean) {
    if (!this.ctx || !this.master) return
    if (on === (this.siren !== null)) return
    if (!on) {
      window.clearInterval(this.siren!.timer)
      this.siren!.osc.stop()
      this.siren = null
      return
    }
    const osc = this.ctx.createOscillator()
    osc.type = 'triangle'
    const gain = this.ctx.createGain()
    gain.gain.value = 0.035
    osc.connect(gain).connect(this.master)
    osc.start()
    let high = false
    const timer = window.setInterval(() => {
      high = !high
      osc.frequency.setTargetAtTime(high ? 880 : 660, this.ctx!.currentTime, 0.05)
    }, 380)
    this.siren = { osc, timer }
  }

  play(kind: SoundKind) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    switch (kind) {
      case 'jump':
        this.tone('sine', 300, 900, t, 0.25, 0.25)
        break
      case 'land':
        this.tone('sine', 140, 70, t, 0.12, 0.3)
        break
      case 'crash':
        this.noise(t, 0.35, 0.5)
        this.tone('square', 90, 40, t, 0.3, 0.3)
        break
      case 'win':
        ;[523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, t + i * 0.09, 0.16, 0.12))
        break
      case 'lose':
        // The sad trombone: three notes sliding down.
        ;[392, 370, 349].forEach((f, i) => this.tone('sawtooth', f, f * 0.94, t + i * 0.28, 0.3, 0.08))
        break
      case 'turbo':
        this.tone('sawtooth', 220, 900, t, 0.5, 0.12)
        break
      case 'eek':
        // The driver's shriek at a worm: two quick squeaks going up.
        this.tone('square', 900, 1500, t, 0.12, 0.08)
        this.tone('square', 1100, 1900, t + 0.14, 0.16, 0.08)
        break
      case 'pop':
        this.tone('sine', 700, 250, t, 0.12, 0.25)
        break
    }
  }

  /** One oscillator sweeping from `f0` to `f1` over `dur`, fading out over the same time. */
  private tone(type: OscillatorType, f0: number, f1: number, at: number, dur: number, volume: number) {
    const osc = this.ctx!.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(f0, at)
    osc.frequency.exponentialRampToValueAtTime(f1, at + dur)
    const gain = this.ctx!.createGain()
    gain.gain.setValueAtTime(volume, at)
    gain.gain.exponentialRampToValueAtTime(0.001, at + dur)
    osc.connect(gain).connect(this.master!)
    osc.start(at)
    osc.stop(at + dur + 0.02)
  }

  private noise(at: number, dur: number, volume: number) {
    const ctx = this.ctx!
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 900
    const gain = ctx.createGain()
    gain.gain.value = volume
    src.connect(filter).connect(gain).connect(this.master!)
    src.start(at)
  }
}
