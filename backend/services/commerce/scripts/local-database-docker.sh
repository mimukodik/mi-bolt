#!/usr/bin/env bash
set -euo pipefail

# Directory resolution: always run from the repository root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cd "${APP_DIR}"

COMPOSE_FILE="docker-compose.local-database.yml"
ENV_FILE=".docker-compose.local-database.env"
ENV_FILE_EXAMPLE=".docker-compose.local-database.env.example"
COMPOSE_PROJECT_NAME="mi-bolt-local"
CONTAINER_NAME="mi-bolt-postgres"
VOLUME_NAME="mi-bolt-postgres-data"
HOST_PORT="55433"
CONTAINER_PORT="5432"

# Seconds the authenticating health check waits for the connection itself.
# libpq raises anything below 2 to 2, and an unset value means wait forever.
PSQL_CONNECT_TIMEOUT="5"

# Local-only container defaults, used when the gitignored env file is absent.
# The password is a throwaway local value, never a secret.
DEFAULT_POSTGRES_DB="mi_bolt"
DEFAULT_POSTGRES_USER="mi_bolt"
DEFAULT_POSTGRES_PASSWORD="mi_bolt_local"

# Cached Compose invocation: "v2" for the docker compose CLI plugin,
# "v1" for the retired standalone docker-compose binary.
COMPOSE_KIND=""

if [ ! -f "${APP_DIR}/${COMPOSE_FILE}" ]; then
  echo "Error: ${COMPOSE_FILE} not found in ${APP_DIR}." >&2
  exit 1
fi

# Utility: Strip ANSI color codes from stream
strip_ansi() {
  sed -E $'s/\x1B\\[[0-9;?]*[a-zA-Z]//g'
}

# ---------------------------------------------------------------------------
# Env file values: Compose's dotenv semantics, measured rather than guessed.
#
# Compose parses the --env-file with its own dotenv implementation, so any
# parser written here is a second implementation that can drift from it and
# leave this script's psql and pg_isready addressing a database the container
# never got. The table below is the measured behaviour of
# `docker compose --env-file <file> -f docker-compose.local-database.yml config`
# on Compose v2, one row per input shape:
#
#   env file line                    resolved value   note
#   -------------------------------  ---------------  ------------------------
#   KEY=plain                        plain
#   KEY="dq"                         dq               surrounding " removed
#   KEY='sq'                         sq               surrounding ' removed
#   KEY=v # comment                  v                whitespace + # ends value
#   KEY="v" # comment                v                comment after the quotes
#   KEY='v' # comment                v
#   KEY="a#b" / KEY='a#b'            a#b              # is data inside quotes
#   KEY=a#b                          a#b              no whitespace, no cut
#   KEY=v #                          v
#   KEY=#hash                        #hash            # right after = is data
#   export KEY=v                     v                export prefix accepted
#   KEY = v                          v                spaces around = allowed
#   KEY=first then KEY=last          last             last occurrence wins
#   KEY=                             (empty)          declared, empty
#   KEY=""                           (empty)
#      KEY=indented                  indented         leading whitespace ok
#   KEY=crlf<CR><LF>                 crlf             trailing CR stripped
#   KEY   (no =)                     (undeclared)     not a declaration
#   KEY=trail<spaces>                trail            unquoted right-trimmed
#   KEY=a b                          a b              inner spaces kept
#   KEY="a\nb"                       a<LF>b           \n \t \r \\ \" \$ expand
#   KEY="a\qb"                       a\qb             unknown escape kept as is
#   KEY='a\nb' / KEY=a\nb            a\nb             no escapes outside "..."
#   KEY="dq" junk                    dq               text after " is ignored
#   KEY=a$$b / 'a$b' / "a\$b"        a$b              $$ and \$ are a literal $
#   KEY=${OTHER} / KEY=$OTHER        value of OTHER   process env first, then
#                                                     an earlier key in the file
#   KEY="unterminated                error            Compose aborts
#
# Process environment beats --env-file, even when the process value is empty.
#
# The table is documentation, not the mechanism: resolve_db_var asks Compose
# itself through `config --environment`, which prints the environment Compose
# interpolates the compose file with, straight out of Compose's own dotenv
# parser. env_file_lookup reimplements the table only for installations where
# that flag is missing (Compose older than v2.24, or the retired v1 binary),
# and it refuses to guess on the two inputs it cannot reproduce faithfully:
# multi-line or unterminated quotes, and ${...} modifier or nested forms.
# ---------------------------------------------------------------------------

