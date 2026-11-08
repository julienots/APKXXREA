package com.superessence.musicmetric.audio;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Algorithmic composer: builds a full arranged track (intro, verse, build, drop, outro) from a style and a seed. */
public final class Generator {

    public static final class Style {
        public final String name, desc; final int bpmMin, bpmMax; final boolean minor; final int[][] progs;
        final int drums, chordInst, leadInst, padInst; final boolean use808, sevenths; final float swing, reverb, pump; final boolean harmMinor;
        Style(String name, String desc, int bpmMin, int bpmMax, boolean minor, int[][] progs, int drums, int chordInst, int leadInst, int padInst,
              boolean use808, boolean sevenths, float swing, float reverb, float pump, boolean harmMinor) {
            this.name = name; this.desc = desc; this.bpmMin = bpmMin; this.bpmMax = bpmMax; this.minor = minor; this.progs = progs; this.drums = drums;
            this.chordInst = chordInst; this.leadInst = leadInst; this.padInst = padInst; this.use808 = use808; this.sevenths = sevenths;
            this.swing = swing; this.reverb = reverb; this.pump = pump; this.harmMinor = harmMinor;
        }
        public int defaultBpm() { return (bpmMin + bpmMax) / 2; }
    }

    static final int[][] P_EPIC = {{0, 5, 2, 6}, {0, 5, 3, 4}, {5, 6, 0, 0}, {0, 3, 5, 6}};
    static final int[][] P_TRAP = {{0, 5, 6, 0}, {0, 3, 5, 4}, {0, 6, 5, 6}, {0, 0, 5, 4}};
    static final int[][] P_POP = {{0, 4, 5, 3}, {0, 5, 3, 4}, {5, 3, 0, 4}, {0, 3, 4, 3}};
    static final int[][] P_LOFI = {{1, 4, 0, 5}, {3, 2, 1, 4}, {0, 5, 1, 4}, {3, 4, 2, 5}};
    static final int[][] P_SAD = {{0, 5, 2, 6}, {5, 3, 0, 4}, {0, 3, 5, 4}, {3, 0, 4, 5}};

    public static final Style[] STYLES = {
        new Style("Motivation", "Épique, puissant, énergie maximale", 120, 128, true, P_EPIC, Drums.ST_EPIC, Synth.STRINGS, Synth.BRASS, Synth.PAD, false, false, 0, 0.35f, 0.35f, false),
        new Style("Trap", "808 lourdes, hi-hats rapides", 136, 150, true, P_TRAP, Drums.ST_TRAP, Synth.PAD, Synth.BELL, Synth.PAD, true, false, 0, 0.3f, 0, false),
        new Style("Drill", "Sombre, 808 glissées, rythme cassé", 140, 145, true, P_TRAP, Drums.ST_DRILL, Synth.STRINGS, Synth.PIANO, Synth.PAD, true, false, 0, 0.3f, 0, true),
        new Style("Phonk", "Cowbell, drift, basse saturée", 125, 135, true, P_TRAP, Drums.ST_PHONK, Synth.PAD, Synth.COWBELL, Synth.PAD, true, false, 0, 0.22f, 0.2f, false),
        new Style("Lo-fi Chill", "Doux, jazzy, vinyle", 76, 88, false, P_LOFI, Drums.ST_LOFI, Synth.EPIANO, Synth.PLUCK, Synth.PAD, false, true, 0.12f, 0.3f, 0, false),
        new Style("House", "Four-on-the-floor, club", 122, 126, true, P_POP, Drums.ST_HOUSE, Synth.PIANO, Synth.PLUCK, Synth.PAD, false, true, 0, 0.28f, 0.45f, false),
        new Style("Émotion", "Piano triste, cordes, mélancolie", 70, 84, true, P_SAD, Drums.ST_SAD, Synth.PIANO, Synth.PIANO, Synth.STRINGS, true, false, 0, 0.4f, 0, false),
        new Style("Cinématique", "Bande originale, tambours épiques", 88, 100, true, P_EPIC, Drums.ST_EPIC, Synth.STRINGS, Synth.BRASS, Synth.PAD, false, false, 0, 0.5f, 0, true),
        new Style("R&B", "Romantique, smooth, piano élec.", 84, 94, false, P_LOFI, Drums.ST_RNB, Synth.EPIANO, Synth.LEAD, Synth.PAD, false, true, 0.08f, 0.3f, 0, false),
        new Style("Afro", "Afrobeats, rebond, soleil", 100, 110, false, P_POP, Drums.ST_AFRO, Synth.PLUCK, Synth.BELL, Synth.PAD, false, false, 0.06f, 0.22f, 0, false),
    };

