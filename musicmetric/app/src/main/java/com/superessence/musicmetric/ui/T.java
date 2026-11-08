package com.superessence.musicmetric.ui;

import android.content.Context;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.Drawable;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/** Design system: colours, type, and factory methods for every recurring widget. */
public final class T {
    private T() { }

    public static final int BG = 0xFF000000, SURFACE = 0xFF0F0F11, SURFACE2 = 0xFF18181B, SURFACE3 = 0xFF222226, STROKE = 0xFF2A2A2F;
    public static final int Y = 0xFFF2F2F2, Y_DARK = 0xFFB8B8BE, Y_SOFT = 0x22FFFFFF, WHITE = 0xFFFFFFFF, TEXT2 = 0xFFA1A1AA, TEXT3 = 0xFF6B6B73, RED = 0xFFFF5A5F, GREEN = 0xFF3DDC97;

    /** Corner radius of every control: square look, just softened. */
    public static final float RADIUS = 4;

    public static Typeface BLACK, BOLD, MEDIUM, REGULAR;
    static float density = 3;

    public static void init(Context c) {
        density = c.getResources().getDisplayMetrics().density;
        BLACK = Typeface.create("sans-serif-black", Typeface.NORMAL);
        BOLD = Typeface.create("sans-serif", Typeface.BOLD);
        MEDIUM = Typeface.create("sans-serif-medium", Typeface.NORMAL);
        REGULAR = Typeface.create("sans-serif", Typeface.NORMAL);
    }

    public static int dp(float v) { return Math.round(v * density); }
    public static float dpf(float v) { return v * density; }

    public static GradientDrawable round(int color, float radiusDp) {
        GradientDrawable g = new GradientDrawable(); g.setColor(color); g.setCornerRadius(dpf(radiusDp)); return g;
    }

    public static GradientDrawable round(int color, float radiusDp, int stroke, float strokeDp) {
        GradientDrawable g = round(color, radiusDp); g.setStroke(Math.max(1, dp(strokeDp)), stroke); return g;
    }

    public static Drawable ripple(Drawable content, int rippleColor) {
        return new RippleDrawable(ColorStateList.valueOf(rippleColor), content, null);
    }

