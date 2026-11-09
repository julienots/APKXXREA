package com.blazeprotect.av;

import android.app.Notification;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Environment;
import android.os.FileObserver;
import android.os.IBinder;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/**
 * Real-time protection: every newly installed or updated application and every file that lands
 * in the watched folders is analysed immediately.
 */
public class ShieldService extends Service {
    private static final int FGS_SPECIAL_USE = 0x40000000;

    private BroadcastReceiver packages;
    private final List<FileObserver> observers = new ArrayList<>();

    public static void sync(Context c) {
        Intent i = new Intent(c, ShieldService.class);
        if (Store.realtime(c)) {
            try {
                if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
            } catch (Exception ignored) {
            }
        } else {
            c.stopService(i);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        Notifier.channels(this);
        Notification n = Notifier.builder(this, Notifier.CH_SHIELD)
                .setContentTitle("Protection active")
                .setContentText("Installations et téléchargements surveillés en temps réel")
                .setOngoing(true)
                .setContentIntent(Notifier.activity(this, new Intent(this, MainActivity.class), 1))
                .build();
        if (Build.VERSION.SDK_INT >= 29) startForeground(Notifier.ID_SHIELD, n, FGS_SPECIAL_USE);
        else startForeground(Notifier.ID_SHIELD, n);

        packages = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (intent.getData() == null) return;
                final String pkg = intent.getData().getSchemeSpecificPart();
                final boolean update = Intent.ACTION_PACKAGE_REPLACED.equals(intent.getAction());
                if (!update && intent.getBooleanExtra(Intent.EXTRA_REPLACING, false)) return;
                final PendingResult pr = goAsync();
                new Thread(new Runnable() {
                    @Override public void run() {
                        try { onPackage(pkg, update); } finally { pr.finish(); }
                    }
                }).start();
            }
        };
        IntentFilter f = new IntentFilter();
        f.addAction(Intent.ACTION_PACKAGE_ADDED);
        f.addAction(Intent.ACTION_PACKAGE_REPLACED);
        f.addDataScheme("package");
        registerReceiver(packages, f);
        startWatching();
        Journal.log(this, Journal.INFO, "Protection en temps réel démarrée", null);
    }

    @SuppressWarnings("deprecation")
    private void startWatching() {
        if (!Store.flag(this, Store.K_WATCH_DOWNLOADS, true)) return;
        File root = Environment.getExternalStorageDirectory();
        File[] dirs = {
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                new File(root, "Bluetooth"),
                Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        };
        for (final File d : dirs) {
            if (!d.isDirectory()) continue;
            FileObserver o = new FileObserver(d.getAbsolutePath(), FileObserver.CLOSE_WRITE | FileObserver.MOVED_TO) {
                @Override public void onEvent(int event, String path) {
                    if (path == null || path.startsWith(".")) return;
                    onFile(new File(d, path));
                }
            };
            o.startWatching();
            observers.add(o);
        }
    }

    private void onPackage(String pkg, boolean update) {
        if (pkg.equals(getPackageName())) return;
        Threat t = Scanner.scanApp(this, pkg, true, null);
        Journal.log(this, t.isThreat() ? Journal.ALERT : Journal.SCAN,
                (update ? "Mise à jour analysée : " : "Nouvelle application analysée : ") + t.label,
                t.isThreat() ? t.detection : "Aucune menace");
        if (t.isThreat() && !Store.isTrusted(this, pkg)) {
            addToReport(t);
            Notifier.threat(this, t);
        } else if (!update && Store.flag(this, "notify_clean", true)) {
            Notifier.info(this, "« " + t.label + " » analysée", "Aucune menace détectée dans la nouvelle application.",
                    new Intent(this, AppDetailActivity.class).putExtra("pkg", pkg));
        }
    }

    private void onFile(final File f) {
        new Thread(new Runnable() {
            @Override public void run() {
                if (!f.isFile()) return;
                Threat t = Scanner.scanFile(ShieldService.this, f, null);
                if (t.isThreat() && !Store.isTrusted(ShieldService.this, t.id)) {
                    Journal.log(ShieldService.this, Journal.ALERT, "Fichier dangereux téléchargé", f.getAbsolutePath());
                    addToReport(t);
                    Notifier.threat(ShieldService.this, t);
                }
            }
        }).start();
    }

    private synchronized void addToReport(Threat t) {
        List<Threat> l = Store.loadReport(this);
        List<Threat> keep = new ArrayList<>();
        for (Threat x : l) if (!x.id.equals(t.id)) keep.add(x);
        keep.add(0, t);
        Store.saveReport(this, keep);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        try { unregisterReceiver(packages); } catch (Exception ignored) { }
        for (FileObserver o : observers) o.stopWatching();
        observers.clear();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
