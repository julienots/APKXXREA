package com.superessence.musicmetric.screens;

import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.superessence.musicmetric.MainActivity;
import com.superessence.musicmetric.audio.AudioData;
import com.superessence.musicmetric.audio.Biquad;
import com.superessence.musicmetric.audio.Dsp;
import com.superessence.musicmetric.audio.Progress;
import com.superessence.musicmetric.ui.Icon;
import com.superessence.musicmetric.ui.Slider;
import com.superessence.musicmetric.ui.T;

import java.util.Locale;

/** One-tap transformations (slowed, speed up, motivation, 8D…) and a full manual effect rack. */
public final class FxScreen extends Screen {
    Slider sSpeed, sTempo, sPitch, sReverb, sRoom, sEcho, sEchoMs, sBass, sMid, sTreble, sWidth, s8d, sSat, sLofi, sComp;

    public FxScreen(MainActivity a) { super(a); }

    static final String[][] PRESETS = {
        {"Slowed + Reverb", "Ralenti, grave, réverbe"}, {"Speed Up", "Plus rapide, plus aigu"}, {"Nightcore", "Très rapide & brillant"},
        {"Motivation", "Basses, punch, énergie"}, {"8D Audio", "Le son tourne autour de toi"}, {"Lo-fi", "Cassette, vinyle, doux"},
        {"Bass Boost", "Basses profondes"}, {"Vaporwave", "Lent, chorus, rêveur"}, {"Phonk Drift", "Saturé & lourd"},
        {"Salle de concert", "Grande réverbe live"}, {"Stade", "Énorme & large"}, {"Dark", "Plus grave & sombre"},
        {"Sous l'eau", "Étouffé, flottant"}, {"Téléphone", "Voix de combiné"}, {"Radio vintage", "Années 50"}, {"Écho", "Échos ping-pong"},
    };

    static final int[] PRESET_ICONS = {Icon.SPEED, Icon.BOLT, Icon.BOLT, Icon.BOLT, Icon.HEADPHONES, Icon.NOTE, Icon.VOL_UP, Icon.WAVE, Icon.DRUM,
            Icon.LAYERS, Icon.LAYERS, Icon.KEY, Icon.WAVE, Icon.MIC, Icon.NOTE, Icon.LOOP};

    @Override public View build() {
        LinearLayout col = page("Effets", "Transforme ta musique en un geste : slowed, speed, motivation, 8D, reverb… ou règle tout à la main.");
        LinearLayout pc = T.card(a, "Transformations", "Appliquées à la piste en cours. Annule à tout moment depuis le Studio.");
        View[] tiles = new View[PRESETS.length];
        for (int i = 0; i < PRESETS.length; i++) tiles[i] = preset(i);
        pc.addView(T.grid(a, tiles, 2), T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 0));
        T.addCard(col, pc);

