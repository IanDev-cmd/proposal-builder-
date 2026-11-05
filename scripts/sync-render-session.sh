#!/usr/bin/env bash
# The installer download used to copy Render once. Run this while the desktop
# engine is open to repeat that exchange immediately. The app also runs it
# every 90 seconds, and again when the local database changes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN_FILE="${LOCALAPPDATA:-$HOME/AppData/Local}/WEOTT/Nexus/team-pin.txt"
PIN=""
if [[ -f "$PIN_FILE" ]]; then
  PIN="$(tr -d '\r\n' < "$PIN_FILE")"
fi
if [[ -z "$PIN" ]]; then
  echo "Missing team PIN at $PIN_FILE" >&2
  exit 1
fi

cd "$ROOT"
node -e '
const { syncRenderWorkspace } = require("./electron/importRender");
const pin = process.argv[1];
syncRenderWorkspace({ origin: "http://127.0.0.1:8765", pin, app: null })
  .then((result) => {
    console.log(JSON.stringify(result));
  })
  .catch((err) => {
    console.error(err && err.message ? err.message : err);
    process.exit(1);
  });
' "$PIN"
