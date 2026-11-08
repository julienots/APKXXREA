package com.superessence.musicmetric.audio;

import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;

/** Streaming AudioTrack player with seek, loop region and latency-compensated position. */
public final class Player {
    public interface Listener { void onStateChanged(boolean playing); }

    private volatile AudioData data;
    private volatile int writePos;
    private volatile boolean playing;
    private volatile int seekTo = -1;
    private volatile int loopA = -1, loopB = -1;
    private volatile long written, headBase;
    private volatile AudioTrack track;
    private Thread thread;
    private Listener listener;
    private final Object lock = new Object();

    public void setListener(Listener l) { listener = l; }

    public void setData(AudioData d) {
        stop();
        data = d; writePos = 0;
    }

    public AudioData data() { return data; }
    public boolean isPlaying() { return playing; }

    public void setLoop(int a, int b) { if (b - a < AudioData.SR / 20) { loopA = loopB = -1; } else { loopA = a; loopB = b; } }
    public void clearLoop() { loopA = loopB = -1; }
    public boolean hasLoop() { return loopA >= 0; }

    /** Current audible position (samples). */
    public int position() {
        AudioData d = data; if (d == null) return 0;
        AudioTrack t = track;
        if (!playing || t == null) return Math.min(writePos, d.length());
        long head;
        try { head = t.getPlaybackHeadPosition() & 0xFFFFFFFFL; } catch (Exception e) { return writePos; }
        long latency = Math.max(0, written - (head - headBase));
        long p = writePos - latency;
        if (loopA >= 0 && p < loopA) p = loopB - (loopA - p);
        if (p < 0) p = 0;
        return (int) Math.min(p, d.length());
    }

    public void seek(int samples) {
        AudioData d = data; if (d == null) return;
        samples = Math.max(0, Math.min(samples, d.length()));
        if (playing) seekTo = samples; else writePos = samples;
    }

    public void toggle() { if (playing) pause(); else play(); }

    public void play() {
        final AudioData d = data;
        if (d == null || playing) return;
        if (writePos >= d.length() - 1) writePos = 0;
        playing = true;
        thread = new Thread(new Runnable() { public void run() { loop(d); } }, "mm-player");
        thread.setPriority(Thread.MAX_PRIORITY);
        thread.start();
        if (listener != null) listener.onStateChanged(true);
    }

    public void pause() {
        if (!playing) return;
        int p = position();
        playing = false;
        joinThread();
        writePos = p;
        if (listener != null) listener.onStateChanged(false);
    }

    public void stop() {
        boolean was = playing;
        playing = false;
        joinThread();
        writePos = 0;
        if (was && listener != null) listener.onStateChanged(false);
    }

    private void joinThread() {
        Thread t = thread; thread = null;
        if (t != null && t != Thread.currentThread()) { try { t.join(800); } catch (InterruptedException ignored) { } }
    }

    @SuppressWarnings("deprecation")
    private void loop(AudioData d) {
        int min = AudioTrack.getMinBufferSize(AudioData.SR, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT);
        int bufBytes = Math.max(min * 2, 16384);
        AudioTrack t;
        try {
            t = new AudioTrack(AudioManager.STREAM_MUSIC, AudioData.SR, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT, bufBytes, AudioTrack.MODE_STREAM);
            t.play();
        } catch (Exception e) { playing = false; return; }
        synchronized (lock) { track = t; written = 0; headBase = 0; }
        final int CH = 1024; short[] buf = new short[CH * 2];
        boolean ended = false;
        try {
            while (playing) {
                if (seekTo >= 0) {
                    t.pause(); t.flush();
                    writePos = seekTo; seekTo = -1;
                    written = 0; headBase = t.getPlaybackHeadPosition() & 0xFFFFFFFFL;
                    t.play();
                }
                int n = d.length(), pos = writePos;
                int end = loopA >= 0 ? Math.min(loopB, n) : n;
                if (pos >= end) {
                    if (loopA >= 0) { writePos = loopA; continue; }
                    ended = true; break;
                }
                int frames = Math.min(CH, end - pos);
                for (int i = 0; i < frames; i++) { buf[2 * i] = Codec.toShort(d.l[pos + i]); buf[2 * i + 1] = Codec.toShort(d.r[pos + i]); }
                int w = t.write(buf, 0, frames * 2);
                if (w < 0) break;
                writePos = pos + w / 2;
                written += w / 2;
            }
            if (ended) {
                // let the buffer drain so the end is audible
                long target = written;
                long until = System.currentTimeMillis() + 1500;
                while (playing && ((t.getPlaybackHeadPosition() & 0xFFFFFFFFL) - headBase) < target && System.currentTimeMillis() < until) {
                    try { Thread.sleep(15); } catch (InterruptedException ignored) { }
                }
            }
        } catch (Exception ignored) {
        } finally {
            synchronized (lock) { track = null; }
            try { t.pause(); t.flush(); t.stop(); } catch (Exception ignored) { }
            t.release();
        }
        if (ended && playing) {
            playing = false; writePos = 0;
            if (listener != null) listener.onStateChanged(false);
        }
    }
}
