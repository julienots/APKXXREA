package com.blazeprotect.av;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.view.View;

/** Circular progress gauge; a negative progress shows a spinning arc. */
public class Ring extends View {
    private final Paint track = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Paint arc = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF box = new RectF();
    private float progress = -1f;
    private float spin;

    public Ring(Context c) {
        super(c);
        float w = Ui.dp(c, 10);
        track.setStyle(Paint.Style.STROKE);
        track.setStrokeWidth(w);
        track.setColor(Ui.SURFACE2);
        arc.setStyle(Paint.Style.STROKE);
        arc.setStrokeWidth(w);
        arc.setStrokeCap(Paint.Cap.ROUND);
        arc.setColor(Ui.ACCENT);
    }

    public void setProgress(float p) {
        progress = p;
        invalidate();
    }

    public void setColor(int color) {
        arc.setColor(color);
        invalidate();
    }

    @Override
    protected void onDraw(Canvas c) {
        float pad = track.getStrokeWidth() / 2 + 1;
        box.set(pad, pad, getWidth() - pad, getHeight() - pad);
        c.drawArc(box, 0, 360, false, track);
        if (progress < 0) {
            spin = (spin + 6) % 360;
            c.drawArc(box, spin - 90, 80, false, arc);
            postInvalidateOnAnimation();
        } else if (progress > 0) {
            c.drawArc(box, -90, 360 * Math.min(1f, progress), false, arc);
        }
    }
}
