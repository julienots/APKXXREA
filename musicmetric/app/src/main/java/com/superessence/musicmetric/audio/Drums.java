package com.superessence.musicmetric.audio;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

/** Drum grooves per style, expressed as 16-step bars with optional rolls (fractional steps). */
public final class Drums {
    private Drums() { }
    public static final int KICK = 0, SNARE = 1, CLAP = 2, HAT = 3, OHAT = 4, RIM = 5, TOM_L = 6, TOM_H = 7;
    public static final String[] NAMES = {"Kick", "Snare", "Clap", "Hi-hat", "Open hat", "Rim", "Tom grave", "Tom aigu"};

    public static final int ST_TRAP = 0, ST_DRILL = 1, ST_HOUSE = 2, ST_BOOMBAP = 3, ST_LOFI = 4, ST_PHONK = 5, ST_EPIC = 6, ST_AFRO = 7, ST_RNB = 8, ST_SAD = 9;
    public static final String[] STYLE_NAMES = {"Trap", "Drill", "House", "Boom bap", "Lo-fi", "Phonk", "Épique", "Afro", "R&B", "Émotion"};

    public static final class Hit {
        public final int type; public final double step; public final float vel;
        Hit(int type, double step, float vel) { this.type = type; this.step = step; this.vel = vel; }
    }

    static void pat(List<Hit> out, int type, String p, float vel) {
        for (int i = 0; i < p.length() && i < 16; i++) {
            char c = p.charAt(i);
            if (c == 'x') out.add(new Hit(type, i, vel));
            else if (c == 'o') out.add(new Hit(type, i, vel * 0.55f));
        }
    }

    static void roll(List<Hit> out, int type, double from, double to, int perStep, float v0, float v1) {
        int n = (int) Math.round((to - from) * perStep);
        for (int i = 0; i < n; i++) out.add(new Hit(type, from + i / (double) perStep, v0 + (v1 - v0) * i / Math.max(1, n - 1)));
    }

