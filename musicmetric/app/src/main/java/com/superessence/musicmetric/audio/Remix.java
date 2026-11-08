package com.superessence.musicmetric.audio;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/** Beat-aware restructuring: extend, recompose, add layers, mash-ups. */
public final class Remix {
    private Remix() { }
    static final int SR = AudioData.SR;

    static int[] beatGrid(AudioData a, Analysis.Result r) {
        double bs = r.beatSamples(); List<Integer> b = new ArrayList<Integer>();
        double start = r.beatOffset; while (start - bs >= 0) start -= bs;
        for (double t = start; t < a.length(); t += bs) b.add((int) Math.round(t));
        int[] out = new int[b.size()]; for (int i = 0; i < out.length; i++) out[i] = b.get(i); return out;
    }

    /** 12-band log-energy + chroma fingerprint for each beat. */
    static float[][] beatFeatures(AudioData a, int[] beats) {
        float[] mono = a.mono(); int N = 2048; Fft fft = new Fft(N); float[] re = new float[N], im = new float[N];
        float[][] f = new float[beats.length][24]; double binHz = SR / (double) N;
        for (int b = 0; b < beats.length; b++) {
            int s = beats[b]; if (s + N >= mono.length) break;
            for (int i = 0; i < N; i++) { re[i] = mono[s + i] * fft.window[i]; im[i] = 0; }
            fft.forward(re, im);
            for (int k = 1; k < N / 2; k++) {
                double hz = k * binHz, m = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
                int band = (int) Math.min(11, Math.max(0, Math.log(hz / 40) / Math.log(2) * 1.3));
                f[b][band] += m;
                if (hz > 60 && hz < 2000) { int pc = (((int) Math.round(69 + 12 * Math.log(hz / 440) / Math.log(2))) % 12 + 12) % 12; f[b][12 + pc] += m; }
            }
            for (int k = 0; k < 12; k++) f[b][k] = (float) Math.log(1 + f[b][k]);
            double cs = 0; for (int k = 12; k < 24; k++) cs += f[b][k]; if (cs > 0) for (int k = 12; k < 24; k++) f[b][k] = (float) (f[b][k] / cs * 6);
        }
        return f;
    }

    static double sim(float[][] f, int i, int j, int ctx) {
        double s = 0, na = 0, nb = 0;
        for (int c = 0; c < ctx; c++) {
            if (i + c >= f.length || j + c >= f.length) break;
            float[] a = f[i + c], b = f[j + c];
            for (int k = 0; k < a.length; k++) { s += a[k] * b[k]; na += a[k] * a[k]; nb += b[k] * b[k]; }
        }
        return s / Math.sqrt(na * nb + 1e-12);
    }

    static final class Loop implements Comparable<Loop> {
        int s, e; double score;
        Loop(int s, int e, double score) { this.s = s; this.e = e; this.score = score; }
        public int compareTo(Loop o) { return Double.compare(o.score, score); }
    }

    /**
     * Extends a track to at least `targetSec` by repeating the most seamless phrase (multiple of 4 bars),
     * cut on beats with short equal-power crossfades so the seam is inaudible.
     */
    public static AudioData extend(AudioData a, Analysis.Result r, double targetSec, int variant, Progress p) {
        p.set(0.05f, "Repérage des mesures…");
        int[] beats = beatGrid(a, r);
        if (beats.length < 40) { // too short / no clear beat: plain loop with crossfade
            AudioData o = a;
            while (o.seconds() < targetSec) o = Dsp.crossfadeJoin(o, a, SR / 2);
            return o;
        }
        float[][] f = beatFeatures(a, beats);
        p.set(0.4f, "Recherche de la boucle parfaite…");
        List<Loop> loops = new ArrayList<Loop>();
        int lo = (int) (beats.length * 0.12), hi = (int) (beats.length * 0.92);
        for (int len = 16; len <= 64; len += 16) {
            for (int s = lo; s + len < hi; s += 1) {
                int e = s + len;
                double sc = sim(f, s, e, 4) + 0.5 * sim(f, s - 2 >= 0 ? s - 2 : s, e - 2, 2);
                sc += len == 32 ? 0.02 : 0; // prefer 8-bar phrases
                loops.add(new Loop(s, e, sc));
            }
        }
        if (loops.isEmpty()) return a.copy();
        Collections.sort(loops);
        List<Loop> picks = new ArrayList<Loop>();
        for (Loop c : loops) {
            boolean distinct = true;
            for (Loop q : picks) if (Math.abs(q.s - c.s) < 8 && Math.abs(q.e - c.e) < 8) { distinct = false; break; }
            if (distinct) picks.add(c);
            if (picks.size() > variant) break;
        }
        Loop L = picks.get(Math.min(variant, picks.size() - 1));
        int sS = beats[L.s], eS = beats[L.e];
        int xf = SR / 40;
        p.set(0.7f, "Montage…");
        AudioData head = a.slice(0, eS + xf), seg = a.slice(sS, eS + xf), tail = a.slice(eS, a.length());
        AudioData out = head; int k = 0;
        double need = targetSec - a.seconds();
        while (need > 0.5 && k < 60) {
            out = Dsp.crossfadeJoin(out, seg, xf);
            need -= (seg.length() - xf) / (double) SR; k++;
        }
        out = Dsp.crossfadeJoin(out, tail, xf);
        p.set(1, null);
        return out;
    }

