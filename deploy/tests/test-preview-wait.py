"""Focused checks for the preview wait command's decisions.

Run with: python3 deploy/tests/test-preview-wait.py
"""
import contextlib
import io
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'candidate'))
import preview_wait  # noqa: E402

REPO = 'mimukodik/mi-bolt'
OLD, HEAD = 'a' * 40, 'b' * 40
URL = 'https://bolt-pr-7.mimukodik.hu'


def pr(head=HEAD, labels=('bolt-preview',), state='open', repo=REPO, merged=False):
    return {'number': 7, 'state': state, 'merged_at': '2026-10-07T00:00:00Z' if merged else None,
            'head': {'sha': head, 'repo': {'full_name': repo} if repo else None},
            'labels': [{'name': name} for name in labels]}


def run(number, head=HEAD, status='completed', conclusion='success'):
    return {'id': number, 'head_sha': head, 'status': status, 'conclusion': conclusion,
            'html_url': f'https://github.com/{REPO}/actions/runs/{number}'}


class Fake:
    """GitHub and the preview origin as scripted sequences, one step per poll."""

    def __init__(self, test, steps):
        self.steps, self.step = steps, 0
        self.jobs = {}
        test.enterContext(patch.object(preview_wait, 'api', side_effect=self.api))
        test.enterContext(patch.object(preview_wait, 'fetch', side_effect=self.fetch))
        test.enterContext(patch.object(preview_wait.time, 'sleep', side_effect=self.sleep))
        test.enterContext(patch.object(preview_wait.time, 'monotonic', side_effect=lambda: self.step * 20))

    @property
    def now(self):
        return self.steps[min(self.step, len(self.steps) - 1)]

    def sleep(self, _seconds):
        self.step += 1

    def api(self, path):
        if self.now.get('gh_error'):
            raise preview_wait.GitHubError(f'gh api {path}: HTTP 502')
        if path == 'pulls/7':
            return self.now['pr']
        if path.startswith('pulls?'):
            return [self.now['pr'], *self.now.get('others', [])]
        if path.startswith('actions/workflows/'):
            workflow = path.split('/')[2]
            return {'workflow_runs': self.now.get('runs', {}).get(workflow, [])}
        if path.startswith('actions/runs/'):
            return {'jobs': self.jobs.get(int(path.split('/')[2]), [
                {'name': 'ci-ok', 'conclusion': 'success'}])}
        raise AssertionError(path)

    def fetch(self, url):
        served = self.now.get('served')
        if served is None:
            raise HTTPError(url, 404, 'Not Found', {}, None)
        if url.endswith('/__candidate.json'):
            return {'headSha': served, 'publisherRunId': 99}
        if url.endswith('/readiness'):
            return {'status': 'UP'}
        if url.endswith('/info'):
            if 'commerce' in self.now and self.now['commerce'] is None:
                return {'release': None}
            return {'release': {'publisherRunId': self.now.get('commerce', '99')}}
        raise AssertionError(url)


def green(head=HEAD):
    return {'ci.yml': [run(1, head)], 'candidate.yml': [run(2, head)]}


