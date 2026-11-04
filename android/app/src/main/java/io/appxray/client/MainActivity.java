package io.appxray.client;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.HashMap;
import java.util.Map;

/**
 * APPXRAY for Android.
 * Default "phone" mode: the whole APPXRAY app (UI + analysis engine + on-device APK builder) is bundled in
 * assets/www and served from https://appxray.local — no server needed, files never leave the phone.
 * Optional "server" mode connects to an APPXRAY server for JADX/Apktool/Gradle.
 */
public class MainActivity extends Activity {
    private static final String LOCAL_ORIGIN = "https://appxray.local";
    private static final int PICK_FILE = 41;
    private static final int INK = 0xFF05070D, CARD = 0xFF0B101C, LINE = 0xFF1B2740, TEXT = 0xFFE6EBF5, MUTED = 0xFF8D9BBB, VOLT = 0xFF2F6BFF, CYAN = 0xFF22E3FF, BAD = 0xFFF87171;
    private static final Map<String, String> MIME = new HashMap<String, String>();

    static {
        MIME.put("html", "text/html");
        MIME.put("js", "text/javascript");
        MIME.put("css", "text/css");
        MIME.put("json", "application/json");
        MIME.put("webmanifest", "application/manifest+json");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("woff2", "font/woff2");
        MIME.put("dex", "application/octet-stream");
    }

