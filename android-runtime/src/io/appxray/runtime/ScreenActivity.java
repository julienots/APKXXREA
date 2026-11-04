package io.appxray.runtime;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.TextView;

import org.json.JSONObject;

/** Displays one reconstructed screen (key passed as the "screen" extra, launcher screen by default). */
public class ScreenActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        JSONObject cfg = Config.get(this);
        String key = getIntent().getStringExtra("screen");
        if (key == null) {
            key = cfg.optString("launcher", "");
            if (cfg.optBoolean("loginFirst", false) && !getIntent().getBooleanExtra("afterLogin", false) && !new AuthStore(this).loggedIn()) {
                startActivity(new Intent(this, LoginActivity.class));
                finish();
                return;
            }
        }
        JSONObject screens = cfg.optJSONObject("screens");
        JSONObject screen = screens == null ? null : screens.optJSONObject(key);
        if (screen == null) {
            Config.applyTheme(this, null);
            TextView t = new TextView(this);
            t.setText("Écran introuvable : " + key);
            t.setPadding(48, 48, 48, 48);
            setContentView(t);
            return;
        }
        Config.applyTheme(this, screen.optString("title", ""));
        final Ui ui = new Ui(this);
        setContentView(ui.build(screen.optJSONObject("root")));
        final String next = screen.optString("next", "");
        if (next.length() > 0 && !next.equals(key)) {
            // Loading/splash screen: move on automatically (replaces the original app's logic).
            new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
                @Override
                public void run() {
                    if (isFinishing()) return;
                    ui.action("navigate", next);
                    finish();
                }
            }, Math.max(0, screen.optInt("delayMs", 2000)));
        }
    }
}
