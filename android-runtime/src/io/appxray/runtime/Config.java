package io.appxray.runtime;

import android.app.Activity;
import android.content.Context;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Description of the rebuilt app produced by APPXRAY (assets/appxray/app.json):
 * screens (view trees), theme colours, launcher screen and enabled features.
 */
final class Config {
    private static JSONObject cached;

    static JSONObject get(Context c) {
        if (cached == null) {
            try {
                InputStream in = c.getAssets().open("appxray/app.json");
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                in.close();
                cached = new JSONObject(out.toString("UTF-8"));
            } catch (Exception e) {
                throw new IllegalStateException("app.json illisible", e);
            }
        }
        return cached;
    }

    static int color(String hex, int fallback) {
        if (hex == null || hex.length() == 0) return fallback;
        try {
            return Color.parseColor(hex);
        } catch (Exception e) {
            return fallback;
        }
    }

    static int themeColor(Context c, String name, int fallback) {
        JSONObject colors = get(c).optJSONObject("colors");
        return colors == null ? fallback : color(colors.optString(name, null), fallback);
    }

    static void applyTheme(Activity a, String title) {
        int primary = themeColor(a, "primary", 0xFF2F6BFF);
        int dark = themeColor(a, "primaryDark", 0xFF0050B3);
        int bg = themeColor(a, "background", 0xFFFFFFFF);
        if (a.getActionBar() != null) {
            a.getActionBar().setBackgroundDrawable(new ColorDrawable(primary));
            a.getActionBar().setTitle(title != null && title.length() > 0 ? title : get(a).optString("appName", ""));
        }
        if (Build.VERSION.SDK_INT >= 21) a.getWindow().setStatusBarColor(dark);
        a.getWindow().setBackgroundDrawable(new ColorDrawable(bg));
    }
}
