package com.blazeprotect.av;

import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.net.Uri;
import android.os.Environment;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.Switch;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/** Protection switches, scan schedule, signature database, allow-list and permissions. */
public class SettingsActivity extends BaseActivity {
    private static final int REQ_IMPORT = 21;
    private static final String K_NOTIFY_CLEAN = "notify_clean";

    @Override protected String screenTitle() { return "Réglages"; }

    @Override
    public void onRequestPermissionsResult(int req, String[] p, int[] r) {
        refresh();
        ShieldService.sync(this);
    }

    @Override
    protected void build() {
        addSection("Protection en temps réel");
        LinearLayout g = Ui.group(this);
        toggle(g, R.drawable.ic_shield, "Protection en temps réel",
                "Analyse chaque application installée ou mise à jour, dès son installation", Store.K_REALTIME, true, new Runnable() {
                    @Override public void run() {
                        boolean on = Store.realtime(SettingsActivity.this);
                        Journal.log(SettingsActivity.this, on ? Journal.INFO : Journal.WARN,
                                on ? "Protection en temps réel activée" : "Protection en temps réel désactivée", null);
                        ShieldService.sync(SettingsActivity.this);
                    }
                });
        toggle(g, R.drawable.ic_download, "Surveiller les téléchargements",
                "Analyse les fichiers reçus dans Téléchargements, Documents et Bluetooth", Store.K_WATCH_DOWNLOADS, true, restartShield());
        toggle(g, R.drawable.ic_check, "Confirmer les installations saines",
                "Notification après l'analyse d'une nouvelle application sans menace", K_NOTIFY_CLEAN, true, null);
        add(g);

        addSection("Analyses");
        LinearLayout a = Ui.group(this);
        int days = Store.integer(this, Store.K_SCHEDULE, 1);
        LinearLayout sched = Ui.row(this, R.drawable.ic_history, Ui.ACCENT, "Analyse rapide programmée", scheduleName(days), null, true);
        Ui.clickableRow(sched, new View.OnClickListener() {
            @Override public void onClick(View v) { chooseSchedule(); }
        });
        Ui.addToGroup(a, sched);
        toggle(a, R.drawable.ic_apps, "Applications système mises à jour",
                "Incluses dans les analyses rapides ; les analyses complètes les incluent toujours",
                Store.K_SYSTEM, false, null);
        add(a);

        addSection("Base de signatures");
        SignatureDb db = SignatureDb.get(this);
        LinearLayout s = Ui.group(this);
        Ui.addToGroup(s, Ui.row(this, R.drawable.ic_bug, Ui.INFO, Ui.plural(db.total(), "signature", "signatures"),
                db.builtinCount() + " intégrées, " + db.userCount() + " importées", null, false));
        LinearLayout imp = Ui.row(this, R.drawable.ic_download, Ui.ACCENT, "Importer une liste d'empreintes",
                "Fichier texte ou CSV contenant des SHA-256 / MD5 (flux de veille, exports MalwareBazaar…)", null, true);
        Ui.clickableRow(imp, new View.OnClickListener() {
            @Override public void onClick(View v) {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                try {
                    startActivityForResult(i, REQ_IMPORT);
                } catch (Exception e) {
                    toast("Aucun sélecteur de fichiers disponible.");
                }
            }
        });
        Ui.addToGroup(s, imp);
        if (db.userCount() > 0) {
            LinearLayout clr = Ui.row(this, R.drawable.ic_delete, Ui.DANGER, "Effacer les signatures importées", null, null, false);
            Ui.clickableRow(clr, new View.OnClickListener() {
                @Override public void onClick(View v) {
                    confirm("Effacer les signatures importées ?", "Seules les signatures intégrées à l'application seront conservées.", "Effacer", new Runnable() {
                        @Override public void run() {
                            SignatureDb.clearUser(SettingsActivity.this);
                            Journal.log(SettingsActivity.this, Journal.INFO, "Signatures importées effacées", null);
                            refresh();
                        }
                    });
                }
            });
            Ui.addToGroup(s, clr);
        }
        add(s);

        addSection("Liste de confiance");
        final int trusted = Store.trusted(this).size();
        LinearLayout t = Ui.group(this);
        LinearLayout tr = Ui.row(this, R.drawable.ic_check, Ui.OK, trusted == 0 ? "Aucun élément approuvé" : Ui.plural(trusted, "élément approuvé", "éléments approuvés"),
                "Applications et fichiers que vous avez choisi de ne plus signaler", null, trusted > 0);
        if (trusted > 0) {
            Ui.clickableRow(tr, new View.OnClickListener() {
                @Override public void onClick(View v) { showTrusted(); }
            });
        }
        Ui.addToGroup(t, tr);
        add(t);

        addSection("Autorisations");
        LinearLayout p = Ui.group(this);
        boolean st = Perms.storage(this);
        LinearLayout sr = Ui.row(this, R.drawable.ic_folder, st ? Ui.OK : Ui.WARN, "Accès aux fichiers",
                "Analyse du stockage, surveillance des téléchargements et quarantaine",
                Ui.badge(this, st ? "Accordé" : "Requis", st ? Ui.OK : Ui.WARN), false);
        Ui.clickableRow(sr, new View.OnClickListener() {
            @Override public void onClick(View v) { Perms.requestStorage(SettingsActivity.this); }
        });
        Ui.addToGroup(p, sr);
        boolean nt = Perms.notifications(this);
        LinearLayout nr = Ui.row(this, R.drawable.ic_info, nt ? Ui.OK : Ui.WARN, "Notifications",
                "Alertes de menace et comptes rendus d'analyse",
                Ui.badge(this, nt ? "Activées" : "Désactivées", nt ? Ui.OK : Ui.WARN), false);
        Ui.clickableRow(nr, new View.OnClickListener() {
            @Override public void onClick(View v) { Perms.openNotificationSettings(SettingsActivity.this); }
        });
        Ui.addToGroup(p, nr);
        add(p);

        addSection("Vérification");
        LinearLayout v = Ui.group(this);
        LinearLayout eicar = Ui.row(this, R.drawable.ic_flame, Ui.ACCENT, "Tester la détection",
                "Crée le fichier de test standard EICAR (inoffensif) dans Téléchargements", null, true);
        Ui.clickableRow(eicar, new View.OnClickListener() {
            @Override public void onClick(View view) { createEicar(); }
        });
        Ui.addToGroup(v, eicar);
        add(v);

        addSection("À propos");
        LinearLayout ab = Ui.group(this);
        String version = "—";
        try {
            version = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception ignored) {
        }
        Ui.addToGroup(ab, Ui.kv(this, "Version", version, false));
        Ui.addToGroup(ab, Ui.kv(this, "Fonctionnement", "Entièrement hors ligne : aucune donnée ne quitte l'appareil.", false));
        add(ab);
    }

