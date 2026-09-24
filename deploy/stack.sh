#!/usr/bin/env bash
# Runs a Compose stack of this worktree's own, beside the shared mi-bolt-local
# stack the main checkout uses. Every worktree gets its own COMPOSE_PROJECT_NAME,
# its own PostgreSQL volume and its own three ports, claimed from a numbered
# slot ledger shared by every worktree on this machine; deploy/.worktree-stack.env
# in this worktree remembers the claim across runs. Every Compose call goes
# through deploy/compose.sh; health reads the running container with docker exec.
#
# Usage: deploy/stack.sh <command> [args...]
#
# Commands:
#   up [service...] [--build]   Claim a slot (first run) and bring services up
#   stop [service...]           Stop services; containers stay, volume stays
#   down                        Remove containers and network; volume stays
#   status                      Slot, ports, volume, and per-service state
#   health                      pg_isready, authenticated query, host TCP probe
#   logs [args...]              Passthrough to deploy/compose.sh logs
#   ports                       Print MIBOLT_*_PORT as KEY=value lines
#   reset [--yes]               DESTROYS this worktree's volume, releases its slot
#   slots                       List every claimed slot on this machine
#   prune [--yes]               Release slots whose worktree no longer exists
#   claim                       Internal: claim a slot and write state, nothing else
#   help                        This text
#
# This script only works from a linked worktree (git worktree add), never
# from the main checkout, which keeps using mise run db / stack / stop.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${here}/.." && pwd)"
cd "${REPO_ROOT}"

COMPOSE_SH="${REPO_ROOT}/deploy/compose.sh"
STATE_FILE="${REPO_ROOT}/deploy/.worktree-stack.env"

# Slot ledger: slot n (1..SLOT_COUNT) maps to web=WEB_PORT_BASE+n,
# backend=BACKEND_PORT_BASE+n, postgres=POSTGRES_PORT_BASE+n. These ranges sit
# outside every port already in use in the workspace port ledger.
WEB_PORT_BASE=4600
BACKEND_PORT_BASE=8100
POSTGRES_PORT_BASE=55500
SLOT_COUNT=20

SLOTS_DIR="${MIBOLT_STACK_SLOTS_DIR:-${XDG_STATE_HOME:-$HOME/.local/state}/mi-bolt/worktree-stack-slots}"

# Set by acquire_lock/release_lock below; read by the EXIT/INT/TERM traps
# registered right after release_lock is defined.
LOCK_DIR=""

# Prints the whole leading comment block (from the line after the shebang up
# to the first non-comment line), whatever its length, with the "# " prefix
# stripped.
usage() {
  awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"
}

require_worktree() {
  local git_dir common_dir
  git_dir="$(git rev-parse --git-dir 2>/dev/null)" || {
    echo "stack.sh: not a git repository" >&2
    exit 2
  }
  common_dir="$(git rev-parse --git-common-dir 2>/dev/null)"
  if [ "${git_dir}" = "${common_dir}" ]; then
    echo "stack.sh: this is the main checkout; it uses the shared stack (mise run db, mise run stack, mise run stop)" >&2
    exit 2
  fi
  if ! git symbolic-ref -q HEAD >/dev/null; then
    echo "stack.sh: HEAD is detached; check out a branch first" >&2
    exit 2
  fi
}

sanitize_branch() {
  local raw="$1" s
  s="$(printf '%s' "${raw}" | tr '[:upper:]' '[:lower:]')"
  s="$(printf '%s' "${s}" | sed -E 's/[^a-z0-9_-]/-/g')"
  s="$(printf '%s' "${s}" | sed -E 's/-+/-/g')"
  s="$(printf '%s' "${s}" | sed -E 's/^-+//; s/-+$//')"
  printf '%s' "${s}"
}

# sha1 hex digest of stdin. shasum ships on macOS; a minimal Linux image may
# have only sha1sum (GNU coreutils) instead.
sha1_hex() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 1 | awk '{print $1}'
  elif command -v sha1sum >/dev/null 2>&1; then
    sha1sum | awk '{print $1}'
  else
    echo "stack.sh: neither shasum nor sha1sum is on PATH" >&2
    exit 1
  fi
}

