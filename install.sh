#!/bin/bash
# Installs "Doubao EN.app" into /Applications.
# Doubao itself is never modified — uninstall is just deleting the wrapper.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DOUBAO_APP="${DOUBAO_APP:-/Applications/Doubao.app}"

echo "── Doubao EN installer ──────────────────────────────────"

if [ "$(uname)" != "Darwin" ]; then echo "✗ macOS only."; exit 1; fi

if [ ! -d "$DOUBAO_APP/Contents" ]; then
  echo "✗ Doubao.app not found at $DOUBAO_APP"
  echo "  Install Doubao first, or point DOUBAO_APP at it:  DOUBAO_APP=/path/to/Doubao.app ./install.sh"
  exit 1
fi
echo "✓ Doubao found: $DOUBAO_APP"

NODE="$(command -v node || true)"
[ -z "$NODE" ] && for c in /opt/homebrew/bin/node /usr/local/bin/node "$HOME/.local/bin/node"; do
  [ -x "$c" ] && NODE="$c" && break
done
if [ -z "$NODE" ]; then
  echo "✗ Node.js not found. Install Node 22+:  brew install node"; exit 1
fi
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]')"
if [ "$MAJOR" -lt 22 ]; then
  echo "✗ Node.js 22+ required, found $("$NODE" --version). Upgrade: brew upgrade node"; exit 1
fi
echo "✓ Node $("$NODE" --version) at $NODE"

"$ROOT/scripts/make-app.sh" "/Applications/Doubao EN.app"

cat <<DONE

─────────────────────────────────────────────────────────
✓ Installed to /Applications/Doubao EN.app

Usage:
  • Launch “Doubao EN” instead of Doubao (Spotlight: ⌘Space “doubao en”).
  • English UI applies a few seconds after the window appears.
  • New strings missed by the dictionary stay Chinese — that's expected;
    see README.md → “Missing translations” to extend them.

To remove:  ./uninstall.sh   (or delete the app — Doubao itself is untouched)
─────────────────────────────────────────────────────────
DONE
