"""Wait until a labelled pull request's preview serves the pull request's head.

Run with: python3 deploy/candidate/preview_wait.py <PR> [--timeout-minutes 45]

A preview goes through CI and Candidate Build on the head, Publish Candidate on
main, then the Berek coordinator, which polls every 2 minutes and reports
nothing back to GitHub. This follows the GitHub half through `gh` and the
platform half through the public fence, and prints one line per state change.
A new push is followed. Exit codes: 0 when https://bolt-pr-<N>.mimukodik.hu
serves the head, 1 when the head's CI or Candidate Build failed, 2 when the
pull request is closed, from a fork or not labelled, 3 on timeout, 4 when
GitHub cannot be read.
"""
import argparse
from datetime import datetime, timezone
from http.client import HTTPException
import json
import subprocess
import sys
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen

REPO = 'mimukodik/mi-bolt'
LABEL = 'bolt-preview'
# Berek apps/bolt-preview-coordinator/config.json, "capacity".
CAPACITY = 8
WORKFLOWS = {'ci.yml': 'CI', 'candidate.yml': 'Candidate Build'}
# Cloudflare refuses Python's default user agent on mimukodik.hu hosts.
HEADERS = {'User-Agent': 'Mozilla/5.0 (compatible; MiBoltPreviewWait/1.0)',
           'Accept': 'application/json'}
# Consecutive failed GitHub reads (about two minutes of polls) before giving up.
GITHUB_ATTEMPTS = 6


