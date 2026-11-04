package io.appxray.runtime;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

/** Web content screen; URL chosen in APPXRAY's Project Rebuilder. */
public class WebActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Config.applyTheme(this, null);
        JSONObject f = Config.get(this).optJSONObject("features");
        JSONObject w = f == null ? null : f.optJSONObject("webview");
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.setWebViewClient(new WebViewClient());
        setContentView(web);
        web.loadUrl(w == null ? "https://example.com" : w.optString("url", "https://example.com"));
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
