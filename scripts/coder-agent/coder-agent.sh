#!/usr/bin/env bash
#
# coder-agent.sh - start, resume and manage detached `claude -p` coder sessions.
#
# Every session runs in the background under its own process group. Its state
# lives in $CODER_AGENT_HOME/sessions/<name>/, where $CODER_AGENT_HOME defaults
# to the directory this script is in (scripts/coder-agent/):
#
#   meta                key=value session metadata (dir, session_id, ...)
#   session.pid         pid of the runner while the session is running
#   claude.pid          pid of the current child (pre-command or claude)
#   claude.args         extra `claude -p` arguments, one per line
#   pre.cmd / pre.log   pre-commands (run once, before the first turn) and log
#   pre.exit            exit code of the pre-commands
#   turns/NNN/          one directory per turn:
#     prompt.txt        the prompt fed to claude on stdin
#     events.jsonl      claude --output-format stream-json output
#     stderr.log        claude stderr
#     exit              exit code, written when the turn ends
#     stopped           present when the turn was ended by `stop`
#     hung / timeout    present when the watchdog ended the turn
#
# stdout carries machine-readable output (JSON, one object per line);
# everything meant for a human goes to stderr. `watch` is the one command
# written for a human reader. Run with --help for usage.

set -euo pipefail

# ---------------------------------------------------------------------------
# Environment for the `claude -p` process
#
# CLAUDE_ENV is filled from a .env file next to this script (override the path
# with CODER_AGENT_ENV_FILE) right before claude starts, in the runner. The
# variables reach the claude process only, not the pre-commands and not this
# script. The file is never sourced: it is parsed line by line, one variable
# per line, in the usual dotenv format:
#
#   # comment
#   ANTHROPIC_MODEL=claude-sonnet-5
#   SOME_TOOL_TOKEN="value with spaces"
#   export OTHER_TOKEN='single quotes work too'
#
# No variable expansion, no multi-line values. A malformed line stops the turn
# before claude starts (status failed, the line number in stderr.log, never the
# line itself).
# ---------------------------------------------------------------------------
CLAUDE_ENV=()
ENV_FILE=${CODER_AGENT_ENV_FILE:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/.env}