# Compose's own interpolation environment, resolved once per run.
# COMPOSE_ENV_STATE is "" before the first attempt, then "ok" or "unavailable".
COMPOSE_ENV_DUMP=""
COMPOSE_ENV_STATE=""

load_compose_env() {
  if [ -n "${COMPOSE_ENV_STATE}" ]; then
    return 0
  fi
  COMPOSE_ENV_STATE="unavailable"

  detect_compose_kind
  if [ "${COMPOSE_KIND}" = "none" ]; then
    return 0
  fi

  # Compose aborts when --env-file names a missing file, so only pass it when
  # the file is really there.
  local env_args=()
  if [ -f "${APP_DIR}/${ENV_FILE}" ]; then
    env_args+=(--env-file "${ENV_FILE}")
  fi

  local dump
  if [ "${COMPOSE_KIND}" = "v2" ]; then
    dump=$(docker compose ${env_args[@]+"${env_args[@]}"} -f "${COMPOSE_FILE}" config --environment 2>/dev/null) || return 0
  else
    dump=$(docker-compose ${env_args[@]+"${env_args[@]}"} -f "${COMPOSE_FILE}" config --environment 2>/dev/null) || return 0
  fi

  COMPOSE_ENV_DUMP="${dump}"
  COMPOSE_ENV_STATE="ok"
}

# Lookups print "+<value>" when the key is declared and "-" when it is not, so
# a declared-but-empty value stays distinguishable from an absent key.
#
# `config --environment` prints one KEY=VALUE per line and does not escape a
# newline inside a value, so a multi-line value simply continues on the next
# lines. Measured with Compose 5.5.0 against this compose file: an env file line
# POSTGRES_PASSWORD="line1\nline2" prints as
#
#   POSTGRES_PASSWORD=line1
#   line2
#   POSTGRES_USER=mi_bolt
#
# so a line-at-a-time lookup silently truncates the value at "line1" and then
# reads "line2" as a declaration. Treat a line that opens a new NAME= assignment
# as the next key and every other line as a continuation of the current value.
# A value whose own embedded line looks like NAME=... is indistinguishable from
# a new key in this format; the dump has no quoting that could tell them apart.
# Trailing newlines are lost to command substitution, embedded ones survive.
compose_env_lookup() {
  printf '%s\n' "${COMPOSE_ENV_DUMP}" | awk -v want="$1" '
    /^[A-Za-z_][A-Za-z0-9_.-]*=/ {
      key = substr($0, 1, index($0, "=") - 1)
      capture = (key == want)
      if (capture) { found = 1; value = substr($0, index($0, "=") + 1) }
      next
    }
    capture { value = value "\n" $0 }
    END { if (found) printf "+%s", value; else printf "-" }
  '
}

