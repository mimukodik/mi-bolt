"""Focused checks for the preview deployment reporter's decisions.

Run with: python3 deploy/tests/test-github-deployment.py
"""
import contextlib
import io
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'candidate'))
import github_deployment  # noqa: E402
import preview_wait  # noqa: E402

REPO = 'mimukodik/mi-bolt'
OLD, HEAD, NEWER = 'a' * 40, 'b' * 40, 'c' * 40
URL = 'https://bolt-pr-7.mimukodik.hu'


def pr(head=HEAD, labels=('preview',), state='open', repo=REPO):
    return {'number': 7, 'state': state, 'merged_at': None,
            'head': {'sha': head, 'repo': {'full_name': repo}},
            'labels': [{'name': name} for name in labels]}


class Fake:
    """GitHub's deployment API in memory; `prs` answers successive PR reads."""

    def __init__(self, test, prs, deployments=(), failing=()):
        self.prs = list(prs)
        self.failing = list(failing)
        self.attempts = []
        self.deployments = []
        self.statuses = {}
        self.created = []
        for sha, *states in deployments:
            item = {'id': len(self.deployments) + 1, 'environment': 'preview-pr-7', 'sha': sha}
            self.deployments.append(item)
            self.statuses[item['id']] = [{'state': state} for state in states]
        self.posted = []
        test.enterContext(patch.object(github_deployment, 'api', side_effect=self.api))
        test.enterContext(patch.dict(os.environ, {'GITHUB_RUN_ID': '123'}))

    def api(self, path, payload=None, attempts=github_deployment.API_ATTEMPTS):
        self.attempts.append((path, attempts))
        if self.failing and self.failing[0](path, payload):
            self.failing.pop(0)
            raise subprocess.CalledProcessError(1, ['gh', 'api', path], stderr='HTTP 502')
        if path == 'pulls/7':
            return self.prs.pop(0) if len(self.prs) > 1 else self.prs[0]
        if path == 'deployments?environment=preview-pr-7&per_page=100':
            # GitHub lists newest first; another environment's entry must be ignored.
            return [*reversed(self.deployments), {'id': 99, 'environment': 'preview-pr-70', 'sha': HEAD}]
        if path == 'deployments' and payload:
            item = {'id': len(self.deployments) + 1, 'environment': payload['environment'],
                    'sha': payload['ref']}
            self.deployments.append(item)
            self.statuses[item['id']] = []
            self.created.append(payload)
            return item
        number = int(path.split('/')[1])
        if path.endswith('/statuses?per_page=1'):
            return list(reversed(self.statuses[number]))[:1]
        if path.endswith('/statuses') and payload:
            self.statuses[number].append(payload)
            self.posted.append((number, payload))
            return {}
        raise AssertionError(path)

    def states(self, deployment_id):
        return [status['state'] for status in self.statuses[deployment_id]]


