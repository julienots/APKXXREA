package com.superessence.musicmetric.audio;

import java.util.Random;

/** Offline effect processors. Every method returns a new buffer (or the same one when noted). */
public final class Dsp {
    private Dsp() { }
    static final int SR = AudioData.SR;

    // ---------------------------------------------------------------- speed / tempo / pitch

    /** Varispeed: plays faster/slower, pitch follows (slowed = 0.8, nightcore = 1.25). */
    public static AudioData speed(AudioData in, double ratio, Progress p) {
        if (Math.abs(ratio - 1) < 1e-4) return in.copy();
        AudioData src = in;
        if (ratio > 1.0) { // anti-alias before compressing the spectrum upward
            src = in.copy(); double fc = 19000 / ratio;
            filter(src, Biquad.lowpass(fc, 0.707)); filter(src, Biquad.lowpass(fc, 0.707));
        }
        return new AudioData(resample(src.l, ratio), resample(src.r, ratio));
    }

    /** Cubic (Catmull-Rom) resampler: output length = n / ratio. */
    public static float[] resample(float[] x, double ratio) {
        int n = x.length, m = (int) Math.max(1, Math.floor(n / ratio));
        float[] y = new float[m];
        for (int i = 0; i < m; i++) {
            double pos = i * ratio; int k = (int) pos; float t = (float) (pos - k);
            float p0 = at(x, k - 1), p1 = at(x, k), p2 = at(x, k + 1), p3 = at(x, k + 2);
            y[i] = p1 + 0.5f * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
        }
        return y;
    }

    static float at(float[] x, int i) { return i < 0 || i >= x.length ? 0 : x[i]; }

    /**
     * WSOLA time-stretch. rate > 1 = faster (shorter), rate < 1 = slower. Pitch is preserved.
     * Alignment is searched on the mono mix and applied to both channels so the stereo image stays intact.
     */
    public static AudioData tempo(AudioData in, double rate, Progress p) {
        if (Math.abs(rate - 1) < 1e-4) return in.copy();
        final int N = 2048, Hs = N / 2, tol = 512, L = 512;
        int n = in.length();
        float[] mono = in.mono();
        int outLen = (int) (n / rate) + N;
        float[] ol = new float[outLen], or = new float[outLen];
        float[] w = new Fft(N).window;
        int frames = (int) ((outLen - N) / (double) Hs);
        int prevIn = 0;
        for (int k = 0; k < frames; k++) {
            int nominal = (int) Math.round(k * Hs * rate);
            int best = nominal;
            if (k > 0) {
                int target = prevIn + Hs; // natural continuation of the previous frame
                double bestC = -1e30;
                for (int d = -tol; d <= tol; d += 2) {
                    int s = nominal + d; if (s < 0 || s + L >= n || target + L >= n) continue;
                    double c = 0;
                    for (int j = 0; j < L; j += 2) c += mono[s + j] * mono[target + j];
                    if (c > bestC) { bestC = c; best = s; }
                }
            }
            if (best < 0) best = 0;
            int o = k * Hs;
            for (int j = 0; j < N; j++) {
                int si = best + j; if (si >= n) break;
                ol[o + j] += in.l[si] * w[j]; or[o + j] += in.r[si] * w[j];
            }
            prevIn = best;
            if ((k & 255) == 0) p.set(k / (float) frames, null);
        }
        int len = Math.min(outLen, (int) (n / rate));
        AudioData out = new AudioData(len);
        System.arraycopy(ol, 0, out.l, 0, len); System.arraycopy(or, 0, out.r, 0, len);
        return out;
    }

    /** Pitch shift in semitones keeping duration (WSOLA + resample). */
    public static AudioData pitch(AudioData in, double semis, Progress p) {
        if (Math.abs(semis) < 0.01) return in.copy();
        double r = Math.pow(2, semis / 12.0);
        AudioData st = tempo(in, 1.0 / r, new Progress.Sub(p, 0, 0.85f));
        AudioData o = speed(st, r, Progress.NONE);
        p.set(1, null);
        return fitLength(o, in.length());
    }

