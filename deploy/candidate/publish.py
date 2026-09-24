"""Trusted candidate publisher. Run only from the default-branch workflow_run.

PR contents are read as data. This file, the chart, and the hash algorithm must
come from the trusted default-branch checkout, never from the PR checkout.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import yaml

from inputs import file_digest, hashes, tracked_files


REPO = os.environ.get("GITHUB_REPOSITORY", "")
TOKEN = os.environ.get("GH_TOKEN", "")
SHA = re.compile(r"[a-f0-9]{40}\Z")
HEX = re.compile(r"[a-f0-9]{64}\Z")
CHART_REPOSITORY = "ghcr.io/mimukodik/mi-bolt/charts/mi-bolt"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def api(path: str, query: dict[str, str] | None = None) -> dict | list:
    require(bool(TOKEN), "GH_TOKEN is required")
    url = f"https://api.github.com/repos/{REPO}/{path}"
    if query:
        url += "?" + urlencode(query)
    request = Request(url, headers={"Authorization": f"Bearer {TOKEN}",
                                    "Accept": "application/vnd.github+json",
                                    "X-GitHub-Api-Version": "2022-11-28"})
    with urlopen(request, timeout=20) as response:
        return json.load(response)


def runs(workflow: str, head_sha: str, pr: dict | None) -> list[dict]:
    event = "pull_request" if pr is not None else "push"
    data = api(f"actions/workflows/{workflow}/runs",
               {"event": event, "head_sha": head_sha, "per_page": "100"})
    return [run for run in data["workflow_runs"]
            if run["head_sha"] == head_sha
            and run["event"] == event
            and run.get("repository", {}).get("full_name") == REPO
            and run.get("path", "").split("@", 1)[0] == f".github/workflows/{workflow}"
            and ((pr is None and run.get("head_branch") == "main")
                 or (pr is not None and (any(item["number"] == pr["number"] for item in run.get("pull_requests", []))
                 or (not run.get("pull_requests") and
                     run.get("head_repository", {}).get("full_name") ==
                     pr["head"]["repo"]["full_name"] and
                     run.get("head_branch") == pr["head"]["ref"]))))]


def ci_ok(run_id: int) -> bool:
    jobs = api(f"actions/runs/{run_id}/jobs", {"per_page": "100"})["jobs"]
    return any(job["name"] == "ci-ok" and job["conclusion"] == "success" for job in jobs)


def current_pr(number: int, head_sha: str) -> dict:
    pr = api(f"pulls/{number}")
    require(pr["state"] == "open" and pr["head"]["sha"] == head_sha,
            "PR closed or head changed")
    require(pr["base"]["repo"]["full_name"] == REPO, "PR target repository changed")
    require(pr["head"]["repo"]["full_name"] == REPO,
            "fork PRs are not eligible for automatic publication")
    return pr


def choose_runs(pr: dict | None, head_sha: str) -> tuple[dict, dict] | None:
    ci = runs("ci.yml", head_sha, pr)
    build = runs("candidate.yml", head_sha, pr)
    if not ci or not build:
        return None
    latest_ci = max(ci, key=lambda run: run["id"])
    latest_build = max(build, key=lambda run: run["id"])
    if latest_ci["conclusion"] != "success" or latest_build["conclusion"] != "success":
        return None
    if not ci_ok(latest_ci["id"]):
        return None
    return latest_ci, latest_build


def write_outputs(values: dict) -> None:
    with Path(os.environ["GITHUB_OUTPUT"]).open("a", encoding="utf-8") as output:
        for key, value in values.items():
            output.write(f"{key}={value}\n")


def resolve(event_path: Path) -> None:
    event = json.loads(event_path.read_text())["workflow_run"]
    require(event["name"] in {"CI", "Candidate Build"}, "unexpected source workflow")
    if event["conclusion"] != "success" or event["event"] not in {"pull_request", "push"}:
        write_outputs({"ready": "false"})
        return
    head_sha = event["head_sha"]
    require(bool(SHA.fullmatch(head_sha)), "invalid source SHA")
    if event["event"] == "push":
        if (event.get("head_branch") != "main"
                or event.get("repository", {}).get("full_name") != REPO
                or api("commits/main")["sha"] != head_sha):
            write_outputs({"ready": "false"})
            return
        chosen = choose_runs(None, head_sha)
        if chosen is None:
            write_outputs({"ready": "false"})
            return
        ci, build = chosen
        write_outputs({"ready": "true", "pr": 0, "head_sha": head_sha,
                       "source_repository": REPO, "ci_run_id": ci["id"],
                       "build_run_id": build["id"], "candidate_id": f"main-{head_sha[:12]}"})
        return
    # A fork run may have no pull_requests association. Match the live open PR
    # by both its tested head and head repository rather than trusting the run.
    prs = api("pulls", {"state": "open", "per_page": "100"})
    matches = [pr for pr in prs if pr["head"]["sha"] == head_sha and
               pr["head"]["repo"]["full_name"] == REPO and
               pr["head"]["repo"]["full_name"] ==
               event.get("head_repository", {}).get("full_name")]
    if len(matches) != 1:
        write_outputs({"ready": "false"})
        return
    pr = current_pr(matches[0]["number"], head_sha)
    chosen = choose_runs(pr, head_sha)
    if chosen is None:
        write_outputs({"ready": "false"})
        return
    ci, build = chosen
    candidate_id = f"pr-{pr['number']}-{head_sha[:12]}"
    require(len(candidate_id) <= 63, "candidate ID too long")
    write_outputs({"ready": "true", "pr": pr["number"], "head_sha": head_sha,
                   "source_repository": pr["head"]["repo"]["full_name"],
                   "ci_run_id": ci["id"], "build_run_id": build["id"],
                   "candidate_id": candidate_id})


def fresh(pr_number: int, head_sha: str, ci_run_id: int, build_run_id: int) -> None:
    if pr_number == 0:
        require(api("commits/main")["sha"] == head_sha, "main advanced before publication")
        pr = None
    else:
        pr = current_pr(pr_number, head_sha)
    chosen = choose_runs(pr, head_sha)
    require(chosen is not None and chosen[0]["id"] == ci_run_id and
            chosen[1]["id"] == build_run_id, "CI or candidate build is no longer current")


def verify(artifact: Path, source: Path, pr_number: int, head_sha: str,
           build_run_id: int) -> dict[str, str]:
    require(artifact.is_dir() and not artifact.is_symlink(), "invalid artifact directory")
    require({p.name for p in artifact.iterdir()} == {"build.json", "web.tar", "commerce.tar"},
            "unexpected artifact contents")
    require(all(p.is_file() and not p.is_symlink() for p in artifact.iterdir()),
            "artifact files must be regular files")
    metadata = json.loads((artifact / "build.json").read_text())
    require(metadata["schemaVersion"] == 1 and metadata["repo"] == REPO and
            metadata["pr"] == pr_number and metadata["headSha"] == head_sha and
            metadata["sourceRunId"] == build_run_id, "build metadata identity mismatch")
    # Confirm the untrusted Compose file still names the bounded build
    # contexts. Bake runs from deploy/, so ../ paths resolve inside checkout.
    compose = yaml.safe_load((source / "deploy/compose.yaml").read_text())
    expected_builds = {
        "web": {"context": "../frontend", "dockerfile": "Dockerfile",
                "additional_contexts": {"catalog": "../data/catalog"}},
        "commerce": {"context": "../backend",
                     "dockerfile": "services/commerce/Dockerfile",
                     "additional_contexts": {"contracts": "../contracts",
                                             "catalog": "../data/catalog"}},
    }
    for component, expected_build in expected_builds.items():
        build = compose["services"][component]["build"]
        require({key: build.get(key, "Dockerfile" if key == "dockerfile" else None)
                 for key in expected_build} == expected_build,
                f"{component} Compose build contexts changed")
    expected = hashes(source)
    require(metadata["inputHashes"] == expected, "build input hash mismatch")
    for component in ("web", "commerce"):
        info = metadata["archives"][component]
        require(info["file"] == f"{component}.tar" and bool(HEX.fullmatch(info["sha256"])),
                "invalid archive metadata")
        with (artifact / info["file"]).open("rb") as stream:
            actual = hashlib.file_digest(stream, "sha256").hexdigest()
        require(actual == info["sha256"], f"{component} archive checksum mismatch")
    return expected


def docker(*args: str, input: str | None = None) -> str:
    result = subprocess.run(["docker", *args], input=input, text=True, capture_output=True)
    require(result.returncode == 0, f"docker {args[0]} failed: {result.stderr}")
    return result.stdout.strip()


def image_label(image: str) -> str:
    return docker("image", "inspect", "--format",
                  '{{ index .Config.Labels "org.opencontainers.image.revision" }}', image)


def publish_images(artifact: Path, input_hashes: dict[str, str], head_sha: str) -> dict:
    images = {}
    for component in ("web", "commerce"):
        repository = f"ghcr.io/{REPO}-{component}".lower()
        image_hash = input_hashes[component]
        remote = f"{repository}:sha256-{image_hash}"
        # Content-hash tags are write-once in this workflow. When an existing
        # tag is reused, preserve its original build commit from the image.
        found = subprocess.run(["docker", "pull", remote], text=True, capture_output=True)
        if found.returncode != 0:
            require(re.search(r"manifest unknown|not found", found.stderr, re.IGNORECASE) is not None,
                    f"registry lookup failed for {component}: {found.stderr}")
            docker("load", "--input", str(artifact / f"{component}.tar"))
            local = f"mi-bolt-{component}:input-{image_hash}"
            require(image_label(local) == head_sha, f"{component} archive revision label mismatch")
            docker("tag", local, remote)
            docker("push", remote)
            docker("pull", remote)
        original_commit = image_label(remote)
        require(bool(SHA.fullmatch(original_commit)), f"{component} missing original build commit")
        repo_digest = docker("image", "inspect", "--format", "{{ index .RepoDigests 0 }}", remote)
        prefix = repository + "@sha256:"
        require(repo_digest.startswith(prefix) and bool(HEX.fullmatch(repo_digest[len(prefix):])),
                f"{component} invalid registry digest")
        images[component] = {"repository": repository, "digest": repo_digest.split("@", 1)[1],
                             "inputHash": image_hash, "buildCommit": original_commit}
    return images


def candidate_chart_values(values: dict, candidate_id: str, head_sha: str, images: dict, publisher_run_id: int) -> dict:
    values["candidate"].update({"id": candidate_id, "headCommit": head_sha,
                                "publisherRunId": publisher_run_id,
                                "webCommit": images["web"]["buildCommit"],
                                "commerceCommit": images["commerce"]["buildCommit"]})
    for component in ("web", "commerce"):
        values[component]["image"].update({"repository": images[component]["repository"],
                                           "digest": images[component]["digest"]})
    return values


def package_chart(chart_source: Path, output: Path, candidate_id: str, head_sha: str,
                  images: dict, trusted_revision: str, stable: bool = False) -> dict:
    chart_copy = output / "chart" / "mi-bolt"
    shutil.copytree(chart_source, chart_copy)
    values_path = chart_copy / "values.yaml"
    values = candidate_chart_values(yaml.safe_load(values_path.read_text()),
                                    candidate_id, head_sha, images, int(os.environ["GITHUB_RUN_ID"]))
    values_path.write_text(yaml.safe_dump(values, sort_keys=False))
    version = f"0.2.{os.environ['GITHUB_RUN_ID']}" if stable else f"0.1.0-pr.{candidate_id.replace('-', '.')}.run.{os.environ['GITHUB_RUN_ID']}"
    packaged = subprocess.run(["helm", "package", str(chart_copy), "--destination", str(output),
                               "--version", version], text=True, capture_output=True)
    require(packaged.returncode == 0, f"helm package failed: {packaged.stderr}")
    archive = output / f"mi-bolt-{version}.tgz"
    pushed = subprocess.run(["helm", "push", str(archive),
                             "oci://ghcr.io/mimukodik/mi-bolt/charts"],
                            text=True, capture_output=True)
    require(pushed.returncode == 0, f"helm push failed: {pushed.stderr}")
    match = re.search(r"Digest:\s*(sha256:[a-f0-9]{64})", pushed.stdout + pushed.stderr)
    require(match is not None, "helm push did not report chart digest")
    return {"repository": CHART_REPOSITORY, "digest": match.group(1),
            "revision": trusted_revision}


def fingerprint(source: Path) -> str:
    """Fingerprint the tracked Liquibase templates and packaged catalogue."""
    prefixes = ("backend/services/commerce/src/main/resources/db/", "data/catalog/")
    selected = {path: mode for path, mode in tracked_files(source).items()
                if path.startswith(prefixes)}
    require(any(path.startswith(prefixes[0]) for path in selected), "missing tracked DB templates")
    require(any(path.startswith(prefixes[1]) for path in selected), "missing tracked catalogue")
    return file_digest(source, selected, include_mode=False)


def publish(args: argparse.Namespace) -> None:
    require(REPO == "mimukodik/mi-bolt", "unexpected target repository")
    require(bool(SHA.fullmatch(args.head_sha)) and bool(SHA.fullmatch(args.publisher_revision)),
            "invalid source or publisher revision")
    fresh(args.pr, args.head_sha, args.ci_run_id, args.build_run_id)
    input_hashes = verify(args.artifact, args.source, args.pr, args.head_sha, args.build_run_id)
    fresh(args.pr, args.head_sha, args.ci_run_id, args.build_run_id)
    images = publish_images(args.artifact, input_hashes, args.head_sha)
    fresh(args.pr, args.head_sha, args.ci_run_id, args.build_run_id)
    chart_source = Path(__file__).resolve().parents[1] / "helm" / "mi-bolt"
    args.output.mkdir(parents=True, exist_ok=True)
    chart = package_chart(chart_source, args.output, args.candidate_id,
                          args.head_sha, images, args.publisher_revision, stable=args.pr == 0)
    receipt = {"schemaVersion": 1, "candidateId": args.candidate_id,
               "repo": REPO, "pr": args.pr, "headSha": args.head_sha,
               "testedSha": args.head_sha, "sourceRunId": args.build_run_id,
               "ciRunId": args.ci_run_id, "publisherRunId": int(os.environ["GITHUB_RUN_ID"]),
               "publisherRevision": args.publisher_revision, "inputHashes": input_hashes,
               "images": images, "chart": chart,
               "templateFingerprint": fingerprint(args.source)}
    (args.output / "candidate.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    fresh(args.pr, args.head_sha, args.ci_run_id, args.build_run_id)


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    resolution = sub.add_parser("resolve")
    resolution.add_argument("--event", required=True, type=Path)
    publication = sub.add_parser("publish")
    publication.add_argument("--artifact", required=True, type=Path)
    publication.add_argument("--source", required=True, type=Path)
    publication.add_argument("--output", required=True, type=Path)
    publication.add_argument("--pr", required=True, type=int)
    publication.add_argument("--head-sha", required=True)
    publication.add_argument("--ci-run-id", required=True, type=int)
    publication.add_argument("--build-run-id", required=True, type=int)
    publication.add_argument("--candidate-id", required=True)
    publication.add_argument("--publisher-revision", required=True)
    args = parser.parse_args()
    if args.command == "resolve":
        resolve(args.event)
    else:
        publish(args)


if __name__ == "__main__":
    try:
        main()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        print(f"candidate publisher: {error}", file=sys.stderr)
        sys.exit(1)