# Fallback parser for the table above. Prints "ENVPARSE_ERROR:<reason>" instead
# of a value for the inputs it cannot reproduce.
env_file_lookup() {
  local key="$1"
  local path="$2"

  if [ ! -f "${path}" ]; then
    printf '%s' "-"
    return 0
  fi

  awk -v want="${key}" '
    function fail(reason) {
      aborted = 1
      printf "ENVPARSE_ERROR:%s", reason
      exit 3
    }
    function lookup(name) {
      if (name in ENVIRON) return ENVIRON[name]
      if (name in seen) return seen[name]
      return ""
    }
    function expand(s, dq,   out, i, n, c, d, j, name, spec) {
      out = ""
      i = 1
      n = length(s)
      while (i <= n) {
        c = substr(s, i, 1)
        if (dq && c == "\\" && i < n) {
          d = substr(s, i + 1, 1)
          if (d == "n") { out = out "\n"; i += 2; continue }
          if (d == "t") { out = out "\t"; i += 2; continue }
          if (d == "r") { out = out "\r"; i += 2; continue }
          if (d == "\\" || d == "\"" || d == "$") { out = out d; i += 2; continue }
          out = out c
          i += 1
          continue
        }
        if (c == "$") {
          d = substr(s, i + 1, 1)
          if (d == "$") { out = out "$"; i += 2; continue }
          if (d == "{") {
            j = index(substr(s, i + 2), "}")
            if (j == 0) fail("unsupported ${...} form")
            spec = substr(s, i + 2, j - 1)
            if (spec !~ /^[A-Za-z_][A-Za-z0-9_]*$/) fail("unsupported ${...} form")
            out = out lookup(spec)
            i += j + 2
            continue
          }
          name = ""
          j = i + 1
          while (j <= n && substr(s, j, 1) ~ /[A-Za-z0-9_]/) {
            name = name substr(s, j, 1)
            j += 1
          }
          if (name != "") { out = out lookup(name); i = j; continue }
          out = out c
          i += 1
          continue
        }
        out = out c
        i += 1
      }
      return out
    }
    {
      line = $0
      sub(/\r$/, "", line)
      sub(/^[ \t]+/, "", line)
      if (line == "" || substr(line, 1, 1) == "#") next
      sub(/^export[ \t]+/, "", line)
      eq = index(line, "=")
      if (eq == 0) next
      key = substr(line, 1, eq - 1)
      sub(/[ \t]+$/, "", key)
      if (key !~ /^[A-Za-z_][A-Za-z0-9_.-]*$/) next
      rest = substr(line, eq + 1)
      sub(/^[ \t]+/, "", rest)
      quote = substr(rest, 1, 1)
      if (quote == "\"" || quote == "'"'"'") {
        body = substr(rest, 2)
        close_at = 0
        i = 1
        n = length(body)
        while (i <= n) {
          c = substr(body, i, 1)
          if (quote == "\"" && c == "\\") { i += 2; continue }
          if (c == quote) { close_at = i; break }
          i += 1
        }
        if (close_at == 0) fail("multi-line or unterminated quoted value")
        inner = substr(body, 1, close_at - 1)
        if (quote == "\"") value = expand(inner, 1)
        else value = inner
      } else {
        sub(/[ \t]+#.*$/, "", rest)
        sub(/[ \t]+$/, "", rest)
        value = expand(rest, 0)
      }
      seen[key] = value
      if (key == want) { found = 1; result = value }
    }
    END {
      if (aborted) exit 3
      if (found) printf "+%s", result
      else printf "-"
    }
  ' "${path}"
}

# Resolve one POSTGRES_* value for this script and, when needed, for Compose.
#
# Only a value Compose cannot see anywhere is exported. An exported shell value
# outranks --env-file inside Compose, so exporting a value read back from the
# file would put this script, not Compose's dotenv parser, in charge of the
# container credentials.
resolve_db_var() {
  local name="$1"
  local default_value="$2"
  local env_path="$3"
  local looked_up

  load_compose_env

  if [ "${COMPOSE_ENV_STATE}" = "ok" ]; then
    # The dump already merges the process environment over the --env-file with
    # Compose's own precedence, so it answers on its own.
    looked_up=$(compose_env_lookup "${name}")
  else
    looked_up=$(env_file_lookup "${name}" "${env_path}") || true
    case "${looked_up}" in
      ENVPARSE_ERROR:*)
        echo "Error: cannot resolve ${name} from ${env_path}: ${looked_up#ENVPARSE_ERROR:}." >&2
        echo "Docker Compose parses this file itself; install Compose v2.24 or newer so this" >&2
        echo "script reuses that parser, or write ${name} as a plain value." >&2
        exit 1
        ;;
    esac
    # Set in the process environment, empty or not: Compose uses that value.
    if [ -n "${!name+x}" ]; then
      return 0
    fi
  fi

  case "${looked_up}" in
    +*)
      printf -v "${name}" '%s' "${looked_up#+}"
      return 0
      ;;
  esac

  # Declared nowhere, so the default has to reach Compose's interpolation.
  printf -v "${name}" '%s' "${default_value}"
  export "${name?}"
}

