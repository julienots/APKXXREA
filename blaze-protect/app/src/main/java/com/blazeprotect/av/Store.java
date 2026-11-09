package com.blazeprotect.av;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Settings, allow-list, event journal and the last scan report. */
public final class Store {
    private Store() {}

    public static final String K_REALTIME = "realtime";
    public static final String K_WATCH_DOWNLOADS = "watch_downloads";
    public static final String K_SCHEDULE = "schedule";          // 0 off, 1 daily, 7 weekly
    public static final String K_DEEP = "deep";                  // dex inspection during full scans
    public static final String K_PUA = "pua";                    // report low-risk apps
    public static final String K_SYSTEM = "system_apps";         // include updated system apps
    public static final String K_LAST_SCAN = "last_scan";
    public static final String K_LAST_SCAN_TYPE = "last_scan_type";
    public static final String K_LAST_SCAN_ITEMS = "last_scan_items";
    public static final String K_TOTAL_SCANS = "total_scans";
    public static final String K_TOTAL_THREATS = "total_threats";
    public static final String K_ONBOARDED = "onboarded";

    public static SharedPreferences prefs(Context c) {
        return c.getApplicationContext().getSharedPreferences("blaze", Context.MODE_PRIVATE);
    }

    public static boolean flag(Context c, String key, boolean def) {
        return prefs(c).getBoolean(key, def);
    }

    public static void setFlag(Context c, String key, boolean v) {
        prefs(c).edit().putBoolean(key, v).apply();
    }

    public static int integer(Context c, String key, int def) {
        return prefs(c).getInt(key, def);
    }

    public static void setInt(Context c, String key, int v) {
        prefs(c).edit().putInt(key, v).apply();
    }

    public static boolean realtime(Context c) { return flag(c, K_REALTIME, true); }

    // ---------- allow-list ----------

    public static Set<String> trusted(Context c) {
        return new HashSet<>(prefs(c).getStringSet("trusted", Collections.<String>emptySet()));
    }

    public static boolean isTrusted(Context c, String id) {
        return trusted(c).contains(id);
    }

    public static void setTrusted(Context c, String id, boolean trusted) {
        Set<String> s = trusted(c);
        if (trusted) s.add(id); else s.remove(id);
        prefs(c).edit().putStringSet("trusted", s).apply();
        Journal.log(c, trusted ? Journal.INFO : Journal.INFO,
                trusted ? "Ajouté à la liste de confiance" : "Retiré de la liste de confiance", id);
    }

    public static void clearTrusted(Context c) {
        prefs(c).edit().remove("trusted").apply();
    }

    // ---------- last report ----------

    private static File reportFile(Context c) {
        return new File(c.getFilesDir(), "last_report.json");
    }

    public static synchronized void saveReport(Context c, List<Threat> threats) {
        JSONArray a = new JSONArray();
        for (Threat t : threats) a.put(t.toJson());
        writeText(reportFile(c), a.toString());
    }

    public static synchronized List<Threat> loadReport(Context c) {
        List<Threat> out = new ArrayList<>();
        String s = readText(reportFile(c));
        if (s == null) return out;
        try {
            JSONArray a = new JSONArray(s);
            for (int i = 0; i < a.length(); i++) out.add(Threat.fromJson(a.getJSONObject(i)));
        } catch (Exception ignored) {
        }
        return out;
    }

    /** Removes an item from the persisted report once the user resolved it. */
    public static synchronized void resolve(Context c, String id) {
        List<Threat> l = loadReport(c);
        List<Threat> keep = new ArrayList<>();
        for (Threat t : l) if (!t.id.equals(id)) keep.add(t);
        saveReport(c, keep);
    }

    /** Active threats from the last report, minus trusted items and apps that are no longer installed. */
    public static List<Threat> activeThreats(Context c) {
        List<Threat> out = new ArrayList<>();
        Set<String> trusted = trusted(c);
        for (Threat t : loadReport(c)) {
            if (!t.isThreat() || trusted.contains(t.id)) continue;
            if (Threat.KIND_APP.equals(t.kind)) {
                try {
                    c.getPackageManager().getPackageInfo(t.id, 0);
                } catch (Exception gone) {
                    continue;
                }
            } else if (!new File(t.id).exists()) {
                continue;
            }
            out.add(t);
        }
        return out;
    }

    // ---------- io ----------

    public static String readText(File f) {
        if (!f.exists()) return null;
        StringBuilder sb = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            char[] buf = new char[8192];
            int n;
            while ((n = r.read(buf)) > 0) sb.append(buf, 0, n);
        } catch (Exception e) {
            return null;
        }
        return sb.toString();
    }

    public static boolean writeText(File f, String s) {
        File tmp = new File(f.getPath() + ".tmp");
        try (OutputStreamWriter w = new OutputStreamWriter(new FileOutputStream(tmp), StandardCharsets.UTF_8)) {
            w.write(s);
        } catch (Exception e) {
            return false;
        }
        return tmp.renameTo(f);
    }

    public static JSONObject obj(String json) {
        try {
            return new JSONObject(json);
        } catch (Exception e) {
            return new JSONObject();
        }
    }
}
