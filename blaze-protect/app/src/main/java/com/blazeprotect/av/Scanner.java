package com.blazeprotect.av;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/** Analyses one installed application or one file against the signature database. */
public final class Scanner {
    private Scanner() {}

    static final String EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";

    /** Files above this size are not hashed (large media, disk images). */
    static final long MAX_HASH = 150L * 1024 * 1024;

    private static final Set<String> MEDIA = new HashSet<>(Arrays.asList(
            "jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "dng", "raw",
            "mp4", "mkv", "mov", "avi", "webm", "3gp", "m4v",
            "mp3", "m4a", "aac", "ogg", "opus", "flac", "wav", "amr",
            "nomedia", "thumbnail", "srt", "vtt", "ttf", "otf"));

    public static final Set<String> TRUSTED_STORES = new HashSet<>(Arrays.asList(
            "com.android.vending", "com.amazon.venezia", "com.sec.android.app.samsungapps",
            "com.huawei.appmarket", "com.xiaomi.market", "com.heytap.market", "com.oppo.market",
            "com.bbk.appstore", "org.fdroid.fdroid", "com.google.android.feedback"));

    public static boolean isUserVisibleApp(ApplicationInfo ai, boolean includeUpdatedSystem) {
        boolean system = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
        boolean updated = (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) != 0;
        return !system || (includeUpdatedSystem && updated);
    }

    public static String installer(PackageManager pm, String pkg) {
        try {
            return pm.getInstallerPackageName(pkg);
        } catch (Exception e) {
            return null;
        }
    }

    public static String label(PackageManager pm, ApplicationInfo ai) {
        try {
            CharSequence l = pm.getApplicationLabel(ai);
            return l == null ? ai.packageName : l.toString();
        } catch (Exception e) {
            return ai.packageName;
        }
    }

    /**
     * @param hash compute and compare the APK digest (slow for large apps)
     */
    public static Threat scanApp(Context c, String pkg, boolean hash, ScanManager.CancelFlag cancel) {
        PackageManager pm = c.getPackageManager();
        Threat t = new Threat();
        t.kind = Threat.KIND_APP;
        t.id = pkg;
        t.label = pkg;
        ApplicationInfo ai;
        try {
            ai = pm.getApplicationInfo(pkg, 0);
        } catch (Exception e) {
            return t;
        }
        t.label = label(pm, ai);
        SignatureDb db = SignatureDb.get(c);
        String byName = db.matchPackage(pkg);
        if (byName != null) {
            t.detection = byName;
            t.signatureHit = true;
            t.add(100, "Paquet identifié dans la base de signatures", "Nom de paquet « " + pkg + " » associé à " + byName + ".");
        }
        if (hash && ai.sourceDir != null) {
            File apk = new File(ai.sourceDir);
            if (apk.length() <= MAX_HASH * 2) {
                SignatureDb.Digests d = SignatureDb.digest(apk, cancel);
                if (d != null) {
                    t.sha256 = d.sha256;
                    String hit = db.matchSha256(d.sha256);
                    if (hit == null) hit = db.matchMd5(d.md5);
                    if (hit != null) {
                        t.detection = hit;
                        t.signatureHit = true;
                        t.add(100, "Empreinte de l'APK reconnue", "Le fichier de l'application correspond à " + hit + ".");
                    }
                }
            }
        }
        finish(t);
        return t;
    }

    public static boolean isMedia(File f) {
        return MEDIA.contains(ext(f.getName()));
    }

    public static String ext(String name) {
        int dot = name.lastIndexOf('.');
        return dot < 0 ? "" : name.substring(dot + 1).toLowerCase(Locale.ROOT);
    }

    public static Threat scanFile(Context c, File f, ScanManager.CancelFlag cancel) {
        return scanFile(c, f, f.getName(), cancel);
    }

    public static Threat scanFile(Context c, File f, String displayName, ScanManager.CancelFlag cancel) {
        Threat t = new Threat();
        t.kind = Threat.KIND_FILE;
        t.id = f.getAbsolutePath();
        t.label = displayName;
        long size = f.length();
        SignatureDb db = SignatureDb.get(c);

        if (size >= EICAR.length() && size <= 128 && isEicar(f)) {
            t.detection = "EICAR-Test-File";
            t.signatureHit = true;
            t.add(100, "Fichier de test antivirus EICAR", "Fichier inoffensif utilisé pour vérifier qu'un antivirus fonctionne.");
        }
        if (size > 0 && size <= MAX_HASH && !isMedia(f) && t.detection == null) {
            SignatureDb.Digests d = SignatureDb.digest(f, cancel);
            if (d != null) {
                t.sha256 = d.sha256;
                String hit = db.matchSha256(d.sha256);
                if (hit == null) hit = db.matchMd5(d.md5);
                if (hit != null) {
                    t.detection = hit;
                    t.signatureHit = true;
                    t.add(100, "Empreinte reconnue", "SHA-256 présent dans la base de signatures : " + hit + ".");
                }
            }
        }
        if (t.detection == null && "apk".equals(ext(f.getName()))) {
            try {
                PackageInfo pi = c.getPackageManager().getPackageArchiveInfo(f.getAbsolutePath(), 0);
                if (pi != null) {
                    String hit = db.matchPackage(pi.packageName);
                    if (hit != null) {
                        t.detection = hit;
                        t.signatureHit = true;
                        t.add(100, "Paquet identifié dans la base de signatures", "Ce fichier d'installation contient « " + pi.packageName + " » (" + hit + ").");
                    }
                }
            } catch (Exception ignored) {
            }
        }
        finish(t);
        return t;
    }

    private static boolean isEicar(File f) {
        try (InputStream in = new FileInputStream(f)) {
            byte[] b = new byte[128];
            int n = in.read(b);
            if (n < EICAR.length()) return false;
            String s = new String(b, 0, n, StandardCharsets.ISO_8859_1);
            if (!s.startsWith(EICAR)) return false;
            for (int i = EICAR.length(); i < s.length(); i++) {
                char ch = s.charAt(i);
                if (ch != ' ' && ch != '\t' && ch != '\r' && ch != '\n' && ch != 0x1A) return false;
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static void finish(Threat t) {
        int s = 0;
        for (Threat.Finding f : t.findings) s += f.weight;
        t.score = Math.min(100, s);
        t.level = Threat.levelForScore(t.score);
    }
}