    private SharedPreferences prefs;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("appxray", MODE_PRIVATE);
        if ("server".equals(prefs.getString("mode", "local")) && !prefs.getString("server", "").isEmpty()) showWeb(false);
        else showWeb(true);
    }

    // ───────────────────────── server setup (optional) ─────────────────────────
    private void showSetup(String error) {
        destroyWeb();
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(INK);
        scroll.setFillViewport(true);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setGravity(Gravity.CENTER_VERTICAL);
        int p = dp(24);
        col.setPadding(p, p, p, p);
        scroll.addView(col, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        TextView logo = text("APPXRAY", 30, TEXT);
        logo.setTypeface(Typeface.DEFAULT_BOLD);
        logo.setLetterSpacing(0.18f);
        col.addView(logo);
        TextView sub = text("Serveur APPXRAY (optionnel)", 14, CYAN);
        sub.setPadding(0, dp(4), 0, dp(24));
        col.addView(sub);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        card.setBackground(round(CARD, LINE, 16));
        col.addView(card);
        TextView help = text("Un serveur APPXRAY (ordinateur) ajoute la décompilation Java (JADX), le smali (Apktool) et la compilation Gradle. Tout le reste fonctionne sans serveur, directement sur ce téléphone.", 13, MUTED);
        help.setPadding(0, 0, 0, dp(10));
        card.addView(help);
        card.addView(label("ADRESSE DU SERVEUR"));
        final EditText url = input("http://192.168.1.10:8787", InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(prefs.getString("server", ""));
        card.addView(url);
        card.addView(label("JETON D'ACCÈS (optionnel)"));
        final EditText token = input("jeton", InputType.TYPE_TEXT_VARIATION_PASSWORD);
        token.setText(prefs.getString("token", ""));
        card.addView(token);
        final TextView status = text(error == null ? "" : error, 13, BAD);
        status.setPadding(0, dp(10), 0, 0);
        card.addView(status);
        final Button go = button("Se connecter au serveur", VOLT, Color.WHITE);
        card.addView(go, lp(14));
        go.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String u = url.getText().toString().trim();
                if (!u.startsWith("http://") && !u.startsWith("https://")) u = "http://" + u;
                while (u.endsWith("/")) u = u.substring(0, u.length() - 1);
                go.setEnabled(false);
                status.setTextColor(MUTED);
                status.setText("Connexion à " + u + "…");
                testServer(u, token.getText().toString().trim(), status, go);
            }
        });
        Button local = button("Utiliser sur ce téléphone (sans serveur)", CARD, CYAN);
        local.setBackground(round(INK, CYAN, 12));
        col.addView(local, lp(16));
        local.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                prefs.edit().putString("mode", "local").apply();
                showWeb(true);
            }
        });
        setContentView(scroll);
    }

    private void testServer(final String server, final String token, final TextView status, final Button go) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                String err = null;
                HttpURLConnection c = null;
                try {
                    c = (HttpURLConnection) new URL(server + "/api/system").openConnection();
                    c.setConnectTimeout(8000);
                    c.setReadTimeout(15000);
                    if (!token.isEmpty()) c.setRequestProperty("Authorization", "Bearer " + token);
                    int code = c.getResponseCode();
                    if (code == 401) err = "Jeton refusé par le serveur (401).";
                    else if (code != 200) err = "Réponse inattendue du serveur : HTTP " + code;
                } catch (Exception e) {
                    err = "Serveur injoignable : " + e.getMessage();
                } finally {
                    if (c != null) c.disconnect();
                }
                final String fe = err;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        go.setEnabled(true);
                        if (fe != null) {
                            status.setTextColor(BAD);
                            status.setText(fe);
                            return;
                        }
                        prefs.edit().putString("mode", "server").putString("server", server).putString("token", token).apply();
                        showWeb(false);
                    }
                });
            }
        }).start();
    }

    // ───────────────────────── web app ─────────────────────────
    private void destroyWeb() {
        if (web != null) {
            web.destroy();
            web = null;
        }
    }

    private void showWeb(final boolean local) {
        destroyWeb();
        final String server = local ? LOCAL_ORIGIN : prefs.getString("server", "");
        final String token = local ? "" : prefs.getString("token", "");
        web = new WebView(this);
        web.setBackgroundColor(INK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " APPXRAY-Android/0.2");
        web.addJavascriptInterface(new Bridge(), "AppxrayAndroid");
        final Uri base = Uri.parse(server);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!"appxray.local".equals(u.getHost())) return null;
                return serveAsset(u.getPath());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (sameOrigin(base, u)) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError error) {
                if (req.isForMainFrame() && !local) showSetup("Impossible de charger le serveur : " + error.getDescription());
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(Intent.createChooser(i, "Choisir un fichier"), PICK_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });
        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long length) {
                if (url.startsWith("http")) download(url, contentDisposition, mimetype, token);
            }
        });
        setContentView(web);
        String start = server + "/";
        if (!token.isEmpty()) {
            try {
                start += "?token=" + URLEncoder.encode(token, "UTF-8");
            } catch (Exception ignored) {
            }
        }
        web.loadUrl(start);
    }

    /** Serves the bundled web app (assets/www) with an SPA fallback to index.html. */
    private WebResourceResponse serveAsset(String path) {
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        if (path.contains("..")) return new WebResourceResponse("text/plain", "UTF-8", 403, "Forbidden", null, null);
        String rel = "www" + path;
        String ext = path.contains(".") ? path.substring(path.lastIndexOf('.') + 1).toLowerCase() : "";
        try {
            InputStream in = getAssets().open(rel);
            String mime = MIME.containsKey(ext) ? MIME.get(ext) : "application/octet-stream";
            Map<String, String> headers = new HashMap<String, String>();
            headers.put("Cache-Control", "no-cache");
            return new WebResourceResponse(mime, mime.startsWith("text") || mime.contains("json") || mime.contains("javascript") ? "UTF-8" : null, 200, "OK", headers, in);
        } catch (Exception notFound) {
            if (!ext.isEmpty() && !"html".equals(ext)) return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, null);
            try {
                return new WebResourceResponse("text/html", "UTF-8", getAssets().open("www/index.html"));
            } catch (Exception e) {
                return null;
            }
        }
    }

    private static boolean sameOrigin(Uri a, Uri b) {
        return b.getScheme() != null && b.getScheme().equals(a.getScheme()) && b.getHost() != null && b.getHost().equals(a.getHost()) && b.getPort() == a.getPort();
    }

    private void download(String url, String disposition, String mime, String token) {
        try {
            String name = URLUtil.guessFileName(url, disposition, mime);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            if (!token.isEmpty()) r.addRequestHeader("Authorization", "Bearer " + token);
            r.setMimeType(name.endsWith(".apk") ? "application/vnd.android.package-archive" : mime);
            r.setTitle(name);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
            toast("Téléchargement de " + name);
        } catch (Exception e) {
            toast("Téléchargement impossible : " + e.getMessage());
        }
    }

    /** Saves bytes in the public Downloads folder and returns a shareable content:// URI. */
    private String saveToDownloads(String name, String mime, byte[] data) throws Exception {
        name = name.replaceAll("[^\\w.\\- ]", "_");
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver cr = getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/APPXRAY");
            Uri uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
            if (uri == null) throw new IllegalStateException("MediaStore indisponible");
            OutputStream out = cr.openOutputStream(uri);
            out.write(data);
            out.close();
            return uri.toString();
        }
        File dir = new File(getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "APPXRAY");
        if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("dossier inaccessible");
        File f = new File(dir, name);
        FileOutputStream out = new FileOutputStream(f);
        out.write(data);
        out.close();
        DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
        @SuppressWarnings("deprecation")
        long id = dm.addCompletedDownload(name, "APPXRAY", true, mime, f.getAbsolutePath(), f.length(), true);
        Uri uri = dm.getUriForDownloadedFile(id);
        return uri == null ? "" : uri.toString();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == PICK_FILE && fileCallback != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[] {data.getData()};
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        destroyWeb();
        super.onDestroy();
    }

    /** Exposed to the APPXRAY web UI (only the bundled app or the chosen APPXRAY server is loaded). */
    private final class Bridge {
        @JavascriptInterface
        public String saveFile(String name, String mime, String base64) {
            try {
                String uri = saveToDownloads(name, mime, Base64.decode(base64, Base64.DEFAULT));
                final String n = name;
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        toast(n + " enregistré dans Téléchargements/APPXRAY");
                    }
                });
                return uri;
            } catch (final Exception e) {
                main.post(new Runnable() {
                    @Override
                    public void run() {
                        toast("Enregistrement impossible : " + e.getMessage());
                    }
                });
                return "";
            }
        }

        @JavascriptInterface
        public void openFile(final String uri, final String mime) {
            main.post(new Runnable() {
                @Override
                public void run() {
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW);
                        i.setDataAndType(Uri.parse(uri), mime);
                        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(i);
                    } catch (Exception e) {
                        toast("Ouverture impossible : " + e.getMessage());
                    }
                }
            });
        }

        @JavascriptInterface
        public void changeServer() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    showSetup(null);
                }
            });
        }

        @JavascriptInterface
        public void useLocal() {
            main.post(new Runnable() {
                @Override
                public void run() {
                    prefs.edit().putString("mode", "local").apply();
                    showWeb(true);
                }
            });
        }

        @JavascriptInterface
        public String version() {
            return "0.2.0";
        }
    }

    // ───────────────────────── small UI helpers ─────────────────────────
    private void toast(String m) {
        Toast.makeText(this, m, Toast.LENGTH_LONG).show();
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    private LinearLayout.LayoutParams lp(int topDp) {
        LinearLayout.LayoutParams l = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        l.topMargin = dp(topDp);
        return l;
    }

    private Button button(String label, int bg, int fg) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextColor(fg);
        b.setTextSize(15);
        b.setBackground(round(bg, bg, 12));
        return b;
    }

    private TextView text(String s, int sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(sp);
        t.setTextColor(color);
        return t;
    }

    private TextView label(String s) {
        TextView t = text(s, 11, MUTED);
        t.setLetterSpacing(0.08f);
        t.setPadding(0, dp(10), 0, dp(4));
        return t;
    }

    private EditText input(String hint, int variation) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setHintTextColor(0xFF5A6B8F);
        e.setTextColor(TEXT);
        e.setSingleLine(true);
        e.setInputType(InputType.TYPE_CLASS_TEXT | variation);
        e.setPadding(dp(12), dp(10), dp(12), dp(10));
        e.setBackground(round(INK, LINE, 12));
        return e;
    }

    private GradientDrawable round(int fill, int stroke, int radiusDp) {
        GradientDrawable g = new GradientDrawable();
        g.setColor(fill);
        g.setStroke(dp(1), stroke);
        g.setCornerRadius(dp(radiusDp));
        return g;
    }
}