    public static final String[] LENGTHS = {"Court", "Moyen", "Long"};

    /** Section = bars + what plays. */
    static final class Section {
        final String name; final int bars, drums; final boolean bass, chords, lead, pad, riser, impact, filterIn, leadAlt;
        Section(String n, int bars, int drums, boolean bass, boolean chords, boolean lead, boolean pad, boolean riser, boolean impact, boolean filterIn, boolean leadAlt) {
            this.name = n; this.bars = bars; this.drums = drums; this.bass = bass; this.chords = chords; this.lead = lead; this.pad = pad;
            this.riser = riser; this.impact = impact; this.filterIn = filterIn; this.leadAlt = leadAlt;
        }
    }

    static List<Section> arrangement(int length) {
        List<Section> s = new ArrayList<Section>();
        Section intro = new Section("Intro", 4, 0, false, true, false, true, false, false, true, false);
        Section verse = new Section("Couplet", 8, 1, true, true, true, false, false, false, false, false);
        Section build = new Section("Montée", 4, 1, true, true, false, true, true, false, false, false);
        Section drop = new Section("Refrain", 8, 2, true, true, true, true, false, true, false, true);
        Section brk = new Section("Pont", 4, 0, false, true, true, true, false, false, false, false);
        Section outro = new Section("Outro", 4, 1, false, true, false, true, false, false, false, false);
        if (length == 0) { s.add(intro); s.add(verse); s.add(drop); s.add(outro); }
        else if (length == 1) { s.add(intro); s.add(verse); s.add(build); s.add(drop); s.add(brk); s.add(drop); s.add(outro); }
        else { s.add(intro); s.add(verse); s.add(build); s.add(drop); s.add(brk); s.add(verse); s.add(build); s.add(drop); s.add(drop); s.add(outro); }
        return s;
    }

    public static final class Song {
        public int style, root, bpm, length; public boolean minor; public long seed; public String summary;
    }

    /** Picks key/tempo for a style (respecting overrides: root < 0 / bpm <= 0 = automatic). */
    public static Song plan(int styleIdx, long seed, int length, int root, int bpm) {
        Style st = STYLES[styleIdx]; Random r = new Random(seed);
        Song s = new Song(); s.style = styleIdx; s.seed = seed; s.length = length; s.minor = st.minor;
        s.root = root >= 0 ? root : r.nextInt(12);
        s.bpm = bpm > 0 ? bpm : st.bpmMin + r.nextInt(st.bpmMax - st.bpmMin + 1);
        return s;
    }

    static final class Note { int step, len, deg; Note(int s, int l, int d) { step = s; len = l; deg = d; } }

