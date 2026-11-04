#!/usr/bin/env bash
# Compile l'appli « Cahier » (cahier/) en APK signé : dist/cahier.apk
# Chaîne hors-ligne : aapt2 → javac (android-all) → dx → zip → zipalign-free → jarsigner.
# Outils attendus dans ./tools (voir scripts/install-tools.sh) : tools/aapt2/{aapt2,android-framework.jar},
# tools/android/dx.jar et tools/android/android-all.jar (ou android-all-29.jar).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$ROOT/tools"; SRC="$ROOT/cahier/src/main"; OUT="$ROOT/dist"; W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
CP="$T/android/android-all.jar"; [ -f "$CP" ] || CP="$T/android/android-all-29.jar"
MINSDK=24; TSDK=29; VCODE=1; VNAME=1.0
KS="${CAHIER_KEYSTORE:-$ROOT/cahier/cahier-release.p12}"; PASS_FILE="$KS.pass"
if [ ! -f "$KS" ]; then
  echo "• Génération de la clé de signature ($KS)"
  head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$PASS_FILE"; chmod 600 "$PASS_FILE"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$(cat "$PASS_FILE")" -keypass "$(cat "$PASS_FILE")" \
    -alias cahier -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Cahier" 2>&1 | grep -v JAVA_TOOL || true
fi
PASS="$(cat "$PASS_FILE")"
echo "▶ aapt2"
"$T/aapt2/aapt2" compile --dir "$SRC/res" -o "$W/res.zip"
"$T/aapt2/aapt2" link -o "$W/base.apk" -I "$T/aapt2/android-framework.jar" --manifest "$SRC/AndroidManifest.xml" --java "$W/gen" \
  --min-sdk-version "$MINSDK" --target-sdk-version "$TSDK" --version-code "$VCODE" --version-name "$VNAME" "$W/res.zip"
echo "▶ javac"; mkdir -p "$W/classes"
javac --release 8 -encoding UTF-8 -Xlint:-options -cp "$CP" -d "$W/classes" $(find "$SRC/java" "$W/gen" -name '*.java') 2>&1 | grep -v JAVA_TOOL || true
[ -f "$W/classes/fr/cahier/app/MainActivity.class" ] || { echo "✖ javac a échoué"; exit 1; }
echo "▶ dx"; java -cp "$T/android/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$W/classes.dex" "$W/classes" 2>&1 | grep -v JAVA_TOOL || true
(cd "$W" && zip -q -j base.apk classes.dex)
mkdir -p "$OUT"
echo "▶ jarsigner"
jarsigner -keystore "$KS" -storepass "$PASS" -sigalg SHA256withRSA -digestalg SHA-256 -signedjar "$OUT/cahier.apk" "$W/base.apk" cahier 2>&1 | grep -E "signed|error" || true
jarsigner -verify "$OUT/cahier.apk" 2>&1 | grep -v JAVA_TOOL | head -1
echo "✔ $OUT/cahier.apk ($(du -h "$OUT/cahier.apk" | cut -f1))"
