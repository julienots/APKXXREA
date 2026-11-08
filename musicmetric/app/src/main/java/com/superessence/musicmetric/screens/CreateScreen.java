package com.superessence.musicmetric.screens;

import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import com.superessence.musicmetric.MainActivity;
import com.superessence.musicmetric.audio.Analysis;
import com.superessence.musicmetric.audio.AudioData;
import com.superessence.musicmetric.audio.Drums;
import com.superessence.musicmetric.audio.Generator;
import com.superessence.musicmetric.audio.Pattern;
import com.superessence.musicmetric.audio.Player;
import com.superessence.musicmetric.audio.Progress;
import com.superessence.musicmetric.audio.Synth;
import com.superessence.musicmetric.audio.Theory;
import com.superessence.musicmetric.ui.Icon;
import com.superessence.musicmetric.ui.Slider;
import com.superessence.musicmetric.ui.StepGrid;
import com.superessence.musicmetric.ui.T;

/** Composition generator (full arranged tracks) + 16-step sequencer. */
public final class CreateScreen extends Screen {
    LinearLayout genPane, seqPane; int style = 0; long seed = System.currentTimeMillis() % 100000; LinearLayout[] styleCards;
    T.Chips lenChips, genKey, seqKey, seqMode, leadChips, chordChips, bassChips; Slider sGenBpm, sSeqBpm, sSwing, sBars; TextView lastGen;
    final Pattern pat = new Pattern(); final Player preview = new Player(); StepGrid drumGrid, melGrid; Icon prevIcon; boolean dirty = true;

    public CreateScreen(MainActivity a) { super(a); pat.randomize(Drums.ST_TRAP, 7); }

    @Override public View build() {
        LinearLayout col = page("Créer", "Génère une composition complète dans le style de ton choix, ou compose la tienne pas à pas.");
        final T.Chips seg = new T.Chips(a, new String[]{"Générateur", "Séquenceur"}, 0, false);
        col.addView(seg.view, T.margins(T.lp(T.MATCH, T.WRAP), 16, 0, 16, 14));
        genPane = generator(); seqPane = sequencer(); seqPane.setVisibility(View.GONE);
        col.addView(genPane); col.addView(seqPane);
        seg.onChange(new T.Chips.Listener() { public void onChange(int i) {
            genPane.setVisibility(i == 0 ? View.VISIBLE : View.GONE); seqPane.setVisibility(i == 1 ? View.VISIBLE : View.GONE);
            if (i == 0) stopPreview();
        } });
        return col;
    }

    // ------------------------------------------------------------------ generator

    LinearLayout generator() {
        LinearLayout p = T.col(a);
        LinearLayout st = T.card(a, "Style", null);
        styleCards = new LinearLayout[Generator.STYLES.length];
        View[] cards = new View[Generator.STYLES.length];
        for (int i = 0; i < cards.length; i++) cards[i] = styleCard(i);
        st.addView(T.grid(a, cards, 2), T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 0));
        T.addCard(p, st);
        refreshStyles();

        LinearLayout opt = T.card(a, "Options", null);
        opt.addView(T.label(a, "Durée"));
        lenChips = new T.Chips(a, Generator.LENGTHS, 1, false); opt.addView(lenChips.view);
        opt.addView(T.label(a, "Tonalité"));
        String[] keys = new String[13]; keys[0] = "Aléatoire"; for (int i = 0; i < 12; i++) keys[i + 1] = Analysis.NOTES[i];
        genKey = new T.Chips(a, keys, 0, false); opt.addView(genKey.view);
        opt.addView(sGenBpm = new Slider(a, "Tempo", 0, 180, 1, 0, new Slider.Format() { public String format(float v) { return v < 60 ? "Auto (selon le style)" : Math.round(v) + " BPM"; } }),
                T.margins(T.lp(T.MATCH, T.WRAP), 0, 10, 0, 0));
        T.addCard(p, opt);

