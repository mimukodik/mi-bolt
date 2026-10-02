#!/usr/bin/env bash
# Runs Compose on deploy/compose.yaml with the Compose this machine has: the
# `docker compose` plugin when it answers, otherwise the standalone
# `docker-compose`. Every argument is passed through unchanged. On first use it
# creates deploy/.env from deploy/.env.example. It stops with exit 127 and
# names the alternatives when no Docker answers; `check` runs only that test.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Every container mode needs a Docker daemon that answers; without one, say
# what to use instead before anything is created. `check` runs only this.
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "compose.sh: no Docker answers here, so no container mode runs. Serve an app on the mock with 'mise run storefront', 'mise run admin', 'mise run payment' or 'mise run frontend'; verify backend work with 'mise run //backend:test'." >&2
  exit 127
fi
if [ "${1:-}" = "check" ]; then
  exit 0
fi

# A second project on the developer's volume would run two PostgreSQL servers
# on one data directory.
project="${COMPOSE_PROJECT_NAME:-mi-bolt-local}"
volume="${MIBOLT_POSTGRES_VOLUME:-mi-bolt-postgres-data}"
if [ "${project}" != "mi-bolt-local" ] && [ "${volume}" = "mi-bolt-postgres-data" ]; then
  echo "compose.sh: project ${project} must set MIBOLT_POSTGRES_VOLUME to its own volume" >&2
  exit 1
fi

if [ ! -f "${here}/.env" ]; then
  cp "${here}/.env.example" "${here}/.env"
  echo "compose.sh: created deploy/.env from deploy/.env.example" >&2
fi

if docker compose version >/dev/null 2>&1; then
  exec docker compose -f "${here}/compose.yaml" "$@"
elif command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose -f "${here}/compose.yaml" "$@"
fi
echo "compose.sh: neither 'docker compose' nor 'docker-compose' is installed" >&2
exit 127
