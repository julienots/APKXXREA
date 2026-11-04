package io.appxray.runtime;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
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
        setContentView(new Ui(this).build(screen.optJSONObject("root")));
    }
}
