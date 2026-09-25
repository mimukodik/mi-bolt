#!/usr/bin/env bash
#
# Letölti a hivatalos Spring Tools language server JAR-t, amit a projekt gyökerében
# lévő .mcp.json indít el MCP szerverként (stdio).
#
# A JAR nincs verziókezelve (~98 MB), ezért friss klónozás után egyszer le kell futtatni:
#
#   tools/install-spring-tools-mcp.sh          # csak ha hiányzik vagy sérült
#   tools/install-spring-tools-mcp.sh --force  # újratöltés mindenképp
#
# Forrás: https://cdn.spring.io/spring-tools/release/  (spring-projects/spring-tools)
# Követelmény: Java 21+ a PATH-on.
#
set -euo pipefail

VERSION="2.4.0"
JAR_NAME="spring-boot-language-server-standalone-exec.jar"
BASE_URL="https://cdn.spring.io/spring-tools/release/language-server/spring-boot/${VERSION}/${JAR_NAME}"

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
target_dir="${repo_root}/.spring-tools"
jar_path="${target_dir}/${JAR_NAME}"

force=0
[[ "${1:-}" == "--force" ]] && force=1

sha256_of() { shasum -a 256 "$1" | awk '{print $1}'; }

if [[ $force -eq 0 && -f "$jar_path" ]]; then
	expected="$(curl -fsSL "${BASE_URL}.sha256")"
	if [[ "$expected" == "$(sha256_of "$jar_path")" ]]; then
		echo "A language server JAR már telepítve van (v${VERSION}), a checksum rendben."
		exit 0
	fi
	echo "A meglévő JAR checksumja nem egyezik, újratöltés..."
fi

mkdir -p "$target_dir"
tmp="$(mktemp "${target_dir}/.${JAR_NAME}.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

echo "Letöltés: ${BASE_URL}"
curl -fL --progress-bar -o "$tmp" "$BASE_URL"

expected="$(curl -fsSL "${BASE_URL}.sha256")"
actual="$(sha256_of "$tmp")"
if [[ "$expected" != "$actual" ]]; then
	echo "HIBA: a checksum nem egyezik." >&2
	echo "  várt:   ${expected}" >&2
	echo "  kapott: ${actual}" >&2
	exit 1
fi

mv "$tmp" "$jar_path"
chmod 644 "$jar_path"  # a mktemp 600-at ad, a JAR-t olvashatónak hagyjuk
trap - EXIT
echo "Kész: ${jar_path} (v${VERSION}, SHA256 ellenőrizve)"

# A language server Java 21+-t igényel, a projekt toolchainjétől függetlenül.
if ! command -v java >/dev/null 2>&1; then
	echo "FIGYELEM: nincs java a PATH-on — a language serverhez Java 21+ kell." >&2
elif [[ "$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')" -lt 21 ]]; then
	echo "FIGYELEM: a PATH-on lévő Java régebbi a 21-esnél — a language server nem fog elindulni." >&2
fi

echo "Indítsd újra a Claude Code-ot (vagy /mcp → reconnect), hogy az MCP szerver felvegye."