    public static final String[] RECOMPOSE = {"Remix auto", "Réarranger", "Glitch", "Beat swap", "Chopped & Screwed"};

    public static AudioData recompose(AudioData a, Analysis.Result r, int mode, long seed, Progress p) {
        int[] beats = beatGrid(a, r); Random rnd = new Random(seed);
        if (beats.length < 16) return a.copy();
        int bs = (int) r.beatSamples();
        List<AudioData> parts = new ArrayList<AudioData>();
        int xf = SR / 200;
        AudioData intro = a.slice(0, beats[0]);
        parts.add(intro);
        int bars = (beats.length - 1) / 4;
        if (mode == 1) { // rearrange 4-bar phrases
            int phr = 16; List<Integer> order = new ArrayList<Integer>();
            int nPh = (beats.length - 1) / phr;
            for (int i = 1; i < nPh - 1; i++) order.add(i);
            Collections.shuffle(order, rnd);
            order.add(0, 0); if (nPh > 1) order.add(nPh - 1);
            for (int ph : order) parts.add(a.slice(beats[ph * phr], beats[Math.min(beats.length - 1, (ph + 1) * phr)]));
            parts.add(a.slice(beats[Math.min(beats.length - 1, nPh * phr)], a.length()));
        } else {
            for (int b = 0; b < bars; b++) {
                int i0 = b * 4; if (i0 + 4 >= beats.length) break;
                AudioData[] bt = new AudioData[4];
                for (int k = 0; k < 4; k++) bt[k] = a.slice(beats[i0 + k], beats[i0 + k + 1]);
                boolean keep = b < 4 || b >= bars - 2;
                if (mode == 3) { AudioData t = bt[1]; bt[1] = bt[3]; bt[3] = t; } // beat swap 2 ↔ 4
                else if (mode == 4) { // chopped & screwed: repeat beats now and then
                    if (!keep && rnd.nextInt(3) == 0) bt[3] = bt[2];
                    if (!keep && rnd.nextInt(5) == 0) { bt[2] = bt[0]; bt[3] = bt[1]; }
                } else if (!keep) {
                    int roll = rnd.nextInt(mode == 2 ? 4 : 8);
                    if (roll == 0) bt[3] = stutter(bt[3], 4);
                    else if (roll == 1) bt[3] = Dsp.reverse(bt[3]);
                    else if (roll == 2) { bt[2] = bt[0]; bt[3] = stutter(bt[1], 2); }
                    else if (roll == 3) bt[3] = stutter(bt[3], 8);
                    else if (roll == 4 && b % 4 == 3) { for (int k = 0; k < 4; k++) bt[k] = filtered(bt[k], 700 + 1500 * k); }
                }
                for (int k = 0; k < 4; k++) parts.add(bt[k]);
                if ((b & 7) == 0) p.set(b / (float) bars, null);
            }
            int last = Math.min(beats.length - 1, bars * 4);
            parts.add(a.slice(beats[last], a.length()));
        }
        AudioData out = parts.get(0);
        for (int i = 1; i < parts.size(); i++) { AudioData pc = parts.get(i); if (pc.length() > 0) out = joinTight(out, pc, xf); }
        if (mode == 4) out = Dsp.speed(out, 0.82, Progress.NONE);
        p.set(1, null);
        return out;
    }

    static AudioData joinTight(AudioData a, AudioData b, int xf) {
        AudioData o = AudioData.concat(a, b);
        int j = a.length(); int n = Math.min(xf, Math.min(a.length(), b.length()));
        for (int i = 0; i < n; i++) { // micro-fade around the cut to avoid clicks
            float g = i / (float) n;
            o.l[j - n + i] *= 1 - g * 0.5f; o.r[j - n + i] *= 1 - g * 0.5f;
            o.l[j + i] *= 0.5f + 0.5f * g; o.r[j + i] *= 0.5f + 0.5f * g;
        }
        return o;
    }

    static AudioData stutter(AudioData beat, int div) {
        int seg = beat.length() / div; if (seg < 64) return beat;
        AudioData o = new AudioData(beat.length()); AudioData s = beat.slice(0, seg); Dsp.fadeOut(s, Math.min(200, seg / 4));
        for (int k = 0; k < div; k++) o.mix(s, k * seg, 0.7f + 0.3f * k / div);
        return o;
    }

    static AudioData filtered(AudioData a, double fc) { AudioData o = a.copy(); Dsp.filter(o, Biquad.lowpass(fc, 0.9)); return o; }

    // ------------------------------------------------------------------ layers

    public static final String[] LAYERS = {"Batterie", "808 / Basse", "Nappe", "Hi-hats rapides", "Claps", "Riser + Impact", "Vinyle", "Pluie"};

