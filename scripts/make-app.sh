#!/bin/bash
# Builds "Doubao EN.app" — a launcher wrapper around Doubao that injects the
# English translator on every start. The bundle is self-contained (it embeds
# bin/ and lib/); it needs Node.js 22+ on the machine.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="${1:-$ROOT/dist/Doubao EN.app}"
APP_NAME="$(basename "$APP_DIR" .app)"
DOUBAO_APP="${DOUBAO_APP:-/Applications/Doubao.app}"
VERSION="${VERSION:-1.0.0}"

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources/app"

cp -R "$ROOT/bin" "$ROOT/lib" "$APP_DIR/Contents/Resources/app/"

if [ -f "$DOUBAO_APP/Contents/Resources/app.icns" ]; then
  cp "$DOUBAO_APP/Contents/Resources/app.icns" "$APP_DIR/Contents/Resources/Doubao.icns"
fi

cat > "$APP_DIR/Contents/MacOS/doubao-en" <<'LAUNCHER'
#!/bin/bash
RES="$(cd "$(dirname "$0")/../Resources" && pwd)"
NODE="$(command -v node || true)"
if [ -z "$NODE" ]; then
  for c in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.local/bin/node"; do
    if [ -x "$c" ]; then NODE="$c"; break; fi
  done
fi
if [ -z "$NODE" ]; then
  /usr/bin/osascript -e 'display alert "Doubao EN" message "Node.js 22+ is required but was not found. Install it with: brew install node" as critical'
  exit 1
fi
exec "$NODE" "$RES/app/bin/doubao-en.js"
LAUNCHER
chmod +x "$APP_DIR/Contents/MacOS/doubao-en"

cat > "$APP_DIR/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>               <string>$APP_NAME</string>
  <key>CFBundleDisplayName</key>        <string>$APP_NAME</string>
  <key>CFBundleExecutable</key>         <string>doubao-en</string>
  <key>CFBundleIdentifier</key>         <string>hk.savage.doubao-en</string>
  <key>CFBundlePackageType</key>        <string>APPL</string>
  <key>CFBundleShortVersionString</key> <string>$VERSION</string>
  <key>CFBundleVersion</key>            <string>$VERSION</string>
  <key>CFBundleIconFile</key>           <string>Doubao</string>
  <key>LSMinimumSystemVersion</key>     <string>12.0</string>
  <key>NSHighResolutionCapable</key>    <true/>
</dict>
</plist>
PLIST

codesign --force --deep -s - "$APP_DIR" 2>/dev/null || true
echo "Built: $APP_DIR"
