# Poker Coach

Application Android d'**entraînement au poker** (Texas Hold'em), 100 % hors ligne, en français.

> Outil d'étude à utiliser **entre les sessions**. Une aide en temps réel pendant une partie en argent réel est interdite
> par les sites de poker (Winamax, Betclic…) et entraîne la fermeture du compte.

## Fonctions

| Onglet | Ce qu'il fait |
|---|---|
| **Analyse** | Tu choisis ta main, le board (flop/turn/river), le nombre d'adversaires et leur profil (aléatoire, top 50/30/15/7 %), le pot et la mise à suivre. Simulation Monte-Carlo (8 000 à 25 000 donnes) : équité, % gagne/égalité/perd, main actuelle, outs (règle du 2 et du 4), cote du pot, décision conseillée (se coucher / suivre / relancer / miser / check) avec explication, répartition de ta main finale. |
| **Jouer** | Partie de No-Limit Hold'em (jetons fictifs) contre 1 à 5 bots aux styles différents (serré, régulier, agressif, suiveur). **Coach en direct** activable : à chaque décision, il affiche le coup conseillé (avec la taille de mise), l'équité, la cote du pot et l'explication, puis note si tu as suivi le conseil. Pots annexes, tapis, recaves, historique. |
| **Préflop** | Tableaux 13×13 : cash game 6-max 100 BB (premier à relancer, face à une relance → 3-bet / suivre / se coucher) et tournoi tapis-ou-couché (5, 10, 15, 20 BB) par position. |
| **Quiz** | Situations au hasard (préflop cash, préflop tournoi, après le flop avec cote du pot), correction expliquée, score, série et record sauvegardés. |
| **Aide** | Mode d'emploi, règles de base, lexique, jeu responsable. |

## Installer

`dist/PokerCoach.apk` (Android 5.0+). Sur le téléphone : ouvrir le fichier, autoriser « installer des applications
inconnues » pour le navigateur / gestionnaire de fichiers, puis Installer.

## Compiler

```bash
npm run setup:tools        # à la racine du dépôt : aapt2, android-all (API 29), dx dans ./tools
bash poker-coach/build.sh  # → poker-coach/dist/PokerCoach.apk
```

La clé de signature `poker-coach/poker-coach.p12` est créée au premier build (non versionnée) : gardez-la, Android refuse
une mise à jour signée avec une autre clé.

Structure :

```
app/src/main/assets/   interface (HTML/CSS/JS)
  poker.js             évaluateur de mains 5-7 cartes, ranges, équité Monte-Carlo, outs
  order.js             classement des 169 mains (généré : node tools/gen-order.js)
  charts.js            tableaux préflop
  app.js               écrans Analyse / Préflop / Quiz
  game.js              partie contre les bots + coach en direct
app/src/main/java/     MainActivity (WebView)
tools/                 gen-order.js, gen-icon.py
```

Les tableaux sont des bases simplifiées, pas des solutions de solveur.
