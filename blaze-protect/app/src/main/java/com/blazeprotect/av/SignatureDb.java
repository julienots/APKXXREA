package com.blazeprotect.av;

import android.content.Context;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Local signature database: SHA-256 / MD5 file hashes and package names of known malware.
 * Built-in entries ship in assets/signatures.db; users can import additional hash lists
 * (plain lists, CSV exports from threat-intel feeds — any line containing a 32/64 hex digest).
 */
public final class SignatureDb {
    private static SignatureDb instance;

    private final Map<String, String> sha256 = new HashMap<>();
    private final Map<String, String> md5 = new HashMap<>();
    private final Map<String, String> packages = new HashMap<>();
    private int builtin;
    private int user;

    private static final Pattern HEX64 = Pattern.compile("(?<![0-9a-fA-F])([0-9a-fA-F]{64})(?![0-9a-fA-F])");
    private static final Pattern HEX32 = Pattern.compile("(?<![0-9a-fA-F])([0-9a-fA-F]{32})(?![0-9a-fA-F])");

    public static synchronized SignatureDb get(Context c) {
        if (instance == null) {
            instance = new SignatureDb();
            instance.load(c.getApplicationContext());
        }
        return instance;
    }

    public static synchronized void reload(Context c) {
        instance = null;
        get(c);
    }

    private static File userFile(Context c) {
        return new File(c.getFilesDir(), "user_signatures.db");
    }

    private void load(Context c) {
        try (InputStream in = c.getAssets().open("signatures.db")) {
            builtin = parse(in);
        } catch (Exception ignored) {
        }
        File u = userFile(c);
        if (u.exists()) {
            try (InputStream in = new FileInputStream(u)) {
                user = parse(in);
            } catch (Exception ignored) {
            }
        }
    }

    private int parse(InputStream in) throws Exception {
        int n = 0;
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        String line;
        while ((line = r.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty() || line.startsWith("#")) continue;
            String name = "Malware.Generic";
            int bar = line.indexOf('|');
            String body = line;
            if (bar > 0) {
                name = line.substring(bar + 1).trim();
                body = line.substring(0, bar).trim();
            }
            if (body.startsWith("sha256:")) { sha256.put(body.substring(7).toLowerCase(Locale.ROOT), name); n++; }
            else if (body.startsWith("md5:")) { md5.put(body.substring(4).toLowerCase(Locale.ROOT), name); n++; }
            else if (body.startsWith("pkg:")) { packages.put(body.substring(4), name); n++; }
        }
        return n;
    }

    public int builtinCount() { return builtin; }
    public int userCount() { return user; }
    public int total() { return sha256.size() + md5.size() + packages.size(); }

    public String matchSha256(String hex) { return hex == null ? null : sha256.get(hex.toLowerCase(Locale.ROOT)); }
    public String matchMd5(String hex) { return hex == null ? null : md5.get(hex.toLowerCase(Locale.ROOT)); }
    public String matchPackage(String pkg) { return pkg == null ? null : packages.get(pkg); }

    /**
     * Imports every digest found in the stream into the user database.
     * @return number of new entries
     */
    public static int importFrom(Context c, InputStream in, String defaultName) throws Exception {
        SignatureDb db = get(c);
        StringBuilder add = new StringBuilder();
        int added = 0;
        BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
        String line;
        while ((line = r.readLine()) != null) {
            if (line.startsWith("#")) continue;
            if (line.startsWith("pkg:")) {
                String p = line.substring(4).split("\\|")[0].trim();
                if (!p.isEmpty() && db.matchPackage(p) == null) {
                    add.append("pkg:").append(p).append('|').append(defaultName).append('\n');
                    added++;
                }
                continue;
            }
            Matcher m = HEX64.matcher(line);
            if (m.find()) {
                String h = m.group(1).toLowerCase(Locale.ROOT);
                if (db.matchSha256(h) == null) {
                    add.append("sha256:").append(h).append('|').append(defaultName).append('\n');
                    added++;
                }
                continue;
            }
            m = HEX32.matcher(line);
            if (m.find()) {
                String h = m.group(1).toLowerCase(Locale.ROOT);
                if (db.matchMd5(h) == null) {
                    add.append("md5:").append(h).append('|').append(defaultName).append('\n');
                    added++;
                }
            }
        }
        if (added > 0) {
            try (OutputStreamWriter w = new OutputStreamWriter(new FileOutputStream(userFile(c), true), StandardCharsets.UTF_8)) {
                w.write(add.toString());
            }
            reload(c);
        }
        return added;
    }

    public static void clearUser(Context c) {
        //noinspection ResultOfMethodCallIgnored
        userFile(c).delete();
        reload(c);
    }

    // ---------- hashing ----------

    public static final class Digests {
        public String sha256;
        public String md5;
    }

    public static Digests digest(File f, ScanManager.CancelFlag cancel) {
        try (InputStream in = new FileInputStream(f)) {
            MessageDigest s = MessageDigest.getInstance("SHA-256");
            MessageDigest m = MessageDigest.getInstance("MD5");
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                if (cancel != null && cancel.cancelled()) return null;
                s.update(buf, 0, n);
                m.update(buf, 0, n);
            }
            Digests d = new Digests();
            d.sha256 = hex(s.digest());
            d.md5 = hex(m.digest());
            return d;
        } catch (Exception e) {
            return null;
        }
    }

    public static String sha256(byte[] data) {
        try {
            return hex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (Exception e) {
            return "";
        }
    }

    public static String hex(byte[] b) {
        char[] HEX = "0123456789abcdef".toCharArray();
        char[] out = new char[b.length * 2];
        for (int i = 0; i < b.length; i++) {
            out[i * 2] = HEX[(b[i] >> 4) & 0xF];
            out[i * 2 + 1] = HEX[b[i] & 0xF];
        }
        return new String(out);
    }
}
