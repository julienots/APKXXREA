package com.superessence.musicmetric.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.MotionEvent;
import android.view.View;

/** Tap grid for the step sequencer. Drum mode: any cell toggles. Melody mode: one note per column. */
public final class StepGrid extends View {
    public interface Model { boolean get(int row, int col); void toggle(int row, int col); }

    final String[] labels; final int rows, cols; final Model model; final boolean melody; int playing = -1;
    final Paint on = new Paint(Paint.ANTI_ALIAS_FLAG), off = new Paint(Paint.ANTI_ALIAS_FLAG), offBeat = new Paint(Paint.ANTI_ALIAS_FLAG),
            lab = new Paint(Paint.ANTI_ALIAS_FLAG), hl = new Paint(Paint.ANTI_ALIAS_FLAG);
    final RectF rf = new RectF();

    public StepGrid(Context c, String[] labels, int cols, boolean melody, Model model) {
        super(c); this.labels = labels; this.rows = labels.length; this.cols = cols; this.melody = melody; this.model = model;
        on.setColor(T.Y); off.setColor(T.SURFACE3); offBeat.setColor(0xFF2C2C31); hl.setColor(0x22FFFFFF);
        lab.setColor(T.TEXT2); lab.setTextSize(T.dpf(10)); lab.setTypeface(T.BOLD);
    }

    public void setPlaying(int col) { if (col != playing) { playing = col; invalidate(); } }

    float labelW() { return T.dpf(melody ? 34 : 44); }
    float cell() { return melody ? T.dpf(22) : T.dpf(30); }

    @Override protected void onMeasure(int wm, int hm) { setMeasuredDimension(MeasureSpec.getSize(wm), (int) (rows * cell())); }

    @Override protected void onDraw(Canvas c) {
        float lw = labelW(), cw = (getWidth() - lw) / cols, ch = cell(), g = T.dpf(2.5f), r = T.dpf(melody ? 4 : 6);
        for (int row = 0; row < rows; row++) {
            float y = row * ch;
            c.drawText(labels[row], 0, y + ch / 2 + T.dpf(4), lab);
            for (int col = 0; col < cols; col++) {
                float x = lw + col * cw;
                rf.set(x + g, y + g, x + cw - g, y + ch - g);
                boolean active = model.get(row, col);
                c.drawRoundRect(rf, r, r, active ? on : ((col / 4) % 2 == 0 ? off : offBeat));
                if (col == playing) c.drawRoundRect(rf, r, r, hl);
            }
        }
    }

    @Override public boolean onTouchEvent(MotionEvent e) {
        if (e.getActionMasked() == MotionEvent.ACTION_DOWN) return true;
        if (e.getActionMasked() == MotionEvent.ACTION_UP) {
            float lw = labelW(), cw = (getWidth() - lw) / cols;
            int col = (int) ((e.getX() - lw) / cw), row = (int) (e.getY() / cell());
            if (col >= 0 && col < cols && row >= 0 && row < rows) { model.toggle(row, col); invalidate(); }
            return true;
        }
        return true;
    }
}
