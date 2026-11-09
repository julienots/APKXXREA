#!/usr/bin/env bash
# Builds the Blaze Protect antivirus app (blaze-protect/) into dist/blaze-protect.apk with APPXRAY's offline toolchain:
# aapt2 → javac (against android-all API 29) → dx → zip → jarsigner. Run `npm run setup:tools` first.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$ROOT/tools"; P="$ROOT/blaze-protect"; SRC="$P/app/src/main"; OUT="$ROOT/dist"; W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
for f in "$T/aapt2/aapt2" "$T/aapt2/android-framework.jar" "$T/android/dx.jar"; do
  [ -f "$f" ] || { echo "✖ $f manquant — lancez d'abord : npm run setup:tools"; exit 1; }
done
# The app uses APIs newer than the 4.1 stubs (JobScheduler, NotificationChannel…): the full API 29 jar is required.
CP="$T/android/android-all-29.jar"; [ -f "$CP" ] || { echo "✖ $CP manquant — lancez d'abord : npm run setup:tools"; exit 1; }
read -r APPID VCODE VNAME MINSDK TSDK < <(node -e 'const m=require(process.argv[1]);console.log(m.applicationId,m.versionCode,m.versionName,m.minSdk,m.targetSdk)' "$P/blaze.json")
KS="${BLAZE_RELEASE_KEYSTORE:-$P/blaze-release.p12}"
PASS_FILE="$KS.pass"
if [ ! -f "$KS" ]; then
  echo "• Génération du keystore de signature ($KS) — conservez-le : les mises à jour doivent être signées avec la même clé"
  head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$PASS_FILE"; chmod 600 "$PASS_FILE"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$(cat "$PASS_FILE")" -keypass "$(cat "$PASS_FILE")" \
    -alias blaze -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=Blaze Protect, O=Blaze Protect" 2>&1 | grep -v JAVA_TOOL || true
fi
PASS="$(cat "$PASS_FILE")"
sed "s#<manifest #<manifest package=\"$APPID\" #" "$SRC/AndroidManifest.xml" > "$W/AndroidManifest.xml"
echo "▶ aapt2"
"$T/aapt2/aapt2" compile --dir "$SRC/res" -o "$W/res.zip"
"$T/aapt2/aapt2" link -o "$W/base.apk" -I "$T/aapt2/android-framework.jar" --manifest "$W/AndroidManifest.xml" --java "$W/gen" \
  --min-sdk-version "$MINSDK" --target-sdk-version "$TSDK" --version-code "$VCODE" --version-name "$VNAME" -A "$SRC/assets" "$W/res.zip"
echo "▶ javac ($(basename "$CP"))"; mkdir -p "$W/classes"
if ! javac --release 8 -encoding UTF-8 -nowarn -Xlint:none -cp "$CP" -d "$W/classes" $(find "$SRC/java" "$W/gen" -name '*.java') 2> "$W/javac.log"; then
  grep -v JAVA_TOOL "$W/javac.log"; echo "✖ javac a échoué"; exit 1
fi
echo "▶ dx"
java -cp "$T/android/dx.jar" com.android.dx.command.Main --dex --min-sdk-version="$MINSDK" --output="$W/classes.dex" "$W/classes" 2>&1 | grep -v JAVA_TOOL || true
[ -f "$W/classes.dex" ] || { echo "✖ dx a échoué"; exit 1; }
(cd "$W" && zip -q -j base.apk classes.dex)
mkdir -p "$OUT"
echo "▶ jarsigner"
jarsigner -keystore "$KS" -storepass "$PASS" -sigalg SHA256withRSA -digestalg SHA-256 -signedjar "$OUT/blaze-protect.apk" "$W/base.apk" blaze 2>&1 | grep -E "error" || true
jarsigner -verify "$OUT/blaze-protect.apk" 2>&1 | grep -m1 -E "verified|unsigned|error" || { echo "✖ signature invalide"; exit 1; }
echo "✔ $OUT/blaze-protect.apk ($(du -h "$OUT/blaze-protect.apk" | cut -f1))"