# The env file is gitignored, so a fresh clone has none. Seed it from the tracked
# example, but only for the commands that actually bring the container up: the
# inspection commands must leave the working tree untouched.
seed_env_file() {
  local env_path="${APP_DIR}/${ENV_FILE}"

  if [ ! -f "${env_path}" ] && [ -f "${APP_DIR}/${ENV_FILE_EXAMPLE}" ]; then
    cp "${APP_DIR}/${ENV_FILE_EXAMPLE}" "${env_path}"
    echo "Created ${ENV_FILE} from ${ENV_FILE_EXAMPLE} (local-only throwaway credentials)."
  fi
}

# Load database environment variables
load_db_env() {
  local env_path="${APP_DIR}/${ENV_FILE}"

  resolve_db_var POSTGRES_DB "${DEFAULT_POSTGRES_DB}" "${env_path}"
  resolve_db_var POSTGRES_USER "${DEFAULT_POSTGRES_USER}" "${env_path}"
  # An env file that declares POSTGRES_PASSWORD empty keeps it empty, so
  # require_db_password reports the real misconfiguration instead of masking it.
  resolve_db_var POSTGRES_PASSWORD "${DEFAULT_POSTGRES_PASSWORD}" "${env_path}"
}

# The postgres image refuses to initialize a fresh data volume when
# POSTGRES_PASSWORD is empty, and exits before ever accepting connections.
# Catch that here so the failure names the cause instead of a readiness timeout.
require_db_password() {
  if [ -z "${POSTGRES_PASSWORD}" ]; then
    echo "Error: POSTGRES_PASSWORD is empty." >&2
    echo "The postgres image refuses to initialize a database without a non-empty superuser password." >&2
    echo "Set POSTGRES_PASSWORD to a non-empty value in ${APP_DIR}/${ENV_FILE}" >&2
    echo "(copy ${ENV_FILE_EXAMPLE} for the local-only default), then run this script again." >&2
    exit 1
  fi
}

# Docker check
is_docker_running() {
  docker info >/dev/null 2>&1
}

ensure_docker_running() {
  if ! is_docker_running; then
    echo "Error: Docker daemon is not running or not reachable." >&2
    echo "Please start Docker and try again." >&2
    exit 1
  fi
}

# Resolve the Compose implementation once. Compose v1 (docker-compose) is
# retired; current Docker installs ship the "docker compose" v2 CLI plugin.
# "none" records that neither is installed, so credential resolution can fall
# back instead of aborting a command that never needed Compose.
detect_compose_kind() {
  if [ -n "${COMPOSE_KIND}" ]; then
    return 0
  fi
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_KIND="v2"
  elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_KIND="v1"
  else
    COMPOSE_KIND="none"
  fi
}

resolve_compose_kind() {
  detect_compose_kind
  if [ "${COMPOSE_KIND}" = "none" ]; then
    echo "Error: neither 'docker compose' (v2 plugin) nor 'docker-compose' (v1) is available." >&2
    echo "Install Docker Compose v2 and try again." >&2
    exit 1
  fi
}

# Invoke Docker Compose
compose_cmd() {
  resolve_compose_kind

  # Compose aborts when --env-file names a missing file, so only pass it when
  # the file is really there. The exported POSTGRES_* values cover the rest.
  local env_args=()
  if [ -f "${APP_DIR}/${ENV_FILE}" ]; then
    env_args+=(--env-file "${ENV_FILE}")
  fi

  if [ "${COMPOSE_KIND}" = "v2" ]; then
    docker compose ${env_args[@]+"${env_args[@]}"} -f "${COMPOSE_FILE}" "$@"
  else
    docker-compose ${env_args[@]+"${env_args[@]}"} -f "${COMPOSE_FILE}" "$@"
  fi
}

