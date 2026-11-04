#!/usr/bin/env bash
# Compiles the APPXRAY Android runtime (android-runtime/) into web/public/runtime/classes.dex.
# This precompiled DEX is what lets the APPXRAY app build installable APKs directly on the phone.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; T="$ROOT/tools"; W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
CP="$T/android/android-all-29.jar"; [ -f "$CP" ] || CP="$T/android/android-stubs.jar"
mkdir -p "$W/classes" "$ROOT/web/public/runtime"
javac --release 8 -encoding UTF-8 -nowarn -Xlint:none -cp "$CP" -d "$W/classes" $(find "$ROOT/android-runtime/src" -name '*.java') 2>&1 | grep -v JAVA_TOOL || true
[ -n "$(find "$W/classes" -name '*.class')" ] || { echo "✖ javac a échoué"; exit 1; }
java -cp "$T/android/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$ROOT/web/public/runtime/classes.dex" "$W/classes" 2>&1 | grep -v JAVA_TOOL || true
echo "✔ web/public/runtime/classes.dex ($(du -h "$ROOT/web/public/runtime/classes.dex" | cut -f1))"
