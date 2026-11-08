package com.superessence.musicmetric.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.RectF;
import android.graphics.Shader;
import android.view.MotionEvent;
import android.view.View;

import com.superessence.musicmetric.audio.AudioData;

/** Waveform with playhead, tap-to-seek and drag-to-select. */
public final class WaveformView extends View {
    public interface Listener { void onSeek(int sample); void onSelection(int a, int b); }

    AudioData data; float[] mins, maxs; int playhead = 0, selA = -1, selB = -1; Listener listener;
    final Paint wave = new Paint(Paint.ANTI_ALIAS_FLAG), dim = new Paint(Paint.ANTI_ALIAS_FLAG), head = new Paint(Paint.ANTI_ALIAS_FLAG),
            sel = new Paint(), grid = new Paint(), txt = new Paint(Paint.ANTI_ALIAS_FLAG);
    final RectF rf = new RectF(); float downX; boolean dragging;

    public WaveformView(Context c) {
        super(c);
        dim.setColor(0xFF3A3A40); head.setColor(T.WHITE); head.setStrokeWidth(T.dpf(2));
        sel.setColor(0x33FFC928); grid.setColor(0xFF1C1C20); grid.setStrokeWidth(1);
        txt.setColor(T.TEXT3); txt.setTextSize(T.dpf(11)); txt.setTypeface(T.MEDIUM);
    }

    public void setListener(Listener l) { listener = l; }

    public void setData(AudioData d) { data = d; selA = selB = -1; mins = null; requestLayout(); invalidate(); }

    public void setPlayhead(int s) { if (s != playhead) { playhead = s; invalidate(); } }
    public int selA() { return Math.min(selA, selB); }
    public int selB() { return Math.max(selA, selB); }
    public boolean hasSelection() { return selA >= 0 && selB >= 0 && Math.abs(selB - selA) > AudioData.SR / 20; }
    public void clearSelection() { selA = selB = -1; invalidate(); if (listener != null) listener.onSelection(-1, -1); }

    void compute(int w) {
        if (data == null || w <= 0) return;
        int bars = Math.max(1, w / (int) T.dpf(3));
        mins = new float[bars]; maxs = new float[bars];
        int n = data.length(); float peak = Math.max(0.05f, data.peak());
        for (int b = 0; b < bars; b++) {
            int a = (int) ((long) n * b / bars), z = (int) ((long) n * (b + 1) / bars);
            float mx = 0; int step = Math.max(1, (z - a) / 400);
            for (int i = a; i < z; i += step) { float v = Math.max(Math.abs(data.l[i]), Math.abs(data.r[i])); if (v > mx) mx = v; }
            maxs[b] = (float) Math.pow(mx / peak, 0.8);
        }
    }

    @Override protected void onSizeChanged(int w, int h, int ow, int oh) {
        mins = null;
        wave.setShader(new LinearGradient(0, 0, 0, h, new int[]{0xFFFFE27A, T.Y, T.Y_DARK, T.Y, 0xFFFFE27A}, null, Shader.TileMode.CLAMP));
    }

    @Override protected void onDraw(Canvas c) {
        int w = getWidth(), h = getHeight(); float mid = h / 2f;
        for (int i = 1; i < 4; i++) c.drawLine(0, h * i / 4f, w, h * i / 4f, grid);
        if (data == null || data.length() == 0) {
            c.drawText("Aucune piste", T.dpf(12), mid + T.dpf(4), txt); return;
        }
        if (mins == null) compute(w);
        int bars = maxs.length; float bw = w / (float) bars, gap = Math.max(1, bw * 0.3f);
        float phx = playhead / (float) data.length() * w;
        if (hasSelection()) {
            float a = selA() / (float) data.length() * w, b = selB() / (float) data.length() * w;
            c.drawRect(a, 0, b, h, sel);
        }
        float rad = (bw - gap) / 2;
        for (int b = 0; b < bars; b++) {
            float x = b * bw, amp = Math.max(T.dpf(1.5f), maxs[b] * (h / 2f - T.dpf(4)));
            rf.set(x, mid - amp, x + bw - gap, mid + amp);
            c.drawRoundRect(rf, rad, rad, x <= phx ? wave : dim);
        }
        c.drawLine(phx, 0, phx, h, head);
        c.drawCircle(phx, T.dpf(3), T.dpf(4), head);
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        if (data == null || data.length() == 0) return false;
        float x = Math.max(0, Math.min(getWidth(), e.getX()));
        int s = (int) ((long) data.length() * x / Math.max(1, getWidth()));
        switch (e.getActionMasked()) {
            case MotionEvent.ACTION_DOWN: downX = x; dragging = false; getParent().requestDisallowInterceptTouchEvent(true); return true;
            case MotionEvent.ACTION_MOVE:
                if (!dragging && Math.abs(x - downX) > T.dpf(10)) { dragging = true; selA = (int) ((long) data.length() * downX / getWidth()); }
                if (dragging) { selB = s; invalidate(); }
                return true;
            case MotionEvent.ACTION_UP:
                if (dragging) { if (listener != null) listener.onSelection(selA(), selB()); }
                else if (listener != null) listener.onSeek(s);
                getParent().requestDisallowInterceptTouchEvent(false);
                return true;
            case MotionEvent.ACTION_CANCEL: getParent().requestDisallowInterceptTouchEvent(false); return true;
        }
        return super.onTouchEvent(e);
    }
}
