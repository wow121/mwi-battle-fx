#!/usr/bin/env bash
# Renders reference PNGs from the game's sprite sheets on the Windows box (headless Chrome) into <raw>/ref.
# usage: render-refs.sh <raw_dir> <sheet/id>...     e.g. combat_monsters/gummy_bear items/frost_staff
#   combat_monsters/<id> -> ref/<id>.png;  avatars / avatar_outfits / items / actions / skills -> ref/lib/{a,o,i,act,s}_<id>.png
# Sprites come from the newest mwi-gamedata archive. A reference that already exists is moved to ref/_old/ first.
set -eu
RAW=$1
shift
REPO=$(cd "$(dirname "$0")/.." && pwd)
ARCH=$(ls -d "$REPO"/../mwi-gamedata/archive/*/ | sort | tail -1)
HOST=ruixi@100.68.46.23
SSHO=(-i "$HOME/.ssh/epos_windows_ed25519" -o UserKnownHostsFile="$HOME/.ssh/epos_windows_known_hosts" -o IdentitiesOnly=yes)
WIN='C:\Users\ruixi\fs-mine\bfx-refs'
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp "$REPO/tools/render-refs.mjs" "$TMP/"
mkdir "$TMP/sprites"
cp "$ARCH"/sprites/{combat_monsters,avatars,avatar_outfits,items,actions,skills}.svg "$TMP/sprites/"
tar -cf "$TMP/in.tar" -C "$TMP" render-refs.mjs sprites
ssh "${SSHO[@]}" "$HOST" "rmdir /s /q $WIN 2>nul & mkdir $WIN"
scp -q "${SSHO[@]}" "$TMP/in.tar" "$HOST:C:/Users/ruixi/fs-mine/bfx-refs/"
ssh "${SSHO[@]}" "$HOST" "cd /d $WIN && tar -xf in.tar && node render-refs.mjs sprites out $* && tar -cf out.tar -C out --exclude=.chrome-prof ."
scp -q "${SSHO[@]}" "$HOST:C:/Users/ruixi/fs-mine/bfx-refs/out.tar" "$TMP/"
mkdir -p "$TMP/out" "$RAW/ref/lib" "$RAW/ref/_old/lib"
tar -xf "$TMP/out.tar" -C "$TMP/out"
for f in "$TMP"/out/*.png; do
  b=$(basename "$f" .png)
  sheet=${b%%__*} id=${b#*__}
  case $sheet in
    combat_monsters) dst=$id.png ;;
    avatars) dst=lib/a_$id.png ;;
    avatar_outfits) dst=lib/o_$id.png ;;
    items) dst=lib/i_$id.png ;;
    actions) dst=lib/act_$id.png ;;
    skills) dst=lib/s_$id.png ;;
  esac
  [ -f "$RAW/ref/$dst" ] && [ ! -f "$RAW/ref/_old/$dst" ] && mv "$RAW/ref/$dst" "$RAW/ref/_old/$dst"
  cp "$f" "$RAW/ref/$dst"
  echo "ref/$dst"
done
