package com.blazeprotect.av;

import android.app.Activity;
import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.PorterDuff;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.TextUtils;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Design system: palette, typography and the small set of building blocks every screen is made of. */
public final class Ui {
    private Ui() {}

    public static final int BG = 0xFF0B0F14;
    public static final int SURFACE = 0xFF121820;
    public static final int SURFACE2 = 0xFF19212B;
    public static final int STROKE = 0xFF232D39;
    public static final int TEXT = 0xFFE8EDF2;
    public static final int TEXT2 = 0xFF93A1B1;
    public static final int TEXT3 = 0xFF5E6B7A;
    public static final int ACCENT = 0xFFFF6A2B;
    public static final int ACCENT_DIM = 0x33FF6A2B;
    public static final int OK = 0xFF32C27D;
    public static final int WARN = 0xFFF5B041;
    public static final int DANGER = 0xFFEF4E4E;
    public static final int INFO = 0xFF4DA3FF;

    public static final Typeface MEDIUM = Typeface.create("sans-serif-medium", Typeface.NORMAL);
    public static final Typeface REGULAR = Typeface.create("sans-serif", Typeface.NORMAL);
    public static final Typeface MONO = Typeface.MONOSPACE;

    public static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics()));
    }

    public static int alpha(int color, float a) {
        return (Math.round(a * 255) << 24) | (color & 0x00FFFFFF);
    }

    public static int levelColor(int level) {
        switch (level) {
            case Threat.MALICIOUS: return DANGER;
            case Threat.SUSPICIOUS: return WARN;
            case Threat.LOW: return INFO;
            default: return OK;
        }
    }

    // ---------- drawables ----------

    public static GradientDrawable round(int fill, float radiusPx, int stroke, int strokeWidthPx) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setCornerRadius(radiusPx);
        if (strokeWidthPx > 0) g.setStroke(strokeWidthPx, stroke);
        return g;
    }

    public static Drawable pressable(Context c, Drawable content, float radius) {
        GradientDrawable mask = round(Color.WHITE, radius, 0, 0);
        return new RippleDrawable(ColorStateList.valueOf(0x22FFFFFF), content, mask);
    }

    public static void card(View v) {
        Context c = v.getContext();
        v.setBackground(round(SURFACE, dp(c, 14), STROKE, dp(c, 1)));
    }

    public static void clickableCard(View v) {
        Context c = v.getContext();
        v.setBackground(pressable(c, round(SURFACE, dp(c, 14), STROKE, dp(c, 1)), dp(c, 14)));
        v.setClickable(true);
        v.setFocusable(true);
    }

    // ---------- text ----------

    public static TextView text(Context c, CharSequence s, float sp, int color) {
        TextView t = new TextView(c);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        t.setTypeface(REGULAR);
        t.setLineSpacing(0, 1.12f);
        return t;
    }

    public static TextView title(Context c, CharSequence s, float sp) {
        TextView t = text(c, s, sp, TEXT);
        t.setTypeface(MEDIUM);
        return t;
    }

    /** Small all-caps section label with tracking, used above groups of cards. */
    public static TextView section(Context c, String s) {
        TextView t = text(c, s.toUpperCase(), 11.5f, TEXT3);
        t.setTypeface(MEDIUM);
        t.setLetterSpacing(0.12f);
        t.setPadding(dp(c, 4), dp(c, 22), 0, dp(c, 8));
        return t;
    }

    public static TextView mono(Context c, CharSequence s, float sp, int color) {
        TextView t = text(c, s, sp, color);
        t.setTypeface(MONO);
        t.setTextIsSelectable(true);
        return t;
    }

    public static TextView ellipsize(TextView t) {
        t.setSingleLine(true);
        t.setEllipsize(TextUtils.TruncateAt.END);
        return t;
    }

    /** Pill-shaped status label. */
    public static TextView badge(Context c, String s, int color) {
        TextView t = text(c, s.toUpperCase(), 10.5f, color);
        t.setTypeface(MEDIUM);
        t.setLetterSpacing(0.08f);
        t.setPadding(dp(c, 8), dp(c, 3), dp(c, 8), dp(c, 3));
        t.setBackground(round(alpha(color, 0.14f), dp(c, 20), 0, 0));
        return t;
    }

    // ---------- buttons ----------

    public static TextView primaryButton(Context c, String label) {
        TextView b = text(c, label, 15, Color.WHITE);
        b.setTypeface(MEDIUM);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(c, 18), 0, dp(c, 18), 0);
        b.setMinHeight(dp(c, 50));
        b.setBackground(pressable(c, round(ACCENT, dp(c, 12), 0, 0), dp(c, 12)));
        b.setClickable(true);
        b.setFocusable(true);
        return b;
    }

    public static TextView secondaryButton(Context c, String label) {
        TextView b = text(c, label, 15, TEXT);
        b.setTypeface(MEDIUM);
        b.setGravity(Gravity.CENTER);
        b.setPadding(dp(c, 18), 0, dp(c, 18), 0);
        b.setMinHeight(dp(c, 50));
        b.setBackground(pressable(c, round(SURFACE2, dp(c, 12), STROKE, dp(c, 1)), dp(c, 12)));
        b.setClickable(true);
        b.setFocusable(true);
        return b;
    }

    public static TextView dangerButton(Context c, String label) {
        TextView b = secondaryButton(c, label);
        b.setTextColor(DANGER);
        b.setBackground(pressable(c, round(alpha(DANGER, 0.10f), dp(c, 12), alpha(DANGER, 0.35f), dp(c, 1)), dp(c, 12)));
        return b;
    }

    public static TextView linkButton(Context c, String label) {
        TextView b = text(c, label, 13.5f, ACCENT);
        b.setTypeface(MEDIUM);
        b.setPadding(dp(c, 10), dp(c, 8), dp(c, 10), dp(c, 8));
        b.setBackground(pressable(c, round(Color.TRANSPARENT, dp(c, 8), 0, 0), dp(c, 8)));
        b.setClickable(true);
        return b;
    }

    // ---------- icons ----------

    public static ImageView icon(Context c, int res, int color, int sizeDp) {
        ImageView iv = new ImageView(c);
        iv.setImageResource(res);
        iv.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        iv.setLayoutParams(new LinearLayout.LayoutParams(dp(c, sizeDp), dp(c, sizeDp)));
        return iv;
    }

    /** Icon inside a tinted rounded square. */
    public static FrameLayout iconTile(Context c, int res, int color, int sizeDp) {
        FrameLayout f = new FrameLayout(c);
        f.setBackground(round(alpha(color, 0.12f), dp(c, 10), 0, 0));
        ImageView iv = new ImageView(c);
        iv.setImageResource(res);
        iv.setColorFilter(color, PorterDuff.Mode.SRC_IN);
        int inner = Math.round(sizeDp * 0.52f);
        f.addView(iv, new FrameLayout.LayoutParams(dp(c, inner), dp(c, inner), Gravity.CENTER));
        f.setLayoutParams(new LinearLayout.LayoutParams(dp(c, sizeDp), dp(c, sizeDp)));
        return f;
    }

    // ---------- layout ----------

    public static LinearLayout vbox(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    public static LinearLayout hbox(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.HORIZONTAL);
        l.setGravity(Gravity.CENTER_VERTICAL);
        return l;
    }

    public static LinearLayout.LayoutParams lp(int w, int h) {
        return new LinearLayout.LayoutParams(w, h);
    }

    public static LinearLayout.LayoutParams matchWrap() {
        return new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
    }

    public static LinearLayout.LayoutParams weight(float w) {
        return new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, w);
    }

    public static LinearLayout.LayoutParams margins(LinearLayout.LayoutParams p, Context c, int l, int t, int r, int b) {
        p.setMargins(dp(c, l), dp(c, t), dp(c, r), dp(c, b));
        return p;
    }

    public static View divider(Context c) {
        View v = new View(c);
        v.setBackgroundColor(STROKE);
        v.setLayoutParams(new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(c, 1) / 2 + 1)));
        return v;
    }

    public static View space(Context c, int dpH) {
        View v = new View(c);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(c, dpH)));
        return v;
    }

    /**
     * Standard list row: leading icon tile, title + subtitle, optional trailing view, chevron when clickable.
     */
    public static LinearLayout row(Context c, int iconRes, int iconColor, CharSequence title, CharSequence subtitle, View trailing, boolean chevron) {
        LinearLayout r = hbox(c);
        r.setPadding(dp(c, 14), dp(c, 12), dp(c, 12), dp(c, 12));
        r.setMinimumHeight(dp(c, 64));
        if (iconRes != 0) {
            FrameLayout tile = iconTile(c, iconRes, iconColor, 38);
            r.addView(tile);
        }
        LinearLayout texts = vbox(c);
        TextView t = ellipsize(title(c, title, 15));
        texts.addView(t);
        if (subtitle != null && subtitle.length() > 0) {
            TextView s = text(c, subtitle, 12.5f, TEXT2);
            s.setMaxLines(3);
            s.setEllipsize(TextUtils.TruncateAt.END);
            s.setPadding(0, dp(c, 2), 0, 0);
            texts.addView(s);
        }
        LinearLayout.LayoutParams tp = weight(1);
        tp.setMargins(iconRes != 0 ? dp(c, 14) : 0, 0, dp(c, 8), 0);
        r.addView(texts, tp);
        if (trailing != null) r.addView(trailing);
        if (chevron) {
            ImageView ch = icon(c, R.drawable.ic_chevron, TEXT3, 20);
            r.addView(ch);
        }
        return r;
    }

    /** A card containing rows separated by hairlines. */
    public static LinearLayout group(Context c) {
        LinearLayout g = vbox(c);
        card(g);
        g.setClipToOutline(true);
        return g;
    }

    public static void addToGroup(LinearLayout group, View row) {
        Context c = group.getContext();
        if (group.getChildCount() > 0) {
            View d = divider(c);
            LinearLayout.LayoutParams p = (LinearLayout.LayoutParams) d.getLayoutParams();
            p.setMargins(dp(c, 14), 0, 0, 0);
            group.addView(d, p);
        }
        group.addView(row, matchWrap());
    }

    public static void clickableRow(View row, View.OnClickListener l) {
        row.setBackground(pressable(row.getContext(), new GradientDrawable(), 0));
        row.setClickable(true);
        row.setFocusable(true);
        row.setOnClickListener(l);
    }

    /** Key / value line used in detail reports. */
    public static LinearLayout kv(Context c, String key, CharSequence value, boolean mono) {
        LinearLayout r = hbox(c);
        r.setGravity(Gravity.TOP);
        r.setPadding(dp(c, 14), dp(c, 10), dp(c, 14), dp(c, 10));
        TextView k = text(c, key, 13, TEXT2);
        r.addView(k, margins(lp(dp(c, 118), ViewGroup.LayoutParams.WRAP_CONTENT), c, 0, 0, 10, 0));
        TextView v = mono ? mono(c, value, 12, TEXT) : text(c, value, 13.5f, TEXT);
        v.setTextIsSelectable(true);
        r.addView(v, weight(1));
        return r;
    }

    public static void statusBar(Activity a) {
        a.getWindow().setStatusBarColor(BG);
        a.getWindow().setNavigationBarColor(BG);
    }

    public static String plural(int n, String one, String many) {
        return n + " " + (n > 1 ? many : one);
    }
}