# The project name is decided once the slot is known, so two branches that
# sanitize alike never collide: the slot number is part of the name. Keeps
# the 63-character Compose project-name cap by cutting the combined
# prefix+sanitized string and appending a hash of the raw branch name.
project_name_for_slot() {
  local branch="$1" slot="$2" sanitized project hash
  sanitized="$(sanitize_branch "${branch}")"
  project="mi-bolt-wt${slot}-${sanitized}"
  if [ "${#project}" -gt 63 ]; then
    hash="$(printf '%s' "${branch}" | sha1_hex | cut -c1-8)"
    project="${project:0:54}-${hash}"
  fi
  printf '%s' "${project}"
}

guard_not_default_project() {
  if [ "$1" = "mi-bolt-local" ]; then
    echo "stack.sh: refusing to operate on the mi-bolt-local project" >&2
    exit 2
  fi
}

# Best-effort TCP probe of 127.0.0.1:<port>, bounded to about 1s either way.
# Returns 0 (success) when something accepts the connection.
port_in_use() {
  local port="$1"
  if command -v timeout >/dev/null 2>&1; then
    timeout 1 bash -c "exec 3<>'/dev/tcp/127.0.0.1/${port}'" 2>/dev/null
    return
  fi
  # No `timeout` binary: bound the probe ourselves so a filtered port cannot
  # hang this script, by backgrounding the connect attempt and killing it
  # after about 1s (10 * 0.1s) if it has not returned by then.
  ( exec 3<>"/dev/tcp/127.0.0.1/${port}" ) 2>/dev/null &
  local pid=$! waited=0
  while kill -0 "${pid}" 2>/dev/null; do
    if [ "${waited}" -ge 10 ]; then
      kill "${pid}" 2>/dev/null
      wait "${pid}" 2>/dev/null
      return 1
    fi
    sleep 0.1
    waited=$((waited + 1))
  done
  wait "${pid}"
}

# Releases the per-worktree lock acquire_lock took, if any. Idempotent, and
# armed as a trap right below so it fires on a normal exit, an error exit
# under `set -e`, or an interrupt while the lock is held.
release_lock() {
  if [ -n "${LOCK_DIR}" ]; then
    rmdir "${LOCK_DIR}" 2>/dev/null || true
    LOCK_DIR=""
  fi
}
trap release_lock EXIT
trap 'release_lock; exit 130' INT
trap 'release_lock; exit 143' TERM

# Serializes ensure_state's check-claim-write sequence across two `stack.sh`
# runs in the same worktree, so they cannot both miss find_existing_slot and
# both claim a (different) slot, leaking one forever. The lock directory's
# name starts with '.', so it is invisible to every `"${SLOTS_DIR}"/*/` glob
# used to enumerate slots elsewhere in this script (bash's `*` does not match
# dotfiles by default) and is never mistaken for a slot.
acquire_lock() {
  mkdir -p "${SLOTS_DIR}"
  local hash lock_dir tries=50 _try
  hash="$(printf '%s' "${REPO_ROOT}" | sha1_hex | cut -c1-12)"
  lock_dir="${SLOTS_DIR}/.lock-${hash}"
  for _try in $(seq 1 "${tries}"); do
    if mkdir "${lock_dir}" 2>/dev/null; then
      LOCK_DIR="${lock_dir}"
      return 0
    fi
    sleep 0.1
  done
  echo "stack.sh: timed out waiting for the per-worktree lock ${lock_dir} (held by another stack.sh run in this worktree?)" >&2
  exit 1
}

