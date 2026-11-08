package com.superessence.musicmetric.audio;

/** Scales, chords and degree→MIDI mapping. */
public final class Theory {
    private Theory() { }
    public static final int[] MAJOR = {0, 2, 4, 5, 7, 9, 11};
    public static final int[] MINOR = {0, 2, 3, 5, 7, 8, 10};
    public static final int[] HARM_MINOR = {0, 2, 3, 5, 7, 8, 11};
    public static final String[] ROMAN_MAJ = {"I", "ii", "iii", "IV", "V", "vi", "vii°"};
    public static final String[] ROMAN_MIN = {"i", "ii°", "III", "iv", "v", "VI", "VII"};

    public static int[] scale(boolean minor) { return minor ? MINOR : MAJOR; }

    /** Degree (0-based, may be negative or > 6) to MIDI note; octave 4 means degree 0 = root in octave 4 (C4 = 60). */
    public static int degree(int root, int[] scale, int deg, int octave) {
        int o = Math.floorDiv(deg, 7), d = Math.floorMod(deg, 7);
        return 12 * (octave + 1) + root + scale[d] + 12 * o;
    }

    /** Triad (or 7th chord) on a scale degree, voiced around octave. */
    public static int[] chord(int root, int[] scale, int deg, int octave, boolean seventh) {
        int n = seventh ? 4 : 3; int[] c = new int[n];
        for (int i = 0; i < n; i++) c[i] = degree(root, scale, deg + 2 * i, octave);
        // keep the voicing compact: fold notes above octave+1 down
        int top = 12 * (octave + 2) + root + 4;
        for (int i = 0; i < n; i++) if (c[i] > top) c[i] -= 12;
        return c;
    }

    public static boolean isChordTone(int[] scale, int chordDeg, int deg) {
        int d = Math.floorMod(deg - chordDeg, 7); return d == 0 || d == 2 || d == 4;
    }

    public static String keyLabel(int root, boolean minor) { return Analysis.NOTES[root] + (minor ? "m" : ""); }
}
