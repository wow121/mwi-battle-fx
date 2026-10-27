#!/usr/bin/env python3
"""Pins assets/manifest.json to a commit: usage pin-manifest.py <rev>

rev  = the commit the art is loaded from (jsDelivr @<rev>, or the mirror at <rev>)
revs = {commit: [paths under assets/]}: each file's own last commit, so its url stays the same until the file
       itself changes and the browser's cache keeps it across pins (a pin used to give every file a new url)
"""
import json, subprocess, sys

rev = sys.argv[1]
p = "assets/manifest.json"
m = json.load(open(p))
m["rev"] = rev
log = subprocess.run(["git", "log", "--format=@%H", "--name-only", "--no-renames", "HEAD", "--", "assets"],
                     capture_output=True, text=True, check=True).stdout
tracked = set(subprocess.run(["git", "ls-files", "assets"], capture_output=True, text=True, check=True).stdout.split())
seen, revs, cur = set(), {}, None
for line in log.splitlines():
    if line.startswith("@"):
        cur = line[1:11]
    elif line and line not in seen and line in tracked and line != p:
        seen.add(line)
        revs.setdefault(cur, []).append(line[len("assets/"):])
m["revs"] = revs
json.dump(m, open(p, "w"), separators=(",", ":"))
print(f"pinned to {rev}: {len(seen)} files at {len(revs)} commits")
