package com.blazeprotect.av;

import android.content.Intent;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Live view of the running scan, then its summary. */
public class ScanActivity extends BaseActivity implements ScanManager.Listener {
    public static final String EXTRA_TYPE = "type";

    private Ring ring;
    private TextView percent;
    private TextView phase;
    private TextView current;
    private TextView apps;
    private TextView files;
    private TextView threats;
    private boolean shownRunning;

    @Override protected String screenTitle() {
        ScanManager.State s = ScanManager.get(this).state();
        return s != null ? ScanManager.typeName(s.type) : "Analyse";
    }

    @Override
    protected void onCreate(Bundle b) {
        int type = getIntent().getIntExtra(EXTRA_TYPE, -1);
        ScanManager sm = ScanManager.get(this);
        if (b == null && type >= 0 && !sm.running()) sm.start(type);
        super.onCreate(b);
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        int type = i.getIntExtra(EXTRA_TYPE, -1);
        ScanManager sm = ScanManager.get(this);
        if (type >= 0 && !sm.running()) sm.start(type);
    }

    @Override
    protected void onResume() {
        ScanManager.get(this).addListener(this);
        super.onResume();
    }

    @Override
    protected void onPause() {
        ScanManager.get(this).removeListener(this);
        super.onPause();
    }

    @Override
    public void onScanUpdate(ScanManager.State s) {
        if (s.running != shownRunning) refresh();
        else if (s.running) update(s);
    }