    private void toggle(LinearLayout group, int icon, String title, String sub, final String key, final boolean def, final Runnable after) {
        final Switch sw = new Switch(this);
        sw.setChecked(Store.flag(this, key, def));
        int[][] states = {{android.R.attr.state_checked}, {}};
        sw.setThumbTintList(new ColorStateList(states, new int[]{Ui.ACCENT, Ui.TEXT2}));
        sw.setTrackTintList(new ColorStateList(states, new int[]{Ui.alpha(Ui.ACCENT, 0.45f), Ui.STROKE}));
        sw.setClickable(false);
        sw.setFocusable(false);
        LinearLayout r = Ui.row(this, icon, Ui.ACCENT, title, sub, sw, false);
        Ui.clickableRow(r, new View.OnClickListener() {
            @Override public void onClick(View v) {
                boolean on = !sw.isChecked();
                sw.setChecked(on);
                Store.setFlag(SettingsActivity.this, key, on);
                if (after != null) after.run();
            }
        });
        Ui.addToGroup(group, r);
    }

    private Runnable restartShield() {
        return new Runnable() {
            @Override public void run() {
                stopService(new Intent(SettingsActivity.this, ShieldService.class));
                ShieldService.sync(SettingsActivity.this);
            }
        };
    }

    private static String scheduleName(int days) {
        if (days <= 0) return "Désactivée";
        if (days == 1) return "Tous les jours (batterie suffisante)";
        return "Toutes les semaines (batterie suffisante)";
    }