    static AudioData fitLength(AudioData a, int n) {
        if (a.length() == n) return a;
        AudioData o = new AudioData(n);
        int m = Math.min(n, a.length());
        System.arraycopy(a.l, 0, o.l, 0, m); System.arraycopy(a.r, 0, o.r, 0, m);
        return o;
    }

    // ---------------------------------------------------------------- filters / EQ

    public static void filter(AudioData a, Biquad b) {
        Biquad c = b.copy(); b.process(a.l); c.process(a.r);
    }

    public static AudioData eq(AudioData in, double bassDb, double midDb, double trebleDb) {
        AudioData o = in.copy();
        if (Math.abs(bassDb) > 0.05) filter(o, Biquad.lowShelf(110, bassDb));
        if (Math.abs(midDb) > 0.05) filter(o, Biquad.peak(1200, 0.8, midDb));
        if (Math.abs(trebleDb) > 0.05) filter(o, Biquad.highShelf(6500, trebleDb));
        return o;
    }

    /** Deep sub-focused bass boost with a gentle low-mid cleanup so it hits without getting muddy. */
    public static AudioData bassBoost(AudioData in, double db) {
        AudioData o = in.copy();
        filter(o, Biquad.peak(55, 0.9, db));
        filter(o, Biquad.lowShelf(120, db * 0.45));
        filter(o, Biquad.peak(320, 1.0, -db * 0.25));
        return o;
    }

    // ---------------------------------------------------------------- reverb (Freeverb)

    static final int[] COMB = {1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617};
    static final int[] ALLP = {556, 441, 341, 225};

    /**
     * Stereo Freeverb. room 0..1, damp 0..1, wet 0..1, width 0..1. Adds a tail so the reverb rings out.
     */
    public static AudioData reverb(AudioData in, double room, double damp, double wet, double width, double predelayMs, Progress p) {
        int tail = (int) (SR * (1.2 + room * 3.5));
        int n = in.length(), total = n + tail, pre = (int) (predelayMs * SR / 1000);
        AudioData o = new AudioData(total);
        float fb = (float) (0.70 + room * 0.28), d = (float) (damp * 0.4), gain = 0.015f;
        float wet1 = (float) (wet * (width / 2 + 0.5)), wet2 = (float) (wet * ((1 - width) / 2));
        float dry = (float) (1 - wet * 0.55);
        float[][] cl = new float[8][], cr = new float[8][]; float[] stl = new float[8], str = new float[8];
        int[] il = new int[8], ir = new int[8];
        for (int i = 0; i < 8; i++) { cl[i] = new float[COMB[i]]; cr[i] = new float[COMB[i] + 23]; }
        float[][] al = new float[4][], ar = new float[4][]; int[] jl = new int[4], jr = new int[4];
        for (int i = 0; i < 4; i++) { al[i] = new float[ALLP[i]]; ar[i] = new float[ALLP[i] + 23]; }
        float[] preL = new float[Math.max(1, pre)], preR = new float[Math.max(1, pre)]; int pi = 0;
        Biquad hpL = Biquad.highpass(180, 0.7), hpR = hpL.copy();
        for (int s = 0; s < total; s++) {
            float xl = s < n ? in.l[s] : 0, xr = s < n ? in.r[s] : 0;
            float inp = (hpL.process(xl) + hpR.process(xr)) * gain;
            float delayed;
            if (pre > 0) { delayed = preL[pi]; preL[pi] = inp; pi = (pi + 1) % pre; } else delayed = inp;
            float outL = 0, outR = 0;
            for (int c = 0; c < 8; c++) {
                float y = cl[c][il[c]]; stl[c] = y * (1 - d) + stl[c] * d; cl[c][il[c]] = delayed + stl[c] * fb; if (++il[c] >= cl[c].length) il[c] = 0; outL += y;
                y = cr[c][ir[c]]; str[c] = y * (1 - d) + str[c] * d; cr[c][ir[c]] = delayed + str[c] * fb; if (++ir[c] >= cr[c].length) ir[c] = 0; outR += y;
            }
            for (int a = 0; a < 4; a++) {
                float b = al[a][jl[a]]; float y = -outL + b; al[a][jl[a]] = outL + b * 0.5f; if (++jl[a] >= al[a].length) jl[a] = 0; outL = y;
                b = ar[a][jr[a]]; y = -outR + b; ar[a][jr[a]] = outR + b * 0.5f; if (++jr[a] >= ar[a].length) jr[a] = 0; outR = y;
            }
            o.l[s] = xl * dry + outL * wet1 + outR * wet2;
            o.r[s] = xr * dry + outR * wet1 + outL * wet2;
            if ((s & 0xFFFF) == 0) p.set(s / (float) total, null);
        }
        return trimTail(o, n, 0.0008f);
    }

