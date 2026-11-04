#!/usr/bin/env bash
# Installs the external analysis / build toolchain used by APPXRAY into ./tools
# Everything here is downloaded from public, versioned sources.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
T="$ROOT/tools"
mkdir -p "$T"
APKTOOL_VERSION=2.11.1
JADX_VERSION=1.5.6
MVN="${MAVEN_MIRROR:-https://repo.maven.apache.org/maven2}"

fetch() { # url dest
  if [ -s "$2" ]; then echo "  ✓ $(basename "$2") present"; return; fi
  echo "  ↓ $1"
  curl -fsSL --retry 4 --retry-delay 3 -o "$2.part" "$1" && mv "$2.part" "$2"
}

echo "[1/4] Apktool $APKTOOL_VERSION (bundles aapt2 + android framework resources)"
fetch "https://bitbucket.org/iBotPeaches/apktool/downloads/apktool_${APKTOOL_VERSION}.jar" "$T/apktool.jar"
mkdir -p "$T/aapt2"
if [ ! -x "$T/aapt2/aapt2" ]; then
  (cd "$T/aapt2" && unzip -o -q -j ../apktool.jar prebuilt/linux/aapt2_64 prebuilt/android-framework.jar \
     && mv aapt2_64 aapt2 && chmod +x aapt2)
fi

echo "[2/4] JADX $JADX_VERSION (resolved from Maven Central)"
if [ ! -f "$T/jadx/lib/jadx-cli-${JADX_VERSION}.jar" ]; then
  W="$(mktemp -d)"
  cat > "$W/pom.xml" <<POM
<project xmlns="http://maven.apache.org/POM/4.0.0"><modelVersion>4.0.0</modelVersion>
<groupId>appxray</groupId><artifactId>jadx-dist</artifactId><version>1</version>
<dependencies><dependency><groupId>io.github.skylot</groupId><artifactId>jadx-cli</artifactId><version>${JADX_VERSION}</version>
<exclusions>
 <exclusion><groupId>com.android.tools.build</groupId><artifactId>*</artifactId></exclusion>
 <exclusion><groupId>com.android.tools</groupId><artifactId>*</artifactId></exclusion>
 <exclusion><groupId>com.android.tools.smali</groupId><artifactId>*</artifactId></exclusion>
 <exclusion><groupId>io.github.skylot</groupId><artifactId>jadx-smali-input</artifactId></exclusion>
 <exclusion><groupId>io.github.skylot</groupId><artifactId>jadx-aab-input</artifactId></exclusion>
</exclusions></dependency></dependencies></project>
POM
  mkdir -p "$T/jadx/lib"
  (cd "$W" && mvn -q dependency:copy-dependencies -DoutputDirectory="$T/jadx/lib")
  rm -rf "$W"
fi

echo "[3/4] Lite Android toolchain: android API stubs + dx (dex compiler)"
mkdir -p "$T/android"
fetch "$MVN/com/google/android/android/4.1.1.4/android-4.1.1.4.jar" "$T/android/android-stubs.jar"
fetch "$MVN/com/jakewharton/android/repackaged/dalvik-dx/16.0.1/dalvik-dx-16.0.1.jar" "$T/android/dx.jar"

echo "[4/4] Done. Tools installed in $T"
