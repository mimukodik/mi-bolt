"""Focused checks for candidate input hashing and artifact verification.

Run with: uv run --no-project --with PyYAML==6.0.2 python deploy/tests/test-candidate.py
"""

import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "candidate"))
from inputs import hashes  # noqa: E402
from publish import candidate_chart_values, fingerprint, verify  # noqa: E402


class CandidateTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        for name in ("mise.toml", ".github/components.yml", "deploy/compose.yaml",
                     "frontend/Dockerfile", "backend/Dockerfile", "contracts/schema.yaml",
                     "data/catalog/catalog.json",
                     "backend/services/commerce/src/main/resources/db/changelog/root.yaml"):
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(name)
        (self.root / ".github/components.yml").write_text(
            "frontend:\n"
            "  - 'frontend/**'\n  - 'contracts/**'\n  - 'data/catalog/**'\n"
            "  - 'mise.toml'\n  - '.github/**'\n  - 'tools/ci/**'\n"
            "backend:\n"
            "  - 'backend/**'\n  - 'contracts/**'\n  - 'data/catalog/**'\n"
            "  - 'mise.toml'\n  - '.github/**'\n  - 'tools/ci/**'\n")
        (self.root / "deploy/compose.yaml").write_text(
            "services:\n"
            "  web:\n"
            "    build:\n"
            "      context: ../frontend\n"
            "      dockerfile: Dockerfile\n"
            "      additional_contexts: {catalog: ../data/catalog}\n"
            "  commerce:\n"
            "    build:\n"
            "      context: ../backend\n"
            "      dockerfile: services/commerce/Dockerfile\n"
            "      additional_contexts: {contracts: ../contracts, catalog: ../data/catalog}\n")
        subprocess.run(["git", "add", "."], cwd=self.root, check=True)
        self.artifact = self.root / "artifact"
        self.artifact.mkdir()
        self.sha = "a" * 40

    def test_component_hashes_cover_tracked_inputs_and_symlinks(self) -> None:
        initial = hashes(self.root)
        (self.root / "frontend" / "new.txt").write_text("untracked")
        self.assertEqual(hashes(self.root), initial)
        subprocess.run(["git", "add", "frontend/new.txt"], cwd=self.root, check=True)
        changed = hashes(self.root)
        self.assertNotEqual(changed["web"], initial["web"])
        self.assertEqual(changed["commerce"], initial["commerce"])
        (self.root / "backend" / "wrapper-link").symlink_to("Dockerfile")
        subprocess.run(["git", "add", "backend/wrapper-link"], cwd=self.root, check=True)
        linked = hashes(self.root)
        self.assertNotEqual(linked["commerce"], changed["commerce"])
        (self.root / "backend" / "Dockerfile").chmod(0o755)
        subprocess.run(["git", "add", "backend/Dockerfile"], cwd=self.root, check=True)
        self.assertNotEqual(hashes(self.root)["commerce"], linked["commerce"])
        (self.root / "backend" / "wrapper-link").unlink()
        (self.root / "backend" / "wrapper-link").symlink_to("/etc/passwd")
        with self.assertRaisesRegex(ValueError, "invalid tracked build input"):
            hashes(self.root)

    def test_filter_change_fails_and_template_fingerprint_tracks_db_and_catalog(self) -> None:
        original = fingerprint(self.root)
        (self.root / "frontend/Dockerfile").write_text("new frontend build")
        self.assertEqual(fingerprint(self.root), original)
        migration = self.root / "backend/services/commerce/src/main/resources/db/changelog/root.yaml"
        migration.write_text("changed migration")
        self.assertNotEqual(fingerprint(self.root), original)
        after_migration = fingerprint(self.root)
        (self.root / "data/catalog/catalog.json").write_text("changed catalogue")
        self.assertNotEqual(fingerprint(self.root), after_migration)
        (self.root / ".github/components.yml").write_text("frontend: []\nbackend: []\n")
        with self.assertRaisesRegex(ValueError, "path filter diverged"):
            hashes(self.root)

    def test_chart_values_preserve_original_image_build_commits(self) -> None:
        images = {component: {"repository": f"ghcr.io/example/{component}",
                              "digest": "sha256:" + char * 64,
                              "buildCommit": char * 40}
                  for component, char in (("web", "b"), ("commerce", "c"))}
        values = {"candidate": {}, "web": {"image": {}}, "commerce": {"image": {}}}
        baked = candidate_chart_values(values, "pr-123-" + self.sha[:12], self.sha, images, 456)
        self.assertEqual(baked["candidate"], {
            "id": "pr-123-" + self.sha[:12], "headCommit": self.sha, "publisherRunId": 456,
            "webCommit": "b" * 40, "commerceCommit": "c" * 40})
        self.assertEqual(baked["web"]["image"]["digest"], "sha256:" + "b" * 64)

    def test_build_artifact_is_data_with_recomputed_source_hashes(self) -> None:
        image_hashes = hashes(self.root)
        archives = {}
        for component in ("web", "commerce"):
            data = f"synthetic-{component}".encode()
            (self.artifact / f"{component}.tar").write_bytes(data)
            archives[component] = {"file": f"{component}.tar",
                                   "sha256": hashlib.sha256(data).hexdigest()}
        metadata = {"schemaVersion": 1, "repo": "mimukodik/mi-bolt", "pr": 123,
                    "headSha": self.sha, "sourceRunId": 456,
                    "inputHashes": image_hashes, "archives": archives}
        (self.artifact / "build.json").write_text(json.dumps(metadata))
        previous_repo = os.environ.get("GITHUB_REPOSITORY")
        os.environ["GITHUB_REPOSITORY"] = "mimukodik/mi-bolt"
        try:
            import publish
            publish.REPO = "mimukodik/mi-bolt"
            self.assertEqual(verify(self.artifact, self.root, 123, self.sha, 456), image_hashes)
            metadata["inputHashes"]["web"] = "0" * 64
            (self.artifact / "build.json").write_text(json.dumps(metadata))
            with self.assertRaisesRegex(ValueError, "build input hash mismatch"):
                verify(self.artifact, self.root, 123, self.sha, 456)
        finally:
            if previous_repo is None:
                os.environ.pop("GITHUB_REPOSITORY", None)
            else:
                os.environ["GITHUB_REPOSITORY"] = previous_repo

    def test_publisher_requires_matching_workflows_and_ci_ok(self) -> None:
        import publish
        pr = {"number": 123, "state": "open",
              "base": {"repo": {"full_name": "mimukodik/mi-bolt"}},
              "head": {"sha": self.sha, "ref": "feature",
                       "repo": {"full_name": "mimukodik/mi-bolt"}}}

        def run(workflow: str, run_id: int) -> dict:
            return {"id": run_id, "conclusion": "success", "head_sha": self.sha,
                    "event": "pull_request", "path": f".github/workflows/{workflow}",
                    "repository": {"full_name": "mimukodik/mi-bolt"},
                    "head_repository": {"full_name": "mimukodik/mi-bolt"},
                    "head_branch": "feature", "pull_requests": [{"number": 123}]}

        ci = run("ci.yml", 1)
        build = run("candidate.yml", 2)

        def mock_api(path: str, query=None):
            if path == "actions/workflows/ci.yml/runs":
                return {"workflow_runs": [ci]}
            if path == "actions/workflows/candidate.yml/runs":
                return {"workflow_runs": [build]}
            if path == "actions/runs/1/jobs":
                return {"jobs": [{"name": "ci-ok", "conclusion": "success"}]}
            if path == "pulls/123":
                return pr
            raise AssertionError(path)

        with patch.object(publish, "api", side_effect=mock_api), \
                patch.object(publish, "REPO", "mimukodik/mi-bolt"):
            self.assertEqual(publish.choose_runs(pr, self.sha), (ci, build))
            build["conclusion"] = "failure"
            self.assertIsNone(publish.choose_runs(pr, self.sha))
            build["conclusion"] = "success"
            ci["path"] = ".github/workflows/other.yml"
            self.assertIsNone(publish.choose_runs(pr, self.sha))
            ci["path"] = ".github/workflows/ci.yml"
            pr["state"] = "closed"
            with self.assertRaisesRegex(ValueError, "PR closed or head changed"):
                publish.current_pr(123, self.sha)


if __name__ == "__main__":
    unittest.main()
