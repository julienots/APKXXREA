package com.superessence.musicmetric;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;

import com.superessence.musicmetric.audio.AudioData;
import com.superessence.musicmetric.audio.Codec;
import com.superessence.musicmetric.audio.Progress;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/** Saves renders to Music/MusicMetric (MediaStore on Android 10+, public folder below). */
public final class Storage {
    private Storage() { }

    public static final class Saved { public Uri uri; public String path; }

    public static Saved save(final Context ctx, AudioData a, String baseName, boolean m4a, Progress p) throws Exception {
        String safe = baseName.replaceAll("[\\\\/:*?\"<>|]", "_").trim(); if (safe.isEmpty()) safe = "MusicMetric";
        String ext = m4a ? ".m4a" : ".wav", mime = m4a ? "audio/mp4" : "audio/wav";
        File tmp = new File(ctx.getCacheDir(), "export" + ext);
        if (m4a) Codec.writeM4a(a, tmp, 256000, p);
        else { FileOutputStream fo = new FileOutputStream(tmp); try { Codec.writeWav(a, fo); } finally { fo.close(); } }
        Saved s = new Saved();
        if (Build.VERSION.SDK_INT >= 29) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, safe + ext);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/MusicMetric");
            v.put(MediaStore.Audio.Media.IS_MUSIC, 1);
            v.put(MediaStore.Audio.Media.ARTIST, "SuperEssence Studio");
            v.put(MediaStore.Audio.Media.IS_PENDING, 1);
            ContentResolver cr = ctx.getContentResolver();
            Uri uri = cr.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new Exception("Impossible de créer le fichier");
            OutputStream os = cr.openOutputStream(uri);
            try { copy(new FileInputStream(tmp), os); } finally { os.close(); }
            v.clear(); v.put(MediaStore.Audio.Media.IS_PENDING, 0); cr.update(uri, v, null, null);
            s.uri = uri; s.path = "Musique/MusicMetric/" + safe + ext;
        } else {
            @SuppressWarnings("deprecation") File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MUSIC), "MusicMetric");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("Dossier Musique inaccessible");
            File f = new File(dir, safe + ext); int i = 2; while (f.exists()) f = new File(dir, safe + " (" + (i++) + ")" + ext);
            copy(new FileInputStream(tmp), new FileOutputStream(f));
            final Uri[] out = new Uri[1]; final Object lock = new Object();
            MediaScannerConnection.scanFile(ctx, new String[]{f.getAbsolutePath()}, new String[]{mime}, new MediaScannerConnection.OnScanCompletedListener() {
                public void onScanCompleted(String path, Uri uri) { synchronized (lock) { out[0] = uri; lock.notifyAll(); } }
            });
            synchronized (lock) { if (out[0] == null) lock.wait(4000); }
            s.uri = out[0]; s.path = f.getAbsolutePath();
        }
        //noinspection ResultOfMethodCallIgnored
        tmp.delete();
        return s;
    }

    static void copy(InputStream in, OutputStream out) throws Exception {
        byte[] b = new byte[1 << 16]; int n;
        try { while ((n = in.read(b)) > 0) out.write(b, 0, n); } finally { in.close(); out.flush(); }
    }

    public static String displayName(Context ctx, Uri uri) {
        String name = null;
        try {
            Cursor c = ctx.getContentResolver().query(uri, new String[]{OpenableColumns.DISPLAY_NAME}, null, null, null);
            if (c != null) { if (c.moveToFirst()) name = c.getString(0); c.close(); }
        } catch (Exception ignored) { }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null) name = "Piste";
        int dot = name.lastIndexOf('.'); if (dot > 0) name = name.substring(0, dot);
        return name;
    }
}
