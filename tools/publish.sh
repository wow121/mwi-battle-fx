#!/usr/bin/env bash
# Commits and publishes the repo so the CDN never serves stale art.
# usage: publish.sh "<commit message>"
# Art is loaded from cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@<rev>, where <rev> is written into
# assets/manifest.json: commit everything first, pin the manifest to that commit, commit again, push,
# then purge the two @main files the userscript reads (the script itself and the manifest).
set -eu
MSG=$1
REPO=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO"
TRAILER=$'\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'

git add -A
if ! git diff --cached --quiet; then git commit -q -m "$MSG$TRAILER"; fi
REV=$(git rev-parse --short=10 HEAD)
python3 -I - "$REV" <<'EOF'
import json, sys
p = "assets/manifest.json"
m = json.load(open(p))
m["rev"] = sys.argv[1]
json.dump(m, open(p, "w"), separators=(",", ":"))
EOF
git add assets/manifest.json
git commit -q -m "Pin assets to $REV$TRAILER"
git push -q
# jsDelivr may still resolve @main to the previous commit right after the push: purge until the
# manifest it serves carries the new rev (up to ~1 min)
for try in $(seq 1 12); do
  for f in mwi-battle-fx.user.js assets/manifest.json; do
    curl -s "https://purge.jsdelivr.net/gh/wow121/mwi-battle-fx@main/$f" >/dev/null
  done
  if curl -s "https://cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@main/assets/manifest.json" | grep -q "\"rev\":\"$REV\""; then
    break
  fi
  timeout 5 tail -f /dev/null || true
done
# Syncthing's watcher misses some git object files; rescan so the Windows checkout stays intact
KEY=$(grep -oP '(?<=<apikey>)[^<]+' ~/.local/state/syncthing/config.xml)
curl -s -X POST -H "X-API-Key: $KEY" "http://127.0.0.1:8384/rest/db/scan?folder=9cdkn-uyw3k&sub=mwi-battle-fx" >/dev/null
echo "published, assets pinned to @$REV ($(git rev-parse --short HEAD))"
