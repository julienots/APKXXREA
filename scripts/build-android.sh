#!/usr/bin/env bash
# Builds the standalone APPXRAY Android app (android/ + bundled web app + on-device engine) into dist/appxray.apk with APPXRAY's offline toolchain:
# aapt2 → javac (against android-all API 29) → dx → zip → jarsigner. Run `npm run setup:tools` first.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$ROOT/tools"; SRC="$ROOT/android/app/src/main"; OUT="$ROOT/dist"; W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
CP="$T/android/android-all-29.jar"; [ -f "$CP" ] || CP="$T/android/android-stubs.jar"
read -r APPID VCODE VNAME MINSDK TSDK < <(node -e 'const m=require(process.argv[1]);console.log(m.applicationId,m.versionCode,m.versionName,m.minSdk,m.liteTargetSdk)' "$ROOT/android/appxray.json")
KS="${APPXRAY_RELEASE_KEYSTORE:-$ROOT/android/appxray-release.p12}"
PASS_FILE="$KS.pass"
if [ ! -f "$KS" ]; then
  echo "• Génération du keystore de signature ($KS)"
  head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$PASS_FILE"; chmod 600 "$PASS_FILE"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$(cat "$PASS_FILE")" -keypass "$(cat "$PASS_FILE")" \
    -alias appxray -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=APPXRAY, O=APPXRAY" 2>&1 | grep -v JAVA_TOOL || true
fi
PASS="$(cat "$PASS_FILE")"
echo "▶ Runtime APPXRAY (moteur des APK compilés sur le téléphone)"; bash "$ROOT/scripts/build-runtime.sh"
echo "▶ Application web (interface + moteur d'analyse embarqué)"; (cd "$ROOT" && npm run build -w web >/dev/null)
rm -rf "$SRC/assets/www"; mkdir -p "$SRC/assets"; cp -r "$ROOT/web/dist" "$SRC/assets/www"
sed "s#<manifest #<manifest package=\"$APPID\" #" "$SRC/AndroidManifest.xml" > "$W/AndroidManifest.xml"
echo "▶ aapt2"; "$T/aapt2/aapt2" compile --dir "$SRC/res" -o "$W/res.zip"
"$T/aapt2/aapt2" link -o "$W/base.apk" -I "$T/aapt2/android-framework.jar" --manifest "$W/AndroidManifest.xml" --java "$W/gen" \
  --min-sdk-version "$MINSDK" --target-sdk-version "$TSDK" --version-code "$VCODE" --version-name "$VNAME" -A "$SRC/assets" "$W/res.zip"
echo "▶ javac ($(basename "$CP"))"; mkdir -p "$W/classes"
javac --release 8 -encoding UTF-8 -nowarn -cp "$CP" -d "$W/classes" $(find "$SRC/java" "$W/gen" -name '*.java') 2>&1 | grep -v JAVA_TOOL || true
[ -n "$(find "$W/classes" -name '*.class')" ] || { echo "✖ javac a échoué"; exit 1; }
echo "▶ dx"; java -cp "$T/android/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$W/classes.dex" "$W/classes" 2>&1 | grep -v JAVA_TOOL || true
(cd "$W" && zip -q -j base.apk classes.dex)
mkdir -p "$OUT"
echo "▶ jarsigner"; jarsigner -keystore "$KS" -storepass "$PASS" -sigalg SHA256withRSA -digestalg SHA-256 -signedjar "$OUT/appxray.apk" "$W/base.apk" appxray 2>&1 | grep -E "signed|error" || true
jarsigner -verify "$OUT/appxray.apk" 2>&1 | grep -v JAVA_TOOL | head -1
echo "✔ $OUT/appxray.apk ($(du -h "$OUT/appxray.apk" | cut -f1))"
