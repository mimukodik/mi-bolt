#!/usr/bin/env bash
# Demo-stack launcher for the MiBolt application: starts the local PostgreSQL
# container, builds and starts the backend, then clones the frontend from git,
# installs, builds, and serves it with a proxy to the backend. One command
# from a clean machine to a running shop, payment app and API.
#
# Usage: ./scripts/demo-stack.sh [start|stop|status]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${APP_DIR}"

# Defaults overridable through the environment.
FRONTEND_REPO="${MIBOLT_FRONTEND_REPO:-https://github.com/mimukodik/mi-bolt.git}"
FRONTEND_REF="${MIBOLT_FRONTEND_REF:-main}"
FRONTEND_DIR_OVERRIDE="${MIBOLT_FRONTEND_DIR:-}"
BACKEND_PORT="${MIBOLT_BACKEND_PORT:-8080}"
FRONTEND_PORT="${MIBOLT_FRONTEND_PORT:-4200}"
PAYMENT_PORT="${MIBOLT_PAYMENT_PORT:-4210}"
SKIP_BUILD="${MIBOLT_SKIP_BUILD:-0}"

STATE_DIR="${TMPDIR:-/tmp}/mi-bolt-demo-stack"
BACKEND_LOG="${STATE_DIR}/backend.log"
FRONTEND_LOG="${STATE_DIR}/frontend.log"
PAYMENT_LOG="${STATE_DIR}/payment.log"
BACKEND_PID_FILE="${STATE_DIR}/backend.pid"
FRONTEND_PID_FILE="${STATE_DIR}/frontend.pid"
PAYMENT_PID_FILE="${STATE_DIR}/payment.pid"

BACKEND_JAR="build/libs/mi-bolt-backend-0.0.1-SNAPSHOT.jar"

# FRONTEND_DIR is set by frontend_clone_or_update; other functions read it
# from this global.
FRONTEND_DIR=""

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