# Watchdog: how often the runner checks the child (seconds) and how long it
# waits between SIGTERM and SIGKILL when it has to end the child.
WATCH_INTERVAL=1
KILL_GRACE=10

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SCRIPT_PATH=$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")
STATE_HOME=${CODER_AGENT_HOME:-$SCRIPT_DIR}
SESSIONS_DIR=$STATE_HOME/sessions
CLAUDE_PROJECTS=${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects

# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

log()  { printf '%s\n' "$*" >&2; }
die()  { log "coder-agent: $1"; exit "${2:-1}"; }
need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }
now()  { date -u +%Y-%m-%dT%H:%M:%SZ; }
arg()  { [[ $# -ge 2 ]] || die "option $1 needs a value"; }
uint() { [[ $2 =~ ^[0-9]+$ ]] || die "option $1 needs a whole number of seconds, got: $2"; }

load_env_file() { # file -> appends KEY=value entries to CLAUDE_ENV; 1 on a malformed line
  local file=$1 line key val n=0
  [[ -f $file ]] || return 0
  while IFS= read -r line || [[ -n $line ]]; do
    n=$((n + 1))
    line=${line#"${line%%[![:space:]]*}"}
    [[ -z $line || $line == \#* ]] && continue
    [[ $line == export\ * ]] && line=${line#export }
    line=${line#"${line%%[![:space:]]*}"}
    if [[ $line != *=* ]]; then log "$file: line $n is not KEY=value"; return 1; fi
    key=${line%%=*}
    val=${line#*=}
    key=${key%"${key##*[![:space:]]}"}
    if [[ ! $key =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then log "$file: line $n has an invalid variable name"; return 1; fi
    if [[ ${#val} -ge 2 && ( $val == \"*\" || $val == \'*\' ) ]]; then
      val=${val:1:$(( ${#val} - 2 ))}
    else
      val=${val%"${val##*[![:space:]]}"}
    fi
    CLAUDE_ENV+=("$key=$val")
  done < "$file"
}

usage() {
  cat <<'EOF'
coder-agent.sh - run and manage detached, non-interactive `claude -p` sessions

USAGE
  coder-agent.sh start  [--name NAME] (--dir DIR | --worktree NAME [--repo DIR] [--branch B] [--base REF] [--worktree-dir DIR])
                        [--pre CMD]... [--idle-timeout SEC] [--max-time SEC]
                        (--prompt TEXT | --prompt-file FILE) [--wait] [-- CLAUDE_ARGS...]
  coder-agent.sh resume NAME [--idle-timeout SEC] [--max-time SEC]
                        (--prompt TEXT | --prompt-file FILE) [--wait] [-- CLAUDE_ARGS...]
  coder-agent.sh list   [--running] [--json]
  coder-agent.sh status NAME [--json]
  coder-agent.sh wait   NAME [--timeout SEC]
  coder-agent.sh watch-status NAME|SESSION_ID [--follow] [--timeout SEC] [--interval SEC]
  coder-agent.sh result NAME [--turn N] [--json]
  coder-agent.sh logs   NAME [--turn N] [--follow] [--stderr | --pre]
  coder-agent.sh watch  NAME|SESSION_ID [--no-history]          (for humans)
  coder-agent.sh stop   NAME [--force] [--timeout SEC]
  coder-agent.sh rm     NAME [--force] [--worktree]
  coder-agent.sh help | --help | -h

COMMANDS
  start    Create a session and run its first turn in the background.
           --name NAME        session name (default: agent-<timestamp>)
           --dir DIR          run claude in an existing directory (default: cwd)
           --worktree NAME    create a git worktree and run claude in it
           --repo DIR         repository the worktree is created from (default: cwd)
           --branch B         branch for the worktree; created from --base when it
                              does not exist yet (default: the worktree name)
           --base REF         start point for a new branch (default: HEAD)
           --worktree-dir DIR where worktrees are created
                              (default: <repo>/.worktrees, added to .git/info/exclude)
           --pre CMD          command run inside the directory before the first
                              turn, e.g. --pre 'npm install'; repeatable, run in
                              order, a failing one aborts the session (pre-failed)
           --idle-timeout SEC watchdog: end the turn with status `hung` when the
                              child's output (pre.log, then events.jsonl) has not
                              grown for SEC seconds. A long tool call emits no
                              stream event, so it counts as idle: size it for the
                              longest command the coder may run.
           --max-time SEC     watchdog: end the turn with status `timeout` SEC
                              seconds after the turn started (pre-commands included)
                              Both watchdog values are stored with the session and
                              apply to every later turn; off when not given.
           --prompt TEXT      the prompt
           --prompt-file FILE read the prompt from FILE ('-' for stdin); with
                              neither option a piped stdin is used as the prompt
           --wait             block until the turn ends, then print its result
           -- CLAUDE_ARGS     everything after -- is passed to `claude -p` on
                              every turn of the session (see EXAMPLES)
           Prints the session descriptor as one JSON line.

  resume   Run one more turn in an existing, not running session
           (`claude -p --resume <session_id>`). Arguments after -- replace the
           stored CLAUDE_ARGS, --idle-timeout / --max-time replace the stored
           watchdog values, for this and later turns.

  list     List sessions: NAME STATUS TURNS PID SESSION_ID DIR.
           --running only sessions with a live pid; --json for a JSON array.

  status   Show one session; --json prints the descriptor object.

  wait     Block until the session is not running, print the result object of
           the last turn (JSON) and exit with claude's exit code.
           --timeout SEC gives up with exit code 124.

  watch-status
           FOR SCRIPTS AND LLM DRIVERS. Prints one JSON line per event and
           blocks in between: first {"event":"snapshot"} with the current
           descriptor, then {"event":"change","changed":[fields]} whenever any
           descriptor field changes (status, phase, turns, exit_code, pid, ...),
           each carrying the full descriptor under "session". Without --follow
           it exits 0 after the first change; with --follow it keeps going and
           exits 0 once the session is no longer running (at once, when it is
           not running at the start). --timeout SEC prints {"event":"timeout"}
           and exits 124; --interval SEC sets the poll interval (default 1).
           Takes a session name or the session id of a session started here.

  result   Print the final text of a turn (default: the last one); --json prints
           the whole result object (is_error, total_cost_usd, num_turns, ...).
           Exits 1 when the result has is_error: true.

  logs     Print a turn's events.jsonl; --follow tails it while running;
           --stderr shows claude's stderr; --pre shows the pre-command log.

  watch    FOR HUMANS, not for scripts. Follows a session live from Claude's
           own transcript (~/.claude/projects/<dir>/<session_id>.jsonl): one
           block per prompt, reply, thinking, tool call and tool result, with
           the full text (nothing is truncated; a multi-line value is indented
           under its header line). Subagents are picked up as their transcripts
           appear under <session_id>/subagents/; their lines carry a ┃ gutter
           and the agent name after the timestamp. Takes a session name or a
           raw session id, so any Claude session can be watched, not only one
           started here. --no-history skips what is already in the transcript.
           With a name it ends when the session ends; with a raw id, stop it
           with Ctrl-C.

  stop     Send SIGTERM to the session (--force: SIGKILL) and wait up to
           --timeout SEC (default 30) for it to end.

  rm       Delete the session state; --force stops a running session first;
           --worktree also removes a worktree that `start --worktree` created
           (the branch is kept).

STATUS VALUES
  running     the runner process is alive
  done        the last turn ended with exit code 0
  failed      the last turn ended with a non-zero exit code
  stopped     the last turn was ended by `stop` (during a --pre command or claude)
  hung        the watchdog ended the turn: no output for --idle-timeout seconds
  timeout     the watchdog ended the turn: --max-time seconds elapsed
  pre-failed  a --pre command failed; claude did not run
  crashed     a pid file is left behind but the process is gone

EXIT CODES
  0 ok, 1 usage or general error, 2 session or result not found,
  3 wrong session state (running / not running), 124 wait timeout;
  `wait` and `start --wait` exit with claude's own exit code.

ENVIRONMENT
  CODER_AGENT_HOME      state directory; sessions live in $CODER_AGENT_HOME/sessions/
                        (default: the directory of this script)
  CODER_AGENT_ENV_FILE  dotenv file whose variables are given to the claude
                        process, and only to it (default: .env next to this
                        script; skipped when missing). Format: KEY=value, one
                        per line, optional quotes or `export`, # comments.

EXAMPLES
  coder-agent.sh start --name t1 --dir ~/proj --prompt 'Fix the failing tests' \
      --idle-timeout 900 --max-time 7200 -- --permission-mode acceptEdits --max-budget-usd 5
  coder-agent.sh start --name t2 --worktree feat-x --repo ~/proj --pre 'pnpm install' \
      --prompt-file task.md -- --dangerously-skip-permissions
  cat task.md | coder-agent.sh start --name t3 --dir ~/proj --wait
  coder-agent.sh resume t1 --prompt 'Now add a changelog entry' --wait
  coder-agent.sh list --json | jq '.[] | select(.status=="running")'
  coder-agent.sh result t1
  coder-agent.sh watch t2
  coder-agent.sh watch-status t1 --follow --timeout 3600
  coder-agent.sh stop t2
EOF
}

session_dir() { printf '%s/%s' "$SESSIONS_DIR" "$1"; }

valid_name() { [[ $1 =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; }

is_uuid() { [[ $1 =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; }

require_session() {
  valid_name "$1" || die "invalid session name: $1"
  [[ -d $(session_dir "$1") ]] || die "no such session: $1" 2
}

meta_get() { # dir key
  local f=$1/meta
  [[ -f $f ]] || return 0
  sed -n "s/^$2=//p" "$f" | tail -n 1
}

meta_set() { # dir key value
  local f=$1/meta tmp
  tmp=$(mktemp "$1/.meta.XXXXXX")
  {
    if [[ -f $f ]]; then grep -v "^$2=" "$f" || true; fi
    printf '%s=%s\n' "$2" "$3"
  } > "$tmp"
  mv "$tmp" "$f"
}

read_pid() { # file
  if [[ -s $1 ]]; then tr -d '[:space:]' < "$1"; fi
}

pid_alive() { [[ -n ${1:-} ]] && kill -0 "$1" 2>/dev/null; }

runner_pid() { read_pid "$1/session.pid"; }

session_running() { # dir
  local p
  p=$(runner_pid "$1")
  pid_alive "$p"
}

turn_count() { # dir
  local n=0
  if [[ -d $1/turns ]]; then
    n=$(find "$1/turns" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')
  fi
  printf '%s' "$n"
}

turn_id() { printf '%03d' "$1"; }

last_turn() { turn_id "$(turn_count "$1")"; }

session_status() { # dir
  local d=$1 t rc m
  if session_running "$d"; then printf 'running'; return; fi
  t=$(last_turn "$d")
  if [[ $t == 000 ]]; then printf 'new'; return; fi
  for m in stopped hung timeout; do
    if [[ -f $d/turns/$t/$m ]]; then printf '%s' "$m"; return; fi
  done
  if [[ -f $d/pre.exit && $(cat "$d/pre.exit") != 0 ]]; then printf 'pre-failed'; return; fi
  if [[ -f $d/turns/$t/exit ]]; then
    rc=$(cat "$d/turns/$t/exit")
    if [[ $rc == 0 ]]; then printf 'done'; else printf 'failed'; fi
    return
  fi
  printf 'crashed'
}

last_exit() { # dir
  local t
  t=$(last_turn "$1")
  if [[ -f $1/turns/$t/exit ]]; then cat "$1/turns/$t/exit"; fi
}

emit_session() { # dir -> one JSON line
  local d=$1
  jq -cn \
    --arg name "$(basename "$d")" \
    --arg status "$(session_status "$d")" \
    --arg phase "$(meta_get "$d" phase)" \
    --arg pid "$(runner_pid "$d")" \
    --arg turns "$(turn_count "$d")" \
    --arg exit "$(last_exit "$d")" \
    --arg sid "$(meta_get "$d" session_id)" \
    --arg dir "$(meta_get "$d" dir)" \
    --arg worktree "$(meta_get "$d" worktree)" \
    --arg branch "$(meta_get "$d" branch)" \
    --arg idle "$(meta_get "$d" idle_timeout)" \
    --arg max "$(meta_get "$d" max_time)" \
    --arg created "$(meta_get "$d" created)" \
    --arg state "$d" \
    '{
      name: $name, status: $status, phase: $phase,
      pid: (if $pid == "" then null else ($pid | tonumber) end),
      turns: ($turns | tonumber),
      exit_code: (if $exit == "" then null else ($exit | tonumber) end),
      session_id: $sid, dir: $dir,
      worktree: (if $worktree == "" then null else $worktree end),
      branch: (if $branch == "" then null else $branch end),
      idle_timeout: (if $idle == "" or $idle == "0" then null else ($idle | tonumber) end),
      max_time: (if $max == "" or $max == "0" then null else ($max | tonumber) end),
      created: $created, state_dir: $state
    }'
}

write_prompt() { # target prompt prompt_file
  local target=$1 prompt=$2 file=$3
  if [[ -n $prompt ]]; then
    printf '%s\n' "$prompt" > "$target"
  elif [[ -n $file ]]; then
    if [[ $file == - ]]; then
      cat > "$target"
    else
      [[ -f $file ]] || die "prompt file not found: $file"
      cp "$file" "$target"
    fi
  elif [[ ! -t 0 ]]; then
    cat > "$target"
  else
    die "no prompt given: use --prompt, --prompt-file, or pipe it on stdin"
  fi
  [[ -s $target ]] || die "the prompt is empty"
}

store_args() { # dir args...
  local d=$1; shift
  : > "$d/claude.args"
  if [[ $# -gt 0 ]]; then printf '%s\n' "$@" > "$d/claude.args"; fi
}

new_turn() { # dir -> turn id, creates the directory
  local d=$1 t
  t=$(turn_id "$(( $(turn_count "$d") + 1 ))")
  mkdir -p "$d/turns/$t"
  printf '%s' "$t"
}

launch() { # name turn
  local d pid
  d=$(session_dir "$1")
  now > "$d/turns/$2/started"
  meta_set "$d" phase pending
  # set -m puts the runner in its own process group, so a Ctrl-C in the
  # terminal that started it (e.g. during --wait) does not reach claude.
  set -m
  nohup bash "$SCRIPT_PATH" __run "$1" "$2" </dev/null >"$d/runner.log" 2>&1 &
  pid=$!
  set +m
  disown "$pid" 2>/dev/null || true
  printf '%s\n' "$pid" > "$d/session.pid"
}

create_worktree() { # repo name branch base wtdir -> prints the worktree path
  local repo=$1 name=$2 branch=$3 base=$4 wtdir=$5 common path exclude
  need git
  repo=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) || die "not a git repository: $1"
  if [[ -z $wtdir ]]; then
    wtdir=$repo/.worktrees
    common=$(git -C "$repo" rev-parse --path-format=absolute --git-common-dir)
    exclude=$common/info/exclude
    mkdir -p "$common/info"
    grep -qx '.worktrees/' "$exclude" 2>/dev/null || printf '.worktrees/\n' >> "$exclude"
  fi
  path=$wtdir/$name
  [[ -e $path ]] && die "worktree path already exists: $path"
  mkdir -p "$wtdir"
  if git -C "$repo" show-ref --verify --quiet "refs/heads/$branch"; then
    git -C "$repo" worktree add "$path" "$branch" >&2
  else
    git -C "$repo" worktree add -b "$branch" "$path" "${base:-HEAD}" >&2
  fi
  printf '%s' "$(cd "$path" && pwd)"
}

# ---------------------------------------------------------------------------
# the background runner (invoked as: coder-agent.sh __run NAME TURN)
# ---------------------------------------------------------------------------

run_turn() {
  local name=$1 turn=$2 d td dir sid cmd a
  local child=0 stopped=0 rc=0 reason="" idle_timeout max_time turn_start
  local args=() mode=()
  d=$(session_dir "$name")
  td=$d/turns/$turn
  turn_start=$(date +%s)
  idle_timeout=$(meta_get "$d" idle_timeout); idle_timeout=${idle_timeout:-0}
  max_time=$(meta_get "$d" max_time); max_time=${max_time:-0}

  on_term() {
    stopped=1
    if [[ $child -gt 0 ]]; then kill -TERM "$child" 2>/dev/null || true; fi
  }
  trap on_term TERM HUP

  finish() {
    printf '%s\n' "$rc" > "$td/exit"
    if [[ $stopped == 1 ]]; then : > "$td/stopped"; fi
    if [[ -n $reason ]]; then : > "$td/$reason"; fi
    now > "$td/finished"
    meta_set "$d" phase idle
    rm -f "$d/claude.pid" "$d/session.pid"
  }

  kill_child() {
    local i=0
    kill -TERM "$child" 2>/dev/null || true
    while kill -0 "$child" 2>/dev/null && [[ $i -lt $KILL_GRACE ]]; do sleep 1; i=$((i + 1)); done
    if kill -0 "$child" 2>/dev/null; then kill -KILL "$child" 2>/dev/null || true; fi
  }

  run_child() { # stdin-file watched-output-file command...; sets rc and reason
    # the explicit stdin redirection matters: without it a background job in
    # a non-interactive shell gets /dev/null as stdin
    local in=$1 out=$2 last_size=-1 size idle_since now_s
    shift 2
    "$@" <"$in" &
    child=$!
    printf '%s\n' "$child" > "$d/claude.pid"
    idle_since=$(date +%s)
    while kill -0 "$child" 2>/dev/null; do
      sleep "$WATCH_INTERVAL"
      now_s=$(date +%s)
      size=$( { wc -c < "$out" 2>/dev/null || echo 0; } | tr -d ' ')
      if [[ $size != "$last_size" ]]; then last_size=$size; idle_since=$now_s; fi
      if [[ $idle_timeout -gt 0 && $(( now_s - idle_since )) -ge $idle_timeout ]]; then
        reason=hung; kill_child; break
      fi
      if [[ $max_time -gt 0 && $(( now_s - turn_start )) -ge $max_time ]]; then
        reason=timeout; kill_child; break
      fi
    done
    rc=0
    wait "$child" || rc=$?
    child=0
  }

  printf '%s\n' "$$" > "$d/session.pid"
  dir=$(meta_get "$d" dir)
  if ! cd "$dir" 2>/dev/null; then
    rc=1
    printf 'cannot cd to %s\n' "$dir" > "$td/stderr.log"
    finish
    return 0
  fi

  if [[ $turn == 001 && -s $d/pre.cmd ]]; then
    meta_set "$d" phase pre
    while IFS= read -r cmd || [[ -n $cmd ]]; do
      [[ -z $cmd ]] && continue
      printf '$ %s\n' "$cmd" >> "$d/pre.log"
      run_child /dev/null "$d/pre.log" bash -c "$cmd" >>"$d/pre.log" 2>&1
      if [[ $rc != 0 || $stopped == 1 || -n $reason ]]; then
        printf '%s\n' "$rc" > "$d/pre.exit"
        finish
        return 0
      fi
    done < "$d/pre.cmd"
    printf '0\n' > "$d/pre.exit"
  fi

  if [[ -s $d/claude.args ]]; then
    while IFS= read -r a || [[ -n $a ]]; do args+=("$a"); done < "$d/claude.args"
  fi
  sid=$(meta_get "$d" session_id)
  if [[ $turn == 001 ]]; then mode=(--session-id "$sid"); else mode=(--resume "$sid"); fi

  if ! load_env_file "$ENV_FILE" 2>>"$td/stderr.log"; then
    rc=1
    finish
    return 0
  fi

  meta_set "$d" phase claude
  run_child "$td/prompt.txt" "$td/events.jsonl" env ${CLAUDE_ENV[@]+"${CLAUDE_ENV[@]}"} \
    claude -p --output-format stream-json --verbose "${mode[@]}" ${args[@]+"${args[@]}"} \
    >"$td/events.jsonl" 2>"$td/stderr.log"
  finish
}

# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------

cmd_start() {
  local name="" dir="" wt="" repo="" branch="" base="" wtdir="" wait_flag=0
  local prompt="" prompt_file="" idle="" maxt="" d t tmp sid
  local pre=() cargs=()
  while [[ $# -gt 0 ]]; do
    case $1 in
      --name|-n)        arg "$@"; name=$2; shift 2 ;;
      --dir|-d)         arg "$@"; dir=$2; shift 2 ;;
      --worktree|-w)    arg "$@"; wt=$2; shift 2 ;;
      --repo)           arg "$@"; repo=$2; shift 2 ;;
      --branch|-b)      arg "$@"; branch=$2; shift 2 ;;
      --base)           arg "$@"; base=$2; shift 2 ;;
      --worktree-dir)   arg "$@"; wtdir=$2; shift 2 ;;
      --pre)            arg "$@"; pre+=("$2"); shift 2 ;;
      --idle-timeout)   arg "$@"; uint "$1" "$2"; idle=$2; shift 2 ;;
      --max-time)       arg "$@"; uint "$1" "$2"; maxt=$2; shift 2 ;;
      --prompt|-m)      arg "$@"; prompt=$2; shift 2 ;;
      --prompt-file|-f) arg "$@"; prompt_file=$2; shift 2 ;;
      --wait)           wait_flag=1; shift ;;
      --)               shift; cargs=("$@"); break ;;
      -h|--help)        usage; exit 0 ;;
      *)                die "start: unknown option: $1" ;;
    esac
  done

  need claude; need jq
  [[ -z $name ]] && name=agent-$(date +%Y%m%d-%H%M%S)
  valid_name "$name" || die "invalid session name: $name (allowed: letters, digits, . _ -)"
  d=$(session_dir "$name")
  [[ -e $d ]] && die "session already exists: $name" 3
  [[ -n $dir && -n $wt ]] && die "use either --dir or --worktree, not both"
  [[ -z $wt && ( -n $repo || -n $branch || -n $base || -n $wtdir ) ]] \
    && die "--repo, --branch, --base and --worktree-dir need --worktree"

  tmp=$(mktemp "${TMPDIR:-/tmp}/coder-agent.XXXXXX")
  write_prompt "$tmp" "$prompt" "$prompt_file"

  if [[ -n $wt ]]; then
    dir=$(create_worktree "${repo:-$PWD}" "$wt" "${branch:-$wt}" "$base" "$wtdir")
  else
    dir=${dir:-$PWD}
    [[ -d $dir ]] || die "directory not found: $dir"
    dir=$(cd "$dir" && pwd)
  fi

  sid=$(uuidgen | tr 'A-Z' 'a-z')
  mkdir -p "$d"
  meta_set "$d" name "$name"
  meta_set "$d" created "$(now)"
  meta_set "$d" dir "$dir"
  meta_set "$d" session_id "$sid"
  meta_set "$d" phase pending
  [[ -n $idle ]] && meta_set "$d" idle_timeout "$idle"
  [[ -n $maxt ]] && meta_set "$d" max_time "$maxt"
  if [[ -n $wt ]]; then
    meta_set "$d" worktree "$dir"
    meta_set "$d" branch "${branch:-$wt}"
    meta_set "$d" repo "$(git -C "${repo:-$PWD}" rev-parse --show-toplevel)"
    meta_set "$d" worktree_created 1
  fi
  store_args "$d" ${cargs[@]+"${cargs[@]}"}
  if [[ ${#pre[@]} -gt 0 ]]; then printf '%s\n' "${pre[@]}" > "$d/pre.cmd"; fi
  t=$(new_turn "$d")
  mv "$tmp" "$d/turns/$t/prompt.txt"

  launch "$name" "$t"
  emit_session "$d"
  if [[ $wait_flag == 1 ]]; then cmd_wait "$name"; fi
}

cmd_resume() {
  local name="" prompt="" prompt_file="" idle="" maxt="" wait_flag=0 d t tmp
  local cargs=() have_cargs=0
  [[ $# -gt 0 && $1 != -* ]] && { name=$1; shift; }
  while [[ $# -gt 0 ]]; do
    case $1 in
      --prompt|-m)      arg "$@"; prompt=$2; shift 2 ;;
      --prompt-file|-f) arg "$@"; prompt_file=$2; shift 2 ;;
      --idle-timeout)   arg "$@"; uint "$1" "$2"; idle=$2; shift 2 ;;
      --max-time)       arg "$@"; uint "$1" "$2"; maxt=$2; shift 2 ;;
      --wait)           wait_flag=1; shift ;;
      --)               shift; cargs=("$@"); have_cargs=1; break ;;
      -h|--help)        usage; exit 0 ;;
      *)                die "resume: unknown option: $1" ;;
    esac
  done
  [[ -n $name ]] || die "resume: session name required"
  need claude; need jq
  require_session "$name"
  d=$(session_dir "$name")
  session_running "$d" && die "session is running: $name (stop it or wait first)" 3
  [[ -f $d/pre.exit && $(cat "$d/pre.exit") != 0 ]] \
    && die "session $name is pre-failed; its pre-commands never succeeded (see: logs $name --pre)" 3

  tmp=$(mktemp "${TMPDIR:-/tmp}/coder-agent.XXXXXX")
  write_prompt "$tmp" "$prompt" "$prompt_file"
  if [[ $have_cargs == 1 ]]; then store_args "$d" ${cargs[@]+"${cargs[@]}"}; fi
  [[ -n $idle ]] && meta_set "$d" idle_timeout "$idle"
  [[ -n $maxt ]] && meta_set "$d" max_time "$maxt"
  t=$(new_turn "$d")
  mv "$tmp" "$d/turns/$t/prompt.txt"

  launch "$name" "$t"
  emit_session "$d"
  if [[ $wait_flag == 1 ]]; then cmd_wait "$name"; fi
}

cmd_list() {
  local json=0 running=0 d
  local rows=()
  while [[ $# -gt 0 ]]; do
    case $1 in
      --json)    json=1; shift ;;
      --running) running=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *)         die "list: unknown option: $1" ;;
    esac
  done
  need jq
  for d in "$SESSIONS_DIR"/*/; do
    [[ -d $d ]] || continue
    d=${d%/}
    if [[ $running == 1 ]] && ! session_running "$d"; then continue; fi
    rows+=("$(emit_session "$d")")
  done
  if [[ $json == 1 ]]; then
    if [[ ${#rows[@]} -eq 0 ]]; then printf '[]\n'; else printf '%s\n' "${rows[@]}" | jq -s .; fi
    return
  fi
  if [[ ${#rows[@]} -eq 0 ]]; then log "no sessions"; return; fi
  {
    printf 'NAME\tSTATUS\tTURNS\tPID\tSESSION_ID\tDIR\n'
    printf '%s\n' "${rows[@]}" \
      | jq -r '[.name, .status, .turns, (.pid // "-"), .session_id, .dir] | @tsv'
  } | column -t -s "$(printf '\t')"
}

cmd_status() {
  local name="" json=0 d
  [[ $# -gt 0 && $1 != -* ]] && { name=$1; shift; }
  while [[ $# -gt 0 ]]; do
    case $1 in
      --json)    json=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *)         die "status: unknown option: $1" ;;
    esac
  done
  [[ -n $name ]] || die "status: session name required"
  need jq
  require_session "$name"
  d=$(session_dir "$name")
  if [[ $json == 1 ]]; then emit_session "$d"
  else emit_session "$d" | jq -r 'to_entries[] | "\(.key)=\(.value // "")"'
  fi
}

cmd_wait() {
  local name="" timeout="" d t deadline=0 rc res st
  [[ $# -gt 0 && $1 != -* ]] && { name=$1; shift; }
  while [[ $# -gt 0 ]]; do
    case $1 in
      --timeout) arg "$@"; uint "$1" "$2"; timeout=$2; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *)         die "wait: unknown option: $1" ;;
    esac
  done
  [[ -n $name ]] || die "wait: session name required"
  need jq
  require_session "$name"
  d=$(session_dir "$name")
  [[ -n $timeout ]] && deadline=$(( $(date +%s) + timeout ))
  while session_running "$d"; do
    if [[ $deadline -gt 0 && $(date +%s) -ge $deadline ]]; then
      die "timeout after ${timeout}s waiting for $name" 124
    fi
    sleep 1
  done
  t=$(last_turn "$d")
  st=$(session_status "$d")
  if [[ -f $d/pre.exit && $(cat "$d/pre.exit") != 0 ]]; then
    log "pre-commands ended with status $st (exit $(cat "$d/pre.exit")); last lines of pre.log:"
    tail -n 20 "$d/pre.log" >&2
    exit "$(cat "$d/pre.exit")"
  fi
  [[ -f $d/turns/$t/exit ]] || die "session $name is not running and left no exit code (crashed?); see $d/runner.log" 2
  rc=$(cat "$d/turns/$t/exit")
  res=$(jq -c 'select(.type == "result")' "$d/turns/$t/events.jsonl" 2>/dev/null | tail -n 1 || true)
  if [[ -n $res ]]; then
    printf '%s\n' "$res"
  else
    log "turn $t ended without a result event (status: $st, exit $rc); stderr:"
    tail -n 20 "$d/turns/$t/stderr.log" >&2 2>/dev/null || true
  fi
  exit "$rc"
}

cmd_watch_status() {
  local name="" follow=0 timeout="" interval=1 d sid prev cur changed deadline=0
  [[ $# -gt 0 && $1 != -* ]] && { name=$1; shift; }
  while [[ $# -gt 0 ]]; do
    case $1 in
      --follow)   follow=1; shift ;;
      --timeout)  arg "$@"; uint "$1" "$2"; timeout=$2; shift 2 ;;
      --interval) arg "$@"; uint "$1" "$2"; [[ $2 -ge 1 ]] || die "--interval needs at least 1"; interval=$2; shift 2 ;;
      -h|--help)  usage; exit 0 ;;
      *)          die "watch-status: unknown option: $1" ;;
    esac
  done
  [[ -n $name ]] || die "watch-status: session name or session id required"
  need jq
  if is_uuid "$name"; then
    sid=$(printf '%s' "$name" | tr 'A-F' 'a-f'); name=""
    for d in "$SESSIONS_DIR"/*/; do
      [[ -d $d ]] || continue
      if [[ $(meta_get "${d%/}" session_id) == "$sid" ]]; then name=$(basename "${d%/}"); break; fi
    done
    [[ -n $name ]] || die "no session started here has session_id $sid" 2
  fi
  require_session "$name"
  d=$(session_dir "$name")
  [[ -n $timeout ]] && deadline=$(( $(date +%s) + timeout ))
  prev=$(emit_session "$d")
  jq -cn --arg at "$(now)" --argjson s "$prev" '{event: "snapshot", at: $at, changed: [], session: $s}'
  if [[ $follow == 1 ]] && ! session_running "$d"; then return 0; fi
  while :; do
    if [[ $deadline -gt 0 && $(date +%s) -ge $deadline ]]; then
      jq -cn --arg at "$(now)" --argjson s "$prev" '{event: "timeout", at: $at, changed: [], session: $s}'
      exit 124
    fi
    sleep "$interval"
    [[ -d $d ]] || die "session was removed: $name" 2
    cur=$(emit_session "$d")
    if [[ $cur != "$prev" ]]; then
      changed=$(jq -cn --argjson a "$prev" --argjson b "$cur" '[$b | to_entries[] | select(.value != $a[.key]) | .key]')
      jq -cn --arg at "$(now)" --argjson c "$changed" --argjson s "$cur" '{event: "change", at: $at, changed: $c, session: $s}'
      prev=$cur
      if [[ $follow == 0 ]]; then return 0; fi
      if ! session_running "$d"; then return 0; fi
    fi
  done
}

cmd_result() {
  local name="" turn="" json=0 d t res
  [[ $# -gt 0 && $1 != -* ]] && { name=$1; shift; }
  while [[ $# -gt 0 ]]; do
    case $1 in
      --turn)    arg "$@"; turn=$2; shift 2 ;;
      --json)    json=1; shift ;;
      -h|--help) usage; exit 0 ;;
      *)         die "result: unknown option: $1" ;;
    esac
  done
  [[ -n $name ]] || die "result: session name required"
  need jq
  require_session "$name"
  d=$(session_dir "$name")
  if [[ -n $turn ]]; then t=$(turn_id "$turn"); else t=$(last_turn "$d"); fi
  [[ -f $d/turns/$t/events.jsonl ]] || die "turn $t has no output" 2
  res=$(jq -c 'select(.type == "result")' "$d/turns/$t/events.jsonl" 2>/dev/null | tail -n 1 || true)
  [[ -n $res ]] || die "turn $t has no result yet (running, stopped or failed early; see: logs $name --stderr)" 2
  if [[ $json == 1 ]]; then printf '%s\n' "$res"
  else printf '%s' "$res" | jq -r '.result // ""'
  fi
  # an error result (budget exceeded, resume failure, ...) is not a success
  [[ $(printf '%s' "$res" | jq -r '.is_error') != true ]]
}

cmd_logs() {
  local name="" turn="" follow=0 which=events d t f
  [[ $# -gt 0 && $1 != -* ]] && { name=$1; shift; }
  while [[ $# -gt 0 ]]; do
    case $1 in
      --turn)    arg "$@"; turn=$2; shift 2 ;;
      --follow|-f) follow=1; shift ;;
      --stderr)  which=stderr; shift ;;
      --pre)     which=pre; shift ;;
      -h|--help) usage; exit 0 ;;
      *)         die "logs: unknown option: $1" ;;
    esac
  done
  [[ -n $name ]] || die "logs: session name required"
  require_session "$name"
  d=$(session_dir "$name")
  if [[ -n $turn ]]; then t=$(turn_id "$turn"); else t=$(last_turn "$d"); fi
  case $which in
    events) f=$d/turns/$t/events.jsonl ;;
    stderr) f=$d/turns/$t/stderr.log ;;
    pre)    f=$d/pre.log ;;
  esac
  [[ -f $f ]] || die "no such log: $f" 2
  if [[ $follow == 1 ]]; then tail -n +1 -f "$f"; else cat "$f"; fi
}

# jq program that turns one transcript record into human lines. $pfx follows
# the timestamp on every line of a subagent record, $ind opens every
# continuation line of a multi-line value. Nothing is truncated.
WATCH_JQ=$(cat <<'EOF'
def ts: (.timestamp // "") | if length >= 19 then .[11:19] else "--:--:--" end;
def txt:
  if type == "string" then .
  elif type == "array" then (map(if type == "object" then (.text // (if .type == "image" then "[image]" else tojson end)) else tostring end) | join("\n"))
  elif . == null then ""
  else tojson end;
def block: split("\n") | map($ind + .) | join("\n");
def show($lead; $head; $body):
  ($body | txt) as $b |
  if $b == "" then $lead + $head
  elif (($b | test("\n")) | not) and (($b | length) <= 120) then $lead + $head + " " + $b
  else $lead + $head + "\n" + ($b | block) end;
def diff($old; $new):
  (($old | txt | split("\n") | map("- " + .)) + ($new | txt | split("\n") | map("+ " + .))) | join("\n");
def tool_use($lead):
  .name as $n | (.input // {}) as $i |
  if $n == "Bash" then show($lead; "🔧 Bash ▶ " + ($i.description // ""); $i.command // "")
  elif $n == "Read" then show($lead; "📖 Read ▶ " + ($i.file_path // "") + (if $i.offset then " (from line \($i.offset))" else "" end); "")
  elif $n == "Edit" then show($lead; "✏️ Edit ▶ " + ($i.file_path // ""); diff($i.old_string // ""; $i.new_string // ""))
  elif $n == "Write" then show($lead; "📝 Write ▶ " + ($i.file_path // ""); $i.content // "")
  elif $n == "Grep" then show($lead; "🔍 Grep ▶ " + ($i.pattern // "") + (if $i.path then " in " + $i.path else "" end); "")
  elif $n == "Glob" then show($lead; "🗂️ Glob ▶ " + ($i.pattern // "") + (if $i.path then " in " + $i.path else "" end); "")
  elif $n == "Agent" then show($lead; "🤖 Agent ▶ " + ($i.subagent_type // "general-purpose") + ": " + ($i.description // ""); $i.prompt // "")
  elif $n == "WebFetch" then show($lead; "🌐 WebFetch ▶ " + ($i.url // ""); $i.prompt // "")
  elif $n == "WebSearch" then show($lead; "🌐 WebSearch ▶ " + ($i.query // ""); "")
  elif $n == "Skill" then show($lead; "🎯 Skill ▶ " + ($i.skill // ""); $i.args // "")
  elif $n == "AskUserQuestion" then show($lead; "❓ AskUserQuestion"; (($i.questions // []) | map((.question // "") + "\n" + ((.options // []) | map("  • " + (.label // "")) | join("\n"))) | join("\n")))
  elif ($n | test("^Task")) then show($lead; "📋 " + $n + " ▶ " + (($i.subject // $i.taskId // "") | tostring); (if ($i.subject // $i.taskId) then ($i.description // "") else ($i | tojson) end))
  elif ($n | test("^mcp__")) then show($lead; "🔌 " + $n; ($i | tojson))
  else show($lead; "🧰 " + $n; ($i | tojson)) end;
def tool_result($lead): show($lead; (if .is_error then "❌ error" else "↩️ result" end); (.content // ""));
(ts + " " + $pfx) as $lead |
if .type == "user" and ((.isMeta // false) | not) then
  (.message.content // "") as $c |
  if ($c | type) == "string" then show($lead; "🧑 prompt"; $c)
  else $c[] | (if .type == "tool_result" then tool_result($lead)
               elif .type == "text" then show($lead; "🧑 prompt"; (.text // ""))
               else empty end)
  end
elif .type == "assistant" then
  (.message.content // [])[] |
  (if .type == "text" then show($lead; "💬"; (.text // ""))
   elif .type == "thinking" then (if ((.thinking // "") | length) > 0 then show($lead; "🤔 thinking"; .thinking) else empty end)
   elif .type == "tool_use" then tool_use($lead)
   else empty end)
elif .type == "system" then
  (if ((.content // "") | tostring) == "" then empty else show($lead; "⚙️ system"; .content) end)
else empty end
EOF
)

subagent_field() { # transcript file, field -> value from its .meta.json, or empty
  local meta=${1%.jsonl}.meta.json
  [[ -f $meta ]] || return 0
  jq -r --arg f "$2" '.[$f] // ""' "$meta" 2>/dev/null || true
}

cmd_watch() {
  local target="" history=1 name="" d="" sid main sub_dir f i count known aname adesc quiet
  local files=() lines=() pfxs=() inds=()
  [[ $# -gt 0 && $1 != -* ]] && { target=$1; shift; }
  while [[ $# -gt 0 ]]; do
    case $1 in
      --no-history) history=0; shift ;;
      -h|--help)    usage; exit 0 ;;
      *)            die "watch: unknown option: $1" ;;
    esac
  done
  [[ -n $target ]] || die "watch: session name or session id required"
  need jq
  if is_uuid "$target"; then
    sid=$(printf '%s' "$target" | tr 'A-F' 'a-f')
  else
    require_session "$target"
    name=$target
    d=$(session_dir "$name")
    sid=$(meta_get "$d" session_id)
  fi

  count_lines() { wc -l < "$1" | tr -d ' '; }
  add_file() { # file pfx ind
    files+=("$1"); pfxs+=("$2"); inds+=("$3")
    if [[ $history == 1 ]]; then lines+=(0); else lines+=("$(count_lines "$1")"); fi
  }
  render() { # file from to pfx ind
    sed -n "$2,$3p" "$1" | jq -r --arg pfx "$4" --arg ind "$5" "$WATCH_JQ" 2>/dev/null || true
  }

  main=""
  while [[ -z $main ]]; do
    main=$(find "$CLAUDE_PROJECTS" -mindepth 2 -maxdepth 2 -name "$sid.jsonl" 2>/dev/null | head -n 1)
    [[ -n $main ]] && break
    if [[ -n $name ]] && ! session_running "$d"; then
      die "no transcript for $sid under $CLAUDE_PROJECTS and session $name is not running" 2
    fi
    [[ -n $name ]] || die "no transcript for $sid under $CLAUDE_PROJECTS" 2
    log "⏳ waiting for the transcript of $sid ..."
    sleep 1
  done
  sub_dir=${main%.jsonl}/subagents
  log "👀 watching $main"
  add_file "$main" "" "         "

  while :; do
    quiet=1
    for f in "$sub_dir"/agent-*.jsonl; do
      [[ -f $f ]] || continue
      known=0
      for i in "${!files[@]}"; do [[ ${files[$i]} == "$f" ]] && known=1; done
      [[ $known == 1 ]] && continue
      aname=$(subagent_field "$f" name)
      [[ -n $aname ]] || aname=$(subagent_field "$f" agentType)
      if [[ -z $aname ]]; then aname=$(basename "$f" .jsonl); aname=${aname#agent-}; fi
      adesc=$(subagent_field "$f" description)
      printf '%s ┃ 🧵 %s started%s\n' "$(date +%H:%M:%S)" "$aname" "${adesc:+: $adesc}"
      add_file "$f" "┃ 🧵 $aname ▸ " "         ┃    "
    done
    history=1
    for i in "${!files[@]}"; do
      count=$(count_lines "${files[$i]}")
      if [[ $count -gt ${lines[$i]} ]]; then
        render "${files[$i]}" "$(( ${lines[$i]} + 1 ))" "$count" "${pfxs[$i]}" "${inds[$i]}"
        lines[$i]=$count
        quiet=0
      fi
    done
    if [[ -n $name && $quiet == 1 ]] && ! session_running "$d"; then
      printf '🏁 %s: %s (exit %s)\n' "$name" "$(session_status "$d")" "$(last_exit "$d")"
      return 0
    fi
    sleep 1
  done
}

cmd_stop() {
  local name="" force=0 timeout=30 d runner child waited=0 t
  [[ $# -gt 0 && $1 != -* ]] && { name=$1; shift; }
  while [[ $# -gt 0 ]]; do
    case $1 in
      --force)   force=1; shift ;;
      --timeout) arg "$@"; uint "$1" "$2"; timeout=$2; shift 2 ;;
      -h|--help) usage; exit 0 ;;
      *)         die "stop: unknown option: $1" ;;
    esac
  done
  [[ -n $name ]] || die "stop: session name required"
  need jq
  require_session "$name"
  d=$(session_dir "$name")
  session_running "$d" || die "session is not running: $name" 3
  runner=$(runner_pid "$d")
  child=$(read_pid "$d/claude.pid")
  if [[ $force == 1 ]]; then
    pid_alive "$child" && kill -KILL "$child" 2>/dev/null || true
    kill -KILL "$runner" 2>/dev/null || true
  else
    kill -TERM "$runner" 2>/dev/null || true
  fi
  while pid_alive "$runner" && [[ $waited -lt $timeout ]]; do sleep 1; waited=$((waited + 1)); done
  if pid_alive "$runner"; then die "session $name is still running after ${timeout}s; use --force" 3; fi
  if [[ $force == 1 ]]; then
    # a killed runner cannot record its own end
    t=$(last_turn "$d")
    [[ -f $d/turns/$t/exit ]] || printf '137\n' > "$d/turns/$t/exit"
    : > "$d/turns/$t/stopped"
    meta_set "$d" phase idle
    rm -f "$d/claude.pid" "$d/session.pid"
  fi
  emit_session "$d"
}

cmd_rm() {
  local name="" force=0 worktree=0 d wt repo
  [[ $# -gt 0 && $1 != -* ]] && { name=$1; shift; }
  while [[ $# -gt 0 ]]; do
    case $1 in
      --force)    force=1; shift ;;
      --worktree) worktree=1; shift ;;
      -h|--help)  usage; exit 0 ;;
      *)          die "rm: unknown option: $1" ;;
    esac
  done
  [[ -n $name ]] || die "rm: session name required"
  require_session "$name"
  d=$(session_dir "$name")
  if session_running "$d"; then
    [[ $force == 1 ]] || die "session is running: $name (use --force)" 3
    cmd_stop "$name" --force >/dev/null
  fi
  if [[ $worktree == 1 && $(meta_get "$d" worktree_created) == 1 ]]; then
    wt=$(meta_get "$d" worktree)
    repo=$(meta_get "$d" repo)
    if [[ -d $wt ]]; then git -C "$repo" worktree remove --force "$wt" >&2; fi
  fi
  rm -rf "$d"
  log "removed session $name"
}

# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------

main() {
  [[ $# -gt 0 ]] || { usage >&2; exit 1; }
  local cmd=$1; shift
  mkdir -p "$SESSIONS_DIR"
  case $cmd in
    start)   cmd_start "$@" ;;
    resume)  cmd_resume "$@" ;;
    list|ls) cmd_list "$@" ;;
    status)  cmd_status "$@" ;;
    wait)    cmd_wait "$@" ;;
    result)  cmd_result "$@" ;;
    logs)    cmd_logs "$@" ;;
    watch)   cmd_watch "$@" ;;
    watch-status) cmd_watch_status "$@" ;;
    stop)    cmd_stop "$@" ;;
    rm)      cmd_rm "$@" ;;
    __run)   run_turn "$@" ;;
    help|-h|--help) usage ;;
    *)       die "unknown command: $cmd (see --help)" ;;
  esac
}

main "$@"
