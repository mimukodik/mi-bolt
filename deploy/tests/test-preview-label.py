"""Focused checks for the preview label command's decisions.

Run with: python3 deploy/tests/test-preview-label.py
"""
import contextlib
from datetime import datetime, timezone
import io
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'candidate'))
import preview_label  # noqa: E402

NOW = datetime(2026, 10, 10, 12, 0, tzinfo=timezone.utc)
HEAD = 'a' * 40


def pr(number, labels=('bolt-preview',), state='open'):
    return {'number': number, 'state': state, 'head': {'sha': HEAD},
            'labels': [{'name': name} for name in labels]}


def labeled(at, name='bolt-preview'):
    return {'event': 'labeled', 'created_at': at, 'label': {'name': name}}


class Fake:
    def __init__(self, test, prs, events=None, runs=None):
        self.prs = {item['number']: item for item in prs}
        self.events, self.runs = events or {}, runs or {}
        self.calls = []
        test.enterContext(patch.object(preview_label, 'api', side_effect=self.api))

    def api(self, path, *args):
        self.calls.append((path, *args))
        if path.startswith('pulls?'):
            return [list(self.prs.values())]
        if path.startswith('pulls/'):
            return self.prs[int(path.split('/')[1])]
        if path.startswith('issues/') and path.endswith('/events?per_page=100'):
            return [self.events.get(int(path.split('/')[1]), [])]
        if path.startswith('actions/workflows/candidate.yml/runs'):
            return {'workflow_runs': self.runs.get(HEAD, [])}
        if path.endswith('/labels/bolt-preview') and '-X' in args:
            number = int(path.split('/')[1])
            if not preview_label.labelled(self.prs[number]):
                raise subprocess.CalledProcessError(1, 'gh')
            self.prs[number]['labels'] = []
            return []
        if path.endswith('/comments') and 'POST' in args:
            return {'id': 1}
        raise AssertionError(path)

    def writes(self):
        return [call for call in self.calls if '-X' in call]


class PreviewLabelTests(unittest.TestCase):
    def sweep(self, dry_run=False):
        with contextlib.redirect_stdout(io.StringIO()) as out:
            retired = preview_label.sweep(NOW, dry_run)
        return retired, out.getvalue()

    def test_idle_preview_loses_its_label_and_gets_a_comment(self):
        fake = Fake(self, [pr(7)], events={7: [labeled('2026-10-07T10:00:00Z')]},
                    runs={HEAD: [{'created_at': '2026-10-07T09:00:00Z'}]})
        retired, out = self.sweep()
        self.assertEqual(retired, [7])
        self.assertIn('#7: idle since 2026-10-07T10:00Z; retiring', out)
        self.assertEqual(fake.prs[7]['labels'], [])
        comment = [call for call in fake.writes() if call[0] == 'issues/7/comments'][0]
        self.assertIn('Add the `bolt-preview` label again', comment[-1])
        self.assertIn('push a commit', comment[-1])
        # The comment goes out before the label comes off.
        self.assertEqual([call[0] for call in fake.writes()],
                         ['issues/7/comments', 'issues/7/labels/bolt-preview'])

    def test_a_recent_push_keeps_the_preview(self):
        # A force-push back to an old head: its first run is days old, its
        # latest an hour old.
        fake = Fake(self, [pr(7)], events={7: [labeled('2026-10-01T10:00:00Z')]},
                    runs={HEAD: [{'created_at': '2026-10-05T10:00:00Z'},
                                 {'created_at': '2026-10-10T11:00:00Z'}]})
        retired, out = self.sweep()
        self.assertEqual(retired, [])
        self.assertIn('#7: active 1 h ago; kept', out)
        self.assertEqual(fake.writes(), [])

    def test_a_fresh_label_keeps_the_preview_on_an_old_head(self):
        Fake(self, [pr(7)], events={7: [labeled('2026-10-01T10:00:00Z'),
                                        labeled('2026-10-09T12:00:00Z'),
                                        labeled('2026-10-10T11:00:00Z', name='bug')]},
             runs={HEAD: [{'created_at': '2026-10-01T09:00:00Z'}]})
        self.assertEqual(self.sweep()[0], [])

    def test_exactly_48_hours_idle_retires(self):
        Fake(self, [pr(7)], events={7: [labeled('2026-10-08T12:00:00Z')]})
        self.assertEqual(self.sweep()[0], [7])

    def test_unlabelled_prs_are_not_looked_at(self):
        fake = Fake(self, [pr(7, labels=())])
        self.assertEqual(self.sweep()[0], [])
        self.assertEqual([call[0] for call in fake.calls], ['pulls?state=open&per_page=100'])

    def test_no_evidence_keeps_the_preview(self):
        fake = Fake(self, [pr(7)])
        retired, out = self.sweep()
        self.assertEqual(retired, [])
        self.assertIn('no label event or run found; kept', out)
        self.assertEqual(fake.writes(), [])

    def test_dry_run_changes_nothing(self):
        fake = Fake(self, [pr(7)], events={7: [labeled('2026-10-01T10:00:00Z')]})
        retired, out = self.sweep(dry_run=True)
        self.assertEqual(retired, [7])
        self.assertIn('would retire', out)
        self.assertEqual(fake.writes(), [])

    def test_one_failure_does_not_stop_the_sweep(self):
        fake = Fake(self, [pr(7), pr(8)], events={7: [labeled('2026-10-01T10:00:00Z')],
                                                   8: [labeled('2026-10-01T10:00:00Z')]})
        original = fake.api

        def flaky(path, *args):
            if path == 'issues/7/comments':
                raise subprocess.CalledProcessError(1, 'gh')
            return original(path, *args)

        with patch.object(preview_label, 'api', side_effect=flaky):
            with contextlib.redirect_stdout(io.StringIO()) as out:
                with self.assertRaises(SystemExit) as raised:
                    preview_label.sweep(NOW)
        self.assertIn('[7]', str(raised.exception))
        self.assertIn('#7: failed', out.getvalue())
        self.assertEqual(fake.prs[7]['labels'], [{'name': 'bolt-preview'}])
        self.assertEqual(fake.prs[8]['labels'], [])

    def test_closed_pr_loses_its_label_once(self):
        fake = Fake(self, [pr(7, state='closed')])
        with contextlib.redirect_stdout(io.StringIO()):
            preview_label.closed(7)
            preview_label.closed(7)
        self.assertEqual(fake.prs[7]['labels'], [])
        self.assertEqual(len(fake.writes()), 1)

    def test_closed_ignores_a_reopened_pr(self):
        fake = Fake(self, [pr(7)])
        with contextlib.redirect_stdout(io.StringIO()):
            preview_label.closed(7)
        self.assertEqual(fake.writes(), [])

    def test_a_label_already_removed_is_not_an_error(self):
        fake = Fake(self, [pr(7)])
        fake.prs[7]['labels'] = []
        preview_label.remove_label(7)

    def test_a_failed_removal_that_left_the_label_raises(self):
        fake = Fake(self, [pr(7)])
        original = fake.api

        def failing(path, *args):
            if '-X' in args and path.endswith('/labels/bolt-preview'):
                raise subprocess.CalledProcessError(1, 'gh')
            return original(path, *args)

        with patch.object(preview_label, 'api', side_effect=failing):
            with self.assertRaises(subprocess.CalledProcessError):
                preview_label.remove_label(7)


if __name__ == '__main__':
    unittest.main()