class ReportTests(unittest.TestCase):
    def report(self, wait=None):
        out = io.StringIO()
        with patch.object(github_deployment.preview_wait, 'wait', side_effect=wait) as waited, \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            code = github_deployment.report(7, 45)
        return code, waited, out.getvalue()

    def test_a_served_head_is_reported_with_its_url(self):
        fake = Fake(self, [pr()])
        code, waited, out = self.report()
        self.assertEqual(code, 0)
        waited.assert_called_once_with(7, 45, interval=github_deployment.POLL_SECONDS)
        self.assertEqual(fake.created, [{
            'ref': HEAD, 'environment': 'preview-pr-7', 'auto_merge': False,
            'required_contexts': [], 'transient_environment': True,
            'production_environment': False, 'description': 'Bolt preview of PR #7'}])
        self.assertEqual(fake.states(1), ['in_progress', 'success'])
        success = fake.statuses[1][-1]
        self.assertEqual(success['environment_url'], URL)
        self.assertEqual(success['description'], f'{URL} serves {HEAD[:12]}')
        self.assertEqual(success['log_url'], f'https://github.com/{REPO}/actions/runs/123')
        self.assertIn('GitHub deployment 1 reports preview-pr-7', out)

    def test_the_head_deployment_is_reused_and_older_heads_go_inactive(self):
        fake = Fake(self, [pr()], deployments=[(OLD, 'success'), (HEAD, 'success'), (OLD, 'inactive')])
        self.assertEqual(self.report()[0], 0)
        self.assertEqual(fake.created, [])
        self.assertEqual(fake.states(1), ['success', 'inactive'])
        self.assertEqual(fake.statuses[1][-1]['description'], 'Superseded by a newer head')
        self.assertEqual(fake.states(2), ['success', 'in_progress', 'success'])
        # Already inactive: no second inactive status.
        self.assertEqual(fake.states(3), ['inactive'])
        self.assertNotIn(99, [number for number, _ in fake.posted])

    def test_red_ci_timeout_and_unreadable_github_are_failure_or_error(self):
        # Red CI is the PR's own signal, so only the reporter's failures exit non-zero.
        for code, state, exit_code in ((1, 'failure', 0), (3, 'error', 3), (4, 'error', 4)):
            with self.subTest(code=code):
                fake = Fake(self, [pr()])
                message = 'CI failure on bbbbbbbbbbbb: ' + 'x' * 200
                result, _, out = self.report(preview_wait.Stop(code, message))
                self.assertEqual(result, exit_code)
                # The whole reason reaches the log; the status keeps 140 characters.
                self.assertIn(f'github_deployment: {message}', out)
                self.assertEqual(fake.states(1), ['in_progress', state])
                description = fake.statuses[1][-1]['description']
                self.assertEqual(len(description), github_deployment.DESCRIPTION_LIMIT)
                self.assertTrue(message.startswith(description))
                self.assertNotIn('environment_url', fake.statuses[1][-1])

    def test_a_label_removed_while_waiting_goes_inactive(self):
        fake = Fake(self, [pr()])
        code, _, _ = self.report(preview_wait.Stop(2, 'PR #7 has no preview label'))
        self.assertEqual(code, 0)
        self.assertEqual(fake.states(1), ['in_progress', 'inactive'])

    def test_a_push_during_the_wait_is_left_to_its_own_run(self):
        fake = Fake(self, [pr(HEAD), pr(NEWER)])
        self.assertEqual(self.report()[0], 0)
        self.assertEqual(fake.states(1), ['in_progress', 'inactive'])
        self.assertEqual(fake.statuses[1][-1]['description'], 'Bolt preview disabled or superseded')

    def test_an_unexpected_failure_while_waiting_is_an_error_not_in_progress(self):
        fake = Fake(self, [pr()])
        with self.assertRaises(ValueError):
            self.report(ValueError('bad JSON'))
        self.assertEqual(fake.states(1), ['in_progress', 'error'])
        self.assertEqual(fake.statuses[1][-1]['description'], 'Preview reporting failed: bad JSON')

    def test_github_failing_after_in_progress_leaves_an_error_not_in_progress(self):
        failures = {
            'retiring an older head': lambda path, payload: path == 'deployments/1/statuses?per_page=1',
            'reading the PR after the wait': lambda path, payload: path == 'pulls/7' and self.reads > 1,
        }
        for name, failing in failures.items():
            with self.subTest(name):
                self.reads = 0
                fake = Fake(self, [pr()], deployments=[(OLD, 'success')], failing=[failing])
                original = fake.api

                def counting(path, payload=None, **kwargs):
                    self.reads += path == 'pulls/7'
                    return original(path, payload, **kwargs)
                with patch.object(github_deployment, 'api', side_effect=counting), \
                        self.assertRaises(subprocess.CalledProcessError):
                    self.report()
                self.assertEqual(fake.states(2)[0], 'in_progress')
                self.assertEqual(fake.states(2)[-1], 'error')
                self.assertTrue(fake.statuses[2][-1]['description'].startswith('Preview reporting failed'))

    def test_a_cancelled_run_marks_its_deployment_inactive(self):
        for signal_error in (KeyboardInterrupt(), SystemExit(143)):
            with self.subTest(signal_error=signal_error):
                fake = Fake(self, [pr()])
                with self.assertRaises(type(signal_error)):
                    self.report(signal_error)
                self.assertEqual(fake.states(1), ['in_progress', 'inactive'])
                self.assertEqual(fake.statuses[1][-1]['description'], 'Reporting cancelled')
                # The cleanup makes one attempt; everything else retries.
                self.assertEqual(fake.attempts[-1], ('deployments/1/statuses', 1))
                self.assertTrue(all(attempts == github_deployment.API_ATTEMPTS
                                    for _, attempts in fake.attempts[:-1]))

    def test_a_failed_cleanup_status_does_not_hide_the_first_failure(self):
        fake = Fake(self, [pr()], failing=[lambda path, payload: (payload or {}).get('state') == 'error'])
        with self.assertRaises(ValueError):
            self.report(ValueError('bad JSON'))
        self.assertEqual(fake.states(1), ['in_progress'])

    def test_an_ineligible_pr_reports_nothing(self):
        for kwargs in ({'labels': ()}, {'state': 'closed'}, {'repo': 'someone/mi-bolt'}):
            with self.subTest(kwargs=kwargs):
                fake = Fake(self, [pr(**kwargs)])
                with self.assertRaises(preview_wait.Stop) as raised:
                    self.report()
                self.assertEqual(raised.exception.code, 2)
                self.assertEqual((fake.created, fake.posted), ([], []))


