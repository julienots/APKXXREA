package com.superessence.musicmetric.audio;

/** Voice tools: separation (center/side spectral masking), denoise, pitch detection, auto-tune, harmonies, studio polish. */
public final class Vocal {
    private Vocal() { }
    static final int SR = AudioData.SR;

    interface FrameOp { void apply(float[] lr, float[] li, float[] rr, float[] ri, int bins, double binHz); }

    /** STFT (Hann, 75 % overlap) over both channels with a per-frame spectral operation. */
    static AudioData stft(AudioData in, int N, FrameOp op, Progress p) {
        int hop = N / 4, n = in.length();
        Fft fft = new Fft(N); float[] w = fft.window;
        float[] lr = new float[N], li = new float[N], rr = new float[N], ri = new float[N];
        AudioData o = new AudioData(n);
        int frames = (n + N) / hop;
        double binHz = SR / (double) N; float norm = 1f / 1.5f;
        for (int f = 0; f < frames; f++) {
            int start = f * hop - N;
            for (int i = 0; i < N; i++) {
                int j = start + i; float a = 0, b = 0;
                if (j >= 0 && j < n) { a = in.l[j]; b = in.r[j]; }
                lr[i] = a * w[i]; li[i] = 0; rr[i] = b * w[i]; ri[i] = 0;
            }
            fft.forward(lr, li); fft.forward(rr, ri);
            op.apply(lr, li, rr, ri, N / 2 + 1, binHz);
            for (int k = 1; k < N / 2; k++) { // keep Hermitian symmetry
                lr[N - k] = lr[k]; li[N - k] = -li[k]; rr[N - k] = rr[k]; ri[N - k] = -ri[k];
            }
            fft.inverse(lr, li); fft.inverse(rr, ri);
            for (int i = 0; i < N; i++) {
                int j = start + i; if (j < 0 || j >= n) continue;
                o.l[j] += lr[i] * w[i] * norm; o.r[j] += rr[i] * w[i] * norm;
            }
            if ((f & 127) == 0) p.set(f / (float) frames, null);
        }
        return o;
    }

    /** Soft mask of how "centered" (same in L and R) each bin is: 1 = pure center. */
    static float centerMask(float lr, float li, float rr, float ri) {
        float dr = lr - rr, di = li - ri, sr = lr + rr, si = li + ri;
        float side = dr * dr + di * di, mid = sr * sr + si * si;
        if (mid + side < 1e-12f) return 0;
        float ratio = mid / (mid + side); // 1 when L == R
        float m = (ratio - 0.62f) / 0.38f; if (m < 0) m = 0; if (m > 1) m = 1;
        return m * m * (3 - 2 * m);
    }

    static float vocalBand(double hz) {
        if (hz < 90) return 0; if (hz < 160) return (float) ((hz - 90) / 70);
        if (hz > 12000) return 0; if (hz > 8000) return (float) ((12000 - hz) / 4000);
        return 1;
    }

    /** A cappella: keeps the centered, vocal-band content. */
    public static AudioData isolate(AudioData in, final float strength, Progress p) {
        AudioData v = stft(in, 2048, new FrameOp() {
            public void apply(float[] lr, float[] li, float[] rr, float[] ri, int bins, double binHz) {
                for (int k = 0; k < bins; k++) {
                    float m = centerMask(lr[k], li[k], rr[k], ri[k]);
                    m = (float) Math.pow(m, 1 + strength * 2) * vocalBand(k * binHz);
                    float cr = 0.5f * (lr[k] + rr[k]) * m, ci = 0.5f * (li[k] + ri[k]) * m;
                    lr[k] = cr; li[k] = ci; rr[k] = cr; ri[k] = ci;
                }
            }
        }, p);
        return v;
    }

    /** Instrumental / karaoke: subtracts the centered vocal band, keeps bass and kick (also centered) intact. */
    public static AudioData removeVocals(AudioData in, final float strength, Progress p) {
        return stft(in, 2048, new FrameOp() {
            public void apply(float[] lr, float[] li, float[] rr, float[] ri, int bins, double binHz) {
                for (int k = 0; k < bins; k++) {
                    float m = centerMask(lr[k], li[k], rr[k], ri[k]) * vocalBand(k * binHz) * strength;
                    float cr = 0.5f * (lr[k] + rr[k]) * m, ci = 0.5f * (li[k] + ri[k]) * m;
                    lr[k] -= cr; li[k] -= ci; rr[k] -= cr; ri[k] -= ci;
                }
            }
        }, p);
    }

