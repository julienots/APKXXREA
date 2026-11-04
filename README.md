# APPXRAY

Plateforme d'analyse d'APK Android, de reconstruction d'interfaces et de génération / compilation d'un projet Android **indépendant**.

```
IMPORTER APK → ANALYSER → EXPLORER → COMPRENDRE → RECONSTRUIRE → MODIFIER → COMPILER → EXPORTER APK
```

> À utiliser uniquement sur des applications qui vous appartiennent ou que vous êtes autorisé à analyser et reproduire.
> APPXRAY ne promet pas une reconstruction parfaite : tout ce qui n'est pas récupérable est signalé comme tel.

## Démarrage rapide

```bash
npm install
npm run setup:tools        # JADX 1.5.6, Apktool 2.11.1 (+ aapt2 et ressources framework), stubs Android + dx → ./tools
npm run build              # PWA (web/dist) + serveur (server/dist)
npm start                  # http://127.0.0.1:8787
```

Développement : `npm run dev` (API sur :8787 + Vite sur :5173 avec proxy `/api`).

Prérequis : Node.js ≥ 20, JDK 17+ (`java`, `javac`, `keytool`, `jarsigner`), Maven (pour résoudre JADX), `zip`, `unzip`.
Optionnel : Android SDK (`ANDROID_HOME`) + Gradle pour le mode de compilation complet. L'image `Dockerfile` contient tout.

