package com.blazeprotect.av;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Notification channels and alert helpers. */
public final class Notifier {
    private Notifier() {}

    public static final String CH_SHIELD = "shield";
    public static final String CH_ALERTS = "alerts";
    public static final String CH_INFO = "info";
    public static final int ID_SHIELD = 1;
    private static int nextId = 100;

    static final int IMMUTABLE = 0x04000000; // PendingIntent.FLAG_IMMUTABLE (API 23)

    public static void channels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel shield = new NotificationChannel(CH_SHIELD, "Protection en temps réel", NotificationManager.IMPORTANCE_MIN);
        shield.setDescription("Indique que le bouclier surveille l'appareil.");
        shield.setShowBadge(false);
        NotificationChannel alerts = new NotificationChannel(CH_ALERTS, "Alertes de sécurité", NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription("Menaces détectées sur les applications et les fichiers.");
        alerts.enableVibration(true);
        NotificationChannel info = new NotificationChannel(CH_INFO, "Comptes rendus", NotificationManager.IMPORTANCE_LOW);
        info.setDescription("Résultats des analyses programmées et des nouvelles installations.");
        nm.createNotificationChannel(shield);
        nm.createNotificationChannel(alerts);
        nm.createNotificationChannel(info);
    }

    @SuppressWarnings("deprecation")
    public static Notification.Builder builder(Context c, String channel) {
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, channel) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_stat_shield).setColor(Ui.ACCENT);
        if (Build.VERSION.SDK_INT < 26) {
            b.setPriority(CH_ALERTS.equals(channel) ? Notification.PRIORITY_HIGH
                    : CH_SHIELD.equals(channel) ? Notification.PRIORITY_MIN : Notification.PRIORITY_LOW);
        }
        return b;
    }

    public static PendingIntent activity(Context c, Intent i, int req) {
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | IMMUTABLE);
    }

    public static void threat(Context c, Threat t) {
        Intent open = new Intent(c, ResultsActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        String what = Threat.KIND_APP.equals(t.kind) ? "Application" : "Fichier";
        Notification n = builder(c, CH_ALERTS)
                .setContentTitle("Menace détectée : " + t.label)
                .setContentText(what + " — " + (t.detection != null ? t.detection : Threat.levelName(t.level)))
                .setStyle(new Notification.BigTextStyle().bigText(what + " « " + t.label + " »\n"
                        + (t.detection != null ? t.detection : "") + "\nTouchez pour neutraliser la menace."))
                .setContentIntent(activity(c, open, 2))
                .setAutoCancel(true)
                .setCategory(Notification.CATEGORY_ERROR)
                .build();
        notify(c, n);
    }

    public static void info(Context c, String title, String text, Intent open) {
        Notification.Builder b = builder(c, CH_INFO)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setAutoCancel(true);
        if (open != null) b.setContentIntent(activity(c, open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), 3));
        notify(c, b.build());
    }

    private static synchronized void notify(Context c, Notification n) {
        try {
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            nm.notify(nextId++, n);
        } catch (Exception ignored) {
        }
    }
}