    /** A 2-bar motif in scale degrees (relative to root, octave 5 range). */
    static List<Note> motif(Random r, int[] prog, int density, int barOffset) {
        List<Note> m = new ArrayList<Note>();
        int[][] rhythms = density == 0 ? new int[][]{{0, 4}, {6, 2}, {8, 6}, {16, 4}, {22, 2}, {24, 8}}
                : density == 1 ? new int[][]{{0, 3}, {3, 3}, {6, 2}, {8, 4}, {12, 2}, {14, 2}, {16, 3}, {19, 3}, {22, 2}, {24, 6}}
                : new int[][]{{0, 2}, {2, 2}, {4, 1}, {6, 2}, {8, 2}, {10, 2}, {12, 2}, {14, 2}, {16, 2}, {18, 1}, {20, 2}, {22, 2}, {24, 4}, {28, 2}};
        int deg = 7 + (r.nextBoolean() ? 2 : 4); // around the 5th octave
        for (int[] rh : rhythms) {
            if (rh[0] != 0 && rh[0] != 16 && r.nextInt(6) == 0) continue; // occasional rest
            int bar = rh[0] / 16; int chordDeg = prog[(barOffset + bar) % prog.length];
            boolean strong = rh[0] % 8 == 0;
            if (strong) { // nearest chord tone
                int bestD = deg, bestDist = 99;
                for (int c = 0; c < 3; c++) for (int o = 0; o <= 2; o++) {
                    int cand = chordDeg + 2 * c + 7 * o; int dist = Math.abs(cand - deg) + (r.nextInt(3) == 0 ? 1 : 0);
                    if (cand >= 5 && cand <= 15 && dist < bestDist) { bestDist = dist; bestD = cand; }
                }
                deg = bestD;
            } else {
                int step = r.nextInt(5) - 2; if (step == 0) step = r.nextBoolean() ? 1 : -1;
                deg = Math.max(5, Math.min(15, deg + step));
            }
            m.add(new Note(rh[0], rh[1], deg));
        }
        return m;
    }