class ApiTests(unittest.TestCase):
    def test_a_blip_is_retried_and_a_lasting_failure_raises(self):
        failure = subprocess.CalledProcessError(1, 'gh')
        with patch.object(github_deployment.subprocess, 'check_output',
                          side_effect=[failure, '{"id": 5}']) as gh, \
                patch.object(github_deployment.time, 'sleep') as slept:
            self.assertEqual(github_deployment.api('deployments', {'ref': HEAD}), {'id': 5})
        self.assertEqual(slept.call_count, 1)
        command = gh.call_args.args[0]
        self.assertEqual(command, ['gh', 'api', f'repos/{REPO}/deployments', '-X', 'POST', '--input', '-'])
        self.assertEqual(gh.call_args.kwargs['input'], '{"ref": "%s"}' % HEAD)
        with patch.object(github_deployment.subprocess, 'check_output', side_effect=failure) as gh, \
                patch.object(github_deployment.time, 'sleep'), \
                self.assertRaises(subprocess.CalledProcessError):
            github_deployment.api('pulls/7')
        self.assertEqual(gh.call_count, github_deployment.API_ATTEMPTS)
        self.assertIsNone(gh.call_args.kwargs['input'])


class InactiveTests(unittest.TestCase):
    def test_a_closed_or_unlabelled_pr_has_every_deployment_marked_inactive(self):
        for state in ({'state': 'closed'}, {'labels': ()}):
            with self.subTest(state=state):
                fake = Fake(self, [pr(**state)],
                            deployments=[(OLD, 'success', 'inactive'), (HEAD, 'in_progress'), (HEAD, 'success')])
                self.assertEqual(github_deployment.inactive(7), 0)
                self.assertEqual(fake.states(1), ['success', 'inactive'])
                self.assertEqual(fake.states(2), ['in_progress', 'inactive'])
                self.assertEqual(fake.states(3), ['success', 'inactive'])
                self.assertEqual(len(fake.posted), 2)

    def test_a_label_added_again_keeps_the_deployment(self):
        fake = Fake(self, [pr()], deployments=[(HEAD, 'success')])
        with contextlib.redirect_stdout(io.StringIO()) as out:
            self.assertEqual(github_deployment.inactive(7), 0)
        self.assertEqual(fake.posted, [])
        self.assertIn('The preview label is on the PR again', out.getvalue())


class MainTests(unittest.TestCase):
    def main(self, *argv, report=None):
        err = io.StringIO()
        with patch.object(sys, 'argv', ['github_deployment.py', *argv]), \
                patch.object(github_deployment, 'report', side_effect=report), \
                contextlib.redirect_stderr(err), self.assertRaises(SystemExit) as exited:
            github_deployment.main()
        return exited.exception.code, err.getvalue()

    def test_an_ineligible_pr_exits_cleanly_and_says_why(self):
        code, err = self.main('report', '7', report=preview_wait.Stop(2, 'PR #7 is closed'))
        self.assertEqual(code, 0)
        self.assertIn('github_deployment: PR #7 is closed', err)

    def test_a_reported_failure_keeps_its_exit_code(self):
        self.assertEqual(self.main('report', '7', report=lambda *_: 3)[0], 3)

    def test_a_pr_number_out_of_range_is_refused(self):
        self.assertEqual(self.main('report', '0')[0], 2)


if __name__ == '__main__':
    unittest.main()
