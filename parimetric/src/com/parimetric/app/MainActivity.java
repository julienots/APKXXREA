package com.parimetric.app;

import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Window w = getWindow();
        w.setStatusBarColor(Color.parseColor("#0B0D12"));
        w.setNavigationBarColor(Color.parseColor("#0B0D12"));
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0B0D12"));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setTextZoom(100);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Native");
        setContentView(web);
        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/www/index.html");
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        web.evaluateJavascript("window.appBack && window.appBack()", new android.webkit.ValueCallback<String>() {
            @Override public void onReceiveValue(String value) {
                if (!"true".equals(value)) finish();
            }
        });
    }

    /** HTTP GET performed natively so the page is not limited by CORS from file:// */
    public class Bridge {
        @JavascriptInterface
        public void get(final String url, final String id) {
            new Thread(new Runnable() { @Override public void run() {
                int code = 0;
                String body;
                String remaining = "";
                try {
                    HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                    c.setConnectTimeout(15000);
                    c.setReadTimeout(20000);
                    c.setRequestProperty("Accept", "application/json");
                    code = c.getResponseCode();
                    String r = c.getHeaderField("x-requests-remaining");
                    if (r != null) remaining = r;
                    InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    if (in != null) {
                        byte[] buf = new byte[16384];
                        int n;
                        while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
                        in.close();
                    }
                    body = bo.toString("UTF-8");
                } catch (Exception e) {
                    body = "{\"message\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}";
                }
                final String js = "window.__nativeCb(" + JSONObject.quote(id) + "," + code + "," + JSONObject.quote(body) + "," + JSONObject.quote(remaining) + ")";
                main.post(new Runnable() { @Override public void run() { web.evaluateJavascript(js, null); } });
            } }).start();
        }

        @JavascriptInterface
        public String version() {
            return Build.VERSION.RELEASE;
        }
    }
}
