# Doubao EN — English UI for the Doubao macOS desktop app

[![Release](https://img.shields.io/github/v/release/hongkongkiwi/doubao-osx-english)](https://github.com/hongkongkiwi/doubao-osx-english/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

The Doubao (豆包) desktop app for macOS is Chinese-only: it has no in-app
language setting, ignores the macOS per-app language override (it actively
deletes it), and ignores Electron's `--lang` flag. This project adds an
English interface **without modifying the app itself**, so it keeps working
across Doubao updates.

![Doubao EN screenshot](docs/screenshot.png)

## How it works

Doubao's entire UI is web content running in an embedded Chromium view. When
Doubao starts, Doubao EN relaunches it with a local DevTools port
(`127.0.0.1:9223`, localhost-only) and injects a translator into each page:

- A **dictionary** (~140 entries, `lib/dictionary.js`) maps exact UI strings
  (`新对话` → `New chat`, `云盘` → `Cloud drive`, …). Exact matching means
  chat messages and AI answers are never touched.
- A **sweep** re-walks the DOM every 3 seconds, so new panels, dialogs and
  re-renders flip to English within a few seconds.
- A **`setAttribute` intercept** on `Element.prototype` keeps React-controlled
  labels (the composer placeholder, for example) English even when the app
  re-renders and rewrites them.

Because nothing inside `Doubao.app` is modified — no re-signing, no patched
resources — **Doubao's auto-updater works normally and the translation
survives every upgrade**. If an update renames a string, that one label stays
Chinese until the dictionary learns it (see below).

## Requirements

- macOS 12+
- [Doubao for Mac](https://www.doubao.com/download) in `/Applications`
- Node.js 22+ (`brew install node` — the built-in `WebSocket` is required)

## Install

**From a release download** (easiest): grab
[`Doubao EN.app`](https://github.com/hongkongkiwi/doubao-osx-english/releases/latest)
from Releases, move it to `/Applications`, and launch it.

**From source:**

```bash
git clone https://github.com/hongkongkiwi/doubao-osx-english.git
cd doubao-osx-english
./install.sh          # builds + installs /Applications/Doubao EN.app
```

## Usage

Launch **Doubao EN** instead of Doubao — from Spotlight (⌘Space → "doubao en"),
Launchpad or `/Applications`. Everything else behaves like normal:

- Doubao quits and relaunches with the DevTools port, then the UI turns
  English a few seconds after the window appears.
- Opening new windows or settings panels translates within ~3 seconds.
- Quitting Doubao quits Doubao EN; the original Doubao.app still launches
  untranslated if you start it directly.

Console output lands in `~/Library/Logs/doubao-en.log` when run from the app.

## What gets translated

Sidebar, home screen, composer toolbar, the full settings panel, dialogs,
tooltips and placeholders — everything that matches the dictionary. Chat
message text, AI answers and your own chat titles are intentionally left
alone. The macOS menu bar (File/Edit/View/Window/Help equivalents) is native
and out of reach; in-app Chinese that isn't in the dictionary stays Chinese.

## Missing translations

Doubao's UI is not stored on your machine — the app is a native shell and
every string arrives from ByteDance's servers at launch. That means there is
no local file to translate once and be done: coverage is grown by collecting
what the server actually renders. Two ways to add strings:

**Quick, local-only (no reinstall):** create
`~/Library/Application Support/DoubaoEN/user-dictionary.json`:

```json
{ "收藏夹": "Saved", "检查更新": "Check for updates" }
```

It is merged over the built-in dictionary on every launch — quit and reopen
Doubao EN to apply.

**Permanent (helps everyone):** run the collector while the screen you want
is open, translate what you need, and send a PR:

```bash
node bin/doubao-en.js --collect
# → writes visible untranslated strings to doubao-en-strings.txt
#   (chat titles show up too — don't add those), then add entries to
#   lib/dictionary.js and reinstall: ./install.sh
```

Note on scope: the dictionary matches complete UI labels exactly, so a list
of common words does not help — and dynamic content (chat text, AI answers,
news chips in "Recommended for you") is intentionally left untranslated.

## CLI (advanced)

You can also run it without the wrapper app:

```bash
node bin/doubao-en.js                 # inject + keep watching
node bin/doubao-en.js --once          # inject into current windows, exit
node bin/doubao-en.js --collect       # dump untranslated strings
node bin/doubao-en.js --screenshot out.png
DOUBAO_EN_PORT=9223 node bin/doubao-en.js
```

## Uninstall

```bash
./uninstall.sh        # or just delete /Applications/Doubao EN.app
```

Doubao itself is untouched — no settings, files or preferences are changed
(there is nothing else to clean up).

## Security notes

While Doubao EN runs, Doubao listens on `127.0.0.1:9223` (Chromium DevTools
protocol). It is bound to localhost only, but any process running as your
user could attach to the app while that port is open. If that matters for
your threat model, only start Doubao EN when you want the translation and
use plain Doubao otherwise. The wrapper is ad-hoc signed; Gatekeeper may ask
you to confirm the first launch (`xattr -cr "Doubao EN.app"` if needed).

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| App opens but stays Chinese | Node 22+ missing — check `node --version`; see `~/Library/Logs/doubao-en.log` |
| "DevTools port never came up" | Another Doubao instance was mid-quit — wait a few seconds, relaunch Doubao EN |
| Port 9223 already in use | `DOUBAO_EN_PORT=9300` (env var), or edit `bin/doubao-en.js` |
| Some labels Chinese after an update | New/renamed strings — `--collect`, extend `lib/dictionary.js` |
| Gatekeeper blocks the downloaded app | `xattr -cr "/Applications/Doubao EN.app"` |

## Releases

Tags are built automatically: `git tag v1.0.1 && git push --tags` publishes a
zip containing the self-contained `Doubao EN.app` via
[GitHub Actions](.github/workflows/release.yml).

## Disclaimer

Unofficial, community-made. Not affiliated with or endorsed by ByteDance.
It intercepts nothing network-related — it rewrites local UI text only —
but you use it at your own risk.
