package com.superessence.musicmetric.audio;

/** Progress sink for long-running audio jobs (0..1). */
public interface Progress {
    void set(float fraction, String label);

    Progress NONE = new Progress() { public void set(float f, String s) { } };

    /** Maps a sub-task's 0..1 progress into [a, b] of the parent. */
    final class Sub implements Progress {
        final Progress p; final float a, b;
        public Sub(Progress p, float a, float b) { this.p = p; this.a = a; this.b = b; }
        public void set(float f, String s) { p.set(a + (b - a) * Math.max(0, Math.min(1, f)), s); }
    }
}
