#!/usr/bin/env bash
# Runs build-assets.py on the Windows box (this Linux box is too small for image processing).
# usage: remote-build.sh [raw_dir=~/mwi-art-raw]
# Ships new/changed sheets + job lists to C:\Users\ruixi\fs-mine\mwi-art, builds there, and brings
# assets/ back into this repo.
set -eu
RAW=${1:-$HOME/mwi-art-raw}
REPO=$(cd "$(dirname "$0")/.." && pwd)
HOST=ruixi@100.68.46.23
SSHO=(-i "$HOME/.ssh/epos_windows_ed25519" -o UserKnownHostsFile="$HOME/.ssh/epos_windows_known_hosts" -o IdentitiesOnly=yes)
WIN='C:\Users\ruixi\fs-mine\mwi-art'
STAMP="$RAW/.remote-build-stamp"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

# only sheets newer than the last shipment
cd "$RAW"
if [ -f "$STAMP" ]; then
  find sheets -name '*.png' -newer "$STAMP" >"$TMP/list"
else
  find sheets -name '*.png' >"$TMP/list"
fi
ls jobs-*.tsv >>"$TMP/list"
touch "$TMP/stamp"
tar -cf "$TMP/in.tar" -T "$TMP/list"
cp "$REPO/tools/build-assets.py" "$TMP/"
echo "shipping $(grep -c png "$TMP/list") sheets"

ssh "${SSHO[@]}" "$HOST" "mkdir $WIN 2>nul & mkdir $WIN\\sheets 2>nul & exit 0"
scp -q "${SSHO[@]}" "$TMP/in.tar" "$TMP/build-assets.py" "$HOST:C:/Users/ruixi/fs-mine/mwi-art/"
ssh "${SSHO[@]}" "$HOST" "cd /d $WIN && tar -xf in.tar && python build-assets.py . . && tar -cf assets.tar assets"
scp -q "${SSHO[@]}" "$HOST:C:/Users/ruixi/fs-mine/mwi-art/assets.tar" "$TMP/"
mkdir -p "$REPO/assets"
tar -xf "$TMP/assets.tar" -C "$REPO"
mv "$TMP/stamp" "$STAMP"
echo "assets: $(du -sh "$REPO/assets" | cut -f1)"
