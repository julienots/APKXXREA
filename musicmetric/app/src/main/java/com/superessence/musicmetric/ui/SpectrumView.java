package com.superessence.musicmetric.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.View;

import com.superessence.musicmetric.audio.AudioData;
import com.superessence.musicmetric.audio.Fft;

/** Live log-frequency spectrum bars of the audio around the playhead. */
public final class SpectrumView extends View {
    static final int N = 2048, BARS = 32;
    final Fft fft = new Fft(N); final float[] re = new float[N], im = new float[N], level = new float[BARS];
    final Paint bar = new Paint(Paint.ANTI_ALIAS_FLAG), base = new Paint(Paint.ANTI_ALIAS_FLAG); final RectF rf = new RectF();
    AudioData data; int pos; boolean active;

    public SpectrumView(Context c) { super(c); base.setColor(0xFF1E1E22); }

    public void update(AudioData d, int position, boolean playing) {
        data = d; pos = position; active = playing; invalidate();
    }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        bar.setShader(new LinearGradient(0, h, 0, 0, new int[]{T.Y_DARK, T.Y, 0xFFFFF1B8}, null, Shader.TileMode.CLAMP));
    }

    @Override protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight();
        if (data != null && active && pos + N < data.length()) {
            for (int i = 0; i < N; i++) { re[i] = 0.5f * (data.l[pos + i] + data.r[pos + i]) * fft.window[i]; im[i] = 0; }
            fft.forward(re, im);
            for (int b = 0; b < BARS; b++) {
                double f0 = 40 * Math.pow(16000 / 40.0, b / (double) BARS), f1 = 40 * Math.pow(16000 / 40.0, (b + 1) / (double) BARS);
                int k0 = Math.max(1, (int) (f0 * N / AudioData.SR)), k1 = Math.max(k0 + 1, (int) (f1 * N / AudioData.SR));
                double s = 0; for (int k = k0; k < k1; k++) s = Math.max(s, re[k] * re[k] + im[k] * im[k]);
                float db = (float) (10 * Math.log10(s + 1e-9)); float v = Math.max(0, Math.min(1, (db + 10) / 55f));
                level[b] = v > level[b] ? v : level[b] * 0.85f + v * 0.15f;
            }
        } else for (int b = 0; b < BARS; b++) level[b] *= 0.85f;
        float bw = w / (float) BARS, gap = bw * 0.28f, r = (bw - gap) / 2;
        for (int b = 0; b < BARS; b++) {
            float x = b * bw; rf.set(x, h - T.dpf(3), x + bw - gap, h); c.drawRoundRect(rf, r, r, base);
            float bh = Math.max(T.dpf(3), level[b] * h);
            rf.set(x, h - bh, x + bw - gap, h); c.drawRoundRect(rf, r, r, bar);
        }
    }
}
