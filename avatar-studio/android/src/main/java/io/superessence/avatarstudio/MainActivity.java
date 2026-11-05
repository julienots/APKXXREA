package io.superessence.avatarstudio;

import android.Manifest;
import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Avatar Studio - SuperEssence Studio.
 * Native shell: hosts the WebGL / WebAssembly app from the APK assets on a private https origin
 * (secure context for camera + microphone), bridges permissions, gallery saving, sharing and haptics.
 */
public class MainActivity extends Activity {
    private static final String HOST = "studio.superessence.app";
    private static final String ORIGIN = "https://" + HOST + "/";
    private static final int REQ_MEDIA = 41;
    private static final int REQ_STORAGE = 42;
    private static final int REQ_FILE = 43;

    private WebView web;
    private PermissionRequest pendingPermission;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final Map<String, Pending> saves = new HashMap<>();
    private int saveSeq = 0;

    private static class Pending {
        Uri uri;
        OutputStream out;
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#08080a"));
        w.setNavigationBarColor(Color.parseColor("#0c0c10"));
        w.addFlags(WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "SENative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                return serveAsset(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                ui.post(new Runnable() {
                    public void run() {
                        handlePermission(request);
                    }
                });
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                String[] accept = params.getAcceptTypes();
                String type = "*/*";
                if (accept != null && accept.length > 0 && accept[0] != null && accept[0].startsWith("image/")) type = "image/*";
                i.setType(type);
                try {
                    startActivityForResult(Intent.createChooser(i, "Choisir un fichier"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        setContentView(web);
        if (state == null) web.loadUrl(ORIGIN + "index.html");
        else web.restoreState(state);
    }

    // ------------------------------------------------------------------ assets
    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
        if (path.contains("..")) return notFound();
        String asset = "www" + path;
        try {
            InputStream in = getAssets().open(asset);
            Map<String, String> headers = new HashMap<>();
            headers.put("Access-Control-Allow-Origin", "*");
            headers.put("Cache-Control", "no-cache");
            headers.put("Cross-Origin-Resource-Policy", "same-origin");
            String mime = mimeOf(path);
            String enc = mime.startsWith("text/") || mime.endsWith("javascript") || mime.endsWith("json") ? "utf-8" : null;
            return new WebResourceResponse(mime, enc, 200, "OK", headers, in);
        } catch (IOException e) {
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found", new HashMap<String, String>(), null);
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".task") || p.endsWith(".bin")) return "application/octet-stream";
        String ext = MimeTypeMap.getFileExtensionFromUrl(p);
        String m = ext == null ? null : MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return m != null ? m : "application/octet-stream";
    }

