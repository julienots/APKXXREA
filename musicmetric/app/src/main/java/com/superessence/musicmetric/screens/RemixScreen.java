package com.superessence.musicmetric.screens;

import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.superessence.musicmetric.MainActivity;
import com.superessence.musicmetric.audio.Analysis;
import com.superessence.musicmetric.audio.AudioData;
import com.superessence.musicmetric.audio.Drums;
import com.superessence.musicmetric.audio.Dsp;
import com.superessence.musicmetric.audio.Progress;
import com.superessence.musicmetric.audio.Remix;
import com.superessence.musicmetric.ui.Icon;
import com.superessence.musicmetric.ui.Slider;
import com.superessence.musicmetric.ui.T;

/** Extend, recompose, add instruments, mash-up, change tempo / key. */
public final class RemixScreen extends Screen {
    T.Chips extChips, recChips, layerChips, drumChips, keyChips; Slider sLevel, sMix, sBpm; TextView info; int variant = 0; long seed = 1;
    AudioData second; String secondName; TextView secondLabel; boolean syncTempo = true;
    volatile AudioData remixSource, lastRemix; volatile Analysis.Result remixInfo;

    public RemixScreen(MainActivity a) { super(a); }

    static final String[] EXT = {"+30 s", "+1 min", "+2 min", "×2", "×3"};

    @Override public View build() {
        LinearLayout col = page("Remix", "Rallonge, recompose et enrichis ta musique en restant toujours dans le tempo et la tonalité.");
        info = T.text(a, "", 13, T.Y, T.BOLD);
        col.addView(info, T.margins(T.lp(T.WRAP, T.WRAP), 20, 0, 20, 12));

        LinearLayout ext = T.card(a, "Rallonger", "Trouve la phrase musicale qui boucle le plus parfaitement et la répète, coupée sur les temps : la musique dure plus longtemps, sans coupure audible.");
        extChips = new T.Chips(a, EXT, 1, false);
        ext.addView(extChips.view, T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 12));
        LinearLayout er = T.row(a);
        er.addView(T.button(a, "Rallonger", Icon.EXTEND, true, click(new Runnable() { public void run() { variant = 0; extend(); } })), T.lpw(1.3f));
        er.addView(new View(a), T.lp(T.dp(10), 1));
        er.addView(T.button(a, "Variante", Icon.LOOP, false, click(new Runnable() { public void run() { variant++; extend(); } })), T.lpw(1));
        ext.addView(er);
        T.addCard(col, ext);

