package io.appxray.runtime;

import android.app.Activity;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.widget.CompoundButton;
import android.widget.LinearLayout;
import android.widget.Switch;

/** Persisted preferences screen. */
public class SettingsActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Config.applyTheme(this, "Paramètres");
        final SharedPreferences prefs = getSharedPreferences("settings", MODE_PRIVATE);
        int pad = (int) (16 * getResources().getDisplayMetrics().density);
        LinearLayout col = new LinearLayout(this);
        col.setOrientation(LinearLayout.VERTICAL);
        col.setPadding(pad, pad, pad, pad);
        String[][] items = {{"notifications", "Notifications"}, {"dark", "Thème sombre"}};
        for (final String[] it : items) {
            Switch s = new Switch(this);
            s.setText(it[1]);
            s.setPadding(0, pad / 2, 0, pad / 2);
            s.setChecked(prefs.getBoolean(it[0], false));
            s.setOnCheckedChangeListener(new CompoundButton.OnCheckedChangeListener() {
                @Override
                public void onCheckedChanged(CompoundButton b, boolean checked) {
                    prefs.edit().putBoolean(it[0], checked).apply();
                }
            });
            col.addView(s);
        }
        setContentView(col);
    }
}
