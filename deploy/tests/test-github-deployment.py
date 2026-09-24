"""Boundary checks for GitHub preview deployment reporting."""
import importlib.util
import os
from pathlib import Path
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "candidate" / "github_deployment.py"
spec = importlib.util.spec_from_file_location("github_deployment", SCRIPT)
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)
HEAD = "a" * 40
RECEIPT = {"pr": 355, "headSha": HEAD}


class GitHubDeploymentTests(unittest.TestCase):
    def test_success_skips_disabled_preview(self):
        with patch.object(deployment, "api", return_value={"state": "open", "head": {"sha": HEAD}, "labels": []}) as api:
            deployment.success(RECEIPT)
        api.assert_called_once_with("pulls/355")

    def test_success_creates_exact_head_and_url(self):
        calls = []

        def api(path, payload=None):
            calls.append((path, payload))
            if path == "pulls/355":
                return {"state": "open", "head": {"sha": HEAD}, "labels": [{"name": "bolt-preview"}]}
            if path.startswith("deployments?environment="):
                return [{"id": 7, "environment": "preview-pr-355", "sha": HEAD}]
            if path == "deployments/7/statuses?per_page=1":
                return []
            if path == "deployments/7/statuses":
                return {"id": 8}
            raise AssertionError(path)

        with patch.object(deployment, "api", side_effect=api), patch.dict(os.environ, {"GITHUB_RUN_ID": "123"}):
            deployment.success(RECEIPT)
        status = next(payload for path, payload in calls if path == "deployments/7/statuses")
        self.assertEqual(status["state"], "success")
        self.assertEqual(status["environment_url"], "https://bolt-pr-355.mimukodik.hu")
        self.assertFalse(any(path == "deployments" for path, _ in calls))

    def test_inactive_skips_already_inactive(self):
        def api(path, payload=None):
            if path.startswith("deployments?environment="):
                return [{"id": 7, "environment": "preview-pr-355"}]
            if path == "deployments/7/statuses?per_page=1":
                return [{"state": "inactive"}]
            raise AssertionError(path)

        with patch.object(deployment, "api", side_effect=api):
            deployment.inactive(355)

    def test_stale_unlabeled_event_does_not_inactivate_reenabled_preview(self):
        with patch.object(deployment, "api", return_value={"state": "open", "labels": [{"name": "bolt-preview"}]}) as api:
            deployment.inactive_if_disabled(355)
        api.assert_called_once_with("pulls/355")

    def test_disabled_preview_is_marked_inactive(self):
        with patch.object(deployment, "api", return_value={"state": "open", "labels": []}), \
                patch.object(deployment, "inactive") as inactive:
            deployment.inactive_if_disabled(355)
        inactive.assert_called_once_with(355)


if __name__ == "__main__":
    unittest.main()
