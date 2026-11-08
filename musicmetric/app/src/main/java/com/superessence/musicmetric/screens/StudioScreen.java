package com.superessence.musicmetric.screens;

import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.superessence.musicmetric.MainActivity;
import com.superessence.musicmetric.audio.Analysis;
import com.superessence.musicmetric.audio.AudioData;
import com.superessence.musicmetric.audio.Dsp;
import com.superessence.musicmetric.audio.Progress;
import com.superessence.musicmetric.ui.Icon;
import com.superessence.musicmetric.ui.SpectrumView;
import com.superessence.musicmetric.ui.T;
import com.superessence.musicmetric.ui.WaveformView;

/** Import, playback, waveform editing, history and export. */
public final class StudioScreen extends Screen {
    LinearLayout empty, loaded; TextView name, posText, durText, selText; WaveformView wave; SpectrumView spec; Icon playIcon, loopIcon;
    View sDur, sBpm, sKey, sLvl; TextView undoBtn, redoBtn; LinearLayout selTools;

    public StudioScreen(MainActivity a) { super(a); }

    @Override public View build() {
        LinearLayout col = page("Studio", "Importe une musique, écoute, découpe et exporte. Tout le reste de l'app travaille sur cette piste.");
        // ---------- empty state
        empty = T.col(a);
        LinearLayout drop = T.col(a); drop.setGravity(Gravity.CENTER);
        drop.setBackground(T.ripple(dashed(), 0x22FFFFFF)); drop.setPadding(T.dp(20), T.dp(34), T.dp(20), T.dp(34));
        LinearLayout circle = T.row(a); circle.setGravity(Gravity.CENTER); circle.setBackground(T.gradientCircle());
        circle.addView(new Icon(a, Icon.IMPORT, 0xFF111111), T.lp(T.dp(30), T.dp(30)));
        drop.addView(circle, T.lp(T.dp(72), T.dp(72)));
        drop.addView(T.text(a, "Importer une musique", 20, T.WHITE, T.BLACK), T.margins(T.lp(T.WRAP, T.WRAP), 0, 18, 0, 6));
        drop.addView(T.text(a, "MP3 · M4A · WAV · FLAC · OGG · AAC", 13, T.TEXT2, T.MEDIUM));
        drop.setOnClickListener(click(new Runnable() { public void run() { a.importMain(); } }));
        T.addCard(empty, drop);
        LinearLayout alt = T.card(a, "Ou commence autrement", null);
        LinearLayout r = T.row(a);
        r.addView(T.button(a, "Micro", Icon.MIC, false, click(new Runnable() { public void run() {
            a.record(false, new MainActivity.AudioCallback() { public void onAudio(AudioData d, String n) { a.setTrack(d, n, false); } });
        } })), T.lpw(1));
        View sp = new View(a); r.addView(sp, T.lp(T.dp(10), 1));
        r.addView(T.button(a, "Composer", Icon.PIANO, false, click(new Runnable() { public void run() { a.selectTab(4); } })), T.lpw(1));
        alt.addView(r, T.margins(T.lp(T.MATCH, T.WRAP), 0, 14, 0, 0));
        T.addCard(empty, alt);
        col.addView(empty);

        // ---------- loaded state
        loaded = T.col(a);
        LinearLayout player = T.card(a, null, null);
        name = T.text(a, "", 19, T.WHITE, T.BLACK); name.setMaxLines(2);
        player.addView(name);
        TextView hint = T.text(a, "Touche pour te placer · glisse pour sélectionner", 12, T.TEXT3, T.MEDIUM);
        player.addView(hint, T.margins(T.lp(T.WRAP, T.WRAP), 0, 6, 0, 12));
        spec = new SpectrumView(a); player.addView(spec, T.lp(T.MATCH, T.dp(46)));
        wave = new WaveformView(a);
        wave.setListener(new WaveformView.Listener() {
            public void onSeek(int s) { a.player.seek(s); wave.setPlayhead(s); }
            public void onSelection(int x, int y) { updateSelection(); }
        });
        player.addView(wave, T.margins(T.lp(T.MATCH, T.dp(120)), 0, 8, 0, 6));
        LinearLayout times = T.row(a);
        posText = T.text(a, "0:00", 12, T.Y, T.BOLD); durText = T.text(a, "0:00", 12, T.TEXT2, T.BOLD);
        times.addView(posText, T.lpw(1)); times.addView(durText);
        player.addView(times);
        // transport
        LinearLayout tr = T.row(a); tr.setGravity(Gravity.CENTER);
        tr.addView(round(Icon.BACK, false, new Runnable() { public void run() { a.player.seek(0); wave.setPlayhead(0); } }), T.lp(T.dp(52), T.dp(52)));
        LinearLayout play = round(Icon.PLAY, true, new Runnable() { public void run() { a.player.toggle(); } });
        playIcon = (Icon) play.getChildAt(0);
        tr.addView(play, T.margins(T.lp(T.dp(64), T.dp(64)), 18, 0, 18, 0));
        LinearLayout loop = round(Icon.LOOP, false, new Runnable() { public void run() { toggleLoop(); } });
        loopIcon = (Icon) loop.getChildAt(0);
        tr.addView(loop, T.lp(T.dp(52), T.dp(52)));
        player.addView(tr, T.margins(T.lp(T.MATCH, T.WRAP), 0, 14, 0, 4));
        T.addCard(loaded, player);

        // stats
        LinearLayout stats = T.row(a);
        sDur = T.stat(a, "Durée", "–"); sBpm = T.stat(a, "Tempo", "…"); sKey = T.stat(a, "Tonalité", "…"); sLvl = T.stat(a, "Niveau", "–");
        View[] st = {sDur, sBpm, sKey, sLvl};
        for (int i = 0; i < st.length; i++) stats.addView(st[i], T.margins(T.lpw(1), i == 0 ? 0 : 4, 0, i == st.length - 1 ? 0 : 4, 0));
        loaded.addView(stats, T.margins(T.lp(T.MATCH, T.WRAP), 16, 0, 16, 14));

        // selection tools
        selTools = T.card(a, "Sélection", null);
        selText = T.text(a, "", 13, T.TEXT2, T.MEDIUM); selTools.addView(selText, T.margins(T.lp(T.WRAP, T.WRAP), 0, 8, 0, 12));
        selTools.addView(T.grid(a, new View[]{
            T.tile(a, "Garder", Icon.TRIM, click(new Runnable() { public void run() { keepSel(); } })),
            T.tile(a, "Retirer", Icon.TRASH, click(new Runnable() { public void run() { deleteSel(); } })),
            T.tile(a, "Dupliquer", Icon.COPY, click(new Runnable() { public void run() { dupSel(); } })),
            T.tile(a, "Annuler", Icon.CLOSE, click(new Runnable() { public void run() { wave.clearSelection(); a.player.clearLoop(); updateSelection(); } })),
        }, 4));
        T.addCard(loaded, selTools);

        // edit tools
        LinearLayout tools = T.card(a, "Édition", "Outils rapides appliqués sur toute la piste.");
        tools.addView(T.grid(a, new View[]{
            T.tile(a, "Fondu entrée", Icon.FADE_IN, click(new Runnable() { public void run() { simple("Fondu d'entrée", 0); } })),
            T.tile(a, "Fondu sortie", Icon.FADE_OUT, click(new Runnable() { public void run() { simple("Fondu de sortie", 1); } })),
            T.tile(a, "Niveau max", Icon.NORMALIZE, click(new Runnable() { public void run() { simple("Normalisation", 2); } })),
            T.tile(a, "Inverser", Icon.REVERSE, click(new Runnable() { public void run() { simple("Inversion", 3); } })),
            T.tile(a, "Volume +3 dB", Icon.VOL_UP, click(new Runnable() { public void run() { simple("Volume +3 dB", 4); } })),
            T.tile(a, "Volume −3 dB", Icon.VOL_DOWN, click(new Runnable() { public void run() { simple("Volume −3 dB", 5); } })),
            T.tile(a, "Mono", Icon.MONO, click(new Runnable() { public void run() { simple("Mono", 6); } })),
            T.tile(a, "Couper silences", Icon.CUT, click(new Runnable() { public void run() { simple("Silences coupés", 7); } })),
        }, 4));
        T.addCard(loaded, tools);

        // history & export
        LinearLayout out = T.card(a, "Historique & export", null);
        LinearLayout hr = T.row(a);
        LinearLayout u = T.button(a, "Annuler", Icon.UNDO, false, click(new Runnable() { public void run() { a.undo(); } }));
        LinearLayout re = T.button(a, "Rétablir", Icon.REDO, false, click(new Runnable() { public void run() { a.redo(); } }));
        undoBtn = (TextView) u.getChildAt(1); redoBtn = (TextView) re.getChildAt(1);
        hr.addView(u, T.lpw(1)); hr.addView(new View(a), T.lp(T.dp(10), 1)); hr.addView(re, T.lpw(1));
        out.addView(hr, T.margins(T.lp(T.MATCH, T.WRAP), 0, 14, 0, 10));
        out.addView(T.button(a, "Exporter la musique", Icon.SAVE, true, click(new Runnable() { public void run() { a.export(); } })), T.lp(T.MATCH, T.WRAP));
        LinearLayout r2 = T.row(a);
        r2.addView(T.button(a, "Nouvelle piste", Icon.IMPORT, false, click(new Runnable() { public void run() { a.importMain(); } })), T.lpw(1));
        r2.addView(new View(a), T.lp(T.dp(10), 1));
        r2.addView(T.button(a, "Chanter dessus", Icon.MIC, false, click(new Runnable() { public void run() {
            a.record(true, new MainActivity.AudioCallback() { public void onAudio(AudioData d, String n) { a.setTrack(d, n, true); } });
        } })), T.lpw(1));
        out.addView(r2, T.margins(T.lp(T.MATCH, T.WRAP), 0, 10, 0, 0));
        T.addCard(loaded, out);
        col.addView(loaded);
        onTrackChanged();
        return col;
    }

