package com.blazeprotect.av;

import android.os.Bundle;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.List;

/** Chronological security log, grouped by day. */
public class JournalActivity extends BaseActivity {
    private static final int SHOWN = 300;

    @Override protected String screenTitle() { return "Journal de sécurité"; }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        addBarAction(R.drawable.ic_delete, "Effacer le journal", new View.OnClickListener() {
            @Override public void onClick(View v) {
                confirm("Effacer le journal ?", "Toutes les entrées seront supprimées.", "Effacer", new Runnable() {
                    @Override public void run() {
                        Journal.clear(JournalActivity.this);
                        refresh();
                    }
                });
            }
        });
    }

    @Override
    protected void build() {
        List<Journal.Entry> entries = Journal.entries(this);
        if (entries.isEmpty()) {
            emptyState("Journal vide", "Les analyses, détections et actions de protection seront enregistrées ici.");
            return;
        }
        String day = null;
        LinearLayout g = null;
        int n = 0;
        for (Journal.Entry e : entries) {
            if (n++ >= SHOWN) break;
            String d = Fmt.day(e.time);
            if (!d.equals(day)) {
                if (g != null) add(g);
                day = d;
                addSection(d);
                g = Ui.group(this);
            }
            int icon;
            int color;
            switch (e.type) {
                case Journal.ALERT: icon = R.drawable.ic_bug; color = Ui.DANGER; break;
                case Journal.WARN: icon = R.drawable.ic_warning; color = Ui.WARN; break;
                case Journal.SCAN: icon = R.drawable.ic_search; color = Ui.OK; break;
                case Journal.ACTION: icon = R.drawable.ic_check; color = Ui.ACCENT; break;
                default: icon = R.drawable.ic_info; color = Ui.INFO; break;
            }
            String sub = (e.detail == null || e.detail.isEmpty() ? "" : e.detail + "\n") + Fmt.time(e.time);
            Ui.addToGroup(g, Ui.row(this, icon, color, e.title, sub, null, false));
        }
        if (g != null) add(g);
        if (entries.size() > SHOWN) {
            TextView more = Ui.text(this, "Seules les " + SHOWN + " entrées les plus récentes sont affichées.", 12.5f, Ui.TEXT3);
            more.setPadding(dp(4), dp(12), dp(4), 0);
            add(more);
        }
    }
}
