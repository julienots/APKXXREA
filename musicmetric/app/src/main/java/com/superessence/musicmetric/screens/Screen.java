package com.superessence.musicmetric.screens;

import android.view.View;
import android.widget.LinearLayout;

import com.superessence.musicmetric.MainActivity;
import com.superessence.musicmetric.ui.T;

/** A tab of the app. Views are built once and kept. */
public abstract class Screen {
    protected final MainActivity a;
    protected Screen(MainActivity a) { this.a = a; }
    public abstract View build();
    public void onShow() { }
    public void onHide() { }
    public void onTrackChanged() { }
    public void onInfo() { }
    public void onTick(int pos, boolean playing) { }

    /** Page title block shown at the top of each tab. */
    protected LinearLayout page(String title, String subtitle) {
        LinearLayout col = T.col(a);
        LinearLayout head = T.col(a); head.setPadding(T.dp(20), T.dp(8), T.dp(20), T.dp(16));
        head.addView(T.text(a, title, 30, T.WHITE, T.BLACK));
        android.widget.TextView s = T.text(a, subtitle, 14, T.TEXT2, T.REGULAR); s.setLineSpacing(0, 1.15f);
        head.addView(s, T.margins(T.lp(T.MATCH, T.WRAP), 0, 8, 0, 0));
        col.addView(head);
        return col;
    }

    protected View.OnClickListener click(final Runnable r) { return new View.OnClickListener() { public void onClick(View v) { r.run(); } }; }
}