# Finds a slot this worktree already claimed (its owner file's worktree= line
# matches REPO_ROOT), so a state file lost without releasing its slot (for
# example `git clean -X`) is recovered instead of leaking a second slot.
# Prints the slot number and returns 0 on a match, returns 1 otherwise.
find_existing_slot() {
  [ -d "${SLOTS_DIR}" ] || return 1
  local dir owner_path
  for dir in "${SLOTS_DIR}"/*/; do
    [ -d "${dir}" ] || continue
    [ -f "${dir}owner" ] || continue
    owner_path="$(sed -n 's/^worktree=//p' "${dir}owner" 2>/dev/null)" || owner_path=""
    if [ "${owner_path}" = "${REPO_ROOT}" ]; then
      basename "${dir}"
      return 0
    fi
  done
  return 1
}

# Claims the first free, actually-unused slot; prints its number on success.
claim_slot() {
  mkdir -p "${SLOTS_DIR}"
  local n dir web_port backend_port postgres_port project
  for n in $(seq 1 "${SLOT_COUNT}"); do
    dir="${SLOTS_DIR}/${n}"
    if mkdir "${dir}" 2>/dev/null; then
      project="$(project_name_for_slot "${BRANCH}" "${n}")"
      {
        echo "worktree=${REPO_ROOT}"
        echo "branch=${BRANCH}"
        echo "project=${project}"
      } > "${dir}/owner"
      web_port=$((WEB_PORT_BASE + n))
      backend_port=$((BACKEND_PORT_BASE + n))
      postgres_port=$((POSTGRES_PORT_BASE + n))
      if port_in_use "${web_port}" || port_in_use "${backend_port}" || port_in_use "${postgres_port}"; then
        rm -rf "${dir}"
        continue
      fi
      printf '%s\n' "${n}"
      return 0
    fi
  done
  return 1
}

write_state() {
  local slot="$1" web backend postgres volume
  web=$((WEB_PORT_BASE + slot))
  backend=$((BACKEND_PORT_BASE + slot))
  postgres=$((POSTGRES_PORT_BASE + slot))
  volume="${PROJECT_NAME}-pgdata"
  cat > "${STATE_FILE}" <<EOF
STACK_SLOT=${slot}
COMPOSE_PROJECT_NAME=${PROJECT_NAME}
MIBOLT_POSTGRES_VOLUME=${volume}
MIBOLT_POSTGRES_PORT=${postgres}
MIBOLT_BACKEND_PORT=${backend}
MIBOLT_WEB_PORT=${web}
MIBOLT_PAYMENT_ORIGIN=http://localhost:${web}
MIBOLT_SHOP_ORIGIN=http://localhost:${web}
EOF
}

ensure_state() {
  if [ -f "${STATE_FILE}" ]; then
    return 0
  fi

  acquire_lock

  # Re-check under the lock: a concurrent `stack.sh` run in this worktree may
  # have finished claiming while this one waited for the lock.
  if [ -f "${STATE_FILE}" ]; then
    release_lock
    return 0
  fi

  local slot
  slot="$(find_existing_slot)" || true
  if [ -n "${slot}" ]; then
    echo "stack.sh: reusing slot ${slot} already claimed by this worktree" >&2
  else
    if ! slot="$(claim_slot)"; then
      echo "stack.sh: no free slot among ${SLOT_COUNT} in ${SLOTS_DIR}" >&2
      echo "stack.sh: see 'stack.sh slots' to list claims, 'stack.sh prune --yes' to free stale ones" >&2
      release_lock
      exit 1
    fi
  fi

  PROJECT_NAME="$(project_name_for_slot "${BRANCH}" "${slot}")"
  guard_not_default_project "${PROJECT_NAME}"
  write_state "${slot}"
  release_lock
}

load_state() {
  if [ ! -f "${STATE_FILE}" ]; then
    echo "stack.sh: no state file yet; run 'stack.sh up' first" >&2
    exit 1
  fi
  set -a
  # shellcheck disable=SC1090
  . "${STATE_FILE}"
  set +a
  guard_not_default_project "${COMPOSE_PROJECT_NAME}"
}

cmd_claim() {
  ensure_state
  load_state
  echo "${STACK_SLOT}"
}

cmd_up() {
  ensure_state
  load_state
  local build=() services=() arg
  for arg in "$@"; do
    if [ "${arg}" = "--build" ]; then
      build=(--build)
    else
      services+=("${arg}")
    fi
  done
  local up_args=(up -d)
  if [ "${#build[@]}" -gt 0 ]; then
    up_args+=(--build)
  fi
  up_args+=(--wait)
  if [ "${#services[@]}" -gt 0 ]; then
    up_args+=("${services[@]}")
  fi
  "${COMPOSE_SH}" "${up_args[@]}"
}

cmd_stop() {
  load_state
  "${COMPOSE_SH}" stop "$@"
}

cmd_down() {
  load_state
  "${COMPOSE_SH}" down
}

cmd_status() {
  load_state
  echo "Slot:    ${STACK_SLOT}"
  echo "Project: ${COMPOSE_PROJECT_NAME}"
  echo "Volume:  ${MIBOLT_POSTGRES_VOLUME}"
  echo "Ports:   postgres=${MIBOLT_POSTGRES_PORT} backend=${MIBOLT_BACKEND_PORT} web=${MIBOLT_WEB_PORT}"
  echo
  "${COMPOSE_SH}" ps
}

cmd_health() {
  load_state
  local cid
  if ! cid="$("${COMPOSE_SH}" ps -q postgres 2>/dev/null)"; then
    cid=""
  fi
  if [ -z "${cid}" ]; then
    echo "[ERROR] postgres service has no running container for project ${COMPOSE_PROJECT_NAME}" >&2
    exit 1
  fi

  local pg_user pg_db pg_password
  if ! pg_user="$(docker exec "${cid}" printenv POSTGRES_USER 2>/dev/null)" \
    || ! pg_db="$(docker exec "${cid}" printenv POSTGRES_DB 2>/dev/null)" \
    || ! pg_password="$(docker exec "${cid}" printenv POSTGRES_PASSWORD 2>/dev/null)"; then
    echo "[ERROR] could not read POSTGRES_* environment from container ${cid} (is it still running?)" >&2
    exit 1
  fi

  if docker exec "${cid}" pg_isready -U "${pg_user}" -d "${pg_db}" >/dev/null 2>&1; then
    echo "ok: pg_isready"
  else
    echo "[ERROR] pg_isready failed" >&2
    exit 1
  fi

  # The password travels on stdin, never as an argument, so it never appears
  # in this host's own `ps` output; pg_hba trusts 127.0.0.1 inside the
  # container, so this also proves the credentials, not just that the socket
  # answers.
  local auth_output
  if auth_output=$(printf '%s' "${pg_password}" | docker exec -i "${cid}" \
    sh -c 'PGPASSWORD=$(cat); export PGPASSWORD; exec psql -w -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$1" -d "$2" -tAc "select 1"' \
    sh "${pg_user}" "${pg_db}" 2>&1) && [ "$(printf '%s' "${auth_output}" | tr -d '[:space:]')" = "1" ]; then
    echo "ok: authenticated select 1"
  else
    echo "[ERROR] authenticated query failed: ${auth_output}" >&2
    exit 1
  fi

  if port_in_use "${MIBOLT_POSTGRES_PORT}"; then
    echo "ok: TCP connect to 127.0.0.1:${MIBOLT_POSTGRES_PORT}"
  else
    echo "[ERROR] TCP connect to 127.0.0.1:${MIBOLT_POSTGRES_PORT} failed" >&2
    exit 1
  fi
}

cmd_logs() {
  load_state
  "${COMPOSE_SH}" logs "$@"
}

cmd_ports() {
  load_state
  echo "MIBOLT_POSTGRES_PORT=${MIBOLT_POSTGRES_PORT}"
  echo "MIBOLT_BACKEND_PORT=${MIBOLT_BACKEND_PORT}"
  echo "MIBOLT_WEB_PORT=${MIBOLT_WEB_PORT}"
}

cmd_reset() {
  local confirmed=false
  if [ "${1:-}" = "--yes" ]; then
    confirmed=true
  fi
  if [ "${confirmed}" != true ] && [ "${MIBOLT_STACK_RESET_YES:-}" = "1" ]; then
    confirmed=true
  fi

  load_state

  if [ "${confirmed}" != true ]; then
    echo "WARNING: this permanently deletes the '${MIBOLT_POSTGRES_VOLUME}' Docker volume for project '${COMPOSE_PROJECT_NAME}'." >&2
    if [ ! -t 0 ]; then
      echo "stack.sh: refusing to reset without confirmation in a non-interactive shell." >&2
      echo "Pass --yes, or set MIBOLT_STACK_RESET_YES=1, to confirm non-interactively." >&2
      exit 1
    fi
    local reply
    read -r -p "Type 'yes' to permanently delete this data: " reply
    if [ "${reply}" != "yes" ]; then
      echo "Aborted: reset not confirmed." >&2
      exit 1
    fi
  fi

  "${COMPOSE_SH}" down -v
  rm -f "${STATE_FILE}"
  rm -rf "${SLOTS_DIR}/${STACK_SLOT:?}"
  echo "stack.sh: reset complete, slot ${STACK_SLOT} released"
}

cmd_slots() {
  if [ ! -d "${SLOTS_DIR}" ]; then
    echo "no slots claimed"
    return 0
  fi
  local dir n found=false
  for dir in "${SLOTS_DIR}"/*/; do
    [ -d "${dir}" ] || continue
    found=true
    n="$(basename "${dir}")"
    echo "slot ${n}:"
    if [ -f "${dir}owner" ]; then
      sed 's/^/  /' "${dir}owner" 2>/dev/null || echo "  (owner file unreadable)"
    fi
  done
  if [ "${found}" = false ]; then
    echo "no slots claimed"
  fi
}