    android.graphics.drawable.GradientDrawable dashed() {
        android.graphics.drawable.GradientDrawable g = T.round(T.SURFACE, 8);
        g.setStroke(T.dp(2), 0x55FFFFFF, T.dpf(10), T.dpf(7)); return g;
    }

    LinearLayout round(int icon, boolean primary, final Runnable r) {
        LinearLayout b = T.row(a); b.setGravity(Gravity.CENTER);
        b.setBackground(T.ripple(primary ? T.round(T.Y, T.RADIUS) : T.round(T.SURFACE2, T.RADIUS, 0xFF3A3A40, 1), primary ? 0x33000000 : 0x22FFFFFF));
        Icon ic = new Icon(a, icon, primary ? 0xFF111111 : T.WHITE);
        b.addView(ic, T.lp(T.dp(primary ? 30 : 22), T.dp(primary ? 30 : 22)));
        b.setOnClickListener(click(r));
        return b;
    }

    void toggleLoop() {
        if (a.player.hasLoop()) { a.player.clearLoop(); a.toast("Boucle désactivée"); }
        else if (wave.hasSelection()) { a.player.setLoop(wave.selA(), wave.selB()); a.player.seek(wave.selA()); a.toast("Lecture en boucle de la sélection"); }
        else { a.toast("Sélectionne d'abord une zone sur la forme d'onde"); }
        loopIcon.setColor(a.player.hasLoop() ? T.Y : T.WHITE);
    }

