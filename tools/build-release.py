#!/usr/bin/env python3
"""Writes the release userscript (release/mwi-battle-fx.user.js) from the developer copy.

usage: build-release.py        (run from anywhere; tools/publish.sh runs it before every commit)

Markers in mwi-battle-fx.user.js, as `//` or `/* */` comments:
  ... // #dev                 the whole line is dropped
  #dev-start / #dev-end       the lines between are dropped
  #release-start / #release-end
                              the lines between are commented out in the dev copy ("// ..."); the release
                              copy uncomments them
`const DEV = true` becomes false. The header gets the release name and namespace, and loses the update URLs
(Greasy Fork rules) and the grants / connects only developer features use.
"""
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
SRC = REPO / "mwi-battle-fx.user.js"
OUT = REPO / "release" / "mwi-battle-fx.user.js"
DESC = (
    "银河奶牛放置：把战斗区域换成杀戮尖塔式的侧视舞台（游戏原版角色形象、AI 生成的怪物立绘与地点背景，"
    "攻击、技能特效、弹道、受击、暴击、阵亡），支持普通战斗、地下城、迷宫和公会试炼（全员阵型，可缩放）。"
    "右上角按钮随时切回原版。生活技能有浮动小窗动画（采集、生产、强化、炼金，仓库取料、稀有掉落、加成信息），"
    "公会生活试炼与迷宫生活房间也有专属动画。不改游戏数据，只读游戏消息；立绘从素材 CDN 加载。"
)

DESC_EN = (
    "Milky Way Idle: turns the battle area into a Slay-the-Spire-style side-view stage (your in-game look, AI-drawn monsters "
    "and zone backdrops; attacks, skill effects, projectiles, hits, crits, deaths) for ordinary zones, dungeons, the Labyrinth "
    "and Guild Trials (whole roster in formation, zoomable). A corner button switches back to the original view. Skilling gets a "
    "floating animated window (gathering, crafting, enhancing, alchemy; storage, rare drops, bonus info) and its own scenes for "
    "guild skilling trials and labyrinth skilling rooms. Read-only: "
    "it only listens to game messages and never changes game data; art loads from a CDN."
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
    head = re.sub(r"^// @name .*$", "// @name         牛牛动起来", head, flags=re.M)
    head = re.sub(r"^// @namespace .*$", "// @namespace    mwi-battle-fx-release", head, flags=re.M)
    head = re.sub(r"^// @description .*$", "// @description  " + DESC + "\n// @description:en  " + DESC_EN, head, flags=re.M)
    head = re.sub(r"^(// @name +.*)$", r"\1\n// @name:en      MWI Alive", head, count=1, flags=re.M)
    # no update URLs: Greasy Fork (which syncs this file) serves its own and forbids pointing users elsewhere;
    # a copy installed from GitHub keeps updating from the address it was installed from
    head = re.sub(r"^// @(updateURL|downloadURL)\s.*\n", "", head, flags=re.M)
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
