"""Show a labelled pull request's Bolt preview as a GitHub deployment on the PR.

Run with: python3 deploy/candidate/github_deployment.py report <PR> [--timeout-minutes 45]
      or: python3 deploy/candidate/github_deployment.py inactive <PR>

The Berek coordinator deploys the preview with a read-only GitHub token, so the
PR learns nothing from it. `report` creates the `preview-pr-<N>` deployment for
the PR head as in progress, waits with preview_wait, then sets it to success
with the preview URL, or to failure or error with the reason. It marks the
deployments of older heads inactive. `inactive` marks a closed or unlabelled
PR's deployments inactive. The Preview Deployment workflow runs both from the
default branch; nothing here reads PR code.
"""
import argparse
import contextlib
import json
import os
import signal
import subprocess
import sys
import time

import preview_wait

REPO = preview_wait.REPO
# GitHub refuses a deployment status description longer than this.
DESCRIPTION_LIMIT = 140
# A poll reads GitHub up to three times while CI runs. preview_wait's own 20 s
# would let a few waiting PRs spend the repository's GITHUB_TOKEN budget
# (1,000 requests an hour on this plan), which Publish Candidate shares.
POLL_SECONDS = 60
STOP_STATES = {1: 'failure', 3: 'error', 4: 'error'}
API_ATTEMPTS = 3


def api(path, payload=None, attempts=API_ATTEMPTS):
    command = ['gh', 'api', f'repos/{REPO}/{path}']
    if payload is not None:
        command += ['-X', 'POST', '--input', '-']
    for attempt in range(1, attempts + 1):
        try:
            return json.loads(subprocess.check_output(
                command, input=None if payload is None else json.dumps(payload),
                text=True, timeout=60))
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            if attempt == attempts:
                raise
            time.sleep(5 * attempt)


def environment(number):
    return f'preview-pr-{number}'


def deployments(number):
    return [item for item in api(f'deployments?environment={environment(number)}&per_page=100')
            if item['environment'] == environment(number)]


def set_status(deployment_id, state, description, attempts=API_ATTEMPTS, **fields):
    payload = {'state': state, 'description': description[:DESCRIPTION_LIMIT], **fields}
    if os.environ.get('GITHUB_RUN_ID'):
        payload['log_url'] = f"https://github.com/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    api(f'deployments/{deployment_id}/statuses', payload, attempts=attempts)


def retire(number, keep=None, reason='Bolt preview disabled'):
    for item in deployments(number):
        if item['id'] == keep:
            continue
        statuses = api(f"deployments/{item['id']}/statuses?per_page=1")
        if not statuses or statuses[0]['state'] != 'inactive':
            set_status(item['id'], 'inactive', reason)


def head_deployment(number, head):
    deployment = next((item for item in deployments(number) if item['sha'] == head), None)
    if deployment is None:
        deployment = api('deployments', {
            'ref': head, 'environment': environment(number), 'auto_merge': False,
            'required_contexts': [], 'transient_environment': True,
            'production_environment': False, 'description': f'Bolt preview of PR #{number}'})
    return deployment['id']


def report(number, timeout_minutes):
    head = preview_wait.eligible_head(api(f'pulls/{number}'))
    deployment = head_deployment(number, head)
    try:
        return follow(number, head, deployment, timeout_minutes)
    except BaseException as error:
        # Never leave the PR showing in progress: a cancelled run is no longer
        # reporting, and any other failure is an error. The failure stays loud.
        # One attempt: a cancel's SIGTERM follows its SIGINT within 7.5 s.
        cancelled = isinstance(error, (KeyboardInterrupt, SystemExit))
        with contextlib.suppress(Exception):
            set_status(deployment, 'inactive' if cancelled else 'error',
                       'Reporting cancelled' if cancelled else f'Preview reporting failed: {error}',
                       attempts=1)
        raise


def follow(number, head, deployment, timeout_minutes):
    set_status(deployment, 'in_progress', 'Waiting for CI, Publish Candidate and the Berek coordinator')
    retire(number, keep=deployment, reason='Superseded by a newer head')
    try:
        preview_wait.wait(number, timeout_minutes, interval=POLL_SECONDS)
    except preview_wait.Stop as stop:
        print(f'github_deployment: {stop}', file=sys.stderr, flush=True)
        if stop.code == 2:
            set_status(deployment, 'inactive', 'Bolt preview disabled')
            return 0
        set_status(deployment, STOP_STATES[stop.code], str(stop))
        # The head's red CI is already the PR's signal; this run reported it.
        return 0 if stop.code == 1 else stop.code
    # preview_wait follows a push; the push's own run reports that head.
    pr = api(f'pulls/{number}')
    if pr['state'] != 'open' or pr['head']['sha'] != head or not preview_wait.labelled(pr):
        set_status(deployment, 'inactive', 'Bolt preview disabled or superseded')
        return 0
    url = preview_wait.origin(number)
    set_status(deployment, 'success', f'{url} serves {head[:12]}', environment_url=url)
    print(f'GitHub deployment {deployment} reports {environment(number)} at {head}')
    return 0


def inactive(number):
    pr = api(f'pulls/{number}')
    if pr['state'] == 'open' and preview_wait.labelled(pr):
        print(f'The {preview_wait.LABEL} label is on the PR again; its deployment stays')
        return 0
    retire(number)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n', 1)[0])
    parser.add_argument('command', choices=['report', 'inactive'])
    parser.add_argument('pr', type=int)
    parser.add_argument('--timeout-minutes', type=int, default=45)
    args = parser.parse_args()
    if not 0 < args.pr < 100000000:
        parser.error('invalid PR number')
    # A cancelled run gets SIGINT, then SIGTERM; both must reach report's cleanup,
    # even where the parent started this process with SIGINT ignored.
    signal.signal(signal.SIGINT, signal.default_int_handler)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(128 + signal.SIGTERM))
    try:
        code = report(args.pr, args.timeout_minutes) if args.command == 'report' else inactive(args.pr)
    except preview_wait.Stop as stop:
        # Code 2 before anything was reported: no open, labelled, same-repository PR.
        print(f'github_deployment: {stop}', file=sys.stderr, flush=True)
        code = 0 if stop.code == 2 else stop.code
    sys.exit(code)


if __name__ == '__main__':
    main()
