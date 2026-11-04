package fr.cahier.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.format.DateFormat;
import android.view.LayoutInflater;
import android.view.View;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;
import java.lang.ref.WeakReference;
import java.util.Date;
import java.util.List;

public final class MainActivity extends Activity {
    private static WeakReference<MainActivity> current = new WeakReference<>(null);

    private EditText input;
    private LinearLayout list;
    private TextView count;
    private TextView warn;

    static void refreshIfOpen() {
        final MainActivity a = current.get();
        if (a != null) a.runOnUiThread(new Runnable() { public void run() { a.render(); } });
    }

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        input = findViewById(R.id.input);
        list = findViewById(R.id.list);
        count = findViewById(R.id.count);
        warn = findViewById(R.id.warn);

        findViewById(R.id.add).setOnClickListener(new View.OnClickListener() { public void onClick(View v) { add(); } });
        input.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            public boolean onEditorAction(TextView v, int actionId, android.view.KeyEvent e) {
                if (actionId == EditorInfo.IME_ACTION_DONE) { add(); return true; }
                return false;
            }
        });
        warn.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { openNotificationSettings(); } });

        // Crée le canal : sur Android 13+ le système demande alors l'autorisation d'afficher des notifications.
        Notifier.ensureChannel(this);
        if (Build.VERSION.SDK_INT >= 33) {
            try { requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, 1); } catch (Exception ignored) {}
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        current = new WeakReference<>(this);
        Notifier.showAll(this); // s'assure que toutes les notes sont bien dans la barre
        render();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (current.get() == this) current = new WeakReference<>(null);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        Notifier.showAll(this);
        render();
    }

    private void add() {
        String t = input.getText().toString().trim();
        if (t.isEmpty()) return;
        Note n = NoteStore.add(this, t);
        Notifier.show(this, n);
        input.setText("");
        render();
    }

    private void done(Note n) {
        NoteStore.remove(this, n.id);
        Notifier.cancel(this, n.id);
        render();
        Toast.makeText(this, "Validé ✓", Toast.LENGTH_SHORT).show();
    }

    private void edit(final Note n) {
        final EditText e = new EditText(this);
        e.setText(n.text);
        e.setSelection(e.getText().length());
        int pad = (int) (20 * getResources().getDisplayMetrics().density);
        LinearLayout box = new LinearLayout(this);
        box.setPadding(pad, pad / 2, pad, 0);
        box.addView(e, new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        new AlertDialog.Builder(this)
                .setTitle("Modifier")
                .setView(box)
                .setPositiveButton("Enregistrer", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) {
                        String t = e.getText().toString().trim();
                        if (t.isEmpty()) return;
                        NoteStore.update(MainActivity.this, n.id, t);
                        Note u = NoteStore.get(MainActivity.this, n.id);
                        if (u != null) Notifier.show(MainActivity.this, u);
                        render();
                    }
                })
                .setNeutralButton("Valider ✓", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface d, int w) { done(n); }
                })
                .setNegativeButton("Annuler", null)
                .show();
    }

    private void render() {
        List<Note> notes = NoteStore.all(this);
        list.removeAllViews();
        LayoutInflater inf = getLayoutInflater();
        java.text.DateFormat df = DateFormat.getMediumDateFormat(this);
        java.text.DateFormat tf = DateFormat.getTimeFormat(this);
        for (final Note n : notes) {
            View row = inf.inflate(R.layout.item_note, list, false);
            ((TextView) row.findViewById(R.id.text)).setText(n.text);
            Date d = new Date(n.created);
            ((TextView) row.findViewById(R.id.date)).setText(df.format(d) + " · " + tf.format(d));
            row.findViewById(R.id.done).setOnClickListener(new View.OnClickListener() { public void onClick(View v) { done(n); } });
            row.findViewById(R.id.body).setOnClickListener(new View.OnClickListener() { public void onClick(View v) { edit(n); } });
            list.addView(row);
        }
        if (notes.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText("Rien à faire pour l'instant.\nÉcrivez une note ci-dessus : elle restera dans votre barre de notifications jusqu'à ce que vous la validiez ici.");
            empty.setTextColor(getColor(R.color.muted));
            empty.setTextSize(15);
            empty.setPadding(8, 40, 8, 0);
            list.addView(empty);
        }
        int k = notes.size();
        count.setText(k == 0 ? "Aucune note" : k == 1 ? "1 note dans la barre de notifications" : k + " notes dans la barre de notifications");
        warn.setVisibility(Notifier.enabled(this) ? View.GONE : View.VISIBLE);
    }

    private void openNotificationSettings() {
        Intent i;
        if (Build.VERSION.SDK_INT >= 26) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + getPackageName()));
        }
        try { startActivity(i); } catch (Exception ignored) {}
    }
}
