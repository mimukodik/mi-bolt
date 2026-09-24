"""Stable image input hashes from tracked files and the Compose build contract."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess

import yaml


# Validate the checked-out filter against the build input contract. A filter
# edit must be reviewed together with this algorithm, never silently omitted.
EXPECTED_FILTERS = {
    "frontend": {"frontend/**", "contracts/**", "data/catalog/**", "mise.toml",
                 ".github/**", "tools/ci/**"},
    "backend": {"backend/**", "contracts/**", "data/catalog/**", "mise.toml",
                ".github/**", "tools/ci/**"},
}
COMPONENT_FILTERS = {"web": "frontend", "commerce": "backend"}
BUILD_CONTRACT = "deploy/compose.yaml"


def tracked_files(source: Path) -> dict[str, str]:
    records = subprocess.check_output(["git", "ls-files", "--stage", "-z"], cwd=source)
    result = {}
    for record in records.split(b"\0"):
        if not record:
            continue
        index, raw_path = record.split(b"\t", 1)
        mode, _, stage = index.split(b" ")
        if stage != b"0":
            raise ValueError("unmerged tracked input")
        result[os.fsdecode(raw_path)] = mode.decode("ascii")
    return result


def file_digest(source: Path, selected: dict[str, str], include_mode: bool) -> str:
    digest = hashlib.sha256()
    for name, mode in sorted(selected.items()):
        file = source / name
        if not file.is_file() or not file.resolve().is_relative_to(source.resolve()):
            raise ValueError(f"invalid tracked build input: {name}")
        # Tracked Gradle wrapper symlinks are safe only when their target stays
        # inside the checkout. Hash the link and target bytes in that case.
        link = os.readlink(file).encode("utf-8") if file.is_symlink() else b""
        content = link + b"\0" + file.read_bytes()
        encoded = os.fsencode(name)
        digest.update(len(encoded).to_bytes(4, "big"))
        digest.update(encoded)
        if include_mode:
            digest.update(mode.encode("ascii"))
        digest.update(len(content).to_bytes(8, "big"))
        digest.update(content)
    return digest.hexdigest()


def matches(path: str, pattern: str) -> bool:
    if pattern.endswith("/**"):
        return path.startswith(pattern[:-2])
    return path == pattern


def hashes(source: Path) -> dict[str, str]:
    filters = yaml.safe_load((source / ".github/components.yml").read_text())
    for key, expected in EXPECTED_FILTERS.items():
        actual = filters.get(key)
        if not isinstance(actual, list) or len(actual) != len(expected) or set(actual) != expected:
            raise ValueError(f"{key} path filter diverged from candidate hash contract")
    tracked = tracked_files(source)
    result = {}
    for component, filter_name in COMPONENT_FILTERS.items():
        patterns = filters[filter_name]
        selected = {path: mode for path, mode in tracked.items()
                    if path == BUILD_CONTRACT or any(matches(path, pattern) for pattern in patterns)}
        if BUILD_CONTRACT not in selected or not any(path.startswith(filter_name + "/")
                                                     for path in selected):
            raise ValueError(f"missing tracked {component} build inputs")
        result[component] = file_digest(source, selected, include_mode=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", type=Path, default=Path("."))
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()
    result = hashes(args.source.resolve())
    print(json.dumps(result, sort_keys=True))
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            for component, value in result.items():
                output.write(f"{component}_hash={value}\n")
