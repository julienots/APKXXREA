package com.superessence.musicmetric.screens;

import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.superessence.musicmetric.MainActivity;
import com.superessence.musicmetric.audio.Analysis;
import com.superessence.musicmetric.audio.AudioData;
import com.superessence.musicmetric.audio.Dsp;
import com.superessence.musicmetric.audio.Progress;
import com.superessence.musicmetric.audio.Vocal;
import com.superessence.musicmetric.ui.Icon;
import com.superessence.musicmetric.ui.Slider;
import com.superessence.musicmetric.ui.T;

/** Vocal regeneration: separation, correction, studio polish, transformations, recording. */
public final class VoiceScreen extends Screen {
    T.Chips keyChips, modeChips; Slider sTune, sLevel, sRetune, sVoicePitch; TextView keyInfo;

    public VoiceScreen(MainActivity a) { super(a); }

    static String[] keys() {
        String[] k = new String[13]; k[0] = "Auto"; for (int i = 0; i < 12; i++) k[i + 1] = Analysis.NOTES[i]; return k;
    }

    @Override public View build() {
        LinearLayout col = page("Voix", "Régénère une voix propre et juste : séparation, correction de hauteur, débruitage et traitement studio.");

        LinearLayout perfect = T.card(a, "Voix parfaite", "Sépare la voix, la nettoie, corrige sa justesse dans la tonalité du morceau, lui donne un son studio puis la remixe sur l'instru.");
        perfect.addView(sTune = new Slider(a, "Correction de justesse", 0, 100, 1, 60, FxScreen.pct()));
        perfect.addView(sLevel = new Slider(a, "Volume de la voix", 50, 200, 5, 115, FxScreen.pct()));
        keyInfo = T.text(a, "Tonalité : détection…", 12, T.TEXT3, T.MEDIUM);
        perfect.addView(keyInfo, T.margins(T.lp(T.WRAP, T.WRAP), 0, 2, 0, 12));
        perfect.addView(T.button(a, "Régénérer la voix", Icon.BOLT, true, click(new Runnable() { public void run() { perfect(); } })), T.lp(T.MATCH, T.WRAP));
        T.addCard(col, perfect);

        LinearLayout sep = T.card(a, "Séparer", "Fonctionne sur les morceaux stéréo où la voix est au centre (la grande majorité des musiques).");
        sep.addView(T.grid(a, new View[]{
            T.tile(a, "Isoler la voix\n(a cappella)", Icon.MIC, click(new Runnable() { public void run() { isolate(); } })),
            T.tile(a, "Retirer la voix\n(instrumental)", Icon.NOTE, click(new Runnable() { public void run() { karaoke(); } })),
        }, 2), T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 0));
        T.addCard(col, sep);

        LinearLayout fix = T.card(a, "Corriger", "Idéal sur une voix seule (isolée ou enregistrée au micro).");
        fix.addView(T.label(a, "Tonalité de la correction"));
        keyChips = new T.Chips(a, keys(), 0, false); fix.addView(keyChips.view);
        modeChips = new T.Chips(a, new String[]{"Mineur", "Majeur", "Chromatique"}, 0, false);
        fix.addView(modeChips.view, T.margins(T.lp(T.MATCH, T.WRAP), 0, 8, 0, 4));
        fix.addView(sRetune = new Slider(a, "Vitesse de correction", 0, 100, 1, 55, new Slider.Format() {
            public String format(float v) { return v > 90 ? "Robotique" : v > 60 ? "Rapide" : v > 30 ? "Naturelle" : "Douce"; } }));
        fix.addView(T.grid(a, new View[]{
            T.tile(a, "Auto-tune", Icon.KEY, click(new Runnable() { public void run() { autotune(); } })),
            T.tile(a, "Débruiter", Icon.WAVE, click(new Runnable() { public void run() { denoise(); } })),
            T.tile(a, "Son studio", Icon.HEADPHONES, click(new Runnable() { public void run() { enhance(); } })),
        }, 3), T.margins(T.lp(T.MATCH, T.WRAP), 0, 10, 0, 0));
        T.addCard(col, fix);

