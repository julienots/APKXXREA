package com.blazeprotect.av;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;
import android.view.Gravity;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * On-demand analysis of a single document: picked from the system file chooser, shared from
 * another app, or opened as an APK. The content is copied to private cache, scanned, then erased.
 */
public class FileScanActivity extends BaseActivity {
    private static final int REQ_PICK = 11;

    private Uri uri;
    private String name;
    private long size;
    private Threat result;
    private String error;
    private boolean scanning;

    @Override protected String screenTitle() { return "Analyser un fichier"; }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        uri = incoming(getIntent());
        if (uri != null) analyse();
        else if (b == null) pick();
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        Uri u = incoming(i);
        if (u != null) {
            uri = u;
            analyse();
        }
    }

    private static Uri incoming(Intent i) {
        if (Intent.ACTION_SEND.equals(i.getAction())) return i.getParcelableExtra(Intent.EXTRA_STREAM);
        if (Intent.ACTION_VIEW.equals(i.getAction())) return i.getData();
        return null;
    }

    private void pick() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
        try {
            startActivityForResult(i, REQ_PICK);
        } catch (Exception e) {
            toast("Aucun sélecteur de fichiers disponible.");
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req != REQ_PICK) return;
        if (res != RESULT_OK || data == null || data.getData() == null) {
            if (uri == null) finish();
            return;
        }
        uri = data.getData();
        analyse();
    }

    private void analyse() {
        result = null;
        error = null;
        scanning = true;
        name = "fichier";
        size = -1;
        try (Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int n = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int s = c.getColumnIndex(OpenableColumns.SIZE);
                if (n >= 0 && c.getString(n) != null) name = c.getString(n);
                if (s >= 0 && !c.isNull(s)) size = c.getLong(s);
            }
        } catch (Exception ignored) {
            if (uri.getLastPathSegment() != null) name = uri.getLastPathSegment();
        }
        refresh();
        final Uri target = uri;
        final String display = name;
        bg(new Runnable() {
            @Override public void run() {
                File dir = new File(getCacheDir(), "scan");
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                // Keep the extension: it decides whether the copy is parsed as an APK.
                File tmp = new File(dir, "sample." + (Scanner.ext(display).isEmpty() ? "bin" : Scanner.ext(display)));
                Threat t = null;
                String err = null;
                try (InputStream in = getContentResolver().openInputStream(target); OutputStream out = new FileOutputStream(tmp)) {
                    if (in == null) throw new java.io.IOException();
                    byte[] buf = new byte[64 * 1024];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                } catch (Exception e) {
                    err = "Impossible de lire ce fichier.";
                }
                if (err == null) {
                    t = Scanner.scanFile(FileScanActivity.this, tmp, display, null);
                    t.id = target.toString();
                    Journal.log(FileScanActivity.this, t.isThreat() ? Journal.ALERT : Journal.SCAN,
                            "Fichier analysé : " + display, t.isThreat() ? t.detection : "Aucune menace");
                }
                //noinspection ResultOfMethodCallIgnored
                tmp.delete();
                final Threat ft = t;
                final String fe = err;
                onUi(new Runnable() {
                    @Override public void run() {
                        scanning = false;
                        result = ft;
                        error = fe;
                        if (!isFinishing()) refresh();
                    }
                });
            }
        });
    }

    @Override
    protected void build() {
        if (uri == null) {
            emptyStateWithPick();
            return;
        }
        if (scanning) {
            loading("Analyse de « " + name + " »…");
            return;
        }
        if (error != null || result == null) {
            TextView e = Ui.text(this, error != null ? error : "Analyse impossible.", 14, Ui.WARN);
            e.setGravity(Gravity.CENTER);
            e.setPadding(0, dp(40), 0, dp(20));
            add(e);
            pickButton("Choisir un autre fichier");
            return;
        }
        boolean bad = result.isThreat();
        int color = Ui.levelColor(result.level);

        LinearLayout box = Ui.vbox(this);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setPadding(dp(8), dp(28), dp(8), dp(8));
        box.addView(Ui.iconTile(this, bad ? R.drawable.ic_warning : R.drawable.ic_check, color, 76));
        TextView h = Ui.title(this, bad ? "Fichier dangereux" : "Aucune menace détectée", 20);
        h.setGravity(Gravity.CENTER);
        h.setPadding(0, dp(16), 0, dp(4));
        box.addView(h);
        TextView n = Ui.text(this, name + (size >= 0 ? " — " + Fmt.size(size) : ""), 13.5f, Ui.TEXT2);
        n.setGravity(Gravity.CENTER);
        box.addView(n);
        add(box);

        if (!result.findings.isEmpty()) {
            addSection("Détection");
            LinearLayout g = Ui.group(this);
            for (Threat.Finding f : result.findings) Ui.addToGroup(g, Ui.row(this, R.drawable.ic_bug, color, f.title, f.detail, null, false));
            add(g);
        }
        if (result.sha256 != null) {
            addSection("Empreinte");
            LinearLayout g = Ui.group(this);
            g.addView(Ui.kv(this, "SHA-256", result.sha256, true), Ui.matchWrap());
            add(g);
        }

        if (bad) {
            addSection("Actions");
            TextView del = Ui.primaryButton(this, "Supprimer le fichier");
            del.setBackground(Ui.pressable(this, Ui.round(Ui.DANGER, dp(12), 0, 0), dp(12)));
            del.setOnClickListener(new View.OnClickListener() {
                @Override public void onClick(View v) {
                    confirm("Supprimer le fichier ?", name + " sera effacé. Cette action est irréversible.", "Supprimer", new Runnable() {
                        @Override public void run() { deleteSource(); }
                    });
                }
            });
            add(del);
        }
        LinearLayout links = Ui.hbox(this);
        links.setGravity(Gravity.CENTER);
        links.setPadding(0, dp(12), 0, 0);
        TextView other = Ui.linkButton(this, "Analyser un autre fichier");
        other.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { pick(); }
        });
        links.addView(other);
        add(links);
    }

    private void deleteSource() {
        boolean ok = false;
        try {
            ok = DocumentsContract.deleteDocument(getContentResolver(), uri);
        } catch (Exception ignored) {
        }
        if (!ok && "file".equals(uri.getScheme()) && uri.getPath() != null) ok = new File(uri.getPath()).delete();
        if (ok) {
            Journal.log(this, Journal.ACTION, "Fichier supprimé", name);
            toast("Fichier supprimé.");
            uri = null;
            result = null;
            refresh();
        } else {
            toast("L'application d'origine ne permet pas de supprimer ce fichier. Supprimez-le depuis votre gestionnaire de fichiers.");
        }
    }

    private void emptyStateWithPick() {
        LinearLayout box = Ui.vbox(this);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        box.setPadding(dp(16), dp(48), dp(16), dp(20));
        box.addView(Ui.iconTile(this, R.drawable.ic_file, Ui.ACCENT, 64));
        TextView t = Ui.title(this, "Vérifier un fichier", 18);
        t.setPadding(0, dp(16), 0, dp(6));
        box.addView(t);
        TextView b = Ui.text(this, "Choisissez un document, une archive ou un fichier APK reçu par messagerie ou téléchargé. Vous pouvez aussi utiliser « Partager → Analyser avec Blaze Protect » depuis n'importe quelle application.", 13.5f, Ui.TEXT2);
        b.setGravity(Gravity.CENTER);
        box.addView(b);
        add(box);
        pickButton("Choisir un fichier");
    }

    private void pickButton(String label) {
        TextView p = Ui.primaryButton(this, label);
        p.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { pick(); }
        });
        add(p);
    }
}
