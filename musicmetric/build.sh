#!/usr/bin/env bash
# Builds MusicMetric into musicmetric/release/MusicMetric.apk with an offline toolchain (no Android SDK needed):
# aapt2 (from Apktool, Maven Central) → javac (against Robolectric android-all API 29) → dx → zip → jarsigner.
# Tools are fetched into $MM_TOOLS (default ~/.musicmetric-tools) on first run.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
T="${MM_TOOLS:-$HOME/.musicmetric-tools}"; SRC="$ROOT/app/src/main"; OUT="$ROOT/release"; W="$(mktemp -d)"
trap 'rm -rf "$W"' EXIT
MVN=https://repo1.maven.org/maven2
mkdir -p "$T"
fetch() { [ -s "$2" ] || { echo "  ↓ $(basename "$2")"; curl -fsSL --retry 4 -o "$2.part" "$1" && mv "$2.part" "$2"; }; }
fetch "$MVN/org/apktool/apktool-lib/2.11.1/apktool-lib-2.11.1.jar" "$T/apktool-lib.jar"
fetch "$MVN/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar" "$T/dx.jar"
fetch "$MVN/org/robolectric/android-all/10-robolectric-5803371/android-all-10-robolectric-5803371.jar" "$T/android-all.jar"
if [ ! -x "$T/aapt2" ]; then (cd "$T" && unzip -o -q -j apktool-lib.jar prebuilt/linux/aapt2_64 prebuilt/android-framework.jar && mv aapt2_64 aapt2 && chmod +x aapt2); fi

APPID=com.superessence.musicmetric; VCODE=1; VNAME=1.0
KS="${MM_KEYSTORE:-$ROOT/musicmetric-release.p12}"; PASS_FILE="$KS.pass"
if [ ! -f "$KS" ]; then
  echo "• Génération du keystore ($KS)"
  head -c 18 /dev/urandom | base64 | tr -d '/+=' > "$PASS_FILE"; chmod 600 "$PASS_FILE"
  keytool -genkeypair -keystore "$KS" -storetype PKCS12 -storepass "$(cat "$PASS_FILE")" -keypass "$(cat "$PASS_FILE")" \
    -alias musicmetric -keyalg RSA -keysize 3072 -validity 10000 -dname "CN=SuperEssence Studio, O=SuperEssence Studio" 2>&1 | grep -v JAVA_TOOL || true
fi
PASS="$(cat "$PASS_FILE")"
sed "s#<manifest #<manifest package=\"$APPID\" #" "$SRC/AndroidManifest.xml" > "$W/AndroidManifest.xml"
echo "▶ aapt2"
"$T/aapt2" compile --dir "$SRC/res" -o "$W/res.zip"
"$T/aapt2" link -o "$W/base.apk" -I "$T/android-framework.jar" --manifest "$W/AndroidManifest.xml" --java "$W/gen" \
  --min-sdk-version 24 --target-sdk-version 29 --version-code "$VCODE" --version-name "$VNAME" "$W/res.zip"
echo "▶ javac"; mkdir -p "$W/classes"
javac --release 8 -encoding UTF-8 -nowarn -Xlint:-options -cp "$T/android-all.jar" -d "$W/classes" $(find "$SRC/java" "$W/gen" -name '*.java') 2>&1 | grep -v JAVA_TOOL || true
[ -f "$W/classes/com/superessence/musicmetric/MainActivity.class" ] || { echo "✖ javac a échoué"; exit 1; }
echo "▶ dx"; java -cp "$T/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$W/classes.dex" "$W/classes" 2>&1 | grep -v JAVA_TOOL || true
(cd "$W" && zip -q -j base.apk classes.dex)
mkdir -p "$OUT"
echo "▶ jarsigner"
jarsigner -keystore "$KS" -storepass "$PASS" -sigalg SHA256withRSA -digestalg SHA-256 -signedjar "$OUT/MusicMetric.apk" "$W/base.apk" musicmetric 2>&1 | grep -E "signed|error" || true
jarsigner -verify "$OUT/MusicMetric.apk" 2>&1 | grep -v JAVA_TOOL | head -1
echo "✔ $OUT/MusicMetric.apk ($(du -h "$OUT/MusicMetric.apk" | cut -f1))"