    @Override
    protected void build() {
        ScanManager.State s = ScanManager.get(this).state();
        if (s == null) {
            emptyState("Aucune analyse en cours", "Lancez une analyse depuis l'écran d'accueil.");
            return;
        }
        shownRunning = s.running;

        FrameLayout gauge = new FrameLayout(this);
        ring = new Ring(this);
        gauge.addView(ring, new FrameLayout.LayoutParams(dp(196), dp(196), Gravity.CENTER));
        LinearLayout center = Ui.vbox(this);
        center.setGravity(Gravity.CENTER);
        gauge.addView(center, new FrameLayout.LayoutParams(dp(196), dp(196), Gravity.CENTER));
        LinearLayout.LayoutParams gp = Ui.matchWrap();
        gp.setMargins(0, dp(24), 0, dp(8));
        content.addView(gauge, gp);

        if (s.running) {
            percent = Ui.title(this, "", 34);
            percent.setGravity(Gravity.CENTER);
            center.addView(percent);
            TextView l = Ui.text(this, "analysé", 12.5f, Ui.TEXT2);
            l.setGravity(Gravity.CENTER);
            center.addView(l);

            phase = Ui.title(this, "", 16);
            phase.setGravity(Gravity.CENTER);
            phase.setPadding(0, dp(12), 0, dp(4));
            add(phase);
            current = Ui.ellipsize(Ui.text(this, "", 12.5f, Ui.TEXT3));
            current.setGravity(Gravity.CENTER);
            add(current);
        } else {
            boolean found = !s.threats.isEmpty();
            int color = s.cancelled ? Ui.WARN : found ? Ui.DANGER : Ui.OK;
            ring.setProgress(1f);
            ring.setColor(color);
            center.addView(Ui.icon(this, found || s.cancelled ? R.drawable.ic_warning : R.drawable.ic_check, color, 64));
            TextView h = Ui.title(this, s.cancelled ? "Analyse interrompue"
                    : found ? (s.threats.size() == 1 ? "1 menace détectée" : s.threats.size() + " menaces détectées")
                    : "Aucune menace détectée", 20);
            h.setGravity(Gravity.CENTER);
            h.setPadding(0, dp(12), 0, dp(4));
            add(h);
            TextView sub = Ui.text(this, "Terminée en " + Fmt.duration(s.end - s.start)
                    + (s.cancelled ? " — résultats partiels non enregistrés" : ""), 13, Ui.TEXT2);
            sub.setGravity(Gravity.CENTER);
            add(sub);
        }

        LinearLayout counts = Ui.hbox(this);
        apps = counter(counts, "Applications", false);
        files = counter(counts, "Fichiers", true);
        threats = counter(counts, "Menaces", true);
        content.addView(counts, Ui.margins(Ui.matchWrap(), this, 0, 24, 0, 0));

        boolean storageScan = s.type != ScanManager.APPS;
        if (storageScan && !Perms.storage(this)) {
            TextView w = Ui.text(this, "L'accès aux fichiers n'est pas accordé : le stockage n'a pas pu être analysé.", 12.5f, Ui.WARN);
            w.setGravity(Gravity.CENTER);
            w.setPadding(dp(8), dp(14), dp(8), 0);
            add(w);
        }

        if (s.running) {
            TextView cancel = Ui.secondaryButton(this, "Arrêter l'analyse");
            cancel.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    ScanManager.get(ScanActivity.this).cancel();
                    v.setEnabled(false);
                    ((TextView) v).setText("Arrêt…");
                }
            });
            content.addView(cancel, Ui.margins(Ui.matchWrap(), this, 0, 28, 0, 0));
            TextView hint = Ui.text(this, "Vous pouvez quitter cet écran : l'analyse se poursuit en arrière-plan.", 12.5f, Ui.TEXT3);
            hint.setGravity(Gravity.CENTER);
            hint.setPadding(0, dp(12), 0, 0);
            add(hint);
            update(s);
        } else {
            apps.setText(String.valueOf(s.apps));
            files.setText(String.valueOf(s.files));
            threats.setText(String.valueOf(s.threats.size()));
            if (!s.threats.isEmpty()) threats.setTextColor(Ui.DANGER);
            if (!s.threats.isEmpty() && !s.cancelled) {
                TextView see = Ui.primaryButton(this, "Neutraliser les menaces");
                see.setBackground(Ui.pressable(this, Ui.round(Ui.DANGER, dp(12), 0, 0), dp(12)));
                see.setOnClickListener(new View.OnClickListener() {
                    @Override public void onClick(View v) {
                        startActivity(new Intent(ScanActivity.this, ResultsActivity.class));
                        finish();
                    }
                });
                content.addView(see, Ui.margins(Ui.matchWrap(), this, 0, 28, 0, 0));
            }
            TextView done = Ui.secondaryButton(this, "Terminer");
            done.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) { finish(); }
            });
            content.addView(done, Ui.margins(Ui.matchWrap(), this, 0, s.threats.isEmpty() || s.cancelled ? 28 : 10, 0, 0));
        }
    }

    private void update(ScanManager.State s) {
        if (percent == null) return;
        if (s.total > 0) {
            float p = s.done / (float) s.total;
            ring.setProgress(Math.max(0.01f, p));
            percent.setText(Math.round(p * 100) + " %");
        } else {
            ring.setProgress(-1f);
            percent.setText("…");
        }
        phase.setText(s.phase.isEmpty() ? "Préparation" : s.phase + (s.total > 0 ? " — " + s.done + " / " + s.total : ""));
        current.setText(s.current);
        apps.setText(String.valueOf(s.apps));
        files.setText(String.valueOf(s.files));
        threats.setText(String.valueOf(s.threats.size()));
        threats.setTextColor(s.threats.isEmpty() ? Ui.TEXT : Ui.DANGER);
    }

    private TextView counter(LinearLayout parent, String label, boolean gap) {
        LinearLayout c = Ui.vbox(this);
        Ui.card(c);
        c.setGravity(Gravity.CENTER_HORIZONTAL);
        c.setPadding(dp(8), dp(12), dp(8), dp(12));
        TextView v = Ui.title(this, "0", 20);
        c.addView(v);
        c.addView(Ui.ellipsize(Ui.text(this, label, 12, Ui.TEXT2)));
        LinearLayout.LayoutParams lp = Ui.weight(1);
        if (gap) lp.setMargins(dp(10), 0, 0, 0);
        parent.addView(c, lp);
        return v;
    }
}