class Stop(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


class GitHubError(Exception):
    pass


def api(path):
    try:
        result = subprocess.run(['gh', 'api', f'repos/{REPO}/{path}'],
                                capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        raise Stop(4, 'gh is not installed; it reads the PR and its runs') from None
    except subprocess.TimeoutExpired:
        raise GitHubError(f'gh api {path}: no answer in 60 s') from None
    if result.returncode != 0:
        raise GitHubError(f"gh api {path}: {result.stderr.strip() or result.returncode}")
    return json.loads(result.stdout)


def fetch(url):
    # Cache busting keeps an edge cache from answering for an older generation.
    request = Request(f'{url}?t={time.time_ns()}', headers=HEADERS)
    with urlopen(request, timeout=15) as response:
        return json.load(response)


def say(message):
    print(f"{datetime.now(timezone.utc):%H:%M:%SZ} {message}", flush=True)


def origin(number):
    return f'https://bolt-pr-{number}.mimukodik.hu'


def labelled(pr):
    return any(label['name'] == LABEL for label in pr['labels'])


def eligible_head(pr):
    number = pr['number']
    if pr['state'] != 'open':
        raise Stop(2, f"PR #{number} is {'merged' if pr.get('merged_at') else 'closed'}; "
                      'only open PRs have a preview')
    if (pr['head'].get('repo') or {}).get('full_name') != REPO:
        raise Stop(2, f'PR #{number} comes from a fork; forks get no automatic preview')
    if not labelled(pr):
        raise Stop(2, f'PR #{number} has no {LABEL} label, so no preview is deployed. '
                      f'Add it: gh pr edit {number} -R {REPO} --add-label {LABEL}')
    return pr['head']['sha']


def ci_state(head):
    """Return (green, detail) for the head's latest CI and Candidate Build runs."""
    latest = {}
    for workflow, name in WORKFLOWS.items():
        runs = [run for run in api(f'actions/workflows/{workflow}/runs?event=pull_request'
                                   f'&head_sha={head}&per_page=100')['workflow_runs']
                if run['head_sha'] == head]
        if not runs:
            return False, f'waiting for {name} to start on {head[:12]}'
        latest[name] = max(runs, key=lambda run: run['id'])
    for name, run in latest.items():
        if run['status'] == 'completed' and run['conclusion'] != 'success':
            jobs = api(f"actions/runs/{run['id']}/jobs?filter=latest&per_page=100")['jobs']
            failed = [job['name'] for job in jobs
                      if job['conclusion'] not in ('success', 'skipped', None)]
            raise Stop(1, f"{name} {run['conclusion']} on {head[:12]}: {run['html_url']}"
                          + (f" (failed jobs: {', '.join(failed)})" if failed else '')
                          + '. No preview is published for this head; fix it and push.')
    running = [f"{name} {run['status']}" for name, run in latest.items()
               if run['status'] != 'completed']
    if running:
        return False, ', '.join(running)
    jobs = api(f"actions/runs/{latest['CI']['id']}/jobs?filter=latest&per_page=100")['jobs']
    if not any(job['name'] == 'ci-ok' and job['conclusion'] == 'success' for job in jobs):
        raise Stop(1, f"CI run {latest['CI']['html_url']} has no successful ci-ok job, "
                      'which Publish Candidate requires')
    return True, (f"CI and Candidate Build green on {head[:12]}; waiting for Publish "
                  'Candidate and the Berek coordinator')


def preview_state(number, head):
    """Return (ready, detail) from the public fence, the check Stable Smoke uses."""
    base = origin(number)
    try:
        served = fetch(base + '/__candidate.json')
        served_head = served.get('headSha')
    except HTTPError as error:
        return False, f'{base} answers {error.code}, not deployed yet'
    except (OSError, HTTPException, ValueError, AttributeError) as error:
        return False, f'{base} not reachable yet ({getattr(error, "reason", error)})'
    if served_head != head:
        return False, f'{base} still serves {str(served_head)[:12]}'
    try:
        ready = fetch(base + '/api/v1/actuator/health/readiness').get('status') == 'UP'
        release = fetch(base + '/api/v1/actuator/info').get('release') or {}
    except (OSError, HTTPException, ValueError, AttributeError):
        ready, release = False, {}
    # Commerce rolls, so the previous generation's pod can answer until the new one is ready.
    if not ready or release.get('publisherRunId') != str(served.get('publisherRunId')):
        return False, f'{base} web serves {head[:12]}, commerce is still starting'
    return True, f"{base} serves {head[:12]} (publisher run {served['publisherRunId']})"


def timeout_causes(number, green):
    if not green:
        return 'CI did not finish in time.'
    causes = []
    try:
        others = [f"#{pr['number']}" for pr in api('pulls?state=open&per_page=100')
                  if labelled(pr) and pr['number'] != number]
        if len(others) >= CAPACITY:
            causes.append(f"all {CAPACITY} preview slots are taken ({', '.join(others)} also "
                          'carry the label); removing it from a finished PR frees one')
        runs = api('actions/workflows/publish-candidate.yml/runs?per_page=1')['workflow_runs']
        if runs and runs[0]['status'] == 'completed' and runs[0]['conclusion'] != 'success':
            causes.append(f"Publish Candidate failed: {runs[0]['html_url']}")
    except GitHubError:
        pass
    found = ('Likely cause: ' + '; '.join(causes) + '. ') if causes else ''
    return (found + 'The Berek coordinator log says why a labelled PR waits; ask a '
            'developer with cluster access.')


def wait(number, timeout_minutes, interval=20):
    deadline = time.monotonic() + timeout_minutes * 60
    head = green = last = None
    failures = 0
    while True:
        try:
            detail = poll(number, head, green)
            failures = 0
        except GitHubError as error:
            failures += 1
            if failures >= GITHUB_ATTEMPTS:
                raise Stop(4, f'GitHub could not be read {failures} times in a row: {error}')
            detail = last
        else:
            if isinstance(detail, tuple):
                kind, value = detail
                if kind == 'ready':
                    say(f'ready: {value}')
                    print(origin(number), flush=True)
                    return
                if kind == 'head':
                    if head is None:
                        say(f'PR #{number} head {value[:12]}, labelled {LABEL}')
                    else:
                        say(f'head moved to {value[:12]}; following it')
                    head, green, last = value, None, None
                    detail = None
                if kind == 'green':
                    green = head
                    say(value)
                    detail = None
        if detail and detail != last:
            say(detail)
            last = detail
        if time.monotonic() >= deadline:
            raise Stop(3, f'timed out after {timeout_minutes} min; last state: {last}. '
                          + timeout_causes(number, head is not None and green == head))
        time.sleep(interval)


def poll(number, head, green):
    """One look at the PR, its runs and its host: a state line or an event tuple."""
    current = eligible_head(api(f'pulls/{number}'))
    if current != head:
        return 'head', current
    if green != head:
        try:
            ok, detail = ci_state(head)
        except Stop:
            # A push cancels the old head's runs; that is not a failure.
            if eligible_head(api(f'pulls/{number}')) != head:
                return None
            raise
        if ok:
            return 'green', detail
        return detail
    ok, detail = preview_state(number, head)
    return ('ready', detail) if ok else detail


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n', 1)[0])
    parser.add_argument('pr', type=int)
    parser.add_argument('--timeout-minutes', type=int, default=45)
    args = parser.parse_args()
    try:
        wait(args.pr, args.timeout_minutes)
    except Stop as stop:
        print(f'preview_wait: {stop}', file=sys.stderr, flush=True)
        sys.exit(stop.code)


if __name__ == '__main__':
    main()