    public static TextView text(Context c, String s, float sp, int color, Typeface tf) {
        TextView t = new TextView(c); t.setText(s); t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp); t.setTextColor(color); t.setTypeface(tf);
        t.setIncludeFontPadding(false); return t;
    }

    /** "Music" white + "Metric" yellow — the brand wordmark, styled like SuperEssence. */
    public static CharSequence brand(String a, String b) {
        SpannableString s = new SpannableString(a + b);
        s.setSpan(new ForegroundColorSpan(WHITE), 0, a.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        s.setSpan(new ForegroundColorSpan(0xFF8E8E96), a.length(), a.length() + b.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    public static LinearLayout col(Context c) { LinearLayout l = new LinearLayout(c); l.setOrientation(LinearLayout.VERTICAL); return l; }
    public static LinearLayout row(Context c) { LinearLayout l = new LinearLayout(c); l.setOrientation(LinearLayout.HORIZONTAL); l.setGravity(Gravity.CENTER_VERTICAL); return l; }

    public static LinearLayout.LayoutParams lp(int w, int h) { return new LinearLayout.LayoutParams(w, h); }
    public static LinearLayout.LayoutParams lpw(float weight) { LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT); p.weight = weight; return p; }
    public static final int MATCH = ViewGroup.LayoutParams.MATCH_PARENT, WRAP = ViewGroup.LayoutParams.WRAP_CONTENT;

    public static LinearLayout.LayoutParams margins(LinearLayout.LayoutParams p, int l, int t, int r, int b) {
        p.setMargins(dp(l), dp(t), dp(r), dp(b)); return p;
    }

    /** Rounded surface card with title + optional subtitle. Returns the card; add children to it. */
    public static LinearLayout card(Context c, String title, String sub) {
        LinearLayout card = col(c);
        card.setBackground(round(SURFACE, 8, STROKE, 1));
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        if (title != null) {
            LinearLayout head = row(c);
            View bar = new View(c); bar.setBackground(round(Y, 0));
            head.addView(bar, margins(lp(dp(4), dp(18)), 0, 0, 10, 0));
            head.addView(text(c, title, 18, WHITE, BLACK));
            card.addView(head);
            if (sub != null) {
                TextView s = text(c, sub, 13, TEXT2, REGULAR); s.setLineSpacing(0, 1.15f);
                card.addView(s, margins(lp(MATCH, WRAP), 0, 8, 0, 4));
            }
        }
        return card;
    }

    public static void addCard(LinearLayout parent, View card) {
        parent.addView(card, margins(lp(MATCH, WRAP), 16, 0, 16, 14));
    }

    public static TextView label(Context c, String s) {
        TextView t = text(c, s.toUpperCase(), 11, TEXT3, BOLD); t.setLetterSpacing(0.12f);
        t.setPadding(0, dp(14), 0, dp(8)); return t;
    }

    /** Primary (yellow) or secondary (dark) pill button, optional leading icon. */
    public static LinearLayout button(Context c, String s, int icon, boolean primary, View.OnClickListener l) {
        LinearLayout b = row(c); b.setGravity(Gravity.CENTER);
        int bg = primary ? Y : SURFACE3, fg = primary ? 0xFF111111 : WHITE;
        b.setBackground(ripple(primary ? round(Y, RADIUS) : round(SURFACE2, RADIUS, 0xFF3A3A40, 1), primary ? 0x33000000 : 0x22FFFFFF));
        b.setPadding(dp(16), 0, dp(16), 0); b.setMinimumHeight(dp(50));
        if (icon >= 0) { Icon ic = new Icon(c, icon, fg); b.addView(ic, margins(lp(dp(20), dp(20)), 0, 0, 8, 0)); }
        TextView t = text(c, s, 15, fg, BOLD); t.setGravity(Gravity.CENTER); b.addView(t);
        b.setClickable(true); b.setFocusable(true); b.setOnClickListener(l);
        return b;
    }

    public static GradientDrawable gradientY() {
        return round(Y, RADIUS);
    }

    public static GradientDrawable gradientCircle() {
        return round(Y, RADIUS);
    }

    /** Compact tool tile: icon on top, label below. */
    public static LinearLayout tile(Context c, String s, int icon, View.OnClickListener l) {
        LinearLayout b = col(c); b.setGravity(Gravity.CENTER);
        b.setBackground(ripple(round(SURFACE2, RADIUS, STROKE, 1), 0x22FFFFFF));
        b.setPadding(dp(6), dp(12), dp(6), dp(12));
        Icon ic = new Icon(c, icon, Y); b.addView(ic, lp(dp(24), dp(24)));
        TextView t = text(c, s, 11.5f, WHITE, MEDIUM); t.setGravity(Gravity.CENTER); t.setMaxLines(2); t.setBreakStrategy(android.text.Layout.BREAK_STRATEGY_SIMPLE); t.setHyphenationFrequency(android.text.Layout.HYPHENATION_FREQUENCY_NONE);
        b.addView(t, margins(lp(WRAP, WRAP), 0, 8, 0, 0));
        b.setClickable(true); b.setOnClickListener(l);
        return b;
    }

    /** Grid of tiles, `cols` per row. */
    public static LinearLayout grid(Context c, View[] items, int cols) {
        LinearLayout g = col(c);
        for (int i = 0; i < items.length; i += cols) {
            LinearLayout r = row(c); r.setGravity(Gravity.TOP);
            for (int k = 0; k < cols; k++) {
                LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT); p.weight = 1;
                p.setMargins(k == 0 ? 0 : dp(5), 0, k == cols - 1 ? 0 : dp(5), 0);
                if (i + k < items.length) r.addView(items[i + k], p); else r.addView(new View(c), p);
            }
            g.addView(r, margins(lp(MATCH, WRAP), 0, i == 0 ? 0 : 10, 0, 0));
        }
        return g;
    }

    /** A single-choice (or multi-choice) row of chips, horizontally scrollable. */
    public static final class Chips {
        public final HorizontalScrollView view; final List<TextView> chips = new ArrayList<TextView>(); final boolean multi;
        int selected = -1; final boolean[] sel; Listener listener;
        public interface Listener { void onChange(int index); }

        public Chips(Context c, String[] items, int initial, boolean multi) {
            this.multi = multi; sel = new boolean[items.length];
            view = new HorizontalScrollView(c); view.setHorizontalScrollBarEnabled(false); view.setOverScrollMode(View.OVER_SCROLL_NEVER);
            LinearLayout r = row(c); view.addView(r);
            for (int i = 0; i < items.length; i++) {
                final int idx = i;
                TextView t = text(c, items[i], 13, WHITE, MEDIUM); t.setGravity(Gravity.CENTER);
                t.setPadding(dp(14), dp(9), dp(14), dp(9));
                t.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { toggle(idx); } });
                r.addView(t, margins(lp(WRAP, WRAP), 0, 0, 8, 0));
                chips.add(t);
            }
            if (initial >= 0 && initial < items.length) { if (multi) sel[initial] = true; selected = initial; }
            refresh();
        }

        void toggle(int i) {
            if (multi) sel[i] = !sel[i]; else selected = i;
            refresh(); if (listener != null) listener.onChange(i);
        }

        public void select(int i) { if (multi) sel[i] = true; else selected = i; refresh(); }
        public void setMulti(int i, boolean on) { sel[i] = on; refresh(); }
        public int selected() { return selected; }
        public boolean isOn(int i) { return multi ? sel[i] : selected == i; }
        public boolean[] states() { return sel.clone(); }
        public Chips onChange(Listener l) { listener = l; return this; }

        void refresh() {
            for (int i = 0; i < chips.size(); i++) {
                boolean on = isOn(i); TextView t = chips.get(i);
                t.setBackground(on ? round(Y, RADIUS) : round(SURFACE2, RADIUS, STROKE, 1));
                t.setTextColor(on ? 0xFF111111 : WHITE); t.setTypeface(on ? BOLD : MEDIUM);
            }
        }
    }

    /** Small key/value stat pill (e.g. "BPM 128"). */
    public static LinearLayout stat(Context c, String k, String v) {
        LinearLayout s = col(c); s.setBackground(round(SURFACE2, RADIUS, STROKE, 1)); s.setPadding(dp(12), dp(10), dp(12), dp(10));
        s.addView(text(c, k.toUpperCase(), 10, TEXT3, BOLD));
        TextView vt = text(c, v, 16, WHITE, BLACK); vt.setTag("v");
        s.addView(vt, margins(lp(WRAP, WRAP), 0, 4, 0, 0));
        return s;
    }

    public static void setStat(View stat, String v) { TextView t = (TextView) stat.findViewWithTag("v"); if (t != null) t.setText(v); }

    public static View divider(Context c) { View v = new View(c); v.setBackgroundColor(STROKE); v.setLayoutParams(margins(lp(MATCH, 1), 0, 12, 0, 12)); return v; }

    public static int alpha(int color, float a) { return Color.argb((int) (a * 255), Color.red(color), Color.green(color), Color.blue(color)); }
}
