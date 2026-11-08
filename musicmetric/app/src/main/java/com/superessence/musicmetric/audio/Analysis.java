package com.superessence.musicmetric.audio;

/** Tempo, beat grid and key detection. */
public final class Analysis {
    private Analysis() { }

    public static final String[] NOTES = {"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"};
    public static final String[] NOTES_FR = {"Do", "Do#", "Ré", "Ré#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"};

    public static final class Result {
        public double bpm; public int beatOffset; // first beat (samples)
        public int keyRoot; public boolean minor; public double keyConfidence;
        public double beatSamples() { return 60.0 * AudioData.SR / bpm; }
        public String keyName() { return NOTES_FR[keyRoot] + (minor ? " mineur" : " majeur"); }
        public String keyShort() { return NOTES[keyRoot] + (minor ? "m" : ""); }
    }

    public static Result analyze(AudioData a, Progress p) {
        Result r = new Result();
        float[] mono = a.mono();
        p.set(0.05f, "Analyse du tempo…");
        tempo(mono, r);
        p.set(0.6f, "Détection de la tonalité…");
        key(mono, r);
        p.set(1, null);
        return r;
    }

    static final int HOP = 512, FN = 1024;

    /** Spectral-flux onset envelope (one value per HOP samples). */
    public static float[] onsetEnvelope(float[] x, int maxSamples) {
        int n = Math.min(x.length, maxSamples);
        int frames = Math.max(1, (n - FN) / HOP);
        Fft fft = new Fft(FN); float[] re = new float[FN], im = new float[FN], prev = new float[FN / 2], env = new float[frames];
        for (int f = 0; f < frames; f++) {
            int o = f * HOP;
            for (int i = 0; i < FN; i++) { re[i] = x[o + i] * fft.window[i]; im[i] = 0; }
            fft.forward(re, im);
            float flux = 0;
            for (int b = 1; b < FN / 2; b++) {
                float m = (float) Math.log(1 + 100 * Math.sqrt(re[b] * re[b] + im[b] * im[b]));
                float d = m - prev[b]; if (d > 0) flux += d; prev[b] = m;
            }
            env[f] = flux;
        }
        // remove slow trend
        int w = 16; float[] out = new float[frames]; double acc = 0;
        for (int i = 0; i < frames; i++) {
            acc += env[i]; if (i >= w) acc -= env[i - w];
            float mean = (float) (acc / Math.min(i + 1, w));
            out[i] = Math.max(0, env[i] - mean);
        }
        return out;
    }

    static void tempo(float[] mono, Result r) {
        float[] env = onsetEnvelope(mono, AudioData.SR * 150);
        double fps = AudioData.SR / (double) HOP;
        double[] ac = new double[(int) (fps * 60 / 78) * 4 + 8];
        for (int lag = 1; lag < ac.length && lag < env.length; lag++) {
            double s = 0; for (int i = lag; i < env.length; i++) s += env[i] * env[i - lag];
            ac[lag] = s / (env.length - lag);
        }
        // candidate beat periods between 78 and 160 BPM; each is scored with its metrical neighbours
        // (half beat, 2 and 4 beats) so that triplet (2/3, 4/3) confusions lose against the true pulse
        int lo = (int) Math.floor(fps * 60 / 160), hi = (int) Math.ceil(fps * 60 / 78);
        double best = -1; int bestLag = (int) (fps * 60 / 120);
        for (int lag = lo; lag <= hi; lag++) {
            double bpm = 60 * fps / lag;
            double s = acAt(ac, lag) + 1.0 * acAt(ac, lag / 2.0) + 0.5 * acAt(ac, lag / 4.0) + 0.5 * acAt(ac, 2.0 * lag) + 0.25 * acAt(ac, 4.0 * lag);
            s *= Math.exp(-0.5 * Math.pow(Math.log(bpm / 112.0) / Math.log(2) / 1.4, 2));
            if (s > best) { best = s; bestLag = lag; }
        }
        double lag = bestLag;
        if (bestLag > 1 && bestLag + 1 < ac.length) { // parabolic refinement
            double a = ac[bestLag - 1], b = ac[bestLag], c = ac[bestLag + 1], den = a - 2 * b + c;
            if (Math.abs(den) > 1e-12) lag = bestLag + 0.5 * (a - c) / den;
        }
        double bpm = 60 * fps / lag;
        bpm = Math.round(bpm * 2) / 2.0;
        if (bpm <= 0 || Double.isNaN(bpm)) bpm = 120;
        r.bpm = bpm;
        // beat phase
        double period = 60 * fps / bpm; double bestS = -1; int bestO = 0;
        for (int o = 0; o < (int) period; o++) {
            double s = 0; for (double t = o; t < env.length; t += period) s += env[(int) t];
            if (s > bestS) { bestS = s; bestO = o; }
        }
        r.beatOffset = bestO * HOP + FN / 4;
    }

