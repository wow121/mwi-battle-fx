#!/usr/bin/env python3
"""Writes the release userscript (release/mwi-battle-fx.user.js) from the developer copy.

usage: build-release.py        (run from anywhere; tools/publish.sh runs it before every commit)

Markers in mwi-battle-fx.user.js, as `//` or `/* */` comments:
  ... // #dev                 the whole line is dropped
  #dev-start / #dev-end       the lines between are dropped
  #release-start / #release-end
                              the lines between are commented out in the dev copy ("// ..."); the release
                              copy uncomments them
`const DEV = true` becomes false. The header gets the release name, namespace and update URLs, and loses the
grants / connects only developer features use.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "mwi-battle-fx.user.js"
OUT = REPO / "release" / "mwi-battle-fx.user.js"
URL = "https://raw.githubusercontent.com/wow121/mwi-battle-fx/main/release/mwi-battle-fx.user.js"
DESC = (
    "银河奶牛放置：把战斗区域换成杀戮尖塔式的侧视舞台（游戏原版角色形象、AI 生成的怪物立绘与地点背景，"
    "攻击、技能特效、弹道、受击、暴击、阵亡），右上角按钮随时切回原版。不改游戏数据，只读游戏消息；立绘从素材 CDN 加载。"
)

MARK = re.compile(r"^\s*(?://|/\*)\s*#(dev-start|dev-end|release-start|release-end)\s*(?:\*/)?(.*)$")


def build(src: str) -> str:
    out, skip, release = [], False, False
    for line in src.split("\n"):
        m = MARK.match(line)
        if m:
            kind, rest = m.groups()
            skip = kind == "dev-start" if kind.startswith("dev") else skip
            release = kind == "release-start" if kind.startswith("release") else release
            if rest.strip():  # e.g. a closing backtick after the marker
                out.append(rest)
            continue
        if skip or line.rstrip().endswith("// #dev"):
            continue
        if release:
            line = re.sub(r"^(\s*)// ?", r"\1", line, count=1)
        out.append(line)
    if skip or release:
        sys.exit("unclosed #dev / #release block")
    text = "\n".join(out)
    text, n = re.subn(r"^(\s*)const DEV = true$", r"\1const DEV = false", text, count=1, flags=re.M)
    if n != 1:
        sys.exit("no `const DEV = true` line")

    head, sep, body = text.partition("// ==/UserScript==")
    head = re.sub(r"^// @name .*$", "// @name         MWI 战斗动画", head, flags=re.M)
    head = re.sub(r"^// @namespace .*$", "// @namespace    mwi-battle-fx-release", head, flags=re.M)
    head = re.sub(r"^// @description .*$", "// @description  " + DESC, head, flags=re.M)
    head = re.sub(r"^// @(updateURL|downloadURL)(\s+).*$", lambda m: f"// @{m[1]}{m[2]}{URL}", head, flags=re.M)
    head = re.sub(r"^// @grant\s+GM_setClipboard\n", "", head, flags=re.M)
    head = re.sub(r"^// @connect\s+\*\n", "", head, flags=re.M)
    return head + sep + body


def main():
    text = build(SRC.read_text(encoding="utf-8"))
    for word in ("__mwiBattleFx", "cfg.debug", "const Lab = (() =>", "GM_setClipboard("):
        if word in text:
            sys.exit(f"release still contains {word!r}")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"{OUT.relative_to(REPO)}: {len(text.splitlines())} lines (dev {len(SRC.read_text(encoding='utf-8').splitlines())})")


if __name__ == "__main__":
    main()