class PreviewWaitTests(unittest.TestCase):
    def wait(self, timeout=45):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            try:
                preview_wait.wait(7, timeout)
                code = 0
            except preview_wait.Stop as stop:
                code, out = stop.code, io.StringIO(out.getvalue() + f'STOP {stop}\n')
        return code, out.getvalue()

    def test_ready_after_ci_publication_and_rollout(self):
        Fake(self, [
            {'pr': pr()},
            {'pr': pr()},
            {'pr': pr(), 'runs': {'ci.yml': [run(1, status='in_progress', conclusion=None)],
                                  'candidate.yml': [run(2, status='queued', conclusion=None)]}},
            {'pr': pr(), 'runs': green()},
            {'pr': pr(), 'runs': green()},
            {'pr': pr(), 'runs': green(), 'served': OLD},
            {'pr': pr(), 'runs': green(), 'served': HEAD, 'commerce': '98'},
            {'pr': pr(), 'runs': green(), 'served': HEAD},
        ])
        code, out = self.wait()
        self.assertEqual(code, 0, out)
        self.assertTrue(out.endswith(URL + '\n'), out)
        for line in ('waiting for CI to start', 'CI in_progress, Candidate Build queued',
                     'CI and Candidate Build green', f'{URL} answers 404',
                     f'{URL} still serves {OLD[:12]}', 'commerce is still starting',
                     f'ready: {URL} serves {HEAD[:12]} (publisher run 99)'):
            self.assertIn(line, out)
        # One line per state change, not per poll.
        self.assertEqual(out.count('answers 404'), 1, out)

    def test_unlabelled_pr_stops_with_the_command_that_labels_it(self):
        Fake(self, [{'pr': pr(labels=())}])
        code, out = self.wait()
        self.assertEqual(code, 2)
        self.assertIn('gh pr edit 7 -R mimukodik/mi-bolt --add-label bolt-preview', out)

    def test_closed_and_fork_prs_stop(self):
        for kwargs, text in (({'state': 'closed', 'merged': True}, 'is merged'),
                             ({'state': 'closed'}, 'is closed'),
                             ({'repo': 'someone/mi-bolt'}, 'fork'),
                             ({'repo': None}, 'fork')):
            with self.subTest(kwargs=kwargs):
                with contextlib.ExitStack() as stack:
                    stack.enter_context(patch.object(preview_wait, 'api', return_value=pr(**kwargs)))
                    with self.assertRaises(preview_wait.Stop) as raised:
                        preview_wait.wait(7, 45)
                self.assertEqual(raised.exception.code, 2)
                self.assertIn(text, str(raised.exception))

    def test_red_ci_stops_early_and_names_failed_jobs(self):
        fake = Fake(self, [{'pr': pr(), 'runs': {
            'ci.yml': [run(1, conclusion='failure')], 'candidate.yml': [run(2, status='in_progress', conclusion=None)]}}])
        fake.jobs[1] = [{'name': 'backend / test', 'conclusion': 'failure'},
                        {'name': 'frontend / lint', 'conclusion': 'success'},
                        {'name': 'ci-ok', 'conclusion': 'failure'}]
        code, out = self.wait()
        self.assertEqual(code, 1)
        self.assertIn('CI failure on bbbbbbbbbbbb', out)
        self.assertIn('failed jobs: backend / test, ci-ok', out)
        self.assertIn(f'https://github.com/{REPO}/actions/runs/1', out)

    def test_latest_run_decides_a_rerun(self):
        Fake(self, [{'pr': pr(), 'runs': {'ci.yml': [run(1, conclusion='failure'), run(3)],
                                          'candidate.yml': [run(2)]}, 'served': HEAD}])
        self.assertEqual(self.wait()[0], 0)

    def test_green_ci_without_ci_ok_stops(self):
        fake = Fake(self, [{'pr': pr(), 'runs': green()}])
        fake.jobs[1] = [{'name': 'ci-ok', 'conclusion': 'skipped'}]
        code, out = self.wait()
        self.assertEqual(code, 1)
        self.assertIn('no successful ci-ok job', out)

    def test_a_push_is_followed_and_its_cancelled_runs_are_not_a_failure(self):
        cancelled = {'ci.yml': [run(1, OLD, conclusion='cancelled')], 'candidate.yml': [run(2, OLD)]}
        fake = Fake(self, [
            {'pr': pr(OLD)},
            {'pr': pr(OLD), 'runs': cancelled},
            {'pr': pr(HEAD), 'runs': {**cancelled, **green()}, 'served': HEAD},
        ])
        # Reads: first sight of the head, the second poll's head read; the
        # push lands before the re-read after the cancelled run.
        reads = iter([pr(OLD), pr(OLD), pr(HEAD)])
        original = fake.api
        fake_api = lambda path: next(reads, pr(HEAD)) if path == 'pulls/7' else original(path)
        with patch.object(preview_wait, 'api', side_effect=fake_api):
            code, out = self.wait()
        self.assertEqual(code, 0, out)
        self.assertIn(f'head moved to {HEAD[:12]}', out)

    def test_removed_label_stops(self):
        Fake(self, [{'pr': pr()}, {'pr': pr(labels=())}])
        code, out = self.wait()
        self.assertEqual(code, 2)
        self.assertIn('has no bolt-preview label', out)

    def test_timeout_reports_the_last_state_and_likely_causes(self):
        Fake(self, [{'pr': pr(), 'runs': green()}])
        code, out = self.wait(timeout=1)
        self.assertEqual(code, 3)
        self.assertIn(f'timed out after 1 min; last state: {URL} answers 404', out)
        self.assertIn('the preview expired', out)
        self.assertNotIn('slots are taken', out)

    def test_timeout_names_full_capacity(self):
        others = [{**pr(), 'number': number} for number in (3, 4, 5)]
        Fake(self, [{'pr': pr(), 'runs': green(), 'others': others}])
        code, out = self.wait(timeout=1)
        self.assertEqual(code, 3)
        self.assertIn('all 3 preview slots are taken (#3, #4, #5 also carry the label)', out)

    def test_timeout_during_ci_does_not_blame_the_platform(self):
        Fake(self, [{'pr': pr(), 'runs': {'ci.yml': [run(1, status='in_progress', conclusion=None)],
                                          'candidate.yml': [run(2)]}}])
        code, out = self.wait(timeout=1)
        self.assertEqual(code, 3)
        self.assertIn('CI did not finish in time', out)
        self.assertNotIn('expired', out)

    def test_a_github_blip_is_retried(self):
        Fake(self, [{'pr': pr(), 'runs': green()}, {'gh_error': True}, {'gh_error': True},
                    {'pr': pr(), 'runs': green(), 'served': HEAD}])
        code, out = self.wait()
        self.assertEqual(code, 0, out)

    def test_github_that_stays_unreadable_stops_with_its_own_code(self):
        Fake(self, [{'gh_error': True}])
        code, out = self.wait()
        self.assertEqual(code, 4)
        self.assertIn('GitHub could not be read 6 times in a row', out)
        self.assertIn('HTTP 502', out)

    def test_heads_that_keep_moving_still_sleep_and_time_out(self):
        fake = Fake(self, [{'pr': pr(OLD)}, {'pr': pr(HEAD)}] * 10)
        code, out = self.wait(timeout=1)
        self.assertEqual(code, 3)
        self.assertLessEqual(fake.step, 4)

    def test_missing_gh_is_not_reported_as_red_ci(self):
        with patch.object(preview_wait.subprocess, 'run', side_effect=FileNotFoundError('gh')):
            code, out = self.wait()
        self.assertEqual(code, 4)
        self.assertIn('gh is not installed', out)

    def test_commerce_without_release_info_is_not_ready(self):
        Fake(self, [{'pr': pr(), 'runs': green(), 'served': HEAD, 'commerce': None}])
        code, out = self.wait(timeout=1)
        self.assertEqual(code, 3)
        self.assertIn('commerce is still starting', out)


if __name__ == '__main__':
    unittest.main()
