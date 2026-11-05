import { clamp } from '../core/filters';

export interface Visemes {
  level: number; // 0..1 speech energy
  open: number;
  wide: number;
  round: number;
  A: number;
  E: number;
  I: number;
  O: number;
  U: number;
  voiced: boolean;
}

/** Formant targets (F1, F2 in Hz) for French vowels, averaged over adult voices. */
const VOWELS: Record<'A' | 'E' | 'I' | 'O' | 'U', [number, number]> = {
  A: [750, 1350],
  E: [480, 1950],
  I: [300, 2250],
  O: [450, 850],
  U: [320, 800],
};

const SHAPE: Record<keyof typeof VOWELS, { open: number; wide: number; round: number }> = {
  A: { open: 1, wide: 0.25, round: 0 },
  E: { open: 0.55, wide: 0.6, round: 0 },
  I: { open: 0.3, wide: 0.9, round: 0 },
  O: { open: 0.65, wide: -0.2, round: 0.85 },
  U: { open: 0.28, wide: -0.4, round: 1 },
};

/**
 * Voice-driven mouth animation (Web Audio API): RMS envelope with adaptive noise gate for the rhythm,
 * spectral flatness for voicing, and formant (F1/F2) estimation from the smoothed spectrum to
 * recognise vowels A / E / I / O / U.
 */
export class LipSync {
  stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private freq: Float32Array<ArrayBuffer> = new Float32Array(0);
  private time: Float32Array<ArrayBuffer> = new Float32Array(0);
  private noise = 0.01;
  private env = 0;
  private peak = 0.08;
  readonly out: Visemes = { level: 0, open: 0, wide: 0, round: 0, A: 0, E: 0, I: 0, O: 0, U: 0, voiced: false };
  error = '';

  get active(): boolean {
    return !!this.stream;
  }

  async start(gain = 1): Promise<boolean> {
    if (this.stream) return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
    } catch (e) {
      this.error = (e as Error).message || 'Micro indisponible';
      return false;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.gainNode = this.ctx.createGain();
    this.gainNode.gain.value = gain;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.35;
    src.connect(this.gainNode);
    this.gainNode.connect(this.analyser);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.time = new Float32Array(this.analyser.fftSize);
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    return true;
  }

  setGain(g: number): void {
    if (this.gainNode) this.gainNode.gain.value = g;
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
  }

  update(dt: number): Visemes {
    const o = this.out;
    const an = this.analyser;
    if (!an || !this.ctx) {
      o.level *= 0.8;
      o.open *= 0.8;
      return o;
    }
    an.getFloatTimeDomainData(this.time);
    let sum = 0;
    for (let i = 0; i < this.time.length; i++) sum += this.time[i] * this.time[i];
    const rms = Math.sqrt(sum / this.time.length);

    // Adaptive noise floor: falls fast, rises slowly
    this.noise = rms < this.noise ? this.noise + (rms - this.noise) * 0.2 : this.noise + (rms - this.noise) * 0.002;
    this.peak = Math.max(this.peak * (1 - dt * 0.15), rms, this.noise * 3, 0.02);
    const gate = this.noise * 1.8 + 0.003;
    const lvl = clamp((rms - gate) / (this.peak - gate + 1e-4));
    // Envelope: fast attack, medium release -> syllable rhythm
    this.env += (lvl - this.env) * (lvl > this.env ? 0.6 : 0.25);
    o.level = this.env;

    // Spectrum
    an.getFloatFrequencyData(this.freq);
    const binHz = this.ctx.sampleRate / an.fftSize;
    const lin = (db: number) => Math.pow(10, db / 20);
    // Spectral flatness in the speech band (voicing detector)
    let logSum = 0, linSum = 0, n = 0;
    const b0 = Math.floor(200 / binHz), b1 = Math.floor(4000 / binHz);
    for (let i = b0; i < b1; i++) {
      const v = lin(this.freq[i]) + 1e-9;
      logSum += Math.log(v);
      linSum += v;
      n++;
    }
    const flatness = Math.exp(logSum / n) / (linSum / n);
    o.voiced = this.env > 0.08 && flatness < 0.35;

    // Formants: peak picking on a smoothed log spectrum
    const smooth = (center: number, width: number) => {
      let s = 0, c = 0;
      for (let i = Math.max(0, center - width); i <= Math.min(this.freq.length - 1, center + width); i++) {
        s += this.freq[i];
        c++;
      }
      return s / c;
    };
    const peakIn = (lo: number, hi: number) => {
      let best = -Infinity, bestF = (lo + hi) / 2;
      for (let f = lo; f <= hi; f += binHz) {
        const v = smooth(Math.round(f / binHz), 3);
        if (v > best) {
          best = v;
          bestF = f;
        }
      }
      return bestF;
    };
    const target = { A: 0, E: 0, I: 0, O: 0, U: 0 };
    if (o.voiced) {
      const F1 = peakIn(250, 950);
      const F2 = peakIn(Math.max(700, F1 + 200), 2700);
      let total = 0;
      for (const k of Object.keys(VOWELS) as (keyof typeof VOWELS)[]) {
        const [t1, t2] = VOWELS[k];
        const d = Math.pow(Math.log(F1 / t1) / 0.28, 2) + Math.pow(Math.log(F2 / t2) / 0.32, 2);
        const w = Math.exp(-d);
        target[k] = w;
        total += w;
      }
      if (total > 1e-4) for (const k of Object.keys(target) as (keyof typeof target)[]) target[k] /= total;
      else target.A = 1;
    }
    const k = 1 - Math.exp(-dt * 14);
    let open = 0, wide = 0, round = 0;
    for (const v of Object.keys(target) as (keyof typeof target)[]) {
      o[v] += (target[v] - o[v]) * k;
      open += SHAPE[v].open * o[v];
      wide += SHAPE[v].wide * o[v];
      round += SHAPE[v].round * o[v];
    }
    const e = this.env;
    o.open = clamp(e * (0.45 + open * 0.75) * 1.25);
    o.wide = wide * e;
    o.round = clamp(round * Math.min(1, e * 2));
    return o;
  }
}