    static double acAt(double[] ac, double lag) {
        int i = (int) lag; double f = lag - i;
        if (i + 1 >= ac.length || i < 1) return 0;
        return Math.max(ac[i] * (1 - f) + ac[i + 1] * f, Math.max(ac[i], f > 0 ? ac[i + 1] : 0) * 0.9);
    }

    static final double[] MAJ = {6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88};
    static final double[] MIN = {6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17};

    public static double[] chroma(float[] x, int from, int to) {
        final int N = 8192; Fft fft = new Fft(N);
        float[] re = new float[N], im = new float[N]; double[] chroma = new double[12];
        int span = to - from - N; if (span <= 0) return chroma;
        int frames = Math.min(300, Math.max(1, span / (AudioData.SR / 4)));
        double binHz = AudioData.SR / (double) N;
        int lo = (int) (60 / binHz), hi = (int) (2200 / binHz);
        int[] pc = new int[hi + 1];
        for (int b = lo; b <= hi; b++) { double m = 69 + 12 * Math.log(b * binHz / 440) / Math.log(2); pc[b] = ((int) Math.round(m) % 12 + 12) % 12; }
        for (int f = 0; f < frames; f++) {
            int o = from + (int) ((long) span * f / frames);
            for (int i = 0; i < N; i++) { re[i] = x[o + i] * fft.window[i]; im[i] = 0; }
            fft.forward(re, im);
            double[] c = new double[12]; double tot = 0;
            for (int b = lo; b <= hi; b++) { double m = Math.sqrt(re[b] * re[b] + im[b] * im[b]); if (b * binHz < 260) m *= 2.2; c[pc[b]] += m; tot += m; }
            if (tot > 1e-6) for (int k = 0; k < 12; k++) chroma[k] += c[k] / tot;
        }
        return chroma;
    }

    static void key(float[] mono, Result r) {
        double[] c = chroma(mono, 0, mono.length);
        double best = -2; int root = 9; boolean minor = true; double second = -2;
        for (int k = 0; k < 12; k++) {
            for (int m = 0; m < 2; m++) {
                double[] prof = m == 0 ? MAJ : MIN;
                double cor = corr(c, prof, k);
                if (cor > best) { second = best; best = cor; root = k; minor = m == 1; } else if (cor > second) second = cor;
            }
        }
        r.keyRoot = root; r.minor = minor; r.keyConfidence = Math.max(0, Math.min(1, (best - second) * 6 + 0.4));
    }

    static double corr(double[] c, double[] prof, int shift) {
        double mc = 0, mp = 0; for (int i = 0; i < 12; i++) { mc += c[i]; mp += prof[i]; } mc /= 12; mp /= 12;
        double num = 0, dc = 0, dp = 0;
        for (int i = 0; i < 12; i++) {
            double a = c[(i + shift) % 12] - mc, b = prof[i] - mp; num += a * b; dc += a * a; dp += b * b;
        }
        return num / Math.sqrt(dc * dp + 1e-12);
    }

    public static String time(double sec) {
        int s = (int) Math.max(0, Math.round(sec)); return (s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
    }
}