# Host that publishes the container ports: the local machine for a local
# daemon, or the DOCKER_HOST address when the daemon is remote.
container_publish_host() {
  local target_host="127.0.0.1"

  if [ -n "${DOCKER_HOST:-}" ]; then
    local docker_ip
    docker_ip=$(echo "${DOCKER_HOST}" | sed -E 's|^tcp://([^:]+):.*|\1|')
    if [ -n "${docker_ip}" ] && [ "${docker_ip}" != "${DOCKER_HOST}" ]; then
      target_host="${docker_ip}"
    fi
  fi

  echo "${target_host}"
}

# Test TCP connectivity to an explicit host and port from this machine.
# Callers pass the endpoint they mean; this never guesses one from DATABASE_URL,
# which may legitimately point at a shared or staging server.
test_tcp_port() {
  local target_host="$1"
  local target_port="$2"

  mise exec node -- node -e '
    const net = require("net");
    const host = process.argv[1];
    const port = parseInt(process.argv[2], 10);
    const s = net.createConnection({ host, port, timeout: 2000 }, () => {
      s.end();
      process.exit(0);
    });
    s.on("error", () => process.exit(1));
    s.on("timeout", () => {
      s.destroy();
      process.exit(1);
    });
  ' "${target_host}" "${target_port}" 2>/dev/null
}

# Show help
show_help() {
  cat << 'HELP_EOF'
Usage: ./scripts/local-database-docker.sh [COMMAND|OPTION]

Local PostgreSQL Docker database manager for the mi-bolt-backend application.

Commands:
  start, up (default)          Start the PostgreSQL container and wait for readiness
  stop, down                   Stop the running PostgreSQL container
  restart                      Restart the PostgreSQL container
  reset [--yes|--force]        DESTROYS the data volume and starts a fresh, empty
                                database. Requires confirmation; see below.
  status                       Show container state, port mappings, and volume info
  check, ping, check-run       Perform a health and connectivity check (exit 0/1)
  logs [OPTIONS]               View or follow Docker Compose logs
  psql, cli [ARGS...]          Open an interactive psql shell in the container
  -h, --help, help             Display this help message

Log Options (used with 'logs'):
  (default)                    Show the last 50 lines of logs
  -f, --follow                 Follow log output in real-time
  -n, --lines <N>              Show the last N lines of logs
  --no-color, --raw            Strip ANSI color escape codes from log output

Reset:
  'reset' stops the container, PERMANENTLY DELETES its data volume
  (mi-bolt-postgres-data), and starts a fresh, empty container in its
  place. The container name, volume name, and published port (55433) are
  fixed constants shared by every checkout of this repository on this
  machine that points at the same Docker daemon, so 'reset' destroys every
  checkout's local database, not just the one running the command.

  It refuses to run without an explicit confirmation: it prompts
  interactively unless you pass --yes (or --force), or set the
  PLAN_DB_RESET_YES=1 environment variable, either of which skips the
  prompt for non-interactive use.

Examples:
  ./scripts/local-database-docker.sh start       # Start local database container
  ./scripts/local-database-docker.sh status      # Check container status and port
  ./scripts/local-database-docker.sh check       # Verify container health and TCP connection
  ./scripts/local-database-docker.sh logs -f     # Stream database logs
  ./scripts/local-database-docker.sh logs -n 100 # View last 100 lines of logs
  ./scripts/local-database-docker.sh psql        # Open interactive psql console
  ./scripts/local-database-docker.sh stop        # Stop local database container
  ./scripts/local-database-docker.sh reset       # Wipe and recreate an empty database
HELP_EOF
}

