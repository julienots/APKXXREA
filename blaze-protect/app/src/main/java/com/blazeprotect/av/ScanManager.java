package com.blazeprotect.av;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;

import java.io.File;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/** Runs scans on a worker thread and publishes progress to listeners on the main thread. */
public final class ScanManager {
    public interface CancelFlag { boolean cancelled(); }

    public interface Listener { void onScanUpdate(State s); }

    public static final int QUICK = 0;
    public static final int FULL = 1;
    public static final int APPS = 2;
    public static final int STORAGE = 3;

    public static String typeName(int type) {
        switch (type) {
            case FULL: return "Analyse complète";
            case APPS: return "Analyse des applications";
            case STORAGE: return "Analyse du stockage";
            default: return "Analyse rapide";
        }
    }

    public static final class State {
        public int type;
        public volatile boolean running;
        public volatile boolean cancelled;
        public volatile String phase = "";
        public volatile String current = "";
        public volatile int done;
        public volatile int total;
        public volatile int apps;
        public volatile int files;
        public long start;
        public long end;
        public final List<Threat> threats = new CopyOnWriteArrayList<>();
    }

    private static ScanManager instance;
    private final Context app;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final List<Listener> listeners = new CopyOnWriteArrayList<>();
    private volatile State state;
    private volatile boolean cancel;
    private long lastPost;

    private final CancelFlag flag = new CancelFlag() {
        @Override public boolean cancelled() { return cancel; }
    };

    private ScanManager(Context c) { app = c.getApplicationContext(); }

    public static synchronized ScanManager get(Context c) {
        if (instance == null) instance = new ScanManager(c);
        return instance;
    }

    public State state() { return state; }

    public boolean running() { return state != null && state.running; }

    public void addListener(Listener l) { listeners.add(l); }

    public void removeListener(Listener l) { listeners.remove(l); }

    public void cancel() { cancel = true; }

    public synchronized boolean start(final int type) {
        if (running()) return false;
        final State s = new State();
        s.type = type;
        s.running = true;
        s.start = System.currentTimeMillis();
        state = s;
        cancel = false;
        Thread t = new Thread(new Runnable() {
            @Override public void run() { execute(s); }
        }, "blaze-scan");
        t.setPriority(Thread.NORM_PRIORITY - 1);
        t.start();
        post(s, true);
        return true;
    }

    private void execute(State s) {
        try {
            boolean apps = s.type == QUICK || s.type == FULL || s.type == APPS;
            boolean storage = s.type == QUICK || s.type == FULL || s.type == STORAGE;
            if (apps) scanApps(s);
            if (storage && !cancel) scanStorage(s);
        } catch (Throwable ignored) {
        }
        s.cancelled = cancel;
        s.end = System.currentTimeMillis();
        s.running = false;
        if (!s.cancelled) {
            Store.saveReport(app, new ArrayList<>(s.threats));
            Store.prefs(app).edit()
                    .putLong(Store.K_LAST_SCAN, s.end)
                    .putInt(Store.K_LAST_SCAN_TYPE, s.type)
                    .putInt(Store.K_LAST_SCAN_ITEMS, s.apps + s.files)
                    .putInt(Store.K_TOTAL_SCANS, Store.integer(app, Store.K_TOTAL_SCANS, 0) + 1)
                    .putInt(Store.K_TOTAL_THREATS, Store.integer(app, Store.K_TOTAL_THREATS, 0) + s.threats.size())
                    .apply();
        }
        Journal.log(app, s.threats.isEmpty() ? Journal.SCAN : Journal.ALERT,
                typeName(s.type) + (s.cancelled ? " interrompue" : " terminée"),
                Ui.plural(s.apps, "application", "applications") + ", " + Ui.plural(s.files, "fichier", "fichiers")
                        + " — " + Ui.plural(s.threats.size(), "menace", "menaces"));
        post(s, true);
    }

    private void scanApps(State s) {
        PackageManager pm = app.getPackageManager();
        boolean includeSystem = s.type == FULL || Store.flag(app, Store.K_SYSTEM, false);
        List<ApplicationInfo> all;
        try {
            all = pm.getInstalledApplications(0);
        } catch (Exception e) {
            return;
        }
        List<ApplicationInfo> list = new ArrayList<>();
        for (ApplicationInfo ai : all) {
            if (ai.packageName.equals(app.getPackageName())) continue;
            if (Scanner.isUserVisibleApp(ai, includeSystem)) list.add(ai);
        }
        s.phase = "Applications";
        s.total = list.size();
        s.done = 0;
        for (ApplicationInfo ai : list) {
            if (cancel) return;
            s.current = Scanner.label(pm, ai);
            post(s, false);
            boolean hash = s.type != QUICK || !Scanner.TRUSTED_STORES.contains(Scanner.installer(pm, ai.packageName));
            Threat t = Scanner.scanApp(app, ai.packageName, hash, flag);
            if (t.isThreat() && !Store.isTrusted(app, t.id)) s.threats.add(t);
            s.apps++;
            s.done++;
        }
    }

    private void scanStorage(State s) {
        File root = Environment.getExternalStorageDirectory();
        List<File> roots = new ArrayList<>();
        if (s.type == QUICK) {
            roots.add(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS));
            roots.add(new File(root, "Bluetooth"));
            roots.add(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS));
        } else {
            roots.add(root);
        }
        s.phase = "Inventaire des fichiers";
        s.current = "";
        post(s, true);
        List<File> files = new ArrayList<>();
        ArrayDeque<File> stack = new ArrayDeque<>();
        for (File r : roots) if (r.isDirectory()) stack.push(r);
        String skipData = new File(root, "Android/data").getAbsolutePath();
        String skipObb = new File(root, "Android/obb").getAbsolutePath();
        while (!stack.isEmpty() && !cancel) {
            File d = stack.pop();
            String p = d.getAbsolutePath();
            if (p.equals(skipData) || p.equals(skipObb)) continue;
            File[] kids = d.listFiles();
            if (kids == null) continue;
            for (File k : kids) {
                if (k.isDirectory()) stack.push(k);
                else if (k.isFile()) files.add(k);
            }
        }
        s.phase = "Fichiers";
        s.total = files.size();
        s.done = 0;
        for (File f : files) {
            if (cancel) return;
            s.current = f.getName();
            post(s, false);
            Threat t = Scanner.scanFile(app, f, flag);
            if (t.isThreat() && !Store.isTrusted(app, t.id)) s.threats.add(t);
            s.files++;
            s.done++;
        }
    }

    private void post(final State s, boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - lastPost < 90) return;
        lastPost = now;
        main.post(new Runnable() {
            @Override public void run() {
                for (Listener l : listeners) l.onScanUpdate(s);
            }
        });
    }
}