        LinearLayout tr = T.card(a, "Transformer", null);
        tr.addView(T.grid(a, new View[]{
            T.tile(a, "Harmonies", Icon.LAYERS, click(new Runnable() { public void run() { harmonize(); } })),
            T.tile(a, "Doubler", Icon.COPY, click(new Runnable() { public void run() { doubler(); } })),
            T.tile(a, "Robot", Icon.BOLT, click(new Runnable() { public void run() { robot(); } })),
        }, 3), T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 6));
        tr.addView(sVoicePitch = new Slider(a, "Hauteur de la voix", -12, 12, 1, -4, FxScreen.signed(" demi-tons")));
        tr.addView(T.button(a, "Changer la hauteur de voix", Icon.SPEED, false, click(new Runnable() { public void run() { voicePitch(); } })), T.lp(T.MATCH, T.WRAP));
        T.addCard(col, tr);

        LinearLayout rec = T.card(a, "Enregistrer", "Enregistre ta voix seule, ou chante directement sur la musique en cours (avec des écouteurs).");
        LinearLayout r = T.row(a);
        r.addView(T.button(a, "Voix seule", Icon.MIC, false, click(new Runnable() { public void run() {
            a.record(false, new MainActivity.AudioCallback() { public void onAudio(AudioData d, String n) { a.setTrack(d, n, true); } });
        } })), T.lpw(1));
        r.addView(new View(a), T.lp(T.dp(10), 1));
        r.addView(T.button(a, "Sur la musique", Icon.HEADPHONES, true, click(new Runnable() { public void run() {
            if (!a.requireTrack()) return;
            a.record(true, new MainActivity.AudioCallback() { public void onAudio(AudioData d, String n) { a.setTrack(d, n, true); } });
        } })), T.lpw(1));
        rec.addView(r, T.margins(T.lp(T.MATCH, T.WRAP), 0, 14, 0, 0));
        T.addCard(col, rec);
        onInfo();
        return col;
    }

    @Override public void onInfo() {
        if (keyInfo == null) return;
        Analysis.Result r = a.info();
        keyInfo.setText(r == null ? (a.track() == null ? "Tonalité : importe une musique" : "Tonalité : détection…") : "Tonalité détectée : " + r.keyName() + " (" + r.keyShort() + ")");
    }

    @Override public void onTrackChanged() { onInfo(); }

    boolean stereoCheck() {
        if (!a.requireTrack()) return false;
        if (a.track().isMono()) { a.error("Cette piste est en mono : la voix ne peut pas être séparée du reste. Utilise un fichier stéréo."); return false; }
        return true;
    }

    void perfect() {
        if (!stereoCheck()) return;
        final float tune = sTune.value() / 100f, level = sLevel.value() / 100f;
        a.run("Voix parfaite", a.trackName() + " · voix parfaite", new MainActivity.Job() { public AudioData run(Progress p) {
            Analysis.Result r = a.ensureInfo(a.track(), Progress.NONE);
            return Vocal.perfectVoice(a.track(), r.keyRoot, r.minor, tune, level, p);
        } });
    }

    void isolate() {
        if (!stereoCheck()) return;
        a.run("Voix isolée", a.trackName() + " · a cappella", new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData v = Vocal.isolate(a.track(), 0.6f, new Progress.Sub(p, 0, 0.8f));
            p.set(0.8f, "Nettoyage…");
            v = Vocal.denoise(v, 0.35f, new Progress.Sub(p, 0.8f, 1f));
            v.normalize(0.9f); return v;
        } });
    }

    void karaoke() {
        if (!stereoCheck()) return;
        a.run("Instrumental", a.trackName() + " · instru", new MainActivity.Job() { public AudioData run(Progress p) {
            return Dsp.master(Vocal.removeVocals(a.track(), 1f, p));
        } });
    }

    int keyRoot() {
        int k = keyChips.selected();
        if (modeChips.selected() == 2) return -1;
        if (k > 0) return k - 1;
        Analysis.Result r = a.info(); return r != null ? r.keyRoot : -1;
    }

    void autotune() {
        if (!a.requireTrack()) return;
        final int sel = keyChips.selected(); final int mode = modeChips.selected(); final float speed = sRetune.value() / 100f;
        a.run("Auto-tune", null, new MainActivity.Job() { public AudioData run(Progress p) {
            int root = -1; boolean minor = mode == 0;
            if (mode != 2) {
                if (sel > 0) root = sel - 1;
                else { Analysis.Result r = a.ensureInfo(a.track(), Progress.NONE); root = r.keyRoot; minor = r.minor; }
            }
            return Vocal.autotune(a.track(), root, minor, speed, p);
        } });
    }

    void denoise() {
        if (!a.requireTrack()) return;
        a.run("Débruitage", null, new MainActivity.Job() { public AudioData run(Progress p) { return Vocal.denoise(a.track(), 0.6f, p); } });
    }

    void enhance() {
        if (!a.requireTrack()) return;
        a.run("Son studio", null, new MainActivity.Job() { public AudioData run(Progress p) { return Vocal.enhance(a.track(), 1f, p); } });
    }

    void harmonize() {
        if (!a.requireTrack()) return;
        a.run("Harmonies", null, new MainActivity.Job() { public AudioData run(Progress p) {
            Analysis.Result r = a.ensureInfo(a.track(), Progress.NONE);
            return Vocal.harmonize(a.track(), r.minor, p);
        } });
    }

    void doubler() {
        if (!a.requireTrack()) return;
        a.run("Doublage", null, new MainActivity.Job() { public AudioData run(Progress p) { return Vocal.doubler(a.track()); } });
    }

    void robot() {
        if (!a.requireTrack()) return;
        a.run("Voix robot", null, new MainActivity.Job() { public AudioData run(Progress p) { return Dsp.master(Vocal.robot(a.track(), 55)); } });
    }

    void voicePitch() {
        if (!a.requireTrack()) return;
        final float st = sVoicePitch.value();
        a.run("Hauteur de voix", null, new MainActivity.Job() { public AudioData run(Progress p) { return Dsp.pitch(a.track(), st, p); } });
    }
}