        LinearLayout man = T.card(a, "Réglages manuels", "Compose ta propre chaîne d'effets puis applique-la.");
        man.addView(T.label(a, "Vitesse & hauteur"));
        man.addView(sSpeed = new Slider(a, "Vitesse (hauteur suit)", 0.5f, 2f, 0.01f, 1f, mult()));
        man.addView(sTempo = new Slider(a, "Tempo (hauteur conservée)", 0.5f, 2f, 0.01f, 1f, mult()));
        man.addView(sPitch = new Slider(a, "Hauteur (demi-tons)", -12, 12, 1, 0, signed("")));
        man.addView(T.label(a, "Espace"));
        man.addView(sReverb = new Slider(a, "Réverbération", 0, 100, 1, 0, pct()));
        man.addView(sRoom = new Slider(a, "Taille de la salle", 0, 100, 1, 60, pct()));
        man.addView(sEcho = new Slider(a, "Écho", 0, 100, 1, 0, pct()));
        man.addView(sEchoMs = new Slider(a, "Délai de l'écho", 60, 900, 10, 350, new Slider.Format() { public String format(float v) { return Math.round(v) + " ms"; } }));
        man.addView(sWidth = new Slider(a, "Largeur stéréo", 0, 200, 5, 100, pct()));
        man.addView(s8d = new Slider(a, "Rotation 8D", 0, 100, 1, 0, new Slider.Format() { public String format(float v) { return v == 0 ? "Off" : Math.round(v) + " %"; } }));
        man.addView(T.label(a, "Égaliseur"));
        man.addView(sBass = new Slider(a, "Basses", -12, 15, 0.5f, 0, signed(" dB")));
        man.addView(sMid = new Slider(a, "Médiums", -12, 12, 0.5f, 0, signed(" dB")));
        man.addView(sTreble = new Slider(a, "Aigus", -12, 12, 0.5f, 0, signed(" dB")));
        man.addView(T.label(a, "Couleur"));
        man.addView(sSat = new Slider(a, "Saturation", 0, 100, 1, 0, pct()));
        man.addView(sLofi = new Slider(a, "Lo-fi", 0, 100, 1, 0, pct()));
        man.addView(sComp = new Slider(a, "Compression / punch", 0, 100, 1, 0, pct()));
        LinearLayout r = T.row(a);
        r.addView(T.button(a, "Réinitialiser", Icon.UNDO, false, click(new Runnable() { public void run() { resetSliders(); } })), T.lpw(1));
        r.addView(new View(a), T.lp(T.dp(10), 1));
        r.addView(T.button(a, "Appliquer", Icon.CHECK, true, click(new Runnable() { public void run() { applyManual(); } })), T.lpw(1.3f));
        man.addView(r, T.margins(T.lp(T.MATCH, T.WRAP), 0, 14, 0, 0));
        T.addCard(col, man);
        return col;
    }

    View preset(final int i) {
        LinearLayout t = T.col(a); t.setBackground(T.ripple(T.round(T.SURFACE2, 18, T.STROKE, 1), 0x33FFC928));
        t.setPadding(T.dp(14), T.dp(14), T.dp(14), T.dp(14));
        LinearLayout head = T.row(a);
        LinearLayout ic = T.row(a); ic.setGravity(Gravity.CENTER); ic.setBackground(T.round(T.Y_SOFT, 12));
        ic.addView(new Icon(a, PRESET_ICONS[i], T.Y), T.lp(T.dp(18), T.dp(18)));
        head.addView(ic, T.lp(T.dp(34), T.dp(34)));
        t.addView(head);
        TextView n = T.text(a, PRESETS[i][0], 15, T.WHITE, T.BLACK); n.setMaxLines(1);
        t.addView(n, T.margins(T.lp(T.WRAP, T.WRAP), 0, 12, 0, 4));
        TextView d = T.text(a, PRESETS[i][1], 12, T.TEXT2, T.REGULAR); d.setMaxLines(2);
        t.addView(d);
        t.setOnClickListener(click(new Runnable() { public void run() { applyPreset(i); } }));
        return t;
    }

    static Slider.Format mult() { return new Slider.Format() { public String format(float v) { return String.format(Locale.FRANCE, "×%.2f", v); } }; }
    static Slider.Format pct() { return new Slider.Format() { public String format(float v) { return Math.round(v) + " %"; } }; }
    static Slider.Format signed(final String unit) {
        return new Slider.Format() { public String format(float v) { return (v > 0 ? "+" : "") + (v == Math.round(v) ? String.valueOf(Math.round(v)) : String.format(Locale.FRANCE, "%.1f", v)) + unit; } };
    }

    void resetSliders() {
        Slider[] all = {sSpeed, sTempo, sPitch, sReverb, sRoom, sEcho, sEchoMs, sBass, sMid, sTreble, sWidth, s8d, sSat, sLofi, sComp};
        for (Slider s : all) s.reset();
    }

    void applyPreset(final int i) {
        if (!a.requireTrack()) return;
        final String suffix = PRESETS[i][0];
        String base = a.trackName();
        a.run(PRESETS[i][0], base.contains(" · ") ? base : base + " · " + suffix, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData t = a.track(); AudioData o;
            switch (i) {
                case 0: o = Dsp.speed(t, 0.82, new Progress.Sub(p, 0, 0.2f)); o = Dsp.bassBoost(o, 3);
                    o = Dsp.reverb(o, 0.8, 0.45, 0.42, 1, 30, new Progress.Sub(p, 0.2f, 1)); break;
                case 1: o = Dsp.speed(t, 1.18, p); break;
                case 2: o = Dsp.speed(t, 1.3, p); o = Dsp.eq(o, 1, 0, 2.5); break;
                case 3: { // motivation: tight low end, punch, width, small lift in tempo
                    o = Dsp.tempo(t, 1.06, new Progress.Sub(p, 0, 0.5f));
                    o = Dsp.bassBoost(o, 5); o = Dsp.eq(o, 0, -1, 3);
                    o = Dsp.compress(o, -18, 3.5, 6, 120, 4); o = Dsp.width(o, 1.3);
                    o = Dsp.reverb(o, 0.4, 0.5, 0.1, 1, 10, new Progress.Sub(p, 0.5f, 1)); break; }
                case 4: o = Dsp.eightD(t, 0.13, p); break;
                case 5: o = Dsp.speed(t, 0.94, Progress.NONE); o = Dsp.lofi(o, 0.7, 11); o = Dsp.reverb(o, 0.5, 0.7, 0.18, 0.8, 10, p); break;
                case 6: o = Dsp.bassBoost(t, 9); break;
                case 7: o = Dsp.speed(t, 0.78, Progress.NONE); o = Dsp.chorus(o, 4, 0.25, 0.5); o = Dsp.reverb(o, 0.85, 0.3, 0.45, 1, 40, p); break;
                case 8: o = Dsp.bassBoost(t, 6); o = Dsp.saturate(o, 0.45); o = Dsp.compress(o, -16, 4, 3, 80, 3); break;
                case 9: o = Dsp.reverb(t, 0.85, 0.35, 0.38, 1, 35, p); break;
                case 10: o = Dsp.width(t, 1.6); o = Dsp.echo(o, 140, 0.25, 0.25, true); o = Dsp.reverb(o, 0.97, 0.2, 0.45, 1, 60, p); break;
                case 11: o = Dsp.pitch(t, -2, new Progress.Sub(p, 0, 0.7f)); Dsp.filter(o, Biquad.highShelf(5000, -6)); o = Dsp.reverb(o, 0.7, 0.7, 0.25, 1, 20, new Progress.Sub(p, 0.7f, 1)); break;
                case 12: o = Dsp.underwater(t); break;
                case 13: o = Dsp.telephone(t); break;
                case 14: o = Dsp.radio(t); break;
                default: o = Dsp.echo(t, 375, 0.45, 0.45, true); break;
            }
            return Dsp.master(o);
        } });
    }

    void applyManual() {
        if (!a.requireTrack()) return;
        final float speed = sSpeed.value(), tempo = sTempo.value(), pitch = sPitch.value(), rev = sReverb.value() / 100f, room = sRoom.value() / 100f,
                echo = sEcho.value() / 100f, echoMs = sEchoMs.value(), bass = sBass.value(), mid = sMid.value(), treble = sTreble.value(),
                width = sWidth.value() / 100f, rot = s8d.value() / 100f, sat = sSat.value() / 100f, lofi = sLofi.value() / 100f, comp = sComp.value() / 100f;
        a.run("Effets personnalisés", null, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData o = a.track();
            if (Math.abs(tempo - 1) > 0.005) { p.set(0, "Tempo…"); o = Dsp.tempo(o, tempo, new Progress.Sub(p, 0, 0.3f)); }
            if (Math.abs(pitch) > 0.01) { p.set(0.3f, "Hauteur…"); o = Dsp.pitch(o, pitch, new Progress.Sub(p, 0.3f, 0.5f)); }
            if (Math.abs(speed - 1) > 0.005) o = Dsp.speed(o, speed, Progress.NONE);
            p.set(0.5f, "Égaliseur…");
            if (bass != 0 || mid != 0 || treble != 0) o = Dsp.eq(o, bass, mid, treble);
            if (sat > 0) o = Dsp.saturate(o, sat);
            if (lofi > 0) o = Dsp.lofi(o, lofi, 3);
            if (comp > 0) o = Dsp.compress(o, -10 - comp * 16, 1.5 + comp * 4, 6, 120, comp * 5);
            if (Math.abs(width - 1) > 0.01) o = Dsp.width(o, width);
            if (rot > 0) { p.set(0.6f, "8D…"); o = Dsp.eightD(o, 0.05 + rot * 0.25, new Progress.Sub(p, 0.6f, 0.75f)); }
            if (echo > 0) o = Dsp.echo(o, echoMs, 0.2 + echo * 0.5, echo * 0.7, true);
            if (rev > 0) { p.set(0.8f, "Réverbération…"); o = Dsp.reverb(o, room, 0.45, rev * 0.6, 1, 20, new Progress.Sub(p, 0.8f, 1)); }
            if (o == a.track()) o = o.copy();
            return Dsp.master(o);
        } });
    }
}
