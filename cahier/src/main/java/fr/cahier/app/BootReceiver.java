package fr.cahier.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Réaffiche toutes les notes après un redémarrage ou une mise à jour de l'appli. */
public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        Notifier.showAll(c);
    }
}
