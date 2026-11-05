# Avatar Studio - SuperEssence Studio

Application Android de création d'avatar animé : l'utilisateur crée son personnage 3D, qui suit son visage et sa voix en direct, puis enregistre des vidéos (Shorts verticaux ou YouTube horizontal) ou passe en mode live sur fond uni, sans se montrer à l'écran.

**APK prêt à installer : `release/AvatarStudio.apk`** (Android 8.0 et plus, environ 26 Mo).

Tout fonctionne sur le téléphone : aucune API d'IA payante, aucun serveur, aucune limite d'utilisation. Les images de la caméra et le son du micro ne quittent jamais l'appareil.

## Technologies

| Domaine | Technologie |
|---|---|
| Rendu 3D | Three.js r187 (WebGL 2), ombrage toon, contours encrés (inverted hull), éclairage par image (PMREM / RoomEnvironment), ombres |
| Avatars VRM | @pixiv/three-vrm 3.5 : import de modèles VRM 0.x / 1.0 (VRoid...), os humanoïdes, expressions, regard, spring bones |
| Suivi du visage | MediaPipe Face Landmarker (478 points, 52 blendshapes, matrice de pose 3D), WebAssembly + délégué GPU, filtre One Euro |
| Suivi des mains | MediaPipe Hand Landmarker (bêta, activable dans les réglages) |
| Synchro labiale | Web Audio API : enveloppe RMS avec porte de bruit adaptative, détection de voisement (platitude spectrale), estimation des formants F1/F2 pour reconnaître A, E, I, O, U |
| Physique | Chaînes de ressorts Verlet (cheveux, queues, oreilles, cape, écharpe) avec collisions tête / buste |
| Vidéo | MediaRecorder sur canvas composité : MP4 H.264/AAC si disponible, sinon WebM VP9/Opus ; 720p, 1080p, 4K |
| Licences Pro | Codes signés ECDSA P-256 / SHA-256, vérifiés hors ligne par WebCrypto |
| Coque Android | Java natif : WebView sur origine https privée (contexte sécurisé caméra / micro), permissions, enregistrement dans la galerie (MediaStore), partage, vibrations, plein écran |

## Fonctionnalités

- **Création de personnage** : 7 bases (humain, elfe, néko, kitsune, androïde, démon, spectre), 14 coiffures, 7 styles d'yeux, sourcils, bouches, 12 tenues, 19 accessoires, couleurs libres (peau, cheveux, mèches, iris, tenue, lumières), proportions, générateur aléatoire, rotation à 360 degrés. Miniatures 3D des objets rendues en direct.
- **Suivi du visage en direct** : rotation de la tête, position, yeux (clignements indépendants), regard, sourcils, bouche (ouverture, sourire, arrondi), effet miroir, lissage, amplitude, calibration de la position neutre.
- **Synchronisation de la bouche sur la voix** : volume, rythme et voyelles ; modes caméra, voix ou mixte.
- **Expressions** : rire, surprise, pleurs, colère, amoureux, timide, émerveillé, déprime, somnolent, étourdi, malicieux. Chacune combine visage, langage corporel et effets 3D (cœurs, larmes, étincelles, nuage de pluie...). Déclenchement par bouton ou par geste (grand sourire, visage surpris, froncement, yeux fermés).
- **Animations** : gestes (coucou, applaudir, révérence, victoire, cœur, réflexion...) et danses en boucle.
- **Décors** : 13 scènes 3D animées (studio, chambre, ville néon, cosmos, forêt, plage, dojo, manoir hanté, sommet enneigé, salle du trône...), fond vert / bleu / magenta, image personnelle. Cadrages gros plan, buste, plein pied.
- **Enregistrement** : formats 9:16, 16:9, 1:1, compte à rebours, son du micro, aperçu, enregistrement dans *Films/SuperEssence*, partage, galerie interne.
- **Mode live (Pro)** : avatar plein écran sur fond uni ou transparent pour l'incrustation dans un logiciel de stream, interface qui se masque toute seule.
- **Boutique, collections et nouveautés** : monnaie Éclats, coffre du jour, missions quotidiennes, raretés, objets limités (Halloween Spectral), saisons, accès anticipé Pro (Hiver Givré), récompenses de collection et titres, page Nouveautés.
- **Gratuit / Pro** : voir le tableau comparatif dans l'onglet Profil (1 avatar et 720p avec filigrane en gratuit ; 10 avatars, HD/4K sans filigrane, live, toutes les expressions, 4 objets offerts par mois en Pro). Essai gratuit de 7 jours.

## Abonnement Pro géré par le développeur

Le Pro s'active avec un code signé par SuperEssence Studio :

```bash
node scripts/license.mjs keygen                 # une seule fois : crée keys/license-private.jwk et la clé publique de l'app
node scripts/license.mjs sign --days 30         # code Pro valable 30 jours
node scripts/license.mjs sign --until 2027-12-31 --id client42
```

La clé privée (`keys/`) n'est jamais versionnée : sans elle, impossible de créer de nouveaux codes. Le prix affiché se règle dans `web/src/core/catalog.ts` (`PRO_PRICE_LABEL`).

## Construire l'APK

Prérequis : Node.js 20+, JDK 17+, `zip`. Depuis la racine du dépôt :

```bash
bash scripts/install-tools.sh          # aapt2, android-all API 29, dx (dans ./tools)
cd avatar-studio/web && npm install && cd ..
bash scripts/build-apk.sh              # -> dist/AvatarStudio.apk
```

Le script crée `android/superessence-release.p12` à la première compilation : conservez ce fichier (et son `.pass`) pour signer les mises à jour, sinon Android refusera de les installer par-dessus.

Développement de l'interface : `cd web && npm run dev` (navigateur avec caméra).

## Ajouter du contenu

Les objets, collections, missions et nouveautés sont déclarés dans `web/src/core/catalog.ts`. Un nouvel objet apparaît automatiquement dans la boutique, l'éditeur, les collections et reçoit le badge Nouveau quand `addedIn` vaut la version de l'app. Les styles de rendu correspondants sont dans `web/src/avatar/ToonAvatar.ts`, `web/src/avatar/Expressions.ts`, `web/src/avatar/Motions.ts` et `web/src/scene/Backgrounds.ts`.

## Structure

```
avatar-studio/
  android/            coque native Java (MainActivity), manifeste, icônes
  web/src/
    avatar/           avatar procédural, visage dessiné, VRM, ressorts, expressions, animations
    tracking/         MediaPipe visage + mains
    audio/            synchro labiale
    scene/            moteur 3D, décors, particules
    record/           enregistrement vidéo, stockage IndexedDB
    screens/ ui/      Studio, Créer, Boutique, Collections, Profil
    core/             catalogue, état, licences, pont natif
  scripts/            build-apk.sh, license.mjs, icône
  release/            APK signé
```

Licences des composants : Three.js (MIT), three-vrm (MIT), MediaPipe et modèles (Apache 2.0), police Fredoka (SIL OFL).