    public static AudioData addLayers(AudioData a, Analysis.Result r, boolean[] layers, int drumStyle, float level, long seed, Progress p) {
        int[] beats = beatGrid(a, r); Synth syn = new Synth(seed); Random rnd = new Random(seed);
        AudioData add = new AudioData(a.length()); AudioData low = new AudioData(a.length());
        double bs = r.beatSamples(); double stepS = bs / 4;
        int[] sc = Theory.scale(r.minor);
        int nBars = beats.length / 4;
        for (int b = 0; b < nBars; b++) {
            int t0 = beats[b * 4];
            if (layers[0]) for (Drums.Hit h : Drums.bar(drumStyle, 2, b % 4, rnd)) Drums.play(syn, add, h.type, t0 + (int) Math.round(h.step * stepS), h.vel * 0.85f, h.type == Drums.HAT ? 0.2f : 0);
            if (layers[1]) {
                int root = 12 * 2 + r.keyRoot; if (root < 33) root += 12;
                if (drumStyle == Drums.ST_TRAP || drumStyle == Drums.ST_DRILL || drumStyle == Drums.ST_PHONK) {
                    int last = -1; List<Integer> ks = new ArrayList<Integer>();
                    for (Drums.Hit h : Drums.bar(drumStyle, 2, b % 4, new Random(seed + b))) if (h.type == Drums.KICK) ks.add((int) Math.round(h.step));
                    for (int k = 0; k < ks.size(); k++) { int s0 = ks.get(k), s1 = k + 1 < ks.size() ? ks.get(k + 1) : 16; syn.bass808(low, t0 + (int) (s0 * stepS), (int) ((s1 - s0) * stepS) - 200, root, 0, 0.8f); last = s0; }
                } else for (int k = 0; k < 4; k++) syn.note(low, t0 + (int) (k * bs + bs / 2), (int) (bs / 2) - 300, root + 12, 0.65f, Synth.BASS, 0);
            }
            if (layers[2] && b % 2 == 0) {
                int n1 = Theory.degree(r.keyRoot, sc, 0, 3), n2 = Theory.degree(r.keyRoot, sc, 4, 3);
                syn.note(add, t0, (int) (bs * 8), n1 + 12, 0.3f, Synth.PAD, -0.3f); syn.note(add, t0, (int) (bs * 8), n2 + 12, 0.3f, Synth.PAD, 0.3f);
            }
            if (layers[3]) { for (int s = 0; s < 16; s += 2) syn.hat(add, t0 + (int) (s * stepS), 0.45f, false, 0.25f); if (b % 2 == 1) for (int s = 0; s < 6; s++) syn.hat(add, t0 + (int) ((12 + s * 4 / 6.0) * stepS), 0.35f + s * 0.06f, false, 0.25f); }
            if (layers[4]) { syn.clap(add, t0 + (int) bs, 0.75f); syn.clap(add, t0 + (int) (3 * bs), 0.75f); }
            if ((b & 7) == 0) p.set(0.8f * b / Math.max(1, nBars), null);
        }
        if (layers[5] && beats.length > 40) {
            int dropBeat = Math.min(beats.length - 1, 32); int drop = beats[dropBeat];
            int len = (int) (bs * 16); syn.riser(add, Math.max(0, drop - len), len, 0.55f); syn.impact(add, drop, 0.7f);
        }
        if (layers[6]) syn.vinyl(add, 0, a.length(), 0.6f);
        if (layers[7]) syn.rain(add, 0, a.length(), 0.8f);
        Dsp.filter(low, Biquad.lowpass(900, 0.7));
        AudioData o = a.copy();
        // duck the original slightly under new drums so it stays clean
        o.gain(layers[0] ? 0.7f : 0.85f);
        o.mix(add, 0, level * 0.6f); o.mix(low, 0, level * 0.55f);
        p.set(1, null);
        return Dsp.master(o);
    }

    /** Mixes another track on top, tempo-matched to this one (when the tempos are close enough) and beat-aligned. */
    public static AudioData mashup(AudioData base, Analysis.Result rb, AudioData other, Analysis.Result ro, float level, boolean sync, Progress p) {
        AudioData o2 = other;
        if (sync) {
            double ratio = rb.bpm / ro.bpm;
            if (ratio > 1.45) ratio /= 2; else if (ratio < 0.7) ratio *= 2;
            if (ratio > 0.75 && ratio < 1.35) o2 = Dsp.tempo(other, ratio, new Progress.Sub(p, 0, 0.8f));
            int off2 = (int) (ro.beatOffset / ratio);
            int shift = rb.beatOffset - off2;
            AudioData out = base.copy().padTo(Math.max(base.length(), o2.length() + Math.max(0, shift)));
            out.mix(o2, shift, level);
            return Dsp.master(out);
        }
        AudioData out = base.copy().padTo(Math.max(base.length(), o2.length()));
        out.mix(o2, 0, level);
        return Dsp.master(out);
    }
}
