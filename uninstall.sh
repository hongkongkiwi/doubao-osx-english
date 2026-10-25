#!/bin/bash
# Removes Doubao EN. Doubao itself was never modified, so this is all there is.
set -euo pipefail
APP="/Applications/Doubao EN.app"
pkill -f "bin/doubao-en.js" 2>/dev/null || true
if [ -d "$APP" ]; then rm -rf "$APP"; echo "✓ Removed $APP"; else echo "Nothing to remove ($APP not present)."; fi
echo "Doubao launches normally as before."
