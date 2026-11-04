# Cahier — notes et choses à faire dans la barre de notifications

Appli Android (minSdk 24 / Android 7+, ~25 Ko, aucune dépendance, aucune connexion internet).

- Écrivez une note / un truc à faire → **Ajouter** : elle apparaît dans la barre de notifications et y reste.
- Touchez le **rond** à gauche d'une note (ou « ✓ Fait » dans la notification) pour la **valider** : elle est supprimée
  de l'appli et de la barre.
- Touchez le texte d'une note pour la modifier.
- Les notifications sont réaffichées si on les balaie (Android 14+) et après un redémarrage du téléphone.

APK prêt à installer : `cahier/Cahier.apk`. Recompiler : `bash scripts/build-cahier.sh` → `dist/cahier.apk`
(outils dans `./tools`, voir `scripts/install-tools.sh` ; la clé de signature `cahier/cahier-release.p12` est générée au
premier build et n'est pas versionnée).
