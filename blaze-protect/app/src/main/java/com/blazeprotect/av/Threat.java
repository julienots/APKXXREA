package com.blazeprotect.av;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Result of analysing one application or one file. */
public final class Threat {
    public static final int CLEAN = 0;
    public static final int LOW = 1;        // potentially unwanted / to watch
    public static final int SUSPICIOUS = 2;
    public static final int MALICIOUS = 3;

    public static final String KIND_APP = "app";
    public static final String KIND_FILE = "file";

    public static final class Finding {
        public final int weight;
        public final String title;
        public final String detail;

        public Finding(int weight, String title, String detail) {
            this.weight = weight;
            this.title = title;
            this.detail = detail;
        }
    }

    public String kind;
    /** Package name for apps, absolute path for files. */
    public String id;
    public String label;
    /** Detection name (e.g. "Android.Trojan.SmsStealer") or heuristic family. */
    public String detection;
    public int score;
    public int level;
    public String sha256;
    public boolean signatureHit;
    public final List<Finding> findings = new ArrayList<>();

    public static String levelName(int level) {
        switch (level) {
            case MALICIOUS: return "Malveillant";
            case SUSPICIOUS: return "Suspect";
            case LOW: return "À surveiller";
            default: return "Sain";
        }
    }

    public static int levelForScore(int score) {
        if (score >= 70) return MALICIOUS;
        if (score >= 40) return SUSPICIOUS;
        if (score >= 20) return LOW;
        return CLEAN;
    }

    public boolean isThreat() {
        return level >= SUSPICIOUS;
    }

    public void add(int weight, String title, String detail) {
        findings.add(new Finding(weight, title, detail));
    }

    public JSONObject toJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("kind", kind);
            o.put("id", id);
            o.put("label", label);
            o.put("detection", detection);
            o.put("score", score);
            o.put("level", level);
            o.put("sha256", sha256);
            o.put("sig", signatureHit);
            JSONArray f = new JSONArray();
            for (Finding x : findings) {
                JSONObject j = new JSONObject();
                j.put("w", x.weight);
                j.put("t", x.title);
                j.put("d", x.detail);
                f.put(j);
            }
            o.put("findings", f);
        } catch (JSONException ignored) {
        }
        return o;
    }

    public static Threat fromJson(JSONObject o) {
        Threat t = new Threat();
        t.kind = o.optString("kind", KIND_APP);
        t.id = o.optString("id");
        t.label = o.optString("label");
        t.detection = o.optString("detection", null);
        t.score = o.optInt("score");
        t.level = o.optInt("level");
        t.sha256 = o.optString("sha256", null);
        t.signatureHit = o.optBoolean("sig");
        JSONArray f = o.optJSONArray("findings");
        if (f != null) {
            for (int i = 0; i < f.length(); i++) {
                JSONObject j = f.optJSONObject(i);
                if (j != null) t.add(j.optInt("w"), j.optString("t"), j.optString("d"));
            }
        }
        return t;
    }
}
