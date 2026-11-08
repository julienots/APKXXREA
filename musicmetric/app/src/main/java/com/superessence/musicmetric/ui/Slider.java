package com.superessence.musicmetric.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

/** Labelled horizontal slider with yellow fill (centered fill for bipolar ranges). */
public final class Slider extends View {
    public interface Format { String format(float v); }
    public interface Listener { void onChange(float v); }

    final String label; final float min, max, step, def; float value; Format fmt; Listener listener;
    final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG), fill = new Paint(Paint.ANTI_ALIAS_FLAG), thumb = new Paint(Paint.ANTI_ALIAS_FLAG),
            lab = new Paint(Paint.ANTI_ALIAS_FLAG), val = new Paint(Paint.ANTI_ALIAS_FLAG);
    final RectF rf = new RectF();

    public Slider(Context c, String label, float min, float max, float step, float value, Format fmt) {
        super(c); this.label = label; this.min = min; this.max = max; this.step = step; this.value = value; this.def = value; this.fmt = fmt;
        track.setColor(T.SURFACE3); fill.setColor(T.Y); thumb.setColor(T.WHITE);
        lab.setColor(T.TEXT2); lab.setTextSize(T.dpf(13)); lab.setTypeface(T.MEDIUM);
        val.setColor(T.WHITE); val.setTextSize(T.dpf(13)); val.setTypeface(T.BOLD); val.setTextAlign(Paint.Align.RIGHT);
        setMinimumHeight(T.dp(58));
    }

    public float value() { return value; }
    public void setValue(float v) { value = Math.max(min, Math.min(max, v)); invalidate(); }
    public void reset() { setValue(def); }
    public Slider onChange(Listener l) { listener = l; return this; }

    @Override protected void onMeasure(int wm, int hm) { setMeasuredDimension(MeasureSpec.getSize(wm), T.dp(58)); }

    float pad() { return T.dpf(10); }

    @Override protected void onDraw(Canvas c) {
        int w = getWidth(); float y = T.dpf(40), th = T.dpf(4), p = pad();
        c.drawText(label, 0, T.dpf(16), lab);
        c.drawText(fmt != null ? fmt.format(value) : String.valueOf(value), w, T.dpf(16), val);
        rf.set(p, y - th / 2, w - p, y + th / 2); c.drawRect(rf, track);
        float x = p + (w - 2 * p) * (value - min) / (max - min);
        float zero = min < 0 && max > 0 ? p + (w - 2 * p) * (0 - min) / (max - min) : p;
        rf.set(Math.min(zero, x), y - th / 2, Math.max(zero, x), y + th / 2); c.drawRect(rf, fill);
        rf.set(x - T.dpf(5), y - T.dpf(12), x + T.dpf(5), y + T.dpf(12)); c.drawRoundRect(rf, T.dpf(2), T.dpf(2), thumb);
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        int a = e.getActionMasked();
        if (a == MotionEvent.ACTION_DOWN) getParent().requestDisallowInterceptTouchEvent(true);
        if (a == MotionEvent.ACTION_DOWN || a == MotionEvent.ACTION_MOVE || a == MotionEvent.ACTION_UP) {
            float p = pad(), t = (e.getX() - p) / (getWidth() - 2 * p);
            float v = min + Math.max(0, Math.min(1, t)) * (max - min);
            if (step > 0) v = Math.round(v / step) * step;
            v = Math.max(min, Math.min(max, v));
            if (v != value) { value = v; invalidate(); if (listener != null) listener.onChange(v); }
        }
        if (a == MotionEvent.ACTION_UP || a == MotionEvent.ACTION_CANCEL) getParent().requestDisallowInterceptTouchEvent(false);
        return true;
    }
}
