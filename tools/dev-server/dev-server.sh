#!/usr/bin/env bash
set -u

STATE_DIR="${DEV_SERVER_STATE_DIR:-${TMPDIR:-/tmp}/mi-bolt-dev-server}"
START_TIMEOUT="${DEV_SERVER_START_TIMEOUT:-180}"

usage() {
  echo "usage: dev-server.sh start <port> -- <command> [args...]" >&2
  echo "       dev-server.sh stop <port>" >&2
  echo "       dev-server.sh status <port>" >&2
  exit 64
}

is_port_number() {
  case "$1" in
    ''|*[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

port_probe() {
  node -e "const s=require('node:net').connect({port:Number(process.argv[1]),host:'localhost',timeout:1000});s.on('connect',()=>{s.destroy();process.exit(0)});s.on('timeout',()=>{s.destroy();process.exit(1)});s.on('error',()=>process.exit(1))" "$1"
}

pid_file() {
  echo "$STATE_DIR/$1.pid"
}

log_file() {
  echo "$STATE_DIR/$1.log"
}

start_time() {
  ps -o lstart= -p "$1" 2>/dev/null
}

# Prints the pid when the pid file still names the process this script
# started: same pid and same start time. A reused or dead pid fails.
owned_pid() {
  local line pid recorded current
  line="$(head -n 1 "$1" 2>/dev/null)"
  pid="${line%% *}"
  recorded="${line#* }"
  is_port_number "$pid" || return 1
  [ "$recorded" != "$line" ] || return 1
  current="$(start_time "$pid")"
  [ -n "$current" ] && [ "$current" = "$recorded" ] || return 1
  echo "$pid"
}

stop_process_group() {
  local pid="$1"
  local port="$2"

  kill -TERM -- "-$pid" 2>/dev/null

  local elapsed=0
  while [ "$elapsed" -lt 20 ]; do
    if ! kill -0 -- "-$pid" 2>/dev/null && ! port_probe "$port"; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  if kill -0 -- "-$pid" 2>/dev/null; then
    kill -KILL -- "-$pid" 2>/dev/null
    local killed_elapsed=0
    while [ "$killed_elapsed" -lt 5 ]; do
      if ! kill -0 -- "-$pid" 2>/dev/null; then
        return 0
      fi
      sleep 1
      killed_elapsed=$((killed_elapsed + 1))
    done
  fi

  return 0
}

cmd_start() {
  local port="$1"
  shift
  is_port_number "$port" || usage
  [ "$#" -ge 1 ] || usage
  [ "$1" = "--" ] || usage
  shift
  [ "$#" -ge 1 ] || usage

  mkdir -p "$STATE_DIR"
  local pf lf
  pf="$(pid_file "$port")"
  lf="$(log_file "$port")"

  if [ -f "$pf" ]; then
    local existing_pid
    if existing_pid="$(owned_pid "$pf")"; then
      echo "port $port is already managed by this script (pid $existing_pid)" >&2
      exit 3
    fi
    rm -f "$pf"
  fi

  if port_probe "$port"; then
    echo "port $port is in use by a process this script did not start; refusing" >&2
    exit 4
  fi

  set -m
  "$@" </dev/null >"$lf" 2>&1 &
  local pid=$!

  printf '%s %s\n' "$pid" "$(start_time "$pid")" > "$pf"

  local elapsed=0
  while :; do
    if port_probe "$port"; then
      echo "started $port pid $pid log $lf"
      exit 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "command exited before listening on port $port; last log lines:" >&2
      tail -n 20 "$lf" >&2
      rm -f "$pf"
      exit 5
    fi
    if [ "$elapsed" -ge "$START_TIMEOUT" ]; then
      stop_process_group "$pid" "$port"
      rm -f "$pf"
      echo "port $port did not start listening within $START_TIMEOUT seconds" >&2
      exit 6
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
}

cmd_stop() {
  local port="$1"
  is_port_number "$port" || usage

  local pf
  pf="$(pid_file "$port")"

  if [ ! -f "$pf" ]; then
    echo "no pid file for port $port: this script did not start it; nothing was killed" >&2
    exit 2
  fi

  local pid
  if ! pid="$(owned_pid "$pf")"; then
    rm -f "$pf"
    if port_probe "$port"; then
      echo "port $port is in use by a process this script did not start (stale pid file removed); nothing was killed" >&2
      exit 7
    fi
    echo "stopped $port"
    exit 0
  fi

  stop_process_group "$pid" "$port"

  rm -f "$pf"

  if port_probe "$port"; then
    echo "port $port is still in use after stop" >&2
    exit 7
  fi

  echo "stopped $port"
  exit 0
}

cmd_status() {
  local port="$1"
  is_port_number "$port" || usage

  local pf
  pf="$(pid_file "$port")"

  if [ -f "$pf" ]; then
    local pid
    if pid="$(owned_pid "$pf")"; then
      echo "running $port pid $pid"
      exit 0
    fi
    rm -f "$pf"
  fi

  echo "stopped $port"
  exit 1
}

[ "$#" -ge 1 ] || usage
command="$1"
shift

case "$command" in
  start)
    [ "$#" -ge 1 ] || usage
    cmd_start "$@"
    ;;
  stop)
    [ "$#" -eq 1 ] || usage
    cmd_stop "$1"
    ;;
  status)
    [ "$#" -eq 1 ] || usage
    cmd_status "$1"
    ;;
  *)
    usage
    ;;
esac
