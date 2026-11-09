package com.blazeprotect.av;

import android.app.Activity;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;

/** Storage and notification access checks, plus the shortcuts that let the user grant them. */
public final class Perms {
    private Perms() {}

    public static final int REQ_STORAGE = 41;

    /** True when the app can walk shared storage and delete files from it. */
    public static boolean storage(Context c) {
        if (Build.VERSION.SDK_INT >= 30) {
            try {
                Object r = Environment.class.getMethod("isExternalStorageManager").invoke(null);
                if (Boolean.TRUE.equals(r)) return true;
            } catch (Exception ignored) {
            }
        }
        return c.checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
                && c.checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    public static void requestStorage(Activity a) {
        if (Build.VERSION.SDK_INT >= 30) {
            Uri pkg = Uri.parse("package:" + a.getPackageName());
            if (start(a, new Intent("android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION", pkg))) return;
            if (start(a, new Intent("android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION"))) return;
        }
        a.requestPermissions(new String[]{
                android.Manifest.permission.READ_EXTERNAL_STORAGE,
                android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
    }

    public static boolean notifications(Context c) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        return nm == null || nm.areNotificationsEnabled();
    }

    public static void openNotificationSettings(Activity a) {
        if (Build.VERSION.SDK_INT >= 26) {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, a.getPackageName());
            if (start(a, i)) return;
        }
        openAppSettings(a, a.getPackageName());
    }

    public static void openAppSettings(Activity a, String pkg) {
        start(a, new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)));
    }

    public static boolean start(Activity a, Intent i) {
        try {
            a.startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
