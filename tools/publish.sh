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
# jsDelivr may still resolve @main to the previous commit right after the push. Purging too often gets
# throttled (~30 min), so purge once, poll, and re-purge at most every 30 s, three times in all.
purge() { for f in mwi-battle-fx.user.js assets/manifest.json; do curl -s "https://purge.jsdelivr.net/gh/wow121/mwi-battle-fx@main/$f" >/dev/null; done; }
VER=$(grep -m1 -oP '@version\s+\K\S+' mwi-battle-fx.user.js)
fresh() {
  curl -s "https://cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@main/assets/manifest.json" | grep -q "\"rev\":\"$REV\"" &&
    curl -s "https://cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@main/mwi-battle-fx.user.js" | grep -q "@version *$VER"
}
ok=""
for round in 1 2 3; do
  timeout 10 tail -f /dev/null || true
  purge
  for poll in 1 2 3 4 5 6; do
    if fresh; then ok=1; break 2; fi
    timeout 5 tail -f /dev/null || true
  done
done
[ -n "$ok" ] || echo "WARNING: CDN still serves the old @main; pinned URL: https://cdn.jsdelivr.net/gh/wow121/mwi-battle-fx@$(git rev-parse --short HEAD)/mwi-battle-fx.user.js"
# Syncthing's watcher misses some git object files; rescan so the Windows checkout stays intact
KEY=$(grep -oP '(?<=<apikey>)[^<]+' ~/.local/state/syncthing/config.xml)
curl -s -X POST -H "X-API-Key: $KEY" "http://127.0.0.1:8384/rest/db/scan?folder=9cdkn-uyw3k&sub=mwi-battle-fx" >/dev/null
echo "published, assets pinned to @$REV ($(git rev-parse --short HEAD))"