# Start command
start_db() {
  ensure_docker_running
  seed_env_file
  load_db_env
  require_db_password

  echo "Starting local PostgreSQL database container..."
  compose_cmd up -d

  echo "Waiting for PostgreSQL to be ready (timeout: 15s)..."
  local count=0
  local max_wait=30 # 30 * 0.5s = 15s
  local is_ready=false

  while [ "$count" -lt "$max_wait" ]; do
    if docker exec "${CONTAINER_NAME}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
      is_ready=true
      break
    fi
    sleep 0.5
    count=$((count + 1))
  done

  if [ "$is_ready" = true ]; then
    echo "PostgreSQL database is ready and accepting connections."
    echo ""
    echo "Database Details:"
    echo "  Container: ${CONTAINER_NAME}"
    echo "  Port:      ${HOST_PORT} -> ${CONTAINER_PORT}"
    echo "  Database:  ${POSTGRES_DB}"
    echo "  User:      ${POSTGRES_USER}"
    echo "  Volume:    ${VOLUME_NAME}"
  else
    echo "Warning: PostgreSQL container started but was not ready within 15 seconds." >&2
    echo "Check container logs: ./scripts/local-database-docker.sh logs" >&2
    exit 1
  fi
}

# Stop command
stop_db() {
  ensure_docker_running
  load_db_env
  echo "Stopping local PostgreSQL database container..."
  compose_cmd stop
  echo "Local PostgreSQL container stopped."
}

# Restart command
restart_db() {
  stop_db
  sleep 1
  start_db
}

# Reset command: stop the container, permanently delete its data volume, and
# start a fresh, empty one. The container name, volume name and published
# port are fixed constants (see the top of this file), so this destroys the
# same database for every checkout on this machine pointed at the same
# Docker daemon, not just the checkout running the command. Never runs
# without an explicit confirmation, interactive or via --yes/--force/
# PLAN_DB_RESET_YES=1.
reset_db() {
  local confirmed=false

  while [ $# -gt 0 ]; do
    case "$1" in
      --yes|--force|-y)
        confirmed=true
        shift
        ;;
      -h|--help)
        echo "Usage: ./scripts/local-database-docker.sh reset [--yes|--force]"
        echo ""
        echo "Stops the '${CONTAINER_NAME}' container, PERMANENTLY DELETES its data"
        echo "volume ('${VOLUME_NAME}'), and starts a fresh, empty container in its place."
        echo ""
        echo "The container name, volume name, and published port (${HOST_PORT}) are fixed"
        echo "constants shared by every checkout of this repository on this machine that"
        echo "points at the same Docker daemon, so this destroys every checkout's local"
        echo "database, not just the one running this command."
        echo ""
        echo "Requires confirmation: pass --yes (or --force), or set PLAN_DB_RESET_YES=1"
        echo "in the environment, to skip the interactive prompt."
        exit 0
        ;;
      *)
        echo "Unknown reset option: $1" >&2
        echo "Use './scripts/local-database-docker.sh reset --help' for usage." >&2
        exit 1
        ;;
    esac
  done

  if [ "${confirmed}" != true ] && [ "${PLAN_DB_RESET_YES:-}" = "1" ]; then
    confirmed=true
  fi

  if [ "${confirmed}" != true ]; then
    echo "WARNING: this permanently deletes the '${VOLUME_NAME}' Docker volume," >&2
    echo "belonging to the '${CONTAINER_NAME}' container (project '${COMPOSE_PROJECT_NAME}'," >&2
    echo "port ${HOST_PORT}). These are fixed constants shared by every checkout of this" >&2
    echo "repository on this machine that points at the same Docker daemon, so this" >&2
    echo "wipes every checkout's local database, not just this one's." >&2
    echo "" >&2

    if [ ! -t 0 ]; then
      echo "Error: refusing to reset without confirmation in a non-interactive shell." >&2
      echo "Pass --yes (or --force), or set PLAN_DB_RESET_YES=1, to confirm non-interactively." >&2
      exit 1
    fi

    local reply
    read -r -p "Type 'yes' to permanently delete this data: " reply
    if [ "${reply}" != "yes" ]; then
      echo "Aborted: reset not confirmed." >&2
      exit 1
    fi
  fi

  ensure_docker_running
  seed_env_file
  load_db_env

  echo "Stopping local PostgreSQL database container and deleting volume '${VOLUME_NAME}'..."
  compose_cmd down -v
  echo "Volume '${VOLUME_NAME}' deleted."

  sleep 1
  start_db
}

