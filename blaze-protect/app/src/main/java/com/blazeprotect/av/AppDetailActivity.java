package com.blazeprotect.av;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.drawable.Drawable;
import android.net.Uri;
import android.view.Gravity;
import android.view.View;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Report for one installed application: detection, origin, sensitive permissions, actions. */
public class AppDetailActivity extends BaseActivity {
    /** Permissions worth surfacing to the user, with a plain-language explanation. */
    private static final Map<String, String> SENSITIVE = new LinkedHashMap<>();

    static {
        SENSITIVE.put("android.permission.READ_SMS", "Lire vos SMS");
        SENSITIVE.put("android.permission.RECEIVE_SMS", "Intercepter les SMS reçus");
        SENSITIVE.put("android.permission.SEND_SMS", "Envoyer des SMS (éventuellement surtaxés)");
        SENSITIVE.put("android.permission.READ_CALL_LOG", "Lire le journal d'appels");
        SENSITIVE.put("android.permission.CALL_PHONE", "Passer des appels");
        SENSITIVE.put("android.permission.READ_CONTACTS", "Lire vos contacts");
        SENSITIVE.put("android.permission.RECORD_AUDIO", "Enregistrer avec le micro");
        SENSITIVE.put("android.permission.CAMERA", "Utiliser l'appareil photo");
        SENSITIVE.put("android.permission.ACCESS_FINE_LOCATION", "Localisation précise");
        SENSITIVE.put("android.permission.ACCESS_BACKGROUND_LOCATION", "Localisation en arrière-plan");
        SENSITIVE.put("android.permission.READ_PHONE_STATE", "Identifiants du téléphone et état des appels");
        SENSITIVE.put("android.permission.SYSTEM_ALERT_WINDOW", "Afficher par-dessus les autres applications");
        SENSITIVE.put("android.permission.REQUEST_INSTALL_PACKAGES", "Installer d'autres applications");
        SENSITIVE.put("android.permission.BIND_ACCESSIBILITY_SERVICE", "Service d'accessibilité (contrôle de l'écran)");
        SENSITIVE.put("android.permission.BIND_DEVICE_ADMIN", "Administrateur de l'appareil");
        SENSITIVE.put("android.permission.BIND_NOTIFICATION_LISTENER_SERVICE", "Lire toutes les notifications");
        SENSITIVE.put("android.permission.MANAGE_EXTERNAL_STORAGE", "Accès à tous les fichiers");
        SENSITIVE.put("android.permission.QUERY_ALL_PACKAGES", "Lister toutes les applications installées");
    }

    private String pkg;
    private Threat threat;
    private boolean uninstallRequested;

    @Override protected String screenTitle() { return "Application"; }

    @Override
    protected void build() {
        pkg = getIntent().getStringExtra("pkg");
        final PackageManager pm = getPackageManager();
        final PackageInfo pi;
        try {
            pi = pm.getPackageInfo(pkg, PackageManager.GET_PERMISSIONS | PackageManager.GET_SERVICES | PackageManager.GET_RECEIVERS);
        } catch (Exception e) {
            if (uninstallRequested) {
                Journal.log(this, Journal.ACTION, "Application désinstallée", pkg);
                toast("Application désinstallée.");
            }
            Store.resolve(this, pkg);
            finish();
            return;
        }
        if (threat != null) {
            show(pi);
            return;
        }
        loading("Analyse de l'application…");
        bg(new Runnable() {
            @Override public void run() {
                Threat found = null;
                for (Threat t : Store.loadReport(AppDetailActivity.this)) if (t.id.equals(pkg)) found = t;
                if (found == null) found = Scanner.scanApp(AppDetailActivity.this, pkg, true, null);
                final Threat result = found;
                onUi(new Runnable() {
                    @Override public void run() {
                        if (isFinishing()) return;
                        threat = result;
                        content.removeAllViews();
                        show(pi);
                    }
                });
            }
        });
    }

