package com.blazeprotect.av;

import android.content.Intent;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** Active threats from the last scan and the real-time shield, with the actions to resolve them. */
public class ResultsActivity extends BaseActivity {
    @Override protected String screenTitle() { return "Menaces"; }

    @Override
    protected void build() {
        loading("Chargement…");
        bg(new Runnable() {
            @Override public void run() {
                final List<Threat> list = Store.activeThreats(ResultsActivity.this);
                onUi(new Runnable() {
                    @Override public void run() {
                        if (isFinishing()) return;
                        content.removeAllViews();
                        show(list);
                    }
                });
            }
        });
    }

    private void show(List<Threat> list) {
        if (list.isEmpty()) {
            emptyState("Aucune menace active", "Toutes les menaces ont été traitées. Les applications et fichiers approuvés ne sont plus signalés.");
            return;
        }
        int appCount = 0;
        final List<Threat> fileThreats = new ArrayList<>();
        for (Threat t : list) {
            if (Threat.KIND_APP.equals(t.kind)) appCount++;
            else fileThreats.add(t);
        }

        TextView intro = Ui.text(this, Ui.plural(list.size(), "élément nécessite", "éléments nécessitent")
                + " votre attention. Touchez un élément pour voir le détail et le neutraliser.", 13.5f, Ui.TEXT2);
        intro.setPadding(dp(4), dp(8), dp(4), 0);
        add(intro);

        if (appCount > 0) {
            addSection("Applications");
            LinearLayout g = Ui.group(this);
            for (Threat t : list) if (Threat.KIND_APP.equals(t.kind)) row(g, t);
            add(g);
        }
        if (!fileThreats.isEmpty()) {
            addSection("Fichiers");
            LinearLayout g = Ui.group(this);
            for (Threat t : fileThreats) row(g, t);
            add(g);
            if (fileThreats.size() > 1) {
                TextView all = Ui.primaryButton(this, "Mettre les " + fileThreats.size() + " fichiers en quarantaine");
                all.setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View v) { isolateAll(fileThreats); }
                });
                content.addView(all, Ui.margins(Ui.matchWrap(), this, 0, 16, 0, 0));
            }
        }
        if (appCount > 0) {
            TextView hint = Ui.text(this, "Les applications malveillantes doivent être désinstallées : Android ne permet pas à un antivirus de les supprimer sans votre confirmation.", 12.5f, Ui.TEXT3);
            hint.setPadding(dp(4), dp(16), dp(4), 0);
            add(hint);
        }
    }

    private void row(LinearLayout g, final Threat t) {
        boolean app = Threat.KIND_APP.equals(t.kind);
        int color = Ui.levelColor(t.level);
        String sub = (t.detection != null ? t.detection : Threat.levelName(t.level)) + "\n" + t.id;
        LinearLayout r = Ui.row(this, app ? R.drawable.ic_apps : R.drawable.ic_file, color, t.label, sub,
                Ui.badge(this, Threat.levelName(t.level), color), true);
        Ui.clickableRow(r, new View.OnClickListener() {
            @Override public void onClick(View v) { open(t); }
        });
        Ui.addToGroup(g, r);
    }

    private void open(Threat t) {
        if (Threat.KIND_APP.equals(t.kind)) {
            startActivity(new Intent(this, AppDetailActivity.class).putExtra("pkg", t.id));
        } else {
            startActivity(new Intent(this, FileDetailActivity.class).putExtra("path", t.id));
        }
    }

    private void isolateAll(final List<Threat> files) {
        confirm("Mettre en quarantaine", Ui.plural(files.size(), "fichier sera isolé", "fichiers seront isolés")
                + " dans l'espace privé de Blaze Protect. Vous pourrez les restaurer ou les supprimer depuis la quarantaine.", "Isoler", new Runnable() {
            @Override public void run() {
                content.removeAllViews();
                loading("Mise en quarantaine…");
                bg(new Runnable() {
                    @Override public void run() {
                        int ok = 0;
                        String error = null;
                        for (Threat t : files) {
                            String e = Quarantine.isolate(ResultsActivity.this, new File(t.id), t.detection);
                            if (e == null) {
                                Store.resolve(ResultsActivity.this, t.id);
                                ok++;
                            } else {
                                error = e;
                            }
                        }
                        final String msg = Ui.plural(ok, "fichier isolé", "fichiers isolés") + (error != null ? ". " + error : ".");
                        onUi(new Runnable() {
                            @Override public void run() {
                                toast(msg);
                                refresh();
                            }
                        });
                    }
                });
            }
        });
    }
}
