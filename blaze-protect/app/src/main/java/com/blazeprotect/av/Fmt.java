package com.blazeprotect.av;

import android.content.pm.PackageManager;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/** French-language formatting of dates, durations, sizes and install sources. */
public final class Fmt {
    private Fmt() {}

    private static final Locale FR = Locale.FRANCE;

    public static String ago(long t) {
        if (t <= 0) return "jamais";
        long d = System.currentTimeMillis() - t;
        if (d < 60_000) return "à l'instant";
        if (d < 3_600_000) return "il y a " + (d / 60_000) + " min";
        if (d < 86_400_000) return "il y a " + (d / 3_600_000) + " h";
        long days = d / 86_400_000;
        if (days == 1) return "hier";
        if (days < 30) return "il y a " + days + " jours";
        return "le " + date(t);
    }

    public static String date(long t) {
        return new SimpleDateFormat("d MMM yyyy", FR).format(new Date(t));
    }

    public static String dateTime(long t) {
        return new SimpleDateFormat("d MMM yyyy 'à' HH:mm", FR).format(new Date(t));
    }

    public static String time(long t) {
        return new SimpleDateFormat("HH:mm", FR).format(new Date(t));
    }

    /** Day heading for grouped lists: "Aujourd'hui", "Hier" or a full date. */
    public static String day(long t) {
        Calendar now = Calendar.getInstance();
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(t);
        if (same(now, c)) return "Aujourd'hui";
        now.add(Calendar.DAY_OF_YEAR, -1);
        if (same(now, c)) return "Hier";
        return new SimpleDateFormat("EEEE d MMMM yyyy", FR).format(new Date(t));
    }

    private static boolean same(Calendar a, Calendar b) {
        return a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
    }

    public static String duration(long ms) {
        long s = Math.max(0, ms / 1000);
        if (s < 60) return s + " s";
        return (s / 60) + " min " + String.format(FR, "%02d", s % 60) + " s";
    }

    public static String size(long b) {
        if (b < 1024) return b + " o";
        if (b < 1024 * 1024) return String.format(FR, "%.1f Ko", b / 1024f);
        if (b < 1024L * 1024 * 1024) return String.format(FR, "%.1f Mo", b / (1024f * 1024));
        return String.format(FR, "%.2f Go", b / (1024f * 1024 * 1024));
    }

    public static String installer(PackageManager pm, String pkg) {
        String i = Scanner.installer(pm, pkg);
        if (i == null) return "Source inconnue (installation manuelle)";
        switch (i) {
            case "com.android.vending": return "Google Play";
            case "com.amazon.venezia": return "Amazon Appstore";
            case "com.sec.android.app.samsungapps": return "Galaxy Store";
            case "com.huawei.appmarket": return "AppGallery";
            case "com.xiaomi.market": return "GetApps (Xiaomi)";
            case "com.heytap.market":
            case "com.oppo.market": return "App Market (Oppo)";
            case "com.bbk.appstore": return "V-Appstore (Vivo)";
            case "org.fdroid.fdroid": return "F-Droid";
            case "com.google.android.packageinstaller":
            case "com.android.packageinstaller": return "Installateur de paquets (fichier APK)";
            case "com.android.shell": return "ADB (ordinateur)";
            default:
                try {
                    return pm.getApplicationLabel(pm.getApplicationInfo(i, 0)) + " (" + i + ")";
                } catch (Exception e) {
                    return i;
                }
        }
    }

    public static boolean fromTrustedStore(PackageManager pm, String pkg) {
        return Scanner.TRUSTED_STORES.contains(Scanner.installer(pm, pkg));
    }
}
