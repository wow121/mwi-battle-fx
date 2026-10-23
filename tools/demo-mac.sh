#!/usr/bin/env bash
# 40-player guild trial demo of the battle stage, on a Mac (or any machine with curl + python3 / ruby).
# usage: bash demo-mac.sh            or   curl -fsSL https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/tools/demo-mac.sh | bash
# Downloads the current userscript and demo page from GitHub and the game's own sprite sheets from the game site
# (the art itself loads from the asset CDN), serves them on 127.0.0.1:8798 and opens the page. Ctrl+C stops it.
set -eu
DIR="${TMPDIR:-/tmp}/mwi-battle-fx-demo"
PORT=8798
RAW=https://raw.githubusercontent.com/wow121/mwi-battle-fx/main
GAME=https://www.milkywayidle.com
mkdir -p "$DIR/sprites"
cd "$DIR"

echo "下载脚本和演示页…"
curl -fsSL "$RAW/mwi-battle-fx.user.js" -o mwi-battle-fx.user.js
curl -fsSL "$RAW/tools/test/demo-guild.html" -o demo.html

# sprite names carry a content hash that changes with game updates: read them from the game's main bundle
echo "从游戏官网下载精灵图…"
main=$(curl -fsSL "$GAME/game" | grep -o '/static/js/main\.[0-9a-f]*\.chunk\.js' | head -1)
[ -n "$main" ] || { echo "找不到游戏主脚本（$GAME/game）"; exit 1; }
bundle=$(curl -fsSL "$GAME$main")
for name in avatars avatar_outfits items combat_monsters; do
  path=$(printf '%s' "$bundle" | grep -o "static/media/${name}_sprite\.[0-9a-f]*\.svg" | head -1)
  [ -n "$path" ] || { echo "游戏脚本里找不到 ${name} 精灵图"; exit 1; }
  curl -fsSL "$GAME/$path" -o "sprites/$name.svg"
done

# a static server bound to localhost: python3 if present, else the system ruby
if lsof -iTCP:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "端口 $PORT 已被占用，先关掉上一次的演示（或占用它的程序）再运行"
  exit 1
fi
if command -v python3 >/dev/null 2>&1 && python3 -c 'import http.server' 2>/dev/null; then
  python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
elif command -v ruby >/dev/null 2>&1; then
  ruby -run -e httpd . -p $PORT -b 127.0.0.1 >/dev/null 2>&1 &
else
  echo "需要 python3 或 ruby 来起本地服务器（可运行 xcode-select --install 安装）"
  exit 1
fi
SERVER=$!
trap 'kill $SERVER 2>/dev/null; echo; echo "演示已停止"' EXIT
trap 'exit 0' INT TERM
for _ in $(seq 1 20); do
  curl -fs "http://127.0.0.1:$PORT/demo.html" -o /dev/null && break
  sleep 0.3
done

URL="http://127.0.0.1:$PORT/demo.html"
echo "打开 $URL （滚轮缩放、拖动平移、双击复位；按 Ctrl+C 结束）"
if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi
wait $SERVER