    /** Drops the silent end of a reverb/echo tail, keeping at least `keep` samples. */
    static AudioData trimTail(AudioData a, int keep, float thr) {
        int end = a.length();
        while (end > keep && Math.abs(a.l[end - 1]) < thr && Math.abs(a.r[end - 1]) < thr) end--;
        end = Math.min(a.length(), end + SR / 20);
        if (end >= a.length()) return a;
        AudioData o = a.slice(0, end);
        fadeOut(o, Math.min(SR / 10, end));
        return o;
    }

    // ---------------------------------------------------------------- delay / modulation

    public static AudioData echo(AudioData in, double delayMs, double feedback, double mix, boolean pingPong) {
        int d = Math.max(1, (int) (delayMs * SR / 1000));
        int tail = (int) Math.min(SR * 8, d * Math.ceil(Math.log(0.001) / Math.log(Math.max(0.05, feedback))));
        int n = in.length(), total = n + tail;
        AudioData o = new AudioData(total);
        float[] bl = new float[d], br = new float[d]; int idx = 0;
        Biquad lpL = Biquad.lowpass(5000, 0.7), lpR = lpL.copy();
        float fb = (float) feedback, m = (float) mix;
        for (int s = 0; s < total; s++) {
            float xl = s < n ? in.l[s] : 0, xr = s < n ? in.r[s] : 0;
            float yl = bl[idx], yr = br[idx];
            if (pingPong) { bl[idx] = lpL.process(0.5f * (xl + xr) + yr * fb); br[idx] = lpR.process(yl * fb); }
            else { bl[idx] = lpL.process(xl + yl * fb); br[idx] = lpR.process(xr + yr * fb); }
            if (++idx >= d) idx = 0;
            o.l[s] = xl + yl * m; o.r[s] = xr + yr * m;
        }
        return trimTail(o, n, 0.0008f);
    }

    public static AudioData chorus(AudioData in, double depthMs, double rateHz, double mix) {
        int n = in.length(); AudioData o = new AudioData(n);
        int maxD = (int) ((depthMs * 2 + 25) * SR / 1000) + 4;
        float[] bl = new float[maxD], br = new float[maxD]; int w = 0;
        double base = 12 * SR / 1000.0, dep = depthMs * SR / 1000.0;
        for (int s = 0; s < n; s++) {
            bl[w] = in.l[s]; br[w] = in.r[s];
            double ph = 2 * Math.PI * rateHz * s / SR;
            double dl = base + dep * (1 + Math.sin(ph)), dr = base + dep * (1 + Math.cos(ph));
            o.l[s] = (float) (in.l[s] * (1 - mix * 0.5) + readFrac(bl, w, dl) * mix);
            o.r[s] = (float) (in.r[s] * (1 - mix * 0.5) + readFrac(br, w, dr) * mix);
            if (++w >= maxD) w = 0;
        }
        return o;
    }

