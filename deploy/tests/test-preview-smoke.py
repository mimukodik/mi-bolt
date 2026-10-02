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
    return {"number": pr, "state": state, "head": {"sha": head},
            "labels": [{"name": "bolt-preview"}]}


class PreviewSmokeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def test_label_finds_exact_event_head_after_publication(self):
        payload = {'action': 'labeled', 'label': {'name': 'bolt-preview'},
                   'pull_request': {**pr_state(), 'head': {
                       'sha': HEAD, 'repo': {'full_name': smoke.REPO}}}}
        paths = {
            'pulls/123': pr_state(),
            'actions/workflows/publish-candidate.yml/runs?status=success&per_page=100&page=1':
                {'workflow_runs': [publisher_run(458), publisher_run(457), publisher_run()]},
            'actions/runs/458/artifacts': {'artifacts': []},
            'actions/runs/457/artifacts': {'artifacts': [
                {'name': 'candidate-receipt', 'expired': False, 'size_in_bytes': 1000}]},
            'actions/runs/456/artifacts': {'artifacts': [
                {'name': 'candidate-receipt', 'expired': False, 'size_in_bytes': 1000}]},
        }
        def download_run(args, check):
            run_id = int(args[3])
            receipt = candidate(pr=124, run_id=457) if run_id == 457 else candidate()
            (Path(args[-1]) / 'candidate.json').write_text(json.dumps(receipt))

        with patch.object(smoke, 'api', side_effect=lambda path: paths[path]), \
                patch.object(smoke.subprocess, 'run', side_effect=download_run):
            self.assertEqual(smoke.labeled_receipt(payload), candidate())

    def test_label_dispatches_existing_smoke_on_main_and_rechecks_freshness(self):
        event_path = self.directory / 'event.json'
        event_path.write_text('{}')
        with patch.dict(os.environ, {'GITHUB_EVENT_PATH': str(event_path)}), \
                patch.object(smoke, 'labeled_receipt', return_value=candidate()) as lookup, \
                patch.object(smoke, 'api', return_value=pr_state()) as api, \
                patch.object(smoke.subprocess, 'run') as run:
            smoke.dispatch()
            run.assert_called_once_with(['gh', 'workflow', 'run', 'preview-smoke.yml',
                '--repo', smoke.REPO, '--ref', 'main', '-f', 'publisher_run_id=456'], check=True)
            for current in (pr_state(state='closed'), pr_state(head='f' * 40),
                            {**pr_state(), 'labels': []}):
                run.reset_mock()
                api.return_value = current
                smoke.dispatch()
                run.assert_not_called()
            lookup.return_value = None
            api.reset_mock()
            smoke.dispatch()
            api.assert_not_called()
            run.assert_not_called()

    def test_label_ignores_unrelated_fork_closed_unlabeled_and_superseded_pr(self):
        payload = {'action': 'labeled', 'label': {'name': 'bolt-preview'},
                   'pull_request': {**pr_state(), 'head': {
                       'sha': HEAD, 'repo': {'full_name': smoke.REPO}}}}
        for event, current in (
            ({**payload, 'action': 'unlabeled'}, pr_state()),
            ({**payload, 'label': {'name': 'other'}}, pr_state()),
            ({**payload, 'pull_request': {**payload['pull_request'], 'head': {
                'sha': HEAD, 'repo': {'full_name': 'other/fork'}}}}, pr_state()),
            (payload, pr_state(state='closed')),
            (payload, {**pr_state(), 'labels': []}),
            (payload, pr_state(head='f' * 40)),
        ):
            with self.subTest(event=event, current=current), \
                    patch.object(smoke, 'api', return_value=current) as api:
                self.assertIsNone(smoke.labeled_receipt(event))
                self.assertTrue(all(call.args[0] == 'pulls/123' for call in api.call_args_list))

    def test_label_paginates_and_skips_receipts_for_old_heads(self):
        payload = {'action': 'labeled', 'label': {'name': 'bolt-preview'},
                   'pull_request': {**pr_state(), 'head': {
                       'sha': HEAD, 'repo': {'full_name': smoke.REPO}}}}
        def api(path):
            if path == 'pulls/123':
                return pr_state()
            if path.endswith('page=1'):
                return {'workflow_runs': [publisher_run(457)] * 100}
            if path.endswith('page=2'):
                return {'workflow_runs': [publisher_run()]}
            raise AssertionError(path)
        with patch.object(smoke, 'api', side_effect=api), \
                patch.object(smoke, 'publisher_receipt', side_effect=lambda run:
                    candidate(run_id=457, head='f' * 40) if run['id'] == 457 else candidate()):
            self.assertEqual(smoke.labeled_receipt(payload), candidate())
        with patch.object(smoke, 'api', side_effect=api), \
                patch.object(smoke, 'publisher_receipt', return_value=None):
            self.assertIsNone(smoke.labeled_receipt(payload))

    def test_workflow_triggers_only_label_admission_for_same_repository(self):
        root = Path(__file__).resolve().parents[2]
        workflow = root / '.github/workflows/label-bolt-preview.yml'
        data = yaml.safe_load(workflow.read_text())
        self.assertEqual(data[True]['pull_request_target']['types'], ['labeled'])
        condition = data['jobs']['dispatch']['if']
        self.assertIn("github.event.label.name == 'bolt-preview'", condition)
        self.assertIn('github.event.pull_request.head.repo.full_name == github.repository', condition)
        self.assertEqual(data['permissions'], {
            'contents': 'read', 'pull-requests': 'read', 'actions': 'write'})
        steps = data['jobs']['dispatch']['steps']
        self.assertEqual(steps[0]['with']['ref'], '${{ github.event.repository.default_branch }}')
        self.assertIs(steps[0]['with']['persist-credentials'], False)
        self.assertEqual(steps[1]['run'], 'python3 deploy/candidate/preview_smoke.py dispatch')
        smoke_workflow = yaml.safe_load((root / '.github/workflows/preview-smoke.yml').read_text())
        self.assertEqual(set(smoke_workflow[True]), {'workflow_run', 'workflow_dispatch', 'schedule'})
        self.assertEqual(smoke_workflow[True]['schedule'], [{'cron': '0 0 * * *'}])

    def test_publisher_receipt_rejects_untrusted_runs_and_mismatched_identity(self):
        for mutation in ({'conclusion': 'failure'}, {'event': 'pull_request'},
                         {'path': '.github/workflows/other.yml'}, {'head_branch': 'other'},
                         {'repository': {'full_name': 'other/fork'}}, {'head_sha': 'invalid'}):
            with self.subTest(mutation=mutation), patch.object(smoke, 'api') as api:
                with self.assertRaisesRegex(ValueError, 'unexpected publisher'):
                    smoke.publisher_receipt({**publisher_run(), **mutation})
                api.assert_not_called()
        artifact = {'name': 'candidate-receipt', 'expired': False, 'size_in_bytes': 1000}
        for artifacts in ([{**artifact, 'expired': True}], [artifact, artifact],
                          [{**artifact, 'size_in_bytes': 1000001}]):
            with self.subTest(artifacts=artifacts), \
                    patch.object(smoke, 'api', return_value={'artifacts': artifacts}), \
                    patch.object(smoke, 'download') as download:
                if artifacts[0]['expired']:
                    self.assertIsNone(smoke.publisher_receipt(publisher_run()))
                else:
                    with self.assertRaisesRegex(ValueError, 'unexpected publisher artifact'):
                        smoke.publisher_receipt(publisher_run())
                download.assert_not_called()
        for mutation in ({'repo': 'other/fork'}, {'publisherRunId': 457},
                         {'publisherRevision': 'f' * 40}, {'headSha': 'invalid'},
                         {'pr': '123'}, {'pr': 0}):
            with self.subTest(mutation=mutation), \
                    patch.object(smoke, 'api', return_value={'artifacts': [artifact]}), \
                    patch.object(smoke, 'download', return_value={**candidate(), **mutation}):
                with self.assertRaisesRegex(ValueError, 'candidate receipt identity mismatch'):
                    smoke.publisher_receipt(publisher_run())

    def test_public_fence_rejects_either_image_head_and_readiness(self):
        receipt = candidate()
        expected = {"candidateId": receipt["candidateId"], "headSha": HEAD, "publisherRunId": 456,
                    "images": {"web": WEB_DIGEST, "commerce": COMMERCE_DIGEST}}

        def request(observed, health="UP"):
            calls = []

            def open_url(request, timeout):
                calls.append(request)
                body = observed if "/__candidate.json" in request.full_url else {"status": health}
                return io.BytesIO(json.dumps(body).encode())

            with patch.object(smoke, "urlopen", side_effect=open_url):
                return smoke.fence(receipt), calls

        origin, calls = request(expected)
        self.assertEqual(origin, "https://bolt-pr-123.mimukodik.hu")
        self.assertIn("/__candidate.json?t=", calls[0].full_url)
        self.assertEqual(calls[1].full_url, origin + "/api/v1/actuator/health/readiness")
        self.assertTrue(all(call.get_header("User-agent") for call in calls))
        self.assertTrue(all(call.get_header("Accept") == "application/json" for call in calls))
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
        with patch.object(smoke, "urlopen", side_effect=lambda request, timeout:
                          io.BytesIO(json.dumps(expected if "/__candidate.json" in request.full_url
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
            self.pr = {**pr_state(), "labels": []}
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
            "actions/workflows/publish-candidate.yml/runs?status=success&per_page=100&page=1":
                {"workflow_runs": [publisher_run()]},
            "actions/runs/456/artifacts": {"artifacts": [
                {"name": "candidate-receipt", "expired": False, "size_in_bytes": 1000}]},
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
        paths["deployments?environment=preview-pr-123&per_page=100"] = [
            {"id": 7, "sha": HEAD}]
        paths["deployments/7/statuses?per_page=1"] = [{"state": "success"}]
        with patch.dict(os.environ, {"GITHUB_SHA": PUBLISHER_SHA}), \
                patch.object(smoke, "api", side_effect=lambda path: paths[path]), \
                patch.object(smoke, "download", side_effect=lambda run_id, artifact, filename:
                             {"publisherRunId": 456} if artifact == "preview-smoke-receipt" else receipt), \
                patch.object(smoke, "fence", return_value="origin"):
            self.assertIsNone(smoke.scheduled_publisher())
        paths["deployments/7/statuses?per_page=1"] = [{"state": "inactive"}]
        with patch.dict(os.environ, {"GITHUB_SHA": PUBLISHER_SHA}), \
                patch.object(smoke, "api", side_effect=lambda path: paths[path]), \
                patch.object(smoke, "download", side_effect=lambda run_id, artifact, filename:
                             {"publisherRunId": 456} if artifact == "preview-smoke-receipt" else receipt), \
                patch.object(smoke, "fence", return_value="origin"):
            self.assertEqual(smoke.scheduled_publisher(), publisher_run())

    def test_schedule_selects_unaccepted_preview_when_another_is_accepted(self):
        receipts = {456: candidate(pr=123, run_id=456), 457: candidate(pr=124, run_id=457)}
        paths = {
            "pulls?state=open&per_page=100": [pr_state(pr=123), pr_state(pr=124)],
            "actions/workflows/publish-candidate.yml/runs?status=success&per_page=100&page=1":
                {"workflow_runs": [publisher_run(456), publisher_run(457)]},
            "actions/runs/456/artifacts": {"artifacts": [
                {"name": "candidate-receipt", "expired": False, "size_in_bytes": 1000}]},
            "actions/runs/457/artifacts": {"artifacts": [
                {"name": "candidate-receipt", "expired": False, "size_in_bytes": 1000}]},
            "actions/workflows/preview-smoke.yml/runs?status=success&per_page=100":
                {"workflow_runs": [{"id": 789, "head_sha": PUBLISHER_SHA}]},
            "actions/runs/789/artifacts": {"artifacts": [
                {"name": "preview-smoke-receipt", "expired": False}]},
            "deployments?environment=preview-pr-123&per_page=100": [{"id": 7, "sha": HEAD}],
            "deployments/7/statuses?per_page=1": [{"state": "success"}],
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
        report = yaml.safe_load(workflow.read_text())['jobs']['report']['steps'][0]
        self.assertEqual(report['with']['ref'], '${{ github.sha }}')
        self.assertFalse(any("pull_request.head.sha" in json.dumps(step) for step in steps))


if __name__ == "__main__":
    unittest.main()
