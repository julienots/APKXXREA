package com.blazeprotect.av;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Isolates files inside the app's private storage. Content is XOR-encoded so the quarantined
 * copy can no longer be opened, installed or executed; restoring decodes it back in place.
 */
public final class Quarantine {
    private Quarantine() {}

    private static final int KEY = 0xA5;

    public static final class Item {
        public String id;
        public String path;
        public String name;
        public String detection;
        public long size;
        public long time;
    }

    private static File dir(Context c) {
        File d = new File(c.getFilesDir(), "quarantine");
        //noinspection ResultOfMethodCallIgnored
        d.mkdirs();
        return d;
    }

    private static File index(Context c) {
        return new File(dir(c), "index.json");
    }

    public static synchronized List<Item> list(Context c) {
        List<Item> out = new ArrayList<>();
        String s = Store.readText(index(c));
        if (s == null) return out;
        try {
            JSONArray a = new JSONArray(s);
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                Item it = new Item();
                it.id = o.getString("id");
                it.path = o.getString("path");
                it.name = o.optString("name");
                it.detection = o.optString("detection");
                it.size = o.optLong("size");
                it.time = o.optLong("time");
                out.add(it);
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static void save(Context c, List<Item> items) {
        JSONArray a = new JSONArray();
        try {
            for (Item it : items) {
                JSONObject o = new JSONObject();
                o.put("id", it.id);
                o.put("path", it.path);
                o.put("name", it.name);
                o.put("detection", it.detection);
                o.put("size", it.size);
                o.put("time", it.time);
                a.put(o);
            }
        } catch (Exception ignored) {
        }
        Store.writeText(index(c), a.toString());
    }

    private static boolean xorCopy(File from, File to) {
        try (InputStream in = new FileInputStream(from); OutputStream out = new FileOutputStream(to)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                for (int i = 0; i < n; i++) buf[i] = (byte) (buf[i] ^ KEY);
                out.write(buf, 0, n);
            }
            return true;
        } catch (Exception e) {
            //noinspection ResultOfMethodCallIgnored
            to.delete();
            return false;
        }
    }

    /** @return null on success, otherwise an error message */
    public static synchronized String isolate(Context c, File f, String detection) {
        if (!f.isFile()) return "Fichier introuvable.";
        Item it = new Item();
        it.id = UUID.randomUUID().toString();
        it.path = f.getAbsolutePath();
        it.name = f.getName();
        it.detection = detection;
        it.size = f.length();
        it.time = System.currentTimeMillis();
        File target = new File(dir(c), it.id + ".q");
        if (!xorCopy(f, target)) return "Copie impossible (espace insuffisant ?).";
        if (!f.delete()) {
            //noinspection ResultOfMethodCallIgnored
            target.delete();
            return "Suppression de l'original refusée. Accordez l'accès à tous les fichiers dans les réglages.";
        }
        List<Item> items = list(c);
        items.add(0, it);
        save(c, items);
        Journal.log(c, Journal.ACTION, "Fichier mis en quarantaine", it.path);
        return null;
    }

    public static synchronized String restore(Context c, String id) {
        List<Item> items = list(c);
        for (Item it : items) {
            if (!it.id.equals(id)) continue;
            File src = new File(dir(c), it.id + ".q");
            File dst = new File(it.path);
            if (dst.exists()) return "Un fichier existe déjà à l'emplacement d'origine.";
            File parent = dst.getParentFile();
            //noinspection ResultOfMethodCallIgnored
            if (parent != null) parent.mkdirs();
            if (!xorCopy(src, dst)) return "Restauration impossible à cet emplacement.";
            //noinspection ResultOfMethodCallIgnored
            src.delete();
            items.remove(it);
            save(c, items);
            Store.setTrusted(c, it.path, true);
            Journal.log(c, Journal.ACTION, "Fichier restauré", it.path);
            return null;
        }
        return "Élément introuvable.";
    }

    public static synchronized void delete(Context c, String id) {
        List<Item> items = list(c);
        for (Item it : items) {
            if (!it.id.equals(id)) continue;
            //noinspection ResultOfMethodCallIgnored
            new File(dir(c), it.id + ".q").delete();
            items.remove(it);
            save(c, items);
            Journal.log(c, Journal.ACTION, "Fichier supprimé définitivement", it.path);
            return;
        }
    }
}
