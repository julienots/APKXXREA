/** One Euro filter (Casiez et al. 2012): low jitter at rest, low lag when moving. */
export class OneEuro {
  private x = 0;
  private dx = 0;
  private init = false;
  constructor(public minCutoff = 1.2, public beta = 0.02, public dCutoff = 1.0) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(v: number, dt: number): number {
    if (!this.init || !isFinite(this.x)) {
      this.x = v;
      this.dx = 0;
      this.init = true;
      return v;
    }
    dt = Math.max(1e-3, dt);
    const d = (v - this.x) / dt;
    const ad = OneEuro.alpha(this.dCutoff, dt);
    this.dx += ad * (d - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    const a = OneEuro.alpha(cutoff, dt);
    this.x += a * (v - this.x);
    return this.x;
  }

  reset(): void {
    this.init = false;
  }
}

export const clamp = (v: number, a = 0, b = 1): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number): number => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** Frame-rate independent exponential approach. */
export const damp = (a: number, b: number, lambda: number, dt: number): number => lerp(a, b, 1 - Math.exp(-lambda * dt));
