package com.blazeprotect.av;

import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.List;

/** Home screen: protection status, scan shortcuts and entry points to every tool. */
public class MainActivity extends BaseActivity implements ScanManager.Listener {
    private boolean wasRunning;

    @Override protected String screenTitle() { return "Blaze Protect"; }

    @Override protected boolean showBack() { return false; }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        addBarAction(R.drawable.ic_tune, "Réglages", go(SettingsActivity.class));
        if (!Store.flag(this, Store.K_ONBOARDED, false)) {
            Store.setFlag(this, Store.K_ONBOARDED, true);
            Journal.log(this, Journal.INFO, "Blaze Protect installé", "Base de signatures : "
                    + Ui.plural(SignatureDb.get(this).total(), "entrée", "entrées"));
        }
        Receivers.ScheduledScan.schedule(this);
    }

    @Override
    protected void onResume() {
        ScanManager sm = ScanManager.get(this);
        wasRunning = sm.running();
        sm.addListener(this);
        // Also picks up storage access granted from the system settings screen.
        ShieldService.sync(this);
        super.onResume();
    }

    @Override
    protected void onPause() {
        ScanManager.get(this).removeListener(this);
        super.onPause();
    }

    @Override
    public void onScanUpdate(ScanManager.State s) {
        if (s.running != wasRunning) {
            wasRunning = s.running;
            refresh();
        }
    }

    @Override
    public void onRequestPermissionsResult(int req, String[] p, int[] r) {
        refresh();
        ShieldService.sync(this);
    }

    @Override
    protected void build() {
        final ScanManager sm = ScanManager.get(this);
        List<Threat> active = Store.activeThreats(this);
        long last = Store.prefs(this).getLong(Store.K_LAST_SCAN, 0);
        boolean stale = System.currentTimeMillis() - last > 7L * 86_400_000;
        boolean realtime = Store.realtime(this);

        int color;
        int icon;
        String head;
        String sub;
        String action;
        View.OnClickListener onAction;
        if (sm.running()) {
            ScanManager.State s = sm.state();
            color = Ui.ACCENT;
            icon = R.drawable.ic_search;
            head = "Analyse en cours…";
            sub = ScanManager.typeName(s.type) + " — " + Ui.plural(s.apps + s.files, "élément analysé", "éléments analysés");
            action = "Suivre l'analyse";
            onAction = go(ScanActivity.class);
        } else if (!active.isEmpty()) {
            color = Ui.DANGER;
            icon = R.drawable.ic_warning;
            head = active.size() == 1 ? "1 menace détectée" : active.size() + " menaces détectées";
            sub = "Des éléments dangereux sont présents sur l'appareil. Neutralisez-les maintenant.";
            action = "Résoudre";
            onAction = go(ResultsActivity.class);
        } else if (!realtime) {
            color = Ui.WARN;
            icon = R.drawable.ic_warning;
            head = "Protection désactivée";
            sub = "Les nouvelles applications et les téléchargements ne sont plus analysés automatiquement.";
            action = "Activer la protection";
            onAction = new View.OnClickListener() {
                @Override public void onClick(View v) {
                    Store.setFlag(MainActivity.this, Store.K_REALTIME, true);
                    ShieldService.sync(MainActivity.this);
                    Journal.log(MainActivity.this, Journal.INFO, "Protection en temps réel activée", null);
                    refresh();
                }
            };
        } else if (last == 0 || stale) {
            color = Ui.WARN;
            icon = R.drawable.ic_shield;
            head = last == 0 ? "Première analyse recommandée" : "Analyse recommandée";
            sub = last == 0 ? "La protection en temps réel est active. Analysez l'appareil pour vérifier ce qui est déjà installé."
                    : "Dernière analyse " + Fmt.ago(last) + ".";
            action = "Analyse rapide";
            onAction = scan(ScanManager.QUICK);
        } else {
            color = Ui.OK;
            icon = R.drawable.ic_shield;
            head = "Appareil protégé";
            sub = "Aucune menace active. Dernière analyse " + Fmt.ago(last) + ".";
            action = "Analyse rapide";
            onAction = scan(ScanManager.QUICK);
        }
        hero(color, icon, head, sub, action, onAction);

        if (!Perms.storage(this)) {
            notice(R.drawable.ic_folder, "Accès aux fichiers requis",
                    "Sans cet accès, les téléchargements et le stockage ne peuvent pas être analysés.", "Autoriser",
                    new View.OnClickListener() {
                        @Override public void onClick(View v) { Perms.requestStorage(MainActivity.this); }
                    });
        }
        if (!Perms.notifications(this)) {
            notice(R.drawable.ic_info, "Notifications désactivées",
                    "Vous ne serez pas alerté si une menace est détectée en arrière-plan.", "Activer",
                    new View.OnClickListener() {
                        @Override public void onClick(View v) { Perms.openNotificationSettings(MainActivity.this); }
                    });
        }

        addSection("Analyser");
        LinearLayout g = Ui.group(this);
        scanRow(g, R.drawable.ic_bolt, "Analyse rapide", "Applications installées et dossiers de téléchargement", ScanManager.QUICK);
        scanRow(g, R.drawable.ic_phone, "Analyse complète", "Toutes les applications et l'intégralité du stockage", ScanManager.FULL);
        scanRow(g, R.drawable.ic_apps, "Applications", "Applications installées uniquement", ScanManager.APPS);
        scanRow(g, R.drawable.ic_folder, "Stockage", "Tous les fichiers du stockage partagé", ScanManager.STORAGE);
        navRow(g, R.drawable.ic_file, Ui.ACCENT, "Analyser un fichier", "Choisir un fichier ou un APK à vérifier", null, FileScanActivity.class);
        add(g);

        addSection("Protection");
        LinearLayout p = Ui.group(this);
        navRow(p, R.drawable.ic_shield, realtime ? Ui.OK : Ui.WARN, "Protection en temps réel",
                realtime ? "Installations et téléchargements surveillés" : "Désactivée",
                Ui.badge(this, realtime ? "Active" : "Inactive", realtime ? Ui.OK : Ui.WARN), SettingsActivity.class);
        navRow(p, R.drawable.ic_warning, active.isEmpty() ? Ui.TEXT2 : Ui.DANGER, "Menaces",
                active.isEmpty() ? "Aucune menace active" : Ui.plural(active.size(), "élément à traiter", "éléments à traiter"),
                active.isEmpty() ? null : Ui.badge(this, String.valueOf(active.size()), Ui.DANGER), ResultsActivity.class);
        navRow(p, R.drawable.ic_apps, Ui.INFO, "Applications installées", "Origine, autorisations sensibles et analyse détaillée", null, AppsActivity.class);
        int q = Quarantine.list(this).size();
        navRow(p, R.drawable.ic_lock, Ui.WARN, "Quarantaine",
                q == 0 ? "Aucun fichier isolé" : Ui.plural(q, "fichier isolé", "fichiers isolés"), null, QuarantineActivity.class);
        navRow(p, R.drawable.ic_history, Ui.TEXT2, "Journal de sécurité", "Analyses, détections et actions effectuées", null, JournalActivity.class);
        add(p);

        addSection("Statistiques");
        LinearLayout stats = Ui.hbox(this);
        stats.setGravity(Gravity.TOP);
        stat(stats, String.valueOf(Store.integer(this, Store.K_TOTAL_SCANS, 0)), "analyses", Ui.TEXT, false);
        stat(stats, String.valueOf(Store.integer(this, Store.K_TOTAL_THREATS, 0)), "menaces trouvées", Ui.TEXT, true);
        stat(stats, String.valueOf(SignatureDb.get(this).total()), "signatures", Ui.TEXT, true);
        add(stats);
    }

    private void hero(int color, int icon, String head, String sub, String action, View.OnClickListener onAction) {
        LinearLayout card = Ui.vbox(this);
        card.setGravity(Gravity.CENTER_HORIZONTAL);
        card.setBackground(Ui.round(Ui.SURFACE, dp(18), Ui.alpha(color, 0.35f), dp(1)));
        card.setPadding(dp(20), dp(26), dp(20), dp(20));
        card.addView(Ui.iconTile(this, icon, color, 76));
        TextView t = Ui.title(this, head, 21);
        t.setGravity(Gravity.CENTER);
        t.setPadding(0, dp(16), 0, dp(6));
        card.addView(t);
        TextView s = Ui.text(this, sub, 13.5f, Ui.TEXT2);
        s.setGravity(Gravity.CENTER);
        card.addView(s);
        TextView b = Ui.primaryButton(this, action);
        if (color == Ui.DANGER) b.setBackground(Ui.pressable(this, Ui.round(Ui.DANGER, dp(12), 0, 0), dp(12)));
        b.setOnClickListener(onAction);
        card.addView(b, Ui.margins(Ui.matchWrap(), this, 0, 20, 0, 0));
        content.addView(card, Ui.margins(Ui.matchWrap(), this, 0, 8, 0, 0));
    }

    private void notice(int icon, String title, String body, String action, View.OnClickListener l) {
        LinearLayout g = Ui.group(this);
        g.setBackground(Ui.round(Ui.alpha(Ui.WARN, 0.08f), dp(14), Ui.alpha(Ui.WARN, 0.35f), dp(1)));
        TextView link = Ui.linkButton(this, action);
        link.setTextColor(Ui.WARN);
        link.setOnClickListener(l);
        LinearLayout r = Ui.row(this, icon, Ui.WARN, title, body, link, false);
        Ui.clickableRow(r, l);
        g.addView(r, Ui.matchWrap());
        content.addView(g, Ui.margins(Ui.matchWrap(), this, 0, 12, 0, 0));
    }

    private void scanRow(LinearLayout g, int icon, String title, String sub, final int type) {
        LinearLayout r = Ui.row(this, icon, Ui.ACCENT, title, sub, null, true);
        Ui.clickableRow(r, scan(type));
        Ui.addToGroup(g, r);
    }

    private void navRow(LinearLayout g, int icon, int color, String title, String sub, View trailing, Class<?> target) {
        LinearLayout r = Ui.row(this, icon, color, title, sub, trailing, true);
        Ui.clickableRow(r, go(target));
        Ui.addToGroup(g, r);
    }

    private void stat(LinearLayout parent, String value, String label, int color, boolean gap) {
        LinearLayout c = Ui.vbox(this);
        Ui.card(c);
        c.setPadding(dp(14), dp(14), dp(14), dp(14));
        TextView v = Ui.title(this, value, 22);
        v.setTextColor(color);
        c.addView(v);
        TextView l = Ui.ellipsize(Ui.text(this, label, 12, Ui.TEXT2));
        c.addView(l);
        LinearLayout.LayoutParams lp = Ui.weight(1);
        if (gap) lp.setMargins(dp(10), 0, 0, 0);
        parent.addView(c, lp);
    }

    private View.OnClickListener scan(final int type) {
        return new View.OnClickListener() {
            @Override public void onClick(View v) {
                startActivity(new Intent(MainActivity.this, ScanActivity.class).putExtra(ScanActivity.EXTRA_TYPE, type));
            }
        };
    }

    private View.OnClickListener go(final Class<?> target) {
        return new View.OnClickListener() {
            @Override public void onClick(View v) { startActivity(new Intent(MainActivity.this, target)); }
        };
    }
}