    private void show(final PackageInfo pi) {
        PackageManager pm = getPackageManager();
        ApplicationInfo ai = pi.applicationInfo;
        boolean trusted = Store.isTrusted(this, pkg);
        int color = trusted ? Ui.OK : Ui.levelColor(threat.level);

        LinearLayout head = Ui.hbox(this);
        head.setPadding(dp(4), dp(12), dp(4), dp(8));
        ImageView icon = new ImageView(this);
        try {
            Drawable d = pm.getApplicationIcon(ai);
            icon.setImageDrawable(d);
        } catch (Exception ignored) {
        }
        head.addView(icon, new LinearLayout.LayoutParams(dp(56), dp(56)));
        LinearLayout names = Ui.vbox(this);
        names.addView(Ui.title(this, Scanner.label(pm, ai), 19));
        TextView p = Ui.mono(this, pkg, 12, Ui.TEXT2);
        p.setPadding(0, dp(2), 0, dp(6));
        names.addView(p);
        LinearLayout badges = Ui.hbox(this);
        badges.addView(Ui.badge(this, trusted ? "Approuvée" : Threat.levelName(threat.level), color));
        names.addView(badges);
        LinearLayout.LayoutParams np = Ui.weight(1);
        np.setMargins(dp(14), 0, 0, 0);
        head.addView(names, np);
        add(head);

        if (!threat.findings.isEmpty()) {
            addSection("Détection");
            LinearLayout g = Ui.group(this);
            for (Threat.Finding f : threat.findings) {
                Ui.addToGroup(g, Ui.row(this, R.drawable.ic_bug, Ui.levelColor(threat.level), f.title, f.detail, null, false));
            }
            add(g);
        } else {
            LinearLayout g = Ui.group(this);
            g.addView(Ui.row(this, R.drawable.ic_check, Ui.OK, "Aucune menace connue",
                    "Cette application ne correspond à aucune signature de la base.", null, false), Ui.matchWrap());
            content.addView(g, Ui.margins(Ui.matchWrap(), this, 0, 8, 0, 0));
        }

        addSection("Informations");
        LinearLayout info = Ui.group(this);
        Ui.addToGroup(info, Ui.kv(this, "Version", pi.versionName == null ? "—" : pi.versionName, false));
        Ui.addToGroup(info, Ui.kv(this, "Origine", Fmt.installer(pm, pkg), false));
        Ui.addToGroup(info, Ui.kv(this, "Installée", Fmt.dateTime(pi.firstInstallTime), false));
        if (pi.lastUpdateTime > pi.firstInstallTime + 1000) {
            Ui.addToGroup(info, Ui.kv(this, "Mise à jour", Fmt.dateTime(pi.lastUpdateTime), false));
        }
        if (ai.sourceDir != null) Ui.addToGroup(info, Ui.kv(this, "Taille de l'APK", Fmt.size(new File(ai.sourceDir).length()), false));
        Ui.addToGroup(info, Ui.kv(this, "SDK cible", String.valueOf(ai.targetSdkVersion), false));
        if (threat.sha256 != null) Ui.addToGroup(info, Ui.kv(this, "SHA-256", threat.sha256, true));
        add(info);

        List<String> sensitive = sensitive(pi);
        addSection("Autorisations sensibles");
        LinearLayout perms = Ui.group(this);
        if (sensitive.isEmpty()) {
            perms.addView(Ui.row(this, R.drawable.ic_check, Ui.OK, "Aucune", "L'application ne demande aucun accès sensible.", null, false), Ui.matchWrap());
        } else {
            for (String s : sensitive) Ui.addToGroup(perms, Ui.row(this, R.drawable.ic_key, Ui.TEXT2, s, null, null, false));
        }
        add(perms);
        if (!sensitive.isEmpty()) {
            TextView n = Ui.text(this, "Ces autorisations ne sont pas dangereuses en soi ; vérifiez qu'elles correspondent à l'usage de l'application.", 12.5f, Ui.TEXT3);
            n.setPadding(dp(4), dp(8), dp(4), 0);
            add(n);
        }

        addSection("Actions");
        boolean system = (ai.flags & ApplicationInfo.FLAG_SYSTEM) != 0;
        if (!system) {
            TextView un = threat.isThreat() && !trusted ? Ui.primaryButton(this, "Désinstaller") : Ui.dangerButton(this, "Désinstaller");
            if (threat.isThreat() && !trusted) un.setBackground(Ui.pressable(this, Ui.round(Ui.DANGER, dp(12), 0, 0), dp(12)));
            un.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    uninstallRequested = true;
                    Intent i = new Intent(Intent.ACTION_DELETE, Uri.parse("package:" + pkg));
                    if (!Perms.start(AppDetailActivity.this, i)) Perms.openAppSettings(AppDetailActivity.this, pkg);
                }
            });
            add(un);
        }
        if (threat.isThreat()) {
            final boolean nowTrusted = trusted;
            TextView tr = Ui.secondaryButton(this, nowTrusted ? "Ne plus faire confiance" : "Faire confiance à cette application");
            tr.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    if (nowTrusted) {
                        Store.setTrusted(AppDetailActivity.this, pkg, false);
                        refresh();
                    } else {
                        confirm("Faire confiance ?", "Cette application ne sera plus signalée lors des analyses. Ne le faites que si vous êtes certain de son origine.",
                                "Faire confiance", new Runnable() {
                                    @Override public void run() {
                                        Store.setTrusted(AppDetailActivity.this, pkg, true);
                                        refresh();
                                    }
                                });
                    }
                }
            });
            content.addView(tr, Ui.margins(Ui.matchWrap(), this, 0, 10, 0, 0));
        }
        LinearLayout links = Ui.hbox(this);
        links.setGravity(Gravity.CENTER);
        TextView settings = Ui.linkButton(this, "Réglages système");
        settings.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { Perms.openAppSettings(AppDetailActivity.this, pkg); }
        });
        links.addView(settings);
        TextView again = Ui.linkButton(this, "Analyser à nouveau");
        again.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) {
                threat = null;
                Store.resolve(AppDetailActivity.this, pkg);
                bg(new Runnable() {
                    @Override public void run() {
                        final Threat t = Scanner.scanApp(AppDetailActivity.this, pkg, true, null);
                        if (t.isThreat()) addToReport(t);
                        onUi(new Runnable() {
                            @Override public void run() {
                                threat = t;
                                toast(t.isThreat() ? "Menace confirmée : " + t.detection : "Aucune menace détectée.");
                                refresh();
                            }
                        });
                    }
                });
                content.removeAllViews();
                loading("Analyse de l'application…");
            }
        });
        links.addView(again);
        content.addView(links, Ui.margins(Ui.matchWrap(), this, 0, 10, 0, 0));
    }

    private void addToReport(Threat t) {
        List<Threat> l = Store.loadReport(this);
        List<Threat> keep = new ArrayList<>();
        keep.add(t);
        for (Threat x : l) if (!x.id.equals(t.id)) keep.add(x);
        Store.saveReport(this, keep);
    }

    private static List<String> sensitive(PackageInfo pi) {
        List<String> out = new ArrayList<>();
        java.util.Set<String> asked = new java.util.HashSet<>();
        if (pi.requestedPermissions != null) for (String p : pi.requestedPermissions) asked.add(p);
        // Accessibility, device-admin and notification-listener access are declared on components.
        if (pi.services != null) for (android.content.pm.ServiceInfo s : pi.services) if (s.permission != null) asked.add(s.permission);
        if (pi.receivers != null) for (android.content.pm.ActivityInfo r : pi.receivers) if (r.permission != null) asked.add(r.permission);
        for (Map.Entry<String, String> e : SENSITIVE.entrySet()) if (asked.contains(e.getKey())) out.add(e.getValue());
        return out;
    }
}
