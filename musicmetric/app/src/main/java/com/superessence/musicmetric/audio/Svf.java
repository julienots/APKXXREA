package com.superessence.musicmetric.audio;

/** Zero-delay-feedback state variable filter (Simper), cutoff can change every sample. */
public final class Svf {
    double ic1, ic2, g, k, a1, a2, a3;
    public Svf() { set(1000, 0.7); }

    public void set(double cutoff, double q) {
        cutoff = Math.max(20, Math.min(cutoff, AudioData.SR * 0.45));
        g = Math.tan(Math.PI * cutoff / AudioData.SR); k = 1.0 / Math.max(0.1, q);
        a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2;
    }

    /** mode 0 = lowpass, 1 = bandpass, 2 = highpass */
    public float process(float x, int mode) {
        double v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2;
        if (mode == 0) return (float) v2;
        if (mode == 1) return (float) v1;
        return (float) (x - k * v1 - v2);
    }
}
