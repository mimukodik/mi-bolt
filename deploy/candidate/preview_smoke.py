"""Trusted wrapper around the existing, unprivileged external browser smoke."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from urllib.request import Request, urlopen

REPO = 'mimukodik/mi-bolt'


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPO}/{path}']))


def download(run_id, artifact, filename):
    with tempfile.TemporaryDirectory() as directory:
        subprocess.run(['gh', 'run', 'download', str(run_id), '--repo', REPO,
                        '--name', artifact, '--dir', directory], check=True)
        return json.loads((Path(directory) / filename).read_text())


def scheduled_publisher():
    # Late admission (capacity/template/outage) must not strand a healthy preview
    # after its initial workflow_run wait timed out. Rotate among open PRs so a
    # failing smoke suite cannot starve another preview's acceptance.
    prs = api('pulls?state=open&per_page=100')
    runs = api('actions/workflows/publish-candidate.yml/runs?status=success&per_page=100')['workflow_runs']
    available = {}
    for run in runs:
        artifacts = api(f"actions/runs/{run['id']}/artifacts")['artifacts']
        if not any(a['name'] == 'candidate-receipt' and not a['expired'] for a in artifacts):
            continue
        receipt = download(run['id'], 'candidate-receipt', 'candidate.json')
        if receipt['pr'] in available or not any(p['number'] == receipt['pr'] and p['head']['sha'] == receipt['headSha']
                and any(label['name'] == 'bolt-preview' for label in p['labels']) for p in prs):
            continue
        try:
            fence(receipt)
        except Exception:
            continue
        available[receipt['pr']] = run
    if not available:
        return None
    keys = sorted(available)
    accepted = set()
    smoke_runs = api('actions/workflows/preview-smoke.yml/runs?status=success&per_page=100')['workflow_runs']
    for run in smoke_runs:
        if run['head_sha'] != os.environ['GITHUB_SHA']:
            continue
        artifacts = api(f"actions/runs/{run['id']}/artifacts")['artifacts']
        if any(a['name'] == 'preview-smoke-receipt' and not a['expired'] for a in artifacts):
            receipt = download(run['id'], 'preview-smoke-receipt', 'smoke.json')
            accepted.add(receipt['publisherRunId'])
    def accepted_now(key):
        run = available[key]
        if run['id'] not in accepted:
            return False
        receipt = download(run['id'], 'candidate-receipt', 'candidate.json')
        deployments = api(f'deployments?environment=preview-pr-{key}&per_page=100')
        matching = next((item for item in deployments if item['sha'] == receipt['headSha']), None)
        if matching is None:
            return False
        statuses = api(f"deployments/{matching['id']}/statuses?per_page=1")
        return bool(statuses and statuses[0]['state'] == 'success')

    remaining = [available[key] for key in keys if not accepted_now(key)]
    return remaining[int(time.time() // 600) % len(remaining)] if remaining else None


def resolve():
    payload = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    if os.environ['GITHUB_EVENT_NAME'] == 'schedule':
        event = scheduled_publisher()
    elif os.environ['GITHUB_EVENT_NAME'] == 'workflow_dispatch':
        event = api(f"actions/runs/{int(payload['inputs']['publisher_run_id'])}")
    else:
        event = payload['workflow_run']
    if event is None:
        with Path(os.environ['GITHUB_OUTPUT']).open('a') as output:
            output.write('ready=false\n')
        return
    if (event['conclusion'] != 'success' or event['event'] != 'workflow_run'
            or event['path'] != '.github/workflows/publish-candidate.yml'
            or event['head_branch'] != 'main' or event['repository']['full_name'] != REPO
            or not re.fullmatch(r'[a-f0-9]{40}', event['head_sha'])):
        raise ValueError('unexpected publisher')
    artifacts = api(f"actions/runs/{event['id']}/artifacts")['artifacts']
    matches = [a for a in artifacts if a['name'] == 'candidate-receipt' and not a['expired']]
    with Path(os.environ['GITHUB_OUTPUT']).open('a') as output:
        if not matches:
            output.write('ready=false\n')
            return
        if len(matches) != 1 or matches[0]['size_in_bytes'] > 1000000:
            raise ValueError('unexpected publisher artifact')
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(['gh', 'run', 'download', str(event['id']), '--repo', REPO,
                            '--name', 'candidate-receipt', '--dir', directory], check=True)
            receipt = json.loads((Path(directory) / 'candidate.json').read_text())
        if (receipt['repo'] != REPO or receipt['publisherRunId'] != event['id']
                or receipt['publisherRevision'] != event['head_sha']
                or not re.fullmatch(r'[a-f0-9]{40}', receipt['headSha'])
                or type(receipt['pr']) is not int or not 0 < receipt['pr'] < 100000000):
            raise ValueError('candidate receipt identity mismatch')
        pr = api(f"pulls/{receipt['pr']}")
        if (pr['state'] != 'open' or pr['head']['sha'] != receipt['headSha']
                or not any(label['name'] == 'bolt-preview' for label in pr['labels'])):
            output.write('ready=false\n')
            return
        Path('candidate.json').write_text(json.dumps(receipt))
        output.write(f"ready=true\nhead={receipt['headSha']}\npr={receipt['pr']}\n")


def fence(receipt):
    origin = f"https://bolt-pr-{receipt['pr']}.mimukodik.hu"
    # Cache busting plus no-cache response prevents an edge cache from accepting
    # a receipt from a previous generation sharing the PR hostname.
    headers = {'User-Agent': 'Mozilla/5.0 (compatible; MiBoltPreviewSmoke/1.0)',
               'Accept': 'application/json'}
    request = Request(origin + '/__candidate.json?t=' + str(time.time_ns()), headers=headers)
    with urlopen(request, timeout=15) as response:
        observed = json.load(response)
    expected = {'candidateId': receipt['candidateId'], 'headSha': receipt['headSha'],
                'publisherRunId': receipt['publisherRunId'],
                'images': {c: receipt['images'][c]['digest'] for c in ('web', 'commerce')}}
    if observed != expected:
        raise ValueError('preview is not the requested candidate')
    request = Request(origin + '/api/v1/actuator/health/readiness', headers=headers)
    with urlopen(request, timeout=15) as response:
        if json.load(response)['status'] != 'UP':
            raise ValueError('backend not ready')
    return origin


def wait(receipt):
    deadline = time.monotonic() + 30 * 60
    while time.monotonic() < deadline:
        pr = api(f"pulls/{receipt['pr']}")
        if pr['state'] != 'open' or pr['head']['sha'] != receipt['headSha']:
            raise ValueError('PR closed or candidate superseded')
        try:
            fence(receipt)
            return
        except Exception:
            time.sleep(15)
    raise TimeoutError('preview not available: inspect admission, template and Flux state')


def passed(receipt, report):
    stats = json.loads(report.read_text())['stats']
    if stats['expected'] < 2 or any(stats.get(k, 0) for k in ('unexpected', 'flaky', 'skipped')):
        raise ValueError('smoke must pass both flows without skips or retries')
    pr = api(f"pulls/{receipt['pr']}")
    if pr['state'] != 'open' or pr['head']['sha'] != receipt['headSha']:
        raise ValueError('PR changed while smoke was running')
    origin = fence(receipt)
    Path('smoke.json').write_text(json.dumps({'headSha': receipt['headSha'],
        'publisherRunId': receipt['publisherRunId'], 'chartDigest': receipt['chart']['digest'],
        'result': 'passed', 'url': origin}))
    with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as output:
        output.write(f"Preview smoke passed: {origin}\n\nCommit: `{receipt['headSha']}`\n\n"
                     f"Chart: `{receipt['chart']['digest']}`\n")


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['resolve', 'wait', 'passed'])
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.command == 'resolve':
        resolve()
    elif args.command == 'wait':
        wait(json.loads(Path('candidate.json').read_text()))
    else:
        passed(json.loads(Path('candidate.json').read_text()), args.report)
