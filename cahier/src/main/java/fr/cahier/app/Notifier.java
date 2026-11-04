package fr.cahier.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

/** Affiche chaque note comme une notification permanente. */
public final class Notifier {
    static final String CHANNEL = "notes";
    static final String GROUP = "fr.cahier.app.NOTES";

    private Notifier() {}

    private static NotificationManager nm(Context c) {
        return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Mes notes", NotificationManager.IMPORTANCE_LOW);
            ch.setDescription("Les notes et choses à faire restent affichées ici");
            ch.setShowBadge(true);
            nm(c).createNotificationChannel(ch);
        }
    }

    private static int flags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0);
    }

    @SuppressWarnings("deprecation")
    public static void show(Context c, Note n) {
        ensureChannel(c);
        Intent open = new Intent(c, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPi = PendingIntent.getActivity(c, n.id, open, flags());

        Intent done = new Intent(c, NoteReceiver.class).setAction(NoteReceiver.ACTION_DONE).putExtra(NoteReceiver.EXTRA_ID, n.id);
        PendingIntent donePi = PendingIntent.getBroadcast(c, n.id, done, flags());

        // Si la notification est balayée (Android 14+ le permet), on la réaffiche.
        Intent again = new Intent(c, NoteReceiver.class).setAction(NoteReceiver.ACTION_REPOST).putExtra(NoteReceiver.EXTRA_ID, n.id);
        PendingIntent againPi = PendingIntent.getBroadcast(c, 100000 + n.id, again, flags());

        String text = n.text.trim();
        String first = text.contains("\n") ? text.substring(0, text.indexOf('\n')) : text;

        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, CHANNEL) : new Notification.Builder(c);
        b.setSmallIcon(R.drawable.ic_note)
                .setContentTitle(first)
                .setContentText(text.equals(first) ? "Cahier" : text.substring(first.length()).trim())
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(true)
                .setShowWhen(true)
                .setWhen(n.created)
                .setColor(0xFF2F6B4F)
                .setContentIntent(openPi)
                .setDeleteIntent(againPi)
                .setCategory(Notification.CATEGORY_REMINDER)
                .addAction(new Notification.Action.Builder(null, "✓ Fait", donePi).build());
        if (Build.VERSION.SDK_INT < 26) b.setPriority(Notification.PRIORITY_LOW);
        try {
            nm(c).notify(n.id, b.build());
        } catch (SecurityException ignored) {
            // permission de notification refusée
        }
    }

    public static void cancel(Context c, int id) {
        nm(c).cancel(id);
    }

    public static void showAll(Context c) {
        for (Note n : NoteStore.all(c)) show(c, n);
    }

    public static boolean enabled(Context c) {
        return Build.VERSION.SDK_INT < 24 || nm(c).areNotificationsEnabled();
    }
}