    void updateSelection() {
        boolean s = wave.hasSelection();
        selTools.setAlpha(s ? 1f : 0.45f);
        if (s) selText.setText(Analysis.time(wave.selA() / (double) AudioData.SR) + " → " + Analysis.time(wave.selB() / (double) AudioData.SR)
                + "   (" + String.format(java.util.Locale.FRANCE, "%.1f s", (wave.selB() - wave.selA()) / (double) AudioData.SR) + ")");
        else selText.setText("Glisse le doigt sur la forme d'onde pour sélectionner une partie.");
        if (!s && a.player.hasLoop()) { a.player.clearLoop(); loopIcon.setColor(T.WHITE); }
    }

    boolean needSel() { if (wave.hasSelection()) return true; a.toast("Sélectionne d'abord une zone"); return false; }

    void keepSel() {
        if (!needSel()) return; final int x = wave.selA(), y = wave.selB(); a.player.clearLoop();
        a.run("Découpe", null, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData o = a.track().slice(x, y); Dsp.fadeIn(o, 256); Dsp.fadeOut(o, 512); return o; } });
    }

    void deleteSel() {
        if (!needSel()) return; final int x = wave.selA(), y = wave.selB(); a.player.clearLoop();
        a.run("Suppression", null, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData t = a.track(); return Dsp.crossfadeJoin(t.slice(0, x), t.slice(y, t.length()), Math.min(1024, Math.max(1, Math.min(x, t.length() - y)))); } });
    }

    void dupSel() {
        if (!needSel()) return; final int x = wave.selA(), y = wave.selB(); a.player.clearLoop();
        a.run("Duplication", null, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData t = a.track(); AudioData head = t.slice(0, y), seg = t.slice(x, y), tail = t.slice(y, t.length());
            return AudioData.concat(AudioData.concat(head, seg), tail); } });
    }

    void simple(String title, final int op) {
        if (!a.requireTrack()) return;
        a.run(title, null, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData o = a.track().copy();
            switch (op) {
                case 0: Dsp.fadeIn(o, (int) Math.min(o.length() / 3, 4.0 * AudioData.SR)); return o;
                case 1: Dsp.fadeOut(o, (int) Math.min(o.length() / 3, 6.0 * AudioData.SR)); return o;
                case 2: o.normalize(0.95f); return o;
                case 3: return Dsp.reverse(o);
                case 4: o.gain(1.4125f); return Dsp.limit(o, 0.98f);
                case 5: o.gain(0.7079f); return o;
                case 6: return Dsp.toMono(o);
                default: return Dsp.trimSilence(o, -48);
            }
        } });
    }

    @Override public void onTrackChanged() {
        if (empty == null) return;
        AudioData t = a.track();
        empty.setVisibility(t == null ? View.VISIBLE : View.GONE);
        loaded.setVisibility(t == null ? View.GONE : View.VISIBLE);
        if (t == null) return;
        name.setText(a.trackName());
        wave.setData(t); wave.setPlayhead(a.player.position());
        durText.setText(Analysis.time(t.seconds()));
        T.setStat(sDur, Analysis.time(t.seconds()));
        float pk = t.peak();
        T.setStat(sLvl, pk <= 0 ? "–∞" : String.format(java.util.Locale.FRANCE, "%.1f dB", 20 * Math.log10(pk)));
        T.setStat(sBpm, "…"); T.setStat(sKey, "…");
        undoBtn.setAlpha(a.canUndo() ? 1 : 0.4f); redoBtn.setAlpha(a.canRedo() ? 1 : 0.4f);
        loopIcon.setColor(T.WHITE);
        updateSelection();
        onInfo();
    }

    @Override public void onInfo() {
        if (sBpm == null) return;
        Analysis.Result r = a.info(); if (r == null) return;
        T.setStat(sBpm, Math.round(r.bpm) + " BPM"); T.setStat(sKey, r.keyShort());
    }

    @Override public void onTick(int pos, boolean playing) {
        if (wave == null || a.track() == null) return;
        wave.setPlayhead(pos);
        posText.setText(Analysis.time(pos / (double) AudioData.SR));
        playIcon.set(playing ? Icon.PAUSE : Icon.PLAY, 0xFF111111);
        spec.update(a.track(), pos, playing);
    }
}