    public static AudioData render(Song song, Progress p) {
        Style st = STYLES[song.style];
        Random r = new Random(song.seed);
        Synth syn = new Synth(song.seed * 31 + 7);
        int[] scale = st.harmMinor ? Theory.HARM_MINOR : Theory.scale(song.minor);
        int[] prog = st.progs[r.nextInt(st.progs.length)];
        List<Section> arr = arrangement(song.length);
        int totalBars = 0; for (Section s : arr) totalBars += s.bars;
        double stepSec = 60.0 / song.bpm / 4; int stepS = (int) Math.round(stepSec * AudioData.SR);
        int barS = stepS * 16;
        int len = totalBars * barS + 4 * AudioData.SR;
        AudioData drums = new AudioData(len), music = new AudioData(len), bass = new AudioData(len);
        int density = song.bpm > 115 ? (st.drums == Drums.ST_HOUSE ? 1 : 0) : (song.bpm < 90 ? 1 : 0);
        if (st.leadInst == Synth.COWBELL) density = 2;
        List<Note> motifA = motif(r, prog, density, 0), motifB = motif(r, prog, Math.min(2, density + 1), 0);
        List<Integer> kicks = new ArrayList<Integer>();
        StringBuilder summary = new StringBuilder();

        int bar = 0;
        for (int si = 0; si < arr.size(); si++) {
            Section sec = arr.get(si);
            summary.append(si == 0 ? "" : " → ").append(sec.name);
            int secStart = bar * barS;
            if (sec.impact) syn.impact(drums, secStart, 0.75f);
            if (sec.riser) { syn.riser(music, secStart, sec.bars * barS, 0.5f); syn.reverseCymbal(drums, secStart + sec.bars * barS, barS, 0.9f); }
            for (int b = 0; b < sec.bars; b++, bar++) {
                int t0 = bar * barS; int chordDeg = prog[b % prog.length];
                boolean lastBarOfSection = b == sec.bars - 1;
                // drums
                if (sec.drums > 0) {
                    List<Drums.Hit> hits = Drums.bar(st.drums, sec.drums, b % 4, r);
                    if (sec.riser && b >= sec.bars - 2) { // snare roll into the drop
                        hits = new ArrayList<Drums.Hit>(); int per = b == sec.bars - 1 ? 4 : 2;
                        for (int k = 0; k < 16 * per / 4; k++) hits.add(new Drums.Hit(Drums.SNARE, k * 4.0 / per, 0.3f + 0.6f * k / (16f * per / 4)));
                        hits.add(new Drums.Hit(Drums.KICK, 0, 0.9f));
                    }
                    for (Drums.Hit h : hits) {
                        double stp = h.step; if (st.swing > 0 && ((int) Math.floor(stp)) % 2 == 1 && stp == Math.floor(stp)) stp += st.swing * 2;
                        int at = t0 + (int) Math.round(stp * stepS);
                        Drums.play(syn, drums, h.type, at, h.vel * (0.92f + 0.08f * r.nextFloat()), h.type == Drums.HAT ? 0.2f : (h.type == Drums.OHAT ? -0.2f : 0));
                        if (h.type == Drums.KICK) kicks.add(at);
                    }
                }
                // chords
                if (sec.chords) {
                    int[] ch = Theory.chord(song.root, scale, chordDeg, 4, st.sevenths);
                    int inst = sec.drums == 0 && st.chordInst == Synth.PIANO ? Synth.PIANO : st.chordInst;
                    if (st.drums == Drums.ST_HOUSE && sec.drums == 2) { // offbeat stabs
                        for (int k = 2; k < 16; k += 4) for (int n : ch) syn.note(music, t0 + k * stepS, stepS, n, 0.6f, Synth.PIANO, 0);
                    } else if (inst == Synth.PIANO || inst == Synth.EPIANO || inst == Synth.PLUCK) {
                        int[] hitsAt = st.drums == Drums.ST_AFRO ? new int[]{0, 3, 6, 10, 12} : (sec.drums == 2 ? new int[]{0, 6, 8, 14} : new int[]{0, 8});
                        for (int k = 0; k < hitsAt.length; k++) {
                            int dur = (k + 1 < hitsAt.length ? hitsAt[k + 1] : 16) - hitsAt[k];
                            for (int ni = 0; ni < ch.length; ni++) syn.note(music, t0 + hitsAt[k] * stepS + ni * (st.sevenths ? 220 : 0), dur * stepS, ch[ni], 0.5f, inst, -0.3f + 0.2f * ni);
                        }
                    } else {
                        for (int ni = 0; ni < ch.length; ni++) syn.note(music, t0, barS, ch[ni], 0.55f, inst, -0.4f + 0.4f * ni);
                    }
                }
                if (sec.pad && st.padInst != st.chordInst) {
                    int[] ch = Theory.chord(song.root, scale, chordDeg, 3, false);
                    for (int n : ch) syn.note(music, t0, barS, n + 12, 0.35f, st.padInst, 0);
                }
                // bass
                if (sec.bass) {
                    int rootN = Theory.degree(song.root, scale, chordDeg, 1);
                    if (rootN < 33) rootN += 12;
                    if (st.use808) {
                        List<Drums.Hit> hits = Drums.bar(st.drums, 2, b % 4, new Random(song.seed + bar));
                        int prevAt = -1; double prevNote = 0; List<Integer> ks = new ArrayList<Integer>();
                        for (Drums.Hit h : hits) if (h.type == Drums.KICK) ks.add((int) Math.round(h.step));
                        for (int k = 0; k < ks.size(); k++) {
                            int s0 = ks.get(k), s1 = k + 1 < ks.size() ? ks.get(k + 1) : 16;
                            double note = rootN; double glide = 0;
                            if (st.drums == Drums.ST_DRILL && k > 0 && r.nextInt(3) == 0) { glide = prevNote; note = rootN + (r.nextBoolean() ? 12 : 7); }
                            else if (k > 0 && r.nextInt(5) == 0) { glide = prevNote; note = rootN + 12; }
                            syn.bass808(bass, t0 + s0 * stepS, (s1 - s0) * stepS - 200, note, glide, 0.85f);
                            prevAt = s0; prevNote = note;
                        }
                    } else if (st.drums == Drums.ST_HOUSE || st.drums == Drums.ST_EPIC) {
                        for (int k = 2; k < 16; k += 4) syn.note(bass, t0 + k * stepS, stepS * 2 - 300, rootN + 12, 0.75f, Synth.BASS, 0);
                        if (sec.drums == 2) for (int k = 0; k < 16; k += 4) syn.note(bass, t0 + k * stepS, stepS - 300, rootN, 0.6f, Synth.BASS, 0);
                    } else {
                        int[] pos = st.drums == Drums.ST_AFRO ? new int[]{0, 3, 6, 10} : new int[]{0, 7, 10};
                        for (int k = 0; k < pos.length; k++) {
                            int end = k + 1 < pos.length ? pos[k + 1] : 16;
                            syn.note(bass, t0 + pos[k] * stepS, (end - pos[k]) * stepS - 300, rootN + 12 + (k == 2 && r.nextBoolean() ? 7 : 0), 0.7f, Synth.BASS, 0);
                        }
                    }
                }
                // lead (motif spans 2 bars)
                if (sec.lead && (b % 2 == 0) && !(lastBarOfSection && sec.bars > 1 && b % 2 == 1)) {
                    List<Note> m = sec.leadAlt ? motifB : motifA;
                    int inst = sec.drums == 0 && st.leadInst == Synth.BRASS ? Synth.STRINGS : st.leadInst;
                    boolean answer = (b / 2) % 2 == 1;
                    for (int ni = 0; ni < m.size(); ni++) {
                        Note n = m.get(ni);
                        int deg = n.deg;
                        if (answer && ni >= m.size() - 3) { // resolve phrase ending to a chord tone
                            int cd = prog[(b + n.step / 16) % prog.length]; deg = cd + 7 + ((ni % 2 == 0) ? 0 : 2);
                        }
                        int midi = Theory.degree(song.root, scale, deg, 4);
                        syn.note(music, t0 + n.step * stepS, n.len * stepS - 200, midi, 0.62f, inst, 0.1f);
                        if (sec.leadAlt && inst != Synth.COWBELL) syn.note(music, t0 + n.step * stepS, n.len * stepS - 200, midi + 12, 0.25f, Synth.BELL, -0.2f);
                    }
                }
                p.set(0.82f * bar / totalBars, "Composition : " + sec.name + "…");
            }
            if (sec.filterIn) { // intro low-pass opening
                Svf fl = new Svf(), fr = new Svf(); int a = secStart, z = bar * barS;
                for (int i = a; i < z && i < len; i++) {
                    if (((i - a) & 31) == 0) { double t = (i - a) / (double) (z - a); double c = 350 * Math.pow(50, t); fl.set(c, 0.9); fr.set(c, 0.9); }
                    music.l[i] = fl.process(music.l[i], 0); music.r[i] = fr.process(music.r[i], 0);
                }
            }
        }
        // ending
        int endAt = bar * barS;
        syn.crash(drums, endAt, 0.5f);
        for (int n : Theory.chord(song.root, scale, 0, 4, st.sevenths)) syn.note(music, endAt, 2 * AudioData.SR, n, 0.45f, st.chordInst == Synth.PLUCK ? Synth.PAD : st.chordInst, 0);

        p.set(0.84f, "Mixage…");
        // sidechain pump
        if (st.pump > 0 && !kicks.isEmpty()) {
            float[] env = new float[len]; java.util.Arrays.fill(env, 1f);
            int rel = (int) (0.18 * AudioData.SR);
            for (int k : kicks) for (int i = 0; i < rel && k + i < len; i++) { if (k + i < 0) continue; float g = 1 - st.pump * (float) Math.cos(0.5 * Math.PI * i / rel); if (g < env[k + i]) env[k + i] = g; }
            for (int i = 0; i < len; i++) { music.l[i] *= env[i]; music.r[i] *= env[i]; bass.l[i] *= 0.4f + 0.6f * env[i]; bass.r[i] *= 0.4f + 0.6f * env[i]; }
        }
        AudioData wetMusic = Dsp.reverb(music, 0.55 + st.reverb * 0.6, 0.45, st.reverb, 1.0, 20, new Progress.Sub(p, 0.84f, 0.95f));
        Dsp.filter(bass, Biquad.lowpass(st.use808 ? 900 : 2500, 0.7));
        AudioData mix = new AudioData(Math.max(len, wetMusic.length()));
        mix.mix(drums, 0, 0.9f); mix.mix(bass, 0, 0.85f); mix.mix(wetMusic, 0, 0.8f);
        if (st.drums == Drums.ST_LOFI) mix = Dsp.lofi(mix, 0.45, song.seed);
        mix = Dsp.compress(mix, -14, 2.5, 8, 120, 2);
        mix = Dsp.trimSilence(mix, -70);
        mix.normalize(0.95f);
        mix.gain(1.6f); // +4 dB into the limiter for a release-level loudness
        Dsp.limit(mix, 0.92f);
        p.set(1, null);
        song.summary = summary.toString();
        return mix;
    }
}