    /**
     * One bar. energy: 1 = light, 2 = full. barInPhrase 0..3 for fills. Swing is applied by the renderer.
     */
    public static List<Hit> bar(int style, int energy, int barInPhrase, Random r) {
        List<Hit> h = new ArrayList<Hit>();
        boolean fill = barInPhrase == 3;
        switch (style) {
            case ST_TRAP:
                pat(h, KICK, fill ? "x......x..x....." : (r.nextBoolean() ? "x.....x...x....." : "x......x.x......"), 1f);
                pat(h, CLAP, "........x.......", 0.95f); pat(h, SNARE, "........x.......", 0.5f);
                if (energy >= 2) {
                    for (int i = 0; i < 16; i += 2) h.add(new Hit(HAT, i, (i % 4 == 0) ? 0.8f : 0.55f));
                    int rs = 4 + 2 * r.nextInt(5); roll(h, HAT, rs, rs + 2, r.nextBoolean() ? 3 : 4, 0.45f, 0.75f);
                    if (fill) roll(h, HAT, 12, 16, 4, 0.4f, 0.9f);
                } else for (int i = 0; i < 16; i += 4) h.add(new Hit(HAT, i, 0.5f));
                if (fill && energy >= 2) pat(h, OHAT, "..............x.", 0.5f);
                break;
            case ST_DRILL:
                pat(h, KICK, fill ? "x.........x..x.." : "x......x...x....", 1f);
                pat(h, SNARE, "........x.....x.", 0.95f); pat(h, CLAP, "........x.......", 0.6f);
                if (energy >= 2) {
                    pat(h, HAT, "x..x..x.x..x..x.", 0.6f); pat(h, HAT, "...........o....", 0.6f);
                    if (r.nextInt(3) == 0) roll(h, HAT, 6, 8, 3, 0.4f, 0.7f);
                    pat(h, RIM, ".........o......", 0.7f);
                } else pat(h, HAT, "x...x...x...x...", 0.45f);
                break;
            case ST_HOUSE:
                pat(h, KICK, "x...x...x...x...", 1f);
                pat(h, CLAP, "....x.......x...", 0.85f);
                if (energy >= 2) { pat(h, OHAT, "..x...x...x...x.", 0.6f); pat(h, HAT, "x.xxx.xxx.xxx.xx", 0.35f); pat(h, RIM, "...o.....o..o...", 0.6f); }
                else pat(h, HAT, "..x...x...x...x.", 0.5f);
                if (fill) pat(h, SNARE, "............xxxx", 0.55f);
                break;
            case ST_BOOMBAP: case ST_LOFI:
                pat(h, KICK, fill ? "x.........x.x..." : (r.nextBoolean() ? "x.........x....." : "x......x..x....."), style == ST_LOFI ? 0.8f : 1f);
                pat(h, SNARE, "....x.......x...", style == ST_LOFI ? 0.65f : 0.9f);
                pat(h, HAT, energy >= 2 ? "x.x.x.x.x.x.x.xo" : "x...x...x...x...", style == ST_LOFI ? 0.4f : 0.6f);
                if (style == ST_LOFI) pat(h, RIM, ".......o......o.", 0.5f);
                break;
            case ST_PHONK:
                pat(h, KICK, fill ? "x.x...x...x.x.x." : "x.....x...x.....", 1f);
                pat(h, CLAP, "....x.......x...", 0.95f); pat(h, SNARE, "....x.......x...", 0.6f);
                if (energy >= 2) { pat(h, HAT, "x.xxx.xxx.xxx.xx", 0.5f); pat(h, OHAT, "......x.......x.", 0.4f); }
                else pat(h, HAT, "x.x.x.x.x.x.x.x.", 0.4f);
                break;
            case ST_EPIC:
                if (energy >= 2) {
                    pat(h, KICK, "x...x...x...x...", 1f); pat(h, CLAP, "....x.......x...", 0.8f); pat(h, SNARE, "....x.......x...", 0.6f);
                    pat(h, OHAT, "..x...x...x...x.", 0.45f);
                    pat(h, TOM_L, fill ? "x..x..x.x..x.xxx" : "x.....x.........", 0.8f);
                } else {
                    pat(h, TOM_L, "x.....x...x.....", 0.75f); pat(h, TOM_H, fill ? "........x.x.xxxx" : "............x...", 0.55f);
                }
                break;
            case ST_AFRO:
                pat(h, KICK, "x..x..x...x..x..", 0.95f);
                pat(h, RIM, "...x..x....x..x.", 0.75f); pat(h, CLAP, "........x.......", energy >= 2 ? 0.7f : 0f);
                pat(h, HAT, energy >= 2 ? "xoxxxoxxxoxxxoxx" : "x.x.x.x.x.x.x.x.", 0.4f);
                if (energy >= 2) pat(h, TOM_H, fill ? "..........x.x.x." : ".............x..", 0.5f);
                break;
            case ST_RNB:
                pat(h, KICK, fill ? "x.....x.x.x....." : "x......x..x.....", 0.9f);
                pat(h, CLAP, "....x.......x...", 0.75f); pat(h, RIM, "....x.......x...", 0.5f);
                pat(h, HAT, energy >= 2 ? "x.xxx.x.x.xxx.x." : "x...x...x...x...", 0.4f);
                break;
            default: // ST_SAD
                pat(h, KICK, energy >= 2 ? "x.........x....." : "x...............", 0.85f);
                pat(h, CLAP, "........x.......", energy >= 2 ? 0.75f : 0.4f);
                pat(h, HAT, energy >= 2 ? "x.x.x.x.x.x.x.x." : "x...x...x...x...", 0.35f);
                if (energy >= 2 && fill) roll(h, HAT, 12, 16, 3, 0.3f, 0.6f);
        }
        return h;
    }

    public static void play(Synth s, AudioData o, int type, int at, float vel, float pan) {
        if (vel <= 0) return;
        switch (type) {
            case KICK: s.kick(o, at, vel); break;
            case SNARE: s.snare(o, at, vel); break;
            case CLAP: s.clap(o, at, vel); break;
            case HAT: s.hat(o, at, vel, false, pan); break;
            case OHAT: s.hat(o, at, vel, true, pan); break;
            case RIM: s.rim(o, at, vel); break;
            case TOM_L: s.tom(o, at, vel, 90); break;
            default: s.tom(o, at, vel, 150); break;
        }
    }
}