    /** Spectral gating noise reduction with a noise print taken from the quietest frames. */
    public static AudioData denoise(AudioData in, final float amount, Progress p) {
        final int N = 2048; int hop = N / 4, n = in.length();
        Fft fft = new Fft(N); float[] re = new float[N], im = new float[N];
        float[] mono = in.mono();
        int frames = Math.max(1, (n - N) / hop);
        float[] rms = new float[frames];
        for (int f = 0; f < frames; f++) { double s = 0; for (int i = 0; i < N; i += 4) s += mono[f * hop + i] * mono[f * hop + i]; rms[f] = (float) s; }
        float[] sorted = rms.clone(); java.util.Arrays.sort(sorted);
        float thr = sorted[Math.min(sorted.length - 1, Math.max(0, sorted.length / 10))];
        final float[] noise = new float[N / 2 + 1]; int cnt = 0;
        for (int f = 0; f < frames && cnt < 300; f++) if (rms[f] <= thr) {
            for (int i = 0; i < N; i++) { re[i] = mono[f * hop + i] * fft.window[i]; im[i] = 0; }
            fft.forward(re, im);
            for (int k = 0; k <= N / 2; k++) noise[k] += (float) Math.sqrt(re[k] * re[k] + im[k] * im[k]);
            cnt++;
        }
        if (cnt > 0) for (int k = 0; k <= N / 2; k++) noise[k] /= cnt;
        final float[] prevGain = new float[N / 2 + 1]; java.util.Arrays.fill(prevGain, 1f);
        return stft(in, N, new FrameOp() {
            public void apply(float[] lr, float[] li, float[] rr, float[] ri, int bins, double binHz) {
                for (int k = 0; k < bins; k++) {
                    float mag = (float) Math.sqrt(0.5 * (lr[k] * lr[k] + li[k] * li[k] + rr[k] * rr[k] + ri[k] * ri[k]));
                    float g = mag < 1e-9f ? 0 : 1 - (1.5f + 2.5f * amount) * noise[k] / mag;
                    float floor = 0.15f - 0.12f * amount; if (g < floor) g = floor; if (g > 1) g = 1;
                    g = prevGain[k] * 0.6f + g * 0.4f; prevGain[k] = g;
                    lr[k] *= g; li[k] *= g; rr[k] *= g; ri[k] *= g;
                }
            }
        }, p);
    }

    /** Studio vocal chain: cleanup EQ, de-esser, compression, presence and air, subtle plate. */
    public static AudioData enhance(AudioData in, float amount, Progress p) {
        AudioData o = in.copy();
        Dsp.filter(o, Biquad.highpass(85, 0.7));
        Dsp.filter(o, Biquad.peak(300, 1.0, -3 * amount));
        o = deEss(o, 0.6f * amount);
        p.set(0.3f, null);
        o = Dsp.compress(o, -22, 3.5, 4, 90, 4 * amount);
        Dsp.filter(o, Biquad.peak(3200, 0.9, 4 * amount));
        Dsp.filter(o, Biquad.highShelf(11000, 3 * amount));
        p.set(0.5f, null);
        o = Dsp.reverb(o, 0.35, 0.6, 0.14 * amount, 0.8, 25, new Progress.Sub(p, 0.5f, 1f));
        o.normalize(0.9f);
        return o;
    }

    static AudioData deEss(AudioData in, float amount) {
        int n = in.length(); AudioData o = new AudioData(n);
        Biquad dl = Biquad.bandpass(7000, 1.2), dr = dl.copy(); double env = 0, rel = Math.exp(-1.0 / (0.04 * SR));
        for (int i = 0; i < n; i++) {
            float sl = dl.process(in.l[i]), sr = dr.process(in.r[i]);
            double x = Math.max(Math.abs(sl), Math.abs(sr)); env = Math.max(x, env * rel);
            double g = env > 0.05 ? 1 - amount * Math.min(0.75, (env - 0.05) * 6) : 1;
            o.l[i] = (float) (in.l[i] - sl * (1 - g)); o.r[i] = (float) (in.r[i] - sr * (1 - g));
        }
        return o;
    }

    // ------------------------------------------------------------------ pitch

