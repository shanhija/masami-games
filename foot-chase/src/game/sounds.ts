export type SoundKind = 'jump' | 'boing' | 'land' | 'crash' | 'honk' | 'coin' | 'coins' | 'pop' | 'knock' | 'bark' | 'yelp' | 'win' | 'lose' | 'whoosh' | 'whistle' | 'propeller'

/**
 * Every sound is synthesised: a few oscillators and one noise buffer, nothing to load.
 * Browsers refuse to make a sound before the page has been touched, so `unlock` runs
 * on the first press and the propeller waits for it.
 */
export class Sounds {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private hum: { oscs: OscillatorNode[]; gain: GainNode } | null = null
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

  /** The propeller's drone runs for as long as the robber flies: two low sawtooths a few hertz apart, beating. */
  setHum(on: boolean) {
    if (!this.ctx || !this.master) return
    if (on === (this.hum !== null)) return
    if (!on) {
      this.hum!.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1)
      for (const osc of this.hum!.oscs) osc.stop(this.ctx.currentTime + 0.5)
      this.hum = null
      return
    }
    const gain = this.ctx.createGain()
    gain.gain.value = 0.04
    gain.connect(this.master)
    const oscs = [88, 93].map((f) => {
      const osc = this.ctx!.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = f
      osc.connect(gain)
      osc.start()
      return osc
    })
    this.hum = { oscs, gain }
  }

  play(kind: SoundKind) {
    if (!this.ctx || !this.master) return
    const t = this.ctx.currentTime
    switch (kind) {
      case 'jump':
        this.tone('sine', 300, 900, t, 0.25, 0.25)
        break
      case 'boing':
        this.tone('square', 150, 700, t, 0.35, 0.12)
        this.tone('sine', 200, 1200, t, 0.35, 0.2)
        break
      case 'land':
        this.tone('sine', 140, 70, t, 0.12, 0.3)
        break
      case 'crash':
        this.noise(t, 0.35, 0.5)
        this.tone('square', 90, 40, t, 0.3, 0.3)
        break
      case 'honk':
        this.tone('sawtooth', 330, 330, t, 0.18, 0.15)
        this.tone('sawtooth', 330, 330, t + 0.24, 0.3, 0.15)
        break
      case 'coin':
        this.tone('square', 1319, 1319, t, 0.08, 0.1)
        this.tone('square', 1760, 1760, t + 0.08, 0.25, 0.1)
        break
      case 'coins':
        ;[0, 1, 2, 3, 4, 5].forEach((i) => this.tone('square', 1200 + i * 150, 1200 + i * 150, t + i * 0.06, 0.12, 0.08))
        break
      case 'pop':
        this.tone('sine', 400, 1400, t, 0.15, 0.3)
        this.noise(t, 0.12, 0.2)
        break
      case 'knock':
        this.tone('square', 160, 60, t, 0.2, 0.25)
        break
      case 'bark':
        this.tone('sawtooth', 420, 260, t, 0.1, 0.2)
        this.tone('sawtooth', 460, 280, t + 0.14, 0.1, 0.2)
        break
      case 'yelp':
        this.tone('square', 700, 1400, t, 0.18, 0.12)
        break
      case 'win':
        ;[523, 659, 784, 1047].forEach((f, i) => this.tone('square', f, f, t + i * 0.09, 0.16, 0.12))
        break
      case 'lose':
        // The sad trombone: three notes sliding down.
        ;[392, 370, 349].forEach((f, i) => this.tone('sawtooth', f, f * 0.94, t + i * 0.28, 0.3, 0.08))
        break
      case 'whoosh':
        this.tone('sawtooth', 220, 900, t, 0.5, 0.12)
        break
      case 'whistle':
        this.tone('sine', 2200, 2600, t, 0.12, 0.15)
        this.tone('sine', 2600, 2200, t + 0.12, 0.4, 0.15)
        break
      case 'propeller':
        this.tone('sawtooth', 60, 240, t, 0.6, 0.15)
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
