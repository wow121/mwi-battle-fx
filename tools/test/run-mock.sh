#!/usr/bin/env bash
# Runs tools/test/mock.html in headless Chrome on the Windows box and brings the frames back.
# usage: run-mock.sh <out_dir>     (frames land in <out_dir>/frames/f####_<ms>.jpg)
# The mock serves the current userscript + assets/ + the game's sprite sheets (avatars, outfits, items,
# monsters) from the newest mwi-gamedata archive, feeds fake battle messages, then drives the lab.
set -eu
OUT=$1
REPO=$(cd "$(dirname "$0")/../.." && pwd)
ARCH=$(ls -d "$REPO"/../mwi-gamedata/archive/*/ | sort | tail -1)
HOST=ruixi@100.68.46.23
SSHO=(-i "$HOME/.ssh/epos_windows_ed25519" -o UserKnownHostsFile="$HOME/.ssh/epos_windows_known_hosts" -o IdentitiesOnly=yes)
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/sprites"
cp "$REPO/tools/test/drive.mjs" "$TMP/"
# MOCK=tools/test/guild.html swaps in another page (served as mock.html)
cp "${MOCK:-$REPO/tools/test/mock.html}" "$TMP/mock.html"
# DUR=<ms> records longer than the default 18 s; PHONE=1 emulates a 390x844 touch phone
# SCRIPT=release/mwi-battle-fx.user.js tests the release copy (no lab: the run stops after the live part)
cp "${SCRIPT:-$REPO/mwi-battle-fx.user.js}" "$TMP/mwi-battle-fx.user.js"
cp "$ARCH"/sprites/{combat_monsters,avatars,avatar_outfits,items,actions,skills}.svg "$TMP/sprites/"
cp -r "$REPO/assets" "$TMP/"
tar -cf "$TMP/in.tar" -C "$TMP" mock.html drive.mjs mwi-battle-fx.user.js sprites assets
ssh "${SSHO[@]}" "$HOST" "rmdir /s /q C:\\Users\\ruixi\\fs-mine\\bfx-test 2>nul & mkdir C:\\Users\\ruixi\\fs-mine\\bfx-test"
scp -q "${SSHO[@]}" "$TMP/in.tar" "$HOST:C:/Users/ruixi/fs-mine/bfx-test/"
ssh "${SSHO[@]}" "$HOST" "cd /d C:\\Users\\ruixi\\fs-mine\\bfx-test && tar -xf in.tar && set DUR=${DUR:-18000}&& set PHONE=${PHONE:-0}&& set PHONE_H=${PHONE_H:-844}&& node drive.mjs && tar -cf frames.tar frames"
mkdir -p "$OUT"
scp -q "${SSHO[@]}" "$HOST:C:/Users/ruixi/fs-mine/bfx-test/frames.tar" "$OUT/"
rm -rf "$OUT/frames"
tar -xf "$OUT/frames.tar" -C "$OUT"
echo "$(ls "$OUT/frames" | wc -l) frames in $OUT/frames"