    static float readFrac(float[] buf, int w, double delay) {
        double pos = w - delay; while (pos < 0) pos += buf.length;
        int i = (int) pos; float f = (float) (pos - i); int j = (i + 1) % buf.length;
        return buf[i] * (1 - f) + buf[j] * f;
    }

    /** "8D audio": slow circular panning with interaural delay + head-shadow filtering and a touch of room. */
    public static AudioData eightD(AudioData in, double rateHz, Progress p) {
        int n = in.length(); AudioData o = new AudioData(n);
        float[] mono = in.mono();
        int maxItd = (int) (0.0007 * SR) + 2; float[] buf = new float[maxItd + 4]; int w = 0;
        Svf fl = new Svf(), fr = new Svf();
        for (int s = 0; s < n; s++) {
            double ang = 2 * Math.PI * rateHz * s / SR;
            double pan = Math.sin(ang); // -1 left .. 1 right
            double front = Math.cos(ang);
            buf[w] = mono[s];
            double dl = pan > 0 ? pan * maxItd : 0, dr = pan < 0 ? -pan * maxItd : 0;
            float sl = readFrac(buf, w, dl + 1), sr = readFrac(buf, w, dr + 1);
            if ((s & 31) == 0) {
                fl.set(2500 + 17000 * (1 - Math.max(0, pan)), 0.6);
                fr.set(2500 + 17000 * (1 - Math.max(0, -pan)), 0.6);
            }
            float gl = (float) Math.sqrt(0.5 * (1 - pan)), gr = (float) Math.sqrt(0.5 * (1 + pan));
            float back = (float) (0.88 + 0.12 * front);
            float stereoKeep = 0.25f;
            o.l[s] = (fl.process(sl, 0) * gl * 1.35f * back) + in.l[s] * stereoKeep * 0.4f;
            o.r[s] = (fr.process(sr, 0) * gr * 1.35f * back) + in.r[s] * stereoKeep * 0.4f;
            if (++w >= buf.length) w = 0;
            if ((s & 0xFFFF) == 0) p.set(0.6f * s / n, null);
        }
        AudioData rv = reverb(o, 0.45, 0.5, 0.18, 1.0, 12, new Progress.Sub(p, 0.6f, 1f));
        return rv;
    }

    public static AudioData width(AudioData in, double width) {
        AudioData o = new AudioData(in.length()); float w = (float) width;
        for (int i = 0; i < in.length(); i++) {
            float m = 0.5f * (in.l[i] + in.r[i]), s = 0.5f * (in.l[i] - in.r[i]) * w;
            o.l[i] = m + s; o.r[i] = m - s;
        }
        return o;
    }

    /** Haas-style stereo enhancer for mono sources (adds a short decorrelated side). */
    public static AudioData widenMono(AudioData in, double amount) {
        AudioData o = in.copy(); int d = (int) (0.013 * SR);
        Biquad hp = Biquad.highpass(300, 0.7);
        for (int i = in.length() - 1; i >= d; i--) {
            float s = hp.process(0.5f * (in.l[i - d] + in.r[i - d])) * (float) amount * 0.5f;
            o.l[i] += s; o.r[i] -= s;
        }
        return o;
    }

    // ---------------------------------------------------------------- dynamics / colour

    public static AudioData compress(AudioData in, double threshDb, double ratio, double attackMs, double releaseMs, double makeupDb) {
        int n = in.length(); AudioData o = new AudioData(n);
        double att = Math.exp(-1.0 / (attackMs * SR / 1000)), rel = Math.exp(-1.0 / (releaseMs * SR / 1000));
        double env = 0, mk = Math.pow(10, makeupDb / 20);
        for (int i = 0; i < n; i++) {
            double x = Math.max(Math.abs(in.l[i]), Math.abs(in.r[i]));
            env = x > env ? att * env + (1 - att) * x : rel * env + (1 - rel) * x;
            double db = 20 * Math.log10(env + 1e-9), over = db - threshDb;
            double g = over > 0 ? Math.pow(10, -over * (1 - 1 / ratio) / 20) : 1;
            o.l[i] = (float) (in.l[i] * g * mk); o.r[i] = (float) (in.r[i] * g * mk);
        }
        return o;
    }

