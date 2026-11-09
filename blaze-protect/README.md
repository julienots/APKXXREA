# Blaze Protect

Antivirus Android autonome (100 % hors ligne, aucune dépendance) écrit en Java pur, interface construite en code.

## Fonctions

- **Analyses** : rapide (applications + Téléchargements / Documents / Bluetooth), complète (toutes les applications, y compris système mises à jour, et tout le stockage), applications seules, stockage seul. Progression en direct, analyse poursuivie en arrière-plan.
- **Analyse d'un fichier** : sélecteur de fichiers, « Partager → Analyser avec Blaze Protect », ou ouverture d'un APK.
- **Détection** : base de signatures locale (SHA-256, MD5, noms de paquets — `app/src/main/assets/signatures.db`), fichier de test EICAR. Import de listes d'empreintes (texte / CSV) depuis les réglages.
- **Protection en temps réel** : service de premier plan qui analyse chaque application installée ou mise à jour et chaque fichier arrivant dans les dossiers surveillés ; alertes par notification.
- **Neutralisation** : désinstallation des applications, quarantaine (fichiers encodés dans l'espace privé, restaurables), suppression, liste de confiance.
- **Applications installées** : origine (boutique officielle ou installation manuelle), autorisations sensibles, empreinte.
- **Journal de sécurité**, **analyse programmée** (quotidienne / hebdomadaire via JobScheduler), redémarrage automatique du bouclier.

## Compilation

```bash
npm run setup:tools     # une fois : aapt2, android-all API 29, dx
npm run build:blaze     # → dist/blaze-protect.apk
```

Chaîne : aapt2 → javac (Java 8, contre android-all API 29) → dx → zip → jarsigner (schéma v1, suffisant pour targetSdk 29).
Le premier build crée `blaze-protect/blaze-release.p12` (+ `.pass`), ignorés par git : **conservez-les**, les mises à jour
doivent être signées avec la même clé. Un autre keystore peut être fourni via `BLAZE_RELEASE_KEYSTORE`.
Identifiant, version et SDK : `blaze.json`.

Le projet n'utilise ni AndroidX ni lambdas (dx ne les désucre pas) ; minSdk 24, targetSdk 29 (accès étendu au stockage partagé
via `requestLegacyExternalStorage`, ou « Accès à tous les fichiers » sur Android 11+).