Variables : `PORT`, `HOST`, `APPXRAY_DATA` (stockage), `APPXRAY_TOOLS`, `APPXRAY_TOKEN` (jeton exigé sur l'API — obligatoire si le serveur est exposé), `APPXRAY_MAX_UPLOAD_MB`, `APPXRAY_TOOL_TIMEOUT_S`, `APPXRAY_TOOL_MEM_MB`, `APPXRAY_JOBS`.

## Application Android (APK) — autonome, sans serveur

`npm run build:android` → `dist/appxray.apk` (≈ 450 Ko, Android 7.0+).

L'APK embarque toute l'application (interface + moteurs d'analyse) et la sert localement sur `https://appxray.local` :
**aucun serveur, les fichiers ne quittent pas le téléphone**. Sur le téléphone :

| Fonction | Sur le téléphone |
|---|---|
| Import (stockage du téléphone), contrôles ZIP, empreintes | ✔ |
| Manifest, ressources, fichiers, signatures, technologies, fonctionnalités | ✔ (mêmes moteurs que le serveur) |
| Code Explorer : packages, recherche, relations, **désassemblage natif** | ✔ |
| Java décompilé (JADX), smali (Apktool) | ✖ — nécessite un serveur APPXRAY (JDK) |
| UI Reconstructor : aperçu, édition, écrans assistés, actions | ✔ |
| Project Rebuilder : projet Gradle complet, export ZIP | ✔ |
| **Compilation d'un APK installable** | ✔ (voir ci-dessous) |
| Compilation de code Java/XML modifié à la main | ✖ — export ZIP + Android Studio, ou serveur |

**Compilation sur le téléphone.** `javac`/`aapt2` ne peuvent pas tourner sur Android : APPXRAY embarque un moteur Android
précompilé (`android-runtime/` → `runtime/classes.dex`, 28 Ko) qui affiche les écrans reconstruits à partir d'une description JSON
(vues natives, couleurs, images, règles Relative/Constraint, actions) et fournit les fonctionnalités générées (connexion locale, web,
réglages, liste). APPXRAY écrit lui-même le `AndroidManifest.xml` binaire et le `resources.arsc` (icône), assemble l'APK et le signe
(JAR v1, SHA-256/RSA-2048) avec une clé générée et conservée sur le téléphone (WebCrypto). Les APK produits : minSdk 24, targetSdk 29,
enregistrés dans *Téléchargements/APPXRAY*, installation proposée directement.

Un **serveur APPXRAY reste optionnel** (Paramètres → « Utiliser un serveur ») pour JADX, Apktool et Gradle.

Fichiers générés et versionnés : `web/public/framework.json` (ressources android:* extraites d'Apktool, `npm run gen:framework`) et
`web/public/runtime/classes.dex` (`npm run build:runtime`). Clé de signature de l'APK APPXRAY : `android/appxray-release.p12`
(non versionnée — conservez-la pour publier des mises à jour).

## Architecture

```
web/  (React 19 + TypeScript + Tailwind 4, PWA)            server/  (Node.js + Express, TypeScript)
 ├─ Dashboard / Import / Mes analyses                        ├─ api.ts            routes REST /api/*
 ├─ APK Analyzer   (onglets manifest, fichiers, res…)        ├─ jobs.ts           file d'attente (outils lourds séquentiels)
 ├─ Code Explorer  (packages, Java, Smali, relations)        ├─ store.ts          stockage fichiers (1 dossier / entité)
 ├─ UI Reconstructor (aperçu mobile + éditeur)               └─ engines/
 ├─ Project Rebuilder (assistant + éditeur de fichiers)          ├─ zip.ts        lecture ZIP sûre (bombes, traversée, tailles)
 ├─ APK Builder (logs temps réel, erreurs, APK)                  ├─ res.ts        décodeurs natifs resources.arsc + XML binaire
 └─ Paramètres (outils, isolation, suppression)                  ├─ dex.ts        parseur DEX + décodeur bytecode Dalvik
                                                                 ├─ signature.ts  schémas v1/v2/v3, certificats
                                                                 ├─ detect.ts     technologies, obfuscation, fonctionnalités, secrets
                                                                 ├─ analyzer.ts   pipeline d'import/analyse + cache
                                                                 ├─ decompile.ts  adaptateurs JADX / Apktool
                                                                 ├─ ui.ts         reconstruction d'UI, graphe d'écrans, vector→SVG
                                                                 ├─ rebuild.ts    génération du projet Gradle indépendant
                                                                 ├─ build.ts      compilation (Gradle ou chaîne « lite »)
                                                                 └─ tools.ts      détection d'outils + exécution isolée
```

Chaque moteur est un module indépendant (entrées/sorties typées) et peut être remplacé ou déporté vers un agent distant.
Les parseurs natifs (ZIP, ARSC, AXML, DEX, signatures) fonctionnent **sans aucun outil externe** ; JADX/Apktool/Gradle enrichissent les résultats lorsqu'ils sont installés.

Données : `data/analyses/<id>/` (APK d'origine, `analysis.json`, manifest décodé, `jadx/`, `apktool/`, `ui/` éditions),
`data/projects/<id>/src/` (projet Gradle généré), `data/builds/<id>/` (APK + log), `data/keys/` (keystore de debug APPXRAY, généré localement).

## Modules

| Module | Fonctionnement réel |
|---|---|
| **Import** | Glisser-déposer / sélecteur, consentement, upload avec progression. Contrôle ZIP (nombre d'entrées, tailles, ratio de compression, noms dangereux, doublons, faux chiffrement), SHA-256/SHA-1/MD5, package, version, SDK, ABI (`lib/<abi>/`), détection des splits (`split=`, `isSplitRequired`, `requiredSplitTypes`) et des bundles `.apks/.xapk/.apkm` (APK de base analysé, splits listés). Historique persistant. |
| **Analyzer** | Manifest décodé (enums/flags résolus via les ressources framework), arborescence interactive de tous les fichiers avec aperçu (images, sons, vidéos, polices, XML binaire décodé, texte, hexdump + type), table de ressources (couleurs en nuancier, chaînes, dimens…), composants + intent-filters + exportation, permissions sensibles, meta-data (secrets masqués), bibliothèques/frameworks avec preuves, obfuscation, bibliothèques natives, signatures v1/v2/v3 et certificats. |
| **Feature Reconstructor** | Documentation par fonctionnalité : description, classes, dépendances, permissions, ressources, confiance, éléments manquants, et reconstruction assistée disponible (connexion, web, réglages, liste, réseau). |
| **Code Explorer** | Arbre de packages paresseux, recherche classes / méthodes / chaînes (chaînes localisées dans le bytecode), vue Java (JADX), Smali (Apktool), désassemblage natif APPXRAY, structure (méthodes/champs), relations (classes utilisées, API externes, appels, « utilisée par »). Code original clairement étiqueté « original décompilé ». |
| **UI Reconstructor** | Layouts décodés en arbre normalisé (dimensions, marges, couleurs, textes, drawables, `<include>`, `<shape>`, `<selector>`, `<vector>`→SVG). Liaison écran↔layout par analyse du bytecode (constantes `R.layout` inlinées **et** champs `R$layout` non finaux d'AGP 8). Graphe de navigation (Intent explicites / const-class). Aperçu mobile (3 gabarits), éditeur (structure, palette, propriétés, actions au clic, annuler, dupliquer, déplacer). Interfaces dynamiques (Compose, Flutter, RN, moteurs de jeu, WebView) détectées → **reconstruction assistée** par modèles au lieu d'une structure inventée. |
| **Project Rebuilder** | Projet Android Studio (Gradle Kotlin DSL, AGP 8.7, Java, ressources XML, manifest reconstruit sans `package=`) : nom, package, version, minSdk, couleurs du thème, icône (originale ou PNG importé), textes (`strings.xml` éditable), écrans choisis, fonctionnalités générées, assets/sons/polices optionnels, référence décompilée optionnelle (hors build). Éditeur de fichiers intégré (texte + remplacement binaire), export ZIP, rapport `APPXRAY_REPORT.md` (substitutions, éléments ignorés, non récupérable, exclusions). |
| **APK Builder** | Vérifications préalables (manifest, activité de lancement, classes déclarées, noms de ressources…), compilation réelle côté serveur, logs en direct, erreurs parsées `fichier:ligne` (aapt2/javac/Gradle) avec lien vers l'éditeur, auto-vérification de l'APK produit par les parseurs APPXRAY, téléchargement. |

### Chaînes de compilation

* **Gradle** (si `ANDROID_HOME` + `gradle`) : `gradle assembleDebug` avec AGP — fidélité maximale (Kotlin possible, D8, signature v2). Réseau autorisé uniquement pour les dépôts Maven.
* **Lite** (hors ligne, toujours disponible après `setup:tools`) : `aapt2 compile/link` (aapt2 et ressources framework issus d'Apktool) → `javac --release 8` contre les stubs `android-4.1.1.4` → `dx` → `zip` → `jarsigner` (keystore APPXRAY). Java uniquement, API framework (pas d'AndroidX), `targetSdk 29`, signature v1 : APK installable pour test (`adb install`), pas destiné à la publication.

## Sécurité

* Un APK importé n'est **jamais exécuté** ni installé : toute l'analyse est statique.
* JADX, Apktool, aapt2, javac, dx tournent via `unshare -n` (aucun réseau), `prlimit` (CPU, taille de fichier, descripteurs, pas de core dump), tas JVM borné, délai max avec kill du groupe de processus, environnement nettoyé, `HOME/TMPDIR` dans le dossier de travail.
* Lecture ZIP défensive : bombes de décompression, traversée de chemins, noms absolus/NUL, tailles réelles vérifiées pendant la décompression, extraction en `O_EXCL` dans un dossier confiné.
* Secrets (clés Google/AWS/Stripe, JWT, clés privées, mots de passe en clair) détectés et **masqués** partout ; jamais copiés dans un projet. Les certificats de signature d'origine ne sont jamais réutilisés.
* Les fichiers servis depuis un APK le sont avec `Content-Security-Policy: sandbox` et `nosniff` (SVG/HTML non exécutables).
* Suppression complète par analyse / projet / compilation, ou totale (Paramètres).
* Accès : `APPXRAY_TOKEN` protège toute l'API. **Limite** : APPXRAY est mono-locataire (une instance = un espace de travail). Pour plusieurs utilisateurs, déployer une instance (ou un volume de données) par utilisateur.

## Tests

```bash
npm run setup:tools
bash scripts/fetch-test-apk.sh   # APK réel open-source (Appium Settings, Apache-2.0) pour les tests d'intégration
npm test
```

`server/test/` couvre : rejet des bombes ZIP et de la traversée, décodage manifest/ressources/layout/DEX/signature (APK minimal produit par la chaîne lite), masquage des secrets, obfuscation, pipeline complet sur un APK réel (10 DEX, 5 908 classes), et le cycle **analyse → édition UI → génération → compilation réelle → ré-analyse de l'APK produit**.

## Bilan des phases

| Phase | État | Vérifié par |
|---|---|---|
| 1. Interface & architecture | PWA (manifest, service worker, icônes), 9 sections, sombre bleu/cyan, responsive (aucun débordement horizontal à 390 px et 1440 px) | Captures Playwright desktop + iPhone 13, aucune erreur console |
| 2. Import & extraction | Opérationnel (APK + bundles) | Tests zip, import via navigateur |
| 3. Métadonnées, ressources, manifest | Opérationnel, parseurs natifs | Tests + comparaison avec la sortie Apktool |
| 4. Décompilation & code | JADX + Apktool isolés, explorateur, recherche, relations | APK réel : 3 556 fichiers Java, 5 908 smali, réseau coupé |
| 5. Reconstruction UI | Opérationnel (aperçu approximatif) | Liaison `Settings → @layout/main` détectée, édition sauvegardée |
| 6. Projet indépendant | Opérationnel | Projet généré, ouvert/édité via l'API |
| 7. Compilation APK | Lite : opérationnel. Gradle : implémenté, **non testé ici** (SDK Android non téléchargeable dans cet environnement) | APK compilé, `jarsigner -verify` OK, décodé par Apktool et JADX, navigation générée vérifiée |
| 8. Tests & corrections | 11 tests automatisés + parcours E2E navigateur | `npm test`, script Playwright |

### Limites connues

* Aperçu UI : LinearLayout fidèle ; Relative/ConstraintLayout affichés en flux vertical (les règles sont converties en `RelativeLayout` dans le projet). Les styles/thèmes d'origine et attributs `?attr/` ne sont pas appliqués.
* Les vues personnalisées, AndroidX/Material et fragments sont remplacés par des widgets framework (listés dans le rapport). La logique métier n'est pas transpilée : le code d'origine reste disponible en référence décompilée.
* Les écrans Compose / Flutter / React Native / moteurs de jeu ne sont pas récupérables en XML : reconstruction assistée uniquement.
* La décompilation JADX peut être partielle (code obfusqué, packers) ; les APK chiffrés par un packer ne livrent que le stub.
* Les bundles : seul l'APK de base est analysé (les splits ne sont pas fusionnés).
* Mode lite : Java 8 sans lambdas (non gérées par `dx` ; le code généré utilise des classes anonymes), pas d'AndroidX, signature v1.
* Pas de vérification d'installation sur appareil/émulateur dans cet environnement.
