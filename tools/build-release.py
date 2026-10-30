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


# ----- comments: the release leaves out the lines that hold only a comment (about a sixth of the script; the dev copy
# keeps them). A comment is found by a small JavaScript scanner, not by the look of a line: strings, template literals
# (their ${...} parts scanned as code) and regular expressions are stepped over, so a "//" inside them is never taken
# for one. Indentation and everything else stay as they are (Greasy Fork does not allow minified code).
KEYWORDS_BEFORE_REGEX = {"return", "typeof", "case", "in", "of", "new", "delete", "void", "throw", "instanceof", "do", "else", "yield", "await"}


def comment_spans(src: str):
    """(start, end) of every // and /* */ comment in src"""
    spans = []
    n = len(src)
    prev = ""  # the last significant token: a punctuator character, or "id" / a keyword, or "val" for a literal

    def skip_string(i, q):
        i += 1
        while i < n and src[i] != q:
            i += 2 if src[i] == "\\" else 1
        return i + 1

    def skip_regex(i):
        i += 1
        cls = False
        while i < n:
            c = src[i]
            if c == "\\":
                i += 2
                continue
            if c == "[":
                cls = True
            elif c == "]":
                cls = False
            elif c == "/" and not cls:
                i += 1
                break
            elif c == "\n":
                raise ValueError(f"unterminated regex at {i}")
            i += 1
        while i < n and (src[i].isalnum() or src[i] == "_"):
            i += 1
        return i

    def scan(i, until_brace):
        nonlocal prev
        depth = 0
        while i < n:
            c = src[i]
            if c in " \t\r\n":
                i += 1
            elif src.startswith("//", i):
                j = src.find("\n", i)
                j = n if j < 0 else j
                spans.append((i, j))
                i = j
            elif src.startswith("/*", i):
                j = src.find("*/", i + 2)
                if j < 0:
                    raise ValueError(f"unterminated comment at {i}")
                spans.append((i, j + 2))
                i = j + 2
            elif c in "'\"":
                i = skip_string(i, c)
                prev = "val"
            elif c == "`":
                i += 1
                while i < n and src[i] != "`":
                    if src[i] == "\\":
                        i += 2
                    elif src.startswith("${", i):
                        prev = "("
                        i = scan(i + 2, True)
                    else:
                        i += 1
                i += 1
                prev = "val"
            elif c == "/":
                if prev in ("", "val", "id", ")", "]", "}"):
                    i += 1
                    prev = "/"
                else:
                    i = skip_regex(i)
                    prev = "val"
            elif c.isalnum() or c in "_$":
                j = i
                while j < n and (src[j].isalnum() or src[j] in "_$"):
                    j += 1
                word = src[i:j]
                prev = "kw" if word in KEYWORDS_BEFORE_REGEX else ("val" if word[0].isdigit() else "id")
                i = j
            else:
                if c == "{":
                    depth += 1
                elif c == "}":
                    if until_brace and depth == 0:
                        return i + 1
                    depth -= 1
                prev = c
                i += 1
        return i

    scan(0, False)
    return spans


def drop_comment_lines(text: str) -> str:
    """the lines that hold nothing but a comment, left out (the userscript header kept)"""
    body_at = text.index("// ==/UserScript==") + len("// ==/UserScript==")
    drop = set()
    for a, b in comment_spans(text):
        if a < body_at:
            continue
        ls = text.rfind("\n", 0, a) + 1
        if text[ls:a].strip():
            continue  # code before it on its line: kept
        le = text.find("\n", b)
        le = len(text) if le < 0 else le
        if text[b:le].strip():
            continue  # code after it on its line
        first = text.count("\n", 0, ls)
        drop.update(range(first, first + text.count("\n", ls, le) + 1))
    return "\n".join(l for k, l in enumerate(text.split("\n")) if k not in drop)


def main():
    text = drop_comment_lines(build(SRC.read_text(encoding="utf-8")))
    for word in ("__mwiBattleFx", "cfg.debug", "const Lab = (() =>", "GM_setClipboard("):
        if word in text:
            sys.exit(f"release still contains {word!r}")
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"{OUT.relative_to(REPO)}: {len(text.splitlines())} lines (dev {len(SRC.read_text(encoding='utf-8').splitlines())})")


if __name__ == "__main__":
    main()
