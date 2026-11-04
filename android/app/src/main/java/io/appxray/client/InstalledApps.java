package io.appxray.client;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.webkit.WebResourceResponse;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * Access to the APK files of apps installed on the phone (they are world-readable on Android).
 * Used to analyse an installed app directly, or to copy its APK(s) into Downloads/APPXRAY.
 */
final class InstalledApps {
    private final Context ctx;
    private final PackageManager pm;

    InstalledApps(Context ctx) {
        this.ctx = ctx;
        this.pm = ctx.getPackageManager();
    }

    static boolean validPackage(String p) {
        return p != null && p.matches("[A-Za-z0-9_]+(\\.[A-Za-z0-9_]+)+") && p.length() < 200;
    }

    /** JSON list of installed apps (user apps, plus system apps when asked). */
    String list(boolean includeSystem) {
        JSONArray out = new JSONArray();
        List<PackageInfo> pkgs = pm.getInstalledPackages(0);
        for (PackageInfo p : pkgs) {
            ApplicationInfo ai = p.applicationInfo;
            if (ai == null || ai.sourceDir == null) continue;
            boolean system = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0 && (ai.flags & ApplicationInfo.FLAG_UPDATED_SYSTEM_APP) == 0;
            if (system && !includeSystem) continue;
            if (p.packageName.equals(ctx.getPackageName())) continue;
            try {
                JSONObject o = new JSONObject();
                o.put("package", p.packageName);
                o.put("label", String.valueOf(pm.getApplicationLabel(ai)));
                o.put("versionName", p.versionName == null ? "" : p.versionName);
                o.put("versionCode", Build.VERSION.SDK_INT >= 28 ? p.getLongVersionCode() : p.versionCode);
                long size = new File(ai.sourceDir).length();
                int splits = ai.splitSourceDirs == null ? 0 : ai.splitSourceDirs.length;
                if (splits > 0) for (String s : ai.splitSourceDirs) size += new File(s).length();
                o.put("size", size);
                o.put("baseSize", new File(ai.sourceDir).length());
                o.put("splits", splits);
                o.put("system", system);
                o.put("updated", p.lastUpdateTime);
                out.put(o);
            } catch (Exception ignored) {
            }
        }
        return out.toString();
    }

    /** Serves /__installed/<pkg>/{base.apk|icon.png|bundle.apks} for the web app (same origin). */
    WebResourceResponse serve(String path) {
        String[] parts = path.split("/");
        // ["", "__installed", pkg, file]
        if (parts.length < 4 || !validPackage(parts[2])) return error(400);
        Map<String, String> headers = new HashMap<String, String>();
        headers.put("Access-Control-Allow-Origin", "*");
        headers.put("Cache-Control", "no-store");
        try {
            ApplicationInfo ai = pm.getApplicationInfo(parts[2], 0);
            String file = parts[3];
            if ("base.apk".equals(file)) {
                return new WebResourceResponse("application/vnd.android.package-archive", null, 200, "OK", headers, new FileInputStream(ai.sourceDir));
            }
            if ("bundle.apks".equals(file)) {
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                writeBundle(ai, bos);
                return new WebResourceResponse("application/zip", null, 200, "OK", headers, new ByteArrayInputStream(bos.toByteArray()));
            }
            if ("icon.png".equals(file)) {
                headers.put("Cache-Control", "max-age=3600");
                return new WebResourceResponse("image/png", null, 200, "OK", headers, new ByteArrayInputStream(icon(ai)));
            }
            return error(404);
        } catch (PackageManager.NameNotFoundException e) {
            return error(404);
        } catch (Exception e) {
            return error(500);
        }
    }

    private static WebResourceResponse error(int code) {
        Map<String, String> h = new HashMap<String, String>();
        h.put("Access-Control-Allow-Origin", "*");
        return new WebResourceResponse("text/plain", "UTF-8", code, code == 404 ? "Not Found" : "Error", h, new ByteArrayInputStream(new byte[0]));
    }

    private byte[] icon(ApplicationInfo ai) {
        Drawable d = pm.getApplicationIcon(ai);
        int s = 96;
        Bitmap b = Bitmap.createBitmap(s, s, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(b);
        d.setBounds(0, 0, s, s);
        d.draw(c);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.PNG, 100, out);
        return out.toByteArray();
    }

    private static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] buf = new byte[64 * 1024];
        int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        in.close();
    }

    /** .apks bundle (zip of base.apk + split_*.apk), installable with split-APK installers. */
    private static void writeBundle(ApplicationInfo ai, OutputStream os) throws Exception {
        ZipOutputStream z = new ZipOutputStream(os);
        z.setLevel(0);
        z.putNextEntry(new ZipEntry("base.apk"));
        copy(new FileInputStream(ai.sourceDir), z);
        z.closeEntry();
        if (ai.splitSourceDirs != null) {
            for (String s : ai.splitSourceDirs) {
                z.putNextEntry(new ZipEntry(new File(s).getName()));
                copy(new FileInputStream(s), z);
                z.closeEntry();
            }
        }
        z.finish();
        z.flush();
    }

    /** Copies the app's APK (or .apks bundle when it has splits) to Downloads/APPXRAY. Returns the file name. */
    String copyToDownloads(String pkg) throws Exception {
        if (!validPackage(pkg)) throw new IllegalArgumentException("package invalide");
        PackageInfo p = pm.getPackageInfo(pkg, 0);
        ApplicationInfo ai = p.applicationInfo;
        boolean bundle = ai.splitSourceDirs != null && ai.splitSourceDirs.length > 0;
        String label = String.valueOf(pm.getApplicationLabel(ai)).replaceAll("[^\\w.\\- ]", "_").trim();
        if (label.isEmpty()) label = pkg;
        String name = label + "_" + (p.versionName == null ? "" : p.versionName.replaceAll("[^\\w.\\-]", "_")) + (bundle ? ".apks" : ".apk");
        String mime = bundle ? "application/zip" : "application/vnd.android.package-archive";
        OutputStream out;
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = ctx.getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/APPXRAY");
            Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IllegalStateException("MediaStore indisponible");
            out = cr.openOutputStream(uri);
        } else {
            File dir = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "APPXRAY");
            if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("dossier inaccessible");
            out = new FileOutputStream(new File(dir, name));
        }
        try {
            if (bundle) writeBundle(ai, out);
            else copy(new FileInputStream(ai.sourceDir), out);
        } finally {
            out.close();
        }
        return name;
    }
}
