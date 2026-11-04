package fr.cahier.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;
import java.util.List;

/** Stockage local des notes (SharedPreferences, JSON). */
public final class NoteStore {
    private static final String PREFS = "cahier";
    private static final String KEY = "notes";
    private static final String NEXT = "next_id";

    private NoteStore() {}

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized List<Note> all(Context c) {
        List<Note> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs(c).getString(KEY, "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                out.add(new Note(o.getInt("id"), o.getString("text"), o.optLong("created")));
            }
        } catch (Exception ignored) {
        }
        return out;
    }

    private static void save(Context c, List<Note> notes) {
        JSONArray a = new JSONArray();
        try {
            for (Note n : notes) {
                JSONObject o = new JSONObject();
                o.put("id", n.id);
                o.put("text", n.text);
                o.put("created", n.created);
                a.put(o);
            }
        } catch (Exception ignored) {
        }
        prefs(c).edit().putString(KEY, a.toString()).commit();
    }

    public static synchronized Note add(Context c, String text) {
        SharedPreferences p = prefs(c);
        int id = p.getInt(NEXT, 1);
        p.edit().putInt(NEXT, id + 1).commit();
        Note n = new Note(id, text, System.currentTimeMillis());
        List<Note> notes = all(c);
        notes.add(0, n);
        save(c, notes);
        return n;
    }

    public static synchronized Note get(Context c, int id) {
        for (Note n : all(c)) if (n.id == id) return n;
        return null;
    }

    public static synchronized void update(Context c, int id, String text) {
        List<Note> notes = all(c);
        for (Note n : notes) if (n.id == id) n.text = text;
        save(c, notes);
    }

    public static synchronized void remove(Context c, int id) {
        List<Note> notes = all(c);
        for (int i = notes.size() - 1; i >= 0; i--) if (notes.get(i).id == id) notes.remove(i);
        save(c, notes);
    }
}