# Status command
show_status() {
  load_db_env

  echo "=== Mi-Bolt Local Database Status ==="
  echo "Container:  ${CONTAINER_NAME}"
  echo "Port:       ${HOST_PORT} -> ${CONTAINER_PORT}"
  echo "Volume:     ${VOLUME_NAME}"
  echo "Database:   ${POSTGRES_DB}"
  echo "User:       ${POSTGRES_USER}"

  if ! is_docker_running; then
    echo "Status:     DOCKER STOPPED (daemon not running)"
    echo "=================================="
    return 0
  fi

  local inspect_status
  inspect_status=$(docker inspect --format='{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "${CONTAINER_NAME}" 2>/dev/null || true)

  if [ -z "${inspect_status}" ]; then
    echo "Status:     NOT CREATED"
  else
    local state
    local health
    state=$(echo "${inspect_status}" | awk '{print $1}')
    health=$(echo "${inspect_status}" | awk '{print $2}')
    local upper_state
    upper_state=$(echo "${state}" | tr '[:lower:]' '[:upper:]')
    if [ -n "${health}" ]; then
      echo "Status:     ${upper_state} (${health})"
    else
      echo "Status:     ${upper_state}"
    fi
  fi
  echo "=================================="
}

# Check command (ping/check-run)
check_db() {
  load_db_env

  if ! is_docker_running; then
    echo "[ERROR] Docker daemon is not running or not reachable." >&2
    exit 1
  fi

  local inspect_status
  inspect_status=$(docker inspect --format='{{.State.Status}}' "${CONTAINER_NAME}" 2>/dev/null || true)

  if [ -z "${inspect_status}" ]; then
    echo "[ERROR] Container '${CONTAINER_NAME}' does not exist." >&2
    exit 1
  fi

  if [ "${inspect_status}" != "running" ]; then
    echo "[ERROR] Container '${CONTAINER_NAME}' is not running (status: ${inspect_status})." >&2
    exit 1
  fi

  if ! docker exec "${CONTAINER_NAME}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
    echo "[ERROR] PostgreSQL in container '${CONTAINER_NAME}' is not accepting connections (pg_isready failed)." >&2
    exit 1
  fi

  # pg_isready only proves the socket answers: it reports "accepting
  # connections" without ever authenticating the role, the database, or the
  # password, so a credential mismatch used to pass this check. Open a real
  # session instead. The image's pg_hba trusts the unix socket and 127.0.0.1,
  # so the probe dials the container's own network name, the only endpoint that
  # reaches the "host all all all scram-sha-256" rule and therefore also proves
  # the password. User and database travel as argv, never as script text.
  #
  # The password travels on stdin. `docker exec -e PGPASSWORD=...` would put the
  # cleartext value in the docker client's own argv, where any local user reads
  # it out of `ps`; nothing that carries the password may appear in an argument
  # list. Reading it with $(cat) instead of `read` keeps a value that contains a
  # newline intact, which a PGPASSFILE line could not express either. -w stops
  # psql from falling back to an interactive prompt once stdin is at EOF, and
  # PGCONNECT_TIMEOUT bounds the connect attempt (libpq treats an unset value as
  # an infinite wait, and silently raises anything below 2 seconds to 2).
  local auth_output
  if ! auth_output=$(printf '%s' "${POSTGRES_PASSWORD}" | docker exec -i \
    -e PGCONNECT_TIMEOUT="${PSQL_CONNECT_TIMEOUT}" "${CONTAINER_NAME}" \
    sh -c 'PGPASSWORD=$(cat); export PGPASSWORD; exec psql -w -v ON_ERROR_STOP=1 -h "$(hostname)" -p "$1" -U "$2" -d "$3" -tAc "select 1"' \
    sh "${CONTAINER_PORT}" "${POSTGRES_USER}" "${POSTGRES_DB}" 2>&1); then
    echo "[ERROR] Configured credentials do not work against '${CONTAINER_NAME}':" >&2
    echo "        user '${POSTGRES_USER}', database '${POSTGRES_DB}'." >&2
    echo "${auth_output}" >&2
    echo "The container was created with the values Docker Compose read from ${ENV_FILE};" >&2
    echo "recreate it after fixing that file: ./scripts/local-database-docker.sh restart" >&2
    exit 1
  fi

  if [ "$(printf '%s' "${auth_output}" | tr -d '[:space:]')" != "1" ]; then
    echo "[ERROR] Unexpected probe result from '${CONTAINER_NAME}': ${auth_output}" >&2
    exit 1
  fi

  local publish_host
  publish_host="$(container_publish_host)"

  if ! test_tcp_port "${publish_host}" "${HOST_PORT}"; then
    echo "[ERROR] Container endpoint ${publish_host}:${HOST_PORT} is not reachable from host." >&2
    exit 1
  fi

  echo "Local PostgreSQL database is healthy and reachable at ${publish_host}:${HOST_PORT}"
  echo "(authenticated as '${POSTGRES_USER}' on database '${POSTGRES_DB}')."
  return 0
}

# Logs command
handle_logs() {
  ensure_docker_running
  load_db_env

  local follow=false
  local lines=50
  local no_color=false

  while [[ $# -gt 0 ]]; do
    case "$1" in
      -f|--follow)
        follow=true
        shift
        ;;
      -n|--lines)
        if [[ $# -lt 2 ]]; then
          echo "Error: $1 requires an integer line count." >&2
          exit 1
        fi
        lines="$2"
        shift 2
        ;;
      --no-color|--raw)
        no_color=true
        shift
        ;;
      -h|--help)
        echo "Usage: ./scripts/local-database-docker.sh logs [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  (default)            Show last 50 lines"
        echo "  -f, --follow         Follow log output in real-time"
        echo "  -n, --lines <N>      Show last N lines"
        echo "  --no-color, --raw    Strip ANSI color escape codes"
        exit 0
        ;;
      *)
        echo "Unknown logs option: $1" >&2
        echo "Use './scripts/local-database-docker.sh logs --help' for options." >&2
        exit 1
        ;;
    esac
  done

  local compose_args=()
  if [ "$follow" = true ]; then
    compose_args+=("-f")
  fi
  compose_args+=("--tail=${lines}")

  if [ "$no_color" = true ]; then
    compose_cmd logs "${compose_args[@]}" | strip_ansi
  else
    compose_cmd logs "${compose_args[@]}"
  fi
}

