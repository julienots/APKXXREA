package com.superessence.musicmetric.ui;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.view.View;

/** Hand-drawn line icon set on a 24×24 grid (no bitmaps, crisp at any density). */
public final class Icon extends View {
    public static final int PLAY = 0, PAUSE = 1, STOP = 2, IMPORT = 3, MIC = 4, UNDO = 5, REDO = 6, SAVE = 7, SHARE = 8, CUT = 9, TRASH = 10,
            FADE_IN = 11, FADE_OUT = 12, NORMALIZE = 13, REVERSE = 14, VOL_UP = 15, VOL_DOWN = 16, MONO = 17, WAVE = 18, SLIDERS = 19,
            SHUFFLE = 20, PIANO = 21, LOOP = 22, INFO = 23, BOLT = 24, PLUS = 25, DRUM = 26, LAYERS = 27, EXTEND = 28, NOTE = 29,
            HEADPHONES = 30, CLOSE = 31, CHECK = 32, BACK = 33, TRIM = 34, COPY = 35, KEY = 36, SPEED = 37;

    int icon, color; final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); final Path path = new Path(); final RectF rf = new RectF();

    public Icon(Context c, int icon, int color) {
        super(c); this.icon = icon; this.color = color;
        p.setStrokeCap(Paint.Cap.ROUND); p.setStrokeJoin(Paint.Join.ROUND);
    }

    public void set(int icon, int color) { this.icon = icon; this.color = color; invalidate(); }
    public void setColor(int color) { this.color = color; invalidate(); }

    @Override protected void onDraw(Canvas c) {
        int pw = getWidth() - getPaddingLeft() - getPaddingRight(), ph = getHeight() - getPaddingTop() - getPaddingBottom();
        float s = Math.min(pw, ph) / 24f;
        c.save(); c.translate(getPaddingLeft() + (pw - 24 * s) / 2, getPaddingTop() + (ph - 24 * s) / 2); c.scale(s, s);
        p.setColor(color); p.setStrokeWidth(2f); p.setStyle(Paint.Style.STROKE); path.reset();
        switch (icon) {
            case PLAY: fill(); path.moveTo(7, 4.5f); path.lineTo(19.5f, 12); path.lineTo(7, 19.5f); path.close(); rounded(c); break;
            case PAUSE: fill(); c.drawRoundRect(r(6, 4.5f, 10, 19.5f), 1.5f, 1.5f, p); c.drawRoundRect(r(14, 4.5f, 18, 19.5f), 1.5f, 1.5f, p); break;
            case STOP: fill(); c.drawRoundRect(r(6, 6, 18, 18), 2.5f, 2.5f, p); break;
            case IMPORT: line(c, 12, 15, 12, 3); poly(c, 7, 8, 12, 3, 17, 8); poly(c, 4, 15, 4, 20, 20, 20, 20, 15); break;
            case SAVE: line(c, 12, 3, 12, 15); poly(c, 7, 10, 12, 15, 17, 10); poly(c, 4, 15, 4, 20, 20, 20, 20, 15); break;
            case MIC: c.drawRoundRect(r(9, 3, 15, 14), 3, 3, p); path.moveTo(5.5f, 11); path.cubicTo(5.5f, 19, 18.5f, 19, 18.5f, 11); c.drawPath(path, p); line(c, 12, 17.5f, 12, 21); line(c, 8.5f, 21, 15.5f, 21); break;
            case UNDO: poly(c, 8, 5, 4, 9, 8, 13); path.moveTo(4, 9); path.lineTo(14, 9); path.cubicTo(21, 9, 21, 19, 14, 19); path.lineTo(9, 19); c.drawPath(path, p); break;
            case REDO: poly(c, 16, 5, 20, 9, 16, 13); path.moveTo(20, 9); path.lineTo(10, 9); path.cubicTo(3, 9, 3, 19, 10, 19); path.lineTo(15, 19); c.drawPath(path, p); break;
            case SHARE: c.drawCircle(18, 5.5f, 2.5f, p); c.drawCircle(6, 12, 2.5f, p); c.drawCircle(18, 18.5f, 2.5f, p); line(c, 8.2f, 10.8f, 15.8f, 6.7f); line(c, 8.2f, 13.2f, 15.8f, 17.3f); break;
            case CUT: c.drawCircle(6, 6, 3, p); c.drawCircle(6, 18, 3, p); line(c, 8.5f, 7.8f, 20, 17); line(c, 8.5f, 16.2f, 20, 7); break;
            case TRASH: line(c, 4, 6.5f, 20, 6.5f); poly(c, 9, 6.5f, 9, 3.5f, 15, 3.5f, 15, 6.5f); poly(c, 6, 6.5f, 7, 20.5f, 17, 20.5f, 18, 6.5f); line(c, 10, 10.5f, 10, 16.5f); line(c, 14, 10.5f, 14, 16.5f); break;
            case FADE_IN: poly(c, 3, 19, 21, 5, 21, 19); line(c, 3, 19, 21, 19); break;
            case FADE_OUT: poly(c, 3, 5, 21, 19, 3, 19); line(c, 3, 5, 3, 19); break;
            case NORMALIZE: line(c, 3, 4, 21, 4); line(c, 6, 20, 6, 9); line(c, 10, 20, 10, 6); line(c, 14, 20, 14, 8); line(c, 18, 20, 18, 6); break;
            case REVERSE: poly(c, 7, 4, 3, 8, 7, 12); line(c, 3, 8, 21, 8); poly(c, 17, 12, 21, 16, 17, 20); line(c, 21, 16, 3, 16); break;
            case VOL_UP: speaker(c); line(c, 17, 9, 17, 15); line(c, 14, 12, 20, 12); break;
            case VOL_DOWN: speaker(c); line(c, 14, 12, 20, 12); break;
            case MONO: c.drawCircle(12, 12, 8, p); line(c, 12, 7, 12, 17); break;
            case WAVE: line(c, 3, 12, 3, 12); line(c, 6, 9, 6, 15); line(c, 9, 5, 9, 19); line(c, 12, 8, 12, 16); line(c, 15, 3, 15, 21); line(c, 18, 7, 18, 17); line(c, 21, 10.5f, 21, 13.5f); break;
            case SLIDERS: line(c, 5, 4, 5, 20); line(c, 12, 4, 12, 20); line(c, 19, 4, 19, 20); dot(c, 5, 14); dot(c, 12, 8); dot(c, 19, 16); break;
            case SHUFFLE: poly(c, 3, 7, 7, 7, 15, 17, 21, 17); poly(c, 18, 14, 21, 17, 18, 20); poly(c, 3, 17, 7, 17, 9.5f, 13.5f); poly(c, 14.5f, 10.5f, 16, 7, 21, 7); poly(c, 18, 4, 21, 7, 18, 10); break;
            case PIANO: c.drawRoundRect(r(3, 4, 21, 20), 2.5f, 2.5f, p); line(c, 9, 20, 9, 13); line(c, 15, 20, 15, 13); fill(); c.drawRect(r(7.5f, 4, 10.5f, 13), p); c.drawRect(r(13.5f, 4, 16.5f, 13), p); break;
            case LOOP: path.moveTo(4, 12); path.cubicTo(4, 6, 8, 6, 12, 6); path.lineTo(18, 6); c.drawPath(path, p); poly(c, 15, 3, 18, 6, 15, 9); path.reset(); path.moveTo(20, 12); path.cubicTo(20, 18, 16, 18, 12, 18); path.lineTo(6, 18); c.drawPath(path, p); poly(c, 9, 15, 6, 18, 9, 21); break;
            case INFO: c.drawCircle(12, 12, 9, p); line(c, 12, 11, 12, 16.5f); dot(c, 12, 7.5f); break;
            case BOLT: fill(); path.moveTo(13.5f, 2.5f); path.lineTo(5, 13.5f); path.lineTo(11, 13.5f); path.lineTo(10, 21.5f); path.lineTo(19, 10); path.lineTo(13, 10); path.close(); rounded(c); break;
            case PLUS: line(c, 12, 5, 12, 19); line(c, 5, 12, 19, 12); break;
            case DRUM: rf.set(4, 6, 20, 10.5f); c.drawOval(rf, p); line(c, 4, 8.25f, 4, 16); line(c, 20, 8.25f, 20, 16); path.moveTo(4, 16); path.cubicTo(4, 19.5f, 20, 19.5f, 20, 16); c.drawPath(path, p); line(c, 8, 3, 11, 7); line(c, 16, 3, 13, 7); break;
            case LAYERS: poly(c, 12, 3, 21, 8, 12, 13, 3, 8); poly(c, 3, 12.5f, 12, 17.5f, 21, 12.5f); poly(c, 3, 16.5f, 12, 21.5f, 21, 16.5f); break;
            case EXTEND: line(c, 3, 12, 21, 12); poly(c, 7, 8, 3, 12, 7, 16); poly(c, 17, 8, 21, 12, 17, 16); line(c, 12, 5, 12, 9); line(c, 12, 15, 12, 19); break;
            case NOTE: line(c, 9, 17.5f, 9, 4.5f); line(c, 9, 4.5f, 19, 3); line(c, 19, 3, 19, 15.5f); fill(); c.drawCircle(6.5f, 17.5f, 2.8f, p); c.drawCircle(16.5f, 15.5f, 2.8f, p); break;
            case HEADPHONES: path.moveTo(4, 15); path.lineTo(4, 12); path.cubicTo(4, 2, 20, 2, 20, 12); path.lineTo(20, 15); c.drawPath(path, p); c.drawRoundRect(r(3, 13, 8, 20.5f), 2, 2, p); c.drawRoundRect(r(16, 13, 21, 20.5f), 2, 2, p); break;
            case CLOSE: line(c, 6, 6, 18, 18); line(c, 18, 6, 6, 18); break;
            case CHECK: poly(c, 4.5f, 12.5f, 9.5f, 17.5f, 19.5f, 6.5f); break;
            case BACK: fill(); c.drawRect(r(5, 5, 7.5f, 19), p); path.moveTo(19, 5); path.lineTo(9, 12); path.lineTo(19, 19); path.close(); rounded(c); break;
            case TRIM: line(c, 6, 3, 6, 21); line(c, 18, 3, 18, 21); fill(); c.drawRect(r(6, 8, 18, 16), p); break;
            case COPY: c.drawRoundRect(r(8, 8, 20, 20), 2.5f, 2.5f, p); path.moveTo(16, 8); path.lineTo(16, 5.5f); path.quadTo(16, 4, 14.5f, 4); path.lineTo(5.5f, 4); path.quadTo(4, 4, 4, 5.5f); path.lineTo(4, 14.5f); path.quadTo(4, 16, 5.5f, 16); path.lineTo(8, 16); c.drawPath(path, p); break;
            case KEY: c.drawCircle(8, 12, 4.5f, p); line(c, 12.5f, 12, 21, 12); line(c, 18, 12, 18, 15.5f); line(c, 21, 12, 21, 15); break;
            case SPEED: path.moveTo(4, 17); path.cubicTo(2.5f, 9, 9, 4, 12, 4); path.cubicTo(15, 4, 21.5f, 9, 20, 17); c.drawPath(path, p); line(c, 12, 14, 16.5f, 8.5f); dot(c, 12, 14); break;
        }
        c.restore();
    }

    void fill() { p.setStyle(Paint.Style.FILL); }
    void rounded(Canvas c) { p.setStyle(Paint.Style.FILL_AND_STROKE); p.setStrokeWidth(1.5f); c.drawPath(path, p); }
    RectF r(float a, float b, float cc, float d) { rf.set(a, b, cc, d); return rf; }
    void line(Canvas c, float a, float b, float cc, float d) { c.drawLine(a, b, cc, d, p); }
    void dot(Canvas c, float x, float y) { Paint.Style st = p.getStyle(); p.setStyle(Paint.Style.FILL); c.drawCircle(x, y, 2.4f, p); p.setStyle(st); }
    void poly(Canvas c, float... pts) {
        Path q = new Path(); q.moveTo(pts[0], pts[1]); for (int i = 2; i < pts.length; i += 2) q.lineTo(pts[i], pts[i + 1]); c.drawPath(q, p);
    }
    void speaker(Canvas c) { poly(c, 3, 9.5f, 6.5f, 9.5f, 11, 5, 11, 19, 6.5f, 14.5f, 3, 14.5f, 3, 9.5f); }
}
