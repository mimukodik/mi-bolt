#!/usr/bin/env python3
"""checks-for-changed-paths.py

Purpose:
    Given a set of changed repo-relative paths (or none, in which case they
    are read from git), report which `.github/components.yml` components are
    triggered, which CI workflow and jobs each one runs (per `ci.yml` and the
    reusable workflow files under `.github/workflows/`), the exact `npm run
    <script>` bodies those jobs invoke (from `frontend/package.json` and
    `tools/package.json`), and the changed, still-existing files under
    `frontend/` for pasting into `npx eslint` / `npx prettier --check`.

    Every fact is read live from `.github/components.yml`, `.github/workflows/
    ci.yml`, the reusable workflow files it references, and the two
    `package.json` files: nothing here is a copied path list, so the output
    cannot drift from those files.

Prerequisites:
    - A git checkout (this script must run inside one).
    - Python 3.12 with PyYAML 6.0.2 (see the command below).

Command (path relative to this skill's directory; from the repository root):
    uv run --no-project --python 3.12 --with PyYAML==6.0.2 python \
        scripts/checks-for-changed-paths.py \
        [--base <git-ref>] [--paths <path> ...] [--json]

    Without --paths, the changed paths are the union of:
      - git diff --name-only <base>...HEAD
      - git diff --name-only HEAD          (staged and unstaged)
      - git ls-files --others --exclude-standard
    <base> defaults to origin/main.

Exit codes:
    0  success (including when no component is triggered)
    2  usage or parse error (bad argument, unresolved --base, a path that is
       not repo-relative, an unsupported glob in components.yml, or a
       component that does not map to exactly one ci.yml job)

Read-only guarantee:
    This script only reads YAML/JSON files under the repository and runs
    `git rev-parse`, `git diff --name-only` and `git ls-files`. It writes
    nothing, starts nothing, and never invokes a shell (every subprocess call
    uses an argument list).
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, NoReturn

import yaml

ALLOWED_PATTERN_CHARS = re.compile(r"^[A-Za-z0-9_./*?-]+$")

ESLINT_SUFFIXES = {".ts", ".js", ".mjs", ".cjs", ".html"}
PRETTIER_SUFFIXES = {".ts", ".js", ".mjs", ".cjs", ".html", ".json", ".md", ".css", ".scss", ".yaml", ".yml"}
PRETTIER_NAMES = {".prettierrc"}


def fail(message: str) -> NoReturn:
    print(f"error: {message}", file=sys.stderr)
    sys.exit(2)


def run_git(repo_root: Path, args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=repo_root,
        capture_output=True,
        text=True,
        check=False,
    )


def find_repo_root() -> Path:
    result = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        fail("not inside a git checkout (git rev-parse --show-toplevel failed)")
    return Path(result.stdout.strip())


def validate_repo_relative_path(path: str) -> None:
    if path.startswith("/") or any(seg in ("", ".", "..") for seg in path.split("/")):
        fail(f"path must be repo-relative: {path}")


def load_yaml(path: Path) -> Any:
    if not path.is_file():
        fail(f"required file not found: {path}")
    try:
        with path.open(encoding="utf-8") as fh:
            return yaml.safe_load(fh)
    except yaml.YAMLError as exc:
        fail(f"could not parse {path}: {exc}")


def load_json(path: Path) -> Any:
    if not path.is_file():
        return None
    with path.open(encoding="utf-8") as fh:
        try:
            return json.load(fh)
        except json.JSONDecodeError as exc:
            fail(f"could not parse {path}: {exc}")


# --- glob matching (dorny/paths-filter's supported subset: '**', '*', '?', literals) ---


def compile_glob(pattern: str) -> list[Any]:
    """Compile a pattern into a list of segment matchers: '**' or a compiled
    per-segment regex. Segments are matched against one path segment each,
    with '**' matching zero or more whole segments."""
    compiled: list[Any] = []
    for seg in pattern.split("/"):
        if seg == "**":
            compiled.append("**")
        else:
            parts = []
            for ch in seg:
                if ch == "*":
                    parts.append("[^/]*")
                elif ch == "?":
                    parts.append("[^/]")
                else:
                    parts.append(re.escape(ch))
            compiled.append(re.compile("^" + "".join(parts) + "$"))
    return compiled


def glob_matches(compiled_segments: list[Any], path: str) -> bool:
    path_segments = path.split("/")

    def rec(pi: int, xi: int) -> bool:
        if pi == len(compiled_segments):
            return xi == len(path_segments)
        seg = compiled_segments[pi]
        if seg == "**":
            if rec(pi + 1, xi):
                return True
            if xi < len(path_segments) and rec(pi, xi + 1):
                return True
            return False
        if xi >= len(path_segments):
            return False
        if not seg.match(path_segments[xi]):
            return False
        return rec(pi + 1, xi + 1)

    return rec(0, 0)


# --- components.yml ---


def load_components(repo_root: Path) -> dict[str, list[str]]:
    components_path = repo_root / ".github" / "components.yml"
    data = load_yaml(components_path)
    if not isinstance(data, dict):
        fail(f"{components_path} must be a mapping of component name to a list of paths")

    components: dict[str, list[str]] = {}
    for name, patterns in data.items():
        if not isinstance(patterns, list) or not all(isinstance(p, str) for p in patterns):
            fail(f"component {name} in .github/components.yml is not a list of strings")
        for pattern in patterns:
            if not ALLOWED_PATTERN_CHARS.match(pattern):
                fail(
                    f"unsupported pattern {pattern} in .github/components.yml; "
                    "dorny/paths-filter semantics not mirrored, update the script"
                )
        components[name] = patterns
    return components


# --- ci.yml: component -> reusable workflow file ---


def load_component_workflows(repo_root: Path, components: dict[str, list[str]]) -> dict[str, str]:
    ci_path = repo_root / ".github" / "workflows" / "ci.yml"
    ci_data = load_yaml(ci_path)
    jobs = ci_data.get("jobs") if isinstance(ci_data, dict) else None
    if not isinstance(jobs, dict):
        fail(f"{ci_path} has no top-level jobs mapping")

    component_to_workflow: dict[str, str] = {}
    for component in components:
        needle = re.compile(rf"needs\.changes\.outputs\.{re.escape(component)}\b")
        matches: list[str] = []
        for job in jobs.values():
            if not isinstance(job, dict):
                continue
            job_if = job.get("if")
            uses = job.get("uses")
            if (
                isinstance(job_if, str)
                and isinstance(uses, str)
                and needle.search(job_if)
                and uses.startswith("./.github/workflows/")
            ):
                matches.append(uses.removeprefix("./.github/workflows/"))
        if len(matches) != 1:
            fail(
                f"component {component} maps to {len(matches)} job(s) in "
                ".github/workflows/ci.yml (expected exactly one)"
            )
        workflow_file = matches[0]
        if not (repo_root / ".github" / "workflows" / workflow_file).is_file():
            fail(f"workflow file {workflow_file} referenced by ci.yml not found")
        component_to_workflow[component] = workflow_file
    return component_to_workflow


# --- changed paths ---


def resolve_base(repo_root: Path, base: str) -> None:
    result = run_git(repo_root, ["rev-parse", "--verify", "--quiet", base])
    if result.returncode != 0:
        fail(f"{base} not found locally; pass --base <ref>")


def changed_paths_from_git(repo_root: Path, base: str) -> tuple[set[str], bool]:
    resolve_base(repo_root, base)

    paths: set[str] = set()
    for args in (
        ["diff", "--name-only", f"{base}...HEAD"],
        ["diff", "--name-only", "HEAD"],
        ["ls-files", "--others", "--exclude-standard"],
    ):
        result = run_git(repo_root, args)
        if result.returncode != 0:
            fail(f"git {' '.join(args)} failed: {result.stderr.strip()}")
        paths.update(line for line in result.stdout.splitlines() if line)
    return paths, base.startswith("origin/")


def normalize_needs(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [str(v) for v in value]
    return [str(value)]


def resolve_dir(step: dict[str, Any], job: dict[str, Any], workflow: dict[str, Any]) -> str:
    """Resolve a run step's working directory: step, then job defaults, then
    workflow defaults, then the repo root."""
    step_wd = step.get("working-directory")
    if step_wd:
        return step_wd
    job_wd = job.get("defaults", {}).get("run", {}).get("working-directory")
    if job_wd:
        return job_wd
    workflow_wd = workflow.get("defaults", {}).get("run", {}).get("working-directory")
    if workflow_wd:
        return workflow_wd
    return "."


PACKAGE_JSON_DIRS = {"frontend", "tools"}


def load_package_scripts(repo_root: Path) -> dict[str, dict[str, str]]:
    result: dict[str, dict[str, str]] = {}
    for d in PACKAGE_JSON_DIRS:
        data = load_json(repo_root / d / "package.json")
        result[d] = data.get("scripts", {}) if isinstance(data, dict) else {}
    return result


def build_job_report(
    workflow: dict[str, Any], package_scripts: dict[str, dict[str, str]]
) -> list[dict[str, Any]]:
    jobs = workflow.get("jobs", {})
    report: list[dict[str, Any]] = []
    for job_name, job in jobs.items():
        if not isinstance(job, dict):
            continue
        job_dir = resolve_dir({}, job, workflow)
        steps_report: list[dict[str, Any]] = []
        for step in job.get("steps", []) or []:
            if not isinstance(step, dict) or "run" not in step:
                continue
            run_text = step["run"]
            step_dir = resolve_dir(step, job, workflow)
            npm_scripts: list[dict[str, Any]] = []
            if step_dir in PACKAGE_JSON_DIRS:
                for script_name in re.findall(r"npm run ([\w:.-]+)", run_text):
                    body = package_scripts.get(step_dir, {}).get(script_name)
                    npm_scripts.append({"name": script_name, "body": body})
            steps_report.append(
                {
                    "name": step.get("name", "(unnamed step)"),
                    "dir": step_dir,
                    "run": run_text,
                    "ci_only_expression": "${{" in run_text or "$GITHUB_" in run_text,
                    "npm_scripts": npm_scripts,
                }
            )
        report.append(
            {
                "name": job_name,
                "needs": normalize_needs(job.get("needs")),
                "dir": job_dir,
                "steps": steps_report,
            }
        )
    return report


def build_report(
    repo_root: Path,
    components: dict[str, list[str]],
    component_workflows: dict[str, str],
    changed_paths: set[str],
    stale_ref_note: bool,
) -> dict[str, Any]:
    package_scripts = load_package_scripts(repo_root)
    sorted_paths = sorted(changed_paths)

    triggered: dict[str, Any] = {}
    not_triggered: list[str] = []
    for component, patterns in components.items():
        compiled = [compile_glob(p) for p in patterns]
        matched_paths = [p for p in sorted_paths if any(glob_matches(c, p) for c in compiled)]
        if not matched_paths:
            not_triggered.append(component)
            continue
        first_match_pattern = next(
            pattern
            for pattern, c in zip(patterns, compiled)
            if any(glob_matches(c, p) for p in matched_paths)
        )
        workflow_file = component_workflows[component]
        workflow_data = load_yaml(repo_root / ".github" / "workflows" / workflow_file)
        triggered[component] = {
            "matched_paths_count": len(matched_paths),
            "first_match_pattern": first_match_pattern,
            "workflow": workflow_file,
            "jobs": build_job_report(workflow_data, package_scripts),
        }

    frontend_files = sorted(
        p.removeprefix("frontend/")
        for p in sorted_paths
        if p.startswith("frontend/") and (repo_root / p).is_file()
    )
    eslint_files = [f for f in frontend_files if Path(f).suffix in ESLINT_SUFFIXES]
    prettier_files = [
        f
        for f in frontend_files
        if Path(f).suffix in PRETTIER_SUFFIXES or Path(f).name in PRETTIER_NAMES
    ]
    neither_files = [f for f in frontend_files if f not in eslint_files and f not in prettier_files]

    return {
        "changed_paths": sorted_paths,
        "stale_remote_ref_note": stale_ref_note,
        "triggered": triggered,
        "not_triggered": not_triggered,
        "frontend_files_for_eslint": eslint_files,
        "frontend_files_for_prettier": prettier_files,
        "frontend_files_for_neither": neither_files,
    }


def render_text(report: dict[str, Any]) -> str:
    lines: list[str] = []
    lines.append(f"changed paths ({len(report['changed_paths'])})")
    for p in report["changed_paths"]:
        lines.append(f"  - {p}")
    if report["stale_remote_ref_note"]:
        lines.append("note: a remote-tracking ref is only as current as the last fetch")
    lines.append("")

    for component, data in report["triggered"].items():
        lines.append(
            f"component {component} <- {data['matched_paths_count']} path(s) "
            f"(first match: {data['first_match_pattern']})"
        )
        lines.append(f"  workflow {data['workflow']}")
        for job in data["jobs"]:
            needs = ", ".join(job["needs"]) if job["needs"] else "none"
            lines.append(f"  job \"{job['name']}\" (dir {job['dir']}, needs {needs})")
            for step in job["steps"]:
                marker = "  [CI-only expression]" if step["ci_only_expression"] else ""
                dir_note = f" (dir {step['dir']})" if step["dir"] != job["dir"] else ""
                lines.append(f"    run{dir_note}: {step['run']}{marker}")
                for npm_script in step["npm_scripts"]:
                    if npm_script["body"] is None:
                        lines.append(
                            f"      WARN script {npm_script['name']} not in {step['dir']}/package.json"
                        )
                    else:
                        lines.append(
                            f"      package.json script \"{npm_script['name']}\": {npm_script['body']}"
                        )
        lines.append("")

    lines.append("not triggered: " + (", ".join(report["not_triggered"]) or "(none)"))
    lines.append("")
    for heading, key in (
        ("frontend files for npx eslint (run from frontend/):", "frontend_files_for_eslint"),
        ("frontend files for npx prettier --check (run from frontend/):", "frontend_files_for_prettier"),
        ("frontend files neither command takes:", "frontend_files_for_neither"),
    ):
        lines.append(heading)
        if report[key]:
            for f in report[key]:
                lines.append(f"  - {f}")
        else:
            lines.append("  (none)")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Report which MiBolt CI components/jobs a set of changed paths triggers."
    )
    parser.add_argument("--base", default="origin/main", help="git ref to diff against (default: origin/main)")
    parser.add_argument("--paths", nargs="+", default=None, help="repo-relative changed paths")
    parser.add_argument("--json", action="store_true", help="emit JSON instead of text")
    args = parser.parse_args()

    repo_root = find_repo_root()

    if args.paths is not None:
        for p in args.paths:
            validate_repo_relative_path(p)
        changed_paths = set(args.paths)
        stale_ref_note = False
    else:
        changed_paths, stale_ref_note = changed_paths_from_git(repo_root, args.base)

    components = load_components(repo_root)
    component_workflows = load_component_workflows(repo_root, components)

    report = build_report(repo_root, components, component_workflows, changed_paths, stale_ref_note)

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(render_text(report))

    sys.exit(0)


if __name__ == "__main__":
    main()
