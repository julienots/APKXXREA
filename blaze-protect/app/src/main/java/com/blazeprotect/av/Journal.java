package com.blazeprotect.av;

import android.content.Context;

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
import java.util.List;

/** Append-only security event log (JSON lines), trimmed to the last entries. */
public final class Journal {
    private Journal() {}

    public static final int INFO = 0;
    public static final int SCAN = 1;
    public static final int WARN = 2;
    public static final int ALERT = 3;
    public static final int ACTION = 4;

    private static final int MAX = 600;

    public static final class Entry {
        public long time;
        public int type;
        public String title;
        public String detail;
    }

    private static File file(Context c) {
        return new File(c.getApplicationContext().getFilesDir(), "journal.log");
    }

    public static synchronized void log(Context c, int type, String title, String detail) {
        try {
            JSONObject o = new JSONObject();
            o.put("t", System.currentTimeMillis());
            o.put("y", type);
            o.put("a", title);
            o.put("b", detail == null ? "" : detail);
            File f = file(c);
            try (OutputStreamWriter w = new OutputStreamWriter(new FileOutputStream(f, true), StandardCharsets.UTF_8)) {
                w.write(o.toString());
                w.write('\n');
            }
            if (f.length() > 256 * 1024) trim(c);
        } catch (Exception ignored) {
        }
    }

    private static void trim(Context c) {
        List<String> lines = rawLines(c);
        if (lines.size() <= MAX) return;
        StringBuilder sb = new StringBuilder();
        for (String l : lines.subList(lines.size() - MAX, lines.size())) sb.append(l).append('\n');
        Store.writeText(file(c), sb.toString());
    }

    private static List<String> rawLines(Context c) {
        List<String> out = new ArrayList<>();
        File f = file(c);
        if (!f.exists()) return out;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(new FileInputStream(f), StandardCharsets.UTF_8))) {
            String l;
            while ((l = r.readLine()) != null) if (l.length() > 2) out.add(l);
        } catch (Exception ignored) {
        }
        return out;
    }

    /** Newest first. */
    public static synchronized List<Entry> entries(Context c) {
        List<Entry> out = new ArrayList<>();
        for (String l : rawLines(c)) {
            try {
                JSONObject o = new JSONObject(l);
                Entry e = new Entry();
                e.time = o.getLong("t");
                e.type = o.optInt("y");
                e.title = o.optString("a");
                e.detail = o.optString("b");
                out.add(e);
            } catch (Exception ignored) {
            }
        }
        Collections.reverse(out);
        return out;
    }

    public static synchronized void clear(Context c) {
        //noinspection ResultOfMethodCallIgnored
        file(c).delete();
    }
}