    /** Look-ahead peak limiter + final ceiling. In place. */
    public static AudioData limit(AudioData a, float ceiling) {
        int n = a.length(), la = 64; double g = 1, rel = Math.exp(-1.0 / (0.08 * SR));
        float[] ol = new float[n], or = new float[n];
        for (int i = 0; i < n; i++) {
            float pk = 0;
            for (int j = i; j < Math.min(n, i + la); j += 8) { float v = Math.max(Math.abs(a.l[j]), Math.abs(a.r[j])); if (v > pk) pk = v; }
            double target = pk > ceiling ? ceiling / pk : 1;
            g = target < g ? target : rel * g + (1 - rel) * target;
            ol[i] = clip((float) (a.l[i] * g), ceiling); or[i] = clip((float) (a.r[i] * g), ceiling);
        }
        a.l = ol; a.r = or; return a;
    }

    static float clip(float x, float c) { return x > c ? c : (x < -c ? -c : x); }

    public static AudioData saturate(AudioData in, double drive) {
        AudioData o = new AudioData(in.length()); float d = (float) (1 + drive * 8), comp = (float) (1 / Math.tanh(d));
        for (int i = 0; i < in.length(); i++) { o.l[i] = (float) Math.tanh(in.l[i] * d) * comp * 0.9f; o.r[i] = (float) Math.tanh(in.r[i] * d) * comp * 0.9f; }
        return o;
    }

    /** Lo-fi: tape wow/flutter, low-pass, slight bit reduction, vinyl crackle. */
    public static AudioData lofi(AudioData in, double amount, long seed) {
        int n = in.length(); AudioData o = new AudioData(n);
        int maxD = (int) (0.012 * SR); float[] bl = new float[maxD + 4], br = new float[maxD + 4]; int w = 0;
        Random rnd = new Random(seed);
        double steps = Math.pow(2, 16 - amount * 7);
        for (int s = 0; s < n; s++) {
            bl[w] = in.l[s]; br[w] = in.r[s];
            double d = 0.004 * SR + amount * (0.0025 * SR * Math.sin(2 * Math.PI * 0.55 * s / SR) + 0.0006 * SR * Math.sin(2 * Math.PI * 6.3 * s / SR));
            float l = readFrac(bl, w, d), r = readFrac(br, w, d);
            l = (float) (Math.round(l * steps) / steps); r = (float) (Math.round(r * steps) / steps);
            float crackle = 0;
            if (rnd.nextFloat() < 0.0004 * amount) crackle = (rnd.nextFloat() - 0.5f) * 0.35f * (float) amount;
            float hiss = (rnd.nextFloat() - 0.5f) * 0.006f * (float) amount;
            o.l[s] = l + crackle + hiss; o.r[s] = r + crackle + hiss;
            if (++w >= bl.length) w = 0;
        }
        filter(o, Biquad.lowpass(16000 - amount * 11000, 0.6));
        filter(o, Biquad.highpass(40 + amount * 80, 0.7));
        return o;
    }

    public static AudioData telephone(AudioData in) {
        AudioData o = in.copy();
        filter(o, Biquad.highpass(450, 0.9)); filter(o, Biquad.highpass(450, 0.9));
        filter(o, Biquad.lowpass(3200, 0.9)); filter(o, Biquad.lowpass(3200, 0.9));
        filter(o, Biquad.peak(1500, 1, 6));
        AudioData s = saturate(o, 0.5);
        float[] m = s.mono(); return new AudioData(m, m.clone());
    }

