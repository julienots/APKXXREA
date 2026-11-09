package com.blazeprotect.av;

import android.app.Application;
import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;

/** Process-wide entry points: application start, boot, scheduled scans. */
public final class Receivers {
    private Receivers() {}

    public static class App extends Application {
        @Override public void onCreate() {
            super.onCreate();
            Notifier.channels(this);
        }
    }

    public static class Boot extends BroadcastReceiver {
        @Override public void onReceive(Context c, Intent i) {
            String a = i.getAction();
            if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
                ShieldService.sync(c);
                ScheduledScan.schedule(c);
            }
        }
    }

    public static class ScheduledScan extends JobService implements ScanManager.Listener {
        private static final int JOB_ID = 7001;
        private JobParameters params;

        public static void schedule(Context c) {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            int days = Store.integer(c, Store.K_SCHEDULE, 1);
            if (days <= 0) {
                js.cancel(JOB_ID);
                return;
            }
            JobInfo job = new JobInfo.Builder(JOB_ID, new ComponentName(c, ScheduledScan.class))
                    .setPeriodic(days * 24L * 3600 * 1000)
                    .setRequiresBatteryNotLow(true)
                    .setPersisted(true)
                    .build();
            try {
                js.schedule(job);
            } catch (Exception ignored) {
            }
        }

        @Override public boolean onStartJob(JobParameters p) {
            params = p;
            ScanManager sm = ScanManager.get(this);
            sm.addListener(this);
            if (!sm.start(ScanManager.QUICK)) {
                sm.removeListener(this);
                return false;
            }
            return true;
        }

        @Override public void onScanUpdate(ScanManager.State s) {
            if (s.running) return;
            ScanManager.get(this).removeListener(this);
            if (!s.cancelled) {
                if (s.threats.isEmpty()) {
                    Notifier.info(this, "Analyse programmée terminée",
                            "Aucune menace — " + Ui.plural(s.apps + s.files, "élément analysé", "éléments analysés") + ".",
                            new Intent(this, MainActivity.class));
                } else {
                    for (Threat t : s.threats) Notifier.threat(this, t);
                }
            }
            jobFinished(params, false);
        }

        @Override public boolean onStopJob(JobParameters p) {
            ScanManager.get(this).removeListener(this);
            ScanManager.get(this).cancel();
            return true;
        }
    }
}