        LinearLayout go = T.card(a, null, null);
        go.addView(T.button(a, "Générer la composition", Icon.BOLT, true, click(new Runnable() { public void run() { generate(false); } })), T.lp(T.MATCH, T.dp(56)));
        go.addView(T.button(a, "Nouvelle variation", Icon.SHUFFLE, false, click(new Runnable() { public void run() { generate(true); } })), T.margins(T.lp(T.MATCH, T.WRAP), 0, 10, 0, 0));
        lastGen = T.text(a, "Chaque génération est unique : mélodie, accords, rythmique et structure sont composés selon les règles du style choisi.", 12, T.TEXT3, T.MEDIUM);
        lastGen.setLineSpacing(0, 1.15f);
        go.addView(lastGen, T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 0));
        T.addCard(p, go);
        return p;
    }

    View styleCard(final int i) {
        Generator.Style s = Generator.STYLES[i];
        LinearLayout c = T.col(a); c.setPadding(T.dp(14), T.dp(14), T.dp(14), T.dp(14));
        TextView n = T.text(a, s.name, 16, T.WHITE, T.BLACK); n.setTag("n"); c.addView(n);
        TextView d = T.text(a, s.desc, 12, T.TEXT2, T.REGULAR); d.setTag("d"); d.setMaxLines(2);
        c.addView(d, T.margins(T.lp(T.WRAP, T.WRAP), 0, 6, 0, 0));
        c.setOnClickListener(click(new Runnable() { public void run() { style = i; refreshStyles(); } }));
        styleCards[i] = c;
        return c;
    }

    void refreshStyles() {
        for (int i = 0; i < styleCards.length; i++) {
            boolean on = i == style; LinearLayout c = styleCards[i];
            c.setBackground(T.ripple(on ? T.gradientY() : T.round(T.SURFACE2, 16, T.STROKE, 1), 0x33FFC928));
            ((TextView) c.findViewWithTag("n")).setTextColor(on ? 0xFF111111 : T.WHITE);
            ((TextView) c.findViewWithTag("d")).setTextColor(on ? 0xCC111111 : T.TEXT2);
        }
    }

    void generate(boolean newSeed) {
        seed = seed * 6364136223846793005L + 1442695040888963407L;
        final long sd = Math.abs(seed % 1000000);
        final int st = style, len = lenChips.selected(), root = genKey.selected() - 1, bpm = sGenBpm.value() < 60 ? 0 : Math.round(sGenBpm.value());
        final Generator.Song song = Generator.plan(st, sd, len, root, bpm);
        final String name = "MusicMetric " + Generator.STYLES[st].name + " · " + Theory.keyLabel(song.root, song.minor) + " · " + song.bpm + " BPM";
        stopPreview();
        a.run("Composition " + Generator.STYLES[st].name, name, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData o = Generator.render(song, p);
            final String summary = song.summary;
            lastGen.post(new Runnable() { public void run() {
                lastGen.setText("Dernière composition : " + Generator.STYLES[st].name + " · " + Analysis.NOTES_FR[song.root] + (song.minor ? " mineur" : " majeur")
                        + " · " + song.bpm + " BPM · n° " + sd + "\nStructure : " + summary);
                a.selectTab(0);
            } });
            return o;
        } });
    }

    // ------------------------------------------------------------------ sequencer

    LinearLayout sequencer() {
        LinearLayout p = T.col(a);
        LinearLayout tr = T.card(a, null, null);
        LinearLayout r = T.row(a);
        LinearLayout play = T.row(a); play.setGravity(Gravity.CENTER); play.setBackground(T.ripple(T.gradientCircle(), 0x55000000));
        prevIcon = new Icon(a, Icon.PLAY, 0xFF111111); play.addView(prevIcon, T.lp(T.dp(26), T.dp(26)));
        play.setOnClickListener(click(new Runnable() { public void run() { togglePreview(); } }));
        r.addView(play, T.lp(T.dp(60), T.dp(60)));
        LinearLayout tt = T.col(a); tt.setPadding(T.dp(14), 0, 0, 0);
        tt.addView(T.text(a, "Boucle de 4 mesures", 16, T.WHITE, T.BLACK));
        tt.addView(T.text(a, "Touche les cases pour composer, ça se met à jour en direct.", 12, T.TEXT2, T.REGULAR), T.margins(T.lp(T.WRAP, T.WRAP), 0, 4, 0, 0));
        r.addView(tt, T.lpw(1));
        tr.addView(r);
        LinearLayout rr = T.row(a);
        rr.addView(T.button(a, "Aléatoire", Icon.SHUFFLE, false, click(new Runnable() { public void run() {
            int[] styles = {Drums.ST_TRAP, Drums.ST_HOUSE, Drums.ST_BOOMBAP, Drums.ST_PHONK, Drums.ST_AFRO, Drums.ST_DRILL, Drums.ST_RNB};
            pat.randomize(styles[(int) (Math.random() * styles.length)], System.nanoTime()); changed(); drumGrid.invalidate(); melGrid.invalidate(); refreshChordLabels();
        } })), T.lpw(1));
        rr.addView(new View(a), T.lp(T.dp(10), 1));
        rr.addView(T.button(a, "Effacer", Icon.TRASH, false, click(new Runnable() { public void run() { pat.clear(); changed(); drumGrid.invalidate(); melGrid.invalidate(); } })), T.lpw(1));
        tr.addView(rr, T.margins(T.lp(T.MATCH, T.WRAP), 0, 14, 0, 0));
        T.addCard(p, tr);

        LinearLayout dr = T.card(a, "Batterie", null);
        drumGrid = new StepGrid(a, Pattern.DRUM_LABELS, Pattern.STEPS, false, new StepGrid.Model() {
            public boolean get(int row, int c) { return pat.drums[row][c]; }
            public void toggle(int row, int c) { pat.drums[row][c] = !pat.drums[row][c]; changed(); }
        });
        dr.addView(drumGrid, T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 0));
        T.addCard(p, dr);

        LinearLayout mel = T.card(a, "Mélodie", "Une note par pas, dans la gamme choisie. Les cases vides prolongent la note précédente.");
        String[] rows = melRows = new String[Pattern.MELODY_ROWS];
        melGrid = new StepGrid(a, rows, Pattern.STEPS, true, new StepGrid.Model() {
            public boolean get(int row, int c) { return pat.melody[c] == Pattern.MELODY_ROWS - 1 - row; }
            public void toggle(int row, int c) { int d = Pattern.MELODY_ROWS - 1 - row; pat.melody[c] = pat.melody[c] == d ? -1 : d; changed(); }
        });
        refreshMelodyLabels(rows);
        mel.addView(melGrid, T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 0));
        mel.addView(T.label(a, "Instrument mélodie"));
        leadChips = new T.Chips(a, Synth.INSTRUMENTS, pat.leadInst, false);
        leadChips.onChange(new T.Chips.Listener() { public void onChange(int i) { pat.leadInst = i; changed(); } });
        mel.addView(leadChips.view);
        T.addCard(p, mel);

        LinearLayout har = T.card(a, "Harmonie", "Grille de 4 accords (un par mesure). Touche un accord pour le changer.");
        chordRow = T.row(a);
        for (int i = 0; i < 4; i++) {
            final int idx = i;
            TextView c = T.text(a, "", 16, T.WHITE, T.BLACK); c.setGravity(Gravity.CENTER); c.setPadding(0, T.dp(14), 0, T.dp(14));
            c.setBackground(T.ripple(T.round(T.SURFACE2, 14, T.STROKE, 1), 0x33FFC928));
            c.setOnClickListener(click(new Runnable() { public void run() { pat.chords[idx] = (pat.chords[idx] + 1) % 7; refreshChordLabels(); changed(); } }));
            chordRow.addView(c, T.margins(T.lpw(1), i == 0 ? 0 : 4, 0, i == 3 ? 0 : 4, 0));
        }
        har.addView(chordRow, T.margins(T.lp(T.MATCH, T.WRAP), 0, 12, 0, 0));
        har.addView(T.label(a, "Instrument accords"));
        chordChips = new T.Chips(a, Synth.INSTRUMENTS, pat.chordInst, false);
        chordChips.onChange(new T.Chips.Listener() { public void onChange(int i) { pat.chordInst = i; changed(); } });
        har.addView(chordChips.view);
        har.addView(T.label(a, "Basse"));
        bassChips = new T.Chips(a, Pattern.BASS_MODES, pat.bassMode, false);
        bassChips.onChange(new T.Chips.Listener() { public void onChange(int i) { pat.bassMode = i; changed(); } });
        har.addView(bassChips.view);
        T.addCard(p, har);

        LinearLayout set = T.card(a, "Réglages", null);
        set.addView(sSeqBpm = new Slider(a, "Tempo", 60, 180, 1, pat.bpm, new Slider.Format() { public String format(float v) { return Math.round(v) + " BPM"; } })
                .onChange(new Slider.Listener() { public void onChange(float v) { pat.bpm = Math.round(v); changed(); } }));
        set.addView(sSwing = new Slider(a, "Swing", 0, 50, 1, 0, FxScreen.pct()).onChange(new Slider.Listener() { public void onChange(float v) { pat.swing = v / 100f; changed(); } }));
        set.addView(T.label(a, "Tonalité"));
        String[] k = new String[12]; for (int i = 0; i < 12; i++) k[i] = Analysis.NOTES[i];
        seqKey = new T.Chips(a, k, pat.root, false);
        seqKey.onChange(new T.Chips.Listener() { public void onChange(int i) { pat.root = i; refreshAllLabels(); changed(); } });
        set.addView(seqKey.view);
        seqMode = new T.Chips(a, new String[]{"Mineur", "Majeur"}, pat.minor ? 0 : 1, false);
        seqMode.onChange(new T.Chips.Listener() { public void onChange(int i) { pat.minor = i == 0; refreshAllLabels(); changed(); } });
        set.addView(seqMode.view, T.margins(T.lp(T.MATCH, T.WRAP), 0, 8, 0, 0));
        set.addView(sBars = new Slider(a, "Longueur envoyée au Studio", 1, 16, 1, 4, new Slider.Format() { public String format(float v) { return Math.round(v * 4) + " mesures"; } }),
                T.margins(T.lp(T.MATCH, T.WRAP), 0, 10, 0, 0));
        set.addView(T.button(a, "Envoyer vers le Studio", Icon.CHECK, true, click(new Runnable() { public void run() { sendToStudio(); } })), T.lp(T.MATCH, T.WRAP));
        T.addCard(p, set);
        refreshChordLabels();
        return p;
    }

    LinearLayout chordRow; String[] melRows;

    void refreshMelodyLabels(String[] rows) {
        int[] sc = Theory.scale(pat.minor);
        for (int i = 0; i < rows.length; i++) { int deg = Pattern.MELODY_ROWS - 1 - i; int midi = Theory.degree(pat.root, sc, deg, 4); rows[i] = Analysis.NOTES[midi % 12] + (midi / 12 - 1); }
    }

    void refreshAllLabels() {
        refreshMelodyLabels(melRows); melGrid.invalidate(); refreshChordLabels();
    }

    void refreshChordLabels() {
        if (chordRow == null) return;
        int[] sc = Theory.scale(pat.minor);
        for (int i = 0; i < 4; i++) {
            int[] ch = Theory.chord(pat.root, sc, pat.chords[i], 4, false);
            int third = ((ch[1] - ch[0]) % 12 + 12) % 12, fifth = ((ch[2] - ch[0]) % 12 + 12) % 12;
            String q = third == 3 ? (fifth == 6 ? "dim" : "m") : "";
            ((TextView) chordRow.getChildAt(i)).setText(Analysis.NOTES[ch[0] % 12] + q);
        }
    }

    void changed() {
        dirty = true;
        if (previewOn) restartPreview();
    }

    boolean previewOn;

    void togglePreview() { if (previewOn) stopPreview(); else startPreview(); }

    int renderGen = 0;

    /** Renders the loop off the UI thread; only the latest request wins. */
    void renderLoop(final boolean keepPosition) {
        final int gen = ++renderGen;
        final Pattern snap = pat.copy();
        new Thread(new Runnable() { public void run() {
            final AudioData loop = snap.render(1, false);
            a.runOnUiThread(new Runnable() { public void run() {
                if (gen != renderGen) return;
                int pos = keepPosition ? preview.position() : 0;
                preview.setData(loop); preview.setLoop(0, loop.length());
                if (pos > 0) preview.seek(Math.min(pos, loop.length() - 1));
                preview.play();
            } });
        } }, "mm-seq").start();
    }

    void startPreview() {
        a.player.pause(); previewOn = true;
        renderLoop(false);
        prevIcon.set(Icon.PAUSE, 0xFF111111); dirty = false;
    }

    void restartPreview() { renderLoop(true); }

    void stopPreview() {
        renderGen++; previewOn = false; preview.stop(); if (prevIcon != null) prevIcon.set(Icon.PLAY, 0xFF111111);
        if (drumGrid != null) { drumGrid.setPlaying(-1); melGrid.setPlaying(-1); }
    }

    void sendToStudio() {
        stopPreview();
        final int reps = Math.round(sBars.value());
        final String name = "Ma compo · " + Theory.keyLabel(pat.root, pat.minor) + " · " + pat.bpm + " BPM";
        a.run("Rendu de la compo", name, new MainActivity.Job() { public AudioData run(Progress p) {
            AudioData o = pat.render(reps, true);
            lastGen.post(new Runnable() { public void run() { a.selectTab(0); } });
            return o;
        } });
    }

    @Override public void onHide() { stopPreview(); }

    @Override public void onTick(int pos, boolean playing) {
        if (drumGrid == null || !previewOn || !preview.isPlaying()) return;
        int step = (preview.position() / pat.stepSamples()) % Pattern.STEPS;
        drumGrid.setPlaying(step); melGrid.setPlaying(step);
    }
}
