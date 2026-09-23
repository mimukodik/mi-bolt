#!/bin/bash
# Scope-and-failure watch for one coder-agent runner, for the Monitor tool.
#
# Archived from the 2026-09-20 session. See README.md in this directory: this
# is a reference artifact, not maintained tooling.
#
# Emits only what the orchestrator would act on, and ends when the runner does:
#   - a tool result carrying "is_error":true
#   - a refused permission
#   - BUILD FAILED, ERROR in, "N failed", "Error: …"
#   - every four minutes, any path in the runner's tree the brief did not list
#
# Usage: watch-runner-scope.sh <runner-name> <session-id> <allow-regex> [repo]
#
# All paths are derived: the runner's working directory comes from
# `coder-agent.sh status --json`, and the Claude transcript slug is that
# directory with every "/" replaced by "-", which is how Claude Code names a
# project directory under ~/.claude/projects/.
set -u

NAME="${1:?runner name required}"
SID="${2:?session id required}"
ALLOW="${3:?allow-regex required}"
REPO="${4:-$(git rev-parse --show-toplevel)}"

CA="$REPO/scripts/coder-agent/coder-agent.sh"

status_json() { "$CA" status "$NAME" --json 2>/dev/null; }

read_field() {
  python3 -c 'import json,sys
try: print(json.load(sys.stdin)["'"$1"'"])
except Exception: print("")' 2>/dev/null
}

WT=$(status_json | read_field dir)
[ -n "$WT" ] || { echo "[$NAME] cannot resolve runner directory"; exit 1; }

SLUG=$(printf '%s' "$WT" | tr '/' '-')
T="$HOME/.claude/projects/$SLUG/$SID.jsonl"

# Start at the transcript's current end. A re-arm, or a `resume` turn, would
# otherwise replay every failure the previous turns already reported.
POS=0
[ -f "$T" ] && POS=$(wc -l < "$T" | tr -d ' ')
N=0

while :; do
  ST=$(status_json | read_field status)
  [ -z "$ST" ] && ST=gone

  if [ -f "$T" ]; then
    NEW=$(wc -l < "$T" | tr -d ' ')
    if [ "$NEW" -gt "$POS" ]; then
      # Only tool results carry real command output. The launch-time context
      # block quotes `BUILD FAILED` out of .claude/rules/orchestrated-coding.md,
      # and a brief may quote a failure string of its own, so scanning every
      # line fires on every runner for nothing.
      sed -n "$((POS + 1)),${NEW}p" "$T" \
        | grep '"toolUseResult"' \
        | grep -oE '"is_error":true|Permission to use [A-Za-z]+|requested permissions|BUILD FAILED|ERROR in |[0-9]+ failed|Error: [A-Za-z ]{0,40}' \
        | sort -u | sed "s|^|[$NAME] |"
      POS=$NEW
    fi
  fi

  N=$((N + 1))
  if [ $((N % 4)) -eq 0 ]; then
    git -C "$WT" status --short 2>/dev/null | awk '{print $NF}' \
      | grep -vE "$ALLOW" | sed "s|^|[$NAME] unlisted path: |"
  fi

  if [ "$ST" != "running" ]; then
    echo "[$NAME] watch ending, status: $ST"
    break
  fi
  sleep 60
done
