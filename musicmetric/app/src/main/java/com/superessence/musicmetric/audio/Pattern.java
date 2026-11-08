package com.superessence.musicmetric.audio;

import java.util.List;
import java.util.Random;

/** The step-sequencer project edited in the Composer: 6 drum lanes, a melody lane, 4 chords, bass. */
public final class Pattern {
    public static final int STEPS = 16, DRUM_ROWS = 6, MELODY_ROWS = 15;
    public static final int[] DRUM_TYPES = {Drums.KICK, Drums.SNARE, Drums.CLAP, Drums.HAT, Drums.OHAT, Drums.RIM};
    public static final String[] DRUM_LABELS = {"Kick", "Snare", "Clap", "Hat", "Open", "Rim"};
    public static final String[] BASS_MODES = {"Aucune", "Basse", "808"};

    public int bpm = 120, root = 9; public boolean minor = true;
    public boolean[][] drums = new boolean[DRUM_ROWS][STEPS];
    /** melody[step] = scale degree row (0 = lowest) or -1. */
    public int[] melody = new int[STEPS];
    public int[] chords = {0, 5, 2, 6};
    public int leadInst = Synth.PLUCK, chordInst = Synth.PAD, bassMode = 2;
    public float swing = 0;

    public Pattern() { java.util.Arrays.fill(melody, -1); }

    public Pattern copy() {
        Pattern c = new Pattern(); c.bpm = bpm; c.root = root; c.minor = minor; c.leadInst = leadInst; c.chordInst = chordInst; c.bassMode = bassMode; c.swing = swing;
        for (int i = 0; i < DRUM_ROWS; i++) c.drums[i] = drums[i].clone();
        c.melody = melody.clone(); c.chords = chords.clone(); return c;
    }

    public void clear() { for (boolean[] r : drums) java.util.Arrays.fill(r, false); java.util.Arrays.fill(melody, -1); }

    public void randomize(int drumStyle, long seed) {
        Random r = new Random(seed); clear();
        List<Drums.Hit> hits = Drums.bar(drumStyle, 2, 0, r);
        for (Drums.Hit h : hits) {
            int s = (int) Math.round(h.step); if (s < 0 || s >= STEPS || h.step != Math.floor(h.step)) continue;
            for (int k = 0; k < DRUM_ROWS; k++) if (DRUM_TYPES[k] == h.type) drums[k][s] = true;
            if (h.type == Drums.TOM_L || h.type == Drums.TOM_H) drums[5][s] = true;
        }
        int[][] progs = minor ? new int[][]{{0, 5, 2, 6}, {0, 3, 5, 4}, {0, 5, 6, 0}} : new int[][]{{0, 4, 5, 3}, {0, 5, 3, 4}, {3, 4, 0, 5}};
        chords = progs[r.nextInt(progs.length)].clone();
        int deg = 7;
        for (int s = 0; s < STEPS; s++) {
            if (s % 4 == 0 || r.nextInt(3) == 0) {
                if (s % 4 == 0) { int c = chords[0] + 7; deg = c + 2 * r.nextInt(3); }
                else deg = Math.max(0, Math.min(MELODY_ROWS - 1, deg + r.nextInt(5) - 2));
                melody[s] = Math.max(0, Math.min(MELODY_ROWS - 1, deg));
            }
        }
    }

    public int stepSamples() { return (int) Math.round(60.0 / bpm / 4 * AudioData.SR); }

    /** Renders `repeats` passes of the 4-bar loop (each bar uses the next chord). */
    public AudioData render(int repeats, boolean master) {
        int stepS = stepSamples(), barS = stepS * STEPS, bars = 4 * repeats;
        int len = bars * barS + (master ? AudioData.SR * 2 : 0);
        AudioData o = new AudioData(len), music = new AudioData(len);
        Synth syn = new Synth(bpm * 1000L + root);
        int[] scale = Theory.scale(minor);
        for (int b = 0; b < bars; b++) {
            int t0 = b * barS; int cd = chords[b % 4];
            for (int k = 0; k < DRUM_ROWS; k++) for (int s = 0; s < STEPS; s++) if (drums[k][s]) {
                int at = t0 + s * stepS + (s % 2 == 1 ? (int) (swing * stepS) : 0);
                Drums.play(syn, o, DRUM_TYPES[k], at, s % 4 == 0 ? 0.95f : 0.8f, k == 3 ? 0.2f : 0);
            }
            int[] ch = Theory.chord(root, scale, cd, 4, false);
            if (chordInst >= 0) for (int n : ch) syn.note(music, t0, barS, n, 0.45f, chordInst, 0);
            int rootN = Theory.degree(root, scale, cd, 1); if (rootN < 33) rootN += 12;
            if (bassMode == 1) for (int s = 0; s < STEPS; s += 4) syn.note(o, t0 + s * stepS, stepS * 3, rootN + 12, 0.7f, Synth.BASS, 0);
            else if (bassMode == 2) {
                int last = -1;
                for (int s = 0; s <= STEPS; s++) if (s == STEPS || drums[0][s]) { if (last >= 0) syn.bass808(o, t0 + last * stepS, (s - last) * stepS - 150, rootN, 0, 0.8f); last = s; }
                if (last < 0) syn.bass808(o, t0, barS - 150, rootN, 0, 0.8f);
            }
            for (int s = 0; s < STEPS; s++) if (melody[s] >= 0) {
                int len2 = 1; while (s + len2 < STEPS && melody[s + len2] < 0 && len2 < 4) len2++;
                int midi = Theory.degree(root, scale, melody[s], 4);
                syn.note(music, t0 + s * stepS, len2 * stepS - 100, midi, 0.65f, leadInst, 0.1f);
            }
        }
        if (master) {
            AudioData wet = Dsp.reverb(music, 0.6, 0.5, 0.25, 1, 15, Progress.NONE);
            AudioData mix = new AudioData(Math.max(len, wet.length()));
            mix.mix(o, 0, 0.9f); mix.mix(wet, 0, 0.85f);
            mix = Dsp.compress(mix, -14, 2.5, 8, 120, 2);
            mix.normalize(0.95f); mix.gain(1.5f); return Dsp.limit(mix, 0.92f);
        }
        o.mix(music, 0, 0.8f);
        float pk = o.peak(); if (pk > 0.95f) o.gain(0.95f / pk);
        return o;
    }
}