    /** YIN pitch track (Hz, 0 = unvoiced), one value per `hop` samples at 44.1 kHz. */
    public static float[] pitchTrack(float[] mono, int hop) {
        final int D = 4, sr = SR / D; // analyse at 11025 Hz
        int m = mono.length / D; float[] x = new float[m];
        Biquad lp = Biquad.lowpass(2500, 0.7);
        for (int i = 0; i < mono.length; i++) { float v = lp.process(mono[i]); if (i % D == 0 && i / D < m) x[i / D] = v; }
        final int W = 512, maxTau = sr / 70, minTau = sr / 1000, N = 1024;
        Fft fft = new Fft(N); float[] re = new float[N], im = new float[N], re2 = new float[N], im2 = new float[N];
        int frames = mono.length / hop; float[] out = new float[frames];
        double[] d = new double[maxTau + 1], cum = new double[W + maxTau + 2];
        for (int f = 0; f < frames; f++) {
            int s = f * hop / D - W / 2; if (s < 0 || s + W + maxTau >= m) continue;
            double e = 0; for (int i = 0; i < W; i++) e += x[s + i] * x[s + i];
            if (e < W * 1e-6) continue; // silence
            cum[0] = 0; for (int i = 0; i < W + maxTau; i++) cum[i + 1] = cum[i] + x[s + i] * x[s + i];
            // ACF via FFT: r(tau) = sum x[i] x[i+tau], i < W
            for (int i = 0; i < N; i++) { re[i] = i < W + maxTau ? x[s + i] : 0; im[i] = 0; }
            for (int i = 0; i < N; i++) { re2[i] = i < W ? x[s + i] : 0; im2[i] = 0; }
            fft.forward(re, im); fft.forward(re2, im2);
            for (int k = 0; k < N; k++) { float a = re[k] * re2[k] + im[k] * im2[k], b = im[k] * re2[k] - re[k] * im2[k]; re[k] = a; im[k] = b; }
            fft.inverse(re, im);
            d[0] = 1; double run = 0; int tau = -1;
            for (int t = 1; t <= maxTau; t++) {
                double dt = cum[W] + (cum[t + W] - cum[t]) - 2 * re[t];
                run += dt; d[t] = run > 0 ? dt * t / run : 1;
            }
            for (int t = minTau; t <= maxTau; t++) if (d[t] < 0.15) { while (t + 1 <= maxTau && d[t + 1] < d[t]) t++; tau = t; break; }
            if (tau < 0) continue;
            double betterTau = tau;
            if (tau > 1 && tau < maxTau) { double a = d[tau - 1], b = d[tau], c = d[tau + 1], den = a - 2 * b + c; if (Math.abs(den) > 1e-12) betterTau = tau + 0.5 * (a - c) / den; }
            out[f] = (float) (sr / betterTau);
        }
        // median-of-3 smoothing to remove octave glitches
        float[] sm = out.clone();
        for (int f = 1; f < frames - 1; f++) { float a = out[f - 1], b = out[f], c = out[f + 1]; sm[f] = Math.max(Math.min(a, b), Math.min(Math.max(a, b), c)); }
        return sm;
    }

    /** Variable-ratio two-tap delay-line pitch shifter (per-sample ratio). */
    static float[] shift(float[] x, float[] ratio, int W) {
        int n = x.length, B = 1 << 14; float[] buf = new float[B]; float[] y = new float[n];
        double ph = 0; int w = 0;
        for (int i = 0; i < n; i++) {
            buf[w] = x[i];
            double r = ratio[i];
            ph += (1 - r) / W; ph -= Math.floor(ph);
            double p2 = ph + 0.5; if (p2 >= 1) p2 -= 1;
            double d1 = ph * W + 2, d2 = p2 * W + 2;
            double g1 = Math.sin(Math.PI * ph), g2 = Math.sin(Math.PI * p2);
            y[i] = (float) (read(buf, w, d1, B) * g1 * g1 + read(buf, w, d2, B) * g2 * g2);
            w = (w + 1) & (B - 1);
        }
        return y;
    }

    static float read(float[] b, int w, double d, int B) {
        double pos = w - d; int i = (int) Math.floor(pos); float f = (float) (pos - i);
        return b[i & (B - 1)] * (1 - f) + b[(i + 1) & (B - 1)] * f;
    }

