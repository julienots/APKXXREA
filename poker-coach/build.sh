#!/usr/bin/env bash
# Compile Poker Coach en APK signé sans Android SDK complet :
# aapt2 (ressources) → javac (contre android-all API 29) → dx (dex) → zip → jarsigner.
# Outils attendus dans ../tools (voir `npm run setup:tools` à la racine du dépôt) ou via POKER_TOOLS.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
T="${POKER_TOOLS:-$HERE/../tools}"
SRC="$HERE/app/src/main"; OUT="$HERE/dist"; W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
VCODE=2; VNAME=1.1.0; MINSDK=21; TSDK=29
CP="$T/android/android-all-29.jar"
for f in "$T/aapt2/aapt2" "$T/aapt2/android-framework.jar" "$CP" "$T/android/dx.jar"; do
  [ -f "$f" ] || { echo "✖ outil manquant : $f"; exit 1; }
done

KS="${POKER_KEYSTORE:-$HERE/poker-coach.p12}"; PASS_FILE="$KS.pass"
if [ ! -f "$KS" ]; then
  echo "• Création de la clé de signature ($KS) — conservez-la pour les mises à jour"
  head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$PASS_FILE"; chmod 600 "$PASS_FILE"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$(cat "$PASS_FILE")" -keypass "$(cat "$PASS_FILE")" \
    -alias pokercoach -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Poker Coach, O=Poker Coach" 2>&1 | grep -v JAVA_TOOL || true
fi
PASS="$(cat "$PASS_FILE")"

echo "▶ aapt2"
"$T/aapt2/aapt2" compile --dir "$SRC/res" -o "$W/res.zip"
"$T/aapt2/aapt2" link -o "$W/base.apk" -I "$T/aapt2/android-framework.jar" --manifest "$SRC/AndroidManifest.xml" --java "$W/gen" \
  --min-sdk-version "$MINSDK" --target-sdk-version "$TSDK" --version-code "$VCODE" --version-name "$VNAME" -A "$SRC/assets" "$W/res.zip"
echo "▶ javac"; mkdir -p "$W/classes"
javac --release 8 -encoding UTF-8 -nowarn -cp "$CP" -d "$W/classes" $(find "$SRC/java" "$W/gen" -name '*.java') 2>&1 | grep -v JAVA_TOOL || true
[ -f "$W/classes/fr/pokercoach/MainActivity.class" ] || { echo "✖ javac a échoué"; exit 1; }
echo "▶ dx"
java -cp "$T/android/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=21 --output="$W/classes.dex" "$W/classes" 2>&1 | grep -v JAVA_TOOL || true
(cd "$W" && zip -q -j base.apk classes.dex)
mkdir -p "$OUT"
echo "▶ jarsigner"
jarsigner -keystore "$KS" -storepass "$PASS" -sigalg SHA256withRSA -digestalg SHA-256 -signedjar "$OUT/PokerCoach.apk" "$W/base.apk" pokercoach 2>&1 | grep -E "signed|error" || true
jarsigner -verify "$OUT/PokerCoach.apk" 2>&1 | grep -v JAVA_TOOL | head -1
echo "✔ $OUT/PokerCoach.apk ($(du -h "$OUT/PokerCoach.apk" | cut -f1))"
