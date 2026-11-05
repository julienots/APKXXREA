#!/usr/bin/env bash
# Builds dist/AvatarStudio.apk (Android 8.0+) without Gradle:
# vite build -> aapt2 (resources + assets) -> javac (Android API 29) -> dx -> zip -> zipalign-free v1 signing (jarsigner).
# Toolchain: run ../scripts/install-tools.sh (from the repo root) once to fetch aapt2, android-all-29 and dx into ../tools.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="${SE_TOOLS:-$ROOT/../tools}"
SRC="$ROOT/android/src/main"
OUT="$ROOT/dist"
W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
read -r APPID VCODE VNAME MINSDK TSDK < <(node -e 'const m=require(process.argv[1]);console.log(m.applicationId,m.versionCode,m.versionName,m.minSdk,m.targetSdk)' "$ROOT/android/app.json")

KS="${SE_KEYSTORE:-$ROOT/android/superessence-release.p12}"
PASS_FILE="$KS.pass"
if [ ! -f "$KS" ]; then
  echo "- Nouveau keystore de signature : $KS (conservez-le pour publier les mises à jour)"
  head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$PASS_FILE"; chmod 600 "$PASS_FILE"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$(cat "$PASS_FILE")" -keypass "$(cat "$PASS_FILE")" \
    -alias superessence -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=SuperEssence Studio, O=SuperEssence Studio" 2>&1 | grep -v JAVA_TOOL || true
fi
PASS="$(cat "$PASS_FILE")"

echo "> Application web (Three.js, three-vrm, MediaPipe)"
(cd "$ROOT/web" && npm run build >/dev/null)
rm -rf "$SRC/assets/www"; mkdir -p "$SRC/assets"; cp -r "$ROOT/web/dist" "$SRC/assets/www"

sed "s#<manifest #<manifest package=\"$APPID\" #" "$SRC/AndroidManifest.xml" > "$W/AndroidManifest.xml"
echo "> aapt2"
"$T/aapt2/aapt2" compile --dir "$SRC/res" -o "$W/res.zip"
"$T/aapt2/aapt2" link -o "$W/base.apk" -I "$T/aapt2/android-framework.jar" --manifest "$W/AndroidManifest.xml" --java "$W/gen" \
  --min-sdk-version "$MINSDK" --target-sdk-version "$TSDK" --version-code "$VCODE" --version-name "$VNAME" \
  -0 wasm -0 task -0 woff2 -0 png -A "$SRC/assets" "$W/res.zip"
echo "> javac"
mkdir -p "$W/classes"
javac --release 8 -encoding UTF-8 -nowarn -cp "$T/android/android-all-29.jar" -d "$W/classes" $(find "$SRC/java" "$W/gen" -name '*.java') 2>&1 | grep -v -E "JAVA_TOOL|warning|^Note" || true
[ -f "$W/classes/io/superessence/avatarstudio/MainActivity.class" ] || { echo "javac a échoué"; exit 1; }
echo "> dx"
java -cp "$T/android/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=26 --output="$W/classes.dex" "$W/classes" 2>&1 | grep -v JAVA_TOOL || true
(cd "$W" && zip -q -j base.apk classes.dex)
mkdir -p "$OUT"
echo "> signature"
jarsigner -keystore "$KS" -storepass "$PASS" -sigalg SHA256withRSA -digestalg SHA-256 -signedjar "$OUT/AvatarStudio.apk" "$W/base.apk" superessence 2>&1 | grep -E "error" || true
jarsigner -verify "$OUT/AvatarStudio.apk" 2>&1 | grep -v JAVA_TOOL | head -1
echo "OK $OUT/AvatarStudio.apk ($(du -h "$OUT/AvatarStudio.apk" | cut -f1))"
