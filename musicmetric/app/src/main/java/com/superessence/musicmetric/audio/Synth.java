package com.superessence.musicmetric.audio;

import java.util.Random;

/** Drum machine + subtractive / FM / physical-model instruments, all rendered offline into an AudioData. */
public final class Synth {
    static final int SR = AudioData.SR;
    final Random rnd;

    public Synth(long seed) { rnd = new Random(seed); }

    public static final int PIANO = 0, PAD = 1, PLUCK = 2, LEAD = 3, BELL = 4, BASS = 5, STRINGS = 6, BRASS = 7, EPIANO = 8, COWBELL = 9, SUB808 = 10, ARP = 11;
    public static final String[] INSTRUMENTS = {"Piano", "Nappe", "Pluck", "Lead", "Cloche", "Basse", "Cordes", "Cuivres", "Piano élec.", "Cowbell", "808", "Arpège"};

    public static double mtof(double m) { return 440.0 * Math.pow(2, (m - 69) / 12.0); }

    static void put(AudioData o, int i, float v, float pan) {
        if (i < 0 || i >= o.l.length) return;
        float gl = (float) Math.cos((pan + 1) * Math.PI / 4), gr = (float) Math.sin((pan + 1) * Math.PI / 4);
        o.l[i] += v * gl * 1.414f; o.r[i] += v * gr * 1.414f;
    }

    /** Band-limited sawtooth via polyBLEP. */
    static final class Saw {
        double ph, inc;
        Saw(double f, double phase) { inc = f / SR; ph = phase; }
        float next() {
            double t = ph; double v = 2 * t - 1;
            v -= blep(t, inc);
            ph += inc; if (ph >= 1) ph -= 1;
            return (float) v;
        }
        static double blep(double t, double dt) {
            if (t < dt) { t /= dt; return t + t - t * t - 1; }
            if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
            return 0;
        }
    }

    // ------------------------------------------------------------------ drums

