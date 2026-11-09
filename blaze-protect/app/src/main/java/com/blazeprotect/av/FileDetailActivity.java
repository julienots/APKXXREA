package com.blazeprotect.av;

import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.File;

/** Report for one file on shared storage, with quarantine / delete / trust actions. */
public class FileDetailActivity extends BaseActivity {
    private String path;
    private Threat threat;

    @Override protected String screenTitle() { return "Fichier"; }

    @Override
    protected void build() {
        path = getIntent().getStringExtra("path");
        final File f = new File(path);
        if (!f.isFile()) {
            Store.resolve(this, path);
            emptyState("Fichier introuvable", "Ce fichier a été déplacé ou supprimé : il ne représente plus de menace.");
            return;
        }
        if (threat != null) {
            show(f);
            return;
        }
        loading("Analyse du fichier…");
        bg(new Runnable() {
            @Override public void run() {
                Threat found = null;
                for (Threat t : Store.loadReport(FileDetailActivity.this)) if (t.id.equals(path)) found = t;
                if (found == null) found = Scanner.scanFile(FileDetailActivity.this, f, null);
                final Threat result = found;
                onUi(new Runnable() {
                    @Override public void run() {
                        if (isFinishing()) return;
                        threat = result;
                        content.removeAllViews();
                        show(f);
                    }
                });
            }
        });
    }

    private void show(final File f) {
        boolean trusted = Store.isTrusted(this, path);
        int color = trusted ? Ui.OK : Ui.levelColor(threat.level);

        LinearLayout head = Ui.hbox(this);
        head.setPadding(dp(4), dp(12), dp(4), dp(8));
        head.addView(Ui.iconTile(this, R.drawable.ic_file, color, 56));
        LinearLayout names = Ui.vbox(this);
        TextView n = Ui.title(this, f.getName(), 18);
        n.setMaxLines(2);
        names.addView(n);
        LinearLayout badges = Ui.hbox(this);
        badges.setPadding(0, dp(6), 0, 0);
        badges.addView(Ui.badge(this, trusted ? "Approuvé" : Threat.levelName(threat.level), color));
        names.addView(badges);
        LinearLayout.LayoutParams np = Ui.weight(1);
        np.setMargins(dp(14), 0, 0, 0);
        head.addView(names, np);
        add(head);

        if (!threat.findings.isEmpty()) {
            addSection("Détection");
            LinearLayout g = Ui.group(this);
            for (Threat.Finding x : threat.findings) {
                Ui.addToGroup(g, Ui.row(this, R.drawable.ic_bug, Ui.levelColor(threat.level), x.title, x.detail, null, false));
            }
            add(g);
        } else {
            LinearLayout g = Ui.group(this);
            g.addView(Ui.row(this, R.drawable.ic_check, Ui.OK, "Aucune menace connue",
                    "Ce fichier ne correspond à aucune signature de la base.", null, false), Ui.matchWrap());
            content.addView(g, Ui.margins(Ui.matchWrap(), this, 0, 8, 0, 0));
        }

        addSection("Informations");
        LinearLayout info = Ui.group(this);
        Ui.addToGroup(info, Ui.kv(this, "Emplacement", f.getAbsolutePath(), true));
        Ui.addToGroup(info, Ui.kv(this, "Taille", Fmt.size(f.length()), false));
        Ui.addToGroup(info, Ui.kv(this, "Modifié", Fmt.dateTime(f.lastModified()), false));
        if (threat.sha256 != null) Ui.addToGroup(info, Ui.kv(this, "SHA-256", threat.sha256, true));
        add(info);

        if (!threat.isThreat()) return;
        addSection("Actions");
        if (!trusted) {
            TextView q = Ui.primaryButton(this, "Mettre en quarantaine");
            q.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    String e = Quarantine.isolate(FileDetailActivity.this, f, threat.detection);
                    if (e != null) {
                        toast(e);
                        return;
                    }
                    Store.resolve(FileDetailActivity.this, path);
                    toast("Fichier isolé en quarantaine.");
                    finish();
                }
            });
            add(q);
            TextView del = Ui.dangerButton(this, "Supprimer définitivement");
            del.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    confirm("Supprimer le fichier ?", f.getName() + " sera effacé de l'appareil. Cette action est irréversible.", "Supprimer", new Runnable() {
                        @Override public void run() {
                            if (!f.delete()) {
                                toast("Suppression refusée. Accordez l'accès à tous les fichiers dans les réglages.");
                                return;
                            }
                            Store.resolve(FileDetailActivity.this, path);
                            Journal.log(FileDetailActivity.this, Journal.ACTION, "Fichier supprimé", path);
                            toast("Fichier supprimé.");
                            finish();
                        }
                    });
                }
            });
            content.addView(del, Ui.margins(Ui.matchWrap(), this, 0, 10, 0, 0));
        }
        final boolean nowTrusted = trusted;
        TextView tr = Ui.secondaryButton(this, nowTrusted ? "Ne plus faire confiance" : "Faire confiance à ce fichier");
        tr.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                if (nowTrusted) {
                    Store.setTrusted(FileDetailActivity.this, path, false);
                    refresh();
                    return;
                }
                confirm("Faire confiance ?", "Ce fichier ne sera plus signalé. Ne le faites que si vous savez qu'il est inoffensif.", "Faire confiance", new Runnable() {
                    @Override public void run() {
                        Store.setTrusted(FileDetailActivity.this, path, true);
                        refresh();
                    }
                });
            }
        });
        content.addView(tr, Ui.margins(Ui.matchWrap(), this, 0, 10, 0, 0));
    }
}
