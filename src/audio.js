// Tiny WebAudio synth for block interaction sounds (no external assets).
export class Sfx {
  constructor() {
    this.ctx = null
    this.master = null
    this._noise = null
    this.enabled = true
  }

  resume() {
    if (!this.enabled) return
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) { this.enabled = false; return }
      this.ctx = new AC()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.5
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') this.ctx.resume()
  }

  _noiseBuffer() {
    if (this._noise) return this._noise
    const len = this.ctx.sampleRate * 0.5
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    this._noise = buf
    return buf
  }

  _tone(freq, type, dur, gain, delay = 0) {
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(g).connect(this.master)
    osc.start(t0)
    osc.stop(t0 + dur + 0.02)
  }

  _burst(filterType, freq, q, dur, gain, delay = 0) {
    const t0 = this.ctx.currentTime + delay
    const src = this.ctx.createBufferSource()
    src.buffer = this._noiseBuffer()
    const filter = this.ctx.createBiquadFilter()
    filter.type = filterType
    filter.frequency.setValueAtTime(freq, t0)
    filter.Q.value = q
    const g = this.ctx.createGain()
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter).connect(g).connect(this.master)
    src.start(t0)
    src.stop(t0 + dur + 0.03)
  }

  play(kind, action = 'break') {
    if (!this.enabled) return
    this.resume()
    if (!this.ctx) return
    const v = action === 'place' ? 0.32 : 0.42
    switch (kind) {
      case 'stone':
        this._burst('lowpass', 900, 1, 0.14, v)
        this._tone(action === 'place' ? 150 : 190, 'square', 0.09, 0.12)
        break
      case 'wood':
        this._burst('bandpass', 700, 1.2, 0.13, v)
        this._tone(action === 'place' ? 210 : 260, 'triangle', 0.1, 0.14)
        break
      case 'sand':
        this._burst('highpass', 1400, 0.7, 0.12, v * 0.8)
        break
      case 'snow':
        this._burst('lowpass', 1600, 0.8, 0.11, v * 0.7)
        break
      case 'water':
        this._burst('lowpass', 600, 0.6, 0.26, v * 0.7)
        this._tone(320, 'sine', 0.18, 0.08)
        break
      default: // grass / leaves
        this._burst('bandpass', 1500, 0.9, 0.12, v * 0.9)
    }
  }
}