    public void kick(AudioData o, int at, float g) {
        int len = (int) (0.55 * SR); double ph = 0;
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            double f = 48 + 120 * Math.exp(-t * 28) + 60 * Math.exp(-t * 180);
            ph += 2 * Math.PI * f / SR;
            double amp = Math.exp(-t * 7.5) * (t < 0.002 ? t / 0.002 : 1);
            double click = Math.exp(-t * 600) * 0.35 * (rnd.nextDouble() * 2 - 1);
            float v = (float) Math.tanh((Math.sin(ph) * amp + click) * 1.6) * g;
            put(o, at + i, v, 0);
        }
    }

    /** Tuned 808 with optional glide from another note. */
    public void bass808(AudioData o, int at, int dur, double midi, double fromMidi, float g) {
        int len = dur + (int) (0.12 * SR); double ph = 0;
        double f1 = mtof(midi), f0 = fromMidi > 0 ? mtof(fromMidi) : f1;
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            double f = fromMidi > 0 ? f1 + (f0 - f1) * Math.exp(-t * 18) : f1 * (1 + 0.6 * Math.exp(-t * 40));
            ph += 2 * Math.PI * f / SR;
            double amp = Math.exp(-t * 1.4) * Math.min(1, t / 0.003);
            if (i > dur) amp *= Math.exp(-(i - dur) / (0.03 * SR));
            double s = Math.sin(ph) + 0.18 * Math.sin(2 * ph);
            put(o, at + i, (float) Math.tanh(s * amp * 1.8) * g * 0.8f, 0);
        }
    }

    public void snare(AudioData o, int at, float g) {
        int len = (int) (0.28 * SR); Biquad hp = Biquad.highpass(1200, 0.7), bp = Biquad.peak(5000, 1, 4); double ph = 0;
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            ph += 2 * Math.PI * (185 + 60 * Math.exp(-t * 60)) / SR;
            double tone = Math.sin(ph) * Math.exp(-t * 28) * 0.55;
            double noise = bp.process(hp.process((float) (rnd.nextDouble() * 2 - 1))) * Math.exp(-t * 16) * 0.75;
            put(o, at + i, (float) ((tone + noise) * g * 0.9), 0.05f);
        }
    }

    public void clap(AudioData o, int at, float g) {
        int len = (int) (0.3 * SR); Biquad bp = Biquad.bandpass(1300, 1.4);
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR, env;
            double tb = t % 0.011; int burst = (int) (t / 0.011);
            env = burst < 3 ? Math.exp(-tb * 300) : Math.exp(-(t - 0.033) * 14);
            float v = bp.process((float) (rnd.nextDouble() * 2 - 1)) * (float) env * 2.2f * g;
            put(o, at + i, v, -0.05f);
        }
    }

    public void hat(AudioData o, int at, float g, boolean open, float pan) {
        int len = (int) ((open ? 0.38 : 0.06) * SR); Biquad hp = Biquad.highpass(7500, 0.8), hp2 = Biquad.highpass(7500, 0.8);
        double[] fr = {205.3, 304.4, 369.6, 522.7, 540.0, 800.0}; double[] ph = new double[6];
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR, metal = 0;
            for (int k = 0; k < 6; k++) { ph[k] += fr[k] * 1.7 / SR; metal += (ph[k] % 1) < 0.5 ? 1 : -1; }
            double n = metal / 6 * 0.6 + (rnd.nextDouble() * 2 - 1) * 0.6;
            double env = Math.exp(-t * (open ? 9 : 75));
            put(o, at + i, hp2.process(hp.process((float) n)) * (float) env * g * 0.55f, pan);
        }
    }

    public void tom(AudioData o, int at, float g, double freq) {
        int len = (int) (0.5 * SR); double ph = 0;
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR; ph += 2 * Math.PI * freq * (1 + 0.5 * Math.exp(-t * 20)) / SR;
            double v = Math.sin(ph) * Math.exp(-t * 6) + (rnd.nextDouble() * 2 - 1) * Math.exp(-t * 40) * 0.2;
            put(o, at + i, (float) Math.tanh(v * 1.4) * g, 0);
        }
    }

    public void rim(AudioData o, int at, float g) {
        int len = (int) (0.06 * SR); Biquad bp = Biquad.bandpass(1700, 3);
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            float v = bp.process((float) ((rnd.nextDouble() * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * 1700 * t))) * (float) Math.exp(-t * 90) * g * 1.2f;
            put(o, at + i, v, 0.25f);
        }
    }

    public void crash(AudioData o, int at, float g) {
        int len = (int) (2.2 * SR); Biquad hp = Biquad.highpass(5000, 0.6);
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            float n = hp.process((float) (rnd.nextDouble() * 2 - 1));
            double env = Math.exp(-t * 2.2) * Math.min(1, t / 0.002);
            put(o, at + i, n * (float) env * g * 0.35f, (i & 1) == 0 ? -0.4f : 0.4f);
        }
    }

    // ------------------------------------------------------------------ FX

    public void riser(AudioData o, int at, int dur, float g) {
        Svf f = new Svf(); Saw s1 = new Saw(110, 0), s2 = new Saw(111.3, 0.3);
        for (int i = 0; i < dur; i++) {
            double t = i / (double) dur;
            if ((i & 15) == 0) { f.set(200 + 9000 * t * t, 2.5); double fr = 110 * Math.pow(2, t * 2); s1.inc = fr / SR; s2.inc = fr * 1.012 / SR; }
            float x = (float) ((rnd.nextDouble() * 2 - 1) * 0.7 + (s1.next() + s2.next()) * 0.15);
            float v = f.process(x, 1) * (float) (t * t) * g * 0.8f;
            put(o, at + i, v, (float) Math.sin(t * 20) * 0.6f);
        }
    }

    public void impact(AudioData o, int at, float g) {
        int len = (int) (2.5 * SR); double ph = 0; Biquad lp = Biquad.lowpass(1500, 0.7);
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR; ph += 2 * Math.PI * (35 + 80 * Math.exp(-t * 8)) / SR;
            double v = Math.sin(ph) * Math.exp(-t * 1.6) + lp.process((float) (rnd.nextDouble() * 2 - 1)) * Math.exp(-t * 4) * 0.5;
            put(o, at + i, (float) Math.tanh(v * 1.5) * g * 0.8f, 0);
        }
        crash(o, at, g * 0.8f);
    }

    public void reverseCymbal(AudioData o, int end, int dur, float g) {
        Biquad hp = Biquad.highpass(4000, 0.6);
        for (int i = 0; i < dur; i++) {
            double t = i / (double) dur;
            put(o, end - dur + i, hp.process((float) (rnd.nextDouble() * 2 - 1)) * (float) Math.pow(t, 3) * g * 0.45f, 0);
        }
    }

    public void vinyl(AudioData o, int at, int dur, float g) {
        Biquad lp = Biquad.lowpass(5000, 0.5), hp = Biquad.highpass(800, 0.5);
        for (int i = 0; i < dur; i++) {
            float hiss = lp.process(hp.process((float) (rnd.nextDouble() * 2 - 1))) * 0.05f;
            float pop = rnd.nextDouble() < 0.0006 ? (float) (rnd.nextDouble() * 2 - 1) * 0.6f : 0;
            put(o, at + i, (hiss + pop) * g, 0);
        }
    }

    public void rain(AudioData o, int at, int dur, float g) {
        Biquad lpL = Biquad.lowpass(3500, 0.5), lpR = Biquad.lowpass(3500, 0.5), hp = Biquad.highpass(300, 0.5), hp2 = hp.copy();
        for (int i = 0; i < dur; i++) {
            int j = at + i; if (j < 0 || j >= o.length()) continue;
            float drop = rnd.nextDouble() < 0.004 ? (float) rnd.nextDouble() : 0;
            float nl = hp.process(lpL.process((float) (rnd.nextDouble() * 2 - 1))) * 0.12f + drop * 0.25f;
            float nr = hp2.process(lpR.process((float) (rnd.nextDouble() * 2 - 1))) * 0.12f + (rnd.nextDouble() < 0.004 ? (float) rnd.nextDouble() * 0.25f : 0);
            double fade = Math.min(1, Math.min(i, dur - i) / (double) SR);
            o.l[j] += nl * g * fade; o.r[j] += nr * g * fade;
        }
    }

    // ------------------------------------------------------------------ tonal instruments

    /** Renders one note. dur = held length in samples (release added on top). */
    public void note(AudioData o, int at, int dur, double midi, float vel, int inst, float pan) {
        double f = mtof(midi);
        switch (inst) {
            case PIANO: piano(o, at, dur, f, vel, pan); break;
            case PAD: pad(o, at, dur, f, vel, pan); break;
            case PLUCK: pluck(o, at, dur, f, vel, pan); break;
            case LEAD: lead(o, at, dur, f, vel, pan, false); break;
            case ARP: lead(o, at, dur, f, vel, pan, true); break;
            case BELL: bell(o, at, dur, f, vel, pan); break;
            case BASS: bass(o, at, dur, f, vel); break;
            case STRINGS: strings(o, at, dur, f, vel, pan); break;
            case BRASS: brass(o, at, dur, f, vel, pan); break;
            case EPIANO: epiano(o, at, dur, f, vel, pan); break;
            case COWBELL: cowbell(o, at, dur, f, vel, pan); break;
            case SUB808: bass808(o, at, dur, midi, 0, vel); break;
            default: piano(o, at, dur, f, vel, pan);
        }
    }

    void piano(AudioData o, int at, int dur, double f, float vel, float pan) {
        int rel = (int) (0.35 * SR), len = Math.min(dur + rel, 4 * SR);
        double bright = 0.6 + vel * 0.4;
        int H = 0; double[] inc = new double[8], amp = new double[8], dec = new double[8], ph = new double[8];
        for (int k = 1; k <= 8; k++) {
            double fk = f * k * (1 + 0.0004 * k * k); if (fk > 16000) break;
            inc[H] = 2 * Math.PI * fk / SR; amp[H] = Math.pow(bright, k - 1) / Math.pow(k, 1.1); dec[H] = Math.exp(-(0.9 + k * 0.7) / SR); H++;
        }
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR, v = 0;
            for (int k = 0; k < H; k++) { ph[k] += inc[k]; v += Math.sin(ph[k]) * amp[k]; amp[k] *= dec[k]; }
            double env = Math.min(1, t / 0.002); if (i > dur) env *= Math.exp(-(i - dur) / (0.08 * SR));
            v += (rnd.nextDouble() * 2 - 1) * Math.exp(-t * 200) * 0.05;
            put(o, at + i, (float) (v * env * vel * 0.32), pan);
        }
    }

    void epiano(AudioData o, int at, int dur, double f, float vel, float pan) {
        int rel = (int) (0.4 * SR), len = Math.min(dur + rel, 4 * SR); double pc = 0, pm = 0;
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            pm += 2 * Math.PI * f * 14 / SR; pc += 2 * Math.PI * f / SR;
            double idx = 1.4 * Math.exp(-t * 9) * vel;
            double trem = 1 + 0.12 * Math.sin(2 * Math.PI * 4.5 * t);
            double v = Math.sin(pc + idx * Math.sin(pm)) * Math.exp(-t * 1.3) + 0.25 * Math.sin(2 * pc) * Math.exp(-t * 3);
            double env = Math.min(1, t / 0.003); if (i > dur) env *= Math.exp(-(i - dur) / (0.1 * SR));
            put(o, at + i, (float) (v * env * vel * trem * 0.3), pan + (float) (0.25 * Math.sin(2 * Math.PI * 4.5 * t)));
        }
    }

    void pad(AudioData o, int at, int dur, double f, float vel, float pan) {
        int rel = (int) (1.2 * SR), len = dur + rel; Saw[] s = new Saw[4]; double[] det = {-0.11, -0.04, 0.05, 0.12};
        for (int k = 0; k < 4; k++) s[k] = new Saw(f * Math.pow(2, det[k] / 12), rnd.nextDouble());
        Svf fl = new Svf(), fr = new Svf(); double atk = 0.5 * SR;
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            if ((i & 31) == 0) { double c = 900 + 700 * Math.sin(2 * Math.PI * 0.15 * t); fl.set(c, 0.8); fr.set(c * 1.1, 0.8); }
            float a = s[0].next() + s[2].next(), b = s[1].next() + s[3].next();
            double env = Math.min(1, i / atk); if (i > dur) env *= Math.exp(-(i - dur) / (0.35 * SR));
            float vl = fl.process(a, 0) * (float) env * vel * 0.12f, vr = fr.process(b, 0) * (float) env * vel * 0.12f;
            int j = at + i; if (j < 0 || j >= o.length()) continue;
            o.l[j] += vl * (1 - pan * 0.5f); o.r[j] += vr * (1 + pan * 0.5f);
        }
    }

    void strings(AudioData o, int at, int dur, double f, float vel, float pan) {
        int rel = (int) (0.6 * SR), len = dur + rel; Saw[] s = new Saw[3]; double[] det = {-0.07, 0, 0.08};
        for (int k = 0; k < 3; k++) s[k] = new Saw(f * Math.pow(2, det[k] / 12), rnd.nextDouble());
        Svf flt = new Svf(); flt.set(2800, 0.6); double atk = 0.22 * SR;
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            if ((i & 63) == 0) { double vib = Math.pow(2, 0.08 / 12 * Math.sin(2 * Math.PI * 5.2 * t) * Math.min(1, t / 0.4)); for (int k = 0; k < 3; k++) s[k].inc = f * vib * Math.pow(2, det[k] / 12) / SR; }
            float x = (s[0].next() + s[1].next() + s[2].next()) / 3f;
            double env = Math.min(1, i / atk); if (i > dur) env *= Math.exp(-(i - dur) / (0.2 * SR));
            put(o, at + i, flt.process(x, 0) * (float) env * vel * 0.3f, pan);
        }
    }

    void brass(AudioData o, int at, int dur, double f, float vel, float pan) {
        int rel = (int) (0.25 * SR), len = dur + rel; Saw a = new Saw(f, 0), b = new Saw(f * 1.003, 0.5);
        Svf flt = new Svf();
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            if ((i & 15) == 0) flt.set(400 + 3200 * vel * Math.min(1, t / 0.08) * (0.7 + 0.3 * Math.exp(-t * 3)), 1.1);
            double env = Math.min(1, t / 0.04); if (i > dur) env *= Math.exp(-(i - dur) / (0.07 * SR));
            put(o, at + i, (float) Math.tanh(flt.process((a.next() + b.next()) * 0.5f, 0) * 1.6) * (float) env * vel * 0.3f, pan);
        }
    }

    void lead(AudioData o, int at, int dur, double f, float vel, float pan, boolean shortArp) {
        int rel = (int) ((shortArp ? 0.12 : 0.25) * SR), len = dur + rel;
        Saw a = new Saw(f, 0), b = new Saw(f * 1.006, 0.33), c = new Saw(f * 0.994, 0.66), sub = new Saw(f / 2, 0.1);
        Svf flt = new Svf();
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            if ((i & 15) == 0) {
                double vib = t > 0.25 ? Math.pow(2, 0.18 / 12 * Math.sin(2 * Math.PI * 5.5 * t)) : 1;
                a.inc = f * vib / SR; b.inc = f * 1.006 * vib / SR; c.inc = f * 0.994 * vib / SR;
                flt.set(900 + 5500 * vel * Math.exp(-t * (shortArp ? 14 : 4)) + 600, 1.3);
            }
            float x = (a.next() + b.next() + c.next()) / 3f + sub.next() * 0.25f;
            double env = Math.min(1, t / 0.005); if (shortArp) env *= Math.exp(-t * 6);
            if (i > dur) env *= Math.exp(-(i - dur) / (0.05 * SR));
            put(o, at + i, flt.process(x, 0) * (float) env * vel * 0.28f, pan);
        }
    }

    void pluck(AudioData o, int at, int dur, double f, float vel, float pan) {
        int period = Math.max(2, (int) Math.round(SR / f)); float[] buf = new float[period];
        for (int i = 0; i < period; i++) buf[i] = (float) (rnd.nextDouble() * 2 - 1);
        int len = Math.min(dur + (int) (0.5 * SR), 3 * SR); int idx = 0; float last = 0; float decay = 0.996f;
        Biquad hp = Biquad.highpass(80, 0.7);
        for (int i = 0; i < len; i++) {
            float y = buf[idx]; int nx = (idx + 1) % period;
            float avg = 0.5f * (buf[idx] + buf[nx]) * decay;
            buf[idx] = avg; idx = nx;
            double env = i > dur ? Math.exp(-(i - dur) / (0.06 * SR)) : 1;
            put(o, at + i, hp.process(y) * (float) env * vel * 0.4f, pan);
            last = y;
        }
    }

    void bell(AudioData o, int at, int dur, double f, float vel, float pan) {
        int len = Math.min(dur + (int) (1.5 * SR), 4 * SR); double pc = 0, pm = 0;
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            pm += 2 * Math.PI * f * 3.5 / SR; pc += 2 * Math.PI * f / SR;
            double v = Math.sin(pc + 2.5 * Math.exp(-t * 3) * Math.sin(pm)) * Math.exp(-t * 2.2);
            double env = Math.min(1, t / 0.002);
            put(o, at + i, (float) (v * env * vel * 0.25), pan);
        }
    }

    void bass(AudioData o, int at, int dur, double f, float vel) {
        int len = dur + (int) (0.06 * SR); Saw s = new Saw(f, 0); double ph = 0; Svf flt = new Svf();
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            if ((i & 15) == 0) flt.set(250 + 900 * Math.exp(-t * 10) * vel, 1.2);
            ph += 2 * Math.PI * f / SR;
            double env = Math.min(1, t / 0.004); if (i > dur) env *= Math.exp(-(i - dur) / (0.015 * SR));
            float v = (float) (flt.process(s.next(), 0) * 0.6 + Math.sin(ph) * 0.7);
            put(o, at + i, (float) Math.tanh(v * 1.3) * (float) env * vel * 0.45f, 0);
        }
    }

    void cowbell(AudioData o, int at, int dur, double f, float vel, float pan) {
        int len = (int) (0.45 * SR); double p1 = 0, p2 = 0; Biquad bp = Biquad.bandpass(f * 2.2, 1.2);
        for (int i = 0; i < len; i++) {
            double t = i / (double) SR;
            p1 += f * 1.0 / SR; p2 += f * 1.48 / SR;
            float sq = ((p1 % 1) < 0.5 ? 1 : -1) + ((p2 % 1) < 0.5 ? 1 : -1);
            double env = Math.exp(-t * 9) * 0.8 + Math.exp(-t * 40) * 0.4;
            put(o, at + i, (bp.process(sq * 0.5f) + sq * 0.08f) * (float) env * vel * 0.45f, pan);
        }
    }
}
