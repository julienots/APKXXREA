package com.superessence.musicmetric.audio;

/** Stereo float PCM buffer at 44.1 kHz — the single audio format used across the app. */
public final class AudioData {
    public static final int SR = 44100;
    public float[] l, r;

    public AudioData(int n) { l = new float[Math.max(0, n)]; r = new float[Math.max(0, n)]; }
    public AudioData(float[] l, float[] r) { this.l = l; this.r = r; }

    public int length() { return l.length; }
    public double seconds() { return l.length / (double) SR; }
    public long bytes() { return (long) l.length * 8L; }

    public AudioData copy() { return new AudioData(l.clone(), r.clone()); }

    public AudioData slice(int a, int b) {
        a = clamp(a, 0, length()); b = clamp(b, a, length());
        AudioData o = new AudioData(b - a);
        System.arraycopy(l, a, o.l, 0, b - a);
        System.arraycopy(r, a, o.r, 0, b - a);
        return o;
    }

    public boolean isMono() {
        int n = length(); if (n == 0) return true;
        int step = Math.max(1, n / 20000); double diff = 0, sum = 0;
        for (int i = 0; i < n; i += step) { diff += Math.abs(l[i] - r[i]); sum += Math.abs(l[i]) + Math.abs(r[i]); }
        return sum == 0 || diff / sum < 0.002;
    }

    public float peak() {
        float p = 0; for (int i = 0; i < l.length; i++) { float a = Math.abs(l[i]); if (a > p) p = a; a = Math.abs(r[i]); if (a > p) p = a; }
        return p;
    }

    public double rmsDb() {
        int n = length(); if (n == 0) return -96;
        int step = Math.max(1, n / 200000); double s = 0; int c = 0;
        for (int i = 0; i < n; i += step) { s += l[i] * l[i] + r[i] * r[i]; c += 2; }
        double rms = Math.sqrt(s / Math.max(1, c));
        return rms <= 1e-9 ? -96 : 20 * Math.log10(rms);
    }

    public void gain(float g) { for (int i = 0; i < l.length; i++) { l[i] *= g; r[i] *= g; } }

    public void normalize(float target) {
        float p = peak(); if (p < 1e-6f) return; gain(target / p);
    }

    /** Mixes src into this buffer at offset (samples), growing nothing: out-of-range samples are dropped. */
    public void mix(AudioData src, int offset, float g) {
        int n = src.length();
        for (int i = 0; i < n; i++) {
            int j = i + offset; if (j < 0) continue; if (j >= l.length) break;
            l[j] += src.l[i] * g; r[j] += src.r[i] * g;
        }
    }

    public static AudioData concat(AudioData a, AudioData b) {
        AudioData o = new AudioData(a.length() + b.length());
        System.arraycopy(a.l, 0, o.l, 0, a.length()); System.arraycopy(a.r, 0, o.r, 0, a.length());
        System.arraycopy(b.l, 0, o.l, a.length(), b.length()); System.arraycopy(b.r, 0, o.r, a.length(), b.length());
        return o;
    }

    public AudioData padTo(int n) {
        if (n <= length()) return this;
        AudioData o = new AudioData(n);
        System.arraycopy(l, 0, o.l, 0, length()); System.arraycopy(r, 0, o.r, 0, length());
        return o;
    }

    public float[] mono() {
        float[] m = new float[length()];
        for (int i = 0; i < m.length; i++) m[i] = 0.5f * (l[i] + r[i]);
        return m;
    }

    static int clamp(int v, int a, int b) { return v < a ? a : (v > b ? b : v); }
}
