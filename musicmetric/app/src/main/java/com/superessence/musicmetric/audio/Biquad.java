package com.superessence.musicmetric.audio;

/** RBJ cookbook biquad (direct form I, per-instance state). */
public final class Biquad {
    double b0, b1, b2, a1, a2, x1, x2, y1, y2;

    public static Biquad lowpass(double f, double q) { return make(0, f, q, 0); }
    public static Biquad highpass(double f, double q) { return make(1, f, q, 0); }
    public static Biquad bandpass(double f, double q) { return make(2, f, q, 0); }
    public static Biquad peak(double f, double q, double db) { return make(3, f, q, db); }
    public static Biquad lowShelf(double f, double db) { return make(4, f, 0.707, db); }
    public static Biquad highShelf(double f, double db) { return make(5, f, 0.707, db); }

    static Biquad make(int type, double f, double q, double db) {
        Biquad b = new Biquad();
        f = Math.max(10, Math.min(f, AudioData.SR * 0.49));
        double w = 2 * Math.PI * f / AudioData.SR, cw = Math.cos(w), sw = Math.sin(w), alpha = sw / (2 * q), A = Math.pow(10, db / 40);
        double b0, b1, b2, a0, a1, a2;
        switch (type) {
            case 0: b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = (1 - cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
            case 1: b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = (1 + cw) / 2; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
            case 2: b0 = alpha; b1 = 0; b2 = -alpha; a0 = 1 + alpha; a1 = -2 * cw; a2 = 1 - alpha; break;
            case 3: b0 = 1 + alpha * A; b1 = -2 * cw; b2 = 1 - alpha * A; a0 = 1 + alpha / A; a1 = -2 * cw; a2 = 1 - alpha / A; break;
            case 4: { double sa = 2 * Math.sqrt(A) * alpha;
                b0 = A * ((A + 1) - (A - 1) * cw + sa); b1 = 2 * A * ((A - 1) - (A + 1) * cw); b2 = A * ((A + 1) - (A - 1) * cw - sa);
                a0 = (A + 1) + (A - 1) * cw + sa; a1 = -2 * ((A - 1) + (A + 1) * cw); a2 = (A + 1) + (A - 1) * cw - sa; break; }
            default: { double sa = 2 * Math.sqrt(A) * alpha;
                b0 = A * ((A + 1) + (A - 1) * cw + sa); b1 = -2 * A * ((A - 1) + (A + 1) * cw); b2 = A * ((A + 1) + (A - 1) * cw - sa);
                a0 = (A + 1) - (A - 1) * cw + sa; a1 = 2 * ((A - 1) - (A + 1) * cw); a2 = (A + 1) - (A - 1) * cw - sa; }
        }
        b.b0 = b0 / a0; b.b1 = b1 / a0; b.b2 = b2 / a0; b.a1 = a1 / a0; b.a2 = a2 / a0;
        return b;
    }

    public float process(float x) {
        double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        if (Math.abs(y1) < 1e-20) y1 = 0;
        return (float) y;
    }

    public void process(float[] buf) { for (int i = 0; i < buf.length; i++) buf[i] = process(buf[i]); }

    public Biquad copy() { Biquad c = new Biquad(); c.b0 = b0; c.b1 = b1; c.b2 = b2; c.a1 = a1; c.a2 = a2; return c; }
}