# PSQL CLI command
handle_psql() {
  ensure_docker_running
  load_db_env

  local inspect_status
  inspect_status=$(docker inspect --format='{{.State.Status}}' "${CONTAINER_NAME}" 2>/dev/null || true)
  if [ "${inspect_status}" != "running" ]; then
    echo "Error: Container '${CONTAINER_NAME}' is not running." >&2
    echo "Start it with: ./scripts/local-database-docker.sh start" >&2
    exit 1
  fi

  local exec_flags="-i"
  if [ -t 0 ] && [ -t 1 ]; then
    exec_flags="-it"
  fi

  exec docker exec ${exec_flags} "${CONTAINER_NAME}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" "$@"
}

# Main entry point
main() {
  local cmd="${1:-start}"

  case "${cmd}" in
    start|up)
      start_db
      ;;
    stop|down)
      stop_db
      ;;
    restart)
      restart_db
      ;;
    reset)
      shift || true
      reset_db "$@"
      ;;
    status)
      show_status
      ;;
    check|ping|check-run)
      check_db
      ;;
    logs)
      shift || true
      handle_logs "$@"
      ;;
    psql|cli)
      shift || true
      handle_psql "$@"
      ;;
    -h|--help|help)
      show_help
      ;;
    *)
      echo "Unknown command: ${cmd}" >&2
      echo "Run './scripts/local-database-docker.sh --help' for usage." >&2
      exit 1
      ;;
  esac
}

main "$@"