    // ------------------------------------------------------------------ camera / microphone
    private void handlePermission(PermissionRequest request) {
        List<String> needed = new ArrayList<>();
        for (String r : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED)
                needed.add(Manifest.permission.CAMERA);
            if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
                needed.add(Manifest.permission.RECORD_AUDIO);
        }
        if (needed.isEmpty()) {
            request.grant(request.getResources());
            return;
        }
        if (pendingPermission != null) pendingPermission.deny();
        pendingPermission = request;
        requestPermissions(needed.toArray(new String[0]), REQ_MEDIA);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == REQ_MEDIA && pendingPermission != null) {
            PermissionRequest req = pendingPermission;
            pendingPermission = null;
            List<String> granted = new ArrayList<>();
            for (String r : req.getResources()) {
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) granted.add(r);
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(r) && checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) granted.add(r);
            }
            if (granted.isEmpty()) req.deny();
            else req.grant(granted.toArray(new String[0]));
        }
    }

    @Override
    protected void onActivityResult(int code, int result, Intent data) {
        if (code == REQ_FILE && fileCallback != null) {
            Uri[] uris = null;
            if (result == RESULT_OK && data != null && data.getData() != null) uris = new Uri[]{data.getData()};
            fileCallback.onReceiveValue(uris);
            fileCallback = null;
            return;
        }
        super.onActivityResult(code, result, data);
    }

    // ------------------------------------------------------------------ lifecycle
    @Override
    public void onBackPressed() {
        web.evaluateJavascript("(window.__seBack && window.__seBack()) ? 'y' : 'n'", new ValueCallback<String>() {
            public void onReceiveValue(String v) {
                if (v == null || !v.contains("y")) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.dispatchEvent(new Event('pagehide'))", null);
    }

    @Override
    protected void onDestroy() {
        for (Pending p : saves.values()) closeQuietly(p.out);
        web.destroy();
        super.onDestroy();
    }

    private static void closeQuietly(OutputStream o) {
        try {
            if (o != null) o.close();
        } catch (IOException ignored) {
        }
    }

    // ------------------------------------------------------------------ JS bridge
    private class Bridge {
        @JavascriptInterface
        public String saveBegin(String name, String mime) {
            try {
                ContentResolver cr = getContentResolver();
                ContentValues v = new ContentValues();
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                v.put(MediaStore.Video.Media.DISPLAY_NAME, safe);
                v.put(MediaStore.Video.Media.MIME_TYPE, mime);
                v.put(MediaStore.Video.Media.TITLE, safe);
                Uri uri;
                if (Build.VERSION.SDK_INT >= 29) {
                    v.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/SuperEssence");
                    v.put(MediaStore.Video.Media.IS_PENDING, 1);
                    uri = cr.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
                } else {
                    if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        ui.post(new Runnable() {
                            public void run() {
                                requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_STORAGE);
                            }
                        });
                        return "";
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "SuperEssence");
                    if (!dir.exists() && !dir.mkdirs()) return "";
                    v.put(MediaStore.Video.Media.DATA, new File(dir, safe).getAbsolutePath());
                    uri = cr.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
                }
                if (uri == null) return "";
                Pending p = new Pending();
                p.uri = uri;
                p.out = cr.openOutputStream(uri);
                if (p.out == null) return "";
                String id = "s" + (++saveSeq);
                synchronized (saves) {
                    saves.put(id, p);
                }
                return id;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean saveChunk(String id, String b64) {
            Pending p;
            synchronized (saves) {
                p = saves.get(id);
            }
            if (p == null) return false;
            try {
                p.out.write(Base64.decode(b64, Base64.DEFAULT));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String saveEnd(String id) {
            Pending p;
            synchronized (saves) {
                p = saves.remove(id);
            }
            if (p == null) return "";
            try {
                p.out.flush();
                p.out.close();
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Video.Media.IS_PENDING, 0);
                    getContentResolver().update(p.uri, v, null, null);
                }
                return p.uri.toString();
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void saveAbort(String id) {
            Pending p;
            synchronized (saves) {
                p = saves.remove(id);
            }
            if (p == null) return;
            closeQuietly(p.out);
            try {
                getContentResolver().delete(p.uri, null, null);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void share(final String uri, final String mime) {
            ui.post(new Runnable() {
                public void run() {
                    try {
                        Intent i = new Intent(Intent.ACTION_SEND);
                        i.setType(mime);
                        i.putExtra(Intent.EXTRA_STREAM, Uri.parse(uri));
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(i, "Partager la vidéo"));
                    } catch (Exception ignored) {
                    }
                }
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            v.vibrate(VibrationEffect.createOneShot(Math.max(1, Math.min(ms, 400)), VibrationEffect.DEFAULT_AMPLITUDE));
        }

        @JavascriptInterface
        public void keepScreenOn(final boolean on) {
            ui.post(new Runnable() {
                public void run() {
                    if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
            });
        }

        @JavascriptInterface
        @SuppressWarnings("deprecation")
        public void setImmersive(final boolean on) {
            ui.post(new Runnable() {
                public void run() {
                    View d = getWindow().getDecorView();
                    if (on) d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
                    else d.setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
                }
            });
        }

        @JavascriptInterface
        public String appVersion() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public String deviceInfo() {
            return Build.MANUFACTURER + " " + Build.MODEL + " / Android " + Build.VERSION.RELEASE;
        }
    }
}