        LinearLayout rec = T.card(a, "Recomposer", "Redécoupe la musique sur ses temps et la réassemble autrement.");
        recChips = new T.Chips(a, Remix.RECOMPOSE, 0, false);
        rec.addView(recChips.view, T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 12));
        LinearLayout rr = T.row(a);
        rr.addView(T.button(a, "Recomposer", Icon.SHUFFLE, true, click(new Runnable() { public void run() { recompose(); } })), T.lpw(1.3f));
        rr.addView(new View(a), T.lp(T.dp(10), 1));
        rr.addView(T.button(a, "Variante", Icon.LOOP, false, click(new Runnable() { public void run() { seed++; recompose(); } })), T.lpw(1));
        rec.addView(rr);
        T.addCard(col, rec);

        LinearLayout lay = T.card(a, "Ajouter des éléments", "Ajoute batterie, 808, nappes ou ambiances calées sur le tempo et la tonalité détectés.");
        lay.addView(T.label(a, "Éléments"));
        layerChips = new T.Chips(a, Remix.LAYERS, 0, true); layerChips.setMulti(1, true);
        lay.addView(layerChips.view);
        lay.addView(T.label(a, "Style de batterie"));
        drumChips = new T.Chips(a, Drums.STYLE_NAMES, 0, false);
        lay.addView(drumChips.view);
        lay.addView(sLevel = new Slider(a, "Volume des ajouts", 10, 150, 5, 80, FxScreen.pct()), T.margins(T.lp(T.MATCH, T.WRAP), 0, 10, 0, 0));
        lay.addView(T.button(a, "Ajouter à la musique", Icon.PLUS, true, click(new Runnable() { public void run() { layers(); } })), T.lp(T.MATCH, T.WRAP));
        T.addCard(col, lay);

        LinearLayout mash = T.card(a, "Mixer avec une autre musique", "Superpose un deuxième morceau, synchronisé au même tempo et calé sur les temps.");
        secondLabel = T.text(a, "Aucun morceau choisi", 13, T.TEXT2, T.MEDIUM);
        mash.addView(secondLabel, T.margins(T.lp(T.WRAP, T.WRAP), 0, 12, 0, 8));
        final T.Chips sync = new T.Chips(a, new String[]{"Synchroniser le tempo", "Sans synchro"}, 0, false);
        sync.onChange(new T.Chips.Listener() { public void onChange(int i) { syncTempo = i == 0; } });
        mash.addView(sync.view);
        mash.addView(sMix = new Slider(a, "Volume du 2e morceau", 10, 150, 5, 70, FxScreen.pct()), T.margins(T.lp(T.MATCH, T.WRAP), 0, 8, 0, 0));
        LinearLayout mr = T.row(a);
        mr.addView(T.button(a, "Choisir", Icon.IMPORT, false, click(new Runnable() { public void run() {
            a.pickAudio(new MainActivity.AudioCallback() { public void onAudio(AudioData d, String n) { second = d; secondName = n; secondLabel.setText("2e morceau : " + n + "  (" + Analysis.time(d.seconds()) + ")"); secondLabel.setTextColor(T.WHITE); } });
        } })), T.lpw(1));
        mr.addView(new View(a), T.lp(T.dp(10), 1));
        mr.addView(T.button(a, "Mixer", Icon.LAYERS, true, click(new Runnable() { public void run() { mashup(); } })), T.lpw(1));
        mash.addView(mr);
        T.addCard(col, mash);

        LinearLayout tk = T.card(a, "Tempo & tonalité", "Change le BPM sans changer la hauteur, ou transpose dans une autre tonalité sans changer la vitesse.");
        tk.addView(sBpm = new Slider(a, "Tempo cible", 60, 200, 1, 120, new Slider.Format() { public String format(float v) { return Math.round(v) + " BPM"; } }));
        tk.addView(T.button(a, "Appliquer le tempo", Icon.SPEED, false, click(new Runnable() { public void run() { toBpm(); } })), T.lp(T.MATCH, T.WRAP));
        tk.addView(T.label(a, "Nouvelle tonalité"));
        String[] k = new String[12]; for (int i = 0; i < 12; i++) k[i] = Analysis.NOTES[i];
        keyChips = new T.Chips(a, k, -1, false);
        tk.addView(keyChips.view, T.margins(T.lp(T.MATCH, T.WRAP), 0, 0, 0, 10));
        tk.addView(T.button(a, "Transposer", Icon.KEY, false, click(new Runnable() { public void run() { transpose(); } })), T.lp(T.MATCH, T.WRAP));
        T.addCard(col, tk);
        onInfo();
        return col;
    }

    @Override public void onInfo() {
        if (info == null) return;
        Analysis.Result r = a.info();
        if (a.track() == null) info.setText("Importe d'abord une musique dans le Studio");
        else if (r == null) info.setText("Analyse du tempo et de la tonalité…");
        else {
            info.setText("●  " + Math.round(r.bpm) + " BPM  ·  " + r.keyName() + "  ·  " + Analysis.time(a.track().seconds()));
            sBpm.setValue(Math.round(r.bpm)); keyChips.select(r.keyRoot);
        }
    }

    @Override public void onTrackChanged() { onInfo(); }

    void extend() {
        if (!a.requireTrack()) return;
        final int choice = extChips.selected(); final int v = variant;
        a.run("Rallonge", null, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData t = a.track(); double cur = t.seconds();
            double target = choice == 0 ? cur + 30 : choice == 1 ? cur + 60 : choice == 2 ? cur + 120 : choice == 3 ? cur * 2 : cur * 3;
            Analysis.Result r = a.ensureInfo(t, new Progress.Sub(p, 0, 0.3f));
            return Remix.extend(t, r, target, v, new Progress.Sub(p, 0.3f, 1));
        } });
    }

    void recompose() {
        if (!a.requireTrack()) return;
        final int mode = recChips.selected(); final long sd = seed;
        a.run("Recomposition", a.trackName().contains("remix") ? a.trackName() : a.trackName() + " (remix)", new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData t = a.track();
            if (t == lastRemix && remixSource != null) t = remixSource; // "another version" re-chops the original, not the remix
            Analysis.Result r = t == remixSource && remixInfo != null ? remixInfo : a.ensureInfo(t, new Progress.Sub(p, 0, 0.3f));
            AudioData out = Dsp.master(Remix.recompose(t, r, mode, sd, new Progress.Sub(p, 0.3f, 1)));
            remixSource = t; remixInfo = r; lastRemix = out;
            return out;
        } });
    }

    void layers() {
        if (!a.requireTrack()) return;
        final boolean[] l = layerChips.states(); boolean any = false; for (boolean b : l) any |= b;
        if (!any) { a.toast("Choisis au moins un élément"); return; }
        final int style = drumChips.selected(); final float lvl = sLevel.value() / 100f; final long sd = seed++;
        a.run("Ajout d'éléments", null, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData t = a.track(); Analysis.Result r = a.ensureInfo(t, new Progress.Sub(p, 0, 0.3f));
            return Remix.addLayers(t, r, l, style, lvl, sd, new Progress.Sub(p, 0.3f, 1));
        } });
    }

    void mashup() {
        if (!a.requireTrack()) return;
        if (second == null) { a.toast("Choisis d'abord le 2e morceau"); return; }
        final AudioData o = second; final float lvl = sMix.value() / 100f; final boolean sync = syncTempo;
        a.run("Mix", a.trackName() + " × " + secondName, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData t = a.track(); Analysis.Result rb = a.ensureInfo(t, new Progress.Sub(p, 0, 0.2f));
            Analysis.Result ro = Analysis.analyze(o, new Progress.Sub(p, 0.2f, 0.4f));
            return Remix.mashup(t, rb, o, ro, lvl, sync, new Progress.Sub(p, 0.4f, 1));
        } });
    }

    void toBpm() {
        if (!a.requireTrack()) return;
        final float target = sBpm.value();
        a.run("Tempo " + Math.round(target) + " BPM", null, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData t = a.track(); Analysis.Result r = a.ensureInfo(t, new Progress.Sub(p, 0, 0.2f));
            return Dsp.tempo(t, target / r.bpm, new Progress.Sub(p, 0.2f, 1));
        } });
    }

    void transpose() {
        if (!a.requireTrack()) return;
        final int k = keyChips.selected(); if (k < 0) { a.toast("Choisis une tonalité"); return; }
        a.run("Transposition", null, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData t = a.track(); Analysis.Result r = a.ensureInfo(t, new Progress.Sub(p, 0, 0.2f));
            int d = ((k - r.keyRoot) % 12 + 12) % 12; if (d > 6) d -= 12;
            if (d == 0) return t.copy();
            return Dsp.pitch(t, d, new Progress.Sub(p, 0.2f, 1));
        } });
    }
}