    /**
     * Auto-tune: snaps the detected pitch to the nearest note of the key. speed 0..1 (1 = robotic instant snap),
     * root < 0 = chromatic.
     */
    public static AudioData autotune(AudioData in, int root, boolean minor, float speed, Progress p) {
        float[] mono = in.mono(); final int hop = 512;
        p.set(0.05f, "Détection de la hauteur…");
        float[] f0 = pitchTrack(mono, hop);
        p.set(0.55f, "Correction…");
        int[] sc = Theory.scale(minor);
        boolean[] allowed = new boolean[12];
        if (root < 0) java.util.Arrays.fill(allowed, true); else for (int s : sc) allowed[(root + s) % 12] = true;
        float[] target = new float[f0.length]; double rs = 1; double k = 0.02 + 0.6 * speed * speed;
        for (int f = 0; f < f0.length; f++) {
            double want = 1;
            if (f0[f] > 0) {
                double midi = 69 + 12 * Math.log(f0[f] / 440.0) / Math.log(2);
                int best = (int) Math.round(midi); double bd = 99;
                for (int c = (int) Math.floor(midi) - 2; c <= (int) Math.ceil(midi) + 2; c++) if (allowed[((c % 12) + 12) % 12] && Math.abs(c - midi) < bd) { bd = Math.abs(c - midi); best = c; }
                want = Math.pow(2, (best - midi) / 12.0);
            }
            rs += (want - rs) * k; target[f] = (float) rs;
        }
        float[] ratio = new float[mono.length];
        for (int i = 0; i < ratio.length; i++) {
            int f = i / hop; float a = target[Math.min(f, target.length - 1)], b = target[Math.min(f + 1, target.length - 1)];
            ratio[i] = a + (b - a) * (i % hop) / hop;
        }
        AudioData o = new AudioData(shift(in.l, ratio, 1024), shift(in.r, ratio, 1024));
        p.set(1, null);
        return o;
    }

    public static AudioData shiftFixed(AudioData in, double semis) {
        float[] r = new float[in.length()]; java.util.Arrays.fill(r, (float) Math.pow(2, semis / 12));
        return new AudioData(shift(in.l, r, 1400), shift(in.r, r, 1400));
    }

    /** Adds diatonic-ish harmony voices (3rd above, 5th, octave below) panned around the lead. */
    public static AudioData harmonize(AudioData in, boolean minor, Progress p) {
        float[] m = in.mono(); AudioData src = new AudioData(m, m);
        AudioData third = shiftFixed(src, minor ? 3 : 4); p.set(0.33f, null);
        AudioData fifth = shiftFixed(src, 7); p.set(0.66f, null);
        AudioData low = shiftFixed(src, -12);
        AudioData o = in.copy(); int n = o.length();
        for (int i = 0; i < n; i++) {
            o.l[i] += third.l[i] * 0.42f + fifth.l[i] * 0.18f + low.l[i] * 0.22f;
            o.r[i] += third.r[i] * 0.18f + fifth.r[i] * 0.42f + low.r[i] * 0.22f;
        }
        o.normalize(0.9f); p.set(1, null);
        return o;
    }

    /** Double-tracking: two slightly detuned and delayed copies hard-panned. */
    public static AudioData doubler(AudioData in) {
        float[] m = in.mono(); AudioData src = new AudioData(m, m);
        AudioData up = shiftFixed(src, 0.12), dn = shiftFixed(src, -0.12);
        int dl = (int) (0.018 * SR), dr = (int) (0.027 * SR); AudioData o = in.copy();
        for (int i = 0; i < o.length(); i++) {
            if (i >= dl) o.l[i] += up.l[i - dl] * 0.5f;
            if (i >= dr) o.r[i] += dn.r[i - dr] * 0.5f;
        }
        o.normalize(0.9f); return o;
    }

    public static AudioData robot(AudioData in, double hz) {
        AudioData o = in.copy(); AudioData q = Vocal.autotune(o, -1, false, 1f, Progress.NONE);
        for (int i = 0; i < q.length(); i++) { float c = (float) Math.sin(2 * Math.PI * hz * i / SR); float m = 0.6f + 0.4f * c; q.l[i] *= m; q.r[i] *= m; }
        return Dsp.chorus(q, 2, 0.8, 0.4);
    }

    /** One-tap "perfect voice": isolate → denoise → tune → polish → remix over the instrumental. */
    public static AudioData perfectVoice(AudioData in, int root, boolean minor, float tune, float vocalLevel, Progress p) {
        p.set(0.02f, "Séparation de la voix…");
        AudioData voice = isolate(in, 0.6f, new Progress.Sub(p, 0, 0.2f));
        p.set(0.2f, "Création de l'instrumental…");
        AudioData inst = removeVocals(in, 1f, new Progress.Sub(p, 0.2f, 0.4f));
        p.set(0.4f, "Débruitage…");
        voice = denoise(voice, 0.5f, new Progress.Sub(p, 0.4f, 0.55f));
        p.set(0.55f, "Justesse…");
        if (tune > 0) voice = autotune(voice, root, minor, tune, new Progress.Sub(p, 0.55f, 0.8f));
        p.set(0.8f, "Traitement studio…");
        voice = enhance(voice, 1f, new Progress.Sub(p, 0.8f, 0.95f));
        AudioData mix = new AudioData(Math.max(inst.length(), voice.length()));
        mix.mix(inst, 0, 1f); mix.mix(voice, 0, vocalLevel * 0.75f);
        p.set(1, null);
        return Dsp.master(mix);
    }
}
