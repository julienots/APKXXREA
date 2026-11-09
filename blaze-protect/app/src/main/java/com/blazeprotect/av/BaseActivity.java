package com.blazeprotect.av;

import android.app.Activity;
import android.app.AlertDialog;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Common screen chrome: top bar with back navigation and a scrolling content column. */
public abstract class BaseActivity extends Activity {
    protected LinearLayout root;
    protected LinearLayout bar;
    protected LinearLayout content;
    protected ScrollView scroll;
    protected final Handler ui = new Handler(Looper.getMainLooper());
    protected static final ExecutorService BG = Executors.newFixedThreadPool(2);

    protected abstract String screenTitle();

    protected boolean showBack() { return true; }

    /** Rebuilds the content column; called on every resume. */
    protected abstract void build();

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Ui.statusBar(this);
        root = Ui.vbox(this);
        root.setBackgroundColor(Ui.BG);
        root.setFitsSystemWindows(true);

        bar = Ui.hbox(this);
        bar.setPadding(dp(6), dp(6), dp(10), dp(6));
        bar.setMinimumHeight(dp(58));
        if (showBack()) {
            ImageView back = Ui.icon(this, R.drawable.ic_back, Ui.TEXT, 24);
            FrameLayout hit = new FrameLayout(this);
            hit.addView(back, new FrameLayout.LayoutParams(dp(24), dp(24), Gravity.CENTER));
            hit.setBackground(Ui.pressable(this, Ui.round(0, dp(22), 0, 0), dp(22)));
            hit.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { finish(); }
            });
            bar.addView(hit, new LinearLayout.LayoutParams(dp(44), dp(44)));
        }
        TextView t = Ui.title(this, screenTitle(), 19);
        t.setPadding(showBack() ? dp(6) : dp(12), 0, 0, 0);
        bar.addView(t, Ui.weight(1));
        root.addView(bar, Ui.matchWrap());

        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        content = Ui.vbox(this);
        content.setPadding(dp(16), dp(4), dp(16), dp(28));
        scroll.addView(content, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(scroll, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
    }

    @Override
    protected void onResume() {
        super.onResume();
        refresh();
    }

    protected void refresh() {
        content.removeAllViews();
        build();
    }

    protected void addBarAction(int icon, String description, View.OnClickListener l) {
        ImageView iv = Ui.icon(this, icon, Ui.TEXT2, 22);
        FrameLayout hit = new FrameLayout(this);
        hit.setContentDescription(description);
        hit.addView(iv, new FrameLayout.LayoutParams(dp(22), dp(22), Gravity.CENTER));
        hit.setBackground(Ui.pressable(this, Ui.round(0, dp(22), 0, 0), dp(22)));
        hit.setOnClickListener(l);
        bar.addView(hit, new LinearLayout.LayoutParams(dp(44), dp(44)));
    }

    protected int dp(float v) { return Ui.dp(this, v); }

    protected void add(View v) { content.addView(v, Ui.matchWrap()); }

    protected void addSection(String s) { add(Ui.section(this, s)); }

    protected void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_LONG).show(); }

    protected void bg(Runnable r) { BG.execute(r); }

    protected void onUi(Runnable r) { ui.post(r); }

    protected TextView emptyState(String titleText, String body) {
        LinearLayout box = Ui.vbox(this);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setPadding(dp(24), dp(48), dp(24), dp(24));
        box.addView(Ui.iconTile(this, R.drawable.ic_check, Ui.OK, 56));
        TextView t = Ui.title(this, titleText, 17);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(16), 0, dp(6));
        box.addView(t);
        TextView b = Ui.text(this, body, 13.5f, Ui.TEXT2);
        b.setGravity(Gravity.CENTER);
        box.addView(b);
        add(box);
        return t;
    }

    protected void confirm(String title, String message, String ok, final Runnable action) {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton(ok, new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int w) { action.run(); }
                })
                .setNegativeButton("Annuler", null)
                .show();
    }

    /** Loading placeholder while background work runs. */
    protected void loading(String label) {
        LinearLayout box = Ui.vbox(this);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setPadding(0, dp(60), 0, 0);
        android.widget.ProgressBar pb = new android.widget.ProgressBar(this);
        pb.setIndeterminateTintList(android.content.res.ColorStateList.valueOf(Ui.ACCENT));
        box.addView(pb, new LinearLayout.LayoutParams(dp(36), dp(36)));
        TextView t = Ui.text(this, label, 13.5f, Ui.TEXT2);
        t.setPadding(0, dp(14), 0, 0);
        box.addView(t);
        add(box);
    }
}
