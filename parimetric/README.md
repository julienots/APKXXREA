# Parimetric — analyse de paris sportifs (Android)

Application autonome (APK ~35 Ko, Android 7.0+) : interface `assets/www/index.html` dans une WebView,
requêtes HTTP faites en natif (`MainActivity.Bridge`).

## Fonctions
- **Tous les sports actifs** de The Odds API (football, tennis, basket, hockey, rugby, handball, MMA...), découverts via `/v4/sports`
  (gratuit) ; chargement auto limité aux compétitions principales, bouton « Charger toutes les compétitions » avec coût en crédits ;
  cache 20 min. Sans clé : mode démonstration (cotes simulées, signalé), avec tennis et badminton.
- **Ajout manuel de matchs** (badminton ou tout sport absent de la source) avec les cotes de 1 à 3 bookmakers.
- **Le meilleur du jour** (cadre doré) : meilleur pari simple et meilleur combiné, avec l'explication du choix.
- **Guide d'utilisation** au premier lancement, lexique, boutons « ? » et résumés « en clair ».
- **Probabilités justes** : marge retirée par la méthode puissance, consensus pondéré (bookmakers « sharp » / bourses x3),
  meilleure cote du marché, dispersion entre bookmakers, indice de fiabilité, value (= proba x meilleure cote - 1).
- **Analyse d'avant-match** : tennis/badminton = classement, % de victoires, forme ; football = modèle de Poisson (attaque/défense + forme sur 5 matchs) mélangé au marché,
  1N2, plus/moins 1.5/2.5/3.5, les deux équipes marquent, scores exacts.
- **Générateur de combinés** : 2 à 6 sélections, cote cible, stratégies Sécurité / Équilibré / Valeur.
- **Coupon** avec mise de Kelly fractionnée, **suivi** des paris (bénéfice, ROI, réussite réelle vs attendue).
- **Outils** : surebet, Kelly, convertisseur de cotes, paris système, marge du bookmaker.

## Build
```bash
npm run setup:tools        # ou au minimum tools/android/{android-all-29.jar,dx.jar}
node parimetric/build.mjs  # -> dist/parimetric.apk
```
Le manifest binaire et `resources.arsc` sont écrits par le script (pas besoin d'aapt2) ; signature v1 avec
`parimetric/release.p12` (créée au premier build, non versionnée — à conserver pour publier des mises à jour).