    public static AudioData underwater(AudioData in) {
        AudioData o = in.copy();
        filter(o, Biquad.lowpass(600, 1.2)); filter(o, Biquad.lowpass(900, 0.7));
        o = chorus(o, 6, 0.3, 0.6);
        return reverb(o, 0.6, 0.8, 0.35, 1, 0, Progress.NONE);
    }

    public static AudioData radio(AudioData in) {
        AudioData o = in.copy();
        filter(o, Biquad.highpass(250, 0.8)); filter(o, Biquad.lowpass(5000, 0.8)); filter(o, Biquad.peak(2000, 0.7, 4));
        o = saturate(o, 0.35);
        return lofi(o, 0.25, 7);
    }

    // ---------------------------------------------------------------- editing

    public static void fadeIn(AudioData a, int len) {
        len = Math.min(len, a.length());
        for (int i = 0; i < len; i++) { float g = (float) Math.sin(0.5 * Math.PI * i / len); g *= g; a.l[i] *= g; a.r[i] *= g; }
    }

    public static void fadeOut(AudioData a, int len) {
        int n = a.length(); len = Math.min(len, n);
        for (int i = 0; i < len; i++) { float g = (float) Math.sin(0.5 * Math.PI * i / len); g *= g; a.l[n - 1 - i] *= g; a.r[n - 1 - i] *= g; }
    }

    public static AudioData reverse(AudioData in) {
        int n = in.length(); AudioData o = new AudioData(n);
        for (int i = 0; i < n; i++) { o.l[i] = in.l[n - 1 - i]; o.r[i] = in.r[n - 1 - i]; }
        return o;
    }

    public static AudioData toMono(AudioData in) { float[] m = in.mono(); return new AudioData(m, m.clone()); }

    public static AudioData trimSilence(AudioData in, float thrDb) {
        float thr = (float) Math.pow(10, thrDb / 20); int n = in.length(), a = 0, b = n;
        while (a < n && Math.abs(in.l[a]) < thr && Math.abs(in.r[a]) < thr) a++;
        while (b > a && Math.abs(in.l[b - 1]) < thr && Math.abs(in.r[b - 1]) < thr) b--;
        a = Math.max(0, a - SR / 50); b = Math.min(n, b + SR / 10);
        AudioData o = in.slice(a, b); fadeIn(o, SR / 200); fadeOut(o, SR / 50);
        return o;
    }

    /** Joins two clips with an equal-power crossfade of `xf` samples. */
    public static AudioData crossfadeJoin(AudioData a, AudioData b, int xf) {
        xf = Math.min(xf, Math.min(a.length(), b.length()));
        AudioData o = new AudioData(a.length() + b.length() - xf);
        System.arraycopy(a.l, 0, o.l, 0, a.length()); System.arraycopy(a.r, 0, o.r, 0, a.length());
        int off = a.length() - xf;
        for (int i = 0; i < xf; i++) {
            double t = (i + 0.5) / xf; float ga = (float) Math.cos(t * Math.PI / 2), gb = (float) Math.sin(t * Math.PI / 2);
            o.l[off + i] = a.l[off + i] * ga + b.l[i] * gb; o.r[off + i] = a.r[off + i] * ga + b.r[i] * gb;
        }
        System.arraycopy(b.l, xf, o.l, a.length(), b.length() - xf); System.arraycopy(b.r, xf, o.r, a.length(), b.length() - xf);
        return o;
    }

    /** Final polish used after most effects: remove DC/sub rumble, limit to -0.8 dBFS. */
    public static AudioData master(AudioData a) {
        AudioData o = a.copy();
        filter(o, Biquad.highpass(22, 0.7));
        float pk = o.peak();
        if (pk > 0 && pk < 0.5f) o.gain(0.7f / pk);
        return limit(o, 0.912f);
    }
}
