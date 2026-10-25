#!/bin/bash
# Builds the release zip: Doubao EN.app (self-contained) + quick-install note.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="${VERSION:-$(cat VERSION 2>/dev/null || echo 1.0.0)}"
VERSION="${VERSION#v}"
rm -rf dist
mkdir -p dist
./scripts/make-app.sh "dist/Doubao EN.app"

cat > "dist/INSTALL.txt" <<NOTE
Doubao EN v$VERSION — English UI for the Doubao macOS desktop app
==================================================================

Requirements: macOS 12+, Node.js 22+ (brew install node), Doubao for Mac installed.

1. Move "Doubao EN.app" into /Applications (or run it from anywhere).
2. Launch "Doubao EN" instead of Doubao. English UI appears within seconds.
3. To remove later, delete the app — Doubao itself is never modified.

Full documentation: https://github.com/hongkongkiwi/doubao-osx-english
NOTE

cd dist
zip -qr "doubao-en-macos-v$VERSION.zip" "Doubao EN.app" INSTALL.txt
cd ..
echo "Packaged: dist/doubao-en-macos-v$VERSION.zip"
