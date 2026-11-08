package com.superessence.musicmetric.audio;

/** In-place iterative radix-2 complex FFT with cached twiddles. */
public final class Fft {
    final int n, logN; final float[] cos, sin; final int[] rev;
    public final float[] window;

    public Fft(int n) {
        this.n = n; int lg = 0; while ((1 << lg) < n) lg++; logN = lg;
        cos = new float[n / 2]; sin = new float[n / 2];
        for (int i = 0; i < n / 2; i++) { cos[i] = (float) Math.cos(-2 * Math.PI * i / n); sin[i] = (float) Math.sin(-2 * Math.PI * i / n); }
        rev = new int[n];
        for (int i = 0; i < n; i++) { int r = 0, x = i; for (int b = 0; b < logN; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
        window = new float[n];
        for (int i = 0; i < n; i++) window[i] = (float) (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
    }

    public int size() { return n; }

    public void forward(float[] re, float[] im) { transform(re, im, false); }

    public void inverse(float[] re, float[] im) {
        transform(re, im, true);
        float s = 1f / n; for (int i = 0; i < n; i++) { re[i] *= s; im[i] *= s; }
    }

    void transform(float[] re, float[] im, boolean inv) {
        for (int i = 0; i < n; i++) { int j = rev[i]; if (j > i) { float t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
        for (int size = 2; size <= n; size <<= 1) {
            int half = size >> 1, step = n / size;
            for (int i = 0; i < n; i += size) {
                for (int j = 0, k = 0; j < half; j++, k += step) {
                    float wr = cos[k], wi = inv ? -sin[k] : sin[k];
                    int a = i + j, b = a + half;
                    float tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
                }
            }
        }
    }
}
