#!/usr/bin/env bash
# Renders paper-doll preview grids with the real userscript on the Windows box (headless Chrome).
# usage: run-doll.sh <out_dir> <spec.json>...   each spec = {cols, cells:[{u:{avatar,outfit,items,style}, pose, label}]}
# Shots land in <out_dir>/shotNN.png, one per spec.
set -eu
OUT=$1
shift
REPO=$(cd "$(dirname "$0")/../.." && pwd)
HOST=ruixi@100.68.46.23
SSHO=(-i "$HOME/.ssh/epos_windows_ed25519" -o UserKnownHostsFile="$HOME/.ssh/epos_windows_known_hosts" -o IdentitiesOnly=yes)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp "$REPO/tools/test/doll.html" "$REPO/tools/test/shot.mjs" "$REPO/mwi-battle-fx.user.js" "$TMP/"
mkdir -p "$TMP/assets"
cp -r "$REPO/assets/doll" "$REPO/assets/manifest.json" "$TMP/assets/"
pages=()
for s in "$@"; do pages+=("doll.html#$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(open(sys.argv[1]).read()))' "$s")"); done
tar -cf "$TMP/in.tar" -C "$TMP" doll.html shot.mjs mwi-battle-fx.user.js assets
printf '%s\n' "${pages[@]}" >"$TMP/pages.txt"
ssh "${SSHO[@]}" "$HOST" "rmdir /s /q C:\\Users\\ruixi\\fs-mine\\bfx-doll 2>nul & mkdir C:\\Users\\ruixi\\fs-mine\\bfx-doll"
scp -q "${SSHO[@]}" "$TMP/in.tar" "$TMP/pages.txt" "$HOST:C:/Users/ruixi/fs-mine/bfx-doll/"
# page hashes can be long: node reads them from pages.txt
ssh "${SSHO[@]}" "$HOST" "cd /d C:\\Users\\ruixi\\fs-mine\\bfx-doll && tar -xf in.tar && node -e \"const fs=require('fs');process.argv=[0,0,'out',...fs.readFileSync('pages.txt','utf8').trim().split(/\\r?\\n/)];import('./shot.mjs')\" && tar -cf out.tar out"
scp -q "${SSHO[@]}" "$HOST:C:/Users/ruixi/fs-mine/bfx-doll/out.tar" "$TMP/"
mkdir -p "$OUT"
tar -xf "$TMP/out.tar" -C "$TMP" && cp "$TMP"/out/* "$OUT/"
ls "$OUT"
