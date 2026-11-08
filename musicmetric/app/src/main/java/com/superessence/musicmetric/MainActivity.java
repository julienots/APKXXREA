package com.superessence.musicmetric;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.RectF;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import com.superessence.musicmetric.audio.Analysis;
import com.superessence.musicmetric.audio.AudioData;
import com.superessence.musicmetric.audio.Codec;
import com.superessence.musicmetric.audio.Player;
import com.superessence.musicmetric.audio.Progress;
import com.superessence.musicmetric.screens.CreateScreen;
import com.superessence.musicmetric.screens.FxScreen;
import com.superessence.musicmetric.screens.RemixScreen;
import com.superessence.musicmetric.screens.Screen;
import com.superessence.musicmetric.screens.StudioScreen;
import com.superessence.musicmetric.screens.VoiceScreen;
import com.superessence.musicmetric.ui.Icon;
import com.superessence.musicmetric.ui.T;

import java.util.ArrayList;
import java.util.List;

public final class MainActivity extends Activity {

    public interface Job { AudioData run(Progress p) throws Exception; }
    public interface AudioCallback { void onAudio(AudioData a, String name); }

    static final int REQ_PICK = 41, REQ_MIC = 42, REQ_WRITE = 43;

    final Handler ui = new Handler(Looper.getMainLooper());
    public final Player player = new Player();

    AudioData track; String trackName = ""; volatile Analysis.Result info; int infoFor = 0;
    final List<AudioData> undo = new ArrayList<AudioData>(), redo = new ArrayList<AudioData>();
    final List<String> undoNames = new ArrayList<String>(), redoNames = new ArrayList<String>();

    FrameLayout root, content; LinearLayout nav, mini; TextView miniTitle, miniTime; Icon miniPlay; View miniBar;
    Screen[] screens; View[] screenViews; int tab = -1; LinearLayout[] navItems;
    View busy; TextView busyTitle, busyLabel, busyPct; ProgressBarView busyBar; volatile boolean busyNow;
    AudioCallback pickCallback; Runnable pendingAfterPermission;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        T.init(this);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().setStatusBarColor(T.BG); getWindow().setNavigationBarColor(T.BG);

        root = new FrameLayout(this); root.setBackgroundColor(T.BG);
        LinearLayout main = T.col(this);
        main.addView(header(), T.lp(T.MATCH, T.WRAP));
        content = new FrameLayout(this);
        main.addView(content, new LinearLayout.LayoutParams(T.MATCH, 0, 1f));
        main.addView(miniPlayer(), T.lp(T.MATCH, T.WRAP));
        main.addView(bottomNav(), T.lp(T.MATCH, T.WRAP));
        root.addView(main);
        root.addView(busy = busyOverlay(), new FrameLayout.LayoutParams(T.MATCH, T.MATCH));
        setContentView(root);

        screens = new Screen[]{new StudioScreen(this), new FxScreen(this), new VoiceScreen(this), new RemixScreen(this), new CreateScreen(this)};
        screenViews = new View[screens.length];
        selectTab(0);
        showSplash();

