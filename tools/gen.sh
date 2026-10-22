#!/usr/bin/env bash
# Runs Codex image jobs from make-jobs.py.  usage: gen.sh <raw_dir> <jobs.tsv> [parallel=2]
# Skips jobs whose sheet already exists, so it can be re-run after failures.
set -u
RAW=$1
JOBS=$2
PAR=${3:-2}
mkdir -p "$RAW/sheets" "$RAW/logs"

one() {
  local name=$1 prompt=$2 refs=$3
  local out="$RAW/sheets/$name.png" log="$RAW/logs/$name.log"
  [ -s "$out" ] && return 0
  # references are comma-separated; each gets its own -i
  local args=() r
  IFS=, read -ra list <<<"$refs"
  for r in "${list[@]}"; do args+=(-i "$r"); done
  for try in 1 2; do
    timeout 900 codex exec --skip-git-repo-check "${args[@]}" - <"$prompt" >"$log" 2>&1
    local path
    path=$(grep -oE '/[^ ]*/generated_images/[^ ]*\.png' "$log" | tail -1)
    if [ -n "$path" ] && [ -s "$path" ]; then
      cp "$path" "$out"
      echo "ok   $name"
      return 0
    fi
  done
  echo "FAIL $name (see $log)"
}
export -f one
export RAW
# whole lines, split on tabs (the refs column may be empty)
cut -f1-3 "$JOBS" | xargs -d '\n' -P "$PAR" -I{} bash -c 'IFS=$'"'"'\t'"'"' read -r n p r <<<"$1"; one "$n" "$p" "$r"' _ {}
echo "done $(ls "$RAW/sheets" | wc -l) sheets"
