package com.blazeprotect.av;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.List;

/** Files isolated in private storage: restore them to their original place or erase them. */
public class QuarantineActivity extends BaseActivity {
    @Override protected String screenTitle() { return "Quarantaine"; }

    @Override
    protected void build() {
        final List<Quarantine.Item> items = Quarantine.list(this);
        if (items.isEmpty()) {
            emptyState("La quarantaine est vide", "Les fichiers dangereux que vous isolez apparaissent ici. Ils ne peuvent plus être ouverts ni installés.");
            return;
        }
        long total = 0;
        for (Quarantine.Item it : items) total += it.size;
        TextView intro = Ui.text(this, Ui.plural(items.size(), "fichier isolé", "fichiers isolés") + " (" + Fmt.size(total)
                + "). Leur contenu est encodé : ils sont inoffensifs tant qu'ils restent ici.", 13.5f, Ui.TEXT2);
        intro.setPadding(dp(4), dp(8), dp(4), 0);
        add(intro);

        addSection("Fichiers");
        LinearLayout g = Ui.group(this);
        for (final Quarantine.Item it : items) {
            String sub = (it.detection == null || it.detection.isEmpty() ? "Menace" : it.detection)
                    + " · " + Fmt.size(it.size) + " · " + Fmt.ago(it.time) + "\n" + it.path;
            LinearLayout r = Ui.row(this, R.drawable.ic_lock, Ui.WARN, it.name, sub, null, true);
            Ui.clickableRow(r, new View.OnClickListener() {
                @Override public void onClick(View v) { actions(it); }
            });
            Ui.addToGroup(g, r);
        }
        add(g);

        TextView clear = Ui.dangerButton(this, "Tout supprimer définitivement");
        clear.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                confirm("Vider la quarantaine ?", Ui.plural(items.size(), "fichier sera effacé", "fichiers seront effacés")
                        + " définitivement.", "Tout supprimer", new Runnable() {
                    @Override public void run() {
                        for (Quarantine.Item it : items) Quarantine.delete(QuarantineActivity.this, it.id);
                        refresh();
                    }
                });
            }
        });
        content.addView(clear, Ui.margins(Ui.matchWrap(), this, 0, 20, 0, 0));
    }

    private void actions(final Quarantine.Item it) {
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(it.name)
                .setItems(new String[]{"Restaurer à l'emplacement d'origine", "Supprimer définitivement"}, new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        if (which == 0) {
                            confirm("Restaurer ce fichier ?", it.path + "\n\nIl a été détecté comme " + it.detection
                                    + ". Il sera ajouté à la liste de confiance et ne sera plus signalé.", "Restaurer", new Runnable() {
                                @Override public void run() {
                                    String e = Quarantine.restore(QuarantineActivity.this, it.id);
                                    toast(e == null ? "Fichier restauré." : e);
                                    refresh();
                                }
                            });
                        } else {
                            confirm("Supprimer définitivement ?", it.name + " sera effacé. Cette action est irréversible.", "Supprimer", new Runnable() {
                                @Override public void run() {
                                    Quarantine.delete(QuarantineActivity.this, it.id);
                                    refresh();
                                }
                            });
                        }
                    }
                })
                .show();
    }
}
