package com.blazeprotect.av;

import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.drawable.Drawable;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.View;
import android.widget.EditText;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** Installed applications with their install source; sideloaded apps are listed first. */
public class AppsActivity extends BaseActivity {
    private static final class AppItem {
        String pkg;
        String label;
        String source;
        boolean store;
        Drawable icon;
    }

    private List<AppItem> items;
    private Map<String, Threat> flagged;
    private LinearLayout list;
    private String query = "";

    @Override protected String screenTitle() { return "Applications"; }

    @Override
    protected void build() {
        if (items != null) {
            show();
            return;
        }
        loading("Inventaire des applications…");
        bg(new Runnable() {
            @Override public void run() {
                final List<AppItem> out = load();
                onUi(new Runnable() {
                    @Override public void run() {
                        if (isFinishing()) return;
                        items = out;
                        content.removeAllViews();
                        show();
                    }
                });
            }
        });
    }

    private List<AppItem> load() {
        PackageManager pm = getPackageManager();
        boolean system = Store.flag(this, Store.K_SYSTEM, false);
        List<AppItem> out = new ArrayList<>();
        for (ApplicationInfo ai : pm.getInstalledApplications(0)) {
            if (ai.packageName.equals(getPackageName()) || !Scanner.isUserVisibleApp(ai, system)) continue;
            AppItem it = new AppItem();
            it.pkg = ai.packageName;
            it.label = Scanner.label(pm, ai);
            it.store = Fmt.fromTrustedStore(pm, ai.packageName);
            it.source = Fmt.installer(pm, ai.packageName);
            try {
                it.icon = pm.getApplicationIcon(ai);
            } catch (Exception ignored) {
            }
            out.add(it);
        }
        final Collator coll = Collator.getInstance(Locale.FRANCE);
        Collections.sort(out, new Comparator<AppItem>() {
            @Override public int compare(AppItem a, AppItem b) {
                if (a.store != b.store) return a.store ? 1 : -1;
                return coll.compare(a.label, b.label);
            }
        });
        return out;
    }

    private void show() {
        flagged = new HashMap<>();
        for (Threat t : Store.activeThreats(this)) if (Threat.KIND_APP.equals(t.kind)) flagged.put(t.id, t);

        int side = 0;
        for (AppItem it : items) if (!it.store) side++;
        TextView intro = Ui.text(this, Ui.plural(items.size(), "application installée", "applications installées")
                + (side > 0 ? ", dont " + side + " hors boutique officielle (affichées en premier)." : ", toutes issues d'une boutique officielle."), 13.5f, Ui.TEXT2);
        intro.setPadding(dp(4), dp(8), dp(4), dp(12));
        add(intro);

        EditText search = new EditText(this);
        search.setHint("Rechercher une application");
        search.setHintTextColor(Ui.TEXT3);
        search.setTextColor(Ui.TEXT);
        search.setTextSize(15);
        search.setSingleLine(true);
        search.setText(query);
        search.setBackground(Ui.round(Ui.SURFACE, dp(12), Ui.STROKE, dp(1)));
        search.setPadding(dp(14), dp(12), dp(14), dp(12));
        search.setCompoundDrawablePadding(dp(10));
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(Editable s) {
                query = s.toString().trim().toLowerCase(Locale.ROOT);
                fill();
            }
        });
        add(search);

        list = Ui.group(this);
        content.addView(list, Ui.margins(Ui.matchWrap(), this, 0, 12, 0, 0));
        fill();
    }

    private void fill() {
        list.removeAllViews();
        int shown = 0;
        for (final AppItem it : items) {
            if (!query.isEmpty() && !it.label.toLowerCase(Locale.ROOT).contains(query) && !it.pkg.contains(query)) continue;
            Threat t = flagged.get(it.pkg);
            View badge = t != null ? Ui.badge(this, Threat.levelName(t.level), Ui.levelColor(t.level))
                    : !it.store ? Ui.badge(this, "Hors boutique", Ui.WARN) : null;
            LinearLayout r = Ui.row(this, 0, 0, it.label, it.source, badge, true);
            ImageView icon = new ImageView(this);
            if (it.icon != null) icon.setImageDrawable(it.icon);
            LinearLayout.LayoutParams ip = new LinearLayout.LayoutParams(dp(38), dp(38));
            ip.setMargins(0, 0, dp(14), 0);
            r.addView(icon, 0, ip);
            Ui.clickableRow(r, new View.OnClickListener() {
                @Override public void onClick(View v) {
                    startActivity(new Intent(AppsActivity.this, AppDetailActivity.class).putExtra("pkg", it.pkg));
                }
            });
            Ui.addToGroup(list, r);
            shown++;
        }
        list.setVisibility(shown == 0 ? View.GONE : View.VISIBLE);
    }
}
