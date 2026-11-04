package io.appxray.client;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;

/**
 * APPXRAY for Android.
 * The heavy engines (JADX, Apktool, aapt2, Gradle) cannot run inside an Android app sandbox, so the APK is the
 * mobile client of an APPXRAY processing server (your PC, a VPS, or a container): it connects to it, uploads
 * APKs from the phone's storage, and downloads the rebuilt projects / compiled APKs to the Downloads folder.
 */
public class MainActivity extends Activity {
    private static final int PICK_FILE = 41;
    private static final int INK = 0xFF05070D, CARD = 0xFF0B101C, LINE = 0xFF1B2740, TEXT = 0xFFE6EBF5, MUTED = 0xFF8D9BBB, VOLT = 0xFF2F6BFF, CYAN = 0xFF22E3FF, BAD = 0xFFF87171;

    private SharedPreferences prefs;
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        prefs = getSharedPreferences("appxray", MODE_PRIVATE);
        if (prefs.getString("server", "").isEmpty()) showSetup(null);
        else showWeb();
    }

    // ───────────────────────── Server setup screen ─────────────────────────
    private void showSetup(String error) {
        if (web != null) {
            web.destroy();
            web = null;
        }
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
        TextView sub = text("Analyse · reconstruction · compilation d'APK", 14, CYAN);
        sub.setPadding(0, dp(4), 0, dp(24));
        col.addView(sub);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(18), dp(18), dp(18), dp(18));
        card.setBackground(round(CARD, LINE, 16));
        col.addView(card);

        card.addView(text("Serveur de traitement APPXRAY", 16, TEXT));
        TextView help = text("JADX, Apktool et la compilation tournent sur un serveur APPXRAY (votre ordinateur, un VPS ou Docker). Lancez-le avec HOST=0.0.0.0, puis saisissez son adresse.", 13, MUTED);
        help.setPadding(0, dp(6), 0, dp(14));
        card.addView(help);

        card.addView(label("ADRESSE DU SERVEUR"));
        final EditText url = input("http://192.168.1.10:8787", InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(prefs.getString("server", ""));
        card.addView(url);
        card.addView(label("JETON D'ACCÈS (APPXRAY_TOKEN, optionnel)"));
        final EditText token = input("jeton", InputType.TYPE_TEXT_VARIATION_PASSWORD);
        token.setText(prefs.getString("token", ""));
        card.addView(token);

        final TextView status = text(error == null ? "" : error, 13, BAD);
        status.setPadding(0, dp(10), 0, 0);
        card.addView(status);

        final Button go = new Button(this);
        go.setText("Se connecter");
        go.setAllCaps(false);
        go.setTextColor(Color.WHITE);
        go.setTextSize(16);
        go.setBackground(round(VOLT, VOLT, 12));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(52));
        lp.topMargin = dp(14);
        card.addView(go, lp);
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

        TextView legal = text("Analysez uniquement des applications qui vous appartiennent ou pour lesquelles vous disposez d'une autorisation.", 12, MUTED);
        legal.setPadding(0, dp(20), 0, 0);
        col.addView(legal);
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
                        prefs.edit().putString("server", server).putString("token", token).apply();
                        showWeb();
                    }
                });
            }
        }).start();
    }

    // ───────────────────────── Web client ─────────────────────────
    private void showWeb() {
        final String server = prefs.getString("server", "");
        final String token = prefs.getString("token", "");
        web = new WebView(this);
        web.setBackgroundColor(INK);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " APPXRAY-Android/0.1");
        CookieManager.getInstance().setAcceptCookie(true);
        web.addJavascriptInterface(new Bridge(), "AppxrayAndroid");
        final Uri base = Uri.parse(server);
        web.setWebViewClient(new WebViewClient() {
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
                if (req.isForMainFrame()) showSetup("Impossible de charger APPXRAY : " + error.getDescription());
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
                download(url, contentDisposition, mimetype, token);
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
            r.setDescription("APPXRAY");
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            ((DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE)).enqueue(r);
            Toast.makeText(this, "Téléchargement de " + name + " (dossier Téléchargements)", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "Téléchargement impossible : " + e.getMessage(), Toast.LENGTH_LONG).show();
        }
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
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** Exposed to the APPXRAY web UI (only our server is ever loaded in this WebView). */
    private final class Bridge {
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
        public String version() {
            return "0.1.0";
        }
    }

    // ───────────────────────── small UI helpers ─────────────────────────
    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
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