        player.setListener(new Player.Listener() {
            public void onStateChanged(final boolean playing) { ui.post(new Runnable() { public void run() { refreshMini(); } }); }
        });
        handleIntent(getIntent());
    }

    @Override protected void onNewIntent(Intent i) { super.onNewIntent(i); handleIntent(i); }

    void handleIntent(Intent i) {
        if (i == null) return; Uri u = null;
        if (Intent.ACTION_VIEW.equals(i.getAction())) u = i.getData();
        else if (Intent.ACTION_SEND.equals(i.getAction())) u = i.getParcelableExtra(Intent.EXTRA_STREAM);
        if (u != null) importUri(u, null);
    }

    boolean ticking;
    @Override protected void onResume() { super.onResume(); if (!ticking) { ticking = true; ui.post(tick); } }
    @Override protected void onPause() { super.onPause(); ticking = false; ui.removeCallbacks(tick); }
    @Override protected void onDestroy() { player.stop(); ticking = false; ui.removeCallbacks(tick); super.onDestroy(); }

    @Override public void onBackPressed() {
        if (busyNow) return;
        if (tab != 0) { selectTab(0); return; }
        super.onBackPressed();
    }

    // ------------------------------------------------------------------ chrome

    View header() {
        LinearLayout h = T.row(this); h.setPadding(T.dp(18), T.dp(14), T.dp(12), T.dp(10));
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.logo);
        h.addView(logo, T.margins(T.lp(T.dp(40), T.dp(40)), 0, 0, 12, 0));
        LinearLayout t = T.col(this);
        TextView name = T.text(this, "", 22, T.WHITE, T.BLACK); name.setText(T.brand("Music", "Metric"));
        t.addView(name);
        TextView sub = T.text(this, "by SuperEssence Studio", 11, T.TEXT3, T.BOLD); sub.setLetterSpacing(0.06f);
        t.addView(sub, T.margins(T.lp(T.WRAP, T.WRAP), 0, 3, 0, 0));
        h.addView(t, T.lpw(1));
        Icon info = new Icon(this, Icon.INFO, T.TEXT2); info.setPadding(T.dp(8), T.dp(8), T.dp(8), T.dp(8));
        info.setBackground(T.ripple(T.round(T.SURFACE2, T.RADIUS, T.STROKE, 1), 0x22FFFFFF));
        info.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { about(); } });
        h.addView(info, T.lp(T.dp(40), T.dp(40)));
        return h;
    }

    View miniPlayer() {
        mini = T.col(this); mini.setBackgroundColor(T.SURFACE);
        miniBar = new View(this) {
            final Paint pb = new Paint(), pf = new Paint();
            { pb.setColor(T.SURFACE3); pf.setColor(T.Y); }
            @Override protected void onDraw(Canvas c) {
                c.drawRect(0, 0, getWidth(), getHeight(), pb);
                float f = track == null || track.length() == 0 ? 0 : player.position() / (float) track.length();
                c.drawRect(0, 0, getWidth() * f, getHeight(), pf);
            }
        };
        mini.addView(miniBar, T.lp(T.MATCH, T.dp(2)));
        LinearLayout r = T.row(this); r.setPadding(T.dp(16), T.dp(8), T.dp(10), T.dp(8));
        Icon note = new Icon(this, Icon.NOTE, T.Y);
        r.addView(note, T.margins(T.lp(T.dp(22), T.dp(22)), 0, 0, 12, 0));
        LinearLayout tt = T.col(this);
        miniTitle = T.text(this, "", 14, T.WHITE, T.BOLD); miniTitle.setSingleLine(true); miniTitle.setEllipsize(android.text.TextUtils.TruncateAt.END);
        miniTime = T.text(this, "", 11, T.TEXT2, T.MEDIUM);
        tt.addView(miniTitle); tt.addView(miniTime, T.margins(T.lp(T.WRAP, T.WRAP), 0, 3, 0, 0));
        r.addView(tt, T.lpw(1));
        miniPlay = new Icon(this, Icon.PLAY, 0xFF111111);
        miniPlay.setPadding(T.dp(11), T.dp(11), T.dp(11), T.dp(11));
        miniPlay.setBackground(T.ripple(T.round(T.Y, T.RADIUS), 0x33000000));
        miniPlay.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { player.toggle(); refreshMini(); } });
        r.addView(miniPlay, T.lp(T.dp(44), T.dp(44)));
        mini.addView(r);
        mini.setVisibility(View.GONE);
        return mini;
    }

    static final String[] TABS = {"Studio", "Effets", "Voix", "Remix", "Créer"};
    static final int[] TAB_ICONS = {Icon.WAVE, Icon.SLIDERS, Icon.MIC, Icon.SHUFFLE, Icon.PIANO};

    View bottomNav() {
        nav = T.row(this); nav.setBackgroundColor(T.BG); nav.setPadding(T.dp(6), 0, T.dp(6), T.dp(8));
        View top = new View(this); top.setBackgroundColor(T.STROKE);
        LinearLayout wrap = T.col(this); wrap.addView(top, T.lp(T.MATCH, 1)); wrap.addView(nav, T.lp(T.MATCH, T.WRAP));
        navItems = new LinearLayout[TABS.length];
        for (int i = 0; i < TABS.length; i++) {
            final int idx = i;
            LinearLayout it = T.col(this); it.setGravity(Gravity.CENTER); it.setPadding(0, 0, 0, T.dp(4));
            View under = new View(this); under.setTag("u"); it.addView(under, T.margins(T.lp(T.dp(28), T.dp(2)), 0, 0, 0, 6));
            Icon ic = new Icon(this, TAB_ICONS[i], T.TEXT3); ic.setTag("i");
            LinearLayout pill = T.row(this); pill.setGravity(Gravity.CENTER); pill.setTag("p");
            pill.addView(ic, T.lp(T.dp(22), T.dp(22)));
            it.addView(pill, T.lp(T.dp(56), T.dp(30)));
            TextView tv = T.text(this, TABS[i], 11, T.TEXT3, T.BOLD); tv.setTag("t");
            it.addView(tv, T.margins(T.lp(T.WRAP, T.WRAP), 0, 4, 0, 0));
            it.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { selectTab(idx); } });
            nav.addView(it, T.lpw(1));
            navItems[i] = it;
        }
        return wrap;
    }

    public void selectTab(int i) {
        if (i == tab) return;
        if (tab >= 0) screens[tab].onHide();
        tab = i;
        if (screenViews[i] == null) {
            ScrollView sv = new ScrollView(this); sv.setFillViewport(true); sv.setVerticalScrollBarEnabled(false); sv.setOverScrollMode(View.OVER_SCROLL_NEVER);
            LinearLayout col = T.col(this); col.setPadding(0, T.dp(6), 0, T.dp(24));
            col.addView(screens[i].build(), T.lp(T.MATCH, T.WRAP));
            sv.addView(col);
            screenViews[i] = sv;
        }
        content.removeAllViews();
        View v = screenViews[i]; v.setAlpha(0f); v.setTranslationY(T.dp(10));
        content.addView(v, new FrameLayout.LayoutParams(T.MATCH, T.MATCH));
        v.animate().alpha(1f).translationY(0).setDuration(220).setInterpolator(new DecelerateInterpolator()).start();
        screens[i].onShow();
        for (int k = 0; k < navItems.length; k++) {
            boolean on = k == i;
            ((Icon) navItems[k].findViewWithTag("i")).setColor(on ? T.Y : T.TEXT3);
            navItems[k].findViewWithTag("p").setBackground(null);
            navItems[k].findViewWithTag("u").setBackgroundColor(on ? T.Y : 0);
            ((TextView) navItems[k].findViewWithTag("t")).setTextColor(on ? T.WHITE : T.TEXT3);
        }
    }

    final Runnable tick = new Runnable() {
        public void run() {
            int pos = player.position(); boolean pl = player.isPlaying();
            if (tab >= 0) screens[tab].onTick(pos, pl);
            if (track != null) {
                if (pl) { miniBar.invalidate(); miniTime.setText(Analysis.time(pos / (double) AudioData.SR) + " / " + Analysis.time(track.seconds()) + infoSuffix()); }
            }
            if (ticking) ui.postDelayed(this, 33);
        }
    };

    String infoSuffix() { Analysis.Result r = info; return r == null ? "" : "  ·  " + Math.round(r.bpm) + " BPM  ·  " + r.keyShort(); }

    void refreshMini() {
        if (track == null) { mini.setVisibility(View.GONE); return; }
        mini.setVisibility(View.VISIBLE);
        miniTitle.setText(trackName);
        miniPlay.set(player.isPlaying() ? Icon.PAUSE : Icon.PLAY, 0xFF111111);
        miniTime.setText(Analysis.time(player.position() / (double) AudioData.SR) + " / " + Analysis.time(track.seconds()) + infoSuffix());
        miniBar.invalidate();
    }

    void showSplash() {
        final FrameLayout s = new FrameLayout(this); s.setBackgroundColor(T.BG); s.setClickable(true);
        LinearLayout c = T.col(this); c.setGravity(Gravity.CENTER);
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.logo);
        c.addView(logo, T.lp(T.dp(132), T.dp(132)));
        TextView n = T.text(this, "", 34, T.WHITE, T.BLACK); n.setText(T.brand("Music", "Metric"));
        c.addView(n, T.margins(T.lp(T.WRAP, T.WRAP), 0, 22, 0, 0));
        TextView sub = T.text(this, "SUPERESSENCE STUDIO", 12, T.TEXT2, T.BOLD); sub.setLetterSpacing(0.3f);
        c.addView(sub, T.margins(T.lp(T.WRAP, T.WRAP), 0, 10, 0, 0));
        s.addView(c, new FrameLayout.LayoutParams(T.MATCH, T.MATCH));
        root.addView(s, new FrameLayout.LayoutParams(T.MATCH, T.MATCH));
        logo.setScaleX(0.7f); logo.setScaleY(0.7f); logo.setAlpha(0f);
        logo.animate().scaleX(1).scaleY(1).alpha(1).setDuration(600).setInterpolator(new DecelerateInterpolator(2)).start();
        n.setAlpha(0); n.setTranslationY(T.dp(14)); n.animate().alpha(1).translationY(0).setStartDelay(250).setDuration(500).start();
        sub.setAlpha(0); sub.animate().alpha(1).setStartDelay(450).setDuration(500).start();
        ui.postDelayed(new Runnable() { public void run() {
            s.animate().alpha(0).setDuration(350).withEndAction(new Runnable() { public void run() { root.removeView(s); } }).start();
        } }, 1500);
    }

    void about() {
        LinearLayout v = T.col(this); v.setPadding(T.dp(24), T.dp(24), T.dp(24), T.dp(12)); v.setGravity(Gravity.CENTER_HORIZONTAL);
        ImageView logo = new ImageView(this); logo.setImageResource(R.drawable.logo); v.addView(logo, T.lp(T.dp(84), T.dp(84)));
        TextView n = T.text(this, "", 26, T.WHITE, T.BLACK); n.setText(T.brand("Music", "Metric"));
        v.addView(n, T.margins(T.lp(T.WRAP, T.WRAP), 0, 14, 0, 0));
        v.addView(T.text(this, "Version 1.0  ·  SuperEssence Studio", 12, T.TEXT2, T.MEDIUM), T.margins(T.lp(T.WRAP, T.WRAP), 0, 6, 0, 14));
        TextView d = T.text(this, "Studio musical complet sur ton téléphone : effets slowed / speed / reverb / 8D, voix (séparation, justesse, studio), "
                + "remix, rallonge intelligente, ajout de batterie & 808, générateur de compositions et séquenceur.\n\n"
                + "Tout est calculé sur l'appareil, hors-ligne : tes fichiers ne quittent jamais ton téléphone.\n\n"
                + "Exports : Musique/MusicMetric (M4A 256 kbps ou WAV).", 13, T.WHITE, T.REGULAR);
        d.setLineSpacing(0, 1.2f); v.addView(d);
        AlertDialog dlg = new AlertDialog.Builder(this).setView(v).setPositiveButton("Fermer", null).create();
        dlg.show(); dlg.getWindow().setBackgroundDrawable(T.round(T.SURFACE, 8, T.STROKE, 1));
    }

    // ------------------------------------------------------------------ track state

    public AudioData track() { return track; }
    public String trackName() { return trackName; }
    public Analysis.Result info() { return info; }
    public boolean canUndo() { return !undo.isEmpty(); }
    public boolean canRedo() { return !redo.isEmpty(); }

    int undoDepth() { if (track == null) return 4; long mb = track.bytes() / (1024 * 1024); return (int) Math.max(1, Math.min(6, 160 / Math.max(1, mb))); }

    public void setTrack(AudioData a, String name, boolean keepHistory) {
        boolean wasPlaying = player.isPlaying(); int pos = player.position();
        if (keepHistory && track != null) {
            undo.add(track); undoNames.add(trackName);
            while (undo.size() > undoDepth()) { undo.remove(0); undoNames.remove(0); }
            redo.clear(); redoNames.clear();
        } else if (!keepHistory) { undo.clear(); redo.clear(); undoNames.clear(); redoNames.clear(); }
        boolean sameLength = track != null && a != null && track.length() == a.length();
        track = a; trackName = name;
        info = null;
        player.setData(a);
        if (keepHistory && sameLength) { player.seek(pos); if (wasPlaying) player.play(); }
        afterTrackChange();
    }

    void afterTrackChange() {
        refreshMini();
        for (Screen s : screens) s.onTrackChanged();
        final AudioData t = track; final int id = ++infoFor;
        if (t != null && info == null) new Thread(new Runnable() { public void run() {
            final Analysis.Result r = Analysis.analyze(t, Progress.NONE);
            ui.post(new Runnable() { public void run() { if (id == infoFor && track == t) { info = r; refreshMini(); for (Screen s : screens) s.onInfo(); } } });
        } }).start();
    }

    /** Blocking analysis for background jobs. */
    public Analysis.Result ensureInfo(AudioData a, Progress p) {
        Analysis.Result r = info;
        if (r != null && a == track) return r;
        r = Analysis.analyze(a, p);
        if (a == track) info = r;
        return r;
    }

    public void undo() {
        if (undo.isEmpty()) return;
        redo.add(track); redoNames.add(trackName);
        track = undo.remove(undo.size() - 1); trackName = undoNames.remove(undoNames.size() - 1);
        info = null; player.setData(track); afterTrackChange(); toast("Annulé");
    }

    public void redo() {
        if (redo.isEmpty()) return;
        undo.add(track); undoNames.add(trackName);
        track = redo.remove(redo.size() - 1); trackName = redoNames.remove(redoNames.size() - 1);
        info = null; player.setData(track); afterTrackChange(); toast("Rétabli");
    }

    public boolean requireTrack() {
        if (track != null) return true;
        toast("Importe ou génère d'abord une musique");
        selectTab(0);
        return false;
    }

    // ------------------------------------------------------------------ jobs

    /** Runs a job off the UI thread with a progress overlay; its result becomes the current track. */
    public void run(final String title, final String newName, final Job job) {
        if (busyNow) return;
        final boolean wasPlaying = player.isPlaying();
        player.pause();
        showBusy(title);
        new Thread(new Runnable() { public void run() {
            final long t0 = System.currentTimeMillis();
            try {
                final AudioData out = job.run(progress);
                ui.post(new Runnable() { public void run() {
                    hideBusy();
                    if (out != null) {
                        setTrack(out, newName != null ? newName : trackName, true);
                        toast(title + " ✓  (" + String.format(java.util.Locale.FRANCE, "%.1f", (System.currentTimeMillis() - t0) / 1000.0) + " s)");
                        if (wasPlaying) player.play();
                    }
                } });
            } catch (final OutOfMemoryError e) {
                ui.post(new Runnable() { public void run() { hideBusy(); error("Mémoire insuffisante : essaie avec un morceau plus court ou coupe une partie."); } });
            } catch (final Throwable e) {
                ui.post(new Runnable() { public void run() { hideBusy(); error(e.getMessage() == null ? e.toString() : e.getMessage()); } });
            }
        } }, "mm-job").start();
    }

    long lastProgress;
    final Progress progress = new Progress() {
        public void set(final float f, final String label) {
            long now = System.currentTimeMillis();
            if (label == null && now - lastProgress < 60 && f < 1) return;
            lastProgress = now;
            ui.post(new Runnable() { public void run() {
                busyBar.set(f); busyPct.setText(Math.round(Math.max(0, Math.min(1, f)) * 100) + " %");
                if (label != null) busyLabel.setText(label);
            } });
        }
    };

    View busyOverlay() {
        FrameLayout f = new FrameLayout(this); f.setBackgroundColor(0xE6000000); f.setClickable(true); f.setVisibility(View.GONE);
        LinearLayout card = T.col(this); card.setBackground(T.round(T.SURFACE, 8, T.STROKE, 1)); card.setPadding(T.dp(26), T.dp(26), T.dp(26), T.dp(24));
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        Spinner sp = new Spinner(this); card.addView(sp, T.lp(T.dp(64), T.dp(64)));
        busyTitle = T.text(this, "", 19, T.WHITE, T.BLACK); busyTitle.setGravity(Gravity.CENTER);
        card.addView(busyTitle, T.margins(T.lp(T.WRAP, T.WRAP), 0, 18, 0, 0));
        busyLabel = T.text(this, "", 13, T.TEXT2, T.MEDIUM); busyLabel.setGravity(Gravity.CENTER);
        card.addView(busyLabel, T.margins(T.lp(T.WRAP, T.WRAP), 0, 8, 0, 16));
        busyBar = new ProgressBarView(this); card.addView(busyBar, T.lp(T.MATCH, T.dp(8)));
        busyPct = T.text(this, "0 %", 12, T.Y, T.BOLD); card.addView(busyPct, T.margins(T.lp(T.WRAP, T.WRAP), 0, 10, 0, 0));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(T.MATCH, T.WRAP, Gravity.CENTER); lp.setMargins(T.dp(36), 0, T.dp(36), 0);
        f.addView(card, lp);
        return f;
    }

    void showBusy(String title) {
        busyNow = true; busyTitle.setText(title); busyLabel.setText("Traitement sur l'appareil…"); busyPct.setText("0 %"); busyBar.set(0);
        busy.setAlpha(0); busy.setVisibility(View.VISIBLE); busy.invalidate(); busy.animate().alpha(1).setDuration(150).start();
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    void hideBusy() {
        busyNow = false; getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        busy.animate().alpha(0).setDuration(150).withEndAction(new Runnable() { public void run() { busy.setVisibility(View.GONE); } }).start();
    }

    public void toast(String s) { Toast.makeText(this, s, Toast.LENGTH_SHORT).show(); }

    public void error(String msg) {
        AlertDialog d = new AlertDialog.Builder(this).setTitle("Oups").setMessage(msg).setPositiveButton("OK", null).create();
        d.show(); d.getWindow().setBackgroundDrawable(T.round(T.SURFACE, 8, T.STROKE, 1));
    }

    // ------------------------------------------------------------------ import / export

    public void pickAudio(AudioCallback cb) {
        pickCallback = cb;
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("audio/*");
        i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"audio/*", "video/mp4", "application/ogg"});
        try { startActivityForResult(i, REQ_PICK); }
        catch (Exception e) {
            Intent g = new Intent(Intent.ACTION_GET_CONTENT); g.setType("audio/*"); g.addCategory(Intent.CATEGORY_OPENABLE);
            try { startActivityForResult(g, REQ_PICK); } catch (Exception e2) { error("Aucun sélecteur de fichiers disponible."); }
        }
    }

    public void importMain() {
        pickAudio(null);
    }

    @Override protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_PICK) {
            AudioCallback cb = pickCallback; pickCallback = null;
            if (res == RESULT_OK && data != null && data.getData() != null) importUri(data.getData(), cb);
        }
    }

    void importUri(final Uri uri, final AudioCallback cb) {
        if (busyNow) return;
        final String name = Storage.displayName(this, uri);
        if (cb == null) player.stop();
        showBusy(cb == null ? "Import" : "Chargement");
        busyLabel.setText(name);
        new Thread(new Runnable() { public void run() {
            try {
                final AudioData a = Codec.decode(MainActivity.this, uri, progress);
                ui.post(new Runnable() { public void run() {
                    hideBusy();
                    if (cb != null) cb.onAudio(a, name);
                    else { setTrack(a, name, false); selectTab(0); toast("« " + name + " » importé"); }
                } });
            } catch (final OutOfMemoryError e) {
                ui.post(new Runnable() { public void run() { hideBusy(); error("Fichier trop long pour la mémoire du téléphone."); } });
            } catch (final Throwable e) {
                ui.post(new Runnable() { public void run() { hideBusy(); error("Import impossible : " + e.getMessage()); } });
            }
        } }).start();
    }

    public void export() {
        if (!requireTrack()) return;
        if (Build.VERSION.SDK_INT < 29 && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            pendingAfterPermission = new Runnable() { public void run() { export(); } };
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_WRITE); return;
        }
        LinearLayout v = T.col(this); v.setPadding(T.dp(22), T.dp(22), T.dp(22), T.dp(8));
        v.addView(T.text(this, "Exporter", 22, T.WHITE, T.BLACK));
        v.addView(T.label(this, "Nom du fichier"));
        final EditText et = new EditText(this); et.setText(trackName); et.setTextColor(T.WHITE); et.setSingleLine(true);
        et.setInputType(InputType.TYPE_CLASS_TEXT); et.setBackground(T.round(T.SURFACE2, 14, T.STROKE, 1)); et.setPadding(T.dp(14), T.dp(12), T.dp(14), T.dp(12));
        v.addView(et, T.lp(T.MATCH, T.WRAP));
        v.addView(T.label(this, "Format"));
        final T.Chips fmt = new T.Chips(this, new String[]{"M4A · 256 kbps", "WAV · qualité studio"}, 0, false);
        v.addView(fmt.view);
        TextView where = T.text(this, "Enregistré dans Musique/MusicMetric", 12, T.TEXT3, T.MEDIUM);
        v.addView(where, T.margins(T.lp(T.WRAP, T.WRAP), 0, 14, 0, 0));
        final AlertDialog d = new AlertDialog.Builder(this).setView(v).setNegativeButton("Annuler", null).setPositiveButton("Exporter", null).create();
        d.show(); d.getWindow().setBackgroundDrawable(T.round(T.SURFACE, 8, T.STROKE, 1));
        d.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(new View.OnClickListener() { public void onClick(View x) {
            d.dismiss(); doExport(et.getText().toString(), fmt.selected() == 0);
        } });
    }

    void doExport(final String name, final boolean m4a) {
        final AudioData a = track; player.pause(); showBusy("Export"); busyLabel.setText(m4a ? "Encodage AAC…" : "Écriture WAV…");
        new Thread(new Runnable() { public void run() {
            try {
                final Storage.Saved s = Storage.save(MainActivity.this, a, name, m4a, progress);
                ui.post(new Runnable() { public void run() { hideBusy(); exported(s); } });
            } catch (final Throwable e) {
                ui.post(new Runnable() { public void run() { hideBusy(); error("Export impossible : " + e.getMessage()); } });
            }
        } }).start();
    }

    void exported(final Storage.Saved s) {
        AlertDialog d = new AlertDialog.Builder(this).setTitle("Exporté ✓").setMessage(s.path)
                .setPositiveButton("Partager", new android.content.DialogInterface.OnClickListener() {
                    public void onClick(android.content.DialogInterface di, int w) { share(s.uri); }
                }).setNegativeButton("OK", null).create();
        d.show(); d.getWindow().setBackgroundDrawable(T.round(T.SURFACE, 8, T.STROKE, 1));
    }

    void share(Uri u) {
        if (u == null) { toast("Fichier enregistré dans Musique/MusicMetric"); return; }
        Intent i = new Intent(Intent.ACTION_SEND); i.setType("audio/*"); i.putExtra(Intent.EXTRA_STREAM, u); i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        startActivity(Intent.createChooser(i, "Partager"));
    }

    @Override public void onRequestPermissionsResult(int req, String[] perms, int[] res) {
        super.onRequestPermissionsResult(req, perms, res);
        Runnable r = pendingAfterPermission; pendingAfterPermission = null;
        if (res.length > 0 && res[0] == PackageManager.PERMISSION_GRANTED) { if (r != null) r.run(); }
        else toast("Autorisation refusée");
    }

    // ------------------------------------------------------------------ microphone

    /** Records from the mic. overBacking = play the current track meanwhile and mix the take on top. */
    public void record(final boolean overBacking, final AudioCallback cb) {
        if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingAfterPermission = new Runnable() { public void run() { record(overBacking, cb); } };
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, REQ_MIC); return;
        }
        final int sr = AudioData.SR;
        final int min = AudioRecord.getMinBufferSize(sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        final AudioRecord rec;
        try {
            rec = new AudioRecord(MediaRecorder.AudioSource.MIC, sr, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, Math.max(min * 4, 8192));
            if (rec.getState() != AudioRecord.STATE_INITIALIZED) throw new IllegalStateException();
        } catch (Exception e) { error("Micro indisponible."); return; }

        final FrameLayout ov = new FrameLayout(this); ov.setBackgroundColor(0xF0000000); ov.setClickable(true);
        LinearLayout c = T.col(this); c.setGravity(Gravity.CENTER);
        final TextView title = T.text(this, overBacking ? "Enregistrement sur la musique" : "Enregistrement", 16, T.TEXT2, T.BOLD);
        c.addView(title);
        final TextView time = T.text(this, "0:00", 56, T.WHITE, T.BLACK); c.addView(time, T.margins(T.lp(T.WRAP, T.WRAP), 0, 10, 0, 20));
        final LevelView lvl = new LevelView(this); c.addView(lvl, T.margins(T.lp(T.MATCH, T.dp(70)), 40, 0, 40, 30));
        if (overBacking) c.addView(T.text(this, "Utilise des écouteurs pour un résultat propre", 12, T.TEXT3, T.MEDIUM), T.margins(T.lp(T.WRAP, T.WRAP), 0, 0, 0, 24));
        final boolean[] stop = {false};
        LinearLayout stopBtn = T.button(this, "Terminer", Icon.STOP, true, new View.OnClickListener() { public void onClick(View v) { stop[0] = true; } });
        c.addView(stopBtn, T.lp(T.dp(200), T.dp(56)));
        ov.addView(c, new FrameLayout.LayoutParams(T.MATCH, T.MATCH));
        root.addView(ov, new FrameLayout.LayoutParams(T.MATCH, T.MATCH));
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final AudioData backing = overBacking ? track : null;
        new Thread(new Runnable() { public void run() {
            short[] buf = new short[2048]; float[] acc = new float[sr * 30]; int n = 0; int startPos = 0; boolean first = true;
            try {
                if (backing != null) { player.seek(0); player.play(); }
                rec.startRecording();
                long maxN = (long) sr * 600;
                while (!stop[0] && n < maxN) {
                    int r = rec.read(buf, 0, buf.length); if (r <= 0) continue;
                    if (first && backing != null) { startPos = player.position(); first = false; }
                    if (n + r > acc.length) { float[] b2 = new float[acc.length * 2]; System.arraycopy(acc, 0, b2, 0, n); acc = b2; }
                    float pk = 0;
                    for (int i = 0; i < r; i++) { float v = buf[i] / 32768f; acc[n + i] = v; pk = Math.max(pk, Math.abs(v)); }
                    n += r;
                    final float fp = pk; final int fn = n;
                    ui.post(new Runnable() { public void run() { lvl.push(fp); time.setText(Analysis.time(fn / (double) sr)); } });
                    if (backing != null && !player.isPlaying()) break;
                }
            } catch (Exception ignored) { }
            try { rec.stop(); } catch (Exception ignored) { }
            rec.release();
            if (backing != null) player.pause();
            final float[] take = new float[n]; System.arraycopy(acc, 0, take, 0, n);
            final int offset = startPos;
            ui.post(new Runnable() { public void run() {
                root.removeView(ov); getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                if (take.length < sr / 4) { toast("Enregistrement trop court"); return; }
                AudioData voice = new AudioData(take, take.clone());
                if (backing == null) { cb.onAudio(voice, "Enregistrement micro"); return; }
                AudioData mix = backing.copy().padTo(Math.max(backing.length(), offset + voice.length()));
                float pk = voice.peak(); float g = pk > 0 ? Math.min(4f, 0.8f / pk) : 1f;
                mix.mix(voice, offset, g * 0.9f);
                cb.onAudio(com.superessence.musicmetric.audio.Dsp.master(mix), trackName + " + voix");
            } });
        } }, "mm-rec").start();
    }

    // ------------------------------------------------------------------ small custom views

    static final class Spinner extends View {
        final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG), bg = new Paint(Paint.ANTI_ALIAS_FLAG); final RectF rf = new RectF();
        Spinner(android.content.Context c) {
            super(c); p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND); p.setColor(T.Y); p.setStrokeWidth(T.dpf(5));
            bg.setStyle(Paint.Style.STROKE); bg.setColor(T.SURFACE3); bg.setStrokeWidth(T.dpf(5));
        }
        @Override protected void onDraw(Canvas c) {
            float s = T.dpf(4); rf.set(s, s, getWidth() - s, getHeight() - s);
            float a = (android.os.SystemClock.uptimeMillis() % 900) / 900f * 360f;
            c.drawOval(rf, bg); c.drawArc(rf, a, 100, false, p);
            if (isShown()) postInvalidateDelayed(16);
        }
    }

    static final class ProgressBarView extends View {
        final Paint b = new Paint(Paint.ANTI_ALIAS_FLAG), f = new Paint(Paint.ANTI_ALIAS_FLAG); final RectF rf = new RectF(); float v;
        ProgressBarView(android.content.Context c) { super(c); b.setColor(T.SURFACE3); f.setColor(T.Y); }
        void set(float x) { v = Math.max(0, Math.min(1, x)); invalidate(); }
        @Override protected void onDraw(Canvas c) {
            float h = getHeight(); rf.set(0, 0, getWidth(), h); c.drawRoundRect(rf, h, h, b);
            rf.set(0, 0, Math.max(h, getWidth() * v), h); c.drawRoundRect(rf, h, h, f);
        }
    }

    static final class LevelView extends View {
        final float[] hist = new float[48]; int idx; final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG); final RectF rf = new RectF();
        LevelView(android.content.Context c) { super(c); p.setColor(T.Y); }
        void push(float v) { hist[idx] = v; idx = (idx + 1) % hist.length; invalidate(); }
        @Override protected void onDraw(Canvas c) {
            float bw = getWidth() / (float) hist.length, h = getHeight(), mid = h / 2;
            for (int i = 0; i < hist.length; i++) {
                float v = hist[(idx + i) % hist.length]; float a = Math.max(T.dpf(2), (float) Math.sqrt(v) * h / 2);
                rf.set(i * bw + 1, mid - a, (i + 1) * bw - 2, mid + a); c.drawRoundRect(rf, 4, 4, p);
            }
        }
    }

}
