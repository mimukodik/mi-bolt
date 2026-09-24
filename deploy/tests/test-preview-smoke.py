"""Behavior checks for the trusted preview smoke gate and retry scheduler."""

import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "candidate"))
import preview_smoke as smoke  # noqa: E402


PUBLISHER_SHA = "a" * 40
HEAD = "b" * 40
WEB_DIGEST = "sha256:" + "c" * 64
COMMERCE_DIGEST = "sha256:" + "d" * 64


def candidate(pr=123, run_id=456, head=HEAD):
    return {"repo": smoke.REPO, "pr": pr, "headSha": head,
            "publisherRunId": run_id, "publisherRevision": PUBLISHER_SHA,
            "candidateId": f"pr-{pr}-{head[:12]}",
            "images": {"web": {"digest": WEB_DIGEST},
                       "commerce": {"digest": COMMERCE_DIGEST}},
            "chart": {"digest": "sha256:" + "e" * 64}}


def publisher_run(run_id=456):
    return {"id": run_id, "name": "Publish Candidate", "conclusion": "success",
            "event": "workflow_run", "path": ".github/workflows/publish-candidate.yml",
            "head_branch": "main", "head_sha": PUBLISHER_SHA,
            "repository": {"full_name": smoke.REPO}}


def pr_state(pr=123, head=HEAD, state="open"):
    return {"number": pr, "state": state, "head": {"sha": head}}


class PreviewSmokeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def test_public_fence_rejects_either_image_head_and_readiness(self):
        receipt = candidate()
        expected = {"candidateId": receipt["candidateId"], "headSha": HEAD, "publisherRunId": 456,
                    "images": {"web": WEB_DIGEST, "commerce": COMMERCE_DIGEST}}

        def request(observed, health="UP"):
            calls = []

            def open_url(url, timeout):
                calls.append(url)
                body = observed if "/__candidate.json" in url else {"status": health}
                return io.BytesIO(json.dumps(body).encode())

            with patch.object(smoke, "urlopen", side_effect=open_url):
                return smoke.fence(receipt), calls

        origin, calls = request(expected)
        self.assertEqual(origin, "https://bolt-pr-123.mimukodik.hu")
        self.assertIn("/__candidate.json?t=", calls[0])
        self.assertEqual(calls[1], origin + "/api/v1/actuator/health/readiness")
        for mutation in (
            {**expected, "publisherRunId": 457},
            {**expected, "headSha": "f" * 40},
            {**expected, "images": {**expected["images"], "web": "sha256:" + "f" * 64}},
            {**expected, "images": {**expected["images"], "commerce": "sha256:" + "f" * 64}},
        ):
            with self.subTest(mutation=mutation), patch.object(
                    smoke, "urlopen", return_value=io.BytesIO(json.dumps(mutation).encode())):
                with self.assertRaisesRegex(ValueError, "not the requested candidate"):
                    smoke.fence(receipt)
        with patch.object(smoke, "urlopen", side_effect=lambda url, timeout:
                          io.BytesIO(json.dumps(expected if "/__candidate.json" in url
                                                else {"status": "DOWN"}).encode())):
            with self.assertRaisesRegex(ValueError, "backend not ready"):
                smoke.fence(receipt)

    def test_resolve_requires_artifact_and_current_open_head(self):
        event_path = self.directory / "event.json"
        event_path.write_text(json.dumps({"workflow_run": publisher_run()}))
        output = self.directory / "output"

        def api(path):
            if path == "actions/runs/456/artifacts":
                return {"artifacts": [{"name": "candidate-receipt", "expired": False,
                                       "size_in_bytes": 1000}]}
            if path == "pulls/123":
                return self.pr
            raise AssertionError(path)

        def download_run(args, check):
            (Path(args[-1]) / "candidate.json").write_text(json.dumps(candidate()))

        environment = {"GITHUB_EVENT_NAME": "workflow_run",
                       "GITHUB_EVENT_PATH": str(event_path),
                       "GITHUB_OUTPUT": str(output), "GITHUB_SHA": PUBLISHER_SHA}
        self.pr = pr_state()
        with patch.dict(os.environ, environment), patch.object(smoke, "api", side_effect=api), \
                patch.object(smoke.subprocess, "run", side_effect=download_run):
            event_path.write_text(json.dumps({"workflow_run": {**publisher_run(),
                                                                "conclusion": "failure"}}))
            with self.assertRaisesRegex(ValueError, "unexpected publisher"):
                smoke.resolve()
            event_path.write_text(json.dumps({"workflow_run": publisher_run()}))
            with patch.object(smoke, "api", return_value={"artifacts": []}):
                smoke.resolve()
            self.assertEqual(output.read_text(), "ready=false\n")
            output.write_text("")
            self.pr = pr_state(head="f" * 40)
            smoke.resolve()
            self.assertEqual(output.read_text(), "ready=false\n")
            output.write_text("")
            self.pr = pr_state(state="closed")
            smoke.resolve()
            self.assertEqual(output.read_text(), "ready=false\n")
            output.write_text("")
            self.pr = pr_state()
            old = Path.cwd()
            os.chdir(self.directory)
            try:
                smoke.resolve()
            finally:
                os.chdir(old)
            self.assertIn("ready=true\n", output.read_text())
            self.assertEqual(json.loads((self.directory / "candidate.json").read_text())["headSha"], HEAD)

    def test_wait_checks_pr_before_public_fence_and_retries_late_admission(self):
        receipt = candidate()
        with patch.object(smoke, "api", return_value=pr_state(state="closed")), \
                patch.object(smoke, "fence") as fence:
            with self.assertRaisesRegex(ValueError, "closed or candidate superseded"):
                smoke.wait(receipt)
            fence.assert_not_called()
        with patch.object(smoke, "api", return_value=pr_state(head="f" * 40)), \
                patch.object(smoke, "fence") as fence:
            with self.assertRaisesRegex(ValueError, "closed or candidate superseded"):
                smoke.wait(receipt)
            fence.assert_not_called()
        with patch.object(smoke, "api", return_value=pr_state()), \
                patch.object(smoke, "fence", side_effect=[ValueError("capacity pending"), "origin"]) as fence, \
                patch.object(smoke.time, "monotonic", side_effect=[0, 1, 2]), \
                patch.object(smoke.time, "sleep") as sleep:
            smoke.wait(receipt)
            self.assertEqual(fence.call_count, 2)
            sleep.assert_called_once_with(15)

    def test_passed_requires_two_clean_flows_and_postrun_fence(self):
        report = self.directory / "report.json"
        summary = self.directory / "summary"
        receipt = candidate()
        environment = {"GITHUB_STEP_SUMMARY": str(summary)}
        old = Path.cwd()
        os.chdir(self.directory)
        try:
            with patch.dict(os.environ, environment), patch.object(smoke, "api", return_value=pr_state()), \
                    patch.object(smoke, "fence", return_value="https://bolt-pr-123.mimukodik.hu") as fence:
                for stats in ({"expected": 1}, {"expected": 2, "skipped": 1},
                              {"expected": 2, "flaky": 1}, {"expected": 2, "unexpected": 1}):
                    report.write_text(json.dumps({"stats": stats}))
                    with self.subTest(stats=stats), self.assertRaisesRegex(ValueError, "both flows"):
                        smoke.passed(receipt, report)
                self.assertFalse((self.directory / "smoke.json").exists())
                report.write_text(json.dumps({"stats": {"expected": 2, "unexpected": 0,
                                                       "flaky": 0, "skipped": 0}}))
                with patch.object(smoke, "api", return_value=pr_state(state="closed")):
                    with self.assertRaisesRegex(ValueError, "PR changed"):
                        smoke.passed(receipt, report)
                with patch.object(smoke, "api", return_value=pr_state(head="f" * 40)):
                    with self.assertRaisesRegex(ValueError, "PR changed"):
                        smoke.passed(receipt, report)
                self.assertFalse((self.directory / "smoke.json").exists())
                smoke.passed(receipt, report)
                fence.assert_called_once_with(receipt)
                self.assertEqual(json.loads((self.directory / "smoke.json").read_text()), {
                    "headSha": HEAD, "publisherRunId": 456,
                    "chartDigest": "sha256:" + "e" * 64,
                    "result": "passed", "url": "https://bolt-pr-123.mimukodik.hu"})
        finally:
            os.chdir(old)

    def test_schedule_recovers_late_admission_and_skips_accepted_receipt(self):
        receipt = candidate()
        paths = {
            "pulls?state=open&per_page=100": [pr_state()],
            "actions/workflows/publish-candidate.yml/runs?status=success&per_page=100":
                {"workflow_runs": [publisher_run()]},
            "actions/runs/456/artifacts": {"artifacts": [
                {"name": "candidate-receipt", "expired": False}]},
            "actions/workflows/preview-smoke.yml/runs?status=success&per_page=100":
                {"workflow_runs": []},
        }
        with patch.dict(os.environ, {"GITHUB_SHA": PUBLISHER_SHA}), \
                patch.object(smoke, "api", side_effect=lambda path: paths[path]), \
                patch.object(smoke, "download", return_value=receipt), \
                patch.object(smoke, "fence", side_effect=[ValueError("not deployed"), "origin"]):
            self.assertIsNone(smoke.scheduled_publisher())
            self.assertEqual(smoke.scheduled_publisher(), publisher_run())
        paths["actions/workflows/preview-smoke.yml/runs?status=success&per_page=100"] = {
            "workflow_runs": [{"id": 789, "head_sha": PUBLISHER_SHA}]}
        paths["actions/runs/789/artifacts"] = {"artifacts": [
            {"name": "preview-smoke-receipt", "expired": False}]}
        with patch.dict(os.environ, {"GITHUB_SHA": PUBLISHER_SHA}), \
                patch.object(smoke, "api", side_effect=lambda path: paths[path]), \
                patch.object(smoke, "download", side_effect=lambda run_id, artifact, filename:
                             {"publisherRunId": 456} if artifact == "preview-smoke-receipt" else receipt), \
                patch.object(smoke, "fence", return_value="origin"):
            self.assertIsNone(smoke.scheduled_publisher())

    def test_schedule_selects_unaccepted_preview_when_another_is_accepted(self):
        receipts = {456: candidate(pr=123, run_id=456), 457: candidate(pr=124, run_id=457)}
        paths = {
            "pulls?state=open&per_page=100": [pr_state(pr=123), pr_state(pr=124)],
            "actions/workflows/publish-candidate.yml/runs?status=success&per_page=100":
                {"workflow_runs": [publisher_run(456), publisher_run(457)]},
            "actions/runs/456/artifacts": {"artifacts": [
                {"name": "candidate-receipt", "expired": False}]},
            "actions/runs/457/artifacts": {"artifacts": [
                {"name": "candidate-receipt", "expired": False}]},
            "actions/workflows/preview-smoke.yml/runs?status=success&per_page=100":
                {"workflow_runs": [{"id": 789, "head_sha": PUBLISHER_SHA}]},
            "actions/runs/789/artifacts": {"artifacts": [
                {"name": "preview-smoke-receipt", "expired": False}]},
        }

        def download(run_id, artifact, filename):
            return {"publisherRunId": 456} if artifact == "preview-smoke-receipt" else receipts[run_id]

        with patch.dict(os.environ, {"GITHUB_SHA": PUBLISHER_SHA}), \
                patch.object(smoke, "api", side_effect=lambda path: paths[path]), \
                patch.object(smoke, "download", side_effect=download), \
                patch.object(smoke, "fence", return_value="origin"), \
                patch.object(smoke.time, "time", return_value=0):
            self.assertEqual(smoke.scheduled_publisher()["id"], 457)

    def test_workflow_checks_out_only_approved_publisher_revision(self):
        workflow = Path(__file__).resolve().parents[2] / ".github/workflows/preview-smoke.yml"
        steps = yaml.safe_load(workflow.read_text())["jobs"]["smoke"]["steps"]
        checkouts = [step for step in steps if step.get("uses", "").startswith("actions/checkout@")]
        self.assertEqual({step["with"]["path"] for step in checkouts}, {"trusted", "source"})
        for step in checkouts:
            self.assertEqual(step["with"]["ref"], "${{ github.sha }}")
            self.assertIs(step["with"]["persist-credentials"], False)
        self.assertFalse(any("pull_request.head.sha" in json.dumps(step) for step in steps))


if __name__ == "__main__":
    unittest.main()