cmd_prune() {
  local do_yes=false
  if [ "${1:-}" = "--yes" ]; then
    do_yes=true
  fi
  if [ ! -d "${SLOTS_DIR}" ]; then
    echo "no slots claimed"
    return 0
  fi
  local dir n owner_path owner_branch project
  for dir in "${SLOTS_DIR}"/*/; do
    [ -d "${dir}" ] || continue
    n="$(basename "${dir}")"
    [ -f "${dir}owner" ] || continue
    owner_path="$(sed -n 's/^worktree=//p' "${dir}owner" 2>/dev/null)" || owner_path=""
    owner_branch="$(sed -n 's/^branch=//p' "${dir}owner" 2>/dev/null)" || owner_branch=""
    project="$(sed -n 's/^project=//p' "${dir}owner" 2>/dev/null)" || project=""

    if [ -d "${owner_path}" ]; then
      continue
    fi

    if [ "${do_yes}" != true ]; then
      echo "stale slot ${n}: worktree ${owner_path} (branch ${owner_branch}) no longer exists"
      continue
    fi

    if [ -z "${project}" ]; then
      if [ -z "${owner_branch}" ] || [ -z "$(sanitize_branch "${owner_branch}")" ]; then
        echo "stack.sh: slot ${n} has no usable project or branch recorded in its owner file; skipping" >&2
        continue
      fi
      project="$(project_name_for_slot "${owner_branch}" "${n}")"
    fi

    if [ "${project}" = "mi-bolt-local" ]; then
      echo "stack.sh: slot ${n}'s owner file names the mi-bolt-local project; skipping" >&2
      continue
    fi

    echo "stack.sh: pruning slot ${n}, project ${project}"
    if COMPOSE_PROJECT_NAME="${project}" MIBOLT_POSTGRES_VOLUME="${project}-pgdata" "${COMPOSE_SH}" down -v; then
      rm -rf "${dir}"
    else
      echo "stack.sh: down -v failed for project ${project}; slot ${n} kept" >&2
    fi
  done
}

main() {
  local cmd="${1:-}"
  case "${cmd}" in
    -h|--help|help|"")
      usage
      exit 0
      ;;
  esac

  require_worktree
  BRANCH="$(git rev-parse --abbrev-ref HEAD)"

  shift
  case "${cmd}" in
    up) cmd_up "$@" ;;
    stop) cmd_stop "$@" ;;
    down) cmd_down "$@" ;;
    status) cmd_status "$@" ;;
    health) cmd_health "$@" ;;
    logs) cmd_logs "$@" ;;
    ports) cmd_ports "$@" ;;
    reset) cmd_reset "$@" ;;
    slots) cmd_slots "$@" ;;
    prune) cmd_prune "$@" ;;
    claim) cmd_claim "$@" ;;
    *)
      echo "stack.sh: unknown command '${cmd}'" >&2
      usage >&2
      exit 1
      ;;
  esac
}

main "$@"