usage() {
  cat << 'USAGE_EOF'
Usage: ./scripts/demo-stack.sh [COMMAND]

Starts the whole MiBolt stack (database, backend, shop, payment app) from a clean
machine, or stops it.

Commands:
  start (default)   Start the database, backend, shop and payment app; print URLs.
  stop              Stop the backend, shop and payment app processes and the database.
  status            Print whether each of the four is up.

Environment overrides (defaults shown):
  MIBOLT_FRONTEND_REPO   https://github.com/mimukodik/mi-bolt.git
  MIBOLT_FRONTEND_REF    main
  MIBOLT_FRONTEND_DIR    (unset; a fresh mktemp directory is used)
                         Set to a fixed path to reuse a clone across runs.
  MIBOLT_BACKEND_PORT    8080
  MIBOLT_FRONTEND_PORT   4200
  MIBOLT_PAYMENT_PORT    4210  (the demo payment app's own origin)
  MIBOLT_SKIP_BUILD      0   (set to 1 to reuse an existing bootJar)

'start' leaves the database volume and the frontend clone on disk. 'stop'
stops the payment app, shop and backend processes started by 'start' and the
database container; it does not delete the clone or the database volume.
Use './scripts/local-database-docker.sh reset --yes' to wipe the database.
USAGE_EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

is_alive() {
  local pid="$1"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

http_status() {
  curl -s -o /dev/null -w '%{http_code}' "$@"
}

# wait_for_http <expected_code> <url> <timeout_seconds> <dot_message?>
wait_for_http() {
  local expect="$1" url="$2" timeout="$3" dots="${4:-}"
  local elapsed=0 status
  while [ "$elapsed" -le "$timeout" ]; do
    status=$(http_status "$url" || true)
    if [ "$status" = "$expect" ]; then
      return 0
    fi
    [ -n "$dots" ] && printf '.'
    sleep 2
    elapsed=$((elapsed + 2))
  done
  return 1
}

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------

preflight() {
  local missing=() bin
  for bin in docker java node npm git curl; do
    if ! command -v "$bin" >/dev/null 2>&1; then
      missing+=("$bin")
    fi
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "Error: missing required commands on PATH: ${missing[*]}" >&2
    echo "Install hint (macOS, Homebrew): brew install ${missing[*]}" >&2
    echo "For java, install openjdk@21 (or any JDK 21 build)." >&2
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

start_database() {
  echo "==> Starting local PostgreSQL database..."
  ./scripts/local-database-docker.sh start
}

# ---------------------------------------------------------------------------
# Backend
# ---------------------------------------------------------------------------

start_backend() {
  mkdir -p "${STATE_DIR}"
  : > "${BACKEND_LOG}"
  if [ "${SKIP_BUILD}" = "1" ] && [ -f "${BACKEND_JAR}" ]; then
    echo "==> Skipping build (MIBOLT_SKIP_BUILD=1); reusing ${BACKEND_JAR}"
  else
    echo "==> Building backend (./gradlew bootJar)..."
    ./gradlew bootJar
  fi
  echo "==> Starting backend on port ${BACKEND_PORT}..."
  SERVER_PORT="${BACKEND_PORT}" \
    MIBOLT_PAYMENT_REDIRECT_URL_PREFIX="http://localhost:${PAYMENT_PORT}/demo-fizetes/" \
    MIBOLT_PAYMENT_RETURN_URL_PREFIX="http://localhost:${FRONTEND_PORT}/penztar?paymentIntentId=" \
    java -jar "${BACKEND_JAR}" >> "${BACKEND_LOG}" 2>&1 &
  local pid=$!
  echo "$pid" > "${BACKEND_PID_FILE}"
  echo "    pid ${pid}, log ${BACKEND_LOG}"
  printf '    waiting for backend'
  if wait_for_http 200 "http://localhost:${BACKEND_PORT}/api/v1/products?pageSize=12" 120 "."; then
    echo " ready"
  else
    echo
    echo "Error: backend did not become ready within 120 s. Last 40 lines of ${BACKEND_LOG}:" >&2
    tail -n 40 "${BACKEND_LOG}" >&2 || true
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

frontend_clone_or_update() {
  if [ -z "${FRONTEND_DIR_OVERRIDE}" ]; then
    FRONTEND_DIR=$(mktemp -d "${TMPDIR:-/tmp}/mi-bolt-frontend.XXXXXX")
    echo "==> Cloning frontend (${FRONTEND_REPO} @ ${FRONTEND_REF}) into ${FRONTEND_DIR}..."
    git clone --branch "${FRONTEND_REF}" "${FRONTEND_REPO}" "${FRONTEND_DIR}"
  elif [ -d "${FRONTEND_DIR_OVERRIDE}/.git" ]; then
    FRONTEND_DIR="${FRONTEND_DIR_OVERRIDE}"
    echo "==> Updating frontend clone in ${FRONTEND_DIR}..."
    git -C "${FRONTEND_DIR}" fetch origin "${FRONTEND_REF}"
    git -C "${FRONTEND_DIR}" checkout -f "${FRONTEND_REF}"
    git -C "${FRONTEND_DIR}" pull --ff-only
  elif [ -d "${FRONTEND_DIR_OVERRIDE}" ] && [ -n "$(ls -A "${FRONTEND_DIR_OVERRIDE}" 2>/dev/null)" ]; then
    die "MIBOLT_FRONTEND_DIR=${FRONTEND_DIR_OVERRIDE} exists but is not empty and has no .git; refusing to clobber it. Remove it or point MIBOLT_FRONTEND_DIR elsewhere."
  else
    FRONTEND_DIR="${FRONTEND_DIR_OVERRIDE}"
    mkdir -p "${FRONTEND_DIR}"
    echo "==> Cloning frontend (${FRONTEND_REPO} @ ${FRONTEND_REF}) into ${FRONTEND_DIR}..."
    git clone --branch "${FRONTEND_REF}" "${FRONTEND_REPO}" "${FRONTEND_DIR}"
  fi
}

frontend_install_and_build() {
  echo "==> npm ci in ${FRONTEND_DIR}..."
  (cd "${FRONTEND_DIR}" && npm ci)
  echo "==> Building shop (ng build --configuration local-backend)..."
  (cd "${FRONTEND_DIR}" && npx ng build --configuration local-backend)
  echo "==> Building payment app (npm run build:payment)..."
  (cd "${FRONTEND_DIR}" && npm run build:payment)
}

frontend_engine_check() {
  local pkg="${FRONTEND_DIR}/package.json" spec major node_major
  [ -f "$pkg" ] || return 0
  spec=$(grep -E '"node"[[:space:]]*:' "$pkg" | head -n 1 \
    | sed -E 's/.*"node"[[:space:]]*:[[:space:]]*"?([^",}]+).*/\1/') || return 0
  [ -n "$spec" ] || return 0
  major=$(printf '%s' "$spec" | sed -E 's/[^0-9]*([0-9]+).*/\1/')
  node_major=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
  if [ -n "$major" ] && [ -n "$node_major" ] && [ "$node_major" -lt "$major" ]; then
    echo "Warning: node major ${node_major} is below engines.node in package.json (\"${spec}\")" >&2
  fi
}

start_frontend() {
  mkdir -p "${STATE_DIR}"
  : > "${FRONTEND_LOG}"
  frontend_clone_or_update
  frontend_engine_check
  frontend_install_and_build
  echo "==> Starting static server on port ${FRONTEND_PORT}..."
  (
    cd "${FRONTEND_DIR}"
    exec env \
      MI_BOLT_API_PROXY="http://localhost:${BACKEND_PORT}" \
      PORT="${FRONTEND_PORT}" \
      node scripts/serve-static.mjs
  ) >> "${FRONTEND_LOG}" 2>&1 &
  local pid=$!
  echo "$pid" > "${FRONTEND_PID_FILE}"
  echo "    pid ${pid}, log ${FRONTEND_LOG}"
  printf '    waiting for frontend'
  if wait_for_http 200 "http://127.0.0.1:${FRONTEND_PORT}/" 30 "."; then
    echo " ready"
  else
    echo
    echo "Error: frontend did not become ready within 30 s. Last 40 lines of ${FRONTEND_LOG}:" >&2
    tail -n 40 "${FRONTEND_LOG}" >&2 || true
    exit 1
  fi
}

start_payment() {
  mkdir -p "${STATE_DIR}"
  : > "${PAYMENT_LOG}"
  echo "==> Starting payment app static server on port ${PAYMENT_PORT}..."
  (
    cd "${FRONTEND_DIR}"
    exec env \
      MI_BOLT_PAYMENT_ONLY=1 \
      MI_BOLT_PAYMENT_STATIC_DIR="dist/demo-payment/browser" \
      MI_BOLT_API_PROXY="http://localhost:${BACKEND_PORT}" \
      PORT="${PAYMENT_PORT}" \
      node scripts/serve-static.mjs
  ) >> "${PAYMENT_LOG}" 2>&1 &
  local pid=$!
  echo "$pid" > "${PAYMENT_PID_FILE}"
  echo "    pid ${pid}, log ${PAYMENT_LOG}"
  printf '    waiting for payment app'
  if wait_for_http 200 "http://127.0.0.1:${PAYMENT_PORT}/demo-fizetes/" 30 "."; then
    echo " ready"
  else
    echo
    echo "Error: payment app did not become ready within 30 s. Last 40 lines of ${PAYMENT_LOG}:" >&2
    tail -n 40 "${PAYMENT_LOG}" >&2 || true
    exit 1
  fi
}

# ---------------------------------------------------------------------------
# Smoke
# ---------------------------------------------------------------------------

run_smoke() {
  local smoke_status=0
  echo "==> Running backend smoke (BASE=http://localhost:${BACKEND_PORT}/api/v1)..."
  if BASE="http://localhost:${BACKEND_PORT}/api/v1" bash "${APP_DIR}/scripts/smoke.sh"; then
    echo "==> smoke: PASSED"
  else
    smoke_status=1
    echo "==> smoke: FAILED (backend and frontend are up; rerun 'bash scripts/smoke.sh' to investigate)" >&2
  fi
  echo "==> Probing frontend proxy at /api/v1/products..."
  local proxy_body proxy_rc
  proxy_body=$(curl -sf --max-time 10 \
    "http://127.0.0.1:${FRONTEND_PORT}/api/v1/products?pageSize=12" 2>/dev/null)
  proxy_rc=$?
  if [ "$proxy_rc" -eq 0 ]; then
    printf '%s\n' "${proxy_body}" | head -c 200
    echo
    echo "==> proxy probe: PASSED"
  else
    echo "==> proxy probe: FAILED (curl exit ${proxy_rc})" >&2
    smoke_status=1
  fi
  echo
  echo "==> Probing payment app at /demo-fizetes/ on port ${PAYMENT_PORT}..."
  local payment_status
  payment_status=$(http_status "http://127.0.0.1:${PAYMENT_PORT}/demo-fizetes/" || true)
  if [ "$payment_status" = "200" ]; then
    echo "==> payment probe: PASSED"
  else
    echo "==> payment probe: FAILED (HTTP ${payment_status:-none})" >&2
    smoke_status=1
  fi
  echo
  return "${smoke_status}"
}

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

print_summary() {
  cat << EOF

MiBolt demo stack is up.

  Shop:           http://localhost:${FRONTEND_PORT}/
  API:            http://localhost:${BACKEND_PORT}/api/v1
  Payment app:    http://localhost:${PAYMENT_PORT}/demo-fizetes/

  Backend log:    ${BACKEND_LOG}
  Frontend log:   ${FRONTEND_LOG}
  Payment log:    ${PAYMENT_LOG}
  Frontend clone: ${FRONTEND_DIR}

  Stop with:      ./scripts/demo-stack.sh stop
EOF
}

# ---------------------------------------------------------------------------
# Start / stop / status
# ---------------------------------------------------------------------------

kill_pid_file() {
  local file="$1"
  [ -f "$file" ] || return 0
  local pid
  pid=$(cat "$file" 2>/dev/null || true)
  rm -f "$file"
  [ -n "$pid" ] || return 0
  if is_alive "$pid"; then
    kill "$pid" 2>/dev/null || true
    local waited=0
    while is_alive "$pid" && [ "$waited" -lt 10 ]; do
      sleep 1
      waited=$((waited + 1))
    done
    if is_alive "$pid"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  fi
}

on_int_term() {
  echo
  echo "Interrupted; stopping the processes started by demo-stack.sh..." >&2
  kill_all_processes
  exit 1
}

on_start_failure() {
  local rc=$?
  [ "$rc" -eq 0 ] && return 0
  echo "demo-stack: bring-up failed (exit ${rc}); stopping what was started..." >&2
  kill_all_processes
}

kill_all_processes() {
  kill_pid_file "${PAYMENT_PID_FILE}" || true
  kill_pid_file "${FRONTEND_PID_FILE}" || true
  kill_pid_file "${BACKEND_PID_FILE}" || true
}

cmd_start() {
  local smoke_status=0
  mkdir -p "${STATE_DIR}"
  trap 'on_int_term' INT TERM
  preflight
  trap 'on_start_failure' EXIT
  start_database
  start_backend
  start_frontend
  start_payment
  trap - EXIT
  run_smoke || smoke_status=1
  print_summary
  trap - INT TERM
  return "${smoke_status}"
}

cmd_stop() {
  echo "==> Stopping payment app..."
  kill_pid_file "${PAYMENT_PID_FILE}" || true
  echo "==> Stopping frontend..."
  kill_pid_file "${FRONTEND_PID_FILE}" || true
  echo "==> Stopping backend..."
  kill_pid_file "${BACKEND_PID_FILE}" || true
  echo "==> Stopping database..."
  ./scripts/local-database-docker.sh stop
  echo "Done."
}

cmd_status() {
  local backend="down" frontend="down" payment="down" database="down" pid status
  if [ -f "${BACKEND_PID_FILE}" ]; then
    pid=$(cat "${BACKEND_PID_FILE}" 2>/dev/null || true)
    if is_alive "$pid"; then
      status=$(http_status "http://localhost:${BACKEND_PORT}/api/v1/products?pageSize=12" || true)
      [ "$status" = "200" ] && backend="up"
    fi
  fi
  if [ -f "${FRONTEND_PID_FILE}" ]; then
    pid=$(cat "${FRONTEND_PID_FILE}" 2>/dev/null || true)
    if is_alive "$pid"; then
      status=$(http_status "http://127.0.0.1:${FRONTEND_PORT}/" || true)
      [ "$status" = "200" ] && frontend="up"
    fi
  fi
  if [ -f "${PAYMENT_PID_FILE}" ]; then
    pid=$(cat "${PAYMENT_PID_FILE}" 2>/dev/null || true)
    if is_alive "$pid"; then
      status=$(http_status "http://127.0.0.1:${PAYMENT_PORT}/demo-fizetes/" || true)
      [ "$status" = "200" ] && payment="up"
    fi
  fi
  if ./scripts/local-database-docker.sh check >/dev/null 2>&1; then
    database="up"
  fi
  echo "  backend:  ${backend}"
  echo "  frontend: ${frontend}"
  echo "  payment:  ${payment}"
  echo "  database: ${database}"
}

main() {
  local cmd="${1:-start}"
  case "${cmd}" in
    start)
      cmd_start
      ;;
    stop)
      cmd_stop
      ;;
    status)
      cmd_status
      ;;
    -h|--help|help)
      usage
      ;;
    *)
      echo "Unknown command: ${cmd}" >&2
      echo "Run './scripts/demo-stack.sh --help' for usage." >&2
      exit 1
      ;;
  esac
}

main "$@"
