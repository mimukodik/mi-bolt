#!/usr/bin/env python3
"""check-liquibase-changelog.py

Purpose:
  Check the commerce backend's Liquibase changelog under
  backend/services/commerce/src/main/resources/db/changelog/ for the
  bookkeeping every migration repeats by hand: that every changes/*.yaml file
  is included exactly once in db.changelog-master.yaml, that the includes are
  in ascending numeric order, that every changeset has an id and an author,
  and (with --base) that no changeset already applied at <base> was edited
  in place instead of superseded by a new one. Also reports the next free
  changeset number and the include block a new changeset would need, printed
  only, never written to disk.

Prerequisites:
  - uv on PATH.
  - Python 3.12, resolved by uv.
  - PyYAML 6.0.2, resolved by uv from its cache; fetched once from PyPI on
    first use if the cache does not already hold it. That first fetch is
    uv's own network access, not this script's: the script itself makes no
    network call.
  - git 2.30 or later, for `git diff --merge-base`.
  - Run from inside a git checkout of this repository.

Command (from any directory inside the checkout; the script path below is
  relative to this skill's directory, so give it as seen from the directory
  the command runs in):
  uv run --no-project --python 3.12 --with PyYAML==6.0.2 python \\
    scripts/check-liquibase-changelog.py \\
    [--base <git-ref>]

Exit codes:
  0  the check ran and found no FAIL.
  1  the check ran and found at least one FAIL, including a changeset file
     under changes/ that is not valid YAML.
  2  a usage or prerequisite error: an unresolvable --base ref, a --base
     with no merge base with HEAD, running outside a git checkout, the
     changelog layout has moved, or the master changelog does not parse.

Read-only guarantee:
  Reads the changelog YAML files under db/changelog/ and runs only
  `git rev-parse` and `git diff --name-status`.
  It writes no file, makes no network call, and runs no git command that
  changes repository state.

Diagnostics:
  Usage and prerequisite errors (exit 2) go to stderr. The OK/WARN/FAIL
  check output, the next changeset number and the printed include suggestion
  go to stdout.
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Optional

import yaml

RESOURCES_REL = Path("backend/services/commerce/src/main/resources")
CHANGELOG_REL = RESOURCES_REL / "db" / "changelog"
MASTER_REL = CHANGELOG_REL / "db.changelog-master.yaml"
CHANGES_REL = CHANGELOG_REL / "changes"

# A well-formed changeset file name: a four-digit number, a lowercase-and-digit
# slug with optional hyphen-separated words, and a .yaml extension.
FILENAME_RE = re.compile(r"^\d{4}-[a-z0-9]+(-[a-z0-9]+)*\.yaml$")
# The leading number of a file name, however many digits it has. Used for
# ordering, duplicate-number and gap checks even on a name FILENAME_RE warns
# about, so one malformed name does not also hide an unrelated ordering bug.
NUMBER_RE = re.compile(r"^(\d+)-")

APPLIED_CHANGESET_MESSAGE = (
    "applied changeset modified: {path}; add a new changeset instead "
    "(backend/docs/04-adatbazis.md §5)"
)


def run_git(args: list[str], cwd: Path) -> "subprocess.CompletedProcess[str]":
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True)


def extract_number(basename: str) -> Optional[int]:
    match = NUMBER_RE.match(basename)
    return int(match.group(1)) if match else None


def load_yaml(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check the commerce backend's Liquibase changelog bookkeeping.",
    )
    parser.add_argument(
        "--base",
        help="git ref to check for already-applied changesets edited since",
    )
    args = parser.parse_args()

    root_result = run_git(["rev-parse", "--show-toplevel"], Path.cwd())
    if root_result.returncode != 0:
        print("not a git checkout", file=sys.stderr)
        return 2
    repo_root = Path(root_result.stdout.strip())

    diff_lines: list[str] = []
    if args.base is not None:
        verify = run_git(["rev-parse", "--verify", f"{args.base}^{{commit}}"], repo_root)
        if verify.returncode != 0:
            print(f"unknown git ref: {args.base}", file=sys.stderr)
            return 2

        # One diff from the merge base of <base> and HEAD to the working tree:
        # committed, staged and unstaged edits together. A changeset this
        # branch added shows as A however often it was edited since, so only
        # a file that existed at the merge base can come out as M or D.
        # --no-renames makes a renamed applied changeset a D plus an A.
        diff_result = run_git(
            ["diff", "--name-status", "--no-renames", "--merge-base", args.base], repo_root
        )
        if diff_result.returncode != 0:
            print(
                f"cannot diff {args.base} against the working tree: {diff_result.stderr.strip()}",
                file=sys.stderr,
            )
            return 2
        diff_lines = diff_result.stdout.splitlines()

    master_path = repo_root / MASTER_REL
    changes_dir = repo_root / CHANGES_REL

    if not master_path.is_file():
        print(
            f"layout changed: {MASTER_REL} not found; update the script and the skill",
            file=sys.stderr,
        )
        return 2
    if not changes_dir.is_dir():
        print(
            f"layout changed: {CHANGES_REL} not found; update the script and the skill",
            file=sys.stderr,
        )
        return 2

    try:
        master_doc = load_yaml(master_path)
    except yaml.YAMLError as exc:
        print(f"cannot parse {MASTER_REL}: {exc}", file=sys.stderr)
        return 2

    has_fail = False

    include_entries = (master_doc or {}).get("databaseChangeLog") or []
    included_file_values: list[str] = []
    for entry in include_entries:
        if isinstance(entry, dict):
            include = entry.get("include")
            if isinstance(include, dict) and include.get("file"):
                included_file_values.append(str(include["file"]))
    included_basenames = [Path(value).name for value in included_file_values]

    actual_paths = sorted(changes_dir.glob("*.yaml"))
    actual_basenames = [path.name for path in actual_paths]

    # --- FAIL: an include pointing at a missing file ---
    missing_includes = [
        value
        for value in included_file_values
        if not (repo_root / RESOURCES_REL / value).is_file()
    ]
    if missing_includes:
        for value in missing_includes:
            print(f"FAIL include points at a missing file: {value}")
        has_fail = True
    else:
        print("OK every master include resolves to a file")

    # --- FAIL: a file in changes/ that is not included ---
    included_set = set(included_basenames)
    not_included = [name for name in actual_basenames if name not in included_set]
    if not_included:
        for name in not_included:
            print(f"FAIL changes/{name} is not included in the master changelog")
        has_fail = True
    else:
        print("OK every file under changes/ is included")

    # --- FAIL: a file included twice ---
    include_counts = Counter(included_basenames)
    duplicated_includes = [name for name, count in include_counts.items() if count > 1]
    if duplicated_includes:
        for name in duplicated_includes:
            print(f"FAIL {name} is included {include_counts[name]} times in the master changelog")
        has_fail = True
    else:
        print("OK no file is included twice")

    # --- FAIL: includes out of ascending number order (pairwise) ---
    numbered_includes = [(name, extract_number(name)) for name in included_basenames]
    order_violations = [
        (prev_name, name)
        for (prev_name, prev_num), (name, num) in zip(numbered_includes, numbered_includes[1:])
        if prev_num is not None and num is not None and num <= prev_num
    ]
    if order_violations:
        for earlier, later in order_violations:
            print(f"FAIL includes out of ascending number order: {later} follows {earlier}")
        has_fail = True
    else:
        print("OK master includes are in ascending number order")

    # --- FAIL: a duplicate number across changes/*.yaml ---
    numbers = [(name, extract_number(name)) for name in actual_basenames]
    number_counts = Counter(number for _, number in numbers if number is not None)
    duplicate_numbers = {n for n, count in number_counts.items() if count > 1}
    if duplicate_numbers:
        for name, number in numbers:
            if number in duplicate_numbers:
                print(f"FAIL duplicate changeset number {number:04d}: {name}")
        has_fail = True
    else:
        print("OK no changeset number is duplicated")

    # --- FAIL: a changeset without id or author; also collect data the WARN
    #     checks below reuse (first id per file, every author seen). ---
    missing_id_or_author: list[str] = []
    parse_errors: list[tuple[str, str]] = []
    file_first_ids: dict[str, Optional[str]] = {}
    all_authors: set[str] = set()
    for path in actual_paths:
        try:
            doc = load_yaml(path)
        except yaml.YAMLError as exc:
            parse_errors.append((path.name, str(exc)))
            continue
        entries = (doc or {}).get("databaseChangeLog") or []
        first_id: Optional[str] = None
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            change_set = entry.get("changeSet")
            if not isinstance(change_set, dict):
                continue
            cs_id = change_set.get("id")
            cs_author = change_set.get("author")
            if first_id is None:
                first_id = cs_id
            if not cs_id or not cs_author:
                missing_id_or_author.append(path.name)
            if cs_author:
                all_authors.add(str(cs_author))
        file_first_ids[path.name] = first_id

    if parse_errors:
        for name, message in parse_errors:
            print(f"FAIL cannot parse changes/{name}: {message}")
        has_fail = True

    if missing_id_or_author:
        for name in sorted(set(missing_id_or_author)):
            print(f"FAIL changes/{name} has a changeset without an id or an author")
        has_fail = True
    elif not parse_errors:
        print("OK every changeset has an id and an author")

    # --- FAIL (with --base): an applied changeset modified or deleted since ---
    if args.base is not None:
        changed_paths: set[str] = set()

        for line in diff_lines:
            if not line.strip():
                continue
            fields = line.split("\t")
            status = fields[0]
            if status.startswith("M") or status.startswith("D"):
                changed_paths.add(fields[-1])

        changes_prefix = f"{CHANGES_REL}/"
        applied_modified = sorted(
            path
            for path in changed_paths
            if path.startswith(changes_prefix) and path.endswith(".yaml")
        )
        if applied_modified:
            for path in applied_modified:
                print(f"FAIL {APPLIED_CHANGESET_MESSAGE.format(path=path)}")
            has_fail = True
        else:
            print(f"OK no applied changeset under changes/ was modified or deleted since {args.base}")

    # --- WARN: file name does not match the naming pattern ---
    bad_names = [name for name in actual_basenames if not FILENAME_RE.match(name)]
    if bad_names:
        for name in bad_names:
            print(f"WARN file name does not match the changeset naming pattern: {name}")
    else:
        print("OK every file name matches the changeset naming pattern")

    # --- WARN: first changeset id differs from the file stem ---
    stem_mismatches = []
    for name, first_id in file_first_ids.items():
        stem = name[: -len(".yaml")] if name.endswith(".yaml") else name
        if first_id is not None and str(first_id) != stem:
            stem_mismatches.append(name)
    if stem_mismatches:
        for name in sorted(stem_mismatches):
            print(f"WARN first changeset id does not match the file stem: {name}")
    else:
        print("OK every first changeset id matches its file stem")

    # --- WARN: more than one distinct author value across all files ---
    if len(all_authors) > 1:
        print(f"WARN more than one distinct changeset author is in use: {', '.join(sorted(all_authors))}")
    else:
        print("OK a single changeset author is in use")

    # --- WARN: a gap in the number sequence ---
    known_numbers = sorted({number for _, number in numbers if number is not None})
    gaps = [
        (previous, current)
        for previous, current in zip(known_numbers, known_numbers[1:])
        if current - previous > 1
    ]
    if gaps:
        for previous, current in gaps:
            print(f"WARN gap in the changeset number sequence between {previous:04d} and {current:04d}")
    else:
        print("OK no gap in the changeset number sequence")

    # --- Next changeset number, and the print-only suggestion ---
    highest = max(known_numbers, default=0)
    next_number_str = f"{highest + 1:04d}"
    print(f"next changeset: {next_number_str}")

    new_file_path = CHANGES_REL / f"{next_number_str}-<description>.yaml"
    new_include_value = f"db/changelog/changes/{next_number_str}-<description>.yaml"
    print(f"new file: {new_file_path}")
    print("append to db.changelog-master.yaml:")
    print("  - include:")
    print(f"      file: {new_include_value}")

    return 1 if has_fail else 0


if __name__ == "__main__":
    sys.exit(main())
