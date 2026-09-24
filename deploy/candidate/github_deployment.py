"""Report accepted Bolt previews to GitHub without granting PR code a token."""
import argparse
import json
import os
import re
import subprocess
from pathlib import Path


REPO = "mimukodik/mi-bolt"


def api(path, payload=None):
    command = ["gh", "api"]
    if payload is not None:
        command += ["-X", "POST", "--input", "-"]
    command.append(f"repos/{REPO}/{path}")
    return json.loads(subprocess.check_output(command, input=json.dumps(payload).encode() if payload is not None else None))


def deployments(pr_number):
    environment = f"preview-pr-{pr_number}"
    return api(f"deployments?environment={environment}&per_page=100")


def inactive(pr_number, except_id=None):
    for deployment in deployments(pr_number):
        if deployment["id"] == except_id or deployment["environment"] != f"preview-pr-{pr_number}":
            continue
        statuses = api(f"deployments/{deployment['id']}/statuses?per_page=1")
        if statuses and statuses[0]["state"] == "inactive":
            continue
        api(f"deployments/{deployment['id']}/statuses", {"state": "inactive", "description": "Bolt preview disabled or superseded"})


def inactive_if_disabled(pr_number):
    pr = api(f"pulls/{pr_number}")
    if pr["state"] == "open" and any(label["name"] == "bolt-preview" for label in pr["labels"]):
        print("Preview label is present again; leaving its deployment status unchanged")
        return
    inactive(pr_number)


def success(receipt):
    number, head = receipt["pr"], receipt["headSha"]
    if type(number) is not int or not 0 < number < 100000000 or not re.fullmatch(r"[a-f0-9]{40}", head):
        raise ValueError("invalid preview identity")
    pr = api(f"pulls/{number}")
    if pr["state"] != "open" or pr["head"]["sha"] != head or not any(label["name"] == "bolt-preview" for label in pr["labels"]):
        print("Preview was disabled or superseded before GitHub reporting")
        return
    environment = f"preview-pr-{number}"
    existing = next((item for item in deployments(number) if item["environment"] == environment and item["sha"] == head), None)
    deployment = existing or api("deployments", {"ref": head, "environment": environment,
        "description": f"Bolt PR #{number} accepted by browser smoke", "auto_merge": False,
        "required_contexts": [], "transient_environment": True})
    statuses = api(f"deployments/{deployment['id']}/statuses?per_page=1")
    if not statuses or statuses[0]["state"] != "success":
        api(f"deployments/{deployment['id']}/statuses", {"state": "success",
            "description": "Both checkout smoke flows passed",
            "environment_url": f"https://bolt-pr-{number}.mimukodik.hu",
            "log_url": f"https://github.com/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}"})
    inactive(number, except_id=deployment["id"])
    print(f"GitHub deployment {deployment['id']} reports {environment} at {head}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["success", "inactive"])
    parser.add_argument("value")
    args = parser.parse_args()
    if args.command == "success":
        success(json.loads(Path(args.value).read_text()))
    else:
        number = int(args.value)
        if not 0 < number < 100000000:
            raise ValueError("invalid PR number")
        inactive_if_disabled(number)
