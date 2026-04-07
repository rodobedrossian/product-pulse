#!/usr/bin/env bash
# Build Release .app and a compressed .dmg for distribution (e.g. Supabase Storage).
#
# Prerequisites: Xcode + XcodeGen (`brew install xcodegen`).
# For fewer Gatekeeper warnings on other Macs, sign with Developer ID before packaging:
#   export CODE_SIGN_IDENTITY="Developer ID Application: Your Name (TEAMID)"
#   (script will codesign the .app if this is set)
#
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v xcodegen >/dev/null 2>&1; then
  echo "Install XcodeGen: brew install xcodegen"
  exit 1
fi

xcodegen generate

DERIVED="$SCRIPT_DIR/build/DerivedData"
rm -rf "$DERIVED"

xcodebuild \
  -scheme ProductPulseRecorder \
  -configuration Release \
  -derivedDataPath "$DERIVED" \
  -destination "platform=macOS" \
  build

APP="$DERIVED/Build/Products/Release/ProductPulseRecorder.app"
if [[ ! -d "$APP" ]]; then
  echo "error: expected app at $APP"
  exit 1
fi

if [[ -n "${CODE_SIGN_IDENTITY:-}" && "${CODE_SIGN_IDENTITY}" != "-" ]]; then
  codesign --deep --force --options runtime --sign "${CODE_SIGN_IDENTITY}" "$APP"
fi

STAGE="$SCRIPT_DIR/build/dmg_stage"
DMG_OUT="$SCRIPT_DIR/ProductPulseRecorder.dmg"
rm -rf "$STAGE"
mkdir -p "$STAGE"
ditto "$APP" "$STAGE/ProductPulseRecorder.app"
ln -sf /Applications "$STAGE/Applications"

rm -f "$DMG_OUT"
hdiutil create \
  -volname "Product Pulse Recorder" \
  -srcfolder "$STAGE" \
  -ov \
  -format UDZO \
  "$DMG_OUT"

echo ""
echo "DMG ready:"
ls -lh "$DMG_OUT"
echo ""
echo "Upload this file to Supabase Storage, then set DESKTOP_MAC_DOWNLOAD_URL on Railway."
