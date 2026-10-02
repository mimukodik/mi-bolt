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
    available = {}
    for run, receipt in published_candidates(prs):
        if receipt['pr'] in available:
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


def publisher_receipt(event):
    if event is None:
        return None
    if (event['conclusion'] != 'success' or event['event'] != 'workflow_run'
            or event['path'] != '.github/workflows/publish-candidate.yml'
            or event['head_branch'] != 'main' or event['repository']['full_name'] != REPO
            or not re.fullmatch(r'[a-f0-9]{40}', event['head_sha'])):
        raise ValueError('unexpected publisher')
    artifacts = api(f"actions/runs/{event['id']}/artifacts")['artifacts']
    matches = [a for a in artifacts if a['name'] == 'candidate-receipt' and not a['expired']]
    if not matches:
        return None
    if len(matches) != 1 or matches[0]['size_in_bytes'] > 1000000:
        raise ValueError('unexpected publisher artifact')
    receipt = download(event['id'], 'candidate-receipt', 'candidate.json')
    if (receipt['repo'] != REPO or receipt['publisherRunId'] != event['id']
            or receipt['publisherRevision'] != event['head_sha']
            or not re.fullmatch(r'[a-f0-9]{40}', receipt['headSha'])
            or type(receipt['pr']) is not int or not 0 < receipt['pr'] < 100000000):
        raise ValueError('candidate receipt identity mismatch')
    return receipt


def published_candidates(prs):
    # Publisher runs have main's SHA, not the PR head. Both daily recovery
    # and label admission select PR heads from the same trusted receipts.
    page = 1
    while True:
        runs = api('actions/workflows/publish-candidate.yml/runs?'
                   f'status=success&per_page=100&page={page}')['workflow_runs']
        for run in runs:
            receipt = publisher_receipt(run)
            if receipt and any(p['number'] == receipt['pr'] and p['state'] == 'open'
                    and p['head']['sha'] == receipt['headSha']
                    and any(label['name'] == 'bolt-preview' for label in p['labels']) for p in prs):
                yield run, receipt
        if len(runs) < 100:
            return
        page += 1


def labeled_receipt(payload):
    if payload['action'] != 'labeled' or payload['label']['name'] != 'bolt-preview':
        return None
    event_pr = payload['pull_request']
    if event_pr['head']['repo']['full_name'] != REPO:
        return None
    pr = api(f"pulls/{int(event_pr['number'])}")
    if (pr['state'] != 'open' or pr['head']['sha'] != event_pr['head']['sha']
            or not any(label['name'] == 'bolt-preview' for label in pr['labels'])):
        return None
    match = next(published_candidates([pr]), None)
    return match[1] if match else None


def dispatch():
    payload = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    receipt = labeled_receipt(payload)
    if receipt is None:
        print('No current published candidate; publisher completion will trigger smoke.')
        return
    pr = api(f"pulls/{receipt['pr']}")
    if (pr['state'] != 'open' or pr['head']['sha'] != receipt['headSha']
            or not any(label['name'] == 'bolt-preview' for label in pr['labels'])):
        print('Preview disabled or head superseded before dispatch.')
        return
    subprocess.run(['gh', 'workflow', 'run', 'preview-smoke.yml', '--repo', REPO,
                    '--ref', 'main', '-f', f"publisher_run_id={receipt['publisherRunId']}"], check=True)


def resolve():
    payload = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    if os.environ['GITHUB_EVENT_NAME'] == 'schedule':
        event = scheduled_publisher()
    elif os.environ['GITHUB_EVENT_NAME'] == 'workflow_dispatch':
        event = api(f"actions/runs/{int(payload['inputs']['publisher_run_id'])}")
    else:
        event = payload['workflow_run']
    receipt = publisher_receipt(event)
    with Path(os.environ['GITHUB_OUTPUT']).open('a') as output:
        if receipt is None:
            output.write('ready=false\n')
            return
        pr = api(f"pulls/{receipt['pr']}")
        if (pr['state'] != 'open' or pr['head']['sha'] != receipt['headSha']
                or not any(label['name'] == 'bolt-preview' for label in pr['labels'])):
            output.write('ready=false\n')
            return
        Path('candidate.json').write_text(json.dumps(receipt))
        output.write(f"ready=true\nhead={receipt['headSha']}\npr={receipt['pr']}\n")


def fence(receipt, origin=None):
    origin = origin or f"https://bolt-pr-{receipt['pr']}.mimukodik.hu"
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
    parser.add_argument('command', choices=['resolve', 'wait', 'passed', 'dispatch'])
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    if args.command == 'dispatch':
        dispatch()
    elif args.command == 'resolve':
        resolve()
    elif args.command == 'wait':
        wait(json.loads(Path('candidate.json').read_text()))
    else:
        passed(json.loads(Path('candidate.json').read_text()), args.report)
