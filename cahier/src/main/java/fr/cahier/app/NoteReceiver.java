package fr.cahier.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public final class NoteReceiver extends BroadcastReceiver {
    static final String ACTION_DONE = "fr.cahier.app.DONE";
    static final String ACTION_REPOST = "fr.cahier.app.REPOST";
    static final String EXTRA_ID = "id";

    @Override
    public void onReceive(Context c, Intent i) {
        int id = i.getIntExtra(EXTRA_ID, -1);
        if (id < 0) return;
        if (ACTION_DONE.equals(i.getAction())) {
            NoteStore.remove(c, id);
            Notifier.cancel(c, id);
            MainActivity.refreshIfOpen();
        } else if (ACTION_REPOST.equals(i.getAction())) {
            Note n = NoteStore.get(c, id);
            if (n != null) Notifier.show(c, n);
        }
    }
}
