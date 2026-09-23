#!/usr/bin/env bash
# Validates every sample in commerce/samples/ against the component schema its
# file name names: <Schema>.json and <Schema>.<case>.json are checked against
# commerce/openapi.yaml#/components/schemas/<Schema>.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
spec="${here}/commerce/openapi.yaml"
tmp="$(mktemp -d)"
trap 'rm -rf "${tmp}"' EXIT

status=0
for sample in "${here}"/commerce/samples/*.json; do
  file="$(basename "${sample}")"
  schema="${file%%.*}"
  # shellcheck disable=SC2016
  printf '{"$ref": "%s#/components/schemas/%s"}\n' "${spec}" "${schema}" > "${tmp}/${schema}.schema.json"
  check-jsonschema --schemafile "${tmp}/${schema}.schema.json" "${sample}" || status=1
done
exit "${status}"
