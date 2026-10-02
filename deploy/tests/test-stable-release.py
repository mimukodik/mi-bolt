"""Main publication eligibility and stable acceptance boundary checks."""
import contextlib
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'candidate'))
import publish
import stable_smoke

REPO = 'mimukodik/mi-bolt'
HEAD = 'a' * 40


def run(number, workflow, **changes):
    return {'id': number, 'head_sha': HEAD, 'event': 'push', 'head_branch': 'main',
            'path': f'.github/workflows/{workflow}', 'repository': {'full_name': REPO},
            'conclusion': 'success', **changes}


class StableReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.event = self.root / 'event.json'
        self.output = self.root / 'output'
        self.ci = [run(1, 'ci.yml')]
        self.build = [run(2, 'candidate.yml')]
        self.current = HEAD
        self.ci_job = 'success'
        self.event.write_text(json.dumps({'workflow_run': {
            **run(1, 'ci.yml'), 'name': 'CI'}}))
        self.enterContext(patch.object(publish, 'REPO', REPO))
        self.enterContext(patch.object(publish, 'api', side_effect=self.api))
        self.enterContext(patch.dict(os.environ, {'GITHUB_OUTPUT': str(self.output)}))

    def api(self, path, query=None):
        if path == 'commits/main':
            return {'sha': self.current}
        if path == 'actions/workflows/ci.yml/runs':
            return {'workflow_runs': self.ci}
        if path == 'actions/workflows/candidate.yml/runs':
            return {'workflow_runs': self.build}
        if path == 'actions/runs/1/jobs':
            return {'jobs': [{'name': 'ci-ok', 'conclusion': self.ci_job}]}
        raise AssertionError(path)

    def test_exact_successful_main_pair_is_admitted(self):
        publish.resolve(self.event)
        self.assertIn('ready=true\n', self.output.read_text())
        self.assertIn('pr=0\n', self.output.read_text())
        self.assertIn('candidate_id=main-' + HEAD[:12], self.output.read_text())
        publish.fresh(0, HEAD, 1, 2)

    def test_failed_pending_missing_wrong_branch_and_pr_runs_do_not_release(self):
        original = run(2, 'candidate.yml')
        for changes in ({'conclusion': 'failure'}, {'conclusion': None},
                        {'event': 'pull_request'}, {'head_branch': 'feature'},
                        {'head_sha': 'b' * 40}, {'repository': {'full_name': 'other/repo'}},
                        {'path': '.github/workflows/other.yml'}):
            with self.subTest(changes=changes):
                self.build = [{**original, **changes}]
                self.output.write_text('')
                publish.resolve(self.event)
                self.assertEqual(self.output.read_text(), 'ready=false\n')
        self.build = []
        self.assertIsNone(publish.choose_runs(None, HEAD))
        self.build = [original]
        self.ci_job = 'failure'
        self.assertIsNone(publish.choose_runs(None, HEAD))

    def test_latest_failed_rerun_blocks_old_success(self):
        self.build.append(run(3, 'candidate.yml', conclusion='failure'))
        self.assertIsNone(publish.choose_runs(None, HEAD))

    def test_main_advancing_or_new_build_fences_publication(self):
        self.current = 'b' * 40
        publish.resolve(self.event)
        self.assertEqual(self.output.read_text(), 'ready=false\n')
        with self.assertRaisesRegex(ValueError, 'main advanced'):
            publish.fresh(0, HEAD, 1, 2)
        self.current = HEAD
        self.build.append(run(3, 'candidate.yml'))
        with self.assertRaisesRegex(ValueError, 'no longer current'):
            publish.fresh(0, HEAD, 1, 2)

    def test_stable_and_preview_chart_channels_are_distinct(self):
        chart = self.root / 'source-chart'
        chart.mkdir()
        (chart / 'values.yaml').write_text('candidate: {}\nweb:\n  image: {}\ncommerce:\n  image: {}\n')
        images = {k: {'repository': k, 'digest': 'sha256:' + 'b' * 64,
                      'buildCommit': HEAD} for k in ('web', 'commerce')}
        from types import SimpleNamespace
        for stable, version in ((True, '0.2.123'), (False, '0.1.0-pr.pr.1.aaa.run.123')):
            output = self.root / str(stable)
            with patch.dict(os.environ, {'GITHUB_RUN_ID': '123'}), \
                    patch.object(publish.subprocess, 'run', return_value=SimpleNamespace(
                        returncode=0, stdout='Digest: sha256:' + 'c' * 64, stderr='')) as call:
                publish.package_chart(chart, output, 'pr-1-aaa', HEAD, images, HEAD, stable=stable)
                self.assertIn(version, call.call_args_list[0].args[0])

    def test_stable_resolve_ignores_preview_and_validates_receipt_identity(self):
        event = {**run(123, 'publish-candidate.yml', event='workflow_run'), 'name': 'Publish Candidate'}
        self.event.write_text(json.dumps({'workflow_run': event}))
        receipt = {'pr': 0, 'repo': REPO, 'publisherRunId': 123, 'publisherRevision': HEAD}
        previous = Path.cwd()
        os.chdir(self.root)
        try:
            with patch.dict(os.environ, {'GITHUB_EVENT_PATH': str(self.event),
                                          'GITHUB_EVENT_NAME': 'workflow_run'}), \
                    patch.object(stable_smoke, 'api') as api, \
                    patch.object(stable_smoke, 'download', return_value=receipt):
                api.return_value = {'artifacts': [{'name': 'candidate-receipt', 'expired': False}]}
                stable_smoke.resolve()
                self.assertEqual(self.output.read_text(), 'ready=false\n')
                api.return_value = {'artifacts': [{'name': 'stable-release-receipt', 'expired': False}]}
                stable_smoke.resolve()
                self.assertEqual(json.loads(Path('candidate.json').read_text()), receipt)
                for field, wrong in (('pr', 1), ('publisherRunId', 124),
                                     ('publisherRevision', 'b' * 40), ('repo', 'other/repo')):
                    with self.subTest(field=field), patch.object(stable_smoke, 'download',
                                                               return_value={**receipt, field: wrong}):
                        with self.assertRaisesRegex(ValueError, 'identity mismatch'):
                            stable_smoke.resolve()
        finally:
            os.chdir(previous)

    def test_stable_gate_rejects_flaky_skipped_and_wrong_deployment(self):
        receipt = {'headSha': HEAD, 'publisherRunId': 123, 'chart': {'digest': 'sha256:' + 'b' * 64}}
        report = self.root / 'report.json'
        for field in ('flaky', 'skipped', 'unexpected'):
            report.write_text(json.dumps({'stats': {'expected': 2, field: 1}}))
            with self.assertRaisesRegex(ValueError, 'without skips or retries'):
                stable_smoke.passed(receipt, report)
        report.write_text(json.dumps({'stats': {'expected': 2}}))
        with patch.object(stable_smoke, 'fence', side_effect=ValueError('wrong release')) as fence:
            with self.assertRaisesRegex(ValueError, 'wrong release'):
                stable_smoke.passed(receipt, report)
            fence.assert_called_once_with(receipt, origin='https://bolt.mimukodik.hu')

    def test_fence_requires_the_receipt_commerce_not_just_a_ready_one(self):
        digests = {'web': 'sha256:' + 'c' * 64, 'commerce': 'sha256:' + 'd' * 64}
        receipt = {'candidateId': 'main-aaaaaaaaaaaa', 'headSha': HEAD, 'publisherRunId': 37049383413,
                   'images': {c: {'digest': d} for c, d in digests.items()}}
        candidate = {'candidateId': 'main-aaaaaaaaaaaa', 'headSha': HEAD, 'publisherRunId': 37049383413,
                     'images': digests}

        def serving(info):
            def urlopen(request, timeout):
                path = urlsplit(request.full_url).path
                body = {'/__candidate.json': candidate,
                        '/api/v1/actuator/health/readiness': {'status': 'UP'},
                        '/api/v1/actuator/info': info}[path]
                if body is None:
                    raise HTTPError(request.full_url, 404, 'Not Found', {}, None)
                return contextlib.nullcontext(io.BytesIO(json.dumps(body).encode()))
            return urlopen

        # Web already serves the new candidate while the previous release's commerce answers.
        for name, info in (('previous release', {'release': {'publisherRunId': '37049262466'}}),
                           ('commerce without the release id', {'release': {'publisherRunId': ''}}),
                           ('commerce before info was exposed', None)):
            with self.subTest(name), patch.object(stable_smoke, 'urlopen', side_effect=serving(info)):
                with self.assertRaises((ValueError, HTTPError)):
                    stable_smoke.fence(receipt, origin='https://bolt.example.test')
        with patch.object(stable_smoke, 'urlopen',
                          side_effect=serving({'release': {'publisherRunId': '37049383413'}})):
            self.assertEqual(stable_smoke.fence(receipt, origin='https://bolt.example.test'),
                             'https://bolt.example.test')


if __name__ == '__main__':
    unittest.main()
