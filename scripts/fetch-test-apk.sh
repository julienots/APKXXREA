#!/usr/bin/env bash
# Downloads a real-world, openly licensed APK (Appium Settings, Apache-2.0) used by the integration tests.
set -euo pipefail
DEST="$(cd "$(dirname "$0")/.." && pwd)/server/test/fixtures/settings.apk"
[ -s "$DEST" ] && { echo "present: $DEST"; exit 0; }
TMP="$(mktemp -d)"
URL="$(npm view io.appium.settings@8.5.2 dist.tarball)"
curl -fsSL "$URL" | tar xz -C "$TMP"
cp "$TMP/package/apks/settings_apk-debug.apk" "$DEST"
rm -rf "$TMP"
echo "saved: $DEST"
