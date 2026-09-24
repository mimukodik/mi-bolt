"""Verify the stable release through the public origin after Flux convergence."""
import argparse
import json
import os
from pathlib import Path
import time

from preview_smoke import api, download, fence

ORIGIN = 'https://bolt.mimukodik.hu'


def resolve():
    payload = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
    event = (api(f"actions/runs/{int(payload['inputs']['publisher_run_id'])}")
             if os.environ['GITHUB_EVENT_NAME'] == 'workflow_dispatch' else payload['workflow_run'])
    if (event['conclusion'] != 'success' or event['event'] != 'workflow_run'
            or event['path'] != '.github/workflows/publish-candidate.yml'
            or event['head_branch'] != 'main'
            or event['repository']['full_name'] != 'mimukodik/mi-bolt'):
        raise ValueError('unexpected publisher')
    artifacts = api(f"actions/runs/{event['id']}/artifacts")['artifacts']
    with Path(os.environ['GITHUB_OUTPUT']).open('a') as output:
        if not any(a['name'] == 'stable-release-receipt' and not a['expired'] for a in artifacts):
            output.write('ready=false\n')
            return
        receipt = download(event['id'], 'stable-release-receipt', 'candidate.json')
        if (receipt['pr'] != 0 or receipt['repo'] != 'mimukodik/mi-bolt'
                or receipt['publisherRunId'] != event['id']
                or receipt['publisherRevision'] != event['head_sha']):
            raise ValueError('stable receipt identity mismatch')
        Path('candidate.json').write_text(json.dumps(receipt))
        output.write('ready=true\n')


def wait(receipt):
    deadline = time.monotonic() + 20 * 60
    while time.monotonic() < deadline:
        try:
            fence(receipt, origin=ORIGIN)
            return
        except Exception:
            time.sleep(15)
    raise TimeoutError('stable release did not converge; inspect Flux')


def passed(receipt, report):
    stats = json.loads(report.read_text())['stats']
    if stats['expected'] < 2 or any(stats.get(k, 0) for k in ('unexpected', 'flaky', 'skipped')):
        raise ValueError('stable smoke must pass both flows without skips or retries')
    fence(receipt, origin=ORIGIN)
    Path('stable-smoke.json').write_text(json.dumps({
        'headSha': receipt['headSha'], 'publisherRunId': receipt['publisherRunId'],
        'chartDigest': receipt['chart']['digest'], 'result': 'passed', 'url': ORIGIN}))
    with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as output:
        output.write(f"Stable smoke passed: {ORIGIN}\n\nCommit: `{receipt['headSha']}`\n")


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