    private void chooseSchedule() {
        final int[] values = {0, 1, 7};
        int cur = Store.integer(this, Store.K_SCHEDULE, 1);
        int checked = cur <= 0 ? 0 : cur == 1 ? 1 : 2;
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Analyse programmée")
                .setSingleChoiceItems(new String[]{"Désactivée", "Quotidienne", "Hebdomadaire"}, checked, new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        Store.setInt(SettingsActivity.this, Store.K_SCHEDULE, values[which]);
                        Receivers.ScheduledScan.schedule(SettingsActivity.this);
                        d.dismiss();
                        refresh();
                    }
                })
                .setNegativeButton("Annuler", null)
                .show();
    }

    private void showTrusted() {
        final String[] ids = Store.trusted(this).toArray(new String[0]);
        java.util.Arrays.sort(ids);
        new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle("Touchez un élément pour le retirer")
                .setItems(ids, new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int which) {
                        Store.setTrusted(SettingsActivity.this, ids[which], false);
                        refresh();
                    }
                })
                .setPositiveButton("Tout retirer", new DialogInterface.OnClickListener() {
                    @Override public void onClick(DialogInterface d, int w) {
                        Store.clearTrusted(SettingsActivity.this);
                        Journal.log(SettingsActivity.this, Journal.INFO, "Liste de confiance vidée", null);
                        refresh();
                    }
                })
                .setNegativeButton("Fermer", null)
                .show();
    }

    @SuppressWarnings("deprecation")
    private void createEicar() {
        if (!Perms.storage(this)) {
            toast("Accordez d'abord l'accès aux fichiers.");
            Perms.requestStorage(this);
            return;
        }
        File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
        File f = new File(dir, "eicar-test-blaze.txt");
        try (FileOutputStream out = new FileOutputStream(f)) {
            out.write(Scanner.EICAR.getBytes(StandardCharsets.ISO_8859_1));
        } catch (Exception e) {
            toast("Impossible d'écrire dans Téléchargements.");
            return;
        }
        if (Store.isTrusted(this, f.getAbsolutePath())) Store.setTrusted(this, f.getAbsolutePath(), false);
        boolean live = Store.realtime(this) && Store.flag(this, Store.K_WATCH_DOWNLOADS, true);
        toast(live ? "Fichier de test créé : la protection en temps réel doit l'intercepter dans quelques secondes."
                : "Fichier de test créé dans Téléchargements. Lancez une analyse rapide pour le détecter.");
    }

    @Override
    protected void onActivityResult(int req, int res, final Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_IMPORT || res != RESULT_OK || data == null || data.getData() == null) return;
        final Uri uri = data.getData();
        bg(new Runnable() {
            @Override public void run() {
                String msg;
                try (InputStream in = getContentResolver().openInputStream(uri)) {
                    int n = SignatureDb.importFrom(SettingsActivity.this, in, "Malware.Imported");
                    msg = n == 0 ? "Aucune nouvelle empreinte trouvée dans ce fichier."
                            : Ui.plural(n, "nouvelle signature importée", "nouvelles signatures importées") + ".";
                    if (n > 0) Journal.log(SettingsActivity.this, Journal.INFO, "Base de signatures mise à jour", msg);
                } catch (Exception e) {
                    msg = "Import impossible : fichier illisible.";
                }
                final String m = msg;
                onUi(new Runnable() {
                    @Override public void run() {
                        toast(m);
                        refresh();
                    }
                });
            }
        });
    }
}
