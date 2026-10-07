"""Keep the bolt-preview label in step with the preview (MIM-487).

Run with:
  python3 deploy/candidate/preview_label.py closed <PR>
  python3 deploy/candidate/preview_label.py sweep [--dry-run]

The Berek coordinator deploys a preview exactly while an open pull request
carries the label and never retires one on its own, so the label is the only
switch. `closed` removes it from a closed pull request. `sweep` removes it from
every open pull request with no push and no fresh label for 48 hours, and
comments how to bring the preview back. The Preview Label workflow runs both
from the default branch; they need `gh` with pull request write access.
"""
import argparse
from datetime import datetime, timedelta, timezone
import json
import subprocess

REPO = 'mimukodik/mi-bolt'
LABEL = 'bolt-preview'
IDLE = timedelta(hours=48)
COMMENT = (f'Preview retired: no push and no fresh `{LABEL}` label for 48 hours. '
           f'Add the `{LABEL}` label again to bring it back on a fresh database. '
           'If it is not back about ten minutes after that, push a commit: the platform '
           'deploys only candidates published in roughly the last ten days.')


def api(path, *args):
    return json.loads(subprocess.check_output(
        ['gh', 'api', *args, f'repos/{REPO}/{path}']) or b'null')


def pages(path):
    # --paginate --slurp yields one JSON array of pages.
    return [item for page in api(path, '--paginate', '--slurp') for item in page]


def when(text):
    return datetime.fromisoformat(text.replace('Z', '+00:00'))


def labelled(pr):
    return any(label['name'] == LABEL for label in pr['labels'])


def remove_label(number):
    try:
        api(f'issues/{number}/labels/{LABEL}', '-X', 'DELETE')
    except subprocess.CalledProcessError:
        # Already gone (404) is the outcome we want; anything else shows on the next run.
        if labelled(api(f'pulls/{number}')):
            raise


def last_activity(pr):
    """The later of the label's last addition and the head's last push."""
    labels = [when(event['created_at']) for event in pages(f"issues/{pr['number']}/events?per_page=100")
              if event['event'] == 'labeled' and event.get('label', {}).get('name') == LABEL]
    runs = api(f"actions/workflows/candidate.yml/runs?event=pull_request"
               f"&head_sha={pr['head']['sha']}&per_page=100")['workflow_runs']
    # Every push (opened, synchronize, reopened) starts a Candidate Build run on
    # the head, re-runs keep their creation time, so the latest run dates the
    # last push, also a force-push back to an older head.
    pushed = [max(when(run['created_at']) for run in runs)] if runs else []
    return max(labels + pushed, default=None)


def sweep(now, dry_run=False):
    retired, failed = [], []
    for pr in pages('pulls?state=open&per_page=100'):
        if not labelled(pr):
            continue
        since = last_activity(pr)
        if since is None:
            print(f"#{pr['number']}: no label event or run found; kept")
            continue
        idle = now - since
        if idle < IDLE:
            print(f"#{pr['number']}: active {idle // timedelta(hours=1)} h ago; kept")
            continue
        print(f"#{pr['number']}: idle since {since:%Y-%m-%dT%H:%MZ}; "
              + ('would retire' if dry_run else 'retiring'))
        if not dry_run:
            try:
                # Comment first: a preview never retires without saying how to return.
                api(f"issues/{pr['number']}/comments", '-X', 'POST', '-f', f'body={COMMENT}')
                remove_label(pr['number'])
            except subprocess.CalledProcessError as error:
                print(f"#{pr['number']}: failed ({error}); the next sweep retries")
                failed.append(pr['number'])
                continue
        retired.append(pr['number'])
    if failed:
        raise SystemExit(f'could not retire {failed}')
    return retired


def closed(number):
    pr = api(f'pulls/{number}')
    if pr['state'] == 'open' or not labelled(pr):
        print(f'#{number}: nothing to do')
        return
    remove_label(number)
    print(f'#{number}: closed, {LABEL} removed')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n', 1)[0])
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('closed').add_argument('pr', type=int)
    commands.add_parser('sweep').add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if args.command == 'closed':
        closed(args.pr)
    else:
        sweep(datetime.now(timezone.utc), args.dry_run)


if __name__ == '__main__':
    main()
