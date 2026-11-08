# MusicMetric — by SuperEssence Studio

Studio musical complet pour Android : effets, voix, remix, rallonge, ajout d'instruments, générateur de compositions et séquenceur.
Tout est calculé **sur le téléphone, hors-ligne** (aucun serveur, aucune IA en ligne) : moteur DSP et synthétiseur écrits en Java.

**APK : [`release/MusicMetric.apk`](release/MusicMetric.apk)** — Android 7.0+ (minSdk 24, targetSdk 29), ~320 Ko.

## Fonctions

| Onglet | Contenu |
|---|---|
| **Studio** | Import (MP3, M4A, WAV, FLAC, OGG, AAC…), enregistrement micro, forme d'onde (touche = lecture, glisser = sélection), spectre animé, boucle de sélection, BPM / tonalité / niveau, garder / supprimer / dupliquer la sélection, fondus, normaliser, inverser, volume, mono, couper les silences, annuler / rétablir, export **M4A 256 kbps** ou **WAV** dans `Musique/MusicMetric`, partage, « Chanter dessus » |
| **Effets** | 16 transformations en un geste : Slowed + Reverb, Speed Up, Nightcore, **Motivation**, 8D Audio, Lo-fi, Bass Boost, Vaporwave, Phonk Drift, Salle de concert, Stade, Dark, Sous l'eau, Téléphone, Radio vintage, Écho — et un rack manuel : vitesse, tempo (sans changer la hauteur), hauteur ±12, réverbe + taille de salle, écho + délai, largeur stéréo, rotation 8D, EQ 3 bandes, saturation, lo-fi, compression |
| **Voix** | **Voix parfaite** (isolation → débruitage → correction de justesse dans la tonalité détectée → chaîne studio → remix sur l'instru), isoler la voix (a cappella), retirer la voix (instrumental / karaoké), auto-tune (tonalité, mode, vitesse), débruitage, son studio (EQ, de-esser, compresseur, présence, air, plate), harmonies, doublage, robot, hauteur de voix, enregistrement seul ou sur la musique |
| **Remix** | **Rallonger** (+30 s / +1 min / +2 min / ×2 / ×3) en bouclant la phrase la plus raccord, coupée sur les temps ; **recomposer** (remix auto, réarranger, glitch, beat swap, chopped & screwed) ; **ajouter** batterie (10 styles), 808 / basse, nappe, hi-hats, claps, riser + impact, vinyle, pluie — calés sur le tempo et la tonalité ; **mixer** avec un 2e morceau synchronisé ; changer le BPM ; transposer |
| **Créer** | **Générateur** : 10 styles (Motivation, Trap, Drill, Phonk, Lo-fi, House, Émotion, Cinématique, R&B, Afro), tonalité, tempo, durée → composition arrangée (intro, couplet, montée, refrain, pont, outro), unique à chaque génération. **Séquenceur** 16 pas : batterie 6 pistes, mélodie dans la gamme, 4 accords, 12 instruments, basse / 808, swing, lecture en boucle en direct, envoi vers le Studio |

## Moteur

`app/src/main/java/com/superessence/musicmetric/audio/` — décodage MediaCodec, rééchantillonnage, WSOLA (tempo), pitch-shift, Freeverb,
biquads / SVF, compresseur, limiteur, 8D (ITD + ombre de la tête), STFT (séparation centre / côtés, débruitage spectral), YIN (hauteur),
pitch-shifter à ratio variable (auto-tune), détection BPM (flux spectral + autocorrélation) et tonalité (chroma + Krumhansl),
synthé (drums, 808, piano, nappe, cordes, cuivres, pluck Karplus-Strong, cloche FM, piano électrique…), compositeur algorithmique, encodeur AAC.

## Compiler

```bash
bash musicmetric/build.sh     # → musicmetric/release/MusicMetric.apk
```

Aucun SDK Android requis : le script récupère aapt2 (Apktool), l'API Android (Robolectric android-all) et dx sur Maven Central, puis
compile, dexe et signe (JDK 17+). La clé de signature `musicmetric-release.p12` est générée au premier build et n'est pas versionnée :
conservez-la pour publier des mises à jour installables par-dessus.

Le logo est dans `branding/` (`logo.svg`, rendus PNG).
